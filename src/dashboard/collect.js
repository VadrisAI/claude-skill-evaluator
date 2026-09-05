'use strict';

const fs = require('fs');
const path = require('path');

const { listHistory } = require('../report/compare');

/**
 * Reads one `skill-evaluation/` output directory (as produced by
 * src/report's generateReport()) and summarizes it for the dashboard:
 * latest score, test pass rate, problem count, and the score trend across
 * this skill's recorded history/evaluation-vN.json entries.
 *
 * Deliberately reads the same on-disk files Module 3 already writes
 * (scores.json, test-results.json, history/) rather than re-deriving
 * anything — the dashboard is a read-only viewer, never a second source of
 * truth for scoring.
 */
function collectSkillSummary(evalDir) {
  const scores = readJson(path.join(evalDir, 'scores.json'));
  if (!scores) return null;

  const testResults = readJson(path.join(evalDir, 'test-results.json'));

  const trend = listHistory(evalDir)
    .map((h) => readJson(h.path))
    .filter((entry) => entry && entry.skill_path === scores.skill_path)
    .sort((a, b) => (a.evaluated_at < b.evaluated_at ? -1 : a.evaluated_at > b.evaluated_at ? 1 : 0))
    .map((entry) => ({
      version: entry.version,
      overall: entry.scores ? entry.scores.overall : null,
      evaluated_at: entry.evaluated_at,
    }));

  const problemCount = countFindings(scores.score_details);

  return {
    evalDir,
    skillPath: scores.skill_path,
    skillName: path.basename(scores.skill_path || evalDir),
    complexityClass: scores.complexity_class,
    version: scores.version,
    evaluatedAt: scores.evaluated_at,
    overall: scores.scores ? scores.scores.overall : null,
    scores: scores.scores || {},
    comparison: scores.comparison || null,
    problemCount,
    testSummary: testResults ? testResults.test_summary : null,
    trend,
    reportMdPath: existsOrNull(path.join(evalDir, 'REPORT.md')),
    reportHtmlPath: existsOrNull(path.join(evalDir, 'report.html')),
  };
}

function countFindings(scoreDetails) {
  if (!scoreDetails) return null;
  const entries = Array.isArray(scoreDetails) ? scoreDetails : Object.values(scoreDetails);
  return entries.reduce((sum, d) => sum + (Array.isArray(d.contributing_findings) ? d.contributing_findings.length : 0), 0);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function existsOrNull(filePath) {
  return fs.existsSync(filePath) ? filePath : null;
}

module.exports = { collectSkillSummary };
