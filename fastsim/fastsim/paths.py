"""Where the Kronos server and the existing trainer live.

Kept in one place so nothing else has to hard-code the long path, and so a
moved checkout only needs editing here (or overriding with KRONOS_ROOT).
"""

from __future__ import annotations

import os
from pathlib import Path

DEFAULT_SERVER_DIR = Path(
    r"C:\Kronos\kronos-osrs-184-master\kronos-osrs-184-master\Kronos-master\kronos-server"
)


def server_dir() -> Path:
    override = os.environ.get("KRONOS_SERVER_DIR")
    if override:
        return Path(override)
    return DEFAULT_SERVER_DIR


def trainer_dir() -> Path:
    """tools/nh-gpu-trainer - the trainer this rig feeds."""
    return server_dir() / "tools" / "nh-gpu-trainer"


def rollout_dir() -> Path:
    """Where the Java server writes its rollouts, and where ours go too."""
    return server_dir() / "data" / "ai" / "rollouts"


def checkpoint_dir() -> Path:
    return trainer_dir() / "checkpoints"
