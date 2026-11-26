import { DEFAULT_SETTINGS, MEGABYTE, type PluginSettings } from "../types.ts";

export function mergeSettings(saved: unknown): PluginSettings {
  const record = isRecord(saved) ? saved : {};
  return {
    exportFolder: readString(record.exportFolder, DEFAULT_SETTINGS.exportFolder),
    exportFileNamePattern: readPattern(record.exportFileNamePattern),
    maxImageBytes: readBytes(record.maxImageBytes, DEFAULT_SETTINGS.maxImageBytes),
    maxDocumentBytes: readBytes(record.maxDocumentBytes, DEFAULT_SETTINGS.maxDocumentBytes),
    missingResourceBehavior: record.missingResourceBehavior === "placeholder" ? "placeholder" : "keep",
    showSummaryNotice: readBoolean(record.showSummaryNotice, DEFAULT_SETTINGS.showSummaryNotice),
    convertImages: readBoolean(record.convertImages, DEFAULT_SETTINGS.convertImages),
    preserveExternalReferences: readBoolean(
      record.preserveExternalReferences,
      DEFAULT_SETTINGS.preserveExternalReferences,
    ),
  };
}

export function bytesToMegabytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0";
  const value = bytes / MEGABYTE;
  const [whole, fraction] = value.toFixed(2).split(".");
  const trimmed = (fraction ?? "").replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : (whole ?? "0");
}

export function megabytesToBytes(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (!normalized) return 0;

  const value = Number(normalized);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * MEGABYTE);
}

function readPattern(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return DEFAULT_SETTINGS.exportFileNamePattern;
  return value;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function readBytes(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return fallback;
  return Math.round(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
