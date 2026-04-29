import type { Context } from "hono";

type InputEvent = {
  button: string;
  action: string;
  user: string;
  timestamp: number;
};

type ShareState = {
  events: InputEvent[];
  updatedAt: number;
};

const SERVICE_URL = "https://zo-gameboy-etok.zocomputer.io";
const KEY = "__gameboy_share_state";
const MAX_EVENTS = 80;
const ALLOWED = new Set(["0", "1", "2", "3", "4", "5", "6", "7"]);
const ACTIONS = new Set(["tap", "press", "release"]);

function getState(room: string): ShareState {
  const g = globalThis as typeof globalThis & { [KEY]?: Record<string, ShareState> };
  if (!g[KEY]) {
    g[KEY] = {};
  }
  if (!g[KEY]![room]) {
    g[KEY]![room] = { events: [], updatedAt: Date.now() };
  }
  return g[KEY]![room]!;
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

    const state = getState(room);
    const event: InputEvent = { button, action, user, timestamp: Date.now() };
    state.events.push(event);
    if (state.events.length > MAX_EVENTS) state.events.shift();
    state.updatedAt = event.timestamp;

    return c.json({ ok: true, room, event });
  } catch {
    return c.json({ error: "Bad request" }, 400);
  }
};
