export const MEGABYTE = 1024 * 1024;

export interface PluginSettings {
  exportFolder: string;
  exportFileNamePattern: string;
  maxImageBytes: number;
  maxDocumentBytes: number;
  missingResourceBehavior: "keep" | "placeholder";
  showSummaryNotice: boolean;
  convertImages: boolean;
  preserveExternalReferences: boolean;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  exportFolder: "",
  exportFileNamePattern: "{{noteName}}",
  maxImageBytes: 8 * MEGABYTE,
  maxDocumentBytes: 30 * MEGABYTE,
  missingResourceBehavior: "keep",
  showSummaryNotice: true,
  convertImages: true,
  preserveExternalReferences: true,
};

export interface ConversionIssue {
  reference: string;
  message: string;
}

export interface ConversionSummary {
  detected: number;
  converted: number;
  omitted: number;
  externalPreserved: number;
  externalDelinked: number;
  errors: ConversionIssue[];
  outputBytes: number;
  cancelled: boolean;
  conversionEnabled: boolean;
}

export interface ConversionResult {
  markdown: string;
  summary: ConversionSummary;
}

export interface ResolvedResource {
  key: string;
  path: string;
  name: string;
  extension: string;
}

export interface ResolveRequest {
  kind: "wiki" | "markdown";
  reference: string;
  sourcePath: string;
}

export interface ResourceReader {
  resolve(request: ResolveRequest): ResolvedResource | null;
  read(resource: ResolvedResource): Promise<Uint8Array>;
}

export interface TextSpan {
  start: number;
  end: number;
}
