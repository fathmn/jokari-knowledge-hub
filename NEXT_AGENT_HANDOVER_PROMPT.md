# Next Agent Handover Prompt

Du arbeitest im Repo `jokari-knowledge-hub` und uebernimmst den **internen** Produktpfad des Jokari Knowledge Hub.

## Dein Ziel

Bringe den internen Knowledge Hub einen grossen Schritt in Richtung fachlich belastbarer Produktionsreife.

Wichtig:

- **nicht** am Website-Chatbot arbeiten
- **nicht** an PIM-Integration arbeiten
- **nicht** an externer SQL-/FTP-Integration arbeiten
- **nicht** an externen Privacy-/Chatbot-Themen arbeiten

Dein Fokus ist ausschliesslich:

- Upload
- Extraktion
- Review
- interne Suche
- interne APIs / Exporte
- Datenqualitaet

## Lies zuerst diese Dateien

1. [README.md](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/README.md)
2. [HANDOVER.md](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/HANDOVER.md)
3. [INTERNAL_IMPLEMENTATION_PLAN.md](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/INTERNAL_IMPLEMENTATION_PLAN.md)

## Relevanter Produktionsstand

- Hauptdomain: `https://jokari-knowledge-hub.vercel.app`
- Vercel-Projekt: `adloca/jokari-knowledge-hub`
- Backend: historisch `https://jokari-knowledge-hub-production.up.railway.app`, aktuell nicht gesund (`Application not found`)
- Stack:
  - Vercel fuer Frontend im ADLOCA-Scope
  - FastAPI-Compute aktuell offen
  - Supabase fuer Auth, Postgres, Storage
- aktueller relevanter Commit: `5ad914d`
- Claude ist der aktive Extraktor
- Modell: `claude-sonnet-4-6`

## Wichtigste aktuelle Erkenntnis

Der technische Flow funktioniert, aber die Datenqualitaet fuer grosse Multi-Entity-Dokumente ist noch nicht gut genug.

Konkreter Benchmark aus Produktion:

- Datei: `Konzept_Vertriebsschulung_Entmanteler_Stand_25.02.2021.docx`
- Department: `sales`
- Doc Type: `training_module`
- beobachteter Zustand:
  - Dokument erfolgreich verarbeitet
  - nur `1` Chunk erzeugt
  - `15` Records erzeugt
  - alle `15` Records auf `needs_review`

Beispielhaft erkannte Titel:

- `Das Entmanteler-Prinzip`
- `Universal No. 12`
- `JOKARI XL`
- `SECURA No. 15`
- `Allrounder`
- `UNI-PLUS`
- `PC-CAT`

Das ist dein Hauptsignal:

- Parsing / Chunking / Schema-Fit / Extraktion fuer grosse Fachdokumente sind noch nicht ausreichend

## Was zuletzt bereits gefixt wurde

- Claude-JSON-Normalisierung wurde gehaertet
- Single-Record- und Multi-Record-Smoke-Tests funktionieren wieder
- zentrale Seiten wurden live geprueft
- Vercel-Hauptalias wurde von `fathmns-projects` auf `adloca/jokari-knowledge-hub` uebertragen
- ADLOCA-Vercel-SSO-Protection blockiert die `vercel.app`-Domain aktuell mit `401`
- Railway ist aktuell nicht als gesunder Backend-Host verifiziert

## Deine erste Aufgabe

Bearbeite **Phase 1** aus [INTERNAL_IMPLEMENTATION_PLAN.md](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/INTERNAL_IMPLEMENTATION_PLAN.md) end-to-end.

Das heisst konkret:

1. parser- und chunking-seitig verstehen, warum grosse `docx`/`pdf`-Dokumente als zu grobe Bloecke an Claude gehen
2. Abschnittserkennung verbessern
3. Extraktion fuer Multi-Record-Dokumente und fuer `sales/training_module`-artige Unterlagen schaerfen
4. pruefen, ob das aktuelle Schema fuer diese Dokumente fachlich passt oder ob zumindest das Mapping verbessert werden muss
5. Regressionstests fuer den verbesserten Pfad hinzufuegen
6. live oder produktionsnah verifizieren
7. deployen
8. README/HANDOVER aktualisieren

## Relevante Dateien fuer Phase 1

- [docx_parser.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/parsers/docx_parser.py)
- [pdf_parser.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/parsers/pdf_parser.py)
- [chunking.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/services/chunking.py)
- [ingestion.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/services/ingestion.py)
- [claude.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/extractors/claude.py)
- [sales.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/schemas/knowledge/sales.py)
- [registry.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/schemas/knowledge/registry.py)

## Wichtige fachliche Frage, die du explizit klaeren sollst

Ist ein Dokument wie `Konzept_Vertriebsschulung_Entmanteler_Stand_25.02.2021.docx` im aktuellen Modell wirklich ein `training_module`, oder ist es fachlich eher ein Multi-Produkt-/Sales-Knowledge-Dokument?

Du musst nicht sofort ein neues grosses Datenmodell bauen. Aber du sollst diese Frage bewusst beantworten und deine technische Richtung daran ausrichten.

## Definition of Done fuer deine Uebergabe

Deine Arbeit ist erst dann fertig, wenn du folgendes nachweisen kannst:

1. Ein grosser mehrteiliger Vertriebs-Upload wird nicht mehr als einzelner Mega-Chunk verarbeitet.
2. Der Benchmark oder ein aehnlich komplexes Testdokument erzeugt fachlich plausiblere Records.
3. Die Zahl unnoetiger `needs_review`-Records sinkt oder ist fachlich besser begruendet.
4. Der Flow ist mit Tests abgesichert.
5. Der Stand ist deployed.
6. README und HANDOVER wurden aktualisiert.

## Arbeitsregeln

- Arbeite pragmatisch auf den Kernpfad.
- Fuehre keine Chatbot- oder Integrationsarbeiten nebenbei ein.
- Nutze produktive Smoke-Tests nur gezielt und raeume Testdaten danach wieder weg.
- Leake keine Secrets.
- Wenn du Architekturfragen beantworten musst, entscheide zugunsten von Datenqualitaet und Review-Nutzbarkeit.

## Erwartetes Ergebnisformat deiner Rueckgabe

Gib am Ende eine knappe, belastbare Antwort mit:

- was du geaendert hast
- welche Dateien zentral betroffen sind
- welche Live- oder Testfaelle du verifiziert hast
- was noch offen bleibt
