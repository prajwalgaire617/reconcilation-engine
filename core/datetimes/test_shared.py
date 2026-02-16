from django.test import TestCase
from .shared import datetimedelta


class SharedDatetimedeltaTest(TestCase):

    def test_abs(self):
        delta = datetimedelta(days=-7)
        self.assertEqual(abs(delta), datetimedelta(days=7))

        delta = datetimedelta(months=-7, days=-2)
        self.assertEqual(abs(delta), datetimedelta(months=7, days=2))

        delta = datetimedelta(years=-7, days=-3)
        self.assertEqual(abs(delta), datetimedelta(years=7, days=3))

        delta = datetimedelta(years=7, months=5, days=-3)
        self.assertEqual(abs(delta), datetimedelta(years=7, months=5, days=-3))

    def test_add_sub(self):
        d1 = datetimedelta(days=7)
        d2 = datetimedelta(days=5)
        self.assertEqual(datetimedelta(days=12), d1 + d2)
        self.assertEqual(datetimedelta(days=2), d1 - d2)

        self.assertEqual(datetimedelta(days=7), +d1)
        self.assertEqual(datetimedelta(days=-7), -d1)

    def test_le_lt_ge_gt(self):
        self.assertTrue(datetimedelta(days=1) < datetimedelta(days=2))
        self.assertTrue(datetimedelta(days=1) <= datetimedelta(days=2))
        self.assertTrue(datetimedelta(days=2) > datetimedelta(days=1))
        self.assertTrue(datetimedelta(days=2) >= datetimedelta(days=1))

    def test_hash(self):
        self.assertNotEqual(hash(datetimedelta(days=2)), -1)

    def test_bool(self):
        self.assertTrue(datetimedelta(days=2))
        self.assertTrue(datetimedelta(weeks=2))
