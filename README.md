# Claude Agent Skill Evaluator

An independent, open-source tool for reviewing existing **Claude Agent Skills** (SKILL.md-based structures) — for the Claude ecosystem: Claude, Claude Code, Claude Cowork.

## What this is

A Claude-Code-compatible extension (plugin/skill with its own commands) that inspects an existing Claude skill, automatically detects how it's actually structured (a single focused task vs. an internal multi-step automated process), and evaluates it accordingly. It produces a detailed, reproducible report: strengths, weaknesses, root causes, and the direction improvement should take.

## What this is NOT

- It does **not** create skills.
- It does **not** modify, fix, or auto-optimize skills.
- It does **not** hand you a rewritten instruction or a "correct" version.

It diagnoses. You decide how to revise. Re-run the evaluator on the new version to measure whether your revision actually helped.

## Status

MVP complete: all four modules are implemented and wired together (see [`docs/architecture.md`](docs/architecture.md)):

| # | Module | Status |
|---|--------|--------|
| 1 | Structure & Complexity Analyzer (`src/analyzer/`) | implemented |
| 2 | Evaluation & Test Engine (`src/evaluation/`) | implemented |
| 3 | Scoring & Report Engine (`src/scoring/`, `src/report/`) | implemented |
| 4 | Plugin & Command Integration (`commands/`, `.claude-plugin/`, `bin/`, `src/pipeline/`) | implemented |

The pipeline wiring, CLI, and slash commands run the real modules end to end — see `npm test` (46 tests across all four modules plus the pipeline integration test) and `node bin/evaluate-skill.js <skill-path>` for a live run.

A fifth, additive piece was added afterwards, once all four modules had merged: a read-only **Report Dashboard** (`src/dashboard/`, `bin/dashboard.js`, `/skill-dashboard`) summarizing every evaluated skill's scores and test results in one page — see [Dashboard](#dashboard-overview-across-evaluated-skills) below.

See [`docs/spec.md`](docs/spec.md) for the full product specification and [`docs/architecture.md`](docs/architecture.md) for the pipeline and module boundaries.

## Core workflow

```
Select existing skill
   → Automatic structure & complexity detection
   → Matching evaluation strategy chosen
   → Skill analysis
   → Relevant tests run
   → Scoring
   → Detailed report (REPORT.md + machine-readable JSON)
   → User revises the skill themselves
   → Re-run and compare versions
```

## Installation

As a Claude Code plugin (recommended):

```
/plugin marketplace add VadrisAI/claude-skill-evaluator
/plugin install claude-skill-evaluator@claude-skill-evaluator-marketplace
```

Then run `/reload-plugins` if prompted.

As a standalone CLI (no Claude Code required):

```bash
git clone https://github.com/VadrisAI/claude-skill-evaluator.git
cd claude-skill-evaluator
npm install
node bin/evaluate-skill.js ./my-skill
```

## Usage

Inside Claude Code, once the plugin is installed:

```
/evaluate-skill ./my-skill
```

or the equivalent alias:

```
/skill-evaluate ./my-skill
```

Both write a report to `./my-skill/skill-evaluation/` (or `--out <dir>` if given):

```
skill-evaluation/
├── REPORT.md
├── report.html       (visual score/problem breakdown)
├── scores.json
├── test-results.json
└── history/
    └── evaluation-v1.json
```

Re-running the command against the same skill (or `--out` directory) after you've revised it produces `evaluation-v2.json` and a version-over-version comparison in `REPORT.md` — see `docs/spec.md` for the full comparison format.

The evaluator never writes to the skill directory itself, only to `skill-evaluation/`, and it never rewrites or "fixes" the skill it evaluates — see [What this is NOT](#what-this-is-not) above.

### Dashboard (overview across evaluated skills)

Once you've evaluated more than one skill (or one skill more than once), get a single overview page instead of opening each report individually:

```
/skill-dashboard ./
```

or standalone:

```bash
node bin/dashboard.js ./ --out dashboard.html
```

This scans for every `skill-evaluation/` folder under the given path(s) and renders a static, read-only `dashboard.html`: overall score per skill, test pass rate, findings count, and the score trend across versions, with links to each skill's own `REPORT.md`/`report.html`. It's a viewer, not a runner — see [`src/dashboard/README.md`](src/dashboard/README.md) for why it deliberately doesn't (and, as a static file, can't) trigger a new evaluation itself.

## Development

```bash
npm test          # every *.test.js in the repo, across all modules
```

There are no dependencies to install — the project is deliberately zero-dep and runs on Node alone.

`npm test` discovers test files rather than matching a fixed pattern, and prints the list it found on every run. (It used to be a glob that quietly matched only the pipeline tests, so most of the suite never ran under the project's own test command.)

CI runs the same suite on Node 18, 20, and 22, plus an end-to-end smoke test that evaluates the bundled fixtures, builds a dashboard from the results, and asserts the evaluated skills were left untouched — the project's core non-goal, enforced automatically rather than by trust.

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how the four modules fit together and how to contribute to one of them.

## License

MIT.
