/**
 * Modal-style popup: dialog role, Escape to close, basic focus trap, focus restore.
 *
 * @typedef {{ title?: string, content: string | HTMLElement, closeLabel?: string }} PopupOpenOptions
 */

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * @param {HTMLElement} [mount=document.body]
 * @returns {{ open: (options: PopupOpenOptions) => void, close: () => void, destroy: () => void }}
 */
export function createPopup(mount = document.body) {
  let layer = /** @type {HTMLDivElement | null} */ (null);
  let lastFocus = /** @type {Element | null} */ (null);
  /** @type {((e: KeyboardEvent) => void) | null} */
  let keyHandler = null;

  /**
   * @param {PopupOpenOptions} options
   */
  function open(options) {
    close();
    const { title, content, closeLabel = "Close dialog" } = options;
    if (content == null) {
      throw new Error("createPopup.open: content is required");
    }

    lastFocus = document.activeElement;

    layer = document.createElement("div");
    layer.className = "popup";
    layer.setAttribute("role", "presentation");

    const backdrop = document.createElement("div");
    backdrop.className = "popup__backdrop";
    backdrop.addEventListener("click", () => close());

    const dialog = document.createElement("div");
    dialog.className = "popup__dialog";
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");

    const header = document.createElement("div");
    header.className = "popup__header";

    if (title) {
      const id = `popup-title-${Math.random().toString(36).slice(2)}`;
      const h = document.createElement("h2");
      h.className = "popup__title";
      h.id = id;
      h.textContent = title;
      dialog.setAttribute("aria-labelledby", id);
      header.appendChild(h);
    }

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "popup__close";
    closeBtn.setAttribute("aria-label", closeLabel);
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => close());
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "popup__body";
    if (typeof content === "string") {
      body.textContent = content;
    } else {
      body.appendChild(content);
    }

    dialog.appendChild(header);
    dialog.appendChild(body);
    layer.appendChild(backdrop);
    layer.appendChild(dialog);
    mount.appendChild(layer);

    keyHandler = (e) => onKeyDown(e, dialog);
    document.addEventListener("keydown", keyHandler);

    window.requestAnimationFrame(() => {
      const focusTarget = dialog.querySelector(FOCUSABLE);
      if (focusTarget instanceof HTMLElement) focusTarget.focus();
      else closeBtn.focus();
    });
  }

  /**
   * @param {KeyboardEvent} e
   * @param {HTMLDivElement} dialog
   */
  function onKeyDown(e, dialog) {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== "Tab") return;

    const nodes = dialog.querySelectorAll(FOCUSABLE);
    const list = Array.from(nodes).filter(
      (n) => n instanceof HTMLElement && n.offsetParent !== null,
    );
    if (!list.length) return;

    const first = list[0];
    const last = list[list.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || !dialog.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  function close() {
    if (!layer) return;
    if (keyHandler) {
      document.removeEventListener("keydown", keyHandler);
      keyHandler = null;
    }
    layer.remove();
    layer = null;
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
