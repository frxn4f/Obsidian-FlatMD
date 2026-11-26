import { Modal, Notice, Setting, TFile, TFolder, normalizePath, type App } from "obsidian";
import {
  defaultSystemPath,
  ensureMarkdownExtension,
  firstFreeFileName,
  refusesSourceOverwrite,
  vaultFilePath,
} from "./exportPaths.ts";
import { vaultBasePath } from "../resolvers/vaultLookup.ts";
import { parentDirectory } from "../vaultPath.ts";

declare function require(moduleName: string): unknown;

export interface ExportRequest {
  kind: "vault" | "filesystem";
  path: string;
}

interface ExportDialogOptions {
  suggestedFileName: string;
  defaultFolder: string;
  sourcePath: string;
  desktop: boolean;
}

interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

interface ElectronDialog {
  showSaveDialog(options: {
    defaultPath?: string;
    filters?: Array<{ name: string; extensions: string[] }>;
  }): Promise<SaveDialogResult>;
}

interface ElectronModule {
  dialog?: ElectronDialog;
  remote?: { dialog?: ElectronDialog };
}

export function askExportDestination(app: App, options: ExportDialogOptions): Promise<ExportRequest | null> {
  return new Promise((resolve) => {
    const modal = new ExportDestinationModal(app, options, resolve);
    modal.open();
  });
}

export async function writeExportedMarkdown(
  app: App,
  destination: ExportRequest,
  markdown: string,
  sourcePath: string,
): Promise<{ path: string } | null> {
  if (destination.kind === "vault") {
    return writeInsideVault(app, destination.path, markdown, sourcePath);
  }
  return writeOutsideVault(app, destination.path, markdown, sourcePath);
}

async function writeInsideVault(
  app: App,
  relativePath: string,
  markdown: string,
  sourcePath: string,
): Promise<{ path: string } | null> {
  if (refusesSourceOverwrite(relativePath, sourcePath)) {
    throw new Error("El destino coincide con la nota abierta. Elige otro nombre o carpeta.");
  }

  const chosen = await chooseAvailableVaultPath(app, relativePath);
  if (!chosen) return null;

  try {
    await writeVaultFile(app, chosen, markdown);
  } catch (error) {
    throw new Error(describeFileError(error));
  }
  return { path: chosen };
}

async function writeOutsideVault(
  app: App,
  absolutePath: string,
  markdown: string,
  sourcePath: string,
): Promise<{ path: string } | null> {
  const pathModule = nodePath();
  const fsModule = nodeFs();
  if (!pathModule || !fsModule) {
    throw new Error("No se puede guardar fuera del vault en este dispositivo.");
  }

  const base = vaultBasePath(app);
  if (base && sameFile(pathModule.resolve(base, sourcePath), pathModule.resolve(absolutePath))) {
    throw new Error("El destino coincide con la nota abierta. Elige otro nombre o carpeta.");
  }

  const directory = pathModule.dirname(absolutePath);
  const fileName = pathModule.basename(absolutePath);
  const chosenName = await chooseAvailableFileName(app, absolutePath, fileName, async (candidate) => {
    try {
      await fsModule.promises.access(pathModule.join(directory, candidate));
      return true;
    } catch {
      return false;
    }
  });
  if (!chosenName) return null;

  const finalPath = chosenName === fileName ? absolutePath : pathModule.join(directory, chosenName);
  try {
    await fsModule.promises.mkdir(pathModule.dirname(finalPath), { recursive: true });
    await fsModule.promises.writeFile(finalPath, markdown, "utf8");
  } catch (error) {
    throw new Error(describeFileError(error));
  }
  return { path: finalPath };
}

async function chooseAvailableVaultPath(app: App, relativePath: string): Promise<string | null> {
  const normalized = normalizePath(relativePath);
  if (!app.vault.getAbstractFileByPath(normalized)) return normalized;

  const fileName = normalized.split("/").pop() ?? normalized;
  const directory = parentDirectory(normalized);
  const alternative = await firstFreeFileName(fileName, async (candidate) => {
    const candidatePath = directory ? `${directory}/${candidate}` : candidate;
    return app.vault.getAbstractFileByPath(normalizePath(candidatePath)) !== null;
  });

  const choice = await askOverwrite(app, normalized, alternative);
  if (choice === "cancel") return null;
  if (choice === "overwrite") return normalized;
  return directory ? `${directory}/${alternative}` : alternative;
}

async function chooseAvailableFileName(
  app: App,
  displayPath: string,
  fileName: string,
  exists: (candidate: string) => Promise<boolean>,
): Promise<string | null> {
  if (!(await exists(fileName))) return fileName;

  const alternative = await firstFreeFileName(fileName, exists);
  const choice = await askOverwrite(app, displayPath, alternative);
  if (choice === "cancel") return null;
  if (choice === "overwrite") return fileName;
  return alternative;
}

async function writeVaultFile(app: App, relativePath: string, markdown: string): Promise<void> {
  const normalized = normalizePath(relativePath);
  await ensureVaultFolder(app, parentDirectory(normalized));

  const existing = app.vault.getAbstractFileByPath(normalized);
  if (existing instanceof TFolder) {
    throw new Error("El destino es una carpeta.");
  }
  if (existing instanceof TFile) {
    await app.vault.modify(existing, markdown);
    return;
  }
  await app.vault.create(normalized, markdown);
}

async function ensureVaultFolder(app: App, folder: string): Promise<void> {
  if (!folder) return;

  let current = "";
  for (const part of folder.split("/")) {
    current = current ? `${current}/${part}` : part;
    const normalized = normalizePath(current);
    const existing = app.vault.getAbstractFileByPath(normalized);
    if (existing instanceof TFile) {
      throw new Error(`«${current}» es un archivo y no se puede usar como carpeta.`);
    }
    if (!existing) await app.vault.createFolder(normalized);
  }
}

function askOverwrite(app: App, currentPath: string, alternativeName: string): Promise<"overwrite" | "rename" | "cancel"> {
  return new Promise((resolve) => {
    const modal = new OverwriteModal(app, currentPath, alternativeName, resolve);
    modal.open();
  });
}

class ExportDestinationModal extends Modal {
  private fileName: string;
  private folder: string;
  private settled = false;

  constructor(
    app: App,
    private readonly options: ExportDialogOptions,
    private readonly onResult: (result: ExportRequest | null) => void,
  ) {
    super(app);
    this.fileName = options.suggestedFileName;
    this.folder = options.defaultFolder;
  }

  override onOpen(): void {
    this.titleEl.setText("Exportar nota");
    const { contentEl } = this;
    contentEl.createEl("p", {
      text: "Se creará un archivo nuevo. La nota abierta no se modifica. Si el archivo ya existe, podrás sobrescribirlo o usar otro nombre.",
    });

    new Setting(contentEl)
      .setName("Nombre del archivo")
      .addText((text) => {
        text.setValue(this.fileName).onChange((value) => {
          this.fileName = value;
        });
      });

    new Setting(contentEl)
      .setName("Carpeta del vault")
      .setDesc("Vacía para usar la raíz del vault. La ruta no puede salir del vault.")
      .addText((text) => {
        text.setPlaceholder("exportaciones").setValue(this.folder).onChange((value) => {
          this.folder = value;
        });
      });

    const buttons = new Setting(contentEl);
    buttons.addButton((button) => {
      button.setButtonText("Guardar en el vault").setCta().onClick(() => {
        this.chooseVault();
      });
    });

    if (this.options.desktop) {
      buttons.addButton((button) => {
        button.setButtonText("Guardar como…").onClick(() => {
          void this.chooseSystem();
        });
      });
    }

    buttons.addButton((button) => {
      button.setButtonText("Cancelar").onClick(() => {
        this.close();
      });
    });
  }

  override onClose(): void {
    this.contentEl.empty();
    this.finish(null);
  }

  private chooseVault(): void {
    const path = vaultFilePath(this.folder, this.fileName);
    if (!path) {
      new Notice("La carpeta tiene que estar dentro del vault.");
      return;
    }
    if (refusesSourceOverwrite(path, this.options.sourcePath)) {
      new Notice("El destino coincide con la nota abierta. Elige otro nombre o carpeta.");
      return;
    }
    this.finish({ kind: "vault", path });
    this.close();
  }

  private async chooseSystem(): Promise<void> {
    const dialog = electronDialog();
    if (!dialog) {
      new Notice("El diálogo del sistema no está disponible. Guarda el archivo en el vault.");
      return;
    }

    const suggested = defaultSystemPath(vaultBasePath(this.app), this.folder, this.fileName);
    const result = await dialog.showSaveDialog({
      defaultPath: suggested,
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (result.canceled || !result.filePath) return;

    this.finish({ kind: "filesystem", path: ensureMarkdownExtension(result.filePath) });
    this.close();
  }

  private finish(result: ExportRequest | null): void {
    if (this.settled) return;
    this.settled = true;
    this.onResult(result);
  }
}

class OverwriteModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly currentPath: string,
    private readonly alternativeName: string,
    private readonly onChoice: (choice: "overwrite" | "rename" | "cancel") => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText("El archivo ya existe");
    const { contentEl } = this;
    contentEl.createEl("p", {
      text: `Ya existe «${this.currentPath}». Puedes sobrescribirlo o guardarlo como «${this.alternativeName}». La nota abierta no se modifica.`,
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(`Guardar como ${this.alternativeName}`).setCta().onClick(() => {
          this.finish("rename");
        });
      })
      .addButton((button) => {
        // setWarning still exists on Obsidian 1.5. setDestructive arrived later.
        button.setButtonText("Sobrescribir").setWarning().onClick(() => {
          this.finish("overwrite");
        });
      })
      .addButton((button) => {
        button.setButtonText("Cancelar").onClick(() => {
          this.close();
        });
      });
  }

  override onClose(): void {
    this.contentEl.empty();
    if (this.settled) return;
    this.settled = true;
    this.onChoice("cancel");
  }

  private finish(choice: "overwrite" | "rename"): void {
    if (this.settled) return;
    this.settled = true;
    this.onChoice(choice);
    this.close();
  }
}

function electronDialog(): ElectronDialog | null {
  try {
    const electron = require("electron") as ElectronModule;
    return electron.dialog ?? electron.remote?.dialog ?? null;
  } catch {
    return null;
  }
}

function nodeFs(): typeof import("node:fs") | null {
  try {
    return require("fs") as typeof import("node:fs");
  } catch {
    return null;
  }
}

function nodePath(): typeof import("node:path") | null {
  try {
    return require("path") as typeof import("node:path");
  } catch {
    return null;
  }
}

function sameFile(left: string, right: string): boolean {
  const normalize = (value: string) => value.replaceAll("\\", "/").replace(/\/+$/, "").toLowerCase();
  return normalize(left) === normalize(right);
}

function describeFileError(error: unknown): string {
  if (isErrorWithCode(error)) {
    if (error.code === "EACCES" || error.code === "EPERM") return "No hay permiso para escribir el archivo.";
    if (error.code === "ENOSPC") return "No queda espacio en el destino.";
    if (error.code === "ENOENT") return "No se encontró la carpeta de destino.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "No se pudo escribir el archivo.";
}

function isErrorWithCode(error: unknown): error is { code: string; message?: string } {
  return typeof error === "object" && error !== null && "code" in error && typeof error.code === "string";
}
