/**
 * Gemara markup parser and serializer.
 *
 * Markup syntax:
 *   [tag_type {word_count}]              - tag covering N following words
 *   [tag_type prop=val {word_count}]     - tag with properties
 *   >>                                   - increase indentation
 *   <<                                   - decrease indentation
 *   newlines                             - line breaks
 *   plain words                          - original Gemara text
 */

/**
 * @typedef {Object} TextNode
 * @property {"text"} type
 * @property {string} value - a single word
 */

/**
 * @typedef {Object} TagNode
 * @property {"tag"} type
 * @property {string} tag - tag name (e.g. "question", "speaker")
 * @property {Object<string,string>} props - key/value properties
 * @property {number} wordCount - how many following words this tag covers
 */

/**
 * @typedef {Object} IndentNode
 * @property {"indent"} type
 * @property {"in"|"out"} direction
 */

/**
 * @typedef {Object} BreakNode
 * @property {"break"} type
 */

/** @typedef {TextNode|TagNode|IndentNode|BreakNode} Node */

const TAG_RE = /\[([^\s\]]+)((?:\s+[^\s=\]]+=[^\s\]]+)*)\s+\{(\d+)\}\]/;

/**
 * Parse a markup string into an array of nodes.
 * @param {string} markup
 * @returns {Node[]}
 */
export function parse(markup) {
  const nodes = [];
  const lines = markup.split('\n');

  for (let i = 0; i < lines.length; i++) {
    if (i > 0) {
      nodes.push({ type: 'break' });
    }
    parseLine(lines[i], nodes);
  }

  return nodes;
}

/**
 * @param {string} line
 * @param {Node[]} nodes
 */
function parseLine(line, nodes) {
  let pos = 0;

  while (pos < line.length) {
    // Skip spaces between tokens (but don't consume them as meaningful)
    if (line[pos] === ' ' || line[pos] === '\t') {
      pos++;
      continue;
    }

    // Check for >> (indent in)
    if (line[pos] === '>' && line[pos + 1] === '>') {
      nodes.push({ type: 'indent', direction: 'in' });
      pos += 2;
      continue;
    }

    // Check for << (indent out)
    if (line[pos] === '<' && line[pos + 1] === '<') {
      nodes.push({ type: 'indent', direction: 'out' });
      pos += 2;
      continue;
    }

    // Check for tag [...]
    if (line[pos] === '[') {
      const tagResult = parseTag(line, pos);
      if (tagResult) {
        nodes.push(tagResult.node);
        pos = tagResult.end;
        continue;
      }
      // Not a valid tag — treat `[` as part of the next word
    }

    // Otherwise it's a word: read until next space or special token
    const word = readWord(line, pos);
    if (word.value) {
      nodes.push({ type: 'text', value: word.value });
    }
    // Ensure pos always advances to avoid infinite loops
    pos = word.end > pos ? word.end : pos + 1;
  }
}

/**
 * Try to parse a tag starting at pos. Returns null if not a valid tag.
 * @param {string} line
 * @param {number} pos
 * @returns {{node: TagNode, end: number}|null}
 */
function parseTag(line, pos) {
  // Find the closing ]
  let depth = 0;
  let end = pos;
  for (; end < line.length; end++) {
    if (line[end] === '[') depth++;
    if (line[end] === ']') {
      depth--;
      if (depth === 0) { end++; break; }
    }
  }
  if (depth !== 0) return null;

  const inner = line.slice(pos + 1, end - 1).trim();

  // Must end with {number}
  const wordCountMatch = inner.match(/\{(\d+)\}\s*$/);
  if (!wordCountMatch) return null;

  const wordCount = parseInt(wordCountMatch[1], 10);
  const beforeCount = inner.slice(0, wordCountMatch.index).trim();

  // First token is the tag name
  const parts = beforeCount.split(/\s+/);
  const tag = parts[0];
  if (!tag) return null;

  // Remaining parts are properties (key=value); values may be URL-encoded
  const props = {};
  for (let i = 1; i < parts.length; i++) {
    const eqIdx = parts[i].indexOf('=');
    if (eqIdx > 0) {
      const raw = parts[i].slice(eqIdx + 1);
      props[parts[i].slice(0, eqIdx)] = decodeURIComponent(raw);
    }
  }

  return {
    node: { type: 'tag', tag, props, wordCount },
    end,
  };
}

/**
 * Read a word (sequence of non-space chars that isn't a special token).
 * @param {string} line
 * @param {number} pos
 * @returns {{value: string, end: number}}
 */
function readWord(line, pos) {
  let end = pos;
  while (end < line.length && line[end] !== ' ' && line[end] !== '\t') {
    // Stop if we hit a special token start (but not at the very start,
    // to avoid zero-length words that cause infinite loops)
    if (end > pos) {
      if (line[end] === '[') break;
      if (line[end] === '>' && line[end + 1] === '>') break;
      if (line[end] === '<' && line[end + 1] === '<') break;
    }
    end++;
  }
  return { value: line.slice(pos, end), end };
}

/**
 * Serialize an array of nodes back into markup string.
 * @param {Node[]} nodes
 * @returns {string}
 */
export function serialize(nodes) {
  const parts = [];
  let lineTokens = [];

  for (const node of nodes) {
    if (node.type === 'break') {
      parts.push(lineTokens.join(' '));
      lineTokens = [];
      continue;
    }
    lineTokens.push(nodeToString(node));
  }

  // Flush remaining
  parts.push(lineTokens.join(' '));
  return parts.join('\n');
}

/**
 * Encode a property value for serialization. Spaces and percent signs are
 * percent-encoded so the value survives the space-delimited tag format.
 * @param {string} value
 * @returns {string}
 */
function encodeTagValue(value) {
  if (!value.includes(' ') && !value.includes('%')) return value;
  return value.replace(/%/g, '%25').replace(/ /g, '%20');
}

/**
 * @param {Node} node
 * @returns {string}
 */
function nodeToString(node) {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'tag': {
      const propsStr = Object.entries(node.props)
        .map(([k, v]) => `${k}=${encodeTagValue(String(v))}`)
        .join(' ');
      const inner = propsStr
        ? `${node.tag} ${propsStr} {${node.wordCount}}`
        : `${node.tag} {${node.wordCount}}`;
      return `[${inner}]`;
    }
    case 'indent':
      return node.direction === 'in' ? '>>' : '<<';
    default:
      return '';
  }
}

/**
 * Extract the plain Gemara text from nodes, stripping all formatting.
 * @param {Node[]} nodes
 * @returns {string}
 */
export function extractPlainText(nodes) {
  const words = [];
  for (const node of nodes) {
    if (node.type === 'text') {
      words.push(node.value);
    }
  }
  return words.join(' ');
}
