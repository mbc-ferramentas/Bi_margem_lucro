# syntax=docker/dockerfile:1
#
# Contexto de build: a RAIZ do repositorio (nao esta pasta nem frontend/).
#   docker build -f container/web.Dockerfile --target production .

# --- desenvolvimento (vite dev server, usado pelo compose dev) ----------------
FROM node:22-alpine AS development
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci 2>/dev/null || npm install
COPY frontend/ ./
EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "5173"]


# --- build do SPA -------------------------------------------------------------
FROM node:22-alpine AS builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci 2>/dev/null || npm install
COPY frontend/ ./
ARG VITE_API_URL=/api/v1
ARG VITE_BASE_PATH=/
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_BASE_PATH=$VITE_BASE_PATH
RUN npm run build


# --- producao (nginx interno; TLS e roteamento ficam no proxy da VPS) ---------
FROM nginx:1.27-alpine AS production
COPY container/nginx.web.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html
EXPOSE 80
