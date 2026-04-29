import type { Context } from "hono";

const SERVICE_URL = "https://zo-gameboy-etok.zocomputer.io";

export default async (c: Context) => {
  const room = String(c.req.query("room") || "main").slice(0, 32) || "main";
  const upstream = await fetch(`${SERVICE_URL}/image?room=${encodeURIComponent(room)}`);

  if (!upstream.ok || !upstream.body) {
    return c.text("Frame unavailable", 502);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") || "image/png",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
};
