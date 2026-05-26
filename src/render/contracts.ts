export type PlayerAppearanceSlotIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type PlayerBodyColorIndex = 0 | 1 | 2 | 3 | 4;

export type PlayerAppearanceSlots = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

export type PlayerBodyColors = readonly [number, number, number, number, number];

export interface PlayerSequenceIds {
  readonly idle: number;
  readonly turn: number;
  readonly walk: number;
  readonly turn180: number;
  readonly turn90Clockwise: number;
  readonly turn90CounterClockwise: number;
  readonly run: number;
}

export interface PlayerAppearancePacket {
  readonly gender: 0 | 1;
  readonly npcTransformId: number | null;
  readonly equipmentSlots: PlayerAppearanceSlots;
  readonly bodyColors: PlayerBodyColors;
  readonly skullIcon: number;
  readonly prayerIcon: number;
  readonly combatLevel: number;
  readonly totalLevel: number;
  readonly hidden: boolean;
  readonly sequences: PlayerSequenceIds;
}

export type CacheModelPartKind = "kit" | "item" | "npc-transform";

export interface CacheModelFace {
  readonly indices: readonly [number, number, number];
  readonly color: number;
  readonly alpha?: number;
  readonly priority?: number;
  readonly textureId?: number;
}

export interface CacheModelPart {
  readonly cacheId: number;
  readonly kind: CacheModelPartKind;
  readonly sourceSlot?: PlayerAppearanceSlotIndex;
  readonly vertices: readonly ReadonlyVector3[];
  readonly faces: readonly CacheModelFace[];
  readonly recolors: readonly CacheRecolor[];
}

export interface CacheRecolor {
  readonly from: number;
  readonly to: number;
}

export interface SequenceFrameTransform {
  readonly label: number;
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SequenceFrame {
  readonly frameId: number;
  readonly frameMapId: number;
  readonly lengthClientCycles: number;
  readonly transforms: readonly SequenceFrameTransform[];
}

export interface SequenceDefinition {
  readonly sequenceId: number;
  readonly frameIds: readonly number[];
  readonly frameLengths: readonly number[];
  readonly frames: readonly SequenceFrame[];
  readonly shieldOverrideId?: number;
  readonly weaponOverrideId?: number;
}

export interface ReadonlyVector2 {
  readonly x: number;
  readonly y: number;
}

export interface ReadonlyVector3 extends ReadonlyVector2 {
  readonly z: number;
}

export interface RenderActorRef {
  readonly actorId: string;
  readonly type: "player" | "npc";
}

export interface RenderTickWindow {
  readonly startCycle: number;
  readonly endCycle: number;
}

export interface SpotAnimationRenderEvent {
  readonly eventType: "spot-animation";
  readonly gfxId: number;
  readonly actor: RenderActorRef;
  readonly heightOffset: number;
  readonly delayCycles: number;
  readonly sequenceId?: number;
  readonly window: RenderTickWindow;
}

export interface ProjectileRenderEvent {
  readonly eventType: "projectile";
  readonly gfxId: number;
  readonly sourceTile: ReadonlyVector2;
  readonly targetTile: ReadonlyVector2;
  readonly targetIndex: number;
  readonly startHeight: number;
  readonly endHeight: number;
  readonly delayCycles: number;
  readonly durationCycles: number;
  readonly curve: number;
  readonly offset: number;
  readonly slope: number;
  readonly skipTravel: boolean;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly sequenceId?: number;
  readonly window: RenderTickWindow;
}

export type OverlaySpriteKind = "prayer" | "skull" | "hitsplat" | "health-bar";

export interface OverlaySpriteEvent {
  readonly eventType: "overlay-sprite";
  readonly kind: OverlaySpriteKind;
  readonly spriteId: number;
  readonly actor: RenderActorRef;
  readonly priority: number;
  readonly clientOrder: number;
  readonly window: RenderTickWindow;
}

export type RenderEvent = SpotAnimationRenderEvent | ProjectileRenderEvent | OverlaySpriteEvent;
