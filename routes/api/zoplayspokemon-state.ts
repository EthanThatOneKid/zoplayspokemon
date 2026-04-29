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

export default (c: Context) => {
  const room = String(c.req.query("room") || "main").slice(0, 32) || "main";
  const state = getState(room);
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
    events: state.events.slice(-20).reverse(),
  });
};
