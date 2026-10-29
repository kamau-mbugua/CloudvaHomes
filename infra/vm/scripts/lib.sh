# Shared by deploy.sh and rollback.sh (sourced, not run).
ROOT=/opt/hodi
log()  { echo -e "\033[0;32m[$(date +%H:%M:%S)]\033[0m $*"; }
warn() { echo -e "\033[0;33m[$(date +%H:%M:%S)] WARN\033[0m $*"; }
fail() { echo -e "\033[0;31m[$(date +%H:%M:%S)] ERROR\033[0m $*"; exit 1; }

# docker compose for this VM's environment; RELEASE and IMAGE_PREFIX must be exported.
stack() {
  docker compose -p "hodi-$ENV" --env-file "$ROOT/envs/$ENV/stack.env" \
    -f "$ROOT/infra/stack/compose.yml" "$@"
}

# One deploy or rollback at a time on this server.
take_lock() {
  exec 9>"$ROOT/deploy.lock"
  flock -n 9 || fail "Another deploy or rollback is running on this server."
}

# The site shows the maintenance page while the flag exists (payment callbacks still pass).
maintenance_on()  { touch "$ROOT/maintenance/on"; log "Maintenance page ON"; }
maintenance_off() { rm -f "$ROOT/maintenance/on"; log "Maintenance page OFF"; }

# Waits for the API container's health check; 0 = healthy.
wait_healthy() {
  local id status
  for _ in $(seq 1 40); do
    id=$(stack ps -q api 2>/dev/null || true)
    status=$([ -n "$id" ] && docker inspect -f '{{.State.Health.Status}}' "$id" 2>/dev/null || echo starting)
    [ "$status" = healthy ] && return 0
    sleep 3
  done
  return 1
}

# Points the edge proxy at the current infra bundle and reloads it (no dropped connections).
edge_up() {
  rm -rf "$ROOT/infra/edge/sites"; mkdir -p "$ROOT/infra/edge/sites"
  if [ "$ENV" = prod ]; then cp "$ROOT"/infra/edge/sites-prod/*.caddy "$ROOT/infra/edge/sites/"; fi
  cp "$ROOT/infra/edge/maintenance.html" "$ROOT/maintenance/index.html"
  ( cd "$ROOT/infra/edge" && docker compose up -d --quiet-pull >/dev/null \
      && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 ) \
    || fail "Could not start or reload the edge proxy."
}
