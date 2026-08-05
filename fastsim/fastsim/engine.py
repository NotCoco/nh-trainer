"""The tick loop: the fight rules, applied to every fight at once.

This is the CPU half of the split. It is full of "if this then that" - did the
hit land, is he in range, is the freeze still on - which is exactly the work a
CPU is built for and a GPU is bad at. The GPU is only ever asked to score the
options (see policy.py); every decision about what is allowed and what actually
happens is made here.

One call to step() advances every fight in the batch by one game tick. The
order of operations inside a tick follows the server's AI path:

    1. timers tick down (attack delay, freeze, vengeance, spec regen)
    2. take the in-flight hits whose countdown expires this tick
    3. build the observation and choose this tick's actions
    4. supplies, prayer, and gear resolve
    5. due hits land, as Player.processHits does
    6. surviving fighters process movement and attacks
    7. deaths are settled

Opponent information is staged rather than read from same-tick mutations.
Ordinary fields are held back by one tick; the opponent's protection prayer is
held back by two so it cannot be countered on the first roll where it becomes
effective. That is a design rule of this project, not an optimisation - see
docs/FIGHT-MECHANICS.md.
"""

from __future__ import annotations

from dataclasses import dataclass, fields

import numpy as np

from . import (actions, combat, gear, observation, replay, reward_events, schema,
               world_map)
from .state import (BREW_DEFENCE_BOOST, BREW_DEFENCE_CAP, BREW_HEAL,
                    BREW_HP_CAP, BREW_STAT_DRAIN, FOOD_EAT_DELAY, FOOD_HEAL,
                    DPS_ROLLING_WINDOW_TICKS,
                     MAX_HP, MAX_PRAYER_POINTS, MAX_SPECIAL_ENERGY,
                     MAX_RUN_ENERGY, PENDING_HITS_PER_SLOT, PENDING_SLOTS,
                    POT_DELAY,
                     PRAYER_DRAIN_OFFENSIVE, PRAYER_DRAIN_OVERHEAD,
                    RUN_ENERGY_DRAIN, RUN_ENERGY_RESTORE,
                    SANFEW_RESTORE, BatchState)

# Special attack energy regenerates 10% every 50 ticks (30 seconds).
SPEC_REGEN_TICKS = 50
SPEC_REGEN_AMOUNT = 100

# TrinketOfVengeance's player event delays 50 process ticks, but the NH
# decision runs before that tick's player-event stage. A cast on decision T is
# still blocked on T+50 and first becomes selectable on T+51.
VENGEANCE_COOLDOWN_TICKS = 51
VENGEANCE_REFLECT = 0.75

FREEZE_IMMUNITY_TICKS = 5
OFFENSIVE_STYLE_TEACHER_OFF_PRAYER_BONUS = 2.0

# NhStakerBot's neural_sparse reward profile. These values are deliberately
# kept beside the tick stage that consumes them rather than treated as a
# configurable FastSim objective.
REWARD_DPS_WEIGHT = 0.20
REWARD_DTPS_WEIGHT = 0.20
REWARD_ROLL_PRAYER_CORRECT = 0.55
REWARD_ROLL_PRAYER_INCORRECT = -1.15
# NhStakerBot.java:177-190 and 10252-10287. Roll-time tank reward uses
# missing-switch buckets plus a defence-gap penalty; per-update mass is clipped.
REWARD_ROLL_TANK_MISSING = (1.35, 0.72, 0.18, -1.15)
REWARD_ROLL_TANK_GAP_SCALE = 0.008 * 0.55
REWARD_ROLL_TANK_MAX_BONUS = 1.60
REWARD_ROLL_TANK_MAX_PENALTY = 1.35
REWARD_FREEZE_LANDED = 0.85
REWARD_SPEC_OUTCOME_KILL_BONUS = 4.75
REWARD_SPEC_OUTCOME_DAMAGE_SCALE = 1.35
REWARD_SPEC_OUTCOME_WHIFF_PENALTY = 1.05
SPEC_OUTCOME_WINDOW_TICKS = 4
REWARD_SUPPLY_GOOD_BONUS = 1.20
REWARD_SUPPLY_BAD_PENALTY = 0.30
REWARD_SUPPLY_UNNEEDED_RESTORE_PENALTY = 0.30
REWARD_SUPPLY_UNNEEDED_REBOOST_PENALTY = 0.26
REWARD_SUPPLY_RISK_REDUCTION_SCALE = 8.00
REWARD_SUPPLY_LOW_RISK_USE_PENALTY = 2.25
REWARD_SUPPLY_NO_RISK_REDUCTION_PENALTY = 2.25
REWARD_SUPPLY_OPPORTUNITY_COST_SCALE = 1.20
REWARD_SUPPLY_REPEAT_LOW_VALUE_PENALTY = 1.10
REWARD_SUPPLY_MEANINGFUL_RISK_DROP = 0.065
REWARD_SUPPLY_SUPPORT_RECOVERY_BONUS = 0.95
REWARD_SUPPLY_POST_BREW_RECOVERY_BONUS = 0.36
REWARD_SUPPLY_PANIC_LOW_VALUE_PENALTY = 4.20
REWARD_BREW_TEMPO_HEAL_BONUS = 0.42
REWARD_BREW_ONLY_PENALTY_WEIGHT = 0.45
REWARD_SPARSE_SUPPLY_TEMPO_SCALE = 0.35
REWARD_SPARSE_FREE_EAT_TEMPO_BONUS = 0.25
REWARD_SPARSE_MISSED_ATTACK_FOOD_PENALTY = 0.18
REWARD_FOOD_USE_COST = 0.45
REWARD_BREW_USE_COST = 0.75
REWARD_RESTORE_USE_COST = 0.12
REWARD_REBOOST_USE_COST = 0.12
REWARD_FOOD_WASTE_PENALTY_PER_HP = 0.18
REWARD_BREW_WASTE_PENALTY_PER_HP = 0.14
SUPPLY_REPEAT_WINDOW_TICKS = 10
SUPPLY_RECOVERY_STICKY_TICKS = 8
REWARD_KILL_BONUS = 50.0
REWARD_KO_UNUSED_HEALING_BONUS = 50.0
REWARD_DEATH_PENALTY = 50.0
REWARD_DEATH_UNUSED_HEALING_PENALTY = 50.0

TANK_GEAR_SLOTS = (
    gear.SLOT_HAT,
    gear.SLOT_CAPE,
    gear.SLOT_AMULET,
    gear.SLOT_WEAPON,
    gear.SLOT_CHEST,
    gear.SLOT_SHIELD,
    gear.SLOT_LEGS,
    gear.SLOT_HANDS,
    gear.SLOT_FEET,
    gear.SLOT_RING,
)
TANK_GEAR_CANDIDATES = {
    slot: tuple(item for item in gear.ALL_ITEMS if item.slot == slot)
    for slot in TANK_GEAR_SLOTS
}
ROLLING_WINDOW_ORDERS = tuple(
    tuple(
        (cursor + offset) % DPS_ROLLING_WINDOW_TICKS
        for offset in range(DPS_ROLLING_WINDOW_TICKS)
    )
    for cursor in range(DPS_ROLLING_WINDOW_TICKS)
)
OPTIONAL_GEAR_SLOT_MASK = sum(
    1 << int(slot) for slot in schema.OPTIONAL_GEAR_SLOTS)
OPTIONAL_GEAR_UNIT_BY_SLOT = {
    int(slot): schema.CHANNEL_GEAR_BASE + index
    for index, slot in enumerate(schema.OPTIONAL_GEAR_SLOTS)
}
DIRECT_GEAR_LOCALS_BY_SLOT = {
    int(slot): np.flatnonzero(gear.DIRECT_GEAR_SLOTS == int(slot))
    for slot in schema.OPTIONAL_GEAR_SLOTS
}
OFFENSIVE_INFLUENCE_SLOTS = np.asarray([
    int(slot)
    for index, slot in enumerate(schema.OPTIONAL_GEAR_SLOTS)
    if schema.CHANNEL_GEAR_BASE + index not in schema.INACTIVE_CAUSAL_UNITS
], dtype=np.intp)
OFFENSIVE_INFLUENCE_UNITS = np.asarray([
    schema.CHANNEL_GEAR_BASE + index
    for index, _ in enumerate(schema.OPTIONAL_GEAR_SLOTS)
    if schema.CHANNEL_GEAR_BASE + index not in schema.INACTIVE_CAUSAL_UNITS
], dtype=np.intp)
OFFENSIVE_INFLUENCE_SLOT_BITS = (
    1 << OFFENSIVE_INFLUENCE_SLOTS).astype(np.int32)
DIRECT_GEAR_ACTION_BY_SLOT_ITEM = {
    (int(slot), int(item_id)): schema.GEAR_BASE + local
    for local, (slot, item_id) in enumerate(zip(
        gear.DIRECT_GEAR_SLOTS, gear.DIRECT_GEAR_ITEMS))
}
STABLE_TANK_RELEVANT_SLOTS = frozenset((
    gear.SLOT_HAT,
    gear.SLOT_CAPE,
    gear.SLOT_CHEST,
    gear.SLOT_SHIELD,
    gear.SLOT_LEGS,
))


@dataclass
class TickRecord:
    """Everything the rollout writer needs about one decision, one fighter."""

    inputs: np.ndarray
    next_inputs: np.ndarray
    defence_prayer_attack_history_codes: np.ndarray
    defence_prayer_own_prayer_history_codes: np.ndarray
    next_defence_prayer_attack_history_codes: np.ndarray
    next_defence_prayer_own_prayer_history_codes: np.ndarray
    legal_mask: np.ndarray
    sampling_support: np.ndarray
    chosen: dict
    greedy: dict
    channel_chosen: dict
    channel_greedy: dict
    behaviour_prob: dict
    eligible: np.ndarray
    alternatives: np.ndarray
    deviated: np.ndarray
    causal_actual: np.ndarray
    causal_greedy: np.ndarray
    causal_prob: np.ndarray
    virtual_none: np.ndarray
    reserved: np.ndarray
    dependent: np.ndarray
    dependent_actions: np.ndarray
    required_weapon: np.ndarray
    value: np.ndarray
    selected_q: np.ndarray
    selected_score: np.ndarray
    reward: np.ndarray
    done: np.ndarray
    episode_id: np.ndarray
    decision_tick: np.ndarray
    episode_tick: np.ndarray
    bot_index: np.ndarray
    target_index: np.ndarray
    alive_mask: np.ndarray
    visible_threat_defence_index: np.ndarray
    visible_threat_damage: np.ndarray
    roll_prayer_teacher_action: np.ndarray
    roll_prayer_teacher_attack_style_code: np.ndarray
    tank_gear_teacher_action_count: np.ndarray
    tank_gear_teacher_actions: np.ndarray
    offensive_style_teacher_action: np.ndarray
    offensive_style_teacher_attack_style_code: np.ndarray
    offensive_style_teacher_defender_prayer_style_code: np.ndarray
    roll_offensive_gear_teacher_action_count: np.ndarray
    roll_offensive_gear_teacher_actions: np.ndarray
    roll_offensive_gear_teacher_attack_style_code: np.ndarray
    vengeance_trinket_blocker_mask: np.ndarray
    vengeance_trinket_cast_count: np.ndarray
    vengeance_trinket_item_count: np.ndarray
    vengeance_trinket_last_cast_tick: np.ndarray
    vengeance_trinket_legal: np.ndarray
    vengeance_opportunity_roll_tick: np.ndarray
    vengeance_opportunity_expected_damage: np.ndarray
    reward_events: reward_events.RewardEventBatch


class Engine:
    def __init__(self, n_fights: int, policy, seed: int = 0,
                 epsilon: float = 0.22, max_ticks: int = 1200,
                 opponent_policy=None, tick_ms: int = combat.GAMEPLAY_TICK_MS,
                 start_distance_min: int = 1, start_distance_max: int = 8,
                 world_id: int = 1, lane_radius: int = 3,
                 episodes_per_lane: int = 1,
                 replay_seed: int | None = None,
                 replay_plan: dict[tuple[int, int], tuple[int, ...]] | None = None,
                 exploration_units: tuple[int, ...] | None = None,
                 exploration_policy_side: int | None = None):
        self.n_fights = n_fights
        self.policy = policy
        self.opponent_policy = opponent_policy
        self.rng = np.random.default_rng(seed)
        self.epsilon = epsilon
        self.max_ticks = max_ticks
        self.episodes_per_lane = max(1, int(episodes_per_lane))
        self.replay_seed = replay_seed
        self.replay_plan = replay_plan
        if exploration_units is None:
            if exploration_policy_side is not None:
                raise ValueError(
                    "exploration_policy_side requires exploration_units")
            self._exploration_unit_mask = None
        else:
            if exploration_policy_side not in (0, 1):
                raise ValueError(
                    "restricted exploration requires policy side 0 or 1")
            unit_indices = np.asarray(
                tuple(exploration_units), dtype=np.int64)
            if (
                    unit_indices.ndim != 1
                    or np.any(unit_indices < 0)
                    or np.any(unit_indices >= schema.CAUSAL_UNIT_COUNT)):
                raise ValueError("exploration_units contains an invalid unit")
            self._exploration_unit_mask = np.zeros(
                (n_fights * 2, schema.CAUSAL_UNIT_COUNT), dtype=bool)
            rows = np.arange(
                int(exploration_policy_side), n_fights * 2, 2)
            self._exploration_unit_mask[
                rows[:, None], unit_indices[None, :]] = True
        self._defence_prayer_prior_state_history_enabled = any(
            int(getattr(candidate, "defence_prayer_head_version", 1)) >= 3
            for candidate in (policy, opponent_policy)
            if candidate is not None)
        if replay_plan is not None and n_fights != 1:
            raise ValueError("deterministic replay plans require one fight")
        self.world_tick = 0
        self._state_config = {
            "start_distance_min": start_distance_min,
            "start_distance_max": start_distance_max,
            "world_id": world_id,
            "lane_radius": lane_radius,
            "defence_prayer_prior_state_history":
                self._defence_prayer_prior_state_history_enabled,
        }
        # The logical tick is 600ms in both runtime profiles -
        # Server.gameplayTickMs() is hardcoded, and the training profile only
        # changes how fast ticks are played out in real time, not what a tick
        # contains. Exposed as a parameter for testing the formula, not as a
        # setting to vary. See the long note in combat.py.
        self.tick_ms = tick_ms
        needed = combat.max_projectile_ticks(tick_ms) + 1
        if needed > PENDING_SLOTS:
            raise ValueError(
                f"hit delays reach {needed - 1} ticks at tick_ms={tick_ms}, but the "
                f"pending-damage buffer holds {PENDING_SLOTS - 1}. Raise "
                f"state.PENDING_SLOTS or hits will be silently dropped.")

        self.state = BatchState.new(
            n_fights,
            self.rng,
            start_distance_min=start_distance_min,
            start_distance_max=start_distance_max,
            world_id=world_id,
            lane_radius=lane_radius,
            defence_prayer_prior_state_history=
                self._defence_prayer_prior_state_history_enabled)
        self.gear_tables = {
            "set_bonuses": gear.build_set_bonus_table(),
            "item_bonus_lookup": gear.build_item_bonus_lookup(),
            **gear.build_set_weapon_table(),
        }
        self._offensive_gear_influence_lookup = (
            self._build_offensive_gear_influence_lookup())
        self._drain_counter = np.zeros((n_fights, 2), dtype=np.int64)
        self._spec_regen_counter = 0
        self._pending = None
        self._current_roll_context = None
        self._supply_reward_context = None
        self._tank_reward_cache = {}
        self._reward_event_builder = reward_events.RewardEventBatchBuilder(
            event_capacity=max(16, n_fights * 4),
            contributor_capacity=max(64, n_fights * 24))
        self._tick_reward_events = self._reward_event_builder
        self._tick_tank_components = []
        # Rolling damage credit changes only when a hit enters or leaves its
        # eight-decision window. Most ticks merely advance across an empty
        # ring slot, so retain the already-normalized, ordered contributors.
        self._rolling_reward_contributor_cache = np.empty(
            (n_fights, 2), dtype=object)
        self._rolling_reward_contributor_cache.fill(None)
        self._replay_hit_ordinals = np.zeros(
            (n_fights, 2), dtype=np.int32)
        if self._defence_prayer_prior_state_history_enabled:
            rows = n_fights * 2
            self._defence_prayer_prior_state_history_ordered = np.empty(
                (
                    rows,
                    schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
                    schema.INPUT_SIZE,
                ),
                dtype=np.float32)
            self._defence_prayer_prior_state_history_valid = np.empty(
                (
                    rows,
                    schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
                ),
                dtype=bool)
            self._defence_prayer_prior_state_history_rows = np.arange(
                rows, dtype=np.intp)
        else:
            self._defence_prayer_prior_state_history_ordered = None
            self._defence_prayer_prior_state_history_valid = None
            self._defence_prayer_prior_state_history_rows = None
        self._side0_wins = 0
        self._side1_wins = 0
        self._draws = 0

    # -- helpers -------------------------------------------------------------

    @staticmethod
    def _flat(arr):
        return arr.reshape((-1,) + arr.shape[2:])

    @staticmethod
    def _pair(arr, n_fights):
        return arr.reshape((n_fights, 2) + arr.shape[1:])

    @staticmethod
    def _score_policy(
            policy,
            inputs,
            prayer_history_codes,
            prior_state_history=None,
            prior_state_history_valid=None):
        """Pass each detached-head context only to the version declaring it."""
        version = int(getattr(policy, "defence_prayer_head_version", 1))
        if version >= 3:
            return policy.score(
                inputs,
                prayer_history_codes,
                prior_state_history,
                prior_state_history_valid)
        if version >= 2:
            return policy.score(inputs, prayer_history_codes)
        return policy.score(inputs)

    def _ordered_defence_prayer_prior_state_history(self):
        """Materialize the circular ring newest-first into reusable buffers."""
        if not self._defence_prayer_prior_state_history_enabled:
            return None, None
        s = self.state
        ring = self._flat(s.defence_prayer_prior_state_history)
        cursor = self._flat(
            s.defence_prayer_prior_state_history_cursor).astype(
                np.intp, copy=False)
        count = self._flat(
            s.defence_prayer_prior_state_history_count).astype(
                np.intp, copy=False)
        ordered = self._defence_prayer_prior_state_history_ordered
        valid = self._defence_prayer_prior_state_history_valid
        rows = self._defence_prayer_prior_state_history_rows
        active = np.repeat(s.alive, 2)
        depth = schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS
        for lag in range(depth):
            slot_valid = active & (count > lag)
            slot = (cursor - 1 - lag) % depth
            ordered[:, lag, :] = ring[rows, slot, :]
            ordered[~slot_valid, lag, :] = 0.0
            valid[:, lag] = slot_valid
        return ordered, valid

    def _append_defence_prayer_prior_state_history(self, inputs):
        """Publish the current decision row as lag one for the next decision."""
        if not self._defence_prayer_prior_state_history_enabled:
            return
        s = self.state
        active = np.repeat(s.alive, 2)
        if not active.any():
            return
        ring = self._flat(s.defence_prayer_prior_state_history)
        cursor = self._flat(s.defence_prayer_prior_state_history_cursor)
        count = self._flat(s.defence_prayer_prior_state_history_count)
        rows = self._defence_prayer_prior_state_history_rows[active]
        slots = cursor[active].astype(np.intp, copy=False)
        ring[rows, slots, :] = np.asarray(inputs, dtype=np.float32)[active]
        cursor[active] = (
            slots + 1) % schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS
        count[active] = np.minimum(
            count[active] + 1,
            schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS)

    def _replay_units(self, draw_kind):
        return np.asarray([
            [
                replay.unit(
                    self.replay_seed,
                    self.world_tick,
                    fight * 2 + side,
                    int(self._replay_hit_ordinals[fight, side]),
                    draw_kind)
                for side in range(2)
            ]
            for fight in range(self.n_fights)
        ], dtype=np.float64)

    def has_work(self) -> bool:
        """Whether a live or configured follow-up episode remains."""
        s = self.state
        resettable = (
            (~s.alive)
            & (s.episode_id[:, 0] < self.episodes_per_lane))
        return bool(s.alive.any() or resettable.any())

    def _reset_finished_lanes(self):
        """Apply Java's assigned-spawn fresh-fight reset to finished pairs."""
        s = self.state
        reset = (
            (~s.alive)
            & (s.episode_id[:, 0] < self.episodes_per_lane))
        if not reset.any():
            return

        next_episode = s.episode_id[reset].copy() + 1
        stable_bot_index = s.bot_index[reset].copy()

        # resetBotForFreshFight teleports, restores combat/stats/special and
        # prepareBotLoadout rebuilds supplies. It deliberately does not clear
        # active Vengeance or its config cooldown; those survive the boundary.
        vengeance_active = s.vengeance_active[reset].copy()
        vengeance_cooldown = s.vengeance_cooldown[reset].copy()
        fresh = BatchState.new(
            self.n_fights, self.rng, **self._state_config)
        for definition in fields(BatchState):
            name = definition.name
            if name == "n_fights":
                continue
            current = getattr(s, name)
            replacement = getattr(fresh, name)
            if isinstance(current, np.ndarray) and current.shape[:1] == (
                    self.n_fights,):
                current[reset] = replacement[reset]

        s.episode_id[reset] = next_episode
        s.bot_index[reset] = stable_bot_index
        s.vengeance_active[reset] = vengeance_active
        s.vengeance_cooldown[reset] = vengeance_cooldown
        # Movement.teleport leaves Entity.isLocked true for the first reset
        # decision (the age-zero 64 blocker in Java rollouts).
        s.lock_ticks[reset] = 1
        self._drain_counter[reset] = 0
        self._rolling_reward_contributor_cache[reset] = None

    # -- one tick ------------------------------------------------------------

    def step(self):
        """Advance every fight one tick.

        Returns the PREVIOUS tick's record, now complete, or None on the first
        call. The delay exists because a transition's `next_input` is not the
        state after this tick's actions - it is the state the next decision is
        made from, one full tick later. Checked against real Java rollouts:
        next_input(T) equals input(T+1) on 100% of consecutive pairs.

        Doing it this way is also half the work, since each observation is
        built once and used as both the current row's input and the previous
        row's next_input, instead of being built twice.

        Call flush() at the end to close out the final record.
        """
        self._reset_finished_lanes()
        s = self.state
        n = self.n_fights
        alive = s.alive
        self._reward_event_builder.clear()
        self._tick_reward_events = self._reward_event_builder
        self._tick_tank_components = []
        self._replay_hit_ordinals[:] = 0

        self._advance_timers()
        arriving_hits = self._take_pending_damage()
        self._update_reward_observation()

        # A fresh pair is targeted before its first decision. Thereafter the
        # self-play manager restores both targets after the two player slots
        # have finished, so a restored TargetRoute is already live when the
        # following tick begins.
        can_target = (
            (s.hp > 0)
            & s.flip(s.hp > 0)
            & (s.lock_ticks <= 0))
        first_decision = s.tick == 0
        s.combat_target |= first_decision[:, None] & can_target
        persistent_route_ready = s.combat_target.copy()

        legal = actions.compute(s, self.gear_tables)
        inputs = observation.build(
            s, self.gear_tables, legal, rng=self.rng,
            decision_tick=self.world_tick)
        prayer_attack_history = self._flat(
            s.defence_prayer_attack_history_codes).copy()
        prayer_own_history = self._flat(
            s.defence_prayer_own_prayer_history_codes).copy()
        prayer_history_codes = np.concatenate(
            (prayer_attack_history, prayer_own_history), axis=1)
        (
            prior_state_history,
            prior_state_history_valid,
        ) = self._ordered_defence_prayer_prior_state_history()

        # These rollout fields describe the exact state at decision time. Java
        # derives the same bit mask in NhStakerBot.vengeanceTrinketBlockerMask.
        vengeance_blockers = self._vengeance_blocker_mask()
        vengeance_casts = self._flat(s.veng_trinket_casts).copy()
        vengeance_items = self._flat(s.veng_trinket_count).copy()
        vengeance_last_cast = self._flat(s.veng_trinket_last_cast_tick).copy()
        vengeance_legal = vengeance_blockers == 0
        visible_threat_index, visible_threat_damage = (
            self._visible_threat_fields())
        # Both policies can reconstruct this timer from the opponent's last
        # observed ordinary attack. Snapshot it before either side applies
        # actions so a same-tick swing cannot leak into the other decision.
        opponent_ordinary_attack_cooldown_remaining = self._flat(
            s.flip(s.attack_delay)).copy()

        completed = self._pending
        if completed is not None:
            completed.next_inputs = np.where(
                completed.done[:, None], 0.0, inputs)
            completed.next_defence_prayer_attack_history_codes = np.where(
                completed.done[:, None], 0, prayer_attack_history)
            completed.next_defence_prayer_own_prayer_history_codes = np.where(
                completed.done[:, None], 0, prayer_own_history)

        scores, _policy_value = self._score_policy(
            self.policy,
            inputs,
            prayer_history_codes,
            prior_state_history,
            prior_state_history_valid)
        behavior_scores = scores.copy()
        if hasattr(self.policy, "condition_direct_gear"):
            scores = self.policy.condition_direct_gear(
                scores,
                inputs,
                legal.mask,
                opponent_ordinary_attack_cooldown_remaining)
        if self.opponent_policy is not None:
            # Side 1 is driven by a different checkpoint (snapshot / cohort
            # opponent). Both halves are still scored in one batched call each.
            opp_scores, _opp_policy_value = self._score_policy(
                self.opponent_policy,
                inputs,
                prayer_history_codes,
                prior_state_history,
                prior_state_history_valid)
            opp_behavior_scores = opp_scores.copy()
            if hasattr(self.opponent_policy, "condition_direct_gear"):
                opp_scores = self.opponent_policy.condition_direct_gear(
                    opp_scores,
                    inputs,
                    legal.mask,
                    opponent_ordinary_attack_cooldown_remaining)
            pair_scores = scores.reshape(n, 2, -1)
            pair_scores[:, 1, :] = opp_scores.reshape(n, 2, -1)[:, 1, :]
            scores = pair_scores.reshape(n * 2, -1)
            pair_behavior_scores = behavior_scores.reshape(n, 2, -1)
            pair_behavior_scores[:, 1, :] = opp_behavior_scores.reshape(
                n, 2, -1)[:, 1, :]
            behavior_scores = pair_behavior_scores.reshape(n * 2, -1)

        # The row used for decision T becomes lag one only after both policies
        # have scored T. This is the explicit current-row exclusion rule.
        self._append_defence_prayer_prior_state_history(inputs)

        if self.replay_plan is not None:
            scores = np.full_like(scores, -1.0e12)
            for side in (0, 1):
                key = (int(s.tick[0]), side)
                forced = self.replay_plan.get(key)
                if forced is None:
                    raise ValueError(
                        f"replay plan missing episode_tick={key[0]} side={side}")
                if any(action < 0 or action >= scores.shape[1]
                       for action in forced):
                    raise ValueError(
                        f"replay plan action out of range at tick={key[0]} "
                        f"side={side}: {forced}")
                scores[side, np.asarray(forced, dtype=np.int64)] = 1.0e12
            # Java's replay hook forces the same array later exported as the
            # behavior/selected scores. These are QA sentinels, not policy
            # values, but retaining them makes the normalized replay exact.
            behavior_scores = scores.copy()

        picked = actions.pick_per_channel(
            scores,
            legal.mask,
            self.rng,
            self.epsilon,
            state=s,
            exploration_unit_mask=self._exploration_unit_mask)
        if self.replay_plan is not None:
            for side in (0, 1):
                key = (int(s.tick[0]), side)
                forced = self.replay_plan[key]
                expected_channels = (
                    next(action for action in forced
                         if schema.COMBAT_BASE <= action
                         < schema.COMBAT_SPEC_NONE),
                    next(action for action in forced
                         if schema.COMBAT_SPEC_NONE <= action
                         < schema.COMBAT_COUNT),
                    next(action for action in forced
                         if schema.DEFENCE_BASE <= action
                         < schema.DEFENCE_BASE + schema.DEFENCE_COUNT),
                    next(action for action in forced
                         if schema.MOVEMENT_BASE <= action
                         < schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT),
                    next(action for action in forced
                         if schema.SUPPLY_BASE <= action
                         < schema.SUPPLY_BASE + schema.SUPPLY_COUNT),
                )
                actual_channels = tuple(
                    int(picked["channel_chosen"][name][side])
                    for name in ("attack", "spec", "defence",
                                 "movement", "supply"))
                expected_gear = {
                    int(action) for action in forced
                    if action >= schema.GEAR_BASE
                }
                actual_gear = {
                    int(action)
                    for action in picked["causal_actual"][
                        side, schema.CHANNEL_GEAR_BASE:]
                    if action >= schema.GEAR_BASE
                }
                required_weapon = int(picked["required_weapon"][side])
                if required_weapon >= schema.GEAR_BASE:
                    actual_gear.add(required_weapon)
                if (actual_channels != expected_channels
                        or actual_gear != expected_gear):
                    raise ValueError(
                        "replay action mismatch "
                        f"tick={key[0]} side={side} "
                        f"plannedChannels={expected_channels} "
                        f"actualChannels={actual_channels} "
                        f"plannedGear={sorted(expected_gear)} "
                        f"actualGear={sorted(actual_gear)}")
        chosen = picked["chosen"]
        if self.replay_plan is not None:
            behavior_value = np.full(n * 2, 1.0e12, dtype=np.float64)
            representative_score = behavior_value.copy()
        else:
            behavior_value = np.max(
                np.where(legal.mask, behavior_scores, -np.inf),
                axis=1).astype(np.float64)
            representative_score = scores[
                np.arange(n * 2), chosen["combat"]].astype(np.float64)
        # Roll-time tank gear is owned by the defender's same-tick optional
        # gear decision. Keep that decision available while combat resolves;
        # roll-time prayer deliberately continues to target `_pending`, the
        # one-tick-old decision that could already be effective.
        self._current_roll_context = {
            "eligible": picked["eligible"],
            "virtual_none": picked["virtual_none"],
            "causal_actual": picked["causal_actual"],
            "reserved": picked["reserved"],
            "decision_tick": np.full(n * 2, self.world_tick, dtype=np.int64),
            # The offensive-style teacher must use exactly the delayed prayer
            # information that was visible when this action was chosen. Using
            # the defender's later same-tick prayer makes the label impossible
            # for the policy to reproduce.
            "decision_visible_defender_prayer_style_code": np.where(
                inputs[:, schema.INPUT_OPP_PROTECT_MELEE] > 0.5, 1,
                np.where(
                    inputs[:, schema.INPUT_OPP_PROTECT_RANGED] > 0.5, 2,
                    np.where(
                        inputs[:, schema.INPUT_OPP_PROTECT_MAGIC] > 0.5,
                        3,
                        0))).astype(np.int32),
            "legal_mask": picked["mask"],
            "attack_action": picked["channel_chosen"]["attack"],
            "spec_action": picked["channel_chosen"]["spec"],
            "tank_gear_teacher_action_count": np.zeros(
                n * 2, dtype=np.int32),
            "tank_gear_teacher_actions": np.full(
                (n * 2, 4), -1, dtype=np.int32),
            "offensive_style_teacher_action": np.full(
                n * 2, -1, dtype=np.int32),
            "offensive_style_teacher_attack_style_code": np.zeros(
                n * 2, dtype=np.int32),
            "offensive_style_teacher_defender_prayer_style_code": np.zeros(
                n * 2, dtype=np.int32),
            "roll_offensive_gear_teacher_action_count": np.zeros(
                n * 2, dtype=np.int32),
            "roll_offensive_gear_teacher_actions": np.full(
                (n * 2, 4), -1, dtype=np.int32),
            "roll_offensive_gear_teacher_attack_style_code": np.zeros(
                n * 2, dtype=np.int32),
        }

        # The observation above consumes last decision's supply flags. Clear
        # them only now so the action about to execute becomes visible on the
        # following decision instead of being erased before it is ever encoded.
        s.ate_food[:] = False
        s.drank_potion[:] = False
        self._apply_supply(chosen["supply"])
        # Consumable.animEat/animDrink call Player.resetActions(..., true),
        # which clears PlayerCombat's target before Player.process movement.
        # A later explicit attack command can establish it again; Vengeance's
        # trinket deliberately does not interrupt the route.
        s.combat_target &= ~(s.ate_food | s.drank_potion)
        self._record_defence_prayer_own_prayer_history()
        self._apply_prayer(chosen["defence"])

        # A successful explicit tile command owns the tick. With movement NONE,
        # the combat TargetRoute may still take its one source-backed step into
        # melee range and attack on that same tick.
        style, spec, off_tick = actions.decode_combat(chosen["combat"])
        tick_start_weapon = self._flat(s.weapon_id).copy()
        self._apply_direct_gear(chosen["combat"], picked["gear"])
        self._ensure_magic_supply_slot(self._pair(style, n))
        spec_accepted = self._apply_spec_intent(
            self._pair(spec, n),
            self._pair(off_tick, n),
            self._pair(tick_start_weapon, n))
        plan = self._plan_combat(style, spec, off_tick)
        supply_followup_reachable = self._can_attack_observed(s.style)
        reach, spec_pair = plan["reach"], plan["spec"]
        base = plan["wants_style"] & plan["ready"] & (~plan["off_tick"]) & plan["can_fight"]
        base &= (spec_pair < 0) | spec_accepted

        # The shared NH decisions have all run, including supplies, prayer and
        # gear. Player.processHits then resolves due damage before that player
        # can move or swing. Applying the batched impacts here preserves that
        # boundary and prevents a fighter killed by an arriving hit from
        # executing the movement/attack it selected moments earlier.
        self._apply_pending_damage(arriving_hits)
        # Entity.processHits schedules auto-retaliation through an event with
        # e.delay(1). Test the real pre-manager combat target: the manager's
        # staging target is not a live PlayerCombat target.
        styled_hit = (
            (arriving_hits["hit_damage"] > 0)
            & (arriving_hits["hit_styles"] >= 0))
        schedules_retaliation = (
            styled_hit.any(axis=2)
            & ~persistent_route_ready
            & (s.lock_ticks <= 0)
            & (s.retaliation_due_tick < 0))
        s.retaliation_due_tick = np.where(
            schedules_retaliation,
            self.world_tick + 2,
            s.retaliation_due_tick)
        still_fighting = (s.hp > 0) & s.flip(s.hp > 0)
        base &= still_fighting

        able_before = self._can_attack_from_here(reach)
        adjacent_before = self._can_attack_from_here(np.ones_like(reach))

        movement_plan = self._prepare_movement(chosen["movement"])
        movement_energy_before = movement_plan["energy_before"]
        explicit_movement = np.zeros((n, 2), dtype=bool)
        same_tick_attack_executed = np.zeros((n, 2), dtype=bool)
        ordinary = spec_pair < 0
        combat_roll_context = self._combat_roll_context()

        # World.players processes a complete player slot before the next slot:
        # explicit movement, TargetRoute movement, then that player's attack.
        # In particular, side 1 cannot stand under side 0 early enough to
        # cancel side 0's already-planned adjacent attack.
        for side in (0, 1):
            retaliation_due = (
                (s.retaliation_due_tick[:, side] >= 0)
                & (s.retaliation_due_tick[:, side] <= self.world_tick))
            staged_movement_issued = movement_plan["issued"][:, side]
            s.combat_target[:, side] |= (
                retaliation_due & ~staged_movement_issued)

            movement_issued = self._apply_movement_side(
                movement_plan, side)
            explicit_movement[:, side] = (
                movement_issued
                & (movement_plan["intent"][:, side] != schema.MOVE_NONE))
            s.combat_target[:, side] &= ~explicit_movement[:, side]

            wants_command = (
                plan["wants_style"][:, side]
                & ~explicit_movement[:, side]
                & ((spec_pair[:, side] < 0)
                   | spec_accepted[:, side])
                & still_fighting[:, side])
            overlapping = s.distance() == 0
            magic_overlap = (
                wants_command
                & (plan["style"][:, side] == schema.STYLE_MAGIC)
                & overlapping)
            s.combat_target[:, side] |= wants_command & ~magic_overlap
            route_ready = (
                (persistent_route_ready[:, side] | wants_command)
                & s.combat_target[:, side])
            self._apply_persistent_combat_route(
                reach,
                movement_energy_before,
                magic_overlap[:, None],
                route_ready[:, None],
                sides=(side,))

            able_after = self._can_attack_from_here(reach)[:, side]
            adjacent_after = self._can_attack_from_here(
                np.ones_like(reach))[:, side]
            attacking_side = (
                base[:, side]
                & ordinary[:, side]
                & able_after
                & ~explicit_movement[:, side]
                & ~magic_overlap)
            speccing_side = (
                base[:, side]
                & ~ordinary[:, side]
                & adjacent_after
                & ~explicit_movement[:, side])
            attacking = np.zeros((n, 2), dtype=bool)
            speccing = np.zeros((n, 2), dtype=bool)
            attacking[:, side] = attacking_side
            speccing[:, side] = speccing_side

            same_tick_attack_executed[:, side] = (
                wants_command
                & (s.attack_delay[:, side] <= 0)
                & ~plan["off_tick"][:, side]
                & ~explicit_movement[:, side]
                & ~magic_overlap)
            self._resolve_attacks(
                attacking,
                speccing,
                spec_pair,
                roll_context=combat_roll_context)
            # The retaliation background event runs before movement. A real
            # direct-movement command later in the same player slot resets the
            # target, so it must remain cleared for the next decision.
            s.retaliation_due_tick[:, side] = np.where(
                retaliation_due,
                -1,
                s.retaliation_due_tick[:, side])
        # NhStakerSelfPlayManager.maintainPair runs after player processing
        # and forcePairTarget restores any target cleared by direct movement or
        # an overlapping TargetRoute reset.
        s.combat_target[:] = (
            (s.hp > 0)
            & s.flip(s.hp > 0)
            & (s.lock_ticks <= 0))
        self._finalize_supply_rewards(
            same_tick_attack_executed,
            supply_followup_reachable)
        self._finalize_tank_reward_events()

        self._settle_visible_state()
        reward, done = self._settle_deaths()

        record = TickRecord(
            inputs=inputs,
            next_inputs=None,  # filled in by the next call to step() or flush()
            defence_prayer_attack_history_codes=prayer_attack_history,
            defence_prayer_own_prayer_history_codes=prayer_own_history,
            next_defence_prayer_attack_history_codes=None,
            next_defence_prayer_own_prayer_history_codes=None,
            legal_mask=picked["mask"],
            sampling_support=picked["support"],
            chosen=chosen,
            greedy=picked["greedy"],
            channel_chosen=picked["channel_chosen"],
            channel_greedy=picked["channel_greedy"],
            behaviour_prob=picked["prob"],
            eligible=picked["eligible"],
            alternatives=picked["alternatives"],
            deviated=picked["deviated"],
            causal_actual=picked["causal_actual"],
            causal_greedy=picked["causal_greedy"],
            causal_prob=picked["causal_prob"],
            virtual_none=picked["virtual_none"],
            reserved=picked["reserved"],
            dependent=picked["dependent"],
            dependent_actions=picked["dependent_actions"],
            required_weapon=picked["required_weapon"],
            value=behavior_value,
            selected_q=representative_score,
            selected_score=representative_score,
            reward=reward,
            done=done,
            episode_id=self._flat(s.episode_id).copy(),
            decision_tick=np.full(n * 2, self.world_tick, dtype=np.int64),
            episode_tick=np.repeat(s.tick, 2),
            bot_index=self._flat(s.bot_index).copy(),
            target_index=self._flat(s.flip(s.bot_index)).copy(),
            alive_mask=np.repeat(alive, 2),
            visible_threat_defence_index=visible_threat_index,
            visible_threat_damage=visible_threat_damage,
            roll_prayer_teacher_action=np.full(
                n * 2, -1, dtype=np.int32),
            roll_prayer_teacher_attack_style_code=np.full(
                n * 2, 0, dtype=np.int32),
            tank_gear_teacher_action_count=self._current_roll_context[
                "tank_gear_teacher_action_count"],
            tank_gear_teacher_actions=self._current_roll_context[
                "tank_gear_teacher_actions"],
            offensive_style_teacher_action=self._current_roll_context[
                "offensive_style_teacher_action"],
            offensive_style_teacher_attack_style_code=self._current_roll_context[
                "offensive_style_teacher_attack_style_code"],
            offensive_style_teacher_defender_prayer_style_code=self._current_roll_context[
                "offensive_style_teacher_defender_prayer_style_code"],
            roll_offensive_gear_teacher_action_count=self._current_roll_context[
                "roll_offensive_gear_teacher_action_count"],
            roll_offensive_gear_teacher_actions=self._current_roll_context[
                "roll_offensive_gear_teacher_actions"],
            roll_offensive_gear_teacher_attack_style_code=self._current_roll_context[
                "roll_offensive_gear_teacher_attack_style_code"],
            vengeance_trinket_blocker_mask=vengeance_blockers,
            vengeance_trinket_cast_count=vengeance_casts,
            vengeance_trinket_item_count=vengeance_items,
            vengeance_trinket_last_cast_tick=vengeance_last_cast,
            vengeance_trinket_legal=vengeance_legal,
            vengeance_opportunity_roll_tick=np.full(
                n * 2, -1, dtype=np.int64),
            vengeance_opportunity_expected_damage=np.zeros(
                n * 2, dtype=np.float64),
            reward_events=self._reward_event_builder.freeze(),
        )

        self._pending = record
        self._current_roll_context = None
        s.tick += 1
        self.world_tick += 1
        np.maximum(s.lock_ticks - 1, 0, out=s.lock_ticks)
        s.alive &= (s.hp > 0).all(axis=1) & (s.tick < self.max_ticks)
        return completed

    def flush(self):
        """Close out the last record by observing the final state."""
        record = self._pending
        if record is None:
            return None
        legal = actions.compute(self.state, self.gear_tables)
        final_inputs = observation.build(
            self.state, self.gear_tables, legal,
            decision_tick=self.world_tick)
        record.next_inputs = np.where(
            record.done[:, None], 0.0, final_inputs)
        final_attack_history = self._flat(
            self.state.defence_prayer_attack_history_codes)
        final_own_history = self._flat(
            self.state.defence_prayer_own_prayer_history_codes)
        record.next_defence_prayer_attack_history_codes = np.where(
            record.done[:, None], 0, final_attack_history)
        record.next_defence_prayer_own_prayer_history_codes = np.where(
            record.done[:, None], 0, final_own_history)
        self._pending = None
        return record

    # -- tick stages ---------------------------------------------------------

    def _advance_timers(self):
        s = self.state
        np.maximum(s.attack_delay - 1, 0, out=s.attack_delay)
        np.maximum(s.eat_delay - 1, 0, out=s.eat_delay)
        np.maximum(s.pot_delay - 1, 0, out=s.pot_delay)
        np.maximum(s.freeze_ticks - 1, 0, out=s.freeze_ticks)
        np.maximum(s.freeze_immunity - 1, 0, out=s.freeze_immunity)
        np.maximum(s.vengeance_cooldown - 1, 0, out=s.vengeance_cooldown)
        s.ticks_since_attack += 1
        s.ticks_since_spec += 1
        s.opp_ticks_since_observed_attack += 1

        # Prayer drain, exactly as PlayerPrayer.process does it: a counter ticks
        # up by the total drain of everything switched on, and a point comes off
        # each time it passes the gear's resistance.
        #
        #     drainCounter += drainTotal
        #     resistance = 60 + prayerBonus * 2
        #     if(drainCounter > resistance) { drain(counter / resistance);
        #                                     counter %= resistance }
        #
        # The offensive prayer (Piety / Rigour / Augury, 24 each) is always on -
        # its bonuses are baked into the accuracy maths - and an overhead adds
        # another 12. The resistance depends on the set being worn, so the mage
        # set drains slowest. This replaces a flat 0.5/tick guess that ran
        # 10-25% too fast and did not vary by gear.
        has_points = s.prayer_points > 0
        praying = (s.overhead >= 0) & has_points
        drain_total = (np.where(has_points, PRAYER_DRAIN_OFFENSIVE, 0)
                       + np.where(praying, PRAYER_DRAIN_OVERHEAD, 0))

        prayer_bonus = self.gear_tables["set_bonuses"][
            np.maximum(s.style, 0)][..., schema.PRAYER_BONUS]
        resistance = 60 + prayer_bonus * 2

        self._drain_counter += drain_total
        over = self._drain_counter > resistance
        lost = np.where(over, self._drain_counter // resistance, 0)
        s.prayer_points = np.maximum(0, s.prayer_points - lost)
        self._drain_counter = np.where(over, self._drain_counter % resistance,
                                       self._drain_counter)
        # Prayer runs out: the overhead drops.
        s.overhead = np.where(s.prayer_points <= 0, -1, s.overhead)
        # NhStakerBot.run calls ensurePrayerPoints before every policy
        # decision. It restores Prayer to the fixed level, so the raw drain
        # occurs in Kronos but is never visible to this policy.
        s.prayer_points[:] = MAX_PRAYER_POINTS

        self._spec_regen_counter += 1
        if self._spec_regen_counter >= SPEC_REGEN_TICKS:
            self._spec_regen_counter = 0
            s.special_energy = np.minimum(
                MAX_SPECIAL_ENERGY, s.special_energy + SPEC_REGEN_AMOUNT)

    def _take_pending_damage(self):
        """Advance the hit queue and retain hits due after this decision."""
        s = self.state
        arriving = s.pending_damage[:, :, 0].copy()
        arriving_style = s.pending_style_of_hit[:, :, 0].copy()
        arriving_source_tick = s.pending_source_tick[:, :, 0].copy()
        arriving_hit_damage = s.pending_hit_damage[:, :, 0, :].copy()
        arriving_hit_styles = s.pending_hit_styles[:, :, 0, :].copy()
        arriving_hit_expected = (
            s.pending_hit_expected_damage[:, :, 0, :].copy())
        arriving_hit_source_ticks = (
            s.pending_hit_source_ticks[:, :, 0, :].copy())
        arriving_hit_defence_ticks = (
            s.pending_hit_defence_ticks[:, :, 0, :].copy())
        arriving_hit_tank_ticks = (
            s.pending_hit_tank_ticks[:, :, 0, :].copy())
        arriving_hit_defensive_gear_masks = (
            s.pending_hit_defensive_gear_masks[:, :, 0, :].copy())
        arriving_hit_offensive_gear_masks = (
            s.pending_hit_offensive_gear_masks[:, :, 0, :].copy())
        arriving_hit_vengeance_reflection = (
            s.pending_hit_vengeance_reflection[:, :, 0, :].copy())
        arriving_hit_vengeance_source_ticks = (
            s.pending_hit_vengeance_source_ticks[:, :, 0, :].copy())
        arriving_hit_vengeance_trigger_ticks = (
            s.pending_hit_vengeance_trigger_ticks[:, :, 0, :].copy())
        arriving_hit_spec_ticks = (
            s.pending_hit_spec_ticks[:, :, 0, :].copy())
        arriving_hit_spec_kinds = (
            s.pending_hit_spec_kinds[:, :, 0, :].copy())
        arriving_hit_count = s.pending_hit_count[:, :, 0].copy()

        s.pending_damage[:, :, :-1] = s.pending_damage[:, :, 1:]
        s.pending_damage[:, :, -1] = 0
        s.pending_style_of_hit[:, :, :-1] = s.pending_style_of_hit[:, :, 1:]
        s.pending_style_of_hit[:, :, -1] = -1
        s.pending_source_tick[:, :, :-1] = s.pending_source_tick[:, :, 1:]
        s.pending_source_tick[:, :, -1] = -1
        s.pending_hit_damage[:, :, :-1, :] = (
            s.pending_hit_damage[:, :, 1:, :])
        s.pending_hit_damage[:, :, -1, :] = 0
        s.pending_hit_styles[:, :, :-1, :] = (
            s.pending_hit_styles[:, :, 1:, :])
        s.pending_hit_styles[:, :, -1, :] = -1
        s.pending_hit_expected_damage[:, :, :-1, :] = (
            s.pending_hit_expected_damage[:, :, 1:, :])
        s.pending_hit_expected_damage[:, :, -1, :] = 0.0
        s.pending_hit_source_ticks[:, :, :-1, :] = (
            s.pending_hit_source_ticks[:, :, 1:, :])
        s.pending_hit_source_ticks[:, :, -1, :] = -1
        s.pending_hit_defence_ticks[:, :, :-1, :] = (
            s.pending_hit_defence_ticks[:, :, 1:, :])
        s.pending_hit_defence_ticks[:, :, -1, :] = -1
        s.pending_hit_tank_ticks[:, :, :-1, :] = (
            s.pending_hit_tank_ticks[:, :, 1:, :])
        s.pending_hit_tank_ticks[:, :, -1, :] = -1
        s.pending_hit_defensive_gear_masks[:, :, :-1, :] = (
            s.pending_hit_defensive_gear_masks[:, :, 1:, :])
        s.pending_hit_defensive_gear_masks[:, :, -1, :] = 0
        s.pending_hit_offensive_gear_masks[:, :, :-1, :] = (
            s.pending_hit_offensive_gear_masks[:, :, 1:, :])
        s.pending_hit_offensive_gear_masks[:, :, -1, :] = 0
        s.pending_hit_vengeance_reflection[:, :, :-1, :] = (
            s.pending_hit_vengeance_reflection[:, :, 1:, :])
        s.pending_hit_vengeance_reflection[:, :, -1, :] = False
        s.pending_hit_vengeance_source_ticks[:, :, :-1, :] = (
            s.pending_hit_vengeance_source_ticks[:, :, 1:, :])
        s.pending_hit_vengeance_source_ticks[:, :, -1, :] = -1
        s.pending_hit_vengeance_trigger_ticks[:, :, :-1, :] = (
            s.pending_hit_vengeance_trigger_ticks[:, :, 1:, :])
        s.pending_hit_vengeance_trigger_ticks[:, :, -1, :] = -1
        s.pending_hit_spec_ticks[:, :, :-1, :] = (
            s.pending_hit_spec_ticks[:, :, 1:, :])
        s.pending_hit_spec_ticks[:, :, -1, :] = -1
        s.pending_hit_spec_kinds[:, :, :-1, :] = (
            s.pending_hit_spec_kinds[:, :, 1:, :])
        s.pending_hit_spec_kinds[:, :, -1, :] = -1
        s.pending_hit_count[:, :, :-1] = s.pending_hit_count[:, :, 1:]
        s.pending_hit_count[:, :, -1] = 0

        return {
            "damage": arriving,
            "style": arriving_style,
            "source_tick": arriving_source_tick,
            "hit_damage": arriving_hit_damage,
            "hit_styles": arriving_hit_styles,
            "hit_expected": arriving_hit_expected,
            "hit_source_ticks": arriving_hit_source_ticks,
            "hit_defence_ticks": arriving_hit_defence_ticks,
            "hit_tank_ticks": arriving_hit_tank_ticks,
            "hit_defensive_gear_masks": arriving_hit_defensive_gear_masks,
            "hit_offensive_gear_masks": arriving_hit_offensive_gear_masks,
            "hit_vengeance_reflection": arriving_hit_vengeance_reflection,
            "hit_vengeance_source_ticks": (
                arriving_hit_vengeance_source_ticks),
            "hit_vengeance_trigger_ticks": (
                arriving_hit_vengeance_trigger_ticks),
            "hit_spec_ticks": arriving_hit_spec_ticks,
            "hit_spec_kinds": arriving_hit_spec_kinds,
            "hit_count": arriving_hit_count,
        }

    def _apply_pending_damage(self, arriving_hits):
        """Apply due hits after the policy decision, like Player.processHits."""
        s = self.state
        # The previous impact was consumed by this tick's observation. A quiet
        # impact phase must expose zero to the following decision rather than
        # repeating it.
        s.last_taken_hit[:] = 0
        s.last_dealt_hit[:] = 0
        s.last_taken_source_tick[:] = -1
        s.last_dealt_source_tick[:] = -1
        s.last_hit_damage[:] = 0
        s.last_hit_source_ticks[:] = -1
        s.last_hit_prayer_ticks[:] = -1
        s.last_hit_tank_ticks[:] = -1
        s.last_hit_defensive_gear_masks[:] = 0
        s.last_hit_offensive_gear_masks[:] = 0
        s.last_hit_vengeance_reflection[:] = False
        s.last_hit_vengeance_source_ticks[:] = -1
        s.last_hit_vengeance_trigger_ticks[:] = -1
        s.last_hit_count[:] = 0

        arriving = arriving_hits["damage"]
        arriving_style = arriving_hits["style"]
        arriving_source_tick = arriving_hits["source_tick"]
        arriving_hit_damage = arriving_hits["hit_damage"]
        arriving_hit_styles = arriving_hits["hit_styles"]
        arriving_hit_count = arriving_hits["hit_count"]
        has_hit_metadata = (arriving_hit_count > 0).any()
        if not arriving.any() and not has_hit_metadata:
            self._resolve_expired_spec_outcomes()
            return

        s.hp = np.maximum(0, s.hp - arriving)
        s.last_taken_hit = arriving
        s.last_dealt_hit = s.flip(arriving)
        s.last_taken_source_tick = arriving_source_tick
        s.last_dealt_source_tick = s.flip(arriving_source_tick)
        s.damage_taken += arriving
        s.damage_dealt += s.flip(arriving)

        # Preserve the old scalar metadata as a narrow test/debug interface.
        # Runtime-queued hits always populate the per-hit buffer below.
        legacy = (
            (arriving > 0)
            & (arriving_hit_count == 0)
            & (arriving_style >= 0))
        arriving_hit_damage[legacy, 0] = arriving[legacy]
        arriving_hit_styles[legacy, 0] = arriving_style[legacy]
        arriving_hit_count = np.where(legacy, 1, arriving_hit_count)
        s.last_hit_damage[:] = arriving_hit_damage
        s.last_hit_source_ticks[:] = arriving_hits["hit_source_ticks"]
        s.last_hit_prayer_ticks[:] = arriving_hits["hit_defence_ticks"]
        s.last_hit_tank_ticks[:] = arriving_hits["hit_tank_ticks"]
        s.last_hit_defensive_gear_masks[:] = (
            arriving_hits["hit_defensive_gear_masks"])
        s.last_hit_offensive_gear_masks[:] = (
            arriving_hits["hit_offensive_gear_masks"])
        s.last_hit_vengeance_reflection[:] = (
            arriving_hits["hit_vengeance_reflection"])
        s.last_hit_vengeance_source_ticks[:] = (
            arriving_hits["hit_vengeance_source_ticks"])
        s.last_hit_vengeance_trigger_ticks[:] = (
            arriving_hits["hit_vengeance_trigger_ticks"])
        s.last_hit_count[:] = arriving_hit_count
        self._record_style_read(
            arriving_hit_styles, arriving_hit_count, arriving_hit_damage)
        self._book_landed_expected_damage(
            arriving_hits["hit_expected"],
            arriving_hits["hit_source_ticks"],
            arriving_hits["hit_defence_ticks"],
            arriving_hits["hit_tank_ticks"],
            arriving_hits["hit_defensive_gear_masks"],
            arriving_hits["hit_offensive_gear_masks"],
            arriving_hits["hit_vengeance_reflection"],
            arriving_hit_count)
        self._resolve_landed_spec_outcomes(
            arriving_hit_damage,
            arriving_hits["hit_spec_ticks"],
            arriving_hits["hit_spec_kinds"],
            arriving_hit_count)
        self._resolve_expired_spec_outcomes()
        self._apply_vengeance_reflect(
            arriving_hit_damage,
            arriving_hit_styles,
            arriving_hit_count,
            arriving_hits["hit_source_ticks"])

    def _land_pending_damage(self):
        """Immediately drain one queue slot for focused component tests."""
        self._apply_pending_damage(self._take_pending_damage())

    def _spec_reward_contributors(self, fight_index, side, launch_tick):
        """Mirror NhStakerBot.specRewardContributors."""
        s = self.state
        setup_tick = int(
            s.pending_spec_optional_vls_setup_tick[fight_index, side])
        kind = int(s.pending_spec_kind[fight_index, side])
        combat = reward_events.RewardContributor(
            source_tick=launch_tick,
            target_decision_tick=launch_tick,
            causal_unit=reward_events.UNIT_COMBAT,
            weight=0.5 if (
                kind == schema.SPEC_VESTA_LONGSWORD
                and setup_tick == launch_tick - 1) else 1.0)
        if (
            kind != schema.SPEC_VESTA_LONGSWORD
            or setup_tick != launch_tick - 1
        ):
            return (combat,)
        return (
            combat,
            reward_events.RewardContributor(
                source_tick=launch_tick,
                target_decision_tick=setup_tick,
                causal_unit=(
                    schema.CHANNEL_GEAR_BASE
                    + schema.OPTIONAL_GEAR_SLOTS.index(gear.SLOT_WEAPON)),
                gear_slot=gear.SLOT_WEAPON,
                weight=0.5),
        )

    def _commit_spec_outcome(self, fight_index, side, reward):
        s = self.state
        launch_tick = int(s.pending_spec_tick[fight_index, side])
        if launch_tick < 0 or reward == 0.0:
            return
        s.pending_spec_outcome_reward[fight_index, side] += reward
        self._append_reward_event(
            fight_index,
            side,
            reward_events.EVENT_SPEC_OUTCOME,
            reward,
            self._spec_reward_contributors(
                fight_index, side, launch_tick),
            self.world_tick + 1)

    def _clear_pending_spec_outcome(self, fight_index, side):
        s = self.state
        s.pending_spec_tick[fight_index, side] = -1
        s.pending_spec_optional_vls_setup_tick[fight_index, side] = -1
        s.pending_spec_kind[fight_index, side] = -1
        s.pending_spec_double[fight_index, side] = False
        s.pending_spec_opponent_hp[fight_index, side] = 0
        s.pending_spec_launch_observed[fight_index, side] = False

    def _resolve_landed_spec_outcomes(
            self, hit_damage, hit_spec_ticks, hit_spec_kinds, hit_count):
        """Resolve damage-bearing special rolls using their launch provenance."""
        s = self.state
        pending_rows = np.flatnonzero(s.pending_spec_tick.reshape(-1) >= 0)
        for flat_row in pending_rows:
            fight_index, attacker_side = divmod(int(flat_row), 2)
            launch_tick = int(
                s.pending_spec_tick[fight_index, attacker_side])
            kind = int(s.pending_spec_kind[fight_index, attacker_side])
            target_side = 1 - attacker_side
            count = int(hit_count[fight_index, target_side])
            if count <= 0:
                continue
            matches = (
                (hit_spec_ticks[
                    fight_index, target_side, :count] == launch_tick)
                & (hit_spec_kinds[
                    fight_index, target_side, :count] == kind))
            if not matches.any():
                continue
            s.pending_spec_launch_observed[
                fight_index, attacker_side] = True
            dealt = int(hit_damage[
                fight_index, target_side, :count][matches].sum())
            if dealt <= 0:
                continue
            double = bool(
                s.pending_spec_double[fight_index, attacker_side])
            killed = s.hp[fight_index, target_side] <= 0
            reward = 0.0
            if killed:
                reward += (
                    REWARD_SPEC_OUTCOME_KILL_BONUS
                    * (1.08 if double else 0.92))
            expected_hit = (
                52.0 if double else
                46.0 if kind == schema.SPEC_ARMADYL_GODSWORD else
                32.0)
            reward += (
                REWARD_SPEC_OUTCOME_DAMAGE_SCALE
                * min(1.0, dealt / expected_hit))
            self._commit_spec_outcome(
                fight_index, attacker_side, reward)
            self._clear_pending_spec_outcome(
                fight_index, attacker_side)

    def _resolve_expired_spec_outcomes(self):
        """Apply the sparse-profile whiff once a launched spec ages out."""
        s = self.state
        pending = s.pending_spec_tick
        expired_rows = np.flatnonzero(
            ((pending >= 0)
             & (self.world_tick + 1 - pending
                >= SPEC_OUTCOME_WINDOW_TICKS)).reshape(-1))
        for flat_row in expired_rows:
            fight_index, side = divmod(int(flat_row), 2)
            if s.pending_spec_launch_observed[fight_index, side]:
                double = bool(
                    s.pending_spec_double[fight_index, side])
                reward = (
                    -REWARD_SPEC_OUTCOME_WHIFF_PENALTY
                    * (1.15 if double else 0.90))
                self._commit_spec_outcome(
                    fight_index, side, reward)
            self._clear_pending_spec_outcome(fight_index, side)

    def _update_reward_observation(self):
        """Consume the neural_sparse events visible at this decision.

        NhStakerBot.updateRewardEpisode uses expected launch damage for the
        direct combat terms, actual landed damage for an eight-decision rolling
        DPS/DTPS window, and the roll-time prayer result. The exporter keeps
        these values in inputs 20-22 while writing non-terminal transition
        reward as zero; the latter is handled by _settle_deaths.
        """
        s = self.state
        fight, side = np.indices((self.n_fights, 2))
        slot = s.recent_damage_cursor
        # Replacing an occupied slot removes one or more sources; writing an
        # occupied slot adds them. Empty-to-empty rotation leaves both the
        # contributor order and its floating allocations unchanged.
        contributor_window_changed = (
            (s.recent_hit_count[fight, side, slot] > 0)
            | (s.last_hit_count > 0))
        self._rolling_reward_contributor_cache[
            contributor_window_changed] = None
        s.recent_damage_window[fight, side, slot] = s.last_dealt_hit
        s.recent_taken_window[fight, side, slot] = s.last_taken_hit
        s.recent_damage_source_tick[
            fight, side, slot] = s.last_dealt_source_tick
        s.recent_taken_source_tick[
            fight, side, slot] = s.last_taken_source_tick
        s.recent_hit_damage[fight, side, slot, :] = s.last_hit_damage
        s.recent_hit_source_ticks[
            fight, side, slot, :] = s.last_hit_source_ticks
        s.recent_hit_prayer_ticks[
            fight, side, slot, :] = s.last_hit_prayer_ticks
        s.recent_hit_tank_ticks[
            fight, side, slot, :] = s.last_hit_tank_ticks
        s.recent_hit_defensive_gear_masks[
            fight, side, slot, :] = s.last_hit_defensive_gear_masks
        s.recent_hit_offensive_gear_masks[
            fight, side, slot, :] = s.last_hit_offensive_gear_masks
        s.recent_hit_vengeance_reflection[
            fight, side, slot, :] = s.last_hit_vengeance_reflection
        s.recent_hit_vengeance_source_ticks[
            fight, side, slot, :] = s.last_hit_vengeance_source_ticks
        s.recent_hit_vengeance_trigger_ticks[
            fight, side, slot, :] = s.last_hit_vengeance_trigger_ticks
        s.recent_hit_count[fight, side, slot] = s.last_hit_count
        s.recent_damage_cursor = (
            s.recent_damage_cursor + 1) % DPS_ROLLING_WINDOW_TICKS

        current_dps = (
            s.recent_damage_window.sum(axis=2)
            / float(DPS_ROLLING_WINDOW_TICKS))
        current_dtps = (
            s.recent_taken_window.sum(axis=2)
            / float(DPS_ROLLING_WINDOW_TICKS))
        self._emit_rolling_reward_events(current_dps, current_dtps)
        # Supply is committed after updateRewardEpisode and its delta is
        # overwritten on the following decision. Spec outcome is committed
        # inside updateRewardEpisode, so it remains visible in both the delta
        # and running-total inputs for that decision.
        s.reward_total += s.pending_supply_reward
        delta = (
            s.pending_expected_reward
            + current_dps * REWARD_DPS_WEIGHT
            - current_dtps * REWARD_DTPS_WEIGHT
            + s.pending_roll_prayer_reward
            + np.clip(
                s.pending_roll_tank_gear_reward,
                -REWARD_ROLL_TANK_MAX_PENALTY,
                REWARD_ROLL_TANK_MAX_BONUS)
            + s.pending_freeze_reward
            + s.pending_spec_outcome_reward)

        s.reward_delta = delta
        s.reward_total += delta
        s.reward_dps = current_dps
        s.pending_expected_reward[:] = 0.0
        s.pending_roll_prayer_reward[:] = 0.0
        s.pending_roll_tank_gear_reward[:] = 0.0
        s.pending_freeze_reward[:] = 0.0
        s.pending_supply_reward[:] = 0.0
        s.pending_spec_outcome_reward[:] = 0.0

    def _append_reward_event(
        self,
        fight_index,
        side,
        event_type,
        reward,
        contributors,
        resolution_tick,
    ):
        """Append one already-routed event for the current NHEV stream."""
        reward = float(reward)
        if reward == 0.0 or not contributors:
            return
        s = self.state
        bot_index = int(s.bot_index[fight_index, side])
        episode_id = int(s.episode_id[fight_index, side])
        if isinstance(
                contributors, reward_events.RewardContributorColumns):
            self._reward_event_builder.append_columns(
                bot_index=bot_index,
                episode_id=episode_id,
                event_type=int(event_type),
                resolution_tick=int(resolution_tick),
                original_reward=reward,
                contributors=contributors)
        else:
            self._reward_event_builder.append_contributors(
                bot_index=bot_index,
                episode_id=episode_id,
                event_type=int(event_type),
                resolution_tick=int(resolution_tick),
                original_reward=reward,
                contributors=tuple(contributors))

    def _prior_decision_tick(self, fight_index, side, source_tick):
        """Return the effective pre-roll decision for a one-tick-delayed unit."""
        pending = self._pending
        if pending is None:
            return None
        row = int(fight_index) * 2 + int(side)
        if (
            pending.done[row]
            or int(pending.episode_id[row])
            != int(self.state.episode_id[fight_index, side])
        ):
            return None
        decision_tick = int(pending.decision_tick[row])
        if decision_tick > int(source_tick) - 1:
            return None
        return decision_tick

    @staticmethod
    def _gear_reward_contributors(
            source_tick, target_tick, slot_mask, total_weight):
        slots = []
        remaining = int(slot_mask) & OPTIONAL_GEAR_SLOT_MASK
        while remaining:
            bit = remaining & -remaining
            slots.append(bit.bit_length() - 1)
            remaining ^= bit
        if not slots or target_tick < 0 or total_weight <= 0.0:
            return []
        weight = float(total_weight) / len(slots)
        return [
            reward_events.RewardContributor(
                source_tick=int(source_tick),
                target_decision_tick=int(target_tick),
                causal_unit=OPTIONAL_GEAR_UNIT_BY_SLOT[slot],
                gear_slot=slot,
                weight=weight)
            for slot in slots
        ]

    def _damage_source_contributors(
            self,
            *,
            source_tick,
            prayer_tick,
            tank_tick,
            defensive_gear_mask,
            offensive_gear_mask,
            source_weight,
            incoming,
            vengeance_reflection=False,
            vengeance_source_tick=-1,
            vengeance_trigger_tick=-1):
        """Resolve one Java NhStakerDamageRewardSource to concrete units."""
        source_weight = float(source_weight)
        if source_weight <= 0.0:
            return []
        if vengeance_reflection:
            causal_tick = (
                int(vengeance_trigger_tick)
                if incoming else int(vengeance_source_tick))
            if causal_tick < 0:
                return []
            return [reward_events.RewardContributor(
                source_tick=causal_tick,
                target_decision_tick=causal_tick,
                causal_unit=(
                    reward_events.UNIT_COMBAT
                    if incoming else reward_events.UNIT_SUPPLY),
                weight=source_weight)]

        source_tick = int(source_tick)
        if source_tick < 0:
            return []
        contributors = []
        if incoming:
            slot_mask = int(defensive_gear_mask)
            if slot_mask == 0:
                if int(prayer_tick) >= 0:
                    contributors.append(reward_events.RewardContributor(
                        source_tick=source_tick,
                        target_decision_tick=int(prayer_tick),
                        causal_unit=reward_events.UNIT_DEFENCE,
                        weight=source_weight))
                return contributors
            if int(prayer_tick) >= 0:
                contributors.append(reward_events.RewardContributor(
                    source_tick=source_tick,
                    target_decision_tick=int(prayer_tick),
                    causal_unit=reward_events.UNIT_DEFENCE,
                    weight=source_weight * 0.5))
            contributors.extend(self._gear_reward_contributors(
                source_tick,
                int(tank_tick),
                slot_mask,
                source_weight * 0.5))
            return contributors

        slot_mask = int(offensive_gear_mask)
        combat_weight = source_weight if slot_mask == 0 else source_weight * 0.5
        contributors.append(reward_events.RewardContributor(
            source_tick=source_tick,
            target_decision_tick=source_tick,
            causal_unit=reward_events.UNIT_COMBAT,
            weight=combat_weight))
        if slot_mask:
            contributors.extend(self._gear_reward_contributors(
                source_tick,
                source_tick,
                slot_mask,
                source_weight * 0.5))
        return contributors

    @staticmethod
    def _append_gear_reward_columns(
            columns, source_tick, target_tick, slot_mask, total_weight):
        slots = []
        remaining = int(slot_mask) & OPTIONAL_GEAR_SLOT_MASK
        while remaining:
            bit = remaining & -remaining
            slots.append(bit.bit_length() - 1)
            remaining ^= bit
        if not slots or target_tick < 0 or total_weight <= 0.0:
            return
        weight = float(total_weight) / len(slots)
        for slot in slots:
            columns[0].append(int(source_tick))
            columns[1].append(int(target_tick))
            columns[2].append(OPTIONAL_GEAR_UNIT_BY_SLOT[slot])
            columns[3].append(slot)
            columns[4].append(weight)

    def _append_damage_source_columns(
            self,
            columns,
            *,
            source_tick,
            prayer_tick,
            tank_tick,
            defensive_gear_mask,
            offensive_gear_mask,
            source_weight,
            incoming,
            vengeance_reflection=False,
            vengeance_source_tick=-1,
            vengeance_trigger_tick=-1):
        """Columnar form of one Java NhStakerDamageRewardSource."""
        source_weight = float(source_weight)
        if source_weight <= 0.0:
            return

        def append(source, target, unit, slot=-1, weight=source_weight):
            columns[0].append(int(source))
            columns[1].append(int(target))
            columns[2].append(int(unit))
            columns[3].append(int(slot))
            columns[4].append(float(weight))

        if vengeance_reflection:
            causal_tick = (
                int(vengeance_trigger_tick)
                if incoming else int(vengeance_source_tick))
            if causal_tick < 0:
                return
            append(
                causal_tick,
                causal_tick,
                (reward_events.UNIT_COMBAT
                 if incoming else reward_events.UNIT_SUPPLY))
            return

        source_tick = int(source_tick)
        if source_tick < 0:
            return
        if incoming:
            slot_mask = int(defensive_gear_mask)
            if slot_mask == 0:
                if int(prayer_tick) >= 0:
                    append(
                        source_tick,
                        int(prayer_tick),
                        reward_events.UNIT_DEFENCE)
                return
            if int(prayer_tick) >= 0:
                append(
                    source_tick,
                    int(prayer_tick),
                    reward_events.UNIT_DEFENCE,
                    weight=source_weight * 0.5)
            self._append_gear_reward_columns(
                columns,
                source_tick,
                int(tank_tick),
                slot_mask,
                source_weight * 0.5)
            return

        slot_mask = int(offensive_gear_mask)
        combat_weight = (
            source_weight if slot_mask == 0 else source_weight * 0.5)
        append(
            source_tick,
            source_tick,
            reward_events.UNIT_COMBAT,
            weight=combat_weight)
        if slot_mask:
            self._append_gear_reward_columns(
                columns,
                source_tick,
                source_tick,
                slot_mask,
                source_weight * 0.5)

    @staticmethod
    def _normalize_reward_contributors(contributors):
        total = sum(float(item.weight) for item in contributors)
        if total <= 0.0:
            return reward_events.RewardContributorColumns(
                (), (), (), (), ())
        return reward_events.RewardContributorColumns(
            source_tick=tuple(
                int(item.source_tick) for item in contributors),
            target_decision_tick=tuple(
                int(item.target_decision_tick) for item in contributors),
            causal_unit=tuple(
                int(item.causal_unit) for item in contributors),
            gear_slot=tuple(
                int(item.gear_slot) for item in contributors),
            weight=tuple(
                float(item.weight) / total for item in contributors),
        )

    @staticmethod
    def _normalize_reward_contributor_columns(columns):
        total = sum(float(weight) for weight in columns[4])
        if total <= 0.0:
            return reward_events.EMPTY_CONTRIBUTOR_COLUMNS
        return reward_events.RewardContributorColumns(
            source_tick=tuple(columns[0]),
            target_decision_tick=tuple(columns[1]),
            causal_unit=tuple(columns[2]),
            gear_slot=tuple(columns[3]),
            weight=tuple(float(weight) / total for weight in columns[4]),
        )

    def _build_rolling_reward_contributor_pair(
            self, fight_index, defender_side):
        """Build one hit window's ordered outgoing and incoming credit."""
        s = self.state
        defender_side = int(defender_side)
        cursor = int(s.recent_damage_cursor[fight_index, defender_side])
        order = ROLLING_WINDOW_ORDERS[cursor]
        sources = []
        total_damage = 0
        for window_slot in order:
            count = int(s.recent_hit_count[
                fight_index, defender_side, window_slot])
            for hit_index in range(count):
                damage = int(s.recent_hit_damage[
                    fight_index, defender_side, window_slot, hit_index])
                if damage <= 0:
                    continue
                total_damage += damage
                sources.append((window_slot, hit_index, damage))
        if total_damage <= 0:
            return (), ()

        outgoing = [[], [], [], [], []]
        incoming = [[], [], [], [], []]
        for window_slot, hit_index, damage in sources:
            get = lambda field: field[
                fight_index, defender_side, window_slot, hit_index]
            source_tick = int(get(s.recent_hit_source_ticks))
            prayer_tick = int(get(s.recent_hit_prayer_ticks))
            tank_tick = int(get(s.recent_hit_tank_ticks))
            defensive_gear_mask = int(
                get(s.recent_hit_defensive_gear_masks))
            offensive_gear_mask = int(
                get(s.recent_hit_offensive_gear_masks))
            source_weight = damage / float(total_damage)
            vengeance_reflection = bool(
                get(s.recent_hit_vengeance_reflection))
            vengeance_source_tick = int(
                get(s.recent_hit_vengeance_source_ticks))
            vengeance_trigger_tick = int(
                get(s.recent_hit_vengeance_trigger_ticks))
            self._append_damage_source_columns(
                outgoing,
                source_tick=source_tick,
                prayer_tick=prayer_tick,
                tank_tick=tank_tick,
                defensive_gear_mask=defensive_gear_mask,
                offensive_gear_mask=offensive_gear_mask,
                source_weight=source_weight,
                incoming=False,
                vengeance_reflection=vengeance_reflection,
                vengeance_source_tick=vengeance_source_tick,
                vengeance_trigger_tick=vengeance_trigger_tick)
            self._append_damage_source_columns(
                incoming,
                source_tick=source_tick,
                prayer_tick=prayer_tick,
                tank_tick=tank_tick,
                defensive_gear_mask=defensive_gear_mask,
                offensive_gear_mask=offensive_gear_mask,
                source_weight=source_weight,
                incoming=True,
                vengeance_reflection=vengeance_reflection,
                vengeance_source_tick=vengeance_source_tick,
                vengeance_trigger_tick=vengeance_trigger_tick)
        return (
            self._normalize_reward_contributor_columns(outgoing),
            self._normalize_reward_contributor_columns(incoming),
        )

    def _rolling_reward_contributor_pair(self, fight_index, defender_side):
        """Reuse credit until a source enters or leaves the rolling window."""
        cached = self._rolling_reward_contributor_cache[
            fight_index, defender_side]
        if cached is None:
            cached = self._build_rolling_reward_contributor_pair(
                fight_index, defender_side)
            self._rolling_reward_contributor_cache[
                fight_index, defender_side] = cached
        return cached

    def _rolling_reward_contributors(
            self, fight_index, side, incoming):
        """Route the actual-hit window without collapsing same-tick sources."""
        defender_side = int(side) if incoming else 1 - int(side)
        outgoing, taken = self._rolling_reward_contributor_pair(
            fight_index, defender_side)
        return taken if incoming else outgoing

    def _emit_rolling_reward_events(self, current_dps, current_dtps):
        """Route Java's eight-decision rolling damage rewards."""
        for fight_index in range(self.n_fights):
            contributor_pairs = [None, None]

            for side in range(2):
                dealt = float(current_dps[fight_index, side])
                if dealt > 0.0:
                    defender_side = 1 - side
                    if contributor_pairs[defender_side] is None:
                        contributor_pairs[defender_side] = (
                            self._rolling_reward_contributor_pair(
                                fight_index, defender_side))
                    contributors = contributor_pairs[defender_side][0]
                    self._append_reward_event(
                        fight_index,
                        side,
                        reward_events.EVENT_ROLLING_DPS,
                        dealt * REWARD_DPS_WEIGHT,
                        contributors,
                        self.world_tick)

                taken = float(current_dtps[fight_index, side])
                if taken > 0.0:
                    if contributor_pairs[side] is None:
                        contributor_pairs[side] = (
                            self._rolling_reward_contributor_pair(
                                fight_index, side))
                    contributors = contributor_pairs[side][1]
                    self._append_reward_event(
                        fight_index,
                        side,
                        reward_events.EVENT_ROLLING_DTPS,
                        -taken * REWARD_DTPS_WEIGHT,
                        contributors,
                        self.world_tick)

    def _vengeance_blocker_mask(self):
        """NhStakerBot.vengeanceTrinketMechanicalBlockerMask, DMM case."""
        s = self.state
        mask = np.zeros((self.n_fights, 2), dtype=np.int32)
        mask |= np.where(s.vengeance_active, 1 << 2, 0)
        mask |= np.where(s.vengeance_cooldown > 0, 1 << 3, 0)
        mask |= np.where(s.veng_trinket_casts >= 2, 1 << 4, 0)
        mask |= np.where(s.veng_trinket_count <= 0, 1 << 5, 0)
        mask |= np.where(s.lock_ticks > 0, 1 << 6, 0)
        return self._flat(mask)

    def _visible_threat_fields(self):
        """NhStakerBot's one-tick-old visible protection threat summary."""
        s = self.state
        weapon = s.seen_opp_weapon_id
        threat = gear.style_for_weapon(weapon)
        threat = np.where(threat >= 0, threat, s.seen_opp_style)

        dx = s.flip(s.x) - s.x
        dy = s.flip(s.y) - s.y
        frozen = s.seen_opp_frozen
        melee_range = gear.melee_standing_range(weapon)
        melee_now = self._melee_reachable(
            dx, dy, frozen, melee_range)
        # estimateOpponentSpecialEnergyClientSide starts at 100% and does not
        # expose Voidwaker/VLS spending. Using the opponent's true remaining
        # energy here leaked hidden state and understated the visible gmaul
        # follow-up after either of those specials had been used.
        visible_spec_energy = np.full_like(
            s.seen_opp_spec_energy, MAX_SPECIAL_ENERGY)
        voidwaker_magic = (
            (weapon == gear.VOIDWAKER.item_id)
            & (visible_spec_energy >= 500)
            & actions._melee_reach(dx, dy, frozen, 1))
        threat = np.where(
            voidwaker_magic, schema.STYLE_MAGIC, threat).astype(np.int32)

        distance = np.broadcast_to(
            s.distance()[:, None], (self.n_fights, 2))
        reachable = np.where(
            threat == schema.STYLE_MELEE,
            melee_now,
            (distance >= 1) & (distance <= 10))
        melee_max = np.full_like(threat, 48)
        melee_max = np.where(weapon == gear.VESTAS_LONGSWORD.item_id, 66,
                             melee_max)
        melee_max = np.where(weapon == gear.VOIDWAKER.item_id, 74, melee_max)
        melee_max = np.where(weapon == gear.GRANITE_MAUL.item_id, 40,
                             melee_max)
        first = np.where(
            threat == schema.STYLE_MAGIC, 33,
            np.where(threat == schema.STYLE_RANGED, 46, melee_max))
        followup = (
            (visible_spec_energy >= 500)
            & melee_now
            & ((threat == schema.STYLE_RANGED)
               | (threat == schema.STYLE_MELEE)))
        followup_max = np.where(
            (weapon == gear.GRANITE_MAUL.item_id)
            & (visible_spec_energy >= 1000),
            72,
            40)
        damage = np.where(
            (threat >= 0) & reachable,
            first + np.where(followup, followup_max, 0),
            0).astype(np.int32)
        return self._flat(threat).copy(), self._flat(damage).copy()

    def _effective_overhead(self):
        """The overhead that counts for a hit being rolled this tick.

        A prayer switch made on this same tick has not taken effect yet, so the
        previous overhead applies instead
        (PlayerCombat.nhStakerDefencePrayerSwitchTooFreshForHit, delay 1 tick).
        """
        s = self.state
        too_fresh = s.overhead_switch_tick == s.tick[:, None]
        return np.where(too_fresh, s.previous_overhead, s.overhead)

    @staticmethod
    def _style_history_codes(styles):
        styles = np.asarray(styles)
        return np.where(
            styles == schema.STYLE_MELEE, 1,
            np.where(
                styles == schema.STYLE_RANGED, 2,
                np.where(styles == schema.STYLE_MAGIC, 3, 0))
        ).astype(np.uint8)

    @staticmethod
    def _prayer_history_codes(overheads):
        overheads = np.asarray(overheads)
        return np.where(
            overheads == schema.PRAY_PROTECT_MELEE, 1,
            np.where(
                overheads == schema.PRAY_PROTECT_MISSILES, 2,
                np.where(overheads == schema.PRAY_PROTECT_MAGIC, 3, 0))
        ).astype(np.uint8)

    @staticmethod
    def _shift_history(history, active, newest):
        """Prepend one code for selected rows without disturbing other rows."""
        flat_history = history.reshape(-1, history.shape[-1])
        flat_active = np.asarray(active, dtype=bool).reshape(-1)
        if not flat_active.any():
            return
        rows = np.flatnonzero(flat_active)
        if flat_history.shape[1] > 1:
            flat_history[rows, 1:] = flat_history[rows, :-1]
        flat_history[rows, 0] = np.asarray(newest, dtype=np.uint8).reshape(-1)[
            rows]

    def _record_defence_prayer_own_prayer_history(self):
        """Publish this decision's starting protection prayer to T+1."""
        s = self.state
        active = np.broadcast_to(s.alive[:, None], s.overhead.shape)
        self._shift_history(
            s.defence_prayer_own_prayer_history_codes,
            active,
            self._prayer_history_codes(s.overhead))

    def _record_defence_prayer_attack_history(self, fired, hit_style):
        """Publish actual attack rolls to the defender's next decision.

        This is called only from resolved ordinary/spec roll paths, so selected
        attacks cancelled by movement, overlap, death, or legality never shift
        the history. `hit_style` is the roll style, not the worn weapon style;
        in particular a Voidwaker special records Magic.
        """
        s = self.state
        defender_fired = s.flip(np.asarray(fired, dtype=bool))
        defender_codes = s.flip(self._style_history_codes(hit_style))
        self._shift_history(
            s.defence_prayer_attack_history_codes,
            defender_fired,
            defender_codes)

    def _record_style_read(self, attack_styles, hit_count, hit_damage=None):
        """Track whether the attacker's visible weapon revealed the hit style.

        PlayerCombat.accumulateNhStakerVisibleStyleReliability compares the
        attacker's live weapon style with Hit.attackStyle when positive damage
        lands. The result belongs to the defender that observed it. It is not a
        prayer-correctness statistic, and zero-damage rolls add no sample.
        Multiple hits can land on the same defender in one tick; Java consumes
        all matches first and then all mismatches at the next decision.
        """
        s = self.state
        visible_style = gear.style_for_weapon(s.flip(s.weapon_id))
        indices = np.arange(PENDING_HITS_PER_SLOT)
        present = indices[None, None, :] < hit_count[:, :, None]
        valid = (
            present
            & (attack_styles >= 0)
            & (visible_style[:, :, None] >= 0))
        if hit_damage is not None:
            valid &= hit_damage > 0
        matches_this_tick = np.count_nonzero(
            valid & (attack_styles == visible_style[:, :, None]), axis=2)
        mismatches_this_tick = np.count_nonzero(
            valid & (attack_styles != visible_style[:, :, None]), axis=2)

        window = s.style_outcome_window
        for outcome, counts in (
            (1, matches_this_tick),
            (-1, mismatches_this_tick),
        ):
            for index in range(PENDING_HITS_PER_SLOT):
                append = counts > index
                if not append.any():
                    break
                window[append, :-1] = window[append, 1:]
                window[append, -1] = outcome
                s.last_style_outcome = np.where(
                    append, float(outcome), s.last_style_outcome)

        samples = np.count_nonzero(window, axis=2)
        matches = np.count_nonzero(window > 0, axis=2)
        s.style_sample_count = samples.astype(np.float64)
        s.style_match_count = matches.astype(np.float64)

    def _apply_vengeance_reflect(
            self, incoming_hit_damage, incoming_hit_styles, hit_count,
            source_ticks=None):
        """Queue Vengeance's fixed, typeless return hit for the next tick."""
        s = self.state
        # Vengeance.check runs once per landed Hit and requires a real attack
        # style. Do not aggregate same-slot damage: a typeless reflected hit
        # cannot trigger Vengeance, and only the first eligible hit consumes it.
        indices = np.arange(PENDING_HITS_PER_SLOT)
        present = indices[None, None, :] < hit_count[:, :, None]
        eligible = (
            present
            & (incoming_hit_damage > 0)
            & (incoming_hit_styles >= 0))
        first = np.argmax(eligible, axis=2)
        has_eligible = eligible.any(axis=2)
        incoming = np.take_along_axis(
            incoming_hit_damage, first[:, :, None], axis=2)[..., 0]
        if source_ticks is None:
            source_ticks = np.full_like(
                incoming_hit_damage, self.world_tick, dtype=np.int64)
        trigger_tick = np.take_along_axis(
            np.asarray(source_ticks, dtype=np.int64),
            first[:, :, None],
            axis=2)[..., 0]
        reflecting = s.vengeance_active & has_eligible
        if not reflecting.any():
            return
        back = np.ceil(incoming * VENGEANCE_REFLECT).astype(np.int32)
        reflected = np.where(reflecting, back, 0)
        self._queue_hit(
            reflected,
            np.full_like(reflected, -1),
            np.full_like(reflected, combat.MELEE_HIT_TICKS),
            reflecting,
            vengeance_reflection=reflecting,
            vengeance_source_tick=s.veng_trinket_last_cast_tick,
            vengeance_trigger_tick=trigger_tick)
        # Constructing the fixed reflection still calls Hit.defend and consumes
        # a Java replay ordinal, even though it needs no damage/accuracy draw.
        if self.replay_seed is not None:
            self._replay_hit_ordinals += reflecting.astype(np.int32)
        s.vengeance_active = np.where(reflecting, False, s.vengeance_active)

    @staticmethod
    def _soft_ko_risk(hp, possible_damage, margin):
        hp = np.asarray(hp)
        possible_damage = np.asarray(possible_damage)
        margin = np.asarray(margin)
        lower = np.maximum(1, possible_damage - margin)
        upper = np.minimum(115, possible_damage + margin)
        span = np.maximum(1, upper - lower)
        return np.where(
            possible_damage <= 0,
            0.0,
            np.where(
                hp <= lower,
                1.0,
                np.where(hp >= upper, 0.0, (upper - hp) / span)))

    @staticmethod
    def _melee_reachable(dx, dy, frozen, attack_range=1):
        dx = np.abs(np.asarray(dx))
        dy = np.abs(np.asarray(dy))
        frozen = np.asarray(frozen, dtype=bool)
        attack_range = np.maximum(
            1, np.asarray(attack_range, dtype=np.int32))
        overlap = (dx == 0) & (dy == 0)
        standing = (
            ~overlap
            & (dx <= attack_range)
            & (dy <= attack_range))
        drag_limit = attack_range + 2
        drag_in = (
            ~frozen
            & (dx <= drag_limit)
            & (dy <= drag_limit))
        return (
            (overlap & ~frozen)
            | standing
            | drag_in)

    def _can_attack_observed(self, style, attacker_frozen=None):
        s = self.state
        style = np.asarray(style)
        distance = s.distance()[:, None]
        dx = s.flip(s.x) - s.x
        dy = s.flip(s.y) - s.y
        if attacker_frozen is None:
            attacker_frozen = s.freeze_ticks > 0
        melee = self._melee_reachable(
            dx,
            dy,
            attacker_frozen,
            gear.melee_standing_range(s.weapon_id))
        reach = self.gear_tables["max_distance"][np.maximum(style, 0)]
        ranged = (distance >= 1) & (distance <= reach)
        return np.where(style == schema.STYLE_MELEE, melee, ranged) & (
            style >= 0)

    def _apply_supply(self, supply_action):
        s = self.state
        intent = self._pair(actions.decode_supply(supply_action), self.n_fights)
        # The action remains a recorded policy choice, but Java's supply
        # executor returns before consuming anything while a reset teleport
        # makes the player locked.
        intent = np.where(
            s.lock_ticks > 0, schema.SUPPLY_NONE, intent)
        hp_before = s.hp.copy()
        prayer_before = s.prayer_points.copy()
        attack_before = s.attack_level.copy()
        strength_before = s.strength_level.copy()
        defence_before = s.defence_level.copy()
        ranged_before = s.ranged_level.copy()
        magic_before = s.magic_level.copy()
        visible_weapon_style = self._pair(
            gear.style_for_weapon(self._flat(s.seen_opp_weapon_id)),
            self.n_fights)
        threat_style = np.where(
            visible_weapon_style >= 0,
            visible_weapon_style,
            s.seen_opp_style)
        attack_ready_before = (
            (s.style >= 0)
            & (s.attack_delay <= 0)
            & self._can_attack_observed(s.style))
        under_pressure = s.flip(s.combat_target).copy()

        def used(kind):
            return intent == kind

        # Consumable.java:183-202 and 608-638. Food is blocked by either the
        # eat or potion timer; drinks are blocked by the potion timer. A
        # successful use sets its timer to three logical ticks. The policy mask
        # deliberately does not inspect these timers, so a selected action can
        # remain in the rollout even when execution consumes nothing.
        can_eat = (s.eat_delay <= 0) & (s.pot_delay <= 0)
        can_pot = s.pot_delay <= 0

        # DMM carries no karambwan. SAFE/DOUBLE each consume one main food;
        # TRIPLE consumes one main food plus one brew; PANIC does the same.
        wants_food = (
            used(schema.SUPPLY_SAFE_EAT)
            | used(schema.SUPPLY_DOUBLE_EAT)
            | used(schema.SUPPLY_TRIPLE_EAT)
            | used(schema.SUPPLY_PANIC_FULL))
        spend = (wants_food & can_eat).astype(np.int32)
        spend = np.minimum(spend, s.food_count)
        heal = spend * FOOD_HEAL

        # Food goes through incrementHp, so it stops dead at 99. Only brews and
        # the anglerfish can put you above it.
        s.hp = np.where(spend > 0, np.minimum(MAX_HP, s.hp + heal), s.hp)
        food_healing = s.hp - hp_before
        food_waste = spend * FOOD_HEAL - food_healing
        s.food_count -= spend
        s.inventory_free_slots += spend
        s.ate_food |= spend > 0
        s.eat_delay = np.where(spend > 0, FOOD_EAT_DELAY, s.eat_delay)
        # Eating costs attack time, which is the whole reason eating is risky.
        # Combat.delayAttack ADDS to the window rather than replacing it -
        # `attackDelayTicks += ticks`, written that way on purpose so combo
        # eating works - so eating mid-cooldown pushes the next attack further
        # out instead of hiding under the cooldown already running.
        s.attack_delay = np.where(spend > 0,
                                  s.attack_delay + FOOD_EAT_DELAY,
                                  s.attack_delay)

        brew = (
            used(schema.SUPPLY_BREW_ONLY)
            | used(schema.SUPPLY_TRIPLE_EAT)
            | used(schema.SUPPLY_PANIC_FULL)
        ) & can_pot & (s.brew_count > 0)
        # Stat.boost: min(current + 16, 99 + 16), and it never drags you down,
        # so brewing while already above 115 does nothing at all.
        hp_before_brew = s.hp.copy()
        brewed_hp = np.minimum(s.hp + BREW_HEAL, BREW_HP_CAP)
        s.hp = np.where(brew & (s.hp <= brewed_hp), brewed_hp, s.hp)
        brew_healing = s.hp - hp_before_brew
        brew_waste = brew.astype(np.int32) * BREW_HEAL - brew_healing
        s.brew_count -= brew.astype(np.int32)
        s.drank_potion |= brew
        s.pot_delay = np.where(brew, POT_DELAY, s.pot_delay)

        # A brew is not just healing: it also boosts defence and eats into the
        # four offensive stats. That trade is the reason brewing is a decision.
        boosted_def = np.minimum(s.defence_level + BREW_DEFENCE_BOOST,
                                 BREW_DEFENCE_CAP)
        s.defence_level = np.where(brew & (s.defence_level <= boosted_def),
                                   boosted_def, s.defence_level)
        for stat in (s.attack_level, s.strength_level,
                     s.ranged_level, s.magic_level):
            stat[...] = np.where(brew, np.maximum(0, stat - BREW_STAT_DRAIN), stat)

        # Sanfew serum restores EVERY non-hitpoints stat that is below its base
        # - prayer and the combat stats alike - by the same 32, capped at 99.
        restore_needed = (
            (s.attack_level + 3 < 99)
            | (s.strength_level + 3 < 99)
            | (s.defence_level + 3 < 99)
            | (s.ranged_level + 3 < 99)
            | (s.magic_level + 3 < 99))
        recovery_intent = (
            used(schema.SUPPLY_RESTORE_REBOOST)
            | used(schema.SUPPLY_PANIC_FULL))
        pot_still_available = can_pot & ~brew
        restore = (
            recovery_intent
            & restore_needed
            & pot_still_available
            & (s.restore_count > 0))
        s.prayer_points = np.where(
            restore, np.minimum(MAX_PRAYER_POINTS, s.prayer_points + SANFEW_RESTORE),
            s.prayer_points)
        s.restore_count -= restore.astype(np.int32)
        s.drank_potion |= restore
        s.pot_delay = np.where(restore, POT_DELAY, s.pot_delay)
        for stat in (s.attack_level, s.strength_level, s.defence_level,
                     s.ranged_level, s.magic_level):
            # `if(stat.currentLevel < stat.fixedLevel)` - a stat already boosted
            # above 99 is skipped entirely rather than pulled back down to 99.
            topped = np.minimum(99, stat + SANFEW_RESTORE)
            stat[...] = np.where(restore & (stat < 99), topped, stat)

        # The Java call then attempts reboosts, but potion delay means at most
        # one potion succeeds on a tick. Bastion is attempted before super
        # combat. A restore consumed above blocks both.
        restore_reboost = recovery_intent & pot_still_available & ~restore
        ranged_needed = (s.ranged_level < 102) | (s.defence_level < 102)
        bastion = (
            restore_reboost & can_pot
            & ranged_needed & (s.bastion_doses > 0))
        s.bastion_doses -= bastion.astype(np.int32)
        s.ranged_level = np.where(
            bastion, np.maximum(s.ranged_level, 112), s.ranged_level)
        s.defence_level = np.where(
            bastion, np.maximum(s.defence_level, 118), s.defence_level)
        s.pot_delay = np.where(bastion, POT_DELAY, s.pot_delay)

        melee_needed = (
            (s.attack_level < 102)
            | (s.strength_level < 102)
            | (s.defence_level < 102))
        super_combat = (
            restore_reboost & ~bastion & melee_needed
            & (s.super_combat_doses > 0))
        s.super_combat_doses -= super_combat.astype(np.int32)
        s.attack_level = np.where(
            super_combat, np.maximum(s.attack_level, 118), s.attack_level)
        s.strength_level = np.where(
            super_combat, np.maximum(s.strength_level, 118), s.strength_level)
        s.defence_level = np.where(
            super_combat, np.maximum(s.defence_level, 118), s.defence_level)
        s.pot_delay = np.where(super_combat, POT_DELAY, s.pot_delay)
        s.reboost_count = (
            (s.bastion_doses > 0).astype(np.int32)
            + (s.super_combat_doses > 0).astype(np.int32))
        # Every one-dose potion becomes empty vial item 229. The inventory
        # slot remains occupied; Java does not automatically discard the vial.
        s.drank_potion |= bastion | super_combat

        brewed_down_before = (
            (attack_before < 99)
            | (strength_before < 99)
            | (defence_before < 99)
            | (ranged_before < 99)
            | (magic_before < 99))
        s.post_brew_recovery_until_tick = np.where(
            brew,
            self.world_tick + SUPPLY_RECOVERY_STICKY_TICKS,
            s.post_brew_recovery_until_tick)
        recovery_used = restore | bastion | super_combat
        needs_reboost_after = (
            (s.attack_level < 102)
            | (s.strength_level < 102)
            | (s.defence_level < 102)
            | (s.ranged_level < 102))
        needs_post_brew_after = (
            (s.attack_level + 2 < 99)
            | (s.ranged_level + 2 < 99)
            | (s.magic_level + 2 < 99)
            | (s.prayer_points < 62)
            | needs_reboost_after)
        s.post_brew_recovery_until_tick = np.where(
            recovery_intent & ~needs_post_brew_after,
            -1,
            np.where(
                recovery_intent & recovery_used,
                self.world_tick + SUPPLY_RECOVERY_STICKY_TICKS,
                s.post_brew_recovery_until_tick))

        trinket = (used(schema.SUPPLY_VENGEANCE_TRINKET)
                   & (s.veng_trinket_count > 0)
                   & (s.veng_trinket_casts < 2)
                   & ~s.vengeance_active
                   & (s.vengeance_cooldown <= 0))
        s.vengeance_active |= trinket
        s.veng_trinket_count -= trinket.astype(np.int32)
        # NhStakerLoadout seeds amount=2 into one inventory Item. Item.remove(1)
        # routes through ItemContainerG.remove, which decrements that amount;
        # the occupied slot is cleared only when the second charge is removed.
        trinket_emptied = trinket & (s.veng_trinket_count == 0)
        s.inventory_free_slots += trinket_emptied.astype(np.int32)
        s.veng_trinket_casts += trinket.astype(np.int32)
        s.veng_trinket_last_cast_tick = np.where(
            trinket, self.world_tick, s.veng_trinket_last_cast_tick)
        s.vengeance_cooldown = np.where(trinket, VENGEANCE_COOLDOWN_TICKS,
                                        s.vengeance_cooldown)

        self._supply_reward_context = {
            "intent": intent.copy(),
            "under_pressure": under_pressure,
            "threat_style": threat_style,
            "visible_weapon": s.seen_opp_weapon_id.copy(),
            "visible_spec": s.seen_opp_spec_energy.copy(),
            "opponent_frozen": s.seen_opp_frozen.copy(),
            "self_frozen": (s.freeze_ticks > 0).copy(),
            "dx": (s.flip(s.x) - s.x).copy(),
            "dy": (s.flip(s.y) - s.y).copy(),
            "distance": np.broadcast_to(
                s.distance()[:, None], (self.n_fights, 2)).copy(),
            "hp_before": hp_before,
            "hp_after": s.hp.copy(),
            "prayer_before": prayer_before,
            "prayer_after": s.prayer_points.copy(),
            "attack_before": attack_before,
            "attack_after": s.attack_level.copy(),
            "strength_before": strength_before,
            "strength_after": s.strength_level.copy(),
            "defence_before": defence_before,
            "defence_after": s.defence_level.copy(),
            "ranged_before": ranged_before,
            "ranged_after": s.ranged_level.copy(),
            "magic_before": magic_before,
            "magic_after": s.magic_level.copy(),
            "food_uses": spend,
            "brew_uses": brew.astype(np.int32),
            "restore_uses": restore.astype(np.int32),
            "reboost_uses": (
                bastion.astype(np.int32)
                + super_combat.astype(np.int32)),
            "food_healing": food_healing,
            "brew_healing": brew_healing,
            "food_waste": food_waste,
            "brew_waste": brew_waste,
            "used_vengeance": trinket,
            "attack_ready_before": attack_ready_before,
            "attack_delayed_after": (s.attack_delay > 0).copy(),
            "brewed_down_before": brewed_down_before,
            "post_brew_context": (
                (s.post_brew_recovery_until_tick >= self.world_tick)
                | brewed_down_before),
        }

    def _client_supply_ko_risk(self, context, hp):
        """Vector port of NhStakerBot.clientKoRisk for the DMM loadout."""
        s = self.state
        style = context["threat_style"]
        weapon = context["visible_weapon"]
        in_melee = self._melee_reachable(
            context["dx"],
            context["dy"],
            context["opponent_frozen"],
            gear.melee_standing_range(weapon))
        in_range = np.where(
            style == schema.STYLE_MELEE,
            in_melee,
            (context["distance"] >= 1) & (context["distance"] <= 10))

        first = np.where(
            style == schema.STYLE_MAGIC,
            33,
            np.where(
                style == schema.STYLE_RANGED,
                46,
                np.where(
                    weapon == gear.VESTAS_LONGSWORD.item_id,
                    66,
                    np.where(
                        weapon == gear.VOIDWAKER.item_id,
                        74,
                        np.where(
                            weapon == gear.GRANITE_MAUL.item_id,
                            40,
                            48)))))
        valid_style = style >= 0
        blocking = schema.BLOCKING_PRAYER[np.maximum(style, 0)]
        protected = valid_style & (s.overhead == blocking)
        first = np.where(
            protected,
            np.floor(first * 0.60 + 0.5).astype(np.int32),
            first)

        visible_spec = context["visible_spec"]
        special_weapon = np.isin(
            weapon,
            (gear.GRANITE_MAUL.item_id,
             gear.VESTAS_LONGSWORD.item_id,
             gear.VOIDWAKER.item_id))
        gmaul_followup = (
            (visible_spec >= 500)
            & in_melee
            & (special_weapon
               | (style == schema.STYLE_MELEE)
               | (style == schema.STYLE_RANGED)))
        followup = np.where(
            gmaul_followup,
            np.where(
                (weapon == gear.GRANITE_MAUL.item_id)
                & (visible_spec >= 1000),
                72,
                40),
            0)
        melee_protected = (
            s.overhead
            == schema.BLOCKING_PRAYER[schema.STYLE_MELEE])
        followup = np.where(
            melee_protected & (followup > 0),
            np.floor(followup * 0.60 + 0.5).astype(np.int32),
            followup)
        burst = np.minimum(99, first + followup)

        emergency = np.where(
            (s.food_count > 0) | (s.brew_count > 0), 10, 0)
        first_risk = self._soft_ko_risk(
            hp, first, np.where(in_range, 10, 4))
        burst_risk = np.where(
            gmaul_followup,
            self._soft_ko_risk(
                hp + emergency, burst, np.where(in_range, 12, 6)),
            0.0)
        pressure = np.where(in_range, 0.16, 0.04)
        pressure += np.where(gmaul_followup, 0.12, 0.0)
        pressure += np.where(
            context["self_frozen"] & in_melee, 0.08, 0.0)
        return np.where(
            valid_style & (hp > 0),
            np.clip(np.maximum(
                pressure, np.maximum(first_risk, burst_risk)),
                0.0, 1.0),
            0.0)

    def _finalize_supply_rewards(
            self, same_tick_attack_executed, followup_reachable):
        """Apply Java's neural_sparse supply reward to the next observation."""
        context = self._supply_reward_context
        self._supply_reward_context = None
        if context is None:
            return
        s = self.state
        intent = context["intent"]
        used_food = context["food_uses"] > 0
        used_brew = context["brew_uses"] > 0
        used_restore = context["restore_uses"] > 0
        used_reboost = context["reboost_uses"] > 0
        healing_uses = context["food_uses"] + context["brew_uses"]
        applied_healing = (
            context["food_healing"] + context["brew_healing"])

        risk_before = self._client_supply_ko_risk(
            context, context["hp_before"])
        risk_after = self._client_supply_ko_risk(
            context, context["hp_after"])
        risk_drop = np.maximum(0.0, risk_before - risk_after)
        urgency = np.where(
            context["under_pressure"],
            risk_before,
            np.maximum(0.0, risk_before - 0.06))

        attack_delayed = context["attack_delayed_after"]
        same_tick_attack_executed = np.asarray(
            same_tick_attack_executed, dtype=bool)
        followup = followup_reachable & ~attack_delayed
        opportunity = np.where(
            same_tick_attack_executed,
            1.0,
            np.where(
                followup,
                np.where(
                    context["attack_ready_before"] & attack_delayed,
                    0.85,
                    np.where(
                        context["attack_ready_before"],
                        0.65,
                        np.where(~attack_delayed, 0.35, 0.0))),
                0.0))
        support_followup = (
            same_tick_attack_executed
            | followup
            | (opportunity >= 0.65))

        brew_only_tempo = (
            (intent == schema.SUPPLY_BREW_ONLY)
            & used_brew
            & ~used_food)
        healing_penalty_uses = (
            context["food_uses"]
            + context["brew_uses"] * np.where(
                brew_only_tempo,
                REWARD_BREW_ONLY_PENALTY_WEIGHT,
                0.75))
        delta = np.zeros_like(risk_before, dtype=np.float64)

        meaningful = (
            (applied_healing > 0)
            & (risk_drop >= REWARD_SUPPLY_MEANINGFUL_RISK_DROP))
        delta += np.where(
            meaningful,
            REWARD_SUPPLY_RISK_REDUCTION_SCALE
            * risk_drop
            * (0.65 + np.minimum(1.10, applied_healing / 32.0)),
            0.0)
        urgent_heal = (
            ~meaningful
            & (applied_healing > 0)
            & (urgency >= 0.45)
            & (risk_before >= 0.40))
        delta += np.where(
            urgent_heal,
            REWARD_SUPPLY_GOOD_BONUS
            * urgency
            * (0.55 + np.minimum(1.15, applied_healing / 26.0)),
            0.0)

        brew_pressure = (
            ~attack_delayed
            & (same_tick_attack_executed
               | followup
               | (opportunity >= 0.65)))
        tempo_brew = (
            brew_only_tempo
            & brew_pressure
            & (context["brew_healing"] > 0)
            & (context["brew_waste"] <= context["brew_healing"])
            & (context["hp_before"] < 82)
            & (np.maximum(risk_before, urgency) >= 0.16))
        delta += np.where(
            tempo_brew,
            REWARD_BREW_TEMPO_HEAL_BONUS
            * (0.65 + np.maximum(risk_before, urgency))
            * 0.70
            * np.maximum(0.25, 1.0 - context["brew_waste"] / 16.0),
            0.0)

        safety = 1.0 - urgency
        delta -= np.where(
            (healing_penalty_uses > 0) & (safety > 0.35),
            REWARD_SUPPLY_BAD_PENALTY
            * healing_penalty_uses * safety,
            0.0)
        delta -= np.where(
            (healing_penalty_uses > 0) & (risk_before < 0.35),
            REWARD_SUPPLY_LOW_RISK_USE_PENALTY
            * healing_penalty_uses * (1.0 - risk_before),
            0.0)
        delta -= np.where(
            (healing_penalty_uses > 0) & (risk_drop <= 0.015),
            REWARD_SUPPLY_NO_RISK_REDUCTION_PENALTY
            * healing_penalty_uses
            * (1.0 + np.maximum(0.0, safety - 0.35)),
            0.0)
        delta -= np.where(
            (applied_healing <= 0) & (healing_uses > 0),
            REWARD_SUPPLY_BAD_PENALTY * healing_penalty_uses,
            0.0)
        panic = (
            (intent == schema.SUPPLY_PANIC_FULL)
            & (healing_uses > 0))
        real_panic = (
            (context["hp_before"] <= 48)
            | (np.maximum(risk_before, urgency) >= 0.62)
            | (risk_drop >= 0.14))
        safe_panic_scale = (
            0.70
            + np.maximum(
                0.0, 1.0 - np.maximum(risk_before, urgency)))
        delta -= np.where(
            panic & ~real_panic,
            REWARD_SUPPLY_PANIC_LOW_VALUE_PENALTY
            * np.minimum(1.60, safe_panic_scale)
            * np.minimum(1.25, healing_penalty_uses / 2.0),
            0.0)

        restore_recovered = used_restore & (
            (context["prayer_after"] > context["prayer_before"])
            | (context["attack_after"] > context["attack_before"])
            | (context["strength_after"] > context["strength_before"])
            | (context["defence_after"] > context["defence_before"])
            | (context["ranged_after"] > context["ranged_before"])
            | (context["magic_after"] > context["magic_before"]))
        restore_needed = (
            (context["prayer_before"] < 55)
            | (context["attack_before"] + 3 < 99)
            | (context["strength_before"] + 3 < 99)
            | (context["defence_before"] + 3 < 99)
            | (context["ranged_before"] + 3 < 99)
            | (context["magic_before"] + 3 < 99))
        restore_useful = restore_recovered & restore_needed
        delta += np.where(
            restore_useful & support_followup,
            REWARD_SUPPLY_GOOD_BONUS * 0.65,
            np.where(
                restore_useful,
                REWARD_SUPPLY_SUPPORT_RECOVERY_BONUS
                + np.where(
                    context["post_brew_context"],
                    REWARD_SUPPLY_POST_BREW_RECOVERY_BONUS,
                    0.0),
                np.where(
                    restore_recovered,
                    -REWARD_SUPPLY_UNNEEDED_RESTORE_PENALTY,
                    np.where(
                        used_restore,
                        -REWARD_SUPPLY_BAD_PENALTY * 0.55,
                        0.0))))

        reboosted = used_reboost & (
            (context["attack_after"] > context["attack_before"])
            | (context["strength_after"] > context["strength_before"])
            | (context["defence_after"] > context["defence_before"])
            | (context["ranged_after"] > context["ranged_before"]))
        reboost_needed = (
            (context["attack_before"] < 102)
            | (context["strength_before"] < 102)
            | (context["defence_before"] < 102)
            | (context["ranged_before"] < 102))
        reboost_useful = reboosted & reboost_needed
        delta += np.where(
            reboost_useful & support_followup,
            REWARD_SUPPLY_GOOD_BONUS * 0.55,
            np.where(
                reboost_useful,
                REWARD_SUPPLY_SUPPORT_RECOVERY_BONUS
                + np.where(
                    context["post_brew_context"],
                    REWARD_SUPPLY_POST_BREW_RECOVERY_BONUS,
                    0.0),
                np.where(
                    reboosted,
                    -REWARD_SUPPLY_UNNEEDED_REBOOST_PENALTY,
                    np.where(
                        used_reboost,
                        -REWARD_SUPPLY_BAD_PENALTY * 0.45,
                        0.0))))

        queued_pressure = np.clip(
            s.pending_damage[:, :, :2].sum(axis=2) / 48.0,
            0.0, 1.0)
        recent_pressure = np.clip(s.last_taken_hit / 36.0, 0.0, 1.0)
        vengeance_pressure = np.maximum(
            risk_before, np.maximum(queued_pressure, recent_pressure))
        vengeance_good = (
            (context["hp_before"] <= 56)
            | (vengeance_pressure >= 0.36)
            | ((context["hp_before"] <= 78)
               & (vengeance_pressure >= 0.18)))
        delta += np.where(
            context["used_vengeance"] & vengeance_good,
            np.minimum(
                3.20, 1.35 * (0.55 + vengeance_pressure)),
            np.where(
                (intent == schema.SUPPLY_VENGEANCE_TRINKET)
                & ~context["used_vengeance"],
                -0.18,
                0.0))

        low_value_healing = (
            (healing_uses > 0)
            & ~(tempo_brew
                & (context["brew_healing"] > 0)
                & (context["hp_before"] < 82))
            & (risk_drop < REWARD_SUPPLY_MEANINGFUL_RISK_DROP)
            & ((risk_before < 0.60) | (urgency < 0.60)))
        low_value_support = (
            (used_restore & (~restore_recovered | ~restore_needed))
            | (used_reboost & (~reboosted | ~reboost_needed)))
        low_value = low_value_healing | low_value_support
        useful_support = restore_useful | reboost_useful

        opportunity_uses = (
            context["food_uses"]
            + context["brew_uses"] * np.where(
                tempo_brew,
                0.25,
                np.where(brew_only_tempo, 0.45, 0.65)))
        delta -= np.where(
            (healing_uses > 0)
            & (opportunity > 0)
            & ((risk_before < 0.55) | (risk_drop < 0.10)),
            REWARD_SUPPLY_OPPORTUNITY_COST_SCALE
            * opportunity_uses
            * opportunity
            * np.maximum(0.20, 1.0 - risk_before),
            0.0)

        recent_valid = (
            self.world_tick - s.last_supply_tick
            <= SUPPLY_REPEAT_WINDOW_TICKS)
        prior_actions = np.where(
            recent_valid, s.recent_supply_actions, 0)
        prior_low = np.where(
            recent_valid, s.recent_low_value_supplies, 0)
        supply_action_count = (
            healing_uses
            + context["restore_uses"]
            + context["reboost_uses"])
        repeat_pressure = np.minimum(
            4.0, prior_actions + prior_low * 0.65)
        delta -= np.where(
            (supply_action_count > 0)
            & (prior_actions > 0)
            & (low_value
               | ((risk_before < 0.45) & ~useful_support)),
            REWARD_SUPPLY_REPEAT_LOW_VALUE_PENALTY
            * repeat_pressure
            * np.maximum(0.35, 1.0 - risk_before)
            * np.where(low_value, 1.35, 0.75)
            * np.where(brew_only_tempo, 0.55, 1.0),
            0.0)

        delta -= context["food_uses"] * REWARD_FOOD_USE_COST
        delta -= context["brew_uses"] * REWARD_BREW_USE_COST
        delta -= context["restore_uses"] * REWARD_RESTORE_USE_COST
        delta -= context["reboost_uses"] * REWARD_REBOOST_USE_COST
        delta -= context["food_waste"] * REWARD_FOOD_WASTE_PENALTY_PER_HP
        delta -= context["brew_waste"] * REWARD_BREW_WASTE_PENALTY_PER_HP

        hard_food_miss = (
            used_food
            & context["attack_ready_before"]
            & attack_delayed)
        free_eat = (
            used_food
            & context["attack_ready_before"]
            & ~attack_delayed
            & same_tick_attack_executed
            & (context["food_healing"] > 0)
            & (risk_before >= 0.18))
        delta -= np.where(
            hard_food_miss,
            REWARD_SPARSE_MISSED_ATTACK_FOOD_PENALTY
            * context["food_uses"]
            * np.maximum(0.25, 1.0 - risk_before),
            0.0)
        delta += np.where(
            free_eat,
            REWARD_SPARSE_FREE_EAT_TEMPO_BONUS
            * np.minimum(1.0, 0.50 + risk_before + risk_drop),
            0.0)
        delta *= REWARD_SPARSE_SUPPLY_TEMPO_SCALE

        nonzero = delta != 0.0
        s.pending_supply_reward += delta
        for fight_index, side in zip(*np.nonzero(nonzero)):
            self._append_reward_event(
                int(fight_index),
                int(side),
                reward_events.EVENT_SUPPLY_RESOLUTION,
                float(delta[fight_index, side]),
                (reward_events.RewardContributor(
                    source_tick=self.world_tick,
                    target_decision_tick=self.world_tick,
                    causal_unit=reward_events.UNIT_SUPPLY),),
                self.world_tick)

        used_any = supply_action_count > 0
        s.recent_supply_actions = np.where(
            used_any,
            np.minimum(6, prior_actions + 1),
            s.recent_supply_actions)
        s.recent_low_value_supplies = np.where(
            used_any,
            np.where(
                low_value,
                np.minimum(6, prior_low + 1),
                np.maximum(0, prior_low - 1)),
            s.recent_low_value_supplies)
        s.last_supply_tick = np.where(
            used_any, self.world_tick, s.last_supply_tick)

    def _apply_prayer(self, defence_action):
        s = self.state
        prayer = self._pair(actions.decode_defence(defence_action), self.n_fights)
        # Only the three protect prayers change the overhead; smite and
        # redemption are modelled as "no protection this tick".
        is_protect = prayer <= schema.PRAY_PROTECT_MELEE
        wanted = np.where((s.prayer_points > 0) & is_protect, prayer, -1)

        # Remember when the overhead changed and what it was before. A hit
        # rolled on the same tick as the switch still sees the old prayer.
        switched = wanted != s.overhead
        s.previous_overhead = np.where(switched, s.overhead, s.previous_overhead)
        s.overhead_switch_tick = np.where(switched, s.tick[:, None],
                                          s.overhead_switch_tick)
        s.overhead = wanted

    def _prepare_movement(self, movement_action):
        """Capture staged explicit destinations before either player moves."""
        s = self.state
        intent = self._pair(
            actions.decode_movement(movement_action), self.n_fights)

        s.prev_x = s.x.copy()
        s.prev_y = s.y.copy()
        s.moving[:] = False

        escaped = s.distance()[:, None] > combat.FREEZE_BREAK_DISTANCE
        s.freeze_ticks = np.where(escaped, 0, s.freeze_ticks)

        frozen = s.freeze_ticks > 0
        offsets = schema.MOVEMENT_OFFSETS[intent]
        dx = offsets[..., 0].astype(np.int32)
        dy = offsets[..., 1].astype(np.int32)
        decision_x = s.x.copy()
        decision_y = s.y.copy()
        decision_partner_x = s.flip(decision_x)
        decision_partner_y = s.flip(decision_y)

        stand_under = intent == schema.MOVE_STAND_UNDER
        dx = np.where(
            stand_under, np.sign(decision_partner_x - decision_x), dx)
        dy = np.where(
            stand_under, np.sign(decision_partner_y - decision_y), dy)
        return {
            "intent": intent,
            "target_x": decision_x + dx,
            "target_y": decision_y + dy,
            "issued": (
                (s.lock_ticks <= 0)
                & ~frozen
                & ((dx != 0) | (dy != 0))),
            "energy_before": s.run_energy.copy(),
        }

    def _apply_movement_side(self, plan, side):
        """Execute one player's staged explicit movement destination."""
        s = self.state
        active = plan["issued"][:, side].copy()
        steps_taken = np.zeros(self.n_fights, dtype=np.int8)
        can_run = s.running[:, side] & (
            plan["energy_before"][:, side] > 0)
        for substep in range(2):
            active &= (
                (s.x[:, side] != plan["target_x"][:, side])
                | (s.y[:, side] != plan["target_y"][:, side]))
            active &= (substep == 0) | can_run
            if not active.any():
                continue

            next_x = (
                s.x[:, side]
                + np.sign(
                    plan["target_x"][:, side]
                    - s.x[:, side]).astype(np.int32))
            next_y = (
                s.y[:, side]
                + np.sign(
                    plan["target_y"][:, side]
                    - s.y[:, side]).astype(np.int32))
            step_allowed = (
                active
                & world_map.SELF_PLAY_MAP.cached_step_allowed(
                    s.x[:, side], s.y[:, side], next_x, next_y))
            s.x[:, side] = np.where(
                step_allowed, next_x, s.x[:, side])
            s.y[:, side] = np.where(
                step_allowed, next_y, s.y[:, side])
            steps_taken += step_allowed.astype(np.int8)
            active &= step_allowed

        moved = steps_taken > 0
        ran = steps_taken >= 2
        s.moving[:, side] |= moved
        s.run_energy[:, side] = np.where(
            ran,
            plan["energy_before"][:, side] - RUN_ENERGY_DRAIN,
            np.minimum(
                MAX_RUN_ENERGY,
                plan["energy_before"][:, side] + RUN_ENERGY_RESTORE))
        emptied = s.run_energy[:, side] <= 0
        s.run_energy[:, side] = np.where(
            emptied, -100.0, s.run_energy[:, side])
        s.running[:, side] &= ~emptied
        return plan["issued"][:, side]

    def _apply_movement(self, movement_action):
        """Queue and process explicit movement in Java player-slot order.

        Entity.stepAbs records a destination, then PlayerMovement.process takes
        one walk step and optionally one run step (Entity.java:233-244;
        PlayerMovement.java:182-200). Route collision is checked against the
        normal player movement does not consult Tile.isOccupied. Direct
        self-play commands are validated against both fighters' staged
        positions, then the two live executions may legitimately converge after
        the first player has already moved.
        """
        plan = self._prepare_movement(movement_action)
        issued = np.zeros((self.n_fights, 2), dtype=bool)
        for side in (0, 1):
            issued[:, side] = self._apply_movement_side(plan, side)
        return issued

    def _apply_persistent_combat_route(
            self, reach, movement_energy_before, magic_overlap, route_ready,
            sides=(0, 1)):
        """Process PlayerCombat's persistent TargetRoute in player-slot order.

        PlayerCombat.preAttack recreates this route every tick while a target is
        retained, including policy HOLD ticks. Being in range cancels movement;
        overlap is never in range, so routeEntity chooses an adjacent tile.
        Outside reach the ordinary combat chase may take both walk and run
        substeps. Attack-to-chase is exempt from the direct-movement origin
        boundary.
        """
        s = self.state
        # RouteFinder.route resets the queued movement when
        # Entity.isMovementBlocked reports a freeze, and NhStakerBot also
        # clears any leaked queue at the top of its event (RouteFinder.java:
        # 85-100; NhStakerBot.java:2612-2615).
        routed = (
            (route_ready | magic_overlap)
            & (s.freeze_ticks <= 0)
            & (s.lock_ticks <= 0))
        moved = np.zeros_like(routed)
        ran = np.zeros_like(routed)
        for side in sides:
            target = 1 - side
            dx = s.x[:, target] - s.x[:, side]
            dy = s.y[:, target] - s.y[:, side]
            same_tile = (dx == 0) & (dy == 0)
            in_range = (
                ~same_tile
                & (np.maximum(np.abs(dx), np.abs(dy)) <= reach[:, side]))
            active = routed[:, side] & ~in_range

            # routeEntity's first clear adjacent finish is west of an
            # overlapping size-one target. Player slot order then determines
            # whether the other fighter still needs to move.
            steps_taken = np.zeros(self.n_fights, dtype=np.int8)
            can_run = s.running[:, side] & (
                movement_energy_before[:, side] > 0)
            for substep in range(2):
                active &= (substep == 0) | can_run
                if not active.any():
                    continue

                dx = s.x[:, target] - s.x[:, side]
                dy = s.y[:, target] - s.y[:, side]
                same_tile = (dx == 0) & (dy == 0)
                step_dx = np.where(
                    same_tile, -1, np.sign(dx))
                step_dy = np.where(same_tile, 0, np.sign(dy))
                next_x = s.x[:, side] + step_dx.astype(np.int32)
                next_y = s.y[:, side] + step_dy.astype(np.int32)

                # A target route stops on the first clear non-overlapping tile
                # inside its requested attack range. It never walks through the
                # opponent to consume the second run substep.
                enters_target = (
                    (next_x == s.x[:, target])
                    & (next_y == s.y[:, target]))
                allowed = (
                    active
                    & ~enters_target
                    & world_map.SELF_PLAY_MAP.cached_step_allowed(
                        s.x[:, side], s.y[:, side], next_x, next_y))
                s.x[:, side] = np.where(allowed, next_x, s.x[:, side])
                s.y[:, side] = np.where(allowed, next_y, s.y[:, side])
                steps_taken += allowed.astype(np.int8)

                distance = np.maximum(
                    np.abs(s.x[:, target] - s.x[:, side]),
                    np.abs(s.y[:, target] - s.y[:, side]))
                reached = allowed & (distance >= 1) & (
                    distance <= reach[:, side])
                active &= allowed & ~reached

            moved[:, side] = steps_taken > 0
            ran[:, side] = steps_taken >= 2

        s.moving |= moved
        for side in sides:
            s.run_energy[:, side] = np.where(
                ran[:, side],
                movement_energy_before[:, side] - RUN_ENERGY_DRAIN,
                np.where(
                    routed[:, side],
                    np.minimum(
                        MAX_RUN_ENERGY,
                        movement_energy_before[:, side]
                        + RUN_ENERGY_RESTORE),
                    s.run_energy[:, side]))
            emptied = s.run_energy[:, side] <= 0
            s.run_energy[:, side] = np.where(
                emptied, -100.0, s.run_energy[:, side])
            s.running[:, side] &= ~emptied

    def _plan_combat(self, style_flat, spec_flat, off_tick_flat):
        """Swap gear, then work out who swings - all BEFORE anyone moves.

        Split out from the swing itself because the server decides this first:
        TargetRoute.beforeMovement0 runs ahead of movement.process(), reads
        `withinDistance` off the pre-step position, and cancels the movement of
        anyone already in range. So range is judged from where you are standing
        at the top of the tick, and whoever can attack stays put.

        Returns (attacking, speccing), which the caller uses both to hold those
        fighters still and to resolve the hits afterwards.
        """
        s = self.state
        n = self.n_fights
        style = self._pair(style_flat, n)
        spec = self._pair(spec_flat, n)
        off_tick = self._pair(off_tick_flat, n)

        # --- offence mode ---------------------------------------------------
        # The direct-action bridge has already applied the required weapon and
        # every selected optional slot. `currentOffence` is separate from the
        # visible weapon in Java, so HOLD still sets MAGIC without silently
        # restoring a mage loadout.
        wants_style = style >= 0
        # Channel attack HOLD has no attack style, but Java still decodes its
        # style index as MAGIC and applies that as desiredOffence. Without this,
        # a FastSim bot stayed in its last spec/range gear while holding and fed
        # the next tick a completely different observation.
        desired_style = np.where(wants_style, style, schema.STYLE_MAGIC)
        s.style = desired_style

        # --- who actually swings this tick ----------------------------------
        ready = s.attack_delay <= 0
        dist = self.state.distance()[:, None]
        reach = self.gear_tables["max_distance"][np.maximum(s.style, 0)]
        # All current explicit specials are one-tile melee attacks.  The
        # ordinary DMM melee weapon is a two-tile Noxious halberd, so carrying
        # its range through here would make a Voidwaker/VLS/gmaul command think
        # it was already in range at distance two and then fail the adjacency
        # check without taking TargetRoute's step.
        reach = np.where(spec >= 0, 1, reach)
        in_range = dist <= reach

        # PlayerCombat.canAttack: a fighter who is dead cannot attack, and a
        # dead target cannot be attacked. This matters because Player.process()
        # runs processHits() BEFORE combat - so damage that arrives at the top
        # of a tick can take a fighter out of that same tick's attack. Without
        # this, someone who has already been killed still gets a free swing,
        # which quietly changes who wins close fights.
        alive = s.hp > 0
        can_fight = alive & s.flip(alive) & (s.lock_ticks <= 0)

        return {
            "wants_style": wants_style,
            "style": style,
            "ready": ready,
            "off_tick": off_tick,
            "can_fight": can_fight,
            "spec": spec,
            "reach": reach,
        }

    def _apply_direct_gear(self, combat_action, gear_pick):
        """Execute core weapon dependencies, then optional equips/unequips."""
        if gear_pick is None:
            return
        s = self.state
        equipped = self._flat(s.equipped_ids)
        free = self._flat(s.inventory_free_slots)
        actual_core = actions._core_weapon_row(combat_action)
        tick_start_weapon = equipped[:, gear.SLOT_WEAPON].copy()
        has_direct_actions = (
            (actual_core >= schema.GEAR_BASE)
            | np.any(
                gear_pick["ordered_actions"] >= schema.GEAR_BASE,
                axis=1))
        vls_gear_row = (
            schema.GEAR_BASE
            + int(np.flatnonzero(
                (gear.DIRECT_GEAR_SLOTS == gear.SLOT_WEAPON)
                & (gear.DIRECT_GEAR_ITEMS == gear.VESTAS_LONGSWORD.item_id)
                & ~gear.DIRECT_GEAR_UNEQUIP)[0]))
        optional_vls_selected = np.any(
            gear_pick["ordered_actions"] == vls_gear_row, axis=1)

        def apply_rows(rows, allow_reserved=False):
            for position in range(rows.shape[1]):
                selected = rows[:, position]
                active = selected >= schema.GEAR_BASE
                if not active.any():
                    continue
                local = np.maximum(selected - schema.GEAR_BASE, 0)
                slots = gear.DIRECT_GEAR_SLOTS[local]
                items = gear.DIRECT_GEAR_ITEMS[local]
                unequip = gear.DIRECT_GEAR_UNEQUIP[local]
                two_handed = gear.DIRECT_GEAR_TWO_HANDED[local]
                for slot in schema.OPTIONAL_GEAR_SLOTS:
                    use = active & (slots == slot)
                    if not use.any():
                        continue
                    if not allow_reserved:
                        core_slot = (
                            actual_core >= schema.GEAR_BASE
                        ) & (slot == gear.SLOT_WEAPON)
                        core_two = np.zeros(active.shape, dtype=bool)
                        valid_core = actual_core >= schema.GEAR_BASE
                        core_two[valid_core] = gear.DIRECT_GEAR_TWO_HANDED[
                            actual_core[valid_core] - schema.GEAR_BASE]
                        core_slot |= core_two & (slot == gear.SLOT_SHIELD)
                        use &= ~core_slot
                    if not use.any():
                        continue
                    if slot == gear.SLOT_SHIELD:
                        current_two = np.isin(
                            equipped[:, gear.SLOT_WEAPON],
                            (gear.NOXIOUS_HALBERD.item_id,
                             gear.GRANITE_MAUL.item_id))
                        # Equipment.equip allows a shield click while a
                        # two-handed weapon is worn: removing the selected
                        # shield from inventory creates the slot used to stow
                        # the weapon, so this is legal even at zero free slots.
                        # The two operations have zero net slot cost.
                        stows_two_handed = use & ~unequip & current_two
                        equipped[stows_two_handed, gear.SLOT_WEAPON] = -1
                        free[stows_two_handed] -= 1
                    equip_use = use & ~unequip
                    if slot == gear.SLOT_WEAPON:
                        drops_shield = (
                            equip_use & two_handed
                            & (equipped[:, gear.SLOT_SHIELD] >= 0))
                        weapon_empty = equipped[:, gear.SLOT_WEAPON] < 0
                        can_drop = drops_shield & ((free > 0) | weapon_empty)
                        equip_use &= ~drops_shield | can_drop
                        equipped[can_drop, gear.SLOT_SHIELD] = -1
                        free[can_drop] -= 1
                    empty = equip_use & (equipped[:, slot] < 0)
                    free[empty] += 1
                    equipped[equip_use, slot] = items[equip_use]

                    unequip_use = use & unequip & (equipped[:, slot] >= 0)
                    unequip_use &= free > 0
                    equipped[unequip_use, slot] = -1
                    free[unequip_use] -= 1

        # Core contains at most one required weapon and is always first.
        apply_rows(actual_core[:, None], allow_reserved=True)
        apply_rows(gear_pick["ordered_actions"], allow_reserved=False)

        # In Java, a decision with no direct gear action falls back to the
        # ordinary WEAPON_ONLY path. HOLD decodes to Magic, so this restores
        # the DMM staff without changing the optional armour selected on prior
        # ticks. A decision with even one direct/core action must not use this
        # fallback.
        no_direct = ~has_direct_actions
        if no_direct.any():
            equipped[no_direct, gear.SLOT_WEAPON] = (
                gear.SETS[schema.STYLE_MAGIC][gear.SLOT_WEAPON].item_id)

        s.weapon_id[:] = s.equipped_ids[..., gear.SLOT_WEAPON]
        s.has_shield[:] = s.equipped_ids[..., gear.SLOT_SHIELD] >= 0

        # NhVlsSetupPendingState remembers exactly one kind of preparation:
        # an optional (not combat-required) VLS equip that really changed the
        # weapon while one attack-delay tick remained and the tick-start
        # weapon did not expose special controls. The marker is visible only
        # on the following decision.
        optional_vls_setup = (
            optional_vls_selected
            & (actual_core != vls_gear_row)
            & (tick_start_weapon != gear.VESTAS_LONGSWORD.item_id)
            & (s.weapon_id.reshape(-1) == gear.VESTAS_LONGSWORD.item_id)
            & ~gear.weapon_shows_special_bar(tick_start_weapon)
            & (s.attack_delay.reshape(-1) == 1))
        self._flat(s.optional_vls_setup_tick)[optional_vls_setup] = (
            self.world_tick)

        # Equipment.sendUpdates calls PlayerCombat.updateWeapon. A queued
        # special is cancelled whenever the final weapon no longer owns that
        # Special object (PlayerCombat.java:3155-3156).
        active = s.active_spec_kind
        required_weapon = np.full(active.shape, -1, dtype=np.int32)
        for kind, item in enumerate(gear.SPEC_WEAPONS):
            if item is not None:
                required_weapon = np.where(
                    active == kind, item.item_id, required_weapon)
        s.active_spec_kind = np.where(
            (active >= 0) & (s.weapon_id != required_weapon),
            -1,
            active)

    def _ensure_magic_supply_slot(self, style):
        """Mirror NhStakerBot.ensureSpellSupplies' one-free-slot invariant.

        Direct unequips can consume the sole free inventory slot. Every magic
        decision then calls ensureSpellSupplies(), whose final
        ensureFreeSlots(1) discards a manta ray before the attack is issued.
        The DMM food observation counts those manta rays, so the sacrifice must
        be reflected even though runes already live in the rune pouch.
        """
        s = self.state
        needs_slot = (
            (style == schema.STYLE_MAGIC)
            & (s.inventory_free_slots < 1)
            & (s.food_count > 0))
        s.food_count -= needs_slot.astype(np.int32)
        s.inventory_free_slots += needs_slot.astype(np.int32)

    def _apply_spec_intent(self, spec_kind, off_tick, tick_start_weapon):
        """Toggle/queue an explicit special before movement and attack routing.

        NhStakerBot applies direct gear, then applySpecIntent, and only after
        that issues movement and the attack request (NhStakerBot.java:
        2727, 2781, 2796, 2867). Non-maul specials can therefore remain active
        and become visible in the next observation if the attack does not
        launch on this decision.
        """
        s = self.state
        selected = spec_kind >= 0
        safe_kind = np.maximum(spec_kind, 0)
        cost = schema.SPEC_ENERGY_COST[safe_kind]
        gmaul = selected & np.isin(
            spec_kind,
            (schema.SPEC_GRANITE_MAUL, schema.SPEC_GRANITE_MAUL_DOUBLE))

        required_weapon = np.full(spec_kind.shape, -1, dtype=np.int32)
        for kind, item in enumerate(gear.SPEC_WEAPONS):
            if item is not None:
                required_weapon = np.where(
                    spec_kind == kind, item.item_id, required_weapon)

        alive = (s.hp > 0) & s.flip(s.hp > 0)
        diagonal_frozen = (
            (np.abs(s.flip(s.x) - s.x) == 1)
            & (np.abs(s.flip(s.y) - s.y) == 1)
            & (s.freeze_ticks > 0))
        accepted = (
            selected
            & alive
            & (s.lock_ticks <= 0)
            & ~diagonal_frozen
            & (s.special_energy >= cost)
            & (s.weapon_id == required_weapon)
            & (gmaul | (s.attack_delay <= 0)))
        accepted &= (
            (spec_kind != schema.SPEC_VESTA_LONGSWORD)
            | gear.weapon_shows_special_bar(tick_start_weapon))

        already_active = accepted & (s.active_spec_kind == spec_kind)
        newly_recorded = accepted & (gmaul | ~already_active)
        persistent = accepted & ~gmaul
        s.active_spec_kind = np.where(
            persistent, spec_kind, s.active_spec_kind)

        # NhStakerBot.recordSpecHistory runs when a new special click is
        # accepted, not when its hit eventually launches (lines 6053, 6065-6075).
        s.prev_spec_kind = np.where(
            newly_recorded, s.last_spec_kind, s.prev_spec_kind)
        s.last_spec_kind = np.where(
            newly_recorded, spec_kind, s.last_spec_kind)
        s.ticks_since_spec = np.where(
            newly_recorded, 0, s.ticks_since_spec)
        gmaul_record = newly_recorded & gmaul
        s.gmaul_specs_used += np.where(
            gmaul_record,
            np.where(spec_kind == schema.SPEC_GRANITE_MAUL_DOUBLE, 2, 1),
            0).astype(np.int32)
        s.voidwaker_specs_used += (
            newly_recorded
            & (spec_kind == schema.SPEC_VOIDWAKER)).astype(np.int32)
        s.vls_specs_used += (
            newly_recorded
            & (spec_kind == schema.SPEC_VESTA_LONGSWORD)).astype(np.int32)
        if newly_recorded.any():
            setup_is_exact = (
                (spec_kind == schema.SPEC_VESTA_LONGSWORD)
                & (s.optional_vls_setup_tick == self.world_tick - 1))
            s.pending_spec_tick[newly_recorded] = self.world_tick
            s.pending_spec_optional_vls_setup_tick[newly_recorded] = np.where(
                setup_is_exact[newly_recorded],
                s.optional_vls_setup_tick[newly_recorded],
                -1)
            s.pending_spec_kind[newly_recorded] = spec_kind[newly_recorded]
            s.pending_spec_double[newly_recorded] = (
                spec_kind[newly_recorded]
                == schema.SPEC_GRANITE_MAUL_DOUBLE)
            s.pending_spec_opponent_hp[newly_recorded] = (
                s.seen_opp_hp[newly_recorded])
            s.pending_spec_launch_observed[newly_recorded] = False
            consume_setup = (
                newly_recorded
                & (spec_kind == schema.SPEC_VESTA_LONGSWORD))
            s.optional_vls_setup_tick[consume_setup] = -1
        return accepted

    def _can_attack_from_here(self, reach):
        """Whether the tile you are standing on is one you can attack from.

        Two conditions, and the first is the one that is easy to miss:

            TargetRoute.beforeMovement0:
                if(!inTarget(...) && inRange(..., distance)) withinDistance = true;

        `inTarget` is true when the two players' tiles overlap - for size-1
        players, when they are on the SAME TILE. So standing under someone means
        neither of you can attack: not the person underneath, and not the person
        on top. That is the whole point of standing under a frozen opponent, and
        without it a stack of two fighters is free damage for both, which is
        exactly the deadlock this rig was producing.
        """
        dist = self.state.distance()[:, None]
        return (dist >= 1) & (dist <= reach)

    def _base_rolls(self, attacker_style, bonuses=None):
        """The expensive half of the accuracy calculation, done once per tick.

        None of this depends on which special is being used - same attacker,
        same gear, same style - so recomputing it per special was pure waste.
        What comes back is:

            attack_roll         the attacker's roll, before any special's boost
            defence_component   the defender's roll WITHOUT the final
                                x (bonus + 64), so a special that rolls against
                                a different defensive bonus (Vesta's rolls
                                against stab) only costs one extra multiply

        Everything a special changes on top - attack boost, defence boost, which
        defensive bonus to use - is then a couple of array multiplies.
        """
        s = self.state
        if bonuses is None:
            bonuses = gear.equipment_bonuses(
                s.equipped_ids, self.gear_tables["item_bonus_lookup"])
        defender_style = np.maximum(s.flip(s.style), 0)

        atk_index = self._runtime_attack_bonus_index(
            attacker_style, s.weapon_id)
        attack_bonus = np.take_along_axis(
            bonuses, atk_index[..., None], axis=-1)[..., 0]

        attack_type = self._attack_types(attacker_style, s.weapon_id)
        defender_attack_type = self._attack_types(
            defender_style, s.flip(s.weapon_id))

        level = np.where(attacker_style == schema.STYLE_MAGIC, s.magic_level,
                         np.where(attacker_style == schema.STYLE_RANGED,
                                  s.ranged_level, s.attack_level))

        effective_atk = combat.effective_attack(
            level, attacker_style,
            combat.MAGIC_BOOST_BY_STYLE[attacker_style],
            combat.RANGED_ATTACK_BOOST_BY_STYLE[attacker_style],
            combat.MELEE_ATTACK_BOOST_BY_STYLE[attacker_style],
            # CombatUtils.getMagicInterference checks the actually worn chest
            # and legs, applying 0.45 for each negative magic-attack piece.
            magic_interference=gear.magic_interference(
                s.equipped_ids, self.gear_tables["item_bonus_lookup"]),
            attack_type=attack_type)
        attack_roll = combat.attack_roll(effective_atk, attack_bonus)

        component = combat.defence_component(
            s.flip(s.defence_level), s.flip(s.magic_level),
            combat.DEFENCE_BOOST_BY_STYLE[defender_style],
            combat.MAGIC_BOOST_BY_STYLE[defender_style],
            defender_attack_type,
            attacked_by_magic=(attacker_style == schema.STYLE_MAGIC))

        return attack_roll, component, s.flip(bonuses)

    @staticmethod
    def _attack_types(style, weapon_id):
        """Return the Java attack-set type active for each DMM weapon.

        After a direct switch the bot accepts the first set that is already a
        melee style. VLS, Voidwaker and granite maul therefore remain accurate;
        the halberd's first melee set is controlled. Ranged is explicitly
        switched to rapid by the bot.
        """
        result = combat.ATTACK_TYPE_BY_STYLE[style].copy()
        melee = style == schema.STYLE_MELEE
        result = np.where(melee, combat.ACCURATE, result)
        return np.where(
            melee & (weapon_id == gear.NOXIOUS_HALBERD.item_id),
            combat.CONTROLLED,
            result)

    @staticmethod
    def _runtime_attack_bonus_index(style, weapon_id):
        """Return the active Java AttackSet's offensive/defensive style.

        The policy's three broad styles do not identify the physical attack
        roll. In particular, HALBERD's first accepted melee set is controlled
        stab, while the generic melee fallback in combat.py is slash.
        """
        result = combat.style_attack_bonus_index(style)
        melee = style == schema.STYLE_MELEE
        result = np.where(
            melee & np.isin(
                weapon_id,
                (gear.NOXIOUS_HALBERD.item_id,
                 gear.VOIDWAKER.item_id)),
            schema.STAB_ATTACK,
            result)
        return np.where(
            melee & np.isin(
                weapon_id,
                (gear.GRANITE_MAUL.item_id,
                 gear.ZURIELS_STAFF.item_id)),
            schema.CRUSH_ATTACK,
            result)

    def _hit_chance(self, base, attacker_style, defence_bonus_index=None,
                    attack_boost=0.0, defence_boost=0.0):
        """Finish the accuracy calculation for one attack or special."""
        attack_roll, defence_component, defender_gear = base

        if defence_bonus_index is None:
            attack_index = self._runtime_attack_bonus_index(
                attacker_style, self.state.weapon_id)
            def_index = np.where(
                attack_index == schema.STAB_ATTACK,
                schema.STAB_DEFENCE,
                np.where(
                    attack_index == schema.CRUSH_ATTACK,
                    schema.CRUSH_DEFENCE,
                    np.where(
                        attack_index == schema.SLASH_ATTACK,
                        schema.SLASH_DEFENCE,
                        combat.style_vs_style_defence_index(
                            attacker_style))))
        else:
            def_index = np.full_like(attacker_style, defence_bonus_index)
        defence_bonus = np.take_along_axis(
            defender_gear, def_index[..., None], axis=-1)[..., 0]

        defence_roll = defence_component * (defence_bonus + 64.0)
        return combat.hit_chance(attack_roll * (1.0 + attack_boost),
                                 defence_roll * (1.0 + defence_boost))

    def _max_hits(self, attacker_style, bonuses=None):
        """Normal max hit per fighter: strength formula for melee and ranged,
        the spell's own max for magic."""
        s = self.state
        if bonuses is None:
            bonuses = gear.equipment_bonuses(
                s.equipped_ids, self.gear_tables["item_bonus_lookup"])
        attack_type = self._attack_types(attacker_style, s.weapon_id)

        strength_index = np.where(attacker_style == schema.STYLE_RANGED,
                                  schema.RANGED_STRENGTH, schema.MELEE_STRENGTH)
        strength_bonus = np.take_along_axis(
            bonuses, strength_index[..., None], axis=-1)[..., 0]
        strength_level = np.where(attacker_style == schema.STYLE_RANGED,
                                  s.ranged_level, s.strength_level)
        eff_str = combat.effective_strength(
            strength_level, attacker_style,
            combat.RANGED_STRENGTH_BOOST_BY_STYLE[attacker_style],
            combat.MELEE_STRENGTH_BOOST_BY_STYLE[attacker_style],
            attack_type)
        physical_max = combat.max_damage(eff_str, strength_bonus)

        magic_damage_bonus = bonuses[..., schema.MAGIC_DAMAGE]
        magic_max = combat.magic_max_damage(combat.BARRAGE_MAX_DAMAGE, magic_damage_bonus)
        return np.where(attacker_style == schema.STYLE_MAGIC, magic_max, physical_max), physical_max

    def _combat_roll_context(self):
        """Post-gear roll inputs shared by both sequential player slots.

        Player-slot processing may change distance, hit queues and attack
        timers, but not the already-applied gear, combat levels or styles used
        by these calculations. Random draws remain inside each resolver call.
        """
        s = self.state
        attacker_style = np.maximum(s.style, 0)
        bonuses = gear.equipment_bonuses(
            s.equipped_ids, self.gear_tables["item_bonus_lookup"])
        max_hit, physical_max = self._max_hits(
            attacker_style, bonuses=bonuses)
        base = self._base_rolls(attacker_style, bonuses=bonuses)
        return attacker_style, max_hit, physical_max, base

    def _build_offensive_gear_influence_lookup(self):
        """Precompute which current items have a roll-changing alternative."""
        bonuses = self.gear_tables["item_bonus_lookup"]
        item_ids = np.arange(bonuses.shape[0], dtype=np.int32)
        result = np.zeros(
            (
                len(OFFENSIVE_INFLUENCE_SLOTS),
                bonuses.shape[0],
                schema.STYLE_MELEE + 1,
                2,
            ),
            dtype=bool)
        melee_attack_index = int(combat.style_attack_bonus_index(
            np.asarray(schema.STYLE_MELEE)))

        for slot_index, raw_slot in enumerate(OFFENSIVE_INFLUENCE_SLOTS):
            slot = int(raw_slot)
            alternative_ids = gear.DIRECT_GEAR_ITEMS[
                DIRECT_GEAR_LOCALS_BY_SLOT[slot]]
            alternative_safe = np.where(
                (alternative_ids >= 0)
                & (alternative_ids < bonuses.shape[0]),
                alternative_ids,
                0)
            alternatives = bonuses[alternative_safe]
            alternatives = np.where(
                (alternative_ids >= 0)[:, None], alternatives, 0)
            current = bonuses[:, None, :]
            different_item = (
                item_ids[:, None] != alternative_ids[None, :])

            magic_difference = (
                (current[..., schema.MAGIC_ATTACK]
                 != alternatives[None, :, schema.MAGIC_ATTACK])
                | (current[..., schema.MAGIC_DAMAGE]
                   != alternatives[None, :, schema.MAGIC_DAMAGE]))
            if slot in (gear.SLOT_CHEST, gear.SLOT_LEGS):
                magic_difference |= (
                    (current[..., schema.MAGIC_ATTACK] < 0)
                    != (alternatives[
                        None, :, schema.MAGIC_ATTACK] < 0))
            result[
                slot_index, :, schema.STYLE_MAGIC, 0] = np.any(
                    different_item & magic_difference, axis=1)

            ranged_strength_difference = (
                current[..., schema.RANGED_STRENGTH]
                != alternatives[None, :, schema.RANGED_STRENGTH])
            ranged_attack_difference = (
                current[..., schema.RANGE_ATTACK]
                != alternatives[None, :, schema.RANGE_ATTACK])
            result[
                slot_index, :, schema.STYLE_RANGED, 0] = np.any(
                    different_item
                    & (ranged_attack_difference
                       | ranged_strength_difference),
                    axis=1)
            result[
                slot_index, :, schema.STYLE_RANGED, 1] = np.any(
                    different_item & ranged_strength_difference,
                    axis=1)

            melee_strength_difference = (
                current[..., schema.MELEE_STRENGTH]
                != alternatives[None, :, schema.MELEE_STRENGTH])
            melee_attack_difference = (
                current[..., melee_attack_index]
                != alternatives[None, :, melee_attack_index])
            result[
                slot_index, :, schema.STYLE_MELEE, 0] = np.any(
                    different_item
                    & (melee_attack_difference
                       | melee_strength_difference),
                    axis=1)
            result[
                slot_index, :, schema.STYLE_MELEE, 1] = np.any(
                    different_item & melee_strength_difference,
                    axis=1)
        return result

    def _offensive_gear_influence_mask(
            self, roll_style, active, *, spell_magic=False,
            ignore_defence=False):
        """Port NhOffensiveGearCausality.influentialSlotMask.

        A slot receives damage credit only when the optional policy owned it
        on this decision and at least one executable alternative would change
        an exact input to this attack roll.
        """
        context = self._current_roll_context
        result = np.zeros((self.n_fights, 2), dtype=np.int32)
        if context is None or not np.asarray(active, dtype=bool).any():
            return result

        styles = np.asarray(roll_style, dtype=np.int32)
        active = np.asarray(active, dtype=bool)
        spell = np.broadcast_to(
            np.asarray(spell_magic, dtype=bool), active.shape)
        ignored = np.broadcast_to(
            np.asarray(ignore_defence, dtype=bool), active.shape)
        applicable = (
            context["eligible"]
            | context["virtual_none"]
            | (context["causal_actual"] >= 0))
        active_rows = np.flatnonzero(active.reshape(-1))
        flat_styles = styles.reshape(-1)[active_rows]
        flat_spell = spell.reshape(-1)[active_rows]
        flat_ignored = ignored.reshape(-1)[active_rows]
        flat_equipped = self.state.equipped_ids.reshape(
            -1, self.state.equipped_ids.shape[-1])[active_rows]
        current_ids = flat_equipped[:, OFFENSIVE_INFLUENCE_SLOTS]
        lookup = self._offensive_gear_influence_lookup
        safe_ids = np.where(
            (current_ids >= 0) & (current_ids < lookup.shape[1]),
            current_ids,
            0)
        valid_styles = (
            (flat_styles >= schema.STYLE_MAGIC)
            & (flat_styles <= schema.STYLE_MELEE))
        safe_styles = np.clip(
            flat_styles, schema.STYLE_MAGIC, schema.STYLE_MELEE)
        influential = lookup[
            np.arange(len(OFFENSIVE_INFLUENCE_SLOTS))[None, :],
            safe_ids,
            safe_styles[:, None],
            flat_ignored[:, None].astype(np.intp)]
        influential &= valid_styles[:, None]
        influential &= (
            (flat_styles[:, None] != schema.STYLE_MAGIC)
            | flat_spell[:, None])
        influential &= (
            applicable[active_rows][:, OFFENSIVE_INFLUENCE_UNITS]
            & ~context["reserved"][
                active_rows][:, OFFENSIVE_INFLUENCE_UNITS])
        result.reshape(-1)[active_rows] = np.bitwise_or.reduce(
            np.where(
                influential,
                OFFENSIVE_INFLUENCE_SLOT_BITS[None, :],
                0),
            axis=1)
        return result

    def _queue_hit(
            self,
            damage,
            hit_style,
            delay_ticks,
            active,
            expected_damage=None,
            spec_kind=None,
            defensive_gear_mask=None,
            tank_decision_tick=None,
            offensive_gear_mask=None,
            vengeance_reflection=None,
            vengeance_source_tick=None,
            vengeance_trigger_tick=None):
        """Send damage to the other side, arriving `delay_ticks` from now.

        Nothing is applied to HP here. Even a same-tick melee hit goes through
        the queue with a delay of 1, because that is where the prayer check
        happens, and putting it anywhere else would let the defender's prayer be
        read at the wrong moment.

        Slot 0 means the hit's HP effect is due after the next policy decision.
        A delay-D hit therefore belongs in slot D-1. This preserves both Java
        facts: HP changes on launch+D, while the bot cannot observe that change
        until decision launch+D+1.
        """
        s = self.state
        expected = (
            np.zeros_like(damage, dtype=np.float64)
            if expected_damage is None
            else np.asarray(expected_damage, dtype=np.float64))
        # Java Hit.finish() changes zero-damage DAMAGE hits to BLOCKED before
        # PlayerCombat.postTargetDamage records NH reward provenance. Expected
        # damage therefore becomes a reward source only for an actual hit.
        live = active & (damage > 0)
        if not live.any():
            return

        # Hit.clientDelayTicks floors at 1, so a delay is never below one tick.
        delay = np.clip(delay_ticks, 1, PENDING_SLOTS) - 1
        # Scatter straight into the buffer instead of walking one slot at a
        # time. Each (fight, side) appears at most once here, so the target
        # triples are unique and a plain += is safe.
        fight, side = np.nonzero(live)
        target = 1 - side
        slot = delay[fight, side]

        s.pending_damage[fight, target, slot] += damage[fight, side]
        s.pending_style_of_hit[fight, target, slot] = hit_style[fight, side]
        s.pending_source_tick[fight, target, slot] = self.world_tick
        hit_index = s.pending_hit_count[fight, target, slot].astype(np.intp)
        if np.any(hit_index >= PENDING_HITS_PER_SLOT):
            overflow = np.flatnonzero(hit_index >= PENDING_HITS_PER_SLOT)[0]
            raise RuntimeError(
                "more than "
                f"{PENDING_HITS_PER_SLOT} reward-bearing hits share one landing slot "
                f"(fight={int(fight[overflow])}, "
                f"target={int(target[overflow])}, "
                f"slot={int(slot[overflow])})")
        s.pending_hit_styles[
            fight, target, slot, hit_index] = hit_style[fight, side]
        s.pending_hit_damage[
            fight, target, slot, hit_index] = damage[fight, side]
        if expected_damage is not None:
            s.pending_hit_expected_damage[
                fight, target, slot, hit_index] = np.maximum(
                    0.0, expected[fight, side])
        s.pending_hit_source_ticks[
            fight, target, slot, hit_index] = self.world_tick
        if tank_decision_tick is not None:
            tank_ticks = np.asarray(tank_decision_tick, dtype=np.int64)
            s.pending_hit_tank_ticks[
                fight, target, slot, hit_index] = tank_ticks[fight, side]
        if defensive_gear_mask is not None:
            masks = np.asarray(defensive_gear_mask, dtype=np.int32)
            s.pending_hit_defensive_gear_masks[
                fight, target, slot, hit_index] = masks[fight, side]
        if offensive_gear_mask is not None:
            masks = np.asarray(offensive_gear_mask, dtype=np.int32)
            s.pending_hit_offensive_gear_masks[
                fight, target, slot, hit_index] = masks[fight, side]
        if vengeance_reflection is not None:
            flags = np.asarray(vengeance_reflection, dtype=bool)
            s.pending_hit_vengeance_reflection[
                fight, target, slot, hit_index] = flags[fight, side]
        if vengeance_source_tick is not None:
            ticks = np.asarray(vengeance_source_tick, dtype=np.int64)
            s.pending_hit_vengeance_source_ticks[
                fight, target, slot, hit_index] = ticks[fight, side]
        if vengeance_trigger_tick is not None:
            ticks = np.asarray(vengeance_trigger_tick, dtype=np.int64)
            s.pending_hit_vengeance_trigger_ticks[
                fight, target, slot, hit_index] = ticks[fight, side]
        if spec_kind is not None:
            kinds = np.asarray(spec_kind, dtype=np.int32)
            pending_ticks = s.pending_spec_tick[fight, side]
            pending_kinds = s.pending_spec_kind[fight, side]
            attributed = (
                (pending_ticks >= 0)
                & (pending_kinds == kinds[fight, side]))
            s.pending_hit_spec_ticks[
                fight, target, slot, hit_index] = np.where(
                    attributed, pending_ticks, -1)
            s.pending_hit_spec_kinds[
                fight, target, slot, hit_index] = np.where(
                    attributed, pending_kinds, -1)
        for index in range(len(fight)):
            target_tick = self._prior_decision_tick(
                int(fight[index]), int(target[index]), self.world_tick)
            if target_tick is not None:
                s.pending_hit_defence_ticks[
                    fight[index], target[index], slot[index],
                    hit_index[index]] = target_tick
        s.pending_hit_count[fight, target, slot] += 1

    def _apply_prayer_reduction(self, damage, hit_style, fired):
        """Cut the damage to 60% if the defender's overhead matches.

        This happens HERE, at launch, because the server does it here:
        Hit.defend() calls the target's postDefend listener, and
        PlayerCombat.postDefend is where `hit.damage *= 0.60` lives. Entity.hit
        calls defend() the moment the attack is made, so the number is fixed
        before the projectile has travelled anywhere.

        The consequence for the bot is the important bit: praying after the
        attack is thrown does nothing. The overhead has to already be up when
        the attacker commits, which is exactly why this project is about
        PREDICTING the opponent's style rather than reacting to it.
        """
        protected = self._protected_at_roll(hit_style, fired)
        return combat.apply_protection(damage, protected)

    def _protected_at_roll(self, hit_style, fired):
        s = self.state
        defender_overhead = s.flip(self._effective_overhead())
        blocking = schema.BLOCKING_PRAYER[np.maximum(hit_style, 0)]
        return fired & (defender_overhead == blocking)

    @staticmethod
    def _expected_uniform_damage(chance, min_damage, max_damage, protected):
        """Exact mean of NhExpectedDamageDistribution.uniform.

        Prayer uses the distribution's truncating multiplier, so
        ``expected * 0.6`` is subtly wrong whenever individual integer hits
        have a fractional product.
        """
        chance = np.asarray(chance, dtype=np.float64)
        minimum = np.maximum(0, np.asarray(min_damage, dtype=np.int32))
        maximum = np.maximum(minimum, np.asarray(max_damage, dtype=np.int32))
        count = np.maximum(1, maximum - minimum + 1)
        plain_sum = (
            (minimum.astype(np.float64) + maximum.astype(np.float64))
            * count / 2.0)

        # Protection is exactly floor(damage * 3 / 5). Summing it in five-value
        # blocks avoids allocating a [fights, sides, max-hit] tensor on every
        # attack while remaining bit-for-bit equivalent to Java's per-outcome
        # truncation.
        def protected_prefix(value):
            value = np.asarray(value, dtype=np.int64)
            length = np.maximum(0, value + 1)
            blocks = length // 5
            remainder = length % 5
            base_prefix = np.array([0, 0, 0, 1, 2], dtype=np.int64)
            return (
                15 * blocks * (blocks - 1) // 2
                + 4 * blocks
                + remainder * (3 * blocks)
                + base_prefix[remainder])

        protected_sum = (
            protected_prefix(maximum)
            - protected_prefix(minimum - 1))
        total = np.where(protected, protected_sum, plain_sum)
        mean = total / count
        return np.clip(chance, 0.0, 1.0) * mean

    def _book_landed_expected_damage(
            self,
            expected,
            source_ticks,
            prayer_ticks,
            tank_ticks,
            defensive_gear_masks,
            offensive_gear_masks,
            vengeance_reflection,
            hit_count):
        """Aggregate Java's direct expected-damage events at impact time."""
        s = self.state
        resolution_tick = self.world_tick + 1
        for fight_index in range(self.n_fights):
            for defender_side in range(2):
                count = int(hit_count[fight_index, defender_side])
                sources = []
                for hit_index in range(count):
                    value = float(expected[
                        fight_index, defender_side, hit_index])
                    source_tick = int(source_ticks[
                        fight_index, defender_side, hit_index])
                    if (
                        value <= 0.0
                        or source_tick < 0
                        or bool(vengeance_reflection[
                            fight_index, defender_side, hit_index])
                    ):
                        continue
                    sources.append({
                        "value": value,
                        "source_tick": source_tick,
                        "prayer_tick": int(prayer_ticks[
                            fight_index, defender_side, hit_index]),
                        "tank_tick": int(tank_ticks[
                            fight_index, defender_side, hit_index]),
                        "defensive_mask": int(defensive_gear_masks[
                            fight_index, defender_side, hit_index]),
                        "offensive_mask": int(offensive_gear_masks[
                            fight_index, defender_side, hit_index]),
                    })
                if not sources:
                    continue

                attacker_side = 1 - defender_side
                dealt_total = sum(source["value"] for source in sources)
                dealt_contributors = []
                for source in sources:
                    dealt_contributors.extend(
                        self._damage_source_contributors(
                            source_tick=source["source_tick"],
                            prayer_tick=source["prayer_tick"],
                            tank_tick=source["tank_tick"],
                            defensive_gear_mask=source[
                                "defensive_mask"],
                            offensive_gear_mask=source[
                                "offensive_mask"],
                            source_weight=(
                                source["value"] / dealt_total),
                            incoming=False))
                dealt_contributors = self._normalize_reward_contributors(
                    dealt_contributors)
                if dealt_contributors:
                    s.pending_expected_reward[
                        fight_index, attacker_side] += dealt_total
                    self._append_reward_event(
                        fight_index,
                        attacker_side,
                        reward_events.EVENT_DAMAGE_DEALT,
                        dealt_total,
                        dealt_contributors,
                        resolution_tick)

                # Java's current-episode incoming source is owned by the
                # defender's same-tick reward decision. Opening/stale sources
                # without that decision are not applied.
                taken_sources = [
                    source for source in sources
                    if source["tank_tick"] >= 0
                ]
                taken_total = sum(
                    source["value"] for source in taken_sources)
                taken_contributors = []
                if taken_total > 0.0:
                    for source in taken_sources:
                        taken_contributors.extend(
                            self._damage_source_contributors(
                                source_tick=source["source_tick"],
                                prayer_tick=source["prayer_tick"],
                                tank_tick=source["tank_tick"],
                                defensive_gear_mask=source[
                                    "defensive_mask"],
                                offensive_gear_mask=source[
                                    "offensive_mask"],
                                source_weight=(
                                    source["value"] / taken_total),
                                incoming=True))
                taken_contributors = self._normalize_reward_contributors(
                    taken_contributors)
                if taken_contributors:
                    s.pending_expected_reward[
                        fight_index, defender_side] -= taken_total
                    self._append_reward_event(
                        fight_index,
                        defender_side,
                        reward_events.EVENT_DAMAGE_TAKEN,
                        -taken_total,
                        taken_contributors,
                        resolution_tick)

    @staticmethod
    def _offensive_teacher_items(current_ids, style):
        """NhOffensiveStyleEvScorer.expectedOffensiveSlotItems."""
        ids = np.asarray(current_ids, dtype=np.int32).copy()
        if style == schema.STYLE_MAGIC:
            ids[:, gear.SLOT_HAT] = 0
            replacements = (
                (gear.SLOT_WEAPON, gear.ZURIELS_STAFF.item_id),
                (gear.SLOT_SHIELD, gear.ELIDINIS_WARD_F.item_id),
                (gear.SLOT_CHEST, gear.VIRTUS_ROBE_TOP.item_id),
                (gear.SLOT_LEGS, gear.VIRTUS_ROBE_BOTTOM.item_id),
                (gear.SLOT_HANDS, gear.CONFLICTION_GAUNTLETS.item_id),
            )
        elif style == schema.STYLE_RANGED:
            ids[:, gear.SLOT_HAT] = 0
            ids[:, gear.SLOT_LEGS] = 0
            replacements = (
                (gear.SLOT_WEAPON, gear.ZARYTE_CROSSBOW.item_id),
                (gear.SLOT_SHIELD, gear.ELIDINIS_WARD_F.item_id),
                (gear.SLOT_CHEST, gear.MASORI_BODY_F.item_id),
                (gear.SLOT_HANDS, gear.BARROWS_GLOVES.item_id),
                (gear.SLOT_AMMO, gear.ONYX_DRAGON_BOLTS_E.item_id),
            )
        else:
            replacements = (
                (gear.SLOT_HAT, gear.TORVA_FULL_HELM.item_id),
                (gear.SLOT_WEAPON, gear.NOXIOUS_HALBERD.item_id),
                (gear.SLOT_LEGS, gear.TORVA_PLATELEGS.item_id),
                (gear.SLOT_HANDS, gear.BARROWS_GLOVES.item_id),
            )
            ids[:, gear.SLOT_SHIELD] = 0
        for slot, item_id in replacements:
            ids[:, slot] = item_id
        return ids

    def _offensive_teacher_expected_damage(
            self, defender_prayer_code, rows=None):
        """Port NhOffensiveStyleEvScorer for selected attack-roll rows."""
        s = self.state
        select = slice(None) if rows is None else np.asarray(
            rows, dtype=np.int64)
        defender_prayer_code = np.asarray(
            defender_prayer_code, dtype=np.int32)
        current_ids = self._flat(s.equipped_ids)[select]
        defender_ids = self._flat(s.flip(s.equipped_ids))[select]
        defender_bonuses = gear.equipment_bonuses(
            defender_ids, self.gear_tables["item_bonus_lookup"])
        defender_style = np.maximum(
            self._flat(s.flip(s.style))[select], 0)
        defender_attack_type = self._attack_types(
            defender_style, self._flat(s.flip(s.weapon_id))[select])
        defender_defence = self._flat(s.flip(s.defence_level))[select]
        defender_magic = self._flat(s.flip(s.magic_level))[select]
        values = []
        count = current_ids.shape[0]
        for style in (
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE):
            style_array = np.full(count, style, dtype=np.int32)
            expected_ids = self._offensive_teacher_items(
                current_ids, style)
            bonuses = gear.equipment_bonuses(
                expected_ids, self.gear_tables["item_bonus_lookup"])
            attack_type = np.full(
                count,
                combat.AGGRESSIVE
                if style == schema.STYLE_MELEE else combat.ACCURATE,
                dtype=np.int32)

            if style == schema.STYLE_MAGIC:
                level = np.maximum(
                    self._flat(s.magic_level)[select], 99)
            elif style == schema.STYLE_RANGED:
                level = np.maximum(
                    self._flat(s.ranged_level)[select], 112)
            else:
                level = np.maximum(
                    self._flat(s.attack_level)[select], 118)
            attack_index = combat.style_attack_bonus_index(style_array)
            attack_bonus = np.take_along_axis(
                bonuses, attack_index[:, None], axis=-1)[:, 0]
            effective_attack = combat.effective_attack(
                level,
                style_array,
                combat.MAGIC_BOOST_BY_STYLE[style_array],
                combat.RANGED_ATTACK_BOOST_BY_STYLE[style_array],
                combat.MELEE_ATTACK_BOOST_BY_STYLE[style_array],
                gear.magic_interference(
                    expected_ids, self.gear_tables["item_bonus_lookup"]),
                attack_type)
            if style == schema.STYLE_MAGIC:
                effective_attack *= 1.10
            attack_roll = combat.attack_roll(
                effective_attack, attack_bonus)

            defence_component = combat.defence_component(
                defender_defence,
                defender_magic,
                combat.DEFENCE_BOOST_BY_STYLE[defender_style],
                combat.MAGIC_BOOST_BY_STYLE[defender_style],
                defender_attack_type,
                attacked_by_magic=(style_array == schema.STYLE_MAGIC))
            defence_index = combat.style_vs_style_defence_index(style_array)
            defence_bonus = np.take_along_axis(
                defender_bonuses,
                defence_index[:, None],
                axis=-1)[:, 0]
            chance = combat.hit_chance(
                attack_roll,
                defence_component * (defence_bonus + 64.0))

            if style == schema.STYLE_MAGIC:
                maximum = np.floor(
                    30.0 * (1.0 + bonuses[:, schema.MAGIC_DAMAGE] / 100.0)
                    + 0.5).astype(np.int32)
            else:
                strength_level = (
                    np.maximum(self._flat(s.ranged_level)[select], 112)
                    if style == schema.STYLE_RANGED else
                    np.maximum(self._flat(s.strength_level)[select], 118))
                strength_index = (
                    schema.RANGED_STRENGTH
                    if style == schema.STYLE_RANGED else
                    schema.MELEE_STRENGTH)
                effective_strength = combat.effective_strength(
                    strength_level,
                    style_array,
                    combat.RANGED_STRENGTH_BOOST_BY_STYLE[style_array],
                    combat.MELEE_STRENGTH_BOOST_BY_STYLE[style_array],
                    attack_type)
                maximum = combat.max_damage(
                    effective_strength, bonuses[:, strength_index])

            style_code = 3 - style
            protected = defender_prayer_code == style_code
            plain = self._expected_uniform_damage(
                chance, np.zeros_like(maximum), maximum, protected)
            if style == schema.STYLE_RANGED:
                boosted_max = (
                    maximum * (1.0 + combat.ONYX_BOLT_DAMAGE_BOOST)
                ).astype(np.int32)
                boosted = self._expected_uniform_damage(
                    chance,
                    np.zeros_like(maximum),
                    boosted_max,
                    protected)
                expected = (
                    (1.0 - combat.ONYX_BOLT_PROC_CHANCE) * plain
                    + combat.ONYX_BOLT_PROC_CHANCE * boosted)
            else:
                expected = plain
            expected += np.where(
                (defender_prayer_code > 0)
                & (defender_prayer_code != style_code),
                OFFENSIVE_STYLE_TEACHER_OFF_PRAYER_BONUS,
                0.0)
            values.append(expected)
        return np.stack(values, axis=1), defender_prayer_code

    def _book_offensive_style_teacher(self, fired):
        """Attach the roll-time counterfactual style target to this decision."""
        context = self._current_roll_context
        fired = self._flat(np.asarray(fired, dtype=bool))
        if context is None or not fired.any():
            return
        attack_action = context["attack_action"]
        spec_action = context["spec_action"]
        attack_selected = (
            (attack_action >= schema.COMBAT_ATTACK_BASE)
            & (attack_action < schema.COMBAT_SPEC_NONE))
        eligible = (
            fired
            & attack_selected
            & (spec_action == schema.COMBAT_SPEC_NONE)
            & (context["offensive_style_teacher_action"] < 0))
        if not eligible.any():
            return

        eligible_rows = np.flatnonzero(eligible)
        intent = np.maximum(
            0, (attack_action[eligible_rows]
                - schema.COMBAT_ATTACK_BASE) % 2)
        candidates = (
            schema.COMBAT_ATTACK_BASE
            + np.arange(3, dtype=np.int32)[None, :] * 2
            + intent[:, None])
        legal = np.take_along_axis(
            context["legal_mask"][eligible_rows], candidates, axis=1)
        prayer_code = context[
            "decision_visible_defender_prayer_style_code"
        ][eligible_rows]
        expected, prayer_code = self._offensive_teacher_expected_damage(
            prayer_code, eligible_rows)
        scored = np.where(legal, expected, -np.inf)
        ordered = np.sort(scored, axis=1)
        best_style = np.argmax(scored, axis=1)
        separated = (
            legal.sum(axis=1) >= 2
        ) & (ordered[:, -1] > ordered[:, -2] + 1.0e-6)
        selected = np.flatnonzero(separated)
        if not len(selected):
            return
        rows = eligible_rows[selected]
        style = best_style[selected]
        context["offensive_style_teacher_action"][rows] = candidates[
            selected, style]
        context["offensive_style_teacher_attack_style_code"][rows] = (
            3 - style)
        context[
            "offensive_style_teacher_defender_prayer_style_code"
        ][rows] = prayer_code[selected]

    def _book_roll_offensive_gear_teacher(self, fired):
        """Label the exact ordinary-magic offensive set on its roll row."""
        context = self._current_roll_context
        fired = self._flat(np.asarray(fired, dtype=bool))
        if context is None or not fired.any():
            return
        labels = np.asarray([
            self._direct_gear_action(
                gear.SLOT_WEAPON, gear.ZURIELS_STAFF.item_id),
            self._direct_gear_action(
                gear.SLOT_CHEST, gear.VIRTUS_ROBE_TOP.item_id),
            self._direct_gear_action(
                gear.SLOT_LEGS, gear.VIRTUS_ROBE_BOTTOM.item_id),
            self._direct_gear_action(
                gear.SLOT_SHIELD, gear.ELIDINIS_WARD_F.item_id),
        ], dtype=np.int32)
        rows = np.flatnonzero(fired)
        context["roll_offensive_gear_teacher_action_count"][rows] = 4
        context["roll_offensive_gear_teacher_actions"][rows] = labels
        context["roll_offensive_gear_teacher_attack_style_code"][rows] = 3

    def _book_vengeance_opportunity(self, fired, expected_damage):
        """Attach a roll to the defender's exact previous-tick decision."""
        pending = self._pending
        fired = np.asarray(fired, dtype=bool)
        if pending is None or not fired.any():
            return
        target = self.state.flip(fired)
        expected = self.state.flip(np.asarray(
            expected_damage, dtype=np.float64))
        flat_target = self._flat(target)
        flat_expected = self._flat(expected)
        matches = (
            flat_target
            & (pending.decision_tick == self.world_tick - 1)
            & ~pending.done)
        rows = np.flatnonzero(matches)
        if not len(rows):
            return
        pending.vengeance_opportunity_roll_tick[rows] = self.world_tick
        pending.vengeance_opportunity_expected_damage[rows] = np.maximum(
            pending.vengeance_opportunity_expected_damage[rows],
            flat_expected[rows])

    def _book_roll_prayer(self, fired, hit_style, spec_kind=None):
        """Reward and label the decision that could affect this attack roll."""
        fired = np.asarray(fired, dtype=bool)
        if not fired.any():
            return
        s = self.state
        protected = self._protected_at_roll(hit_style, fired)

        # PlayerCombat's effective prayer delay is one tick. Java therefore
        # attaches the teacher label to the latest defender decision at or
        # before rollTick - 1. rollPrayerRewardComponents explicitly excludes
        # an attack with no pre-roll decision, including the episode's opening
        # attack, from both reward and attribution.
        pending = self._pending
        if pending is None:
            return
        target = s.flip(fired)
        target_style = s.flip(hit_style)
        style_code = np.where(
            target_style == schema.STYLE_MAGIC, 3,
            np.where(target_style == schema.STYLE_RANGED, 2, 1))
        prayer_action = (
            schema.DEFENCE_BASE
            + schema.BLOCKING_PRAYER[np.maximum(target_style, 0)])
        flat_target = self._flat(target)
        flat_target &= ~pending.done
        flat_target &= pending.episode_id == self._flat(s.episode_id)
        defender_reward = self._flat(s.flip(np.where(
            fired,
            np.where(protected,
                     REWARD_ROLL_PRAYER_CORRECT,
                     REWARD_ROLL_PRAYER_INCORRECT),
            0.0)))
        self._flat(s.pending_roll_prayer_reward)[flat_target] += (
            defender_reward[flat_target])
        pending.roll_prayer_teacher_action[flat_target] = self._flat(
            prayer_action)[flat_target]
        pending.roll_prayer_teacher_attack_style_code[flat_target] = self._flat(
            style_code)[flat_target]

        for flat_row in np.flatnonzero(flat_target):
            fight_index, defender_side = divmod(int(flat_row), 2)
            attacker_side = 1 - defender_side
            source_tick = self.world_tick
            target_tick = int(pending.decision_tick[flat_row])
            value = (
                REWARD_ROLL_PRAYER_CORRECT
                if bool(protected[fight_index, attacker_side])
                else REWARD_ROLL_PRAYER_INCORRECT)
            self._append_reward_event(
                fight_index,
                defender_side,
                reward_events.EVENT_ROLL_PRAYER,
                value,
                (reward_events.RewardContributor(
                    source_tick=source_tick,
                    target_decision_tick=target_tick,
                    causal_unit=reward_events.UNIT_DEFENCE),),
                source_tick + 1)

    @staticmethod
    def _tank_defence_score(bonuses, incoming_style):
        """PlayerCombat.nhStakerDefenceScoreAgainstStyle (lines 2699-2715)."""
        if incoming_style == schema.STYLE_MAGIC:
            return int(bonuses[schema.MAGIC_DEFENCE])
        if incoming_style == schema.STYLE_RANGED:
            return int(bonuses[schema.RANGE_DEFENCE])
        return int(min(
            bonuses[schema.STAB_DEFENCE],
            bonuses[schema.SLASH_DEFENCE],
            bonuses[schema.CRUSH_DEFENCE]))

    @staticmethod
    def _apply_expected_tank_equip(bonuses, equipped, slot, item):
        """PlayerCombat.nhStakerApplyExpectedEquip (lines 2515-2540)."""
        bonuses = bonuses.copy()
        equipped = equipped.copy()

        if slot == gear.SLOT_SHIELD:
            weapon_id = int(equipped[gear.SLOT_WEAPON])
            weapon = gear.BY_ID.get(weapon_id)
            if weapon is not None and weapon.two_handed:
                bonuses -= np.asarray(weapon.bonuses, dtype=np.int32)
                equipped[gear.SLOT_WEAPON] = 0
        elif slot == gear.SLOT_WEAPON and item.two_handed:
            shield_id = int(equipped[gear.SLOT_SHIELD])
            shield = gear.BY_ID.get(shield_id)
            if shield is not None:
                bonuses -= np.asarray(shield.bonuses, dtype=np.int32)
                equipped[gear.SLOT_SHIELD] = 0

        current = gear.BY_ID.get(int(equipped[slot]))
        if current is not None:
            bonuses -= np.asarray(current.bonuses, dtype=np.int32)
        bonuses += np.asarray(item.bonuses, dtype=np.int32)
        equipped[slot] = item.item_id
        return bonuses, equipped

    @staticmethod
    def _direct_gear_action(slot, item_id):
        action = DIRECT_GEAR_ACTION_BY_SLOT_ITEM.get(
            (int(slot), int(item_id)))
        if action is None:
            raise ValueError(
                f"no unique direct-gear action for slot={slot} item={item_id}")
        return int(action)

    @staticmethod
    def _projected_tank_defence_score(
            bonuses, incoming_style, removed_items, added_item=None):
        """Score a hypothetical equip without copying all fourteen bonuses."""
        if incoming_style == schema.STYLE_MAGIC:
            indices = (schema.MAGIC_DEFENCE,)
        elif incoming_style == schema.STYLE_RANGED:
            indices = (schema.RANGE_DEFENCE,)
        else:
            indices = (
                schema.STAB_DEFENCE,
                schema.SLASH_DEFENCE,
                schema.CRUSH_DEFENCE,
            )
        projected = []
        for index in indices:
            value = int(bonuses[index])
            for item in removed_items:
                if item is not None:
                    value -= int(item.bonuses[index])
            if added_item is not None:
                value += int(added_item.bonuses[index])
            projected.append(value)
        return min(projected)

    def _roll_tank_raw_reward(self, equipped_ids, incoming_style, free_slots):
        """Return Java's raw tank reward and its up-to-three teacher actions.

        PlayerCombat.java:2376-2488 greedily chooses at most three strict
        defence improvements, without reusing a slot. NhStakerBot.java:
        2450-2469 converts that plan to the missing-switch bucket reward.

        The fast state tracks equipment, supplies, and free slots but not the
        physical order of inventory entries. Candidate iteration therefore uses
        the fixed DMM loadout table. Java's strict-improvement comparison means
        this differs only where two inventory items tie for the same score.
        """
        equipped_ids = np.asarray(equipped_ids, dtype=np.int32)
        key = (
            equipped_ids.tobytes(),
            int(incoming_style),
            int(free_slots),
        )
        cached = self._tank_reward_cache.get(key)
        if cached is not None:
            return cached

        clean_ids = np.where(equipped_ids > 0, equipped_ids, 0)
        lookup = self.gear_tables["item_bonus_lookup"]
        expected = gear.equipment_bonuses(clean_ids[None, :], lookup)[0]
        expected_items = clean_ids.astype(np.int32, copy=True)
        initial_score = self._tank_defence_score(expected, incoming_style)
        swapped_slots = set()
        teacher_actions = []
        teacher_slots = []
        swaps_used = 0
        free = max(0, int(free_slots))

        for _ in range(3):
            best_score = self._tank_defence_score(expected, incoming_style)
            best = None
            for slot in TANK_GEAR_SLOTS:
                if slot in swapped_slots:
                    continue
                current_id = int(expected_items[slot])
                current = gear.BY_ID.get(current_id)

                if current_id > 0 and free > 0:
                    score = self._projected_tank_defence_score(
                        expected, incoming_style, (current,))
                    if score > best_score:
                        best_score = score
                        best = (
                            slot,
                            None,
                            -1,
                            self._direct_gear_action(slot, -1),
                        )

                for item in TANK_GEAR_CANDIDATES[slot]:
                    if item.item_id == current_id:
                        continue
                    removed_items = [current]
                    if slot == gear.SLOT_SHIELD:
                        weapon = gear.BY_ID.get(
                            int(expected_items[gear.SLOT_WEAPON]))
                        if weapon is not None and weapon.two_handed:
                            removed_items.append(weapon)
                    elif slot == gear.SLOT_WEAPON and item.two_handed:
                        shield = gear.BY_ID.get(
                            int(expected_items[gear.SLOT_SHIELD]))
                        if shield is not None:
                            removed_items.append(shield)
                    score = self._projected_tank_defence_score(
                        expected, incoming_style, removed_items, item)
                    if score > best_score:
                        best_score = score
                        best = (
                            slot,
                            item,
                            1 if current_id == 0 else 0,
                            self._direct_gear_action(slot, item.item_id),
                        )

            if best is None:
                break
            slot, item, free_delta, teacher_action = best
            if item is None:
                expected = expected.copy()
                current = gear.BY_ID.get(int(expected_items[slot]))
                if current is not None:
                    expected -= np.asarray(
                        current.bonuses, dtype=np.int32)
                expected_items = expected_items.copy()
                expected_items[slot] = 0
            else:
                expected, expected_items = self._apply_expected_tank_equip(
                    expected, expected_items, slot, item)
            swapped_slots.add(slot)
            teacher_slots.append(int(slot))
            teacher_actions.append(int(teacher_action))
            swaps_used += 1
            free = max(0, free + free_delta)

        final_score = self._tank_defence_score(expected, incoming_style)
        gap = max(0, final_score - initial_score)
        raw = (
            REWARD_ROLL_TANK_MISSING[min(swaps_used, 3)]
            - gap * REWARD_ROLL_TANK_GAP_SCALE)
        result = (
            raw,
            tuple(teacher_actions),
            tuple(teacher_slots),
            tuple(int(item) for item in expected_items))
        self._tank_reward_cache[key] = result
        return result

    def _book_roll_tank_gear(self, fired, hit_style):
        """Book same-tick tank gear quality to the next observation."""
        fired = np.asarray(fired, dtype=bool)
        context = self._current_roll_context
        defensive_masks = np.zeros(
            (self.n_fights, 2), dtype=np.int32)
        if not fired.any() or context is None:
            return defensive_masks
        s = self.state
        target = s.flip(fired)
        target_rows = np.flatnonzero(target.reshape(-1))
        flat_equipped = self._flat(s.equipped_ids)
        flat_free_slots = self._flat(s.inventory_free_slots)
        flat_hit_style = self._flat(np.asarray(hit_style, dtype=np.int32))
        batch_results = {}
        ordered_results = []
        for flat_row in target_rows:
            style = int(flat_hit_style[int(flat_row) ^ 1])
            free_slots = int(flat_free_slots[flat_row])
            key = (
                flat_equipped[flat_row].tobytes(),
                style,
                free_slots,
            )
            tank_result = batch_results.get(key)
            if tank_result is None:
                tank_result = self._roll_tank_raw_reward(
                    flat_equipped[flat_row], style, free_slots)
                batch_results[key] = tank_result
            ordered_results.append(tank_result)

        for raw_flat_row, tank_result in zip(
                target_rows, ordered_results):
            flat_row = int(raw_flat_row)
            fight_index, defender_side = divmod(flat_row, 2)
            attacker_side = 1 - defender_side
            (
                raw,
                teacher_actions,
                teacher_slots,
                expected_items,
            ) = tank_result
            count = min(4, len(teacher_actions))
            context["tank_gear_teacher_action_count"][flat_row] = count
            context["tank_gear_teacher_actions"][flat_row] = -1
            if count:
                context["tank_gear_teacher_actions"][
                    flat_row, :count] = teacher_actions[:count]

            applicable = (
                context["eligible"][flat_row]
                | context["virtual_none"][flat_row]
                | (context["causal_actual"][flat_row] >= 0))

            current_items = np.where(
                s.equipped_ids[fight_index, defender_side] > 0,
                s.equipped_ids[fight_index, defender_side],
                0)
            relevant_slots = []
            for slot in TANK_GEAR_SLOTS:
                slot = int(slot)
                relevant = slot in teacher_slots
                if (
                    not relevant
                    and slot in STABLE_TANK_RELEVANT_SLOTS
                    and int(expected_items[slot]) > 0
                    and int(expected_items[slot])
                    == int(current_items[slot])
                ):
                    relevant = True
                if relevant:
                    relevant_slots.append(slot)

            matched_slots = [
                slot for slot in relevant_slots
                if int(expected_items[slot]) == int(current_items[slot])
            ]
            missed_slots = [
                slot for slot in relevant_slots
                if int(expected_items[slot]) != int(current_items[slot])
            ]
            for slot in relevant_slots:
                unit = OPTIONAL_GEAR_UNIT_BY_SLOT[slot]
                if (
                    not context["reserved"][flat_row, unit]
                    and applicable[unit]
                ):
                    defensive_masks[
                        fight_index, attacker_side] |= 1 << slot

            recipients = []
            candidate_slots = (
                matched_slots if raw > 0.0 else missed_slots)
            for slot in sorted(candidate_slots):
                unit = OPTIONAL_GEAR_UNIT_BY_SLOT[int(slot)]
                if context["reserved"][flat_row, unit]:
                    recipient = (reward_events.UNIT_COMBAT, int(slot))
                elif applicable[unit]:
                    recipient = (unit, int(slot))
                else:
                    continue
                if recipient not in recipients:
                    recipients.append(recipient)
            if not recipients:
                continue

            s.pending_roll_tank_gear_reward[
                fight_index, defender_side] += raw
            target_tick = int(context["decision_tick"][flat_row])
            weight = 1.0 / len(recipients)
            contributors = tuple(
                reward_events.RewardContributor(
                    source_tick=self.world_tick,
                    target_decision_tick=target_tick,
                    causal_unit=unit,
                    gear_slot=slot,
                    weight=weight)
                for unit, slot in recipients)
            self._tick_tank_components.append({
                "fight": int(fight_index),
                "side": int(defender_side),
                "raw": float(raw),
                "contributors": contributors,
            })
        return defensive_masks

    def _finalize_tank_reward_events(self):
        """Apply Java's per-update tank cap without changing component signs."""
        grouped = {}
        for component in self._tick_tank_components:
            key = (component["fight"], component["side"])
            grouped.setdefault(key, []).append(component)
        for (fight_index, side), components in grouped.items():
            raw_total = sum(item["raw"] for item in components)
            clipped = float(np.clip(
                raw_total,
                -REWARD_ROLL_TANK_MAX_PENALTY,
                REWARD_ROLL_TANK_MAX_BONUS))
            scale = 1.0 if raw_total == 0.0 else clipped / raw_total
            allocated = 0.0
            for index, component in enumerate(components):
                value = (
                    clipped - allocated
                    if index + 1 == len(components)
                    else component["raw"] * scale)
                allocated += value
                if value == 0.0:
                    continue
                self._append_reward_event(
                    fight_index,
                    side,
                    reward_events.EVENT_ROLL_TANK_GEAR,
                    value,
                    component["contributors"],
                    self.world_tick + 1)

    def _resolve_attacks(
            self, attacking, speccing, spec_kind, roll_context=None):
        s = self.state
        if roll_context is None:
            roll_context = self._combat_roll_context()
        attacker_style, max_hit, physical_max, base = roll_context
        # Projectile.send uses Misc.getDistance (Chebyshev), while policy
        # observations use Position.distance (floor Euclidean).
        distance = self.state.tile_distance()[:, None]

        # --- the ordinary attack --------------------------------------------
        equipped = s.equipped_ids
        confliction_eligible = (
            (equipped[:, :, gear.SLOT_WEAPON] == gear.ZURIELS_STAFF.item_id)
            & (equipped[:, :, gear.SLOT_HANDS]
               == gear.CONFLICTION_GAUNTLETS.item_id)
            & (equipped[:, :, gear.SLOT_SHIELD] > 0)
            & (attacker_style == schema.STYLE_MAGIC))
        confliction_consumed = (
            confliction_eligible
            & (s.confliction_magic_accuracy_until_tick >= self.world_tick))
        zuriel_cast = (
            (equipped[:, :, gear.SLOT_WEAPON] == gear.ZURIELS_STAFF.item_id)
            & (attacker_style == schema.STYLE_MAGIC))
        # Hit.boostAttack is additive in Java. Ice Barrage adds Zuriel's 0.10,
        # then TargetSpell.cast adds Confliction's stored 1.00 when consumed.
        chance = self._hit_chance(
            base, attacker_style,
            attack_boost=(
                np.where(
                    zuriel_cast, combat.ZURIELS_STAFF_ATTACK_BOOST, 0.0)
                + np.where(confliction_consumed, 1.0, 0.0)))

        # Onyx dragon bolts (e). The proc is rolled before the hit and does not
        # depend on whether it lands, matching OnyxBoltEffect. On a proc the max
        # damage goes up 20% - applied before the roll, the same way every other
        # damageBoost in Hit.defend works.
        replay_onyx = (
            self._replay_units(replay.DRAW_ONYX)
            if self.replay_seed is not None else None)
        onyx_draw = (
            self.rng.random(attacking.shape)
            if replay_onyx is None else replay_onyx)
        onyx_proc = (attacking
                     & (attacker_style == schema.STYLE_RANGED)
                     & (onyx_draw <= combat.ONYX_BOLT_PROC_CHANCE))
        onyx_boost = np.where(onyx_proc, combat.ONYX_BOLT_DAMAGE_BOOST, 0.0)

        ordinary_protected = self._protected_at_roll(
            attacker_style, attacking)
        base_expected = self._expected_uniform_damage(
            chance, np.zeros_like(max_hit), max_hit, ordinary_protected)
        boosted_max = (
            max_hit * (1.0 + combat.ONYX_BOLT_DAMAGE_BOOST)).astype(np.int32)
        boosted_expected = self._expected_uniform_damage(
            chance, np.zeros_like(max_hit), boosted_max, ordinary_protected)
        ordinary_expected = np.where(
            attacker_style == schema.STYLE_RANGED,
            (1.0 - combat.ONYX_BOLT_PROC_CHANCE) * base_expected
            + combat.ONYX_BOLT_PROC_CHANCE * boosted_expected,
            base_expected)
        self._record_defence_prayer_attack_history(
            attacking, attacker_style)
        self._book_roll_prayer(attacking, attacker_style)
        defensive_masks = self._book_roll_tank_gear(
            attacking, attacker_style)
        offensive_masks = self._offensive_gear_influence_mask(
            attacker_style,
            attacking,
            spell_magic=(attacker_style == schema.STYLE_MAGIC))
        self._book_offensive_style_teacher(attacking)
        self._book_roll_offensive_gear_teacher(
            attacking & (attacker_style == schema.STYLE_MAGIC))
        self._book_vengeance_opportunity(attacking, ordinary_expected)

        replay_damage = (
            self._replay_units(replay.DRAW_DAMAGE)
            if self.replay_seed is not None else None)
        replay_accuracy = (
            self._replay_units(replay.DRAW_ACCURACY)
            if self.replay_seed is not None else None)
        roll_kwargs = {}
        if replay_damage is not None:
            roll_kwargs["damage_draw"] = replay_damage
            roll_kwargs["accuracy_draw"] = replay_accuracy
        damage, accurate = combat.roll_hit(
            self.rng, chance, np.zeros_like(max_hit), max_hit,
            damage_boost=onyx_boost, return_landed=True, **roll_kwargs)
        if self.replay_seed is not None:
            self._replay_hit_ordinals += attacking.astype(np.int32)
        damage = np.where(attacking, damage, 0)
        damage = self._apply_prayer_reduction(damage, attacker_style, attacking)

        # TargetSpell.cast arms the Confliction accuracy window for four ticks
        # after a blocked eligible cast. A successful cast clears it only when
        # that cast actually consumed the stored boost.
        confliction_blocked = (
            attacking & confliction_eligible & ~accurate)
        confliction_used = (
            attacking & confliction_eligible & accurate
            & confliction_consumed)
        s.confliction_magic_accuracy_until_tick = np.where(
            confliction_blocked,
            self.world_tick + 4,
            np.where(
                confliction_used,
                -1,
                s.confliction_magic_accuracy_until_tick))

        # ...and the attacker heals a quarter of what the hit deals. Taken after
        # the prayer reduction and after the accuracy check, because Java reads
        # it back out of target.hit(), so a blocked bolt heals nothing. The heal
        # is immediate - it does not wait for the bolt to arrive.
        if onyx_proc.any():
            heal = np.where(
                onyx_proc,
                (damage * combat.ONYX_BOLT_HEAL_FRACTION).astype(np.int32), 0)
            # Entity.incrementHp, faithfully: it clamps UP to max, and if you
            # are somehow already above max it leaves you alone rather than
            # pulling you down. Only rows that actually healed are touched -
            # writing the clamp across the whole array would quietly cap every
            # fighter's health any time anyone procced.
            topped_up = np.minimum(s.hp + heal, MAX_HP)
            s.hp = np.where((heal > 0) & (s.hp <= MAX_HP), topped_up, s.hp)

        # Hit delay is a function of distance, not a constant.
        delay = combat.projectile_ticks(attacker_style, distance, self.tick_ms)
        self._queue_hit(
            damage,
            attacker_style,
            delay,
            attacking,
            ordinary_expected,
            defensive_gear_mask=defensive_masks,
            tank_decision_tick=np.where(
                attacking, self.world_tick, -1),
            offensive_gear_mask=offensive_masks)

        # Barrage freezes on a hit that was not blocked, unless the target is
        # still inside the immunity window from the last freeze. The freeze is
        # applied at roll time, matching IceBarrage.afterHit.
        # TargetSpell.hold checks Hit.isBlocked(), not damage. An accurate
        # barrage whose inclusive damage roll is zero still freezes.
        froze = attacking & (attacker_style == schema.STYLE_MAGIC) & accurate
        applies = froze & (s.flip(s.freeze_immunity) <= 0)
        if applies.any():
            new_freeze = s.flip(applies)
            s.freeze_ticks = np.where(new_freeze, combat.BARRAGE_FREEZE_TICKS,
                                      s.freeze_ticks)
            s.freeze_immunity = np.where(
                new_freeze, combat.BARRAGE_FREEZE_TICKS + FREEZE_IMMUNITY_TICKS,
                s.freeze_immunity)
            s.pending_freeze_reward += np.where(
                applies, REWARD_FREEZE_LANDED, 0.0)
            for fight_index, attacker_side in np.argwhere(applies):
                attacker_side = int(attacker_side)
                self._append_reward_event(
                    fight_index,
                    attacker_side,
                    reward_events.EVENT_FREEZE_LANDED,
                    REWARD_FREEZE_LANDED,
                    (reward_events.RewardContributor(
                        source_tick=self.world_tick,
                        target_decision_tick=self.world_tick,
                        causal_unit=reward_events.UNIT_COMBAT),),
                    self.world_tick + 1)

        # --- specials --------------------------------------------------------
        # Each one is its own thing. See combat.SPEC_SPECS for what makes them
        # different and where each number came from.
        for kind, spec in combat.SPEC_SPECS.items():
            fires = speccing & (spec_kind == kind)
            if not fires.any():
                continue

            cost = schema.SPEC_ENERGY_COST[kind]
            affordable = fires & (s.special_energy >= cost)
            if not affordable.any():
                continue
            if kind == schema.SPEC_VESTA_LONGSWORD:
                # PvPArmor.postDamageListener attaches the charge attribute
                # during Hit.defend. ItemContainerG.contains() ignores
                # attributed inventory items, so after this VLS is stowed the
                # Java observation no longer reports it as spec-available.
                s.vls_attributed |= affordable
            s.special_energy = np.where(affordable, s.special_energy - cost,
                                        s.special_energy)
            pending_match = (
                affordable
                & (s.pending_spec_tick >= 0)
                & (s.pending_spec_kind == kind))
            s.pending_spec_launch_observed |= pending_match

            spec_chance = self._hit_chance(
                base, attacker_style,
                defence_bonus_index=spec.get("defence_style"),
                attack_boost=spec["attack_boost"],
                defence_boost=spec["defence_boost"])

            min_damage = (physical_max * spec["min_fraction"]).astype(np.int32)
            spec_max = (physical_max * spec["max_fraction"]).astype(np.int32)
            hit_style = np.full_like(attacker_style, spec["hit_style"])

            # The granite maul double is two separate hits, so it rolls twice.
            for hit_ordinal in range(spec["extra_hits"]):
                protected = self._protected_at_roll(hit_style, affordable)
                effective_max = (
                    spec_max * (1.0 + spec["damage_boost"])).astype(np.int32)
                expected = self._expected_uniform_damage(
                    np.where(spec["ignore_defence"], 1.0, spec_chance),
                    min_damage,
                    effective_max,
                    protected)
                self._record_defence_prayer_attack_history(
                    affordable, hit_style)
                self._book_roll_prayer(
                    affordable, hit_style, spec_kind=kind)
                defensive_masks = self._book_roll_tank_gear(
                    affordable, hit_style)
                offensive_masks = self._offensive_gear_influence_mask(
                    hit_style,
                    affordable,
                    spell_magic=False,
                    ignore_defence=spec["ignore_defence"])
                self._book_offensive_style_teacher(affordable)
                self._book_vengeance_opportunity(affordable, expected)
                replay_damage = (
                    self._replay_units(replay.DRAW_DAMAGE)
                    if self.replay_seed is not None else None)
                replay_accuracy = (
                    self._replay_units(replay.DRAW_ACCURACY)
                    if self.replay_seed is not None else None)
                roll_kwargs = {}
                if replay_damage is not None:
                    roll_kwargs["damage_draw"] = replay_damage
                    roll_kwargs["accuracy_draw"] = replay_accuracy
                rolled = combat.roll_hit(
                    self.rng, spec_chance, min_damage, spec_max,
                    damage_boost=spec["damage_boost"],
                    ignore_defence=spec["ignore_defence"],
                    **roll_kwargs)
                if self.replay_seed is not None:
                    self._replay_hit_ordinals += affordable.astype(np.int32)
                rolled = np.where(affordable, rolled, 0)
                rolled = self._apply_prayer_reduction(rolled, hit_style, affordable)
                # Specials are melee-range, so they land on the next tick.
                self._queue_hit(
                    rolled,
                    hit_style,
                    np.full_like(rolled, combat.MELEE_HIT_TICKS),
                    affordable,
                    expected,
                    spec_kind=np.full_like(attacker_style, kind),
                    defensive_gear_mask=defensive_masks,
                    tank_decision_tick=np.where(
                        affordable, self.world_tick, -1),
                    offensive_gear_mask=offensive_masks)

            # PlayerCombat.handleSpecial clears the queued special only after
            # its launch and energy drain (PlayerCombat.java:3318-3325).
            s.active_spec_kind = np.where(
                affordable & (s.active_spec_kind == kind),
                -1,
                s.active_spec_kind)

        # --- attack timer ----------------------------------------------------
        swung = attacking | speccing
        weapon_ticks = self.gear_tables["attack_ticks"][attacker_style]
        for kind, spec_weapon in enumerate(gear.SPEC_WEAPONS):
            if spec_weapon is not None:
                weapon_ticks = np.where(
                    speccing & (spec_kind == kind),
                    spec_weapon.attack_ticks,
                    weapon_ticks)
        rapid = self._attack_types(
            attacker_style, s.weapon_id) == combat.RAPID_RANGED
        weapon_ticks = np.where(rapid, weapon_ticks - 1, weapon_ticks)
        gmaul = (
            speccing
            & ((spec_kind == schema.SPEC_GRANITE_MAUL)
               | (spec_kind == schema.SPEC_GRANITE_MAUL_DOUBLE)))
        s.attack_delay = np.where(swung & ~gmaul, weapon_ticks, s.attack_delay)
        s.last_attack_style = np.where(swung, attacker_style, s.last_attack_style)
        # Granite maul is an off-tick special and does not restart the ordinary
        # weapon cycle. Keep the visible "ticks since observed attack" clock
        # tied to the last non-gmaul swing for safe offensive-gear decisions.
        s.ticks_since_attack = np.where(
            swung & ~gmaul, 0, s.ticks_since_attack)

    def _settle_visible_state(self):
        """Publish what each side is allowed to have seen.

        Opponent state and protection prayer are both held back by one tick,
        matching the web trainer and the Java server's one-tick protection
        visibility. The attacker reads the prayer as of the prior completed
        tick, never the tick it rolls its own hit.
        """
        s = self.state
        s.seen_opp_style = s.flip(s.style).copy()
        s.seen_opp_overhead = s.flip(s.overhead).copy()
        s.seen_opp_weapon_id = s.flip(s.weapon_id).copy()
        s.seen_opp_equipped_ids = s.flip(s.equipped_ids).copy()
        s.seen_opp_spec_energy = s.flip(s.special_energy).copy()
        visible_hp = np.clip(s.hp, 0, 99)
        visible_hp = np.where(
            visible_hp <= 0,
            0,
            np.clip(((visible_hp + 2) // 5) * 5, 1, 99))
        visible_freeze_ticks = np.maximum(s.freeze_ticks, 0)
        visible_freeze_ticks = np.where(
            visible_freeze_ticks > 0,
            np.maximum(1, ((visible_freeze_ticks + 2) // 5) * 5),
            0)
        s.seen_opp_hp = s.flip(visible_hp).copy()
        s.seen_opp_moving = s.flip(s.moving).copy()
        s.seen_opp_frozen = s.flip(s.freeze_ticks > 0).copy()
        s.seen_opp_freeze_ticks = s.flip(visible_freeze_ticks).copy()
        # Preserve age zero internally at the end of the launch tick. The next
        # step advances it to one before observation, matching
        # opponentTicksSinceLastObservedAttack(tick - signalTick). Observation
        # also clamps a direct age-zero probe to one because launch-tick
        # information itself is never model-visible.
        s.opp_ticks_since_observed_attack = s.flip(
            s.ticks_since_attack).copy()

    def _settle_deaths(self):
        """Return only the terminal reward exported in the `.nhrl` row.

        NhPolicyRolloutExporter.rewardForExport writes zero for every
        non-terminal transition. Causal expected-damage, rolling-DPS and prayer
        rewards live in the observation and the `.nhev` event stream instead;
        writing them here as scalar transition rewards double-counts them in
        corrected training.
        """
        s = self.state

        dead = s.hp <= 0
        fight_over = dead.any(axis=1) | (s.tick >= self.max_ticks - 1)
        newly_finished = s.alive & fight_over
        sole_death = dead & ~s.flip(dead)
        sole_kill = s.flip(sole_death)
        unused_healing = (s.food_count > 0) | (s.brew_count > 0)
        kill_reward = (
            REWARD_KILL_BONUS
            + np.where(s.flip(unused_healing),
                       REWARD_KO_UNUSED_HEALING_BONUS, 0.0))
        death_reward = (
            REWARD_DEATH_PENALTY
            + np.where(
                unused_healing & (s.damage_taken >= 60),
                REWARD_DEATH_UNUSED_HEALING_PENALTY,
                0.0))
        reward = np.where(
            sole_kill, kill_reward,
            np.where(sole_death, -death_reward, 0.0))
        reward = np.where(fight_over[:, None], reward, 0.0)
        s.reward_total += reward

        winner = np.where(dead[:, 0] & ~dead[:, 1], 1,
                          np.where(dead[:, 1] & ~dead[:, 0], 0, -1))
        s.winner = np.where(fight_over & (s.winner < 0), winner, s.winner)
        self._side0_wins += int(np.count_nonzero(
            newly_finished & (winner == 0)))
        self._side1_wins += int(np.count_nonzero(
            newly_finished & (winner == 1)))
        self._draws += int(np.count_nonzero(
            newly_finished & (winner < 0)))

        done = np.repeat(fight_over, 2)
        return reward.reshape(-1), done

    # -- driving a whole batch of fights -------------------------------------

    def run(self, on_record=None) -> list:
        """Run every fight to its end. Returns the per-tick records."""
        records = []

        def handle(record):
            if record is None:
                return
            if on_record is not None:
                on_record(record)
            else:
                records.append(record)

        while self.has_work():
            handle(self.step())
        handle(self.flush())
        return records

    def summary(self) -> dict:
        s = self.state
        return {
            "fights": int(self.n_fights * self.episodes_per_lane),
            "ticks": int(self.world_tick),
            "side0_wins": self._side0_wins,
            "side1_wins": self._side1_wins,
            "draws": self._draws,
            "mean_damage_dealt_side0": float(s.damage_dealt[:, 0].mean()),
            "mean_damage_dealt_side1": float(s.damage_dealt[:, 1].mean()),
        }
