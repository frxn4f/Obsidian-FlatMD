import { literalExtension } from "../processors/resourceProcessor.ts";
import type { ResolvedResource, ResolveRequest } from "../types.ts";
import { normalizeVaultPath, parentDirectory } from "../vaultPath.ts";

export interface VaultLookup {
  getFile(path: string): ResolvedResource | null;
  resolveLink(linkPath: string, sourcePath: string): ResolvedResource | null;
}

export type ReferenceClass = "data" | "remote" | "unsupported-scheme" | "local";

export function classifyReference(reference: string): ReferenceClass {
  const value = reference.trim();
  if (/^data:/i.test(value)) return "data";
  if (value.startsWith("//") || /^https?:/i.test(value)) return "remote";
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "unsupported-scheme";
  return "local";
}

/**
 * Paths that climb above the vault are dropped. Notes must not be able to
 * address files outside the vault, including file:// URLs.
 */
export function candidatePaths(sourcePath: string, reference: string): string[] {
  const stripped = stripFragmentAndQuery(reference.trim());
  if (!stripped || classifyReference(stripped) !== "local") return [];

  const paths: string[] = [];
  for (const variant of decodeVariants(stripped)) {
    const fromVaultRoot = variant.startsWith("/");
    const rooted = normalizeVaultPath(variant.replace(/^\/+/, ""));
    const relative = fromVaultRoot
      ? null
      : normalizeVaultPath(joinRelative(parentDirectory(sourcePath), variant));

    if (fromVaultRoot) {
      if (rooted) paths.push(rooted);
      continue;
    }
    if (relative) paths.push(relative);
    if (rooted && rooted !== relative) paths.push(rooted);
  }

  return unique(paths);
}

export function resolveReference(
  lookup: VaultLookup,
  request: ResolveRequest,
): ResolvedResource | null {
  const reference = stripFragmentAndQuery(request.reference.trim());
  if (!reference || classifyReference(reference) !== "local") return null;

  if (request.kind === "wiki") {
    for (const variant of decodeVariants(reference)) {
      const linked = lookup.resolveLink(variant, request.sourcePath);
      if (linked) return linked;
    }
  }

  for (const candidate of candidatePaths(request.sourcePath, reference)) {
    const file = lookup.getFile(candidate);
    if (file) return file;
  }

  return null;
}

export function stripFragmentAndQuery(reference: string): string {
  const withoutQuery = cutAt(reference, "?");
  const hash = withoutQuery.indexOf("#");
  if (hash === -1) return withoutQuery;

  const segment = withoutQuery.split("/").pop() ?? withoutQuery;
  // `my#photo.png` keeps the hash: the extension comes after it.
  // `foto.png#recorte` drops the fragment: the hash is not part of the extension.
  if (literalExtension(segment)) return withoutQuery;
  return withoutQuery.slice(0, hash);
}

function decodeVariants(value: string): string[] {
  try {
    const decoded = decodeURIComponent(value);
    return decoded === value ? [value] : [decoded, value];
  } catch {
    return [value];
  }
}

function joinRelative(directory: string, reference: string): string {
  if (!directory) return reference;
  return `${directory}/${reference}`;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function cutAt(value: string, separator: string): string {
  const index = value.indexOf(separator);
  return index === -1 ? value : value.slice(0, index);
}
