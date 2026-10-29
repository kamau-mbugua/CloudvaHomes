# Hodi servers (production, dev, landing)

Hodi runs on two Compute Engine VMs with Docker, one per environment, deployed by GitHub
Actions on push, the same way as UltimatePOS. There is no Cloud Run: the app will use
WebSockets, and Caddy in front of a long-running server passes them through as-is.

| | VM | IP | Serves |
|---|---|---|---|
| Production | `hodi-server` (e2-medium) | 34.35.173.255 | https://app.34-35-173-255.sslip.io and the landing page https://34-35-173-255.sslip.io |
| Development | `hodi-dev-server` (e2-small) | 34.35.37.207 | https://dev.34-35-37-207.sslip.io |

Both are in project `cloudvalabs-mdm`, zone `africa-south1-a`, on the isolated network
`hodi-net` (`infra/gcp/README.md` §15). The `sslip.io` names are used until real domains
exist: they resolve to the IP inside them and get real Let's Encrypt certificates.

## How a deploy works

`.github/workflows/deploy.yml`, on push:

| Branch | Server | Secrets used |
|---|---|---|
| `main` | production | `GCP_VM_HOST`, `GCP_VM_USER`, `GCP_SSH_PRIVATE_KEY`, `GCP_VM_KNOWN_HOSTS` |
| `dev` | dev | `DEV_VM_HOST`, `DEV_VM_USER`, `DEV_SSH_PRIVATE_KEY`, `DEV_VM_KNOWN_HOSTS` |

The secret names differ per target on purpose: a missing dev secret can never fall back to
production's, and the run stops before building. Each server has its own key, and host keys
are pinned (no trust-on-first-use).

1. **Build on the runner:**
   - the images `hodi-api`, `hodi-migrate`, `hodi-web` and `hodi-cron`, tagged with the commit
     SHA and pushed to `ghcr.io/kamau-mbugua/cloudvahomes`;
   - for production, also the landing site (`landing/` once phase 11 exists, otherwise
     `infra/vm/landing`).
2. **Upload:** `infra/vm/` to `/opt/hodi/infra.new`, and the landing site to
   `/opt/hodi/landing-releases/<sha>`.
3. **On the server**, `scripts/deploy.sh <env> <sha> <registry>` as user `deploy`:
   1. Takes the lock (one deploy at a time).
   2. Installs the new bundle and keeps the old one as `infra.prev`.
   3. **Pulls the images.** A missing image fails here, while the old release is still serving.
   4. Starts or reloads the Caddy edge proxy.
   5. **Backs up the database** (`backups/<env>/pre-deploy-*.sql.gz`, last 7 kept). A failed
      backup stops the deploy.
   6. **Turns the maintenance page on**, runs the migrations, and starts the new containers.
      Payment callbacks (`/api/v1/hooks/*`) bypass the maintenance page.
   7. **Waits for the API's health check.** If it fails, the previous release's containers go
      back and the run fails.
   8. Turns maintenance off and records `releases/current` and `previous`.
   9. Swaps the landing site with an atomic symlink (production; last 3 releases kept).
   10. Removes images other than this release's and the previous one's.

The server pulls with the run's short-lived `GITHUB_TOKEN` and logs out afterwards.

## Rollback

On the server:

```bash
bash /opt/hodi/infra/scripts/rollback.sh prod               # previous release's containers
bash /opt/hodi/infra/scripts/rollback.sh prod --restore-db  # …and the DB from before the bad deploy
```

`--restore-db` restores the backup taken just before the release being undone. Anything
written since is lost, and the script asks you to confirm.

## Getting onto a server

```bash
gcloud compute ssh hodi-server     --project cloudvalabs-mdm --zone africa-south1-a --tunnel-through-iap
gcloud compute ssh hodi-dev-server --project cloudvalabs-mdm --zone africa-south1-a --tunnel-through-iap
sudo -iu deploy
c="docker compose -p hodi-prod --env-file /opt/hodi/envs/prod/stack.env -f /opt/hodi/infra/stack/compose.yml"
export IMAGE_PREFIX=ghcr.io/kamau-mbugua/cloudvahomes RELEASE=$(cat /opt/hodi/releases/current)
$c ps; $c logs -f api; $c exec db psql -U hodi hodi
```

## First admin (once per environment)

A new environment has an empty database. The password is typed, never put on a command line:

```bash
read -rs -p 'Admin password: ' P; echo
sudo docker exec -e HODI_ADMIN_PASSWORD="$P" hodi-prod-api-1 \
  node dist/scripts/create-platform-admin.js --email you@yourdomain --phone 07XXXXXXXX --first Jane --last Doe
unset P
```

(On the dev server the container is `hodi-dev-api-1`.)

## On each server

| Path | What |
|---|---|
| `/opt/hodi/envs/<env>/` | `stack.env` (DB password, jobs secret), `api.env` (app secrets). Mode 600, generated once by `server-setup.sh`; they never leave the server |
| `/opt/hodi/infra/` (`infra.prev`) | the deployed `infra/vm` bundle (and the previous one) |
| `/opt/hodi/releases/` | `current`, `previous`, `history` |
| `/opt/hodi/backups/<env>/` | `pre-deploy-*.sql.gz` (last 7) and, on production, nightly `hodi-*.sql.gz` (14 days) |
| `/opt/hodi/edge/edge.env` | this server's hosts (`APP_HOST`, `APP_STACK`, `LANDING_HOST`) |

## Setting up a server (once)

`server-setup.sh` installs Docker and swap, creates the key-only `deploy` user, lays out
`/opt/hodi`, writes `edge.env`, and generates that environment's secrets:

```bash
sudo bash server-setup.sh prod app.example.com example.com < deploy-key.pub
sudo bash server-setup.sh dev  dev.example.com             < deploy-key.pub
```

To move to real domains:
1. Point A records at the IPs.
2. Re-run `server-setup.sh` with the new hosts. It keeps existing secrets.
3. Edit `APP_URL` and `PUBLIC_API_URL` in `/opt/hodi/envs/<env>/api.env`.
4. Push to redeploy.

## Backups

- **Before every deploy:** a database dump, last 7 kept.
- **Nightly:** a production database dump at 02:45 (cron container), kept 14 days.
- **Disk snapshots:** production's disk, daily at 02:00 Nairobi, kept 14 days in
  africa-south1. They live outside the VM.
- **Secrets:** keep an offline copy of `/opt/hodi/envs/prod`. Without
  `FIELD_ENCRYPTION_KEYS`, encrypted fields can't be read.

## Not set up yet

- **SMS and e-mail are in log mode.** Codes and invitations appear in the API logs.
- **Protect the branches.** A push to `dev` or `main` deploys straight away, as in
  UltimatePOS. Add a required reviewer to the `production` environment, and/or require pull
  requests on `main`.
