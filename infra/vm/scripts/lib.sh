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
  if [ -f "$ROOT/edge/edge.env" ]; then
    # shellcheck disable=SC1091
    source "$ROOT/edge/edge.env"
  fi
  # Migrate legacy sslip.io hosts or empty hosts to the canonical kodihub.co.ke domains.
  if [ "$ENV" = prod ]; then
    [[ -z "${APP_HOST:-}" || "${APP_HOST:-}" == *.sslip.io ]] && APP_HOST="app.kodihub.co.ke"
    [[ -z "${API_HOST:-}" || "${API_HOST:-}" == *.sslip.io ]] && API_HOST="api.kodihub.co.ke"
    [[ -z "${LANDING_HOST:-}" || "${LANDING_HOST:-}" == *.sslip.io ]] && LANDING_HOST="kodihub.co.ke"
  else
    [[ -z "${APP_HOST:-}" || "${APP_HOST:-}" == *.sslip.io ]] && APP_HOST="dev.kodihub.co.ke"
    [[ -z "${API_HOST:-}" || "${API_HOST:-}" == *.sslip.io ]] && API_HOST="dapi.kodihub.co.ke"
    [[ -z "${LANDING_HOST:-}" || "${LANDING_HOST:-}" == *.sslip.io ]] && LANDING_HOST="landing.kodihub.co.ke"
  fi
  # Host booking sites: keep the owner's SITE_DOMAIN and Cloudflare token across deploys.
  if [ -z "${SITE_DOMAIN:-}" ]; then
    if [ "$ENV" = prod ]; then SITE_DOMAIN="kodihub.co.ke"; else SITE_DOMAIN="dev.kodihub.co.ke"; fi
  fi
  ( umask 077
    cat > "$ROOT/edge/edge.env" <<EDGE
APP_HOST=$APP_HOST
API_HOST=$API_HOST
LANDING_HOST=$LANDING_HOST
SITE_DOMAIN=$SITE_DOMAIN
APP_STACK=hodi-$ENV
EDGE
    if [ -n "${CF_API_TOKEN:-}" ]; then echo "CF_API_TOKEN=$CF_API_TOKEN" >> "$ROOT/edge/edge.env"; fi )
  chmod 600 "$ROOT/edge/edge.env"

  # Initialize APP_URL, PUBLIC_API_URL, and CORS_ORIGINS in api.env only if missing or still
  # pointing at a legacy sslip.io placeholder, so manual server edits are never overwritten.
  local api_env="$ROOT/envs/$ENV/api.env"
  if [ -f "$api_env" ]; then
    if ! grep -q '^APP_URL=' "$api_env" || grep -qE '^(APP_URL|PUBLIC_API_URL|CORS_ORIGINS)=.*\.sslip\.io' "$api_env"; then
      grep -vE '^(APP_URL|PUBLIC_API_URL|CORS_ORIGINS)=' "$api_env" > "$api_env.tmp" || true
      cat >> "$api_env.tmp" <<EOF
APP_URL=https://$APP_HOST
PUBLIC_API_URL=https://$API_HOST
CORS_ORIGINS=https://$APP_HOST,https://$LANDING_HOST
EOF
      chmod 600 "$api_env.tmp"
      mv "$api_env.tmp" "$api_env"
    fi
    # Host booking sites: the API builds guest links ({slug}.$SITE_DOMAIN) and link previews
    # (from the web container's index.html). Added only when missing; manual values win.
    grep -q '^SITE_DOMAIN=' "$api_env" || echo "SITE_DOMAIN=$SITE_DOMAIN" >> "$api_env"
    grep -q '^WEB_INDEX_URL=' "$api_env" \
      || echo "WEB_INDEX_URL=http://hodi-$ENV-web:8080/index.html" >> "$api_env"
  fi

  # Caddy reads its config from $ROOT/edge/conf, a folder deploys never rename. (Each deploy
  # renames infra -> infra.prev and later deletes it; a container mounting ./Caddyfile or ./sites
  # from there kept the old, then deleted, folder and silently lost the host-sites block.)
  local conf="$ROOT/edge/conf"
  mkdir -p "$conf/sites"
  find "$conf/sites" -mindepth 1 -maxdepth 1 -name '*.caddy' -delete
  if [ "$ENV" = prod ]; then cp "$ROOT"/infra/edge/sites-prod/*.caddy "$conf/sites/"; fi
  if [ -n "${CF_API_TOKEN:-}" ]; then
    cp "$ROOT/infra/edge/hosts.caddy" "$conf/sites/"
  else
    warn "CF_API_TOKEN is not set in $ROOT/edge/edge.env: host booking sites (*.$SITE_DOMAIN) stay off."
  fi
  cp "$ROOT/infra/edge/Caddyfile" "$conf/Caddyfile.tmp" && mv "$conf/Caddyfile.tmp" "$conf/Caddyfile"
  cp "$ROOT/infra/edge/maintenance.html" "$ROOT/maintenance/index.html"

  # edge.env is read when the container starts, so a changed value (e.g. a new Cloudflare
  # token) needs a recreate; otherwise a reload keeps connections open.
  local sum recreate=""
  sum=$( (sha256sum 2>/dev/null || shasum -a 256) < "$ROOT/edge/edge.env" | cut -d' ' -f1)
  [ "$(cat "$ROOT/edge/.env.sum" 2>/dev/null)" = "$sum" ] || recreate="--force-recreate"
  ( cd "$ROOT/infra/edge" && docker compose up -d --quiet-pull $recreate >/dev/null \
      && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile >/dev/null 2>&1 ) \
    || fail "Could not start or reload the edge proxy."
  echo "$sum" > "$ROOT/edge/.env.sum"
}
