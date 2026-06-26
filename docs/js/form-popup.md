# form-popup.js

Modal form popup built on top of `popup.js`. Renders typed form fields and returns structured data via callbacks.

## API

### `createFormPopup(options)`

Creates a reusable form-popup instance.

**Parameters:**

| Option | Type | Description |
|--------|------|-------------|
| `title` | `string` | Dialog title |
| `fields` | `FormField[]` | Field definitions (see below) |
| `onSubmit` | `(data: Record<string, any>) => void` | Called with collected data on OK |
| `onCancel` | `() => void` | Optional; called when user cancels |
| `mount` | `HTMLElement` | Optional; defaults to `document.body` |

**Returns:** `{ open(fields?), close, destroy }`

- `open(overrideFields?)` — Opens the popup. Pass `overrideFields` to replace the default fields for this invocation.
- `close()` — Closes the popup.
- `destroy()` — Tears down the instance.

### `FormField`

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Key in the returned data object |
| `label` | `string` | Human-readable label shown in the form |
| `type` | `'text' \| 'number' \| 'boolean'` | Input type |
| `default` | `any` | Default value; booleans default to `false` |
| `required` | `boolean` | If `true`, text/number fields block submission when empty |

## Usage

```js
import { createFormPopup } from './js/form-popup.js';

const fp = createFormPopup({
  title: 'Group arguments',
  fields: [
    { name: 'label', label: 'Label', type: 'text' },
    { name: 'default_collapsed', label: 'Default collapsed', type: 'boolean', default: true },
  ],
  onSubmit: (data) => {
    console.log(data); // { label: 'My Group', default_collapsed: true }
  },
  onCancel: () => console.log('Cancelled'),
});

fp.open();
```

## Styling

Requires `css/popup.css` (base popup styles) and `css/form-popup.css` (form field styles).

## Field types

- **`text`** — renders `<input type="text">`
- **`number`** — renders `<input type="number">`; returned value is a `Number` (or `null` if empty)
- **`boolean`** — renders a checkbox; returned value is `true`/`false`
