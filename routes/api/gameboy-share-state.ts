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

const MAX_EVENTS = 80;
const KEY = "__gameboy_share_state";

function getState(): ShareState {
  const g = globalThis as typeof globalThis & { [KEY]?: ShareState };
  if (!g[KEY]) {
    g[KEY] = { events: [], updatedAt: Date.now() };
  }
  return g[KEY]!;
}

export default (c: Context) => {
  const state = getState();
  return c.json({
    streamUrl: "https://toy.cloudreve.org/image",
    controls: {
      up: "2", down: "3", left: "1", right: "0",
      a: "4", b: "5", select: "6", start: "7",
    },
    updatedAt: state.updatedAt,
    events: state.events.slice(-20).reverse(),
  });
};