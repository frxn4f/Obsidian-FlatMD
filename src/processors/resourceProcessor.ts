export interface EncodedImage {
  mimeType: string;
  base64: string;
  binaryBytes: number;
}

const MIME_BY_EXTENSION: Record<string, string> = {
  png: "image/png",
  apng: "image/apng",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  jpe: "image/jpeg",
  jfif: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  svgz: "image/svg+xml",
  ico: "image/x-icon",
  avif: "image/avif",
  tif: "image/tiff",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
};

const BASE64_CHUNK = 0x2000;

export function mimeTypeForExtension(extension: string): string | null {
  if (!extension) return null;
  return MIME_BY_EXTENSION[extension.toLowerCase()] ?? null;
}

export function literalExtension(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return "";
  const extension = fileName.slice(dot + 1).toLowerCase();
  return /^[a-z0-9]+$/.test(extension) ? extension : "";
}

export function isImageExtension(extension: string): boolean {
  return mimeTypeForExtension(extension) !== null;
}

export function extensionOf(reference: string): string {
  const withoutQuery = cutAt(reference, "?");
  const segment = withoutQuery.split("/").pop() ?? withoutQuery;
  const direct = literalExtension(segment);
  if (direct) return direct;

  const hash = segment.indexOf("#");
  if (hash === -1) return "";
  return literalExtension(segment.slice(0, hash));
}

export function encodeBase64(bytes: Uint8Array): string {
  // btoa throws or overflows the stack if the whole file is passed as one argument.
  let binary = "";
  for (let index = 0; index < bytes.length; index += BASE64_CHUNK) {
    const chunk = bytes.subarray(index, index + BASE64_CHUNK);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function encodeImage(bytes: Uint8Array, extension: string): EncodedImage | null {
  const mimeType = mimeTypeForExtension(extension);
  if (!mimeType) return null;
  return {
    mimeType,
    base64: encodeBase64(bytes),
    binaryBytes: bytes.byteLength,
  };
}

export function buildDataUri(mimeType: string, base64: string): string {
  return `data:${mimeType};base64,${base64}`;
}

export function utf8ByteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function cutAt(value: string, separator: string): string {
  const index = value.indexOf(separator);
  return index === -1 ? value : value.slice(0, index);
}
