# Structure & Complexity Analyzer (Module 1)

Reads an existing Claude Agent Skill — SKILL.md plus its full directory
(`references/`, `scripts/`, `assets/`, ...) — and produces the structural
analysis and complexity classification that Module 2 (Evaluation & Test
Engine) consumes. See `docs/architecture.md` for the exact output contract
and `docs/spec.md` for the product requirements this implements.

This module only reads and classifies. It never modifies, "fixes," or
rewrites the skill it analyzes (see spec.md's non-goals).

## Technology choice

Plain Node.js (CommonJS, no external dependencies), using the Node 18+
built-in `node:test` runner for tests. Reasoning:

- Claude Code plugins/commands run in a Node-capable environment already,
  so this needs no separate runtime to install.
- Zero dependencies means no `package.json`/lockfile at the repo root to
  collide with the other three parallel module sessions (each of which may
  want its own root manifest — that's Module 4's call, not this one's).
- All structural extraction is deterministic regex/text heuristics over
  markdown and the filesystem, not an LLM call — this keeps repeated runs
  on an unchanged skill byte-for-byte reproducible, per spec.md's
  "Reproduzierbare Evaluation" requirement.

## Usage

```bash
node src/analyzer/cli.js ./path/to/my-skill
# or point directly at a SKILL.md file
node src/analyzer/cli.js ./path/to/my-skill/SKILL.md
```

Prints the Module 1 → Module 2 contract JSON to stdout.

Programmatic use:

```js
const { analyzeSkill } = require('./src/analyzer');
const result = analyzeSkill('./path/to/my-skill');
```

## Running tests

```bash
node --test src/analyzer/analyzer.test.js
```

Tests run against the two fixtures in `fixtures/`:

- `fixtures/simple-skill/` — a single-purpose skill with no steps, tools,
  or branching, expected to classify as `simple`.
- `fixtures/multi-step-skill/` — a skill with an explicit numbered
  workflow, conditions, a retry, a feedback loop, cross-step references,
  and `references/`/`scripts/`/`assets/` resource directories, expected to
  classify as `multi_step_process`.

## How classification works

`lib/complexity.js` counts independent structural signals from the parsed
structure — ordered step count ≥ 3, presence of decision points, feedback
loops, retry mechanisms, explicit inter-step dependencies, ≥ 2 distinct
tool dependencies, and failure-handling language. Two or more signals ⇒
`multi_step_process`; fewer ⇒ `simple`. Requiring at least two signals
(rather than any single one) keeps one generic "if" sentence in an
otherwise simple skill from mis-triggering `multi_step_process` on its
own — `complexity_signals` always lists which evidence was found so the
classification is auditable, not a black box.

## Known heuristic limitations

Structure extraction is regex/markdown-based, not a semantic parser, so:

- `tool_dependencies` can over-include: any inline-code span that looks
  like a path or has a file extension is swept in, including output
  filenames mentioned in backticks (e.g. `` `report.md` ``). Downstream
  consumers should treat this list as "candidate tools/resources
  mentioned," not a verified tool registry.
- `decision_points` matches generic conditional language (if/when/unless/
  otherwise/else/depending on/in case) line-by-line; it will flag prose
  that reads as conditional even when there's no real branching logic.
  This is why the complexity classifier requires corroborating signals
  rather than trusting `decision_points` alone.
- `dependencies` only captures *explicit* "step N" cross-references in
  step text; purely sequential ordering (step 2 implicitly follows step 1)
  is not recorded as a dependency edge.
- Step extraction picks the largest ordered top-level list under a
  heading that reads like "Steps"/"Workflow"/"Process"/"Instructions"/
  "Procedure" (falling back to the largest ordered list in the document).
  A skill using different heading language, or non-list step formatting,
  may not have its steps detected.

These are documented rather than silently masked so Module 2/3 can decide
how much weight to give each field.
