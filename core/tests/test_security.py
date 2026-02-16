from django.test import TestCase
from core.security import ObjectPermissions
from core.models import ModuleConfiguration


class ObjectPermissionsTest(TestCase):
    def test_perms_map(self):
        perms = ObjectPermissions()
        self.assertEqual(
            ["core.view_moduleconfiguration"],
            perms.get_required_object_permissions("GET", ModuleConfiguration),
        )
        self.assertEqual(
            ["core.add_moduleconfiguration"],
            perms.get_required_object_permissions("POST", ModuleConfiguration),
        )
        self.assertEqual(
            ["core.change_moduleconfiguration"],
            perms.get_required_object_permissions("PUT", ModuleConfiguration),
        )
        self.assertEqual(
            ["core.change_moduleconfiguration"],
            perms.get_required_object_permissions("PATCH", ModuleConfiguration),
        )
        self.assertEqual(
            ["core.delete_moduleconfiguration"],
            perms.get_required_object_permissions("DELETE", ModuleConfiguration),
        )
