import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleCache = new Map();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function loadTsModule(relativePath) {
  return loadAbsoluteModule(path.resolve(projectRoot, relativePath));
}

function loadAbsoluteModule(sourcePath) {
  const resolved = path.normalize(sourcePath);
  const cached = moduleCache.get(resolved);
  if (cached) {
    return cached.exports;
  }

  if (resolved.endsWith(".json")) {
    const module = { exports: JSON.parse(readFileSync(resolved, "utf8")) };
    moduleCache.set(resolved, module);
    return module.exports;
  }

  const source = readFileSync(resolved, "utf8");
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      strict: true,
      jsx: ts.JsxEmit.ReactJSX,
      resolveJsonModule: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true
    },
    fileName: resolved
  }).outputText;

  const module = { exports: {} };
  moduleCache.set(resolved, module);
  const localRequire = (request) => {
    if (request.startsWith(".")) {
      return loadAbsoluteModule(resolveRelativeModule(resolved, request));
    }
    return require(request);
  };
  vm.runInNewContext(
    transpiled,
    { module, exports: module.exports, require: localRequire, console },
    { filename: resolved }
  );
  return module.exports;
}

function resolveRelativeModule(parentPath, request) {
  const requested = path.resolve(path.dirname(parentPath), request);
  const candidates = requested.endsWith(".ts") || requested.endsWith(".json")
    ? [requested]
    : [`${requested}.ts`, `${requested}.tsx`, `${requested}.json`, path.join(requested, "index.ts")];
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // try next candidate
    }
  }
  return candidates[0];
}

const runtimeCombat = loadTsModule("src/sim/runtimePlayerCombat.ts");
const entityLocks = loadTsModule("src/sim/entity/locks.ts");
const spellRequirements = loadTsModule("src/sim/magic/spellRequirements.ts");
const runtimePolicyOpponent = loadTsModule("src/sim/nh/runtime-policy-opponent.ts");
const nhDuel = loadTsModule("src/sim/nh/duel.ts");
const consumables = loadTsModule("src/sim/items/consumables.ts");
const itemActionQueue = loadTsModule("src/sim/engine/itemActionQueue.ts");
const nhLoadouts = loadTsModule("src/sim/nh/loadouts.ts");
const nhPolicyFeatures = loadTsModule("src/sim/nh/policy-features.ts");
const nhPolicyBridge = loadTsModule("src/sim/nh/policy-bridge.ts");
const botPolicy = loadTsModule("src/bot/policy.ts");
const prayers = loadTsModule("src/sim/prayer/prayers.ts");
const kronosCombat = loadTsModule("src/render/kronosCombat.ts");
const playerCombatSource = readKronosServerSource("model/entity/player/PlayerCombat.java");
const configSource = readKronosServerSource("model/inter/utils/Config.java");
const combatSource = readKronosServerSource("model/combat/Combat.java");
const hitSource = readKronosServerSource("model/combat/Hit.java");
const combatUtilsSource = readKronosServerSource("model/combat/CombatUtils.java");
const projectileSource = readKronosServerSource("model/map/Projectile.java");
const graniteMaulSource = readKronosServerSource("model/combat/special/melee/GraniteMaul.java");
const armadylCrossbowSource = readKronosServerSource("model/combat/special/ranged/ArmadylCrossbow.java");
const rangedAmmoSource = readKronosServerSource("model/combat/RangedAmmo.java");
const targetSpellSource = readKronosServerSource("model/skills/magic/spells/TargetSpell.java");
const iceBlitzSource = readKronosServerSource("model/skills/magic/spells/ancient/IceBlitz.java");
const bloodBlitzSource = readKronosServerSource("model/skills/magic/spells/ancient/BloodBlitz.java");
const iceBarrageSource = readKronosServerSource("model/skills/magic/spells/ancient/IceBarrage.java");
const bloodBarrageSource = readKronosServerSource("model/skills/magic/spells/ancient/BloodBarrage.java");
const bloodSpellSource = readKronosServerSource("model/skills/magic/spells/ancient/BloodSpell.java");
const spellbookCastableScriptSource = readKronosScriptSource("script2614.cs2");
const spellbookLevelFilterScriptSource = readKronosScriptSource("script2619.cs2");
const nhStakerBotSource = readKronosServerSource("model/entity/player/ai/scripts/NhStakerBot.java");
const nhStakerLoadoutSource = readKronosServerSource("model/entity/player/ai/NhStakerLoadout.java");
const walkHandlerSource = readKronosServerSource("network/incoming/handlers/WalkHandler.java");
const playerSource = readKronosServerSource("model/entity/player/Player.java");
const coreWorkerSource = readKronosServerSource("process/CoreWorker.java");
const entitySource = readKronosServerSource("model/entity/Entity.java");
const positionSource = readKronosServerSource("model/map/Position.java");
const targetRouteSource = readKronosServerSource("model/map/route/routes/TargetRoute.java");
const tabInventorySource = readKronosServerSource("model/inter/handlers/TabInventory.java");
const equipmentSource = readKronosServerSource("model/item/containers/Equipment.java");
const consumableSource = readKronosServerSource("model/item/actions/impl/Consumable.java");
const tickDelaySource = readKronosServerSource("utility/TickDelay.java");
const tabCombatSource = readKronosServerSource("model/inter/handlers/TabCombat.java");
const weaponTypeLoaderSource = readKronosServerSource("data/impl/items/weapon_types.java");
const clientActorMovementSource = readKronosClientSource("class329.java");
const clientActorSource = readKronosClientSource("Actor.java");
const clientPlayerSource = readKronosClientSource("Player.java");
const specbarRedrawSource = readKronosClientScriptSource("SpecbarRedraw.rs2asm");
const combatInterfaceSpecialSource = readKronosClientScriptSource("CombatInterfaceSP.rs2asm");
const weaponTypes = JSON.parse(readFileSync(path.join(projectRoot, "fixtures", "assets", "defs", "weapon-types.json"), "utf8"));
const appSource = readFileSync(path.join(projectRoot, "src", "ui", "App.tsx"), "utf8");
const viewerSource = readFileSync(path.join(projectRoot, "src", "ui", "RuntimeSceneViewer.tsx"), "utf8");
const hudSource = readFileSync(path.join(projectRoot, "src", "ui", "KronosClientHud.tsx"), "utf8");
const runtimeCombatSource = readFileSync(path.join(projectRoot, "src", "sim", "runtimePlayerCombat.ts"), "utf8");
const consumablesSource = readFileSync(path.join(projectRoot, "src", "sim", "items", "consumables.ts"), "utf8");
const magicRequirementsSource = readFileSync(path.join(projectRoot, "src", "sim", "magic", "spellRequirements.ts"), "utf8");
const runtimePolicyOpponentSource = readFileSync(path.join(projectRoot, "src", "sim", "nh", "runtime-policy-opponent.ts"), "utf8");
const nhPolicyFeaturesSource = readFileSync(path.join(projectRoot, "src", "sim", "nh", "policy-features.ts"), "utf8");
const nhDuelSource = readFileSync(path.join(projectRoot, "src", "sim", "nh", "duel.ts"), "utf8");

function readKronosServerSource(relativePath) {
  return readFileSync(
    path.resolve(
      projectRoot,
      "..",
      "kronos-osrs-184-master",
      "kronos-osrs-184-master",
      "Kronos-master",
      "kronos-server",
      "src",
      "main",
      "java",
      "io",
      "ruin",
      ...relativePath.split("/")
    ),
    "utf8"
  );
}

function readKronosClientSource(relativePath) {
  return readFileSync(
    path.resolve(
      projectRoot,
      "..",
      "Kronos184-Client",
      "runelite-client",
      "src",
      "main",
      "java",
      "net",
      "runelite",
      "standalone",
      ...relativePath.split("/")
    ),
    "utf8"
  );
}

function readKronosClientScriptSource(relativePath) {
  return readFileSync(
    path.resolve(projectRoot, "..", "Kronos184-Client", "runelite-client", "src", "main", "scripts", relativePath),
    "utf8"
  );
}

function readKronosScriptSource(relativePath) {
  return readFileSync(
    path.resolve(
      projectRoot,
      "..",
      "kronos-osrs-184-master",
      "kronos-osrs-184-master",
      "Kronos-master",
      "scripts",
      relativePath
    ),
    "utf8"
  );
}

function createState(seed = 1, overrides = {}) {
  return runtimeCombat.createRuntimePlayerCombatState({
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "acb-hides",
    opponentLoadoutId: "kodai-robes",
    combatStartTick: 0,
    seed,
    ...overrides
  });
}

function combatLevels(overrides = {}) {
  return {
    ...runtimeCombat.runtimePlayerCombatDefaultLevels,
    ...overrides
  };
}

function requestLocalAttack(state) {
  return runtimeCombat.requestRuntimePlayerCombatAttack(state, "local-player", "opponent");
}

function requestLocalSpell(state, spellId = "ice-barrage") {
  return runtimeCombat.requestRuntimePlayerCombatSpell(state, "local-player", "opponent", spellId);
}

function requestOpponentAttack(state) {
  return runtimeCombat.requestRuntimePlayerCombatAttack(state, "opponent", "local-player");
}

function advance(state, tiles = {}) {
  return runtimeCombat.advanceRuntimePlayerCombat(state, {
    tiles: {
      "local-player": tiles.local ?? state.actors["local-player"].tile,
      opponent: tiles.opponent ?? state.actors.opponent.tile
    }
  });
}

function freezeActor(state, actorId, untilTick, sourceId = undefined) {
  return {
    ...state,
    actors: {
      ...state.actors,
      [actorId]: {
        ...state.actors[actorId],
        locks: {
          ...state.actors[actorId].locks,
          freezeUntilTick: untilTick,
          ...(sourceId === undefined ? {} : { freezeSourceId: sourceId })
        }
      }
    }
  };
}

function freezeBothActors(state, untilTick) {
  return freezeActor(freezeActor(state, "local-player", untilTick), "opponent", untilTick);
}

function attackEventTicksFor(loadoutId, cooldownTicks, tiles, options = {}) {
  let state = createState(31 + cooldownTicks, {
    localTile: tiles.local,
    opponentTile: tiles.opponent,
    localLoadoutId: loadoutId,
    localAttackSetIndex: options.attackSetIndex ?? 0
  });
  state = options.spellId ? requestLocalSpell(state, options.spellId) : requestLocalAttack(state);
  for (let index = 0; index <= cooldownTicks; index += 1) {
    state = advance(state).state;
  }
  return state.events
    .filter((event) => event.kind === "attack" && event.attackerId === "local-player")
    .map((event) => event.tick);
}

function damageFromState(seed, opponentPrayers = []) {
  let state = createState(seed, { opponentPrayers });
  state = requestLocalAttack(state);
  let result = advance(state);
  state = result.state;
  for (let index = 0; index < 3; index += 1) {
    result = advance(state);
    state = result.state;
  }
  return state.events.find((event) => event.kind === "hitsplat")?.damage ?? 0;
}

function assertAttackAnimationWindow(result, actorId, label) {
  const actor = result.state.actors[actorId];
  const attack = result.state.events.find((event) => event.kind === "attack" && event.attackerId === actorId);
  const hit = result.state.queuedHits.find((candidate) => candidate.attackerId === actorId);
  assert(attack, `${label} should create an attack event before any queued hit can resolve`);
  assert(
    actor.actionSequenceName === attack.sequenceName &&
      actor.actionStartedAtTick === attack.tick &&
      Number.isFinite(actor.actionStartedAtClientCycle) &&
      actor.actionUntilTick > attack.tick,
    `${label} should start a visible action animation window with the queued attack: ${JSON.stringify({ actor, attack, hit })}`
  );
  if (hit) {
    assert(
      actor.actionUntilTick >= hit.dueTick,
      `${label} action window should cover the queued hit timing boundary so hits cannot land detached from the attack animation: ${JSON.stringify({ actor, attack, hit })}`
    );
  }
}

assert(playerCombatSource.includes("TargetRoute.set(player, target"), "Kronos PlayerCombat should route to attack targets before attacking");
assert(playerCombatSource.includes("updateLastAttack(weaponType.attackTicks)"), "Kronos PlayerCombat melee attacks should update weapon cooldown ticks");
assert(playerCombatSource.includes("attackTicks = type == AttackType.RAPID_RANGED ? weaponType.attackTicks - 1 : weaponType.attackTicks"), "Kronos ranged attacks should reduce weapon ticks for rapid ranged attack type");
assert(playerCombatSource.includes("target.hit(new Hit(player, style, type)"), "Kronos PlayerCombat should apply melee hits through target.hit");
assert(
  playerCombatSource.includes("public void toggleSpecial()") &&
    playerCombatSource.includes("queueGraniteMaulSpecial()") &&
    playerCombatSource.includes("specialActive = wepDef.special") &&
    playerCombatSource.includes("Config.SPECIAL_ACTIVE.set(player, 1)"),
  "Kronos PlayerCombat.toggleSpecial should activate regular specials and queue Granite maul clicks"
);
assert(
  playerCombatSource.includes("if(amount > energy / 10)") &&
    playerCombatSource.includes("Config.SPECIAL_ENERGY.set(player, energy - (amount * 10))") &&
    playerCombatSource.includes("specialActive = null"),
  "Kronos PlayerCombat.handleSpecial should clear active state and drain varp-300 special energy"
);
assert(
  playerCombatSource.includes("graniteMaulTimeoutTicks = 5") &&
    playerCombatSource.includes("graniteMaulTimeoutTicks == 4") &&
    playerCombatSource.includes("graniteMaulSpecials = Math.min(graniteMaulSpecials, energy / 500)") &&
    playerCombatSource.includes("Config.SPECIAL_ENERGY.set(player, energy)"),
  "Kronos Granite maul queue should auto-attack after one tick, timeout after five ticks, and drain 50 percent per consumed spec"
);
assert(
  configSource.includes("ATTACK_SET = varp(43") &&
    configSource.includes("AUTO_RETALIATE = varp(172") &&
    configSource.includes("WEAPON_TYPE = varpbit(357") &&
    configSource.includes("SPECIAL_ENERGY = varp(300, true).defaultValue(1000)") &&
    configSource.includes("SPECIAL_ACTIVE = varp(301") &&
    configSource.includes("SPECIAL_ORB_STATE = varpbit(8121"),
  "Kronos combat tab config ids should still match the trainer HUD varp/varpbit mapping"
);
assert(combatSource.includes("lastAttackTickDelay + attackDelayTicks"), "Kronos Combat attack delay should combine weapon and additive delays");
assert(hitSource.includes("PVP_MAGIC_ACCURACY_MODIFIER = 1.22"), "Kronos Hit should apply the PvP magic accuracy modifier");
assert(hitSource.includes("PVP_MELEE_ACCURACY_MODIFIER = 1.12"), "Kronos Hit should apply the PvP melee accuracy modifier");
assert(hitSource.includes("return clientDelay(delay, 16)"), "Kronos Hit default clientDelay should use the 16ms cycle-rate bridge");
assert(
  playerCombatSource.includes("private void postDefend(Hit hit)") &&
    playerCombatSource.includes("hit.damage *= 0.60") &&
    hitSource.includes("target.hitListener.postDefend.accept(this)") &&
    combatUtilsSource.includes("addXp(Player player, Entity victim, AttackStyle attackStyle, AttackType attackType, int damageDealt)"),
  "Kronos should finalize protection-reduced PvP Hit.damage before XP is awarded and before the queued hit later finishes"
);
assert(combatUtilsSource.includes("MAGIC_CALC_SLOTS") && combatUtilsSource.includes("interferenceCount * 0.45"), "Kronos magic accuracy should apply chest/legs interference");
assert(projectileSource.includes("return delay + duration"), "Kronos Projectile.send should return delay plus duration for hit timing");
assert(
  projectileSource.includes("BOLT = new Projectile(27, 38, 36, 41, 51, 5, 5, 11)") &&
    projectileSource.includes("DRAGON_BOLT = new Projectile(1468, 38, 36, 41, 51, 5, 5, 11)"),
  "Kronos projectile source should distinguish standard and dragon bolt projectile payloads"
);
assert(
  rangedAmmoSource.includes("DRAGON_DRAGONSTONE_BOLTS(new RangedData(Projectile.DRAGON_BOLT)") &&
    rangedAmmoSource.includes("DRAGON_BOLTS(new RangedData(Projectile.DRAGON_BOLT)"),
  "Kronos dragon-bolt ammo should use Projectile.DRAGON_BOLT instead of the standard bolt gfx"
);
assert(
  armadylCrossbowSource.includes("new Projectile(301, 38, 36, 41, 51, 5, 5, 11)") &&
    armadylCrossbowSource.includes(".boostAttack(1.0)") &&
    armadylCrossbowSource.includes("return 40"),
  "Kronos Armadyl crossbow special should use projectile 301, double accuracy, and 40 percent drain"
);
assert(
  graniteMaulSource.includes("player.animate(1667)") &&
    graniteMaulSource.includes("player.graphics(340, 96, 0)") &&
    graniteMaulSource.includes("target.hit(new Hit(player, attackStyle, attackType).randDamage(maxDamage))") &&
    graniteMaulSource.includes("return 50"),
  "Kronos Granite maul special should use animation 1667, graphics 340, immediate hit, and 50 percent drain"
);
assert(
  specbarRedrawSource.includes("get_varp               301") &&
    specbarRedrawSource.includes("iconst                 16776960") &&
    specbarRedrawSource.includes("get_varp               300") &&
    specbarRedrawSource.includes("Special Attack: ") &&
    specbarRedrawSource.includes("iconst                 12907") &&
    combatInterfaceSpecialSource.includes("iconst                 301") &&
    combatInterfaceSpecialSource.includes("iconst                 300"),
  "Kronos client special bar script should still be varp-301 active color plus varp-300 energy text/fill"
);
assert(
  weaponTypes.ARMADYL_CROSSBOW?.config === 5 &&
    weaponTypes.ARMADYL_CROSSBOW?.attackTicks === 6 &&
    weaponTypes.ARMADYL_CROSSBOW?.attackSets?.[1]?.type === "RAPID_RANGED" &&
    weaponTypes.GRANITE_MAUL?.config === 2 &&
    weaponTypes.GRANITE_MAUL?.attackTicks === 7 &&
    weaponTypes.GRANITE_MAUL?.attackAnimation === 1665,
  "exported Kronos WeaponType definitions should keep ACB and Granite maul config/tick/animation data"
);
assert(
  weaponTypeLoaderSource.includes("orderedSets[set.child / 4] = set") &&
    readFileSync(path.join(projectRoot, "src", "render", "kronosCombat.ts"), "utf8").includes("const index = Math.trunc(child / 4)") &&
    readFileSync(path.join(projectRoot, "src", "render", "kronosCombat.ts"), "utf8").includes("orderedSets[index] = { child, type: record.type, style: record.style }"),
  "trainer WeaponType store should mirror Kronos weapon_types loader and place attack sets by child / 4."
);
const weaponTypeStore = kronosCombat.createKronosWeaponTypeDefinitionStore(weaponTypes);
const wandType = weaponTypeStore.get("WAND");
assert(
  wandType?.config === 18 &&
    wandType.attackSets[0]?.child === 3 &&
    wandType.attackSets[1]?.child === 7 &&
    wandType.attackSets[2] === null &&
    wandType.attackSets[3]?.child === 15,
  "Kodai/WAND attack sets should be sparse like Kronos config 18: Bash, Pound, no child 12, Focus."
);
assert(
  clientActorSource.includes("this.hitSplatCycles[var9] = var5 + var11 + var6") &&
    clientActorSource.includes("if(var13.definition.field3296 == var8.field3296)") &&
    clientActorSource.includes("var13.method2246(var2 + var4, var5, var6, var3);"),
  "Kronos client Actor should keep per-instance hitsplat cycles and one updated health bar per matching definition"
);
assert(targetSpellSource.includes(".clientDelay(projectileDuration, 19)"), "Kronos target spells should use the magic projectile cycle-rate bridge");
assert(targetSpellSource.includes('getStats().check(StatType.Magic, lvlReq, "cast this spell")'), "Kronos TargetSpell.cast should gate primary casts on current Magic level");
assert(
  playerCombatSource.includes("if(!spell.cast(player, target))") &&
    playerCombatSource.includes("reset();") &&
    playerCombatSource.includes("updateLastAttack(5)"),
  "Kronos PlayerCombat.attackWithMagic should reset failed spell casts before applying the five-tick spell cooldown"
);
assert(bloodBarrageSource.includes("setLvlReq(92)"), "Kronos Blood Barrage source should require Magic level 92");
assert(iceBarrageSource.includes("setLvlReq(94)"), "Kronos Ice Barrage source should require Magic level 94");
assert(bloodBlitzSource.includes("setLvlReq(80)"), "Kronos Blood Blitz source should require Magic level 80");
assert(iceBlitzSource.includes("setLvlReq(82)"), "Kronos Ice Blitz source should require Magic level 82");
assert(
  spellbookCastableScriptSource.includes("stat(magic) < oc_param($obj0, spell_levelreq)") &&
    spellbookCastableScriptSource.includes("if_settrans(0, $component1)") &&
    spellbookLevelFilterScriptSource.includes("stat_base(magic) < $int1") &&
    spellbookLevelFilterScriptSource.includes("stat(magic) < $int1"),
  "Kronos spellbook scripts should use current Magic for icon disabled state and base+current Magic for lack-level filtering"
);
assert(
  spellRequirements.kronosMagicSpellLevelRequirement("blood-blitz") === 80 &&
    spellRequirements.kronosMagicSpellLevelRequirement("ice-blitz") === 82 &&
    spellRequirements.kronosMagicSpellLevelRequirement("blood-barrage") === 92 &&
    spellRequirements.kronosMagicSpellLevelRequirement("ice-barrage") === 94 &&
    spellRequirements.kronosMagicSpellCurrentLevelCanCast("ice-barrage", 93) === false &&
    spellRequirements.kronosMagicSpellLevelFilterAllows("ice-barrage", 93, 99) === true,
  "trainer spell requirement helper should preserve Kronos current-level cast gating and script2619 filtering distinction"
);
assert(
  hudSource.includes("kronosMagicSpellCurrentLevelCanCast") &&
    hudSource.includes("data-current-magic-level") &&
    hudSource.includes("data-magic-level-can-cast") &&
    hudSource.includes("data-source-castable-state"),
  "trainer spellbook icon layer should expose Kronos current Magic disabled-sprite state for verifier-visible UI parity"
);
assert(
  runtimeCombatSource.includes("requiredMagicLevel: kronosMagicSpellLevelRequirementById[\"blood-blitz\"]") &&
    runtimeCombatSource.includes("requiredMagicLevel: kronosMagicSpellLevelRequirementById[\"ice-blitz\"]") &&
    runtimeCombatSource.includes("requiredMagicLevel: kronosMagicSpellLevelRequirementById[\"blood-barrage\"]") &&
    runtimeCombatSource.includes("requiredMagicLevel: kronosMagicSpellLevelRequirementById[\"ice-barrage\"]") &&
    magicRequirementsSource.includes("TargetSpell.cast") &&
    magicRequirementsSource.includes("script2619") &&
    magicRequirementsSource.includes("You need Magic level of") &&
    runtimeCombatSource.includes("resetRuntimePlayerCombatFailedSpellCast") &&
    !runtimeCombatSource.includes('readonly kind: "message"'),
  "trainer spell combat definitions should carry Kronos magic level requirements without adding chat/message events to the render combat stream"
);
assert(iceBarrageSource.includes("setMaxDamage(30)"), "Kronos Ice Barrage source should keep base max damage at 30");
assert(bloodBlitzSource.includes("setMaxDamage(25)"), "Kronos Blood Blitz source should keep base max damage at 25");
assert(iceBlitzSource.includes("setMaxDamage(26)"), "Kronos Ice Blitz source should keep base max damage at 26");
assert(
  bloodBlitzSource.includes("setAnimationId(1978)") &&
    bloodBlitzSource.includes("setProjectile(new Projectile(374, 43, 0, 51, 56, 10, 16, 64))") &&
    iceBlitzSource.includes("setAnimationId(1978)") &&
    iceBlitzSource.includes("setCastGfx(366, 124, 0)") &&
    iceBlitzSource.includes("setProjectile(new Projectile(56, 10))") &&
    iceBlitzSource.includes("hold(hit, target, 15, true)"),
  "Kronos Blitz sources should preserve animation 1978, Blood Blitz projectile 374, Ice Blitz cast gfx 366, and 15-second freeze"
);
assert(
  bloodSpellSource.includes("int healAmount = hit.damage / 4") &&
    bloodSpellSource.includes("hasId(22647)") &&
    bloodSpellSource.includes("hit.attacker.incrementHp(healAmount)"),
  "Kronos BloodSpell should heal on afterHit using integer damage / 4 and the Zuriel's staff multiplier"
);
assert(
  playerSource.includes("if(++specialRestoreTicks >= 50)") &&
    playerSource.includes("combat.restoreSpecial(10)") &&
    playerCombatSource.includes("int newEnergy = Math.min(1000, energy + (percent * 10))"),
  "Kronos Player.tick should restore 10 percent special energy every 50 ticks after combat.attack"
);
assert(
  runtimeCombatSource.includes("tickRuntimePlayerCombatSpecialRestore") &&
    runtimeCombatSource.includes("runtimePlayerCombatSpecialRestorePeriodTicks = 50") &&
    runtimeCombatSource.includes("Player.tick() increments specialRestoreTicks after combat.attack()"),
  "trainer runtime should port Kronos post-attack special regeneration timing"
);
assert(
  playerCombatSource.includes("public TargetSpell queuedSpell, autocastSpell") &&
    playerCombatSource.includes("if(queuedSpell == null)") &&
    playerCombatSource.includes("spell = autocastSpell") &&
    playerCombatSource.includes("spell = queuedSpell") &&
    playerCombatSource.includes("if(!autocast)") &&
    playerCombatSource.includes("reset();"),
  "Kronos PlayerCombat should keep selected spells one-shot and autocast spells persistent"
);
assert(
  runtimeCombatSource.includes("runtimeBotDefaultAutocastSpell") &&
    runtimeCombatSource.includes("actorId === \"local-player\"") &&
    runtimeCombatSource.includes("actor.loadoutId !== \"kodai-robes\"") &&
    runtimeCombatSource.includes("runtimePlayerCombatSpellDefinitions[\"ice-barrage\"]"),
  "trainer runtime should keep Kodai default autocast as a bot-only fallback while local/player Kodai remains normal unless selected/autocast"
);
assert(
  runtimeCombatSource.includes("export function syncRuntimePlayerCombatStateToInput") &&
    viewerSource.includes("syncRuntimePlayerCombatStateToInput(manualCombatStateRef.current") &&
    viewerSource.includes("opponent: manualOpponentRef.current.loadoutId"),
  "manual combat commands should sync combat-state loadouts from the visible actors before queuing player/opponent attacks"
);
assert(walkHandlerSource.includes("player.resetActions(true, true, true)"), "Kronos WalkHandler should reset movement and combat before routing walk packets");
assert(
  playerSource.includes("if(resetCombat && combat.getTarget() != null)") &&
    playerSource.includes("combat.reset()"),
  "Kronos Player.resetActions should clear combat target when resetCombat is true"
);
assert(
    tabInventorySource.includes("player.getEquipment().equip(item)") &&
    tabInventorySource.includes("player.resetActions(false, player.getMovement().following != null, true)") &&
    viewerSource.includes("inventoryEquipResetActions") &&
    viewerSource.includes('resetRuntimePlayerCombatActorTarget(nextCombatState, "local-player")') &&
    viewerSource.includes("TabInventory.click -> Equipment.equip(item); player.resetActions(false, following != null, true)"),
  "trainer inventory equip should port Kronos TabInventory resetActions(..., resetCombat=true) so gear switches stop the current attack target."
);
assert(
  equipmentSource.includes("if(updatedSlots[SLOT_WEAPON])") &&
    equipmentSource.includes("player.getCombat().updateWeapon(false)") &&
    equipmentSource.includes("// player.resetAnimation();") &&
    playerCombatSource.includes("int setIndex = Config.ATTACK_SET.get(player)") &&
    playerCombatSource.includes("Config.ATTACK_SET.set(player, resolvedIndex)") &&
    playerCombatSource.includes("for(int i = index; i >= 0; i--)") &&
    tabCombatSource.includes("public static void updateAutocast(Player player, boolean login)") &&
    tabCombatSource.includes("resetAutocast(player)") &&
    runtimeCombatSource.includes("weaponSlotChanged") &&
    runtimeCombatSource.includes("resolveRuntimePlayerCombatAttackSetIndexForWeapon") &&
    runtimeCombatSource.includes("autocastSpellId: respawning || loadoutChanged || weaponSlotChanged ? null : actor.autocastSpellId") &&
    runtimeCombatSource.includes("defensiveCast: respawning || loadoutChanged || weaponSlotChanged ? false : actor.defensiveCast") &&
    runtimeCombatSource.includes("const actionStillActive = !respawning && actor.actionSequenceName !== null && tick < actor.actionUntilTick"),
  "trainer weapon-slot sync should port Kronos Equipment.sendUpdates -> updateWeapon(false), persistent Config.ATTACK_SET resolution, and autocast clearing without resetting the active attack animation."
);
assert(
  playerCombatSource.includes("player.faceNone(!isDead())") &&
    playerCombatSource.includes("TargetRoute.reset(player)"),
  "Kronos PlayerCombat.reset should clear target-facing and target routes"
);
assert(
  targetRouteSource.includes("entity.getCombat().reset()"),
  "Kronos TargetRoute should reset combat when target routing fails"
);
assert(
  viewerSource.includes("resetRuntimePlayerCombatActorTarget(manualCombatStateRef.current, request.actorId)") &&
    viewerSource.includes("frozen melee step-in attempt must not"),
  "trainer route-block handling should mirror TargetRoute failure by clearing stale combat targets when freeze blocks step-in melee"
);
assert(
  playerSource.includes("combat.preAttack();") &&
    playerSource.includes("TargetRoute.beforeMovement(this);") &&
    playerSource.includes("movement.process();") &&
    playerSource.includes("TargetRoute.afterMovement(this);") &&
    playerSource.includes("combat.attack();") &&
    runtimeCombatSource.includes("runtimePlayerCombatTargetRouteProfile") &&
    runtimeCombatSource.includes("targetRouteMovementConsumed") &&
    viewerSource.includes("preAttackRouteManualActorToCombatTarget") &&
    viewerSource.includes("TargetRoute.beforeMovement(), movement.process()") &&
    viewerSource.includes("advanceManualActorServerRouteTick(routed.actor)") &&
    viewerSource.includes("targetRouteMovementConsumed: {"),
  "manual melee target routing should port Kronos preAttack/TargetRoute/movement ordering before the attack gate"
);
assert(
  coreWorkerSource.includes("players.scramble()") &&
    coreWorkerSource.includes("Random.get(40, 60)") &&
    runtimeCombatSource.includes("processOrder") &&
    runtimeCombatSource.includes("nextProcessOrderShuffleTick") &&
    runtimeCombatSource.includes("runtimePlayerCombatProcessOrderStateForTick") &&
    runtimeCombatSource.includes("for (const actorId of processOrderState.processOrder)") &&
    runtimeCombatSource.includes("preMovementTiles") &&
    runtimeCombatSource.includes("mergeRuntimePlayerCombatAttemptActorsAfterPidMovement"),
  "runtime combat should model Kronos CoreWorker/EntityList player process order, including pre-movement target tiles for earlier-PID attacks"
);
assert(
  playerCombatSource.includes("TargetRoute.set(player, target, useSpell() ? 10") &&
    playerCombatSource.includes("getAttackType() == AttackType.LONG_RANGED ? 2 : 0"),
  "Kronos PlayerCombat.preAttack should give selected/autocast spells a 10-tile TargetRoute and long-ranged weapon attacks +2 tiles"
);
assert(
  targetSpellSource.includes("double percentageBonus = entity.getCombat().getBonus(EquipmentStats.MAGIC_DAMAGE)") &&
    targetSpellSource.includes("maxDamage *= (1D + percentageBonus * 0.01)"),
  "Kronos target spells should apply the visible magic damage equipment percentage after the spell base max"
);

let countdownState = createState(810, {
  combatStartTick: runtimeCombat.runtimePlayerCombatFightCountdownTicks
});
assert(runtimeCombat.runtimePlayerCombatIsFightCountdownActive(countdownState), "pre-fight countdown should start active when combatStartTick is in the future");
assert(runtimeCombat.runtimePlayerCombatFightCountdownLabel(countdownState) === "3", "pre-fight countdown should start at 3");
assert(requestLocalAttack(countdownState).actors["local-player"].targetId === null, "pre-fight countdown should block local attack target requests");
assert(requestOpponentAttack(countdownState).actors.opponent.targetId === null, "pre-fight countdown should block opponent attack target requests");
let countdownAdvance = advance({
  ...countdownState,
  actors: {
    ...countdownState.actors,
    "local-player": {
      ...countdownState.actors["local-player"],
      targetId: "opponent"
    },
    opponent: {
      ...countdownState.actors.opponent,
      targetId: "local-player"
    }
  }
});
assert(
  countdownAdvance.state.queuedHits.length === 0 && countdownAdvance.routeRequests.length === 0,
  "pre-fight countdown should gate both actors' attack processing while still allowing the game tick to advance"
);
let goState = {
  ...countdownState,
  tick: runtimeCombat.runtimePlayerCombatFightCountdownTicks
};
assert(runtimeCombat.runtimePlayerCombatFightCountdownLabel(goState) === "Go", "countdown should show Go on the first combat-open tick");
goState = requestLocalAttack(goState);
const goResult = advance(goState);
assert(
  goResult.state.events.some((event) => event.kind === "attack" && event.attackerId === "local-player"),
  "player attacks should be accepted once the countdown reaches Go"
);

let outOfRange = createState(7, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 12, z: 0 }
});
outOfRange = requestLocalAttack(outOfRange);
const outOfRangeResult = advance(outOfRange);
assert(outOfRangeResult.state.queuedHits.length === 0, "out-of-range ranged attack should not queue a hit");
assert(
  outOfRangeResult.routeRequests.some(
    (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 8
  ),
  "out-of-range player Attack should request route-toward-target movement"
);

let opponentPidFirst = createState(811, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides"
});
opponentPidFirst = {
  ...opponentPidFirst,
  processOrder: ["opponent", "local-player"],
  nextProcessOrderShuffleTick: 999,
  processOrderSeed: 1
};
opponentPidFirst = requestLocalAttack(requestOpponentAttack(opponentPidFirst));
const opponentPidFirstResult = advance(opponentPidFirst);
const opponentPidFirstAttackEvents = opponentPidFirstResult.state.events.filter((event) => event.kind === "attack");
assert(
  opponentPidFirstAttackEvents[0]?.attackerId === "opponent" &&
    opponentPidFirstAttackEvents[1]?.attackerId === "local-player",
  "same-tick attacks should resolve in the current Kronos/PID process order, not fixed local-player first"
);

let opponentPidFreezeCancelsUnderStep = createState(1, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
opponentPidFreezeCancelsUnderStep = freezeActor(opponentPidFreezeCancelsUnderStep, "opponent", 20);
opponentPidFreezeCancelsUnderStep = runtimeCombat.setRuntimePlayerCombatAutocast(
  opponentPidFreezeCancelsUnderStep,
  "opponent",
  "ice-barrage"
);
opponentPidFreezeCancelsUnderStep = {
  ...opponentPidFreezeCancelsUnderStep,
  processOrder: ["opponent", "local-player"],
  nextProcessOrderShuffleTick: 999,
  processOrderSeed: 1
};
opponentPidFreezeCancelsUnderStep = requestOpponentAttack(opponentPidFreezeCancelsUnderStep);
const opponentPidFreezeCancelsUnderStepResult = runtimeCombat.advanceRuntimePlayerCombat(
  opponentPidFreezeCancelsUnderStep,
  {
    preMovementTiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: 1, z: 0 }
    },
    tiles: {
      "local-player": { x: 1, z: 0 },
      opponent: { x: 1, z: 0 }
    },
    projectileLineOfSight: {
      opponent: true
    }
  }
);
assert(
  entityLocks.isFrozen(opponentPidFreezeCancelsUnderStepResult.state.actors["local-player"].locks, opponentPidFreezeCancelsUnderStep.tick),
  "fixture seed should produce a positive Ice Barrage freeze roll"
);
assert(
  opponentPidFreezeCancelsUnderStepResult.state.actors["local-player"].tile.x === 0 &&
    opponentPidFreezeCancelsUnderStepResult.state.actors["local-player"].tile.z === 0,
  "earlier-PID Ice Barrage freeze should reset the later player's queued under-step instead of leaving them frozen under the caster"
);

let localPidUnderStepBlocksLaterFreeze = createState(901, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
localPidUnderStepBlocksLaterFreeze = freezeActor(localPidUnderStepBlocksLaterFreeze, "opponent", 20);
localPidUnderStepBlocksLaterFreeze = runtimeCombat.setRuntimePlayerCombatAutocast(
  localPidUnderStepBlocksLaterFreeze,
  "opponent",
  "ice-barrage"
);
localPidUnderStepBlocksLaterFreeze = {
  ...localPidUnderStepBlocksLaterFreeze,
  processOrder: ["local-player", "opponent"],
  nextProcessOrderShuffleTick: 999,
  processOrderSeed: 1
};
localPidUnderStepBlocksLaterFreeze = requestOpponentAttack(localPidUnderStepBlocksLaterFreeze);
const localPidUnderStepBlocksLaterFreezeResult = runtimeCombat.advanceRuntimePlayerCombat(
  localPidUnderStepBlocksLaterFreeze,
  {
    preMovementTiles: {
      "local-player": { x: 0, z: 0 },
      opponent: { x: 1, z: 0 }
    },
    tiles: {
      "local-player": { x: 1, z: 0 },
      opponent: { x: 1, z: 0 }
    },
    projectileLineOfSight: {
      opponent: true
    }
  }
);
assert(
  localPidUnderStepBlocksLaterFreezeResult.state.queuedHits.length === 0 &&
    !entityLocks.isFrozen(localPidUnderStepBlocksLaterFreezeResult.state.actors["local-player"].locks, localPidUnderStepBlocksLaterFreeze.tick),
  "later-PID frozen caster should not Ice Barrage a target that has already stepped under on its PID turn"
);

let frozenMelee = createState(9, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 1 },
  localLoadoutId: "tentacle-bandos"
});
frozenMelee = {
  ...frozenMelee,
  actors: {
    ...frozenMelee.actors,
    "local-player": {
      ...frozenMelee.actors["local-player"],
      locks: {
        ...frozenMelee.actors["local-player"].locks,
        freezeUntilTick: 10
      }
    }
  }
};
frozenMelee = requestLocalAttack(frozenMelee);
const frozenMeleeResult = advance(frozenMelee);
assert(frozenMeleeResult.state.queuedHits.length === 0, "frozen diagonal melee should not queue a hit");
assert(
  frozenMeleeResult.routeRequests.some(
    (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 1
  ),
  "frozen diagonal melee should request route movement instead of treating diagonal reach as valid"
);

let frozenOpponentSceneTwoTileDiagonalMelee = createState(1015, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 1 },
  opponentLoadoutId: "tentacle-bandos"
});
frozenOpponentSceneTwoTileDiagonalMelee = freezeActor(frozenOpponentSceneTwoTileDiagonalMelee, "opponent", 20);
frozenOpponentSceneTwoTileDiagonalMelee = requestOpponentAttack(frozenOpponentSceneTwoTileDiagonalMelee);
const frozenOpponentSceneTwoTileDiagonalMeleeResult = runtimeCombat.advanceRuntimePlayerCombat(
  frozenOpponentSceneTwoTileDiagonalMelee,
  {
    tiles: {
      "local-player": frozenOpponentSceneTwoTileDiagonalMelee.actors["local-player"].tile,
      opponent: frozenOpponentSceneTwoTileDiagonalMelee.actors.opponent.tile
    },
    tileScale: 0.5
  }
);
assert(
  frozenOpponentSceneTwoTileDiagonalMeleeResult.state.queuedHits.length === 0,
  "manual-scene frozen opponent should not melee from two scene tiles away when both coordinates happen to be integers"
);

let frozenOpponentSceneTwoTileCardinalMelee = createState(1016, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  opponentLoadoutId: "tentacle-bandos"
});
frozenOpponentSceneTwoTileCardinalMelee = freezeActor(frozenOpponentSceneTwoTileCardinalMelee, "opponent", 20);
frozenOpponentSceneTwoTileCardinalMelee = requestOpponentAttack(frozenOpponentSceneTwoTileCardinalMelee);
const frozenOpponentSceneTwoTileCardinalMeleeResult = runtimeCombat.advanceRuntimePlayerCombat(
  frozenOpponentSceneTwoTileCardinalMelee,
  {
    tiles: {
      "local-player": frozenOpponentSceneTwoTileCardinalMelee.actors["local-player"].tile,
      opponent: frozenOpponentSceneTwoTileCardinalMelee.actors.opponent.tile
    },
    tileScale: 0.5
  }
);
assert(
  frozenOpponentSceneTwoTileCardinalMeleeResult.state.queuedHits.length === 0,
  "manual-scene frozen opponent should not melee from a two-tile cardinal gap that was previously inferred as one tile"
);

let frozenLocalSceneTwoTileCardinalMelee = createState(1018, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "tentacle-bandos"
});
frozenLocalSceneTwoTileCardinalMelee = freezeActor(frozenLocalSceneTwoTileCardinalMelee, "local-player", 20);
frozenLocalSceneTwoTileCardinalMelee = requestLocalAttack(frozenLocalSceneTwoTileCardinalMelee);
const frozenLocalSceneTwoTileCardinalMeleeResult = runtimeCombat.advanceRuntimePlayerCombat(
  frozenLocalSceneTwoTileCardinalMelee,
  {
    tiles: {
      "local-player": frozenLocalSceneTwoTileCardinalMelee.actors["local-player"].tile,
      opponent: frozenLocalSceneTwoTileCardinalMelee.actors.opponent.tile
    },
    tileScale: 0.5
  }
);
assert(
  frozenLocalSceneTwoTileCardinalMeleeResult.state.queuedHits.length === 0,
  "manual-scene frozen local player should not melee from a two-tile cardinal step-in gap"
);

let capturedSceneScalePolicyContext = null;
const sceneScalePolicyController = {
  id: "test-scene-scale-policy",
  chooseAction: (context) => {
    capturedSceneScalePolicyContext = context;
    return {
      offenceStyle: "melee",
      defencePrayer: "protect_from_missiles",
      movementIntent: "pressure",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    };
  }
};
const sceneScalePolicyState = createState(1017, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 1 },
  opponentLoadoutId: "tentacle-bandos"
});
runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: sceneScalePolicyState,
  controller: sceneScalePolicyController,
  localActor: {
    tile: sceneScalePolicyState.actors["local-player"].tile,
    loadoutId: sceneScalePolicyState.actors["local-player"].loadoutId
  },
  opponentActor: {
    tile: sceneScalePolicyState.actors.opponent.tile,
    loadoutId: sceneScalePolicyState.actors.opponent.loadoutId
  },
  tileScale: 0.5
});
assert(
  capturedSceneScalePolicyContext?.meleeReachable === false,
  "manual-scene policy context should read a 1.0 world-unit diagonal gap as two OSRS tiles, not one diagonal melee step"
);

let frozenUnderMelee = createState(10, {
  localTile: { x: 1, z: 1 },
  opponentTile: { x: 1, z: 1 },
  localLoadoutId: "tentacle-bandos"
});
frozenUnderMelee = {
  ...frozenUnderMelee,
  actors: {
    ...frozenUnderMelee.actors,
    "local-player": {
      ...frozenUnderMelee.actors["local-player"],
      locks: {
        ...frozenUnderMelee.actors["local-player"].locks,
        freezeUntilTick: 11
      }
    }
  }
};
frozenUnderMelee = requestLocalAttack(frozenUnderMelee);
const frozenUnderMeleeResult = advance(frozenUnderMelee);
assert(frozenUnderMeleeResult.state.queuedHits.length === 0, "frozen same-tile melee should not queue a hit from underneath the target");

let frozenBothMagicTenTiles = createState(1010, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 10, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "kodai-robes"
});
frozenBothMagicTenTiles = freezeBothActors(frozenBothMagicTenTiles, 20);
frozenBothMagicTenTiles = requestLocalSpell(frozenBothMagicTenTiles);
const frozenBothMagicTenTilesResult = advance(frozenBothMagicTenTiles);
const frozenBothMagicTenTilesEvent = frozenBothMagicTenTilesResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "local-player"
);
assert(
  frozenBothMagicTenTilesResult.state.queuedHits.length === 1 &&
    frozenBothMagicTenTilesEvent?.style === "magic" &&
    frozenBothMagicTenTilesEvent.spellId === "ice-barrage" &&
    frozenBothMagicTenTilesResult.routeRequests.length === 0,
  `both-frozen selected Ice Barrage should fire at Kronos' 10-tile spell TargetRoute distance without requiring movement: ${JSON.stringify({
    queuedHits: frozenBothMagicTenTilesResult.state.queuedHits,
    routeRequests: frozenBothMagicTenTilesResult.routeRequests,
    event: frozenBothMagicTenTilesEvent
  })}`
);

let frozenBothMagicTwoTiles = createState(1013, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 2, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "kodai-robes"
});
frozenBothMagicTwoTiles = freezeBothActors(frozenBothMagicTwoTiles, 20);
frozenBothMagicTwoTiles = requestLocalSpell(frozenBothMagicTwoTiles);
const frozenBothMagicTwoTilesResult = advance(frozenBothMagicTwoTiles);
const frozenBothMagicTwoTilesEvent = frozenBothMagicTwoTilesResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "local-player"
);
assert(
  frozenBothMagicTwoTilesResult.state.queuedHits.length === 1 &&
    frozenBothMagicTwoTilesEvent?.style === "magic" &&
    frozenBothMagicTwoTilesEvent.spellId === "ice-barrage" &&
    frozenBothMagicTwoTilesResult.routeRequests.length === 0,
  `both-frozen selected Ice Barrage should fire at two tiles without being blocked by freeze routing: ${JSON.stringify({
    queuedHits: frozenBothMagicTwoTilesResult.state.queuedHits,
    routeRequests: frozenBothMagicTwoTilesResult.routeRequests,
    event: frozenBothMagicTwoTilesEvent
  })}`
);

let frozenBothRangeTwoTilesAccurate = createState(1014, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 2, z: 0 },
  localLoadoutId: "acb-hides",
  localAttackSetIndex: 0
});
frozenBothRangeTwoTilesAccurate = freezeBothActors(frozenBothRangeTwoTilesAccurate, 20);
frozenBothRangeTwoTilesAccurate = requestLocalAttack(frozenBothRangeTwoTilesAccurate);
const frozenBothRangeTwoTilesAccurateResult = advance(frozenBothRangeTwoTilesAccurate);
const frozenBothRangeTwoTilesAccurateEvent = frozenBothRangeTwoTilesAccurateResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "local-player"
);
assert(
  frozenBothRangeTwoTilesAccurateResult.state.queuedHits.length === 1 &&
    frozenBothRangeTwoTilesAccurateEvent?.style === "ranged" &&
    frozenBothRangeTwoTilesAccurateResult.routeRequests.length === 0,
  `both-frozen accurate ACB should fire at two tiles without being blocked by freeze routing: ${JSON.stringify({
    queuedHits: frozenBothRangeTwoTilesAccurateResult.state.queuedHits,
    routeRequests: frozenBothRangeTwoTilesAccurateResult.routeRequests,
    event: frozenBothRangeTwoTilesAccurateEvent
  })}`
);

let frozenBothRangeNineTilesAccurate = createState(1011, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 9, z: 0 },
  localLoadoutId: "acb-hides",
  localAttackSetIndex: 0
});
frozenBothRangeNineTilesAccurate = freezeBothActors(frozenBothRangeNineTilesAccurate, 20);
frozenBothRangeNineTilesAccurate = requestLocalAttack(frozenBothRangeNineTilesAccurate);
const frozenBothRangeNineTilesAccurateResult = advance(frozenBothRangeNineTilesAccurate);
assert(
  frozenBothRangeNineTilesAccurateResult.state.queuedHits.length === 0 &&
    frozenBothRangeNineTilesAccurateResult.routeRequests.some(
      (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 8
    ),
  "both-frozen accurate ACB should still respect the Kronos 8-tile weapon range and request movement when one tile too far"
);

let frozenBothRangeTenTilesLongrange = createState(1012, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 10, z: 0 },
  localLoadoutId: "acb-hides",
  localAttackSetIndex: 3
});
frozenBothRangeTenTilesLongrange = freezeBothActors(frozenBothRangeTenTilesLongrange, 20);
frozenBothRangeTenTilesLongrange = requestLocalAttack(frozenBothRangeTenTilesLongrange);
const frozenBothRangeTenTilesLongrangeResult = advance(frozenBothRangeTenTilesLongrange);
const frozenBothRangeTenTilesLongrangeEvent = frozenBothRangeTenTilesLongrangeResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "local-player"
);
assert(
  frozenBothRangeTenTilesLongrangeResult.state.queuedHits.length === 1 &&
    frozenBothRangeTenTilesLongrangeEvent?.style === "ranged" &&
    frozenBothRangeTenTilesLongrangeResult.state.queuedHits[0]?.attackType === "LONG_RANGED" &&
    frozenBothRangeTenTilesLongrangeResult.routeRequests.length === 0,
  `both-frozen longrange ACB should fire through Kronos' +2 long-ranged TargetRoute distance without movement: ${JSON.stringify({
    queuedHits: frozenBothRangeTenTilesLongrangeResult.state.queuedHits,
    routeRequests: frozenBothRangeTenTilesLongrangeResult.routeRequests,
    event: frozenBothRangeTenTilesLongrangeEvent
  })}`
);

let cooldownMeleeStep = createState(10, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 1 },
  localLoadoutId: "tentacle-bandos"
});
cooldownMeleeStep = {
  ...cooldownMeleeStep,
  actors: {
    ...cooldownMeleeStep.actors,
    "local-player": {
      ...cooldownMeleeStep.actors["local-player"],
      attackTimer: {
        ...cooldownMeleeStep.actors["local-player"].attackTimer,
        lastAttackTick: cooldownMeleeStep.tick,
        weaponCooldownTicks: 4
      }
    }
  }
};
cooldownMeleeStep = requestLocalAttack(cooldownMeleeStep);
const cooldownMeleeStepResult = advance(cooldownMeleeStep);
assert(cooldownMeleeStepResult.state.queuedHits.length === 0, "cooldown melee step-in should not queue a hit before the attack timer is ready");
assert(
  cooldownMeleeStepResult.routeRequests.some(
    (request) => request.actorId === "local-player" && request.reason === "timer" && request.attackRange === 1
  ),
  "cooldown melee step-in should still set the target route before the swing is ready"
);

let meleeStep = createState(11, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 1 },
  localLoadoutId: "tentacle-bandos"
});
meleeStep = requestLocalAttack(meleeStep);
const meleeStepResult = advance(meleeStep);
assert(meleeStepResult.state.queuedHits.length === 0, "unfrozen diagonal melee should not hit until TargetRoute has consumed the step-in movement");
assert(
  meleeStepResult.routeRequests.some(
    (request) => request.actorId === "local-player" && request.reason === "ready" && request.attackRange === 1
  ),
  "step-in melee should request target-route movement toward the target"
);

let consumedMovementMelee = createState(1110, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 2, z: 0 },
  localLoadoutId: "tentacle-bandos"
});
consumedMovementMelee = requestLocalAttack(consumedMovementMelee);
const consumedMovementMeleeResult = runtimeCombat.advanceRuntimePlayerCombat(consumedMovementMelee, {
  tiles: {
    "local-player": consumedMovementMelee.actors["local-player"].tile,
    opponent: consumedMovementMelee.actors.opponent.tile
  },
  targetRouteMovementConsumed: {
    "local-player": true
  }
});
assert(
  consumedMovementMeleeResult.state.queuedHits.length === 0 &&
    consumedMovementMeleeResult.routeRequests.some((request) => request.actorId === "local-player" && request.reason === "ready"),
  "melee should not still attack from step-in range after its Kronos movement step was already consumed this tick"
);

let consumedMovementSameTileRange = createState(1112, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides"
});
consumedMovementSameTileRange = requestLocalAttack(consumedMovementSameTileRange);
const sameTileRangeWithoutConsumedMovement = advance(consumedMovementSameTileRange);
assert(
  sameTileRangeWithoutConsumedMovement.routeRequests.some(
    (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 8
  ),
  "same-tile ranged attacks should request a target route when no movement packet has already been consumed"
);
const sameTileRangeAfterConsumedMovement = runtimeCombat.advanceRuntimePlayerCombat(consumedMovementSameTileRange, {
  tiles: {
    "local-player": consumedMovementSameTileRange.actors["local-player"].tile,
    opponent: consumedMovementSameTileRange.actors.opponent.tile
  },
  targetRouteMovementConsumed: {
    "local-player": true
  }
});
assert(
  sameTileRangeAfterConsumedMovement.state.queuedHits.length === 0 &&
    sameTileRangeAfterConsumedMovement.routeRequests.length === 0,
  "same-tile ranged target routing should not counter-route an explicit movement step already consumed this tick"
);
assert(
  targetRouteSource.includes("r != null && r.target != null && entity.getMovement().isAtDestination()"),
  "Kronos TargetRoute.beforeMovement should only issue target routing when the actor is already at destination"
);
const tentacleTargetRouteProfile = runtimeCombat.runtimePlayerCombatTargetRouteProfile(
  "local-player",
  consumedMovementMelee.actors["local-player"]
);
assert(
  tentacleTargetRouteProfile.melee &&
    tentacleTargetRouteProfile.attackRange === 1 &&
    tentacleTargetRouteProfile.source === "weapon",
  "target-route helper should expose the active Kronos melee weapon route profile for UI pre-routing"
);
const opponentKodaiTargetRouteProfile = runtimeCombat.runtimePlayerCombatTargetRouteProfile(
  "opponent",
  createState(1111).actors.opponent
);
assert(
  !opponentKodaiTargetRouteProfile.melee && opponentKodaiTargetRouteProfile.source === "bot-autocast-spell",
  "target-route helper should preserve the opponent bot's source-backed default autocast instead of treating Kodai as melee"
);

let sceneScaledAdjacentMelee = createState(111, {
  localTile: { x: 0.25, z: 0.25 },
  opponentTile: { x: 0.75, z: 0.25 },
  localLoadoutId: "tentacle-bandos"
});
sceneScaledAdjacentMelee = requestLocalAttack(sceneScaledAdjacentMelee);
const sceneScaledAdjacentMeleeResult = advance(sceneScaledAdjacentMelee);
assert(
  sceneScaledAdjacentMeleeResult.state.queuedHits.length === 1,
  "manual-scene adjacent melee should treat Kronos 0.5 scene units as one tile and queue a hit"
);
assert(
  sceneScaledAdjacentMeleeResult.routeRequests.length === 0,
  "manual-scene adjacent melee should not route underneath the target after an already-reached hit"
);

let sceneScaledStepMelee = createState(112, {
  localTile: { x: 0.25, z: 0.25 },
  opponentTile: { x: 1.25, z: 0.25 },
  localLoadoutId: "tentacle-bandos"
});
sceneScaledStepMelee = requestLocalAttack(sceneScaledStepMelee);
const sceneScaledStepMeleeResult = advance(sceneScaledStepMelee);
assert(
  sceneScaledStepMeleeResult.state.queuedHits.length === 0 &&
    sceneScaledStepMeleeResult.routeRequests.some((request) => request.reason === "ready" && request.attackRange === 1),
  "manual-scene two-tile melee should route to a valid attack tile before the hit can be queued"
);

let sceneScaledAdjacentRange = createState(113, {
  localTile: { x: 0.25, z: 0.25 },
  opponentTile: { x: 0.75, z: 0.25 },
  localLoadoutId: "acb-hides"
});
sceneScaledAdjacentRange = requestLocalAttack(sceneScaledAdjacentRange);
const sceneScaledAdjacentRangeResult = advance(sceneScaledAdjacentRange);
assert(
  sceneScaledAdjacentRangeResult.state.queuedHits.length === 1,
  "manual-scene adjacent ranged attacks should not be blocked by sub-1 scene-unit distance"
);

let wandAttack = createState(12, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "kodai-robes"
});
wandAttack = requestLocalAttack(wandAttack);
const wandAttackResult = advance(wandAttack);
const wandAttackEvent = wandAttackResult.state.events.find((event) => event.kind === "attack");
assert(wandAttackEvent?.style === "crush", "Kodai wand default Attack should dispatch the Kronos WAND crush style, not a spell");
assert(wandAttackEvent?.sequenceName === "wand_attack", "Kodai wand default Attack should play the WAND attack animation 393");
assert(wandAttackEvent?.projectile === undefined, "Kodai wand default Attack should not emit an Ice Barrage projectile");
assert(wandAttackEvent?.hitDelayTicks === 1, "Kodai wand default melee hit should resolve through the melee hit delay");

let localKodaiNoAutocast = createState(122, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
localKodaiNoAutocast = requestLocalAttack(localKodaiNoAutocast);
const localKodaiNoAutocastResult = advance(localKodaiNoAutocast);
assert(
  localKodaiNoAutocastResult.state.queuedHits.length === 0 &&
    localKodaiNoAutocastResult.routeRequests.some(
      (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 1
    ),
  "local/player Kodai Attack without selected spell or autocast should remain a normal WAND attack path, not implicit Ice Barrage"
);

let botKodaiDefaultAutocast = createState(123, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
botKodaiDefaultAutocast = requestOpponentAttack(botKodaiDefaultAutocast);
const botKodaiDefaultAutocastResult = advance(botKodaiDefaultAutocast);
const botKodaiDefaultAutocastEvent = botKodaiDefaultAutocastResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "opponent"
);
assert(
  botKodaiDefaultAutocastEvent?.style === "magic" &&
    botKodaiDefaultAutocastEvent.spellId === "ice-barrage" &&
    botKodaiDefaultAutocastEvent.autocast === true &&
    botKodaiDefaultAutocastEvent.sequenceName === "barrage_cast" &&
    botKodaiDefaultAutocastEvent.projectile?.id === "ice_barrage_projectile",
  `opponent/bot Kodai Attack should default to persistent Ice Barrage semantics instead of staff-bashing: ${JSON.stringify(botKodaiDefaultAutocastEvent)}`
);
assert(
  botKodaiDefaultAutocastResult.state.actors.opponent.autocastSpellId === null,
  "bot-only default autocast should be an attack fallback and should not silently set the local-visible autocast varp"
);

let staleOpponentCombatLoadout = createState(124, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
staleOpponentCombatLoadout = runtimeCombat.syncRuntimePlayerCombatStateToInput(staleOpponentCombatLoadout, {
  tiles: {
    "local-player": staleOpponentCombatLoadout.actors["local-player"].tile,
    opponent: staleOpponentCombatLoadout.actors.opponent.tile
  },
  loadouts: {
    "local-player": "acb-hides",
    opponent: "acb-hides"
  }
});
staleOpponentCombatLoadout = requestOpponentAttack(staleOpponentCombatLoadout);
const syncedOpponentLoadoutResult = advance(staleOpponentCombatLoadout);
const syncedOpponentLoadoutEvent = syncedOpponentLoadoutResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "opponent"
);
assert(
  syncedOpponentLoadoutEvent?.style === "ranged" &&
    syncedOpponentLoadoutEvent.spellId === undefined &&
    syncedOpponentLoadoutEvent.sequenceName === "crossbow_attack",
  `visible ACB/Armadyl opponent loadout must not be allowed to fire a stale Kodai autocast: ${JSON.stringify(syncedOpponentLoadoutEvent)}`
);

let staleOpponentActionWindow = createState(125, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
staleOpponentActionWindow = requestOpponentAttack(staleOpponentActionWindow);
const staleOpponentMagicStart = advance(staleOpponentActionWindow).state;
assert(
  staleOpponentMagicStart.actors.opponent.actionSequenceName === "barrage_cast",
  "test setup should start with an active opponent Kodai barrage action window"
);
const syncedStaleOpponentActionWindow = runtimeCombat.syncRuntimePlayerCombatStateToInput(staleOpponentMagicStart, {
  tiles: {
    "local-player": staleOpponentMagicStart.actors["local-player"].tile,
    opponent: staleOpponentMagicStart.actors.opponent.tile
  },
  loadouts: {
    "local-player": "acb-hides",
    opponent: "acb-hides"
  }
});
assert(
  syncedStaleOpponentActionWindow.actors.opponent.actionSequenceName === "barrage_cast" &&
    syncedStaleOpponentActionWindow.actors.opponent.actionStartedAtTick === staleOpponentMagicStart.actors.opponent.actionStartedAtTick &&
    syncedStaleOpponentActionWindow.actors.opponent.actionUntilTick === staleOpponentMagicStart.actors.opponent.actionUntilTick &&
    syncedStaleOpponentActionWindow.actors.opponent.queuedSpellId === null &&
    syncedStaleOpponentActionWindow.actors.opponent.autocastSpellId === null,
  "visible ACB/Armadyl opponent sync should keep the already-started Kronos action animation while clearing stale spell/autocast state"
);

const forcedMagicPolicyController = {
  id: "test-policy-forced-magic",
  chooseAction: () => ({
    offenceStyle: "magic",
    defencePrayer: "protect_from_missiles",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
let manualPolicyOpponentMagic = createState(126, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides"
});
const manualPolicyMagicApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyOpponentMagic,
  controller: forcedMagicPolicyController,
  localActor: {
    tile: manualPolicyOpponentMagic.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicyOpponentMagic.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  manualPolicyMagicApplied.controllerId === "test-policy-forced-magic" &&
    manualPolicyMagicApplied.opponentLoadoutId === "kodai-robes",
  "manual viewport opponent should use the loaded policy controller to choose its visible loadout"
);
assert(
  manualPolicyMagicApplied.state.actors.opponent.autocastSpellId === "ice-barrage",
  "manual viewport opponent magic should mirror NhStakerBot.castBarrage by explicitly setting Ice Barrage autocast"
);
const manualPolicyMagicResult = advance(manualPolicyMagicApplied.state);
const manualPolicyMagicEvent = manualPolicyMagicResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "opponent"
);
assert(
  manualPolicyMagicEvent?.style === "magic" &&
    manualPolicyMagicEvent.spellId === "ice-barrage" &&
    manualPolicyMagicEvent.autocast === true &&
    manualPolicyMagicEvent.sequenceName === "barrage_cast",
  `manual viewport opponent policy magic should attack from Kodai, not visible Armadyl: ${JSON.stringify(manualPolicyMagicEvent)}`
);

const forcedRangedPolicyController = {
  id: "test-policy-forced-ranged",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
const manualPolicyRangeApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyMagicResult.state,
  controller: forcedRangedPolicyController,
  localActor: {
    tile: manualPolicyMagicResult.state.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicyMagicResult.state.actors.opponent.tile,
    loadoutId: "kodai-robes"
  }
});
assert(
  manualPolicyRangeApplied.opponentLoadoutId === "acb-hides" &&
    manualPolicyRangeApplied.state.actors.opponent.queuedSpellId === null &&
    manualPolicyRangeApplied.state.actors.opponent.autocastSpellId === null,
  "manual viewport opponent policy range should clear stale Kodai spell state and show Armadyl before ranged attacks"
);

const forcedDoubleGmaulPolicyController = {
  id: "test-policy-forced-double-gmaul",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "none",
    specIntent: "use_special_double",
    extendedSupplyAction: false
  })
};
let manualPolicyOpponentGmaul = createState(130, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides"
});
const manualPolicyGmaulApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyOpponentGmaul,
  controller: forcedDoubleGmaulPolicyController,
  localActor: {
    tile: manualPolicyOpponentGmaul.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicyOpponentGmaul.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  manualPolicyGmaulApplied.opponentLoadoutId === "acb-hides" &&
    manualPolicyGmaulApplied.state.actors.opponent.equipment.weapon?.itemId ===
      nhLoadouts.nhLoadouts["gmaul-bandos"].equipment.weapon?.itemId &&
    manualPolicyGmaulApplied.state.actors.opponent.gmaul.queuedSpecs === 2,
  `manual viewport policy gmaul intent should equip the maul and queue the double spec from a tick-start special-bar weapon: ${JSON.stringify({
    opponentLoadoutId: manualPolicyGmaulApplied.opponentLoadoutId,
    weapon: manualPolicyGmaulApplied.state.actors.opponent.equipment.weapon?.itemId,
    queuedSpecs: manualPolicyGmaulApplied.state.actors.opponent.gmaul.queuedSpecs,
    action: manualPolicyGmaulApplied.action
  })}`
);
const manualPolicyGmaulResult = advance(manualPolicyGmaulApplied.state);
assert(
  manualPolicyGmaulResult.state.events.some(
    (event) => event.kind === "attack" && event.attackerId === "opponent" && event.specialAttack === "granite_maul"
  ) &&
    manualPolicyGmaulResult.state.events.some(
      (event) => event.kind === "spotanim" && event.actorId === "opponent" && event.spotanimId === 340
    ) &&
    manualPolicyGmaulResult.state.actors.opponent.gmaul.specialEnergy === 0,
  "manual viewport policy gmaul input should become the Kronos Granite maul special attack path"
);

let manualPolicyOpponentFarGmaul = createState(132, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides"
});
const manualPolicyFarGmaulApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyOpponentFarGmaul,
  controller: forcedDoubleGmaulPolicyController,
  localActor: {
    tile: manualPolicyOpponentFarGmaul.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicyOpponentFarGmaul.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  manualPolicyFarGmaulApplied.effectiveAction.specIntent === "none" &&
    manualPolicyFarGmaulApplied.state.actors.opponent.gmaul.queuedSpecs === 0,
  `manual viewport policy gmaul intent should wait until NhStakerBot.maybeEquipGraniteMaulForSpec observes maul melee reach: ${JSON.stringify({
    opponentLoadoutId: manualPolicyFarGmaulApplied.opponentLoadoutId,
    weapon: manualPolicyFarGmaulApplied.state.actors.opponent.equipment.weapon?.itemId,
    queuedSpecs: manualPolicyFarGmaulApplied.state.actors.opponent.gmaul.queuedSpecs,
    effectiveAction: manualPolicyFarGmaulApplied.effectiveAction
  })}`
);

let manualPolicyOpponentFarMeleeGmaul = createState(133, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "gmaul-bandos"
});
const manualPolicyFarMeleeGmaulApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyOpponentFarMeleeGmaul,
  controller: forcedDoubleGmaulPolicyController,
  localActor: {
    tile: manualPolicyOpponentFarMeleeGmaul.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicyOpponentFarMeleeGmaul.actors.opponent.tile,
    loadoutId: "gmaul-bandos"
  }
});
assert(
  manualPolicyFarMeleeGmaulApplied.effectiveAction.specIntent === "none" &&
    manualPolicyFarMeleeGmaulApplied.state.actors.opponent.gmaul.queuedSpecs === 0,
  `manual viewport policy gmaul intent should still skip when the tick-start weapon itself is melee and cannot attack yet: ${JSON.stringify({
    queuedSpecs: manualPolicyFarMeleeGmaulApplied.state.actors.opponent.gmaul.queuedSpecs,
    effectiveAction: manualPolicyFarMeleeGmaulApplied.effectiveAction
  })}`
);

let manualPolicyOpponentNoSpecControl = createState(131, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
const manualPolicyNoSpecControlApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicyOpponentNoSpecControl,
  controller: forcedDoubleGmaulPolicyController,
  localActor: {
    tile: manualPolicyOpponentNoSpecControl.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicyOpponentNoSpecControl.actors.opponent.tile,
    loadoutId: "kodai-robes"
  }
});
assert(
  manualPolicyNoSpecControlApplied.opponentLoadoutId === "acb-hides" &&
    manualPolicyNoSpecControlApplied.state.actors.opponent.gmaul.queuedSpecs === 0,
  "manual viewport policy gmaul intent should be skipped when Kronos tick-start client spec control is unavailable"
);

const visibleEvState = nhDuel.createInitialNhDuelState(128);
const acbLoadoutActor = visibleEvState.actors.opponent;
const visibleEvSelf = {
  ...visibleEvState.actors.self,
  loadoutId: "acb-hides",
  weaponId: "armadyl_crossbow",
  equipment: acbLoadoutActor.equipment
};
const visibleEvOpponent = {
  ...visibleEvState.actors.opponent,
  loadoutId: "acb-hides",
  weaponId: "armadyl_crossbow",
  equipment: acbLoadoutActor.equipment,
  activePrayers: []
};
const visibleEvContext = nhDuel.createNhDuelControllerContext(0, visibleEvSelf, visibleEvOpponent);
const visibleEvByStyle = new Map(visibleEvContext.visibleStyleEvs.map((estimate) => [estimate.style, estimate.expectedDamage]));
assert(
  (visibleEvByStyle.get("ranged") ?? 0) > (visibleEvByStyle.get("magic") ?? 0),
  `candidate style EV should compare the gear each action would switch into, not the currently equipped Armadyl gear: ${JSON.stringify(Object.fromEntries(visibleEvByStyle))}`
);
assert(
  nhDuelSource.includes("attackerPrayers: compatiblePrayerSet([...self.activePrayers, offensivePrayerForVisibleStyle(style)])") &&
    nhDuelSource.includes('style === "slash" ? offensivePrayerForStyle("melee") : offensivePrayerForStyle(style)'),
  "candidate visible-style EV should include the offensive prayer that Kronos would use for the candidate style"
);
const protectedMissilesVisibleEvOpponent = {
  ...visibleEvOpponent,
  activePrayers: ["protect_from_missiles"]
};
const protectedMissilesVisibleEvContext = nhDuel.createNhDuelControllerContext(
  0,
  visibleEvSelf,
  protectedMissilesVisibleEvOpponent
);
const protectedMissilesVisibleEvByStyle = new Map(
  protectedMissilesVisibleEvContext.visibleStyleEvs.map((estimate) => [estimate.style, estimate.expectedDamage])
);
assert(
  (protectedMissilesVisibleEvByStyle.get("ranged") ?? Infinity) <
    Math.max(protectedMissilesVisibleEvByStyle.get("magic") ?? 0, protectedMissilesVisibleEvByStyle.get("slash") ?? 0),
  `candidate visible-style EV should apply PvP protection-prayer damage reduction before ranking bot attacks: ${JSON.stringify(Object.fromEntries(protectedMissilesVisibleEvByStyle))}`
);
const defaultNhPolicyPath = path.resolve(
  projectRoot,
  "..",
  "kronos-osrs-184-master",
  "kronos-osrs-184-master",
  "Kronos-master",
  "kronos-server",
  "data",
  "ai",
  "nhstaker-selfplay-policy-nhstake-ags.tsv"
);
const defaultNhPolicy = botPolicy.parseNhPolicyTsv(readFileSync(defaultNhPolicyPath, "utf8"), defaultNhPolicyPath);
const gmaulSpecProbeAction = {
  offenceStyle: "ranged",
  defencePrayer: "protect_from_magic",
  movementIntent: "pressure",
  supplyIntent: "none",
  specIntent: "use_special_double",
  extendedSupplyAction: false
};
const specProbePolicy = {
  version: 1,
  counters: { decisions: 0, samples: 0, exploration: 0 },
  actionVisits: [],
  weightsByAction: new Map([[nhPolicyBridge.encodeNhPolicyAction(gmaulSpecProbeAction), new Map()]]),
  weightEntryCount: 0,
  sourceLabel: "spec-probe"
};
const gmaulSpecProbeState = nhDuel.createInitialNhDuelState(130);
const gmaulSpecProbeOpponent = {
  ...gmaulSpecProbeState.actors.opponent,
  tile: { x: 1, y: 0, plane: 0 },
  stats: {
    ...gmaulSpecProbeState.actors.opponent.stats,
    hitpoints: {
      ...gmaulSpecProbeState.actors.opponent.stats.hitpoints,
      current: 18
    }
  }
};
const gmaulSpecProbeAcbSelf = {
  ...gmaulSpecProbeState.actors.self,
  tile: { x: 0, y: 0, plane: 0 },
  loadoutId: "acb-hides",
  weaponId: "armadyl_crossbow",
  equipment: nhLoadouts.nhLoadouts["acb-hides"].equipment
};
const gmaulSpecProbeKodaiSelf = {
  ...gmaulSpecProbeAcbSelf,
  loadoutId: "kodai-robes",
  weaponId: "kodai",
  equipment: nhLoadouts.nhLoadouts["kodai-robes"].equipment
};
const gmaulSpecProbeAcbContext = nhDuel.createNhDuelControllerContext(
  0,
  gmaulSpecProbeAcbSelf,
  gmaulSpecProbeOpponent
);
const gmaulSpecProbeKodaiContext = nhDuel.createNhDuelControllerContext(
  0,
  gmaulSpecProbeKodaiSelf,
  gmaulSpecProbeOpponent
);
const gmaulSpecProbeAcbInput = nhPolicyFeatures.encodeNhPolicyInput(gmaulSpecProbeAcbContext);
const gmaulSpecProbeKodaiInput = nhPolicyFeatures.encodeNhPolicyInput(gmaulSpecProbeKodaiContext);
assert(
  gmaulSpecProbeAcbInput[10] === 1 &&
    gmaulSpecProbeAcbInput[11] === 1 &&
    gmaulSpecProbeKodaiInput[10] === 0 &&
    gmaulSpecProbeKodaiInput[11] === 0,
  `NH policy spec-control features should mirror Kronos tick-start special bar control, not already-equipped gmaul state: ${JSON.stringify({
    acb: gmaulSpecProbeAcbInput.slice(10, 12),
    kodai: gmaulSpecProbeKodaiInput.slice(10, 12)
  })}`
);
const gmaulSpecProbeAcbRanking = botPolicy.rankNhPolicyActionsFromFeatures(
  specProbePolicy,
  nhPolicyFeatures.encodeNhPolicyFeatures(gmaulSpecProbeAcbContext, nhPolicyFeatures.createNhPolicyFeatureState()),
  1,
  gmaulSpecProbeAcbContext
);
const gmaulSpecProbeKodaiRanking = botPolicy.rankNhPolicyActionsFromFeatures(
  specProbePolicy,
  nhPolicyFeatures.encodeNhPolicyFeatures(gmaulSpecProbeKodaiContext, nhPolicyFeatures.createNhPolicyFeatureState()),
  1,
  gmaulSpecProbeKodaiContext
);
assert(
  gmaulSpecProbeAcbRanking[0]?.decoded.specIntent === "use_special_double" &&
    gmaulSpecProbeKodaiRanking[0]?.decoded.specIntent === "none",
  `NH policy bridge should allow gmaul intents from tick-start spec-bar weapons and reject them from Kodai: ${JSON.stringify({
    acb: gmaulSpecProbeAcbRanking[0]?.decoded,
    kodai: gmaulSpecProbeKodaiRanking[0]?.decoded
  })}`
);
const visibleEvPolicyFeatures = nhPolicyFeatures.encodeNhPolicyFeatures(
  visibleEvContext,
  nhPolicyFeatures.createNhPolicyFeatureState()
);
const visibleEvPolicyRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  defaultNhPolicy,
  visibleEvPolicyFeatures,
  5,
  visibleEvContext
);
assert(
  visibleEvPolicyRankings[0]?.decoded.offenceStyle === "ranged",
  `default NH policy should not prefer magic into full Armadyl when candidate gear EV favors range: ${JSON.stringify(visibleEvPolicyRankings.map((entry) => ({ score: entry.score, decoded: entry.decoded })))}`
);
const protectedMissilesVisibleEvPolicyFeatures = nhPolicyFeatures.encodeNhPolicyFeatures(
  protectedMissilesVisibleEvContext,
  nhPolicyFeatures.createNhPolicyFeatureState()
);
const protectedMissilesVisibleEvPolicyRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  defaultNhPolicy,
  protectedMissilesVisibleEvPolicyFeatures,
  5,
  protectedMissilesVisibleEvContext
);
const protectedMissilesLiveCounterState = createState(129, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides",
  localPrayers: ["protect_from_missiles"]
});
const protectedMissilesLiveCounterApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: protectedMissilesLiveCounterState,
  controller: botPolicy.createNhPolicyController(defaultNhPolicy),
  localActor: {
    tile: protectedMissilesLiveCounterState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    equipment: acbLoadoutActor.equipment,
    activePrayers: ["protect_from_missiles"]
  },
  opponentActor: {
    tile: protectedMissilesLiveCounterState.actors.opponent.tile,
    loadoutId: "acb-hides",
    equipment: acbLoadoutActor.equipment
  }
});
assert(
  nhStakerBotSource.includes("desiredOffence = enforceLivePrayerCounter(opponent, desiredOffence);") &&
    protectedMissilesLiveCounterApplied.effectiveAction.offenceStyle !== "ranged",
  `default NH policy should not keep bolting into active Protect from Missiles after the Java live-prayer counter gate: ${JSON.stringify({
    rankings: protectedMissilesVisibleEvPolicyRankings.map((entry) => ({ score: entry.score, decoded: entry.decoded })),
    action: protectedMissilesLiveCounterApplied.action,
    effectiveAction: protectedMissilesLiveCounterApplied.effectiveAction,
    loadout: protectedMissilesLiveCounterApplied.opponentLoadoutId
  })}`
);
const priorOnlyAntiArmadylPolicy = {
  version: 1,
  counters: { decisions: 0, samples: 0, exploration: 0 },
  actionVisits: [],
  weightsByAction: new Map(
    [
      {
        offenceStyle: "magic",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      },
      {
        offenceStyle: "ranged",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      },
      {
        offenceStyle: "melee",
        defencePrayer: "protect_from_magic",
        movementIntent: "pressure",
        supplyIntent: "none",
        specIntent: "none",
        extendedSupplyAction: false
      }
    ].map((action) => [nhPolicyBridge.encodeNhPolicyAction(action), new Map()])
  ),
  weightEntryCount: 0,
  sourceLabel: "prior-only-anti-armadyl"
};
const priorOnlyAntiArmadylRankings = botPolicy.rankNhPolicyActionsFromFeatures(
  priorOnlyAntiArmadylPolicy,
  visibleEvPolicyFeatures,
  3,
  visibleEvContext
);
assert(
  priorOnlyAntiArmadylRankings[0]?.decoded.offenceStyle !== "magic" &&
    visibleEvPolicyRankings[0]?.decoded.offenceStyle !== "magic",
  `EV prior should demote clear low-value magic into full Armadyl instead of letting stale weights look like a dumb model: ${JSON.stringify(priorOnlyAntiArmadylRankings.map((entry) => ({ score: entry.score, decoded: entry.decoded })))}`
);
const scriptedFallbackAntiArmadylState = createState(129, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
const scriptedFallbackAntiArmadyl = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: scriptedFallbackAntiArmadylState,
  controller: nhDuel.scriptedNhController,
  localActor: {
    tile: scriptedFallbackAntiArmadylState.actors["local-player"].tile,
    loadoutId: "acb-hides",
    equipment: acbLoadoutActor.equipment
  },
  opponentActor: {
    tile: scriptedFallbackAntiArmadylState.actors.opponent.tile,
    loadoutId: "kodai-robes"
  }
});
assert(
  scriptedFallbackAntiArmadyl.controllerId === "scripted-nh-controller" &&
    scriptedFallbackAntiArmadyl.action.offenceStyle === "magic" &&
    scriptedFallbackAntiArmadyl.opponentLoadoutId === "kodai-robes",
  `manual viewport no-policy fallback should mirror Java NhStakerBot.clientOffenceEv scripted fallback, not the older trainer visible-EV shortcut: ${JSON.stringify({
    controllerId: scriptedFallbackAntiArmadyl.controllerId,
    action: scriptedFallbackAntiArmadyl.action,
    opponentLoadoutId: scriptedFallbackAntiArmadyl.opponentLoadoutId
  })}`
);

const baseConsumableStats = {
  attack: { current: 99, fixed: 99 },
  strength: { current: 99, fixed: 99 },
  defence: { current: 99, fixed: 99 },
  ranged: { current: 99, fixed: 99 },
  magic: { current: 99, fixed: 99 },
  hitpoints: { current: 50, fixed: 99 },
  prayer: { current: 99, fixed: 99 }
};
const baseConsumableAttackTimer = {
  lastAttackTick: 0,
  weaponCooldownTicks: 0,
  additiveAttackDelayTicks: 0
};
const firstShark = consumables.applyConsumable({
  stats: baseConsumableStats,
  delays: consumables.createSupplyDelayState(),
  attackTimer: baseConsumableAttackTimer,
  currentTick: 100,
  item: "shark"
});
const oneTickEarlyShark = consumables.applyConsumable({
  stats: firstShark.stats,
  delays: firstShark.delays,
  attackTimer: firstShark.attackTimer,
  currentTick: 102,
  item: "shark"
});
const expiryTickShark = consumables.applyConsumable({
  stats: firstShark.stats,
  delays: firstShark.delays,
  attackTimer: firstShark.attackTimer,
  currentTick: 103,
  item: "shark"
});
const expiryTickKarambwan = consumables.applyConsumable({
  stats: baseConsumableStats,
  delays: {
    eatDelayUntilTick: 103,
    karambwanDelayUntilTick: -1,
    potionDelayUntilTick: -1
  },
  attackTimer: baseConsumableAttackTimer,
  currentTick: 103,
  item: "karambwan"
});
assert(
  tickDelaySource.includes("return !Server.isPast(end);") &&
    consumablesSource.includes("return delayUntilTick > currentTick;") &&
    firstShark.ok &&
    firstShark.delays.eatDelayUntilTick === 103 &&
    !oneTickEarlyShark.ok &&
    oneTickEarlyShark.reason === "eat-delay" &&
    expiryTickShark.ok &&
    expiryTickKarambwan.ok &&
    expiryTickKarambwan.attackTimer.additiveAttackDelayTicks === 2,
  `Kronos TickDelay should expire when currentTick reaches end, so queued consumables are available on the expiry tick: ${JSON.stringify({
    firstShark,
    oneTickEarlyShark,
    expiryTickShark,
    expiryTickKarambwan
  })}`
);
const lateTickQueue = itemActionQueue.createItemActionQueue();
lateTickQueue.push({
  kind: "eat",
  slotIndex: 0,
  itemId: 385,
  queuedAtMs: 599,
  readyAtMs: 600
});
const lateTickBeforeBoundary = lateTickQueue.drainReady(599, 600);
const lateTickAtBoundary = lateTickQueue.drainReady(600, 600);
assert(
  lateTickBeforeBoundary.length === 0 &&
    lateTickAtBoundary.length === 1 &&
    /const queueInventoryConsumableAction[\s\S]*const readyAtMs = nextKronosGameTickAt\(runtimeTickOriginMsRef\.current, queuedAtMs\);[\s\S]*itemActionQueueRef\.current\.push\(\{[\s\S]*readyAtMs,/.test(viewerSource),
  `queued consumable packets should resolve on the next Kronos tick boundary even when clicked late in the previous tick: ${JSON.stringify({
    lateTickBeforeBoundary,
    lateTickAtBoundary
  })}`
);

const forcedDoubleEatPolicyController = {
  id: "test-policy-forced-double-eat",
  chooseAction: () => ({
    offenceStyle: "ranged",
    defencePrayer: "protect_from_magic",
    movementIntent: "pressure",
    supplyIntent: "double_eat",
    specIntent: "none",
    extendedSupplyAction: false
  })
};
let manualPolicySupplyState = createState(127, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "acb-hides"
});
manualPolicySupplyState = {
  ...manualPolicySupplyState,
  actors: {
    ...manualPolicySupplyState.actors,
    opponent: {
      ...manualPolicySupplyState.actors.opponent,
      hitpoints: 45
    }
  }
};
const manualPolicySupplyApplied = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: manualPolicySupplyState,
  controller: forcedDoubleEatPolicyController,
  localActor: {
    tile: manualPolicySupplyState.actors["local-player"].tile,
    loadoutId: "acb-hides"
  },
  opponentActor: {
    tile: manualPolicySupplyState.actors.opponent.tile,
    loadoutId: "acb-hides"
  }
});
assert(
  manualPolicySupplyApplied.context.self.supplies.manta_ray === 4 &&
    manualPolicySupplyApplied.context.self.supplies.karambwan === 4,
  "manual viewport policy context should expose the opponent bot's real supply counts instead of all-zero supplies"
);
assert(
  JSON.stringify(manualPolicySupplyApplied.consumedSupplies) === JSON.stringify(["manta_ray", "karambwan"]) &&
    manualPolicySupplyApplied.state.actors.opponent.hitpoints === 85 &&
    manualPolicySupplyApplied.state.actors.opponent.supplies.manta_ray === 3 &&
    manualPolicySupplyApplied.state.actors.opponent.supplies.karambwan === 3,
  `manual viewport policy bot should consume and persist Kronos-timed supplies: ${JSON.stringify({
    consumed: manualPolicySupplyApplied.consumedSupplies,
    hp: manualPolicySupplyApplied.state.actors.opponent.hitpoints,
    supplies: manualPolicySupplyApplied.state.actors.opponent.supplies
  })}`
);

let magicAttack = createState(120, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
magicAttack = requestLocalSpell(magicAttack);
const magicAttackResult = advance(magicAttack);
const magicAttackEvent = magicAttackResult.state.events.find((event) => event.kind === "attack");
assertAttackAnimationWindow(magicAttackResult, "local-player", "Ice Barrage attack");
assert(magicAttackEvent?.style === "magic", "Selected Ice Barrage should dispatch a magic attack style");
assert(magicAttackEvent?.spellId === "ice-barrage" && magicAttackEvent?.autocast === false, "Selected Ice Barrage should be tagged as a queued one-shot spell, not autocast");
assert(magicAttackEvent?.sequenceName === "barrage_cast", "Selected Ice Barrage should play the barrage cast sequence");
assert(magicAttackEvent?.projectile?.id === "ice_barrage_projectile", "Selected Ice Barrage should emit the ice barrage projectile profile");
assert(magicAttackEvent?.hitDelayTicks === 4, "Ice barrage hit delay should match Kronos Projectile.send plus TargetSpell clientDelay(projectileDuration, 19)");
assert(magicAttackEvent?.projectileDurationCycles === 86, "Ice barrage projectile duration should use source 56 + 10 cycles per extra tile");
assert(magicAttackResult.state.queuedHits[0]?.dueTick === 4, "Ice barrage hitsplat should resolve before the next five-tick magic attack can animate");
assert(magicAttackResult.state.queuedHits[0]?.spellId === "ice-barrage", "Ice Barrage queued hit should retain spell metadata for RuneLite-style trackers");
assert(magicAttackResult.state.actors["local-player"].queuedSpellId === null, "queued selected spell should clear after the cast is launched");
assert(magicAttackResult.state.actors["local-player"].targetId === null, "one-shot selected spell should not keep the player auto-attacking");
const magicDamageEstimate = runtimeCombat.runtimePlayerCombatDamageEstimate(
  magicAttackResult.state.actors["local-player"],
  magicAttackResult.state.actors.opponent,
  "magic"
);
assert(magicDamageEstimate.maxDamage === 38, `Kodai/Ahrim's Ice Barrage max should be 30 base plus the source NH bot gear bonus, not a 43: ${JSON.stringify(magicDamageEstimate)}`);
assert(
  magicAttackResult.state.queuedHits[0]?.rawDamage <= magicDamageEstimate.maxDamage,
  `Kodai magic queued damage should not exceed the source-visible barrage max: ${JSON.stringify(magicAttackResult.state.queuedHits[0])}`
);
assert(
  magicAttackResult.state.actors["local-player"].actionStartedAtTick === 0 &&
    magicAttackResult.state.actors["local-player"].actionStartedAtClientCycle === 0 &&
    magicAttackResult.state.actors["local-player"].actionDurationTicks === 4 &&
    magicAttackResult.state.actors["local-player"].actionUntilTick === 4,
  "runtime combat attack animation should stay active for the standard animation duration, independent of weapon cooldown window"
);
const magicAttackWeaponSync = runtimeCombat.syncRuntimePlayerCombatStateToInput(magicAttackResult.state, {
  tiles: {
    "local-player": magicAttackResult.state.actors["local-player"].tile,
    opponent: magicAttackResult.state.actors.opponent.tile
  },
  loadouts: {
    "local-player": "acb-hides"
  },
  equipment: {
    "local-player": nhLoadouts.nhLoadouts["acb-hides"].equipment
  }
});
assert(
  magicAttackWeaponSync.actors["local-player"].actionSequenceName === "barrage_cast" &&
    magicAttackWeaponSync.actors["local-player"].actionStartedAtTick === magicAttackResult.state.actors["local-player"].actionStartedAtTick &&
    magicAttackWeaponSync.actors["local-player"].actionStartedAtClientCycle === magicAttackResult.state.actors["local-player"].actionStartedAtClientCycle &&
    magicAttackWeaponSync.queuedHits.length === magicAttackResult.state.queuedHits.length &&
    magicAttackWeaponSync.actors["local-player"].queuedSpellId === null &&
    magicAttackWeaponSync.actors["local-player"].autocastSpellId === null,
  `weapon sync after an attack should preserve the active Kronos animation while clearing spell/autocast state: ${JSON.stringify(magicAttackWeaponSync.actors["local-player"])}`
);
let magicHitState = magicAttackResult.state;
for (let index = 0; index < 4; index += 1) {
  magicHitState = advance(magicHitState).state;
}
const magicHitsplatEvent = magicHitState.events.find((event) => event.kind === "hitsplat" && event.style === "magic");
assert(magicHitsplatEvent, "queued magic damage should resolve into a style-tagged hitsplat event");
assert(
  magicHitsplatEvent.damage <= magicHitsplatEvent.maxDamage && magicHitsplatEvent.maxDamage === 38,
  `magic hitsplat should be the applied engine value and should not display impossible barrage damage: ${JSON.stringify(magicHitsplatEvent)}`
);

let bloodAttack = null;
let bloodAttackResult = null;
for (let seed = 130; seed < 170; seed += 1) {
  const candidateState = createState(seed, {
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "kodai-robes"
  });
  const woundedCandidate = {
    ...candidateState,
    actors: {
      ...candidateState.actors,
      "local-player": {
        ...candidateState.actors["local-player"],
        hitpoints: 50
      }
    }
  };
  const result = advance(requestLocalSpell(woundedCandidate, "blood-barrage"));
  if ((result.state.queuedHits[0]?.rawDamage ?? 0) > 0) {
    bloodAttack = woundedCandidate;
    bloodAttackResult = result;
    break;
  }
}
assert(bloodAttack && bloodAttackResult, "Blood Barrage verifier should find a deterministic non-zero source-backed hit seed");
const bloodAttackEvent = bloodAttackResult.state.events.find((event) => event.kind === "attack");
assertAttackAnimationWindow(bloodAttackResult, "local-player", "Blood Barrage attack");
assert(bloodAttackEvent?.style === "magic", "Selected Blood Barrage should dispatch a magic attack style");
assert(bloodAttackEvent?.spellId === "blood-barrage" && bloodAttackEvent?.autocast === false, "Selected Blood Barrage should be tagged as a queued one-shot spell");
assert(bloodAttackEvent?.projectile?.id === "blood_barrage_delay", "Blood Barrage should carry the Kronos delay-only Projectile(51,56,10) profile");
assert(bloodAttackEvent?.projectile?.gfxId === -1, "Blood Barrage should not render an Ice projectile because Kronos sends no projectile packet for gfx -1");
assert(bloodAttackEvent?.projectileDurationCycles === 86, "Blood Barrage delay-only projectile should still use source duration cycles for hit timing");
assert(bloodAttackResult.state.queuedHits[0]?.maxDamage === 36, `Blood Barrage max should use base 29 plus the source NH gear bonus: ${JSON.stringify(bloodAttackResult.state.queuedHits[0])}`);
const deterministicBloodHit = bloodAttackResult.state.queuedHits[0];
assert(deterministicBloodHit, "Blood Barrage verifier should queue a delayed hit");
let bloodHitState = {
  ...bloodAttackResult.state,
  queuedHits: [
    {
      ...deterministicBloodHit,
      damage: 20,
      rawDamage: 20
    }
  ]
};
while (bloodHitState.tick < deterministicBloodHit.dueTick) {
  bloodHitState = advance(bloodHitState).state;
  assert(
    bloodHitState.actors["local-player"].hitpoints === 50,
    `Blood Barrage should not heal before the queued hit's due tick: ${JSON.stringify({
      tick: bloodHitState.tick,
      dueTick: deterministicBloodHit.dueTick,
      hitpoints: bloodHitState.actors["local-player"].hitpoints
    })}`
  );
}
bloodHitState = advance(bloodHitState).state;
const bloodHitsplatEvent = bloodHitState.events.find((event) => event.kind === "hitsplat" && event.spellId === "blood-barrage");
const bloodSpotanimEvent = bloodHitState.events.find((event) => event.kind === "spotanim" && event.spotanimId === 377);
assert(bloodHitsplatEvent, "Blood Barrage queued damage should resolve into a tagged hitsplat event");
assert(bloodSpotanimEvent?.artifactUrl === "render/spotanims/blood_barrage_hit.glb", "Blood Barrage should play Kronos hit gfx 377, not the Ice Barrage hit gfx");
assert(bloodHitsplatEvent.damage === 20, "Blood Barrage deterministic heal verifier should apply the forced source hit value");
assert(
  bloodHitState.actors["local-player"].hitpoints === Math.min(99, 50 + Math.trunc(bloodHitsplatEvent.damage / 4)),
  `Blood Barrage should heal the caster by hit.damage / 4 like BloodSpell.afterHit: ${JSON.stringify({
    damage: bloodHitsplatEvent.damage,
    hitpoints: bloodHitState.actors["local-player"].hitpoints
  })}`
);

let bloodBlitzAttack = null;
let bloodBlitzAttackResult = null;
for (let seed = 170; seed < 220; seed += 1) {
  const candidateState = createState(seed, {
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "kodai-robes"
  });
  const woundedCandidate = {
    ...candidateState,
    actors: {
      ...candidateState.actors,
      "local-player": {
        ...candidateState.actors["local-player"],
        hitpoints: 50
      }
    }
  };
  const result = advance(requestLocalSpell(woundedCandidate, "blood-blitz"));
  if ((result.state.queuedHits[0]?.rawDamage ?? 0) > 0) {
    bloodBlitzAttack = woundedCandidate;
    bloodBlitzAttackResult = result;
    break;
  }
}
assert(bloodBlitzAttack && bloodBlitzAttackResult, "Blood Blitz verifier should find a deterministic non-zero source-backed hit seed");
const bloodBlitzAttackEvent = bloodBlitzAttackResult.state.events.find((event) => event.kind === "attack");
assertAttackAnimationWindow(bloodBlitzAttackResult, "local-player", "Blood Blitz attack");
assert(bloodBlitzAttackEvent?.spellId === "blood-blitz", "Selected Blood Blitz should be tagged as a queued one-shot spell");
assert(bloodBlitzAttackEvent?.sequenceName === "blitz_cast", "Blood Blitz should use Kronos animation 1978 through the blitz_cast sequence");
assert(bloodBlitzAttackEvent?.projectile?.id === "blood_blitz_projectile", "Blood Blitz should carry Kronos projectile gfx 374");
assert(bloodBlitzAttackEvent?.projectile?.artifactUrl === "render/spotanims/blood_blitz_projectile.glb", "Blood Blitz projectile should render from the cache GLB");
assert(bloodBlitzAttackEvent?.projectileDurationCycles === 86, "Blood Blitz projectile duration should use the source 56 + 10 per tile cycles");
assert(bloodBlitzAttackResult.state.queuedHits[0]?.maxDamage === 31, `Blood Blitz max should use base 25 plus the source NH gear bonus: ${JSON.stringify(bloodBlitzAttackResult.state.queuedHits[0])}`);
const deterministicBloodBlitzHit = bloodBlitzAttackResult.state.queuedHits[0];
assert(deterministicBloodBlitzHit, "Blood Blitz verifier should queue a delayed hit");
let bloodBlitzHitState = {
  ...bloodBlitzAttackResult.state,
  queuedHits: [
    {
      ...deterministicBloodBlitzHit,
      damage: 20,
      rawDamage: 20
    }
  ]
};
while (bloodBlitzHitState.tick < deterministicBloodBlitzHit.dueTick) {
  bloodBlitzHitState = advance(bloodBlitzHitState).state;
}
bloodBlitzHitState = advance(bloodBlitzHitState).state;
const bloodBlitzHitsplatEvent = bloodBlitzHitState.events.find((event) => event.kind === "hitsplat" && event.spellId === "blood-blitz");
const bloodBlitzSpotanimEvent = bloodBlitzHitState.events.find((event) => event.kind === "spotanim" && event.spotanimId === 375);
assert(bloodBlitzHitsplatEvent?.damage === 20, "Blood Blitz deterministic heal verifier should apply the forced source hit value");
assert(bloodBlitzSpotanimEvent?.artifactUrl === "render/spotanims/blood_blitz_hit.glb", "Blood Blitz should play Kronos hit gfx 375");
assert(
  bloodBlitzHitState.actors["local-player"].hitpoints === Math.min(99, 50 + Math.trunc(bloodBlitzHitsplatEvent.damage / 4)),
  `Blood Blitz should heal the caster by hit.damage / 4 like BloodSpell.afterHit: ${JSON.stringify({
    damage: bloodBlitzHitsplatEvent.damage,
    hitpoints: bloodBlitzHitState.actors["local-player"].hitpoints
  })}`
);

let iceBlitzAttackResult = null;
for (let seed = 220; seed < 270; seed += 1) {
  const result = advance(
    requestLocalSpell(
      createState(seed, {
        localTile: { x: 0, z: 0 },
        opponentTile: { x: 4, z: 0 },
        localLoadoutId: "kodai-robes"
      }),
      "ice-blitz"
    )
  );
  if ((result.state.queuedHits[0]?.rawDamage ?? 0) > 0) {
    iceBlitzAttackResult = result;
    break;
  }
}
assert(iceBlitzAttackResult, "Ice Blitz verifier should find a deterministic non-zero source-backed hit seed");
const iceBlitzAttackEvent = iceBlitzAttackResult.state.events.find((event) => event.kind === "attack");
const iceBlitzCastSpotanimEvent = iceBlitzAttackResult.state.events.find((event) => event.kind === "spotanim" && event.spotanimId === 366);
assertAttackAnimationWindow(iceBlitzAttackResult, "local-player", "Ice Blitz attack");
assert(iceBlitzAttackEvent?.spellId === "ice-blitz", "Selected Ice Blitz should be tagged as a queued one-shot spell");
assert(iceBlitzAttackEvent?.sequenceName === "blitz_cast", "Ice Blitz should use Kronos animation 1978 through the blitz_cast sequence");
assert(iceBlitzAttackEvent?.projectile?.id === "ice_blitz_delay", "Ice Blitz should carry Kronos delay-only Projectile(56,10)");
assert(iceBlitzAttackEvent?.projectile?.gfxId === -1, "Ice Blitz should not render a travel projectile because Kronos sends no projectile packet for gfx -1");
assert(iceBlitzAttackEvent?.projectileDurationCycles === 86, "Ice Blitz delay-only projectile should still use source duration cycles for hit timing");
assert(iceBlitzCastSpotanimEvent?.artifactUrl === "render/spotanims/ice_blitz_cast.glb", "Ice Blitz should play Kronos cast gfx 366 on the caster");
assert(iceBlitzAttackResult.state.queuedHits[0]?.maxDamage === 33, `Ice Blitz max should use base 26 plus the source NH gear bonus: ${JSON.stringify(iceBlitzAttackResult.state.queuedHits[0])}`);
assert(
  runtimeCombat.runtimePlayerCombatSpellDefinitions["ice-blitz"].freezeDurationTicks === runtimeCombat.runtimePlayerCombatIceBlitzFreezeTicks,
  "Ice Blitz definition should carry the Kronos 15-second freeze duration"
);
assert(
  entityLocks.isFrozen(iceBlitzAttackResult.state.actors.opponent.locks, iceBlitzAttackResult.state.tick),
  `Ice Blitz should apply freeze on a successful cast like TargetSpell.hold(): ${JSON.stringify(iceBlitzAttackResult.state.actors.opponent.locks)}`
);

assert(runtimeCombat.runtimePlayerCombatSpellDefinitions["blood-barrage"].requiredMagicLevel === 92, "Blood Barrage runtime definition should keep Kronos level requirement 92");
assert(runtimeCombat.runtimePlayerCombatSpellDefinitions["ice-barrage"].requiredMagicLevel === 94, "Ice Barrage runtime definition should keep Kronos level requirement 94");
assert(runtimeCombat.runtimePlayerCombatSpellDefinitions["blood-blitz"].requiredMagicLevel === 80, "Blood Blitz runtime definition should keep Kronos level requirement 80");
assert(runtimeCombat.runtimePlayerCombatSpellDefinitions["ice-blitz"].requiredMagicLevel === 82, "Ice Blitz runtime definition should keep Kronos level requirement 82");

let lowCurrentIce = createState(901, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  localLevels: combatLevels({ magic: 93 })
});
lowCurrentIce = requestLocalSpell(lowCurrentIce, "ice-barrage");
const lowCurrentIceResult = advance(lowCurrentIce);
assert(
  !lowCurrentIceResult.state.events.some((event) => event.kind === "attack" && event.attackerId === "local-player"),
  `current Magic 93 should not cast Ice Barrage requiring 94: ${JSON.stringify(lowCurrentIceResult.state.events)}`
);
assert(
  lowCurrentIceResult.state.queuedHits.every((hit) => hit.attackerId !== "local-player") &&
    lowCurrentIceResult.state.actors["local-player"].queuedSpellId === null &&
    lowCurrentIceResult.state.actors["local-player"].targetId === null,
  `failed Ice Barrage cast should reset the selected spell without queuing damage or cooldown: ${JSON.stringify(lowCurrentIceResult.state.actors["local-player"])}`
);
assert(
  lowCurrentIceResult.state.events.every((event) => event.attackerId !== "local-player"),
  `failed Ice Barrage cast should not add non-render message events into the combat animation stream: ${JSON.stringify(lowCurrentIceResult.state.events)}`
);

let lowCurrentBlood = createState(902, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  localLevels: combatLevels({ magic: 91 })
});
lowCurrentBlood = requestLocalSpell(lowCurrentBlood, "blood-barrage");
const lowCurrentBloodResult = advance(lowCurrentBlood);
assert(
  !lowCurrentBloodResult.state.events.some((event) => event.kind === "attack" && event.attackerId === "local-player") &&
    lowCurrentBloodResult.state.queuedHits.every((hit) => hit.attackerId !== "local-player"),
  `current Magic 91 should not cast Blood Barrage requiring 92: ${JSON.stringify(lowCurrentBloodResult.state.events)}`
);
assert(
  lowCurrentBloodResult.state.events.every((event) => event.attackerId !== "local-player"),
  `failed Blood Barrage cast should not add non-render message events into the combat animation stream: ${JSON.stringify(lowCurrentBloodResult.state.events)}`
);

let exactCurrentBlood = createState(903, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  localLevels: combatLevels({ magic: 92 })
});
exactCurrentBlood = requestLocalSpell(exactCurrentBlood, "blood-barrage");
const exactCurrentBloodResult = advance(exactCurrentBlood);
assert(
  exactCurrentBloodResult.state.events.some(
    (event) => event.kind === "attack" && event.attackerId === "local-player" && event.spellId === "blood-barrage"
  ),
  `current Magic 92 should still cast Blood Barrage at the exact Kronos requirement: ${JSON.stringify(exactCurrentBloodResult.state.events)}`
);

let exactCurrentIce = createState(904, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  localLevels: combatLevels({ magic: 94 })
});
exactCurrentIce = requestLocalSpell(exactCurrentIce, "ice-barrage");
const exactCurrentIceResult = advance(exactCurrentIce);
assert(
  exactCurrentIceResult.state.events.some(
    (event) => event.kind === "attack" && event.attackerId === "local-player" && event.spellId === "ice-barrage"
  ),
  `current Magic 94 should still cast Ice Barrage at the exact Kronos requirement: ${JSON.stringify(exactCurrentIceResult.state.events)}`
);

let lowCurrentAutocast = createState(905, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  localLevels: combatLevels({ magic: 93 })
});
lowCurrentAutocast = runtimeCombat.setRuntimePlayerCombatAutocast(lowCurrentAutocast, "local-player", "ice-barrage", false);
lowCurrentAutocast = requestLocalAttack(lowCurrentAutocast);
const lowCurrentAutocastResult = advance(lowCurrentAutocast);
assert(
  lowCurrentAutocastResult.state.actors["local-player"].autocastSpellId === "ice-barrage" &&
    lowCurrentAutocastResult.state.actors["local-player"].queuedSpellId === null &&
    lowCurrentAutocastResult.state.actors["local-player"].targetId === null &&
    !lowCurrentAutocastResult.state.events.some((event) => event.kind === "attack" && event.attackerId === "local-player"),
  `failed autocast should reset target but keep the persistent autocast selection like PlayerCombat.reset(): ${JSON.stringify(lowCurrentAutocastResult.state.actors["local-player"])}`
);
assert(
  lowCurrentAutocastResult.state.events.every((event) => event.attackerId !== "local-player"),
  `failed autocast should not add non-render message events into the combat animation stream: ${JSON.stringify(lowCurrentAutocastResult.state.events)}`
);

let autocastAttack = createState(121, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
autocastAttack = runtimeCombat.setRuntimePlayerCombatAutocast(autocastAttack, "local-player", "ice-barrage", false);
autocastAttack = requestLocalAttack(autocastAttack);
for (let index = 0; index <= 5; index += 1) {
  autocastAttack = advance(autocastAttack).state;
}
const autocastAttackEvents = autocastAttack.events.filter((event) => event.kind === "attack" && event.attackerId === "local-player");
assert(
  JSON.stringify(autocastAttackEvents.map((event) => event.tick)) === JSON.stringify([0, 5]),
  `explicit autocast should persist and fire on the five-tick magic cooldown: ${JSON.stringify(autocastAttackEvents)}`
);
assert(
  autocastAttackEvents.every((event) => event.spellId === "ice-barrage" && event.autocast === true),
  "explicit autocast events should stay tagged separately from one-shot selected spells"
);
assert(autocastAttack.actors["local-player"].autocastSpellId === "ice-barrage", "explicit autocast should persist after repeated attacks");

let weaponSwitchClearsAutocast = createState(122, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
weaponSwitchClearsAutocast = runtimeCombat.setRuntimePlayerCombatAutocast(
  weaponSwitchClearsAutocast,
  "local-player",
  "ice-barrage",
  true
);
weaponSwitchClearsAutocast = requestLocalAttack(weaponSwitchClearsAutocast);
weaponSwitchClearsAutocast = advance(weaponSwitchClearsAutocast).state;
assert(
  weaponSwitchClearsAutocast.events.some(
    (event) => event.kind === "attack" && event.attackerId === "local-player" && event.spellId === "ice-barrage"
  ),
  "weapon-switch autocast regression setup should start with a real Ice Barrage autocast"
);
weaponSwitchClearsAutocast = runtimeCombat.syncRuntimePlayerCombatStateToInput(weaponSwitchClearsAutocast, {
  tiles: {
    "local-player": weaponSwitchClearsAutocast.actors["local-player"].tile,
    opponent: weaponSwitchClearsAutocast.actors.opponent.tile
  },
  equipment: {
    "local-player": nhLoadouts.nhLoadouts["acb-hides"].equipment
  }
});
assert(
  weaponSwitchClearsAutocast.actors["local-player"].autocastSpellId === null &&
    weaponSwitchClearsAutocast.actors["local-player"].defensiveCast === false,
  "weapon-slot equipment sync should clear stale autocast and defensive casting before the next cooldown opens"
);
for (let index = 0; index <= 5; index += 1) {
  weaponSwitchClearsAutocast = advance(weaponSwitchClearsAutocast).state;
}
const postSwitchMagicAttacks = weaponSwitchClearsAutocast.events.filter(
  (event) => event.kind === "attack" && event.attackerId === "local-player" && event.tick > 0 && event.spellId
);
assert(
  postSwitchMagicAttacks.length === 0,
  `switching away from an autocasting Kodai should not create another magic attack/XP-drop candidate: ${JSON.stringify(postSwitchMagicAttacks)}`
);
assert(
  weaponSwitchClearsAutocast.queuedHits.every((hit) => hit.attackerId !== "local-player" || !hit.spellId),
  `post-switch queued hit candidates should be weapon hits, not stale spell hits: ${JSON.stringify(weaponSwitchClearsAutocast.queuedHits)}`
);

let selectedSpellEquipReset = createState(123, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
selectedSpellEquipReset = advance(requestLocalSpell(selectedSpellEquipReset)).state;
selectedSpellEquipReset = requestLocalSpell(selectedSpellEquipReset);
assert(
  selectedSpellEquipReset.actors["local-player"].queuedSpellId === "ice-barrage",
  "selected spell regression setup should queue a second spell while the first cast cooldown is active"
);
selectedSpellEquipReset = runtimeCombat.resetRuntimePlayerCombatActorTarget(selectedSpellEquipReset, "local-player");
for (let index = 0; index <= 5; index += 1) {
  selectedSpellEquipReset = advance(selectedSpellEquipReset).state;
}
const selectedSpellPostEquipAttacks = selectedSpellEquipReset.events.filter(
  (event) => event.kind === "attack" && event.attackerId === "local-player" && event.tick > 0 && event.spellId
);
assert(
  selectedSpellPostEquipAttacks.length === 0,
  `Equipment.equip resetActions should clear a queued selected spell before the next cooldown opens: ${JSON.stringify(selectedSpellPostEquipAttacks)}`
);

let clientCycleAttack = createState(21, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
clientCycleAttack = requestLocalSpell(clientCycleAttack);
const clientCycleAttackResult = runtimeCombat.advanceRuntimePlayerCombat(clientCycleAttack, {
  tiles: {
    "local-player": clientCycleAttack.actors["local-player"].tile,
    opponent: clientCycleAttack.actors.opponent.tile
  },
  clientCycle: 345
});
assert(
  clientCycleAttackResult.state.actors["local-player"].actionStartedAtClientCycle === 345,
  "attack animation playback should start from the actual client cycle, not restart from a server-tick modulo"
);

let rangedAttack = createState(16, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides"
});
rangedAttack = requestLocalAttack(rangedAttack);
const rangedAttackResult = advance(rangedAttack);
const rangedAttackEvent = rangedAttackResult.state.events.find((event) => event.kind === "attack");
assertAttackAnimationWindow(rangedAttackResult, "local-player", "ACB ranged attack");
assert(rangedAttackEvent?.style === "ranged", "ACB loadout should dispatch a ranged attack style");
assert(rangedAttackEvent?.sequenceName === "crossbow_attack", "ACB ranged attack should play the crossbow sequence");
assert(rangedAttackEvent?.projectile?.id === "dragon_bolt", "ACB dragonstone-bolt loadout should emit the Kronos dragon bolt projectile profile");
assert(rangedAttackEvent?.projectile?.gfxId === 1468, "ACB dragonstone-bolt loadout should use Projectile.DRAGON_BOLT gfx 1468");
assert(rangedAttackEvent?.hitDelayTicks === 2, "ACB bolt hit delay should match Kronos default clientDelay for Projectile.BOLT");
assert(rangedAttackEvent?.projectileDurationCycles === 66, "ACB bolt duration should use source 51 + 5 cycles per extra tile");

let delayedPrayerDamageState = null;
let delayedPrayerQueuedHit = null;
for (let seed = 800; seed < 900; seed += 1) {
  let candidate = createState(seed, {
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "acb-hides",
    opponentPrayers: []
  });
  candidate = requestLocalAttack(candidate);
  const candidateResult = advance(candidate);
  const hit = candidateResult.state.queuedHits.find((queuedHit) => queuedHit.attackerId === "local-player");
  if (hit && hit.damage > 0) {
    delayedPrayerDamageState = candidateResult.state;
    delayedPrayerQueuedHit = hit;
    break;
  }
}
assert(delayedPrayerDamageState && delayedPrayerQueuedHit, "delayed-prayer verifier should find a positive ranged queued hit");
const delayedPrayerXpDrops = runtimeCombat.runtimePlayerCombatXpDropsForDamage(
  delayedPrayerQueuedHit,
  runtimeCombat.runtimePlayerCombatQueuedHitDamage(delayedPrayerDamageState.actors, delayedPrayerQueuedHit, delayedPrayerDamageState.tick)
);
let delayedPrayerAfterDrop = runtimeCombat.setRuntimePlayerCombatPrayers(
  delayedPrayerDamageState,
  "opponent",
  ["protect_from_missiles"]
);
for (let index = 0; index < 2; index += 1) {
  delayedPrayerAfterDrop = advance(delayedPrayerAfterDrop).state;
}
const delayedPrayerHitsplat = delayedPrayerAfterDrop.events.find(
  (event) => event.kind === "hitsplat" && event.id === `${delayedPrayerQueuedHit.id}-hitsplat`
);
assert(
  delayedPrayerHitsplat?.damage === delayedPrayerQueuedHit.damage &&
    delayedPrayerQueuedHit.damage === delayedPrayerQueuedHit.rawDamage &&
    Math.round(delayedPrayerXpDrops.reduce((sum, drop) => sum + drop.xp, 0)) > 0,
  `post-attack prayer changes should not lower the already finalized XP-drop/HIT number or eventual hitsplat: ${JSON.stringify({
    queuedDamage: delayedPrayerQueuedHit.damage,
    queuedRawDamage: delayedPrayerQueuedHit.rawDamage,
    hitsplatDamage: delayedPrayerHitsplat?.damage,
    xpDrops: delayedPrayerXpDrops
  })}`
);

let protectedAtAttackState = null;
let protectedAtAttackQueuedHit = null;
for (let seed = 900; seed < 1000; seed += 1) {
  let candidate = createState(seed, {
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 4, z: 0 },
    localLoadoutId: "acb-hides",
    opponentPrayers: ["protect_from_missiles"]
  });
  candidate = requestLocalAttack(candidate);
  const candidateResult = advance(candidate);
  const hit = candidateResult.state.queuedHits.find((queuedHit) => queuedHit.attackerId === "local-player");
  if (hit && hit.rawDamage > hit.damage && hit.damage > 0) {
    protectedAtAttackState = candidateResult.state;
    protectedAtAttackQueuedHit = hit;
    break;
  }
}
assert(protectedAtAttackState && protectedAtAttackQueuedHit, "protected-at-attack verifier should find a protected positive ranged queued hit");
const protectedAtAttackDamageForDrop = runtimeCombat.runtimePlayerCombatQueuedHitDamage(
  protectedAtAttackState.actors,
  protectedAtAttackQueuedHit,
  protectedAtAttackState.tick
);
const protectedAtAttackXpDrops = runtimeCombat.runtimePlayerCombatXpDropsForDamage(
  protectedAtAttackQueuedHit,
  protectedAtAttackDamageForDrop
);
assert(
  protectedAtAttackDamageForDrop === protectedAtAttackQueuedHit.damage &&
    protectedAtAttackQueuedHit.damage < protectedAtAttackQueuedHit.rawDamage &&
    protectedAtAttackXpDrops.some((drop) => drop.skillId === "ranged" && Math.round(drop.xp) === protectedAtAttackQueuedHit.damage * 4),
  `XP/HIT drops should use prayer-finalized queued damage when protection was active on the attack tick: ${JSON.stringify({
    queuedDamage: protectedAtAttackQueuedHit.damage,
    queuedRawDamage: protectedAtAttackQueuedHit.rawDamage,
    damageForDrop: protectedAtAttackDamageForDrop,
    xpDrops: protectedAtAttackXpDrops
  })}`
);

let acbSpecialAttack = createState(22, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides"
});
const acbSpecialToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(acbSpecialAttack, "local-player");
assert(acbSpecialToggle.mutation === "activate", "ACB special click should activate PlayerCombat.toggleSpecial state");
acbSpecialAttack = requestLocalAttack(acbSpecialToggle.state);
const acbSpecialResult = advance(acbSpecialAttack);
const acbSpecialEvent = acbSpecialResult.state.events.find((event) => event.kind === "attack");
assertAttackAnimationWindow(acbSpecialResult, "local-player", "ACB special attack");
assert(acbSpecialEvent?.specialAttack === "armadyl_crossbow", "ACB special attack event should be tagged as Armadyl crossbow special");
assert(acbSpecialEvent?.projectile?.id === "armadyl_crossbow_special", "ACB special should use the Kronos Armadyl Eye projectile profile");
assert(acbSpecialEvent?.projectile?.gfxId === 301, "ACB special projectile should use gfx 301 from ArmadylCrossbow.java");
assert(acbSpecialEvent?.hitDelayTicks === 2, "ACB special should keep the source projectile client-delay timing");
assert(acbSpecialResult.state.actors["local-player"].gmaul.specialEnergy === 60, "ACB special should drain 40 percent special energy");
assert(acbSpecialResult.state.actors["local-player"].specialActive === false, "ACB special should clear Config.SPECIAL_ACTIVE after use");

let specialRegen = createState(701, {
  localSpecialEnergy: 60
});
for (let index = 0; index < 49; index += 1) {
  specialRegen = advance(specialRegen).state;
}
assert(
  specialRegen.actors["local-player"].gmaul.specialEnergy === 60 &&
    specialRegen.actors["local-player"].specialRestoreTicks === 49,
  `special energy should not restore before Kronos' 50 tick threshold: ${JSON.stringify(specialRegen.actors["local-player"])}`
);
specialRegen = advance(specialRegen).state;
assert(
  specialRegen.actors["local-player"].gmaul.specialEnergy === 70 &&
    specialRegen.actors["local-player"].specialRestoreTicks === 0,
  `special energy should restore 10 percent on the 50th post-attack player tick: ${JSON.stringify(specialRegen.actors["local-player"])}`
);

let acbSpecialRestoreBoundary = createState(702, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  localSpecialEnergy: 40
});
acbSpecialRestoreBoundary = {
  ...acbSpecialRestoreBoundary,
  actors: {
    ...acbSpecialRestoreBoundary.actors,
    "local-player": {
      ...acbSpecialRestoreBoundary.actors["local-player"],
      specialRestoreTicks: 49
    }
  }
};
acbSpecialRestoreBoundary = requestLocalAttack(
  runtimeCombat.toggleRuntimePlayerCombatSpecial(acbSpecialRestoreBoundary, "local-player").state
);
const acbSpecialRestoreBoundaryResult = advance(acbSpecialRestoreBoundary);
assert(
  acbSpecialRestoreBoundaryResult.state.events.some(
    (event) => event.kind === "attack" && event.specialAttack === "armadyl_crossbow"
  ),
  "ACB restore-boundary setup should fire the special before the same tick's special regen"
);
assert(
  acbSpecialRestoreBoundaryResult.state.actors["local-player"].gmaul.specialEnergy === 10 &&
    acbSpecialRestoreBoundaryResult.state.actors["local-player"].specialRestoreTicks === 0,
  `ACB special should drain first, then Kronos post-attack regen should add 10 percent on the same 50th tick: ${JSON.stringify(
    acbSpecialRestoreBoundaryResult.state.actors["local-player"]
  )}`
);

let lowEnergyAcbSpecial = createState(23, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  localSpecialEnergy: 30
});
lowEnergyAcbSpecial = runtimeCombat.toggleRuntimePlayerCombatSpecial(lowEnergyAcbSpecial, "local-player").state;
lowEnergyAcbSpecial = requestLocalAttack(lowEnergyAcbSpecial);
const lowEnergyAcbResult = advance(lowEnergyAcbSpecial);
const lowEnergyAcbEvent = lowEnergyAcbResult.state.events.find((event) => event.kind === "attack");
assert(lowEnergyAcbEvent?.specialAttack === undefined, "low-energy ACB should fall back to a normal attack instead of firing the special");
assert(lowEnergyAcbEvent?.projectile?.id === "dragon_bolt", "low-energy ACB fallback should keep the normal dragon-bolt projectile");
assert(lowEnergyAcbResult.state.actors["local-player"].gmaul.specialEnergy === 30, "low-energy ACB fallback should not drain special energy");
assert(lowEnergyAcbResult.state.actors["local-player"].specialActive === false, "low-energy ACB fallback should clear active special state");

const dragonCrossbowEquipment = {
  ...nhLoadouts.nhLoadouts["acb-hides"].equipment,
  weapon: { itemId: 21902, name: "Dragon crossbow" }
};
const dragonCrossbowNoSpecialState = runtimeCombat.syncRuntimePlayerCombatStateToInput(createState(703, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  localSpecialEnergy: 100
}), {
  tiles: {
    "local-player": { x: 0, z: 0 },
    opponent: { x: 4, z: 0 }
  },
  equipment: {
    "local-player": dragonCrossbowEquipment
  }
});
const dragonCrossbowNoSpecialToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(dragonCrossbowNoSpecialState, "local-player");
assert(
  dragonCrossbowNoSpecialToggle.mutation === "noop-no-special" &&
    dragonCrossbowNoSpecialToggle.state.actors["local-player"].specialActive === false,
  `Dragon crossbow should expose the client spec bar for one-ticking but still have no server special: ${JSON.stringify(dragonCrossbowNoSpecialToggle)}`
);
let dragonCrossbowIntoAgsOneTick = runtimeCombat.syncRuntimePlayerCombatStateToInput(createState(704, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "acb-hides",
  localSpecialEnergy: 100
}), {
  tiles: {
    "local-player": { x: 0, z: 0 },
    opponent: { x: 1, z: 0 }
  },
  equipment: {
    "local-player": dragonCrossbowEquipment
  }
});
dragonCrossbowIntoAgsOneTick = runtimeCombat.syncRuntimePlayerCombatStateToInput(dragonCrossbowIntoAgsOneTick, {
  tiles: {
    "local-player": { x: 0, z: 0 },
    opponent: { x: 1, z: 0 }
  },
  loadouts: {
    "local-player": "ags-bandos"
  },
  equipment: {
    "local-player": nhLoadouts.nhLoadouts["ags-bandos"].equipment
  }
});
const dragonCrossbowIntoAgsToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(dragonCrossbowIntoAgsOneTick, "local-player");
assert(dragonCrossbowIntoAgsToggle.mutation === "activate", "queued DCB-bar spec packet should activate once the same-tick AGS equip is processed first");
const dragonCrossbowIntoAgsResult = advance(requestLocalAttack(dragonCrossbowIntoAgsToggle.state));
const dragonCrossbowIntoAgsEvent = dragonCrossbowIntoAgsResult.state.events.find((event) => event.kind === "attack");
assert(
  dragonCrossbowIntoAgsEvent?.specialAttack === "armadyl_godsword" &&
    dragonCrossbowIntoAgsResult.state.actors["local-player"].gmaul.specialEnergy === 50,
  `Dragon crossbow visible spec bar should support AGS one-tick packet order without giving DCB a special: ${JSON.stringify(dragonCrossbowIntoAgsEvent)}`
);
assert(
  hudSource.includes("combatTabVisibleSpecBarWithoutServerSpecialItemIds") &&
    hudSource.includes("weaponHasCombatTabSpecialBar") &&
    viewerSource.includes("queueCombatSpecialAfterPendingItemPackets"),
  "HUD and packet queue should preserve Dragon crossbow combat-tab spec bar one-tick ordering."
);

let gmaulAttack = createState(14, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
gmaulAttack = requestLocalAttack(gmaulAttack);
const gmaulAttackResult = advance(gmaulAttack);
const gmaulAttackEvent = gmaulAttackResult.state.events.find((event) => event.kind === "attack");
assert(gmaulAttackEvent?.sequenceName === "gmaul_attack", "regular Granite maul attack should use WeaponType.attackAnimation 1665, not the special animation");
assert(
  !gmaulAttackResult.state.events.some((event) => event.kind === "spotanim" && event.spotanimId === 340),
  "regular Granite maul attacks should not emit the special-only source gfx 340"
);

let gmaulSpecial = createState(24, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
const gmaulSpecialToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(gmaulSpecial, "local-player");
assert(gmaulSpecialToggle.mutation === "queue-gmaul", "first Granite maul special click should queue a spec and mark the special bar active");
assert(gmaulSpecialToggle.queuedGraniteMaulSpecs === 1, "first Granite maul click should queue one pending special");
gmaulSpecial = requestLocalAttack(gmaulSpecialToggle.state);
const gmaulSpecialResult = advance(gmaulSpecial);
const gmaulSpecialEvent = gmaulSpecialResult.state.events.find((event) => event.kind === "attack");
assertAttackAnimationWindow(gmaulSpecialResult, "local-player", "Granite maul special attack");
assert(gmaulSpecialEvent?.specialAttack === "granite_maul", "Granite maul queued special should emit a special attack event");
assert(gmaulSpecialEvent?.sequenceName === "gmaul_special", "Granite maul queued special should use GraniteMaul.handle animation 1667");
assert(gmaulSpecialResult.state.events.some((event) => event.kind === "spotanim" && event.spotanimId === 340), "Granite maul special should emit source gfx 340");
assert(gmaulSpecialResult.state.queuedHits.length === 1, "single Granite maul queued spec should create one immediate hit");
assert(gmaulSpecialResult.state.queuedHits[0]?.dueTick === 1, "Granite maul special hit should resolve on the next combat tick");
assert(gmaulSpecialResult.state.actors["local-player"].gmaul.specialEnergy === 50, "Granite maul special should drain 50 percent energy");
assert(gmaulSpecialResult.state.actors["local-player"].specialActive === false, "Granite maul special should clear active special state after use");

let offWeaponGmaul = createState(241, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "tentacle-bandos"
});
offWeaponGmaul = requestLocalAttack(offWeaponGmaul);
const offWeaponWhipResult = advance(offWeaponGmaul);
assert(
  offWeaponWhipResult.state.events.some((event) => event.kind === "attack" && event.sequenceName === "whip_attack"),
  "off-weapon Granite maul verifier should start from a non-maul weapon attack"
);
offWeaponGmaul = runtimeCombat.setRuntimePlayerCombatLoadout(offWeaponWhipResult.state, "local-player", "gmaul-bandos");
offWeaponGmaul = runtimeCombat.resetRuntimePlayerCombatActorTarget(offWeaponGmaul, "local-player");
const offWeaponGmaulToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(offWeaponGmaul, "local-player");
assert(offWeaponGmaulToggle.mutation === "queue-gmaul", "switching to Granite maul after another weapon attack should allow queueing the maul special");
const offWeaponGmaulResult = advance(offWeaponGmaulToggle.state);
const offWeaponGmaulEvent = offWeaponGmaulResult.state.events.find((event) => event.kind === "attack" && event.specialAttack === "granite_maul");
assert(offWeaponGmaulEvent?.sequenceName === "gmaul_special", "queued Granite maul special should fire during the previous weapon delay after switching to the maul");
assert(offWeaponGmaulResult.state.queuedHits.length === 1, "off-weapon Granite maul queue should produce one immediate special hit");
assert(offWeaponGmaulResult.state.actors["local-player"].gmaul.specialEnergy === 50, "off-weapon Granite maul special should drain the same 50 percent energy");

let noSpecWeaponToGmaul = createState(242, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "kodai-robes"
});
noSpecWeaponToGmaul = runtimeCombat.setRuntimePlayerCombatLoadout(noSpecWeaponToGmaul, "local-player", "gmaul-bandos");
const noSpecWeaponToGmaulToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(noSpecWeaponToGmaul, "local-player");
assert(
  noSpecWeaponToGmaulToggle.mutation === "queue-gmaul" &&
    noSpecWeaponToGmaulToggle.queuedGraniteMaulSpecs === 1,
  "server-side Granite maul special action should queue from the current weapon and not reject on the trainer's client-side specbar visibility timer"
);

let diagonalLastTargetGmaul = createState(243, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 1 },
  localLoadoutId: "gmaul-bandos"
});
const diagonalLastTargetToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(diagonalLastTargetGmaul, "local-player");
diagonalLastTargetGmaul = requestLocalAttack(diagonalLastTargetToggle.state);
diagonalLastTargetGmaul = runtimeCombat.resetRuntimePlayerCombatActorTarget(diagonalLastTargetGmaul, "local-player");
const diagonalLastTargetResult = advance(diagonalLastTargetGmaul);
assert(
  diagonalLastTargetResult.state.actors["local-player"].targetId === null &&
    diagonalLastTargetResult.state.queuedHits.length === 0,
  "Granite maul auto-attack should not retarget a diagonal last target; Kronos only auto-targets size-1 players at diffX + diffY == 1"
);

let cardinalLastTargetGmaul = createState(244, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
const cardinalLastTargetToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(cardinalLastTargetGmaul, "local-player");
cardinalLastTargetGmaul = requestLocalAttack(cardinalLastTargetToggle.state);
cardinalLastTargetGmaul = runtimeCombat.resetRuntimePlayerCombatActorTarget(cardinalLastTargetGmaul, "local-player");
const cardinalLastTargetResult = advance(cardinalLastTargetGmaul);
assert(
  cardinalLastTargetResult.state.actors["local-player"].targetId === "opponent" &&
    cardinalLastTargetResult.state.queuedHits.length === 1,
  "Granite maul auto-attack should retarget and fire only when the last target is cardinal-adjacent like Kronos"
);

let outOfRangeDoubleGmaul = createState(245, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
const outOfRangeFirstGmaulClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(outOfRangeDoubleGmaul, "local-player");
const outOfRangeSecondGmaulClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(outOfRangeFirstGmaulClick.state, "local-player");
outOfRangeDoubleGmaul = requestLocalAttack(outOfRangeSecondGmaulClick.state);
const outOfRangeDoubleGmaulRoute = advance(outOfRangeDoubleGmaul);
assert(
  outOfRangeDoubleGmaulRoute.state.actors["local-player"].gmaul.queuedSpecs === 2 &&
    outOfRangeDoubleGmaulRoute.state.queuedHits.length === 0 &&
    outOfRangeDoubleGmaulRoute.routeRequests.some(
      (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 1
    ),
  "out-of-range double Granite maul preload should keep both queued specs and request melee TargetRoute movement"
);
const outOfRangeDoubleGmaulFire = advance(outOfRangeDoubleGmaulRoute.state, {
  local: { x: 3, z: 0 },
  opponent: { x: 4, z: 0 }
});
assert(
  outOfRangeDoubleGmaulFire.state.queuedHits.filter((hit) => hit.weaponId === "granite_maul").length === 2 &&
    outOfRangeDoubleGmaulFire.state.actors["local-player"].gmaul.specialEnergy === 0,
  "out-of-range double Granite maul preload should fire both queued specs after TargetRoute reaches melee distance"
);

let preloadedGmaulNeedsTargetClick = createState(246, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
preloadedGmaulNeedsTargetClick = requestLocalAttack(preloadedGmaulNeedsTargetClick);
preloadedGmaulNeedsTargetClick = runtimeCombat.resetRuntimePlayerCombatActorTarget(preloadedGmaulNeedsTargetClick, "local-player");
const preloadedNeedsTargetFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(preloadedGmaulNeedsTargetClick, "local-player");
const preloadedNeedsTargetSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(preloadedNeedsTargetFirstClick.state, "local-player");
const preloadedNeedsTargetIdle = advance(preloadedNeedsTargetSecondClick.state);
assert(
  preloadedNeedsTargetIdle.state.actors["local-player"].targetId === null &&
    preloadedNeedsTargetIdle.state.actors["local-player"].gmaul.queuedSpecs === 2 &&
    preloadedNeedsTargetIdle.state.queuedHits.length === 0 &&
    preloadedNeedsTargetIdle.routeRequests.length === 0,
  "far last-target double Granite maul preload should not auto-run without a new player click"
);
const preloadedNeedsTargetThirdClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(preloadedNeedsTargetIdle.state, "local-player");
assert(
  preloadedNeedsTargetThirdClick.queuedGraniteMaulSpecs === 3 &&
    preloadedNeedsTargetThirdClick.state.actors["local-player"].targetId === "opponent",
  "third Granite maul click should promote the existing far last-target into the active target route"
);
const preloadedNeedsTargetRoute = advance(preloadedNeedsTargetThirdClick.state);
assert(
  preloadedNeedsTargetRoute.state.actors["local-player"].gmaul.queuedSpecs === 3 &&
    preloadedNeedsTargetRoute.routeRequests.some(
      (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 1
    ),
  "third Granite maul click should use the normal melee TargetRoute request while keeping queued specs until in range"
);
const preloadedNeedsTargetFire = advance(preloadedNeedsTargetRoute.state, {
  local: { x: 3, z: 0 },
  opponent: { x: 4, z: 0 }
});
assert(
  preloadedNeedsTargetFire.state.queuedHits.filter((hit) => hit.weaponId === "granite_maul").length === 2 &&
    preloadedNeedsTargetFire.state.actors["local-player"].gmaul.queuedSpecs === 0,
  "third-click Granite maul auto-target should fire through the existing energy-capped maul consumption once routed into melee range"
);

let delayedPreloadThirdClick = createState(251, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
delayedPreloadThirdClick = requestLocalAttack(delayedPreloadThirdClick);
delayedPreloadThirdClick = runtimeCombat.resetRuntimePlayerCombatActorTarget(delayedPreloadThirdClick, "local-player");
for (let tick = 0; tick < 4; tick += 1) {
  delayedPreloadThirdClick = advance(delayedPreloadThirdClick).state;
}
const delayedPreloadFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(delayedPreloadThirdClick, "local-player");
const delayedPreloadSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(delayedPreloadFirstClick.state, "local-player");
assert(
  delayedPreloadSecondClick.state.actors["local-player"].gmaul.queuedTargetId === "opponent",
  "a delayed double-click preload should bind the currently remembered target for the live Gmaul queue"
);
let delayedPreloadWait = delayedPreloadSecondClick.state;
for (let tick = 0; tick < 2; tick += 1) {
  delayedPreloadWait = advance(delayedPreloadWait).state;
}
assert(
  delayedPreloadWait.actors["local-player"].lastTargetId === null &&
    delayedPreloadWait.actors["local-player"].gmaul.queuedSpecs === 2 &&
    delayedPreloadWait.actors["local-player"].gmaul.timeoutTicks > 0,
  "test setup should leave only the live Gmaul preload target after the normal last-target timeout expires"
);
const delayedPreloadThirdClickResult = runtimeCombat.toggleRuntimePlayerCombatSpecial(delayedPreloadWait, "local-player");
assert(
  delayedPreloadThirdClickResult.state.actors["local-player"].targetId === "opponent" &&
    delayedPreloadThirdClickResult.state.actors["local-player"].gmaul.queuedSpecs === 3,
  "third Granite maul click should send a still-live preload even after the old last-target timeout has expired"
);

let doubleGmaulSpecial = createState(25, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
const firstGmaulClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(doubleGmaulSpecial, "local-player");
const secondGmaulClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(firstGmaulClick.state, "local-player");
assert(secondGmaulClick.mutation === "deactivate-queue-gmaul", "second active Granite maul click should deactivate and queue another spec like Kronos");
assert(secondGmaulClick.queuedGraniteMaulSpecs === 2, "two Granite maul clicks should queue two special hits before combat consumes them");
doubleGmaulSpecial = requestLocalAttack(secondGmaulClick.state);
const doubleGmaulResult = advance(doubleGmaulSpecial);
assert(doubleGmaulResult.state.queuedHits.length === 2, "two queued Granite maul specs should create two immediate hit rolls");
assert(doubleGmaulResult.state.actors["local-player"].gmaul.specialEnergy === 0, "two Granite maul specs should consume 100 percent special energy");

let inRangeTripleClickGmaul = createState(250, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
inRangeTripleClickGmaul = requestLocalAttack(inRangeTripleClickGmaul);
inRangeTripleClickGmaul = runtimeCombat.resetRuntimePlayerCombatActorTarget(inRangeTripleClickGmaul, "local-player");
const inRangeTripleFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(inRangeTripleClickGmaul, "local-player");
const inRangeTripleSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(inRangeTripleFirstClick.state, "local-player");
const inRangeTripleThirdClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(inRangeTripleSecondClick.state, "local-player");
const inRangeTripleClickResult = advance(inRangeTripleThirdClick.state);
assert(
  inRangeTripleThirdClick.state.actors["local-player"].targetId === "opponent" &&
    inRangeTripleClickResult.state.queuedHits.filter((hit) => hit.weaponId === "granite_maul").length === 2,
  "third Granite maul click should auto-target and immediately fire when the existing last target is already in melee range"
);

let tripleGmaulSpecial = createState(247, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
const tripleGmaulFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(tripleGmaulSpecial, "local-player");
const tripleGmaulSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(tripleGmaulFirstClick.state, "local-player");
const tripleGmaulThirdClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(tripleGmaulSecondClick.state, "local-player");
assert(tripleGmaulThirdClick.queuedGraniteMaulSpecs === 3, "three Granite maul clicks should queue three attempts before Kronos energy caps consumption");
tripleGmaulSpecial = requestLocalAttack(tripleGmaulThirdClick.state);
const tripleGmaulResult = advance(tripleGmaulSpecial);
assert(
  tripleGmaulResult.state.queuedHits.filter((hit) => hit.weaponId === "granite_maul").length === 2 &&
    tripleGmaulResult.state.actors["local-player"].gmaul.queuedSpecs === 0 &&
    tripleGmaulResult.state.actors["local-player"].gmaul.specialEnergy === 0,
  "three queued Granite maul clicks at 100 percent energy should consume at most two specs, matching Kronos energy / 500 cap"
);

let staleGmaulQueueMeleeFallthrough = createState(248, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
const staleGmaulFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(staleGmaulQueueMeleeFallthrough, "local-player");
const staleGmaulSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(staleGmaulFirstClick.state, "local-player");
staleGmaulQueueMeleeFallthrough = runtimeCombat.setRuntimePlayerCombatLoadout(
  staleGmaulSecondClick.state,
  "local-player",
  "tentacle-bandos"
);
staleGmaulQueueMeleeFallthrough = requestLocalAttack(staleGmaulQueueMeleeFallthrough);
const staleGmaulQueueMeleeFallthroughResult = advance(staleGmaulQueueMeleeFallthrough);
const staleGmaulQueueMeleeFallthroughAttack = staleGmaulQueueMeleeFallthroughResult.state.events.find(
  (event) => event.kind === "attack" && event.attackerId === "local-player"
);
assert(
  staleGmaulQueueMeleeFallthroughAttack?.sequenceName === "whip_attack" &&
    staleGmaulQueueMeleeFallthroughAttack?.specialAttack === undefined &&
    staleGmaulQueueMeleeFallthroughResult.state.actors["local-player"].gmaul.queuedSpecs === 0 &&
    staleGmaulQueueMeleeFallthroughResult.state.actors["local-player"].gmaul.specialEnergy === 100,
  "queued Granite maul specs should be cleared by the Kronos melee fallthrough path when attacking with a non-maul melee weapon"
);

let staleGmaulQueueWeaponSwap = createState(251, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
staleGmaulQueueWeaponSwap = requestLocalAttack(staleGmaulQueueWeaponSwap);
staleGmaulQueueWeaponSwap = runtimeCombat.resetRuntimePlayerCombatActorTarget(staleGmaulQueueWeaponSwap, "local-player");
const staleSwapFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(staleGmaulQueueWeaponSwap, "local-player");
const staleSwapSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(staleSwapFirstClick.state, "local-player");
staleGmaulQueueWeaponSwap = runtimeCombat.setRuntimePlayerCombatLoadout(
  staleSwapSecondClick.state,
  "local-player",
  "acb-hides"
);
assert(
  staleGmaulQueueWeaponSwap.actors["local-player"].gmaul.queuedSpecs === 0,
  "swapping away from Granite maul should cancel the preloaded spec queue instead of preserving stale clicks"
);
staleGmaulQueueWeaponSwap = runtimeCombat.setRuntimePlayerCombatLoadout(
  staleGmaulQueueWeaponSwap,
  "local-player",
  "gmaul-bandos"
);
const staleSwapFreshClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(staleGmaulQueueWeaponSwap, "local-player");
assert(
  staleSwapFreshClick.queuedGraniteMaulSpecs === 1 &&
    staleSwapFreshClick.state.actors["local-player"].targetId === null,
  "swapping back to Granite maul and clicking once should start a fresh single queue, not unload the old double preload"
);

let acbIntoOutOfRangeGmaul = createState(249, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides"
});
acbIntoOutOfRangeGmaul = requestLocalAttack(acbIntoOutOfRangeGmaul);
const acbIntoOutOfRangeShot = advance(acbIntoOutOfRangeGmaul);
assert(
  acbIntoOutOfRangeShot.state.events.some((event) => event.kind === "attack" && event.style === "ranged"),
  "ACB to Granite maul out-of-range verifier should start from a ranged hit"
);
acbIntoOutOfRangeGmaul = runtimeCombat.setRuntimePlayerCombatLoadout(
  acbIntoOutOfRangeShot.state,
  "local-player",
  "gmaul-bandos"
);
acbIntoOutOfRangeGmaul = runtimeCombat.resetRuntimePlayerCombatActorTarget(acbIntoOutOfRangeGmaul, "local-player");
const acbIntoGmaulFirstClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(acbIntoOutOfRangeGmaul, "local-player");
const acbIntoGmaulSecondClick = runtimeCombat.toggleRuntimePlayerCombatSpecial(acbIntoGmaulFirstClick.state, "local-player");
const acbIntoGmaulRoute = advance(requestLocalAttack(acbIntoGmaulSecondClick.state));
assert(
  acbIntoGmaulRoute.state.actors["local-player"].gmaul.queuedSpecs === 2 &&
    acbIntoGmaulRoute.routeRequests.some(
      (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 1
    ),
  "ACB into double Granite maul should preload both specs while routing from out of range after the opponent click"
);
const acbIntoGmaulFire = advance(acbIntoGmaulRoute.state, {
  local: { x: 3, z: 0 },
  opponent: { x: 4, z: 0 }
});
assert(
  acbIntoGmaulFire.state.queuedHits.filter((hit) => hit.weaponId === "granite_maul").length === 2,
  "ACB into double Granite maul should fire both queued specs once melee route reaches the opponent even during the ACB cooldown"
);

let frozenUnderGmaulSpecial = createState(26, {
  localTile: { x: 1, z: 1 },
  opponentTile: { x: 1, z: 1 },
  localLoadoutId: "gmaul-bandos"
});
frozenUnderGmaulSpecial = {
  ...frozenUnderGmaulSpecial,
  actors: {
    ...frozenUnderGmaulSpecial.actors,
    "local-player": {
      ...frozenUnderGmaulSpecial.actors["local-player"],
      locks: {
        ...frozenUnderGmaulSpecial.actors["local-player"].locks,
        freezeUntilTick: 27
      }
    }
  }
};
const frozenUnderGmaulToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(frozenUnderGmaulSpecial, "local-player");
frozenUnderGmaulSpecial = requestLocalAttack(frozenUnderGmaulToggle.state);
const frozenUnderGmaulResult = advance(frozenUnderGmaulSpecial);
assert(frozenUnderGmaulResult.state.queuedHits.length === 0, "frozen same-tile Granite maul special should not queue a hit from underneath the target");
assert(
  !frozenUnderGmaulResult.state.events.some((event) => event.kind === "attack" && event.specialAttack === "granite_maul"),
  "frozen same-tile Granite maul special should not emit the special attack event"
);
assert(
  frozenUnderGmaulResult.state.actors["local-player"].gmaul.specialEnergy === 100,
  "frozen same-tile Granite maul special should not drain special energy"
);
assert(
  frozenUnderGmaulResult.routeRequests.some(
    (request) => request.actorId === "local-player" && request.reason === "out-of-range" && request.attackRange === 1
  ),
  "frozen same-tile Granite maul special should keep TargetRoute-style walk-out request instead of treating underneath as reachable"
);

let frozenTwoTileGmaulSpecial = createState(261, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 1, z: 0 },
  localLoadoutId: "gmaul-bandos"
});
frozenTwoTileGmaulSpecial = freezeActor(frozenTwoTileGmaulSpecial, "local-player", 20);
const frozenTwoTileGmaulToggle = runtimeCombat.toggleRuntimePlayerCombatSpecial(frozenTwoTileGmaulSpecial, "local-player");
frozenTwoTileGmaulSpecial = requestLocalAttack(frozenTwoTileGmaulToggle.state);
const frozenTwoTileGmaulResult = runtimeCombat.advanceRuntimePlayerCombat(frozenTwoTileGmaulSpecial, {
  tiles: {
    "local-player": frozenTwoTileGmaulSpecial.actors["local-player"].tile,
    opponent: frozenTwoTileGmaulSpecial.actors.opponent.tile
  },
  tileScale: 0.5
});
assert(
  frozenTwoTileGmaulResult.state.queuedHits.length === 0 &&
    !frozenTwoTileGmaulResult.state.events.some((event) => event.kind === "attack" && event.specialAttack === "granite_maul") &&
    frozenTwoTileGmaulResult.state.actors["local-player"].gmaul.specialEnergy === 100,
  "frozen two-tile Granite maul step-in should not queue or drain a special attack"
);

let opponentAttack = createState(15, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides"
});
opponentAttack = requestOpponentAttack(opponentAttack);
const opponentAttackResult = advance(opponentAttack);
assert(opponentAttackResult.state.queuedHits.length === 1, "opponent Attack should be able to queue hits against the local player");
assert(
  opponentAttackResult.state.events.some((event) => event.kind === "attack" && event.attackerId === "opponent"),
  "opponent Attack should emit attack events just like local Attack"
);

let cooldown = createState(13);
cooldown = requestLocalAttack(cooldown);
let cooldownResult = advance(cooldown);
const queuedAfterFirst = cooldownResult.state.queuedHits.length;
cooldownResult = advance(cooldownResult.state);
assert(
  cooldownResult.state.queuedHits.length <= queuedAfterFirst,
  "weapon cooldown should stop immediate repeated attack queuing on the next tick"
);
assert(
  JSON.stringify(attackEventTicksFor("kodai-robes", 5, { local: { x: 0, z: 0 }, opponent: { x: 4, z: 0 } }, { spellId: "ice-barrage" })) === JSON.stringify([0]),
  "selected one-shot magic should emit one cast animation and then clear instead of autocasting"
);
assert(
  JSON.stringify(attackEventTicksFor("kodai-robes", 4, { local: { x: 0, z: 0 }, opponent: { x: 1, z: 0 } })) === JSON.stringify([0, 4]),
  "Kodai default WAND attack should use the four-tick Kronos melee cooldown"
);
assert(
  JSON.stringify(attackEventTicksFor("acb-hides", 6, { local: { x: 0, z: 0 }, opponent: { x: 4, z: 0 } })) === JSON.stringify([0, 6]),
  "ACB accurate/longrange should use the six-tick Kronos WeaponType.attackTicks cooldown"
);
assert(
  JSON.stringify(attackEventTicksFor("acb-hides", 5, { local: { x: 0, z: 0 }, opponent: { x: 4, z: 0 } }, { attackSetIndex: 1 })) === JSON.stringify([0, 5]),
  "ACB rapid style should apply Kronos PlayerCombat's one-tick ranged reduction"
);
let attackSetPersistence = createState(140, {
  localLoadoutId: "acb-hides",
  localAttackSetIndex: 0
});
attackSetPersistence = runtimeCombat.setRuntimePlayerCombatAttackSet(attackSetPersistence, "local-player", 1);
attackSetPersistence = runtimeCombat.setRuntimePlayerCombatLoadout(attackSetPersistence, "local-player", "tentacle-bandos");
assert(
  attackSetPersistence.actors["local-player"].attackSetIndex === 1,
  "weapon switches should preserve Config.ATTACK_SET instead of resetting to Accurate"
);
attackSetPersistence = runtimeCombat.setRuntimePlayerCombatLoadout(attackSetPersistence, "local-player", "acb-hides");
assert(
  attackSetPersistence.actors["local-player"].attackSetIndex === 1,
  "switching back to ACB should keep Rapid selected like Kronos varp 43"
);
const attackSetNullSlotResolved = createState(141, {
  localLoadoutId: "acb-hides",
  localAttackSetIndex: 2
});
assert(
  attackSetNullSlotResolved.actors["local-player"].attackSetIndex === 1,
  "Kronos null attack-set child 11 should resolve backward to the previous visible attack style"
);
assert(
  JSON.stringify(attackEventTicksFor("tentacle-bandos", 4, { local: { x: 0, z: 0 }, opponent: { x: 1, z: 0 } })) === JSON.stringify([0, 4]),
  "whip should emit one attack animation per four-tick Kronos attack cooldown"
);
assert(
  JSON.stringify(attackEventTicksFor("gmaul-bandos", 7, { local: { x: 0, z: 0 }, opponent: { x: 1, z: 0 } })) === JSON.stringify([0, 7]),
  "Granite maul regular attacks should use the seven-tick Kronos WeaponType.attackTicks cooldown"
);

assert(
  targetSpellSource.includes("target.freeze(seconds, hit.attacker)") &&
    targetSpellSource.indexOf("int damage = target.hit(hit);") < targetSpellSource.indexOf("afterHit(hit, target);"),
  "Kronos TargetSpell should roll/queue damage, then apply Ice Barrage hold immediately through afterHit"
);
assert(
  entitySource.includes("freezer.getPosition().isWithinDistance(getPosition(), false, 12)") &&
    positionSource.includes("Math.abs(x - other.x) <= distance && Math.abs(y - other.y) <= distance"),
  "Kronos freeze break should use Entity.isMovementBlocked freezer Chebyshev distance 12"
);

let freezeOnCastResult = null;
for (let seed = 1; seed < 1000; seed += 1) {
  let freezeOnCast = createState(seed, {
    localTile: { x: 0, z: 0 },
    opponentTile: { x: 10, z: 0 },
    localLoadoutId: "kodai-robes",
    opponentLoadoutId: "acb-hides"
  });
  freezeOnCast = requestLocalSpell(freezeOnCast);
  const result = advance(freezeOnCast);
  if (entityLocks.isFrozen(result.state.actors.opponent.locks, result.state.tick)) {
    freezeOnCastResult = result;
    break;
  }
}
assert(freezeOnCastResult, "Ice Barrage should apply freeze on the cast tick when the rolled hit is non-zero");
assert(
  freezeOnCastResult.state.queuedHits.length === 1 &&
    freezeOnCastResult.state.queuedHits[0].spellId === "ice-barrage" &&
    freezeOnCastResult.state.queuedHits[0].freezeDurationTicks === undefined,
  "Ice Barrage queued damage should not carry a second delayed freeze after the source immediate hold"
);

let distantFreezeBreak = createState(44, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 13, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides"
});
distantFreezeBreak = freezeActor(distantFreezeBreak, "opponent", distantFreezeBreak.tick + 30, "local-player");
const distantFreezeBreakResult = advance(distantFreezeBreak);
assert(
  !entityLocks.isFrozen(distantFreezeBreakResult.state.actors.opponent.locks, distantFreezeBreakResult.state.tick),
  "freeze should reset once the freezer is outside Kronos' distance-12 break range"
);

let inRangeFreezeHeld = createState(45, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 12, z: 0 },
  localLoadoutId: "kodai-robes",
  opponentLoadoutId: "acb-hides"
});
inRangeFreezeHeld = freezeActor(inRangeFreezeHeld, "opponent", inRangeFreezeHeld.tick + 30, "local-player");
const inRangeFreezeHeldResult = advance(inRangeFreezeHeld);
assert(
  entityLocks.isFrozen(inRangeFreezeHeldResult.state.actors.opponent.locks, inRangeFreezeHeldResult.state.tick),
  "freeze should remain while the freezer is still inside Kronos' inclusive distance-12 break range"
);

let preMovementFreeze = createState(43, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
preMovementFreeze = {
  ...preMovementFreeze,
  queuedHits: [
    {
      id: "pre-movement-freeze",
      dueTick: preMovementFreeze.tick,
      attackerId: "opponent",
      defenderId: "local-player",
      style: "magic",
      attackType: "ACCURATE",
      attackSetIndex: 0,
      damage: 1,
      rawDamage: 1,
      maxDamage: 1,
      hitChance: 1,
      freezeDurationTicks: runtimeCombat.runtimePlayerCombatIceBarrageFreezeTicks
    }
  ]
};
const preMovementFreezeApplied = runtimeCombat.applyRuntimePlayerCombatPreMovementHits(preMovementFreeze, {
  tiles: {
    "local-player": preMovementFreeze.actors["local-player"].tile,
    opponent: preMovementFreeze.actors.opponent.tile
  }
});
assert(preMovementFreezeApplied.applied, "due freeze hit should apply during the pre-movement hit phase");
assert(preMovementFreezeApplied.state.tick === preMovementFreeze.tick, "pre-movement hit phase should not advance the game tick");
assert(preMovementFreezeApplied.state.queuedHits.length === 0, "pre-movement hit phase should remove due hits before the combat attack phase");
assert(
  preMovementFreezeApplied.state.actors["local-player"].locks.freezeUntilTick ===
    preMovementFreeze.tick + runtimeCombat.runtimePlayerCombatIceBarrageFreezeTicks,
  "pre-movement hit phase should apply Ice Barrage freeze before route movement can consume another step"
);
const preMovementFreezeAdvanced = advance(preMovementFreezeApplied.state);
assert(
  preMovementFreezeAdvanced.state.events.filter((event) => event.id === "pre-movement-freeze-hitsplat").length === 1,
  "pre-applied freeze hits should not be replayed by the later combat attack phase"
);

let walkResetState = createState(17, {
  localTile: { x: 0, z: 0 },
  opponentTile: { x: 4, z: 0 },
  localLoadoutId: "kodai-robes"
});
walkResetState = requestLocalSpell(walkResetState);
const walkResetAttack = advance(walkResetState).state;
const walkResetQueuedHits = walkResetAttack.queuedHits.length;
const walkResetCleared = runtimeCombat.resetRuntimePlayerCombatActorTarget(walkResetAttack, "local-player");
assert(walkResetCleared.actors["local-player"].targetId === null, "manual walk reset should clear the local combat target");
assert(
  walkResetCleared.actors["local-player"].actionSequenceName === "barrage_cast",
  "manual walk reset should preserve a primary attack animation that Kronos already launched"
);
assert(
  walkResetCleared.queuedHits.length === walkResetQueuedHits,
  "manual walk reset should not delete damage that Kronos already launched"
);
let walkResetAdvanced = walkResetCleared;
for (let index = 0; index < 6; index += 1) {
  walkResetAdvanced = advance(walkResetAdvanced, { local: { x: 1, z: 0 } }).state;
}
assert(
  walkResetAdvanced.events.filter((event) => event.kind === "attack" && event.attackerId === "local-player").length === 1,
  "after a manual walk reset, local combat should not keep auto-attacking until another Attack command is sent"
);
assert(
  runtimeCombat.runtimePlayerCombatHitsplatEndTick(0) === 2,
  "manual combat hitsplats should convert the default 50 client-cycle lifetime through 30 client cycles per game tick"
);
assert(
  runtimeCombat.runtimePlayerCombatHealthBarEndTick(0) === 10,
  "manual combat health bars should convert the source 300 client-cycle player health-bar lifetime through game ticks"
);

let seedWithDamage = 1;
let unprotectedDamage = 0;
for (; seedWithDamage < 1000; seedWithDamage += 1) {
  unprotectedDamage = damageFromState(seedWithDamage);
  if (unprotectedDamage > 0) {
    break;
  }
}
assert(unprotectedDamage > 0, "test should find a deterministic seed that produces ranged damage");
const protectedDamage = damageFromState(seedWithDamage, ["protect_from_missiles"]);
assert(
  protectedDamage === Math.trunc(unprotectedDamage * prayers.pvpProtectionDamageMultiplier),
  "PvP protection prayer should reduce visible ranged damage through the shared prayer reducer"
);
let protectSnapshotState = createState(seedWithDamage, { opponentPrayers: ["protect_from_missiles"] });
protectSnapshotState = requestLocalAttack(protectSnapshotState);
let protectSnapshotAttack = advance(protectSnapshotState).state;
const protectSnapshotHit = protectSnapshotAttack.queuedHits[0];
assert(protectSnapshotHit, "protected queued hit should exist for prayer snapshot regression");
assert(
  protectSnapshotHit.defenderProtectionPrayer === "protect_from_missiles" &&
    protectSnapshotHit.damage === Math.trunc(protectSnapshotHit.rawDamage * prayers.pvpProtectionDamageMultiplier),
  `queued hit should store Kronos finalized on-prayer damage at attack time: ${JSON.stringify(protectSnapshotHit)}`
);
protectSnapshotAttack = {
  ...protectSnapshotAttack,
  actors: {
    ...protectSnapshotAttack.actors,
    opponent: {
      ...protectSnapshotAttack.actors.opponent,
      activePrayers: []
    }
  }
};
assert(
  runtimeCombat.runtimePlayerCombatQueuedHitDamage(
    protectSnapshotAttack.actors,
    protectSnapshotHit,
    protectSnapshotAttack.tick
  ) === protectSnapshotHit.damage,
  "queued-hit XP preview should keep the finalized on-prayer damage after the defender changes prayer"
);
while (protectSnapshotAttack.queuedHits.some((hit) => hit.id === protectSnapshotHit.id)) {
  protectSnapshotAttack = advance(protectSnapshotAttack).state;
}
const protectSnapshotHitsplat = protectSnapshotAttack.events.find(
  (event) => event.kind === "hitsplat" && event.id === `${protectSnapshotHit.id}-hitsplat`
);
assert(
  protectSnapshotHitsplat?.damage === protectSnapshotHit.damage,
  `hitsplat should consume the same finalized on-prayer damage as the queued XP drop: ${JSON.stringify({
    queued: protectSnapshotHit,
    hitsplat: protectSnapshotHitsplat
  })}`
);
let latePrayerState = createState(seedWithDamage);
latePrayerState = requestLocalAttack(latePrayerState);
let latePrayerAttack = advance(latePrayerState).state;
const latePrayerHit = latePrayerAttack.queuedHits[0];
assert(latePrayerHit, "unprotected queued hit should exist for late-prayer regression");
assert(
  latePrayerHit.damage === latePrayerHit.rawDamage && latePrayerHit.defenderProtectionPrayer === undefined,
  `queued hit should store unprotected damage before any later prayer change: ${JSON.stringify(latePrayerHit)}`
);
latePrayerAttack = {
  ...latePrayerAttack,
  actors: {
    ...latePrayerAttack.actors,
    opponent: {
      ...latePrayerAttack.actors.opponent,
      activePrayers: ["protect_from_missiles"]
    }
  }
};
assert(
  runtimeCombat.runtimePlayerCombatQueuedHitDamage(latePrayerAttack.actors, latePrayerHit, latePrayerAttack.tick) ===
    latePrayerHit.damage,
  "queued-hit XP preview should not be lowered by a prayer switched on after the attack was launched"
);
while (latePrayerAttack.queuedHits.some((hit) => hit.id === latePrayerHit.id)) {
  latePrayerAttack = advance(latePrayerAttack).state;
}
const latePrayerHitsplat = latePrayerAttack.events.find(
  (event) => event.kind === "hitsplat" && event.id === `${latePrayerHit.id}-hitsplat`
);
assert(
  latePrayerHitsplat?.damage === latePrayerHit.damage,
  `hitsplat should not be lowered by a late prayer after the queued XP drop was emitted: ${JSON.stringify({
    queued: latePrayerHit,
    hitsplat: latePrayerHitsplat
  })}`
);

const sampledMaxes = {};
for (const [loadoutId, tiles] of Object.entries({
  "kodai-robes": { local: { x: 0, z: 0 }, opponent: { x: 1, z: 0 } },
  "acb-hides": { local: { x: 0, z: 0 }, opponent: { x: 4, z: 0 } },
  "tentacle-bandos": { local: { x: 0, z: 0 }, opponent: { x: 1, z: 0 } },
  "gmaul-bandos": { local: { x: 0, z: 0 }, opponent: { x: 1, z: 0 } }
})) {
  let maxObserved = 0;
  let formulaMax = 0;
  for (let seed = 1; seed <= 1500; seed += 1) {
    let state = createState(seed, {
      localTile: tiles.local,
      opponentTile: tiles.opponent,
      localLoadoutId: loadoutId,
      opponentLoadoutId: "kodai-robes"
    });
    state = requestLocalAttack(state);
    const result = advance(state);
    const hit = result.state.queuedHits[0];
    assert(hit, `${loadoutId} should queue one hit while sampling damage`);
    const estimate = runtimeCombat.runtimePlayerCombatDamageEstimate(
      result.state.actors["local-player"],
      result.state.actors.opponent,
      hit.style
    );
    formulaMax = Math.max(formulaMax, estimate.maxDamage);
    maxObserved = Math.max(maxObserved, hit.rawDamage);
    assert(hit.rawDamage <= estimate.maxDamage, `${loadoutId} raw damage must not exceed the visible Kronos formula max`);
  }
  sampledMaxes[loadoutId] = { maxObserved, formulaMax };
}
assert(
  Object.values(sampledMaxes).every((entry) => entry.formulaMax < 60),
  "NH runtime loadouts should not produce impossible 80+ manual hits from the visible formula"
);
assert(sampledMaxes["kodai-robes"].formulaMax < 38, `Kodai wand default crush should not inherit the Ice Barrage max hit: ${JSON.stringify(sampledMaxes["kodai-robes"])}`);
const sampledBarrageEstimate = runtimeCombat.runtimePlayerCombatDamageEstimate(
  magicAttackResult.state.actors["local-player"],
  magicAttackResult.state.actors.opponent,
  "magic"
);
assert(sampledBarrageEstimate.maxDamage === 38, `Selected Ice Barrage max should stay source-backed at 38 for this loadout: ${JSON.stringify(sampledBarrageEstimate)}`);

const staleDeathSupplies = {
  ...runtimeCombat.runtimePlayerCombatDefaultSupplies,
  manta_ray: 0,
  karambwan: 0,
  saradomin_brew: 0,
  super_restore: 0
};
const staleDeathSupplyDelays = {
  eatDelayUntilTick: 99,
  karambwanDelayUntilTick: 99,
  potionDelayUntilTick: 99
};
const lethalBaseState = createState(19);
const lethalState = {
  ...lethalBaseState,
  actors: {
    ...lethalBaseState.actors,
    opponent: {
      ...lethalBaseState.actors.opponent,
      targetId: "local-player",
      lastTargetId: "local-player",
      lastTargetTimeoutTicks: 5,
      policyOffenceStyle: "melee",
      policyNextLoadoutSyncTick: 19,
      policyNextFreezeAttemptTick: 23,
      policyStalledStyle: "ranged",
      policyStalledStyleTicks: 4,
      queuedSpellId: "ice-barrage",
      autocastSpellId: "blood-barrage",
      defensiveCast: true,
      supplies: staleDeathSupplies,
      supplyDelays: staleDeathSupplyDelays,
      activePrayers: ["protect_from_magic", "augury"]
    }
  },
  queuedHits: [
    {
      id: "manual-lethal",
      dueTick: 0,
      attackerId: "local-player",
      defenderId: "opponent",
      style: "slash",
      attackType: "AGGRESSIVE",
      attackSetIndex: 0,
      damage: 99,
      rawDamage: 99,
      maxDamage: 99,
      hitChance: 1
    }
  ]
};
const lethalResult = advance(lethalState);
const lethalOpponent = lethalResult.state.actors.opponent;
assert(lethalOpponent.hitpoints === 0, "lethal hit should set target hitpoints to zero");
assert(lethalOpponent.deadUntilTick !== null, "lethal hit should schedule a death reset");
assert(
  lethalResult.state.events.some((event) => event.kind === "death" && event.actorId === "opponent"),
  "lethal hit should emit a death event"
);
assert(
  lethalResult.state.combatStartTick === (lethalOpponent.deadUntilTick ?? 0) + runtimeCombat.runtimePlayerCombatFightCountdownTicks,
  `death should schedule the next rematch countdown after respawn: ${JSON.stringify({
    combatStartTick: lethalResult.state.combatStartTick,
    deadUntilTick: lethalOpponent.deadUntilTick
  })}`
);
assert(
  nhStakerBotSource.includes("resetForDeath();") &&
    nhStakerBotSource.includes("private void resetForDeath()") &&
    nhStakerBotSource.includes("player.getCombat().reset();") &&
    playerCombatSource.includes("public void reset()") &&
    playerCombatSource.includes("queuedSpell = null;") &&
    runtimeCombatSource.includes("function resetRuntimePlayerCombatActorPolicyDeath") &&
    runtimeCombatSource.includes("resetForDeath() as soon as the bot is dead"),
  "runtime lethal hit should stay source-anchored to NhStakerBot.resetForDeath and PlayerCombat.reset"
);
assert(
  lethalOpponent.targetId === null &&
    lethalOpponent.lastTargetId === null &&
    lethalOpponent.lastTargetTimeoutTicks === 0 &&
    lethalOpponent.policyOffenceStyle === undefined &&
    lethalOpponent.policyNextLoadoutSyncTick === 0 &&
    lethalOpponent.policyNextFreezeAttemptTick === 0 &&
    lethalOpponent.policyStalledStyle === null &&
    lethalOpponent.policyStalledStyleTicks === 0 &&
    lethalOpponent.queuedSpellId === null &&
    lethalOpponent.activePrayers.length === 0 &&
    lethalOpponent.supplies.manta_ray === 0 &&
    lethalOpponent.supplyDelays.eatDelayUntilTick === 99,
  `lethal hit should apply Java resetForDeath policy cleanup immediately while leaving inventory restore for respawn: ${JSON.stringify(lethalOpponent)}`
);
const respawnTick = lethalOpponent.deadUntilTick;
const staleRespawnState = {
  ...lethalResult.state,
  tick: respawnTick,
  actors: {
    ...lethalResult.state.actors,
    opponent: {
      ...lethalResult.state.actors.opponent,
      targetId: "local-player",
      lastTargetId: "local-player",
      lastTargetTimeoutTicks: 5,
      policyOffenceStyle: "melee",
      policyStalledStyle: "ranged",
      policyStalledStyleTicks: 4,
      queuedSpellId: "ice-barrage",
      autocastSpellId: "blood-barrage",
      defensiveCast: true,
      levels: { attack: 43, strength: 42, defence: 41, ranged: 44, magic: 45 },
      prayerPoints: 12,
      activePrayers: ["protect_from_magic", "augury"],
      locks: entityLocks.applyFreeze(entityLocks.createEntityLockState(), 0, 12, "local-player"),
      supplies: staleDeathSupplies,
      supplyDelays: staleDeathSupplyDelays,
      specialActive: true,
      gmaul: {
        ...lethalResult.state.actors.opponent.gmaul,
        equippedGraniteMaul: true,
        previousWeaponHadVisibleSpecBar: true,
        gmaulEquippedTick: 0,
        specBarVisibleTick: 0,
        queuedSpecs: 2,
        timeoutTicks: 4,
        specialEnergy: 0,
        queuedTargetId: "local-player"
      }
    }
  }
};
const respawnSynced = runtimeCombat.syncRuntimePlayerCombatStateToInput(staleRespawnState, {
  tiles: {
    "local-player": staleRespawnState.actors["local-player"].tile,
    opponent: staleRespawnState.actors.opponent.tile
  }
});
const respawnedOpponent = respawnSynced.actors.opponent;
assert(
  playerCombatSource.includes("public void restore()") &&
    playerCombatSource.includes("player.getStats().restore(true);") &&
    playerCombatSource.includes("player.getPrayer().deactivateAll();") &&
    playerCombatSource.includes("player.resetFreeze();") &&
    playerCombatSource.includes("restoreSpecial(100);") &&
    nhStakerBotSource.includes("private void prepareFreshState(boolean restoreStatsAndHp)") &&
    nhStakerBotSource.includes("clearAutocast();") &&
    nhStakerBotSource.includes("player.getCombat().reset();") &&
    nhStakerLoadoutSource.includes("public static SelectedWeapons prepareBot(Player player") &&
    nhStakerLoadoutSource.includes("SelectedWeapons selected = applyBot(player, preferredSource);") &&
    nhStakerLoadoutSource.includes("place(player, 5, MANTA_RAY, 1);") &&
    runtimeCombatSource.includes("PlayerCombat.restore() and NhStakerBot.prepareFreshState() clear combat") &&
    runtimeCombatSource.includes("supplies: runtimePlayerCombatDefaultSupplies") &&
    runtimeCombatSource.includes("gmaul: createGmaulSpecState(100)"),
  "runtime respawn reset should stay source-anchored to Kronos PlayerCombat.restore and NhStakerBot.prepareFreshState"
);
assert(
  respawnedOpponent.hitpoints === respawnedOpponent.maxHitpoints &&
    respawnedOpponent.deadUntilTick === null &&
    respawnedOpponent.targetId === null &&
    respawnedOpponent.lastTargetId === null &&
    respawnedOpponent.lastTargetTimeoutTicks === 0 &&
    respawnedOpponent.policyOffenceStyle === undefined &&
    respawnedOpponent.policyStalledStyle === null &&
    respawnedOpponent.policyStalledStyleTicks === 0 &&
    respawnedOpponent.queuedSpellId === null &&
    respawnedOpponent.autocastSpellId === null &&
    respawnedOpponent.defensiveCast === false &&
    respawnedOpponent.levels.magic === 99 &&
    respawnedOpponent.prayerPoints === respawnedOpponent.maxPrayerPoints &&
    respawnedOpponent.activePrayers.length === 0 &&
    respawnedOpponent.locks.freezeUntilTick === -1 &&
    respawnedOpponent.supplies.manta_ray === runtimeCombat.runtimePlayerCombatDefaultSupplies.manta_ray &&
    respawnedOpponent.supplies.karambwan === runtimeCombat.runtimePlayerCombatDefaultSupplies.karambwan &&
    respawnedOpponent.supplies.saradomin_brew === runtimeCombat.runtimePlayerCombatDefaultSupplies.saradomin_brew &&
    respawnedOpponent.supplyDelays.eatDelayUntilTick === -1 &&
    respawnedOpponent.supplyDelays.karambwanDelayUntilTick === -1 &&
    respawnedOpponent.supplyDelays.potionDelayUntilTick === -1 &&
    respawnedOpponent.specialActive === false &&
    respawnedOpponent.gmaul.queuedSpecs === 0 &&
    respawnedOpponent.gmaul.specialEnergy === 100,
  `runtime respawn should clear stale NH policy/combat state before the next inference tick: ${JSON.stringify(respawnedOpponent)}`
);
assert(
  viewerSource.includes("applyRuntimeFullFightResetAfterRespawn") &&
    viewerSource.includes("runtimeCombatActorRespawnedForFreshFightReset") &&
    viewerSource.includes("runtimeNhStakeInventorySlots()") &&
    viewerSource.includes("runtimeNhStakeEquipmentItems()") &&
    viewerSource.includes("runtimeSuppliesFromInventorySlots(localInventorySlots)") &&
    viewerSource.includes("runtimeSuppliesFromInventorySlots(opponentInventorySlots)") &&
    viewerSource.includes("Saved setup restored") &&
    viewerSource.includes("lastFreshFightResetInventoryCount") &&
    viewerSource.includes("lastFreshFightResetOpponentSupplies") &&
    viewerSource.includes("lastFreshFightResetOpponentInventorySupplies") &&
    viewerSource.includes("PlayerCombat.restore/NhStakerBot.prepareFreshState + client container rematch reset"),
  "RuntimeSceneViewer should restore visible containers and derive combat supplies from the same inventory slots on the respawn rematch reset"
);
const disengageStateBase = createState(29, {
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
const disengageState = {
  ...disengageStateBase,
  actors: {
    ...disengageStateBase.actors,
    opponent: {
      ...disengageStateBase.actors.opponent,
      targetId: "local-player",
      lastTargetId: "local-player",
      lastTargetTimeoutTicks: 5,
      policyOffenceStyle: "magic",
      policyNextLoadoutSyncTick: 19,
      policyStalledStyle: "ranged",
      policyStalledStyleTicks: 7,
      queuedSpellId: "ice-barrage",
      activePrayers: ["protect_from_magic", "augury"],
      autocastSpellId: "blood-barrage",
      specialActive: true,
      gmaul: {
        ...disengageStateBase.actors.opponent.gmaul,
        specialEnergy: 70,
        queuedSpecs: 1,
        timeoutTicks: 4
      }
    }
  }
};
const disengaged = runtimeCombat.resetRuntimePlayerCombatActorPolicyDisengage(disengageState, "opponent").actors.opponent;
assert(
  disengaged.targetId === null &&
    disengaged.lastTargetId === null &&
    disengaged.lastTargetTimeoutTicks === 0 &&
    disengaged.policyOffenceStyle === undefined &&
    disengaged.policyNextLoadoutSyncTick === 0 &&
    disengaged.policyStalledStyle === null &&
    disengaged.policyStalledStyleTicks === 0 &&
    disengaged.queuedSpellId === null &&
    disengaged.activePrayers.length === 0 &&
    disengaged.autocastSpellId === "blood-barrage" &&
    disengaged.specialActive === true &&
    disengaged.gmaul.queuedSpecs === 1 &&
    disengaged.gmaul.specialEnergy === 70,
  `no-target policy disengage should clear Java resetCombatState fields without inventing a full respawn reset: ${JSON.stringify(disengaged)}`
);

assert(viewerSource.includes("issuePlayerAttackCommand"), "RuntimeSceneViewer should have a dedicated player attack command path");
assert(
  viewerSource.includes("manualOpponentObservedLocalAppearanceRef") &&
    viewerSource.includes("lastManualOpponentPolicyObservedLocalTile") &&
    viewerSource.includes('viewport.dataset.lastManualOpponentPolicyClientPositionDelayTicks = "1"') &&
    viewerSource.includes("tile: observedLocalAppearance.tile") &&
    viewerSource.includes("policyObservedLocalLoadoutId") &&
    viewerSource.includes("policyActualLocalLoadoutId") &&
    viewerSource.includes('viewport.dataset.lastManualOpponentPolicyClientAppearanceDelayTicks = "1"') &&
    viewerSource.includes("loadoutId: observedLocalAppearance.loadoutId") &&
    viewerSource.includes("equipment: observedLocalAppearance.equipment"),
  "manual opponent policy input should use the previous client-visible local observation so it cannot zero-tick react to same-tick movement or equipment swaps"
);
assert(
    runtimePolicyOpponentSource.includes("readonly stats?: SimStats") &&
    runtimePolicyOpponentSource.includes("readonly locks?: EntityLockState") &&
    runtimePolicyOpponentSource.includes("readonly movedThisTick?: boolean") &&
    runtimePolicyOpponentSource.includes("stats: observedInfoKnown ? actorView.stats ?? runtimePolicyStats(actor) : runtimePolicyUnknownOpponentInfoStats(actor)") &&
    runtimePolicyOpponentSource.includes("locks: observedInfoKnown ? actorView.locks ?? actor.locks ?? createEntityLockState() : createEntityLockState()") &&
    runtimePolicyOpponentSource.includes("movedThisTick: actorView.movedThisTick ?? false") &&
    runtimePolicyOpponentSource.includes("lastMoveDx: actorView.lastMoveDx ?? 0") &&
    runtimePolicyOpponentSource.includes("lastMoveDy: actorView.lastMoveDy ?? 0") &&
    viewerSource.includes("kronosClientVisibleOpponentHp") &&
    viewerSource.includes("kronosClientVisibleFreezeTicks") &&
    viewerSource.includes("runtimePolicyVisibleStatsFromCombatActor") &&
    viewerSource.includes("runtimePolicyVisibleLocksFromCombatActor") &&
    viewerSource.includes("stats: observedLocalAppearance.stats") &&
    viewerSource.includes("locks: observedLocalAppearance.locks") &&
    viewerSource.includes("movedThisTick: observedLocalAppearance.movedThisTick") &&
    viewerSource.includes('viewport.dataset.lastManualOpponentPolicyClientVitalsDelayTicks = "1"'),
  "manual opponent policy input should delay client-visible local HP, freeze state, and movement deltas instead of leaking live combat state"
);
assert(
  nhStakerBotSource.includes("private static final int DELAYED_OPP_INFO_DELAY_TICKS = 1;") &&
    nhStakerBotSource.includes("private final int x;") &&
    nhStakerBotSource.includes("private final int y;") &&
    nhStakerBotSource.includes("private final int dx;") &&
    nhStakerBotSource.includes("private final int dy;") &&
    nhStakerBotSource.includes("private final int hpEstimate;") &&
    nhStakerBotSource.includes("private final boolean moving;") &&
    nhStakerBotSource.includes("private final boolean frozen;") &&
    nhStakerBotSource.includes("private final int freezeTicksRemaining;") &&
    nhStakerBotSource.includes("int liveX = opponent.getPosition().getX();") &&
    nhStakerBotSource.includes("int liveDx = opponent.getPosition().getX() - opponent.getLastPosition().getX();") &&
    nhStakerBotSource.includes("int visibleHp = clientVisibleOpponentHp(opponent);") &&
    nhStakerBotSource.includes("int visibleFreezeTicks = clientVisibleFreezeTicks(opponent);") &&
    nhStakerBotSource.includes("return player.getPosition().distance(new Position(snapshot.x, snapshot.y, opponent.getHeight()))") &&
    nhStakerBotSource.includes("observedSelfCanMeleeReachThisTick(snapshot)") &&
    nhStakerBotSource.includes("opponentInfoHistory.addLast(live)") &&
    nhStakerBotSource.includes("candidate.isAtLeastTicksOld(tick, DELAYED_OPP_INFO_DELAY_TICKS)") &&
    nhStakerBotSource.includes("delayedInfoFor(opponent).protectionMask"),
  "NH staker bot source should keep opponent position and protection info behind a one-tick delayed snapshot"
);
assert(
  runtimePolicyOpponentSource.includes("readonly activePrayers?: readonly PrayerId[]") &&
    runtimePolicyOpponentSource.includes("const activePrayers = observedInfoKnown ? actorView.activePrayers ?? actor.activePrayers : []") &&
    viewerSource.includes("activePrayers: observedLocalAppearance.activePrayers") &&
    viewerSource.includes('viewport.dataset.lastManualOpponentPolicyClientPrayerDelayTicks = "1"') &&
    viewerSource.includes("hudPrayersRef.current = transition.prayers"),
  "manual opponent policy input should pass delayed local prayer observations while keeping the player prayer state current"
);
assert(
    nhStakerBotSource.includes("hasClientSpecControlForSpecialThisTick()") &&
    nhStakerBotSource.includes("weaponShowsSpecialBar(tickStartWeaponId)") &&
    nhStakerBotSource.includes("maybeEquipGraniteMaulForSpec(opponent)") &&
    nhStakerBotSource.includes("if (!observedSelfCanMeleeReachThisTick(delayedInfoFor(opponent)))") &&
    nhPolicyFeaturesSource.includes("hasClientSpecControlForSpecialThisTick()") &&
    nhPolicyFeaturesSource.includes("nhWeaponProfiles[context.self.weaponId].hasVisibleSpecBar") &&
    runtimePolicyOpponentSource.includes("runtimePolicyActionWithAllowedSpecIntent") &&
    runtimePolicyOpponentSource.includes("nhWeaponProfiles[context.self.weaponId].hasVisibleSpecBar") &&
    runtimePolicyOpponentSource.includes("runtimePolicyStyleWeaponCanAttackForSpec(context, action.offenceStyle)") &&
    runtimePolicyOpponentSource.includes("server weapon after switchToStyle(desiredOffence)") &&
    runtimePolicyOpponentSource.includes("context.meleeReachable"),
  "manual opponent policy gmaul intents should use Kronos tick-start spec-control semantics before equipping the maul"
);
let capturedDelayedAppearanceContext = null;
const delayedAppearanceController = {
  id: "test-policy-delayed-local-appearance",
  chooseAction: (context) => {
    capturedDelayedAppearanceContext = context;
    return {
      offenceStyle: "ranged",
      defencePrayer: "protect_from_magic",
      movementIntent: "pressure",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    };
  }
};
const priorLocalAppearanceState = createState(137, {
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
const currentServerAppearanceState = runtimeCombat.setRuntimePlayerCombatLoadout(
  priorLocalAppearanceState,
  "local-player",
  "kodai-robes"
);
runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: currentServerAppearanceState,
  controller: delayedAppearanceController,
  localActor: {
    tile: currentServerAppearanceState.actors["local-player"].tile,
    loadoutId: priorLocalAppearanceState.actors["local-player"].loadoutId,
    equipment: priorLocalAppearanceState.actors["local-player"].equipment
  },
  opponentActor: {
    tile: currentServerAppearanceState.actors.opponent.tile,
    loadoutId: currentServerAppearanceState.actors.opponent.loadoutId
  }
});
assert(
  capturedDelayedAppearanceContext?.opponent.loadoutId === "acb-hides" &&
    capturedDelayedAppearanceContext?.opponent.weaponId === "armadyl_crossbow",
  `manual opponent policy context should honor the delayed client-visible local weapon, not the current server-applied loadout: ${JSON.stringify({
    observedLoadout: capturedDelayedAppearanceContext?.opponent.loadoutId,
    observedWeapon: capturedDelayedAppearanceContext?.opponent.weaponId,
    currentServerLoadout: currentServerAppearanceState.actors["local-player"].loadoutId
  })}`
);
let capturedDelayedPositionContext = null;
const delayedPositionController = {
  id: "test-policy-delayed-local-position",
  chooseAction: (context) => {
    capturedDelayedPositionContext = context;
    return {
      offenceStyle: "melee",
      defencePrayer: "protect_from_magic",
      movementIntent: "pressure",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    };
  }
};
const currentServerPositionState = createState(136, {
  localTile: { x: 1, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "gmaul-bandos"
});
runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: currentServerPositionState,
  controller: delayedPositionController,
  localActor: {
    tile: { x: 3, z: 0 },
    loadoutId: currentServerPositionState.actors["local-player"].loadoutId,
    equipment: currentServerPositionState.actors["local-player"].equipment
  },
  opponentActor: {
    tile: currentServerPositionState.actors.opponent.tile,
    loadoutId: currentServerPositionState.actors.opponent.loadoutId
  }
});
assert(
  capturedDelayedPositionContext?.opponent.tile.x === 3 &&
    capturedDelayedPositionContext?.self.tile.x === 0 &&
    capturedDelayedPositionContext?.meleeReachable === false,
  `manual opponent policy context should honor the delayed client-visible local tile, not the current server-applied tile that just stepped into range: ${JSON.stringify({
    observedTile: capturedDelayedPositionContext?.opponent.tile,
    botTile: capturedDelayedPositionContext?.self.tile,
    meleeReachable: capturedDelayedPositionContext?.meleeReachable,
    currentServerTile: currentServerPositionState.actors["local-player"].tile
  })}`
);
const currentServerSteppedOutPositionState = createState(135, {
  localTile: { x: 3, z: 0 },
  opponentTile: { x: 0, z: 0 },
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "gmaul-bandos"
});
runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: currentServerSteppedOutPositionState,
  controller: delayedPositionController,
  localActor: {
    tile: { x: 1, z: 0 },
    loadoutId: currentServerSteppedOutPositionState.actors["local-player"].loadoutId,
    equipment: currentServerSteppedOutPositionState.actors["local-player"].equipment
  },
  opponentActor: {
    tile: currentServerSteppedOutPositionState.actors.opponent.tile,
    loadoutId: currentServerSteppedOutPositionState.actors.opponent.loadoutId
  }
});
assert(
  capturedDelayedPositionContext?.opponent.tile.x === 1 &&
    capturedDelayedPositionContext?.self.tile.x === 0 &&
    capturedDelayedPositionContext?.meleeReachable === true,
  `manual opponent policy context should not have foresight when the local player just stepped out of Gmaul range: ${JSON.stringify({
    observedTile: capturedDelayedPositionContext?.opponent.tile,
    botTile: capturedDelayedPositionContext?.self.tile,
    meleeReachable: capturedDelayedPositionContext?.meleeReachable,
    currentServerTile: currentServerSteppedOutPositionState.actors["local-player"].tile
  })}`
);
let capturedDelayedPrayerContext = null;
const delayedPrayerController = {
  id: "test-policy-delayed-local-prayer",
  chooseAction: (context) => {
    capturedDelayedPrayerContext = context;
    return {
      offenceStyle: "ranged",
      defencePrayer: "protect_from_magic",
      movementIntent: "pressure",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    };
  }
};
const priorLocalPrayerState = createState(138, {
  localPrayers: ["protect_from_missiles"],
  opponentLoadoutId: "kodai-robes"
});
const currentServerPrayerState = runtimeCombat.setRuntimePlayerCombatPrayers(
  priorLocalPrayerState,
  "local-player",
  ["protect_from_magic"]
);
runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: currentServerPrayerState,
  controller: delayedPrayerController,
  localActor: {
    tile: currentServerPrayerState.actors["local-player"].tile,
    loadoutId: currentServerPrayerState.actors["local-player"].loadoutId,
    equipment: currentServerPrayerState.actors["local-player"].equipment,
    activePrayers: priorLocalPrayerState.actors["local-player"].activePrayers
  },
  opponentActor: {
    tile: currentServerPrayerState.actors.opponent.tile,
    loadoutId: currentServerPrayerState.actors.opponent.loadoutId
  }
});
assert(
  capturedDelayedPrayerContext?.opponent.activePrayers.includes("protect_from_missiles") &&
    !capturedDelayedPrayerContext?.opponent.activePrayers.includes("protect_from_magic"),
  `manual opponent policy context should honor the delayed client-visible local prayer, not the current server-applied prayer: ${JSON.stringify({
    observedPrayers: capturedDelayedPrayerContext?.opponent.activePrayers,
    currentServerPrayers: currentServerPrayerState.actors["local-player"].activePrayers
  })}`
);
let capturedDelayedVitalsContext = null;
const delayedVitalsController = {
  id: "test-policy-delayed-local-vitals",
  chooseAction: (context) => {
    capturedDelayedVitalsContext = context;
    return {
      offenceStyle: "ranged",
      defencePrayer: "protect_from_magic",
      movementIntent: "pressure",
      supplyIntent: "none",
      specIntent: "none",
      extendedSupplyAction: false
    };
  }
};
const delayedObservedStats = {
  attack: { current: 99, fixed: 99 },
  strength: { current: 99, fixed: 99 },
  defence: { current: 99, fixed: 99 },
  ranged: { current: 99, fixed: 99 },
  magic: { current: 99, fixed: 99 },
  hitpoints: { current: 80, fixed: 99 },
  prayer: { current: 99, fixed: 99 }
};
const delayedObservedLocks = entityLocks.createEntityLockState();
let currentServerVitalsState = createState(139, {
  localLoadoutId: "acb-hides",
  opponentLoadoutId: "kodai-robes"
});
currentServerVitalsState = {
  ...currentServerVitalsState,
  actors: {
    ...currentServerVitalsState.actors,
    "local-player": {
      ...currentServerVitalsState.actors["local-player"],
      hitpoints: 25,
      locks: entityLocks.applyFreeze(
        currentServerVitalsState.actors["local-player"].locks,
        currentServerVitalsState.tick,
        20,
        "opponent"
      )
    }
  }
};
runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
  state: currentServerVitalsState,
  controller: delayedVitalsController,
  localActor: {
    tile: currentServerVitalsState.actors["local-player"].tile,
    loadoutId: currentServerVitalsState.actors["local-player"].loadoutId,
    equipment: currentServerVitalsState.actors["local-player"].equipment,
    activePrayers: currentServerVitalsState.actors["local-player"].activePrayers,
    stats: delayedObservedStats,
    locks: delayedObservedLocks,
    movedThisTick: true,
    lastMoveDx: 1,
    lastMoveDy: -1
  },
  opponentActor: {
    tile: currentServerVitalsState.actors.opponent.tile,
    loadoutId: currentServerVitalsState.actors.opponent.loadoutId
  }
});
assert(
  capturedDelayedVitalsContext?.opponent.stats.hitpoints.current === 80 &&
    capturedDelayedVitalsContext?.opponent.locks.freezeUntilTick === -1 &&
    capturedDelayedVitalsContext?.opponent.movedThisTick === true &&
    capturedDelayedVitalsContext?.opponent.lastMoveDx === 1 &&
    capturedDelayedVitalsContext?.opponent.lastMoveDy === -1,
  `manual opponent policy context should honor delayed client-visible local HP/freeze/movement instead of current server state: ${JSON.stringify({
    observedHp: capturedDelayedVitalsContext?.opponent.stats.hitpoints.current,
    currentServerHp: currentServerVitalsState.actors["local-player"].hitpoints,
    observedFreezeUntilTick: capturedDelayedVitalsContext?.opponent.locks.freezeUntilTick,
    currentServerFreezeUntilTick: currentServerVitalsState.actors["local-player"].locks.freezeUntilTick,
    observedMoved: capturedDelayedVitalsContext?.opponent.movedThisTick,
    observedLastMoveDx: capturedDelayedVitalsContext?.opponent.lastMoveDx,
    observedLastMoveDy: capturedDelayedVitalsContext?.opponent.lastMoveDy
  })}`
);
const preMovementHitIndex = viewerSource.indexOf("applyRuntimePlayerCombatPreMovementHits(manualCombatStateRef.current");
const manualMovementGateIndex = viewerSource.indexOf("const localBeforeMovement = stopManualActorMovementIfMovementGated");
assert(
  preMovementHitIndex !== -1 &&
    manualMovementGateIndex !== -1 &&
    preMovementHitIndex < manualMovementGateIndex &&
    viewerSource.includes("preMovementHitApplied ||") &&
    runtimeCombatSource.includes("applyRuntimePlayerCombatDueHits(actors, queuedHits, currentTick, input.tileScale)") &&
    runtimeCombatSource.includes("syncRuntimePlayerCombatActorsForPreMovementHits"),
  "manual combat tick should apply due hits/freezes before movement, matching Kronos Player.process() processHits-before-movement order"
);
assert(
    viewerSource.includes("const resolveManualOpponentPolicyTick = (combatState: RuntimePlayerCombatState): ManualOpponentPolicyTickGate =>") &&
    viewerSource.includes("const policyTickGate = resolveManualOpponentPolicyTick(combatStateForTick)") &&
    viewerSource.includes("combatStateForTick = policyTickGate.combatState") &&
    viewerSource.includes("if (policyTickGate.shouldRun)") &&
    viewerSource.includes("queueManualOpponentCombatResponse(combatStateForTick, local, opponent") &&
    viewerSource.includes("const result = advanceRuntimePlayerCombat(combatStateForTick, {") &&
    viewerSource.includes('viewport.dataset.lastManualOpponentPolicyTickSource = "manual-combat-game-tick"') &&
    viewerSource.includes("manualOpponentFightEngagedRef") &&
    viewerSource.includes("manualOpponentTargetTrackingRef") &&
    viewerSource.includes("setManualOpponentFightEngaged(true") &&
    viewerSource.includes("manualOpponentFightEngagedRef.current = false") &&
    viewerSource.includes("resolveRuntimePolicyTargetTracking({") &&
    viewerSource.includes("runtimePolicyRecentManualCombatSignal(combatState)") &&
    viewerSource.includes("resetRuntimePlayerCombatActorPolicyDisengage(nextCombatState, \"opponent\")") &&
    viewerSource.includes("shouldRun: tracking.shouldRunPolicy") &&
    runtimeCombatSource.includes("export function resetRuntimePlayerCombatActorPolicyDisengage") &&
    runtimeCombatSource.includes("NhStakerBot.resetCombatState() clears currentOffence") &&
    nhStakerBotSource.includes("lockedTarget = opponent") &&
    nhStakerBotSource.includes("TARGET_TRACK_DISTANCE") &&
    nhStakerBotSource.includes("NO_TARGET_GRACE_TICKS") &&
    nhStakerBotSource.includes("resetCombatState(player.getCombat().getTarget() != null ? \"cant_attack\" : \"no_target\")") &&
    nhStakerBotSource.includes("player.getPrayer().deactivateAll();") &&
    nhStakerBotSource.includes("player.getCombat().reset();") &&
    nhStakerBotSource.includes("engagementLockUntilTick = tick + ENGAGEMENT_STICKY_TICKS") &&
    nhStakerBotSource.includes("return lockedTarget"),
  "manual viewport opponent should keep the NH policy engaged once combat starts, matching Kronos locked-target behavior instead of waiting for another player hit"
);
assert(
  appSource.includes("<RuntimeSceneViewer") &&
    appSource.includes("policy={loadedPolicy}") &&
    appSource.includes("data-default-policy-loaded") &&
    appSource.includes("parseNhPolicyTsv") &&
    viewerSource.includes("manualOpponentPolicyController") &&
    viewerSource.includes("createNhPolicyController(policy)") &&
    viewerSource.includes("scriptedNhController") &&
    viewerSource.includes("queueManualOpponentCombatResponse") &&
    viewerSource.includes("applyRuntimeOpponentPolicyAction({") &&
    viewerSource.includes("manualOpponentPolicyController ?? scriptedNhController") &&
    viewerSource.includes("lastManualOpponentControllerId") &&
    viewerSource.includes("lastManualOpponentConsumedSupplies") &&
    !viewerSource.includes("runtime-auto-retaliate"),
  "manual viewport opponent should consume the loaded policy controller when available and fall back to the EV-aware scripted NH controller instead of raw auto-retaliate"
);
assert(
  viewerSource.includes("isKronosPlayerContextMenuEntry(defaultEntry)") &&
    viewerSource.includes("dispatchPlayerContextEntry(defaultEntry") &&
    viewerSource.includes("issuePlayerAttackCommand(entry"),
  "left-click Attack should dispatch combat instead of falling through as a tile command"
);
assert(
  viewerSource.includes("nextKronosGameTickAt") &&
    viewerSource.includes("currentKronosGameTickAt") &&
    viewerSource.includes("runtimeTickOriginMsRef") &&
    viewerSource.includes("KRONOS_GAME_TICK_CATCH_UP_LIMIT") &&
    viewerSource.includes("manualCombatStateRef.current.tick < targetTick") &&
    viewerSource.includes("const runCombatTick = (): void =>") &&
    viewerSource.includes("window.setTimeout(runCombatTick, kronosGameTickDelay(runtimeTickOriginMsRef.current, now))"),
  "manual combat should advance on Kronos game-tick boundaries and catch up delayed 600ms ticks instead of stretching time"
);
assert(
  viewerSource.includes('if (entry.action === "attack")') &&
    viewerSource.includes("issuePlayerAttackCommand(entry"),
  "right-click Attack should dispatch combat instead of falling through as a tile command"
);
assert(
  viewerSource.includes("routeManualActorToTarget") &&
    viewerSource.includes("findKronosTargetRouteWaypoints") &&
    viewerSource.includes("kronosSceneTargetRouteReached") &&
    viewerSource.includes("request.attackRange") &&
    viewerSource.includes("tileScale: KRONOS_TILE_WORLD_UNITS") &&
    runtimeCombatSource.includes("normalizeRuntimeCombatTileScale(tileScale)") &&
    viewerSource.includes("movementGate(combatActor.locks") &&
    viewerSource.includes("lastRuntimeCombatRouteBlockedReason"),
  "manual player Attack routing should use TargetRoute-style range stopping instead of walking onto the target tile"
);
assert(
  viewerSource.includes("manualControl ? manualCombatRenderEvents : activeEvents"),
  "manual mode should feed live combat render events into the existing renderer"
);
assert(
  viewerSource.includes("setRuntimePlayerCombatAttackSet") &&
    viewerSource.includes("toggleRuntimePlayerCombatSpecial") &&
    viewerSource.includes("specialEnergy: combatState.actors[\"local-player\"].gmaul.specialEnergy") &&
    viewerSource.includes("specialActive: combatState.actors[\"local-player\"].specialActive") &&
    viewerSource.includes("attackSet: combatState.actors[\"local-player\"].attackSetIndex") &&
    viewerSource.includes("lastCombatSpecialQueuedGraniteMaulSpecs"),
  "manual combat HUD should source attack-set and special state from runtime PlayerCombat rather than stale HUD-only overrides"
);
assert(
  viewerSource.includes("runtimeManualCombatAuthoritativeHud") &&
    viewerSource.includes("hitpoints: combatHud.hitpoints") &&
    viewerSource.includes("hitpointsMax: combatHud.hitpointsMax") &&
    viewerSource.includes("hitpoints: combatHud.skills?.hitpoints") &&
    viewerSource.includes("runtimeManualCombatAuthoritativeHud(hud, inventorySnapshot.hud)"),
  "manual combat HUD should keep fixed HP orb/status overlays on the same combat actor hitpoints as overhead health bars after stale HUD overrides"
);
assert(
  viewerSource.includes("queueCombatSpecialAfterPendingItemPackets") &&
    viewerSource.includes("kind: \"special\"") &&
    viewerSource.includes("dispatchCombatSpecialAction(packet.specialCommand, \"queued\")") &&
    viewerSource.includes("Player.checkLogout() decodes queued packets before Player.process()") &&
    viewerSource.includes("TabCombat child 36 calls PlayerCombat.toggleSpecial()"),
  "manual combat special packets should wait behind pending inventory equip packets so Gmaul specs resolve against the post-equip weapon"
);
assert(
  hudSource.includes("data-special-usable") &&
    hudSource.includes("drainPercent > 0 && energy < drainPercent ? 12907") &&
    hudSource.includes("textColor = specialActive ? 16776960 : 16"),
  "fixed combat tab special bar should expose source active color and low-energy fill state"
);
assert(
  viewerSource.includes('sequenceName: "idle"') &&
    viewerSource.includes("const [playing, setPlaying] = useState(false);") &&
    viewerSource.includes("const [followLive, setFollowLive] = useState(false);") &&
    viewerSource.includes("const [manualControl, setManualControl] = useState(true);") &&
    viewerSource.includes("runtimeTickOriginMsRef.current = performance.now();"),
  "manual mode should start from idle/ready actors on a fresh tick origin instead of autoplaying the first replay attack tick"
);
assert(
    viewerSource.includes("orientationUnits") &&
    viewerSource.includes("rotationUnits") &&
    viewerSource.includes("kronosTargetOrientationUnits") &&
    viewerSource.includes("rotateManualActorTowardKronosOrientation") &&
    viewerSource.includes("KRONOS_ACTOR_TURN_ANIMATION_DELAY_TICKS") &&
    viewerSource.includes("kronosSequenceIsReadyMovement") &&
    viewerSource.includes('return sequenceName === "idle" || runtimeSequenceIsWeaponReady(sequenceName);') &&
    viewerSource.includes("kronosTurnSequenceForReadyMovement(actor.sequenceName, turnTicks, stillTurning)") &&
    viewerSource.includes("Math.trunc(units)") &&
    viewerSource.includes("combatActor.actionStartedAtClientCycle") &&
    viewerSource.includes("manualActorBaseSequenceName(") &&
    viewerSource.includes("kronosWeaponRenderSequenceName(") &&
    viewerSource.includes("kronosRuntimeSequenceNameForId(sequenceId, actorSequenceDefinitions)") &&
    viewerSource.includes("runtimeSequenceIsMovement(baseSequenceName)") &&
    viewerSource.includes('sequenceMode: actionFrameActive ? "primary" : undefined') &&
    viewerSource.includes('movementAnimationCycle: movementSequenceName ? actor.animationCycle : undefined'),
  "manual combat actors should use Kronos orientation/rotation turning and suppress primary-animation idle fallback after source sequence frames end"
);
assert(
  clientActorMovementSource.includes("if(var0.field720 != 0)") &&
    clientActorMovementSource.includes("var11 = var0.orientation - var0.rotation & 2047;") &&
    clientActorMovementSource.includes("++var0.field719;") &&
    clientActorMovementSource.includes("if(var0.readySequence == var0.movementSequence && (var0.field719 > 25 || var14))") &&
    clientActorMovementSource.includes("var0.movementSequence = var0.turnLeftSequence;") &&
    clientActorMovementSource.includes("if(var0.movementSequence == var0.readySequence && (var0.field719 > 25 || var14))") &&
    clientActorMovementSource.includes("var0.movementSequence = var0.turnRightSequence;") &&
    clientPlayerSource.includes("super.turnRightSequence = super.turnLeftSequence;"),
  "Kronos client actor turning source no longer matches the trainer's ready-movement turn contract"
);
assert(
    viewerSource.includes("manualActorMovementBlockedByKronosSequence") &&
    viewerSource.includes("kronosSequencePrecedenceAnimating(sequence) === 0") &&
    viewerSource.includes("kronosSequencePriority(sequence) === 0") &&
    viewerSource.includes("kronosAdvancePrimarySequenceCursor") &&
    viewerSource.includes("manualActorWithAuthoritativeSequenceCursor") &&
    viewerSource.includes("current.primarySequenceCycle > incoming.primarySequenceCycle") &&
    viewerSource.includes("current.completedSequenceKey && current.completedSequenceKey === incoming.activeSequenceKey") &&
    viewerSource.includes("actor.completedSequenceKey === activeSequenceKey") &&
    viewerSource.includes("const sequenceJustAccepted =") &&
    viewerSource.includes("currentActor.activeSequenceKey !== null && currentActor.activeSequenceKey !== actor.activeSequenceKey") &&
    viewerSource.includes("const previousCycle = sequenceJustAccepted ? animationCycle : actor.lastMovementClientCycle ?? animationCycle") &&
    viewerSource.includes("slot.currentActionSequenceKey !== actionSequenceKey") &&
    viewerSource.includes("animationCycle = 0") &&
    viewerSource.includes("resolvedPrimaryFrameCursor = { frameIndex: 0, frameCycle: 0 }") &&
    viewerSource.includes("primaryFrameCycle > frameLength") &&
    viewerSource.includes("completedSequenceKey: actor.activeSequenceKey") &&
    viewerSource.includes("movementStallTicks: Math.min(actor.movementStallTicks + 1, 100)") &&
    viewerSource.includes("syncManualActorActionSequence") &&
    viewerSource.includes("sequencePathLengthAtStart: actor.routeWaypoints.length") &&
    viewerSource.includes("snapManualActorToCollision") &&
    viewerSource.includes("renderTile: tile") &&
    viewerSource.includes("expandKronosManualRoutePath(startTile, routeSegment, collision)") &&
    viewerSource.includes("setKronosManualServerRoutePath(routePath)") &&
    viewerSource.includes("manualActorRouteClientPosition(actor, startTile)") &&
    viewerSource.includes("actor.clientPosition ?? kronosClientPositionFromRuntimeTile(actor.renderTile ?? startTile)") &&
    !viewerSource.includes("actor: advanceManualActorServerRouteTick({") &&
    viewerSource.includes("stopManualActorMovementIfMovementGated") &&
    viewerSource.includes("clearManualActorMovementRoute") &&
    viewerSource.includes('nextCombatState.actors["local-player"].locks') &&
    viewerSource.includes("lastTileCommandBlockedByMovementGate") &&
    viewerSource.includes("advanceManualActorServerRouteTick") &&
    viewerSource.includes("let local = advanceManualActorServerRouteTick(localBeforeMovement)") &&
    viewerSource.includes("let opponent = advanceManualActorServerRouteTick(opponentBeforeMovement)") &&
    viewerSource.includes("actor.running && actor.serverRouteWaypoints.length > 1 ? 2 : 1") &&
    viewerSource.includes("const enqueuedWaypoints = actor.serverRouteWaypoints.slice(0, enqueueCount)") &&
    viewerSource.includes("enqueueManualActorClientPathSteps(actor.routeWaypoints, enqueuedWaypoints)") &&
    viewerSource.includes("queued = queued.slice(1)") &&
    viewerSource.includes("tile: enqueuedWaypoints[enqueuedWaypoints.length - 1] ?? actor.tile") &&
    viewerSource.includes("const traversalMode = sourceTickStepCount > 1 ? 2 : 1") &&
    viewerSource.includes("serverRouteWaypoints") &&
    viewerSource.includes("routeTraversalModes") &&
    viewerSource.includes("lastMovementClientCycle") &&
    viewerSource.includes("movementStallTicks: actor.movementStallTicks") &&
    viewerSource.includes("advanceManualActorClientCycle") &&
    viewerSource.includes("kronosManualMovementSpeed(currentActor, traversalMode, hasCombatTarget)") &&
    viewerSource.includes("KRONOS_CLIENT_MAX_CYCLES_PER_RENDER_FRAME") &&
    viewerSource.includes("animationCycle - targetMovementCycle > maxCycleCatchUp ? animationCycle : targetMovementCycle") &&
    viewerSource.includes("tile: actor.tile") &&
    viewerSource.includes("renderTile: runtimeTileFromKronosClientPosition(clientPosition)") &&
    !viewerSource.includes("tile: collision.snapTile(renderTile)") &&
    !viewerSource.includes("tile: nextLogicalTile") &&
    viewerSource.includes("animationFixtures") &&
    viewerSource.includes("manualActorFacingTarget(localActorSource, opponentActorSource)") &&
    viewerSource.includes('lastManualOpponentPolicyTickSource = "deferred-to-game-tick"') &&
    viewerSource.includes("routeManualActorToTarget(input.actor, input.targetActor.tile, profile.attackRange, input.collision, input.now, false)") &&
    !viewerSource.includes("manualActorFacingTarget(clearManualActorRoutes(localActorSource), opponentActorSource)"),
  "manual combat movement should use Kronos sequence movement-blocking metadata, route through server-tick path updates, defer opponent policy to the game tick, and avoid target-route visual backtracking"
);
assert(
  consumableSource.includes("player.resetActions(true, player.getMovement().following != null, true)") &&
    viewerSource.includes("const sourceActor = manualControlRef.current") &&
    viewerSource.includes("const consumeActor = sameKronosTile(sourceActor.tile, localActor.tile)") &&
    viewerSource.includes("tile: localActor.tile") &&
    viewerSource.includes("renderTile: localActor.tile") &&
    viewerSource.includes("manualControlRef.current = true;") &&
    viewerSource.includes("...finalConsumableSourceActor,") &&
    !viewerSource.includes("tile: sourceActor.tile"),
  "manual consumable actions should mirror Kronos eat/drink reset semantics without writing stale render tiles back into combat state"
);
assert(
  consumableSource.includes('ItemAction.registerInventory(id, "eat"') &&
    consumableSource.includes('ItemAction.registerInventory(id, "drink"') &&
    consumableSource.includes("player.incrementHp(heal);") &&
    viewerSource.includes("queueInventoryConsumableAction") &&
    viewerSource.includes('if (action.kind === "eat" || action.kind === "drink")') &&
    viewerSource.includes("itemActionQueueRef.current.drainReady(nowMs, KRONOS_GAME_TICK_MS)") &&
    viewerSource.includes("runtimeSimStatsFromActorAndHud(localActor, visibleSnapshotRef.current.hud)") &&
    viewerSource.includes("supplyDelays: result.delays") &&
    !viewerSource.includes("previewInventoryConsumableAction(") &&
    !viewerSource.includes("applyInventoryConsumableResult("),
  "manual inventory eat/drink clicks should queue like Kronos inventory packets and apply healing/inventory changes only when the next game tick drains the queue"
);
assert(
  /const nextCombatState = resetRuntimePlayerCombatActorTarget\(manualScene\.combatState, "local-player"\);\s+const movementStatus = movementGate\(/.test(viewerSource) &&
    /if \(movementStatus\.blocked\) \{[\s\S]*manualCombatStateRef\.current = nextCombatState;[\s\S]*setManualCombatState\(nextCombatState\);[\s\S]*showClickCross\(position, color\);[\s\S]*lastTileCommandBlockedByMovementGate/.test(viewerSource) &&
    viewerSource.includes("lastTileCommandSource"),
  "manual tile commands should mirror Kronos WalkHandler.resetActions before blocked routes and keep the client-side click-cross color"
);
assert(
  viewerSource.includes('activateManualActor({ loadoutId: "kodai-robes", sequenceName: "idle" })') &&
    !viewerSource.includes('activateManualActor({ loadoutId: "kodai-robes", sequenceName: "barrage_cast" })'),
  "manual style switches should change gear only; real attack events should be the only source of barrage cast animations"
);
assert(
  viewerSource.includes("createKronosHitsplatRenderState") &&
    viewerSource.includes("combatHit") &&
    viewerSource.includes("createKronosHealthBarRenderState") &&
    viewerSource.includes("packetCycle: event.tick * KRONOS_CLIENT_CYCLES_PER_GAME_TICK") &&
    viewerSource.includes("clientCycle,") &&
    viewerSource.includes("latestHealthEventByActor") &&
    viewerSource.includes("slotIndex: event.slotIndex") &&
    viewerSource.includes("kronosPrayerOverheadDefinition") &&
    viewerSource.includes("kronosSkullOverheadDefinition"),
  "manual combat render events should feed per-hit hitsplats, a single latest health bar, prayer overheads, and skull overheads through the existing renderer"
);
assert(
  (
    viewerSource.includes("reprojectRuntimeOverlaySprites(boundary, visibleSnapshotRef.current)") ||
    viewerSource.includes("reprojectRuntimeOverlaySprites(boundary, frameSnapshot)")
  ) &&
    viewerSource.includes("if (!manualControl) {\n      applySnapshot(") &&
    viewerSource.includes("kronosRuntimeOverlayAnchor") &&
    viewerSource.includes("runtimeOverlayViewport(boundary)") &&
    viewerSource.includes("buildRuntimeDomOverlays(") &&
    viewerSource.includes("kronosActorOverlayPlacement(") &&
    viewerSource.includes("kronosOverlayClientViewportProjection(") &&
    viewerSource.includes("kronosRuntimeOverlayClientCameraState(boundary)"),
  "actor overlays should be projected into a 2D screen-space sprite layer through the Kronos viewportTempX/Y client-camera path"
);
assert(viewerSource.includes("buildEffectModel"), "RuntimeSceneViewer should use a separate effect model path for projectiles and spotanims");
assert(
  viewerSource.includes("kronosClientUnitsToWorldUnits(1)") &&
    !viewerSource.includes("object.scale.multiplyScalar(0.45)") &&
    !viewerSource.includes("object.scale.multiplyScalar(0.55)"),
  "projectiles and spotanims should render at natural cache scale instead of being normalized like players"
);

console.log(JSON.stringify({
  ok: true,
  outOfRangeRouteRequests: outOfRangeResult.routeRequests.length,
  frozenMeleeRouteRequests: frozenMeleeResult.routeRequests.length,
  frozenUnderGmaulRouteRequests: frozenUnderGmaulResult.routeRequests.length,
  meleeQueuedHits: meleeStepResult.state.queuedHits.length,
  magicProjectile: magicAttackEvent?.projectile?.id,
  rangedProjectile: rangedAttackEvent?.projectile?.id,
  opponentQueuedHits: opponentAttackResult.state.queuedHits.length,
  unprotectedDamage,
  protectedDamage,
  sampledMaxes,
  lethalDeathTick: lethalResult.state.actors.opponent.deadUntilTick
}, null, 2));
