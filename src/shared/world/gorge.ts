import { GORGE } from '../balance';
import { clamp } from '../rng';

/**
 * Геометрия Дантова ущелья. Раньше стены щели стояли частоколом круглых
 * препятствий: на поворотах они налезали в проход и читались как невидимые
 * барьеры. Теперь стена считается честно — по расстоянию до оси щели, — и
 * игрока просто прижимает к ней, а не останавливает на пустом месте.
 */

export interface GorgeHit {
  /** Расстояние от точки до оси щели. */
  distance: number;
  /** Ближайшая точка оси. */
  x: number;
  z: number;
  /** Нормаль от оси к точке: по ней и прижимаем. */
  nx: number;
  nz: number;
  /** Сколько метров от входа: 0 — зев, 1 — глухой конец. */
  along: number;
  /** То же в метрах: у самого зева стены отпускают, иначе из щели не выйти. */
  metres: number;
}

/** Полная длина оси щели: считается один раз. */
const LENGTH = (() => {
  let total = 0;
  for (let i = 0; i < GORGE.path.length - 1; i++) {
    const [ax, az] = GORGE.path[i];
    const [bx, bz] = GORGE.path[i + 1];
    total += Math.hypot(bx - ax, bz - az);
  }
  return total;
})();

/** Насколько далеко от оси можно отойти, не влезая в стену. */
export const CORRIDOR = GORGE.halfWidth + 0.45;
/**
 * Зона щели чуть шире самого прохода. Иначе прижатый к стене игрок формально
 * оказывается уже снаружи, ограничение перестаёт работать и он выходит сквозь
 * камень.
 */
const ZONE = CORRIDOR + 0.7;
/**
 * Полоса у самого зева, где стены не держат. Без неё из щели не выйти:
 * снаружи ближайшая точка оси — её начало, и прижим тянет игрока обратно.
 */
const MOUTH_FREE = 4.0;

export function nearestGorgeAxis(x: number, z: number): GorgeHit {
  let best: GorgeHit = { distance: Infinity, x, z, nx: 1, nz: 0, along: 0, metres: 0 };
  let travelled = 0;
  for (let i = 0; i < GORGE.path.length - 1; i++) {
    const [ax, az] = GORGE.path[i];
    const [bx, bz] = GORGE.path[i + 1];
    const dx = bx - ax;
    const dz = bz - az;
    const segment = Math.hypot(dx, dz);
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const px = ax + dx * t;
    const pz = az + dz * t;
    const distance = Math.hypot(x - px, z - pz);
    if (distance < best.distance) {
      const len = distance || 1;
      best = {
        distance,
        x: px,
        z: pz,
        nx: (x - px) / len,
        nz: (z - pz) / len,
        along: (travelled + segment * t) / LENGTH,
        metres: travelled + segment * t,
      };
    }
    travelled += segment;
  }
  return best;
}

/** Стоит ли точка в проходе щели. */
export function insideGorge(x: number, z: number): boolean {
  // Грубая отсечка, чтобы не считать ломаную на каждом шаге по всей карте.
  if (x < -150 || x > -100 || z < 80 || z > 126) return false;
  const hit = nearestGorgeAxis(x, z);
  return hit.distance < ZONE && hit.metres > MOUTH_FREE;
}

/**
 * Прижимает точку к проходу. Применяется только к тому, кто уже в щели:
 * снаружи она ничего не ограничивает, а изнутри выйти можно только зевом.
 */
export function clampToGorge(x: number, z: number): [number, number] {
  const hit = nearestGorgeAxis(x, z);
  if (hit.distance <= CORRIDOR) return [x, z];
  return [hit.x + hit.nx * CORRIDOR, hit.z + hit.nz * CORRIDOR];
}
