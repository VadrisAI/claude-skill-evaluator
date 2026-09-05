'use strict';

const { createFinding } = require('../findings');

function arr(x) {
  return Array.isArray(x) ? x : [];
}

/**
 * Process rules: only run when complexity_class === "multi_step_process".
 * They check process transitions, dependencies, decision logic, feedback
 * loops, exit conditions, and dead ends, per spec.md's process-specific
 * bullet list.
 */
const processRules = [
  {
    id: 'dependency-references-valid',
    metric: 'dependency_management',
    testCategory: 'dependency',
    evaluate(structure) {
      const instructionIds = new Set(arr(structure.instructions).map((i) => i && i.id).filter(Boolean));
      const dependencies = arr(structure.dependencies);
      const findings = [];
      for (const dep of dependencies) {
        if (!dep) continue;
        const missingFrom = dep.from && !instructionIds.has(dep.from);
        const missingTo = dep.to && dep.type !== 'resource' && dep.type !== 'tool' && !instructionIds.has(dep.to);
        if (missingFrom || missingTo) {
          findings.push(
            createFinding({
              area: 'Abhängigkeiten',
              location: `Dependency "${dep.id ?? '(ohne id)'}" (${dep.from ?? '?'} -> ${dep.to ?? '?'})`,
              problem: 'Eine Abhängigkeit verweist auf einen Schritt, der im Skill nicht existiert.',
              cause: 'Ein referenzierter Schritt wurde umbenannt, entfernt, oder die Abhängigkeit wurde falsch eingetragen.',
              impact: 'Eine undefinierte Abhängigkeit kann dazu führen, dass der Prozess an dieser Stelle ins Leere läuft oder nicht wie vorgesehen fortgesetzt wird.',
              improvement_direction: 'Prüfen, ob der referenzierte Schritt umbenannt oder entfernt wurde, und die Abhängigkeit entsprechend korrigieren.',
              watch_for: 'Auch indirekte Referenzen (z.B. über eine Zwischenvariable) sollten konsistent auf existierende Schritte verweisen.',
              context: `Bekannte Instruction-IDs: ${[...instructionIds].join(', ') || '(keine)'}.`,
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
    id: 'decision-points-have-branches',
    metric: 'decision_logic',
    testCategory: 'decision_logic',
    evaluate(structure) {
      const decisionPoints = arr(structure.decision_points);
      const findings = [];
      for (const dp of decisionPoints) {
        if (!dp) continue;
        const branches = arr(dp.branches);
        if (branches.length < 2) {
          findings.push(
            createFinding({
              area: 'Entscheidungslogik',
              location: `Entscheidungspunkt "${dp.id ?? '(ohne id)'}" in Instruction "${dp.instruction_id ?? '(unbekannt)'}"`,
              problem: 'Der Entscheidungspunkt hat weniger als zwei definierte Verzweigungen.',
              cause: 'Es wurde nur ein möglicher Ausgang beschrieben, oder alternative Fälle wurden nicht ausformuliert.',
              impact: 'Ohne echte Verzweigung ist unklar, was bei Nichteintreten der Bedingung geschehen soll — ein potenzieller Dead End.',
              improvement_direction: 'Für die Bedingung mindestens einen Alternativpfad (inkl. Verhalten bei Nichterfüllung) ergänzen.',
              watch_for: 'Eine bewusste Ja/Abbruch-Logik ist zulässig, sollte dann aber explizit einen Abbruch-/Exit-Pfad benennen statt implizit zu enden.',
              context: `Bedingung: "${dp.condition ?? '(nicht angegeben)'}", erkannte Branches: ${branches.length}.`,
              severity: 'MEDIUM',
              metric: 'decision_logic',
            }),
          );
        }
      }
      return {
        passed: findings.length === 0,
        detail: findings.length === 0 ? 'Alle Entscheidungspunkte haben mindestens zwei Verzweigungen.' : `${findings.length} Entscheidungspunkt(e) ohne echte Verzweigung gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'decision-branch-targets-exist',
    metric: 'process_transitions',
    testCategory: 'process_transition',
    evaluate(structure) {
      const instructionIds = new Set(arr(structure.instructions).map((i) => i && i.id).filter(Boolean));
      const decisionPoints = arr(structure.decision_points);
      const findings = [];
      for (const dp of decisionPoints) {
        if (!dp) continue;
        const badBranches = arr(dp.branches).filter((b) => b && !instructionIds.has(b));
        if (badBranches.length > 0) {
          findings.push(
            createFinding({
              area: 'Prozessübergänge',
              location: `Entscheidungspunkt "${dp.id ?? '(ohne id)'}" in Instruction "${dp.instruction_id ?? '(unbekannt)'}"`,
              problem: 'Eine Verzweigung verweist auf einen Schritt, der im Skill nicht existiert.',
              cause: 'Der Zielschritt wurde umbenannt oder entfernt, ohne die Verzweigung anzupassen.',
              impact: 'Wird dieser Zweig gewählt, endet der Prozess an einem nicht existierenden Schritt — ein Dead End.',
              improvement_direction: 'Die Verzweigung auf einen existierenden Schritt korrigieren oder den fehlenden Schritt ergänzen.',
              watch_for: 'Nach jeder Umbenennung von Schritten alle Verzweigungsziele im gesamten Skill neu prüfen.',
              context: `Nicht auffindbare Ziel-IDs: ${badBranches.join(', ')}.`,
              severity: 'HIGH',
              metric: 'process_transitions',
            }),
          );
        }
      }
      return {
        passed: findings.length === 0,
        detail: findings.length === 0 ? 'Alle Verzweigungsziele existieren.' : `${findings.length} Entscheidungspunkt(e) mit nicht auffindbarem Verzweigungsziel gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'feedback-loop-exit-condition',
    metric: 'exit_conditions',
    testCategory: 'exit_condition',
    evaluate(structure) {
      const loops = arr(structure.feedback_loops);
      const findings = [];
      for (const loop of loops) {
        if (!loop) continue;
        if (!loop.exit_condition || String(loop.exit_condition).trim() === '') {
          findings.push(
            createFinding({
              area: 'Feedback-Schleifen',
              location: `Feedback-Loop "${loop.id ?? '(ohne id)'}" in Instruction "${loop.instruction_id ?? '(unbekannt)'}"`,
              problem: 'Die Feedback-Schleife hat keine definierte Exit-Bedingung.',
              cause: 'Der Trigger für eine Wiederholung wurde beschrieben, aber es wurde nicht festgelegt, wann die Schleife verlassen wird.',
              impact: 'Ohne Exit-Bedingung besteht das Risiko einer Endlosschleife oder eines undefinierten Abbruchverhaltens.',
              improvement_direction: 'Eine klare Bedingung ergänzen, unter der die Schleife beendet wird (z.B. maximale Anzahl Versuche, erreichtes Ergebnis).',
              watch_for: 'Auch ein impliziter Abbruch durch externe Faktoren (z.B. Zeitlimit der Umgebung) sollte nicht als einzige Exit-Bedingung vorausgesetzt werden.',
              context: `Trigger der Schleife: "${loop.trigger ?? '(nicht angegeben)'}".`,
              severity: 'HIGH',
              metric: 'exit_conditions',
            }),
          );
        }
      }
      return {
        passed: findings.length === 0,
        detail: findings.length === 0 ? 'Alle Feedback-Schleifen haben eine definierte Exit-Bedingung.' : `${findings.length} Feedback-Schleife(n) ohne Exit-Bedingung gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'unreachable-steps',
    metric: 'dead_end_detection',
    testCategory: 'dead_end',
    evaluate(structure) {
      const instructions = arr(structure.instructions).filter((i) => i && i.id);
      if (instructions.length < 2) {
        return { passed: true, detail: 'Zu wenige Schritte, um Erreichbarkeit sinnvoll zu prüfen.', findings: [] };
      }
      const referenced = new Set();
      for (const dep of arr(structure.dependencies)) {
        if (dep && dep.to) referenced.add(dep.to);
      }
      for (const dp of arr(structure.decision_points)) {
        for (const b of arr(dp && dp.branches)) referenced.add(b);
      }
      const sorted = [...instructions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const entryId = sorted[0].id;
      const unreachable = sorted.filter((i) => i.id !== entryId && !referenced.has(i.id));
      const findings = unreachable.map((i) =>
        createFinding({
          area: 'Erreichbarkeit / Dead Ends',
          location: `Instruction "${i.id}"${i.section ? ` (Abschnitt: ${i.section})` : ''}`,
          problem: 'Für diesen Schritt wurde kein eingehender Prozessübergang (Dependency oder Verzweigung) gefunden.',
          cause: 'Der Schritt wurde vermutlich ergänzt, ohne ihn aus dem bestehenden Ablauf heraus zu verknüpfen.',
          impact: 'Ein nicht erreichbarer Schritt wird im normalen Ablauf nie ausgeführt und bindet unnötig Komplexität/Tokens.',
          improvement_direction: 'Prüfen, ob dieser Schritt von einem vorherigen Schritt aus erreichbar gemacht werden muss, oder ob er entfernt werden kann.',
          watch_for: 'Diese Prüfung basiert nur auf expliziten Dependencies/Verzweigungen aus dem Analyzer-Output; implizite sequenzielle Reihenfolge ohne deklarierte Übergänge wird als nicht erreichbar gewertet.',
          context: `Erkannte eingehende Referenzen im gesamten Skill: ${[...referenced].join(', ') || '(keine)'}.`,
          severity: 'MEDIUM',
          metric: 'dead_end_detection',
        }),
      );
      return {
        passed: findings.length === 0,
        detail: findings.length === 0 ? 'Alle Schritte sind über mindestens einen Übergang erreichbar.' : `${findings.length} potenziell nicht erreichbare(r) Schritt(e) gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'end-to-end-path-exists',
    metric: 'process_transitions',
    testCategory: 'e2e',
    evaluate(structure) {
      const instructions = arr(structure.instructions).filter((i) => i && i.id);
      if (instructions.length < 2) {
        return { passed: true, detail: 'Zu wenige Schritte für eine End-to-End-Prüfung.', findings: [] };
      }
      const outgoing = new Set();
      for (const dep of arr(structure.dependencies)) {
        if (dep && dep.from) outgoing.add(dep.from);
      }
      for (const dp of arr(structure.decision_points)) {
        if (dp && dp.instruction_id) outgoing.add(dp.instruction_id);
      }
      const sorted = [...instructions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const nonTerminal = sorted.slice(0, -1);
      const deadEnds = nonTerminal.filter((i) => !outgoing.has(i.id));
      const passed = deadEnds.length === 0;
      const findings = passed
        ? []
        : [
            createFinding({
              area: 'End-to-End-Ablauf',
              location: `Instruction(s): ${deadEnds.map((i) => i.id).join(', ')}`,
              problem: 'Ein oder mehrere nicht-letzte Schritte haben keinen erkennbaren ausgehenden Übergang zum nächsten Schritt.',
              cause: 'Der Prozessfluss wurde an dieser Stelle nicht explizit mit dem nächsten Schritt verknüpft.',
              impact: 'Der End-to-End-Ablauf kann an dieser Stelle abbrechen (Dead End), ohne dass dies beabsichtigt ist.',
              improvement_direction: 'Für jeden Zwischenschritt einen expliziten Übergang zum jeweils nächsten Schritt oder zu einer Verzweigung ergänzen.',
              watch_for: 'Ein Schritt kann absichtlich ein Zwischenergebnis erzeugen, das erst später verwendet wird — das ist kein Dead End, sollte aber trotzdem als Übergang erkennbar dokumentiert sein.',
              context: `Schritte mit erkanntem ausgehendem Übergang: ${[...outgoing].join(', ') || '(keine)'}.`,
              severity: 'MEDIUM',
              metric: 'process_transitions',
            }),
          ];
      return {
        passed,
        detail: passed ? 'Für alle Zwischenschritte existiert ein ausgehender Übergang.' : `${deadEnds.length} Zwischenschritt(e) ohne ausgehenden Übergang gefunden.`,
        findings,
      };
    },
  },
];

module.exports = { processRules };
