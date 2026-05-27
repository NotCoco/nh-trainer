export const NH_CONTEXT_MENU_FONT_KEY = "bold12";

export interface NhClientFontDefinition {
  readonly key: string;
  readonly fontId: number;
  readonly fontArchiveName: string;
  readonly usage: string;
  readonly sheetId: string;
  readonly ascent: number;
  readonly maxAscent: number;
  readonly maxDescent: number;
  readonly advances: readonly number[];
  readonly kerning: ReadonlyMap<number, number>;
}

export type NhClientFontStore = ReadonlyMap<string, NhClientFontDefinition>;

export interface NhClientFontGlyphLayout {
  readonly char: string;
  readonly charCode: number;
  readonly x: number;
  readonly advance: number;
}

export function createNhClientFontStore(source: unknown): NhClientFontStore {
  if (!source || typeof source !== "object") {
    return new Map();
  }

  const fonts = (source as Record<string, unknown>).fonts;
  if (!fonts || typeof fonts !== "object" || Array.isArray(fonts)) {
    return new Map();
  }

  const store = new Map<string, NhClientFontDefinition>();
  for (const [fallbackKey, rawFont] of Object.entries(fonts)) {
    const font = normalizeClientFontDefinition(rawFont, fallbackKey);
    if (font) {
      store.set(font.key, font);
    }
  }
  return store;
}

export function nhClientFontDefinition(
  fonts: NhClientFontStore,
  key: string
): NhClientFontDefinition | null {
  return fonts.get(key) ?? null;
}

export function nhClientFontDefinitionById(
  fonts: NhClientFontStore,
  fontId: number | null | undefined
): NhClientFontDefinition | null {
  if (!Number.isInteger(fontId)) {
    return null;
  }
  for (const font of fonts.values()) {
    if (font.fontId === fontId) {
      return font;
    }
  }
  return null;
}

export function nhClientFontStringWidth(font: NhClientFontDefinition, text: string | null | undefined): number {
  if (!text) {
    return 0;
  }

  let tagStart = -1;
  let previous = -1;
  let width = 0;

  for (let index = 0; index < text.length; index += 1) {
    let char = text[index];
    if (char === "<") {
      tagStart = index;
      continue;
    }

    if (char === ">" && tagStart !== -1) {
      const tag = text.slice(tagStart + 1, index);
      tagStart = -1;
      if (tag === "lt") {
        char = "<";
      } else if (tag === "gt") {
        char = ">";
      } else {
        if (tag.startsWith("img=")) {
          previous = -1;
        }
        continue;
      }
    }

    if (char.charCodeAt(0) === 160) {
      char = " ";
    }

    if (tagStart === -1) {
      const charCode = clientFontCharCode(char);
      width += font.advances[charCode] ?? 0;
      if (previous !== -1) {
        width += font.kerning.get(kerningKey(previous, charCode)) ?? 0;
      }
      previous = charCode;
    }
  }

  return width;
}

export function layoutNhClientFontGlyphs(
  font: NhClientFontDefinition,
  text: string | null | undefined
): readonly NhClientFontGlyphLayout[] {
  if (!text) {
    return [];
  }

  const glyphs: NhClientFontGlyphLayout[] = [];
  let tagStart = -1;
  let previous = -1;
  let x = 0;

  for (let index = 0; index < text.length; index += 1) {
    let char = text[index];
    if (char === "<") {
      tagStart = index;
      continue;
    }

    if (char === ">" && tagStart !== -1) {
      const tag = text.slice(tagStart + 1, index);
      tagStart = -1;
      if (tag === "lt") {
        char = "<";
      } else if (tag === "gt") {
        char = ">";
      } else {
        if (tag.startsWith("img=")) {
          previous = -1;
        }
        continue;
      }
    }

    if (char.charCodeAt(0) === 160) {
      char = " ";
    }

    if (tagStart === -1) {
      const charCode = clientFontCharCode(char);
      if (previous !== -1) {
        x += font.kerning.get(kerningKey(previous, charCode)) ?? 0;
      }

      const advance = font.advances[charCode] ?? 0;
      glyphs.push({ char, charCode, x, advance });
      x += advance;
      previous = charCode;
    }
  }

  return glyphs;
}

function normalizeClientFontDefinition(source: unknown, fallbackKey: string): NhClientFontDefinition | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const record = source as Record<string, unknown>;
  const key = stringField(record.key) ?? fallbackKey;
  const fontId = integerField(record.fontId);
  const fontArchiveName = stringField(record.fontArchiveName);
  const sheetId = stringField(record.sheetId);
  const ascent = integerField(record.ascent);
  const maxAscent = integerField(record.maxAscent);
  const maxDescent = integerField(record.maxDescent);
  const advances = integerArrayField(record.advances, 256);
  if (fontId === undefined || fontArchiveName === undefined || sheetId === undefined || ascent === undefined || !advances) {
    return null;
  }

  return {
    key,
    fontId,
    fontArchiveName,
    usage: stringField(record.usage) ?? "",
    sheetId,
    ascent,
    maxAscent: maxAscent ?? ascent,
    maxDescent: maxDescent ?? 0,
    advances,
    kerning: kerningMapField(record.kerningPairs)
  };
}

function integerArrayField(value: unknown, expectedLength: number): readonly number[] | null {
  if (!Array.isArray(value) || value.length !== expectedLength) {
    return null;
  }

  const integers = value.map((entry) => integerField(entry));
  return integers.every((entry): entry is number => entry !== undefined) ? integers : null;
}

function kerningMapField(value: unknown): ReadonlyMap<number, number> {
  const kerning = new Map<number, number>();
  if (!Array.isArray(value)) {
    return kerning;
  }

  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 3) {
      continue;
    }
    const previous = integerField(entry[0]);
    const current = integerField(entry[1]);
    const amount = integerField(entry[2]);
    if (previous !== undefined && current !== undefined && amount !== undefined) {
      kerning.set(kerningKey(previous & 255, current & 255), amount);
    }
  }
  return kerning;
}

function kerningKey(previous: number, current: number): number {
  return current + ((previous & 255) << 8);
}

function clientFontCharCode(char: string): number {
  const charCode = char.charCodeAt(0);
  return Number.isFinite(charCode) ? charCode & 255 : 0;
}

function integerField(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  return undefined;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
