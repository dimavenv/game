import { PHASE_LABEL, clockLabel, phaseOf } from '../../shared/time';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Нет элемента #${id}`);
  return node as T;
}

/** Тонкий слой поверх DOM: всё, что игрок видит поверх мира. */
export class Hud {
  private readonly root = el('hud');
  private readonly day = el('day');
  private readonly time = el('time');
  private readonly phase = el('phase');
  private readonly hint = el('hint');
  private readonly cigs = el('cigs');
  private readonly slot = document.querySelector<HTMLElement>('.slot[data-slot="1"]')!;
  private readonly breath = el('breath');
  private readonly breathFill = el<HTMLElement>('breath').querySelector('i')!;
  private readonly warm = el('warm');
  private readonly vignette = el('vignette');
  private currentHint = '';

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  setClock(t: number, day: number): void {
    this.day.textContent = `День ${day}`;
    this.time.textContent = clockLabel(t);
    this.phase.textContent = PHASE_LABEL[phaseOf(t)];
  }

  setHint(text: string): void {
    if (text === this.currentHint) return;
    this.currentHint = text;
    this.hint.textContent = text;
    this.hint.classList.toggle('show', text.length > 0);
  }

  setCigarettes(count: number, active: boolean): void {
    this.cigs.textContent = String(count);
    this.slot.classList.toggle('active', active);
  }

  setBreath(fraction: number): void {
    const show = fraction < 0.995;
    this.breath.classList.toggle('show', show);
    this.breathFill.style.transform = `scaleX(${Math.max(fraction, 0)})`;
  }

  /** Тёплая волна и подсевшая по краям картинка сразу после затяжки. */
  setBuzz(warmth: number, buzz: number): void {
    this.warm.style.opacity = warmth.toFixed(3);
    this.vignette.style.opacity = (0.55 + buzz * 0.22).toFixed(3);
  }
}
