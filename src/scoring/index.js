'use strict';

/**
 * PLACEHOLDER IMPLEMENTATION — Module 3 (Scoring & Report Engine) owns this file.
 *
 * Minimal fixture so the plugin/command wiring (Module 4) can be built and tested
 * end-to-end before the real scoring engine lands. Implements just enough of the
 * "3 -> Report Engine" contract from docs/architecture.md to be replaced, wholesale,
 * by the real module.
 *
 * Contract (docs/architecture.md, "3 -> Report Engine: Scoring output -> Report input"):
 * {
 *   scores: { overall, ...per-metric }, findings: [... unchanged from Evaluation Engine ...],
 *   test_summary: { total, passed, failed }, version, evaluated_at,
 *   previous_version_scores: { ...optional... }
 * }
 *
 * Scoring here is a crude placeholder (start at 100, subtract per finding severity, floor at 0).
 * The real Scoring Engine replaces this with the actual weighted rubric from docs/spec.md.
 */

const SEVERITY_PENALTY = { CRITICAL: 40, HIGH: 20, MEDIUM: 10, LOW: 4 };

function scoreMetric(metric, findings) {
  const relevant = findings.filter((f) => f.metric === metric);
  const penalty = relevant.reduce((sum, f) => sum + (SEVERITY_PENALTY[f.severity] || 0), 0);
  return Math.max(0, 100 - penalty);
}

/**
 * @param {object} evaluationOutput output of src/evaluation (the 2 -> 3 contract)
 * @param {object} [options]
 * @param {string} [options.version] version label for this evaluation run
 * @param {object} [options.previousVersionScores] scores object from a prior run, for comparison
 * @returns {object} scoring output matching the "3 -> Report Engine" contract
 */
function scoreEvaluation(evaluationOutput, options = {}) {
  const { applicable_metrics, findings, test_results } = evaluationOutput;

  const scores = {};
  for (const metric of applicable_metrics) {
    scores[metric] = scoreMetric(metric, findings);
  }
  const metricValues = Object.values(scores);
  scores.overall = metricValues.length
    ? Math.round(metricValues.reduce((a, b) => a + b, 0) / metricValues.length)
    : 0;

  const test_summary = {
    total: test_results.length,
    passed: test_results.filter((t) => t.passed).length,
    failed: test_results.filter((t) => !t.passed).length,
  };

  const result = {
    scores,
    findings,
    test_summary,
    version: options.version || 'v1',
    evaluated_at: new Date().toISOString(),
  };

  if (options.previousVersionScores) {
    result.previous_version_scores = options.previousVersionScores;
  }

  return result;
}

module.exports = { scoreEvaluation };
