// Shared low-level helpers for scripts that splice tags into raw markup text
// (as opposed to going through js/parser.js's node model).

export const TAG_RE = /\[[^\]]*\{\d+\}\]/g;
export const NOISE_TOKENS = new Set([')}}', "'", '"', '(', ')']);

/**
 * Given a string and the index of an opening '[', find the index of its
 * matching closing ']' (bracket-depth aware). Returns -1 if unmatched.
 */
export function findClosingBracket(s, start) {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '[') depth++;
    if (s[i] === ']') { depth--; if (depth === 0) return i; }
  }
  return -1;
}
