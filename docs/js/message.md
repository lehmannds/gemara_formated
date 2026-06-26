# message.js

Transient toast-style notifications for user feedback (save success, errors, etc.).

## API

### `showMessage(text, options?)`

Displays a floating message that auto-dismisses.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `text` | `string` | Message text |
| `options.type` | `'success' \| 'error' \| 'info'` | Visual style (default `'info'`) |
| `options.duration` | `number` | Milliseconds before auto-dismiss (default `3000`); `0` disables auto-dismiss |
| `options.mount` | `HTMLElement` | Container element (default `document.body`) |

**Returns:** `{ dismiss: () => void }` — call `dismiss()` to remove the message immediately.

## Usage

```js
import { showMessage } from './js/message.js';

// Success toast
showMessage('Saved successfully!', { type: 'success' });

// Error with longer duration
showMessage('Something went wrong', { type: 'error', duration: 5000 });

// Manual dismiss
const msg = showMessage('Processing...', { type: 'info', duration: 0 });
// later:
msg.dismiss();
```

## Styling

Requires `css/message.css`. Messages are fixed-positioned at the top center of the viewport.

## CSS classes

| Class | Description |
|-------|-------------|
| `.gmr-message` | Base message element |
| `.gmr-message--success` | Green success styling |
| `.gmr-message--error` | Red error styling |
| `.gmr-message--info` | Blue info styling |
| `.gmr-message--fade-out` | Applied during dismiss transition |

## Accessibility

Messages use `role="status"` and `aria-live="polite"` for screen reader announcements.
