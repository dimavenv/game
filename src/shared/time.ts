import { TIME, TIME_CYCLE } from './balance';

export type Phase = 'dawn' | 'day' | 'dusk' | 'night';

export interface WorldClock {
  /** Секунды с начала текущих суток, [0, TIME_CYCLE). */
  t: number;
  /** Номер игрового дня, считая с первого. */
  day: number;
}

const DAWN_END = TIME.dawn;
const DAY_END = DAWN_END + TIME.day;
const DUSK_END = DAY_END + TIME.dusk;

export function createClock(): WorldClock {
  return { t: TIME.startOffset, day: 1 };
}

export function advanceClock(clock: WorldClock, dt: number, scale = 1): void {
  clock.t += dt * scale;
  while (clock.t >= TIME_CYCLE) {
    clock.t -= TIME_CYCLE;
    clock.day += 1;
  }
}

export function phaseOf(t: number): Phase {
  if (t < DAWN_END) return 'dawn';
  if (t < DAY_END) return 'day';
  if (t < DUSK_END) return 'dusk';
  return 'night';
}

export const PHASE_LABEL: Record<Phase, string> = {
  dawn: 'рассвет',
  day: 'день',
  dusk: 'сумерки',
  night: 'ночь',
};

/** Ночью зомби выходят — этим же признаком пользуется этап 3. */
export function isDark(t: number): boolean {
  const p = phaseOf(t);
  return p === 'night' || p === 'dusk';
}

/** Высота солнца над горизонтом в радианах (ночью — отрицательная). */
export function sunAltitude(t: number): number {
  if (t < DAWN_END) {
    const u = t / TIME.dawn;
    return -0.14 + (0.24 + 0.14) * u * u * (3 - 2 * u);
  }
  if (t < DAY_END) {
    const u = (t - DAWN_END) / TIME.day;
    return 0.24 + Math.sin(u * Math.PI) * 0.72;
  }
  if (t < DUSK_END) {
    const u = (t - DAY_END) / TIME.dusk;
    return 0.24 - (0.24 + 0.14) * u * u * (3 - 2 * u);
  }
  const u = (t - DUSK_END) / TIME.night;
  return -0.14 - Math.sin(u * Math.PI) * 0.5;
}

export function sunAzimuth(t: number): number {
  return (t / TIME_CYCLE) * Math.PI * 2 - Math.PI * 0.55;
}

/** Единичный вектор на солнце. */
export function sunDirection(t: number): [number, number, number] {
  const alt = sunAltitude(t);
  const az = sunAzimuth(t);
  const c = Math.cos(alt);
  return [c * Math.sin(az), Math.sin(alt), c * Math.cos(az)];
}

/** Часы на экране: сутки начинаются в 05:00. */
export function clockLabel(t: number): string {
  const hours = ((t / TIME_CYCLE) * 24 + 5) % 24;
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
