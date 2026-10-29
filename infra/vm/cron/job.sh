#!/bin/sh
# Calls one scheduled job on the API inside this stack. Output goes to the container log.
job="$1"
code=$(curl -sS -o /tmp/job.out -w '%{http_code}' --max-time 600 -X POST \
  -H "Authorization: Bearer ${JOBS_SHARED_SECRET}" "${JOBS_URL}/${job}")
echo "$(date -Iseconds) job=${job} status=${code} $(head -c 300 /tmp/job.out)"
[ "$code" -lt 300 ]
