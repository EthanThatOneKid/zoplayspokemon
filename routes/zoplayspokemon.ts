import type { CSSProperties, PointerEvent as ReactPointerEvent, PointerEventHandler } from "react";
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

type ThemeVars = {
  pageTop: string;
  pageBottom: string;
  shellPrimary: string;
  shellSecondary: string;
  shellAccent: string;
  shellDark: string;
  shellWarm: string;
  bezelDark: string;
  bezelTeal: string;
  bezelIndigo: string;
  bezelMuted: string;
  lcdLight: string;
  lcdMid: string;
  lcdDark: string;
  lcdVoid: string;
  buttonA: string;
  buttonAShadow: string;
  buttonB: string;
  buttonBShadow: string;
  dpad: string;
  dpadPressed: string;
  dpadHighlight: string;
  menuFill: string;
  menuPressed: string;
  success: string;
  error: string;
  warning: string;
  textStrong: string;
  textSoft: string;
  textMuted: string;
  chip: string;
  chipAlt: string;
  chipSoft: string;
  panel: string;
  panelSoft: string;
  panelFrame: string;
};

type ThemePreset = {
  id: string;
  name: string;
  note: string;
  swatches: string[];
  vars: ThemeVars;
};

type Position = {
  x: number;
  y: number;
};

type ControlPanelTab = "play" | "settings" | "about";

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

const THEME_STORAGE_KEY = "zoplayspokemon.theme";
const CONTROLLER_POSITION_STORAGE_KEY = "zoplayspokemon.controllerPosition";
const CONTROLLER_MINIMIZED_STORAGE_KEY = "zoplayspokemon.controllerMinimized";
const ACTIVITY_POSITION_STORAGE_KEY = "zoplayspokemon.activityPosition";
const ACTIVITY_MINIMIZED_STORAGE_KEY = "zoplayspokemon.activityMinimized";
const REPO_URL = "https://github.com/EthanThatOneKid/zoplayspokemon";

function roomPlayerNameStorageKey(room: string): string {
  return `zoplayspokemon.playerName.${room}`;
}

const THEME_PRESETS: ThemePreset[] = [
  {
    id: "atomic-purple",
    name: "Atomic Purple",
    note: "The translucent classic.",
    swatches: ["#c9b5ff", "#8f73e6", "#d03030", "#8030a0"],
    vars: {
      pageTop: "#d4c4ff",
      pageBottom: "#9f88e5",
      shellPrimary: "#d5c7ff",
      shellSecondary: "#b6a5e9",
      shellAccent: "#efe7ff",
      shellDark: "#8570bd",
      shellWarm: "#d8b4c8",
      bezelDark: "#1f1831",
      bezelTeal: "#171428",
      bezelIndigo: "#0c0a16",
      bezelMuted: "#7563a4",
      lcdLight: "#dcecad",
      lcdMid: "#9ab06d",
      lcdDark: "#47604a",
      lcdVoid: "#1a2b21",
      buttonA: "#cf4251",
      buttonAShadow: "rgba(112, 33, 50, 0.55)",
      buttonB: "#7b45bf",
      buttonBShadow: "rgba(53, 24, 84, 0.55)",
      dpad: "#2b2738",
      dpadPressed: "#1a1823",
      dpadHighlight: "#4f4867",
      menuFill: "#cabce7",
      menuPressed: "#a595cf",
      success: "#4eb36b",
      error: "#c94742",
      warning: "#cb9832",
      textStrong: "#1f1831",
      textSoft: "#3f325b",
      textMuted: "#695987",
      chip: "#c5b6e7",
      chipAlt: "#dcccc0",
      chipSoft: "#ddd4ef",
      panel: "#cec0ef",
      panelSoft: "#e6dcf5",
      panelFrame: "#b4a2da",
    },
  },
  {
    id: "teal",
    name: "Teal",
    note: "Cool ocean plastic with darker trim.",
    swatches: ["#74c7be", "#3a8f88", "#d8404d", "#7a3ec1"],
    vars: {
      pageTop: "#9ed9d2",
      pageBottom: "#5ea6a0",
      shellPrimary: "#9ad4cb",
      shellSecondary: "#6db8ae",
      shellAccent: "#d9f3ef",
      shellDark: "#3b7f78",
      shellWarm: "#d5c4b0",
      bezelDark: "#102326",
      bezelTeal: "#081618",
      bezelIndigo: "#050d0e",
      bezelMuted: "#4f8882",
      lcdLight: "#dcecad",
      lcdMid: "#9ab06d",
      lcdDark: "#47604a",
      lcdVoid: "#1a2b21",
      buttonA: "#d8404d",
      buttonAShadow: "rgba(124, 30, 39, 0.55)",
      buttonB: "#7a3ec1",
      buttonBShadow: "rgba(57, 22, 88, 0.55)",
      dpad: "#173338",
      dpadPressed: "#0c1f23",
      dpadHighlight: "#356069",
      menuFill: "#a1cfc6",
      menuPressed: "#7db1a8",
      success: "#2f9d61",
      error: "#c63d34",
      warning: "#c58f1f",
      textStrong: "#102326",
      textSoft: "#29484a",
      textMuted: "#41696a",
      chip: "#98ccc4",
      chipAlt: "#c9dacf",
      chipSoft: "#cce6e1",
      panel: "#8fc8bf",
      panelSoft: "#d6eeea",
      panelFrame: "#73b2a9",
    },
  },
  {
    id: "berry",
    name: "Berry",
    note: "Deep magenta shell with soft gray highlights.",
    swatches: ["#d34f8a", "#8f2150", "#ef7474", "#5a2f92"],
    vars: {
      pageTop: "#e48ab1",
      pageBottom: "#b43c6f",
      shellPrimary: "#da6d9b",
      shellSecondary: "#b94c79",
      shellAccent: "#f5d4e1",
      shellDark: "#7c264b",
      shellWarm: "#dbb7ae",
      bezelDark: "#2b1320",
      bezelTeal: "#1b1017",
      bezelIndigo: "#10080d",
      bezelMuted: "#8f4e6d",
      lcdLight: "#dcecad",
      lcdMid: "#9ab06d",
      lcdDark: "#47604a",
      lcdVoid: "#1a2b21",
      buttonA: "#eb6a6c",
      buttonAShadow: "rgba(126, 37, 48, 0.55)",
      buttonB: "#62369c",
      buttonBShadow: "rgba(44, 20, 71, 0.55)",
      dpad: "#321723",
      dpadPressed: "#1d0d14",
      dpadHighlight: "#5c3146",
      menuFill: "#d69ab6",
      menuPressed: "#b66f91",
      success: "#46a363",
      error: "#ba342e",
      warning: "#ca8e28",
      textStrong: "#2b1320",
      textSoft: "#55263b",
      textMuted: "#7f4862",
      chip: "#cf8cab",
      chipAlt: "#e0c7bf",
      chipSoft: "#edd3df",
      panel: "#ce84a7",
      panelSoft: "#f3dbe6",
      panelFrame: "#b4698d",
    },
  },
  {
    id: "kiwi",
    name: "Kiwi",
    note: "Bright translucent green with a sharper contrast shell.",
    swatches: ["#9cd84c", "#4f8d1a", "#e3544f", "#8450c4"],
    vars: {
      pageTop: "#d3ec8e",
      pageBottom: "#9bcf4a",
      shellPrimary: "#bde46d",
      shellSecondary: "#94c84a",
      shellAccent: "#eef9cf",
      shellDark: "#658f28",
      shellWarm: "#d9c7a7",
      bezelDark: "#1f2e10",
      bezelTeal: "#16210b",
      bezelIndigo: "#0f1608",
      bezelMuted: "#7aa145",
      lcdLight: "#e5f3b8",
      lcdMid: "#a8c56f",
      lcdDark: "#587041",
      lcdVoid: "#21301a",
      buttonA: "#d9534f",
      buttonAShadow: "rgba(118, 34, 32, 0.55)",
      buttonB: "#8450c4",
      buttonBShadow: "rgba(58, 28, 89, 0.55)",
      dpad: "#27321b",
      dpadPressed: "#171e10",
      dpadHighlight: "#556845",
      menuFill: "#c7e296",
      menuPressed: "#a1c068",
      success: "#3b9b4e",
      error: "#c53a30",
      warning: "#ba8f1f",
      textStrong: "#1f2e10",
      textSoft: "#3b5320",
      textMuted: "#64873b",
      chip: "#c5e08b",
      chipAlt: "#e8efca",
      chipSoft: "#e6f4bf",
      panel: "#b7dc72",
      panelSoft: "#edf8cf",
      panelFrame: "#90bb49",
    },
  },
  {
    id: "dandelion",
    name: "Dandelion",
    note: "Warm yellow shell with bright toy-store energy.",
    swatches: ["#f0d05b", "#bb9422", "#d64745", "#7948b7"],
    vars: {
      pageTop: "#f8e59a",
      pageBottom: "#d2b143",
      shellPrimary: "#efd264",
      shellSecondary: "#d8b13e",
      shellAccent: "#fff7d1",
      shellDark: "#9c7a1d",
      shellWarm: "#e7b587",
      bezelDark: "#32270d",
      bezelTeal: "#241c09",
      bezelIndigo: "#171205",
      bezelMuted: "#b18d34",
      lcdLight: "#f3f1b2",
      lcdMid: "#c0b66a",
      lcdDark: "#72693e",
      lcdVoid: "#2a2415",
      buttonA: "#d64745",
      buttonAShadow: "rgba(117, 35, 35, 0.55)",
      buttonB: "#7948b7",
      buttonBShadow: "rgba(53, 27, 84, 0.55)",
      dpad: "#352d1d",
      dpadPressed: "#1d180e",
      dpadHighlight: "#62553c",
      menuFill: "#ecd37a",
      menuPressed: "#d0b55a",
      success: "#4d9e47",
      error: "#c83b31",
      warning: "#cb8f1f",
      textStrong: "#32270d",
      textSoft: "#5b4718",
      textMuted: "#876a21",
      chip: "#ebd57a",
      chipAlt: "#f4e5bb",
      chipSoft: "#f8edbf",
      panel: "#e8ca67",
      panelSoft: "#fff5d0",
      panelFrame: "#d3ab39",
    },
  },
  {
    id: "grape",
    name: "Grape",
    note: "Dense violet shell with colder metallic trim.",
    swatches: ["#8d70cb", "#563592", "#d94c57", "#ba85ff"],
    vars: {
      pageTop: "#b8a1ec",
      pageBottom: "#7a5ab5",
      shellPrimary: "#9d82d8",
      shellSecondary: "#785eb3",
      shellAccent: "#ebdfff",
      shellDark: "#50397d",
      shellWarm: "#d1b3d1",
      bezelDark: "#1e1632",
      bezelTeal: "#151024",
      bezelIndigo: "#0d0a17",
      bezelMuted: "#69539a",
      lcdLight: "#dcecad",
      lcdMid: "#9ab06d",
      lcdDark: "#47604a",
      lcdVoid: "#1a2b21",
      buttonA: "#d94c57",
      buttonAShadow: "rgba(118, 31, 42, 0.55)",
      buttonB: "#b07dff",
      buttonBShadow: "rgba(63, 34, 101, 0.55)",
      dpad: "#261d3a",
      dpadPressed: "#181224",
      dpadHighlight: "#4a3c69",
      menuFill: "#b89fde",
      menuPressed: "#977bbf",
      success: "#4aa168",
      error: "#c43c39",
      warning: "#c79728",
      textStrong: "#1e1632",
      textSoft: "#3d2f61",
      textMuted: "#66558c",
      chip: "#b79ddd",
      chipAlt: "#dccce9",
      chipSoft: "#e6dcf6",
      panel: "#a68dd8",
      panelSoft: "#eee6ff",
      panelFrame: "#7a60b3",
    },
  },
  {
    id: "clear",
    name: "Clear",
    note: "Glassier neutral shell that leans into the internals.",
    swatches: ["#d9e4e9", "#9db0bb", "#d64d4d", "#7b59b2"],
    vars: {
      pageTop: "#ecf2f5",
      pageBottom: "#c4d0d7",
      shellPrimary: "#e7eef2",
      shellSecondary: "#c7d4db",
      shellAccent: "#ffffff",
      shellDark: "#94a4af",
      shellWarm: "#d9c9c0",
      bezelDark: "#1c2327",
      bezelTeal: "#151a1d",
      bezelIndigo: "#0d1012",
      bezelMuted: "#7d929c",
      lcdLight: "#edf2c6",
      lcdMid: "#afb47d",
      lcdDark: "#5f684a",
      lcdVoid: "#23291e",
      buttonA: "#d64d4d",
      buttonAShadow: "rgba(116, 35, 35, 0.55)",
      buttonB: "#7b59b2",
      buttonBShadow: "rgba(57, 35, 84, 0.55)",
      dpad: "#31383d",
      dpadPressed: "#1d2124",
      dpadHighlight: "#59636a",
      menuFill: "#dbe4e8",
      menuPressed: "#b8c5cb",
      success: "#4ba068",
      error: "#c5403d",
      warning: "#be922a",
      textStrong: "#1c2327",
      textSoft: "#3f4a50",
      textMuted: "#67757e",
      chip: "#d3dde2",
      chipAlt: "#e9dddd",
      chipSoft: "#eff4f6",
      panel: "#d8e2e7",
      panelSoft: "#f8fbfc",
      panelFrame: "#bccad1",
    },
  },
];

const BUTTON_LOOKUP = Object.fromEntries(BUTTONS.map((button) => [button.code, button])) as Record<string, ButtonDef>;
const THEME_LOOKUP = Object.fromEntries(THEME_PRESETS.map((theme) => [theme.id, theme])) as Record<string, ThemePreset>;

const PAGE_STYLES = `
  @import url("https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap");

  .zp-root {
    background:
      radial-gradient(circle at top, rgba(255, 255, 255, 0.14), transparent 28%),
      linear-gradient(180deg, var(--page-top), var(--page-bottom));
    color: var(--text-strong);
    font-family: "VT323", monospace;
    letter-spacing: 0.02em;
  }

  .zp-root::before {
    content: "";
    position: fixed;
    inset: 0;
    pointer-events: none;
    opacity: 0.1;
    background-image:
      linear-gradient(rgba(255, 255, 255, 0.24) 1px, transparent 1px),
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
      12px 0 0 color-mix(in srgb, var(--success) 35%, transparent),
      0 12px 0 color-mix(in srgb, var(--success) 35%, transparent),
      12px 12px 0 color-mix(in srgb, var(--success) 16%, transparent);
    animation: zp-spin 0.7s steps(4) infinite;
  }

  .zp-toast {
    animation: zp-toast-in 180ms ease-out;
  }

  .zp-frame-glow {
    box-shadow:
      inset 0 0 0 2px rgba(255, 255, 255, 0.12),
      0 20px 30px rgba(0, 0, 0, 0.18);
  }

  .zp-swatch {
    box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
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

function pickRandomThemeId(currentId?: string): string {
  const pool = currentId ? THEME_PRESETS.filter((theme) => theme.id !== currentId) : THEME_PRESETS;
  const source = pool.length > 0 ? pool : THEME_PRESETS;
  return source[Math.floor(Math.random() * source.length)]?.id || THEME_PRESETS[0].id;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getEstimatedControllerSize(minimized: boolean): { height: number; width: number } {
  return minimized ? { width: 236, height: 72 } : { width: 392, height: 560 };
}

function getEstimatedActivitySize(minimized: boolean): { height: number; width: number } {
  return minimized ? { width: 250, height: 72 } : { width: 352, height: 420 };
}

function getDefaultControllerPosition(minimized: boolean): Position {
  const { width, height } = getEstimatedControllerSize(minimized);
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 12;
  const desiredX = viewportWidth < 640 ? (viewportWidth - width) / 2 : viewportWidth - width - 20;
  const desiredY = viewportHeight - height - 20;
  return {
    x: clamp(desiredX, margin, Math.max(margin, viewportWidth - width - margin)),
    y: clamp(desiredY, margin, Math.max(margin, viewportHeight - height - margin)),
  };
}

function getDefaultActivityPosition(minimized: boolean): Position {
  const { width, height } = getEstimatedActivitySize(minimized);
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 12;
  const desiredX = viewportWidth < 640 ? (viewportWidth - width) / 2 : 20;
  const desiredY = viewportHeight - height - 28;
  return {
    x: clamp(desiredX, margin, Math.max(margin, viewportWidth - width - margin)),
    y: clamp(desiredY, margin, Math.max(margin, viewportHeight - height - margin)),
  };
}

function clampPanelPosition(position: Position, width: number, height: number): Position {
  const margin = 12;
  return {
    x: clamp(position.x, margin, Math.max(margin, window.innerWidth - width - margin)),
    y: clamp(position.y, margin, Math.max(margin, window.innerHeight - height - margin)),
  };
}

function buildThemeStyle(theme: ThemePreset): CSSProperties {
  return {
    "--page-top": theme.vars.pageTop,
    "--page-bottom": theme.vars.pageBottom,
    "--shell-primary": theme.vars.shellPrimary,
    "--shell-secondary": theme.vars.shellSecondary,
    "--shell-accent": theme.vars.shellAccent,
    "--shell-dark": theme.vars.shellDark,
    "--shell-warm": theme.vars.shellWarm,
    "--bezel-dark": theme.vars.bezelDark,
    "--bezel-teal": theme.vars.bezelTeal,
    "--bezel-indigo": theme.vars.bezelIndigo,
    "--bezel-muted": theme.vars.bezelMuted,
    "--lcd-light": theme.vars.lcdLight,
    "--lcd-mid": theme.vars.lcdMid,
    "--lcd-dark": theme.vars.lcdDark,
    "--lcd-void": theme.vars.lcdVoid,
    "--button-a": theme.vars.buttonA,
    "--button-a-shadow": theme.vars.buttonAShadow,
    "--button-b": theme.vars.buttonB,
    "--button-b-shadow": theme.vars.buttonBShadow,
    "--dpad": theme.vars.dpad,
    "--dpad-pressed": theme.vars.dpadPressed,
    "--dpad-highlight": theme.vars.dpadHighlight,
    "--menu-fill": theme.vars.menuFill,
    "--menu-pressed": theme.vars.menuPressed,
    "--success": theme.vars.success,
    "--error": theme.vars.error,
    "--warning": theme.vars.warning,
    "--text-strong": theme.vars.textStrong,
    "--text-soft": theme.vars.textSoft,
    "--text-muted": theme.vars.textMuted,
    "--chip": theme.vars.chip,
    "--chip-alt": theme.vars.chipAlt,
    "--chip-soft": theme.vars.chipSoft,
    "--panel": theme.vars.panel,
    "--panel-soft": theme.vars.panelSoft,
    "--panel-frame": theme.vars.panelFrame,
  } as CSSProperties;
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
        background: active ? "var(--dpad-pressed)" : "var(--dpad)",
        boxShadow: active
          ? "inset 3px 3px 0 rgba(0,0,0,0.45), inset -2px -2px 0 rgba(255,255,255,0.08)"
          : "inset 3px 3px 0 var(--dpad-highlight), inset -3px -3px 0 rgba(0,0,0,0.55), 0 5px 0 rgba(0,0,0,0.25)",
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
  const background = button.code === "4" ? "var(--button-a)" : "var(--button-b)";
  const shadow = button.code === "4" ? "var(--button-a-shadow)" : "var(--button-b-shadow)";
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
      className="rounded-full px-5 py-2 text-[10px] transition disabled:cursor-wait disabled:opacity-70"
      style={{
        touchAction: "none",
        color: "var(--text-strong)",
        background: active ? "var(--menu-pressed)" : "var(--menu-fill)",
        boxShadow: active
          ? "inset 2px 2px 0 rgba(0,0,0,0.18), inset -2px -2px 0 rgba(255,255,255,0.22)"
          : "inset 2px 2px 0 rgba(255,255,255,0.5), inset -2px -2px 0 rgba(0,0,0,0.14), 0 4px 0 rgba(0,0,0,0.18)",
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
  const [hasFrame, setHasFrame] = useState(false);
  const [themeId, setThemeId] = useState(THEME_PRESETS[0].id);
  const [themeReady, setThemeReady] = useState(false);
  const [controllerMinimized, setControllerMinimized] = useState(false);
  const [controllerPosition, setControllerPosition] = useState<Position | null>(null);
  const [activityMinimized, setActivityMinimized] = useState(false);
  const [activityPosition, setActivityPosition] = useState<Position | null>(null);
  const [panelTab, setPanelTab] = useState<ControlPanelTab>("play");
  const [playerName, setPlayerName] = useState("guest");
  const [draggingController, setDraggingController] = useState(false);
  const [draggingActivity, setDraggingActivity] = useState(false);
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
  const hasFrameRef = useRef(false);
  const controllerRef = useRef<HTMLDivElement | null>(null);
  const activityRef = useRef<HTMLDivElement | null>(null);
  const controllerDragStateRef = useRef<{ offsetX: number; offsetY: number; pointerId: number } | null>(null);
  const activityDragStateRef = useRef<{ offsetX: number; offsetY: number; pointerId: number } | null>(null);

  const currentTheme = THEME_LOOKUP[themeId] || THEME_PRESETS[0];
  const rootStyle = useMemo(() => buildThemeStyle(currentTheme), [currentTheme]);
  const visibleQueueCount = Math.max(queueCount, queueDepth);
  const controlsDisabled = visibleQueueCount > 0 || panelTab !== "play";

  const measureController = (minimized: boolean) => {
    const rect = controllerRef.current?.getBoundingClientRect();
    if (rect?.width && rect?.height) {
      return { height: rect.height, width: rect.width };
    }
    return getEstimatedControllerSize(minimized);
  };

  const normalizeControllerPosition = (nextPosition: Position | null, minimized: boolean) => {
    const basePosition = nextPosition || getDefaultControllerPosition(minimized);
    const { width, height } = measureController(minimized);
    return clampPanelPosition(basePosition, width, height);
  };

  const measureActivity = (minimized: boolean) => {
    const rect = activityRef.current?.getBoundingClientRect();
    if (rect?.width && rect?.height) {
      return { height: rect.height, width: rect.width };
    }
    return getEstimatedActivitySize(minimized);
  };

  const normalizeActivityPosition = (nextPosition: Position | null, minimized: boolean) => {
    const basePosition = nextPosition || getDefaultActivityPosition(minimized);
    const { width, height } = measureActivity(minimized);
    return clampPanelPosition(basePosition, width, height);
  };

  const refreshFrame = async (force = false) => {
    if (frameLoadingRef.current && !force) return;
    if (!hasFrameRef.current && !force && frameVersionRef.current === 0) return;
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
       hasFrameRef.current = true;
       setHasFrame(true);
       clearPendingInput();
     } catch {
       if (frameFetchIdRef.current !== requestId) return;
       frameLoadingRef.current = false;
       setFrameLoading(false);
       clearPendingInput();
       if (!hasFrameRef.current) return;
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
        body: JSON.stringify({ room, button: code, action, user: playerName.trim() || "guest" }),
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

  const beginControllerDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!controllerRef.current) return;
    const rect = controllerRef.current.getBoundingClientRect();
    controllerDragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setDraggingController(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  };

  const beginActivityDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!activityRef.current) return;
    const rect = activityRef.current.getBoundingClientRect();
    activityDragStateRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    setDraggingActivity(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
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
      hasFrameRef.current = true;
      setHasFrame(true);
      refreshFrame();
    }
  };

  const randomizeTheme = () => {
    setThemeId((current) => pickRandomThemeId(current));
  };

  const resetControllerPosition = () => {
    setControllerPosition(normalizeControllerPosition(getDefaultControllerPosition(controllerMinimized), controllerMinimized));
  };

  useEffect(() => {
    frameLoadingRef.current = frameLoading;
  }, [frameLoading]);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  useEffect(() => {
    const storedThemeId = window.localStorage.getItem(THEME_STORAGE_KEY);
    const nextThemeId = storedThemeId && THEME_LOOKUP[storedThemeId] ? storedThemeId : pickRandomThemeId();
    if (!storedThemeId || !THEME_LOOKUP[storedThemeId]) {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextThemeId);
    }
    setThemeId(nextThemeId);

    const minimized = window.localStorage.getItem(CONTROLLER_MINIMIZED_STORAGE_KEY) === "true";
    setControllerMinimized(minimized);

    const storedPosition = window.localStorage.getItem(CONTROLLER_POSITION_STORAGE_KEY);
    if (storedPosition) {
      try {
        const parsed = JSON.parse(storedPosition) as Position;
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setControllerPosition(parsed);
        } else {
          setControllerPosition(getDefaultControllerPosition(minimized));
        }
      } catch {
        setControllerPosition(getDefaultControllerPosition(minimized));
      }
    } else {
      setControllerPosition(getDefaultControllerPosition(minimized));
    }

    const activityMinimizedStored = window.localStorage.getItem(ACTIVITY_MINIMIZED_STORAGE_KEY) === "true";
    setActivityMinimized(activityMinimizedStored);

    const storedActivityPosition = window.localStorage.getItem(ACTIVITY_POSITION_STORAGE_KEY);
    if (storedActivityPosition) {
      try {
        const parsed = JSON.parse(storedActivityPosition) as Position;
        if (typeof parsed.x === "number" && typeof parsed.y === "number") {
          setActivityPosition(parsed);
        } else {
          setActivityPosition(getDefaultActivityPosition(activityMinimizedStored));
        }
      } catch {
        setActivityPosition(getDefaultActivityPosition(activityMinimizedStored));
      }
    } else {
      setActivityPosition(getDefaultActivityPosition(activityMinimizedStored));
    }

    setThemeReady(true);
  }, []);

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
    if (!themeReady) return;
    window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
  }, [themeId, themeReady]);

  useEffect(() => {
    const storedName = window.localStorage.getItem(roomPlayerNameStorageKey(room));
    setPlayerName((storedName || "guest").slice(0, 24));
  }, [room]);

  useEffect(() => {
    if (!playerName) return;
    window.localStorage.setItem(roomPlayerNameStorageKey(room), playerName);
  }, [playerName, room]);

  useEffect(() => {
    if (!themeReady) return;
    window.localStorage.setItem(CONTROLLER_MINIMIZED_STORAGE_KEY, controllerMinimized ? "true" : "false");
    const timer = window.setTimeout(() => {
      setControllerPosition((current) => normalizeControllerPosition(current, controllerMinimized));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [controllerMinimized, themeReady]);

  useEffect(() => {
    if (!themeReady || !controllerPosition) return;
    window.localStorage.setItem(CONTROLLER_POSITION_STORAGE_KEY, JSON.stringify(controllerPosition));
  }, [controllerPosition, themeReady]);

  useEffect(() => {
    if (!themeReady) return;
    window.localStorage.setItem(ACTIVITY_MINIMIZED_STORAGE_KEY, activityMinimized ? "true" : "false");
    const timer = window.setTimeout(() => {
      setActivityPosition((current) => normalizeActivityPosition(current, activityMinimized));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activityMinimized, themeReady]);

  useEffect(() => {
    if (!themeReady || !activityPosition) return;
    window.localStorage.setItem(ACTIVITY_POSITION_STORAGE_KEY, JSON.stringify(activityPosition));
  }, [activityPosition, themeReady]);

  useEffect(() => {
    if (!themeReady) return;

    const onResize = () => {
      setControllerPosition((current) => normalizeControllerPosition(current, controllerMinimized));
      setActivityPosition((current) => normalizeActivityPosition(current, activityMinimized));
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activityMinimized, controllerMinimized, themeReady]);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const controllerDragState = controllerDragStateRef.current;
      if (controllerDragState?.pointerId === event.pointerId) {
        const nextPosition = {
          x: event.clientX - controllerDragState.offsetX,
          y: event.clientY - controllerDragState.offsetY,
        };
        setControllerPosition(normalizeControllerPosition(nextPosition, controllerMinimized));
      }

      const activityDragState = activityDragStateRef.current;
      if (activityDragState?.pointerId === event.pointerId) {
        const nextPosition = {
          x: event.clientX - activityDragState.offsetX,
          y: event.clientY - activityDragState.offsetY,
        };
        setActivityPosition(normalizeActivityPosition(nextPosition, activityMinimized));
      }
    };

    const onPointerEnd = (event: PointerEvent) => {
      if (controllerDragStateRef.current?.pointerId === event.pointerId) {
        controllerDragStateRef.current = null;
        setDraggingController(false);
      }
      if (activityDragStateRef.current?.pointerId === event.pointerId) {
        activityDragStateRef.current = null;
        setDraggingActivity(false);
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerEnd);
    window.addEventListener("pointercancel", onPointerEnd);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
    };
  }, [activityMinimized, controllerMinimized]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(""), 3000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (panelTab !== "play" || !keyboardEnabled) return;
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
  }, [keyboardEnabled, panelTab, room]);

  useEffect(() => {
    burstPollIdRef.current += 1;
    frameVersionRef.current = 0;
    inputVersionRef.current = 0;
    lastFrameAtRef.current = 0;
    frameHashRef.current = "";
    frameEtagRef.current = null;
    frameFetchIdRef.current += 1;
    updatedAtRef.current = Date.now();
    hasFrameRef.current = false;
    setHasFrame(false);
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
    setPanelTab("play");
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
  const isDraggingController = draggingController;
  const actionButtons = BUTTONS.filter((button) => button.kind === "action");
  const menuButtons = BUTTONS.filter((button) => button.kind === "menu");
  const showFrameLoadingOverlay = frameLoading && (!frameSrc || visibleQueueCount > 0);

  return (
    <div className="zp-root min-h-screen" style={rootStyle}>
      <style>{PAGE_STYLES}</style>
      <div className="relative mx-auto flex min-h-screen max-w-[600px] flex-col px-4 py-6 pb-24">
        <div
          className="mb-4 rounded-[22px] border border-black/10 px-4 py-4 shadow-[0_14px_30px_rgba(0,0,0,0.16)]"
          style={{ background: "var(--shell-primary)" }}
        >
          <div>
              <p className="zp-font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                DOCUMENTED LIVE CASE STUDY
              </p>
              <h1 className="zp-font-mono mt-3 text-lg leading-6" style={{ color: "var(--text-strong)" }}>
                #ZOPLAYSPOKEMON
              </h1>
              <p className="mt-3 text-[18px] leading-5" style={{ color: "var(--text-soft)" }}>
                This page documents a live, shared Pokemon emulator experiment running on Zo infrastructure.
              </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-[14px] leading-4" style={{ color: "var(--text-soft)" }}>
            <span className="rounded-full px-3 py-1" style={{ background: "var(--chip)" }}>
              ROOM <span className="zp-font-mono ml-2 text-[10px]">{room}</span>
            </span>
            <span className="rounded-full px-3 py-1" style={{ background: "var(--chip-soft)" }}>
              RECENT {recentLabel}
            </span>
            <span className="rounded-full px-3 py-1" style={{ background: "var(--chip-soft)" }}>
              FRAME {frameVersion} · {lastFrameAt ? new Date(lastFrameAt).toLocaleTimeString() : "waiting"}
            </span>
          </div>
        </div>

        <div
          className="rounded-[28px] border border-black/10 px-4 py-5 shadow-[0_18px_38px_rgba(0,0,0,0.18)]"
          style={{ background: "var(--panel-frame)" }}
        >
          <div className="zp-frame-glow rounded-[26px] border border-black/20 p-3" style={{ background: "var(--panel)" }}>
            <div className="rounded-[22px] border px-3 pb-4 pt-3" style={{ borderColor: "var(--shell-dark)", background: "var(--bezel-dark)" }}>
              <div className="mb-2 flex items-center justify-between gap-2 text-[11px]" style={{ color: "var(--shell-accent)" }}>
                <span className="zp-font-mono">LIVE CASE-STUDY FEED</span>
                <span className="zp-font-mono">{visibleQueueCount > 0 ? "SYNCING OBSERVED INPUT" : "LIVE DOCUMENTATION"}</span>
              </div>
              <div
                className="relative aspect-[10/9] overflow-hidden rounded-[16px] border"
                style={{ borderColor: "var(--bezel-muted)", background: "var(--lcd-void)" }}
              >
                <img
                  src={frameSrc}
                  alt="Shared game screen"
                  loading="eager"
                  className="block h-full w-full"
                  style={{ background: "var(--lcd-void)", imageRendering: "pixelated" }}
                />
                {showFrameLoadingOverlay ? (
                  <div className="pointer-events-none absolute inset-0 flex items-end justify-start bg-transparent p-3 text-[12px]" style={{ color: "var(--shell-accent)" }}>
                    <span className="zp-font-mono">{frameSrc ? "SYNCING FRAME..." : "LOADING FRAME..."}</span>
                  </div>
                ) : null}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-[13px] leading-4" style={{ color: "var(--shell-accent)" }}>
                <span>
                  {visibleQueueCount > 0
                    ? "Input observed. Waiting for the next documented frame."
                    : "This surface demonstrates shared remote input behavior on a live Pokemon session."}
                </span>
                {visibleQueueCount > 0 ? (
                  <span
                    className="flex items-center gap-2 rounded-full border px-3 py-1"
                    style={{ borderColor: "color-mix(in srgb, var(--success) 70%, black)", background: "color-mix(in srgb, var(--success) 25%, black)", color: "#eaffea" }}
                  >
                    <span className="zp-spinner" aria-hidden="true" />
                    <span className="zp-font-mono text-[9px]">QUEUED: {visibleQueueCount}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </div>

        {controllerPosition ? (
          <div
            ref={controllerRef}
            className="fixed z-40"
            style={{
              left: controllerPosition.x,
              top: controllerPosition.y,
              maxWidth: "calc(100vw - 24px)",
              width: controllerMinimized ? "236px" : "392px",
            }}
          >
            {controllerMinimized ? (
              <div
                className="flex items-center gap-2 rounded-[22px] border border-black/10 px-3 py-3 shadow-[0_14px_30px_rgba(0,0,0,0.24)]"
                style={{ background: "var(--shell-primary)" }}
              >
                <button
                  type="button"
                  onPointerDown={beginControllerDrag}
                  className="rounded-full px-3 py-2 transition"
                  style={{
                    touchAction: "none",
                    cursor: isDraggingController ? "grabbing" : "grab",
                    background: "var(--chip)",
                    color: "var(--text-strong)",
                  }}
                >
                  <span className="zp-font-mono text-[9px]">MOVE</span>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                    CONTROLS PARKED
                  </div>
                  <div className="truncate text-[15px]" style={{ color: "var(--text-strong)" }}>
                    {currentTheme.name}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setControllerMinimized(false)}
                  className="rounded-full px-3 py-2 transition"
                  style={{ background: "var(--shell-warm)", color: "var(--text-strong)" }}
                >
                  <span className="zp-font-mono text-[9px]">OPEN</span>
                </button>
              </div>
            ) : (
              <div
                className="rounded-[26px] border border-black/10 px-4 py-4 shadow-[0_20px_40px_rgba(0,0,0,0.28)]"
                style={{ background: "var(--shell-primary)" }}
              >
                <div
                  className="flex items-start justify-between gap-3 rounded-[18px] px-3 py-3"
                  onPointerDown={beginControllerDrag}
                  style={{
                    touchAction: "none",
                    cursor: isDraggingController ? "grabbing" : "grab",
                    background: "var(--chip-soft)",
                  }}
                >
                  <div>
                    <div className="zp-font-mono text-[10px]" style={{ color: "var(--text-soft)" }}>
                      CONTROLLER
                    </div>
                    <p className="mt-1 text-[15px] leading-4" style={{ color: "var(--text-muted)" }}>
                      {panelTab === "play"
                        ? "Drag the deck wherever it fits your screen."
                        : "Settings and docs pause button input until you return to Play."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={resetControllerPosition}
                      onPointerDown={(event) => event.stopPropagation()}
                      className="rounded-full px-3 py-2 transition"
                      style={{ background: "var(--chip-soft)", color: "var(--text-strong)" }}
                    >
                      <span className="zp-font-mono text-[9px]">RESET</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setControllerMinimized(true)}
                      onPointerDown={(event) => event.stopPropagation()}
                      className="rounded-full px-3 py-2 transition"
                      style={{ background: "var(--shell-warm)", color: "var(--text-strong)" }}
                    >
                      <span className="zp-font-mono text-[9px]">MIN</span>
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="rounded-full px-3 py-1 text-[14px] leading-4" style={{ background: "var(--chip-soft)", color: "var(--text-soft)" }}>
                    {currentTheme.name} · {room}
                  </div>
                  <div className="flex items-center gap-2">
                    {(["play", "settings", "about"] as ControlPanelTab[]).map((tab) => {
                      const active = panelTab === tab;
                      return (
                        <button
                          key={tab}
                          type="button"
                          onClick={() => setPanelTab(tab)}
                          className="rounded-full px-3 py-2 transition"
                          style={{
                            background: active ? "var(--shell-warm)" : "var(--chip-soft)",
                            color: "var(--text-strong)",
                            boxShadow: active
                              ? "inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.14)"
                              : "inset 2px 2px 0 rgba(255,255,255,0.22), inset -2px -2px 0 rgba(0,0,0,0.08)",
                          }}
                        >
                          <span className="zp-font-mono text-[9px]">{tab.toUpperCase()}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {panelTab === "play" ? (
                  <>
                    <div className="mt-4 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => tap("7")}
                        disabled={controlsDisabled}
                        className="rounded-full px-4 py-2 transition disabled:cursor-wait disabled:opacity-70"
                        style={{
                          background: "var(--shell-warm)",
                          color: "var(--text-strong)",
                          boxShadow: controlsDisabled
                            ? "inset 2px 2px 0 rgba(0,0,0,0.12)"
                            : "inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.14), 0 4px 0 rgba(0,0,0,0.18)",
                        }}
                      >
                        <span className="zp-font-mono text-[10px]">SEND START INPUT</span>
                      </button>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-4">
                      <div className="grid grid-cols-3 gap-2 rounded-[22px] p-3" style={{ background: "var(--shell-secondary)" }}>
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
                        <div className="rounded-[10px]" style={{ background: "var(--shell-dark)" }} />
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

                    <div className="mt-4 grid gap-2 text-[14px] leading-4 sm:grid-cols-2" style={{ color: "var(--text-soft)" }}>
                      {BUTTONS.map((button) => (
                        <div key={button.code} className="rounded-[14px] px-3 py-2" style={{ background: "var(--chip-soft)" }}>
                          <span className="zp-font-mono text-[9px]" style={{ color: "var(--text-strong)" }}>
                            {button.label}
                          </span>
                          <span className="ml-2">{button.hint}</span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}

                {panelTab === "settings" ? (
                  <div className="mt-5 space-y-3 text-[15px] leading-4">
                    <div className="rounded-[18px] px-4 py-4" style={{ background: "var(--chip-soft)", color: "var(--text-soft)" }}>
                      Button inputs are paused while you change controller settings.
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        aria-pressed={keyboardEnabled}
                        onClick={() => setKeyboardEnabled((current) => !current)}
                        className="rounded-[18px] px-4 py-4 text-left transition"
                        style={{
                          background: keyboardEnabled ? "var(--chip-alt)" : "var(--chip-soft)",
                          boxShadow: keyboardEnabled
                            ? "inset 2px 2px 0 rgba(255,255,255,0.45), inset -2px -2px 0 rgba(140,48,40,0.22)"
                            : "inset 2px 2px 0 rgba(255,255,255,0.35), inset -2px -2px 0 rgba(0,0,0,0.12)",
                        }}
                        title="Opt in if you want keyboard controls."
                      >
                        <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                          KEYBOARD: {keyboardEnabled ? "ON" : "OFF"}
                        </div>
                        <div className="mt-2 text-[17px]" style={{ color: "var(--text-strong)" }}>
                          {keyboardEnabled ? "Keyboard play is armed." : "Keyboard play is blocked."}
                        </div>
                        <div className="mt-2" style={{ color: "var(--text-muted)" }}>
                          Opt in to avoid accidental inputs while browsing.
                        </div>
                      </button>

                      <div className="rounded-[18px] px-4 py-4" style={{ background: "var(--chip-soft)" }}>
                        <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                          CONTROLLER POSITION
                        </div>
                        <div className="mt-2 text-[17px]" style={{ color: "var(--text-strong)" }}>
                          Keep the controller out of the screen area.
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={resetControllerPosition}
                            className="rounded-full px-3 py-2 transition"
                            style={{ background: "var(--shell-warm)", color: "var(--text-strong)" }}
                          >
                            <span className="zp-font-mono text-[9px]">RESET POSITION</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setControllerMinimized(true)}
                            className="rounded-full px-3 py-2 transition"
                            style={{ background: "var(--chip)", color: "var(--text-strong)" }}
                          >
                            <span className="zp-font-mono text-[9px]">MINIMIZE</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[18px] px-4 py-4" style={{ background: "var(--chip-soft)" }}>
                        <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                          ROOM NICKNAME
                        </div>
                        <label className="mt-3 block">
                          <span className="text-[16px]" style={{ color: "var(--text-strong)" }}>
                            Visible in room {room}.
                          </span>
                          <input
                            type="text"
                            value={playerName}
                            onChange={(event) => setPlayerName(event.target.value.slice(0, 24))}
                            placeholder="guest"
                            className="mt-3 w-full rounded-[14px] border px-3 py-3 text-[17px] outline-none"
                            style={{
                              borderColor: "rgba(0,0,0,0.1)",
                              background: "rgba(255,255,255,0.6)",
                              color: "var(--text-strong)",
                            }}
                          />
                        </label>
                        <p className="mt-2 text-[14px]" style={{ color: "var(--text-muted)" }}>
                          Saved in this browser for this room only.
                        </p>
                      </div>

                      <div className="rounded-[18px] px-4 py-4" style={{ background: "var(--chip-soft)" }}>
                        <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                          LIVE ACTIVITY WINDOW
                        </div>
                        <div className="mt-2 text-[17px]" style={{ color: "var(--text-strong)" }}>
                          Move or hide the activity feed separately from the controller.
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setActivityPosition(normalizeActivityPosition(getDefaultActivityPosition(activityMinimized), activityMinimized))}
                            className="rounded-full px-3 py-2 transition"
                            style={{ background: "var(--shell-warm)", color: "var(--text-strong)" }}
                          >
                            <span className="zp-font-mono text-[9px]">RESET WINDOW</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setActivityMinimized((current) => !current)}
                            className="rounded-full px-3 py-2 transition"
                            style={{ background: "var(--chip)", color: "var(--text-strong)" }}
                          >
                            <span className="zp-font-mono text-[9px]">{activityMinimized ? "OPEN" : "MINIMIZE"}</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[18px] px-4 py-4" style={{ background: "var(--chip-soft)" }}>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                            THEME
                          </div>
                          <div className="mt-2 text-[17px]" style={{ color: "var(--text-strong)" }}>
                            {currentTheme.name}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={randomizeTheme}
                          className="rounded-full px-3 py-2 transition"
                          style={{ background: "var(--shell-warm)", color: "var(--text-strong)" }}
                        >
                          <span className="zp-font-mono text-[9px]">RANDOMIZE</span>
                        </button>
                      </div>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {THEME_PRESETS.map((theme) => {
                          const selected = theme.id === themeId;
                          return (
                            <button
                              key={theme.id}
                              type="button"
                              onClick={() => setThemeId(theme.id)}
                              className="rounded-[16px] border px-3 py-3 text-left transition"
                              style={{
                                borderColor: selected ? "var(--text-strong)" : "rgba(0,0,0,0.08)",
                                background: selected ? "var(--panel-soft)" : "rgba(255,255,255,0.18)",
                                boxShadow: selected ? "0 0 0 2px rgba(0,0,0,0.08) inset" : "none",
                              }}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                                    {selected ? "ACTIVE" : "RETAIL"}
                                  </div>
                                  <div className="mt-2 text-[16px]" style={{ color: "var(--text-strong)" }}>
                                    {theme.name}
                                  </div>
                                </div>
                                <div className="flex gap-1">
                                  {theme.swatches.map((swatch) => (
                                    <span
                                      key={swatch}
                                      className="zp-swatch block h-4 w-4 rounded-full"
                                      style={{ background: swatch }}
                                    />
                                  ))}
                                </div>
                              </div>
                              <p className="mt-2 text-[14px]" style={{ color: "var(--text-muted)" }}>
                                {theme.note}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ) : null}

                {panelTab === "about" ? (
                  <div className="mt-5 space-y-3 text-[15px] leading-4">
                    <div className="rounded-[18px] px-4 py-4" style={{ background: "var(--chip-soft)" }}>
                      <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                        ABOUT THIS ROOM
                      </div>
                      <p className="mt-2 text-[17px]" style={{ color: "var(--text-strong)" }}>
                        This route records a real shared Pokemon Crystal session and exposes the coordination model, frame timing, and interface behavior as a public case study.
                      </p>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[18px] px-4 py-4" style={{ background: "var(--chip-soft)" }}>
                        <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                          ROOM MODEL
                        </div>
                        <p className="mt-2" style={{ color: "var(--text-strong)" }}>
                          The room model exists to document how isolated shared sessions were handled in the live system. Public copy should describe that architecture without treating it as a replication guide.
                        </p>
                      </div>
                      <div className="rounded-[18px] px-4 py-4" style={{ background: "var(--chip-soft)" }}>
                        <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                          INPUT + FRAME SYNC
                        </div>
                        <p className="mt-2" style={{ color: "var(--text-strong)" }}>
                          The page long-polls room state, tracks frame versions and hashes, and refreshes the PNG only when a newer frame is ready.
                        </p>
                      </div>
                      <div className="rounded-[18px] px-4 py-4" style={{ background: "var(--chip-soft)" }}>
                        <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                          CUSTOMIZATION
                        </div>
                        <p className="mt-2" style={{ color: "var(--text-strong)" }}>
                          Theme presets, keyboard opt-in, and the floating draggable controller are all saved in your browser.
                        </p>
                      </div>
                      <div className="rounded-[18px] px-4 py-4" style={{ background: "var(--chip-soft)" }}>
                        <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                          BACKEND
                        </div>
                        <p className="mt-2" style={{ color: "var(--text-strong)" }}>
                          A hosted PyBoy service runs the emulator, while Zo Space serves the controller UI and API routes that proxy room state, input, and frames.
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[18px] px-4 py-4" style={{ background: "var(--chip-soft)" }}>
                      <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                        SOURCE
                      </div>
                      <a
                        href={REPO_URL}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex rounded-full px-4 py-2 transition"
                        style={{ background: "var(--shell-warm)", color: "var(--text-strong)" }}
                      >
                        <span className="zp-font-mono text-[9px]">OPEN GITHUB REPO</span>
                      </a>
                      <p className="mt-3" style={{ color: "var(--text-muted)" }}>
                        Mirror repo for the live Zo Space routes and emulator service source, kept as evidence and analysis rather than a starter kit.
                      </p>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        ) : null}

        {activityPosition ? (
          <div
            ref={activityRef}
            className="fixed z-30"
            style={{
              left: activityPosition.x,
              top: activityPosition.y,
              maxWidth: "calc(100vw - 24px)",
              width: activityMinimized ? "250px" : "352px",
            }}
          >
            {activityMinimized ? (
              <div
                className="flex items-center gap-2 rounded-[22px] border border-black/10 px-3 py-3 shadow-[0_14px_30px_rgba(0,0,0,0.24)]"
                style={{ background: "var(--shell-primary)" }}
              >
                <button
                  type="button"
                  onPointerDown={beginActivityDrag}
                  className="rounded-full px-3 py-2 transition"
                  style={{
                    touchAction: "none",
                    cursor: draggingActivity ? "grabbing" : "grab",
                    background: "var(--chip)",
                    color: "var(--text-strong)",
                  }}
                >
                  <span className="zp-font-mono text-[9px]">MOVE</span>
                </button>
                <div className="min-w-0 flex-1">
                  <div className="zp-font-mono text-[9px]" style={{ color: "var(--text-soft)" }}>
                    LIVE ACTIVITY
                  </div>
                  <div className="truncate text-[15px]" style={{ color: "var(--text-strong)" }}>
                    Input {inputVersion} · {events.length} events
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setActivityMinimized(false)}
                  className="rounded-full px-3 py-2 transition"
                  style={{ background: "var(--shell-warm)", color: "var(--text-strong)" }}
                >
                  <span className="zp-font-mono text-[9px]">OPEN</span>
                </button>
              </div>
            ) : (
              <div
                className="rounded-[26px] border border-black/10 px-4 py-4 shadow-[0_20px_40px_rgba(0,0,0,0.28)]"
                style={{ background: "var(--shell-primary)" }}
              >
                <div
                  className="flex items-start justify-between gap-3 rounded-[18px] px-3 py-3"
                  onPointerDown={beginActivityDrag}
                  style={{
                    touchAction: "none",
                    cursor: draggingActivity ? "grabbing" : "grab",
                    background: "var(--chip-soft)",
                  }}
                >
                  <div>
                    <div className="zp-font-mono text-[10px]" style={{ color: "var(--text-soft)" }}>
                      LIVE ACTIVITY
                    </div>
                    <p className="mt-1 text-[15px] leading-4" style={{ color: "var(--text-muted)" }}>
                      Watch the room log in its own movable window.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActivityPosition(normalizeActivityPosition(getDefaultActivityPosition(activityMinimized), activityMinimized))}
                      onPointerDown={(event) => event.stopPropagation()}
                      className="rounded-full px-3 py-2 transition"
                      style={{ background: "var(--chip-soft)", color: "var(--text-strong)" }}
                    >
                      <span className="zp-font-mono text-[9px]">RESET</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setActivityMinimized(true)}
                      onPointerDown={(event) => event.stopPropagation()}
                      className="rounded-full px-3 py-2 transition"
                      style={{ background: "var(--shell-warm)", color: "var(--text-strong)" }}
                    >
                      <span className="zp-font-mono text-[9px]">MIN</span>
                    </button>
                  </div>
                </div>

                <p className="mt-4 text-[15px] leading-4" style={{ color: "var(--text-soft)" }}>
                  Last state update: {new Date(updatedAt).toLocaleTimeString()} · input {inputVersion}
                </p>

                <div className="mt-4 max-h-72 space-y-2 overflow-auto">
                  {events.length === 0 ? (
                    <p className="text-[18px]" style={{ color: "var(--text-muted)" }}>
                      No recent input yet.
                    </p>
                  ) : (
                    events.map((event, index) => {
                      const button = BUTTON_LOOKUP[event.button];
                      return (
                        <div
                          key={`${event.timestamp}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-[14px] px-3 py-2 text-[15px] leading-4"
                          style={{ background: "var(--chip-soft)", color: "var(--text-strong)" }}
                        >
                          <span>
                            <span className="zp-font-mono mr-2 text-[9px]">{button?.label || event.button}</span>
                            {describeEvent(event)} by {event.user}
                          </span>
                          <span style={{ color: "var(--text-muted)" }}>{new Date(event.timestamp).toLocaleTimeString()}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}

        {error ? (
          <div className="zp-toast pointer-events-none fixed inset-x-0 bottom-5 z-50 mx-auto max-w-[360px] px-4">
            <div
              className="rounded-[16px] border px-4 py-3 text-center text-[16px] leading-4 text-[#fff3ea] shadow-[0_14px_30px_rgba(0,0,0,0.25)]"
              style={{ borderColor: "color-mix(in srgb, var(--error) 75%, black)", background: "var(--error)" }}
            >
              <div className="zp-font-mono text-[9px] text-[#ffe5d9]">INPUT ERROR</div>
              <div className="mt-2">{error}</div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
