from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0005_cafesettings_homepage_slides'),
    ]

    operations = [
        migrations.CreateModel(
            name='PromotionalEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=150)),
                ('subtitle', models.TextField(blank=True)),
                ('badge_text', models.CharField(blank=True, help_text='e.g. 20% OFF, LIVE EVENT, WEEKEND SPECIAL', max_length=40)),
                ('kind', models.CharField(choices=[('EVENT', 'Event'), ('DISCOUNT', 'Discount Offer'), ('AD', 'Announcement / Ad')], default='EVENT', max_length=20)),
                ('discount_percent', models.PositiveIntegerField(default=0, help_text='0 for announcement/event only, or 1–90 for a percentage order discount.')),
                ('promo_code', models.CharField(blank=True, help_text='Optional code (e.g. BUNA15). Leave blank to auto-apply when active.', max_length=40)),
                ('min_order_etb', models.DecimalField(decimal_places=2, default=0.0, max_digits=10)),
                ('cta_label', models.CharField(blank=True, default='Order Now', max_length=60)),
                ('cta_href', models.CharField(blank=True, default='#menu', max_length=200)),
                ('image_url', models.TextField(blank=True, help_text='Optional banner image URL or compressed image data URI')),
                ('starts_at', models.DateTimeField(blank=True, null=True)),
                ('ends_at', models.DateTimeField(blank=True, null=True)),
                ('is_active', models.BooleanField(db_index=True, default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['-is_active', '-created_at'],
            },
        ),
    ]
