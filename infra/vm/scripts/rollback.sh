#!/usr/bin/env bash
# =============================================================================
# Hodi — rollback script (run ON the server)
# Puts the previous release back. With --restore-db, also restores the database from the
# backup taken just before the release being undone (data written since then is LOST).
#
#   bash /opt/hodi/infra/scripts/rollback.sh <dev|prod> [--restore-db] [--yes]
# =============================================================================
set -euo pipefail
ENV="${1:?usage: rollback.sh dev|prod [--restore-db] [--yes]}"; shift
RESTORE_DB=0; YES=0
for a in "$@"; do case "$a" in --restore-db) RESTORE_DB=1 ;; --yes) YES=1 ;; *) echo "unknown option $a"; exit 1 ;; esac; done
# shellcheck source=lib.sh
source "$(dirname "$0")/lib.sh"
take_lock

CURRENT="$(cat "$ROOT/releases/current" 2>/dev/null || true)"
PREVIOUS="$(cat "$ROOT/releases/previous" 2>/dev/null || true)"
[ -n "$PREVIOUS" ] || fail "No previous release recorded — nothing to roll back to."
IMAGE_PREFIX="$(docker inspect -f '{{.Config.Image}}' "$(docker compose -p "hodi-$ENV" ps -q api)" 2>/dev/null | sed 's#/hodi-api:.*##')"
[ -n "$IMAGE_PREFIX" ] || fail "Can't tell which registry the running release came from."
export IMAGE_PREFIX

# ── Confirm ───────────────────────────────────────────────────────────────────
BACKUP=""
if [ "$RESTORE_DB" = 1 ]; then
  BACKUP="$(ls -t "$ROOT/backups/$ENV"/pre-deploy-*.sql.gz 2>/dev/null | head -1 || true)"
  [ -n "$BACKUP" ] || fail "No pre-deploy backup found in $ROOT/backups/$ENV."
fi
echo "Roll back $ENV: $CURRENT → $PREVIOUS"
[ -n "$BACKUP" ] && echo "AND restore the database from $BACKUP (everything written since is lost)"
if [ "$YES" != 1 ]; then
  read -r -p "Type $ENV to continue: " answer
  [ "$answer" = "$ENV" ] || fail "Cancelled."
fi

# The compose files that went with the previous release.
if [ -d "$ROOT/infra.prev" ]; then
  rm -rf "$ROOT/infra.rollback"; mv "$ROOT/infra" "$ROOT/infra.rollback"; mv "$ROOT/infra.prev" "$ROOT/infra"
  mv "$ROOT/infra.rollback" "$ROOT/infra.prev"
fi
export RELEASE="$PREVIOUS"
maintenance_on
trap maintenance_off EXIT

if [ -n "$BACKUP" ]; then
  log "Restoring $BACKUP ..."
  stack stop api cron
  stack exec -T db psql -q -U hodi -d postgres -c "DROP DATABASE hodi WITH (FORCE)" -c "CREATE DATABASE hodi OWNER hodi"
  gunzip -c "$BACKUP" | stack exec -T db psql -q -v ON_ERROR_STOP=1 -U hodi hodi
fi

stack up -d --remove-orphans api web cron
wait_healthy || fail "The previous release didn't become healthy either — check: docker compose -p hodi-$ENV logs api"
edge_up

if [ "$ENV" = prod ] && [ -f "$ROOT/releases/landing-previous" ]; then
  lp="$(cat "$ROOT/releases/landing-previous")"
  if [ -d "$ROOT/landing-releases/$lp" ]; then
    ln -sfn "$lp" "$ROOT/landing-releases/current.tmp" && mv -T "$ROOT/landing-releases/current.tmp" "$ROOT/landing-releases/current"
  fi
fi

echo "$CURRENT" > "$ROOT/releases/previous"
echo "$PREVIOUS" > "$ROOT/releases/current"
echo "$(date -Iseconds) $PREVIOUS (rollback from $CURRENT)" >> "$ROOT/releases/history"
log "Rolled back $ENV to $PREVIOUS"
