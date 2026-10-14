import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

#: The .env files consulted below, in order. The first one that defines a key wins,
#: which is what lets a developer keep their own backend/.env without fighting the
#: project-wide one.
ENV_FILES = (BASE_DIR / '.env', BASE_DIR.parent / '.env')

# Load the local .env file if present. A value already in the environment wins, except
# when it is blank: an empty `SECRET_KEY=` (an unset shell variable left in place, a
# compose interpolation of a missing variable) is not a key, and treating it as one
# would shadow the real value in the file and stop the app from booting.
for _env_file in ENV_FILES:
    if _env_file.is_file():
        try:
            with open(_env_file) as _f:
                for _line in _f:
                    _line = _line.strip()
                    if _line and not _line.startswith('#') and '=' in _line:
                        _k, _v = _line.split('=', 1)
                        _k, _v = _k.strip(), _v.strip().strip("'\"")
                        if not os.environ.get(_k, '').strip():
                            os.environ[_k] = _v
        except OSError:
            pass


def _env_flag(name, default='false'):
    return os.environ.get(name, default).strip().lower() in ('1', 'true', 'yes', 'on')


# Read DEBUG from environment or .env; defaults to true for local development.
# In production, set DEBUG=0 or DEBUG=false to disable and enforce SECRET_KEY.
DEBUG = _env_flag('DEBUG', 'true')

#: The site is behind HTTPS end to end. Off by default: turning it on in a plain
#: `runserver` environment redirects every request to a port nothing is listening on.
SECURE_SSL = _env_flag('SECURE_SSL')

if SECURE_SSL:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = int(os.environ.get('SECURE_HSTS_SECONDS', '31536000'))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
else:
    SECURE_SSL_REDIRECT = False

# Signed cookies (session, CSRF, JWT) may only travel over HTTPS when they do. The
# auth views read this same flag, so there is one switch rather than four.
SESSION_COOKIE_SECURE = SECURE_SSL
CSRF_COOKIE_SECURE = SECURE_SSL
SIMPLEJWT_COOKIE_SECURE = SECURE_SSL

SECRET_KEY = os.environ.get('SECRET_KEY', '').strip()

if not SECRET_KEY:
    if DEBUG:
        # Nothing in settings.py is a secret worth stealing, and a dev server is not
        # reachable from outside. Generated per process rather than hardcoded so the
        # key that reaches production can never be the one in this file.
        import secrets as _secrets

        SECRET_KEY = _secrets.token_urlsafe(64)
    else:
        # Refusing to boot is the point. A deployment that ships the sample key has
        # every session, reset token and JWT signed with a value that is public.
        raise RuntimeError(
            'SECRET_KEY is empty and DEBUG is off, so there is nothing to sign '
            'sessions, reset tokens and JWTs with. Set it in the environment or in '
            f'one of: {", ".join(str(p) for p in ENV_FILES)} - for a local dev server '
            'DEBUG=1 generates a throwaway one instead. Generate a real key with: '
            'python -c "import secrets; print(secrets.token_urlsafe(64))"'
        )

ALLOWED_HOSTS = [
    host.strip()
    for host in os.environ.get('ALLOWED_HOSTS', 'localhost,127.0.0.1,backend').split(',')
    if host.strip()
]

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
    'drf_spectacular',
    # Local Apps
    'apps.accounts',
    'apps.menu',
    'apps.cart',
    'apps.orders',
    'apps.payments',
    'apps.assistant',
    # No models: reporting is read-only aggregation over the orders tables.
    'apps.reports',
    # Cross-cutting helpers (rate limiting) that belong to no single app.
    'apps.core',
    'api',
]

# ── AI Assistant ──────────────────────────────────────────────────────────
# The assistant is grounded in the database and works with no API key at all: the
# deterministic engine answers from the menu, venue settings and reservations.
# When a key is present the language model can drive the conversation, calling
# read-only tools for every fact. Its answers are verified against those tool
# results and discarded if anything is unaccounted for, so a bad model reply can
# never invent a price or claim a booking that was not made.
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', os.environ.get('GOOGLE_API_KEY', ''))
ASSISTANT_USE_LLM = os.environ.get('ASSISTANT_USE_LLM', 'False').lower() in ('1', 'true', 'yes')
ASSISTANT_MODEL = os.environ.get('ASSISTANT_MODEL', 'gemini-2.5-flash')
#: Requests to the model are capped so a slow provider cannot hold a chat open.
ASSISTANT_LLM_TIMEOUT = int(os.environ.get('ASSISTANT_LLM_TIMEOUT', '20'))

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

# Chapa Payment Gateway Credentials. They live only in .env (git-ignored) - never
# as literals here, so a checkout of this repo cannot leak a live merchant key.
CHAPA_SECRET_KEY = os.environ.get('CHAPA_SECRET_KEY', '').strip()
CHAPA_PUBLIC_KEY = os.environ.get('CHAPA_PUBLIC_KEY', '').strip()
CHAPA_ENCRYPTION_KEY = os.environ.get('CHAPA_ENCRYPTION_KEY', '').strip()
CHAPA_API_URL = os.environ.get('CHAPA_API_URL', 'https://api.chapa.co/v1')
# Chapa signs webhooks with the webhook secret. Unsigned webhooks are rejected:
# the endpoint is public, so accepting them would let anyone POST a fake
# "payment.success" and mark any order paid.
CHAPA_WEBHOOK_SECRET = os.environ.get('CHAPA_WEBHOOK_SECRET', '')
# Where Chapa sends its server-to-server callback. This must be the API host, not
# the frontend: the request never carries the customer's cookie, and on localhost
# the frontend origin cannot be reached from the internet at all.
BACKEND_PUBLIC_URL = os.environ.get(
    'BACKEND_PUBLIC_URL', os.environ.get('API_URL', 'http://localhost:8000')).rstrip('/')
# Seconds to wait on the gateway when verifying a transaction.
CHAPA_VERIFY_TIMEOUT = int(os.environ.get('CHAPA_VERIFY_TIMEOUT', '15'))
# Receipt address used only when the customer's own email domain has no mail
# infrastructure (Chapa refuses to initialize hosted checkout for those).
CHAPA_FALLBACK_EMAIL = os.environ.get('CHAPA_FALLBACK_EMAIL', 'customer@gmail.com')
# Reject signups whose email domain cannot receive mail (sendgrid/chapa need it).
REQUIRE_EMAIL_MX = os.environ.get('REQUIRE_EMAIL_MX', 'True').lower() in ('1', 'true', 'yes')

# How long an unpaid order stays alive before the expiry job closes it (FR-P7).
# Measured from when the order was created. Kept comfortably above the gateway's own
# settlement time so a customer who pays at the last moment is not closed out on top
# of their money.
ORDER_PAYMENT_WINDOW_MINUTES = int(os.environ.get('ORDER_PAYMENT_WINDOW_MINUTES', '30'))

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
# SIMPLEJWT_COOKIE_SECURE is set from SECURE_SSL near the top of this file, next to the
# session and CSRF equivalents, so all four cookies follow one switch.

# Whether the password-reset endpoint may hand back a working reset token in its
# response body. That convenience makes every registered account takeable by anyone
# who can call the endpoint, so it is off unless someone deliberately turns it on.
EXPOSE_PASSWORD_RESET_TOKEN = _env_flag('EXPOSE_PASSWORD_RESET_TOKEN')

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
    # No global throttle. The dashboard polls orders, analytics and reservations every
    # five seconds from one tablet, and a blanket per-IP limit would take the live
    # board offline mid-shift. Endpoints opt in with `throttle_scope` instead - see
    # apps/core/throttling.py for which ones and why those.
    'DEFAULT_THROTTLE_RATES': {
        # Sign-in. 20/minute is far above any human and far below a guessing script.
        'auth_login': '20/min',
        'auth_register': '5/hour',
        # Each attempt mails somebody. Rare by nature, so the limit is tight.
        'auth_password_reset': '5/hour',
        'order_create': '15/min',
        'payment_init': '15/min',
        # The account page re-checks a settling payment every 5 seconds (12/min),
        # so this has to sit comfortably above that to avoid breaking a normal flow.
        'payment_verify': '60/min',
    },
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'Artisanal Reserve Food & Coffee Ordering API',
    'DESCRIPTION': 'Production REST API for menu, orders, cart, manager dashboard, and Chapa payments.',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
}

