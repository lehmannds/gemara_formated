# CSS development

Conventions for stylesheets in this project. Align this document with your stack (vanilla CSS, PostCSS, Sass, Tailwind, etc.) when you choose it.

## Principles

- Prefer **readable selectors** over deep nesting; keep specificity **low** so overrides stay predictable.
- Use **design tokens** (CSS custom properties) for **colors, spacing, type scale, and radii** once you define them—avoid magic numbers repeated everywhere.
- Build **mobile-first** unless the product explicitly targets desktop only; use meaningful breakpoints and name them if you use a preprocessor or framework config.

## Avoid bloat

- Do **not** invent a new look for every screen: define **shared patterns once** and reuse them. Prefer **one button class** (and small modifier variants if needed) used site-wide, **one table style** for data tables, **one form field pattern**, and so on—then compose pages from those primitives.
- When something needs to differ slightly, extend with **modifiers** or **tokens** (spacing, color) instead of copying whole rule blocks.
- Before adding a new class, check whether an **existing** one already fits; avoid parallel `.btn-primary-page-a` and `.btn-primary-page-b` that differ only by accident.

## File and naming

- Entry stylesheet: **`css/main.css`** (`@import` of tokens, base, button, table, popup). Data table: [docs/css/table.md](./css/table.md); modal popup: [docs/css/popup.md](./css/popup.md).
- **Naming:** BEM-style blocks — `.data-table` / `.data-table__th`, `.popup` / `.popup__dialog`, shared `.btn`.

## Layout and components

- Prefer **flexbox and grid** for layout; avoid tables for layout unless tabular data.
- Reusable UI pieces should **not** depend on one-off page context; scope with class names or documented patterns.

## Maintenance

- Avoid **`!important`** except as a last resort; if used, comment **why**.
- Delete **unused rules** when removing markup or components.
- When **dark mode** or themes exist, define variables and test both (or document supported themes).

## Performance

- Be careful with **expensive selectors** and huge bundles; split CSS if the build tool supports it.
- Use **`prefers-reduced-motion`** for animations when motion can be reduced.

## When to update this file

Update when you change: preprocessor, CSS framework, naming convention, token strategy, or how global vs. scoped styles are organized.
