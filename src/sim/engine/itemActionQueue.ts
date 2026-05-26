/**
 * Queued inventory item actions that resolve at tick boundaries.
 *
 * In Kronos, widget button clicks are delivered as packets and decoded during
 * the LOGIC phase of CoreWorker.process(). When the player clicks Wield in the
 * inventory, the client sends a packet; the server decodes it during the next
 * tick's LOGIC stage and immediately calls Equipment.equip() at that point.
 * Multiple clicks between two ticks all decode in packet order during the same
 * LOGIC pass.
 *
 * This module provides a small insertion-ordered queue that the trainer UI
 * pushes into on click and drains at each tick boundary. That mirrors the
 * packet-to-process delay without pretending the UI mutates equipment locally.
 */

export type QueuedItemActionKind = "equip" | "unequip" | "eat" | "drink" | "drop" | "empty";

export interface QueuedItemEquipData {
  readonly equipSlot: number;
  readonly equippedItemId: number;
  readonly wornItemId: number | null;
  readonly weaponType: string | null;
  readonly weaponTypeConfig: number | undefined;
  readonly loadoutId: string | null;
}

export interface QueuedItemAction {
  readonly kind: QueuedItemActionKind;
  readonly slotIndex: number;
  readonly itemId: number;
  readonly queuedAtMs: number;
  readonly readyAtMs?: number;
  readonly equipData?: QueuedItemEquipData;
  /** Opaque context carried through for dataset/event reporting. */
  readonly contextEntry?: unknown;
}

/**
 * Mutable insertion-ordered queue. Push on click, drain at tick boundary.
 */
export class ItemActionQueue {
  private readonly pending: QueuedItemAction[] = [];

  /** Enqueue an action. Insertion order is preserved, matching Kronos packet order. */
  push(action: QueuedItemAction): void {
    this.pending.push(action);
  }

  /** Drain all queued actions and return them in insertion order. Queue is cleared. */
  drain(): readonly QueuedItemAction[] {
    if (this.pending.length === 0) {
      return [];
    }
    const drained = [...this.pending];
    this.pending.length = 0;
    return drained;
  }

  /** Drain actions that have waited at least delayMs, preserving the rest. */
  drainReady(nowMs: number, delayMs: number): readonly QueuedItemAction[] {
    if (this.pending.length === 0) {
      return [];
    }
    const ready: QueuedItemAction[] = [];
    const waiting: QueuedItemAction[] = [];
    for (const action of this.pending) {
      const readyAtMs = action.readyAtMs ?? action.queuedAtMs + delayMs;
      if (nowMs >= readyAtMs) {
        ready.push(action);
      } else {
        waiting.push(action);
      }
    }
    this.pending.length = 0;
    this.pending.push(...waiting);
    return ready;
  }

  /** Peek at currently queued actions without draining. */
  snapshot(): readonly QueuedItemAction[] {
    return [...this.pending];
  }

  /** Number of currently queued actions. */
  get length(): number {
    return this.pending.length;
  }

  /** Set of slot indices that have pending equip actions. */
  pendingEquipSlotIndices(): ReadonlySet<number> {
    const indices = new Set<number>();
    for (const action of this.pending) {
      if (action.kind === "equip") {
        indices.add(action.slotIndex);
      }
    }
    return indices;
  }

  /** Clear all pending actions without processing them. */
  clear(): void {
    this.pending.length = 0;
  }
}

/**
 * Create a new empty ItemActionQueue.
 */
export function createItemActionQueue(): ItemActionQueue {
  return new ItemActionQueue();
}
