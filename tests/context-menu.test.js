import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown } from './dom-env.js';

let createContextMenu;

before(async () => {
  setup();
  ({ createContextMenu } = await import('../js/context-menu.js'));
});

after(() => teardown());

describe('createContextMenu', () => {
  it('is not visible initially', () => {
    const menu = createContextMenu(document.body);
    assert.equal(menu.isVisible(), false);
    menu.destroy();
  });

  it('show() renders a menu at the given position', () => {
    const menu = createContextMenu(document.body);
    menu.show(100, 200, [
      { label: 'Item 1', action: () => {} },
      { label: 'Item 2', action: () => {} },
    ]);

    assert.equal(menu.isVisible(), true);
    const el = document.querySelector('.gmr-context-menu');
    assert.ok(el);
    assert.equal(el.style.left, '100px');
    assert.equal(el.style.top, '200px');
    assert.equal(el.children.length, 2);
    assert.equal(el.children[0].textContent, 'Item 1');
    menu.destroy();
  });

  it('clicking an item calls its action and hides the menu', () => {
    let called = false;
    const menu = createContextMenu(document.body);
    menu.show(0, 0, [
      { label: 'Do thing', action: () => { called = true; } },
    ]);

    const item = document.querySelector('.gmr-context-menu-item');
    item.click();
    assert.equal(called, true);
    assert.equal(menu.isVisible(), false);
    menu.destroy();
  });

  it('hide() removes the menu', () => {
    const menu = createContextMenu(document.body);
    menu.show(0, 0, [{ label: 'X', action: () => {} }]);
    assert.equal(menu.isVisible(), true);
    menu.hide();
    assert.equal(menu.isVisible(), false);
    assert.equal(document.querySelector('.gmr-context-menu'), null);
    menu.destroy();
  });

  it('Escape key hides the menu', () => {
    const menu = createContextMenu(document.body);
    menu.show(0, 0, [{ label: 'X', action: () => {} }]);

    const ev = new globalThis.window.KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
    });
    document.dispatchEvent(ev);
    assert.equal(menu.isVisible(), false);
    menu.destroy();
  });

  it('clicking outside hides the menu', () => {
    const menu = createContextMenu(document.body);
    menu.show(0, 0, [{ label: 'X', action: () => {} }]);

    const ev = new globalThis.window.MouseEvent('mousedown', { bubbles: true });
    document.body.dispatchEvent(ev);
    assert.equal(menu.isVisible(), false);
    menu.destroy();
  });

  it('renders nested submenu for items with children', () => {
    const menu = createContextMenu(document.body);
    menu.show(0, 0, [
      {
        label: 'Parent',
        children: [
          { label: 'Child 1', action: () => {} },
          { label: 'Child 2', action: () => {} },
        ],
      },
    ]);

    const parent = document.querySelector('.gmr-has-submenu');
    assert.ok(parent);
    const sub = parent.querySelector('.gmr-context-submenu');
    assert.ok(sub);
    assert.equal(sub.children.length, 2);
    assert.equal(sub.children[0].textContent, 'Child 1');
    menu.destroy();
  });

  it('destroy() cleans up', () => {
    const menu = createContextMenu(document.body);
    menu.show(0, 0, [{ label: 'X', action: () => {} }]);
    menu.destroy();
    assert.equal(menu.isVisible(), false);
    assert.equal(document.querySelector('.gmr-context-menu'), null);
  });
});
