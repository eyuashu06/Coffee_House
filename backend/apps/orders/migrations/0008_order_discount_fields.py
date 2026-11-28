from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0007_alter_order_estimated_prep_minutes_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='discount_etb',
            field=models.DecimalField(decimal_places=2, default=0.0, max_digits=10),
        ),
        migrations.AddField(
            model_name='order',
            name='promo_title',
            field=models.CharField(blank=True, max_length=150),
        ),
    ]
