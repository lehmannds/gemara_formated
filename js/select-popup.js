import { createAutocomplete } from './autocomplete.js';

/**
 * @typedef {Object} SelectPopupItem
 * @property {string} label
 * @property {*} value
 */

/**
 * @typedef {Object} SelectPopupOptions
 * @property {string} title
 * @property {SelectPopupItem[]} items
 * @property {(item: SelectPopupItem) => void} onSelect
 * @property {() => void} [onCancel]
 * @property {HTMLElement} [mount]
 * @property {(query: string, item: SelectPopupItem) => boolean} [filter]
 */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {SelectPopupOptions} options
 * @returns {{ open: (items?: SelectPopupItem[]) => void, close: () => void, destroy: () => void }}
 */
export function createSelectPopup(options) {
  const {
    title,
    items: defaultItems = [],
    onSelect,
    onCancel,
    mount = document.body,
    filter,
  } = options;

  let backdrop = /** @type {HTMLDivElement | null} */ (null);
  let autocomplete = /** @type {ReturnType<typeof createAutocomplete> | null} */ (null);
  let lastFocus = /** @type {Element | null} */ (null);
  /** @type {((e: KeyboardEvent) => void) | null} */
  let keyHandler = null;
  let focusTimer = null;

  function open(overrideItems) {
    close();
    lastFocus = document.activeElement;
    const activeItems = overrideItems || defaultItems;

    backdrop = document.createElement('div');
    backdrop.className = 'select-popup-backdrop';
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        if (onCancel) onCancel();
        close();
      }
    });

    const panel = document.createElement('div');
    panel.className = 'select-popup-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');

    const titleEl = document.createElement('div');
    titleEl.className = 'select-popup-title';
    titleEl.textContent = title;
    const titleId = 'select-popup-title-' + Math.random().toString(36).slice(2);
    titleEl.id = titleId;
    panel.setAttribute('aria-labelledby', titleId);

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'select-popup-search';
    input.placeholder = 'Search…';

    panel.appendChild(titleEl);
    panel.appendChild(input);

    backdrop.appendChild(panel);
    mount.appendChild(backdrop);

    autocomplete = createAutocomplete(input, {
      items: activeItems,
      minLength: 0,
      filter: filter || defaultFilter,
      onSelect: handleSelect,
      renderItem: (item) => {
        const el = document.createElement('div');
        el.className = 'select-popup-item';
        el.textContent = item.label;
        return el;
      },
      listClass: 'select-popup-list',
    });

    keyHandler = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (onCancel) onCancel();
        close();
      } else if (e.key === 'Tab') {
        trapFocus(e, panel);
      }
    };
    panel.addEventListener('keydown', keyHandler);

    focusTimer = setTimeout(() => {
      focusTimer = null;
      if (autocomplete) {
        input.focus();
        autocomplete.open();
      }
    }, 0);
  }

  /** @param {SelectPopupItem} item */
  function handleSelect(item) {
    onSelect(item);
    close();
  }

  /**
   * @param {string} query
   * @param {SelectPopupItem} item
   * @returns {boolean}
   */
  function defaultFilter(query, item) {
    const q = query.toLowerCase();
    return item.label.toLowerCase().includes(q);
  }

  /**
   * @param {KeyboardEvent} e
   * @param {HTMLElement} panel
   */
  function trapFocus(e, panel) {
    const nodes = panel.querySelectorAll(FOCUSABLE);
    const list = Array.from(nodes).filter(
      (n) => n instanceof HTMLElement && n.offsetParent !== null,
    );
    if (!list.length) return;

    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !panel.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function close() {
    if (focusTimer !== null) {
      clearTimeout(focusTimer);
      focusTimer = null;
    }
    if (!backdrop) return;
    if (autocomplete) {
      autocomplete.destroy();
      autocomplete = null;
    }
    if (keyHandler && backdrop.firstElementChild) {
      backdrop.firstElementChild.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    backdrop.remove();
    backdrop = null;
    if (lastFocus instanceof HTMLElement) {
      lastFocus.focus();
    }
    lastFocus = null;
  }

  function destroy() {
    close();
  }

  return { open, close, destroy };
}
