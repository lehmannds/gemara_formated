# context-menu.js

Floating context menu that can be shown at arbitrary coordinates with nested submenu support.

## Exports

### `createContextMenu(mount: HTMLElement): ContextMenuInstance`

Creates a context menu instance attached to the given mount element.

Returns:

| Method | Description |
|--------|-------------|
| `show(x, y, items)` | Display menu at coordinates with the given items |
| `hide()` | Remove the menu from DOM |
| `isVisible()` | Returns true if menu is currently shown |
| `destroy()` | Clean up (same as hide) |

### Menu items

Each item in the `items` array:

```js
{
  label: 'Item text',
  action: () => { /* called on click */ },   // leaf item
  children: [...]                             // OR submenu items
}
```

Items with `children` render a nested submenu on hover. Items with `action` call it and auto-hide the menu on click.

### Dismissal

The menu hides automatically when:
- An item action is triggered
- User clicks outside the menu
- User presses Escape

## CSS classes

| Class | Element |
|-------|---------|
| `gmr-context-menu` | Root `<ul>` |
| `gmr-context-menu-item` | Each `<li>` |
| `gmr-has-submenu` | Items with children |
| `gmr-context-submenu` | Nested `<ul>` |

## Example

```js
import { createContextMenu } from './js/context-menu.js';

const menu = createContextMenu(document.body);

element.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  menu.show(e.clientX, e.clientY, [
    { label: 'Copy', action: () => navigator.clipboard.writeText('...') },
    { label: 'More', children: [
      { label: 'Sub item', action: () => {} },
    ]},
  ]);
});
```
