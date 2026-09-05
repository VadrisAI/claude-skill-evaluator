#!/usr/bin/env node
'use strict';

const { analyzeSkill } = require('./index');

function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node src/analyzer/cli.js <path-to-skill-dir-or-SKILL.md>');
    process.exitCode = 1;
    return;
  }

  try {
    const result = analyzeSkill(target);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (err) {
    console.error(`Analyzer failed: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
