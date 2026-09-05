# Report Engine

Module 3 (part 2) — see `docs/architecture.md` for the pipeline this fits into.

Turns a scored evaluation into the `skill-evaluation/` folder described in
`docs/spec.md`:

```
skill-evaluation/
├── REPORT.md        human-readable, per-finding BETROFFENER BEREICH / GENAUE
│                     STELLE / PROBLEM / URSACHE / AUSWIRKUNG /
│                     VERBESSERUNGSRICHTUNG / ZU BEACHTEN / KONTEXT,
│                     grouped by CRITICAL/HIGH/MEDIUM/LOW
├── scores.json       machine-readable scores + score_details + comparison
├── test-results.json machine-readable test summary + raw test_results
├── report.html       visual auswertung (inline SVG, no external requests)
└── history/
    ├── evaluation-v1.json
    └── evaluation-v2.json
```

## Usage

### Programmatic

```js
const { generateReport } = require('./src/report');

const { outputDir, scoringResult, comparison, files } = generateReport(evaluationOutput, {
  outputDir: './skill-evaluation', // default
  version: 'v2',                   // optional; defaults to evaluationOutput.version, then
                                    // an auto-incrementing "v<next>" scoped to this skill's history
  // previousVersionScores: { overall: 70, robustness: 60, ... }
  //   optional override — a raw scores map, same shape as scoringResult.scores.
  //   When omitted, the latest history/evaluation-vN.json entry that matches
  //   this evaluationOutput.skill_path is used automatically (history for a
  //   different skill sharing the same outputDir is never picked up).
});
```

### CLI

```
node src/report/cli.js <evaluation-output.json> [--out <dir>] [--version <label>] [--no-history]
```

Example, using the bundled fixtures (see `fixtures/`) to exercise the full
pipeline without waiting on modules 1/2:

```
node src/report/cli.js fixtures/evaluation-output.simple.v1.json --out /tmp/demo --version v1
node src/report/cli.js fixtures/evaluation-output.simple.v2.json --out /tmp/demo --version v2
cat /tmp/demo/REPORT.md
```

The second run automatically finds `v1` in `/tmp/demo/history/` and adds a
**Versionsvergleich** section — regressions and improvements are both
surfaced (spec.md: *"Verschlechterungen müssen ebenfalls sichtbar gemacht
werden."*).

## Non-goals (enforced, not just documented)

- Never writes a corrected/rewritten instruction. `improvement_direction`
  is a *direction*, never drop-in replacement text — see
  `report.test.js`'s "non-goal guardrail" test, which asserts REPORT.md's
  footer states this explicitly, and every finding renderer only ever
  echoes the fields the Evaluation Engine produced (`problem`, `cause`,
  `improvement_direction`, ...), never a "here's the fix" section.

## Tests

```
node --test src/report
```
