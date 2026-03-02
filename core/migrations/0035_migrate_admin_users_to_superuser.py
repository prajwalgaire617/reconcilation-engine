# Generated manually for migrating admin users to superuser

from django.db import migrations, models
from core.utils import filter_validity, uuidv7


def migrate_admin_users_to_superuser(apps, schema_editor):
    InteractiveUser = apps.get_model('core', 'InteractiveUser')
    User = apps.get_model('core', 'User')

    admin_iusers = InteractiveUser.objects.filter(
        *filter_validity(),
        *filter_validity(prefix="user_roles__"),
        *filter_validity(prefix="user_roles__role__"),
        user_roles__role__is_system=64
    ).distinct()

    for iu in admin_iusers:
        user, created = User.objects.update_or_create(
            i_user=iu,
            defaults={"username": iu.login_name},
        )
        user.is_superuser = True
        user.save()


def reverse_migrate_admin_users_to_superuser(apps, schema_editor):
    # Reverse would be to set is_superuser=False for all users, but that's not precise
    # Since this is a one-time migration, no reverse needed
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0034_remove_user_legacy_id_remove_user_validity_from_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='is_superuser',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="historicaluser",
            name="is_superuser",
            field=models.BooleanField(default=False),
        ),
        migrations.AlterField(
            model_name="historicalinteractiveuser",
            name="uuid",
            field=models.UUIDField(
                db_column="UUID",
                db_index=True,
                default=uuidv7,
                editable=False,
            ),
        ),
        migrations.AlterField(
            model_name="interactiveuser",
            name="uuid",
            field=models.UUIDField(
                db_column="UUID", default=uuidv7, editable=False, unique=True
            ),
        ),
        migrations.RunPython(
            migrate_admin_users_to_superuser,
            reverse_migrate_admin_users_to_superuser,
        ),
    ]
