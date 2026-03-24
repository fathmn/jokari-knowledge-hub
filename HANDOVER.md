# Handover-Protokoll / Changelog

> Dieses Dokument protokolliert alle Aenderungen am Projekt chronologisch.
> Jede Session mit einem AI-Agenten oder Entwickler muss hier dokumentiert werden.
> Format: Datum, Autor, Zusammenfassung, betroffene Dateien, Testhinweise.

---

## 2026-03-24 — Password-Login und Admin-User-Setup (Claude Opus 4.6)

**Kontext:** Der Magic-Link-Login war durch das Supabase-Maillimit (2 Mails/Stunde ohne eigenen SMTP-Server) blockiert. Codex hatte mehrere Workarounds versucht (Hash-Session-Uebernahme, OTP-Verification, Code-Forwarding), das Grundproblem blieb aber bestehen: Ohne E-Mail-Zustellung kein Login.

### Loesung: Password-Login + Admin-API Setup

#### 1.1 Password-Login als primaere Methode
- **Neu:** Login-Seite hat jetzt zwei Modi: "Passwort" (Standard) und "Magic Link" (Alternative)
- **Effekt:** Password-Login braucht keinen E-Mail-Versand, umgeht das Supabase-Maillimit komplett
- **Datei:** `frontend/app/login/page.tsx`

#### 1.2 Sign-Up-Seite mit Backend-Admin-API
- **Neu:** `/signup` Seite erstellt neue User ueber Backend-Endpoint `POST /api/auth/create-user`
- **Effekt:** Der Backend-Endpoint nutzt den Supabase `service_role_key` um User mit `email_confirm: true` anzulegen — keine Bestaetigungsmail noetig
- **Dateien:** `frontend/app/signup/page.tsx` (neu), `backend/app/api/auth_setup.py` (neu), `backend/app/api/__init__.py`

#### 1.3 Middleware und AuthProvider aktualisiert
- **Fix:** `/signup` als oeffentliche Route in Middleware und AuthProvider eingetragen
- **Dateien:** `frontend/middleware.ts`, `frontend/components/AuthProvider.tsx`

#### 1.4 Hash-Session und Code-Forwarding beibehalten
- Die von Codex eingebauten Fallbacks (Hash-basierte Sessions, Auth-Code-Forwarding) wurden aufgeraeumt aber beibehalten — sie greifen wenn der Magic-Link-Weg doch funktioniert

### Verifizierung
- Frontend-Build: `cd frontend && npm run build` erfolgreich (0 Fehler)
- Backend-Syntax: `python3 -m py_compile app/api/auth_setup.py` erfolgreich

### Anleitung zum Einloggen
1. Auf `/signup` gehen und E-Mail + Passwort + Rolle (Admin) waehlen
2. Account wird sofort erstellt und bestaetigt (kein Mail noetig)
3. Auf `/login` gehen und mit Passwort anmelden

### Hinweis
- Der `/api/auth/create-user` Endpoint ist ungeschuetzt — nach dem Erstellen der Admin-User sollte `enable_signup` in Supabase auf `false` gesetzt werden
- Fuer langfristigen Magic-Link-Support: Eigenen SMTP-Server (z.B. Resend, SendGrid) in Supabase konfigurieren

---

## 2026-03-24 — JOKARI Brand-Assets und UI-Branding integriert (Codex)

**Kontext:** Offizielle JOKARI Brand-Assets wurden fuer Frontend-Metadaten, Favicons und die sichtbaren Shell-/Auth-Flaechen uebernommen. Die Hero-/Backdrop-Bilder wurden bewusst nicht integriert.

### Branding-Integration

#### 0.1 Browser- und App-Icons hinterlegt
- **Neu:** Offizielle Favicons und Apple Touch Icon aus `jokari.de` lokal ins Frontend uebernommen.
- **Effekt:** Keine `favicon.ico`-404 mehr; Browser, Homescreen und Manifest verwenden jetzt die offiziellen JOKARI-Assets.
- **Dateien:** `frontend/public/favicon.ico`, `frontend/public/favicon.svg`, `frontend/public/favicon-96x96.png`, `frontend/public/apple-touch-icon.png`, `frontend/public/site.webmanifest`

#### 0.2 Next-Metadaten auf Brand-Assets verdrahtet
- **Neu:** `layout.tsx` exportiert jetzt Icon-, Manifest- und Theme-Color-Metadaten.
- **Effekt:** Vercel/Next liefern fuer Browser-Tabs, PWA-Metadaten und UI-Chrome jetzt konsistente Brand-Informationen aus.
- **Datei:** `frontend/app/layout.tsx`

#### 0.3 Globales UI-Toning auf JOKARI angepasst
- **Fix:** App-Hintergrund, Fokuszustand, Scrollbars, Karten und Button-Stile wurden von neutralem Default auf das gelb-blau-weisse JOKARI-Schema gezogen.
- **Datei:** `frontend/app/globals.css`

#### 0.4 Shell und Login sichtbar gebrandet
- **Fix:** Sidebar, mobiler Header, Loading-State und Login-/Callback-Flows verwenden jetzt die JOKARI-Farben und den offiziellen visuellen Ton statt neutral-schwarzer Defaults.
- **Dateien:** `frontend/components/ClientLayout.tsx`, `frontend/components/Sidebar.tsx`, `frontend/components/AuthProvider.tsx`, `frontend/app/login/page.tsx`

### Verifizierung
- Frontend-Build: `cd frontend && npm run build` erfolgreich
- Asset-Check: Favicons, Apple Touch Icon und Manifest lokal vorhanden

## 2026-03-24 — Production-Cutover auf Supabase-Pooler abgeschlossen (Codex)

**Kontext:** Der neue Supabase-Stack war vorbereitet, aber Railway verwendete noch den direkten Datenbank-Host. Das scheiterte in Railway zur Laufzeit an einer IPv6-only-Verbindung. Der Produktions-Fix bestand darin, Railway auf den Supabase Session Pooler umzustellen und den Live-Stack danach zu verifizieren.

### Produktions-Fix

#### 0.1 Railway auf Supabase Pooler umgestellt
- **Problem:** `db.<project-ref>.supabase.co:5432` war aus Railway heraus nicht erreichbar (`Network is unreachable` auf IPv6-Adresse).
- **Fix:** `DATABASE_URL` in Railway auf den von der Supabase CLI aufgelösten Session-Pooler umgestellt (`aws-1-eu-central-1.pooler.supabase.com:5432`) und mit SSL neu gesetzt.
- **Hinweis:** Für den laufenden FastAPI-Service ist dieser Modus der richtige kurzfristige Produktionspfad; der Direct Host bleibt für dieses Setup ungeeignet.

#### 0.2 Railway-Deployment erfolgreich neu gestartet
- **Status:** Redeploy `d85410fc-0d2d-44f3-b73e-a8a8230412f1` lief erfolgreich durch.
- **Verifizierung:** `GET /health` auf Railway liefert jetzt wieder `200` mit `{"status":"healthy"}`.

#### 0.3 Vercel-Frontend gegen das neue Backend verifiziert
- **Status:** `https://jokari-knowledge-hub.vercel.app/login` liefert `200` und das Frontend ist produktiv live.
- **Hinweis:** Der Rewrite `/api/:path* -> ${NEXT_PUBLIC_API_URL}/api/:path*` ist intakt; ein Test auf `/api/health` ergab erwartungsgemaess `404`, weil der Backend-Healthcheck unter `/health` liegt, nicht unter `/api/health`.

### Architektur-Entscheidung

#### 0.4 Zielbild fuer jetzt festgezogen
- **Empfehlung:** Kurzfristig `Vercel + Railway + Supabase`.
- **Begruendung:** Supabase uebernimmt sauber `Postgres + Auth + Storage`; Railway bleibt nur als Compute-Layer fuer den bestehenden Python/FastAPI-Service. Das ist deutlich schneller und risikoaermer als ein sofortiger Laufzeit-Umbau auf Vercel Functions oder Supabase Edge Functions.
- **Phase 2:** Wenn gewuenscht, kann Railway spaeter entfernt werden, aber das ist ein gezielter Compute-Migrationsschritt, kein einfacher Env-Switch.

## 2026-03-24 — Supabase Auth + Produktions-Migrationsvorbereitung (Codex)

**Kontext:** Sicherheits- und Hosting-Härtung mit neuem Supabase-Projekt. Ziel ist ein konsistenter Stack mit Supabase fuer Daten/Auth/Storage, waehrend der bestehende Python-Compute kurzfristig auf Railway verbleibt. Frontend und Backend wurden lokal auf Supabase Auth umgestellt und fuer den Produktionswechsel vorbereitet.

### Auth & Security

#### 1.1 Supabase Auth im Frontend integriert
- **Neu:** Login-Seite mit Magic-Link-Flow, Callback-Route, Session-Middleware und globaler Auth-Provider fuer geschuetzte Seiten.
- **Effekt:** Seiten und API-Aufrufe werden nur noch mit aktiver Supabase-Session geladen; Bearer-Token werden automatisch an `/api/*` weitergereicht.
- **Dateien:** `frontend/app/login/page.tsx`, `frontend/app/auth/callback/route.ts`, `frontend/components/AuthProvider.tsx`, `frontend/middleware.ts`, `frontend/utils/supabase/*`, `frontend/app/layout.tsx`, `frontend/components/ClientLayout.tsx`, `frontend/components/Sidebar.tsx`

#### 1.2 Backend-API gegen Supabase Sessions abgesichert
- **Neu:** Zentrale Token-Validierung ueber Supabase, Rollenmodell (`viewer`, `reviewer`, `admin`) und Router-Schutz per Dependency.
- **Fix:** Spoofbare `actor`-Felder aus Review-/Approve-Flows entfernt; Audit-Logs verwenden jetzt den authentifizierten Benutzer.
- **Dateien:** `backend/app/auth.py`, `backend/app/api/__init__.py`, `backend/app/api/upload.py`, `backend/app/api/review.py`, `backend/app/api/documents.py`, `backend/app/schemas/review.py`

#### 1.3 Produktions-Defaults gehaertet
- **Fix:** `DEBUG` standardmaessig auf `false`; FastAPI-Doku-Endpunkte werden nur noch im Debug-Modus exponiert.
- **Dateien:** `backend/app/config.py`, `backend/app/main.py`

### Supabase-Projekt & Envs

#### 2.1 Neues Supabase-Projekt vorbereitet
- **Neu:** Repo mit Supabase CLI initialisiert und auf neues Projekt verlinkt; privater Bucket `documents` wurde erstellt.
- **Dateien:** `supabase/config.toml`, `supabase/.gitignore`, `supabase/.temp/*`

#### 2.2 Env-Beispiele auf neuen Stack aktualisiert
- **Fix:** Frontend- und Backend-Env-Beispiele zeigen jetzt auf das neue Supabase-Projekt und enthalten die benoetigten Auth-Variablen.
- **Dateien:** `frontend/.env.example`, `backend/.env.example`

#### 2.3 Lokale Git-Hygiene verbessert
- **Fix:** Lokale Angebots-/Hilfsdateien sowie `frontend/.env.local` werden jetzt ignoriert.
- **Datei:** `.gitignore`

### Frontend/Dependencies

#### 3.1 Next.js und Supabase-Dependencies angehoben
- **Fix:** Next.js auf `14.2.35` angehoben; Supabase SSR/JS Client hinzugefuegt.
- **Dateien:** `frontend/package.json`, `frontend/package-lock.json`

#### 3.2 Kleines API-Interface bereinigt
- **Fix:** Veraltete `actor`-Parameter im Frontend-API-Helper entfernt, passend zur neuen serverseitigen Audit-Quelle.
- **Datei:** `frontend/lib/api.ts`

### Deployment-Status

#### 4.1 Production-Umgebungen vorbereitet
- **Status:** Railway- und Vercel-Variablen wurden auf das neue Supabase-Projekt umgestellt.
- **Hinweis:** Railway CLI-Deploy ueber Archiv scheiterte zunaechst an einer doppelten Root-Directory-Konfiguration (`/backend` + `--path-as-root`). Der robuste Produktionspfad bleibt der bestehende Git-Deploy mit Railway-Service-Root `/backend`.

#### 4.2 Railway-Runtime-Fix
- **Problem:** Alembic schlug in Railway beim Start fehl, weil `ConfigParser` das Prozent-Encoding in der neuen Supabase-`DATABASE_URL` als Interpolation interpretierte.
- **Fix:** `DATABASE_URL` wird in `alembic/env.py` vor `set_main_option()` mit `%%` escaped.
- **Datei:** `backend/alembic/env.py`

### Verifizierung
- Frontend-Build: `cd frontend && npm run build` erfolgreich
- Backend-Syntax: `python3 -m compileall backend/app` erfolgreich
- Vercel-Env-Check: neue `NEXT_PUBLIC_SUPABASE_*` Variablen vorhanden
- Railway-Deployment-Analyse: Fehlerursache fuer den missglueckten CLI-Upload identifiziert (`Could not find root directory: /backend`)
- Railway-Runtime-Analyse: Fehlerursache fuer den Startcrash identifiziert (`invalid interpolation syntax` in Alembic bei percent-encodeter `DATABASE_URL`)

### Offene Punkte
- Erste produktive Supabase-Benutzer anlegen und Rollen setzen
- `disable_signup=true` aktivieren, sobald Admin-Nutzer angelegt sind
- Frontend/Backend final ueber Git deployen und Live-Smoke-Tests fahren
- Optionaler Phase-2-Umbau: Python-Backend von Railway auf Vercel migrieren

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
