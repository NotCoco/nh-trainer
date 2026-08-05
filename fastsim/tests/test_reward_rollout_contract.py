"""Java neural-sparse reward, prayer-label, and episode-boundary contracts."""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import engine, schema  # noqa: E402


class OneSidedMage:
    input_size = schema.INPUT_SIZE

    def score(self, inputs):
        n = len(inputs)
        scores = np.zeros((n, schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 100.0
        scores[:, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = 100.0
        scores[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MAGIC] = 100.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        attack = (
            schema.COMBAT_BASE + schema.COMBAT_ATTACK_BASE
            + schema.STYLE_MAGIC * 2 + schema.ATTACK_INTENT_ATTACK)
        scores[0::2, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 0.0
        scores[0::2, attack] = 200.0
        return scores, np.zeros(n, dtype=np.float32)


class RestoreChooser:
    input_size = schema.INPUT_SIZE

    def score(self, inputs):
        n = len(inputs)
        scores = np.zeros((n, schema.ACTION_COUNT), dtype=np.float32)
        scores[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 100.0
        scores[:, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = 100.0
        scores[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MAGIC] = 100.0
        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        scores[
            :, schema.SUPPLY_BASE + schema.SUPPLY_RESTORE_REBOOST] = 100.0
        return scores, np.zeros(n, dtype=np.float32)


def test_nonterminal_scalar_reward_is_zero_but_reward_inputs_advance():
    eng = engine.Engine(
        1, OneSidedMage(), seed=41, epsilon=0.0, max_ticks=20,
        start_distance_min=4, start_distance_max=4)
    eng.step()                 # launch tick zero
    first = eng.step()         # tick-zero row, now with tick-one next_input

    assert not first.done.any()
    assert (first.reward == 0.0).all(), (
        "Java exports causal non-terminal reward through .nhev, not reward_raw")
    assert first.next_inputs[0, schema.INPUT_REWARD_DELTA] > 0.0
    assert first.next_inputs[1, schema.INPUT_REWARD_DELTA] < 0.0
    assert first.next_inputs[0, schema.INPUT_REWARD_TOTAL] > 0.0
    assert first.next_inputs[1, schema.INPUT_REWARD_TOTAL] < 0.0


def test_roll_prayer_teacher_targets_the_previous_defender_decision():
    eng = engine.Engine(
        1, OneSidedMage(), seed=42, epsilon=0.0, max_ticks=20,
        start_distance_min=4, start_distance_max=4)
    completed = []
    for _ in range(8):
        record = eng.step()
        if record is not None:
            completed.append(record)

    labelled = [
        record for record in completed
        if record.roll_prayer_teacher_action[1] >= 0]
    assert labelled, "a later barrage never labelled its pre-roll prayer decision"
    assert all(
        record.roll_prayer_teacher_action[1]
        == schema.DEFENCE_BASE + schema.PRAY_PROTECT_MAGIC
        for record in labelled)
    assert all(
        record.roll_prayer_teacher_attack_style_code[1] == 3
        for record in labelled)
    assert all(
        record.roll_prayer_teacher_action[0] == -1
        for record in labelled), "the label was attached to the attacker"


def test_roll_time_tank_reward_is_booked_by_an_engine_attack_and_clipped():
    eng = engine.Engine(
        1, OneSidedMage(), seed=44, epsilon=0.0, max_ticks=20,
        start_distance_min=4, start_distance_max=4)
    for _ in range(5):
        eng.step()

    pending = eng.state.pending_roll_tank_gear_reward.copy()
    assert pending[0, 0] == 0.0, "tank reward was attached to the attacker"
    assert pending[0, 1] < -engine.REWARD_ROLL_TANK_MAX_PENALTY, (
        "the second real barrage did not run the roll-time tank plan")

    # Isolate the aggregate clip while still consuming it through Engine.step.
    eng.state.pending_expected_reward[:] = 0.0
    eng.state.pending_roll_prayer_reward[:] = 0.0
    eng.state.pending_freeze_reward[:] = 0.0
    eng.state.recent_damage_window[:] = 0
    eng.state.recent_taken_window[:] = 0
    eng.state.last_dealt_hit[:] = 0
    eng.state.last_taken_hit[:] = 0
    eng.step()

    assert np.isclose(
        eng.state.reward_delta[0, 1],
        -engine.REWARD_ROLL_TANK_MAX_PENALTY)
    assert eng.state.pending_roll_tank_gear_reward[0, 1] == 0.0


def test_first_attack_uses_same_tick_tank_but_excludes_delayed_prayer():
    eng = engine.Engine(
        1, OneSidedMage(), seed=45, epsilon=0.0, max_ticks=20,
        start_distance_min=4, start_distance_max=4)
    eng.step()

    assert eng.state.pending_roll_tank_gear_reward[0, 0] == 0.0
    assert eng.state.pending_roll_tank_gear_reward[0, 1] != 0.0
    assert eng.state.pending_roll_prayer_reward[0, 0] == 0.0
    assert eng.state.pending_roll_prayer_reward[0, 1] == 0.0

    first = eng.step()
    assert first.tank_gear_teacher_action_count[1] > 0


def test_reset_episode_has_one_locked_decision_and_stable_bot_ids():
    eng = engine.Engine(
        2, RestoreChooser(), seed=43, epsilon=0.0, max_ticks=2,
        episodes_per_lane=2, start_distance_min=4, start_distance_max=4)
    eng.step()                 # episode 1, age 0
    eng.step()                 # episode 1, terminal age 1
    terminal = eng.step()      # reset + episode 2 age 0 decision

    assert terminal.done.all()
    assert eng.state.episode_id.min() == 2
    assert (eng.state.bastion_doses == 4).all(), (
        "the locked reset decision consumed the freshly restored potion")

    reset_age_zero = eng.step()
    assert (reset_age_zero.episode_id == 2).all()
    assert (reset_age_zero.episode_tick == 0).all()
    assert np.array_equal(
        reset_age_zero.bot_index,
        np.array([1, 2, 3, 4], dtype=np.int32))
    assert (
        reset_age_zero.vengeance_trinket_blocker_mask & (1 << 6)
    ).all(), "the reset teleport did not expose Java's LOCKED blocker"
    assert not reset_age_zero.vengeance_trinket_legal.any()
    assert not reset_age_zero.legal_mask[
        :, schema.MOVEMENT_BASE + 1:
        schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT].any()


def test_terminal_transition_has_zero_next_observation():
    eng = engine.Engine(
        1, RestoreChooser(), seed=46, epsilon=0.0, max_ticks=1,
        start_distance_min=4, start_distance_max=4)
    eng.step()
    terminal = eng.flush()
    assert terminal.done.all()
    assert np.count_nonzero(terminal.next_inputs) == 0


if __name__ == "__main__":
    failures = 0
    for name, function in sorted(globals().items()):
        if name.startswith("test_") and callable(function):
            try:
                function()
                print(f"  ok   {name}")
            except AssertionError as error:
                failures += 1
                print(f"  FAIL {name}: {error}")
    print("reward rollout contract:", "OK" if failures == 0 else f"{failures} FAILED")
    raise SystemExit(1 if failures else 0)
