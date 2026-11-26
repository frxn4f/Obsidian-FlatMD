import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bytesToMegabytes, megabytesToBytes, mergeSettings } from "../src/settings/settings.ts";
import { DEFAULT_SETTINGS, MEGABYTE } from "../src/types.ts";

describe("settings", () => {
  it("fills missing and invalid values with the defaults", () => {
    const settings = mergeSettings({
      exportFolder: "exportaciones",
      maxImageBytes: -1,
      missingResourceBehavior: "otro",
      convertImages: false,
    });

    assert.equal(settings.exportFolder, "exportaciones");
    assert.equal(settings.maxImageBytes, DEFAULT_SETTINGS.maxImageBytes);
    assert.equal(settings.missingResourceBehavior, "keep");
    assert.equal(settings.convertImages, false);
    assert.equal(settings.preserveExternalReferences, true);
    assert.equal(settings.exportFileNamePattern, "{{noteName}}");
  });

  it("accepts zero as a disabled limit and a comma as a decimal separator", () => {
    assert.equal(megabytesToBytes(""), 0);
    assert.equal(megabytesToBytes("0"), 0);
    assert.equal(megabytesToBytes("0,5"), Math.round(0.5 * MEGABYTE));
    assert.equal(megabytesToBytes("no"), null);
    assert.equal(bytesToMegabytes(0), "0");
    assert.equal(bytesToMegabytes(8 * MEGABYTE), "8");
    assert.equal(bytesToMegabytes(Math.round(0.5 * MEGABYTE)), "0.5");
  });
});
