/**
 * Autocomplete dropdown attached to an <input> element.
 *
 * @param {HTMLInputElement} input
 * @param {object} options
 * @param {Array<{label: string, [key: string]: any}>} options.items
 * @param {(item: object) => void} options.onSelect
 * @param {(query: string, item: object) => boolean} [options.filter]
 * @param {(item: object, highlightedLabel: string) => HTMLElement|string} [options.renderItem]
 * @param {number} [options.minLength=0]
 * @returns {{ destroy: () => void, setItems: (items: Array) => void, getValue: () => string, setValue: (v: string) => void, getElement: () => HTMLDivElement, close: () => void, open: () => void }}
 */
export function createAutocomplete(input, options) {
  let {
    items = [],
    onSelect,
    filter: customFilter,
    renderItem: customRenderItem,
    minLength = 0,
  } = options;

  const MAX_SHOWN = 20;
  const DEBOUNCE_MS = 100;
  const BLUR_DELAY_MS = 150;

  let highlightIndex = -1;
  let filtered = [];
  let debounceTimer = null;
  let blurTimer = null;
  let destroyed = false;

  const wrapper = document.createElement("div");
  wrapper.className = "autocomplete-wrapper";

  const dropdown = document.createElement("div");
  dropdown.className = "autocomplete-dropdown";
  dropdown.setAttribute("role", "listbox");

  const parent = input.parentNode;
  if (parent) {
    parent.insertBefore(wrapper, input);
  }
  wrapper.appendChild(input);
  wrapper.appendChild(dropdown);

  function defaultFilter(query, item) {
    return item.label.toLowerCase().includes(query.toLowerCase());
  }

  function defaultRenderItem(item, highlightedLabel) {
    return highlightedLabel;
  }

  function highlightMatch(label, query) {
    if (!query) return escapeHtml(label);
    const lower = label.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx === -1) return escapeHtml(label);
    const before = label.slice(0, idx);
    const match = label.slice(idx, idx + query.length);
    const after = label.slice(idx + query.length);
    return escapeHtml(before) + "<strong>" + escapeHtml(match) + "</strong>" + escapeHtml(after);
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function render() {
    dropdown.innerHTML = "";
    highlightIndex = -1;

    if (filtered.length === 0) {
      hide();
      return;
    }

    const query = input.value;
    const shown = filtered.slice(0, MAX_SHOWN);

    for (let i = 0; i < shown.length; i++) {
      const item = shown[i];
      const el = document.createElement("div");
      el.className = "autocomplete-item";
      el.setAttribute("role", "option");
      el.setAttribute("aria-selected", "false");

      const highlightedLabel = highlightMatch(item.label, query);
      const renderFn = customRenderItem || defaultRenderItem;
      const content = renderFn(item, highlightedLabel);

      if (typeof content === "string") {
        el.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        el.appendChild(content);
      }

      el.addEventListener("mousedown", (e) => {
        e.preventDefault();
        select(item);
      });

      el.addEventListener("mouseenter", () => {
        setHighlight(i);
      });

      dropdown.appendChild(el);
    }

    show();
  }

  function show() {
    if (destroyed) return;
    dropdown.classList.add("visible");
  }

  function hide() {
    dropdown.classList.remove("visible");
    highlightIndex = -1;
    updateAriaSelected();
  }

  function setHighlight(index) {
    const children = dropdown.children;
    if (highlightIndex >= 0 && highlightIndex < children.length) {
      children[highlightIndex].classList.remove("highlighted");
    }
    highlightIndex = index;
    if (highlightIndex >= 0 && highlightIndex < children.length) {
      children[highlightIndex].classList.add("highlighted");
      if (children[highlightIndex].scrollIntoView) {
        children[highlightIndex].scrollIntoView({ block: "nearest" });
      }
    }
    updateAriaSelected();
  }

  function updateAriaSelected() {
    const children = dropdown.children;
    for (let i = 0; i < children.length; i++) {
      children[i].setAttribute("aria-selected", i === highlightIndex ? "true" : "false");
    }
  }

  function select(item) {
    input.value = item.label;
    hide();
    if (onSelect) onSelect(item);
  }

  function update() {
    const query = input.value;
    if (query.length < minLength) {
      filtered = [];
      hide();
      return;
    }

    const filterFn = customFilter || defaultFilter;
    filtered = items.filter((item) => filterFn(query, item));
    render();
  }

  function onInput() {
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      update();
    }, DEBOUNCE_MS);
  }

  function onKeyDown(e) {
    const isVisible = dropdown.classList.contains("visible");

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isVisible) {
        update();
        return;
      }
      const max = Math.min(filtered.length, MAX_SHOWN) - 1;
      setHighlight(highlightIndex < max ? highlightIndex + 1 : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isVisible) return;
      const max = Math.min(filtered.length, MAX_SHOWN) - 1;
      setHighlight(highlightIndex > 0 ? highlightIndex - 1 : max);
    } else if (e.key === "Enter") {
      if (isVisible && highlightIndex >= 0 && highlightIndex < filtered.length) {
        e.preventDefault();
        select(filtered[highlightIndex]);
      }
    } else if (e.key === "Escape") {
      if (isVisible) {
        e.preventDefault();
        hide();
      }
    }
  }

  function onFocus() {
    if (blurTimer !== null) {
      clearTimeout(blurTimer);
      blurTimer = null;
    }
    if (input.value.length >= minLength) {
      update();
    }
  }

  function onBlur() {
    blurTimer = setTimeout(() => {
      blurTimer = null;
      hide();
    }, BLUR_DELAY_MS);
  }

  input.addEventListener("input", onInput);
  input.addEventListener("keydown", onKeyDown);
  input.addEventListener("focus", onFocus);
  input.addEventListener("blur", onBlur);

  return {
    destroy() {
      destroyed = true;
      if (debounceTimer !== null) clearTimeout(debounceTimer);
      if (blurTimer !== null) clearTimeout(blurTimer);
      input.removeEventListener("input", onInput);
      input.removeEventListener("keydown", onKeyDown);
      input.removeEventListener("focus", onFocus);
      input.removeEventListener("blur", onBlur);
      if (wrapper.parentNode) {
        wrapper.parentNode.insertBefore(input, wrapper);
        wrapper.remove();
      }
    },

    setItems(newItems) {
      items = newItems || [];
      if (dropdown.classList.contains("visible")) {
        update();
      }
    },

    getValue() {
      return input.value;
    },

    setValue(v) {
      input.value = v;
    },

    getElement() {
      return wrapper;
    },

    close() {
      hide();
    },

    open() {
      update();
    },
  };
}
