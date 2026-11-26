import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildExportFileName,
  defaultSystemPath,
  firstFreeFileName,
  refusesSourceOverwrite,
  vaultFilePath,
} from "../src/managers/exportPaths.ts";

describe("export paths", () => {
  it("builds a file name from the note, the local date and the local time", () => {
    const now = new Date(2026, 10, 26, 9, 5);
    assert.equal(buildExportFileName("{{noteName}}-{{date}}-{{time}}", "Apuntes de física", now), "Apuntes de física-2026-11-26-0905.md");
    assert.equal(buildExportFileName("", "Nota", now), "Nota.md");
    assert.equal(buildExportFileName("{{noteName}}", "A/B:C*", now), "A B C.md");
    assert.equal(buildExportFileName("{{noteName}}", ".env", now), "env.md");
    assert.equal(buildExportFileName("{{noteName}}", "", now), "nota.md");
  });

  it("builds a vault path and refuses to replace the open note", () => {
    assert.equal(vaultFilePath("exportaciones", "Nota"), "exportaciones/Nota.md");
    assert.equal(vaultFilePath("", "Nota.md"), "Nota.md");
    assert.equal(vaultFilePath("../fuera", "Nota"), null);
    assert.equal(refusesSourceOverwrite("carpeta/Nota.md", "carpeta/nota.md"), true);
    assert.equal(refusesSourceOverwrite("carpeta/Otra.md", "carpeta/nota.md"), false);
  });

  it("chooses the next free name", async () => {
    const taken = new Set(["nota.md", "nota-2.md"]);
    const free = await firstFreeFileName("nota.md", async (candidate) => taken.has(candidate));
    assert.equal(free, "nota-3.md");
  });

  it("places the system dialog next to the vault folder", () => {
    assert.equal(
      defaultSystemPath("/vault", "exportaciones", "Nota"),
      "/vault/exportaciones/Nota.md",
    );
    assert.equal(defaultSystemPath(null, "exportaciones", "Nota"), "Nota.md");
  });
});
