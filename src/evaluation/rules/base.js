'use strict';

const { createFinding } = require('../findings');
const { containsVagueLanguage, looksImperative, jaccardSimilarity } = require('../textUtils');
const { collectTextUnits } = require('../structureText');

function arr(x) {
  return Array.isArray(x) ? x : [];
}

/**
 * Base rules: apply to every skill regardless of complexity_class.
 * Each rule returns { passed, detail, findings } from evaluate(structure).
 *
 * These are written against the real Analyzer output shape (src/analyzer/,
 * merged in PR #1): `steps[]` with numeric ids, flat `tool_dependencies[]`
 * strings with no defined/undefined flag, and `decision_points` /
 * `feedback_loops` / `retry_mechanisms` / `failure_handling` as
 * `{location, condition|detail}` keyword-scanned lines rather than
 * structured objects with branches/exit-condition/ids. See
 * docs/architecture.md's "1 -> 2" section and its 2026-09-05 (Module 2)
 * note for what that does and doesn't let this module check.
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
            problem: 'Der Skill enthält keine erkennbaren Instruktionen (Listenpunkte).',
            cause: 'Der Inhalt der SKILL.md besteht nicht aus vom Analyzer erkennbaren Anweisungen (z.B. leere Datei oder rein beschreibender Fließtext ohne Liste).',
            impact: 'Claude erhält keine konkrete Anleitung, was beim Aktivieren des Skills zu tun ist.',
            improvement_direction: 'Konkrete, handlungsorientierte Anweisungen ergänzen, die beschreiben, was bei Aktivierung des Skills zu tun ist.',
            watch_for: 'Beschreibender Fließtext allein reicht nicht aus; es braucht ausführbare Schritte, idealerweise als Liste.',
            context: 'Analyzer-Ergebnis: structure.instruction_count = 0.',
            severity: 'CRITICAL',
            metric: 'instruction_quality',
          }),
        ],
      };
    },
  },

  {
    id: 'purpose-declared',
    metric: 'completeness',
    testCategory: 'standard',
    evaluate(structure) {
      const purpose = typeof structure.purpose === 'string' ? structure.purpose.trim() : '';
      const passed = purpose.length >= 15;
      if (passed) return { passed, detail: 'Ein Zweck (Purpose) wurde erkannt.', findings: [] };
      return {
        passed,
        detail: purpose ? 'Der erkannte Zweck ist auffällig kurz.' : 'Kein Zweck (Purpose) erkennbar.',
        findings: [
          createFinding({
            area: 'Zweckbeschreibung',
            location: 'Frontmatter "description" bzw. erster Absatz der SKILL.md',
            problem: purpose
              ? 'Der erkannte Zweck des Skills ist sehr kurz und wahrscheinlich uninformativ.'
              : 'Es konnte kein Zweck des Skills erkannt werden.',
            cause: 'Die Frontmatter-"description" fehlt oder ist leer, und auch der erste Absatz des Dokuments liefert keine brauchbare Zusammenfassung.',
            impact: 'Ohne erkennbaren Zweck kann weder Claude noch ein Nutzer schnell einschätzen, wofür der Skill gedacht ist und wann er greifen sollte.',
            improvement_direction: 'Eine kurze, aussagekräftige Zweckbeschreibung in der Frontmatter ("description") oder im ersten Absatz ergänzen.',
            watch_for: 'Die Beschreibung sollte konkret sagen, was der Skill tut und wann er verwendet werden soll, nicht nur einen Titel wiederholen.',
            context: `Erkannter Wert: ${purpose ? `"${purpose}"` : '(leer)'}`,
            severity: 'MEDIUM',
            metric: 'completeness',
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
      const units = collectTextUnits(structure);
      const hits = units.filter((u) => containsVagueLanguage(u.text));
      const passed = hits.length === 0;
      const findings = hits.map((u) =>
        createFinding({
          area: 'Instruction-Präzision',
          location: u.location,
          problem: 'An dieser Stelle wird eine unpräzise/vage Formulierung verwendet (z.B. "vielleicht", "eventuell", "try to").',
          cause: 'Weiche Formulierungen statt einer klaren, verbindlichen Handlungsanweisung.',
          impact: 'Claude kann das gewünschte Verhalten unterschiedlich interpretieren, was zu inkonsistentem Verhalten zwischen Ausführungen führt.',
          improvement_direction: 'Die vage Formulierung durch eine eindeutige, verbindliche Anweisung ersetzen (klar festlegen, was in welchem Fall zu tun ist, statt Möglichkeiten offenzulassen).',
          watch_for: 'Nicht jede Unsicherheit lässt sich vermeiden; wo eine Bedingung tatsächlich optional ist, sollte das explizit als Bedingung (nicht als vage Formulierung) ausgedrückt werden.',
          context: `Erkannter Text (Ausschnitt): "${u.text.slice(0, 160)}"`,
          severity: 'MEDIUM',
          metric: 'precision',
        }),
      );
      return {
        passed,
        detail: passed
          ? 'Keine vagen Formulierungen gefunden.'
          : `${hits.length} von ${units.length} geprüften Textstellen enthalten vage Formulierungen.`,
        findings,
      };
    },
  },

  {
    id: 'instruction-too-short',
    metric: 'clarity',
    testCategory: 'standard',
    evaluate(structure) {
      const units = collectTextUnits(structure);
      const hits = units.filter((u) => u.text.trim().length > 0 && u.text.trim().length < 15);
      const passed = hits.length === 0;
      const findings = hits.map((u) =>
        createFinding({
          area: 'Instruction-Klarheit',
          location: u.location,
          problem: 'Die Textstelle ist auffällig kurz und liefert wahrscheinlich zu wenig Kontext.',
          cause: 'Die Anweisung besteht nur aus wenigen Wörtern ohne erkennbare Handlungsdetails.',
          impact: 'Zu knappe Instruktionen lassen Interpretationsspielraum und erschweren zuverlässiges Verhalten.',
          improvement_direction: 'Prüfen, ob die Stelle genug Kontext enthält (was, wann, womit), und bei Bedarf ausführen.',
          watch_for: 'Kürze allein ist kein Fehler, wenn der Kontext an anderer Stelle im Skill eindeutig hergestellt wird.',
          context: `Erkannter Text: "${u.text.trim()}"`,
          severity: 'LOW',
          metric: 'clarity',
        }),
      );
      return {
        passed,
        detail: passed ? 'Keine auffällig kurzen Textstellen gefunden.' : `${hits.length} auffällig kurze Textstelle(n) gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'instruction-too-long',
    metric: 'context_efficiency',
    testCategory: 'boundary',
    evaluate(structure) {
      const units = collectTextUnits(structure);
      const hits = units.filter((u) => u.text.length > 800);
      const passed = hits.length === 0;
      const findings = hits.map((u) =>
        createFinding({
          area: 'Kontext-/Token-Effizienz',
          location: u.location,
          problem: 'Die Textstelle ist sehr lang (über 800 Zeichen am Stück).',
          cause: 'Mehrere Anweisungen oder viel Kontext wurden in einem einzigen Abschnitt zusammengefasst.',
          impact: 'Lange, unstrukturierte Blöcke erhöhen den Token-Verbrauch und erschweren es, einzelne Teilanweisungen zuverlässig zu befolgen.',
          improvement_direction: 'Prüfen, ob sich der Block in kleinere, klar benannte Teilschritte oder eine Referenzdatei auslagern lässt.',
          watch_for: 'Nicht jede lange Passage ist ein Problem, z.B. wenn es sich um notwendige Beispieldaten handelt.',
          context: `Länge: ${u.text.length} Zeichen.`,
          severity: 'MEDIUM',
          metric: 'context_efficiency',
        }),
      );
      return {
        passed,
        detail: passed ? 'Keine übermäßig langen Textstellen gefunden.' : `${hits.length} übermäßig lange Textstelle(n) gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'duplicate-instructions',
    metric: 'redundancy',
    testCategory: 'standard',
    evaluate(structure) {
      const units = collectTextUnits(structure).filter((u) => u.text.trim() !== '');
      const findings = [];
      const reportedPairs = new Set();
      for (let a = 0; a < units.length; a += 1) {
        for (let b = a + 1; b < units.length; b += 1) {
          const similarity = jaccardSimilarity(units[a].text, units[b].text);
          if (similarity >= 0.85) {
            const pairKey = `${units[a].location}::${units[b].location}`;
            if (reportedPairs.has(pairKey)) continue;
            reportedPairs.add(pairKey);
            findings.push(
              createFinding({
                area: 'Redundanz',
                location: `${units[a].location} und ${units[b].location}`,
                problem: 'Zwei Textstellen sind inhaltlich nahezu identisch.',
                cause: 'Der Inhalt wurde vermutlich kopiert oder an zwei Stellen unabhängig formuliert.',
                impact: 'Redundante Anweisungen erhöhen den Token-Verbrauch und schaffen Risiko für künftige Inkonsistenz, wenn nur eine Kopie gepflegt wird.',
                improvement_direction: 'Prüfen, ob eine der beiden Stellen entfernt oder beide zusammengeführt werden können.',
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
        detail: findings.length === 0 ? 'Keine nahezu identischen Textstellen-Paare gefunden.' : `${findings.length} redundante(s) Paar(e) gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'contradictory-always-never',
    metric: 'contradictions',
    testCategory: 'consistency',
    evaluate(structure) {
      const units = collectTextUnits(structure);
      const alwaysRe = /\b(immer|always)\b/i;
      const neverRe = /\b(nie|niemals|never)\b/i;
      const alwaysUnits = units.filter((u) => alwaysRe.test(u.text));
      const neverUnits = units.filter((u) => neverRe.test(u.text));
      const findings = [];
      const reported = new Set();
      for (const a of alwaysUnits) {
        for (const n of neverUnits) {
          if (a.location === n.location) continue;
          const similarity = jaccardSimilarity(a.text, n.text);
          if (similarity >= 0.4) {
            const key = `${a.location}::${n.location}`;
            if (reported.has(key)) continue;
            reported.add(key);
            findings.push(
              createFinding({
                area: 'Widersprüche',
                location: `${a.location} und ${n.location}`,
                problem: 'Eine Textstelle verwendet "immer"/"always", eine inhaltlich ähnliche andere "nie"/"never" zu einem überlappenden Thema.',
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
      const steps = arr(structure.steps).filter((s) => s && typeof s.description === 'string' && s.description.trim() !== '');
      if (steps.length === 0) {
        return { passed: true, detail: 'Keine nummerierten Schritte zu prüfen.', findings: [] };
      }
      const imperativeCount = steps.filter((s) => looksImperative(s.description)).length;
      const ratio = imperativeCount / steps.length;
      const passed = ratio >= 0.5;
      const findings = passed
        ? []
        : [
            createFinding({
              area: 'Instruction-Following',
              location: 'Schritt-Sequenz',
              problem: 'Ein Großteil der Schritte beginnt nicht mit einer erkennbaren, handlungsorientierten Formulierung (Imperativ).',
              cause: 'Schritte sind eher beschreibend/erklärend formuliert statt als direkte Handlungsanweisung.',
              impact: 'Beschreibende statt handlungsorientierte Formulierungen können dazu führen, dass Claude einen Schritt als Hintergrundinformation statt als auszuführende Handlung interpretiert.',
              improvement_direction: 'Prüfen, welche Schritte als konkrete Handlung (z.B. mit einem Verb beginnend) umformuliert werden sollten.',
              watch_for: 'Dies ist eine heuristische Prüfung auf Basis eines Verb-Musters am Satzanfang; sie kann bei stilistisch abweichenden, aber klaren Schritten einen Fehlalarm liefern.',
              context: `${imperativeCount} von ${steps.length} Schritten wurden als imperativ erkannt (Schwelle: 50%).`,
              severity: 'LOW',
              metric: 'instruction_quality',
            }),
          ];
      return {
        passed,
        detail: `${imperativeCount} von ${steps.length} Schritten wirken handlungsorientiert formuliert.`,
        findings,
      };
    },
  },

  {
    id: 'tool-dependency-orphaned-script',
    metric: 'misconfiguration_risk',
    testCategory: 'standard',
    evaluate(structure) {
      const toolDependencies = arr(structure.tool_dependencies).filter((t) => typeof t === 'string');
      const scriptTools = toolDependencies.filter((t) => /^scripts[/\\]/.test(t));
      if (scriptTools.length === 0) {
        return { passed: true, detail: 'Keine Script-Dateien unter tool_dependencies gefunden.', findings: [] };
      }

      // Use the analyzer's `unreferenced_scripts`, which accounts for
      // scripts referenced from other bundled files (imports, module
      // notation, invocations without the extension) — not just mentions
      // in a recognised step.
      //
      // The previous approach checked only `step.tools`, which had two
      // failure modes measured against a 40-skill corpus: a `simple` skill
      // has no steps at all, so *every* script it ships was reported
      // orphaned (one real skill produced 15 such findings), and helper
      // modules imported by other scripts were never recognised as used.
      // 55% of these findings were false. Fall back to the old behaviour
      // only when the field is absent, i.e. against an older analyzer.
      const orphaned = Array.isArray(structure.unreferenced_scripts)
        ? structure.unreferenced_scripts.filter((t) => typeof t === 'string')
        : (() => {
            const referencedInSteps = new Set();
            for (const step of arr(structure.steps)) {
              for (const tool of arr(step && step.tools)) referencedInSteps.add(tool);
            }
            return scriptTools.filter((t) => !referencedInSteps.has(t));
          })();
      const passed = orphaned.length === 0;
      const findings = orphaned.map((t) =>
        createFinding({
          area: 'Tool-/Skript-Abhängigkeiten',
          location: `Ressource "${t}"`,
          problem: 'Ein Skript liegt im Skill-Verzeichnis, wird aber weder in der SKILL.md noch von einer anderen mitgelieferten Datei referenziert.',
          cause: 'Das Skript wurde angelegt, aber keine Instruction und kein anderes Skript verweist erkennbar darauf — weder per Pfad, per Aufruf noch per Import.',
          impact: 'Ein nirgends referenziertes Skript deutet auf toten Code oder eine fehlende Verknüpfung hin — Claude wird es beim Ausführen des Skills möglicherweise nie aufrufen.',
          improvement_direction: 'Prüfen, ob das Skript tatsächlich benötigt wird, und falls ja, es dort verankern, wo es aufgerufen werden soll.',
          watch_for: 'Die Prüfung ist textbasiert: erkannt werden Pfad-, Aufruf- und Import-Erwähnungen in den mitgelieferten Dateien. Ein Skript, das ausschließlich dynamisch (z. B. über einen zur Laufzeit zusammengesetzten Namen) geladen wird, kann weiterhin fälschlich als verwaist erscheinen.',
          context: `Erkannte tool_dependencies: ${toolDependencies.join(', ')}.`,
          severity: 'LOW',
          metric: 'misconfiguration_risk',
        }),
      );
      return {
        passed,
        detail: passed ? 'Alle Script-Dateien werden von mindestens einem Schritt referenziert.' : `${orphaned.length} verwaiste Script-Datei(en) gefunden.`,
        findings,
      };
    },
  },

  {
    id: 'inputs-or-outputs-undeclared',
    metric: 'completeness',
    testCategory: 'standard',
    evaluate(structure) {
      const stepCount = structure.step_count || 0;
      if (stepCount === 0) {
        return { passed: true, detail: 'Keine Schritt-Sequenz erkannt; Inputs/Outputs-Prüfung nicht anwendbar.', findings: [] };
      }
      const inputs = arr(structure.inputs);
      const outputs = arr(structure.outputs);
      const passed = inputs.length > 0 || outputs.length > 0;
      if (passed) return { passed, detail: 'Inputs und/oder Outputs sind dokumentiert.', findings: [] };
      return {
        passed,
        detail: 'Weder Inputs noch Outputs sind erkennbar dokumentiert.',
        findings: [
          createFinding({
            area: 'Vollständigkeit',
            location: 'Abschnitte "Inputs"/"Outputs" (bzw. deren Fehlen)',
            problem: 'Der Skill hat eine Schritt-Sequenz, dokumentiert aber weder erwartete Inputs noch erzeugte Outputs.',
            cause: 'Es fehlt ein Abschnitt (z.B. "## Inputs" / "## Outputs"), der beschreibt, was der Skill erwartet bzw. liefert.',
            impact: 'Ohne dokumentierte Inputs/Outputs ist unklar, welche Daten der Skill benötigt und was er am Ende zurückgibt — das erschwert sowohl die Nutzung als auch die Integration in größere Abläufe.',
            improvement_direction: 'Kurze Abschnitte ergänzen, die die erwarteten Eingaben und die erzeugten Ausgaben des Skills benennen.',
            watch_for: 'Für sehr einfache Skills kann dies implizit aus dem Fließtext hervorgehen; dann reicht ein kurzer expliziter Hinweis statt eines eigenen Abschnitts.',
            context: `Analyzer-Ergebnis: step_count=${stepCount}, inputs=[], outputs=[].`,
            severity: 'LOW',
            metric: 'completeness',
          }),
        ],
      };
    },
  },
];

module.exports = { baseRules };
