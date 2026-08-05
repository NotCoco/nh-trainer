"""Deterministic cohort opponents shared by evaluation and rollout generation."""

from __future__ import annotations

import numpy as np

from . import gear, schema


SCRIPT_NAMES = (
    "fixed-magic",
    "fixed-ranged",
    "fixed-melee",
    "fixed-halberd",
    "magic-then-halberd",
    "one-magic-then-halberd",
    "varied-opener-then-halberd",
    "varied-opener-then-persistent-ranged",
    "varied-opener-then-persistent-balanced",
    "seeded-varied-prefix-then-persistent-ranged",
    "seeded-three-style-prefix-then-persistent-ranged",
    "seeded-varied-prefix-then-persistent-balanced",
    "seeded-long-mr-prefix-then-persistent-balanced",
    "seeded-mixed-then-ranged-pressure",
    "seeded-mixed-then-balanced-pressure",
    "seeded-recurring-three-style-blocks",
    "seeded-comprehensive-human-ranged-pressure",
    "seeded-three-style-then-ranged-gear-fakes",
    "seeded-ranged-phase-balanced-gear-fakes",
    "seeded-freeze-then-ranged-phase-balanced-gear-fakes",
    "seeded-ranged-multigear-movement-pressure",
    "seeded-complete-history-ranged-pressure",
    "seeded-complete-history-balanced-pressure",
    "live-rmm-then-persistent-ranged",
    "live-mmmrm-then-persistent-ranged",
    "live-magic-melee-then-persistent-ranged",
    "live-human-ranged-pressure",
    "live-human-ranged-pressure-fullgear",
    "live-human-recurring-ranged-pressure-fullgear",
    "honest-gear-style-transitions",
    "live-ranged-gear-flick-pressure",
    "heldout-ranged-multigear-movement-a",
    "heldout-ranged-multigear-movement-b",
    "vls-pressure",
    "voidwaker-pressure",
    "adaptive-off-prayer",
    "adaptive-random-off-prayer",
    "hidden-random-style",
    "seeded-block-switch",
    "seeded-rapid-switch",
    "freeze-stepout-halberd",
)
# This exact trace is a held-out reproduction gate. Rollout generation uses the
# varied three-style curriculum above so training cannot memorize the live
# report that the gate is meant to protect.
EVALUATION_ONLY_SCRIPT_NAMES = (
    "live-rmm-then-persistent-ranged",
    "live-mmmrm-then-persistent-ranged",
    "live-magic-melee-then-persistent-ranged",
    "live-human-ranged-pressure",
    "live-human-ranged-pressure-fullgear",
    "live-human-recurring-ranged-pressure-fullgear",
    "honest-gear-style-transitions",
    "live-ranged-gear-flick-pressure",
    "heldout-ranged-multigear-movement-a",
    "heldout-ranged-multigear-movement-b",
    "voidwaker-pressure",
)
ROLLOUT_SCRIPT_NAMES = tuple(
    name for name in SCRIPT_NAMES if name not in EVALUATION_ONLY_SCRIPT_NAMES)
STATIC_DEFENCE_NAMES = (
    "magic",
    "ranged",
    "melee",
    "smite",
    "redemption",
)
DYNAMIC_DEFENCE_NAMES = (
    "melee-magic-delayed",
    "melee-magic-reactive",
    "seeded-protection",
    "seeded-switching-protection",
    "seeded-human-prayer-mix",
    "seeded-reactive-protection",
)
DEFENCE_NAMES = STATIC_DEFENCE_NAMES + DYNAMIC_DEFENCE_NAMES
DEFENCE_DESCRIPTIONS = {
    "magic": "hold Protect from Magic",
    "ranged": "hold Protect from Missiles",
    "melee": "hold Protect from Melee for the whole fight",
    "smite": "use Smite when legal, otherwise Protect from Magic",
    "redemption": "use Redemption when legal, otherwise Protect from Magic",
    "melee-magic-delayed": (
        "repeat 1-4 full VLS-speed cycles on Protect from Melee, then one "
        "cycle on Protect from Magic; the Melee hold varies by fight lane"
    ),
    "melee-magic-reactive": (
        "after each delayed observed opponent attack, use Protect from Melee "
        "for 1-4 ticks by fight lane, then Protect from Magic until the next "
        "observed attack"
    ),
    "seeded-protection": (
        "hold one of the three protection prayers, balanced by seed and "
        "fight lane"
    ),
    "seeded-switching-protection": (
        "cycle independently through all three protection prayers in seeded "
        "two-to-six-tick blocks"
    ),
    "seeded-human-prayer-mix": (
        "cover campers, two-prayer alternation, three-prayer cycles, one or "
        "two major phase switches, and irregular variable-length blocks"
    ),
    "seeded-reactive-protection": (
        "react to staged delayed opponent attack observations with seeded "
        "reaction persistence and occasional short fake-prayer windows"
    ),
}
assert set(DEFENCE_DESCRIPTIONS) == set(DEFENCE_NAMES)
_DEFENCE_BY_NAME = {
    "magic": schema.PRAY_PROTECT_MAGIC,
    "ranged": schema.PRAY_PROTECT_MISSILES,
    "melee": schema.PRAY_PROTECT_MELEE,
    "smite": schema.PRAY_SMITE,
    "redemption": schema.PRAY_REDEMPTION,
}
# Smite and Redemption are only legal in their real Java combat windows. When
# either is unavailable, use one explicit, always-legal protection rather than
# depending on an equal-score argmax accident. Do not widen their legal masks.
NON_PROTECTION_FALLBACK_NAME = "magic"
_NON_PROTECTION_FALLBACK = _DEFENCE_BY_NAME[
    NON_PROTECTION_FALLBACK_NAME]
_BLOCK_STYLE_PERMUTATIONS = np.asarray((
    (schema.STYLE_MAGIC, schema.STYLE_RANGED, schema.STYLE_MELEE),
    (schema.STYLE_MAGIC, schema.STYLE_MELEE, schema.STYLE_RANGED),
    (schema.STYLE_RANGED, schema.STYLE_MAGIC, schema.STYLE_MELEE),
    (schema.STYLE_RANGED, schema.STYLE_MELEE, schema.STYLE_MAGIC),
    (schema.STYLE_MELEE, schema.STYLE_MAGIC, schema.STYLE_RANGED),
    (schema.STYLE_MELEE, schema.STYLE_RANGED, schema.STYLE_MAGIC),
), dtype=np.int8)
_BLOCK_SEQUENCE_SLOTS = np.asarray((0, 1, 0, 0, 0, 2, 2), dtype=np.int8)
_VARIED_OPENER_PERSISTENT_RANGED_STYLES = np.asarray((
    schema.STYLE_RANGED,
    schema.STYLE_MAGIC,
    schema.STYLE_MAGIC,
    schema.STYLE_RANGED,
    schema.STYLE_MELEE,
    schema.STYLE_MELEE,
    schema.STYLE_RANGED,
    schema.STYLE_MAGIC,
    schema.STYLE_RANGED,
    schema.STYLE_MELEE,
), dtype=np.int8)
_THREE_STYLE_PERSISTENT_RANGED_PREFIXES = np.asarray((
    # These are deliberately varied curricula, not replicas of one live fight.
    # Every lane exposes both Magic and Melee before a sustained Ranged phase,
    # while the surrounding order changes so no one prefix is a shortcut.
    (schema.STYLE_MAGIC, schema.STYLE_MELEE,
     schema.STYLE_RANGED, schema.STYLE_MAGIC, schema.STYLE_MELEE),
    (schema.STYLE_MAGIC, schema.STYLE_MELEE, schema.STYLE_MAGIC,
     schema.STYLE_RANGED, schema.STYLE_MELEE),
    (schema.STYLE_RANGED, schema.STYLE_MAGIC, schema.STYLE_MELEE,
     schema.STYLE_MAGIC, schema.STYLE_RANGED),
    (schema.STYLE_MELEE, schema.STYLE_MAGIC,
     schema.STYLE_RANGED, schema.STYLE_MELEE, schema.STYLE_MAGIC),
    (schema.STYLE_MAGIC, schema.STYLE_RANGED,
     schema.STYLE_MELEE, schema.STYLE_MAGIC, schema.STYLE_RANGED),
    (schema.STYLE_MELEE, schema.STYLE_RANGED,
     schema.STYLE_MAGIC, schema.STYLE_MELEE, schema.STYLE_RANGED),
    (schema.STYLE_RANGED, schema.STYLE_MELEE,
     schema.STYLE_MAGIC, schema.STYLE_RANGED, schema.STYLE_MELEE),
    (schema.STYLE_MAGIC, schema.STYLE_MAGIC,
     schema.STYLE_MELEE, schema.STYLE_RANGED, schema.STYLE_MAGIC),
), dtype=np.int8)
_THREE_STYLE_PERSISTENT_RANGED_PREFIX_LENGTHS = np.asarray(
    (3, 3, 4, 3, 4, 5, 4, 5), dtype=np.int16)
_HUMAN_RANGED_PREFIXES = np.asarray((
    # These are training families, not copies of any held-out hand fight.
    # Several begin with Magic and alternate into Ranged, while the remainder
    # cover campers, sparse Melee interruptions and delayed style changes.
    (0, 1, 0, 1, 1, 1, 1, 1, 1, 1),
    (0, 0, 1, 0, 1, 1, 1, 1, 1, 1),
    (0, 1, 0, 1, 0, 1, 1, 1, 1, 1),
    (0, 1, 1, 0, 1, 1, 1, 1, 1, 1),
    (0, 2, 0, 1, 1, 1, 1, 1, 1, 1),
    (0, 1, 2, 0, 1, 1, 1, 1, 1, 1),
    (1, 1, 1, 1, 1, 1, 1, 1, 1, 1),
    (1, 0, 1, 1, 1, 1, 1, 1, 1, 1),
    (2, 0, 1, 1, 1, 1, 1, 1, 1, 1),
    (0, 0, 0, 1, 0, 1, 1, 1, 1, 1),
    (1, 0, 0, 1, 1, 1, 1, 1, 1, 1),
    (0, 2, 1, 0, 2, 1, 1, 1, 1, 1),
    (0, 1, 0, 1, 0, 1, 0, 1, 1, 1),
    (1, 0, 1, 0, 1, 1, 1, 1, 1, 1),
    (0, 2, 0, 2, 1, 1, 1, 1, 1, 1),
    (0, 1, 2, 1, 0, 1, 1, 1, 1, 1),
), dtype=np.int8)
_HUMAN_RANGED_PREFIX_LENGTHS = np.asarray(
    (4, 5, 6, 5, 4, 5, 0, 3, 3, 6, 4, 6, 8, 5, 5, 6),
    dtype=np.int16)
_HUMAN_RANGED_FAKE_WEAPONS = np.asarray((
    gear.ZURIELS_STAFF.item_id,
    gear.VESTAS_LONGSWORD.item_id,
    gear.VOIDWAKER.item_id,
    gear.NOXIOUS_HALBERD.item_id,
    gear.GRANITE_MAUL.item_id,
    gear.ZARYTE_CROSSBOW.item_id,
), dtype=np.int32)
_COMPLETE_HISTORY_BLOCK_LENGTH = 14
_COMPLETE_HISTORY_TERMINAL_STYLES = np.asarray((
    schema.STYLE_MAGIC,
    schema.STYLE_RANGED,
    schema.STYLE_RANGED,
    schema.STYLE_MELEE,
), dtype=np.int8)
_BALANCED_COMPLETE_HISTORY_TERMINAL_STYLES = np.asarray((
    schema.STYLE_MAGIC,
    schema.STYLE_MAGIC,
    schema.STYLE_RANGED,
    schema.STYLE_RANGED,
    schema.STYLE_MELEE,
    schema.STYLE_MELEE,
), dtype=np.int8)
_HONEST_STYLE_TRANSITION_PAIRS = np.asarray((
    (schema.STYLE_MAGIC, schema.STYLE_RANGED),
    (schema.STYLE_MAGIC, schema.STYLE_MELEE),
    (schema.STYLE_RANGED, schema.STYLE_MAGIC),
    (schema.STYLE_RANGED, schema.STYLE_MELEE),
    (schema.STYLE_MELEE, schema.STYLE_MAGIC),
    (schema.STYLE_MELEE, schema.STYLE_RANGED),
), dtype=np.int8)
HONEST_STYLE_TRANSITION_B_ROLLS = 8
_FAKE_STYLES_BY_ATTACK_STYLE = np.asarray((
    (schema.STYLE_RANGED, schema.STYLE_MELEE),
    (schema.STYLE_MAGIC, schema.STYLE_MELEE),
    (schema.STYLE_MAGIC, schema.STYLE_RANGED),
), dtype=np.int8)
_RANGED_PHASE_BALANCED_CUE_STYLES = np.asarray((
    schema.STYLE_MAGIC,
    schema.STYLE_MELEE,
    schema.STYLE_RANGED,
), dtype=np.int8)
_REACTIVE_WEAPON_IDS = np.asarray((
    gear.ZURIELS_STAFF.item_id,
    gear.ZARYTE_CROSSBOW.item_id,
    gear.NOXIOUS_HALBERD.item_id,
    gear.VESTAS_LONGSWORD.item_id,
    gear.VOIDWAKER.item_id,
    gear.GRANITE_MAUL.item_id,
), dtype=np.int32)
_REACTIVE_WEAPON_ANGLES = (
    _REACTIVE_WEAPON_IDS * schema.WEAPON_EMBED_FREQ)
_REACTIVE_WEAPON_EMBEDDINGS = np.stack((
    np.sin(_REACTIVE_WEAPON_ANGLES),
    np.cos(_REACTIVE_WEAPON_ANGLES),
), axis=1).astype(np.float32)
_REACTIVE_WEAPON_STYLES = gear.style_for_weapon(
    _REACTIVE_WEAPON_IDS).astype(np.int8)


class ScriptedPolicy:
    """One legal, deterministic attack plan and overhead-prayer curriculum."""

    input_size = schema.INPUT_SIZE
    action_count = schema.ACTION_COUNT
    action_ids = schema.CURRENT_ACTION_IDS
    defence_prayer_head_version = 1

    def __init__(
            self,
            script: str,
            defence: str = "smite",
            seed: int = 0,
            use_vengeance: bool = False):
        if script not in (*SCRIPT_NAMES, "passive"):
            raise ValueError(
                f"script must be one of {', '.join(SCRIPT_NAMES)}")
        if defence not in DEFENCE_NAMES:
            raise ValueError(
                f"defence must be one of {', '.join(DEFENCE_NAMES)}")
        self.script = script
        self.defence = defence
        self.seed = int(seed)
        self.use_vengeance = bool(use_vengeance)
        self._decision_tick = 0
        self._block_sequence_positions: np.ndarray | None = None
        self._block_last_attack_ready: np.ndarray | None = None
        self._block_advance_when_ready: np.ndarray | None = None
        self._rapid_sequence_positions: np.ndarray | None = None
        self._rapid_last_attack_ready: np.ndarray | None = None
        self._rapid_advance_when_ready: np.ndarray | None = None
        self._persistent_sequence_positions: np.ndarray | None = None
        self._persistent_last_attack_ready: np.ndarray | None = None
        self._seeded_persistent_positions: np.ndarray | None = None
        self._seeded_persistent_last_attack_ready: np.ndarray | None = None
        self._seeded_persistent_pause_remaining: np.ndarray | None = None
        self._human_ranged_positions: np.ndarray | None = None
        self._human_ranged_last_attack_ready: np.ndarray | None = None
        self._human_ranged_pause_remaining: np.ndarray | None = None
        self._human_ranged_ready_stall: np.ndarray | None = None
        self._honest_transition_positions: np.ndarray | None = None
        self._honest_transition_last_attack_ready: np.ndarray | None = None
        self._human_prayer_block_remaining: np.ndarray | None = None
        self._human_prayer_block_index: np.ndarray | None = None
        self._human_prayer_current: np.ndarray | None = None
        self._reactive_last_observed_age: np.ndarray | None = None
        self._reactive_current_style: np.ndarray | None = None
        self._reactive_previous_style: np.ndarray | None = None
        self._reactive_ticks_since_update: np.ndarray | None = None
        self._ranged_fake_positions: np.ndarray | None = None
        self._ranged_fake_last_attack_ready: np.ndarray | None = None
        self._ranged_fake_ready_stall: np.ndarray | None = None
        self._freeze_halberd_last_visible: np.ndarray | None = None
        self._stable_fight_lanes: np.ndarray | None = None

    def _fight_lanes(self, count: int) -> np.ndarray:
        """Keep seeded lane identities stable when finished eval lanes compact."""
        if (
                self._stable_fight_lanes is None
                or self._stable_fight_lanes.shape != (count,)):
            self._stable_fight_lanes = (
                np.arange(count, dtype=np.intp) // 2)
        return self._stable_fight_lanes

    def compact_rows(self, keep_mask: np.ndarray) -> None:
        """Retain per-row script state for active evaluation lanes only."""
        keep = np.asarray(keep_mask, dtype=bool)
        old_count = int(keep.shape[0])
        for name, value in tuple(vars(self).items()):
            if (
                    isinstance(value, np.ndarray)
                    and value.shape[:1] == (old_count,)):
                setattr(self, name, value[keep].copy())

    def score(self, inputs: np.ndarray):
        count = int(inputs.shape[0])
        scores = np.full(
            (count, schema.ACTION_COUNT), -100.0, dtype=np.float32)
        chosen_styles = None

        # Ordinary scripts prefer their attack row whenever it is legal. VLS
        # pressure first equips VLS, then spends every special that the real
        # tick-start controls, reach and energy permit.
        scores[:, schema.COMBAT_NO_ATTACK] = 0.0
        scores[:, schema.COMBAT_SPEC_NONE] = 100.0
        if self.script.startswith("fixed-"):
            style = {
                "fixed-magic": schema.STYLE_MAGIC,
                "fixed-ranged": schema.STYLE_RANGED,
                "fixed-melee": schema.STYLE_MELEE,
                "fixed-halberd": schema.STYLE_MELEE,
            }[self.script]
            row = (
                schema.COMBAT_ATTACK_BASE
                + style * 2
                + schema.ATTACK_INTENT_ATTACK)
            scores[:, row] = 100.0
            expected_weapon = {
                "fixed-magic": gear.ZURIELS_STAFF.item_id,
                "fixed-ranged": gear.ZARYTE_CROSSBOW.item_id,
                "fixed-melee": gear.VESTAS_LONGSWORD.item_id,
                "fixed-halberd": gear.NOXIOUS_HALBERD.item_id,
            }[self.script]
            angle = expected_weapon * schema.WEAPON_EMBED_FREQ
            weapon_visible = (
                np.isclose(
                    inputs[:, schema.INPUT_SELF_WEAPON_SIN],
                    np.sin(angle),
                    atol=1.0e-5)
                & np.isclose(
                    inputs[:, schema.INPUT_SELF_WEAPON_COS],
                    np.cos(angle),
                    atol=1.0e-5))
            scores[~weapon_visible, schema.COMBAT_NO_ATTACK] = 200.0
            self._score_style_full_loadout(
                scores,
                np.ones(count, dtype=bool),
                style,
                weapon_item_id=expected_weapon)
            self._score_weapon_hold_toggle(
                scores,
                weapon_visible)
        elif self.script == "vls-pressure":
            row = (
                schema.COMBAT_SPEC_BASE
                + schema.SPEC_VESTA_LONGSWORD * 2
                + schema.ATTACK_INTENT_ATTACK)
            scores[:, schema.COMBAT_SPEC_NONE] = 0.0
            scores[:, row] = 100.0
            self._score_vls_equip(scores)
        elif self.script == "voidwaker-pressure":
            row = (
                schema.COMBAT_SPEC_BASE
                + schema.SPEC_VOIDWAKER * 2
                + schema.ATTACK_INTENT_ATTACK)
            scores[:, schema.COMBAT_SPEC_NONE] = 0.0
            scores[:, row] = 100.0
            self._score_voidwaker_equip(scores)
        elif self.script == "magic-then-halberd":
            style = (
                schema.STYLE_MAGIC
                if self._decision_tick < 5
                else schema.STYLE_MELEE
            )
            row = (
                schema.COMBAT_ATTACK_BASE
                + style * 2
                + schema.ATTACK_INTENT_ATTACK)
            scores[:, row] = 100.0
            if style == schema.STYLE_MAGIC:
                self._score_zuriels_equip(scores)
            else:
                self._score_halberd_equip(scores)
        elif self.script == "one-magic-then-halberd":
            if self._decision_tick < 4:
                row = (
                    schema.COMBAT_ATTACK_BASE
                    + schema.STYLE_MAGIC * 2
                    + schema.ATTACK_INTENT_ATTACK)
                scores[:, row] = 100.0
                self._score_zuriels_equip(scores)
            elif self._decision_tick == 4:
                # Switch during the ready tick without launching a second
                # spell. The following tick begins persistent halberd rolls,
                # matching the live human sequence that exposed the shortcut.
                scores[:, schema.COMBAT_NO_ATTACK] = 100.0
                self._score_halberd_equip(scores)
            else:
                row = (
                    schema.COMBAT_ATTACK_BASE
                    + schema.STYLE_MELEE * 2
                    + schema.ATTACK_INTENT_ATTACK)
                scores[:, row] = 100.0
                self._score_halberd_equip(scores)
        elif self.script == "varied-opener-then-halberd":
            chosen_styles = self._score_varied_opener_then_halberd(
                scores, inputs)
        elif self.script == "varied-opener-then-persistent-ranged":
            chosen_styles = (
                self._score_varied_opener_then_persistent_style(
                    scores, inputs, balanced_terminal=False))
        elif self.script == "varied-opener-then-persistent-balanced":
            chosen_styles = (
                self._score_varied_opener_then_persistent_style(
                    scores, inputs, balanced_terminal=True))
        elif self.script in (
                "seeded-varied-prefix-then-persistent-ranged",
                "seeded-three-style-prefix-then-persistent-ranged",
                "seeded-varied-prefix-then-persistent-balanced",
                "seeded-long-mr-prefix-then-persistent-balanced",
                "seeded-mixed-then-ranged-pressure",
                "seeded-mixed-then-balanced-pressure",
                "seeded-recurring-three-style-blocks",
                "live-rmm-then-persistent-ranged",
                "live-mmmrm-then-persistent-ranged",
                "live-magic-melee-then-persistent-ranged",
                "live-human-ranged-pressure",
                "live-human-ranged-pressure-fullgear",
                "live-human-recurring-ranged-pressure-fullgear"):
            chosen_styles = self._score_seeded_varied_prefix_then_persistent(
                scores,
                inputs,
                variant=self.script)
        elif self.script == "seeded-comprehensive-human-ranged-pressure":
            chosen_styles = self._score_comprehensive_human_ranged_pressure(
                scores, inputs)
        elif self.script in (
                "seeded-three-style-then-ranged-gear-fakes",
                "seeded-ranged-phase-balanced-gear-fakes",
                "seeded-freeze-then-ranged-phase-balanced-gear-fakes",
                "seeded-ranged-multigear-movement-pressure",
                "seeded-complete-history-ranged-pressure",
                "seeded-complete-history-balanced-pressure",
                "live-ranged-gear-flick-pressure",
                "heldout-ranged-multigear-movement-a",
                "heldout-ranged-multigear-movement-b"):
            chosen_styles = self._score_ranged_gear_fake_pressure(
                scores,
                inputs,
                held_out=(self.script == "live-ranged-gear-flick-pressure"),
                multigear_variant=(
                    self.script
                    if self.script in (
                        "seeded-ranged-multigear-movement-pressure",
                        "heldout-ranged-multigear-movement-a",
                        "heldout-ranged-multigear-movement-b")
                    else None),
                complete_history=(
                    self.script in (
                        "seeded-complete-history-ranged-pressure",
                        "seeded-complete-history-balanced-pressure")),
                balanced_complete_history=(
                    self.script
                    == "seeded-complete-history-balanced-pressure"),
                phase_balanced=(
                    self.script in (
                        "seeded-ranged-phase-balanced-gear-fakes",
                        "seeded-freeze-then-ranged-phase-balanced-gear-fakes")),
                freeze_then_ranged=(
                    self.script
                    == "seeded-freeze-then-ranged-phase-balanced-gear-fakes"))
        elif self.script in (
                "adaptive-off-prayer",
                "adaptive-random-off-prayer"):
            chosen_styles = self._score_adaptive_off_prayer(
                scores,
                inputs,
                random_choice=(
                    self.script == "adaptive-random-off-prayer"))
        elif self.script == "hidden-random-style":
            chosen_styles = self._score_hidden_random_style(scores, inputs)
        elif self.script == "seeded-block-switch":
            chosen_styles = self._score_seeded_block_switch(scores, inputs)
        elif self.script == "seeded-rapid-switch":
            chosen_styles = self._score_seeded_rapid_switch(scores, inputs)
        elif self.script == "freeze-stepout-halberd":
            chosen_styles = self._score_freeze_stepout_halberd(scores, inputs)
        elif self.script == "honest-gear-style-transitions":
            chosen_styles = self._score_honest_gear_style_transitions(
                scores, inputs)

        if self.defence in DYNAMIC_DEFENCE_NAMES:
            self._score_dynamic_defence(scores, inputs)
        else:
            scores[
                :,
                schema.DEFENCE_BASE + _DEFENCE_BY_NAME[self.defence],
            ] = 100.0
            if self.defence in ("smite", "redemption"):
                scores[
                    :,
                    schema.DEFENCE_BASE + _NON_PROTECTION_FALLBACK,
                ] = 0.0
        if self.script == "freeze-stepout-halberd":
            # This curriculum owns its exact step-out/route-drag movement.
            pass
        elif self.script in (
                "adaptive-off-prayer",
                "adaptive-random-off-prayer",
                "hidden-random-style",
                "seeded-block-switch",
                "seeded-rapid-switch",
                "varied-opener-then-persistent-ranged",
                "varied-opener-then-persistent-balanced",
                "seeded-varied-prefix-then-persistent-ranged",
                "seeded-three-style-prefix-then-persistent-ranged",
                "seeded-varied-prefix-then-persistent-balanced",
                "seeded-long-mr-prefix-then-persistent-balanced",
                "seeded-mixed-then-ranged-pressure",
                "seeded-mixed-then-balanced-pressure",
                "seeded-recurring-three-style-blocks",
                "seeded-comprehensive-human-ranged-pressure",
                "live-rmm-then-persistent-ranged",
                "live-mmmrm-then-persistent-ranged",
                "live-magic-melee-then-persistent-ranged",
                "live-human-ranged-pressure",
                "live-human-ranged-pressure-fullgear",
                "live-human-recurring-ranged-pressure-fullgear",
                "seeded-three-style-then-ranged-gear-fakes",
                "seeded-ranged-phase-balanced-gear-fakes",
                "seeded-freeze-then-ranged-phase-balanced-gear-fakes",
                "seeded-ranged-multigear-movement-pressure",
                "seeded-complete-history-ranged-pressure",
                "seeded-complete-history-balanced-pressure",
                "live-ranged-gear-flick-pressure",
                "heldout-ranged-multigear-movement-a",
                "heldout-ranged-multigear-movement-b",
                "honest-gear-style-transitions",
                "fixed-magic",
                "fixed-ranged"):
            scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
            if chosen_styles is not None:
                if self.script == "honest-gear-style-transitions":
                    self._score_honest_melee_positioning(
                        scores, inputs, chosen_styles)
                else:
                    self._score_adaptive_melee_chase(
                        scores, inputs, chosen_styles)
        else:
            scores[
                :,
                schema.MOVEMENT_BASE + schema.MOVE_STAND_UNDER,
            ] = 100.0
            scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 0.0
        if self.script in (
                "fixed-melee",
                "fixed-halberd",
                "magic-then-halberd",
                "one-magic-then-halberd",
                "varied-opener-then-halberd",
                "vls-pressure",
                "voidwaker-pressure"):
            self._score_melee_chase(scores, inputs)
        scores[:, schema.SUPPLY_BASE + schema.SUPPLY_NONE] = 100.0
        if (
                self.script.startswith("fixed-")
                or self.script
                in (
                    "seeded-ranged-phase-balanced-gear-fakes",
                    "seeded-freeze-then-ranged-phase-balanced-gear-fakes",
                    "seeded-complete-history-ranged-pressure",
                    "seeded-complete-history-balanced-pressure",
                    "seeded-recurring-three-style-blocks",
                    "seeded-comprehensive-human-ranged-pressure",
                    "live-human-recurring-ranged-pressure-fullgear",
                    "honest-gear-style-transitions")
                or self.use_vengeance):
            self._score_fixed_supply(scores, inputs)
        if self.use_vengeance:
            self._score_vengeance_supply(scores, inputs)
        self._decision_tick += 1
        return scores, np.zeros(count, dtype=np.float32)

    @staticmethod
    def _score_fixed_supply(
            scores: np.ndarray, inputs: np.ndarray) -> None:
        """Use the Java cohort's natural low-HP eating thresholds."""
        hp = inputs[:, schema.INPUT_SELF_HP] * 99.0
        food = inputs[:, schema.INPUT_SELF_FOOD_COUNT] * 28.0
        brew = inputs[:, schema.INPUT_SELF_BREW_COUNT] * 8.0
        can_triple = (brew >= 0.5) | (food >= 1.5)
        triple = (hp <= 45.0) & can_triple
        safe = (hp <= 58.0) & (food >= 0.5) & ~triple
        eating = safe | triple

        scores[
            eating,
            schema.SUPPLY_BASE + schema.SUPPLY_NONE,
        ] = 0.0
        scores[
            safe,
            schema.SUPPLY_BASE + schema.SUPPLY_SAFE_EAT,
        ] = 100.0
        scores[
            triple,
            schema.SUPPLY_BASE + schema.SUPPLY_TRIPLE_EAT,
        ] = 100.0

    @staticmethod
    def _score_vengeance_supply(
            scores: np.ndarray, inputs: np.ndarray) -> None:
        """Use each legal trinket charge without sacrificing an urgent eat."""
        hp = inputs[:, schema.INPUT_SELF_HP] * 99.0
        food = inputs[:, schema.INPUT_SELF_FOOD_COUNT] * 28.0
        brew = inputs[:, schema.INPUT_SELF_BREW_COUNT] * 8.0
        can_triple = (brew >= 0.5) | (food >= 1.5)
        triple = (hp <= 45.0) & can_triple
        safe = (hp <= 58.0) & (food >= 0.5) & ~triple

        scores[
            :,
            schema.SUPPLY_BASE + schema.SUPPLY_VENGEANCE_TRINKET,
        ] = 150.0
        scores[
            safe,
            schema.SUPPLY_BASE + schema.SUPPLY_SAFE_EAT,
        ] = 200.0
        scores[
            triple,
            schema.SUPPLY_BASE + schema.SUPPLY_TRIPLE_EAT,
        ] = 200.0

    def _score_adaptive_off_prayer(
            self,
            scores: np.ndarray,
            inputs: np.ndarray,
            random_choice: bool = False) -> np.ndarray:
        """Attack around the protection visible in the delayed observation."""
        count = int(inputs.shape[0])
        rows = np.arange(count, dtype=np.intp)
        fight_lanes = self._fight_lanes(count)
        visible_protection = (
            inputs[
                :,
                schema.INPUT_OPP_PROTECT_MAGIC:
                schema.INPUT_OPP_PROTECT_MELEE + 1,
            ] >= 0.5
        )
        chosen = np.full(count, schema.STYLE_NONE, dtype=np.int8)

        for row in rows:
            unprotected = np.flatnonzero(~visible_protection[row])
            if unprotected.size == 0:
                continue
            if random_choice:
                alternatives = unprotected
                phase = self._keyed_choice_index(
                    int(fight_lanes[row]),
                    self._decision_tick,
                    int(alternatives.size))
            else:
                # A normal protection prayer leaves exactly two choices.
                # Stagger the alternating phase by fight lane so the cohort
                # does not collapse to one synchronized style. With no visible
                # protection, use the first two choices as a deterministic
                # opening fallback.
                alternatives = unprotected[:2]
                phase = (int(fight_lanes[row]) + self._decision_tick) % (
                    alternatives.size)
            chosen[row] = int(alternatives[phase])

        for style in (
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE):
            selected = chosen == style
            if not np.any(selected):
                continue
            attack_row = (
                schema.COMBAT_ATTACK_BASE
                + style * 2
                + schema.ATTACK_INTENT_ATTACK)
            scores[selected, attack_row] = 100.0
            self._score_style_equip(scores, selected, style)
        return chosen

    def _score_freeze_stepout_halberd(
            self, scores: np.ndarray, inputs: np.ndarray) -> np.ndarray:
        """Freeze, visibly pre-equip, then use standing or routed halberd reach."""
        count = int(inputs.shape[0])
        rows = np.arange(count, dtype=np.intp)
        fight_lanes = self._fight_lanes(count)
        scenario = (fight_lanes + self.seed) % 12
        curriculum = scenario < 6
        route_drag = curriculum & (scenario >= 3)

        # The other half of the lanes remain varied controls rather than making
        # every scripted opponent repeat the same specialist pattern.
        chosen = np.full(count, schema.STYLE_NONE, dtype=np.int8)
        controls = ~curriculum
        chosen[controls] = np.asarray([
            self._keyed_choice_index(
                int(fight_lanes[row]), self._decision_tick, 3)
            for row in rows[controls]
        ], dtype=np.int8)

        opponent_frozen = inputs[:, schema.INPUT_OPP_FROZEN] >= 0.5
        active_freeze = curriculum & opponent_frozen
        if (
                self._freeze_halberd_last_visible is None
                or self._freeze_halberd_last_visible.shape != (count,)):
            self._freeze_halberd_last_visible = np.zeros(count, dtype=bool)
        freq = schema.WEAPON_EMBED_FREQ
        halberd_visible = (
            np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_SIN],
                np.sin(gear.NOXIOUS_HALBERD.item_id * freq),
                atol=1.0e-5)
            & np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_COS],
                np.cos(gear.NOXIOUS_HALBERD.item_id * freq),
                atol=1.0e-5)
        )
        # A target roll is forbidden until the halberd was already visible on
        # the previous decision. The defender therefore receives one complete
        # T-1 observation of the weapon, freeze and position before the roll.
        pre_exposed = (
            self._freeze_halberd_last_visible
            & halberd_visible
            & active_freeze
        )
        self._freeze_halberd_last_visible[:] = (
            halberd_visible & active_freeze)

        rel_dx = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DX] * 16.0).astype(np.int16)
        rel_dy = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DY] * 16.0).astype(np.int16)
        distance = np.maximum(np.abs(rel_dx), np.abs(rel_dy))
        self_frozen = inputs[:, schema.INPUT_SELF_FROZEN] >= 0.5
        standing_roll = (
            (distance == 2)
            & (~route_drag | self_frozen)
        )
        routed_roll = (
            route_drag
            & ~self_frozen
            & (distance >= 3)
            & (distance <= 4)
        )
        halberd_roll = active_freeze & pre_exposed & (
            standing_roll | routed_roll)

        # Obtain or renew the freeze with the normal magic action. Once it is
        # observed, hold the Noxious halberd throughout the bounded sequence.
        chosen[curriculum & ~opponent_frozen] = schema.STYLE_MAGIC
        chosen[halberd_roll] = schema.STYLE_MELEE
        scores[active_freeze & ~halberd_roll, schema.COMBAT_NO_ATTACK] = 100.0
        self._score_chosen_styles(
            scores,
            np.where(halberd_roll, schema.STYLE_NONE, chosen))
        scores[
            halberd_roll,
            schema.COMBAT_ATTACK_BASE
            + schema.STYLE_MELEE * 2
            + schema.ATTACK_INTENT_ATTACK,
        ] = 100.0
        halberd_local = int(np.flatnonzero(
            gear.DIRECT_GEAR_ITEMS == gear.NOXIOUS_HALBERD.item_id)[0])
        scores[
            active_freeze,
            schema.GEAR_BASE + halberd_local,
        ] = 100.0
        # HOLD normally restores the staff when no direct gear action executes.
        # Alternate the two available body pieces so a real state-changing
        # action keeps the exposed halberd visible during its seven-tick
        # cooldown without changing its offensive roll. Unequipping the shield
        # first also makes the two-handed halberd equip executable.
        body_rows = np.flatnonzero(
            (gear.DIRECT_GEAR_SLOTS == gear.SLOT_CHEST)
            & ~gear.DIRECT_GEAR_UNEQUIP)
        shield_unequip = np.flatnonzero(
            (gear.DIRECT_GEAR_SLOTS == gear.SLOT_SHIELD)
            & gear.DIRECT_GEAR_UNEQUIP)
        active_rows = np.flatnonzero(active_freeze)
        scores[np.ix_(
            active_rows,
            schema.GEAR_BASE + body_rows,
        )] = 90.0
        scores[
            active_freeze,
            schema.GEAR_BASE + int(shield_unequip[0]),
        ] = 90.0

        scores[:, schema.MOVEMENT_BASE + schema.MOVE_NONE] = 100.0
        # From ordinary one-tile melee range, step away to standing halberd
        # range. Standing variants also close to two; route variants preserve
        # distance three/four so TargetRoute itself demonstrates drag-in reach.
        move_to_two = (
            active_freeze
            & ~self_frozen
            & ((distance <= 1) | (~route_drag & (distance > 2)))
        )
        move_to_four = (
            active_freeze
            & route_drag
            & ~self_frozen
            & ((distance < 3) | (distance > 4))
        )
        self._score_distance_target(
            scores, rel_dx, rel_dy, move_to_two, target_distance=2)
        self._score_distance_target(
            scores, rel_dx, rel_dy, move_to_four, target_distance=4)
        self._score_adaptive_melee_chase(
            scores, inputs, np.where(controls, chosen, schema.STYLE_NONE))
        return chosen

    @staticmethod
    def _score_chosen_styles(
            scores: np.ndarray, chosen: np.ndarray) -> None:
        for style in (
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE):
            selected = chosen == style
            if not np.any(selected):
                continue
            attack_row = (
                schema.COMBAT_ATTACK_BASE
                + style * 2
                + schema.ATTACK_INTENT_ATTACK)
            scores[selected, attack_row] = 100.0
            ScriptedPolicy._score_style_equip(scores, selected, style)

    @staticmethod
    def _score_distance_target(
            scores: np.ndarray,
            rel_dx: np.ndarray,
            rel_dy: np.ndarray,
            selected: np.ndarray,
            target_distance: int) -> None:
        """Prefer a legal direct step whose resulting range is exactly target."""
        current = np.maximum(np.abs(rel_dx), np.abs(rel_dy))
        before_error = np.abs(current - target_distance)
        scale = target_distance / np.maximum(current, 1)
        ideal_x = np.rint(rel_dx * scale).astype(np.int16)
        ideal_y = np.rint(rel_dy * scale).astype(np.int16)
        overlap = current == 0
        ideal_x = np.where(overlap, target_distance, ideal_x)
        ideal_y = np.where(overlap, 0, ideal_y)

        for local_action in range(
                schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT):
            dx, dy = schema.MOVEMENT_OFFSETS[local_action]
            remaining_x = rel_dx - int(dx)
            remaining_y = rel_dy - int(dy)
            remaining = np.maximum(
                np.abs(remaining_x), np.abs(remaining_y))
            error = np.abs(remaining - target_distance)
            improves = selected & (error < before_error)
            alignment_error = (
                np.abs(remaining_x - ideal_x)
                + np.abs(remaining_y - ideal_y)
            )
            scores[
                improves,
                schema.MOVEMENT_BASE + local_action,
            ] = (
                200.0
                - 20.0 * error[improves]
                - alignment_error[improves]
            )

    def _score_hidden_random_style(
            self, scores: np.ndarray, inputs: np.ndarray) -> np.ndarray:
        """Choose all three attack styles uniformly from a hidden keyed seed."""
        count = int(inputs.shape[0])
        rows = np.arange(count, dtype=np.intp)
        fight_lanes = self._fight_lanes(count)
        chosen = np.asarray([
            self._keyed_choice_index(
                int(fight_lanes[row]), self._decision_tick, 3)
            for row in rows
        ], dtype=np.int8)
        for style in (
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE):
            selected = chosen == style
            if not np.any(selected):
                continue
            attack_row = (
                schema.COMBAT_ATTACK_BASE
                + style * 2
                + schema.ATTACK_INTENT_ATTACK)
            scores[selected, attack_row] = 100.0
            self._score_style_equip(scores, selected, style)
        return chosen

    def _score_seeded_block_switch(
            self, scores: np.ndarray, inputs: np.ndarray) -> np.ndarray:
        """Cycle every style permutation through A,B,A,A,A,C,C attack rolls."""
        count = int(inputs.shape[0])
        rows = np.arange(count, dtype=np.intp)
        ready = inputs[:, schema.INPUT_SELF_ATTACK_READY] >= 0.5
        if (
                self._block_sequence_positions is None
                or self._block_sequence_positions.shape != (count,)):
            self._block_sequence_positions = np.zeros(count, dtype=np.int8)
            self._block_last_attack_ready = ready.copy()
            self._block_advance_when_ready = np.zeros(count, dtype=bool)
        else:
            # A true-to-false readiness edge means the preceding selected
            # ordinary attack launched and put the weapon on cooldown. Retain
            # its gear until the next attack-ready decision, then advance.
            launched = self._block_last_attack_ready & ~ready
            self._block_advance_when_ready |= launched
            advance = self._block_advance_when_ready & ready
            self._block_sequence_positions[advance] = (
                self._block_sequence_positions[advance] + 1
            ) % _BLOCK_SEQUENCE_SLOTS.size
            self._block_advance_when_ready[advance] = False
            self._block_last_attack_ready[:] = ready

        fight_lanes = self._fight_lanes(count)
        permutation_indices = (
            fight_lanes + (self.seed % len(_BLOCK_STYLE_PERMUTATIONS))
        ) % len(_BLOCK_STYLE_PERMUTATIONS)
        sequence_slots = _BLOCK_SEQUENCE_SLOTS[
            self._block_sequence_positions]
        chosen = _BLOCK_STYLE_PERMUTATIONS[
            permutation_indices, sequence_slots]

        for style in (
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE):
            selected = chosen == style
            if not np.any(selected):
                continue
            attack_row = (
                schema.COMBAT_ATTACK_BASE
                + style * 2
                + schema.ATTACK_INTENT_ATTACK)
            scores[selected, attack_row] = 100.0
            if style == schema.STYLE_MELEE:
                halberd_local = int(np.flatnonzero(
                    gear.DIRECT_GEAR_ITEMS
                    == gear.NOXIOUS_HALBERD.item_id)[0])
                scores[
                    selected,
                    schema.GEAR_BASE + halberd_local,
                ] = 100.0
            else:
                self._score_style_equip(scores, selected, style)
        return chosen

    def _score_seeded_rapid_switch(
            self, scores: np.ndarray, inputs: np.ndarray) -> np.ndarray:
        """Cycle a lane-permuted Magic/Ranged/Melee style on every real roll."""
        count = int(inputs.shape[0])
        rows = np.arange(count, dtype=np.intp)
        ready = inputs[:, schema.INPUT_SELF_ATTACK_READY] >= 0.5
        if (
                self._rapid_sequence_positions is None
                or self._rapid_sequence_positions.shape != (count,)):
            self._rapid_sequence_positions = np.zeros(count, dtype=np.int8)
            self._rapid_last_attack_ready = ready.copy()
            self._rapid_advance_when_ready = np.zeros(count, dtype=bool)
        else:
            launched = self._rapid_last_attack_ready & ~ready
            self._rapid_advance_when_ready |= launched
            advance = self._rapid_advance_when_ready & ~ready
            self._rapid_sequence_positions[advance] = (
                self._rapid_sequence_positions[advance] + 1
            ) % 3
            self._rapid_advance_when_ready[advance] = False
            self._rapid_last_attack_ready[:] = ready

        fight_lanes = self._fight_lanes(count)
        permutation_indices = (
            fight_lanes + (self.seed % len(_BLOCK_STYLE_PERMUTATIONS))
        ) % len(_BLOCK_STYLE_PERMUTATIONS)
        chosen = _BLOCK_STYLE_PERMUTATIONS[
            permutation_indices, self._rapid_sequence_positions]

        expected_items = np.asarray((
            gear.ZURIELS_STAFF.item_id,
            gear.ZARYTE_CROSSBOW.item_id,
            gear.VESTAS_LONGSWORD.item_id,
        ), dtype=np.int32)[chosen]
        angles = expected_items * schema.WEAPON_EMBED_FREQ
        already_visible = (
            np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_SIN],
                np.sin(angles),
                atol=1.0e-5)
            & np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_COS],
                np.cos(angles),
                atol=1.0e-5)
        )

        # Equip during the prior cooldown decision. A style may roll only
        # after that weapon is present in the ordinary T-1 observation.
        scores[~already_visible, schema.COMBAT_NO_ATTACK] = 100.0
        for style in (
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE):
            selected = chosen == style
            if not np.any(selected):
                continue
            visible = selected & already_visible
            attack_row = (
                schema.COMBAT_ATTACK_BASE
                + style * 2
                + schema.ATTACK_INTENT_ATTACK)
            scores[visible, attack_row] = 100.0
            self._score_style_equip(scores, selected, style)
        return chosen

    def _score_varied_opener_then_persistent_style(
            self,
            scores: np.ndarray,
            inputs: np.ndarray,
            balanced_terminal: bool) -> np.ndarray:
        """Replay the human mixed opener, then hold one style indefinitely.

        The position advances only after a real attack consumes the ready
        state. Each next weapon is equipped during cooldown so its normal T-1
        exposure is present before the following roll.
        """
        count = int(inputs.shape[0])
        rows = np.arange(count, dtype=np.intp)
        fight_lanes = self._fight_lanes(count)
        ready = inputs[:, schema.INPUT_SELF_ATTACK_READY] >= 0.5
        if (
                self._persistent_sequence_positions is None
                or self._persistent_sequence_positions.shape
                != (count,)):
            self._persistent_sequence_positions = np.zeros(
                count, dtype=np.int16)
            self._persistent_last_attack_ready = ready.copy()
        else:
            launched = (
                self._persistent_last_attack_ready
                & ~ready)
            self._persistent_sequence_positions[launched] = np.minimum(
                self._persistent_sequence_positions[launched] + 1,
                _VARIED_OPENER_PERSISTENT_RANGED_STYLES.size)
            self._persistent_last_attack_ready[:] = ready

        position = self._persistent_sequence_positions
        opener_index = np.minimum(
            position,
            _VARIED_OPENER_PERSISTENT_RANGED_STYLES.size - 1)
        chosen = _VARIED_OPENER_PERSISTENT_RANGED_STYLES[
            opener_index].copy()
        if balanced_terminal:
            terminal = np.asarray((
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE,
            ), dtype=np.int8)[(fight_lanes + self.seed) % 3]
        else:
            terminal = np.full(
                count, schema.STYLE_RANGED, dtype=np.int8)
        persistent = (
            position >= _VARIED_OPENER_PERSISTENT_RANGED_STYLES.size)
        chosen[persistent] = terminal[persistent]

        expected_items = np.asarray((
            gear.ZURIELS_STAFF.item_id,
            gear.ZARYTE_CROSSBOW.item_id,
            gear.NOXIOUS_HALBERD.item_id,
        ), dtype=np.int32)[chosen]
        angles = expected_items * schema.WEAPON_EMBED_FREQ
        already_visible = (
            np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_SIN],
                np.sin(angles),
                atol=1.0e-5)
            & np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_COS],
                np.cos(angles),
                atol=1.0e-5)
        )
        rel_dx = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DX] * 16.0).astype(np.int16)
        rel_dy = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DY] * 16.0).astype(np.int16)
        distance = np.maximum(np.abs(rel_dx), np.abs(rel_dy))
        melee_standing = (
            (distance >= 1)
            & (distance <= gear.NOXIOUS_HALBERD.max_distance))
        roll_ready = (
            already_visible
            & ((chosen != schema.STYLE_MELEE) | melee_standing))
        scores[~roll_ready, schema.COMBAT_NO_ATTACK] = 100.0

        for style in (
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE):
            selected = chosen == style
            if not np.any(selected):
                continue
            visible = selected & roll_ready
            attack_row = (
                schema.COMBAT_ATTACK_BASE
                + style * 2
                + schema.ATTACK_INTENT_ATTACK)
            scores[visible, attack_row] = 100.0
            if style == schema.STYLE_MELEE:
                halberd_local = int(np.flatnonzero(
                    gear.DIRECT_GEAR_ITEMS
                    == gear.NOXIOUS_HALBERD.item_id)[0])
                shield_unequip_local = int(np.flatnonzero(
                    (gear.DIRECT_GEAR_SLOTS == gear.SLOT_SHIELD)
                    & gear.DIRECT_GEAR_UNEQUIP)[0])
                has_shield = (
                    inputs[:, schema.INPUT_SELF_HAS_SHIELD] >= 0.5)
                scores[
                    selected & ~has_shield,
                    schema.GEAR_BASE + halberd_local,
                ] = 100.0
                scores[
                    selected & has_shield,
                    schema.GEAR_BASE + shield_unequip_local,
                ] = 100.0
            else:
                self._score_style_equip(scores, selected, style)

        # Do not treat possible same-tick route reach as already close. Walk
        # until a pre-equipped halberd is within its real standing range, then
        # launch on the following decision with ordinary T-1 visibility.
        needs_close = (
            (chosen == schema.STYLE_MELEE)
            & (distance > gear.NOXIOUS_HALBERD.max_distance))
        for local_action in range(
                schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT):
            dx, dy = schema.MOVEMENT_OFFSETS[local_action]
            remaining = np.maximum(
                np.abs(rel_dx - int(dx)),
                np.abs(rel_dy - int(dy)))
            improves = needs_close & (remaining < distance)
            scores[
                improves,
                schema.MOVEMENT_BASE + local_action,
            ] = 200.0 - remaining[improves]
        return chosen

    @staticmethod
    def honest_style_transition_spec(
            fight_lanes: np.ndarray,
            seed: int) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        """Return all six A->B pairs crossed with one-to-three A rolls."""
        lanes = np.asarray(fight_lanes, dtype=np.int64)
        variant = (lanes + int(seed)) % (
            len(_HONEST_STYLE_TRANSITION_PAIRS) * 3)
        pairs = _HONEST_STYLE_TRANSITION_PAIRS[variant // 3]
        prefix_lengths = (variant % 3 + 1).astype(np.int16, copy=False)
        return pairs[:, 0], pairs[:, 1], prefix_lengths

    @staticmethod
    def honest_style_transition_block_starts(
            fight_lanes: np.ndarray,
            seed: int) -> tuple[np.ndarray, np.ndarray]:
        """Return the first B roll indexes for the cold and warm blocks."""
        _from_style, _to_style, prefix_lengths = (
            ScriptedPolicy.honest_style_transition_spec(fight_lanes, seed))
        cold = prefix_lengths
        warm = (
            cold
            + HONEST_STYLE_TRANSITION_B_ROLLS
            + prefix_lengths)
        return cold, warm

    def _score_honest_gear_style_transitions(
            self,
            scores: np.ndarray,
            inputs: np.ndarray) -> np.ndarray:
        """Run every honest-gear A->B transition cold, then once warm."""
        count = int(inputs.shape[0])
        rows = np.arange(count, dtype=np.intp)
        fight_lanes = self._fight_lanes(count)
        ready = inputs[:, schema.INPUT_SELF_ATTACK_READY] >= 0.5
        if (
                self._honest_transition_positions is None
                or self._honest_transition_positions.shape != (count,)):
            self._honest_transition_positions = np.zeros(
                count, dtype=np.int16)
            self._honest_transition_last_attack_ready = ready.copy()
        else:
            launched = (
                self._honest_transition_last_attack_ready
                & ~ready)
            self._honest_transition_positions[launched] += 1
            self._honest_transition_last_attack_ready[:] = ready

        from_style, to_style, prefix_lengths = (
            self.honest_style_transition_spec(fight_lanes, self.seed))
        cold_b_start = prefix_lengths
        warm_b_start = (
            cold_b_start
            + HONEST_STYLE_TRANSITION_B_ROLLS
            + prefix_lengths)
        cold_b_end = cold_b_start + HONEST_STYLE_TRANSITION_B_ROLLS
        position = self._honest_transition_positions
        chosen = np.where(
            position < cold_b_start,
            from_style,
            np.where(
                position < cold_b_end,
                to_style,
                np.where(
                    position < warm_b_start,
                    from_style,
                    to_style))).astype(np.int8, copy=False)

        expected_items = np.asarray((
            gear.ZURIELS_STAFF.item_id,
            gear.ZARYTE_CROSSBOW.item_id,
            gear.NOXIOUS_HALBERD.item_id,
        ), dtype=np.int32)[chosen]
        angles = expected_items * schema.WEAPON_EMBED_FREQ
        weapon_visible = (
            np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_SIN],
                np.sin(angles),
                atol=1.0e-5)
            & np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_COS],
                np.cos(angles),
                atol=1.0e-5))
        rel_dx = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DX] * 16.0).astype(np.int16)
        rel_dy = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DY] * 16.0).astype(np.int16)
        distance = np.maximum(np.abs(rel_dx), np.abs(rel_dy))
        melee_reachable = (
            (distance >= 1)
            & (distance <= gear.NOXIOUS_HALBERD.max_distance))
        roll_ready = (
            weapon_visible
            & ((chosen != schema.STYLE_MELEE) | melee_reachable))
        attack_or_chase = (
            roll_ready
            | (weapon_visible
               & (chosen == schema.STYLE_MELEE)
               & (distance > gear.NOXIOUS_HALBERD.max_distance)))
        scores[~attack_or_chase, schema.COMBAT_NO_ATTACK] = 200.0

        for style in (
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE):
            selected = chosen == style
            if not np.any(selected):
                continue
            attack = selected & attack_or_chase
            attack_row = (
                schema.COMBAT_ATTACK_BASE
                + style * 2
                + schema.ATTACK_INTENT_ATTACK)
            scores[attack, attack_row] = 100.0
            self._score_style_full_loadout(scores, selected, style)
            self._score_weapon_hold_toggle(
                scores, selected & weapon_visible)
            if style == schema.STYLE_MELEE:
                shield_unequip_local = int(np.flatnonzero(
                    (gear.DIRECT_GEAR_SLOTS == gear.SLOT_SHIELD)
                    & gear.DIRECT_GEAR_UNEQUIP)[0])
                scores[
                    selected,
                    schema.GEAR_BASE + shield_unequip_local,
                ] = 100.0
        return chosen

    def _score_seeded_varied_prefix_then_persistent(
            self,
            scores: np.ndarray,
            inputs: np.ndarray,
            variant: str) -> np.ndarray:
        """Use varied real attack histories before a persistent terminal style.

        The original generic cohort varies the prefix length from zero through
        ten. The long M/R cohort varies it from four through sixteen and uses
        wider attack cadences before a balanced persistent terminal style.
        Exact-live cohorts are evaluation-only by convention. Positions
        advance only after a real launch.
        """
        balanced_terminal = variant in (
            "seeded-varied-prefix-then-persistent-balanced",
            "seeded-long-mr-prefix-then-persistent-balanced",
            "seeded-mixed-then-balanced-pressure",
        )
        long_mr_prefix = (
            variant == "seeded-long-mr-prefix-then-persistent-balanced")
        three_style_ranged_prefix = (
            variant == "seeded-three-style-prefix-then-persistent-ranged")
        mixed_pressure = variant in (
            "seeded-mixed-then-ranged-pressure",
            "seeded-mixed-then-balanced-pressure",
        )
        exact_rmm_prefix = (
            variant == "live-rmm-then-persistent-ranged")
        exact_mmmrm_prefix = (
            variant == "live-mmmrm-then-persistent-ranged")
        exact_magic_melee_prefix = (
            variant == "live-magic-melee-then-persistent-ranged")
        exact_human_pressure = (
            variant in (
                "live-human-ranged-pressure",
                "live-human-ranged-pressure-fullgear"))
        exact_human_fullgear = (
            variant == "live-human-ranged-pressure-fullgear")
        recurring_three_style = (
            variant == "seeded-recurring-three-style-blocks")
        exact_recurring_ranged = (
            variant
            == "live-human-recurring-ranged-pressure-fullgear")
        recurring_fullgear = (
            recurring_three_style or exact_recurring_ranged)
        count = int(inputs.shape[0])
        rows = np.arange(count, dtype=np.intp)
        fight_lanes = self._fight_lanes(count)
        ready = inputs[:, schema.INPUT_SELF_ATTACK_READY] >= 0.5
        if (
                self._seeded_persistent_positions is None
                or self._seeded_persistent_positions.shape != (count,)):
            self._seeded_persistent_positions = np.zeros(
                count, dtype=np.int16)
            self._seeded_persistent_last_attack_ready = ready.copy()
            self._seeded_persistent_pause_remaining = np.zeros(
                count, dtype=np.int8)
        else:
            launched = (
                self._seeded_persistent_last_attack_ready
                & ~ready)
            self._seeded_persistent_positions[launched] += 1
            launched_rows = np.flatnonzero(launched)
            if launched_rows.size:
                position = self._seeded_persistent_positions[launched_rows]
                lane = fight_lanes[launched_rows]
                if exact_human_pressure:
                    # The held-out human trace had normal M/R opening swaps,
                    # then long crossbow holds with irregular attack gaps.
                    # It is never accepted by rollout generation.
                    live_pauses = np.asarray((
                        0, 0, 0, 3, 0, 0, 3, 6, 3, 6, 3, 1,
                        0, 0, 0, 0, 0, 0, 15, 0, 3, 0, 4,
                    ), dtype=np.int8)
                    self._seeded_persistent_pause_remaining[
                        launched_rows] = live_pauses[
                            (position - 1) % live_pauses.size]
                elif exact_recurring_ranged:
                    # Plausible pauses around the exact held-out roll order.
                    # Weapon cooldown and required pre-equips still own the
                    # underlying real cadence; these are only extra waits.
                    live_pauses = np.asarray((
                        1, 0, 1, 2, 0, 1, 0, 2, 1, 0, 2, 0,
                        3, 0, 1, 0, 2, 0, 1, 3, 0, 2, 0, 1,
                    ), dtype=np.int8)
                    self._seeded_persistent_pause_remaining[
                        launched_rows] = live_pauses[
                            (position - 1) % live_pauses.size]
                elif recurring_three_style:
                    pause = (
                        lane * 7
                        + position * 5
                        + self.seed * 11
                        + lane * position
                    ) % 4
                    # A sparse longer hesitation avoids teaching one perfect
                    # metronome while keeping ordinary PvP cooldowns dominant.
                    pause += (
                        (lane * 3 + position + self.seed) % 17 == 0
                    ).astype(np.int8) * 2
                    self._seeded_persistent_pause_remaining[
                        launched_rows] = pause.astype(np.int8, copy=False)
                elif exact_rmm_prefix:
                    # Match the observed irregular R->M->M->R handoff and
                    # include one later long hold as a recovery-only gate.
                    # This cadence is intentionally reserved from the generic
                    # training cohort.
                    live_pauses = np.asarray(
                        (1, 5, 9, 0, 0, 0, 12, 0, 0, 0),
                        dtype=np.int8)
                    self._seeded_persistent_pause_remaining[
                        launched_rows] = live_pauses[
                            (position - 1) % live_pauses.size]
                elif exact_mmmrm_prefix or exact_magic_melee_prefix:
                    # Preserve the exact observed attack-roll order. Ordinary
                    # weapon cooldowns and the required pre-equip tick supply
                    # its real cadence without fabricating extra waits.
                    self._seeded_persistent_pause_remaining[
                        launched_rows] = 0
                elif mixed_pressure:
                    self._seeded_persistent_pause_remaining[
                        launched_rows] = (
                            lane * 7
                            + position * 5
                            + self.seed * 11
                            + lane * position
                        ) % 6
                elif long_mr_prefix:
                    self._seeded_persistent_pause_remaining[
                        launched_rows] = (
                            lane * 7
                            + position * 11
                            + self.seed * 3
                            + lane * position
                        ) % 8
                else:
                    self._seeded_persistent_pause_remaining[
                        launched_rows] = (
                            lane * 5
                            + position * 7
                            + self.seed * 3
                            + lane * position
                        ) % 4
            self._seeded_persistent_last_attack_ready[:] = ready

        position = self._seeded_persistent_positions
        if exact_recurring_ranged:
            live_sequence = np.asarray((
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_RANGED,
                schema.STYLE_RANGED,
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_RANGED,
                schema.STYLE_RANGED,
                schema.STYLE_RANGED,
                schema.STYLE_RANGED,
                schema.STYLE_RANGED,
                schema.STYLE_RANGED,
                schema.STYLE_RANGED,
                schema.STYLE_MAGIC,
                schema.STYLE_MAGIC,
                schema.STYLE_MAGIC,
            ), dtype=np.int8)
            prefix_length = np.full(count, live_sequence.size, dtype=np.int16)
            prefix_index = np.minimum(position, live_sequence.size - 1)
            chosen = live_sequence[prefix_index].copy()
        elif recurring_three_style:
            # Every cycle contains all three real attack styles in contiguous
            # blocks. Lane, seed and cycle vary both block order and lengths,
            # so this is not a disguised terminal tail or one memorized trace.
            chosen = self.seeded_recurring_block_styles(
                fight_lanes, position, self.seed)
            prefix_length = np.zeros(count, dtype=np.int16)
        elif exact_human_pressure:
            prefix_length = np.full(count, 3, dtype=np.int16)
            live_prefix = np.asarray((
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MAGIC,
            ), dtype=np.int8)
            prefix_index = np.minimum(position, live_prefix.size - 1)
            chosen = live_prefix[prefix_index].copy()
        elif exact_rmm_prefix:
            prefix_length = np.full(count, 3, dtype=np.int16)
            live_prefix = np.asarray((
                schema.STYLE_RANGED,
                schema.STYLE_MAGIC,
                schema.STYLE_MAGIC,
            ), dtype=np.int8)
            prefix_index = np.minimum(position, live_prefix.size - 1)
            chosen = live_prefix[prefix_index].copy()
        elif exact_mmmrm_prefix:
            prefix_length = np.full(count, 5, dtype=np.int16)
            live_prefix = np.asarray((
                schema.STYLE_MAGIC,
                schema.STYLE_MAGIC,
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MAGIC,
            ), dtype=np.int8)
            prefix_index = np.minimum(position, live_prefix.size - 1)
            chosen = live_prefix[prefix_index].copy()
        elif exact_magic_melee_prefix:
            prefix_length = np.full(count, 2, dtype=np.int16)
            live_prefix = np.asarray((
                schema.STYLE_MAGIC,
                schema.STYLE_MELEE,
            ), dtype=np.int8)
            prefix_index = np.minimum(position, live_prefix.size - 1)
            chosen = live_prefix[prefix_index].copy()
        elif three_style_ranged_prefix:
            prefix_family = (
                fight_lanes + self.seed * 3
            ) % _THREE_STYLE_PERSISTENT_RANGED_PREFIXES.shape[0]
            prefix_length = _THREE_STYLE_PERSISTENT_RANGED_PREFIX_LENGTHS[
                prefix_family]
            prefix_index = np.minimum(
                position,
                _THREE_STYLE_PERSISTENT_RANGED_PREFIXES.shape[1] - 1)
            chosen = _THREE_STYLE_PERSISTENT_RANGED_PREFIXES[
                prefix_family, prefix_index].copy()
        elif mixed_pressure:
            prefix_length = self.seeded_pressure_prefix_lengths(
                fight_lanes, self.seed)
            prefix_family = (
                fight_lanes + self.seed
            ) % _BLOCK_STYLE_PERMUTATIONS.shape[0]
            prefix_slot = position % _BLOCK_STYLE_PERMUTATIONS.shape[1]
            chosen = _BLOCK_STYLE_PERMUTATIONS[
                prefix_family, prefix_slot].copy()
        elif long_mr_prefix:
            prefix_length = self.seeded_long_prefix_lengths(
                fight_lanes, self.seed)
            chosen = self._keyed_choice_indices(
                fight_lanes, position, 2).astype(
                    np.int8, copy=False)
        else:
            prefix_length = (
                fight_lanes
                + self.seed * 5
            ) % 11
            # The ranged-hold curriculum keeps all start distances useful:
            # a melee prefix can become unable to advance when a real wall
            # blocks its chase. The balanced cohort separately supplies
            # three-style prefixes in close-range cells.
            style_count = 3 if balanced_terminal else 2
            chosen = self._keyed_choice_indices(
                fight_lanes, position, style_count).astype(
                    np.int8, copy=False)

        if recurring_three_style:
            terminal = chosen
        elif long_mr_prefix:
            terminal = self.seeded_long_terminal_styles(
                fight_lanes, self.seed)
        elif variant == "seeded-mixed-then-balanced-pressure":
            terminal = self.seeded_long_terminal_styles(
                fight_lanes, self.seed)
        elif balanced_terminal:
            terminal = np.asarray((
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE,
            ), dtype=np.int8)[(fight_lanes + self.seed) % 3]
        else:
            terminal = np.full(
                count, schema.STYLE_RANGED, dtype=np.int8)
        persistent = position >= prefix_length
        if not recurring_three_style:
            chosen[persistent] = terminal[persistent]
        if mixed_pressure:
            pressure_position = position - prefix_length
            fake = (
                persistent
                & (pressure_position >= 2)
                & (
                    (pressure_position + fight_lanes * 2 + self.seed)
                    % 9 == 0
                )
            )
            fake_variant = self._keyed_choice_indices(
                fight_lanes, pressure_position, 2)
            chosen[fake] = (
                terminal[fake] + 1 + fake_variant[fake]
            ) % 3
        elif exact_human_pressure:
            # Positions 11 and 13 were the two Magic fakes inside the held
            # crossbow phase; all later observed rolls remained Ranged.
            chosen[(position == 11) | (position == 13)] = schema.STYLE_MAGIC

        expected_items = np.asarray((
            gear.ZURIELS_STAFF.item_id,
            gear.ZARYTE_CROSSBOW.item_id,
            gear.NOXIOUS_HALBERD.item_id,
        ), dtype=np.int32)[chosen]
        angles = expected_items * schema.WEAPON_EMBED_FREQ
        already_visible = (
            np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_SIN],
                np.sin(angles),
                atol=1.0e-5)
            & np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_COS],
                np.cos(angles),
                atol=1.0e-5)
        )
        rel_dx = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DX] * 16.0).astype(np.int16)
        rel_dy = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DY] * 16.0).astype(np.int16)
        distance = np.maximum(np.abs(rel_dx), np.abs(rel_dy))
        melee_standing = (
            (distance >= 1)
            & (distance <= gear.NOXIOUS_HALBERD.max_distance))
        pausing = (
            ready
            & (self._seeded_persistent_pause_remaining > 0))
        self._seeded_persistent_pause_remaining[pausing] -= 1
        roll_ready = (
            already_visible
            & ~pausing
            & ((chosen != schema.STYLE_MELEE) | melee_standing))
        scores[~roll_ready, schema.COMBAT_NO_ATTACK] = 100.0

        for style in (
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE):
            selected = chosen == style
            if not np.any(selected):
                continue
            attack = selected & roll_ready
            attack_row = (
                schema.COMBAT_ATTACK_BASE
                + style * 2
                + schema.ATTACK_INTENT_ATTACK)
            scores[attack, attack_row] = 100.0
            if style == schema.STYLE_MELEE:
                halberd_local = int(np.flatnonzero(
                    gear.DIRECT_GEAR_ITEMS
                    == gear.NOXIOUS_HALBERD.item_id)[0])
                shield_unequip_local = int(np.flatnonzero(
                    (gear.DIRECT_GEAR_SLOTS == gear.SLOT_SHIELD)
                    & gear.DIRECT_GEAR_UNEQUIP)[0])
                has_shield = (
                    inputs[:, schema.INPUT_SELF_HAS_SHIELD] >= 0.5)
                scores[
                    selected & ~has_shield,
                    schema.GEAR_BASE + halberd_local,
                ] = 100.0
                scores[
                    selected & has_shield,
                    schema.GEAR_BASE + shield_unequip_local,
                ] = 100.0
                if recurring_fullgear:
                    self._score_style_full_loadout(
                        scores, selected, style)
            elif exact_human_fullgear or recurring_fullgear:
                self._score_style_full_loadout(scores, selected, style)
            else:
                self._score_style_equip(scores, selected, style)

        # A halberd can route-drag from one tile beyond standing range, but
        # this curriculum deliberately exposes an already-standing threat.
        # Move into the true two-tile range before allowing its melee roll.
        needs_close = (
            (chosen == schema.STYLE_MELEE)
            & (distance > gear.NOXIOUS_HALBERD.max_distance))
        for local_action in range(
                schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT):
            dx, dy = schema.MOVEMENT_OFFSETS[local_action]
            remaining = np.maximum(
                np.abs(rel_dx - int(dx)),
                np.abs(rel_dy - int(dy)))
            improves = needs_close & (remaining < distance)
            scores[
                improves,
                schema.MOVEMENT_BASE + local_action,
            ] = 200.0 - remaining[improves]
        return chosen

    def _score_comprehensive_human_ranged_pressure(
            self,
            scores: np.ndarray,
            inputs: np.ndarray) -> np.ndarray:
        """Exercise human-like Ranged pressure without memorising one trace.

        Attack order, hesitation, visible weapon, armour, prayer, movement and
        distance are independent lane dimensions. Every launch is still a
        mechanically legal real attack; this method never fabricates labels or
        duplicates rows.
        """
        count = int(inputs.shape[0])
        rows = np.arange(count, dtype=np.intp)
        fight_lanes = self._fight_lanes(count)
        ready = inputs[:, schema.INPUT_SELF_ATTACK_READY] >= 0.5
        if (
                self._human_ranged_positions is None
                or self._human_ranged_positions.shape != (count,)):
            self._human_ranged_positions = np.zeros(count, dtype=np.int16)
            self._human_ranged_last_attack_ready = ready.copy()
            self._human_ranged_pause_remaining = np.zeros(
                count, dtype=np.int16)
            self._human_ranged_ready_stall = np.zeros(
                count, dtype=np.int16)
        else:
            launched = self._human_ranged_last_attack_ready & ~ready
            self._human_ranged_positions[launched] += 1
            launched_rows = np.flatnonzero(launched)
            if launched_rows.size:
                position = self._human_ranged_positions[launched_rows]
                lane = fight_lanes[launched_rows]
                pause_family = (lane + self.seed * 5) % 6
                random_pause = self._keyed_choice_indices(
                    lane, position * 17 + 401, 7).astype(
                        np.int16, copy=False)
                pause = np.zeros(launched_rows.size, dtype=np.int16)
                pause[pause_family == 1] = (
                    position[pause_family == 1] % 3)
                pause[pause_family == 2] = random_pause[pause_family == 2]
                early_irregular = (pause_family == 3) & (position < 9)
                pause[early_irregular] = random_pause[early_irregular]
                late_irregular = (pause_family == 4) & (position >= 9)
                pause[late_irregular] = random_pause[late_irregular]
                sparse_long = (
                    (pause_family == 5)
                    & ((position + lane + self.seed) % 5 == 0))
                pause[sparse_long] = 5 + random_pause[sparse_long]
                self._human_ranged_pause_remaining[launched_rows] = pause
            self._human_ranged_ready_stall[:] = np.where(
                launched | ~ready,
                0,
                np.minimum(self._human_ranged_ready_stall + 1, 32767))
            self._human_ranged_last_attack_ready[:] = ready

        position = self._human_ranged_positions
        prefix_family = (
            fight_lanes + self.seed * 3
        ) % _HUMAN_RANGED_PREFIXES.shape[0]
        prefix_length = _HUMAN_RANGED_PREFIX_LENGTHS[prefix_family]
        prefix_index = np.minimum(
            position, _HUMAN_RANGED_PREFIXES.shape[1] - 1)
        chosen = _HUMAN_RANGED_PREFIXES[
            prefix_family, prefix_index].copy()

        persistent = position >= prefix_length
        pressure_position = np.maximum(position - prefix_length, 0)
        schedule_family = (fight_lanes // 2 + self.seed * 7) % 8
        range_length = (
            3
            + self._keyed_choice_indices(
                fight_lanes, schedule_family * 29 + 503, 18)
        ).astype(np.int16, copy=False)
        break_length = (
            1
            + self._keyed_choice_indices(
                fight_lanes, schedule_family * 31 + 607, 4)
        ).astype(np.int16, copy=False)
        cycle_length = range_length + break_length
        cycle_position = pressure_position % cycle_length
        cycle_index = pressure_position // cycle_length
        ranged_phase = cycle_position < range_length

        # Some humans simply camp Ranged after the mixed opener. Others return
        # to short Magic/Melee interruptions, including an early M/R alternate
        # that later becomes a sustained crossbow phase.
        permanent_camp = schedule_family <= 1
        ranged_phase |= permanent_camp
        gap_choice = self._keyed_choice_indices(
            fight_lanes, cycle_index * 43 + schedule_family * 11 + 701, 2)
        gap_style = np.where(
            gap_choice == 0,
            schema.STYLE_MAGIC,
            schema.STYLE_MELEE,
        ).astype(np.int8, copy=False)
        terminal = np.where(
            ranged_phase,
            schema.STYLE_RANGED,
            gap_style,
        ).astype(np.int8, copy=False)
        early_alternating = (
            (schedule_family == 2)
            & (pressure_position < 10))
        terminal[early_alternating] = np.where(
            pressure_position[early_alternating] % 2 == 0,
            schema.STYLE_MAGIC,
            schema.STYLE_RANGED)
        chosen[persistent] = terminal[persistent]

        rel_dx = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DX] * 16.0).astype(np.int16)
        rel_dy = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DY] * 16.0).astype(np.int16)
        distance = np.maximum(np.abs(rel_dx), np.abs(rel_dy))
        self_frozen = inputs[:, schema.INPUT_SELF_FROZEN] >= 0.5
        melee_route_limit = np.where(self_frozen, 1, 3)
        unreachable_melee = (
            (chosen == schema.STYLE_MELEE)
            & (
                (distance > melee_route_limit)
                | (self._human_ranged_ready_stall >= 3)))
        fallback_choice = self._keyed_choice_indices(
            fight_lanes, position * 83 + 757, 2)
        fallback_style = np.where(
            fallback_choice == 0,
            schema.STYLE_MAGIC,
            schema.STYLE_RANGED)
        chosen[unreachable_melee] = fallback_style[unreachable_melee]

        expected_items = np.asarray((
            gear.ZURIELS_STAFF.item_id,
            gear.ZARYTE_CROSSBOW.item_id,
            gear.NOXIOUS_HALBERD.item_id,
        ), dtype=np.int32)[chosen]
        attack_delay = np.rint(
            inputs[:, schema.INPUT_SELF_ATTACK_DELAY_REMAINING]
            * schema.SELF_ATTACK_DELAY_REMAINING_NORMALIZER,
        ).astype(np.int16)

        fake_family = (fight_lanes + self.seed * 13) % 8
        fake_window = attack_delay >= 2
        fake_active = np.zeros(count, dtype=bool)
        fake_active |= fake_window & (fake_family == 1)
        fake_active |= fake_window & (fake_family == 2) & (position < 10)
        fake_active |= fake_window & (fake_family == 3) & (position >= 10)
        fake_active |= (
            fake_window & (fake_family == 4) & (position % 2 == 0))
        slow_block = 2 + (fight_lanes % 4)
        fake_active |= (
            fake_window
            & (fake_family == 5)
            & (((self._decision_tick // slow_block) % 2) == 0))
        keyed_fake = self._keyed_choice_indices(
            fight_lanes, position * 47 + self._decision_tick + 809, 3)
        fake_active |= (
            fake_window & (fake_family == 6) & (keyed_fake != 0))
        fake_active |= (
            fake_window
            & (fake_family == 7)
            & ((pressure_position // 4) % 3 != 1))

        fake_choice = self._keyed_choice_indices(
            fight_lanes,
            position * 53 + attack_delay * 7 + self._decision_tick + 907,
            _HUMAN_RANGED_FAKE_WEAPONS.size,
        ).astype(np.intp, copy=False)
        display_weapon_items = expected_items.copy()
        chosen_fake_items = _HUMAN_RANGED_FAKE_WEAPONS[fake_choice]
        same_as_attack = chosen_fake_items == expected_items
        if np.any(same_as_attack):
            shifted = (
                fake_choice[same_as_attack] + 1
            ) % _HUMAN_RANGED_FAKE_WEAPONS.size
            chosen_fake_items[same_as_attack] = (
                _HUMAN_RANGED_FAKE_WEAPONS[shifted])
        display_weapon_items[fake_active] = chosen_fake_items[fake_active]

        has_shield = inputs[:, schema.INPUT_SELF_HAS_SHIELD] >= 0.5
        wants_halberd = (
            display_weapon_items == gear.NOXIOUS_HALBERD.item_id)
        prepare_halberd = wants_halberd & has_shield

        angles = expected_items * schema.WEAPON_EMBED_FREQ
        already_visible = (
            np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_SIN],
                np.sin(angles),
                atol=1.0e-5)
            & np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_COS],
                np.cos(angles),
                atol=1.0e-5))
        melee_standing = (
            (distance >= 1)
            & (distance <= gear.NOXIOUS_HALBERD.max_distance))
        pausing = ready & (self._human_ranged_pause_remaining > 0)
        self._human_ranged_pause_remaining[pausing] -= 1
        roll_ready = (
            already_visible
            & ~pausing
            & ((chosen != schema.STYLE_MELEE) | melee_standing))
        scores[~roll_ready, schema.COMBAT_NO_ATTACK] = 200.0

        for style in (
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE):
            attacks = (chosen == style) & roll_ready
            if np.any(attacks):
                attack_row = (
                    schema.COMBAT_ATTACK_BASE
                    + style * 2
                    + schema.ATTACK_INTENT_ATTACK)
                scores[attacks, attack_row] = 100.0

        # A two-handed fake or real halberd first spends one legal decision
        # removing the shield. It is equipped only on a later decision.
        for item_id in np.unique(display_weapon_items[~prepare_halberd]):
            selected = (
                ~prepare_halberd
                & (display_weapon_items == int(item_id)))
            self._score_direct_item(
                scores, selected, int(item_id), score=120.0)
        display_angles = display_weapon_items * schema.WEAPON_EMBED_FREQ
        display_visible = (
            np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_SIN],
                np.sin(display_angles),
                atol=1.0e-5)
            & np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_COS],
                np.cos(display_angles),
                atol=1.0e-5))
        self._score_weapon_hold_toggle(
            scores, ~prepare_halberd & display_visible)
        if np.any(prepare_halberd):
            unequip_shield = int(np.flatnonzero(
                (gear.DIRECT_GEAR_SLOTS == gear.SLOT_SHIELD)
                & gear.DIRECT_GEAR_UNEQUIP)[0])
            scores[
                rows[prepare_halberd],
                schema.GEAR_BASE + unequip_shield,
            ] = 140.0

        self._score_comprehensive_human_ranged_armour(
            scores,
            rows,
            fight_lanes,
            position,
            chosen,
            display_weapon_items,
            prepare_halberd)
        self._score_comprehensive_human_ranged_movement(
            scores,
            inputs,
            fight_lanes,
            position,
            chosen,
            attack_delay)
        return chosen

    def _score_comprehensive_human_ranged_armour(
            self,
            scores: np.ndarray,
            rows: np.ndarray,
            fight_lanes: np.ndarray,
            position: np.ndarray,
            attack_style: np.ndarray,
            display_weapon_items: np.ndarray,
            prepare_halberd: np.ndarray) -> None:
        """Cross stable, partial and changing armour independently of attacks."""
        count = rows.size
        family = (fight_lanes + self.seed * 17) % 12
        stable_style = (
            fight_lanes // 12 + self.seed
        ) % 3
        slow_period = 2 + (fight_lanes % 5)
        slow_style = (
            fight_lanes + self._decision_tick // slow_period + self.seed
        ) % 3
        random_style = self._keyed_choice_indices(
            fight_lanes,
            position * 61 + self._decision_tick + 1009,
            3,
        ).astype(np.int8, copy=False)

        presentation = attack_style.copy()
        presentation[family == 1] = schema.STYLE_RANGED
        presentation[family == 2] = schema.STYLE_MAGIC
        presentation[family == 3] = schema.STYLE_MELEE
        presentation[family == 4] = slow_style[family == 4]
        presentation[family == 5] = random_style[family == 5]
        early_fake = (family == 6) & (position < 10)
        presentation[early_fake] = random_style[early_fake]
        late_fake = (family == 7) & (position >= 10)
        presentation[late_fake] = random_style[late_fake]
        stable_random = family == 9
        presentation[stable_random] = stable_style[stable_random]
        independent = (family == 8) | (family == 11)
        touch_armour = family != 10

        body_style = presentation.copy()
        legs_style = presentation.copy()
        shield_style = presentation.copy()
        hands_style = presentation.copy()
        head_style = presentation.copy()
        if np.any(independent):
            key = position * 67 + self._decision_tick * 3
            body_style[independent] = self._keyed_choice_indices(
                fight_lanes, key + 1103, 3)[independent]
            legs_style[independent] = self._keyed_choice_indices(
                fight_lanes, key + 1201, 3)[independent]
            shield_style[independent] = self._keyed_choice_indices(
                fight_lanes, key + 1301, 3)[independent]
            hands_style[independent] = self._keyed_choice_indices(
                fight_lanes, key + 1409, 3)[independent]
            head_style[independent] = self._keyed_choice_indices(
                fight_lanes, key + 1511, 3)[independent]

        body_items = np.asarray((
            gear.VIRTUS_ROBE_TOP.item_id,
            gear.MASORI_BODY_F.item_id,
            gear.MASORI_BODY_F.item_id,
        ), dtype=np.int32)[body_style]
        legs_items = np.asarray((
            gear.VIRTUS_ROBE_BOTTOM.item_id,
            gear.TORVA_PLATELEGS.item_id,
            gear.TORVA_PLATELEGS.item_id,
        ), dtype=np.int32)[legs_style]
        shield_items = np.asarray((
            gear.ELIDINIS_WARD_F.item_id,
            gear.DRAGONFIRE_SHIELD.item_id,
            gear.DRAGONFIRE_SHIELD.item_id,
        ), dtype=np.int32)[shield_style]
        hands_items = np.asarray((
            gear.CONFLICTION_GAUNTLETS.item_id,
            gear.CONFLICTION_GAUNTLETS.item_id,
            gear.BARROWS_GLOVES.item_id,
        ), dtype=np.int32)[hands_style]

        for item_group in (body_items, legs_items, hands_items):
            for item_id in np.unique(item_group[touch_armour]):
                selected = touch_armour & (item_group == int(item_id))
                self._score_direct_item(
                    scores, selected, int(item_id), score=90.0)

        two_handed = (
            prepare_halberd
            | (display_weapon_items == gear.NOXIOUS_HALBERD.item_id))
        shield_selected = touch_armour & ~two_handed
        for item_id in np.unique(shield_items[shield_selected]):
            selected = shield_selected & (shield_items == int(item_id))
            self._score_direct_item(
                scores, selected, int(item_id), score=90.0)
        remove_shield = touch_armour & prepare_halberd
        if np.any(remove_shield):
            unequip_shield = int(np.flatnonzero(
                (gear.DIRECT_GEAR_SLOTS == gear.SLOT_SHIELD)
                & gear.DIRECT_GEAR_UNEQUIP)[0])
            scores[
                rows[remove_shield],
                schema.GEAR_BASE + unequip_shield,
            ] = 130.0

        wear_hat = touch_armour & (head_style != schema.STYLE_MAGIC)
        self._score_direct_item(
            scores, wear_hat, gear.TORVA_FULL_HELM.item_id, score=90.0)
        remove_hat = touch_armour & ~wear_hat
        if np.any(remove_hat):
            unequip_hat = int(np.flatnonzero(
                (gear.DIRECT_GEAR_SLOTS == gear.SLOT_HAT)
                & gear.DIRECT_GEAR_UNEQUIP)[0])
            scores[
                rows[remove_hat],
                schema.GEAR_BASE + unequip_hat,
            ] = 90.0

    def _score_comprehensive_human_ranged_movement(
            self,
            scores: np.ndarray,
            inputs: np.ndarray,
            fight_lanes: np.ndarray,
            position: np.ndarray,
            attack_style: np.ndarray,
            attack_delay: np.ndarray) -> None:
        """Cover stationary, stop/start, burst, orbit and freeze movement."""
        rows = np.arange(inputs.shape[0], dtype=np.intp)
        family = (fight_lanes + self.seed * 19) % 8
        safe_cooldown = (
            (attack_delay >= 2)
            & (attack_style != schema.STYLE_MELEE))
        active = np.zeros(inputs.shape[0], dtype=bool)
        active |= safe_cooldown & (family == 1) & (position < 8)
        active |= safe_cooldown & (family == 2) & (position >= 8)
        active |= safe_cooldown & (family == 3)
        active |= (
            safe_cooldown & (family == 4) & ((position // 3) % 2 == 0))
        target_frozen = inputs[:, schema.INPUT_OPP_FROZEN] >= 0.5
        active |= safe_cooldown & (family == 5) & target_frozen
        keyed_move = self._keyed_choice_indices(
            fight_lanes, self._decision_tick + position * 71 + 1601, 4)
        active |= safe_cooldown & (family == 6) & (keyed_move != 0)
        active |= (
            safe_cooldown
            & (family == 7)
            & (((position + self._decision_tick // 3) % 5) <= 1))

        rel_dx = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DX] * 16.0).astype(np.int16)
        rel_dy = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DY] * 16.0).astype(np.int16)
        distance = np.maximum(np.abs(rel_dx), np.abs(rel_dy))
        # Recovery movement is allowed on a ready tick because neither a
        # same-tile nor out-of-range projectile can launch from that state.
        needs_reengage = (
            (distance > 8)
            & (attack_style != schema.STYLE_MELEE))
        if np.any(needs_reengage):
            for local in range(
                    schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT):
                dx, dy = schema.MOVEMENT_OFFSETS[local]
                remaining = np.maximum(
                    np.abs(rel_dx - int(dx)),
                    np.abs(rel_dy - int(dy)))
                selected = needs_reengage & (remaining < distance)
                scores[
                    rows[selected],
                    schema.MOVEMENT_BASE + local,
                ] = 260.0 - remaining[selected]

        step_under = (
            active & (family == 5) & target_frozen & (distance > 0))
        scores[
            step_under,
            schema.MOVEMENT_BASE + schema.MOVE_STAND_UNDER,
        ] = 250.0

        must_stepoff = (
            (distance == 0)
            & (attack_delay <= 1)
            & (attack_style != schema.STYLE_MELEE))
        ordinary = (
            (active | must_stepoff)
            & ~step_under
            & ~needs_reengage)
        one_tile_moves = np.asarray([
            local
            for local in range(
                schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT)
            if np.max(np.abs(schema.MOVEMENT_OFFSETS[local])) == 1
        ], dtype=np.intp)
        two_tile_moves = np.asarray([
            local
            for local in range(
                schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT)
            if np.max(np.abs(schema.MOVEMENT_OFFSETS[local])) == 2
        ], dtype=np.intp)
        use_two = (family == 3) | (family == 7)
        one_choice = self._keyed_choice_indices(
            fight_lanes, self._decision_tick + position * 73 + 1709,
            one_tile_moves.size).astype(np.intp, copy=False)
        two_choice = self._keyed_choice_indices(
            fight_lanes, self._decision_tick + position * 79 + 1801,
            two_tile_moves.size).astype(np.intp, copy=False)
        selected_moves = one_tile_moves[one_choice]
        selected_moves[use_two] = two_tile_moves[two_choice[use_two]]
        for local in np.unique(selected_moves[ordinary]):
            selected = ordinary & (selected_moves == int(local))
            scores[
                rows[selected],
                schema.MOVEMENT_BASE + int(local),
            ] = 230.0

    def _score_ranged_gear_fake_pressure(
            self,
            scores: np.ndarray,
            inputs: np.ndarray,
            held_out: bool,
            multigear_variant: str | None = None,
            complete_history: bool = False,
            balanced_complete_history: bool = False,
            phase_balanced: bool = False,
            freeze_then_ranged: bool = False) -> np.ndarray:
        """Use real three-style rolls, then Ranged rolls behind gear fakes.

        The original cohort shows staff/VLS fakes. The phase-balanced cohort
        rotates the exact pre-roll decision cue through staff, VLS and
        crossbow while placing all three weapons in the preceding cooldown
        history. The multigear cohort adds staff, VLS, Voidwaker and halberd
        presentations, armour changes and cooldown-only movement while every
        terminal attack remains Ranged. Both held-out multigear schedules use
        prefixes and timing that rollout generation cannot select.
        """
        count = int(inputs.shape[0])
        rows = np.arange(count, dtype=np.intp)
        fight_lanes = self._fight_lanes(count)
        ready = inputs[:, schema.INPUT_SELF_ATTACK_READY] >= 0.5
        if (
                self._ranged_fake_positions is None
                or self._ranged_fake_positions.shape != (count,)):
            self._ranged_fake_positions = np.zeros(count, dtype=np.int16)
            self._ranged_fake_last_attack_ready = ready.copy()
            self._ranged_fake_ready_stall = np.zeros(count, dtype=np.int8)
        else:
            launched = self._ranged_fake_last_attack_ready & ~ready
            self._ranged_fake_positions[launched] += 1
            self._ranged_fake_last_attack_ready[:] = ready
            self._ranged_fake_ready_stall[:] = np.where(
                launched | ~ready,
                0,
                np.minimum(self._ranged_fake_ready_stall + 1, 127))

        position = self._ranged_fake_positions
        target_frozen = inputs[:, schema.INPUT_OPP_FROZEN] >= 0.5
        complete_fake_terminal = np.zeros(count, dtype=bool)
        if complete_history:
            block_index = position // _COMPLETE_HISTORY_BLOCK_LENGTH
            block_position = position % _COMPLETE_HISTORY_BLOCK_LENGTH
            if balanced_complete_history:
                scenario = self.seeded_balanced_complete_history_scenarios(
                    fight_lanes, block_index, self.seed)
                variant_count = 6
                terminal_styles = (
                    _BALANCED_COMPLETE_HISTORY_TERMINAL_STYLES)
            else:
                scenario = self.seeded_complete_history_scenarios(
                    fight_lanes, block_index, self.seed)
                variant_count = 4
                terminal_styles = _COMPLETE_HISTORY_TERMINAL_STYLES
            history_code = scenario // variant_count
            terminal_variant = scenario % variant_count
            prefix = np.stack((
                history_code // 9,
                (history_code // 3) % 3,
                history_code % 3,
            ), axis=1).astype(np.int8, copy=False)
            prefix_index = np.minimum(block_position, 2)
            attack_style = prefix[rows, prefix_index].copy()
            terminal_style = terminal_styles[terminal_variant]
            run_length = self.seeded_complete_history_run_lengths(
                scenario, self.seed)
            terminal = (
                (block_position >= 3)
                & (block_position < 3 + run_length))
            attack_style[terminal] = terminal_style[terminal]
            tail = block_position >= 3 + run_length
            tail_style = self._keyed_choice_indices(
                fight_lanes,
                position * 17 + block_index * 31,
                3,
            ).astype(np.int8, copy=False)
            attack_style[tail] = tail_style[tail]
            prefix_length = np.full(count, 3, dtype=np.int16)
            persistent = terminal
            pressure_position = np.maximum(block_position - 3, 0)
            # The balanced cohort gives every style one hold and one legal
            # cooldown-fake continuation. The older ranged-pressure cohort
            # retains its original crossbow hold/fake split for provenance.
            complete_fake_terminal = terminal & (
                ((terminal_variant % 2) == 1)
                if balanced_complete_history
                else (terminal_variant == 2))
        elif multigear_variant in (
                "heldout-ranged-multigear-movement-a",
                "heldout-ranged-multigear-movement-b"):
            heldout_prefix = (
                np.asarray((
                    schema.STYLE_MELEE,
                    schema.STYLE_MAGIC,
                    schema.STYLE_RANGED,
                    schema.STYLE_MAGIC,
                    schema.STYLE_MELEE,
                    schema.STYLE_RANGED,
                ), dtype=np.int8)
                if multigear_variant.endswith("-a")
                else np.asarray((
                    schema.STYLE_MAGIC,
                    schema.STYLE_RANGED,
                    schema.STYLE_MELEE,
                    schema.STYLE_RANGED,
                    schema.STYLE_MAGIC,
                    schema.STYLE_MELEE,
                    schema.STYLE_MAGIC,
                ), dtype=np.int8)
            )
            prefix_length = np.full(
                count, heldout_prefix.size, dtype=np.int16)
            prefix_index = np.minimum(position, heldout_prefix.size - 1)
            attack_style = heldout_prefix[prefix_index].copy()
        elif held_out:
            held_out_prefix = np.asarray((
                schema.STYLE_MAGIC,
                schema.STYLE_MELEE,
                schema.STYLE_RANGED,
                schema.STYLE_MAGIC,
            ), dtype=np.int8)
            prefix_length = np.full(
                count, held_out_prefix.size, dtype=np.int16)
            prefix_index = np.minimum(position, held_out_prefix.size - 1)
            attack_style = held_out_prefix[prefix_index].copy()
        elif freeze_then_ranged:
            prefix_length = np.zeros(count, dtype=np.int16)
            attack_style = np.where(
                target_frozen,
                schema.STYLE_RANGED,
                schema.STYLE_MAGIC,
            ).astype(np.int8, copy=False)
        else:
            prefix_length = self.seeded_ranged_fake_prefix_lengths(
                fight_lanes, self.seed)
            prefix_family = (
                fight_lanes + self.seed * 3
            ) % _BLOCK_STYLE_PERMUTATIONS.shape[0]
            prefix_index = position % _BLOCK_STYLE_PERMUTATIONS.shape[1]
            attack_style = _BLOCK_STYLE_PERMUTATIONS[
                prefix_family, prefix_index].copy()

        if freeze_then_ranged:
            persistent = target_frozen
            pressure_position = position.copy()
        elif not complete_history:
            persistent = position >= prefix_length
            attack_style[persistent] = schema.STYLE_RANGED
            pressure_position = np.maximum(position - prefix_length, 0)
        rel_dx = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DX] * 16.0).astype(np.int16)
        rel_dy = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DY] * 16.0).astype(np.int16)
        distance = np.maximum(np.abs(rel_dx), np.abs(rel_dy))
        if freeze_then_ranged:
            # Cast from real one-tile proximity until a Barrage has actually
            # frozen the staged target, then stop moving and use the existing
            # phase-balanced Ranged cooldown. Route legality remains the final
            # authority for every requested step.
            acquiring = ~target_frozen & (distance != 1)
            self._score_distance_target(
                scores, rel_dx, rel_dy, acquiring, target_distance=1)
        if (
                not held_out
                and not complete_history):
            # A direct-movement lane can be bounded by a real wall before a
            # distant Melee prefix reaches route-drag range. Do not stall the
            # fight there: substitute a seeded Magic/Ranged roll. Close lanes
            # retain the genuine three-style prefix.
            frozen = inputs[:, schema.INPUT_SELF_FROZEN] >= 0.5
            melee_route_limit = np.where(frozen, 1, 3)
            unreachable_melee = (
                ~persistent
                & (attack_style == schema.STYLE_MELEE)
                & (
                    (distance > melee_route_limit)
                    | (self._ranged_fake_ready_stall >= 3)))
            substitute = self._keyed_choice_indices(
                fight_lanes, position * 13 + 7, 2)
            fallback_style = np.where(
                substitute == 0,
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED)
            attack_style[unreachable_melee] = fallback_style[
                unreachable_melee]
        attack_delay = np.rint(
            inputs[:, schema.INPUT_SELF_ATTACK_DELAY_REMAINING]
            * schema.SELF_ATTACK_DELAY_REMAINING_NORMALIZER,
        ).astype(np.int16)

        expected_items = np.asarray((
            gear.ZURIELS_STAFF.item_id,
            gear.ZARYTE_CROSSBOW.item_id,
            gear.VESTAS_LONGSWORD.item_id,
        ), dtype=np.int32)[attack_style]

        # Gear presentation is independent of the attack sequence. Every
        # post-prefix roll stays Ranged; only legal cooldown equips vary.
        gear_style = attack_style.copy()
        fake_window = persistent & (attack_delay >= 2)
        display_weapon_items = expected_items.copy()
        prepare_halberd = np.zeros(count, dtype=bool)
        if multigear_variant is not None:
            continuous_crossbow = (
                (fight_lanes + self.seed * 5) % 5 == 0)
            fake_window &= ~continuous_crossbow
            fake_items = np.asarray((
                gear.ZURIELS_STAFF.item_id,
                gear.VESTAS_LONGSWORD.item_id,
                gear.VOIDWAKER.item_id,
                gear.NOXIOUS_HALBERD.item_id,
            ), dtype=np.int32)
            if multigear_variant.endswith("-a"):
                fake_choice = (
                    pressure_position + fight_lanes
                ) % fake_items.size
            elif multigear_variant.endswith("-b"):
                fake_choice = (
                    pressure_position * 5
                    + fight_lanes * 2
                    + 1
                ) % fake_items.size
                irregular_hold = (
                    (pressure_position + attack_delay + fight_lanes) % 4
                    == 0)
                fake_window &= ~irregular_hold
            else:
                fake_key = pressure_position * 17
                fake_choice = self._keyed_choice_indices(
                    fight_lanes, fake_key, fake_items.size)
            display_weapon_items[fake_window] = fake_items[
                fake_choice[fake_window]]
            wants_halberd = (
                fake_window
                & (display_weapon_items == gear.NOXIOUS_HALBERD.item_id))
            prepare_halberd = wants_halberd & (
                inputs[:, schema.INPUT_SELF_HAS_SHIELD] >= 0.5)
            display_weapon_items[prepare_halberd] = expected_items[
                prepare_halberd]
        elif complete_history:
            fake_window &= complete_fake_terminal
            fake_key = pressure_position * 11 + attack_delay
            fake_choice = self._keyed_choice_indices(
                fight_lanes, fake_key, 2)
            chosen_fake = _FAKE_STYLES_BY_ATTACK_STYLE[
                attack_style, fake_choice]
            gear_style[fake_window] = chosen_fake[fake_window]
        elif phase_balanced:
            cue_style = self.seeded_ranged_phase_balanced_cue_styles(
                fight_lanes, pressure_position, self.seed)
            cue_index = np.empty(count, dtype=np.int8)
            for index, style in enumerate(_RANGED_PHASE_BALANCED_CUE_STYLES):
                cue_index[cue_style == style] = index

            # A crossbow roll occurs with an effective one-tick prayer delay.
            # The defender's labelled decision therefore sees the weapon that
            # was visible immediately before the attacker restores/equips the
            # crossbow. Put both non-cue weapons earlier in the same cooldown,
            # then put the requested cue at delay two and restore the crossbow
            # at delay one. The resulting labelled current cue is balanced,
            # and its prior 16 decision rows naturally contain all three.
            reverse = (
                fight_lanes * 7
                + pressure_position * 5
                + self.seed * 11
            ) % 2 == 1
            first_other_index = (cue_index + np.where(reverse, 2, 1)) % 3
            second_other_index = (cue_index + np.where(reverse, 1, 2)) % 3
            presentation_index = cue_index.copy()
            presentation_index[attack_delay >= 4] = first_other_index[
                attack_delay >= 4]
            delay_three = attack_delay == 3
            presentation_index[delay_three] = second_other_index[delay_three]
            presentation_index[attack_delay <= 1] = 2
            presentation_style = _RANGED_PHASE_BALANCED_CUE_STYLES[
                presentation_index]
            gear_style[persistent] = presentation_style[persistent]
        elif held_out:
            early_fakes = np.asarray((
                schema.STYLE_MAGIC,
                schema.STYLE_MELEE,
                schema.STYLE_MAGIC,
                schema.STYLE_MELEE,
                schema.STYLE_MELEE,
                schema.STYLE_MAGIC,
            ), dtype=np.int8)
            late_fakes = np.asarray((
                schema.STYLE_MELEE,
                schema.STYLE_MAGIC,
                schema.STYLE_MAGIC,
                schema.STYLE_MELEE,
                schema.STYLE_MAGIC,
                schema.STYLE_MELEE,
            ), dtype=np.int8)
            fake_index = pressure_position % early_fakes.size
            chosen_fake = np.where(
                attack_delay >= 3,
                early_fakes[fake_index],
                late_fakes[fake_index])
            gear_style[fake_window] = chosen_fake[fake_window]
        else:
            continuous_crossbow = (
                (fight_lanes + self.seed * 5) % 4 == 0)
            fake_window &= ~continuous_crossbow
            fake_key = pressure_position * 11 + attack_delay
            fake_choice = self._keyed_choice_indices(
                fight_lanes, fake_key, 2)
            chosen_fake = np.where(
                fake_choice == 0,
                schema.STYLE_MAGIC,
                schema.STYLE_MELEE)
            gear_style[fake_window] = chosen_fake[fake_window]

        angles = expected_items * schema.WEAPON_EMBED_FREQ
        already_visible = (
            np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_SIN],
                np.sin(angles),
                atol=1.0e-5)
            & np.isclose(
                inputs[:, schema.INPUT_SELF_WEAPON_COS],
                np.cos(angles),
                atol=1.0e-5)
        )
        melee_standing = (
            inputs[:, schema.INPUT_MELEE_REACH] >= 0.5)
        roll_ready = (
            already_visible
            & ((attack_style != schema.STYLE_MELEE) | melee_standing))
        scores[~roll_ready, schema.COMBAT_NO_ATTACK] = 100.0

        for style in (
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE):
            attacks = (attack_style == style) & roll_ready
            if np.any(attacks):
                attack_row = (
                    schema.COMBAT_ATTACK_BASE
                    + style * 2
                    + schema.ATTACK_INTENT_ATTACK)
                scores[attacks, attack_row] = 100.0
            equips = (gear_style == style) & (multigear_variant is None)
            if np.any(equips):
                self._score_style_equip(scores, equips, style)

        if multigear_variant is not None:
            for item_id in np.unique(display_weapon_items):
                selected = display_weapon_items == item_id
                self._score_direct_item(
                    scores, selected, int(item_id), score=100.0)
            self._score_multigear_armour(
                scores,
                rows,
                fight_lanes,
                pressure_position,
                attack_delay,
                display_weapon_items,
                multigear_variant)
            if np.any(prepare_halberd):
                unequip_shield = int(np.flatnonzero(
                    (gear.DIRECT_GEAR_SLOTS == gear.SLOT_SHIELD)
                    & gear.DIRECT_GEAR_UNEQUIP)[0])
                scores[
                    rows[prepare_halberd],
                    schema.GEAR_BASE + unequip_shield,
                ] = 110.0
            self._score_multigear_cooldown_movement(
                scores,
                inputs,
                fight_lanes,
                pressure_position,
                attack_delay,
                persistent,
                multigear_variant)

        # The current Java direct-action controller restores the staff on a
        # HOLD with no direct gear action. Keep an ordinary legal body equip
        # selected so a deliberate crossbow hold remains a crossbow hold.
        if multigear_variant is None:
            body_rows = np.flatnonzero(
                (gear.DIRECT_GEAR_SLOTS == gear.SLOT_CHEST)
                & ~gear.DIRECT_GEAR_UNEQUIP)
            scores[np.ix_(
                rows,
                schema.GEAR_BASE + body_rows,
            )] = 90.0
        return attack_style

    @staticmethod
    def _score_direct_item(
            scores: np.ndarray,
            selected: np.ndarray,
            item_id: int,
            score: float) -> None:
        local = int(np.flatnonzero(
            gear.DIRECT_GEAR_ITEMS == int(item_id))[0])
        scores[selected, schema.GEAR_BASE + local] = float(score)

    def _score_multigear_armour(
            self,
            scores: np.ndarray,
            rows: np.ndarray,
            fight_lanes: np.ndarray,
            pressure_position: np.ndarray,
            attack_delay: np.ndarray,
            display_weapon_items: np.ndarray,
            variant: str) -> None:
        """Vary visible armour without changing the terminal attack style."""
        cadence = (
            pressure_position * (5 if variant.endswith("-b") else 3)
            + attack_delay
            + fight_lanes * 2
            + self.seed)
        item_groups = (
            np.asarray((
                gear.VIRTUS_ROBE_TOP.item_id,
                gear.MASORI_BODY_F.item_id,
            ), dtype=np.int32),
            np.asarray((
                gear.VIRTUS_ROBE_BOTTOM.item_id,
                gear.TORVA_PLATELEGS.item_id,
            ), dtype=np.int32),
        )
        for group_index, items in enumerate(item_groups):
            chosen = items[(cadence + group_index) % items.size]
            for item_id in items:
                selected = chosen == item_id
                self._score_direct_item(
                    scores, selected, int(item_id), score=90.0)

        shield_items = np.asarray((
            gear.ELIDINIS_WARD_F.item_id,
            gear.DRAGONFIRE_SHIELD.item_id,
        ), dtype=np.int32)
        chosen_shield = shield_items[(cadence // 2) % shield_items.size]
        one_handed = display_weapon_items != gear.NOXIOUS_HALBERD.item_id
        for item_id in shield_items:
            selected = one_handed & (chosen_shield == item_id)
            self._score_direct_item(
                scores, selected, int(item_id), score=90.0)

        # Include both helmet-on and helmet-off presentations. A body action
        # is always present, so an intentional weapon hold cannot fall through
        # to the Java controller's default staff restoration.
        hat_phase = cadence % 3
        self._score_direct_item(
            scores,
            hat_phase == 0,
            gear.TORVA_FULL_HELM.item_id,
            score=90.0)
        unequip_hat = int(np.flatnonzero(
            (gear.DIRECT_GEAR_SLOTS == gear.SLOT_HAT)
            & gear.DIRECT_GEAR_UNEQUIP)[0])
        scores[
            rows[hat_phase == 1],
            schema.GEAR_BASE + unequip_hat,
        ] = 90.0

    def _score_multigear_cooldown_movement(
            self,
            scores: np.ndarray,
            inputs: np.ndarray,
            fight_lanes: np.ndarray,
            pressure_position: np.ndarray,
            attack_delay: np.ndarray,
            persistent: np.ndarray,
            variant: str) -> None:
        """Move only on safe cooldown ticks and stay within crossbow reach."""
        rows = np.arange(inputs.shape[0], dtype=np.intp)
        moving_lanes = (
            (fight_lanes + self.seed) % 4 != 0
            if variant == "seeded-ranged-multigear-movement-pressure"
            else np.ones(inputs.shape[0], dtype=bool))
        move_window = persistent & moving_lanes & (attack_delay >= 3)
        if variant.endswith("-b"):
            move_window &= (
                (pressure_position + attack_delay + fight_lanes) % 3 != 0)
        if not np.any(move_window):
            return

        rel_dx = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DX] * 16.0).astype(np.int16)
        rel_dy = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DY] * 16.0).astype(np.int16)
        current_distance = np.maximum(np.abs(rel_dx), np.abs(rel_dy))
        needs_reengage = persistent & (current_distance > 8)
        if np.any(needs_reengage):
            for local in range(
                    schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT):
                dx, dy = schema.MOVEMENT_OFFSETS[local]
                remaining = np.maximum(
                    np.abs(rel_dx - int(dx)),
                    np.abs(rel_dy - int(dy)))
                selected = needs_reengage & (remaining < current_distance)
                scores[
                    rows[selected],
                    schema.MOVEMENT_BASE + local,
                ] = 240.0 - remaining[selected]
        one_tile_moves = np.asarray([
            local
            for local in range(
                schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT)
            if np.max(np.abs(schema.MOVEMENT_OFFSETS[local])) == 1
        ], dtype=np.intp)
        needs_stepoff = persistent & (current_distance == 0)
        if np.any(needs_stepoff):
            stepoff_start = self._keyed_choice_indices(
                fight_lanes,
                pressure_position * 23 + 5,
                one_tile_moves.size)
            for rank in range(one_tile_moves.size):
                local = one_tile_moves[
                    (stepoff_start + rank) % one_tile_moves.size]
                scores[
                    rows[needs_stepoff],
                    schema.MOVEMENT_BASE + local[needs_stepoff],
                ] = 260.0 - rank
        if variant.endswith("-a"):
            start = (
                pressure_position + attack_delay * 2 + fight_lanes
            ) % one_tile_moves.size
        elif variant.endswith("-b"):
            start = (
                pressure_position * 3 + attack_delay + fight_lanes * 2 + 1
            ) % one_tile_moves.size
        else:
            start = self._keyed_choice_indices(
                fight_lanes,
                pressure_position * 19 + attack_delay * 7,
                one_tile_moves.size)

        # Rank every direction from a per-lane seeded rotation. The normal
        # movement legality mask remains authoritative; if the first choice is
        # blocked, the next legal choice wins. Never deliberately leave the
        # crossbow's standing range or move onto the opponent tile.
        for rank in range(one_tile_moves.size):
            local = one_tile_moves[(start + rank) % one_tile_moves.size]
            offsets = schema.MOVEMENT_OFFSETS[local]
            remaining = np.maximum(
                np.abs(rel_dx - offsets[:, 0]),
                np.abs(rel_dy - offsets[:, 1]))
            selected = move_window & (remaining >= 1) & (remaining <= 8)
            scores[
                rows[selected],
                schema.MOVEMENT_BASE + local[selected],
            ] = 180.0 - rank

    @staticmethod
    def seeded_ranged_fake_prefix_lengths(
            fight_lanes: np.ndarray,
            seed: int) -> np.ndarray:
        """Return varied five-through-twelve-roll three-style openings."""
        lanes = np.asarray(fight_lanes, dtype=np.int64)
        return (
            5 + (lanes * 5 + int(seed) * 7) % 8
        ).astype(np.int16, copy=False)

    @staticmethod
    def seeded_ranged_phase_balanced_cue_styles(
            fight_lanes: np.ndarray,
            pressure_positions: np.ndarray,
            seed: int) -> np.ndarray:
        """Balance staff, VLS and crossbow cues with varied seeded order."""
        lanes = np.asarray(fight_lanes, dtype=np.int64)
        positions = np.asarray(pressure_positions, dtype=np.int64)
        phase = (lanes + int(seed) * 5) % 3
        stride = np.where((lanes + int(seed) * 7) % 2 == 0, 1, 2)
        cue_index = (phase + positions * stride) % 3
        return _RANGED_PHASE_BALANCED_CUE_STYLES[cue_index]

    @staticmethod
    def seeded_complete_history_scenarios(
            fight_lanes: np.ndarray,
            block_indices: np.ndarray,
            seed: int) -> np.ndarray:
        """Cover every three-style history and four continuation variants."""
        lanes = np.asarray(fight_lanes, dtype=np.int64)
        blocks = np.asarray(block_indices, dtype=np.int64)
        return (
            lanes + int(seed) * 17 + blocks * 37
        ) % (27 * 4)

    @staticmethod
    def seeded_balanced_complete_history_scenarios(
            fight_lanes: np.ndarray,
            block_indices: np.ndarray,
            seed: int) -> np.ndarray:
        """Cover every three-style history with two variants per style."""
        lanes = np.asarray(fight_lanes, dtype=np.int64)
        blocks = np.asarray(block_indices, dtype=np.int64)
        return (
            lanes + int(seed) * 17 + blocks * 37
        ) % (27 * 6)

    @staticmethod
    def seeded_complete_history_run_lengths(
            scenarios: np.ndarray,
            seed: int) -> np.ndarray:
        """Vary continuation runs from two through eight real attacks."""
        values = np.asarray(scenarios, dtype=np.int64)
        return (
            2 + (values * 5 + int(seed) * 7) % 7
        ).astype(np.int16, copy=False)

    @staticmethod
    def seeded_recurring_block_styles(
            fight_lanes: np.ndarray,
            attack_positions: np.ndarray,
            seed: int) -> np.ndarray:
        """Return recurring three-style blocks with varied order and length."""
        lanes = np.asarray(fight_lanes, dtype=np.int64)
        positions = np.asarray(attack_positions, dtype=np.int64)
        base_lengths = np.stack((
            2 + (lanes * 3 + int(seed) * 5) % 6,
            3 + (lanes * 5 + int(seed) * 7) % 6,
            2 + (lanes * 7 + int(seed) * 11) % 7,
        ), axis=1)
        cycle_length = np.sum(base_lengths, axis=1)
        cycle = positions // cycle_length
        within = positions % cycle_length

        # Reassign the three lane-specific lengths each cycle. Their sum is
        # unchanged, so cycle boundaries stay cheap and deterministic.
        rotation = (lanes + int(seed) + cycle) % 3
        row = np.arange(lanes.size, dtype=np.intp)
        length0 = base_lengths[row, rotation]
        length1 = base_lengths[row, (rotation + 1) % 3]
        slot = np.where(
            within < length0,
            0,
            np.where(within < length0 + length1, 1, 2),
        )
        permutation = (
            lanes * 5 + int(seed) * 3 + cycle * 5
        ) % _BLOCK_STYLE_PERMUTATIONS.shape[0]
        return _BLOCK_STYLE_PERMUTATIONS[
            permutation, slot].astype(np.int8, copy=False)

    @staticmethod
    def seeded_long_prefix_lengths(
            fight_lanes: np.ndarray,
            seed: int) -> np.ndarray:
        """Return deterministic four-through-sixteen attack prefix lengths."""
        lanes = np.asarray(fight_lanes, dtype=np.int64)
        return (
            4 + (lanes * 7 + int(seed) * 5) % 13
        ).astype(np.int16, copy=False)

    @staticmethod
    def seeded_pressure_prefix_lengths(
            fight_lanes: np.ndarray,
            seed: int) -> np.ndarray:
        """Return mixed opening lengths from six through eighteen attacks."""
        lanes = np.asarray(fight_lanes, dtype=np.int64)
        return (
            6 + (lanes * 5 + int(seed) * 7) % 13
        ).astype(np.int16, copy=False)

    @staticmethod
    def seeded_long_terminal_styles(
            fight_lanes: np.ndarray,
            seed: int) -> np.ndarray:
        """Balance persistent Magic, Ranged and Melee styles across lanes."""
        lanes = np.asarray(fight_lanes, dtype=np.int64)
        styles = np.asarray((
            schema.STYLE_MAGIC,
            schema.STYLE_RANGED,
            schema.STYLE_MELEE,
        ), dtype=np.int8)
        return styles[(lanes + int(seed)) % styles.size]

    def _score_varied_opener_then_halberd(
            self, scores: np.ndarray, inputs: np.ndarray) -> np.ndarray:
        """Decorrelate held-halberd threats from the defender's own style.

        Each fight lane either starts on the halberd or opens with Magic,
        Ranged, or ordinary VLS before switching to it.  The switch tick is
        staggered by lane so the lesson includes different cooldown/history
        states instead of one synchronized transition.
        """
        count = int(inputs.shape[0])
        rows = np.arange(count, dtype=np.intp)
        fight_lanes = self._fight_lanes(count)
        scenario = fight_lanes % 4
        transition_tick = 4 + ((fight_lanes // 4) % 4)
        before_transition = self._decision_tick < transition_tick
        opener_style = np.choose(
            scenario,
            (
                schema.STYLE_MELEE,
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE,
            ),
        ).astype(np.int8)
        use_halberd = (scenario == 0) | ~before_transition
        chosen = np.where(
            use_halberd, schema.STYLE_MELEE, opener_style).astype(np.int8)

        for style in (
                schema.STYLE_MAGIC,
                schema.STYLE_RANGED,
                schema.STYLE_MELEE):
            selected = chosen == style
            if not np.any(selected):
                continue
            attack_row = (
                schema.COMBAT_ATTACK_BASE
                + style * 2
                + schema.ATTACK_INTENT_ATTACK)
            scores[selected, attack_row] = 100.0
            if style != schema.STYLE_MELEE:
                self._score_style_equip(scores, selected, style)

        halberd_local = int(np.flatnonzero(
            gear.DIRECT_GEAR_ITEMS == gear.NOXIOUS_HALBERD.item_id)[0])
        scores[use_halberd, schema.GEAR_BASE + halberd_local] = 100.0
        vls_opener = (scenario == 3) & before_transition
        if np.any(vls_opener):
            self._score_style_equip(
                scores, vls_opener, schema.STYLE_MELEE)
        return chosen

    def _keyed_choice_index(
            self,
            fight_lane: int,
            decision_tick: int,
            choice_count: int) -> int:
        """A reproducible hidden choice keyed only by seed, lane and tick."""
        mask = (1 << 64) - 1
        value = (
            (self.seed & mask)
            ^ (((fight_lane + 1) * 0xD1B54A32D192ED03) & mask)
            ^ (((decision_tick + 1) * 0x94D049BB133111EB) & mask)
        )
        value = (value + 0x9E3779B97F4A7C15) & mask
        value = ((value ^ (value >> 30))
                 * 0xBF58476D1CE4E5B9) & mask
        value = ((value ^ (value >> 27))
                 * 0x94D049BB133111EB) & mask
        value ^= value >> 31
        return int(value % choice_count)

    def _keyed_choice_indices(
            self,
            fight_lanes: np.ndarray,
            decision_indices: np.ndarray,
            choice_count: int) -> np.ndarray:
        """Vectorized SplitMix64 choices for independent lane/attack keys."""
        lanes = np.asarray(fight_lanes, dtype=np.uint64)
        decisions = np.asarray(decision_indices, dtype=np.uint64)
        value = (
            np.uint64(self.seed & ((1 << 64) - 1))
            ^ ((lanes + np.uint64(1))
               * np.uint64(0xD1B54A32D192ED03))
            ^ ((decisions + np.uint64(1))
               * np.uint64(0x94D049BB133111EB))
        )
        value += np.uint64(0x9E3779B97F4A7C15)
        value = (
            (value ^ (value >> np.uint64(30)))
            * np.uint64(0xBF58476D1CE4E5B9))
        value = (
            (value ^ (value >> np.uint64(27)))
            * np.uint64(0x94D049BB133111EB))
        value ^= value >> np.uint64(31)
        return value % np.uint64(choice_count)

    @staticmethod
    def _score_style_equip(
            scores: np.ndarray,
            selected: np.ndarray,
            style: int) -> None:
        item_id = (
            gear.ZURIELS_STAFF.item_id,
            gear.ZARYTE_CROSSBOW.item_id,
            gear.VESTAS_LONGSWORD.item_id,
        )[style]
        local = int(np.flatnonzero(
            gear.DIRECT_GEAR_ITEMS == item_id)[0])
        scores[selected, schema.GEAR_BASE + local] = 100.0

    @staticmethod
    def _score_style_full_loadout(
            scores: np.ndarray,
            selected: np.ndarray,
            style: int,
            weapon_item_id: int | None = None) -> None:
        """Equip the complete style setup used in live practice."""
        loadout = (
            (
                gear.ZURIELS_STAFF.item_id,
                gear.VIRTUS_ROBE_TOP.item_id,
                gear.VIRTUS_ROBE_BOTTOM.item_id,
                gear.ELIDINIS_WARD_F.item_id,
                gear.CONFLICTION_GAUNTLETS.item_id,
            ),
            (
                gear.ZARYTE_CROSSBOW.item_id,
                gear.MASORI_BODY_F.item_id,
                gear.TORVA_PLATELEGS.item_id,
                gear.DRAGONFIRE_SHIELD.item_id,
                gear.CONFLICTION_GAUNTLETS.item_id,
            ),
            (
                gear.NOXIOUS_HALBERD.item_id,
                gear.MASORI_BODY_F.item_id,
                gear.TORVA_PLATELEGS.item_id,
                gear.BARROWS_GLOVES.item_id,
            ),
        )[style]
        for index, item_id in enumerate(loadout):
            if index == 0 and weapon_item_id is not None:
                item_id = weapon_item_id
            local = int(np.flatnonzero(
                gear.DIRECT_GEAR_ITEMS == item_id)[0])
            scores[selected, schema.GEAR_BASE + local] = 100.0

    @staticmethod
    def _score_weapon_hold_toggle(
            scores: np.ndarray,
            selected: np.ndarray) -> None:
        """Keep an intentional weapon hold from falling back to the staff."""
        for item_id in (
                gear.CONFLICTION_GAUNTLETS.item_id,
                gear.BARROWS_GLOVES.item_id):
            local = int(np.flatnonzero(
                gear.DIRECT_GEAR_ITEMS == item_id)[0])
            scores[selected, schema.GEAR_BASE + local] = 90.0

    @staticmethod
    def _score_adaptive_melee_chase(
            scores: np.ndarray,
            inputs: np.ndarray,
            chosen_styles: np.ndarray) -> None:
        """Chase only a selected melee attack that is currently out of reach."""
        rel_dx = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DX] * 16.0).astype(np.int16)
        rel_dy = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DY] * 16.0).astype(np.int16)
        current_distance = np.maximum(np.abs(rel_dx), np.abs(rel_dy))
        needs_chase = (
            (chosen_styles == schema.STYLE_MELEE)
            & (inputs[:, schema.INPUT_MELEE_REACH] < 0.5)
        )

        for local_action in range(
                schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT):
            dx, dy = schema.MOVEMENT_OFFSETS[local_action]
            remaining = np.maximum(
                np.abs(rel_dx - int(dx)),
                np.abs(rel_dy - int(dy)))
            improves = needs_chase & (remaining < current_distance)
            scores[
                improves,
                schema.MOVEMENT_BASE + local_action,
            ] = 200.0 - remaining[improves]

    @staticmethod
    def _score_honest_melee_positioning(
            scores: np.ndarray,
            inputs: np.ndarray,
            chosen_styles: np.ndarray) -> None:
        """Reach real halberd range or leave a same-tile stack before a roll."""
        rel_dx = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DX] * 16.0).astype(np.int16)
        rel_dy = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DY] * 16.0).astype(np.int16)
        distance = np.maximum(np.abs(rel_dx), np.abs(rel_dy))
        needs_chase = (
            (chosen_styles == schema.STYLE_MELEE)
            & (distance > gear.NOXIOUS_HALBERD.max_distance))
        for local_action in range(
                schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT):
            dx, dy = schema.MOVEMENT_OFFSETS[local_action]
            remaining = np.maximum(
                np.abs(rel_dx - int(dx)),
                np.abs(rel_dy - int(dy)))
            improves = needs_chase & (remaining < distance)
            scores[
                improves,
                schema.MOVEMENT_BASE + local_action,
            ] = 240.0 - remaining[improves]
        same_tile = (
            (chosen_styles == schema.STYLE_MELEE)
            & (distance == 0))
        if not np.any(same_tile):
            return
        one_tile_moves = [
            local
            for local in range(
                schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT)
            if np.max(np.abs(schema.MOVEMENT_OFFSETS[local])) == 1
        ]
        for rank, local in enumerate(one_tile_moves):
            scores[
                same_tile,
                schema.MOVEMENT_BASE + local,
            ] = 260.0 - rank

    def _score_dynamic_defence(
            self, scores: np.ndarray, inputs: np.ndarray) -> None:
        """Choose a real per-tick prayer action without fabricating rows."""
        count = int(inputs.shape[0])
        rows = np.arange(count, dtype=np.intp)
        fight_lanes = self._fight_lanes(count)

        if self.defence == "melee-magic-delayed":
            # VLS is a five-tick weapon in the source-backed gear table. Each
            # lane therefore holds Melee for one through four complete VLS
            # attack cycles before one full Magic cycle, then repeats.
            vls_ticks = int(gear.VESTAS_LONGSWORD.attack_ticks)
            melee_ticks = vls_ticks * (1 + fight_lanes % 4)
            phase = self._decision_tick % (melee_ticks + vls_ticks)
            prayer = np.where(
                phase < melee_ticks,
                schema.PRAY_PROTECT_MELEE,
                schema.PRAY_PROTECT_MAGIC)
        elif self.defence == "melee-magic-reactive":
            # This is the delayed observation age actually supplied to the
            # neural model, not the attacker's live same-tick action.
            observed_age = np.rint(
                inputs[:, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK]
                * schema.OPPONENT_OBSERVED_ATTACK_AGE_NORMALIZER,
            ).astype(np.int16)
            melee_ticks = 1 + fight_lanes % 4
            prayer = np.where(
                observed_age <= melee_ticks,
                schema.PRAY_PROTECT_MELEE,
                schema.PRAY_PROTECT_MAGIC)
        elif self.defence == "seeded-protection":
            prayer = np.asarray((
                schema.PRAY_PROTECT_MAGIC,
                schema.PRAY_PROTECT_MISSILES,
                schema.PRAY_PROTECT_MELEE,
            ), dtype=np.int8)[(fight_lanes + self.seed) % 3]
        elif self.defence == "seeded-switching-protection":
            block_ticks = 2 + (fight_lanes + self.seed * 3) % 5
            block_index = self._decision_tick // block_ticks
            prayer_order = _BLOCK_STYLE_PERMUTATIONS[
                (fight_lanes + self.seed) % _BLOCK_STYLE_PERMUTATIONS.shape[0]]
            prayer = prayer_order[
                rows,
                block_index % _BLOCK_STYLE_PERMUTATIONS.shape[1]]
        elif self.defence == "seeded-human-prayer-mix":
            family = (fight_lanes + self.seed) % 6
            family_lane = fight_lanes // 6
            prayer_order = _BLOCK_STYLE_PERMUTATIONS[
                (family_lane * 5 + self.seed) %
                _BLOCK_STYLE_PERMUTATIONS.shape[0]]
            prayer = prayer_order[:, 0].copy()

            camper = family == 0
            prayer[camper] = np.asarray((
                schema.PRAY_PROTECT_MAGIC,
                schema.PRAY_PROTECT_MISSILES,
                schema.PRAY_PROTECT_MELEE,
            ), dtype=np.int8)[
                (family_lane[camper] + self.seed) % 3]

            two_prayer = family == 1
            two_block = 2 + (family_lane + self.seed * 3) % 7
            two_slot = (self._decision_tick // two_block) % 2
            prayer[two_prayer] = prayer_order[
                two_prayer, two_slot[two_prayer]]

            three_prayer = family == 2
            three_block = 2 + (family_lane * 3 + self.seed) % 6
            three_slot = (self._decision_tick // three_block) % 3
            prayer[three_prayer] = prayer_order[
                three_prayer, three_slot[three_prayer]]

            one_switch = family == 3
            one_switch_tick = (
                24 + (family_lane * 17 + self.seed * 7) % 56)
            one_slot = (self._decision_tick >= one_switch_tick).astype(
                np.int8)
            prayer[one_switch] = prayer_order[
                one_switch, one_slot[one_switch]]

            two_switch = family == 4
            first_switch = (
                18 + (family_lane * 11 + self.seed * 5) % 35)
            second_switch = (
                first_switch
                + 28
                + (family_lane * 13 + self.seed * 3) % 45)
            two_slot = (
                (self._decision_tick >= first_switch).astype(np.int8)
                + (self._decision_tick >= second_switch).astype(np.int8))
            prayer[two_switch] = prayer_order[
                two_switch, two_slot[two_switch]]

            irregular = family == 5
            if (
                    self._human_prayer_block_remaining is None
                    or self._human_prayer_block_remaining.shape != (count,)):
                self._human_prayer_block_remaining = np.zeros(
                    count, dtype=np.int16)
                self._human_prayer_block_index = np.zeros(
                    count, dtype=np.int16)
                self._human_prayer_current = prayer_order[:, 0].copy()
            expired = irregular & (
                self._human_prayer_block_remaining <= 0)
            if np.any(expired):
                block_index = self._human_prayer_block_index
                next_style = self._keyed_choice_indices(
                    fight_lanes, block_index, 3).astype(
                        np.int8, copy=False)
                repeated = expired & (
                    next_style == self._human_prayer_current)
                shift = 1 + self._keyed_choice_indices(
                    fight_lanes, block_index + 101, 2).astype(
                        np.int8, copy=False)
                next_style[repeated] = (
                    next_style[repeated] + shift[repeated]) % 3
                duration = 2 + self._keyed_choice_indices(
                    fight_lanes, block_index + 211, 9).astype(
                        np.int16, copy=False)
                self._human_prayer_current[expired] = next_style[expired]
                self._human_prayer_block_remaining[expired] = duration[expired]
                self._human_prayer_block_index[expired] += 1
            prayer[irregular] = self._human_prayer_current[irregular]
            self._human_prayer_block_remaining[irregular] -= 1
        elif self.defence == "seeded-reactive-protection":
            observed_age = np.rint(
                inputs[:, schema.INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK]
                * schema.OPPONENT_OBSERVED_ATTACK_AGE_NORMALIZER,
            ).astype(np.int16)
            visible_style = self._visible_opponent_weapon_style(inputs)
            if (
                    self._reactive_last_observed_age is None
                    or self._reactive_last_observed_age.shape != (count,)):
                self._reactive_last_observed_age = observed_age.copy()
                fallback = ((fight_lanes + self.seed) % 3).astype(
                    np.int8, copy=False)
                initial = (observed_age <= 1) & (
                    visible_style != schema.STYLE_NONE)
                fallback[initial] = visible_style[initial]
                self._reactive_current_style = fallback.copy()
                self._reactive_previous_style = fallback.copy()
                self._reactive_ticks_since_update = np.full(
                    count, 127, dtype=np.int16)
                self._reactive_ticks_since_update[initial] = 0
            else:
                self._reactive_ticks_since_update[:] = np.minimum(
                    self._reactive_ticks_since_update + 1, 32767)
                new_observation = (
                    (observed_age < self._reactive_last_observed_age)
                    & (observed_age <= 1)
                    & (visible_style != schema.STYLE_NONE))
                if np.any(new_observation):
                    self._reactive_previous_style[new_observation] = (
                        self._reactive_current_style[new_observation])
                    self._reactive_current_style[new_observation] = (
                        visible_style[new_observation])
                    self._reactive_ticks_since_update[new_observation] = 0
                self._reactive_last_observed_age[:] = observed_age

            # Some human reactions preserve the previous read for one or two
            # additional ticks. Other lanes react immediately. All reads come
            # from the staged T-1 observation supplied in `inputs`.
            reaction_delay = (fight_lanes + self.seed) % 3
            delayed = self._reactive_ticks_since_update < reaction_delay
            prayer = np.where(
                delayed,
                self._reactive_previous_style,
                self._reactive_current_style,
            ).astype(np.int8, copy=False)

            fake_family = (fight_lanes // 3 + self.seed) % 4
            fake_period = 11 + (fight_lanes * 5 + self.seed * 3) % 8
            fake_width = 1 + (fight_lanes + self.seed) % 2
            fake_phase = (
                self._decision_tick + fight_lanes * 3 + self.seed
            ) % fake_period
            fake = (
                (fake_family > 0)
                & ~delayed
                & (fake_phase < fake_width))
            fake_shift = 1 + (
                fight_lanes + self.seed + self._decision_tick
            ) % 2
            prayer[fake] = (
                prayer[fake] + fake_shift[fake]) % 3
        else:
            raise AssertionError(f"unknown dynamic defence: {self.defence}")

        scores[
            rows,
            schema.DEFENCE_BASE + prayer,
        ] = 100.0

    @staticmethod
    def _visible_opponent_weapon_style(inputs: np.ndarray) -> np.ndarray:
        """Decode only the staged opponent weapon embedding in state114."""
        embedding = inputs[:, (
            schema.INPUT_OPP_WEAPON_SIN,
            schema.INPUT_OPP_WEAPON_COS)]
        similarity = embedding @ _REACTIVE_WEAPON_EMBEDDINGS.T
        nearest = np.argmax(similarity, axis=1)
        style = np.full(inputs.shape[0], schema.STYLE_NONE, dtype=np.int8)
        known = similarity[np.arange(inputs.shape[0]), nearest] >= 0.99999
        style[known] = _REACTIVE_WEAPON_STYLES[nearest[known]]
        return style

    @staticmethod
    def _score_melee_chase(scores: np.ndarray, inputs: np.ndarray) -> None:
        """Move toward melee reach while leaving real route legality in charge."""
        rel_dx = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DX] * 16.0).astype(np.int16)
        rel_dy = np.rint(
            inputs[:, schema.INPUT_TARGET_REL_DY] * 16.0).astype(np.int16)
        current_distance = np.maximum(np.abs(rel_dx), np.abs(rel_dy))
        needs_chase = inputs[:, schema.INPUT_MELEE_REACH] < 0.5

        for local_action in range(
                schema.MOVE_OFFSET_BASE, schema.MOVEMENT_COUNT):
            dx, dy = schema.MOVEMENT_OFFSETS[local_action]
            remaining = np.maximum(
                np.abs(rel_dx - int(dx)),
                np.abs(rel_dy - int(dy)))
            improves = needs_chase & (remaining < current_distance)
            scores[
                improves,
                schema.MOVEMENT_BASE + local_action,
            ] = 90.0 - remaining[improves]

    @staticmethod
    def _score_vls_equip(scores: np.ndarray) -> None:
        vls_local = int(np.flatnonzero(
            gear.DIRECT_GEAR_ITEMS
            == gear.VESTAS_LONGSWORD.item_id)[0])
        scores[:, schema.GEAR_BASE + vls_local] = 100.0

    @staticmethod
    def _score_voidwaker_equip(scores: np.ndarray) -> None:
        voidwaker_local = int(np.flatnonzero(
            gear.DIRECT_GEAR_ITEMS
            == gear.VOIDWAKER.item_id)[0])
        scores[:, schema.GEAR_BASE + voidwaker_local] = 100.0

    @staticmethod
    def _score_zuriels_equip(scores: np.ndarray) -> None:
        staff_local = int(np.flatnonzero(
            gear.DIRECT_GEAR_ITEMS
            == gear.ZURIELS_STAFF.item_id)[0])
        scores[:, schema.GEAR_BASE + staff_local] = 100.0

    @staticmethod
    def _score_halberd_equip(scores: np.ndarray) -> None:
        halberd_local = int(np.flatnonzero(
            gear.DIRECT_GEAR_ITEMS
            == gear.NOXIOUS_HALBERD.item_id)[0])
        scores[:, schema.GEAR_BASE + halberd_local] = 100.0

    @staticmethod
    def condition_direct_gear(
            scores,
            inputs,
            legal_mask,
            opponent_ordinary_attack_cooldown_remaining=None):
        return scores


def build(
        script: str,
        defence: str = "smite",
        seed: int = 0,
        use_vengeance: bool = False) -> ScriptedPolicy:
    return ScriptedPolicy(
        script,
        defence,
        seed=seed,
        use_vengeance=use_vengeance,
    )
