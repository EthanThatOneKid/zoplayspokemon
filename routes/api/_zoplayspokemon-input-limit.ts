const BUCKET_GLOBAL = "__zoplayspokemon_input_limit";

type TimestampBucket = {
  times: number[];
};

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

export type LimitCheckReason =
  | "rate_limit_ip"
  | "rate_limit_room"
  | "rate_limit_room_user"
  | "cooldown_room_user";

export type LimitCheckResult =
  | { ok: true }
  | { ok: false; reason: LimitCheckReason; retryAfterMs: number };

const WINDOW_MS = 60_000;
const MAX_PER_IP = 45;
const MAX_PER_ROOM = 200;
const MAX_PER_ROOM_USER = 30;
const MIN_TAP_PRESS_GAP_MS = 140;
const MAX_MAP_KEYS = 10_000;

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

export function checkInputLimits(params: {
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

/** Undo a successful `checkInputLimits` commit when the upstream emulator call fails afterward. */
export function undoInputLimitCommit(params: {
  ip: string;
  room: string;
  user: string;
  action: string;
  ts: number;
}): void {
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

export function extractClientIp(c: { req: { header: (name: string) => string | undefined } }): string {
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
