#!/usr/bin/env bash
# One-time setup of a Hodi server (run as root on the VM). One environment per VM:
#
#   sudo bash server-setup.sh prod [app.kodihub.co.ke] [api.kodihub.co.ke]  [kodihub.co.ke]         < deploy-key.pub
#   sudo bash server-setup.sh dev  [dev.kodihub.co.ke] [dapi.kodihub.co.ke] [landing.kodihub.co.ke] < deploy-key.pub
#
# - Docker + Compose, 2 GB swap (skipped if present)
# - user `deploy`: SSH with the given public key only (GitHub Actions), in the docker group
# - /opt/hodi owned by deploy; secrets generated HERE and never leave the server
# Safe to re-run: existing secrets are kept; the key and host domains are updated.
set -euo pipefail
ENV="${1:?usage: server-setup.sh dev|prod [app-host] [api-host] [landing-host] < key.pub}"
[[ "$ENV" =~ ^(dev|prod)$ ]] || { echo "env must be dev or prod"; exit 1; }

if [ "$ENV" = prod ]; then
  APP_HOST="${2:-app.kodihub.co.ke}"
  API_HOST="${3:-api.kodihub.co.ke}"
  LANDING_HOST="${4:-kodihub.co.ke}"
else
  APP_HOST="${2:-dev.kodihub.co.ke}"
  API_HOST="${3:-dapi.kodihub.co.ke}"
  LANDING_HOST="${4:-landing.kodihub.co.ke}"
fi

PUBKEY="$(cat)"
[[ "$PUBKEY" == ssh-* ]] || { echo "Pipe the deploy public key on stdin"; exit 1; }
ROOT=/opt/hodi

# ── Docker, swap ─────────────────────────────────────────────────────────────
if ! command -v docker >/dev/null; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ca-certificates curl rsync unattended-upgrades >/dev/null
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
  systemctl enable --now docker >/dev/null
fi
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

# ── deploy user (key-only; no password, no forwarding) ───────────────────────
id deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash deploy
usermod -aG docker deploy
passwd -l deploy >/dev/null
install -d -m 700 -o deploy -g deploy /home/deploy/.ssh
echo "no-agent-forwarding,no-port-forwarding,no-X11-forwarding,no-pty $PUBKEY" > /home/deploy/.ssh/authorized_keys
chown deploy:deploy /home/deploy/.ssh/authorized_keys
chmod 600 /home/deploy/.ssh/authorized_keys

# ── layout ───────────────────────────────────────────────────────────────────
umask 077
mkdir -p "$ROOT"/{infra,releases,maintenance,landing-releases,backups/"$ENV",envs/"$ENV",edge}
chown -R deploy:deploy "$ROOT"
chmod 755 "$ROOT" "$ROOT/landing-releases" "$ROOT/maintenance"
docker network inspect hodi-edge >/dev/null 2>&1 || docker network create hodi-edge >/dev/null

cat > "$ROOT/edge/edge.env" <<EDGE
APP_HOST=$APP_HOST
API_HOST=$API_HOST
LANDING_HOST=$LANDING_HOST
APP_STACK=hodi-$ENV
EDGE

# ── secrets (generated once) ─────────────────────────────────────────────────
dir="$ROOT/envs/$ENV"
if [ ! -f "$dir/stack.env" ]; then
  rand() { openssl rand -base64 48 | tr -d '/+=\n' | cut -c1-"$1"; }
  key32() { openssl rand -base64 32; }
  jobs=$(rand 48)
  cat > "$dir/stack.env" <<STACK
STACK=hodi-$ENV
ENV_DIR=$dir
DB_PASSWORD=$(rand 40)
JOBS_SHARED_SECRET=$jobs
BACKUPS=$([ "$ENV" = prod ] && echo 1 || echo 0)
BACKUP_DIR=$ROOT/backups/$ENV
STACK
  cat > "$dir/api.env" <<API
NODE_ENV=$([ "$ENV" = prod ] && echo production || echo development)
LOG_FORMAT=json
APP_URL=https://$APP_HOST
PUBLIC_API_URL=https://$API_HOST
CORS_ORIGINS=https://$APP_HOST,https://$LANDING_HOST
JWT_SECRET=$(rand 64)
FIELD_ENCRYPTION_KEYS=k1:$(key32)
FIELD_INDEX_KEY=$(key32)
JOBS_SHARED_SECRET=$jobs
DARAJA_MODE=$([ "$ENV" = prod ] && echo live || echo simulated)
SMS_PROVIDER=log
EMAIL_PROVIDER=log
EMAIL_FROM=KodiHub <noreply@kodihub.co.ke>
API
  echo "$ENV: secrets generated"
else
  echo "$ENV: keeping existing secrets"
fi
chown -R deploy:deploy "$ROOT"
chmod 600 "$dir"/*.env
echo "Ready: deploy@$(hostname) for $ENV (app=$APP_HOST, api=$API_HOST, landing=$LANDING_HOST). Keep an offline copy of $dir."
