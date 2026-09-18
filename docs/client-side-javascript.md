# Client-side JavaScript development

Conventions for browser JavaScript in this project. This document is the single source of truth for how client JS is written and organized.

## Stack

- Use **vanilla JavaScript only**—**no frameworks** (no React, Vue, Angular, etc.).
- Prefer **ES modules** (`import` / `export`) for general application code so boundaries and dependencies stay explicit.

**This repo:** [`js/utils.js`](../js/utils.js), [`js/table.js`](../js/table.js), [`js/popup.js`](../js/popup.js), [`js/parser.js`](../js/parser.js), [`js/renderer.js`](../js/renderer.js), [`js/editor.js`](../js/editor.js), [`js/context-menu.js`](../js/context-menu.js), [`js/autocomplete.js`](../js/autocomplete.js), [`js/select-popup.js`](../js/select-popup.js), [`js/form-popup.js`](../js/form-popup.js), [`js/message.js`](../js/message.js), [`js/url.js`](../js/url.js). Usage summaries below; longer examples in [docs/js/](./js/).

## Built-in modules (how to use)

Use a **static HTTP server** (not `file://`) so browsers can load ES modules. In your page, add `<script type="module" src="./js/your-entry.js"></script>` and use **relative imports** from that file (see [overview.md](./overview.md)).

### `utils.js`

- **`loadScript(url, onLoad, onError?)`** — Injects a **classic** script (no `import`/`export`). Same `url` loads once; extra `onLoad` callbacks run after the shared load finishes. Optional **`onError(Error)`**; otherwise failures log to the console.
- **`loadModule(url, onLoad, onError?)`** — **`import(url)`** then **`onLoad()`**; use for other **`.js` modules**. Optional **`onError`**.
- **`fuzzyMatchPath(query, path)`** — Scores how well `query` matches `path`. Returns `0` for no match; higher is better. Each whitespace-delimited token is matched against path segments (split on `/`, `\`, `.`): exact match → 10, prefix → 5, substring → 1. Used by the editor's text-file search to rank results.

Details: [docs/js/utils.md](./js/utils.md).

### `table.js`

- **`createTable(container, { columns, caption?, sort? })`** — Appends a styled `<table class="data-table">` into **`container`**. Each column is `{ key, label }`; row objects are plain records; cell text is `String(row[key])` (missing keys render empty).
- Returns **`{ root, setRows(rows), destroy }`**: call **`setRows`** whenever data changes; **`destroy`** removes the table from the DOM.
- **Sorting** (`sort: true` or `{ compare? }`): headers become clickable sort triggers cycling asc → desc → unsorted. Returns additional **`setSort(key, direction?)`** and **`getSort()`** for programmatic control.

Requires stylesheet support: include [`css/main.css`](../css/main.css) (or at least [`css/table.css`](../css/table.css) plus tokens).

Details: [docs/js/table.md](./js/table.md).

### `popup.js`

- **`createPopup(mount?)`** — Factory; **`mount`** defaults to `document.body`. Returns **`{ open(options), close, destroy }`**.
- **`open({ title?, content, closeLabel? })`** — **`content`** is either a **`string`** (plain text only) or an **`HTMLElement`**. Escape closes; backdrop click closes; focus moves into the dialog and returns to the opener on close.
- **`close()`** / **`destroy()`** — Remove the overlay; **`destroy`** is for teardown when you discard the factory.

Requires [`css/popup.css`](../css/popup.css) (via `css/main.css`).

Details: [docs/js/popup.md](./js/popup.md).

### `parser.js`

- **`parse(markup)`** — Parses a `.gmr` markup string into an AST node array. Node types: `text`, `tag`, `indent`, `break`.
- **`serialize(nodes)`** — Converts AST nodes back to markup string. Round-trips with `parse`.
- **`extractPlainText(nodes)`** — Strips all formatting, returns original Gemara text.

Markup syntax reference: [docs/markup-syntax.md](./markup-syntax.md). Details: [docs/js/parser.md](./js/parser.md).

### `renderer.js`

- **`render(nodes, container, options?)`** — Builds DOM from AST. Each word becomes a `<span class="gmr-word">` with tag classes applied. Optional `newlineBeforeExclusions` (`Set<string>`): tags **not** in the set start a new logical line when the current line already has text (from `labels.yaml` via `newline_before: false`). Optional `collapsibleTags` (`Set<string>`): tags listed in `labels.yaml` as `collapsible: true` get a collapse toggle + summary. Collapse toggles render in a right-side gutter (`.gmr-group-gutter`, positioned at `inset-inline-start` of each line) rather than inline with the text, keeping text indentation unaffected by group nesting. Only explicit `>>` / `<<` indentation shifts text. Returns `{ root, wordElements }`.

Details: [docs/js/renderer.md](./js/renderer.md).

### `editor.js`

- **`createEditor(container, nodes, options?)`** — Interactive editor with gap-based cursor, click-drag selection, tag application (`applyTag` orders a new tag by containment, so grouping a selection that already contains groups makes the new group their parent, while a substring stays nested as a child), word/selection delete, indentation, line break, paste, hover tooltips, collapsible regions (`collapsibleTags` from `labels.yaml`), nested collapse UI, **`extractTagTailFromSelection(tagNodeIndex)`** to end a tag before the current selection (tail words lose that tag), answer→question linking, undo/redo (Ctrl+Z/Y, 20-entry stack), and context menu support. Optional `newlineBeforeExclusions` matches `render` / `labels.yaml` (`newline_before: false` adds the tag name to the set used by the host page). Returns `{ getNodes, getSelection, setSelection, getCursor, setCursor, applyTag, insertIndent, insertBreak, insertBreakAtCursor, deleteAtCursor, deleteForward, deleteBackward, deleteSelection, removeTag, extractTagTailFromSelection, pasteText, toggleHover, getTagMap, getQuestions, ensureQuestionIds, getGroups, toggleGroup, setGroupLabel, editTagProps, setContextMenuHandler, undo, redo, rerender, destroy }`.

Details: [docs/js/editor.md](./js/editor.md).

### `context-menu.js`

- **`createContextMenu(mount)`** — Creates a floating context menu. Returns `{ show(x, y, items), hide, isVisible, destroy }`. Items can have nested `children` for submenus.

Details: [docs/js/context-menu.md](./js/context-menu.md).

### `autocomplete.js`

- **`createAutocomplete(input, options)`** — Dropdown autocomplete on an `<input>`. Filters items as user types with debounce, keyboard navigation (ArrowDown/Up/Enter/Escape), and mouse selection. Returns `{ destroy, setItems, getValue, setValue, getElement, close, open }`.

Details: [docs/js/autocomplete.md](./js/autocomplete.md).

### `select-popup.js`

- **`createSelectPopup(options)`** — Modal popup for picking from a searchable list. Uses autocomplete internally. Returns `{ open(items?), close, destroy }`.

Details: [docs/js/select-popup.md](./js/select-popup.md).

### `url.js`

- **`getPerekFromUrl()`** — Returns the perek ID from the URL hash, or `null`.
- **`setPerekInUrl(id)`** — Pushes the perek ID into the URL hash (enables browser back/forward).
- **`onUrlChange(callback)`** — Registers a listener called with the new perek ID on `popstate`.
- **`removeUrlChangeListener(callback)`** — Removes a previously registered listener.

### `form-popup.js`

- **`createFormPopup(options)`** — Modal form popup built on `popup.js`. Pass typed field definitions (`text`, `number`, `boolean`) and get structured data back via `onSubmit` / `onCancel` callbacks. Returns `{ open(fields?), close, destroy }`.

Details: [docs/js/form-popup.md](./js/form-popup.md).

### `message.js`

- **`showMessage(text, options?)`** — Transient toast-style notification. Options: `type` (`'success'`/`'error'`/`'info'`), `duration` (ms), `mount`. Returns `{ dismiss }`.

Details: [docs/js/message.md](./js/message.md).

### `virtual-scroll.js`

- **`createVirtualScroll(container, options)`** — Percent-based virtual scroller for large documents. Builds a tall `.vs-sizer` (scroll range) plus a `position: sticky` `.vs-content` layer pinned to the viewport top, so rendering lines never changes scroll height (no feedback loops, no jumps). On scroll (rAF-throttled) calls `onScroll(percent)`; the editor uses the percent + viewport capacity to pick the first line. `setTotalLines(n)` only resizes the sizer (no callback). Returns `{ getContentEl, setTotalLines, getTotalLines, getScrollPercent, getViewportLineCount, getFirstLine, getLineHeight, scrollToLine, scrollToPercent, destroy }`.

Details: [docs/js/virtual-scroll.md](./js/virtual-scroll.md).

## Modules and interfaces

- Organize UI and behavior into **small modules**, each with a **clear, documented interface** (exports consumers rely on; avoid leaking internals).
- Plan or add focused modules for cross-cutting pieces, for example:
  - **Popup** — open, close, focus trap, teardown as needed
  - **Table** — render/update, sort or other table behavior as the product requires
  - **Error message** — show, hide, clear user-visible errors consistently
  - **Form** — validate, submit, reset, or field helpers as needed
- **New behavior** usually belongs in a **new file** rather than growing an unrelated module.

## Dynamic loading

- **All scripts are loaded dynamically** (no large static bundles of unrelated logic unless the host page requires it).
- Put shared loading helpers in **`utils.js`** (or a `utils/` folder if it splits later). **`utils`** holds **general-purpose** functions used across the app.
- Include a **`loadScript(url, callback)`** (or equivalent) that **invokes `callback` when the script has finished loading** (and handle load error reporting in one place). Other modules and bootstrapping code should use this instead of ad-hoc `<script>` injection.

## File size and scope

- Keep files **small** and **single-purpose**: one main concern per file.
- Avoid **hundreds of lines** in one file; if a file is growing large, **split** by responsibility (or extract utilities into `utils` / a dedicated module).
- When you implement something **new**, it **should probably go in a new file** unless it is a tiny extension of an existing module’s documented API.

## Principles

- Keep **side effects at the edges** (DOM wiring, `fetch`, `localStorage`) and keep pure logic easy to reason about and test.
- Use **`async`/`await`** for asynchronous work; handle errors explicitly (try/catch or `.catch()`).
- Avoid **inline scripts** scattered in markup when a shared module is clearer.

## Organization

- Group code by **feature or page**, not only by type, unless the repo is very small.
- If you add a bundler or build step later, follow its **entry points** and import graph; document them in [overview.md](./overview.md).
- Document the actual paths for **`utils.js`** and feature modules in [overview.md](./overview.md) once the tree exists.

## DOM and events

- Prefer **event delegation** when many similar elements exist.
- When you add listeners, document whether they must be **removed** on teardown (dynamic views, repeated init).

## Networking

- Centralize **base URLs and API paths** (env or config), not hard-coded duplicated strings.
- For user-visible failures, surface a **clear message** via the error-message module or shared pattern; log details to the console only when appropriate.

## Accessibility and UX

- Interactive controls should be **keyboard reachable**; dynamic updates should not trap focus without intent.
- After async updates that change content, consider **focus management** where it matters for screen reader users.

## Quality

- **Test runner:** Node.js built-in (`node:test` + `node:assert/strict`). DOM provided by jsdom (`tests/dom-env.js`).
- **Command:** `npm test` — runs all `tests/*.test.js`.
- **Requirement:** Every new module in `js/` must have a corresponding `tests/<module>.test.js` covering its public API.
- For manual checks, note **supported browsers** or constraints here or in overview.

## When to update this file

Update when you change: module layout, how scripts are loaded, `utils` responsibilities, testing approach, naming conventions for client JS, or **module APIs / usage** (keep [Built-in modules](#built-in-modules-how-to-use) and [docs/js/](./js/) in sync).
