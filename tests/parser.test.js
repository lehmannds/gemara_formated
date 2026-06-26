import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parse, serialize, extractPlainText } from '../js/parser.js';

describe('parse', () => {
  it('parses plain text into word nodes', () => {
    const nodes = parse('אמר רבא מנא');
    assert.deepEqual(nodes, [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
      { type: 'text', value: 'מנא' },
    ]);
  });

  it('parses a single tag with word count', () => {
    const nodes = parse('[speaker {1}] רבא');
    assert.deepEqual(nodes, [
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'text', value: 'רבא' },
    ]);
  });

  it('parses a tag with properties', () => {
    const nodes = parse('[refers-to target=question {1}] ונטעתם');
    assert.deepEqual(nodes, [
      { type: 'tag', tag: 'refers-to', props: { target: 'question' }, wordCount: 1 },
      { type: 'text', value: 'ונטעתם' },
    ]);
  });

  it('parses a tag with multiple properties', () => {
    const nodes = parse('[answer source=pasuk book=vayikra {3}] דאמר קרא כי');
    assert.deepEqual(nodes, [
      { type: 'tag', tag: 'answer', props: { source: 'pasuk', book: 'vayikra' }, wordCount: 3 },
      { type: 'text', value: 'דאמר' },
      { type: 'text', value: 'קרא' },
      { type: 'text', value: 'כי' },
    ]);
  });

  it('parses multiple stacked tags before the same words', () => {
    const nodes = parse('[speaker {1}] [question {3}] רבא אמר מנא');
    assert.deepEqual(nodes, [
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'tag', tag: 'question', props: {}, wordCount: 3 },
      { type: 'text', value: 'רבא' },
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'מנא' },
    ]);
  });

  it('parses >> as indent-in', () => {
    const nodes = parse('>> אמר');
    assert.deepEqual(nodes, [
      { type: 'indent', direction: 'in' },
      { type: 'text', value: 'אמר' },
    ]);
  });

  it('parses << as indent-out', () => {
    const nodes = parse('<< אמר');
    assert.deepEqual(nodes, [
      { type: 'indent', direction: 'out' },
      { type: 'text', value: 'אמר' },
    ]);
  });

  it('parses multiple indentation markers', () => {
    const nodes = parse('>> >> אמר');
    assert.deepEqual(nodes, [
      { type: 'indent', direction: 'in' },
      { type: 'indent', direction: 'in' },
      { type: 'text', value: 'אמר' },
    ]);
  });

  it('parses newlines as break nodes', () => {
    const nodes = parse('אמר\nרבא');
    assert.deepEqual(nodes, [
      { type: 'text', value: 'אמר' },
      { type: 'break' },
      { type: 'text', value: 'רבא' },
    ]);
  });

  it('parses a complex multi-line example', () => {
    const markup = [
      '[speaker {1}] רבא אמר',
      '>> [question {3}] מנא הני מילי',
      '>> [answer {2}] דאמר קרא',
      '<<',
      '<<',
    ].join('\n');

    const nodes = parse(markup);
    assert.deepEqual(nodes, [
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'text', value: 'רבא' },
      { type: 'text', value: 'אמר' },
      { type: 'break' },
      { type: 'indent', direction: 'in' },
      { type: 'tag', tag: 'question', props: {}, wordCount: 3 },
      { type: 'text', value: 'מנא' },
      { type: 'text', value: 'הני' },
      { type: 'text', value: 'מילי' },
      { type: 'break' },
      { type: 'indent', direction: 'in' },
      { type: 'tag', tag: 'answer', props: {}, wordCount: 2 },
      { type: 'text', value: 'דאמר' },
      { type: 'text', value: 'קרא' },
      { type: 'break' },
      { type: 'indent', direction: 'out' },
      { type: 'break' },
      { type: 'indent', direction: 'out' },
    ]);
  });

  it('handles empty input', () => {
    const nodes = parse('');
    assert.deepEqual(nodes, []);
  });

  it('handles tag with zero word count', () => {
    const nodes = parse('[divider {0}] אמר');
    assert.deepEqual(nodes, [
      { type: 'tag', tag: 'divider', props: {}, wordCount: 0 },
      { type: 'text', value: 'אמר' },
    ]);
  });
});

describe('serialize', () => {
  it('serializes plain text nodes', () => {
    const nodes = [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
    ];
    assert.equal(serialize(nodes), 'אמר רבא');
  });

  it('serializes a tag node', () => {
    const nodes = [
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'text', value: 'רבא' },
    ];
    assert.equal(serialize(nodes), '[speaker {1}] רבא');
  });

  it('serializes a tag with properties', () => {
    const nodes = [
      { type: 'tag', tag: 'refers-to', props: { target: 'question' }, wordCount: 1 },
      { type: 'text', value: 'ונטעתם' },
    ];
    assert.equal(serialize(nodes), '[refers-to target=question {1}] ונטעתם');
  });

  it('serializes indentation markers', () => {
    const nodes = [
      { type: 'indent', direction: 'in' },
      { type: 'text', value: 'אמר' },
    ];
    assert.equal(serialize(nodes), '>> אמר');
  });

  it('serializes line breaks as newlines', () => {
    const nodes = [
      { type: 'text', value: 'אמר' },
      { type: 'break' },
      { type: 'text', value: 'רבא' },
    ];
    assert.equal(serialize(nodes), 'אמר\nרבא');
  });

  it('serializes a complex structure', () => {
    const nodes = [
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'text', value: 'רבא' },
      { type: 'break' },
      { type: 'indent', direction: 'in' },
      { type: 'tag', tag: 'question', props: {}, wordCount: 2 },
      { type: 'text', value: 'מנא' },
      { type: 'text', value: 'הני' },
    ];
    assert.equal(serialize(nodes), '[speaker {1}] רבא\n>> [question {2}] מנא הני');
  });
});

describe('extractPlainText', () => {
  it('extracts only text nodes', () => {
    const nodes = [
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'text', value: 'רבא' },
      { type: 'text', value: 'אמר' },
    ];
    assert.equal(extractPlainText(nodes), 'רבא אמר');
  });

  it('ignores indentation and break nodes', () => {
    const nodes = [
      { type: 'indent', direction: 'in' },
      { type: 'text', value: 'אמר' },
      { type: 'break' },
      { type: 'indent', direction: 'out' },
      { type: 'text', value: 'רבא' },
    ];
    assert.equal(extractPlainText(nodes), 'אמר רבא');
  });

  it('returns empty string for no text nodes', () => {
    const nodes = [
      { type: 'indent', direction: 'in' },
      { type: 'break' },
    ];
    assert.equal(extractPlainText(nodes), '');
  });

  it('round-trips: parse then extractPlainText recovers original', () => {
    const original = 'אמר רבא מנא הני מילי דאמור רבנן';
    const markup = '[speaker {1}] [question {5}] אמר רבא מנא הני מילי דאמור רבנן';
    const nodes = parse(markup);
    assert.equal(extractPlainText(nodes), original);
  });
});

describe('URL-encoded prop values', () => {
  it('serializes prop values with spaces as URL-encoded', () => {
    const nodes = [
      { type: 'tag', tag: 'group', props: { label: 'Hello World' }, wordCount: 3 },
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
    ];
    assert.equal(serialize(nodes), '[group label=Hello%20World {3}] א ב ג');
  });

  it('parses URL-encoded prop values back to original', () => {
    const nodes = parse('[group label=Hello%20World {3}] א ב ג');
    const tag = nodes.find(n => n.type === 'tag');
    assert.equal(tag.props.label, 'Hello World');
  });

  it('round-trips multi-word label through serialize and parse', () => {
    const original = [
      { type: 'tag', tag: 'group', props: { label: 'Introduction Section' }, wordCount: 2 },
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ];
    const serialized = serialize(original);
    const parsed = parse(serialized);
    const tag = parsed.find(n => n.type === 'tag');
    assert.equal(tag.props.label, 'Introduction Section');
    assert.equal(tag.wordCount, 2);
  });

  it('handles prop values with percent signs', () => {
    const nodes = [
      { type: 'tag', tag: 'group', props: { label: '50% done' }, wordCount: 1 },
      { type: 'text', value: 'א' },
    ];
    const serialized = serialize(nodes);
    const parsed = parse(serialized);
    const tag = parsed.find(n => n.type === 'tag');
    assert.equal(tag.props.label, '50% done');
  });

  it('leaves simple prop values unencoded', () => {
    const nodes = [
      { type: 'tag', tag: 'speaker', props: { name: 'rava' }, wordCount: 1 },
      { type: 'text', value: 'רבא' },
    ];
    assert.equal(serialize(nodes), '[speaker name=rava {1}] רבא');
  });
});

describe('round-trip (parse -> serialize)', () => {
  it('round-trips plain text', () => {
    const input = 'אמר רבא מנא';
    assert.equal(serialize(parse(input)), input);
  });

  it('round-trips tagged text', () => {
    const input = '[speaker {1}] רבא אמר';
    assert.equal(serialize(parse(input)), input);
  });

  it('round-trips multi-line with indentation', () => {
    const input = '[speaker {1}] רבא\n>> [question {2}] מנא הני\n<<';
    assert.equal(serialize(parse(input)), input);
  });

  it('round-trips tag with properties', () => {
    const input = '[refers-to target=question {1}] ונטעתם';
    assert.equal(serialize(parse(input)), input);
  });
});
