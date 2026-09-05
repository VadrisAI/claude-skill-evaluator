'use strict';

/**
 * Module 4 (Plugin & Command Integration) owns this file.
 *
 * Wires the pipeline in the order fixed by docs/architecture.md:
 *   Analyzer (Module 1) -> Evaluation/Test Engine (Module 2) -> Scoring/Report Engine (Module 3)
 *
 * Each stage is called strictly through the JSON contracts documented in
 * docs/architecture.md ("Interface contracts between modules"). This orchestrator does not
 * know or care whether src/analyzer, src/evaluation, src/report are the real modules or the
 * placeholder fixtures checked into this repo — it only depends on the contract shapes, so
 * swapping a placeholder for the real module (via PR merge) requires no change here.
 *
 * Module 3 (Scoring & Report Engine) consolidates scoring and report-writing behind a single
 * `generateReport(evaluationOutput, opts)` call, which calls `scoreEvaluation` internally (see
 * docs/architecture.md, "3 -> Report Engine" — updated after integration-testing against the
 * real module 1 and module 3 branches). This orchestrator therefore only ever calls
 * `generateReport` directly; it never calls `scoreEvaluation` itself.
 */

const path = require('path');

const { analyzeSkill } = require('../analyzer');
const { evaluateSkill } = require('../evaluation');
const { generateReport } = require('../report');

/**
 * Runs the full Analyzer -> Evaluation -> Report (which scores internally) pipeline for one skill.
 *
 * @param {string} skillPath path to the skill directory to evaluate
 * @param {object} [options]
 * @param {string} [options.outputDir] parent directory to write skill-evaluation/ into (defaults to skillPath)
 * @returns {{ analysis: object, evaluation: object, report: object }}
 */
function runPipeline(skillPath, options = {}) {
  const outputDir = options.outputDir || skillPath;

  const analysis = analyzeSkill(skillPath);
  const evaluation = evaluateSkill(analysis);
  const report = generateReport(evaluation, {
    outputDir: path.join(outputDir, 'skill-evaluation'),
  });

  return { analysis, evaluation, report };
}

module.exports = { runPipeline };
