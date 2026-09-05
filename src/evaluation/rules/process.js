'use strict';

const { createFinding } = require('../findings');
const { jaccardSimilarity } = require('../textUtils');

function arr(x) {
  return Array.isArray(x) ? x : [];
}

// A step reference or numeric bound is "exit-shaped" enough to treat a
// feedback loop / retry mechanism as having a plausible way out. This is a
// text heuristic, not a real control-flow analysis — the Analyzer doesn't
// expose structured exit conditions (see docs/architecture.md's 2026-09-05
// Module 2 note).
const EXIT_SIGNAL_RE =
  /\buntil\b|\d+\s*(mal|times?|attempts?|tries?|versuche[n]?)\b|\bup to \d+|\bmax(imal)?\b|\bstop(s|ped|ping)?\b|\babort(s|ed|ing)?\b|\bgiving up\b|\bgeben? auf\b|\berfolgreich\b|\bsuccess(ful)?\b/i;

/**
 * Process rules: only run when complexity_class === "multi_step_process".
 * Written against the real Analyzer output shape: `steps[].id` are
 * synthetic numeric ids (1..N), `dependencies[]` is
 * `{from_step, to_step, detail}` (from_step = the step being referenced,
 * to_step = the step containing the reference), `decision_points` /
 * `feedback_loops` / `retry_mechanisms` are `{location, condition|detail}`
 * keyword-scanned lines with no branch/exit-condition structure, and
 * `tool_dependencies` is a flat array of strings with no defined/undefined
 * flag. See docs/architecture.md for what that does and doesn't support.
 */
const processRules = [
  {
    id: 'dependency-references-valid',
    metric: 'dependency_management',
    testCategory: 'dependency',
    evaluate(structure) {
      const stepIds = new Set(arr(structure.steps).map((s) => s && s.id).filter((id) => id !== undefined));
      const findings = [];
      for (const dep of arr(structure.dependencies)) {
        if (!dep) continue;
        const missingFrom = dep.from_step !== undefined && !stepIds.has(dep.from_step);
        const missingTo = dep.to_step !== undefined && !stepIds.has(dep.to_step);
        if (missingFrom || missingTo) {
          findings.push(
            createFinding({
              area: 'Abhängigkeiten',
              location: `Dependency (Step ${dep.from_step ?? '?'} -> Step ${dep.to_step ?? '?'})`,
              problem: 'Eine Abhängigkeit verweist auf eine Schrittnummer, die im Skill nicht existiert.',
              cause: 'Ein Schritt wurde umbenannt oder entfernt, oder eine Instruction referenziert eine falsche Schrittnummer (z.B. "wie in Schritt 12", obwohl es nur 7 Schritte gibt).',
              impact: 'Eine undefinierte Abhängigkeit kann dazu führen, dass Claude beim Ausführen dieses Schritts auf eine nicht existierende Referenz stößt und den Ablauf falsch interpretiert.',
              improvement_direction: 'Die referenzierte Schrittnummer korrigieren oder den fehlenden Schritt ergänzen.',
              watch_for: 'Nach jeder Umnummerierung von Schritten alle "wie in Schritt N"-Referenzen im gesamten Skill neu prüfen.',
              context: `Bekannte Schritt-IDs: ${[...stepIds].join(', ') || '(keine)'}. Deep-Dive: ${dep.detail ?? '(kein Detail)'}`,
              severity: 'HIGH',
              metric: 'dependency_management',
            }),
          );
        }
      }
      return {
        passed: findings.length === 0,
        detail: findings.length === 0 ? 'Alle Abhängigkeiten verweisen auf existierende Schritte.' : `${findings.length} undefinierte Abhängigkeit(en) gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'dependency-forward-reference',
    metric: 'process_transitions',
    testCategory: 'process_transition',
    evaluate(structure) {
      const stepIds = new Set(arr(structure.steps).map((s) => s && s.id).filter((id) => id !== undefined));
      const findings = [];
      for (const dep of arr(structure.dependencies)) {
        if (!dep || dep.from_step === undefined || dep.to_step === undefined) continue;
        // An out-of-range from_step/to_step is already reported, with a more
        // accurate diagnosis, by dependency-references-valid — don't also
        // frame a broken reference as a merely-out-of-order one here.
        if (!stepIds.has(dep.from_step) || !stepIds.has(dep.to_step)) continue;
        if (dep.from_step > dep.to_step) {
          findings.push(
            createFinding({
              area: 'Prozessübergänge',
              location: `Dependency (Step ${dep.to_step} referenziert Step ${dep.from_step})`,
              problem: 'Ein früherer Schritt referenziert einen später im Skill definierten Schritt.',
              cause: 'Die Instruction verweist vorausschauend auf einen Schritt, der zu diesem Zeitpunkt im Ablauf noch nicht ausgeführt bzw. eingeführt wurde.',
              impact: 'Eine Vorwärtsreferenz kann beim Ausführen zu Verwirrung führen, wenn der referenzierte Schritt noch kein Ergebnis geliefert hat.',
              improvement_direction: 'Prüfen, ob die Reihenfolge der Schritte angepasst werden sollte, oder ob die Vorwärtsreferenz bewusst und unproblematisch ist (z.B. ein Vorgriff/Überblick).',
              watch_for: 'Ein bewusster Vorgriff ("wir behandeln das in Schritt X") ist nicht automatisch ein Fehler — diese Prüfung markiert nur eine Stelle, die es wert ist, gegenzuprüfen.',
              context: `Detail: ${dep.detail ?? '(kein Detail)'}`,
              severity: 'MEDIUM',
              metric: 'process_transitions',
            }),
          );
        }
      }
      return {
        passed: findings.length === 0,
        detail: findings.length === 0 ? 'Keine Vorwärtsreferenzen zwischen Schritten gefunden.' : `${findings.length} Vorwärtsreferenz(en) gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'decision-points-duplicate-conditions',
    metric: 'decision_logic',
    testCategory: 'decision_logic',
    evaluate(structure) {
      const decisionPoints = arr(structure.decision_points).filter((dp) => dp && typeof dp.condition === 'string');
      const findings = [];
      const reported = new Set();
      for (let a = 0; a < decisionPoints.length; a += 1) {
        for (let b = a + 1; b < decisionPoints.length; b += 1) {
          const similarity = jaccardSimilarity(decisionPoints[a].condition, decisionPoints[b].condition);
          if (similarity >= 0.85) {
            const key = `${decisionPoints[a].location}::${decisionPoints[b].location}`;
            if (reported.has(key)) continue;
            reported.add(key);
            findings.push(
              createFinding({
                area: 'Entscheidungslogik',
                location: `${decisionPoints[a].location} und ${decisionPoints[b].location}`,
                problem: 'Zwei Entscheidungspunkte formulieren eine nahezu identische Bedingung.',
                cause: 'Dieselbe Bedingung wurde an zwei Stellen im Skill unabhängig voneinander beschrieben.',
                impact: 'Doppelt formulierte Bedingungen erschweren es, den Entscheidungsablauf an einer zentralen Stelle zu pflegen, und riskieren künftige Inkonsistenz.',
                improvement_direction: 'Prüfen, ob eine der beiden Bedingungen entfernt oder beide zu einer zentralen Entscheidungsstelle zusammengeführt werden können.',
                watch_for: 'Wiederholte Bedingungen an bewusst unterschiedlichen Prozessphasen (z.B. Eingabeprüfung UND Ausgabeprüfung) sind nicht automatisch ein Fehler.',
                context: `Textähnlichkeit (Jaccard): ${similarity.toFixed(2)}.`,
                severity: 'MEDIUM',
                metric: 'decision_logic',
              }),
            );
          }
        }
      }
      return {
        passed: findings.length === 0,
        detail: findings.length === 0 ? 'Keine nahezu identischen Entscheidungsbedingungen gefunden.' : `${findings.length} nahezu identische(s) Bedingungspaar(e) gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'feedback-loop-exit-condition',
    metric: 'exit_conditions',
    testCategory: 'exit_condition',
    evaluate(structure) {
      const loops = arr(structure.feedback_loops).filter((l) => l && typeof l.detail === 'string');
      const findings = loops
        .filter((loop) => !EXIT_SIGNAL_RE.test(loop.detail))
        .map((loop) =>
          createFinding({
            area: 'Feedback-Schleifen',
            location: loop.location,
            problem: 'Für diese Feedback-Schleife ist kein erkennbares Abbruchkriterium (Exit-Bedingung) im Text erkennbar.',
            cause: 'Der Trigger für eine Wiederholung wurde beschrieben, aber es wurde nicht erkennbar festgelegt, wann die Schleife verlassen wird (z.B. eine maximale Anzahl Versuche oder ein "bis ... erfolgreich").',
            impact: 'Ohne erkennbare Exit-Bedingung besteht das Risiko einer Endlosschleife oder eines undefinierten Abbruchverhaltens.',
            improvement_direction: 'Eine klare Bedingung ergänzen, unter der die Schleife beendet wird (z.B. maximale Anzahl Versuche, erreichtes Ergebnis).',
            watch_for: 'Dies ist eine textbasierte Heuristik (Suche nach Wörtern wie "until"/"bis", einer Zahl + "Mal/times", "stop"/"abort"); eine tatsächlich vorhandene, aber anders formulierte Exit-Bedingung kann übersehen werden.',
            context: `Erkannter Text: "${loop.detail}"`,
            severity: 'HIGH',
            metric: 'exit_conditions',
          }),
        );
      return {
        passed: findings.length === 0,
        detail: findings.length === 0 ? 'Alle Feedback-Schleifen haben ein erkennbares Abbruchkriterium.' : `${findings.length} Feedback-Schleife(n) ohne erkennbares Abbruchkriterium gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'retry-mechanism-has-limit',
    metric: 'exit_conditions',
    testCategory: 'boundary',
    evaluate(structure) {
      const retries = arr(structure.retry_mechanisms).filter((r) => r && typeof r.detail === 'string');
      const findings = retries
        .filter((r) => !EXIT_SIGNAL_RE.test(r.detail))
        .map((r) =>
          createFinding({
            area: 'Retry-Mechanismen',
            location: r.location,
            problem: 'Für diesen Retry-Mechanismus ist keine erkennbare Obergrenze oder Abbruchbedingung im Text erkennbar.',
            cause: 'Ein Wiederholungsversuch wird beschrieben, aber es wird nicht erkennbar begrenzt, wie oft wiederholt wird oder wann aufgegeben wird.',
            impact: 'Ein unbegrenzter Retry-Mechanismus riskiert wiederholte Fehlversuche ohne Fortschritt (z.B. bei einem dauerhaft nicht verfügbaren Tool).',
            improvement_direction: 'Eine explizite Obergrenze (z.B. "maximal 3 Versuche") oder ein klares Abbruchkriterium ergänzen.',
            watch_for: 'Dies ist eine textbasierte Heuristik; eine an anderer Stelle im Skill zentral definierte Obergrenze wird hier möglicherweise nicht erkannt.',
            context: `Erkannter Text: "${r.detail}"`,
            severity: 'MEDIUM',
            metric: 'exit_conditions',
          }),
        );
      return {
        passed: findings.length === 0,
        detail: findings.length === 0 ? 'Alle Retry-Mechanismen haben eine erkennbare Obergrenze.' : `${findings.length} Retry-Mechanismus/-men ohne erkennbare Obergrenze gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'feedback-loop-target-step-exists',
    metric: 'dead_end_detection',
    testCategory: 'dead_end',
    evaluate(structure) {
      const stepIds = new Set(arr(structure.steps).map((s) => s && s.id).filter((id) => id !== undefined));
      const loops = arr(structure.feedback_loops).filter((l) => l && typeof l.detail === 'string');
      const findings = [];
      for (const loop of loops) {
        const match = /\b(?:step|schritt)\s+(\d+)\b/i.exec(loop.detail);
        if (!match) continue;
        const targetId = Number(match[1]);
        if (!stepIds.has(targetId)) {
          findings.push(
            createFinding({
              area: 'Erreichbarkeit / Dead Ends',
              location: loop.location,
              problem: `Die Feedback-Schleife verweist auf Schritt ${targetId}, der im Skill nicht existiert.`,
              cause: 'Der Zielschritt der Schleife wurde umbenannt oder entfernt, ohne die Schleifen-Referenz anzupassen.',
              impact: 'Ein Sprung zu einem nicht existierenden Schritt ist ein Dead End: der Ablauf kann an dieser Stelle nicht sinnvoll fortgesetzt werden.',
              improvement_direction: 'Die Schleifen-Referenz auf einen existierenden Schritt korrigieren.',
              watch_for: 'Nach jeder Umnummerierung von Schritten auch alle "loop back to step N"-Formulierungen prüfen.',
              context: `Erkannter Text: "${loop.detail}"; bekannte Schritt-IDs: ${[...stepIds].join(', ') || '(keine)'}.`,
              severity: 'HIGH',
              metric: 'dead_end_detection',
            }),
          );
        }
      }
      return {
        passed: findings.length === 0,
        detail: findings.length === 0 ? 'Alle Feedback-Schleifen verweisen auf existierende Schritte (soweit erkennbar).' : `${findings.length} Feedback-Schleife(n) mit nicht auffindbarem Zielschritt gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'missing-declared-outputs',
    metric: 'process_transitions',
    testCategory: 'e2e',
    evaluate(structure) {
      const stepCount = structure.step_count || 0;
      const inputs = arr(structure.inputs);
      const outputs = arr(structure.outputs);
      const passed = !(stepCount > 1 && inputs.length > 0 && outputs.length === 0);
      if (passed) {
        return { passed, detail: 'Outputs sind dokumentiert oder für diesen Skill nicht erforderlich.', findings: [] };
      }
      return {
        passed,
        detail: 'Der Prozess hat definierte Inputs, aber keine dokumentierten Outputs.',
        findings: [
          createFinding({
            area: 'End-to-End-Ablauf',
            location: 'Abschnitt "Outputs" (bzw. dessen Fehlen)',
            problem: 'Der mehrstufige Prozess hat definierte Inputs, aber es sind keine Outputs dokumentiert.',
            cause: 'Es fehlt ein Abschnitt, der beschreibt, was der Prozess am Ende erzeugt.',
            impact: 'Ohne dokumentiertes Ergebnis ist unklar, ob und wie der End-to-End-Ablauf tatsächlich zu einem verwertbaren Resultat führt — ein möglicher impliziter Dead End.',
            improvement_direction: 'Einen Abschnitt ergänzen, der das/die Endergebnis(se) des Prozesses benennt.',
            watch_for: 'Manche Skills erzeugen ihr Ergebnis nur als Seiteneffekt (z.B. eine Nachricht an den Nutzer); das sollte dann trotzdem kurz benannt werden.',
            context: `Analyzer-Ergebnis: step_count=${stepCount}, inputs=${inputs.length}, outputs=0.`,
            severity: 'MEDIUM',
            metric: 'process_transitions',
          }),
        ],
      };
    },
  },
];

module.exports = { processRules };
