const { app, BrowserWindow } = require("./electron-muted.cjs");
const path = require("node:path");

const [, , projectRoot] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function evalInWindow(window, source) {
  return window.webContents.executeJavaScript(source);
}

async function waitForReady(window) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const status = await evalInWindow(window, `
      (() => {
        const ready = document.querySelector(".glbStatus-ready");
        const error = document.querySelector(".glbStatus-error, .glbStatus-missing");
        return { ready: ready?.textContent ?? "", error: error?.textContent ?? "" };
      })()
    `);
    if (status.ready) {
      return status.ready;
    }
    if (status.error) {
      throw new Error(status.error);
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for runtime scene readiness.");
}

async function clickSelector(window, selector) {
  const result = await evalInWindow(window, `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) {
        return { ok: false, error: "missing selector", selector: ${JSON.stringify(selector)} };
      }
      element.click();
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(100);
}

async function pointerDownSelector(window, selector) {
  const result = await evalInWindow(window, `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) {
        return { ok: false, error: "missing selector", selector: ${JSON.stringify(selector)} };
      }
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }));
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(100);
}

async function clickTemporaryButton(window, label) {
  const result = await evalInWindow(window, `
    (() => {
      const button = Array.from(document.querySelectorAll(".runtimeTemporaryDevControls button"))
        .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
      if (!button) {
        return {
          ok: false,
          error: "missing temporary button",
          label: ${JSON.stringify(label)},
          buttons: Array.from(document.querySelectorAll(".runtimeTemporaryDevControls button"))
            .map((candidate) => candidate.textContent?.trim() ?? "")
        };
      }
      button.click();
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(100);
}

async function clickSetupOption(window, setupId) {
  const result = await evalInWindow(window, `
    (() => {
      const button = document.querySelector(${JSON.stringify(`[data-runtime-setup-option="${setupId}"]`)});
      if (!button) {
        return {
          ok: false,
          error: "missing setup option",
          setupId: ${JSON.stringify(setupId)},
          options: Array.from(document.querySelectorAll("[data-runtime-setup-option]"))
            .map((candidate) => candidate.getAttribute("data-runtime-setup-option") ?? "")
        };
      }
      button.click();
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(100);
}

async function setDmmSetupToggle(window, label, enabled) {
  const result = await evalInWindow(window, `
    (() => {
      const row = Array.from(document.querySelectorAll(".runtimeDmmSetupToggle"))
        .find((candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)});
      const input = row?.querySelector("input");
      if (!input) {
        return {
          ok: false,
          error: "missing DMM setup toggle",
          label: ${JSON.stringify(label)},
          toggles: Array.from(document.querySelectorAll(".runtimeDmmSetupToggle"))
            .map((candidate) => candidate.textContent?.trim() ?? "")
        };
      }
      if (input.checked !== ${JSON.stringify(enabled)}) {
        input.click();
      }
      return { ok: true, checked: input.checked };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(100);
}

async function openInventoryContextMenu(window, slotIndex) {
  const result = await evalInWindow(window, `
    (async () => {
      const slot = document.querySelector(${JSON.stringify(`.nhInventorySlot[data-slot-index="${slotIndex}"]`)});
      if (!slot) {
        return { ok: false, error: "missing inventory slot", slotIndex: ${JSON.stringify(slotIndex)} };
      }
      const rect = slot.getBoundingClientRect();
      slot.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }));
      let menu = document.querySelector(".nhContextMenu");
      const deadline = Date.now() + 1000;
      while (!menu && Date.now() < deadline) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        menu = document.querySelector(".nhContextMenu");
      }
      if (!menu) {
        return { ok: false, error: "inventory context menu did not open" };
      }
      return {
        ok: true,
        options: Array.from(menu.querySelectorAll(".nhContextMenuOption")).map((option) => ({
          text: option.textContent ?? "",
          action: option.getAttribute("data-menu-action") ?? "",
          actionKind: option.getAttribute("data-menu-action-kind") ?? "",
          opcode: Number(option.getAttribute("data-menu-opcode"))
        }))
      };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function clickContextMenuOption(window, optionIndex) {
  const result = await evalInWindow(window, `
    (async () => {
      const option = Array.from(document.querySelectorAll(".nhContextMenuOption"))[${JSON.stringify(optionIndex)}];
      if (!option) {
        return { ok: false, error: "missing context menu option", optionIndex: ${JSON.stringify(optionIndex)} };
      }
      option.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(100);
  return result.dataset;
}

async function destroyInventorySlot(window, slotIndex) {
  await evalInWindow(window, `
    (() => {
      const viewport = document.querySelector(".runtimeViewport");
      if (viewport) {
        viewport.dataset.lastGroundItemAction = "";
      }
    })()
  `);
  const menu = await openInventoryContextMenu(window, slotIndex);
  const destroyActionIndex = menu.options.findIndex(
    (option) => option.action === "Destroy" && option.actionKind === "inventory-action" && option.opcode === 37
  );
  if (destroyActionIndex === -1) {
    throw new Error(`Expected pre-fight Destroy option for slot ${slotIndex}: ${JSON.stringify(menu)}`);
  }
  return clickContextMenuOption(window, destroyActionIndex);
}

async function readState(window) {
  return evalInWindow(window, `
    (() => {
      const viewport = document.querySelector(".runtimeViewport");
      const controls = document.querySelector(".runtimeTemporaryDevControls");
      const setupSelector = document.querySelector("[data-runtime-setup-selector]");
      const temporaryButtonLabels = Array.from(document.querySelectorAll(".runtimeTemporaryDevControls button"))
        .map((candidate) => candidate.textContent?.trim() ?? "");
      const freezeButton = Array.from(document.querySelectorAll(".runtimeTemporaryDevControls button"))
        .find((candidate) => candidate.textContent?.trim() === "Freeze off" || candidate.textContent?.trim() === "Freeze immune");
      const inventorySlots = Array.from(document.querySelectorAll(".nhInventorySlot"))
        .sort((left, right) =>
          Number(left.getAttribute("data-slot-index") ?? left.getAttribute("data-inventory-slot-index") ?? 0) -
          Number(right.getAttribute("data-slot-index") ?? right.getAttribute("data-inventory-slot-index") ?? 0)
        )
        .map((slot) => {
          const sprite = slot.querySelector(".nhInventoryItemSprite");
          const itemId = slot.getAttribute("data-inventory-item-id") || sprite?.getAttribute("data-item-id") || "";
          return {
            index: Number(slot.getAttribute("data-slot-index") ?? slot.getAttribute("data-inventory-slot-index") ?? 0),
            itemId,
            label: sprite?.getAttribute("aria-label") ?? ""
          };
        });
      const inventoryItemIds = inventorySlots.map((slot) => slot.itemId).filter(Boolean).join(",");
      const equipmentItemIds = Array.from(document.querySelectorAll(".nhEquipmentItemSprite"))
        .sort((left, right) => Number(left.getAttribute("data-server-slot") ?? 0) - Number(right.getAttribute("data-server-slot") ?? 0))
        .map((slot) => slot.getAttribute("data-item-id") ?? "")
        .filter(Boolean)
        .join(",");
      const dmmSetupToggles = document.querySelector(".runtimeDmmSetupToggles");
      const autoRetaliate = document.querySelector(".nhCombatAutoRetaliateSource");
      const selectedAttackStyle = document.querySelector('.nhCombatStyleSlot[data-selected="true"]');
      const savedSetupRaw = window.localStorage.getItem("nhTrainer.temporaryNhStakeSetup.v1");
      const savedSetup = savedSetupRaw ? JSON.parse(savedSetupRaw) : null;
      return {
        ready: Boolean(document.querySelector(".glbStatus-ready")),
        controlsVisible: Boolean(controls),
        setupSelectorVisible: Boolean(setupSelector),
        setupSelectorOptions: Array.from(document.querySelectorAll("[data-runtime-setup-option]"))
          .map((candidate) => candidate.getAttribute("data-runtime-setup-option") ?? "")
          .join(","),
        temporaryButtonLabels,
        dmmSetupTogglesVisible: Boolean(dmmSetupToggles),
        dmmGraniteMaulToggle: dmmSetupToggles?.getAttribute("data-dmm-granite-maul-enabled") ?? "",
        dmmArmadylGodswordToggle: dmmSetupToggles?.getAttribute("data-dmm-armadyl-godsword-enabled") ?? "",
        inventorySlots,
        inventoryItemIds,
        equipmentItemIds,
        temporarySpecRestore: viewport?.dataset.lastTemporarySpecRestore ?? "",
        temporaryFreezeBypass: viewport?.dataset.temporaryFreezeBypass ?? "",
        freezeButtonPressed: freezeButton?.getAttribute("aria-pressed") ?? "",
        setupSaved: viewport?.dataset.lastTemporarySetupSaved ?? "",
        setupSource: viewport?.dataset.lastTemporarySetupSource ?? "",
        setupLoadoutId: viewport?.dataset.lastTemporarySetupLoadoutId ?? "",
        setupRuntimeInventoryCount: viewport?.dataset.lastTemporarySetupInventoryCount ?? "",
        setupRuntimeEquipmentCount: viewport?.dataset.lastTemporarySetupEquipmentCount ?? "",
        nhStakeInventoryItemIds: viewport?.dataset.lastNhStakeInventoryItemIds ?? "",
        nhStakeEquipmentItemIds: viewport?.dataset.lastNhStakeEquipmentItemIds ?? "",
        nhStakeOpponentWeapon: viewport?.dataset.lastNhStakeOpponentEquipmentWeapon ?? "",
        lastGroundItemAction: viewport?.dataset.lastGroundItemAction ?? "",
        runtimeSetupPreset: viewport?.dataset.lastRuntimeSetupPreset ?? "",
        setupStorageVersion: savedSetup?.version ?? null,
        setupInventoryCount: Array.isArray(savedSetup?.inventory) ? savedSetup.inventory.filter(Boolean).length : 0,
        setupEquipmentCount: Array.isArray(savedSetup?.equipment) ? savedSetup.equipment.length : 0,
        attackSetStorage: window.localStorage.getItem("nhTrainer.attackSet.v1") ?? "",
        selectedAttackSetSlot: selectedAttackStyle?.getAttribute("data-slot-index") ?? "",
        selectedAttackSetVarp: selectedAttackStyle?.getAttribute("data-attack-set-index") ?? "",
        autoRetaliateEnabled: autoRetaliate?.getAttribute("data-auto-retaliate-enabled") ?? "",
        autoRetaliateStorage: window.localStorage.getItem("nhTrainer.autoRetaliate.v1") ?? ""
      };
    })()
  `);
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function inventoryItemIds(state) {
  return state.inventoryItemIds.split(",").filter(Boolean);
}

function countInventoryItem(state, itemId) {
  const expected = String(itemId);
  return inventoryItemIds(state).filter((candidate) => candidate === expected).length;
}

function findInventorySlotIndex(state, itemId) {
  const expected = String(itemId);
  return state.inventorySlots.find((slot) => slot.itemId === expected)?.index ?? -1;
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    paintWhenInitiallyHidden: true,
    webPreferences: {
      backgroundThrottling: false,
      offscreen: true,
      partition: `runtime-dev-controls-validation-${Date.now()}`,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    const MANTA_RAY = 391;
    const GRANITE_MAUL = 4153;
    const ARMADYL_GODSWORD = 11802;
    const runtimeReadyMessage = await window.loadFile(path.join(projectRoot, "dist", "index.html")).then(() => waitForReady(window));
    const defaultInventoryState = await readState(window);
    assert(defaultInventoryState.setupSelectorVisible, `setup selector should be visible on startup: ${JSON.stringify(defaultInventoryState)}`);
    assert(defaultInventoryState.setupSelectorOptions === "nh-stake,dmm", `startup setup selector should expose NH stake and DMM: ${JSON.stringify(defaultInventoryState)}`);
    assert(!defaultInventoryState.dmmSetupTogglesVisible, `NH stake startup should not show DMM setup toggles: ${JSON.stringify(defaultInventoryState)}`);
    assert(
      countInventoryItem(defaultInventoryState, ARMADYL_GODSWORD) === 1,
      `NH stake startup should keep its normal AGS and should not need an AGS toggle: ${JSON.stringify(defaultInventoryState)}`
    );
    await destroyInventorySlot(window, 0);
    const nhStakeDestroyedState = await readState(window);
    assert(nhStakeDestroyedState.lastGroundItemAction !== "drop", `NH stake pre-fight Destroy should not spawn a ground item: ${JSON.stringify(nhStakeDestroyedState)}`);
    assert(nhStakeDestroyedState.inventorySlots[0]?.itemId === "", `NH stake pre-fight Destroy should clear only the clicked slot: ${JSON.stringify(nhStakeDestroyedState)}`);
    await clickSetupOption(window, "dmm");
    const dmmInventoryState = await readState(window);
    assert(!dmmInventoryState.setupSelectorVisible, `setup selector should close after choosing DMM: ${JSON.stringify(dmmInventoryState)}`);
    assert(dmmInventoryState.dmmSetupTogglesVisible, `DMM setup should expose setup toggles: ${JSON.stringify(dmmInventoryState)}`);
    assert(dmmInventoryState.dmmGraniteMaulToggle === "true", `DMM Granite maul toggle should default on: ${JSON.stringify(dmmInventoryState)}`);
    assert(dmmInventoryState.dmmArmadylGodswordToggle === "false", `DMM AGS toggle should default off: ${JSON.stringify(dmmInventoryState)}`);
    assert(dmmInventoryState.setupSource === "dmm", `DMM setup should record setup source: ${JSON.stringify(dmmInventoryState)}`);
    assert(dmmInventoryState.runtimeSetupPreset === "dmm", `DMM setup should record active preset: ${JSON.stringify(dmmInventoryState)}`);
    assert(
      dmmInventoryState.inventoryItemIds.split(",").includes("29796"),
      `DMM setup should put Noxious halberd in the inventory: ${JSON.stringify(dmmInventoryState)}`
    );
    assert(
      dmmInventoryState.inventoryItemIds ===
        "12695,22461,10925,10925,13441,391,6685,10925,391,391,6685,6685,27238,26374,391,391,26386,11283,29796,391,7462,22613,27690,4153,28561,391,391,12791",
      `DMM setup should replace one Manta ray with Granite maul by default: ${JSON.stringify(dmmInventoryState)}`
    );
    assert(countInventoryItem(dmmInventoryState, GRANITE_MAUL) === 1, `DMM default should contain one Gmaul: ${JSON.stringify(dmmInventoryState)}`);
    assert(countInventoryItem(dmmInventoryState, ARMADYL_GODSWORD) === 0, `DMM default should not contain AGS: ${JSON.stringify(dmmInventoryState)}`);

    await setDmmSetupToggle(window, "Gmaul", false);
    const dmmGmaulOffState = await readState(window);
    assert(dmmGmaulOffState.dmmGraniteMaulToggle === "false", `Gmaul toggle should turn off: ${JSON.stringify(dmmGmaulOffState)}`);
    assert(countInventoryItem(dmmGmaulOffState, GRANITE_MAUL) === 0, `Turning Gmaul off should remove it: ${JSON.stringify(dmmGmaulOffState)}`);
    assert(countInventoryItem(dmmGmaulOffState, MANTA_RAY) === countInventoryItem(dmmInventoryState, MANTA_RAY) + 1, `Turning Gmaul off should restore one Manta ray: ${JSON.stringify({ dmmInventoryState, dmmGmaulOffState })}`);

    await setDmmSetupToggle(window, "AGS", true);
    const dmmAgsOnState = await readState(window);
    assert(dmmAgsOnState.dmmArmadylGodswordToggle === "true", `AGS toggle should turn on: ${JSON.stringify(dmmAgsOnState)}`);
    assert(countInventoryItem(dmmAgsOnState, ARMADYL_GODSWORD) === 1, `Turning AGS on should add exactly one AGS: ${JSON.stringify(dmmAgsOnState)}`);
    assert(countInventoryItem(dmmAgsOnState, GRANITE_MAUL) === 0, `Turning AGS on after Gmaul-off should not resurrect Gmaul: ${JSON.stringify(dmmAgsOnState)}`);

    await setDmmSetupToggle(window, "AGS", false);
    const dmmAgsOffState = await readState(window);
    assert(dmmAgsOffState.dmmArmadylGodswordToggle === "false", `AGS toggle should turn off: ${JSON.stringify(dmmAgsOffState)}`);
    assert(countInventoryItem(dmmAgsOffState, ARMADYL_GODSWORD) === 0, `Turning AGS off should remove it: ${JSON.stringify(dmmAgsOffState)}`);
    assert(countInventoryItem(dmmAgsOffState, GRANITE_MAUL) === 0, `Turning AGS off should not add Gmaul: ${JSON.stringify(dmmAgsOffState)}`);

    await setDmmSetupToggle(window, "Gmaul", true);
    const dmmGmaulOnState = await readState(window);
    assert(countInventoryItem(dmmGmaulOnState, GRANITE_MAUL) === 1, `Turning Gmaul on should add exactly one Gmaul: ${JSON.stringify(dmmGmaulOnState)}`);
    const gmaulSlotIndex = findInventorySlotIndex(dmmGmaulOnState, GRANITE_MAUL);
    assert(gmaulSlotIndex !== -1, `Gmaul slot should be discoverable before Destroy: ${JSON.stringify(dmmGmaulOnState)}`);
    await destroyInventorySlot(window, gmaulSlotIndex);
    const dmmDestroyedGmaulState = await readState(window);
    assert(dmmDestroyedGmaulState.lastGroundItemAction !== "drop", `Pre-fight Destroy should not spawn a ground item: ${JSON.stringify(dmmDestroyedGmaulState)}`);
    assert(countInventoryItem(dmmDestroyedGmaulState, GRANITE_MAUL) === 0, `Destroy should remove Gmaul from its slot: ${JSON.stringify(dmmDestroyedGmaulState)}`);

    await setDmmSetupToggle(window, "AGS", true);
    const dmmAgsOnAfterDestroyState = await readState(window);
    assert(countInventoryItem(dmmAgsOnAfterDestroyState, ARMADYL_GODSWORD) === 1, `AGS toggle after Destroy should add exactly one AGS: ${JSON.stringify(dmmAgsOnAfterDestroyState)}`);
    assert(countInventoryItem(dmmAgsOnAfterDestroyState, GRANITE_MAUL) === 0, `AGS toggle after Destroy should not resurrect destroyed Gmaul: ${JSON.stringify(dmmAgsOnAfterDestroyState)}`);

    await setDmmSetupToggle(window, "Gmaul", false);
    const dmmDestroyedGmaulOffState = await readState(window);
    assert(countInventoryItem(dmmDestroyedGmaulOffState, GRANITE_MAUL) === 0, `Turning off an already destroyed Gmaul should be safe: ${JSON.stringify(dmmDestroyedGmaulOffState)}`);

    await setDmmSetupToggle(window, "Gmaul", true);
    const dmmBothSpecWeaponsState = await readState(window);
    assert(countInventoryItem(dmmBothSpecWeaponsState, GRANITE_MAUL) === 1, `Turning Gmaul back on should add exactly one Gmaul: ${JSON.stringify(dmmBothSpecWeaponsState)}`);
    assert(countInventoryItem(dmmBothSpecWeaponsState, ARMADYL_GODSWORD) === 1, `Gmaul toggle should not remove AGS: ${JSON.stringify(dmmBothSpecWeaponsState)}`);
    assert(
      dmmBothSpecWeaponsState.inventoryItemIds ===
        "12695,22461,10925,10925,13441,391,6685,10925,391,391,6685,6685,27238,26374,391,391,26386,11283,29796,391,7462,22613,27690,4153,28561,11802,391,12791",
      `DMM setup with both toggles should replace two Manta rays deterministically: ${JSON.stringify(dmmBothSpecWeaponsState)}`
    );
    await pointerDownSelector(window, '.nhSideTabButton[data-tab-id="equipment"]');
    const defaultEquipmentState = await readState(window);
    await clickTemporaryButton(window, "Spec 100");
    await clickTemporaryButton(window, "Freeze immune");
    await clickTemporaryButton(window, "Save setup");
    await pointerDownSelector(window, '.nhSideTabButton[data-tab-id="combat"]');
    await pointerDownSelector(window, '.nhCombatStyleSlot[data-slot-index="1"]');
    await pointerDownSelector(window, ".nhCombatAutoRetaliateSource");
    const beforeReload = await readState(window);

    assert(beforeReload.controlsVisible, "temporary dev controls should render in the runtime viewport");
    assert(
      defaultInventoryState.inventoryItemIds ===
        "12695,22461,6685,6685,13441,391,391,10925,391,6685,391,10925,4736,21902,391,391,4759,22322,391,391,11802,12006,391,391,391,391,391,12791",
      `NH stake inventory should be the default startup inventory order: ${JSON.stringify(defaultInventoryState)}`
    );
    assert(
      defaultEquipmentState.equipmentItemIds === "26382,21791,6585,22647,26243,27251,26245,31106,31097,19710,21950",
      `DMM equipment should be the selected setup equipment order: ${JSON.stringify(defaultEquipmentState)}`
    );
    assert(beforeReload.temporarySpecRestore === "100", `spec restore button did not update runtime state: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.temporaryFreezeBypass === "true", `freeze bypass button did not update runtime state: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.freezeButtonPressed === "true", `freeze bypass button did not stay pressed: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.setupLoadoutId === "kodai-robes", `DMM setup did not use the mage base loadout: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.setupRuntimeInventoryCount === "28", `DMM setup did not load 28 inventory slots: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.setupRuntimeEquipmentCount === "11", `DMM setup did not load 11 equipment slots: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.setupSaved === "true", `save setup button did not report success: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.setupStorageVersion === 1, `saved setup was not stored as v1 JSON: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.setupInventoryCount > 0, `saved setup did not include inventory items: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.setupEquipmentCount > 0, `saved setup did not include equipment items: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.attackSetStorage === "1", `attack style click did not persist Config.ATTACK_SET-style varp state: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.selectedAttackSetSlot === "1", `attack style click did not select Rapid before reload: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.autoRetaliateStorage === "false", `auto-retaliate toggle did not persist false: ${JSON.stringify(beforeReload)}`);

    await window.webContents.reload();
    await waitForReady(window);
    await pointerDownSelector(window, '.nhSideTabButton[data-tab-id="combat"]');
    const afterReload = await readState(window);
    assert(afterReload.attackSetStorage === "1", `attack style storage did not survive reload: ${JSON.stringify(afterReload)}`);
    assert(afterReload.selectedAttackSetSlot === "1", `attack style did not reload as Rapid after reload: ${JSON.stringify(afterReload)}`);
    assert(afterReload.autoRetaliateEnabled === "false", `auto-retaliate did not load from storage after reload: ${JSON.stringify(afterReload)}`);
    assert(afterReload.setupStorageVersion === 1, `saved setup did not survive reload: ${JSON.stringify(afterReload)}`);

    process.stdout.write(
      `${JSON.stringify(
        {
          ok: true,
          runtimeReadyMessage,
          defaultInventoryState,
          defaultEquipmentState,
          beforeReload,
          afterReload
        },
        null,
        2
      )}\n`
    );
    app.exit(0);
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
