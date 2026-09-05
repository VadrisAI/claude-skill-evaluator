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
    "tool_dependencies": ["string (executable script or known CLI tool the skill RUNS)"],
    "referenced_files": ["string (non-executable file the skill reads: schema, template, doc, data)"],
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

**2026-09-05 — corrections after testing against a real-skill corpus.** The heuristics above were validated only against this repo's own fixtures until they were run over the 40 real skills in `/mnt/skills`. That exposed three defects, all now fixed; the notes matter for anyone touching these fields:

- **`step_count` used to be 0 for most real skills.** Step detection only understood numbered top-level markdown lists, which real skills barely use. It now recognises, in priority order: explicit `## Step N:` / `## Phase N` headings (the dominant real-world form), `**N. ...**` bold paragraph lead-ins, then the original numbered lists. Plain sibling headings are deliberately *not* steps — `#### Merge PDFs` / `#### Split PDF` is a catalogue of alternatives, not a sequence.
- **`complexity_class` no longer counts tool quantity.** The old rule ("≥2 independent signals", with tool count and any single `if` as signals) classified 38 of 40 real skills as `multi_step_process`, including skills with zero detected steps. Classification now requires evidence of an actual sequence: ≥3 ordered steps, or steps carrying control flow (inter-step dependencies, feedback loops, retries) between them. Conditional language and failure handling can reinforce that verdict but can no longer establish it alone. Result on the same corpus: 11 `simple` / 29 `multi_step_process`, with reference-style skills (pdf, docx, xlsx, pptx) correctly landing in `simple`. **Module 2 consumers**: expect meaningfully more `simple` classifications than before, i.e. the process-only metrics now correctly stay out of more reports.
- **`tool_dependencies` was heavily inflated** — any backticked token containing a dot qualified, so one real skill reported 77 "tools" consisting mostly of XML tags (`<w:del/>`), code constants (`WidthType.DXA`), bare extensions (`.docx`) and 39 schema files. It is now restricted to executables the skill runs (`.py`, `.sh`, `.js`, …) and known CLI tools; everything merely *read* moved to the new additive `referenced_files` field.

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

**`scores.overall` is not a plain average (changed 2026-09-05).** It is the mean of the applicable metrics, *capped at the midpoint between the weakest metric and 100*. Reason: on the real-skill corpus a plain average let serious weaknesses vanish into metrics that simply had no findings — one skill scored 55/100 on `misconfiguration_risk` (15 findings) yet came out at 94 overall, because nine of its twelve metrics sat at a default 100. The cap is mild by design (worst metric 90 ⇒ cap 95, effectively no change) but makes a genuine weak spot impossible to average away. Measured effect across the 40-skill corpus: the overall-score range widened from 89–100 (clustered at 98) to 65–100 with a median of 94, i.e. the tool now actually discriminates.

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

## Report Dashboard (added after all four modules merged)

Not one of the original four modules — added afterwards as a fifth,
additive, cross-cutting piece once Modules 1–4 had all landed on `main`.
Directory: `src/dashboard/` (+ `bin/dashboard.js`, `commands/skill-dashboard.md`).

It is a **read-only viewer** over Module 3's already-finalized on-disk
output format — it consumes, but does not change, the "3 → Report Engine"
contract above:

```
findEvaluationDirs(rootPaths) -> string[]         // paths to skill-evaluation/ dirs found under rootPaths
collectSkillSummary(evalDir) -> {                  // reads one skill-evaluation/ dir, or null if invalid
  evalDir, skillPath, skillName, complexityClass, version, evaluatedAt,
  overall, scores, comparison, problemCount, testSummary, trend,
  reportMdPath, reportHtmlPath
} | null
buildDashboard(rootPaths, opts) -> { file, skills: object[] }
```

**Deliberately out of scope, not oversights**:
- It never triggers a new evaluation run. A static HTML file has no backend
  to execute anything with — matching spec.md's "Keine eigenständige große
  Web-Plattform nötig". Each skill's card instead shows the exact
  `node bin/evaluate-skill.js <skill-path>` command to re-run manually.
- It doesn't show Anthropic usage/rate-limit data — no tool available in
  any session has access to that, so there's nothing to surface.
- A live "notify me / start it from here" experience is a property of the
  environment running Claude (e.g. a Claude Code Routine with a push
  notification), not something this repo's static output can provide to an
  arbitrary user who clones it.

If a genuinely interactive dashboard (one that can kick off runs itself) is
wanted later, that needs a real backend/server component — a deliberate
architecture decision to make explicitly here, not something to grow
accidentally out of this read-only viewer.
