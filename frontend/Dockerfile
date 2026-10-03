# Stage 1: Build
FROM node:24.21.0-bookworm-slim AS builder

WORKDIR /app

# Copy package files first for better layer caching
COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN npm install --global "$(node --print 'require("./package.json").packageManager')"
RUN pnpm install --frozen-lockfile

# Copy frontend source
COPY frontend/ ./

# Build with adapter-node
RUN pnpm build

FROM builder AS migrator
CMD ["pnpm", "db:migrate"]

# Stage 2: Runtime
FROM node:24.21.0-bookworm-slim AS runtime

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/pnpm-workspace.yaml ./

RUN npm install --global "$(node --print 'require("./package.json").packageManager')"
RUN pnpm install --prod --frozen-lockfile

ENV NODE_ENV=production
ENV PORT=3000
ENV BODY_SIZE_LIMIT=12M

EXPOSE 3000

CMD ["node", "build/index.js"]
