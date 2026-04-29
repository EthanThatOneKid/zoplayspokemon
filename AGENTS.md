# zoplayspokemon

Collaborative shared Pokemon play room backed by Ethan's own hosted emulator service on Zo. Multiple visitors in the same room share one running game session.

**Live:** https://etok.zo.space/zoplayspokemon

## Mirror Status

This repo mirrors the live Zo Space route set for Zo Plays Pokemon, including the page and related API endpoints.
Keep route edits and repo commits synced so the repo stays aligned with production.

## Routes

| Path | Type | Description |
|------|------|-------------|
| `/zoplayspokemon` | page | Interactive pad UI with live screen feed |
| `/api/zoplayspokemon-state` | api | GET recent button events |
| `/api/zoplayspokemon-input` | api | POST a tap, press, or release → upstream service |
| `/api/zoplayspokemon-frame` | api | GET proxied PNG frame for a room |

## State

- In-memory global store keyed `__zoplayspokemon_state`
- Keeps last 80 events; resets on server restart

## Service

- Hosted emulator service: `https://zo-gameboy-etok.zocomputer.io`
- Service source: `server/zo_gameboy_server.py`
- Uses a per-room emulator loop with queued taps and held-button state
- Managed entrypoint runs `python3.12 server/zo_gameboy_server.py` directly with `window="null"` and sound emulation disabled
- Current ROM path in service entrypoint: `roms/pokemon-crystal.gbc`

## Sync

- Routes live at: https://github.com/EthanThatOneKid/zoplayspokemon
- Export from zo.space → `bun export.ts --name zoplayspokemon`
- Import to zo.space → `bun import.ts` (from repo root)
