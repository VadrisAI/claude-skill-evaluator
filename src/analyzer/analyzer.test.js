'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { analyzeSkill } = require('./index');

const FIXTURES = path.join(__dirname, '..', '..', 'fixtures');
const SIMPLE_SKILL = path.join(FIXTURES, 'simple-skill');
const MULTI_STEP_SKILL = path.join(FIXTURES, 'multi-step-skill');

test('simple skill: discovers SKILL.md and classifies as simple', () => {
  const result = analyzeSkill(SIMPLE_SKILL);

  assert.equal(result.structure.has_skill_md, true);
  assert.equal(result.structure.purpose, 'Counts words, characters, and sentences in a block of text the user provides.');
  assert.equal(result.complexity_class, 'simple');
  assert.ok(result.complexity_signals.length > 0);
  assert.equal(result.structure.step_count, 0);
  assert.deepEqual(result.structure.dependencies, []);
  assert.deepEqual(result.structure.resources, []);
});

test('simple skill: still extracts its bullet instructions as instruction_count', () => {
  const result = analyzeSkill(SIMPLE_SKILL);
  assert.ok(result.structure.instruction_count >= 4, `expected >= 4 instructions, got ${result.structure.instruction_count}`);
});

test('multi-step skill: discovers full directory structure, not just SKILL.md', () => {
  const result = analyzeSkill(MULTI_STEP_SKILL);

  assert.equal(result.structure.has_skill_md, true);
  assert.deepEqual(result.structure.resources, ['assets/', 'references/', 'scripts/']);
});

test('multi-step skill: extracts ordered workflow steps in order', () => {
  const result = analyzeSkill(MULTI_STEP_SKILL);

  assert.equal(result.structure.step_count, 7);
  assert.equal(result.structure.steps[0].id, 1);
  assert.match(result.structure.steps[0].description, /extract\.py/);
  assert.equal(result.structure.steps[6].id, 7);
});

test('multi-step skill: detects tool dependencies from scripts/ and inline code spans', () => {
  const result = analyzeSkill(MULTI_STEP_SKILL);

  assert.ok(result.structure.tool_dependencies.includes('scripts/extract.py'));
  assert.ok(result.structure.tool_dependencies.includes('scripts/render.py'));
});

test('multi-step skill: detects decision points, retries, feedback loops, and failure handling', () => {
  const result = analyzeSkill(MULTI_STEP_SKILL);

  assert.ok(result.structure.decision_points.length > 0, 'expected at least one decision point');
  assert.ok(result.structure.retry_mechanisms.length > 0, 'expected at least one retry mechanism');
  assert.ok(result.structure.feedback_loops.length > 0, 'expected at least one feedback loop');
  assert.ok(result.structure.failure_handling.length > 0, 'expected at least one failure handling indicator');
});

test('multi-step skill: extracts explicit step-to-step dependencies from "step N" references', () => {
  const result = analyzeSkill(MULTI_STEP_SKILL);

  const dep = result.structure.dependencies.find((d) => d.to_step === 4 && d.from_step === 1);
  assert.ok(dep, 'expected step 4 to depend on step 1 (references "row count from step 1")');
});

test('multi-step skill: extracts inputs and outputs sections', () => {
  const result = analyzeSkill(MULTI_STEP_SKILL);

  assert.ok(result.structure.inputs.length >= 2);
  assert.ok(result.structure.outputs.some((o) => /report\.md/.test(o)));
  assert.ok(result.structure.outputs.some((o) => /report\.json/.test(o)));
});

test('multi-step skill: classifies as multi_step_process with supporting signals', () => {
  const result = analyzeSkill(MULTI_STEP_SKILL);

  assert.equal(result.complexity_class, 'multi_step_process');
  assert.ok(result.complexity_signals.length >= 2);
});

test('throws a clear error for a non-existent path', () => {
  assert.throws(() => analyzeSkill(path.join(FIXTURES, 'does-not-exist')), /does not exist/);
});

test('output shape matches the documented analyzer -> evaluation contract', () => {
  const result = analyzeSkill(SIMPLE_SKILL);

  assert.equal(typeof result.skill_path, 'string');
  assert.equal(typeof result.structure, 'object');
  assert.ok(['simple', 'multi_step_process'].includes(result.complexity_class));
  assert.ok(Array.isArray(result.complexity_signals));

  const s = result.structure;
  for (const key of [
    'has_skill_md', 'resources', 'purpose', 'instruction_count', 'step_count', 'steps',
    'inputs', 'outputs', 'dependencies', 'tool_dependencies', 'decision_points',
    'feedback_loops', 'retry_mechanisms', 'failure_handling',
  ]) {
    assert.ok(key in s, `structure is missing contract field "${key}"`);
  }
});
