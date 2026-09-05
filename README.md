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

Early scaffold — MVP in progress. See [`docs/spec.md`](docs/spec.md) for the full product specification and [`docs/architecture.md`](docs/architecture.md) for the pipeline and module boundaries.

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

## Usage (planned)

```
/skill-evaluate ./my-skill
```

## License

TBD (open source).
