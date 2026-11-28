from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0004_alter_menuitem_prep_minutes'),
    ]

    operations = [
        migrations.AddField(
            model_name='cafesettings',
            name='hero_slides',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='cafesettings',
            name='dining_slides',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
