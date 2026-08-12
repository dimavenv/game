import { SEASONS, TIME_CYCLE } from './balance';
import { clamp, lerp } from './rng';

/**
 * Времена года. Год — сорок игровых суток, по десять на сезон. От сезона
 * зависит цвет мира, температура и то, стоит ли лёд на озере.
 */

export type Season = 'summer' | 'autumn' | 'winter' | 'spring';

export const SEASON_ORDER: Season[] = ['summer', 'autumn', 'winter', 'spring'];

export const SEASON_NAME: Record<Season, string> = {
  summer: 'лето',
  autumn: 'осень',
  winter: 'зима',
  spring: 'весна',
};

/** Сколько суток прошло с начала года, дробью. */
function yearPhase(day: number, t: number): number {
  const inDay = clamp(t / TIME_CYCLE, 0, 1);
  const total = SEASONS.length * SEASON_ORDER.length;
  return ((((day - 1 + inDay) % total) + total) % total) / SEASONS.length;
}

export function seasonOf(day: number): Season {
  const index = Math.floor(yearPhase(day, 0)) % SEASON_ORDER.length;
  return SEASON_ORDER[index];
}

/** Насколько сезон вступил в силу: 0 — только начался, 1 — кончается. */
export function seasonProgress(day: number, t: number): number {
  const phase = yearPhase(day, t);
  return phase - Math.floor(phase);
}

/**
 * Плавный вес каждого сезона. Переходы размазаны, поэтому снег ложится
 * и сходит постепенно, а не за одну ночь.
 */
export function seasonWeights(day: number, t: number): Record<Season, number> {
  const phase = yearPhase(day, t);
  const out: Record<Season, number> = { summer: 0, autumn: 0, winter: 0, spring: 0 };
  for (let i = 0; i < SEASON_ORDER.length; i++) {
    // Расстояние по кругу от середины сезона i.
    let d = Math.abs(phase - (i + 0.5));
    if (d > SEASON_ORDER.length / 2) d = SEASON_ORDER.length - d;
    out[SEASON_ORDER[i]] = clamp(1 - d / 1.0, 0, 1);
  }
  const sum = SEASON_ORDER.reduce((a, s) => a + out[s], 0) || 1;
  for (const s of SEASON_ORDER) out[s] /= sum;
  return out;
}

/** Сколько снега лежит: 0 — голая земля, 1 — всё белое. */
export function snowAmount(day: number, t: number): number {
  return clamp(seasonWeights(day, t).winter * 1.9 - 0.25, 0, 1);
}

/** Насколько пожелтела листва. */
export function autumnAmount(day: number, t: number): number {
  return clamp(seasonWeights(day, t).autumn * 1.8 - 0.2, 0, 1);
}

/** Температура воздуха в градусах: по сезону и времени суток. */
export function temperature(day: number, t: number): number {
  const w = seasonWeights(day, t);
  const base =
    w.summer * SEASONS.temp.summer +
    w.autumn * SEASONS.temp.autumn +
    w.winter * SEASONS.temp.winter +
    w.spring * SEASONS.temp.spring;
  // Ночью холоднее: синус с минимумом перед рассветом.
  const dayPart = Math.sin((t / TIME_CYCLE) * Math.PI * 2 - Math.PI / 2);
  return base + dayPart * SEASONS.nightDrop;
}

/** Стоит ли лёд: озеро замерзает в разгар зимы. */
export function lakeFrozen(day: number, t: number): boolean {
  return snowAmount(day, t) > SEASONS.freezeAt;
}

/** Цвет, которым сезон подкрашивает траву и листву. */
export function seasonTint(day: number, t: number): [number, number, number] {
  const w = seasonWeights(day, t);
  const r = w.summer * 1.0 + w.autumn * 1.28 + w.winter * 0.86 + w.spring * 1.04;
  const g = w.summer * 1.0 + w.autumn * 0.92 + w.winter * 0.9 + w.spring * 1.06;
  const b = w.summer * 1.0 + w.autumn * 0.52 + w.winter * 1.02 + w.spring * 0.86;
  return [r, g, b];
}

/** Насколько холодно игроку без одежды: 0 — тепло, 1 — колотит. */
export function chill(day: number, t: number, insulation: number): number {
  const temp = temperature(day, t);
  const felt = temp + insulation * SEASONS.insulationDegrees;
  return clamp((SEASONS.comfort - felt) / 22, 0, 1);
}

export function lerpColor(a: number, b: number, k: number): number {
  return lerp(a, b, k);
}
