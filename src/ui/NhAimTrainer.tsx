import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from "react";

type AimButton = "left" | "right";
type AimShape = "rect";
type AimFlowPhase = "ui" | "world";

interface AimRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface AimTarget {
  readonly id: string;
  readonly label: string;
  readonly rect: AimRect;
  readonly shape: AimShape;
  readonly button: AimButton;
}

interface QueuedAimTarget extends AimTarget {
  readonly queueKey: string;
}

interface AimTargetCursor {
  readonly phase: AimFlowPhase;
  readonly uiGroup: readonly TargetId[];
  readonly uiIndex: number;
  readonly forceUiAfterWorld: boolean;
  readonly rightClickCooldown: number;
  readonly serial: number;
}

interface AimClientBounds {
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
}

interface AimResizeDrag {
  readonly side: "left" | "right";
  readonly pointerId: number;
  readonly startClientX: number;
  readonly startClientY: number;
  readonly startBounds: AimClientBounds;
}

interface AimStats {
  readonly hits: number;
  readonly misses: number;
  readonly streak: number;
}

type AimLeaderboardScope = "recent" | "week" | "all";

interface AimCompletedRun {
  readonly score: number;
  readonly misses: number;
  readonly streak: number;
  readonly completedAtMs: number;
}

interface AimLeaderboardEntry extends AimCompletedRun {
  readonly id: string;
  readonly name: string;
  readonly savedAtMs: number;
}

const aimClientWidth = 765;
const aimClientHeight = 503;
const aimClientMinWidth = 420;
const aimClientMinHeight = 276;
const aimClientMaxWidth = 1000;
const aimClientMaxHeight = 760;
const aimRoundDurationMs = 30_000;
const aimHighScoreStorageKey = "kronos-nh-aim-trainer-high-score";
const aimLeaderboardStorageKey = "kronos-nh-aim-trainer-leaderboard";
const aimPlayerNameStorageKey = "kronos-nh-aim-trainer-player-name";
const aimLeaderboardMaxEntries = 80;
const aimLeaderboardVisibleEntries = 8;
const aimPlayerNameMaxLength = 18;
const aimWeekMs = 7 * 24 * 60 * 60 * 1000;
const visibleTargetCount = 2;
const walkHereRow = { width: 92, height: 15, menuHeight: 37 } as const;

const inventoryGrid = {
  x: 563,
  y: 213,
  slot: { width: 36, height: 32 },
  step: { width: 42, height: 36 }
} as const;

const baseTargets = {
  "tab-combat": squareTarget("tab-combat", "Combat tab", { x: 522, y: 168, width: 38, height: 36 }),
  "tab-inventory": squareTarget("tab-inventory", "Inventory tab", { x: 626, y: 168, width: 33, height: 36 }),
  "tab-equipment": squareTarget("tab-equipment", "Equipment tab", { x: 659, y: 168, width: 33, height: 36 }),
  "tab-magic": squareTarget("tab-magic", "Magic tab", { x: 725, y: 168, width: 38, height: 36 }),
  "equip-helmet": squareTarget("equip-helmet", "Helmet slot", { x: 624, y: 209, width: 36, height: 36 }),
  "equip-shield": squareTarget("equip-shield", "Shield slot", { x: 680, y: 287, width: 36, height: 36 }),
  "equip-boots": squareTarget("equip-boots", "Boots slot", { x: 624, y: 367, width: 36, height: 36 }),
  "spec-bar": squareTarget("spec-bar", "Special attack bar", { x: 567, y: 405, width: 150, height: 26 }),
  "spell-blood-blitz": squareTarget("spell-blood-blitz", "Blood Blitz", { x: 566, y: 325, width: 24, height: 24 }),
  "spell-ice-blitz": squareTarget("spell-ice-blitz", "Ice Blitz", { x: 610, y: 325, width: 24, height: 24 }),
  "spell-blood-barrage": squareTarget("spell-blood-barrage", "Blood Barrage", { x: 698, y: 353, width: 24, height: 24 }),
  "spell-ice-barrage": squareTarget("spell-ice-barrage", "Ice Barrage", { x: 566, y: 381, width: 24, height: 24 }),
  "inv-mage-body": inventoryTarget("inv-mage-body", "Mage body", 4),
  "inv-mage-legs": inventoryTarget("inv-mage-legs", "Mage legs", 6),
  "inv-range-body": inventoryTarget("inv-range-body", "Range body", 12),
  "inv-range-weapon": inventoryTarget("inv-range-weapon", "Range weapon", 13),
  "inv-melee-body": inventoryTarget("inv-melee-body", "Melee body", 16),
  "inv-shield": inventoryTarget("inv-shield", "Shield switch", 17),
  "inv-ags": inventoryTarget("inv-ags", "AGS switch", 20),
  "inv-gmaul": inventoryTarget("inv-gmaul", "Gmaul switch", 21),
  "inv-rune-pouch": inventoryTarget("inv-rune-pouch", "Rune pouch", 27),
  "player-center": squareTarget("player-center", "Opponent center", { x: 263, y: 126, width: 24, height: 58 }),
  "player-north": squareTarget("player-north", "Opponent north", { x: 266, y: 82, width: 18, height: 42 }),
  "player-south": squareTarget("player-south", "Opponent south", { x: 260, y: 190, width: 30, height: 70 }),
  "player-west": squareTarget("player-west", "Opponent west", { x: 211, y: 145, width: 22, height: 52 }),
  "player-east": squareTarget("player-east", "Opponent east", { x: 318, y: 145, width: 26, height: 60 }),
  "player-diagonal": squareTarget("player-diagonal", "Opponent diagonal", { x: 350, y: 204, width: 18, height: 46 }),
  "scene-top-left": squareTarget("scene-top-left", "Scene tile top left", { x: 118, y: 92, width: 30, height: 30 }),
  "scene-top-right": squareTarget("scene-top-right", "Scene tile top right", { x: 416, y: 92, width: 30, height: 30 }),
  "scene-west": squareTarget("scene-west", "Scene tile west", { x: 145, y: 252, width: 30, height: 30 }),
  "scene-east": squareTarget("scene-east", "Scene tile east", { x: 390, y: 255, width: 30, height: 30 }),
  "scene-south": squareTarget("scene-south", "Scene tile south", { x: 270, y: 297, width: 30, height: 30 })
} as const satisfies Record<string, AimTarget>;

type TargetId = keyof typeof baseTargets;

const rawUiClickGroups = [
  ["tab-inventory", "inv-range-body", "inv-range-weapon", "tab-magic", "spell-ice-barrage", "player-center"],
  ["tab-inventory", "inv-mage-body", "inv-mage-legs", "tab-magic", "spell-blood-blitz", "player-west"],
  ["tab-inventory", "inv-ags", "tab-combat", "spec-bar", "player-east"],
  ["tab-inventory", "inv-gmaul", "tab-combat", "spec-bar", "player-center"],
  ["tab-equipment", "equip-helmet", "equip-shield", "equip-boots", "tab-inventory", "inv-rune-pouch"],
  ["scene-top-left", "tab-magic", "spell-ice-blitz", "player-north"],
  ["scene-east", "tab-magic", "spell-blood-barrage", "player-south"]
] as const satisfies readonly (readonly TargetId[])[];

const uiClickGroups: readonly (readonly TargetId[])[] = rawUiClickGroups.map(
  (group) => group.filter((id) => !isWorldTargetId(id)) as readonly TargetId[]
);

const worldLeftTargetIds: readonly TargetId[] = [
  "player-center",
  "player-north",
  "player-south",
  "player-west",
  "player-east",
  "player-diagonal",
  "scene-top-left",
  "scene-top-right",
  "scene-west",
  "scene-east",
  "scene-south"
];

const rightClickTemplates: readonly TargetId[] = ["player-north", "player-diagonal", "scene-west", "scene-south"];

export function NhAimTrainer(): JSX.Element {
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<AimStats>({ hits: 0, misses: 0, streak: 0 });
  const [targetQueue, setTargetQueue] = useState<readonly QueuedAimTarget[]>([]);
  const [targetCursor, setTargetCursor] = useState<AimTargetCursor>(() => randomAimCursor());
  const [enteredTargetKeys, setEnteredTargetKeys] = useState<readonly string[]>([]);
  const [timeRemainingMs, setTimeRemainingMs] = useState(aimRoundDurationMs);
  const [highScore, setHighScore] = useState(readAimHighScore);
  const [playerName, setPlayerName] = useState(readAimPlayerName);
  const [leaderboardScope, setLeaderboardScope] = useState<AimLeaderboardScope>("recent");
  const [leaderboardEntries, setLeaderboardEntries] = useState<readonly AimLeaderboardEntry[]>(
    readAimLeaderboardEntries
  );
  const [lastCompletedRun, setLastCompletedRun] = useState<AimCompletedRun | null>(null);
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [clientBounds, setClientBounds] = useState<AimClientBounds>({
    width: aimClientWidth,
    height: aimClientHeight,
    offsetX: 0
  });
  const hitsRef = useRef(0);
  const statsRef = useRef<AimStats>({ hits: 0, misses: 0, streak: 0 });
  const roundDeadlineRef = useRef<number | null>(null);
  const resizeDragRef = useRef<AimResizeDrag | null>(null);
  const leaderboardRows = aimLeaderboardRows(leaderboardEntries, leaderboardScope, Date.now());

  const start = (): void => {
    const initialCursor = randomAimCursor();
    const initialTargets = fillVisibleTargets([], initialCursor);
    const cleanStats = { hits: 0, misses: 0, streak: 0 };
    hitsRef.current = 0;
    statsRef.current = cleanStats;
    roundDeadlineRef.current = performance.now() + aimRoundDurationMs;
    setRunning(true);
    setTargetQueue(initialTargets.targets);
    setEnteredTargetKeys([]);
    setTargetCursor(initialTargets.cursor);
    setStats(cleanStats);
    setTimeRemainingMs(aimRoundDurationMs);
    setLastCompletedRun(null);
    setSavedRunId(null);
  };

  const reset = (): void => {
    const cleanStats = { hits: 0, misses: 0, streak: 0 };
    hitsRef.current = 0;
    statsRef.current = cleanStats;
    roundDeadlineRef.current = null;
    setRunning(false);
    setTargetQueue([]);
    setEnteredTargetKeys([]);
    setStats(cleanStats);
    setTimeRemainingMs(aimRoundDurationMs);
    setLastCompletedRun(null);
    setSavedRunId(null);
  };

  useEffect(() => {
    if (!running) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      const deadline = roundDeadlineRef.current;
      if (deadline === null) {
        return;
      }
      const nextRemaining = Math.max(0, deadline - performance.now());
      setTimeRemainingMs(nextRemaining);
      if (nextRemaining > 0) {
        return;
      }
      roundDeadlineRef.current = null;
      setRunning(false);
      setTargetQueue([]);
      setEnteredTargetKeys([]);
      setLastCompletedRun({
        score: statsRef.current.hits,
        misses: statsRef.current.misses,
        streak: statsRef.current.streak,
        completedAtMs: Date.now()
      });
      setSavedRunId(null);
      setHighScore((current) => saveAimHighScore(Math.max(current, hitsRef.current)));
    }, 100);

    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!running || targetQueue.length === 0) {
      setEnteredTargetKeys([]);
      return undefined;
    }

    const currentKeys = targetQueue.map((target) => target.queueKey);
    const currentKeySet = new Set(currentKeys);
    setEnteredTargetKeys((keys) => keys.filter((key) => currentKeySet.has(key)));
    const timer = window.setTimeout(() => {
      setEnteredTargetKeys((keys) => {
        const retainedKeys = keys.filter((key) => currentKeySet.has(key));
        const nextKeys = currentKeys.filter((key) => !retainedKeys.includes(key));
        return [...retainedKeys, ...nextKeys];
      });
    }, 20);

    return () => window.clearTimeout(timer);
  }, [running, targetQueue]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (!running || targetQueue.length === 0 || (event.button !== 0 && event.button !== 2)) {
      return;
    }
    event.preventDefault();
    const sourcePoint = pointerToSourcePoint(event);
    const button: AimButton = event.button === 2 ? "right" : "left";
    const hitIndex = targetQueue.findIndex(
      (target) => target.button === button && pointInTarget(sourcePoint.x, sourcePoint.y, target)
    );
    if (hitIndex < 0) {
      setStats((current) => {
        const nextStats = { ...current, misses: current.misses + 1, streak: 0 };
        statsRef.current = nextStats;
        return nextStats;
      });
      return;
    }
    const hitTarget = targetQueue[hitIndex];

    setStats((current) => {
      const nextStats = {
        hits: current.hits + 1,
        misses: current.misses,
        streak: current.streak + 1
      };
      hitsRef.current = nextStats.hits;
      statsRef.current = nextStats;
      return nextStats;
    });

    if (hitTarget.button === "right") {
      const walkTarget = queuedTarget(
        walkHereTarget(sourcePoint.x, sourcePoint.y),
        `${hitTarget.queueKey}-walk-${Math.trunc(sourcePoint.x)}-${Math.trunc(sourcePoint.y)}`
      );
      setTargetQueue(targetQueue.map((target, index) => (index === hitIndex ? walkTarget : target)));
      return;
    }

    const remainingTargets = targetQueue.filter((_, index) => index !== hitIndex);
    const filledTargets = fillVisibleTargets(remainingTargets, targetCursor);
    setTargetQueue(filledTargets.targets);
    setTargetCursor(filledTargets.cursor);
  };

  const startResize = (side: "left" | "right", event: PointerEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeDragRef.current = {
      side,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBounds: clientBounds
    };
  };

  const applyResize = (clientX: number, clientY: number): void => {
    const resizeDrag = resizeDragRef.current;
    if (!resizeDrag) {
      return;
    }
    const deltaX = clientX - resizeDrag.startClientX;
    const deltaY = clientY - resizeDrag.startClientY;
    const nextHeight = clamp(resizeDrag.startBounds.height + deltaY, aimClientMinHeight, aimClientMaxHeight);
    if (resizeDrag.side === "right") {
      setClientBounds({
        width: clamp(resizeDrag.startBounds.width + deltaX, aimClientMinWidth, aimClientMaxWidth),
        height: nextHeight,
        offsetX: resizeDrag.startBounds.offsetX
      });
      return;
    }
    const nextWidth = clamp(resizeDrag.startBounds.width - deltaX, aimClientMinWidth, aimClientMaxWidth);
    setClientBounds({
      width: nextWidth,
      height: nextHeight,
      offsetX: resizeDrag.startBounds.offsetX + resizeDrag.startBounds.width - nextWidth
    });
  };

  const moveResize = (event: PointerEvent<HTMLButtonElement>): void => {
    const resizeDrag = resizeDragRef.current;
    if (!resizeDrag || resizeDrag.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    applyResize(event.clientX, event.clientY);
  };

  const stopResize = (event: PointerEvent<HTMLButtonElement>): void => {
    if (resizeDragRef.current?.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.releasePointerCapture(event.pointerId);
    resizeDragRef.current = null;
  };

  const startMouseResize = (side: "left" | "right", event: MouseEvent<HTMLButtonElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    resizeDragRef.current = {
      side,
      pointerId: -1,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBounds: clientBounds
    };
    const handleMouseMove = (nativeEvent: globalThis.MouseEvent): void => {
      nativeEvent.preventDefault();
      applyResize(nativeEvent.clientX, nativeEvent.clientY);
    };
    const handleMouseUp = (nativeEvent: globalThis.MouseEvent): void => {
      nativeEvent.preventDefault();
      resizeDragRef.current = null;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  };

  const changePlayerName = (value: string): void => {
    setPlayerName(cleanAimPlayerNameInput(value));
  };

  const saveCompletedRun = (): void => {
    if (!lastCompletedRun || lastCompletedRun.score <= 0 || savedRunId) {
      return;
    }
    const cleanName = normalizeAimPlayerName(playerName);
    const entry = {
      ...lastCompletedRun,
      id: aimLeaderboardEntryId(),
      name: cleanName,
      savedAtMs: Date.now()
    };
    setPlayerName(cleanName);
    saveAimPlayerName(cleanName);
    setLeaderboardEntries((entries) => saveAimLeaderboardEntries([entry, ...entries]));
    setSavedRunId(entry.id);
  };

  return (
    <section className="nhAimTrainerSection" aria-labelledby="nh-aim-trainer-title">
      <div className="nhAimTrainerPanel">
        <div className="nhAimTrainerHeader">
          <div>
            <p className="eyebrow">Aim trainer</p>
            <h2 id="nh-aim-trainer-title">Fixed client click reps</h2>
          </div>
          <div className="nhAimTrainerControls">
            <button type="button" onClick={start}>
              {running ? "Restart" : "Start"}
            </button>
            <button type="button" onClick={reset}>
              Reset
            </button>
          </div>
        </div>
        <div className="nhAimTrainerStats" aria-live="polite">
          <span>{running ? `${formatAimTimer(timeRemainingMs)} left` : "30.0s timer"}</span>
          <span>{targetQueue.length} shown</span>
          <span>{stats.hits} score</span>
          <span>{highScore} local best</span>
          <span>{stats.misses} misses</span>
          <span>{stats.streak} streak</span>
        </div>
        <div className="nhAimTrainerStage">
          <div className="nhAimTrainerSidebar">
            <div className="nhAimTrainerLegend" aria-label="Aim trainer target colors">
              <span className="nhAimTrainerLegendItem">
                <span className="nhAimTrainerLegendSwatch" aria-hidden="true" />
                <span>Black: left-click</span>
              </span>
              <span className="nhAimTrainerLegendItem">
                <span className="nhAimTrainerLegendSwatch" data-required-button="right" aria-hidden="true" />
                <span>Blue: right-click</span>
              </span>
            </div>
            <div className="nhAimTrainerSave">
              <label>
                <span>Name</span>
                <input
                  value={playerName}
                  maxLength={aimPlayerNameMaxLength}
                  placeholder="Anonymous"
                  onChange={(event) => changePlayerName(event.currentTarget.value)}
                />
              </label>
              <button
                type="button"
                onClick={saveCompletedRun}
                disabled={!lastCompletedRun || lastCompletedRun.score <= 0 || savedRunId !== null}
              >
                {savedRunId ? "Saved" : "Save"}
              </button>
              <span>{lastCompletedRun ? `${lastCompletedRun.score} ready` : "Finish a run"}</span>
            </div>
            <div className="nhAimTrainerLeaderboard" aria-label="Aim trainer leaderboard">
              <div className="nhAimTrainerLeaderboardTabs">
                <button
                  type="button"
                  aria-pressed={leaderboardScope === "recent"}
                  onClick={() => setLeaderboardScope("recent")}
                >
                  Recent
                </button>
                <button
                  type="button"
                  aria-pressed={leaderboardScope === "week"}
                  onClick={() => setLeaderboardScope("week")}
                >
                  Week
                </button>
                <button
                  type="button"
                  aria-pressed={leaderboardScope === "all"}
                  onClick={() => setLeaderboardScope("all")}
                >
                  All-time
                </button>
              </div>
              <ol>
                {leaderboardRows.length > 0 ? (
                  leaderboardRows.map((entry) => (
                    <li key={entry.id}>
                      <span>{entry.name}</span>
                      <strong>{entry.score}</strong>
                      <small>{formatAimLeaderboardDate(entry.savedAtMs)}</small>
                    </li>
                  ))
                ) : (
                  <li className="nhAimTrainerLeaderboardEmpty">No saves</li>
                )}
              </ol>
            </div>
          </div>
          <div
            className="nhAimTrainerClient"
            data-testid="nh-aim-trainer-client"
            data-running={running}
            style={clientBoundsStyle(clientBounds)}
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={handlePointerDown}
          >
            {running
              ? targetQueue.map((target, index) => (
                  <span
                    key={target.queueKey}
                    className="nhAimTrainerTarget"
                    data-queue-index={index}
                    data-required-button={target.button}
                    data-shape={target.shape}
                    data-target-id={target.id}
                    data-entered={enteredTargetKeys.includes(target.queueKey)}
                    style={targetStyle(target)}
                    aria-label={target.label}
                  />
                ))
              : null}
            {!running && lastCompletedRun ? (
              <div className="nhAimTrainerResult" aria-label={`Your score ${lastCompletedRun.score}`} aria-live="polite">
                <span>Your score</span>
                <strong>{lastCompletedRun.score}</strong>
              </div>
            ) : null}
            <button
              type="button"
              className="nhAimTrainerResizeHandle"
              data-resize-side="left"
              aria-label="Resize aim trainer from bottom left"
              onPointerDown={(event) => startResize("left", event)}
              onPointerMove={moveResize}
              onPointerUp={stopResize}
              onPointerCancel={stopResize}
              onMouseDown={(event) => startMouseResize("left", event)}
            />
            <button
              type="button"
              className="nhAimTrainerResizeHandle"
              data-resize-side="right"
              aria-label="Resize aim trainer from bottom right"
              onPointerDown={(event) => startResize("right", event)}
              onPointerMove={moveResize}
              onPointerUp={stopResize}
              onPointerCancel={stopResize}
              onMouseDown={(event) => startMouseResize("right", event)}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function walkHereTarget(sourceX: number, sourceY: number): AimTarget {
  const menuX = clamp(Math.trunc(sourceX - walkHereRow.width / 2), 0, aimClientWidth - walkHereRow.width);
  const menuY = clamp(Math.trunc(sourceY), 0, aimClientHeight - walkHereRow.menuHeight);
  return squareTarget("walk-here", "Walk here", {
    x: menuX,
    y: menuY + 22,
    width: walkHereRow.width,
    height: walkHereRow.height
  });
}

function inventoryTarget(id: string, label: string, slotIndex: number): AimTarget {
  const column = slotIndex % 4;
  const row = Math.trunc(slotIndex / 4);
  return squareTarget(id, label, {
    x: inventoryGrid.x + column * inventoryGrid.step.width,
    y: inventoryGrid.y + row * inventoryGrid.step.height,
    width: inventoryGrid.slot.width,
    height: inventoryGrid.slot.height
  });
}

function squareTarget(id: string, label: string, rect: AimRect): AimTarget {
  return { id, label, rect, shape: "rect", button: "left" };
}

function fillVisibleTargets(
  targets: readonly QueuedAimTarget[],
  cursor: AimTargetCursor
): { readonly targets: readonly QueuedAimTarget[]; readonly cursor: AimTargetCursor } {
  const filledTargets = [...targets];
  let nextCursor = cursor;
  let attempts = 0;
  while (filledTargets.length < visibleTargetCount && attempts < visibleTargetCount * 24) {
    const next = nextTargetFromCursor(nextCursor);
    if (!filledTargets.some((target) => sameClickTarget(target, next.target))) {
      filledTargets.push(next.target);
    }
    nextCursor = next.cursor;
    attempts += 1;
  }
  return { targets: filledTargets, cursor: nextCursor };
}

function nextTargetFromCursor(
  cursor: AimTargetCursor
): { readonly target: QueuedAimTarget; readonly cursor: AimTargetCursor } {
  if (cursor.phase === "ui") {
    const uiGroup = cursor.uiGroup.length > 0 ? cursor.uiGroup : randomUiGroup();
    const id = uiGroup[Math.min(cursor.uiIndex, uiGroup.length - 1)];
    const nextIndex = cursor.uiIndex + 1;
    return {
      target: queuedTarget(baseTargets[id], `${cursor.serial}-ui-${nextIndex}-${id}`),
      cursor:
        nextIndex < uiGroup.length
          ? { ...cursor, uiGroup, uiIndex: nextIndex, serial: cursor.serial + 1 }
          : {
              phase: "world",
              uiGroup: [],
              uiIndex: 0,
              forceUiAfterWorld: false,
              rightClickCooldown: cursor.rightClickCooldown,
              serial: cursor.serial + 1
            }
    };
  }

  const shouldRightClick = cursor.rightClickCooldown <= 0 && Math.random() < 0.5;
  const id = randomItem(shouldRightClick ? rightClickTemplates : worldLeftTargetIds);
  const nextRightClickCooldown = shouldRightClick
    ? randomInteger(2, 4)
    : Math.max(0, cursor.rightClickCooldown - 1);
  const continueWorld = !shouldRightClick && !cursor.forceUiAfterWorld && Math.random() < 0.12;

  return {
    target: queuedTarget(
      shouldRightClick ? { ...baseTargets[id], button: "right" } : baseTargets[id],
      `${cursor.serial}-${shouldRightClick ? "right" : "world"}-${id}`
    ),
    cursor: continueWorld
      ? {
          phase: "world",
          uiGroup: [],
          uiIndex: 0,
          forceUiAfterWorld: true,
          rightClickCooldown: nextRightClickCooldown,
          serial: cursor.serial + 1
        }
      : {
          phase: "ui",
          uiGroup: randomUiGroup(),
          uiIndex: 0,
          forceUiAfterWorld: false,
          rightClickCooldown: nextRightClickCooldown,
          serial: cursor.serial + 1
        }
  };
}

function randomAimCursor(): AimTargetCursor {
  return {
    phase: "ui",
    uiGroup: randomUiGroup(),
    uiIndex: 0,
    forceUiAfterWorld: false,
    rightClickCooldown: randomInteger(1, 3),
    serial: randomInteger(0, 10_000)
  };
}

function randomUiGroup(): readonly TargetId[] {
  const group = randomItem(uiClickGroups);
  const maxLength = Math.min(5, group.length);
  const length = randomInteger(Math.min(2, maxLength), maxLength);
  return group.slice(0, length);
}

function queuedTarget(target: AimTarget, queueKey: string): QueuedAimTarget {
  return { ...target, queueKey };
}

function sameClickTarget(left: AimTarget, right: AimTarget): boolean {
  return (
    left.id === right.id &&
    left.button === right.button &&
    left.rect.x === right.rect.x &&
    left.rect.y === right.rect.y &&
    left.rect.width === right.rect.width &&
    left.rect.height === right.rect.height
  );
}

function isWorldTargetId(id: TargetId): boolean {
  return id.startsWith("player-") || id.startsWith("scene-");
}

function randomItem<T>(items: readonly T[]): T {
  return items[Math.trunc(Math.random() * items.length)];
}

function randomInteger(min: number, max: number): number {
  return min + Math.trunc(Math.random() * (max - min + 1));
}

function clientBoundsStyle(bounds: AimClientBounds): CSSProperties {
  return {
    width: `${bounds.width}px`,
    height: `${bounds.height}px`,
    marginLeft: `${bounds.offsetX}px`
  };
}

function targetStyle(target: AimTarget): CSSProperties {
  return {
    left: `${(target.rect.x / aimClientWidth) * 100}%`,
    top: `${(target.rect.y / aimClientHeight) * 100}%`,
    width: `${(target.rect.width / aimClientWidth) * 100}%`,
    height: `${(target.rect.height / aimClientHeight) * 100}%`
  };
}

function pointerToSourcePoint(event: PointerEvent<HTMLDivElement>): { readonly x: number; readonly y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / Math.max(1, rect.width)) * aimClientWidth,
    y: ((event.clientY - rect.top) / Math.max(1, rect.height)) * aimClientHeight
  };
}

function pointInTarget(x: number, y: number, target: AimTarget): boolean {
  return (
    x >= target.rect.x &&
    x <= target.rect.x + target.rect.width &&
    y >= target.rect.y &&
    y <= target.rect.y + target.rect.height
  );
}

function formatAimTimer(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function readAimHighScore(): number {
  try {
    const storedScore = window.localStorage.getItem(aimHighScoreStorageKey);
    const score = storedScore === null ? 0 : Number.parseInt(storedScore, 10);
    return Number.isFinite(score) && score > 0 ? score : 0;
  } catch {
    return 0;
  }
}

function saveAimHighScore(score: number): number {
  try {
    window.localStorage.setItem(aimHighScoreStorageKey, String(score));
  } catch {
    return score;
  }
  return score;
}

function readAimPlayerName(): string {
  try {
    return cleanAimPlayerNameInput(window.localStorage.getItem(aimPlayerNameStorageKey) ?? "");
  } catch {
    return "";
  }
}

function saveAimPlayerName(name: string): void {
  try {
    window.localStorage.setItem(aimPlayerNameStorageKey, name);
  } catch {
    return;
  }
}

function readAimLeaderboardEntries(): readonly AimLeaderboardEntry[] {
  try {
    const storedEntries = JSON.parse(window.localStorage.getItem(aimLeaderboardStorageKey) ?? "[]");
    return Array.isArray(storedEntries) ? normalizeAimLeaderboardEntries(storedEntries) : [];
  } catch {
    return [];
  }
}

function saveAimLeaderboardEntries(entries: readonly AimLeaderboardEntry[]): readonly AimLeaderboardEntry[] {
  const normalizedEntries = normalizeAimLeaderboardEntries(entries);
  try {
    window.localStorage.setItem(aimLeaderboardStorageKey, JSON.stringify(normalizedEntries));
  } catch {
    return normalizedEntries;
  }
  return normalizedEntries;
}

function normalizeAimLeaderboardEntries(entries: readonly unknown[]): readonly AimLeaderboardEntry[] {
  return entries
    .filter(isAimLeaderboardEntry)
    .sort((left, right) => right.savedAtMs - left.savedAtMs)
    .slice(0, aimLeaderboardMaxEntries);
}

function isAimLeaderboardEntry(entry: unknown): entry is AimLeaderboardEntry {
  if (typeof entry !== "object" || entry === null) {
    return false;
  }
  const candidate = entry as Partial<AimLeaderboardEntry>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    typeof candidate.score === "number" &&
    Number.isFinite(candidate.score) &&
    candidate.score >= 0 &&
    typeof candidate.misses === "number" &&
    Number.isFinite(candidate.misses) &&
    candidate.misses >= 0 &&
    typeof candidate.streak === "number" &&
    Number.isFinite(candidate.streak) &&
    candidate.streak >= 0 &&
    typeof candidate.completedAtMs === "number" &&
    Number.isFinite(candidate.completedAtMs) &&
    typeof candidate.savedAtMs === "number" &&
    Number.isFinite(candidate.savedAtMs)
  );
}

function aimLeaderboardRows(
  entries: readonly AimLeaderboardEntry[],
  scope: AimLeaderboardScope,
  nowMs: number
): readonly AimLeaderboardEntry[] {
  const scopedEntries =
    scope === "week" ? entries.filter((entry) => nowMs - entry.savedAtMs <= aimWeekMs) : entries;
  const sortedEntries =
    scope === "recent"
      ? [...scopedEntries].sort((left, right) => right.savedAtMs - left.savedAtMs)
      : [...scopedEntries].sort(
          (left, right) => right.score - left.score || left.misses - right.misses || right.savedAtMs - left.savedAtMs
        );
  return sortedEntries.slice(0, aimLeaderboardVisibleEntries);
}

function cleanAimPlayerNameInput(value: string): string {
  return value.replace(/[\x00-\x1f\x7f]/g, "").slice(0, aimPlayerNameMaxLength);
}

function normalizeAimPlayerName(value: string): string {
  const name = cleanAimPlayerNameInput(value).replace(/\s+/g, " ").trim();
  return name.length > 0 ? name : "Anonymous";
}

function aimLeaderboardEntryId(): string {
  return `${Date.now().toString(36)}-${Math.trunc(Math.random() * 1_000_000).toString(36)}`;
}

function formatAimLeaderboardDate(savedAtMs: number): string {
  const elapsedMs = Math.max(0, Date.now() - savedAtMs);
  const elapsedMinutes = Math.floor(elapsedMs / 60_000);
  if (elapsedMinutes < 1) {
    return "now";
  }
  if (elapsedMinutes < 60) {
    return `${elapsedMinutes}m`;
  }
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) {
    return `${elapsedHours}h`;
  }
  return `${Math.floor(elapsedHours / 24)}d`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
