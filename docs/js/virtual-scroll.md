# virtual-scroll.js

Percent-based virtual scrolling. Renders only the visible window of lines while keeping the DOM small for large documents. Designed so that **rendering can never move the scrollbar**, eliminating the feedback loops that cause scroll jumps.

## Design — no feedback loops, no jumps

Two pieces:

1. **`.vs-sizer`** — an element whose height is set explicitly to `totalLines × lineHeight`. This is the *only* thing that produces the scrollbar / scroll range.
2. **`.vs-content`** — a `position: sticky; top: 0` layer (child of the sizer) that holds the rendered lines. Because it is pinned to the top of the viewport and the sizer has an explicit height, **rendering lines into the content never changes `scrollHeight`**.

```
scroll → percent → onScroll(percent) → editor renders into content → done
```

Since no render can change the scroll geometry, a render can never trigger another scroll event. Combined with **fixed-height single-row lines** in the editor (`height: 50px; overflow: hidden`), the total content height always equals `totalLines × lineHeight` exactly — the scrollbar thumb never jumps.

## Exports

### `createVirtualScroll(container, options)`

| Param | Type | Description |
|-------|------|-------------|
| `container` | `HTMLElement` | Scrollable container (gets `overflow-y: auto`) |
| `options.lineHeight` | `number` | Fixed height per line in px |
| `options.onScroll` | `(percent: number) => void` | rAF-throttled; called with scroll percent 0..1 |

**Returns:**

| Method | Description |
|--------|-------------|
| `getContentEl()` | The sticky content div to render lines into |
| `setTotalLines(n)` | Resize the sizer to `n × lineHeight` (does NOT fire `onScroll`) |
| `getTotalLines()` | Current total line count |
| `getScrollPercent()` | `scrollTop / (scrollHeight − clientHeight)`, clamped 0..1 |
| `getViewportLineCount()` | `floor(clientHeight / lineHeight)` |
| `getFirstLine()` | First visible line = `round(percent × (totalLines − viewportLines))` |
| `getLineHeight()` | The fixed line height |
| `scrollToLine(idx)` | Scroll so `idx` becomes the first visible line |
| `scrollToPercent(p)` | Scroll to a percent (0..1) |
| `destroy()` | Remove elements and listeners |

## Integration with Editor

The editor uses virtual scroll for documents with >500 words:

1. **Measure once** (`measureCharsPerLine`): how many characters fit on one visual row at the current font/width. Runs once per rerender, never on scroll.
2. **`prepareLines(nodes, { maxCharsPerLine })`** wraps words so each logical line is a single row.
3. **`setTotalLines(lines.length)`** sizes the scroll range.
4. **`renderVisibleLines()`** computes the window from `getFirstLine()` + `getViewportLineCount()` (+ a small below-viewport overscan) and renders it. It skips when the window is unchanged and guards re-entrancy with a render flag.
5. **`onScroll(percent)`** just calls `renderVisibleLines()` — no chained events.

Lines are justified to both edges (`text-align: justify; text-align-last: justify`) like Word.

## Usage

```js
import { createVirtualScroll } from './js/virtual-scroll.js';

const vs = createVirtualScroll(container, {
  lineHeight: 50,
  onScroll() { renderVisible(); },
});

vs.setTotalLines(lines.length);
renderVisible();

function renderVisible() {
  const total = vs.getTotalLines();
  const vp = vs.getViewportLineCount();
  const first = vs.getFirstLine();
  const start = Math.min(first, Math.max(0, total - vp));
  const end = Math.min(total, start + vp + 5);
  renderMyLines(start, end, vs.getContentEl());
}
```
