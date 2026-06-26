# Gemara Markup Syntax (.gmr)

Full specification of the `.gmr` markup language used to annotate Gemara text.

## Principles

- The **original text is always present and unmodified** in the file.
- Formatting and semantic tags are expressed inline, before the words they cover.
- The original text can be recovered by stripping all markup.

## Syntax

### Words

Any sequence of non-space characters that is not a tag or control marker is a **word** (original Gemara text).

### Tags

```
[tag_type {word_count}]
[tag_type prop=value {word_count}]
[tag_type prop1=val1 prop2=val2 {word_count}]
```

- Appears before the words it covers.
- `word_count` tells how many following words this tag applies to.
- `word_count` of 0 means a standalone marker (no words covered).
- Tag names: `speaker`, `question`, `answer`, `refers-to`, `group`, `mishna`, or any custom string.
- Properties: `key=value` pairs. Values containing spaces are URL-encoded (`%20` for spaces, `%25` for literal percent signs).
- **`question`** props: `id=<unique>` (auto-assigned by editor, e.g. `id=q1`).
- **`answer`** props: `to=<question_id>` (references which question this answers).
- **`group`** props: `label=<text>` (optional custom summary shown when collapsed in the editor).

### Multiple tags

Multiple tags can appear before the same words. Each applies independently based on its own `word_count`:

```
[speaker {1}] [question {4}] רבא אמר מנא הני
```

Here "רבא" has both `speaker` and `question`; words 2-4 have only `question`.

### Indentation

```
>>   increase indent by one level
<<   decrease indent by one level
```

Cumulative. Can appear anywhere on a line, before text or on their own.

### Line breaks

A literal newline in the file creates a new line in the displayed output.

### Comments

Not supported. The file is pure text + markup.

## Example

```
[speaker {1}] רבא אמר
[question {6}] מנא הני מילי דאמור רבנן שלשים
>> [answer {7}] דאמר קרא כי תבואו אל הארץ ונטעתם
<<
```

## Answer–Question linking

```
[question id=q1 {6}] מנא הני מילי דאמור רבנן שלשים
[answer to=q1 {7}] דאמר קרא כי תבואו אל הארץ ונטעתם
```

The `id` prop on questions is auto-assigned by the editor. The `to` prop on answers references the question it responds to.

## Collapsible groups

```
[group label=Introduction {5}] אמר רבא הכל מודים בכך
```

The `label` prop is optional; if present, it is shown as the collapsed summary instead of the default first-10-words preview. Multi-word labels are URL-encoded (e.g. `label=Introduction%20Section`). The `default_collapsed` prop (`true` / `false`) sets whether the editor opens the group collapsed when the file is loaded or when the tag is applied; after that, expand/collapse is UI-only until the next load (not re-serialized from the toggle).

## Mishna

```
[mishna {12}] משנה ראשונה כל הסוגיא...
```

Marks a mishna passage. No additional props.

## Recovering original text

Strip all `[...]` tags and `>>` / `<<` markers, collapse whitespace. Result:

```
רבא אמר מנא הני מילי דאמור רבנן שלשים דאמר קרא כי תבואו אל הארץ ונטעתם
```
