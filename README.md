# zoplayspokemon

An educational mirror repo for a collaborative emulator-control experiment on Zo Space. The focus is the input pipeline, frame-sync behavior, and hosted emulator UX rather than distributing a branded game experience.

> **Status:** public framing is being narrowed toward an educational systems demo. See issue #1 for the current repositioning work.
>
> **Zo Space mirror repo:** this repository mirrors the live Zo Space route family behind `https://etok.zo.space/zoplayspokemon` and its related API endpoints. The repo should reflect the currently deployed experience, while public documentation should avoid presenting the project as a redistributable commercial-game experience.

## Routes

| Path | Type | Description |
|------|------|-------------|
| `/zoplayspokemon` | page | Shared Pokemon play UI |
| `/api/zoplayspokemon-state` | API | GET — returns recent input events + long-poll frame/input metadata |
| `/api/zoplayspokemon-input` | API | POST — send a tap, press, or release |
| `/api/zoplayspokemon-frame` | API | GET — returns the latest proxied PNG frame |

## Public Positioning

This repository documents a technical experiment in:

- remote input coordination
- shared-room state fanout
- frame polling and refresh signaling
- latency management for emulator-backed UIs
- hosted game-loop orchestration on Zo

For public-facing demos and documentation, prefer original, public-domain, or otherwise redistributable content. Avoid framing the project as a way to publicly play or redistribute copyrighted commercial games.

## How It Works

1. Visitor taps or holds a button with touch, mouse, or keyboard
2. The page POSTs to `/api/zoplayspokemon-input` with `{ button, action, user }`
3. The API forwards the input to Ethan's hosted emulator service on Zo
4. The emulator service runs a steady per-room loop, queues taps, and keeps held buttons active until release
5. The state route long-polls until new input or a newer rendered frame is available
6. The page refreshes the PNG frame only when input is accepted, when the backend reports a newer frame, or when a slow fallback timer fires

## Service

- Hosted emulator service: `https://zo-gameboy-etok.zocomputer.io`
- Service source: `server/zo_gameboy_server.py`
- `roms/PlantBoy.gb` is the preferred safer demo ROM for public-facing documentation
- The current hosted entrypoint may still be pointed at other local ROMs during private experimentation; public docs should not rely on or promote copyrighted commercial game content
- Rooms are addressed with `?room=main` or any short room name
- To swap ROMs, point the hosted service entrypoint at the desired file in `roms/`

## API Reference

### `GET /api/zoplayspokemon-state`

Returns current game state and recent input log.

```json
{
  "room": "main",
  "streamUrl": "/api/zoplayspokemon-frame?room=main",
  "controls": { "up": "2", "down": "3", ... },
  "updatedAt": 1715000000000,
  "inputVersion": 12,
  "frameVersion": 12,
  "queueDepth": 0,
  "heldButtons": [],
  "events": [{ "button": "4", "user": "a3f2b1", "timestamp": 1715000000000 }]
}
```

### `POST /api/zoplayspokemon-input`

```json
{ "room": "main", "button": "4", "action": "press", "user": "a3f2b1" }
```

- `room`: string — shared room name
- `button`: string — one of `"0"`–`"7"` (RIGHT, LEFT, UP, DOWN, A, B, SELECT, START)
- `action`: string — `"tap"`, `"press"`, or `"release"`
- `user`: string — anonymous visitor ID

Returns `{ "ok": true, "event": { ... } }` on success, or `{ "error": "..." }` on failure.

## Secrets

- No external API keys required (upstream call is unauthenticated HTTP)
  The hosted emulator service is already configured on Zo.

## Tech

- **Framework:** Zo Space (Hono + React on Bun)
- **Hosted game service:** PyBoy-backed HTTP server at `https://zo-gameboy-etok.zocomputer.io`
- **State:** In-memory global on the Bun server (resets on restart)
- **Styling:** Tailwind CSS 4

## Development

Sync with the `zopack` skill in `code/workspace-root/Skills/zopack/`.

## Tracking

- Repositioning issue: `#1` — pivot public framing away from a Pokemon-specific playable experience
