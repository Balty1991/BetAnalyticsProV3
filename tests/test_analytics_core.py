#!/usr/bin/env python3
"""Unit tests for analytics_core.py — formule statistice BetAnalytics Pro.

Rulare locală:
    python -m unittest tests.test_analytics_core -v

Rulare în CI (din rădăcina repo-ului):
    python -m unittest discover -s tests -v
"""
import math
import os
import sys
import unittest

# Permite rularea atât ca modul (python -m unittest tests.test_analytics_core)
# cât și direct (python tests/test_analytics_core.py)
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from analytics_core import (  # noqa: E402
    EloConfig,
    EloRatings,
    blend_probabilities,
    brier_binary,
    calibration_bins,
    clamp,
    decimal_to_implied_probability,
    dixon_coles_tau,
    expected_calibration_error,
    expected_value_decimal,
    football_score_matrix,
    kelly_fraction,
    log_loss_binary,
    normalize_no_vig,
    poisson_market_probabilities,
    poisson_pmf,
    quality_grade,
    safe_float,
)


class TestUtils(unittest.TestCase):
    def test_safe_float_valid_inputs(self):
        self.assertEqual(safe_float(2.5), 2.5)
        self.assertEqual(safe_float("3.14"), 3.14)
        self.assertEqual(safe_float(7), 7.0)

    def test_safe_float_invalid_inputs_return_default(self):
        self.assertEqual(safe_float(None), 0.0)
        self.assertEqual(safe_float(""), 0.0)
        self.assertEqual(safe_float("abc"), 0.0)
        self.assertEqual(safe_float(float("nan")), 0.0)
        self.assertEqual(safe_float(None, default=-1.0), -1.0)

    def test_clamp(self):
        self.assertEqual(clamp(5, 0, 10), 5)
        self.assertEqual(clamp(-3, 0, 10), 0)
        self.assertEqual(clamp(15, 0, 10), 10)
        self.assertEqual(clamp(0.5, 0.0, 1.0), 0.5)


class TestImpliedProbability(unittest.TestCase):
    def test_basic_conversion(self):
        self.assertAlmostEqual(decimal_to_implied_probability(2.0), 0.5)
        self.assertAlmostEqual(decimal_to_implied_probability(4.0), 0.25)
        self.assertAlmostEqual(decimal_to_implied_probability(1.5), 1.0 / 1.5)

    def test_invalid_odds_return_none(self):
        self.assertIsNone(decimal_to_implied_probability(1.0))
        self.assertIsNone(decimal_to_implied_probability(0))
        self.assertIsNone(decimal_to_implied_probability(-2.0))
        self.assertIsNone(decimal_to_implied_probability(None))
        self.assertIsNone(decimal_to_implied_probability(""))


class TestNoVig(unittest.TestCase):
    def test_two_way_balanced_market(self):
        # Cote 2.0/2.0 → fara marja, fair stays 0.5/0.5
        result = normalize_no_vig([2.0, 2.0])
        self.assertAlmostEqual(result[0], 0.5, places=6)
        self.assertAlmostEqual(result[1], 0.5, places=6)

    def test_two_way_with_margin(self):
        # 1.9/1.9 → implied 0.526+0.526 = 1.053 (5.3% margin)
        result = normalize_no_vig([1.9, 1.9])
        self.assertAlmostEqual(result[0], 0.5, places=6)
        self.assertAlmostEqual(sum(result), 1.0, places=6)

    def test_three_way_market_sums_to_one(self):
        result = normalize_no_vig([2.5, 3.4, 2.9])
        valid = [r for r in result if r is not None]
        self.assertEqual(len(valid), 3)
        self.assertAlmostEqual(sum(valid), 1.0, places=6)

    def test_no_vig_strictly_less_than_implied(self):
        # No-vig probability trebuie sa fie mai mica decat implied (e scoasa marja)
        odds = [1.8, 2.1]
        no_vig = normalize_no_vig(odds)
        implied = [1.0 / o for o in odds]
        for nv, imp in zip(no_vig, implied):
            self.assertLess(nv, imp)

    def test_invalid_input_returns_nones(self):
        self.assertEqual(normalize_no_vig([1.0]), [None])
        self.assertEqual(normalize_no_vig([0, 0]), [None, None])
        self.assertEqual(normalize_no_vig([None, None]), [None, None])

    def test_partial_invalid_keeps_valid(self):
        # Daca un odds e invalid, restul trebuie procesat
        result = normalize_no_vig([2.0, 0, 2.0])
        self.assertIsNone(result[1])
        self.assertIsNotNone(result[0])
        self.assertIsNotNone(result[2])


class TestExpectedValue(unittest.TestCase):
    def test_break_even(self):
        # p=0.5, odds=2.0 → EV = 0.5*1 - 0.5 = 0
        self.assertAlmostEqual(expected_value_decimal(0.5, 2.0), 0.0, places=6)

    def test_positive_ev(self):
        # p=0.6, odds=2.0 → EV = 0.6*1 - 0.4 = 0.2
        self.assertAlmostEqual(expected_value_decimal(0.6, 2.0), 0.2, places=6)

    def test_negative_ev(self):
        # p=0.4, odds=2.0 → EV = 0.4*1 - 0.6 = -0.2
        self.assertAlmostEqual(expected_value_decimal(0.4, 2.0), -0.2, places=6)

    def test_high_odds_low_prob(self):
        # p=0.1, odds=12 → EV = 0.1*11 - 0.9 = 0.2
        self.assertAlmostEqual(expected_value_decimal(0.1, 12.0), 0.2, places=6)

    def test_invalid_odds(self):
        self.assertIsNone(expected_value_decimal(0.5, 1.0))
        self.assertIsNone(expected_value_decimal(0.5, 0))


class TestKelly(unittest.TestCase):
    def test_zero_edge_zero_kelly(self):
        # p=0.5, odds=2.0 → b=1, raw=(0.5-0.5)/1 = 0
        self.assertEqual(kelly_fraction(0.5, 2.0, fraction=1.0, cap=1.0), 0.0)

    def test_full_kelly(self):
        # p=0.6, odds=2.0 → b=1, raw=(0.6-0.4)/1 = 0.2
        self.assertAlmostEqual(kelly_fraction(0.6, 2.0, fraction=1.0, cap=1.0), 0.2, places=6)

    def test_quarter_kelly_default(self):
        # p=0.6, odds=2.0, fraction=0.25 → 0.05
        self.assertAlmostEqual(kelly_fraction(0.6, 2.0, fraction=0.25, cap=1.0), 0.05, places=6)

    def test_cap_enforced(self):
        # Cu p=0.95, odds=5.0 ar fi mult > 0.06, dar cap=0.06 limiteaza
        result = kelly_fraction(0.95, 5.0, fraction=1.0, cap=0.06)
        self.assertLessEqual(result, 0.06)
        self.assertAlmostEqual(result, 0.06, places=4)

    def test_default_cap_is_8_percent(self):
        # Cu fraction=1.0 si edge mare, ar trebui sa atinga cap-ul default 0.08
        result = kelly_fraction(0.9, 4.0, fraction=1.0)
        self.assertLessEqual(result, 0.08)

    def test_negative_edge_zero_stake(self):
        # Cand p < 1/odds (no edge) → Kelly trebuie sa fie 0, nu negativ
        self.assertEqual(kelly_fraction(0.3, 2.0), 0.0)

    def test_invalid_odds_zero(self):
        self.assertEqual(kelly_fraction(0.6, 1.0), 0.0)


class TestBrierScore(unittest.TestCase):
    def test_perfect_predictions(self):
        self.assertAlmostEqual(brier_binary([1, 0, 1], [1.0, 0.0, 1.0]), 0.0, places=6)

    def test_calculation(self):
        # ((0.9-1)^2 + (0.1-0)^2 + (0.8-1)^2) / 3 = (0.01+0.01+0.04)/3 = 0.02
        self.assertAlmostEqual(brier_binary([1, 0, 1], [0.9, 0.1, 0.8]), 0.02, places=6)

    def test_worst_predictions(self):
        # Predictie 0% pentru rezultat care s-a intamplat
        self.assertAlmostEqual(brier_binary([1, 1], [0.0, 0.0]), 1.0, places=6)

    def test_empty_returns_none(self):
        self.assertIsNone(brier_binary([], []))


class TestLogLoss(unittest.TestCase):
    def test_near_perfect_predictions_low_loss(self):
        result = log_loss_binary([1, 0, 1], [0.999, 0.001, 0.999])
        self.assertLess(result, 0.01)

    def test_uniform_predictions_equals_ln2(self):
        # Toate p=0.5 → log loss = -log(0.5) = ln(2) ≈ 0.693
        result = log_loss_binary([1, 0, 1, 0], [0.5, 0.5, 0.5, 0.5])
        self.assertAlmostEqual(result, math.log(2), places=4)

    def test_clamping_prevents_inf(self):
        # p=0 si y=1 ar produce -inf fara clamping
        result = log_loss_binary([1], [0.0])
        self.assertIsNotNone(result)
        self.assertTrue(math.isfinite(result))


class TestCalibration(unittest.TestCase):
    def test_bins_have_correct_structure(self):
        bins = calibration_bins(
            [1, 0, 1, 0, 1, 0],
            [0.1, 0.1, 0.5, 0.5, 0.9, 0.9],
            bins=3,
        )
        self.assertEqual(len(bins), 3)
        for b in bins:
            self.assertIn("predicted", b)
            self.assertIn("actual", b)
            self.assertIn("gap", b)
            self.assertIn("n", b)

    def test_perfect_calibration_low_ece(self):
        # 10 esantioane in fiecare bin, perfect calibrate
        y = [1] * 9 + [0] * 1 + [1] * 5 + [0] * 5 + [1] * 1 + [0] * 9
        p = [0.9] * 10 + [0.5] * 10 + [0.1] * 10
        ece = expected_calibration_error(y, p, bins=10)
        self.assertIsNotNone(ece)
        self.assertLess(ece, 0.05)

    def test_miscalibrated_high_ece(self):
        # Predict 0.9 dar realitatea e 0.1 → ECE mare
        y = [0] * 9 + [1] * 1
        p = [0.9] * 10
        ece = expected_calibration_error(y, p, bins=10)
        self.assertIsNotNone(ece)
        self.assertGreater(ece, 0.5)


class TestPoisson(unittest.TestCase):
    def test_pmf_zero_goals(self):
        # P(X=0 | lambda=2) = e^(-2)
        self.assertAlmostEqual(poisson_pmf(2.0, 0), math.exp(-2.0), places=4)

    def test_pmf_normalizes_to_one(self):
        total = sum(poisson_pmf(1.5, k) for k in range(20))
        self.assertAlmostEqual(total, 1.0, places=4)

    def test_dixon_coles_low_score_corrections(self):
        # rho=-0.08 → tau(1,1) = 1+0.08 = 1.08
        self.assertAlmostEqual(dixon_coles_tau(1, 1, 1.5, 1.2, -0.08), 1.08, places=4)

    def test_dixon_coles_high_scores_unchanged(self):
        self.assertEqual(dixon_coles_tau(2, 2, 1.5, 1.2, -0.08), 1.0)
        self.assertEqual(dixon_coles_tau(3, 1, 1.5, 1.2, -0.08), 1.0)

    def test_score_matrix_normalized(self):
        m = football_score_matrix(1.5, 1.0, max_goals=8)
        total = sum(p for row in m for p in row)
        self.assertAlmostEqual(total, 1.0, places=4)

    def test_market_probs_complementary_pairs(self):
        probs = poisson_market_probabilities(1.5, 1.0)
        self.assertAlmostEqual(
            probs["home_win"] + probs["draw"] + probs["away_win"], 1.0, places=2
        )
        self.assertAlmostEqual(probs["over25"] + probs["under25"], 1.0, places=4)
        self.assertAlmostEqual(probs["over15"] + probs["under15"], 1.0, places=4)
        self.assertAlmostEqual(probs["over35"] + probs["under35"], 1.0, places=4)
        self.assertAlmostEqual(probs["btts"] + probs["no_btts"], 1.0, places=4)

    def test_strong_home_team_dominates(self):
        # lambda_home=2.5 vs lambda_away=0.7 → home_win >> away_win
        probs = poisson_market_probabilities(2.5, 0.7)
        self.assertGreater(probs["home_win"], probs["away_win"])
        self.assertGreater(probs["home_win"], probs["draw"])

    def test_market_probs_have_top_scores(self):
        probs = poisson_market_probabilities(1.5, 1.2)
        self.assertIn("most_likely_score", probs)
        self.assertIn("top_correct_scores", probs)
        self.assertGreater(len(probs["top_correct_scores"]), 0)


class TestElo(unittest.TestCase):
    def test_initial_rating_default(self):
        e = EloRatings()
        self.assertEqual(e.rating("A"), 1500.0)

    def test_home_advantage_increases_expected(self):
        e = EloRatings()
        # Echipe egale + home advantage → home > 0.5
        self.assertGreater(e.expected_home("A", "B"), 0.5)

    def test_winner_gains_loser_loses(self):
        e = EloRatings()
        before_a = e.rating("A")
        before_b = e.rating("B")
        e.update("A", "B", 2, 0)
        self.assertGreater(e.rating("A"), before_a)
        self.assertLess(e.rating("B"), before_b)

    def test_zero_sum_property(self):
        e = EloRatings()
        e.update("A", "B", 2, 0)
        # Suma ratingurilor trebuie sa ramana ~ aceeasi (zero-sum)
        self.assertAlmostEqual(e.rating("A") + e.rating("B"), 3000.0, places=2)

    def test_custom_config(self):
        cfg = EloConfig(start_rating=1000.0, k_factor=20.0, home_advantage=100.0)
        e = EloRatings(config=cfg)
        self.assertEqual(e.rating("X"), 1000.0)


class TestBlendProbabilities(unittest.TestCase):
    def test_equal_weights_average(self):
        result = blend_probabilities({"a": 0.6, "b": 0.4}, {"a": 1.0, "b": 1.0})
        self.assertAlmostEqual(result, 0.5, places=6)

    def test_proportional_weighting(self):
        # (0.6*3 + 0.2*1)/(3+1) = 2.0/4 = 0.5
        result = blend_probabilities({"a": 0.6, "b": 0.2}, {"a": 3.0, "b": 1.0})
        self.assertAlmostEqual(result, 0.5, places=6)

    def test_zero_weights_returns_default(self):
        result = blend_probabilities({"a": 0.5}, {"a": 0.0}, default=0.42)
        self.assertEqual(result, 0.42)

    def test_invalid_probabilities_skipped(self):
        # p=-1 si p=2 sunt invalide, doar p=0.5 cu w=1 conteaza
        result = blend_probabilities(
            {"a": -1.0, "b": 2.0, "c": 0.5},
            {"a": 1.0, "b": 1.0, "c": 1.0},
        )
        self.assertAlmostEqual(result, 0.5, places=6)


class TestQualityGrade(unittest.TestCase):
    def test_grade_thresholds(self):
        self.assertEqual(quality_grade(90), "A")
        self.assertEqual(quality_grade(85), "A")
        self.assertEqual(quality_grade(80), "B")
        self.assertEqual(quality_grade(72), "B")
        self.assertEqual(quality_grade(65), "C")
        self.assertEqual(quality_grade(60), "C")
        self.assertEqual(quality_grade(50), "D")
        self.assertEqual(quality_grade(45), "D")
        self.assertEqual(quality_grade(30), "E")
        self.assertEqual(quality_grade(0), "E")

    def test_invalid_input_defaults_to_lowest(self):
        self.assertEqual(quality_grade(None), "E")
        self.assertEqual(quality_grade("abc"), "E")


if __name__ == "__main__":
    unittest.main(verbosity=2)
