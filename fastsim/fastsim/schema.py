"""Everything the Java server and this simulator must agree on.

Nothing in here is invented. Every constant was read out of the Kronos Java
source or measured directly from a real .nhrl rollout file. Each block says
where it came from so it can be re-checked when the server changes.

Source references (paths relative to the Kronos server module):
  src/main/java/io/ruin/model/entity/player/ai/NhStakerSelfPlayManager.java
  src/main/java/io/ruin/model/entity/player/ai/scripts/NhStakerBot.java
  src/main/java/io/ruin/model/combat/CombatUtils.java
  src/main/java/io/ruin/model/inter/handlers/EquipmentStats.java
  tools/nh-gpu-trainer/nh_rollout.py
"""

from __future__ import annotations

import numpy as np

# ---------------------------------------------------------------------------
# Rollout file shape.
# Measured from the headers of the real rollouts in data/ai/rollouts.
# ---------------------------------------------------------------------------

# Read from the header of the newest rollout the current checkpoints trained
# on (nh-rollout-solana2-dmm-v25-teacher78-*.nhrl, schema version 25) and
# cross-checked against the "schema" dict inside the teacher84 .pt.
# NOTE: older rollouts in data/ai/rollouts are 111 inputs / schema version
# 14-16. Those are a DIFFERENT, retired layout. Anything this rig produces must
# match the live 114-wide one below or the trainer will refuse it.
INPUT_SIZE = 114
FEATURE_SIZE = 163
ACTION_COUNT = 86
LEGAL_MASK_BYTES = 11  # ceil(86 / 8)
NHRL_VERSION = 26  # NhPolicyRolloutExporter.VERSION
NHRL_RECORD_SIZE = 1747  # v25's 1737 bytes plus 10 head-context bytes

# The detachable defence-prayer head remains separate from the state114 base
# observation. Version 2 widens only that head with five categorical history
# positions, one-hot encoded as three columns each. Code zero means
# unknown/none and therefore produces three zero columns.
DEFENCE_PRAYER_ATTACK_HISTORY_COUNT = 3
DEFENCE_PRAYER_OWN_PRAYER_HISTORY_COUNT = 2
DEFENCE_PRAYER_HISTORY_CODE_COUNT = (
    DEFENCE_PRAYER_ATTACK_HISTORY_COUNT
    + DEFENCE_PRAYER_OWN_PRAYER_HISTORY_COUNT
)
DEFENCE_PRAYER_HISTORY_ONE_HOT_WIDTH = 3
DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE = (
    DEFENCE_PRAYER_HISTORY_CODE_COUNT
    * DEFENCE_PRAYER_HISTORY_ONE_HOT_WIDTH
)
DEFENCE_PRAYER_HISTORY_FEATURE_ORDER = (
    "attack_history_0_melee",
    "attack_history_0_ranged",
    "attack_history_0_magic",
    "attack_history_1_melee",
    "attack_history_1_ranged",
    "attack_history_1_magic",
    "attack_history_2_melee",
    "attack_history_2_ranged",
    "attack_history_2_magic",
    "own_prayer_history_0_melee",
    "own_prayer_history_0_ranged",
    "own_prayer_history_0_magic",
    "own_prayer_history_1_melee",
    "own_prayer_history_1_ranged",
    "own_prayer_history_1_magic",
)
assert len(DEFENCE_PRAYER_HISTORY_FEATURE_ORDER) == (
    DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE)

# Version 3 keeps the ordered attack/prayer context above, then appends the
# previous sixteen complete state114 observations.  Each lag is normalized
# with the checkpoint's ordinary input statistics and followed by one validity
# bit.  The current decision row is deliberately not part of this history.
DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS = 16
DEFENCE_PRAYER_PRIOR_STATE_INPUT_SIZE = INPUT_SIZE
DEFENCE_PRAYER_PRIOR_STATE_STRIDE = (
    DEFENCE_PRAYER_PRIOR_STATE_INPUT_SIZE + 1)
DEFENCE_PRAYER_PRIOR_STATE_HISTORY_CONTEXT_SIZE = (
    DEFENCE_PRAYER_PRIOR_STATE_HISTORY_LAGS
    * DEFENCE_PRAYER_PRIOR_STATE_STRIDE)
DEFENCE_PRAYER_V3_HISTORY_CONTEXT_SIZE = (
    DEFENCE_PRAYER_HISTORY_CONTEXT_SIZE
    + DEFENCE_PRAYER_PRIOR_STATE_HISTORY_CONTEXT_SIZE)
DEFENCE_PRAYER_V3_HEAD_INPUT_SIZE = (
    INPUT_SIZE + DEFENCE_PRAYER_V3_HISTORY_CONTEXT_SIZE)

# Model row -> Java decision action id for the current direct-action bridge.
# Read from NhStakerSelfPlayManager.currentDirectActionIds() and cross-checked
# against schema.action_ids in the Teacher90 checkpoint. These are deliberately
# not 0..85: the first 57 rows are channel actions and the final 29 rows map
# back to the earlier direct-gear action range.
CURRENT_ACTION_IDS = (
    *range(420449, 420505),
    420508,
    *range(420420, 420449),
)
assert len(CURRENT_ACTION_IDS) == ACTION_COUNT

# ---------------------------------------------------------------------------
# Action layout.
# The policy emits one score per action id, but the ids are grouped into
# independent channels ("causal units" in the Java). Exactly one action is
# chosen per channel per tick. These ranges were measured by decoding the
# causal_unit_sampling_support_masks of a real rollout, which records for every
# channel exactly which action ids belong to it.
# ---------------------------------------------------------------------------

COMBAT_BASE, COMBAT_COUNT = 0, 18  # attack styles + explicit specials
DEFENCE_BASE, DEFENCE_COUNT = 18, 5  # overhead prayers
MOVEMENT_BASE, MOVEMENT_COUNT = 23, 26  # stand still / step under / 24 offsets
SUPPLY_BASE, SUPPLY_COUNT = 49, 8  # eat / brew / restore / regear
GEAR_BASE, GEAR_COUNT = 57, 29  # direct per-slot equip actions

assert GEAR_BASE + GEAR_COUNT == ACTION_COUNT

# Channel index -> (first action id, how many). Order matches the Java
# CAUSAL_UNIT_* constants: combat, defence, movement, supply, then gear slots.
CHANNEL_COMBAT = 0
CHANNEL_DEFENCE = 1
CHANNEL_MOVEMENT = 2
CHANNEL_SUPPLY = 3
CHANNEL_GEAR_BASE = 4

# Equipment slot ids that get their own gear channel
# (NhStakerSelfPlayManager.OPTIONAL_GEAR_CAUSAL_SLOTS).
OPTIONAL_GEAR_SLOTS = (0, 1, 2, 3, 4, 5, 7, 9, 10, 12, 13)
CAUSAL_UNIT_COUNT = CHANNEL_GEAR_BASE + len(OPTIONAL_GEAR_SLOTS)  # 15

# nh_rollout.py marks gear_slot_13 (ammo) inactive: it must always record
# virtual NONE (-1) and never appear in a support mask.
INACTIVE_CAUSAL_UNITS = (14,)

CAUSAL_UNIT_NAMES = (
    "combat",
    "defence",
    "movement",
    "supply",
    *(f"gear_slot_{slot}" for slot in OPTIONAL_GEAR_SLOTS),
)

# ---------------------------------------------------------------------------
# Combat channel contents (NhStakerSelfPlayManager, CHANNEL_ATTACK/CHANNEL_SPEC).
# 1 "no attack" + 3 styles x 2 intents = 7 attack actions, then
# 1 "no spec"   + 5 specials x 2 intents = 11 spec actions. Total 18.
# ---------------------------------------------------------------------------

STYLE_NONE, STYLE_MAGIC, STYLE_RANGED, STYLE_MELEE = -1, 0, 1, 2
STYLE_NAMES = ("MAGIC", "RANGED", "MELEE")

ATTACK_INTENT_ATTACK, ATTACK_INTENT_OFF_TICK = 0, 1

COMBAT_NO_ATTACK = 0
COMBAT_ATTACK_BASE = 1  # style * 2 + intent
COMBAT_SPEC_NONE = 7
COMBAT_SPEC_BASE = 8  # spec_kind * 2 + intent

SPEC_GRANITE_MAUL = 0
SPEC_GRANITE_MAUL_DOUBLE = 1
SPEC_ARMADYL_GODSWORD = 2
SPEC_VOIDWAKER = 3
SPEC_VESTA_LONGSWORD = 4
SPEC_KIND_NAMES = (
    "SPEC_GRANITE_MAUL",
    "SPEC_GRANITE_MAUL_DOUBLE",
    "SPEC_ARMADYL_GODSWORD",
    "SPEC_VOIDWAKER",
    "SPEC_VESTA_LONGSWORD",
)

# Special attack energy costs, from NhStakerSelfPlayPolicyBridge.
SPEC_ENERGY_COST = np.array([500, 1000, 500, 500, 250], dtype=np.int32)

# ---------------------------------------------------------------------------
# Defence channel (overhead prayers), in Java array order.
# ---------------------------------------------------------------------------

PRAY_PROTECT_MAGIC = 0
PRAY_PROTECT_MISSILES = 1
PRAY_PROTECT_MELEE = 2
PRAY_SMITE = 3
PRAY_REDEMPTION = 4
PRAYER_NAMES = (
    "PROTECT_FROM_MAGIC",
    "PROTECT_FROM_MISSILES",
    "PROTECT_FROM_MELEE",
    "SMITE",
    "REDEMPTION",
)

# Bit values used by selfProtectionMask / opponentProtectionMaskDelayed.
PROTECT_MAGIC_MASK = 1
PROTECT_RANGED_MASK = 2
PROTECT_MELEE_MASK = 4

# Which overhead protects against which incoming style.
# index = attacker style (MAGIC/RANGED/MELEE) -> prayer index that blocks it.
BLOCKING_PRAYER = np.array(
    [PRAY_PROTECT_MAGIC, PRAY_PROTECT_MISSILES, PRAY_PROTECT_MELEE], dtype=np.int8
)
PROTECT_MASK_FOR_STYLE = np.array(
    [PROTECT_MAGIC_MASK, PROTECT_RANGED_MASK, PROTECT_MELEE_MASK], dtype=np.int8
)

# CombatUtils.expectedDamage: a matched overhead scales damage by 0.6 in PvP.
PROTECTED_DAMAGE_MULTIPLIER = 0.6

# ---------------------------------------------------------------------------
# Movement channel. Index 0 = stay, 1 = stand under, then a fixed grid of
# 24 (dx, dy) offsets in the exact Java array order.
# ---------------------------------------------------------------------------

MOVE_NONE = 0
MOVE_STAND_UNDER = 1
MOVE_OFFSET_BASE = 2

MOVEMENT_OFFSETS = np.array(
    [
        (0, 0),  # NONE
        (0, 0),  # STAND_UNDER (resolved against the opponent tile at runtime)
        (-2, -2), (-1, -2), (0, -2), (1, -2), (2, -2),
        (-2, -1), (-1, -1), (0, -1), (1, -1), (2, -1),
        (-2, 0), (-1, 0), (1, 0), (2, 0),
        (-2, 1), (-1, 1), (0, 1), (1, 1), (2, 1),
        (-2, 2), (-1, 2), (0, 2), (1, 2), (2, 2),
    ],
    dtype=np.int8,
)
assert MOVEMENT_OFFSETS.shape[0] == MOVEMENT_COUNT

# ---------------------------------------------------------------------------
# Supply channel, in Java SUPPLY_INTENTS order (the 8 that appear in data).
# ---------------------------------------------------------------------------

SUPPLY_NONE = 0
SUPPLY_SAFE_EAT = 1
SUPPLY_DOUBLE_EAT = 2
SUPPLY_TRIPLE_EAT = 3
SUPPLY_BREW_ONLY = 4
SUPPLY_RESTORE_REBOOST = 5
SUPPLY_PANIC_FULL = 6
SUPPLY_VENGEANCE_TRINKET = 7
SUPPLY_NAMES = (
    "NONE",
    "SAFE_EAT",
    "DOUBLE_EAT",
    "TRIPLE_EAT",
    "BREW_ONLY",
    "RESTORE_REBOOST",
    "PANIC_FULL",
    "VENGEANCE_TRINKET",
)

# ---------------------------------------------------------------------------
# The 114 model inputs, in the exact order NhStakerSelfPlayManager.encodeInput
# writes them. Names are the observation fields; the comment on each block is
# the normaliser applied in Java. Index constants below are asserted against
# the ones hard-coded in NhNeuralPolicyModel.
# ---------------------------------------------------------------------------

INPUT_DISTANCE = 0
INPUT_SELF_HP = 1
INPUT_OPP_HP = 2
INPUT_SELF_PRAYER_POINTS = 3
INPUT_SELF_FOOD_COUNT = 4
INPUT_SELF_BREW_COUNT = 5
INPUT_SELF_RESTORE_COUNT = 6
INPUT_SELF_REBOOST_COUNT = 7
INPUT_CAN_ATTACK = 8
INPUT_SELF_ATTACK_READY = 9
INPUT_CAN_SPEC_SINGLE = 10
INPUT_CAN_SPEC_DOUBLE = 11
INPUT_SELF_FROZEN = 12
INPUT_OPP_FROZEN = 13
INPUT_SELF_FREEZE_TICKS = 14
INPUT_OPP_FREEZE_TICKS = 15
INPUT_SELF_MOVING = 16
INPUT_OPP_MOVING = 17
INPUT_ATE_FOOD = 18
INPUT_DRANK_POTION = 19
INPUT_REWARD_DELTA = 20
INPUT_REWARD_DPS = 21
INPUT_REWARD_TOTAL = 22
INPUT_LAST_DEALT_HIT = 23
INPUT_LAST_TAKEN_HIT = 24
INPUT_SELF_SPEC_ENERGY = 25
INPUT_SELF_SPEC_ACTIVE = 26
INPUT_SELF_DX = 27
INPUT_SELF_DY = 28
INPUT_OPP_DX = 29
INPUT_OPP_DY = 30
INPUT_TARGET_REL_DX = 31
INPUT_TARGET_REL_DY = 32
INPUT_TARGET_PRESENT = 33
# 34..48: five one-hot style blocks of 3 (self likely, current offence,
# scripted offence, opponent likely delayed, opponent gear delayed).
INPUT_STYLE_BLOCK_BASE = 34
INPUT_STYLE_BLOCK_WIDTH = 3
INPUT_STYLE_BLOCK_COUNT = 5
INPUT_SELF_PROTECT_MAGIC = 49
INPUT_SELF_PROTECT_RANGED = 50
INPUT_SELF_PROTECT_MELEE = 51
INPUT_OPP_PROTECT_MAGIC = 52
INPUT_OPP_PROTECT_RANGED = 53
INPUT_OPP_PROTECT_MELEE = 54
INPUT_SELF_WEAPON_SIN = 55
INPUT_SELF_WEAPON_COS = 56
INPUT_OPP_WEAPON_SIN = 57
INPUT_OPP_WEAPON_COS = 58
INPUT_OPP_SPEC_ENERGY_EST = 59
INPUT_REWARD_EPISODE_ACTIVE = 60
INPUT_LEVEL_RATIO_BASE = 61  # attack, strength, defence, ranged, magic
INPUT_LEVEL_DEFICIT_BASE = 66  # attack, strength, defence, ranged, magic
INPUT_MELEE_REACH = 71
INPUT_OPP_MELEE_REACH = 72
INPUT_GMAUL_SINGLE_KO = 73
INPUT_GMAUL_DOUBLE_KO = 74
INPUT_GMAUL_SINGLE_SETUP = 75
INPUT_GMAUL_DOUBLE_SETUP = 76
INPUT_SELF_MAGIC_DEF_SCORE = 77
INPUT_SELF_RANGED_DEF_SCORE = 78
INPUT_SELF_MELEE_DEF_SCORE = 79
INPUT_SELF_MAGIC_DEF_GAIN = 80
INPUT_SELF_RANGED_DEF_GAIN = 81
INPUT_SELF_MELEE_DEF_GAIN = 82
INPUT_OPP_MAGIC_WEAKNESS = 83
INPUT_OPP_RANGED_WEAKNESS = 84
INPUT_OPP_MELEE_WEAKNESS = 85
INPUT_VISIBLE_STYLE_MATCH_RATE = 86
INPUT_VISIBLE_STYLE_MISMATCH_RATE = 87
INPUT_VISIBLE_STYLE_CONFIDENCE = 88
INPUT_VISIBLE_STYLE_LAST_OUTCOME = 89
INPUT_OPP_VENG_TRINKET_RECENT = 90
INPUT_OPP_VENG_TRINKET_CASTS = 91
INPUT_SELF_GMAUL_SPECS_USED = 92
INPUT_SELF_VOIDWAKER_SPECS_USED = 93
INPUT_SELF_VLS_SPECS_USED = 94
INPUT_LAST_SPEC_KIND_BASE = 95  # one-hot width 5
INPUT_PREV_SPEC_KIND_BASE = 100  # one-hot width 5
INPUT_TICKS_SINCE_LAST_SPEC = 105
INPUT_SELF_SPEC_ENERGY_2 = 106  # written twice by Java, deliberately
INPUT_SELF_INVENTORY_FREE_SLOTS = 107
INPUT_SELF_HAS_SHIELD = 108
INPUT_CAN_EQUIP_TWO_HANDED = 109
# The last four are written by absolute index at the end of encodeInput.
INPUT_OPP_TICKS_SINCE_OBSERVED_ATTACK = 110
INPUT_SELF_ATTACK_DELAY_REMAINING = 111
INPUT_SELF_CLIENT_SPEC_CONTROL = 112
INPUT_SELF_OPTIONAL_VLS_SETUP_PENDING = 113

# All 114 are exported at schema version 25. The three tail slots are the ones
# the newer heads read by absolute index (see the .pt "schema" dict:
# attack_delay_input_index 111, spec_control 112, vls setup pending 113).
EXPORTED_INPUT_INDICES = INPUT_SIZE
assert INPUT_SELF_OPTIONAL_VLS_SETUP_PENDING == INPUT_SIZE - 1

# Normalisers, copied from the Java constants of the same name.
# NhStakerSelfPlayManager.FREEZE_TICKS_NORMALIZER is 80. The 33-tick Barrage
# duration is a mechanic, not the model-input normalizer.
FREEZE_TICKS_NORMALIZER = 80.0
# NhStakerSelfPlayManager.WEAPON_EMBED_FREQ. This is a learned categorical
# embedding frequency, not a degrees-to-radians conversion.
WEAPON_EMBED_FREQ = 0.013
# NhStakerSelfPlayManager.OPPONENT_OBSERVED_ATTACK_AGE_NORMALIZER.
OPPONENT_OBSERVED_ATTACK_AGE_NORMALIZER = 8.0
SELF_ATTACK_DELAY_REMAINING_NORMALIZER = 8.0
VENGEANCE_TRINKET_RECENT_TICKS_NORMALIZER = 80
VENGEANCE_TRINKET_CAST_COUNT_NORMALIZER = 8.0

# ---------------------------------------------------------------------------
# Equipment bonus vector order (EquipmentStats).
# ---------------------------------------------------------------------------

STAB_ATTACK, SLASH_ATTACK, CRUSH_ATTACK, MAGIC_ATTACK, RANGE_ATTACK = 0, 1, 2, 3, 4
STAB_DEFENCE, SLASH_DEFENCE, CRUSH_DEFENCE, MAGIC_DEFENCE, RANGE_DEFENCE = 5, 6, 7, 8, 9
MELEE_STRENGTH, RANGED_STRENGTH, MAGIC_DAMAGE, PRAYER_BONUS = 10, 11, 12, 13
BONUS_COUNT = 14

# ---------------------------------------------------------------------------
# Source pair modes (nh_rollout.SOURCE_PAIR_MODE_NAMES).
# ---------------------------------------------------------------------------

PAIR_MODE_UNKNOWN = 0
PAIR_MODE_MIRROR = 1
PAIR_MODE_RIVEN = 2
PAIR_MODE_FIXED = 3
PAIR_MODE_SNAPSHOT = 4
PAIR_MODE_COHORT = 5
PAIR_MODE_EVALUATION = 6


def clamp01(x):
    return np.clip(x, 0.0, 1.0)


def clamp_signed(x):
    return np.clip(x, -1.0, 1.0)
