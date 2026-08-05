"""Moving, running, and why you cannot do both moving and attacking.

Two rules, both of which the rig had wrong:

  1. A tick is spent either moving or attacking, never both. The server does
     this in TargetRoute.beforeMovement0, which runs BEFORE movement.process():
     it decides `withinDistance` from where you are standing before any step,
     and PlayerCombat.attack() gates on that - and if you already are in range
     it calls `entity.getMovement().reset()` so you stand still and swing.

  2. These bots RUN. Config.RUNNING is `varp(173, true).defaultValue(1)`, so it
     starts on, and they spawn with a full 10000 energy. Two tiles a tick until
     the bar empties, then one.
"""

from __future__ import annotations

import copy
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import actions, engine, schema, state, world_map  # noqa: E402

STEP_EAST = next(i for i in range(len(schema.MOVEMENT_OFFSETS))
                 if tuple(schema.MOVEMENT_OFFSETS[i]) == (2, 0))
STEP_WEST = next(i for i in range(len(schema.MOVEMENT_OFFSETS))
                 if tuple(schema.MOVEMENT_OFFSETS[i]) == (-2, 0))
STEP_ONE_EAST = next(i for i in range(len(schema.MOVEMENT_OFFSETS))
                     if tuple(schema.MOVEMENT_OFFSETS[i]) == (1, 0))


def test_cache_asset_has_every_supported_worker_and_distance_plan():
    expected = {
        (world_id, minimum, 8)
        for world_id in range(35, 43)
        for minimum in (1, 4)
    }
    assert expected.issubset(world_map.SELF_PLAY_MAP.plans)
    for world_id, minimum, maximum in expected:
        plan = world_map.SELF_PLAY_MAP.initial_lanes(
            world_id, minimum, maximum, 260)
        assert plan is not None
        assert len(plan.x) == 260
        assert np.all((plan.distance >= minimum) & (plan.distance <= maximum))


def test_static_route_cache_matches_collision_logic_for_every_map_tile():
    """The cached 24-bit answer must be identical to the old route walk."""
    game_map = world_map.SELF_PLAY_MAP
    grid_y, grid_x = np.indices(
        (game_map.height, game_map.width), dtype=np.int32)
    start_x = grid_x + game_map.min_x
    start_y = grid_y + game_map.min_y
    cached = game_map.static_route_mask(start_x, start_y)

    for bit, (dx, dy) in enumerate(
            schema.MOVEMENT_OFFSETS[schema.MOVE_OFFSET_BASE:]):
        target_x = start_x + int(dx)
        target_y = start_y + int(dy)
        step_x = start_x
        step_y = start_y
        expected = np.ones(start_x.shape, dtype=bool)
        for _ in range(2):
            active = (step_x != target_x) | (step_y != target_y)
            next_x = step_x + np.sign(target_x - step_x).astype(np.int32)
            next_y = step_y + np.sign(target_y - step_y).astype(np.int32)
            expected &= (
                ~active
                | game_map.step_allowed(step_x, step_y, next_x, next_y))
            step_x = np.where(active, next_x, step_x)
            step_y = np.where(active, next_y, step_y)
        actual = (cached & (np.uint32(1) << np.uint32(bit))) != 0
        assert np.array_equal(actual, expected), (
            f"cached collision route differs for offset {(dx, dy)}")


def test_runtime_step_cache_matches_every_map_tile_and_direction():
    game_map = world_map.SELF_PLAY_MAP
    grid_y, grid_x = np.indices(
        (game_map.height, game_map.width), dtype=np.int32)
    start_x = grid_x + game_map.min_x
    start_y = grid_y + game_map.min_y
    directions = (
        (-1, 0), (1, 0), (0, -1), (0, 1),
        (-1, -1), (1, -1), (-1, 1), (1, 1))
    for dx, dy in directions:
        target_x = start_x + dx
        target_y = start_y + dy
        expected = game_map.step_allowed(
            start_x, start_y, target_x, target_y)
        actual = game_map.cached_step_allowed(
            start_x, start_y, target_x, target_y)
        assert np.array_equal(actual, expected), (
            f"runtime step cache differs for direction {(dx, dy)}")


def test_runtime_step_cache_fallback_matches_mixed_boundary_points():
    game_map = world_map.SELF_PLAY_MAP
    rng = np.random.default_rng(20260727)
    count = 50000
    x = rng.integers(
        game_map.min_x - 3,
        game_map.min_x + game_map.width + 3,
        size=count,
        dtype=np.int32)
    y = rng.integers(
        game_map.min_y - 3,
        game_map.min_y + game_map.height + 3,
        size=count,
        dtype=np.int32)
    dx = rng.integers(-2, 3, size=count, dtype=np.int32)
    dy = rng.integers(-2, 3, size=count, dtype=np.int32)
    expected = game_map.step_allowed(x, y, x + dx, y + dy)
    actual = game_map.cached_step_allowed(x, y, x + dx, y + dy)
    assert np.array_equal(actual, expected)


def _assert_state_arrays_equal(actual, expected):
    for name, expected_value in vars(expected).items():
        actual_value = getattr(actual, name)
        if isinstance(expected_value, np.ndarray):
            assert np.array_equal(actual_value, expected_value), (
                f"movement differential changed state.{name}")


def test_random_explicit_movement_matches_general_collision_execution():
    rng = np.random.default_rng(20260728)
    count = 512
    base = engine.Engine(
        n_fights=count, policy=Actor(schema.MOVE_NONE), seed=28,
        epsilon=0.0, max_ticks=20, world_id=35,
        start_distance_min=4, start_distance_max=8)
    game_map = world_map.SELF_PLAY_MAP
    s = base.state
    s.x[:] = rng.integers(
        game_map.min_x, game_map.min_x + game_map.width,
        size=s.x.shape, dtype=np.int32)
    s.y[:] = rng.integers(
        game_map.min_y, game_map.min_y + game_map.height,
        size=s.y.shape, dtype=np.int32)
    s.prev_x[:] = s.x
    s.prev_y[:] = s.y
    s.origin_x[:] = s.x
    s.origin_y[:] = s.y
    s.freeze_ticks[:] = rng.integers(
        0, 3, size=s.freeze_ticks.shape, dtype=np.int32)
    s.lock_ticks[:] = rng.integers(
        0, 3, size=s.lock_ticks.shape, dtype=np.int32)
    s.running[:] = rng.random(s.running.shape) < 0.7
    s.run_energy[:] = rng.choice(
        np.array([-100.0, 0.0, 1.0, 84.0, 5000.0, 10000.0]),
        size=s.run_energy.shape)
    movement = (
        schema.MOVEMENT_BASE
        + rng.integers(
            0, schema.MOVEMENT_COUNT,
            size=count * 2, dtype=np.int64))

    reference = copy.deepcopy(base)
    candidate = copy.deepcopy(base)
    cached = world_map.SelfPlayMap.cached_step_allowed
    try:
        world_map.SelfPlayMap.cached_step_allowed = (
            world_map.SelfPlayMap.step_allowed)
        expected_issued = reference._apply_movement(movement)
    finally:
        world_map.SelfPlayMap.cached_step_allowed = cached
    actual_issued = candidate._apply_movement(movement)

    assert np.array_equal(actual_issued, expected_issued)
    _assert_state_arrays_equal(candidate.state, reference.state)


def test_random_persistent_route_matches_general_collision_execution():
    rng = np.random.default_rng(20260729)
    count = 512
    base = engine.Engine(
        n_fights=count, policy=Actor(schema.MOVE_NONE), seed=29,
        epsilon=0.0, max_ticks=20, world_id=35,
        start_distance_min=4, start_distance_max=8)
    game_map = world_map.SELF_PLAY_MAP
    s = base.state
    s.x[:] = rng.integers(
        game_map.min_x, game_map.min_x + game_map.width,
        size=s.x.shape, dtype=np.int32)
    s.y[:] = rng.integers(
        game_map.min_y, game_map.min_y + game_map.height,
        size=s.y.shape, dtype=np.int32)
    s.prev_x[:] = s.x
    s.prev_y[:] = s.y
    s.freeze_ticks[:] = rng.integers(
        0, 3, size=s.freeze_ticks.shape, dtype=np.int32)
    s.lock_ticks[:] = rng.integers(
        0, 3, size=s.lock_ticks.shape, dtype=np.int32)
    s.running[:] = rng.random(s.running.shape) < 0.7
    s.run_energy[:] = rng.choice(
        np.array([-100.0, 0.0, 1.0, 84.0, 5000.0, 10000.0]),
        size=s.run_energy.shape)
    reach = rng.integers(
        1, 11, size=(count, 2), dtype=np.int32)
    energy_before = s.run_energy.copy()
    magic_overlap = rng.random((count, 2)) < 0.2
    route_ready = rng.random((count, 2)) < 0.8

    reference = copy.deepcopy(base)
    candidate = copy.deepcopy(base)
    cached = world_map.SelfPlayMap.cached_step_allowed
    try:
        world_map.SelfPlayMap.cached_step_allowed = (
            world_map.SelfPlayMap.step_allowed)
        reference._apply_persistent_combat_route(
            reach, energy_before, magic_overlap, route_ready)
    finally:
        world_map.SelfPlayMap.cached_step_allowed = cached
    candidate._apply_persistent_combat_route(
        reach, energy_before, magic_overlap, route_ready)
    _assert_state_arrays_equal(candidate.state, reference.state)


def test_direct_movement_batch_matches_each_individual_offset():
    """The one-pass 24-route path must preserve the public scalar helper."""
    eng = engine.Engine(
        n_fights=260, policy=Actor(schema.MOVE_NONE), seed=17,
        epsilon=0.0, max_ticks=20, world_id=35,
        start_distance_min=4, start_distance_max=8)
    all_moves = actions.direct_tile_moves_allowed(eng.state)
    assert all_moves.shape == (260, 2, 24)
    for bit, (dx, dy) in enumerate(
            schema.MOVEMENT_OFFSETS[schema.MOVE_OFFSET_BASE:]):
        individual = actions.direct_tile_move_allowed(
            eng.state, int(dx), int(dy))
        assert np.array_equal(all_moves[..., bit], individual), (
            f"batched dynamic route differs for offset {(dx, dy)}")


class Actor:
    def __init__(self, movement, attack_style=None):
        self.movement = movement
        self.attack_style = attack_style
        self.input_size = schema.INPUT_SIZE

    def score(self, inputs):
        n = inputs.shape[0]
        s = np.zeros((n, schema.ACTION_COUNT), dtype=np.float32)
        s[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 100.0
        s[:, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = 100.0
        s[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        s[:, schema.DEFENCE_BASE + schema.PRAY_PROTECT_MELEE] = 100.0
        s[:, schema.MOVEMENT_BASE + self.movement] = 100.0
        if self.attack_style is not None:
            attack = (schema.COMBAT_BASE + schema.COMBAT_ATTACK_BASE
                      + self.attack_style * 2 + schema.ATTACK_INTENT_ATTACK)
            rows = np.arange(0, n, 2)
            s[rows, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = 0.0
            s[rows, attack] = 200.0
        return s, np.zeros(n, dtype=np.float32)


class ConvergingActor(Actor):
    def score(self, inputs):
        scores, value = super().score(inputs)
        scores[1::2, schema.MOVEMENT_BASE + self.movement] = 0.0
        scores[1::2, schema.MOVEMENT_BASE + STEP_WEST] = 200.0
        return scores, value


def _engine(movement, attack_style=None, distance=3, n_fights=16):
    eng = engine.Engine(n_fights=n_fights, policy=Actor(movement, attack_style),
                        seed=5, epsilon=0.0, max_ticks=500)
    s = eng.state
    s.hp[:] = 99
    s.x[:, 0], s.y[:, 0] = 0, 0
    s.x[:, 1], s.y[:, 1] = distance, 0
    s.prev_x, s.prev_y = s.x.copy(), s.y.copy()
    s.origin_x, s.origin_y = s.x.copy(), s.y.copy()
    s.lane_min_x = np.minimum(s.origin_x[:, 0], s.origin_x[:, 1]) - state.LANE_RADIUS
    s.lane_max_x = np.maximum(s.origin_x[:, 0], s.origin_x[:, 1]) + state.LANE_RADIUS
    s.lane_min_y = np.minimum(s.origin_y[:, 0], s.origin_y[:, 1]) - state.LANE_RADIUS
    s.lane_max_y = np.maximum(s.origin_y[:, 0], s.origin_y[:, 1]) + state.LANE_RADIUS
    if attack_style is not None:
        s.style[:, 0] = attack_style
        s.weapon_id[:, 0] = eng.gear_tables["weapon_id"][attack_style]
    return eng


def test_being_able_to_attack_cancels_the_movement():
    """The vector composer forces movement NONE for an immediate attack."""
    eng = _engine(STEP_ONE_EAST, attack_style=schema.STYLE_MAGIC, distance=3)
    s = eng.state
    s.attack_delay[:] = 0          # ready to swing on the very next tick

    eng.step()

    assert not s.moving[:, 0].any(), (
        "an in-range attacker moved - the attack should have cancelled the step")
    assert s.pending_damage[:, 1, :].sum() > 0, (
        "an in-range attacker never attacked")
    record = eng._pending
    assert (record.chosen["movement"][::2]
            == schema.MOVEMENT_BASE + schema.MOVE_NONE).all()
    assert not record.legal_mask[::2,
                                 schema.MOVEMENT_BASE + 1:
                                 schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT].any()

    # Once it is on cooldown it is free to move again - being unable to attack
    # is exactly what frees the tick up.
    assert (s.attack_delay[:, 0] > 0).all()
    eng.step()
    assert s.moving[:, 0].all(), (
        "a fighter on attack cooldown should be able to reposition")


def test_out_of_range_you_move_instead_of_attacking():
    """The other half: too far to hit, so the tick is spent closing in."""
    eng = _engine(STEP_ONE_EAST, attack_style=schema.STYLE_MELEE, distance=6)
    s = eng.state
    s.attack_delay[:] = 0
    eng.step()

    assert s.moving[:, 0].all(), "an out-of-range fighter did not move"
    assert s.pending_damage[:, 1, :].sum() == 0, (
        "a fighter attacked from outside its reach")


def test_standing_still_in_range_does_attack():
    """The counterpart, so the test above cannot pass just by nothing working."""
    eng = _engine(schema.MOVE_NONE, attack_style=schema.STYLE_MAGIC, distance=3)
    s = eng.state
    s.attack_delay[:] = 0

    for _ in range(6):
        eng.step()

    assert not s.moving[:, 0].any(), "side 0 moved when told to stand"
    assert (s.pending_damage[:, 1, :].sum() + s.damage_taken[:, 1].sum()) > 0, (
        "a stationary fighter in range never attacked")


def test_running_covers_two_tiles_a_tick():
    eng = _engine(STEP_EAST)
    before = eng.state.x[:, 0].copy()
    eng.step()
    assert (eng.state.x[:, 0] - before == 2).all(), (
        f"expected 2 tiles, got {eng.state.x[0, 0] - before[0]}")


def test_staged_two_tile_moves_may_converge_after_slot_order_execution():
    eng = _engine(STEP_EAST, distance=4, n_fights=8)
    eng.policy = ConvergingActor(STEP_EAST)
    before_energy = eng.state.run_energy.copy()
    eng.step()

    assert (eng.state.x[:, 0] == 2).all()
    assert (eng.state.x[:, 1] == 2).all(), (
        "ordinary player movement incorrectly treated the live player tile as "
        "blocked after both destinations had passed staged validation")
    assert (
        eng.state.run_energy[:, 1]
        == before_energy[:, 1] - state.RUN_ENERGY_DRAIN
    ).all(), "the second staged two-step route did not complete as a run"


def test_energy_runs_out_and_then_they_walk_for_good():
    """drain = min(weight, 64) + 64 per running tick, from 10000. At 20.1kg
    that is 84.1 a tick, so the bar lasts about 119 ticks - then the server
    sets Config.RUNNING to 0 and nothing ever turns it back on."""
    eng = _engine(STEP_EAST)
    s = eng.state

    expected = int(state.MAX_RUN_ENERGY // state.RUN_ENERGY_DRAIN) + 1
    for tick in range(expected):
        eng.policy.movement = STEP_EAST if (tick & 1) == 0 else STEP_WEST
        eng.step()

    assert not s.running[:, 0].any(), (
        f"still running after {expected} ticks of it")
    assert (s.run_energy[:, 0] == -100.0).all(), (
        "the server parks empty energy at -100")

    before = s.x[:, 0].copy()
    eng.policy.movement = STEP_WEST
    eng.step()
    assert (s.x[:, 0] - before == -1).all(), "should be walking one tile now"

    # And it never comes back, even after standing around.
    for _ in range(50):
        eng.step()
    assert not s.running[:, 0].any(), "running switched itself back on"


def test_energy_recovers_while_standing_still():
    eng = _engine(STEP_EAST)
    s = eng.state
    for tick in range(20):
        eng.policy.movement = STEP_EAST if (tick & 1) == 0 else STEP_WEST
        eng.step()
    drained = s.run_energy[:, 0].copy()
    assert (drained < state.MAX_RUN_ENERGY).all()

    eng.policy.movement = schema.MOVE_NONE
    eng.step()
    assert (s.run_energy[:, 0] > drained).all(), (
        "energy did not recover on a tick spent standing still")


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
    print("movement:", "OK" if failures == 0 else f"{failures} FAILED")
    raise SystemExit(1 if failures else 0)
