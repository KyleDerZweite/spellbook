FROM node:22-slim AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

# Mirror the repo layout so aliases resolve unchanged
# Repo root = /repo, frontend = /repo/frontend
WORKDIR /repo/frontend

# Copy bindings to where the alias expects them (../src/module_bindings)
COPY src/module_bindings/ /repo/src/module_bindings/

# Install dependencies
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Copy frontend source (no sed needed - paths match original layout)
COPY frontend/ .

RUN pnpm exec svelte-kit sync && pnpm build

FROM node:22-slim

WORKDIR /app

COPY --from=builder /repo/frontend/build ./build
COPY --from=builder /repo/frontend/package.json .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "build"]
