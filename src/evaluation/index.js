'use strict';

const { metricsForComplexity } = require('./criteria');
const { runTests } = require('./testEngine');

const VALID_COMPLEXITY_CLASSES = ['simple', 'multi_step_process'];

/**
 * Module 2: Evaluation & Test Engine.
 *
 * Consumes the Analyzer's output (contract "1 -> 2" in
 * docs/architecture.md) and produces the Evaluation/Test output (contract
 * "2 -> 3") that the Scoring & Report Engine consumes.
 *
 * This module never rewrites, fixes, or proposes replacement text for the
 * evaluated skill — see docs/spec.md, "Verbesserungshinweise und
 * Lernansatz". Every finding is diagnosis + direction only.
 *
 * @param {object} analyzerOutput - shape defined by contract "1 -> 2"
 * @returns {object} shape defined by contract "2 -> 3"
 */
function evaluateSkill(analyzerOutput) {
  if (!analyzerOutput || typeof analyzerOutput !== 'object') {
    throw new TypeError('evaluateSkill requires the analyzer output object');
  }
  const { skill_path, structure, complexity_class } = analyzerOutput;
  if (!VALID_COMPLEXITY_CLASSES.includes(complexity_class)) {
    throw new TypeError(
      `evaluateSkill requires complexity_class to be one of ${VALID_COMPLEXITY_CLASSES.join(' | ')}, got "${complexity_class}"`,
    );
  }
  const safeStructure = structure && typeof structure === 'object' ? structure : {};

  const applicable_metrics = metricsForComplexity(complexity_class);
  const { test_results, findings } = runTests(safeStructure, complexity_class);

  return {
    skill_path: skill_path || '',
    complexity_class,
    applicable_metrics,
    findings,
    test_results,
  };
}

module.exports = { evaluateSkill };
