# Scoring Engine

Module 3 (part 1) — see `docs/architecture.md` for the pipeline this fits into.

Implements the **"2 → 3" contract**: takes the Evaluation/Test Engine's
output (module 2) and computes scores for the applicable metrics only.

## Usage

```js
const { scoreEvaluation } = require('./src/scoring');

const result = scoreEvaluation(evaluationOutput, {
  version: 'v1', // optional; defaults to evaluationOutput.version or "unversioned"
});

result.scores;         // { overall, instruction_quality, ..., robustness }
result.score_details;  // per-metric traceability: contributing findings + tests
```

## Design

- **Only `applicable_metrics` are scored.** A skill classified `simple`
  never receives `process_logic` / `dependency_clarity` /
  `workflow_robustness` scores — those only appear when module 2 lists
  them as applicable (i.e. the skill was classified `multi_step_process`).
  This directly implements the spec.md rule: *"Das System darf keine
  Scores anzeigen, die für den jeweiligen Skill nicht relevant sind."*
- **Every score is traceable.** Each finding in the "2 → 3" contract
  already carries a `metric` field; the Scoring Engine groups findings by
  that field and computes a severity-weighted penalty
  (`CRITICAL: -22, HIGH: -13, MEDIUM: -7, LOW: -3`, floored at 0) as the
  primary signal. Where `test_results[].category` maps to the metric (see
  `metrics.js`'s `testCategories`), the test pass rate is blended in at a
  30% weight — findings stay primary because they carry root-cause
  reasoning, tests only corroborate. `score_details[metric]` exposes the
  exact findings and test counts behind every number, for the Report
  Engine (and anyone auditing a score) to point back to.
- **Unknown metric names still work.** `applicable_metrics` is an open
  string list decided by module 2. A metric name not in `metrics.js`'s
  registry still scores correctly from its tagged findings alone, with a
  generic title-cased label — the Scoring Engine never crashes or drops a
  metric just because module 2 introduced a new one.
- `overall` is the unweighted mean of the applicable metric scores. Kept
  intentionally simple and stated as such in the report, rather than a
  tuned weighted formula that would be hard to justify.

## Tests

```
node --test src/scoring
```
