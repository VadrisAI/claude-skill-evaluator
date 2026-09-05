'use strict';

/**
 * Quality metrics that apply to every skill regardless of complexity class.
 * These map to the "Skill-Analyse" base bullet list in docs/spec.md.
 */
const BASE_METRICS = [
  'structure_quality',
  'instruction_quality',
  'clarity',
  'precision',
  'completeness',
  'redundancy',
  'contradictions',
  'consistency',
  'context_efficiency',
  'edge_case_coverage',
  'robustness',
  'misconfiguration_risk',
];

/**
 * Additional metrics that only make sense once a skill is a connected
 * multi-step process (spec.md: "Bei mehreren verbundenen Prozessschritten
 * zusätzlich: ...").
 */
const PROCESS_METRICS = [
  'process_transitions',
  'dependency_management',
  'decision_logic',
  'feedback_loop_integrity',
  'exit_conditions',
  'dead_end_detection',
];

function metricsForComplexity(complexityClass) {
  if (complexityClass === 'multi_step_process') {
    return [...BASE_METRICS, ...PROCESS_METRICS];
  }
  return [...BASE_METRICS];
}

module.exports = { BASE_METRICS, PROCESS_METRICS, metricsForComplexity };
