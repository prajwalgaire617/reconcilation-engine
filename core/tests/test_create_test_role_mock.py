import unittest
from unittest.mock import patch, MagicMock
import sys
import os


from django.conf import settings


from core.test_helpers import create_test_role


class CreateTestRoleMockTest(unittest.TestCase):
    @patch('core.test_helpers.collect_all_gql_permissions')
    @patch('core.test_helpers.Role')
    @patch('core.test_helpers.RoleRight')
    def test_create_test_role_success(self, MockRoleRight, MockRole, mock_collect_perms):
        # Setup mocks
        mock_collect_perms.return_value = {
            'app1': {'perm1': [1], 'perm2': [2]}
        }
        MockRole.objects.filter.return_value.first.return_value = None
        mock_role_instance = MagicMock()
        MockRole.objects.create.return_value = mock_role_instance

        # Call function
        role = create_test_role(perm_names=['perm1'], name="TestRole")

        # Assertions
        self.assertEqual(role, mock_role_instance)
        MockRole.objects.create.assert_called_once()
        MockRoleRight.objects.create.assert_called_once()

    @patch('core.test_helpers.collect_all_gql_permissions')
    @patch('core.test_helpers.Role')
    def test_create_test_role_failure(self, MockRole, mock_collect_perms):
        # Setup mocks
        mock_collect_perms.return_value = {
            'app1': {'perm1': [1]}
        }
        MockRole.objects.filter.return_value.first.return_value = None

        # Call function and expect exception
        with self.assertRaises(Exception) as cm:
            create_test_role(perm_names=['invalid_perm'], name="TestRole")

        self.assertEqual(str(cm.exception), "Permission invalid_perm not found")


if __name__ == '__main__':
    unittest.main()
