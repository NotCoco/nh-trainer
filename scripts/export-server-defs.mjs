import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const nhRoot = path.resolve(projectRoot, "..");
const legacySourceName = ["Kro", "nos"].join("");
const legacySourceNameLower = legacySourceName.toLowerCase();
const serverRoot = path.join(
  nhRoot,
  `${legacySourceNameLower}-osrs-184-master`,
  `${legacySourceNameLower}-osrs-184-master`,
  `${legacySourceName}-master`,
  `${legacySourceNameLower}-server`
);
const outputDir = path.join(projectRoot, "fixtures", "assets", "defs");
const generatedDir = path.join(projectRoot, "src", "generated");

const nhItemIds = [
  3024,
  3144,
  2444,
  391,
  861,
  1201,
  4091,
  4093,
  4151,
  4153,
  4712,
  4714,
  4675,
  4736,
  4738,
  4759,
  6570,
  6585,
  7462,
  6685,
  6889,
  6914,
  9185,
  10828,
  10925,
  11283,
  11770,
  11785,
  11791,
  11802,
  11828,
  11830,
  11832,
  11834,
  11840,
  12002,
  12006,
  12695,
  12791,
  12831,
  12929,
  12954,
  13239,
  13441,
  19547,
  19553,
  19710,
  21006,
  21018,
  21021,
  21024,
  21791,
  21902,
  21932,
  21948,
  22109,
  22296,
  22322,
  22461
];

const itemNames = {
  3024: "Super restore(4)",
  3144: "Cooked karambwan",
  2444: "Ranging potion(4)",
  391: "Manta ray",
  861: "Magic shortbow",
  1201: "Rune kiteshield",
  4091: "Mystic robe top",
  4093: "Mystic robe bottom",
  4151: "Abyssal whip",
  4153: "Granite maul",
  4675: "Ancient staff",
  4712: "Ahrim's robetop",
  4714: "Ahrim's robeskirt",
  4736: "Karil's leathertop",
  4738: "Karil's leatherskirt",
  4759: "Verac's plateskirt",
  6570: "Fire cape",
  6585: "Amulet of fury",
  7462: "Barrows gloves",
  6685: "Saradomin brew(4)",
  6889: "Mage's book",
  6914: "Master wand",
  9185: "Rune crossbow",
  10828: "Helm of neitiznot",
  10925: "Sanfew serum(4)",
  11283: "Dragonfire shield",
  11770: "Seers ring (i)",
  11785: "Armadyl crossbow",
  11791: "Staff of the dead",
  11802: "Armadyl godsword",
  11828: "Armadyl chestplate",
  11830: "Armadyl chainskirt",
  11832: "Bandos chestplate",
  11834: "Bandos tassets",
  11840: "Dragon boots",
  12002: "Occult necklace",
  12006: "Abyssal tentacle",
  12695: "Super combat potion(4)",
  12791: "Rune pouch",
  12831: "Blessed spirit shield",
  12929: "Serpentine helm (uncharged)",
  12954: "Dragon defender",
  13239: "Primordial boots",
  13441: "Anglerfish",
  19547: "Necklace of anguish",
  19553: "Amulet of torture",
  19710: "Ring of suffering (i)",
  21006: "Kodai wand",
  21018: "Ancestral hat",
  21021: "Ancestral robe top",
  21024: "Ancestral robe bottom",
  21791: "Imbued saradomin cape",
  21902: "Dragon crossbow",
  21932: "Opal dragon bolts (e)",
  21948: "Dragonstone dragon bolts (e)",
  22109: "Ava's assembler",
  22296: "Staff of light",
  22322: "Avernic defender",
  22461: "Bastion potion(4)"
};

const bonusKeys = [
  "stab_attack_bonus",
  "slash_attack_bonus",
  "crush_attack_bonus",
  "magic_attack_bonus",
  "range_attack_bonus",
  "stab_defence_bonus",
  "slash_defence_bonus",
  "crush_defence_bonus",
  "magic_defence_bonus",
  "range_defence_bonus",
  "melee_strength_bonus",
  "ranged_strength_bonus",
  "magic_damage_bonus",
  "prayer_bonus"
];

const specialAttackByItemId = {
  4153: {
    drainPercent: 50,
    source: "nh-server:combat.special.melee.GraniteMaul"
  },
  11785: {
    drainPercent: 40,
    source: "nh-server:combat.special.ranged.ArmadylCrossbow"
  },
  11791: {
    drainPercent: 100,
    source: "nh-server:combat.special.magic.StaffOfTheDead"
  },
  11802: {
    drainPercent: 50,
    source: "nh-server:combat.special.melee.ArmadylGodsword"
  },
  12006: {
    drainPercent: 50,
    source: "nh-server:combat.special.melee.AbyssalTentacle"
  },
  22296: {
    drainPercent: 100,
    source: "nh-server:combat.special.magic.StaffOfTheDead"
  }
};

function parseJsonWithHashComments(text) {
  return JSON.parse(text.replace(/(^|\s)#.*$/gm, "$1"));
}

function pickItemFields(item) {
  const picked = {
    id: item.id,
    name: itemNames[item.id] ?? item.name ?? item.examine?.replace(" - Examine not set.", "") ?? `item-${item.id}`,
    source: "nh-server:item_info",
    tradeable: item.tradeable ?? false,
    equipSlot: item.equip_slot ?? null,
    weaponType: item.weapon_type ?? null,
    rangedWeapon: item.ranged_weapon ?? null,
    twoHanded: item.two_handed ?? false,
    hideHair: item.hide_hair ?? false,
    hideBeard: item.hide_beard ?? false,
    hideArms: item.hide_arms ?? false,
    specialAttack: specialAttackByItemId[item.id] ?? null,
    weight: item.weight ?? 0,
    protectValue: item.protect_value ?? 0,
    requirements: {
      attack: item.attack_level ?? 0,
      strength: item.strength_level ?? 0,
      defence: item.defence_level ?? 0,
      ranged: item.ranged_level ?? 0,
      magic: item.magic_level ?? 0
    },
    bonuses: {}
  };

  for (const key of bonusKeys) {
    picked.bonuses[key] = item[key] ?? 0;
  }

  return picked;
}

function customConsumable(id) {
  return {
    id,
    name: itemNames[id],
    source: "nh-server:Consumable.registerBastionPotion",
    tradeable: true,
    equipSlot: null,
    weaponType: null,
    rangedWeapon: null,
    twoHanded: false,
    hideHair: false,
    hideBeard: false,
    hideArms: false,
    specialAttack: null,
    weight: 0,
    protectValue: 0,
    requirements: {
      attack: 0,
      strength: 0,
      defence: 0,
      ranged: 0,
      magic: 0
    },
    bonuses: Object.fromEntries(bonusKeys.map((key) => [key, 0])),
    action: {
      kind: "bastion-potion",
      nextDoseItemIds: [22464, 22467, 22470, 229],
      effects: [
        { stat: "Ranged", flatBoost: 4, percentBoost: 0.1 },
        { stat: "Defence", flatBoost: 5, percentBoost: 0.15 }
      ]
    }
  };
}

function equipmentBonusRows(items) {
  return items
    .filter((item) => item.equipSlot !== null)
    .map((item) => ({
      id: item.id,
      name: item.name,
      equipSlot: item.equipSlot,
      weaponType: item.weaponType,
      twoHanded: item.twoHanded,
      bonuses: item.bonuses
    }));
}

function pickWeaponTypes(weaponTypes, items) {
  const names = new Set(items.map((item) => item.weaponType).filter(Boolean));
  const picked = {};

  for (const name of [...names].sort()) {
    if (weaponTypes[name]) {
      picked[name] = weaponTypes[name];
    }
  }

  return picked;
}

const itemInfoPath = path.join(serverRoot, "data", "items", "item_info.json");
const weaponTypesPath = path.join(serverRoot, "data", "items", "weapon_types.json");
const itemInfo = parseJsonWithHashComments(await readFile(itemInfoPath, "utf8"));
const weaponTypes = JSON.parse(await readFile(weaponTypesPath, "utf8"));
const selectedItems = nhItemIds
  .map((id) => {
    const item = itemInfo.find((candidate) => candidate.id === id);
    if (!item) {
      if (id === 22461) {
        return customConsumable(id);
      }
      throw new Error(`missing NH item ${id} in ${itemInfoPath}`);
    }
    return pickItemFields(item);
  })
  .sort((left, right) => left.id - right.id);

await mkdir(outputDir, { recursive: true });
await mkdir(generatedDir, { recursive: true });
const equipmentRowsJson = `${JSON.stringify(equipmentBonusRows(selectedItems), null, 2)}\n`;
await writeFile(
  path.join(outputDir, "server-items.json"),
  `${JSON.stringify(selectedItems, null, 2)}\n`
);
await writeFile(
  path.join(generatedDir, "server-items.json"),
  `${JSON.stringify(selectedItems, null, 2)}\n`
);
await writeFile(
  path.join(outputDir, "equipment-bonuses.json"),
  equipmentRowsJson
);
await writeFile(
  path.join(generatedDir, "equipment-bonuses.json"),
  equipmentRowsJson
);
await writeFile(
  path.join(outputDir, "weapon-types.json"),
  `${JSON.stringify(pickWeaponTypes(weaponTypes, selectedItems), null, 2)}\n`
);
await writeFile(
  path.join(generatedDir, "weapon-types.json"),
  `${JSON.stringify(pickWeaponTypes(weaponTypes, selectedItems), null, 2)}\n`
);
await writeFile(
  path.join(outputDir, "nh-loadout-items.json"),
  `${JSON.stringify({ itemIds: nhItemIds, source: "Nh server data/items/item_info.json" }, null, 2)}\n`
);

console.log(`exported ${selectedItems.length} NH item defs and ${Object.keys(pickWeaponTypes(weaponTypes, selectedItems)).length} weapon types`);
