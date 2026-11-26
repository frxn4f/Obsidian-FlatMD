import { Modal, type App } from "obsidian";

const PROGRESS_IMAGE_THRESHOLD = 8;

export class ProgressController {
  private modal: ProgressModal | null = null;
  private readonly abortController = new AbortController();

  constructor(private readonly app: App) {}

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  update(progress: { completed: number; total: number }): Promise<void> {
    if (progress.total < PROGRESS_IMAGE_THRESHOLD) return Promise.resolve();

    const justOpened = this.modal === null;
    if (!this.modal) {
      this.modal = new ProgressModal(this.app, () => this.abortController.abort());
      this.modal.open();
    }
    this.modal.setProgress(progress.completed, progress.total);
    if (!justOpened) return Promise.resolve();

    // Let the dialog paint before the next file is read.
    return new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }

  close(): void {
    this.modal?.dismiss();
    this.modal = null;
  }
}

class ProgressModal extends Modal {
  private statusEl: HTMLElement | null = null;
  private dismissed = false;

  constructor(
    app: App,
    private readonly onCancel: () => void,
  ) {
    super(app);
  }

  override onOpen(): void {
    this.titleEl.setText("Procesando imágenes");
    this.statusEl = this.contentEl.createEl("p", { text: "Preparando la nota…" });
    this.contentEl.createEl("p", {
      text: "Puedes cancelar. En ese caso no se copia ni se guarda nada.",
    });

    const button = this.contentEl.createEl("button", { text: "Cancelar" });
    button.addEventListener("click", () => this.close());
  }

  override onClose(): void {
    const shouldCancel = !this.dismissed;
    this.dismissed = true;
    this.contentEl.empty();
    if (shouldCancel) this.onCancel();
  }

  setProgress(completed: number, total: number): void {
    this.statusEl?.setText(`Imágenes procesadas: ${completed} de ${total}.`);
  }

  dismiss(): void {
    if (this.dismissed) return;
    this.dismissed = true;
    this.close();
  }
}
