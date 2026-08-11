import { WORLD } from '../balance';
import { ValueNoise, clamp, lerp, smoothstep, toSeed } from '../rng';

export type Surface = 'water' | 'sand' | 'grass';

/** Средняя высота суши над уровнем воды: берег всегда выше озера. */
export const LAND_BASE = 1.9;

/**
 * Рельеф считается функцией от координат — никаких хранимых карт высот.
 * Значит клиент и сервер получают одинаковую землю из одного сида.
 */
export class Terrain {
  private readonly noise: ValueNoise;
  private readonly detail: ValueNoise;

  constructor(seed: string | number) {
    const s = toSeed(seed);
    this.noise = new ValueNoise(s);
    this.detail = new ValueNoise(s ^ 0x9e3779b9);
  }

  /** Расстояние по Чебышёву — из-за него озеро выходит идеально квадратным. */
  static lakeDistance(x: number, z: number): number {
    return Math.max(Math.abs(x), Math.abs(z));
  }

  height(x: number, z: number): number {
    const d = Terrain.lakeDistance(x, z);

    if (d < WORLD.lakeHalf) {
      // Дно: от кромки песка круто вниз, к середине — ровная глубина.
      const inward = WORLD.lakeHalf - d;
      const depth = smoothstep(0, 11, inward) * 3.2;
      const bumps = (this.detail.noise(x * 0.09, z * 0.09) - 0.5) * 0.25;
      return WORLD.shoreHeight - depth + bumps * smoothstep(1, 6, inward);
    }

    const hills =
      LAND_BASE +
      (this.noise.fbm(x * 0.011, z * 0.011, 4) - 0.5) * 3.6 +
      (this.detail.fbm(x * 0.055, z * 0.055, 2) - 0.5) * 0.9;

    // Возле берега земля выполаживается в пляж, дальше переходит в холмы.
    const beach = smoothstep(WORLD.lakeHalf, WORLD.lakeHalf + 26, d);
    let h = lerp(WORLD.shoreHeight, hills, beach);

    // Поляна под хижину — ровная площадка.
    const c = WORLD.clearing;
    const cd = Math.hypot(x - c.x, z - c.z);
    if (cd < c.r + 8) {
      const flat = 1 - smoothstep(c.r - 3, c.r + 8, cd);
      h = lerp(h, 0.95, flat);
    }
    return h;
  }

  /** Глубина воды в точке: >0 — мокро. Вода есть только внутри озера. */
  depth(x: number, z: number): number {
    if (Terrain.lakeDistance(x, z) >= WORLD.lakeHalf) return 0;
    return WORLD.waterLevel - this.height(x, z);
  }

  surface(x: number, z: number): Surface {
    const d = Terrain.lakeDistance(x, z);
    const h = this.height(x, z);
    if (d < WORLD.lakeHalf && h < WORLD.waterLevel) return 'water';
    if (d < WORLD.lakeHalf + 2.5 && h < WORLD.shoreHeight + 0.35) return 'sand';
    return 'grass';
  }

  /** Нормаль поверхности — для укладки травы и камней по склону. */
  normalAt(x: number, z: number, eps = 0.6): [number, number, number] {
    const hl = this.height(x - eps, z);
    const hr = this.height(x + eps, z);
    const hd = this.height(x, z - eps);
    const hu = this.height(x, z + eps);
    const nx = hl - hr;
    const nz = hd - hu;
    const ny = 2 * eps;
    const len = Math.hypot(nx, ny, nz) || 1;
    return [nx / len, ny / len, nz / len];
  }

  /** Насколько круто в точке — от 0 (ровно) до 1 (обрыв). */
  slope(x: number, z: number): number {
    const n = this.normalAt(x, z);
    return clamp(1 - n[1], 0, 1);
  }
}
