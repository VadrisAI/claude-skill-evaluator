'use strict';

const { SEVERITY_ORDER } = require('../scoring/metrics');

const SEVERITY_LABEL_DE = {
  CRITICAL: 'CRITICAL — kritisch',
  HIGH: 'HIGH — hoch',
  MEDIUM: 'MEDIUM — mittel',
  LOW: 'LOW — niedrig',
};

const COMPLEXITY_LABEL_DE = {
  simple: 'simple — einfache, klar abgegrenzte Aufgabe',
  multi_step_process: 'multi_step_process — mehrstufiger, automatisierter Prozess',
};

function fmtPct(n) {
  return `${Math.round(n)}%`;
}

function fmtDelta(delta) {
  if (delta === null || delta === undefined) return '–';
  if (delta > 0) return `+${delta}`;
  return `${delta}`;
}

function escapeMd(text) {
  if (text === null || text === undefined) return '';
  return String(text);
}

function renderMetaTable(scoringResult) {
  const { skill_path, version, evaluated_at, complexity_class, test_summary } = scoringResult;
  const passRate =
    test_summary.total > 0 ? fmtPct((test_summary.passed / test_summary.total) * 100) : 'n/a';

  const lines = [
    '| | |',
    '|---|---|',
    `| **Skill** | \`${escapeMd(skill_path)}\` |`,
    `| **Version** | ${escapeMd(version)} |`,
    `| **Evaluationsdatum** | ${escapeMd(evaluated_at)} |`,
    `| **Erkannte Komplexität** | ${COMPLEXITY_LABEL_DE[complexity_class] || escapeMd(complexity_class)} |`,
    `| **Tests** | ${test_summary.passed}/${test_summary.total} bestanden (${passRate}) |`,
    `| **Gefundene Probleme** | ${scoringResult.findings.length} |`,
  ];
  return lines.join('\n');
}

function renderScoresTable(scoringResult) {
  const { scores, score_details } = scoringResult;
  const metricKeys = Object.keys(scores).filter((k) => k !== 'overall');

  const header = ['| Kriterium | Score | Basis |', '|---|---:|---|'];
  const rows = metricKeys.map((key) => {
    const detail = score_details[key];
    const label = detail ? detail.label : key;
    const findingsCount = detail ? detail.contributing_findings.length : 0;
    const testInfo = detail && detail.test_contribution
      ? `${detail.test_contribution.passed}/${detail.test_contribution.total} Tests bestanden`
      : 'keine zugeordneten Tests';
    const basis = `${findingsCount} Finding(s), ${testInfo}`;
    return `| ${label} | ${scores[key]}/100 | ${basis} |`;
  });

  const overallLine = `\n**Gesamt-Score (Overall Quality): ${scores.overall ?? 'n/a'}/100**\n`;

  return [
    overallLine,
    '### Bewertungskriterien',
    '',
    'Nur Kriterien, die für die erkannte Struktur dieses Skills relevant sind, werden bewertet.',
    '',
    header.join('\n'),
    rows.join('\n'),
  ].join('\n');
}

function renderTestSummary(scoringResult) {
  const { test_summary, findings } = scoringResult;
  void findings;
  return [
    '### Testergebnisse',
    '',
    `- Gesamt: ${test_summary.total}`,
    `- Bestanden: ${test_summary.passed}`,
    `- Fehlgeschlagen: ${test_summary.failed}`,
    '',
    'Details je Testfall siehe `test-results.json`.',
  ].join('\n');
}

function renderComparison(comparison, previousVersionLabel) {
  if (!comparison) return '';

  const rows = comparison.rows.map((r) => {
    let marker = '';
    if (r.status === 'regressed') marker = ' ⚠️ Verschlechterung';
    else if (r.status === 'improved') marker = ' ✅ Verbesserung';
    else if (r.status === 'new_metric') marker = ' 🆕 neu';
    else if (r.status === 'metric_dropped') marker = ' — entfällt (nicht mehr relevant)';

    return `| ${r.metric} | ${r.before ?? '–'} | ${r.after ?? '–'} | ${fmtDelta(r.delta)}${marker} |`;
  });

  const regressionNote = comparison.has_regressions
    ? `\n**Achtung:** ${comparison.regressions.length} Kriterium/Kriterien haben sich gegenüber ${previousVersionLabel || 'der vorherigen Version'} verschlechtert. Verschlechterungen werden hier bewusst genauso sichtbar gemacht wie Verbesserungen.\n`
    : '';

  return [
    '## Versionsvergleich',
    '',
    `Vergleich gegenüber ${previousVersionLabel || 'der vorherigen Evaluation'}:`,
    '',
    '| Kriterium | Vorher | Nachher | Veränderung |',
    '|---|---:|---:|---|',
    rows.join('\n'),
    regressionNote,
  ].join('\n');
}

function renderFinding(finding, index) {
  return [
    `### ${index}. [${finding.severity}] ${escapeMd(finding.area)}`,
    '',
    `- **BETROFFENER BEREICH:** ${escapeMd(finding.area)}`,
    `- **GENAUE STELLE:** ${escapeMd(finding.location)}`,
    `- **PROBLEM:** ${escapeMd(finding.problem)}`,
    `- **URSACHE:** ${escapeMd(finding.cause)}`,
    `- **AUSWIRKUNG:** ${escapeMd(finding.impact)}`,
    `- **VERBESSERUNGSRICHTUNG:** ${escapeMd(finding.improvement_direction)}`,
    `- **ZU BEACHTEN:** ${escapeMd(finding.watch_for)}`,
    `- **KONTEXT:** ${escapeMd(finding.context)}`,
    `- _Betrifft Score:_ \`${escapeMd(finding.metric)}\``,
  ].join('\n');
}

function renderFindings(findings) {
  if (findings.length === 0) {
    return ['## Erkannte Probleme', '', 'Keine Probleme mit den durchgeführten Tests und Analysen erkannt.'].join(
      '\n'
    );
  }

  const bySeverity = SEVERITY_ORDER.map((sev) => ({
    severity: sev,
    items: findings.filter((f) => f.severity === sev),
  })).filter((g) => g.items.length > 0);

  const sections = bySeverity.map((g) => {
    const heading = `## ${SEVERITY_LABEL_DE[g.severity] || g.severity} (${g.items.length})`;
    const items = g.items.map((f, i) => renderFinding(f, i + 1)).join('\n\n');
    return [heading, '', items].join('\n');
  });

  return sections.join('\n\n');
}

/**
 * Renders REPORT.md content per spec.md's finding template
 * (BETROFFENER BEREICH/GENAUE STELLE/PROBLEM/URSACHE/AUSWIRKUNG/
 * VERBESSERUNGSRICHTUNG/ZU BEACHTEN/KONTEXT), grouped and prioritized by
 * CRITICAL/HIGH/MEDIUM/LOW severity.
 *
 * @param {object} scoringResult - output of scoreEvaluation()
 * @param {object} [comparison] - output of compareScores(), or null
 * @param {object} [opts]
 * @param {string} [opts.previousVersionLabel]
 * @param {string} [opts.visualizationFile] - relative filename of the generated HTML chart
 */
function renderReportMarkdown(scoringResult, comparison, opts = {}) {
  const parts = [
    '# Skill Evaluation Report',
    '',
    renderMetaTable(scoringResult),
    '',
    '## Gesamtbewertung',
    '',
    renderScoresTable(scoringResult),
    '',
    renderTestSummary(scoringResult),
  ];

  if (comparison) {
    parts.push('', renderComparison(comparison, opts.previousVersionLabel));
  }

  parts.push('', renderFindings(scoringResult.findings));

  const hints = ['## Hinweise', ''];
  if (opts.visualizationFile) {
    hints.push(`- Visuelle Auswertung: [\`${opts.visualizationFile}\`](./${opts.visualizationFile})`);
  }
  hints.push(
    '- Maschinenlesbare Daten: `scores.json`, `test-results.json`',
    '- Dieser Report liefert Diagnose und Verbesserungsrichtung, **keine** fertige Ersatzformulierung und **keine** automatisch optimierte Skill-Version. Die Überarbeitung erfolgt durch dich selbst — anschließend erneut evaluieren, um zu prüfen, ob die Änderung tatsächlich wirkt.'
  );

  parts.push('', '---', '', ...hints);

  return parts.join('\n') + '\n';
}

module.exports = { renderReportMarkdown, renderFindings, renderScoresTable, renderComparison };
