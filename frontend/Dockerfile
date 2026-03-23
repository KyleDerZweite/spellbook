FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy bindings first (from repo root)
COPY src/module_bindings/ ./module_bindings/

# Copy frontend source
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ .

# Override the bindings alias to point to local copy
RUN sed -i "s|'../src/module_bindings'|'./module_bindings'|" svelte.config.js

RUN pnpm exec svelte-kit sync && pnpm build

FROM node:22-slim

WORKDIR /app

COPY --from=builder /app/build ./build
COPY --from=builder /app/package.json .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "build"]
