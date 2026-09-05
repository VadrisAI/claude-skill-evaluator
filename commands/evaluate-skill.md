---
name: evaluate-skill
description: Independently evaluate an existing Claude Agent Skill — analyze its structure, run relevant tests, score it, and produce a REPORT.md. Never modifies the skill.
argument-hint: "<path-to-skill> [--out <output-dir>]"
allowed-tools: Bash, Read
---

You are running the Claude Agent Skill Evaluator on an existing skill. Follow these steps exactly.

**Non-negotiable rule**: this command NEVER edits, rewrites, "fixes," or optimizes the evaluated skill's files. It only reads the skill and writes report artifacts to an output directory. If you feel tempted to propose a rewritten instruction, don't — report a problem, its cause, its impact, and a direction for improvement instead, and stop there. The skill's author does the actual revision.

1. Parse the arguments: `$ARGUMENTS`
   - The first positional argument (`$1`) is the path to the skill directory to evaluate. If it's missing, ask the user for it — do not guess a path.
   - If `--out <dir>` is present, that's the output directory for the report; otherwise the report is written inside the skill directory itself (`<skill-path>/skill-evaluation/`).

2. Run the pipeline via the plugin's own CLI, which deterministically chains the Analyzer → Evaluation/Test Engine → Scoring/Report Engine modules (see `docs/architecture.md` in this plugin's repo for the module contracts) — do not attempt to reimplement any of that logic yourself:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/evaluate-skill.js" "<skill-path>" [--out "<output-dir>"]
   ```

3. If the command exits non-zero, show the user the exact error message and stop. Do not attempt to patch the skill to make evaluation succeed.

4. On success, read the generated `skill-evaluation/REPORT.md` (Read tool) and present it to the user: summarize the overall score and the highest-severity findings first (CRITICAL, then HIGH, then MEDIUM, then LOW), and tell them the full report, `scores.json`, and `test-results.json` are saved under `skill-evaluation/` next to the skill (or the `--out` directory if given). If `skill-evaluation/history/` already contained a prior version, point out the version-over-version score changes shown in the report.

5. End by reminding the user: this report is diagnostic only. Improvement directions are not drop-in replacement text — they revise the skill themselves, then re-run `/evaluate-skill` on the new version to measure whether it actually improved.
