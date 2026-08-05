"""Food, brews, sanfew and prayer drain — the numbers, and the caps.

All of these were estimates before. They decide how long a fight lasts and how
much a brew is worth, so being "about right" is not good enough: a brew that
tops out at 99 instead of 115 is a different game.

Sources, all in the server:
    Consumable.java     what each item does
    Stat.java           what boost / restore / drain actually mean
    PlayerPrayer.java   the drain counter
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import actions, engine, observation, schema, state  # noqa: E402


class Chooser:
    """Forces one supply action every tick and otherwise stands still."""

    def __init__(self, supply):
        self.supply = supply
        self.input_size = schema.INPUT_SIZE

    def score(self, inputs):
        n = inputs.shape[0]
        s = np.zeros((n, schema.ACTION_COUNT), dtype=np.float32)
        s[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 100.0
        s[:, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = 100.0
        s[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        s[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MELEE] = 100.0
        s[:, schema.SUPPLY_BASE + self.supply] = 100.0
        return s, np.zeros(n, dtype=np.float32)


def _engine(supply=schema.SUPPLY_NONE, n_fights=8):
    eng = engine.Engine(n_fights=n_fights, policy=Chooser(supply), seed=3,
                        epsilon=0.0, max_ticks=500)
    eng.state.x[:, 1] = 6          # apart, so nobody is fighting
    eng.state.prev_x = eng.state.x.copy()
    return eng


def test_a_brew_heals_sixteen_and_can_reach_one_one_five():
    """Stat.boost(2, 0.15) on a 99 base is +16, capped at 99 + 16."""
    eng = _engine(schema.SUPPLY_BREW_ONLY)
    s = eng.state
    # The NH decision runs before this tick's processHits. Feed the risk gate
    # with the impact consumed at the previous decision, then brew from 90.
    s.hp[:] = 90
    s.brew_count[:] = 10
    s.last_taken_hit[:] = 30

    eng.step()
    assert (s.hp[:, 0] == 106).all(), f"expected 90 + 16 = 106, got {s.hp[0, 0]}"

    brew_action = np.full(
        eng.n_fights * 2,
        schema.SUPPLY_BASE + schema.SUPPLY_BREW_ONLY,
        dtype=np.int32)
    doses_after_first = s.brew_count.copy()
    eng._apply_supply(brew_action)
    assert np.array_equal(s.brew_count, doses_after_first), (
        "Consumable.potDelay allowed a second potion on the same tick")

    for _ in range(state.POT_DELAY):
        eng._advance_timers()
    eng._apply_supply(brew_action)
    assert (s.hp[:, 0] == 115).all(), (
        f"second brew should cap at 115, got {s.hp[0, 0]}")

    doses_after_second = s.brew_count.copy()
    eng._apply_supply(brew_action)
    assert (s.hp[:, 0] == 115).all(), "a third brew pushed past the cap"
    assert np.array_equal(s.brew_count, doses_after_second), (
        "the potion timer did not block the immediate third attempt")


def test_a_brew_boosts_defence_and_drains_the_rest():
    """Defence boost(2, 0.20) = +21; attack/strength/ranged/magic drain(0.10)
    = -9 each. The trade is the point of the item."""
    eng = _engine(schema.SUPPLY_BREW_ONLY)
    s = eng.state
    s.hp[:] = 90
    s.brew_count[:] = 10
    s.last_taken_hit[:] = 30
    eng.step()

    assert (s.defence_level[:, 0] == 120).all(), (
        f"expected 99 + 21 = 120, got {s.defence_level[0, 0]}")
    for name, stat in (("attack", s.attack_level), ("strength", s.strength_level),
                       ("ranged", s.ranged_level), ("magic", s.magic_level)):
        assert (stat[:, 0] == 90).all(), (
            f"{name} should be 99 - 9 = 90, got {stat[0, 0]}")


def test_a_brew_never_drags_you_back_down():
    """Stat.boost only applies `if(currentLevel <= boostedLevel)`, so brewing
    at 118 must not pull you to 115."""
    eng = _engine(schema.SUPPLY_BREW_ONLY)
    s = eng.state
    s.hp[:] = 118
    s.brew_count[:] = 10
    s.last_taken_hit[:] = 30
    eng.step()
    assert (s.hp[:, 0] == 118).all(), f"brew reduced health to {s.hp[0, 0]}"


def test_food_stops_at_ninety_nine():
    """Manta ray goes through incrementHp, which clamps at the base level -
    only brews and the anglerfish go above it."""
    eng = _engine(schema.SUPPLY_SAFE_EAT)
    s = eng.state
    s.hp[:] = 90
    s.food_count[:] = 10
    s.last_taken_hit[:] = 30
    eng.step()
    assert (s.hp[:, 0] == 99).all(), f"expected a cap at 99, got {s.hp[0, 0]}"


def test_eating_pushes_the_next_attack_further_out():
    """Combat.delayAttack adds to the window rather than replacing it."""
    eng = _engine(schema.SUPPLY_SAFE_EAT)
    s = eng.state
    s.food_count[:] = 10
    s.hp[:] = 50
    s.attack_delay[:] = 4
    before = s.attack_delay[:, 0].copy()
    eng.step()
    # One tick of countdown happened first, then eating added 3.
    assert (s.attack_delay[:, 0] == before - 1 + state.FOOD_EAT_DELAY).all(), (
        f"expected {before[0] - 1 + state.FOOD_EAT_DELAY}, got {s.attack_delay[0, 0]}")


def test_selected_supply_stays_legal_while_consumable_timer_blocks_execution():
    eng = _engine(schema.SUPPLY_SAFE_EAT)
    s = eng.state
    s.hp[:] = 40
    s.food_count[:] = 10
    eng.step()
    count_after_first = s.food_count.copy()

    legal = actions.compute(s, eng.gear_tables).mask
    assert legal[
        :, schema.SUPPLY_BASE + schema.SUPPLY_SAFE_EAT].all(), (
        "Java's policy mask should not inspect Consumable.eatDelay")
    eng._apply_supply(np.full(
        eng.n_fights * 2,
        schema.SUPPLY_BASE + schema.SUPPLY_SAFE_EAT,
        dtype=np.int32))
    assert np.array_equal(s.food_count, count_after_first), (
        "the selected action consumed food through the active eat timer")


def test_panic_food_and_brew_combo_blocks_same_tick_restore():
    eng = _engine(schema.SUPPLY_PANIC_FULL)
    s = eng.state
    s.hp[:] = 30
    s.magic_level[:] = 80
    before_food = s.food_count.copy()
    before_brew = s.brew_count.copy()
    before_restore = s.restore_count.copy()
    eng.step()

    assert np.array_equal(s.food_count, before_food - 1)
    assert np.array_equal(s.brew_count, before_brew - 1)
    assert np.array_equal(s.restore_count, before_restore), (
        "PANIC_FULL drank a restore after its brew had started potDelay")


def test_potion_item_counts_follow_java_highest_dose_first_order():
    eng = _engine(schema.SUPPLY_NONE, n_fights=1)
    s = eng.state
    s.hp[:] = 1
    brew_action = np.full(
        2, schema.SUPPLY_BASE + schema.SUPPLY_BREW_ONLY, dtype=np.int32)
    free_before = s.inventory_free_slots.copy()

    # Java consumes BREW4 across all three bottles before BREW3. Four drinks
    # therefore leave three occupied bottles (3, 3 and 2 doses), not two.
    for _ in range(4):
        s.pot_delay[:] = 0
        eng._apply_supply(brew_action)
    legal = actions.compute(s, eng.gear_tables)
    inputs = observation.build(s, eng.gear_tables, legal)
    assert np.allclose(inputs[:, schema.INPUT_SELF_BREW_COUNT], 3.0 / 8.0)
    assert np.array_equal(s.inventory_free_slots, free_before)

    # On drink ten, three one-dose bottles become two potion items plus an
    # empty vial. The potion count drops, but Java keeps vial item 229 in the
    # occupied inventory slot.
    for _ in range(6):
        s.pot_delay[:] = 0
        eng._apply_supply(brew_action)
    legal = actions.compute(s, eng.gear_tables)
    inputs = observation.build(s, eng.gear_tables, legal)
    assert np.allclose(inputs[:, schema.INPUT_SELF_BREW_COUNT], 2.0 / 8.0)
    assert np.array_equal(s.inventory_free_slots, free_before)


def test_sanfew_restores_combat_stats_after_the_bot_prayer_top_up():
    """The bot tops prayer up before choosing, then Sanfew restores each
    drained combat stat by 8 + int(99 * 0.25) = 32, capped at 99."""
    eng = _engine(schema.SUPPLY_RESTORE_REBOOST)
    s = eng.state
    s.restore_count[:] = 10
    s.prayer_points[:] = 20
    s.attack_level[:] = 50
    s.magic_level[:] = 90
    eng.step()

    assert (s.prayer_points[:, 0] == 99).all(), (
        f"the bot should top prayer up to 99, got {s.prayer_points[0, 0]}")
    assert (s.attack_level[:, 0] == 82).all(), (
        f"attack should be 50 + 32 = 82, got {s.attack_level[0, 0]}")
    assert (s.magic_level[:, 0] == 99).all(), (
        f"magic should cap at 99, got {s.magic_level[0, 0]}")


def test_sanfew_leaves_a_boosted_stat_alone():
    """`if(stat.currentLevel < stat.fixedLevel)` - a stat already above 99 is
    skipped, not pulled back down to it."""
    eng = _engine(schema.SUPPLY_RESTORE_REBOOST)
    s = eng.state
    s.restore_count[:] = 10
    s.defence_level[:] = 120          # brewed up
    eng.step()
    assert (s.defence_level[:, 0] == 120).all(), (
        f"sanfew pulled a boosted defence down to {s.defence_level[0, 0]}")


def test_bot_restores_prayer_before_every_policy_decision():
    """NhStakerBot.ensurePrayerPoints restores the stat before observation."""
    eng = _engine(schema.SUPPLY_NONE)
    s = eng.state
    s.prayer_points[:] = 20
    eng.step()
    assert (s.prayer_points == state.MAX_PRAYER_POINTS).all()


def test_vengeance_trinket_slot_frees_only_after_second_cast():
    eng = _engine(schema.SUPPLY_NONE, n_fights=1)
    s = eng.state
    s.inventory_free_slots[0, 0] = 1
    s.veng_trinket_count[0, 0] = 2

    chosen = np.full(2, schema.SUPPLY_BASE + schema.SUPPLY_NONE,
                     dtype=np.int32)
    chosen[0] = schema.SUPPLY_BASE + schema.SUPPLY_VENGEANCE_TRINKET
    eng._apply_supply(chosen)

    assert s.veng_trinket_count[0, 0] == 1
    assert s.inventory_free_slots[0, 0] == 1, (
        "Java keeps the second charge in the same occupied Item slot")

    s.vengeance_active[0, 0] = False
    s.vengeance_cooldown[0, 0] = 0
    eng._apply_supply(chosen)
    assert s.veng_trinket_count[0, 0] == 0
    assert s.inventory_free_slots[0, 0] == 2


def test_vengeance_trinket_stores_global_decision_tick():
    eng = _engine(schema.SUPPLY_NONE, n_fights=1)
    s = eng.state
    eng.world_tick = 137
    s.tick[:] = 7
    chosen = np.full(2, schema.SUPPLY_BASE + schema.SUPPLY_NONE,
                     dtype=np.int32)
    chosen[0] = schema.SUPPLY_BASE + schema.SUPPLY_VENGEANCE_TRINKET

    eng._apply_supply(chosen)

    assert s.veng_trinket_last_cast_tick[0, 0] == 137
    assert s.veng_trinket_last_cast_tick[0, 1] == -1


def test_vengeance_trinket_cooldown_clears_after_decision_fifty():
    eng = _engine(schema.SUPPLY_NONE, n_fights=1)
    s = eng.state
    chosen = np.full(2, schema.SUPPLY_BASE + schema.SUPPLY_NONE,
                     dtype=np.int32)
    chosen[0] = schema.SUPPLY_BASE + schema.SUPPLY_VENGEANCE_TRINKET
    eng._apply_supply(chosen)
    s.vengeance_active[0, 0] = False

    for _ in range(50):
        eng._advance_timers()
    legal = actions.compute(s, eng.gear_tables).mask
    assert not legal[
        0, schema.SUPPLY_BASE + schema.SUPPLY_VENGEANCE_TRINKET]

    eng._advance_timers()
    legal = actions.compute(s, eng.gear_tables).mask
    assert legal[
        0, schema.SUPPLY_BASE + schema.SUPPLY_VENGEANCE_TRINKET]


def test_magic_discards_manta_when_direct_gear_consumed_last_free_slot():
    eng = _engine(schema.SUPPLY_NONE, n_fights=1)
    s = eng.state
    s.inventory_free_slots[0, 0] = 0
    s.food_count[0, 0] = 7
    other_food = int(s.food_count[0, 1])
    other_free = int(s.inventory_free_slots[0, 1])

    style = np.full((1, 2), schema.STYLE_RANGED, dtype=np.int32)
    style[0, 0] = schema.STYLE_MAGIC
    eng._ensure_magic_supply_slot(style)

    assert s.food_count[0, 0] == 6
    assert s.inventory_free_slots[0, 0] == 1
    assert s.food_count[0, 1] == other_food
    assert s.inventory_free_slots[0, 1] == other_free


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
    print("supplies:", "OK" if failures == 0 else f"{failures} FAILED")
    raise SystemExit(1 if failures else 0)
