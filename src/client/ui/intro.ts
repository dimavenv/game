const SEEN_KEY = 'krugloe-ozero-intro';

const LINES = ['Лес.', 'Вода.', 'Одна сигарета до заката.'];

/**
 * Заставка при первом запуске и предупреждение, которое нужно прочитать.
 * Дальше её можно открыть из меню — кнопкой «Дисклеймер».
 */
export class Intro {
  private readonly root: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly lines: HTMLDivElement;
  private readonly warning: HTMLDivElement;
  private readonly skip: HTMLButtonElement;
  private readonly accept: HTMLButtonElement;
  private timers: number[] = [];
  private resolve: (() => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'intro';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="intro-stage">
        <div class="intro-title">Круглое озеро</div>
        <div class="intro-lines"></div>
      </div>
      <div class="intro-warning">
        <div class="intro-warning-head">Наркотики — зло. Алкоголь — зло.</div>
        <p>
          Мы ни к чему не призываем и ничего не рекламируем. Всё, что происходит
          в этой игре, — выдумка от первого дерева до последней бутылки.
        </p>
        <p>
          Любые совпадения с реальными людьми, местами и событиями случайны.
          Персонажи вымышлены, их занятия вымышлены тем более. Без обид.
        </p>
        <p class="intro-warning-small">
          Игра сделана для своих и ради шутки. Не повторяйте в жизни ничего,
          что делает герой, — включая курение.
        </p>
        <button class="intro-accept" type="button">Понятно, поехали</button>
      </div>
      <button class="intro-skip" type="button">Пропустить</button>`;
    document.body.appendChild(this.root);

    this.title = this.root.querySelector('.intro-title')!;
    this.lines = this.root.querySelector('.intro-lines')!;
    this.warning = this.root.querySelector('.intro-warning')!;
    this.skip = this.root.querySelector('.intro-skip')!;
    this.accept = this.root.querySelector('.intro-accept')!;

    this.skip.addEventListener('click', () => this.showWarning());
    this.accept.addEventListener('click', () => this.finish());
  }

  static get seen(): boolean {
    try {
      return localStorage.getItem(SEEN_KEY) === '1';
    } catch {
      return false;
    }
  }

  private later(ms: number, fn: () => void): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    for (const id of this.timers) window.clearTimeout(id);
    this.timers = [];
  }

  /** Полная заставка: титр, строки, предупреждение. */
  play(): Promise<void> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.root.classList.remove('hidden');
      this.warning.classList.remove('shown');
      this.skip.classList.remove('hidden');
      this.lines.replaceChildren();
      this.title.classList.remove('shown');

      this.later(400, () => this.title.classList.add('shown'));
      LINES.forEach((text, i) => {
        this.later(1900 + i * 1100, () => {
          const line = document.createElement('div');
          line.className = 'intro-line';
          line.textContent = text;
          this.lines.appendChild(line);
          requestAnimationFrame(() => line.classList.add('shown'));
        });
      });
      this.later(1900 + LINES.length * 1100 + 1400, () => this.showWarning());
    });
  }

  /** Только предупреждение — из меню. */
  showOnly(): Promise<void> {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.root.classList.remove('hidden');
      this.title.classList.add('shown');
      this.lines.replaceChildren();
      this.showWarning();
    });
  }

  private showWarning(): void {
    this.clearTimers();
    this.skip.classList.add('hidden');
    this.warning.classList.add('shown');
  }

  private finish(): void {
    this.clearTimers();
    this.root.classList.add('hidden');
    try {
      localStorage.setItem(SEEN_KEY, '1');
    } catch {
      // Приватный режим: покажем заставку снова, ничего страшного.
    }
    const resolve = this.resolve;
    this.resolve = null;
    resolve?.();
  }
}
