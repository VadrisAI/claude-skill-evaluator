'use strict';

/**
 * Metric registry for the Scoring Engine.
 *
 * Every metric key here matches a possible entry in the `applicable_metrics`
 * array of the "2 -> 3" contract (docs/architecture.md). The Evaluation
 * Engine (module 2) decides which metrics are relevant for a given skill's
 * detected complexity_class; the Scoring Engine only ever computes scores
 * for metrics it was told are applicable — it never invents extra ones and
 * never scores a metric that wasn't requested.
 *
 * `testCategories` is a best-effort mapping from test_results[].category
 * strings (module 2's Test Engine output) to the metric(s) that category's
 * pass/fail rate should influence. It is intentionally loose: any category
 * not listed here simply contributes no test-based signal to a metric, and
 * any applicable_metrics value not listed below still scores fine from
 * findings alone (see scoreMetric in index.js) with a generic label.
 */

// Keys and testCategories here are matched against what module 2 actually
// produces (src/evaluation/criteria.js's BASE_METRICS/PROCESS_METRICS for
// the keys, each rule's own `testCategory` in rules/base.js and
// rules/process.js for the mapping) — not against a speculative contract.
// A mismatch here doesn't crash anything (an unlisted metric still scores
// from findings alone, see metricDefinition's fallback below), but it does
// silently disable the findings/test-pass-rate blend documented in
// scoreMetric for whichever metric it's wrong on.
const KNOWN_METRICS = {
  structure_quality: {
    label: 'Structure Quality',
    description: 'Ob die grundlegende SKILL.md-Struktur vorhanden und erkennbar ist.',
    testCategories: ['standard'],
  },
  instruction_quality: {
    label: 'Instruction Quality',
    description:
      'Klarheit, Präzision und Verständlichkeit der Skill-Instructions.',
    testCategories: ['standard', 'instruction_following'],
  },
  clarity: {
    label: 'Clarity',
    description: 'Ob Instructions knapp, aber verständlich formuliert sind.',
    testCategories: ['standard'],
  },
  precision: {
    label: 'Precision',
    description: 'Ob Instructions eindeutig statt vage/hedged formuliert sind.',
    testCategories: ['ambiguous'],
  },
  completeness: {
    label: 'Completeness',
    description:
      'Ob Zweck, Inputs/Outputs und alle notwendigen Angaben vorhanden sind.',
    testCategories: ['standard'],
  },
  redundancy: {
    label: 'Redundancy',
    description: 'Ob sich Instructions unnötig wiederholen.',
    testCategories: ['standard'],
  },
  contradictions: {
    label: 'Contradictions',
    description: 'Widerspruchsfreiheit innerhalb des Skills (z.B. "immer"/"nie").',
    testCategories: ['consistency'],
  },
  consistency: {
    label: 'Consistency',
    description: 'Logische Konsistenz innerhalb des Skills.',
    testCategories: ['consistency'],
  },
  context_efficiency: {
    label: 'Context Efficiency',
    description: 'Kontext- und Token-Effizienz der Instructions.',
    testCategories: ['boundary'],
  },
  edge_case_coverage: {
    label: 'Edge Case Coverage',
    description: 'Ob Edge Cases und Sonderfälle abgedeckt sind.',
    testCategories: ['edge'],
  },
  robustness: {
    label: 'Robustness',
    description: 'Verhalten bei Fehlerfällen und fehlendem Failure Handling.',
    testCategories: ['failure'],
  },
  misconfiguration_risk: {
    label: 'Misconfiguration Risk',
    description: 'Risiko fehlerhafter Konfiguration, z.B. verwaiste Scripts.',
    testCategories: ['standard'],
  },
  process_transitions: {
    label: 'Process Transitions',
    description:
      'Korrektheit von Prozessübergängen und Reihenfolge (nur multi_step_process).',
    testCategories: ['process_transition', 'e2e'],
  },
  dependency_management: {
    label: 'Dependency Management',
    description:
      'Klarheit definierter Abhängigkeiten zwischen Prozessschritten (nur multi_step_process).',
    testCategories: ['dependency'],
  },
  decision_logic: {
    label: 'Decision Logic',
    description: 'Klarheit und Eindeutigkeit von Entscheidungspunkten (nur multi_step_process).',
    testCategories: ['decision_logic'],
  },
  feedback_loop_integrity: {
    label: 'Feedback Loop Integrity',
    description: 'Ob Feedback-Schleifen sauber terminieren (nur multi_step_process).',
    testCategories: ['boundary'],
  },
  exit_conditions: {
    label: 'Exit Conditions',
    description:
      'Ob Feedback-Schleifen und Retries erkennbare Exit-Bedingungen haben (nur multi_step_process).',
    testCategories: ['exit_condition', 'boundary'],
  },
  dead_end_detection: {
    label: 'Dead End Detection',
    description: 'Ob Prozessschritte auf existierende Ziele verweisen (nur multi_step_process).',
    testCategories: ['dead_end'],
  },
};

const SEVERITY_PENALTY = {
  CRITICAL: 22,
  HIGH: 13,
  MEDIUM: 7,
  LOW: 3,
};

const SEVERITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function metricDefinition(metricKey) {
  return (
    KNOWN_METRICS[metricKey] || {
      label: titleCase(metricKey),
      description: null,
      testCategories: [],
    }
  );
}

function titleCase(key) {
  return String(key)
    .split(/[_-]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

module.exports = {
  KNOWN_METRICS,
  SEVERITY_PENALTY,
  SEVERITY_ORDER,
  metricDefinition,
};
