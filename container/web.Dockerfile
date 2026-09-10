# syntax=docker/dockerfile:1
#
# Contexto de build: a RAIZ do repositorio (nao esta pasta nem frontend/).
#   docker build -f container/web.Dockerfile --target production .
#
# O gerenciador e o runtime aqui sao o Bun. O `node_modules` continua sendo um
# volume nomeado no compose de dev, entao `bun`/`bunx` so funcionam de dentro do
# container.

# --- desenvolvimento (vite dev server, usado pelo compose dev) ----------------
FROM oven/bun:1-alpine AS development
# Bun e o gerenciador; o *runtime* das ferramentas continua sendo o Node. Vitest
# e o plugin do Vite dependem da interop CJS/ESM do Node — sob o runtime do Bun,
# `import { z } from "zod"` chega como undefined e a suite inteira quebra. Com o
# node presente, o shebang dos bins em node_modules/.bin resolve sozinho.
RUN apk add --no-cache nodejs
WORKDIR /app
COPY frontend/package.json frontend/bun.lock* ./
# --frozen-lockfile so vale quando o lock ja existe e casa com o package.json;
# na primeira build (ou depois de mexer em dependencia) cai no install normal.
RUN bun install --frozen-lockfile 2>/dev/null || bun install
COPY frontend/ ./
EXPOSE 5173
CMD ["bun", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]


# --- build do SPA -------------------------------------------------------------
FROM oven/bun:1-alpine AS builder
RUN apk add --no-cache nodejs
WORKDIR /app
COPY frontend/package.json frontend/bun.lock* ./
RUN bun install --frozen-lockfile 2>/dev/null || bun install
COPY frontend/ ./
ARG VITE_API_URL=/api/v1
ARG VITE_BASE_PATH=/
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH
RUN bun run build


# --- producao (nginx interno; TLS e roteamento ficam no proxy da VPS) ---------
FROM nginx:1.27-alpine AS production
COPY container/nginx.web.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
