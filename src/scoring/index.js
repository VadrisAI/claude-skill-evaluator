'use strict';

const { SEVERITY_PENALTY, SEVERITY_ORDER, metricDefinition } = require('./metrics');

/**
 * Scoring Engine — module 3 (see docs/architecture.md, "2 -> 3" contract).
 *
 * Input:  the Evaluation/Test Engine output (module 2), shaped exactly as
 *         the "2 -> 3" contract describes:
 *           { skill_path, complexity_class, applicable_metrics, findings, test_results }
 *
 * Output: the "3 -> Report Engine" contract, extended with a non-breaking
 *         `score_details` field the Report Engine (also owned by this
 *         module) uses to make every score traceable back to concrete
 *         findings/tests, per spec.md: "Jede Bewertung muss nachvollziehbar
 *         sein: zu jedem Score müssen Analyseergebnisse, Testfälle,
 *         Testergebnisse und erkannte Probleme dokumentiert werden."
 *
 * Hard rule enforced here: only metrics listed in `applicable_metrics` are
 * ever scored. A skill classified `simple` never receives a process_logic /
 * dependency_clarity / workflow_robustness score, because module 2 is not
 * expected to list those as applicable for a simple skill (spec.md: "Das
 * System darf keine Scores anzeigen, die für den jeweiligen Skill nicht
 * relevant sind").
 */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function severityBreakdown(findings) {
  const breakdown = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings) {
    if (Object.prototype.hasOwnProperty.call(breakdown, f.severity)) {
      breakdown[f.severity] += 1;
    }
  }
  return breakdown;
}

/**
 * Scores a single metric from the findings tagged with it (via
 * finding.metric, guaranteed present on every finding by the "2 -> 3"
 * contract) plus, where a mapping exists, the pass rate of test_results
 * whose category maps to this metric.
 */
function scoreMetric(metricKey, findings, testResults) {
  const def = metricDefinition(metricKey);
  const relevantFindings = findings.filter((f) => f.metric === metricKey);

  const penalty = relevantFindings.reduce(
    (sum, f) => sum + (SEVERITY_PENALTY[f.severity] || 0),
    0
  );
  const findingsScore = clamp(100 - penalty, 0, 100);

  const relevantTests = testResults.filter((t) =>
    def.testCategories.includes(t.category)
  );

  let score = findingsScore;
  let testContribution = null;
  if (relevantTests.length > 0) {
    const passed = relevantTests.filter((t) => t.passed).length;
    const total = relevantTests.length;
    const passRate = (passed / total) * 100;
    // Findings are the primary, root-cause-backed signal; test pass rate
    // corroborates it. 70/30 keeps a single flaky/unrelated test from
    // swinging a score that findings otherwise clearly support.
    score = clamp(Math.round(findingsScore * 0.7 + passRate * 0.3), 0, 100);
    testContribution = { total, passed, failed: total - passed, pass_rate: Math.round(passRate) };
  } else {
    score = Math.round(findingsScore);
  }

  return {
    key: metricKey,
    label: def.label,
    description: def.description,
    score,
    findings_score: Math.round(findingsScore),
    severity_penalty: penalty,
    severity_breakdown: severityBreakdown(relevantFindings),
    contributing_findings: relevantFindings.map((f) => ({
      area: f.area,
      location: f.location,
      severity: f.severity,
      problem: f.problem,
    })),
    test_contribution: testContribution,
  };
}

/**
 * @param {object} evaluationOutput - the "2 -> 3" contract shape
 * @param {object} [opts]
 * @param {string} [opts.version] - label for this evaluation run (e.g. "v1")
 * @param {string} [opts.evaluatedAt] - ISO timestamp; defaults to now
 * @param {object} [opts.previousVersionScores] - optional prior scores for comparison
 * @returns {object} the "3 -> Report Engine" contract shape + score_details
 */
function scoreEvaluation(evaluationOutput, opts = {}) {
  if (!evaluationOutput || typeof evaluationOutput !== 'object') {
    throw new TypeError('scoreEvaluation: evaluationOutput must be an object');
  }
  const {
    skill_path,
    complexity_class,
    applicable_metrics = [],
    findings = [],
    test_results = [],
  } = evaluationOutput;

  if (!Array.isArray(applicable_metrics) || applicable_metrics.length === 0) {
    throw new Error(
      'scoreEvaluation: applicable_metrics must be a non-empty array — the Scoring Engine only scores metrics the Evaluation Engine marked relevant for this skill\'s complexity_class.'
    );
  }

  const metricResults = applicable_metrics.map((m) =>
    scoreMetric(m, findings, test_results)
  );

  const scores = {};
  const score_details = {};
  for (const mr of metricResults) {
    scores[mr.key] = mr.score;
    score_details[mr.key] = mr;
  }
  scores.overall = metricResults.length
    ? Math.round(metricResults.reduce((sum, mr) => sum + mr.score, 0) / metricResults.length)
    : null;

  const total = test_results.length;
  const passed = test_results.filter((t) => t.passed).length;
  const test_summary = { total, passed, failed: total - passed };

  const sortedFindings = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  return {
    skill_path,
    complexity_class,
    scores,
    findings: sortedFindings,
    test_summary,
    version: opts.version || evaluationOutput.version || 'unversioned',
    evaluated_at: opts.evaluatedAt || new Date().toISOString(),
    previous_version_scores: opts.previousVersionScores || null,
    score_details,
  };
}

module.exports = { scoreEvaluation, scoreMetric, severityBreakdown };
