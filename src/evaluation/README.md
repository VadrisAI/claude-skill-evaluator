# Evaluation & Test Engine (Module 2)

Consumes the Structure & Complexity Analyzer's output (contract "1 → 2" in
[`docs/architecture.md`](../../docs/architecture.md)) and produces the
Evaluation/Test output (contract "2 → 3") that the Scoring & Report Engine
consumes.

This module never rewrites, fixes, or proposes replacement text for the
evaluated skill (see `docs/spec.md`, "Verbesserungshinweise und
Lernansatz"). Every finding is diagnosis + direction only, expressed
through eight fields (`area`, `location`, `problem`, `cause`, `impact`,
`improvement_direction`, `watch_for`, `context`) plus `severity` and
`metric`.

## Technology choice

Plain Node.js (CommonJS, zero runtime dependencies) using the built-in
`node:test` / `node:assert` runner for tests. Rationale: this is a
Claude-Code-compatible extension meant to run as a lightweight CLI/plugin
step with no build tooling; adding a framework or bundler here would be
unjustified weight for a rules-and-data module like this one. Each
submodule is a plain `module.exports`, so Module 4 (Plugin & Command
Integration) can `require('./src/evaluation')` directly.

## Layout

```
src/evaluation/
├── index.js          # evaluateSkill(analyzerOutput) -> contract "2 -> 3" output
├── criteria.js        # applicable_metrics selection by complexity_class
├── findings.js         # the 8-field finding builder + validation
├── textUtils.js        # shared text heuristics (vague language, imperative check, similarity)
├── testEngine.js        # runs the applicable rule set, turns rule outcomes into test_results + findings
├── rules/
│   ├── base.js           # rules that apply to every skill (structure, clarity, redundancy, consistency, robustness, ...)
│   ├── process.js         # rules that only apply when complexity_class === "multi_step_process"
│   └── index.js
├── fixtures/            # example Analyzer outputs used by the tests (and usable as a reference for Module 1)
└── test/
    └── evaluation.test.js
```

## How criteria selection works

`criteria.js` exports `metricsForComplexity(complexityClass)`. For
`"simple"` it returns only the base quality metrics (structure, clarity,
precision, completeness, redundancy, contradictions, consistency, context
efficiency, edge-case coverage, robustness, misconfiguration risk) — no
process-transition/dependency/decision/feedback-loop/exit-condition/dead-end
checks are run or reported, per `docs/architecture.md`'s rule. For
`"multi_step_process"` the process metrics are added on top.

## How the rule engine works

Each entry in `rules/base.js` and `rules/process.js` is:

```js
{
  id: 'rule-id',            // becomes test_results[].test_id
  metric: 'clarity',         // must be one of criteria.js's metric names
  testCategory: 'standard',  // becomes test_results[].category (standard | edge | ambiguous | failure | boundary | instruction_following | consistency | dependency | decision_logic | process_transition | exit_condition | dead_end | e2e)
  evaluate(structure) {
    return { passed: boolean, detail: 'string', findings: [ /* 0+ finding objects */ ] };
  },
}
```

`testEngine.js` runs every rule applicable to the detected
`complexity_class` and collects `{ test_id, category, passed, detail }`
into `test_results`, and every returned finding into `findings`.

**On "executing tests":** this is a static/rule-based test executor — it
validates the parsed structure (instruction text, declared dependencies,
decision points, feedback loops, tool references) against the rules
above. It does not spin up a live Claude session to run the skill
end-to-end; that would require Claude Code execution infrastructure this
module doesn't own. A live executor is a natural future extension behind
the same result shape (see `testEngine.js`'s doc comment).

## Extending

- New base check → add a rule to `rules/base.js` with a metric name
  already listed in `criteria.js`'s `BASE_METRICS` (or add the metric
  there first).
- New process-only check → same, but in `rules/process.js` /
  `PROCESS_METRICS`.
- Every finding must go through `findings.createFinding(...)`, which
  enforces the eight required fields, a valid `severity`
  (`CRITICAL | HIGH | MEDIUM | LOW`), and a `metric`.

## Running the tests

```
node --test src/evaluation/test/evaluation.test.js
```

## Fixtures as a reference for Module 1

`fixtures/*.json` are example Analyzer outputs (two `"simple"`, two
`"multi_step_process"` — one clean pair, one deliberately broken pair to
exercise every rule). They also double as a concrete, runnable reference
for the item shapes documented in `docs/architecture.md`'s contract
"1 → 2" section.
