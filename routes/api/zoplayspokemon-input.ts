import type { Context } from "hono";

const ZOP_GLOBAL_ROOM = "main";

type InputEvent = {
  action: string;
  button: string;
  user: string;
  timestamp: number;
};

type ShareState = {
  events: InputEvent[];
  frameHash: string;
  frameVersion: number;
  heldButtons: string[];
  inputVersion: number;
  lastFrameAt: number;
  lastInputAt: number;
  queueDepth: number;
  updatedAt: number;
};

type UpstreamInputResponse = {
  acceptedInputVersion?: number;
  frameHash?: string;
  heldButtons?: unknown;
  lastFrameAt?: number;
  lastInputAt?: number;
  presentedFrameVersion?: number;
  queueDepth?: number;
};

const BUCKET_GLOBAL = "__zoplayspokemon_input_limit";
type TimestampBucket = { times: number[] };
type LimitCheckReason =
  | "rate_limit_ip"
  | "rate_limit_room"
  | "rate_limit_room_user"
  | "cooldown_room_user";
type LimitCheckResult = { ok: true } | { ok: false; reason: LimitCheckReason; retryAfterMs: number };
const WINDOW_MS = 60_000;
const MAX_PER_IP = 45;
const MAX_PER_ROOM = 200;
const MAX_PER_ROOM_USER = 30;
const MIN_TAP_PRESS_GAP_MS = 140;
const MAX_MAP_KEYS = 10_000;

function getBuckets(): Map<string, TimestampBucket> {
  const g = globalThis as typeof globalThis & { [BUCKET_GLOBAL]?: Map<string, TimestampBucket> };
  if (!g[BUCKET_GLOBAL]) {
    g[BUCKET_GLOBAL] = new Map();
  }
  return g[BUCKET_GLOBAL]!;
}

function prune(times: number[], now: number, windowMs: number): number[] {
  const cutoff = now - windowMs;
  let start = 0;
  while (start < times.length && times[start]! < cutoff) {
    start++;
  }
  return start === 0 ? times : times.slice(start);
}

function evictBucketsIfHuge(map: Map<string, TimestampBucket>): void {
  if (map.size <= MAX_MAP_KEYS) return;
  const keys = [...map.keys()];
  keys.sort();
  const drop = Math.max(0, keys.length - Math.floor(MAX_MAP_KEYS * 0.7));
  for (let i = 0; i < drop; i++) {
    map.delete(keys[i]!);
  }
}

function pruneBucket(key: string, now: number, windowMs: number): TimestampBucket {
  const map = getBuckets();
  let bucket = map.get(key);
  if (!bucket) {
    bucket = { times: [] };
    map.set(key, bucket);
  }
  bucket.times = prune(bucket.times, now, windowMs);
  return bucket;
}

function tooManyInWindow(
  bucket: TimestampBucket,
  now: number,
  windowMs: number,
  maxHits: number,
  reason: LimitCheckReason,
): LimitCheckResult {
  if (bucket.times.length < maxHits) {
    return { ok: true };
  }
  const oldest = bucket.times[0] ?? now;
  const retryAfterMs = Math.max(0, windowMs - (now - oldest) + 1);
  return { ok: false, reason, retryAfterMs };
}

function pushTime(bucket: TimestampBucket, now: number): void {
  bucket.times.push(now);
}

function checkInputLimits(params: {
  ip: string;
  room: string;
  user: string;
  action: string;
  now?: number;
}): LimitCheckResult {
  const now = params.now ?? Date.now();
  const ipKey = `ip:${params.ip}`;
  const roomKey = `room:${params.room}`;
  const userKey = `u:${params.room}:${params.user}`;
  const gapKey = `gap:${params.room}:${params.user}`;

  if (params.action !== "release") {
    const gapBucket = pruneBucket(gapKey, now, MIN_TAP_PRESS_GAP_MS + 250);
    const last = gapBucket.times[gapBucket.times.length - 1];
    if (last !== undefined && now - last < MIN_TAP_PRESS_GAP_MS) {
      return {
        ok: false,
        reason: "cooldown_room_user",
        retryAfterMs: Math.ceil(MIN_TAP_PRESS_GAP_MS - (now - last)),
      };
    }
  }

  const ipBucket = pruneBucket(ipKey, now, WINDOW_MS);
  const roomBucket = pruneBucket(roomKey, now, WINDOW_MS);
  const userBucket = pruneBucket(userKey, now, WINDOW_MS);

  const ipLim = tooManyInWindow(ipBucket, now, WINDOW_MS, MAX_PER_IP, "rate_limit_ip");
  if (!ipLim.ok) return ipLim;

  const roomLim = tooManyInWindow(roomBucket, now, WINDOW_MS, MAX_PER_ROOM, "rate_limit_room");
  if (!roomLim.ok) return roomLim;

  const userLim = tooManyInWindow(userBucket, now, WINDOW_MS, MAX_PER_ROOM_USER, "rate_limit_room_user");
  if (!userLim.ok) return userLim;

  pushTime(ipBucket, now);
  pushTime(roomBucket, now);
  pushTime(userBucket, now);

  if (params.action !== "release") {
    const gapBucketForWrite = pruneBucket(gapKey, now, MIN_TAP_PRESS_GAP_MS + 250);
    pushTime(gapBucketForWrite, now);
  }

  evictBucketsIfHuge(getBuckets());
  return { ok: true };
}

function undoInputLimitCommit(params: { ip: string; room: string; user: string; action: string; ts: number }): void {
  const map = getBuckets();
  const popIfMatchEnd = (key: string): void => {
    const bucket = map.get(key);
    if (!bucket?.times.length) return;
    const last = bucket.times[bucket.times.length - 1];
    if (last === params.ts) {
      bucket.times.pop();
    }
  };
  popIfMatchEnd(`ip:${params.ip}`);
  popIfMatchEnd(`room:${params.room}`);
  popIfMatchEnd(`u:${params.room}:${params.user}`);
  if (params.action !== "release") {
    popIfMatchEnd(`gap:${params.room}:${params.user}`);
  }
}

function extractClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  const cf = c.req.header("cf-connecting-ip");
  if (cf) {
    const trimmed = cf.trim();
    if (trimmed) return trimmed.slice(0, 64);
  }
  const xff = c.req.header("x-forwarded-for") || c.req.header("x-real-ip");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  return "unknown";
}

const SERVICE_URL = "https://zo-gameboy-etok.zocomputer.io";
const KEY = "__zoplayspokemon_state";
const MAX_EVENTS = 80;
const ALLOWED = new Set(["0", "1", "2", "3", "4", "5", "6", "7"]);
const ACTIONS = new Set(["tap", "press", "release"]);
/** Reject new inputs when the mirrored queue is this deep (protects overloaded rooms). */
const MAX_ACCEPTED_QUEUE_DEPTH = 42;

function getState(room: string): ShareState {
  const g = globalThis as typeof globalThis & { [KEY]?: Record<string, ShareState> };
  if (!g[KEY]) {
    g[KEY] = {};
  }
  if (!g[KEY]![room]) {
    g[KEY]![room] = {
      events: [],
      frameHash: "",
      frameVersion: 0,
      heldButtons: [],
      inputVersion: 0,
      lastFrameAt: 0,
      lastInputAt: 0,
      queueDepth: 0,
      updatedAt: Date.now(),
    };
  }
  return g[KEY]![room]!;
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readButtons(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((button): button is string => typeof button === "string") : fallback;
}

export default async (c: Context) => {
  try {
    const body = await c.req.json<{ action?: string; button?: string; user?: string; room?: string }>();
    const button = String(body.button || "");
    const action = String(body.action || "tap").toLowerCase();
    const user = String(body.user || "anon").slice(0, 24);
    const room = ZOP_GLOBAL_ROOM;

    if (!ALLOWED.has(button)) {
      return c.json({ error: "Invalid button" }, 400);
    }
    if (!ACTIONS.has(action)) {
      return c.json({ error: "Invalid action" }, 400);
    }

    const state = getState(room);
    if (state.queueDepth >= MAX_ACCEPTED_QUEUE_DEPTH) {
      return c.json(
        {
          error: "Input queue is full; try again in a moment",
          code: "queue_full",
          queueDepth: state.queueDepth,
        },
        429,
      );
    }

    const clientIp = extractClientIp(c);
    const committedAtMs = Date.now();
    const limits = checkInputLimits({
      ip: clientIp,
      room,
      user,
      action,
      now: committedAtMs,
    });
    if (!limits.ok) {
      const retrySec = Math.max(1, Math.ceil(limits.retryAfterMs / 1000));
      c.header("Retry-After", String(retrySec));
      return c.json(
        {
          error: "Too many inputs; slow down briefly",
          code: limits.reason,
          retryAfterMs: limits.retryAfterMs,
        },
        429,
      );
    }

    const upstream = await fetch(`${SERVICE_URL}/input`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ room, button, action }),
    });

    if (!upstream.ok) {
      undoInputLimitCommit({ ip: clientIp, room, user, action, ts: committedAtMs });
      const detail = await upstream.text().catch(() => "");
      return c.json({ error: "Local emulator input failed", status: upstream.status, detail }, 502);
    }

    const upstreamData = (await upstream.json().catch(() => null)) as UpstreamInputResponse | null;
    const timestamp = Date.now();
    const event: InputEvent = { button, action, user, timestamp };

    state.events.push(event);
    if (state.events.length > MAX_EVENTS) state.events.shift();

    const nextInputVersion = readNumber(upstreamData?.acceptedInputVersion, state.inputVersion + 1);
    const nextFrameVersion = readNumber(upstreamData?.presentedFrameVersion, state.frameVersion);
    const nextFrameHash = typeof upstreamData?.frameHash === "string" ? upstreamData.frameHash : state.frameHash;
    const nextLastInputAt = readNumber(upstreamData?.lastInputAt, timestamp);
    const nextLastFrameAt = readNumber(upstreamData?.lastFrameAt, state.lastFrameAt);

    state.frameHash = nextFrameHash;
    state.inputVersion = Math.max(state.inputVersion, nextInputVersion);
    state.frameVersion = Math.max(state.frameVersion, nextFrameVersion);
    state.lastInputAt = Math.max(state.lastInputAt, nextLastInputAt);
    state.lastFrameAt = Math.max(state.lastFrameAt, nextLastFrameAt);
    state.queueDepth = readNumber(upstreamData?.queueDepth, state.queueDepth);
    state.heldButtons = readButtons(upstreamData?.heldButtons, state.heldButtons);
    state.updatedAt = Math.max(timestamp, state.lastInputAt, state.lastFrameAt);

    return c.json({
      ok: true,
      room,
      event,
      inputVersion: state.inputVersion,
      frameVersion: state.frameVersion,
      frameHash: state.frameHash,
      queueDepth: state.queueDepth,
      heldButtons: state.heldButtons,
      updatedAt: state.updatedAt,
    });
  } catch {
    return c.json({ error: "Bad request" }, 400);
  }
};
