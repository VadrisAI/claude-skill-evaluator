'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runPipeline } = require('../src/pipeline');

const FIXTURE_SKILL = path.join(__dirname, 'fixtures', 'sample-skill');

test('runPipeline wires analyzer -> evaluation -> report (which scores internally) end to end', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-eval-test-'));

  const result = runPipeline(FIXTURE_SKILL, { outputDir });

  assert.equal(result.analysis.structure.has_skill_md, true);
  assert.ok(['simple', 'multi_step_process'].includes(result.analysis.complexity_class));

  assert.ok(Array.isArray(result.evaluation.applicable_metrics));
  assert.ok(Array.isArray(result.evaluation.findings));
  assert.ok(Array.isArray(result.evaluation.test_results));

  const { scoringResult, files } = result.report;
  assert.equal(typeof scoringResult.scores.overall, 'number');
  assert.equal(scoringResult.test_summary.total, result.evaluation.test_results.length);

  const reportPath = files.find((f) => f.endsWith('REPORT.md'));
  const scoresPath = files.find((f) => f.endsWith('scores.json'));
  const testResultsPath = files.find((f) => f.endsWith('test-results.json'));
  const historyPath = files.find((f) => f.includes(`history${path.sep}`));

  assert.ok(reportPath && fs.existsSync(reportPath));
  assert.ok(scoresPath && fs.existsSync(scoresPath));
  assert.ok(testResultsPath && fs.existsSync(testResultsPath));
  assert.ok(historyPath && fs.existsSync(historyPath));

  const reportText = fs.readFileSync(reportPath, 'utf8');
  assert.match(reportText, /# Skill Evaluation Report/);
  assert.match(reportText, /## Gesamtbewertung/);
  assert.match(reportText, /keine.*Ersatzformulierung/s);

  fs.rmSync(outputDir, { recursive: true, force: true });
});

test('runPipeline produces a version comparison on a second run against the same output dir', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-eval-test-'));

  const first = runPipeline(FIXTURE_SKILL, { outputDir });
  const second = runPipeline(FIXTURE_SKILL, { outputDir });

  assert.notEqual(first.report.scoringResult.version, second.report.scoringResult.version);
  assert.ok(second.report.comparison);
  // Real report engine shape (src/report/compare.js#compareScores): { rows, has_regressions, regressions, improvements } —
  // there is no echoed "previousVersionScores" field. Same input run twice, so nothing should have moved.
  assert.ok(Array.isArray(second.report.comparison.rows));
  assert.equal(second.report.comparison.has_regressions, false);
  assert.deepEqual(second.report.comparison.improvements, []);
  for (const row of second.report.comparison.rows) {
    assert.equal(row.before, first.report.scoringResult.scores[row.metric]);
    assert.equal(row.after, second.report.scoringResult.scores[row.metric]);
    assert.equal(row.status, 'unchanged');
  }

  fs.rmSync(outputDir, { recursive: true, force: true });
});

test('runPipeline throws a clear error for a nonexistent skill path', () => {
  assert.throws(() => runPipeline('/nonexistent/skill/path/xyz'), /does not exist/);
});
