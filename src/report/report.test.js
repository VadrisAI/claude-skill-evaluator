'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { scoreEvaluation } = require('../scoring');
const { compareScores } = require('./compare');
const { renderReportMarkdown } = require('./markdown');
const { generateReport } = require('./index');

const fixturesDir = path.join(__dirname, '..', '..', 'fixtures');
function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(fixturesDir, name), 'utf8'));
}

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'skill-eval-report-test-'));
}

test('compareScores flags regressions and improvements symmetrically', () => {
  const comparison = compareScores({ overall: 70, robustness: 60 }, { overall: 80, robustness: 40 });
  assert.equal(comparison.has_regressions, true);
  const overallRow = comparison.rows.find((r) => r.metric === 'overall');
  assert.equal(overallRow.status, 'regressed');
  assert.equal(overallRow.delta, -10);
  const robustnessRow = comparison.rows.find((r) => r.metric === 'robustness');
  assert.equal(robustnessRow.status, 'improved');
  assert.equal(robustnessRow.delta, 20);
});

test('compareScores returns null when there is no previous version', () => {
  assert.equal(compareScores({ overall: 70 }, null), null);
});

test('compareScores marks a metric that disappeared as metric_dropped, not silently omitted', () => {
  const comparison = compareScores({ overall: 90 }, { overall: 80, process_logic: 50 });
  const dropped = comparison.rows.find((r) => r.metric === 'process_logic');
  assert.equal(dropped.status, 'metric_dropped');
});

test('REPORT.md contains every required finding field label from spec.md', () => {
  const input = loadFixture('evaluation-output.multi-step.v1.json');
  const scored = scoreEvaluation(input, { version: 'v1' });
  const md = renderReportMarkdown(scored, null, {});
  for (const label of [
    'BETROFFENER BEREICH',
    'GENAUE STELLE',
    'PROBLEM',
    'URSACHE',
    'AUSWIRKUNG',
    'VERBESSERUNGSRICHTUNG',
    'ZU BEACHTEN',
    'KONTEXT',
  ]) {
    assert.ok(md.includes(label), `REPORT.md missing field label: ${label}`);
  }
});

test('REPORT.md never proposes replacement text (non-goal guardrail)', () => {
  const input = loadFixture('evaluation-output.simple.v1.json');
  const scored = scoreEvaluation(input, { version: 'v1' });
  const md = renderReportMarkdown(scored, null, {});
  assert.ok(/automatisch optimierte Skill-Version/.test(md));
  assert.ok(/fertige Ersatzformulierung/.test(md));
});

test('generateReport writes the full skill-evaluation/ folder structure', () => {
  const dir = tmpDir();
  const input = loadFixture('evaluation-output.simple.v1.json');
  const { outputDir, scoringResult } = generateReport(input, { outputDir: dir, version: 'v1' });

  assert.ok(fs.existsSync(path.join(outputDir, 'REPORT.md')));
  assert.ok(fs.existsSync(path.join(outputDir, 'scores.json')));
  assert.ok(fs.existsSync(path.join(outputDir, 'test-results.json')));
  assert.ok(fs.existsSync(path.join(outputDir, 'report.html')));
  assert.ok(fs.existsSync(path.join(outputDir, 'history', 'evaluation-v1.json')));
  assert.equal(scoringResult.version, 'v1');
});

test('generateReport auto-detects the previous version from history and shows a comparison', () => {
  const dir = tmpDir();
  const v1 = loadFixture('evaluation-output.simple.v1.json');
  const v2 = loadFixture('evaluation-output.simple.v2.json');

  generateReport(v1, { outputDir: dir, version: 'v1' });
  const { comparison } = generateReport(v2, { outputDir: dir, version: 'v2' });

  assert.ok(comparison);
  assert.equal(comparison.has_regressions, false);
  const overallRow = comparison.rows.find((r) => r.metric === 'overall');
  assert.ok(overallRow.delta > 0);

  const md = fs.readFileSync(path.join(dir, 'REPORT.md'), 'utf8');
  assert.ok(md.includes('Versionsvergleich'));
});

test('history entries accumulate as evaluation-v1.json, v2.json, ... across repeated runs', () => {
  const dir = tmpDir();
  const v1 = loadFixture('evaluation-output.simple.v1.json');
  const v2 = loadFixture('evaluation-output.simple.v2.json');

  generateReport(v1, { outputDir: dir, version: 'v1' });
  generateReport(v2, { outputDir: dir, version: 'v2' });

  const historyFiles = fs.readdirSync(path.join(dir, 'history')).sort();
  assert.deepEqual(historyFiles, ['evaluation-v1.json', 'evaluation-v2.json']);
});

test('previousVersionScores accepts a raw scores map, as documented, not a history entry', () => {
  const dir = tmpDir();
  const input = loadFixture('evaluation-output.simple.v1.json');
  const { comparison, scoringResult } = generateReport(input, {
    outputDir: dir,
    version: 'v2',
    previousVersionScores: { overall: 70, robustness: 60 },
    previousVersionLabel: 'v1',
  });

  assert.ok(comparison, 'comparison must not be silently omitted for the documented override shape');
  const overallRow = comparison.rows.find((r) => r.metric === 'overall');
  assert.equal(overallRow.before, 70);
  assert.equal(overallRow.after, scoringResult.scores.overall);
});

test('version label defaults to an auto-incrementing v<next>, not "unversioned", when omitted', () => {
  const dir = tmpDir();
  const v1 = loadFixture('evaluation-output.simple.v1.json');
  const v2 = loadFixture('evaluation-output.simple.v2.json');

  const first = generateReport(v1, { outputDir: dir });
  assert.equal(first.scoringResult.version, 'v1');

  const second = generateReport(v2, { outputDir: dir });
  assert.equal(second.scoringResult.version, 'v2');
});

test('history comparison is scoped per skill_path: an unrelated skill in the same outputDir is never used as "previous"', () => {
  const dir = tmpDir();
  const skillA = loadFixture('evaluation-output.simple.v1.json');
  const skillB = loadFixture('evaluation-output.multi-step.v1.json');
  assert.notEqual(skillA.skill_path, skillB.skill_path);

  generateReport(skillA, { outputDir: dir, version: 'v1' });
  const { comparison } = generateReport(skillB, { outputDir: dir, version: 'v1' });

  assert.equal(comparison, null, 'a different skill sharing the output dir must not be treated as a previous version');
});
