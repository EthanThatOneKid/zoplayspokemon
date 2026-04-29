# gameboy-share

A collaborative Gameboy-style input pad running on Zo Space. Multiple visitors in the same room share one self-hosted game session running on Zo.

**Live:** [https://etok.zo.space/gameboy-share](https://etok.zo.space/gameboy-share)

> **Zo Space mirror repo:** this repository mirrors the live Zo Space route family behind `https://etok.zo.space/gameboy-share` and its related API endpoints. The repo should reflect the currently deployed experience.

## Routes

| Path | Type | Description |
|------|------|-------------|
| `/gameboy-share` | page | Interactive Gameboy pad UI |
| `/api/gameboy-share-state` | API | GET — returns recent input events + stream info |
| `/api/gameboy-share-input` | API | POST — send a tap, press, or release |
| `/api/gameboy-share-frame` | API | GET — returns the latest proxied PNG frame |

## How It Works

1. Visitor taps or holds a button with touch, mouse, or keyboard
2. The page POSTs to `/api/gameboy-share-input` with `{ button, action, user }`
3. The API forwards the input to Ethan's hosted emulator service on Zo
4. The emulator service runs a steady per-room loop, queues taps, and keeps held buttons active until release
5. The page loads frames from `/api/gameboy-share-frame?room=<name>` and polls `/api/gameboy-share-state`

## Service

- Hosted emulator service: `https://zo-gameboy-etok.zocomputer.io`
- Service source: `server/zo_gameboy_server.py`
- The service uses PyBoy and the bundled `roms/PlantBoy.gb` ROM
- Rooms are addressed with `?room=main` or any short room name
- To swap ROMs, upload a `.gb` file into `roms/` and point `ZO_GAMEBOY_ROM` at it in the hosted service config

## API Reference

### `GET /api/gameboy-share-state`

Returns current game state and recent input log.

```json
{
  "room": "main",
  "streamUrl": "/api/gameboy-share-frame?room=main",
  "controls": { "up": "2", "down": "3", ... },
  "updatedAt": 1715000000000,
  "events": [{ "button": "4", "user": "a3f2b1", "timestamp": 1715000000000 }]
}
```

### `POST /api/gameboy-share-input`

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
