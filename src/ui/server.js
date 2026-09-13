'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const { buildState } = require('./inventory');
const { EvaluationRunner } = require('./runner');

const ASSETS = path.join(__dirname, 'assets');

const ASSET_ROUTES = {
  '/': { file: 'app.html', type: 'text/html; charset=utf-8' },
  '/app.css': { file: 'app.css', type: 'text/css; charset=utf-8' },
  '/app.js': { file: 'app.js', type: 'text/javascript; charset=utf-8' },
};

// Only loopback. A request arriving with any other Host header reached us
// through a name that resolves here from somewhere else — the shape of a
// DNS-rebinding attempt against a local dev server — so it is refused
// before it can reach anything that runs work. See docs/architecture.md.
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|::1)(:\d+)?$/i;

/**
 * Creates the UI's HTTP server. Exported separately from listen() so tests
 * can drive it without binding a port.
 *
 * @param {object} opts
 * @param {string[]} opts.roots       directories to scan for skills and reports
 * @param {string}  [opts.outputDir]  where evaluations write (default: next to each skill)
 * @param {EvaluationRunner} [opts.runner]
 */
function createServer(opts = {}) {
  const roots = (opts.roots && opts.roots.length ? opts.roots : [process.cwd()]).map((p) => path.resolve(p));
  const outputDir = opts.outputDir ? path.resolve(opts.outputDir) : null;
  const runner = opts.runner || new EvaluationRunner();

  const clients = new Set();
  runner.on('event', (event) => broadcast(clients, event));

  const server = http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://localhost');
    } catch {
      return sendJson(res, 400, { error: 'Malformed request URL' });
    }

    if (!LOOPBACK_HOST.test(req.headers.host || '')) {
      return sendJson(res, 403, { error: 'This server only answers requests addressed to localhost.' });
    }

    const route = `${req.method} ${url.pathname}`;

    try {
      if (req.method === 'GET' && ASSET_ROUTES[url.pathname]) return sendAsset(res, ASSET_ROUTES[url.pathname]);
      if (route === 'GET /api/state') return sendJson(res, 200, buildState(roots));
      if (route === 'GET /api/report') return handleReport(res, roots, url.searchParams.get('id'));
      if (route === 'GET /api/events') return handleEvents(req, res, clients, runner);
      if (route === 'POST /api/evaluate') return handleEvaluate(req, res, roots, outputDir, runner);
      return sendJson(res, 404, { error: `No route for ${route}` });
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  });

  server.on('close', () => {
    for (const client of clients) client.end();
    clients.clear();
  });

  return server;
}

function handleReport(res, roots, id) {
  if (!id) return sendJson(res, 400, { error: 'Missing id' });

  const entry = buildState(roots).skills.find((s) => s.id === id);
  if (!entry) return sendJson(res, 404, { error: 'Unknown skill id' });
  if (!entry.evaluated) return sendJson(res, 409, { error: 'This skill has not been evaluated yet' });

  const evalDir = entry.summary.evalDir;
  const scores = readJson(path.join(evalDir, 'scores.json')) || {};
  const testResults = readJson(path.join(evalDir, 'test-results.json')) || {};

  sendJson(res, 200, {
    id: entry.id,
    skillPath: entry.skillPath,
    skillName: entry.skillName,
    summary: entry.summary,
    findings: scores.findings || [],
    tests: testResults.tests || [],
    scoreDetails: scores.score_details || null,
  });
}

function handleEvaluate(req, res, roots, outputDir, runner) {
  readBody(req, (err, body) => {
    if (err) return sendJson(res, 400, { error: err.message });

    let payload;
    try {
      payload = JSON.parse(body || '{}');
    } catch {
      return sendJson(res, 400, { error: 'Body is not valid JSON' });
    }

    // The client sends an id, never a path. Resolving it against the
    // server's own freshly-built inventory is what makes an arbitrary
    // filesystem path unreachable from the browser.
    const entry = buildState(roots).skills.find((s) => s.id === payload.id);
    if (!entry) return sendJson(res, 404, { error: 'Unknown skill id' });

    try {
      const { runId } = runner.start({ skillPath: entry.skillPath, outputDir: outputDir || undefined });
      sendJson(res, 202, { runId, skillPath: entry.skillPath });
    } catch (startErr) {
      if (startErr.code === 'RUN_IN_PROGRESS') {
        return sendJson(res, 409, { error: 'An evaluation is already running. Wait for it to finish.' });
      }
      throw startErr;
    }
  });
}

function handleEvents(req, res, clients, runner) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write(`data: ${JSON.stringify({ type: 'connected', busy: runner.isBusy() })}\n\n`);

  clients.add(res);
  req.on('close', () => clients.delete(res));
}

function broadcast(clients, event) {
  const line = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of clients) {
    try {
      client.write(line);
    } catch {
      clients.delete(client);
    }
  }
}

function readBody(req, callback) {
  const chunks = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > 64 * 1024) {
      req.destroy();
      return callback(new Error('Request body too large'));
    }
    chunks.push(chunk);
  });
  req.on('end', () => callback(null, Buffer.concat(chunks).toString('utf8')));
  req.on('error', (err) => callback(err));
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendAsset(res, route) {
  let body;
  try {
    body = fs.readFileSync(path.join(ASSETS, route.file));
  } catch {
    return sendJson(res, 500, { error: `Missing UI asset ${route.file}` });
  }
  res.writeHead(200, { 'Content-Type': route.type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

module.exports = { createServer };
