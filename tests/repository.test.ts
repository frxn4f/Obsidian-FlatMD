import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";

const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;

describe("repositorio", () => {
  it("mantiene alineadas las versiones publicables", () => {
    const pkg = readJson("package.json");
    const manifest = readJson("manifest.json");
    const versions = readJson("versions.json");
    const changelog = readFileSync("CHANGELOG.md", "utf8");
    const version = String(pkg.version);

    assert.equal(manifest.version, version);
    assert.equal(versions[version], manifest.minAppVersion);
    assert.match(changelog, new RegExp(`## ${version.replaceAll(".", "\\.")}`));
    assert.equal(manifest.id, "self-contained-markdown-exporter");
    assert.equal(manifest.name, "Self-Contained Markdown Exporter");
    assert.equal(manifest.isDesktopOnly, false);
    assert.equal(pkg.private, true);
  });

  it("incluye los archivos necesarios para clonar y comprobar el proyecto", () => {
    const expected = [
      "README.md",
      "CONTRIBUTING.md",
      "CHANGELOG.md",
      "manifest.json",
      "versions.json",
      "package-lock.json",
      "tsconfig.json",
      "eslint.config.mjs",
      "esbuild.config.mjs",
      ".gitignore",
      ".editorconfig",
      ".github/workflows/ci.yml",
    ];

    for (const path of expected) {
      assert.equal(existsSync(path), true, path);
    }

    const ignore = readFileSync(".gitignore", "utf8");
    assert.match(ignore, /^node_modules\/$/m);
    assert.match(ignore, /^main\.js$/m);

    const readme = readFileSync("README.md", "utf8");
    assert.match(readme, /obsidian-flatmd/);
    assert.match(readme, /self-contained-markdown-exporter/);
  });
});
