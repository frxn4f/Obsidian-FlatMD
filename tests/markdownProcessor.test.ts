import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyReplacements, convertMarkdown } from "../src/processors/markdownProcessor.ts";
import { utf8ByteLength } from "../src/processors/resourceProcessor.ts";
import { DEFAULT_SETTINGS } from "../src/types.ts";
import { convertFixture, memoryReader, pngDataUri, tinyPngBytes } from "./helpers.ts";

const png = tinyPngBytes();
const dataUri = pngDataUri();

describe("convertMarkdown images", () => {
  it("embeds wiki and markdown images and keeps the surrounding note", async () => {
    const source = [
      "---",
      "title: Nota",
      "cover: ![[foto.png]]",
      "---",
      "",
      "# Título",
      "",
      "Un párrafo con **negrita** y *cursiva*.",
      "",
      "> [!info] Aviso",
      "> Antes ![[foto.png|Plano|640]] después",
      "",
      "| Col | Img |",
      "| --- | --- |",
      "| a | ![Captura](adjuntos/mi%20foto.png) |",
      "",
      "```ts",
      "![[foto.png]]",
      "```",
      "",
      "Enlace normal [[foto.png]] y [la guía](https://example.com).",
      "",
      "![Externa](https://example.com/a.png)",
      "",
      "Año: ![[año.png|Diagrama]]",
    ].join("\n");

    const { markdown, summary, reads } = await convertFixture(source, {
      "foto.png": png,
      "adjuntos/mi foto.png": png,
      "año.png": png,
    });

    assert.equal(reads.get("foto.png"), 1);
    assert.equal(summary.detected, 4);
    assert.equal(summary.converted, 3);
    assert.equal(summary.externalPreserved, 1);
    assert.equal(summary.omitted, 0);
    assert.equal(summary.errors.length, 0);
    assert.ok(markdown.startsWith("---\ntitle: Nota\ncover: ![[foto.png]]\n---"));
    assert.ok(markdown.includes("> [!info] Aviso"));
    assert.ok(markdown.includes(`> Antes <img src="${dataUri}" alt="Plano" width="640"> después`));
    assert.ok(markdown.includes(`| a | ![Captura](${dataUri}) |`));
    assert.ok(markdown.includes("```ts\n![[foto.png]]\n```"));
    assert.ok(markdown.includes("[[foto.png]]"));
    assert.ok(markdown.includes("[la guía](https://example.com)"));
    assert.ok(markdown.includes("![Externa](https://example.com/a.png)"));
    assert.ok(markdown.includes(`![Diagrama](${dataUri})`));
    assert.equal(summary.outputBytes, utf8ByteLength(markdown));
    assert.equal(source.includes("cover: ![[foto.png]]"), true);
  });

  it("uses the file name when a wiki embed has no alt text", async () => {
    const { markdown } = await convertFixture("![[fotos/plano.png]]", {
      "fotos/plano.png": png,
    });
    assert.equal(markdown, `![plano.png](${dataUri})`);
  });

  it("embeds a parenthesised path and does not touch the text around it", async () => {
    const { markdown } = await convertFixture("antes ![Captura](Captura (1).png) después", {
      "Captura (1).png": png,
    });
    assert.equal(markdown, `antes ![Captura](${dataUri}) después`);
  });

  it("inlines a reference image and leaves the definition in place", async () => {
    const source = ["[plano]: adjuntos/plano.png \"Sala\"", "", "![Plano][plano]", "", "[ver archivo][plano]"].join("\n");
    const { markdown, summary, reads } = await convertFixture(source, {
      "adjuntos/plano.png": png,
    });

    assert.equal(reads.get("adjuntos/plano.png"), 1);
    assert.equal(summary.converted, 1);
    assert.ok(markdown.includes(`![Plano](${dataUri} "Sala")`));
    assert.ok(markdown.includes("[plano]: adjuntos/plano.png \"Sala\""));
    assert.ok(markdown.includes("[ver archivo][plano]"));
  });

  it("reports a reference image whose definition does not exist", async () => {
    const source = "![Plano][ausente]";
    const { markdown, summary } = await convertFixture(source);
    assert.equal(markdown, source);
    assert.equal(summary.detected, 1);
    assert.equal(summary.omitted, 1);
    assert.match(summary.errors[0]?.message ?? "", /definición «ausente»/);
  });

  it("keeps note embeds and normal links unchanged", async () => {
    const source = "![[Otra nota]]\n\n[[foto.png]]\n\n[texto](foto.png)";
    const { markdown, summary, reads } = await convertFixture(source, { "Otra nota.md": png, "foto.png": png });
    assert.equal(markdown, source);
    assert.equal(summary.detected, 0);
    assert.equal(reads.size, 0);
  });

  it("keeps a missing image and can add a comment without removing the reference", async () => {
    const source = "Texto ![[no-esta.png]] final";
    const kept = await convertFixture(source);
    assert.equal(kept.markdown, source);
    assert.equal(kept.summary.omitted, 1);
    assert.match(kept.summary.errors[0]?.message ?? "", /conserva la referencia/);

    const marked = await convertFixture(source, {}, { missingResourceBehavior: "placeholder" });
    assert.ok(marked.markdown.startsWith("Texto ![[no-esta.png]] <!-- recurso no encontrado:"));
    assert.ok(marked.markdown.endsWith("--> final"));
  });

  it("does not download remote images and can turn them into links", async () => {
    const source = "![Captura](https://example.com/a.png)";
    const kept = await convertFixture(source);
    assert.equal(kept.markdown, source);
    assert.equal(kept.summary.externalPreserved, 1);
    assert.equal(kept.reads.size, 0);

    const delinked = await convertFixture(source, {}, { preserveExternalReferences: false });
    assert.equal(delinked.markdown, "[Captura](https://example.com/a.png)");
    assert.equal(delinked.summary.externalDelinked, 1);
  });

  it("leaves file URLs and existing data URIs untouched", async () => {
    const source = "![Local](file:///tmp/secreto.png)\n\n![Lista](data:image/png;base64,aaaa)";
    const { markdown, summary, reads } = await convertFixture(source);
    assert.equal(markdown, source);
    assert.equal(summary.omitted, 1);
    assert.equal(summary.detected, 1);
    assert.equal(reads.size, 0);
  });

  it("skips an image that is too large and continues with the next one", async () => {
    const small = tinyPngBytes();
    const large = new Uint8Array(small.length + 20);
    const source = "![[grande.png]]\n![[pequena.png]]";
    const { markdown, summary, reads } = await convertFixture(
      source,
      { "grande.png": large, "pequena.png": small },
      { maxImageBytes: small.length },
    );

    assert.equal(reads.get("grande.png"), 1);
    assert.equal(reads.get("pequena.png"), 1);
    assert.equal(summary.converted, 1);
    assert.equal(summary.omitted, 1);
    assert.ok(markdown.startsWith("![[grande.png]]"));
    assert.ok(markdown.includes(dataUri));
  });

  it("stops embedding when the document would pass the configured size", async () => {
    const source = "inicio ![[foto.png]] final";
    const limit = utf8ByteLength(source) + 20;
    const { markdown, summary } = await convertFixture(source, { "foto.png": png }, { maxDocumentBytes: limit });
    assert.equal(markdown, source);
    assert.equal(summary.converted, 0);
    assert.equal(summary.omitted, 1);
    assert.match(summary.errors[0]?.message ?? "", /documento superaría/);
  });

  it("leaves an empty image in place and reports it", async () => {
    const source = "![[vacia.png]]";
    const { markdown, summary } = await convertFixture(source, { "vacia.png": new Uint8Array() });
    assert.equal(markdown, source);
    assert.match(summary.errors[0]?.message ?? "", /vacío/);
  });

  it("reads a repeated image only once", async () => {
    const { markdown, summary, reads } = await convertFixture("![[foto.png]]\n![[foto.png]]", { "foto.png": png });
    assert.equal(reads.get("foto.png"), 1);
    assert.equal(summary.converted, 2);
    assert.equal(markdown.split(dataUri).length - 1, 2);
  });

  it("continues after a file that cannot be read", async () => {
    const { reader } = memoryReader({ "mala.png": png, "buena.png": png });
    const originalRead = reader.read.bind(reader);
    reader.read = async (resource) => {
      if (resource.path === "mala.png") throw new Error("permiso denegado");
      return originalRead(resource);
    };

    const result = await convertMarkdown({
      markdown: "![[mala.png]]\n![[buena.png]]",
      sourcePath: "nota.md",
      settings: DEFAULT_SETTINGS,
      reader,
    });

    assert.match(result.markdown, /!\[\[mala\.png\]\]/);
    assert.ok(result.markdown.includes(dataUri));
    assert.equal(result.summary.converted, 1);
    assert.equal(result.summary.omitted, 1);
  });

  it("returns the original note when conversion is disabled or the operation is cancelled", async () => {
    const source = "![[foto.png]]";
    const disabled = await convertFixture(source, { "foto.png": png }, { convertImages: false });
    assert.equal(disabled.markdown, source);
    assert.equal(disabled.summary.conversionEnabled, false);
    assert.equal(disabled.reads.size, 0);

    const controller = new AbortController();
    const cancelled = await convertFixture(source, { "foto.png": png }, {}, {
      signal: controller.signal,
      onProgress() {
        controller.abort();
      },
    });
    assert.equal(cancelled.markdown, source);
    assert.equal(cancelled.summary.cancelled, true);
    assert.equal(cancelled.reads.size, 0);
  });

  it("preserves CRLF outside the replaced image", async () => {
    const source = "línea\r\n![[foto.png]]\r\nfinal";
    const { markdown } = await convertFixture(source, { "foto.png": png });
    assert.ok(markdown.startsWith("línea\r\n"));
    assert.ok(markdown.endsWith("\r\nfinal"));
    assert.equal(markdown.includes("\nfinal") && markdown.includes("\r\nfinal"), true);
  });

  it("resolves a wiki name the same way Obsidian would", async () => {
    const { markdown } = await convertFixture(
      "![[plano]]",
      { "adjuntos/plano.png": png },
      {},
      {},
      (linkPath) => linkPath === "plano"
        ? { key: "adjuntos/plano.png", path: "adjuntos/plano.png", name: "plano.png", extension: "png" }
        : null,
    );
    assert.equal(markdown, `![plano.png](${dataUri})`);
  });
});

describe("applyReplacements", () => {
  it("replaces ranges without touching the rest of the text", () => {
    const result = applyReplacements("abcd", [
      { start: 1, end: 3, value: "XYZ" },
      { start: 4, end: 4, value: "!" },
    ]);
    assert.equal(result, "aXYZd!");
  });

  it("rejects overlapping ranges", () => {
    assert.throws(() => applyReplacements("abcd", [
      { start: 0, end: 2, value: "x" },
      { start: 1, end: 3, value: "y" },
    ]));
  });
});
