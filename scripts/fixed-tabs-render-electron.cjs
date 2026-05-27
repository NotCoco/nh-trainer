const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const [, , projectRoot, screenshotDir] = process.argv;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function screenshotPath(tabId) {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, "");
  return path.join(screenshotDir, `nh-nh-trainer-fixed-tabs-${tabId}-${timestamp}-${process.pid}.png`);
}

async function waitForHud(window) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    const ready = await window.webContents.executeJavaScript(`
      Boolean(document.querySelector(".nhFixedClient") && document.querySelector(".nhSideTabButton"))
    `);
    if (ready) {
      return;
    }
    await delay(250);
  }
  throw new Error("Timed out waiting for fixed client HUD.");
}

const tabVisualWaitSelectors = {
  combat: { present: ".nhMountedWidgetLayer[data-group-id='593']" },
  stats: { present: ".nhStatsPanelLayer[data-group-id='320']", absent: ".nhEquipmentItemLayer" },
  quests: { present: ".nhNoticeboardLayer[data-group-id='720']" },
  inventory: { present: ".nhInventorySlot" },
  equipment: { present: ".nhEquipmentItemLayer[data-group-id='387']", absent: ".nhStatsPanelLayer" },
  prayer: { present: ".nhMountedWidgetLayer[data-group-id='541']" },
  magic: { present: ".nhMountedWidgetLayer[data-group-id='218']" },
  "clan-chat": { present: ".nhClanChatPanelLayer[data-group-id='7']" },
  ignores: { present: ".nhSocialPanelLayer[data-group-id='432']" },
  friends: { present: ".nhSocialPanelLayer[data-group-id='429']" },
  logout: { present: ".nhMountedWidgetLayer[data-group-id='182']" },
  options: { present: ".nhMountedWidgetLayer[data-group-id='261']" },
  emotes: { present: ".nhEmotePanelLayer[data-group-id='216']" },
  music: { present: ".nhMountedWidgetLayer[data-group-id='239']" }
};

async function clickTab(window, tabId) {
  const waitSelectors = tabVisualWaitSelectors[tabId] ?? {};
  return window.webContents.executeJavaScript(`
    (async () => {
      const presentSelector = ${JSON.stringify(waitSelectors.present ?? "")};
      const absentSelector = ${JSON.stringify(waitSelectors.absent ?? "")};
      const button = document.querySelector(${JSON.stringify(`.nhSideTabButton[data-tab-id="${tabId}"]`)});
      if (!button) {
        throw new Error("missing tab ${tabId}");
      }
      const rect = button.getBoundingClientRect();
      button.dispatchEvent(new PointerEvent("pointerdown", {
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
      const renderReady = () => {
        const active = document.querySelector(".nhSideTabButton[data-active='true']")?.getAttribute("data-tab-id") ?? "";
        if (active !== ${JSON.stringify(tabId)}) {
          return false;
        }
        if (presentSelector && !document.querySelector(presentSelector)) {
          return false;
        }
        if (absentSelector && document.querySelector(absentSelector)) {
          return false;
        }
        return true;
      };
      const deadline = performance.now() + 2000;
      while (!renderReady()) {
        if (performance.now() > deadline) {
          throw new Error("timed out waiting for ${tabId} tab visual layer");
        }
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        active: document.querySelector(".nhSideTabButton[data-active='true']")?.getAttribute("data-tab-id") ?? "",
        mountedGroups: [...document.querySelectorAll(".nhMountedWidgetLayer")].map((layer) => ({
          groupId: Number(layer.getAttribute("data-group-id")),
          textCount: layer.querySelectorAll(".nhWidgetText").length,
          spriteCount: layer.querySelectorAll(".nhWidgetSprite").length,
          rectangleCount: layer.querySelectorAll(".nhWidgetRectangle").length
        })),
        noticeboard: [...document.querySelectorAll(".nhNoticeboardLayer")].map((layer) => ({
          groupId: Number(layer.getAttribute("data-group-id")),
          textCount: layer.querySelectorAll(".nhWidgetText").length,
          text: layer.textContent ?? ""
        })),
        emotes: [...document.querySelectorAll(".nhEmotePanelLayer")].map((layer) => ({
          groupId: Number(layer.getAttribute("data-group-id")),
          sourceClientScript: layer.getAttribute("data-source-client-script") ?? "",
          buttonCount: layer.querySelectorAll(".nhEmoteButton").length,
          firstSlot: layer.querySelector(".nhEmoteButton")?.getAttribute("data-slot") ?? "",
          firstStep: layer.querySelector(".nhEmoteButton")?.getAttribute("data-source-client-step") ?? "",
          firstUnlockedSpriteId: Number(layer.querySelector(".nhEmoteButton")?.getAttribute("data-unlocked-sprite-id") ?? Number.NaN),
          firstRenderedSpriteId: Number(layer.querySelector(".nhEmoteIconSprite")?.getAttribute("data-sprite-id") ?? Number.NaN),
          firstIconRect: (() => {
            const icon = layer.querySelector(".nhEmoteIconSprite");
            if (!icon) {
              return null;
            }
            const rect = icon.getBoundingClientRect();
            return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
          })(),
          usesEmoteAtlas: (() => {
            const image = layer.querySelector(".nhEmoteIconImage");
            return image ? String(image.getAttribute("src") ?? "").includes("emote_icons.png") : false;
          })(),
          visibleLabelCount: [...layer.querySelectorAll(".nhEmoteLabel")].filter((label) => label.textContent?.trim()).length
        })),
        stats: [...document.querySelectorAll(".nhStatsPanelLayer")].map((layer) => ({
          groupId: Number(layer.getAttribute("data-group-id")),
          slotCount: layer.querySelectorAll(".nhStatsSkillSlot").length,
          tileSpriteCount: layer.querySelectorAll(".nhStatsTileSprite").length,
          iconSpriteCount: layer.querySelectorAll(".nhStatsSkillIconSprite").length,
          levelTextCount: layer.querySelectorAll(".nhStatsSkillLevelText").length,
          levelGlyphCount: layer.querySelectorAll(".nhStatsSkillLevelText .nhWidgetGlyph").length,
          totalLevelText: layer.querySelector(".nhStatsTotalLevelText")?.getAttribute("data-total-level") ?? ""
        })),
        equipment: [...document.querySelectorAll(".nhEquipmentItemLayer")].map((layer) => ({
          groupId: Number(layer.getAttribute("data-group-id")),
          slotTileCount: layer.querySelectorAll(".nhEquipmentSlotTileSprite[data-sprite-id='170']").length,
          itemSpriteCount: layer.querySelectorAll(".nhEquipmentItemSprite").length,
          itemButtonCount: layer.querySelectorAll(".nhEquipmentItemButton").length
        })),
        equipmentUtilityButtonCount: document.querySelectorAll(".nhEquipmentUtilityButton").length,
        equipmentSourceSpriteIds: [...document.querySelectorAll(".nhMountedWidgetLayer[data-group-id='387'] .nhWidgetSprite")].map((sprite) =>
          Number(sprite.getAttribute("data-sprite-id"))
        ),
        inventorySlotCount: document.querySelectorAll(".nhInventorySlot").length,
        social: [...document.querySelectorAll(".nhSocialPanelLayer")].map((layer) => ({
          groupId: Number(layer.getAttribute("data-group-id")),
          listKind: layer.getAttribute("data-list-kind") ?? "",
          loaded: layer.getAttribute("data-loaded") ?? "",
          memberCount: Number(layer.getAttribute("data-member-count") ?? Number.NaN),
          sourcePacket: layer.getAttribute("data-source-packet") ?? "",
          sourceClientOpcodes: layer.getAttribute("data-source-client-opcodes") ?? "",
          sourceServerHandler: layer.getAttribute("data-source-server-handler") ?? "",
          sourceToggleHandler: layer.getAttribute("data-source-toggle-handler") ?? "",
          rowNames: [...layer.querySelectorAll(".nhSocialRow")].map((row) => row.getAttribute("data-name") ?? ""),
          rowWorlds: [...layer.querySelectorAll(".nhSocialRow")].map((row) => Number(row.getAttribute("data-world") ?? Number.NaN)),
          buttonActions: [...layer.querySelectorAll(".nhSocialSourceButton")].map((button) => ({
            action: button.getAttribute("data-action") ?? "",
            text: button.getAttribute("data-action-text") ?? "",
            packetId: button.getAttribute("data-source-packet-id") ?? ""
          }))
        })),
        clanChat: [...document.querySelectorAll(".nhClanChatPanelLayer")].map((layer) => ({
          groupId: Number(layer.getAttribute("data-group-id")),
          active: layer.getAttribute("data-active") ?? "",
          displayName: layer.getAttribute("data-display-name") ?? "",
          ownerName: layer.getAttribute("data-owner-name") ?? "",
          memberCount: Number(layer.getAttribute("data-member-count") ?? Number.NaN),
          sourcePacket: layer.getAttribute("data-source-packet") ?? "",
          sourceClientOpcodes: layer.getAttribute("data-source-client-opcodes") ?? "",
          sourceClientScript: layer.getAttribute("data-source-client-script") ?? "",
          sourceServerHandler: layer.getAttribute("data-source-server-handler") ?? "",
          rowNames: [...layer.querySelectorAll(".nhClanChatRow")].map((row) => row.getAttribute("data-name") ?? ""),
          rowWorlds: [...layer.querySelectorAll(".nhClanChatRow")].map((row) => Number(row.getAttribute("data-world") ?? Number.NaN)),
          rowRanks: [...layer.querySelectorAll(".nhClanChatRow")].map((row) => Number(row.getAttribute("data-rank") ?? Number.NaN)),
          buttonActions: [...layer.querySelectorAll(".nhClanChatSourceButton")].map((button) => ({
            action: button.getAttribute("data-action") ?? "",
            text: button.getAttribute("data-action-text") ?? "",
            packetId: button.getAttribute("data-source-packet-id") ?? "",
            sourceHandler: button.getAttribute("data-source-server-handler") ?? ""
          }))
        })),
        ignoreText: document.querySelector(".nhMountedWidgetLayer[data-group-id='432']")?.textContent ?? "",
        ignoreSprites: [...document.querySelectorAll(".nhMountedWidgetLayer[data-group-id='432'] .nhWidgetSprite")].map((sprite) =>
          Number(sprite.getAttribute("data-sprite-id"))
        ),
        friendText: document.querySelector(".nhMountedWidgetLayer[data-group-id='429']")?.textContent ?? "",
        consoleErrors: []
      };
    })()
  `);
}

async function openAndExerciseKeybinding(window) {
  return window.webContents.executeJavaScript(`
    (async () => {
      const dispatchPointerDown = (element) => {
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
      };
      const waitFor = async (predicate, message) => {
        const deadline = performance.now() + 2000;
        while (!predicate()) {
          if (performance.now() > deadline) {
            throw new Error(message);
          }
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      };
      const readInterface = () => {
        const root = document.querySelector(".nhGameKeybindingInterface");
        return {
          open: Boolean(root),
          title: root?.querySelector(".nhGameKeybindingTitle")?.textContent ?? "",
          restoreText: root?.querySelector(".nhGameKeybindingRestoreButton")?.textContent ?? "",
          rowCount: root?.querySelectorAll(".nhGameKeybindingRow").length ?? 0,
          rows: [...(root?.querySelectorAll(".nhGameKeybindingRow") ?? [])].map((row) => ({
            tabId: row.getAttribute("data-tab-id") ?? "",
            varbit: row.getAttribute("data-source-varbit") ?? "",
            serverVarbit: row.getAttribute("data-source-server-varbit") ?? "",
            keySlot: row.querySelector(".nhGameKeybindingKeyButton")?.getAttribute("data-key-slot") ?? "",
            enum1159: row.querySelector(".nhGameKeybindingKeyButton")?.getAttribute("data-source-enum-1159") ?? "",
            enum1160: row.querySelector(".nhGameKeybindingKeyButton")?.getAttribute("data-source-enum-1160") ?? ""
          })),
          dropdownOpen: Boolean(root?.querySelector(".nhGameKeybindingDropdown")),
          dropdownOptionCount: root?.querySelectorAll(".nhGameKeybindingDropdownOption").length ?? 0,
          interfaceId: root?.getAttribute("data-interface-id") ?? "",
          source: root?.getAttribute("data-source") ?? "",
          sourceLayout: root?.getAttribute("data-source-layout") ?? "",
          sourceSlotAction: root?.getAttribute("data-source-slot-action") ?? ""
        };
      };

      const button = document.querySelector(".nhOptionsKeybindingButton");
      if (!button) {
        throw new Error("missing settings keybinding button");
      }
      dispatchPointerDown(button);
      await waitFor(() => Boolean(document.querySelector(".nhGameKeybindingInterface")), "timed out waiting for keybinding interface");

      const inventoryKeyButton = document.querySelector('.nhGameKeybindingRow[data-tab-id="inventory"] .nhGameKeybindingKeyButton');
      if (!inventoryKeyButton) {
        throw new Error("missing inventory keybinding button");
      }
      dispatchPointerDown(inventoryKeyButton);
      await waitFor(() => Boolean(document.querySelector(".nhGameKeybindingDropdown")), "timed out waiting for keybinding dropdown");
      const dropdownBeforeSelection = readInterface();

      const f1Option = document.querySelector('.nhGameKeybindingDropdownOption[data-key-slot="1"]');
      if (!f1Option) {
        throw new Error("missing F1 dropdown option");
      }
      dispatchPointerDown(f1Option);
      await waitFor(
        () =>
          document.querySelector('.nhGameKeybindingRow[data-tab-id="inventory"] .nhGameKeybindingKeyButton')?.getAttribute("data-key-slot") === "1" &&
          document.querySelector('.nhGameKeybindingRow[data-tab-id="combat"] .nhGameKeybindingKeyButton')?.getAttribute("data-key-slot") === "0",
        "timed out waiting for keybinding reassignment"
      );
      const afterSelection = readInterface();

      return {
        button: {
          actionChildId: button.getAttribute("data-action-child-id") ?? "",
          sourceHandler: button.getAttribute("data-source-handler") ?? "",
          sourceInterface: button.getAttribute("data-source-interface") ?? "",
          iconPath: button.getAttribute("data-icon-path") ?? ""
        },
        dropdownBeforeSelection,
        afterSelection
      };
    })()
  `);
}

async function capture(window, tabId) {
  const filePath = screenshotPath(tabId);
  const image = await window.webContents.capturePage();
  await fs.writeFile(filePath, image.toPNG());
  return filePath;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const expectedTabGroups = {
  combat: 593,
  stats: 320,
  quests: 720,
  inventory: null,
  equipment: 387,
  prayer: 541,
  magic: 218,
  "clan-chat": 7,
  ignores: 432,
  friends: 429,
  logout: 182,
  options: 261,
  emotes: 216,
  music: 239
};

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      partition: `nh-nh-fixed-tabs-${process.pid}`
    }
  });
  const errors = [];
  window.webContents.on("console-message", (_event, level, message) => {
    if (level >= 3) {
      errors.push(message);
    }
  });

  try {
    await window.loadFile(path.join(projectRoot, "dist", "index.html"));
    await waitForHud(window);

    const tabSmoke = {};
    for (const [tabId, expectedGroupId] of Object.entries(expectedTabGroups)) {
      const state = await clickTab(window, tabId);
      tabSmoke[tabId] = {
        active: state.active,
        expectedGroupId,
        mountedGroups: state.mountedGroups.map((group) => group.groupId),
        inventorySlotCount: state.inventorySlotCount
      };
      assert(state.active === tabId, `${tabId} tab did not become active`);
      if (expectedGroupId === null) {
        assert(state.inventorySlotCount === 28, "inventory tab did not render 28 source slots");
      } else {
        assert(
          state.mountedGroups.some((group) => group.groupId === expectedGroupId),
          `${tabId} tab did not mount group ${expectedGroupId}`
        );
      }
    }

    const stats = await clickTab(window, "stats");
    const statsScreenshot = await capture(window, "stats");
    assert(stats.active === "stats", "stats tab did not become active");
    assert(
      stats.stats.some(
        (panel) =>
          panel.groupId === 320 &&
          panel.slotCount === 23 &&
          panel.tileSpriteCount >= 46 &&
          panel.iconSpriteCount === 23 &&
          panel.levelTextCount === 46 &&
          panel.levelGlyphCount > 0 &&
          Number(panel.totalLevelText) > 0
      ),
      "stats tab did not render source-backed skill tiles, icons, and level glyphs"
    );

    const equipment = await clickTab(window, "equipment");
    const equipmentScreenshot = await capture(window, "equipment");
    assert(equipment.active === "equipment", "equipment tab did not become active");
    assert(equipment.equipment.some((panel) => panel.groupId === 387 && panel.slotTileCount === 11), "equipment slot tiles from wear_initslot did not render");
    assert(equipment.equipmentUtilityButtonCount === 4, "equipment utility buttons did not render");
    assert(equipment.equipmentSourceSpriteIds.filter((spriteId) => spriteId === 172).length === 3, "equipment vertical slot sprites did not render");
    assert(equipment.equipmentSourceSpriteIds.filter((spriteId) => spriteId === 173).length === 2, "equipment horizontal slot sprites did not render");

    const quests = await clickTab(window, "quests");
    const questsScreenshot = await capture(window, "quests");
    assert(quests.active === "quests", "quest tab did not become active");
    assert(quests.mountedGroups.some((group) => group.groupId === 720), "quest tab did not mount noticeboard group 720");
    assert(
      quests.noticeboard.some(
        (panel) =>
          panel.groupId === 720 &&
          panel.textCount === 1 &&
          panel.text.includes("Base XP") &&
          !/Server Information|Players Online|Online Staff|Players in Wild|Tournament|Uptime|XP Bonus|Double|Two-factor|Time Played|PVM Points|Achievements|Drop Tables|Settings|Website|Community|Discord|Total Spent|Amount Donated|Store/i.test(panel.text)
      ),
      "noticeboard quest tab should render only Base XP"
    );

    const clanChat = await clickTab(window, "clan-chat");
    const clanChatScreenshot = await capture(window, "clan-chat");
    assert(clanChat.active === "clan-chat", "clan chat tab did not become active");
    assert(clanChat.mountedGroups.some((group) => group.groupId === 7), "clan chat tab did not mount group 7");
    assert(
      clanChat.clanChat.some(
        (panel) =>
          panel.groupId === 7 &&
          panel.active === "true" &&
          panel.displayName === "Nh" &&
          panel.ownerName === "local-player" &&
          panel.memberCount === 2 &&
          panel.rowNames.includes("local-player") &&
          panel.rowNames.includes("Opponent") &&
          panel.rowWorlds.includes(1) &&
          panel.rowRanks.includes(7) &&
          panel.sourcePacket.includes("packet 48") &&
          panel.sourceClientOpcodes.includes("3611") &&
          panel.sourceClientScript === "chatchannel_current_build" &&
          panel.sourceServerHandler.includes("ClanHandler") &&
          panel.buttonActions.some((button) => button.action === "leave" && button.text === "Leave Chat" && button.packetId === "53") &&
          panel.buttonActions.some((button) => button.action === "setup" && button.text === "Clan Setup" && button.sourceHandler.includes("TabClanChat"))
      ),
      "clan chat tab did not render source-backed channel rows/actions"
    );

    const ignores = await clickTab(window, "ignores");
    const ignoresScreenshot = await capture(window, "ignores");
    assert(ignores.active === "ignores", "ignore tab did not become active");
    assert(ignores.mountedGroups.some((group) => group.groupId === 432), "ignore tab did not mount group 432");
    assert(ignores.ignoreText.includes("Ignore List") && ignores.ignoreText.includes("Add Name"), "ignore list text/buttons did not render");
    assert(ignores.ignoreSprites.includes(1702) && ignores.ignoreSprites.includes(293), "ignore list source sprites did not render");
    assert(
      ignores.social.some(
        (panel) =>
          panel.groupId === 432 &&
          panel.listKind === "ignores" &&
          panel.loaded === "true" &&
          panel.sourcePacket.includes("packet 59") &&
          panel.sourceClientOpcodes.includes("3621") &&
          panel.sourceServerHandler === "FriendsHandler" &&
          panel.buttonActions.some((button) => button.action === "switch" && button.text === "View Friends List") &&
          panel.buttonActions.some((button) => button.action === "add" && button.packetId === "84") &&
          panel.buttonActions.some((button) => button.action === "delete" && button.packetId === "56")
      ),
      "ignore tab did not expose source-backed social list rows/actions"
    );

    const friends = await clickTab(window, "friends");
    const friendsScreenshot = await capture(window, "friends");
    assert(friends.active === "friends", "friends tab did not become active");
    assert(friends.mountedGroups.some((group) => group.groupId === 429), "friends tab did not mount group 429");
    assert(friends.friendText.includes("Friends List") && friends.friendText.includes("Add Friend"), "friends list text/buttons did not render");
    assert(
      friends.social.some(
        (panel) =>
          panel.groupId === 429 &&
          panel.listKind === "friends" &&
          panel.loaded === "true" &&
          panel.memberCount >= 1 &&
          panel.rowNames.includes("Opponent") &&
          panel.rowWorlds.includes(1) &&
          panel.sourcePacket.includes("packet 61") &&
          panel.sourceClientOpcodes.includes("3600") &&
          panel.sourceServerHandler === "FriendsHandler" &&
          panel.buttonActions.some((button) => button.action === "switch" && button.text === "View Ignore List") &&
          panel.buttonActions.some((button) => button.action === "add" && button.packetId === "80") &&
          panel.buttonActions.some((button) => button.action === "delete" && button.packetId === "48")
      ),
      "friends tab did not expose source-backed social list rows/actions"
    );

    const options = await clickTab(window, "options");
    assert(options.active === "options", "options tab did not become active");
    assert(options.mountedGroups.some((group) => group.groupId === 261), "options tab did not mount group 261");
    const keybinding = await openAndExerciseKeybinding(window);
    const keybindingScreenshot = await capture(window, "keybinding");
    const keybindingRows = keybinding.afterSelection.rows;
    assert(keybinding.button.actionChildId === "83", "settings keybinding launcher did not use Nh options child 83");
    assert(keybinding.button.sourceHandler.includes("Keybinding::open"), "settings keybinding launcher did not expose Nh open handler");
    assert(keybinding.afterSelection.open === true, "keybinding interface did not remain open after key reassignment");
    assert(keybinding.afterSelection.interfaceId === "121", "keybinding interface did not expose Interface.KEYBINDING 121");
    assert(keybinding.afterSelection.source.includes("Config.KEYBINDS"), "keybinding interface did not expose Config.KEYBINDS source");
    assert(keybinding.afterSelection.rowCount === 14, "keybinding interface did not render all 14 tab keybind rows");
    assert(keybinding.dropdownBeforeSelection.dropdownOpen === true && keybinding.dropdownBeforeSelection.dropdownOptionCount === 14, "keybinding dropdown did not expose all source key options");
    assert(
      keybindingRows.some((row) => row.tabId === "inventory" && row.keySlot === "1" && row.varbit === "4678") &&
        keybindingRows.some((row) => row.tabId === "combat" && row.keySlot === "0" && row.varbit === "4675"),
      "keybinding reassignment did not move F1 to inventory and clear the previous combat F1 binding"
    );

    const emotes = await clickTab(window, "emotes");
    const emotesScreenshot = await capture(window, "emotes");
    assert(emotes.active === "emotes", "emote tab did not become active");
    assert(emotes.mountedGroups.some((group) => group.groupId === 216), "emote tab did not mount group 216");
    assert(
      emotes.emotes.some(
        (panel) =>
          panel.groupId === 216 &&
          panel.sourceClientScript === "emote_init" &&
          panel.buttonCount === 48 &&
          panel.firstStep === "43x49" &&
          panel.firstUnlockedSpriteId === 700 &&
          panel.firstRenderedSpriteId === 700 &&
          panel.firstIconRect &&
          panel.firstIconRect.width > 0 &&
          panel.firstIconRect.height > 0 &&
          panel.usesEmoteAtlas &&
          panel.visibleLabelCount === 0
      ),
      "emote CS2 grid did not render from exported Nh emote sprites"
    );
    assert(errors.length === 0, `console errors while rendering fixed tabs: ${JSON.stringify(errors)}`);

    console.log(
      JSON.stringify(
        {
          ok: true,
          quests,
          clanChat,
          ignores,
          friends,
          keybinding,
          emotes,
          tabSmoke,
          screenshots: {
            quests: questsScreenshot,
            stats: statsScreenshot,
            equipment: equipmentScreenshot,
            clanChat: clanChatScreenshot,
            ignores: ignoresScreenshot,
            friends: friendsScreenshot,
            keybinding: keybindingScreenshot,
            emotes: emotesScreenshot
          }
        },
        null,
        2
      )
    );
    app.exit(0);
  } catch (error) {
    console.error(error && error.stack ? error.stack : String(error));
    app.exit(1);
  }
});
