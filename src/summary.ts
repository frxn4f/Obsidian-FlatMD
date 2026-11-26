import type { ConversionSummary } from "./types.ts";

const VISIBLE_ERRORS = 5;

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "0 B";
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  if (bytes < 1024 * 1024) return `${formatDecimal(bytes / 1024)} KB`;
  return `${formatDecimal(bytes / (1024 * 1024))} MB`;
}

export function formatSummary(summary: ConversionSummary): string {
  if (!summary.conversionEnabled) {
    return "La conversión de imágenes está desactivada. El Markdown se mantiene igual.";
  }

  if (summary.cancelled) {
    return "Operación cancelada. No se ha copiado ni guardado nada.";
  }

  const lines = [
    `Recursos detectados: ${summary.detected}`,
    `Recursos convertidos: ${summary.converted}`,
    `Recursos omitidos: ${summary.omitted}`,
    `Referencias externas conservadas: ${summary.externalPreserved}`,
  ];

  if (summary.externalDelinked > 0) {
    lines.push(`Referencias externas convertidas en enlaces: ${summary.externalDelinked}`);
  }

  lines.push(`Errores: ${summary.errors.length}`);
  lines.push(`Tamaño aproximado: ${formatByteSize(summary.outputBytes)}`);

  const visible = summary.errors.slice(0, VISIBLE_ERRORS);
  if (visible.length > 0) lines.push("");
  for (const issue of visible) {
    lines.push(issue.reference ? `- ${truncate(issue.reference)}: ${issue.message}` : `- ${issue.message}`);
  }
  if (summary.errors.length > visible.length) {
    lines.push(`- Otros errores: ${summary.errors.length - visible.length}.`);
  }

  return lines.join("\n");
}

function formatDecimal(value: number): string {
  const [whole, fraction] = value.toFixed(1).split(".");
  if (!fraction || fraction === "0") return whole ?? "0";
  return `${whole},${fraction}`;
}

function truncate(value: string): string {
  const singleLine = value.replaceAll(/\s+/g, " ").trim();
  if (singleLine.length <= 80) return singleLine;
  return `${singleLine.slice(0, 79)}…`;
}
