'use strict';

const { SEVERITY_ORDER } = require('../scoring/metrics');

/**
 * Generates a single self-contained HTML file (inline SVG, inline CSS, no
 * external requests) visualizing a scoring result: overall score, per-metric
 * scores, problem distribution by severity, and — when available — a
 * before/after version comparison. Renders correctly in light and dark
 * mode since this file is opened standalone, outside any host chrome.
 */

const SEVERITY_COLOR = {
  CRITICAL: '#dc2626',
  HIGH: '#ea580c',
  MEDIUM: '#d97706',
  LOW: '#2563eb',
};

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function scoreColor(score) {
  if (score >= 85) return '#16a34a';
  if (score >= 70) return '#65a30d';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

function barChart(rows, { width = 640, barHeight = 28, gap = 14, max = 100, labelWidth = 200 } = {}) {
  const chartWidth = width - labelWidth - 60;
  const height = rows.length * (barHeight + gap) + gap;
  const bars = rows
    .map((row, i) => {
      const y = gap + i * (barHeight + gap);
      const w = Math.max(2, (row.value / max) * chartWidth);
      const color = row.color || scoreColor(row.value);
      return `
        <text x="0" y="${y + barHeight / 2 + 4}" font-size="13" fill="var(--fg-muted)">${escapeHtml(row.label)}</text>
        <rect x="${labelWidth}" y="${y}" width="${chartWidth}" height="${barHeight}" rx="4" fill="var(--track)" />
        <rect x="${labelWidth}" y="${y}" width="${w}" height="${barHeight}" rx="4" fill="${color}" />
        <text x="${labelWidth + chartWidth + 8}" y="${y + barHeight / 2 + 4}" font-size="13" font-weight="600" fill="var(--fg)">${Math.round(row.value)}</text>
      `;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Score chart">${bars}</svg>`;
}

function severityDistributionChart(findings) {
  const counts = SEVERITY_ORDER.map((sev) => ({
    label: sev,
    value: findings.filter((f) => f.severity === sev).length,
    color: SEVERITY_COLOR[sev],
  }));
  const max = Math.max(1, ...counts.map((c) => c.value));
  return barChart(counts, { max, labelWidth: 110 });
}

function comparisonChart(comparisonRows) {
  const rows = comparisonRows.filter((r) => r.before !== null && r.after !== null);
  if (rows.length === 0) return null;

  const width = 640;
  const groupHeight = 44;
  const gap = 16;
  const labelWidth = 170;
  const chartWidth = width - labelWidth - 60;
  const height = rows.length * (groupHeight + gap) + gap;

  const bars = rows
    .map((row, i) => {
      const y = gap + i * (groupHeight + gap);
      const beforeW = Math.max(2, (row.before / 100) * chartWidth);
      const afterW = Math.max(2, (row.after / 100) * chartWidth);
      const afterColor = row.status === 'regressed' ? '#dc2626' : row.status === 'improved' ? '#16a34a' : '#64748b';
      return `
        <text x="0" y="${y + groupHeight / 2 + 4}" font-size="13" fill="var(--fg-muted)">${escapeHtml(row.metric)}</text>
        <rect x="${labelWidth}" y="${y}" width="${chartWidth}" height="14" rx="3" fill="var(--track)" />
        <rect x="${labelWidth}" y="${y}" width="${beforeW}" height="14" rx="3" fill="#94a3b8" />
        <text x="${labelWidth + chartWidth + 8}" y="${y + 12}" font-size="11" fill="var(--fg-muted)">vorher ${row.before}</text>
        <rect x="${labelWidth}" y="${y + 20}" width="${chartWidth}" height="14" rx="3" fill="var(--track)" />
        <rect x="${labelWidth}" y="${y + 20}" width="${afterW}" height="14" rx="3" fill="${afterColor}" />
        <text x="${labelWidth + chartWidth + 8}" y="${y + 32}" font-size="11" font-weight="600" fill="${afterColor}">nachher ${row.after} (${row.delta > 0 ? '+' : ''}${row.delta})</text>
      `;
    })
    .join('');

  return `<svg viewBox="0 0 ${width} ${height}" width="100%" height="${height}" role="img" aria-label="Vorher/Nachher-Vergleich">${bars}</svg>`;
}

function renderVisualizationHtml(scoringResult, comparison) {
  const { scores, score_details, findings, test_summary, skill_path, version, evaluated_at } = scoringResult;
  const metricKeys = Object.keys(scores).filter((k) => k !== 'overall');
  const metricRows = metricKeys.map((k) => ({
    label: (score_details[k] && score_details[k].label) || k,
    value: scores[k],
  }));

  const overall = scores.overall ?? 0;
  const passRate = test_summary.total > 0 ? Math.round((test_summary.passed / test_summary.total) * 100) : null;

  const comparisonSection = comparison
    ? (() => {
        const svg = comparisonChart(comparison.rows);
        if (!svg) return '';
        return `
        <section>
          <h2>Versionsvergleich</h2>
          ${comparison.has_regressions ? `<p class="warning">⚠️ ${comparison.regressions.length} Kriterium/Kriterien haben sich verschlechtert.</p>` : '<p class="ok">Keine Verschlechterungen gegenüber der Vorversion.</p>'}
          ${svg}
        </section>`;
      })()
    : '';

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Skill Evaluation — ${escapeHtml(skill_path)}</title>
<style>
  :root {
    --bg: #ffffff;
    --fg: #0f172a;
    --fg-muted: #475569;
    --card: #f8fafc;
    --border: #e2e8f0;
    --track: #e2e8f0;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0b1120;
      --fg: #e2e8f0;
      --fg-muted: #94a3b8;
      --card: #161f34;
      --border: #253048;
      --track: #253048;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px;
    background: var(--bg);
    color: var(--fg);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  .meta { color: var(--fg-muted); font-size: 13px; margin-bottom: 24px; }
  section {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 20px;
  }
  .overall {
    display: flex;
    align-items: center;
    gap: 24px;
  }
  .overall .number {
    font-size: 48px;
    font-weight: 700;
    color: ${scoreColor(overall)};
  }
  .overall .sub { color: var(--fg-muted); font-size: 13px; }
  .warning { color: #dc2626; font-weight: 600; }
  .ok { color: #16a34a; font-weight: 600; }
  svg text { font-family: inherit; }
</style>
</head>
<body>
  <h1>Skill Evaluation Report — Visuelle Auswertung</h1>
  <div class="meta">${escapeHtml(skill_path)} · Version ${escapeHtml(version)} · ${escapeHtml(evaluated_at)}</div>

  <section class="overall">
    <div class="number">${overall}</div>
    <div class="sub">
      Overall Quality / 100<br />
      ${test_summary.passed}/${test_summary.total} Tests bestanden${passRate !== null ? ` (${passRate}%)` : ''}<br />
      ${findings.length} erkannte Probleme
    </div>
  </section>

  <section>
    <h2>Bewertungskriterien</h2>
    ${barChart(metricRows)}
  </section>

  <section>
    <h2>Problemverteilung nach Priorität</h2>
    ${severityDistributionChart(findings)}
  </section>

  ${comparisonSection}
</body>
</html>
`;
}

module.exports = { renderVisualizationHtml, barChart, severityDistributionChart, comparisonChart };
