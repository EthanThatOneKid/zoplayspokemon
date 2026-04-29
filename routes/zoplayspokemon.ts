import { useEffect, useMemo, useRef, useState } from "react";

type InputEvent = {
  action?: string;
  button: string;
  user: string;
  timestamp: number;
};

type ButtonDef = {
  code: string;
  hint: string;
  label: string;
};

const BUTTONS: ButtonDef[] = [
  { label: "UP", code: "2", hint: "Arrow Up / W" },
  { label: "LEFT", code: "1", hint: "Arrow Left / A" },
  { label: "RIGHT", code: "0", hint: "Arrow Right / D" },
  { label: "DOWN", code: "3", hint: "Arrow Down / S" },
  { label: "A", code: "4", hint: "Z / K" },
  { label: "B", code: "5", hint: "X / J" },
  { label: "SELECT", code: "6", hint: "Shift / Backspace" },
  { label: "START", code: "7", hint: "Enter / Space" },
];

const KEY_TO_CODE: Record<string, string> = {
  ArrowUp: "2",
  w: "2",
  W: "2",
  ArrowLeft: "1",
  a: "1",
  A: "1",
  ArrowRight: "0",
  d: "0",
  D: "0",
  ArrowDown: "3",
  s: "3",
  S: "3",
  z: "4",
  Z: "4",
  k: "4",
  K: "4",
  x: "5",
  X: "5",
  j: "5",
  J: "5",
  Shift: "6",
  Backspace: "6",
  Enter: "7",
  " ": "7",
};
const POINTER_HOLD_DELAY_MS = 120;

function buttonName(code: string): string {
  const map: Record<string, string> = {
    "0": "RIGHT",
    "1": "LEFT",
    "2": "UP",
    "3": "DOWN",
    "4": "A",
    "5": "B",
    "6": "SELECT",
    "7": "START",
  };
  return map[code] || code;
}

function describeEvent(event: InputEvent): string {
  const action = event.action || "tap";
  const label = buttonName(event.button);
  if (action === "press") return `${label} down`;
  if (action === "release") return `${label} up`;
  return label;
}

export default function ZoPlaysPokemonPage() {
  const [events, setEvents] = useState<InputEvent[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const [error, setError] = useState("");
  const [tick, setTick] = useState<number>(Date.now());
  const [room, setRoom] = useState("main");
  const [activeCodes, setActiveCodes] = useState<string[]>([]);
  const [pendingTapCode, setPendingTapCode] = useState<string | null>(null);
  const user = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const activeCodesRef = useRef<Set<string>>(new Set());
  const burstTimersRef = useRef<number[]>([]);
  const pointerTimersRef = useRef<Map<string, number>>(new Map());

  const refreshFrame = () => setTick(Date.now());

  const queueRefreshBurst = () => {
    refreshFrame();
    for (const timer of burstTimersRef.current) {
      window.clearTimeout(timer);
    }
    burstTimersRef.current = [90, 300, 700, 1200].map((delay) =>
      window.setTimeout(() => setTick(Date.now()), delay),
    );
  };

  const syncActiveCodes = () => {
    setActiveCodes(Array.from(activeCodesRef.current.values()).sort());
  };

  const sendInput = async (code: string, action: "tap" | "press" | "release") => {
    try {
      const res = await fetch("/api/zoplayspokemon-input", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ room, button: code, action, user }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Failed to send input");
        return false;
      }
      queueRefreshBurst();
      return true;
    } catch {
      setError("Network issue while sending input");
      return false;
    }
  };

  const startHold = (code: string) => {
    if (activeCodesRef.current.has(code)) return;
    setError("");
    activeCodesRef.current.add(code);
    syncActiveCodes();
    void sendInput(code, "press");
  };

  const endHold = (code: string) => {
    if (!activeCodesRef.current.has(code)) return;
    activeCodesRef.current.delete(code);
    syncActiveCodes();
    void sendInput(code, "release");
  };

  const tap = (code: string) => {
    if (pendingTapCode) return;
    setError("");
    setPendingTapCode(code);
    void sendInput(code, "tap").finally(() => {
      window.setTimeout(() => {
        setPendingTapCode((current) => (current === code ? null : current));
      }, 450);
    });
  };

  const beginPointerPress = (code: string) => {
    if (pointerTimersRef.current.has(code) || activeCodesRef.current.has(code)) return;
    const timer = window.setTimeout(() => {
      pointerTimersRef.current.delete(code);
      startHold(code);
    }, POINTER_HOLD_DELAY_MS);
    pointerTimersRef.current.set(code, timer);
  };

  const endPointerPress = (code: string) => {
    const pendingTimer = pointerTimersRef.current.get(code);
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
      pointerTimersRef.current.delete(code);
      tap(code);
      return;
    }
    endHold(code);
  };

  const cancelPointerPress = (code: string) => {
    const pendingTimer = pointerTimersRef.current.get(code);
    if (pendingTimer !== undefined) {
      window.clearTimeout(pendingTimer);
      pointerTimersRef.current.delete(code);
    }
    endHold(code);
  };

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const nextRoom = (params.get("room") || "main").slice(0, 32) || "main";
    setRoom(nextRoom);

    const load = async () => {
      try {
        const res = await fetch(`/api/zoplayspokemon-state?room=${encodeURIComponent(nextRoom)}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        setEvents(Array.isArray(data.events) ? data.events : []);
        setUpdatedAt(Number(data.updatedAt || Date.now()));
      } catch {
      }
    };

    load();
    const poll = setInterval(load, 700);
    const refresh = setInterval(() => setTick(Date.now()), 250);

    return () => {
      active = false;
      clearInterval(poll);
      clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    const releaseAll = () => {
      const activeNow = Array.from(activeCodesRef.current.values());
      activeCodesRef.current.clear();
      syncActiveCodes();
      for (const code of activeNow) {
        void sendInput(code, "release");
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const code = KEY_TO_CODE[event.key];
      if (!code) return;
      event.preventDefault();
      if (event.repeat) return;
      startHold(code);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const code = KEY_TO_CODE[event.key];
      if (!code) return;
      event.preventDefault();
      endHold(code);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", releaseAll);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", releaseAll);
      releaseAll();
      for (const timer of pointerTimersRef.current.values()) {
        window.clearTimeout(timer);
      }
      pointerTimersRef.current.clear();
      for (const timer of burstTimersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, [room]);

  const imageUrl = `/api/zoplayspokemon-frame?room=${encodeURIComponent(room)}&t=${tick}`;

  return (
    <div className="min-h-screen bg-[#08110a] text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-5">
          <h1 className="text-3xl font-bold tracking-tight">Zo Plays Pokemon</h1>
          <p className="mt-1 text-zinc-400">Everyone in this room controls the same self-hosted Pokemon session running on your Zo.</p>
          <p className="mt-2 text-xs text-zinc-500">
            Room: <span className="text-emerald-300">{room}</span>
          </p>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-500/40 bg-rose-500/15 px-4 py-3 text-sm text-rose-100 shadow-lg shadow-rose-950/20">
            {error}
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-2xl border border-emerald-900/60 bg-black/30 p-3">
            <img
              src={imageUrl}
              alt="Shared game screen"
              className="w-full rounded-xl border border-zinc-800 bg-black"
              loading="eager"
            />
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-500">
              <span>Live frame feed</span>
              <span>{activeCodes.length ? `Holding: ${activeCodes.map(buttonName).join(", ")}` : "No buttons held"}</span>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Controls</h2>
                <button
                  type="button"
                  onClick={() => tap("7")}
                  disabled={pendingTapCode !== null}
                  className="rounded-lg border border-emerald-600/40 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-100 hover:bg-emerald-500/20 disabled:cursor-wait disabled:opacity-70"
                >
                  Quick Start
                </button>
              </div>
              <p className="mt-2 text-xs text-zinc-500">Tap for menu inputs. Hold with touch, mouse, or keyboard to keep moving.</p>
              {pendingTapCode ? (
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-emerald-200">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-emerald-300/30 border-t-emerald-200" />
                  Queueing {buttonName(pendingTapCode)}
                </div>
              ) : null}
              <div className={`relative mt-3 ${pendingTapCode ? "pointer-events-none" : ""}`}>
                <div className="grid grid-cols-2 gap-2">
                {BUTTONS.map((button) => {
                  const isActive = activeCodes.includes(button.code);
                  const isPending = pendingTapCode === button.code;
                  return (
                    <button
                      key={button.code}
                      type="button"
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.currentTarget.setPointerCapture(event.pointerId);
                        beginPointerPress(button.code);
                      }}
                      onPointerUp={() => endPointerPress(button.code)}
                      onPointerCancel={() => cancelPointerPress(button.code)}
                      onPointerLeave={() => cancelPointerPress(button.code)}
                      onContextMenu={(event) => event.preventDefault()}
                      className={`rounded-lg border px-3 py-3 text-left transition ${
                        isActive
                          ? "border-emerald-300 bg-emerald-400/20 text-emerald-100"
                          : isPending
                            ? "border-emerald-300/70 bg-emerald-500/25 text-emerald-50"
                          : "border-emerald-600/40 bg-emerald-500/10 hover:bg-emerald-500/20"
                      } ${pendingTapCode ? "cursor-wait opacity-80" : ""}`}
                      style={{ touchAction: "none" }}
                    >
                      <div className="text-sm font-semibold">{button.label}</div>
                      <div className="mt-1 text-xs text-zinc-400">{button.hint}</div>
                    </button>
                  );
                })}
                </div>
                {pendingTapCode ? (
                  <div className="absolute inset-0 rounded-xl bg-[#08110a]/15" aria-hidden="true" />
                ) : null}
              </div>
              <p className="mt-3 text-xs text-zinc-500">
                {pendingTapCode
                  ? "Your click was noticed and queued for the shared game."
                  : "Buttons briefly lock while a tap is being acknowledged. Held movement still works."}
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <h2 className="text-sm font-semibold uppercase tracking-widest text-zinc-400">Live Activity</h2>
              <p className="mt-1 text-xs text-zinc-500">Last update: {new Date(updatedAt).toLocaleTimeString()}</p>
              <div className="mt-3 max-h-64 space-y-1 overflow-auto">
                {events.length === 0 ? (
                  <p className="text-sm text-zinc-500">No recent input yet.</p>
                ) : (
                  events.map((event, index) => (
                    <div
                      key={`${event.timestamp}-${index}`}
                      className="flex justify-between gap-3 border-b border-white/5 pb-1 text-sm text-zinc-300"
                    >
                      <span>{describeEvent(event)} by {event.user}</span>
                      <span className="text-zinc-500">{new Date(event.timestamp).toLocaleTimeString()}</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
