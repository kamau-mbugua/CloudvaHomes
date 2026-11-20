# Hodi servers (production, dev, landing)

Hodi runs on two Compute Engine VMs with Docker, one per environment, deployed by GitHub
Actions on push, the same way as UltimatePOS. There is no Cloud Run: the app will use
WebSockets, and Caddy in front of a long-running server passes them through as-is.

| | VM | IP | Landing Page | Web App | API |
|---|---|---|---|---|---|
| Production | `hodi-server` (e2-medium) | 34.35.173.255 | https://kodihq.co.ke | https://app.kodihq.co.ke | https://api.kodihq.co.ke |
| Development | `hodi-dev-server` (e2-small) | 34.35.37.207 | https://landing.kodihq.co.ke | https://dev.kodihq.co.ke | https://dapi.kodihq.co.ke |

The same names on `kodihub.co.ke`, the address until November 2026, still answer and forward
(see "The move from kodihub.co.ke to kodihq.co.ke" below).

Both are in project `cloudvalabs-mdm`, zone `africa-south1-a`, on the isolated network
`hodi-net` (`infra/gcp/README.md` §15). Landing page content is controlled dynamically by each
environment's superadmin via `/admin/settings?tab=landing` (`GET /api/v1/public/landing`).

## How a deploy works

A push to `main` or `dev` runs CI (`.github/workflows/ci.yml`). Its last job calls
`.github/workflows/deploy.yml`, but only if the backend, web and landing checks passed (a check
with nothing to check is skipped and doesn't block). Pushes that only touch mobile or docs don't
deploy. If only `landing/` changed across all the pushed commits, only the landing site is
published. CI runs on pushes are never cancelled by a newer push; it waits its turn. To deploy
without CI (an emergency), run **Deploy** by hand from the Actions tab.

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
   - the landing site (`landing/`).
2. **Upload:** `infra/vm/` to `/opt/hodi/infra.new`, and `landing/` to
   `/opt/hodi/landing-releases/<sha>`.
3. **On the server**, `scripts/deploy.sh <env> <sha> <registry>` as user `deploy`:
   1. Takes the lock (one deploy at a time).
   2. Installs the new bundle and keeps the old one as `infra.prev`.
   3. **Pulls the images.** A missing image fails here, while the old release is still serving.
   4. Starts or reloads the Caddy edge proxy. A server still on the old domain is moved here,
      once its new names answer (see the move section below).
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

A rollback also puts the server's hosts back on the domain the restored release ran on, and
says so before it asks you to confirm.

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

A new environment has an empty database. The password is typed and passed on stdin, so it
never appears on a command line (`ps`) or in shell history:

```bash
read -rs -p 'Admin password: ' P; echo
printf '%s\n' "$P" | sudo docker exec -i hodi-prod-api-1 sh -c \
  'IFS= read -r HODI_ADMIN_PASSWORD; export HODI_ADMIN_PASSWORD; exec node dist/scripts/create-platform-admin.js "$@"' _ \
  --email you@yourdomain --phone 07XXXXXXXX --first Jane --last Doe
unset P
```

Running it again for an existing email or phone promotes that user and resets the password.

(On the dev server the container is `hodi-dev-api-1`.)

## On each server

| Path | What |
|---|---|
| `/opt/hodi/envs/<env>/` | `stack.env` (DB password, jobs secret), `api.env` (app secrets). Mode 600, generated once by `server-setup.sh`; they never leave the server |
| `/opt/hodi/infra/` (`infra.prev`) | the deployed `infra/vm` bundle (and the previous one) |
| `/opt/hodi/releases/` | `current`, `previous`, `history`, and `domains` (the domain each release ran on) |
| `/opt/hodi/backups/<env>/` | `pre-deploy-*.sql.gz` (last 7) and, on production, nightly `hodi-*.sql.gz` (14 days) |
| `/opt/hodi/edge/conf/` | the Caddyfile and `sites/*.caddy` the edge actually loads; refreshed by every deploy (`edge_up`) — never edit by hand |
| `/opt/hodi/edge/edge.env` | this server's hosts (`APP_HOST`, `API_HOST`, `APP_STACK`, `LANDING_HOST`, `SITE_DOMAIN`, `CF_API_TOKEN`) and, after a domain move, the old names that still answer (`LEGACY_*`) |

## The move from kodihub.co.ke to kodihq.co.ke

The product's address changed in November 2026. Both domains point at the same servers, and
`scripts/lib.sh` makes the switch during a normal deploy, one server at a time (dev when `dev`
is pushed, production when `main` is):

1. It asks Google's and Cloudflare's public DNS for every new name. A new domain, or a change
   of nameservers, can take a day to reach everyone, and until then some visitors would be
   forwarded to a name their resolver cannot find.
2. It adds the new names to the running proxy next to the current ones, so Caddy fetches their
   certificates, and waits up to three minutes for every new name to answer over HTTPS.
3. Only then does it switch: `edge.env` and `api.env` get the new names, and the old ones stay
   in `edge.env` as `LEGACY_*`.
4. If a check fails (public DNS not there yet, a DNS record that points elsewhere, a Cloudflare
   token without the new zone, a config Caddy refuses), nothing moves. The deploy carries on
   with the current hosts, says why in its log, and the next deploy tries again. A
   landing-only deploy never moves anything.

After the switch the old names keep answering. Their config is
`/opt/hodi/edge/conf/sites/legacy.caddy`, written on every deploy:

| Old name | What it does now |
|---|---|
| `api.kodihub.co.ke`, `dapi.kodihub.co.ke` | The API, served in full. Installed mobile apps call it, and M-Pesa paybill (C2B) URLs and bank webhooks registered before the move point at it. |
| `app.kodihub.co.ke`, `dev.kodihub.co.ke` | Pages redirect to the new name. `/api/*` still works for a tab that was already open, and `/sw.js` removes the installed web app's service worker, which would otherwise keep showing its cached copy and never see the redirect. |
| `kodihub.co.ke`, `www.kodihub.co.ke`, `landing.kodihub.co.ke` | Redirect to the new landing page. |
| `{slug}.kodihub.co.ke`, `go.kodihub.co.ke` (and `.dev.`) | Redirect to the same name on the new domain, so booking links and SMS short links already sent keep working. |

Things to know:

- **Keep `kodihub.co.ke` registered and in Cloudflare.** The old API name has to stay up for as
  long as an installed app or a paybill registered on it is in use.
- **The Cloudflare token needs both zones** while booking sites are on: Zone → Zone → Read and
  Zone → DNS → Edit on `kodihub.co.ke` and on `kodihq.co.ke`. Without the new zone the move
  waits, and the deploy log says so.
- **People sign in again** on the new address. A session belongs to the address it started on.
- **Redirects are temporary (302) for now.** Browsers remember a permanent redirect, which
  would trap visitors if the move had to be undone. Once it is final, set
  `LEGACY_REDIRECT="permanent"` in `scripts/lib.sh` and deploy.
- **A rollback puts the hosts back** where the release being restored ran
  (`/opt/hodi/releases/domains` keeps track). A release from before the move does not know
  booking sites on the new domain, so the server returns to `kodihub.co.ke` and the new names
  forward there. Deploying again moves it forward again.
- **To hold a server on one domain by hand**, export `BASE_DOMAIN=kodihub.co.ke` (or
  `kodihq.co.ke`) before running `deploy.sh` or `rollback.sh`.
- **To retire the old names** one day, remove the `LEGACY_*` lines from
  `/opt/hodi/edge/edge.env` and deploy. `edge.env.before-move` and `api.env.before-move`, next
  to the originals, hold what the server had before its last move.
- A value in `api.env` that was set by hand to some other domain is never changed.
- **The name changed as well, from KodiHub to KodiHQ.** A deploy renames what the server holds
  under the old name: the sender name in `api.env` (`EMAIL_FROM=KodiHub <...>` becomes
  `KodiHQ <...>`; the address stays, and so does a name set by hand), and, in two migrations,
  the wording saved in platform settings and the automatic note on opening deposits. The app
  id (`co.ke.kodihub`), the `kodihub-edge` image and the SMS sender ID registered with the
  provider keep their names.

## Wildcard HTTPS for host booking sites (`*.kodihq.co.ke` / `*.dev.kodihq.co.ke`)

Host short-stay booking sites are served on wildcard subdomains (`{slug}.kodihq.co.ke` on
production, `{slug}.dev.kodihq.co.ke` on dev) using a custom Caddy build with the Cloudflare
DNS-01 ACME provider (`infra/vm/edge/Dockerfile`).

Deploy order (owner step):
1. In Cloudflare, create an API token with **Zone → Zone → Read** and **Zone → DNS → Edit**
   permission scoped to the zones `kodihq.co.ke` and `kodihub.co.ke` (the old booking addresses
   still need their certificate), and add wildcard DNS A records `*.kodihq.co.ke` (prod IP)
   and `*.dev.kodihq.co.ke` (dev IP).
2. In GitHub → Settings → Secrets and variables → Actions, add the repository secret
   `CF_API_TOKEN` (used by prod, and by dev unless `DEV_CF_API_TOKEN` is also set). Each deploy
   sends it to `/opt/hodi/edge/edge.env` over SSH stdin (`scripts/set-edge-env.sh`); no server
   login needed. (Adding `CF_API_TOKEN=<token>` to that file by hand also works; deploys keep
   it, along with `SITE_DOMAIN`, and keep the file at mode 600.) Nothing else to set: deploys add `SITE_DOMAIN` and
   `WEB_INDEX_URL=http://hodi-<env>-web:8080/index.html` to `/opt/hodi/envs/<env>/api.env` when
   missing, and the web app recognises host addresses at runtime (no build setting).
3. Deploy (or rebuild the edge: `docker compose -f /opt/hodi/infra/edge/compose.yml up -d --build`
   after copying `infra/edge/hosts.caddy` into `infra/edge/sites/`). The wildcard block lives in
   `edge/hosts.caddy` and is switched on only when `CF_API_TOKEN` is set: without a token the
   deploy warns and leaves host sites off, so the app and API keep working.
4. Verify wildcard TLS and OpenGraph routing:
   `curl -I https://test.dev.kodihq.co.ke` returns HTTP 200 over HTTPS.

## Setting up a server (once)

`server-setup.sh` installs Docker and swap, creates the key-only `deploy` user, lays out
`/opt/hodi`, writes `edge.env`, and generates that environment's secrets:

```bash
sudo bash server-setup.sh prod app.kodihq.co.ke api.kodihq.co.ke kodihq.co.ke         < deploy-key.pub
sudo bash server-setup.sh dev  dev.kodihq.co.ke dapi.kodihq.co.ke landing.kodihq.co.ke < deploy-key.pub
```

Run again without the hosts, it keeps the ones the server has (and the Cloudflare token and
`LEGACY_*` lines in `edge.env`). Giving hosts rewrites `edge.env` with just those.

To move to a domain of your own (the move between `kodihub.co.ke` and `kodihq.co.ke` needs
none of this, deploys handle it):
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
- **Push notifications (phase 13).** The mobile app is `co.ke.kodihub` (`co.ke.kodihub.dev` for
  the dev flavour). To turn push on:
  1. Create a Firebase project and add the Android apps `co.ke.kodihub` and `co.ke.kodihub.dev`
     and the iOS app `co.ke.kodihub`; run `flutterfire configure` in `mobile/` (adds
     `google-services.json` / `GoogleService-Info.plist`).
  2. iOS: upload an APNs key in Firebase, and add the *Push Notifications* capability to the
     Runner target in Xcode (needs the Apple team's provisioning).
  3. On each server, in `/opt/hodi/envs/api.env`: `FCM_PROVIDER=fcm`, `FCM_PROJECT_ID=<project>`,
     `FCM_SERVICE_ACCOUNT_JSON=<service-account JSON, one line>`; then redeploy.
  Without these the app runs normally with no push (it checks at start-up).
- **Protect the branches.** A push to `dev` or `main` deploys as soon as CI passes. Add a
  required reviewer to the `production` environment, and/or require pull requests on `main`.
