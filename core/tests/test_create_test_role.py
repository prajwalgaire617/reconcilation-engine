from django.test import TestCase
from core.test_helpers import create_test_role
from core.models import Role

class CreateTestRoleTest(TestCase):
    def test_create_test_role_success(self):
        perm_names = ["gql_query_roles_perms"]
        role = create_test_role(perm_names=perm_names, name="TestRoleSuccess")
        self.assertIsNotNone(role)
        self.assertEqual(role.name, "TestRoleSuccess")

    def test_create_test_role_failure(self):
        perm_names = ["invalid_permission_name"]
        with self.assertRaises(Exception) as cm:
            create_test_role(perm_names=perm_names, name="TestRoleFailure")
        self.assertEqual(str(cm.exception), "Permission invalid_permission_name not found")
