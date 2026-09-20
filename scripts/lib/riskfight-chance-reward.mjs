// Training-only counterfactual grading. Keep the recorded action/impact order,
// re-roll accuracy and damage, and measure first-passage death probability.
// This is conditional on the observed actions, NOT a rollout of alternative
// future policy decisions. No sampled damage enters the probability calculation.
import { loadTsModule } from "./load-ts-module.mjs";

const { applyConsumable, createSupplyDelayState } = loadTsModule("src/sim/items/consumables.ts");
const { createAttackTimerState } = loadTsModule("src/sim/combat/timers.ts");
const { applyProtectionDamageReduction } = loadTsModule("src/sim/prayer/prayers.ts");
const ids = ["local-player", "opponent"];
const healingMaps = new Map();
const reflected = event => /-(vengeance|recoil)-hitsplat$/.test(event.id);

export function chanceDamageDistribution(hit) {
  if (!Number.isInteger(hit.maxDamage) || hit.maxDamage < 0 || !Number.isFinite(hit.hitChance) ||
      hit.hitChance < 0 || hit.hitChance > 1 || hit.boltEffect || hit.spellId) {
    throw new Error("Unsupported risk-fight damage distribution");
  }
  const probabilities = new Map([[0, 1 - hit.hitChance]]);
  for (let raw = 0; raw <= hit.maxDamage; raw++) {
    const damage = applyProtectionDamageReduction({ damage: raw, attackStyle: hit.style,
      defenderPrayers: hit.defenderProtectionPrayer ? [hit.defenderProtectionPrayer] : [], attackerIsPlayer: true });
    probabilities.set(damage, (probabilities.get(damage) ?? 0) + hit.hitChance / (hit.maxDamage + 1));
  }
  return [...probabilities].filter(([, probability]) => probability > 0);
}

function healingMap(item, maximum) {
  const key = `${item}:${maximum}`;
  if (!healingMaps.has(key)) {
    const table = Array.from({ length: 256 }, (_, hp) => {
      if (!hp) return 0; // Eating cannot revive a branch that died earlier.
      const stats = Object.fromEntries(["attack", "strength", "defence", "ranged", "magic", "hitpoints", "prayer"]
        .map(stat => [stat, { current: stat === "hitpoints" ? hp : 99, fixed: stat === "hitpoints" ? maximum : 99 }]));
      const consumed = applyConsumable({ stats, item, currentTick: 100, delays: createSupplyDelayState(),
        attackTimer: createAttackTimerState() });
      if (!consumed.ok) throw new Error(`Cannot grade consumed ${item}`);
      return consumed.stats.hitpoints.current;
    });
    healingMaps.set(key, table);
  }
  return healingMaps.get(key);
}

// A lethal first maul hides the second hitsplat in the rendered event stream.
// Both rolls were already committed by this dispatch; include the sibling even
// when the first actual roll killed. Do not invent an unlaunched follow-up.
export function completeChanceImpacts(events) {
  const present = new Set(events.filter(event => event.kind === "hitsplat").map(event => event.id));
  const countByPrefix = new Map(events.filter(event => event.kind === "attack" && event.specialAttack === "granite_maul")
    .map(event => [event.id.replace(/granite-maul-special-attack$/, "granite-maul-spec-"), event.specialAttackCount ?? 1]));
  const result = [];
  for (const event of events) {
    result.push(event);
    const match = event.kind === "hitsplat" && event.id.match(/^(.*granite-maul-spec-)(\d+)-hit-hitsplat$/);
    if (!match) continue;
    const count = countByPrefix.get(match[1]) ?? 1;
    for (let index = Number(match[2]) + 1; index < count; index++) {
      const id = `${match[1]}${index}-hit-hitsplat`;
      if (!present.has(id)) {
        result.push({ ...event, id });
        present.add(id);
      }
    }
  }
  return result;
}

// Marginal HP distribution, jointly retaining the other player's Vengeance
// and recoil state. Reflection uses the SAME damage roll as its trigger, and
// Vengeance stays armed after a miss or zero. Opponent survival/action changes
// in alternative branches are intentionally outside this conditional metric.
function deathProbability(actorId, actors, events, currentTick) {
  const otherId = ids.find(id => id !== actorId), actor = actors[actorId], other = actors[otherId];
  const encode = (hp, veng, charges, ring, rings) => ((((hp * 2 + Number(veng)) * 41 + charges) * 2 + Number(ring)) * 3 + rings);
  const initial = encode(actor.hitpoints, other.vengeanceActive, other.recoilCharges,
    other.equipment.ring?.itemId === 2550, other.recoilRingsRemaining ?? Number(other.recoilCharges > 0));
  let distribution = new Map([[initial, 1]]), dead = 0, beforeTickDead = 0;
  for (const event of events) {
    const incoming = event.kind === "hitsplat" && !reflected(event) && event.targetActorId === actorId;
    const outgoing = event.kind === "hitsplat" && !reflected(event) && event.attackerId === actorId;
    const eating = event.kind === "supply" && event.actorId === actorId;
    const cast = event.kind === "spotanim" && event.actorId === otherId && event.artifactUrl === "render/spotanims/vengeance_cast.glb";
    const equip = event.kind === "chance-ring" && event.actorId === otherId;
    if (!incoming && !outgoing && !eating && !cast && !equip) continue;
    const rolls = incoming || outgoing ? chanceDamageDistribution(event) : [[0, 1]];
    const heals = eating ? healingMap(event.item, event.maxHitpoints) : null;
    const next = new Map();
    for (const [key, mass] of distribution) {
      const rings = key % 3, r = Math.floor(key / 3), ring = r % 2, q = Math.floor(r / 2), charges = q % 41;
      const v = Math.floor(q / 41), veng = v % 2, hp = Math.floor(v / 2);
      for (const [damage, probability] of rolls) {
        let nextHp = hp, nextVeng = veng, nextCharges = charges, nextRing = ring, nextRings = rings;
        if (incoming) nextHp = Math.max(0, hp - damage);
        if (outgoing && damage > 0) {
          const vengeance = veng ? Math.ceil(damage * .75) : 0;
          const recoil = ring ? Math.min(Math.max(0, hp - vengeance), Math.ceil(damage * .1), charges) : 0;
          nextHp = Math.max(0, hp - vengeance - recoil);
          nextCharges -= recoil;
          if (recoil > 0 && !nextCharges) { nextRing = 0; nextRings = Math.max(0, rings - 1); }
          nextVeng = 0;
        }
        if (eating) nextHp = heals[hp];
        if (cast) nextVeng = 1;
        if (equip) {
          if (event.equipped && !nextRing && !nextCharges && nextRings > 0) nextCharges = 40;
          nextRing = Number(event.equipped && nextCharges > 0);
        }
        const value = mass * probability;
        if (!nextHp) dead += value;
        else {
          const target = encode(nextHp, nextVeng, nextCharges, nextRing, nextRings);
          next.set(target, (next.get(target) ?? 0) + value);
        }
      }
    }
    distribution = next;
    if (event.tick < currentTick) beforeTickDead = dead;
  }
  return { total: Math.min(1, dead), current: Math.max(0, Math.min(1, dead - beforeTickDead)) };
}

export function riskFightChanceWindow(previous, current) {
  const usePrevious = previous?.tick === current.tick - 1;
  const initial = usePrevious ? previous : current;
  const events = completeChanceImpacts(usePrevious ? [...previous.events, ...current.events] : current.events);
  const probabilities = ids.map(id => deathProbability(id, initial.actors, events, current.tick));
  return { received: probabilities.map(value => value.current), total: probabilities.map(value => value.total) };
}
