import type { Context } from "hono";

const SERVICE_URL = "https://zo-gameboy-etok.zocomputer.io";

export default async (c: Context) => {
  const room = String(c.req.query("room") || "main").slice(0, 32) || "main";
  const upstream = await fetch(`${SERVICE_URL}/image?room=${encodeURIComponent(room)}`);

  if (!upstream.ok || !upstream.body) {
    return c.text("Frame unavailable", 502);
  }

  const frameVersion = upstream.headers.get("x-frame-version") || "0";
  const inputVersion = upstream.headers.get("x-input-version") || "0";
  const queueDepth = upstream.headers.get("x-queue-depth") || "0";
  const etag = `"${room}:${frameVersion}"`;

  if (c.req.header("if-none-match") === etag) {
    return new Response(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control": "private, no-cache, must-revalidate",
        Vary: "If-None-Match",
        "X-Input-Version": inputVersion,
        "X-Frame-Version": frameVersion,
        "X-Queue-Depth": queueDepth,
      },
    });
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "image/png",
      "Cache-Control": "private, no-cache, must-revalidate",
      ETag: etag,
      Vary: "If-None-Match",
      "X-Input-Version": inputVersion,
      "X-Frame-Version": frameVersion,
      "X-Queue-Depth": queueDepth,
    },
  });
};
