// Skill Evaluator — local UI.
//
// No build step and no dependencies, matching the rest of the project. The
// only state that matters is `state` (what the server discovered) and
// `selectedId`; everything else is derived at render time.

const METRIC_LABELS = {
  structure_quality: 'Strukturqualität',
  instruction_quality: 'Anweisungsqualität',
  clarity: 'Klarheit',
  precision: 'Präzision',
  completeness: 'Vollständigkeit',
  redundancy: 'Redundanzfreiheit',
  contradictions: 'Widerspruchsfreiheit',
  consistency: 'Konsistenz',
  context_efficiency: 'Kontext-Effizienz',
  edge_case_coverage: 'Edge-Case-Abdeckung',
  robustness: 'Robustheit',
  misconfiguration_risk: 'Fehlkonfigurationsrisiko',
};

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
const SEVERITY_LABELS = { CRITICAL: 'Kritisch', HIGH: 'Hoch', MEDIUM: 'Mittel', LOW: 'Niedrig' };

const COMPLEXITY_LABELS = {
  simple: 'Einfacher Skill',
  multi_step_process: 'Mehrstufiger Prozess',
};

let state = { roots: [], skills: [] };
let selectedId = null;
let reportCache = new Map();
let busy = false;

const $ = (id) => document.getElementById(id);

/* ---------------------------------------------------------------- utils */

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function band(score) {
  if (score == null) return 'none';
  if (score >= 90) return 'good';
  if (score >= 70) return 'mid';
  return 'low';
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

function countBySeverity(findings) {
  const counts = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const f of findings || []) {
    if (counts[f.severity] != null) counts[f.severity] += 1;
  }
  return counts;
}

/* ------------------------------------------------------------- charts */

// A single-series magnitude chart. Built in HTML rather than SVG: an SVG
// rect width cannot take a calc(), and scaling a viewBox to fit the column
// would stretch the labels with it. Plain elements stay responsive and keep
// the type at its real size.
//
// One hue, no legend (the heading names the series), every value direct-
// labeled, track recessive.
function metricBars(scores) {
  const rows = Object.entries(METRIC_LABELS)
    .filter(([key]) => typeof scores[key] === 'number')
    .map(([key, label]) => ({ key, label, value: scores[key] }));
  if (!rows.length) return '<p class="hint">Keine Einzelmetriken vorhanden.</p>';

  return `<div class="bars" role="img" aria-label="Einzelmetriken: ${rows.map((r) => `${r.label} ${r.value} von 100`).join(', ')}">
    ${rows.map((row) => {
      const pct = Math.max(0, Math.min(100, row.value));
      return `<div class="bar-row">
        <span class="bar-name">${esc(row.label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${pct}%"></span></span>
        <span class="bar-num">${pct}</span>
      </div>`;
    }).join('')}
  </div>`;
}

// Score across recorded versions. One series, so no legend box; hover gives
// a crosshair and a tooltip rather than labeling every point.
function trendChart(trend) {
  if (!trend || trend.length < 2) return null;

  const w = 640;
  const h = 180;
  const pad = { top: 16, right: 16, bottom: 26, left: 34 };
  const innerW = w - pad.left - pad.right;
  const innerH = h - pad.top - pad.bottom;

  const values = trend.map((t) => t.overall).filter((v) => typeof v === 'number');
  const min = Math.max(0, Math.min(...values) - 6);
  const max = Math.min(100, Math.max(...values) + 6);
  const span = max - min || 1;

  const x = (i) => pad.left + (trend.length === 1 ? innerW / 2 : (i / (trend.length - 1)) * innerW);
  const y = (v) => pad.top + innerH - ((v - min) / span) * innerH;

  const ticks = [min, (min + max) / 2, max].map((v) => Math.round(v));
  const gridlines = ticks.map((t) => `
    <line class="gridline" x1="${pad.left}" x2="${w - pad.right}" y1="${y(t)}" y2="${y(t)}"></line>
    <text class="tick" x="${pad.left - 8}" y="${y(t)}" text-anchor="end" dominant-baseline="middle">${t}</text>`).join('');

  const path = trend.map((t, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(t.overall).toFixed(1)}`).join(' ');
  const points = trend.map((t, i) => `<circle class="point" cx="${x(i).toFixed(1)}" cy="${y(t.overall).toFixed(1)}" r="4"></circle>`).join('');
  const labels = trend.map((t, i) => `<text class="tick" x="${x(i).toFixed(1)}" y="${h - 6}" text-anchor="middle">${esc(t.version)}</text>`).join('');

  const hits = trend.map((t, i) => {
    const step = trend.length > 1 ? innerW / (trend.length - 1) : innerW;
    return `<rect class="hit" x="${(x(i) - step / 2).toFixed(1)}" y="${pad.top}" width="${step.toFixed(1)}" height="${innerH}"
              data-version="${esc(t.version)}" data-score="${t.overall}" data-when="${esc(formatDate(t.evaluated_at))}"
              data-cx="${x(i).toFixed(1)}"></rect>`;
  }).join('');

  return `<svg class="chart trend" viewBox="0 0 ${w} ${h}" role="img"
            aria-label="Gesamtscore über ${trend.length} Versionen: ${trend.map((t) => `${t.version} ${t.overall}`).join(', ')}">
            ${gridlines}
            <line class="baseline" x1="${pad.left}" x2="${pad.left}" y1="${pad.top}" y2="${pad.top + innerH}"></line>
            <line class="crosshair" style="display:none" y1="${pad.top}" y2="${pad.top + innerH}"></line>
            <path class="line" d="${path}"></path>
            ${points}${labels}${hits}
          </svg>`;
}

/* ------------------------------------------------------------- tooltip */

let tooltipEl = null;

function showTooltip(html, event) {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    document.body.appendChild(tooltipEl);
  }
  tooltipEl.innerHTML = html;
  tooltipEl.style.display = 'block';
  const rect = tooltipEl.getBoundingClientRect();
  const left = Math.min(event.clientX + 14, window.innerWidth - rect.width - 8);
  const top = Math.max(8, event.clientY - rect.height - 12);
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
}

function hideTooltip() {
  if (tooltipEl) tooltipEl.style.display = 'none';
}

/* -------------------------------------------------------------- views */

function renderOverview() {
  const evaluated = state.skills.filter((s) => s.evaluated);
  const scores = evaluated.map((s) => s.summary.overall).filter((v) => typeof v === 'number').sort((a, b) => a - b);
  const median = scores.length ? scores[Math.floor(scores.length / 2)] : null;

  const totals = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  for (const s of evaluated) {
    const counts = s.summary.severityCounts;
    if (counts) for (const sev of SEVERITIES) totals[sev] += counts[sev] || 0;
  }
  const problems = SEVERITIES.reduce((sum, sev) => sum + totals[sev], 0);

  const stats = `
    <div class="grid stats">
      <div class="stat">
        <div class="label">Skills gefunden</div>
        <div class="value">${state.skills.length}</div>
        <div class="note">${evaluated.length} bewertet, ${state.skills.length - evaluated.length} offen</div>
      </div>
      <div class="stat">
        <div class="label">Median-Score</div>
        <div class="value">${median == null ? '—' : median}<small>${median == null ? '' : '/100'}</small></div>
        <div class="note">${scores.length ? `Spanne ${scores[0]}–${scores[scores.length - 1]}` : 'noch keine Bewertung'}</div>
      </div>
      <div class="stat">
        <div class="label">Befunde gesamt</div>
        <div class="value">${problems}</div>
        <div class="note">${totals.CRITICAL + totals.HIGH} davon kritisch oder hoch</div>
      </div>
    </div>`;

  const comparison = evaluated.length
    ? `<div class="card">
         <div class="card-head"><h2>Scores im Vergleich</h2><span class="hint">0–100 Punkte</span></div>
         <div class="bars">
           ${[...evaluated]
             .sort((a, b) => (b.summary.overall ?? -1) - (a.summary.overall ?? -1))
             .map((s) => {
               const value = Math.max(0, Math.min(100, s.summary.overall ?? 0));
               return `<div class="bar-row">
                 <span class="bar-name">${esc(s.skillName)}</span>
                 <span class="bar-track"><span class="bar-fill" style="width:${value}%"></span></span>
                 <span class="bar-num">${value}</span>
               </div>`;
             }).join('')}
         </div>
       </div>`
    : '';

  const severity = problems
    ? `<div class="card">
         <div class="card-head"><h2>Befunde nach Schweregrad</h2><span class="hint">über ${evaluated.length} bewertete Skills</span></div>
         <div class="sev-summary">
           ${SEVERITIES.map((sev) => `
             <span class="sev-chip ${totals[sev] ? '' : 'is-zero'}" data-sev="${sev}">
               <span class="dot" aria-hidden="true"></span>
               <span>${SEVERITY_LABELS[sev]}</span>
               <span class="count">${totals[sev]}</span>
             </span>`).join('')}
         </div>
       </div>`
    : '';

  const pending = state.skills.length - evaluated.length;
  const intro = `
    <div class="card">
      <div class="card-head"><h2>${evaluated.length ? 'Hinweis' : 'Loslegen'}</h2></div>
      <p>Wähle links einen Skill. Bewertete Skills zeigen Score, Befunde und Verlauf;
         ${pending ? `die ${pending} noch offenen startest du mit einem Klick` : 'eine erneute Bewertung startest du mit einem Klick'} —
         die Ausgabe läuft unten live mit.</p>
      <p class="hint" style="margin-top:10px">
        Dieses Werkzeug verändert keinen Skill. Die einzige schreibende Aktion ist eine Evaluation,
        und die schreibt ausschließlich nach <span class="mono-inline">skill-evaluation/</span>.
      </p>
    </div>`;

  return `${stats}${comparison}${severity}${intro}`;
}

function renderDetail(entry, report) {
  const s = entry.summary;
  const running = busy && currentRunPath === entry.skillPath;

  const head = `
    <div class="detail-head">
      <div style="min-width:0">
        <h3>${esc(entry.skillName)}</h3>
        <p class="path">${esc(entry.skillPath)}</p>
        <div class="tags">
          ${s ? `<span class="tag">${esc(COMPLEXITY_LABELS[s.complexityClass] || s.complexityClass || '—')}</span>` : ''}
          ${s ? `<span class="tag">Version ${esc(s.version)}</span>` : '<span class="tag">noch nicht bewertet</span>'}
          ${s ? `<span class="tag">${esc(formatDate(s.evaluatedAt))}</span>` : ''}
        </div>
      </div>
      <button class="btn" id="run-btn" type="button" ${busy ? 'disabled' : ''}>
        ${running ? '<span class="spinner"></span> läuft …' : (s ? 'Erneut bewerten' : 'Jetzt bewerten')}
      </button>
    </div>`;

  if (!entry.evaluated || !report) {
    return `${head}
      <div class="card">
        <div class="empty">
          <h3>Noch keine Evaluation</h3>
          <p>Für diesen Skill liegt kein Bericht vor.</p>
          <p class="hint" style="margin-top:8px">Klick auf „Jetzt bewerten“ — die Pipeline läuft lokal, die Ausgabe siehst du unten.</p>
        </div>
      </div>`;
  }

  const counts = countBySeverity(report.findings);
  const tests = s.testSummary || { total: 0, passed: 0, failed: 0 };
  const delta = s.comparison && typeof s.comparison.overall_delta === 'number' ? s.comparison.overall_delta : null;

  const stats = `
    <div class="grid stats">
      <div class="stat">
        <div class="label">Gesamtscore</div>
        <div class="value">${s.overall == null ? '—' : s.overall}<small>/100</small></div>
        <div class="note">${delta == null ? 'erste Version' : `${delta > 0 ? '+' : ''}${delta} gegenüber der Vorversion`}</div>
      </div>
      <div class="stat">
        <div class="label">Tests</div>
        <div class="value">${tests.passed}<small>/${tests.total}</small></div>
        <div class="note">${tests.failed} fehlgeschlagen</div>
      </div>
      <div class="stat">
        <div class="label">Befunde</div>
        <div class="value">${report.findings.length}</div>
        <div class="note">${counts.CRITICAL + counts.HIGH} davon kritisch oder hoch</div>
      </div>
    </div>`;

  const sevChips = `
    <div class="sev-summary">
      ${SEVERITIES.map((sev) => `
        <span class="sev-chip ${counts[sev] ? '' : 'is-zero'}" data-sev="${sev}">
          <span class="dot" aria-hidden="true"></span>
          <span>${SEVERITY_LABELS[sev]}</span>
          <span class="count">${counts[sev]}</span>
        </span>`).join('')}
    </div>`;

  const findingsHtml = report.findings.length
    ? SEVERITIES.flatMap((sev) => report.findings.filter((f) => f.severity === sev)).map((f) => `
        <details class="finding">
          <summary>
            <span class="sev-badge" data-sev="${esc(f.severity)}">${SEVERITY_LABELS[f.severity] || esc(f.severity)}</span>
            <span class="headline">${esc(f.problem)}</span>
            <span class="area">${esc(f.area || '')}</span>
          </summary>
          <div class="finding-body">
            <dl>
              ${f.location ? `<dt>Fundstelle</dt><dd class="where">${esc(f.location)}</dd>` : ''}
              ${f.context ? `<dt>Kontext</dt><dd>${esc(f.context)}</dd>` : ''}
              ${f.cause ? `<dt>Ursache</dt><dd>${esc(f.cause)}</dd>` : ''}
              ${f.impact ? `<dt>Auswirkung</dt><dd>${esc(f.impact)}</dd>` : ''}
              ${f.improvement_direction ? `<dt>Richtung</dt><dd>${esc(f.improvement_direction)}</dd>` : ''}
              ${f.watch_for ? `<dt>Zu beachten</dt><dd>${esc(f.watch_for)}</dd>` : ''}
            </dl>
          </div>
        </details>`).join('')
    : '<p class="hint">Keine Befunde — dieser Skill ist durch alle Prüfungen gekommen.</p>';

  const testsHtml = (report.tests || []).length
    ? report.tests.map((t) => `
        <div class="test-row" data-passed="${t.passed}">
          <span class="test-mark" aria-hidden="true">${t.passed ? '✓' : '✕'}</span>
          <span class="id">${esc(t.test_id)}<span class="sr-only">${t.passed ? ' bestanden' : ' fehlgeschlagen'}</span></span>
          <span class="detail">${esc(t.detail || '')}</span>
        </div>`).join('')
    : '<p class="hint">Keine Testergebnisse gespeichert.</p>';

  const trend = trendChart(s.trend);

  return `${head}${stats}
    <div class="card">
      <div class="card-head"><h2>Bewertungskriterien</h2><span class="hint">0–100 Punkte</span></div>
      ${metricBars(s.scores || {})}
    </div>
    ${trend ? `<div class="card"><div class="card-head"><h2>Score-Verlauf</h2><span class="hint">${s.trend.length} Versionen</span></div>${trend}</div>` : ''}
    <div class="card">
      <div class="card-head"><h2>Befunde</h2></div>
      ${sevChips}
      <div style="margin-top:14px">${findingsHtml}</div>
    </div>
    <div class="card">
      <div class="card-head"><h2>Tests</h2><span class="hint">${tests.passed}/${tests.total} bestanden</span></div>
      ${testsHtml}
    </div>`;
}

/* ------------------------------------------------------------ rendering */

function renderSidebar() {
  const query = $('search').value.trim().toLowerCase();
  const filter = document.querySelector('.chip.is-active').dataset.filter;

  const visible = state.skills.filter((s) => {
    if (filter === 'evaluated' && !s.evaluated) return false;
    if (filter === 'pending' && s.evaluated) return false;
    if (query && !s.skillName.toLowerCase().includes(query) && !s.skillPath.toLowerCase().includes(query)) return false;
    return true;
  });

  $('sidebar-empty').hidden = visible.length > 0;
  $('skill-list').innerHTML = visible.map((s) => {
    const score = s.evaluated ? s.summary.overall : null;
    return `<li>
      <button class="skill-item" type="button" data-id="${esc(s.id)}" ${s.id === selectedId ? 'aria-current="true"' : ''}>
        <span style="min-width:0">
          <span class="name">${esc(s.skillName)}</span><br>
          <span class="sub">${s.evaluated ? `${s.summary.problemCount ?? 0} Befunde` : 'nicht bewertet'}</span>
        </span>
        <span class="score-pill ${score == null ? 'is-empty' : ''}" data-band="${band(score)}">${score == null ? '–' : score}</span>
      </button>
    </li>`;
  }).join('');
}

async function renderMain() {
  const view = $('view');
  const entry = state.skills.find((s) => s.id === selectedId);

  if (!entry) {
    view.innerHTML = renderOverview();
    return;
  }

  let report = null;
  if (entry.evaluated) {
    if (!reportCache.has(entry.id)) {
      try {
        const res = await fetch(`/api/report?id=${encodeURIComponent(entry.id)}`);
        if (res.ok) reportCache.set(entry.id, await res.json());
      } catch { /* offline: fall through to the summary-only view */ }
    }
    report = reportCache.get(entry.id) || null;
  }

  view.innerHTML = renderDetail(entry, report);
  wireDetail(entry);
}

function wireDetail(entry) {
  const btn = $('run-btn');
  if (btn) btn.addEventListener('click', () => startRun(entry.id));

  const svg = document.querySelector('svg.trend');
  if (!svg) return;
  const crosshair = svg.querySelector('.crosshair');
  svg.querySelectorAll('.hit').forEach((hit) => {
    hit.addEventListener('mousemove', (event) => {
      const cx = hit.dataset.cx;
      crosshair.setAttribute('x1', cx);
      crosshair.setAttribute('x2', cx);
      crosshair.style.display = '';
      showTooltip(
        `<div class="t-value">${esc(hit.dataset.score)} / 100</div>
         <div class="t-meta">Version ${esc(hit.dataset.version)}</div>
         <div class="t-meta">${esc(hit.dataset.when)}</div>`,
        event
      );
    });
  });
  svg.addEventListener('mouseleave', () => {
    crosshair.style.display = 'none';
    hideTooltip();
  });
}

async function refreshState({ keepReports = false } = {}) {
  const res = await fetch('/api/state');
  state = await res.json();
  if (!keepReports) reportCache.clear();
  $('roots').textContent = state.roots.join('  ·  ');
  if (selectedId && !state.skills.some((s) => s.id === selectedId)) selectedId = null;
  renderSidebar();
  await renderMain();
}

/* ------------------------------------------------------------- running */

let currentRunPath = null;

async function startRun(id) {
  logLine(null, 'meta');
  try {
    const res = await fetch('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      logLine(payload.error || `Start fehlgeschlagen (HTTP ${res.status})`, 'err');
      openConsole();
    }
  } catch (err) {
    logLine(`Server nicht erreichbar: ${err.message}`, 'err');
    openConsole();
  }
}

function logLine(text, cls) {
  const body = $('console-body');
  if (text == null) {
    body.textContent = '';
    return;
  }
  const span = document.createElement('span');
  if (cls) span.className = cls;
  span.textContent = text.endsWith('\n') ? text : `${text}\n`;
  body.appendChild(span);
  body.scrollTop = body.scrollHeight;
}

function openConsole() {
  $('console').dataset.open = 'true';
  $('console-toggle').setAttribute('aria-expanded', 'true');
}

function setBusy(value, label) {
  busy = value;
  $('conn').dataset.state = value ? 'busy' : 'live';
  $('conn-label').textContent = value ? 'Evaluation läuft' : 'verbunden';
  $('console-status').textContent = label;
  const btn = $('run-btn');
  if (btn) btn.disabled = value;
}

/* --------------------------------------------------------------- events */

function connectEvents() {
  const source = new EventSource('/api/events');

  source.addEventListener('open', () => {
    $('conn').dataset.state = 'live';
    $('conn-label').textContent = 'verbunden';
  });

  source.addEventListener('message', async (event) => {
    let data;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }

    if (data.type === 'connected') {
      $('conn').dataset.state = data.busy ? 'busy' : 'live';
      $('conn-label').textContent = data.busy ? 'Evaluation läuft' : 'verbunden';
    } else if (data.type === 'run-started') {
      currentRunPath = data.skillPath;
      setBusy(true, 'läuft …');
      openConsole();
      logLine(`▸ Evaluation gestartet: ${data.skillPath}`, 'meta');
      await renderMain();
    } else if (data.type === 'run-output') {
      logLine(data.text, data.stream === 'stderr' ? 'err' : null);
    } else if (data.type === 'run-finished') {
      currentRunPath = null;
      setBusy(false, data.ok ? 'fertig' : `fehlgeschlagen (Exit ${data.exitCode})`);
      logLine(data.ok ? '▸ Fertig.' : `▸ Abgebrochen mit Exit-Code ${data.exitCode}.`, data.ok ? 'ok' : 'err');
    } else if (data.type === 'state-changed') {
      await refreshState();
    }
  });

  source.addEventListener('error', () => {
    $('conn').dataset.state = 'lost';
    $('conn-label').textContent = 'Verbindung verloren';
  });
}

/* ------------------------------------------------------------------ init */

function initTheme() {
  const stored = (() => {
    try { return localStorage.getItem('skill-evaluator-theme'); } catch { return null; }
  })();
  if (stored === 'light' || stored === 'dark') document.documentElement.dataset.theme = stored;

  $('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.dataset.theme
      || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('skill-evaluator-theme', next); } catch { /* private mode */ }
  });
}

function initUi() {
  initTheme();

  $('search').addEventListener('input', renderSidebar);

  document.querySelectorAll('.chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      renderSidebar();
    });
  });

  $('skill-list').addEventListener('click', async (event) => {
    const button = event.target.closest('.skill-item');
    if (!button) return;
    selectedId = button.dataset.id;
    renderSidebar();
    await renderMain();
  });

  $('console-toggle').addEventListener('click', () => {
    const drawer = $('console');
    const open = drawer.dataset.open !== 'true';
    drawer.dataset.open = String(open);
    $('console-toggle').setAttribute('aria-expanded', String(open));
  });
}

initUi();
refreshState().then(connectEvents).catch((err) => {
  $('view').innerHTML = `<div class="card"><div class="empty"><h3>Server nicht erreichbar</h3><p>${esc(err.message)}</p></div></div>`;
});
