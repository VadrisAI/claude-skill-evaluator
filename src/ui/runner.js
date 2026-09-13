'use strict';

const path = require('path');
const crypto = require('crypto');
const { fork } = require('child_process');
const { EventEmitter } = require('events');

const CLI = path.join(__dirname, '..', '..', 'bin', 'evaluate-skill.js');

/**
 * Runs evaluations on behalf of the UI, one at a time, and streams their
 * output as events.
 *
 * Two deliberate constraints, both from docs/architecture.md's "Security
 * boundaries":
 *
 * - `fork` with an argv array, never `exec`/`spawn` with a shell string.
 *   Nothing the client sends is ever interpolated into a command line; the
 *   skill path comes from the server's own inventory, not from the request.
 * - One run at a time. The pipeline writes into
 *   <outputDir>/skill-evaluation/, so two concurrent runs against the same
 *   skill would interleave writes and corrupt the version history. A browser
 *   reload or an impatient double-click must not be able to cause that.
 */
class EvaluationRunner extends EventEmitter {
  constructor() {
    super();
    this.current = null;
  }

  isBusy() {
    return this.current !== null;
  }

  /**
   * @param {{ skillPath: string, outputDir?: string }} spec
   * @returns {{ runId: string }}
   * @throws if a run is already in flight
   */
  start(spec) {
    if (this.current) {
      const err = new Error('An evaluation is already running');
      err.code = 'RUN_IN_PROGRESS';
      throw err;
    }

    const runId = crypto.randomUUID();
    const args = [spec.skillPath];
    if (spec.outputDir) args.push('--out', spec.outputDir);

    const child = fork(CLI, args, {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      cwd: process.cwd(),
    });

    this.current = { runId, skillPath: spec.skillPath, child };
    this.emit('event', { type: 'run-started', runId, skillPath: spec.skillPath });

    const pipe = (stream, name) => {
      stream.setEncoding('utf8');
      stream.on('data', (text) => {
        this.emit('event', { type: 'run-output', runId, stream: name, text });
      });
    };
    pipe(child.stdout, 'stdout');
    pipe(child.stderr, 'stderr');

    const finish = (exitCode, errorText) => {
      if (!this.current || this.current.runId !== runId) return;
      this.current = null;
      if (errorText) {
        this.emit('event', { type: 'run-output', runId, stream: 'stderr', text: errorText });
      }
      this.emit('event', { type: 'run-finished', runId, ok: exitCode === 0, exitCode });
      this.emit('event', { type: 'state-changed' });
    };

    child.on('error', (err) => finish(-1, `Could not start the evaluation: ${err.message}\n`));
    child.on('close', (code) => finish(code == null ? -1 : code));

    return { runId };
  }
}

module.exports = { EvaluationRunner };
