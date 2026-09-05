'use strict';

/**
 * PLACEHOLDER IMPLEMENTATION — Module 3 (Scoring & Report Engine) owns this file.
 *
 * Minimal fixture so the plugin/command wiring (Module 4) can be built and tested
 * end-to-end before the real report engine lands. Writes the output layout described in
 * docs/spec.md ("Testreport"):
 *
 *   skill-evaluation/
 *   ├── REPORT.md
 *   ├── scores.json
 *   ├── test-results.json
 *   └── history/
 *       └── evaluation-v<version>.json
 *
 * IMPORTANT (non-goal, repeated from docs/spec.md and docs/architecture.md): this module
 * never rewrites, "fixes," or outputs a corrected version of the evaluated skill. It only
 * ever writes report artifacts under the output directory.
 */

const fs = require('fs');
const path = require('path');

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function formatFinding(finding, index) {
  return [
    `### ${index + 1}. [${finding.severity}] ${finding.problem}`,
    '',
    `- **BETROFFENER BEREICH**: ${finding.area}`,
    `- **GENAUE STELLE**: ${finding.location}`,
    `- **PROBLEM**: ${finding.problem}`,
    `- **URSACHE**: ${finding.cause}`,
    `- **AUSWIRKUNG**: ${finding.impact}`,
    `- **VERBESSERUNGSRICHTUNG**: ${finding.improvement_direction}`,
    `- **ZU BEACHTEN**: ${finding.watch_for}`,
    `- **KONTEXT**: ${finding.context}`,
    '',
  ].join('\n');
}

function formatScoreTable(scores) {
  const rows = Object.entries(scores)
    .filter(([key]) => key !== 'overall')
    .map(([key, value]) => `| ${key} | ${value}/100 |`);
  return ['| Metric | Score |', '| --- | --- |', `| **overall** | **${scores.overall}/100** |`, ...rows].join('\n');
}

function formatComparisonTable(scores, previousScores) {
  if (!previousScores) return '';
  const keys = Array.from(new Set([...Object.keys(previousScores), ...Object.keys(scores)]));
  const rows = keys.map((key) => {
    const prev = previousScores[key];
    const curr = scores[key];
    const delta = typeof prev === 'number' && typeof curr === 'number' ? curr - prev : null;
    const deltaStr = delta === null ? 'n/a' : delta >= 0 ? `+${delta}` : `${delta}`;
    return `| ${key} | ${prev ?? 'n/a'} | ${curr ?? 'n/a'} | ${deltaStr} |`;
  });
  return [
    '## Version Comparison',
    '',
    '| Metric | Previous | Current | Change |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

function buildReportMarkdown(scoringOutput, meta) {
  const { scores, findings, test_summary, version, evaluated_at, previous_version_scores } = scoringOutput;
  const sortedFindings = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  const sections = [
    `# Skill Evaluation Report`,
    '',
    `- **Skill**: \`${meta.skill_path}\``,
    `- **Complexity class**: \`${meta.complexity_class}\``,
    `- **Version**: ${version}`,
    `- **Evaluated at**: ${evaluated_at}`,
    '',
    '## Scores',
    '',
    formatScoreTable(scores),
    '',
    formatComparisonTable(scores, previous_version_scores),
    '## Tests',
    '',
    `- Total: ${test_summary.total}`,
    `- Passed: ${test_summary.passed}`,
    `- Failed: ${test_summary.failed}`,
    '',
    `## Findings (${sortedFindings.length})`,
    '',
  ];

  if (sortedFindings.length === 0) {
    sections.push('No findings.');
  } else {
    sortedFindings.forEach((finding, index) => sections.push(formatFinding(finding, index)));
  }

  sections.push(
    '---',
    '',
    '_This report is diagnostic only. It does not rewrite, fix, or auto-optimize the evaluated skill — the improvement direction above is guidance, not a drop-in replacement. The skill author decides how to revise it, then re-runs the evaluator to measure the change._'
  );

  return sections.join('\n');
}

/**
 * @param {object} scoringOutput output of src/scoring (the "3 -> Report Engine" contract)
 * @param {object} meta additional context the report needs but scoring doesn't carry
 * @param {string} meta.skill_path
 * @param {string} meta.complexity_class
 * @param {string} outputDir directory to write skill-evaluation/ into (defaults to CWD)
 * @returns {{ reportPath: string, scoresPath: string, testResultsPath: string, historyPath: string }}
 */
function generateReport(scoringOutput, meta, outputDir) {
  const evalDir = path.join(outputDir, 'skill-evaluation');
  const historyDir = path.join(evalDir, 'history');
  fs.mkdirSync(historyDir, { recursive: true });

  const reportPath = path.join(evalDir, 'REPORT.md');
  const scoresPath = path.join(evalDir, 'scores.json');
  const testResultsPath = path.join(evalDir, 'test-results.json');
  const historyPath = path.join(historyDir, `evaluation-${scoringOutput.version}.json`);

  fs.writeFileSync(reportPath, buildReportMarkdown(scoringOutput, meta));
  fs.writeFileSync(scoresPath, JSON.stringify(scoringOutput.scores, null, 2));
  fs.writeFileSync(
    testResultsPath,
    JSON.stringify({ test_summary: scoringOutput.test_summary, findings: scoringOutput.findings }, null, 2)
  );
  fs.writeFileSync(
    historyPath,
    JSON.stringify({ ...scoringOutput, ...meta }, null, 2)
  );

  return { reportPath, scoresPath, testResultsPath, historyPath };
}

module.exports = { generateReport };
