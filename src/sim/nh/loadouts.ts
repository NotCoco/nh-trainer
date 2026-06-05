import type { VisibleEquipment } from "../clientView";
import type { WeaponTimingProfile } from "../combat/player-combat";
import { nhWeaponProfiles } from "../combat/player-combat";
import { canonicalNhLoadoutEquipment } from "./canonicalGear";

export type NhLoadoutId = "kodai-robes" | "acb-hides" | "tentacle-bandos" | "ags-bandos" | "gmaul-bandos" | "noxious-halberd";
export type NhWeaponId = keyof typeof nhWeaponProfiles;

export interface NhLoadoutDefinition {
  readonly id: NhLoadoutId;
  readonly label: string;
  readonly weaponId: NhWeaponId;
  readonly equipment: VisibleEquipment;
}

export const nhLoadouts = {
  "kodai-robes": {
    id: "kodai-robes",
    label: "Staff of the dead Mystic",
    weaponId: "staff_of_the_dead",
    equipment: canonicalNhLoadoutEquipment["kodai-robes"]
  },
  "acb-hides": {
    id: "acb-hides",
    label: "Dragon crossbow Karil's",
    weaponId: "dragon_crossbow",
    equipment: canonicalNhLoadoutEquipment["acb-hides"]
  },
  "tentacle-bandos": {
    id: "tentacle-bandos",
    label: "Tentacle NH stake",
    weaponId: "tentacle_whip",
    equipment: canonicalNhLoadoutEquipment["tentacle-bandos"]
  },
  "ags-bandos": {
    id: "ags-bandos",
    label: "AGS NH stake",
    weaponId: "armadyl_godsword",
    equipment: canonicalNhLoadoutEquipment["ags-bandos"]
  },
  "gmaul-bandos": {
    id: "gmaul-bandos",
    label: "Granite maul NH stake",
    weaponId: "granite_maul",
    equipment: canonicalNhLoadoutEquipment["gmaul-bandos"]
  },
  "noxious-halberd": {
    id: "noxious-halberd",
    label: "Noxious halberd",
    weaponId: "noxious_halberd",
    equipment: canonicalNhLoadoutEquipment["noxious-halberd"]
  }
} as const satisfies Readonly<Record<NhLoadoutId, NhLoadoutDefinition>>;

export const graniteMaulEquipment: VisibleEquipment = nhLoadouts["gmaul-bandos"].equipment;

export function loadoutForWeapon(weaponId: NhWeaponId): NhLoadoutDefinition {
  if (weaponId === "kodai" || weaponId === "ancient_staff" || weaponId === "staff_of_the_dead" || weaponId === "zuriels_staff") {
    return nhLoadouts["kodai-robes"];
  }
  if (
    weaponId === "armadyl_crossbow" ||
    weaponId === "zaryte_crossbow" ||
    weaponId === "rune_crossbow" ||
    weaponId === "magic_shortbow" ||
    weaponId === "dragon_crossbow"
  ) {
    return nhLoadouts["acb-hides"];
  }
  if (weaponId === "granite_maul") {
    return nhLoadouts["gmaul-bandos"];
  }
  if (weaponId === "armadyl_godsword") {
    return nhLoadouts["ags-bandos"];
  }
  if (weaponId === "noxious_halberd") {
    return nhLoadouts["noxious-halberd"];
  }
  if (weaponId === "voidwaker" || weaponId === "vesta_longsword") {
    return nhLoadouts["tentacle-bandos"];
  }
  return nhLoadouts["tentacle-bandos"];
}

export function visibleEquipmentForWeapon(weaponId: NhWeaponId): VisibleEquipment {
  return loadoutForWeapon(weaponId).equipment;
}

export function weaponProfileForLoadout(loadoutId: NhLoadoutId): WeaponTimingProfile {
  return nhWeaponProfiles[nhLoadouts[loadoutId].weaponId];
}
