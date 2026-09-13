---
name: skill-ui
description: Start the local Skill Evaluator interface — a browser UI that lists every skill under a path, shows its scores, findings and version history, and can start an evaluation with a live output stream. Runs on 127.0.0.1 only and never modifies a skill.
argument-hint: "[path ...] [--port <n>] [--out <output-dir>]"
allowed-tools: Bash, Read
---

You are starting the Claude Agent Skill Evaluator's local interface: a small
HTTP server bound to `127.0.0.1` that serves a browser UI over the same
pipeline `/evaluate-skill` uses.

**Non-negotiable rule**: this tool never creates, edits, rewrites, repairs or
"fixes" a skill. The UI's only mutating action is *running an evaluation*,
which writes exclusively into `<output-dir>/skill-evaluation/`. If a user asks
the interface to change a skill for them, say no and explain that the project
diagnoses and measures — the user does the rewriting.

1. Parse the arguments: `$ARGUMENTS`
   - Positional arguments are root paths to scan for skills and existing
     reports (default: current directory).
   - `--port <n>` changes the port (default `4173`).
   - `--out <dir>` sends reports somewhere other than next to each skill.

2. Start the server **in the background** — it runs until stopped, so a
   foreground call would block the session:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/ui.js" [<path> ...] [--port <n>] [--out "<dir>"]
   ```

3. If it exits immediately with `Port … is already in use`, tell the user and
   offer to retry with another port. Do not silently pick a different one —
   they may already have the UI open on that port.

4. On success, give the user the URL it printed (`http://127.0.0.1:<port>/`)
   and tell them briefly what they can do there: pick a skill on the left,
   read its scores and findings, and press **Jetzt bewerten** / **Erneut
   bewerten** to run an evaluation with the output streaming live at the
   bottom.

5. Mention how to stop it (Ctrl+C in the terminal running it, or ending the
   background process), and that the server is reachable only from this
   machine.
