# Internal Implementation Plan

Stand: 2026-03-26

## Ziel

Dieses Dokument definiert den naechsten Umsetzungsplan fuer den **internen** Jokari Knowledge Hub.

Bewusst **nicht** Teil dieses Plans:

- Website-Chatbot
- Chat-Widget
- RAG fuer externe Nutzer
- PIM-Anbindung
- bestehende externe SQL-/FTP-Integration
- externe Datenschutz- und Ausgabelayer fuer einen Chatbot

Der Fokus liegt ausschliesslich auf dem internen Produktkern:

- Dokument-Upload
- KI-Extraktion
- Review-Workflow
- interne Suche
- interne APIs / Exporte
- Datenqualitaet, Sicherheit und Betriebsstabilitaet

## Aktueller Ist-Zustand

### Produktivstack

- Frontend: Vercel / Next.js
- Backend: Railway / FastAPI
- Daten: Supabase Postgres + Storage + Auth
- Extraktion: Claude Sonnet 4.6

### Bereits umgesetzt

- Login mit Rollenmodell (`admin`, `reviewer`, `viewer`)
- Upload fuer `docx`, `pdf`, `md`, `csv`, `xlsx`
- KI-Extraktion mit Review-Queue
- Dokument- und Review-Detailseiten
- Dashboard
- Read-Only Knowledge API
- Audit-Logging

### Wichtigste offene Luecke

Die Pipeline funktioniert technisch, aber die **Datenqualitaet** ist noch nicht robust genug fuer grosse, mehrteilige Fachdokumente.

Konkreter Benchmark aus Produktion:

- Datei: `Konzept_Vertriebsschulung_Entmanteler_Stand_25.02.2021.docx`
- Department: `sales`
- Doc Type: `training_module`
- Ergebnis:
  - Dokument wurde verarbeitet
  - aktuell nur `1` grosser Chunk
  - `15` Records extrahiert
  - alle `15` Records stehen auf `needs_review`

Das zeigt:

1. Der technische Upload-/Extraktionspfad lebt.
2. Parser, Chunking, Schema-Fit und Record-Qualitaet sind fuer grosse Multi-Entity-Dokumente noch nicht ausreichend.

## Leitprinzipien fuer die naechsten Schritte

1. Erst Datenqualitaet, dann Komfort.
2. Erst interne Nutzbarkeit, dann neue Integrationen.
3. Keine neue Aussenflaeche, solange die interne Wissensbasis nicht belastbar ist.
4. Keine reine Feature-Ausweitung ohne Tests fuer die Kern-Workflows.

## Priorisierte Umsetzungsphasen

## Phase 1: Dokumentstruktur und Extraktionsqualitaet

### Zweck

Aus "technisch verarbeitet" muss "inhaltlich belastbar extrahiert" werden.

### Konkrete Probleme

- grosse `docx`/`pdf`-Dokumente landen als zu grosse Textbloecke in der Extraktion
- Claude bekommt dadurch unklare Segmentgrenzen
- der aktuelle `training_module`-Pfad passt nur teilweise zu produktzentrierten Vertriebsunterlagen
- die Review-Queue wird mit zu vielen unscharfen `needs_review`-Records gefuellt

### Aufgaben

1. Parser- und Chunking-Logik fuer Multi-Entity-Dokumente verbessern
   - Abschnittserkennung fuer `Titel:`, Ueberschriften, Tabellen, Listen, Medienbloecke
   - mehrere fachliche Sektionen statt einzelner Mega-Chunks
2. Extraktion fuer grosse Verkaufs-/Schulungsdokumente schaerfen
   - Claude-Prompting fuer Multi-Record-Dokumente weiter praezisieren
   - schema-spezifische Beispiele fuer `TrainingModule`, `FAQ`, `ProductSpec` usw.
3. Schema-Fit fuer problematische Dokumenttypen explizit pruefen
   - ist `sales/training_module` fuer produktlastige Schulungsunterlagen fachlich korrekt
   - wenn nein: Mapping oder Dokumenttyp-Logik verbessern
4. Evidenzqualitaet verbessern
   - wichtigste Felder muessen mit brauchbaren Textbelegen verknuepft sein

### Definition of Done

- der Produktions-Benchmark wird nicht mehr als einzelner Mega-Chunk verarbeitet
- Multi-Entity-Dokumente erzeugen fachlich sinnvolle Teilrecords
- fuer den Benchmark ist der Anteil `needs_review` deutlich reduziert oder fachlich plausibel begruendet
- extrahierte Records enthalten nachvollziehbare Belege fuer Kernfelder

### Relevante Dateien

- [docx_parser.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/parsers/docx_parser.py)
- [pdf_parser.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/parsers/pdf_parser.py)
- [chunking.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/services/chunking.py)
- [ingestion.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/services/ingestion.py)
- [claude.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/extractors/claude.py)
- [sales.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/schemas/knowledge/sales.py)
- [registry.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/schemas/knowledge/registry.py)

## Phase 2: Review-Workflow und interne Datenpflege

### Zweck

Der Review-Prozess soll fuer echte Redaktionsarbeit nutzbar werden, nicht nur fuer technische Korrekturen.

### Aufgaben

1. Review-Oberflaeche fuer groessere Mengen optimieren
   - Bulk-Aktionen
   - bessere Filter
   - klarere Diff-/Aenderungsdarstellung
2. Merge- und Dublettenlogik verbessern
   - vorgeschlagene Updates konsistenter erzeugen
   - Dubletten frueher erkennen
3. Statuslogik schaerfen
   - `pending` vs. `needs_review` sauberer anhand Vollstaendigkeit und Confidence vergeben

### Definition of Done

- Reviewer koennen mehrere thematisch zusammenhaengende Records effizient abarbeiten
- bestehende Records fuehren bei Neuimporten zu sauberen Updates statt Datenmuell

### Relevante Dateien

- [review.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/api/review.py)
- [merge.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/services/merge.py)
- [review/page.tsx](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/frontend/app/review/page.tsx)
- [review/[id]/page.tsx](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/frontend/app/review/[id]/page.tsx)

## Phase 3: Echte interne Suche und Retrieval

### Zweck

Die Wissensdatenbank muss intern wirklich auffindbar werden.

### Aktueller Engpass

- Suche ist noch einfache Textsuche
- Embeddings sind Platzhalter
- `pgvector` ist zwar vorhanden, wird aber fachlich noch nicht genutzt

### Aufgaben

1. echte Embeddings einfuehren
2. semantische Suche ueber `pgvector` implementieren
3. Ranking aus Texttreffern + semantischer Aehnlichkeit kombinieren
4. Knowledge-API fuer interne Agenten und interne Nutzer stabilisieren

### Definition of Done

- Suche findet nicht nur exakte Woerter, sondern relevante inhaltliche Naehe
- Suchergebnisse sind fuer interne Redaktions- und Vertriebsszenarien brauchbar

### Relevante Dateien

- [search.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/api/search.py)
- [chunk.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/models/chunk.py)
- [chunking.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/services/chunking.py)

## Phase 4: Governance, Vertraulichkeit und interne API-Haertung

### Zweck

Interne Daten duerfen nur in den richtigen internen Kontexten sichtbar sein.

### Aufgaben

1. `confidentiality` serverseitig konsequent erzwingen
2. API-Routen auf Datenzugriff und Sichtbarkeitsregeln pruefen
3. Admin-User-Provisioning absichern
   - `auth_setup` ist nur als Bootstrap vertretbar, nicht als Dauerzustand
4. Sicherheitsgrenzen zwischen `viewer`, `reviewer`, `admin` weiter absichern

### Definition of Done

- `internal/public` ist keine reine Metadatenflag mehr, sondern echte Policy
- keine ungeschuetzten Admin-Pfade im Dauerbetrieb

### Relevante Dateien

- [auth_setup.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/api/auth_setup.py)
- [auth.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/auth.py)
- [documents.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/api/documents.py)
- [search.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/api/search.py)
- [document.py](/Users/fatih.ataman/Coding%20Projekte/jokari-knowledge-hub/backend/app/models/document.py)

## Phase 5: Interne Exporte und stabile Datenbereitstellung

### Zweck

Genehmigtes Wissen soll intern reproduzierbar nutzbar sein, auch ohne direkten Datenbankzugriff.

### Aufgaben

1. JSON-Export fuer genehmigte Wissensbestaende
2. optional CSV-/PDF-Reports fuer interne Nutzung
3. stabile interne Read-APIs fuer genehmigte Daten

### Definition of Done

- genehmigte Wissensdaten koennen kontrolliert exportiert werden
- interne Folgeprozesse koennen auf stabile Schnittstellen zugreifen

## Phase 6: Tests, QA und Betriebsstabilitaet

### Zweck

Der Kern-Workflow muss regressionssicher werden.

### Aufgaben

1. Unit-Tests fuer Parser, Chunking, Extraktion, Merge
2. API-Tests fuer Upload, Dokumente, Review, Suche
3. End-to-End-Test fuer:
   - Login
   - Upload
   - Extraktion
   - Review
   - Freigabe
   - Suche
4. produktionsnahe Smoke-Tests fuer reale Beispielunterlagen

### Definition of Done

- der interne Hauptworkflow ist automatisiert abgesichert
- kuenftige Aenderungen an Extraktion und Review brechen nicht still

## Nicht Teil dieses Plans

- Website-Chatbot
- Website-Widget
- RAG fuer externe Nutzer
- PIM-Import
- bestehende SQL-/FTP-Anbindung
- native Mobile App

## Empfohlene Umsetzungsreihenfolge

1. Phase 1
2. Phase 2
3. Phase 6 fuer die jeweils neu gebauten Teile direkt mitziehen
4. Phase 3
5. Phase 4
6. Phase 5

## Erfolgskriterium fuer den naechsten Entwicklungsblock

Der naechste Block ist erfolgreich, wenn ein grosser, mehrteiliger interner Fach-Upload:

- sinnvoll segmentiert wird
- fachlich passende Teilrecords erzeugt
- mit nachvollziehbaren Belegen in der Review-Queue landet
- fuer Reviewer deutlich weniger Nacharbeit erzeugt als heute
