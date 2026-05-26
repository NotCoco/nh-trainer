import type { RuntimePlayerAppearance } from "./runtimeScene";

type PlayerBodyColors = readonly [number, number, number, number, number];

export interface KronosPlayerAppearancePacketDecodeOptions {
  readonly bodyColorPaletteLengths?: readonly number[];
  readonly itemTeamById?: ReadonlyMap<number, number> | Record<string, number>;
}

export interface KronosDecodedPlayerSequences {
  readonly ready: number;
  readonly turnLeft: number;
  readonly turnRight: number;
  readonly walk: number;
  readonly walkBack: number;
  readonly walkLeft: number;
  readonly walkRight: number;
  readonly run: number;
}

export interface KronosDecodedPlayerAppearancePacket {
  readonly gender: number;
  readonly isFemale: boolean;
  readonly headIconPk: number;
  readonly headIconPrayer: number;
  readonly team: number;
  readonly npcTransformId: number;
  readonly equipmentSlots: readonly number[];
  readonly itemIds: readonly number[];
  readonly bodyColors: PlayerBodyColors;
  readonly sequences: KronosDecodedPlayerSequences;
  readonly username: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly combatLevel: number;
  readonly skillLevel: number;
  readonly isHidden: boolean;
  readonly bytesRead: number;
}

export function decodeKronosPlayerAppearancePacket(
  bytes: ArrayLike<number>,
  options: KronosPlayerAppearancePacketDecodeOptions = {}
): KronosDecodedPlayerAppearancePacket {
  const reader = new AppearancePacketReader(bytes);
  const gender = reader.readUnsignedByte();
  const headIconPk = reader.readByte();
  const headIconPrayer = reader.readByte();
  const equipmentSlots = new Array<number>(12).fill(0);
  let npcTransformId = -1;
  let team = 0;

  for (let slot = 0; slot < equipmentSlots.length; slot += 1) {
    const high = reader.readUnsignedByte();
    if (high === 0) {
      continue;
    }

    const low = reader.readUnsignedByte();
    const encoded = low + (high << 8);
    equipmentSlots[slot] = encoded;
    if (slot === 0 && encoded === 65535) {
      npcTransformId = reader.readUnsignedShort();
      break;
    }

    if (encoded >= 512) {
      const resolvedItemTeam = resolveItemTeam(encoded - 512, options);
      if (resolvedItemTeam !== 0) {
        team = resolvedItemTeam;
      }
    }
  }

  const bodyColors = [0, 0, 0, 0, 0] as number[];
  for (let index = 0; index < bodyColors.length; index += 1) {
    bodyColors[index] = normalizeBodyColor(reader.readUnsignedByte(), index, options);
  }

  const ready = readSequenceId(reader);
  const turnLeft = readSequenceId(reader);
  const walk = readSequenceId(reader);
  const walkBack = readSequenceId(reader);
  const walkLeft = readSequenceId(reader);
  const walkRight = readSequenceId(reader);
  const run = readSequenceId(reader);
  const username = reader.readString();
  const prefix = reader.readString();
  const suffix = reader.readString();
  const combatLevel = reader.readUnsignedByte();
  const skillLevel = reader.readUnsignedShort();
  const isHidden = reader.readUnsignedByte() === 1;

  return {
    gender,
    isFemale: gender === 1,
    headIconPk,
    headIconPrayer,
    team,
    npcTransformId,
    equipmentSlots,
    itemIds: equipmentSlots
      .filter((encoded) => encoded >= 512 && encoded !== 65535)
      .map((encoded) => encoded - 512),
    bodyColors: bodyColors as unknown as PlayerBodyColors,
    sequences: {
      ready,
      turnLeft,
      turnRight: turnLeft,
      walk,
      walkBack,
      walkLeft,
      walkRight,
      run
    },
    username,
    prefix,
    suffix,
    combatLevel,
    skillLevel,
    isHidden,
    bytesRead: reader.offset
  };
}

export function kronosRuntimeAppearanceFromDecodedPacket(
  packet: Pick<KronosDecodedPlayerAppearancePacket, "itemIds" | "bodyColors" | "equipmentSlots" | "team">
): RuntimePlayerAppearance {
  return {
    itemIds: packet.itemIds,
    bodyColors: packet.bodyColors,
    equipmentSlots: packet.equipmentSlots,
    team: packet.team,
    source: "client-packet"
  };
}

function readSequenceId(reader: AppearancePacketReader): number {
  const sequenceId = reader.readUnsignedShort();
  return sequenceId === 65535 ? -1 : sequenceId;
}

function normalizeBodyColor(
  color: number,
  index: number,
  options: KronosPlayerAppearancePacketDecodeOptions
): number {
  const paletteLength = options.bodyColorPaletteLengths?.[index];
  return paletteLength !== undefined && (color < 0 || color >= paletteLength) ? 0 : color;
}

function resolveItemTeam(itemId: number, options: KronosPlayerAppearancePacketDecodeOptions): number {
  const source = options.itemTeamById;
  if (!source) {
    return 0;
  }

  if (typeof (source as ReadonlyMap<number, number>).get === "function") {
    return (source as ReadonlyMap<number, number>).get(itemId) ?? 0;
  }

  return (source as Record<string, number>)[String(itemId)] ?? 0;
}

class AppearancePacketReader {
  private readonly bytes: ArrayLike<number>;
  offset = 0;

  constructor(bytes: ArrayLike<number>) {
    this.bytes = bytes;
  }

  readUnsignedByte(): number {
    this.require(1);
    return this.bytes[this.offset++] & 0xff;
  }

  readByte(): number {
    const value = this.readUnsignedByte();
    return value > 127 ? value - 256 : value;
  }

  readUnsignedShort(): number {
    const high = this.readUnsignedByte();
    const low = this.readUnsignedByte();
    return (high << 8) + low;
  }

  readString(): string {
    const chars: number[] = [];
    while (this.offset < this.bytes.length) {
      const value = this.readUnsignedByte();
      if (value === 0) {
        return String.fromCharCode(...chars);
      }
      chars.push(value);
    }
    throw new Error("Unterminated player appearance string");
  }

  private require(length: number): void {
    if (this.offset + length > this.bytes.length) {
      throw new Error("Truncated player appearance packet");
    }
  }
}
