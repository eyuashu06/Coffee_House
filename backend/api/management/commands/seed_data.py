from django.core.management.base import BaseCommand
from api.seed_data import run_seed

class Command(BaseCommand):
    help = 'Seeds the database with single-origin micro-lot coffees and RAG knowledge base'

    def handle(self, *args, **options):
        run_seed()
        self.stdout.write(self.style.SUCCESS('Successfully seeded database!'))
