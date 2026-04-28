# gameboy-share

Collaborative Gameboy-style input pad. Multiple visitors share the same game session by pressing buttons that forward to an upstream service (`toy.cloudreve.org`).

## Routes

- `/gameboy-share` — UI page with D-pad + A/B/Select/Start buttons
- `/api/gameboy-share-state` — Returns current event log and upstream URL
- `/api/gameboy-share-input` — POST button press; forwards to toy.cloudreve.org

## State

In-memory only. Resets on server restart.

## Upstream

`https://toy.cloudreve.org/control` — handles the actual game simulation.
