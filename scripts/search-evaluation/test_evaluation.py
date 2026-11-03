import unittest
from unittest.mock import patch

from common import configure
from providers import static_matches
from runner import percentile


class EvaluationTests(unittest.TestCase):
    def test_non_experiment_database_is_rejected(self):
        for url in [
            "postgresql://localhost/production",
            "postgresql://example.com/spellbook_search_eval_test",
            "",
        ]:
            with (
                self.subTest(url=url),
                patch.dict("os.environ", {"SEARCH_EVALUATION_DATABASE_URL": url}),
                self.assertRaises(ValueError),
            ):
                configure()

    def test_static_intents_and_accents(self):
        self.assertEqual(static_matches(" PASSWORT ÄNDERN ")[0]["name"], "Password")
        self.assertEqual(static_matches("ubersicht")[0]["name"], "Dashboard")
        self.assertEqual(static_matches("zzqxvnl"), [])

    def test_p95_uses_nearest_rank(self):
        self.assertEqual(percentile([5, 1, 4, 2, 3], 0.95), 5)
        self.assertEqual(percentile([5], 0.95), 5)


if __name__ == "__main__":
    unittest.main()
