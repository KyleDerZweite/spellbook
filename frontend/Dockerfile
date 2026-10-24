FROM node:26.10.0-bookworm-slim AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/package.json
COPY contracts/package.json ./contracts/package.json
RUN npm install --global "$(node --print 'require("./package.json").packageManager')"
RUN pnpm install --frozen-lockfile --filter spellbook-frontend...
COPY frontend/ ./frontend/
COPY contracts/ ./contracts/
COPY scripts/check-client.mjs ./scripts/check-client.mjs
ARG APP_ORIGIN
RUN pnpm --dir frontend build

FROM node:26.10.0-bookworm-slim AS runtime
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY frontend/package.json ./frontend/package.json
COPY contracts/package.json ./contracts/package.json
RUN npm install --global "$(node --print 'require("./package.json").packageManager')"
RUN pnpm install --prod --frozen-lockfile --filter spellbook-frontend...
COPY --from=builder /app/frontend/build ./frontend/build
COPY contracts/src ./contracts/src
ENV NODE_ENV=production
ENV HOST=127.0.0.1
ENV PORT=3000
ENV BODY_SIZE_LIMIT=12M
EXPOSE 3000
CMD ["node", "frontend/build/index.js"]
