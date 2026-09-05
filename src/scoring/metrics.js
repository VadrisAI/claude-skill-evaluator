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

const KNOWN_METRICS = {
  instruction_quality: {
    label: 'Instruction Quality',
    description:
      'Klarheit, Präzision und Verständlichkeit der Skill-Instructions.',
    testCategories: ['standard', 'instruction_following'],
  },
  task_definition: {
    label: 'Task Definition',
    description: 'Wie klar Zweck, Ziel und erwartete Aufgabe definiert sind.',
    testCategories: ['standard'],
  },
  consistency: {
    label: 'Consistency',
    description:
      'Widerspruchsfreiheit und logische Konsistenz innerhalb des Skills.',
    testCategories: ['consistency'],
  },
  robustness: {
    label: 'Robustness',
    description:
      'Verhalten bei Edge Cases, mehrdeutigen Eingaben und Fehlerfällen.',
    testCategories: ['edge', 'ambiguous', 'failure', 'boundary'],
  },
  completeness: {
    label: 'Completeness',
    description:
      'Ob alle notwendigen Fälle, Schritte und Informationen abgedeckt sind.',
    testCategories: ['standard', 'end_to_end', 'complex'],
  },
  efficiency: {
    label: 'Efficiency',
    description: 'Kontext- und Token-Effizienz der Instructions.',
    testCategories: [],
  },
  process_logic: {
    label: 'Process Logic',
    description:
      'Korrektheit von Prozessübergängen, Entscheidungslogik und Reihenfolge (nur multi_step_process).',
    testCategories: ['process_transition', 'decision_logic', 'end_to_end'],
  },
  dependency_clarity: {
    label: 'Dependency Clarity',
    description:
      'Klarheit definierter Abhängigkeiten zwischen Prozessschritten (nur multi_step_process).',
    testCategories: ['dependency'],
  },
  workflow_robustness: {
    label: 'Workflow Robustness',
    description:
      'Feedback-Schleifen, Exit-Bedingungen und Failure Handling im Prozessablauf (nur multi_step_process).',
    testCategories: ['feedback_loop', 'failure', 'edge'],
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
