# Handover-Protokoll / Changelog

> Dieses Dokument protokolliert alle Aenderungen am Projekt chronologisch.
> Jede Session mit einem AI-Agenten oder Entwickler muss hier dokumentiert werden.
> Format: Datum, Autor, Zusammenfassung, betroffene Dateien, Testhinweise.

---

## 2026-03-05 — Bugfixes & Verbesserungen (Claude Opus 4.6)

**Kontext:** Tiefenanalyse des gesamten Projekts identifizierte 30+ Issues. Claude und Codex CLI haben die Bugs unabhaengig verifiziert. Dieser Eintrag dokumentiert alle Fixes.

### Phase 1: Kritische Backend-Bugs

#### 1.1 Attachment-Upload gefixt
- **Problem:** `storage.upload_file()` wurde mit vertauschten Argumenten aufgerufen (`file_path, content, content_type` statt `content, filename, content_type`). Ausserdem wurde der Rueckgabewert (Storage-Pfad mit UUID) ignoriert — der DB-Eintrag speicherte einen eigenen Pfad.
- **Fix:** Argumente korrigiert, Rueckgabewert `stored_path` wird jetzt als `file_path` im DB-Eintrag verwendet.
- **Datei:** `backend/app/api/review.py` (Zeile ~322)

#### 1.2 `get_presigned_url()` → `get_file_url()`
- **Problem:** `StorageService` hat nur `get_file_url()`, aber `review.py` rief `get_presigned_url()` auf → AttributeError zur Laufzeit.
- **Fix:** Alle Aufrufe umbenannt.
- **Datei:** `backend/app/api/review.py` (Zeile ~90, ~368)

#### 1.3 `.doc`-Support entfernt
- **Problem:** `.doc` (altes Word-Format) wurde akzeptiert, aber `python-docx` kann `.doc` nicht parsen → Laufzeitfehler.
- **Fix:** Aus 3 Stellen entfernt: Parser `supports()`, Upload-Whitelist, Extension-Registry.
- **Dateien:** `backend/app/parsers/docx_parser.py`, `backend/app/api/upload.py`, `backend/app/parsers/factory.py`

#### 1.4 ClaudeExtractor: AsyncAnthropic
- **Problem:** Synchroner `Anthropic()` Client in async FastAPI-Kontext → blockiert Event Loop.
- **Fix:** `Anthropic()` → `AsyncAnthropic()`, `client.messages.create()` → `await client.messages.create()`.
- **Datei:** `backend/app/extractors/claude.py`

#### 1.5 Schema-Validierung bei manuellen Updates
- **Problem:** `PUT /api/review/{id}` speicherte `data_json` ohne Validierung gegen das Schema → ungueltige Daten moeglich.
- **Fix:** Validierung gegen `SchemaRegistry.get_schema_by_name()` vor dem Speichern. Bei Fehler: HTTP 422.
- **Datei:** `backend/app/api/review.py` (Zeile ~167)

#### 1.6 CORS env-basiert
- **Problem:** CORS-Origins waren hardcoded (nur localhost:3000 + Vercel). Port 3001/3002 fehlten.
- **Fix:** Neue `cors_origins` Setting in `config.py` (kommagetrennt). Default enthält Ports 3000-3002 + Vercel.
- **Dateien:** `backend/app/config.py`, `backend/app/main.py`

### Phase 2: Backend-Erweiterungen

#### 2.1 `GET /api/knowledge/{id}` Endpoint
- **Neu:** Gibt einen einzelnen APPROVED Record mit Evidence und Attachments zurueck.
- **Datei:** `backend/app/api/search.py`

#### 2.2 Claude Multi-Record-Support
- **Neu:** System-Prompt unterstuetzt jetzt `"records"` Array-Output. Response-Parsing erkennt Multi-Record-Format und erstellt `ExtractedRecord`-Objekte.
- **Datei:** `backend/app/extractors/claude.py`

### Phase 3: Frontend UX-Fixes

#### 3.1 Toast/Notification-System
- **Neu:** `Toast.tsx` Komponente mit Context-Provider. Eingebunden in `ClientLayout.tsx`.
- **Eingebaut bei:** Upload, Approve/Reject, Edit, Delete, Attachment-Upload/Delete.
- **Dateien:** `frontend/components/Toast.tsx` (neu), `frontend/components/ClientLayout.tsx`

#### 3.2 Error-States im UI
- **Problem:** Fehler wurden nur in `console.error` geloggt, User sah nichts.
- **Fix:** Sichtbare Error-Cards in rot auf allen Listenseiten.
- **Dateien:** `dokumente/page.tsx`, `review/page.tsx`, `wissen/page.tsx`, `suche/page.tsx`

#### 3.3 Browser-Dialoge → Modals
- **Problem:** `confirm()` und `prompt()` sind haesslich und auf Mobile problematisch.
- **Fix:** Neue `ConfirmModal.tsx` Komponente mit optionalem Reason-Textfeld.
- **Eingebaut bei:** Delete (Dokument), Reject (Record), Delete (Attachment), Reject (Update).
- **Dateien:** `frontend/components/ConfirmModal.tsx` (neu), `dokumente/[id]/page.tsx`, `review/[id]/page.tsx`, `review/updates/[id]/page.tsx`

#### 3.4 Schema-Labels vervollstaendigt
- **Problem:** Nur 5 von 15 Schemas hatten Labels. Fehlende wurden als interner Klassenname angezeigt.
- **Fix:** Alle 15 Labels hinzugefuegt in 5 Dateien.
- **Dateien:** `dokumente/[id]/page.tsx`, `review/page.tsx`, `review/[id]/page.tsx`, `wissen/page.tsx`, `wissen/[id]/page.tsx`

#### 3.5 URL-basierte Filter
- **Problem:** Filter-State ging beim Seitenneuladen verloren (nur `useState`).
- **Fix:** `useSearchParams` + `Suspense` Boundary. Filter werden in URL gespeichert.
- **Dateien:** `dokumente/page.tsx`, `review/page.tsx`, `wissen/page.tsx`

#### 3.6 Wissen-Seiten: Richtige API
- **Problem:** `wissen/[id]` lud ueber `/api/review` statt ueber Knowledge-API.
- **Fix:** `wissen/[id]` versucht jetzt `GET /api/knowledge/{id}` zuerst, Fallback auf Review-API.
- **Datei:** `frontend/app/wissen/[id]/page.tsx`

#### 3.7 Update-Navigation
- **Neu:** "Updates" Link in Sidebar (mit `GitPullRequest` Icon), zeigt auf `/review?status=pending`.
- **Datei:** `frontend/components/Sidebar.tsx`

#### 3.8 Review-Sidebar auf Mobile
- **Problem:** Completeness/Evidence/Version nur auf Desktop sichtbar (weit unten im Grid).
- **Fix:** Mobile Quick-Info-Bar mit Completeness, Belege-Anzahl, Version direkt unter dem Header.
- **Datei:** `frontend/app/review/[id]/page.tsx`

#### 3.9 `animate-slide-up` CSS-Animation
- **Neu:** Keyframe + Animation fuer Toast und mobile Modals.
- **Datei:** `frontend/tailwind.config.ts`

#### 3.10 Tailwind `primary-600`
- **Status:** Bereits vorhanden (`#e6d500`). Kein Aenderungsbedarf.

#### 3.11 Upload-Validierung: Sichtbares Feedback
- **Problem:** `handleSubmit` hat still `return` gemacht wenn Pflichtfelder fehlten.
- **Fix:** Rote Error-Card zeigt fehlende Felder an. `.doc` aus Dropzone entfernt.
- **Datei:** `frontend/app/upload/page.tsx`

#### 3.12 Security: `images.remotePatterns`
- **Problem:** Wildcard `**` erlaubte jede Domain → potentielles Sicherheitsrisiko.
- **Fix:** Eingeschraenkt auf `*.supabase.co`.
- **Datei:** `frontend/next.config.js`

### Phase 4: Cleanup

#### 4.1 Celery-Code entfernt
- **Geloescht:** `backend/app/workers/` (3 Dateien: `__init__.py`, `celery_app.py`, `tasks.py`)
- **Entfernt aus:** `requirements.txt` (celery, redis), `config.py` (redis_url)
- **Aktualisiert:** `.env.example` (Redis/MinIO Referenzen entfernt, Supabase + CORS hinzugefuegt)

#### 4.2 Toter Code
- `DashboardTile.tsx`: Ungenutztes `trend`-Prop entfernt.
- `page.tsx` (Dashboard): Stale Records verlinken jetzt auf `/review/{id}`.

### Verifizierung
- Frontend-Build: `npm run build` erfolgreich (0 Fehler)
- Backend-Imports: Keine toten Referenzen auf workers/celery/redis
- Keine Referenzen auf `get_presigned_url` oder `.doc` im Code

### Offene Punkte (nicht in diesem Durchlauf)
- Auth/Login-System fehlt noch komplett
- OpenAI Embeddings / Vector Search nicht implementiert
- E2E Tests fehlen
- Regressionstests fuer Attachment-Upload empfohlen (Codex-Empfehlung)
