# editor.js

Interactive editor built on top of `renderer.js`. Provides a gap-based cursor, click-drag word selection, tag application, delete (word/selection), indentation, line break controls, paste support, hover tag tooltips, collapsible groups, answer→question linking, and context menu integration.

## Exports

### `createEditor(container: HTMLElement, initialNodes: Node[], options?: { newlineBeforeExclusions?: Set<string> }): EditorInstance`

Creates an editor inside `container` with the given initial AST.

- **`newlineBeforeExclusions`** — Optional. If provided, each tag whose name is **not** in the set triggers a new logical line before it when the current line already contains text (so two groups become two lines; tags stacked before the first word stay on one line). The Gemara host builds this from `labels.yaml`: tags with `newline_before: false` are included in the set. If omitted, behavior matches older versions (no implicit line breaks before tags).

Returns an object with:

| Method | Description |
|--------|-------------|
| `getNodes()` | Returns the current AST (mutable reference) |
| `getSelection()` | Returns `{ start, end }` word indices or `null` |
| `setSelection(start, end)` | Programmatically set the selection range |
| `getCursor()` | Returns the current cursor gap position or `null` |
| `setCursor(pos)` | Set cursor to a specific gap position |
| `applyTag(tag, props?)` | Insert a tag covering the selected words. The tag is ordered by containment: if the selection wraps existing groups, the new tag is placed before them so it becomes their parent; a substring of a group nests as a child. |
| `insertIndent(direction)` | Insert `>>` or `<<` at cursor/selection. Also callable via **Tab** (indent) / **Shift+Tab** (outdent). |
| `insertBreak()` | Insert a line break at cursor/selection |
| `insertBreakAtCursor()` | Insert break specifically at cursor (Enter key) |
| `deleteAtCursor()` | Remove break/indent before cursor (legacy) |
| `deleteForward()` | Delete key: remove word/formatting after cursor gap |
| `deleteBackward()` | Backspace: remove word/formatting before cursor gap |
| `deleteSelection()` | Remove all selected words, adjust tag counts |
| `removeTag()` | Remove the tag immediately before cursor/selection |
| `pasteText(text)` | Insert plain text at cursor position |
| `toggleHover(on)` | Enable/disable hover tag tooltips |
| `getTagMap()` | Returns `Map<wordIndex, [{tag, props, nodeIndex}]>` of all active tags |
| `getQuestions()` | Returns array of question tags with preview text |
| `ensureQuestionIds()` | Assigns `id` props to questions that lack one |
| `getGroups()` | Returns array of group info `{nodeIndex, wordStart, wordCount, label, collapsed}` |
| `toggleGroup(nodeIdx)` | Toggle collapse/expand for a group |
| `setGroupLabel(nodeIdx, label)` | Set custom label for a group (shown when collapsed) |
| `editTagProps(nodeIdx, newProps)` | Replace the props of an existing tag node (pushes undo) |
| `setContextMenuHandler(fn)` | Set handler called on right-click: `fn(event, wordIdx, tags)` |
| `rerender()` | Force re-render from current nodes |
| `getScrollPosition()` | Returns the `wordStart` of the first visible line (for scroll persistence) |
| `scrollToWord(wordStart)` | Scrolls to the line containing `wordStart` (restores a saved position) |
| `destroy()` | Clean up DOM and internal state |

## Cursor Model (Gap-Based)

The cursor position represents a **gap between words**, not a word itself:
- Gap 0 = before the first word
- Gap N = between word N-1 and word N
- Gap `wordCount` = after the last word

The cursor renders as a thin blinking vertical bar (`.gmr-cursor-bar`) between adjacent word spans.

## Keyboard

| Key | Action |
|-----|--------|
| ArrowRight | Move cursor toward text start (RTL) |
| ArrowLeft | Move cursor toward text end (RTL) |
| Shift+Arrow | Extend selection while moving cursor |
| Enter | Insert line break at cursor gap |
| Delete | Remove word/formatting after cursor gap (or delete selection) |
| Backspace | Remove word/formatting before cursor gap (or delete selection) |
| Tab | Insert indent at cursor; with multi-word selection, wraps the block with indent-in/indent-out (adds breaks if needed) |
| Shift+Tab | Insert outdent at cursor/selection |
| ArrowUp | Move cursor to same-offset word on the line above |
| ArrowDown | Move cursor to same-offset word on the line below |
| Shift+ArrowUp/Down | Extend selection vertically |
| Escape | Clear selection |

## Delete Behavior

- **No selection + Backspace**: removes the word before the gap, or a break/indent between the word and the cursor.
- **No selection + Delete**: removes the word after the gap, or a break/indent between the cursor and the word.
- **With selection**: removes all selected words. Adjusts `wordCount` of any tags that overlap. Tags that reach `wordCount: 0` are auto-removed.

## Selection

- **Click** a word: move cursor there, start single-word selection.
- **Shift+Click**: extend selection from cursor to clicked word.
- **Click+Drag**: select from mousedown word to mouseup word.
- **Click empty area**: place cursor at end (after last word).
- Selected words get the `gmr-selected` CSS class.

## Virtual Scrolling

For documents with >500 words, the editor uses virtual scrolling to keep the DOM small:

- The scroller is **percent-based**: on scroll it reports the scroll percent (0..1). The editor knows the viewport height, so it computes how many lines fit and which line to start from (`first = round(percent × (totalLines − viewportLines))`).
- `measureCharsPerLine()` runs once per rerender (never on scroll) to find how many characters fit on one row. `prepareLines(nodes, { maxCharsPerLine })` then wraps words so each logical line is **one fixed-height (50px) visual row**.
- Lines use `height: 50px; overflow: hidden`, so total content height always equals `totalLines × 50` — the scrollbar never jumps.
- Rendered lines live in a `position: sticky` content layer that never changes the scroll height, so a render can never trigger another scroll event (no loops).
- Text changes (paste, delete, tag, collapse) re-prepare lines, resize the scroll range, and render the visible window — one render, no loops.
- Lines are justified to both edges (`text-align-last: justify`) like Word.

Disable virtual scrolling with `useVirtualScroll: false` in editor options.

## Collapsible Groups

Groups are created by applying the `group` tag to a selection. They render with a toggle button (▶/▼):

- **Expanded**: all words visible normally. Each group renders on its own line; an expanded group that contains inner groups becomes an indented block — its toggle sits on its own line and every nested group renders on its own line indented one level deeper, so the hierarchy reads top-to-bottom.
- **Collapsed**: words hidden, a summary shown instead (first 10 words + "…" or a custom `label` prop) on a single line.
- **Selectable**: collapsed group summaries behave like words — click to select, drag across to include in selection, shift-click to extend. Their word range participates in the selection model.
- **Mergeable**: select a range spanning words and collapsed groups, then apply "Group" to create a parent group wrapping everything (natural nesting, no special merge API).
- Toggled collapse/expand is runtime UI state. The `label` and `default_collapsed` props are serialized on the tag; on load (or right after `applyTag`), if `default_collapsed` is true, the group starts collapsed.
- Use `toggleGroup(nodeIdx)` or click the toggle button.
- Use `setGroupLabel(nodeIdx, 'Custom text')` to set what shows when collapsed.

## Answer → Question Linking

- `getQuestions()` returns all question tags with their text preview and `id` prop.
- `ensureQuestionIds()` assigns sequential IDs (`q1`, `q2`, ...) to questions without one.
- When applying an "answer" tag, the editor page opens a select-popup showing all questions; user picks one, and the answer gets `to=<question_id>` prop.
- Serialized as `[answer to=q1 {N}]` in the `.gmr` file.

## Hover Tooltips

When enabled (default), hovering a word shows a tooltip listing all tags that cover it. Toggle with `toggleHover(false)` or the toolbar checkbox.

## Context Menu

Set a handler via `setContextMenuHandler(fn)`. On right-click of a word, the handler is called with `(event, wordIndex, tagsOnWord)`. Wire this to `context-menu.js` for a full menu UI.

## Paste

Paste (Ctrl+V) inserts plain text at the cursor position. Words are split by whitespace; newlines become break nodes.

## Usage

```js
import { parse, serialize } from './js/parser.js';
import { createEditor } from './js/editor.js';
import { createContextMenu } from './js/context-menu.js';

const nodes = parse(markupString);
const editor = createEditor(document.getElementById('editor'), nodes);

// Programmatic editing:
editor.setCursor(2);
editor.setSelection(0, 2);
editor.applyTag('question', {});

// Delete selected words:
editor.setSelection(1, 3);
editor.deleteSelection();

// Collapsible groups:
editor.setSelection(0, 5);
editor.applyTag('group', {});
editor.toggleGroup(0); // collapse
editor.setGroupLabel(0, 'Introduction…');

// Answer linking:
editor.ensureQuestionIds();
const questions = editor.getQuestions();
editor.applyTag('answer', { to: questions[0].id });

// Context menu:
const menu = createContextMenu(document.body);
editor.setContextMenuHandler((e, idx, tags) => {
  menu.show(e.clientX, e.clientY, [
    { label: 'Remove Tag', action: () => editor.removeTag() },
  ]);
});

// Save:
const saved = serialize(editor.getNodes());
```
