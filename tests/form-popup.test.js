import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown } from './dom-env.js';

let createFormPopup;

before(async () => {
  setup();
  // popup.js uses requestAnimationFrame for focus management; run synchronously in tests
  globalThis.window.requestAnimationFrame = (cb) => { cb(); return 0; };
  ({ createFormPopup } = await import('../js/form-popup.js'));
});

after(() => teardown());

describe('createFormPopup', () => {
  it('opens a popup with form fields', () => {
    let submitted = null;
    const fp = createFormPopup({
      title: 'Test Form',
      fields: [
        { name: 'label', label: 'Label', type: 'text', default: 'hello' },
      ],
      onSubmit: (data) => { submitted = data; },
    });
    fp.open();

    const dialog = document.querySelector('.popup__dialog');
    assert.ok(dialog, 'popup dialog should exist');

    const title = dialog.querySelector('.popup__title');
    assert.equal(title.textContent, 'Test Form');

    const input = dialog.querySelector('input[name="label"]');
    assert.ok(input, 'text input should exist');
    assert.equal(input.value, 'hello');

    fp.close();
  });

  it('collects text field values on OK', () => {
    let submitted = null;
    const fp = createFormPopup({
      title: 'Test',
      fields: [
        { name: 'name', label: 'Name', type: 'text' },
      ],
      onSubmit: (data) => { submitted = data; },
    });
    fp.open();

    const input = document.querySelector('input[name="name"]');
    input.value = 'test-value';

    const okBtn = document.querySelector('.form-popup-btn--ok');
    okBtn.click();

    assert.deepEqual(submitted, { name: 'test-value' });
  });

  it('collects number field values', () => {
    let submitted = null;
    const fp = createFormPopup({
      title: 'Test',
      fields: [
        { name: 'count', label: 'Count', type: 'number', default: 5 },
      ],
      onSubmit: (data) => { submitted = data; },
    });
    fp.open();

    const okBtn = document.querySelector('.form-popup-btn--ok');
    okBtn.click();

    assert.equal(submitted.count, 5);
  });

  it('collects boolean field values', () => {
    let submitted = null;
    const fp = createFormPopup({
      title: 'Test',
      fields: [
        { name: 'collapsed', label: 'Collapsed', type: 'boolean', default: true },
      ],
      onSubmit: (data) => { submitted = data; },
    });
    fp.open();

    const checkbox = document.querySelector('input[name="collapsed"]');
    assert.equal(checkbox.checked, true);

    const okBtn = document.querySelector('.form-popup-btn--ok');
    okBtn.click();

    assert.equal(submitted.collapsed, true);
  });

  it('calls onCancel when Cancel is clicked', () => {
    let cancelled = false;
    const fp = createFormPopup({
      title: 'Test',
      fields: [
        { name: 'x', label: 'X', type: 'text' },
      ],
      onSubmit: () => {},
      onCancel: () => { cancelled = true; },
    });
    fp.open();

    const cancelBtn = document.querySelector('.form-popup-btn--cancel');
    cancelBtn.click();

    assert.equal(cancelled, true);
  });

  it('closes popup after OK', () => {
    const fp = createFormPopup({
      title: 'Test',
      fields: [{ name: 'a', label: 'A', type: 'text' }],
      onSubmit: () => {},
    });
    fp.open();
    assert.ok(document.querySelector('.popup'));

    document.querySelector('.form-popup-btn--ok').click();
    assert.equal(document.querySelector('.popup'), null);
  });

  it('closes popup after Cancel', () => {
    const fp = createFormPopup({
      title: 'Test',
      fields: [{ name: 'a', label: 'A', type: 'text' }],
      onSubmit: () => {},
    });
    fp.open();
    assert.ok(document.querySelector('.popup'));

    document.querySelector('.form-popup-btn--cancel').click();
    assert.equal(document.querySelector('.popup'), null);
  });

  it('renders multiple fields', () => {
    const fp = createFormPopup({
      title: 'Multi',
      fields: [
        { name: 'label', label: 'Label', type: 'text' },
        { name: 'default_collapsed', label: 'Default Collapsed', type: 'boolean', default: true },
      ],
      onSubmit: () => {},
    });
    fp.open();

    const textInput = document.querySelector('input[name="label"]');
    const checkbox = document.querySelector('input[name="default_collapsed"]');
    assert.ok(textInput);
    assert.ok(checkbox);
    assert.equal(checkbox.checked, true);

    fp.close();
  });

  it('does not submit when required field is empty', () => {
    let submitted = false;
    const fp = createFormPopup({
      title: 'Test',
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
      ],
      onSubmit: () => { submitted = true; },
    });
    fp.open();

    document.querySelector('.form-popup-btn--ok').click();
    assert.equal(submitted, false);

    // Popup should still be open
    assert.ok(document.querySelector('.popup'));
    fp.close();
  });

  it('open with override fields replaces default fields', () => {
    let submitted = null;
    const fp = createFormPopup({
      title: 'Test',
      fields: [{ name: 'a', label: 'A', type: 'text' }],
      onSubmit: (data) => { submitted = data; },
    });
    fp.open([{ name: 'b', label: 'B', type: 'number', default: 42 }]);

    assert.equal(document.querySelector('input[name="a"]'), null);
    const bInput = document.querySelector('input[name="b"]');
    assert.ok(bInput);
    assert.equal(bInput.value, '42');

    document.querySelector('.form-popup-btn--ok').click();
    assert.deepEqual(submitted, { b: 42 });
  });

  it('destroy cleans up', () => {
    const fp = createFormPopup({
      title: 'Test',
      fields: [{ name: 'a', label: 'A', type: 'text' }],
      onSubmit: () => {},
    });
    fp.open();
    assert.ok(document.querySelector('.popup'));

    fp.destroy();
    assert.equal(document.querySelector('.popup'), null);
  });
});
