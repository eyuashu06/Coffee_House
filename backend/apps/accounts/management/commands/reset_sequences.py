from django.core.management.base import BaseCommand
from django.db import connection
from django.apps import apps
from django.core.management.color import no_style


class Command(BaseCommand):
    help = 'Safely resets primary key sequences in PostgreSQL to prevent unique key / ID collision errors after data loads.'

    def handle(self, *args, **options):
        if connection.vendor != 'postgresql':
            self.stdout.write('Database engine is not PostgreSQL; skipping sequence reset.')
            return

        self.stdout.write('Resetting PostgreSQL sequences across all installed models...')
        commands = connection.ops.sequence_reset_sql(no_style(), apps.get_models())
        if not commands:
            self.stdout.write('No sequences needed resetting.')
            return

        with connection.cursor() as cursor:
            for sql in commands:
                cursor.execute(sql)

        self.stdout.write(self.style.SUCCESS(f'✔ Successfully reset {len(commands)} PostgreSQL sequence(s).'))
