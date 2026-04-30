# zoplayspokemon

An educational mirror repo for a collaborative Pokemon emulator-control experiment on Zo Space. This repository exists to document what was built, what it proves technically, and where the legal and product boundaries are. It is not a tutorial, starter kit, or recommendation to recreate the same public experience.

> **Status:** this repo intentionally keeps Pokemon explicit because the real project, and the tension around it, are part of the case study. The goal is transparent documentation, not sanitized rebranding.
>
> **Zo Space mirror repo:** this repository mirrors the live Zo Space route family behind `https://etok.zo.space/zoplayspokemon` and its related API endpoints. It should describe the deployed system honestly while making clear that readers should not treat it as permission, legal clearance, or step-by-step operational guidance.

## Routes

| Path | Type | Description |
|------|------|-------------|
| `/zoplayspokemon` | page | Public case-study surface for the shared Pokemon interface |
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

It also documents a real Pokemon-specific implementation on purpose. That specificity matters to the case study. Hiding it would make the record less honest.

At the same time, this repo should not be read as a how-to for launching another Pokemon stream, another public ROM-backed play surface, or another copyrighted-game deployment. Repeating the process may create legal risk. This repo is evidence of feasibility and a place to discuss tradeoffs, not a green light to copy it.

## System Behavior

The documented system works like this:

- the page captures button activity from touch, mouse, or keyboard input
- `/api/zoplayspokemon-input` forwards that activity to Ethan's hosted emulator service on Zo
- the emulator service runs a per-room loop, queues taps, and maintains held-button state
- `/api/zoplayspokemon-state` long-polls for fresher input and frame metadata
- the page refreshes the PNG feed only when the backend reports a newer accepted input or frame

## Service

- Hosted emulator service: `https://zo-gameboy-etok.zocomputer.io`
- Service source: `server/zo_gameboy_server.py`
- The live system supports room-scoped sessions; this repo discusses that behavior as part of the case study, not as a deployment recommendation.

The repo may reference or discuss ROM choices as part of documenting what exists, but it should not coach readers through reproducing the setup with copyrighted game content.

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

- `room`: string — room identifier used by the documented live system
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

- Positioning issue: `#1` — keep the project documented as a Pokemon case study while making its educational, non-instructional boundaries explicit
