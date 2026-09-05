'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runPipeline } = require('../src/pipeline');

const FIXTURE_SKILL = path.join(__dirname, 'fixtures', 'sample-skill');

test('runPipeline wires analyzer -> evaluation -> scoring -> report end to end', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-eval-test-'));

  const result = runPipeline(FIXTURE_SKILL, { outputDir });

  assert.equal(result.analysis.structure.has_skill_md, true);
  assert.ok(['simple', 'multi_step_process'].includes(result.analysis.complexity_class));

  assert.ok(Array.isArray(result.evaluation.applicable_metrics));
  assert.ok(Array.isArray(result.evaluation.findings));
  assert.ok(Array.isArray(result.evaluation.test_results));

  assert.equal(typeof result.scoring.scores.overall, 'number');
  assert.equal(result.scoring.test_summary.total, result.evaluation.test_results.length);

  assert.ok(fs.existsSync(result.report.reportPath));
  assert.ok(fs.existsSync(result.report.scoresPath));
  assert.ok(fs.existsSync(result.report.testResultsPath));
  assert.ok(fs.existsSync(result.report.historyPath));

  const reportText = fs.readFileSync(result.report.reportPath, 'utf8');
  assert.match(reportText, /# Skill Evaluation Report/);
  assert.match(reportText, /## Scores/);
  assert.match(reportText, /diagnostic only/);

  fs.rmSync(outputDir, { recursive: true, force: true });
});

test('runPipeline produces a version comparison on a second run against the same output dir', () => {
  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-eval-test-'));

  const first = runPipeline(FIXTURE_SKILL, { outputDir });
  const second = runPipeline(FIXTURE_SKILL, { outputDir });

  assert.notEqual(first.scoring.version, second.scoring.version);
  assert.ok(second.scoring.previous_version_scores);
  assert.deepEqual(second.scoring.previous_version_scores, first.scoring.scores);

  fs.rmSync(outputDir, { recursive: true, force: true });
});

test('runPipeline throws a clear error for a nonexistent skill path', () => {
  assert.throws(() => runPipeline('/nonexistent/skill/path/xyz'), /does not exist/);
});
