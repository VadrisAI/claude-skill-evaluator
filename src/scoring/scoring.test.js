'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { scoreEvaluation } = require('./index');
const { KNOWN_METRICS } = require('./metrics');
const { BASE_METRICS, PROCESS_METRICS } = require('../evaluation/criteria');

const fixturesDir = path.join(__dirname, '..', '..', 'fixtures');
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf8'));
}

test('scores only the metrics listed in applicable_metrics', () => {
  const input = loadFixture('evaluation-output.simple.v1.json');
  const result = scoreEvaluation(input);
  const keys = Object.keys(result.scores).filter((k) => k !== 'overall');
  assert.deepEqual(keys.sort(), [...input.applicable_metrics].sort());
});

test('never invents process metrics for a simple skill', () => {
  const input = loadFixture('evaluation-output.simple.v1.json');
  const result = scoreEvaluation(input);
  assert.equal('process_logic' in result.scores, false);
  assert.equal('dependency_clarity' in result.scores, false);
  assert.equal('workflow_robustness' in result.scores, false);
});

test('includes process metrics for a multi_step_process skill', () => {
  const input = loadFixture('evaluation-output.multi-step.v1.json');
  const result = scoreEvaluation(input);
  assert.ok('process_logic' in result.scores);
  assert.ok('dependency_clarity' in result.scores);
  assert.ok('workflow_robustness' in result.scores);
});

test('every score is traceable to its contributing findings/tests', () => {
  const input = loadFixture('evaluation-output.simple.v1.json');
  const result = scoreEvaluation(input);
  for (const metric of input.applicable_metrics) {
    const detail = result.score_details[metric];
    assert.ok(detail, `missing score_details for ${metric}`);
    assert.ok(Array.isArray(detail.contributing_findings));
    for (const cf of detail.contributing_findings) {
      assert.ok(cf.location, 'contributing finding must carry a location for traceability');
    }
  }
});

test('CRITICAL findings penalize their metric more than LOW findings', () => {
  const critical = scoreEvaluation({
    skill_path: 'x',
    complexity_class: 'simple',
    applicable_metrics: ['robustness'],
    findings: [
      {
        area: 'a',
        location: 'l',
        problem: 'p',
        cause: 'c',
        impact: 'i',
        improvement_direction: 'd',
        watch_for: 'w',
        context: 'ctx',
        severity: 'CRITICAL',
        metric: 'robustness',
      },
    ],
    test_results: [],
  });
  const low = scoreEvaluation({
    skill_path: 'x',
    complexity_class: 'simple',
    applicable_metrics: ['robustness'],
    findings: [
      {
        area: 'a',
        location: 'l',
        problem: 'p',
        cause: 'c',
        impact: 'i',
        improvement_direction: 'd',
        watch_for: 'w',
        context: 'ctx',
        severity: 'LOW',
        metric: 'robustness',
      },
    ],
    test_results: [],
  });
  assert.ok(critical.scores.robustness < low.scores.robustness);
});

test('a metric with no findings and no tests scores 100', () => {
  const result = scoreEvaluation({
    skill_path: 'x',
    complexity_class: 'simple',
    applicable_metrics: ['efficiency'],
    findings: [],
    test_results: [],
  });
  assert.equal(result.scores.efficiency, 100);
});

test('overall is the mean of the applicable metric scores', () => {
  const result = scoreEvaluation({
    skill_path: 'x',
    complexity_class: 'simple',
    applicable_metrics: ['instruction_quality', 'consistency'],
    findings: [],
    test_results: [],
  });
  assert.equal(result.scores.overall, 100);
});

test('rejects an empty applicable_metrics list', () => {
  assert.throws(() =>
    scoreEvaluation({
      skill_path: 'x',
      complexity_class: 'simple',
      applicable_metrics: [],
      findings: [],
      test_results: [],
    })
  );
});

test('scores.overall never exceeds 100 or drops below 0', () => {
  const manyFindings = Array.from({ length: 20 }, (_, i) => ({
    area: 'a',
    location: `l${i}`,
    problem: 'p',
    cause: 'c',
    impact: 'i',
    improvement_direction: 'd',
    watch_for: 'w',
    context: 'ctx',
    severity: 'CRITICAL',
    metric: 'robustness',
  }));
  const result = scoreEvaluation({
    skill_path: 'x',
    complexity_class: 'simple',
    applicable_metrics: ['robustness'],
    findings: manyFindings,
    test_results: [],
  });
  assert.ok(result.scores.robustness >= 0);
  assert.ok(result.scores.robustness <= 100);
});

test('findings are sorted CRITICAL first', () => {
  const input = loadFixture('evaluation-output.multi-step.v1.json');
  const result = scoreEvaluation(input);
  assert.equal(result.findings[0].severity, 'CRITICAL');
});

test('every metric module 2 can actually produce is a known metric with test categories', () => {
  // Guards against metrics.js's registry drifting from the real metric
  // names in src/evaluation/criteria.js (they were developed in parallel
  // against a since-abandoned speculative contract and silently diverged:
  // KNOWN_METRICS listed task_definition/efficiency/process_logic/
  // dependency_clarity/workflow_robustness, none of which module 2 ever
  // produces, while the 14 real metric names it does produce — precision,
  // context_efficiency, dead_end_detection, etc. — fell through to the
  // generic fallback with an empty testCategories, silently disabling the
  // findings/test-pass-rate blend scoreMetric documents for every one of
  // them).
  for (const metric of [...BASE_METRICS, ...PROCESS_METRICS]) {
    assert.ok(metric in KNOWN_METRICS, `${metric} is missing from KNOWN_METRICS`);
    assert.ok(
      KNOWN_METRICS[metric].testCategories.length > 0,
      `${metric} has no testCategories mapping, so test pass rate never blends into its score`
    );
  }
});

test('repeat findings from the same area compound less than distinct ones', () => {
  const makeFinding = (area, severity) => ({
    area,
    location: 'l',
    problem: 'p',
    cause: 'c',
    impact: 'i',
    improvement_direction: 'd',
    watch_for: 'w',
    context: 'ctx',
    severity,
    metric: 'efficiency',
  });

  // Nine MEDIUM findings that are all the same rule (one habit, nine
  // instances) must not tank the score as hard as nine independent ones.
  const sameArea = scoreEvaluation({
    skill_path: 'x',
    complexity_class: 'simple',
    applicable_metrics: ['efficiency'],
    findings: Array.from({ length: 9 }, () => makeFinding('Kontext-/Token-Effizienz', 'MEDIUM')),
    test_results: [],
  });
  const distinctAreas = scoreEvaluation({
    skill_path: 'x',
    complexity_class: 'simple',
    applicable_metrics: ['efficiency'],
    findings: Array.from({ length: 9 }, (_, i) => makeFinding(`area-${i}`, 'MEDIUM')),
    test_results: [],
  });
  assert.ok(sameArea.scores.efficiency > distinctAreas.scores.efficiency);

  // A single finding is unaffected by decay.
  const single = scoreEvaluation({
    skill_path: 'x',
    complexity_class: 'simple',
    applicable_metrics: ['efficiency'],
    findings: [makeFinding('Kontext-/Token-Effizienz', 'MEDIUM')],
    test_results: [],
  });
  assert.equal(single.scores.efficiency, 93);
});

test('an unknown metric name still scores from findings alone', () => {
  const result = scoreEvaluation({
    skill_path: 'x',
    complexity_class: 'simple',
    applicable_metrics: ['some_future_metric'],
    findings: [
      {
        area: 'a',
        location: 'l',
        problem: 'p',
        cause: 'c',
        impact: 'i',
        improvement_direction: 'd',
        watch_for: 'w',
        context: 'ctx',
        severity: 'HIGH',
        metric: 'some_future_metric',
      },
    ],
    test_results: [],
  });
  assert.equal(result.scores.some_future_metric, 87);
});
