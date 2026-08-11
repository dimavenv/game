export interface DialogAction {
  id: string;
  label: string;
  /** Правая колонка: цена, прогресс, причина отказа. */
  note?: string;
  disabled?: boolean;
}

export interface DialogSpec {
  title: string;
  speech: string;
  actions: DialogAction[];
  footer?: string;
}

/**
 * Панель разговора с НПС. Пока она открыта, мышь свободна, и игра не считает
 * выход из захвата курсора паузой.
 */
export class Dialog {
  private readonly root: HTMLDivElement;
  private readonly titleEl: HTMLDivElement;
  private readonly speechEl: HTMLDivElement;
  private readonly actionsEl: HTMLDivElement;
  private readonly footerEl: HTMLDivElement;
  private handler: ((id: string) => void) | null = null;
  private closeHandler: (() => void) | null = null;
  private spec: DialogSpec | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'dialog';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="dialog-panel">
        <div class="dialog-title"></div>
        <div class="dialog-speech"></div>
        <div class="dialog-actions"></div>
        <div class="dialog-footer"></div>
        <button class="dialog-close" type="button">Закрыть (Esc)</button>
      </div>`;
    document.body.appendChild(this.root);

    this.titleEl = this.root.querySelector('.dialog-title')!;
    this.speechEl = this.root.querySelector('.dialog-speech')!;
    this.actionsEl = this.root.querySelector('.dialog-actions')!;
    this.footerEl = this.root.querySelector('.dialog-footer')!;
    this.root.querySelector('.dialog-close')!.addEventListener('click', () => this.close());
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(spec: DialogSpec, onAction: (id: string) => void, onClose: () => void): void {
    this.spec = spec;
    this.handler = onAction;
    this.closeHandler = onClose;
    this.render();
    this.root.classList.remove('hidden');
  }

  /** Перерисовать после покупки или сдачи задания, не закрывая панель. */
  update(spec: DialogSpec): void {
    if (!this.isOpen) return;
    this.spec = spec;
    this.render();
  }

  private render(): void {
    const spec = this.spec;
    if (!spec) return;
    this.titleEl.textContent = spec.title;
    this.speechEl.textContent = spec.speech;
    this.footerEl.textContent = spec.footer ?? '';
    this.actionsEl.replaceChildren();

    for (const action of spec.actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'dialog-action';
      button.disabled = Boolean(action.disabled);
      const label = document.createElement('span');
      label.textContent = action.label;
      button.appendChild(label);
      if (action.note) {
        const note = document.createElement('i');
        note.textContent = action.note;
        button.appendChild(note);
      }
      button.addEventListener('click', () => this.handler?.(action.id));
      this.actionsEl.appendChild(button);
    }
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.add('hidden');
    this.spec = null;
    this.handler = null;
    const onClose = this.closeHandler;
    this.closeHandler = null;
    onClose?.();
  }
}
