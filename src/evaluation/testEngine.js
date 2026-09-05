'use strict';

const { rulesForComplexity } = require('./rules');

/**
 * Runs every rule applicable to the given complexity class against the
 * analyzer's `structure` object.
 *
 * This is a static/rule-based test executor: it validates the parsed
 * structure (instruction text, declared dependencies, decision points,
 * feedback loops, ...) against the checks in rules/base.js and
 * rules/process.js. It does not spin up a live Claude session to actually
 * run the skill end-to-end — that would require Claude Code execution
 * infrastructure this module does not own. A live executor (e.g. one that
 * drives the skill through the `claude` CLI with real inputs) is a natural
 * future extension behind the same { test_id, category, passed, detail }
 * result shape; see README.md.
 *
 * Returns { test_results, findings } matching the fields the 2 -> 3
 * contract in docs/architecture.md expects.
 */
function runTests(structure, complexityClass) {
  const rules = rulesForComplexity(complexityClass);
  const test_results = [];
  const findings = [];

  for (const rule of rules) {
    let outcome;
    try {
      outcome = rule.evaluate(structure);
    } catch (err) {
      outcome = {
        passed: false,
        detail: `Regel "${rule.id}" konnte nicht ausgeführt werden: ${err.message}`,
        findings: [],
      };
    }

    test_results.push({
      test_id: rule.id,
      category: rule.testCategory,
      passed: !!outcome.passed,
      detail: outcome.detail || '',
    });

    for (const finding of outcome.findings || []) {
      findings.push(finding);
    }
  }

  return { test_results, findings };
}

module.exports = { runTests };
