import { classifyReference } from "../resolvers/referenceResolver.ts";
import { formatByteSize } from "../summary.ts";
import type {
  ConversionIssue,
  ConversionResult,
  ConversionSummary,
  PluginSettings,
  ResolvedResource,
  ResourceReader,
  TextSpan,
} from "../types.ts";
import {
  buildDataUri,
  encodeImage,
  extensionOf,
  isImageExtension,
  utf8ByteLength,
} from "./resourceProcessor.ts";
import type { EncodedImage } from "./resourceProcessor.ts";
import {
  renderEmbeddedImage,
  renderExternalLink,
  renderMissingResourceComment,
} from "./renderImage.ts";
import type { DirectImage, ImageDefinition, ImageOccurrence, ReferenceImage } from "./scanMarkdown.ts";
import { scanMarkdown } from "./scanMarkdown.ts";

export interface Replacement {
  start: number;
  end: number;
  value: string;
}

export interface ConvertMarkdownOptions {
  markdown: string;
  sourcePath: string;
  settings: PluginSettings;
  reader: ResourceReader;
  signal?: AbortSignal;
  onProgress?: (progress: { completed: number; total: number }) => void | Promise<void>;
}

interface ImageJob {
  type: "image";
  tracksProgress: boolean;
  kind: "wiki" | "markdown";
  target: string;
  span: TextSpan;
  alt: string | null;
  title: string | null;
  width: number | null;
  height: number | null;
  useFileNameWhenAltMissing: boolean;
}

interface MissingDefinitionJob {
  type: "missing-definition";
  tracksProgress: true;
  raw: string;
  label: string;
}

type Job = ImageJob | MissingDefinitionJob;

interface ConversionState {
  markdown: string;
  sourcePath: string;
  settings: PluginSettings;
  reader: ResourceReader;
  replacements: Replacement[];
  detected: number;
  converted: number;
  omitted: number;
  externalPreserved: number;
  externalDelinked: number;
  errors: ConversionIssue[];
  outputBytes: number;
  binaryCache: Map<string, Promise<Uint8Array>>;
  encodedCache: Map<string, EncodedImage>;
}

type LoadOutcome =
  | { status: "ready"; image: EncodedImage }
  | { status: "empty" }
  | { status: "too-big" }
  | { status: "unknown-format" }
  | { status: "unreadable" };

export async function convertMarkdown(options: ConvertMarkdownOptions): Promise<ConversionResult> {
  if (options.signal?.aborted) return plainResult(options.markdown, { cancelled: true, conversionEnabled: true });
  if (!options.settings.convertImages) return plainResult(options.markdown, { cancelled: false, conversionEnabled: false });

  const scan = scanMarkdown(options.markdown);
  const definitions = new Map(scan.definitions.map((definition) => [definition.label, definition]));
  const jobs = scan.occurrences.map((occurrence) => toJob(occurrence, definitions));
  const total = jobs.filter((job) => job.tracksProgress).length;
  const state = createState(options);

  if (total > 0) {
    await options.onProgress?.({ completed: 0, total });
    if (options.signal?.aborted) return plainResult(options.markdown, { cancelled: true, conversionEnabled: true });
  }

  let completed = 0;
  for (const job of jobs) {
    if (options.signal?.aborted) return plainResult(options.markdown, { cancelled: true, conversionEnabled: true });
    await convertJob(state, job);
    if (!job.tracksProgress) continue;

    completed += 1;
    await options.onProgress?.({ completed, total });
    if (options.signal?.aborted) return plainResult(options.markdown, { cancelled: true, conversionEnabled: true });
  }

  return finish(state);
}

export function applyReplacements(source: string, replacements: Replacement[]): string {
  const ordered = [...replacements].sort((left, right) => left.start - right.start || left.end - right.end);
  let cursor = 0;
  let output = "";

  for (const replacement of ordered) {
    if (replacement.start < cursor || replacement.end < replacement.start || replacement.end > source.length) {
      throw new Error("Las sustituciones del Markdown se solapan.");
    }
    output += source.slice(cursor, replacement.start);
    output += replacement.value;
    cursor = replacement.end;
  }

  output += source.slice(cursor);
  return output;
}

function toJob(occurrence: ImageOccurrence, definitions: Map<string, ImageDefinition>): Job {
  if (occurrence.kind === "reference") {
    return referenceJob(occurrence, definitions.get(occurrence.label));
  }
  return imageJob(occurrence);
}

function referenceJob(occurrence: ReferenceImage, definition: ImageDefinition | undefined): Job {
  if (!definition) {
    return {
      type: "missing-definition",
      tracksProgress: true,
      raw: occurrence.raw,
      label: occurrence.label,
    };
  }

  return {
    type: "image",
    tracksProgress: tracksProgress(definition.destination),
    kind: "markdown",
    target: definition.destination,
    span: occurrence.span,
    alt: occurrence.alt,
    title: definition.title,
    width: occurrence.width,
    height: occurrence.height,
    useFileNameWhenAltMissing: false,
  };
}

function imageJob(occurrence: DirectImage): ImageJob {
  return {
    type: "image",
    tracksProgress: tracksProgress(occurrence.target),
    kind: occurrence.kind,
    target: occurrence.target,
    span: occurrence.span,
    alt: occurrence.alt,
    title: occurrence.title,
    width: occurrence.width,
    height: occurrence.height,
    useFileNameWhenAltMissing: occurrence.kind === "wiki",
  };
}

function tracksProgress(target: string): boolean {
  const classification = classifyReference(target);
  if (classification === "data") return false;
  if (classification !== "local") return true;
  return isImageExtension(extensionOf(target));
}

async function convertJob(state: ConversionState, job: Job): Promise<void> {
  if (job.type === "missing-definition") {
    state.detected += 1;
    state.omitted += 1;
    state.errors.push({
      reference: job.raw,
      message: `No se encontró la definición «${job.label}». Se conserva la referencia original.`,
    });
    return;
  }

  const target = job.target.trim();
  const classification = classifyReference(target);
  if (classification === "data") return;

  if (classification === "remote") {
    preserveOrDelink(state, job, target);
    return;
  }

  if (classification === "unsupported-scheme") {
    state.detected += 1;
    state.omitted += 1;
    state.errors.push({
      reference: target,
      message: "Solo se incrustan imágenes del vault. Se conserva la referencia original.",
    });
    return;
  }

  const linkedExtension = extensionOf(target);
  if (linkedExtension && !isImageExtension(linkedExtension)) return;

  const resolved = state.reader.resolve({
    kind: job.kind,
    reference: target,
    sourcePath: state.sourcePath,
  });

  if (!resolved) {
    // Without an image extension this is usually a note embed, not a missing file.
    if (!linkedExtension) return;
    recordMissing(state, job.span, target);
    return;
  }

  if (!isImageExtension(resolved.extension)) return;

  const loaded = await loadImage(state, resolved);
  if (loaded.status !== "ready") {
    state.detected += 1;
    state.omitted += 1;
    state.errors.push({ reference: resolved.path, message: failureMessage(state, loaded) });
    return;
  }

  const alt = job.alt === null && job.useFileNameWhenAltMissing ? resolved.name : (job.alt ?? "");
  const value = renderEmbeddedImage({
    alt,
    title: job.title,
    width: job.width,
    height: job.height,
    dataUri: buildDataUri(loaded.image.mimeType, loaded.image.base64),
  });

  state.detected += 1;
  if (commitReplacement(state, job.span.start, job.span.end, value)) {
    state.converted += 1;
    return;
  }

  state.omitted += 1;
  state.errors.push({ reference: resolved.path, message: documentTooLarge(state) });
}

function preserveOrDelink(state: ConversionState, job: ImageJob, target: string): void {
  state.detected += 1;
  if (state.settings.preserveExternalReferences) {
    state.externalPreserved += 1;
    return;
  }

  const value = renderExternalLink(job.alt ?? "", target);
  if (!commitReplacement(state, job.span.start, job.span.end, value)) {
    state.omitted += 1;
    state.errors.push({ reference: target, message: documentTooLarge(state) });
    return;
  }
  state.externalDelinked += 1;
}

function recordMissing(state: ConversionState, span: TextSpan, reference: string): void {
  state.detected += 1;
  state.omitted += 1;

  if (state.settings.missingResourceBehavior === "placeholder") {
    const comment = ` ${renderMissingResourceComment(reference)}`;
    if (commitReplacement(state, span.end, span.end, comment)) {
      state.errors.push({
        reference,
        message: "No se encontró el archivo. Se ha añadido un aviso junto a la referencia.",
      });
      return;
    }
  }

  state.errors.push({
    reference,
    message: "No se encontró el archivo. Se conserva la referencia original.",
  });
}

async function loadImage(state: ConversionState, resource: ResolvedResource): Promise<LoadOutcome> {
  const cached = state.encodedCache.get(resource.key);
  if (cached) return { status: "ready", image: cached };

  let bytes: Uint8Array;
  try {
    bytes = await readBinary(state, resource);
  } catch {
    return { status: "unreadable" };
  }

  if (bytes.byteLength === 0) return { status: "empty" };

  // The configured limit applies to the original file. Base64 will make the Markdown about a third larger.
  if (state.settings.maxImageBytes > 0 && bytes.byteLength > state.settings.maxImageBytes) {
    return { status: "too-big" };
  }

  const image = encodeImage(bytes, resource.extension);
  if (!image) return { status: "unknown-format" };
  state.encodedCache.set(resource.key, image);
  return { status: "ready", image };
}

function readBinary(state: ConversionState, resource: ResolvedResource): Promise<Uint8Array> {
  const existing = state.binaryCache.get(resource.key);
  if (existing) return existing;

  const pending = state.reader.read(resource);
  state.binaryCache.set(resource.key, pending);
  void pending.catch(() => {
    state.binaryCache.delete(resource.key);
  });
  return pending;
}

function commitReplacement(state: ConversionState, start: number, end: number, value: string): boolean {
  const removed = state.markdown.slice(start, end);
  const next = state.outputBytes - utf8ByteLength(removed) + utf8ByteLength(value);
  if (state.settings.maxDocumentBytes > 0 && next > state.settings.maxDocumentBytes) return false;
  state.replacements.push({ start, end, value });
  state.outputBytes = next;
  return true;
}

function failureMessage(state: ConversionState, outcome: Exclude<LoadOutcome, { status: "ready" }>): string {
  switch (outcome.status) {
    case "empty":
      return "El archivo está vacío. Se conserva la referencia original.";
    case "too-big":
      return `El archivo supera el máximo de ${formatByteSize(state.settings.maxImageBytes)}. Se conserva la referencia original.`;
    case "unknown-format":
      return "No se reconoce el formato. Se conserva la referencia original.";
    case "unreadable":
      return "No se pudo leer el archivo. Se conserva la referencia original.";
  }
}

function documentTooLarge(state: ConversionState): string {
  return `El documento superaría el máximo de ${formatByteSize(state.settings.maxDocumentBytes)}. Se conserva la referencia original.`;
}

function createState(options: ConvertMarkdownOptions): ConversionState {
  return {
    markdown: options.markdown,
    sourcePath: options.sourcePath,
    settings: options.settings,
    reader: options.reader,
    replacements: [],
    detected: 0,
    converted: 0,
    omitted: 0,
    externalPreserved: 0,
    externalDelinked: 0,
    errors: [],
    outputBytes: utf8ByteLength(options.markdown),
    binaryCache: new Map(),
    encodedCache: new Map(),
  };
}

function finish(state: ConversionState): ConversionResult {
  const markdown = applyReplacements(state.markdown, state.replacements);
  const outputBytes = utf8ByteLength(markdown);
  if (outputBytes !== state.outputBytes) {
    throw new Error("El tamaño estimado del documento no coincide con el resultado.");
  }

  return {
    markdown,
    summary: summaryFrom(state, outputBytes, true, false),
  };
}

function plainResult(
  markdown: string,
  flags: { cancelled: boolean; conversionEnabled: boolean },
): ConversionResult {
  return {
    markdown,
    summary: {
      detected: 0,
      converted: 0,
      omitted: 0,
      externalPreserved: 0,
      externalDelinked: 0,
      errors: [],
      outputBytes: utf8ByteLength(markdown),
      cancelled: flags.cancelled,
      conversionEnabled: flags.conversionEnabled,
    },
  };
}

function summaryFrom(
  state: ConversionState,
  outputBytes: number,
  conversionEnabled: boolean,
  cancelled: boolean,
): ConversionSummary {
  return {
    detected: state.detected,
    converted: state.converted,
    omitted: state.omitted,
    externalPreserved: state.externalPreserved,
    externalDelinked: state.externalDelinked,
    errors: state.errors,
    outputBytes,
    cancelled,
    conversionEnabled,
  };
}
