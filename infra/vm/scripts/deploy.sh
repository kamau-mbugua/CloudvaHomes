#!/usr/bin/env bash
# =============================================================================
# Hodi — deploy script (run ON the server, as `deploy`, by GitHub Actions)
#
#   bash /opt/hodi/infra.new/scripts/deploy.sh <dev|prod> <commit-sha> <image-prefix>
#
# The workflow has already uploaded this infra bundle to /opt/hodi/infra.new, the landing
# site (prod) to /opt/hodi/landing-releases/<sha>, and logged Docker in to the registry.
# Images were built in CI: nothing is built here, so a broken build never reaches a server.
# =============================================================================
set -euo pipefail
ENV="${1:?usage: deploy.sh dev|prod <sha> <image-prefix> [landing-only]}"
SHA="${2:?commit sha}"
export IMAGE_PREFIX="${3:?image prefix, e.g. ghcr.io/owner/repo}"
LANDING_ONLY="${4:-false}"
export RELEASE="$SHA"
# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
[[ "$ENV" =~ ^(dev|prod)$ ]] || fail "env must be dev or prod"

# ── 1. Check there's nothing blocking ─────────────────────────────────────────
take_lock
[ -f "$ROOT/envs/$ENV/stack.env" ] || fail "This server isn't set up for '$ENV' (run server-setup.sh)."
[ -d "$ROOT/infra.new" ] || fail "No uploaded bundle at $ROOT/infra.new."
PREVIOUS="$(cat "$ROOT/releases/current" 2>/dev/null || true)"
log "Deploying $ENV: ${PREVIOUS:-nothing} → $SHA (landing_only=$LANDING_ONLY)"

# ── 2. Install the new bundle (compose files, Caddyfile, scripts) ─────────────
# The old one is kept as infra.prev for rollback.sh.
rm -rf "$ROOT/infra.prev"
[ -d "$ROOT/infra" ] && mv "$ROOT/infra" "$ROOT/infra.prev"
mv "$ROOT/infra.new" "$ROOT/infra"

if [ "$LANDING_ONLY" = "true" ] && [ -n "$PREVIOUS" ]; then
  export RELEASE="$PREVIOUS"
  edge_up
  if [ -d "$ROOT/landing-releases/$SHA" ]; then
    cur="$(readlink "$ROOT/landing-releases/current" 2>/dev/null || true)"
    [ -n "$cur" ] && [ "$cur" != "$SHA" ] && echo "$cur" > "$ROOT/releases/landing-previous"
    ln -sfn "$SHA" "$ROOT/landing-releases/current.tmp"
    mv -T "$ROOT/landing-releases/current.tmp" "$ROOT/landing-releases/current"
    log "Landing site (fast-path) → $SHA"
    ls -dt "$ROOT"/landing-releases/*/ | grep -v '/current/$' | tail -n +4 | xargs -r rm -rf
  fi
  exit 0
fi

# ── 3. Pull the images before anything changes ───────────────────────────────
# A missing image fails here, while the old release is still serving.
log "Pulling images $IMAGE_PREFIX/hodi-*:$SHA ..."
stack --profile tools pull --quiet

# ── 4. Edge proxy (TLS, routing, maintenance page) ────────────────────────────
edge_up

# ── 5. Back up the database before anything changes ───────────────────────────
mkdir -p "$ROOT/backups/$ENV"
if [ -n "$(stack ps -q --status running db 2>/dev/null)" ]; then
  f="$ROOT/backups/$ENV/pre-deploy-$(date +%Y%m%d-%H%M%S)-${PREVIOUS:-none}.sql.gz"
  if stack exec -T db pg_dump -U hodi --no-owner hodi | gzip -9 > "$f.tmp"; then
    mv "$f.tmp" "$f"; chmod 600 "$f"; log "DB backup → $f"
  else
    rm -f "$f.tmp"; fail "Database backup failed — not deploying."
  fi
  # Keep only the last 7 pre-deploy backups (the nightly ones are separate).
  ls -t "$ROOT/backups/$ENV"/pre-deploy-*.sql.gz 2>/dev/null | tail -n +8 | xargs -r rm -f
else
  log "No database running yet (first deploy) — nothing to back up."
fi

# ── 6. Maintenance page, then migrate and swap ────────────────────────────────
# Only the migration and the container swap need the site paused; pulling images and the
# backup above can fail without an outage.
maintenance_on
trap maintenance_off EXIT
stack up -d db
log "Running migrations..."
stack run --rm migrate
log "Starting the new release..."
stack up -d --remove-orphans api web cron

# ── 7. Health check — roll the containers back if the new API won't start ─────
if ! wait_healthy; then
  warn "The new API didn't become healthy. Logs:"
  stack logs --tail 40 api || true
  if [ -n "$PREVIOUS" ]; then
    warn "Putting $PREVIOUS back (the database stays migrated; see rollback.sh --restore-db)."
    RELEASE="$PREVIOUS" stack up -d api web cron
    rm -rf "$ROOT/infra"; mv "$ROOT/infra.prev" "$ROOT/infra"
  fi
  fail "Deploy of $SHA failed."
fi
maintenance_off
trap - EXIT

# ── 8. Record the release ─────────────────────────────────────────────────────
[ -n "$PREVIOUS" ] && [ "$PREVIOUS" != "$SHA" ] && echo "$PREVIOUS" > "$ROOT/releases/previous"
echo "$SHA" > "$ROOT/releases/current"
echo "$(date -Iseconds) $SHA" >> "$ROOT/releases/history"

# ── 9. Publish the landing site (prod & dev) — atomic symlink swap ────────────
if [ -d "$ROOT/landing-releases/$SHA" ]; then
  cur="$(readlink "$ROOT/landing-releases/current" 2>/dev/null || true)"
  [ -n "$cur" ] && [ "$cur" != "$SHA" ] && echo "$cur" > "$ROOT/releases/landing-previous"
  ln -sfn "$SHA" "$ROOT/landing-releases/current.tmp"
  mv -T "$ROOT/landing-releases/current.tmp" "$ROOT/landing-releases/current"
  log "Landing site → $SHA"
  # Keep the last 3 releases so a rollback has something to point at.
  ls -dt "$ROOT"/landing-releases/*/ | grep -v '/current/$' | tail -n +4 | xargs -r rm -rf
fi

# ── 10. Keep only the images of this release and the previous one ─────────────
keep_prev="$(cat "$ROOT/releases/previous" 2>/dev/null || echo none)"
docker images --format '{{.Repository}}:{{.Tag}}' "$IMAGE_PREFIX/hodi-*" \
  | grep -vE ":($SHA|$keep_prev)\$" | xargs -r docker rmi >/dev/null 2>&1 || true
docker image prune -f >/dev/null

log "Deployed $ENV at $SHA"
stack ps --format 'table {{.Service}}\t{{.Status}}'
