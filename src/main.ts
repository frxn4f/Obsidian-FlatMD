import { MarkdownView, Notice, Platform, Plugin, TFile, type App } from "obsidian";
import { copyText } from "./managers/clipboardManager.ts";
import { askExportDestination, writeExportedMarkdown } from "./managers/exportManager.ts";
import { buildExportFileName } from "./managers/exportPaths.ts";
import { ProgressController } from "./managers/progressController.ts";
import { convertMarkdown } from "./processors/markdownProcessor.ts";
import { createVaultResourceReader } from "./resolvers/vaultLookup.ts";
import { mergeSettings } from "./settings/settings.ts";
import { ExporterSettingTab } from "./settings/settingsTab.ts";
import { formatSummary } from "./summary.ts";
import { DEFAULT_SETTINGS, type ConversionResult, type PluginSettings } from "./types.ts";

interface ActiveNote {
  file: TFile;
  content: string;
}

export default class SelfContainedMarkdownExporterPlugin extends Plugin {
  override settings: PluginSettings = DEFAULT_SETTINGS;

  override async onload(): Promise<void> {
    this.settings = mergeSettings(await this.loadData());
    this.addSettingTab(new ExporterSettingTab(this.app, this));

    this.addCommand({
      id: "copy-note",
      name: "Copy note",
      callback: () => {
        void this.copyActiveNote();
      },
    });

    this.addCommand({
      id: "export-note",
      name: "Export note",
      callback: () => {
        void this.exportActiveNote();
      },
    });
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private async copyActiveNote(): Promise<void> {
    const note = await readActiveNote(this.app);
    if (!note) {
      new Notice("No hay ninguna nota Markdown activa.");
      return;
    }

    const progress = new ProgressController(this.app);
    try {
      const result = await this.convert(note, progress);
      if (!result) return;
      await copyText(result.markdown);
      this.showSummary("La nota se ha copiado al portapapeles.", result);
    } catch (error) {
      reportFailure(error, "No se pudo copiar la nota.");
    } finally {
      progress.close();
    }
  }

  private async exportActiveNote(): Promise<void> {
    const note = await readActiveNote(this.app);
    if (!note) {
      new Notice("No hay ninguna nota Markdown activa.");
      return;
    }

    const destination = await askExportDestination(this.app, {
      suggestedFileName: buildExportFileName(this.settings.exportFileNamePattern, note.file.basename, new Date()),
      defaultFolder: this.settings.exportFolder,
      sourcePath: note.file.path,
      desktop: Platform.isDesktopApp,
    });
    if (!destination) return;

    const progress = new ProgressController(this.app);
    try {
      const result = await this.convert(note, progress);
      if (!result) return;

      const written = await writeExportedMarkdown(this.app, destination, result.markdown, note.file.path);
      if (!written) {
        new Notice("No se ha guardado el archivo.");
        return;
      }
      this.showSummary(`Se ha guardado el archivo:\n${written.path}`, result);
    } catch (error) {
      reportFailure(error, "No se pudo guardar el archivo.");
    } finally {
      progress.close();
    }
  }

  private async convert(note: ActiveNote, progress: ProgressController): Promise<ConversionResult | null> {
    const result = await convertMarkdown({
      markdown: note.content,
      sourcePath: note.file.path,
      settings: this.settings,
      reader: createVaultResourceReader(this.app),
      signal: progress.signal,
      onProgress: (update) => progress.update(update),
    });

    if (result.summary.cancelled) {
      new Notice("Operación cancelada. No se ha copiado ni guardado nada.");
      return null;
    }
    return result;
  }

  private showSummary(prefix: string, result: ConversionResult): void {
    if (!result.summary.conversionEnabled) {
      new Notice(formatSummary(result.summary));
      return;
    }
    if (!this.settings.showSummaryNotice) return;

    const timeout = result.summary.errors.length > 0 ? 10_000 : 6_000;
    new Notice(`${prefix}\n\n${formatSummary(result.summary)}`, timeout);
  }
}

async function readActiveNote(app: App): Promise<ActiveNote | null> {
  const view = app.workspace.getActiveViewOfType(MarkdownView);
  if (view?.file && isMarkdown(view.file)) {
    return { file: view.file, content: view.getViewData() };
  }

  const file = app.workspace.getActiveFile();
  if (!file || !isMarkdown(file)) return null;
  return { file, content: await app.vault.read(file) };
}

function isMarkdown(file: TFile): boolean {
  return file.extension.toLowerCase() === "md";
}

function reportFailure(error: unknown, fallback: string): void {
  console.error("[self-contained-markdown-exporter]", error);
  const message = error instanceof Error && error.message ? error.message : fallback;
  new Notice(message);
}
