'use strict';

const { splitLines, extractHeadings, extractListItems } = require('./markdown');

const STEP_SECTION_RE = /\b(steps?|workflow|process|procedure|instructions)\b/i;
const DECISION_RE = /\b(if|when|unless|otherwise|else|depending on|in case)\b/i;
const FEEDBACK_RE = /\b(loop back|repeat until|go back to step|return to step|iterate|loop until)\b/i;
const RETRY_RE = /\b(retry|retries|try again|re-attempt|reattempt|up to \d+ times?)\b/i;
const FAILURE_RE = /\b(fail(?:s|ed|ure)?|error|fallback|abort|roll ?back)\b/i;
const KNOWN_TOOL_NAMES = /^(git|npm|npx|pip3?|python3?|node|bash|sh|curl|wget|docker|jq|grep|sed|awk|make|cargo|go|ruby|perl)$/i;
const EXECUTABLE_EXT = /\.(py|sh|bash|zsh|js|mjs|cjs|ts|rb|pl|ps1)$/i;
const REFERENCED_FILE_EXT = /\.(md|json|ya?ml|xml|xsd|csv|tsv|txt|html?|css|svg|png|jpe?g|gif|pdf|docx?|xlsx?|pptx?|toml|ini)$/i;

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

  const steps = extractSteps(listItems, headings, body);
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
    referenced_files: extractReferencedFiles({ body, tree }),
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
 * A skill's main step sequence, in priority order:
 *
 * 1. Explicit step headings ("## Step 1: ...", "### Phase 2 — ...").
 *    Strongest signal there is: the author numbered them themselves.
 * 2. Otherwise, the ordered top-level list under a "Steps"/"Workflow"/
 *    "Process"-style heading, else the largest ordered top-level list.
 *
 * Real-world skills overwhelmingly use form 1 or plain heading hierarchies;
 * an earlier version of this function only understood form 2 and therefore
 * reported step_count = 0 for most real skills (e.g. every skill under
 * /mnt/skills that structures its workflow as "## Step N:" headings). Note
 * that plain (non-numbered) sibling headings are deliberately NOT treated
 * as steps: "#### Merge PDFs" / "#### Split PDF" is a catalogue of
 * alternatives, not a sequence, and counting those as process steps is
 * what made almost every skill look like a multi-step process.
 */
function extractSteps(listItems, headings = [], body = '') {
  const headingSteps = extractStepHeadings(headings, body);
  if (headingSteps.length > 0) return headingSteps;

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

/**
 * Finds headings that explicitly number themselves as steps/phases, e.g.
 * "## Step 1: Extract Receipt Details" or "### Phase 2 — Review".
 * Sub-steps ("### 2a. Navigate", "### 2b. Fetch code") are folded into
 * their parent step rather than counted separately, so step_count stays
 * the number of top-level stages the author defined.
 */
function extractStepHeadings(headings, body = '') {
  const lines = splitLines(body);
  const matches = [];
  for (const h of headings) {
    const m = /^(?:step|phase|stage|schritt)\s*#?\s*(\d+)\s*[:.\-–—)]?\s*(.*)$/i.exec(h.text.trim());
    if (m) {
      matches.push({ number: Number(m[1]), title: m[2].trim() || h.text.trim(), heading: h });
    }
  }
  if (matches.length < 2) return []; // a lone "Step 1" isn't a sequence

  // Keep only the shallowest heading level in play, so "### 2a." style
  // sub-steps under "## Step 2:" don't inflate the count.
  const topLevel = Math.min(...matches.map((m) => m.heading.level));
  const topSteps = matches.filter((m) => m.heading.level === topLevel);

  const seen = new Set();
  const ordered = [];
  for (const m of topSteps) {
    if (seen.has(m.number)) continue; // duplicate "Step 2" headings: keep the first
    seen.add(m.number);
    ordered.push(m);
  }

  return ordered.map((m, idx) => {
    const id = idx + 1;
    const title = m.heading.text.trim();
    // A step's substance lives in the prose under its heading, not in the
    // heading text — that's where "the amount from step 1" or "return to
    // step 4" actually appear, so the section body has to be scanned too.
    const sectionText = sectionBody(lines, headings, m.heading);
    const searchText = `${title}\n${sectionText}`;

    const refs = [...searchText.matchAll(/\bstep\s+(\d+)\b/gi)]
      .map((x) => Number(x[1]))
      .filter((n) => n !== m.number);
    const tools = [...searchText.matchAll(/`([^`\n]+)`/g)].map((x) => x[1].trim()).filter(looksLikeTool);

    return {
      id,
      text: title,
      line: m.heading.line,
      referencesSteps: [...new Set(refs)],
      tools: [...new Set(tools)],
    };
  });
}

/**
 * The lines belonging to a heading's own section: everything until the next
 * heading at the same or a higher level.
 */
function sectionBody(lines, headings, heading) {
  const next = headings.find((h) => h.line > heading.line && h.level <= heading.level);
  const end = next ? next.line - 1 : lines.length;
  return lines.slice(heading.line, end).join('\n');
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
    if (EXECUTABLE_EXT.test(file.path)) {
      tools.add(file.path.replace(/\\/g, '/'));
    }
  }

  return [...tools].sort();
}

/**
 * Non-executable files the SKILL.md points at (references/*.md, schemas,
 * templates, data). Kept separate from tool_dependencies: a schema or
 * template a skill *reads* is not a tool it *runs*, and lumping them
 * together inflated tool_dependencies badly enough to distort complexity
 * classification (one real skill reported 77 "tools", of which only the
 * 17 .py scripts actually were any).
 */
function extractReferencedFiles({ body, tree }) {
  const files = new Set();

  for (const match of body.matchAll(/`([^`\n]+)`/g)) {
    const value = match[1].trim();
    if (looksLikeReferencedFile(value)) files.add(value);
  }

  for (const file of collectFiles(tree)) {
    const p = file.path.replace(/\\/g, '/');
    if (!EXECUTABLE_EXT.test(p) && p.toLowerCase() !== 'skill.md') files.add(p);
  }

  return [...files].sort();
}

function collectFiles(tree, acc = []) {
  for (const node of tree || []) {
    if (node.type === 'file') acc.push(node);
    else collectFiles(node.children, acc);
  }
  return acc;
}

/**
 * A "tool dependency" is something the skill RUNS: an executable script it
 * invokes, or a known command-line tool. Deliberately strict — an earlier,
 * looser version counted any backticked span with a dot in it, which swept
 * in XML tags (`<w:del/>`), code constants (`WidthType.DXA`), bare file
 * extensions (`.docx`) and dozens of schema files. Anything that is merely
 * referenced (data, schemas, templates, docs) belongs in referenced_files.
 */
function looksLikeTool(value) {
  const v = (value || '').trim();
  if (!v || v.length > 120) return false;
  if (/[<>{}()]/.test(v)) return false; // markup / code fragments, not tools
  if (v.startsWith('.')) return false; // a bare extension like ".docx"
  if (/\s/.test(v)) return false; // prose or a full command line, not a tool name
  return EXECUTABLE_EXT.test(v) || KNOWN_TOOL_NAMES.test(v);
}

function looksLikeReferencedFile(value) {
  const v = (value || '').trim();
  if (!v || v.length > 120) return false;
  if (/[<>{}()]/.test(v)) return false;
  if (v.startsWith('.')) return false;
  if (/\s/.test(v)) return false;
  if (EXECUTABLE_EXT.test(v)) return false; // that's a tool, not a plain reference
  return REFERENCED_FILE_EXT.test(v);
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
