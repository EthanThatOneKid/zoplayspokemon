import type { PointerEvent as ReactPointerEvent, PointerEventHandler } from "react";
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
  kind: "dpad" | "action" | "menu";
};

const BUTTONS: ButtonDef[] = [
  { label: "UP", code: "2", hint: "Arrow Up / W", kind: "dpad" },
  { label: "LEFT", code: "1", hint: "Arrow Left / A", kind: "dpad" },
  { label: "RIGHT", code: "0", hint: "Arrow Right / D", kind: "dpad" },
  { label: "DOWN", code: "3", hint: "Arrow Down / S", kind: "dpad" },
  { label: "A", code: "4", hint: "Z / K", kind: "action" },
  { label: "B", code: "5", hint: "X / J", kind: "action" },
  { label: "SELECT", code: "6", hint: "Shift / Backspace", kind: "menu" },
  { label: "START", code: "7", hint: "Enter / Space", kind: "menu" },
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

const INPUT_TIMEOUT_MS = 6000;
const MAX_QUEUE_DEPTH = 5;
const LONG_POLL_TIMEOUT_MS = 20_000;
const FALLBACK_REFRESH_MS = 10_000;
const BURST_POLL_INTERVAL_MS = 70;
const BURST_SETTLE_REFRESH_MS = 180;
const BURST_WINDOW_MS = 1200;

const BUTTON_LOOKUP = Object.fromEntries(BUTTONS.map((button) => [button.code, button])) as Record<string, ButtonDef>;

const PAGE_STYLES = `
  @import url("https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap");

  .zp-root {
    --shell-primary: #e0e0c0;
    --shell-secondary: #c0c0a0;
    --shell-accent: #e0e0a0;
    --shell-dark: #a0a080;
    --shell-warm: #e0c0a0;
    --bezel-dark: #202020;
    --bezel-teal: #002020;
    --bezel-indigo: #000020;
    --bezel-muted: #608080;
    --lcd-light: #e0e0a0;
    --lcd-mid: #a0a080;
    --lcd-dark: #406040;
    --lcd-void: #002020;
    --button-a: #d03030;
    --button-b: #8030a0;
    --dpad: #303030;
    --dpad-highlight: #505050;
    --success: #30a030;
    --error: #c03020;
    --warning: #c09020;
    background:
      radial-gradient(circle at top, rgba(224, 224, 160, 0.12), transparent 30%),
      linear-gradient(180deg, #ceceb0 0%, #b8b893 100%);
    color: #171712;
    font-family: "VT323", monospace;
    letter-spacing: 0.02em;
  }

  .zp-root::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.12;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.2) 1px, transparent 1px),
      linear-gradient(90deg, rgba(0, 0, 0, 0.08) 1px, transparent 1px);
    background-size: 4px 4px, 4px 4px;
  }

  .zp-font-mono {
    font-family: "Press Start 2P", monospace;
    letter-spacing: 0.08em;
  }

  .zp-spinner {
    width: 12px;
    height: 12px;
    display: inline-block;
    background: var(--success);
    box-shadow:
      12px 0 0 rgba(48, 160, 48, 0.35),
      0 12px 0 rgba(48, 160, 48, 0.35),
      12px 12px 0 rgba(48, 160, 48, 0.15);
    animation: zp-spin 0.7s steps(4) infinite;
  }

  .zp-toast {
    animation: zp-toast-in 180ms ease-out;
  }

  .zp-frame-glow {
    box-shadow:
      inset 0 0 0 2px rgba(224, 224, 160, 0.08),
      0 20px 30px rgba(0, 0, 0, 0.18);
  }

  @keyframes zp-spin {
    0% {
      transform: translate(0, 0);
    }
    25% {
      transform: translate(2px, 0);
    }
    50% {
      transform: translate(2px, 2px);
    }
    75% {
      transform: translate(0, 2px);
    }
    100% {
      transform: translate(0, 0);
    }
  }

  @keyframes zp-toast-in {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;

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
  return `${label} tap`;
}

function DpadButton({
  active,
  disabled,
  label,
  onPress,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onPress: PointerEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={onPress}
      onContextMenu={(event) => event.preventDefault()}
      className="relative flex h-16 w-16 items-center justify-center rounded-[10px] border border-black/30 text-[12px] text-[#f5f5da] transition disabled:cursor-wait disabled:opacity-70"
      style={{
        touchAction: "none",
        background: active ? "#252525" : "#303030",
        boxShadow: active
          ? "inset 3px 3px 0 rgba(0,0,0,0.45), inset -2px -2px 0 rgba(80,80,80,0.28)"
          : "inset 3px 3px 0 rgba(80,80,80,0.95), inset -3px -3px 0 rgba(0,0,0,0.55), 0 5px 0 rgba(0,0,0,0.25)",
        transform: active ? "translateY(2px)" : "translateY(0)",
      }}
    >
      <span className="zp-font-mono text-[10px]">{label}</span>
    </button>
  );
}

function ActionButton({
  active,
  button,
  disabled,
  onPress,
}: {
  active: boolean;
  button: ButtonDef;
  disabled: boolean;
  onPress: PointerEventHandler<HTMLButtonElement>;
}) {
  const background = button.code === "4" ? "#d03030" : "#8030a0";
  const shadow = button.code === "4" ? "rgba(92, 15, 15, 0.5)" : "rgba(55, 18, 85, 0.55)";
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={onPress}
      onContextMenu={(event) => event.preventDefault()}
      className="flex h-20 w-20 items-center justify-center rounded-full border border-black/25 text-[#fff7ef] transition disabled:cursor-wait disabled:opacity-70"
      style={{
        touchAction: "none",
        background,
        boxShadow: active
          ? `inset 4px 4px 0 rgba(0,0,0,0.25), inset -2px -2px 0 rgba(255,255,255,0.18), 0 2px 0 ${shadow}`
          : `inset 4px 4px 0 rgba(255,255,255,0.18), inset -4px -4px 0 rgba(0,0,0,0.2), 0 7px 0 ${shadow}`,
        transform: active ? "translateY(3px) scale(0.97)" : "translateY(0)",
      }}
    >
      <span className="zp-font-mono text-base">{button.label}</span>
    </button>
  );
}

function MenuButton({
  active,
  disabled,
  label,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  label: string;
  onClick: PointerEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onPointerDown={onClick}
      onContextMenu={(event) => event.preventDefault()}
      className="rounded-full px-5 py-2 text-[10px] text-[#222214] transition disabled:cursor-wait disabled:opacity-70"
      style={{
        touchAction: "none",
        background: active ? "#a0a080" : "#c0c0a0",
        boxShadow: active
          ? "inset 2px 2px 0 rgba(0,0,0,0.18), inset -2px -2px 0 rgba(255,255,255,0.22)"
          : "inset 2px 2px 0 rgba(255,255,255,0.5), inset -2px -2px 0 rgba(0,0,0,0.14), 0 4px 0 rgba(96,96,72,0.5)",
        transform: active ? "translateY(2px)" : "translateY(0)",
      }}
    >
      <span className="zp-font-mono">{label}</span>
    </button>
  );
}

export default function ZoPlaysPokemonPage() {
  const [events, setEvents] = useState<InputEvent[]>([]);
  const [updatedAt, setUpdatedAt] = useState<number>(Date.now());
  const [error, setError] = useState("");
  const [frameSrc, setFrameSrc] = useState("");
  const [frameVersion, setFrameVersion] = useState(0);
  const [inputVersion, setInputVersion] = useState(0);
  const [lastFrameAt, setLastFrameAt] = useState(0);
  const [room, setRoom] = useState("main");
  const [pendingTapCode, setPendingTapCode] = useState<string | null>(null);
  const [queueCount, setQueueCount] = useState(0);
  const [queueDepth, setQueueDepth] = useState(0);
  const [keyboardEnabled, setKeyboardEnabled] = useState(false);
  const [frameLoading, setFrameLoading] = useState(true);
  const user = useMemo(() => Math.random().toString(36).slice(2, 8), []);
  const frameHashRef = useRef("");
  const frameVersionRef = useRef(0);
  const inputVersionRef = useRef(0);
  const lastFrameAtRef = useRef(0);
  const pendingTimeoutRef = useRef<number | null>(null);
  const frameLoadingRef = useRef(true);
  const updatedAtRef = useRef(Date.now());
  const burstPollIdRef = useRef(0);
  const roomRef = useRef("main");
  const frameEtagRef = useRef<string | null>(null);
  const frameObjectUrlRef = useRef<string | null>(null);
  const frameFetchIdRef = useRef(0);

  const visibleQueueCount = Math.max(queueCount, queueDepth);
  const controlsDisabled = visibleQueueCount > 0;

  const refreshFrame = async (force = false) => {
    if (frameLoadingRef.current && !force) return;
    frameLoadingRef.current = true;
    setFrameLoading(true);

    const requestId = frameFetchIdRef.current + 1;
    frameFetchIdRef.current = requestId;

    try {
      const headers: Record<string, string> = { Accept: "image/png" };
      if (frameEtagRef.current) {
        headers["If-None-Match"] = frameEtagRef.current;
      }

      const response = await fetch(`/api/zoplayspokemon-frame?room=${encodeURIComponent(roomRef.current)}`, {
        headers,
        cache: "no-cache",
      });

      if (frameFetchIdRef.current !== requestId) return;

      if (response.status === 304) {
        frameLoadingRef.current = false;
        setFrameLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error("Frame feed unavailable");
      }

      const nextEtag = response.headers.get("etag");
      if (nextEtag) {
        frameEtagRef.current = nextEtag;
      }
      const nextFrameHash = response.headers.get("x-frame-hash");
      if (nextFrameHash) {
        frameHashRef.current = nextFrameHash;
      }

      const blob = await response.blob();
      if (frameFetchIdRef.current !== requestId) return;

      const nextUrl = URL.createObjectURL(blob);
      const previousUrl = frameObjectUrlRef.current;
      frameObjectUrlRef.current = nextUrl;
      setFrameSrc(nextUrl);
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }

      frameLoadingRef.current = false;
      setFrameLoading(false);
      clearPendingInput();
    } catch {
      if (frameFetchIdRef.current !== requestId) return;
      frameLoadingRef.current = false;
      setFrameLoading(false);
      clearPendingInput();
      setError("Frame feed unavailable");
    }
  };

  const sleep = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

  const notePendingInput = () => {
    setQueueCount((current) => Math.min(MAX_QUEUE_DEPTH, current + 1));
    if (pendingTimeoutRef.current !== null) {
      window.clearTimeout(pendingTimeoutRef.current);
    }
    pendingTimeoutRef.current = window.setTimeout(() => {
      setQueueCount(0);
      setPendingTapCode(null);
      pendingTimeoutRef.current = null;
      setError("Input timed out before a new frame arrived");
    }, INPUT_TIMEOUT_MS);
  };

  const clearPendingInput = () => {
    setQueueCount(0);
    setPendingTapCode(null);
    if (pendingTimeoutRef.current !== null) {
      window.clearTimeout(pendingTimeoutRef.current);
      pendingTimeoutRef.current = null;
    }
  };

  const failInput = (message: string) => {
    clearPendingInput();
    setError(message);
  };

  const fetchState = async (nextRoom: string, useCursor: boolean, timeoutMs: number) => {
    const query = new URLSearchParams({ room: nextRoom });
    if (useCursor) {
      query.set("sinceInputVersion", String(inputVersionRef.current));
      query.set("sinceFrameVersion", String(frameVersionRef.current));
      query.set("sinceFrameHash", frameHashRef.current);
      query.set("sinceUpdatedAt", String(updatedAtRef.current));
      query.set("timeoutMs", String(timeoutMs));
    }

    const res = await fetch(`/api/zoplayspokemon-state?${query.toString()}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Record<string, unknown>;
    applyState(data);
    return data;
  };

  const runBurstPoll = (expectedInputVersion: number) => {
    const burstId = burstPollIdRef.current + 1;
    burstPollIdRef.current = burstId;

    void (async () => {
      const deadline = Date.now() + BURST_WINDOW_MS;
      let sawPresentedFrame = frameVersionRef.current >= expectedInputVersion;

      while (!sawPresentedFrame && burstPollIdRef.current === burstId && Date.now() < deadline) {
        try {
          await fetchState(roomRef.current, true, 0);
        } catch {
        }

        sawPresentedFrame = frameVersionRef.current >= expectedInputVersion;
        if (!sawPresentedFrame) {
          await sleep(BURST_POLL_INTERVAL_MS);
        }
      }

      if (!sawPresentedFrame || burstPollIdRef.current !== burstId) return;

      await sleep(BURST_SETTLE_REFRESH_MS);
      if (burstPollIdRef.current !== burstId) return;
      refreshFrame();

      await sleep(BURST_SETTLE_REFRESH_MS);
      if (burstPollIdRef.current !== burstId) return;
      refreshFrame();
    })();
  };

  const sendInput = async (code: string, action: "tap" | "press" | "release") => {
    notePendingInput();
    try {
      const res = await fetch("/api/zoplayspokemon-input", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ room, button: code, action, user }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        failInput(data.error || "Failed to send input");
        return false;
      }
      const data = await res.json().catch(() => ({}));
      const nextInputVersion = Number(data.inputVersion || 0);
      const nextFrameVersion = Number(data.frameVersion || 0);
      const nextQueueDepth = Number(data.queueDepth || 0);
      if (Number.isFinite(nextInputVersion) && nextInputVersion > inputVersionRef.current) {
        inputVersionRef.current = nextInputVersion;
        setInputVersion(nextInputVersion);
      }
      if (Number.isFinite(nextFrameVersion) && nextFrameVersion > frameVersionRef.current) {
        frameVersionRef.current = nextFrameVersion;
        setFrameVersion(nextFrameVersion);
      }
      setQueueDepth(Math.max(0, nextQueueDepth));
      runBurstPoll(Math.max(nextInputVersion, inputVersionRef.current));
      return true;
    } catch {
      failInput("Network issue while sending input");
      return false;
    }
  };

  const tap = (code: string) => {
    if (controlsDisabled || pendingTapCode) return;
    setError("");
    setPendingTapCode(code);
    void sendInput(code, "tap");
  };

  const beginPointerPress = (code: string) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (controlsDisabled) return;
    event.preventDefault();
    tap(code);
  };

  const pressMenuButton = (code: string) => (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    tap(code);
  };

  const applyState = (data: Record<string, unknown>) => {
    setEvents(Array.isArray(data.events) ? (data.events as InputEvent[]) : []);

    const nextUpdatedAt = Number(data.updatedAt || Date.now());
    updatedAtRef.current = Number.isFinite(nextUpdatedAt) ? nextUpdatedAt : Date.now();
    setUpdatedAt(updatedAtRef.current);

    const nextInputVersion = Number(data.inputVersion || 0);
    if (Number.isFinite(nextInputVersion) && nextInputVersion >= inputVersionRef.current) {
      inputVersionRef.current = nextInputVersion;
      setInputVersion(nextInputVersion);
    }

    const nextFrameVersion = Number(data.frameVersion || 0);
    const nextFrameHash = typeof data.frameHash === "string" ? data.frameHash : "";
    const shouldRefreshForFrame = Boolean(nextFrameHash && nextFrameHash !== frameHashRef.current);
    if (Number.isFinite(nextFrameVersion) && nextFrameVersion >= frameVersionRef.current) {
      frameVersionRef.current = nextFrameVersion;
      setFrameVersion(nextFrameVersion);
    }

    const nextQueueDepth = Number(data.queueDepth || 0);
    setQueueDepth(Number.isFinite(nextQueueDepth) ? Math.max(0, nextQueueDepth) : 0);

    const nextLastFrameAt = Number(data.lastFrameAt || 0);
    if (Number.isFinite(nextLastFrameAt) && nextLastFrameAt >= lastFrameAtRef.current) {
      lastFrameAtRef.current = nextLastFrameAt;
      setLastFrameAt(nextLastFrameAt);
    }

    if (shouldRefreshForFrame) {
      refreshFrame();
    }
  };

  useEffect(() => {
    frameLoadingRef.current = frameLoading;
  }, [frameLoading]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const nextRoom = (params.get("room") || "main").slice(0, 32) || "main";
    setRoom(nextRoom);

    const run = async () => {
      try {
        await fetchState(nextRoom, false, 0);
      } catch {
      }

      while (active) {
        try {
          await fetchState(nextRoom, true, LONG_POLL_TIMEOUT_MS);
        } catch {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
      }
    };

    void run();
    const fallback = window.setInterval(() => {
      void refreshFrame();
    }, FALLBACK_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(fallback);
    };
  }, []);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 3000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!keyboardEnabled) return;
      const code = KEY_TO_CODE[event.key];
      if (!code) return;
      event.preventDefault();
      if (event.repeat) return;
      tap(code);
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (pendingTimeoutRef.current !== null) {
        window.clearTimeout(pendingTimeoutRef.current);
      }
    };
  }, [keyboardEnabled, room]);

  useEffect(() => {
    burstPollIdRef.current += 1;
    frameVersionRef.current = 0;
    inputVersionRef.current = 0;
    lastFrameAtRef.current = 0;
    frameHashRef.current = "";
    frameEtagRef.current = null;
    frameFetchIdRef.current += 1;
    updatedAtRef.current = Date.now();
    setEvents([]);
    if (frameObjectUrlRef.current) {
      URL.revokeObjectURL(frameObjectUrlRef.current);
      frameObjectUrlRef.current = null;
    }
    setFrameSrc("");
    setFrameVersion(0);
    setInputVersion(0);
    setLastFrameAt(0);
    setQueueDepth(0);
    clearPendingInput();
    frameLoadingRef.current = true;
    setFrameLoading(true);
    void refreshFrame(true);
  }, [room]);

  useEffect(() => {
    return () => {
      frameFetchIdRef.current += 1;
      if (frameObjectUrlRef.current) {
        URL.revokeObjectURL(frameObjectUrlRef.current);
      }
    };
  }, []);

  const recentLabel = pendingTapCode ? buttonName(pendingTapCode) : "Tap-ready";
  const actionButtons = BUTTONS.filter((button) => button.kind === "action");
  const menuButtons = BUTTONS.filter((button) => button.kind === "menu");
  const showFrameLoadingOverlay = frameLoading && (!frameSrc || visibleQueueCount > 0);

  return (
    <div className="zp-root min-h-screen">
      <style>{PAGE_STYLES}</style>
      <div className="relative mx-auto flex min-h-screen max-w-[600px] flex-col px-4 py-6">
        <div className="mb-4 rounded-[22px] border border-black/10 bg-[#e0e0c0] px-4 py-4 shadow-[0_14px_30px_rgba(0,0,0,0.16)]">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="zp-font-mono text-[10px] text-[#606048]">ZO COMMUNITY EXPERIMENT</p>
              <h1 className="zp-font-mono mt-3 text-lg leading-6 text-[#202018]">#ZOPLAYSPOKEMON</h1>
              <p className="mt-3 text-[18px] leading-5 text-[#383828]">
                Everyone in this room shares one self-hosted Pokemon session on your Zo.
              </p>
            </div>
            <button
              type="button"
              aria-pressed={keyboardEnabled}
              onClick={() => setKeyboardEnabled((current) => !current)}
              className="min-w-[118px] rounded-full px-3 py-2 text-left transition"
              style={{
                background: keyboardEnabled ? "#f0d0c8" : "#d1d1b4",
                boxShadow: keyboardEnabled
                  ? "inset 2px 2px 0 rgba(255,255,255,0.45), inset -2px -2px 0 rgba(140,48,40,0.22)"
                  : "inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(80,80,60,0.18)",
              }}
              title="Opt in if you want keyboard controls."
            >
              <div className="zp-font-mono text-[9px] text-[#403628]">
                KEYBOARD: {keyboardEnabled ? "ON" : "OFF"}
              </div>
              <div className="mt-1 text-[14px] leading-4 text-[#5c5c42]">Opt in to avoid accidental inputs.</div>
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[14px] leading-4 text-[#404030]">
            <span className="rounded-full bg-[#c8c8a8] px-3 py-1">
              ROOM <span className="zp-font-mono ml-2 text-[10px]">{room}</span>
            </span>
            <span className="rounded-full bg-[#d7d7ba] px-3 py-1">RECENT {recentLabel}</span>
            <span className="rounded-full bg-[#d7d7ba] px-3 py-1">
              FRAME {frameVersion} · {lastFrameAt ? new Date(lastFrameAt).toLocaleTimeString() : "waiting"}
            </span>
          </div>
        </div>

        <div className="rounded-[28px] border border-black/10 bg-[#d8d8b8] px-4 py-5 shadow-[0_18px_38px_rgba(0,0,0,0.18)]">
          <div className="zp-frame-glow rounded-[26px] border border-black/20 bg-[#bcbca0] p-3">
            <div className="rounded-[22px] border border-[#4e4e3b] bg-[#202020] px-3 pb-4 pt-3">
              <div className="mb-2 flex items-center justify-between text-[11px] text-[#c8c8a8]">
                <span className="zp-font-mono">BENTO TRAY SCREEN</span>
                <span>{visibleQueueCount > 0 ? "SYNCING INPUT" : "LIVE FEED"}</span>
              </div>
              <div className="relative aspect-[10/9] overflow-hidden rounded-[16px] border border-[#608080] bg-[#002020]">
                <img
                  src={frameSrc}
                  alt="Shared game screen"
                  loading="eager"
                  className="block h-full w-full bg-[#002020]"
                  style={{ imageRendering: "pixelated" }}
                />
                {showFrameLoadingOverlay ? (
                  <div className="pointer-events-none absolute inset-0 flex items-end justify-start bg-transparent p-3 text-[12px] text-[#c8c8a8]">
                    <span className="zp-font-mono">{frameSrc ? "SYNCING FRAME…" : "LOADING FRAME…"}</span>
                  </div>
                ) : null}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-[13px] leading-4 text-[#c8c8a8]">
                <span>{visibleQueueCount > 0 ? "Input noticed. Waiting for the next frame." : "Press a button to nudge the shared game."}</span>
                {visibleQueueCount > 0 ? (
                  <span className="flex items-center gap-2 rounded-full border border-[#2a6a2a] bg-[#173717] px-3 py-1 text-[#d8ffd8]">
                    <span className="zp-spinner" aria-hidden="true" />
                    <span className="zp-font-mono text-[9px]">QUEUED: {visibleQueueCount}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-black/10 bg-[#e0e0c0] px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="zp-font-mono text-[11px] text-[#303020]">CONTROLS</h2>
                <p className="mt-2 text-[16px] leading-4 text-[#4a4a34]">
                  Every button press is treated the same way: one tap in, then a short lock so everyone sees the result land.
                </p>
              </div>
              <button
                type="button"
                onClick={() => tap("7")}
                disabled={controlsDisabled}
                className="rounded-full px-4 py-2 text-[#222214] transition disabled:cursor-wait disabled:opacity-70"
                style={{
                  background: "#e0c0a0",
                  boxShadow: controlsDisabled
                    ? "inset 2px 2px 0 rgba(0,0,0,0.12)"
                    : "inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.14), 0 4px 0 rgba(120,84,52,0.35)",
                }}
              >
                <span className="zp-font-mono text-[10px]">QUICK START</span>
              </button>
            </div>

            <div className={`mt-5 ${controlsDisabled ? "pointer-events-none" : ""}`}>
              <div className="flex items-center justify-between gap-4">
                <div className="grid grid-cols-3 gap-2 rounded-[22px] bg-[#c8c8a8] p-3">
                  <div />
                  <DpadButton
                    label="UP"
                    active={pendingTapCode === "2"}
                    disabled={controlsDisabled}
                    onPress={beginPointerPress("2")}
                  />
                  <div />
                  <DpadButton
                    label="LEFT"
                    active={pendingTapCode === "1"}
                    disabled={controlsDisabled}
                    onPress={beginPointerPress("1")}
                  />
                  <div className="rounded-[10px] bg-[#b5b595]" />
                  <DpadButton
                    label="RIGHT"
                    active={pendingTapCode === "0"}
                    disabled={controlsDisabled}
                    onPress={beginPointerPress("0")}
                  />
                  <div />
                  <DpadButton
                    label="DOWN"
                    active={pendingTapCode === "3"}
                    disabled={controlsDisabled}
                    onPress={beginPointerPress("3")}
                  />
                  <div />
                </div>

                <div className="flex -rotate-12 flex-col items-center gap-4">
                  {actionButtons.map((button) => (
                    <ActionButton
                      key={button.code}
                      button={button}
                      active={pendingTapCode === button.code}
                      disabled={controlsDisabled}
                      onPress={beginPointerPress(button.code)}
                    />
                  ))}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-center gap-4">
                {menuButtons.map((button) => (
                  <MenuButton
                    key={button.code}
                    label={button.label}
                    active={pendingTapCode === button.code}
                    disabled={controlsDisabled}
                    onClick={pressMenuButton(button.code)}
                  />
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-2 text-[14px] leading-4 text-[#5a5a42] sm:grid-cols-2">
              {BUTTONS.map((button) => (
                <div key={button.code} className="rounded-[14px] bg-[#d3d3b4] px-3 py-2">
                  <span className="zp-font-mono text-[9px] text-[#303020]">{button.label}</span>
                  <span className="ml-2">{button.hint}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-5 rounded-[24px] border border-black/10 bg-[#e0e0c0] px-4 py-4">
            <h2 className="zp-font-mono text-[11px] text-[#303020]">LIVE ACTIVITY</h2>
            <p className="mt-2 text-[15px] leading-4 text-[#5a5a42]">
              Last state update: {new Date(updatedAt).toLocaleTimeString()} · input {inputVersion}
            </p>
            <div className="mt-4 max-h-64 space-y-2 overflow-auto">
              {events.length === 0 ? (
                <p className="text-[18px] text-[#606048]">No recent input yet.</p>
              ) : (
                events.map((event, index) => {
                  const button = BUTTON_LOOKUP[event.button];
                  return (
                    <div
                      key={`${event.timestamp}-${index}`}
                      className="flex items-center justify-between gap-3 rounded-[14px] bg-[#d1d1b2] px-3 py-2 text-[15px] leading-4 text-[#26261b]"
                    >
                      <span>
                        <span className="zp-font-mono mr-2 text-[9px]">{button?.label || event.button}</span>
                        {describeEvent(event)} by {event.user}
                      </span>
                      <span className="text-[#606048]">{new Date(event.timestamp).toLocaleTimeString()}</span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {error ? (
          <div className="zp-toast pointer-events-none fixed inset-x-0 bottom-5 z-50 mx-auto max-w-[360px] px-4">
            <div className="rounded-[16px] border border-[#7b1f15] bg-[#c03020] px-4 py-3 text-center text-[16px] leading-4 text-[#fff3ea] shadow-[0_14px_30px_rgba(0,0,0,0.25)]">
              <div className="zp-font-mono text-[9px] text-[#ffe5d9]">INPUT ERROR</div>
              <div className="mt-2">{error}</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
