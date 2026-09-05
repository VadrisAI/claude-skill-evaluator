# Contributing

This project is split into four modules, built and reviewed independently. Read [`docs/spec.md`](docs/spec.md) (the product spec, source of truth) and [`docs/architecture.md`](docs/architecture.md) (pipeline + module boundaries + JSON interface contracts) before touching code — they're short and everything below assumes you've read them.

## Module ownership

| # | Module | Directory | What it does |
|---|--------|-----------|---------------|
| 1 | Structure & Complexity Analyzer | `src/analyzer/` | Discovers/imports a skill, parses its structure, classifies it `simple` vs `multi_step_process` |
| 2 | Evaluation & Test Engine | `src/evaluation/` | Picks criteria based on complexity class, runs quality checks, generates/executes test cases |
| 3 | Scoring & Report Engine | `src/scoring/`, `src/report/` | Computes scores, writes `REPORT.md` / `scores.json` / `test-results.json`, handles version comparison |
| 4 | Plugin & Command Integration | `commands/`, `.claude-plugin/`, `bin/`, `src/pipeline/` | The installable plugin: slash commands, CLI entry, wiring modules 1→2→3 in order |

If you're contributing to modules 1-3, work only inside your module's directory and honor the JSON contracts in `docs/architecture.md` exactly — the orchestrator in `src/pipeline/index.js` calls each module only through those shapes and does not otherwise care about internal implementation. If a contract turns out to be insufficient, make a small additive change to `docs/architecture.md` first (in the same PR), so the other modules stay unblocked, then implement against the updated contract.

## Replacing a placeholder module

`src/analyzer/index.js`, `src/evaluation/index.js`, `src/scoring/index.js`, and `src/report/index.js` currently contain minimal placeholder fixtures (each file says so in its header comment) so the plugin wiring could be built and tested end-to-end before the real modules existed. To land your real module:

1. Replace the placeholder file(s) in your module's directory with your implementation, keeping the same exported function names and same contract shapes (see `docs/architecture.md`).
2. Run `npm test` — `test/pipeline.test.js` exercises the full pipeline against `test/fixtures/sample-skill/` and will catch a contract mismatch.
3. Open a PR against `main` from your module branch (`module/analyzer`, `module/evaluation`, or `module/scoring-report`).

## Non-goals (do not build these)

- No automatic skill "fixing", rewriting, or optimization, anywhere in the pipeline. The tool diagnoses; the skill's author revises.
- No fabricated "ideal" replacement text in findings — `improvement_direction` is a direction, never drop-in text.
- No scores or metrics shown for a complexity class they don't apply to (see `docs/architecture.md`, "What complexity_class changes downstream").

## Local development

```bash
npm install
npm test
node bin/evaluate-skill.js test/fixtures/sample-skill --out /tmp/scratch
```

To test the actual slash command inside Claude Code:

```bash
claude --plugin-dir .
```

then run `/evaluate-skill test/fixtures/sample-skill` inside that session.

## Branching

Each module is built on its own branch and merged via PR against `main`:

- `module/analyzer`
- `module/evaluation`
- `module/scoring-report`
- `module/plugin-integration`
