'use strict';

const VAGUE_LANGUAGE_PATTERN =
  /\b(vielleicht|möglicherweise|eventuell|ggf\.?|unter umständen|kind of|sort of|maybe|perhaps|if possible|should probably|try to|versuche(?:n)? es)\b/i;

const IMPERATIVE_START_PATTERN =
  /^(erstelle|prüfe|lies|führe|vergleiche|analysiere|generiere|stelle sicher|verwende|ergänze|entferne|öffne|schreibe|check|read|create|run|verify|analyze|generate|ensure|use|add|remove|open|write|list|call|invoke|parse|validate)\b/i;

function normalize(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordSet(text) {
  return new Set(normalize(text).split(' ').filter(Boolean));
}

function jaccardSimilarity(a, b) {
  const setA = wordSet(a);
  const setB = wordSet(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection += 1;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function containsVagueLanguage(text) {
  return VAGUE_LANGUAGE_PATTERN.test(text);
}

function looksImperative(text) {
  return IMPERATIVE_START_PATTERN.test(text.trim());
}

module.exports = {
  normalize,
  wordSet,
  jaccardSimilarity,
  containsVagueLanguage,
  looksImperative,
  VAGUE_LANGUAGE_PATTERN,
  IMPERATIVE_START_PATTERN,
};
