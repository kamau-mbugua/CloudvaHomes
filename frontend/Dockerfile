# syntax=docker/dockerfile:1.7
#
# The web app as static files behind a small Caddy server. The API is reached on the same
# origin (/api/v1) through the server's front proxy, so one image serves every environment.
#
#   docker build -t hodi-web .

FROM node:22-slim AS build
WORKDIR /app
ENV CI=true
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM caddy:2-alpine AS runtime
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
EXPOSE 8080
