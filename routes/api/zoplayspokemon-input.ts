import type { Context } from "hono";

type InputEvent = {
  button: string;
  user: string;
  timestamp: number;
};

type ShareState = {
  events: InputEvent[];
  updatedAt: number;
};

const KEY = "__gameboy_share_state";
const MAX_EVENTS = 80;
const ALLOWED = new Set(["0", "1", "2", "3", "4", "5", "6", "7"]);

function getState(): ShareState {
  const g = globalThis as typeof globalThis & { [KEY]?: ShareState };
  if (!g[KEY]) {
    g[KEY] = { events: [], updatedAt: Date.now() };
  }
  return g[KEY]!;
}

export default async (c: Context) => {
  try {
    const body = await c.req.json<{ button?: string; user?: string }>();
    const button = String(body.button || "");
    const user = String(body.user || "anon").slice(0, 24);

    if (!ALLOWED.has(button)) {
      return c.json({ error: "Invalid button" }, 400);
    }

    const target = `https://toy.cloudreve.org/control?button=${encodeURIComponent(button)}&callback=https://etok.zo.space/gameboy-share`;
    const upstream = await fetch(target, { method: "GET", redirect: "follow" });

    if (!upstream.ok) {
      return c.json({ error: "Upstream control failed", status: upstream.status }, 502);
    }

    const state = getState();
    const event: InputEvent = { button, user, timestamp: Date.now() };
    state.events.push(event);
    if (state.events.length > MAX_EVENTS) state.events.shift();
    state.updatedAt = event.timestamp;

    return c.json({ ok: true, event });
  } catch {
    return c.json({ error: "Bad request" }, 400);
  }
};