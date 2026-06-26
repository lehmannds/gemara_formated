/**
 * Form-popup module: modal form built on top of popup.js.
 *
 * Pass field definitions (text, number, boolean) and get structured data back
 * via onSubmit / onCancel callbacks.
 */

import { createPopup } from './popup.js';

/**
 * @typedef {Object} FormField
 * @property {string} name       - field key returned in the data object
 * @property {string} label      - human-readable label shown in the form
 * @property {'text'|'number'|'boolean'} type
 * @property {*}      [default]  - default value
 * @property {boolean} [required] - whether the field must be filled
 */

/**
 * @typedef {Object} FormPopupOptions
 * @property {string}       title
 * @property {FormField[]}  fields
 * @property {(data: Record<string, any>) => void} onSubmit
 * @property {() => void}   [onCancel]
 * @property {HTMLElement}  [mount]
 */

/**
 * Create a reusable form-popup instance.
 *
 * @param {FormPopupOptions} options
 * @returns {{ open: (fields?: FormField[]) => void, close: () => void, destroy: () => void }}
 */
export function createFormPopup(options) {
  const {
    title,
    fields: defaultFields = [],
    onSubmit,
    onCancel,
    mount,
  } = options;

  const popup = createPopup(mount);

  function open(overrideFields) {
    const activeFields = overrideFields || defaultFields;
    const form = buildForm(activeFields);
    popup.open({ title, content: form.element });
    const firstInput = form.inputs.find(i => i.field.type !== 'boolean');
    if (firstInput) firstInput.el.focus();
  }

  function buildForm(fields) {
    const form = document.createElement('form');
    form.className = 'form-popup-form';
    form.addEventListener('submit', (e) => e.preventDefault());

    const inputs = [];

    for (const field of fields) {
      const row = document.createElement('div');
      row.className = 'form-popup-field';

      if (field.type === 'boolean') {
        const label = document.createElement('label');
        label.className = 'form-popup-label form-popup-label--checkbox';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.name = field.name;
        checkbox.checked = field.default !== undefined ? Boolean(field.default) : false;
        checkbox.className = 'form-popup-checkbox';
        label.appendChild(checkbox);
        const text = document.createTextNode(' ' + field.label);
        label.appendChild(text);
        row.appendChild(label);
        inputs.push({ field, el: checkbox });
      } else {
        const label = document.createElement('label');
        label.className = 'form-popup-label';
        label.textContent = field.label;
        const inputType = field.type === 'number' ? 'number' : 'text';
        const input = document.createElement('input');
        input.type = inputType;
        input.name = field.name;
        input.className = 'form-popup-input';
        if (field.default !== undefined && field.default !== null) {
          input.value = String(field.default);
        }
        if (field.required) input.required = true;
        label.appendChild(input);
        row.appendChild(label);
        inputs.push({ field, el: input });
      }

      form.appendChild(row);
    }

    const buttons = document.createElement('div');
    buttons.className = 'form-popup-buttons';

    const okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'form-popup-btn form-popup-btn--ok';
    okBtn.textContent = 'OK';

    function submitForm() {
      if (!validateForm(inputs)) return;
      const data = collectData(inputs);
      popup.close();
      onSubmit(data);
    }

    okBtn.addEventListener('click', submitForm);

    for (const { field, el } of inputs) {
      if (field.type !== 'boolean') {
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submitForm();
          }
        });
      }
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'form-popup-btn form-popup-btn--cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      popup.close();
      if (onCancel) onCancel();
    });

    buttons.appendChild(okBtn);
    buttons.appendChild(cancelBtn);
    form.appendChild(buttons);

    return { element: form, inputs };
  }

  function validateForm(inputs) {
    for (const { field, el } of inputs) {
      if (field.required && field.type !== 'boolean') {
        if (!el.value.trim()) {
          el.focus();
          return false;
        }
      }
    }
    return true;
  }

  function collectData(inputs) {
    const data = {};
    for (const { field, el } of inputs) {
      if (field.type === 'boolean') {
        data[field.name] = el.checked;
      } else if (field.type === 'number') {
        data[field.name] = el.value === '' ? null : Number(el.value);
      } else {
        data[field.name] = el.value;
      }
    }
    return data;
  }

  function close() {
    popup.close();
  }

  function destroy() {
    popup.destroy();
  }

  return { open, close, destroy };
}
