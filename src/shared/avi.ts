import { WORLD } from './balance';
import { countItem, type Inventory } from './inventory';
import { mulberry32 } from './rng';
import type { Terrain } from './world/terrain';
import { Terrain as TerrainClass } from './world/terrain';

/**
 * Ави Загур — брат Томера, свернувший не туда. Днём его нигде нет; каждую
 * ночь он стоит с фонарём в новом месте карты, и найти его — отдельное занятие.
 */
export interface AviSpot {
  x: number;
  z: number;
  y: number;
  yaw: number;
}

/** Место на эту ночь: зависит только от номера дня, поэтому одинаково у всех. */
export function aviSpot(day: number, seed: number, terrain: Terrain): AviSpot {
  const rng = mulberry32((seed ^ Math.imul(day + 1, 0x9e3779b1)) >>> 0);
  for (let attempt = 0; attempt < 400; attempt++) {
    const x = (rng() * 2 - 1) * (WORLD.bound - 20);
    const z = (rng() * 2 - 1) * (WORLD.bound - 20);
    if (terrain.surface(x, z) === 'water') continue;
    if (TerrainClass.lakeDistance(x, z) < WORLD.lakeHalf + 8) continue;
    // Подальше от поляны: иначе искать нечего.
    if (Math.hypot(x - WORLD.clearing.x, z - WORLD.clearing.z) < 70) continue;
    if (terrain.slope(x, z) > 0.3) continue;
    return { x, z, y: terrain.height(x, z), yaw: rng() * Math.PI * 2 };
  }
  // Запасной угол на случай совсем неудачного сида.
  return { x: -120, z: -120, y: terrain.height(-120, -120), yaw: 0 };
}

export type NightJobKind = 'wine' | 'zombies';

export interface NightJob {
  kind: NightJobKind;
  target: number;
  progress: number;
  reward: number;
  /** Ночь, в которую поручение выдано: к утру оно сгорает. */
  day: number;
}

export function rollNightJob(rng: () => number, day: number): NightJob {
  const kind: NightJobKind = rng() < 0.5 ? 'wine' : 'zombies';
  if (kind === 'wine') {
    const target = 2 + Math.floor(rng() * 3);
    return { kind, target, progress: 0, reward: 200 * target, day };
  }
  const target = 5 + Math.floor(rng() * 6);
  return { kind, target, progress: 0, reward: 70 * target, day };
}

export function nightJobText(job: NightJob): string {
  return job.kind === 'wine'
    ? `Принести бутылок вина: ${job.target}`
    : `Упокоить зомби до рассвета: ${job.target}`;
}

export function nightJobProgress(job: NightJob, inv: Inventory): number {
  if (job.kind === 'zombies') return job.progress;
  return countItem(inv, 'wine_young') + countItem(inv, 'wine_aged') + countItem(inv, 'wine_vintage');
}
