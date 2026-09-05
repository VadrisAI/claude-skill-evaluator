'use strict';

const fs = require('fs');
const path = require('path');

const { scoreEvaluation } = require('../scoring');
const { renderReportMarkdown } = require('./markdown');
const { renderVisualizationHtml } = require('./visualize');
const { readLatestHistory, nextVersionLabel, writeHistoryEntry, compareScores } = require('./compare');

/**
 * Report Engine — module 3 (see docs/architecture.md).
 *
 * Consumes the Evaluation/Test Engine output (the "2 -> 3" contract) and
 * produces the `skill-evaluation/` folder structure described in spec.md:
 *
 *   skill-evaluation/
 *   ├── REPORT.md
 *   ├── scores.json
 *   ├── test-results.json
 *   ├── report.html          (visual auswertung, additive — not in spec's tree but required by "Visuelle Auswertung")
 *   └── history/
 *       ├── evaluation-v1.json
 *       └── evaluation-v2.json
 *
 * @param {object} evaluationOutput - the "2 -> 3" contract shape
 * @param {object} [opts]
 * @param {string} [opts.outputDir] - defaults to "./skill-evaluation"
 * @param {string} [opts.version] - version label for this run (e.g. "v2"); falls back to evaluationOutput.version, then to an auto-incrementing "v<next>" scoped to this skill's history
 * @param {string} [opts.evaluatedAt] - ISO timestamp; defaults to now
 * @param {boolean} [opts.recordHistory] - write a history/evaluation-vN.json entry (default true)
 * @param {object} [opts.previousVersionScores] - explicit override: a raw scores map (e.g. `{ overall: 70, robustness: 60 }`), same shape as scoringResult.scores — NOT a history entry. When omitted, the latest history/evaluation-vN.json entry for this same skill_path is used automatically.
 * @param {string} [opts.previousVersionLabel] - version label to show in the comparison when opts.previousVersionScores is set (ignored otherwise, since the history entry already carries its own label)
 * @returns {object} { outputDir, scoringResult, comparison, files: string[] }
 */
function generateReport(evaluationOutput, opts = {}) {
  const outputDir = path.resolve(opts.outputDir || './skill-evaluation');
  fs.mkdirSync(outputDir, { recursive: true });

  const skillPath = evaluationOutput.skill_path;

  let previousVersionScores;
  let previousVersionLabel;
  if (opts.previousVersionScores !== undefined) {
    previousVersionScores = opts.previousVersionScores;
    previousVersionLabel = opts.previousVersionLabel || null;
  } else {
    // Scoped to this skill_path: a shared/default output directory can hold
    // history for more than one skill, and comparing against another
    // skill's last run would produce a misleading "before/after".
    const previousEntry = readLatestHistory(outputDir, skillPath);
    previousVersionScores = previousEntry ? previousEntry.scores : null;
    previousVersionLabel = previousEntry ? previousEntry.version : null;
  }

  const version = opts.version || evaluationOutput.version || nextVersionLabel(outputDir, skillPath);

  const scoringResult = scoreEvaluation(evaluationOutput, {
    version,
    evaluatedAt: opts.evaluatedAt,
    previousVersionScores,
  });

  const comparison = compareScores(scoringResult.scores, previousVersionScores);

  const files = [];

  const scoresPath = path.join(outputDir, 'scores.json');
  fs.writeFileSync(
    scoresPath,
    JSON.stringify(
      {
        skill_path: scoringResult.skill_path,
        complexity_class: scoringResult.complexity_class,
        version: scoringResult.version,
        evaluated_at: scoringResult.evaluated_at,
        scores: scoringResult.scores,
        score_details: scoringResult.score_details,
        comparison,
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  files.push(scoresPath);

  const testResultsPath = path.join(outputDir, 'test-results.json');
  fs.writeFileSync(
    testResultsPath,
    JSON.stringify(
      {
        skill_path: scoringResult.skill_path,
        version: scoringResult.version,
        evaluated_at: scoringResult.evaluated_at,
        test_summary: scoringResult.test_summary,
        test_results: evaluationOutput.test_results || [],
      },
      null,
      2
    ) + '\n',
    'utf8'
  );
  files.push(testResultsPath);

  const visualizationFile = 'report.html';
  const htmlPath = path.join(outputDir, visualizationFile);
  fs.writeFileSync(htmlPath, renderVisualizationHtml(scoringResult, comparison), 'utf8');
  files.push(htmlPath);

  const reportMd = renderReportMarkdown(scoringResult, comparison, {
    previousVersionLabel,
    visualizationFile,
  });
  const reportPath = path.join(outputDir, 'REPORT.md');
  fs.writeFileSync(reportPath, reportMd, 'utf8');
  files.push(reportPath);

  if (opts.recordHistory !== false) {
    const entry = writeHistoryEntry(outputDir, scoringResult);
    files.push(entry.path);
  }

  return { outputDir, scoringResult, comparison, files };
}

module.exports = { generateReport };
