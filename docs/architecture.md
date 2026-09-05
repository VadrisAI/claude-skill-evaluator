# Architecture & Module Boundaries

This document exists so that the four parallel work sessions building this project don't collide or block on each other. Read `spec.md` first for the *why*; this file defines the *how the pieces fit together*.

## Pipeline

```
Skill Discovery/Import
        │
        ▼
Structure Analyzer ──▶ Complexity Detection
        │
        ▼
Evaluation Engine ──▶ Test Engine
        │
        ▼
Scoring Engine
        │
        ▼
Report Engine (REPORT.md + JSON + visualization + version comparison)
        │
        ▼
Plugin/Command wrapper (/evaluate-skill, /skill-evaluate)
```

## Module ownership (4 parallel sessions)

| # | Module | Owns | Directory |
|---|--------|------|-----------|
| 1 | **Structure & Complexity Analyzer** | Skill discovery/import (SKILL.md + full directory), structure parsing, complexity classification (simple task vs. multi-step process) | `src/analyzer/` |
| 2 | **Evaluation & Test Engine** | Criteria selection based on complexity class, quality analysis (clarity, consistency, redundancy, dead ends, etc.), test-case generation and execution | `src/evaluation/` |
| 3 | **Scoring & Report Engine** | Score computation (only relevant metrics for the detected structure), REPORT.md + scores.json + test-results.json generation, before/after version comparison, visualization | `src/scoring/`, `src/report/` |
| 4 | **Plugin & Command Integration** | SKILL.md/plugin manifest for this tool itself, `/evaluate-skill` command wiring, CLI/entry glue that calls modules 1→2→3 in order, README/CONTRIBUTING polish | `commands/`, plugin manifest at repo root |

## Interface contracts between modules

These are the boundaries every session must honor so the pieces integrate without a second coordination pass:

### 1 → 2: Analyzer output → Evaluation input
```json
{
  "skill_path": "string",
  "structure": {
    "has_skill_md": true,
    "resources": ["references/", "scripts/", "assets/"],
    "instruction_count": 0,
    "step_count": 0,
    "dependencies": [],
    "tool_dependencies": [],
    "decision_points": [],
    "feedback_loops": [],
    "failure_handling": []
  },
  "complexity_class": "simple | multi_step_process",
  "complexity_signals": ["string reasons for the classification"]
}
```

### 2 → 3: Evaluation/Test output → Scoring input
```json
{
  "skill_path": "string",
  "complexity_class": "simple | multi_step_process",
  "applicable_metrics": ["instruction_quality", "consistency", "robustness", "..."],
  "findings": [
    {
      "area": "string",
      "location": "string (instruction/section/process step)",
      "problem": "string",
      "cause": "string",
      "impact": "string",
      "improvement_direction": "string",
      "watch_for": "string",
      "context": "string",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "metric": "string (which score this affects)"
    }
  ],
  "test_results": [
    {"test_id": "string", "category": "standard|edge|ambiguous|failure|boundary|...", "passed": true, "detail": "string"}
  ]
}
```

### 3 → Report Engine: Scoring output → Report input

**Update (integration pass, Module 4): this is an internal call inside Module 3, not a hop module 4 orchestrates.** Module 3 owns both scoring and report generation, and its actual shipped interface (see `src/scoring/index.js`, `src/report/index.js`) consolidates them: `generateReport(evaluationOutput, opts)` takes the **Evaluation Engine's own "2 → 3" output directly** and calls `scoreEvaluation` internally, rather than Module 4 calling `scoreEvaluation` itself and passing its result into a separate `generateReport` call as originally sketched below. `scoreEvaluation` stays separately exported/importable (e.g. for module 3's own tests, or for a future report format that wants scores without the file-writing side effects), but Module 4's pipeline only ever calls `generateReport`.

Confirmed real signatures, as of this integration pass:

```js
scoreEvaluation(evaluationOutput, { version, evaluatedAt, previousVersionScores })
// -> { skill_path, complexity_class, scores, score_details, findings, test_summary, version, evaluated_at }

generateReport(evaluationOutput, {
  outputDir,               // the skill-evaluation/ directory itself (NOT its parent) — default './skill-evaluation'
  version,                 // optional; falls back to evaluationOutput.version, then an auto-incrementing "v<next>" scoped to this skill_path
  evaluatedAt,              // optional ISO timestamp override
  recordHistory,            // default true
  previousVersionScores,    // optional explicit override; omit to auto-read the latest history/evaluation-vN.json for this skill_path
  previousVersionLabel,     // only used together with previousVersionScores
})
// -> { outputDir, scoringResult, comparison, files: string[] }
```

`outputDir` scopes history by `skill_path`, so a shared/default output directory can safely hold history for more than one skill without cross-contaminating "before/after" comparisons.

The JSON on disk (`scores.json`, `test-results.json`, `REPORT.md`, `history/evaluation-v<version>.json`) is still shaped close to the original sketch below, plus an additive `score_details` field for traceability (spec.md: "Jede Bewertung muss nachvollziehbar sein") and an additive `report.html` visualization file:

```json
{
  "scores": {"overall": 0, "instruction_quality": 0, "...": 0},
  "score_details": {"...": "optional, per-metric traceability back to findings/tests"},
  "findings": ["... as above, unchanged ..."],
  "test_summary": {"total": 0, "passed": 0, "failed": 0},
  "version": "string",
  "evaluated_at": "ISO timestamp",
  "previous_version_scores": {"...": "optional, for comparison"}
}
```

**Rule**: a module never invents fields the next module didn't ask for, and never skips a field the next module depends on. If a session discovers the contract above is insufficient while building, it edits this file first (small, additive change) before diverging — that keeps the other three sessions unblocked.

## What "complexity_class" changes downstream

- `simple`: Evaluation Engine skips process-transition/dependency/feedback-loop checks entirely; Scoring Engine omits process-related metrics from the report (per spec: "das System darf keine Scores anzeigen, die für den jeweiligen Skill nicht relevant sind").
- `multi_step_process`: full checks apply — process transitions, dead ends, undefined dependencies, missing exit conditions, etc.

## Non-goals (repeated from spec, because it's the easiest rule to accidentally violate)

- No module ever rewrites, "fixes," or outputs a corrected version of the evaluated skill.
- The Report Engine's `improvement_direction` field is a *direction*, never a drop-in replacement text.

## Repo layout

```
claude-skill-evaluator/
├── README.md
├── docs/
│   ├── spec.md
│   └── architecture.md
├── commands/
├── src/
│   ├── analyzer/
│   ├── evaluation/
│   ├── scoring/
│   └── report/
```

## Branching

Each module is built on its own branch (`module/analyzer`, `module/evaluation`, `module/scoring-report`, `module/plugin-integration`) and merged via PR against `main`.
