# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# higgsfree: self-hosted image (the Vercel deployment does not use this)
#
#   build stage   : full install, `next build` with `output: "standalone"`
#   runtime stage : the standalone server + static assets, non-root,
#                   persistent /data volume for the SQLite database + media
#
#   docker build -t higgsfree .
#   docker run -d -p 127.0.0.1:3000:3000 -v "$PWD/data:/data" \
#     -e OPENROUTER_API_KEY=sk-or-v1-... higgsfree
# ---------------------------------------------------------------------------

ARG NODE_VERSION=22
# Keep in sync with the `packageManager` field in package.json.
ARG PNPM_VERSION=11.24.0

# ---------- base: node + pnpm ----------
FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
RUN npm install -g "pnpm@${PNPM_VERSION}"
WORKDIR /app

# ---------- build ----------
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
  CI=true pnpm install --frozen-lockfile --store-dir /pnpm/store
COPY tsconfig.json next.config.ts postcss.config.mjs ./
COPY public ./public
COPY src ./src
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

# ---------- runtime ----------
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATA_DIR=/data
WORKDIR /app

COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public

RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
