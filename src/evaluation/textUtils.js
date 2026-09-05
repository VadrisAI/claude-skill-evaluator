'use strict';

const VAGUE_LANGUAGE_PATTERN =
  /\b(vielleicht|möglicherweise|eventuell|ggf\.?|unter umständen|kind of|sort of|maybe|perhaps|if possible|should probably|try to|versuche(?:n)? es)\b/i;

const IMPERATIVE_START_PATTERN =
  /^(erstelle|prüfe|lies|führe|vergleiche|analysiere|generiere|stelle sicher|verwende|ergänze|entferne|öffne|schreibe|lösche|aktualisiere|sortiere|filtere|berechne|extrahiere|exportiere|importiere|wähle|kombiniere|teile|konvertiere|formatiere|sende|empfange|warte|wiederhole|starte|stoppe|beende|speichere|lade|rendere|baue|verarbeite|sammle|ordne|gruppiere|kopiere|verschiebe|gib|check|read|create|run|verify|analyze|generate|ensure|use|add|remove|open|write|list|call|invoke|parse|validate|render|extract|build|fetch|load|save|convert|compute|download|upload|count|format|transform|summarize|respond|output|return|apply|replace|insert|update|delete|move|copy|close|start|stop|launch|execute|retry|wait|find|search|filter|sort|group|merge|split|choose|select|pick|report|compare|combine|iterate|repeat|loop|abort|cancel|notify|inform|log|print|display|show)\b/i;

// A conditional clause ("If X, retry Y." / "Depending on Z, choose W.") is
// still an actionable instruction — the leading condition just precedes the
// verb instead of the verb starting the sentence.
const CONDITIONAL_LEAD_RE = /^(if|when|unless|otherwise|else|depending on|in case|falls|wenn|sofern)\b/i;

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
  const trimmed = text.trim();
  if (IMPERATIVE_START_PATTERN.test(trimmed)) return true;
  if (CONDITIONAL_LEAD_RE.test(trimmed)) {
    // Check every comma/semicolon-separated clause after the condition for
    // a leading imperative verb, e.g. "If X, drop it, unless Y, in which
    // case abort." should count the "abort" clause.
    const clauses = trimmed.split(/[,;]/).slice(1);
    return clauses.some((clause) => IMPERATIVE_START_PATTERN.test(clause.trim()));
  }
  return false;
}

module.exports = {
  normalize,
  wordSet,
  jaccardSimilarity,
  containsVagueLanguage,
  looksImperative,
  VAGUE_LANGUAGE_PATTERN,
  IMPERATIVE_START_PATTERN,
  CONDITIONAL_LEAD_RE,
};
