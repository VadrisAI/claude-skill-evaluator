'use strict';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

const REQUIRED_FIELDS = [
  'area',
  'location',
  'problem',
  'cause',
  'impact',
  'improvement_direction',
  'watch_for',
  'context',
];

/**
 * Builds one finding object matching the 2 -> 3 contract in
 * docs/architecture.md, which mirrors the eight-field structure from
 * spec.md ("Verbesserungshinweise und Lernansatz"):
 * BETROFFENER BEREICH, GENAUE STELLE, PROBLEM, URSACHE, AUSWIRKUNG,
 * VERBESSERUNGSRICHTUNG, ZU BEACHTEN, KONTEXT.
 *
 * This never accepts or produces replacement text for the skill itself —
 * only diagnosis and direction. Callers must not pass rewritten instruction
 * text in `improvement_direction`.
 */
function createFinding({
  area,
  location,
  problem,
  cause,
  impact,
  improvement_direction,
  watch_for,
  context,
  severity,
  metric,
}) {
  const finding = {
    area,
    location,
    problem,
    cause,
    impact,
    improvement_direction,
    watch_for,
    context,
    severity,
    metric,
  };

  for (const field of REQUIRED_FIELDS) {
    if (typeof finding[field] !== 'string' || finding[field].trim() === '') {
      throw new Error(`Finding is missing required field "${field}"`);
    }
  }
  if (!SEVERITIES.includes(finding.severity)) {
    throw new Error(`Finding has invalid severity "${finding.severity}"`);
  }
  if (typeof finding.metric !== 'string' || finding.metric.trim() === '') {
    throw new Error('Finding is missing required field "metric"');
  }

  return finding;
}

module.exports = { createFinding, SEVERITIES, REQUIRED_FIELDS };
