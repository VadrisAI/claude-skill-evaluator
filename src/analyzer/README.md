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

## Validated against a real-skill corpus

The heuristics here were originally written and tested against this repo's
own fixtures — fixtures that happened to be shaped exactly the way the
heuristics expected. Running the analyzer over the 40 real skills in
`/mnt/skills` immediately showed how misleading that was:

| | before | after |
|---|---|---|
| `simple` / `multi_step_process` split | 2 / 38 | 11 / 29 |
| `step_count` for `pdf`, `docx`, `xlsx`, `pptx` | 0 (yet classified multi-step) | 0, correctly `simple` |
| `tool_dependencies` for `docx` | 77 (XML tags, constants, schemas) | 17 (the actual `.py` scripts) |

Any change to the extraction or classification heuristics should be
re-checked against a corpus of real skills, not just the fixtures — that's
the check that catches this class of mistake.

## Known heuristic limitations

Structure extraction is regex/markdown-based, not a semantic parser, so:

- `decision_points` matches generic conditional language (if/when/unless/
  otherwise/else/depending on/in case) line-by-line; it will flag prose
  that reads as conditional even when there's no real branching logic.
  This is why the complexity classifier treats it only as *supporting*
  evidence and never lets it establish `multi_step_process` on its own.
- `dependencies` only captures *explicit* "step N" cross-references in a
  step's heading or section body; purely sequential ordering (step 2
  implicitly follows step 1) is not recorded as a dependency edge.
- Keyword scans (`feedback_loops`, `retry_mechanisms`, `failure_handling`)
  are line-based, so a phrase split across a line break — "return to\nstep
  4" — is missed.
- Step extraction understands explicit `## Step N:` / `## Phase N`
  headings, `**N. ...**` bold lead-ins, and numbered top-level lists. A
  skill that describes a genuine sequence purely in prose, with no
  numbering of any kind, will still report `step_count: 0` and therefore
  classify as `simple`.
- Plain sibling headings are intentionally *not* steps: `#### Merge PDFs` /
  `#### Split PDF` is a catalogue of alternatives. This is a deliberate
  trade — treating them as steps is precisely what made nearly every real
  skill look like a multi-step process.

These are documented rather than silently masked so Module 2/3 can decide
how much weight to give each field.
