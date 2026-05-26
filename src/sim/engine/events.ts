export type SimEventId = string;

export interface QueuedSimEvent<TPayload = unknown> {
  readonly id: SimEventId;
  readonly kind: string;
  readonly dueTick: number;
  readonly payload: TPayload;
}

export interface QueueEventInput<TPayload = unknown> {
  readonly id: SimEventId;
  readonly kind: string;
  readonly delayTicks: number;
  readonly payload: TPayload;
}

interface QueuedEventRecord<TPayload> {
  readonly event: QueuedSimEvent<TPayload>;
  readonly sequence: number;
}

export class DelayedEventQueue<TPayload = unknown> {
  private readonly events: QueuedEventRecord<TPayload>[] = [];
  private sequence = 0;

  queue(currentTick: number, input: QueueEventInput<TPayload>): QueuedSimEvent<TPayload> {
    const delayTicks = Math.max(0, Math.trunc(input.delayTicks));
    const event: QueuedSimEvent<TPayload> = {
      id: input.id,
      kind: input.kind,
      dueTick: currentTick + delayTicks,
      payload: input.payload
    };

    this.events.push({ event, sequence: this.sequence });
    this.sequence += 1;
    this.sortEvents();
    return event;
  }

  drainDue(currentTick: number): readonly QueuedSimEvent<TPayload>[] {
    const due: QueuedSimEvent<TPayload>[] = [];

    while (this.events.length > 0 && this.events[0].event.dueTick <= currentTick) {
      const record = this.events.shift();
      if (record) {
        due.push(record.event);
      }
    }

    return due;
  }

  peek(): QueuedSimEvent<TPayload> | undefined {
    return this.events[0]?.event;
  }

  snapshot(): readonly QueuedSimEvent<TPayload>[] {
    return this.events.map((record) => record.event);
  }

  clear(): void {
    this.events.length = 0;
  }

  private sortEvents(): void {
    this.events.sort((a, b) => {
      if (a.event.dueTick !== b.event.dueTick) {
        return a.event.dueTick - b.event.dueTick;
      }

      return a.sequence - b.sequence;
    });
  }
}
