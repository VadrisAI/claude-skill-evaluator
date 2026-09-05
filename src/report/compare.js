'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Version comparison — spec.md "Vorher-/Nachher-Vergleich":
 * compares scores between evaluation runs of the same skill's version
 * history (skill-evaluation/history/evaluation-vN.json) and must make
 * regressions just as visible as improvements.
 */

const HISTORY_FILE_RE = /^evaluation-v(\d+)\.json$/;

function historyDir(outputDir) {
  return path.join(outputDir, 'history');
}

/**
 * Lists existing history entries as { n, file, path } sorted ascending by n.
 */
function listHistory(outputDir) {
  const dir = historyDir(outputDir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .map((file) => {
      const m = HISTORY_FILE_RE.exec(file);
      return m ? { n: Number(m[1]), file, path: path.join(dir, file) } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.n - b.n);
}

/**
 * Reads the most recent history entry (highest vN), if any.
 *
 * When `skillPath` is given, only entries whose stored `skill_path` matches
 * are considered — a `history/` directory can end up holding entries for
 * more than one skill (e.g. a shared/default `--out` dir reused across
 * evaluations), and without this filter the "previous version" picked for
 * comparison could silently belong to a different skill entirely. Pass no
 * `skillPath` only when you deliberately want the latest entry regardless
 * of which skill it belongs to.
 */
function readLatestHistory(outputDir, skillPath) {
  const entries = listHistory(outputDir);
  for (let i = entries.length - 1; i >= 0; i--) {
    const data = JSON.parse(fs.readFileSync(entries[i].path, 'utf8'));
    if (skillPath === undefined || data.skill_path === skillPath) {
      return data;
    }
  }
  return null;
}

/**
 * Counts existing history entries for `skillPath` and returns the label for
 * the next one (e.g. "v3"), for use as a default `version` when the caller
 * didn't supply one. Scoped per skill for the same reason as
 * readLatestHistory: the raw file-sequence number (evaluation-vN.json) can
 * span multiple skills sharing one output directory.
 */
function nextVersionLabel(outputDir, skillPath) {
  const entries = listHistory(outputDir);
  let count = 0;
  for (const entry of entries) {
    const data = JSON.parse(fs.readFileSync(entry.path, 'utf8'));
    if (skillPath === undefined || data.skill_path === skillPath) count += 1;
  }
  return `v${count + 1}`;
}

/**
 * Writes the current scoring result as the next evaluation-vN.json entry.
 * Returns the entry's { n, file, path }.
 */
function writeHistoryEntry(outputDir, scoringResult) {
  const dir = historyDir(outputDir);
  fs.mkdirSync(dir, { recursive: true });
  const entries = listHistory(outputDir);
  const n = entries.length === 0 ? 1 : entries[entries.length - 1].n + 1;
  const file = `evaluation-v${n}.json`;
  const dest = path.join(dir, file);
  fs.writeFileSync(dest, JSON.stringify(scoringResult, null, 2) + '\n', 'utf8');
  return { n, file, path: dest };
}

/**
 * Computes a per-metric delta table between current and previous scores.
 * Every metric present in either version is included — a metric that
 * disappeared (no longer applicable) or newly appeared is called out
 * explicitly rather than silently dropped, since that is itself a
 * structural change worth surfacing.
 */
function compareScores(currentScores, previousScores) {
  if (!previousScores) return null;

  const keys = new Set([...Object.keys(currentScores), ...Object.keys(previousScores)]);
  const rows = [];
  for (const key of keys) {
    const before = Object.prototype.hasOwnProperty.call(previousScores, key)
      ? previousScores[key]
      : null;
    const after = Object.prototype.hasOwnProperty.call(currentScores, key)
      ? currentScores[key]
      : null;
    const delta = before !== null && after !== null ? after - before : null;
    let status;
    if (before === null) status = 'new_metric';
    else if (after === null) status = 'metric_dropped';
    else if (delta > 0) status = 'improved';
    else if (delta < 0) status = 'regressed';
    else status = 'unchanged';

    rows.push({ metric: key, before, after, delta, status });
  }

  // Sort: overall first, then by metric name for stable, readable output.
  rows.sort((a, b) => {
    if (a.metric === 'overall') return -1;
    if (b.metric === 'overall') return 1;
    return a.metric.localeCompare(b.metric);
  });

  const regressions = rows.filter((r) => r.status === 'regressed');
  const improvements = rows.filter((r) => r.status === 'improved');

  return {
    rows,
    has_regressions: regressions.length > 0,
    regressions,
    improvements,
  };
}

module.exports = {
  listHistory,
  readLatestHistory,
  nextVersionLabel,
  writeHistoryEntry,
  compareScores,
  historyDir,
};
