# `popup.js` — modal dialog

[`js/popup.js`](../../js/popup.js) shows a single overlay dialog at a time per **factory** instance. Opening again **closes** the previous dialog first.

## Example (text content)

```js
import { createPopup } from "./popup.js";

const popup = createPopup();

document.querySelector("#open-help").addEventListener("click", () => {
  popup.open({
    title: "Help",
    content: "Plain text only — no HTML in strings.",
  });
});
```

## Example (DOM content)

```js
import { createPopup } from "./popup.js";

const popup = createPopup();
const el = document.createElement("div");
el.innerHTML = "<p>Use DOM when you need markup.</p>";

popup.open({ title: "Details", content: el });
```

For untrusted HTML, build nodes with **`document.createElement`** / **`textContent`** instead of **`innerHTML`**.

## API

| Piece | Role |
| ----- | ---- |
| `createPopup(mount?)` | Optional parent; default `document.body` |
| `open({ title?, content, closeLabel? })` | **`content`** required: **`string`** (escaped as text) or **`HTMLElement`** |
| `close()` | Hides overlay, restores focus to the element that opened it |
| `destroy()` | Same as closing; reserved for symmetry / future hooks |

Behavior: **Escape** and **backdrop click** close; **Tab** cycles focus inside the dialog.

Pair with [`css/popup.css`](../../css/popup.css) (or `css/main.css`).
