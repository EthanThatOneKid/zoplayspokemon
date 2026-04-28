# gameboy-share

Collaborative Gameboy-style input pad on Zo Space. Multiple visitors share the same running game session by pressing buttons that forward to an upstream service.

**Live:** https://etok.zo.space/gameboy-share

## Routes

| Path | Type | Description |
|---|---|---|
| `/gameboy-share` | page | D-pad + A/B/Select/Start controls + live event log |
| `/api/gameboy-share-state` | api | Returns event log + upstream stream URL |
| `/api/gameboy-share-input` | api | POST a button press → forwarded to toy.cloudreve.org |

## Upstream

The actual game simulation runs at `https://toy.cloudreve.org`. This Space acts as the relay and shared event bus.

## Secrets

None required.
