'use strict';

/**
 * PLACEHOLDER IMPLEMENTATION — Module 3 (Scoring & Report Engine) owns this file.
 *
 * Minimal fixture so the plugin/command wiring (Module 4) can be built and tested
 * end-to-end before the real report engine lands. Real implementation shape confirmed by
 * integration-testing this branch against the real `module/scoring-report` branch — see
 * docs/architecture.md, "3 -> Report Engine", for the authoritative signature. Matches that
 * signature here so no further pipeline change is needed once the real module replaces this
 * file:
 *
 *   generateReport(evaluationOutput, { outputDir, version, evaluatedAt, recordHistory,
 *                                       previousVersionScores, previousVersionLabel })
 *     -> { outputDir, scoringResult, comparison, files: string[] }
 *
 * Writes, inside `opts.outputDir` (the skill-evaluation/ directory itself):
 *   REPORT.md, scores.json, test-results.json, history/evaluation-v<version>.json
 *
 * IMPORTANT (non-goal, repeated from docs/spec.md and docs/architecture.md): this module
 * never rewrites, "fixes," or outputs a corrected version of the evaluated skill. It only
 * ever writes report artifacts under outputDir.
 */

const fs = require('fs');
const path = require('path');

const { scoreEvaluation } = require('../scoring');

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function readLatestHistoryScores(historyDir, skillPath) {
  if (!fs.existsSync(historyDir)) return { scores: null, version: null };
  const files = fs
    .readdirSync(historyDir)
    .filter((f) => /^evaluation-v.+\.json$/.test(f))
    .sort();
  for (let i = files.length - 1; i >= 0; i--) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(historyDir, files[i]), 'utf8'));
      if (data.skill_path === skillPath) {
        return { scores: data.scores || null, version: data.version || null };
      }
    } catch {
      // skip unreadable/partial history entries
    }
  }
  return { scores: null, version: null };
}

function nextVersionLabel(historyDir, skillPath) {
  if (!fs.existsSync(historyDir)) return 'v1';
  const versions = fs
    .readdirSync(historyDir)
    .map((f) => /^evaluation-v(\d+)\.json$/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = versions.length ? Math.max(...versions) + 1 : 1;
  return `v${next}`;
}

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

function buildReportMarkdown(scoringResult, previousVersionScores) {
  const { skill_path, complexity_class, scores, findings, test_summary, version, evaluated_at } = scoringResult;
  const sortedFindings = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  const sections = [
    '# Skill Evaluation Report',
    '',
    `- **Skill**: \`${skill_path}\``,
    `- **Complexity class**: \`${complexity_class}\``,
    `- **Version**: ${version}`,
    `- **Evaluated at**: ${evaluated_at}`,
    '',
    '## Scores',
    '',
    formatScoreTable(scores),
    '',
    formatComparisonTable(scores, previousVersionScores),
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
 * @param {object} evaluationOutput output of src/evaluation (the "2 -> 3" contract)
 * @param {object} [opts]
 * @param {string} [opts.outputDir] the skill-evaluation/ directory itself (default './skill-evaluation')
 * @param {string} [opts.version] version label; defaults to evaluationOutput.version, else auto-incrementing
 * @param {boolean} [opts.recordHistory] write a history/evaluation-vN.json entry (default true)
 * @param {object} [opts.previousVersionScores] explicit override for the before/after comparison
 * @returns {{ outputDir: string, scoringResult: object, comparison: object|null, files: string[] }}
 */
function generateReport(evaluationOutput, opts = {}) {
  const outputDir = path.resolve(opts.outputDir || './skill-evaluation');
  const historyDir = path.join(outputDir, 'history');
  fs.mkdirSync(historyDir, { recursive: true });

  const skillPath = evaluationOutput.skill_path;

  let previousVersionScores = opts.previousVersionScores;
  if (previousVersionScores === undefined) {
    previousVersionScores = readLatestHistoryScores(historyDir, skillPath).scores;
  }

  const version = opts.version || evaluationOutput.version || nextVersionLabel(historyDir, skillPath);

  const scoringResult = scoreEvaluation(evaluationOutput, { version, previousVersionScores });

  const files = [];

  const reportPath = path.join(outputDir, 'REPORT.md');
  fs.writeFileSync(reportPath, buildReportMarkdown(scoringResult, previousVersionScores));
  files.push(reportPath);

  const scoresPath = path.join(outputDir, 'scores.json');
  fs.writeFileSync(scoresPath, JSON.stringify(scoringResult.scores, null, 2));
  files.push(scoresPath);

  const testResultsPath = path.join(outputDir, 'test-results.json');
  fs.writeFileSync(
    testResultsPath,
    JSON.stringify({ test_summary: scoringResult.test_summary, findings: scoringResult.findings }, null, 2)
  );
  files.push(testResultsPath);

  if (opts.recordHistory !== false) {
    const historyPath = path.join(historyDir, `evaluation-${version}.json`);
    fs.writeFileSync(historyPath, JSON.stringify(scoringResult, null, 2));
    files.push(historyPath);
  }

  return { outputDir, scoringResult, comparison: previousVersionScores ? { previousVersionScores } : null, files };
}

module.exports = { generateReport };
