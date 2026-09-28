# maze

Competitive 3D maze game for the NitroXR ecosystem. Live at
https://nitroxr-games.github.io/maze/ — logic runs locally, 3D assets and
leaderboards stream from the NitroXR Cloud.

## Run locally

Requires Node 20+ and Python 3 (macOS ships both).

```bash
npm install
npm run dev      # builds maze.js and serves http://localhost:8080
```

Controls: WASD/arrows move · E/Space interact · T level editor · reach the portal.

## Scripts

- `npm test` — headless smoke test (game logic + live cloud wiring)
- `npm run check` — syntax-check all sources
- `npm run build` — browser bundle (`maze.js`, gitignored)
