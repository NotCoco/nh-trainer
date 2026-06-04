import { useState, type CSSProperties, type PointerEvent } from "react";

type AimButton = "left" | "right";
type AimShape = "rect";

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
  readonly templateIndex: number;
  readonly stepIndex: number;
  readonly rightClickRound: number;
}

interface AimStats {
  readonly hits: number;
  readonly misses: number;
  readonly streak: number;
}

const aimClientWidth = 765;
const aimClientHeight = 503;
const visibleTargetCount = 6;
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

const drillTemplates: readonly (readonly TargetId[])[] = [
  ["tab-inventory", "inv-range-body", "inv-range-weapon", "tab-magic", "spell-ice-barrage", "player-center"],
  ["tab-inventory", "inv-mage-body", "inv-mage-legs", "tab-magic", "spell-blood-blitz", "player-west"],
  ["tab-inventory", "inv-ags", "tab-combat", "spec-bar", "player-east"],
  ["tab-inventory", "inv-gmaul", "tab-combat", "spec-bar", "player-center"],
  ["tab-equipment", "equip-helmet", "equip-shield", "equip-boots", "tab-inventory", "inv-rune-pouch"],
  ["scene-top-left", "tab-magic", "spell-ice-blitz", "player-north"],
  ["scene-east", "tab-magic", "spell-blood-barrage", "player-south"]
];

const rightClickTemplates: readonly TargetId[] = ["player-north", "player-diagonal", "scene-west", "scene-south"];

export function NhAimTrainer(): JSX.Element {
  const [running, setRunning] = useState(false);
  const [stats, setStats] = useState<AimStats>({ hits: 0, misses: 0, streak: 0 });
  const [targetQueue, setTargetQueue] = useState<readonly QueuedAimTarget[]>([]);
  const [targetCursor, setTargetCursor] = useState<AimTargetCursor>({ templateIndex: 0, stepIndex: 0, rightClickRound: 0 });

  const start = (): void => {
    const initialCursor = {
      templateIndex: Math.trunc(Math.random() * drillTemplates.length),
      stepIndex: 0,
      rightClickRound: Math.trunc(Math.random() * 3)
    };
    const initialTargets = fillVisibleTargets([], initialCursor);
    setRunning(true);
    setTargetQueue(initialTargets.targets);
    setTargetCursor(initialTargets.cursor);
    setStats({ hits: 0, misses: 0, streak: 0 });
  };

  const reset = (): void => {
    setRunning(false);
    setTargetQueue([]);
    setStats({ hits: 0, misses: 0, streak: 0 });
  };

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
      setStats((current) => ({ ...current, misses: current.misses + 1, streak: 0 }));
      return;
    }
    const hitTarget = targetQueue[hitIndex];

    setStats((current) => ({
      hits: current.hits + 1,
      misses: current.misses,
      streak: current.streak + 1
    }));

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
          <span>{running ? `${targetQueue.length} shown` : "ready"}</span>
          <span>{running ? "any order" : "start"}</span>
          <span>{stats.hits} hits</span>
          <span>{stats.misses} misses</span>
          <span>{stats.streak} streak</span>
        </div>
        <div
          className="nhAimTrainerClient"
          data-testid="nh-aim-trainer-client"
          data-running={running}
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
                  style={targetStyle(target)}
                  aria-label={target.label}
                />
              ))
            : null}
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
  while (filledTargets.length < visibleTargetCount && attempts < visibleTargetCount * drillTemplates.length * 4) {
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
  const sequence = drillTemplates[cursor.templateIndex % drillTemplates.length];
  if (cursor.stepIndex >= sequence.length) {
    return nextTargetFromCursor(nextRoundCursor(cursor));
  }
  if (shouldUseRightClick(cursor.stepIndex, cursor.rightClickRound)) {
    const id = rightClickTemplates[cursor.rightClickRound % rightClickTemplates.length];
    return {
      target: queuedTarget({ ...baseTargets[id], button: "right" }, `round-${cursor.rightClickRound}-right-${id}`),
      cursor: { ...cursor, stepIndex: 1 }
    };
  }

  const id = sequence[cursor.stepIndex];
  return {
    target: queuedTarget(
      baseTargets[id],
      `round-${cursor.rightClickRound}-template-${cursor.templateIndex}-step-${cursor.stepIndex}-${id}`
    ),
    cursor: nextStepCursor(cursor, sequence.length)
  };
}

function nextStepCursor(cursor: AimTargetCursor, sequenceLength: number): AimTargetCursor {
  const nextStepIndex = cursor.stepIndex + 1;
  if (nextStepIndex < sequenceLength) {
    return { ...cursor, stepIndex: nextStepIndex };
  }
  return nextRoundCursor(cursor);
}

function nextRoundCursor(cursor: AimTargetCursor): AimTargetCursor {
  return {
    templateIndex: randomFollowingTemplateIndex(cursor.templateIndex),
    stepIndex: 0,
    rightClickRound: cursor.rightClickRound + 1
  };
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

function shouldUseRightClick(stepIndex: number, rightClickRound: number): boolean {
  return stepIndex === 0 && rightClickRound % 3 === 2;
}

function randomFollowingTemplateIndex(templateIndex: number): number {
  return (templateIndex + 1 + Math.trunc(Math.random() * 2)) % drillTemplates.length;
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
