"""Configuracao do Django para o BI de margem de lucro."""

from datetime import timedelta
from pathlib import Path

from decouple import Csv, config

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config("SECRET_KEY", default="dev-inseguro-trocar-em-producao")
DEBUG = config("DEBUG", default=False, cast=bool)
ALLOWED_HOSTS = config("ALLOWED_HOSTS", default="localhost,127.0.0.1", cast=Csv())

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "corsheaders",
    "django_filters",
    "apps.core",
    "apps.etl",
    "apps.api",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": config("POSTGRES_DB", default="bi_margem"),
        "USER": config("POSTGRES_USER", default="bi"),
        "PASSWORD": config("POSTGRES_PASSWORD", default="bi"),
        "HOST": config("POSTGRES_HOST", default="db"),
        "PORT": config("POSTGRES_PORT", default="5432"),
    }
}

# Definido desde a primeira migration: trocar o modelo de usuario depois e caro.
AUTH_USER_MODEL = "core.Usuario"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "pt-br"
TIME_ZONE = "America/Sao_Paulo"
USE_I18N = True
USE_TZ = True

URL_PREFIX = config("URL_PREFIX", default="").rstrip("/")
FORCE_SCRIPT_NAME = URL_PREFIX or None
STATIC_URL = f"{URL_PREFIX}/static/" if URL_PREFIX else "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": ("rest_framework.permissions.IsAuthenticated",),
    # Decimal como string: float perderia centavos nos valores monetarios.
    "DEFAULT_RENDERER_CLASSES": (
        "apps.api.renderers.JSONRendererFinanceiro",
        "rest_framework.renderers.BrowsableAPIRenderer",
    ),
    "DEFAULT_FILTER_BACKENDS": ("django_filters.rest_framework.DjangoFilterBackend",),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.LimitOffsetPagination",
    "PAGE_SIZE": 100,
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "ROTATE_REFRESH_TOKENS": True,
}

CORS_ALLOWED_ORIGINS = config(
    "CORS_ALLOWED_ORIGINS", default="http://localhost:5173", cast=Csv()
)
CORS_ALLOW_CREDENTIALS = True

# --- Upload dos CSVs do Protheus -------------------------------------------
# A carga e disparada pelo administrador na tela do BI, sincronamente. Os limites
# ficam explicitos porque o default do Django (2,5 MB) esta na mesma ordem de
# grandeza dos arquivos reais e depender dele seria funcionar por acaso.
# Teto do envio inteiro (soma dos CSVs), verificado na CargaView.
MAX_UPLOAD_CARGA_MB = config("MAX_UPLOAD_CARGA_MB", default=400, cast=int)

# Teto de memoria, nao de tamanho: acima disso o Django escreve o upload em arquivo
# temporario em vez de segurar na RAM. Fica desacoplado do teto do envio de
# proposito — a carga completa passa de 176 MB somados, e a view le tudo por
# `chunks()`, entao acompanhar MAX_UPLOAD_CARGA_MB so serviria para estourar a RAM.
FILE_UPLOAD_MAX_MEMORY_SIZE = 10 * 1024 * 1024
DATA_UPLOAD_MAX_MEMORY_SIZE = FILE_UPLOAD_MAX_MEMORY_SIZE
DATA_UPLOAD_MAX_NUMBER_FILES = 5

# Caminhos do pipeline de dados
DIR_ORIGEM_CSV = Path(config("DIR_ORIGEM_CSV", default=str(BASE_DIR / "data" / "dados" / "usarei")))
DIR_STAGING_PARQUET = Path(
    config("DIR_STAGING_PARQUET", default=str(BASE_DIR / "data" / "staging"))
)

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {"simples": {"format": "{levelname} {asctime} {name} {message}", "style": "{"}},
    "handlers": {"console": {"class": "logging.StreamHandler", "formatter": "simples"}},
    "root": {"handlers": ["console"], "level": config("LOG_LEVEL", default="INFO")},
}
