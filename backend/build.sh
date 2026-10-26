#!/usr/bin/env bash
# Exit on error
set -o errexit

pip install --upgrade pip
pip install -r requirements.txt

python manage.py migrate --noinput
python manage.py loaddata fixtures/initial_data.json
python manage.py seed_data
python manage.py collectstatic --noinput
