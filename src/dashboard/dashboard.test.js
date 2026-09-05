'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { generateReport } = require('../report');
const { findEvaluationDirs } = require('./discover');
const { collectSkillSummary } = require('./collect');
const { buildDashboard } = require('./index');

const FIXTURES = path.join(__dirname, '..', '..', 'fixtures');
const SIMPLE_V1 = readFixture('evaluation-output.simple.v1.json');
const SIMPLE_V2 = readFixture('evaluation-output.simple.v2.json');
const MULTI_STEP_V1 = readFixture('evaluation-output.multi-step.v1.json');

function readFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, name), 'utf8'));
}

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-test-'));
}

test('findEvaluationDirs discovers skill-evaluation folders and ignores everything else', () => {
  const root = makeTempRoot();
  try {
    const evalDirA = path.join(root, 'skill-a', 'skill-evaluation');
    generateReport(SIMPLE_V1, { outputDir: evalDirA, version: 'v1' });

    fs.mkdirSync(path.join(root, 'not-an-evaluation', 'nested'), { recursive: true });
    fs.writeFileSync(path.join(root, 'not-an-evaluation', 'nested', 'notes.txt'), 'hello');

    const found = findEvaluationDirs(root);
    assert.deepEqual(found, [evalDirA]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('collectSkillSummary reads scores, tests, and history for one evaluation dir', () => {
  const root = makeTempRoot();
  try {
    const evalDir = path.join(root, 'skill-evaluation');
    generateReport(SIMPLE_V1, { outputDir: evalDir, version: 'v1' });
    generateReport(SIMPLE_V2, { outputDir: evalDir, version: 'v2' });

    const summary = collectSkillSummary(evalDir);

    assert.equal(summary.skillPath, './examples/pdf-form-filler');
    assert.equal(summary.skillName, 'pdf-form-filler');
    assert.equal(summary.complexityClass, 'simple');
    assert.equal(summary.version, 'v2');
    assert.equal(typeof summary.overall, 'number');
    assert.equal(summary.trend.length, 2);
    assert.equal(summary.trend[0].version, 'v1');
    assert.equal(summary.trend[1].version, 'v2');
    assert.ok(summary.comparison, 'expected a v1 -> v2 comparison since a prior version exists');
    assert.ok(summary.testSummary, 'expected test_summary from test-results.json');
    assert.ok(summary.reportMdPath && fs.existsSync(summary.reportMdPath));
    assert.ok(summary.reportHtmlPath && fs.existsSync(summary.reportHtmlPath));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('collectSkillSummary returns null for a directory with no scores.json', () => {
  const root = makeTempRoot();
  try {
    const evalDir = path.join(root, 'skill-evaluation');
    fs.mkdirSync(evalDir, { recursive: true });
    assert.equal(collectSkillSummary(evalDir), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildDashboard renders one HTML file summarizing multiple skills', () => {
  const root = makeTempRoot();
  try {
    generateReport(SIMPLE_V1, { outputDir: path.join(root, 'skill-a', 'skill-evaluation'), version: 'v1' });
    generateReport(SIMPLE_V2, { outputDir: path.join(root, 'skill-a', 'skill-evaluation'), version: 'v2' });
    generateReport(MULTI_STEP_V1, { outputDir: path.join(root, 'skill-b', 'skill-evaluation'), version: 'v1' });

    const outFile = path.join(root, 'dashboard.html');
    const result = buildDashboard(root, { out: outFile });

    assert.equal(result.file, outFile);
    assert.ok(fs.existsSync(outFile));
    assert.equal(result.skills.length, 2);

    const names = result.skills.map((s) => s.skillName).sort();
    assert.deepEqual(names, ['pdf-form-filler', 'release-notes-pipeline']);

    const html = fs.readFileSync(outFile, 'utf8');
    assert.match(html, /pdf-form-filler/);
    assert.match(html, /release-notes-pipeline/);
    assert.match(html, /REPORT\.md/);
    assert.match(html, /node bin\/evaluate-skill\.js/);
    // Static, read-only: never claims it can trigger a run itself.
    assert.doesNotMatch(html, /<button/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('buildDashboard handles zero evaluated skills without crashing', () => {
  const root = makeTempRoot();
  try {
    const outFile = path.join(root, 'dashboard.html');
    const result = buildDashboard(root, { out: outFile });
    assert.equal(result.skills.length, 0);
    assert.ok(fs.existsSync(outFile));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
