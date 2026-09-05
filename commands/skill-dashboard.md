---
name: skill-dashboard
description: Render a read-only overview dashboard of all skill-evaluation/ reports found under a path — scores, test pass rates, and score trends across versions. Never runs a new evaluation itself.
argument-hint: "[path ...] [--out <dashboard.html>]"
allowed-tools: Bash, Read
---

You are rendering the Claude Agent Skill Evaluator's dashboard: a single static HTML overview of every `skill-evaluation/` report already produced by `/evaluate-skill` under the given path(s).

**Non-negotiable rule**: this command NEVER triggers a new evaluation, and never edits, rewrites, or "fixes" any skill. It only reads existing `skill-evaluation/scores.json` / `test-results.json` / `history/` files and renders a summary. If the user wants a skill (re-)evaluated, tell them to run `/evaluate-skill` first.

1. Parse the arguments: `$ARGUMENTS`
   - Any positional arguments are root paths to scan for `skill-evaluation/` folders (default: current directory if none given).
   - If `--out <file>` is present, that's the output HTML file; otherwise it defaults to `./dashboard.html`.

2. Run the dashboard generator via the plugin's own CLI — do not attempt to reimplement the scanning/rendering yourself:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/dashboard.js" [<path> ...] [--out "<dashboard.html>"]
   ```

3. If the command exits non-zero, show the user the exact error message and stop.

4. On success, tell the user how many evaluated skills were found and where `dashboard.html` was written. If zero skills were found, say so plainly and suggest running `/evaluate-skill` first — don't imply the dashboard failed.

5. Mention that `dashboard.html` is a static, read-only snapshot: opening it does not re-run anything, and each skill's card shows the exact `node bin/evaluate-skill.js <skill-path>` command to re-run manually, after which `/skill-dashboard` can be run again to refresh the overview.
