"""Write .nhrl rollout files the existing trainer can read unchanged.

This is the handover point. Everything upstream can be as fast as we like, but
the file that comes out has to be byte-for-byte the same shape the Java server
produces, because train_selfplay_rl.py and nh_rollout.py read it without
knowing or caring who wrote it.

The layout is not guessed. The record fields and their order come from
nh_rollout.record_dtype (which is the reader the trainer actually uses), and the
header layout from nh_rollout.read_header. tests/test_nhrl_roundtrip.py writes a
file with this module and reads it back with the real loader, including the
loader's own strict validation of the exploration bookkeeping.

Big-endian throughout: the Java writes with DataOutputStream.
"""

from __future__ import annotations

import hashlib
import struct
import time
from pathlib import Path

import numpy as np

from . import schema

MAGIC = 0x4E48524C  # "NHRL"
RECORD_TRANSITION = 1

ACTION_LABEL_SLOTS = 16
CHANNEL_LABEL_SLOTS = 5
DIRECT_GEAR_LABEL_SLOTS = 4
TANK_GEAR_TEACHER_LABEL_SLOTS = 4
ROLL_OFFENSIVE_GEAR_TEACHER_LABEL_SLOTS = 4


def record_dtype(input_size: int = schema.INPUT_SIZE,
                 legal_mask_bytes: int = schema.LEGAL_MASK_BYTES,
                 version: int = schema.NHRL_VERSION) -> np.dtype:
    """The v26 transition record.

    Kept deliberately as one literal list rather than the reader's
    version-branching, so a mismatch shows up as a size assert instead of
    silently drifting.
    """
    if version != 26:
        raise ValueError(f"this writer only emits schema version 26, not {version}")

    cu = schema.CAUSAL_UNIT_COUNT
    fields = [
        ("record_type", "u1"),
        ("row_id", ">i8"),
        ("decision_tick", ">i8"),
        ("transition_tick", ">i8"),
        ("bot_index", ">i4"),
        ("target_index", ">i4"),
        ("episode_id", ">i4"),
        ("episode_tick", ">i8"),
        ("action_label_count", ">i4"),
        ("action_labels", ">i4", (ACTION_LABEL_SLOTS,)),
        ("channel_action_labels", ">i4", (CHANNEL_LABEL_SLOTS,)),
        ("visible_threat_defence_index", ">i4"),
        ("visible_threat_damage", ">i4"),
        ("tank_gear_teacher_action_count", ">i4"),
        ("tank_gear_teacher_actions", ">i4", (TANK_GEAR_TEACHER_LABEL_SLOTS,)),
        ("roll_prayer_teacher_action", ">i4"),
        ("roll_prayer_teacher_attack_style_code", ">i4"),
        ("offensive_style_teacher_action", ">i4"),
        ("offensive_style_teacher_attack_style_code", ">i4"),
        ("offensive_style_teacher_defender_prayer_style_code", ">i4"),
        ("roll_offensive_gear_teacher_action_count", ">i4"),
        ("roll_offensive_gear_teacher_actions", ">i4",
         (ROLL_OFFENSIVE_GEAR_TEACHER_LABEL_SLOTS,)),
        ("roll_offensive_gear_teacher_attack_style_code", ">i4"),
        ("source_pair_mode_code", ">i4"),
        ("opponent_snapshot_id", ">i4"),
        ("vengeance_trinket_blocker_mask", ">i4"),
        ("vengeance_trinket_cast_count", ">i4"),
        ("vengeance_trinket_item_count", ">i4"),
        ("vengeance_trinket_last_cast_tick", ">i8"),
        ("vengeance_trinket_legal", "u1"),
        ("vengeance_opportunity_roll_tick", ">i8"),
        ("vengeance_opportunity_expected_damage", ">f8"),
        ("exploration_triggered", "u1"),
        ("causal_unit_eligible_mask", ">i4"),
        ("exploration_attempted_mask", ">i4"),
        ("exploration_deviation_mask", ">i4"),
        ("combat_dependent_unit_mask", ">i4"),
        ("combat_reserved_unit_mask", ">i4"),
        ("causal_unit_virtual_none_alternative_mask", ">i4"),
        ("causal_unit_actual_actions", ">i4", (cu,)),
        ("causal_unit_greedy_actions", ">i4", (cu,)),
        ("causal_unit_behavior_probabilities", ">f8", (cu,)),
        ("causal_unit_sampling_support_masks", "u1", (cu, legal_mask_bytes)),
        ("combat_dependent_model_actions", ">i4", (cu,)),
        ("combat_required_weapon_action", ">i4"),
        ("reward_raw", ">f8"),
        ("reward_clamped", ">f8"),
        ("done", "u1"),
        ("exploratory", "u1"),
        ("valid_action_count", ">i4"),
        ("behavior_log_probability", ">f8"),
        ("behavior_value", ">f8"),
        ("selected_q", ">f8"),
        ("selected_score", ">f8"),
        ("reward_total_at_decision", ">f8"),
        ("reward_dps_at_decision", ">f8"),
        ("defence_prayer_attack_history_codes", "u1",
         (schema.DEFENCE_PRAYER_ATTACK_HISTORY_COUNT,)),
        ("defence_prayer_own_prayer_history_codes", "u1",
         (schema.DEFENCE_PRAYER_OWN_PRAYER_HISTORY_COUNT,)),
        ("next_defence_prayer_attack_history_codes", "u1",
         (schema.DEFENCE_PRAYER_ATTACK_HISTORY_COUNT,)),
        ("next_defence_prayer_own_prayer_history_codes", "u1",
         (schema.DEFENCE_PRAYER_OWN_PRAYER_HISTORY_COUNT,)),
        ("input", ">f4", (input_size,)),
        ("next_input", ">f4", (input_size,)),
        ("legal_mask", "u1", (legal_mask_bytes,)),
    ]
    dtype = np.dtype(fields)
    if dtype.itemsize != schema.NHRL_RECORD_SIZE:
        raise ValueError(
            f"record is {dtype.itemsize} bytes, the live server writes "
            f"{schema.NHRL_RECORD_SIZE}. The Java schema has moved - re-read "
            f"nh_rollout.record_dtype before generating any more data.")
    return dtype


def action_ids_fingerprint(action_ids) -> str:
    """nh_rollout.action_ids_fingerprint - the loader rejects a mismatch."""
    digest = hashlib.sha256()
    for action_id in action_ids:
        digest.update(int(action_id).to_bytes(4, "big", signed=True))
    return "sha256:" + digest.hexdigest()


def _write_utf(handle, text: str) -> None:
    raw = text.encode("utf-8")
    handle.write(struct.pack(">H", len(raw)))
    handle.write(raw)


def pack_legal_mask(mask: np.ndarray, legal_mask_bytes: int) -> np.ndarray:
    """Pack the final action axis, little-bit-order within each byte."""
    mask = np.asarray(mask, dtype=bool)
    packed = np.packbits(mask, axis=-1, bitorder="little")
    if packed.shape[-1] > legal_mask_bytes:
        raise ValueError(
            f"{mask.shape[-1]} actions do not fit in "
            f"{legal_mask_bytes} legal-mask bytes")
    if packed.shape[-1] == legal_mask_bytes:
        return packed
    padded = np.zeros(
        packed.shape[:-1] + (legal_mask_bytes,), dtype=np.uint8)
    padded[..., :packed.shape[-1]] = packed
    return padded


def _compose_action_labels(chosen: np.ndarray,
                           causal_actual: np.ndarray,
                           required_weapon: np.ndarray
                           ) -> tuple[np.ndarray, np.ndarray]:
    """Build Java's four core labels plus sorted unique direct-gear labels."""
    chosen = np.asarray(chosen, dtype=np.int32)
    gear_actions = np.asarray(
        causal_actual[:, schema.CHANNEL_GEAR_BASE:], dtype=np.int32)
    required_weapon = np.asarray(required_weapon, dtype=np.int32)
    count = chosen.shape[0]

    candidates = np.concatenate(
        (gear_actions, required_weapon[:, None]), axis=1)
    valid = candidates >= 0
    valid &= ~np.any(
        candidates[:, :, None] == chosen[:, None, :], axis=2)

    # Java sorts a set of the additional direct-gear labels. Sorting a sentinel
    # to the end and retaining only the first copy gives the same order without
    # a Python loop over every fighter.
    sentinel = np.iinfo(np.int32).max
    sorted_candidates = np.sort(
        np.where(valid, candidates, sentinel), axis=1)
    unique = sorted_candidates != sentinel
    unique[:, 1:] &= (
        sorted_candidates[:, 1:] != sorted_candidates[:, :-1])
    extra_count = unique.sum(axis=1, dtype=np.int32)
    label_count = extra_count + chosen.shape[1]
    if np.any(label_count > ACTION_LABEL_SLOTS):
        raise ValueError("same-tick action labels exceed the v25 record")

    labels = np.full(
        (count, ACTION_LABEL_SLOTS), -1, dtype=np.int32)
    labels[:, :chosen.shape[1]] = chosen
    packed_column = (
        np.cumsum(unique, axis=1, dtype=np.int32)
        + chosen.shape[1] - 1)
    rows, columns = np.nonzero(unique)
    labels[rows, packed_column[rows, columns]] = (
        sorted_candidates[rows, columns])
    return labels, label_count


_CAUSAL_BIT_WEIGHTS = np.left_shift(
    np.int32(1),
    np.arange(schema.CAUSAL_UNIT_COUNT, dtype=np.int32))


class RolloutWriter:
    """Streams records to disk so a long run never has to hold them in memory."""

    def __init__(self, path: str | Path, action_ids,
                 exploration_rate: float,
                 runtime_profile: str = "training",
                 training_mode: str = "neural_selfplay_dataset",
                 data_folder: str = "",
                 input_size: int = schema.INPUT_SIZE,
                 feature_size: int = schema.FEATURE_SIZE,
                 action_count: int = schema.ACTION_COUNT,
                 legal_mask_bytes: int = schema.LEGAL_MASK_BYTES):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.dtype = record_dtype(input_size, legal_mask_bytes)
        self.action_count = action_count
        self.legal_mask_bytes = legal_mask_bytes
        self.input_size = input_size
        # Keep the serialization target alive across ticks.  A rollout batch
        # normally has the same row count for most of a fight, so allocating a
        # fresh structured array for every write only creates avoidable memory
        # traffic.  The used prefix is fully overwritten below before it is
        # exposed to the file handle.
        self._record_buffer = np.empty(0, dtype=self.dtype)
        self.rows_written = 0
        self._row_id = 0
        self.created_millis = int(time.time() * 1000)
        self.action_ids_fingerprint = action_ids_fingerprint(action_ids)

        if not 0.0 <= exploration_rate <= 1.0:
            raise ValueError("exploration rate must be between 0 and 1")
        self.exploration_rate = float(exploration_rate)

        self.handle = self.path.open("wb")
        self.handle.write(struct.pack(
            ">iiiiiiq", MAGIC, schema.NHRL_VERSION, input_size, feature_size,
            action_count, legal_mask_bytes, self.created_millis))
        self.handle.write(struct.pack(">d", float(exploration_rate)))
        _write_utf(self.handle, runtime_profile)
        _write_utf(self.handle, training_mode)
        _write_utf(self.handle, data_folder)
        _write_utf(self.handle, self.action_ids_fingerprint)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def close(self):
        if self.handle is not None:
            self.handle.close()
            self.handle = None

    def _output_rows(self, count: int) -> np.ndarray:
        """Return a reusable, geometrically grown serialization prefix."""
        capacity = self._record_buffer.shape[0]
        if count > capacity:
            new_capacity = max(1, capacity)
            while new_capacity < count:
                new_capacity *= 2
            self._record_buffer = np.empty(new_capacity, dtype=self.dtype)
        return self._record_buffer[:count]

    # -- writing -------------------------------------------------------------

    def write(self, record, source_pair_mode: int = schema.PAIR_MODE_MIRROR,
              opponent_snapshot_id: int = -1,
              keep: np.ndarray | None = None) -> int:
        """Append one engine TickRecord (both fighters of every fight).

        `keep` optionally selects which rows to write, so finished fights stop
        contributing rows without stalling the rest of the batch.
        """
        source_pair_mode = int(source_pair_mode)
        opponent_snapshot_id = int(opponent_snapshot_id)
        if source_pair_mode == schema.PAIR_MODE_SNAPSHOT:
            if opponent_snapshot_id <= 0:
                raise ValueError(
                    "snapshot-source rows require a positive opponent snapshot ID")
        elif opponent_snapshot_id != -1:
            raise ValueError(
                "non-snapshot rows must use opponent snapshot ID -1")
        rows = record.inputs.shape[0]
        keep_mask = (
            np.ones(rows, dtype=bool)
            if keep is None else np.asarray(keep, dtype=bool))
        count = int(keep_mask.sum())
        if count == 0:
            return 0
        # Most ticks still have every lane alive. A full slice avoids making a
        # separate fancy-index copy of every large rollout field.
        select = slice(None) if count == rows else keep_mask

        out = self._output_rows(count)
        out["record_type"] = RECORD_TRANSITION
        out["row_id"] = np.arange(self._row_id, self._row_id + count, dtype=np.int64)
        self._row_id += count

        tick = record.decision_tick[select].astype(np.int64)
        out["decision_tick"] = tick
        # Java closes a terminal transition on the current decision tick;
        # ordinary transitions point at the following tick.
        out["transition_tick"] = np.where(
            record.done[select], tick, tick + 1)
        out["episode_tick"] = record.episode_tick[select].astype(np.int64)
        out["bot_index"] = record.bot_index[select]
        out["target_index"] = record.target_index[select]
        out["episode_id"] = record.episode_id[select]

        # --- the chosen action, as labels ----------------------------------
        # Java's sameTickActionLabelsForActions receives combat, defence,
        # supply, movement, then slot-ordered direct gear.  Keep this exact
        # order: the labels are semantically a set, but deterministic replay
        # compares the serialized v25 row as well.
        channels = ("combat", "defence", "supply", "movement")
        chosen = np.stack([record.chosen[name][select] for name in channels], axis=1)
        greedy = np.stack([record.greedy[name][select] for name in channels], axis=1)
        prob = np.stack([record.behaviour_prob[name][select] for name in channels], axis=1)

        # Same-tick labels contain the four selected core causal actions, every
        # concrete optional gear action, and combat's required weapon action.
        # The trainer uses this list to verify and repair direct-gear targets.
        causal_actual = record.causal_actual[select]
        required_weapon = record.required_weapon[select]
        labels, label_count = _compose_action_labels(
            chosen, causal_actual, required_weapon)
        out["action_label_count"] = label_count
        out["action_labels"] = labels
        channel_labels = ("attack", "spec", "defence", "movement", "supply")
        channel_chosen = np.stack(
            [record.channel_chosen[name][select] for name in channel_labels],
            axis=1)
        out["channel_action_labels"][:, :len(channel_labels)] = channel_chosen
        out["channel_action_labels"][:, len(channel_labels):] = -1

        # --- teacher labels -------------------------------------------------
        out["visible_threat_defence_index"] = (
            record.visible_threat_defence_index[select])
        out["visible_threat_damage"] = record.visible_threat_damage[select]
        out["offensive_style_teacher_action"] = (
            record.offensive_style_teacher_action[select])
        out["offensive_style_teacher_attack_style_code"] = (
            record.offensive_style_teacher_attack_style_code[select])
        out["offensive_style_teacher_defender_prayer_style_code"] = (
            record.offensive_style_teacher_defender_prayer_style_code[select])
        out["roll_offensive_gear_teacher_action_count"] = (
            record.roll_offensive_gear_teacher_action_count[select])
        out["roll_offensive_gear_teacher_actions"] = (
            record.roll_offensive_gear_teacher_actions[select])
        out["roll_offensive_gear_teacher_attack_style_code"] = (
            record.roll_offensive_gear_teacher_attack_style_code[select])
        out["opponent_snapshot_id"] = opponent_snapshot_id
        out["tank_gear_teacher_action_count"] = (
            record.tank_gear_teacher_action_count[select])
        out["tank_gear_teacher_actions"] = (
            record.tank_gear_teacher_actions[select])
        out["roll_prayer_teacher_action"] = (
            record.roll_prayer_teacher_action[select])
        out["roll_prayer_teacher_attack_style_code"] = (
            record.roll_prayer_teacher_attack_style_code[select])
        out["source_pair_mode_code"] = source_pair_mode

        # --- vengeance bookkeeping -----------------------------------------
        out["vengeance_trinket_blocker_mask"] = (
            record.vengeance_trinket_blocker_mask[select])
        out["vengeance_trinket_cast_count"] = (
            record.vengeance_trinket_cast_count[select])
        out["vengeance_trinket_item_count"] = (
            record.vengeance_trinket_item_count[select])
        out["vengeance_trinket_last_cast_tick"] = (
            record.vengeance_trinket_last_cast_tick[select])
        out["vengeance_trinket_legal"] = (
            record.vengeance_trinket_legal[select])
        out["vengeance_opportunity_roll_tick"] = (
            record.vengeance_opportunity_roll_tick[select])
        out["vengeance_opportunity_expected_damage"] = (
            record.vengeance_opportunity_expected_damage[select])

        # --- exploration bookkeeping ---------------------------------------
        # nh_rollout.validate_factored_exploration_batch is strict about this,
        # so the invariants it checks are built in rather than patched after.
        legal_mask = record.legal_mask[select]
        packed = pack_legal_mask(legal_mask, self.legal_mask_bytes)
        out["legal_mask"] = packed

        cu = schema.CAUSAL_UNIT_COUNT
        actual = record.causal_actual[select].astype(np.int32)
        greedy_all = record.causal_greedy[select].astype(np.int32)
        probs = record.causal_prob[select].astype(np.float64)
        # Sampling support is not the same as the global legal mask. In
        # particular Java leaves SPEC_NONE globally legal but excludes it from
        # the combat causal unit, and it removes combinations that cannot
        # execute jointly with the selected combat/movement action.
        sampling_support = record.sampling_support[select]
        support = pack_legal_mask(
            sampling_support, self.legal_mask_bytes)

        # Eligibility and deviation come from the sampler, not from a second
        # guess here: the loader cross-checks them against the probabilities,
        # so the two have to be the same computation.
        eligible = record.eligible[select]
        deviated = record.deviated[select]

        eligible_mask = np.sum(
            eligible * _CAUSAL_BIT_WEIGHTS,
            axis=1, dtype=np.int32)
        attempted_mask = np.sum(
            deviated * _CAUSAL_BIT_WEIGHTS,
            axis=1, dtype=np.int32)

        virtual_none = record.virtual_none[select]
        reserved = record.reserved[select]
        dependent = record.dependent[select]
        virtual_none_mask = np.sum(
            virtual_none * _CAUSAL_BIT_WEIGHTS,
            axis=1, dtype=np.int32)
        reserved_mask = np.sum(
            reserved * _CAUSAL_BIT_WEIGHTS,
            axis=1, dtype=np.int32)
        dependent_mask = np.sum(
            dependent * _CAUSAL_BIT_WEIGHTS,
            axis=1, dtype=np.int32)

        out["causal_unit_eligible_mask"] = eligible_mask
        out["exploration_attempted_mask"] = attempted_mask
        out["exploration_deviation_mask"] = attempted_mask
        out["exploration_triggered"] = (attempted_mask != 0).astype(np.uint8)
        out["combat_dependent_unit_mask"] = dependent_mask
        out["combat_reserved_unit_mask"] = reserved_mask
        out["causal_unit_virtual_none_alternative_mask"] = virtual_none_mask
        out["causal_unit_actual_actions"] = actual
        out["causal_unit_greedy_actions"] = greedy_all
        out["causal_unit_behavior_probabilities"] = probs
        out["causal_unit_sampling_support_masks"] = support
        out["combat_dependent_model_actions"] = (
            record.dependent_actions[select].astype(np.int32))
        out["combat_required_weapon_action"] = required_weapon

        # --- reward and value ----------------------------------------------
        reward = record.reward[select].astype(np.float64)
        out["reward_raw"] = reward
        out["reward_clamped"] = np.clip(reward, -100.0, 100.0)
        out["done"] = record.done[select].astype(np.uint8)
        out["exploratory"] = out["exploration_triggered"]
        out["valid_action_count"] = legal_mask.sum(axis=1)
        # NhFactoredExplorationSampler.jointBehaviorProbability: the one
        # decision-wide epsilon branch is either not taken, or selects one of k
        # units and one of that unit's alternatives.
        eligible_count = eligible.sum(axis=1)
        deviation_count = deviated.sum(axis=1)
        alternative_count = record.alternatives[select]
        joint = np.ones(count, dtype=np.float64)
        can_explore = eligible_count > 0
        joint[can_explore & (deviation_count == 0)] = (
            1.0 - self.exploration_rate)
        explored_rows = np.nonzero(deviation_count > 0)[0]
        if len(explored_rows):
            unit = np.argmax(deviated[explored_rows], axis=1)
            joint[explored_rows] = (
                self.exploration_rate
                / eligible_count[explored_rows]
                / alternative_count[explored_rows, unit])
        out["behavior_log_probability"] = np.log(np.maximum(1e-12, joint))
        out["behavior_value"] = record.value[select].astype(np.float64)
        out["selected_q"] = record.selected_q[select].astype(np.float64)
        out["selected_score"] = record.selected_score[select].astype(
            np.float64)
        out["reward_total_at_decision"] = record.inputs[
            select, schema.INPUT_REWARD_TOTAL]
        out["reward_dps_at_decision"] = record.inputs[
            select, schema.INPUT_REWARD_DPS]

        out["defence_prayer_attack_history_codes"] = (
            record.defence_prayer_attack_history_codes[select])
        out["defence_prayer_own_prayer_history_codes"] = (
            record.defence_prayer_own_prayer_history_codes[select])
        out["next_defence_prayer_attack_history_codes"] = (
            record.next_defence_prayer_attack_history_codes[select])
        out["next_defence_prayer_own_prayer_history_codes"] = (
            record.next_defence_prayer_own_prayer_history_codes[select])
        out["input"] = record.inputs[select].astype(np.float32)
        out["next_input"] = record.next_inputs[select].astype(np.float32)

        self.handle.write(memoryview(out).cast("B"))
        self.rows_written += count
        return count


def _channel_span(name: str) -> slice:
    return {
        "combat": slice(schema.COMBAT_BASE, schema.COMBAT_BASE + schema.COMBAT_COUNT),
        "defence": slice(schema.DEFENCE_BASE, schema.DEFENCE_BASE + schema.DEFENCE_COUNT),
        "movement": slice(schema.MOVEMENT_BASE, schema.MOVEMENT_BASE + schema.MOVEMENT_COUNT),
        "supply": slice(schema.SUPPLY_BASE, schema.SUPPLY_BASE + schema.SUPPLY_COUNT),
    }[name]
