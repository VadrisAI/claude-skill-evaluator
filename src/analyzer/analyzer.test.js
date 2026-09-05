'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { analyzeSkill } = require('./index');

function makeTempSkill(skillMdContent, extraFiles = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'analyzer-test-'));
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skillMdContent);
  for (const [relPath, content] of Object.entries(extraFiles)) {
    const full = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

const FIXTURES = path.join(__dirname, '..', '..', 'fixtures');
const SIMPLE_SKILL = path.join(FIXTURES, 'simple-skill');
const MULTI_STEP_SKILL = path.join(FIXTURES, 'multi-step-skill');
// Fixtures modelled on how real skills are actually written (see the
// /mnt/skills corpus), added after the original fixtures turned out to be
// shaped exactly like the heuristics expected — which hid the fact that
// real skills matched almost none of them.
const CATALOG_SKILL = path.join(FIXTURES, 'catalog-skill');
const HEADING_STEPS_SKILL = path.join(FIXTURES, 'heading-steps-skill');

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

test('multi-step skill: step locations report the physical SKILL.md line, not the frontmatter-stripped offset', () => {
  const result = analyzeSkill(MULTI_STEP_SKILL);
  const physicalLine = fs
    .readFileSync(path.join(MULTI_STEP_SKILL, 'SKILL.md'), 'utf8')
    .split(/\r?\n/)
    .findIndex((l) => l.includes('Run `scripts/extract.py`')) + 1;

  assert.equal(result.structure.steps[0].location, `SKILL.md:${physicalLine}`);
});

test('code-fenced example lists and headings are ignored, not treated as real steps', () => {
  const dir = makeTempSkill(
    [
      '---',
      'name: doc-example',
      'description: Documents a sample workflow but only performs one simple task.',
      '---',
      '',
      '# Doc Example',
      '',
      'Reformat the text the user gives you into title case.',
      '',
      'Here is what a *user\'s own* multi-step pipeline might look like, for illustration only:',
      '',
      '```markdown',
      '## Workflow',
      '1. Run `scripts/one.py`',
      '2. Run `scripts/two.py`',
      '3. Run `scripts/three.py`',
      '```',
    ].join('\n')
  );

  try {
    const result = analyzeSkill(dir);
    assert.equal(result.structure.step_count, 0, 'fenced example steps must not be counted as real steps');
    assert.equal(result.complexity_class, 'simple');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('discovers scripts nested deeper than a fixed depth limit', () => {
  const dir = makeTempSkill('---\nname: deep-nest\ndescription: Uses a deeply nested helper script.\n---\n\nRun the helper.', {
    'scripts/a/b/c/d/e/f/helper.py': '# nested helper\n',
  });

  try {
    const result = analyzeSkill(dir);
    assert.ok(
      result.structure.tool_dependencies.includes('scripts/a/b/c/d/e/f/helper.py'),
      `expected nested script in tool_dependencies, got ${JSON.stringify(result.structure.tool_dependencies)}`
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('heading-steps skill: recognizes "## Step N:" headings as the step sequence', () => {
  const result = analyzeSkill(HEADING_STEPS_SKILL);

  assert.equal(result.structure.step_count, 5, 'expected the five "## Step N:" headings to be the steps');
  assert.equal(result.complexity_class, 'multi_step_process');
  assert.match(result.structure.steps[0].description, /Extract receipt details/i);
  assert.equal(result.structure.steps[4].id, 5);
});

test('heading-steps skill: picks up inter-step dependencies stated in prose', () => {
  const result = analyzeSkill(HEADING_STEPS_SKILL);
  assert.ok(
    result.structure.dependencies.length > 0 || result.structure.feedback_loops.length > 0,
    'expected the "return to step 4" / "amount from step 1" references to register'
  );
});

test('catalog skill: many tools and sections but no sequence stays simple', () => {
  const result = analyzeSkill(CATALOG_SKILL);

  // This is the case that used to break classification: a skill with several
  // scripts and plenty of conditional prose, but no ordered steps at all.
  assert.equal(result.structure.step_count, 0);
  assert.ok(result.structure.tool_dependencies.length >= 4, 'fixture should expose several scripts');
  assert.equal(result.complexity_class, 'simple');
});

test('tool count alone never establishes multi_step_process', () => {
  const dir = makeTempSkill(
    ['---', 'name: many-tools', 'description: Runs one task, mentions many scripts.', '---', '', '# Many Tools', '', 'Pick whichever helper fits and run it once.'].join('\n'),
    {
      'scripts/a.py': '#\n',
      'scripts/b.py': '#\n',
      'scripts/c.py': '#\n',
      'scripts/d.sh': '#\n',
    }
  );
  try {
    const result = analyzeSkill(dir);
    assert.ok(result.structure.tool_dependencies.length >= 4);
    assert.equal(result.complexity_class, 'simple');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tool_dependencies excludes markup, bare extensions, and data files', () => {
  const dir = makeTempSkill(
    [
      '---',
      'name: noisy',
      'description: Mentions lots of non-tools in backticks.',
      '---',
      '',
      '# Noisy',
      '',
      'Convert `.docx` files. The tag `<w:del/>` marks deletions and',
      '`WidthType.DXA` is a constant. Schema lives in `references/wml.xsd`,',
      'config in `references/settings.json`. Run `scripts/convert.py` to do it.',
    ].join('\n'),
    { 'scripts/convert.py': '#\n', 'references/wml.xsd': '<xs:schema/>\n' }
  );
  try {
    const { structure } = analyzeSkill(dir);

    assert.ok(structure.tool_dependencies.includes('scripts/convert.py'));
    for (const notATool of ['.docx', '<w:del/>', 'WidthType.DXA', 'references/wml.xsd', 'references/settings.json']) {
      assert.ok(
        !structure.tool_dependencies.includes(notATool),
        `"${notATool}" must not be reported as a tool dependency`
      );
    }
    // The data files aren't lost — they move to referenced_files.
    assert.ok(structure.referenced_files.includes('references/wml.xsd'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('step references inside fenced code are examples, not dependencies', () => {
  const dir = makeTempSkill(
    [
      '---', 'name: fenced', 'description: Has a code example mentioning another step.', '---', '',
      '# Fenced', '',
      '## Step 1: Collect', '',
      'Collect the input.', '',
      '```text', 'Sample log: return to step 9 if the upload fails', '```', '',
      '## Step 2: Submit', '', 'Submit it.',
    ].join('\n')
  );
  try {
    const { structure } = analyzeSkill(dir);
    assert.deepEqual(structure.steps[0].references_steps, [], 'a step number inside a code fence must not become a dependency');
    assert.deepEqual(structure.dependencies, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('non-sequential step labels are mapped onto the generated step ids', () => {
  const dir = makeTempSkill(
    [
      '---', 'name: phases', 'description: Uses Phase 10/20/30 labels.', '---', '',
      '# Phases', '',
      '## Phase 10: Collect', '', 'Collect the input.', '',
      '## Phase 20: Validate', '', 'Validate what Phase 10 produced.', '',
      '## Phase 30: Submit', '', 'Submit the result from Phase 20.',
    ].join('\n')
  );
  try {
    const { structure } = analyzeSkill(dir);
    assert.equal(structure.step_count, 3);
    // "Phase 20" is step id 2 — not a dependency on a nonexistent step 20.
    assert.deepEqual(structure.dependencies.map((d) => [d.from_step, d.to_step]), [[1, 2], [2, 3]]);
    for (const dep of structure.dependencies) {
      assert.ok(dep.from_step >= 1 && dep.from_step <= 3, `dependency points outside the step range: ${dep.from_step}`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a broken reference is still reported when labels are a plain 1..N sequence', () => {
  const dir = makeTempSkill(
    [
      '---', 'name: broken-ref', 'description: References a step that does not exist.', '---', '',
      '# Broken', '',
      '## Step 1: Collect', '', 'Collect the input.', '',
      '## Step 2: Submit', '', 'Submit what step 7 produced.',
    ].join('\n')
  );
  try {
    const { structure } = analyzeSkill(dir);
    assert.ok(
      structure.dependencies.some((d) => d.from_step === 7),
      'an out-of-range reference under 1..N labelling is a real defect and must survive for module 2 to flag'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('nested sub-step headings are structure, not cross-references', () => {
  // Shape taken from a real skill (doc-coauthoring): "## Stage N" phases,
  // each containing its own "### Step 1..N" sub-headings that restart at 1.
  const dir = makeTempSkill(
    [
      '---', 'name: nested', 'description: Stages containing their own numbered sub-steps.', '---', '',
      '# Nested', '',
      '## Stage 1: Gather', '', 'Gather the input.', '',
      '### Step 1: Ask', '', 'Ask the user.', '',
      '### Step 2: Collect', '', 'Collect answers.', '',
      '## Stage 2: Produce', '', 'Produce the result.', '',
      '### Step 3: Draft', '', 'Draft it.', '',
      '### Step 4: Polish', '', 'Polish it.',
    ].join('\n')
  );
  try {
    const { structure } = analyzeSkill(dir);
    assert.equal(structure.step_count, 2, 'the two Stage headings are the steps');
    for (const dep of structure.dependencies) {
      assert.ok(
        dep.from_step <= structure.step_count && dep.to_step <= structure.step_count,
        `sub-step heading read as a dependency on a nonexistent step: ${JSON.stringify(dep)}`
      );
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('referenced_files lists only files the SKILL.md actually mentions', () => {
  const dir = makeTempSkill(
    [
      '---', 'name: refs', 'description: Mentions one file, ships another.', '---', '',
      '# Refs', '', 'Read `references/notes.md` before starting.',
    ].join('\n'),
    { 'references/notes.md': 'notes\n', 'assets/never-mentioned.png': 'x\n' }
  );
  try {
    const { structure } = analyzeSkill(dir);
    assert.ok(structure.referenced_files.includes('references/notes.md'));
    assert.ok(
      !structure.referenced_files.includes('assets/never-mentioned.png'),
      'a file that merely exists is not a file the skill references'
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
