/**
 * Context menu module: creates a floating menu that can be shown
 * at arbitrary coordinates with nested items.
 *
 * Usage:
 *   const menu = createContextMenu(document.body);
 *   menu.show(x, y, items);
 *   menu.hide();
 *   menu.destroy();
 */

/**
 * @typedef {Object} MenuItem
 * @property {string} label
 * @property {Function} [action] - called when item is clicked
 * @property {MenuItem[]} [children] - nested submenu items
 */

/**
 * Create a context menu instance.
 * @param {HTMLElement} mount - element to append the menu to
 * @returns {{ show, hide, destroy, isVisible }}
 */
export function createContextMenu(mount) {
  let menuEl = null;

  function show(x, y, items) {
    hide();
    menuEl = buildMenu(items);
    menuEl.style.left = `${x}px`;
    menuEl.style.top = `${y}px`;
    mount.appendChild(menuEl);

    document.addEventListener('mousedown', onOutsideClick);
    document.addEventListener('keydown', onEscape);
  }

  function hide() {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
    document.removeEventListener('mousedown', onOutsideClick);
    document.removeEventListener('keydown', onEscape);
  }

  function isVisible() {
    return menuEl !== null;
  }

  function onOutsideClick(e) {
    if (menuEl && !menuEl.contains(e.target)) {
      hide();
    }
  }

  function onEscape(e) {
    if (e.key === 'Escape') {
      hide();
    }
  }

  function buildMenu(items) {
    const ul = document.createElement('ul');
    ul.className = 'gmr-context-menu';

    for (const item of items) {
      const li = document.createElement('li');
      li.className = 'gmr-context-menu-item';
      li.textContent = item.label;

      if (item.children && item.children.length > 0) {
        li.classList.add('gmr-has-submenu');
        const sub = buildMenu(item.children);
        sub.className = 'gmr-context-submenu';
        li.appendChild(sub);
      } else if (item.action) {
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          item.action();
          hide();
        });
      }

      ul.appendChild(li);
    }
    return ul;
  }

  function destroy() {
    hide();
  }

  return { show, hide, destroy, isVisible };
}
