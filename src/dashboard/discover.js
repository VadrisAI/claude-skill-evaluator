'use strict';

const fs = require('fs');
const path = require('path');

const IGNORED_ENTRIES = new Set(['.git', 'node_modules', '.DS_Store']);

/**
 * Recursively finds every `skill-evaluation/` output directory (as produced
 * by src/report's generateReport()) under the given root paths, identified
 * by containing a `scores.json`. A root path that is itself already a
 * `skill-evaluation` directory (or a direct parent of one) is handled the
 * same way as a directory several levels up containing many of them.
 *
 * Symlinks are not followed, to avoid cycles — same rule as src/analyzer's
 * discovery walk.
 */
function findEvaluationDirs(rootPaths) {
  const roots = (Array.isArray(rootPaths) ? rootPaths : [rootPaths]).map((p) => path.resolve(p));
  const found = new Set();

  for (const root of roots) {
    walk(root, found);
  }

  return [...found].sort();
}

function walk(dir, found) {
  const stat = safeLstat(dir);
  if (!stat || stat.isSymbolicLink()) return;

  if (stat.isFile()) return;
  if (!stat.isDirectory()) return;

  if (path.basename(dir) === 'skill-evaluation' && fs.existsSync(path.join(dir, 'scores.json'))) {
    found.add(dir);
    return; // don't descend into a found evaluation dir's own history/ subfolder
  }

  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (IGNORED_ENTRIES.has(entry)) continue;
    walk(path.join(dir, entry), found);
  }
}

function safeLstat(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

module.exports = { findEvaluationDirs };
