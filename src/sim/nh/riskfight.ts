import type { RuntimeActorId, RuntimeTile } from "../../render/runtimeScene";
import type { VisibleEquipment } from "../clientView";
import { canAct, canMove } from "../entity/locks";
import { getAttackDelayStatus } from "../combat/timers";
import { nhMagicSpellCurrentLevelCanCast } from "../magic/spellRequirements";
import type { ConsumableId } from "../items/consumables";
import {
  castRuntimePlayerCombatVengeanceSpell, consumeRuntimePlayerCombatSupply,
  isRuntimePlayerCombatActorDead, requestRuntimePlayerCombatAttack,
  resetRuntimePlayerCombatActorTarget, runtimePlayerCombatDistance,
  runtimePlayerCombatProcessOrderForTick, setRuntimePlayerCombatAttackSet,
  setRuntimePlayerCombatLoadout, setRuntimePlayerCombatPrayers,
  syncRuntimePlayerCombatStateToInput, toggleRuntimePlayerCombatSpecial,
  type RuntimePlayerCombatActorState, type RuntimePlayerCombatState
} from "../runtimePlayerCombat";
import { canonicalNhGear } from "./canonicalGear";
import type { NhRiskFightMainAction, NhRiskFightMovementAction } from "./policy-bridge";

// The v2 contract is shared by browser inference and CUDA rollouts. Private
// opponent supplies/stats and pre-rolled hit damage are deliberately absent.
export const riskFightFeatureNames = [
  "self_hp", "opponent_hp", "self_max_hp", "opponent_max_hp",
  "self_attack_timer", "opponent_attack_age", "self_eat_delay", "self_combo_delay",
  "self_pot_delay", "self_special", "opponent_special_estimate", "self_vengeance_active",
  "opponent_vengeance_active", "self_vengeance_cooldown", "opponent_vengeance_age",
  "self_vengeance_runes", "self_attack_level", "self_recoil", "self_strength_level",
  "self_ultor", "opponent_recent_heal", "self_marlin", "self_halibut", "self_pie_bites",
  "self_brews", "self_sanfews", "self_ranging_doses", "self_combat_doses",
  "self_prayer_points", "self_ranged_level", "self_weapon_webweaver", "self_weapon_gmaul",
  "self_weapon_elder", "self_defence_level", "distance", "self_pid_first",
  "episode_progress", "incoming_projectiles_one_tick", "incoming_projectiles_two_ticks",
  "outgoing_projectiles_one_tick", "opponent_weapon_webweaver", "opponent_weapon_gmaul",
  "opponent_weapon_elder", "self_shaping_ledger", "opponent_shaping_ledger",
  "self_gmaul_queued", "self_gmaul_preloaded", "self_gmaul_expiry",
  "relative_x", "relative_z", "can_step_closer", "can_step_away", "self_magic_level"
] as const;

export const riskFightMainActions = [
  "WAIT", "WEBWEAVER_ATTACK", "WEBWEAVER_SPEC", "GMAUL_ATTACK", "GMAUL_SPEC", "ELDER_ATTACK",
  "EAT_MARLIN", "EAT_SUMMER_PIE", "EAT_HALIBUT", "EAT_MARLIN_HALIBUT", "EAT_PIE_HALIBUT",
  "CAST_VENGEANCE", "SIP_SUPER_RANGING", "SIP_SUPER_COMBAT", "SIP_BREW", "SIP_SANFEW",
  "EQUIP_ULTOR", "EQUIP_RECOIL", "GMAUL_DOUBLE_SPEC", "GMAUL_PRELOAD", "GMAUL_RELEASE"
] as const satisfies readonly NhRiskFightMainAction[];
export const riskFightPrayerActions = ["NONE", "PROTECT_RANGED", "PROTECT_MELEE"] as const;
export const riskFightMovementActions = ["HOLD", "STEP_CLOSER", "STEP_AWAY"] as const;

export interface RiskFightPolicyRuntimeInput {
  readonly state: RuntimePlayerCombatState;
  readonly selfId: RuntimeActorId;
  readonly opponentId: RuntimeActorId;
  readonly episodeStartTick: number;
  readonly maxEpisodeTicks?: number;
  readonly tileScale?: number;
  readonly canStep?: (from: RuntimeTile, to: RuntimeTile) => boolean;
  readonly routeToward?: (from: RuntimeTile, target: RuntimeTile) => RuntimeTile | null;
  readonly projectileLineOfSight?: boolean;
  readonly observedOpponent?: RuntimePlayerCombatActorState;
}

const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const remaining = (until: number, tick: number): number => Math.max(0, until - tick);
const isMaul = (id?: number): boolean => id === 4153 || id === 24225;
const hasUltor = (actor: RuntimePlayerCombatActorState): boolean => actor.equipment.ring?.itemId === 28307;

export function riskFightMovementTile(input: RiskFightPolicyRuntimeInput, action: NhRiskFightMovementAction): RuntimeTile | null {
  const { state, selfId, opponentId } = input;
  const actor = state.actors[selfId];
  const target = (input.observedOpponent ?? state.actors[opponentId]).tile;
  if (action === "HOLD" || !canMove(actor.locks, state.tick) || isRuntimePlayerCombatActorDead(actor, state.tick)) return null;
  const scale = input.tileScale ?? 128;
  const distance = runtimePlayerCombatDistance(actor.tile, target, scale);
  if (action === "STEP_CLOSER" && distance <= 1) return null;
  if (action === "STEP_AWAY" && distance >= 9) return null;
  const sign = action === "STEP_CLOSER" ? 1 : -1;
  const dx = Math.sign(target.x - actor.tile.x) * sign;
  const dz = Math.sign(target.z - actor.tile.z) * sign;
  const routed = action === "STEP_CLOSER" ? input.routeToward?.(actor.tile, target) : null;
  const candidates = routed ? [routed] : dx === 0 && dz === 0 ? [
    { x: actor.tile.x + scale, z: actor.tile.z }, { x: actor.tile.x - scale, z: actor.tile.z },
    { x: actor.tile.x, z: actor.tile.z + scale }, { x: actor.tile.x, z: actor.tile.z - scale }
  ] : [
    { x: actor.tile.x + dx * scale, z: actor.tile.z + dz * scale },
    { x: actor.tile.x + dx * scale, z: actor.tile.z },
    { x: actor.tile.x, z: actor.tile.z + dz * scale }
  ];
  return candidates.find(tile => {
    const nextDistance = runtimePlayerCombatDistance(tile, target, scale);
    return (tile.x !== actor.tile.x || tile.z !== actor.tile.z) &&
      runtimePlayerCombatDistance(actor.tile, tile, scale) <= 1 && nextDistance >= 1 &&
      (action === "STEP_CLOSER" ? (routed !== null && routed !== undefined) || nextDistance < distance : nextDistance > distance && nextDistance <= 9) &&
      (input.canStep?.(actor.tile, tile) ?? true);
  }) ?? null;
}

export function riskFightLegalMovementMask(input: RiskFightPolicyRuntimeInput): readonly boolean[] {
  return [true, riskFightMovementTile(input, "STEP_CLOSER") !== null, riskFightMovementTile(input, "STEP_AWAY") !== null];
}

export function encodeRiskFightObservation(input: RiskFightPolicyRuntimeInput & {
  readonly shaping: Readonly<Record<RuntimeActorId, number>>;
}): Float32Array {
  const { state, selfId, opponentId } = input;
  const self = state.actors[selfId];
  const opponent = input.observedOpponent ?? state.actors[opponentId];
  const tick = state.tick;
  const episodeTick = Math.max(0, tick - input.episodeStartTick);
  const publicEvents = state.events.filter(event => event.tick >= input.episodeStartTick && event.tick < tick);
  const attack = [...publicEvents].reverse().find(event => event.kind === "attack" && event.attackerId === opponentId);
  const recentHeal = publicEvents.filter(event => event.kind === "supply" && event.actorId === opponentId && event.tick >= tick - 3)
    .reduce((sum, event) => sum + (event.kind === "supply" ? event.healed : 0), 0);
  const projectileCount = (owner: RuntimeActorId, target: RuntimeActorId, delay: number): number =>
    publicEvents.filter(event => event.kind === "attack" && event.attackerId === owner && event.defenderId === target &&
      event.projectile && event.tick + event.hitDelayTicks === tick + delay).length / 4;
  // Only executed special attacks are public; an armed spec and its energy are not.
  const spent = publicEvents.reduce((sum, event) => sum + (event.kind === "attack" && event.attackerId === opponentId &&
    event.specialAttack === "granite_maul" ? (event.specialAttackCount ?? 1) * 50 : 0), 0);
  const estimatedSpecial = clamp(100 - spent + Math.floor(episodeTick / 50) * 10, 0, 100);
  let observedVengeance = false;
  let lastVengeanceCast = -50;
  for (const event of publicEvents) {
    if (event.kind === "spotanim" && event.actorId === opponentId && event.artifactUrl === "render/spotanims/vengeance_cast.glb") {
      observedVengeance = true;
      lastVengeanceCast = event.tick;
    } else if (event.kind === "hitsplat" && event.targetActorId === opponentId && event.damage > 0 &&
      !event.id.endsWith("recoil-hitsplat") && !event.id.endsWith("vengeance-hitsplat")) {
      // Reflected damage does not consume the recipient's armed Vengeance.
      observedVengeance = false;
    }
  }
  const weapon = self.equipment.weapon?.itemId;
  const opponentWeapon = opponent.equipment.weapon?.itemId;
  const movement = riskFightLegalMovementMask(input);
  const scale = input.tileScale ?? 128;
  return Float32Array.from([
    self.hitpoints / 115, opponent.hitpoints / 115, self.maxHitpoints / 115, opponent.maxHitpoints / 115,
    getAttackDelayStatus(self.attackTimer, tick).remainingTicks / 7, attack ? clamp(tick - attack.tick, 0, 12) / 12 : 1,
    remaining(self.supplyDelays.eatDelayUntilTick, tick) / 3, remaining(self.supplyDelays.karambwanDelayUntilTick, tick) / 3,
    remaining(self.supplyDelays.potionDelayUntilTick, tick) / 3, self.gmaul.specialEnergy / 100, estimatedSpecial / 100,
    Number(self.vengeanceActive), Number(observedVengeance), remaining(self.vengeanceCooldownUntilTick, tick) / 50,
    clamp(tick - lastVengeanceCast, 0, 50) / 50, self.vengeanceRuneCastsRemaining / 10,
    self.levels.attack / 120, self.recoilCharges / 40, self.levels.strength / 120, Number(hasUltor(self)), clamp(recentHeal, 0, 60) / 60,
    self.supplies.marlin / 11, self.supplies.halibut / 4, self.supplies.summer_pie / 6,
    self.supplies.saradomin_brew / 8, self.supplies.sanfew_serum / 8, self.supplies.super_ranging / 4, self.supplies.super_combat / 4,
    self.prayerPoints / 99, self.levels.ranged / 120, Number(weapon === 27652), Number(isMaul(weapon)), Number(weapon === 21003),
    self.levels.defence / 120, clamp(runtimePlayerCombatDistance(self.tile, opponent.tile, scale), 0, 9) / 9,
    Number(runtimePlayerCombatProcessOrderForTick(state, tick)[0] === selfId), clamp(episodeTick / (input.maxEpisodeTicks ?? 360), 0, 1),
    projectileCount(opponentId, selfId, 1), projectileCount(opponentId, selfId, 2), projectileCount(selfId, opponentId, 1),
    Number(opponentWeapon === 27652), Number(isMaul(opponentWeapon)), Number(opponentWeapon === 21003),
    clamp(input.shaping[selfId], -32, 32) / 32, clamp(input.shaping[opponentId], -32, 32) / 32,
    self.gmaul.queuedSpecs / 2, Number(self.gmaul.preloaded), self.gmaul.timeoutTicks / 5,
    clamp((opponent.tile.x - self.tile.x) / scale / 9, -1, 1), clamp((opponent.tile.z - self.tile.z) / scale / 9, -1, 1),
    Number(movement[1]), Number(movement[2]), self.levels.magic / 120
  ], Math.fround);
}

export function riskFightLegalMainActionMask(input: RiskFightPolicyRuntimeInput): readonly boolean[] {
  const { state, selfId, opponentId } = input;
  const actor = state.actors[selfId];
  const tick = state.tick;
  const distance = runtimePlayerCombatDistance(actor.tile, (input.observedOpponent ?? state.actors[opponentId]).tile, input.tileScale ?? 128);
  const allowed = !isRuntimePlayerCombatActorDead(actor, tick) && !isRuntimePlayerCombatActorDead(state.actors[opponentId], tick) && canAct(actor.locks, tick);
  const ready = getAttackDelayStatus(actor.attackTimer, tick).remainingTicks === 0;
  const eat = remaining(actor.supplyDelays.eatDelayUntilTick, tick) === 0;
  const combo = remaining(actor.supplyDelays.karambwanDelayUntilTick, tick) === 0;
  const pot = remaining(actor.supplyDelays.potionDelayUntilTick, tick) === 0;
  const food = allowed && eat && combo && pot && actor.hitpoints < actor.maxHitpoints;
  return riskFightMainActions.map(action => {
    switch (action) {
      case "WAIT": return true;
      case "WEBWEAVER_ATTACK": return allowed && ready && distance <= 9 && input.projectileLineOfSight !== false;
      case "WEBWEAVER_SPEC": return false; // Uncharged practice bow has no Swarm.
      case "GMAUL_ATTACK": case "ELDER_ATTACK": return allowed && ready && distance === 1;
      case "GMAUL_SPEC": return allowed && actor.gmaul.specialEnergy >= 50 && !actor.gmaul.preloaded && distance === 1;
      case "GMAUL_DOUBLE_SPEC": return allowed && actor.gmaul.specialEnergy >= 100 && !actor.gmaul.preloaded && distance === 1;
      case "GMAUL_PRELOAD": return allowed && actor.gmaul.specialEnergy >= 100 && actor.gmaul.queuedSpecs === 0;
      case "GMAUL_RELEASE": return allowed && actor.gmaul.preloaded && distance === 1;
      case "EAT_MARLIN": return food && actor.supplies.marlin > 0;
      case "EAT_SUMMER_PIE": return food && actor.supplies.summer_pie > 0;
      case "EAT_HALIBUT": return allowed && combo && actor.supplies.halibut > 0 && actor.hitpoints < actor.maxHitpoints;
      case "EAT_MARLIN_HALIBUT": return food && actor.supplies.marlin > 0 && actor.supplies.halibut > 0;
      case "EAT_PIE_HALIBUT": return food && actor.supplies.summer_pie > 0 && actor.supplies.halibut > 0;
      case "CAST_VENGEANCE": return allowed && actor.vengeanceRuneCastsRemaining > 0 && !actor.vengeanceActive &&
        remaining(actor.vengeanceCooldownUntilTick, tick) === 0 && actor.levels.defence >= 40 && nhMagicSpellCurrentLevelCanCast("vengeance", actor.levels.magic);
      case "SIP_SUPER_RANGING": return allowed && pot && combo && actor.supplies.super_ranging > 0;
      case "SIP_SUPER_COMBAT": return allowed && pot && combo && actor.supplies.super_combat > 0;
      case "SIP_BREW": return allowed && pot && combo && actor.supplies.saradomin_brew > 0 && actor.hitpoints < 115;
      case "SIP_SANFEW": return allowed && pot && combo && actor.supplies.sanfew_serum > 0 &&
        (actor.prayerPoints < 99 || Object.values(actor.levels).some(level => level < 99));
      case "EQUIP_ULTOR": return allowed && !hasUltor(actor);
      case "EQUIP_RECOIL": return allowed && actor.equipment.ring?.itemId !== 2550 && actor.recoilRingsRemaining > 0;
    }
  });
}

export function riskFightMainActionAttacks(action: NhRiskFightMainAction): boolean {
  return ["WEBWEAVER_ATTACK", "GMAUL_ATTACK", "GMAUL_SPEC", "GMAUL_DOUBLE_SPEC", "GMAUL_RELEASE", "ELDER_ATTACK"].includes(action);
}

export function applyRiskFightMainAction(initialState: RuntimePlayerCombatState, actorId: RuntimeActorId, action: NhRiskFightMainAction): {
  readonly state: RuntimePlayerCombatState; readonly consumedSupplies: readonly ConsumableId[];
} {
  let state = initialState;
  const targetId = actorId === "opponent" ? "local-player" : "opponent";
  const actor = state.actors[actorId];
  if (!canAct(actor.locks, state.tick) || isRuntimePlayerCombatActorDead(actor, state.tick)) return { state, consumedSupplies: [] };
  let equipment: VisibleEquipment = actor.equipment;
  const weapon = action === "WEBWEAVER_ATTACK" ? canonicalNhGear.webweaverBow : action.startsWith("GMAUL_")
    ? canonicalNhGear.graniteMaulOrnateHandle : action === "ELDER_ATTACK" ? canonicalNhGear.elderMaul : null;
  if (weapon && weapon.itemId !== equipment.weapon?.itemId) {
    const { shield: _shield, ...rest } = equipment;
    equipment = { ...rest, weapon };
  }
  if (action === "EQUIP_ULTOR") equipment = { ...equipment, ring: canonicalNhGear.ultorRing };
  if (action === "EQUIP_RECOIL" && actor.recoilRingsRemaining > 0) equipment = { ...equipment, ring: canonicalNhGear.ringOfRecoil };
  if (equipment !== actor.equipment) state = setRuntimePlayerCombatLoadout(state, actorId, actor.loadoutId, equipment);
  const ranged = equipment.weapon?.itemId === 27652;
  // Rapid on the bow; Aggressive on both mauls.
  state = setRuntimePlayerCombatAttackSet(state, actorId, 1);
  state = setRuntimePlayerCombatPrayers(state, actorId, state.actors[actorId].prayerPoints > 0 ? [ranged ? "rigour" : "piety"] : []);
  const consumedSupplies: ConsumableId[] = [];
  const consume = (item: ConsumableId): void => {
    const result = consumeRuntimePlayerCombatSupply(state, actorId, item);
    state = result.state;
    if (result.consumed) consumedSupplies.push(item);
  };
  switch (action) {
    case "EAT_MARLIN": consume("marlin"); break;
    case "EAT_SUMMER_PIE": consume("summer_pie"); break;
    case "EAT_HALIBUT": consume("halibut"); break;
    case "EAT_MARLIN_HALIBUT": consume("marlin"); consume("halibut"); break;
    case "EAT_PIE_HALIBUT": consume("summer_pie"); consume("halibut"); break;
    case "SIP_SUPER_RANGING": consume("super_ranging"); break;
    case "SIP_SUPER_COMBAT": consume("super_combat"); break;
    case "SIP_BREW": consume("saradomin_brew"); break;
    case "SIP_SANFEW": consume("sanfew_serum"); break;
    case "CAST_VENGEANCE": state = castRuntimePlayerCombatVengeanceSpell(state, actorId, { consumeRuneCast: true }).state; break;
    case "GMAUL_SPEC": state = toggleRuntimePlayerCombatSpecial(state, actorId).state; break;
    case "GMAUL_DOUBLE_SPEC": case "GMAUL_PRELOAD":
      state = toggleRuntimePlayerCombatSpecial(state, actorId).state;
      state = toggleRuntimePlayerCombatSpecial(state, actorId).state;
      break;
  }
  state = riskFightMainActionAttacks(action) ? requestRuntimePlayerCombatAttack(state, actorId, targetId)
    : resetRuntimePlayerCombatActorTarget(state, actorId);
  return { state, consumedSupplies };
}

export function applyRiskFightMovement(input: RiskFightPolicyRuntimeInput, action: NhRiskFightMovementAction): RuntimePlayerCombatState {
  const tile = riskFightMovementTile(input, action);
  return tile ? syncRuntimePlayerCombatStateToInput(input.state, { tiles: { [input.selfId]: tile }, tileScale: input.tileScale ?? 128 }) : input.state;
}
