# renderer.js

Converts a parsed AST (from `parser.js`) into a DOM tree for display.

## Exports

### `render(nodes: Node[], container: HTMLElement, options?: { collapsedGroups?: Set<number>; newlineBeforeExclusions?: Set<string> }): { root, wordElements }`

Clears `container`, then builds DOM elements from the node array:

- **`newlineBeforeExclusions`** — When set, tags whose names are **not** in this set start a new logical line before the tag if the current line already has a text node (and not inside a collapsed group). Stacked opening tags before the first word stay on one line. Omit for legacy behavior (no implicit breaks before tags).

- Each word becomes a `<span class="gmr-word">` with `data-word-index`.
- Tags apply CSS classes (`tag-speaker`, `tag-question`, etc.) to the words they cover.
- Overlapping tags produce multiple classes on the same span.
- Indentation increases/decreases `marginInlineStart` on line containers.
- Line breaks create new `<div class="gmr-line">` elements.

Returns:
- `root` — the container element
- `wordElements` — ordered array of all word `<span>` elements (indexed by word position)

## CSS classes produced

| Class | Applied to |
|-------|-----------|
| `gmr-rendered` | Container |
| `gmr-line` | Each line div |
| `gmr-word` | Each word span |
| `tag-{name}` | Words covered by a tag of that type |

## Virtual scroll and line height

With `prepareLines` / `renderLines`, empty lines (only a line break) must stay **roughly as tall as text lines**: `css/editor.css` sets `min-height: calc(1em * 2.2)` on `.gmr-line`. Otherwise blank rows are much shorter than word rows while `virtual-scroll.js` assumes one pixel height per logical line; scroll position then maps to the wrong line range (blank viewport, missing text).

`prepareLines(nodes, options)` accepts the same `collapsedGroups` and `newlineBeforeExclusions` as `render`.

## Example

```js
import { parse } from './js/parser.js';
import { render } from './js/renderer.js';

const nodes = parse('[speaker {1}] רבא אמר');
const { wordElements } = render(nodes, document.getElementById('content'));
// wordElements[0] has class "tag-speaker"
```
