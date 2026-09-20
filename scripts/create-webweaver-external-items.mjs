import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Webweaver (risk fighting) mode item fixtures.
// Sources: OSRS wiki infobox ids (fetched 2026-08-06), kronos-server item_info
// ids for the 184-era server where present, live static runelite cache icons.
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const externalItemsDir = path.join(projectRoot, "fixtures", "external-items");
const iconsDir = path.join(externalItemsDir, "icons");
const fixturePath = path.join(externalItemsDir, "webweaver-gear.json");

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

const webweaverBowType = {
  config: 3,
  maxDistance: 9,
  attackTicks: 4,
  attackAnimation: 426,
  defendAnimation: 424,
  equipSound: 2244,
  attackSound: 2693,
  attackSets: [
    { child: 3, type: "ACCURATE", style: "RANGED" },
    { child: 7, type: "RAPID_RANGED", style: "RANGED" },
    { child: 15, type: "LONG_RANGED", style: "RANGED" }
  ],
  renderAnimations: [808, 823, 819, 820, 821, 822, 824],
  source: "kronos-server:data/items/weapon_types.json:WEBWEAVER_BOW (4 ticks, 3 on rapid)"
};

const elderMaulType = {
  config: 2,
  maxDistance: 1,
  attackTicks: 6,
  attackAnimation: 7516,
  defendAnimation: 7517,
  equipSound: 2244,
  attackSound: 3846,
  attackSets: [
    { child: 3, type: "ACCURATE", style: "CRUSH" },
    { child: 7, type: "AGGRESSIVE", style: "CRUSH" },
    { child: 15, type: "DEFENSIVE", style: "CRUSH" }
  ],
  renderAnimations: [7518, 7520, 7520, 7520, 7520, 7520, 7519],
  source: "kronos-server:data/items/weapon_types.json:ELDER_MAUL (elder maul 6-tick override)"
};

const items = [
  equip({
    id: 27652,
    name: "Webweaver bow (u)",
    page: "Webweaver_bow",
    slot: 3,
    weaponType: "WEBWEAVER_BOW",
    rangedWeapon: "NORMAL_BOW",
    twoHanded: true,
    tradeable: true,
    weight: 0.907,
    protectValue: 3400000,
    requirements: { ranged: 70 },
    specialAttack: { drainPercent: 50, source: "osrs-wiki:webweaver-bow-swarm" },
    bonuses: {
      range_attack_bonus: 85,
      ranged_strength_bonus: 65
    }
  }),
  equip({
    id: 24225,
    name: "Granite maul (ornate handle)",
    page: "Granite_maul_(ornate_handle)",
    slot: 3,
    weaponType: "GRANITE_MAUL",
    twoHanded: true,
    tradeable: false,
    weight: 4.535,
    protectValue: 50000,
    requirements: { attack: 50, strength: 50 },
    specialAttack: { drainPercent: 50, source: "osrs-wiki:granite-maul-ornate-handle" },
    bonuses: {
      crush_attack_bonus: 81,
      melee_strength_bonus: 79
    }
  }),
  equip({
    id: 21003,
    name: "Elder maul",
    page: "Elder_maul",
    slot: 3,
    weaponType: "ELDER_MAUL",
    twoHanded: true,
    tradeable: true,
    weight: 6,
    protectValue: 280000,
    requirements: { attack: 75, strength: 75 },
    specialAttack: { drainPercent: 50, source: "osrs-wiki:elder-maul-pulverize" },
    bonuses: {
      crush_attack_bonus: 135,
      melee_strength_bonus: 147
    }
  }),
  equip({
    id: 23246,
    name: "Fremennik kilt",
    page: "Fremennik_kilt",
    slot: 7,
    tradeable: true,
    weight: 0.9,
    protectValue: 12000,
    bonuses: {
      magic_attack_bonus: -21,
      range_attack_bonus: -7,
      stab_defence_bonus: 11,
      slash_defence_bonus: 10,
      crush_defence_bonus: 10,
      magic_defence_bonus: -4,
      range_defence_bonus: 10,
      melee_strength_bonus: 1
    }
  }),
  equip({
    id: 29801,
    name: "Amulet of rancour",
    page: "Amulet_of_rancour",
    slot: 2,
    tradeable: false,
    weight: 0.01,
    protectValue: 1200000,
    bonuses: {
      stab_attack_bonus: 25,
      slash_attack_bonus: 25,
      crush_attack_bonus: 25,
      magic_attack_bonus: -6,
      range_attack_bonus: -8,
      melee_strength_bonus: 12,
      prayer_bonus: 2
    }
  }),
  equip({
    id: 21295,
    name: "Infernal cape",
    page: "Infernal_cape",
    slot: 1,
    tradeable: false,
    weight: 1.814,
    protectValue: 1200000,
    bonuses: {
      stab_attack_bonus: 4,
      slash_attack_bonus: 4,
      crush_attack_bonus: 4,
      magic_attack_bonus: 1,
      range_attack_bonus: 1,
      stab_defence_bonus: 12,
      slash_defence_bonus: 12,
      crush_defence_bonus: 12,
      magic_defence_bonus: 12,
      range_defence_bonus: 12,
      melee_strength_bonus: 8,
      prayer_bonus: 2
    }
  }),
  equip({
    id: 2550,
    name: "Ring of recoil",
    page: "Ring_of_recoil",
    slot: 12,
    tradeable: true,
    weight: 0.004,
    protectValue: 900,
    bonuses: {}
  }),
  inventory({
    id: 7218,
    name: "Summer pie",
    page: "Summer_pie",
    tradeable: true,
    weight: 0.2,
    interfaceOptions: ["Eat", null, null, null, "Drop"]
  }),
  inventory({
    id: 7220,
    name: "Half summer pie",
    page: "Summer_pie",
    tradeable: true,
    weight: 0.1,
    interfaceOptions: ["Eat", null, null, null, "Drop"]
  }),
  inventory({
    id: 2313,
    name: "Pie dish",
    page: "Pie_dish",
    tradeable: true,
    weight: 0.1,
    interfaceOptions: [null, null, null, null, "Drop"]
  }),
  inventory({
    id: 32336,
    name: "Halibut",
    page: "Halibut",
    tradeable: true,
    weight: 0.4,
    interfaceOptions: ["Eat", null, null, null, "Drop"]
  }),
  inventory({
    id: 32352,
    name: "Marlin",
    page: "Marlin",
    tradeable: true,
    weight: 0.4,
    interfaceOptions: ["Eat", null, null, null, "Drop"]
  }),
  inventory({
    id: 11722,
    name: "Super ranging (4)",
    page: "Super_ranging",
    tradeable: false,
    weight: 0.035,
    interfaceOptions: ["Drink", null, null, null, "Drop"]
  }),
  inventory({
    id: 11723,
    name: "Super ranging (3)",
    page: "Super_ranging",
    tradeable: false,
    weight: 0.035,
    interfaceOptions: ["Drink", null, null, null, "Drop"]
  }),
  inventory({
    id: 11724,
    name: "Super ranging (2)",
    page: "Super_ranging",
    tradeable: false,
    weight: 0.035,
    interfaceOptions: ["Drink", null, null, null, "Drop"]
  }),
  inventory({
    id: 11725,
    name: "Super ranging (1)",
    page: "Super_ranging",
    tradeable: false,
    weight: 0.035,
    interfaceOptions: ["Drink", null, null, null, "Drop"]
  }),
  inventory({
    id: 9075,
    name: "Astral rune",
    page: "Astral_rune",
    tradeable: true,
    stackable: 1,
    weight: 0,
    interfaceOptions: [null, null, null, null, "Drop"]
  }),
  inventory({
    id: 560,
    name: "Death rune",
    page: "Death_rune",
    tradeable: true,
    stackable: 1,
    weight: 0,
    interfaceOptions: [null, null, null, null, "Drop"]
  }),
  inventory({
    id: 557,
    name: "Earth rune",
    page: "Earth_rune",
    tradeable: true,
    stackable: 1,
    weight: 0,
    interfaceOptions: [null, null, null, null, "Drop"]
  })
];

items[0].weaponTypes = { WEBWEAVER_BOW: webweaverBowType };
items[2].weaponTypes = { ELDER_MAUL: elderMaulType };

await mkdir(iconsDir, { recursive: true });
for (const item of items) {
  await downloadIcon(item.id, item.iconPath);
}

await writeFile(fixturePath, `${JSON.stringify({ items }, null, 2)}\n`);

console.log(`wrote ${path.relative(projectRoot, fixturePath)} with ${items.length} webweaver items`);

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
    headers: { "User-Agent": "kronos-nh-trainer/0.1 (external item fixture)" }
  });
  if (!response.ok) {
    throw new Error(`icon ${itemId} fetch failed: ${response.status}`);
  }
  await writeFile(target, Buffer.from(await response.arrayBuffer()));
}
