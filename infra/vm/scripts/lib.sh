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

# The API runs as `node`; the uploaded-files volume must be writable by it. Volumes created
# before the image made /var/lib/hodi/files node's (or by Docker as root) are fixed here, once,
# cheaply: only entries not already owned by node are touched. A failure only warns.
files_owner_ok() {
  stack run --rm --no-deps --user root --entrypoint sh api -c \
    'chown node:node /var/lib/hodi/files && find /var/lib/hodi/files ! -user node -exec chown node:node {} +' \
    >/dev/null 2>&1 \
    && log "Uploaded files folder is writable by the API" \
    || warn "Could not fix the owner of /var/lib/hodi/files: uploads may fail (EACCES)."
}

# ── Which domain this server answers on ──────────────────────────────────────
# The product moved from kodihub.co.ke to kodihq.co.ke (November 2026). A deploy moves this
# server's hosts to BASE_DOMAIN once the new names are proven to answer (hosts_ready), and the
# old names keep answering after that (legacy_caddy): links already sent, installed mobile apps
# and payment callbacks registered on them keep working. Hosts set by hand to any other domain
# are never touched. A rollback puts the hosts back on the domain its release ran on
# (release_domain). To choose by hand, export BASE_DOMAIN before deploy.sh or rollback.sh.
KNOWN_DOMAINS="kodihq.co.ke kodihub.co.ke"
DEFAULT_BASE_DOMAIN="kodihq.co.ke"
# Releases deployed before releases/domains existed all ran on this one.
FIRST_BASE_DOMAIN="kodihub.co.ke"
# How an old name forwards to the new one: temporary or permanent. Temporary on purpose:
# browsers remember a permanent redirect, which would trap visitors if the move is ever undone.
# Make it permanent once the move is final, so search engines carry the old address over.
LEGACY_REDIRECT="temporary"

# Prints the known domain a host is on; nothing for sslip.io, an IP or a custom domain.
known_domain() {
  local d
  for d in $KNOWN_DOMAINS; do
    if [[ "$1" == "$d" || "$1" == *".$d" ]]; then echo "$d"; fi
  done
  return 0
}

# The domain to move to, or nothing when the hosts stay where they are: KEEP_HOSTS=1 (a
# landing-only deploy doesn't restart the API, so it must not move the names the API builds its
# links from), or a BASE_DOMAIN that isn't one of ours (a custom domain is recorded as "-").
target_domain() {
  local base="${BASE_DOMAIN:-$DEFAULT_BASE_DOMAIN}"
  if [ "${KEEP_HOSTS:-0}" = 1 ]; then return 0; fi
  case " $KNOWN_DOMAINS " in *" $base "*) echo "$base" ;; esac
  return 0
}

# The domain a release ran on, so that going back to it puts its hosts back too: a release
# from before the move doesn't know booking sites on the new name.
release_domain() {
  local d=""
  if [ -f "$ROOT/releases/domains" ]; then
    d="$(awk -v s="$1" '$1 == s { d = $2 } END { print d }' "$ROOT/releases/domains")"
  fi
  echo "${d:-$FIRST_BASE_DOMAIN}"
}

# Notes the domain the release just deployed runs on ("-" for a custom one). Last 100 kept.
record_release_domain() {
  local d
  d="$(known_domain "${APP_HOST:-}")"
  echo "$1 ${d:--}" >> "$ROOT/releases/domains"
  tail -n 100 "$ROOT/releases/domains" > "$ROOT/releases/domains.tmp"
  mv "$ROOT/releases/domains.tmp" "$ROOT/releases/domains"
}

# True when the Cloudflare token on this server can see a zone: without that, Caddy cannot get
# the wildcard certificate for booking sites on it. The token reaches curl on stdin, never on a
# command line.
cf_token_sees_zone() {
  local out
  command -v curl >/dev/null 2>&1 || return 1
  out="$(printf 'header = "Authorization: Bearer %s"\n' "$CF_API_TOKEN" \
    | curl -fsS -m 15 -K - "https://api.cloudflare.com/client/v4/zones?name=$1" 2>/dev/null)" || return 1
  grep -Eq "\"name\"[[:space:]]*:[[:space:]]*\"$1\"" <<< "$out"
}

# Replaces KEY in an env file (or adds it); the file stays private.
set_env() {
  local file="$1" key="$2" value="$3" tmp
  tmp="$(mktemp "$file.XXXXXX")"
  grep -v "^$key=" "$file" > "$tmp" || true
  printf '%s=%s\n' "$key" "$value" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$file"
}
# Prints KEY's value from an env file, without surrounding quotes.
get_env() {
  sed -n "s/^$2=//p" "$1" 2>/dev/null | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

# Browser origins the API accepts: the app and landing hosts, their old names while those still
# answer, then anything added by hand (moved along when it sits on the domain being left).
cors_origins() {
  local base o d out parts=()
  base="$(known_domain "$APP_HOST")"
  out="https://$APP_HOST,https://$LANDING_HOST"
  if [ -n "${LEGACY_APP_HOST:-}" ]; then out="$out,https://$LEGACY_APP_HOST"; fi
  if [ -n "${LEGACY_LANDING_HOST:-}" ]; then out="$out,https://$LEGACY_LANDING_HOST"; fi
  IFS=',' read -ra parts <<< "$1"
  for o in "${parts[@]:-}"; do
    o="${o// /}"
    d="$(known_domain "${o#*://}")"
    if [ -n "$d" ] && [ "$d" != "$base" ]; then o="${o%"$d"}$base"; fi
    if [ -n "$o" ]; then
      case ",$out," in *",$o,"*) ;; *) out="$out,$o" ;; esac
    fi
  done
  echo "$out"
}

# Reads this server's hosts from edge.env. A first deploy, or one still on its sslip.io
# placeholders, gets the canonical ones.
hosts_load() {
  local d="$DEFAULT_BASE_DOMAIN"
  case " $KNOWN_DOMAINS " in *" ${BASE_DOMAIN:-} "*) d="$BASE_DOMAIN" ;; esac
  # Only edge.env says which old names still answer: nothing is carried over from an earlier
  # call in this shell.
  LEGACY_APP_HOST="" LEGACY_API_HOST="" LEGACY_LANDING_HOST="" LEGACY_SITE_DOMAIN=""
  HOSTS_MOVED=0
  if [ -f "$ROOT/edge/edge.env" ]; then
    # shellcheck disable=SC1091
    source "$ROOT/edge/edge.env"
  fi
  if [ "$ENV" = prod ]; then
    [[ -z "${APP_HOST:-}" || "${APP_HOST:-}" == *.sslip.io ]] && APP_HOST="app.$d"
    [[ -z "${API_HOST:-}" || "${API_HOST:-}" == *.sslip.io ]] && API_HOST="api.$d"
    [[ -z "${LANDING_HOST:-}" || "${LANDING_HOST:-}" == *.sslip.io ]] && LANDING_HOST="$d"
  else
    [[ -z "${APP_HOST:-}" || "${APP_HOST:-}" == *.sslip.io ]] && APP_HOST="dev.$d"
    [[ -z "${API_HOST:-}" || "${API_HOST:-}" == *.sslip.io ]] && API_HOST="dapi.$d"
    [[ -z "${LANDING_HOST:-}" || "${LANDING_HOST:-}" == *.sslip.io ]] && LANDING_HOST="landing.$d"
  fi
  # Host booking sites: keep the owner's SITE_DOMAIN and Cloudflare token across deploys.
  if [ -z "${SITE_DOMAIN:-}" ]; then
    if [ "$ENV" = prod ]; then SITE_DOMAIN="$d"; else SITE_DOMAIN="dev.$d"; fi
  fi
  return 0
}

# Works out where each host sits on domain $1, into NEW_*. MOVE=1 when any of them changes.
hosts_plan() {
  local base="$1" v host from
  MOVE=0
  for v in APP_HOST API_HOST LANDING_HOST SITE_DOMAIN; do
    host="${!v}"
    from="$(known_domain "$host")"
    if [ -n "$from" ] && [ "$from" != "$base" ]; then
      printf -v "NEW_$v" '%s' "${host%"$from"}$base"
      MOVE=1
    else
      printf -v "NEW_$v" '%s' "$host"
    fi
  done
}

# Makes the plan current. Each name being left becomes an old name that keeps answering.
hosts_apply() {
  local v t
  for v in APP_HOST API_HOST LANDING_HOST SITE_DOMAIN; do
    t="NEW_$v"
    if [ "${!t}" != "${!v}" ]; then
      log "$v: ${!v} → ${!t} (${!v} keeps answering)"
      printf -v "LEGACY_$v" '%s' "${!v}"
      printf -v "$v" '%s' "${!t}"
    fi
  done
  HOSTS_MOVED=1
}

# Writes the hosts to edge.env (what Caddy reads) and brings api.env in step with them.
hosts_save() {
  local v l cur want api_env="$ROOT/envs/$ENV/api.env"
  # An old name that is also a current one would be a duplicate site for Caddy.
  for v in APP_HOST API_HOST LANDING_HOST SITE_DOMAIN; do
    l="LEGACY_$v"
    if [ "${!l:-}" = "${!v}" ]; then printf -v "$l" '%s' ""; fi
  done
  if [ "${HOSTS_MOVED:-0}" = 1 ]; then
    # What the server had before the move, should it ever need putting back by hand.
    cp -p "$ROOT/edge/edge.env" "$ROOT/edge/edge.env.before-move" 2>/dev/null || true
    cp -p "$api_env" "$api_env.before-move" 2>/dev/null || true
  fi
  ( umask 077
    {
      echo "APP_HOST=$APP_HOST"
      echo "API_HOST=$API_HOST"
      echo "LANDING_HOST=$LANDING_HOST"
      echo "SITE_DOMAIN=$SITE_DOMAIN"
      echo "APP_STACK=hodi-$ENV"
      for l in LEGACY_APP_HOST LEGACY_API_HOST LEGACY_LANDING_HOST LEGACY_SITE_DOMAIN; do
        if [ -n "${!l:-}" ]; then echo "$l=${!l}"; fi
      done
      if [ -n "${CF_API_TOKEN:-}" ]; then echo "CF_API_TOKEN=$CF_API_TOKEN"; fi
    } > "$ROOT/edge/edge.env.tmp"
    mv "$ROOT/edge/edge.env.tmp" "$ROOT/edge/edge.env" )
  chmod 600 "$ROOT/edge/edge.env"

  # Initialize APP_URL, PUBLIC_API_URL, and CORS_ORIGINS in api.env only if missing or still
  # pointing at a legacy sslip.io placeholder, so manual server edits are never overwritten.
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

    # Values on one of our own domains follow the hosts above: links in e-mails and SMS,
    # payment callback URLs, guest links. A value on any other domain was set by hand: kept.
    cur="$(get_env "$api_env" APP_URL)"; cur="${cur%/}"; want="https://$APP_HOST"
    if [ "$cur" != "$want" ] && [ -n "$(known_domain "${cur#*://}")" ]; then set_env "$api_env" APP_URL "$want"; fi
    cur="$(get_env "$api_env" PUBLIC_API_URL)"; cur="${cur%/}"; want="https://$API_HOST"
    if [ "$cur" != "$want" ] && [ -n "$(known_domain "${cur#*://}")" ]; then set_env "$api_env" PUBLIC_API_URL "$want"; fi
    cur="$(get_env "$api_env" SITE_DOMAIN)"
    if [ "$cur" != "$SITE_DOMAIN" ] && [ -n "$(known_domain "$cur")" ]; then set_env "$api_env" SITE_DOMAIN "$SITE_DOMAIN"; fi
    if [ -n "$(known_domain "$APP_HOST")" ]; then
      cur="$(get_env "$api_env" CORS_ORIGINS)"; want="$(cors_origins "$cur")"
      if [ -n "$cur" ] && [ "$cur" != "$want" ]; then set_env "$api_env" CORS_ORIGINS "$want"; fi
    fi

    # The product is KodiHQ since November 2026: the sender name people see on e-mails follows.
    # Only the name server-setup.sh wrote is changed. The address stays, and so does a name set
    # by hand. The API reads the file when it next starts.
    if grep -qE "^EMAIL_FROM=[\"']?KodiHub <" "$api_env"; then
      sed -E "s/^(EMAIL_FROM=[\"']?)KodiHub </\\1KodiHQ </" "$api_env" > "$api_env.tmp"
      chmod 600 "$api_env.tmp"
      mv "$api_env.tmp" "$api_env"
      log "EMAIL_FROM: sender name KodiHub → KodiHQ (same address)"
    fi
  fi
  return 0
}

# Puts the hosts on BASE_DOMAIN right away, without the checks edge_up makes first. For going
# back to names this server was already answering (rollback.sh, a failed deploy).
settle_hosts() {
  local base
  hosts_load
  base="$(target_domain)"
  if [ -n "$base" ]; then
    hosts_plan "$base"
    if [ "$MOVE" = 1 ]; then hosts_apply; fi
  fi
  hosts_save
}

# True once every name in $1 answers this server's own proxy over HTTPS with a certificate
# that verifies. Asked on 127.0.0.1, so DNS caches elsewhere don't matter. Certificates take a
# moment to arrive, hence the rounds ($2 of them, 5 seconds apart).
hosts_answer() {
  local pending="$1" rounds="$2" h still n=0
  while :; do
    still=""
    for h in $pending; do
      curl -sS -o /dev/null -m 8 --resolve "$h:443:127.0.0.1" "https://$h/" >/dev/null 2>&1 || still="$still $h"
    done
    pending="${still# }"
    if [ -z "$pending" ]; then return 0; fi
    n=$((n + 1))
    if [ "$n" -ge "$rounds" ]; then break; fi
    sleep 5
  done
  UNANSWERED="$pending"
  return 1
}

# Asks a public resolver ($1: google or cloudflare) for the address of name $2.
# 0 = it has one, 1 = it has none, 2 = the resolver itself could not be asked.
public_dns_has() {
  local out
  case "$1" in
    google)
      out="$(curl -fsS -m 10 "https://dns.google/resolve?name=$2&type=A" 2>/dev/null)" || return 2 ;;
    cloudflare)
      out="$(curl -fsS -m 10 -H 'accept: application/dns-json' \
        "https://cloudflare-dns.com/dns-query?name=$2&type=A" 2>/dev/null)" || return 2 ;;
    *) return 2 ;;
  esac
  grep -Eq '"Status"[[:space:]]*:[[:space:]]*0[^0-9]' <<< "$out" || return 1
  grep -Eq '"data"[[:space:]]*:[[:space:]]*"[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+"' <<< "$out"
}

# Before a move: can people reach the new names, and can this server answer them? Public DNS
# is asked first. Then the names are added to the running proxy next to the current ones
# (forwarding there for now), which makes Caddy fetch their certificates, and the move waits
# until they answer. A domain that hasn't reached every resolver yet, a DNS record that points
# elsewhere, a Cloudflare token without access, or a config Caddy won't take shows up here,
# with visitors still on the current names, and not after the switch.
hosts_ready() {
  local base="$1" conf="$ROOT/edge/conf" names v t l out h r rc missing=""
  if ! command -v curl >/dev/null 2>&1; then
    warn "curl is not installed on this server, so the new names cannot be checked."
    return 1
  fi
  if [ -n "${CF_API_TOKEN:-}" ] && [ "$NEW_SITE_DOMAIN" != "$SITE_DOMAIN" ] && ! cf_token_sees_zone "$base"; then
    warn "The Cloudflare token on this server cannot see the $base zone (or Cloudflare did not answer). Booking sites need it for their certificate: give the token Zone: Read and DNS: Edit on $base."
    return 1
  fi
  # The names that change: each has to answer before anything moves.
  names=""
  if [ "$NEW_APP_HOST" != "$APP_HOST" ]; then names="$names $NEW_APP_HOST"; fi
  if [ "$NEW_API_HOST" != "$API_HOST" ]; then names="$names $NEW_API_HOST"; fi
  if [ "$NEW_LANDING_HOST" != "$LANDING_HOST" ]; then
    names="$names $NEW_LANDING_HOST"
    if [ "$ENV" = prod ]; then names="$names www.$NEW_LANDING_HOST"; fi
  fi
  if [ "$NEW_SITE_DOMAIN" != "$SITE_DOMAIN" ] && [ -n "${CF_API_TOKEN:-}" ]; then
    names="$names go.$NEW_SITE_DOMAIN"
  fi
  names="${names# }"

  # A new domain, or a change of nameservers, can take a day to reach every resolver. Until
  # then some visitors would be forwarded to a name their resolver cannot find. A resolver
  # that can't be asked from here is skipped: the certificate check below still stands.
  for h in $names; do
    for r in google cloudflare; do
      rc=0; public_dns_has "$r" "$h" || rc=$?
      if [ "$rc" = 1 ]; then missing="$missing $h ($r)"; fi
    done
  done
  if [ -n "$missing" ]; then
    warn "Public DNS cannot find these names yet:$missing. Nothing is wrong on this server: a new domain or new nameservers can take a day to reach everyone."
    return 1
  fi

  # A Cloudflare token that changed in this very run is in edge.env but not yet in the running
  # proxy, which would then ask for the booking sites' certificate with the old token and never
  # get it. So the proxy is restarted on the current edge.env first.
  if [ "$(cat "$ROOT/edge/.env.sum" 2>/dev/null)" != "$(edge_env_sum)" ]; then
    log "edge.env changed since the proxy started: restarting it before the check..."
    if ! edge_start; then
      warn "The edge proxy did not come back up on the current edge.env."
      return 1
    fi
  fi

  mkdir -p "$conf/sites" "$conf/legacy"
  legacy_sw > "$conf/legacy/sw.js"
  # The same blocks the old names get after a move, here for the names not served yet.
  ( for v in APP_HOST API_HOST LANDING_HOST SITE_DOMAIN; do
      t="NEW_$v"; l="LEGACY_$v"
      if [ "${!t}" = "${!v}" ] || [ "${!t}" = "${!l:-}" ]; then
        printf -v "$l" '%s' ""
      else
        printf -v "$l" '%s' "${!t}"
      fi
    done
    legacy_caddy ) > "$conf/sites/warmup.caddy"
  if ! out=$( cd "$ROOT/infra/edge" \
      && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>&1 ); then
    rm -f "$conf/sites/warmup.caddy"
    warn "The edge proxy did not take the new names: ${out:-no answer from it}"
    return 1
  fi
  log "Waiting for certificates for: $names"
  if ! hosts_answer "$names" 36; then
    warn "No valid certificate after 3 minutes for: $UNANSWERED. Check that these names point to this server in DNS and that the Cloudflare token can edit DNS for $base."
    # What the proxy itself said about it, so the reason is in this log and not only on the server.
    ( cd "$ROOT/infra/edge" && docker compose logs --no-color --tail 500 caddy 2>/dev/null \
        | grep -F '"level":"error"' | grep -F "$base" | tail -n 4 | cut -c1-700 ) || true
    return 1
  fi
  return 0
}

# Replaces the web app's service worker on a name being left. That worker answers every page
# from its own cache, so without this an installed app would never see the redirect.
legacy_sw() {
  cat <<'JS'
// This address has moved. The service worker registered here removes itself and reloads the
// open pages, which then follow the redirect to the new address.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
      await self.registration.unregister();
      const pages = await self.clients.matchAll({ type: 'window' });
      await Promise.all(
        pages.map(async (page) => {
          try {
            await page.navigate(page.url);
          } catch (err) {
            // The next reload of that page follows the redirect.
          }
        }),
      );
    })(),
  );
});
JS
}

# The names this server answered before its domain changed (LEGACY_* in edge.env), as a Caddy
# file: the API keeps working on them, pages go to the current names. hosts_ready uses the
# same blocks the other way round, for names about to become the current ones.
legacy_caddy() {
  local api="hodi-$ENV-api:8080" code="" n
  if [ "$LEGACY_REDIRECT" = permanent ]; then code=" permanent"; fi
  cat <<CADDY
# Written by scripts/lib.sh, never by hand: the names this server answers besides its current
# ones. After a domain move these are the old names (LEGACY_* in /opt/hodi/edge/edge.env); to
# retire them, remove those lines and deploy.
CADDY
  if [ -n "${LEGACY_APP_HOST:-}" ]; then
    cat <<CADDY

# Web app. A tab that is still open keeps its API; every page goes to $APP_HOST.
$LEGACY_APP_HOST {
	import security
	import api_guard

	handle /api/* {
		reverse_proxy $api
	}
	handle /sw.js {
		header Cache-Control "no-store"
		root * /etc/caddy/legacy
		file_server
	}
	handle {
		redir https://$APP_HOST{uri}$code
	}
}
CADDY
  fi
  if [ -n "${LEGACY_API_HOST:-}" ]; then
    cat <<CADDY

# API, served in full: installed mobile apps and payment callbacks registered on this name.
$LEGACY_API_HOST {
	import security
	import api_guard

	handle {
		reverse_proxy $api
	}
}
CADDY
  fi
  if [ -n "${LEGACY_LANDING_HOST:-}" ]; then
    cat <<CADDY

# Landing page.
$LEGACY_LANDING_HOST {
	import security

	handle /api/v1/internal/* {
		respond 404
	}
	handle /api/* {
		reverse_proxy $api
	}
	handle {
		redir https://$LANDING_HOST{uri}$code
	}
}
CADDY
    if [ "$ENV" = prod ]; then
      cat <<CADDY

www.$LEGACY_LANDING_HOST {
	import security
	redir https://$LANDING_HOST{uri}$code
}
CADDY
    fi
  fi
  if [ -n "${LEGACY_SITE_DOMAIN:-}" ] && [ -n "${CF_API_TOKEN:-}" ]; then
    # The first label of the host ({slug}. or go.) is label number n, counted from the right.
    n="$(awk -F. '{ print NF }' <<< "$LEGACY_SITE_DOMAIN")"
    cat <<CADDY

# Booking sites and SMS short links: the same {slug}. or go. on $SITE_DOMAIN. The API stays
# reachable for a page that was already open.
*.$LEGACY_SITE_DOMAIN {
	tls {
		dns cloudflare {env.CF_API_TOKEN}
	}
	import security
	import api_guard

	handle /api/* {
		reverse_proxy $api
	}
	handle /sw.js {
		header Cache-Control "no-store"
		root * /etc/caddy/legacy
		file_server
	}
	handle {
		redir https://{http.request.host.labels.$n}.$SITE_DOMAIN{uri}$code
	}
}
CADDY
  fi
  return 0
}

# A fingerprint of edge.env, to tell whether the running proxy was started with this content.
edge_env_sum() {
  (sha256sum 2>/dev/null || shasum -a 256) < "$ROOT/edge/edge.env" | cut -d' ' -f1
}

# Starts the proxy and makes it load the config on disk. edge.env is read when the container
# starts, so a changed value (a new Cloudflare token, other hosts) needs a recreate; otherwise a
# reload keeps connections open. 0 = Caddy took the config, 2 = the container did not start.
edge_start() {
  local sum recreate="" tries=0 out=""
  sum="$(edge_env_sum)"
  [ "$(cat "$ROOT/edge/.env.sum" 2>/dev/null)" = "$sum" ] || recreate="--force-recreate"
  ( cd "$ROOT/infra/edge" && docker compose up -d --quiet-pull $recreate >/dev/null ) || return 2
  # A container that was just (re)started needs a moment before its admin API takes a reload.
  until out=$( cd "$ROOT/infra/edge" \
      && docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>&1 ); do
    tries=$((tries + 1))
    if [ "$tries" -ge 20 ]; then
      warn "Last reload error: ${out:-none}"
      ( cd "$ROOT/infra/edge" && docker compose ps caddy && docker compose logs --tail 30 caddy ) || true
      return 1
    fi
    sleep 1
  done
  echo "$sum" > "$ROOT/edge/.env.sum"
}

# Points the edge proxy at the current infra bundle and reloads it (no dropped connections).
edge_up() {
  local base
  hosts_load
  base="$(target_domain)"
  if [ -n "$base" ]; then
    hosts_plan "$base"
    if [ "$MOVE" = 1 ]; then
      log "Moving this server's hosts to $base: checking the new names first..."
      if hosts_ready "$base"; then
        hosts_apply
      else
        warn "This server stays on its current hosts. Nothing changed for visitors; the next run tries again."
        echo "::warning::The hosts were not moved to $base. The reason is in this step's log, a few lines above this one."
      fi
    fi
  fi
  hosts_save

  # Caddy reads its config from $ROOT/edge/conf, a folder deploys never rename. (Each deploy
  # renames infra -> infra.prev and later deletes it; a container mounting ./Caddyfile or ./sites
  # from there kept the old, then deleted, folder and silently lost the host-sites block.)
  local conf="$ROOT/edge/conf"
  mkdir -p "$conf/sites" "$conf/legacy"
  find "$conf/sites" -mindepth 1 -maxdepth 1 -name '*.caddy' -delete
  if [ "$ENV" = prod ]; then cp "$ROOT"/infra/edge/sites-prod/*.caddy "$conf/sites/"; fi
  if [ -n "${CF_API_TOKEN:-}" ]; then
    cp "$ROOT/infra/edge/hosts.caddy" "$conf/sites/"
  else
    warn "CF_API_TOKEN is not set in $ROOT/edge/edge.env: host booking sites (*.$SITE_DOMAIN) stay off."
  fi
  if [ -n "${LEGACY_APP_HOST:-}${LEGACY_API_HOST:-}${LEGACY_LANDING_HOST:-}${LEGACY_SITE_DOMAIN:-}" ]; then
    legacy_sw > "$conf/legacy/sw.js"
    legacy_caddy > "$conf/sites/legacy.caddy"
  fi
  cp "$ROOT/infra/edge/Caddyfile" "$conf/Caddyfile.tmp" && mv "$conf/Caddyfile.tmp" "$conf/Caddyfile"
  cp "$ROOT/infra/edge/maintenance.html" "$ROOT/maintenance/index.html"

  local rc=0
  edge_start || rc=$?
  if [ "$rc" = 2 ]; then fail "Could not start the edge proxy."; fi
  if [ "$rc" != 0 ]; then fail "Could not reload the edge proxy (Caddy did not accept its config)."; fi
}
