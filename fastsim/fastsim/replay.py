"""Deterministic draws shared by the Java/FastSim replay gate.

Normal training continues to use each runtime's native RNG.  Replay mode uses
pure keyed draws so Java processing order cannot move a later hit onto a
different random value.
"""

from __future__ import annotations

import numpy as np

MASK64 = (1 << 64) - 1
TICK_MIX = 0x9E3779B97F4A7C15
SIDE_MIX = 0xD1B54A32D192ED03
ORDINAL_MIX = 0x94D049BB133111EB
KIND_MIX = 0xBF58476D1CE4E5B9

DRAW_ONYX = 0
DRAW_DAMAGE = 1
DRAW_ACCURACY = 2


def _u64(value: int) -> int:
    return value & MASK64


def keyed_u64(seed: int, episode_tick: int, side: int,
              hit_ordinal: int, draw_kind: int) -> int:
    """SplitMix64 finalizer over a stable replay key."""
    value = _u64(
        int(seed)
        + TICK_MIX * (int(episode_tick) + 1)
        + SIDE_MIX * (int(side) + 1)
        + ORDINAL_MIX * (int(hit_ordinal) + 1)
        + KIND_MIX * (int(draw_kind) + 1)
    )
    value = _u64((value ^ (value >> 30)) * 0xBF58476D1CE4E5B9)
    value = _u64((value ^ (value >> 27)) * 0x94D049BB133111EB)
    return _u64(value ^ (value >> 31))


def unit(seed: int, episode_tick: int, side: int,
         hit_ordinal: int, draw_kind: int) -> float:
    """Return the same 53-bit [0, 1) value as the Java replay helper."""
    return (keyed_u64(
        seed, episode_tick, side, hit_ordinal, draw_kind
    ) >> 11) * (1.0 / (1 << 53))


def pair_units(seed: int, episode_tick: int, n_fights: int,
               hit_ordinal: int, draw_kind: int) -> np.ndarray:
    """One keyed draw for each side of each replay fight."""
    return np.asarray([
        [
            unit(seed, episode_tick, fight * 2 + side,
                 hit_ordinal, draw_kind)
            for side in range(2)
        ]
        for fight in range(n_fights)
    ], dtype=np.float64)
