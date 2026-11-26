import { FileSystemAdapter, TFile, normalizePath, type App } from "obsidian";
import { resolveReference, type VaultLookup } from "./referenceResolver.ts";
import type { ResolvedResource, ResourceReader } from "../types.ts";

export function createVaultLookup(app: App): VaultLookup {
  return {
    getFile(path) {
      return fileAt(app, path);
    },
    resolveLink(linkPath, sourcePath) {
      const file = app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
      return file ? toResource(file) : null;
    },
  };
}

export function createVaultResourceReader(app: App): ResourceReader {
  const lookup = createVaultLookup(app);
  return {
    resolve(request) {
      return resolveReference(lookup, request);
    },
    async read(resource) {
      const file = app.vault.getAbstractFileByPath(normalizePath(resource.path));
      if (!(file instanceof TFile)) {
        throw new Error(`No se encontró «${resource.path}».`);
      }
      const buffer = await app.vault.readBinary(file);
      return new Uint8Array(buffer);
    },
  };
}

export function vaultBasePath(app: App): string | null {
  const adapter = app.vault.adapter;
  if (adapter instanceof FileSystemAdapter) return adapter.getBasePath();
  return null;
}

function fileAt(app: App, path: string): ResolvedResource | null {
  const abstract = app.vault.getAbstractFileByPath(normalizePath(path));
  if (!(abstract instanceof TFile)) return null;
  return toResource(abstract);
}

function toResource(file: TFile): ResolvedResource {
  return {
    key: file.path,
    path: file.path,
    name: file.name,
    extension: file.extension.toLowerCase(),
  };
}
