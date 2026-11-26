import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderEmbeddedImage, renderExternalLink, renderMissingResourceComment } from "../src/processors/renderImage.ts";

const dataUri = "data:image/png;base64,aaaa";

describe("renderEmbeddedImage", () => {
  it("uses a markdown image when the alt text is plain", () => {
    assert.equal(
      renderEmbeddedImage({ alt: "Plano", title: null, width: null, height: null, dataUri }),
      `![Plano](${dataUri})`,
    );
  });

  it("keeps a safe title in the markdown image", () => {
    assert.equal(
      renderEmbeddedImage({ alt: "Plano", title: "Sala", width: null, height: null, dataUri }),
      `![Plano](${dataUri} "Sala")`,
    );
  });

  it("uses an img element when the note specifies a size", () => {
    assert.equal(
      renderEmbeddedImage({ alt: "Plano", title: null, width: 640, height: 480, dataUri }),
      `<img src="${dataUri}" alt="Plano" width="640" height="480">`,
    );
  });

  it("escapes alt text that would break markdown or HTML", () => {
    const rendered = renderEmbeddedImage({
      alt: 'a"b<c&d',
      title: null,
      width: 10,
      height: null,
      dataUri,
    });
    assert.equal(rendered, `<img src="${dataUri}" alt="a&quot;b&lt;c&amp;d" width="10">`);
  });
});

describe("renderExternalLink", () => {
  it("keeps the URL and the alt text as a normal link", () => {
    assert.equal(renderExternalLink("Captura", "https://example.com/a.png"), "[Captura](https://example.com/a.png)");
  });
});

describe("renderMissingResourceComment", () => {
  it("does not let the path close the comment", () => {
    const comment = renderMissingResourceComment("a-->b");
    assert.equal(comment.includes("-->b"), false);
    assert.ok(comment.endsWith("-->"));
  });
});
