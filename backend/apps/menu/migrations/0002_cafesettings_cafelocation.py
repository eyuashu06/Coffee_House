from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('menu', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='CafeSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('cafe_name', models.CharField(default='Buna Hub', max_length=120)),
                ('tagline', models.CharField(default='Artisanal Reserve', max_length=200)),
                ('description', models.TextField(default='An Ethiopian coffee house in Piassa — ceremony buna, slow teas, and a kitchen that stays open late.')),
                ('primary_phone', models.CharField(default='+251 11 555 0148', max_length=50)),
                ('contact_email', models.EmailField(default='selam@bunahub.et', max_length=254)),
                ('opening_hours', models.CharField(default='1:00 – 3:00', max_length=100)),
                ('ceremony_time', models.CharField(default='9:00 (ከቀኑ 9:00)', max_length=100)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Cafe Settings',
                'verbose_name_plural': 'Cafe Settings',
            },
        ),
        migrations.CreateModel(
            name='CafeLocation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(help_text='e.g. Piassa Flagship, Bole Medhanialem Branch', max_length=150)),
                ('address', models.CharField(help_text='e.g. Gulele Road 14, Piassa', max_length=255)),
                ('city', models.CharField(default='Addis Ababa', max_length=100)),
                ('phone', models.CharField(blank=True, default='+251 11 555 0148', max_length=50)),
                ('email', models.EmailField(blank=True, default='selam@bunahub.et', max_length=254)),
                ('opening_hours', models.CharField(default='1:00 – 3:00', max_length=100)),
                ('is_primary', models.BooleanField(default=False, help_text='Primary / Main Branch')),
                ('is_active', models.BooleanField(default=True)),
                ('display_order', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'ordering': ['display_order', '-is_primary', 'id'],
            },
        ),
    ]
