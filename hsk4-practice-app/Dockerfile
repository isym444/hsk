# syntax=docker/dockerfile:1
#
# Builds the Angular bundle and serves it with nginx, which also proxies /api to
# the `api` service on the compose network. No Node runtime in the final image.

# ---------- build ----------
# Debian slim rather than alpine: the Angular toolchain pulls native binaries
# (esbuild, rollup, lmdb, msgpackr) whose musl builds are a needless source of
# platform-selection failures. The stage is discarded, so its size is irrelevant.
FROM node:24-slim AS build

WORKDIR /app

# Dependencies first, so this layer is reused when only the source changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ---------- serve ----------
FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/hsk4-practice-app/browser /usr/share/nginx/html

EXPOSE 80

# busybox wget ships with the alpine image.
HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=5 \
    CMD ["wget", "-q", "--spider", "http://127.0.0.1/"]

CMD ["nginx", "-g", "daemon off;"]
