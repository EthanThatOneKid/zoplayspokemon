import type { Context } from "hono";

type InputEvent = {
  action?: string;
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

type RoomInfo = {
  acceptedInputVersion?: number;
  frameHash?: string;
  heldButtons?: unknown;
  lastFrameAt?: number;
  lastInputAt?: number;
  presentedFrameVersion?: number;
  queueDepth?: number;
};

const SERVICE_URL = "https://zo-gameboy-etok.zocomputer.io";
const KEY = "__zoplayspokemon_state";
const LONG_POLL_INTERVAL_MS = 250;
const LONG_POLL_TIMEOUT_MS = 20_000;

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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function clampTimeout(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(LONG_POLL_TIMEOUT_MS, Math.floor(parsed)));
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readButtons(value: unknown, fallback: string[]): string[] {
  return Array.isArray(value) ? value.filter((button): button is string => typeof button === "string") : fallback;
}

function applyRoomInfo(state: ShareState, info: RoomInfo | undefined): boolean {
  if (!info) return false;

  const nextInputVersion = readNumber(info.acceptedInputVersion, state.inputVersion);
  const nextFrameVersion = readNumber(info.presentedFrameVersion, state.frameVersion);
  const nextLastInputAt = readNumber(info.lastInputAt, state.lastInputAt);
  const nextLastFrameAt = readNumber(info.lastFrameAt, state.lastFrameAt);
  const nextQueueDepth = readNumber(info.queueDepth, state.queueDepth);
  const nextFrameHash = typeof info.frameHash === "string" ? info.frameHash : state.frameHash;
  const nextHeldButtons = readButtons(info.heldButtons, state.heldButtons);

  const changed =
    nextFrameHash !== state.frameHash ||
    nextInputVersion !== state.inputVersion ||
    nextFrameVersion !== state.frameVersion ||
    nextLastInputAt !== state.lastInputAt ||
    nextLastFrameAt !== state.lastFrameAt ||
    nextQueueDepth !== state.queueDepth ||
    nextHeldButtons.join("|") !== state.heldButtons.join("|");

  if (!changed) return false;

  state.frameHash = nextFrameHash;
  state.inputVersion = nextInputVersion;
  state.frameVersion = nextFrameVersion;
  state.lastInputAt = nextLastInputAt;
  state.lastFrameAt = nextLastFrameAt;
  state.queueDepth = nextQueueDepth;
  state.heldButtons = nextHeldButtons;
  state.updatedAt = Math.max(state.updatedAt, nextLastInputAt, nextLastFrameAt, Date.now());
  return true;
}

async function syncFromService(room: string, state: ShareState): Promise<boolean> {
  try {
    const upstream = await fetch(`${SERVICE_URL}/rooms`, {
      headers: { Accept: "application/json" },
    });
    if (!upstream.ok) return false;
    const data = (await upstream.json().catch(() => null)) as Record<string, RoomInfo> | null;
    if (!data) return false;
    return applyRoomInfo(state, data[room]);
  } catch {
    return false;
  }
}

function hasFreshData(
  state: ShareState,
  sinceInputVersion: number,
  sinceFrameVersion: number,
  sinceUpdatedAt: number,
  sinceFrameHash: string,
) {
  return (
    (sinceFrameHash ? state.frameHash !== sinceFrameHash : false) ||
    state.inputVersion > sinceInputVersion ||
    state.frameVersion > sinceFrameVersion ||
    state.updatedAt > sinceUpdatedAt
  );
}

export default async (c: Context) => {
  const room = String(c.req.query("room") || "main").slice(0, 32) || "main";
  const state = getState(room);
  const sinceInputVersion = Number(c.req.query("sinceInputVersion") || -1);
  const sinceFrameVersion = Number(c.req.query("sinceFrameVersion") || -1);
  const sinceFrameHash = String(c.req.query("sinceFrameHash") || "");
  const sinceUpdatedAt = Number(c.req.query("sinceUpdatedAt") || 0);
  const hasSinceCursor =
    c.req.query("sinceInputVersion") !== undefined ||
    c.req.query("sinceFrameVersion") !== undefined ||
    c.req.query("sinceFrameHash") !== undefined ||
    c.req.query("sinceUpdatedAt") !== undefined;
  const timeoutMs = clampTimeout(c.req.query("timeoutMs"), hasSinceCursor ? LONG_POLL_TIMEOUT_MS : 0);
  const deadline = Date.now() + timeoutMs;

  await syncFromService(room, state);

  while (
    timeoutMs > 0 &&
    !hasFreshData(state, sinceInputVersion, sinceFrameVersion, sinceUpdatedAt, sinceFrameHash) &&
    Date.now() < deadline
  ) {
    await sleep(LONG_POLL_INTERVAL_MS);
    await syncFromService(room, state);
  }

  return c.json({
    room,
    streamUrl: `/api/zoplayspokemon-frame?room=${encodeURIComponent(room)}`,
    controls: {
      up: "2",
      down: "3",
      left: "1",
      right: "0",
      a: "4",
      b: "5",
      select: "6",
      start: "7",
    },
    updatedAt: state.updatedAt,
    inputVersion: state.inputVersion,
    frameVersion: state.frameVersion,
    frameHash: state.frameHash,
    queueDepth: state.queueDepth,
    heldButtons: state.heldButtons,
    lastInputAt: state.lastInputAt,
    lastFrameAt: state.lastFrameAt,
    events: state.events.slice(-20).reverse(),
  });
};
