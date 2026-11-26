import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  candidatePaths,
  classifyReference,
  resolveReference,
  type VaultLookup,
} from "../src/resolvers/referenceResolver.ts";
import type { ResolvedResource } from "../src/types.ts";
import { normalizeVaultPath } from "../src/vaultPath.ts";

function resource(path: string): ResolvedResource {
  const name = path.split("/").pop() ?? path;
  const extension = name.split(".").pop()?.toLowerCase() ?? "";
  return { key: path, path, name, extension };
}

function lookup(files: string[], link?: (linkPath: string, sourcePath: string) => string | null): VaultLookup {
  const known = new Set(files);
  return {
    getFile(path) {
      return known.has(path) ? resource(path) : null;
    },
    resolveLink(linkPath, sourcePath) {
      const found = link?.(linkPath, sourcePath);
      return found ? resource(found) : null;
    },
  };
}

describe("candidatePaths", () => {
  it("resolves a relative path, a vault-root path and a URL-encoded name", () => {
    assert.deepEqual(candidatePaths("notas/nota.md", "../adjuntos/mi%20foto.png"), [
      "adjuntos/mi foto.png",
      "adjuntos/mi%20foto.png",
    ]);
    assert.deepEqual(candidatePaths("notas/nota.md", "foto.png"), ["notas/foto.png", "foto.png"]);
    assert.deepEqual(candidatePaths("notas/nota.md", "/adjuntos/foto.png"), ["adjuntos/foto.png"]);
  });

  it("drops paths that leave the vault and external URLs", () => {
    assert.deepEqual(candidatePaths("notas/nota.md", "../../../../etc/passwd"), []);
    assert.deepEqual(candidatePaths("notas/nota.md", "https://example.com/a.png"), []);
    assert.deepEqual(candidatePaths("notas/nota.md", "file:///etc/passwd"), []);
  });

  it("keeps a hash that belongs to the file name and strips a fragment", () => {
    assert.deepEqual(candidatePaths("nota.md", "my%23photo.png"), ["my#photo.png", "my%23photo.png"]);
    assert.deepEqual(candidatePaths("nota.md", "foto.png#recorte"), ["foto.png"]);
  });
});

describe("resolveReference", () => {
  it("uses Obsidian's link resolver for wiki embeds before plain paths", () => {
    const files = lookup(["otras/foto.png", "notas/foto.png"], (linkPath) => {
      return linkPath === "foto.png" ? "otras/foto.png" : null;
    });

    const resolved = resolveReference(files, {
      kind: "wiki",
      reference: "foto.png",
      sourcePath: "notas/nota.md",
    });
    assert.equal(resolved?.path, "otras/foto.png");
  });

  it("does not guess another folder for a markdown path that does not exist", () => {
    const files = lookup(["otras/foto.png"]);
    const resolved = resolveReference(files, {
      kind: "markdown",
      reference: "foto.png",
      sourcePath: "notas/nota.md",
    });
    assert.equal(resolved, null);
  });

  it("resolves a markdown path with spaces from the note and from the vault root", () => {
    const files = lookup(["adjuntos/mi foto.png"]);
    const resolved = resolveReference(files, {
      kind: "markdown",
      reference: "/adjuntos/mi%20foto.png",
      sourcePath: "notas/nota.md",
    });
    assert.equal(resolved?.path, "adjuntos/mi foto.png");
  });
});

describe("classifyReference", () => {
  it("separates remote URLs, data URIs and other schemes", () => {
    assert.equal(classifyReference("https://example.com/a.png"), "remote");
    assert.equal(classifyReference("//cdn.example/a.png"), "remote");
    assert.equal(classifyReference("data:image/png;base64,aaaa"), "data");
    assert.equal(classifyReference("file:///tmp/a.png"), "unsupported-scheme");
    assert.equal(classifyReference("adjuntos/a.png"), "local");
  });
});

describe("normalizeVaultPath", () => {
  it("stays inside the vault", () => {
    assert.equal(normalizeVaultPath("exportaciones/../exportaciones"), "exportaciones");
    assert.equal(normalizeVaultPath("/exportaciones"), "exportaciones");
    assert.equal(normalizeVaultPath("../fuera"), null);
    assert.equal(normalizeVaultPath("C:/Users/Fran/nota.md"), null);
    assert.equal(normalizeVaultPath("//servidor/carpeta"), null);
  });
});
