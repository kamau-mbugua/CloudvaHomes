#!/bin/sh
# Nightly compressed dump, kept BACKUP_KEEP_DAYS days. Only when BACKUPS=1 (prod).
[ "${BACKUPS}" = "1" ] || exit 0
set -e
f="/backups/hodi-$(date +%Y%m%d-%H%M).sql.gz"
pg_dump --no-owner --format=plain | gzip -9 > "$f.tmp" && mv "$f.tmp" "$f"
chmod 600 "$f"
find /backups -name 'hodi-*.sql.gz' -mtime "+${BACKUP_KEEP_DAYS}" -delete
echo "$(date -Iseconds) backup=$f size=$(wc -c < "$f")"
