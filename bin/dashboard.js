#!/usr/bin/env node
'use strict';

const { buildDashboard } = require('../src/dashboard');

function printUsage() {
  console.log('Usage: dashboard [<path> ...] [--out <dashboard.html>]');
  console.log('');
  console.log('Scans the given path(s) (default: current directory) for skill-evaluation/');
  console.log('output folders and renders a single read-only overview dashboard.html.');
  console.log('Does not run any evaluations itself — see src/dashboard/README.md.');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    return { help: true };
  }
  const outIndex = args.indexOf('--out');
  let out;
  if (outIndex !== -1) {
    out = args[outIndex + 1];
    args.splice(outIndex, 2);
  }
  const roots = args.length > 0 ? args : ['.'];
  return { help: false, roots, out };
}

function main() {
  const { help, roots, out } = parseArgs(process.argv);
  if (help) {
    printUsage();
    process.exit(0);
  }

  let result;
  try {
    result = buildDashboard(roots, out ? { out } : {});
  } catch (err) {
    console.error(`Dashboard generation failed: ${err.message}`);
    process.exit(1);
  }

  console.log(`Found ${result.skills.length} evaluated skill(s).`);
  console.log(`Dashboard written to: ${result.file}`);
}

main();
