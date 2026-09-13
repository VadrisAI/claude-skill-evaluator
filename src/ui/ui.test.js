'use strict';

const test = require('node:test');
const http = require('http');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createServer } = require('./server');
const { findSkillDirs, buildState, skillId, severityCounts } = require('./inventory');
const { EvaluationRunner } = require('./runner');

const FIXTURES = path.join(__dirname, '..', '..', 'fixtures');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `skill-ui-${prefix}-`));
}

/** Starts a server on an ephemeral port and returns a fetch bound to it. */
async function withServer(opts, fn) {
  const server = createServer(opts);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn((p, init) => fetch(base + p, init), base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

/* ------------------------------------------------------------- inventory */

test('findSkillDirs finds a directory by its SKILL.md', () => {
  const found = findSkillDirs([FIXTURES]);
  assert.ok(found.some((p) => p.endsWith(path.join('fixtures', 'simple-skill'))));
  assert.ok(found.some((p) => p.endsWith(path.join('fixtures', 'multi-step-skill'))));
});

test('findSkillDirs does not descend into a skill it already found', () => {
  const root = tmpDir('nested');
  const outer = path.join(root, 'outer');
  fs.mkdirSync(path.join(outer, 'references'), { recursive: true });
  fs.writeFileSync(path.join(outer, 'SKILL.md'), '# Outer\n');
  // A SKILL.md quoted inside bundled reference material is not a second skill.
  fs.writeFileSync(path.join(outer, 'references', 'SKILL.md'), '# Quoted example\n');

  const found = findSkillDirs([root]);
  assert.deepStrictEqual(found, [outer]);
});

test('buildState lists an unevaluated skill as evaluated:false with no summary', () => {
  const state = buildState([path.join(FIXTURES, 'simple-skill')]);
  assert.strictEqual(state.skills.length, 1);
  assert.strictEqual(state.skills[0].evaluated, false);
  assert.strictEqual(state.skills[0].summary, null);
  assert.match(state.skills[0].id, /^[0-9a-f]{12}$/);
});

test('skillId is stable for one path and different across paths', () => {
  assert.strictEqual(skillId('/a/b'), skillId('/a/b'));
  assert.notStrictEqual(skillId('/a/b'), skillId('/a/c'));
});

test('severityCounts does not double-count a finding that costs two metrics', () => {
  const evalDir = tmpDir('sev');
  const finding = { area: 'A', location: 'L', problem: 'P', severity: 'HIGH' };
  fs.writeFileSync(path.join(evalDir, 'scores.json'), JSON.stringify({
    score_details: {
      clarity: { contributing_findings: [finding] },
      precision: { contributing_findings: [finding] },
    },
  }));
  assert.deepStrictEqual(severityCounts(evalDir), { CRITICAL: 0, HIGH: 1, MEDIUM: 0, LOW: 0 });
});

/* ---------------------------------------------------------------- runner */

test('EvaluationRunner refuses a second concurrent run', () => {
  const runner = new EvaluationRunner();
  const out = tmpDir('run');
  runner.start({ skillPath: path.join(FIXTURES, 'simple-skill'), outputDir: out });
  assert.throws(() => runner.start({ skillPath: path.join(FIXTURES, 'simple-skill'), outputDir: out }),
    (err) => err.code === 'RUN_IN_PROGRESS');
  runner.current.child.kill();
});

test('EvaluationRunner emits started, output and finished for a real run', async () => {
  const runner = new EvaluationRunner();
  const out = tmpDir('run-ok');
  const events = [];
  runner.on('event', (e) => events.push(e));

  await new Promise((resolve) => {
    runner.on('event', (e) => { if (e.type === 'run-finished') resolve(); });
    runner.start({ skillPath: path.join(FIXTURES, 'simple-skill'), outputDir: out });
  });

  assert.strictEqual(events[0].type, 'run-started');
  const finished = events.find((e) => e.type === 'run-finished');
  assert.strictEqual(finished.ok, true);
  assert.ok(events.some((e) => e.type === 'run-output' && /Overall score/.test(e.text)));
  assert.ok(fs.existsSync(path.join(out, 'skill-evaluation', 'scores.json')));
  assert.strictEqual(runner.isBusy(), false);
});

/* ---------------------------------------------------------------- server */

test('GET / serves the app shell and /app.js the script', async () => {
  await withServer({ roots: [FIXTURES] }, async (get) => {
    const html = await get('/');
    assert.strictEqual(html.status, 200);
    assert.match(html.headers.get('content-type'), /text\/html/);
    assert.match(await html.text(), /Skill Evaluator/);

    const js = await get('/app.js');
    assert.strictEqual(js.status, 200);
    assert.match(js.headers.get('content-type'), /javascript/);
  });
});

test('GET /api/state reports the fixtures as discovered skills', async () => {
  await withServer({ roots: [FIXTURES] }, async (get) => {
    const res = await get('/api/state');
    assert.strictEqual(res.status, 200);
    const state = await res.json();
    assert.ok(state.skills.some((s) => s.skillName === 'simple-skill'));
    assert.ok(state.generatedAt);
  });
});

test('an unknown route answers 404 as JSON', async () => {
  await withServer({ roots: [FIXTURES] }, async (get) => {
    const res = await get('/api/nope');
    assert.strictEqual(res.status, 404);
    assert.match((await res.json()).error, /No route/);
  });
});

test('GET /api/report is 409 for a skill that has never been evaluated', async () => {
  await withServer({ roots: [path.join(FIXTURES, 'simple-skill')] }, async (get) => {
    const state = await (await get('/api/state')).json();
    const res = await get(`/api/report?id=${state.skills[0].id}`);
    assert.strictEqual(res.status, 409);
  });
});

test('GET /api/report is 404 for an id the server never issued', async () => {
  await withServer({ roots: [FIXTURES] }, async (get) => {
    assert.strictEqual((await get('/api/report?id=deadbeefdead')).status, 404);
  });
});

/* --------------------------------------------------- security boundaries */

test('a non-loopback Host header is refused', async () => {
  // fetch() treats Host as a forbidden header and silently keeps its own, so
  // this has to go out as a raw request to actually exercise the guard —
  // the DNS-rebinding case it defends against does not use fetch either.
  await withServer({ roots: [FIXTURES] }, async (_get, base) => {
    const port = Number(new URL(base).port);
    const status = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: '/api/state', method: 'GET', headers: { Host: 'evil.example.com' } },
        (res) => { res.resume(); resolve(res.statusCode); }
      );
      req.on('error', reject);
      req.end();
    });
    assert.strictEqual(status, 403);
  });
});

test('a loopback Host header with a port is accepted', async () => {
  await withServer({ roots: [FIXTURES] }, async (_get, base) => {
    const port = Number(new URL(base).port);
    const status = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: '127.0.0.1', port, path: '/api/state', method: 'GET', headers: { Host: `localhost:${port}` } },
        (res) => { res.resume(); resolve(res.statusCode); }
      );
      req.on('error', reject);
      req.end();
    });
    assert.strictEqual(status, 200);
  });
});

test('POST /api/evaluate refuses an id the server did not issue', async () => {
  const runner = new EvaluationRunner();
  await withServer({ roots: [FIXTURES], runner }, async (get) => {
    const res = await get('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'ffffffffffff' }),
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(runner.isBusy(), false);
  });
});

test('POST /api/evaluate ignores a path in the body — only ids are accepted', async () => {
  const runner = new EvaluationRunner();
  await withServer({ roots: [FIXTURES], runner }, async (get) => {
    const res = await get('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skillPath: '/etc', path: '../../etc', id: undefined }),
    });
    assert.strictEqual(res.status, 404);
    assert.strictEqual(runner.isBusy(), false, 'nothing may run for a request that names a path');
  });
});

test('POST /api/evaluate answers 409 while a run is in flight', async () => {
  const runner = new EvaluationRunner();
  const out = tmpDir('busy');
  await withServer({ roots: [FIXTURES], outputDir: out, runner }, async (get) => {
    const state = await (await get('/api/state')).json();
    const id = state.skills.find((s) => s.skillName === 'simple-skill').id;

    const first = await get('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    assert.strictEqual(first.status, 202);

    const second = await get('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    assert.strictEqual(second.status, 409);

    await new Promise((resolve) => runner.on('event', (e) => { if (e.type === 'run-finished') resolve(); }));
  });
});

test('a malformed JSON body is a 400, not a crash', async () => {
  await withServer({ roots: [FIXTURES] }, async (get) => {
    const res = await get('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    assert.strictEqual(res.status, 400);
  });
});

test('evaluating through the UI leaves the skill directory untouched', async () => {
  // The project's central non-goal: the evaluator never modifies a skill.
  // The UI adds a way to trigger a run, so it has to hold that line too.
  const workspace = tmpDir('untouched');
  const skillDir = path.join(workspace, 'demo-skill');
  fs.mkdirSync(skillDir);
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), '---\nname: demo\ndescription: A demo skill.\n---\n\n# Demo\n\nRead the input file.\n');
  const before = fs.readdirSync(skillDir).sort();
  const contentBefore = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');

  const runner = new EvaluationRunner();
  const out = tmpDir('untouched-out');
  await withServer({ roots: [workspace], outputDir: out, runner }, async (get) => {
    const state = await (await get('/api/state')).json();
    await get('/api/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: state.skills[0].id }),
    });
    await new Promise((resolve) => runner.on('event', (e) => { if (e.type === 'run-finished') resolve(); }));
  });

  assert.deepStrictEqual(fs.readdirSync(skillDir).sort(), before);
  assert.strictEqual(fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8'), contentBefore);
  assert.ok(fs.existsSync(path.join(out, 'skill-evaluation', 'scores.json')));
});
