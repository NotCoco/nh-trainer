"""Source-backed Webweaver risk-fight environment.

This module is deliberately isolated from the retained DMM FastSim schema.  A
risk-fight policy has different equipment, supplies, actions and projectile
semantics, so pretending it is an 86-action DMM checkpoint would make an
apparently loadable but mechanically false candidate.

Rules marked ``Kronos source`` below are translations of the server checkout
named by ``C:/Kronos/AGENTS.md``.  The few explicit assumptions are collected
in :data:`ASSUMPTIONS` and emitted in every training report.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from enum import IntEnum
import math
from typing import Iterable, Sequence

import numpy as np


LOGICAL_TICK_MS = 600
MAX_DISTANCE = 9
MAX_TICKS = 360
VENGEANCE_COOLDOWN_TICKS = 50
VENGEANCE_RUNE_CASTS = 10
VENGEANCE_REFLECT_FRACTION = 0.75
RECOIL_MAX_REFLECT_DAMAGE = 40
SPECIAL_RESTORE_PERIOD_TICKS = 50
SPECIAL_RESTORE_PERCENT = 10

# Reward invariant: shaping is clipped to [-32, +32] once per agent/episode,
# then a one-shot, causally attributed terminal is appended.  Since 100 >
# 2*32, even the worst legitimate win is +68, strictly above the best non-KO
# trajectory (+32); even the best death is -68, strictly below the worst
# non-terminal trajectory (-32).
SHAPING_BUDGET = 32.0
KO_TERMINAL_REWARD = 100.0

SOURCE_ANCHORS = {
    "logical_tick": "io/ruin/Server.java:gameplayTickMs -> DEFAULT_TICK_MS (600)",
    "projectile_formula": "io/ruin/model/map/Projectile.java:161-203; io/ruin/model/combat/Hit.java:145-155",
    "pid_compensation": "io/ruin/model/combat/Hit.java:468-483",
    "pid_shuffle": "io/ruin/process/CoreWorker.java:88-114; io/ruin/model/entity/EntityList.java:109-116",
    "webweaver_normal": "io/ruin/model/combat/RangedWeapon.java:WEBWEAVER_BOW -> Projectile.arrow(1574)",
    "webweaver_swarm": "io/ruin/model/combat/special/ranged/WebweaverBow.java:13-59",
    "vengeance": "io/ruin/model/skills/magic/spells/lunar/Vengeance.java:17-77",
    "risk_food": "io/ruin/model/item/actions/impl/Consumable.java:127-144,184-213,215-254",
    "risk_items": "io/ruin/data/impl/items/WebweaverRuntimeItems.java:14-57",
    "combat_formula": "io/ruin/model/combat/CombatUtils.java:176-329",
}

ASSUMPTIONS = (
    "The browser risk-fight preset is a no-smite, protection-prayer-enabled fight; offensive Rigour/Piety is selected with the attack style.",
    "The candidate follows the current browser draft's persistent random PID order with a 40-60 tick reroll. Kronos CoreWorker rebuilds index order every tick and only scrambles on the reroll tick, so Java matched-fight parity remains deliberately failed until that ownership difference is resolved.",
    "The Kronos server has no Elder maul special implementation, so Elder maul is a six-tick normal crush finisher here; the browser-only Pulverize draft is not treated as server truth.",
    "Poison from Webweaver Swarm is recorded as unsupported rather than approximated because this isolated episode currently has no poison cure or server poison clock parity test.",
    "Movement is represented by Chebyshev distance only.  This is sufficient for travel-time and one-tile melee legality but is not route/path collision parity.",
    "Saradomin brew and Sanfew stat effects use their standard Kronos consumable semantics; exact drink-animation timing is outside the policy state.",
)


class MainAction(IntEnum):
    WAIT = 0
    WEBWEAVER_ATTACK = 1
    WEBWEAVER_SPEC = 2
    GMAUL_ATTACK = 3
    GMAUL_SPEC = 4
    ELDER_ATTACK = 5
    EAT_MARLIN = 6
    EAT_SUMMER_PIE = 7
    EAT_HALIBUT = 8
    EAT_MARLIN_HALIBUT = 9
    EAT_PIE_HALIBUT = 10
    CAST_VENGEANCE = 11
    SIP_SUPER_RANGING = 12
    SIP_SUPER_COMBAT = 13
    SIP_BREW = 14
    SIP_SANFEW = 15
    EQUIP_ULTOR = 16
    EQUIP_RECOIL = 17


class PrayerAction(IntEnum):
    NONE = 0
    PROTECT_RANGED = 1
    PROTECT_MELEE = 2


class MovementAction(IntEnum):
    HOLD = 0
    STEP_CLOSER = 1
    STEP_AWAY = 2


MAIN_ACTION_COUNT = len(MainAction)
PRAYER_ACTION_COUNT = len(PrayerAction)
MOVEMENT_ACTION_COUNT = len(MovementAction)

VALID_KO_SOURCES = frozenset({
    "webweaver_attack",
    "webweaver_spec",
    "gmaul_attack",
    "gmaul_spec",
    "elder_attack",
    "vengeance",
    "recoil",
})


@dataclass(frozen=True)
class ProjectileProfile:
    name: str
    delay_cycles: int
    duration_start_cycles: int
    duration_increment_cycles: int
    cycle_rate: int = 16


WEBWEAVER_NORMAL_PROJECTILE = ProjectileProfile("webweaver_normal", 41, 51, 5)
WEBWEAVER_SWARM_PROJECTILES = (
    ProjectileProfile("webweaver_swarm_1", 20, 33, 3),
    ProjectileProfile("webweaver_swarm_2", 30, 43, 3),
    ProjectileProfile("webweaver_swarm_3", 40, 53, 3),
    ProjectileProfile("webweaver_swarm_4", 50, 63, 3),
)


def projectile_delay_ticks(profile: ProjectileProfile, distance: int) -> int:
    """Return Kronos ``Projectile.send`` + ``Hit.clientDelay`` logical ticks."""

    distance = max(0, int(distance))
    duration = profile.duration_start_cycles + profile.duration_increment_cycles * max(0, distance - 1)
    return max(1, ((profile.delay_cycles + duration) * profile.cycle_rate) // LOGICAL_TICK_MS)


def projectile_impact_tick(
    launch_tick: int,
    profile: ProjectileProfile,
    distance: int,
    target_already_processed: bool,
) -> int:
    """Absolute impact tick, explicitly separating travel from PID storage.

    Kronos decrements ``Hit.ticks`` at launch when the target has already had
    its entity turn.  When the target has *not* processed, that same decrement
    occurs in its remaining turn this tick.  The stored counter differs, but
    the absolute projectile arrival does not.  PID can still decide same-tick
    action and hit resolution order; it does not shorten projectile travel.
    """

    del target_already_processed  # Compensation makes absolute arrival equal.
    return int(launch_tick) + projectile_delay_ticks(profile, distance)


def swarm_impact_ticks(launch_tick: int, distance: int, target_already_processed: bool) -> tuple[int, ...]:
    return tuple(
        projectile_impact_tick(launch_tick, profile, distance, target_already_processed)
        for profile in WEBWEAVER_SWARM_PROJECTILES
    )


@dataclass
class RewardLedger:
    shaping: float = 0.0
    terminal: float = 0.0
    terminal_emitted: bool = False

    def add_shaping(self, delta: float) -> float:
        if not math.isfinite(delta):
            raise ValueError(f"non-finite shaping reward: {delta}")
        before = self.shaping
        self.shaping = float(np.clip(before + float(delta), -SHAPING_BUDGET, SHAPING_BUDGET))
        return self.shaping - before

    def emit_terminal(self, value: float) -> float:
        if not math.isfinite(value) or value not in (-KO_TERMINAL_REWARD, 0.0, KO_TERMINAL_REWARD):
            raise ValueError(f"invalid terminal reward: {value}")
        if self.terminal_emitted:
            return 0.0
        self.terminal_emitted = True
        self.terminal = float(value)
        return self.terminal

    @property
    def total(self) -> float:
        return self.shaping + self.terminal


@dataclass
class Fighter:
    hp: int = 99
    max_hp: int = 99
    attack: int = 99
    strength: int = 99
    defence: int = 99
    ranged: int = 99
    prayer_points: int = 99
    attack_timer: int = 0
    eat_delay: int = 0
    combo_delay: int = 0
    pot_delay: int = 0
    special_energy: int = 100
    vengeance_active: bool = False
    vengeance_cooldown: int = 0
    last_vengeance_cast_tick: int = -10_000
    vengeance_runes: int = VENGEANCE_RUNE_CASTS
    recoil_charge: int = RECOIL_MAX_REFLECT_DAMAGE
    ring_ultor: bool = False
    marlin: int = 11
    halibut: int = 4
    pie_bites: int = 6
    brew_doses: int = 8
    sanfew_doses: int = 8
    ranging_doses: int = 4
    combat_doses: int = 4
    prayer: PrayerAction = PrayerAction.NONE
    weapon: str = "webweaver"
    last_main_action: MainAction = MainAction.WAIT
    legal_attacks: int = 0
    landed_attacks: int = 0
    illegal_attempts: int = 0
    vengeance_casts: int = 0
    vengeance_reflect_damage: int = 0
    food_eaten: int = 0
    ultor_ticks: int = 0
    route_failures: int = 0
    damage_dealt: int = 0
    damage_taken: int = 0
    reward: RewardLedger = field(default_factory=RewardLedger)

    @property
    def alive(self) -> bool:
        return self.hp > 0


@dataclass(frozen=True)
class PendingHit:
    due_tick: int
    launch_tick: int
    owner: int
    target: int
    damage: int
    style: str
    source: str


@dataclass(frozen=True)
class FightActions:
    main: MainAction
    prayer: PrayerAction
    movement: MovementAction


@dataclass
class FightMetrics:
    seed: int
    start_distance: int
    initial_pid: int
    ticks: int = 0
    outcome: str = "active"
    winner: int | None = None
    ko_source: str | None = None
    terminal_emissions: int = 0
    simultaneous_ko: bool = False
    pid_swaps: int = 0
    projectile_hits: int = 0
    melee_hits: int = 0
    invalid_deaths: int = 0


FEATURE_NAMES = (
    "self_hp", "opponent_hp", "self_max_hp", "opponent_max_hp",
    "self_attack_timer", "opponent_attack_timer", "self_eat_delay", "self_combo_delay",
    "self_pot_delay", "self_special", "opponent_special", "self_vengeance_active",
    "opponent_vengeance_active", "self_vengeance_cooldown", "opponent_vengeance_cooldown",
    "self_vengeance_runes", "opponent_vengeance_runes", "self_recoil", "opponent_recoil",
    "self_ultor", "opponent_ultor", "self_marlin", "self_halibut", "self_pie_bites",
    "self_brews", "self_sanfews", "self_ranging_doses", "self_combat_doses",
    "self_prayer_points", "opponent_prayer_points", "self_prayer_ranged", "self_prayer_melee",
    "opponent_prayer_ranged", "opponent_prayer_melee", "distance", "self_pid_first",
    "episode_progress", "incoming_next_tick", "incoming_two_ticks", "outgoing_next_tick",
    "opponent_weapon_webweaver", "opponent_weapon_gmaul", "opponent_weapon_elder",
    "self_shaping_ledger", "opponent_shaping_ledger",
)
FEATURE_COUNT = len(FEATURE_NAMES)


def _dec(value: int) -> int:
    return max(0, int(value) - 1)


def _effective_attack(level: int, style: str) -> float:
    prayer = 1.20
    style_bonus = 0.0  # rapid ranged and aggressive melee add no attack level.
    return level * prayer + style_bonus + 8.0


def _effective_strength(level: int, style: str) -> float:
    prayer = 1.23
    style_bonus = 0.0 if style == "ranged" else 3.0
    return math.ceil(level * prayer) + style_bonus


def _hit_chance(attack_roll: float, defence_roll: float) -> float:
    if attack_roll > defence_roll:
        return 1.0 - (defence_roll + 2.0) / (2.0 * (attack_roll + 1.0))
    return attack_roll / (2.0 * (defence_roll + 1.0))


def _max_damage(effective_strength: float, strength_bonus: int) -> int:
    return int(1.3 + effective_strength / 10.0 + strength_bonus / 80.0 + effective_strength * strength_bonus / 640.0)


class RiskFight:
    """One two-agent episode with causal damage attribution."""

    def __init__(self, seed: int, start_distance: int | None = None, initial_pid: int | None = None, max_ticks: int = MAX_TICKS):
        self.seed = int(seed)
        self.rng = np.random.default_rng(self.seed)
        self.start_distance = int(start_distance if start_distance is not None else self.rng.integers(1, MAX_DISTANCE + 1))
        self.distance = self.start_distance
        self.pid_first = int(initial_pid if initial_pid is not None else self.rng.integers(0, 2))
        self.next_pid_shuffle = int(self.rng.integers(40, 61))
        self.max_ticks = int(max_ticks)
        self.tick = 0
        self.fighters = [Fighter(), Fighter()]
        self.pending: list[PendingHit] = []
        self.done = False
        self.metrics = FightMetrics(self.seed, self.start_distance, self.pid_first)
        self.last_damage_owner: list[int | None] = [None, None]
        self.last_damage_source: list[str | None] = [None, None]
        self.last_damage_launch_tick: list[int | None] = [None, None]

    def process_order(self) -> tuple[int, int]:
        return (self.pid_first, 1 - self.pid_first)

    def legal_main_mask(self, side: int) -> np.ndarray:
        actor = self.fighters[side]
        mask = np.zeros(MAIN_ACTION_COUNT, dtype=np.bool_)
        mask[MainAction.WAIT] = True
        if not actor.alive or self.done:
            return mask
        if actor.attack_timer == 0:
            mask[MainAction.WEBWEAVER_ATTACK] = self.distance <= MAX_DISTANCE
            mask[MainAction.GMAUL_ATTACK] = self.distance <= 1
            mask[MainAction.ELDER_ATTACK] = self.distance <= 1
        mask[MainAction.WEBWEAVER_SPEC] = actor.special_energy >= 50 and self.distance <= MAX_DISTANCE
        # Granite maul's special is intentionally independent of attack timer.
        mask[MainAction.GMAUL_SPEC] = actor.special_energy >= 50 and self.distance <= 1
        normal_food_legal = actor.eat_delay == 0 and actor.combo_delay == 0 and actor.pot_delay == 0
        mask[MainAction.EAT_MARLIN] = normal_food_legal and actor.marlin > 0 and actor.hp < actor.max_hp
        mask[MainAction.EAT_SUMMER_PIE] = normal_food_legal and actor.pie_bites > 0 and actor.hp < actor.max_hp
        mask[MainAction.EAT_HALIBUT] = actor.combo_delay == 0 and actor.halibut > 0 and actor.hp < actor.max_hp
        mask[MainAction.EAT_MARLIN_HALIBUT] = normal_food_legal and actor.marlin > 0 and actor.halibut > 0 and actor.hp < actor.max_hp
        mask[MainAction.EAT_PIE_HALIBUT] = normal_food_legal and actor.pie_bites > 0 and actor.halibut > 0 and actor.hp < actor.max_hp
        mask[MainAction.CAST_VENGEANCE] = (
            actor.vengeance_runes > 0
            and actor.vengeance_cooldown == 0
            and not actor.vengeance_active
            and actor.defence >= 40
        )
        mask[MainAction.SIP_SUPER_RANGING] = actor.pot_delay == 0 and actor.combo_delay == 0 and actor.ranging_doses > 0
        mask[MainAction.SIP_SUPER_COMBAT] = actor.pot_delay == 0 and actor.combo_delay == 0 and actor.combat_doses > 0
        mask[MainAction.SIP_BREW] = actor.pot_delay == 0 and actor.combo_delay == 0 and actor.brew_doses > 0 and actor.hp < 115
        mask[MainAction.SIP_SANFEW] = actor.pot_delay == 0 and actor.combo_delay == 0 and actor.sanfew_doses > 0 and (
            actor.prayer_points < 99 or actor.attack < 99 or actor.strength < 99 or actor.ranged < 99
        )
        mask[MainAction.EQUIP_ULTOR] = not actor.ring_ultor
        mask[MainAction.EQUIP_RECOIL] = actor.ring_ultor and actor.recoil_charge > 0
        return mask

    def observe(self, side: int) -> np.ndarray:
        actor = self.fighters[side]
        opponent = self.fighters[1 - side]
        incoming_one = sum(hit.damage for hit in self.pending if hit.target == side and hit.due_tick == self.tick + 1)
        incoming_two = sum(hit.damage for hit in self.pending if hit.target == side and hit.due_tick == self.tick + 2)
        outgoing_one = sum(hit.damage for hit in self.pending if hit.owner == side and hit.due_tick == self.tick + 1)
        weapon_flags = [float(opponent.weapon == name) for name in ("webweaver", "gmaul", "elder")]
        values = (
            actor.hp / 115.0, opponent.hp / 115.0, actor.max_hp / 115.0, opponent.max_hp / 115.0,
            actor.attack_timer / 7.0, opponent.attack_timer / 7.0, actor.eat_delay / 3.0, actor.combo_delay / 3.0,
            actor.pot_delay / 3.0, actor.special_energy / 100.0, opponent.special_energy / 100.0,
            float(actor.vengeance_active), float(opponent.vengeance_active), actor.vengeance_cooldown / 50.0,
            opponent.vengeance_cooldown / 50.0, actor.vengeance_runes / 10.0, opponent.vengeance_runes / 10.0,
            actor.recoil_charge / 40.0, opponent.recoil_charge / 40.0, float(actor.ring_ultor), float(opponent.ring_ultor),
            actor.marlin / 11.0, actor.halibut / 4.0, actor.pie_bites / 6.0, actor.brew_doses / 8.0,
            actor.sanfew_doses / 8.0, actor.ranging_doses / 4.0, actor.combat_doses / 4.0,
            actor.prayer_points / 99.0, opponent.prayer_points / 99.0,
            float(actor.prayer == PrayerAction.PROTECT_RANGED), float(actor.prayer == PrayerAction.PROTECT_MELEE),
            float(opponent.prayer == PrayerAction.PROTECT_RANGED), float(opponent.prayer == PrayerAction.PROTECT_MELEE),
            self.distance / MAX_DISTANCE, float(self.pid_first == side), self.tick / self.max_ticks,
            min(incoming_one, 115) / 115.0, min(incoming_two, 115) / 115.0, min(outgoing_one, 115) / 115.0,
            *weapon_flags,
            actor.reward.shaping / SHAPING_BUDGET,
            opponent.reward.shaping / SHAPING_BUDGET,
        )
        result = np.asarray(values, dtype=np.float32)
        if result.shape != (FEATURE_COUNT,):
            raise AssertionError(f"riskfight observation shape {result.shape} != {(FEATURE_COUNT,)}")
        return result

    def _advance_timers_for_next_tick(self) -> None:
        next_tick = self.tick + 1
        for actor in self.fighters:
            actor.attack_timer = _dec(actor.attack_timer)
            actor.eat_delay = _dec(actor.eat_delay)
            actor.combo_delay = _dec(actor.combo_delay)
            actor.pot_delay = _dec(actor.pot_delay)
            actor.vengeance_cooldown = _dec(actor.vengeance_cooldown)
            if actor.ring_ultor:
                actor.ultor_ticks += 1
        if next_tick > 0 and next_tick % SPECIAL_RESTORE_PERIOD_TICKS == 0:
            for actor in self.fighters:
                actor.special_energy = min(100, actor.special_energy + SPECIAL_RESTORE_PERCENT)
        if next_tick > 0 and next_tick >= self.next_pid_shuffle:
            previous = self.pid_first
            self.pid_first = int(self.rng.integers(0, 2))
            self.next_pid_shuffle = next_tick + int(self.rng.integers(40, 61))
            if self.pid_first != previous:
                self.metrics.pid_swaps += 1

    def _set_prayers(self, actions: Sequence[FightActions]) -> None:
        for side, action in enumerate(actions):
            actor = self.fighters[side]
            actor.prayer = action.prayer if actor.alive and actor.prayer_points > 0 else PrayerAction.NONE
            if actor.prayer != PrayerAction.NONE and self.tick % 3 == 0:
                actor.prayer_points = max(0, actor.prayer_points - 1)
                if actor.prayer_points == 0:
                    actor.prayer = PrayerAction.NONE

    def _apply_main_noncombat(self, side: int, action: MainAction, was_legal: bool) -> None:
        actor = self.fighters[side]
        actor.last_main_action = action
        if action == MainAction.WAIT or not actor.alive:
            return
        if not was_legal:
            actor.illegal_attempts += 1
            actor.reward.add_shaping(-0.20)
            return
        if action == MainAction.CAST_VENGEANCE:
            actor.vengeance_active = True
            actor.vengeance_cooldown = VENGEANCE_COOLDOWN_TICKS
            actor.last_vengeance_cast_tick = self.tick
            actor.vengeance_runes -= 1
            actor.vengeance_casts += 1
        elif action == MainAction.EAT_MARLIN:
            self._eat_normal(actor, 24, "marlin")
        elif action == MainAction.EAT_SUMMER_PIE:
            self._eat_normal(actor, 11, "pie")
            actor.eat_delay = 1 if actor.pie_bites % 2 == 1 else 2
        elif action == MainAction.EAT_HALIBUT:
            self._eat_combo(actor, 20)
        elif action == MainAction.EAT_MARLIN_HALIBUT:
            self._eat_normal(actor, 24, "marlin")
            self._eat_combo(actor, 20)
        elif action == MainAction.EAT_PIE_HALIBUT:
            self._eat_normal(actor, 11, "pie")
            actor.eat_delay = 1 if actor.pie_bites % 2 == 1 else 2
            self._eat_combo(actor, 20)
        elif action == MainAction.SIP_SUPER_RANGING:
            actor.ranging_doses -= 1
            actor.ranged = max(actor.ranged, 112)
            actor.pot_delay = 3
        elif action == MainAction.SIP_SUPER_COMBAT:
            actor.combat_doses -= 1
            actor.attack = max(actor.attack, 112)
            actor.strength = max(actor.strength, 112)
            actor.defence = max(actor.defence, 112)
            actor.pot_delay = 3
        elif action == MainAction.SIP_BREW:
            actor.brew_doses -= 1
            actor.max_hp = 115
            actor.hp = min(actor.max_hp, actor.hp + 16)
            actor.defence = max(actor.defence, 120)
            actor.attack = max(1, int(actor.attack * 0.90))
            actor.strength = max(1, int(actor.strength * 0.90))
            actor.ranged = max(1, int(actor.ranged * 0.90))
            actor.pot_delay = 3
        elif action == MainAction.SIP_SANFEW:
            actor.sanfew_doses -= 1
            actor.prayer_points = min(99, actor.prayer_points + 33)
            actor.attack = max(actor.attack, 99)
            actor.strength = max(actor.strength, 99)
            actor.ranged = max(actor.ranged, 99)
            actor.pot_delay = 3
        elif action == MainAction.EQUIP_ULTOR:
            actor.ring_ultor = True
        elif action == MainAction.EQUIP_RECOIL:
            actor.ring_ultor = False

    @staticmethod
    def _eat_normal(actor: Fighter, amount: int, kind: str) -> None:
        actor.hp = min(actor.max_hp, actor.hp + amount)
        actor.eat_delay = 3
        actor.attack_timer = max(actor.attack_timer, 3)
        actor.food_eaten += 1
        if kind == "marlin":
            actor.marlin -= 1
        else:
            actor.pie_bites -= 1

    @staticmethod
    def _eat_combo(actor: Fighter, amount: int) -> None:
        actor.hp = min(actor.max_hp, actor.hp + amount)
        actor.combo_delay = 3
        actor.attack_timer = max(actor.attack_timer, 1 if actor.eat_delay > 0 else 2)
        actor.halibut -= 1
        actor.food_eaten += 1

    def _move(self, actions: Sequence[FightActions]) -> None:
        for side in self.process_order():
            if not self.fighters[side].alive:
                continue
            movement = actions[side].movement
            if movement == MovementAction.STEP_CLOSER:
                self.distance = max(1, self.distance - 1)
            elif movement == MovementAction.STEP_AWAY:
                self.distance = min(MAX_DISTANCE, self.distance + 1)

    def _roll_attack(
        self,
        attacker: Fighter,
        defender: Fighter,
        style: str,
        weapon: str,
        accuracy_multiplier: float = 1.0,
        maximum_override: int | None = None,
    ) -> tuple[bool, int, int, float]:
        ultor_strength = 12 if attacker.ring_ultor and style == "melee" else 0
        if weapon == "webweaver":
            attack_bonus = 98
            strength_bonus = 68
            defence_bonus = 44
            level = attacker.ranged
            strength_level = attacker.ranged
        elif weapon == "gmaul":
            attack_bonus = 127
            strength_bonus = 118 + ultor_strength
            defence_bonus = 59
            level = attacker.attack
            strength_level = attacker.strength
        else:
            attack_bonus = 181
            strength_bonus = 186 + ultor_strength
            defence_bonus = 59
            level = attacker.attack
            strength_level = attacker.strength
        effective_attack = _effective_attack(level, style)
        attack_roll = effective_attack * (attack_bonus + 64.0) * accuracy_multiplier
        effective_defence = defender.defence + 8.0
        defence_roll = effective_defence * (defence_bonus + 64.0)
        chance = float(np.clip(_hit_chance(attack_roll, defence_roll), 0.0, 1.0))
        maximum = maximum_override if maximum_override is not None else _max_damage(_effective_strength(strength_level, style), strength_bonus)
        damage = int(self.rng.integers(0, maximum + 1))
        landed = bool(self.rng.random() <= chance)
        return landed, damage if landed else 0, maximum, chance

    def _queue_attack(self, side: int, action: MainAction, target_already_processed: bool, was_legal: bool) -> None:
        attacker = self.fighters[side]
        defender = self.fighters[1 - side]
        if not attacker.alive or not defender.alive:
            return
        if not was_legal:
            attacker.illegal_attempts += 1
            attacker.reward.add_shaping(-0.20)
            return
        if action in (MainAction.GMAUL_ATTACK, MainAction.GMAUL_SPEC, MainAction.ELDER_ATTACK) and self.distance > 1:
            # It was legal at decision time, but later PID movement took the
            # target out of melee range.  Kronos routes rather than classifying
            # the original click as an illegal action.
            attacker.route_failures += 1
            return
        if action in (MainAction.WEBWEAVER_ATTACK, MainAction.WEBWEAVER_SPEC):
            attacker.weapon = "webweaver"
            if action == MainAction.WEBWEAVER_SPEC:
                attacker.special_energy -= 50
                maximum = _max_damage(_effective_strength(attacker.ranged, "ranged"), 68)
                per_hit_max = math.ceil(maximum * 0.40)
                profiles: Iterable[ProjectileProfile] = WEBWEAVER_SWARM_PROJECTILES
                for profile in profiles:
                    landed, damage, _, chance = self._roll_attack(
                        attacker, defender, "ranged", "webweaver", 2.0,
                        maximum_override=per_hit_max,
                    )
                    if defender.prayer == PrayerAction.PROTECT_RANGED:
                        damage = int(damage * 0.60)
                    self.pending.append(PendingHit(
                        projectile_impact_tick(self.tick, profile, self.distance, target_already_processed),
                        self.tick, side, 1 - side, damage, "ranged", "webweaver_spec",
                    ))
                attacker.attack_timer = 3
            else:
                landed, damage, _, chance = self._roll_attack(attacker, defender, "ranged", "webweaver")
                if defender.prayer == PrayerAction.PROTECT_RANGED:
                    damage = int(damage * 0.60)
                self.pending.append(PendingHit(
                    projectile_impact_tick(self.tick, WEBWEAVER_NORMAL_PROJECTILE, self.distance, target_already_processed),
                    self.tick, side, 1 - side, damage, "ranged", "webweaver_attack",
                ))
                attacker.attack_timer = 3
        elif action in (MainAction.GMAUL_ATTACK, MainAction.GMAUL_SPEC):
            attacker.weapon = "gmaul"
            if action == MainAction.GMAUL_SPEC:
                attacker.special_energy -= 50
            else:
                attacker.attack_timer = 7
            landed, damage, _, chance = self._roll_attack(attacker, defender, "melee", "gmaul")
            if defender.prayer == PrayerAction.PROTECT_MELEE:
                damage = int(damage * 0.60)
            self.pending.append(PendingHit(self.tick + 1, self.tick, side, 1 - side, damage, "melee", "gmaul_spec" if action == MainAction.GMAUL_SPEC else "gmaul_attack"))
        elif action == MainAction.ELDER_ATTACK:
            attacker.weapon = "elder"
            landed, damage, _, chance = self._roll_attack(attacker, defender, "melee", "elder")
            if defender.prayer == PrayerAction.PROTECT_MELEE:
                damage = int(damage * 0.60)
            self.pending.append(PendingHit(self.tick + 1, self.tick, side, 1 - side, damage, "melee", "elder_attack"))
            attacker.attack_timer = 6
        else:
            return
        del chance
        attacker.legal_attacks += 1

    def _apply_damage(self, hit: PendingHit) -> None:
        target = self.fighters[hit.target]
        owner = self.fighters[hit.owner]
        damage = min(target.hp, max(0, hit.damage))
        if damage <= 0:
            return
        target.hp -= damage
        target.damage_taken += damage
        owner.damage_dealt += damage
        owner.landed_attacks += 1
        owner.reward.add_shaping(damage * 0.025)
        # Damage shaping is exactly zero-sum; there is no shared positive
        # attack-volume pot for two copies of one policy to collude over.
        target.reward.add_shaping(-damage * 0.025)
        self.last_damage_owner[hit.target] = hit.owner
        self.last_damage_source[hit.target] = hit.source
        self.last_damage_launch_tick[hit.target] = hit.launch_tick
        if hit.style == "ranged":
            self.metrics.projectile_hits += 1
        else:
            self.metrics.melee_hits += 1

        # Vengeance is consumed by the first positive combat hit and reflects
        # ceil(75%), as Kronos Vengeance.check does.  The reflection belongs to
        # the caster's earlier legal spell action for terminal attribution.
        if target.vengeance_active:
            target.vengeance_active = False
            reflected = min(owner.hp, math.ceil(damage * VENGEANCE_REFLECT_FRACTION))
            if reflected > 0:
                owner.hp -= reflected
                target.vengeance_reflect_damage += reflected
                target.damage_dealt += reflected
                owner.damage_taken += reflected
                target.reward.add_shaping(reflected * 0.025)
                owner.reward.add_shaping(-reflected * 0.025)
                self.last_damage_owner[hit.owner] = hit.target
                self.last_damage_source[hit.owner] = "vengeance"
                # Attribute the reflect to the legal spell cast, not to the
                # opponent projectile that happened to trigger it.
                self.last_damage_launch_tick[hit.owner] = target.last_vengeance_cast_tick

        # Recoil is only active while worn.  The target owns the causal reflect
        # and has at most 40 total reflected damage across the episode.
        if not target.ring_ultor and target.recoil_charge > 0 and owner.hp > 0:
            reflected = min(owner.hp, target.recoil_charge, damage // 10 + 1)
            if reflected > 0:
                owner.hp -= reflected
                target.recoil_charge -= reflected
                target.damage_dealt += reflected
                owner.damage_taken += reflected
                target.reward.add_shaping(reflected * 0.025)
                owner.reward.add_shaping(-reflected * 0.025)
                self.last_damage_owner[hit.owner] = hit.target
                self.last_damage_source[hit.owner] = "recoil"
                self.last_damage_launch_tick[hit.owner] = hit.launch_tick

    def _resolve_due_hits(self) -> None:
        due = [hit for hit in self.pending if hit.due_tick <= self.tick]
        self.pending = [hit for hit in self.pending if hit.due_tick > self.tick]
        for target_side in self.process_order():
            # Already-launched projectiles remain causal even if their owner was
            # killed by an earlier due hit this tick.
            for hit in (item for item in due if item.target == target_side):
                self._apply_damage(hit)

    def _finish_if_terminal(self) -> None:
        dead = [not fighter.alive for fighter in self.fighters]
        if not any(dead):
            return
        self.done = True
        self.metrics.ticks = self.tick
        if all(dead):
            self.metrics.outcome = "simultaneous_ko"
            self.metrics.simultaneous_ko = True
            # A shared positive terminal would make suicidal collusion optimal.
            # Both agents died, so both receive the ordinary death terminal.
            for fighter in self.fighters:
                fighter.reward.emit_terminal(-KO_TERMINAL_REWARD)
                self.metrics.terminal_emissions += 1
            return
        loser = 0 if dead[0] else 1
        winner = 1 - loser
        attributed_owner = self.last_damage_owner[loser]
        attributed_source = self.last_damage_source[loser]
        attributed_tick = self.last_damage_launch_tick[loser]
        attribution_is_complete = (
            attributed_owner == winner
            and attributed_source in VALID_KO_SOURCES
            and attributed_tick is not None
            and 0 <= attributed_tick <= self.tick
        )
        if not attribution_is_complete:
            self.metrics.outcome = "invalid_death"
            self.metrics.invalid_deaths += 1
            for fighter in self.fighters:
                fighter.reward.emit_terminal(0.0)
                self.metrics.terminal_emissions += 1
            return
        self.metrics.outcome = "valid_ko"
        self.metrics.winner = winner
        self.metrics.ko_source = self.last_damage_source[loser]
        self.fighters[winner].reward.emit_terminal(KO_TERMINAL_REWARD)
        self.fighters[loser].reward.emit_terminal(-KO_TERMINAL_REWARD)
        self.metrics.terminal_emissions += 2

    def step(self, actions: Sequence[FightActions]) -> tuple[np.ndarray, bool]:
        if self.done:
            return np.zeros(2, dtype=np.float32), True
        if len(actions) != 2:
            raise ValueError("risk fight requires exactly two action tuples")
        before = np.asarray([fighter.reward.total for fighter in self.fighters], dtype=np.float64)
        legal_at_decision = [self.legal_main_mask(side) for side in range(2)]
        self._set_prayers(actions)
        for side in self.process_order():
            self._apply_main_noncombat(side, actions[side].main, bool(legal_at_decision[side][int(actions[side].main)]))
        self._resolve_due_hits()
        self._finish_if_terminal()
        if not self.done:
            self._move(actions)
            processed: list[int] = []
            for side in self.process_order():
                if actions[side].main in (
                    MainAction.WEBWEAVER_ATTACK, MainAction.WEBWEAVER_SPEC,
                    MainAction.GMAUL_ATTACK, MainAction.GMAUL_SPEC, MainAction.ELDER_ATTACK,
                ):
                    self._queue_attack(
                        side, actions[side].main, (1 - side) in processed,
                        bool(legal_at_decision[side][int(actions[side].main)]),
                    )
                processed.append(side)
            self._finish_if_terminal()
        if not self.done and self.tick + 1 >= self.max_ticks:
            self.done = True
            self.metrics.outcome = "timeout"
            self.metrics.ticks = self.max_ticks
            for fighter in self.fighters:
                fighter.reward.emit_terminal(0.0)
                self.metrics.terminal_emissions += 1
        self._advance_timers_for_next_tick()
        self.tick += 1
        self.metrics.ticks = min(self.tick, self.max_ticks)
        after = np.asarray([fighter.reward.total for fighter in self.fighters], dtype=np.float64)
        return (after - before).astype(np.float32), self.done

    def result_dict(self) -> dict:
        return {
            **asdict(self.metrics),
            "distance_final": self.distance,
            "returns": [fighter.reward.total for fighter in self.fighters],
            "shaping": [fighter.reward.shaping for fighter in self.fighters],
            "terminal": [fighter.reward.terminal for fighter in self.fighters],
            "ko_action": self.metrics.ko_source,
            "ko_source_tick": None if self.metrics.winner is None else self.last_damage_launch_tick[1 - self.metrics.winner],
            # Backward-compatible alias for direct/projectile attacks.  For a
            # Vengeance KO this is deliberately the original spell-cast tick.
            "ko_launch_tick": None if self.metrics.winner is None else self.last_damage_launch_tick[1 - self.metrics.winner],
            "damage_dealt": [fighter.damage_dealt for fighter in self.fighters],
            "damage_taken": [fighter.damage_taken for fighter in self.fighters],
            "legal_attacks": [fighter.legal_attacks for fighter in self.fighters],
            "illegal_attempts": [fighter.illegal_attempts for fighter in self.fighters],
            "vengeance_casts": [fighter.vengeance_casts for fighter in self.fighters],
            "vengeance_reflect_damage": [fighter.vengeance_reflect_damage for fighter in self.fighters],
            "food_eaten": [fighter.food_eaten for fighter in self.fighters],
            "prayer_remaining": [fighter.prayer_points for fighter in self.fighters],
            "ultor_ticks": [fighter.ultor_ticks for fighter in self.fighters],
            "route_failures": [fighter.route_failures for fighter in self.fighters],
        }


def validate_reward_invariant() -> dict[str, float | bool]:
    non_ko_max = SHAPING_BUDGET
    non_ko_min = -SHAPING_BUDGET
    win_min = KO_TERMINAL_REWARD - SHAPING_BUDGET
    death_max = -KO_TERMINAL_REWARD + SHAPING_BUDGET
    return {
        "shaping_budget": SHAPING_BUDGET,
        "terminal_magnitude": KO_TERMINAL_REWARD,
        "non_ko_max": non_ko_max,
        "non_ko_min": non_ko_min,
        "win_min": win_min,
        "death_max": death_max,
        "win_strictly_dominates_non_ko": win_min > non_ko_max,
        "death_strictly_worse_than_non_ko": death_max < non_ko_min,
        "terminal_gt_twice_budget": KO_TERMINAL_REWARD > 2.0 * SHAPING_BUDGET,
    }
