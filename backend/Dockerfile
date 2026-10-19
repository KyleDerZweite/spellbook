FROM node:26.10.0-bookworm-slim AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY contracts/package.json ./contracts/package.json
RUN npm install --global "$(node --print 'require("./package.json").packageManager')"
RUN pnpm install --frozen-lockfile --filter @spellbook/backend...
COPY backend/ ./backend/
COPY contracts/ ./contracts/
RUN pnpm --dir backend build

FROM builder AS migrator
WORKDIR /app/backend
CMD ["pnpm", "db:migrate"]

FROM builder AS operator
WORKDIR /app/backend
ENTRYPOINT ["pnpm"]
CMD ["operator:password"]

FROM node:26.10.0-bookworm-slim AS runtime
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json ./backend/package.json
COPY contracts/package.json ./contracts/package.json
RUN npm install --global "$(node --print 'require("./package.json").packageManager')"
RUN pnpm install --prod --frozen-lockfile --filter @spellbook/backend...
COPY --from=builder /app/backend/dist ./backend/dist
ENV NODE_ENV=production
ENV API_HOST=127.0.0.1
ENV API_PORT=3001
EXPOSE 3001
CMD ["node", "backend/dist/main.js"]
