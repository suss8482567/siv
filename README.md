# SIV — a web-born 4X

A desktop-only, Civilization VI–style 4X strategy game for the browser.
Deterministic simulation core, data-driven content, vector-tabletop art.

- **Design**: [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md) — agreed v0 feature set
- **Architecture**: [docs/SPEC.md](docs/SPEC.md) — normative technical spec

## Quickstart

```bash
npm install
npm run dev        # http://localhost:5173
```

| Script            | What it does                          |
|-------------------|---------------------------------------|
| `npm run dev`     | Vite dev server                       |
| `npm run build`   | Production build to `dist/`           |
| `npm run typecheck` | `tsc --noEmit` over src + tests     |
| `npm run test`    | Vitest unit tests                     |
| `npm run e2e`     | Playwright e2e (needs `npx playwright install chromium` once) |
| `npm run preview` | Serve the production build            |

## Architecture in one paragraph

All gameplay lives in a pure, deterministic **engine** (`src/engine`) with zero DOM
dependencies. Every action is a serializable **Command** dispatched through a reducer that
returns **Events** the UI plays as notifications/animations — this is what keeps replays,
golden-turn tests, and future multiplayer cheap. The hex world is drawn with PixiJS (WebGL)
behind a camera; all HUD/menus are Preact + signals over read-only state selectors.
Content (civs, units, techs, buildings, terrains) is data validated by Zod at boot, so the
game is mod-ready by construction. The layer-boundary rule (`engine` imports nothing from
`render/ui/input/save/app`) is enforced by a test, not just convention — see
[tests/architecture.test.ts](tests/architecture.test.ts).
