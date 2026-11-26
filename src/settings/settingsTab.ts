import { PluginSettingTab, Setting, type App, type Plugin } from "obsidian";
import { bytesToMegabytes, megabytesToBytes } from "./settings.ts";
import type { PluginSettings } from "../types.ts";

interface SettingsHost extends Plugin {
  settings: PluginSettings;
  saveSettings(): Promise<void>;
}

export class ExporterSettingTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: SettingsHost,
  ) {
    super(app, plugin);
  }

  // Kept empty so Obsidian 1.13+ still renders display() instead of an automatic form.
  override getSettingDefinitions(): [] {
    return [];
  }

  override display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Convertir imágenes")
      .setDesc("Si lo desactivas, la copia y la exportación mantienen las referencias originales.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.convertImages).onChange((value) => {
          this.plugin.settings.convertImages = value;
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Carpeta de exportación")
      .setDesc("Carpeta del vault que se propone al exportar. Vacía para elegirla cada vez. Por ejemplo: exportaciones.")
      .addText((text) => {
        text.setPlaceholder("exportaciones").setValue(this.plugin.settings.exportFolder).onChange((value) => {
          this.plugin.settings.exportFolder = value;
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Nombre del archivo")
      .setDesc("Puedes usar {{noteName}}, {{date}} y {{time}}. Si lo dejas vacío se usa el nombre de la nota. La fecha y la hora son las del equipo.")
      .addText((text) => {
        text.setPlaceholder("{{noteName}}").setValue(this.plugin.settings.exportFileNamePattern).onChange((value) => {
          this.plugin.settings.exportFileNamePattern = value;
          void this.plugin.saveSettings();
        });
      });

    this.addByteLimit(
      containerEl,
      "Tamaño máximo por imagen",
      "En megabytes del archivo original. Las imágenes más grandes no se incrustan. Usa 0 para no poner límite. El valor inicial es 8.",
      () => this.plugin.settings.maxImageBytes,
      (bytes) => {
        this.plugin.settings.maxImageBytes = bytes;
      },
    );

    this.addByteLimit(
      containerEl,
      "Tamaño máximo del documento",
      "En megabytes del Markdown resultante. Usa 0 para no poner límite. El valor inicial es 30. El Base64 ocupa aproximadamente un tercio más que la imagen original.",
      () => this.plugin.settings.maxDocumentBytes,
      (bytes) => {
        this.plugin.settings.maxDocumentBytes = bytes;
      },
    );

    new Setting(containerEl)
      .setName("Recursos inexistentes")
      .setDesc("La referencia original se conserva. La segunda opción añade además un comentario HTML con la ruta que no se encontró.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("keep", "Conservar la referencia")
          .addOption("placeholder", "Añadir un comentario HTML")
          .setValue(this.plugin.settings.missingResourceBehavior)
          .onChange((value) => {
            this.plugin.settings.missingResourceBehavior = value === "placeholder" ? "placeholder" : "keep";
            void this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Conservar referencias externas")
      .setDesc("Las imágenes http y https no se descargan. Si está activo, se quedan como en la nota. Si lo desactivas, pasan a ser enlaces.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.preserveExternalReferences).onChange((value) => {
          this.plugin.settings.preserveExternalReferences = value;
          void this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Mostrar resumen")
      .setDesc("Aviso al terminar, con los recursos detectados, convertidos, omitidos y el tamaño. Si lo desactivas, una operación correcta no muestra ese resumen. Los fallos al copiar o guardar sí se avisan, igual que el aviso de que la conversión está desactivada.")
      .addToggle((toggle) => {
        toggle.setValue(this.plugin.settings.showSummaryNotice).onChange((value) => {
          this.plugin.settings.showSummaryNotice = value;
          void this.plugin.saveSettings();
        });
      });
  }

  private addByteLimit(
    containerEl: HTMLElement,
    name: string,
    description: string,
    read: () => number,
    write: (bytes: number) => void,
  ): void {
    new Setting(containerEl)
      .setName(name)
      .setDesc(description)
      .addText((text) => {
        text.setValue(bytesToMegabytes(read())).onChange((value) => {
          const bytes = megabytesToBytes(value);
          if (bytes === null) return;
          write(bytes);
          void this.plugin.saveSettings();
        });
        text.inputEl.addEventListener("blur", () => {
          text.setValue(bytesToMegabytes(read()));
        });
      });
  }
}
