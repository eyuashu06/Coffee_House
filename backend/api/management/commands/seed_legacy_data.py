from django.core.management.base import BaseCommand
from api.seed_data import run_seed

class Command(BaseCommand):
    help = (
        'Seeds the legacy single-origin micro-lot coffees and RAG knowledge base. '
        'Named seed_legacy_data rather than seed_data: two apps both provided a '
        '"seed_data" command and Django resolved only one of them, so whichever lost '
        'silently never ran.'
    )

    def handle(self, *args, **options):
        run_seed()
        self.stdout.write(self.style.SUCCESS('Successfully seeded database!'))
