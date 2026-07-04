# Custom nginx image — multi-stage build.
#
# Stage 1 (frontend-builder): Node 20 slim, builds the Expo web bundle.
# Stage 2 (nginx): serves the built static bundle plus reverse-proxies
#                   /api/* to the backend container. Ships openssl so the
#                   entrypoint can generate self-signed placeholder certs
#                   on a fresh VPS before Let's Encrypt has issued anything.
#
# The build context MUST be the repo root (see docker-compose.yml), because
# stage 1 needs access to ./frontend and stage 2 needs ./nginx/*.

# ---------------------------------------------------------------------------
# Stage 1: build the Expo Router web bundle -> /build/dist
# ---------------------------------------------------------------------------
FROM node:20-bookworm-slim AS frontend-builder

WORKDIR /build
ENV YARN_CACHE_FOLDER=/tmp/yarn-cache \
    npm_config_yes=true

# Backend base URL baked into the JS bundle at build time. Overridable at
# `docker compose build --build-arg EXPO_PUBLIC_BACKEND_URL=...`.
ARG EXPO_PUBLIC_BACKEND_URL=https://api.pizzadenfert.fr
ENV EXPO_PUBLIC_BACKEND_URL=$EXPO_PUBLIC_BACKEND_URL

# --- Cacheable dependency install ---
COPY frontend/package.json frontend/yarn.lock ./
# Yarn 1.x classic — matches the packageManager field in frontend/package.json.
RUN corepack disable >/dev/null 2>&1 || true && \
    npm i -g yarn@1.22.22 --loglevel=error && \
    yarn install --frozen-lockfile --network-timeout 600000 --ignore-scripts

# --- Copy the rest of the source and export ---
COPY frontend/ ./
# `npx expo export -p web -o dist` produces a fully static bundle under ./dist.
# `--no-minify` is NOT used — we want the small, cached production output.
RUN npx expo export -p web -o dist

# ---------------------------------------------------------------------------
# Stage 2: nginx runtime
# ---------------------------------------------------------------------------
FROM nginx:1.27-alpine

# openssl is needed by the entrypoint to auto-generate self-signed placeholder
# certs on first boot (Alpine's nginx image does not include openssl).
RUN apk add --no-cache openssl

# ACME HTTP-01 webroot + document root for the customer site.
RUN mkdir -p /var/www/certbot /usr/share/nginx/pizzadenfert

# Static web bundle from stage 1 -> served at https://pizzadenfert.fr
COPY --from=frontend-builder /build/dist /usr/share/nginx/pizzadenfert

# Entrypoint that generates missing certs then hands off to the stock nginx one.
COPY nginx/docker-entrypoint-init.sh /docker-entrypoint-init.sh
RUN chmod +x /docker-entrypoint-init.sh

ENTRYPOINT ["/docker-entrypoint-init.sh"]
CMD ["nginx", "-g", "daemon off;"]
