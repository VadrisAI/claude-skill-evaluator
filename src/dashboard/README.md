# Report Dashboard (additive, cross-cutting)

A read-only overview across every `skill-evaluation/` report the tool has
already produced (via `/evaluate-skill` or `bin/evaluate-skill.js`) —
scores, test pass rates, findings counts, and the score trend across a
skill's version history, in one page instead of opening each
`REPORT.md`/`report.html` individually.

This is not one of the four modules in `docs/architecture.md`'s original
ownership table (Analyzer / Evaluation / Scoring & Report / Plugin
Integration) — it was added afterwards, once all four had merged, as a
consumer sitting *on top of* Module 3's already-finalized on-disk format
(`scores.json`, `test-results.json`, `history/evaluation-vN.json`). See the
architecture doc's "Report Dashboard" section for the (short) contract this
relies on.

## Usage

```bash
node bin/dashboard.js [<path> ...] [--out <dashboard.html>]
```

Scans the given path(s) (default: current directory) for `skill-evaluation/`
folders — however deeply nested — and writes a single `dashboard.html`.
Also available as `/skill-dashboard` inside Claude Code once the plugin is
installed.

## Why there's no "run it from here" button

This was explicitly asked for while building this piece, so it's worth
being direct about: **a static HTML file has no way to execute a command**.
There's no backend behind `dashboard.html` — it's opened as a plain file,
the same as `report.html` (Module 3's per-skill visualization). Making the
dashboard able to kick off a new evaluation would mean standing up a local
server/backend for it to talk to, which runs directly against spec.md's
explicit MVP design: *"Keine eigenständige große Web-Plattform nötig — der
Evaluator arbeitet direkt innerhalb/im Kontext der Entwicklungsumgebung."*

So instead, each skill's card on the dashboard shows the exact
`node bin/evaluate-skill.js <skill-path>` command to re-run in a terminal,
and regenerating `dashboard.html` afterwards (`node bin/dashboard.js ...`)
picks up the new run automatically. If a genuinely interactive, run-it-here
dashboard is wanted later, that's a deliberate architecture decision (a
local server component) — flag it in `docs/architecture.md` rather than
smuggling it in here.

Two more things it does not do, for the same "no extra infrastructure"
reason: it doesn't show Anthropic account usage/rate-limit data (no tool in
this environment has access to that at all — nothing to display), and any
"notify me when this is done" behavior is a property of *how you're running
Claude* (e.g. a Claude Code Routine/push notification), not something a
committed-to-the-repo static file can generically provide to every user who
clones this project.

## Files

- `discover.js` — `findEvaluationDirs(rootPaths)`: recursively finds every
  directory named `skill-evaluation` that contains a `scores.json`, without
  following symlinks (same rule as `src/analyzer`'s discovery walk).
- `collect.js` — `collectSkillSummary(evalDir)`: reads one evaluation
  directory's `scores.json`, `test-results.json`, and `history/` into a
  flat summary object; returns `null` if the directory turns out not to
  have a valid `scores.json`.
- `render.js` — `renderDashboardHtml(summaries, opts)`: renders the
  self-contained HTML page (inline SVG, inline CSS, no external requests —
  reuses `src/report/visualize.js`'s exported `barChart` and CSS theme
  variables for a consistent look with the per-skill `report.html`).
- `index.js` — `buildDashboard(rootPaths, opts)`: ties the three together
  and writes the file.

## Tests

```bash
node --test src/dashboard/dashboard.test.js
```

Generates real `skill-evaluation/` directories via `src/report`'s
`generateReport()` (using the shared root `fixtures/evaluation-output.*.json`
fixtures) rather than hand-writing fake `scores.json` files, so the tests
break if Module 3's on-disk shape ever changes incompatibly.
