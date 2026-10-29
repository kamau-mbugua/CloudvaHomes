# Scheduled jobs (calls the API's /internal/jobs with the shared secret) and, in prod, nightly
# database backups. Times are Africa/Nairobi.
FROM alpine:3.20
RUN apk add --no-cache curl tzdata postgresql16-client
COPY crontab /etc/crontabs/root
COPY job.sh backup.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/job.sh /usr/local/bin/backup.sh
CMD ["crond", "-f", "-l", "8"]
