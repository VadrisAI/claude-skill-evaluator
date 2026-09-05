'use strict';

/**
 * PLACEHOLDER IMPLEMENTATION — Module 1 (Structure & Complexity Analyzer) owns this file.
 *
 * This is a minimal fixture so the plugin/command wiring (Module 4) can be built and tested
 * end-to-end before the real analyzer lands. It implements just enough of the "1 -> 2" contract
 * from docs/architecture.md to be replaced, wholesale, by the real module via its own PR.
 *
 * Contract (docs/architecture.md, "1 -> 2: Analyzer output -> Evaluation input"):
 * {
 *   skill_path, structure: { has_skill_md, resources, instruction_count, step_count,
 *     dependencies, tool_dependencies, decision_points, feedback_loops, failure_handling },
 *   complexity_class: "simple" | "multi_step_process",
 *   complexity_signals: [string]
 * }
 */

const fs = require('fs');
const path = require('path');

const RESOURCE_DIRS = ['references', 'scripts', 'assets'];
const PROCESS_KEYWORDS = ['step 1', 'step 2', 'then ', 'first,', 'next,', 'finally,', 'retry', 'if ', 'loop', 'feedback'];

function listResourceDirs(skillPath) {
  return RESOURCE_DIRS.filter((dir) => fs.existsSync(path.join(skillPath, dir)));
}

function readSkillMd(skillPath) {
  const skillMdPath = path.join(skillPath, 'SKILL.md');
  if (!fs.existsSync(skillMdPath)) return null;
  return fs.readFileSync(skillMdPath, 'utf8');
}

/**
 * Very naive heuristic complexity signal, only good enough to exercise the pipeline.
 * The real analyzer (Module 1) replaces this with actual structural parsing.
 */
function detectComplexity(skillMdContent) {
  if (!skillMdContent) {
    return { complexity_class: 'simple', complexity_signals: ['no SKILL.md found to analyze'] };
  }
  const lower = skillMdContent.toLowerCase();
  const stepCount = (lower.match(/^\s*\d+[.)]\s/gm) || []).length;
  const keywordHits = PROCESS_KEYWORDS.filter((kw) => lower.includes(kw));
  const isMultiStep = stepCount >= 3 || keywordHits.length >= 2;
  return {
    complexity_class: isMultiStep ? 'multi_step_process' : 'simple',
    complexity_signals: isMultiStep
      ? [`detected ${stepCount} numbered steps`, `process keywords present: ${keywordHits.join(', ') || 'none'}`]
      : ['no strong multi-step process signals detected (placeholder heuristic)'],
    stepCount,
  };
}

/**
 * @param {string} skillPath absolute or relative path to the skill directory
 * @returns {object} analyzer output matching the 1 -> 2 contract
 */
function analyzeSkill(skillPath) {
  const resolvedPath = path.resolve(skillPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Skill path does not exist: ${resolvedPath}`);
  }

  const skillMdContent = readSkillMd(resolvedPath);
  const resources = listResourceDirs(resolvedPath);
  const { complexity_class, complexity_signals, stepCount } = detectComplexity(skillMdContent);

  return {
    skill_path: resolvedPath,
    structure: {
      has_skill_md: skillMdContent !== null,
      resources,
      instruction_count: skillMdContent ? skillMdContent.split(/\n{2,}/).length : 0,
      step_count: stepCount || 0,
      dependencies: [],
      tool_dependencies: [],
      decision_points: [],
      feedback_loops: [],
      failure_handling: [],
    },
    complexity_class,
    complexity_signals: [
      ...complexity_signals,
      'NOTE: produced by the Module 4 placeholder analyzer fixture, not the real Structure & Complexity Analyzer.',
    ],
  };
}

module.exports = { analyzeSkill };
