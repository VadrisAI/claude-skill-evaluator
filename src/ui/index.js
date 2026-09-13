'use strict';

const { createServer } = require('./server');
const { EvaluationRunner } = require('./runner');
const { buildState, findSkillDirs, skillId } = require('./inventory');

const HOST = '127.0.0.1';

/**
 * Starts the local UI server.
 *
 * The bind address is fixed to 127.0.0.1 and is not configurable — this
 * process starts evaluations on request, so it must not be reachable from
 * the network. See docs/architecture.md, "Security boundaries".
 *
 * @param {object} [opts]
 * @param {string[]} [opts.roots]
 * @param {string} [opts.outputDir]
 * @param {number} [opts.port] 0 picks a free port
 * @returns {Promise<{ server: import('http').Server, port: number, url: string }>}
 */
function startUiServer(opts = {}) {
  const server = createServer(opts);
  const port = opts.port == null ? 4173 : opts.port;

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, HOST, () => {
      server.removeListener('error', reject);
      const actualPort = server.address().port;
      resolve({ server, port: actualPort, url: `http://${HOST}:${actualPort}/` });
    });
  });
}

module.exports = { startUiServer, createServer, EvaluationRunner, buildState, findSkillDirs, skillId };
