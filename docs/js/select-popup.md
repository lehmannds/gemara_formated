# select-popup.js

Modal popup for selecting an item from a searchable list. Uses `autocomplete.js` internally for filtering.

## Exports

### `createSelectPopup(options)`

Creates a select popup instance (not shown until `open()` is called).

**Parameters (options):**

| Param | Type | Description |
|-------|------|-------------|
| `title` | `string` | Header text shown in the popup |
| `items` | `Array<{label, value}>` | Default items (can be overridden in `open()`) |
| `onSelect` | `(item) => void` | Callback when user picks an item |
| `onCancel` | `() => void` | Optional callback when dismissed without selection |
| `mount` | `HTMLElement` | Where to append the overlay (default: `document.body`) |
| `filter` | `(query, item) => boolean` | Optional custom filter |

**Returns:** `{ open, close, destroy }`

| Method | Description |
|--------|-------------|
| `open(items?)` | Show the popup. Optional `items` array overrides defaults. |
| `close()` | Close and remove the overlay |
| `destroy()` | Full teardown (same as close) |

## Behavior

- `open()` creates a backdrop overlay with a centered panel.
- Panel contains: title, search input (with autocomplete), item list.
- Typing filters the list in real-time.
- Click an item or press Enter on highlighted → fires `onSelect`, closes.
- Escape or backdrop click → fires `onCancel`, closes.
- Focus is trapped within the popup.
- Previous focus is restored on close.

## Accessibility

- Panel has `role="dialog"` and `aria-modal="true"`.
- Title is linked via `aria-labelledby`.
- Focus trap on Tab/Shift+Tab.

## CSS

Requires `css/select-popup.css` (`.select-popup-backdrop`, `.select-popup-panel`, `.select-popup-title`, `.select-popup-search`, `.select-popup-list`, `.select-popup-item`).

## Usage

```js
import { createSelectPopup } from './js/select-popup.js';

const popup = createSelectPopup({
  title: 'Select a question:',
  items: [
    { label: 'q1: מנא הני מילי', value: 'q1' },
    { label: 'q2: מאי טעמא', value: 'q2' },
  ],
  onSelect: (item) => console.log('Chose:', item.value),
  onCancel: () => console.log('Cancelled'),
});

// Show it:
popup.open();

// Or with dynamic items:
popup.open([{ label: 'New item', value: 'new' }]);
```
