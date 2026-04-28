# gameboy-share

Collaborative Gameboy-style input pad on Zo Space. Multiple visitors share the same running game session by pressing buttons that forward to an upstream service.

**Live:** https://etok.zo.space/gameboy-share

## How it works

- Press any button (0–7) to send an input event
- Events are broadcast via the state endpoint
- The upstream service (`toy.cloudreve.org`) drives the actual game state

## Routes

| Path | Type | Description |
|------|------|-------------|
| `/gameboy-share` | page | Interactive pad UI |
| `/api/gameboy-share-state` | api | GET recent button events |
| `/api/gameboy-share-input` | api | POST a button press |
