# `utils.js` — dynamic script loading

Use [`js/utils.js`](../../js/utils.js) when you need to pull in code **after** first paint or split lazy features.

## Classic script (`loadScript`)

```js
import { loadScript } from "./utils.js";

loadScript(
  "./vendor/legacy-widget.js",
  () => {
    // global `LegacyWidget` (or similar) is now available
  },
  (err) => {
    console.error("Could not load widget", err);
  },
);
```

Notes:

- The URL is loaded **without** `type="module"`; the file must expose globals or hook into your app the old way.
- Calling **`loadScript` again** with the same URL after a successful load runs **`onLoad`** on the next tick without injecting a second `<script>`.

## ES module (`loadModule`)

```js
import { loadModule } from "./utils.js";

const url = new URL("./heavy-feature.js", import.meta.url).href;
loadModule(
  url,
  () => {
    /* module had its top-level side effects, or import bindings separately if you refactor to async init */
  },
  (err) => console.error(err),
);
```

Prefer **static `import`** at the top of a file when the dependency is always needed; use **`loadModule`** when the file should load only in a branch (route, click, etc.).
