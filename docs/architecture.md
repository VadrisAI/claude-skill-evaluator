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
    "full_text": "string, optional — concatenated skill content (SKILL.md + inlined resource text), used for whole-document checks like redundancy/contradiction/token-efficiency scans. Omit if unavailable; consumers must degrade gracefully.",
    "instructions": [
      {"id": "string, stable within this analysis", "text": "string, the instruction's literal content", "section": "string, e.g. heading name", "order": 0}
    ],
    "dependencies": [
      {"id": "string", "from": "instruction id", "to": "instruction id or resource path", "type": "step | resource | tool"}
    ],
    "tool_dependencies": [
      {"tool": "string", "referenced_in": "instruction id", "defined": true}
    ],
    "decision_points": [
      {"id": "string", "condition": "string", "branches": ["instruction id, ..."], "instruction_id": "string"}
    ],
    "feedback_loops": [
      {"id": "string", "trigger": "string", "exit_condition": "string or null", "instruction_id": "string"}
    ],
    "failure_handling": [
      {"id": "string", "scenario": "string", "handler": "string or null", "instruction_id": "string"}
    ]
  },
  "complexity_class": "simple | multi_step_process",
  "complexity_signals": ["string reasons for the classification"]
}
```

**2026-09-05 addition (Module 2):** the array item shapes above (`instructions[]`, `dependencies[]`, `tool_dependencies[]`, `decision_points[]`, `feedback_loops[]`, `failure_handling[]`) and the optional `full_text` field were unspecified in the original contract — the Evaluation Engine cannot assess clarity/precision/redundancy/dead-ends/exit-conditions from bare counts alone. This is an additive clarification, not a breaking change: the top-level shape is unchanged, and every field the Evaluation Engine reads is optional/defensively handled (missing arrays are treated as `[]`, missing `full_text` skips whole-document checks) so a Module 1 build that hasn't caught up to these item shapes yet still produces valid input.

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
