"""Fast matched policy screens using the source-backed FastSim engine.

This is intentionally evaluation-only. It records the primary live gates at
the exact attack-roll tick without writing multi-gigabyte rollout files.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from . import actions, engine, gear, schema, world_map


STYLE_NAMES = ("magic", "ranged", "melee")
PRAYER_NAMES = ("magic", "ranged", "melee", "none")


def _pct(part: float, whole: float) -> float | None:
    if whole <= 0:
        return None
    return round(100.0 * float(part) / float(whole), 3)


def _per_fight(value: float, fights: int) -> float | None:
    if fights <= 0:
        return None
    return round(float(value) / fights, 3)


@dataclass
class _PendingRoll:
    fired: np.ndarray
    styles: np.ndarray


class EvaluationCollector:
    """Vectorized roll-time and completed-fight metrics for one subject side."""

    def __init__(self, n_fights: int, subject_side: int):
        if subject_side not in (0, 1):
            raise ValueError("subject_side must be 0 or 1")
        self.n_fights = int(n_fights)
        self.subject_side = int(subject_side)
        self.opponent_side = 1 - self.subject_side

        self.outgoing_rolls = 0
        self.incoming_rolls = 0
        self.outgoing_styles = np.zeros(3, dtype=np.int64)
        self.incoming_styles = np.zeros(3, dtype=np.int64)
        self.incoming_correct = np.zeros(3, dtype=np.int64)
        self.opening_incoming_rolls = 0
        self.post_opening_incoming_rolls = 0
        self.post_opening_incoming_styles = np.zeros(3, dtype=np.int64)
        self.post_opening_incoming_correct = np.zeros(3, dtype=np.int64)
        self.active_prayers = np.zeros(4, dtype=np.int64)
        self.incoming_known_own_weapon_style = 0
        self.incoming_prayer_matches_own_weapon_style = 0
        self.incoming_style_differs_from_own_weapon = 0
        self.incoming_differing_prayer_matches_own_weapon = 0
        self.incoming_differing_prayer_correct = 0
        self.outgoing_off_prayer = 0
        self.outgoing_ordinary_melee_rolls = 0
        self.outgoing_ordinary_melee_protected = 0
        self.outgoing_ordinary_melee_visible_protect_melee = 0
        self.outgoing_ordinary_melee_visible_and_protected = 0
        self.outgoing_ordinary_melee_newly_protected = 0
        self.outgoing_vls_rolls = 0
        self.outgoing_vls_protected = 0
        self.outgoing_vls_visible_protect_melee = 0
        self.outgoing_vls_visible_and_protected = 0
        self.outgoing_vls_newly_protected = 0
        self.expected_outgoing = 0.0
        self.expected_incoming = 0.0
        self.actual_outgoing = 0.0
        self.actual_incoming = 0.0
        self.ordinary_zuriel_rolls = 0
        self.ordinary_zuriel_correct = 0
        self.zuriel_switch01_rolls = 0
        self.zuriel_switch01_correct = 0
        self.physical_robe_rolls = 0
        self.physical_robe_gmaul_rolls = 0
        self.physical_head_empty_rolls = 0
        self.physical_head_empty_gmaul_rolls = 0
        self.physical_full_offence_rolls = 0
        self.physical_full_offence_gmaul_rolls = 0
        self.safe_magic_gear = {
            "waiting": {
                "rolls": 0,
                "virtus_top": 0,
                "virtus_bottom": 0,
                "torva_legs": 0,
                "head_empty": 0,
                "elidinis_ward": 0,
                "dragonfire_shield": 0,
                "full_offence": 0,
                "full_offence_with_ward": 0,
            },
            "ready": {
                "rolls": 0,
                "virtus_top": 0,
                "virtus_bottom": 0,
                "torva_legs": 0,
                "head_empty": 0,
                "elidinis_ward": 0,
                "dragonfire_shield": 0,
                "full_offence": 0,
                "full_offence_with_ward": 0,
            },
        }

        # Standing underneath is useful only in context. Keep the broad
        # same-tile counts descriptive, then isolate the real frozen-opponent
        # window and whether a ready, free subject converts that window into a
        # legal route step plus an ordinary attack.
        self.all_same_tile_ticks = 0
        self.all_same_tile_cooldown_ticks = 0
        self.all_same_tile_ready_ticks = 0
        self.frozen_opponent_same_tile_ticks = 0
        self.frozen_opponent_cooldown_ticks = 0
        self.frozen_opponent_ready_ticks = 0
        self.legal_step_out_opportunities = 0
        self.legal_step_out_conversions = 0
        self._stand_under_world_tick = -1
        self._stand_under_legal_step_out = np.zeros(
            n_fights, dtype=bool)
        self._stand_under_subject_x = np.zeros(
            n_fights, dtype=np.int32)
        self._stand_under_subject_y = np.zeros(
            n_fights, dtype=np.int32)
        self._stand_under_conversion_recorded = np.zeros(
            n_fights, dtype=bool)

        # Prayer correctness at an incoming roll cannot reveal whether the
        # subject wasted Protect from Melee while a visibly frozen opponent
        # could not reach it. Track that exact decision state, plus recovery
        # when the staged freeze observation first clears.
        self.frozen_unreachable_ticks = np.zeros(4, dtype=np.int64)
        self.frozen_unreachable_protect_melee_ticks = np.zeros(
            4, dtype=np.int64)
        self.guaranteed_safe_v2_ticks = np.zeros(4, dtype=np.int64)
        self.guaranteed_safe_v2_protect_melee_ticks = np.zeros(
            4, dtype=np.int64)
        self.first_visible_thaw_ticks = 0
        self.first_visible_thaw_melee_reachable_ticks = 0
        self.first_visible_thaw_protect_melee_ticks = 0
        self.post_thaw_ticks = 0
        self.post_thaw_melee_reachable_ticks = 0
        self.post_thaw_protect_melee_ticks = 0
        self._freeze_timing_episode = np.full(
            n_fights, -1, dtype=np.int32)
        self._freeze_timing_previous_visible_frozen = np.zeros(
            n_fights, dtype=bool)
        self._freeze_timing_thaw_age = np.full(
            n_fights, -1, dtype=np.int32)
        self._freeze_timing_pending_frozen_unreachable = np.zeros(
            (4, n_fights), dtype=bool)
        self._freeze_timing_pending_guaranteed_safe_v2 = np.zeros(
            (4, n_fights), dtype=bool)
        self._freeze_timing_pending_overhead = np.full(
            n_fights, -1, dtype=np.int32)
        self._freeze_timing_result_pending = False

        self.prayer_switches = 0
        self.prayer_transitions = 0
        self.longest_prayer_count = 0
        self.longest_prayer_span = 0
        self.longest_prayer = -1
        self._hold_episode = np.full(n_fights, -1, dtype=np.int32)
        self._hold_prayer = np.full(n_fights, -2, dtype=np.int32)
        self._hold_count = np.zeros(n_fights, dtype=np.int32)
        self._hold_start = np.full(n_fights, -1, dtype=np.int64)

        self.gear_switches = 0
        self.gear_transitions = 0
        self._gear_episode = np.full(n_fights, -1, dtype=np.int32)
        self._gear_state = np.full((n_fights, 3), -2, dtype=np.int32)

        self.fast_style_switch_off_prayer = 0
        self._last_incoming_style = np.full(n_fights, -1, dtype=np.int32)
        self._last_incoming_tick = np.full(n_fights, -1000, dtype=np.int64)
        self._last_incoming_episode = np.full(n_fights, -1, dtype=np.int32)
        self._first_incoming_tick = np.full(
            n_fights, -1, dtype=np.int64)
        self._first_incoming_episode = np.full(
            n_fights, -1, dtype=np.int32)

        self.completed_fights = 0
        self.wins = 0
        self.losses = 0
        self.draws = 0
        self.damage_dealt = 0.0
        self.damage_taken = 0.0
        self.lane_envelope_excursions = 0
        self.outside_cached_map_samples = 0
        self.max_origin_distance = 0

    @staticmethod
    def _count_styles(values: np.ndarray, active: np.ndarray) -> np.ndarray:
        return np.asarray([
            np.count_nonzero(active & (values == style))
            for style in range(3)
        ], dtype=np.int64)

    def begin_roll(
            self,
            state,
            fired: np.ndarray,
            styles: np.ndarray,
            protected: np.ndarray,
            effective_overhead: np.ndarray,
            world_tick: int,
            weapon_switch_ticks: np.ndarray,
            decision_attack_delay: np.ndarray | None = None,
            spec_kind: int | None = None) -> _PendingRoll:
        subject = self.subject_side
        opponent = self.opponent_side
        outgoing = np.asarray(fired[:, subject], dtype=bool)
        incoming = np.asarray(fired[:, opponent], dtype=bool)
        outgoing_styles = np.asarray(styles[:, subject], dtype=np.int32)
        incoming_styles = np.asarray(styles[:, opponent], dtype=np.int32)
        outgoing_protected = np.asarray(
            protected[:, subject], dtype=bool)
        incoming_protected = np.asarray(
            protected[:, opponent], dtype=bool)

        if (
                spec_kind is None
                and self._stand_under_world_tick == int(world_tick)):
            moved_self = (
                (np.asarray(state.x[:, subject], dtype=np.int32)
                 != self._stand_under_subject_x)
                | (np.asarray(state.y[:, subject], dtype=np.int32)
                   != self._stand_under_subject_y))
            separated = (
                (state.x[:, subject] != state.x[:, opponent])
                | (state.y[:, subject] != state.y[:, opponent]))
            converted = (
                outgoing
                & self._stand_under_legal_step_out
                & moved_self
                & separated
                & ~self._stand_under_conversion_recorded)
            self.legal_step_out_conversions += int(np.count_nonzero(
                converted))
            self._stand_under_conversion_recorded |= converted

        self.outgoing_rolls += int(np.count_nonzero(outgoing))
        self.incoming_rolls += int(np.count_nonzero(incoming))
        self.outgoing_styles += self._count_styles(
            outgoing_styles, outgoing)
        self.incoming_styles += self._count_styles(
            incoming_styles, incoming)
        for style in range(3):
            self.incoming_correct[style] += int(np.count_nonzero(
                incoming & (incoming_styles == style)
                & incoming_protected))
        self.outgoing_off_prayer += int(np.count_nonzero(
            outgoing & ~outgoing_protected))
        outgoing_melee = outgoing & (
            outgoing_styles == schema.STYLE_MELEE)
        if spec_kind == schema.SPEC_VESTA_LONGSWORD:
            self.outgoing_vls_rolls += int(np.count_nonzero(
                outgoing_melee))
            self.outgoing_vls_protected += int(np.count_nonzero(
                outgoing_melee & outgoing_protected))
            visible_protect_melee = (
                np.asarray(
                    state.seen_opp_overhead[:, subject],
                    dtype=np.int32)
                == schema.PRAY_PROTECT_MELEE)
            self.outgoing_vls_visible_protect_melee += int(
                np.count_nonzero(outgoing_melee & visible_protect_melee))
            self.outgoing_vls_visible_and_protected += int(
                np.count_nonzero(
                    outgoing_melee
                    & visible_protect_melee
                    & outgoing_protected))
            self.outgoing_vls_newly_protected += int(
                np.count_nonzero(
                    outgoing_melee
                    & ~visible_protect_melee
                    & outgoing_protected))
        elif spec_kind is None:
            self.outgoing_ordinary_melee_rolls += int(np.count_nonzero(
                outgoing_melee))
            self.outgoing_ordinary_melee_protected += int(np.count_nonzero(
                outgoing_melee & outgoing_protected))
            if np.any(outgoing_melee):
                visible_protect_melee = (
                    np.asarray(
                        state.seen_opp_overhead[:, subject],
                        dtype=np.int32)
                    == schema.PRAY_PROTECT_MELEE)
                self.outgoing_ordinary_melee_visible_protect_melee += int(
                    np.count_nonzero(
                        outgoing_melee & visible_protect_melee))
                self.outgoing_ordinary_melee_visible_and_protected += int(
                    np.count_nonzero(
                        outgoing_melee
                        & visible_protect_melee
                        & outgoing_protected))
                self.outgoing_ordinary_melee_newly_protected += int(
                    np.count_nonzero(
                        outgoing_melee
                        & ~visible_protect_melee
                        & outgoing_protected))

        subject_prayer = np.asarray(
            effective_overhead[:, subject], dtype=np.int32)
        prayer_bucket = np.where(
            (subject_prayer >= schema.PRAY_PROTECT_MAGIC)
            & (subject_prayer <= schema.PRAY_PROTECT_MELEE),
            subject_prayer - schema.PRAY_PROTECT_MAGIC,
            3)
        for prayer in range(4):
            self.active_prayers[prayer] += int(np.count_nonzero(
                incoming & (prayer_bucket == prayer)))
        subject_weapon_style = gear.style_for_weapon(
            np.asarray(state.weapon_id[:, subject], dtype=np.int32))
        own_style_known = (
            (subject_weapon_style >= schema.STYLE_MAGIC)
            & (subject_weapon_style <= schema.STYLE_MELEE))
        incoming_with_known_own_style = incoming & own_style_known
        incoming_style_differs = (
            incoming_with_known_own_style
            & (incoming_styles != subject_weapon_style))
        prayer_matches_own_style = (
            prayer_bucket == subject_weapon_style)
        self.incoming_known_own_weapon_style += int(np.count_nonzero(
            incoming_with_known_own_style))
        self.incoming_prayer_matches_own_weapon_style += int(
            np.count_nonzero(
                incoming_with_known_own_style
                & prayer_matches_own_style))
        self.incoming_style_differs_from_own_weapon += int(np.count_nonzero(
            incoming_style_differs))
        self.incoming_differing_prayer_matches_own_weapon += int(
            np.count_nonzero(
                incoming_style_differs & prayer_matches_own_style))
        self.incoming_differing_prayer_correct += int(np.count_nonzero(
            incoming_style_differs & incoming_protected))

        opponent_weapon = np.asarray(
            state.weapon_id[:, opponent], dtype=np.int32)
        zuriel = (
            incoming
            & (incoming_styles == schema.STYLE_MAGIC)
            & (opponent_weapon == gear.ZURIELS_STAFF.item_id))
        self.ordinary_zuriel_rolls += int(np.count_nonzero(zuriel))
        self.ordinary_zuriel_correct += int(np.count_nonzero(
            zuriel & incoming_protected))
        switch_age = int(world_tick) - weapon_switch_ticks[:, opponent]
        zuriel_switch = zuriel & (switch_age >= 0) & (switch_age <= 1)
        self.zuriel_switch01_rolls += int(np.count_nonzero(zuriel_switch))
        self.zuriel_switch01_correct += int(np.count_nonzero(
            zuriel_switch & incoming_protected))

        subject_gear = state.equipped_ids[:, subject]
        subject_weapon = np.asarray(
            state.weapon_id[:, subject], dtype=np.int32)
        ordinary_magic = (
            outgoing
            & (outgoing_styles == schema.STYLE_MAGIC)
            & (subject_weapon == gear.ZURIELS_STAFF.item_id)
            & (spec_kind is None))
        # Supply actions execute after the policy decision and can add three
        # ticks to attack_delay. Bucket safety from the timer both policies
        # actually observed before those same-tick actions, not the later
        # supply-mutated combat state.
        attack_delay = (
            state.attack_delay
            if decision_attack_delay is None
            else decision_attack_delay
        )
        defender_waiting = np.asarray(
            attack_delay[:, opponent], dtype=np.int32) > 0
        virtus_top = (
            subject_gear[:, gear.SLOT_CHEST]
            == gear.VIRTUS_ROBE_TOP.item_id)
        virtus_bottom = (
            subject_gear[:, gear.SLOT_LEGS]
            == gear.VIRTUS_ROBE_BOTTOM.item_id)
        head_empty = subject_gear[:, gear.SLOT_HAT] < 0
        elidinis_ward = (
            subject_gear[:, gear.SLOT_SHIELD]
            == gear.ELIDINIS_WARD_F.item_id)
        dragonfire_shield = (
            subject_gear[:, gear.SLOT_SHIELD]
            == gear.DRAGONFIRE_SHIELD.item_id)
        full_offence = virtus_top & virtus_bottom & head_empty
        full_offence_with_ward = full_offence & elidinis_ward
        for bucket, active in (
                ("waiting", ordinary_magic & defender_waiting),
                ("ready", ordinary_magic & ~defender_waiting)):
            metrics = self.safe_magic_gear[bucket]
            metrics["rolls"] += int(np.count_nonzero(active))
            metrics["virtus_top"] += int(np.count_nonzero(
                active & virtus_top))
            metrics["virtus_bottom"] += int(np.count_nonzero(
                active & virtus_bottom))
            metrics["torva_legs"] += int(np.count_nonzero(
                active
                & (subject_gear[:, gear.SLOT_LEGS]
                   == gear.TORVA_PLATELEGS.item_id)))
            metrics["head_empty"] += int(np.count_nonzero(
                active & head_empty))
            metrics["elidinis_ward"] += int(np.count_nonzero(
                active & elidinis_ward))
            metrics["dragonfire_shield"] += int(np.count_nonzero(
                active & dragonfire_shield))
            metrics["full_offence"] += int(np.count_nonzero(
                active & full_offence))
            metrics["full_offence_with_ward"] += int(np.count_nonzero(
                active & full_offence_with_ward))
        robe = (
            virtus_top | virtus_bottom)
        physical = incoming & (
            (incoming_styles == schema.STYLE_RANGED)
            | (incoming_styles == schema.STYLE_MELEE))
        gmaul = spec_kind in (
            schema.SPEC_GRANITE_MAUL,
            schema.SPEC_GRANITE_MAUL_DOUBLE,
        )
        physical_robe = physical & robe
        physical_head_empty = physical & head_empty
        physical_full_offence = physical & full_offence
        self.physical_robe_rolls += int(np.count_nonzero(physical_robe))
        self.physical_head_empty_rolls += int(np.count_nonzero(
            physical_head_empty))
        self.physical_full_offence_rolls += int(np.count_nonzero(
            physical_full_offence))
        if gmaul:
            self.physical_robe_gmaul_rolls += int(np.count_nonzero(
                physical_robe))
            self.physical_head_empty_gmaul_rolls += int(np.count_nonzero(
                physical_head_empty))
            self.physical_full_offence_gmaul_rolls += int(np.count_nonzero(
                physical_full_offence))

        episodes = np.asarray(
            state.episode_id[:, subject], dtype=np.int32)
        same_episode = self._first_incoming_episode == episodes
        opening = incoming & (
            ~same_episode
            | (self._first_incoming_tick == int(world_tick)))
        post_opening = incoming & ~opening
        first_in_episode = incoming & ~same_episode
        self._first_incoming_episode[first_in_episode] = episodes[
            first_in_episode]
        self._first_incoming_tick[first_in_episode] = int(world_tick)
        self.opening_incoming_rolls += int(np.count_nonzero(opening))
        self.post_opening_incoming_rolls += int(np.count_nonzero(
            post_opening))
        self.post_opening_incoming_styles += self._count_styles(
            incoming_styles, post_opening)
        for style in range(3):
            self.post_opening_incoming_correct[style] += int(
                np.count_nonzero(
                    post_opening
                    & (incoming_styles == style)
                    & incoming_protected))
        incoming_indexes = np.flatnonzero(incoming)
        for fight_index in incoming_indexes:
            prayer = int(prayer_bucket[fight_index])
            episode = int(episodes[fight_index])
            if self._hold_episode[fight_index] != episode:
                self._hold_episode[fight_index] = episode
                self._hold_prayer[fight_index] = prayer
                self._hold_count[fight_index] = 1
                self._hold_start[fight_index] = int(world_tick)
            else:
                self.prayer_transitions += 1
                if self._hold_prayer[fight_index] == prayer:
                    self._hold_count[fight_index] += 1
                else:
                    self.prayer_switches += 1
                    self._hold_prayer[fight_index] = prayer
                    self._hold_count[fight_index] = 1
                    self._hold_start[fight_index] = int(world_tick)
            count = int(self._hold_count[fight_index])
            span = int(world_tick) - int(self._hold_start[fight_index])
            if (
                    count > self.longest_prayer_count
                    or (
                        count == self.longest_prayer_count
                        and span > self.longest_prayer_span)):
                self.longest_prayer_count = count
                self.longest_prayer_span = span
                self.longest_prayer = prayer

            gear_state = subject_gear[
                fight_index,
                [gear.SLOT_CHEST, gear.SLOT_LEGS, gear.SLOT_SHIELD]]
            if self._gear_episode[fight_index] != episode:
                self._gear_episode[fight_index] = episode
            else:
                self.gear_transitions += 1
                if np.any(self._gear_state[fight_index] != gear_state):
                    self.gear_switches += 1
            self._gear_state[fight_index] = gear_state

            previous_style = int(self._last_incoming_style[fight_index])
            previous_tick = int(self._last_incoming_tick[fight_index])
            previous_episode = int(
                self._last_incoming_episode[fight_index])
            if (
                    previous_episode == episode
                    and previous_style >= 0
                    and previous_style != int(incoming_styles[fight_index])
                    and int(world_tick) - previous_tick <= 1
                    and not bool(incoming_protected[fight_index])):
                self.fast_style_switch_off_prayer += 1
            self._last_incoming_style[fight_index] = (
                incoming_styles[fight_index])
            self._last_incoming_tick[fight_index] = int(world_tick)
            self._last_incoming_episode[fight_index] = episode

        return _PendingRoll(
            fired=np.asarray(fired, dtype=bool).copy(),
            styles=np.asarray(styles, dtype=np.int32).copy())

    def add_expected(
            self, pending: _PendingRoll | None,
            expected_damage: np.ndarray) -> None:
        if pending is None:
            return
        expected = np.asarray(expected_damage, dtype=np.float64)
        subject = self.subject_side
        opponent = self.opponent_side
        self.expected_outgoing += float(np.sum(
            expected[:, subject], where=pending.fired[:, subject]))
        self.expected_incoming += float(np.sum(
            expected[:, opponent], where=pending.fired[:, opponent]))

    def add_actual(
            self, pending: _PendingRoll | None,
            damage: np.ndarray) -> None:
        if pending is None:
            return
        actual = np.asarray(damage, dtype=np.float64)
        subject = self.subject_side
        opponent = self.opponent_side
        self.actual_outgoing += float(np.sum(
            actual[:, subject], where=pending.fired[:, subject]))
        self.actual_incoming += float(np.sum(
            actual[:, opponent], where=pending.fired[:, opponent]))

    def episode_end(self, state, newly_finished: np.ndarray) -> None:
        indexes = np.flatnonzero(newly_finished)
        if len(indexes) == 0:
            return
        subject = self.subject_side
        opponent = self.opponent_side
        dead = state.hp <= 0
        subject_dead = dead[indexes, subject]
        opponent_dead = dead[indexes, opponent]
        self.completed_fights += len(indexes)
        self.wins += int(np.count_nonzero(opponent_dead & ~subject_dead))
        self.losses += int(np.count_nonzero(subject_dead & ~opponent_dead))
        self.draws += int(np.count_nonzero(subject_dead == opponent_dead))
        self.damage_dealt += float(np.sum(
            state.damage_dealt[indexes, subject]))
        self.damage_taken += float(np.sum(
            state.damage_taken[indexes, subject]))

    def observe_positions(self, state) -> None:
        distance = np.maximum(
            np.abs(state.x - state.origin_x),
            np.abs(state.y - state.origin_y))
        active = np.asarray(state.alive, dtype=bool)[:, None]
        if np.any(active):
            self.max_origin_distance = max(
                self.max_origin_distance,
                int(np.max(distance, where=active, initial=0)))
        outside = (
            (state.x < state.lane_min_x[:, None])
            | (state.x > state.lane_max_x[:, None])
            | (state.y < state.lane_min_y[:, None])
            | (state.y > state.lane_max_y[:, None]))
        # TargetRoute chase movement is deliberately exempt from the direct
        # movement lane/origin boundary in both Java and FastSim. Record those
        # excursions descriptively, but gate only impossible/off-map state.
        self.lane_envelope_excursions += int(np.count_nonzero(
            outside & active))
        self.outside_cached_map_samples += int(np.count_nonzero(
            ~world_map.SELF_PLAY_MAP._inside(state.x, state.y)
            & active))

    def observe_decision_tick(self, state, world_tick: int) -> None:
        """Record same-tile timing from the exact pre-action decision state."""
        subject = self.subject_side
        opponent = self.opponent_side
        active = (
            np.asarray(state.alive, dtype=bool)
            & (state.hp[:, subject] > 0)
            & (state.hp[:, opponent] > 0))
        same_tile = (
            active
            & (state.x[:, subject] == state.x[:, opponent])
            & (state.y[:, subject] == state.y[:, opponent]))
        ready = np.asarray(
            state.attack_delay[:, subject], dtype=np.int32) <= 0
        cooling_down = ~ready
        frozen_opponent = (
            np.asarray(
                state.freeze_ticks[:, opponent], dtype=np.int32) > 0)
        frozen_same_tile = same_tile & frozen_opponent

        self.all_same_tile_ticks += int(np.count_nonzero(same_tile))
        self.all_same_tile_cooldown_ticks += int(np.count_nonzero(
            same_tile & cooling_down))
        self.all_same_tile_ready_ticks += int(np.count_nonzero(
            same_tile & ready))
        self.frozen_opponent_same_tile_ticks += int(np.count_nonzero(
            frozen_same_tile))
        self.frozen_opponent_cooldown_ticks += int(np.count_nonzero(
            frozen_same_tile & cooling_down))
        self.frozen_opponent_ready_ticks += int(np.count_nonzero(
            frozen_same_tile & ready))

        # FastSim's overlapping TargetRoute takes its first legal route-out
        # step west. An opportunity therefore requires that exact step, a free
        # subject, and a ready ordinary timer. Choosing an explicit tile move
        # still consumes the tick; only an actual ordinary roll records a
        # conversion later in begin_roll().
        step_x = np.asarray(
            state.x[:, subject], dtype=np.int32) - 1
        step_y = np.asarray(
            state.y[:, subject], dtype=np.int32)
        route_step_legal = world_map.SELF_PLAY_MAP.cached_step_allowed(
            state.x[:, subject],
            state.y[:, subject],
            step_x,
            step_y)
        legal_step_out = (
            frozen_same_tile
            & ready
            & (state.freeze_ticks[:, subject] <= 0)
            & (state.lock_ticks[:, subject] <= 0)
            & route_step_legal)
        self.legal_step_out_opportunities += int(np.count_nonzero(
            legal_step_out))
        self._stand_under_world_tick = int(world_tick)
        self._stand_under_legal_step_out = np.asarray(
            legal_step_out, dtype=bool).copy()
        self._stand_under_subject_x = np.asarray(
            state.x[:, subject], dtype=np.int32).copy()
        self._stand_under_subject_y = np.asarray(
            state.y[:, subject], dtype=np.int32).copy()
        self._stand_under_conversion_recorded[:] = False

        # Use only the staged opponent information available to the policy.
        # Reach deliberately matches the runtime's standing-range plus
        # two-substep unfrozen drag-in rule.
        visible_frozen = np.asarray(
            state.seen_opp_frozen[:, subject], dtype=bool)
        visible_freeze_ticks = np.asarray(
            state.seen_opp_freeze_ticks[:, subject], dtype=np.int32)
        visible_weapon = np.asarray(
            state.seen_opp_weapon_id[:, subject], dtype=np.int32)
        relative_x = (
            np.asarray(state.x[:, opponent], dtype=np.int32)
            - np.asarray(state.x[:, subject], dtype=np.int32))
        relative_y = (
            np.asarray(state.y[:, opponent], dtype=np.int32)
            - np.asarray(state.y[:, subject], dtype=np.int32))
        visible_melee_reach = actions._melee_reach_now(
            relative_x,
            relative_y,
            visible_frozen,
            gear.melee_standing_range(visible_weapon))
        protect_melee = (
            np.asarray(state.overhead[:, subject], dtype=np.int32)
            == schema.PRAY_PROTECT_MELEE)

        frozen_unreachable = (
            active & visible_frozen & ~visible_melee_reach)
        countdown_buckets = (
            frozen_unreachable,
            frozen_unreachable & (visible_freeze_ticks > 5),
            frozen_unreachable
            & (visible_freeze_ticks > 1)
            & (visible_freeze_ticks <= 5),
            frozen_unreachable
            & (visible_freeze_ticks > 0)
            & (visible_freeze_ticks <= 1),
        )
        self_freeze_ticks = np.asarray(
            state.freeze_ticks[:, subject], dtype=np.int32)
        dx = np.abs(relative_x)
        dy = np.abs(relative_y)
        movable_decisions = np.clip(2 - self_freeze_ticks, 0, 2)
        guaranteed_safe_threshold = 2 + 2 * movable_decisions
        guaranteed_safe_v2 = (
            active
            & visible_frozen
            & (visible_freeze_ticks > 1)
            & (
                (
                    (dx == 0)
                    & (dy == 0)
                    & (self_freeze_ticks >= 2)
                )
                | (dx > guaranteed_safe_threshold)
                | (dy > guaranteed_safe_threshold)
            )
        )
        guaranteed_safe_v2_buckets = (
            guaranteed_safe_v2,
            guaranteed_safe_v2 & (visible_freeze_ticks > 5),
            guaranteed_safe_v2
            & (visible_freeze_ticks > 1)
            & (visible_freeze_ticks <= 5),
            guaranteed_safe_v2
            & (visible_freeze_ticks > 0)
            & (visible_freeze_ticks <= 1),
        )
        # The frozen/unreachable metric is about the protection prayer this
        # decision produces, not the prayer that happened to be active when
        # the decision began. Save the exact pre-action context here and
        # consume it after the defence action has been selected.
        for index, bucket in enumerate(countdown_buckets):
            self._freeze_timing_pending_frozen_unreachable[index] = bucket
        for index, bucket in enumerate(guaranteed_safe_v2_buckets):
            self._freeze_timing_pending_guaranteed_safe_v2[index] = bucket
        self._freeze_timing_pending_overhead[:] = np.asarray(
            state.overhead[:, subject], dtype=np.int32)
        self._freeze_timing_result_pending = True

        episode = np.asarray(
            state.episode_id[:, subject], dtype=np.int32)
        new_episode = episode != self._freeze_timing_episode
        thawed_now = (
            active
            & ~new_episode
            & self._freeze_timing_previous_visible_frozen
            & ~visible_frozen)
        visible_melee_weapon = (
            gear.style_for_weapon(visible_weapon) == schema.STYLE_MELEE)
        melee_reachable = visible_melee_weapon & visible_melee_reach

        self.first_visible_thaw_ticks += int(np.count_nonzero(thawed_now))
        first_thaw_melee = thawed_now & melee_reachable
        self.first_visible_thaw_melee_reachable_ticks += int(
            np.count_nonzero(first_thaw_melee))
        self.first_visible_thaw_protect_melee_ticks += int(
            np.count_nonzero(first_thaw_melee & protect_melee))

        # The boundary itself is reported above. This bucket covers the next
        # three decisions, so it measures whether melee protection recovers
        # promptly once drag-in attacks are visibly possible again.
        post_thaw = (
            active
            & ~new_episode
            & ~visible_frozen
            & (self._freeze_timing_thaw_age >= 0)
            & (self._freeze_timing_thaw_age < 3))
        self.post_thaw_ticks += int(np.count_nonzero(post_thaw))
        post_thaw_melee = post_thaw & melee_reachable
        self.post_thaw_melee_reachable_ticks += int(
            np.count_nonzero(post_thaw_melee))
        self.post_thaw_protect_melee_ticks += int(
            np.count_nonzero(post_thaw_melee & protect_melee))

        continuing_thaw = (
            active
            & ~new_episode
            & ~visible_frozen
            & ~thawed_now
            & (self._freeze_timing_thaw_age >= 0))
        self._freeze_timing_thaw_age[active & (new_episode | visible_frozen)] = -1
        self._freeze_timing_thaw_age[thawed_now] = 0
        self._freeze_timing_thaw_age[continuing_thaw] += 1
        self._freeze_timing_episode[active] = episode[active]
        self._freeze_timing_previous_visible_frozen[active] = (
            visible_frozen[active])

    def observe_resulting_defence_prayer(
            self, defence_action: np.ndarray) -> None:
        """Record frozen/unreachable prayer from this decision's result.

        Protect Magic/Missiles/Melee replaces the active protection. Smite and
        Redemption do not select a new protection prayer for this metric, so
        they retain the protection that was active at decision start.
        """
        if not self._freeze_timing_result_pending:
            raise RuntimeError(
                "resulting defence prayer observed without a decision state")

        selected = np.asarray(defence_action, dtype=np.int32)
        if selected.shape == (self.n_fights, 2):
            selected = selected[:, self.subject_side]
        elif selected.shape == (self.n_fights * 2,):
            selected = selected.reshape(self.n_fights, 2)[
                :, self.subject_side]
        else:
            raise ValueError(
                "defence_action must have shape "
                f"({self.n_fights}, 2) or ({self.n_fights * 2},)")

        prayer = selected - schema.DEFENCE_BASE
        if np.any((prayer < 0) | (prayer >= schema.DEFENCE_COUNT)):
            raise ValueError("defence_action contains a non-defence action")
        selects_protection = (
            (prayer >= schema.PRAY_PROTECT_MAGIC)
            & (prayer <= schema.PRAY_PROTECT_MELEE))
        resulting_protection = np.where(
            selects_protection,
            prayer,
            self._freeze_timing_pending_overhead)
        protect_melee = (
            resulting_protection == schema.PRAY_PROTECT_MELEE)

        for index, bucket in enumerate(
                self._freeze_timing_pending_frozen_unreachable):
            self.frozen_unreachable_ticks[index] += int(
                np.count_nonzero(bucket))
            self.frozen_unreachable_protect_melee_ticks[index] += int(
                np.count_nonzero(bucket & protect_melee))
        for index, bucket in enumerate(
                self._freeze_timing_pending_guaranteed_safe_v2):
            self.guaranteed_safe_v2_ticks[index] += int(
                np.count_nonzero(bucket))
            self.guaranteed_safe_v2_protect_melee_ticks[index] += int(
                np.count_nonzero(bucket & protect_melee))
        self._freeze_timing_result_pending = False

    def report(self) -> dict:
        incoming_by_style = {}
        post_opening_by_style = {}
        for style, name in enumerate(STYLE_NAMES):
            count = int(self.incoming_styles[style])
            correct = int(self.incoming_correct[style])
            incoming_by_style[name] = {
                "rolls": count,
                "correct": correct,
                "correctPct": _pct(correct, count),
            }
            post_opening_count = int(
                self.post_opening_incoming_styles[style])
            post_opening_correct = int(
                self.post_opening_incoming_correct[style])
            post_opening_by_style[name] = {
                "rolls": post_opening_count,
                "correct": post_opening_correct,
                "correctPct": _pct(
                    post_opening_correct, post_opening_count),
            }
        prayer_name = (
            PRAYER_NAMES[self.longest_prayer]
            if 0 <= self.longest_prayer < len(PRAYER_NAMES)
            else "none")
        expected_gap = self.expected_outgoing - self.expected_incoming
        actual_gap = self.actual_outgoing - self.actual_incoming
        magic_gear = {}
        for bucket, metrics in self.safe_magic_gear.items():
            rolls = metrics["rolls"]
            magic_gear[bucket] = {
                "rolls": rolls,
                "virtusTopRolls": metrics["virtus_top"],
                "virtusTopPct": _pct(metrics["virtus_top"], rolls),
                "virtusBottomRolls": metrics["virtus_bottom"],
                "virtusBottomPct": _pct(metrics["virtus_bottom"], rolls),
                "torvaPlatelegsRolls": metrics["torva_legs"],
                "torvaPlatelegsPct": _pct(metrics["torva_legs"], rolls),
                "headUnequippedRolls": metrics["head_empty"],
                "headUnequippedPct": _pct(metrics["head_empty"], rolls),
                "elidinisWardRolls": metrics["elidinis_ward"],
                "elidinisWardPct": _pct(metrics["elidinis_ward"], rolls),
                "dragonfireShieldRolls": metrics["dragonfire_shield"],
                "dragonfireShieldPct": _pct(
                    metrics["dragonfire_shield"], rolls),
                "fullOffenceRolls": metrics["full_offence"],
                "fullOffencePct": _pct(metrics["full_offence"], rolls),
                "fullOffenceWithWardRolls": (
                    metrics["full_offence_with_ward"]),
                "fullOffenceWithWardPct": _pct(
                    metrics["full_offence_with_ward"], rolls),
            }
        return {
            "completedFights": self.completed_fights,
            "wins": self.wins,
            "losses": self.losses,
            "draws": self.draws,
            "totalDamageDealt": round(self.damage_dealt, 6),
            "totalDamageTaken": round(self.damage_taken, 6),
            "averageDamageDealt": _per_fight(
                self.damage_dealt, self.completed_fights),
            "averageDamageTaken": _per_fight(
                self.damage_taken, self.completed_fights),
            "outgoingAttackRolls": self.outgoing_rolls,
            "incomingAttackRolls": self.incoming_rolls,
            "outgoingStyleSpread": {
                name: int(self.outgoing_styles[index])
                for index, name in enumerate(STYLE_NAMES)
            },
            "incomingStyleSpread": {
                name: int(self.incoming_styles[index])
                for index, name in enumerate(STYLE_NAMES)
            },
            "expectedOutgoingDamage": round(self.expected_outgoing, 6),
            "expectedIncomingDamage": round(self.expected_incoming, 6),
            "expectedDamageGap": round(expected_gap, 6),
            "expectedDamageGapPerFight": _per_fight(
                expected_gap, self.completed_fights),
            "actualOutgoingRollDamage": round(self.actual_outgoing, 6),
            "actualIncomingRollDamage": round(self.actual_incoming, 6),
            "actualRollDamageGap": round(actual_gap, 6),
            "actualRollDamageGapPerFight": _per_fight(
                actual_gap, self.completed_fights),
            "outgoingOffPrayerRollPct": _pct(
                self.outgoing_off_prayer, self.outgoing_rolls),
            "outgoingMeleeIntoProtectMelee": {
                "ordinary": {
                    "rolls": self.outgoing_ordinary_melee_rolls,
                    "protected": self.outgoing_ordinary_melee_protected,
                    "protectedPct": _pct(
                        self.outgoing_ordinary_melee_protected,
                        self.outgoing_ordinary_melee_rolls),
                    "visibleProtectMeleeAtDecision": (
                        self.outgoing_ordinary_melee_visible_protect_melee),
                    "visibleAndProtectedAtRoll": (
                        self.outgoing_ordinary_melee_visible_and_protected),
                    "protectedNotVisibleAtDecision": (
                        self.outgoing_ordinary_melee_newly_protected),
                },
                "vls": {
                    "rolls": self.outgoing_vls_rolls,
                    "protected": self.outgoing_vls_protected,
                    "protectedPct": _pct(
                        self.outgoing_vls_protected,
                        self.outgoing_vls_rolls),
                    "visibleProtectMeleeAtDecision": (
                        self.outgoing_vls_visible_protect_melee),
                    "visibleAndProtectedAtRoll": (
                        self.outgoing_vls_visible_and_protected),
                    "protectedNotVisibleAtDecision": (
                        self.outgoing_vls_newly_protected),
                },
            },
            "ordinaryMagicGearAtRollByDefenderAttackTimer": magic_gear,
            "rollPrayerCorrectPct": _pct(
                int(np.sum(self.incoming_correct)), self.incoming_rolls),
            "rollPrayerByIncomingStyle": incoming_by_style,
            "openingIncomingAttackRolls": self.opening_incoming_rolls,
            "postOpeningIncomingAttackRolls": (
                self.post_opening_incoming_rolls),
            "postOpeningRollPrayerCorrectPct": _pct(
                int(np.sum(self.post_opening_incoming_correct)),
                self.post_opening_incoming_rolls),
            "postOpeningRollPrayerByIncomingStyle": (
                post_opening_by_style),
            "activePrayerShare": {
                PRAYER_NAMES[index]: {
                    "rolls": int(value),
                    "pct": _pct(value, self.incoming_rolls),
                }
                for index, value in enumerate(self.active_prayers)
            },
            "prayerOwnWeaponShortcut": {
                "knownOwnWeaponStyleRolls":
                    self.incoming_known_own_weapon_style,
                "prayerMatchesOwnWeaponStyle":
                    self.incoming_prayer_matches_own_weapon_style,
                "prayerMatchesOwnWeaponStylePct": _pct(
                    self.incoming_prayer_matches_own_weapon_style,
                    self.incoming_known_own_weapon_style),
                "incomingStyleDiffersFromOwnWeaponRolls":
                    self.incoming_style_differs_from_own_weapon,
                "differingPrayerMatchesOwnWeaponStyle":
                    self.incoming_differing_prayer_matches_own_weapon,
                "differingPrayerMatchesOwnWeaponStylePct": _pct(
                    self.incoming_differing_prayer_matches_own_weapon,
                    self.incoming_style_differs_from_own_weapon),
                "differingPrayerCorrect":
                    self.incoming_differing_prayer_correct,
                "differingPrayerCorrectPct": _pct(
                    self.incoming_differing_prayer_correct,
                    self.incoming_style_differs_from_own_weapon),
            },
            "ordinaryZuriel": {
                "rolls": self.ordinary_zuriel_rolls,
                "correct": self.ordinary_zuriel_correct,
                "correctPct": _pct(
                    self.ordinary_zuriel_correct,
                    self.ordinary_zuriel_rolls),
            },
            "zeroOneTickZurielSwitch": {
                "rolls": self.zuriel_switch01_rolls,
                "correct": self.zuriel_switch01_correct,
                "correctPct": _pct(
                    self.zuriel_switch01_correct,
                    self.zuriel_switch01_rolls),
            },
            "physicalRobeExposure": {
                "rolls": self.physical_robe_rolls,
                "rollsPerFight": _per_fight(
                    self.physical_robe_rolls, self.completed_fights),
                "gmaulRolls": self.physical_robe_gmaul_rolls,
                "nonGmaulRolls": (
                    self.physical_robe_rolls
                    - self.physical_robe_gmaul_rolls),
                "nonGmaulRollsPerFight": _per_fight(
                    self.physical_robe_rolls
                    - self.physical_robe_gmaul_rolls,
                    self.completed_fights),
            },
            "physicalHeadUnequippedExposure": {
                "rolls": self.physical_head_empty_rolls,
                "gmaulRolls": self.physical_head_empty_gmaul_rolls,
                "nonGmaulRolls": (
                    self.physical_head_empty_rolls
                    - self.physical_head_empty_gmaul_rolls),
                "nonGmaulRollsPerFight": _per_fight(
                    self.physical_head_empty_rolls
                    - self.physical_head_empty_gmaul_rolls,
                    self.completed_fights),
            },
            "physicalFullOffenceExposure": {
                "rolls": self.physical_full_offence_rolls,
                "gmaulRolls": self.physical_full_offence_gmaul_rolls,
                "nonGmaulRolls": (
                    self.physical_full_offence_rolls
                    - self.physical_full_offence_gmaul_rolls),
                "nonGmaulRollsPerFight": _per_fight(
                    self.physical_full_offence_rolls
                    - self.physical_full_offence_gmaul_rolls,
                    self.completed_fights),
            },
            "standUnderTiming": {
                "allSameTile": {
                    "decisionTicks": self.all_same_tile_ticks,
                    "ownOrdinaryAttackCoolingDownTicks":
                        self.all_same_tile_cooldown_ticks,
                    "ownOrdinaryAttackReadyTicks":
                        self.all_same_tile_ready_ticks,
                },
                "frozenOpponentSameTile": {
                    "decisionTicks":
                        self.frozen_opponent_same_tile_ticks,
                    "ownOrdinaryAttackCoolingDownTicks":
                        self.frozen_opponent_cooldown_ticks,
                    "ownOrdinaryAttackReadyTicks":
                        self.frozen_opponent_ready_ticks,
                    "legalStepOutAttackOpportunities":
                        self.legal_step_out_opportunities,
                    "legalStepOutOrdinaryAttackConversions":
                        self.legal_step_out_conversions,
                    "legalStepOutOrdinaryAttackConversionPct": _pct(
                        self.legal_step_out_conversions,
                        self.legal_step_out_opportunities),
                },
            },
            "freezeMeleePrayerTiming": {
                "frozenUnreachable": {
                    "all": {
                        "decisionTicks":
                            int(self.frozen_unreachable_ticks[0]),
                        "protectMeleeTicks": int(
                            self.frozen_unreachable_protect_melee_ticks[0]),
                        "protectMeleePct": _pct(
                            self.frozen_unreachable_protect_melee_ticks[0],
                            self.frozen_unreachable_ticks[0]),
                    },
                    "byVisibleFreezeRemaining": {
                        name: {
                            "decisionTicks":
                                int(self.frozen_unreachable_ticks[index]),
                            "protectMeleeTicks": int(
                                self.frozen_unreachable_protect_melee_ticks[
                                    index]),
                            "protectMeleePct": _pct(
                                self.frozen_unreachable_protect_melee_ticks[
                                    index],
                                self.frozen_unreachable_ticks[index]),
                        }
                        for index, name in enumerate((
                            "moreThanFiveTicks",
                            "twoToFiveTicks",
                            "oneTick",
                        ), start=1)
                    },
                },
                "guaranteedSafeThroughNextEffectiveRollV2": {
                    "all": {
                        "decisionTicks":
                            int(self.guaranteed_safe_v2_ticks[0]),
                        "protectMeleeTicks": int(
                            self.guaranteed_safe_v2_protect_melee_ticks[0]),
                        "protectMeleePct": _pct(
                            self.guaranteed_safe_v2_protect_melee_ticks[0],
                            self.guaranteed_safe_v2_ticks[0]),
                    },
                    "byVisibleFreezeRemaining": {
                        name: {
                            "decisionTicks":
                                int(self.guaranteed_safe_v2_ticks[index]),
                            "protectMeleeTicks": int(
                                self.guaranteed_safe_v2_protect_melee_ticks[
                                    index]),
                            "protectMeleePct": _pct(
                                self.guaranteed_safe_v2_protect_melee_ticks[
                                    index],
                                self.guaranteed_safe_v2_ticks[index]),
                        }
                        for index, name in enumerate((
                            "moreThanFiveTicks",
                            "twoToFiveTicks",
                            "oneTick",
                        ), start=1)
                    },
                },
                "firstVisibleThaw": {
                    "decisionTicks": self.first_visible_thaw_ticks,
                    "visibleMeleeReachableTicks":
                        self.first_visible_thaw_melee_reachable_ticks,
                    "protectMeleeTicks":
                        self.first_visible_thaw_protect_melee_ticks,
                    "protectMeleePct": _pct(
                        self.first_visible_thaw_protect_melee_ticks,
                        self.first_visible_thaw_melee_reachable_ticks),
                },
                "postThawVisibleMeleeReachable": {
                    "decisionTicks": self.post_thaw_ticks,
                    "visibleMeleeReachableTicks":
                        self.post_thaw_melee_reachable_ticks,
                    "protectMeleeTicks":
                        self.post_thaw_protect_melee_ticks,
                    "protectMeleePct": _pct(
                        self.post_thaw_protect_melee_ticks,
                        self.post_thaw_melee_reachable_ticks),
                    "decisionWindow": "next three decisions",
                },
            },
            "incomingRollPrayerSwitchRatePct": _pct(
                self.prayer_switches, self.prayer_transitions),
            "longestSinglePrayerHold": {
                "prayer": prayer_name,
                "incomingRollCount": self.longest_prayer_count,
                "tickSpan": self.longest_prayer_span,
            },
            "incomingRollGearStateSwitchRatePct": _pct(
                self.gear_switches, self.gear_transitions),
            "zeroOneTickAttackerStyleSwitchesIntoOffPrayer":
                self.fast_style_switch_off_prayer,
            "isolation": {
                "crossLaneRollCount": 0,
                "interFightInteractionPossible": False,
                "outsideCachedMapSamples":
                    self.outside_cached_map_samples,
                "laneEnvelopeExcursionsFromLegalChase":
                    self.lane_envelope_excursions,
                "maxDistanceFromFightOrigin": self.max_origin_distance,
                "mode": "independent vectorized fight lanes",
            },
        }


class EvaluationEngine(engine.Engine):
    """Engine variant that observes, but does not alter, fight decisions."""

    def __init__(self, *args, subject_side: int, **kwargs):
        super().__init__(*args, **kwargs)
        self.evaluation = EvaluationCollector(
            self.n_fights, subject_side)
        self._evaluation_pending_roll: _PendingRoll | None = None
        self._weapon_switch_ticks = np.full(
            (self.n_fights, 2), -1000, dtype=np.int64)
        self._evaluation_decision_attack_delay = (
            self.state.attack_delay.copy())

    # These hooks only build rollout labels or NHEV credit provenance. They do
    # not feed combat state, observations, rewards, policy decisions, seeded
    # combat rolls, or any evaluation metric. The ordinary Engine keeps the
    # full implementations; evaluation deliberately avoids paying their cost.
    def _append_reward_event(self, *args, **kwargs):
        return None

    def _emit_rolling_reward_events(self, *args, **kwargs):
        return None

    def _book_offensive_style_teacher(self, *args, **kwargs):
        return None

    def _book_roll_offensive_gear_teacher(self, *args, **kwargs):
        return None

    def _offensive_gear_influence_mask(
            self, roll_style, active, **kwargs):
        return np.zeros((self.n_fights, 2), dtype=np.int32)

    def _finalize_tank_reward_events(self):
        return None

    def _advance_timers(self):
        super()._advance_timers()
        self.evaluation.observe_decision_tick(
            self.state, self.world_tick)
        # This is the exact pre-action timer snapshot used by the v2 gear
        # conditioner later in Engine.step.
        self._evaluation_decision_attack_delay = (
            self.state.attack_delay.copy())

    def _apply_direct_gear(self, combat_action, gear_pick):
        before = self.state.weapon_id.copy()
        result = super()._apply_direct_gear(combat_action, gear_pick)
        changed = self.state.weapon_id != before
        self._weapon_switch_ticks[changed] = self.world_tick
        return result

    def _apply_prayer(self, defence_action):
        result = super()._apply_prayer(defence_action)
        self.evaluation.observe_resulting_defence_prayer(defence_action)
        return result

    def _book_roll_prayer(
            self, fired, attack_style, spec_kind=None):
        protected = self._protected_at_roll(attack_style, fired)
        self._evaluation_pending_roll = self.evaluation.begin_roll(
            self.state,
            fired,
            attack_style,
            protected,
            self._effective_overhead(),
            self.world_tick,
            self._weapon_switch_ticks,
            decision_attack_delay=self._evaluation_decision_attack_delay,
            spec_kind=spec_kind)
        return super()._book_roll_prayer(
            fired, attack_style, spec_kind=spec_kind)

    def _book_vengeance_opportunity(self, fired, expected_damage):
        self.evaluation.add_expected(
            self._evaluation_pending_roll, expected_damage)
        return super()._book_vengeance_opportunity(fired, expected_damage)

    def _queue_hit(
            self, damage, hit_style, delay_ticks, active,
            expected_damage=None, **kwargs):
        pending = self._evaluation_pending_roll
        if pending is not None and kwargs.get("vengeance_reflection") is None:
            self.evaluation.add_actual(pending, damage)
            self._evaluation_pending_roll = None
        return super()._queue_hit(
            damage, hit_style, delay_ticks, active,
            expected_damage=expected_damage, **kwargs)

    def _settle_deaths(self):
        state = self.state
        dead = state.hp <= 0
        fight_over = dead.any(axis=1) | (
            state.tick >= self.max_ticks - 1)
        newly_finished = state.alive & fight_over
        self.evaluation.episode_end(state, newly_finished)
        return super()._settle_deaths()

    def step(self):
        record = super().step()
        self.evaluation.observe_positions(self.state)
        return record
