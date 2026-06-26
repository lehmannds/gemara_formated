/**
 * Renderer: converts a parsed AST (from parser.js) into DOM elements.
 *
 * Supports two modes:
 * 1. Full render: render(nodes, container, options) — renders all lines
 * 2. Virtualized: prepareLines(nodes) + renderLines(lines, range, container)
 *    renders only a window of lines for performance with large texts.
 */

/**
 * @typedef {import('./parser.js').Node} Node
 */

/** @param {{ collapsed: boolean, remaining: number }[]} activeGroups */
function findLastExpandedCollapsible(activeGroups) {
  for (let i = activeGroups.length - 1; i >= 0; i--) {
    const g = activeGroups[i];
    if (!g.collapsed && g.remaining > 0) return g;
  }
  return null;
}

/** @param {{ collapsed: boolean, remaining: number }[]} activeGroups */
function findLastCollapsedCollapsible(activeGroups) {
  for (let i = activeGroups.length - 1; i >= 0; i--) {
    const g = activeGroups[i];
    if (g.collapsed && g.remaining > 0) return g;
  }
  return null;
}

function anyCollapsedCollapsibleAncestor(activeGroups) {
  return activeGroups.some(g => g.collapsed && g.remaining > 0);
}

/**
 * Determine which collapsible group tag nodes contain at least one nested
 * collapsible group (so an expanded one should render its content as an
 * indented block). Returns a Set of node indices.
 *
 * @param {Node[]} nodes
 * @param {Set<string>} collapsibleTags
 * @returns {Set<number>}
 */
function computeGroupsWithInnerGroups(nodes, collapsibleTags) {
  const groups = [];
  let wordIdx = 0;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type === 'tag' && collapsibleTags.has(n.tag)) {
      groups.push({ nodeIndex: i, wordStart: wordIdx, wordEnd: wordIdx + n.wordCount });
    } else if (n.type === 'text') {
      wordIdx++;
    }
  }
  const withInner = new Set();
  for (const outer of groups) {
    const hasInner = groups.some(
      inner =>
        inner.nodeIndex > outer.nodeIndex &&
        inner.wordStart >= outer.wordStart &&
        inner.wordEnd <= outer.wordEnd
    );
    if (hasInner) withInner.add(outer.nodeIndex);
  }
  return withInner;
}

/**
 * Pre-process nodes into logical lines (split at break nodes).
 * Each line is an array of nodes with pre-computed metadata.
 *
 * Collapsed groups are merged into a single line regardless of how many
 * breaks they contain internally.
 *
 * @param {Node[]} nodes
 * @param {object} [options]
 * @param {Set<number>} [options.collapsedGroups] - node indices of collapsed groups
 * @param {Set<string>} [options.collapsibleTags] - tag names that get collapse UI (from labels.yaml `collapsible`); defaults to `group` only
 * @param {Set<string>} [options.newlineBeforeExclusions] - if set, tags **not** in this set get a new logical line before them when the current line already has text (so stacked tags before the first word stay on one line). Tags with `newline_before: false` in labels.yaml populate this set.
 * @param {number} [options.maxCharsPerLine=2500] - split long logical lines into chunks of at most this many characters. Virtual scrolling passes a small measured value so each line is one fixed-height visual row.
 * @returns {{ lines: object[], wordCount: number }}
 */
export function prepareLines(nodes, options = {}) {
  const collapsedGroups = options.collapsedGroups || new Set();
  const collapsibleTags = options.collapsibleTags || new Set(['group']);
  const newlineExclusions = options.newlineBeforeExclusions;
  // Max characters per logical line. For virtual scrolling the editor passes
  // a small measured value so each line fits on exactly one visual row
  // (fixed height → no scroll jumps). Defaults large for full render/tests.
  const maxCharsPerLine = options.maxCharsPerLine || 2500;
  const lines = [];
  let currentLineNodes = [];
  let indentLevel = 0;
  let wordIndex = 0;

  // Node indices of collapsible group tags that contain at least one nested
  // collapsible group. When such a group is EXPANDED its content is laid out as
  // its own indented block (each inner group on its own line); leaf groups (no
  // nested groups) keep their content inline with the toggle.
  const groupsWithInnerGroups = computeGroupsWithInnerGroups(nodes, collapsibleTags);

  // Active tags carry across lines
  const activeTags = [];

  // Track if we're inside a collapsed group (breaks are ignored)
  let collapsedDepth = 0;
  // Extra indentation from currently-open EXPANDED groups that own a block.
  let groupDepth = 0;
  // True when the current line was started by an implicit break (newline_before
  // or groupNeedsOwnLine). A subsequent explicit break node is absorbed to
  // avoid a double blank line; otherwise the break is honoured.
  let startedByImplicitBreak = false;
  // Page tracking: `currentPage` holds the active page value for the gutter.
  // `pendingPage` is set when a page tag is encountered; on the next flush it
  // becomes the new currentPage. `pageStart` marks the first line of a page.
  let currentPage = null;
  let pendingPage = null;

  function flushLine() {
    let isPageStart = false;
    if (pendingPage !== null) {
      currentPage = pendingPage;
      pendingPage = null;
      isPageStart = true;
    }
    const line = {
      nodes: currentLineNodes,
      indentLevel: indentLevel + groupDepth,
      wordStart: wordIndex - currentLineNodes.filter(n => n.type === 'text').length,
      wordCount: currentLineNodes.filter(n => n.type === 'text').length,
      activeTags: activeTags.map(t => ({ ...t })),
    };
    if (currentPage !== null) {
      line.page = currentPage;
      if (isPageStart) line.pageStart = true;
    }
    lines.push(line);
    currentLineNodes = [];
  }

  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni];

    switch (node.type) {
      case 'indent':
        if (collapsedDepth === 0) {
          if (node.direction === 'in') indentLevel++;
          else if (indentLevel > 0) indentLevel--;
        }
        currentLineNodes.push({ ...node, _nodeIndex: ni });
        break;

      case 'break':
        // Inside a collapsed group, treat breaks as part of the same line
        if (collapsedDepth > 0) {
          currentLineNodes.push({ ...node, _nodeIndex: ni });
        } else if (currentLineNodes.some(n => n.type === 'text') || currentLineNodes.length === 0) {
          flushLine();
          startedByImplicitBreak = false;
        } else if (!startedByImplicitBreak) {
          // Line has only tags/indents but was NOT created by an implicit
          // newline_before — this is a user-inserted break, honour it.
          flushLine();
        }
        // else: implicit newline_before already started this line — absorb
        // the duplicate break so we don't get a blank line with just tags.
        break;

      case 'tag': {
        // Page markers (wordCount 0) don't span words — record the value
        // so the next flushed line carries it for gutter rendering.
        if (node.tag === 'page' && node.wordCount === 0) {
          pendingPage = node.props.value || null;
          currentLineNodes.push({ ...node, _nodeIndex: ni });
          break;
        }

        const isCollapsible = collapsibleTags.has(node.tag);
        // Chrome is only shown when not nested inside a collapsed ancestor.
        const visibleChrome = isCollapsible && collapsedDepth === 0;
        const isCollapsedHere = isCollapsible && collapsedGroups.has(ni);
        // Expanded group that owns a block: lay its content out on indented
        // lines below the toggle. Only when it actually contains inner groups.
        const ownsBlock =
          visibleChrome && !isCollapsedHere && groupsWithInnerGroups.has(ni);

        const wantsNewlineBefore =
          newlineExclusions !== undefined &&
          collapsedDepth === 0 &&
          !newlineExclusions.has(node.tag) &&
          currentLineNodes.some(n => n.type === 'text');
        // Every visible collapsible group starts on its own line so that each
        // group (top-level or nested) is rendered on its own row.
        const groupNeedsOwnLine =
          visibleChrome &&
          currentLineNodes.some(n => n.type === 'text' || n.type === 'tag');
        if (wantsNewlineBefore || groupNeedsOwnLine) {
          flushLine();
          startedByImplicitBreak = true;
        }

        activeTags.push({
          tag: node.tag,
          props: node.props,
          remaining: node.wordCount,
          nodeIndex: ni,
          _ownsBlock: ownsBlock,
        });
        if (isCollapsedHere) {
          collapsedDepth++;
        }
        currentLineNodes.push({ ...node, _nodeIndex: ni });

        // Put the toggle alone on its line and indent the group's content.
        if (ownsBlock) {
          flushLine();
          groupDepth++;
        }
        break;
      }

      case 'text': {
        startedByImplicitBreak = false;
        currentLineNodes.push({ ...node, _nodeIndex: ni, _wordIndex: wordIndex });
        wordIndex++;
        // Decrement active tags
        for (const t of activeTags) {
          if (t.remaining > 0) t.remaining--;
        }
        let blocksClosed = 0;
        for (let i = activeTags.length - 1; i >= 0; i--) {
          if (activeTags[i].remaining <= 0) {
            if (collapsibleTags.has(activeTags[i].tag) && collapsedGroups.has(activeTags[i].nodeIndex)) {
              collapsedDepth--;
            }
            if (activeTags[i]._ownsBlock) blocksClosed++;
            activeTags.splice(i, 1);
          }
        }
        // A block group's last word ends its block: flush at the deeper depth,
        // then drop the indentation so following siblings render one level up.
        if (blocksClosed > 0) {
          flushLine();
          groupDepth = Math.max(0, groupDepth - blocksClosed);
        }
        break;
      }
    }
  }

  // Flush last line
  if (currentLineNodes.length > 0) {
    flushLine();
  }

  // Auto-split long lines by character count so each line fits on one visual
  // row. With a small maxCharsPerLine (virtual scroll) this keeps every line a
  // single fixed-height row; with the large default it only guards against
  // pathological mega-lines.
  const splitLines = [];
  for (const line of lines) {
    if (line.wordCount === 0) {
      splitLines.push(line);
      continue;
    }

    // Never split a line that contains a collapsed group — it renders as a
    // short summary (one row) and splitting would break the group span.
    const hasCollapsedGroup = line.nodes.some(
      n => n.type === 'tag' && collapsibleTags.has(n.tag) && collapsedGroups.has(n._nodeIndex)
    );

    // Reduce effective width by the indent (each level is 2em ≈ 2 chars)
    const effectiveMax = Math.max(10, maxCharsPerLine - line.indentLevel * 2);

    // Measure total chars (text + space + word-span padding overhead)
    let totalChars = 0;
    for (const node of line.nodes) {
      if (node.type === 'text') totalChars += node.value.length + 2;
    }
    if (hasCollapsedGroup || totalChars <= effectiveMax) {
      splitLines.push(line);
      continue;
    }

    // Split into chunks at ~effectiveMax boundaries.
    // Track page tags within the line so each chunk carries the correct page.
    let chunk = [];
    let chunkWordStart = line.wordStart;
    let wordsInChunk = 0;
    let charsInChunk = 0;
    // activePage: the page active at the start of the current chunk.
    // Initialise from the line's page value (set before any mid-line tags).
    let activePage = line.page || null;
    let chunkPageTag = null; // page tag encountered in the current chunk

    function flushChunk(isMid) {
      const sl = {
        nodes: chunk,
        indentLevel: line.indentLevel,
        wordStart: chunkWordStart,
        wordCount: wordsInChunk,
        activeTags: line.activeTags,
      };
      if (isMid) sl.midSplit = true;
      // If a page tag was seen in this chunk, this chunk starts that page.
      if (chunkPageTag) {
        sl.page = chunkPageTag;
        sl.pageStart = true;
        activePage = chunkPageTag;
      } else if (activePage) {
        sl.page = activePage;
      }
      splitLines.push(sl);
      chunkWordStart += wordsInChunk;
      wordsInChunk = 0;
      charsInChunk = 0;
      chunk = [];
      chunkPageTag = null;
    }

    for (const node of line.nodes) {
      chunk.push(node);
      if (node.type === 'tag' && node.tag === 'page' && node.wordCount === 0) {
        chunkPageTag = node.props.value || null;
      }
      if (node.type === 'text') {
        wordsInChunk++;
        charsInChunk += node.value.length + 2;
        if (charsInChunk >= effectiveMax) {
          flushChunk(true);
        }
      }
    }
    if (chunk.length > 0) {
      flushChunk(false);
    }
  }

  return { lines: splitLines, wordCount: wordIndex };
}

/**
 * Render a range of pre-computed lines into a container.
 *
 * @param {object[]} lines - from prepareLines()
 * @param {number} startLine - first line index to render (inclusive)
 * @param {number} endLine - last line index to render (exclusive)
 * @param {HTMLElement} container - element to render into (cleared first)
 * @param {object} [options]
 * @param {Set<number>} [options.collapsedGroups]
 * @param {Set<string>} [options.collapsibleTags]
 * @returns {{ wordElements: Map<number, HTMLElement> }}
 *   Map from global word index to DOM element (only for rendered words)
 */
export function renderLines(lines, startLine, endLine, container, options = {}) {
  const collapsedGroups = options.collapsedGroups || new Set();
  const collapsibleTags = options.collapsibleTags || new Set(['group']);
  container.innerHTML = '';

  const wordElements = new Map();

  // Rebuild active tags state at startLine by scanning lines[0..startLine)
  const activeTags = [];
  if (startLine > 0 && lines[startLine]) {
    // Use the activeTags snapshot stored on this line
    // We need to recompute from scratch for accuracy
    recomputeActiveTagsAt(lines, startLine, activeTags);
  }

  const activeGroups = [];

  for (let li = startLine; li < endLine && li < lines.length; li++) {
    const line = lines[li];
    const lineEl = document.createElement('div');
    lineEl.classList.add('gmr-line');
    if (line.midSplit) lineEl.classList.add('gmr-line-mid');
    lineEl.style.marginInlineStart = `${line.indentLevel * 2}em`;
    lineEl.dataset.lineIndex = String(li);

    {
      const gutter = document.createElement('span');
      gutter.className = 'gmr-page-gutter';
      if (line.pageStart) {
        gutter.textContent = line.page;
        gutter.classList.add('gmr-page-gutter-label');
      }
      lineEl.appendChild(gutter);
    }

    // Re-anchor groups carried over from previous lines to the CURRENT line so
    // their content is appended here, not into the element created on the line
    // where the group opened. Collapsed groups never span lines, so only
    // expanded groups need re-anchoring. Visual nesting is conveyed by the
    // per-line indent computed in prepareLines.
    for (const g of activeGroups) {
      if (!g.collapsed) g.element = lineEl;
    }
    container.appendChild(lineEl);

    if (line.wordCount === 0 && !line.nodes.some(n => n.type === 'tag' && collapsibleTags.has(n.tag))) {
      lineEl.appendChild(document.createElement('br'));
    }

    let lineHasVisibleWord = false;

    for (const node of line.nodes) {
      switch (node.type) {
        case 'indent':
          break;

        case 'tag':
          activeTags.push({
            tag: node.tag,
            props: node.props,
            remaining: node.wordCount,
            nodeIndex: node._nodeIndex,
          });

          {
            const isCollapsible = collapsibleTags.has(node.tag);
            const hideCollapsibleChrome =
              isCollapsible && anyCollapsedCollapsibleAncestor(activeGroups);

            if (isCollapsible && !hideCollapsibleChrome) {
              const collapsed = collapsedGroups.has(node._nodeIndex);
              const groupEl = document.createElement('span');
              groupEl.classList.add('gmr-group');
              groupEl.dataset.nodeIndex = String(node._nodeIndex);
              if (collapsed) groupEl.classList.add('gmr-group-collapsed');

              const toggle = document.createElement('button');
              toggle.className = 'gmr-group-toggle';
              toggle.dataset.nodeIndex = String(node._nodeIndex);
              toggle.textContent = collapsed ? '◀' : '▼';
              toggle.type = 'button';

              const shellParent =
                findLastExpandedCollapsible(activeGroups)?.element ?? lineEl;
              shellParent.appendChild(toggle);
              shellParent.appendChild(groupEl);

              activeGroups.push({
                nodeIndex: node._nodeIndex,
                element: groupEl,
                remaining: node.wordCount,
                collapsed,
                label: node.props.label || null,
                words: [],
              });

              if (collapsed) {
                const summary = document.createElement('span');
                summary.className = 'gmr-group-summary';
                groupEl.appendChild(summary);
                activeGroups[activeGroups.length - 1].summaryEl = summary;
              }
            }
          }
          break;

        case 'text': {
          const span = document.createElement('span');
          span.classList.add('gmr-word');
          span.textContent = node.value;
          span.dataset.wordIndex = String(node._wordIndex);

          for (const active of activeTags) {
            if (active.remaining > 0) {
              span.classList.add(`tag-${active.tag}`);
              for (const [k, v] of Object.entries(active.props)) {
                span.dataset[`tag${capitalize(camelCase(active.tag))}${capitalize(k)}`] = v;
              }
            }
          }

          let insideCollapsedGroup = false;
          for (const g of activeGroups) {
            if (g.collapsed && g.remaining > 0) {
              insideCollapsedGroup = true;
              g.words.push(node.value);
            }
          }

          if (insideCollapsedGroup) {
            span.classList.add('gmr-word-hidden');
            const innerGroup = findLastCollapsedCollapsible(activeGroups);
            if (innerGroup) innerGroup.element.appendChild(span);
          } else {
            if (lineHasVisibleWord) {
              lineEl.appendChild(document.createTextNode(' '));
            }
            lineEl.appendChild(span);
            lineHasVisibleWord = true;
          }

          wordElements.set(node._wordIndex, span);

          for (const active of activeTags) {
            if (active.remaining > 0) active.remaining--;
          }
          for (let i = activeTags.length - 1; i >= 0; i--) {
            if (activeTags[i].remaining <= 0) activeTags.splice(i, 1);
          }

          for (let gi = activeGroups.length - 1; gi >= 0; gi--) {
            const g = activeGroups[gi];
            if (g.remaining > 0) g.remaining--;
            if (g.remaining <= 0) {
              if (g.collapsed && g.summaryEl) {
                const labelText = g.label || g.words.slice(0, 10).join(' ') + (g.words.length > 10 ? '…' : '');
                g.summaryEl.textContent = labelText;
              }
              activeGroups.splice(gi, 1);
            }
          }
          break;
        }
      }
    }
  }

  return { wordElements };
}

/**
 * Render a single prepared line into a new div element.
 * Returns the div and a Map of wordElements for that line.
 *
 * @param {object} line - single entry from prepareLines().lines
 * @param {object[]} allLines - full lines array (for tag recomputation)
 * @param {number} lineIndex - index of this line in allLines
 * @param {object} [options]
 * @param {Set<number>} [options.collapsedGroups]
 * @param {Set<string>} [options.collapsibleTags]
 * @returns {{ lineEl: HTMLElement, wordElements: Map<number, HTMLElement> }}
 */
export function renderSingleLine(line, allLines, lineIndex, options = {}) {
  const collapsedGroups = options.collapsedGroups || new Set();
  const collapsibleTags = options.collapsibleTags || new Set(['group']);
  const wordElements = new Map();

  const activeTags = [];
  if (lineIndex > 0) {
    recomputeActiveTagsAt(allLines, lineIndex, activeTags);
  }

  const activeGroups = [];

  const lineEl = document.createElement('div');
  lineEl.classList.add('gmr-line');
  if (line.midSplit) lineEl.classList.add('gmr-line-mid');
  lineEl.style.marginInlineStart = `${line.indentLevel * 2}em`;
  lineEl.dataset.lineIndex = String(lineIndex);

  {
    const gutter = document.createElement('span');
    gutter.className = 'gmr-page-gutter';
    if (line.pageStart) {
      gutter.textContent = line.page;
      gutter.classList.add('gmr-page-gutter-label');
    }
    lineEl.appendChild(gutter);
  }

  if (line.wordCount === 0 && !line.nodes.some(n => n.type === 'tag' && collapsibleTags.has(n.tag))) {
    lineEl.appendChild(document.createElement('br'));
  }

  let lineHasVisibleWord = false;

  for (const node of line.nodes) {
    switch (node.type) {
      case 'indent':
        break;

      case 'tag':
        activeTags.push({
          tag: node.tag,
          props: node.props,
          remaining: node.wordCount,
          nodeIndex: node._nodeIndex,
        });

        {
          const isCollapsible = collapsibleTags.has(node.tag);
          const hideCollapsibleChrome =
            isCollapsible && anyCollapsedCollapsibleAncestor(activeGroups);

          if (isCollapsible && !hideCollapsibleChrome) {
            const collapsed = collapsedGroups.has(node._nodeIndex);
            const groupEl = document.createElement('span');
            groupEl.classList.add('gmr-group');
            groupEl.dataset.nodeIndex = String(node._nodeIndex);
            if (collapsed) groupEl.classList.add('gmr-group-collapsed');

            const toggle = document.createElement('button');
            toggle.className = 'gmr-group-toggle';
            toggle.dataset.nodeIndex = String(node._nodeIndex);
            toggle.textContent = collapsed ? '◀' : '▼';
            toggle.type = 'button';

            const shellParent =
              findLastExpandedCollapsible(activeGroups)?.element ?? lineEl;
            shellParent.appendChild(toggle);
            shellParent.appendChild(groupEl);

            activeGroups.push({
              nodeIndex: node._nodeIndex,
              element: groupEl,
              remaining: node.wordCount,
              collapsed,
              label: node.props.label || null,
              words: [],
            });

            if (collapsed) {
              const summary = document.createElement('span');
              summary.className = 'gmr-group-summary';
              groupEl.appendChild(summary);
              activeGroups[activeGroups.length - 1].summaryEl = summary;
            }
          }
        }
        break;

      case 'text': {
        const span = document.createElement('span');
        span.classList.add('gmr-word');
        span.textContent = node.value;
        span.dataset.wordIndex = String(node._wordIndex);

        for (const active of activeTags) {
          if (active.remaining > 0) {
            span.classList.add(`tag-${active.tag}`);
            for (const [k, v] of Object.entries(active.props)) {
              span.dataset[`tag${capitalize(camelCase(active.tag))}${capitalize(k)}`] = v;
            }
          }
        }

        let insideCollapsedGroup = false;
        for (const g of activeGroups) {
          if (g.collapsed && g.remaining > 0) {
            insideCollapsedGroup = true;
            g.words.push(node.value);
          }
        }

        if (insideCollapsedGroup) {
          span.classList.add('gmr-word-hidden');
          const innerGroup = findLastCollapsedCollapsible(activeGroups);
          if (innerGroup) innerGroup.element.appendChild(span);
        } else {
          if (lineHasVisibleWord) {
            lineEl.appendChild(document.createTextNode(' '));
          }
          lineEl.appendChild(span);
          lineHasVisibleWord = true;
        }

        wordElements.set(node._wordIndex, span);

        for (const active of activeTags) {
          if (active.remaining > 0) active.remaining--;
        }
        for (let i = activeTags.length - 1; i >= 0; i--) {
          if (activeTags[i].remaining <= 0) activeTags.splice(i, 1);
        }

        for (let gi = activeGroups.length - 1; gi >= 0; gi--) {
          const g = activeGroups[gi];
          if (g.remaining > 0) g.remaining--;
          if (g.remaining <= 0) {
            if (g.collapsed && g.summaryEl) {
              const labelText = g.label || g.words.slice(0, 10).join(' ') + (g.words.length > 10 ? '…' : '');
              g.summaryEl.textContent = labelText;
            }
            activeGroups.splice(gi, 1);
          }
        }
        break;
      }
    }
  }

  return { lineEl, wordElements };
}

/**
 * Recompute active tags state at a given line index by scanning prior lines.
 */
function recomputeActiveTagsAt(lines, targetLine, activeTags) {
  activeTags.length = 0;
  const pending = [];

  for (let li = 0; li < targetLine; li++) {
    for (const node of lines[li].nodes) {
      if (node.type === 'tag') {
        pending.push({ tag: node.tag, props: node.props, remaining: node.wordCount, nodeIndex: node._nodeIndex });
      } else if (node.type === 'text') {
        for (const p of pending) {
          if (p.remaining > 0) p.remaining--;
        }
        for (let i = pending.length - 1; i >= 0; i--) {
          if (pending[i].remaining <= 0) pending.splice(i, 1);
        }
      }
    }
  }

  for (const p of pending) {
    if (p.remaining > 0) activeTags.push(p);
  }
}

/**
 * Full render (for small documents or tests). Renders ALL nodes.
 *
 * @param {Node[]} nodes
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {Set<number>} [options.collapsedGroups]
 * @param {Set<string>} [options.collapsibleTags]
 * @returns {{ root: HTMLElement, wordElements: HTMLElement[] }}
 */
export function render(nodes, container, options = {}) {
  const { lines, wordCount } = prepareLines(nodes, options);
  const result = renderLines(lines, 0, lines.length, container, options);

  // Convert Map to ordered array for backward compat
  const wordElements = new Array(wordCount);
  for (let i = 0; i < wordCount; i++) {
    wordElements[i] = result.wordElements.get(i) || null;
  }

  return { root: container, wordElements };
}

/** @param {string} str */
function capitalize(str) {
  if (!str) return '';
  return str[0].toUpperCase() + str.slice(1);
}

/**
 * Convert a hyphenated string to camelCase (e.g. "refers-to" -> "refersTo").
 * @param {string} str
 */
function camelCase(str) {
  return str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}
