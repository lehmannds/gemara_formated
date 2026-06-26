import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown } from './dom-env.js';

let createVirtualScroll;

before(async () => {
  setup();
  ({ createVirtualScroll } = await import('../js/virtual-scroll.js'));
});

after(() => teardown());

function makeContainer(height = 200, scrollHeight = 0) {
  const el = document.createElement('div');
  // jsdom doesn't compute layout, so we stub geometry
  Object.defineProperty(el, 'clientHeight', { value: height, writable: true });
  Object.defineProperty(el, 'clientWidth', { value: 800, writable: true });
  Object.defineProperty(el, 'scrollHeight', { value: scrollHeight, writable: true });
  el.scrollTop = 0;
  document.body.appendChild(el);
  return el;
}

describe('createVirtualScroll', () => {
  it('creates sizer and content element', () => {
    const el = makeContainer();
    const vs = createVirtualScroll(el, {
      lineHeight: 40,
      onScroll: () => {},
    });
    vs.setTotalLines(100);

    assert.ok(el.querySelector('.vs-sizer'));
    assert.ok(el.querySelector('.vs-content'));
    vs.destroy();
  });

  it('getContentEl returns the content div', () => {
    const el = makeContainer();
    const vs = createVirtualScroll(el, { lineHeight: 40, onScroll: () => {} });
    vs.setTotalLines(10);
    assert.equal(vs.getContentEl().className, 'vs-content');
    vs.destroy();
  });

  it('setTotalLines sets the sizer height (scroll range)', () => {
    const el = makeContainer();
    const vs = createVirtualScroll(el, { lineHeight: 40, onScroll: () => {} });
    vs.setTotalLines(100);
    const sizer = el.querySelector('.vs-sizer');
    assert.equal(sizer.style.height, '4000px'); // 100 * 40
    assert.equal(vs.getTotalLines(), 100);
    vs.destroy();
  });

  it('getViewportLineCount = floor(clientHeight / lineHeight)', () => {
    const el = makeContainer(200);
    const vs = createVirtualScroll(el, { lineHeight: 40, onScroll: () => {} });
    assert.equal(vs.getViewportLineCount(), 5); // floor(200/40)
    vs.destroy();
  });

  it('getScrollPercent computes from scrollTop and scroll range', () => {
    const el = makeContainer(200, 1000); // max = 1000 - 200 = 800
    const vs = createVirtualScroll(el, { lineHeight: 40, onScroll: () => {} });
    vs.setTotalLines(25);
    el.scrollTop = 400;
    assert.equal(vs.getScrollPercent(), 0.5);
    el.scrollTop = 800;
    assert.equal(vs.getScrollPercent(), 1);
    vs.destroy();
  });

  it('getScrollPercent returns 0 when there is no scroll range', () => {
    const el = makeContainer(200, 0);
    const vs = createVirtualScroll(el, { lineHeight: 40, onScroll: () => {} });
    vs.setTotalLines(2);
    assert.equal(vs.getScrollPercent(), 0);
    vs.destroy();
  });

  it('fires onScroll with percent on scroll event', () => {
    const el = makeContainer(200, 1000);
    let reported = null;
    const vs = createVirtualScroll(el, {
      lineHeight: 40,
      onScroll: (p) => { reported = p; },
    });
    vs.setTotalLines(25);
    el.scrollTop = 400;
    el.dispatchEvent(new globalThis.window.Event('scroll'));
    assert.equal(reported, 0.5);
    vs.destroy();
  });

  it('getFirstLine derives the first line from percent and viewport', () => {
    const el = makeContainer(200, 1000); // vp = 5
    const vs = createVirtualScroll(el, { lineHeight: 40, onScroll: () => {} });
    vs.setTotalLines(105); // maxFirst = 105 - 5 = 100
    el.scrollTop = 400; // percent 0.5
    assert.equal(vs.getFirstLine(), 50); // round(0.5 * 100)
    vs.destroy();
  });

  it('setTotalLines does not fire onScroll', () => {
    const el = makeContainer(200, 1000);
    let calls = 0;
    const vs = createVirtualScroll(el, { lineHeight: 40, onScroll: () => { calls++; } });
    vs.setTotalLines(100);
    vs.setTotalLines(200);
    assert.equal(calls, 0);
    vs.destroy();
  });

  it('scrollToLine sets scrollTop within range', () => {
    const el = makeContainer(200, 1000);
    const vs = createVirtualScroll(el, { lineHeight: 40, onScroll: () => {} });
    vs.setTotalLines(105); // maxFirst 100, max scroll 800
    vs.scrollToLine(50); // 50/100 * 800 = 400
    assert.equal(el.scrollTop, 400);
    vs.destroy();
  });

  it('scrollToPercent sets scrollTop', () => {
    const el = makeContainer(200, 1000);
    const vs = createVirtualScroll(el, { lineHeight: 40, onScroll: () => {} });
    vs.setTotalLines(25);
    vs.scrollToPercent(0.25); // 0.25 * 800 = 200
    assert.equal(el.scrollTop, 200);
    vs.destroy();
  });

  it('destroy removes the sizer', () => {
    const el = makeContainer();
    const vs = createVirtualScroll(el, { lineHeight: 40, onScroll: () => {} });
    vs.setTotalLines(10);
    vs.destroy();
    assert.equal(el.querySelector('.vs-sizer'), null);
    assert.equal(el.querySelector('.vs-content'), null);
  });
});
