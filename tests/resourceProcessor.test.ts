import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDataUri,
  encodeBase64,
  encodeImage,
  extensionOf,
  isImageExtension,
  mimeTypeForExtension,
  utf8ByteLength,
} from "../src/processors/resourceProcessor.ts";
import { tinyPngBytes, TINY_PNG_BASE64 } from "./helpers.ts";

describe("resourceProcessor", () => {
  it("maps the image extensions the plugin embeds", () => {
    assert.equal(mimeTypeForExtension("PNG"), "image/png");
    assert.equal(mimeTypeForExtension("jpg"), "image/jpeg");
    assert.equal(mimeTypeForExtension("jpeg"), "image/jpeg");
    assert.equal(mimeTypeForExtension("gif"), "image/gif");
    assert.equal(mimeTypeForExtension("webp"), "image/webp");
    assert.equal(mimeTypeForExtension("svg"), "image/svg+xml");
    assert.equal(isImageExtension("md"), false);
    assert.equal(isImageExtension("pdf"), false);
  });

  it("reads an extension without confusing a fragment", () => {
    assert.equal(extensionOf("adjuntos/foto.png#recorte"), "png");
    assert.equal(extensionOf("my#photo.png"), "png");
    assert.equal(extensionOf("nota#encabezado"), "");
    assert.equal(extensionOf("año.JPG"), "jpg");
  });

  it("matches Node's base64 for small and chunked input", () => {
    assert.equal(encodeBase64(tinyPngBytes()), TINY_PNG_BASE64);
    const sizes = [0, 1, 2, 3, 4, 8192, 8193, 20000];
    for (const size of sizes) {
      const bytes = new Uint8Array(size);
      for (let index = 0; index < size; index += 1) bytes[index] = index % 256;
      assert.equal(encodeBase64(bytes), Buffer.from(bytes).toString("base64"));
    }
  });

  it("builds a data URI from the extension", () => {
    const encoded = encodeImage(Uint8Array.of(1, 2, 3), "gif");
    assert.ok(encoded);
    assert.equal(buildDataUri(encoded.mimeType, encoded.base64), "data:image/gif;base64,AQID");
    assert.equal(encodeImage(Uint8Array.of(1), "pdf"), null);
  });

  it("counts UTF-8 bytes rather than UTF-16 code units", () => {
    assert.equal(utf8ByteLength("á"), 2);
    assert.equal(utf8ByteLength("nota"), 4);
  });
});
