const { app, BrowserWindow } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const [, , projectRoot] = process.argv;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertHudSourceGuards() {
  const hudSource = fs.readFileSync(path.join(projectRoot, "src", "ui", "NhClientHud.tsx"), "utf8");
  const simDuelSource = fs.readFileSync(path.join(projectRoot, "src", "sim", "nh", "duel.ts"), "utf8");
  assert(
    !hudSource.includes(") : (\n          valueText\n        )"),
    "NhClientHud should not fall back to browser text for orb values when source glyphs are missing"
  );
  assert(
    !hudSource.includes(") : (\n        text\n      )"),
    "NhClientHud should not fall back to browser text for combat/widget values when source glyphs are missing"
  );
  assert(
    !hudSource.includes("color: font && atlas ? undefined : cssRgbColor"),
    "NhClientHud should not paint fallback browser text when source combat/widget glyphs are missing"
  );
  assert(
    hudSource.includes("data-source-glyph-missing=\"true\""),
    "NhClientHud should fail closed with hidden accessible text when source glyphs are unavailable"
  );
  assert(
    hudSource.includes("if (!atlas || !layout || !sourceLayout)"),
    "NhClientHud should not render a fixed client shell until the source fixed layout is available"
  );
  assert(
    hudSource.includes('resolvedActiveSideTabId === "inventory" && inventoryGrid'),
    "NhClientHud should not render an inventory grid from CSS fallback positions when source widget layout is missing"
  );
  assert(
    !hudSource.includes("layout.rect.height - 23"),
    "NhClientHud should size the chatbox background from the exported sprite instead of a handmade button-strip subtraction"
  );
  assert(
    hudSource.includes("const sourceStateFillerSpriteId = active && layout.activeFillerSpriteId ? layout.activeFillerSpriteId : layout.fillerSpriteId") &&
      hudSource.includes("const displayedFillerSpriteId = fillerSpriteIdOverride ?? sourceStateFillerSpriteId"),
    "NhClientHud should switch fixed orbs to exported active filler sprites when the source state is active"
  );
  assert(
    hudSource.includes("active={localWeaponHasSpecialAttack && hud.specialActive === true}"),
    "NhClientHud should bind the special orb active fill to the source special-active varp state"
  );
  assert(
    hudSource.includes("active={hud.running === true}") &&
      hudSource.includes("onRunOrbDefaultAction"),
    "NhClientHud should bind the run orb active fill and click action to the source running varp state"
  );
  assert(
    hudSource.includes("scaledSpriteStyle(atlas, sprite, scaleX, scaleY)") &&
      hudSource.includes("sprite.width * scaleX") &&
      hudSource.includes("sprite.offsetX * scaleX"),
    "NhClientHud should render widget sprites from trimmed cache dimensions with source offsets instead of stretching atlas crops to widget hitboxes"
  );
  assert(
    simDuelSource.includes('"client-skill-level-array-contract"'),
    "Generated NH client-view traces with HUD skills should carry the client skill-array source anchor"
  );
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertSame(name, actual, expected) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${name} mismatch\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  }
}

const fullInventoryItemIds = [
  11785, 4736, 4738, 12006, 11832, 11834, 4153,
  6685, 6685, 6685, 6685, 3024, 3024, 3024,
  385, 385, 385, 385, 3144, 3144, 3144, 3144, 3144,
  13441, 13441, 13441, 12695, 22461
];

function inventoryWithFinalFreeSlot() {
  return fullInventoryItemIds.map((itemId, index) => (index === fullInventoryItemIds.length - 1 ? null : { itemId, quantity: 1 }));
}

async function waitForReady(window) {
  const deadline = Date.now() + 15000;

  while (Date.now() < deadline) {
    const status = await window.webContents.executeJavaScript(`
      (() => {
        const root = document.querySelector('section[aria-labelledby="runtime-scene"]');
        const ready = root?.querySelector(".glbStatus-ready");
        const error = root?.querySelector(".glbStatus-error, .glbStatus-missing");
        return {
          ready: ready?.textContent ?? "",
          error: error?.textContent ?? ""
        };
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

async function selectRuntimeReplay(window, replayId) {
  const result = await window.webContents.executeJavaScript(`
    (() => {
      const select = document.querySelector("#runtime-replay");
      if (!select) {
        return { ok: false, error: "missing runtime replay selector" };
      }
      const option = Array.from(select.options).find((candidate) => candidate.value === ${JSON.stringify(replayId)});
      if (!option) {
        return {
          ok: false,
          error: "missing replay option",
          options: Array.from(select.options).map((candidate) => candidate.value)
        };
      }
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return { ok: true };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  await delay(150);
}

async function setRuntimeCycle(window, cycle) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new CustomEvent("nh-runtime-cycle", {
        detail: { cycle: ${JSON.stringify(cycle)} }
      }));
    })()
  `);
  await delay(120);
}

async function setRuntimeInventory(window, inventory) {
  await window.webContents.executeJavaScript(`
    (() => {
      window.dispatchEvent(new CustomEvent("nh-runtime-inventory", {
        detail: { inventory: ${JSON.stringify(inventory)} }
      }));
    })()
  `);
  await delay(120);
}

async function readRuntimeHud(window) {
  return window.webContents.executeJavaScript(`
    (() => {
      const numberAttribute = (element, name) => {
        const value = element?.getAttribute(name);
        if (value == null || value === "") {
          return null;
        }
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
      };
      const values = {};
      const fills = {};
      for (const fill of Array.from(document.querySelectorAll(".nhFixedOrbFillMask"))) {
        const orb = fill.getAttribute("data-orb");
        if (orb) {
          fills[orb] = {
            fillPixels: Number(fill.getAttribute("data-fill-pixels")),
            fillSourceHeight: Number(fill.getAttribute("data-fill-source-height")),
            height: Math.round(fill.getBoundingClientRect().height),
            backgroundImage: getComputedStyle(fill.querySelector(".nhFixedOrbFilledSlice") ?? fill).backgroundImage
          };
        }
      }
      for (const value of Array.from(document.querySelectorAll(".nhFixedOrbValue"))) {
        const orb = value.getAttribute("data-orb");
        if (orb) {
          const root = value.closest(".nhFixedOrb");
          const rootStyle = root ? getComputedStyle(root) : null;
          const glyphs = Array.from(value.querySelectorAll(".nhWidgetGlyph"));
          const firstGlyphStyle = glyphs[0] ? getComputedStyle(glyphs[0]) : null;
          values[orb] = {
            text: value.textContent ?? "",
            dataValue: Number(value.getAttribute("data-value")),
            dataMaxValue: Number(value.getAttribute("data-max-value")),
            fontId: Number(value.getAttribute("data-font-id")),
            sourceFontArchive: value.getAttribute("data-source-font-archive") ?? "",
            sourceGlyphAtlas: value.getAttribute("data-source-glyph-atlas") ?? "",
            lineHeight: Number(value.getAttribute("data-line-height")),
            textColor: Number(value.getAttribute("data-text-color")),
            textShadowed: value.getAttribute("data-text-shadowed"),
            xTextAlignment: Number(value.getAttribute("data-x-text-alignment")),
            yTextAlignment: Number(value.getAttribute("data-y-text-alignment")),
            glyphCount: Number(value.getAttribute("data-glyph-count")),
            glyphDomCount: glyphs.length,
            firstGlyphMaskImage: firstGlyphStyle?.webkitMaskImage || firstGlyphStyle?.maskImage || "",
            fillPixels: fills[orb]?.fillPixels,
            fillSourceHeight: fills[orb]?.fillSourceHeight,
            fillHeight: fills[orb]?.height,
            fillBackgroundImage: fills[orb]?.backgroundImage ?? "",
            rootLeft: rootStyle?.left ?? "",
            rootTop: rootStyle?.top ?? "",
            rootWidth: rootStyle?.width ?? "",
            rootHeight: rootStyle?.height ?? "",
            frameSpriteId: numberAttribute(root, "data-frame-sprite-id"),
            emptySpriteId: numberAttribute(root, "data-empty-sprite-id"),
            fillerSpriteId: numberAttribute(root, "data-filler-sprite-id"),
            activeFillerSpriteId: numberAttribute(root, "data-active-filler-sprite-id"),
            displayedFillerSpriteId: numberAttribute(root, "data-displayed-filler-sprite-id"),
            iconSpriteId: numberAttribute(root, "data-icon-sprite-id"),
            active: root?.getAttribute("data-active") ?? "",
            left: Math.round(value.getBoundingClientRect().left),
            top: Math.round(value.getBoundingClientRect().top)
          };
        }
      }
      const chatboxTexts = {};
      for (const text of Array.from(document.querySelectorAll(".nhWidgetText"))) {
        const label = text.textContent ?? "";
        if (label === "Public" || label === "Report") {
          const style = getComputedStyle(text);
          const glyphs = Array.from(text.querySelectorAll(".nhWidgetGlyph"));
          const firstGlyphStyle = glyphs[0] ? getComputedStyle(glyphs[0]) : null;
          chatboxTexts[label] = {
            fontId: Number(text.getAttribute("data-font-id")),
            sourceFontArchive: text.getAttribute("data-source-font-archive") ?? "",
            sourceGlyphAtlas: text.getAttribute("data-source-glyph-atlas") ?? "",
            lineHeight: Number(text.getAttribute("data-line-height")),
            textColor: Number(text.getAttribute("data-text-color")),
            textShadowed: text.getAttribute("data-text-shadowed"),
            xTextAlignment: Number(text.getAttribute("data-x-text-alignment")),
            yTextAlignment: Number(text.getAttribute("data-y-text-alignment")),
            glyphCount: Number(text.getAttribute("data-glyph-count")),
            glyphDomCount: glyphs.length,
            firstGlyphMaskImage: firstGlyphStyle?.webkitMaskImage || firstGlyphStyle?.maskImage || "",
            left: style.left,
            top: style.top,
            width: style.width,
            height: style.height
          };
        }
      }
      const chatboxButtons = Array.from(document.querySelectorAll(".nhChatboxButton")).map((button) => {
        const style = getComputedStyle(button);
        return {
          id: button.getAttribute("data-chatbox-button-id") ?? "",
          label: button.getAttribute("data-label") ?? "",
          groupId: Number(button.getAttribute("data-group-id")),
          widgetId: Number(button.getAttribute("data-widget-id")),
          childId: Number(button.getAttribute("data-child-id")),
          clickMask: Number(button.getAttribute("data-click-mask")),
          defaultActionIndex: Number(button.getAttribute("data-default-action-index")),
          defaultActionText: button.getAttribute("data-default-action-text") ?? "",
          defaultMenuOpcode: Number(button.getAttribute("data-default-menu-opcode")),
          sourceActionCount: Number(button.getAttribute("data-source-action-count")),
          sourceActions: button.getAttribute("data-source-actions") ?? "",
          sourceHandler: button.getAttribute("data-source-handler") ?? "",
          sourceActionResolver: button.getAttribute("data-source-action-resolver") ?? "",
          sourceMenuInserter: button.getAttribute("data-source-menu-inserter") ?? "",
          left: Number.parseInt(style.left, 10),
          top: Number.parseInt(style.top, 10),
          width: Number.parseInt(style.width, 10),
          height: Number.parseInt(style.height, 10)
        };
      });
      const sideTabButtons = Array.from(document.querySelectorAll(".nhSideTabButton")).map((tab) => {
        const style = getComputedStyle(tab);
        return {
          id: tab.getAttribute("data-tab-id") ?? "",
          active: tab.getAttribute("data-active") ?? "",
          widgetId: Number(tab.getAttribute("data-widget-id")),
          childId: Number(tab.getAttribute("data-child-id")),
          containerChildId: Number(tab.getAttribute("data-container-child-id")),
          containerWidgetId: Number(tab.getAttribute("data-container-widget-id")),
          containerHidden: tab.getAttribute("data-container-hidden") ?? "",
          row: tab.getAttribute("data-row") ?? "",
          slotIndex: Number(tab.getAttribute("data-slot-index")),
          spriteId: Number(tab.getAttribute("data-sprite-id")),
          iconChildId: Number(tab.getAttribute("data-icon-child-id")),
          iconWidgetId: Number(tab.getAttribute("data-icon-widget-id")),
          iconSpriteId: Number(tab.getAttribute("data-icon-sprite-id")),
          defaultActionIndex: Number(tab.getAttribute("data-default-action-index")),
          defaultActionText: tab.getAttribute("data-default-action-text") ?? "",
          defaultMenuOpcode: Number(tab.getAttribute("data-default-menu-opcode")),
          sourceAction0: tab.getAttribute("data-source-action-0") ?? "",
          sourceActionCount: Number(tab.getAttribute("data-source-action-count")),
          sourceActions: tab.getAttribute("data-source-actions") ?? "",
          sourceMenuInserter: tab.getAttribute("data-source-menu-inserter") ?? "",
          left: Number.parseInt(style.left, 10),
          top: Number.parseInt(style.top, 10),
          width: Number.parseInt(style.width, 10),
          height: Number.parseInt(style.height, 10)
        };
      });
      const sideTabWidgetIds = new Set(sideTabButtons.map((tab) => String(tab.widgetId)));
      const sideTabIconWidgetIds = new Set(sideTabButtons.map((tab) => String(tab.iconWidgetId)));
      const selectedSideTabSprites = Array.from(document.querySelectorAll(".nhWidgetSprite"))
        .filter((sprite) => sideTabWidgetIds.has(sprite.getAttribute("data-widget-id") ?? ""))
        .map((sprite) => {
          const style = getComputedStyle(sprite);
          return {
            widgetId: Number(sprite.getAttribute("data-widget-id")),
            childId: Number(sprite.getAttribute("data-child-id")),
            spriteId: Number(sprite.getAttribute("data-sprite-id")),
            sourceActionCount: Number(sprite.getAttribute("data-source-action-count")),
            left: Number.parseInt(style.left, 10),
            top: Number.parseInt(style.top, 10),
            width: Number.parseInt(style.width, 10),
            height: Number.parseInt(style.height, 10),
            backgroundImage: style.backgroundImage
          };
        });
      const sideTabIconSprites = Array.from(document.querySelectorAll(".nhWidgetSprite"))
        .filter((sprite) => sideTabIconWidgetIds.has(sprite.getAttribute("data-widget-id") ?? ""))
        .map((sprite) => {
          const style = getComputedStyle(sprite);
          const transform = style.transform === "none" ? new DOMMatrixReadOnly() : new DOMMatrixReadOnly(style.transform);
          return {
            widgetId: Number(sprite.getAttribute("data-widget-id")),
            childId: Number(sprite.getAttribute("data-child-id")),
            spriteId: Number(sprite.getAttribute("data-sprite-id")),
            left: Number.parseInt(style.left, 10),
            top: Number.parseInt(style.top, 10),
            width: Number.parseInt(style.width, 10),
            height: Number.parseInt(style.height, 10),
            transformX: transform.m41,
            transformY: transform.m42,
            backgroundImage: style.backgroundImage
          };
        });
      const mountedInterfaceGroups = Array.from(document.querySelectorAll(".nhMountedWidgetLayer")).map((layer) => ({
        groupId: Number(layer.getAttribute("data-group-id")),
        spriteCount: layer.querySelectorAll(".nhWidgetSprite").length,
        textCount: layer.querySelectorAll(".nhWidgetText").length,
        rectangleCount: layer.querySelectorAll(".nhWidgetRectangle").length
      }));
      const noticeboardPanels = Array.from(document.querySelectorAll(".nhNoticeboardLayer")).map((layer) => ({
        groupId: Number(layer.getAttribute("data-group-id")),
        textCount: layer.querySelectorAll(".nhWidgetText").length,
        visibleTexts: Array.from(layer.querySelectorAll(".nhWidgetText")).map((node) => node.textContent ?? "")
      }));
      const emotePanels = Array.from(document.querySelectorAll(".nhEmotePanelLayer")).map((layer) => ({
        groupId: Number(layer.getAttribute("data-group-id")),
        buttonCount: layer.querySelectorAll(".nhEmoteButton").length,
        sourceClientScript: layer.getAttribute("data-source-client-script") ?? ""
      }));
      const inventorySlots = Array.from(document.querySelectorAll(".nhInventorySlot")).map((slot) => {
        const item = slot.querySelector(".nhInventoryItemSprite");
        return {
          slotIndex: Number(slot.getAttribute("data-slot-index")),
          widgetId: Number(slot.getAttribute("data-widget-id")),
          selected: slot.getAttribute("data-selected") ?? "",
          itemId: item ? Number(item.getAttribute("data-item-id")) : null,
          quantity: item ? Number(item.getAttribute("data-quantity")) : null,
          spriteVariant: item?.getAttribute("data-sprite-variant") ?? "",
          sourceBorder: item?.getAttribute("data-source-border") ?? "",
          sourceShadowColor: item?.getAttribute("data-source-shadow-color") ?? "",
          usesItemAtlas: item ? getComputedStyle(item).backgroundImage.includes("item_sprites.png") : false
        };
      });
      const equipmentItems = Array.from(document.querySelectorAll(".nhEquipmentItemSprite")).map((item) => {
        const style = getComputedStyle(item);
        return {
          slotId: item.getAttribute("data-slot-id") ?? "",
          serverSlot: Number(item.getAttribute("data-server-slot")),
          childId: Number(item.getAttribute("data-child-id")),
          widgetId: Number(item.getAttribute("data-widget-id")),
          itemId: Number(item.getAttribute("data-item-id")),
          itemName: item.getAttribute("data-item-name") ?? "",
          spriteVariant: item.getAttribute("data-sprite-variant") ?? "",
          sourceBorder: item.getAttribute("data-source-border") ?? "",
          sourceShadowColor: item.getAttribute("data-source-shadow-color") ?? "",
          sourceActionCount: Number(item.getAttribute("data-source-action-count")),
          left: Number.parseInt(style.left, 10),
          top: Number.parseInt(style.top, 10),
          width: Number.parseInt(style.width, 10),
          height: Number.parseInt(style.height, 10),
          backgroundImage: style.backgroundImage
        };
      });
      const equipmentItemButtons = Array.from(document.querySelectorAll(".nhEquipmentItemButton")).map((button) => {
        const style = getComputedStyle(button);
        return {
          slotId: button.getAttribute("data-slot-id") ?? "",
          serverSlot: Number(button.getAttribute("data-server-slot")),
          groupId: Number(button.getAttribute("data-group-id")),
          childId: Number(button.getAttribute("data-child-id")),
          widgetId: Number(button.getAttribute("data-widget-id")),
          itemId: Number(button.getAttribute("data-item-id")),
          itemName: button.getAttribute("data-item-name") ?? "",
          defaultActionIndex: Number(button.getAttribute("data-default-action-index")),
          defaultActionText: button.getAttribute("data-default-action-text") ?? "",
          defaultMenuOpcode: Number(button.getAttribute("data-default-menu-opcode")),
          sourceActionCount: Number(button.getAttribute("data-source-action-count")),
          sourceActions: button.getAttribute("data-source-actions") ?? "",
          sourceHandler: button.getAttribute("data-source-handler") ?? "",
          sourceServerHandler: button.getAttribute("data-source-server-handler") ?? "",
          left: Number.parseInt(style.left, 10),
          top: Number.parseInt(style.top, 10),
          width: Number.parseInt(style.width, 10),
          height: Number.parseInt(style.height, 10)
        };
      });
      const equipmentUtilityButtons = Array.from(document.querySelectorAll(".nhEquipmentUtilityButton")).map((button) => {
        const style = getComputedStyle(button);
        const id = button.getAttribute("data-button-id") ?? "";
        const sprite = document.querySelector('.nhEquipmentUtilityButtonSprite[data-button-id="' + id + '"]');
        const spriteStyle = sprite ? getComputedStyle(sprite) : null;
        return {
          id,
          label: button.getAttribute("data-label") ?? "",
          groupId: Number(button.getAttribute("data-group-id")),
          widgetId: Number(button.getAttribute("data-widget-id")),
          childId: Number(button.getAttribute("data-child-id")),
          clickMask: Number(button.getAttribute("data-click-mask")),
          defaultActionIndex: Number(button.getAttribute("data-default-action-index")),
          defaultActionText: button.getAttribute("data-default-action-text") ?? "",
          defaultMenuOpcode: Number(button.getAttribute("data-default-menu-opcode")),
          sourceActionCount: Number(button.getAttribute("data-source-action-count")),
          sourceActions: button.getAttribute("data-source-actions") ?? "",
          sourceHandler: button.getAttribute("data-source-handler") ?? "",
          sourceActionResolver: button.getAttribute("data-source-action-resolver") ?? "",
          sourceMenuInserter: button.getAttribute("data-source-menu-inserter") ?? "",
          spriteChildId: Number(button.getAttribute("data-sprite-child-id")),
          spriteWidgetId: Number(button.getAttribute("data-sprite-widget-id")),
          spriteId: Number(button.getAttribute("data-sprite-id")),
          left: Number.parseInt(style.left, 10),
          top: Number.parseInt(style.top, 10),
          width: Number.parseInt(style.width, 10),
          height: Number.parseInt(style.height, 10),
          sprite: sprite
            ? {
                childId: Number(sprite.getAttribute("data-child-id")),
                widgetId: Number(sprite.getAttribute("data-widget-id")),
                spriteId: Number(sprite.getAttribute("data-sprite-id")),
                left: Number.parseInt(spriteStyle.left, 10),
                top: Number.parseInt(spriteStyle.top, 10),
                width: Number.parseInt(spriteStyle.width, 10),
                height: Number.parseInt(spriteStyle.height, 10),
                usesClientAtlas: spriteStyle.backgroundImage.includes("client_ui.png")
              }
            : null
        };
      });
      const activePrayerBackgrounds = new Map(
        Array.from(document.querySelectorAll(".nhPrayerActiveBackground")).map((background) => [
          background.getAttribute("data-prayer-id") ?? "",
          Number(background.getAttribute("data-sprite-id"))
        ])
      );
      const prayerIcons = Array.from(document.querySelectorAll(".nhPrayerIconSprite")).map((icon) => {
        const style = getComputedStyle(icon);
        const prayerId = icon.getAttribute("data-prayer-id") ?? "";
        return {
          prayerId,
          prayerLabel: icon.getAttribute("data-prayer-label") ?? "",
          active: icon.getAttribute("data-active") ?? "",
          activeBackground: activePrayerBackgrounds.has(prayerId),
          activeBackgroundSpriteId: activePrayerBackgrounds.get(prayerId) ?? null,
          childId: Number(icon.getAttribute("data-child-id")),
          disallowedPrayerIds: icon.getAttribute("data-disallowed-prayer-ids") ?? "",
          widgetId: Number(icon.getAttribute("data-widget-id")),
          spriteId: Number(icon.getAttribute("data-sprite-id")),
          sourceOrder: Number(icon.getAttribute("data-source-order")),
          sourceOrdinal: Number(icon.getAttribute("data-source-ordinal")),
          sourceEnumName: icon.getAttribute("data-source-enum-name") ?? "",
          sourceActionText: icon.getAttribute("data-source-action-text") ?? "",
          sourceGraphicHeight: Number(icon.getAttribute("data-source-graphic-height")),
          sourceGraphicWidth: Number(icon.getAttribute("data-source-graphic-width")),
          sourceGraphicWidget: icon.getAttribute("data-source-graphic-widget") ?? "",
          gridColumn: Number(icon.getAttribute("data-grid-column")),
          gridRow: Number(icon.getAttribute("data-grid-row")),
          sourceActionCount: Number(icon.getAttribute("data-source-action-count")),
          varpbitId: Number(icon.getAttribute("data-varpbit-id")),
          prayerLevel: Number(icon.getAttribute("data-prayer-level")),
          prayerDrain: Number(icon.getAttribute("data-prayer-drain")),
          headIcon: icon.getAttribute("data-head-icon") ?? "",
          soundId: Number(icon.getAttribute("data-sound-id")),
          left: Number.parseInt(style.left, 10),
          top: Number.parseInt(style.top, 10),
          width: Number.parseInt(style.width, 10),
          height: Number.parseInt(style.height, 10),
          backgroundImage: style.backgroundImage
        };
      });
      const spellbookIcons = Array.from(document.querySelectorAll(".nhSpellbookIconSprite")).map((icon) => {
        const style = getComputedStyle(icon);
        const graphic = icon.querySelector(".nhSpellbookIconGraphic");
        const graphicStyle = graphic ? getComputedStyle(graphic) : null;
        const backgroundImage = graphicStyle ? graphicStyle.backgroundImage : style.backgroundImage;
        return {
          spellId: icon.getAttribute("data-spell-id") ?? "",
          spellLabel: icon.getAttribute("data-spell-label") ?? "",
          itemId: Number(icon.getAttribute("data-item-id")),
          childId: Number(icon.getAttribute("data-child-id")),
          widgetId: Number(icon.getAttribute("data-widget-id")),
          clickMask: Number(icon.getAttribute("data-click-mask")),
          dataText: icon.getAttribute("data-data-text") ?? "",
          isIf3: icon.getAttribute("data-is-if3") ?? "",
          menuType: Number(icon.getAttribute("data-menu-type")),
          selectable: icon.getAttribute("data-selectable") ?? "",
          selected: icon.getAttribute("data-selected") ?? "",
          selectedSpellName: icon.getAttribute("data-selected-spell-name") ?? "",
          selectedOutline: style.filter,
          selectedOutlineSource: icon.getAttribute("data-source-selected-outline") ?? "",
          selectedSpellStateSource: icon.getAttribute("data-source-selected-spell-state") ?? "",
          spellActionName: icon.getAttribute("data-spell-action-name") ?? "",
          spellName: icon.getAttribute("data-spell-name") ?? "",
          spriteId: Number(icon.getAttribute("data-sprite-id")),
          enabledSpriteId: Number(icon.getAttribute("data-enabled-sprite-id")),
          sourceOrder: Number(icon.getAttribute("data-source-order")),
          gridColumn: Number(icon.getAttribute("data-grid-column")),
          gridRow: Number(icon.getAttribute("data-grid-row")),
          sourceActionCount: Number(icon.getAttribute("data-source-action-count")),
          targetFlags: Number(icon.getAttribute("data-target-flags")),
          left: Number.parseInt(style.left, 10),
          top: Number.parseInt(style.top, 10),
          width: Number.parseInt(style.width, 10),
          height: Number.parseInt(style.height, 10),
          backgroundImage
        };
      });
      const statsSkills = Array.from(document.querySelectorAll(".nhStatsSkillSlot")).map((slot) => {
        const style = getComputedStyle(slot);
        const skillId = slot.getAttribute("data-skill-id") ?? "";
        const skillSelector = CSS.escape(skillId);
        const icon = document.querySelector('.nhStatsSkillIconSprite[data-skill-id="' + skillSelector + '"]');
        const iconStyle = icon ? getComputedStyle(icon) : null;
        const leftTile = document.querySelector('.nhStatsTileSprite-left[data-skill-id="' + skillSelector + '"]');
        const rightTile = document.querySelector('.nhStatsTileSprite-right[data-skill-id="' + skillSelector + '"]');
        const rightTileStyle = rightTile ? getComputedStyle(rightTile) : null;
        const texts = Array.from(document.querySelectorAll('.nhStatsSkillLevelText[data-skill-id="' + skillSelector + '"]')).map((text) => {
          const textStyle = getComputedStyle(text);
          const glyphs = Array.from(text.querySelectorAll(".nhWidgetGlyph"));
          const firstGlyphStyle = glyphs[0] ? getComputedStyle(glyphs[0]) : null;
          return {
            kind: text.getAttribute("data-level-kind") ?? "",
            text: text.textContent ?? "",
            fontId: Number(text.getAttribute("data-font-id")),
            sourceClientArray: text.getAttribute("data-source-client-array") ?? "",
            sourceCs1Opcode: Number(text.getAttribute("data-source-cs1-opcode")),
            sourceFontArchive: text.getAttribute("data-source-font-archive") ?? "",
            sourceGlyphAtlas: text.getAttribute("data-source-glyph-atlas") ?? "",
            sourceSkillArrayIndex: Number(text.getAttribute("data-source-skill-array-index")),
            sourceSkillChildId: Number(text.getAttribute("data-source-skill-child-id")),
            sourceSkillClientId: Number(text.getAttribute("data-source-skill-client-id")),
            sourceSkillWidgetId: Number(text.getAttribute("data-source-skill-widget-id")),
            glyphCount: Number(text.getAttribute("data-glyph-count")),
            glyphDomCount: glyphs.length,
            firstGlyphMaskImage: firstGlyphStyle?.webkitMaskImage || firstGlyphStyle?.maskImage || "",
            left: Number.parseInt(textStyle.left, 10),
            top: Number.parseInt(textStyle.top, 10),
            width: Number.parseInt(textStyle.width, 10),
            height: Number.parseInt(textStyle.height, 10)
          };
        });
        return {
          skillId: slot.getAttribute("data-skill-id") ?? "",
          skillLabel: slot.getAttribute("data-skill-label") ?? "",
          clientId: Number(slot.getAttribute("data-client-id")),
          childId: Number(slot.getAttribute("data-child-id")),
          widgetId: Number(slot.getAttribute("data-widget-id")),
          spriteId: Number(slot.getAttribute("data-sprite-id")),
          sourceOrder: Number(slot.getAttribute("data-source-order")),
          gridColumn: Number(slot.getAttribute("data-grid-column")),
          gridRow: Number(slot.getAttribute("data-grid-row")),
          sourceActionCount: Number(slot.getAttribute("data-source-action-count")),
          sourceLevelArrayIndex: Number(slot.getAttribute("data-source-level-array-index")),
          sourceSkillEnabled: slot.getAttribute("data-source-skill-enabled") === "true",
          currentLevel: Number(slot.getAttribute("data-current-level")),
          fixedLevel: Number(slot.getAttribute("data-fixed-level")),
          left: Number.parseInt(style.left, 10),
          top: Number.parseInt(style.top, 10),
          width: Number.parseInt(style.width, 10),
          height: Number.parseInt(style.height, 10),
          iconBackgroundImage: iconStyle?.backgroundImage ?? "",
          rightTileSpriteId: Number(rightTile?.getAttribute("data-sprite-id")),
          rightTileBackgroundImage: rightTileStyle?.backgroundImage ?? "",
          texts
        };
      });
      const statsTotalNode = document.querySelector(".nhStatsTotalLevelText");
      const statsTotalStyle = statsTotalNode ? getComputedStyle(statsTotalNode) : null;
      const statsTotalGlyphs = statsTotalNode ? Array.from(statsTotalNode.querySelectorAll(".nhWidgetGlyph")) : [];
      const statsTotalFirstGlyphStyle = statsTotalGlyphs[0] ? getComputedStyle(statsTotalGlyphs[0]) : null;
      const statsTotal = statsTotalNode
        ? {
            text: statsTotalNode.textContent ?? "",
            totalLevel: Number(statsTotalNode.getAttribute("data-total-level")),
            sourceClientArray: statsTotalNode.getAttribute("data-source-client-array") ?? "",
            sourceCs1Opcode: Number(statsTotalNode.getAttribute("data-source-cs1-opcode")),
            sourceEnabledSkillCount: Number(statsTotalNode.getAttribute("data-source-enabled-skill-count")),
            containerChildId: Number(statsTotalNode.getAttribute("data-container-child-id")),
            containerWidgetId: Number(statsTotalNode.getAttribute("data-container-widget-id")),
            leftSpriteChildId: Number(statsTotalNode.getAttribute("data-left-sprite-child-id")),
            leftSpriteWidgetId: Number(statsTotalNode.getAttribute("data-left-sprite-widget-id")),
            leftSpriteId: Number(statsTotalNode.getAttribute("data-left-sprite-id")),
            rightSpriteChildId: Number(statsTotalNode.getAttribute("data-right-sprite-child-id")),
            rightSpriteWidgetId: Number(statsTotalNode.getAttribute("data-right-sprite-widget-id")),
            rightSpriteId: Number(statsTotalNode.getAttribute("data-right-sprite-id")),
            textChildId: Number(statsTotalNode.getAttribute("data-text-child-id")),
            textWidgetId: Number(statsTotalNode.getAttribute("data-text-widget-id")),
            fontId: Number(statsTotalNode.getAttribute("data-font-id")),
            sourceFontArchive: statsTotalNode.getAttribute("data-source-font-archive") ?? "",
            sourceGlyphAtlas: statsTotalNode.getAttribute("data-source-glyph-atlas") ?? "",
            glyphCount: Number(statsTotalNode.getAttribute("data-glyph-count")),
            glyphDomCount: statsTotalGlyphs.length,
            firstGlyphMaskImage: statsTotalFirstGlyphStyle?.webkitMaskImage || statsTotalFirstGlyphStyle?.maskImage || "",
            left: Number.parseInt(statsTotalStyle?.left ?? "", 10),
            top: Number.parseInt(statsTotalStyle?.top ?? "", 10),
            width: Number.parseInt(statsTotalStyle?.width ?? "", 10),
            height: Number.parseInt(statsTotalStyle?.height ?? "", 10)
          }
        : null;
      const readCombatText = (selector) => {
        const node = document.querySelector(selector);
        const style = node ? getComputedStyle(node) : null;
        const glyphs = node ? Array.from(node.querySelectorAll(".nhWidgetGlyph")) : [];
        const firstGlyphStyle = glyphs[0] ? getComputedStyle(glyphs[0]) : null;
        return node
          ? {
              text: node.textContent ?? "",
              childId: Number(node.getAttribute("data-child-id")),
              widgetId: Number(node.getAttribute("data-widget-id")),
              fontId: Number(node.getAttribute("data-font-id")),
              sourceFontArchive: node.getAttribute("data-source-font-archive") ?? "",
              sourceGlyphAtlas: node.getAttribute("data-source-glyph-atlas") ?? "",
              glyphCount: Number(node.getAttribute("data-glyph-count")),
              glyphDomCount: glyphs.length,
              firstGlyphMaskImage: firstGlyphStyle?.webkitMaskImage || firstGlyphStyle?.maskImage || "",
              textColor: Number(node.getAttribute("data-text-color")),
              textShadowed: node.getAttribute("data-text-shadowed") ?? "",
              xTextAlignment: Number(node.getAttribute("data-x-text-alignment")),
              yTextAlignment: Number(node.getAttribute("data-y-text-alignment")),
              left: Number.parseInt(style.left, 10),
              top: Number.parseInt(style.top, 10),
              width: Number.parseInt(style.width, 10),
              height: Number.parseInt(style.height, 10)
            }
          : null;
      };
      const combatPanelNode = document.querySelector(".nhCombatPanelLayer");
      const combatPanel = combatPanelNode
        ? {
            groupId: Number(combatPanelNode.getAttribute("data-group-id")),
            weaponItemId: Number(combatPanelNode.getAttribute("data-weapon-item-id")),
            weaponName: combatPanelNode.getAttribute("data-weapon-name") ?? "",
            weaponType: combatPanelNode.getAttribute("data-weapon-type") ?? "",
            weaponTypeConfig: Number(combatPanelNode.getAttribute("data-weapon-type-config")),
            weaponTypeSource: combatPanelNode.getAttribute("data-weapon-type-source") ?? "",
            combatLevel: Number(combatPanelNode.getAttribute("data-combat-level")),
            weaponNameText: readCombatText(".nhCombatWeaponName"),
            combatLevelText: readCombatText(".nhCombatLevel"),
            styleSlots: Array.from(document.querySelectorAll(".nhCombatStyleSlot")).map((slot) => {
              const style = getComputedStyle(slot);
              const slotIndex = slot.getAttribute("data-slot-index");
              const text = readCombatText(\`.nhCombatStyleText[data-slot-index="\${slotIndex}"]\`);
              const icon = document.querySelector(\`.nhCombatStyleIconSprite[data-slot-index="\${slotIndex}"]\`);
              const iconStyle = icon ? getComputedStyle(icon) : null;
              return {
                slotIndex: Number(slotIndex),
                actionChildId: Number(slot.getAttribute("data-action-child-id")),
                actionText: slot.getAttribute("data-action-text") ?? "",
                actionWidgetId: Number(slot.getAttribute("data-action-widget-id")),
                attackSetChildId: Number(slot.getAttribute("data-attack-set-child-id")),
                attackSetIndex: Number(slot.getAttribute("data-attack-set-index")),
                attackSetVarpId: Number(slot.getAttribute("data-attack-set-varp-id")),
                attackType: slot.getAttribute("data-attack-type") ?? "",
                attackTypeLabel: slot.getAttribute("data-attack-type-label") ?? "",
                attackStyle: slot.getAttribute("data-attack-style") ?? "",
                attackStyleLabel: slot.getAttribute("data-attack-style-label") ?? "",
                buttonSpriteId: Number(slot.getAttribute("data-button-sprite-id")),
                iconChildId: Number(slot.getAttribute("data-icon-child-id")),
                iconSpriteId: Number(slot.getAttribute("data-icon-sprite-id")),
                iconSpriteSource: slot.getAttribute("data-icon-sprite-source") ?? "",
                iconWidgetId: Number(slot.getAttribute("data-icon-widget-id")),
                sourceActionCount: Number(slot.getAttribute("data-source-action-count")),
                sourceHidden: slot.getAttribute("data-source-hidden") ?? "",
                selected: slot.getAttribute("data-selected") ?? "",
                textChildId: Number(slot.getAttribute("data-text-child-id")),
                textWidgetId: Number(slot.getAttribute("data-text-widget-id")),
                weaponType: slot.getAttribute("data-weapon-type") ?? "",
                weaponTypeConfig: Number(slot.getAttribute("data-weapon-type-config")),
                weaponTypeSource: slot.getAttribute("data-weapon-type-source") ?? "",
                left: Number.parseInt(style.left, 10),
                top: Number.parseInt(style.top, 10),
                width: Number.parseInt(style.width, 10),
                height: Number.parseInt(style.height, 10),
                icon: icon
                  ? {
                      iconChildId: Number(icon.getAttribute("data-icon-child-id")),
                      iconSpriteId: Number(icon.getAttribute("data-icon-sprite-id")),
                      iconSpriteSource: icon.getAttribute("data-icon-sprite-source") ?? "",
                      iconWidgetId: Number(icon.getAttribute("data-icon-widget-id")),
                      sourceSpriteId: Number(icon.getAttribute("data-source-sprite-id")),
                      left: Number.parseInt(iconStyle?.left ?? "", 10),
                      top: Number.parseInt(iconStyle?.top ?? "", 10),
                      width: Number.parseInt(iconStyle?.width ?? "", 10),
                      height: Number.parseInt(iconStyle?.height ?? "", 10),
                      hasBackground: Boolean((iconStyle?.backgroundImage ?? "").includes("client_ui.png"))
                    }
                  : null,
                text
              };
            }),
            specialBar: (() => {
              const bar = document.querySelector(".nhCombatSpecialBar");
              if (!bar) {
                return null;
              }
              const style = getComputedStyle(bar);
              const fill = bar.querySelector(".nhCombatSpecialBarFill");
              const fillStyle = fill ? getComputedStyle(fill) : null;
              return {
                actionChildId: Number(bar.getAttribute("data-action-child-id")),
                actionWidgetId: Number(bar.getAttribute("data-action-widget-id")),
                actionText: bar.getAttribute("data-action-text") ?? "",
                buttonSpriteId: Number(bar.getAttribute("data-button-sprite-id")),
                backgroundChildId: Number(bar.getAttribute("data-background-child-id")),
                backgroundWidgetId: Number(bar.getAttribute("data-background-widget-id")),
                backgroundColor: Number(bar.getAttribute("data-background-color")),
                borderChildId: Number(bar.getAttribute("data-border-child-id")),
                borderWidgetId: Number(bar.getAttribute("data-border-widget-id")),
                borderColor: Number(bar.getAttribute("data-border-color")),
                drawSpecbarAnyway: bar.getAttribute("data-draw-specbar-anyway") === "true",
                sourceScriptCallback: bar.getAttribute("data-source-script-callback") ?? "",
                fillChildId: Number(bar.getAttribute("data-fill-child-id")),
                fillWidgetId: Number(bar.getAttribute("data-fill-widget-id")),
                fillColor: Number(bar.getAttribute("data-fill-color")),
                fillPixels: Number(bar.getAttribute("data-fill-pixels")),
                specialActive: bar.getAttribute("data-special-active") === "true",
                specialActiveVarpId: Number(bar.getAttribute("data-special-active-varp-id")),
                specialAvailable: bar.getAttribute("data-special-available") === "true",
                specialDrainPercent: Number(bar.getAttribute("data-special-drain-percent")),
                specialDrainSource: bar.getAttribute("data-special-drain-source") ?? "",
                specialEnergy: Number(bar.getAttribute("data-special-energy")),
                specialEnergyVarpId: Number(bar.getAttribute("data-special-energy-varp-id")),
                sourceActionCount: Number(bar.getAttribute("data-source-action-count")),
                varpId: Number(bar.getAttribute("data-varp-id")),
                weaponItemId: Number(bar.getAttribute("data-weapon-item-id")),
                weaponName: bar.getAttribute("data-weapon-name") ?? "",
                left: Number.parseInt(style.left, 10),
                top: Number.parseInt(style.top, 10),
                width: Number.parseInt(style.width, 10),
                height: Number.parseInt(style.height, 10),
                fillWidth: Number.parseInt(fillStyle?.width ?? "", 10),
                text: readCombatText(".nhCombatSpecialText")
              };
            })(),
            autoRetaliate: (() => {
              const control = document.querySelector(".nhCombatAutoRetaliateSource");
              if (!control) {
                return null;
              }
              const style = getComputedStyle(control);
              return {
                actionChildId: Number(control.getAttribute("data-action-child-id")),
                actionWidgetId: Number(control.getAttribute("data-action-widget-id")),
                actionText: control.getAttribute("data-action-text") ?? "",
                enabled: control.getAttribute("data-auto-retaliate-enabled") ?? "",
                varpId: Number(control.getAttribute("data-auto-retaliate-varp-id")),
                buttonSpriteId: Number(control.getAttribute("data-button-sprite-id")),
                sourceActionCount: Number(control.getAttribute("data-source-action-count")),
                left: Number.parseInt(style.left, 10),
                top: Number.parseInt(style.top, 10),
                width: Number.parseInt(style.width, 10),
                height: Number.parseInt(style.height, 10)
              };
            })()
          }
        : null;
      const cycleInput = document.querySelector("#runtime-cycle");
      return {
        cycle: cycleInput?.value ?? "",
        maxCycle: cycleInput?.getAttribute("max") ?? "",
        values,
        chatboxTexts,
        chatboxButtons,
        mountedInterfaceGroups,
        noticeboardPanels,
        emotePanels,
        inventorySlots,
        equipmentItems,
        equipmentItemButtons,
        equipmentUtilityButtons,
        combatPanel,
        statsSkills,
        statsTotal,
        prayerIcons,
        spellbookIcons,
        sideTabs: {
          buttons: sideTabButtons,
          activeButtonIds: sideTabButtons.filter((tab) => tab.active === "true").map((tab) => tab.id),
          iconSprites: sideTabIconSprites,
          selectedSprites: selectedSideTabSprites,
          inventoryVisible: Boolean(document.querySelector(".nhInventoryGrid"))
        }
      };
    })()
  `);
}

async function clickSideTab(window, tabId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const tab = document.querySelector(${JSON.stringify(`.nhSideTabButton[data-tab-id="${tabId}"]`)});
      if (!tab) {
        return { ok: false, error: "missing side tab" };
      }
      const rect = tab.getBoundingClientRect();
      tab.dispatchEvent(new PointerEvent("pointerdown", {
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
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function enableRuneliteSpecBarPlugin(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const configButton = document.querySelector('.runeliteToolbarButton[data-navigation-button-id="configuration"]');
      if (!configButton) {
        return { ok: false, error: "missing runelite config toolbar button" };
      }
      configButton.click();
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const specBarItem = document.querySelector('.runelitePluginListItem[data-plugin-list-item-id="spec-bar"]');
      const toggleButton = specBarItem?.querySelector(".runelitePluginToggleButton");
      if (!specBarItem || !toggleButton) {
        return { ok: false, error: "missing runelite spec-bar plugin list item" };
      }
      if (specBarItem.getAttribute("data-plugin-enabled") !== "true") {
        toggleButton.click();
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      }
      const runtimeCanvas = document.querySelector(".runtimeViewport canvas");
      return {
        ok: true,
        itemEnabled: specBarItem.getAttribute("data-plugin-enabled"),
        dataset: {
          specBarEnabled: runtimeCanvas?.getAttribute("data-runelite-spec-bar-enabled") ?? "",
          drawSpecbarAnyway: runtimeCanvas?.getAttribute("data-runelite-spec-bar-draw-specbar-anyway") ?? "",
          sourcePlugin: runtimeCanvas?.getAttribute("data-source-spec-bar-plugin") ?? "",
          sourceCallback: runtimeCanvas?.getAttribute("data-source-spec-bar-script-callback") ?? "",
          sourceStackMutation: runtimeCanvas?.getAttribute("data-source-spec-bar-stack-mutation") ?? ""
        }
      };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  if (
    result.itemEnabled !== "true" ||
    result.dataset.specBarEnabled !== "true" ||
    result.dataset.drawSpecbarAnyway !== "true" ||
    result.dataset.sourcePlugin !== "SpecBarPlugin.onScriptCallbackEvent" ||
    result.dataset.sourceCallback !== "drawSpecbarAnyway" ||
    result.dataset.sourceStackMutation !== "client.getIntStack()[client.getIntStackSize() - 1] = 1"
  ) {
    throw new Error(`RuneLite Spec Bar plugin did not expose the source script callback state: ${JSON.stringify(result)}`);
  }
  return result.dataset;
}

async function clickChatboxButton(window, buttonId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const button = document.querySelector(${JSON.stringify(`.nhChatboxButton[data-chatbox-button-id="${buttonId}"]`)});
      if (!button) {
        return { ok: false, error: "missing chatbox button" };
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
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function openContextMenuFromSelector(window, selector) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const target = document.querySelector(${JSON.stringify(selector)});
      if (!target) {
        return { ok: false, error: "missing context target", selector: ${JSON.stringify(selector)} };
      }
      const rect = target.getBoundingClientRect();
      target.dispatchEvent(new PointerEvent("pointerdown", {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 1,
        pointerType: "mouse",
        button: 2,
        buttons: 2,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2
      }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const menu = document.querySelector(".nhContextMenu");
      const options = Array.from(document.querySelectorAll(".nhContextMenuOption")).map((option) => ({
        action: option.getAttribute("data-menu-action") ?? "",
        actionKind: option.getAttribute("data-menu-action-kind") ?? "",
        opcode: Number(option.getAttribute("data-menu-opcode")),
        identifier: option.getAttribute("data-menu-identifier") ?? "",
        argument1: option.getAttribute("data-menu-argument1") ?? "",
        argument2: option.getAttribute("data-menu-argument2") ?? "",
        text: option.textContent ?? ""
      }));
      return {
        ok: true,
        menu: menu
          ? {
              source: menu.getAttribute("data-menu-source") ?? "",
              closeMargin: menu.getAttribute("data-source-close-margin") ?? "",
              optionCount: options.length
            }
          : null,
        options
      };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result;
}

async function clickContextMenuOption(window, actionText) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const option = Array.from(document.querySelectorAll(".nhContextMenuOption"))
        .find((candidate) => candidate.getAttribute("data-menu-action") === ${JSON.stringify(actionText)});
      if (!option) {
        return {
          ok: false,
          error: "missing context option",
          actionText: ${JSON.stringify(actionText)},
          options: Array.from(document.querySelectorAll(".nhContextMenuOption")).map((candidate) => ({
            action: candidate.getAttribute("data-menu-action") ?? "",
            text: candidate.textContent ?? ""
          }))
        };
      }
      option.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 0
      }));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function clickStatsSkill(window, skillId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const skill = document.querySelector(${JSON.stringify(`.nhStatsSkillSlot[data-skill-id="${skillId}"]`)});
      if (!skill) {
        return { ok: false, error: "missing stats skill" };
      }
      const rect = skill.getBoundingClientRect();
      skill.dispatchEvent(new PointerEvent("pointerdown", {
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
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function clickCombatStyle(window, slotIndex) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const style = document.querySelector(${JSON.stringify(`.nhCombatStyleSlot[data-slot-index="${slotIndex}"]`)});
      if (!style) {
        return { ok: false, error: "missing combat style" };
      }
      const rect = style.getBoundingClientRect();
      style.dispatchEvent(new PointerEvent("pointerdown", {
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
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function clickCombatAutoRetaliate(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const control = document.querySelector(".nhCombatAutoRetaliateSource");
      if (!control) {
        return { ok: false, error: "missing combat auto-retaliate control" };
      }
      const rect = control.getBoundingClientRect();
      control.dispatchEvent(new PointerEvent("pointerdown", {
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
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function clickCombatSpecial(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const control = document.querySelector(".nhCombatSpecialBar");
      if (!control) {
        return { ok: false, error: "missing combat special control" };
      }
      const rect = control.getBoundingClientRect();
      control.dispatchEvent(new PointerEvent("pointerdown", {
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
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function clickRunOrb(window) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const control = document.querySelector(".nhFixedOrb-run");
      if (!control) {
        return { ok: false, error: "missing run orb" };
      }
      const rect = control.getBoundingClientRect();
      control.dispatchEvent(new PointerEvent("pointerdown", {
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
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function clickEquipmentUtilityButton(window, buttonId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const button = document.querySelector(${JSON.stringify(`.nhEquipmentUtilityButton[data-button-id="${buttonId}"]`)});
      if (!button) {
        return { ok: false, error: "missing equipment utility button" };
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
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      const panel = document.querySelector(".nhEquipmentUtilityPanel");
      return {
        ok: true,
        dataset: { ...viewport?.dataset },
        panel: panel ? {
          mode: panel.getAttribute("data-panel-mode") || "",
          sourceMainInterface: panel.getAttribute("data-source-main-interface") || "",
          sourceInventoryInterface: panel.getAttribute("data-source-inventory-interface") || "",
          sourceServerHandler: panel.getAttribute("data-source-server-handler") || "",
          text: panel.textContent || ""
        } : null
      };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return { ...result.dataset, equipmentUtilityPanel: result.panel };
}

async function clickEquipmentItemButton(window, slotId, waitMs = 0) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const button = document.querySelector(${JSON.stringify(`.nhEquipmentItemButton[data-slot-id="${slotId}"]`)});
      if (!button) {
        return { ok: false, error: "missing equipment item button" };
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
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const waitMs = ${JSON.stringify(waitMs)};
      if (waitMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function clickPrayerIcon(window, prayerId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const prayer = document.querySelector(${JSON.stringify(`.nhPrayerSlotButton[data-prayer-id="${prayerId}"]`)});
      if (!prayer) {
        return { ok: false, error: "missing prayer icon" };
      }
      const rect = prayer.getBoundingClientRect();
      prayer.dispatchEvent(new PointerEvent("pointerdown", {
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
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
}

async function clickSpellbookIcon(window, spellId) {
  const result = await window.webContents.executeJavaScript(`
    (async () => {
      const spell = document.querySelector(${JSON.stringify(`.nhSpellbookIconSprite[data-spell-id="${spellId}"]`)});
      if (!spell) {
        return { ok: false, error: "missing spell icon" };
      }
      const rect = spell.getBoundingClientRect();
      spell.dispatchEvent(new PointerEvent("pointerdown", {
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
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const viewport = document.querySelector(".runtimeViewport");
      return { ok: true, dataset: { ...viewport?.dataset } };
    })()
  `);
  if (!result.ok) {
    throw new Error(JSON.stringify(result));
  }
  return result.dataset;
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
      partition: `runtime-hud-validation-${Date.now()}`,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    assertHudSourceGuards();
    const runtimeReadyMessage = await window.loadFile(path.join(projectRoot, "dist", "index.html")).then(() => waitForReady(window));
    await selectRuntimeReplay(window, "generated-nh-duel-v1");
    await setRuntimeCycle(window, 0);
    const initialHud = await readRuntimeHud(window);
    const maxCycle = Number.parseInt(initialHud.maxCycle, 10);
    if (!Number.isInteger(maxCycle) || maxCycle < 1) {
      throw new Error(`Invalid runtime cycle max: ${JSON.stringify(initialHud)}`);
    }

    const requiredOrbs = ["hp", "prayer", "run", "spec"];
    for (const orb of requiredOrbs) {
      if (
        !initialHud.values[orb] ||
        !Number.isInteger(initialHud.values[orb].dataValue) ||
        !Number.isInteger(initialHud.values[orb].dataMaxValue) ||
        initialHud.values[orb].dataMaxValue < 1 ||
        !Number.isInteger(initialHud.values[orb].fillPixels)
      ) {
        throw new Error(`Missing initial HUD orb ${orb}: ${JSON.stringify(initialHud)}`);
      }
    }
    const expectedOrbRects = {
      hp: { rootLeft: "516px", rootTop: "37px", rootWidth: "57px", rootHeight: "34px", fillerSpriteId: 1060, activeFillerSpriteId: null, iconSpriteId: 1067 },
      prayer: { rootLeft: "516px", rootTop: "71px", rootWidth: "57px", rootHeight: "34px", fillerSpriteId: 1063, activeFillerSpriteId: 1066, iconSpriteId: 1068 },
      run: { rootLeft: "526px", rootTop: "103px", rootWidth: "57px", rootHeight: "34px", fillerSpriteId: 1064, activeFillerSpriteId: 1065, iconSpriteId: 1069 },
      spec: { rootLeft: "548px", rootTop: "128px", rootWidth: "57px", rootHeight: "34px", fillerSpriteId: 1607, activeFillerSpriteId: 1608, iconSpriteId: 1610 }
    };
    for (const [orb, expected] of Object.entries(expectedOrbRects)) {
      const value = initialHud.values[orb];
      const expectedActive = orb === "run";
      const expectedDisplayedFillerSpriteId = expectedActive ? expected.activeFillerSpriteId : expected.fillerSpriteId;
      if (
        value.rootLeft !== expected.rootLeft ||
        value.rootTop !== expected.rootTop ||
        value.rootWidth !== expected.rootWidth ||
        value.rootHeight !== expected.rootHeight ||
        value.frameSpriteId !== 1071 ||
        value.emptySpriteId !== 1059 ||
        value.fillerSpriteId !== expected.fillerSpriteId ||
        value.activeFillerSpriteId !== expected.activeFillerSpriteId ||
        value.displayedFillerSpriteId !== expectedDisplayedFillerSpriteId ||
        value.iconSpriteId !== expected.iconSpriteId ||
        value.active !== String(expectedActive) ||
        value.fontId !== 494 ||
        value.sourceFontArchive !== "p11_full" ||
        value.sourceGlyphAtlas !== "client_p11_font" ||
        value.textColor !== 16776960 ||
        value.textShadowed !== "true" ||
        value.xTextAlignment !== 1 ||
        value.yTextAlignment !== 1 ||
        value.glyphCount <= 0 ||
        value.glyphDomCount < value.glyphCount * 2 ||
        !value.firstGlyphMaskImage.includes("client_p11_font.png")
      ) {
        throw new Error(`HUD orb ${orb} did not use the fixed source-backed 160 layout: ${JSON.stringify(value)}`);
      }
    }
    const runOffDispatch = await clickRunOrb(window);
    const runOffHud = await readRuntimeHud(window);
    if (
      runOffHud.values.run?.active !== "false" ||
      runOffHud.values.run?.displayedFillerSpriteId !== 1064 ||
      runOffDispatch.lastRunTogglePreviousRunning !== "true" ||
      runOffDispatch.lastRunToggleRunning !== "false" ||
      runOffDispatch.lastRunToggleEnergy !== "100" ||
      runOffDispatch.lastRunToggleSourceHandler !== "PlayerMovement.toggleRunning"
    ) {
      throw new Error(`Run orb click did not toggle source PlayerMovement.toggleRunning metadata off: ${JSON.stringify({ runOffDispatch, run: runOffHud.values.run })}`);
    }
    const runOnDispatch = await clickRunOrb(window);
    const runOnHud = await readRuntimeHud(window);
    if (
      runOnHud.values.run?.active !== "true" ||
      runOnHud.values.run?.displayedFillerSpriteId !== 1065 ||
      runOnDispatch.lastRunTogglePreviousRunning !== "false" ||
      runOnDispatch.lastRunToggleRunning !== "true"
    ) {
      throw new Error(`Run orb click did not toggle source PlayerMovement.toggleRunning metadata on: ${JSON.stringify({ runOnDispatch, run: runOnHud.values.run })}`);
    }
    for (const [label, expectedRect] of Object.entries({
      Public: { left: "137px", top: "480px", width: "56px", height: "11px" },
      Report: { left: "403px", top: "480px", width: "111px", height: "22px" }
    })) {
      const text = initialHud.chatboxTexts[label];
      if (
        !text ||
        text.fontId !== 494 ||
        text.sourceFontArchive !== "p11_full" ||
        text.sourceGlyphAtlas !== "client_p11_font" ||
        text.textColor !== 16777215 ||
        text.textShadowed !== "true" ||
        text.xTextAlignment !== 1 ||
        text.yTextAlignment !== 1 ||
        text.glyphCount <= 0 ||
        text.glyphDomCount < text.glyphCount * 2 ||
        !text.firstGlyphMaskImage.includes("client_p11_font.png") ||
        text.left !== expectedRect.left ||
        text.top !== expectedRect.top ||
        text.width !== expectedRect.width ||
        text.height !== expectedRect.height
      ) {
        throw new Error(`Chatbox text ${label} did not use exported widget text fields: ${JSON.stringify(text)}`);
      }
    }
    const compactChatboxButtons = initialHud.chatboxButtons.map((button) => ({
      id: button.id,
      label: button.label,
      groupId: button.groupId,
      widgetId: button.widgetId,
      childId: button.childId,
      clickMask: button.clickMask,
      defaultActionIndex: button.defaultActionIndex,
      defaultActionText: button.defaultActionText,
      defaultMenuOpcode: button.defaultMenuOpcode,
      sourceActionCount: button.sourceActionCount,
      sourceHandler: button.sourceHandler,
      sourceActionResolver: button.sourceActionResolver,
      sourceMenuInserter: button.sourceMenuInserter,
      left: button.left,
      top: button.top,
      width: button.width,
      height: button.height
    }));
    assertSame("fixed chatbox button hitboxes and default actions", compactChatboxButtons, [
      { id: "all", label: "All", groupId: 162, widgetId: 10616836, childId: 4, clickMask: 2, defaultActionIndex: 1, defaultActionText: "Switch tab", defaultMenuOpcode: 57, sourceActionCount: 1, sourceHandler: "MusicPatchNode.method3842", sourceActionResolver: "FaceNormal.method2908", sourceMenuInserter: "AttackOption.method2104", left: 5, top: 480, width: 56, height: 22 },
      { id: "game", label: "Game", groupId: 162, widgetId: 10616840, childId: 8, clickMask: 14, defaultActionIndex: 1, defaultActionText: "Switch tab", defaultMenuOpcode: 57, sourceActionCount: 3, sourceHandler: "MusicPatchNode.method3842", sourceActionResolver: "FaceNormal.method2908", sourceMenuInserter: "AttackOption.method2104", left: 71, top: 480, width: 56, height: 22 },
      { id: "public", label: "Public", groupId: 162, widgetId: 10616845, childId: 13, clickMask: 1022, defaultActionIndex: 1, defaultActionText: "Switch tab", defaultMenuOpcode: 57, sourceActionCount: 9, sourceHandler: "MusicPatchNode.method3842", sourceActionResolver: "FaceNormal.method2908", sourceMenuInserter: "AttackOption.method2104", left: 137, top: 480, width: 56, height: 22 },
      { id: "private", label: "Private", groupId: 162, widgetId: 10616850, childId: 18, clickMask: 122, defaultActionIndex: 1, defaultActionText: "Switch tab", defaultMenuOpcode: 57, sourceActionCount: 5, sourceHandler: "MusicPatchNode.method3842", sourceActionResolver: "FaceNormal.method2908", sourceMenuInserter: "AttackOption.method2104", left: 203, top: 480, width: 56, height: 22 },
      { id: "clan", label: "Clan", groupId: 162, widgetId: 10616855, childId: 23, clickMask: 58, defaultActionIndex: 1, defaultActionText: "Switch tab", defaultMenuOpcode: 57, sourceActionCount: 4, sourceHandler: "MusicPatchNode.method3842", sourceActionResolver: "FaceNormal.method2908", sourceMenuInserter: "AttackOption.method2104", left: 269, top: 480, width: 56, height: 22 },
      { id: "trade", label: "Trade", groupId: 162, widgetId: 10616860, childId: 28, clickMask: 58, defaultActionIndex: 1, defaultActionText: "Switch tab", defaultMenuOpcode: 57, sourceActionCount: 4, sourceHandler: "MusicPatchNode.method3842", sourceActionResolver: "FaceNormal.method2908", sourceMenuInserter: "AttackOption.method2104", left: 335, top: 480, width: 56, height: 22 },
      { id: "report", label: "Report", groupId: 162, widgetId: 10616865, childId: 33, clickMask: 30, defaultActionIndex: 1, defaultActionText: "*", defaultMenuOpcode: 57, sourceActionCount: 4, sourceHandler: "MusicPatchNode.method3842", sourceActionResolver: "FaceNormal.method2908", sourceMenuInserter: "AttackOption.method2104", left: 403, top: 480, width: 111, height: 22 }
    ]);
    const publicChatboxDispatch = await clickChatboxButton(window, "public");
    if (
      publicChatboxDispatch.lastChatboxAction !== "Switch tab" ||
      publicChatboxDispatch.lastChatboxActionIndex !== "1" ||
      publicChatboxDispatch.lastChatboxButtonId !== "public" ||
      publicChatboxDispatch.lastChatboxButtonLabel !== "Public" ||
      publicChatboxDispatch.lastChatboxChildId !== "13" ||
      publicChatboxDispatch.lastChatboxClickMask !== "1022" ||
      publicChatboxDispatch.lastChatboxDefaultActionIndex !== "1" ||
      publicChatboxDispatch.lastChatboxDefaultActionText !== "Switch tab" ||
      publicChatboxDispatch.lastChatboxGroupId !== "162" ||
      publicChatboxDispatch.lastChatboxMenuInserter !== "AttackOption.method2104" ||
      publicChatboxDispatch.lastChatboxMenuOpcode !== "57" ||
      publicChatboxDispatch.lastChatboxSourceActionCount !== "9" ||
      !publicChatboxDispatch.lastChatboxSourceActions.includes("<col=ffff00>Public:</col> Clear history") ||
      publicChatboxDispatch.lastChatboxSourceActionResolver !== "FaceNormal.method2908" ||
      publicChatboxDispatch.lastChatboxSourceHandler !== "MusicPatchNode.method3842" ||
      publicChatboxDispatch.lastChatboxWidgetId !== "10616845"
    ) {
      throw new Error(`Public chatbox click did not dispatch source widget menu metadata: ${JSON.stringify(publicChatboxDispatch)}`);
    }
    const reportChatboxDispatch = await clickChatboxButton(window, "report");
    if (
      reportChatboxDispatch.lastChatboxAction !== "*" ||
      reportChatboxDispatch.lastChatboxActionIndex !== "1" ||
      reportChatboxDispatch.lastChatboxButtonId !== "report" ||
      reportChatboxDispatch.lastChatboxButtonLabel !== "Report" ||
      reportChatboxDispatch.lastChatboxChildId !== "33" ||
      reportChatboxDispatch.lastChatboxClickMask !== "30" ||
      reportChatboxDispatch.lastChatboxDefaultActionIndex !== "1" ||
      reportChatboxDispatch.lastChatboxDefaultActionText !== "*" ||
      reportChatboxDispatch.lastChatboxGroupId !== "162" ||
      reportChatboxDispatch.lastChatboxMenuInserter !== "AttackOption.method2104" ||
      reportChatboxDispatch.lastChatboxMenuOpcode !== "57" ||
      reportChatboxDispatch.lastChatboxSourceActionCount !== "4" ||
      !reportChatboxDispatch.lastChatboxSourceActions.includes("Report abuse") ||
      reportChatboxDispatch.lastChatboxSourceActionResolver !== "FaceNormal.method2908" ||
      reportChatboxDispatch.lastChatboxSourceHandler !== "MusicPatchNode.method3842" ||
      reportChatboxDispatch.lastChatboxWidgetId !== "10616865"
    ) {
      throw new Error(`Report chatbox click did not dispatch source widget menu metadata: ${JSON.stringify(reportChatboxDispatch)}`);
    }
    const publicChatboxMenu = await openContextMenuFromSelector(window, '.nhChatboxButton[data-chatbox-button-id="public"]');
    const publicChatboxMenuActions = publicChatboxMenu.options.map((option) => option.action);
    const publicClearHistoryOption = publicChatboxMenu.options.find(
      (option) => option.action === "<col=ffff00>Public:</col> Clear history"
    );
    if (
      publicChatboxMenu.menu?.optionCount !== 9 ||
      !publicChatboxMenuActions.includes("Switch tab") ||
      !publicClearHistoryOption ||
      publicClearHistoryOption.actionKind !== "hud-widget-action" ||
      publicClearHistoryOption.opcode !== 1007 ||
      publicClearHistoryOption.identifier !== "7" ||
      publicClearHistoryOption.argument1 !== "13" ||
      publicClearHistoryOption.argument2 !== "10616845"
    ) {
      throw new Error(`Public chatbox right-click menu did not mirror source widget actions: ${JSON.stringify(publicChatboxMenu)}`);
    }
    const publicClearHistoryDispatch = await clickContextMenuOption(window, "<col=ffff00>Public:</col> Clear history");
    if (
      publicClearHistoryDispatch.lastChatboxAction !== "<col=ffff00>Public:</col> Clear history" ||
      publicClearHistoryDispatch.lastChatboxActionIndex !== "7" ||
      publicClearHistoryDispatch.lastChatboxButtonId !== "public" ||
      publicClearHistoryDispatch.lastChatboxChildId !== "13" ||
      publicClearHistoryDispatch.lastChatboxMenuOpcode !== "1007" ||
      publicClearHistoryDispatch.lastChatboxMenuInserter !== "AttackOption.method2104" ||
      publicClearHistoryDispatch.lastChatboxWidgetId !== "10616845"
    ) {
      throw new Error(`Public chatbox context action did not dispatch selected widget action metadata: ${JSON.stringify(publicClearHistoryDispatch)}`);
    }
    const inventorySideTabMenu = await openContextMenuFromSelector(window, '.nhSideTabButton[data-tab-id="inventory"]');
    if (
      inventorySideTabMenu.menu?.optionCount !== 1 ||
      inventorySideTabMenu.options[0]?.action !== "*" ||
      inventorySideTabMenu.options[0]?.actionKind !== "hud-widget-action" ||
      inventorySideTabMenu.options[0]?.opcode !== 57 ||
      inventorySideTabMenu.options[0]?.identifier !== "1" ||
      inventorySideTabMenu.options[0]?.argument1 !== "51" ||
      inventorySideTabMenu.options[0]?.argument2 !== "35913779"
    ) {
      throw new Error(`Inventory side tab right-click menu did not mirror source widget action metadata: ${JSON.stringify(inventorySideTabMenu)}`);
    }
    const inventorySideTabContextDispatch = await clickContextMenuOption(window, "*");
    if (
      inventorySideTabContextDispatch.activeSideTabId !== "inventory" ||
      inventorySideTabContextDispatch.lastSideTabAction !== "*" ||
      inventorySideTabContextDispatch.lastSideTabActionIndex !== "1" ||
      inventorySideTabContextDispatch.lastSideTabMenuOpcode !== "57" ||
      inventorySideTabContextDispatch.lastSideTabMenuInserter !== "AttackOption.method2104" ||
      inventorySideTabContextDispatch.lastSideTabSourceActionCount !== "1" ||
      inventorySideTabContextDispatch.lastSideTabWidgetId !== "35913779"
    ) {
      throw new Error(`Side tab context action did not dispatch selected source widget metadata: ${JSON.stringify(inventorySideTabContextDispatch)}`);
    }
    const expectedSideTabs = [
      { id: "combat", childId: 48, widgetId: 35913776, row: "top", slotIndex: 0, spriteId: 1026, iconChildId: 55, iconSpriteId: 168, left: 522, top: 168, width: 38, height: 36 },
      { id: "stats", childId: 49, widgetId: 35913777, row: "top", slotIndex: 1, spriteId: 1030, iconChildId: 56, iconSpriteId: 898, left: 560, top: 168, width: 33, height: 36 },
      { id: "quests", childId: 50, widgetId: 35913778, row: "top", slotIndex: 2, spriteId: 1030, iconChildId: 57, iconSpriteId: 899, left: 593, top: 168, width: 38, height: 36 },
      { id: "inventory", childId: 51, widgetId: 35913779, row: "top", slotIndex: 3, spriteId: 1030, iconChildId: 58, iconSpriteId: 900, left: 626, top: 168, width: 33, height: 36 },
      { id: "equipment", childId: 52, widgetId: 35913780, row: "top", slotIndex: 4, spriteId: 1030, iconChildId: 59, iconSpriteId: 901, left: 659, top: 168, width: 33, height: 36 },
      { id: "prayer", childId: 53, widgetId: 35913781, row: "top", slotIndex: 5, spriteId: 1030, iconChildId: 60, iconSpriteId: 902, left: 692, top: 168, width: 33, height: 36 },
      { id: "magic", childId: 54, widgetId: 35913782, row: "top", slotIndex: 6, spriteId: 1027, iconChildId: 61, iconSpriteId: 903, left: 725, top: 168, width: 38, height: 36 },
      { id: "clan-chat", childId: 31, widgetId: 35913759, row: "bottom", slotIndex: 0, spriteId: 1028, iconChildId: 38, iconSpriteId: 904, left: 522, top: 466, width: 38, height: 36 },
      { id: "ignores", childId: 32, widgetId: 35913760, row: "bottom", slotIndex: 2, spriteId: 1030, iconChildId: 39, iconSpriteId: 1709, left: 593, top: 466, width: 38, height: 36 },
      { id: "friends", childId: 33, widgetId: 35913761, row: "bottom", slotIndex: 1, spriteId: 1030, iconChildId: 40, iconSpriteId: 905, left: 560, top: 466, width: 33, height: 36 },
      { id: "logout", childId: 34, widgetId: 35913762, row: "bottom", slotIndex: 3, spriteId: 1030, iconChildId: 41, iconSpriteId: 907, left: 626, top: 466, width: 33, height: 36 },
      { id: "options", childId: 35, widgetId: 35913763, row: "bottom", slotIndex: 4, spriteId: 1030, iconChildId: 42, iconSpriteId: 908, left: 659, top: 466, width: 33, height: 36 },
      { id: "emotes", childId: 36, widgetId: 35913764, row: "bottom", slotIndex: 5, spriteId: 1030, iconChildId: 43, iconSpriteId: 909, left: 692, top: 466, width: 33, height: 36 },
      { id: "music", childId: 37, widgetId: 35913765, row: "bottom", slotIndex: 6, spriteId: 1029, iconChildId: 44, iconSpriteId: 910, left: 725, top: 466, width: 38, height: 36 }
    ];
    const compactSideTabs = initialHud.sideTabs.buttons.map((tab) => ({
      id: tab.id,
      childId: tab.childId,
      widgetId: tab.widgetId,
      row: tab.row,
      slotIndex: tab.slotIndex,
      spriteId: tab.spriteId,
      iconChildId: tab.iconChildId,
      iconSpriteId: tab.iconSpriteId,
      left: tab.left,
      top: tab.top,
      width: tab.width,
      height: tab.height
    }));
    if (JSON.stringify(compactSideTabs) !== JSON.stringify(expectedSideTabs)) {
      throw new Error(`Fixed side tabs did not use the exported WidgetID.FixedViewport child layout: ${JSON.stringify(initialHud.sideTabs.buttons)}`);
    }
    const expectedSideTabContainers = [
      { id: "combat", containerChildId: 66, containerWidgetId: 35913794, containerHidden: "true" },
      { id: "stats", containerChildId: 67, containerWidgetId: 35913795, containerHidden: "true" },
      { id: "quests", containerChildId: 68, containerWidgetId: 35913796, containerHidden: "true" },
      { id: "inventory", containerChildId: 69, containerWidgetId: 35913797, containerHidden: "true" },
      { id: "equipment", containerChildId: 70, containerWidgetId: 35913798, containerHidden: "true" },
      { id: "prayer", containerChildId: 71, containerWidgetId: 35913799, containerHidden: "true" },
      { id: "magic", containerChildId: 72, containerWidgetId: 35913800, containerHidden: "true" },
      { id: "clan-chat", containerChildId: 73, containerWidgetId: 35913801, containerHidden: "true" },
      { id: "ignores", containerChildId: 74, containerWidgetId: 35913802, containerHidden: "true" },
      { id: "friends", containerChildId: 75, containerWidgetId: 35913803, containerHidden: "true" },
      { id: "logout", containerChildId: 76, containerWidgetId: 35913804, containerHidden: "true" },
      { id: "options", containerChildId: 77, containerWidgetId: 35913805, containerHidden: "true" },
      { id: "emotes", containerChildId: 78, containerWidgetId: 35913806, containerHidden: "true" },
      { id: "music", containerChildId: 79, containerWidgetId: 35913807, containerHidden: "true" }
    ];
    const compactSideTabContainers = initialHud.sideTabs.buttons.map((tab) => ({
      id: tab.id,
      containerChildId: tab.containerChildId,
      containerWidgetId: tab.containerWidgetId,
      containerHidden: tab.containerHidden
    }));
    if (JSON.stringify(compactSideTabContainers) !== JSON.stringify(expectedSideTabContainers)) {
      throw new Error(`Fixed side tab containers did not use the source InterfaceTab container layout: ${JSON.stringify(initialHud.sideTabs.buttons)}`);
    }
    const compactKeySideTabIcons = initialHud.sideTabs.iconSprites
      .filter((icon) => [58, 60, 61].includes(icon.childId))
      .map((icon) => ({
        childId: icon.childId,
        widgetId: icon.widgetId,
        spriteId: icon.spriteId,
        left: icon.left,
        top: icon.top,
        width: icon.width,
        height: icon.height,
        transformX: icon.transformX,
        transformY: icon.transformY
      }));
    assertSame("fixed side tab trimmed icon sprites", compactKeySideTabIcons, [
      { childId: 58, widgetId: 35913786, spriteId: 900, left: 626, top: 168, width: 26, height: 28, transformX: 4, transformY: 4 },
      { childId: 60, widgetId: 35913788, spriteId: 902, left: 692, top: 168, width: 26, height: 30, transformX: 4, transformY: 3 },
      { childId: 61, widgetId: 35913789, spriteId: 903, left: 726, top: 168, width: 25, height: 24, transformX: 4, transformY: 6 }
    ]);
    if (!initialHud.sideTabs.buttons.every((tab) => tab.sourceAction0 === "*" && tab.sourceActionCount >= 1)) {
      throw new Error(`Fixed side tab buttons did not preserve source action slots: ${JSON.stringify(initialHud.sideTabs.buttons)}`);
    }
    if (
      JSON.stringify(initialHud.sideTabs.activeButtonIds) !== JSON.stringify(["inventory"]) ||
      initialHud.sideTabs.selectedSprites.length !== 1 ||
      initialHud.sideTabs.selectedSprites[0].childId !== 51 ||
      initialHud.sideTabs.selectedSprites[0].spriteId !== 1030 ||
      !initialHud.sideTabs.selectedSprites[0].backgroundImage.includes("client_ui.png") ||
      !initialHud.sideTabs.inventoryVisible
    ) {
      throw new Error(`Initial fixed side tab state should select inventory from source widgets only: ${JSON.stringify(initialHud.sideTabs)}`);
    }
    const mountedGroup = (hud, groupId) => hud.mountedInterfaceGroups.find((group) => group.groupId === groupId);
    if (
      !mountedGroup(initialHud, 162) ||
      mountedGroup(initialHud, 593) ||
      mountedGroup(initialHud, 320) ||
      mountedGroup(initialHud, 387) ||
      mountedGroup(initialHud, 541) ||
      mountedGroup(initialHud, 218) ||
      initialHud.equipmentItems.length !== 0 ||
      initialHud.equipmentItemButtons.length !== 0 ||
      initialHud.equipmentUtilityButtons.length !== 0 ||
      initialHud.combatPanel !== null ||
      initialHud.statsSkills.length !== 0 ||
      initialHud.statsTotal !== null ||
      initialHud.prayerIcons.length !== 0 ||
      initialHud.spellbookIcons.length !== 0
    ) {
      throw new Error(`Initial side-panel content should not mount non-inventory tab groups: ${JSON.stringify(initialHud.mountedInterfaceGroups)}`);
    }
    await setRuntimeCycle(window, 0);
    const specBarDataset = await enableRuneliteSpecBarPlugin(window);
    const combatDispatch = await clickSideTab(window, "combat");
    const combatHud = await readRuntimeHud(window);
    const mountedCombat = mountedGroup(combatHud, 593);
    if (
      combatDispatch.activeSideTabId !== "combat" ||
      combatDispatch.lastSideTabId !== "combat" ||
      combatDispatch.lastSideTabAction !== "*" ||
      combatDispatch.lastSideTabWidgetId !== "35913776" ||
      combatDispatch.lastSideTabChildId !== "48" ||
      combatDispatch.lastSideTabContainerChildId !== "66" ||
      combatDispatch.lastSideTabContainerWidgetId !== "35913794" ||
      combatDispatch.lastSideTabIconChildId !== "55" ||
      combatDispatch.lastSideTabIconSpriteId !== "168" ||
      combatDispatch.lastSideTabRow !== "top" ||
      combatDispatch.lastSideTabSlotIndex !== "0" ||
      JSON.stringify(combatHud.sideTabs.activeButtonIds) !== JSON.stringify(["combat"]) ||
      combatHud.sideTabs.selectedSprites.length !== 1 ||
      combatHud.sideTabs.selectedSprites[0].childId !== 48 ||
      combatHud.sideTabs.inventoryVisible ||
      combatHud.prayerIcons.length !== 0 ||
      combatHud.spellbookIcons.length !== 0 ||
      combatHud.equipmentItems.length !== 0 ||
      combatHud.equipmentItemButtons.length !== 0 ||
      combatHud.equipmentUtilityButtons.length !== 0 ||
      combatHud.statsSkills.length !== 0 ||
      combatHud.statsTotal !== null ||
      !mountedCombat ||
      mountedCombat.spriteCount !== 0 ||
      mountedCombat.textCount !== 0 ||
      !combatHud.combatPanel
    ) {
      throw new Error(`Fixed combat tab did not mount the exported source combat widget group: ${JSON.stringify({ combatDispatch, combatHud })}`);
    }
    const combatPanel = combatHud.combatPanel;
    if (
      combatPanel.groupId !== 593 ||
      combatPanel.weaponItemId !== 11785 ||
      combatPanel.weaponName !== "Armadyl crossbow" ||
      combatPanel.weaponType !== "ARMADYL_CROSSBOW" ||
      combatPanel.weaponTypeConfig !== 5 ||
      combatPanel.weaponTypeSource !== "equipment-definition" ||
      combatPanel.combatLevel !== 126 ||
      combatPanel.weaponNameText?.text !== "Armadyl crossbow" ||
      combatPanel.weaponNameText?.childId !== 1 ||
      combatPanel.weaponNameText?.widgetId !== 38862849 ||
      combatPanel.weaponNameText?.fontId !== 497 ||
      combatPanel.weaponNameText?.textColor !== 16750623 ||
      combatPanel.weaponNameText?.left !== 547 ||
      combatPanel.weaponNameText?.top !== 205 ||
      combatPanel.weaponNameText?.width !== 190 ||
      combatPanel.weaponNameText?.height !== 30 ||
      combatPanel.combatLevelText?.text !== "Combat Lvl: 126" ||
      combatPanel.combatLevelText?.childId !== 3 ||
      combatPanel.combatLevelText?.widgetId !== 38862851 ||
      combatPanel.combatLevelText?.fontId !== 494 ||
      combatPanel.combatLevelText?.sourceFontArchive !== "p11_full" ||
      combatPanel.combatLevelText?.sourceGlyphAtlas !== "client_p11_font" ||
      combatPanel.combatLevelText?.glyphCount <= 0 ||
      combatPanel.combatLevelText?.glyphDomCount < combatPanel.combatLevelText?.glyphCount * 2 ||
      !combatPanel.combatLevelText?.firstGlyphMaskImage.includes("client_p11_font.png")
    ) {
      throw new Error(`Combat tab did not render source-backed weapon name and combat level: ${JSON.stringify(combatPanel)}`);
    }
    const compactCombatStyles = combatPanel.styleSlots.map((slot) => ({
      slotIndex: slot.slotIndex,
      actionChildId: slot.actionChildId,
      actionText: slot.actionText,
      actionWidgetId: slot.actionWidgetId,
      attackSetChildId: slot.attackSetChildId,
      attackSetIndex: slot.attackSetIndex,
      attackSetVarpId: slot.attackSetVarpId,
      attackType: slot.attackType,
      attackTypeLabel: slot.attackTypeLabel,
      attackStyle: slot.attackStyle,
      attackStyleLabel: slot.attackStyleLabel,
      buttonSpriteId: slot.buttonSpriteId,
      iconChildId: slot.iconChildId,
      iconSpriteId: slot.iconSpriteId,
      iconSpriteSource: slot.iconSpriteSource,
      iconWidgetId: slot.iconWidgetId,
      selected: slot.selected,
      sourceActionCount: slot.sourceActionCount,
      sourceHidden: slot.sourceHidden,
      textChildId: slot.textChildId,
      textWidgetId: slot.textWidgetId,
      weaponType: slot.weaponType,
      weaponTypeConfig: slot.weaponTypeConfig,
      weaponTypeSource: slot.weaponTypeSource,
      left: slot.left,
      top: slot.top,
      width: slot.width,
      height: slot.height,
      icon: slot.icon,
      text: {
        value: slot.text?.text,
        fontId: slot.text?.fontId,
        sourceFontArchive: slot.text?.sourceFontArchive,
        sourceGlyphAtlas: slot.text?.sourceGlyphAtlas,
        hasGlyphs: (slot.text?.glyphCount ?? 0) > 0 && (slot.text?.glyphDomCount ?? 0) >= (slot.text?.glyphCount ?? 0) * 2,
        left: slot.text?.left,
        top: slot.text?.top,
        width: slot.text?.width,
        height: slot.text?.height
      }
    }));
    assertSame("fixed combat tab crossbow attack style population", compactCombatStyles, [
      {
        slotIndex: 0,
        actionChildId: 4,
        actionText: "*",
        actionWidgetId: 38862852,
        attackSetChildId: 3,
        attackSetIndex: 0,
        attackSetVarpId: 43,
        attackType: "ACCURATE",
        attackTypeLabel: "Accurate",
        attackStyle: "RANGED",
        attackStyleLabel: "Ranged",
        buttonSpriteId: 654,
        iconChildId: 6,
        iconSpriteId: 197,
        iconSpriteSource: "client-script-graphic",
        iconWidgetId: 38862854,
        selected: "true",
        sourceActionCount: 1,
        sourceHidden: "true",
        textChildId: 7,
        textWidgetId: 38862855,
        weaponType: "ARMADYL_CROSSBOW",
        weaponTypeConfig: 5,
        weaponTypeSource: "equipment-definition",
        left: 567,
        top: 250,
        width: 71,
        height: 47,
        icon: {
          iconChildId: 6,
          iconSpriteId: 197,
          iconSpriteSource: "client-script-graphic",
          iconWidgetId: 38862854,
          sourceSpriteId: 258,
          left: 585,
          top: 255,
          width: 34,
          height: 24,
          hasBackground: false
        },
        text: {
          value: "Accurate",
          fontId: 494,
          sourceFontArchive: "p11_full",
          sourceGlyphAtlas: "client_p11_font",
          hasGlyphs: true,
          left: 568,
          top: 280,
          width: 68,
          height: 13
        }
      },
      {
        slotIndex: 1,
        actionChildId: 8,
        actionText: "*",
        actionWidgetId: 38862856,
        attackSetChildId: 7,
        attackSetIndex: 0,
        attackSetVarpId: 43,
        attackType: "RAPID_RANGED",
        attackTypeLabel: "Rapid",
        attackStyle: "RANGED",
        attackStyleLabel: "Ranged",
        buttonSpriteId: 653,
        iconChildId: 10,
        iconSpriteId: 200,
        iconSpriteSource: "client-script-graphic",
        iconWidgetId: 38862858,
        selected: "false",
        sourceActionCount: 1,
        sourceHidden: "true",
        textChildId: 11,
        textWidgetId: 38862859,
        weaponType: "ARMADYL_CROSSBOW",
        weaponTypeConfig: 5,
        weaponTypeSource: "equipment-definition",
        left: 646,
        top: 250,
        width: 71,
        height: 47,
        icon: {
          iconChildId: 10,
          iconSpriteId: 200,
          iconSpriteSource: "client-script-graphic",
          iconWidgetId: 38862858,
          sourceSpriteId: 259,
          left: 664,
          top: 255,
          width: 34,
          height: 24,
          hasBackground: false
        },
        text: {
          value: "Rapid",
          fontId: 494,
          sourceFontArchive: "p11_full",
          sourceGlyphAtlas: "client_p11_font",
          hasGlyphs: true,
          left: 647,
          top: 280,
          width: 68,
          height: 13
        }
      },
      {
        slotIndex: 3,
        actionChildId: 16,
        actionText: "*",
        actionWidgetId: 38862864,
        attackSetChildId: 15,
        attackSetIndex: 0,
        attackSetVarpId: 43,
        attackType: "LONG_RANGED",
        attackTypeLabel: "Longrange",
        attackStyle: "RANGED",
        attackStyleLabel: "Ranged",
        buttonSpriteId: 653,
        iconChildId: 18,
        iconSpriteId: 200,
        iconSpriteSource: "client-script-graphic",
        iconWidgetId: 38862866,
        selected: "false",
        sourceActionCount: 1,
        sourceHidden: "true",
        textChildId: 19,
        textWidgetId: 38862867,
        weaponType: "ARMADYL_CROSSBOW",
        weaponTypeConfig: 5,
        weaponTypeSource: "equipment-definition",
        left: 567,
        top: 304,
        width: 71,
        height: 47,
        icon: {
          iconChildId: 18,
          iconSpriteId: 200,
          iconSpriteSource: "client-script-graphic",
          iconWidgetId: 38862866,
          sourceSpriteId: 260,
          left: 585,
          top: 309,
          width: 34,
          height: 24,
          hasBackground: false
        },
        text: {
          value: "Longrange",
          fontId: 494,
          sourceFontArchive: "p11_full",
          sourceGlyphAtlas: "client_p11_font",
          hasGlyphs: true,
          left: 568,
          top: 334,
          width: 68,
          height: 13
        }
      }
    ]);
    if (
      combatPanel.specialBar?.actionChildId !== 36 ||
      combatPanel.specialBar?.actionWidgetId !== 38862884 ||
      combatPanel.specialBar?.actionText !== "Use <col=00ff00>Special Attack</col>" ||
      combatPanel.specialBar?.buttonSpriteId !== 657 ||
      combatPanel.specialBar?.backgroundChildId !== 37 ||
      combatPanel.specialBar?.backgroundWidgetId !== 38862885 ||
      combatPanel.specialBar?.backgroundColor !== 7538182 ||
      combatPanel.specialBar?.fillChildId !== 39 ||
      combatPanel.specialBar?.fillWidgetId !== 38862887 ||
      combatPanel.specialBar?.fillColor !== 3767611 ||
      combatPanel.specialBar?.borderChildId !== 41 ||
      combatPanel.specialBar?.borderWidgetId !== 38862889 ||
      combatPanel.specialBar?.borderColor !== 2894371 ||
      combatPanel.specialBar?.drawSpecbarAnyway !== false ||
      combatPanel.specialBar?.sourceScriptCallback !== "" ||
      combatPanel.specialBar?.specialEnergy !== 100 ||
      combatPanel.specialBar?.specialActive !== false ||
      combatPanel.specialBar?.specialActiveVarpId !== 301 ||
      combatPanel.specialBar?.specialAvailable !== true ||
      combatPanel.specialBar?.specialDrainPercent !== 40 ||
      combatPanel.specialBar?.specialDrainSource !== "nh-server:combat.special.ranged.ArmadylCrossbow" ||
      combatPanel.specialBar?.specialEnergyVarpId !== 300 ||
      combatPanel.specialBar?.varpId !== 300 ||
      combatPanel.specialBar?.weaponItemId !== 11785 ||
      combatPanel.specialBar?.weaponName !== "Armadyl crossbow" ||
      combatPanel.specialBar?.fillPixels !== 146 ||
      combatPanel.specialBar?.fillWidth !== 146 ||
      combatPanel.specialBar?.left !== 567 ||
      combatPanel.specialBar?.top !== 409 ||
      combatPanel.specialBar?.width !== 150 ||
      combatPanel.specialBar?.height !== 26 ||
      combatPanel.specialBar?.text?.text !== "Special Attack: 100%" ||
      combatPanel.specialBar?.text?.fontId !== 494 ||
      combatPanel.specialBar?.text?.textColor !== 16 ||
      combatPanel.specialBar?.text?.sourceFontArchive !== "p11_full" ||
      combatPanel.specialBar?.text?.sourceGlyphAtlas !== "client_p11_font" ||
      combatPanel.specialBar?.text?.glyphCount <= 0
    ) {
      throw new Error(`Combat tab did not render source-backed special attack bar: ${JSON.stringify(combatPanel.specialBar)}`);
    }
    if (
      combatPanel.autoRetaliate?.actionChildId !== 30 ||
      combatPanel.autoRetaliate?.actionWidgetId !== 38862878 ||
      combatPanel.autoRetaliate?.actionText !== "Auto retaliate" ||
      combatPanel.autoRetaliate?.enabled !== "true" ||
      combatPanel.autoRetaliate?.varpId !== 172 ||
      combatPanel.autoRetaliate?.buttonSpriteId !== 656 ||
      combatPanel.autoRetaliate?.sourceActionCount !== 1 ||
      combatPanel.autoRetaliate?.left !== 567 ||
      combatPanel.autoRetaliate?.top !== 358 ||
      combatPanel.autoRetaliate?.width !== 150 ||
      combatPanel.autoRetaliate?.height !== 44
    ) {
      throw new Error(`Combat tab did not expose source-backed auto-retaliate HUD state: ${JSON.stringify(combatPanel.autoRetaliate)}`);
    }
    const combatStyleDispatch = await clickCombatStyle(window, 1);
    const combatStyleHud = await readRuntimeHud(window);
    const selectedAfterStyleClick = combatStyleHud.combatPanel?.styleSlots.map((slot) => ({
      slotIndex: slot.slotIndex,
      attackSetIndex: slot.attackSetIndex,
      selected: slot.selected,
      buttonSpriteId: slot.buttonSpriteId
    }));
    assertSame("fixed combat style click selected attack-set varp state", selectedAfterStyleClick, [
      { slotIndex: 0, attackSetIndex: 1, selected: "false", buttonSpriteId: 653 },
      { slotIndex: 1, attackSetIndex: 1, selected: "true", buttonSpriteId: 654 },
      { slotIndex: 3, attackSetIndex: 1, selected: "false", buttonSpriteId: 653 }
    ]);
    if (
      combatStyleDispatch.lastCombatControlKind !== "attack-style" ||
      combatStyleDispatch.lastCombatStyleAction !== "*" ||
      combatStyleDispatch.lastCombatStyleActionChildId !== "8" ||
      combatStyleDispatch.lastCombatStyleActionWidgetId !== "38862856" ||
      combatStyleDispatch.lastCombatStyleAttackSetChildId !== "7" ||
      combatStyleDispatch.lastCombatStyleAttackSetIndex !== "1" ||
      combatStyleDispatch.lastCombatStyleAttackSetVarpId !== "43" ||
      combatStyleDispatch.lastCombatStyleAttackStyle !== "RANGED" ||
      combatStyleDispatch.lastCombatStyleAttackType !== "RAPID_RANGED" ||
      combatStyleDispatch.lastCombatStylePreviousAttackSetIndex !== "0" ||
      combatStyleDispatch.lastCombatStyleSourceActionCount !== "1" ||
      combatStyleDispatch.lastCombatStyleSourceHandler !== "TabCombat.changeAttackSet" ||
      combatStyleDispatch.lastCombatStyleWeaponType !== "ARMADYL_CROSSBOW" ||
      combatStyleDispatch.lastCombatStyleWeaponTypeConfig !== "5"
    ) {
      throw new Error(`Combat style click did not dispatch source TabCombat.changeAttackSet metadata: ${JSON.stringify(combatStyleDispatch)}`);
    }
    const autoRetaliateDispatch = await clickCombatAutoRetaliate(window);
    const autoRetaliateHud = await readRuntimeHud(window);
    if (
      autoRetaliateHud.combatPanel?.autoRetaliate?.enabled !== "false" ||
      autoRetaliateHud.combatPanel?.autoRetaliate?.buttonSpriteId !== 655 ||
      autoRetaliateDispatch.lastCombatControlKind !== "auto-retaliate" ||
      autoRetaliateDispatch.lastCombatAutoRetaliateAction !== "Auto retaliate" ||
      autoRetaliateDispatch.lastCombatAutoRetaliateActionChildId !== "30" ||
      autoRetaliateDispatch.lastCombatAutoRetaliateActionWidgetId !== "38862878" ||
      autoRetaliateDispatch.lastCombatAutoRetaliateEnabled !== "false" ||
      autoRetaliateDispatch.lastCombatAutoRetaliatePreviousEnabled !== "true" ||
      autoRetaliateDispatch.lastCombatAutoRetaliateSourceActionCount !== "1" ||
      autoRetaliateDispatch.lastCombatAutoRetaliateSourceHandler !== "Config.AUTO_RETALIATE.toggle" ||
      autoRetaliateDispatch.lastCombatAutoRetaliateVarpId !== "172"
    ) {
      throw new Error(`Combat auto-retaliate click did not toggle source Config.AUTO_RETALIATE metadata: ${JSON.stringify({ autoRetaliateDispatch, autoRetaliateHud: autoRetaliateHud.combatPanel?.autoRetaliate })}`);
    }
    const specialDispatch = await clickCombatSpecial(window);
    const specialHud = await readRuntimeHud(window);
    if (
      specialHud.combatPanel?.specialBar?.specialActive !== true ||
      specialDispatch.lastCombatControlKind !== "special-attack" ||
      specialDispatch.lastCombatSpecialAction !== "Use <col=00ff00>Special Attack</col>" ||
      specialDispatch.lastCombatSpecialActionChildId !== "36" ||
      specialDispatch.lastCombatSpecialActionWidgetId !== "38862884" ||
      specialDispatch.lastCombatSpecialActive !== "true" ||
      specialDispatch.lastCombatSpecialActiveVarpId !== "301" ||
      specialDispatch.lastCombatSpecialAvailable !== "true" ||
      specialDispatch.lastCombatSpecialDrainPercent !== "40" ||
      specialDispatch.lastCombatSpecialDrainSource !== "nh-server:combat.special.ranged.ArmadylCrossbow" ||
      specialDispatch.lastCombatSpecialEnergy !== "100" ||
      specialDispatch.lastCombatSpecialEnergyVarpId !== "300" ||
      specialDispatch.lastCombatSpecialMutation !== "activate" ||
      specialDispatch.lastCombatSpecialPreviousActive !== "false" ||
      specialDispatch.lastCombatSpecialSourceActionCount !== "1" ||
      specialDispatch.lastCombatSpecialSourceHandler !== "PlayerCombat.toggleSpecial" ||
      specialDispatch.lastCombatSpecialWeaponItemId !== "11785" ||
      specialDispatch.lastCombatSpecialWeaponName !== "Armadyl crossbow"
    ) {
      throw new Error(`Combat special click did not dispatch source PlayerCombat.toggleSpecial metadata for a special weapon: ${JSON.stringify({ specialDispatch, specialHud: specialHud.combatPanel?.specialBar })}`);
    }
    if (process.env.NH_RUNTIME_HUD_SCOPE === "combat") {
      process.stdout.write(
        `${JSON.stringify(
          {
            runtimeReadyMessage,
            combatPanel,
            compactCombatStyles,
            selectedAfterStyleClick,
            combatStyleDispatch,
            autoRetaliate: autoRetaliateHud.combatPanel?.autoRetaliate,
            autoRetaliateDispatch,
            special: specialHud.combatPanel?.specialBar,
            specialDispatch
          },
          null,
          2
        )}\n`,
        () => app.exit(0)
      );
      return;
    }
    const statsDispatch = await clickSideTab(window, "stats");
    const statsHud = await readRuntimeHud(window);
    const mountedStats = mountedGroup(statsHud, 320);
    if (
      statsDispatch.activeSideTabId !== "stats" ||
      statsDispatch.lastSideTabId !== "stats" ||
      statsDispatch.lastSideTabAction !== "*" ||
      statsDispatch.lastSideTabWidgetId !== "35913777" ||
      statsDispatch.lastSideTabChildId !== "49" ||
      statsDispatch.lastSideTabContainerChildId !== "67" ||
      statsDispatch.lastSideTabContainerWidgetId !== "35913795" ||
      statsDispatch.lastSideTabIconChildId !== "56" ||
      statsDispatch.lastSideTabIconSpriteId !== "898" ||
      statsDispatch.lastSideTabRow !== "top" ||
      statsDispatch.lastSideTabSlotIndex !== "1" ||
      JSON.stringify(statsHud.sideTabs.activeButtonIds) !== JSON.stringify(["stats"]) ||
      statsHud.sideTabs.selectedSprites.length !== 1 ||
      statsHud.sideTabs.selectedSprites[0].childId !== 49 ||
      statsHud.sideTabs.inventoryVisible ||
      statsHud.prayerIcons.length !== 0 ||
      statsHud.spellbookIcons.length !== 0 ||
      statsHud.equipmentItems.length !== 0 ||
      statsHud.equipmentItemButtons.length !== 0 ||
      statsHud.equipmentUtilityButtons.length !== 0 ||
      statsHud.combatPanel !== null ||
      !mountedStats ||
      mountedStats.spriteCount !== 2 ||
      mountedStats.textCount !== 0
    ) {
      throw new Error(`Fixed stats tab did not dispatch or mount the source skills widget group: ${JSON.stringify({ statsDispatch, statsHud })}`);
    }
    const compactStatsSkills = statsHud.statsSkills.map((skill) => ({
      skillId: skill.skillId,
      skillLabel: skill.skillLabel,
      clientId: skill.clientId,
      childId: skill.childId,
      widgetId: skill.widgetId,
      spriteId: skill.spriteId,
      sourceOrder: skill.sourceOrder,
      gridColumn: skill.gridColumn,
      gridRow: skill.gridRow,
      sourceLevelArrayIndex: skill.sourceLevelArrayIndex,
      sourceSkillEnabled: skill.sourceSkillEnabled,
      currentLevel: skill.currentLevel,
      fixedLevel: skill.fixedLevel,
      sourceActionCount: skill.sourceActionCount,
      left: skill.left,
      top: skill.top,
      width: skill.width,
      height: skill.height,
      rightTileSpriteId: skill.rightTileSpriteId,
      usesClientAtlas: skill.iconBackgroundImage.includes("client_ui.png") && skill.rightTileBackgroundImage.includes("client_ui.png"),
      texts: skill.texts.map((text) => ({
        kind: text.kind,
        text: text.text,
        fontId: text.fontId,
        sourceClientArray: text.sourceClientArray,
        sourceCs1Opcode: text.sourceCs1Opcode,
        sourceFontArchive: text.sourceFontArchive,
        sourceGlyphAtlas: text.sourceGlyphAtlas,
        sourceSkillArrayIndex: text.sourceSkillArrayIndex,
        sourceSkillChildId: text.sourceSkillChildId,
        sourceSkillClientId: text.sourceSkillClientId,
        sourceSkillWidgetId: text.sourceSkillWidgetId,
        hasGlyphs: text.glyphCount > 0 && text.glyphDomCount >= text.glyphCount * 2 && text.firstGlyphMaskImage.includes("client_p11_font.png"),
        left: text.left,
        top: text.top,
        width: text.width,
        height: text.height
      }))
    }));
    const keyStatsSkills = compactStatsSkills.filter((skill) =>
      ["attack", "ranged", "hitpoints", "construction", "farming"].includes(skill.skillId)
    );
    const expectedKeyStatsSkills = [
      {
        skillId: "attack",
        skillLabel: "Attack",
        clientId: 1,
        childId: 1,
        widgetId: 20971521,
        spriteId: 197,
        sourceOrder: 0,
        gridColumn: 0,
        gridRow: 0,
        sourceLevelArrayIndex: 0,
        sourceSkillEnabled: true,
        currentLevel: 99,
        fixedLevel: 99,
        sourceActionCount: 2,
        left: 548,
        top: 206,
        width: 62,
        height: 32,
        rightTileSpriteId: 176,
        usesClientAtlas: true,
        texts: [{ kind: "single", text: "99", fontId: 494, sourceClientArray: "levels", sourceCs1Opcode: 2, sourceFontArchive: "p11_full", sourceGlyphAtlas: "client_p11_font", sourceSkillArrayIndex: 0, sourceSkillChildId: 1, sourceSkillClientId: 1, sourceSkillWidgetId: 20971521, hasGlyphs: true, left: 580, top: 216, width: 28, height: 12 }]
      },
      {
        skillId: "ranged",
        skillLabel: "Ranged",
        clientId: 3,
        childId: 4,
        widgetId: 20971524,
        spriteId: 200,
        sourceOrder: 3,
        gridColumn: 0,
        gridRow: 3,
        sourceLevelArrayIndex: 4,
        sourceSkillEnabled: true,
        currentLevel: 112,
        fixedLevel: 99,
        sourceActionCount: 2,
        left: 548,
        top: 302,
        width: 62,
        height: 32,
        rightTileSpriteId: 175,
        usesClientAtlas: true,
        texts: [
          { kind: "current", text: "112", fontId: 494, sourceClientArray: "currentLevels", sourceCs1Opcode: 1, sourceFontArchive: "p11_full", sourceGlyphAtlas: "client_p11_font", sourceSkillArrayIndex: 4, sourceSkillChildId: 4, sourceSkillClientId: 3, sourceSkillWidgetId: 20971524, hasGlyphs: true, left: 580, top: 304, width: 28, height: 12 },
          { kind: "fixed", text: "99", fontId: 494, sourceClientArray: "levels", sourceCs1Opcode: 2, sourceFontArchive: "p11_full", sourceGlyphAtlas: "client_p11_font", sourceSkillArrayIndex: 4, sourceSkillChildId: 4, sourceSkillClientId: 3, sourceSkillWidgetId: 20971524, hasGlyphs: true, left: 580, top: 319, width: 28, height: 12 }
        ]
      },
      {
        skillId: "construction",
        skillLabel: "Construction",
        clientId: 22,
        childId: 8,
        widgetId: 20971528,
        spriteId: 221,
        sourceOrder: 7,
        gridColumn: 0,
        gridRow: 7,
        sourceLevelArrayIndex: 22,
        sourceSkillEnabled: true,
        currentLevel: 1,
        fixedLevel: 1,
        sourceActionCount: 2,
        left: 548,
        top: 430,
        width: 62,
        height: 32,
        rightTileSpriteId: 176,
        usesClientAtlas: true,
        texts: [{ kind: "single", text: "1", fontId: 494, sourceClientArray: "levels", sourceCs1Opcode: 2, sourceFontArchive: "p11_full", sourceGlyphAtlas: "client_p11_font", sourceSkillArrayIndex: 22, sourceSkillChildId: 8, sourceSkillClientId: 22, sourceSkillWidgetId: 20971528, hasGlyphs: true, left: 580, top: 440, width: 28, height: 12 }]
      },
      {
        skillId: "hitpoints",
        skillLabel: "Hitpoints",
        clientId: 6,
        childId: 9,
        widgetId: 20971529,
        spriteId: 203,
        sourceOrder: 8,
        gridColumn: 1,
        gridRow: 0,
        sourceLevelArrayIndex: 3,
        sourceSkillEnabled: true,
        currentLevel: 99,
        fixedLevel: 99,
        sourceActionCount: 2,
        left: 611,
        top: 206,
        width: 62,
        height: 32,
        rightTileSpriteId: 176,
        usesClientAtlas: true,
        texts: [{ kind: "single", text: "99", fontId: 494, sourceClientArray: "levels", sourceCs1Opcode: 2, sourceFontArchive: "p11_full", sourceGlyphAtlas: "client_p11_font", sourceSkillArrayIndex: 3, sourceSkillChildId: 9, sourceSkillClientId: 6, sourceSkillWidgetId: 20971529, hasGlyphs: true, left: 643, top: 216, width: 28, height: 12 }]
      },
      {
        skillId: "farming",
        skillLabel: "Farming",
        clientId: 21,
        childId: 23,
        widgetId: 20971543,
        spriteId: 217,
        sourceOrder: 22,
        gridColumn: 2,
        gridRow: 6,
        sourceLevelArrayIndex: 19,
        sourceSkillEnabled: true,
        currentLevel: 1,
        fixedLevel: 1,
        sourceActionCount: 2,
        left: 674,
        top: 398,
        width: 62,
        height: 32,
        rightTileSpriteId: 176,
        usesClientAtlas: true,
        texts: [{ kind: "single", text: "1", fontId: 494, sourceClientArray: "levels", sourceCs1Opcode: 2, sourceFontArchive: "p11_full", sourceGlyphAtlas: "client_p11_font", sourceSkillArrayIndex: 19, sourceSkillChildId: 23, sourceSkillClientId: 21, sourceSkillWidgetId: 20971543, hasGlyphs: true, left: 706, top: 408, width: 28, height: 12 }]
      }
    ];
    if (
      statsHud.statsSkills.length !== 23 ||
      !statsHud.statsSkills.every((skill) => skill.sourceSkillEnabled) ||
      JSON.stringify(keyStatsSkills) !== JSON.stringify(expectedKeyStatsSkills) ||
      !statsHud.statsTotal ||
      statsHud.statsTotal.totalLevel !== 709 ||
      statsHud.statsTotal.sourceClientArray !== "levels" ||
      statsHud.statsTotal.sourceCs1Opcode !== 9 ||
      statsHud.statsTotal.sourceEnabledSkillCount !== 23 ||
      statsHud.statsTotal.containerChildId !== 24 ||
      statsHud.statsTotal.containerWidgetId !== 20971544 ||
      statsHud.statsTotal.leftSpriteChildId !== 25 ||
      statsHud.statsTotal.leftSpriteWidgetId !== 20971545 ||
      statsHud.statsTotal.leftSpriteId !== 183 ||
      statsHud.statsTotal.rightSpriteChildId !== 26 ||
      statsHud.statsTotal.rightSpriteWidgetId !== 20971546 ||
      statsHud.statsTotal.rightSpriteId !== 184 ||
      statsHud.statsTotal.textChildId !== 27 ||
      statsHud.statsTotal.textWidgetId !== 20971547 ||
      statsHud.statsTotal.fontId !== 494 ||
      statsHud.statsTotal.sourceFontArchive !== "p11_full" ||
      statsHud.statsTotal.sourceGlyphAtlas !== "client_p11_font" ||
      statsHud.statsTotal.glyphCount <= 0 ||
      statsHud.statsTotal.glyphDomCount < statsHud.statsTotal.glyphCount * 2 ||
      !statsHud.statsTotal.firstGlyphMaskImage.includes("client_p11_font.png") ||
      statsHud.statsTotal.left !== 676 ||
      statsHud.statsTotal.top !== 433 ||
      statsHud.statsTotal.width !== 60 ||
      statsHud.statsTotal.height !== 29
    ) {
      throw new Error(`Fixed stats tab did not render source-backed skill slots and total level: ${JSON.stringify({
        compactStatsSkills,
        statsTotal: statsHud.statsTotal,
        mountedInterfaceGroups: statsHud.mountedInterfaceGroups,
        sideTabs: statsHud.sideTabs
      })}`);
    }
    const statsSkillDispatch = await clickStatsSkill(window, "farming");
    if (
      statsSkillDispatch.lastStatsSkillAction !== "*" ||
      statsSkillDispatch.lastStatsSkillChildId !== "23" ||
      statsSkillDispatch.lastStatsSkillClientId !== "21" ||
      statsSkillDispatch.lastStatsSkillGroupId !== "320" ||
      statsSkillDispatch.lastStatsSkillGuideCategory !== "0" ||
      statsSkillDispatch.lastStatsSkillGuideInterfaceId !== "214" ||
      statsSkillDispatch.lastStatsSkillGuideStat !== "21" ||
      statsSkillDispatch.lastStatsSkillId !== "farming" ||
      statsSkillDispatch.lastStatsSkillLabel !== "Farming" ||
      statsSkillDispatch.lastStatsSkillOpenGuideScriptArg0 !== "4600861" ||
      statsSkillDispatch.lastStatsSkillOpenGuideScriptArg1 !== "80" ||
      statsSkillDispatch.lastStatsSkillOpenGuideScriptId !== "917" ||
      statsSkillDispatch.lastStatsSkillSourceOrder !== "22" ||
      statsSkillDispatch.lastStatsSkillWidgetId !== "20971543"
    ) {
      throw new Error(`Fixed stats skill tile did not dispatch Nh skill-guide metadata: ${JSON.stringify(statsSkillDispatch)}`);
    }
    const prayerDispatch = await clickSideTab(window, "prayer");
    const prayerHud = await readRuntimeHud(window);
    if (
      prayerDispatch.activeSideTabId !== "prayer" ||
      prayerDispatch.lastSideTabId !== "prayer" ||
      prayerDispatch.lastSideTabAction !== "*" ||
      prayerDispatch.lastSideTabWidgetId !== "35913781" ||
      prayerDispatch.lastSideTabChildId !== "53" ||
      prayerDispatch.lastSideTabContainerChildId !== "71" ||
      prayerDispatch.lastSideTabContainerHidden !== "true" ||
      prayerDispatch.lastSideTabContainerWidgetId !== "35913799" ||
      prayerDispatch.lastSideTabIconChildId !== "60" ||
      prayerDispatch.lastSideTabIconSpriteId !== "902" ||
      prayerDispatch.lastSideTabRow !== "top" ||
      prayerDispatch.lastSideTabSlotIndex !== "5" ||
      JSON.stringify(prayerHud.sideTabs.activeButtonIds) !== JSON.stringify(["prayer"]) ||
      prayerHud.sideTabs.selectedSprites.length !== 1 ||
      prayerHud.sideTabs.selectedSprites[0].childId !== 53 ||
      prayerHud.sideTabs.inventoryVisible ||
      prayerHud.statsSkills.length !== 0 ||
      prayerHud.statsTotal !== null ||
      prayerHud.combatPanel !== null ||
      !mountedGroup(prayerHud, 541)
    ) {
      throw new Error(`Fixed side tab click did not dispatch or mount the source prayer tab state: ${JSON.stringify({ prayerDispatch, prayerHud })}`);
    }
    const compactPrayerIcons = prayerHud.prayerIcons.map((icon) => ({
      prayerId: icon.prayerId,
      prayerLabel: icon.prayerLabel,
      childId: icon.childId,
      widgetId: icon.widgetId,
      spriteId: icon.spriteId,
      sourceOrder: icon.sourceOrder,
      sourceGraphicWidth: icon.sourceGraphicWidth,
      sourceGraphicHeight: icon.sourceGraphicHeight,
      gridColumn: icon.gridColumn,
      gridRow: icon.gridRow,
      sourceActionCount: icon.sourceActionCount,
      left: icon.left,
      top: icon.top,
      width: icon.width,
      height: icon.height,
      usesPrayerAtlas: icon.backgroundImage.includes("prayer_icons.png")
    }));
    const keyPrayerIcons = compactPrayerIcons.filter((icon) =>
      [
        "thick-skin",
        "burst-of-strength",
        "clarity-of-thought",
        "sharp-eye",
        "mystic-will",
        "protect-from-magic",
        "protect-from-missiles",
        "protect-from-melee",
        "preserve",
        "chivalry",
        "piety",
        "rigour",
        "augury"
      ].includes(icon.prayerId)
    );
    const expectedKeyPrayerIcons = [
      { prayerId: "thick-skin", prayerLabel: "Thick Skin", childId: 5, widgetId: 35454981, spriteId: 115, sourceOrder: 0, sourceGraphicWidth: 30, sourceGraphicHeight: 30, gridColumn: 0, gridRow: 0, sourceActionCount: 1, left: 553, top: 216, width: 28, height: 30, usesPrayerAtlas: true },
      { prayerId: "burst-of-strength", prayerLabel: "Burst of Strength", childId: 6, widgetId: 35454982, spriteId: 116, sourceOrder: 1, sourceGraphicWidth: 30, sourceGraphicHeight: 30, gridColumn: 1, gridRow: 0, sourceActionCount: 1, left: 590, top: 216, width: 25, height: 27, usesPrayerAtlas: true },
      { prayerId: "clarity-of-thought", prayerLabel: "Clarity of Thought", childId: 7, widgetId: 35454983, spriteId: 117, sourceOrder: 2, sourceGraphicWidth: 30, sourceGraphicHeight: 30, gridColumn: 2, gridRow: 0, sourceActionCount: 1, left: 627, top: 216, width: 28, height: 22, usesPrayerAtlas: true },
      { prayerId: "sharp-eye", prayerLabel: "Sharp Eye", childId: 23, widgetId: 35454999, spriteId: 133, sourceOrder: 3, sourceGraphicWidth: 30, sourceGraphicHeight: 30, gridColumn: 3, gridRow: 0, sourceActionCount: 1, left: 664, top: 216, width: 28, height: 24, usesPrayerAtlas: true },
      { prayerId: "mystic-will", prayerLabel: "Mystic Will", childId: 24, widgetId: 35455000, spriteId: 134, sourceOrder: 4, sourceGraphicWidth: 30, sourceGraphicHeight: 30, gridColumn: 4, gridRow: 0, sourceActionCount: 1, left: 701, top: 216, width: 28, height: 26, usesPrayerAtlas: true },
      { prayerId: "protect-from-magic", prayerLabel: "Protect from Magic", childId: 17, widgetId: 35454993, spriteId: 127, sourceOrder: 16, sourceGraphicWidth: 30, sourceGraphicHeight: 30, gridColumn: 1, gridRow: 3, sourceActionCount: 1, left: 590, top: 327, width: 27, height: 27, usesPrayerAtlas: true },
      { prayerId: "protect-from-missiles", prayerLabel: "Protect from Missiles", childId: 18, widgetId: 35454994, spriteId: 128, sourceOrder: 17, sourceGraphicWidth: 30, sourceGraphicHeight: 30, gridColumn: 2, gridRow: 3, sourceActionCount: 1, left: 627, top: 327, width: 24, height: 24, usesPrayerAtlas: true },
      { prayerId: "protect-from-melee", prayerLabel: "Protect from Melee", childId: 19, widgetId: 35454995, spriteId: 129, sourceOrder: 18, sourceGraphicWidth: 30, sourceGraphicHeight: 30, gridColumn: 3, gridRow: 3, sourceActionCount: 1, left: 664, top: 327, width: 30, height: 30, usesPrayerAtlas: true },
      { prayerId: "preserve", prayerLabel: "Preserve", childId: 33, widgetId: 35455009, spriteId: 947, sourceOrder: 24, sourceGraphicWidth: 30, sourceGraphicHeight: 30, gridColumn: 4, gridRow: 4, sourceActionCount: 1, left: 701, top: 364, width: 30, height: 30, usesPrayerAtlas: true },
      { prayerId: "chivalry", prayerLabel: "Chivalry", childId: 29, widgetId: 35455005, spriteId: 945, sourceOrder: 25, sourceGraphicWidth: 30, sourceGraphicHeight: 30, gridColumn: 0, gridRow: 5, sourceActionCount: 1, left: 553, top: 401, width: 19, height: 30, usesPrayerAtlas: true },
      { prayerId: "piety", prayerLabel: "Piety", childId: 30, widgetId: 35455006, spriteId: 946, sourceOrder: 26, sourceGraphicWidth: 30, sourceGraphicHeight: 30, gridColumn: 1, gridRow: 5, sourceActionCount: 1, left: 590, top: 401, width: 30, height: 14, usesPrayerAtlas: true },
      { prayerId: "rigour", prayerLabel: "Rigour", childId: 31, widgetId: 35455007, spriteId: 1420, sourceOrder: 27, sourceGraphicWidth: 30, sourceGraphicHeight: 30, gridColumn: 2, gridRow: 5, sourceActionCount: 1, left: 627, top: 401, width: 28, height: 24, usesPrayerAtlas: true },
      { prayerId: "augury", prayerLabel: "Augury", childId: 32, widgetId: 35455008, spriteId: 1421, sourceOrder: 28, sourceGraphicWidth: 30, sourceGraphicHeight: 30, gridColumn: 3, gridRow: 5, sourceActionCount: 1, left: 664, top: 401, width: 28, height: 26, usesPrayerAtlas: true }
    ];
    if (
      prayerHud.prayerIcons.length !== 29 ||
      prayerHud.spellbookIcons.length !== 0 ||
      prayerHud.equipmentItems.length !== 0 ||
      prayerHud.equipmentItemButtons.length !== 0 ||
      prayerHud.equipmentUtilityButtons.length !== 0 ||
      JSON.stringify(keyPrayerIcons) !== JSON.stringify(expectedKeyPrayerIcons)
    ) {
      throw new Error(`Fixed prayer tab did not render source-backed prayer icons: ${JSON.stringify({
        compactPrayerIcons,
        mountedInterfaceGroups: prayerHud.mountedInterfaceGroups,
        sideTabs: prayerHud.sideTabs
      })}`);
    }
    const prayerIconState = (hud, prayerId) => hud.prayerIcons.find((icon) => icon.prayerId === prayerId);
    const overheadDisallowedIds = "protect-from-magic,protect-from-missiles,protect-from-melee,retribution,redemption,smite";
    const protectMagicDispatch = await clickPrayerIcon(window, "protect-from-magic");
    const protectMagicHud = await readRuntimeHud(window);
    const protectMagicIcon = prayerIconState(protectMagicHud, "protect-from-magic");
    const activeAfterProtectMagic = protectMagicHud.prayerIcons
      .filter((icon) => icon.active === "true")
      .map((icon) => icon.prayerId);
    assertSame("fixed prayer protect-magic active state", activeAfterProtectMagic, ["protect-from-magic"]);
    if (
      protectMagicIcon?.active !== "true" ||
      protectMagicIcon?.activeBackground !== true ||
      protectMagicIcon?.activeBackgroundSpriteId !== 155 ||
      protectMagicIcon?.sourceActionText !== "*" ||
      protectMagicIcon?.sourceEnumName !== "PROTECT_FROM_MAGIC" ||
      protectMagicIcon?.sourceOrdinal !== 12 ||
      protectMagicIcon?.varpbitId !== 4116 ||
      protectMagicIcon?.prayerLevel !== 37 ||
      protectMagicIcon?.prayerDrain !== 12 ||
      protectMagicIcon?.headIcon !== "2" ||
      protectMagicIcon?.soundId !== 2675 ||
      protectMagicIcon?.disallowedPrayerIds !== overheadDisallowedIds ||
      protectMagicDispatch.lastPrayerActionText !== "*" ||
      protectMagicDispatch.lastPrayerActive !== "true" ||
      protectMagicDispatch.lastPrayerActivePrayerIds !== "protect-from-magic" ||
      protectMagicDispatch.lastPrayerChildId !== "17" ||
      protectMagicDispatch.lastPrayerControlKind !== "prayer-toggle" ||
      protectMagicDispatch.lastPrayerDeactivatedIds !== "" ||
      protectMagicDispatch.lastPrayerDisallowedIds !== overheadDisallowedIds ||
      protectMagicDispatch.lastPrayerDrain !== "12" ||
      protectMagicDispatch.lastPrayerHeadIcon !== "2" ||
      protectMagicDispatch.lastPrayerId !== "protect-from-magic" ||
      protectMagicDispatch.lastPrayerLabel !== "Protect from Magic" ||
      protectMagicDispatch.lastPrayerLevel !== "37" ||
      protectMagicDispatch.lastPrayerMutation !== "activate" ||
      protectMagicDispatch.lastPrayerPreviousActive !== "false" ||
      protectMagicDispatch.lastPrayerPreviousActivePrayerIds !== "" ||
      protectMagicDispatch.lastPrayerSourceActionCount !== "1" ||
      protectMagicDispatch.lastPrayerSourceEnumName !== "PROTECT_FROM_MAGIC" ||
      protectMagicDispatch.lastPrayerSourceHandler !== "PlayerPrayer.toggle" ||
      protectMagicDispatch.lastPrayerSourceOrder !== "16" ||
      protectMagicDispatch.lastPrayerSourceOrdinal !== "12" ||
      protectMagicDispatch.lastPrayerSoundId !== "2675" ||
      protectMagicDispatch.lastPrayerTabHandler !== "TabPrayer.ordinalPlusFive" ||
      protectMagicDispatch.lastPrayerVarpbitId !== "4116" ||
      protectMagicDispatch.lastPrayerWidgetId !== "35454993"
    ) {
      throw new Error(`Protect-from-magic prayer click did not dispatch source PlayerPrayer.toggle metadata: ${JSON.stringify({ protectMagicDispatch, protectMagicIcon })}`);
    }
    const protectMissilesDispatch = await clickPrayerIcon(window, "protect-from-missiles");
    const protectMissilesHud = await readRuntimeHud(window);
    const protectMissilesIcon = prayerIconState(protectMissilesHud, "protect-from-missiles");
    const protectMagicAfterMissiles = prayerIconState(protectMissilesHud, "protect-from-magic");
    const activeAfterProtectMissiles = protectMissilesHud.prayerIcons
      .filter((icon) => icon.active === "true")
      .map((icon) => icon.prayerId);
    assertSame("fixed prayer overhead exclusivity", activeAfterProtectMissiles, ["protect-from-missiles"]);
    if (
      protectMagicAfterMissiles?.active !== "false" ||
      protectMagicAfterMissiles?.activeBackground !== false ||
      protectMissilesIcon?.active !== "true" ||
      protectMissilesIcon?.activeBackground !== true ||
      protectMissilesIcon?.activeBackgroundSpriteId !== 155 ||
      protectMissilesIcon?.sourceActionText !== "*" ||
      protectMissilesIcon?.sourceEnumName !== "PROTECT_FROM_MISSILES" ||
      protectMissilesIcon?.sourceOrdinal !== 13 ||
      protectMissilesIcon?.varpbitId !== 4117 ||
      protectMissilesIcon?.prayerLevel !== 40 ||
      protectMissilesIcon?.prayerDrain !== 12 ||
      protectMissilesIcon?.headIcon !== "1" ||
      protectMissilesIcon?.soundId !== 2677 ||
      protectMissilesDispatch.lastPrayerActive !== "true" ||
      protectMissilesDispatch.lastPrayerActivePrayerIds !== "protect-from-missiles" ||
      protectMissilesDispatch.lastPrayerChildId !== "18" ||
      protectMissilesDispatch.lastPrayerDeactivatedIds !== "protect-from-magic" ||
      protectMissilesDispatch.lastPrayerDisallowedIds !== overheadDisallowedIds ||
      protectMissilesDispatch.lastPrayerHeadIcon !== "1" ||
      protectMissilesDispatch.lastPrayerId !== "protect-from-missiles" ||
      protectMissilesDispatch.lastPrayerMutation !== "activate" ||
      protectMissilesDispatch.lastPrayerPreviousActive !== "false" ||
      protectMissilesDispatch.lastPrayerPreviousActivePrayerIds !== "protect-from-magic" ||
      protectMissilesDispatch.lastPrayerSourceEnumName !== "PROTECT_FROM_MISSILES" ||
      protectMissilesDispatch.lastPrayerSourceHandler !== "PlayerPrayer.toggle" ||
      protectMissilesDispatch.lastPrayerSourceOrder !== "17" ||
      protectMissilesDispatch.lastPrayerSourceOrdinal !== "13" ||
      protectMissilesDispatch.lastPrayerSoundId !== "2677" ||
      protectMissilesDispatch.lastPrayerTabHandler !== "TabPrayer.ordinalPlusFive" ||
      protectMissilesDispatch.lastPrayerVarpbitId !== "4117" ||
      protectMissilesDispatch.lastPrayerWidgetId !== "35454994"
    ) {
      throw new Error(`Protect-from-missiles prayer click did not deactivate the previous overhead prayer: ${JSON.stringify({ protectMissilesDispatch, protectMissilesIcon, protectMagicAfterMissiles })}`);
    }
    const protectMissilesOffDispatch = await clickPrayerIcon(window, "protect-from-missiles");
    const protectMissilesOffHud = await readRuntimeHud(window);
    const activeAfterProtectMissilesOff = protectMissilesOffHud.prayerIcons
      .filter((icon) => icon.active === "true")
      .map((icon) => icon.prayerId);
    assertSame("fixed prayer deactivate active state", activeAfterProtectMissilesOff, []);
    if (
      protectMissilesOffDispatch.lastPrayerActive !== "false" ||
      protectMissilesOffDispatch.lastPrayerActivePrayerIds !== "" ||
      protectMissilesOffDispatch.lastPrayerDeactivatedIds !== "protect-from-missiles" ||
      protectMissilesOffDispatch.lastPrayerId !== "protect-from-missiles" ||
      protectMissilesOffDispatch.lastPrayerMutation !== "deactivate" ||
      protectMissilesOffDispatch.lastPrayerPreviousActive !== "true" ||
      protectMissilesOffDispatch.lastPrayerPreviousActivePrayerIds !== "protect-from-missiles" ||
      protectMissilesOffDispatch.lastPrayerSourceHandler !== "PlayerPrayer.toggle" ||
      protectMissilesOffDispatch.lastPrayerTabHandler !== "TabPrayer.ordinalPlusFive" ||
      prayerIconState(protectMissilesOffHud, "protect-from-missiles")?.activeBackground !== false
    ) {
      throw new Error(`Protect-from-missiles prayer second click did not deactivate its active varpbit state: ${JSON.stringify({ protectMissilesOffDispatch, prayerIcon: prayerIconState(protectMissilesOffHud, "protect-from-missiles") })}`);
    }
    const magicDispatch = await clickSideTab(window, "magic");
    const magicHud = await readRuntimeHud(window);
    if (
      magicDispatch.activeSideTabId !== "magic" ||
      magicDispatch.lastSideTabId !== "magic" ||
      magicDispatch.lastSideTabAction !== "*" ||
      magicDispatch.lastSideTabWidgetId !== "35913782" ||
      magicDispatch.lastSideTabChildId !== "54" ||
      magicDispatch.lastSideTabContainerChildId !== "72" ||
      magicDispatch.lastSideTabContainerWidgetId !== "35913800" ||
      magicDispatch.lastSideTabIconChildId !== "61" ||
      magicDispatch.lastSideTabIconSpriteId !== "903" ||
      magicDispatch.lastSideTabRow !== "top" ||
      magicDispatch.lastSideTabSlotIndex !== "6" ||
      JSON.stringify(magicHud.sideTabs.activeButtonIds) !== JSON.stringify(["magic"]) ||
      magicHud.sideTabs.selectedSprites.length !== 1 ||
      magicHud.sideTabs.selectedSprites[0].childId !== 54 ||
      magicHud.sideTabs.inventoryVisible ||
      magicHud.prayerIcons.length !== 0 ||
      magicHud.equipmentItems.length !== 0 ||
      magicHud.equipmentItemButtons.length !== 0 ||
      magicHud.equipmentUtilityButtons.length !== 0 ||
      magicHud.statsSkills.length !== 0 ||
      magicHud.statsTotal !== null ||
      magicHud.combatPanel !== null ||
      !mountedGroup(magicHud, 218)
    ) {
      throw new Error(`Fixed magic tab click did not dispatch or mount the source spellbook tab state: ${JSON.stringify({ magicDispatch, magicHud })}`);
    }
    const compactSpellbookIcons = magicHud.spellbookIcons.map((icon) => ({
      spellId: icon.spellId,
      spellLabel: icon.spellLabel,
      itemId: icon.itemId,
      childId: icon.childId,
      widgetId: icon.widgetId,
      clickMask: icon.clickMask,
      selectable: icon.selectable,
      selected: icon.selected,
      selectedSpellName: icon.selectedSpellName,
      spellActionName: icon.spellActionName,
      targetFlags: icon.targetFlags,
      spriteId: icon.spriteId,
      enabledSpriteId: icon.enabledSpriteId,
      sourceOrder: icon.sourceOrder,
      gridColumn: icon.gridColumn,
      gridRow: icon.gridRow,
      sourceActionCount: icon.sourceActionCount,
      left: icon.left,
      top: icon.top,
      width: icon.width,
      height: icon.height,
      usesSpellAtlas: icon.backgroundImage.includes("spell_icons.png")
    }));
    const keySpellbookIcons = compactSpellbookIcons.filter((icon) =>
      [
        "edgeville-home-teleport",
        "smoke-rush",
        "shadow-rush",
        "paddewwa-teleport",
        "ice-rush",
        "teleport-to-bounty-target",
        "smoke-barrage",
        "shadow-barrage",
        "blood-barrage",
        "ice-barrage",
        "ghorrock-teleport"
      ].includes(icon.spellId)
    );
    const expectedKeySpellbookIcons = [
      { spellId: "edgeville-home-teleport", spellLabel: "Edgeville Home Teleport", itemId: 11142, childId: 98, widgetId: 14286946, clickMask: 1026, selectable: "false", selected: "false", selectedSpellName: "<col=00ff00>Edgeville Home Teleport<col=ffffff>", spellActionName: "", targetFlags: 0, spriteId: 356, enabledSpriteId: 356, sourceOrder: 0, gridColumn: 0, gridRow: 0, sourceActionCount: 10, left: 566, top: 213, width: 24, height: 24, usesSpellAtlas: true },
      { spellId: "smoke-rush", spellLabel: "Smoke Rush", itemId: 4629, childId: 82, widgetId: 14286930, clickMask: 20480, selectable: "true", selected: "false", selectedSpellName: "<col=00ff00>Smoke Rush<col=ffffff>", spellActionName: "Cast", targetFlags: 10, spriteId: 329, enabledSpriteId: 329, sourceOrder: 1, gridColumn: 1, gridRow: 0, sourceActionCount: 0, left: 610, top: 213, width: 24, height: 24, usesSpellAtlas: true },
      { spellId: "shadow-rush", spellLabel: "Shadow Rush", itemId: 4630, childId: 86, widgetId: 14286934, clickMask: 20480, selectable: "true", selected: "false", selectedSpellName: "<col=00ff00>Shadow Rush<col=ffffff>", spellActionName: "Cast", targetFlags: 10, spriteId: 337, enabledSpriteId: 337, sourceOrder: 2, gridColumn: 2, gridRow: 0, sourceActionCount: 0, left: 654, top: 213, width: 24, height: 24, usesSpellAtlas: true },
      { spellId: "paddewwa-teleport", spellLabel: "Paddewwa Teleport", itemId: 4631, childId: 90, widgetId: 14286938, clickMask: 2, selectable: "false", selected: "false", selectedSpellName: "<col=00ff00>Paddewwa Teleport<col=ffffff>", spellActionName: "", targetFlags: 0, spriteId: 341, enabledSpriteId: 341, sourceOrder: 3, gridColumn: 3, gridRow: 0, sourceActionCount: 1, left: 698, top: 213, width: 24, height: 24, usesSpellAtlas: true },
      { spellId: "ice-rush", spellLabel: "Ice Rush", itemId: 4633, childId: 74, widgetId: 14286922, clickMask: 20480, selectable: "true", selected: "false", selectedSpellName: "<col=00ff00>Ice Rush<col=ffffff>", spellActionName: "Cast", targetFlags: 10, spriteId: 325, enabledSpriteId: 325, sourceOrder: 5, gridColumn: 1, gridRow: 1, sourceActionCount: 0, left: 610, top: 241, width: 24, height: 24, usesSpellAtlas: true },
      { spellId: "teleport-to-bounty-target", spellLabel: "Teleport to Bounty Target", itemId: 17152, childId: 68, widgetId: 14286916, clickMask: 1026, selectable: "false", selected: "false", selectedSpellName: "<col=00ff00>Teleport to Bounty Target<col=ffffff>", spellActionName: "", targetFlags: 0, spriteId: 359, enabledSpriteId: 359, sourceOrder: 19, gridColumn: 3, gridRow: 4, sourceActionCount: 10, left: 698, top: 325, width: 24, height: 24, usesSpellAtlas: true },
      { spellId: "smoke-barrage", spellLabel: "Smoke Barrage", itemId: 4647, childId: 85, widgetId: 14286933, clickMask: 20480, selectable: "true", selected: "false", selectedSpellName: "<col=00ff00>Smoke Barrage<col=ffffff>", spellActionName: "Cast", targetFlags: 10, spriteId: 332, enabledSpriteId: 332, sourceOrder: 20, gridColumn: 0, gridRow: 5, sourceActionCount: 0, left: 566, top: 353, width: 24, height: 24, usesSpellAtlas: true },
      { spellId: "shadow-barrage", spellLabel: "Shadow Barrage", itemId: 4648, childId: 89, widgetId: 14286937, clickMask: 20480, selectable: "true", selected: "false", selectedSpellName: "<col=00ff00>Shadow Barrage<col=ffffff>", spellActionName: "Cast", targetFlags: 10, spriteId: 340, enabledSpriteId: 340, sourceOrder: 21, gridColumn: 1, gridRow: 5, sourceActionCount: 0, left: 610, top: 353, width: 24, height: 24, usesSpellAtlas: true },
      { spellId: "blood-barrage", spellLabel: "Blood Barrage", itemId: 4650, childId: 81, widgetId: 14286929, clickMask: 20480, selectable: "true", selected: "false", selectedSpellName: "<col=00ff00>Blood Barrage<col=ffffff>", spellActionName: "Cast", targetFlags: 10, spriteId: 336, enabledSpriteId: 336, sourceOrder: 23, gridColumn: 3, gridRow: 5, sourceActionCount: 0, left: 698, top: 353, width: 24, height: 24, usesSpellAtlas: true },
      { spellId: "ice-barrage", spellLabel: "Ice Barrage", itemId: 4651, childId: 77, widgetId: 14286925, clickMask: 20480, selectable: "true", selected: "false", selectedSpellName: "<col=00ff00>Ice Barrage<col=ffffff>", spellActionName: "Cast", targetFlags: 10, spriteId: 328, enabledSpriteId: 328, sourceOrder: 24, gridColumn: 0, gridRow: 6, sourceActionCount: 0, left: 566, top: 381, width: 24, height: 24, usesSpellAtlas: true },
      { spellId: "ghorrock-teleport", spellLabel: "Ghorrock Teleport", itemId: 4652, childId: 97, widgetId: 14286945, clickMask: 1026, selectable: "false", selected: "false", selectedSpellName: "<col=00ff00>Ghorrock Teleport<col=ffffff>", spellActionName: "", targetFlags: 0, spriteId: 348, enabledSpriteId: 348, sourceOrder: 25, gridColumn: 1, gridRow: 6, sourceActionCount: 10, left: 610, top: 381, width: 24, height: 24, usesSpellAtlas: true }
    ];
    if (
      magicHud.spellbookIcons.length !== 26 ||
      magicHud.prayerIcons.length !== 0 ||
      magicHud.equipmentItems.length !== 0 ||
      magicHud.equipmentItemButtons.length !== 0 ||
      magicHud.equipmentUtilityButtons.length !== 0 ||
      JSON.stringify(keySpellbookIcons) !== JSON.stringify(expectedKeySpellbookIcons)
    ) {
      throw new Error(`Fixed magic tab did not render source-backed ancient spellbook icons from the all-spellbook cache export: ${JSON.stringify({
        compactSpellbookIcons,
        mountedInterfaceGroups: magicHud.mountedInterfaceGroups,
        sideTabs: magicHud.sideTabs
      })}`);
    }
    const spellSelection = await clickSpellbookIcon(window, "smoke-rush");
    const spellSelectedHud = await readRuntimeHud(window);
    const selectedSmokeRush = spellSelectedHud.spellbookIcons.find((icon) => icon.spellId === "smoke-rush");
    if (
      spellSelection.selectedSpellActionName !== "Cast" ||
      spellSelection.selectedSpellFlags !== "10" ||
      spellSelection.selectedSpellId !== "smoke-rush" ||
      spellSelection.selectedSpellItemId !== "4629" ||
      spellSelection.selectedSpellLabel !== "Smoke Rush" ||
      spellSelection.selectedSpellName !== "<col=00ff00>Smoke Rush<col=ffffff>" ||
      spellSelection.selectedSpellWidgetId !== "14286930" ||
      spellSelection.selectedSpellChildId !== "82" ||
      spellSelection.lastSpellSelectionAction !== "Cast" ||
      (spellSelection.selectedInventoryItemId ?? "") !== "" ||
      selectedSmokeRush?.selected !== "true" ||
      !selectedSmokeRush?.selectedOutline.includes("drop-shadow") ||
      !selectedSmokeRush?.selectedOutline.includes("255") ||
      selectedSmokeRush?.selectedOutlineSource !== "Sprite.method6104(16777215) selected border-2 outline" ||
      !selectedSmokeRush?.selectedSpellStateSource.includes("class19.method340") ||
      selectedSmokeRush?.selectable !== "true" ||
      selectedSmokeRush?.spellActionName !== "Cast" ||
      selectedSmokeRush?.targetFlags !== 10 ||
      selectedSmokeRush?.clickMask !== 20480
    ) {
      throw new Error(`Fixed magic tab spell click did not enter source-backed selected-spell state: ${JSON.stringify({
        spellSelection,
        selectedSmokeRush
      })}`);
    }
    const equipmentDispatch = await clickSideTab(window, "equipment");
    const equipmentHud = await readRuntimeHud(window);
    const mountedEquipment = mountedGroup(equipmentHud, 387);
    if (
      equipmentDispatch.activeSideTabId !== "equipment" ||
      equipmentDispatch.lastSideTabWidgetId !== "35913780" ||
      equipmentDispatch.lastSideTabContainerChildId !== "70" ||
      equipmentDispatch.lastSideTabContainerWidgetId !== "35913798" ||
      JSON.stringify(equipmentHud.sideTabs.activeButtonIds) !== JSON.stringify(["equipment"]) ||
      equipmentHud.sideTabs.selectedSprites.length !== 1 ||
      equipmentHud.sideTabs.selectedSprites[0].childId !== 52 ||
      equipmentHud.sideTabs.inventoryVisible ||
      equipmentHud.prayerIcons.length !== 0 ||
      equipmentHud.spellbookIcons.length !== 0 ||
      equipmentHud.statsSkills.length !== 0 ||
      equipmentHud.statsTotal !== null ||
      equipmentHud.combatPanel !== null ||
      !mountedEquipment ||
      mountedEquipment.spriteCount !== 5
    ) {
      throw new Error(`Fixed equipment tab did not mount exported equipment widgets and sprites: ${JSON.stringify({ equipmentDispatch, equipmentHud })}`);
    }
    const compactEquipmentItems = equipmentHud.equipmentItems.map((item) => ({
      slotId: item.slotId,
      serverSlot: item.serverSlot,
      childId: item.childId,
      widgetId: item.widgetId,
      itemId: item.itemId,
      itemName: item.itemName,
      left: item.left,
      top: item.top,
      width: item.width,
      height: item.height,
      spriteVariant: item.spriteVariant,
      sourceBorder: item.sourceBorder,
      sourceShadowColor: item.sourceShadowColor,
      sourceActionCount: item.sourceActionCount,
      usesItemAtlas: item.backgroundImage.includes("item_sprites.png")
    }));
    const expectedEquipmentItems = [
      { slotId: "head", serverSlot: 0, childId: 6, widgetId: 25362438, itemId: 12929, itemName: "Serpentine helm (uncharged)", left: 624, top: 211, width: 36, height: 32, spriteVariant: "normal", sourceBorder: "1", sourceShadowColor: "3153952", sourceActionCount: 10, usesItemAtlas: true },
      { slotId: "cape", serverSlot: 1, childId: 7, widgetId: 25362439, itemId: 22109, itemName: "Ava's assembler", left: 583, top: 250, width: 36, height: 32, spriteVariant: "normal", sourceBorder: "1", sourceShadowColor: "3153952", sourceActionCount: 10, usesItemAtlas: true },
      { slotId: "amulet", serverSlot: 2, childId: 8, widgetId: 25362440, itemId: 19547, itemName: "Necklace of anguish", left: 624, top: 250, width: 36, height: 32, spriteVariant: "normal", sourceBorder: "1", sourceShadowColor: "3153952", sourceActionCount: 10, usesItemAtlas: true },
      { slotId: "weapon", serverSlot: 3, childId: 9, widgetId: 25362441, itemId: 11785, itemName: "Armadyl crossbow", left: 568, top: 289, width: 36, height: 32, spriteVariant: "normal", sourceBorder: "1", sourceShadowColor: "3153952", sourceActionCount: 10, usesItemAtlas: true },
      { slotId: "body", serverSlot: 4, childId: 10, widgetId: 25362442, itemId: 11828, itemName: "Armadyl chestplate", left: 624, top: 289, width: 36, height: 32, spriteVariant: "normal", sourceBorder: "1", sourceShadowColor: "3153952", sourceActionCount: 10, usesItemAtlas: true },
      { slotId: "shield", serverSlot: 5, childId: 11, widgetId: 25362443, itemId: 6889, itemName: "Mage's book", left: 680, top: 289, width: 36, height: 32, spriteVariant: "normal", sourceBorder: "1", sourceShadowColor: "3153952", sourceActionCount: 10, usesItemAtlas: true },
      { slotId: "legs", serverSlot: 7, childId: 12, widgetId: 25362444, itemId: 11830, itemName: "Armadyl chainskirt", left: 624, top: 329, width: 36, height: 32, spriteVariant: "normal", sourceBorder: "1", sourceShadowColor: "3153952", sourceActionCount: 10, usesItemAtlas: true },
      { slotId: "hands", serverSlot: 9, childId: 13, widgetId: 25362445, itemId: 7462, itemName: "Barrows gloves", left: 568, top: 369, width: 36, height: 32, spriteVariant: "normal", sourceBorder: "1", sourceShadowColor: "3153952", sourceActionCount: 10, usesItemAtlas: true },
      { slotId: "feet", serverSlot: 10, childId: 14, widgetId: 25362446, itemId: 11840, itemName: "Dragon boots", left: 624, top: 369, width: 36, height: 32, spriteVariant: "normal", sourceBorder: "1", sourceShadowColor: "3153952", sourceActionCount: 10, usesItemAtlas: true },
      { slotId: "ring", serverSlot: 12, childId: 15, widgetId: 25362447, itemId: 19710, itemName: "Ring of suffering (i)", left: 680, top: 369, width: 36, height: 32, spriteVariant: "normal", sourceBorder: "1", sourceShadowColor: "3153952", sourceActionCount: 10, usesItemAtlas: true },
      { slotId: "ammo", serverSlot: 13, childId: 16, widgetId: 25362448, itemId: 21948, itemName: "Dragonstone dragon bolts (e)", left: 665, top: 250, width: 36, height: 32, spriteVariant: "normal", sourceBorder: "1", sourceShadowColor: "3153952", sourceActionCount: 10, usesItemAtlas: true }
    ];
    if (JSON.stringify(compactEquipmentItems) !== JSON.stringify(expectedEquipmentItems)) {
      throw new Error(`Fixed equipment tab did not render source-backed local equipment items: ${JSON.stringify({
        compactEquipmentItems,
        mountedInterfaceGroups: equipmentHud.mountedInterfaceGroups,
        sideTabs: equipmentHud.sideTabs
      })}`);
    }
    const compactEquipmentItemButtons = equipmentHud.equipmentItemButtons.map((button) => ({
      slotId: button.slotId,
      serverSlot: button.serverSlot,
      groupId: button.groupId,
      childId: button.childId,
      widgetId: button.widgetId,
      itemId: button.itemId,
      itemName: button.itemName,
      defaultActionIndex: button.defaultActionIndex,
      defaultActionText: button.defaultActionText,
      defaultMenuOpcode: button.defaultMenuOpcode,
      sourceActionCount: button.sourceActionCount,
      sourceActions: button.sourceActions,
      sourceHandler: button.sourceHandler,
      sourceServerHandler: button.sourceServerHandler,
      left: button.left,
      top: button.top,
      width: button.width,
      height: button.height
    }));
    assertSame("fixed equipment item hitboxes and remove defaults", compactEquipmentItemButtons, [
      { slotId: "head", serverSlot: 0, groupId: 387, childId: 6, widgetId: 25362438, itemId: 12929, itemName: "Serpentine helm (uncharged)", defaultActionIndex: 1, defaultActionText: "Remove", defaultMenuOpcode: 57, sourceActionCount: 10, sourceActions: "*||*||*||*||*||*||*||*||*||*", sourceHandler: "MusicPatchNode.method3842", sourceServerHandler: "TabEquipment.itemAction", left: 624, top: 209, width: 36, height: 36 },
      { slotId: "cape", serverSlot: 1, groupId: 387, childId: 7, widgetId: 25362439, itemId: 22109, itemName: "Ava's assembler", defaultActionIndex: 1, defaultActionText: "Remove", defaultMenuOpcode: 57, sourceActionCount: 10, sourceActions: "*||*||*||*||*||*||*||*||*||*", sourceHandler: "MusicPatchNode.method3842", sourceServerHandler: "TabEquipment.itemAction", left: 583, top: 248, width: 36, height: 36 },
      { slotId: "amulet", serverSlot: 2, groupId: 387, childId: 8, widgetId: 25362440, itemId: 19547, itemName: "Necklace of anguish", defaultActionIndex: 1, defaultActionText: "Remove", defaultMenuOpcode: 57, sourceActionCount: 10, sourceActions: "*||*||*||*||*||*||*||*||*||*", sourceHandler: "MusicPatchNode.method3842", sourceServerHandler: "TabEquipment.itemAction", left: 624, top: 248, width: 36, height: 36 },
      { slotId: "weapon", serverSlot: 3, groupId: 387, childId: 9, widgetId: 25362441, itemId: 11785, itemName: "Armadyl crossbow", defaultActionIndex: 1, defaultActionText: "Remove", defaultMenuOpcode: 57, sourceActionCount: 10, sourceActions: "*||*||*||*||*||*||*||*||*||*", sourceHandler: "MusicPatchNode.method3842", sourceServerHandler: "TabEquipment.itemAction", left: 568, top: 287, width: 36, height: 36 },
      { slotId: "body", serverSlot: 4, groupId: 387, childId: 10, widgetId: 25362442, itemId: 11828, itemName: "Armadyl chestplate", defaultActionIndex: 1, defaultActionText: "Remove", defaultMenuOpcode: 57, sourceActionCount: 10, sourceActions: "*||*||*||*||*||*||*||*||*||*", sourceHandler: "MusicPatchNode.method3842", sourceServerHandler: "TabEquipment.itemAction", left: 624, top: 287, width: 36, height: 36 },
      { slotId: "shield", serverSlot: 5, groupId: 387, childId: 11, widgetId: 25362443, itemId: 6889, itemName: "Mage's book", defaultActionIndex: 1, defaultActionText: "Remove", defaultMenuOpcode: 57, sourceActionCount: 10, sourceActions: "*||*||*||*||*||*||*||*||*||*", sourceHandler: "MusicPatchNode.method3842", sourceServerHandler: "TabEquipment.itemAction", left: 680, top: 287, width: 36, height: 36 },
      { slotId: "legs", serverSlot: 7, groupId: 387, childId: 12, widgetId: 25362444, itemId: 11830, itemName: "Armadyl chainskirt", defaultActionIndex: 1, defaultActionText: "Remove", defaultMenuOpcode: 57, sourceActionCount: 10, sourceActions: "*||*||*||*||*||*||*||*||*||*", sourceHandler: "MusicPatchNode.method3842", sourceServerHandler: "TabEquipment.itemAction", left: 624, top: 327, width: 36, height: 36 },
      { slotId: "hands", serverSlot: 9, groupId: 387, childId: 13, widgetId: 25362445, itemId: 7462, itemName: "Barrows gloves", defaultActionIndex: 1, defaultActionText: "Remove", defaultMenuOpcode: 57, sourceActionCount: 10, sourceActions: "*||*||*||*||*||*||*||*||*||*", sourceHandler: "MusicPatchNode.method3842", sourceServerHandler: "TabEquipment.itemAction", left: 568, top: 367, width: 36, height: 36 },
      { slotId: "feet", serverSlot: 10, groupId: 387, childId: 14, widgetId: 25362446, itemId: 11840, itemName: "Dragon boots", defaultActionIndex: 1, defaultActionText: "Remove", defaultMenuOpcode: 57, sourceActionCount: 10, sourceActions: "*||*||*||*||*||*||*||*||*||*", sourceHandler: "MusicPatchNode.method3842", sourceServerHandler: "TabEquipment.itemAction", left: 624, top: 367, width: 36, height: 36 },
      { slotId: "ring", serverSlot: 12, groupId: 387, childId: 15, widgetId: 25362447, itemId: 19710, itemName: "Ring of suffering (i)", defaultActionIndex: 1, defaultActionText: "Remove", defaultMenuOpcode: 57, sourceActionCount: 10, sourceActions: "*||*||*||*||*||*||*||*||*||*", sourceHandler: "MusicPatchNode.method3842", sourceServerHandler: "TabEquipment.itemAction", left: 680, top: 367, width: 36, height: 36 },
      { slotId: "ammo", serverSlot: 13, groupId: 387, childId: 16, widgetId: 25362448, itemId: 21948, itemName: "Dragonstone dragon bolts (e)", defaultActionIndex: 1, defaultActionText: "Remove", defaultMenuOpcode: 57, sourceActionCount: 10, sourceActions: "*||*||*||*||*||*||*||*||*||*", sourceHandler: "MusicPatchNode.method3842", sourceServerHandler: "TabEquipment.itemAction", left: 665, top: 248, width: 36, height: 36 }
    ]);
    await setRuntimeInventory(window, fullInventoryItemIds.map((itemId) => ({ itemId, quantity: 1 })));
    const equipmentWeaponDispatch = await clickEquipmentItemButton(window, "weapon");
    if (
      equipmentWeaponDispatch.lastEquipmentItemActivation !== "default" ||
      equipmentWeaponDispatch.lastEquipmentItemAction !== "Remove" ||
      equipmentWeaponDispatch.lastEquipmentItemActionIndex !== "1" ||
      equipmentWeaponDispatch.lastEquipmentItemActionKind !== "equipment-remove" ||
      equipmentWeaponDispatch.lastEquipmentItemArgument1 !== "9" ||
      equipmentWeaponDispatch.lastEquipmentItemArgument2 !== "25362441" ||
      equipmentWeaponDispatch.lastEquipmentItemChildId !== "9" ||
      equipmentWeaponDispatch.lastEquipmentItemIdentifier !== "1" ||
      equipmentWeaponDispatch.lastEquipmentItemInventoryFreeSlot !== "" ||
      equipmentWeaponDispatch.lastEquipmentItemItemId !== "11785" ||
      equipmentWeaponDispatch.lastEquipmentItemItemName !== "Armadyl crossbow" ||
      equipmentWeaponDispatch.lastEquipmentItemMutation !== "blocked-inventory-full" ||
      equipmentWeaponDispatch.lastEquipmentItemOpcode !== "57" ||
      equipmentWeaponDispatch.lastEquipmentItemServerHandler !== "TabEquipment.itemAction" ||
      equipmentWeaponDispatch.lastEquipmentItemServerMutationHandler !== "Equipment.unequip" ||
      equipmentWeaponDispatch.lastEquipmentItemServerSlot !== "3" ||
      equipmentWeaponDispatch.lastEquipmentItemSlotId !== "weapon" ||
      equipmentWeaponDispatch.lastEquipmentItemSourceActionText !== "*" ||
      equipmentWeaponDispatch.lastEquipmentItemSourceWidgetHandler !== "MusicPatchNode.method3842" ||
      equipmentWeaponDispatch.lastEquipmentItemWidgetId !== "25362441"
    ) {
      throw new Error(`Equipment item default remove did not dispatch source server metadata: ${JSON.stringify(equipmentWeaponDispatch)}`);
    }
    const compactEquipmentUtilityButtons = equipmentHud.equipmentUtilityButtons.map((button) => ({
      id: button.id,
      label: button.label,
      groupId: button.groupId,
      widgetId: button.widgetId,
      childId: button.childId,
      clickMask: button.clickMask,
      defaultActionIndex: button.defaultActionIndex,
      defaultActionText: button.defaultActionText,
      defaultMenuOpcode: button.defaultMenuOpcode,
      sourceActionCount: button.sourceActionCount,
      sourceHandler: button.sourceHandler,
      sourceActionResolver: button.sourceActionResolver,
      sourceMenuInserter: button.sourceMenuInserter,
      spriteChildId: button.spriteChildId,
      spriteWidgetId: button.spriteWidgetId,
      spriteId: button.spriteId,
      left: button.left,
      top: button.top,
      width: button.width,
      height: button.height,
      sprite: button.sprite
    }));
    assertSame("fixed equipment utility button hitboxes and actions", compactEquipmentUtilityButtons, [
      { id: "stats", label: "View equipment stats", groupId: 387, widgetId: 25362449, childId: 17, clickMask: 2, defaultActionIndex: 1, defaultActionText: "View equipment stats", defaultMenuOpcode: 57, sourceActionCount: 1, sourceHandler: "MusicPatchNode.method3842", sourceActionResolver: "FaceNormal.method2908", sourceMenuInserter: "AttackOption.method2104", spriteChildId: 18, spriteWidgetId: 25362450, spriteId: 675, left: 554, top: 413, width: 40, height: 40, sprite: { childId: 18, widgetId: 25362450, spriteId: 675, left: 557, top: 415, width: 27, height: 28, usesClientAtlas: true } },
      { id: "prices", label: "View guide prices", groupId: 387, widgetId: 25362451, childId: 19, clickMask: 2, defaultActionIndex: 1, defaultActionText: "View guide prices", defaultMenuOpcode: 57, sourceActionCount: 1, sourceHandler: "MusicPatchNode.method3842", sourceActionResolver: "FaceNormal.method2908", sourceMenuInserter: "AttackOption.method2104", spriteChildId: 20, spriteWidgetId: 25362452, spriteId: 1090, left: 599, top: 413, width: 40, height: 40, sprite: { childId: 20, widgetId: 25362452, spriteId: 1090, left: 603, top: 417, width: 25, height: 31, usesClientAtlas: true } },
      { id: "items-kept-on-death", label: "View items kept on death", groupId: 387, widgetId: 25362453, childId: 21, clickMask: 2, defaultActionIndex: 1, defaultActionText: "View items kept on death", defaultMenuOpcode: 57, sourceActionCount: 1, sourceHandler: "MusicPatchNode.method3842", sourceActionResolver: "FaceNormal.method2908", sourceMenuInserter: "AttackOption.method2104", spriteChildId: 22, spriteWidgetId: 25362454, spriteId: 912, left: 644, top: 413, width: 40, height: 40, sprite: { childId: 22, widgetId: 25362454, spriteId: 912, left: 646, top: 416, width: 30, height: 29, usesClientAtlas: true } },
      { id: "call-follower", label: "Call follower", groupId: 387, widgetId: 25362455, childId: 23, clickMask: 2, defaultActionIndex: 1, defaultActionText: "Call follower", defaultMenuOpcode: 57, sourceActionCount: 1, sourceHandler: "MusicPatchNode.method3842", sourceActionResolver: "FaceNormal.method2908", sourceMenuInserter: "AttackOption.method2104", spriteChildId: 24, spriteWidgetId: 25362456, spriteId: 1343, left: 689, top: 413, width: 40, height: 40, sprite: { childId: 24, widgetId: 25362456, spriteId: 1343, left: 692, top: 416, width: 28, height: 22, usesClientAtlas: true } }
    ]);
    const equipmentStatsDispatch = await clickEquipmentUtilityButton(window, "stats");
    if (
      equipmentStatsDispatch.lastEquipmentUtilityAction !== "View equipment stats" ||
      equipmentStatsDispatch.lastEquipmentUtilityActionIndex !== "1" ||
      equipmentStatsDispatch.lastEquipmentUtilityButtonId !== "stats" ||
      equipmentStatsDispatch.lastEquipmentUtilityButtonLabel !== "View equipment stats" ||
      equipmentStatsDispatch.lastEquipmentUtilityChildId !== "17" ||
      equipmentStatsDispatch.lastEquipmentUtilityClickMask !== "2" ||
      equipmentStatsDispatch.lastEquipmentUtilityDefaultActionIndex !== "1" ||
      equipmentStatsDispatch.lastEquipmentUtilityDefaultActionText !== "View equipment stats" ||
      equipmentStatsDispatch.lastEquipmentUtilityGroupId !== "387" ||
      equipmentStatsDispatch.lastEquipmentUtilityMenuInserter !== "AttackOption.method2104" ||
      equipmentStatsDispatch.lastEquipmentUtilityMenuOpcode !== "57" ||
      equipmentStatsDispatch.lastEquipmentUtilitySourceActionCount !== "1" ||
      equipmentStatsDispatch.lastEquipmentUtilitySourceActions !== "View equipment stats" ||
      equipmentStatsDispatch.lastEquipmentUtilitySourceActionResolver !== "FaceNormal.method2908" ||
      equipmentStatsDispatch.lastEquipmentUtilitySourceHandler !== "MusicPatchNode.method3842" ||
      equipmentStatsDispatch.lastEquipmentUtilitySpriteChildId !== "18" ||
      equipmentStatsDispatch.lastEquipmentUtilitySpriteId !== "675" ||
      equipmentStatsDispatch.lastEquipmentUtilitySpriteWidgetId !== "25362450" ||
      equipmentStatsDispatch.lastEquipmentUtilityWidgetId !== "25362449"
    ) {
      throw new Error(`Equipment stats utility click did not dispatch source widget metadata: ${JSON.stringify(equipmentStatsDispatch)}`);
    }
    if (
      equipmentStatsDispatch.equipmentUtilityPanel?.mode !== "stats" ||
      equipmentStatsDispatch.equipmentUtilityPanel?.sourceMainInterface !== "Interface.EQUIPMENT_STATS = 84" ||
      equipmentStatsDispatch.equipmentUtilityPanel?.sourceInventoryInterface !== "Interface.EQUIPMENT_STATS_INVENTORY = 85" ||
      equipmentStatsDispatch.equipmentUtilityPanel?.sourceServerHandler !== "EquipmentStats.open" ||
      !equipmentStatsDispatch.equipmentUtilityPanel?.text.includes("Equipment Stats")
    ) {
      throw new Error(`Equipment stats utility did not open the source-backed equipment stats panel: ${JSON.stringify(equipmentStatsDispatch.equipmentUtilityPanel)}`);
    }
    const equipmentDeathDispatch = await clickEquipmentUtilityButton(window, "items-kept-on-death");
    if (
      equipmentDeathDispatch.lastEquipmentUtilityAction !== "View items kept on death" ||
      equipmentDeathDispatch.lastEquipmentUtilityButtonId !== "items-kept-on-death" ||
      equipmentDeathDispatch.lastEquipmentUtilityChildId !== "21" ||
      equipmentDeathDispatch.lastEquipmentUtilitySourceActions !== "View items kept on death" ||
      equipmentDeathDispatch.lastEquipmentUtilitySpriteId !== "912" ||
      equipmentDeathDispatch.lastEquipmentUtilityWidgetId !== "25362453"
    ) {
      throw new Error(`Items-kept equipment utility click did not dispatch source widget metadata: ${JSON.stringify(equipmentDeathDispatch)}`);
    }
    if (
      equipmentDeathDispatch.equipmentUtilityPanel?.mode !== "items-kept-on-death" ||
      equipmentDeathDispatch.equipmentUtilityPanel?.sourceServerHandler !== "IKOD.open" ||
      !equipmentDeathDispatch.equipmentUtilityPanel?.text.includes("Items Kept on Death")
    ) {
      throw new Error(`Items-kept utility did not open the source-backed items-kept panel: ${JSON.stringify(equipmentDeathDispatch.equipmentUtilityPanel)}`);
    }
    await setRuntimeInventory(window, inventoryWithFinalFreeSlot());
    const equipmentFreeSlotDispatch = await clickEquipmentItemButton(window, "weapon", 700);
    const equipmentAfterUnequipHud = await readRuntimeHud(window);
    const remainingEquipmentSlots = equipmentAfterUnequipHud.equipmentItemButtons.map((button) => button.slotId);
    if (
      equipmentFreeSlotDispatch.lastEquipmentItemActivation !== "default" ||
      equipmentFreeSlotDispatch.lastEquipmentItemAction !== "Remove" ||
      equipmentFreeSlotDispatch.lastEquipmentItemInventoryFreeSlot !== "27" ||
      equipmentFreeSlotDispatch.lastEquipmentItemInventoryNextItemId !== "11785" ||
      equipmentFreeSlotDispatch.lastEquipmentItemEquipmentSlotCleared !== "true" ||
      equipmentFreeSlotDispatch.lastEquipmentItemMutation !== "equipment-unequip" ||
      equipmentFreeSlotDispatch.lastEquipmentItemServerMutationHandler !== "Equipment.unequip" ||
      equipmentFreeSlotDispatch.lastEquipmentItemServerSlot !== "3" ||
      equipmentFreeSlotDispatch.lastEquipmentItemSlotId !== "weapon" ||
      remainingEquipmentSlots.includes("weapon")
    ) {
      throw new Error(`Equipment remove with a free inventory slot did not mutate source-backed equipment/inventory state: ${JSON.stringify({
        equipmentFreeSlotDispatch,
        remainingEquipmentSlots,
        equipmentItems: equipmentAfterUnequipHud.equipmentItems
      })}`);
    }
    const inventoryAfterUnequipDispatch = await clickSideTab(window, "inventory");
    const inventoryAfterUnequipHud = await readRuntimeHud(window);
    const unequippedInventorySlot = inventoryAfterUnequipHud.inventorySlots.find((slot) => slot.slotIndex === 27);
    if (
      inventoryAfterUnequipDispatch.activeSideTabId !== "inventory" ||
      unequippedInventorySlot?.itemId !== 11785 ||
      unequippedInventorySlot?.quantity !== 1 ||
      !unequippedInventorySlot?.usesItemAtlas
    ) {
      throw new Error(`Equipment remove did not place the worn item into the first free inventory slot: ${JSON.stringify({
        inventoryAfterUnequipDispatch,
        unequippedInventorySlot,
        inventorySlots: inventoryAfterUnequipHud.inventorySlots
      })}`);
    }
    if (process.env.NH_RUNTIME_HUD_SCOPE === "equipment") {
      process.stdout.write(
        `${JSON.stringify(
          {
            runtimeReadyMessage,
            equipmentDispatch,
            mountedEquipment,
            compactEquipmentItems,
            compactEquipmentItemButtons,
            compactEquipmentUtilityButtons,
            equipmentStatsDispatch,
            equipmentDeathDispatch,
            equipmentWeaponDispatch,
            equipmentFreeSlotDispatch,
            unequippedInventorySlot
          },
          null,
          2
        )}\n`,
        () => app.exit(0)
      );
      return;
    }
    const expectedAdditionalTabs = [
      {
        id: "quests",
        widgetId: "35913778",
        childId: "50",
        containerChildId: "68",
        containerWidgetId: "35913796",
        iconChildId: "57",
        iconSpriteId: "899",
        row: "top",
        slotIndex: "2",
        mountedGroupId: 720,
        spriteCount: 0,
        textCount: 1,
        noticeboardTextCount: 25
      },
      {
        id: "clan-chat",
        widgetId: "35913759",
        childId: "31",
        containerChildId: "73",
        containerWidgetId: "35913801",
        iconChildId: "38",
        iconSpriteId: "904",
        row: "bottom",
        slotIndex: "0",
        mountedGroupId: 7,
        spriteCount: 0,
        textCount: 3
      },
      {
        id: "ignores",
        widgetId: "35913760",
        childId: "32",
        containerChildId: "74",
        containerWidgetId: "35913802",
        iconChildId: "39",
        iconSpriteId: "1709",
        row: "bottom",
        slotIndex: "2",
        mountedGroupId: 432,
        spriteCount: 3,
        textCount: 3
      },
      {
        id: "friends",
        widgetId: "35913761",
        childId: "33",
        containerChildId: "75",
        containerWidgetId: "35913803",
        iconChildId: "40",
        iconSpriteId: "905",
        row: "bottom",
        slotIndex: "1",
        mountedGroupId: 429,
        spriteCount: 3,
        textCount: 3
      },
      {
        id: "logout",
        widgetId: "35913762",
        childId: "34",
        containerChildId: "76",
        containerWidgetId: "35913804",
        iconChildId: "41",
        iconSpriteId: "907",
        row: "bottom",
        slotIndex: "3",
        mountedGroupId: 182,
        spriteCount: 6,
        textCount: 2
      },
      {
        id: "options",
        widgetId: "35913763",
        childId: "35",
        containerChildId: "77",
        containerWidgetId: "35913805",
        iconChildId: "42",
        iconSpriteId: "908",
        row: "bottom",
        slotIndex: "4",
        mountedGroupId: 261,
        spriteCount: 20,
        textCount: 0
      },
      {
        id: "emotes",
        widgetId: "35913764",
        childId: "36",
        containerChildId: "78",
        containerWidgetId: "35913806",
        iconChildId: "43",
        iconSpriteId: "909",
        row: "bottom",
        slotIndex: "5",
        mountedGroupId: 216,
        spriteCount: 0,
        textCount: 0,
        emoteButtonCount: 48
      },
      {
        id: "music",
        widgetId: "35913765",
        childId: "37",
        containerChildId: "79",
        containerWidgetId: "35913807",
        iconChildId: "44",
        iconSpriteId: "910",
        row: "bottom",
        slotIndex: "6",
        mountedGroupId: 239,
        spriteCount: 3,
        textCount: 4
      }
    ];
    for (const expected of expectedAdditionalTabs) {
      const dispatch = await clickSideTab(window, expected.id);
      const hud = await readRuntimeHud(window);
      const mounted = mountedGroup(hud, expected.mountedGroupId);
      const noticeboardPanel = hud.noticeboardPanels.find((panel) => panel.groupId === 720) ?? null;
      const emotePanel = hud.emotePanels.find((panel) => panel.groupId === 216) ?? null;
      if (
        dispatch.activeSideTabId !== expected.id ||
        dispatch.lastSideTabId !== expected.id ||
        dispatch.lastSideTabAction !== "*" ||
        dispatch.lastSideTabWidgetId !== expected.widgetId ||
        dispatch.lastSideTabChildId !== expected.childId ||
        dispatch.lastSideTabContainerChildId !== expected.containerChildId ||
        dispatch.lastSideTabContainerWidgetId !== expected.containerWidgetId ||
        dispatch.lastSideTabIconChildId !== expected.iconChildId ||
        dispatch.lastSideTabIconSpriteId !== expected.iconSpriteId ||
        dispatch.lastSideTabRow !== expected.row ||
        dispatch.lastSideTabSlotIndex !== expected.slotIndex ||
        JSON.stringify(hud.sideTabs.activeButtonIds) !== JSON.stringify([expected.id]) ||
        hud.sideTabs.selectedSprites.length !== 1 ||
        hud.sideTabs.selectedSprites[0].childId !== Number(expected.childId) ||
        hud.sideTabs.inventoryVisible ||
        hud.equipmentItems.length !== 0 ||
        hud.equipmentItemButtons.length !== 0 ||
        hud.equipmentUtilityButtons.length !== 0 ||
        hud.prayerIcons.length !== 0 ||
        hud.spellbookIcons.length !== 0 ||
        hud.statsSkills.length !== 0 ||
        hud.statsTotal !== null ||
        hud.combatPanel !== null ||
        !mounted ||
        mounted.spriteCount !== expected.spriteCount ||
        mounted.textCount !== expected.textCount ||
        (expected.noticeboardTextCount !== undefined &&
          (!noticeboardPanel ||
            noticeboardPanel.textCount !== expected.noticeboardTextCount ||
            !noticeboardPanel.visibleTexts.some((text) => text.includes("Players Online")) ||
            noticeboardPanel.visibleTexts.some((text) => /Total Spent|Amount Donated|Store/i.test(text)))) ||
        (expected.emoteButtonCount !== undefined &&
          (!emotePanel ||
            emotePanel.buttonCount !== expected.emoteButtonCount ||
            emotePanel.sourceClientScript !== "emote_init"))
      ) {
        throw new Error(`Fixed ${expected.id} tab did not dispatch or mount its source widget group: ${JSON.stringify({
          expected,
          dispatch,
          mountedInterfaceGroups: hud.mountedInterfaceGroups,
          noticeboardPanels: hud.noticeboardPanels,
          emotePanels: hud.emotePanels,
          sideTabs: hud.sideTabs,
          equipmentItems: hud.equipmentItems,
          equipmentItemButtons: hud.equipmentItemButtons,
          equipmentUtilityButtons: hud.equipmentUtilityButtons,
          prayerIcons: hud.prayerIcons,
          spellbookIcons: hud.spellbookIcons,
          statsSkills: hud.statsSkills,
          statsTotal: hud.statsTotal
        })}`);
      }
    }
    const inventoryDispatch = await clickSideTab(window, "inventory");
    const inventoryHud = await readRuntimeHud(window);
    if (
      inventoryDispatch.activeSideTabId !== "inventory" ||
      inventoryDispatch.lastSideTabWidgetId !== "35913779" ||
      inventoryDispatch.lastSideTabContainerChildId !== "69" ||
      inventoryDispatch.lastSideTabContainerWidgetId !== "35913797" ||
      JSON.stringify(inventoryHud.sideTabs.activeButtonIds) !== JSON.stringify(["inventory"]) ||
      inventoryHud.sideTabs.selectedSprites.length !== 1 ||
      inventoryHud.sideTabs.selectedSprites[0].childId !== 51 ||
      !inventoryHud.sideTabs.inventoryVisible ||
      inventoryHud.equipmentItems.length !== 0 ||
      inventoryHud.equipmentItemButtons.length !== 0 ||
      inventoryHud.equipmentUtilityButtons.length !== 0 ||
      inventoryHud.prayerIcons.length !== 0 ||
      inventoryHud.spellbookIcons.length !== 0 ||
      inventoryHud.combatPanel !== null
    ) {
      throw new Error(`Fixed side tab click did not restore the source inventory tab state: ${JSON.stringify({ inventoryDispatch, inventoryHud: inventoryHud.sideTabs })}`);
    }

    const snapshots = [];
    for (let cycle = 0; cycle <= maxCycle; cycle += 1) {
      await setRuntimeCycle(window, cycle);
      snapshots.push(await readRuntimeHud(window));
    }

    const hpValues = new Set(snapshots.map((snapshot) => snapshot.values.hp?.dataValue));
    const specValues = new Set(snapshots.map((snapshot) => snapshot.values.spec?.dataValue));
    const hpFillPixels = new Set(snapshots.map((snapshot) => snapshot.values.hp?.fillPixels));
    if (hpValues.size <= 1 && specValues.size <= 1) {
      throw new Error(`HUD values did not vary across generated replay: ${JSON.stringify(snapshots)}`);
    }
    if (hpFillPixels.size <= 1) {
      throw new Error(`HUD HP orb fill did not vary across generated replay: ${JSON.stringify(snapshots)}`);
    }
    for (const snapshot of snapshots) {
      for (const orb of requiredOrbs) {
        const value = snapshot.values[orb];
        if (!value || value.text !== String(value.dataValue)) {
          throw new Error(`HUD orb text/data mismatch for ${orb}: ${JSON.stringify(snapshot)}`);
        }
        const sourceHeight = Number.isInteger(value.fillSourceHeight) && value.fillSourceHeight > 0 ? value.fillSourceHeight : 26;
        const expectedFillPixels = Math.trunc((Math.max(0, Math.min(value.dataValue, value.dataMaxValue)) * sourceHeight) / value.dataMaxValue);
        if (value.fillPixels !== expectedFillPixels) {
          throw new Error(`HUD orb fill mismatch for ${orb}: ${JSON.stringify({ snapshot, expectedFillPixels })}`);
        }
        if (!value.fillBackgroundImage.includes("client_ui.png")) {
          throw new Error(`HUD orb fill does not use client_ui atlas for ${orb}: ${JSON.stringify(snapshot)}`);
        }
        const expectedDisplayedFillerSpriteId =
          value.active === "true" && Number.isInteger(value.activeFillerSpriteId) && value.activeFillerSpriteId > 0
            ? value.activeFillerSpriteId
            : value.fillerSpriteId;
        if (value.displayedFillerSpriteId !== expectedDisplayedFillerSpriteId) {
          throw new Error(`HUD orb active fill did not select the source filler sprite for ${orb}: ${JSON.stringify({ snapshot, expectedDisplayedFillerSpriteId })}`);
        }
      }
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          runtimeReadyMessage,
          maxCycle,
          initialHud,
          finalHud: snapshots[snapshots.length - 1],
          hpValues: [...hpValues],
          hpFillPixels: [...hpFillPixels],
          specValues: [...specValues]
        },
        null,
        2
      )}\n`,
      () => app.exit(0)
    );
  } catch (error) {
    console.error(error);
    app.exit(1);
  }
});
