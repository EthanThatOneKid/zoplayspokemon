# gameboy-share

Collaborative Gameboy-style input pad. Multiple visitors share the same running game session by pressing buttons that forward to an upstream service.

**Live:** https://etok.zo.space/gameboy-share

## Routes

| Path | Type | Description |
|------|------|-------------|
| `/gameboy-share` | page | Interactive pad UI with live screen feed |
| `/api/gameboy-share-state` | api | GET recent button events |
| `/api/gameboy-share-input` | api | POST a button press → upstream service |

## State

- In-memory global store keyed `__gameboy_share_state`
- Keeps last 80 events; resets on server restart

## Upstream

Buttons forward to: `https://toy.cloudreve.org/control`

## Sync

- Routes live at: https://github.com/EthanThatOneKid/gameboy-share
- Export from zo.space → `bun export.ts --name gameboy-share`
- Import to zo.space → `bun import.ts` (from repo root)
