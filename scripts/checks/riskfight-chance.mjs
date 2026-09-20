import assert from "node:assert/strict";
import { chanceDamageDistribution, completeChanceImpacts, riskFightChanceWindow } from "../lib/riskfight-chance-reward.mjs";

export function verifyRiskFightChance() {
  const actor = hp => ({ hitpoints: hp, maxHitpoints: 99, vengeanceActive: false, recoilCharges: 0, equipment: {} });
  const actors = hp => ({ "local-player": actor(99), opponent: actor(hp) });
  const hit = (id, tick, maxDamage, hitChance = 1, attackerId = "local-player") => ({ kind: "hitsplat", id,
    tick, maxDamage, hitChance, style: "crush", attackerId, targetActorId: attackerId === "local-player" ? "opponent" : "local-player" });
  const food = (tick, item) => ({ kind: "supply", tick, item, maxHitpoints: 99, actorId: "opponent" });
  const tick = (number, hp, events) => ({ tick: number, actors: actors(hp), events });
  const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
  const double = [hit("maul1", 0, 40), hit("maul2", 0, 40)];
  near(riskFightChanceWindow(null, tick(0, 80, double)).received[1], 1 / 1681);
  near(riskFightChanceWindow(null, tick(0, 60, double)).received[1], 231 / 1681);
  near(riskFightChanceWindow(null, tick(0, 80, double.map(event => ({ ...event, hitChance: .5 })))).received[1], .25 / 1681);
  near(riskFightChanceWindow(null, tick(0, 81, double)).received[1], 0);
  near(riskFightChanceWindow(null, tick(0, 1, [hit("miss", 0, 100, 0)])).received[1], 0);
  const protectedPmf = chanceDamageDistribution({ ...hit("protected", 0, 4), defenderProtectionPrayer: "protect_from_melee" });
  near(protectedPmf.reduce((sum, [, mass]) => sum + mass, 0), 1);
  assert.deepEqual(protectedPmf, [[0, .4], [1, .4], [2, .2]]);

  // Exact independent enumeration is an oracle for the two-tick DP, including
  // healing caps and death BEFORE healing (never resurrect a lethal branch).
  let lethalFirst = 0, lethalSecond = 0;
  for (let first = 0; first <= 40; first++) for (let second = 0; second <= 40; second++) {
    if (first >= 40) lethalFirst++;
    else if (second >= Math.min(99, 40 - first + 24)) lethalSecond++;
  }
  const previous = tick(0, 40, [hit("first", 0, 40)]);
  const current = tick(1, 2, [food(1, "marlin"), hit("second", 1, 40)]);
  const two = riskFightChanceWindow(previous, current);
  near(two.total[1], (lethalFirst + lethalSecond) / 1681);
  near(two.received[1], lethalSecond / 1681);
  const doubleEat = riskFightChanceWindow(previous, { ...current, events: [food(1, "marlin"), food(1, "halibut"), hit("second", 1, 40)] });
  near(doubleEat.received[1], 0);
  near(riskFightChanceWindow(previous, tick(1, 2, [])).received[1], 0);
  const maulAt80 = tick(0, 80, double);
  const followup = [food(1, "marlin"), hit("elder", 1, 60)];
  const singleEatChance = riskFightChanceWindow(maulAt80, tick(1, 10, followup)).received[1];
  const doubleEatChance = riskFightChanceWindow(maulAt80, tick(1, 10, [food(1, "marlin"), food(1, "halibut"), followup[1]])).received[1];
  let singleLethal = 0, doubleLethal = 0;
  for (let a = 0; a <= 40; a++) for (let b = 0; b <= 40; b++) for (let c = 0; c <= 60; c++) {
    if (a + b >= 80) continue;
    singleLethal += Number(c >= Math.min(99, 80 - a - b + 24));
    doubleLethal += Number(c >= Math.min(99, 80 - a - b + 44));
  }
  near(singleEatChance, singleLethal / (41 * 41 * 61));
  near(doubleEatChance, doubleLethal / (41 * 41 * 61));
  assert.ok(singleEatChance > doubleEatChance && doubleEatChance > 0);
  // The previous realized HP/roll does not replace the opening distribution.
  near(two.received[1], riskFightChanceWindow(previous, { ...current, actors: actors(39) }).received[1]);
  assert.ok(riskFightChanceWindow(null, tick(0, 90, double)).received[1] < riskFightChanceWindow(null, tick(0, 70, double)).received[1]);

  const vengActors = actors(20);
  vengActors["local-player"].vengeanceActive = true;
  // Two attacks into Vengeance: only first positive hit reflects, using ceil(.75*d).
  let vengeanceLethal = 0;
  for (let a = 0; a <= 40; a++) for (let b = 0; b <= 40; b++) {
    if (Math.ceil((a || b) * .75) >= 20) vengeanceLethal++;
  }
  const vengeance = { tick: 0, actors: vengActors,
    events: [hit("out1", 0, 40, 1, "opponent"), hit("out2", 0, 40, 1, "opponent")] };
  near(riskFightChanceWindow(null, vengeance).received[1], vengeanceLethal / 1681);
  near(riskFightChanceWindow(null, { ...vengeance, events: [{ kind: "spotanim", actorId: "local-player", tick: 0,
    artifactUrl: "render/spotanims/vengeance_cast.glb" }] }).received[1], 0);
  const recoilActors = actors(4);
  recoilActors["local-player"].recoilCharges = 40;
  recoilActors["local-player"].equipment = { ring: { itemId: 2550 } };
  near(riskFightChanceWindow(null, { tick: 0, actors: recoilActors, events: [hit("recoil-trigger", 0, 40, 1, "opponent")] }).received[1], 10 / 41);
  const equipRecoil = { kind: "chance-ring", tick: 0, actorId: "local-player", equipped: true };
  recoilActors["local-player"].recoilCharges = 0;
  recoilActors["local-player"].recoilRingsRemaining = 1;
  recoilActors["local-player"].equipment = {};
  near(riskFightChanceWindow(null, { tick: 0, actors: recoilActors, events: [equipRecoil, hit("spare", 0, 40, 1, "opponent")] }).received[1], 10 / 41);
  recoilActors["local-player"].recoilRingsRemaining = 0;
  near(riskFightChanceWindow(null, { tick: 0, actors: recoilActors, events: [equipRecoil, hit("no-spare", 0, 40, 1, "opponent")] }).received[1], 0);
  recoilActors["local-player"].recoilCharges = 1;
  recoilActors["local-player"].recoilRingsRemaining = 1;
  near(riskFightChanceWindow(null, { tick: 0, actors: recoilActors, events: [equipRecoil, hit("intact", 0, 40, 1, "opponent")] }).received[1], 0);

  const maulAttack = { kind: "attack", id: "0-local-player-opponent-granite-maul-special-attack", tick: 0,
    specialAttack: "granite_maul", specialAttackCount: 2 };
  const firstMaul = hit("0-local-player-opponent-granite-maul-spec-0-hit-hitsplat", 0, 40);
  const complete = completeChanceImpacts([maulAttack, firstMaul]);
  assert.equal(complete.filter(event => event.kind === "hitsplat").length, 2);
  near(riskFightChanceWindow(null, tick(0, 60, complete)).received[1], 231 / 1681);
  assert.equal(completeChanceImpacts(complete).length, complete.length);
  // Realized low rolls, overkill, or reflected hitsplats cannot duplicate rolls.
  near(riskFightChanceWindow(null, tick(0, 60, double.map(event => ({ ...event, damage: 0 })))).received[1], 231 / 1681);
  near(riskFightChanceWindow(null, tick(0, 60, [...double, { ...double[0], id: "trigger-vengeance-hitsplat" }])).received[1], 231 / 1681);
  return { doubleMaulAt80: 1 / 1681, doubleMaulAt60: 231 / 1681, adjacentTickAfterMarlin: two.received[1],
    maulThenElderAfterSingleEat: singleEatChance, maulThenElderAfterDoubleEat: doubleEatChance };
}
