import unittest
from metrics import metrics, mcnemar, bootstrap


class MetricsTests(unittest.TestCase):
    def test_binary_metrics(self):
        rows = [{'task_id': str(i), 'agent': 'a', 'human': h, 'prediction': p} for i, (h, p) in enumerate([(1, 1), (1, 0), (0, 1), (0, 0)])]
        result = metrics(rows)
        self.assertEqual(result['accuracy'], 0.5)
        self.assertEqual(result['kappa'], 0)
        self.assertEqual(result['precision'], 0.5)
        self.assertEqual(result['signed_gap'], 0)

    def test_perfect_agreement_and_bootstrap(self):
        rows = [{'task_id': str(i // 2), 'agent': str(i % 2), 'human': i % 2, 'prediction': i % 2, 'o4_mini': i % 2} for i in range(10)]
        self.assertEqual(metrics(rows)['kappa'], 1)
        self.assertEqual(bootstrap(rows, samples=50)['accuracy'], [1, 1])
        self.assertEqual(mcnemar(rows)['exact_p_two_sided'], 1)

    def test_label_two_requires_explicit_mapping(self):
        with self.assertRaises(ValueError):
            metrics([{'human': 2, 'prediction': 1, 'agent': 'a'}])

    def test_mcnemar_uses_discordant_pairs(self):
        rows = [{'human': 1, 'prediction': 1, 'o4_mini': 0} for _ in range(4)]
        result = mcnemar(rows)
        self.assertEqual(result['left_only_correct'], 4)
        self.assertEqual(result['right_only_correct'], 0)
        self.assertEqual(result['exact_p_two_sided'], 0.125)


if __name__ == '__main__':
    unittest.main()
