# parser.js

Parses and serializes the `.gmr` markup format. See [markup-syntax.md](../markup-syntax.md) for the full language spec.

## Exports

### `parse(markup: string): Node[]`

Converts a raw markup string into an ordered array of AST nodes.

Node types:
- `{ type: "text", value: string }` — a single word
- `{ type: "tag", tag: string, props: object, wordCount: number }` — a tag marker
- `{ type: "indent", direction: "in" | "out" }` — indentation change
- `{ type: "break" }` — line break

### `serialize(nodes: Node[]): string`

Converts an AST node array back into a markup string. Round-trips with `parse`.

### `extractPlainText(nodes: Node[]): string`

Returns only the text words joined by spaces, stripping all tags, indentation, and breaks.

## Example

```js
import { parse, serialize, extractPlainText } from './js/parser.js';

const nodes = parse('[speaker {1}] רבא אמר');
// [{ type: "tag", tag: "speaker", props: {}, wordCount: 1 },
//  { type: "text", value: "רבא" },
//  { type: "text", value: "אמר" }]

serialize(nodes);        // '[speaker {1}] רבא אמר'
extractPlainText(nodes); // 'רבא אמר'
```
