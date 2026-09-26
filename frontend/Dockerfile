# pnpm is pinned to the version CI uses (pnpm 9, matching lockfileVersion 9.0).
# `pnpm@latest` drifted to pnpm 12, which no longer reads the `pnpm.overrides`
# field in package.json, so `pnpm install --frozen-lockfile` failed with
# ERR_PNPM_LOCKFILE_CONFIG_MISMATCH in both stages.
# Stage 1: Build
FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy package files first for better layer caching
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy frontend source
COPY frontend/ ./

# Build with adapter-node
RUN pnpm build

FROM builder AS migrator
CMD ["pnpm", "db:migrate"]

# Stage 2: Runtime
FROM node:22-slim AS runtime

RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./

RUN pnpm install --prod --frozen-lockfile

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["node", "build/index.js"]
