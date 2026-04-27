# Cloud Run Backend Target

This is the recommended Railway replacement target for the current backend shape.

Cloud Run keeps the existing FastAPI container model and lets us run a separate worker job from the same image. This avoids a risky 1:1 move to Vercel Functions while preserving upload, parsing, crawl, LLM, and storage behavior.

## Services

- `jokari-knowledge-hub-api`: FastAPI web API, runs `./start.sh`.
- `jokari-knowledge-hub-worker`: Cloud Run Job, runs `python -m app.worker --once`.

## Runtime Scaling

The API service is intentionally configured with `autoscaling.knative.dev/minScale: "1"`.
This keeps one warm API instance available and avoids the slow first dashboard
load caused by Cloud Run cold starts.

Tradeoff: this creates baseline Cloud Run cost even when there is no traffic.
The current decision favors internal user experience and predictable dashboard
latency over scale-to-zero savings. If cost becomes more important than latency,
set `minScale` back to `"0"` and expect slower first requests after idle periods.

## Required Secrets

Create these in Google Secret Manager before deployment:

- `jokari-database-url`
- `jokari-supabase-url`
- `jokari-supabase-service-role-key`
- `jokari-anthropic-api-key`
- `jokari-backend-secret-key`
- `jokari-trusted-ingestion-api-keys`
- `jokari-trusted-pim-ingestion-sources`

Do not commit secret values.

### Database Runtime User

Cloud Run should not use the Supabase `postgres` owner password. Use a dedicated
runtime login role instead:

- role: `jokari_backend`
- pooler user: `jokari_backend.gqezmqopvjvpdnknmfap`
- pooler host: `aws-1-eu-central-1.pooler.supabase.com`
- pooler port: `5432`
- database: `postgres`
- SSL: required

The current Cloud Run manifests pin `jokari-database-url` to Secret Manager
version `2`, which contains the generated `jokari_backend` runtime connection
string. If the DB password is rotated, add a new secret version and update the
pinned version in both Cloud Run manifests.

The runtime role has CRUD access to the existing Knowledge Hub tables. Schema
migrations should still be run separately with an owner/admin connection.

## Deployment Outline

Replace `PROJECT_ID` and `REGION` in the YAML files or render them in CI.

```bash
cd backend
./migrate.sh

gcloud artifacts repositories create jokari \
  --repository-format=docker \
  --location=REGION

gcloud builds submit \
  --tag REGION-docker.pkg.dev/PROJECT_ID/jokari/jokari-knowledge-hub-backend:latest \
  backend

gcloud run services replace infra/cloud-run/api.service.yaml --region REGION
gcloud run jobs replace infra/cloud-run/worker.job.yaml --region REGION
```

After deploy:

```bash
curl https://API_URL/health
```

The Vercel frontend needs to call the API from the browser, so the API service
must allow public invocation:

```bash
gcloud run services add-iam-policy-binding jokari-knowledge-hub-api \
  --region REGION \
  --member=allUsers \
  --role=roles/run.invoker
```

Then set Vercel `NEXT_PUBLIC_API_URL` to the Cloud Run API base URL and redeploy
the frontend:

```bash
vercel env update NEXT_PUBLIC_API_URL production --scope adloca --yes
vercel deploy --prod -y --scope adloca
```

Current production API URL:

```text
https://jokari-knowledge-hub-api-apz7sfnrsa-ey.a.run.app
```

## Worker Invocation

The initial worker processes one queued job per execution:

```bash
gcloud run jobs execute jokari-knowledge-hub-worker --region REGION
```

Later this can be triggered by Cloud Scheduler or Eventarc.
