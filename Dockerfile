# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# higgsfree: self-hosted image. The app is a static site; nginx serves `out/`.
# Nothing is stored in the container: your key and your library live in your browser.
#
#   docker build -t higgsfree .
#   docker run -d -p 127.0.0.1:3000:80 higgsfree
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22
# Keep in sync with the `packageManager` field in package.json.
ARG PNPM_VERSION=11.24.0

# ---------- build ----------
FROM node:${NODE_VERSION}-slim AS build
ARG PNPM_VERSION
RUN npm install -g "pnpm@${PNPM_VERSION}"
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  CI=true pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY tsconfig.json next.config.ts postcss.config.mjs ./
COPY public ./public
COPY src ./src
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- runtime ----------
FROM nginx:alpine AS runtime
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/out /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/image >/dev/null || exit 1
