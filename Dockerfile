# syntax=docker/dockerfile:1.7
# ---------------------------------------------------------------------------
# higgsfree: self-hosted image. Next's standalone Node server serves the prerendered pages and the one server
# route, the ByteDance pass-through (src/app/api/bytedance), which forwards ByteDance calls with the key they carry
# and stores nothing. Nothing is stored in the container: your keys and your library live in your browser.
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
# vercel.json: the security headers, which the standalone server sends itself (next.config.ts).
COPY tsconfig.json next.config.ts postcss.config.mjs vercel.json ./
COPY public ./public
COPY src ./src
ENV NEXT_TELEMETRY_DISABLED=1 NEXT_OUTPUT=standalone
RUN pnpm build

# ---------- runtime ----------
FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app
# Port 80 inside, as before; Docker (20.10 and later) lets the unprivileged `node` user bind it.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=80 HOSTNAME=0.0.0.0
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1/image').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "server.js"]
