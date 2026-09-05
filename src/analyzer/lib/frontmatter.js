'use strict';

/**
 * Splits a SKILL.md file into YAML-ish frontmatter and body.
 * Only supports the flat scalar/list subset of YAML that Claude Skill
 * frontmatter actually uses (name, description, allowed-tools, etc.) —
 * intentionally not a full YAML parser to keep this module dependency-free.
 */
function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) {
    return { frontmatter: {}, body: raw, offset: 0 };
  }

  const [, rawFrontmatter, body] = match;
  // Lines consumed by the frontmatter block (delimiters included) before
  // `body` starts, so callers can map a body-relative line number back to
  // its physical line in the original SKILL.md.
  const offset = (raw.slice(0, raw.length - body.length).match(/\n/g) || []).length;
  const frontmatter = {};
  const lines = rawFrontmatter.split(/\r?\n/);
  let currentKey = null;

  for (const line of lines) {
    if (/^\s*#/.test(line) || line.trim() === '') continue;

    const listItem = /^\s*-\s+(.*)$/.exec(line);
    if (listItem && currentKey) {
      if (!Array.isArray(frontmatter[currentKey])) {
        frontmatter[currentKey] = [];
      }
      frontmatter[currentKey].push(stripQuotes(listItem[1].trim()));
      continue;
    }

    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (kv) {
      const [, key, value] = kv;
      currentKey = key;
      if (value.trim() === '') {
        frontmatter[key] = null; // may be filled by following list items
      } else {
        frontmatter[key] = stripQuotes(value.trim());
      }
    }
  }

  return { frontmatter, body, offset };
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

module.exports = { parseFrontmatter };
