import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = os.environ.get('SECRET_KEY', 'django-insecure-artisanal-coffee-reserve-secret-key')

DEBUG = True

ALLOWED_HOSTS = ['*']

AUTH_USER_MODEL = 'accounts.User'

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    # Third-party packages
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'django_filters',
    'drf_spectacular',
    # Local Apps
    'apps.accounts',
    'apps.menu',
    'apps.cart',
    'apps.orders',
    'apps.payments',
    'apps.assistant',
    'api',
]

# ── AI Assistant (RAG) ──────────────────────────────────────────────────
# Optional: only needed for optional wording polish. The assistant answers from
# the database with no API key at all, so it never depends on an LLM.
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', os.environ.get('GOOGLE_API_KEY', ''))
ASSISTANT_USE_LLM = os.environ.get('ASSISTANT_USE_LLM', 'False').lower() in ('1', 'true', 'yes')

# Reservation rules used by the assistant's availability check
ASSISTANT_RESERVATION_TABLES = int(os.environ.get('ASSISTANT_RESERVATION_TABLES', '4'))
ASSISTANT_RESERVATION_MAX_GUESTS = int(os.environ.get('ASSISTANT_RESERVATION_MAX_GUESTS', '10'))
ASSISTANT_RESERVATION_SLOT_MINUTES = int(os.environ.get('ASSISTANT_RESERVATION_SLOT_MINUTES', '90'))

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'coffee_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'coffee_project.wsgi.application'

# ----------------------------------------------------
# MySQL Database Configuration with Automatic Fallback
# ----------------------------------------------------
MYSQL_HOST = os.environ.get('MYSQL_HOST', 'localhost')
MYSQL_PORT = os.environ.get('MYSQL_PORT', '3306')
MYSQL_NAME = os.environ.get('MYSQL_DATABASE', 'coffee_reserve_db')
MYSQL_USER = os.environ.get('MYSQL_USER', 'root')
MYSQL_PASSWORD = os.environ.get('MYSQL_PASSWORD', 'root')

use_sqlite_forced = os.environ.get('USE_SQLITE', 'false').lower() == 'true'
use_sqlite = use_sqlite_forced

if not use_sqlite_forced:
    try:
        import pymysql
        conn = pymysql.connect(
            host=MYSQL_HOST,
            user=MYSQL_USER,
            password=MYSQL_PASSWORD,
            port=int(MYSQL_PORT),
            connect_timeout=2
        )
        conn.close()
    except Exception:
        use_sqlite = True

if use_sqlite:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.mysql',
            'NAME': MYSQL_NAME,
            'USER': MYSQL_USER,
            'PASSWORD': MYSQL_PASSWORD,
            'HOST': MYSQL_HOST,
            'PORT': MYSQL_PORT,
            'OPTIONS': {
                'charset': 'utf8mb4',
                'init_command': "SET sql_mode='STRICT_TRANS_TABLES'",
            }
        }
    }

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'Africa/Addis_Ababa'
USE_I18N = True
USE_TZ = True

STATIC_URL = '/static/'
MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Disable automatic trailing slash redirects to prevent proxy loop (ERR_TOO_MANY_REDIRECTS)
APPEND_SLASH = False

FRONTEND_URL = os.environ.get('FRONTEND_URL', 'http://localhost:3000')

# Chapa Payment Gateway Credentials (Test Mode)
CHAPA_SECRET_KEY = os.environ.get('CHAPA_SECRET_KEY', 'CHASECK_TEST-UMHsYkPPXIFHkoPbm38QkV9OpBh0y4vD')
CHAPA_PUBLIC_KEY = os.environ.get('CHAPA_PUBLIC_KEY', 'CHAPUBK_TEST-GYDsYiZ6dmnDWjiYLCbe7JMIm6R52LYD')
CHAPA_ENCRYPTION_KEY = os.environ.get('CHAPA_ENCRYPTION_KEY', 'NkU1iFiDH7h9MB7mhOclw4cN')
CHAPA_API_URL = os.environ.get('CHAPA_API_URL', 'https://api.chapa.co/v1')
# Receipt address used only when the customer's own email domain has no mail
# infrastructure (Chapa refuses to initialize hosted checkout for those).
CHAPA_FALLBACK_EMAIL = os.environ.get('CHAPA_FALLBACK_EMAIL', 'customer@gmail.com')
# Reject signups whose email domain cannot receive mail (sendgrid/chapa need it).
REQUIRE_EMAIL_MX = os.environ.get('REQUIRE_EMAIL_MX', 'True').lower() in ('1', 'true', 'yes')

# Console Email for local development
EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'

# CORS & REST Framework
# Note: CORS_ALLOW_ALL_ORIGINS=True is incompatible with CORS_ALLOW_CREDENTIALS=True
# Must use explicit list when credentials (cookies/JWT) are needed
CORS_ALLOW_ALL_ORIGINS = False
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    os.environ.get('FRONTEND_URL', 'http://localhost:3000'),
]
CORS_ALLOW_CREDENTIALS = True
CORS_EXPOSE_HEADERS = ['Content-Type', 'Set-Cookie']

# Cookie & CSRF settings – required for httpOnly JWT cookies through Next.js proxy
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    os.environ.get('FRONTEND_URL', 'http://localhost:3000'),
]
# In development, allow cookies to be sent through the Next.js rewrite proxy
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_HTTPONLY = True
# JWT cookies set by simplejwt views – keep Lax for local dev
SIMPLEJWT_COOKIE_SECURE = False  # Set True in production (HTTPS only)

from datetime import timedelta

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=60),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATING': True,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'apps.accounts.authentication.JWTCookieAuthentication',
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticatedOrReadOnly',
    ),
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_PAGINATION_CLASS': 'api.pagination.StandardPagination',
    'PAGE_SIZE': 12,
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Artisanal Reserve Food & Coffee Ordering API',
    'DESCRIPTION': 'Production REST API for menu, orders, cart, manager dashboard, and Chapa payments.',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

