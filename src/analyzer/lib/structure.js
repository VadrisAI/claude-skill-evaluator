'use strict';

const { splitLines, extractHeadings, extractListItems } = require('./markdown');

const STEP_SECTION_RE = /\b(steps?|workflow|process|procedure|instructions)\b/i;
const DECISION_RE = /\b(if|when|unless|otherwise|else|depending on|in case)\b/i;
const FEEDBACK_RE = /\b(loop back|repeat until|go back to step|return to step|iterate|loop until)\b/i;
const RETRY_RE = /\b(retry|retries|try again|re-attempt|reattempt|up to \d+ times?)\b/i;
const FAILURE_RE = /\b(fail(?:s|ed|ure)?|error|fallback|abort|roll ?back)\b/i;
const KNOWN_TOOL_NAMES = /^(git|npm|npx|pip3?|python3?|node|bash|sh|curl|wget|docker|jq|grep|sed|awk|make|cargo|go|ruby|perl)$/i;

/**
 * Builds the "structure" object of the analyzer -> evaluation contract
 * (docs/architecture.md, section "1 -> 2"). Every extraction here is a
 * deterministic text/filesystem heuristic — no LLM call — so re-running the
 * analyzer on an unchanged skill always yields the same output.
 */
function buildStructure({ frontmatter, body, resources, tree, hasSkillMd, frontmatterOffset = 0 }) {
  const headings = extractHeadings(body);
  const listItems = extractListItems(body);
  const locate = (bodyLine) => `SKILL.md:${bodyLine + frontmatterOffset}`;

  const steps = extractSteps(listItems);
  const inputs = extractSection(body, headings, /input/i);
  const outputs = extractSection(body, headings, /output/i);

  return {
    has_skill_md: Boolean(hasSkillMd),
    resources,
    purpose: extractPurpose(frontmatter, body),
    instruction_count: listItems.length,
    step_count: steps.length,
    steps: steps.map((s) => ({
      id: s.id,
      description: s.text,
      location: locate(s.line),
      tools: s.tools,
      references_steps: s.referencesSteps,
    })),
    inputs,
    outputs,
    dependencies: extractDependencies(steps),
    tool_dependencies: extractToolDependencies({ frontmatter, body, tree }),
    decision_points: scanKeywordLines(body, DECISION_RE).map((r) => ({
      location: locate(r.line),
      condition: r.detail,
    })),
    feedback_loops: scanKeywordLines(body, FEEDBACK_RE).map((r) => ({ location: locate(r.line), detail: r.detail })),
    retry_mechanisms: scanKeywordLines(body, RETRY_RE).map((r) => ({ location: locate(r.line), detail: r.detail })),
    failure_handling: scanKeywordLines(body, FAILURE_RE).map((r) => ({ location: locate(r.line), detail: r.detail })),
  };
}

function extractPurpose(frontmatter, body) {
  if (frontmatter.description) return frontmatter.description;

  for (const line of splitLines(body)) {
    const trimmed = line.trim();
    if (!trimmed || /^#/.test(trimmed) || /^```/.test(trimmed)) continue;
    return trimmed;
  }
  return null;
}

function extractSection(body, headings, namePattern) {
  const target = headings.find((h) => namePattern.test(h.text.trim()));
  if (!target) return [];

  const lines = splitLines(body);
  const nextHeading = headings.find((h) => h.line > target.line && h.level <= target.level);
  const endLineExclusive = nextHeading ? nextHeading.line - 1 : lines.length;

  const items = [];
  for (let i = target.line; i < endLineExclusive; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const listMatch = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (listMatch) {
      items.push(listMatch[1].trim());
    } else if (line.trim()) {
      items.push(line.trim());
    }
  }
  return items;
}

/**
 * A skill's main step sequence is heuristically identified as the ordered,
 * top-level (non-nested) list under a heading that reads like "Steps",
 * "Workflow", "Process", etc. Falls back to the largest ordered top-level
 * list in the document when no such heading exists.
 */
function extractSteps(listItems) {
  const orderedTop = listItems.filter((li) => li.ordered && li.depth === 0);
  if (orderedTop.length === 0) return [];

  const groups = new Map();
  for (const item of orderedTop) {
    const key = item.section || '__root__';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }

  let chosen = null;
  for (const [section, items] of groups) {
    if (section !== '__root__' && STEP_SECTION_RE.test(section)) {
      if (!chosen || items.length > chosen.length) chosen = items;
    }
  }
  if (!chosen) {
    for (const items of groups.values()) {
      if (!chosen || items.length > chosen.length) chosen = items;
    }
  }

  return chosen.map((item, idx) => {
    const id = idx + 1;
    const refs = [...item.text.matchAll(/\bstep\s+(\d+)\b/gi)]
      .map((m) => Number(m[1]))
      .filter((n) => n !== id);
    const tools = [...item.text.matchAll(/`([^`\n]+)`/g)]
      .map((m) => m[1].trim())
      .filter(looksLikeTool);

    return {
      id,
      text: item.text,
      line: item.line,
      referencesSteps: [...new Set(refs)],
      tools: [...new Set(tools)],
    };
  });
}

function extractDependencies(steps) {
  const deps = [];
  for (const step of steps) {
    for (const ref of step.referencesSteps) {
      deps.push({ from_step: ref, to_step: step.id, detail: `Step ${step.id} references step ${ref}` });
    }
  }
  return deps;
}

function extractToolDependencies({ frontmatter, body, tree }) {
  const tools = new Set();

  const declared = frontmatter['allowed-tools'] || frontmatter['tools'] || frontmatter['allowed_tools'];
  if (declared) {
    const list = Array.isArray(declared) ? declared : String(declared).split(',');
    list.map((t) => t.trim()).filter(Boolean).forEach((t) => tools.add(t));
  }

  for (const match of body.matchAll(/`([^`\n]+)`/g)) {
    const value = match[1].trim();
    if (looksLikeTool(value)) tools.add(value);
  }

  for (const file of collectFiles(tree)) {
    if (/^scripts[/\\]/.test(file.path) || /\.(py|sh|js|ts|rb)$/i.test(file.path)) {
      tools.add(file.path.replace(/\\/g, '/'));
    }
  }

  return [...tools].sort();
}

function collectFiles(tree, acc = []) {
  for (const node of tree || []) {
    if (node.type === 'file') acc.push(node);
    else collectFiles(node.children, acc);
  }
  return acc;
}

function looksLikeTool(value) {
  if (!value || value.includes(' ') && !value.includes('/')) {
    // multi-word backticked spans are usually prose emphasis, not a tool name,
    // unless they look like a path (contains a slash).
    if (!value.includes('/')) return false;
  }
  return value.includes('/') || /\.[a-z0-9]{1,4}$/i.test(value) || KNOWN_TOOL_NAMES.test(value);
}

function scanKeywordLines(body, regex) {
  const lines = splitLines(body);
  const results = [];
  let inFence = false;

  lines.forEach((line, idx) => {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const trimmed = line.trim();
    if (!trimmed || /^#/.test(trimmed)) return;
    if (regex.test(trimmed)) {
      results.push({ line: idx + 1, detail: trimmed });
    }
  });

  return results;
}

module.exports = { buildStructure };
