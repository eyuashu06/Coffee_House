FROM python:3.12-slim

WORKDIR /app

# Install system dependencies required for MySQL client and compilation
RUN apt-get update && apt-get install -y \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1 \
    RENDER=true \
    PORT=8000

EXPOSE 8000

CMD ["sh", "-c", "python manage.py migrate --noinput && python -c \"import os, django; os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'coffee_project.settings'); django.setup(); from django.contrib.auth import get_user_model; from django.core.management import call_command; User = get_user_model(); User.objects.exists() or (print('Bootstrapping full data into Neon...') or call_command('loaddata', 'fixtures/complete_backup.json'))\" || true && python manage.py seed_data && python manage.py reset_sequences && python manage.py collectstatic --noinput && exec gunicorn coffee_project.wsgi:application --bind 0.0.0.0:${PORT:-8000}"]
