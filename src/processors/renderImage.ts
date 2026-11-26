export interface EmbeddedImage {
  alt: string;
  title: string | null;
  width: number | null;
  height: number | null;
  dataUri: string;
}

export function renderEmbeddedImage(image: EmbeddedImage): string {
  const safeAlt = isSafeMarkdownAlt(image.alt);
  const safeTitle = image.title === null || isSafeTitle(image.title);
  const hasDimensions = image.width !== null || image.height !== null;

  // Markdown has no width or height. An img element keeps both outside Obsidian.
  if (hasDimensions || !safeAlt || !safeTitle) {
    return renderHtmlImage(image);
  }

  if (image.title) {
    return `![${image.alt}](${image.dataUri} "${image.title}")`;
  }
  return `![${image.alt}](${image.dataUri})`;
}

export function renderExternalLink(alt: string, url: string): string {
  const text = alt.trim() || url;
  if (isSafeMarkdownAlt(text) && isSafeDestination(url)) {
    return `[${text}](${url})`;
  }
  return `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`;
}

export function renderMissingResourceComment(reference: string): string {
  const safe = reference.replaceAll("--", "- -").replaceAll(">", "&gt;").slice(0, 180);
  return `<!-- recurso no encontrado: ${safe} -->`;
}

function renderHtmlImage(image: EmbeddedImage): string {
  const attributes = [
    `src="${escapeHtml(image.dataUri)}"`,
    `alt="${escapeHtml(image.alt)}"`,
  ];
  if (image.title) attributes.push(`title="${escapeHtml(image.title)}"`);
  if (image.width !== null) attributes.push(`width="${image.width}"`);
  if (image.height !== null) attributes.push(`height="${image.height}"`);
  return `<img ${attributes.join(" ")}>`;
}

function isSafeMarkdownAlt(alt: string): boolean {
  return !/[[\]\\|<>\n\r]/.test(alt);
}

function isSafeTitle(title: string): boolean {
  return !/["'\n\r]/.test(title);
}

function isSafeDestination(url: string): boolean {
  return !/[\s<>)]/.test(url);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
