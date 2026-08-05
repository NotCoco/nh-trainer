"""Re-read the server's own data and check fastsim/gear.py still agrees.

Every bonus in gear.py was copied from one of two places in the server:

    data/items/item_info.json                      - standard items
    src/.../data/impl/items/DmmRuntimeItems.java    - custom Kronos items

Copies go stale. This re-reads both sources and diffs them against what the
simulator is actually using, so a server-side item change shows up as a failed
check rather than as a slow drift in the training data.

    python tools/verify_gear_table.py

No Java build or running server needed - it reads the same files the server does.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastsim import gear, paths, schema

BONUS_FIELDS = (
    "stab_attack_bonus", "slash_attack_bonus", "crush_attack_bonus",
    "magic_attack_bonus", "range_attack_bonus",
    "stab_defence_bonus", "slash_defence_bonus", "crush_defence_bonus",
    "magic_defence_bonus", "range_defence_bonus",
    "melee_strength_bonus", "ranged_strength_bonus",
    "magic_damage_bonus", "prayer_bonus",
)


def load_item_info() -> dict:
    """data/items/item_info.json, which allows #comments the json module won't."""
    path = paths.server_dir() / "data" / "items" / "item_info.json"
    raw = re.sub(r'#[^\n"]*', "", path.read_text(encoding="utf-8"))
    return {entry["id"]: entry for entry in json.loads(raw)
            if isinstance(entry, dict) and "id" in entry}


def load_dmm_runtime_items() -> dict:
    """Pull the bonuses(...) argument list out of each register() call."""
    path = (paths.server_dir() / "src" / "main" / "java" / "io" / "ruin"
            / "data" / "impl" / "items" / "DmmRuntimeItems.java")
    source = path.read_text(encoding="utf-8")

    constants = dict(re.findall(
        r"public static final int (\w+)\s*=\s*(\d+);", source))

    result = {}
    # Split on the register boundary first. Searching for "bonuses(" across the
    # whole file would let an item with null bonuses (the vengeance trinket)
    # swallow the next item's numbers.
    for chunk in source.split("register(item(")[1:]:
        name_match = re.match(r"(\w+)", chunk)
        if name_match is None or name_match.group(1) not in constants:
            continue
        end = chunk.find("register(")
        body = chunk if end < 0 else chunk[:end]
        bonus_match = re.search(r"bonuses\(([^)]*)\)", body)
        if bonus_match is None:
            continue  # no equipment bonuses, e.g. the vengeance trinket
        numbers = [int(v.strip()) for v in bonus_match.group(1).split(",") if v.strip()]
        if len(numbers) == schema.BONUS_COUNT:
            result[int(constants[name_match.group(1)])] = numbers
    return result


def load_weapon_types() -> dict:
    path = paths.server_dir() / "data" / "items" / "weapon_types.json"
    raw = re.sub(r'#[^\n"]*', "", path.read_text(encoding="utf-8"))
    return json.loads(raw)


def main() -> int:
    item_info = load_item_info()
    dmm_items = load_dmm_runtime_items()
    weapon_types = load_weapon_types()

    problems = []
    checked = 0

    for item in gear.ALL_ITEMS:
        expected = None
        source = None

        if item.item_id in dmm_items:
            expected = dmm_items[item.item_id]
            source = "DmmRuntimeItems.java"
        elif item.item_id in item_info:
            entry = item_info[item.item_id]
            expected = [int(entry.get(field) or 0) for field in BONUS_FIELDS]
            source = "item_info.json"

        if expected is None:
            problems.append(f"{item.name} ({item.item_id}): not found in either source")
            continue

        checked += 1
        actual = list(item.bonuses)
        if actual != expected:
            diffs = [f"slot {i}: server {e} vs fastsim {a}"
                     for i, (e, a) in enumerate(zip(expected, actual)) if e != a]
            problems.append(
                f"{item.name} ({item.item_id}) from {source}:\n      "
                + "\n      ".join(diffs))

        if item.weapon_type:
            weapon = weapon_types.get(item.weapon_type)
            if weapon is None:
                problems.append(
                    f"{item.name}: unknown weapon type {item.weapon_type!r}")
            else:
                if int(weapon["attackTicks"]) != item.attack_ticks:
                    problems.append(
                        f"{item.name}: attack ticks server "
                        f"{weapon['attackTicks']} vs fastsim {item.attack_ticks}")
                if int(weapon["maxDistance"]) != item.max_distance:
                    problems.append(
                        f"{item.name}: max distance server "
                        f"{weapon['maxDistance']} vs fastsim {item.max_distance}")

    print(f"checked {checked} items against the server's own data")
    if problems:
        print("\nMISMATCHES:")
        for problem in problems:
            print(f"  - {problem}")
        print("\nfastsim/gear.py is out of date with the server.")
        return 1
    print("all gear bonuses, attack speeds and reaches match")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
