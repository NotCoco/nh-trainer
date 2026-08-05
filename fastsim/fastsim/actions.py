"""Which of the 86 actions are allowed, and what each one means.

The 86 actions are not 86 alternatives. They are five independent channels, and
the bot picks exactly one action from each channel every tick:

    combat   ids  0..17   attack with a style, or fire a special, or neither
    defence  ids 18..22   which overhead prayer to have on
    movement ids 23..48   stay, stand under, or step to one of 24 offsets
    supply   ids 49..56   eat / brew / restore / cast the vengeance trinket
    gear     ids 57..85   direct per-slot equipment swaps

That grouping is not a guess: it was read out of the
causal_unit_sampling_support_masks recorded in the real rollout files, which
state for every channel exactly which action ids belong to it.

The legal mask marks which of the 86 are available this tick. The trainer reads
it back out of the rollout, so it has to be right - an action marked legal that
the engine then refuses would teach the policy a move that does not exist.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import gear, schema, world_map
from .state import (FIGHT_ORIGIN_RADIUS, PAIR_LEASH_DISTANCE,
                    PAIR_PLANNING_RESERVE)


@dataclass
class LegalActions:
    """Per-fighter answers, flat over [n_fights * 2]."""

    mask: np.ndarray  # [n, 86] bool
    attack_ready: np.ndarray
    can_attack: np.ndarray
    can_spec_single: np.ndarray
    can_spec_double: np.ndarray
    melee_reach_now: np.ndarray
    opp_melee_reach_now: np.ndarray


def _flat(arr: np.ndarray) -> np.ndarray:
    return arr.reshape((-1,) + arr.shape[2:])


def _floored_euclidean_distance(dx, dy):
    """Position.distance/NhSelfPlayPairLeash.distance truncate sqrt to int."""
    return np.sqrt(
        np.asarray(dx, dtype=np.int64) ** 2
        + np.asarray(dy, dtype=np.int64) ** 2).astype(np.int32)


_DIRECT_MOVEMENT_OFFSETS = schema.MOVEMENT_OFFSETS[
    schema.MOVE_OFFSET_BASE:].astype(np.int32)
_DIRECT_MOVEMENT_BITS = np.left_shift(
    np.uint32(1), np.arange(len(_DIRECT_MOVEMENT_OFFSETS), dtype=np.uint32))
_DIRECT_MOVEMENT_INDEX = {
    (int(dx), int(dy)): index
    for index, (dx, dy) in enumerate(_DIRECT_MOVEMENT_OFFSETS)
}


def _direct_tile_moves_allowed(batch, offsets, static_allowed):
    """Apply the dynamic Java movement gates to one or more route offsets."""
    offsets = np.asarray(offsets, dtype=np.int32).reshape(-1, 2)
    dx = offsets[:, 0]
    dy = offsets[:, 1]
    start_x = batch.x[..., None]
    start_y = batch.y[..., None]
    target_x = start_x + dx
    target_y = start_y + dy

    allowed = np.array(static_allowed, dtype=bool, copy=True)
    allowed &= (dx != 0) | (dy != 0)
    # NhStakerSelfPlayManager.isDirectTileMovementAllowed:1141 rejects a
    # command while the reset teleport still makes Entity.isLocked() true.
    allowed &= batch.lock_ticks[..., None] <= 0
    allowed &= np.maximum(
        np.abs(target_x - batch.origin_x[..., None]),
        np.abs(target_y - batch.origin_y[..., None])) <= FIGHT_ORIGIN_RADIUS

    lane_min_x = batch.lane_min_x[:, None, None]
    lane_max_x = batch.lane_max_x[:, None, None]
    lane_min_y = batch.lane_min_y[:, None, None]
    lane_max_y = batch.lane_max_y[:, None, None]
    allowed &= ((target_x >= lane_min_x) & (target_x <= lane_max_x)
                & (target_y >= lane_min_y) & (target_y <= lane_max_y))

    partner_x = batch.flip(batch.x)[..., None]
    partner_y = batch.flip(batch.y)[..., None]
    current_distance = _floored_euclidean_distance(
        partner_x[..., 0] - batch.x, partner_y[..., 0] - batch.y)[..., None]
    target_distance = _floored_euclidean_distance(
        partner_x - target_x, partner_y - target_y)
    planning_limit = max(0, PAIR_LEASH_DISTANCE - PAIR_PLANNING_RESERVE)
    inside_reserve = target_distance <= planning_limit
    strict_recovery = (
        (current_distance > planning_limit)
        & (current_distance <= PAIR_LEASH_DISTANCE)
        & (target_distance < current_distance)
        & (target_distance <= PAIR_LEASH_DISTANCE))
    allowed &= inside_reserve | strict_recovery

    # isDirectTileMovementAllowed validates each diagonal/straight substep and
    # rejects the whole command if either substep enters the partner's tile.
    step_x = np.broadcast_to(start_x, target_x.shape).copy()
    step_y = np.broadcast_to(start_y, target_y.shape).copy()
    for _ in range(2):
        active = (step_x != target_x) | (step_y != target_y)
        next_x = step_x + np.sign(target_x - step_x).astype(np.int32)
        next_y = step_y + np.sign(target_y - step_y).astype(np.int32)
        allowed &= (~active
                    | ((next_x >= lane_min_x) & (next_x <= lane_max_x)
                       & (next_y >= lane_min_y) & (next_y <= lane_max_y)
                       & ~((next_x == partner_x) & (next_y == partner_y))))
        step_x = np.where(active, next_x, step_x)
        step_y = np.where(active, next_y, step_y)
    return allowed


def direct_tile_move_allowed(batch, dx, dy):
    """Vector form of Java's direct-movement legality for one destination.

    Static clipping, wilderness, and both route substeps come from the
    per-absolute-tile cache. Only fight-specific restrictions are calculated
    here.
    """
    key = (int(dx), int(dy))
    try:
        movement_index = _DIRECT_MOVEMENT_INDEX[key]
    except KeyError as error:
        raise ValueError(f"unsupported direct movement offset {key}") from error
    route_mask = world_map.SELF_PLAY_MAP.static_route_mask(batch.x, batch.y)
    static_allowed = (
        (route_mask & _DIRECT_MOVEMENT_BITS[movement_index]) != 0)[..., None]
    return _direct_tile_moves_allowed(
        batch, _DIRECT_MOVEMENT_OFFSETS[movement_index:movement_index + 1],
        static_allowed)[..., 0]


def direct_tile_moves_allowed(batch):
    """Return all 24 direct-movement answers in one vectorized pass."""
    static_allowed = world_map.SELF_PLAY_MAP.static_routes_allowed(
        batch.x, batch.y)
    return _direct_tile_moves_allowed(
        batch, _DIRECT_MOVEMENT_OFFSETS, static_allowed)


def _melee_reach(dx, dy, frozen, attack_range=1):
    """NhStakerSelfPlayManager.canMeleeStepInReachNextTick, batched.

    True when a melee hit can land from the standing weapon range or after
    TargetRoute consumes up to two unfrozen movement substeps.
    """
    return _melee_reach_now(dx, dy, frozen, attack_range)


def _melee_reach_now(dx, dy, frozen, attack_range=1):
    """NhMeleeReach.canReachThisTick, batched."""
    dx = np.abs(dx)
    dy = np.abs(dy)
    frozen = np.asarray(frozen, dtype=bool)
    attack_range = np.maximum(1, np.asarray(attack_range, dtype=np.int32))
    same_tile = (dx == 0) & (dy == 0)
    standing = ~same_tile & (dx <= attack_range) & (dy <= attack_range)
    drag_limit = attack_range + 2
    drag_in = (~frozen) & (dx <= drag_limit) & (dy <= drag_limit)
    return (same_tile & ~frozen) | standing | drag_in


def compute(state, gear_tables) -> LegalActions:
    n = state.n_fights * 2
    mask = np.zeros((n, schema.ACTION_COUNT), dtype=bool)

    # NhStakerBot.java:11632 and 11691 build canAttack from the live weapon's
    # likely style, not from currentOffence. An empty weapon slot falls back to
    # ranged while DMM bolts remain equipped (lines 12518-12526).
    style = gear.style_for_weapon(_flat(state.weapon_id))
    ammo = _flat(state.equipped_ids[:, :, gear.SLOT_AMMO])
    style = np.where(
        (style < 0) & (ammo > 0), schema.STYLE_RANGED, style)
    attack_delay = _flat(state.attack_delay)
    frozen = _flat(state.freeze_ticks) > 0
    locked = _flat(state.lock_ticks) > 0
    spec_energy = _flat(state.special_energy)
    hp = _flat(state.hp)

    dx = _flat(state.rel_dx())
    dy = _flat(state.rel_dy())
    dist = np.maximum(np.abs(dx), np.abs(dy))

    attack_ready = attack_delay <= 0

    current_melee_range = gear.melee_standing_range(
        _flat(state.weapon_id))
    current_melee_reach = _melee_reach_now(
        dx, dy, frozen, current_melee_range)
    ordinary_melee_reach = _melee_reach_now(
        dx, dy, frozen, gear.NOXIOUS_HALBERD.max_distance)
    spec_melee_reach = _melee_reach_now(dx, dy, frozen, 1)
    # Java derives opponent melee reach from the deliberately one-tick-old
    # OpponentInfoSnapshot, including its weapon and frozen flag.
    opp_frozen = _flat(state.seen_opp_frozen)
    opp_melee_range = gear.melee_standing_range(
        _flat(state.seen_opp_weapon_id))
    opp_melee_attack_reach = _melee_reach_now(
        -dx, -dy, opp_frozen, opp_melee_range)
    long_range_reach = (dist >= 1) & (dist <= 10)
    current_reach = np.where(style == schema.STYLE_MELEE,
                             current_melee_reach, long_range_reach)
    # NhStakerBot.canAttackFromObserved reports reach/target validity only.
    # Attack-timer readiness is encoded separately as selfAttackReady.
    # NhStakerBot.canAttackFromObserved returns false while the player is
    # locked. The current-action combat rows remain globally legal in Java,
    # but this model-facing observation and execution gate do not.
    can_attack = current_reach & ~locked

    # --- combat channel -----------------------------------------------------
    # "do not attack" is always available.
    mask[:, schema.COMBAT_BASE + schema.COMBAT_NO_ATTACK] = True
    for style_index in range(3):
        attack_reach = (ordinary_melee_reach if style_index == schema.STYLE_MELEE
                        else long_range_reach)
        off_tick_reach = (ordinary_melee_reach if style_index == schema.STYLE_MELEE
                          else long_range_reach)
        for intent, reachable in (
                (schema.ATTACK_INTENT_ATTACK, attack_reach),
                (schema.ATTACK_INTENT_OFF_TICK, off_tick_reach)):
            slot = (schema.COMBAT_BASE + schema.COMBAT_ATTACK_BASE
                    + style_index * 2 + intent)
            mask[:, slot] = attack_ready & reachable

    mask[:, schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE] = True
    can_spec_single = np.zeros(n, dtype=bool)
    can_spec_double = np.zeros(n, dtype=bool)
    tick_start_spec_control = gear.weapon_shows_special_bar(
        _flat(state.weapon_id))
    vls_available = (
        (_flat(state.weapon_id) == gear.VESTAS_LONGSWORD.item_id)
        | ~_flat(state.vls_attributed))
    for kind in range(5):
        cost = schema.SPEC_ENERGY_COST[kind]
        affordable = spec_energy >= cost
        # Every modelled special is a melee special, so it needs melee reach.
        available = kind != schema.SPEC_ARMADYL_GODSWORD
        if kind == schema.SPEC_VESTA_LONGSWORD:
            # VLS is the one special that cannot be one-ticked from a weapon
            # without visible special controls at tick start. Once its PvP
            # armour charge attribute has been created, Java's inventory
            # contains() check no longer sees it while it is unequipped.
            available = tick_start_spec_control & vls_available
        for intent, reachable in (
                (schema.ATTACK_INTENT_ATTACK, spec_melee_reach),
                (schema.ATTACK_INTENT_OFF_TICK, spec_melee_reach)):
            slot = schema.COMBAT_BASE + schema.COMBAT_SPEC_BASE + kind * 2 + intent
            allowed = affordable & attack_ready & reachable & available
            mask[:, slot] = allowed
        if kind == schema.SPEC_GRANITE_MAUL:
            can_spec_single = affordable & spec_melee_reach
        if kind == schema.SPEC_GRANITE_MAUL_DOUBLE:
            can_spec_double = affordable & spec_melee_reach

    # --- defence channel ----------------------------------------------------
    # isActionAllowed leaves the three protections available, but gates Smite
    # and Redemption on the exact encoded combat context.
    for prayer in (
        schema.PRAY_PROTECT_MAGIC,
        schema.PRAY_PROTECT_MISSILES,
        schema.PRAY_PROTECT_MELEE,
    ):
        mask[:, schema.DEFENCE_BASE + prayer] = True
    prayer = _flat(state.prayer_points)
    mask[:, schema.DEFENCE_BASE + schema.PRAY_SMITE] = (
        can_attack & attack_ready & (hp >= 0.55 * 99.0) & (prayer >= 14.0))
    mask[:, schema.DEFENCE_BASE + schema.PRAY_REDEMPTION] = (
        (prayer >= 12.0) & (hp >= 0.10 * 99.0) & (hp <= 0.35 * 99.0))

    # --- movement channel ---------------------------------------------------
    # Java checks the complete direct destination before putting a movement
    # action in the support mask. Stand-under is a separate action and is only
    # offered against a frozen opponent.
    mask[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = True
    origin_allows_partner = np.maximum(
        np.abs(_flat(state.flip(state.x)) - _flat(state.origin_x)),
        np.abs(_flat(state.flip(state.y)) - _flat(state.origin_y))
    ) <= FIGHT_ORIGIN_RADIUS
    mask[:, schema.MOVEMENT_BASE + schema.MOVE_STAND_UNDER] = (
        ~locked & ~frozen & opp_frozen & (dist > 0)
        & origin_allows_partner)
    direct_moves = (
        ~state.freeze_ticks.astype(bool)[..., None]
        & direct_tile_moves_allowed(state))
    mask[:,
         schema.MOVEMENT_BASE + schema.MOVE_OFFSET_BASE:
         schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT] = _flat(direct_moves)

    # --- supply channel -----------------------------------------------------
    food = _flat(state.food_count)
    brew = _flat(state.brew_count)
    restore = _flat(state.restore_count)
    trinket = _flat(state.veng_trinket_count)
    hp_ratio = hp / 99.0
    hit_risk = np.clip(np.maximum(0.0, _flat(state.last_taken_hit) / 40.0)
                       * 1.45, 0.0, 1.0)
    panic_risk = np.clip(
        ((44.0 / 99.0) - hp_ratio) / (19.0 / 99.0)
        + hit_risk * 0.25,
        0.0,
        1.0)
    safe_eat = (hp_ratio < 68.0 / 99.0) | (hit_risk > 0.55)
    double_eat = (
        (hp_ratio < 58.0 / 99.0)
        | (hit_risk > 0.68)
        | (panic_risk > 0.42))
    triple_eat = (hp_ratio < 48.0 / 99.0) | (panic_risk > 0.42)
    brew_only = (
        (hp_ratio < 50.0 / 99.0)
        | (hit_risk > 0.64)
        | ((can_attack | attack_ready)
           & (hp_ratio < 72.0 / 99.0)
           & (hit_risk > 0.18)))
    panic_full = (hp_ratio < 42.0 / 99.0) | (panic_risk > 0.55)

    levels = np.stack([
        _flat(state.attack_level),
        _flat(state.strength_level),
        _flat(state.defence_level),
        _flat(state.ranged_level),
        _flat(state.magic_level),
    ], axis=1).astype(np.float64)
    deficits = (levels - 99.0) / 40.0
    needs_restore = (
        (prayer < 55.0)
        | np.any(deficits < -0.025, axis=1))
    needs_reboost = np.any(deficits[:, :4] < (3.0 / 40.0), axis=1)
    reboost = _flat(state.reboost_count)

    mask[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = True
    mask[:, schema.SUPPLY_BASE + schema.SUPPLY_SAFE_EAT] = (
        (food >= 1) & safe_eat)
    # DMM has no karambwan, but Java still permits DOUBLE_EAT with one main
    # food; execution then consumes whichever components actually exist.
    mask[:, schema.SUPPLY_BASE + schema.SUPPLY_DOUBLE_EAT] = (
        (food >= 1) & double_eat)
    mask[:, schema.SUPPLY_BASE + schema.SUPPLY_TRIPLE_EAT] = (
        ((brew >= 1) | (food >= 2)) & triple_eat)
    mask[:, schema.SUPPLY_BASE + schema.SUPPLY_BREW_ONLY] = (
        (brew >= 1) & brew_only)
    mask[:, schema.SUPPLY_BASE + schema.SUPPLY_RESTORE_REBOOST] = (
        ((restore >= 1) & needs_restore)
        | ((reboost >= 1) & needs_reboost))
    mask[:, schema.SUPPLY_BASE + schema.SUPPLY_PANIC_FULL] = (
        ((food >= 1) | (brew >= 1) | (restore >= 1) | (reboost >= 1))
        & panic_full)
    mask[:, schema.SUPPLY_BASE + schema.SUPPLY_VENGEANCE_TRINKET] = (
        (trinket >= 1)
        & (_flat(state.veng_trinket_casts) < 2)
        & ~_flat(state.vengeance_active)
        & (_flat(state.vengeance_cooldown) <= 0)
        & ~locked)

    # isActionAllowed returns DMM_PROFILE immediately for every current direct
    # gear action. All 29 model rows therefore appear in Java's global mask;
    # slot-aware grouping happens later in the factored sampler.
    mask[:, schema.GEAR_BASE:] = True

    # Every core channel must always offer at least one action. A channel with
    # none makes the rollout unreadable ("sampling support is missing its greedy
    # action") and, worse, would mean the engine had no defined behaviour for
    # that tick. Cheap to check, and it catches the mistake at its source.
    for channel in (schema.CHANNEL_COMBAT, schema.CHANNEL_DEFENCE,
                    schema.CHANNEL_MOVEMENT, schema.CHANNEL_SUPPLY):
        span = channel_slice(channel)
        if not mask[:, span].any(axis=1).all():
            raise AssertionError(
                f"channel {schema.CAUSAL_UNIT_NAMES[channel]} has no legal action "
                f"on at least one row")

    return LegalActions(
        mask=mask,
        attack_ready=attack_ready,
        can_attack=can_attack,
        can_spec_single=can_spec_single,
        can_spec_double=can_spec_double,
        melee_reach_now=current_melee_reach,
        opp_melee_reach_now=opp_melee_attack_reach,
    )


def channel_slice(channel: int) -> slice:
    """Action id range owned by a channel."""
    if channel == schema.CHANNEL_COMBAT:
        return slice(schema.COMBAT_BASE, schema.COMBAT_BASE + schema.COMBAT_COUNT)
    if channel == schema.CHANNEL_DEFENCE:
        return slice(schema.DEFENCE_BASE, schema.DEFENCE_BASE + schema.DEFENCE_COUNT)
    if channel == schema.CHANNEL_MOVEMENT:
        return slice(schema.MOVEMENT_BASE, schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT)
    if channel == schema.CHANNEL_SUPPLY:
        return slice(schema.SUPPLY_BASE, schema.SUPPLY_BASE + schema.SUPPLY_COUNT)
    raise ValueError(f"channel {channel} has no contiguous slice")


CORE_CHANNELS = (
    (schema.CHANNEL_COMBAT, "combat"),
    (schema.CHANNEL_DEFENCE, "defence"),
    (schema.CHANNEL_MOVEMENT, "movement"),
    (schema.CHANNEL_SUPPLY, "supply"),
)


def _core_weapon_row(combat_action: np.ndarray) -> np.ndarray:
    """Required direct-gear model row for the selected combat action."""
    action = np.asarray(combat_action, dtype=np.int64)
    row = np.full(action.shape, -1, dtype=np.int64)
    ordinary = (
        (action >= schema.COMBAT_ATTACK_BASE)
        & (action < schema.COMBAT_SPEC_NONE)
    )
    style = (action - schema.COMBAT_ATTACK_BASE) // 2
    row = np.where(
        ordinary & (style == schema.STYLE_MAGIC), schema.GEAR_BASE + 3, row)
    row = np.where(
        ordinary & (style == schema.STYLE_RANGED), schema.GEAR_BASE + 12, row)
    row = np.where(
        ordinary & (style == schema.STYLE_MELEE), schema.GEAR_BASE + 15, row)

    explicit = action >= schema.COMBAT_SPEC_BASE
    kind = (action - schema.COMBAT_SPEC_BASE) // 2
    row = np.where(
        explicit
        & np.isin(kind, (
            schema.SPEC_GRANITE_MAUL,
            schema.SPEC_GRANITE_MAUL_DOUBLE,
        )),
        schema.GEAR_BASE + 19,
        row)
    row = np.where(
        explicit & (kind == schema.SPEC_VOIDWAKER),
        schema.GEAR_BASE + 18,
        row)
    row = np.where(
        explicit & (kind == schema.SPEC_VESTA_LONGSWORD),
        schema.GEAR_BASE + 17,
        row)
    return row


_OPTIONAL_GEAR_SLOT_ARRAY = np.asarray(
    schema.OPTIONAL_GEAR_SLOTS, dtype=np.int8)
_OPTIONAL_GEAR_UNIT_COUNT = len(schema.OPTIONAL_GEAR_SLOTS)
_OPTIONAL_GEAR_MAX_ROWS = max(
    len(gear.GEAR_ROWS_BY_SLOT[int(slot)])
    for slot in schema.OPTIONAL_GEAR_SLOTS)
_OPTIONAL_GEAR_ROWS = np.full(
    (_OPTIONAL_GEAR_UNIT_COUNT, _OPTIONAL_GEAR_MAX_ROWS),
    schema.GEAR_BASE,
    dtype=np.int64)
_OPTIONAL_GEAR_ROW_VALID = np.zeros(
    _OPTIONAL_GEAR_ROWS.shape, dtype=bool)
for _unit_index, _slot in enumerate(schema.OPTIONAL_GEAR_SLOTS):
    _rows = gear.GEAR_ROWS_BY_SLOT[int(_slot)]
    _OPTIONAL_GEAR_ROWS[_unit_index, :len(_rows)] = _rows
    _OPTIONAL_GEAR_ROW_VALID[_unit_index, :len(_rows)] = True
_OPTIONAL_GEAR_LOCAL = _OPTIONAL_GEAR_ROWS - schema.GEAR_BASE
_OPTIONAL_GEAR_UNIT_ACTIVE = np.asarray([
    schema.CHANNEL_GEAR_BASE + unit not in schema.INACTIVE_CAUSAL_UNITS
    for unit in range(_OPTIONAL_GEAR_UNIT_COUNT)
], dtype=bool)


def _select_optional_gear_greedy(scores, state, greedy_combat):
    """Port selectVectorDirectGearModelActions for the greedy decision.

    A slot chooses its highest positive state-changing action; zero is the
    virtual NONE logit. Combat's required weapon (and a two-handed weapon's
    shield dependency) reserve those optional units. The final capacity pass
    uses Java's core/equip/unequip execution phases.
    """
    n = scores.shape[0]
    equipped = _flat(state.equipped_ids)
    free_slots = _flat(state.inventory_free_slots).astype(np.int32)
    core_row = _core_weapon_row(greedy_combat)
    core_local = core_row - schema.GEAR_BASE
    core_valid = core_row >= schema.GEAR_BASE
    core_two_handed = np.zeros(n, dtype=bool)
    core_two_handed[core_valid] = gear.DIRECT_GEAR_TWO_HANDED[
        core_local[core_valid]]

    action_slots = gear.DIRECT_GEAR_SLOTS
    worn_for_action = equipped[:, action_slots]
    unequip = gear.DIRECT_GEAR_UNEQUIP[None, :]
    changing = np.where(
        unequip,
        (worn_for_action >= 0) & (free_slots[:, None] > 0),
        worn_for_action != gear.DIRECT_GEAR_ITEMS[None, :])
    current_weapon = equipped[:, gear.SLOT_WEAPON]
    current_weapon_two_handed = np.isin(
        current_weapon,
        (gear.NOXIOUS_HALBERD.item_id, gear.GRANITE_MAUL.item_id))
    shield_worn = equipped[:, gear.SLOT_SHIELD] >= 0
    changing &= (
        ~((action_slots == gear.SLOT_WEAPON)[None, :]
          & gear.DIRECT_GEAR_TWO_HANDED[None, :])
        | ~shield_worn[:, None])
    changing &= (
        ~((action_slots == gear.SLOT_SHIELD)[None, :] & ~unequip)
        | ~current_weapon_two_handed[:, None])
    changing &= action_slots[None, :] != gear.SLOT_AMMO
    reserved = (
        core_valid[:, None] & (action_slots[None, :] == gear.SLOT_WEAPON))
    reserved |= (
        core_two_handed[:, None]
        & (action_slots[None, :] == gear.SLOT_SHIELD))
    candidate = changing & ~reserved

    allowed = (
        _OPTIONAL_GEAR_ROW_VALID[None, :, :]
        & _OPTIONAL_GEAR_UNIT_ACTIVE[None, :, None]
        & candidate[:, _OPTIONAL_GEAR_LOCAL])
    slot_scores = np.where(
        allowed, scores[:, _OPTIONAL_GEAR_ROWS], -np.inf)
    best_index = np.argmax(slot_scores, axis=2)
    best_score = np.take_along_axis(
        slot_scores, best_index[..., None], axis=2)[..., 0]
    selected = np.take_along_axis(
        np.broadcast_to(_OPTIONAL_GEAR_ROWS, slot_scores.shape),
        best_index[..., None],
        axis=2)[..., 0]
    use = best_score > 0.0  # DMM_DIRECT_GEAR_VECTOR_SCORE_FLOOR
    unit_actions = np.where(use, selected, -1).astype(np.int64, copy=False)
    unit_scores = np.where(use, best_score, -np.inf).astype(
        np.float64, copy=False)

    # Java uses a stable descending score order. Retain the earlier optional
    # action if a two-handed weapon and shield were both selected.
    ranking = np.argsort(-unit_scores, axis=1, kind="stable")
    ranked_actions = np.take_along_axis(unit_actions, ranking, axis=1)
    ranked_valid = ranked_actions >= schema.GEAR_BASE
    ranked_local = np.where(
        ranked_valid, ranked_actions - schema.GEAR_BASE, 0)
    ranked_slots = gear.DIRECT_GEAR_SLOTS[ranked_local]
    ranked_equip = ranked_valid & ~gear.DIRECT_GEAR_UNEQUIP[ranked_local]
    ranked_two_handed = (
        ranked_equip
        & (ranked_slots == gear.SLOT_WEAPON)
        & gear.DIRECT_GEAR_TWO_HANDED[ranked_local])
    ranked_shield = ranked_equip & (ranked_slots == gear.SLOT_SHIELD)
    positions = np.arange(_OPTIONAL_GEAR_UNIT_COUNT)[None, :]
    absent = _OPTIONAL_GEAR_UNIT_COUNT
    two_handed_position = np.min(
        np.where(ranked_two_handed, positions, absent), axis=1)
    shield_position = np.min(
        np.where(ranked_shield, positions, absent), axis=1)
    conflict = (
        (two_handed_position < absent) & (shield_position < absent))
    dropped_position = np.maximum(two_handed_position, shield_position)
    cross_safe = (
        ranked_valid
        & ~(conflict[:, None] & (positions == dropped_position[:, None])))

    # Core gear executes first. Optional equips then execute in score order,
    # followed by optional unequips. Batch the same capacity scan: core can
    # leave at worst -1 free slot, an empty-slot equip repairs it, and only the
    # first `free` ranked unequips fit.
    free = free_slots.astype(np.int32, copy=True)
    core_shield_cost = (
        core_valid
        & core_two_handed
        & (equipped[:, gear.SLOT_SHIELD] >= 0))
    free -= core_shield_cost.astype(np.int32)

    equip_phase = cross_safe & ~gear.DIRECT_GEAR_UNEQUIP[ranked_local]
    empty_equip = (
        equip_phase
        & (np.take_along_axis(equipped, ranked_slots, axis=1) < 0))
    empty_prefix = np.cumsum(empty_equip, axis=1)
    equip_kept = (
        equip_phase
        & ((free[:, None] >= 0)
           | ((free[:, None] == -1) & (empty_prefix >= 1))))
    free_after_equips = (
        free + np.sum(empty_equip & equip_kept, axis=1, dtype=np.int32))

    unequip_phase = (
        cross_safe & gear.DIRECT_GEAR_UNEQUIP[ranked_local])
    unequip_position = np.cumsum(unequip_phase, axis=1)
    unequip_kept = (
        unequip_phase
        & (unequip_position <= np.maximum(free_after_equips, 0)[:, None]))
    retained_ranked = equip_kept | unequip_kept

    retained_by_unit = np.zeros(unit_actions.shape, dtype=bool)
    np.put_along_axis(
        retained_by_unit, ranking, retained_ranked, axis=1)
    unit_actions = np.where(retained_by_unit, unit_actions, -1)

    ranked_units = np.broadcast_to(ranking, ranking.shape)
    phase_actions = np.concatenate((
        np.where(equip_kept, ranked_actions, -1),
        np.where(unequip_kept, ranked_actions, -1),
    ), axis=1)
    phase_units = np.concatenate((ranked_units, ranked_units), axis=1)
    phase_valid = phase_actions >= schema.GEAR_BASE
    packed_position = np.cumsum(phase_valid, axis=1) - 1
    ordered = np.full(unit_actions.shape, -1, dtype=np.int64)
    retained_units = np.full(unit_actions.shape, -1, dtype=np.int64)
    packed_rows = np.broadcast_to(
        np.arange(n)[:, None], phase_actions.shape)[phase_valid]
    packed_columns = packed_position[phase_valid]
    ordered[packed_rows, packed_columns] = phase_actions[phase_valid]
    retained_units[packed_rows, packed_columns] = phase_units[phase_valid]
    return {
        "unit_actions": unit_actions,
        "ordered_actions": ordered,
        "ordered_units": retained_units,
        "core_row": core_row,
        "core_two_handed": core_two_handed,
        "candidate": candidate,
    }


def _capacity_safe_optional_order(equipped, free_slots, optional_actions,
                                  core_row):
    """Return Java's executable optional order, or None if anything is dropped."""
    actions = [int(action) for action in optional_actions
               if action >= schema.GEAR_BASE]
    if not actions:
        return []

    # crossSlotCompatibleOptionalActionOrder retains the first of an
    # incompatible optional two-handed-weapon/shield pair.
    retained = []
    kept_two_handed = False
    kept_shield = False
    for action in actions:
        local = action - schema.GEAR_BASE
        slot = int(gear.DIRECT_GEAR_SLOTS[local])
        unequip = bool(gear.DIRECT_GEAR_UNEQUIP[local])
        two_handed = (
            slot == gear.SLOT_WEAPON
            and not unequip
            and bool(gear.DIRECT_GEAR_TWO_HANDED[local]))
        shield = slot == gear.SLOT_SHIELD and not unequip
        if ((two_handed and kept_shield)
                or (shield and kept_two_handed)):
            return None
        kept_two_handed |= two_handed
        kept_shield |= shield
        retained.append(action)

    free = int(free_slots)
    if core_row >= schema.GEAR_BASE:
        local = core_row - schema.GEAR_BASE
        slot = int(gear.DIRECT_GEAR_SLOTS[local])
        delta = 1 if equipped[slot] < 0 else 0
        if (slot == gear.SLOT_WEAPON
                and gear.DIRECT_GEAR_TWO_HANDED[local]
                and equipped[gear.SLOT_SHIELD] >= 0):
            delta -= 1
        # Java's DMM setup maintains enough room for mandatory combat gear.
        # FastSim does not model every inventory item identity, so its scalar
        # free-slot counter can occasionally miss that invariant by one. Core
        # gear is mandatory; keep validating the optional portion from the
        # resulting zero-slot state instead of rejecting virtual NONE.
        free = max(0, free + delta)

    execution = []
    for unequip_phase in (False, True):
        for action in retained:
            local = action - schema.GEAR_BASE
            unequip = bool(gear.DIRECT_GEAR_UNEQUIP[local])
            if unequip != unequip_phase:
                continue
            slot = int(gear.DIRECT_GEAR_SLOTS[local])
            delta = -1 if unequip else (1 if equipped[slot] < 0 else 0)
            if free + delta < 0:
                return None
            free += delta
            execution.append(action)
    return execution


def _optional_gear_plan_metrics(equipped, unit_actions):
    """Vectorized inventory effects for one optional action per gear unit."""
    actions = np.asarray(unit_actions, dtype=np.int64)
    valid = actions >= schema.GEAR_BASE
    local = np.where(valid, actions - schema.GEAR_BASE, 0)
    slots = gear.DIRECT_GEAR_SLOTS[local]
    unequip = valid & gear.DIRECT_GEAR_UNEQUIP[local]
    equip = valid & ~unequip
    worn = np.take_along_axis(equipped, slots, axis=1)
    empty_equip = equip & (worn < 0)
    two_handed = (
        equip
        & (slots == gear.SLOT_WEAPON)
        & gear.DIRECT_GEAR_TWO_HANDED[local])
    shield = equip & (slots == gear.SLOT_SHIELD)
    return {
        "valid": valid,
        "unequip": unequip.astype(np.int8),
        "empty_equip": empty_equip.astype(np.int8),
        "two_handed": two_handed.astype(np.int8),
        "shield": shield.astype(np.int8),
    }


def _core_adjusted_free_slots(equipped, free_slots, core_rows):
    """Free slots after Java's mandatory core-gear phase."""
    core = np.asarray(core_rows, dtype=np.int64)
    valid = core >= schema.GEAR_BASE
    local = np.where(valid, core - schema.GEAR_BASE, 0)
    slots = gear.DIRECT_GEAR_SLOTS[local]
    rows = np.arange(equipped.shape[0])
    delta = (valid & (equipped[rows, slots] < 0)).astype(np.int32)
    delta -= (
        valid
        & (slots == gear.SLOT_WEAPON)
        & gear.DIRECT_GEAR_TWO_HANDED[local]
        & (equipped[:, gear.SLOT_SHIELD] >= 0)
    ).astype(np.int32)
    return np.maximum(0, np.asarray(free_slots, dtype=np.int32) + delta)


def _combat_optional_gear_feasible(state, gear_pick, candidate_core_rows):
    """Joint optional-gear feasibility for every combat alternative."""
    equipped = _flat(state.equipped_ids)
    free_slots = _flat(state.inventory_free_slots)
    actions = gear_pick["unit_actions"]
    metrics = _optional_gear_plan_metrics(equipped, actions)

    totals = {
        name: values.sum(axis=1, dtype=np.int16)[:, None]
        for name, values in metrics.items()
        if name != "valid"
    }
    weapon_unit = tuple(schema.OPTIONAL_GEAR_SLOTS).index(gear.SLOT_WEAPON)
    shield_unit = tuple(schema.OPTIONAL_GEAR_SLOTS).index(gear.SLOT_SHIELD)

    core = np.asarray(candidate_core_rows, dtype=np.int64)
    has_weapon = core >= schema.GEAR_BASE
    core_local = np.where(has_weapon, core - schema.GEAR_BASE, 0)
    core_slots = gear.DIRECT_GEAR_SLOTS[core_local]
    core_two_handed = (
        has_weapon
        & (core_slots == gear.SLOT_WEAPON)
        & gear.DIRECT_GEAR_TWO_HANDED[core_local])

    retained = {}
    for name in totals:
        retained[name] = (
            totals[name]
            - metrics[name][:, weapon_unit, None] * has_weapon[None, :]
            - metrics[name][:, shield_unit, None]
            * core_two_handed[None, :])

    core_empty = (
        has_weapon[None, :]
        & (equipped[:, core_slots] < 0)
    ).astype(np.int32)
    core_shield_cost = (
        core_two_handed[None, :]
        & (equipped[:, gear.SLOT_SHIELD, None] >= 0)
    ).astype(np.int32)
    free = np.maximum(
        0, free_slots[:, None].astype(np.int32)
        + core_empty - core_shield_cost)

    cross_slot_safe = ~(
        (retained["two_handed"] > 0) & (retained["shield"] > 0))
    capacity_safe = (
        free + retained["empty_equip"] >= retained["unequip"])
    return cross_slot_safe & capacity_safe


def _optional_gear_alternative_support(state, gear_pick):
    """Port legalOptionalGearAlternatives for all active gear causal units."""
    n = state.n_fights * 2
    unit_count = len(schema.OPTIONAL_GEAR_SLOTS)
    support = np.zeros(
        (n, unit_count, schema.ACTION_COUNT), dtype=bool)
    virtual_none = np.zeros((n, unit_count), dtype=bool)
    equipped = _flat(state.equipped_ids)
    free_slots = _flat(state.inventory_free_slots)
    metrics = _optional_gear_plan_metrics(
        equipped, gear_pick["unit_actions"])
    totals = {
        name: values.sum(axis=1, dtype=np.int16)
        for name, values in metrics.items()
        if name != "valid"
    }
    core_free = _core_adjusted_free_slots(
        equipped, free_slots, gear_pick["core_row"])

    for unit_index, slot in enumerate(schema.OPTIONAL_GEAR_SLOTS):
        unit = schema.CHANNEL_GEAR_BASE + unit_index
        if unit in schema.INACTIVE_CAUSAL_UNITS:
            continue

        without = {
            name: total - metrics[name][:, unit_index]
            for name, total in totals.items()
        }
        without_safe = (
            ~((without["two_handed"] > 0) & (without["shield"] > 0))
            & (core_free + without["empty_equip"] >= without["unequip"])
        )
        virtual_none[:, unit_index] = (
            metrics["valid"][:, unit_index] & without_safe)

        rows = gear.GEAR_ROWS_BY_SLOT[int(slot)]
        local = rows - schema.GEAR_BASE
        unequip = gear.DIRECT_GEAR_UNEQUIP[local][None, :]
        equip = ~unequip
        empty_equip = (
            equip & (equipped[:, int(slot), None] < 0))
        two_handed = (
            equip
            & (int(slot) == gear.SLOT_WEAPON)
            & gear.DIRECT_GEAR_TWO_HANDED[local][None, :])
        shield = equip & (int(slot) == gear.SLOT_SHIELD)

        new_unequip = without["unequip"][:, None] + unequip
        new_empty_equip = without["empty_equip"][:, None] + empty_equip
        new_two_handed = without["two_handed"][:, None] + two_handed
        new_shield = without["shield"][:, None] + shield
        feasible = (
            ~((new_two_handed > 0) & (new_shield > 0))
            & (core_free[:, None] + new_empty_equip >= new_unequip)
        )
        greedy = gear_pick["unit_actions"][:, unit_index, None]
        support[:, unit_index, rows] = (
            feasible
            & gear_pick["candidate"][:, local]
            & (rows[None, :] != greedy))
    return support, virtual_none


def _select_exploration_actions(support_rows: np.ndarray,
                                greedy_actions: np.ndarray,
                                gear_units: np.ndarray,
                                virtual_none: np.ndarray,
                                choices: np.ndarray) -> np.ndarray:
    """Select the indexed alternative from sorted factored support rows."""
    candidates = np.asarray(support_rows, dtype=bool).copy()
    greedy_actions = np.asarray(greedy_actions, dtype=np.int64)
    gear_units = np.asarray(gear_units, dtype=bool)
    virtual_none = np.asarray(virtual_none, dtype=bool)
    choices = np.asarray(choices, dtype=np.int64)

    rows = np.arange(candidates.shape[0])
    core_rows = ~gear_units
    candidates[
        rows[core_rows], greedy_actions[core_rows]] = False

    choose_none = gear_units & virtual_none & (choices == 0)
    support_choice = choices - (gear_units & virtual_none)
    rank = np.cumsum(candidates, axis=1, dtype=np.int16)
    selected = np.argmax(
        rank == (support_choice[:, None] + 1), axis=1)
    return np.where(choose_none, -1, selected).astype(
        np.int64, copy=False)


def pick_per_channel(scores: np.ndarray, mask: np.ndarray, rng,
                     epsilon: float = 0.0, state=None,
                     exploration_unit_mask: np.ndarray | None = None) -> dict:
    """Choose one action per channel, exactly the way the Java sampler does.

    The exploration rule is not "roll a die per channel". It is one die for the
    whole decision:

        eligible channels = those with at least one legal alternative to greedy
        k                 = how many are eligible
        with probability epsilon, exactly ONE eligible channel is explored,
        picked uniformly among the eligible ones, and within it the replacement
        action is picked uniformly among that channel's alternatives

    which makes the recorded probabilities:

        ineligible channel          -> 1
        eligible, kept greedy       -> 1 - epsilon/k
        eligible, explored          -> epsilon / k / alternatives

    nh_rollout.validate_factored_exploration_batch checks these to 1e-12, and
    the trainer's importance ratios are computed from them, so getting this
    wrong does not fail loudly at training time - it quietly biases the
    gradient. Hence the exactness.
    """
    n = scores.shape[0]
    effective_mask = mask.copy()
    blocked = np.where(effective_mask, scores, -np.inf)
    channel_count = len(CORE_CHANNELS)

    # Pad every channel's legal block to the widest one so all four can live in
    # a single [n, 4, width] array. That is what lets the exploration draw be a
    # handful of whole-array operations instead of a Python loop over rows -
    # the difference is roughly an order of magnitude on a big batch.
    widths = [channel_slice(channel).stop - channel_slice(channel).start
              for channel, _ in CORE_CHANNELS]
    max_width = max(widths)

    spans = [channel_slice(channel) for channel, _ in CORE_CHANNELS]
    legal_pad = np.zeros((n, channel_count, max_width), dtype=bool)
    greedy_local = np.zeros((n, channel_count), dtype=np.int64)

    # Java scores attack and spec as two sub-heads, then lets a selected
    # explicit spec override the attack. SPEC_NONE (action 7) is therefore a
    # control value, never the representative combat action and never part of
    # the combat causal unit's sampling support.
    attack_span = slice(schema.COMBAT_BASE,
                        schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE)
    spec_span = slice(schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE,
                      schema.COMBAT_BASE + schema.COMBAT_COUNT)
    greedy_attack = np.argmax(blocked[:, attack_span], axis=1) + attack_span.start
    greedy_spec = np.argmax(blocked[:, spec_span], axis=1) + spec_span.start
    greedy_combat = np.where(
        greedy_spec == schema.COMBAT_BASE + schema.COMBAT_SPEC_NONE,
        greedy_attack,
        greedy_spec)

    movement_span = spans[2]
    raw_greedy_movement = (
        np.argmax(blocked[:, movement_span], axis=1) + movement_span.start)

    def immediate_attack(action_ids):
        action_ids = np.asarray(action_ids)
        ordinary = ((action_ids >= schema.COMBAT_ATTACK_BASE)
                    & (action_ids < schema.COMBAT_SPEC_NONE)
                    & (((action_ids - schema.COMBAT_ATTACK_BASE) % 2)
                       == schema.ATTACK_INTENT_ATTACK))
        special = ((action_ids >= schema.COMBAT_SPEC_BASE)
                   & (((action_ids - schema.COMBAT_SPEC_BASE) % 2)
                      == schema.ATTACK_INTENT_ATTACK))
        return ordinary | special

    precludes_movement = immediate_attack(greedy_combat)
    if precludes_movement.any():
        effective_mask[precludes_movement,
                       schema.MOVEMENT_BASE + schema.MOVE_STAND_UNDER:
                       schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT] = False
        blocked = np.where(effective_mask, scores, -np.inf)

    for index, span in enumerate(spans):
        legal_pad[:, index, :widths[index]] = effective_mask[:, span]
        greedy_local[:, index] = np.argmax(blocked[:, span], axis=1)

    greedy_local[:, 0] = greedy_combat - spans[0].start
    greedy_local[:, 2] = np.where(
        precludes_movement,
        schema.MOVE_NONE,
        raw_greedy_movement - movement_span.start)

    # Build the combat exploration support separately from the global legal
    # mask. SPEC_NONE is omitted. When greedy movement is non-NONE, an
    # immediate-attack alternative is also omitted because the two actions
    # cannot execute jointly; this is combatAlternativePreservesGreedyMovement.
    combat_support = effective_mask[:, spans[0]].copy()
    combat_support[:, schema.COMBAT_SPEC_NONE] = False
    moving_greedily = greedy_local[:, 2] != schema.MOVE_NONE
    attack_intent_ids = immediate_attack(
        np.arange(schema.COMBAT_BASE,
                  schema.COMBAT_BASE + schema.COMBAT_COUNT))
    combat_support[moving_greedily] &= ~attack_intent_ids

    gear_pick = (
        _select_optional_gear_greedy(scores, state, greedy_combat)
        if state is not None else {
            "unit_actions": np.full(
                (n, len(schema.OPTIONAL_GEAR_SLOTS)), -1, dtype=np.int64),
            "ordered_actions": np.full(
                (n, len(schema.OPTIONAL_GEAR_SLOTS)), -1, dtype=np.int64),
            "ordered_units": np.full(
                (n, len(schema.OPTIONAL_GEAR_SLOTS)), -1, dtype=np.int64),
            "core_row": _core_weapon_row(greedy_combat),
            "core_two_handed": np.zeros(n, dtype=bool),
            "candidate": np.zeros((n, schema.GEAR_COUNT), dtype=bool),
        })

    # A combat exploration candidate owns its core weapon slot (and the shield
    # slot for a two-handed weapon). Java drops greedy optional actions in
    # those reserved slots, then checks whether every remaining optional action
    # is jointly executable. Merely having a greedy optional weapon/shield is
    # therefore not grounds to reject the combat candidate.
    weapon_unit_index = tuple(schema.OPTIONAL_GEAR_SLOTS).index(
        gear.SLOT_WEAPON)
    shield_unit_index = tuple(schema.OPTIONAL_GEAR_SLOTS).index(
        gear.SLOT_SHIELD)
    candidate_core_rows = _core_weapon_row(
        np.arange(schema.COMBAT_COUNT, dtype=np.int64))
    candidate_has_weapon = candidate_core_rows >= schema.GEAR_BASE
    candidate_two_handed = np.zeros(schema.COMBAT_COUNT, dtype=bool)
    valid_candidate = candidate_has_weapon
    candidate_two_handed[valid_candidate] = gear.DIRECT_GEAR_TWO_HANDED[
        candidate_core_rows[valid_candidate] - schema.GEAR_BASE]
    if state is not None:
        combat_support &= _combat_optional_gear_feasible(
            state, gear_pick, candidate_core_rows)
    # The greedy action is always retained even though it necessarily shares
    # its core reservation with the greedy plan.
    combat_support[np.arange(n), greedy_combat] = True
    legal_pad[:, 0, :widths[0]] = combat_support

    # Assemble all 15 v25 causal units. Core support includes its greedy action;
    # optional support excludes greedy and uses a virtual NONE alternative.
    unit_count = schema.CAUSAL_UNIT_COUNT
    support = np.zeros(
        (n, unit_count, schema.ACTION_COUNT), dtype=bool)
    greedy_actions = np.full((n, unit_count), -1, dtype=np.int64)
    for index, span in enumerate(spans):
        support[:, index, span] = legal_pad[:, index, :widths[index]]
        greedy_actions[:, index] = greedy_local[:, index] + span.start
    greedy_actions[:, 0] = greedy_combat
    greedy_actions[:, schema.CHANNEL_GEAR_BASE:] = gear_pick["unit_actions"]

    virtual_none = np.zeros((n, unit_count), dtype=bool)
    if state is not None:
        optional_support, optional_virtual_none = (
            _optional_gear_alternative_support(state, gear_pick))
        support[:, schema.CHANNEL_GEAR_BASE:] = optional_support
        virtual_none[:, schema.CHANNEL_GEAR_BASE:] = optional_virtual_none

    if exploration_unit_mask is not None:
        allowed = np.asarray(exploration_unit_mask, dtype=bool)
        if allowed.shape == (unit_count,):
            allowed = np.broadcast_to(allowed, (n, unit_count))
        if allowed.shape != (n, unit_count):
            raise ValueError(
                "exploration_unit_mask must have shape "
                f"({unit_count},) or ({n}, {unit_count})")

        # Eligibility is derived from recorded sampling support by the strict
        # NHRL validator. Restrict the support itself rather than merely
        # suppressing the random draw, so probabilities and metadata continue
        # to describe the exact behavior policy.
        core_allowed = allowed[:, :schema.CHANNEL_GEAR_BASE]
        support[:, :schema.CHANNEL_GEAR_BASE] &= core_allowed[:, :, None]
        disabled_rows, disabled_units = np.nonzero(~core_allowed)
        support[
            disabled_rows,
            disabled_units,
            greedy_actions[disabled_rows, disabled_units],
        ] = True

        optional_allowed = allowed[:, schema.CHANNEL_GEAR_BASE:]
        support[:, schema.CHANNEL_GEAR_BASE:] &= optional_allowed[:, :, None]
        virtual_none[:, schema.CHANNEL_GEAR_BASE:] &= optional_allowed

    support_counts = support.sum(axis=2)
    alternatives = support_counts.copy()
    alternatives[:, :schema.CHANNEL_GEAR_BASE] -= 1
    alternatives[:, schema.CHANNEL_GEAR_BASE:] += (
        virtual_none[:, schema.CHANNEL_GEAR_BASE:])
    eligible = alternatives > 0
    k = eligible.sum(axis=1)

    actual_actions = greedy_actions.copy()
    deviated = np.zeros((n, unit_count), dtype=bool)

    explore = (rng.random(n) < epsilon) & (k > 0)
    if explore.any():
        rows = np.nonzero(explore)[0]

        # Pick one eligible channel uniformly: take the j-th set bit of the
        # eligibility row, where j is a uniform draw in [0, k).
        j = (rng.random(rows.size) * k[rows]).astype(np.int64)
        eligible_rows = eligible[rows]
        unit = (np.cumsum(eligible_rows, axis=1) == (j[:, None] + 1))
        unit &= eligible_rows
        unit_index = np.argmax(unit, axis=1)

        option_count = alternatives[rows, unit_index]
        m = (rng.random(rows.size) * option_count).astype(np.int64)
        actual_actions[rows, unit_index] = _select_exploration_actions(
            support[rows, unit_index],
            greedy_actions[rows, unit_index],
            unit_index >= schema.CHANNEL_GEAR_BASE,
            virtual_none[rows, unit_index],
            m)
        deviated[rows, unit_index] = True

    # Probabilities, following the formula the loader validates against.
    safe_k = np.maximum(1, k)[:, None]
    per_unit_epsilon = epsilon / safe_k
    prob = np.ones((n, unit_count), dtype=np.float64)
    kept = eligible & ~deviated
    prob = np.where(kept, 1.0 - per_unit_epsilon, prob)
    prob = np.where(deviated,
                    per_unit_epsilon / np.maximum(1, alternatives),
                    prob)

    chosen = {}
    greedy = {}
    behaviour_prob = {}
    for index, (_channel, name) in enumerate(CORE_CHANNELS):
        chosen[name] = actual_actions[:, index]
        greedy[name] = greedy_actions[:, index]
        behaviour_prob[name] = prob[:, index]

    # The v25 channel_action_labels field is older than the factored causal
    # units and still records five Java subheads in this exact order: attack,
    # spec, defence, movement, supply. The combat causal unit remains one unit
    # for exploration/probability accounting. See
    # NhStakerSelfPlayManager.selectNeuralActionVector lines 8701-8711 and
    # channelActionLabelsForActions lines 10212-10223.
    chosen_attack = greedy_attack.copy()
    chosen_spec = greedy_spec.copy()
    combat_deviated = deviated[:, schema.CHANNEL_COMBAT]
    if combat_deviated.any():
        explored_combat = chosen["combat"]
        explored_is_spec = explored_combat >= schema.COMBAT_SPEC_BASE
        chosen_attack = np.where(
            combat_deviated & ~explored_is_spec,
            explored_combat,
            chosen_attack)
        chosen_spec = np.where(
            combat_deviated & explored_is_spec,
            explored_combat,
            chosen_spec)
        chosen_spec = np.where(
            combat_deviated & ~explored_is_spec,
            schema.COMBAT_SPEC_NONE,
            chosen_spec)

    channel_chosen = {
        "attack": chosen_attack,
        "spec": chosen_spec,
        "defence": chosen["defence"],
        "movement": chosen["movement"],
        "supply": chosen["supply"],
    }
    channel_greedy = {
        "attack": greedy_attack,
        "spec": greedy_spec,
        "defence": greedy["defence"],
        "movement": greedy["movement"],
        "supply": greedy["supply"],
    }

    # Replace the explored optional unit in the executable order. The support
    # above already proved the resulting joint plan survives cross-slot and
    # inventory-capacity filtering.
    gear_pick["actual_unit_actions"] = actual_actions[
        :, schema.CHANNEL_GEAR_BASE:].copy()
    if state is not None:
        equipped = _flat(state.equipped_ids)
        free_slots = _flat(state.inventory_free_slots)
        explored_rows = np.nonzero(
            deviated[:, schema.CHANNEL_GEAR_BASE:].any(axis=1))[0]
        for fighter in explored_rows:
            unit_index = int(np.nonzero(
                deviated[fighter, schema.CHANNEL_GEAR_BASE:])[0][0])
            slot = int(schema.OPTIONAL_GEAR_SLOTS[unit_index])
            replacement = int(
                gear_pick["actual_unit_actions"][fighter, unit_index])
            proposed = [
                int(action)
                for action in gear_pick["ordered_actions"][fighter]
                if action >= schema.GEAR_BASE
            ]
            found = False
            for index, existing in enumerate(proposed):
                existing_local = existing - schema.GEAR_BASE
                if int(gear.DIRECT_GEAR_SLOTS[existing_local]) == slot:
                    found = True
                    if replacement >= schema.GEAR_BASE:
                        proposed[index] = replacement
                    else:
                        proposed.pop(index)
                    break
            if not found and replacement >= schema.GEAR_BASE:
                proposed.append(replacement)
            ordered = _capacity_safe_optional_order(
                equipped[fighter], free_slots[fighter],
                proposed, int(gear_pick["core_row"][fighter]))
            if ordered is None:
                raise RuntimeError(
                    "optional gear exploration escaped its joint support "
                    f"fighter={fighter} unit={unit_index} "
                    f"replacement={replacement} proposed={proposed} "
                    f"core={int(gear_pick['core_row'][fighter])}")
            gear_pick["ordered_actions"][fighter] = -1
            gear_pick["ordered_actions"][
                fighter, :len(ordered)] = np.asarray(
                    ordered, dtype=np.int64)

    actual_core = _core_weapon_row(chosen["combat"])
    core_valid = actual_core >= schema.GEAR_BASE
    core_two_handed = np.zeros(n, dtype=bool)
    core_two_handed[core_valid] = gear.DIRECT_GEAR_TWO_HANDED[
        actual_core[core_valid] - schema.GEAR_BASE]
    reserved_mask = np.zeros((n, unit_count), dtype=bool)
    dependent_mask = np.zeros_like(reserved_mask)
    weapon_unit = schema.CHANNEL_GEAR_BASE + weapon_unit_index
    shield_unit = schema.CHANNEL_GEAR_BASE + shield_unit_index
    reserved_mask[:, weapon_unit] = core_valid
    reserved_mask[:, shield_unit] = core_two_handed
    dependent_mask[:, weapon_unit] = core_valid
    shield_worn = (
        _flat(state.equipped_ids)[:, gear.SLOT_SHIELD] >= 0
        if state is not None else np.zeros(n, dtype=bool))
    dependent_mask[:, shield_unit] = core_two_handed & shield_worn

    # Reserved optional units are virtual NONE in both greedy and actual
    # metadata, just as Java records after core gear ownership is resolved.
    # Keep their pre-composition support and eligibility, though: Java builds
    # the factored sampling support before the explored combat action reserves
    # its gear slots, then records probability 1 for the reserved units. The
    # trainer includes those original eligible units in k when validating the
    # other units' probabilities.
    greedy_actions[reserved_mask] = -1
    actual_actions[reserved_mask] = -1
    prob[reserved_mask] = 1.0

    dependent_actions = np.full((n, unit_count), -1, dtype=np.int64)
    dependent_actions[:, weapon_unit] = np.where(
        core_valid, actual_core, -1)
    dependent_actions[:, shield_unit] = np.where(
        dependent_mask[:, shield_unit],
        schema.GEAR_BASE + 24,  # UNEQUIP_SHIELD
        -1)

    return {
        "chosen": chosen,
        "greedy": greedy,
        "prob": behaviour_prob,
        "eligible": eligible,
        "alternatives": alternatives,
        "deviated": deviated,
        "mask": effective_mask,
        "support": support,
        "channel_chosen": channel_chosen,
        "channel_greedy": channel_greedy,
        "gear": gear_pick,
        "causal_actual": actual_actions,
        "causal_greedy": greedy_actions,
        "causal_prob": prob,
        "virtual_none": virtual_none,
        "reserved": reserved_mask,
        "dependent": dependent_mask,
        "dependent_actions": dependent_actions,
        "required_weapon": np.where(core_valid, actual_core, -1),
    }


def decode_combat(action_id: np.ndarray):
    """combat action id -> (attack style or -1, spec kind or -1, off_tick)."""
    local = action_id - schema.COMBAT_BASE
    style = np.full(local.shape, -1, dtype=np.int32)
    spec = np.full(local.shape, -1, dtype=np.int32)
    off_tick = np.zeros(local.shape, dtype=bool)

    is_attack = (local >= schema.COMBAT_ATTACK_BASE) & (local < schema.COMBAT_SPEC_NONE)
    attack_local = local - schema.COMBAT_ATTACK_BASE
    style = np.where(is_attack, attack_local // 2, style)
    off_tick = np.where(is_attack, (attack_local % 2) == schema.ATTACK_INTENT_OFF_TICK,
                        off_tick)

    is_spec = local >= schema.COMBAT_SPEC_BASE
    spec_local = local - schema.COMBAT_SPEC_BASE
    spec = np.where(is_spec, spec_local // 2, spec)
    # NhStakerSelfPlayManager.explicitSpecOffenceStyle: every explicit special
    # is executed as melee, regardless of the weapon worn before the decision.
    style = np.where(is_spec, schema.STYLE_MELEE, style)
    off_tick = np.where(is_spec, (spec_local % 2) == schema.ATTACK_INTENT_OFF_TICK,
                        off_tick)

    return style, spec, off_tick


def decode_defence(action_id: np.ndarray) -> np.ndarray:
    return action_id - schema.DEFENCE_BASE


def decode_movement(action_id: np.ndarray) -> np.ndarray:
    return action_id - schema.MOVEMENT_BASE


def decode_supply(action_id: np.ndarray) -> np.ndarray:
    return action_id - schema.SUPPLY_BASE
