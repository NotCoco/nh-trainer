import assert from "node:assert/strict";
import { loadTsModule } from "../lib/load-ts-module.mjs";

export function verifyDmmRuntime() {
  const runtimeCombat = loadTsModule("src/sim/runtimePlayerCombat.ts");
  const runtimePolicyOpponent = loadTsModule("src/sim/nh/runtime-policy-opponent.ts");
  const nhLoadouts = loadTsModule("src/sim/nh/loadouts.ts");
  const nhGearProfile = loadTsModule("src/sim/nh/gearProfile.ts");
  const dmmIndependentEquipment = nhLoadouts.nhLoadouts["noxious-halberd"].equipment;
  function createState(seed, overrides) {
    return runtimeCombat.createRuntimePlayerCombatState({
      localTile: { x: 0, z: 0 }, opponentTile: { x: 4, z: 0 },
      localLoadoutId: "acb-hides", opponentLoadoutId: "kodai-robes",
      combatStartTick: 0, seed, ...overrides
    });
  }
  // The viewer feeds opponentLoadoutId back into the combat sync after policy
  // application. A stale ID here used to replace DMM gear with an NH preset.
  const dmmSpecialGear = loadTsModule("src/sim/nh/canonicalGear.ts").canonicalNhGear;
  const dmmSpecialEquipment = {
    ...dmmIndependentEquipment,
    head: dmmSpecialGear.torvaFullHelm,
    body: dmmSpecialGear.masoriBodyF,
    legs: dmmSpecialGear.torvaPlatelegs,
    weapon: dmmSpecialGear.zaryteCrossbow
  };
  const dmmSpecialInventory = [
    ...Object.values(dmmSpecialEquipment),
    dmmSpecialGear.virtusRobeTop,
    dmmSpecialGear.graniteMaul,
    dmmSpecialGear.voidwaker,
    dmmSpecialGear.vestaLongsword
  ];
  const dmmSpecialProfile = nhGearProfile.inferNhSelectedGearProfile({
    equipment: dmmSpecialEquipment,
    inventoryItems: dmmSpecialInventory
  });
  for (const [specIntent, weapon] of [
    ["spec_granite_maul_double", dmmSpecialGear.graniteMaul],
    ["spec_voidwaker", dmmSpecialGear.voidwaker],
    ["spec_vesta_longsword", dmmSpecialGear.vestaLongsword]
  ]) {
    const initial = runtimeCombat.syncRuntimePlayerCombatStateToInput(createState(130, {
      opponentTile: { x: 1, z: 0 },
      opponentLoadoutId: "acb-hides"
    }), {
      tiles: {},
      equipment: { opponent: dmmSpecialEquipment },
      gearProfiles: { opponent: dmmSpecialProfile }
    });
    const result = runtimePolicyOpponent.applyRuntimeOpponentPolicyAction({
      state: initial,
      controller: {
        id: "test-dmm-direct-special-gear",
        defencePrayerStrictModelChoice: true,
        chooseAction: () => ({
          offenceStyle: "ranged",
          defencePrayer: "protect_from_magic",
          movementIntent: "none",
          supplyIntent: "none",
          specIntent,
          attackIntent: "attack",
          equipmentIntent: "weapon_only",
          directGearActions: ["equip_dmm_virtus_robe_top"],
          extendedSupplyAction: false
        })
      },
      localActor: { tile: initial.actors["local-player"].tile, loadoutId: "acb-hides" },
      opponentActor: {
        tile: initial.actors.opponent.tile,
        loadoutId: "acb-hides",
        equipment: dmmSpecialEquipment,
        gearProfile: dmmSpecialProfile,
        inventoryItems: dmmSpecialInventory
      },
      allowSourceLoadoutSync: false,
      rewardEpisodeActive: true
    });
    const synced = runtimeCombat.syncRuntimePlayerCombatStateToInput(result.state, {
      tiles: {},
      loadouts: { opponent: result.opponentLoadoutId }
    });
    assert(
      result.effectiveAction.specIntent === specIntent &&
        result.state.actors.opponent.equipment.weapon?.itemId === weapon.itemId,
      `${specIntent} regression must actually apply the special weapon`
    );
    assert(
      result.opponentLoadoutId === result.state.actors.opponent.loadoutId &&
        synced.actors.opponent.equipment === result.state.actors.opponent.equipment &&
        synced.actors.opponent.equipment.head?.itemId === dmmSpecialGear.torvaFullHelm.itemId &&
        synced.actors.opponent.equipment.body?.itemId === dmmSpecialGear.virtusRobeTop.itemId,
      `${specIntent} must preserve DMM equipment through the viewer's loadout sync`
    );
  }
}
