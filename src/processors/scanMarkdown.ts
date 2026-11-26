import type { TextSpan } from "../types.ts";

export interface DirectImage {
  kind: "wiki" | "markdown";
  span: TextSpan;
  raw: string;
  target: string;
  alt: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
}

export interface ReferenceImage {
  kind: "reference";
  span: TextSpan;
  raw: string;
  label: string;
  alt: string;
  width: number | null;
  height: number | null;
}

export interface ImageDefinition {
  label: string;
  destination: string;
  title: string | null;
  span: TextSpan;
  destinationSpan: TextSpan;
}

export type ImageOccurrence = DirectImage | ReferenceImage;

export interface ScanResult {
  occurrences: ImageOccurrence[];
  definitions: ImageDefinition[];
}

interface Range {
  start: number;
  end: number;
}

const SIZE_PATTERN = /^(0*[1-9]\d*)(?:x(0*[1-9]\d*))?$/;

export function scanMarkdown(markdown: string): ScanResult {
  if (!markdown.includes("![")) {
    return { occurrences: [], definitions: [] };
  }

  const protectedRanges = findProtectedRanges(markdown);
  const definitions = findDefinitions(markdown, protectedRanges);
  const occurrences = findOccurrences(markdown, protectedRanges, definitions);
  return { occurrences, definitions };
}

export function normalizeReferenceLabel(label: string): string {
  return label.trim().replaceAll(/\s+/g, " ").toLowerCase();
}

export function parseSize(value: string): { width: number; height: number | null } | null {
  const match = SIZE_PATTERN.exec(value.trim());
  const widthText = match?.[1];
  if (!widthText) return null;

  const width = Number(widthText);
  const height = match[2] ? Number(match[2]) : null;
  if (!Number.isSafeInteger(width) || width <= 0) return null;
  if (height !== null && (!Number.isSafeInteger(height) || height <= 0)) return null;
  return { width, height };
}

function findOccurrences(
  markdown: string,
  protectedRanges: Range[],
  definitions: ImageDefinition[],
): ImageOccurrence[] {
  const definitionsByLabel = new Map(definitions.map((definition) => [definition.label, definition]));
  const occurrences: ImageOccurrence[] = [];

  let index = 0;
  while (index < markdown.length) {
    const protectedRange = rangeContaining(protectedRanges, index);
    if (protectedRange) {
      index = protectedRange.end;
      continue;
    }

    if (!markdown.startsWith("![", index) || isEscaped(markdown, index)) {
      index += 1;
      continue;
    }

    // Ambiguous syntax is left untouched instead of consuming the rest of the line.
    const occurrence = parseOccurrence(markdown, index, definitionsByLabel);
    if (!occurrence) {
      index += 1;
      continue;
    }

    occurrences.push(occurrence);
    index = occurrence.span.end;
  }

  return occurrences;
}

function parseOccurrence(
  markdown: string,
  index: number,
  definitions: Map<string, ImageDefinition>,
): ImageOccurrence | null {
  if (markdown.startsWith("![[", index)) return parseWiki(markdown, index);
  return parseMarkdownImage(markdown, index, definitions);
}

function parseWiki(markdown: string, index: number): DirectImage | null {
  const lineBreak = indexOfLineBreak(markdown, index);
  const close = markdown.indexOf("]]", index + 3);
  if (close === -1 || (lineBreak !== -1 && close > lineBreak)) return null;

  const parsed = parseWikiInner(markdown.slice(index + 3, close));
  if (!parsed) return null;

  const end = close + 2;
  return {
    kind: "wiki",
    span: { start: index, end },
    raw: markdown.slice(index, end),
    target: parsed.target,
    alt: parsed.alt,
    title: null,
    width: parsed.width,
    height: parsed.height,
  };
}

function parseWikiInner(inner: string): {
  target: string;
  alt: string | null;
  width: number | null;
  height: number | null;
} | null {
  const parts = inner.trim().split("|");
  const target = parts[0]?.trim() ?? "";
  if (!target) return null;

  let width: number | null = null;
  let height: number | null = null;
  const altParts: string[] = [];

  for (const part of parts.slice(1)) {
    const text = part.trim();
    if (!text) continue;
    const size = parseSize(text);
    if (size) {
      width = size.width;
      height = size.height;
    } else {
      altParts.push(text);
    }
  }

  return {
    target,
    alt: altParts.length > 0 ? altParts.join("|") : null,
    width,
    height,
  };
}

function parseMarkdownImage(
  markdown: string,
  index: number,
  definitions: Map<string, ImageDefinition>,
): ImageOccurrence | null {
  const alt = readBracket(markdown, index + 1);
  if (!alt) return null;

  if (markdown[alt.end] === "(") {
    const destination = readDestination(markdown, alt.end);
    if (!destination || !destination.destination.trim()) return null;

    const path = splitSizeSuffix(unescapeMarkdown(destination.destination.trim()));
    const sizedAlt = splitSizeSuffix(alt.content);
    const end = destination.end;
    return {
      kind: "markdown",
      span: { start: index, end },
      raw: markdown.slice(index, end),
      target: path.text.trim(),
      alt: sizedAlt.text.trim(),
      title: destination.title,
      width: path.width ?? sizedAlt.width,
      height: path.height ?? sizedAlt.height,
    };
  }

  if (markdown[alt.end] === "[") {
    const label = readBracket(markdown, alt.end);
    if (!label) return null;
    const sizedAlt = splitSizeSuffix(alt.content);
    const explicitLabel = label.content.trim();
    const resolved = explicitLabel
      ? {
          label: normalizeReferenceLabel(explicitLabel),
          alt: sizedAlt.text.trim(),
          width: sizedAlt.width,
          height: sizedAlt.height,
        }
      : matchDefinedLabel(alt.content, definitions);
    if (!resolved?.label) return null;

    const end = label.end;
    return {
      kind: "reference",
      span: { start: index, end },
      raw: markdown.slice(index, end),
      label: resolved.label,
      alt: resolved.alt,
      width: resolved.width,
      height: resolved.height,
    };
  }

  const shortcut = matchDefinedLabel(alt.content, definitions);
  if (!shortcut?.label) return null;
  return {
    kind: "reference",
    span: { start: index, end: alt.end },
    raw: markdown.slice(index, alt.end),
    label: shortcut.label,
    alt: shortcut.alt,
    width: shortcut.width,
    height: shortcut.height,
  };
}

function matchDefinedLabel(
  altContent: string,
  definitions: Map<string, ImageDefinition>,
): { label: string; alt: string; width: number | null; height: number | null } | null {
  const exact = normalizeReferenceLabel(altContent);
  if (exact && definitions.has(exact)) {
    return { label: exact, alt: altContent.trim(), width: null, height: null };
  }

  const sized = splitSizeSuffix(altContent);
  const stripped = normalizeReferenceLabel(sized.text);
  if (sized.width && stripped && definitions.has(stripped)) {
    return { label: stripped, alt: sized.text.trim(), width: sized.width, height: sized.height };
  }

  return null;
}

function splitSizeSuffix(value: string): { text: string; width: number | null; height: number | null } {
  const pipe = value.lastIndexOf("|");
  if (pipe === -1) return { text: value, width: null, height: null };

  const size = parseSize(value.slice(pipe + 1));
  if (!size) return { text: value, width: null, height: null };
  return { text: value.slice(0, pipe), width: size.width, height: size.height };
}

function readDestination(
  markdown: string,
  openIndex: number,
): { destination: string; title: string | null; end: number } | null {
  const close = findClosingParen(markdown, openIndex);
  if (close === -1) return null;

  const inside = markdown.slice(openIndex + 1, close).trim();
  if (!inside) return null;

  if (inside.startsWith("<")) {
    const angleEnd = inside.indexOf(">");
    if (angleEnd === -1) return null;
    const destination = inside.slice(1, angleEnd).trim();
    const title = readTitle(inside.slice(angleEnd + 1).trim());
    if (!destination) return null;
    return { destination, title, end: close + 1 };
  }

  const titleMatch = /\s+["'(]/.exec(inside);
  if (!titleMatch || titleMatch.index === undefined) {
    return { destination: inside, title: null, end: close + 1 };
  }

  const title = readTitle(inside.slice(titleMatch.index).trim());
  if (title === null) return { destination: inside, title: null, end: close + 1 };
  return {
    destination: inside.slice(0, titleMatch.index).trim(),
    title,
    end: close + 1,
  };
}

function findClosingParen(markdown: string, openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < markdown.length; index += 1) {
    const char = markdown[index];
    if (char === "\n") return -1;
    if (char === "\\") {
      index += 1;
      continue;
    }
    if (char === "(") depth += 1;
    if (char === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function readBracket(markdown: string, openIndex: number): { content: string; end: number } | null {
  if (markdown[openIndex] !== "[") return null;

  let content = "";
  for (let index = openIndex + 1; index < markdown.length; index += 1) {
    const char = markdown[index];
    if (char === undefined || char === "\n" || char === "[") return null;
    if (char === "\\") {
      const next = markdown[index + 1];
      if (next === undefined) return null;
      content += next;
      index += 1;
      continue;
    }
    if (char === "]") return { content, end: index + 1 };
    content += char;
  }

  return null;
}

function readTitle(value: string): string | null {
  if (value.length < 2) return null;
  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
    return value.slice(1, -1);
  }
  if (value.startsWith("(") && value.endsWith(")") && !value.slice(1, -1).includes(")")) {
    return value.slice(1, -1);
  }
  return null;
}

function unescapeMarkdown(value: string): string {
  return value.replaceAll(/\\([\\!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~])/g, "$1");
}

function findDefinitions(markdown: string, protectedRanges: Range[]): ImageDefinition[] {
  const definitions: ImageDefinition[] = [];
  const seen = new Set<string>();
  let blockBoundary = true;

  forEachLine(markdown, (line, lineStart) => {
    const inProtected = rangeContaining(protectedRanges, lineStart) !== null;
    if (inProtected || line.trim() === "") {
      blockBoundary = true;
      return;
    }
    if (!blockBoundary) return;

    const definition = parseDefinitionLine(line, lineStart);
    if (!definition || seen.has(definition.label)) {
      blockBoundary = false;
      return;
    }

    definitions.push(definition);
    seen.add(definition.label);
    blockBoundary = true;
  });

  return definitions;
}

function parseDefinitionLine(line: string, lineStart: number): ImageDefinition | null {
  const opener = /^[ ]{0,3}\[([^\]]+)\]:[ \t]*/.exec(line);
  const rawLabel = opener?.[1];
  if (!opener || rawLabel === undefined) return null;

  const label = normalizeReferenceLabel(rawLabel);
  if (!label) return null;

  let cursor = opener[0].length;
  if (cursor >= line.length) return null;

  let destination = "";
  let destinationStart = cursor;
  let destinationEnd = cursor;

  if (line[cursor] === "<") {
    const close = line.indexOf(">", cursor + 1);
    if (close === -1) return null;
    destination = line.slice(cursor + 1, close).trim();
    destinationStart = cursor;
    destinationEnd = close + 1;
    cursor = close + 1;
  } else {
    const relative = line.slice(cursor);
    const titleMatch = /\s+["'(]/.exec(relative);
    if (titleMatch && titleMatch.index !== undefined && readTitle(relative.slice(titleMatch.index).trim()) !== null) {
      destination = relative.slice(0, titleMatch.index).trimEnd();
      destinationStart = cursor;
      destinationEnd = cursor + destination.length;
      cursor += titleMatch.index;
    } else {
      destination = relative.trimEnd();
      destinationStart = cursor;
      destinationEnd = cursor + destination.length;
      cursor = line.length;
    }
  }

  if (!destination.trim()) return null;
  const title = readTitle(line.slice(cursor).trim());

  return {
    label,
    destination: unescapeMarkdown(destination.trim()),
    title,
    span: { start: lineStart, end: lineStart + line.length },
    destinationSpan: {
      start: lineStart + destinationStart,
      end: lineStart + destinationEnd,
    },
  };
}

function findProtectedRanges(markdown: string): Range[] {
  const ranges: Range[] = [];
  const frontmatter = findFrontmatter(markdown);
  if (frontmatter) ranges.push(frontmatter);
  ranges.push(...findFencedCode(markdown, ranges));
  ranges.push(...findHtmlComments(markdown, ranges));
  ranges.push(...findInlineCode(markdown, ranges));
  return ranges;
}

function findFrontmatter(markdown: string): Range | null {
  const opening = /^---[ \t]*\r?\n/.exec(markdown);
  if (!opening) return null;

  const rest = markdown.slice(opening[0].length);
  const closing = /\r?\n---[ \t]*(?:\r?\n|$)/.exec(rest);
  if (!closing || closing.index === undefined) return null;
  return { start: 0, end: opening[0].length + closing.index + closing[0].length };
}

function findFencedCode(markdown: string, existing: Range[]): Range[] {
  const ranges: Range[] = [];
  const fenceState: { open: { char: "`" | "~"; length: number; start: number } | null } = { open: null };

  forEachLine(markdown, (line, lineStart) => {
    if (rangeContaining(existing, lineStart)) return;

    const fence = parseFence(line);
    if (!fence) return;

    const open = fenceState.open;
    if (!open && fence.opens) {
      fenceState.open = { char: fence.char, length: fence.length, start: lineStart };
      return;
    }

    if (open && fence.closes && fence.char === open.char && fence.length >= open.length) {
      const contentEnd = lineStart + line.length;
      ranges.push({ start: open.start, end: nextLineStart(markdown, contentEnd) });
      fenceState.open = null;
    }
  });

  const unclosed = fenceState.open;
  if (unclosed) ranges.push({ start: unclosed.start, end: markdown.length });
  return ranges;
}

function parseFence(line: string): { char: "`" | "~"; length: number; opens: boolean; closes: boolean } | null {
  const match = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
  const token = match?.[2];
  if (!token) return null;

  const rest = match[3] ?? "";
  const char = token.startsWith("~") ? "~" : "`";
  return {
    char,
    length: token.length,
    opens: char === "`" ? !rest.includes("`") : true,
    closes: rest.trim() === "",
  };
}

function findHtmlComments(markdown: string, existing: Range[]): Range[] {
  const ranges: Range[] = [];
  let searchFrom = 0;

  while (searchFrom < markdown.length) {
    const start = markdown.indexOf("<!--", searchFrom);
    if (start === -1) break;
    if (rangeContaining(existing, start)) {
      searchFrom = start + 4;
      continue;
    }

    const end = markdown.indexOf("-->", start + 4);
    if (end === -1) break;
    ranges.push({ start, end: end + 3 });
    searchFrom = end + 3;
  }

  return ranges;
}

function findInlineCode(markdown: string, existing: Range[]): Range[] {
  const ranges: Range[] = [];
  let index = 0;

  while (index < markdown.length) {
    const blocked = rangeContaining([...existing, ...ranges], index);
    if (blocked) {
      index = blocked.end;
      continue;
    }

    if (markdown[index] !== "`") {
      index += 1;
      continue;
    }

    let length = 0;
    while (markdown[index + length] === "`") length += 1;
    const close = findClosingBackticks(markdown, index + length, length);
    if (close === -1) {
      index += length;
      continue;
    }

    ranges.push({ start: index, end: close + length });
    index = close + length;
  }

  return ranges;
}

function findClosingBackticks(markdown: string, from: number, length: number): number {
  let index = from;
  while (index < markdown.length) {
    if (markdown[index] !== "`") {
      index += 1;
      continue;
    }

    let run = 0;
    while (markdown[index + run] === "`") run += 1;
    if (run === length) return index;
    index += run;
  }
  return -1;
}

function rangeContaining(ranges: Range[], index: number): Range | null {
  for (const range of ranges) {
    if (index >= range.start && index < range.end) return range;
  }
  return null;
}

function forEachLine(markdown: string, visit: (line: string, start: number) => void): void {
  let lineStart = 0;
  while (lineStart < markdown.length) {
    const contentEnd = lineContentEnd(markdown, lineStart);
    visit(markdown.slice(lineStart, contentEnd), lineStart);
    const next = nextLineStart(markdown, contentEnd);
    if (next <= lineStart) return;
    lineStart = next;
  }
}

function lineContentEnd(markdown: string, lineStart: number): number {
  const newline = markdown.indexOf("\n", lineStart);
  if (newline === -1) return markdown.length;
  return markdown[newline - 1] === "\r" ? newline - 1 : newline;
}

function nextLineStart(markdown: string, contentEnd: number): number {
  if (contentEnd >= markdown.length) return markdown.length;
  if (markdown[contentEnd] === "\r" && markdown[contentEnd + 1] === "\n") return contentEnd + 2;
  if (markdown[contentEnd] === "\n") return contentEnd + 1;
  return markdown.length;
}

function indexOfLineBreak(markdown: string, from: number): number {
  const newline = markdown.indexOf("\n", from);
  return newline;
}

function isEscaped(markdown: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && markdown[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}
