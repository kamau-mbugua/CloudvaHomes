FROM caddy:2.10.2-builder-alpine AS build
RUN xcaddy build --with github.com/caddy-dns/cloudflare
FROM caddy:2.10.2-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
