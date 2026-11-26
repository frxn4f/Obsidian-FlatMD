const WINDOWS_DRIVE = /^[a-zA-Z]:/;

/**
 * Normalizes a vault-relative path.
 * Returns an empty string for an empty path, and null when the path leaves the vault.
 */
export function normalizeVaultPath(value: string): string | null {
  const unified = value.trim().replaceAll("\\", "/");
  if (!unified) return "";
  if (WINDOWS_DRIVE.test(unified) || unified.startsWith("//")) return null;

  const parts: string[] = [];
  for (const part of unified.split("/")) {
    const segment = part.trim();
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    if (WINDOWS_DRIVE.test(segment)) return null;
    parts.push(segment);
  }

  return parts.join("/");
}

export function parentDirectory(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return "";
  return normalized.slice(0, index);
}

export function isSameVaultPath(left: string, right: string): boolean {
  const normalizedLeft = normalizeVaultPath(left);
  const normalizedRight = normalizeVaultPath(right);
  if (!normalizedLeft || !normalizedRight) return false;
  // Case-insensitive so a different capitalization cannot overwrite the open note on Windows.
  return normalizedLeft.toLowerCase() === normalizedRight.toLowerCase();
}
