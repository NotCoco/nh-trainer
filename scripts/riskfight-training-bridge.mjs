// CUDA owns inference/optimization; this process runs the browser's actual rules.
import { createInterface } from "node:readline";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadTsModule, projectRoot } from "./lib/load-ts-module.mjs";
import path from "node:path";

const combat = loadTsModule("src/sim/runtimePlayerCombat.ts");
const risk = loadTsModule("src/sim/nh/riskfight.ts");
const { canonicalNhGear: gear } = loadTsModule("src/sim/nh/canonicalGear.ts");
const { buildNhSceneCollision } = loadTsModule("src/render/nhSceneCollision.ts");
const { findNhTargetRouteWaypoints, nhSceneProjectileRouteClear } = loadTsModule("src/render/nhTileMovement.ts");
const { nhNhBotCombatTileAllowed } = loadTsModule("src/render/nhWilderness.ts");
const arena = JSON.parse(readFileSync(path.join(projectRoot, "fixtures/render/maps/inferno_arena.json"), "utf8"));
const objects = JSON.parse(readFileSync(path.join(projectRoot, "fixtures/render/maps/inferno_arena_objects.json"), "utf8"));
const collisionMaps = [objects, objects.filter(object => object.name !== "Tree")].map(items => buildNhSceneCollision(arena, items, { x: 0, y: 0, z: 0 }));
const ids = ["local-player", "opponent"];
const supplies = { ...Object.fromEntries(Object.keys(combat.runtimePlayerCombatDefaultSupplies).map(key => [key, 0])),
  marlin: 11, halibut: 4, summer_pie: 4, saradomin_brew: 8, super_restore: 0, sanfew_serum: 8,
  super_ranging: 4, super_combat: 4, ranging_potion: 0, bastion: 0 };
const equipment = { cape: gear.infernalCape, amulet: gear.amuletOfRancour, weapon: gear.webweaverBow,
  legs: gear.fremennikKilt, hands: gear.barrowsGloves, feet: { itemId: 31097, name: "Avernic treads (max)" }, ring: gear.ringOfRecoil };
const sameTile = (a, b) => a.x === b.x && a.z === b.z;
const sumSupplies = actor => Object.values(actor.supplies).reduce((a, b) => a + b, 0);

// Consecutive episode IDs otherwise give almost identical opening LCG rolls.
// This bijective 32-bit mix spreads initial seeds without changing game RNG or
// introducing collisions between the disjoint train/evaluation episode IDs.
function combatSeedForEpisode(seed) {
  let mixed = seed >>> 0;
  mixed = Math.imul(mixed ^ (mixed >>> 16), 0x7feb352d);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x846ca68b);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}

export const comboRewardContract = {
  version: "stocked_combo_v2", gamma: 1, combo_bonus_cap: 20,
  stocked_healing_threshold: 44, combo_window_tick_span: 1,
  combo_min_damage: 40, combo_ko_min_damage: 50, material_hit_min_damage: 8,
  combo_ko_terminal: 100, ordinary_ko_terminal: 20, exhausted_ko_terminal: 0,
  death_terminal: -10, damage_reward: 0, cast_reward: 0,
  combo_bonus_retained_only: "stocked victory",
  description: "Actual multi-hit damage within the same or adjacent tick, minus intervening healing; no recoil/overkill. Full combo KO needs 44 HP of healing left. Ordinary KO scales below that stock. Exhausted victories and timeouts have zero total return; deaths -10 so generic survival does not dominate combo success. Provisional combo bonuses are retained only by a surviving winner against remaining healing."
};

// Training labels only: never added to the policy's public observations. Counts
// remaining uses (pie bites / brew doses), with healing from consumables.ts.
export function healingSupplyHitpoints(actor) {
  const count = name => Math.max(0, actor.supplies[name] ?? 0);
  return count("marlin") * 24 + count("halibut") * 20 + count("summer_pie") * 11 +
    count("saradomin_brew") * (2 + Math.floor(actor.maxHitpoints * .15));
}

const actualDamage = event => Math.max(0, Math.min(event.damage, event.previousHitpoints));
const isVengeanceHit = event => event.id.endsWith("vengeance-hitsplat");

export function riskFightComboWindow(events, tick, actorId) {
  const hits = events.filter(event => event.kind === "hitsplat" && event.attackerId === actorId &&
    event.targetActorId !== actorId && event.tick >= tick - comboRewardContract.combo_window_tick_span &&
    event.tick <= tick && !event.id.endsWith("recoil-hitsplat") && actualDamage(event) > 0);
  const first = hits[0], last = hits.at(-1);
  const firstIndex = first ? events.indexOf(first) : 0;
  const lastIndex = last ? events.indexOf(last) : -1;
  const healing = events.slice(firstIndex, lastIndex + 1).filter(event => event.kind === "supply" &&
    event.actorId === first?.targetActorId).reduce((sum, event) => sum + Math.max(0, event.healed), 0);
  const damage = hits.reduce((sum, hit) => sum + actualDamage(hit), 0);
  const netDamage = Math.max(0, damage - healing);
  const directDamage = hits.filter(hit => !isVengeanceHit(hit)).reduce((sum, hit) => sum + actualDamage(hit), 0);
  const vengeanceDamage = damage - directDamage;
  const materialHits = hits.filter(hit => actualDamage(hit) >= comboRewardContract.material_hit_min_damage).length;
  const qualifies = materialHits >= 2 && directDamage >= 15 && netDamage >= comboRewardContract.combo_min_damage;
  const supportDamage = damage - Math.max(0, ...hits.map(actualDamage));
  return { hits, damage, netDamage, directDamage, vengeanceDamage, qualifies,
    lethal: qualifies && netDamage >= comboRewardContract.combo_ko_min_damage && last?.nextHitpoints === 0,
    bonus: qualifies ? Math.min(10, supportDamage * .25) + Math.min(5, vengeanceDamage * .125) : 0 };
}

export function riskFightTerminalCredit(state, winner) {
  const healingRemaining = ids.map(id => healingSupplyHitpoints(state.actors[id]));
  const terminalReward = [comboRewardContract.death_terminal, comboRewardContract.death_terminal];
  const stockedComboKos = [0, 0], stockedKos = [0, 0], exhaustedKos = [0, 0], vengeanceComboKos = [0, 0];
  if (winner !== null) {
    const targetId = ids[1 - winner];
    const deathTick = state.events.findLast(event => event.kind === "death" && event.actorId === targetId)?.tick;
    const combo = riskFightComboWindow(state.events, deathTick ?? state.tick, ids[winner]);
    const remaining = healingRemaining[1 - winner];
    const stocked = remaining >= comboRewardContract.stocked_healing_threshold;
    stockedComboKos[winner] = Number(stocked && combo.lethal);
    vengeanceComboKos[winner] = Number(stocked && combo.lethal && combo.vengeanceDamage > 0);
    stockedKos[winner] = Number(remaining > 0);
    exhaustedKos[winner] = Number(remaining === 0);
    terminalReward[winner] = stocked && combo.lethal ? comboRewardContract.combo_ko_terminal :
      comboRewardContract.ordinary_ko_terminal * Math.min(1, remaining / comboRewardContract.stocked_healing_threshold);
  }
  return { terminalReward, healingRemaining, stockedComboKos, stockedKos, exhaustedKos, vengeanceComboKos };
}

// Same-tick damage diagnostic, comparable with earlier candidate evaluations.
export function vengeanceStackDamage(events, tick, actorId) {
  const hits = events.filter(event => event.kind === "hitsplat" && event.tick === tick);
  const damage = event => Math.max(0, Math.min(event.damage, event.previousHitpoints));
  let direct = hits.filter(event => event.attackerId === actorId &&
    !event.id.endsWith("vengeance-hitsplat") && !event.id.endsWith("recoil-hitsplat"))
    .reduce((sum, event) => sum + damage(event), 0);
  let stacked = 0;
  for (const reflection of hits.filter(event => event.attackerId === actorId && event.id.endsWith("vengeance-hitsplat"))) {
    const prefix = reflection.id.slice(0, -"vengeance-hitsplat".length);
    const trigger = hits.find(event => event.id === `${prefix}hitsplat` && event.targetActorId === actorId);
    if (!trigger) continue;
    const matched = Math.min(direct, damage(reflection));
    direct -= matched;
    stacked += matched;
  }
  return stacked;
}

function routeToward(collision, from, target) {
  const waypoints = findNhTargetRouteWaypoints(from, target, 1, collision);
  const waypoint = waypoints.find(tile => !sameTile(tile, from));
  return waypoint ? { x: from.x + Math.sign(waypoint.x - from.x) * 0.5, z: from.z + Math.sign(waypoint.z - from.z) * 0.5 } : null;
}

export class BrowserRiskFight {
  constructor(config) {
    this.config = config;
    this.combatSeed = combatSeedForEpisode(config.seed);
    this.maxTicks = config.maxTicks ?? 360;
    this.collision = collisionMaps[config.variant === "cleared" ? 1 : (config.seed % 2)];
    const distance = config.startDistance ?? 5;
    let tiles;
    const rotation = (Math.abs(config.seed) % 4);
    const directions = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const [dx, dz] = directions[rotation];
    for (let offset = 0; offset < 80 && !tiles; offset++) {
      const x = 3097 + (offset % 9);
      const y = 3534 + Math.floor(offset / 9);
      const a = this.collision.worldToSceneTile({ x, y, plane: 0 });
      const b = this.collision.worldToSceneTile({ x: x + dx * distance, y: y + dz * distance, plane: 0 });
      if (this.collision.canStand(a) && this.collision.canStand(b) &&
        [a, b].every(tile => nhNhBotCombatTileAllowed(this.collision.sceneToWorldTile(tile))) &&
        nhSceneProjectileRouteClear(a, b, this.collision)) tiles = [a, b];
    }
    if (!tiles) throw new Error(`Cannot place legal risk-fight seed ${config.seed}`);
    this.state = combat.createRuntimePlayerCombatState({ riskFight: true, localTile: tiles[0], opponentTile: tiles[1],
      localLoadoutId: "acb-hides", opponentLoadoutId: "acb-hides", localAttackSetIndex: 1, opponentAttackSetIndex: 1,
      localSupplies: supplies, opponentSupplies: supplies, localVengeanceRuneCasts: 10, opponentVengeanceRuneCasts: 10,
      localRecoilRingsRemaining: 2, opponentRecoilRingsRemaining: 2,
      localVengeanceTrinketCharges: 0, opponentVengeanceTrinketCharges: 0, combatStartTick: 0, seed: this.combatSeed });
    this.state = combat.syncRuntimePlayerCombatStateToInput(this.state, {
      tiles: Object.fromEntries(ids.map((id, i) => [id, tiles[i]])), equipment: { "local-player": equipment, opponent: equipment }, tileScale: 0.5 });
    this.state = { ...this.state, processOrder: config.pid === 1 ? ["opponent", "local-player"] : ids,
      nextProcessOrderShuffleTick: 40 + Math.abs(config.seed % 21) };
    this.completedActors = this.state.actors;
    this.shaping = { "local-player": 0, opponent: 0 };
    this.stackCredits = new Map();
    this.comboCreditedHits = new Set();
    this.comboReward = [0, 0];
    this.objectiveReturn = [0, 0];
    this.lastDoubleMaulTick = [-Infinity, -Infinity];
    this.stats = { damage: [0, 0], attacks: [0, 0], food: [0, 0], specs: [0, 0], illegal: [0, 0], movement: [0, 0],
      vengeanceCasts: [0, 0], vengeanceReflectedDamage: [0, 0], vengeanceStackDamage: [0, 0], vengeanceStackReward: [0, 0],
      comboDamage: [0, 0], comboStacks: [0, 0], vengeanceComboDamage: [0, 0],
      openingVengeanceCasts: [0, 0], elderAttacks: [0, 0], doubleMaulAttacks: [0, 0], elderAfterDoubleMaul: [0, 0] };
    this.seen = new Set();
    this.rewards = [0, 0];
    this.done = false;
    this.report = null;
  }
  input(side, state = this.state) {
    const selfId = ids[side], opponentId = ids[1 - side];
    return { state, selfId, opponentId, observedOpponent: this.completedActors[opponentId],
      episodeStartTick: 0, maxEpisodeTicks: this.maxTicks, tileScale: 0.5,
      canStep: (from, to) => !sameTile(to, state.actors[opponentId].tile) &&
        nhNhBotCombatTileAllowed(this.collision.sceneToWorldTile(to)) && this.collision.canStep(from, to) &&
        nhSceneProjectileRouteClear(to, state.actors[opponentId].tile, this.collision),
      routeToward: (from, target) => routeToward(this.collision, from, target),
      projectileLineOfSight: nhSceneProjectileRouteClear(state.actors[selfId].tile, state.actors[opponentId].tile, this.collision) };
  }
  frame() {
    return ids.map((id, side) => ({
      observation: Array.from(risk.encodeRiskFightObservation({ ...this.input(side), shaping: this.shaping })),
      main: this.done ? risk.riskFightMainActions.map((_, i) => i === 0) : risk.riskFightLegalMainActionMask(this.input(side)),
      movement: this.done ? [true, false, false] : risk.riskFightLegalMovementMask(this.input(side))
    }));
  }
  step(actions) {
    this.rewards = [0, 0];
    if (this.done) return;
    const before = this.state;
    const chosen = ids.map((id, side) => {
      const [main, movement] = actions[side];
      const input = this.input(side, before);
      if (!risk.riskFightLegalMainActionMask(input)[main] || !risk.riskFightLegalMovementMask(input)[movement]) {
        this.stats.illegal[side]++;
        throw new Error(`Illegal sampled action at tick ${before.tick}: side=${side} action=${actions[side]}`);
      }
      return { main: risk.riskFightMainActions[main], tile: risk.riskFightMovementTile(input, risk.riskFightMovementActions[movement]) };
    });
    // Inputs for BOTH players were fixed above, before either player's action.
    for (const id of combat.runtimePlayerCombatProcessOrderForTick(before)) {
      const side = ids.indexOf(id);
      this.state = risk.applyRiskFightMainAction(this.state, id, chosen[side].main).state;
    }
    // Both actors submit their packet actions before arriving hits, just like
    // browser inventory clicks. Death/freeze still gates subsequent movement.
    this.state = combat.applyRuntimePlayerCombatPreMovementHits(this.state, { tiles: {}, tileScale: 0.5 }).state;
    const preMovementTiles = Object.fromEntries(ids.map(id => [id, this.state.actors[id].tile]));
    const moved = { "local-player": false, opponent: false };
    for (const id of combat.runtimePlayerCombatProcessOrderForTick(this.state)) {
      const side = ids.indexOf(id), target = this.state.actors[ids[1 - side]];
      const tile = chosen[side].tile;
      if (tile && !sameTile(tile, target.tile) && !combat.isRuntimePlayerCombatActorDead(this.state.actors[id], this.state.tick)) {
        this.state = combat.syncRuntimePlayerCombatStateToInput(this.state, { tiles: { [id]: tile }, tileScale: 0.5 });
        this.stats.movement[side]++;
        moved[id] = true;
      }
    }
    const tiles = Object.fromEntries(ids.map(id => [id, this.state.actors[id].tile]));
    const order = combat.runtimePlayerCombatProcessOrderForTick(this.state);
    const los = Object.fromEntries(ids.map(id => {
      const targetId = id === "opponent" ? "local-player" : "opponent";
      const targetTile = order.indexOf(targetId) < order.indexOf(id) ? tiles[targetId] : preMovementTiles[targetId];
      return [id, nhSceneProjectileRouteClear(tiles[id], targetTile, this.collision)];
    }));
    this.state = combat.advanceRuntimePlayerCombat(this.state, { tiles, preMovementTiles, targetRouteMovementConsumed: moved,
      projectileLineOfSight: los, tileScale: 0.5 }).state;
    // The next decision uses this completed tick, before next tick's impacts.
    // Neither policy gets the other actor's newly submitted actions.
    this.completedActors = this.state.actors;
    const changedHitTicks = new Set();
    for (const event of this.state.events) {
      if (this.seen.has(event.id)) continue;
      this.seen.add(event.id);
      if (event.kind === "hitsplat") {
        changedHitTicks.add(event.tick);
        if (event.boltEffect) throw new Error("Risk bow used a forbidden bolt effect");
        const side = ids.indexOf(event.attackerId);
        this.stats.damage[side] += event.damage;
        if (event.id.endsWith("vengeance-hitsplat")) this.stats.vengeanceReflectedDamage[side] += event.damage;
        for (let s = 0; s < 2; s++) {
          const previous = this.shaping[ids[s]];
          const next = Math.max(-32, Math.min(32, previous + event.damage * .025 * (s === side ? 1 : -1)));
          this.shaping[ids[s]] = next;
          // Preserve the v2 public damage-ledger feature, but damage alone is
          // no longer a training reward (including against exhausted targets).
        }
      } else if (event.kind === "attack") {
        const side = ids.indexOf(event.attackerId);
        this.stats.attacks[side]++;
        if (event.specialAttack === "granite_maul") this.stats.specs[side] += event.specialAttackCount ?? 1;
        if (event.specialAttack === "granite_maul" && event.specialAttackCount >= 2) {
          this.stats.doubleMaulAttacks[side]++;
          this.lastDoubleMaulTick[side] = event.tick;
        }
        if (event.attackerEquipment.weapon?.itemId === 21003) {
          this.stats.elderAttacks[side]++;
          if (event.tick - this.lastDoubleMaulTick[side] <= 2) {
            this.stats.elderAfterDoubleMaul[side]++;
            this.lastDoubleMaulTick[side] = -Infinity;
          }
        }
        if (event.specialAttack === "webweaver_bow") throw new Error("Risk bow used a forbidden weapon effect");
      } else if (event.kind === "supply") {
        if (["marlin", "halibut", "summer_pie"].includes(event.item)) this.stats.food[ids.indexOf(event.actorId)]++;
      } else if (event.kind === "spotanim" && event.artifactUrl === "render/spotanims/vengeance_cast.glb") {
        this.stats.vengeanceCasts[ids.indexOf(event.actorId)]++;
        if (event.tick <= 2) this.stats.openingVengeanceCasts[ids.indexOf(event.actorId)]++;
      }
    }
    for (const tick of [...changedHitTicks].sort((a, b) => a - b)) {
      const previous = this.stackCredits.get(tick) ?? [0, 0];
      const next = ids.map(id => vengeanceStackDamage(this.state.events, tick, id));
      for (let side = 0; side < 2; side++) {
        this.stats.vengeanceStackDamage[side] += next[side] - previous[side];
        const combo = riskFightComboWindow(this.state.events, tick, ids[side]);
        const newHits = combo.hits.filter(hit => !this.comboCreditedHits.has(hit.id));
        const stock = Math.min(1, healingSupplyHitpoints(this.state.actors[ids[1 - side]]) / comboRewardContract.stocked_healing_threshold);
        if (!combo.qualifies || !newHits.length || stock <= 0) continue;
        const newDamage = newHits.reduce((sum, hit) => sum + actualDamage(hit), 0);
        const bonus = Math.min(comboRewardContract.combo_bonus_cap - this.comboReward[side], combo.bonus * stock * newDamage / combo.damage);
        this.stats.comboStacks[side] += Number(newHits.length === combo.hits.length);
        this.stats.comboDamage[side] += newDamage;
        this.stats.vengeanceComboDamage[side] += newHits.filter(isVengeanceHit).reduce((sum, hit) => sum + actualDamage(hit), 0);
        this.stats.vengeanceStackReward[side] += combo.bonus ? bonus * Math.min(5, combo.vengeanceDamage * .125) / combo.bonus : 0;
        for (const hit of newHits) this.comboCreditedHits.add(hit.id);
        this.comboReward[side] += bonus;
        this.rewards[side] += bonus;
      }
      this.stackCredits.set(tick, next);
    }
    const dead = ids.map(id => combat.isRuntimePlayerCombatActorDead(this.state.actors[id], this.state.tick));
    this.done = dead.some(Boolean) || this.state.tick >= this.maxTicks;
    if (this.done) {
      const winner = dead[0] !== dead[1] ? Number(dead[0]) : null;
      const outcome = winner !== null ? "ko" : dead[0] && dead[1] ? "simultaneous-ko" : "timeout";
      const credit = riskFightTerminalCredit(this.state, winner);
      if (outcome === "timeout") credit.terminalReward.fill(0);
      for (let side = 0; side < 2; side++) {
        if (dead[side] || outcome === "timeout" || credit.exhaustedKos[side]) {
          this.rewards[side] -= this.comboReward[side];
          this.comboReward[side] = 0;
          this.stats.vengeanceStackReward[side] = 0;
        }
        this.rewards[side] += credit.terminalReward[side];
      }
      this.report = { ...this.config, combatSeed: this.combatSeed, ...this.stats, ...credit, outcome, winner, ticks: this.state.tick,
        comboReward: [...this.comboReward], objectiveReturn: this.objectiveReturn.map((sum, side) => sum + this.rewards[side]),
        suppliesRemaining: ids.map(id => sumSupplies(this.state.actors[id])),
        specialRemaining: ids.map(id => this.state.actors[id].gmaul.specialEnergy) };
      if (winner !== null && credit.stockedComboKos[winner]) {
        const deathTick = this.state.events.findLast(event => event.kind === "death" && event.actorId === ids[1 - winner]).tick;
        const combo = riskFightComboWindow(this.state.events, deathTick, ids[winner]);
        this.report.comboFinish = {
          netDamage: combo.netDamage, vengeanceDamage: combo.vengeanceDamage,
          victimHealingRemaining: credit.healingRemaining[1 - winner],
          hits: combo.hits.map(event => ({ id: event.id, tick: event.tick, damage: actualDamage(event),
            previousHitpoints: event.previousHitpoints, nextHitpoints: event.nextHitpoints })),
          attacks: this.state.events.filter(event => event.kind === "attack" && event.attackerId === ids[winner] &&
            event.tick >= deathTick - 5).map(event => ({ tick: event.tick, weapon: event.attackerEquipment.weapon?.name,
              special: event.specialAttack ?? null, count: event.specialAttackCount ?? 1 }))
        };
      }
    }
    this.objectiveReturn = this.objectiveReturn.map((sum, side) => sum + this.rewards[side]);
  }
}

export const trainingSchema = {
  runtime_profile: "risk_webweaver_v2", feature_names: risk.riskFightFeatureNames,
  combat_seed_generation: "bijective32 avalanche of episode ID (xor16, imul7feb352d, xor15, imul846ca68b, xor16); engine LCG unchanged",
  action_heads: { main: risk.riskFightMainActions, prayer: risk.riskFightPrayerActions, movement: risk.riskFightMovementActions },
  reward: comboRewardContract,
  engine: "browser RuntimePlayerCombat shared source",
  decision_phase: "packet actions before incoming hits; own state current, opponent appearance from completed prior tick",
  source_sha256: Object.fromEntries([
    "src/sim/runtimePlayerCombat.ts", "src/sim/nh/riskfight.ts", "src/sim/combat/gmaul.ts",
    "src/sim/combat/timers.ts", "src/sim/combat/player-combat.ts", "src/sim/combat/formulas.ts",
    "src/sim/items/consumables.ts", "src/sim/entity/locks.ts", "src/sim/magic/spellRequirements.ts",
    "src/sim/prayer/prayers.ts", "src/sim/equipment/equipment.ts", "src/sim/nh/canonicalGear.ts",
    "src/sim/nh/gearProfile.ts", "src/sim/nh/loadouts.ts", "src/render/nhSceneCollision.ts",
    "src/render/nhTileMovement.ts", "src/render/nhWilderness.ts", "src/generated/equipment-bonuses.json",
    "src/generated/server-items.json", "src/generated/weapon-types.json",
    "fixtures/render/maps/inferno_arena.json", "fixtures/render/maps/inferno_arena_objects.json"
  ].map(file =>
    [file, createHash("sha256").update(readFileSync(path.join(projectRoot, file))).digest("hex")]))
};

function batchFrame(fights) {
  const rows = fights.flatMap(fight => fight.frame());
  return { observations: rows.map(row => row.observation), main_masks: rows.map(row => row.main),
    movement_masks: rows.map(row => row.movement), rewards: fights.flatMap(fight => fight.rewards),
    dones: fights.map(fight => fight.done), reports: fights.map(fight => fight.report) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, "$1"))) {
  let fights = [];
  for await (const line of createInterface({ input: process.stdin, crlfDelay: Infinity })) {
    try {
      const message = JSON.parse(line);
      if (message.op === "close") { console.log(JSON.stringify({ ok: true })); break; }
      if (message.op === "schema") { console.log(JSON.stringify(trainingSchema)); continue; }
      if (message.op === "reset") fights = message.fights.map(config => new BrowserRiskFight(config));
      else if (message.op === "step") fights.forEach((fight, index) => fight.step(message.actions.slice(index * 2, index * 2 + 2)));
      else throw new Error(`Unknown operation ${message.op}`);
      console.log(JSON.stringify(batchFrame(fights)));
    } catch (error) {
      console.log(JSON.stringify({ error: error.stack ?? String(error) }));
      process.exitCode = 1;
      break;
    }
  }
}
