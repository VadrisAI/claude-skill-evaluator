# Product Specification — Claude Agent Skill Evaluator

> This is the full original specification, preserved verbatim as the shared reference for every contributor and every specialized work session on this project. If any doc or code disagrees with this file, this file wins unless a decision explicitly supersedes it (record such decisions in `docs/architecture.md`).

## Projekt

Eine Open-Source-Erweiterung für das Claude-Ökosystem zur unabhängigen Prüfung, Bewertung und Analyse bestehender Claude-Agent-Skills.

Das Projekt wird in der ersten Version als Claude-Code-kompatible Erweiterung umgesetzt, beispielsweise als Plugin beziehungsweise Skill mit eigenen Commands und einer klar definierten Evaluationslogik.

**WICHTIG:**

- Das Tool erstellt KEINE Skills.
- Das Tool verändert, repariert oder optimiert KEINE Skills automatisch.
- Es analysiert ausschließlich bereits vorhandene Skills, testet deren Qualität und Struktur und erstellt detaillierte Reports mit präzisen Hinweisen auf Schwachstellen und Verbesserungspotenziale.
- Der Nutzer bleibt vollständig für die tatsächliche Überarbeitung seines Skills verantwortlich.

## Aktueller Fokus

Die erste Version konzentriert sich ausschließlich auf das Claude-Ökosystem.

Primäre Zielumgebungen:

- Claude
- Claude Code
- Claude Cowork
- Claude Skills
- SKILL.md-basierte Skill-Strukturen

Andere Modelle und Plattformen werden im MVP nicht unterstützt. Eine spätere Erweiterung ist möglich, aber nicht Bestandteil der ersten Version.

## Produktform

Der erste MVP soll als Claude-Code-Erweiterung umgesetzt werden. Der Evaluator kann über einen Command gestartet werden, z.B.:

```
/evaluate-skill
```
oder
```
/skill-evaluate ./my-skill
```

Der Nutzer wählt oder übergibt einen bestehenden Skill. Der Evaluator untersucht anschließend den gesamten Skill und erzeugt einen strukturierten Prüfbericht. Keine eigenständige große Web-Plattform nötig — der Evaluator arbeitet direkt innerhalb/im Kontext der Entwicklungsumgebung, in der die Skills bereits vorhanden sind.

## Ziel

Bestehende Claude-Agent-Skills unabhängig und nachvollziehbar prüfen. Das Tool soll messbar aufzeigen:

- wie gut ein Skill aufgebaut ist
- wie klar und präzise seine Instructions sind
- wie zuverlässig seine Struktur funktioniert
- wo konkrete Schwachstellen liegen
- warum diese Schwachstellen problematisch sind
- welche Bereiche verbessert werden müssen
- in welche Richtung eine Verbesserung erfolgen sollte

Das Tool liefert keine fertigen Lösungen. Es soll dem Nutzer ermöglichen, selbst zu verstehen, wie und warum ein Skill verbessert werden muss.

## Universaler Skill-Ansatz

Ein Skill kann eine einfache, klar abgegrenzte Aufgabe enthalten (z.B. eine Analyse) — oder intern einen vollständigen automatisierten Ablauf: mehrere Schritte, Entscheidungslogik, Bedingungen, Tool-Nutzung, Abhängigkeiten, mehrere Verarbeitungsphasen, automatisierte Prozessketten, Feedback-Schleifen, Failure Handling.

Das System MUSS bei jeder Evaluation zunächst automatisch analysieren, wie der eingereichte Skill tatsächlich aufgebaut ist, und erkennen, ob er überwiegend eine einfache Aufgabe ausführt oder intern eine komplexe automatisierte Prozessstruktur enthält. Das ist keine getrennte Produktkategorie — es bleibt ein Skill. Ein komplexer Skill darf nicht mit denselben Bewertungskriterien geprüft werden wie ein einfacher Skill.

## Kernworkflow

```
Bestehenden Claude-Skill auswählen
        ↓
Evaluator starten
        ↓
Gesamte Skill-Struktur automatisch analysieren
        ↓
Aufgaben- und Prozesskomplexität erkennen
        ↓
Passende Evaluationsstrategie bestimmen
        ↓
Skill analysieren
        ↓
Relevante Tests durchführen
        ↓
Ergebnisse messen
        ↓
Schwachstellen identifizieren
        ↓
Qualitätsbewertung erstellen
        ↓
Detaillierten Report erzeugen
        ↓
Verbesserungspotenziale und Verbesserungsrichtung aufzeigen
        ↓
Nutzer überarbeitet den Skill selbst
        ↓
Neue Version erneut prüfen
        ↓
Ergebnisse verschiedener Versionen vergleichen
```

## Skill Import und Auswahl

Der Evaluator soll bestehende Claude-Skills analysieren können, z.B.:

- SKILL.md
- vollständige Skill-Verzeichnisse
- lokale Projektordner
- aus Anthropic Skill Creator erstellte Skills
- mit Claude Code erstellte Skills
- Claude Cowork Skills
- manuell erstellte Claude-Skills

Beispielstruktur eines Skills:

```
my-skill/
├── SKILL.md
├── references/
├── scripts/
└── assets/
```

Der Evaluator analysiert nicht ausschließlich die SKILL.md, sondern die gesamte relevante Struktur.

## Automatische Strukturerkennung

Nach dem Start analysiert das System zunächst den gesamten Skill, u.a.:

- Zweck des Skills
- Ziel und erwartete Aufgabe
- Anzahl und Struktur der Instructions
- Anzahl interner Schritte
- Abhängigkeiten zwischen Schritten
- Reihenfolge von Anweisungen
- Entscheidungslogik, Bedingungen
- Inputs, Outputs
- Tool-Abhängigkeiten
- Prozessketten
- Feedback-Schleifen
- Failure Conditions, Retry-Mechanismen
- Automatisierungsgrad, Gesamtkomplexität

Anhand dieser Analyse bestimmt das System automatisch die geeignete Evaluationstiefe. Die Bewertung muss sich immer an der tatsächlich erkannten Struktur orientieren.

## Skill-Analyse

Das Tool analysiert u.a. auf:

- Strukturqualität, Instruction-Qualität, Klarheit, Präzision, Verständlichkeit, Vollständigkeit
- Redundanzen, Widersprüche, Konsistenz, logische Zusammenhänge
- Workflow-Logik (sofern vorhanden), Trigger-Bedingungen
- Kontext- und Token-Effizienz
- Edge Cases, Failure Conditions, Robustheit, potenzielle Fehlkonfigurationen

Bei mehreren verbundenen Prozessschritten zusätzlich:

- Prozessübergänge, Abhängigkeiten, Entscheidungslogik, Bedingungen
- Daten-/Informationsfluss, Tool-Nutzung, Feedback-Schleifen, Exit-Bedingungen, mögliche Dead Ends

Das System soll u.a. erkennen können: fehlende Prozessübergänge, nicht erreichbare Schritte, Dead Ends, widersprüchliche Bedingungen, undefinierte Abhängigkeiten, unklare Tool-Nutzung, fehlende Exit-Bedingungen, unnötige Prozessschritte, logische Konflikte, nicht erzeugte Outputs die später benötigt werden, unvollständige Übergaben zwischen Prozessschritten.

## Testing und Evaluation

Die Teststrategie wird automatisch an Struktur und Komplexität angepasst — nur Tests/Kriterien, die für die tatsächliche Struktur relevant sind.

Mögliche Testbereiche: Standard Cases, Edge Cases, Ambiguous Inputs, Complex Tasks, Failure Cases, Boundary Cases, Instruction Following, Konsistenz, Robustheit, Input Handling, Output Quality, Prozessübergänge, Entscheidungslogik, Abhängigkeiten, End-to-End-Abläufe.

## Scoring und Qualitätsbewertung

Beispiel:

```
Overall Quality        78/100
Instruction Quality    84/100
Task Definition        81/100
Consistency            73/100
Robustness             69/100
Completeness           82/100
Efficiency             76/100
```

Metriken müssen dynamisch an die tatsächliche Struktur des Skills angepasst werden — keine Scores anzeigen, die für den jeweiligen Skill nicht relevant sind. Jede Bewertung muss nachvollziehbar sein: zu jedem Score müssen Analyseergebnisse, Testfälle, Testergebnisse und erkannte Probleme dokumentiert werden.

## Testreport

Beispielstruktur:

```
skill-evaluation/
├── REPORT.md
├── scores.json
├── test-results.json
└── history/
    ├── evaluation-v1.json
    └── evaluation-v2.json
```

Der Report enthält: erkannte Struktur, erkannte Komplexität, relevante Bewertungskriterien, Gesamt-/Einzelbewertungen, durchgeführte/bestandene/fehlgeschlagene Tests, erkannte Schwachstellen, problematische Instructions, fehlende Regeln, Redundanzen, Widersprüche, fehlende Edge Cases, strukturelle Probleme, Prozessprobleme (sofern vorhanden), konkrete Testergebnisse, Priorisierung der Probleme.

Probleme werden kategorisiert als: `CRITICAL`, `HIGH`, `MEDIUM`, `LOW`.

## Verbesserungshinweise und Lernansatz

Das Tool darf den Skill NICHT automatisch verändern und darf NICHT die vermeintlich perfekte/ideale Lösung liefern. Für jedes erkannte Problem enthält der Report strukturiert:

- **BETROFFENER BEREICH** — Wo befindet sich das Problem?
- **GENAUE STELLE** — Welche Instruction/Abschnitt/Prozessbereich ist betroffen?
- **PROBLEM** — Was wurde konkret erkannt?
- **URSACHE** — Warum entsteht dieses Problem?
- **AUSWIRKUNG** — Wie beeinflusst es Qualität/Funktion?
- **VERBESSERUNGSRICHTUNG** — Welche Art von Änderung wäre erforderlich?
- **ZU BEACHTEN** — Worauf muss der Nutzer bei eigener Überarbeitung achten?
- **KONTEXT** — Zusätzliche Informationen zur Veranschaulichung.

Das Tool darf NICHT schreiben "Ersetze diesen Abschnitt durch folgenden perfekten Text", und NICHT liefern: eine vollständig überarbeitete Instruction, den vermeintlich optimalen Ersatztext, eine fertige Lösung, eine automatisch optimierte Skill-Version.

## Lernprinzip

```
ANALYSE → PROBLEM ERKENNEN → GENAUE STELLE IDENTIFIZIEREN → URSACHE VERSTEHEN
   → AUSWIRKUNG ERKENNEN → VERBESSERUNGSRICHTUNG VERSTEHEN
   → NUTZER ENTWICKELT EIGENE LÖSUNG → NEUE SKILL-VERSION ERSTELLEN
   → ERNEUT TESTEN → ERGEBNIS MESSEN
```

## Vorher-/Nachher-Vergleich

Beispiel:

```
                    Version 1    Version 2    Veränderung
Overall Quality         72            91          +19
Consistency              68            89          +21
Robustness               64            87          +23
Completeness             76            94          +18
Efficiency               73            82           +9
```

Verschlechterungen müssen ebenfalls sichtbar gemacht werden.

## Visuelle Auswertung

Ergebnisse nicht ausschließlich als Text: Gesamt-Score, Einzelbewertungen, Test-Erfolgsquote, bestandene/fehlgeschlagene Tests, Problemverteilung, Problemprioritäten, Vergleich verschiedener Skill-Versionen, Qualitätsentwicklung, Vorher-/Nachher-Diagramme.

## Reproduzierbare Evaluation

Zu jeder Prüfung gespeichert/dokumentiert: Skill-Version, Evaluationsdatum, verwendete Test-Suite, verwendete Bewertungskriterien, durchgeführte Tests, Testergebnisse, Scores, erkannte Probleme, Verbesserungshinweise, Vergleichswerte.

## Plugin-Architektur

```
CLAUDE CODE
        ↓
SKILL EVALUATOR PLUGIN
        ↓
SKILL DISCOVERY / IMPORT
        ↓
STRUCTURE ANALYZER
        ↓
COMPLEXITY DETECTION
        ↓
EVALUATION ENGINE
        ↓
TEST ENGINE
        ↓
SCORING ENGINE
        ↓
REPORT ENGINE
```

Modular aufgebaut, später erweiterbar um: zusätzliche Test-Suites, neue Bewertungskriterien, zusätzliche Report-Formate, weitere Visualisierungen, weitere Skill-Standards. Der MVP konzentriert sich ausschließlich auf die Prüfung bestehender Claude-Skills.

## Open Source

Das gesamte Projekt wird öffentlich auf GitHub veröffentlicht. Andere Entwickler können das Tool herunterladen, selbst verwenden, eigene Claude-Skills prüfen, eigene Test-Suites integrieren, Reports erzeugen, Verbesserungshinweise erhalten, überarbeitete Skill-Versionen erneut prüfen, Erweiterungen beitragen.

## MVP

```
IMPORT CLAUDE SKILL → AUTOMATISCHE STRUKTURERKENNUNG → KOMPLEXITÄTSANALYSE
   → PASSENDE EVALUATIONSSTRATEGIE → SKILL-ANALYSE → TESTING → SCORING
   → DETAILLIERTER REPORT → PRÄZISE VERBESSERUNGSHINWEISE
   → NUTZER ÜBERARBEITET SELBST → NEUE VERSION TESTEN → VERSION COMPARISON
```

## Zentraler USP

Das Tool behandelt einen Claude-Agent-Skill nicht pauschal als einfachen Text. Es analysiert zunächst automatisch die tatsächliche Struktur und Komplexität des Skills. Anschließend wird die Evaluation dynamisch an die erkannte Struktur angepasst. Das Tool liefert keine fertigen Optimierungen und keine automatische Überarbeitung. Es fungiert als unabhängiger Prüfstand, der Schwachstellen präzise diagnostiziert, deren Ursachen und Auswirkungen nachvollziehbar macht und die Richtung notwendiger Verbesserungen aufzeigt. Die eigentliche Lösung entwickelt der Nutzer selbst.

## Kernbotschaft

> „Nicht behaupten, dass ein Claude-Agent-Skill gut ist. Analysieren. Testen. Messen. Schwachstellen verstehen. Verbesserungspotenziale sichtbar machen. Selbst überarbeiten. Und anschließend nachweisen, ob die Änderung tatsächlich besser funktioniert."
