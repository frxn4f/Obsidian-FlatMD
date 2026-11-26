import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scanMarkdown } from "../src/processors/scanMarkdown.ts";

describe("scanMarkdown", () => {
  it("reads wiki embeds with alt text and dimensions", () => {
    const scan = scanMarkdown("![[foto.png]]\n![[foto.png|Plano]]\n![[foto.png|640]]\n![[foto.png|Plano|640x480]]");
    assert.deepEqual(
      scan.occurrences.map((item) => ({
        kind: item.kind,
        target: "target" in item ? item.target : "",
        alt: item.alt,
        width: item.width,
        height: item.height,
      })),
      [
        { kind: "wiki", target: "foto.png", alt: null, width: null, height: null },
        { kind: "wiki", target: "foto.png", alt: "Plano", width: null, height: null },
        { kind: "wiki", target: "foto.png", alt: null, width: 640, height: null },
        { kind: "wiki", target: "foto.png", alt: "Plano", width: 640, height: 480 },
      ],
    );
  });

  it("reads markdown images, titles, angle brackets and size suffixes", () => {
    const scan = scanMarkdown(
      [
        "![Captura](adjuntos/foto.png)",
        '![Captura](<mi foto.png> "Sala")',
        "![Captura|500](foto.png)",
        "![Captura](foto.png|640x480)",
        "![Captura](file\\(1\\).png)",
      ].join("\n"),
    );

    assert.deepEqual(
      scan.occurrences.map((item) => ("target" in item ? [item.target, item.alt, item.title, item.width, item.height] : [])),
      [
        ["adjuntos/foto.png", "Captura", null, null, null],
        ["mi foto.png", "Captura", "Sala", null, null],
        ["foto.png", "Captura", null, 500, null],
        ["foto.png", "Captura", null, 640, 480],
        ["file(1).png", "Captura", null, null, null],
      ],
    );
  });

  it("keeps a parenthesised filename inside the destination", () => {
    const scan = scanMarkdown("antes ![Captura](Captura (1).png) después");
    const image = scan.occurrences[0];
    assert.ok(image && image.kind === "markdown");
    assert.equal(image.target, "Captura (1).png");
    assert.equal(image.raw, "![Captura](Captura (1).png)");
  });

  it("resolves reference images and keeps the definition", () => {
    const scan = scanMarkdown("[plano]: adjuntos/plano.png \"Sala\"\n\n![Plano|500][plano]\n![Plano][]\n![plano]");
    assert.equal(scan.definitions.length, 1);
    assert.equal(scan.definitions[0]?.destination, "adjuntos/plano.png");
    assert.equal(scan.definitions[0]?.title, "Sala");
    assert.deepEqual(
      scan.occurrences.map((item) => (item.kind === "reference" ? [item.label, item.alt, item.width] : item.kind)),
      [
        ["plano", "Plano", 500],
        ["plano", "Plano", null],
        ["plano", "plano", null],
      ],
    );
  });

  it("does not treat a paragraph line as a reference definition", () => {
    const scan = scanMarkdown("Texto de la nota\n[plano]: adjuntos/plano.png\n\n![Plano][plano]");
    assert.equal(scan.definitions.length, 0);
    assert.equal(scan.occurrences[0]?.kind, "reference");
  });

  it("ignores images inside fenced code, inline code, frontmatter and comments", () => {
    const markdown = [
      "---",
      "cover: ![[foto.png]]",
      "---",
      "",
      "```ts",
      "![[foto.png]]",
      "```",
      "",
      "Usa `![[foto.png]]` en el texto.",
      "",
      "<!-- ![[foto.png]] -->",
      "",
      "![[visible.png]]",
      "",
      "\\![[foto.png]]",
    ].join("\n");

    const scan = scanMarkdown(markdown);
    assert.equal(scan.occurrences.length, 1);
    assert.equal(scan.occurrences[0] && "target" in scan.occurrences[0] ? scan.occurrences[0].target : "", "visible.png");
  });

  it("protects the rest of the note when a code fence is left open", () => {
    const scan = scanMarkdown("```\n![[foto.png]]\ntexto ![[otra.png]]");
    assert.equal(scan.occurrences.length, 0);
  });

  it("does not hide images when an HTML comment is left open", () => {
    const scan = scanMarkdown("<!-- ![[oculto.png]]\n![[visible.png]]");
    assert.deepEqual(
      scan.occurrences.map((item) => ("target" in item ? item.target : "")),
      ["oculto.png", "visible.png"],
    );
  });

  it("does not turn a plain exclamation into an image when there is no definition", () => {
    const scan = scanMarkdown("Esto no es una imagen: ![nota]. Y [[foto.png]] tampoco.");
    assert.equal(scan.occurrences.length, 0);
  });
});
