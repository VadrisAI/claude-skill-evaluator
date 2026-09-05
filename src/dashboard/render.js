'use strict';

const path = require('path');

const { barChart } = require('../report/visualize');

/**
 * Renders a single self-contained dashboard.html (inline SVG, inline CSS,
 * no external requests — same "no big web platform" approach as
 * src/report/visualize.js) that lists every evaluated skill found by
 * discover.js, its latest score/test results, and its score trend across
 * runs.
 *
 * This is a READ-ONLY viewer. It links to each skill's own REPORT.md /
 * report.html and shows a copy-pasteable re-run command — it does not (and,
 * as a static file with no backend, cannot) execute anything itself. See
 * src/dashboard/README.md for why that's a deliberate boundary, not a
 * missing feature.
 */
function renderDashboardHtml(summaries, { outDir } = {}) {
  const rows = [...summaries].sort((a, b) => {
    const at = a.evaluatedAt || '';
    const bt = b.evaluatedAt || '';
    return at < bt ? 1 : at > bt ? -1 : 0;
  });

  const overviewChart =
    rows.length > 0
      ? barChart(
          rows.map((r) => ({ label: r.skillName, value: r.overall ?? 0 })),
          { labelWidth: 180 }
        )
      : '<p class="meta">Keine ausgewerteten Skills gefunden.</p>';

  const cards = rows.map((r) => skillCard(r, outDir)).join('\n');

  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Skill Evaluator — Dashboard</title>
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
  h2 { font-size: 15px; margin: 0 0 10px; }
  .meta { color: var(--fg-muted); font-size: 13px; margin-bottom: 24px; }
  section {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 20px;
    margin-bottom: 20px;
  }
  .badge {
    display: inline-block;
    font-size: 11px;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--fg-muted);
  }
  .card-grid { display: grid; gap: 16px; }
  .card-header { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .card-header .name { font-weight: 600; font-size: 15px; }
  .card-header .path { color: var(--fg-muted); font-size: 12px; font-family: monospace; }
  .stat-row { display: flex; gap: 24px; margin: 10px 0; flex-wrap: wrap; font-size: 13px; }
  .stat-row .label { color: var(--fg-muted); }
  .links { font-size: 13px; margin-top: 8px; }
  .links a { color: inherit; margin-right: 16px; }
  .rerun { margin-top: 10px; }
  .rerun code {
    display: block;
    background: var(--track);
    border-radius: 6px;
    padding: 8px 10px;
    font-size: 12px;
    overflow-x: auto;
    white-space: pre;
  }
  .delta-up { color: #16a34a; }
  .delta-down { color: #dc2626; }
  .delta-flat { color: var(--fg-muted); }
</style>
</head>
<body>
  <h1>Skill Evaluator — Dashboard</h1>
  <p class="meta">${rows.length} ausgewertete${rows.length === 1 ? 'r Skill' : ' Skills'} · generiert ${escapeHtml(new Date().toISOString())} · read-only Report-Viewer (siehe unten, wieso hier kein "Start"-Button existiert)</p>

  <section>
    <h2>Übersicht — Overall Score je Skill</h2>
    ${overviewChart}
  </section>

  <section>
    <h2>Details</h2>
    <div class="card-grid">
${cards || '<p class="meta">Keine ausgewerteten Skills gefunden.</p>'}
    </div>
  </section>

  <section>
    <h2>Über diesen Dashboard</h2>
    <p class="meta">
      Dies ist eine statische, schreibgeschützte Übersicht über bereits erzeugte <code>skill-evaluation/</code>-Ordner
      (siehe docs/spec.md, "Testreport"). Sie führt keine neuen Evaluationen aus — dafür fehlt einer statischen HTML-Datei
      absichtlich die Fähigkeit, Befehle auszuführen (kein Backend, passend zu spec.md: "Keine eigenständige große
      Web-Plattform nötig"). Zum erneuten Prüfen einen der oben gezeigten Befehle im Terminal ausführen und diesen
      Dashboard danach neu erzeugen (<code>node bin/dashboard.js …</code>).
    </p>
  </section>
</body>
</html>
`;
}

function skillCard(r, outDir) {
  const delta = deltaBadge(r.comparison);
  const testLine = r.testSummary
    ? `${r.testSummary.passed}/${r.testSummary.total} Tests bestanden`
    : 'keine Testergebnisse gefunden';
  const problemLine = r.problemCount === null ? 'unbekannt' : String(r.problemCount);
  const trendLine = r.trend.length > 1 ? sparkline(r.trend) : null;

  const reportMdLink = r.reportMdPath ? linkTo(outDir, r.reportMdPath, 'REPORT.md') : null;
  const reportHtmlLink = r.reportHtmlPath ? linkTo(outDir, r.reportHtmlPath, 'report.html') : null;
  const links = [reportMdLink, reportHtmlLink].filter(Boolean).join(' ');

  return `      <div class="card" style="border:1px solid var(--border); border-radius:8px; padding:14px;">
        <div class="card-header">
          <span class="name">${escapeHtml(r.skillName)}</span>
          <span class="badge">${escapeHtml(r.complexityClass || 'unklassifiziert')}</span>
        </div>
        <div class="path">${escapeHtml(r.skillPath || '')}</div>
        <div class="stat-row">
          <span><span class="label">Overall:</span> <strong>${r.overall ?? '–'}/100</strong> ${delta}</span>
          <span><span class="label">Version:</span> ${escapeHtml(r.version || '–')}</span>
          <span><span class="label">Tests:</span> ${escapeHtml(testLine)}</span>
          <span><span class="label">Findings:</span> ${escapeHtml(problemLine)}</span>
        </div>
        ${trendLine ? `<div class="stat-row"><span class="label">Verlauf:</span> ${trendLine}</div>` : ''}
        ${links ? `<div class="links">${links}</div>` : ''}
        <div class="rerun">
          <span class="label" style="font-size:12px;">Erneut prüfen:</span>
          <code>node bin/evaluate-skill.js ${escapeHtml(r.skillPath || '')}</code>
        </div>
      </div>`;
}

function deltaBadge(comparison) {
  if (!comparison) return '';
  const overallRow = comparison.rows.find((row) => row.metric === 'overall');
  if (!overallRow || overallRow.delta === null) return '';
  if (overallRow.delta > 0) return `<span class="delta-up">▲ +${overallRow.delta}</span>`;
  if (overallRow.delta < 0) return `<span class="delta-down">▼ ${overallRow.delta}</span>`;
  return '<span class="delta-flat">±0</span>';
}

function sparkline(trend) {
  const width = 160;
  const height = 32;
  const pad = 4;
  const max = 100;
  const step = trend.length > 1 ? (width - pad * 2) / (trend.length - 1) : 0;
  const points = trend
    .map((t, i) => {
      const x = pad + i * step;
      const y = pad + (1 - (t.overall ?? 0) / max) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const labels = trend.map((t) => `${t.version}: ${t.overall}`).join(', ');

  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Score-Verlauf: ${escapeHtml(labels)}">
    <polyline points="${points}" fill="none" stroke="#2563eb" stroke-width="2" />
  </svg>`;
}

function linkTo(outDir, targetPath, label) {
  if (!outDir) return `<a href="file://${escapeHtml(targetPath)}">${label}</a>`;
  const rel = path.relative(outDir, targetPath).split(path.sep).join('/');
  return `<a href="${escapeHtml(rel)}">${label}</a>`;
}

function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

module.exports = { renderDashboardHtml };
