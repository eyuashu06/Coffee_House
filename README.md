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

## 🧪 Running Unit Tests

```bash
cd backend
python manage.py test apps
```
