'use strict';

/**
 * Classifies a skill as "simple" or "multi_step_process" from the structure
 * object built by structure.js.
 *
 * Design note (rewritten after testing against 40 real skills under
 * /mnt/skills): the first version counted seven equally-weighted signals and
 * called anything with >= 2 a multi-step process. That classified 38 of 40
 * real skills as multi_step_process — including skills with ZERO detected
 * steps — because two of its signals fire on essentially any real document:
 *
 *   - "conditional language" matched a single "if"/"when" anywhere in prose;
 *   - ">= 2 tool dependencies" fires for any skill that mentions two scripts,
 *     which says the skill is capable, not that it is sequential.
 *
 * So the model changed: a multi-step process is now defined by evidence of
 * an actual SEQUENCE (ordered steps, and/or control flow between them).
 * Supporting signals can reinforce that, but can no longer manufacture it on
 * their own. Tool count is not a signal at all any more.
 */

const MIN_SEQUENCE_STEPS = 3;

function classifyComplexity(structure) {
  const signals = [];
  const counterSignals = [];

  const stepCount = structure.step_count || 0;
  const dependencies = structure.dependencies || [];
  const feedbackLoops = structure.feedback_loops || [];
  const retries = structure.retry_mechanisms || [];
  const decisions = structure.decision_points || [];
  const failures = structure.failure_handling || [];

  // --- Primary evidence: is there an actual sequence? ---
  const hasSequence = stepCount >= MIN_SEQUENCE_STEPS;
  if (hasSequence) {
    signals.push(`Detected ${stepCount} ordered steps (>= ${MIN_SEQUENCE_STEPS} threshold).`);
  } else if (stepCount > 0) {
    counterSignals.push(`Only ${stepCount} ordered step(s) detected — below the ${MIN_SEQUENCE_STEPS}-step threshold for a sequence.`);
  } else {
    counterSignals.push('No ordered steps detected; the skill does not describe a numbered or staged sequence.');
  }

  // --- Control flow BETWEEN steps: only meaningful if steps exist ---
  const hasControlFlow = stepCount > 0 && (dependencies.length > 0 || feedbackLoops.length > 0 || retries.length > 0);
  if (stepCount > 0 && dependencies.length > 0) {
    signals.push(`Found ${dependencies.length} explicit inter-step dependency reference(s).`);
  }
  if (stepCount > 0 && feedbackLoops.length > 0) {
    signals.push(`Found ${feedbackLoops.length} feedback loop indicator(s) across the step sequence.`);
  }
  if (stepCount > 0 && retries.length > 0) {
    signals.push(`Found ${retries.length} retry mechanism indicator(s) across the step sequence.`);
  }

  // --- Supporting signals: reinforce, never establish on their own ---
  const supporting = [];
  if (decisions.length >= 3) {
    supporting.push(`${decisions.length} passages with conditional/decision language`);
  }
  if (failures.length > 0) {
    supporting.push(`${failures.length} failure-handling passage(s)`);
  }

  // A skill is a multi-step process when there is a real sequence, or when
  // there are at least some steps carrying control flow between them.
  const isMultiStep = hasSequence || hasControlFlow;

  if (isMultiStep && supporting.length > 0) {
    signals.push(`Supporting evidence: ${supporting.join('; ')}.`);
  }

  if (!isMultiStep) {
    if (supporting.length > 0) {
      counterSignals.push(
        `${supporting.join('; ')} — present, but without a step sequence these describe conditional guidance inside a single task, not a multi-step process.`
      );
    }
    if ((structure.tool_dependencies || []).length > 0) {
      counterSignals.push(
        `${structure.tool_dependencies.length} tool dependenc(ies) — a capable skill, but tool count says nothing about sequencing and is not counted as a complexity signal.`
      );
    }
  }

  return {
    complexity_class: isMultiStep ? 'multi_step_process' : 'simple',
    complexity_signals: isMultiStep ? signals : counterSignals,
  };
}

module.exports = { classifyComplexity, MIN_SEQUENCE_STEPS };
