# Data table styles

Block **`data-table`**: semantic `<table>` with caption, header row, and striped body rows. Classes match `js/table.js` output (`data-table__th`, `data-table__td`, etc.). Source: [`css/table.css`](../../css/table.css).

Header uses a light accent tint and a stronger bottom border; body rows are zebra-striped and gain a hover highlight (with reduced motion respected). Numeric columns align more evenly via `font-variant-numeric: tabular-nums` on the table.

## Sort indicators

When sorting is enabled (`sort: true` in `createTable`), headers contain a `<button class="data-table__sort-btn">` that inherits header font styling and fills the cell hit area.

Active sort direction is shown via modifier classes on `<th>`:

| Class | Indicator |
| ----- | --------- |
| `.data-table__th--asc` | ▲ after label |
| `.data-table__th--desc` | ▼ after label |

The button has a visible `:focus-visible` outline using `--color-accent`.
