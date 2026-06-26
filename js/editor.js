/**
 * Editor module: provides gap-based cursor, word selection, tag insertion,
 * indentation, line break controls, keyboard cursor, drag selection, paste,
 * hover tooltips, collapsible groups, and context menu integration.
 *
 * Uses virtual scrolling for large documents (>500 words) to keep the DOM
 * small and rendering fast.  The scroller is one-directional: scroll events
 * report the first visible line; the editor renders that slice.  No feedback
 * loops — every action triggers exactly one render.
 */

import { render, prepareLines, renderLines } from './renderer.js';
import { createVirtualScroll } from './virtual-scroll.js';

/**
 * @typedef {import('./parser.js').Node} Node
 */

const VIRTUAL_THRESHOLD = 500;
const LINE_HEIGHT = 50;

/**
 * Create an editor instance.
 *
 * @param {HTMLElement} container - DOM element to host the editor
 * @param {Node[]} initialNodes - parsed AST to start editing
 * @param {object} [options]
 * @param {Set<string>} [options.newlineBeforeExclusions]
 * @param {Set<string>} [options.collapsibleTags]
 * @param {boolean} [options.useVirtualScroll=true]
 * @returns {EditorInstance}
 */
export function createEditor(container, initialNodes, options = {}) {
  const newlineBeforeExclusions = options.newlineBeforeExclusions;
  const collapsibleTags =
    options.collapsibleTags instanceof Set ? options.collapsibleTags : new Set(['group']);
  const useVirtualScroll = options.useVirtualScroll !== false;

  function rendererOpts() {
    return { collapsedGroups, newlineBeforeExclusions, collapsibleTags };
  }
  let nodes = [...initialNodes];
  // wordElements: for full render = array; for virtual = Map<wordIndex, HTMLElement>
  let wordElements = [];
  let totalWordCount = 0;

  // Gap-based cursor: position between words [0, wordCount]
  let cursorPos = null;

  // Selection: word index range (start <= end), or null
  let selStart = null;
  let selEnd = null;

  // Drag state
  let dragging = false;
  let dragOrigin = null;

  // Hover tooltip
  let hoverEnabled = true;
  let tooltipEl = null;
  let tagMap = new Map();

  // Collapsed groups: set of node indices (of group tag nodes) that are collapsed
  let collapsedGroups = new Set();

  function isDefaultCollapsedTrue(props) {
    if (!props) return false;
    const v = props.default_collapsed;
    if (v === undefined || v === null) return false;
    if (typeof v === 'boolean') return v;
    const s = String(v).toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }

  function initCollapsedGroupsFromProps() {
    collapsedGroups.clear();
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.type === 'tag' && collapsibleTags.has(n.tag) && isDefaultCollapsedTrue(n.props)) {
        collapsedGroups.add(i);
      }
    }
  }

  function remapCollapsedGroupsAfterInsert(insertAt) {
    const next = new Set();
    for (const idx of collapsedGroups) {
      next.add(idx >= insertAt ? idx + 1 : idx);
    }
    collapsedGroups.clear();
    for (const idx of next) collapsedGroups.add(idx);
  }

  function remapCollapsedGroupsAfterTagDelete(removedIdx) {
    const next = new Set();
    for (const idx of collapsedGroups) {
      if (idx === removedIdx) continue;
      next.add(idx > removedIdx ? idx - 1 : idx);
    }
    collapsedGroups.clear();
    for (const idx of next) collapsedGroups.add(idx);
  }

  // Undo/redo stacks
  const UNDO_LIMIT = 20;
  let undoStack = [];
  let redoStack = [];

  // Cursor bar element
  let cursorBarEl = null;

  // Virtual scroll state
  let virtualScroll = null;
  let preparedLines = null;
  let useVirtual = false;
  // Track rendered line range to skip redundant renders on scroll
  let vsRenderedStart = -1;
  let vsRenderedEnd = -1;
  // Suppress scroll callback while we're modifying the DOM
  let vsRendering = false;
  // Measured max chars that fit on one visual row (for single-row lines)
  let charsPerLine = 60;
  // Extra lines rendered below the viewport (above is never needed — content
  // is pinned to the top of the viewport).
  const OVERSCAN_BELOW = 5;

  // ─── Undo/Redo ──────────────────────────────────────────────

  function pushUndo() {
    undoStack.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      cursorPos,
      selStart,
      selEnd,
    });
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack = [];
  }

  function undo() {
    if (undoStack.length === 0) return;
    redoStack.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      cursorPos,
      selStart,
      selEnd,
    });
    const state = undoStack.pop();
    nodes = state.nodes;
    cursorPos = state.cursorPos;
    selStart = state.selStart;
    selEnd = state.selEnd;
    rerender();
  }

  function redo() {
    if (redoStack.length === 0) return;
    undoStack.push({
      nodes: JSON.parse(JSON.stringify(nodes)),
      cursorPos,
      selStart,
      selEnd,
    });
    const state = redoStack.pop();
    nodes = state.nodes;
    cursorPos = state.cursorPos;
    selStart = state.selStart;
    selEnd = state.selEnd;
    rerender();
  }

  // ─── Rendering ───────────────────────────────────────────────

  function rerender() {
    removeListeners();
    removeCursorBar();

    const wordCount = nodes.filter(n => n.type === 'text').length;
    totalWordCount = wordCount;
    useVirtual = useVirtualScroll && wordCount > VIRTUAL_THRESHOLD;

    if (useVirtual) {
      rerenderVirtual();
    } else {
      rerenderFull();
    }

    tagMap = buildTagMap();
    attachListeners();
    updateHighlight();
  }

  function rerenderFull() {
    if (virtualScroll) {
      virtualScroll.destroy();
      virtualScroll = null;
      container.innerHTML = '';
    }
    const result = render(nodes, container, rendererOpts());
    wordElements = result.wordElements;
  }

  /**
   * Measure how many characters fit on one visual row at the current font
   * and container width.  Run ONCE per rerenderVirtual (never on scroll), so
   * it cannot cause a loop.  A safety factor leaves room for justification.
   */
  function measureCharsPerLine() {
    const probe = document.createElement('span');
    probe.style.visibility = 'hidden';
    probe.style.position = 'absolute';
    probe.style.whiteSpace = 'nowrap';
    probe.style.pointerEvents = 'none';
    // Representative Hebrew sample.
    const sample = 'אבגדהוזחטיכלמנסעפצקרשת ';
    probe.textContent = sample.repeat(6);
    container.appendChild(probe);
    let perChar = 0;
    try {
      const rect = probe.getBoundingClientRect();
      perChar = rect.width / probe.textContent.length;
    } finally {
      probe.remove();
    }
    const avail = container.clientWidth || 800;
    if (!perChar || perChar <= 0) return 60;
    // 0.92 safety factor so justify can stretch without forcing a wrap.
    return Math.max(20, Math.floor((avail * 0.92) / perChar));
  }

  /**
   * Virtual rerender: measure, prepare single-row lines, set scroll range,
   * render the visible window. Keeps the user near their previous percent.
   */
  function rerenderVirtual() {
    // Anchor scroll position by the wordStart of the first visible line so
    // edits that change line count don't shift the viewport.
    let anchorWord = -1;
    if (virtualScroll && preparedLines && vsRenderedStart >= 0) {
      const anchorLine = preparedLines.lines[vsRenderedStart];
      if (anchorLine) anchorWord = anchorLine.wordStart;
    }

    container.classList.add('gmr-rendered');

    if (!virtualScroll) {
      container.innerHTML = '';
      virtualScroll = createVirtualScroll(container, {
        lineHeight: LINE_HEIGHT,
        onScroll: onVirtualScroll,
      });
    }

    charsPerLine = measureCharsPerLine();
    preparedLines = prepareLines(nodes, { ...rendererOpts(), maxCharsPerLine: charsPerLine });

    // Invalidate cached range so the next renderVisibleLines always renders
    vsRenderedStart = -1;
    vsRenderedEnd = -1;

    virtualScroll.setTotalLines(preparedLines.lines.length);

    if (anchorWord >= 0) {
      // Find the line whose wordStart best matches the anchor
      let bestLine = 0;
      for (let i = 0; i < preparedLines.lines.length; i++) {
        if (preparedLines.lines[i].wordStart <= anchorWord) bestLine = i;
        else break;
      }
      virtualScroll.scrollToLine(bestLine);
    }

    renderVisibleLines();
  }

  /**
   * Scroll callback from virtual scroller (receives percent). Skips if we're
   * already inside a render (DOM-change → scroll → render can't recurse).
   */
  function onVirtualScroll(_percent) {
    if (vsRendering) return;
    if (!virtualScroll || !preparedLines) return;
    renderVisibleLines();
  }

  /**
   * Render the visible window of lines into the (sticky) content element.
   * The first line index is derived from the scroll PERCENT and viewport
   * capacity. Skips entirely when the window hasn't changed.
   */
  function renderVisibleLines() {
    if (!virtualScroll || !preparedLines) return;
    const total = preparedLines.lines.length;
    const vpLines = virtualScroll.getViewportLineCount();
    const first = virtualScroll.getFirstLine();

    const start = Math.max(0, Math.min(first, Math.max(0, total - vpLines)));
    const end = Math.min(total, start + vpLines + OVERSCAN_BELOW);

    if (start === vsRenderedStart && end === vsRenderedEnd) return;

    vsRendering = true;
    try {
      const contentEl = virtualScroll.getContentEl();
      const result = renderLines(
        preparedLines.lines, start, end, contentEl, rendererOpts()
      );
      wordElements = result.wordElements;
      vsRenderedStart = start;
      vsRenderedEnd = end;

      updateHighlight();
    } finally {
      vsRendering = false;
    }
  }

  function getWordEl(wordIndex) {
    if (useVirtual) {
      return wordElements instanceof Map ? wordElements.get(wordIndex) || null : null;
    }
    return wordElements[wordIndex] || null;
  }

  function getWordCount() {
    return totalWordCount;
  }

  function removeListeners() {
    container.removeEventListener('mousedown', onContainerMouseDown);
    container.removeEventListener('mouseup', onMouseUp);
    container.removeEventListener('mouseover', onMouseOver);
    container.removeEventListener('mouseout', onMouseOut);
    container.removeEventListener('contextmenu', onContextMenu);
    container.removeEventListener('paste', onPaste);
    container.removeEventListener('click', onContainerClick);
  }

  function attachListeners() {
    container.addEventListener('mousedown', onContainerMouseDown);
    container.addEventListener('mouseup', onMouseUp);
    container.addEventListener('mouseover', onMouseOver);
    container.addEventListener('mouseout', onMouseOut);
    container.addEventListener('contextmenu', onContextMenu);
    container.addEventListener('paste', onPaste);
    container.addEventListener('click', onContainerClick);
  }

  // ─── Tag Map (word index -> covering tags) ──────────────────

  function buildTagMap() {
    const map = new Map();
    let wordIdx = 0;
    const pending = [];

    for (let ni = 0; ni < nodes.length; ni++) {
      const node = nodes[ni];
      if (node.type === 'tag') {
        pending.push({ tag: node.tag, props: node.props, remaining: node.wordCount, nodeIndex: ni });
      } else if (node.type === 'text') {
        const tags = [];
        for (const p of pending) {
          if (p.remaining > 0) {
            tags.push({ tag: p.tag, props: p.props, nodeIndex: p.nodeIndex });
          }
        }
        if (tags.length > 0) map.set(wordIdx, tags);
        for (const p of pending) {
          if (p.remaining > 0) p.remaining--;
        }
        for (let i = pending.length - 1; i >= 0; i--) {
          if (pending[i].remaining <= 0) pending.splice(i, 1);
        }
        wordIdx++;
      }
    }
    return map;
  }

  // ─── Highlight (cursor bar + selection) ─────────────────────

  let prevSelLo = null;
  let prevSelHi = null;

  function updateHighlight() {
    // Clear previously highlighted elements
    if (prevSelLo !== null && prevSelHi !== null) {
      for (let i = prevSelLo; i <= prevSelHi; i++) {
        const el = getWordEl(i);
        if (el) el.classList.remove('gmr-selected');
      }
      // Also clear collapsed group summary highlights
      clearCollapsedGroupHighlights();
    }

    // Apply new selection
    if (selStart !== null && selEnd !== null) {
      const lo = Math.min(selStart, selEnd);
      const hi = Math.max(selStart, selEnd);
      for (let i = lo; i <= hi; i++) {
        const el = getWordEl(i);
        if (el) el.classList.add('gmr-selected');
      }
      // Highlight collapsed group summaries whose word range overlaps selection
      highlightCollapsedGroupSummaries(lo, hi);
      prevSelLo = lo;
      prevSelHi = hi;
    } else {
      prevSelLo = null;
      prevSelHi = null;
    }

    // Cursor bar
    removeCursorBar();
    if (cursorPos !== null) {
      const wc = getWordCount();
      const targetEl = cursorPos < wc ? getWordEl(cursorPos) : null;
      const lastEl = wc > 0 ? getWordEl(wc - 1) : null;

      cursorBarEl = document.createElement('span');
      cursorBarEl.className = 'gmr-cursor-bar';
      cursorBarEl.setAttribute('aria-hidden', 'true');

      if (targetEl) {
        cursorBarEl.classList.add('gmr-cursor-start');
        targetEl.appendChild(cursorBarEl);
      } else if (lastEl && cursorPos >= wc) {
        cursorBarEl.classList.add('gmr-cursor-end');
        lastEl.appendChild(cursorBarEl);
      }
    }
  }

  function clearCollapsedGroupHighlights() {
    const summaries = container.querySelectorAll('.gmr-group-summary.gmr-selected');
    for (const s of summaries) s.classList.remove('gmr-selected');
  }

  function highlightCollapsedGroupSummaries(lo, hi) {
    const groups = getGroups();
    for (const g of groups) {
      if (!g.collapsed) continue;
      const gEnd = g.wordStart + g.wordCount - 1;
      if (g.wordStart <= hi && gEnd >= lo) {
        const summaryEl = container.querySelector(
          `.gmr-group[data-node-index="${g.nodeIndex}"] .gmr-group-summary`
        );
        if (summaryEl) summaryEl.classList.add('gmr-selected');
      }
    }
  }

  function removeCursorBar() {
    if (cursorBarEl) {
      cursorBarEl.remove();
      cursorBarEl = null;
    }
  }

  // ─── Scroll cursor into view (virtual scroll) ───────────────

  function scrollCursorIntoView() {
    if (cursorPos === null) return;
    const targetWord = cursorPos < getWordCount() ? cursorPos : getWordCount() - 1;
    if (targetWord < 0) return;
    const el = getWordEl(targetWord);
    if (!el) {
      if (!virtualScroll || !preparedLines) return;
      for (let li = 0; li < preparedLines.lines.length; li++) {
        const line = preparedLines.lines[li];
        if (targetWord >= line.wordStart && targetWord < line.wordStart + line.wordCount) {
          virtualScroll.scrollToLine(li);
          renderVisibleLines();
          return;
        }
      }
      virtualScroll.scrollToLine(preparedLines.lines.length - 1);
      renderVisibleLines();
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    if (elRect.top >= containerRect.top && elRect.bottom <= containerRect.bottom) return;

    el.scrollIntoView({ block: 'nearest' });
  }

  // ─── Mouse selection (event delegation) ─────────────────────

  function wordIndexFromEl(el) {
    if (!el || !el.dataset || !el.dataset.wordIndex) return null;
    return parseInt(el.dataset.wordIndex, 10);
  }

  /**
   * Get the word index range for a collapsed group summary element.
   * Returns { start, end } or null.
   */
  function collapsedGroupRangeFromSummary(el) {
    const groupEl = el.closest('.gmr-group');
    if (!groupEl) return null;
    const nodeIdx = parseInt(groupEl.dataset.nodeIndex, 10);
    if (isNaN(nodeIdx)) return null;
    const groups = getGroups();
    const g = groups.find(gr => gr.nodeIndex === nodeIdx && gr.collapsed);
    if (!g) return null;
    return { start: g.wordStart, end: g.wordStart + g.wordCount - 1 };
  }

  function onContainerMouseDown(e) {
    // Handle clicks on collapsed group summaries like word clicks
    const summaryEl = e.target.closest('.gmr-group-summary');
    if (summaryEl && e.button !== 2) {
      const range = collapsedGroupRangeFromSummary(summaryEl);
      if (range) {
        if (e.shiftKey && selStart !== null) {
          selStart = Math.min(selStart, range.start);
          selEnd = Math.max(selEnd, range.end);
          cursorPos = range.start;
        } else {
          dragging = true;
          dragOrigin = range.start;
          cursorPos = range.start;
          selStart = range.start;
          selEnd = range.end;
        }
        updateHighlight();
        e.preventDefault();
        return;
      }
    }

    const wordEl = e.target.closest('.gmr-word');
    if (wordEl) {
      if (e.button === 2) return;
      const idx = wordIndexFromEl(wordEl);
      if (idx === null) return;

      if (e.shiftKey && selStart !== null) {
        selStart = Math.min(selStart, idx);
        selEnd = Math.max(selEnd, idx);
        cursorPos = idx;
      } else {
        dragging = true;
        dragOrigin = idx;
        cursorPos = idx;
        selStart = idx;
        selEnd = idx;
      }
      updateHighlight();
      e.preventDefault();
      return;
    }

    // Click on empty area
    if (e.target === container || e.target.classList.contains('gmr-line')) {
      cursorPos = getWordCount();
      selStart = null;
      selEnd = null;
      updateHighlight();
    }
  }

  function onMouseUp() {
    if (!dragging) return;
    dragging = false;
    dragOrigin = null;
  }

  function onMouseOver(e) {
    // Handle drag over collapsed group summaries
    const summaryEl = e.target.closest('.gmr-group-summary');
    if (summaryEl && dragging && dragOrigin !== null) {
      const range = collapsedGroupRangeFromSummary(summaryEl);
      if (range) {
        selStart = Math.min(dragOrigin, range.start);
        selEnd = Math.max(dragOrigin, range.end);
        cursorPos = range.start;
        updateHighlight();
        return;
      }
    }

    const wordEl = e.target.closest('.gmr-word');
    if (!wordEl) return;
    const idx = wordIndexFromEl(wordEl);
    if (idx === null) return;

    if (dragging && dragOrigin !== null) {
      selStart = Math.min(dragOrigin, idx);
      selEnd = Math.max(dragOrigin, idx);
      cursorPos = idx;
      updateHighlight();
    }

    if (hoverEnabled && tagMap.has(idx)) {
      showTooltip(wordEl, tagMap.get(idx));
    }
  }

  function onMouseOut(e) {
    const wordEl = e.target.closest('.gmr-word');
    if (wordEl) {
      hideTooltip();
    }
  }

  function onContainerClick(e) {
    const toggle = e.target.closest('.gmr-group-toggle');
    if (toggle) {
      onGroupToggle({ currentTarget: toggle });
    }
  }

  // ─── Keyboard ───────────────────────────────────────────────

  function onKeyDown(e) {
    const active = document.activeElement;
    if (active && active.closest('.popup, .select-popup-backdrop')) return;

    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if (e.key === 'y' || e.key === 'Y') {
        e.preventDefault();
        redo();
        return;
      }
    }

    if (!getWordCount()) return;

    switch (e.key) {
      case 'ArrowRight': {
        e.preventDefault();
        if (cursorPos === null) { cursorPos = 0; }
        else if (cursorPos > 0) { cursorPos--; }
        if (!e.shiftKey) { selStart = cursorPos; selEnd = cursorPos; }
        else { extendSelectionToCursor(); }
        scrollCursorIntoView();
        updateHighlight();
        break;
      }
      case 'ArrowLeft': {
        e.preventDefault();
        if (cursorPos === null) { cursorPos = 0; }
        else if (cursorPos < getWordCount()) { cursorPos++; }
        if (!e.shiftKey) { selStart = cursorPos; selEnd = cursorPos; }
        else { extendSelectionToCursor(); }
        scrollCursorIntoView();
        updateHighlight();
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        moveCursorVertical(-1, e.shiftKey);
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        moveCursorVertical(1, e.shiftKey);
        break;
      }
      case 'Enter': {
        e.preventDefault();
        insertBreakAtCursor();
        break;
      }
      case 'Delete': {
        e.preventDefault();
        deleteForward();
        break;
      }
      case 'Backspace': {
        e.preventDefault();
        deleteBackward();
        break;
      }
      case 'Tab': {
        e.preventDefault();
        if (e.shiftKey) {
          insertIndent('out');
        } else if (selStart !== null && selEnd !== null && selStart !== selEnd) {
          wrapSelectionWithIndent();
        } else {
          insertIndent('in');
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        selStart = null;
        selEnd = null;
        updateHighlight();
        break;
      }
    }
  }

  function extendSelectionToCursor() {
    if (selStart === null) {
      selStart = cursorPos;
      selEnd = cursorPos;
    } else {
      if (cursorPos < selStart) selStart = cursorPos;
      else if (cursorPos > selEnd) selEnd = cursorPos;
      else {
        selStart = Math.min(cursorPos, selStart);
        selEnd = Math.max(cursorPos, selEnd);
      }
    }
  }

  // ─── Vertical cursor movement ──────────────────────────────

  function findLineForWord(wordIndex) {
    if (!preparedLines) return -1;
    for (let i = 0; i < preparedLines.lines.length; i++) {
      const line = preparedLines.lines[i];
      if (wordIndex >= line.wordStart && wordIndex < line.wordStart + line.wordCount) {
        return i;
      }
    }
    if (preparedLines.lines.length > 0) {
      const last = preparedLines.lines[preparedLines.lines.length - 1];
      if (wordIndex >= last.wordStart + last.wordCount) {
        return preparedLines.lines.length - 1;
      }
    }
    return -1;
  }

  function moveCursorVertical(direction, extendSel) {
    if (cursorPos === null) { cursorPos = 0; }
    if (!preparedLines || preparedLines.lines.length === 0) return;

    const lineIdx = findLineForWord(cursorPos);
    if (lineIdx === -1) return;

    const currentLine = preparedLines.lines[lineIdx];
    const offsetInLine = cursorPos - currentLine.wordStart;

    const targetIdx = lineIdx + direction;
    if (targetIdx < 0 || targetIdx >= preparedLines.lines.length) return;

    const targetLine = preparedLines.lines[targetIdx];
    const clampedOffset = Math.min(offsetInLine, Math.max(0, targetLine.wordCount - 1));
    cursorPos = targetLine.wordStart + clampedOffset;

    if (!extendSel) { selStart = cursorPos; selEnd = cursorPos; }
    else { extendSelectionToCursor(); }
    scrollCursorIntoView();
    updateHighlight();
  }

  // ─── Cursor-based editing ───────────────────────────────────

  function insertBreakAtCursor() {
    if (cursorPos === null) return;
    const pos = findTextNodePosition(cursorPos);
    if (pos === -1) {
      if (cursorPos === getWordCount()) {
        pushUndo();
        nodes.push({ type: 'break' });
        rerender();
      }
      return;
    }
    pushUndo();
    nodes.splice(pos, 0, { type: 'break' });
    rerender();
  }

  function deleteBackward() {
    if (selStart !== null && selEnd !== null && selStart !== selEnd) {
      deleteSelection();
      return;
    }
    if (cursorPos === null || cursorPos === 0) return;
    pushUndo();

    const wordNodePos = findTextNodePosition(cursorPos - 1);
    if (wordNodePos === -1) return;

    const nextWordPos = findTextNodePosition(cursorPos);
    const searchEnd = nextWordPos !== -1 ? nextWordPos : nodes.length;

    if (searchEnd - wordNodePos > 1) {
      for (let i = searchEnd - 1; i > wordNodePos; i--) {
        if (nodes[i].type === 'break' || nodes[i].type === 'indent') {
          nodes.splice(i, 1);
          rerender();
          return;
        }
      }
    }

    deleteWordAt(cursorPos - 1);
    if (cursorPos > 0) cursorPos--;
    rerender();
  }

  function deleteForward() {
    if (selStart !== null && selEnd !== null && selStart !== selEnd) {
      deleteSelection();
      return;
    }
    if (cursorPos === null) return;

    if (cursorPos >= getWordCount()) {
      const lastWordPos = getWordCount() > 0 ? findTextNodePosition(getWordCount() - 1) : -1;
      const searchStart = lastWordPos !== -1 ? lastWordPos + 1 : 0;
      for (let i = searchStart; i < nodes.length; i++) {
        if (nodes[i].type === 'break' || nodes[i].type === 'indent') {
          pushUndo();
          nodes.splice(i, 1);
          rerender();
          return;
        }
      }
      return;
    }

    pushUndo();
    const wordNodePos = findTextNodePosition(cursorPos);
    if (wordNodePos === -1) return;

    for (let i = wordNodePos - 1; i >= 0; i--) {
      if (nodes[i].type === 'break' || nodes[i].type === 'indent') {
        nodes.splice(i, 1);
        rerender();
        return;
      }
      if (nodes[i].type === 'text') break;
    }

    deleteWordAt(cursorPos);
    rerender();
  }

  function deleteAtCursor() {
    if (selStart !== null && selEnd !== null && selStart !== selEnd) {
      deleteSelection();
      return;
    }
    if (cursorPos === null) return;
    const pos = findTextNodePosition(cursorPos);
    if (pos <= 0) return;
    const prev = nodes[pos - 1];
    if (prev.type === 'break' || prev.type === 'indent') {
      nodes.splice(pos - 1, 1);
      rerender();
    }
  }

  function deleteSelection() {
    if (selStart === null || selEnd === null) return;
    pushUndo();
    const lo = Math.min(selStart, selEnd);
    const hi = Math.max(selStart, selEnd);

    let wordIdx = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'tag') {
        const tagStart = wordIdx;
        const tagEnd = wordIdx + nodes[i].wordCount - 1;
        const overlapStart = Math.max(tagStart, lo);
        const overlapEnd = Math.min(tagEnd, hi);
        if (overlapStart <= overlapEnd) {
          const removed = overlapEnd - overlapStart + 1;
          nodes[i].wordCount -= removed;
        }
      } else if (nodes[i].type === 'text') {
        wordIdx++;
      }
    }

    nodes = nodes.filter(n => n.type !== 'tag' || n.wordCount > 0);

    let count = 0;
    const toRemove = [];
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'text') {
        if (count >= lo && count <= hi) {
          toRemove.push(i);
        }
        count++;
      }
    }
    for (let i = toRemove.length - 1; i >= 0; i--) {
      nodes.splice(toRemove[i], 1);
    }

    cursorPos = lo;
    selStart = null;
    selEnd = null;
    rerender();
  }

  function deleteWordAt(wordIndex) {
    let wordIdx = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'tag') {
        const tagStart = wordIdx;
        const tagEnd = wordIdx + nodes[i].wordCount - 1;
        if (wordIndex >= tagStart && wordIndex <= tagEnd) {
          nodes[i].wordCount--;
        }
      } else if (nodes[i].type === 'text') {
        wordIdx++;
      }
    }

    nodes = nodes.filter(n => n.type !== 'tag' || n.wordCount > 0);

    const pos = findTextNodePosition(wordIndex);
    if (pos !== -1) {
      nodes.splice(pos, 1);
    }
  }

  // ─── Paste ──────────────────────────────────────────────────

  function onPaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || globalThis.clipboardData)?.getData('text/plain');
    if (!text) return;
    pasteText(text);
  }

  function pasteText(text) {
    pushUndo();
    const insertPos = cursorPos !== null
      ? findTextNodePosition(cursorPos)
      : nodes.length;
    const actualPos = insertPos === -1 ? nodes.length : insertPos;

    const lines = text.split(/\r?\n/);
    const newNodes = [];
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) newNodes.push({ type: 'break' });
      const words = lines[i].split(/\s+/).filter(w => w.length > 0);
      for (const w of words) {
        newNodes.push({ type: 'text', value: w });
      }
    }

    nodes.splice(actualPos, 0, ...newNodes);
    const pastedWordCount = newNodes.filter(n => n.type === 'text').length;
    if (cursorPos !== null) cursorPos += pastedWordCount;
    rerender();
  }

  // ─── Hover tooltip ──────────────────────────────────────────

  function showTooltip(wordEl, tags) {
    hideTooltip();
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'gmr-tooltip';
    const lines = tags.map(t => {
      const propsStr = Object.entries(t.props).map(([k, v]) => `${k}=${v}`).join(' ');
      return propsStr ? `${t.tag} (${propsStr})` : t.tag;
    });
    tooltipEl.textContent = lines.join(', ');
    document.body.appendChild(tooltipEl);

    const rect = wordEl.getBoundingClientRect();
    tooltipEl.style.position = 'absolute';
    tooltipEl.style.left = `${rect.left + globalThis.scrollX}px`;
    tooltipEl.style.top = `${rect.top + globalThis.scrollY - tooltipEl.offsetHeight - 4}px`;
  }

  function hideTooltip() {
    if (tooltipEl) {
      tooltipEl.remove();
      tooltipEl = null;
    }
  }

  function toggleHover(on) {
    hoverEnabled = on;
    if (!on) hideTooltip();
  }

  // ─── Collapsible groups ─────────────────────────────────────

  function onGroupToggle(e) {
    const nodeIdx = parseInt(e.currentTarget.dataset.nodeIndex, 10);
    if (!nodes[nodeIdx] || nodes[nodeIdx].type !== 'tag' || !collapsibleTags.has(nodes[nodeIdx].tag)) {
      return;
    }
    if (collapsedGroups.has(nodeIdx)) {
      collapsedGroups.delete(nodeIdx);
    } else {
      collapsedGroups.add(nodeIdx);
    }
    rerender();
  }

  function toggleGroup(nodeIdx) {
    if (!nodes[nodeIdx] || nodes[nodeIdx].type !== 'tag' || !collapsibleTags.has(nodes[nodeIdx].tag)) {
      return;
    }
    if (collapsedGroups.has(nodeIdx)) {
      collapsedGroups.delete(nodeIdx);
    } else {
      collapsedGroups.add(nodeIdx);
    }
    rerender();
  }

  function setGroupLabel(nodeIdx, label) {
    const n = nodes[nodeIdx];
    if (!n || n.type !== 'tag' || !collapsibleTags.has(n.tag)) return;
    if (label) {
      nodes[nodeIdx].props.label = label;
    } else {
      delete nodes[nodeIdx].props.label;
    }
    rerender();
  }

  function editTagProps(nodeIdx, newProps) {
    if (!nodes[nodeIdx] || nodes[nodeIdx].type !== 'tag') return;
    pushUndo();
    nodes[nodeIdx].props = { ...newProps };
    rerender();
  }

  function getGroups() {
    const groups = [];
    let wordIdx = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'tag' && collapsibleTags.has(nodes[i].tag)) {
        groups.push({
          nodeIndex: i,
          tag: nodes[i].tag,
          wordStart: wordIdx,
          wordCount: nodes[i].wordCount,
          label: nodes[i].props.label || null,
          collapsed: collapsedGroups.has(i),
        });
      } else if (nodes[i].type === 'text') {
        wordIdx++;
      }
    }
    return groups;
  }

  // ─── Context menu support ───────────────────────────────────

  let contextMenuHandler = null;

  function findGroupsAtWord(wordIdx) {
    const groups = getGroups();
    return groups.filter(g =>
      wordIdx >= g.wordStart && wordIdx < g.wordStart + g.wordCount
    );
  }

  function onContextMenu(e) {
    e.preventDefault();

    // Right-click on collapsed group summary — treat like clicking its words
    const summaryEl = e.target.closest('.gmr-group-summary');
    if (summaryEl) {
      const range = collapsedGroupRangeFromSummary(summaryEl);
      if (range) {
        const groupEl = summaryEl.closest('.gmr-group');
        const nodeIdx = parseInt(groupEl.dataset.nodeIndex, 10);
        if (contextMenuHandler) {
          contextMenuHandler(e, range.start, tagMap.get(range.start) || [], [{ nodeIndex: nodeIdx }]);
        }
        return;
      }
    }

    // Right-click on group toggle / group container (not on a word)
    const groupToggle = e.target.closest('.gmr-group-toggle');
    const groupEl = e.target.closest('.gmr-group');
    if ((groupToggle || groupEl) && !e.target.closest('.gmr-word')) {
      const nodeIdx = parseInt(
        (groupToggle || groupEl).dataset.nodeIndex, 10
      );
      if (contextMenuHandler) {
        contextMenuHandler(e, null, [], [{ nodeIndex: nodeIdx }]);
      }
      return;
    }

    const wordEl = e.target.closest('.gmr-word');
    if (!wordEl) return;
    const idx = parseInt(wordEl.dataset.wordIndex, 10);

    const insideSelection = selStart !== null && selEnd !== null
      && idx >= Math.min(selStart, selEnd)
      && idx <= Math.max(selStart, selEnd);

    if (!insideSelection) {
      cursorPos = idx;
      selStart = idx;
      selEnd = idx;
      updateHighlight();
    }

    const groupsOnWord = findGroupsAtWord(idx);

    if (contextMenuHandler) {
      contextMenuHandler(e, idx, tagMap.get(idx) || [], groupsOnWord);
    }
  }

  function setContextMenuHandler(handler) {
    contextMenuHandler = handler;
  }

  // ─── Core editing operations ────────────────────────────────

  function findTextNodePosition(wordIndex) {
    let count = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'text') {
        if (count === wordIndex) return i;
        count++;
      }
    }
    return -1;
  }

  function applyTag(tag, props = {}) {
    if (selStart === null) return;
    const lo = Math.min(selStart, selEnd);
    const hi = Math.max(selStart, selEnd);
    const wordCount = hi - lo + 1;

    let nodePos = findTextNodePosition(lo);
    if (nodePos === -1) return;

    // Order by containment: the tag nodes immediately preceding the start word
    // all begin on that same word. Any such tag whose span fits inside the new
    // selection must become a CHILD of the new tag, so the new tag is spliced
    // BEFORE it. Stop at the first larger tag — that one is an ancestor and the
    // new tag stays nested inside it. This makes supersets wrap existing groups
    // (parent in the hierarchy) while substrings stay nested as children.
    while (
      nodePos > 0 &&
      nodes[nodePos - 1].type === 'tag' &&
      nodes[nodePos - 1].wordCount <= wordCount
    ) {
      nodePos--;
    }

    pushUndo();
    remapCollapsedGroupsAfterInsert(nodePos);
    nodes.splice(nodePos, 0, { type: 'tag', tag, props, wordCount });
    if (collapsibleTags.has(tag) && isDefaultCollapsedTrue(props)) {
      collapsedGroups.add(nodePos);
    }
    selStart = null;
    selEnd = null;
    rerender();
  }

  function extractTagTailFromSelection(tagNodeIndex) {
    if (selStart === null || selEnd === null) return false;
    const node = nodes[tagNodeIndex];
    if (!node || node.type !== 'tag') return false;

    const lo = Math.min(selStart, selEnd);
    let wordIdx = 0;
    for (let i = 0; i < tagNodeIndex; i++) {
      if (nodes[i].type === 'text') wordIdx++;
    }
    const tagStart = wordIdx;
    const tagEnd = wordIdx + node.wordCount - 1;
    if (lo < tagStart || lo > tagEnd) return false;

    pushUndo();
    const newCount = lo - tagStart;
    if (newCount <= 0) {
      remapCollapsedGroupsAfterTagDelete(tagNodeIndex);
      nodes.splice(tagNodeIndex, 1);
    } else {
      nodes[tagNodeIndex].wordCount = newCount;
    }
    selStart = null;
    selEnd = null;
    rerender();
    return true;
  }

  function insertIndent(direction) {
    const pos = cursorPos !== null
      ? findTextNodePosition(cursorPos)
      : selStart !== null
        ? findTextNodePosition(Math.min(selStart, selEnd))
        : nodes.length;
    const actualPos = pos === -1 ? nodes.length : pos;
    pushUndo();
    nodes.splice(actualPos, 0, { type: 'indent', direction });
    rerender();
  }

  function insertPage(value) {
    const pos = cursorPos !== null
      ? findTextNodePosition(cursorPos)
      : selStart !== null
        ? findTextNodePosition(Math.min(selStart, selEnd))
        : nodes.length;
    const actualPos = pos === -1 ? nodes.length : pos;
    pushUndo();
    nodes.splice(actualPos, 0, { type: 'tag', tag: 'page', props: { value }, wordCount: 0 });
    rerender();
  }

  function wrapSelectionWithIndent() {
    if (selStart === null || selEnd === null || selStart === selEnd) return;
    const lo = Math.min(selStart, selEnd);
    const hi = Math.max(selStart, selEnd);

    pushUndo();

    // --- Insert indent-in (+ break if needed) before word `lo` ---
    let loPos = findTextNodePosition(lo);
    if (loPos === -1) return;

    // Check if a break already precedes this word
    let hasBreakBefore = false;
    for (let i = loPos - 1; i >= 0; i--) {
      if (nodes[i].type === 'break') { hasBreakBefore = true; break; }
      if (nodes[i].type === 'text') break;
    }

    const insertBefore = [];
    if (!hasBreakBefore) insertBefore.push({ type: 'break' });
    insertBefore.push({ type: 'indent', direction: 'in' });
    nodes.splice(loPos, 0, ...insertBefore);

    // --- Insert indent-out (+ break if needed) after word `hi` ---
    // Recalculate position since we inserted nodes above
    let hiPos = findTextNodePosition(hi);
    if (hiPos === -1) { rerender(); return; }
    // Move past the word itself
    hiPos++;

    // Find whether a break already follows the last selected word
    let breakAfterPos = -1;
    for (let i = hiPos; i < nodes.length; i++) {
      if (nodes[i].type === 'break') { breakAfterPos = i; break; }
      if (nodes[i].type === 'text') break;
    }

    if (breakAfterPos >= 0) {
      // Break exists — insert indent-out AFTER it so the last selected line
      // is flushed while the indent level is still elevated.
      nodes.splice(breakAfterPos + 1, 0, { type: 'indent', direction: 'out' });
    } else {
      // No break after selection — insert break then indent-out.
      nodes.splice(hiPos, 0, { type: 'break' }, { type: 'indent', direction: 'out' });
    }

    rerender();
  }

  function insertBreak() {
    const pos = cursorPos !== null
      ? findTextNodePosition(cursorPos)
      : selStart !== null
        ? findTextNodePosition(Math.min(selStart, selEnd))
        : nodes.length;
    const actualPos = pos === -1 ? nodes.length : pos;
    pushUndo();
    nodes.splice(actualPos, 0, { type: 'break' });
    rerender();
  }

  function removeTag() {
    if (selStart === null && cursorPos === null) return;
    const lo = selStart !== null ? Math.min(selStart, selEnd) : cursorPos;
    const targetPos = findTextNodePosition(lo);
    if (targetPos === -1) return;

    for (let i = targetPos - 1; i >= 0; i--) {
      if (nodes[i].type === 'tag') {
        pushUndo();
        nodes.splice(i, 1);
        selStart = null;
        selEnd = null;
        rerender();
        return;
      }
      if (nodes[i].type === 'text') break;
    }
  }

  // ─── Questions helper ───────────────────────────────────────

  function getQuestions() {
    const questions = [];
    let wordIdx = 0;
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].type === 'tag' && nodes[i].tag === 'question') {
        const startWord = wordIdx;
        const wc = nodes[i].wordCount;
        const textWords = [];
        let seen = 0;
        for (let j = i + 1; j < nodes.length && seen < wc; j++) {
          if (nodes[j].type === 'text') {
            textWords.push(nodes[j].value);
            seen++;
          }
        }
        questions.push({
          nodeIndex: i,
          id: nodes[i].props.id || null,
          wordStart: startWord,
          wordCount: wc,
          preview: textWords.slice(0, 6).join(' '),
        });
      } else if (nodes[i].type === 'text') {
        wordIdx++;
      }
    }
    return questions;
  }

  function ensureQuestionIds() {
    let nextId = 1;
    const usedIds = new Set();
    for (const n of nodes) {
      if (n.type === 'tag' && n.tag === 'question' && n.props.id) {
        usedIds.add(n.props.id);
      }
    }
    for (const n of nodes) {
      if (n.type === 'tag' && n.tag === 'question' && !n.props.id) {
        while (usedIds.has(`q${nextId}`)) nextId++;
        n.props.id = `q${nextId}`;
        usedIds.add(`q${nextId}`);
        nextId++;
      }
    }
  }

  // ─── Scroll position persistence ────────────────────────────

  function getScrollPosition() {
    if (!useVirtual || !virtualScroll || !preparedLines || vsRenderedStart < 0) return 0;
    const line = preparedLines.lines[vsRenderedStart];
    return line ? line.wordStart : 0;
  }

  function scrollToWord(wordStart) {
    if (!useVirtual || !virtualScroll || !preparedLines) return;
    let bestLine = 0;
    for (let i = 0; i < preparedLines.lines.length; i++) {
      if (preparedLines.lines[i].wordStart <= wordStart) bestLine = i;
      else break;
    }
    virtualScroll.scrollToLine(bestLine);
    renderVisibleLines();
  }

  // ─── Public API ─────────────────────────────────────────────

  function getNodes() { return nodes; }

  function getSelection() {
    if (selStart === null) return null;
    return { start: Math.min(selStart, selEnd), end: Math.max(selStart, selEnd) };
  }

  function setSelection(start, end) {
    selStart = start;
    selEnd = end;
    cursorPos = end;
    updateHighlight();
  }

  function getCursor() { return cursorPos; }

  function setCursor(pos) {
    cursorPos = pos;
    selStart = pos;
    selEnd = pos;
    updateHighlight();
  }

  function getTagMap() { return tagMap; }

  function destroy() {
    removeListeners();
    document.removeEventListener('keydown', onKeyDown);
    if (virtualScroll) {
      virtualScroll.destroy();
      virtualScroll = null;
    }
    removeCursorBar();
    hideTooltip();
    container.innerHTML = '';
    nodes = [];
    wordElements = [];
    preparedLines = null;
    vsRenderedStart = -1;
    vsRenderedEnd = -1;
    vsRendering = false;
    cursorPos = null;
    selStart = null;
    selEnd = null;
    collapsedGroups.clear();
  }

  // ─── Init ───────────────────────────────────────────────────

  container.setAttribute('tabindex', '0');
  document.addEventListener('keydown', onKeyDown);
  initCollapsedGroupsFromProps();
  rerender();

  return {
    getNodes,
    getSelection,
    setSelection,
    getCursor,
    setCursor,
    applyTag,
    insertIndent,
    insertPage,
    insertBreak,
    insertBreakAtCursor,
    deleteAtCursor,
    deleteForward,
    deleteBackward,
    deleteSelection,
    removeTag,
    extractTagTailFromSelection,
    pasteText,
    toggleHover,
    getTagMap,
    getQuestions,
    ensureQuestionIds,
    getGroups,
    toggleGroup,
    setGroupLabel,
    editTagProps,
    setContextMenuHandler,
    undo,
    redo,
    rerender,
    getScrollPosition,
    scrollToWord,
    destroy,
  };
}
