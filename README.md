# gameboy-share

A collaborative Gameboy-style input pad running on Zo Space. Multiple visitors share the same upstream game session — everyone pressing buttons sees their input reflected in the same running game.

**Live:** [https://etok.zo.space/gameboy-share](https://etok.zo.space/gameboy-share)

## Routes

| Path | Type | Description |
|------|------|-------------|
| `/gameboy-share` | page | Interactive Gameboy pad UI |
| `/api/gameboy-share-state` | API | GET — returns recent input events + stream info |
| `/api/gameboy-share-input` | API | POST — send a button press |

## How It Works

1. Visitor presses a button (A, B, SELECT, START, or D-pad)
2. The page POSTs to `/api/gameboy-share-input` with `{ button, user }`
3. The API forwards the press to the upstream game service (`toy.cloudreve.org`)
4. State is updated globally and the UI polls `/api/gameboy-share-state` every 1.2s

## API Reference

### `GET /api/gameboy-share-state`

Returns current game state and recent input log.

```json
{
  "streamUrl": "https://toy.cloudreve.org/image",
  "controls": { "up": "2", "down": "3", ... },
  "updatedAt": 1715000000000,
  "events": [{ "button": "4", "user": "a3f2b1", "timestamp": 1715000000000 }]
}
```

### `POST /api/gameboy-share-input`

```json
{ "button": "4", "user": "a3f2b1" }
```

- `button`: string — one of `"0"`–`"7"` (RIGHT, LEFT, UP, DOWN, A, B, SELECT, START)
- `user`: string — anonymous visitor ID

Returns `{ "ok": true, "event": { ... } }` on success, or `{ "error": "..." }` on failure.

## Secrets

- No external API keys required (upstream call is unauthenticated HTTP)

## Tech

- **Framework:** Zo Space (Hono + React on Bun)
- **State:** In-memory global on the Bun server (resets on restart)
- **Styling:** Tailwind CSS 4

## Development

Sync with the `zopack` skill in `code/workspace-root/Skills/zopack/`.
