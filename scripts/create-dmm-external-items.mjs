import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const externalItemsDir = path.join(projectRoot, "fixtures", "external-items");
const iconsDir = path.join(externalItemsDir, "icons");
const fixturePath = path.join(externalItemsDir, "dmm-gear.json");

const wiki = (page) => `https://oldschool.runescape.wiki/w/${page}`;
const iconUrl = (id) => `https://static.runelite.net/cache/item/icon/${id}.png`;

const zeroBonuses = {
  stab_attack_bonus: 0,
  slash_attack_bonus: 0,
  crush_attack_bonus: 0,
  magic_attack_bonus: 0,
  range_attack_bonus: 0,
  stab_defence_bonus: 0,
  slash_defence_bonus: 0,
  crush_defence_bonus: 0,
  magic_defence_bonus: 0,
  range_defence_bonus: 0,
  melee_strength_bonus: 0,
  ranged_strength_bonus: 0,
  magic_damage_bonus: 0,
  prayer_bonus: 0
};

const weaponTypes = {
  SWORD: {
    config: 17,
    maxDistance: 1,
    attackTicks: 4,
    attackAnimation: 386,
    defendAnimation: 388,
    equipSound: 2242,
    attackSound: 2500,
    attackSets: [
      { child: 3, type: "ACCURATE", style: "STAB" },
      { child: 7, type: "AGGRESSIVE", style: "STAB" },
      { child: 11, type: "AGGRESSIVE", style: "SLASH", attackAnimation: 390 },
      { child: 15, type: "DEFENSIVE", style: "STAB" }
    ],
    renderAnimations: [808, 823, 819, 820, 821, 822, 824],
    source: "kronos-server:data/items/weapon_types.json:SWORD"
  },
  VESTA_LONGSWORD: {
    config: 9,
    maxDistance: 1,
    attackTicks: 5,
    attackAnimation: 390,
    defendAnimation: 388,
    equipSound: 2242,
    attackSound: 2500,
    attackSets: [
      { child: 3, type: "ACCURATE", style: "SLASH" },
      { child: 7, type: "AGGRESSIVE", style: "SLASH" },
      { child: 11, type: "CONTROLLED", style: "STAB", attackAnimation: 386 },
      { child: 15, type: "DEFENSIVE", style: "SLASH" }
    ],
    renderAnimations: [809, 823, 819, 820, 821, 822, 824],
    source: "kronos-server:data/items/weapon_types.json:VESTA_LONGSWORD"
  }
};

const items = [
  equip({
    id: 12931,
    name: "Serpentine helm",
    page: "Serpentine_helm",
    slot: 0,
    tradeable: true,
    hideHair: true,
    hideBeard: true,
    weight: 2.267,
    protectValue: 2806497,
    requirements: { defence: 75 },
    bonuses: {
      magic_attack_bonus: -5,
      range_attack_bonus: -5,
      stab_defence_bonus: 52,
      slash_defence_bonus: 55,
      crush_defence_bonus: 58,
      range_defence_bonus: 50,
      melee_strength_bonus: 5
    }
  }),
  equip({
    id: 26382,
    name: "Torva full helm",
    page: "Torva_full_helm",
    slot: 0,
    tradeable: true,
    hideHair: true,
    hideBeard: true,
    weight: 2.721,
    protectValue: 500000,
    requirements: { defence: 80 },
    bonuses: {
      magic_attack_bonus: -5,
      range_attack_bonus: -5,
      stab_defence_bonus: 59,
      slash_defence_bonus: 60,
      crush_defence_bonus: 62,
      magic_defence_bonus: -2,
      range_defence_bonus: 57,
      melee_strength_bonus: 8,
      prayer_bonus: 1
    }
  }),
  equip({
    id: 27238,
    name: "Masori body (f)",
    page: "Masori_body_(f)",
    slot: 4,
    tradeable: true,
    weight: 6,
    protectValue: 500000,
    requirements: { defence: 30, ranged: 80 },
    bonuses: {
      magic_attack_bonus: -4,
      range_attack_bonus: 43,
      stab_defence_bonus: 59,
      slash_defence_bonus: 52,
      crush_defence_bonus: 64,
      magic_defence_bonus: 74,
      range_defence_bonus: 60,
      ranged_strength_bonus: 4,
      prayer_bonus: 1
    }
  }),
  equip({
    id: 26386,
    name: "Torva platelegs",
    page: "Torva_platelegs",
    slot: 7,
    tradeable: true,
    weight: 9.071,
    protectValue: 500000,
    requirements: { defence: 80 },
    bonuses: {
      magic_attack_bonus: -24,
      range_attack_bonus: -11,
      stab_defence_bonus: 87,
      slash_defence_bonus: 78,
      crush_defence_bonus: 79,
      magic_defence_bonus: -9,
      range_defence_bonus: 102,
      melee_strength_bonus: 4,
      prayer_bonus: 1
    }
  }),
  equip({
    id: 27251,
    name: "Elidinis' ward (f)",
    page: "Elidinis%27_ward_(f)",
    slot: 5,
    tradeable: true,
    weight: 2,
    protectValue: 500000,
    requirements: { defence: 80, magic: 80 },
    bonuses: {
      magic_attack_bonus: 25,
      stab_defence_bonus: 53,
      slash_defence_bonus: 55,
      crush_defence_bonus: 73,
      magic_defence_bonus: 2,
      range_defence_bonus: 52,
      magic_damage_bonus: 5,
      prayer_bonus: 4
    }
  }),
  equip({
    id: 22647,
    name: "Zuriel's staff (Deadman Mode)",
    page: "Zuriel%27s_staff_(Deadman_Mode)",
    slot: 3,
    weaponType: "MAGIC_STAFF",
    tradeable: true,
    weight: 0,
    protectValue: 500000,
    requirements: { attack: 78, magic: 78 },
    bonuses: {
      stab_attack_bonus: 13,
      slash_attack_bonus: -1,
      crush_attack_bonus: 65,
      magic_attack_bonus: 18,
      stab_defence_bonus: 5,
      slash_defence_bonus: 7,
      crush_defence_bonus: 4,
      magic_defence_bonus: 18,
      melee_strength_bonus: 72,
      magic_damage_bonus: 10
    }
  }),
  equip({
    id: 26243,
    name: "Virtus robe top",
    page: "Virtus_robe_top",
    slot: 4,
    tradeable: true,
    weight: 0.907,
    protectValue: 500000,
    requirements: { defence: 75, magic: 80 },
    bonuses: {
      magic_attack_bonus: 35,
      range_attack_bonus: -11,
      stab_defence_bonus: 47,
      slash_defence_bonus: 36,
      crush_defence_bonus: 56,
      magic_defence_bonus: 31,
      magic_damage_bonus: 2,
      prayer_bonus: 2
    }
  }),
  equip({
    id: 26245,
    name: "Virtus robe bottom",
    page: "Virtus_robe_bottom",
    slot: 7,
    tradeable: true,
    weight: 0.907,
    protectValue: 500000,
    requirements: { defence: 75, magic: 80 },
    bonuses: {
      magic_attack_bonus: 26,
      range_attack_bonus: -9,
      stab_defence_bonus: 31,
      slash_defence_bonus: 28,
      crush_defence_bonus: 34,
      magic_defence_bonus: 22,
      magic_damage_bonus: 2,
      prayer_bonus: 1
    }
  }),
  equip({
    id: 26374,
    name: "Zaryte crossbow",
    page: "Zaryte_crossbow",
    slot: 3,
    weaponType: "ARMADYL_CROSSBOW",
    rangedWeapon: "CROSSBOW",
    tradeable: true,
    weight: 6,
    protectValue: 500000,
    requirements: { ranged: 80 },
    specialAttack: { drainPercent: 75, source: "osrs-wiki:zaryte-crossbow-special" },
    bonuses: {
      range_attack_bonus: 110,
      stab_defence_bonus: 14,
      slash_defence_bonus: 14,
      crush_defence_bonus: 12,
      magic_defence_bonus: 15,
      range_defence_bonus: 16,
      prayer_bonus: 1
    }
  }),
  equip({
    id: 21950,
    name: "Onyx dragon bolts (e)",
    page: "Onyx_dragon_bolts_(e)",
    slot: 13,
    tradeable: true,
    weight: 0,
    protectValue: 600,
    requirements: { ranged: 64 },
    bonuses: {
      ranged_strength_bonus: 122
    }
  }),
  equip({
    id: 31097,
    name: "Avernic treads (max)",
    page: "Avernic_treads_(max)",
    slot: 10,
    tradeable: true,
    weight: 0,
    protectValue: 500000,
    bonuses: {
      stab_attack_bonus: 5,
      slash_attack_bonus: 5,
      crush_attack_bonus: 5,
      magic_attack_bonus: 11,
      range_attack_bonus: 15,
      stab_defence_bonus: 21,
      slash_defence_bonus: 25,
      crush_defence_bonus: 25,
      magic_defence_bonus: 10,
      range_defence_bonus: 10,
      melee_strength_bonus: 6,
      ranged_strength_bonus: 3,
      magic_damage_bonus: 2
    }
  }),
  equip({
    id: 31106,
    name: "Confliction gauntlets",
    page: "Confliction_gauntlets",
    slot: 9,
    tradeable: true,
    weight: 0,
    protectValue: 500000,
    bonuses: {
      magic_attack_bonus: 20,
      range_attack_bonus: -4,
      stab_defence_bonus: 15,
      slash_defence_bonus: 18,
      crush_defence_bonus: 7,
      magic_defence_bonus: 5,
      range_defence_bonus: 5,
      magic_damage_bonus: 7,
      prayer_bonus: 2
    }
  }),
  equip({
    id: 27690,
    name: "Voidwaker",
    page: "Voidwaker",
    slot: 3,
    weaponType: "SWORD",
    tradeable: true,
    weight: 1.814,
    protectValue: 500000,
    requirements: { attack: 75, magic: 60 },
    specialAttack: { drainPercent: 50, source: "runelite-pvp-damage-calc:voidwaker" },
    bonuses: {
      stab_attack_bonus: 70,
      slash_attack_bonus: 80,
      crush_attack_bonus: -2,
      magic_attack_bonus: 5,
      slash_defence_bonus: 1,
      magic_defence_bonus: 2,
      melee_strength_bonus: 80
    }
  }),
  equip({
    id: 22613,
    name: "Vesta's longsword (Deadman Mode)",
    page: "Vesta%27s_longsword_(Deadman_Mode)",
    slot: 3,
    weaponType: "VESTA_LONGSWORD",
    tradeable: true,
    weight: 1.814,
    protectValue: 500000,
    requirements: { attack: 78 },
    specialAttack: { drainPercent: 25, source: "osrs-wiki:vesta-longsword-deadman-mode" },
    bonuses: {
      stab_attack_bonus: 106,
      slash_attack_bonus: 121,
      crush_attack_bonus: -2,
      stab_defence_bonus: 1,
      slash_defence_bonus: 4,
      crush_defence_bonus: 3,
      melee_strength_bonus: 118
    }
  }),
  inventory({
    id: 28561,
    name: "Trinket of vengeance",
    page: "Trinket_of_vengeance",
    tradeable: false,
    stackable: 1,
    weight: 0,
    protectValue: 0,
    interfaceOptions: ["Cast", null, null, null, "Drop"]
  })
];

items[0].weaponTypes = weaponTypes;

await mkdir(iconsDir, { recursive: true });
for (const item of items) {
  await downloadIcon(item.id, item.iconPath);
}

await writeFile(
  fixturePath,
  `${JSON.stringify({ items }, null, 2)}\n`
);

console.log(`wrote ${path.relative(projectRoot, fixturePath)} with ${items.length} DMM items`);

function equip(input) {
  const bonuses = { ...zeroBonuses, ...(input.bonuses ?? {}) };
  const item = baseItem(input, bonuses);
  item.serverItem = {
    ...item.serverItem,
    equipSlot: input.slot,
    weaponType: input.weaponType ?? null,
    rangedWeapon: input.rangedWeapon ?? null,
    twoHanded: input.twoHanded === true,
    hideHair: input.hideHair === true,
    hideBeard: input.hideBeard === true,
    hideArms: input.hideArms === true,
    specialAttack: input.specialAttack ?? null,
    bonuses
  };
  item.equipmentRow = {
    id: input.id,
    name: input.name,
    equipSlot: input.slot,
    weaponType: input.weaponType ?? null,
    twoHanded: input.twoHanded === true,
    bonuses
  };
  return item;
}

function inventory(input) {
  const item = baseItem(input, zeroBonuses);
  item.cacheItem = {
    id: input.id,
    name: input.name,
    resizeX: 128,
    resizeY: 128,
    resizeZ: 128,
    xan2d: 0,
    yan2d: 0,
    zan2d: 0,
    cost: 0,
    isTradeable: input.tradeable === true,
    stackable: input.stackable ?? 0,
    inventoryModel: -1,
    members: true,
    zoom2d: 2000,
    xOffset2d: 0,
    yOffset2d: 0,
    ambient: 0,
    contrast: 0,
    options: [null, null, null, null, null],
    interfaceOptions: input.interfaceOptions ?? [null, null, null, null, "Drop"],
    maleModel0: -1,
    maleModel1: -1,
    maleModel2: -1,
    maleOffset: 0,
    maleHeadModel: -1,
    maleHeadModel2: -1,
    femaleModel0: -1,
    femaleModel1: -1,
    femaleModel2: -1,
    femaleOffset: 0,
    femaleHeadModel: -1,
    femaleHeadModel2: -1,
    notedID: -1,
    notedTemplate: -1,
    team: 0,
    shiftClickDropIndex: -2,
    boughtId: -1,
    boughtTemplateId: -1,
    placeholderId: -1,
    placeholderTemplateId: -1,
    source: "external:runelite-static-cache-icon"
  };
  return item;
}

function baseItem(input, bonuses) {
  const slug = input.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return {
    id: input.id,
    name: input.name,
    sources: [
      wiki(input.page),
      "https://prices.runescape.wiki/api/v1/osrs/mapping",
      iconUrl(input.id)
    ],
    iconPath: `fixtures/external-items/icons/${slug}.png`,
    serverItem: {
      id: input.id,
      name: input.name,
      source: `external:osrs-wiki:${slug}`,
      tradeable: input.tradeable === true,
      equipSlot: null,
      weaponType: null,
      rangedWeapon: null,
      twoHanded: false,
      hideHair: false,
      hideBeard: false,
      hideArms: false,
      specialAttack: null,
      weight: input.weight ?? 0,
      protectValue: input.protectValue ?? 0,
      requirements: {
        attack: input.requirements?.attack ?? 0,
        strength: input.requirements?.strength ?? 0,
        defence: input.requirements?.defence ?? 0,
        ranged: input.requirements?.ranged ?? 0,
        magic: input.requirements?.magic ?? 0
      },
      bonuses
    }
  };
}

async function downloadIcon(itemId, relativeIconPath) {
  const target = path.join(projectRoot, ...relativeIconPath.split(/[\\/]/));
  const response = await fetch(iconUrl(itemId), {
    headers: {
      "User-Agent": "KronosNHTrainer external item fixture generator"
    }
  });
  if (!response.ok) {
    throw new Error(`failed to download icon ${itemId}: ${response.status}`);
  }
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}
