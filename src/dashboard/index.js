'use strict';

const fs = require('fs');
const path = require('path');

const { findEvaluationDirs } = require('./discover');
const { collectSkillSummary } = require('./collect');
const { renderDashboardHtml } = require('./render');

/**
 * Builds a single static dashboard.html summarizing every `skill-evaluation/`
 * output directory found under `rootPaths`.
 *
 * This is additive tooling, not part of the core Analyzer -> Evaluation ->
 * Report pipeline (docs/architecture.md) — it only reads what that pipeline
 * already wrote to disk. It never triggers a new evaluation run itself; see
 * README.md for why.
 *
 * @param {string|string[]} rootPaths - one or more directories to search
 * @param {object} [opts]
 * @param {string} [opts.out] - output HTML file path (default: "./dashboard.html")
 * @returns {{ file: string, skills: object[] }}
 */
function buildDashboard(rootPaths, opts = {}) {
  const outFile = path.resolve(opts.out || './dashboard.html');
  const outDir = path.dirname(outFile);
  fs.mkdirSync(outDir, { recursive: true });

  const evalDirs = findEvaluationDirs(rootPaths);
  const skills = evalDirs.map(collectSkillSummary).filter(Boolean);

  const html = renderDashboardHtml(skills, { outDir });
  fs.writeFileSync(outFile, html, 'utf8');

  return { file: outFile, skills };
}

module.exports = { buildDashboard };
