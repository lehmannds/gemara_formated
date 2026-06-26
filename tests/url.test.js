import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown } from './dom-env.js';

let getPerekFromUrl, setPerekInUrl, onUrlChange, removeUrlChangeListener;

before(async () => {
  setup();
  // url.js reads location and history from the global window
  globalThis.location = globalThis.window.location;
  globalThis.history = globalThis.window.history;
  ({ getPerekFromUrl, setPerekInUrl, onUrlChange, removeUrlChangeListener } =
    await import('../js/url.js'));
});

after(() => teardown());

beforeEach(() => {
  // Reset hash between tests
  globalThis.window.location.hash = '';
});

describe('getPerekFromUrl', () => {
  it('returns null when no hash', () => {
    globalThis.window.location.hash = '';
    assert.equal(getPerekFromUrl(), null);
  });

  it('returns the hash value without the # prefix', () => {
    globalThis.window.location.hash = '#hulin/perakim/2';
    assert.equal(getPerekFromUrl(), 'hulin/perakim/2');
  });
});

describe('setPerekInUrl', () => {
  it('sets the URL hash via pushState', () => {
    setPerekInUrl('hulin/perakim/3');
    assert.equal(globalThis.window.location.hash, '#hulin/perakim/3');
  });

  it('does not push duplicate state for the same id', () => {
    globalThis.window.location.hash = '#hulin/perakim/3';
    const lengthBefore = globalThis.window.history.length;
    setPerekInUrl('hulin/perakim/3');
    assert.equal(globalThis.window.history.length, lengthBefore);
  });
});

describe('onUrlChange / removeUrlChangeListener', () => {
  it('registers a callback called on popstate', () => {
    const calls = [];
    const cb = (id) => calls.push(id);
    onUrlChange(cb);

    globalThis.window.location.hash = '#hulin/perakim/5';
    const event = new globalThis.window.Event('popstate');
    globalThis.window.dispatchEvent(event);

    assert.equal(calls.length, 1);
    assert.equal(calls[0], 'hulin/perakim/5');

    removeUrlChangeListener(cb);
  });

  it('removeUrlChangeListener stops notifications', () => {
    const calls = [];
    const cb = (id) => calls.push(id);
    onUrlChange(cb);
    removeUrlChangeListener(cb);

    globalThis.window.location.hash = '#hulin/perakim/6';
    const event = new globalThis.window.Event('popstate');
    globalThis.window.dispatchEvent(event);

    assert.equal(calls.length, 0);
  });
});
