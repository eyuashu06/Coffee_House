#!/usr/bin/env bash
# Exit on error
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

python manage.py migrate --noinput

# When deploying to a fresh database (e.g., new Neon DB), bootstrap from full production backup
python -c "
import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'coffee_project.settings')
django.setup()
from django.contrib.auth import get_user_model
from django.core.management import call_command
User = get_user_model()
if not User.objects.exists():
    print('Empty database detected. Restoring complete production data fixture...')
    call_command('loaddata', 'fixtures/complete_backup.json')
    print('Complete production data restored successfully.')
else:
    print('Existing database with registered records detected; skipping initial fixture reload.')
" || true

# Idempotently ensure restaurant settings, menu, and default staff credentials
python manage.py seed_data

# Ensure PostgreSQL auto-increment sequences are synchronized to avoid primary key conflicts
python manage.py reset_sequences

python manage.py collectstatic --noinput
