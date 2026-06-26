# `table.js` — data tables

[`js/table.js`](../../js/table.js) builds one semantic data table and updates body rows.

## Example

```js
import { createTable } from "./table.js";

const host = document.querySelector("#table-root");
const { root, setRows, destroy } = createTable(host, {
  caption: "Tractates",
  columns: [
    { key: "name", label: "Name" },
    { key: "folio", label: "Folio" },
  ],
});

setRows([
  { name: "Berakhot", folio: "2a" },
  { name: "Shabbat", folio: "2b" },
]);

// later: refresh
setRows(await fetchRows());

// teardown
destroy();
```

## API

| Piece | Role |
| ----- | ---- |
| `container` | Element the `<table>` is appended to |
| `options.columns` | Non-empty array of `{ key, label }` — **`key`** must match row object properties |
| `options.caption` | Optional `<caption>` text |
| `options.sort` | `true` or `{ compare? }` — enables column sorting (see below) |
| Return value `root` | The `<table>` element |
| `setRows(rows)` | Replaces `<tbody>` contents; resets sort to unsorted |
| `destroy()` | Removes `root` from the DOM and cleans up listeners |
| `setSort(key, direction?)` | *(sort only)* Programmatically sort by column. `direction`: `'asc'` (default), `'desc'`, or `'none'` |
| `getSort()` | *(sort only)* Returns `{ key, direction }` |

Pair with [`css/table.css`](../../css/table.css) (or `css/main.css`).

## Sorting

Enable with `sort: true`:

```js
const { root, setRows, setSort, getSort, destroy } = createTable(host, {
  columns: [
    { key: "name", label: "Name" },
    { key: "folio", label: "Folio" },
  ],
  sort: true,
});

setRows([
  { name: "Berakhot", folio: "2a" },
  { name: "Shabbat", folio: "2b" },
]);

// Programmatic sort
setSort("name", "desc");
getSort(); // { key: "name", direction: "desc" }
```

**Click behavior:** first click → ascending, second → descending, third → unsorted (original order). Clicking a different column starts ascending on that column.

**Custom comparator:** Pass `sort: { compare(a, b, key) }` — receives full row objects and the column key; return negative/zero/positive like `Array.sort`.

**Default comparator:** If both cell values parse as finite numbers, compares numerically; otherwise uses `String.localeCompare`.

**Accessibility:** Active header gets `aria-sort="ascending|descending|none"`. Sort triggers are `<button>` elements inside `<th>` for keyboard access.
