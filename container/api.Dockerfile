# syntax=docker/dockerfile:1
#
# Contexto de build: a RAIZ do repositorio (nao esta pasta).
#   docker build -f container/api.Dockerfile --target prod .

FROM python:3.12-slim AS base
# O venv fica FORA de /app de proposito: em desenvolvimento o diretorio do projeto
# e montado por bind mount, e um venv em /app/.venv seria sobreposto pelo venv do
# host — que no Windows nem sequer roda no Linux do container.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

RUN apt-get update \
    && apt-get install -y --no-install-recommends postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app


# --- dependencias (camada cacheavel) -----------------------------------------
FROM base AS deps
COPY pyproject.toml uv.lock* ./
RUN uv sync --frozen --no-install-project --no-dev 2>/dev/null \
    || uv sync --no-install-project --no-dev


# --- desenvolvimento ----------------------------------------------------------
FROM deps AS dev
RUN uv sync --no-install-project
COPY . .
EXPOSE 8000
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]


# --- producao -----------------------------------------------------------------
FROM deps AS prod
COPY . .
RUN python manage.py collectstatic --noinput --settings=config.settings || true
RUN useradd --create-home --uid 1000 app && chown -R app:app /app
USER app
EXPOSE 8000
CMD ["gunicorn", "config.wsgi:application", \
     "--bind", "0.0.0.0:8000", \
     "--workers", "4", \
     "--timeout", "120", \
     "--access-logfile", "-"]
