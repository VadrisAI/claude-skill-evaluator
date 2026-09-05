'use strict';

/**
 * Module 4 (Plugin & Command Integration) owns this file.
 *
 * Wires the pipeline in the order fixed by docs/architecture.md:
 *   Analyzer (Module 1) -> Evaluation/Test Engine (Module 2) -> Scoring/Report Engine (Module 3)
 *
 * Each stage is called strictly through the JSON contracts documented in
 * docs/architecture.md ("Interface contracts between modules"). This orchestrator does not
 * know or care whether src/analyzer, src/evaluation, src/scoring, src/report are the real
 * modules or the placeholder fixtures checked into this repo — it only depends on the
 * contract shapes, so swapping a placeholder for the real module (via PR merge) requires no
 * change here.
 */

const fs = require('fs');
const path = require('path');

const { analyzeSkill } = require('../analyzer');
const { evaluateSkill } = require('../evaluation');
const { scoreEvaluation } = require('../scoring');
const { generateReport } = require('../report');

function nextVersionLabel(outputDir) {
  const historyDir = path.join(outputDir, 'skill-evaluation', 'history');
  if (!fs.existsSync(historyDir)) return 'v1';
  const versions = fs
    .readdirSync(historyDir)
    .map((f) => /^evaluation-v(\d+)\.json$/.exec(f))
    .filter(Boolean)
    .map((m) => Number(m[1]));
  const next = versions.length ? Math.max(...versions) + 1 : 1;
  return `v${next}`;
}

function loadPreviousVersionScores(outputDir) {
  const historyDir = path.join(outputDir, 'skill-evaluation', 'history');
  if (!fs.existsSync(historyDir)) return null;
  const files = fs
    .readdirSync(historyDir)
    .filter((f) => /^evaluation-v\d+\.json$/.test(f))
    .sort();
  if (files.length === 0) return null;
  const latest = files[files.length - 1];
  try {
    const data = JSON.parse(fs.readFileSync(path.join(historyDir, latest), 'utf8'));
    return data.scores || null;
  } catch {
    return null;
  }
}

/**
 * Runs the full Analyzer -> Evaluation -> Scoring -> Report pipeline for one skill.
 *
 * @param {string} skillPath path to the skill directory to evaluate
 * @param {object} [options]
 * @param {string} [options.outputDir] where to write skill-evaluation/ (defaults to skillPath)
 * @returns {{ analysis: object, evaluation: object, scoring: object, report: object }}
 */
function runPipeline(skillPath, options = {}) {
  const outputDir = options.outputDir || skillPath;

  const analysis = analyzeSkill(skillPath);
  const evaluation = evaluateSkill(analysis);

  const version = nextVersionLabel(outputDir);
  const previousVersionScores = loadPreviousVersionScores(outputDir);
  const scoring = scoreEvaluation(evaluation, { version, previousVersionScores });

  const report = generateReport(
    scoring,
    { skill_path: analysis.skill_path, complexity_class: analysis.complexity_class },
    outputDir
  );

  return { analysis, evaluation, scoring, report };
}

module.exports = { runPipeline };
