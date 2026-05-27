export interface TilePosition {
  readonly x: number;
  readonly y: number;
  readonly plane?: number;
}

export interface MeleeReachInput {
  readonly attacker: TilePosition;
  readonly defender: TilePosition;
  readonly attackerFrozen: boolean;
}

export interface MeleeReachResult {
  readonly canReach: boolean;
  readonly relation: "same-tile" | "cardinal-adjacent" | "diagonal" | "step-in" | "out-of-range" | "different-plane";
  readonly requiresMovement: boolean;
}

export function tileDelta(a: TilePosition, b: TilePosition): { readonly dx: number; readonly dy: number } {
  return {
    dx: Math.abs(a.x - b.x),
    dy: Math.abs(a.y - b.y)
  };
}

export function samePlane(a: TilePosition, b: TilePosition): boolean {
  return (a.plane ?? 0) === (b.plane ?? 0);
}

export function sameTile(a: TilePosition, b: TilePosition): boolean {
  return samePlane(a, b) && a.x === b.x && a.y === b.y;
}

export function cardinalDistance(a: TilePosition, b: TilePosition): number {
  const { dx, dy } = tileDelta(a, b);
  return dx + dy;
}

export function chebyshevDistance(a: TilePosition, b: TilePosition): number {
  const { dx, dy } = tileDelta(a, b);
  return Math.max(dx, dy);
}

export function isCardinalAdjacent(a: TilePosition, b: TilePosition): boolean {
  return samePlane(a, b) && cardinalDistance(a, b) === 1;
}

export function isDiagonalAdjacent(a: TilePosition, b: TilePosition): boolean {
  const { dx, dy } = tileDelta(a, b);
  return samePlane(a, b) && dx === 1 && dy === 1;
}

export function canMeleeReachThisTick(input: MeleeReachInput): MeleeReachResult {
  if (!samePlane(input.attacker, input.defender)) {
    return { canReach: false, relation: "different-plane", requiresMovement: false };
  }

  const { dx, dy } = tileDelta(input.attacker, input.defender);

  // Reference NH behavior treats standing under the target as a melee opportunity only when the attacker can step.
  if (dx === 0 && dy === 0) {
    return {
      canReach: !input.attackerFrozen,
      relation: "same-tile",
      requiresMovement: true
    };
  }

  if (dx + dy === 1) {
    return {
      canReach: true,
      relation: "cardinal-adjacent",
      requiresMovement: false
    };
  }

  // Source: NhStakerBot.canMeleeReachThisTick() returns false immediately after
  // the cardinal-adjacent check when attacker.isFrozen(); frozen melee cannot
  // use diagonal or one-tick step-in reach.
  if (input.attackerFrozen) {
    return {
      canReach: false,
      relation: dx === 1 && dy === 1 ? "diagonal" : "out-of-range",
      requiresMovement: dx <= 2 && dy <= 2
    };
  }

  if (dx === 1 && dy === 1) {
    return {
      canReach: true,
      relation: "diagonal",
      requiresMovement: true
    };
  }

  // Nh' NH helper allows a one-tick step only if that step lands cardinal-adjacent.
  if (dx <= 2 && dy <= 2) {
    const afterStepDx = Math.max(0, dx - 1);
    const afterStepDy = Math.max(0, dy - 1);
    if (afterStepDx + afterStepDy !== 1) {
      return {
        canReach: false,
        relation: "out-of-range",
        requiresMovement: true
      };
    }

    return {
      canReach: true,
      relation: "step-in",
      requiresMovement: true
    };
  }

  return {
    canReach: false,
    relation: "out-of-range",
    requiresMovement: dx <= 2 && dy <= 2
  };
}
