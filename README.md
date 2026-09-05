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

## Development

```bash
npm install
npm test
```

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for how the four modules fit together and how to contribute to one of them.

## License

MIT.
