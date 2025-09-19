import unittest
from core.custom_filters import CustomFilterWizardInterface, CustomFilterRegistryPoint


class DummyCustomFilterA(CustomFilterWizardInterface):
    pass


class DummyCustomFilterB(CustomFilterWizardInterface):
    pass


class TestCustomFilterRegistryPoint(unittest.TestCase):

    def setUp(self):
        # Clear registry before each test
        CustomFilterRegistryPoint.REGISTERED_CUSTOM_FILTER_WIZARDS.clear()

    def test_register_single_filter(self):
        CustomFilterRegistryPoint.register_custom_filters(
            "test_module", [DummyCustomFilterA]
        )

        registered = CustomFilterRegistryPoint.REGISTERED_CUSTOM_FILTER_WIZARDS
        self.assertIn("test_module", registered)
        self.assertEqual(len(registered["test_module"]), 1)
        self.assertEqual(
            registered["test_module"][0]["class_reference"], DummyCustomFilterA
        )

    def test_register_multiple_filters(self):
        CustomFilterRegistryPoint.register_custom_filters(
            "test_module", [DummyCustomFilterA, DummyCustomFilterB]
        )

        registered = CustomFilterRegistryPoint.REGISTERED_CUSTOM_FILTER_WIZARDS[
            "test_module"
        ]
        self.assertEqual(len(registered), 2)
        self.assertCountEqual(
            [entry["class_reference"] for entry in registered],
            [DummyCustomFilterA, DummyCustomFilterB],
        )

    def test_register_overwrites_duplicate_class(self):
        # First registration
        CustomFilterRegistryPoint.register_custom_filters(
            "test_module", [DummyCustomFilterA]
        )
        # Simulate re-registering DummyCustomFilterA (e.g., on reload)
        CustomFilterRegistryPoint.register_custom_filters(
            "test_module", [DummyCustomFilterA]
        )

        registered = CustomFilterRegistryPoint.REGISTERED_CUSTOM_FILTER_WIZARDS[
            "test_module"
        ]
        self.assertEqual(len(registered), 1)
        self.assertEqual(registered[0]["class_reference"], DummyCustomFilterA)

    def test_register_same_class_in_different_modules(self):
        CustomFilterRegistryPoint.register_custom_filters(
            "module_a", [DummyCustomFilterA]
        )
        CustomFilterRegistryPoint.register_custom_filters(
            "module_b", [DummyCustomFilterA]
        )

        registered = CustomFilterRegistryPoint.REGISTERED_CUSTOM_FILTER_WIZARDS
        self.assertIn("module_a", registered)
        self.assertIn("module_b", registered)
        self.assertEqual(len(registered["module_a"]), 1)
        self.assertEqual(len(registered["module_b"]), 1)
        self.assertEqual(registered["module_a"][0]["module"], "module_a")
        self.assertEqual(registered["module_b"][0]["module"], "module_b")
