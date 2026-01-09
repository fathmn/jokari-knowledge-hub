# CLAUDE.md - AI Agent Context

> Diese Datei gibt AI-Assistenten (Claude, Cursor, etc.) Kontext zum Projekt.

## Projekt-Kurzfassung

**Jokari Knowledge Hub** - Interne Wissensmanagement-Plattform mit KI-gestützter Dokumentenextraktion und Approval-Workflow. Dokumente werden hochgeladen, strukturiert extrahiert, reviewed und dann für interne AI-Agenten freigegeben.

## Architektur

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│     Backend     │────▶│    Supabase     │
│  (Next.js 14)   │     │    (FastAPI)    │     │  (PostgreSQL)   │
│    Vercel       │     │    Railway      │     │   + Storage     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Deployment URLs
- **Frontend (Vercel)**: https://jokari-knowledge-hub.vercel.app
- **Backend (Railway)**: https://jokari-knowledge-hub-production.up.railway.app
- **Database**: Supabase PostgreSQL mit pgvector

## Wichtige Verzeichnisse

### Frontend (`/frontend`)
```
frontend/
├── app/                    # Next.js App Router Pages
│   ├── page.tsx           # Dashboard
│   ├── upload/page.tsx    # Dokument-Upload
│   ├── dokumente/page.tsx # Dokumentenliste
│   ├── review/page.tsx    # Review-Warteschlange
│   └── api/               # API Proxies (rewrites zu Backend)
├── components/            # Wiederverwendbare UI-Komponenten
│   ├── Sidebar.tsx        # Navigation (macOS-Style)
│   ├── DashboardTile.tsx  # Statistik-Kacheln
│   ├── StatusBadge.tsx    # Status-Anzeige
│   └── CompletenessBar.tsx # Fortschrittsbalken
├── public/
│   └── logo.svg           # Jokari Logo
└── tailwind.config.ts     # Tailwind mit Jokari-Farben
```

### Backend (`/backend`)
```
backend/
├── app/
│   ├── api/               # REST Endpoints
│   │   ├── upload.py      # POST /api/upload
│   │   ├── documents.py   # GET /api/documents
│   │   ├── review.py      # Review CRUD
│   │   └── knowledge.py   # Agent-ready Search API
│   ├── models/            # SQLAlchemy Models
│   │   ├── document.py    # Dokument-Entität
│   │   └── record.py      # Extrahierter Record
│   ├── schemas/           # Pydantic Schemas
│   │   └── knowledge/     # Schema Registry (pro Abteilung)
│   ├── services/          # Business Logic
│   │   ├── document_service.py
│   │   └── extraction_service.py
│   ├── extractors/        # LLM Abstraction
│   │   ├── base.py        # Interface
│   │   ├── claude.py      # Anthropic Claude
│   │   └── stub.py        # Lokaler Test-Extractor
│   └── parsers/           # Datei-Parser
│       ├── docx.py
│       ├── pdf.py
│       └── markdown.py
├── alembic/               # DB Migrations
└── requirements.txt
```

## Technologie-Stack

| Bereich | Technologie | Version |
|---------|-------------|---------|
| Frontend | Next.js (App Router) | 14.x |
| Styling | Tailwind CSS | 3.x |
| Backend | FastAPI | 0.100+ |
| ORM | SQLAlchemy | 2.x |
| Database | PostgreSQL + pgvector | 15+ |
| File Storage | Supabase Storage | - |
| LLM | Anthropic Claude | claude-3-sonnet |

## Design System

### Farben (Jokari Brand)
```css
--primary: #ffed00    /* Jokari Gelb */
--accent: #24388d     /* Jokari Blau */
--foreground: #1d1d1f /* Dunkelgrau */
--background: #f5f5f7 /* Hellgrau */
```

### UI-Stil
- Apple/macOS Sonoma inspiriert
- Floating Containers mit `rounded-2xl`
- Backdrop-blur auf Sidebar
- Subtile Schatten (`shadow-sm`)
- Inter Font mit tight tracking

### CSS-Klassen (globals.css)
- `.card` - Basis-Karte mit Border
- `.card-hover` - Hover-Effekt
- `.btn-primary` - Primärer Button (dunkel)
- `.btn-accent` - Akzent-Button (gelb)

## API Endpoints

### Upload
- `POST /api/upload` - Multipart File Upload
- `GET /api/upload/doc-types` - Schema Registry

### Documents
- `GET /api/documents` - Liste (paginiert)
- `GET /api/documents/{id}` - Details
- `GET /api/documents/{id}/records` - Extrahierte Records

### Review
- `GET /api/review` - Pending Records
- `POST /api/review/{id}/approve` - Genehmigen
- `POST /api/review/{id}/reject` - Ablehnen

### Knowledge (Agent API)
- `GET /api/knowledge/search?q=...` - Nur APPROVED Records

### Dashboard
- `GET /api/dashboard/stats` - Statistiken

## Workflow

```
Upload → Parsing → Extraktion → Review → Approved → Agent-Ready
```

1. **Upload**: Datei + Metadaten (Abteilung, Typ)
2. **Parsing**: Text-Extraktion, Chunking
3. **Extraktion**: LLM strukturiert nach Schema
4. **Review**: Manuelles Review mit Evidence
5. **Approved**: Verfügbar über Knowledge API

## Schema Registry

Strukturierte Extraktion nach Abteilung:

| Abteilung | Schemas |
|-----------|---------|
| Sales | TrainingModule, Objection, Persona, PitchScript |
| Support | FAQ, TroubleshootingGuide, HowToSteps |
| Product | ProductSpec, CompatibilityMatrix, SafetyNotes |
| Marketing | MessagingPillars, ContentGuidelines |
| Legal | ComplianceNotes, ClaimsDoDont |

## Lokale Entwicklung

### Frontend
```bash
cd frontend
npm install
npm run dev -- -p 3002  # Port 3000/3001 oft belegt
```

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Environment Variables

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_API_URL=https://jokari-knowledge-hub-production.up.railway.app
```

**Backend** (`.env`):
```
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=xxx
LLM_PROVIDER=stub  # oder "claude"
ANTHROPIC_API_KEY=sk-ant-...
```

## Wichtige Hinweise

### Dont's
- `.env.local` niemals committen
- Keine Breaking Changes an API ohne Backend-Update
- Keine neuen Dependencies ohne Begründung

### Do's
- TypeScript strict mode beachten
- Tailwind-Klassen statt inline styles
- Deutsche Labels in UI
- Englische Variablen/Code

## Git Workflow

- Main Branch: `main`
- Deployments: Automatisch via Vercel/Railway
- Commits: Conventional Commits (feat/fix/chore)

## Häufige Tasks

### UI ändern
1. Komponente in `/frontend/components` oder `/frontend/app` finden
2. Tailwind-Klassen anpassen
3. `npm run dev` zum Testen
4. Commit & Push für Auto-Deploy

### API erweitern
1. Endpoint in `/backend/app/api/` erstellen
2. Schema in `/backend/app/schemas/` definieren
3. Router in `/backend/app/main.py` registrieren
4. Frontend-Proxy in `next.config.js` (rewrites) prüfen

### Schema hinzufügen
1. Pydantic-Modell in `/backend/app/schemas/knowledge/`
2. In Registry (`__init__.py`) registrieren
3. Frontend-Labels in Page-Komponenten aktualisieren
