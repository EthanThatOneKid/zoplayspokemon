import type { Context } from "hono";

const ZOP_GLOBAL_ROOM = "main";

type RoomInfo = {
  acceptedInputVersion?: number;
  dirty?: boolean;
  frameHash?: string;
  hasSnapshot?: boolean;
  heldButtons?: unknown;
  lastFrameAt?: number;
  lastInputAt?: number;
  presentedFrameVersion?: number;
  queueDepth?: number;
  savedAt?: number;
  snapshotBytes?: number;
  ticks?: number;
};

const SERVICE_URL = "https://zo-gameboy-etok.zocomputer.io";
const SPACE_URL = "https://etok.zo.space";
const BUTTON_NAMES: Record<string, string> = {
  "0": "RIGHT",
  "1": "LEFT",
  "2": "UP",
  "3": "DOWN",
  "4": "A",
  "5": "B",
  "6": "SELECT",
  "7": "START",
};

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function readButtons(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((button): button is string => typeof button === "string") : [];
}

function formatRelativeTime(timestamp: number, now: number): string {
  if (!timestamp) return "no recent input";

  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s ago`;

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;

  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function describeQueue(queueDepth: number): string {
  if (queueDepth <= 0) return "queue clear";
  if (queueDepth === 1) return "1 input queued";
  return `${queueDepth} inputs queued`;
}

function describeHeldButtons(heldButtons: string[]): string {
  if (heldButtons.length === 0) return "hands off the controls";
  return `${heldButtons.map((button) => BUTTON_NAMES[button] || button).join(" + ")} held`;
}

function describeSnapshot(info: RoomInfo): string {
  if (info.hasSnapshot) {
    const savedAt = readNumber(info.savedAt, 0);
    return savedAt > 0 ? `snapshot saved ${formatRelativeTime(savedAt, Date.now())}` : "snapshot ready";
  }
  if (info.dirty) return "snapshot overdue";
  return "no snapshot yet";
}

function buildDescription(info: RoomInfo | undefined, now: number): string {
  if (!info) {
    return `The shared session is standing by. Open the live Zo Plays Pokemon case-study feed to watch the next documented frame land.`;
  }

  const frameVersion = readNumber(info.presentedFrameVersion, 0);
  const inputVersion = readNumber(info.acceptedInputVersion, 0);
  const queueDepth = readNumber(info.queueDepth, 0);
  const heldButtons = readButtons(info.heldButtons);
  const lastInputAt = readNumber(info.lastInputAt, 0);
  const mood =
    queueDepth > 0
      ? "Chaos is brewing"
      : lastInputAt > 0
        ? "Session is live"
        : "Session is idling";
  const activity = lastInputAt > 0 ? formatRelativeTime(lastInputAt, now) : "none yet";

  return `${mood}: frame ${frameVersion}, input ${inputVersion}, ${describeQueue(queueDepth)}, ${describeHeldButtons(heldButtons)}, last move ${activity}, ${describeSnapshot(info)}.`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function fetchRoomInfo(room: string): Promise<RoomInfo | undefined> {
  try {
    const response = await fetch(`${SERVICE_URL}/rooms`, {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return undefined;

    const data = (await response.json().catch(() => null)) as Record<string, RoomInfo> | null;
    return data?.[room];
  } catch {
    return undefined;
  }
}

export default async (c: Context) => {
  const now = Date.now();
  const roomInfo = await fetchRoomInfo(ZOP_GLOBAL_ROOM);
  const frameVersion = readNumber(roomInfo?.presentedFrameVersion, 0);
  const lastFrameAt = readNumber(roomInfo?.lastFrameAt, 0);
  const liveUrl = `${SPACE_URL}/zoplayspokemon`;
  const shareUrl = `${SPACE_URL}/api/zoplayspokemon-share`;
  const ogImageUrl = `${SPACE_URL}/api/zoplayspokemon-frame?v=${frameVersion}&t=${lastFrameAt || now}`;
  const title = `Zo Plays Pokemon · frame ${frameVersion}`;
  const description = buildDescription(roomInfo, now);
  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Zo Plays Pokemon" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(shareUrl)}" />
    <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />
    <meta property="og:image:url" content="${escapeHtml(ogImageUrl)}" />
    <meta property="og:image:type" content="image/png" />
    <meta property="og:image:width" content="480" />
    <meta property="og:image:height" content="432" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />
    <link rel="canonical" href="${escapeHtml(shareUrl)}" />
    <meta http-equiv="refresh" content="0;url=${escapeHtml(liveUrl)}" />
    <style>
      :root { color-scheme: dark; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: radial-gradient(circle at top, #5f4f9d, #1e1732 64%);
        color: #f6f0ff;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
      main {
        max-width: 44rem;
        padding: 2rem;
        text-align: center;
      }
      a {
        color: #fff5b8;
      }
    </style>
  </head>
  <body>
    <main>
      <p>Opening the live feed…</p>
      <p><a href="${escapeHtml(liveUrl)}">Continue to Zo Plays Pokemon</a></p>
    </main>
    <script>
      window.location.replace(${JSON.stringify(liveUrl)});
    </script>
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/html; charset=utf-8",
    },
  });
};
