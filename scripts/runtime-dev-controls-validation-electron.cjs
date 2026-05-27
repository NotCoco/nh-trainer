const { app, BrowserWindow } = require("electron");
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

async function readState(window) {
  return evalInWindow(window, `
    (() => {
      const viewport = document.querySelector(".runtimeViewport");
      const controls = document.querySelector(".runtimeTemporaryDevControls");
      const temporaryButtonLabels = Array.from(document.querySelectorAll(".runtimeTemporaryDevControls button"))
        .map((candidate) => candidate.textContent?.trim() ?? "");
      const freezeButton = Array.from(document.querySelectorAll(".runtimeTemporaryDevControls button"))
        .find((candidate) => candidate.textContent?.trim() === "Freeze off" || candidate.textContent?.trim() === "Freeze immune");
      const inventoryItemIds = Array.from(document.querySelectorAll(".nhInventorySlot"))
        .sort((left, right) => Number(left.getAttribute("data-inventory-slot-index") ?? 0) - Number(right.getAttribute("data-inventory-slot-index") ?? 0))
        .map((slot) => slot.getAttribute("data-inventory-item-id") ?? "")
        .filter(Boolean)
        .join(",");
      const equipmentItemIds = Array.from(document.querySelectorAll(".nhEquipmentItemSprite"))
        .sort((left, right) => Number(left.getAttribute("data-server-slot") ?? 0) - Number(right.getAttribute("data-server-slot") ?? 0))
        .map((slot) => slot.getAttribute("data-item-id") ?? "")
        .filter(Boolean)
        .join(",");
      const autoRetaliate = document.querySelector(".nhCombatAutoRetaliateSource");
      const selectedAttackStyle = document.querySelector('.nhCombatStyleSlot[data-selected="true"]');
      const savedSetupRaw = window.localStorage.getItem("nhTrainer.temporaryNhStakeSetup.v1");
      const savedSetup = savedSetupRaw ? JSON.parse(savedSetupRaw) : null;
      return {
        ready: Boolean(document.querySelector(".glbStatus-ready")),
        controlsVisible: Boolean(controls),
        temporaryButtonLabels,
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
    const runtimeReadyMessage = await window.loadFile(path.join(projectRoot, "dist", "index.html")).then(() => waitForReady(window));
    const defaultInventoryState = await readState(window);
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
    assert(!defaultInventoryState.temporaryButtonLabels.includes("NH stake"), `NH stake preset button should not be visible: ${JSON.stringify(defaultInventoryState)}`);
    assert(
      defaultInventoryState.inventoryItemIds ===
        "12695,22461,6685,6685,13441,391,391,10925,391,6685,391,10925,4736,21902,391,391,4759,22322,391,391,11802,12006,391,391,391,391,391,12791",
      `NH stake inventory should be the default startup inventory order: ${JSON.stringify(defaultInventoryState)}`
    );
    assert(
      defaultEquipmentState.equipmentItemIds === "10828,21791,6585,11791,4091,12831,4093,7462,11840,11770,21932",
      `NH stake equipment should be the default startup equipment order: ${JSON.stringify(defaultEquipmentState)}`
    );
    assert(beforeReload.temporarySpecRestore === "100", `spec restore button did not update runtime state: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.temporaryFreezeBypass === "true", `freeze bypass button did not update runtime state: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.freezeButtonPressed === "true", `freeze bypass button did not stay pressed: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.setupLoadoutId === "kodai-robes", `NH stake setup did not use the mage base loadout: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.setupRuntimeInventoryCount === "28", `NH stake setup did not load 28 inventory slots: ${JSON.stringify(beforeReload)}`);
    assert(beforeReload.setupRuntimeEquipmentCount === "11", `NH stake setup did not load 11 equipment slots: ${JSON.stringify(beforeReload)}`);
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
