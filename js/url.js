/**
 * URL/history management module.
 *
 * Stores the current perek ID in the URL hash and notifies listeners
 * when the hash changes (browser back/forward).
 */

/**
 * Read the perek ID from the current URL hash.
 * Hash format: #masechet/perakim/number
 * @returns {string|null}
 */
export function getPerekFromUrl() {
  const hash = location.hash.slice(1); // strip leading '#'
  return hash || null;
}

/**
 * Write a perek ID into the URL hash without creating a new history
 * entry on every selection change. Uses pushState so back/forward works
 * between different perek selections.
 * @param {string} id - e.g. "hulin/perakim/2"
 */
export function setPerekInUrl(id) {
  const current = getPerekFromUrl();
  if (current === id) return;
  history.pushState({ perek: id }, '', `#${id}`);
}

/** @type {Set<(id: string|null) => void>} */
const listeners = new Set();

/**
 * Register a callback that fires when the URL hash changes
 * (browser back/forward navigation).
 * @param {(id: string|null) => void} callback
 */
export function onUrlChange(callback) {
  listeners.add(callback);
}

/**
 * Remove a previously registered URL change listener.
 * @param {(id: string|null) => void} callback
 */
export function removeUrlChangeListener(callback) {
  listeners.delete(callback);
}

window.addEventListener('popstate', () => {
  const id = getPerekFromUrl();
  for (const cb of listeners) cb(id);
});
