"""Credit-assignment checks for the risk-fight trainer: undiscounted GAE, the
scaled value target, and the critic's explained variance. No bridge, no CUDA."""
from __future__ import annotations

from pathlib import Path
import sys
import unittest

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from train_riskfight_browser_cuda import VALUE_SCALE, explained_variance, generalized_advantages


def rollout(rewards, values, dones, trainable=None):
    rewards = np.asarray(rewards, dtype=np.float32)
    data = {
        "rewards": rewards,
        "values": np.asarray(values, dtype=np.float32) / VALUE_SCALE,
        "dones": np.asarray(dones, dtype=bool),
        "trainable": np.ones_like(rewards, dtype=bool) if trainable is None else np.asarray(trainable, dtype=bool),
    }
    returns = np.zeros_like(rewards)
    running = np.zeros(rewards.shape[1], dtype=np.float32)
    for tick in range(len(rewards) - 1, -1, -1):
        running = rewards[tick] + running * (~data["dones"][tick])
        returns[tick] = running
    data["returns"] = returns
    return data


class GeneralizedAdvantageTest(unittest.TestCase):
    def test_lambda_one_without_a_critic_reproduces_the_monte_carlo_return(self):
        # The old behaviour is the lambda=1, V=0 corner, so the change is a
        # strict generalization of what earlier runs optimized.
        data = rollout([[1.0], [2.0], [100.0]], [[0.0], [0.0], [0.0]], [[False], [False], [True]])
        advantages = generalized_advantages(data, 1.0)["advantages"]
        np.testing.assert_allclose(advantages[:, 0], data["returns"][:, 0], rtol=1e-6)

    def test_lambda_localizes_a_dense_reward(self):
        # A reward three ticks before the end must not arrive at full strength
        # at the first tick, which is exactly what smeared Monte-Carlo credit did.
        data = rollout([[0.0], [0.0], [4.0]], [[0.0], [0.0], [0.0]], [[False], [False], [True]])
        advantages = generalized_advantages(data, 0.5)["advantages"]
        np.testing.assert_allclose(advantages[:, 0], [1.0, 2.0, 4.0], rtol=1e-6)

    def test_matches_a_hand_computed_series_with_a_live_critic(self):
        values = [[10.0], [20.0], [30.0]]
        data = rollout([[1.0], [2.0], [50.0]], values, [[False], [False], [True]])
        advantages = generalized_advantages(data, 0.9)["advantages"]
        delta = [1.0 + 20.0 - 10.0, 2.0 + 30.0 - 20.0, 50.0 - 30.0]
        expected = [0.0, 0.0, delta[2]]
        expected[1] = delta[1] + 0.9 * expected[2]
        expected[0] = delta[0] + 0.9 * expected[1]
        np.testing.assert_allclose(advantages[:, 0], expected, rtol=1e-5)

    def test_no_advantage_crosses_a_finished_fight(self):
        # Column 0 ends at tick 1 and then sits idle; its later rows are not
        # trainable and must contribute nothing, and the long fight in column 1
        # must not inherit anything from it.
        data = rollout(
            [[5.0, 1.0], [100.0, 1.0], [0.0, 100.0]],
            [[10.0, 10.0], [20.0, 10.0], [0.0, 40.0]],
            [[False, False], [True, False], [True, True]],
        )
        result = generalized_advantages(data, 0.9)
        self.assertEqual(result["advantages"][2, 0], 0.0)
        self.assertAlmostEqual(float(result["advantages"][1, 0]), 100.0 - 20.0, places=4)
        self.assertAlmostEqual(float(result["advantages"][2, 1]), 100.0 - 40.0, places=4)

    def test_value_target_is_the_advantage_plus_the_current_value_in_scaled_space(self):
        data = rollout([[1.0], [2.0], [50.0]], [[10.0], [20.0], [30.0]], [[False], [False], [True]])
        result = generalized_advantages(data, 0.9)
        np.testing.assert_allclose(
            result["value_targets"][:, 0],
            (result["advantages"][:, 0] + np.asarray([10.0, 20.0, 30.0])) / VALUE_SCALE,
            rtol=1e-5,
        )

    def test_a_ko_sized_target_stays_small_enough_for_the_critic_to_travel(self):
        data = rollout([[0.0], [0.0], [100.0]], [[0.0], [0.0], [0.0]], [[False], [False], [True]])
        targets = generalized_advantages(data, 0.95)["value_targets"]
        self.assertLessEqual(float(np.abs(targets).max()), 4.0)


class ExplainedVarianceTest(unittest.TestCase):
    def test_a_perfect_critic_reads_one(self):
        data = rollout([[1.0], [2.0], [50.0]], [[0.0], [0.0], [0.0]], [[False], [False], [True]])
        data.update(generalized_advantages(data, 0.95))
        data["values"] = data["value_targets"].copy()
        self.assertAlmostEqual(explained_variance(data), 1.0, places=5)

    def test_a_dead_critic_reads_about_zero(self):
        data = rollout([[1.0], [2.0], [50.0]], [[0.0], [0.0], [0.0]], [[False], [False], [True]])
        data.update(generalized_advantages(data, 0.95))
        self.assertLess(abs(explained_variance(data)), 1e-9)

    def test_only_trainable_rows_are_scored(self):
        data = rollout(
            [[1.0, 9.0], [2.0, 9.0], [50.0, 9.0]],
            [[0.0, 0.0], [0.0, 0.0], [0.0, 0.0]],
            [[False, False], [False, False], [True, True]],
            trainable=[[True, False], [True, False], [True, False]],
        )
        data.update(generalized_advantages(data, 0.95))
        data["values"] = np.where(data["trainable"], data["value_targets"], 0.0).astype(np.float32)
        self.assertAlmostEqual(explained_variance(data), 1.0, places=5)


if __name__ == "__main__":
    unittest.main()
