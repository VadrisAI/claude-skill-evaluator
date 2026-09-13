# Local UI Server

The interactive counterpart to `bin/dashboard.js`: a browser interface over the
same Analyzer → Evaluation → Scoring → Report pipeline, which — unlike the
static dashboard — can **start** an evaluation rather than only display
finished ones.

```bash
npm run ui                          # scans the current directory, http://127.0.0.1:4173/
node bin/ui.js ~/skills --port 8080 # a different path and port
node bin/ui.js ~/skills --out ~/reports
```

Also available as `/skill-ui` inside Claude Code once the plugin is installed.

## What it shows

- **Overview** — how many skills were found, how many are evaluated, the
  median score and its range, all scores side by side, and the severity
  roll-up across everything evaluated.
- **Skill detail** — the overall score and its delta against the previous
  version, test pass rate, all twelve metric scores, the score trend across
  recorded versions, and every finding with its full diagnostic chain:
  problem → cause → impact → improvement direction → what to watch for.
- **Live output** — a console drawer that streams a running evaluation's
  stdout/stderr over server-sent events and refreshes the view when it ends.

## Why this exists alongside the static dashboard

`bin/dashboard.js` writes one self-contained HTML file. That file has no
backend, so it can never start anything — a limitation documented in
`src/dashboard/README.md` and deliberately kept. It remains the right answer
for "give me something I can archive or send to a colleague".

This server is the answer for working *on* skills: evaluate, read the
findings, edit the skill yourself, re-evaluate, watch the score move. The two
do not depend on each other.

## What it deliberately cannot do

**It never modifies a skill.** The tool's central non-goal (`docs/spec.md`)
holds here without exception: the UI has exactly one mutating action, running
an evaluation, and that writes only into `<output-dir>/skill-evaluation/`.
There is no edit button and there will not be one — the project diagnoses and
measures; the rewriting is the user's work.

There is also no usage or rate-limit display: no tool available in this
project has access to that data, so there would be nothing real to show.

## Security

The server runs work on request, so the boundaries are load-bearing rather
than decorative. They are specified in `docs/architecture.md` under "Security
boundaries" and covered by `ui.test.js`:

- binds `127.0.0.1` only, not configurable to a routable address;
- **the client never sends a path** — it sends an id the server itself
  discovered, so there is no traversal surface. A request naming a path is a
  404 and starts nothing;
- runs are `fork`ed with an argv array, never through a shell;
- non-loopback `Host` headers are refused, which blocks DNS rebinding from a
  page the user happens to have open;
- one run at a time, so a browser reload cannot fan out into concurrent
  pipelines writing the same directory;
- request bodies are capped at 64 KB.

## Files

- `inventory.js` — `findSkillDirs(roots)`, `buildState(roots)`,
  `skillId(path)`, `severityCounts(evalDir)`. Joins evaluatable skills (a
  directory with a SKILL.md) with the reports `src/dashboard` reads.
- `runner.js` — `EvaluationRunner`, an EventEmitter that forks the CLI and
  streams its output; serializes runs.
- `server.js` — `createServer(opts)`: routing, the security checks, and the
  SSE fan-out.
- `index.js` — `startUiServer(opts)`, which fixes the bind address.
- `assets/` — `app.html`, `app.css`, `app.js`. No build step, no dependencies.

## Design notes

Colors come from the data-viz reference palette. The severity colors are its
**status** palette, which is not a categorical one: running the categorical
validator over the four severities fails (yellow falls outside the lightness
band; yellow against orange measures ΔE 13.6, below the 15 floor). That is
expected of status colors, and the documented mitigation is applied — a
severity is never encoded by hue alone, so every severity swatch in this UI
sits beside its written label.

Metric bars are HTML elements rather than SVG: an SVG `rect` width cannot take
a `calc()`, and scaling a `viewBox` to the column width would stretch the
labels along with the bars.
