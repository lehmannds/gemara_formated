/**
 * Message module: transient toast-style notifications.
 *
 * Usage:
 *   showMessage('Saved!', { type: 'success' });
 *   showMessage('Something failed', { type: 'error', duration: 5000 });
 */

/**
 * @typedef {Object} MessageOptions
 * @property {'success'|'error'|'info'} [type='info']
 * @property {number}      [duration=3000]  - ms before auto-dismiss
 * @property {HTMLElement} [mount]          - container element (default document.body)
 */

/**
 * Show a transient toast message.
 *
 * @param {string} text
 * @param {MessageOptions} [options]
 * @returns {{ dismiss: () => void }}
 */
export function showMessage(text, options = {}) {
  const {
    type = 'info',
    duration = 3000,
    mount = document.body,
  } = options;

  const el = document.createElement('div');
  el.className = `gmr-message gmr-message--${type}`;
  el.textContent = text;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  mount.appendChild(el);

  let timer = null;

  function dismiss() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    el.classList.add('gmr-message--fade-out');
    const onEnd = () => {
      el.removeEventListener('transitionend', onEnd);
      el.remove();
    };
    el.addEventListener('transitionend', onEnd);
    // Fallback removal if transitionend doesn't fire (e.g. in tests)
    setTimeout(() => el.remove(), 500);
  }

  if (duration > 0) {
    timer = setTimeout(dismiss, duration);
  }

  return { dismiss };
}
