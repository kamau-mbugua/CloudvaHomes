# GCP setup (one-time, per environment)

Architecture: design doc §4.6. These commands create the **dev** environment; repeat with a
different project id for `staging` and `prod` (separate projects keep prod data and IAM apart).

Nothing here has been run yet — it needs an owner with billing access. Review every command
before running it; several create billable resources (Cloud SQL is the main cost).

## 0. Decide first

- **Region** — `africa-south1` (Johannesburg, closest to Kenya) or `europe-west1`. Before choosing,
  confirm Cloud SQL, Cloud Run, Cloud Tasks, Cloud Scheduler and Firebase Hosting rewrites are
  available there. Storing Kenyan personal data abroad is a cross-border transfer under the
  Data Protection Act 2019 — get Legal's sign-off (design §8).
- **GitHub repo** — `OWNER/REPO` that will deploy (used to scope Workload Identity Federation).

```bash
export PROJECT_ID=hodi-dev
export REGION=africa-south1          # or europe-west1
export GITHUB_REPO=OWNER/REPO        # e.g. cloudvalabs/cloudvahomes
export DB_INSTANCE=hodi-pg
```

## 1. Project and APIs

```bash
gcloud projects create "$PROJECT_ID"            # or use an existing project
gcloud billing projects link "$PROJECT_ID" --billing-account=XXXXXX-XXXXXX-XXXXXX
gcloud config set project "$PROJECT_ID"

gcloud services enable \
  run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com cloudkms.googleapis.com cloudtasks.googleapis.com \
  cloudscheduler.googleapis.com iamcredentials.googleapis.com sts.googleapis.com \
  firebase.googleapis.com firebasehosting.googleapis.com compute.googleapis.com
```

## 2. Artifact Registry

```bash
gcloud artifacts repositories create hodi \
  --repository-format=docker --location="$REGION" \
  --description="Hodi container images"
```

## 3. Cloud SQL for PostgreSQL 16

Dev uses a small zonal instance. **Prod:** `--availability-type=REGIONAL`, a larger tier,
`--deletion-protection`, and private IP only (VPC + Private Service Access).

```bash
gcloud sql instances create "$DB_INSTANCE" \
  --database-version=POSTGRES_16 --region="$REGION" \
  --tier=db-custom-1-3840 --storage-auto-increase \
  --backup-start-time=01:00 --enable-point-in-time-recovery \
  --database-flags=timezone=Africa/Nairobi

gcloud sql databases create hodi --instance="$DB_INSTANCE"

DB_PASSWORD="$(openssl rand -base64 32 | tr -d '/+=' | cut -c1-32)"
gcloud sql users create hodi --instance="$DB_INSTANCE" --password="$DB_PASSWORD"
```

## 4. Secrets

Cloud Run reaches Cloud SQL through the built-in connector (unix socket):

```bash
CONN="$PROJECT_ID:$REGION:$DB_INSTANCE"
printf 'postgresql://hodi:%s@localhost/hodi?host=/cloudsql/%s' "$DB_PASSWORD" "$CONN" \
  | gcloud secrets create hodi-database-url --data-file=- --replication-policy=automatic
unset DB_PASSWORD
```

Token-signing secret (also keys OTP hashes). Rotating it signs everyone out.

```bash
openssl rand -base64 48 | tr -d '\n' \
  | gcloud secrets create hodi-jwt-secret --data-file=- --replication-policy=automatic
```

Field encryption for ID numbers (design §8). Losing these keys makes the encrypted values
unreadable — the secret versions are the backup, so never destroy an old version that is still
listed. To rotate the encryption key, add a new version whose value is `k2:<new key>,k1:<old key>`
(new key first); the index key never rotates.

```bash
printf 'k1:%s' "$(openssl rand -base64 32)" \
  | gcloud secrets create hodi-field-keys --data-file=- --replication-policy=automatic
openssl rand -base64 32 | tr -d '\n' \
  | gcloud secrets create hodi-field-index-key --data-file=- --replication-policy=automatic
```

Security follow-up before go-live: these keys sit in Secret Manager. Wrapping them with a Cloud
KMS key (envelope encryption, design §8) can be added without re-encrypting stored data.

Messaging (when ready to send real SMS/email): create secrets for the Africa's Talking API key
and SMTP password, then add `SMS_PROVIDER=africastalking`, `AT_USERNAME`, `AT_SENDER_ID`,
`EMAIL_PROVIDER=smtp`, `SMTP_HOST`, `SMTP_USER`, `EMAIL_FROM` as env vars and
`AT_API_KEY=…:latest`, `SMTP_PASS=…:latest` via `--set-secrets` in `deploy-dev.yml`. Until then
codes and invitation links only appear in Cloud Logging (bodies hidden in production), so for
dev testing set `NODE_ENV` appropriately or configure the sandbox provider.

## 5. Service accounts

```bash
# Runtime identity of the API and the migration job
gcloud iam service-accounts create hodi-api --display-name="Hodi API runtime"
RUNTIME_SA="hodi-api@$PROJECT_ID.iam.gserviceaccount.com"
for role in roles/cloudsql.client roles/secretmanager.secretAccessor; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$RUNTIME_SA" --role="$role"
done

# Identity GitHub Actions deploys as
gcloud iam service-accounts create deployer --display-name="GitHub Actions deployer"
DEPLOY_SA="deployer@$PROJECT_ID.iam.gserviceaccount.com"
for role in roles/run.admin roles/artifactregistry.writer roles/firebasehosting.admin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$DEPLOY_SA" --role="$role"
done
# The deployer must be able to run services/jobs as the runtime SA
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member="serviceAccount:$DEPLOY_SA" --role=roles/iam.serviceAccountUser
```

## 6. Workload Identity Federation (GitHub → GCP, no JSON keys)

```bash
gcloud iam workload-identity-pools create github --location=global --display-name="GitHub"

gcloud iam workload-identity-pools providers create-oidc github \
  --location=global --workload-identity-pool=github \
  --issuer-uri="https://token.actions.githubusercontent.com" \
  --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository" \
  --attribute-condition="assertion.repository == '$GITHUB_REPO'"

PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role=roles/iam.workloadIdentityUser \
  --member="principalSet://iam.googleapis.com/projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/attribute.repository/$GITHUB_REPO"

echo "GCP_WIF_PROVIDER=projects/$PROJECT_NUMBER/locations/global/workloadIdentityPools/github/providers/github"
```

## 7. Firebase Hosting

```bash
firebase projects:addfirebase "$PROJECT_ID"
```

Then in `frontend/firebase.json`, replace the `REGION` placeholder in the `/api/**` rewrite with
`$REGION`, and copy `frontend/.firebaserc.example` to `.firebaserc` with the project id.

## 8. GitHub environment `dev`

Repository → Settings → Environments → `dev` → Variables:

| Variable | Value |
|---|---|
| `GCP_PROJECT_ID` | `$PROJECT_ID` |
| `GCP_REGION` | `$REGION` |
| `GCP_WIF_PROVIDER` | output of step 6 |
| `GCP_DEPLOY_SA` | `deployer@$PROJECT_ID.iam.gserviceaccount.com` |
| `GCP_RUNTIME_SA` | `hodi-api@$PROJECT_ID.iam.gserviceaccount.com` |
| `CLOUD_SQL_INSTANCE` | `$PROJECT_ID:$REGION:$DB_INSTANCE` |
| `APP_URL` | `https://$PROJECT_ID.web.app` (or your custom domain) |

Then create the first platform admin (one-off, from a machine with Cloud SQL access, e.g. via
the Cloud SQL Auth Proxy):

```bash
cd backend && npm run build
DATABASE_URL='postgresql://hodi:…@127.0.0.1:5432/hodi' HODI_ADMIN_PASSWORD='…' \
  npm run cli:create-platform-admin -- --email you@yourcompany.com --phone 07XXXXXXXX
```

Pushing to `develop` then runs `.github/workflows/deploy-dev.yml`: build → push → migrate → deploy API → deploy web.

## 9. Daily invoice run (phase 3)

After the first deploy (you need the API's URL). Cloud Scheduler calls the API with a Google
OIDC token for a dedicated service account; the API accepts only that account and audience.
The job is idempotent, so retries are safe.

```bash
API_URL=$(gcloud run services describe hodi-api --region "$REGION" --format 'value(status.url)')
gcloud iam service-accounts create scheduler --display-name "Hodi Cloud Scheduler"
SCHED_SA="scheduler@$PROJECT_ID.iam.gserviceaccount.com"
gcloud scheduler jobs create http hodi-invoice-run --location "$REGION" \
  --schedule "30 0 * * *" --time-zone "Africa/Nairobi" \
  --uri "$API_URL/api/v1/internal/jobs/invoice-run" --http-method POST \
  --headers "Content-Type=application/json" --message-body '{}' \
  --oidc-service-account-email "$SCHED_SA" --oidc-token-audience "$API_URL" \
  --attempt-deadline 10m --max-retry-attempts 3
```

Then add GitHub variables `JOBS_AUDIENCE=$API_URL`, `API_URL=$API_URL` and
`GCP_SCHEDULER_SA=$SCHED_SA` and redeploy. Until both are set the endpoint answers 404. The Cloud Run service stays
`--allow-unauthenticated` (users reach it through Firebase Hosting); the job endpoint does its own
token check. Test it once with **Force run** in the console and check the logs.

## Later phases (not needed for phase 0)

- **Cloud NAT + reserved static IP** for outbound calls to banks/Daraja that whitelist IPs (needs Direct VPC egress on the service).
- **Cloud KMS** key ring for field-level encryption (phase 1+).
- **Cloud Tasks** queues (messaging).
- **Uptime checks and alerts** on `/api/v1/health/ready`, 5xx rate and job failures.

## 10. M-Pesa (phase 5)

Each organisation enters its own Daraja app keys in the web app (Payment channels → Daraja);
nothing about them lives in GCP. Two things do:

- **Callback URLs** are built from `API_URL` (the Cloud Run URL), not the Firebase domain:
  Safaricom's source address is checked, and through Firebase Hosting the API would only see the
  CDN's address. Cloud Run is one proxy hop (`TRUST_PROXY_HOPS=1`), so `req.ip` is Safaricom's.
- **STK sweep job** (catches lost payment-prompt callbacks), every minute:

```bash
gcloud scheduler jobs create http hodi-stk-sweep --location "$REGION" \
  --schedule "* * * * *" --time-zone "Africa/Nairobi" \
  --uri "$API_URL/api/v1/internal/jobs/stk-sweep" --http-method POST \
  --oidc-service-account-email "$SCHED_SA" --oidc-token-audience "$API_URL" \
  --attempt-deadline 2m
```

Before go-live: confirm Safaricom's current callback IP list against `backend/src/modules/mpesa/callback-ips.ts`
(override with the `MPESA_CALLBACK_IPS` env var), and whether production C2B URL registration
should use Daraja's v2 endpoint.

## 11. Files: receipts and meter photos (phase 6)

A private bucket; files are uploaded and downloaded **through the API** only (no public or signed
URLs). The deploy workflow sets `STORAGE_BUCKET=<project>-hodi-files`.

```bash
gcloud storage buckets create "gs://$PROJECT_ID-hodi-files" --location "$REGION" \
  --uniform-bucket-level-access --public-access-prevention
gcloud storage buckets add-iam-policy-binding "gs://$PROJECT_ID-hodi-files" \
  --member "serviceAccount:hodi-api@$PROJECT_ID.iam.gserviceaccount.com" --role roles/storage.objectAdmin
```

Daily jobs (same scheduler service account as §9; `remittance-drafts` is phase 6b):

```bash
for job in recurring-expenses upload-cleanup remittance-drafts; do
  gcloud scheduler jobs create http "hodi-$job" --location "$REGION" \
    --schedule "15 1 * * *" --time-zone "Africa/Nairobi" \
    --uri "$API_URL/api/v1/internal/jobs/$job" --http-method POST \
    --oidc-service-account-email "$SCHED_SA" --oidc-token-audience "$API_URL" --attempt-deadline 10m
done
```

## 12. Tenant reminders (phase 7)

Organisations switch reminders on in their settings (off by default). The job sends at most one
SMS per tenant per day, so retries are harmless. It needs real SMS (`SMS_PROVIDER=africastalking`).

```bash
gcloud scheduler jobs create http hodi-reminders --location "$REGION" \
  --schedule "0 9 * * *" --time-zone "Africa/Nairobi" \
  --uri "$API_URL/api/v1/internal/jobs/reminders" --http-method POST \
  --oidc-service-account-email "$SCHED_SA" --oidc-token-audience "$API_URL" --attempt-deadline 10m
```

## 13. Hodi billing (phase 8)

On the 1st, Hodi bills every open organisation for the previous month. The run is idempotent, so it
is safe to retry. A daily job then recomputes each organisation's status (TRIAL / ACTIVE / GRACE /
SUSPENDED). Run the status job after the invoice run.

```bash
gcloud scheduler jobs create http hodi-platform-invoices --location "$REGION" \
  --schedule "0 2 1 * *" --time-zone "Africa/Nairobi" \
  --uri "$API_URL/api/v1/internal/jobs/platform-invoices" --http-method POST \
  --oidc-service-account-email "$SCHED_SA" --oidc-token-audience "$API_URL" --attempt-deadline 10m

gcloud scheduler jobs create http hodi-platform-status --location "$REGION" \
  --schedule "0 3 * * *" --time-zone "Africa/Nairobi" \
  --uri "$API_URL/api/v1/internal/jobs/platform-status" --http-method POST \
  --oidc-service-account-email "$SCHED_SA" --oidc-token-audience "$API_URL" --attempt-deadline 10m
```

Hodi's own paybill and Daraja keys are entered in the admin area (`/admin` → Settings), not as
environment variables. They are stored encrypted with the field keys. Register the C2B URLs shown
there with Safaricom for Hodi's paybill (the per-organisation channels are separate).
