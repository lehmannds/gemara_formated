# autocomplete.js

Dropdown autocomplete attached to an `<input>` element. Filters a list of items as the user types, with keyboard navigation and mouse selection.

## Exports

### `createAutocomplete(input, options)`

Attaches autocomplete behavior to an existing `<input>` element.

**Parameters:**

| Param | Type | Description |
|-------|------|-------------|
| `input` | `HTMLInputElement` | The text input to attach to |
| `options.items` | `Array<{label, ...}>` | Items to filter. Each must have a `label` string. |
| `options.onSelect` | `(item) => void` | Callback when an item is selected |
| `options.filter` | `(query, item) => boolean` | Optional custom filter (default: case-insensitive substring on label) |
| `options.renderItem` | `(item, highlightedLabel) => HTMLElement\|string` | Optional custom renderer |
| `options.minLength` | `number` | Minimum input length before showing results (default 0) |

**Returns:** `{ destroy, setItems, getValue, setValue, getElement, close, open }`

| Method | Description |
|--------|-------------|
| `destroy()` | Remove all listeners, unwrap input, teardown |
| `setItems(items)` | Replace the item list |
| `getValue()` | Get current input value |
| `setValue(v)` | Set input value programmatically |
| `getElement()` | Get the wrapper div element |
| `close()` | Close the dropdown |
| `open()` | Trigger filtering and show dropdown |

## Behavior

- Wraps the input in a `<div class="autocomplete-wrapper">` with `position: relative`.
- Creates a `<div class="autocomplete-dropdown" role="listbox">` below the input.
- On input (debounced 100ms), filters items and renders matches (max 20).
- Keyboard: ArrowDown/Up to navigate, Enter to select, Escape to close.
- Mouse: click to select, hover to highlight.
- On select: sets input value to `item.label`, fires `onSelect`, closes.
- Focus opens dropdown (if text length >= minLength); blur closes after 150ms delay.

## Accessibility

- Dropdown has `role="listbox"`, items have `role="option"`.
- Active item has `aria-selected="true"`.

## CSS

Requires `css/autocomplete.css` (or equivalent styles for `.autocomplete-wrapper`, `.autocomplete-dropdown`, `.autocomplete-item`).

## Usage

```js
import { createAutocomplete } from './js/autocomplete.js';

const input = document.getElementById('search');
const ac = createAutocomplete(input, {
  items: [{ label: 'Apple' }, { label: 'Banana' }],
  onSelect: (item) => console.log('Selected:', item.label),
});

// Later:
ac.setItems([{ label: 'Cherry' }]);
ac.destroy();
```
