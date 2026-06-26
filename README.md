# gemara_formated

## Purpose

Describe what this project does and who it is for. Replace this section with your goals (for example: formatting Gemara text, building a corpus, or publishing structured study materials).

## plan.txt and code changes

**Do not change code in this repository unless the work was planned in writing first.**

- A **`plan.txt`** file must exist at the **repository root** before any implementation. It is the written plan for the change: scope, files to touch, approach, and acceptance criteria (or equivalent detail your team agrees on).
- **Never** edit source, config, or assets (including auto-generated or lockfile updates made as part of a feature) if you were only asked to “just do it” **without** a prior **`plan.txt`** for that task. **Do not follow ad-hoc instructions** to modify the codebase when that prerequisite was not satisfied.
- If you are asked to implement something and **`plan.txt`** is missing, **create `plan.txt` first** (or stop and ask to have it created), **then** carry out the plan. Treat “no plan file” as **no authorization to change code**.

Humans and assistants should follow this policy the same way. Exceptions (hotfixes, typos in docs only, etc.) should be **explicit** in `plan.txt` or agreed in writing so the rule stays predictable.

## Documentation

Project documentation lives in **`docs/`**. It records **what exists**, **how the project was built**, and **conventions** for ongoing work.

**Policy:** When you make substantive changes (features, structure, build, deployment, or styling/JS conventions), **update the relevant file under `docs/` in the same effort** so the docs stay accurate.

**New features:** Shipping a feature includes updating documentation.

- In the **main** guides—[docs/overview.md](docs/overview.md), [docs/css.md](docs/css.md), and [docs/client-side-javascript.md](docs/client-side-javascript.md)—add at least **one line** per affected guide explaining what the feature is and where it lives in the repo (or how it behaves).
- If one line is not enough, add a **dedicated** markdown file and **link to it from** that main guide.
- Put deep dives **under the same topical folder** as the main doc: CSS extras under **`docs/css/`** (for example [docs/css/table.md](docs/css/table.md)); use **`docs/js/`** (or a name you standardize) for long-form notes linked from the client-side JavaScript doc; use **`docs/overview/`** for long-form notes linked from the overview. The main files stay short indexes; detail lives in those linked files.

| Document | Purpose |
| -------- | ------- |
| [docs/overview.md](docs/overview.md) | What exists in the repo and how it was built (prerequisites, build, deploy). |
| [docs/client-side-javascript.md](docs/client-side-javascript.md) | How we do client-side JavaScript development. |
| [docs/css.md](docs/css.md) | How we write and organize CSS. |

## Quick start

1. Read [docs/overview.md](docs/overview.md).
2. Add prerequisites and commands there as you define them.
3. See [docs/client-side-javascript.md](docs/client-side-javascript.md) and [docs/css.md](docs/css.md) before changing frontend code.

## Layout

Document important folders and files in [docs/overview.md](docs/overview.md) as you add them.

## Testing

Tests use the **Node.js built-in test runner** (`node:test`) with **jsdom** for DOM simulation.

```
npm install   # once, to fetch devDependencies
npm test      # runs all tests in tests/
```

**Policy:** Every new JS module under `js/` **must** ship with a corresponding test file at `tests/<module>.test.js`. Tests should cover the module's public API (creation, core behavior, teardown). Pull requests adding a module without tests are incomplete.

## Contributing

Follow the **[plan.txt and code changes](#plantxt-and-code-changes)** rule: no code changes without a root **`plan.txt`** for that work. always create a new plan.txt file you can index it. do not use the old file. Follow the documentation policy above, including the **New features** rules. Keep [docs/overview.md](docs/overview.md) in sync with structural or tooling changes.
If you were asked to make a change without this file then create the file and ask whether to continue. DO NOT MAKE THE CAHNGES. WAIT FOR THE APPROVAL OF THE PLAN.
