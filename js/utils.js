/**
 * General-purpose browser helpers. Prefer importing from here instead of duplicating.
 */

/** @type {Map<string, { loaded: boolean, callbacks: Array<() => void> }>} */
const scriptLoads = new Map();

/**
 * Injects a classic (non-module) script and runs onLoad after it loads.
 * Same URL shares one load; callbacks queue until the script fires load.
 * @param {string} url
 * @param {() => void} onLoad
 * @param {(error: Error) => void} [onError]
 */
export function loadScript(url, onLoad, onError) {
  let entry = scriptLoads.get(url);
  if (!entry) {
    entry = { loaded: false, callbacks: [] };
    scriptLoads.set(url, entry);

    const el = document.createElement("script");
    el.src = url;
    el.async = true;
    el.addEventListener("load", () => {
      entry.loaded = true;
      for (const cb of entry.callbacks) cb();
      entry.callbacks.length = 0;
    });
    el.addEventListener("error", () => {
      scriptLoads.delete(url);
      const err = new Error(`Failed to load script: ${url}`);
      el.remove();
      if (onError) onError(err);
      else console.error(err);
    });
    document.head.appendChild(el);
  }

  if (entry.loaded) {
    queueMicrotask(onLoad);
    return;
  }

  entry.callbacks.push(onLoad);
}

/**
 * Dynamically imports an ES module URL, then calls onLoad.
 * @param {string} url Module specifier / relative URL.
 * @param {() => void} onLoad
 * @param {(error: Error) => void} [onError]
 */
export function loadModule(url, onLoad, onError) {
  import(url)
    .then(() => onLoad())
    .catch((cause) => {
      const err =
        cause instanceof Error
          ? cause
          : new Error(String(cause), { cause });
      if (onError) onError(err);
      else console.error(err);
    });
}

/**
 * Scores how well `query` matches `path`. Returns 0 for no match; higher is
 * better. Every whitespace-delimited token must appear somewhere in the path
 * for a non-zero score.
 *
 * Scoring per token (best match across path segments wins):
 *   exact segment match → 10,  segment starts with token → 5,  substring → 1
 *
 * Segments are the parts of the path split on `/`, `\`, and `.`.
 *
 * @param {string} query  User search string (e.g. "hu 9 1").
 * @param {string} path   File path to test (e.g. "hulin/9.1").
 * @returns {number} 0 when any token is missing; positive score otherwise.
 */
export function fuzzyMatchPath(query, path) {
  if (!query || !query.trim()) return 1;
  const segments = path.toLowerCase().split(/[\/\\.]+/).filter(Boolean);
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  let total = 0;
  for (const t of tokens) {
    let best = 0;
    for (const seg of segments) {
      if (seg === t) { best = 10; break; }
      if (seg.startsWith(t)) best = Math.max(best, 5);
      else if (seg.includes(t)) best = Math.max(best, 1);
    }
    if (best === 0) return 0;
    total += best;
  }
  return total;
}
