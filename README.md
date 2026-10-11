# Artisanal Reserve | Full-Stack Food & Coffee Ordering Application

Production-ready food and coffee ordering web application tailored for Ethiopian and international users.

## 🛠️ Technology Stack

- **Frontend**: Next.js 14 (App Router), TypeScript, Tailwind CSS, Playfair Display & Manrope typography.
- **Backend API**: Python, Django 5, Django REST Framework, SimpleJWT, `drf-spectacular` (Swagger).
- **Database**: MySQL 8.0 with Django ORM migrations.
- **Payment Gateway**: Chapa (`ETB` currency), Webhook Signature Verification, & Idempotency.
- **Infrastructure**: Docker Compose (`db`, `backend`, `frontend`).

## 🚀 Getting Started with Docker Compose

1. Clone repository & copy environment configuration:
   ```bash
   cp .env.example .env
   # SECRET_KEY must be replaced with your own before anything real is deployed:
   python -c "import secrets; print(secrets.token_urlsafe(64))"
   ```

2. Launch full-stack environment with Docker Compose:
   ```bash
   docker-compose up --build
   ```

3. Access the applications:
   - **Next.js Frontend**: [http://localhost:3000](http://localhost:3000)
   - **Django REST API**: [http://localhost:8000/api/v1/](http://localhost:8000/api/v1/)
   - **Swagger API Documentation**: [http://localhost:8000/api/schema/swagger-ui/](http://localhost:8000/api/schema/swagger-ui/)
   - **Django Admin**: [http://localhost:8000/admin/](http://localhost:8000/admin/)

## 🧾 Configuration

| Variable | What it does |
| --- | --- |
| `SECRET_KEY` | **Required** when `DEBUG` is off. Signs sessions, password-reset tokens and JWTs. The app refuses to boot without it rather than fall back to a value that is public. |
| `DEBUG` | `0` in production. With `DEBUG=1` and no `SECRET_KEY`, one is generated per process (sessions do not survive a restart). |
| `SECURE_SSL` | Set to `1` when the whole site is served over HTTPS. Turns on the HTTPS redirect, HSTS, and Secure-only session/CSRF/JWT cookies. |
| `ORDER_PAYMENT_WINDOW_MINUTES` | How long an unpaid order stays payable (default 30). See "Maintenance jobs" below. |
| `REQUIRE_EMAIL_MX` | Rejects signups whose email domain cannot receive mail. Turn off to allow them. |
| `EXPOSE_PASSWORD_RESET_TOKEN` | Off by default. Turning it on makes every registered account takeable — development only. |

## 🔁 Maintenance jobs

Both commands are idempotent and safe to run repeatedly. The compose file runs them
every five minutes in the background; a real deployment should use system cron or a
task worker.

```bash
python manage.py expire_unpaid_orders     # close orders nobody paid for (FR-P7)
python manage.py reconcile_payments       # settle payments a gateway or a bug left pending
```

`expire_unpaid_orders` asks the payment gateway about any order with a payment still
in flight before closing it, so a customer who pays at the last minute is never
closed out on top of their money.

## 🧪 Running Unit Tests

```bash
cd backend
SECRET_KEY=dev-only python manage.py test apps api
```
