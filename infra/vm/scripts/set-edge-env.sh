#!/usr/bin/env bash
# Writes one secret into /opt/hodi/edge/edge.env, reading the value from stdin so it never
# appears in a command line, `ps` or a log. Used by the deploy workflow to copy the Cloudflare
# token from GitHub secrets (CF_API_TOKEN / DEV_CF_API_TOKEN) before deploy.sh runs:
#
#   printf '%s' "$TOKEN" | ssh hodi 'bash /opt/hodi/infra.new/scripts/set-edge-env.sh CF_API_TOKEN'
#
# Only names on the list below are accepted. Other lines in edge.env are kept.
set -euo pipefail

ROOT="${HODI_ROOT:-/opt/hodi}"
NAME="${1:-}"

case "$NAME" in
  CF_API_TOKEN) ;;
  *) echo "set-edge-env: '$NAME' is not a setting this script manages" >&2; exit 2 ;;
esac

VALUE="$(cat)"
# One line of token characters only: no newlines, spaces or anything that could add a line.
if [ -z "$VALUE" ] || ! [[ "$VALUE" =~ ^[A-Za-z0-9_.-]+$ ]]; then
  echo "set-edge-env: $NAME is empty or has characters a Cloudflare token never has" >&2
  exit 2
fi

FILE="$ROOT/edge/edge.env"
mkdir -p "$ROOT/edge"
umask 077
TMP="$(mktemp "$FILE.XXXXXX")"
if [ -f "$FILE" ]; then grep -v "^$NAME=" "$FILE" > "$TMP" || true; fi
printf '%s=%s\n' "$NAME" "$VALUE" >> "$TMP"
chmod 600 "$TMP"
mv "$TMP" "$FILE"
echo "set-edge-env: $NAME updated"
