"""Turn the fight state into the 114 numbers the model reads.

This is a direct translation of NhStakerSelfPlayManager.encodeInput. The order
of the 114 slots is fixed by that method and must not be changed: the trained
checkpoints were fitted to this exact ordering, so a single swapped slot makes
every existing checkpoint meaningless.

Everything is computed for both fighters of every fight at once, giving an
array of shape [n_fights * 2, 114].
"""

from __future__ import annotations

import numpy as np

from . import actions, combat, gear, schema
from .schema import clamp01, clamp_signed
from .state import START_BREW_ITEMS, START_RESTORE_ITEMS


_FLEX_SLOTS = np.asarray(
    [
        gear.SLOT_CHEST,
        gear.SLOT_SHIELD,
        gear.SLOT_LEGS,
        gear.SLOT_HANDS,
    ],
    dtype=np.intp)
_FLEX_CANDIDATE_IDS = np.asarray(
    [
        [gear.VIRTUS_ROBE_TOP.item_id, gear.MASORI_BODY_F.item_id],
        [gear.ELIDINIS_WARD_F.item_id, gear.DRAGONFIRE_SHIELD.item_id],
        [gear.VIRTUS_ROBE_BOTTOM.item_id, gear.TORVA_PLATELEGS.item_id],
        [gear.CONFLICTION_GAUNTLETS.item_id, gear.BARROWS_GLOVES.item_id],
    ],
    dtype=np.int32)
_FLEX_MAGIC_PENALTY_SLOTS = np.asarray(
    [True, False, True, False])
_FLEX_DEFENCE_INDEXES = np.asarray(
    [
        schema.MAGIC_DEFENCE,
        schema.RANGE_DEFENCE,
        schema.STAB_DEFENCE,
        schema.SLASH_DEFENCE,
        schema.CRUSH_DEFENCE,
    ],
    dtype=np.intp)


def _flat(arr: np.ndarray) -> np.ndarray:
    """[n_fights, 2, ...] -> [n_fights * 2, ...] in (fight, side) order."""
    return arr.reshape((-1,) + arr.shape[2:])


def _one_hot_style(out: np.ndarray, base: int, style_flat: np.ndarray) -> None:
    """Write a 3-wide one-hot. A style of -1 leaves all three at zero,
    matching Java's writeStyle for a null OffenceStyle."""
    for s in range(3):
        out[:, base + s] = (style_flat == s).astype(np.float64)


def _one_hot_spec(out: np.ndarray, base: int, kind_flat: np.ndarray) -> None:
    # NhStakerBot.specKindCode is NONE=0, GMAUL=1, VOIDWAKER=2, VLS=3,
    # AGS=4. The action subhead has two separate granite-maul intents, so map
    # both of those to the same history kind.
    encoded = np.select(
        [
            kind_flat < 0,
            (kind_flat == schema.SPEC_GRANITE_MAUL)
            | (kind_flat == schema.SPEC_GRANITE_MAUL_DOUBLE),
            kind_flat == schema.SPEC_VOIDWAKER,
            kind_flat == schema.SPEC_VESTA_LONGSWORD,
            kind_flat == schema.SPEC_ARMADYL_GODSWORD,
        ],
        [0, 1, 2, 3, 4],
        default=0)
    for k in range(5):
        out[:, base + k] = (encoded == k).astype(np.float64)


def _defence_score(bonuses: np.ndarray, threat_style: int) -> np.ndarray:
    if threat_style == schema.STYLE_MAGIC:
        return bonuses[..., schema.MAGIC_DEFENCE]
    if threat_style == schema.STYLE_RANGED:
        return bonuses[..., schema.RANGE_DEFENCE]
    return np.max(
        bonuses[..., [
            schema.STAB_DEFENCE,
            schema.SLASH_DEFENCE,
            schema.CRUSH_DEFENCE,
        ]],
        axis=-1)


def _flex_offence_scores(bonuses: np.ndarray) -> np.ndarray:
    """Magic/ranged/melee utility for arrays whose penultimate axis is slot."""
    magic = (
        bonuses[..., schema.MAGIC_ATTACK]
        + 2.0 * bonuses[..., schema.MAGIC_DAMAGE])
    magic = magic - np.where(
        _FLEX_MAGIC_PENALTY_SLOTS
        & (bonuses[..., schema.MAGIC_ATTACK] < 0),
        56.0,
        0.0)
    ranged = (
        bonuses[..., schema.RANGE_ATTACK]
        + 1.8 * bonuses[..., schema.RANGED_STRENGTH])
    melee = (
        np.max(
            bonuses[..., [
                schema.STAB_ATTACK,
                schema.SLASH_ATTACK,
                schema.CRUSH_ATTACK,
            ]],
            axis=-1)
        + 1.8 * bonuses[..., schema.MELEE_STRENGTH])
    return np.stack([magic, ranged, melee], axis=-1)


def _defence_scores(bonuses: np.ndarray) -> np.ndarray:
    """Magic/ranged/best-melee defence in policy input order."""
    return np.stack(
        [
            bonuses[..., schema.MAGIC_DEFENCE],
            bonuses[..., schema.RANGE_DEFENCE],
            np.max(
                bonuses[..., [
                    schema.STAB_DEFENCE,
                    schema.SLASH_DEFENCE,
                    schema.CRUSH_DEFENCE,
                ]],
                axis=-1),
        ],
        axis=-1)


def _flex_defence_gains(
    state, worn: np.ndarray, gear_tables
) -> np.ndarray:
    """NhStakerBot.expectedFlexibleDefenceBonuses for all three threats."""
    equipped = _flat(state.equipped_ids)
    offence = _flat(state.style)
    hp = _flat(state.hp)
    lookup = gear_tables["item_bonus_lookup"]
    n = equipped.shape[0]

    # Forced self-play targets are actively aggressing throughout the episode,
    # so collectFlexibleGearSwapCandidates uses the pressure weight.
    defence_weight = np.full(n, 1.20, dtype=np.float64)
    defence_weight *= np.where(hp <= 45, 1.25, np.where(hp <= 65, 1.12, 1.0))

    threat_count = 3
    slot_count = _FLEX_SLOTS.size
    candidate_bonuses = lookup[_FLEX_CANDIDATE_IDS.T]
    candidate_style_scores = _flex_offence_scores(candidate_bonuses)
    safe_offence = np.clip(offence, 0, 2)
    candidate_offence = candidate_style_scores.transpose(2, 1, 0)[
        safe_offence]
    candidate_offence = np.where(
        (offence >= 0)[:, None, None], candidate_offence, 0.0)
    candidate_defence = _defence_scores(
        candidate_bonuses).transpose(2, 1, 0)
    candidate_prayer = (
        candidate_bonuses[..., schema.PRAYER_BONUS].T * 0.08)
    utilities = (
        candidate_offence[:, None, :, :] * 1.15
        + candidate_defence[None, :, :, :]
        * defence_weight[:, None, None, None]
        + candidate_prayer[None, None, :, :])

    best = np.argmax(utilities, axis=3)
    desired = _FLEX_CANDIDATE_IDS[
        np.arange(slot_count)[None, None, :], best]
    current_ids = equipped[:, _FLEX_SLOTS]
    safe_current = np.where(
        (current_ids >= 0) & (current_ids < lookup.shape[0]),
        current_ids, 0)
    current_bonuses = lookup[safe_current]
    current_style_scores = _flex_offence_scores(current_bonuses)
    current_offence = np.take_along_axis(
        current_style_scores,
        np.broadcast_to(
            safe_offence[:, None, None], (n, slot_count, 1)),
        axis=2)[:, :, 0]
    current_offence = np.where(
        (offence >= 0)[:, None], current_offence, 0.0)
    current_utility = (
        current_offence[:, None, :] * 1.15
        + _defence_scores(current_bonuses).transpose(0, 2, 1)
        * defence_weight[:, None, None]
        + current_bonuses[:, None, :, schema.PRAYER_BONUS] * 0.08)
    gain = np.take_along_axis(
        utilities, best[:, :, :, None], axis=3)[:, :, :, 0]

    core = np.zeros((n, slot_count), dtype=bool)
    core[:, 0] = (
        (offence == schema.STYLE_MAGIC)
        | (offence == schema.STYLE_RANGED))
    core[:, 1] = (
        (offence == schema.STYLE_MAGIC)
        | (offence == schema.STYLE_RANGED)
        | (offence == schema.STYLE_MELEE))
    useful = (
        ~core[:, None, :]
        & (desired != current_ids[:, None, :])
        & ((gain - current_utility) > 0.0))
    gains = np.where(useful, gain - current_utility, -np.inf)
    desired_ids = np.where(useful, desired, -1)

    expected = np.broadcast_to(
        worn[:, None, _FLEX_DEFENCE_INDEXES],
        (n, threat_count, _FLEX_DEFENCE_INDEXES.size)).copy()
    ranking = np.argsort(-gains, axis=2, kind="stable")
    for rank in range(min(3, slot_count)):
        chosen_slot_index = ranking[:, :, rank]
        chosen_gain = np.take_along_axis(
            gains, chosen_slot_index[:, :, None], axis=2)[:, :, 0]
        desired = np.take_along_axis(
            desired_ids, chosen_slot_index[:, :, None], axis=2)[:, :, 0]
        selected_slots = _FLEX_SLOTS[chosen_slot_index]
        current_ids = np.take_along_axis(
            equipped, selected_slots, axis=1)
        use = np.isfinite(chosen_gain) & (desired > 0)
        current_safe = np.where(
            use
            & (current_ids >= 0)
            & (current_ids < lookup.shape[0]),
            current_ids, 0)
        desired_safe = np.where(use, desired, 0)
        expected -= np.where(
            use[:, :, None],
            lookup[current_safe][..., _FLEX_DEFENCE_INDEXES],
            0)
        expected += np.where(
            use[:, :, None],
            lookup[desired_safe][..., _FLEX_DEFENCE_INDEXES],
            0)
    current_scores = _defence_scores(worn)
    expected_scores = np.stack(
        [
            expected[:, 0, 0],
            expected[:, 1, 1],
            np.max(expected[:, 2, 2:], axis=1),
        ],
        axis=1)
    return clamp01((expected_scores - current_scores) / 140.0)


def _expected_style_bonuses(
    state, gear_tables, style_index: int, worn: np.ndarray | None = None
) -> np.ndarray:
    """NhStakerBot.expectedBonusesForStyle for the current DMM loadout."""
    equipped = _flat(state.equipped_ids)
    lookup = gear_tables["item_bonus_lookup"]
    expected = (
        gear.equipment_bonuses(equipped, lookup)
        if worn is None else worn.copy())
    replacements = {
        schema.STYLE_MAGIC: {
            gear.SLOT_WEAPON: gear.ZURIELS_STAFF.item_id,
            gear.SLOT_SHIELD: gear.ELIDINIS_WARD_F.item_id,
            gear.SLOT_CAPE: gear.IMBUED_SARADOMIN_CAPE.item_id,
            gear.SLOT_AMULET: gear.AMULET_OF_FURY.item_id,
            gear.SLOT_CHEST: gear.VIRTUS_ROBE_TOP.item_id,
            gear.SLOT_LEGS: gear.VIRTUS_ROBE_BOTTOM.item_id,
        },
        schema.STYLE_RANGED: {
            gear.SLOT_WEAPON: gear.ZARYTE_CROSSBOW.item_id,
            gear.SLOT_SHIELD: gear.DRAGONFIRE_SHIELD.item_id,
            gear.SLOT_AMMO: gear.ONYX_DRAGON_BOLTS_E.item_id,
            gear.SLOT_CAPE: gear.IMBUED_SARADOMIN_CAPE.item_id,
            gear.SLOT_AMULET: gear.AMULET_OF_FURY.item_id,
            gear.SLOT_CHEST: gear.MASORI_BODY_F.item_id,
            gear.SLOT_LEGS: gear.TORVA_PLATELEGS.item_id,
        },
        schema.STYLE_MELEE: {
            gear.SLOT_WEAPON: gear.NOXIOUS_HALBERD.item_id,
            gear.SLOT_SHIELD: -1,
            gear.SLOT_CAPE: gear.IMBUED_SARADOMIN_CAPE.item_id,
            gear.SLOT_AMULET: gear.AMULET_OF_FURY.item_id,
            gear.SLOT_CHEST: gear.MASORI_BODY_F.item_id,
            gear.SLOT_LEGS: gear.TORVA_PLATELEGS.item_id,
        },
    }[style_index]
    for slot, item_id in replacements.items():
        current = equipped[:, slot]
        safe = np.where(
            (current >= 0) & (current < lookup.shape[0]), current, 0)
        expected -= lookup[safe]
        if item_id > 0:
            expected += lookup[item_id]
    return expected


def _scripted_fallback_style(
    state, gear_tables, rng=None, worn=None, opp_worn=None
) -> np.ndarray:
    """decideOffenceStyle/bestExpectedOffenceStyle, vectorized."""
    n = state.n_fights * 2
    distance = np.repeat(state.distance(), 2)
    self_frozen = _flat(state.freeze_ticks) > 0
    # shouldAttemptFreeze reads delayedInfoFor(opponent).frozen, not the
    # opponent's live timer. Using the live thaw tick advances the retry
    # cadence a decision early.
    opp_frozen = _flat(state.seen_opp_frozen)
    opponent_overhead = _flat(state.seen_opp_overhead)
    live_weapon_range = gear.weapon_max_distance(
        _flat(state.equipped_ids[:, :, gear.SLOT_WEAPON]))

    allow_freeze = opponent_overhead != schema.PRAY_PROTECT_MAGIC
    tick = np.repeat(state.tick, 2)
    next_attempt = _flat(state.next_freeze_attempt_tick)
    due = allow_freeze & ~opp_frozen & (tick >= next_attempt)
    next_attempt[due] = tick[due] + 6
    wants_freeze = due

    opp_bonuses = (
        gear.equipment_bonuses(
            _flat(state.seen_opp_equipped_ids),
            gear_tables["item_bonus_lookup"])
        if opp_worn is None else opp_worn)
    weakness = np.stack([
        -clamp_signed(
            (opp_bonuses[:, schema.MAGIC_DEFENCE] - 70.0) / 140.0),
        -clamp_signed(
            (opp_bonuses[:, schema.RANGE_DEFENCE] - 70.0) / 140.0),
        -clamp_signed(
            (opp_bonuses[:, schema.SLASH_DEFENCE] - 70.0) / 140.0),
    ], axis=1)
    defence_factor = 0.56 + 0.58 * clamp01(weakness + 0.35)

    protected = np.stack([
        opponent_overhead == schema.PRAY_PROTECT_MAGIC,
        opponent_overhead == schema.PRAY_PROTECT_MISSILES,
        opponent_overhead == schema.PRAY_PROTECT_MELEE,
    ], axis=1)
    prayer_factor = np.where(protected, 0.58, 1.0)

    levels = (
        _flat(state.attack_level).astype(np.float64),
        _flat(state.strength_level).astype(np.float64),
        _flat(state.ranged_level).astype(np.float64),
        _flat(state.magic_level).astype(np.float64),
    )
    attack_level, strength_level, ranged_level, magic_level = levels
    ev = np.zeros((n, 3), dtype=np.float64)
    threat_style = gear.style_for_weapon(_flat(state.seen_opp_weapon_id))
    for style_index in range(3):
        bonuses = _expected_style_bonuses(
            state, gear_tables, style_index, worn=worn)
        if style_index == schema.STYLE_MAGIC:
            base_hit = np.where(
                magic_level >= 94, 31.0,
                np.where(magic_level >= 82, 26.0, 3.0))
            base_hit *= (
                1.0 + bonuses[:, schema.MAGIC_DAMAGE] / 100.0)
            stat_factor = np.where(
                magic_level < 82,
                0.10,
                np.clip(
                    np.where(magic_level >= 94, 1.0, 26.0 / 31.0)
                    * (0.56 + 0.44 * np.minimum(1.0, magic_level / 99.0)),
                    0.10, 1.22))
            in_range = (distance >= 1) & (distance <= 10)
        elif style_index == schema.STYLE_RANGED:
            effective = np.ceil(
                ranged_level * (1.0 + combat.RIGOUR_RANGED_STRENGTH))
            strength_bonus = bonuses[:, schema.RANGED_STRENGTH]
            base_hit = np.maximum(
                0.0,
                1.3 + effective / 10.0 + strength_bonus / 80.0
                + effective * strength_bonus / 640.0)
            stat_factor = np.clip(
                0.38 + 0.62 * np.clip(ranged_level / 99.0, 0.0, 1.25),
                0.10, 1.22)
            # attackRangeForThreat(RANGED, player) deliberately reads the
            # CURRENT weapon type, not the expected ranged loadout:
            # min(max(1, weaponType.maxDistance) + 2, 10). A staff therefore
            # exposes only three-tile ranged EV while a worn crossbow exposes
            # ten (NhStakerBot.java:4514-4525, 10356-10365).
            ranged_range = np.minimum(np.maximum(1, live_weapon_range) + 2, 10)
            in_range = (distance >= 1) & (distance <= ranged_range)
        else:
            effective = np.ceil(
                strength_level * (1.0 + combat.PIETY_STRENGTH))
            strength_bonus = bonuses[:, schema.MELEE_STRENGTH]
            base_hit = np.maximum(
                0.0,
                1.3 + effective / 10.0 + strength_bonus / 80.0
                + effective * strength_bonus / 640.0)
            attack_ratio = np.clip(attack_level / 99.0, 0.0, 1.25)
            strength_ratio = np.clip(strength_level / 99.0, 0.0, 1.25)
            stat_factor = np.clip(
                (0.42 + 0.58 * attack_ratio)
                * (0.48 + 0.52 * strength_ratio),
                0.10, 1.22)
            # Java's clientOffenceEv checks the weapon that is currently
            # visible/equipped here; action legality separately accounts for
            # the halberd that an ordinary melee action would equip.
            in_range = actions._melee_reach_now(
                _flat(state.rel_dx()),
                _flat(state.rel_dy()),
                self_frozen,
                gear.melee_standing_range(
                    _flat(state.equipped_ids[:, :, gear.SLOT_WEAPON])))

        if style_index == schema.STYLE_MAGIC:
            attack_bonus = bonuses[:, schema.MAGIC_ATTACK]
        elif style_index == schema.STYLE_RANGED:
            attack_bonus = bonuses[:, schema.RANGE_ATTACK]
        else:
            attack_bonus = np.max(
                bonuses[:, [
                    schema.STAB_ATTACK,
                    schema.SLASH_ATTACK,
                    schema.CRUSH_ATTACK,
                ]],
                axis=1)
        accuracy_factor = np.clip(
            (attack_bonus + 64.0) / 135.0, 0.10, 1.22)

        tank_defence = np.zeros(n, dtype=np.float64)
        for threat in range(3):
            use = threat_style == threat
            tank_defence[use] = _defence_score(
                bonuses[use], threat)
        tank_factor = np.clip(
            1.0 + tank_defence / 900.0, 0.88, 1.12)
        ev[:, style_index] = np.where(
            in_range,
            (base_hit / 42.0)
            * defence_factor[:, style_index]
            * prayer_factor[:, style_index]
            * stat_factor
            * accuracy_factor
            * tank_factor,
            0.0)
    ev[:, schema.STYLE_MAGIC] += np.where(
        wants_freeze & (ev[:, schema.STYLE_MAGIC] > 0.0), 0.16, 0.0)
    best = np.argmax(ev, axis=1).astype(np.int32)
    no_expected_style = np.max(ev, axis=1) <= 0.0
    if not no_expected_style.any():
        return best

    # bestExpectedOffenceStyle returns null when every reachable EV is zero.
    # decideOffenceStyle then uses the opponent's protection first, followed
    # by delayed likely/gear style and finally the weaker open defence.
    fallback = np.full(n, schema.STYLE_MAGIC, dtype=np.int32)
    fallback = np.where(
        opponent_overhead == schema.PRAY_PROTECT_MAGIC,
        schema.STYLE_RANGED,
        fallback)
    fallback = np.where(
        opponent_overhead == schema.PRAY_PROTECT_MISSILES,
        schema.STYLE_MAGIC,
        fallback)
    fallback = np.where(
        opponent_overhead == schema.PRAY_PROTECT_MELEE,
        np.where(
            wants_freeze, schema.STYLE_MAGIC, schema.STYLE_RANGED),
        fallback)

    no_protection = opponent_overhead < 0
    likely_counter = np.where(
        threat_style == schema.STYLE_MAGIC,
        schema.STYLE_RANGED,
        np.where(
            threat_style == schema.STYLE_RANGED,
            schema.STYLE_MAGIC,
            np.where(
                threat_style == schema.STYLE_MELEE,
                np.where(
                    wants_freeze,
                    schema.STYLE_MAGIC,
                    schema.STYLE_RANGED),
                schema.STYLE_MAGIC)))
    fallback = np.where(no_protection & (threat_style >= 0),
                        likely_counter, fallback)

    readable = np.ones(n, dtype=bool)
    open_magic = opponent_overhead != schema.PRAY_PROTECT_MAGIC
    open_ranged = opponent_overhead != schema.PRAY_PROTECT_MISSILES
    magic_def = opp_bonuses[:, schema.MAGIC_DEFENCE]
    ranged_def = opp_bonuses[:, schema.RANGE_DEFENCE]
    weakness_best = np.where(
        open_magic & (~open_ranged | (magic_def <= ranged_def)),
        schema.STYLE_MAGIC,
        np.where(open_ranged, schema.STYLE_RANGED, schema.STYLE_MAGIC))
    use_weakness = (
        no_protection
        & (threat_style < 0)
        & ~wants_freeze
        & readable)
    fallback = np.where(use_weakness, weakness_best, fallback)
    return np.where(no_expected_style, fallback, best).astype(np.int32)


def _soft_ko_risk(hp, possible_damage, margin):
    lower = np.maximum(1, possible_damage - margin)
    upper = np.minimum(115, possible_damage + margin)
    span = np.maximum(1, upper - lower)
    return np.where(
        hp <= lower, 1.0,
        np.where(hp >= upper, 0.0, (upper - hp) / span))


def _special_observation_features(state, gear_tables, legal, opp_hp,
                                  spec_energy, opp_worn=None):
    """Port bestAvailableSpecialWeaponKind and its four observation features."""
    n = state.n_fights * 2
    recent_hit = np.maximum(0.0, _flat(state.last_dealt_hit).astype(np.float64))
    self_frozen = _flat(state.freeze_ticks) > 0
    dx = np.abs(_flat(state.rel_dx()))
    dy = np.abs(_flat(state.rel_dy()))
    spec_reach_next = actions._melee_reach_now(
        dx, dy, self_frozen, 1)
    current_reach = spec_reach_next
    attack_ready = _flat(state.attack_delay) <= 0
    tick_start_spec_control = gear.weapon_shows_special_bar(
        _flat(state.weapon_id))
    vls_available = (
        (_flat(state.weapon_id) == gear.VESTAS_LONGSWORD.item_id)
        | ~_flat(state.vls_attributed))
    opponent_overhead = _flat(state.seen_opp_overhead)

    opp_bonuses = (
        gear.equipment_bonuses(
            _flat(state.seen_opp_equipped_ids),
            gear_tables["item_bonus_lookup"])
        if opp_worn is None else opp_worn)
    opp_gear_style = gear.style_for_weapon(
        _flat(state.seen_opp_weapon_id))

    def exposure_for(defence_index):
        defence = opp_bonuses[:, defence_index]
        exposure = np.ones(n, dtype=np.float64)
        exposure += np.where(
            defence <= 75, 0.22,
            np.where(defence <= 115, 0.10,
                     np.where(defence >= 185, -0.26,
                              np.where(defence >= 145, -0.14, 0.0))))
        magic_def = opp_bonuses[:, schema.MAGIC_DEFENCE]
        ranged_def = opp_bonuses[:, schema.RANGE_DEFENCE]
        exposure += np.where(
            (opp_gear_style == schema.STYLE_MAGIC)
            & (magic_def <= 95) & (defence <= 125),
            0.12, 0.0)
        exposure -= np.where(
            (opp_gear_style == schema.STYLE_RANGED)
            & (ranged_def >= 125) & (defence >= 125),
            0.08, 0.0)
        return np.clip(exposure, 0.62, 1.32)

    def gmaul_features(double):
        exposure = exposure_for(schema.CRUSH_DEFENCE)
        protected = opponent_overhead == schema.PRAY_PROTECT_MELEE
        max_damage = 72 if double else 40
        effective = np.maximum(
            1, np.floor(max_damage * exposure
                        * np.where(protected, 0.60, 1.0) + 0.5))
        ko = _soft_ko_risk(opp_hp, effective, 14 if double else 10)
        ko += np.where(
            ~protected & (recent_hit >= 24) & (opp_hp <= 72), 0.08, 0.0)
        ko += np.where(
            (recent_hit >= 30) & (opp_hp <= 65), 0.12, 0.0)
        ko += np.where(
            (recent_hit >= 38) & (opp_hp <= 58), 0.10, 0.0)
        ko += np.where(opp_hp <= 45, 0.08, 0.0)
        ko -= np.where(
            (opp_hp >= 70) & (recent_hit < 18), 0.12, 0.0)
        ko -= np.where(
            (opp_hp >= 78) & (recent_hit < 24), 0.14, 0.0)
        ko = clamp01(ko)

        hp_score = (
            clamp01((88.0 - opp_hp) / 42.0) if double
            else clamp01((54.0 - opp_hp) / 34.0))
        recent_score = clamp01((recent_hit - 16.0) / 24.0)
        exposure_score = clamp01((exposure - 0.82) / 0.45)
        setup = hp_score * 0.50 + recent_score * 0.32 + exposure_score * 0.18
        setup += np.where(
            (recent_hit >= 28) & (opp_hp <= (72 if double else 50)),
            0.12, 0.0)
        setup -= np.where(
            (recent_hit <= 8) & (opp_hp >= (68 if double else 48)),
            0.18, 0.0)
        setup = clamp01(setup * np.where(protected, 0.25, 1.0))

        credible = np.maximum(ko, setup * 0.82)
        credible += np.where(
            (recent_hit >= 24) & (opp_hp <= (82 if double else 58)),
            0.10 + clamp01((recent_hit - 24.0) / 24.0) * 0.10,
            0.0)
        credible += np.where(
            ~protected & (exposure >= 1.05)
            & (opp_hp <= (84 if double else 56)),
            clamp01((exposure - 1.0) / 0.32) * 0.08, 0.0)
        credible *= np.where(
            protected & (opp_hp > (46 if double else 30)), 0.42, 1.0)
        credible *= np.where(
            (opp_hp >= 82) & (recent_hit < 24), 0.45, 1.0)
        credible = clamp01(credible)

        high_hp = clamp01((opp_hp - 62.0) / 28.0)
        dry = np.where(
            (recent_hit < 18) & (opp_hp >= 62),
            1.45 * high_hp * (1.0 - setup) * (1.15 if double else 0.85),
            0.0)
        score = ko * 1.45 + credible * 0.90 + setup * 0.25 - dry
        return ko, setup, score

    def voidwaker_features():
        exposure = exposure_for(schema.MAGIC_DEFENCE)
        protected = opponent_overhead == schema.PRAY_PROTECT_MAGIC
        effective = np.maximum(
            1, np.floor(72 * exposure
                        * np.where(protected, 0.60, 1.0) + 0.5))
        ko = _soft_ko_risk(opp_hp, effective, 10)
        ko += np.where(~protected & (opp_hp <= 70), 0.08, 0.0)
        ko += np.where(
            (recent_hit >= 24) & (opp_hp <= 78), 0.10, 0.0)
        ko += np.where(opp_hp <= 52, 0.08, 0.0)
        ko -= np.where(
            (opp_hp >= 88) & (recent_hit < 18), 0.12, 0.0)
        ko = clamp01(ko)
        setup = (
            clamp01((78.0 - opp_hp) / 44.0) * 0.58
            + clamp01((recent_hit - 16.0) / 26.0) * 0.28
            + clamp01((exposure - 0.90) / 0.30) * 0.14)
        setup += np.where(
            (recent_hit >= 28) & (opp_hp <= 72), 0.10, 0.0)
        setup -= np.where(
            (recent_hit <= 8) & (opp_hp >= 78), 0.18, 0.0)
        setup = clamp01(setup * np.where(protected, 0.38, 1.0))
        credible = np.maximum(ko, setup * 0.90)
        credible += np.where(
            (recent_hit >= 22) & (opp_hp <= 80),
            0.08 + clamp01((recent_hit - 22.0) / 26.0) * 0.10,
            0.0)
        credible += np.where(
            ~protected & (exposure >= 1.0) & (opp_hp <= 78),
            0.07, 0.0)
        credible *= np.where(protected & (opp_hp > 46), 0.50, 1.0)
        credible *= np.where(
            (opp_hp >= 90) & (recent_hit < 18), 0.48, 1.0)
        credible = clamp01(credible)
        dry = np.where(
            (recent_hit < 20) & (opp_hp >= 72),
            1.45 * clamp01((opp_hp - 72.0) / 24.0)
            * (1.0 - setup) * 0.90,
            0.0)
        score = ko * 1.45 + credible * 0.90 + setup * 0.25 - dry
        return ko, setup, score

    def vls_features():
        exposure = exposure_for(schema.STAB_DEFENCE)
        protected = opponent_overhead == schema.PRAY_PROTECT_MELEE
        effective = np.maximum(
            1, np.floor(66 * exposure
                        * np.where(protected, 0.60, 1.0) + 0.5))
        ko = _soft_ko_risk(opp_hp, effective, 12)
        ko += np.where(
            ~protected & (recent_hit >= 20) & (opp_hp <= 72),
            0.07, 0.0)
        ko += np.where(opp_hp <= 48, 0.08, 0.0)
        ko -= np.where(
            (opp_hp >= 82) & (recent_hit < 20), 0.12, 0.0)
        ko = clamp01(ko)
        setup = (
            clamp01((70.0 - opp_hp) / 38.0) * 0.50
            + clamp01((recent_hit - 14.0) / 24.0) * 0.32
            + clamp01((exposure - 0.82) / 0.45) * 0.18)
        setup += np.where(
            (recent_hit >= 24) & (opp_hp <= 64), 0.10, 0.0)
        setup -= np.where(
            (recent_hit <= 8) & (opp_hp >= 68), 0.16, 0.0)
        setup = clamp01(setup * np.where(protected, 0.28, 1.0))
        credible = np.maximum(ko, setup * 0.84)
        credible += np.where(
            (recent_hit >= 20) & (opp_hp <= 70),
            0.08 + clamp01((recent_hit - 20.0) / 24.0) * 0.09,
            0.0)
        credible += np.where(
            ~protected & (exposure >= 1.04) & (opp_hp <= 72),
            clamp01((exposure - 1.0) / 0.32) * 0.08, 0.0)
        credible *= np.where(protected & (opp_hp > 40), 0.46, 1.0)
        credible *= np.where(
            (opp_hp >= 82) & (recent_hit < 18), 0.48, 1.0)
        credible = clamp01(credible)
        dry = np.where(
            (recent_hit < 18) & (opp_hp >= 64),
            1.45 * clamp01((opp_hp - 64.0) / 26.0)
            * (1.0 - setup) * 0.70,
            0.0)
        bonus = 0.10 + clamp01((spec_energy - 250.0) / 750.0) * 0.04
        score = (
            ko * 1.45 + credible * 0.90 + setup * 0.25 + bonus - dry)
        return ko, setup, score

    g_ko, g_setup, g_score = gmaul_features(False)
    d_ko, d_setup, _ = gmaul_features(True)
    v_ko, v_setup, v_score = voidwaker_features()
    l_ko, l_setup, l_score = vls_features()

    g_available = spec_reach_next & (spec_energy >= 500)
    ready_available = spec_reach_next & attack_ready
    v_available = ready_available & (spec_energy >= 500)
    # VLS cannot be one-ticked from a weapon that did not expose the special
    # controls at decision start.
    l_available = (
        ready_available
        & tick_start_spec_control
        & vls_available
        & (spec_energy >= 250))
    scores = np.stack([
        np.where(g_available, g_score, -np.inf),
        np.where(v_available, v_score, -np.inf),
        np.where(l_available, l_score, -np.inf),
    ], axis=1)
    selected = np.argmax(scores, axis=1)
    any_single = g_available | v_available | l_available
    single_ko = np.choose(selected, [g_ko, v_ko, l_ko])
    single_setup = np.choose(selected, [g_setup, v_setup, l_setup])
    single_ko = np.where(any_single & current_reach, single_ko, 0.0)
    single_setup = np.where(any_single, single_setup, 0.0)

    # Java resolves one best single-special kind first, then asks whether that
    # same weapon supports a double. VLS/Voidwaker therefore cannot expose the
    # granite-maul double flag merely because a maul remains in inventory.
    any_double = (
        any_single
        & (selected == 0)
        & spec_reach_next
        & (spec_energy >= 1000))
    double_ko = np.where(any_double & current_reach, d_ko, 0.0)
    double_setup = np.where(any_double, d_setup, 0.0)
    return (
        clamp01(single_ko), clamp01(double_ko),
        clamp01(single_setup), clamp01(double_setup),
        any_single, any_double)


def build(
        state, gear_tables, legal, rng=None, decision_tick=None) -> np.ndarray:
    """Return [n_fights * 2, 114] float64 inputs.

    `legal` is the LegalActions bundle from actions.py - the observation needs
    a few of the same "can I do this right now" answers the legal mask uses,
    so they are computed once and shared.
    """
    n = state.n_fights * 2
    out = np.zeros((n, schema.INPUT_SIZE), dtype=np.float64)
    if decision_tick is None:
        decision_ticks = np.repeat(state.tick, 2)
    else:
        decision_ticks = np.broadcast_to(
            np.asarray(decision_tick, dtype=np.int64), (n,))

    hp = _flat(state.hp)
    opp_hp = _flat(state.seen_opp_hp)
    dist = np.repeat(state.distance(), 2)

    rel_dx = _flat(state.rel_dx())
    rel_dy = _flat(state.rel_dy())

    out[:, schema.INPUT_DISTANCE] = clamp01(np.where(dist < 0, 0.0, dist / 12.0))
    out[:, schema.INPUT_SELF_HP] = clamp01(hp / 99.0)
    out[:, schema.INPUT_OPP_HP] = clamp01(np.where(opp_hp < 0, 0.0, opp_hp / 99.0))
    out[:, schema.INPUT_SELF_PRAYER_POINTS] = clamp01(_flat(state.prayer_points) / 99.0)
    out[:, schema.INPUT_SELF_FOOD_COUNT] = clamp01(_flat(state.food_count) / 28.0)
    # consumeAny iterates the 4/3/2/1-dose item ids in that order, so Java
    # spreads uses across every fullest bottle before lowering the next tier.
    # With three starting bottles, the occupied-item count is therefore the
    # smaller of three and the remaining dose count, not ceil(doses / 4).
    brew_items = np.minimum(
        START_BREW_ITEMS, _flat(state.brew_count))
    restore_items = np.minimum(
        START_RESTORE_ITEMS, _flat(state.restore_count))
    out[:, schema.INPUT_SELF_BREW_COUNT] = clamp01(brew_items / 8.0)
    out[:, schema.INPUT_SELF_RESTORE_COUNT] = clamp01(restore_items / 8.0)
    out[:, schema.INPUT_SELF_REBOOST_COUNT] = clamp01(_flat(state.reboost_count) / 8.0)

    out[:, schema.INPUT_CAN_ATTACK] = legal.can_attack.astype(np.float64)
    out[:, schema.INPUT_SELF_ATTACK_READY] = legal.attack_ready.astype(np.float64)
    # Written below with the same best-special resolution used by the KO/setup
    # features. Java's generic can-spec inputs are not granite-maul-only.

    self_frozen = _flat(state.freeze_ticks) > 0
    opp_frozen = _flat(state.seen_opp_frozen)
    out[:, schema.INPUT_SELF_FROZEN] = self_frozen.astype(np.float64)
    out[:, schema.INPUT_OPP_FROZEN] = opp_frozen.astype(np.float64)
    out[:, schema.INPUT_SELF_FREEZE_TICKS] = clamp01(
        _flat(state.freeze_ticks) / schema.FREEZE_TICKS_NORMALIZER)
    out[:, schema.INPUT_OPP_FREEZE_TICKS] = clamp01(
        _flat(state.seen_opp_freeze_ticks) / schema.FREEZE_TICKS_NORMALIZER)

    out[:, schema.INPUT_SELF_MOVING] = _flat(state.moving).astype(np.float64)
    out[:, schema.INPUT_OPP_MOVING] = _flat(
        state.seen_opp_moving).astype(np.float64)
    out[:, schema.INPUT_ATE_FOOD] = _flat(state.ate_food).astype(np.float64)
    out[:, schema.INPUT_DRANK_POTION] = _flat(state.drank_potion).astype(np.float64)

    out[:, schema.INPUT_REWARD_DELTA] = _flat(state.reward_delta)
    out[:, schema.INPUT_REWARD_DPS] = _flat(state.reward_dps)
    out[:, schema.INPUT_REWARD_TOTAL] = _flat(state.reward_total)

    out[:, schema.INPUT_LAST_DEALT_HIT] = clamp_signed(_flat(state.last_dealt_hit) / 40.0)
    out[:, schema.INPUT_LAST_TAKEN_HIT] = clamp_signed(_flat(state.last_taken_hit) / 40.0)

    spec_energy = _flat(state.special_energy)
    out[:, schema.INPUT_SELF_SPEC_ENERGY] = clamp01(spec_energy / 1000.0)
    # PlayerCombat.specialActive survives a decision until the queued attack
    # launches or updateWeapon invalidates it (PlayerCombat.java:3155-3156,
    # 3280-3282, 3323-3325). This is observable by the policy on the next tick.
    out[:, schema.INPUT_SELF_SPEC_ACTIVE] = (
        _flat(state.active_spec_kind) >= 0).astype(np.float64)

    out[:, schema.INPUT_SELF_DX] = clamp_signed(
        _flat(state.x - state.prev_x) / 4.0)
    out[:, schema.INPUT_SELF_DY] = clamp_signed(
        _flat(state.y - state.prev_y) / 4.0)
    out[:, schema.INPUT_OPP_DX] = clamp_signed(
        _flat(state.flip(state.x - state.prev_x)) / 4.0)
    out[:, schema.INPUT_OPP_DY] = clamp_signed(
        _flat(state.flip(state.y - state.prev_y)) / 4.0)

    out[:, schema.INPUT_TARGET_REL_DX] = clamp_signed(rel_dx / 16.0)
    out[:, schema.INPUT_TARGET_REL_DY] = clamp_signed(rel_dy / 16.0)
    out[:, schema.INPUT_TARGET_PRESENT] = 1.0  # always a target in a 1v1 batch

    # Five one-hot style blocks, in Java order.
    style = _flat(state.style)
    gear_style = gear.style_for_weapon(_flat(state.weapon_id))
    self_ammo = _flat(state.equipped_ids[:, :, gear.SLOT_AMMO])
    gear_style = np.where(
        (gear_style < 0) & (self_ammo > 0),
        schema.STYLE_RANGED,
        gear_style)
    opp_gear_style = gear.style_for_weapon(_flat(state.seen_opp_weapon_id))
    # Ammo cannot be unequipped by the current DMM direct-action schema.
    opp_gear_style = np.where(
        opp_gear_style < 0, schema.STYLE_RANGED, opp_gear_style)
    # captureObservation promotes a visible, reachable Voidwaker to MAGIC:
    # the special's hit style is magic even though the weapon itself is melee.
    # The client-side opponent-energy estimate remains 100% unless a gmaul
    # special was observed, so the DMM direct-action surface only needs the
    # source-backed weapon and reach checks here.
    opp_dx = np.abs(rel_dx)
    opp_dy = np.abs(rel_dy)
    opp_frozen = _flat(state.seen_opp_frozen)
    opp_voidwaker_reach = actions._melee_reach_now(
        opp_dx, opp_dy, opp_frozen, 1)
    visible_voidwaker_threat = (
        (_flat(state.seen_opp_weapon_id) == gear.VOIDWAKER.item_id)
        & opp_voidwaker_reach)
    opp_likely_style = np.where(
        visible_voidwaker_threat, schema.STYLE_MAGIC, opp_gear_style)
    worn = gear.equipment_bonuses(
        _flat(state.equipped_ids), gear_tables["item_bonus_lookup"])
    opp_worn = gear.equipment_bonuses(
        _flat(state.seen_opp_equipped_ids),
        gear_tables["item_bonus_lookup"])
    base = schema.INPUT_STYLE_BLOCK_BASE
    _one_hot_style(out, base + 0, gear_style)                  # selfLikelyStyle
    _one_hot_style(out, base + 3, style)                       # currentOffenceStyle
    _one_hot_style(
        out, base + 6, _scripted_fallback_style(
            state, gear_tables, rng=rng, worn=worn, opp_worn=opp_worn))
    _one_hot_style(out, base + 9, opp_likely_style)            # opponent likely
    _one_hot_style(out, base + 12, opp_gear_style)             # opponent gear

    # Overhead prayers as three bits each. -1 means no overhead.
    self_over = _flat(state.overhead)
    opp_over = _flat(state.seen_opp_overhead)
    out[:, schema.INPUT_SELF_PROTECT_MAGIC] = (self_over == schema.PRAY_PROTECT_MAGIC)
    out[:, schema.INPUT_SELF_PROTECT_RANGED] = (self_over == schema.PRAY_PROTECT_MISSILES)
    out[:, schema.INPUT_SELF_PROTECT_MELEE] = (self_over == schema.PRAY_PROTECT_MELEE)
    out[:, schema.INPUT_OPP_PROTECT_MAGIC] = (opp_over == schema.PRAY_PROTECT_MAGIC)
    out[:, schema.INPUT_OPP_PROTECT_RANGED] = (opp_over == schema.PRAY_PROTECT_MISSILES)
    out[:, schema.INPUT_OPP_PROTECT_MELEE] = (opp_over == schema.PRAY_PROTECT_MELEE)

    # Weapon ids are embedded as a sin/cos pair rather than a raw id.
    weapon = _flat(state.weapon_id).astype(np.float64)
    opp_weapon = _flat(state.seen_opp_weapon_id).astype(np.float64)
    freq = schema.WEAPON_EMBED_FREQ
    out[:, schema.INPUT_SELF_WEAPON_SIN] = np.where(weapon <= 0, 0.0, np.sin(weapon * freq))
    out[:, schema.INPUT_SELF_WEAPON_COS] = np.where(weapon <= 0, 0.0, np.cos(weapon * freq))
    out[:, schema.INPUT_OPP_WEAPON_SIN] = np.where(opp_weapon <= 0, 0.0, np.sin(opp_weapon * freq))
    out[:, schema.INPUT_OPP_WEAPON_COS] = np.where(opp_weapon <= 0, 0.0, np.cos(opp_weapon * freq))

    # The client-side Java estimate starts at 100% and only learns about
    # opponent granite-maul specs; Voidwaker/VLS use is deliberately hidden.
    # Gmaul is vanishingly rare in this DMM loadout, so 100% is the exact
    # estimate for all ordinary rows and avoids leaking the true opponent bar.
    out[:, schema.INPUT_OPP_SPEC_ENERGY_EST] = 1.0
    out[:, schema.INPUT_REWARD_EPISODE_ACTIVE] = 1.0

    # NhStakerSelfPlayManager.levelDeficit is signed (current-fixed)/40.
    live = [state.attack_level, state.strength_level, state.defence_level,
            state.ranged_level, state.magic_level]
    for offset, arr in enumerate(live):
        flat = _flat(arr).astype(np.float64)
        out[:, schema.INPUT_LEVEL_RATIO_BASE + offset] = clamp01(flat / 99.0)
        out[:, schema.INPUT_LEVEL_DEFICIT_BASE + offset] = clamp_signed(
            (flat - 99.0) / 40.0)

    out[:, schema.INPUT_MELEE_REACH] = legal.melee_reach_now.astype(np.float64)
    out[:, schema.INPUT_OPP_MELEE_REACH] = legal.opp_melee_reach_now.astype(np.float64)

    (single_ko, double_ko, single_setup, double_setup,
     can_spec_single, can_spec_double) = _special_observation_features(
        state, gear_tables, legal, opp_hp, spec_energy, opp_worn=opp_worn)
    out[:, schema.INPUT_CAN_SPEC_SINGLE] = can_spec_single.astype(np.float64)
    out[:, schema.INPUT_CAN_SPEC_DOUBLE] = can_spec_double.astype(np.float64)
    out[:, schema.INPUT_GMAUL_SINGLE_KO] = single_ko
    out[:, schema.INPUT_GMAUL_DOUBLE_KO] = double_ko
    out[:, schema.INPUT_GMAUL_SINGLE_SETUP] = single_setup
    out[:, schema.INPUT_GMAUL_DOUBLE_SETUP] = double_setup

    # Defence scores: how well the current gear resists each incoming style,
    # and how much better the best alternative set would be.
    current_scores = (
        worn[:, schema.MAGIC_DEFENCE].astype(np.float64),
        worn[:, schema.RANGE_DEFENCE].astype(np.float64),
        np.max(worn[:, [
            schema.STAB_DEFENCE,
            schema.SLASH_DEFENCE,
            schema.CRUSH_DEFENCE,
        ]], axis=1).astype(np.float64),
    )
    flex_gains = _flex_defence_gains(state, worn, gear_tables)
    for offset, (current, gain_index) in enumerate(zip(
        current_scores,
        (
            schema.INPUT_SELF_MAGIC_DEF_GAIN,
            schema.INPUT_SELF_RANGED_DEF_GAIN,
            schema.INPUT_SELF_MELEE_DEF_GAIN,
        ),
    )):
        out[:, schema.INPUT_SELF_MAGIC_DEF_SCORE + offset] = clamp_signed(
            (current - 70.0) / 140.0)
        out[:, gain_index] = flex_gains[:, offset]

    # Opponent weakness: the inverse view, using the gear we can see on them.
    opp_scores = (
        opp_worn[:, schema.MAGIC_DEFENCE].astype(np.float64),
        opp_worn[:, schema.RANGE_DEFENCE].astype(np.float64),
        # BotTickObservation deliberately exposes the opponent's slash
        # defence here, not the best of the three physical defences.
        opp_worn[:, schema.SLASH_DEFENCE].astype(np.float64),
    )
    for offset, current in enumerate(opp_scores):
        normalized = clamp_signed((current - 70.0) / 140.0)
        out[:, schema.INPUT_OPP_MAGIC_WEAKNESS + offset] = -normalized

    samples = _flat(state.style_sample_count)
    matches = _flat(state.style_match_count)
    safe = np.maximum(samples, 1.0)
    out[:, schema.INPUT_VISIBLE_STYLE_MATCH_RATE] = clamp01(matches / safe)
    out[:, schema.INPUT_VISIBLE_STYLE_MISMATCH_RATE] = clamp01((samples - matches) / safe)
    out[:, schema.INPUT_VISIBLE_STYLE_CONFIDENCE] = clamp01(samples / 12.0)
    out[:, schema.INPUT_VISIBLE_STYLE_LAST_OUTCOME] = clamp_signed(_flat(state.last_style_outcome))

    last_cast = _flat(state.flip(state.veng_trinket_last_cast_tick))
    remaining = (
        last_cast + schema.VENGEANCE_TRINKET_RECENT_TICKS_NORMALIZER
        - decision_ticks)
    out[:, schema.INPUT_OPP_VENG_TRINKET_RECENT] = np.where(
        last_cast < 0, 0.0,
        clamp01(remaining / float(schema.VENGEANCE_TRINKET_RECENT_TICKS_NORMALIZER)))
    out[:, schema.INPUT_OPP_VENG_TRINKET_CASTS] = clamp01(
        _flat(state.flip(state.veng_trinket_casts))
        / schema.VENGEANCE_TRINKET_CAST_COUNT_NORMALIZER)

    out[:, schema.INPUT_SELF_GMAUL_SPECS_USED] = clamp01(_flat(state.gmaul_specs_used) / 4.0)
    out[:, schema.INPUT_SELF_VOIDWAKER_SPECS_USED] = clamp01(_flat(state.voidwaker_specs_used) / 4.0)
    out[:, schema.INPUT_SELF_VLS_SPECS_USED] = clamp01(_flat(state.vls_specs_used) / 4.0)

    _one_hot_spec(out, schema.INPUT_LAST_SPEC_KIND_BASE, _flat(state.last_spec_kind))
    _one_hot_spec(out, schema.INPUT_PREV_SPEC_KIND_BASE, _flat(state.prev_spec_kind))

    out[:, schema.INPUT_TICKS_SINCE_LAST_SPEC] = clamp01(_flat(state.ticks_since_spec) / 100.0)
    out[:, schema.INPUT_SELF_SPEC_ENERGY_2] = clamp01(spec_energy / 1000.0)

    free_slots = _flat(state.inventory_free_slots)
    out[:, schema.INPUT_SELF_INVENTORY_FREE_SLOTS] = clamp01(
        np.maximum(0, free_slots) / 28.0)
    out[:, schema.INPUT_SELF_HAS_SHIELD] = _flat(state.has_shield).astype(np.float64)
    # canEquipTwoHandedWeaponFromCurrentState: no shield, or a free slot.
    out[:, schema.INPUT_CAN_EQUIP_TWO_HANDED] = (
        ~_flat(state.has_shield) | (free_slots > 0)).astype(np.float64)

    out[:, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK] = clamp01(
        np.maximum(1, _flat(state.opp_ticks_since_observed_attack))
        / schema.OPPONENT_OBSERVED_ATTACK_AGE_NORMALIZER)

    # The three tail slots the newer heads read by absolute index.
    out[:, schema.INPUT_SELF_ATTACK_DELAY_REMAINING] = clamp01(
        _flat(state.attack_delay) / schema.SELF_ATTACK_DELAY_REMAINING_NORMALIZER)
    # NhStakerBot captures this from the weapon worn at tick start, before the
    # decision's same-tick core weapon swap is applied.
    out[:, schema.INPUT_SELF_CLIENT_SPEC_CONTROL] = (
        gear.weapon_shows_special_bar(_flat(state.weapon_id))
        .astype(np.float64))
    optional_vls_setup_tick = _flat(state.optional_vls_setup_tick)
    out[:, schema.INPUT_SELF_OPTIONAL_VLS_SETUP_PENDING] = (
        (optional_vls_setup_tick >= 0)
        & (optional_vls_setup_tick == decision_ticks - 1)
    ).astype(np.float64)

    return out
