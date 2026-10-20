#!/usr/bin/env bash
# Exit on error
set -o errexit

# Install dependencies
pip install -r requirements.txt

# Collect static files with WhiteNoise
python manage.py collectstatic --no-input

# Apply database migrations
python manage.py migrate

# Seed initial restaurant settings, menu, delivery zones, and default accounts
python manage.py seed_data

