/** Клавиатура и мышь с захватом курсора. Ввод копится и читается раз в кадр. */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private dx = 0;
  private dy = 0;
  /** Зажата ли левая кнопка: биноклю нужно именно удержание. */
  private mouse = false;
  locked = false;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(private readonly canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.down.add(e.code);
      this.pressed.add(e.code);
      if (e.code === 'Tab') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => this.down.clear());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.down.clear();
      this.onLockChange?.(this.locked);
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse = false;
    });
    window.addEventListener('blur', () => (this.mouse = false));

    this.canvas.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
  }

  requestLock(): void {
    void this.canvas.requestPointerLock();
  }

  /** Зажата ли левая кнопка мыши прямо сейчас. */
  isMouseDown(): boolean {
    return this.mouse;
  }

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  /** true один раз на нажатие. */
  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  axis(negative: string, positive: string): number {
    return (this.isDown(positive) ? 1 : 0) - (this.isDown(negative) ? 1 : 0);
  }

  takeMouse(): [number, number] {
    const out: [number, number] = [this.dx, this.dy];
    this.dx = 0;
    this.dy = 0;
    return out;
  }

  endFrame(): void {
    this.pressed.clear();
  }
}
