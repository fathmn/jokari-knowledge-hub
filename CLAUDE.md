# CLAUDE.md - AI Agent Context

> Diese Datei gibt AI-Assistenten (Claude, Cursor, etc.) Kontext zum Projekt.

## Projekt-Kurzfassung

**Jokari Knowledge Hub** - Interne Wissensmanagement-Plattform mit KI-gestützter Dokumentenextraktion und Approval-Workflow. Dokumente werden hochgeladen, strukturiert extrahiert, reviewed und dann für interne AI-Agenten freigegeben.

## Architektur

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │────▶│     Backend     │────▶│    Supabase     │
│  (Next.js 15)   │     │    (FastAPI)    │     │  (PostgreSQL)   │
│ Vercel / ADLOCA │     │  Compute offen  │     │   + Storage     │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

### Deployment URLs
- **Frontend (Vercel / ADLOCA)**: https://jokari-knowledge-hub.vercel.app
- **Aktuelles ADLOCA Deployment**: https://jokari-knowledge-j7zulmvfl-adloca.vercel.app
- **Backend (historisch Railway, aktuell nicht gesund)**: https://jokari-knowledge-hub-production.up.railway.app
- **Database**: Supabase PostgreSQL mit pgvector

Stand 27.04.2026: Die Hauptdomain ist von `fathmns-projects` auf `adloca/jokari-knowledge-hub` umgezogen. Das alte Alias in `fathmns-projects` wurde entfernt, das alte Projekt selbst nicht geloescht. Das ADLOCA-Projekt hat Vercel SSO Protection aktiv; die `vercel.app`-Hauptdomain liefert deshalb aktuell Vercel `401`, bevor die App-Loginseite geladen wird.

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
│   ├── ClientLayout.tsx   # Layout-Wrapper mit ToastProvider
│   ├── DashboardTile.tsx  # Statistik-Kacheln
│   ├── StatusBadge.tsx    # Status-Anzeige
│   ├── CompletenessBar.tsx # Fortschrittsbalken
│   ├── Toast.tsx          # Toast-Notifications + Provider
│   └── ConfirmModal.tsx   # Bestaetigungs-Dialog (ersetzt confirm())
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
│   │   ├── review.py      # Review CRUD + Attachments
│   │   ├── search.py      # Knowledge API (search, detail, schemas, stats)
│   │   └── dashboard.py   # Dashboard-Statistiken
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
| Frontend | Next.js (App Router) | 15.5.15 |
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
- `GET /api/knowledge/{id}` - Einzelner APPROVED Record mit Evidence + Attachments
- `GET /api/knowledge/schemas` - Alle verfuegbaren Schemas
- `GET /api/knowledge/stats` - Knowledge-Base Statistiken

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
| Sales | TrainingModule, Objection, Persona, PitchScript, EmailTemplate |
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
./migrate.sh
uvicorn app.main:app --reload --port 8000
```

### Environment Variables

**Frontend** (`.env.local`):
```
NEXT_PUBLIC_API_URL=https://jokari-knowledge-hub-production.up.railway.app
```

Diese Production-URL ist aktuell ein Blocker: Der Railway-Endpunkt liefert `Application not found`. Fuer lokale Entwicklung bleibt `NEXT_PUBLIC_API_URL=http://localhost:8000` der sichere Standard.

**Backend** (`.env`):
```
DATABASE_URL=postgresql://...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx
LLM_PROVIDER=stub  # oder "claude"
ANTHROPIC_API_KEY=sk-ant-...
CORS_ORIGINS=http://localhost:3000,http://localhost:3002,https://jokari-knowledge-hub.vercel.app
```

## Wichtige Hinweise

### Changelog-Pflicht (HANDOVER.md)
- **Nach JEDER Aenderung** muss `HANDOVER.md` aktualisiert werden
- Format: Datum, Autor, Zusammenfassung, betroffene Dateien, Testhinweise
- Das Dokument dient als Handover zwischen Entwicklern und AI-Agenten
- Auch kleine Fixes dokumentieren — lieber zu viel als zu wenig

### Dont's
- `.env.local` niemals committen
- Keine Breaking Changes an API ohne Backend-Update
- Keine neuen Dependencies ohne Begruendung
- HANDOVER.md nie vergessen nach Aenderungen

### Do's
- TypeScript strict mode beachten
- Tailwind-Klassen statt inline styles
- Deutsche Labels in UI
- Englische Variablen/Code
- HANDOVER.md nach jeder Aenderung aktualisieren
- Langfristige Infrastruktur-Entscheidungen in `docs/architecture/INFRASTRUCTURE_RECOMMENDATION.md` nachlesen und fortschreiben

## Git Workflow

- Main Branch: `main`
- Deployments: Frontend via Vercel im Scope `adloca`; Backend-Compute ist offen
- DB-Migrationen laufen explizit ueber `backend/migrate.sh`, nicht mehr automatisch im App-Start.
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
