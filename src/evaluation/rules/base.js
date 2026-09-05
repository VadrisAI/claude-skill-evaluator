'use strict';

const { createFinding } = require('../findings');
const { containsVagueLanguage, looksImperative, jaccardSimilarity, normalize } = require('../textUtils');

function arr(x) {
  return Array.isArray(x) ? x : [];
}

/**
 * Base rules: apply to every skill regardless of complexity_class.
 * Each rule returns { passed, detail, findings } from evaluate(structure, ctx).
 * `ctx.skillPath` is available for the "location" wording where useful.
 */
const baseRules = [
  {
    id: 'structure-has-skill-md',
    metric: 'structure_quality',
    testCategory: 'standard',
    evaluate(structure) {
      const passed = structure.has_skill_md === true;
      if (passed) return { passed, detail: 'SKILL.md wurde gefunden.', findings: [] };
      return {
        passed,
        detail: 'Keine SKILL.md gefunden oder sie konnte nicht geparst werden.',
        findings: [
          createFinding({
            area: 'Struktur',
            location: 'Skill-Wurzelverzeichnis',
            problem: 'Es wurde keine gültige SKILL.md-Datei gefunden.',
            cause: 'Die Datei fehlt, liegt am falschen Ort, oder ihr Format konnte vom Analyzer nicht erkannt werden.',
            impact: 'Ohne SKILL.md kann Claude Zweck, Trigger-Bedingungen und Umfang des Skills nicht zuverlässig erkennen; der Skill wird möglicherweise gar nicht aktiviert.',
            improvement_direction: 'Eine SKILL.md im Wurzelverzeichnis des Skills mit klarer Zweckbeschreibung ergänzen bzw. deren Format prüfen.',
            watch_for: 'Die Datei muss im Skill-Wurzelverzeichnis liegen und dem erwarteten SKILL.md-Format entsprechen.',
            context: 'Analyzer-Ergebnis: structure.has_skill_md = false.',
            severity: 'CRITICAL',
            metric: 'structure_quality',
          }),
        ],
      };
    },
  },

  {
    id: 'instruction-count-nonzero',
    metric: 'instruction_quality',
    testCategory: 'standard',
    evaluate(structure) {
      const count = structure.instruction_count || 0;
      const passed = count > 0;
      if (passed) return { passed, detail: `${count} Instruktion(en) erkannt.`, findings: [] };
      return {
        passed,
        detail: 'Keine Instruktionen erkannt.',
        findings: [
          createFinding({
            area: 'Instructions',
            location: 'Gesamter Skill',
            problem: 'Der Skill enthält keine erkennbaren Instruktionen.',
            cause: 'Der Inhalt der SKILL.md besteht nicht aus vom Analyzer erkennbaren Anweisungen (z.B. leere Datei oder rein beschreibender Text ohne Handlungsanweisungen).',
            impact: 'Claude erhält keine konkrete Anleitung, was beim Aktivieren des Skills zu tun ist.',
            improvement_direction: 'Konkrete, handlungsorientierte Anweisungen ergänzen, die beschreiben, was bei Aktivierung des Skills zu tun ist.',
            watch_for: 'Beschreibender Fließtext allein reicht nicht aus; es braucht ausführbare Schritte.',
            context: 'Analyzer-Ergebnis: structure.instruction_count = 0.',
            severity: 'CRITICAL',
            metric: 'instruction_quality',
          }),
        ],
      };
    },
  },

  {
    id: 'vague-language',
    metric: 'precision',
    testCategory: 'ambiguous',
    evaluate(structure) {
      const instructions = arr(structure.instructions);
      const hits = instructions.filter((i) => i && typeof i.text === 'string' && containsVagueLanguage(i.text));
      const passed = hits.length === 0;
      const findings = hits.map((i) =>
        createFinding({
          area: 'Instruction-Präzision',
          location: `Instruction "${i.id ?? '(ohne id)'}"${i.section ? ` (Abschnitt: ${i.section})` : ''}`,
          problem: 'Die Instruction enthält unpräzise/vage Formulierungen (z.B. "vielleicht", "eventuell", "try to").',
          cause: 'Weiche Formulierungen statt klarer, verbindlicher Handlungsanweisungen.',
          impact: 'Claude kann das gewünschte Verhalten unterschiedlich interpretieren, was zu inkonsistentem Verhalten zwischen Ausführungen führt.',
          improvement_direction: 'Vage Formulierungen durch eindeutige, verbindliche Anweisungen ersetzen (klar festlegen, was in welchem Fall zu tun ist, statt Möglichkeiten offenzulassen).',
          watch_for: 'Nicht jede Unsicherheit lässt sich vermeiden; wo eine Bedingung tatsächlich optional ist, sollte das explizit als Bedingung (nicht als vage Formulierung) ausgedrückt werden.',
          context: `Erkannter Text (Ausschnitt): "${i.text.slice(0, 160)}"`,
          severity: 'MEDIUM',
          metric: 'precision',
        }),
      );
      return {
        passed,
        detail: passed
          ? 'Keine vagen Formulierungen gefunden.'
          : `${hits.length} von ${instructions.length} Instruktionen enthalten vage Formulierungen.`,
        findings,
      };
    },
  },

  {
    id: 'instruction-too-short',
    metric: 'clarity',
    testCategory: 'standard',
    evaluate(structure) {
      const instructions = arr(structure.instructions);
      const hits = instructions.filter((i) => i && typeof i.text === 'string' && i.text.trim().length > 0 && i.text.trim().length < 15);
      const passed = hits.length === 0;
      const findings = hits.map((i) =>
        createFinding({
          area: 'Instruction-Klarheit',
          location: `Instruction "${i.id ?? '(ohne id)'}"${i.section ? ` (Abschnitt: ${i.section})` : ''}`,
          problem: 'Die Instruction ist auffällig kurz und liefert wahrscheinlich zu wenig Kontext.',
          cause: 'Die Anweisung besteht nur aus wenigen Wörtern ohne erkennbare Handlungsdetails.',
          impact: 'Zu knappe Instruktionen lassen Interpretationsspielraum und erschweren zuverlässiges Verhalten.',
          improvement_direction: 'Prüfen, ob die Instruction genug Kontext enthält (was, wann, womit), und bei Bedarf ausführen.',
          watch_for: 'Kürze allein ist kein Fehler, wenn der Kontext an anderer Stelle im Skill eindeutig hergestellt wird.',
          context: `Erkannter Text: "${i.text.trim()}"`,
          severity: 'LOW',
          metric: 'clarity',
        }),
      );
      return {
        passed,
        detail: passed ? 'Keine auffällig kurzen Instruktionen gefunden.' : `${hits.length} auffällig kurze Instruktion(en) gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'instruction-too-long',
    metric: 'context_efficiency',
    testCategory: 'boundary',
    evaluate(structure) {
      const instructions = arr(structure.instructions);
      const hits = instructions.filter((i) => i && typeof i.text === 'string' && i.text.length > 800);
      const passed = hits.length === 0;
      const findings = hits.map((i) =>
        createFinding({
          area: 'Kontext-/Token-Effizienz',
          location: `Instruction "${i.id ?? '(ohne id)'}"${i.section ? ` (Abschnitt: ${i.section})` : ''}`,
          problem: 'Die Instruction ist sehr lang (über 800 Zeichen am Stück).',
          cause: 'Mehrere Anweisungen oder viel Kontext wurden in einem einzigen Instruction-Block zusammengefasst.',
          impact: 'Lange, unstrukturierte Blöcke erhöhen den Token-Verbrauch und erschweren es, einzelne Teilanweisungen zuverlässig zu befolgen.',
          improvement_direction: 'Prüfen, ob sich der Block in kleinere, klar benannte Teilschritte oder eine Referenzdatei auslagern lässt.',
          watch_for: 'Nicht jede lange Passage ist ein Problem, z.B. wenn es sich um notwendige Beispieldaten handelt.',
          context: `Länge: ${i.text.length} Zeichen.`,
          severity: 'MEDIUM',
          metric: 'context_efficiency',
        }),
      );
      return {
        passed,
        detail: passed ? 'Keine übermäßig langen Instruktionen gefunden.' : `${hits.length} übermäßig lange Instruktion(en) gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'duplicate-instructions',
    metric: 'redundancy',
    testCategory: 'standard',
    evaluate(structure) {
      const instructions = arr(structure.instructions).filter((i) => i && typeof i.text === 'string' && i.text.trim() !== '');
      const findings = [];
      const reportedPairs = new Set();
      for (let a = 0; a < instructions.length; a += 1) {
        for (let b = a + 1; b < instructions.length; b += 1) {
          const similarity = jaccardSimilarity(instructions[a].text, instructions[b].text);
          if (similarity >= 0.85) {
            const pairKey = `${instructions[a].id}::${instructions[b].id}`;
            if (reportedPairs.has(pairKey)) continue;
            reportedPairs.add(pairKey);
            findings.push(
              createFinding({
                area: 'Redundanz',
                location: `Instructions "${instructions[a].id}" und "${instructions[b].id}"`,
                problem: 'Zwei Instruktionen sind inhaltlich nahezu identisch.',
                cause: 'Der Inhalt wurde vermutlich kopiert oder an zwei Stellen unabhängig formuliert.',
                impact: 'Redundante Anweisungen erhöhen den Token-Verbrauch und schaffen Risiko für künftige Inkonsistenz, wenn nur eine Kopie gepflegt wird.',
                improvement_direction: 'Prüfen, ob eine der beiden Instruktionen entfernt oder beide zusammengeführt werden können.',
                watch_for: 'Absichtliche Wiederholung zur Betonung eines kritischen Punkts ist nicht automatisch ein Fehler.',
                context: `Textähnlichkeit (Jaccard über Wortmengen): ${similarity.toFixed(2)}.`,
                severity: 'MEDIUM',
                metric: 'redundancy',
              }),
            );
          }
        }
      }
      return {
        passed: findings.length === 0,
        detail: findings.length === 0 ? 'Keine nahezu identischen Instruktionspaare gefunden.' : `${findings.length} redundante(s) Instruktionspaar(e) gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'contradictory-always-never',
    metric: 'contradictions',
    testCategory: 'consistency',
    evaluate(structure) {
      const instructions = arr(structure.instructions).filter((i) => i && typeof i.text === 'string');
      const alwaysRe = /\b(immer|always)\b/i;
      const neverRe = /\b(nie|niemals|never)\b/i;
      const alwaysInstr = instructions.filter((i) => alwaysRe.test(i.text));
      const neverInstr = instructions.filter((i) => neverRe.test(i.text));
      const findings = [];
      const reported = new Set();
      for (const a of alwaysInstr) {
        for (const n of neverInstr) {
          if (a.id === n.id) continue;
          const similarity = jaccardSimilarity(a.text, n.text);
          if (similarity >= 0.4) {
            const key = `${a.id}::${n.id}`;
            if (reported.has(key)) continue;
            reported.add(key);
            findings.push(
              createFinding({
                area: 'Widersprüche',
                location: `Instructions "${a.id}" und "${n.id}"`,
                problem: 'Eine Instruction verwendet "immer"/"always", eine inhaltlich ähnliche andere "nie"/"never" zu einem überlappenden Thema.',
                cause: 'Mögliche widersprüchliche Regeln, die zu unterschiedlichen Zeitpunkten oder von unterschiedlichen Autoren formuliert wurden.',
                impact: 'Widersprüchliche Regeln erzeugen unvorhersehbares Verhalten, da unklar ist, welche Regel Vorrang hat.',
                improvement_direction: 'Beide Stellen gegenüberstellen und klären, ob tatsächlich ein Widerspruch vorliegt; falls ja, eine eindeutige Regel mit klar definierten Ausnahmen formulieren.',
                watch_for: 'Dies ist eine heuristische, wortbasierte Erkennung — sie kann Fehlalarme liefern, wenn sich "immer"/"nie" auf unterschiedliche Bedingungen beziehen.',
                context: `Textähnlichkeit zwischen den beiden Stellen: ${similarity.toFixed(2)}.`,
                severity: 'HIGH',
                metric: 'contradictions',
              }),
            );
          }
        }
      }
      return {
        passed: findings.length === 0,
        detail: findings.length === 0 ? 'Keine offensichtlichen immer/nie-Widersprüche gefunden.' : `${findings.length} möglicher Widerspruch/Widersprüche gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'undefined-tool-dependency',
    metric: 'misconfiguration_risk',
    testCategory: 'failure',
    evaluate(structure) {
      const tools = arr(structure.tool_dependencies);
      const hits = tools.filter((t) => t && t.defined === false);
      const passed = hits.length === 0;
      const findings = hits.map((t) =>
        createFinding({
          area: 'Tool-Abhängigkeiten',
          location: `Tool "${t.tool ?? '(unbenannt)'}" referenziert in "${t.referenced_in ?? '(unbekannt)'}"`,
          problem: 'Ein referenziertes Tool ist als nicht eindeutig definiert/verfügbar markiert.',
          cause: 'Das Tool wird in einer Instruction verwendet, ist aber nicht klar deklariert, verfügbar oder mit den erwarteten Berechtigungen versehen.',
          impact: 'Der Skill kann zur Laufzeit fehlschlagen oder ein falsches Tool aufrufen, wenn die Abhängigkeit unklar bleibt.',
          improvement_direction: 'Tool-Abhängigkeiten explizit auflisten und deren Verfügbarkeit/Berechtigungen dokumentieren.',
          watch_for: 'Auch optionale/alternative Tools sollten als solche gekennzeichnet werden, statt implizit vorausgesetzt zu werden.',
          context: `Analyzer-Ergebnis: defined=false für dieses Tool.`,
          severity: 'HIGH',
          metric: 'misconfiguration_risk',
        }),
      );
      return {
        passed,
        detail: passed ? 'Alle referenzierten Tools sind eindeutig definiert.' : `${hits.length} unklar definierte Tool-Abhängigkeit(en) gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'no-failure-handling-declared',
    metric: 'robustness',
    testCategory: 'failure',
    evaluate(structure) {
      const instructionCount = structure.instruction_count || 0;
      const failureHandling = arr(structure.failure_handling);
      const passed = instructionCount === 0 || failureHandling.length > 0;
      if (passed) {
        return { passed, detail: 'Failure-Handling ist vorhanden oder nicht erforderlich.', findings: [] };
      }
      return {
        passed,
        detail: 'Kein Failure-Handling im Skill erkennbar.',
        findings: [
          createFinding({
            area: 'Robustheit / Edge Cases',
            location: 'Gesamter Skill',
            problem: 'Es sind keine Failure-Handling- bzw. Fehlerfall-Definitionen erkennbar.',
            cause: 'Der Skill beschreibt nur den Erfolgsfall, nicht wie mit fehlschlagenden Schritten, unerwarteten Eingaben oder Tool-Fehlern umzugehen ist.',
            impact: 'Bei unerwarteten Bedingungen fehlt Claude eine definierte Reaktion, was zu inkonsistentem oder unsicherem Verhalten führen kann.',
            improvement_direction: 'Mindestens für die wahrscheinlichsten Fehlerfälle (fehlende Eingabe, Tool-Fehler, unerwartetes Format) ein erwartetes Verhalten festlegen.',
            watch_for: 'Nicht jeder Skill braucht umfangreiches Failure-Handling; bei sehr einfachen, risikoarmen Aufgaben kann der Aufwand unverhältnismäßig sein.',
            context: 'Analyzer-Ergebnis: structure.failure_handling ist leer.',
            severity: 'MEDIUM',
            metric: 'robustness',
          }),
        ],
      };
    },
  },

  {
    id: 'instructions-not-imperative',
    metric: 'instruction_quality',
    testCategory: 'instruction_following',
    evaluate(structure) {
      const instructions = arr(structure.instructions).filter((i) => i && typeof i.text === 'string' && i.text.trim() !== '');
      if (instructions.length === 0) {
        return { passed: true, detail: 'Keine Instruktionen zu prüfen.', findings: [] };
      }
      const imperativeCount = instructions.filter((i) => looksImperative(i.text)).length;
      const ratio = imperativeCount / instructions.length;
      const passed = ratio >= 0.5;
      const findings = passed
        ? []
        : [
            createFinding({
              area: 'Instruction-Following',
              location: 'Gesamter Instruktionssatz',
              problem: 'Ein Großteil der Instruktionen beginnt nicht mit einer erkennbaren, handlungsorientierten Formulierung (Imperativ).',
              cause: 'Instruktionen sind eher beschreibend/erklärend formuliert statt als direkte Handlungsanweisung.',
              impact: 'Beschreibende statt handlungsorientierte Formulierungen können dazu führen, dass Claude eine Anweisung als Hintergrundinformation statt als auszuführenden Schritt interpretiert.',
              improvement_direction: 'Prüfen, welche Instruktionen als konkrete Handlung (z.B. mit einem Verb beginnend) umformuliert werden sollten.',
              watch_for: 'Dies ist eine heuristische Prüfung auf Basis eines Verb-Musters am Satzanfang; sie kann bei stilistisch abweichenden, aber klaren Instruktionen einen Fehlalarm liefern.',
              context: `${imperativeCount} von ${instructions.length} Instruktionen wurden als imperativ erkannt (Schwelle: 50%).`,
              severity: 'LOW',
              metric: 'instruction_quality',
            }),
          ];
      return {
        passed,
        detail: `${imperativeCount} von ${instructions.length} Instruktionen wirken handlungsorientiert formuliert.`,
        findings,
      };
    },
  },

  {
    id: 'declared-resources-unreferenced',
    metric: 'misconfiguration_risk',
    testCategory: 'standard',
    evaluate(structure) {
      const resources = arr(structure.resources);
      if (resources.length === 0 || typeof structure.full_text !== 'string') {
        return { passed: true, detail: 'Keine Ressourcen deklariert oder kein Volltext zur Prüfung verfügbar.', findings: [] };
      }
      const text = structure.full_text.toLowerCase();
      const unreferenced = resources.filter((r) => typeof r === 'string' && !text.includes(r.toLowerCase().replace(/\/$/, '')));
      const passed = unreferenced.length === 0;
      const findings = unreferenced.map((r) =>
        createFinding({
          area: 'Ressourcen-Nutzung',
          location: `Ressource "${r}"`,
          problem: 'Eine deklarierte Ressource wird im sichtbaren Skill-Text nicht referenziert.',
          cause: 'Die Ressource wurde angelegt, aber keine Instruction verweist erkennbar darauf.',
          impact: 'Ungenutzte Ressourcen deuten auf tote Dateien oder eine fehlende Verknüpfung hin, wodurch Claude die Ressource möglicherweise nie lädt.',
          improvement_direction: 'Prüfen, ob die Ressource tatsächlich benötigt wird, und falls ja, eine Instruction ergänzen, die sie referenziert.',
          watch_for: 'Diese Prüfung ist rein textbasiert (Namens-/Pfad-Erwähnung); indirekte Referenzierung über generische Beschreibungen wird nicht erkannt.',
          context: `Deklarierte Ressourcen: ${resources.join(', ')}.`,
          severity: 'LOW',
          metric: 'misconfiguration_risk',
        }),
      );
      return {
        passed,
        detail: passed ? 'Alle deklarierten Ressourcen werden referenziert.' : `${unreferenced.length} deklarierte Ressource(n) ohne erkennbare Referenz.`,
        findings,
      };
    },
  },
];

module.exports = { baseRules };
