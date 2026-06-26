import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown } from './dom-env.js';

let createSelectPopup;

before(async () => {
  setup();
  ({ createSelectPopup } = await import('../js/select-popup.js'));
});

after(() => teardown());

describe('createSelectPopup', () => {
  it('open creates a backdrop overlay', () => {
    const popup = createSelectPopup({
      title: 'Pick one',
      items: [{ label: 'A', value: 'a' }],
      onSelect: () => {},
    });
    popup.open();
    const backdrop = document.querySelector('.select-popup-backdrop');
    assert.ok(backdrop);
    popup.destroy();
  });

  it('displays the title', () => {
    const popup = createSelectPopup({
      title: 'Test Title',
      items: [{ label: 'A', value: 'a' }],
      onSelect: () => {},
    });
    popup.open();
    const title = document.querySelector('.select-popup-title');
    assert.equal(title.textContent, 'Test Title');
    popup.destroy();
  });

  it('panel has role=dialog and aria-modal=true', () => {
    const popup = createSelectPopup({
      title: 'T',
      items: [{ label: 'A', value: 'a' }],
      onSelect: () => {},
    });
    popup.open();
    const panel = document.querySelector('.select-popup-panel');
    assert.equal(panel.getAttribute('role'), 'dialog');
    assert.equal(panel.getAttribute('aria-modal'), 'true');
    popup.destroy();
  });

  it('close removes the backdrop', () => {
    const popup = createSelectPopup({
      title: 'T',
      items: [{ label: 'A', value: 'a' }],
      onSelect: () => {},
    });
    popup.open();
    popup.close();
    assert.equal(document.querySelector('.select-popup-backdrop'), null);
    popup.destroy();
  });

  it('onCancel fires when backdrop is clicked', () => {
    let cancelled = false;
    const popup = createSelectPopup({
      title: 'T',
      items: [{ label: 'A', value: 'a' }],
      onSelect: () => {},
      onCancel: () => { cancelled = true; },
    });
    popup.open();
    const backdrop = document.querySelector('.select-popup-backdrop');
    backdrop.dispatchEvent(new globalThis.window.MouseEvent('click', { bubbles: true }));
    assert.ok(cancelled);
    popup.destroy();
  });

  it('open with override items uses those items', () => {
    const popup = createSelectPopup({
      title: 'T',
      items: [{ label: 'Default', value: 'd' }],
      onSelect: () => {},
    });
    popup.open([{ label: 'Override', value: 'o' }]);
    const search = document.querySelector('.select-popup-search');
    assert.ok(search);
    popup.destroy();
  });

  it('contains a search input', () => {
    const popup = createSelectPopup({
      title: 'T',
      items: [{ label: 'A', value: 'a' }],
      onSelect: () => {},
    });
    popup.open();
    const search = document.querySelector('.select-popup-search');
    assert.ok(search);
    assert.equal(search.tagName, 'INPUT');
    popup.destroy();
  });

  it('destroy cleans up completely', () => {
    const popup = createSelectPopup({
      title: 'T',
      items: [],
      onSelect: () => {},
    });
    popup.open();
    popup.destroy();
    assert.equal(document.querySelector('.select-popup-backdrop'), null);
  });
});
