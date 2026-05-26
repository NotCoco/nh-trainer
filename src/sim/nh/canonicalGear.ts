import type { VisibleEquipment, VisibleEquipmentItem } from "../clientView";

const item = (itemId: number, name: string): VisibleEquipmentItem => ({ itemId, name });

export const canonicalNhGear = {
  serpentineHelm: item(12929, "Serpentine helm (uncharged)"),
  barrowsGloves: item(7462, "Barrows gloves"),
  dragonBoots: item(11840, "Dragon boots"),
  ringOfSuffering: item(19710, "Ring of suffering (i)"),
  dragonstoneDragonBolts: item(21948, "Dragonstone dragon bolts (e)"),
  opalDragonBolts: item(21932, "Opal dragon bolts (e)"),

  kodaiWand: item(21006, "Kodai wand"),
  ancientStaff: item(4675, "Ancient staff"),
  staffOfTheDead: item(11791, "Staff of the dead"),
  imbuedSaradominCape: item(21791, "Imbued saradomin cape"),
  occultNecklace: item(12002, "Occult necklace"),
  ahrimsRobetop: item(4712, "Ahrim's robetop"),
  magesBook: item(6889, "Mage's book"),
  ahrimsRobeskirt: item(4714, "Ahrim's robeskirt"),

  armadylCrossbow: item(11785, "Armadyl crossbow"),
  runeCrossbow: item(9185, "Rune crossbow"),
  magicShortbow: item(861, "Magic shortbow"),
  dragonCrossbow: item(21902, "Dragon crossbow"),
  avasAssembler: item(22109, "Ava's assembler"),
  necklaceOfAnguish: item(19547, "Necklace of anguish"),
  armadylChestplate: item(11828, "Armadyl chestplate"),
  armadylChainskirt: item(11830, "Armadyl chainskirt"),

  abyssalTentacle: item(12006, "Abyssal tentacle"),
  abyssalWhip: item(4151, "Abyssal whip"),
  dragonDefender: item(12954, "Dragon defender"),
  avernicDefender: item(22322, "Avernic defender"),
  fireCape: item(6570, "Fire cape"),
  amuletOfTorture: item(19553, "Amulet of torture"),
  bandosChestplate: item(11832, "Bandos chestplate"),
  bandosTassets: item(11834, "Bandos tassets"),
  armadylGodsword: item(11802, "Armadyl godsword"),
  graniteMaul: item(4153, "Granite maul")
} as const;

const commonNhEquipment = {
  head: canonicalNhGear.serpentineHelm,
  hands: canonicalNhGear.barrowsGloves,
  feet: canonicalNhGear.dragonBoots,
  ring: canonicalNhGear.ringOfSuffering,
  ammo: canonicalNhGear.dragonstoneDragonBolts
} as const;

export const canonicalNhLoadoutEquipment = {
  "kodai-robes": {
    ...commonNhEquipment,
    cape: canonicalNhGear.imbuedSaradominCape,
    amulet: canonicalNhGear.occultNecklace,
    weapon: canonicalNhGear.kodaiWand,
    body: canonicalNhGear.ahrimsRobetop,
    shield: canonicalNhGear.magesBook,
    legs: canonicalNhGear.ahrimsRobeskirt
  },
  "acb-hides": {
    ...commonNhEquipment,
    cape: canonicalNhGear.avasAssembler,
    amulet: canonicalNhGear.necklaceOfAnguish,
    weapon: canonicalNhGear.armadylCrossbow,
    body: canonicalNhGear.armadylChestplate,
    shield: canonicalNhGear.magesBook,
    legs: canonicalNhGear.armadylChainskirt
  },
  "tentacle-bandos": {
    ...commonNhEquipment,
    cape: canonicalNhGear.fireCape,
    amulet: canonicalNhGear.amuletOfTorture,
    weapon: canonicalNhGear.abyssalTentacle,
    body: canonicalNhGear.bandosChestplate,
    shield: canonicalNhGear.avernicDefender,
    legs: canonicalNhGear.bandosTassets
  },
  "ags-bandos": {
    ...commonNhEquipment,
    cape: canonicalNhGear.fireCape,
    amulet: canonicalNhGear.amuletOfTorture,
    weapon: canonicalNhGear.armadylGodsword,
    body: canonicalNhGear.bandosChestplate,
    legs: canonicalNhGear.bandosTassets
  },
  "gmaul-bandos": {
    ...commonNhEquipment,
    cape: canonicalNhGear.fireCape,
    amulet: canonicalNhGear.amuletOfTorture,
    weapon: canonicalNhGear.graniteMaul,
    body: canonicalNhGear.bandosChestplate,
    legs: canonicalNhGear.bandosTassets
  }
} as const satisfies Readonly<Record<string, VisibleEquipment>>;

export const canonicalNhLoadoutItemIds = {
  "kodai-robes": [12929, 21791, 12002, 21006, 4712, 6889, 4714, 7462, 11840, 19710, 21948],
  "acb-hides": [12929, 22109, 19547, 11785, 11828, 6889, 11830, 7462, 11840, 19710, 21948],
  "tentacle-bandos": [12929, 6570, 19553, 12006, 11832, 22322, 11834, 7462, 11840, 19710, 21948],
  "ags-bandos": [12929, 6570, 19553, 11802, 11832, 11834, 7462, 11840, 19710, 21948],
  "gmaul-bandos": [12929, 6570, 19553, 4153, 11832, 11834, 7462, 11840, 19710, 21948]
} as const;

export const canonicalNhSwitchItemIds = [
  12929,
  21791,
  12002,
  21006,
  4675,
  4712,
  6889,
  4714,
  7462,
  11840,
  19710,
  21948,
  11785,
  9185,
  861,
  21902,
  22109,
  19547,
  11828,
  11830,
  12006,
  4151,
  12954,
  22322,
  6570,
  19553,
  11832,
  11834,
  11802,
  4153
] as const;
