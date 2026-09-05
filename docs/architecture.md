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
    "purpose": "string, best-effort extraction from frontmatter description / first paragraph",
    "instruction_count": 0,
    "step_count": 0,
    "steps": [
      {"id": 1, "description": "string", "location": "string (e.g. SKILL.md:42)", "tools": [], "references_steps": []}
    ],
    "inputs": ["string"],
    "outputs": ["string"],
    "dependencies": [
      {"from_step": 1, "to_step": 2, "detail": "string"}
    ],
    "tool_dependencies": ["string (tool/script/command name)"],
    "decision_points": [
      {"location": "string", "condition": "string"}
    ],
    "feedback_loops": [
      {"location": "string", "detail": "string"}
    ],
    "retry_mechanisms": [
      {"location": "string", "detail": "string"}
    ],
    "failure_handling": [
      {"location": "string", "detail": "string"}
    ]
  },
  "complexity_class": "simple | multi_step_process",
  "complexity_signals": ["string reasons for the classification"]
}
```

Notes on the additive fields (added by the analyzer session, superseding the earlier draft above which is kept here only as the field list — the shapes above are authoritative):
- `steps`, `dependencies`, `decision_points`, `feedback_loops`, `retry_mechanisms`, `failure_handling` were originally flat string arrays in the first draft of this contract; the analyzer implementation emits structured objects (as shown above) so Module 2 gets a location and detail without re-parsing free text. `instruction_count`/`step_count` stay plain numbers.
- `purpose`, `inputs`, `outputs`, `steps[].tools`, `steps[].references_steps`, and `retry_mechanisms` (split out from `failure_handling`) are new — they cover spec.md requirements ("Zweck", "Inputs, Outputs", "Reihenfolge von Anweisungen", "Retry-Mechanismen") that the original draft omitted.
- All heuristic extraction is best-effort and deterministic (no LLM call inside the analyzer) so repeated runs on an unchanged skill produce identical output, per spec.md's "Reproduzierbare Evaluation" requirement.
- **2026-09-05 (Module 2):** the Evaluation Engine's rules were rewritten against this authoritative shape (see `src/evaluation/rules/`). Two things worth flagging for future contract changes: `tool_dependencies` is a flat string array with no "declared vs. merely referenced" distinction, so Module 2 can only check orphaned script-like entries, not undefined-tool usage; `decision_points`/`feedback_loops` carry no explicit branch/exit-condition structure, so exit-condition and dead-end checks are text-heuristic (keyword/number matching on `detail`/`condition`), not a real graph analysis. If a future analyzer revision adds that structure, Module 2's process rules should be revisited to use it directly instead of the heuristic.

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
```json
{
  "scores": {"overall": 0, "instruction_quality": 0, "...": 0},
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
