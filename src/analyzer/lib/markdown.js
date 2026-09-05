'use strict';

/**
 * Minimal, dependency-free markdown scanning helpers.
 * These are deliberately heuristic (line-based regex), not a full CommonMark
 * parser — enough to locate headings, list items, and code fences with a
 * 1-based line number for reporting "location" back to Module 2.
 */

function splitLines(body) {
  return body.split(/\r?\n/);
}

function extractHeadings(body) {
  const headings = [];
  splitLines(body).forEach((line, idx) => {
    const match = /^(#{1,6})\s+(.*)$/.exec(line);
    if (match) {
      headings.push({ level: match[1].length, text: match[2].trim(), line: idx + 1 });
    }
  });
  return headings;
}

/**
 * Returns every list item (ordered or unordered) with its nesting depth
 * (in indentation units of 2 spaces), 1-based line number, and the heading
 * (if any) it falls under — useful for grouping "steps" that live under a
 * "## Workflow" / "## Steps" section.
 */
function extractListItems(body) {
  const lines = splitLines(body);
  const headings = extractHeadings(body);
  const items = [];

  lines.forEach((line, idx) => {
    const ordered = /^(\s*)(\d+)[.)]\s+(.*)$/.exec(line);
    const unordered = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    const m = ordered || unordered;
    if (!m) return;

    const indent = m[1].length;
    const text = ordered ? m[3].trim() : m[2].trim();
    const lineNumber = idx + 1;
    const heading = [...headings].reverse().find((h) => h.line < lineNumber);

    items.push({
      ordered: Boolean(ordered),
      depth: Math.floor(indent / 2),
      text,
      line: lineNumber,
      section: heading ? heading.text : null,
    });
  });

  return items;
}

function extractCodeBlocks(body) {
  const lines = splitLines(body);
  const blocks = [];
  let open = null;

  lines.forEach((line, idx) => {
    const fence = /^```\s*([A-Za-z0-9_+-]*)\s*$/.exec(line);
    if (fence) {
      if (open) {
        blocks.push({ ...open, endLine: idx + 1, content: lines.slice(open.startLine, idx).join('\n') });
        open = null;
      } else {
        open = { lang: fence[1] || null, startLine: idx + 1 };
      }
    }
  });

  return blocks;
}

module.exports = { splitLines, extractHeadings, extractListItems, extractCodeBlocks };
