# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# Open Higgsfield: production image
#
#   build stage   : full install, compile the Vite/React client into dist/client
#   runtime stage : prod deps only (tsx is a runtime dep) + src/ + dist/client,
#                   non-root, persistent /data volume for SQLite + generated media
#
#   docker build -t open-higgsfield .
#   docker run -d -p 127.0.0.1:8787:8787 -v "$PWD/data:/data" \
#     -e OPENROUTER_API_KEY=sk-or-v1-... open-higgsfield
#
# Requires Node >= 22.13 for the built-in `node:sqlite` (no native deps).
# Any newer major works too: `--build-arg NODE_VERSION=26`.
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22
# Keep in sync with the `packageManager` field in package.json.
ARG PNPM_VERSION=11.24.0

# ---------- base: node + pnpm ----------
FROM node:${NODE_VERSION}-alpine AS base
ARG PNPM_VERSION
# Corepack is no longer bundled with Node from 25 onward, so install pnpm with npm instead.
# The runtime stage never calls pnpm (the CMD below execs node directly).
RUN npm install -g "pnpm@${PNPM_VERSION}"
WORKDIR /app

# ---------- build: all deps + client bundle ----------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY tsconfig.json vite.config.ts ./
COPY src ./src
RUN pnpm build

# ---------- runtime ----------
FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=8787
# Listen on every interface inside the container's own network namespace; docker-compose.yml
# decides which host interface the port is published on (loopback by default).
ENV HOST=0.0.0.0
ENV DATA_DIR=/data

# The server uses plain relative imports (no path aliases); tsconfig.json is copied only so
# `tsx` picks up the same compiler options (target, strictness) as the dev tree.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  pnpm install --prod --frozen-lockfile --store-dir /pnpm/store

COPY --chown=node:node src ./src
COPY --chown=node:node --from=build /app/dist/client ./dist/client

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787

# curl-less healthcheck; honours a PORT override.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Run node itself as the container's main process (no pnpm or shell in front of it) so that
# SIGTERM from `docker stop` reaches the graceful shutdown in src/server/index.ts.
# `--import tsx` registers the TypeScript loader in-process instead of spawning a child.
CMD ["node", "--import", "tsx", "src/server/index.ts"]
