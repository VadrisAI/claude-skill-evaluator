'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { evaluateSkill } = require('../index');
const { REQUIRED_FIELDS, SEVERITIES } = require('../findings');
const { BASE_METRICS, PROCESS_METRICS } = require('../criteria');
const { baseRules } = require('../rules/base');
const { processRules } = require('../rules/process');

function loadFixture(name) {
  return require(path.join('..', 'fixtures', name));
}

function assertContractShape(output) {
  assert.deepEqual(
    Object.keys(output).sort(),
    ['applicable_metrics', 'complexity_class', 'findings', 'skill_path', 'test_results'].sort(),
  );
  assert.equal(typeof output.skill_path, 'string');
  assert.ok(['simple', 'multi_step_process'].includes(output.complexity_class));
  assert.ok(Array.isArray(output.applicable_metrics));
  assert.ok(Array.isArray(output.findings));
  assert.ok(Array.isArray(output.test_results));

  for (const finding of output.findings) {
    for (const field of REQUIRED_FIELDS) {
      assert.equal(typeof finding[field], 'string', `finding.${field} should be a string`);
      assert.notEqual(finding[field].trim(), '', `finding.${field} should not be empty`);
    }
    assert.ok(SEVERITIES.includes(finding.severity), `unexpected severity "${finding.severity}"`);
    assert.ok(output.applicable_metrics.includes(finding.metric), `finding.metric "${finding.metric}" must be one of applicable_metrics`);

    // Non-goal guard: this module diagnoses, it never ships replacement text.
    assert.ok(
      !/ersetze diesen (abschnitt|text) durch/i.test(finding.improvement_direction),
      'improvement_direction must never contain a drop-in replacement instruction',
    );
    assert.ok(!finding.improvement_direction.includes('```'), 'improvement_direction must not embed a code/replacement block');
  }

  for (const result of output.test_results) {
    assert.equal(typeof result.test_id, 'string');
    assert.equal(typeof result.category, 'string');
    assert.equal(typeof result.passed, 'boolean');
    assert.equal(typeof result.detail, 'string');
  }
}

test('simple, clean skill: no process metrics, no findings, everything passes', () => {
  const output = evaluateSkill(loadFixture('simple-clean.json'));
  assertContractShape(output);

  assert.equal(output.complexity_class, 'simple');
  assert.deepEqual(output.applicable_metrics, BASE_METRICS);
  for (const metric of PROCESS_METRICS) {
    assert.ok(!output.applicable_metrics.includes(metric));
  }

  assert.equal(output.findings.length, 0);
  assert.equal(output.test_results.length, baseRules.length);
  assert.ok(output.test_results.every((r) => r.passed === true));
});

test('simple skill with issues: base rules catch problems, process rules never run', () => {
  const output = evaluateSkill(loadFixture('simple-with-issues.json'));
  assertContractShape(output);

  assert.equal(output.test_results.length, baseRules.length);

  const byId = Object.fromEntries(output.test_results.map((r) => [r.test_id, r]));
  assert.equal(byId['structure-has-skill-md'].passed, true);
  assert.equal(byId['instruction-count-nonzero'].passed, true);
  assert.equal(byId['vague-language'].passed, false);
  assert.equal(byId['instruction-too-short'].passed, false);
  assert.equal(byId['instruction-too-long'].passed, false);
  assert.equal(byId['duplicate-instructions'].passed, false);
  assert.equal(byId['contradictory-always-never'].passed, false);
  assert.equal(byId['undefined-tool-dependency'].passed, false);
  assert.equal(byId['no-failure-handling-declared'].passed, false);
  assert.equal(byId['declared-resources-unreferenced'].passed, false);

  // No process-only test category should ever appear for a "simple" skill.
  const processCategories = new Set(processRules.map((r) => r.testCategory));
  for (const result of output.test_results) {
    assert.ok(!processCategories.has(result.category) || baseRules.some((r) => r.testCategory === result.category));
  }

  assert.ok(output.findings.length > 0);
  assert.ok(output.findings.some((f) => f.metric === 'contradictions' && f.severity === 'HIGH'));
  assert.ok(output.findings.some((f) => f.metric === 'misconfiguration_risk' && f.severity === 'HIGH'));
});

test('multi-step, clean skill: process metrics included, no findings, everything passes', () => {
  const output = evaluateSkill(loadFixture('multi-step-clean.json'));
  assertContractShape(output);

  assert.equal(output.complexity_class, 'multi_step_process');
  assert.deepEqual(output.applicable_metrics, [...BASE_METRICS, ...PROCESS_METRICS]);

  assert.equal(output.test_results.length, baseRules.length + processRules.length);
  assert.equal(output.findings.length, 0);
  assert.ok(output.test_results.every((r) => r.passed === true));
});

test('multi-step skill with issues: process rules detect broken dependencies, dead ends and missing exit conditions', () => {
  const output = evaluateSkill(loadFixture('multi-step-with-issues.json'));
  assertContractShape(output);

  const byId = Object.fromEntries(output.test_results.map((r) => [r.test_id, r]));
  assert.equal(byId['dependency-references-valid'].passed, false);
  assert.equal(byId['decision-points-have-branches'].passed, false);
  assert.equal(byId['decision-branch-targets-exist'].passed, false);
  assert.equal(byId['feedback-loop-exit-condition'].passed, false);
  assert.equal(byId['unreachable-steps'].passed, false);
  assert.equal(byId['end-to-end-path-exists'].passed, false);

  // Base rules still run alongside process rules for multi_step_process.
  assert.equal(byId['undefined-tool-dependency'].passed, false);
  assert.equal(byId['no-failure-handling-declared'].passed, false);
  assert.equal(byId['vague-language'].passed, false);

  assert.ok(output.findings.some((f) => f.metric === 'exit_conditions' && f.severity === 'HIGH'));
  assert.ok(output.findings.some((f) => f.metric === 'dependency_management' && f.severity === 'HIGH'));
  assert.ok(output.findings.some((f) => f.metric === 'dead_end_detection'));
});

test('evaluateSkill validates its input against the documented contract', () => {
  assert.throws(() => evaluateSkill(undefined), TypeError);
  assert.throws(() => evaluateSkill({ skill_path: 'x', structure: {} }), TypeError);
  assert.throws(() => evaluateSkill({ skill_path: 'x', structure: {}, complexity_class: 'nonsense' }), TypeError);
});

test('evaluateSkill tolerates a minimal/degraded analyzer output (missing optional arrays)', () => {
  const output = evaluateSkill({
    skill_path: 'fixtures/minimal',
    structure: { has_skill_md: true, instruction_count: 1 },
    complexity_class: 'simple',
  });
  assertContractShape(output);
  assert.equal(output.test_results.length, baseRules.length);
});
