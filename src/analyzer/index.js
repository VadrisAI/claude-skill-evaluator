'use strict';

const { discoverSkill } = require('./lib/discovery');
const { parseFrontmatter } = require('./lib/frontmatter');
const { buildStructure } = require('./lib/structure');
const { classifyComplexity } = require('./lib/complexity');

/**
 * Analyzes an existing Claude skill (a directory containing SKILL.md, or a
 * direct path to a SKILL.md file) and returns the Module 1 -> Module 2
 * contract object documented in docs/architecture.md.
 *
 * This module only reads and classifies — it never writes to the skill
 * being analyzed (see spec.md's non-goals).
 */
function analyzeSkill(skillPath) {
  const discovery = discoverSkill(skillPath);
  const { frontmatter, body } = parseFrontmatter(discovery.skillMdContent || '');

  const structure = buildStructure({
    frontmatter,
    body,
    resources: discovery.resources,
    tree: discovery.tree,
    hasSkillMd: discovery.hasSkillMd,
  });

  const { complexity_class, complexity_signals } = classifyComplexity(structure);

  return {
    skill_path: discovery.skillDir,
    structure,
    complexity_class,
    complexity_signals,
  };
}

module.exports = { analyzeSkill };
