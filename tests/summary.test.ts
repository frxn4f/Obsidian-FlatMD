import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatByteSize, formatSummary } from "../src/summary.ts";
import type { ConversionSummary } from "../src/types.ts";

function summary(partial: Partial<ConversionSummary>): ConversionSummary {
  return {
    detected: 0,
    converted: 0,
    omitted: 0,
    externalPreserved: 0,
    externalDelinked: 0,
    errors: [],
    outputBytes: 0,
    cancelled: false,
    conversionEnabled: true,
    ...partial,
  };
}

describe("formatSummary", () => {
  it("formats sizes with a comma and without a trailing zero", () => {
    assert.equal(formatByteSize(1023), "1023 B");
    assert.equal(formatByteSize(1024), "1 KB");
    assert.equal(formatByteSize(1536), "1,5 KB");
    assert.equal(formatByteSize(1024 * 1024), "1 MB");
  });

  it("lists counts and only the first errors", () => {
    const text = formatSummary(summary({
      detected: 3,
      converted: 1,
      omitted: 2,
      externalPreserved: 1,
      outputBytes: 1536,
      errors: [
        { reference: "a.png", message: "No se encontró el archivo. Se conserva la referencia original." },
        { reference: "b.png", message: "No se pudo leer el archivo. Se conserva la referencia original." },
        { reference: "c.png", message: "uno" },
        { reference: "d.png", message: "dos" },
        { reference: "e.png", message: "tres" },
        { reference: "f.png", message: "cuatro" },
      ],
    }));

    assert.match(text, /Recursos detectados: 3/);
    assert.match(text, /Recursos convertidos: 1/);
    assert.match(text, /Recursos omitidos: 2/);
    assert.match(text, /Referencias externas conservadas: 1/);
    assert.match(text, /Errores: 6/);
    assert.match(text, /Tamaño aproximado: 1,5 KB/);
    assert.match(text, /Otros errores: 1/);
    assert.equal(text.includes("f.png"), false);
  });

  it("explains a disabled conversion and a cancelled operation", () => {
    assert.match(formatSummary(summary({ conversionEnabled: false })), /desactivada/);
    assert.match(formatSummary(summary({ cancelled: true })), /cancelada/);
  });
});
