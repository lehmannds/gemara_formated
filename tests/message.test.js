import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown } from './dom-env.js';

let showMessage;

before(async () => {
  setup();
  ({ showMessage } = await import('../js/message.js'));
});

after(() => teardown());

describe('showMessage', () => {
  it('renders a message element in the DOM', () => {
    const { dismiss } = showMessage('Hello', { duration: 0 });
    const el = document.querySelector('.gmr-message');
    assert.ok(el, 'message element should exist');
    assert.equal(el.textContent, 'Hello');
    dismiss();
  });

  it('applies success type class', () => {
    const { dismiss } = showMessage('OK', { type: 'success', duration: 0 });
    const el = document.querySelector('.gmr-message--success');
    assert.ok(el);
    dismiss();
  });

  it('applies error type class', () => {
    const { dismiss } = showMessage('Fail', { type: 'error', duration: 0 });
    const el = document.querySelector('.gmr-message--error');
    assert.ok(el);
    dismiss();
  });

  it('applies info type class by default', () => {
    const { dismiss } = showMessage('Info', { duration: 0 });
    const el = document.querySelector('.gmr-message--info');
    assert.ok(el);
    dismiss();
  });

  it('dismiss removes the element', (t) => {
    const { dismiss } = showMessage('Bye', { duration: 0 });
    assert.ok(document.querySelector('.gmr-message'));
    dismiss();
    // After dismiss + fallback timeout, element should be gone
    return new Promise((resolve) => {
      setTimeout(() => {
        assert.equal(document.querySelector('.gmr-message'), null);
        resolve();
      }, 600);
    });
  });

  it('auto-dismisses after duration', () => {
    return new Promise((resolve) => {
      showMessage('Auto', { duration: 100 });
      assert.ok(document.querySelector('.gmr-message'));
      setTimeout(() => {
        // After duration + fade-out fallback, element should be removed
        setTimeout(() => {
          assert.equal(document.querySelector('.gmr-message'), null);
          resolve();
        }, 600);
      }, 150);
    });
  });

  it('renders into custom mount', () => {
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    const { dismiss } = showMessage('Custom', { mount, duration: 0 });
    assert.ok(mount.querySelector('.gmr-message'));
    assert.equal(mount.querySelector('.gmr-message').textContent, 'Custom');
    dismiss();
    mount.remove();
  });

  it('sets aria role and live attributes', () => {
    const { dismiss } = showMessage('Accessible', { duration: 0 });
    const el = document.querySelector('.gmr-message');
    assert.equal(el.getAttribute('role'), 'status');
    assert.equal(el.getAttribute('aria-live'), 'polite');
    dismiss();
  });
});
