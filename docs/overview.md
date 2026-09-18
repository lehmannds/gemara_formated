# Project overview

Living documentation of **what exists in this repository** and **how it was built**. Update this file whenever you add or remove major pieces, change the build or runtime, or alter how the app is deployed.

## What exists

| Area | Description | Notes |
| ------ | ------------- | ------- |
| `css/` | Vanilla styles: tokens, base, button, table, popup, editor; entry `css/main.css`. | Imported layers; BEM blocks documented under [docs/css/](./css/). |
| `js/` | ES modules: `utils.js`, `table.js`, `popup.js`, `parser.js`, `renderer.js`, `editor.js`, `context-menu.js`, `autocomplete.js`, `select-popup.js`, `form-popup.js`, `message.js`, `virtual-scroll.js`, `url.js`. | No bundler; serve over HTTP for `type="module"`. Usage: [client-side JavaScript](./client-side-javascript.md#built-in-modules-how-to-use) and [docs/js/](./js/). |
| `texts/` | `.gmr` markup files (annotated Gemara texts). | Syntax: [docs/markup-syntax.md](./markup-syntax.md). |
| `server.js` | Local Node.js dev server (static files + REST API for `.gmr` files). | Run with `node server.js`. |
| `editor.html` | Gemara editor page (load, annotate, save texts). Perek selector with autocomplete filters by chapter name or number. | Served by `server.js` at `/`. |
| `labels.yaml` | Label (tag type) definitions: name, collapsible flag, `newline_before` (default treat as true; `false` keeps the tag on the same line after prior text), typed arguments. Collapsible tags include `group` and `mishna` (whole mishna+gemara sections). | Served by `GET /api/labels`. |
| `index.html` | Minimal shell to exercise table + popup. | Open via a local static server. |

## How it was built

### Prerequisites

- **Node.js 18+** — required for the test runner (`node:test`).
- **npm** — ships with Node; used only for dev dependencies (jsdom).

### Build and run

- `npm install` — fetches dev dependencies (jsdom for tests). No build step for the app itself.
- Serve the repo root with any static server (for example `npx serve .` or VS Code Live Server) so ES modules load correctly, then open `index.html`.

### Testing

```
npm test
```

Runs all `tests/*.test.js` files via `node --test tests/*.test.js`. Tests use jsdom to simulate the DOM.

Test files live in **`tests/`**, one per module (e.g. `tests/table.test.js`). The helper `tests/dom-env.js` patches `globalThis` with a jsdom window.

### Deployment

*(If applicable: where it runs, env vars, CI/CD.)*

### History (optional)

Brief milestones help future readers understand trade-offs.

---

When you change behavior, structure, or tooling, reflect that here in the same change (or immediately after).
