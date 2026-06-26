import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown } from './dom-env.js';

let createAutocomplete;

before(async () => {
  setup();
  ({ createAutocomplete } = await import('../js/autocomplete.js'));
});

after(() => teardown());

function makeInput() {
  const wrapper = document.createElement('div');
  const input = document.createElement('input');
  wrapper.appendChild(input);
  document.body.appendChild(wrapper);
  return input;
}

function getDropdown(input) {
  return input.closest('.autocomplete-wrapper')?.querySelector('.autocomplete-dropdown');
}

function getItems(input) {
  const dd = getDropdown(input);
  return dd ? Array.from(dd.querySelectorAll('.autocomplete-item')) : [];
}

function type(input, value) {
  input.value = value;
  input.dispatchEvent(new globalThis.window.Event('input', { bubbles: true }));
}

function pressKey(input, key) {
  input.dispatchEvent(new globalThis.window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
  }));
}

// Need to flush debounce
function flushTimers() {
  // jsdom doesn't have real timers; we use setTimeout 0 + manual flush
  return new Promise(resolve => setTimeout(resolve, 150));
}

describe('createAutocomplete', () => {
  it('wraps input in autocomplete-wrapper', () => {
    const input = makeInput();
    const ac = createAutocomplete(input, { items: [], onSelect: () => {} });
    assert.ok(input.closest('.autocomplete-wrapper'));
    ac.destroy();
  });

  it('creates a dropdown with role=listbox', () => {
    const input = makeInput();
    const ac = createAutocomplete(input, { items: [], onSelect: () => {} });
    const dd = getDropdown(input);
    assert.ok(dd);
    assert.equal(dd.getAttribute('role'), 'listbox');
    ac.destroy();
  });

  it('shows filtered items on input', async () => {
    const input = makeInput();
    const items = [
      { label: 'Apple' },
      { label: 'Banana' },
      { label: 'Avocado' },
    ];
    const ac = createAutocomplete(input, { items, onSelect: () => {} });

    type(input, 'av');
    await flushTimers();

    const shown = getItems(input);
    assert.equal(shown.length, 1); // only Avocado
    ac.destroy();
  });

  it('calls onSelect when item is clicked', async () => {
    const input = makeInput();
    const items = [{ label: 'Apple' }, { label: 'Banana' }];
    let selected = null;
    const ac = createAutocomplete(input, { items, onSelect: (item) => { selected = item; } });

    type(input, 'Ap');
    await flushTimers();

    const shown = getItems(input);
    shown[0].dispatchEvent(new globalThis.window.MouseEvent('mousedown', { bubbles: true }));
    assert.deepEqual(selected, { label: 'Apple' });
    assert.equal(input.value, 'Apple');
    ac.destroy();
  });

  it('keyboard ArrowDown highlights items', async () => {
    const input = makeInput();
    const items = [{ label: 'One' }, { label: 'Two' }];
    const ac = createAutocomplete(input, { items, onSelect: () => {}, minLength: 0 });

    type(input, '');
    await flushTimers();

    pressKey(input, 'ArrowDown');
    const dd = getDropdown(input);
    const firstItem = dd.children[0];
    assert.equal(firstItem.getAttribute('aria-selected'), 'true');
    ac.destroy();
  });

  it('Enter selects highlighted item', async () => {
    const input = makeInput();
    const items = [{ label: 'One' }, { label: 'Two' }];
    let selected = null;
    const ac = createAutocomplete(input, {
      items,
      onSelect: (item) => { selected = item; },
      minLength: 0,
    });

    type(input, '');
    await flushTimers();

    pressKey(input, 'ArrowDown');
    pressKey(input, 'Enter');
    assert.deepEqual(selected, { label: 'One' });
    ac.destroy();
  });

  it('Escape closes dropdown without selecting', async () => {
    const input = makeInput();
    const items = [{ label: 'One' }];
    let selected = null;
    const ac = createAutocomplete(input, {
      items,
      onSelect: (item) => { selected = item; },
      minLength: 0,
    });

    type(input, '');
    await flushTimers();

    pressKey(input, 'Escape');
    const dd = getDropdown(input);
    assert.ok(!dd.classList.contains('visible'));
    assert.equal(selected, null);
    ac.destroy();
  });

  it('setItems updates the item list', async () => {
    const input = makeInput();
    const ac = createAutocomplete(input, {
      items: [{ label: 'A' }],
      onSelect: () => {},
      minLength: 0,
    });

    type(input, '');
    await flushTimers();
    assert.equal(getItems(input).length, 1);

    ac.setItems([{ label: 'B' }, { label: 'C' }]);
    type(input, '');
    await flushTimers();
    assert.equal(getItems(input).length, 2);
    ac.destroy();
  });

  it('getValue and setValue work', () => {
    const input = makeInput();
    const ac = createAutocomplete(input, { items: [], onSelect: () => {} });
    ac.setValue('test');
    assert.equal(ac.getValue(), 'test');
    assert.equal(input.value, 'test');
    ac.destroy();
  });

  it('destroy removes wrapper and restores input', () => {
    const input = makeInput();
    const originalParent = input.parentNode;
    const ac = createAutocomplete(input, { items: [], onSelect: () => {} });
    ac.destroy();
    assert.ok(!input.closest('.autocomplete-wrapper'));
  });

  it('custom filter function is used', async () => {
    const input = makeInput();
    const items = [{ label: 'Apple', id: 1 }, { label: 'Banana', id: 2 }];
    const ac = createAutocomplete(input, {
      items,
      onSelect: () => {},
      filter: (query, item) => item.id === 2,
    });

    type(input, 'anything');
    await flushTimers();

    const shown = getItems(input);
    assert.equal(shown.length, 1);
    assert.ok(shown[0].textContent.includes('Banana'));
    ac.destroy();
  });
});
