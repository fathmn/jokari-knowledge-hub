# Infrastructure Recommendation

Stand: 28.04.2026

## Entscheidung

Langfristig soll Railway nicht die Zielplattform bleiben. Der Knowledge Hub soll aber auch nicht kurzfristig als 1:1-Lift-and-shift auf Vercel Functions umziehen.

Empfohlenes Zielbild:

- Vercel ADLOCA fuer das Next.js Frontend
- Supabase Pro ADLOCA fuer Postgres, Auth, Storage und spaeter pgvector/RPC
- Container-Compute fuer FastAPI API und Worker, bevorzugt Cloud Run oder ein vergleichbarer Container-Host
- Railway nur als kurzfristige Wiederherstellungsoption, falls das bestehende Backend sofort live gebracht werden muss
- Cloud Run API mit `minScale: 1`, damit interne Dashboard- und Review-Flows nicht unter Cold Starts leiden

Konkreter Zielpfad im Repo:

- `infra/cloud-run/api.service.yaml`
- `infra/cloud-run/worker.job.yaml`
- `infra/cloud-run/README.md`

## Begruendung

Das aktuelle FastAPI Backend ist keine reine Request/Response-API. Es verarbeitet Uploads, Dokumentparser, Claude-Extraktion, Website-Crawls, Supabase-Storage-Operationen, Auto-Approval-Logik und Audit Trails.

Ein direkter Umzug auf Vercel Functions wuerde folgende Risiken erzeugen:

- Multipart-Uploads laufen heute durch FastAPI.
- Dokumentverarbeitung nutzt FastAPI `BackgroundTasks` im Webprozess.
- Claude- und Crawl-Jobs koennen deutlich laenger laufen als normale API-Requests.
- Das SQLAlchemy Pooling ist noch nicht serverless-optimiert.
- Alembic-Migrationen waren historisch an den App-Start gekoppelt.

Vercel kann FastAPI hosten, ist fuer diesen Zuschnitt aber erst nach einer Entkopplung der Langlaeufer sinnvoll.

## Roadmap

### Phase 1: Production stabilisieren

- Vercel SSO Protection fuer die produktive App bewusst setzen oder deaktivieren.
- Backend-Compute wieder gesund machen: kurzfristig Railway reparieren oder Container-Host nutzen.
- `NEXT_PUBLIC_API_URL` auf einen gesunden Backend-Host setzen.
- Alembic-Migrationen explizit ausfuehren, nicht automatisch beim App-Start.

### Phase 2: Jobs entkoppeln

- Generische Job-Tabelle fuer Upload-, Crawl- und LLM-Arbeit einfuehren.
- Web-API legt Jobs an und liefert Status.
- Worker verarbeitet Jobs ausserhalb des Webrequests.
- Uploads perspektivisch direkt in Supabase Storage verschieben; Backend schreibt Metadaten und startet Jobs.

Aktueller Einstieg:

- `backend/alembic/versions/004_add_jobs.py` legt die Job-Tabelle an.
- `backend/app/services/jobs.py` kapselt Job-Lifecycle und Idempotenz.
- `backend/app/worker.py` ist der erste Worker-Einstieg fuer queued Jobs.
- `infra/cloud-run/` enthaelt den empfohlenen API/Worker-Deploymentpfad.

### Phase 3: Plattform bereinigen

- FastAPI als duenne API belassen.
- Worker als Container betreiben.
- Einfache Query-Endpunkte spaeter optional nach Supabase RPC/PostgREST/Edge Functions verschieben.
- Erst danach Vercel Python/FastAPI fuer eine duenne API evaluieren.

## Migrationen

Alembic bleibt kurzfristig Source of Truth fuer das Datenbankschema. Supabase GitHub Integration sollte erst aktiviert werden, wenn entschieden ist, ob Alembic beibehalten oder kontrolliert in `supabase/migrations` ueberfuehrt wird.

Regel ab sofort:

- `backend/migrate.sh` fuehrt Migrationen explizit aus.
- `backend/start.sh` startet nur die App.
- Produktionsdeploys muessen Migrationen vor dem App-Start als separaten Schritt ausfuehren.

## Aktueller Stand

- Frontend liegt im Vercel Scope `adloca`.
- Supabase Projekt `gqezmqopvjvpdnknmfap` ist verifiziert.
- Cloud Run ist der aktive Backend-Zielpfad fuer API und Worker.
- Die API ist bewusst mit einer warmen Mindestinstanz konfiguriert (`minScale: 1`).
- Railway CLI ist lokal nicht autorisiert und kein Jokari-Projekt ist lokal verlinkt.
- Vercel Production Env enthaelt aktuell nur Frontend-Variablen, keine Backend-Secrets.
