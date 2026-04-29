import type { Context } from "hono";

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

const SERVICE_URL = "https://zo-gameboy-etok.zocomputer.io";
const KEY = "__zoplayspokemon_state";
const MAX_EVENTS = 80;
const ALLOWED = new Set(["0", "1", "2", "3", "4", "5", "6", "7"]);
const ACTIONS = new Set(["tap", "press", "release"]);

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
    const room = String(body.room || "main").slice(0, 32) || "main";

    if (!ALLOWED.has(button)) {
      return c.json({ error: "Invalid button" }, 400);
    }
    if (!ACTIONS.has(action)) {
      return c.json({ error: "Invalid action" }, 400);
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
      const detail = await upstream.text().catch(() => "");
      return c.json({ error: "Local emulator input failed", status: upstream.status, detail }, 502);
    }

    const upstreamData = (await upstream.json().catch(() => null)) as UpstreamInputResponse | null;
    const state = getState(room);
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
