from django.db import migrations
from core.utils import migrate_from_versioned_to_history
import logging

logger = logging.getLogger(__name__)


def empty_tbl_logins(apps, schema_editor):
    """
    Empty the tblLogins table using raw SQL with error handling.
    """
    try:
        with schema_editor.connection.cursor() as cursor:
            # PostgreSQL: Use DO block for error handling
            cursor.execute('DELETE FROM "tblLogins" WHERE 1=1')
            logger.info("Successfully emptied tblLogins")
    except Exception as e:
        logger.error(f"Error emptying tblLogins: {e}")


def run_migrate_to_history(apps, schema_editor):
    """
    Run the migrate_to_history function to move InteractiveUser records
    with non-null validity_to to the history table.
    """
    InteractiveUser = apps.get_model('core', 'InteractiveUser')
    HistoryInteractiveUser = apps.get_model('core', 'HistoricalInteractiveUser')
    UserDistrict = apps.get_model('location', 'UserDistrict')
    UserRole = apps.get_model('core', 'UserRole')
    # Find InteractiveUser records with non-null validity_to
    invalid_users = InteractiveUser.objects.filter(validity_to__isnull=False)
    invalid_user_ids = invalid_users.values_list('id', flat=True)
    UserRole.objects.filter(user_id__in=invalid_user_ids).delete()
    UserDistrict.objects.filter(user_id__in=invalid_user_ids).delete()

    empty_tbl_logins(apps, schema_editor)
    result = migrate_from_versioned_to_history(InteractiveUser, HistoryInteractiveUser)
    print(result)  # Output the result of the migration for logging


class Migration(migrations.Migration):
    # tblLogins might need to be emptied first

    dependencies = [
         ("core", "0032_remove_interactiveuser_legacy_id_and_more"),
    ]

    operations = [
        migrations.RunPython(
            code=run_migrate_to_history,
            reverse_code=migrations.RunPython.noop,
        ),
    ]
