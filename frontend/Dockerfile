# Stage 1: Build
FROM node:26.10.0-bookworm-slim AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/package.json
COPY backend/package.json ./backend/package.json
COPY contracts/package.json ./contracts/package.json
RUN npm install --global "$(node --print 'require("./package.json").packageManager')"
RUN pnpm install --frozen-lockfile
COPY frontend/ ./frontend/
COPY backend/ ./backend/
COPY contracts/ ./contracts/
COPY scripts/ ./scripts/
ARG APP_ORIGIN
RUN pnpm --dir frontend build

FROM builder AS migrator
WORKDIR /app/frontend
CMD ["pnpm", "db:migrate"]

FROM node:26.10.0-bookworm-slim AS runtime
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/package.json
COPY backend/ ./backend/
COPY contracts/ ./contracts/
COPY --from=builder /app/frontend/build ./frontend/build
RUN npm install --global "$(node --print 'require("./package.json").packageManager')"
RUN pnpm install --prod --frozen-lockfile
ENV NODE_ENV=production
ENV PORT=3000
ENV BODY_SIZE_LIMIT=12M
EXPOSE 3000
CMD ["node", "frontend/build/index.js"]
