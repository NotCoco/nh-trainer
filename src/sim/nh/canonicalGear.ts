import type { VisibleEquipment, VisibleEquipmentItem } from "../clientView";

const item = (itemId: number, name: string): VisibleEquipmentItem => ({ itemId, name });

export const canonicalNhGear = {
  helmOfNeitiznot: item(10828, "Helm of neitiznot"),
  barrowsGloves: item(7462, "Barrows gloves"),
  dragonBoots: item(11840, "Dragon boots"),
  seersRingI: item(11770, "Seers ring (i)"),
  dragonstoneDragonBolts: item(21948, "Dragonstone dragon bolts (e)"),
  opalDragonBolts: item(21932, "Opal dragon bolts (e)"),

  kodaiWand: item(21006, "Kodai wand"),
  ancientStaff: item(4675, "Ancient staff"),
  staffOfTheDead: item(11791, "Staff of the dead"),
  imbuedSaradominCape: item(21791, "Imbued saradomin cape"),
  amuletOfFury: item(6585, "Amulet of fury"),
  occultNecklace: item(12002, "Occult necklace"),
  mysticRobeTop: item(4091, "Mystic robe top"),
  mysticRobeBottom: item(4093, "Mystic robe bottom"),
  ahrimsRobetop: item(4712, "Ahrim's robetop"),
  blessedSpiritShield: item(12831, "Blessed spirit shield"),
  magesBook: item(6889, "Mage's book"),
  ahrimsRobeskirt: item(4714, "Ahrim's robeskirt"),

  armadylCrossbow: item(11785, "Armadyl crossbow"),
  runeCrossbow: item(9185, "Rune crossbow"),
  magicShortbow: item(861, "Magic shortbow"),
  dragonCrossbow: item(21902, "Dragon crossbow"),
  avasAssembler: item(22109, "Ava's assembler"),
  necklaceOfAnguish: item(19547, "Necklace of anguish"),
  karilsLeathertop: item(4736, "Karil's leathertop"),
  veracsPlateskirt: item(4759, "Verac's plateskirt"),
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
  head: canonicalNhGear.helmOfNeitiznot,
  cape: canonicalNhGear.imbuedSaradominCape,
  amulet: canonicalNhGear.amuletOfFury,
  hands: canonicalNhGear.barrowsGloves,
  feet: canonicalNhGear.dragonBoots,
  ring: canonicalNhGear.seersRingI,
  ammo: canonicalNhGear.opalDragonBolts
} as const;

export const canonicalNhLoadoutEquipment = {
  "kodai-robes": {
    ...commonNhEquipment,
    weapon: canonicalNhGear.staffOfTheDead,
    body: canonicalNhGear.mysticRobeTop,
    shield: canonicalNhGear.blessedSpiritShield,
    legs: canonicalNhGear.mysticRobeBottom
  },
  "acb-hides": {
    ...commonNhEquipment,
    weapon: canonicalNhGear.dragonCrossbow,
    body: canonicalNhGear.karilsLeathertop,
    shield: canonicalNhGear.blessedSpiritShield,
    legs: canonicalNhGear.veracsPlateskirt
  },
  "tentacle-bandos": {
    ...commonNhEquipment,
    weapon: canonicalNhGear.abyssalTentacle,
    body: canonicalNhGear.karilsLeathertop,
    shield: canonicalNhGear.avernicDefender,
    legs: canonicalNhGear.veracsPlateskirt
  },
  "ags-bandos": {
    ...commonNhEquipment,
    weapon: canonicalNhGear.armadylGodsword,
    body: canonicalNhGear.karilsLeathertop,
    legs: canonicalNhGear.veracsPlateskirt
  },
  "gmaul-bandos": {
    ...commonNhEquipment,
    weapon: canonicalNhGear.graniteMaul,
    body: canonicalNhGear.karilsLeathertop,
    legs: canonicalNhGear.veracsPlateskirt
  }
} as const satisfies Readonly<Record<string, VisibleEquipment>>;

export const canonicalNhLoadoutItemIds = {
  "kodai-robes": [10828, 21791, 6585, 11791, 4091, 12831, 4093, 7462, 11840, 11770, 21932],
  "acb-hides": [10828, 21791, 6585, 21902, 4736, 12831, 4759, 7462, 11840, 11770, 21932],
  "tentacle-bandos": [10828, 21791, 6585, 12006, 4736, 22322, 4759, 7462, 11840, 11770, 21932],
  "ags-bandos": [10828, 21791, 6585, 11802, 4736, 4759, 7462, 11840, 11770, 21932],
  "gmaul-bandos": [10828, 21791, 6585, 4153, 4736, 4759, 7462, 11840, 11770, 21932]
} as const;

export const canonicalNhSwitchItemIds = [
  10828,
  21791,
  6585,
  4675,
  11791,
  4091,
  12831,
  4093,
  7462,
  11840,
  11770,
  21932,
  11785,
  9185,
  861,
  21902,
  4736,
  4759,
  12006,
  4151,
  12954,
  22322,
  11802,
  4153
] as const;
