'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { findEvaluationDirs } = require('../dashboard/discover');
const { collectSkillSummary } = require('../dashboard/collect');

const IGNORED_ENTRIES = new Set(['.git', 'node_modules', '.DS_Store', 'skill-evaluation']);

// The walk depth that src/analyzer/lib/discovery.js settled on after the
// corpus pass. Kept in sync deliberately: a skill the analyzer can find but
// the UI cannot list would be invisible in the interface.
const MAX_DEPTH = 8;

/**
 * Finds every directory containing a SKILL.md under the given roots — the
 * set of skills that *can* be evaluated, as opposed to the set that already
 * has been (src/dashboard/discover.js's job).
 *
 * Symlinks are not followed, matching the analyzer's and the dashboard's
 * discovery rules.
 */
function findSkillDirs(rootPaths) {
  const roots = (Array.isArray(rootPaths) ? rootPaths : [rootPaths]).map((p) => path.resolve(p));
  const found = new Set();
  for (const root of roots) walk(root, found, 0);
  return [...found].sort();
}

function walk(dir, found, depth) {
  if (depth > MAX_DEPTH) return;

  const stat = safeLstat(dir);
  if (!stat || stat.isSymbolicLink() || !stat.isDirectory()) return;

  if (fs.existsSync(path.join(dir, 'SKILL.md'))) {
    found.add(dir);
    // A skill's own references/ or scripts/ folder never contains a second
    // skill, so stop here rather than descending into bundled material.
    return;
  }

  let entries;
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (IGNORED_ENTRIES.has(entry)) continue;
    walk(path.join(dir, entry), found, depth + 1);
  }
}

function safeLstat(p) {
  try {
    return fs.lstatSync(p);
  } catch {
    return null;
  }
}

/**
 * A stable, opaque handle for one skill path.
 *
 * The client only ever sends these back — never a filesystem path — so the
 * server can look a request up in its own discovered inventory instead of
 * trusting, resolving, or sandboxing caller-supplied paths. See
 * docs/architecture.md, "Security boundaries".
 */
function skillId(skillPath) {
  return crypto.createHash('sha1').update(path.resolve(skillPath)).digest('hex').slice(0, 12);
}

/**
 * Builds the full inventory the UI renders: every skill found under the
 * roots, joined with its evaluation summary where one exists.
 *
 * A skill can appear because it has a SKILL.md, because it has a report, or
 * both — an evaluation written with `--out` elsewhere still shows up, and so
 * does a brand-new skill that has never been run.
 */
function buildState(rootPaths) {
  const roots = (Array.isArray(rootPaths) ? rootPaths : [rootPaths]).map((p) => path.resolve(p));

  const byPath = new Map();

  for (const skillPath of findSkillDirs(roots)) {
    byPath.set(skillPath, {
      id: skillId(skillPath),
      skillPath,
      skillName: path.basename(skillPath),
      evaluated: false,
      summary: null,
    });
  }

  for (const evalDir of findEvaluationDirs(roots)) {
    const summary = collectSkillSummary(evalDir);
    if (!summary) continue;
    const skillPath = path.resolve(summary.skillPath || path.dirname(evalDir));
    const existing = byPath.get(skillPath);
    if (existing) {
      existing.evaluated = true;
      existing.summary = summary;
    } else {
      byPath.set(skillPath, {
        id: skillId(skillPath),
        skillPath,
        skillName: summary.skillName,
        evaluated: true,
        summary,
      });
    }
  }

  const skills = [...byPath.values()].sort((a, b) => a.skillName.localeCompare(b.skillName));
  return { roots, skills, generatedAt: new Date().toISOString() };
}

module.exports = { findSkillDirs, buildState, skillId };
