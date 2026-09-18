import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown } from './dom-env.js';

let createEditor;

before(async () => {
  setup();
  ({ createEditor } = await import('../js/editor.js'));
});

after(() => teardown());

function container() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

function words(el) {
  return el.querySelectorAll('.gmr-word');
}

// Helper: simulate a KeyboardEvent on document
function pressKey(key, opts = {}) {
  const ev = new globalThis.window.KeyboardEvent('keydown', {
    key,
    bubbles: true,
    ...opts,
  });
  document.dispatchEvent(ev);
}

// ─── Basic creation ───────────────────────────────────────────

describe('createEditor', () => {
  it('renders initial nodes into the container', () => {
    const nodes = [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
    ];
    const el = container();
    const ed = createEditor(el, nodes);
    assert.equal(words(el).length, 2);
    assert.equal(words(el)[0].textContent, 'אמר');
    ed.destroy();
  });

  it('getNodes returns current AST', () => {
    const nodes = [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
    ];
    const ed = createEditor(container(), nodes);
    assert.deepEqual(ed.getNodes(), nodes);
    ed.destroy();
  });

  it('getSelection returns null when nothing selected', () => {
    const ed = createEditor(container(), [{ type: 'text', value: 'אמר' }]);
    assert.equal(ed.getSelection(), null);
    ed.destroy();
  });
});

// ─── Cursor (gap-based) ──────────────────────────────────────

describe('cursor', () => {
  it('getCursor returns null initially', () => {
    const ed = createEditor(container(), [{ type: 'text', value: 'אמר' }]);
    assert.equal(ed.getCursor(), null);
    ed.destroy();
  });

  it('setCursor sets cursor position', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
    ]);
    ed.setCursor(1);
    assert.equal(ed.getCursor(), 1);
    ed.destroy();
  });

  it('cursor bar element is rendered at gap position', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
    ]);
    ed.setCursor(1);
    const bar = el.querySelector('.gmr-cursor-bar');
    assert.ok(bar, 'cursor bar should exist');
    ed.destroy();
  });

  it('ArrowLeft moves cursor forward (higher index in RTL)', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
    ]);
    ed.setCursor(0);
    pressKey('ArrowLeft');
    assert.equal(ed.getCursor(), 1);
    ed.destroy();
  });

  it('ArrowRight moves cursor backward (lower index in RTL)', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
    ]);
    ed.setCursor(2);
    pressKey('ArrowRight');
    assert.equal(ed.getCursor(), 1);
    ed.destroy();
  });

  it('ArrowRight does not go below 0', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setCursor(0);
    pressKey('ArrowRight');
    assert.equal(ed.getCursor(), 0);
    ed.destroy();
  });

  it('ArrowLeft can reach past last word (gap at end)', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setCursor(1);
    pressKey('ArrowLeft');
    assert.equal(ed.getCursor(), 2);
    ed.destroy();
  });

  it('ArrowLeft does not exceed wordCount', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setCursor(2);
    pressKey('ArrowLeft');
    assert.equal(ed.getCursor(), 2);
    ed.destroy();
  });

  it('Enter inserts a break at cursor', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
    ]);
    ed.setCursor(1);
    pressKey('Enter');
    const result = ed.getNodes();
    assert.equal(result[1].type, 'break');
    assert.equal(result[2].type, 'text');
    assert.equal(result[2].value, 'ב');
    ed.destroy();
  });

  it('Escape clears selection', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setSelection(0, 1);
    assert.notEqual(ed.getSelection(), null);
    pressKey('Escape');
    assert.equal(ed.getSelection(), null);
    ed.destroy();
  });
});

// ─── Delete (enhanced) ───────────────────────────────────────

describe('delete', () => {
  it('deleteAtCursor removes break before cursor word', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'break' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setCursor(1);
    ed.deleteAtCursor();
    const result = ed.getNodes();
    assert.equal(result.length, 2);
    assert.equal(result[0].type, 'text');
    assert.equal(result[1].type, 'text');
    ed.destroy();
  });

  it('deleteAtCursor removes indent before cursor word', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'indent', direction: 'in' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setCursor(1);
    ed.deleteAtCursor();
    const result = ed.getNodes();
    assert.equal(result.length, 2);
    assert.equal(result[0].value, 'א');
    assert.equal(result[1].value, 'ב');
    ed.destroy();
  });

  it('deleteForward removes word after cursor gap', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
    ]);
    ed.setCursor(1);
    ed.deleteForward();
    const result = ed.getNodes();
    const textValues = result.filter(n => n.type === 'text').map(n => n.value);
    assert.deepEqual(textValues, ['א', 'ג']);
    ed.destroy();
  });

  it('deleteBackward removes word before cursor gap', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
    ]);
    ed.setCursor(2);
    ed.deleteBackward();
    const result = ed.getNodes();
    const textValues = result.filter(n => n.type === 'text').map(n => n.value);
    assert.deepEqual(textValues, ['א', 'ג']);
    ed.destroy();
  });

  it('deleteSelection removes all selected words', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
      { type: 'text', value: 'ד' },
    ]);
    ed.setSelection(1, 2);
    ed.deleteSelection();
    const result = ed.getNodes();
    const textValues = result.filter(n => n.type === 'text').map(n => n.value);
    assert.deepEqual(textValues, ['א', 'ד']);
    ed.destroy();
  });

  it('deleteSelection adjusts tag wordCount for partial overlap', () => {
    const ed = createEditor(container(), [
      { type: 'tag', tag: 'question', props: {}, wordCount: 4 },
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
      { type: 'text', value: 'ד' },
    ]);
    ed.setSelection(1, 2); // delete ב and ג
    ed.deleteSelection();
    const result = ed.getNodes();
    const tag = result.find(n => n.type === 'tag');
    assert.equal(tag.wordCount, 2);
    ed.destroy();
  });

  it('deleteSelection removes tag when wordCount reaches 0', () => {
    const ed = createEditor(container(), [
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'text', value: 'רבא' },
      { type: 'text', value: 'אמר' },
    ]);
    ed.setSelection(0, 0); // delete the single word covered by speaker
    ed.deleteSelection();
    const result = ed.getNodes();
    assert.ok(!result.some(n => n.type === 'tag'));
    ed.destroy();
  });

  it('Delete key removes break before cursor word', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'break' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setCursor(1);
    pressKey('Delete');
    const result = ed.getNodes();
    assert.equal(result.length, 2);
    assert.equal(result[0].type, 'text');
    assert.equal(result[1].type, 'text');
    ed.destroy();
  });

  it('Backspace key removes break before cursor word', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'break' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setCursor(1);
    pressKey('Backspace');
    const result = ed.getNodes();
    assert.equal(result.length, 2);
    ed.destroy();
  });
});

// ─── Selection ────────────────────────────────────────────────

describe('selection', () => {
  it('setSelection sets the selection range', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
      { type: 'text', value: 'מנא' },
    ]);
    ed.setSelection(0, 1);
    assert.deepEqual(ed.getSelection(), { start: 0, end: 1 });
    assert.ok(words(el)[0].classList.contains('gmr-selected'));
    assert.ok(words(el)[1].classList.contains('gmr-selected'));
    assert.ok(!words(el)[2].classList.contains('gmr-selected'));
    ed.destroy();
  });

  it('clicking a word sets cursor and single-word selection', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
    ]);
    const w = words(el);
    w[0].dispatchEvent(new globalThis.window.MouseEvent('mousedown', { bubbles: true, button: 0 }));
    assert.equal(ed.getCursor(), 0);
    assert.deepEqual(ed.getSelection(), { start: 0, end: 0 });
    ed.destroy();
  });

  it('Shift+ArrowLeft extends selection', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
    ]);
    ed.setCursor(0);
    pressKey('ArrowLeft', { shiftKey: true });
    assert.deepEqual(ed.getSelection(), { start: 0, end: 1 });
    ed.destroy();
  });
});

// ─── applyTag ─────────────────────────────────────────────────

describe('applyTag', () => {
  it('inserts a tag node before the selected words', () => {
    const nodes = [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
      { type: 'text', value: 'מנא' },
    ];
    const ed = createEditor(container(), nodes);
    ed.setSelection(1, 2);
    ed.applyTag('question', {});

    const result = ed.getNodes();
    assert.equal(result[0].type, 'text');
    assert.equal(result[1].type, 'tag');
    assert.equal(result[1].tag, 'question');
    assert.equal(result[1].wordCount, 2);
    ed.destroy();
  });

  it('inserts a tag with properties', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
    ]);
    ed.setSelection(0, 0);
    ed.applyTag('speaker', { name: 'rava' });

    const result = ed.getNodes();
    assert.equal(result[0].type, 'tag');
    assert.deepEqual(result[0].props, { name: 'rava' });
    assert.equal(result[0].wordCount, 1);
    ed.destroy();
  });

  it('clears selection after applying tag', () => {
    const ed = createEditor(container(), [{ type: 'text', value: 'אמר' }]);
    ed.setSelection(0, 0);
    ed.applyTag('speaker', {});
    assert.equal(ed.getSelection(), null);
    ed.destroy();
  });

  it('does nothing when no selection', () => {
    const ed = createEditor(container(), [{ type: 'text', value: 'אמר' }]);
    ed.applyTag('speaker', {});
    assert.equal(ed.getNodes().length, 1);
    ed.destroy();
  });
});

// ─── Group hierarchy / containment ordering ───────────────────

describe('applyTag group hierarchy', () => {
  function words(n, prefix = 'w') {
    const arr = [];
    for (let i = 0; i < n; i++) arr.push({ type: 'text', value: prefix + i });
    return arr;
  }

  // The logical hierarchy lives in the AST (tag node order + wordCount). A group
  // P is an ancestor of C when P's word range contains C's and P's tag precedes
  // C's. Returns the innermost such ancestor (the logical parent), or null.
  function logicalParent(groups, child) {
    let parent = null;
    for (const g of groups) {
      if (g.nodeIndex === child.nodeIndex) continue;
      const contains =
        g.nodeIndex < child.nodeIndex &&
        g.wordStart <= child.wordStart &&
        g.wordStart + g.wordCount >= child.wordStart + child.wordCount;
      if (contains && (!parent || g.wordCount < parent.wordCount)) parent = g;
    }
    return parent;
  }

  it('grouping a selection that contains two groups makes the new group their parent', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'tag', tag: 'group', props: {}, wordCount: 2 }, // G1: w0..w1
      ...words(4),
      { type: 'tag', tag: 'group', props: {}, wordCount: 2 }, // G2: x0..x1
      ...words(3, 'x'),
    ], { useVirtualScroll: false });

    ed.setSelection(0, 6); // wrap everything
    ed.applyTag('group', {});

    const groups = ed.getGroups();
    // New outer group starts at word 0 and covers all 7 selected words.
    const outer = groups.find(g => g.wordStart === 0 && g.wordCount === 7);
    assert.ok(outer, 'expected a new group covering all 7 words');

    // In the array the outer group's tag must come FIRST (smallest node index).
    const minNodeIndex = Math.min(...groups.map(g => g.nodeIndex));
    assert.equal(outer.nodeIndex, minNodeIndex, 'new group tag must precede contained groups');

    // The two original groups are children (logical parent === new outer group).
    const children = groups.filter(g => g.nodeIndex !== outer.nodeIndex);
    assert.equal(children.length, 2);
    for (const c of children) {
      assert.equal(logicalParent(groups, c)?.nodeIndex, outer.nodeIndex);
    }
    ed.destroy();
  });

  it('grouping a substring sharing the start word nests the new group as a child', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'tag', tag: 'group', props: {}, wordCount: 5 }, // A: w0..w4
      ...words(5),
    ], { useVirtualScroll: false });

    ed.setSelection(0, 2); // substring sharing start
    ed.applyTag('group', {});

    const groups = ed.getGroups();
    const outer = groups.find(g => g.wordCount === 5);
    const inner = groups.find(g => g.wordCount === 3);
    assert.ok(outer && inner);
    assert.equal(logicalParent(groups, inner)?.nodeIndex, outer.nodeIndex, 'new sub-group is a child of the original');
    ed.destroy();
  });

  it('grouping an interior substring nests as a child', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'tag', tag: 'group', props: {}, wordCount: 5 }, // A: w0..w4
      ...words(5),
    ], { useVirtualScroll: false });

    ed.setSelection(1, 3); // interior substring
    ed.applyTag('group', {});

    const groups = ed.getGroups();
    const outer = groups.find(g => g.wordCount === 5);
    const inner = groups.find(g => g.wordCount === 3);
    assert.ok(outer && inner);
    assert.equal(logicalParent(groups, inner)?.nodeIndex, outer.nodeIndex, 'interior sub-group nested in the original');
    ed.destroy();
  });
});

// ─── insertIndent / insertBreak ───────────────────────────────

describe('insertIndent', () => {
  it('inserts indent-in at cursor position', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
    ]);
    ed.setCursor(1);
    ed.insertIndent('in');
    const result = ed.getNodes();
    assert.equal(result[1].type, 'indent');
    assert.equal(result[1].direction, 'in');
    ed.destroy();
  });

  it('inserts indent-out at cursor position', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
    ]);
    ed.setCursor(1);
    ed.insertIndent('out');
    const result = ed.getNodes();
    assert.equal(result[1].type, 'indent');
    assert.equal(result[1].direction, 'out');
    ed.destroy();
  });
});

describe('insertBreak', () => {
  it('inserts a break at cursor position', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
    ]);
    ed.setCursor(1);
    ed.insertBreak();
    const result = ed.getNodes();
    assert.equal(result[1].type, 'break');
    assert.equal(result[2].value, 'רבא');
    ed.destroy();
  });
});

// ─── removeTag ────────────────────────────────────────────────

describe('removeTag', () => {
  it('removes the tag immediately before the cursor word', () => {
    const nodes = [
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'text', value: 'רבא' },
    ];
    const ed = createEditor(container(), nodes);
    ed.setCursor(0);
    ed.removeTag();
    const result = ed.getNodes();
    assert.equal(result.length, 1);
    assert.equal(result[0].type, 'text');
    ed.destroy();
  });

  it('does nothing when no tag precedes the cursor', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'אמר' },
      { type: 'text', value: 'רבא' },
    ]);
    ed.setCursor(1);
    ed.removeTag();
    assert.equal(ed.getNodes().length, 2);
    ed.destroy();
  });
});

// ─── Paste ────────────────────────────────────────────────────

describe('pasteText', () => {
  it('inserts pasted words at cursor position', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setCursor(1);
    ed.pasteText('ג ד');
    const result = ed.getNodes();
    const textValues = result.filter(n => n.type === 'text').map(n => n.value);
    assert.deepEqual(textValues, ['א', 'ג', 'ד', 'ב']);
    ed.destroy();
  });

  it('inserts break nodes for newlines in pasted text', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setCursor(1);
    ed.pasteText('ג\nד');
    const result = ed.getNodes();
    assert.equal(result[1].type, 'text');
    assert.equal(result[1].value, 'ג');
    assert.equal(result[2].type, 'break');
    assert.equal(result[3].type, 'text');
    assert.equal(result[3].value, 'ד');
    ed.destroy();
  });

  it('appends at end when no cursor', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
    ]);
    ed.pasteText('ב ג');
    const result = ed.getNodes();
    const textValues = result.filter(n => n.type === 'text').map(n => n.value);
    assert.deepEqual(textValues, ['א', 'ב', 'ג']);
    ed.destroy();
  });
});

// ─── Tag map / hover ──────────────────────────────────────────

describe('getTagMap', () => {
  it('maps word indices to their covering tags', () => {
    const nodes = [
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 1 },
      { type: 'tag', tag: 'question', props: {}, wordCount: 3 },
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
      { type: 'text', value: 'ד' },
    ];
    const ed = createEditor(container(), nodes);
    const map = ed.getTagMap();

    assert.equal(map.get(0).length, 2);
    assert.equal(map.get(0)[0].tag, 'speaker');
    assert.equal(map.get(0)[1].tag, 'question');
    assert.equal(map.get(1).length, 1);
    assert.equal(map.get(1)[0].tag, 'question');
    assert.equal(map.get(2).length, 1);
    assert.equal(map.has(3), false);
    ed.destroy();
  });
});

// ─── Questions helper ─────────────────────────────────────────

describe('getQuestions', () => {
  it('returns question tags with preview text', () => {
    const nodes = [
      { type: 'tag', tag: 'question', props: { id: 'q1' }, wordCount: 3 },
      { type: 'text', value: 'מנא' },
      { type: 'text', value: 'הני' },
      { type: 'text', value: 'מילי' },
      { type: 'text', value: 'אמר' },
    ];
    const ed = createEditor(container(), nodes);
    const questions = ed.getQuestions();
    assert.equal(questions.length, 1);
    assert.equal(questions[0].id, 'q1');
    assert.equal(questions[0].preview, 'מנא הני מילי');
    ed.destroy();
  });

  it('ensureQuestionIds assigns ids to questions without one', () => {
    const nodes = [
      { type: 'tag', tag: 'question', props: {}, wordCount: 2 },
      { type: 'text', value: 'מנא' },
      { type: 'text', value: 'הני' },
    ];
    const ed = createEditor(container(), nodes);
    ed.ensureQuestionIds();
    const result = ed.getNodes();
    assert.equal(result[0].props.id, 'q1');
    ed.destroy();
  });
});

// ─── Collapsible groups ───────────────────────────────────────

describe('collapsible groups', () => {
  it('getGroups returns group info', () => {
    const nodes = [
      { type: 'tag', tag: 'group', props: {}, wordCount: 3 },
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
    ];
    const ed = createEditor(container(), nodes);
    const groups = ed.getGroups();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].tag, 'group');
    assert.equal(groups[0].wordCount, 3);
    assert.equal(groups[0].collapsed, false);
    ed.destroy();
  });

  it('toggleGroup collapses and expands', () => {
    const nodes = [
      { type: 'tag', tag: 'group', props: {}, wordCount: 3 },
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
    ];
    const el = container();
    const ed = createEditor(el, nodes);

    ed.toggleGroup(0);
    let groups = ed.getGroups();
    assert.equal(groups[0].collapsed, true);
    // Summary should show first words
    const summary = el.querySelector('.gmr-group-summary');
    assert.ok(summary);
    assert.ok(summary.textContent.includes('א'));

    ed.toggleGroup(0);
    groups = ed.getGroups();
    assert.equal(groups[0].collapsed, false);
    ed.destroy();
  });

  it('setGroupLabel sets custom label shown when collapsed', () => {
    const nodes = [
      { type: 'tag', tag: 'group', props: {}, wordCount: 3 },
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
    ];
    const el = container();
    const ed = createEditor(el, nodes);
    ed.setGroupLabel(0, 'Custom Label');
    ed.toggleGroup(0);
    const summary = el.querySelector('.gmr-group-summary');
    assert.equal(summary.textContent, 'Custom Label');
    ed.destroy();
  });

  it('group with default_collapsed=true starts collapsed', () => {
    const nodes = [
      { type: 'tag', tag: 'group', props: { default_collapsed: 'true' }, wordCount: 2 },
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ];
    const ed = createEditor(container(), nodes);
    const groups = ed.getGroups();
    assert.equal(groups[0].collapsed, true);
    ed.destroy();
  });

  it('applyTag group with default_collapsed adds collapsed state', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setSelection(0, 1);
    ed.applyTag('group', { default_collapsed: 'true' });
    const groups = ed.getGroups();
    assert.equal(groups.length, 1);
    assert.equal(groups[0].collapsed, true);
    ed.destroy();
  });

  it('extractTagTailFromSelection shortens tag from first selected word onward', () => {
    const ed = createEditor(container(), [
      { type: 'tag', tag: 'speaker', props: {}, wordCount: 4 },
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
      { type: 'text', value: 'ד' },
    ]);
    ed.setSelection(2, 2);
    assert.equal(ed.extractTagTailFromSelection(0), true);
    const nodes = ed.getNodes();
    assert.equal(nodes[0].wordCount, 2);
    const tagsOnGamma = ed.getTagMap().get(2) || [];
    assert.ok(!tagsOnGamma.some(t => t.tag === 'speaker'));
    ed.destroy();
  });

  it('expanded outer group lays its inner group on its own indented line', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'tag', tag: 'group', props: {}, wordCount: 3 }, // outer, has inner group
      { type: 'text', value: 'a' },
      { type: 'tag', tag: 'group', props: {}, wordCount: 2 }, // inner (leaf)
      { type: 'text', value: 'b' },
      { type: 'text', value: 'c' },
    ]);

    const lines = [...el.querySelectorAll('.gmr-line')];
    const outerToggle = el.querySelector('.gmr-group-toggle[data-node-index="0"]');
    const innerToggle = el.querySelector('.gmr-group-toggle[data-node-index="2"]');
    assert.ok(outerToggle && innerToggle, 'both toggles render');

    // Toggles live in a gutter element
    assert.ok(outerToggle.closest('.gmr-group-gutter'), 'outer toggle is in gutter');
    assert.ok(innerToggle.closest('.gmr-group-gutter'), 'inner toggle is in gutter');

    const lineOf = (node) => node.closest('.gmr-line');

    const outerLine = lineOf(outerToggle);
    const innerLine = lineOf(innerToggle);
    assert.notEqual(outerLine, innerLine, 'inner group is on a different line from the outer toggle');

    // Grouping does not affect indentation
    const indentOf = (line) => parseFloat(line.style.marginInlineStart) || 0;
    assert.equal(indentOf(outerLine), 0, 'outer line has no group indent');
    assert.equal(indentOf(innerLine), 0, 'inner line has no group indent');
    ed.destroy();
  });

  it('expanding an outer group shows each inner group on its own indented line', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'tag', tag: 'group', props: { label: 'OUTER' }, wordCount: 6 },
      { type: 'tag', tag: 'group', props: { label: 'IN1' }, wordCount: 3 },
      { type: 'text', value: 'a' },
      { type: 'text', value: 'b' },
      { type: 'text', value: 'c' },
      { type: 'break' },
      { type: 'tag', tag: 'group', props: { label: 'IN2' }, wordCount: 3 },
      { type: 'text', value: 'd' },
      { type: 'text', value: 'e' },
      { type: 'text', value: 'f' },
    ], { useVirtualScroll: false });

    const indentOf = (line) => parseFloat(line.style.marginInlineStart) || 0;
    const summaryLines = () =>
      [...el.querySelectorAll('.gmr-group-summary')].map(s => ({
        text: s.textContent,
        indent: indentOf(s.closest('.gmr-line')),
      }));

    // Collapse the two inner groups; outer stays expanded.
    ed.toggleGroup(1);
    ed.toggleGroup(6);

    let summaries = summaryLines();
    // Two inner summaries, each on its own line, no hierarchy indent.
    assert.deepEqual(summaries.map(s => s.text), ['IN1', 'IN2']);
    const outerLine = el.querySelector('.gmr-group-toggle[data-node-index="0"]').closest('.gmr-line');
    assert.equal(indentOf(outerLine), 0, 'outer group line has no indent');
    assert.ok(summaries.every(s => s.indent === 0), 'inner groups have no hierarchy indent');
    // Each inner summary is on a distinct line (no garble / pile-up).
    const in1Line = el.querySelector('.gmr-group[data-node-index="1"]').closest('.gmr-line');
    const in2Line = el.querySelector('.gmr-group[data-node-index="6"]').closest('.gmr-line');
    assert.notEqual(in1Line, in2Line);

    // Collapsing the outer collapses everything to a single summary line.
    ed.toggleGroup(0);
    assert.deepEqual(summaryLines().map(s => s.text), ['OUTER']);

    // Re-expanding restores the two indented inner lines (stable toggling).
    ed.toggleGroup(0);
    assert.deepEqual(summaryLines().map(s => s.text), ['IN1', 'IN2']);
    ed.destroy();
  });
});

// ─── Undo / Redo ──────────────────────────────────────────────

describe('undo/redo', () => {
  it('undo reverts an applyTag', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setSelection(0, 1);
    ed.applyTag('speaker', {});
    assert.ok(ed.getNodes().some(n => n.type === 'tag'));

    ed.undo();
    const result = ed.getNodes();
    assert.equal(result.length, 2);
    assert.ok(result.every(n => n.type === 'text'));
    ed.destroy();
  });

  it('redo re-applies after undo', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setSelection(0, 1);
    ed.applyTag('speaker', {});
    ed.undo();
    ed.redo();
    assert.ok(ed.getNodes().some(n => n.type === 'tag'));
    ed.destroy();
  });

  it('undo reverts insertBreak', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setCursor(1);
    ed.insertBreak();
    assert.ok(ed.getNodes().some(n => n.type === 'break'));

    ed.undo();
    assert.ok(!ed.getNodes().some(n => n.type === 'break'));
    ed.destroy();
  });

  it('undo reverts deleteSelection', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
    ]);
    ed.setSelection(1, 1);
    ed.deleteSelection();
    assert.equal(ed.getNodes().filter(n => n.type === 'text').length, 2);

    ed.undo();
    assert.equal(ed.getNodes().filter(n => n.type === 'text').length, 3);
    ed.destroy();
  });

  it('undo restores cursor position', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setCursor(1);
    ed.insertBreak();
    ed.undo();
    assert.equal(ed.getCursor(), 1);
    ed.destroy();
  });

  it('Ctrl+Z triggers undo', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setSelection(0, 1);
    ed.applyTag('speaker', {});
    pressKey('z', { ctrlKey: true });
    assert.ok(ed.getNodes().every(n => n.type === 'text'));
    ed.destroy();
  });

  it('Ctrl+Y triggers redo', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    ed.setSelection(0, 1);
    ed.applyTag('speaker', {});
    pressKey('z', { ctrlKey: true });
    pressKey('y', { ctrlKey: true });
    assert.ok(ed.getNodes().some(n => n.type === 'tag'));
    ed.destroy();
  });

  it('stack is capped at 20 entries', () => {
    const ed = createEditor(container(), [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
    ]);
    for (let i = 0; i < 25; i++) {
      ed.setCursor(1);
      ed.insertBreak();
    }
    // Undo should work up to 20 times
    let undoCount = 0;
    for (let i = 0; i < 30; i++) {
      const before = ed.getNodes().length;
      ed.undo();
      if (ed.getNodes().length !== before) undoCount++;
      else break;
    }
    assert.equal(undoCount, 20);
    ed.destroy();
  });
});

// ─── Arrow key scroll stability ───────────────────────────────

describe('arrow keys do not scroll when cursor is visible', () => {
  it('ArrowLeft does not change scrollTop', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
    ]);
    ed.setCursor(0);
    const scrollBefore = el.scrollTop;
    pressKey('ArrowLeft');
    assert.equal(el.scrollTop, scrollBefore, 'scrollTop should not change');
    ed.destroy();
  });

  it('ArrowRight does not change scrollTop', () => {
    const el = container();
    const ed = createEditor(el, [
      { type: 'text', value: 'א' },
      { type: 'text', value: 'ב' },
      { type: 'text', value: 'ג' },
    ]);
    ed.setCursor(2);
    const scrollBefore = el.scrollTop;
    pressKey('ArrowRight');
    assert.equal(el.scrollTop, scrollBefore, 'scrollTop should not change');
    ed.destroy();
  });
});

// ─── Destroy ──────────────────────────────────────────────────

describe('destroy', () => {
  it('clears the container and resets state', () => {
    const el = container();
    const ed = createEditor(el, [{ type: 'text', value: 'אמר' }]);
    ed.destroy();
    assert.equal(el.innerHTML, '');
    assert.deepEqual(ed.getNodes(), []);
    assert.equal(ed.getSelection(), null);
    assert.equal(ed.getCursor(), null);
  });
});
