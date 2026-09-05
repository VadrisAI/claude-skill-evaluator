'use strict';

const fs = require('fs');
const path = require('path');

const IGNORED_ENTRIES = new Set(['.git', 'node_modules', '.DS_Store']);

/**
 * Locates SKILL.md (case-insensitive) inside a skill directory, and walks
 * the full directory tree so downstream modules see the whole skill —
 * references/, scripts/, assets/, etc. — not just the SKILL.md text.
 */
function discoverSkill(skillPath) {
  const resolved = path.resolve(skillPath);
  const stat = safeStat(resolved);

  if (!stat) {
    throw new Error(`Skill path does not exist: ${skillPath}`);
  }

  let skillDir = resolved;
  let skillMdPath = null;

  if (stat.isFile()) {
    skillDir = path.dirname(resolved);
    skillMdPath = resolved;
  } else {
    const entries = fs.readdirSync(resolved);
    const match = entries.find((e) => e.toLowerCase() === 'skill.md');
    if (match) skillMdPath = path.join(resolved, match);
  }

  const tree = walk(skillDir, skillDir);
  const resources = topLevelResources(skillDir, skillMdPath);

  return {
    skillDir,
    skillMdPath,
    hasSkillMd: Boolean(skillMdPath && fs.existsSync(skillMdPath)),
    skillMdContent: skillMdPath && fs.existsSync(skillMdPath) ? fs.readFileSync(skillMdPath, 'utf8') : '',
    tree,
    resources,
  };
}

function topLevelResources(skillDir, skillMdPath) {
  const entries = fs.readdirSync(skillDir);
  const skillMdName = skillMdPath ? path.basename(skillMdPath) : null;

  return entries
    .filter((e) => !IGNORED_ENTRIES.has(e) && e !== skillMdName)
    .sort()
    .map((e) => {
      const full = path.join(skillDir, e);
      const isDir = safeStat(full)?.isDirectory();
      return isDir ? `${e}/` : e;
    });
}

function walk(dir, root, depth = 0, maxDepth = 6) {
  if (depth > maxDepth) return [];
  const entries = fs.readdirSync(dir);
  const result = [];

  for (const entry of entries) {
    if (IGNORED_ENTRIES.has(entry)) continue;
    const full = path.join(dir, entry);
    const stat = safeStat(full);
    if (!stat) continue;
    const relative = path.relative(root, full);

    if (stat.isDirectory()) {
      result.push({ type: 'dir', path: relative, children: walk(full, root, depth + 1, maxDepth) });
    } else {
      result.push({ type: 'file', path: relative, size: stat.size });
    }
  }

  return result;
}

function safeStat(p) {
  try {
    return fs.statSync(p);
  } catch {
    return null;
  }
}

module.exports = { discoverSkill };
