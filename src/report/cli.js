#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const { generateReport } = require('./index');

/**
 * CLI entry for the Scoring & Report Engine, usable standalone (e.g. by
 * module 4's /evaluate-skill command wiring, or for manual testing without
 * waiting on the other three modules):
 *
 *   node src/report/cli.js <evaluation-output.json> [options]
 *
 * Options:
 *   --out <dir>            output directory (default: ./skill-evaluation)
 *   --version <label>      version label for this run (default: v<next>)
 *   --no-history           don't write a history/evaluation-vN.json entry
 */
function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') args.out = argv[++i];
    else if (a === '--version') args.version = argv[++i];
    else if (a === '--no-history') args.noHistory = true;
    else args._.push(a);
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = args._[0];

  if (!inputPath) {
    process.stderr.write(
      'Usage: node src/report/cli.js <evaluation-output.json> [--out <dir>] [--version <label>] [--no-history]\n'
    );
    process.exit(1);
  }

  const resolvedInput = path.resolve(inputPath);
  const evaluationOutput = JSON.parse(fs.readFileSync(resolvedInput, 'utf8'));

  const { outputDir, scoringResult, files } = generateReport(evaluationOutput, {
    outputDir: args.out,
    version: args.version,
    recordHistory: !args.noHistory,
  });

  process.stdout.write(`Report written to ${outputDir}\n`);
  process.stdout.write(`Overall score: ${scoringResult.scores.overall}/100\n`);
  process.stdout.write(`Files:\n${files.map((f) => `  - ${f}`).join('\n')}\n`);
}

main();
