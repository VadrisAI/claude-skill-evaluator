'use strict';

function arr(x) {
  return Array.isArray(x) ? x : [];
}

/**
 * Collects a deduplicated pool of {id, text, location} text units from the
 * real Analyzer output shape, for generic text-quality checks (vague
 * language, length, redundancy, contradictions).
 *
 * Why dedupe by location: the Analyzer's `decision_points` / `feedback_loops`
 * / `retry_mechanisms` / `failure_handling` are independent keyword scans
 * over the same document body, so a single line routinely matches more than
 * one of them (e.g. a "retry up to 3 times" sentence lands in both
 * `retry_mechanisms` and `failure_handling`), and a step's own `location`
 * frequently coincides with one of those scans hitting the same line. Also
 * treating each array as a separate parallel "instruction" would flag the
 * exact same sentence as "redundant" or "contradictory" against itself
 * under a different label. Deduping by `location` (which both `steps[]`
 * and the keyword-scanned arrays derive from the same body-line index)
 * collapses those into one unit, keeping the redundancy/contradiction/
 * length checks meaningful instead of noisy.
 */
function collectTextUnits(structure) {
  const byLocation = new Map();

  for (const step of arr(structure.steps)) {
    if (step && typeof step.description === 'string' && step.description.trim() !== '' && step.location) {
      byLocation.set(step.location, { id: `step-${step.id}`, text: step.description, location: step.location });
    }
  }

  const keywordSources = [
    ['decision_points', 'condition'],
    ['feedback_loops', 'detail'],
    ['retry_mechanisms', 'detail'],
    ['failure_handling', 'detail'],
  ];
  for (const [key, field] of keywordSources) {
    arr(structure[key]).forEach((item, idx) => {
      if (item && typeof item[field] === 'string' && item[field].trim() !== '') {
        const location = item.location || `${key}[${idx}]`;
        if (!byLocation.has(location)) {
          byLocation.set(location, { id: `${key}-${idx}`, text: item[field], location });
        }
      }
    });
  }

  if (typeof structure.purpose === 'string' && structure.purpose.trim() !== '') {
    const location = 'Purpose/Zweck (Frontmatter "description" bzw. erster Absatz)';
    if (!byLocation.has(location)) {
      byLocation.set(location, { id: 'purpose', text: structure.purpose, location });
    }
  }

  return [...byLocation.values()];
}

module.exports = { collectTextUnits };
