import { Platform } from "obsidian";

declare function require(moduleName: string): unknown;

interface ElectronClipboard {
  clipboard?: {
    writeText(value: string): void;
  };
}

export async function copyText(text: string): Promise<void> {
  if (copyWithElectron(text)) return;

  const clipboard = navigator.clipboard;
  if (!clipboard?.writeText) {
    throw new Error("El portapapeles no está disponible en este dispositivo.");
  }

  try {
    await clipboard.writeText(text);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    throw new Error(
      detail ? `No se pudo copiar al portapapeles: ${detail}` : "No se pudo copiar al portapapeles.",
    );
  }
}

function copyWithElectron(text: string): boolean {
  if (Platform.isDesktop) {
    try {
      const electron = require("electron") as ElectronClipboard;
      if (!electron.clipboard) return false;
      electron.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
