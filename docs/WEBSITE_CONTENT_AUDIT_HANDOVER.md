# Website Content Audit Handover

## Auftrag fuer den naechsten Agenten

Du uebernimmst den Jokari Knowledge Hub und pruefst systematisch, ob alle relevanten Inhalte, Bilder, Downloads und Quellenbelege aus den oeffentlichen Jokari-/JO!Study-Quellen korrekt in der Supabase-Datenbank angekommen sind. Ziel ist kein weiterer Blind-Crawl, sondern ein reproduzierbarer Source-vs-DB-Abgleich mit konkreten Findings und anschliessenden Fixes.

## Produktkontext

- Repo: `/Users/fatih.ataman/Coding Projekte/jokari-knowledge-hub`
- Frontend: Next.js 15, deployed auf Vercel `adloca/jokari-knowledge-hub`
- Backend: FastAPI auf Google Cloud Run `jokari-knowledge-hub-api`
- Datenbank/Auth/Storage: Supabase Projekt `gqezmqopvjvpdnknmfap`
- Live Frontend: `https://jokari-knowledge-hub.vercel.app`
- Live Backend: `https://jokari-knowledge-hub-api-apz7sfnrsa-ey.a.run.app`
- Knowledge API darf weiterhin nur `approved` Records ausliefern.
- Oeffentlich gecrawlte Website-Inhalte duerfen nicht automatisch approved werden. Auto-Approval ist nur fuer authentifizierte, vertrauenswuerdige PIM/API-Quellen erlaubt.

## Wichtige Repo-Bereiche

- Backend Review API: `backend/app/api/review.py`
- Knowledge/Search API: `backend/app/api/search.py`
- External Ingestion API: `backend/app/api/external_ingestion.py`
- External Ingestion Service: `backend/app/services/external_ingestion.py`
- Source Metadata Service: `backend/app/services/source_metadata.py`
- Knowledge Schemas: `backend/app/schemas/knowledge/`
- Website Import Scripts: `scripts/website-import/`
- Frontend Review Detail: `frontend/app/review/[id]/page.tsx`
- Frontend Knowledge Detail: `frontend/app/wissen/[id]/page.tsx`
- Frontend Source Helpers: `frontend/lib/recordSource.ts`
- Migrationen: `backend/alembic/versions/`
- Cloud Run Infra: `infra/cloud-run/`

## Relevante Datenbanktabellen

- `records`: Knowledge/Review Records mit `data_json`, `status`, `schema_type`, `primary_key`, `department`
- `external_imports`: Import-Historie, `source_type`, `source_id`, `source_url`, `content_hash`, `status`, `details_json`
- `record_attachments`: Bilder/Medien/Downloads, die einem Record zugeordnet sind
- `evidence`: Quellenbelege und Excerpts
- `audit_logs`: Audit Trail fuer Approval, Auto-Approval, Repairs und Imports
- `proposed_updates`: nicht direkt genehmigte Updates fuer bestehende Records

## Quellen, die abgeglichen werden muessen

1. Jokari Produkte
   - Start: `https://jokari.de/`
   - Produktdetail-Beispiel mit bekanntem Defekt: `https://jokari.de/produkte/detail/automatische-abisolierzange-super-4-plus`
   - Speziell pruefen: Produktname, Artikelnummer, Beschreibung, technische Daten, Merkmale, Varianten, Preise falls vorhanden, Bilder, Downloads, Datenblaetter, Bedienungsanleitungen, Zubehoer, Related Products.

2. Jokari Wissen/Blog/JO!STORY
   - Beispiel mit vorheriger schlechter Extraktion: `https://jokari.de/wissen/blog-jostory/detail/die-groessen-von-kabel-und-leitungen`
   - Speziell pruefen: kompletter Artikeltext mit Abschnitten, Ueberschriften, Bilder, Bildzuordnung, interne Links, Quellenbelege.

3. JO!Study / JOWiki
   - Start: `https://www.jostudy.de/jowiki`
   - Beispiel mit Absatz-Fix: `https://www.jostudy.de/jowiki/schaelwerkzeug`
   - Speziell pruefen: H5P-Inhalte, Absatzerhalt, Bilder, Kategorien, falsche Bildzuordnung, Login-unabhaengige Inhalte.

4. Sitemap / strukturierte Quellen
   - Zuerst Sitemaps und robots pruefen.
   - Wenn Sitemaps fehlen oder unvollstaendig sind, Crawlee/Firecrawl/Browser-MCP nur als Adapter nutzen.
   - Kein neuer externer Dienst als dauerhafte Abhaengigkeit einfuehren, wenn FastAPI/Supabase reicht.

## Bekannte Probleme aus bisherigen Pruefungen

- Einige Produktseiten wurden nur als chaotischer Seitentext importiert statt als strukturierter ProductSpec.
- JOWiki/H5P-Absatzstruktur wurde zuvor beim Cleaning verloren; das ist fuer `schaelwerkzeug` repariert, muss aber fuer alle JOWiki-Seiten gegengeprueft werden.
- JO!STORY-/Blog-Inhalte wurden zuvor teils unvollstaendig extrahiert; Bilder fehlten oder waren falsch.
- Produkt-Downloads werden aktuell vermutlich nicht vollstaendig extrahiert. Konkretes Beispiel: `https://jokari.de/produkte/detail/automatische-abisolierzange-super-4-plus`.
- Source-Herkunft muss im Frontend nachvollziehbar bleiben: Website/JOSTUDY/PIM/API/Upload, URL, Source-ID, Hash, Importzeitpunkt, Trust Type.

## Arbeitsregeln

- Starte mit Read-only Analyse: keine DB-Reparaturen und keine Codeaenderungen, bis du eine konkrete Abgleichsliste hast.
- Vor grossen Re-Crawls eine Token-/Kosten-/Datenmenge-Kalkulation machen: Seitenanzahl, Zeichen, Tokens, erwartete Outputs, Modellkosten. Preise nur aus aktueller offizieller Quelle oder klar als Annahme markieren.
- Trenne strikt:
  - Sitemap Crawl
  - Cloudflare/API/MCP Quelle
  - direkter PIM/API Import
  - manuell hochgeladenes Dokument
- Oeffentlich gecrawlte Inhalte bleiben `needs_review`, ausser sie kommen aus einer explizit authentifizierten trusted PIM/API Quelle.
- Jede Reparatur muss idempotent sein: gleicher Source-Content darf keine doppelten Records erzeugen.
- Jede Aenderung muss auditierbar sein: `external_imports`, `evidence`, `record_attachments`, `audit_logs`.
- Keine Secrets ausgeben oder committen.
- Bestehende Approval-Regeln nicht abschwaechen.

## Empfohlene Read-only Checks

Nutze Supabase CLI/MCP, aber gib keine Secrets aus:

```bash
supabase db query --linked --output json "select status, schema_type, count(*) from public.records group by status, schema_type order by status, schema_type;"
supabase db query --linked --output json "select source_type, trust_type, status, count(*) from public.external_imports group by source_type, trust_type, status order by source_type, trust_type, status;"
supabase db query --linked --output json "select r.id, r.schema_type, r.status, e.source_url, count(a.id) as attachments from public.records r left join public.external_imports e on e.record_id = r.id left join public.record_attachments a on a.record_id = r.id group by r.id, e.source_url order by attachments asc limit 50;"
```

Fuer konkrete URL-Abgleiche:

```bash
supabase db query --linked --output json "select r.id, r.status, r.schema_type, r.primary_key, r.data_json, e.source_url, e.content_hash, count(a.id)::int as attachments from public.records r join public.external_imports e on e.record_id = r.id left join public.record_attachments a on a.record_id = r.id where e.source_url = 'SOURCE_URL_HERE' group by r.id, e.source_url, e.content_hash;"
```

## Erwartete Abgleichsmethode

1. Quelleninventar erstellen
   - Liste aller Produkt-, Blog-/JO!STORY- und JOWiki-URLs.
   - Pro URL Source-Typ, erwartete Schema-Zuordnung und erwartete Assets bestimmen.

2. Source extrahieren
   - HTML strukturiert parsen.
   - JSON-LD, Produktdaten, H5P JSON, Download-Links, Bild-URLs und relevante Textcontainer separat erfassen.
   - Boilerplate/Navi/Footer getrennt halten; nicht mit eigentlichem Content vermischen.

3. DB abgleichen
   - Gibt es genau einen passenden Record?
   - Ist `schema_type` plausibel?
   - Ist `data_json` vollstaendig und sauber strukturiert?
   - Stimmen Bilder/Downloads in `record_attachments`?
   - Stimmen `external_imports.source_url`, `source_id`, `content_hash`, `status`?
   - Gibt es Evidence mit nutzbarem Excerpt?

4. Gap-Report erzeugen
   - `missing_record`: URL fehlt komplett.
   - `wrong_schema`: Record vorhanden, aber falsches Schema.
   - `dirty_text`: Boilerplate/Navi/Footer im Content.
   - `missing_field`: Datenfeld fehlt oder ist leer.
   - `missing_image`: erwartetes Bild fehlt.
   - `wrong_image`: Bild passt nicht zur Quelle.
   - `missing_download`: Download/Datenblatt/Anleitung fehlt.
   - `duplicate_record`: gleicher Source-Content mehrfach.
   - `source_mismatch`: Source-Herkunft/Hash/URL inkonsistent.

5. Erst danach reparieren
   - Reparaturscripts idempotent bauen.
   - Dry-run Report und SQL/JSON Artefakte in `/tmp/...` schreiben.
   - Danach Apply nur fuer eindeutig validierte Fixes.
   - Tests ergaenzen.

## Besondere Anforderungen an Downloads

Fuer Produktseiten muss der Agent explizit nach Download-Quellen suchen:

- Linktexte wie `Download`, `Datenblatt`, `Bedienungsanleitung`, `Anleitung`, `PDF`, `Katalog`, `Technische Daten`
- Dateiendungen wie `.pdf`, `.zip`, `.docx`, `.xlsx`
- Buttons/Accordion-Content/Tabs, die erst nach JS sichtbar werden
- JSON-LD oder eingebettete Produktdaten mit Dokument-URLs

Downloads duerfen nicht als normale Bilder behandelt werden. Sie sollen als Attachments mit unterscheidbarem `file_type`/MIME-Type und nachvollziehbarem Source-Feld gespeichert werden.

## Erwartete Deliverables

- Ein Report mit:
  - Anzahl gefundener Source-URLs je Quelle
  - Anzahl vorhandener DB-Records je Quelle
  - Anzahl fehlender/falscher Records
  - Bild-Abdeckung
  - Download-Abdeckung
  - Top konkrete Fehler mit URL und Record-ID
- Eine Entscheidungsvorlage:
  - Full Re-Crawl vs Delta-Repair vs Sampling
  - Token-/Kostenabschaetzung
  - Risiko bei Auto-Approval
- Falls implementiert:
  - geaenderte Dateien
  - Repair-/Import-Kommandos
  - Tests und Ergebnisse
  - DB-Queries zur Verifikation
  - Deployment-Status

## Aktueller Stand vor diesem Handover

- JOWiki Absatz-Fix ist umgesetzt und deployed.
- `https://www.jostudy.de/jowiki/schaelwerkzeug` / Record `ee9fad29-0b0f-4038-a208-45f71f1ed887` hat jetzt 5 Absätze und 1 Attachment.
- Dashboard-Backend wurde optimiert und auf Cloud Run ausgerollt.
- Cloud Run API Revision nach Dashboard-Fix: `jokari-knowledge-hub-api-00011-h5k`.
- Cloud Run API wird fuer bessere Dashboard-Ladezeit auf `minScale: 1` gesetzt.

## Startprompt fuer den Agenten

Du bist Senior Backend/API Engineer, AI-Ingestion-Architekt, Data QA Engineer und Product Engineer fuer den Jokari Knowledge Hub. Arbeite im Repo `/Users/fatih.ataman/Coding Projekte/jokari-knowledge-hub`.

Deine Aufgabe: Pruefe vollstaendig und reproduzierbar, ob alle relevanten Inhalte, Bilder und Downloads von `https://jokari.de/`, Jokari Produktseiten, JO!STORY/Blogseiten und `https://www.jostudy.de/jowiki` korrekt in Supabase `gqezmqopvjvpdnknmfap` importiert wurden. Fuehre zuerst eine Read-only Analyse und Token-/Kosten-/Datenmengenkalkulation durch. Erstelle dann einen Source-vs-DB Gap-Report. Repariere erst danach klar validierte Fehler idempotent.

Bekannter Defekt: Auf `https://jokari.de/produkte/detail/automatische-abisolierzange-super-4-plus` wurden Downloads wahrscheinlich nicht extrahiert. Nutze diesen Fall als Canary fuer Produkt-Downloads. Pruefe ausserdem JOWiki/H5P-Absatzstruktur, Blogbilder und falsche Bildzuordnung.

Halte Approval-Regeln ein: oeffentlich gecrawlte Inhalte bleiben reviewpflichtig; nur authentifizierte trusted PIM/API-Daten duerfen automatisch approved werden. Knowledge API darf nur approved Records ausliefern. Keine Secrets ausgeben. Alle Fixes muessen auditierbar und idempotent sein.
