# Jokari Knowledge Hub

Interne Wissensmanagement-Plattform für strukturierte Dokumentenverarbeitung mit KI-gestützter Extraktion und Approval-Workflow.

## Features

- **Drag & Drop Upload** - Dokumente hochladen (DOCX, MD, CSV, XLSX, PDF)
- **Schema-driven Extraktion** - Automatische Strukturierung nach Abteilung/Dokumenttyp
- **Review-Workflow** - Genehmigungs-Gate für Qualitätssicherung
- **Evidence Tracking** - Quellenbelege für jedes extrahierte Feld
- **Merge & Versioning** - Updates für bestehende Records mit Diff-Ansicht
- **Agent-Ready API** - Nur genehmigte Records für KI-Agenten verfügbar

## Tech Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend**: FastAPI, Python 3.11, Pydantic
- **Datenbank**: PostgreSQL + pgvector
- **File Storage**: MinIO (S3-kompatibel)
- **Worker**: Celery + Redis
- **LLM**: Anthropic Claude (oder LocalStubExtractor für Dev)

## Voraussetzungen

- Docker & Docker Compose
- Node.js 18+ (für Frontend-Entwicklung)
- Python 3.11+ (für Backend-Entwicklung)

## Quick Start

### 1. Repository klonen

```bash
cd ~/jokari-knowledge-hub
```

### 2. Umgebungsvariablen einrichten

```bash
cd backend
cp .env.example .env
# Optional: ANTHROPIC_API_KEY für LLM-Extraktion setzen
```

### 3. Docker Services starten

```bash
docker-compose up -d
```

Dies startet:
- PostgreSQL mit pgvector (Port 5432)
- Redis (Port 6379)
- MinIO (Ports 9000, 9001)

### 4. Backend starten

```bash
cd backend

# Virtuelle Umgebung erstellen
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Dependencies installieren
pip install -r requirements.txt

# Datenbank-Migrationen
alembic upgrade head

# API starten
uvicorn app.main:app --reload --port 8000
```

### 5. Celery Worker starten (neues Terminal)

```bash
cd backend
source venv/bin/activate
celery -A app.workers.celery_app worker --loglevel=info
```

### 6. Frontend starten (neues Terminal)

```bash
cd frontend
npm install
npm run dev
```

### 7. Öffnen

- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs
- **MinIO Console**: http://localhost:9001 (Credentials: jokari_minio / jokari_minio_secret)

## Projektstruktur

```
jokari-knowledge-hub/
├── docker-compose.yml
├── backend/
│   ├── app/
│   │   ├── api/           # REST Endpoints
│   │   ├── models/        # SQLAlchemy Models
│   │   ├── schemas/       # Pydantic Schemas
│   │   │   └── knowledge/ # Schema Registry
│   │   ├── services/      # Business Logic
│   │   ├── extractors/    # LLM Abstraction
│   │   ├── parsers/       # Document Parser
│   │   └── workers/       # Celery Tasks
│   ├── tests/
│   ├── alembic/           # DB Migrations
│   └── requirements.txt
└── frontend/
    ├── app/               # Next.js Pages
    │   ├── upload/
    │   ├── dokumente/
    │   ├── review/
    │   └── suche/
    └── components/
```

## Schema Registry

Vordefinierte Schemas pro Abteilung:

| Abteilung | Dokumenttypen |
|-----------|---------------|
| Sales | TrainingModule, Objection, Persona, PitchScript, EmailTemplate |
| Support | FAQ, TroubleshootingGuide, HowToSteps |
| Product | ProductSpec, CompatibilityMatrix, SafetyNotes |
| Marketing | MessagingPillars, ContentGuidelines |
| Legal | ComplianceNotes, ClaimsDoDont |

## API Endpoints

### Upload
- `POST /api/upload` - Dokumente hochladen
- `GET /api/upload/doc-types` - Verfügbare Dokumenttypen

### Dokumente
- `GET /api/documents` - Liste aller Dokumente
- `GET /api/documents/{id}` - Dokument-Details
- `GET /api/documents/{id}/chunks` - Text-Chunks
- `GET /api/documents/{id}/records` - Extrahierte Records

### Review
- `GET /api/review` - Review-Queue
- `GET /api/review/{id}` - Record-Details mit Evidence
- `POST /api/review/{id}/approve` - Record genehmigen
- `POST /api/review/{id}/reject` - Record ablehnen
- `PUT /api/review/{id}` - Record bearbeiten

### Knowledge Search (Agent-Ready)
- `GET /api/knowledge/search?q=...&department=...&schema=...`
  - Nur APPROVED Records
  - Inkl. Quellenbelege

### Dashboard
- `GET /api/dashboard/stats` - Statistiken

## Tests ausführen

```bash
cd backend
pytest
```

## LLM-Konfiguration

### Development (Standard)
```env
LLM_PROVIDER=stub
```
Verwendet regelbasierte Extraktion ohne API-Kosten.

### Production
```env
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
```
Verwendet Claude für hochwertige strukturierte Extraktion.

## Workflow

1. **Upload**: Datei mit Metadaten (Abteilung, Typ, Datum, Owner) hochladen
2. **Parsing**: Automatische Textextraktion und Chunking
3. **Extraktion**: LLM extrahiert strukturierte Daten gemäß Schema
4. **Review**: Records erscheinen in der Review-Queue
5. **Genehmigung**: Reviewer prüft Daten und Evidence, genehmigt oder lehnt ab
6. **Verfügbar**: Genehmigte Records sind über die Search-API für Agenten abrufbar

## Merge-Logik

Bei erneutem Upload eines Dokuments:
1. System prüft Primary Key (z.B. Artikelnummer, ID)
2. Bei Match mit genehmigtem Record: Erstellt Update-Vorschlag
3. Diff-Ansicht zeigt Änderungen (hinzugefügt/entfernt/geändert)
4. Reviewer kann Update genehmigen oder ablehnen
5. Version wird inkrementiert bei Genehmigung

## Environment Variables

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| DATABASE_URL | postgresql://... | PostgreSQL Connection |
| REDIS_URL | redis://localhost:6379/0 | Redis für Celery |
| MINIO_ENDPOINT | localhost:9000 | MinIO S3 Endpoint |
| MINIO_ACCESS_KEY | jokari_minio | MinIO Access Key |
| MINIO_SECRET_KEY | jokari_minio_secret | MinIO Secret Key |
| LLM_PROVIDER | stub | stub oder claude |
| ANTHROPIC_API_KEY | - | API Key für Claude |

## Lizenz

Proprietär - Jokari GmbH

## Production Deployment

### Option 1: Vercel + Railway + Supabase (Empfohlen)

#### 1. Supabase (Datenbank)
1. Gehe zu [supabase.com](https://supabase.com) und erstelle ein Projekt
2. Kopiere die `DATABASE_URL` aus Settings > Database

#### 2. Railway (Backend)
1. Gehe zu [railway.app](https://railway.app)
2. "New Project" > "Deploy from GitHub repo"
3. Wähle `jokari-knowledge-hub` und setze Root Directory: `backend`
4. Füge Environment Variables hinzu:
   - `DATABASE_URL` (von Supabase)
   - `REDIS_URL` (Railway Redis Service hinzufügen)
   - `LLM_PROVIDER=stub` (oder `claude` mit API Key)
5. Nach Deploy: Kopiere die Backend-URL (z.B. `https://jokari-backend.up.railway.app`)

#### 3. Vercel (Frontend)
1. Gehe zu [vercel.com](https://vercel.com)
2. "Import Project" > Wähle `jokari-knowledge-hub`
3. Root Directory: `frontend`
4. Environment Variables:
   - `NEXT_PUBLIC_API_URL` = Backend-URL von Railway
5. Deploy!

### Option 2: Docker Compose (Self-Hosted)

```bash
# Auf deinem Server
git clone https://github.com/fathmn/jokari-knowledge-hub.git
cd jokari-knowledge-hub
docker-compose up -d
```
