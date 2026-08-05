"""The state of many fights at once, held as columns of numbers.

The whole point of this layout: nothing here is a per-fight Python object. Every
field is one array with one row per fighter, so a tick advances all fights with
a handful of whole-array operations instead of a Python loop over fights.

Layout: 2 fighters per fight, stored as [n_fights, 2]. Side 0 and side 1 are
symmetric, so "me" and "my opponent" is just an axis flip - no branching, and no
separate code path for the two sides.

This is also the layout that makes a GPU backend a swap rather than a rewrite:
every array below is a rectangle of fixed shape, so it maps onto a torch tensor
without changing any of the tick logic's structure.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import gear, schema, world_map

MAX_HP = 99
MAX_PRAYER_POINTS = 99
MAX_SPECIAL_ENERGY = 1000

# Starting supplies after NhStakerBot.ensureFreeSlots(1) removes one manta.
# Potion fields are doses internally; the observation converts them back to
# the number of potion items, matching countAny over the 4/3/2/1-dose ids.
START_FOOD = 7
START_BREW = 12  # three saradomin brew (4)
START_RESTORE = 12  # three sanfew serum (4)
START_BREW_ITEMS = 3
START_RESTORE_ITEMS = 3
START_REBOOST = 2  # super combat + bastion
START_VENGEANCE_TRINKETS = 2

# Supply effects. Every number below is read out of Consumable.java and
# Stat.java rather than estimated, because "roughly right" here quietly changes
# how long fights last and how much a brew is worth.
#
# Stat.boost(flat, percent):
#     boost        = flat + (int)(fixedLevel * percent)
#     boostedLevel = min(currentLevel + boost, fixedLevel + boost)
#     applied only if currentLevel <= boostedLevel  (never drags you down)
# Stat.restore(flat, percent):
#     capped at fixedLevel - a restore never overshoots
# Stat.drain(percent) = drain((int)(fixedLevel * percent))
#
# With every fixedLevel at 99 those come out as the flat numbers here.

FOOD_HEAL = 22           # registerEat(391, 22, "manta ray") -> incrementHp
FOOD_EAT_DELAY = 3       # eatDelay.delay(3) and delayAttack(3)

# Anglerfish is the one food that overheals: it uses setHp, not incrementHp.
#     restore = (maxHp / 10) + 13 = 9 + 13 = 22
#     newHp   = min(hp + restore, maxHp + restore) = min(hp + 22, 121)
ANGLER_HEAL = 22
ANGLER_HP_CAP = MAX_HP + ANGLER_HEAL          # 121

# Saradomin brew: Hitpoints boost(2, 0.15), Defence boost(2, 0.20),
# and attack/strength/ranged/magic each drain(0.10).
BREW_HEAL = 16                                 # 2 + int(99 * 0.15)
BREW_HP_CAP = MAX_HP + BREW_HEAL               # 115
BREW_DEFENCE_BOOST = 21                        # 2 + int(99 * 0.20)
BREW_DEFENCE_CAP = 99 + BREW_DEFENCE_BOOST     # 120
BREW_STAT_DRAIN = 9                            # int(99 * 0.10), flat, floors at 0

# Sanfew serum: restore(p, true) tops up EVERY non-hitpoints stat that is below
# its base - prayer and the combat stats alike - by 8 + int(99 * 0.25).
SANFEW_RESTORE = 32
POT_DELAY = 3            # potDelay.delay(3)

KARAMBWAN_DELAY = 2      # not in the DMM inventory; kept for reference

# Prayer drain. PlayerPrayer.process:
#     drainCounter += drainTotal
#     resistance = 60 + prayerBonus * 2
#     if(drainCounter > resistance) { drain(drainCounter / resistance);
#                                     drainCounter %= resistance; }
# Prayer.java drain values: the three overheads are 12 each, and
# Piety / Rigour / Augury are 24 each.
PRAYER_DRAIN_OVERHEAD = 12
PRAYER_DRAIN_OFFENSIVE = 24

# Running. PlayerMovement:
#     isRunning() = energyUnits > 0 && (ctrlRun || Config.RUNNING.get(player) == 1)
# and Config.RUNNING is `varp(173, true).defaultValue(1)` - ON by default. So
# these bots run; they are not walkers. Two route steps a tick instead of one.
#
#     drain    = ((min(weight, 64) / 100) + 0.64) * 100   units, per running tick
#     restore  = 8 + agilityLevel / 6                     units, per other tick
#     start    = 10000 units, and at <= 0 the server sets energyUnits = -100 AND
#               Config.RUNNING to 0 - which nothing ever turns back on, so a
#               fighter who runs dry walks for the rest of the fight.
#
# Weight is the whole 20-piece kit plus the consumables, summed from the
# server's own item_info.json: 16.10 + 4.00 = 20.10kg, under the 64 clamp.
MAX_RUN_ENERGY = 10000.0
CARRIED_WEIGHT = 20.1
RUN_ENERGY_DRAIN = min(CARRIED_WEIGHT, 64.0) + 64.0     # 84.1 units a tick
RUN_ENERGY_RESTORE = 8 + 99 // 6                        # agility 99 -> 24

# How many ticks of hit delay the pending-damage buffer can hold. The longest
# currently modelled projectile is seven logical ticks at distance 13; the
# extra room is deliberate so adding another source-backed family cannot
# silently truncate an in-flight hit.
PENDING_SLOTS = 16
PENDING_HITS_PER_SLOT = 8
DPS_ROLLING_WINDOW_TICKS = 8

# Self-play arena rules copied from NhStakerSelfPlayManager,
# NhSelfPlayPairLeash, and NhFightOriginMovementBoundary.
PAIR_LEASH_DISTANCE = 12
PAIR_PLANNING_RESERVE = 3
LANE_RADIUS = 3
FIGHT_ORIGIN_RADIUS = 13
START_DISTANCE_MIN = 1
START_DISTANCE_MAX = 8


def _signed_long(value: int) -> int:
    """Java long overflow, for StartDistancePlan's exact hash."""
    value &= (1 << 64) - 1
    return value if value < (1 << 63) else value - (1 << 64)


def start_distance_plan(pair: int, world_id: int,
                        minimum_distance: int, maximum_distance: int) -> int:
    """NhStakerSelfPlayManager.StartDistancePlan.distance, exactly."""
    safe_maximum = max(1, maximum_distance)
    safe_minimum = max(1, min(safe_maximum, minimum_distance))
    if safe_minimum == safe_maximum:
        return safe_maximum

    mixed = _signed_long((pair + 1) * 0x9E3779B97F4A7C15)
    mixed = _signed_long(
        mixed ^ _signed_long((world_id + 1) * 0xC2B2AE3D27D4EB4F))
    mixed = _signed_long(mixed ^ ((mixed & ((1 << 64) - 1)) >> 33))
    mixed = _signed_long(mixed * 0xFF51AFD7ED558CCD)
    mixed = _signed_long(mixed ^ ((mixed & ((1 << 64) - 1)) >> 33))
    return safe_minimum + (mixed % (safe_maximum - safe_minimum + 1))


@dataclass
class BatchState:
    """Every fight in the batch, as columns.

    Shapes are [n_fights, 2] unless noted. Index 1 of the last axis is the
    other side of the same fight.
    """

    n_fights: int

    # --- position and movement ---
    x: np.ndarray = field(default=None)
    y: np.ndarray = field(default=None)
    prev_x: np.ndarray = field(default=None)
    prev_y: np.ndarray = field(default=None)
    moving: np.ndarray = field(default=None)
    run_energy: np.ndarray = field(default=None)
    running: np.ndarray = field(default=None)
    origin_x: np.ndarray = field(default=None)
    origin_y: np.ndarray = field(default=None)
    lane_min_x: np.ndarray = field(default=None)
    lane_max_x: np.ndarray = field(default=None)
    lane_min_y: np.ndarray = field(default=None)
    lane_max_y: np.ndarray = field(default=None)

    # --- vitals ---
    hp: np.ndarray = field(default=None)
    prayer_points: np.ndarray = field(default=None)
    special_energy: np.ndarray = field(default=None)
    active_spec_kind: np.ndarray = field(default=None)

    # --- live (drainable) combat stats ---
    attack_level: np.ndarray = field(default=None)
    strength_level: np.ndarray = field(default=None)
    defence_level: np.ndarray = field(default=None)
    ranged_level: np.ndarray = field(default=None)
    magic_level: np.ndarray = field(default=None)

    # --- gear / style ---
    style: np.ndarray = field(default=None)  # schema.STYLE_* currently worn
    pending_style: np.ndarray = field(default=None)  # style being switched into
    weapon_id: np.ndarray = field(default=None)
    has_shield: np.ndarray = field(default=None)
    equipped_ids: np.ndarray = field(default=None)

    # --- attack cycle ---
    attack_delay: np.ndarray = field(default=None)  # ticks until able to attack
    last_attack_style: np.ndarray = field(default=None)
    ticks_since_attack: np.ndarray = field(default=None)
    combat_target: np.ndarray = field(default=None)
    retaliation_due_tick: np.ndarray = field(default=None)

    # --- prayer ---
    overhead: np.ndarray = field(default=None)  # schema.PRAY_* or -1
    previous_overhead: np.ndarray = field(default=None)
    overhead_switch_tick: np.ndarray = field(default=None)

    # --- status effects ---
    freeze_ticks: np.ndarray = field(default=None)
    freeze_immunity: np.ndarray = field(default=None)
    next_freeze_attempt_tick: np.ndarray = field(default=None)
    confliction_magic_accuracy_until_tick: np.ndarray = field(default=None)
    vengeance_active: np.ndarray = field(default=None)
    vengeance_cooldown: np.ndarray = field(default=None)

    # --- supplies ---
    food_count: np.ndarray = field(default=None)
    brew_count: np.ndarray = field(default=None)
    restore_count: np.ndarray = field(default=None)
    reboost_count: np.ndarray = field(default=None)
    veng_trinket_count: np.ndarray = field(default=None)
    inventory_free_slots: np.ndarray = field(default=None)
    eat_delay: np.ndarray = field(default=None)
    pot_delay: np.ndarray = field(default=None)
    bastion_doses: np.ndarray = field(default=None)
    super_combat_doses: np.ndarray = field(default=None)
    veng_trinket_casts: np.ndarray = field(default=None)
    veng_trinket_last_cast_tick: np.ndarray = field(default=None)

    # --- specials used, for the observation ---
    gmaul_specs_used: np.ndarray = field(default=None)
    voidwaker_specs_used: np.ndarray = field(default=None)
    vls_specs_used: np.ndarray = field(default=None)
    vls_attributed: np.ndarray = field(default=None)
    last_spec_kind: np.ndarray = field(default=None)
    prev_spec_kind: np.ndarray = field(default=None)
    ticks_since_spec: np.ndarray = field(default=None)
    optional_vls_setup_tick: np.ndarray = field(default=None)
    pending_spec_tick: np.ndarray = field(default=None)
    pending_spec_optional_vls_setup_tick: np.ndarray = field(default=None)
    pending_spec_kind: np.ndarray = field(default=None)
    pending_spec_double: np.ndarray = field(default=None)
    pending_spec_opponent_hp: np.ndarray = field(default=None)
    pending_spec_launch_observed: np.ndarray = field(default=None)

    # --- last tick's events, fed back into the observation ---
    ate_food: np.ndarray = field(default=None)
    drank_potion: np.ndarray = field(default=None)
    last_dealt_hit: np.ndarray = field(default=None)
    last_taken_hit: np.ndarray = field(default=None)
    last_dealt_source_tick: np.ndarray = field(default=None)
    last_taken_source_tick: np.ndarray = field(default=None)

    # --- in-flight damage (projectiles / delayed hits) ---
    # A small ring buffer: pending_damage[fight, side, delay] is damage that
    # lands on `side` in `delay` ticks. Shifted down by one every tick.
    pending_damage: np.ndarray = field(default=None)
    pending_style_of_hit: np.ndarray = field(default=None)
    pending_source_tick: np.ndarray = field(default=None)
    pending_hit_damage: np.ndarray = field(default=None)
    pending_hit_styles: np.ndarray = field(default=None)
    pending_hit_expected_damage: np.ndarray = field(default=None)
    pending_hit_source_ticks: np.ndarray = field(default=None)
    # `defence_ticks` is the prior prayer decision. Tank/direct gear belongs
    # to the defender's same-tick policy decision and is stored separately.
    pending_hit_defence_ticks: np.ndarray = field(default=None)
    pending_hit_tank_ticks: np.ndarray = field(default=None)
    pending_hit_defensive_gear_masks: np.ndarray = field(default=None)
    pending_hit_offensive_gear_masks: np.ndarray = field(default=None)
    pending_hit_vengeance_reflection: np.ndarray = field(default=None)
    pending_hit_vengeance_source_ticks: np.ndarray = field(default=None)
    pending_hit_vengeance_trigger_ticks: np.ndarray = field(default=None)
    pending_hit_spec_ticks: np.ndarray = field(default=None)
    pending_hit_spec_kinds: np.ndarray = field(default=None)
    pending_hit_count: np.ndarray = field(default=None)

    # Complete provenance for the impacts consumed by the next reward update.
    last_hit_damage: np.ndarray = field(default=None)
    last_hit_source_ticks: np.ndarray = field(default=None)
    last_hit_prayer_ticks: np.ndarray = field(default=None)
    last_hit_tank_ticks: np.ndarray = field(default=None)
    last_hit_defensive_gear_masks: np.ndarray = field(default=None)
    last_hit_offensive_gear_masks: np.ndarray = field(default=None)
    last_hit_vengeance_reflection: np.ndarray = field(default=None)
    last_hit_vengeance_source_ticks: np.ndarray = field(default=None)
    last_hit_vengeance_trigger_ticks: np.ndarray = field(default=None)
    last_hit_count: np.ndarray = field(default=None)

    # --- what the opponent can legitimately see ---
    # Per the project's design rule the bot must PREDICT the opponent's style,
    # so opponent state and protection prayer are both one tick stale, matching
    # the web trainer and the Java server's one-tick protection visibility.
    seen_opp_style: np.ndarray = field(default=None)
    seen_opp_overhead: np.ndarray = field(default=None)
    seen_opp_weapon_id: np.ndarray = field(default=None)
    seen_opp_equipped_ids: np.ndarray = field(default=None)
    seen_opp_spec_energy: np.ndarray = field(default=None)
    seen_opp_hp: np.ndarray = field(default=None)
    seen_opp_moving: np.ndarray = field(default=None)
    seen_opp_frozen: np.ndarray = field(default=None)
    seen_opp_freeze_ticks: np.ndarray = field(default=None)
    opp_ticks_since_observed_attack: np.ndarray = field(default=None)

    # --- detachable defence-prayer-head context ---------------------------
    # Codes are newest first: 0 unknown/none, 1 melee, 2 ranged, 3 magic.
    # Rolled opponent attacks become visible only at the following decision.
    defence_prayer_attack_history_codes: np.ndarray = field(default=None)
    defence_prayer_own_prayer_history_codes: np.ndarray = field(default=None)
    # Head-v3-only circular history of complete prior decision observations.
    # The cursor names the next slot to write; count caps at the ring depth.
    defence_prayer_prior_state_history: np.ndarray = field(default=None)
    defence_prayer_prior_state_history_cursor: np.ndarray = field(default=None)
    defence_prayer_prior_state_history_count: np.ndarray = field(default=None)

    # --- style-read bookkeeping, feeds the visible-style inputs ---
    style_match_count: np.ndarray = field(default=None)
    style_sample_count: np.ndarray = field(default=None)
    last_style_outcome: np.ndarray = field(default=None)
    style_outcome_window: np.ndarray = field(default=None)

    # --- reward accounting ---
    damage_dealt: np.ndarray = field(default=None)
    damage_taken: np.ndarray = field(default=None)
    reward_total: np.ndarray = field(default=None)
    reward_delta: np.ndarray = field(default=None)
    reward_dps: np.ndarray = field(default=None)
    pending_expected_reward: np.ndarray = field(default=None)
    pending_roll_prayer_reward: np.ndarray = field(default=None)
    pending_roll_tank_gear_reward: np.ndarray = field(default=None)
    pending_freeze_reward: np.ndarray = field(default=None)
    pending_supply_reward: np.ndarray = field(default=None)
    pending_spec_outcome_reward: np.ndarray = field(default=None)
    post_brew_recovery_until_tick: np.ndarray = field(default=None)
    recent_supply_actions: np.ndarray = field(default=None)
    recent_low_value_supplies: np.ndarray = field(default=None)
    last_supply_tick: np.ndarray = field(default=None)
    recent_damage_window: np.ndarray = field(default=None)
    recent_taken_window: np.ndarray = field(default=None)
    recent_damage_source_tick: np.ndarray = field(default=None)
    recent_taken_source_tick: np.ndarray = field(default=None)
    recent_hit_damage: np.ndarray = field(default=None)
    recent_hit_source_ticks: np.ndarray = field(default=None)
    recent_hit_prayer_ticks: np.ndarray = field(default=None)
    recent_hit_tank_ticks: np.ndarray = field(default=None)
    recent_hit_defensive_gear_masks: np.ndarray = field(default=None)
    recent_hit_offensive_gear_masks: np.ndarray = field(default=None)
    recent_hit_vengeance_reflection: np.ndarray = field(default=None)
    recent_hit_vengeance_source_ticks: np.ndarray = field(default=None)
    recent_hit_vengeance_trigger_ticks: np.ndarray = field(default=None)
    recent_hit_count: np.ndarray = field(default=None)
    recent_damage_cursor: np.ndarray = field(default=None)

    # --- episode bookkeeping ---
    tick: np.ndarray = field(default=None)
    episode_id: np.ndarray = field(default=None)
    bot_index: np.ndarray = field(default=None)
    lock_ticks: np.ndarray = field(default=None)
    alive: np.ndarray = field(default=None)
    winner: np.ndarray = field(default=None)

    @staticmethod
    def new(n_fights: int, rng: np.random.Generator,
            start_distance_min: int = START_DISTANCE_MIN,
            start_distance_max: int = START_DISTANCE_MAX,
            world_id: int = 1,
            lane_radius: int = LANE_RADIUS,
            defence_prayer_prior_state_history: bool = False) -> "BatchState":
        pair = (n_fights, 2)
        i32 = lambda v: np.full(pair, v, dtype=np.int32)
        f64 = lambda v: np.full(pair, v, dtype=np.float64)
        b = lambda v: np.full(pair, v, dtype=bool)

        s = BatchState(n_fights=n_fights)

        # Java allocates each pair a clear horizontal lane. Its StartDistancePlan
        # deterministically spreads pair openings across the configured range
        # using pair index and world id; matching that matters because distance
        # is the model's first input.
        s.x = np.zeros(pair, dtype=np.int32)
        s.y = np.zeros(pair, dtype=np.int32)
        map_lanes = (
            world_map.SELF_PLAY_MAP.initial_lanes(
                world_id, start_distance_min, start_distance_max, n_fights)
            if int(lane_radius) == LANE_RADIUS else None)
        if map_lanes is not None:
            s.x[:, 0] = map_lanes.x
            s.x[:, 1] = map_lanes.x + map_lanes.distance
            s.y[:] = map_lanes.y[:, None]
            distances = map_lanes.distance
        else:
            distances = np.fromiter(
                (start_distance_plan(index, world_id,
                                     start_distance_min, start_distance_max)
                 for index in range(n_fights)),
                dtype=np.int32,
                count=n_fights)
            s.x[:, 1] = distances
        s.prev_x = s.x.copy()
        s.prev_y = s.y.copy()
        s.moving = b(False)
        s.run_energy = np.full(pair, MAX_RUN_ENERGY, dtype=np.float64)
        s.running = b(True)   # Config.RUNNING defaults to 1
        s.origin_x = s.x.copy()
        s.origin_y = s.y.copy()
        radius = max(0, int(lane_radius))
        s.lane_min_x = np.minimum(s.origin_x[:, 0], s.origin_x[:, 1]) - radius
        s.lane_max_x = np.maximum(s.origin_x[:, 0], s.origin_x[:, 1]) + radius
        s.lane_min_y = np.minimum(s.origin_y[:, 0], s.origin_y[:, 1]) - radius
        s.lane_max_y = np.maximum(s.origin_y[:, 0], s.origin_y[:, 1]) + radius

        s.hp = i32(MAX_HP)
        s.prayer_points = i32(MAX_PRAYER_POINTS)
        s.special_energy = i32(MAX_SPECIAL_ENERGY)
        s.active_spec_kind = i32(-1)

        s.attack_level = i32(99)
        s.strength_level = i32(99)
        s.defence_level = i32(99)
        s.ranged_level = i32(99)
        s.magic_level = i32(99)

        # NhStakerBot clears currentOffence on reset even though the mage set
        # is visibly worn. The first policy observation therefore has a MAGIC
        # selfLikelyStyle but an all-zero currentOffenceStyle block.
        s.style = i32(schema.STYLE_NONE)
        s.pending_style = i32(schema.STYLE_NONE)
        weapon_table = gear.build_set_weapon_table()
        s.weapon_id = np.full(pair, weapon_table["weapon_id"][schema.STYLE_MAGIC],
                              dtype=np.int32)
        s.has_shield = b(True)
        s.equipped_ids = np.broadcast_to(
            gear.initial_equipment_ids(), pair + (gear.SLOT_COUNT,)
        ).copy()

        s.attack_delay = i32(0)
        s.last_attack_style = i32(-1)
        s.ticks_since_attack = i32(99)
        s.combat_target = b(False)
        s.retaliation_due_tick = np.full(pair, -1, dtype=np.int64)

        s.overhead = i32(-1)
        s.previous_overhead = i32(-1)
        s.overhead_switch_tick = np.full(pair, -1, dtype=np.int64)

        s.freeze_ticks = i32(0)
        s.freeze_immunity = i32(0)
        s.next_freeze_attempt_tick = np.zeros(pair, dtype=np.int64)
        s.confliction_magic_accuracy_until_tick = np.full(
            pair, -1, dtype=np.int64)
        s.vengeance_active = b(False)
        s.vengeance_cooldown = i32(0)

        s.food_count = i32(START_FOOD)
        s.brew_count = i32(START_BREW)
        s.restore_count = i32(START_RESTORE)
        s.reboost_count = i32(START_REBOOST)
        s.veng_trinket_count = i32(START_VENGEANCE_TRINKETS)
        s.inventory_free_slots = i32(1)
        s.eat_delay = i32(0)
        s.pot_delay = i32(0)
        s.bastion_doses = i32(4)
        s.super_combat_doses = i32(4)
        s.veng_trinket_casts = i32(0)
        s.veng_trinket_last_cast_tick = np.full(pair, -1, dtype=np.int64)

        s.gmaul_specs_used = i32(0)
        s.voidwaker_specs_used = i32(0)
        s.vls_specs_used = i32(0)
        s.vls_attributed = b(False)
        s.last_spec_kind = i32(-1)
        s.prev_spec_kind = i32(-1)
        s.ticks_since_spec = i32(999)
        s.optional_vls_setup_tick = np.full(pair, -1, dtype=np.int64)
        s.pending_spec_tick = np.full(pair, -1, dtype=np.int64)
        s.pending_spec_optional_vls_setup_tick = np.full(
            pair, -1, dtype=np.int64)
        s.pending_spec_kind = i32(-1)
        s.pending_spec_double = b(False)
        s.pending_spec_opponent_hp = i32(0)
        s.pending_spec_launch_observed = b(False)

        s.ate_food = b(False)
        s.drank_potion = b(False)
        s.last_dealt_hit = i32(0)
        s.last_taken_hit = i32(0)
        s.last_dealt_source_tick = np.full(pair, -1, dtype=np.int64)
        s.last_taken_source_tick = np.full(pair, -1, dtype=np.int64)

        s.pending_damage = np.zeros((n_fights, 2, PENDING_SLOTS), dtype=np.int32)
        s.pending_style_of_hit = np.full((n_fights, 2, PENDING_SLOTS), -1, dtype=np.int8)
        # Per-engine tick provenance is bounded by the configured episode
        # count and tick cap. Keep the hot hit queues compact; NHRL/NHEV
        # writers widen these values to the format's signed 64-bit fields.
        s.pending_source_tick = np.full(
            (n_fights, 2, PENDING_SLOTS), -1, dtype=np.int32)
        s.pending_hit_damage = np.zeros(
            (n_fights, 2, PENDING_SLOTS, PENDING_HITS_PER_SLOT),
            dtype=np.int32)
        s.pending_hit_styles = np.full(
            (n_fights, 2, PENDING_SLOTS, PENDING_HITS_PER_SLOT),
            -1,
            dtype=np.int8)
        s.pending_hit_expected_damage = np.zeros(
            (n_fights, 2, PENDING_SLOTS, PENDING_HITS_PER_SLOT),
            dtype=np.float64)
        s.pending_hit_source_ticks = np.full(
            (n_fights, 2, PENDING_SLOTS, PENDING_HITS_PER_SLOT),
            -1,
            dtype=np.int32)
        s.pending_hit_defence_ticks = np.full(
            (n_fights, 2, PENDING_SLOTS, PENDING_HITS_PER_SLOT),
            -1,
            dtype=np.int32)
        s.pending_hit_tank_ticks = np.full(
            (n_fights, 2, PENDING_SLOTS, PENDING_HITS_PER_SLOT),
            -1,
            dtype=np.int32)
        s.pending_hit_defensive_gear_masks = np.zeros(
            (n_fights, 2, PENDING_SLOTS, PENDING_HITS_PER_SLOT),
            dtype=np.int32)
        s.pending_hit_offensive_gear_masks = np.zeros(
            (n_fights, 2, PENDING_SLOTS, PENDING_HITS_PER_SLOT),
            dtype=np.int32)
        s.pending_hit_vengeance_reflection = np.zeros(
            (n_fights, 2, PENDING_SLOTS, PENDING_HITS_PER_SLOT),
            dtype=bool)
        s.pending_hit_vengeance_source_ticks = np.full(
            (n_fights, 2, PENDING_SLOTS, PENDING_HITS_PER_SLOT),
            -1,
            dtype=np.int32)
        s.pending_hit_vengeance_trigger_ticks = np.full(
            (n_fights, 2, PENDING_SLOTS, PENDING_HITS_PER_SLOT),
            -1,
            dtype=np.int32)
        s.pending_hit_spec_ticks = np.full(
            (n_fights, 2, PENDING_SLOTS, PENDING_HITS_PER_SLOT),
            -1,
            dtype=np.int32)
        s.pending_hit_spec_kinds = np.full(
            (n_fights, 2, PENDING_SLOTS, PENDING_HITS_PER_SLOT),
            -1,
            dtype=np.int8)
        s.pending_hit_count = np.zeros(
            (n_fights, 2, PENDING_SLOTS), dtype=np.int8)

        last_hit_shape = (n_fights, 2, PENDING_HITS_PER_SLOT)
        s.last_hit_damage = np.zeros(last_hit_shape, dtype=np.int32)
        s.last_hit_source_ticks = np.full(
            last_hit_shape, -1, dtype=np.int32)
        s.last_hit_prayer_ticks = np.full(
            last_hit_shape, -1, dtype=np.int32)
        s.last_hit_tank_ticks = np.full(
            last_hit_shape, -1, dtype=np.int32)
        s.last_hit_defensive_gear_masks = np.zeros(
            last_hit_shape, dtype=np.int32)
        s.last_hit_offensive_gear_masks = np.zeros(
            last_hit_shape, dtype=np.int32)
        s.last_hit_vengeance_reflection = np.zeros(
            last_hit_shape, dtype=bool)
        s.last_hit_vengeance_source_ticks = np.full(
            last_hit_shape, -1, dtype=np.int32)
        s.last_hit_vengeance_trigger_ticks = np.full(
            last_hit_shape, -1, dtype=np.int32)
        s.last_hit_count = np.zeros(pair, dtype=np.int8)

        s.seen_opp_style = i32(schema.STYLE_MAGIC)
        s.seen_opp_overhead = i32(-1)
        s.seen_opp_weapon_id = s.weapon_id.copy()
        s.seen_opp_equipped_ids = s.equipped_ids.copy()
        s.seen_opp_spec_energy = i32(MAX_SPECIAL_ENERGY)
        s.seen_opp_hp = i32(MAX_HP)
        s.seen_opp_moving = b(False)
        s.seen_opp_frozen = b(False)
        s.seen_opp_freeze_ticks = i32(0)
        s.opp_ticks_since_observed_attack = i32(99)

        s.defence_prayer_attack_history_codes = np.zeros(
            (n_fights, 2, schema.DEFENCE_PRAYER_ATTACK_HISTORY_COUNT),
            dtype=np.uint8)
        s.defence_prayer_own_prayer_history_codes = np.zeros(
            (n_fights, 2, schema.DEFENCE_PRAYER_OWN_PRAYER_HISTORY_COUNT),
            dtype=np.uint8)
        if defence_prayer_prior_state_history:
            s.defence_prayer_prior_state_history = np.zeros(
                (
                    n_fights,
                    2,
                    schema.DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS,
                    schema.INPUT_SIZE,
                ),
                dtype=np.float32)
            s.defence_prayer_prior_state_history_cursor = np.zeros(
                pair, dtype=np.uint8)
            s.defence_prayer_prior_state_history_count = np.zeros(
                pair, dtype=np.uint8)

        s.style_match_count = f64(0.0)
        s.style_sample_count = f64(0.0)
        s.last_style_outcome = f64(0.0)
        s.style_outcome_window = np.zeros(
            (n_fights, 2, 16), dtype=np.int8)

        s.damage_dealt = i32(0)
        s.damage_taken = i32(0)
        s.reward_total = f64(0.0)
        s.reward_delta = f64(0.0)
        s.reward_dps = f64(0.0)
        s.pending_expected_reward = f64(0.0)
        s.pending_roll_prayer_reward = f64(0.0)
        s.pending_roll_tank_gear_reward = f64(0.0)
        s.pending_freeze_reward = f64(0.0)
        s.pending_supply_reward = f64(0.0)
        s.pending_spec_outcome_reward = f64(0.0)
        s.post_brew_recovery_until_tick = np.full(
            pair, -1, dtype=np.int64)
        s.recent_supply_actions = i32(0)
        s.recent_low_value_supplies = i32(0)
        s.last_supply_tick = np.full(pair, -10000, dtype=np.int64)
        s.recent_damage_window = np.zeros(
            (n_fights, 2, DPS_ROLLING_WINDOW_TICKS), dtype=np.int32)
        s.recent_taken_window = np.zeros(
            (n_fights, 2, DPS_ROLLING_WINDOW_TICKS), dtype=np.int32)
        s.recent_damage_source_tick = np.full(
            (n_fights, 2, DPS_ROLLING_WINDOW_TICKS), -1, dtype=np.int64)
        s.recent_taken_source_tick = np.full(
            (n_fights, 2, DPS_ROLLING_WINDOW_TICKS), -1, dtype=np.int64)
        recent_hit_shape = (
            n_fights, 2, DPS_ROLLING_WINDOW_TICKS,
            PENDING_HITS_PER_SLOT)
        s.recent_hit_damage = np.zeros(
            recent_hit_shape, dtype=np.int32)
        s.recent_hit_source_ticks = np.full(
            recent_hit_shape, -1, dtype=np.int32)
        s.recent_hit_prayer_ticks = np.full(
            recent_hit_shape, -1, dtype=np.int32)
        s.recent_hit_tank_ticks = np.full(
            recent_hit_shape, -1, dtype=np.int32)
        s.recent_hit_defensive_gear_masks = np.zeros(
            recent_hit_shape, dtype=np.int32)
        s.recent_hit_offensive_gear_masks = np.zeros(
            recent_hit_shape, dtype=np.int32)
        s.recent_hit_vengeance_reflection = np.zeros(
            recent_hit_shape, dtype=bool)
        s.recent_hit_vengeance_source_ticks = np.full(
            recent_hit_shape, -1, dtype=np.int32)
        s.recent_hit_vengeance_trigger_ticks = np.full(
            recent_hit_shape, -1, dtype=np.int32)
        s.recent_hit_count = np.zeros(
            (n_fights, 2, DPS_ROLLING_WINDOW_TICKS),
            dtype=np.int8)
        s.recent_damage_cursor = i32(0)

        s.tick = np.zeros(n_fights, dtype=np.int64)
        # Java's reward episode id is local to each bot and starts at one.
        # The entity index is stable across resets, whereas episode ids advance.
        s.episode_id = i32(1)
        s.bot_index = np.arange(n_fights * 2, dtype=np.int32).reshape(pair) + 1
        s.lock_ticks = i32(0)
        s.alive = np.ones(n_fights, dtype=bool)
        s.winner = np.full(n_fights, -1, dtype=np.int8)

        return s

    # -- convenience views ---------------------------------------------------

    def flip(self, arr: np.ndarray) -> np.ndarray:
        """The same field, seen from the other fighter's point of view."""
        return arr[:, ::-1]

    def distance(self) -> np.ndarray:
        """Policy-visible Position.distance: floor of Euclidean distance."""
        dx = self.x[:, 0] - self.x[:, 1]
        dy = self.y[:, 0] - self.y[:, 1]
        return np.sqrt(dx * dx + dy * dy).astype(np.int32)

    def tile_distance(self) -> np.ndarray:
        """Misc.getDistance: Chebyshev distance used by projectiles."""
        dx = np.abs(self.x[:, 0] - self.x[:, 1])
        dy = np.abs(self.y[:, 0] - self.y[:, 1])
        return np.maximum(dx, dy)

    def rel_dx(self) -> np.ndarray:
        """opponent_x - self_x, per side."""
        return self.flip(self.x) - self.x

    def rel_dy(self) -> np.ndarray:
        return self.flip(self.y) - self.y
