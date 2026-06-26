import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown } from './dom-env.js';

let render;
let prepareLines;

before(async () => {
  setup();
  ({ render, prepareLines } = await import('../js/renderer.js'));
});

after(() => teardown());

function container() {
  return document.createElement('div');
}

describe('render', () => {
  it('renders plain text as word spans inside a line', () => {
    const nodes = [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
    ];
    const el = container();
    const { root, wordElements } = render(nodes, el);

    assert.equal(root, el);
    assert.equal(wordElements.length, 2);
    assert.equal(wordElements[0].textContent, 'אמר');
    assert.equal(wordElements[1].textContent, 'רבא');
    assert.equal(wordElements[0].dataset.wordIndex, '0');
    assert.equal(wordElements[1].dataset.wordIndex, '1');
    assert.ok(wordElements[0].classList.contains('gmr-word'));
  });

  it('applies tag CSS class to covered words', () => {
    const nodes = [
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'text', value: 'רבא' },
      { type: 'text', value: 'אמר' },
    ];
    const { wordElements } = render(nodes, container());

    assert.ok(wordElements[0].classList.contains('tag-speaker'));
    assert.ok(!wordElements[1].classList.contains('tag-speaker'));
  });

  it('applies tag to multiple words based on wordCount', () => {
    const nodes = [
      { type: 'tag', tag: 'question', props: {}, wordCount: 3 },
      { type: 'text', value: 'מנא' },
      { type: 'text', value: 'הני' },
      { type: 'text', value: 'מילי' },
      { type: 'text', value: 'דאמור' },
    ];
    const { wordElements } = render(nodes, container());

    assert.ok(wordElements[0].classList.contains('tag-question'));
    assert.ok(wordElements[1].classList.contains('tag-question'));
    assert.ok(wordElements[2].classList.contains('tag-question'));
    assert.ok(!wordElements[3].classList.contains('tag-question'));
  });

  it('handles overlapping tags (multiple tags on same words)', () => {
    const nodes = [
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'tag', tag: 'question', props: {}, wordCount: 3 },
      { type: 'text', value: 'רבא' },
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'מנא' },
    ];
    const { wordElements } = render(nodes, container());

    // First word has both tags
    assert.ok(wordElements[0].classList.contains('tag-speaker'));
    assert.ok(wordElements[0].classList.contains('tag-question'));
    // Second and third only have question
    assert.ok(!wordElements[1].classList.contains('tag-speaker'));
    assert.ok(wordElements[1].classList.contains('tag-question'));
    assert.ok(wordElements[2].classList.contains('tag-question'));
  });

  it('creates new line elements on break nodes', () => {
    const nodes = [
      { type: 'text', value: 'אמר' },
      { type: 'break' },
      { type: 'text', value: 'רבא' },
    ];
    const el = container();
    render(nodes, el);

    const lines = el.querySelectorAll('.gmr-line');
    assert.equal(lines.length, 2);
    assert.equal(lines[0].textContent, 'אמר');
    assert.equal(lines[1].textContent, 'רבא');
  });

  it('applies indentation as marginInlineStart', () => {
    const nodes = [
      { type: 'text', value: 'אמר' },
      { type: 'break' },
      { type: 'indent', direction: 'in' },
      { type: 'text', value: 'רבא' },
      { type: 'break' },
      { type: 'indent', direction: 'in' },
      { type: 'text', value: 'מנא' },
    ];
    const el = container();
    render(nodes, el);

    const lines = el.querySelectorAll('.gmr-line');
    assert.equal(lines[0].style.marginInlineStart, '0em');
    assert.equal(lines[1].style.marginInlineStart, '2em');
    assert.equal(lines[2].style.marginInlineStart, '4em');
  });

  it('decreases indentation with indent-out', () => {
    const nodes = [
      { type: 'indent', direction: 'in' },
      { type: 'text', value: 'אמר' },
      { type: 'break' },
      { type: 'indent', direction: 'out' },
      { type: 'text', value: 'רבא' },
    ];
    const el = container();
    render(nodes, el);

    const lines = el.querySelectorAll('.gmr-line');
    assert.equal(lines[0].style.marginInlineStart, '2em');
    assert.equal(lines[1].style.marginInlineStart, '0em');
  });

  it('does not go below zero indentation', () => {
    const nodes = [
      { type: 'indent', direction: 'out' },
      { type: 'text', value: 'אמר' },
    ];
    const el = container();
    render(nodes, el);

    const lines = el.querySelectorAll('.gmr-line');
    assert.equal(lines[0].style.marginInlineStart, '0em');
  });

  it('sets data attributes for tag properties', () => {
    const nodes = [
      { type: 'tag', tag: 'refers-to', props: { target: 'question' }, wordCount: 1 },
      { type: 'text', value: 'ונטעתם' },
    ];
    const { wordElements } = render(nodes, container());

    assert.ok(wordElements[0].classList.contains('tag-refers-to'));
    assert.equal(wordElements[0].dataset.tagRefersToTarget, 'question');
  });

  it('returns ordered wordElements array matching document order', () => {
    const nodes = [
      { type: 'text', value: 'a' },
      { type: 'break' },
      { type: 'text', value: 'b' },
      { type: 'text', value: 'c' },
    ];
    const { wordElements } = render(nodes, container());

    assert.equal(wordElements.length, 3);
    assert.equal(wordElements[0].textContent, 'a');
    assert.equal(wordElements[1].textContent, 'b');
    assert.equal(wordElements[2].textContent, 'c');
  });

  it('clears container before rendering', () => {
    const el = container();
    el.innerHTML = '<p>old content</p>';
    render([{ type: 'text', value: 'new' }], el);

    assert.equal(el.querySelectorAll('p').length, 0);
    assert.equal(el.querySelector('.gmr-word').textContent, 'new');
  });

  it('with newlineBeforeExclusions, two consecutive groups split into two lines', () => {
    const nodes = [
      { type: 'tag', tag: 'group', props: {}, wordCount: 1 },
      { type: 'text', value: 'a' },
      { type: 'tag', tag: 'group', props: {}, wordCount: 1 },
      { type: 'text', value: 'b' },
    ];
    const el = container();
    render(nodes, el, { newlineBeforeExclusions: new Set() });

    const lines = el.querySelectorAll('.gmr-line');
    assert.equal(lines.length, 2);
    assert.equal(lines[0].querySelector('.gmr-word')?.textContent, 'a');
    assert.equal(lines[1].querySelector('.gmr-word')?.textContent, 'b');
  });

  it('each collapsible group renders on its own line', () => {
    const nodes = [
      { type: 'tag', tag: 'group', props: {}, wordCount: 1 },
      { type: 'text', value: 'a' },
      { type: 'tag', tag: 'group', props: {}, wordCount: 1 },
      { type: 'text', value: 'b' },
    ];
    const el = container();
    render(nodes, el);

    // Every group sits on its own row, so two consecutive groups split.
    const lines = el.querySelectorAll('.gmr-line');
    assert.equal(lines.length, 2);
    assert.equal(lines[0].querySelector('.gmr-word')?.textContent, 'a');
    assert.equal(lines[1].querySelector('.gmr-word')?.textContent, 'b');
  });

  it('expanded outer group renders its inner group on a deeper-indented line', () => {
    const nodes = [
      { type: 'tag', tag: 'group', props: {}, wordCount: 3 }, // outer, has inner group
      { type: 'text', value: 'a' },
      { type: 'tag', tag: 'group', props: {}, wordCount: 2 }, // inner (leaf)
      { type: 'text', value: 'b' },
      { type: 'text', value: 'c' },
    ];
    const el = container();
    render(nodes, el);

    const outerToggle = el.querySelector('.gmr-group-toggle[data-node-index="0"]');
    const innerToggle = el.querySelector('.gmr-group-toggle[data-node-index="2"]');
    assert.ok(outerToggle && innerToggle);

    const outerLine = outerToggle.closest('.gmr-line');
    const innerLine = innerToggle.closest('.gmr-line');
    const indentOf = (line) => parseFloat(line.style.marginInlineStart) || 0;
    assert.notEqual(outerLine, innerLine);
    assert.ok(indentOf(innerLine) > indentOf(outerLine), 'inner group is indented deeper');
  });
});

describe('prepareLines newlineBeforeExclusions', () => {
  it('keeps stacked tags before first word on one line when exclusions is set', () => {
    const nodes = [
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'tag', tag: 'question', props: {}, wordCount: 1 },
      { type: 'text', value: 'x' },
    ];
    const { lines } = prepareLines(nodes, { newlineBeforeExclusions: new Set() });
    assert.equal(lines.length, 1);
    assert.equal(lines[0].wordCount, 1);
  });

  it('does not flush before excluded tag after text', () => {
    const nodes = [
      { type: 'text', value: 'a' },
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'text', value: 'b' },
    ];
    const { lines } = prepareLines(nodes, {
      newlineBeforeExclusions: new Set(['speaker']),
    });
    assert.equal(lines.length, 1);
  });

  it('flushes before tag after text when tag is not excluded', () => {
    const nodes = [
      { type: 'text', value: 'a' },
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'text', value: 'b' },
    ];
    const { lines } = prepareLines(nodes, { newlineBeforeExclusions: new Set() });
    assert.equal(lines.length, 2);
  });
});
