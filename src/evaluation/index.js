'use strict';

/**
 * PLACEHOLDER IMPLEMENTATION — Module 2 (Evaluation & Test Engine) owns this file.
 *
 * Minimal fixture so the plugin/command wiring (Module 4) can be built and tested
 * end-to-end before the real evaluation/test engine lands. Implements just enough of the
 * "2 -> 3" contract from docs/architecture.md to be replaced, wholesale, by the real module.
 *
 * Contract (docs/architecture.md, "2 -> 3: Evaluation/Test output -> Scoring input"):
 * {
 *   skill_path, complexity_class, applicable_metrics: [string],
 *   findings: [{ area, location, problem, cause, impact, improvement_direction,
 *                watch_for, context, severity, metric }],
 *   test_results: [{ test_id, category, passed, detail }]
 * }
 *
 * Per docs/architecture.md "What complexity_class changes downstream": when
 * complexity_class === "simple", process-transition/dependency/feedback-loop checks and
 * metrics are skipped entirely.
 */

const SIMPLE_METRICS = ['instruction_quality', 'task_definition', 'completeness', 'efficiency'];
const PROCESS_METRICS = ['consistency', 'robustness', 'process_integrity'];

/**
 * @param {object} analyzerOutput output of src/analyzer (the 1 -> 2 contract)
 * @returns {object} evaluation output matching the 2 -> 3 contract
 */
function evaluateSkill(analyzerOutput) {
  const { skill_path, structure, complexity_class } = analyzerOutput;

  const applicable_metrics =
    complexity_class === 'multi_step_process' ? [...SIMPLE_METRICS, ...PROCESS_METRICS] : [...SIMPLE_METRICS];

  const findings = [];
  const test_results = [];

  if (!structure.has_skill_md) {
    findings.push({
      area: 'structure',
      location: 'skill root',
      problem: 'No SKILL.md found in the skill directory.',
      cause: 'The evaluated path does not contain a SKILL.md file at its root.',
      impact: 'Claude cannot discover or load this as a skill at all.',
      improvement_direction: 'Add a SKILL.md file describing the skill, per the Claude Agent Skills format.',
      watch_for: 'Confirm the path passed to the evaluator actually points at a skill directory, not a parent folder.',
      context: 'PLACEHOLDER finding produced by the Module 4 evaluation fixture, not the real Evaluation Engine.',
      severity: 'CRITICAL',
      metric: 'completeness',
    });
    test_results.push({
      test_id: 'placeholder-has-skill-md',
      category: 'standard',
      passed: false,
      detail: 'SKILL.md not found.',
    });
  } else {
    test_results.push({
      test_id: 'placeholder-has-skill-md',
      category: 'standard',
      passed: true,
      detail: 'SKILL.md found.',
    });
  }

  if (structure.resources.length === 0) {
    findings.push({
      area: 'structure',
      location: 'skill root',
      problem: 'No references/, scripts/, or assets/ resource directories found.',
      cause: 'The skill may be entirely self-contained in SKILL.md, or may be missing supporting resources.',
      impact: 'Cannot be judged as a defect on its own — only relevant if the SKILL.md text implies external resources it does not ship.',
      improvement_direction: 'Verify whether SKILL.md references files that should exist in references/, scripts/, or assets/.',
      watch_for: 'Do not add resource directories just to have them; only add what the instructions actually need.',
      context: 'PLACEHOLDER finding produced by the Module 4 evaluation fixture, not the real Evaluation Engine.',
      severity: 'LOW',
      metric: 'completeness',
    });
  }

  if (complexity_class === 'multi_step_process') {
    test_results.push({
      test_id: 'placeholder-process-transitions',
      category: 'boundary',
      passed: structure.step_count > 0,
      detail: `Detected step_count=${structure.step_count}; real Test Engine should verify each transition.`,
    });
  }

  return {
    skill_path,
    complexity_class,
    applicable_metrics,
    findings,
    test_results,
  };
}

module.exports = { evaluateSkill };
