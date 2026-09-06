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
  assert.equal(byId['no-failure-handling-declared'].passed, true);
  assert.equal(byId['purpose-declared'].passed, false);
  assert.equal(byId['vague-language'].passed, false);
  assert.equal(byId['instruction-too-short'].passed, false);
  assert.equal(byId['instruction-too-long'].passed, false);
  assert.equal(byId['duplicate-instructions'].passed, false);
  assert.equal(byId['contradictory-always-never'].passed, false);
  assert.equal(byId['instructions-not-imperative'].passed, false);
  assert.equal(byId['tool-dependency-orphaned-script'].passed, false);
  assert.equal(byId['inputs-or-outputs-undeclared'].passed, false);

  // No process-only test category should ever appear for a "simple" skill.
  const processCategories = new Set(processRules.map((r) => r.testCategory));
  const baseCategories = new Set(baseRules.map((r) => r.testCategory));
  for (const result of output.test_results) {
    assert.ok(!processCategories.has(result.category) || baseCategories.has(result.category));
  }

  assert.ok(output.findings.length > 0);
  assert.ok(output.findings.every((f) => BASE_METRICS.includes(f.metric)));
  assert.ok(output.findings.some((f) => f.metric === 'contradictions' && f.severity === 'HIGH'));
  assert.ok(output.findings.some((f) => f.metric === 'misconfiguration_risk'));
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

test('multi-step skill with issues: process rules detect broken dependencies, missing exit conditions and dead-end loop targets', () => {
  const output = evaluateSkill(loadFixture('multi-step-with-issues.json'));
  assertContractShape(output);

  const byId = Object.fromEntries(output.test_results.map((r) => [r.test_id, r]));
  assert.equal(byId['dependency-references-valid'].passed, false);
  assert.equal(byId['dependency-forward-reference'].passed, false);
  assert.equal(byId['decision-points-duplicate-conditions'].passed, false);
  assert.equal(byId['feedback-loop-exit-condition'].passed, false);
  assert.equal(byId['retry-mechanism-has-limit'].passed, false);
  assert.equal(byId['feedback-loop-target-step-exists'].passed, false);
  assert.equal(byId['missing-declared-outputs'].passed, false);

  // Base rules still run alongside process rules for multi_step_process.
  assert.equal(byId['no-failure-handling-declared'].passed, false);
  assert.equal(byId['vague-language'].passed, false);
  assert.equal(byId['tool-dependency-orphaned-script'].passed, false);

  assert.ok(output.findings.some((f) => f.metric === 'exit_conditions' && f.severity === 'HIGH'));
  assert.ok(output.findings.some((f) => f.metric === 'dependency_management' && f.severity === 'HIGH'));
  assert.ok(output.findings.some((f) => f.metric === 'dead_end_detection'));

  // The step-9 reference doesn't exist, so dependency-forward-reference must
  // not also mislabel it as merely "out of order" (dependency-references-valid
  // already reports it correctly) — only the genuine 5->2 forward reference
  // should surface here.
  const forwardRefFindings = output.findings.filter((f) => f.metric === 'process_transitions' && f.problem.includes('referenziert einen später'));
  assert.equal(forwardRefFindings.length, 1);
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

test('integration: evaluateSkill runs end-to-end against the real Analyzer output (src/analyzer)', () => {
  // Regression guard for exactly the kind of contract drift that motivated
  // this rewrite: run the actual Module 1 analyzer against its own shared
  // fixtures and feed the real output straight into evaluateSkill.
  const { analyzeSkill } = require('../../analyzer');
  const repoRoot = path.join(__dirname, '..', '..', '..');

  const simple = evaluateSkill(analyzeSkill(path.join(repoRoot, 'fixtures', 'simple-skill')));
  assertContractShape(simple);
  assert.equal(simple.complexity_class, 'simple');

  const multiStep = evaluateSkill(analyzeSkill(path.join(repoRoot, 'fixtures', 'multi-step-skill')));
  assertContractShape(multiStep);
  assert.equal(multiStep.complexity_class, 'multi_step_process');
});

test('a simple skill with a script library is not reported as all-orphaned', () => {
  // Before this guard, the rule only looked at step.tools — so a `simple`
  // skill (zero steps by definition) had *every* script it ships reported
  // as orphaned. One real skill produced 15 such findings, all false.
  const { analyzeSkill } = require('../../analyzer');
  const repoRoot = path.join(__dirname, '..', '..', '..');

  const output = evaluateSkill(analyzeSkill(path.join(repoRoot, 'fixtures', 'catalog-skill')));
  assert.equal(output.complexity_class, 'simple', 'fixture should classify as simple (no sequence)');

  const orphanFindings = output.findings.filter((f) => /Ressource "/.test(f.location || ''));
  assert.deepEqual(
    orphanFindings.map((f) => f.location),
    [],
    'scripts documented in the SKILL.md must not be reported as orphaned just because the skill has no steps'
  );
});
