import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function readNhClient(relativePath) {
  return fs.readFileSync(path.resolve(projectRoot, "..", "Nh184-Client", relativePath), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const pluginSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/opponentinfo/OpponentInfoPlugin.java");
const configSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/opponentinfo/OpponentInfoConfig.java");
const overlaySource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/opponentinfo/OpponentInfoOverlay.java");
const comparisonOverlaySource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/opponentinfo/PlayerComparisonOverlay.java");
const styleSource = readNhClient("runelite-client/src/main/java/net/runelite/client/plugins/opponentinfo/HitpointsDisplayStyle.java");
const progressSource = readNhClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/components/ProgressBarComponent.java");
const panelSource = readNhClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/components/PanelComponent.java");
const constantsSource = readNhClient("runelite-client/src/main/java/net/runelite/client/ui/overlay/components/ComponentConstants.java");
const shellSource = read("src/ui/RuneliteClientShell.tsx");
const runtimeSource = read("src/ui/RuntimeSceneViewer.tsx");
const opponentInfoSource = read("src/ui/runeliteOpponentInfo.ts");
const cssSource = read("src/ui/styles.css");

for (const sourceAnchor of [
  'name = "Opponent Information"',
  'description = "Show name and hitpoints information about the NPC you are fighting"',
  'private static final Duration WAIT = Duration.ofSeconds(5)',
  'overlayManager.add(opponentInfoOverlay)',
  'overlayManager.add(playerComparisonOverlay)',
  'private Actor lastOpponent',
  'event.getSource() != client.getLocalPlayer()',
  'lastOpponent = opponent'
]) {
  assert(pluginSource.includes(sourceAnchor), `RuneLite OpponentInfoPlugin source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'eventBus.subscribe(BeforeRender.class, MENU, this::onBeforeRender)',
  'eventBus.subscribe(MenuOpened.class, MENU, this::onMenuOpened)',
  'changed |= modify(entry)',
  'showAttackers &&',
  'showAttacking &&',
  'showHitpoints &&',
  'entry.setTarget(target)'
]) {
  assert(pluginSource.includes(sourceAnchor), `RuneLite OpponentInfoPlugin menu source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  '@ConfigGroup("opponentinfo")',
  'default boolean lookupOnInteraction()',
  'return false;',
  'default HitpointsDisplayStyle hitpointsDisplayStyle()',
  'return HitpointsDisplayStyle.HITPOINTS;',
  'default boolean showOpponentsOpponent()',
  'return true;',
  'default Color attackingColor()',
  'return Color.GREEN;'
]) {
  assert(configSource.includes(sourceAnchor), `RuneLite OpponentInfoConfig source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'setPosition(OverlayPosition.TOP_LEFT)',
  'setPriority(OverlayPriority.HIGH)',
  'panelComponent.setBorder(new Rectangle(2, 2, 2, 2))',
  'panelComponent.setGap(new Point(0, 2))',
  'private static final Color HP_GREEN = new Color(0, 146, 54, 230)',
  'private static final Color HP_RED = new Color(102, 15, 16, 230)',
  'new ProgressBarComponent()',
  'ProgressBarComponent.LabelDisplayMode.BOTH',
  'static int getExactHp'
]) {
  assert(overlaySource.includes(sourceAnchor), `RuneLite OpponentInfoOverlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'class PlayerComparisonOverlay extends Overlay',
  'setPosition(OverlayPosition.BOTTOM_LEFT)',
  'setLayer(OverlayLayer.ABOVE_WIDGETS)',
  'if (!opponentInfoPlugin.isLookupOnInteraction())',
  'generateComparisonTable(panelComponent, hiscoreResult)',
  'private static final Skill[] COMBAT_SKILLS',
  'SKILL_COLUMN_HEADER = "Skill"',
  'PLAYER_COLUMN_HEADER = "You"',
  'OPPONENT_COLUMN_HEADER = "Them"',
  'comparisonStatColor'
]) {
  assert(comparisonOverlaySource.includes(sourceAnchor), `RuneLite PlayerComparisonOverlay source missing ${sourceAnchor}`);
}

for (const sourceAnchor of ['HITPOINTS("Hitpoints")', 'PERCENTAGE("Percentage")', 'BOTH("Both")']) {
  assert(styleSource.includes(sourceAnchor), `RuneLite HitpointsDisplayStyle source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'private Dimension preferredSize = new Dimension(ComponentConstants.STANDARD_WIDTH, 16)',
  'private Color foregroundColor = new Color(82, 161, 82)',
  'private Color backgroundColor = new Color(255, 255, 255, 127)',
  'fillRect(barX, barY, progressFill, height)'
]) {
  assert(progressSource.includes(sourceAnchor), `RuneLite ProgressBarComponent source missing ${sourceAnchor}`);
}

for (const sourceAnchor of [
  'private Rectangle border = new Rectangle(',
  'private Point gap = new Point(0, 0)',
  'public static final int STANDARD_WIDTH = 129',
  'public static final Color STANDARD_BACKGROUND_COLOR = new Color(70, 61, 50, 156)'
]) {
  assert(
    panelSource.includes(sourceAnchor) || constantsSource.includes(sourceAnchor),
    `RuneLite panel source missing ${sourceAnchor}`
  );
}

for (const trainerAnchor of [
  'id: "opponent-info"',
  'name: "Opponent Information"',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/opponentinfo/OpponentInfoPlugin.java"',
  'sourcePath: "Nh184-Client/runelite-client/src/main/java/net/runelite/client/plugins/opponentinfo/OpponentInfoConfig.java"',
  'group: "opponentinfo"',
  'hitpointsDisplayStyle: "Hitpoints"',
  'showOpponentsOpponent: true',
  'attackingColor: "#00ff00"'
]) {
  assert(shellSource.includes(trainerAnchor), `RuneliteClientShell missing Opponent Information anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'RUNELITE_OPPONENT_INFO_WAIT_MS = 5000',
  'RUNELITE_OPPONENT_INFO_STANDARD_WIDTH = 129',
  'RUNELITE_OPPONENT_INFO_PANEL_BORDER = { top: 2, right: 2, bottom: 2, left: 2 }',
  'RUNELITE_OPPONENT_INFO_HP_GREEN_RGBA = "rgba(0, 146, 54, 0.902)"',
  'RUNELITE_OPPONENT_INFO_HP_RED_RGBA = "rgba(102, 15, 16, 0.902)"',
  'RUNELITE_OPPONENT_COMPARISON_HIGHLIGHT_COLOR = "#ffc800"',
  'runeliteOpponentComparisonSnapshot',
  'applyRuneliteOpponentInfoMenuEntries',
  'OpponentInfoPlugin.onBeforeRender/onMenuOpened -> modify(MenuEntry) only rewrites Attack rows',
  'runeliteOpponentInfoSnapshot',
  'runeliteOpponentInfoExactHp'
]) {
  assert(opponentInfoSource.includes(trainerAnchor), `runeliteOpponentInfo module missing source-backed anchor ${trainerAnchor}`);
}

for (const trainerAnchor of [
  'applyRuneliteOpponentInfoConfig',
  'OpponentInfoPlugin InteractingChanged lastOpponent WAIT=5s overlayManager.add',
  'OpponentInfoOverlay setPosition(TOP_LEFT) setPriority(HIGH)',
  'PanelComponent border=(2,2,2,2) gap=(0,2)',
  'ProgressBarComponent HP_GREEN HP_RED LabelDisplayMode',
  'applyRuneliteOpponentInfoMenuEntries',
  'runeliteOpponentComparisonSnapshot',
  'className="runeliteOpponentComparisonOverlay"',
  'data-source-overlay="PlayerComparisonOverlay"',
  'runeliteOpponentInfoSnapshot',
  'className="runeliteOpponentInfoOverlay"'
]) {
  assert(runtimeSource.includes(trainerAnchor), `RuntimeSceneViewer missing Opponent Information runtime anchor ${trainerAnchor}`);
}

for (const cssAnchor of [
  '.runeliteOpponentComparisonOverlay',
  '.runeliteOpponentComparisonTable',
  '.runeliteOpponentInfoOverlay',
  'width: 129px',
  'background: rgba(70, 61, 50, 0.612)',
  'background: rgba(102, 15, 16, 0.902)',
  'background: rgba(0, 146, 54, 0.902)'
]) {
  assert(cssSource.includes(cssAnchor), `CSS missing Opponent Information anchor ${cssAnchor}`);
}

console.log("RuneLite Opponent Information verifier passed: plugin config, TOP_LEFT panel, HP progress bar, and source anchors are present.");
