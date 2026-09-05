'use strict';

/**
 * Classifies a skill as "simple" or "multi_step_process" from the structure
 * object built by structure.js. This is a signal-count heuristic, not a
 * single hard rule: a lone match on generic conditional language ("if you
 * want more detail...") must not by itself flip a simple skill into
 * multi_step_process, so classification requires at least two independent
 * structural signals.
 */
function classifyComplexity(structure) {
  const signals = [];
  let score = 0;

  if (structure.step_count >= 3) {
    score += 1;
    signals.push(`Detected ${structure.step_count} ordered steps (>= 3 threshold).`);
  }
  if (structure.decision_points.length > 0) {
    score += 1;
    signals.push(`Found ${structure.decision_points.length} decision point(s) / conditional language.`);
  }
  if (structure.feedback_loops.length > 0) {
    score += 1;
    signals.push(`Found ${structure.feedback_loops.length} feedback loop indicator(s).`);
  }
  if (structure.retry_mechanisms.length > 0) {
    score += 1;
    signals.push(`Found ${structure.retry_mechanisms.length} retry mechanism indicator(s).`);
  }
  if (structure.dependencies.length > 0) {
    score += 1;
    signals.push(`Found ${structure.dependencies.length} explicit inter-step dependency reference(s).`);
  }
  if (structure.tool_dependencies.length >= 2) {
    score += 1;
    signals.push(`Found ${structure.tool_dependencies.length} distinct tool/script dependencies (>= 2 threshold).`);
  }
  if (structure.failure_handling.length > 0) {
    score += 1;
    signals.push(`Found ${structure.failure_handling.length} failure-handling indicator(s).`);
  }

  const complexity_class = score >= 2 ? 'multi_step_process' : 'simple';

  if (complexity_class === 'simple') {
    signals.push(
      score === 0
        ? 'No multi-step structural signals detected; skill reads as a single, clearly scoped task.'
        : 'Only one structural signal detected — not enough independent evidence to treat this as a multi-step process.'
    );
  }

  return { complexity_class, complexity_signals: signals };
}

module.exports = { classifyComplexity };
