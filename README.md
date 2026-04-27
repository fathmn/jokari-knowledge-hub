# Jokari Knowledge Hub

Interne Wissensmanagement-Plattform für strukturierte Dokumentenverarbeitung, Review-Workflows und agent-ready Wissensdaten.

## TL;DR

Wenn du als Entwickler schnell einsteigen willst, sind das die wichtigsten Punkte:

- Die produktive Hauptdomain `https://jokari-knowledge-hub.vercel.app` ist auf das ADLOCA-Vercel-Projekt aliasiert
- `cyan` ist nicht mehr die Hauptdomain und soll nicht als fuehrender Deploy-Pfad verwendet werden
- Der aktuelle Live-Stack ist:
  - `Vercel` fuer das Next.js-Frontend im Scope `adloca`
  - `Supabase` für Auth, Postgres und Storage
  - `Cloud Run` fuer FastAPI-API und Worker
- Auth ist produktiv aktiv
  - offene Registrierung ist deaktiviert
  - Login läuft aktuell über E-Mail + Passwort
  - neue Benutzer und Rollen werden ausschließlich in Supabase verwaltet
- Das Repo ist auf dem aktuellen produktiven Stand
  - `main` enthält die Auth-Rückkehr aus dem Demo-Modus und das Next.js-Sicherheitsupgrade

## Produktionsstatus

Stand: 27.04.2026

### Live-URLs

- Frontend: `https://jokari-knowledge-hub.vercel.app`
- Vercel-Projekt: `adloca/jokari-knowledge-hub`
- Vercel-Deployment: `https://jokari-knowledge-p7ixpp6fa-adloca.vercel.app`
- Backend API: `https://jokari-knowledge-hub-api-apz7sfnrsa-ey.a.run.app`
- Backend Healthcheck: `https://jokari-knowledge-hub-api-apz7sfnrsa-ey.a.run.app/health`

Aktueller Infrastruktur-Befund:

- `https://jokari-knowledge-hub.vercel.app` wurde am 27.04.2026 aus `fathmns-projects` entfernt und auf `adloca/jokari-knowledge-hub` gesetzt.
- Vercel SSO Protection ist deaktiviert, damit die App selbst den Supabase-Login ausliefert.
- `NEXT_PUBLIC_API_URL` zeigt in der ADLOCA-Production-Env auf die Cloud-Run-API.
- Die alte Railway-URL ist nicht mehr der produktive Backend-Pfad.

### Produktive Architektur

```text
Browser
  -> Vercel / Next.js Frontend (adloca)
    -> /api/* Rewrite
      -> FastAPI Backend URL aus NEXT_PUBLIC_API_URL
        -> Supabase Postgres
        -> Supabase Storage (Bucket: documents)
        -> Supabase Auth
```

### Wichtige Einordnung

- Das frühere README war an mehreren Stellen veraltet.
- `MinIO`, `Redis` und `Celery` sind nicht mehr der aktuelle Produktionspfad.
- `Magic Link` war zwischenzeitlich ein Thema, ist aber aktuell nicht der primäre Login-Flow.
- Die temporaere `cyan`-Vercel-Domain existiert noch als Alias im ADLOCA-Projekt, ist aber nicht mehr die fuehrende Hauptdomain.

## Was die App fachlich macht

- Dokumente hochladen und einer Abteilung / einem Dokumenttyp zuordnen
- Inhalte parsen und strukturiert extrahieren
- Review-Queue mit Approve / Reject / Edit
- Knowledge-Ansicht für freigegebene Daten
- Suche über freigegebene Wissenseinträge
- Dashboard mit Statistiken und Vollständigkeitsübersicht

## Phase-1 Datenqualitaet

Stand: 26.03.2026

- Grosse `docx`- und `pdf`-Dokumente werden parser- und chunking-seitig strukturierter segmentiert.
- Der Ingestion-Pfad schickt grosse Dokumente nicht mehr pauschal als einzelnen Volltextblock in die Extraktion, sondern extrahiert chunk-basiert und fuehrt Duplikate innerhalb desselben Imports wieder zusammen.
- Fuer `sales / training_module` gilt jetzt fachlich: Produktlastige Vertriebsschulungen sind meist **mehrteilige Sales-Knowledge-Dokumente**, nicht ein einziges globales Trainingsmodul.
- Im aktuellen Modell bleiben diese Records weiterhin auf dem `TrainingModule`-Pfad, werden aber pro Produkt-/Themenabschnitt einzeln erzeugt.
- Das Feld `version` ist fuer diesen Pfad nicht mehr pro Record zwingend. Wenn nur ein Dokumentstand vorliegt, wird er aus dem Dokumentkontext uebernommen.
- Fuer problematische `docx`-Dateien mit defekten Word-Referenzen gibt es jetzt einen strukturerhaltenden XML-Fallback statt eines reinen Volltext-Fallbacks.
- Falsch klassifizierte `sales`-Uploads wie `persona` fuer ein offensichtliches Vertriebsschulungsdokument laufen nicht mehr still minutenlang durch den Claude-Pfad, sondern schlagen jetzt frueh mit einer klaren Fehlermeldung fehl.
- Parser-/Extraktions-Confidences, `needs_review`-Schwelle, Grouping-Schwellen und erlaubte Upload-Endungen liegen jetzt in zentraler Konfiguration statt verstreut im Code.
- Die Dokument-Detailseite pollt laufende Stati (`uploading`, `parsing`, `extracting`) automatisch nach; der Chunk-Wert wird dort bewusst als `Parsing-Signal` statt als scheinbar exakte KI-Konfidenz dargestellt.
- Das reale Benchmark-Dokument `Konzept_Vertriebsschulung_Entmanteler_Stand_25.02.2021.docx` wurde produktionsnah gegen Claude simuliert und ergab `17` fachliche Units, `17` plausible Records und `0` finale `needs_review`-Records.
- Lokale Entwicklung kann weiterhin mit dem Stub-Extractor laufen; produktiv ist Claude der relevante Extraktor.

## Tech Stack

### Frontend

- Next.js 15.5.15
- React 18
- TypeScript
- Tailwind CSS
- Supabase SSR + Supabase JS Client

### Backend

- FastAPI
- Python 3.11
- SQLAlchemy
- Alembic
- httpx

### Daten und Infrastruktur

- Supabase Postgres
- Supabase Auth
- Supabase Storage
- Cloud Run fuer FastAPI/Python-Compute und Worker-Jobs
- Vercel für das Frontend

## Auth und Berechtigungen

### Aktueller Zustand

- Auth ist aktiv und schützt das Frontend sowie die Backend-Router
- Self-signup ist deaktiviert
- Der Login in der UI läuft aktuell über E-Mail + Passwort
- Die Magic-Link-Callback-Route existiert weiterhin, aber die UI fordert derzeit keine Magic Links mehr aktiv an

### Rollenmodell

- `viewer`
  - darf lesen
- `reviewer`
  - darf zusätzlich Upload und Review nutzen
- `admin`
  - volle Berechtigungen

Die Rollen werden im Backend aus Supabase-Metadaten gelesen:

- primär aus `app_metadata.role`
- fallback aus `user_metadata.role`
- ohne Eintrag standardmäßig `viewer`

### Router-Schutz

### Frontend

- Nicht eingeloggte Nutzer werden über Middleware auf `/login` umgeleitet
- Öffentliche Routen sind aktuell:
  - `/login`
- `/signup` ist entfernt. Account-Erstellung erfolgt nicht in der App.

### Backend

- `documents`, `knowledge`, `dashboard` brauchen einen eingeloggten User
- `upload` und `review` brauchen `reviewer` oder `admin`

## Benutzer anlegen

Da `signup` deaktiviert und aus der App entfernt ist, müssen neue Nutzer in Supabase erstellt werden.

### Empfohlener Weg

Im Supabase-Dashboard:

1. `Authentication -> Users`
2. neuen User anlegen
3. E-Mail als bestätigt markieren
4. Passwort setzen
5. Rolle in `app_metadata.role` setzen

Erlaubte Rollen:

- `admin`
- `reviewer`
- `viewer`

### Wichtig

- Den letzten funktionierenden Admin nicht löschen, bevor ein zweiter Admin existiert
- Ein gelöschter Benutzer kann sich aktuell nicht selbst wieder per UI registrieren
- Wenn Magic Links später wieder produktiv genutzt werden sollen, sollte zuerst ein eigener SMTP-Provider in Supabase konfiguriert werden

## Relevante Supabase-Details

- Projekt-Ref: `gqezmqopvjvpdnknmfap`
- Region: Frankfurt
- Storage-Bucket: `documents`

### Supabase in diesem Projekt wird genutzt für

- Auth
- Datenbank
- Dateiablage
- Signed URLs für Attachments

## Repository-Status und Source of Truth

Dieses README ist die schnellste Einstiegsdoku für den Ist-Zustand.

Weitere relevante Dateien:

- `docs/architecture/INFRASTRUCTURE_RECOMMENDATION.md`
  - langfristige Infrastruktur-Empfehlung
  - Roadmap fuer Railway-Ablösung, Container-Compute, Jobs/Worker und Migrationen
- `infra/cloud-run/README.md`
  - empfohlener Container-Deploymentpfad fuer FastAPI API und Worker
  - listet notwendige Secrets und Deploy-Schritte
- `HANDOVER.md`
  - chronologisches Protokoll der Änderungen
  - nützlich für Ursachenanalyse und Verlauf
- `PROJECT_FLOW.md`
  - End-to-End-Ablauf als Diagramm
  - Soll-/Ist-Abgleich gegen den internen Implementierungsplan
- `CLAUDE.md`
  - technische Zusatznotizen und Infrastrukturkontext

Wenn README und ältere Doku widersprüchlich sind, gilt:

1. Live-System
2. aktueller Code auf `main`
3. dieses README
4. `HANDOVER.md`

## Lokale Entwicklung

### Voraussetzungen

- Node.js 20+
- Python 3.11+
- Zugriff auf Supabase-Projekt und passende Env-Variablen

### Backend lokal starten

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
./migrate.sh
uvicorn app.main:app --reload --port 8000
```

### Worker lokal starten

Langlaufende Jobs sollen schrittweise aus API-Requests herausgeloest werden. Der erste Worker-Einstieg verarbeitet queued Jobs aus der Tabelle `jobs`.

```bash
cd backend
source venv/bin/activate
python -m app.worker --once
```

### Frontend lokal starten

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

### Lokale URLs

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

### Aktuelle `.env`-Variablen

### Backend

Siehe `backend/.env.example`

Wesentliche Variablen:

- `DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_BUCKET`
- `ANTHROPIC_API_KEY`
- `LLM_PROVIDER`
- `CORS_ORIGINS`
- `DEBUG`
- `SECRET_KEY`

### Frontend

Siehe `frontend/.env.example`

Wesentliche Variablen:

- `NEXT_PUBLIC_API_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## Deployment

### Frontend

Das Frontend liegt auf Vercel.

### Wichtig

Es gab zwei getrennte Vercel-Projekte mit identischem Namen:

- `fathmns-projects/jokari-knowledge-hub`
- `adloca/jokari-knowledge-hub`

Die produktive Hauptdomain haengt seit 27.04.2026 am ADLOCA-Projekt:

- `adloca/jokari-knowledge-hub`

Die lokale Verknuepfung `.vercel/project.json` zeigt ebenfalls auf dieses Projekt.

Das fruehere Alias in `fathmns-projects` wurde entfernt. Das alte Vercel-Projekt selbst wurde nicht geloescht.

Wichtiger Zugriffsstatus: Im ADLOCA-Projekt ist Vercel SSO Protection deaktiviert. Die App nutzt den eigenen Supabase-Login.

### Manueller Production-Deploy

```bash
vercel deploy --prod -y --logs --scope adloca
```

### Backend

Der produktive Backend-Pfad ist Cloud Run:

- API: `https://jokari-knowledge-hub-api-apz7sfnrsa-ey.a.run.app`
- Worker: Cloud Run Job `jokari-knowledge-hub-worker`

Der alte Railway-Pfad ist historisch und aktuell nicht gesund.

Dokumentierter historischer Service-Kontext:

- Project: `gracious-magic`
- Environment: `production`
- Service: `jokari-knowledge-hub`

### Manueller Deploy

```bash
gcloud builds submit backend \
  --tag europe-west3-docker.pkg.dev/jokari-knowledge-hub/jokari/jokari-knowledge-hub-backend:latest \
  --project jokari-knowledge-hub

gcloud run services replace /tmp/jokari-api.service.yaml \
  --region europe-west3 \
  --project jokari-knowledge-hub

gcloud run jobs replace /tmp/jokari-worker.job.yaml \
  --region europe-west3 \
  --project jokari-knowledge-hub
```

Migrationen sollen explizit vor einem Deploy/Start laufen. Der App-Start selbst fuehrt keine Datenbankmigration mehr automatisch aus.

### Hinweis zur Datenbankverbindung

Cloud Run verwendet eine dedizierte Runtime-DB-Rolle `jokari_backend` ueber den Supabase Session Pooler `aws-1-eu-central-1.pooler.supabase.com:5432`. Der direkte Supabase-DB-Host ist IPv6-only und fuer diesen Cloud-Run-Pfad nicht der Standard.

Aktueller Befund vom 27.04.2026:

- `railway status` im Repo findet kein verlinktes Railway-Projekt.
- `railway whoami` ist lokal nicht autorisiert.
- `https://jokari-knowledge-hub-production.up.railway.app/health` liefert `Application not found`.
- Railway kann deshalb nicht als bestaetigter aktiver Production-Backend-Host gelten.

## Verifikation nach Deploy

### Frontend

Erwartetes Verhalten:

- `/login` liefert `200`
- `/` leitet abgemeldet auf `/login?next=%2F`
- `site.webmanifest` liefert `200` und darf nicht auf Login umgeleitet werden

Aktueller ADLOCA-Status:

- Deployment ist `READY`.
- Hauptalias zeigt auf ADLOCA.
- Vercel SSO Protection ist deaktiviert; die App leitet abgemeldet auf `/login` um.

### Backend

Produktives Verhalten:

```bash
curl https://jokari-knowledge-hub-api-apz7sfnrsa-ey.a.run.app/health
```

Soll liefern:

```json
{"status":"healthy"}
```

## Bekannte Entscheidungen und Altlasten

### Bewusst so gelöst

- Passwort-Login ist derzeit der produktive Default
- offene Registrierung ist abgeschaltet
- Supabase bleibt Source of Truth fuer Auth, Postgres und Storage
- FastAPI laeuft produktiv auf Cloud Run; Worker-Jobs laufen als Cloud Run Job
- User-Anlage und Rollenvergabe passieren nur in Supabase, nicht ueber App-Endpunkte

### Nicht mehr aktuell

- MinIO als produktiver Storage
- Redis / Celery als produktiver Worker-Pfad
- offene Signup-Strecke
- interner App-/Backend-Endpoint zur User-Erstellung
- `cyan` als bevorzugte Frontend-Domain

## Bekannte offene Punkte

### 1. Backend-Compute

Das endgültige Zielbild ist:

- `Vercel` für Frontend
- `Supabase` für Daten, Auth, Storage
- FastAPI/Python als Container auf Cloud Run betreiben
- laengere Jobs als Cloud Run Jobs ausfuehren

Supabase ersetzt Railway nicht als Drop-in-Host fuer das bestehende FastAPI/Python-Backend. Eine Supabase-only-Migration waere ein gezielter API-Umbau, kein Env-Wechsel.

### 2. Magic Link ist nicht der primäre Login-Flow

Der Callback-Code ist vorhanden, aber die UI nutzt aktuell Passwort-Login.

Wenn Magic Links wieder produktiv werden sollen:

1. SMTP in Supabase sauber konfigurieren
2. UI-Flow bewusst wieder aktivieren
3. Login-Verhalten erneut smoke-testen

### 3. Rollen- und User-Operations sind bewusst in Supabase

Benutzeranlage und Rollenvergabe passieren ueber Supabase Auth/Admin, nicht ueber eine interne Admin-Oberflaeche oder einen Backend-Setup-Endpunkt.

## Sicherheitsstatus

Stand 27.04.2026:

- Auth ist aktiv
- Self-signup ist deaktiviert
- Backend-Router sind geschützt
- Frontend sendet Supabase Bearer Tokens automatisch an `/api/*`
- Next.js wurde auf eine gepatchte Version angehoben
- `npm audit` meldet aktuell zwei moderate Next/PostCSS-Findings; `npm audit fix --force` waere ein potenziell brechender Downgrade-/Upgrade-Pfad und wurde nicht automatisch ausgefuehrt.

## Empfohlene nächste Schritte

1. Review-Queue fuer groessere Multi-Record-Imports gezielt verbessern
2. Das reale Benchmark-Dokument produktionsnah mit Claude erneut durchtesten und die resultierende `needs_review`-Quote gegen den bisherigen Stand vergleichen
3. Interne Suche von Textsuche auf embeddings-/`pgvector`-gestuetztes Retrieval anheben
4. Optional: Supabase-only Rewrite einzelner Backend-Funktionen evaluieren, wenn FastAPI langfristig reduziert werden soll

## Tests und Kommandos

### Frontend-Build

```bash
cd frontend
npm run build
```

### Frontend Security Check

```bash
cd frontend
npm audit
```

### Backend-Syntaxcheck

```bash
cd backend
python3 -m compileall app
```

### Backend-Tests

```bash
backend/venv/bin/pytest -q backend/tests
```

## Lizenz

Proprietär - Jokari GmbH
