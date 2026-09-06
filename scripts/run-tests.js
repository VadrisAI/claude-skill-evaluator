#!/usr/bin/env node
'use strict';

/**
 * Runs every *.test.js in the repo through Node's built-in test runner.
 *
 * Why a script instead of `node --test <glob>` in package.json: the previous
 * `npm test` was `node --test "test/**\/*.test.js"`, which only ever matched
 * module 4's three pipeline tests — the other 60 tests across src/ were
 * silently not run by the project's own test command. A hard-coded file list
 * would have the same failure mode the moment someone adds a test file, and
 * passing directories to `node --test` tries to *require* them. So the file
 * list is discovered, and printed, on every run.
 *
 * Zero dependencies, consistent with the rest of the project.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');
const IGNORED_DIRS = new Set(['node_modules', '.git', 'skill-evaluation']);

function findTestFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      findTestFiles(path.join(dir, entry.name), acc);
    } else if (entry.isFile() && entry.name.endsWith('.test.js')) {
      acc.push(path.relative(REPO_ROOT, path.join(dir, entry.name)));
    }
  }
  return acc;
}

const testFiles = findTestFiles(REPO_ROOT).sort();

if (testFiles.length === 0) {
  console.error('No *.test.js files found — that is almost certainly a bug in this runner.');
  process.exit(1);
}

console.log(`Running ${testFiles.length} test file(s):`);
for (const f of testFiles) console.log(`  - ${f}`);
console.log('');

const result = spawnSync(process.execPath, ['--test', ...testFiles], {
  cwd: REPO_ROOT,
  stdio: 'inherit',
});

process.exit(result.status === null ? 1 : result.status);
