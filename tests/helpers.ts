import { convertMarkdown, type ConvertMarkdownOptions } from "../src/processors/markdownProcessor.ts";
import { extensionOf } from "../src/processors/resourceProcessor.ts";
import { resolveReference, type VaultLookup } from "../src/resolvers/referenceResolver.ts";
import {
  DEFAULT_SETTINGS,
  type PluginSettings,
  type ResolvedResource,
  type ResourceReader,
} from "../src/types.ts";

export const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export function tinyPngBytes(): Uint8Array {
  return Uint8Array.from(Buffer.from(TINY_PNG_BASE64, "base64"));
}

export function pngDataUri(): string {
  return `data:image/png;base64,${TINY_PNG_BASE64}`;
}

export function memoryReader(
  files: Record<string, Uint8Array>,
  resolveLink?: VaultLookup["resolveLink"],
): { reader: ResourceReader; reads: Map<string, number> } {
  const reads = new Map<string, number>();
  const lookup: VaultLookup = {
    getFile(path) {
      if (!Object.hasOwn(files, path)) return null;
      return resourceFromPath(path);
    },
    resolveLink: resolveLink ?? (() => null),
  };

  return {
    reads,
    reader: {
      resolve(request) {
        return resolveReference(lookup, request);
      },
      async read(resource) {
        reads.set(resource.path, (reads.get(resource.path) ?? 0) + 1);
        const bytes = files[resource.path];
        if (!bytes) throw new Error(`No se puede leer ${resource.path}`);
        return bytes;
      },
    },
  };
}

export async function convertFixture(
  markdown: string,
  files: Record<string, Uint8Array> = {},
  settings: Partial<PluginSettings> = {},
  extra: Partial<Omit<ConvertMarkdownOptions, "markdown" | "settings" | "reader">> = {},
  resolveLink?: VaultLookup["resolveLink"],
) {
  const { reader, reads } = memoryReader(files, resolveLink);
  const result = await convertMarkdown({
    markdown,
    sourcePath: "nota.md",
    settings: { ...DEFAULT_SETTINGS, ...settings },
    reader,
    ...extra,
  });
  return { ...result, reads };
}

function resourceFromPath(path: string): ResolvedResource {
  const name = path.split("/").pop() ?? path;
  return {
    key: path,
    path,
    name,
    extension: extensionOf(name),
  };
}
