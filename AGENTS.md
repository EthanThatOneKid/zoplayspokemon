# zoplayspokemon

Educational mirror repo for a collaborative Pokemon emulator-control experiment backed by Ethan's hosted emulator service on Zo.

Public framing should emphasize that this repo is evidence and analysis, not a tutorial or deployment endorsement. Keep Pokemon explicit when it is part of honest documentation of the case study.

**Live:** https://etok.zo.space/zoplayspokemon

## Mirror Status

This repo mirrors the live Zo Space route set for Zo Plays Pokemon, including the page and related API endpoints.
Keep route edits and repo commits synced so the repo stays aligned with production.
Issue `#1` tracks the current public-positioning work: document the Pokemon-specific project transparently while discouraging imitation or redistribution.
The live route already includes the retail theme presets, floating controller UI, and frame-sync overhaul commits from April 29-30, 2026.

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
- State route now long-polls and mirrors backend `inputVersion` / `frameVersion` metadata

## Service

- Hosted emulator service: `https://zo-gameboy-etok.zocomputer.io`
- Service source: `server/zo_gameboy_server.py`
- Uses a per-room emulator loop with queued taps and held-button state
- Presentation is intentionally delayed per button so d-pad updates stay quick while dialogue/menu inputs wait for a settled frame
- `/rooms` exposes `acceptedInputVersion`, `presentedFrameVersion`, queue depth, held buttons, and timestamps
- Managed entrypoint runs `python3.12 server/zo_gameboy_server.py` directly with `window="null"` and sound emulation disabled
- Public docs may discuss the Pokemon-specific setup, but should not coach readers through repeating it with copyrighted ROMs

## Sync

- Routes live at: https://github.com/EthanThatOneKid/zoplayspokemon
- Export from zo.space → `bun export.ts --name zoplayspokemon`
- Import to zo.space → `bun import.ts` (from repo root)
