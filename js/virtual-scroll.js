/**
 * Virtual scroll module — percent-based, loop-free.
 *
 * Design contract:
 *   - The scroller owns ONLY the scroll geometry. It builds a tall "sizer"
 *     element (height = totalLines * lineHeight) that produces a real
 *     scrollbar, and a "content" layer that is `position: sticky; top: 0`
 *     so it stays pinned to the top of the viewport while scrolling.
 *   - Because the content layer is pinned and the sizer has an EXPLICIT
 *     height, rendering lines into the content NEVER changes scrollHeight.
 *     No render can move the scrollbar → no feedback loop, no jumps.
 *   - On scroll (rAF-throttled) the scroller reports the scroll PERCENT
 *     (0..1). The editor uses that + the viewport line capacity to decide
 *     which lines to render.
 *
 *   scroll → percent → onScroll(percent) → editor renders → done
 *
 * @param {HTMLElement} container - scrollable container element
 * @param {object} options
 * @param {number} options.lineHeight - fixed height per line in px
 * @param {(percent: number) => void} options.onScroll - rAF-throttled
 * @returns {VirtualScrollInstance}
 */
export function createVirtualScroll(container, options) {
  const lineHeight = options.lineHeight;
  const onScrollCb = options.onScroll;

  let totalLines = 0;

  // sizer: provides the scroll range (explicit height = totalLines*lineHeight)
  const sizer = document.createElement('div');
  sizer.className = 'vs-sizer';
  sizer.style.position = 'relative';
  sizer.style.width = '100%';

  // content: pinned to the top of the viewport, holds the rendered lines.
  const content = document.createElement('div');
  content.className = 'vs-content';
  content.style.position = 'sticky';
  content.style.top = '0';

  sizer.appendChild(content);
  container.appendChild(sizer);
  container.style.overflowY = 'auto';
  container.style.position = container.style.position || 'relative';

  function getScrollPercent() {
    const max = container.scrollHeight - container.clientHeight;
    if (max <= 0) return 0;
    const p = container.scrollTop / max;
    if (p < 0) return 0;
    if (p > 1) return 1;
    return p;
  }

  /** How many whole lines fit in the viewport. */
  function getViewportLineCount() {
    return Math.max(1, Math.floor((container.clientHeight || 0) / lineHeight));
  }

  // rAF-throttled scroll handler
  let rafId = null;
  const hasRAF = typeof requestAnimationFrame === 'function';

  function onScroll() {
    if (!hasRAF) { onScrollCb(getScrollPercent()); return; }
    if (rafId !== null) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      onScrollCb(getScrollPercent());
    });
  }

  container.addEventListener('scroll', onScroll, { passive: true });

  return {
    getContentEl() { return content; },

    /**
     * Set total line count. Updates the sizer height (scroll range) only.
     * Does NOT fire onScroll — the caller renders afterwards.
     */
    setTotalLines(n) {
      totalLines = n;
      sizer.style.height = `${n * lineHeight}px`;
    },

    getTotalLines() { return totalLines; },

    getScrollPercent() { return getScrollPercent(); },

    getViewportLineCount() { return getViewportLineCount(); },

    getLineHeight() { return lineHeight; },

    /**
     * Compute the first line index for the current scroll percent given the
     * viewport capacity (so the last "page" aligns to the bottom).
     */
    getFirstLine() {
      const vp = getViewportLineCount();
      const maxFirst = Math.max(0, totalLines - vp);
      return Math.round(getScrollPercent() * maxFirst);
    },

    /** Scroll so that `lineIdx` becomes the first visible line. */
    scrollToLine(lineIdx) {
      const vp = getViewportLineCount();
      const maxFirst = Math.max(0, totalLines - vp);
      const clamped = Math.max(0, Math.min(lineIdx, maxFirst));
      const max = container.scrollHeight - container.clientHeight;
      container.scrollTop = maxFirst > 0 ? (clamped / maxFirst) * max : 0;
    },

    /** Scroll to a percent (0..1). */
    scrollToPercent(p) {
      const max = container.scrollHeight - container.clientHeight;
      container.scrollTop = Math.max(0, Math.min(1, p)) * Math.max(0, max);
    },

    destroy() {
      container.removeEventListener('scroll', onScroll);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      sizer.remove();
    },
  };
}
