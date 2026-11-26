import { isSameVaultPath, normalizeVaultPath } from "../vaultPath.ts";

export function buildExportFileName(pattern: string, noteName: string, now: Date): string {
  const effective = pattern.trim() || "{{noteName}}";
  const withTokens = effective
    .replaceAll("{{noteName}}", noteName)
    .replaceAll("{{date}}", formatLocalDate(now))
    .replaceAll("{{time}}", formatLocalTime(now));
  const sanitized = sanitizeFileName(withTokens);
  return ensureMarkdownExtension(sanitized || "nota");
}

export function sanitizeFileName(value: string): string {
  const cleaned = Array.from(value, (character) => {
    const code = character.charCodeAt(0);
    if (code <= 31 || code === 127 || "<>:\"/\\|?*".includes(character)) return " ";
    return character;
  }).join("");

  return cleaned
    .replaceAll(/\s+/g, " ")
    .trim()
    .replaceAll(/^[. ]+/g, "")
    .replaceAll(/[. ]+$/g, "");
}

export function ensureMarkdownExtension(fileName: string): string {
  return fileName.toLowerCase().endsWith(".md") ? fileName : `${fileName}.md`;
}

export function vaultFilePath(folder: string, fileName: string): string | null {
  const safeName = ensureMarkdownExtension(sanitizeFileName(fileName) || "nota");
  const directory = folder.trim() ? normalizeVaultPath(folder) : "";
  if (directory === null) return null;
  return directory ? `${directory}/${safeName}` : safeName;
}

export function refusesSourceOverwrite(destination: string, sourcePath: string): boolean {
  return isSameVaultPath(destination, sourcePath);
}

export async function firstFreeFileName(
  fileName: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const normalized = ensureMarkdownExtension(sanitizeFileName(fileName) || "nota");
  if (!(await exists(normalized))) return normalized;

  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = suffixedFileName(normalized, suffix);
    if (!(await exists(candidate))) return candidate;
  }

  throw new Error("No se encontró un nombre libre para el archivo.");
}

export function suffixedFileName(fileName: string, suffix: number): string {
  const markdown = ensureMarkdownExtension(fileName);
  return `${markdown.slice(0, -3)}-${suffix}.md`;
}

export function splitFilePath(filePath: string): { directory: string; fileName: string } {
  const slash = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  if (slash < 0) return { directory: "", fileName: filePath };
  return { directory: filePath.slice(0, slash), fileName: filePath.slice(slash + 1) };
}

export function joinFilePath(directory: string, name: string): string {
  if (!directory) return name;
  const separator = directory.includes("\\") && !directory.includes("/") ? "\\" : "/";
  return `${directory.replace(/[\\/]+$/, "")}${separator}${name}`;
}

export function resolveFromBase(base: string, relativePath: string): string {
  const child = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
  return joinFilePath(base, child);
}

export function defaultSystemPath(vaultBasePath: string | null, folder: string, fileName: string): string {
  const safeName = ensureMarkdownExtension(sanitizeFileName(fileName) || "nota");
  if (!vaultBasePath) return safeName;

  const directory = folder.trim() ? normalizeVaultPath(folder) : "";
  if (directory === null) return safeName;

  const base = vaultBasePath.replace(/[\\/]+$/, "");
  return directory ? `${base}/${directory}/${safeName}` : `${base}/${safeName}`;
}

function formatLocalDate(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

function formatLocalTime(now: Date): string {
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  return `${hours}${minutes}`;
}
