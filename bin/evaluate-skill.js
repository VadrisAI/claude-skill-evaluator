#!/usr/bin/env node
'use strict';

const path = require('path');
const { runPipeline } = require('../src/pipeline');

function printUsage() {
  console.log('Usage: evaluate-skill <path-to-skill-directory> [--out <output-dir>]');
  console.log('');
  console.log('Analyzes, tests, and scores an existing Claude Agent Skill.');
  console.log('Never modifies the skill itself — writes a report to <output-dir>/skill-evaluation/.');
}

function parseArgs(argv) {
  const args = argv.slice(2);
  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    return { help: true };
  }
  const outIndex = args.indexOf('--out');
  let outputDir;
  if (outIndex !== -1) {
    outputDir = args[outIndex + 1];
    args.splice(outIndex, 2);
  }
  const skillPath = args[0];
  return { help: false, skillPath, outputDir };
}

function main() {
  const { help, skillPath, outputDir } = parseArgs(process.argv);
  if (help || !skillPath) {
    printUsage();
    process.exit(help ? 0 : 1);
  }

  let result;
  try {
    result = runPipeline(skillPath, outputDir ? { outputDir } : {});
  } catch (err) {
    console.error(`Evaluation failed: ${err.message}`);
    process.exit(1);
  }

  const { analysis, report } = result;
  const reportPath = report.files.find((f) => f.endsWith('REPORT.md')) || path.join(report.outputDir, 'REPORT.md');
  console.log(`Evaluated: ${analysis.skill_path}`);
  console.log(`Complexity class: ${analysis.complexity_class}`);
  console.log(`Overall score: ${report.scoringResult.scores.overall}/100`);
  // A relative path is friendlier while it stays inside the working
  // directory; once it climbs out it turns into ../../../ noise that is
  // harder to read than the absolute path — which the UI console shows too.
  const relative = path.relative(process.cwd(), reportPath);
  console.log(`Report written to: ${relative.startsWith('..') ? reportPath : relative}`);
}

main();
