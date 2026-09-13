#!/usr/bin/env node
'use strict';

const path = require('path');
const { startUiServer } = require('../src/ui');

function printUsage() {
  console.log('Usage: skill-evaluator-ui [<path> ...] [--port <n>] [--out <output-dir>]');
  console.log('');
  console.log('Starts the local evaluation interface on http://127.0.0.1:<port>/.');
  console.log('Scans the given paths (default: current directory) for skills and reports.');
  console.log('Never modifies a skill — the only action it can perform is running an evaluation.');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) return { help: true };

  const opts = { roots: [], port: 4173, outputDir: undefined };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--port') {
      const value = Number(args[i + 1]);
      if (!Number.isInteger(value) || value < 0 || value > 65535) {
        return { error: `--port needs a number between 0 and 65535, got "${args[i + 1]}"` };
      }
      opts.port = value;
      i += 1;
    } else if (arg === '--out') {
      opts.outputDir = args[i + 1];
      i += 1;
    } else if (arg.startsWith('--')) {
      return { error: `Unknown option "${arg}"` };
    } else {
      opts.roots.push(arg);
    }
  }
  if (opts.roots.length === 0) opts.roots.push(process.cwd());
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv);
  if (opts.help) {
    printUsage();
    process.exit(0);
  }
  if (opts.error) {
    console.error(opts.error);
    printUsage();
    process.exit(1);
  }

  try {
    const { url } = await startUiServer(opts);
    console.log(`Skill Evaluator UI: ${url}`);
    console.log(`Watching: ${opts.roots.map((r) => path.resolve(r)).join(', ')}`);
    console.log('Press Ctrl+C to stop.');
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${opts.port} is already in use. Pass --port <n> to pick another one.`);
    } else {
      console.error(`Could not start the UI: ${err.message}`);
    }
    process.exit(1);
  }
}

main();
