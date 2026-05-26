import type { RuntimeActorId } from "../render/runtimeScene";
import type { RuntimePlayerCombatActorState, RuntimePlayerCombatEvent, RuntimePlayerCombatState } from "../sim/runtimePlayerCombat";
import type { VisibleEquipment } from "../sim/clientView";
import type { PrayerId } from "../sim/prayer/prayers";
import type { RunelitePrayAgainstPlayerConfigSnapshot } from "./RuneliteClientShell";

export type RunelitePrayAgainstPlayerWeaponType = "WEAPON_MELEE" | "WEAPON_RANGED" | "WEAPON_MAGIC" | "WEAPON_UNKNOWN";
export type RunelitePrayAgainstPlayerRelation = "attacker" | "potential";
type RunelitePrayAgainstPlayerProtectionPrayerId = "protect_from_magic" | "protect_from_missiles" | "protect_from_melee";

export interface RunelitePrayAgainstPlayerOverlaySnapshot {
  readonly id: string;
  readonly actorId: RuntimeActorId;
  readonly relation: RunelitePrayAgainstPlayerRelation;
  readonly weaponType: RunelitePrayAgainstPlayerWeaponType;
  readonly weaponName: string;
  readonly prayerId: PrayerId;
  readonly spriteId: number;
  readonly color: string;
  readonly logicalOffsetClientUnits: number;
}

export const RUNELITE_PRAY_AGAINST_PLAYER_PLUGIN_ID = "pray-against-player";
export const RUNELITE_PRAY_AGAINST_PLAYER_CONFIG_GROUP = "prayagainstplayer";
export const RUNELITE_PRAY_AGAINST_PLAYER_PROTECTION_ICON_SIZE = 33;
export const RUNELITE_PRAY_AGAINST_PLAYER_ICON_OUTLINE_COLOR = "rgb(33, 33, 33)";
export const RUNELITE_PRAY_AGAINST_PLAYER_GAME_TICK_MS = 600;
export const RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_PLUGIN =
  'PrayAgainstPlayerPlugin @PluginDescriptor(name = "Pray Against Player", type = PluginType.PVP, enabledByDefault = false)';
export const RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_OVERLAY =
  "PrayAgainstPlayerOverlay setLayer(ABOVE_SCENE) setPosition(DYNAMIC) setPriority(HIGH)";
export const RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_WEAPON_TYPE =
  "WeaponType.checkWeaponOnPlayer itemDefinition.getName().toLowerCase contains melee/ranged/magic name tables";
export const RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_ICON =
  "ProtectionIconFromSprite spriteManager.getSprite(SpriteID.PRAYER_PROTECT_FROM_*) resizeCanvas(33,33) outlineImage(Color(33,33,33))";
export const RUNELITE_PRAY_AGAINST_PLAYER_SOURCE_PRAYER_TAB_OVERLAY =
  "PrayAgainstPlayerOverlayPrayerTab setPosition(DETACHED) setLayer(ALWAYS_ON_TOP) draw WidgetInfo.PRAYER_PROTECT_FROM_* bounds";

export const RUNELITE_PRAY_AGAINST_PLAYER_PRAYER_ICON_SPRITES: Readonly<Record<RunelitePrayAgainstPlayerProtectionPrayerId, number>> = {
  protect_from_magic: 127,
  protect_from_missiles: 128,
  protect_from_melee: 129
};

const meleeWeaponNames = [
  "sword",
  "scimitar",
  "dagger",
  "spear",
  "mace",
  "axe",
  "whip",
  "tentacle",
  "-ket-",
  "-xil-",
  "warhammer",
  "halberd",
  "claws",
  "hasta",
  "scythe",
  "maul",
  "anchor",
  "sabre",
  "excalibur",
  "machete",
  "dragon hunter lance",
  "event rpg",
  "silverlight",
  "darklight",
  "arclight",
  "flail",
  "granite hammer",
  "rapier",
  "bulwark"
] as const;

const rangedWeaponNames = [
  "bow",
  "blowpipe",
  "xil-ul",
  "knife",
  "dart",
  "thrownaxe",
  "chinchompa",
  "ballista"
] as const;

const magicWeaponNames = [
  "staff",
  "trident",
  "wand",
  "dawnbringer"
] as const;

export function runelitePrayAgainstPlayerWeaponTypeFromEquipment(
  equipment: VisibleEquipment
): { readonly weaponType: RunelitePrayAgainstPlayerWeaponType; readonly weaponName: string } {
  const weapon = equipment.weapon;
  const weaponName = weapon?.name ?? "Unarmed";
  const lowerName = weaponName.toLowerCase();

  if (!weapon || weapon.itemId === -1 || lowerName.includes("null")) {
    return { weaponType: "WEAPON_MELEE", weaponName };
  }

  if (meleeWeaponNames.some((name) => lowerName.includes(name)) && !lowerName.includes("thrownaxe")) {
    return { weaponType: "WEAPON_MELEE", weaponName };
  }

  if (rangedWeaponNames.some((name) => lowerName.includes(name))) {
    return { weaponType: "WEAPON_RANGED", weaponName };
  }

  if (magicWeaponNames.some((name) => lowerName.includes(name))) {
    return { weaponType: "WEAPON_MAGIC", weaponName };
  }

  return { weaponType: "WEAPON_UNKNOWN", weaponName };
}

export function runelitePrayAgainstPlayerPrayerForWeaponType(
  weaponType: RunelitePrayAgainstPlayerWeaponType
): RunelitePrayAgainstPlayerProtectionPrayerId | null {
  if (weaponType === "WEAPON_MELEE") {
    return "protect_from_melee";
  }
  if (weaponType === "WEAPON_RANGED") {
    return "protect_from_missiles";
  }
  if (weaponType === "WEAPON_MAGIC") {
    return "protect_from_magic";
  }
  return null;
}

export function runelitePrayAgainstPlayerOverlaySnapshotsFromCombatState(
  combatState: RuntimePlayerCombatState,
  config: RunelitePrayAgainstPlayerConfigSnapshot
): readonly RunelitePrayAgainstPlayerOverlaySnapshot[] {
  if (!config.enabled) {
    return [];
  }

  return Object.values(combatState.actors).flatMap((actor) => {
    if (actor.id === "local-player") {
      return [];
    }

    const relation = runelitePrayAgainstPlayerRelation(actor, combatState, config);
    if (!relation) {
      return [];
    }
    if (relation === "attacker" && !config.drawTargetPrayAgainst) {
      return [];
    }
    if (relation === "potential" && !config.drawPotentialTargetPrayAgainst) {
      return [];
    }

    const { weaponType, weaponName } = runelitePrayAgainstPlayerWeaponTypeFromEquipment(actor.equipment);
    const prayerId = runelitePrayAgainstPlayerPrayerForWeaponType(weaponType);
    if (!prayerId) {
      return [];
    }

    return [
      {
        id: `runelite-pray-against-player-${actor.id}-${relation}`,
        actorId: actor.id,
        relation,
        weaponType,
        weaponName,
        prayerId,
        spriteId: RUNELITE_PRAY_AGAINST_PLAYER_PRAYER_ICON_SPRITES[prayerId],
        color: relation === "attacker" ? config.attackerPlayerColor : config.potentialPlayerColor,
        logicalOffsetClientUnits: config.logicalHeightClientUnits / 2 + 75
      }
    ];
  });
}

function runelitePrayAgainstPlayerRelation(
  actor: RuntimePlayerCombatActorState,
  combatState: RuntimePlayerCombatState,
  config: RunelitePrayAgainstPlayerConfigSnapshot
): RunelitePrayAgainstPlayerRelation | null {
  if (runelitePrayAgainstPlayerAttackedLocalRecently(actor.id, combatState, config.attackerTargetTimeoutSeconds)) {
    return "attacker";
  }

  if (actor.targetId === "local-player" || actor.lastTargetId === "local-player") {
    return "potential";
  }

  if (runelitePrayAgainstPlayerPotentialRecently(actor.id, combatState, config.potentialTargetTimeoutSeconds)) {
    return "potential";
  }

  return null;
}

function runelitePrayAgainstPlayerAttackedLocalRecently(
  actorId: RuntimeActorId,
  combatState: RuntimePlayerCombatState,
  timeoutSeconds: number
): boolean {
  return combatState.events.some(
    (event) =>
      event.kind === "attack" &&
      event.attackerId === actorId &&
      event.defenderId === "local-player" &&
      event.tick >= runelitePrayAgainstPlayerLowerBoundTick(combatState, timeoutSeconds)
  );
}

function runelitePrayAgainstPlayerPotentialRecently(
  actorId: RuntimeActorId,
  combatState: RuntimePlayerCombatState,
  timeoutSeconds: number
): boolean {
  return combatState.events.some(
    (event) =>
      runelitePrayAgainstPlayerEventTargetsLocal(event) &&
      "attackerId" in event &&
      event.attackerId === actorId &&
      event.tick >= runelitePrayAgainstPlayerLowerBoundTick(combatState, timeoutSeconds)
  );
}

function runelitePrayAgainstPlayerEventTargetsLocal(event: RuntimePlayerCombatEvent): boolean {
  if (event.kind === "attack") {
    return event.defenderId === "local-player";
  }
  if (event.kind === "hitsplat") {
    return event.targetActorId === "local-player";
  }
  return false;
}

function runelitePrayAgainstPlayerLowerBoundTick(combatState: RuntimePlayerCombatState, timeoutSeconds: number): number {
  const timeoutTicks = Math.ceil((Math.max(0, timeoutSeconds) * 1000) / RUNELITE_PRAY_AGAINST_PLAYER_GAME_TICK_MS);
  return combatState.tick - timeoutTicks;
}
