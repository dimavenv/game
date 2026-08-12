import { MOUNTAIN, RIVER, SWING, WORLD } from '../balance';
import { ValueNoise, clamp, lerp, smoothstep, toSeed } from '../rng';

/**
 * Русло Псекупса: ломаная от западного края карты вдоль подножия горы и на юг.
 * Ни одна точка не подходит к озеру ближе чем на сотню метров — пересекаться
 * им незачем.
 */
export const RIVER_PATH: [number, number][] = [
  [-396, 40],
  [-300, 74],
  [-232, 100],
  [-180, 116],
  [-148, 126],
  // Здесь русло вплотную подходит к горе: отсюда и прыгают.
  [-131.8, 131.8],
  [-118, 160],
  [-116, 212],
  [-130, 292],
  [-140, 396],
];

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

  /**
   * Расстояние до оси реки. Высота считается миллионы раз за загрузку, поэтому
   * сперва грубая отсечка по прямоугольнику — вся река лежит в западной
   * половине карты.
   */
  static riverDistance(x: number, z: number): number {
    if (x > -90 || x < -400 || z < 0 || z > 400) return 1e9;
    let best = Infinity;
    for (let i = 0; i < RIVER_PATH.length - 1; i++) {
      const [ax, az] = RIVER_PATH[i];
      const [bx, bz] = RIVER_PATH[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best) best = d;
    }
    return best;
  }

  /** Площадка тарзанки: ровная полка, вырубленная в склоне над рекой. */
  private shelf(h: number, x: number, z: number): number {
    const d = Math.hypot(x - SWING.base.x, z - SWING.base.z);
    if (d > SWING.radius * 1.9) return h;
    const flat = 1 - smoothstep(SWING.radius, SWING.radius * 1.9, d);
    return lerp(h, RIVER.level + SWING.height, flat);
  }

  /** Гора Петушок: пологая юбка, крутые бока, плоская макушка под беседку. */
  private mountain(x: number, z: number): number {
    const d = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z);
    if (d >= MOUNTAIN.radius) return 0;
    const t = 1 - d / MOUNTAIN.radius;
    // Куб сглаживания даёт вогнутую подошву и выпуклую вершину.
    const profile = t * t * (3 - 2 * t);
    // Рёбра и распадки по бокам, к макушке они сходят на нет.
    const relief = (this.detail.fbm(x * 0.022, z * 0.022, 3) - 0.5) * 9 * smoothstep(0.05, 0.55, t);
    const top = 1 - smoothstep(MOUNTAIN.topFlat * 0.6, MOUNTAIN.topFlat, d);
    return MOUNTAIN.height * profile + relief * (1 - top);
  }

  /** Долина Псекупса: берега поднимаются над водой, русло вырезано ниже неё. */
  private river(h: number, x: number, z: number): number {
    const d = Terrain.riverDistance(x, z);
    const valley = RIVER.bank * 1.8;
    if (d > valley) return h;
    // Сначала поднимаем берега, иначе река разольётся по низинам.
    const raise = 1 - smoothstep(RIVER.bank, valley, d);
    let out = lerp(h, Math.max(h, RIVER.level + 0.9), raise);
    // Потом вырезаем само русло.
    const cut = 1 - smoothstep(RIVER.halfWidth * 0.5, RIVER.bank, d);
    out = lerp(out, RIVER.level - RIVER.depth, cut);
    return out;
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

    // Гора: к самой кромке озера сходит на нет, чтобы пляж остался пляжем.
    h += this.mountain(x, z) * smoothstep(WORLD.lakeHalf, WORLD.lakeHalf + 8, d);
    // Полка под тарзанку врезается в склон, русло режется поверх всего.
    h = this.shelf(h, x, z);
    h = this.river(h, x, z);

    // Поляна под хижину — ровная площадка.
    const c = WORLD.clearing;
    const cd = Math.hypot(x - c.x, z - c.z);
    if (cd < c.r + 8) {
      const flat = 1 - smoothstep(c.r - 3, c.r + 8, cd);
      h = lerp(h, 0.95, flat);
    }
    return h;
  }

  /** Единичный вектор течения ближайшего отрезка русла. */
  static riverFlowAt(x: number, z: number): [number, number] {
    let best = Infinity;
    let flow: [number, number] = [0, 1];
    for (let i = 0; i < RIVER_PATH.length - 1; i++) {
      const [ax, az] = RIVER_PATH[i];
      const [bx, bz] = RIVER_PATH[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const len = Math.hypot(dx, dz);
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < best) {
        best = d;
        flow = [dx / len, dz / len];
      }
    }
    return flow;
  }

  /** Уровень воды в точке: озеро, река или суша. */
  waterLevelAt(x: number, z: number): number | null {
    if (Terrain.lakeDistance(x, z) < WORLD.lakeHalf) return WORLD.waterLevel;
    if (Terrain.riverDistance(x, z) < RIVER.bank) return RIVER.level;
    return null;
  }

  /** Глубина воды в точке: >0 — мокро. Считается и для озера, и для реки. */
  depth(x: number, z: number): number {
    const level = this.waterLevelAt(x, z);
    if (level === null) return 0;
    return level - this.height(x, z);
  }

  surface(x: number, z: number): Surface {
    const d = Terrain.lakeDistance(x, z);
    const h = this.height(x, z);
    if (d < WORLD.lakeHalf && h < WORLD.waterLevel) return 'water';
    if (d < WORLD.lakeHalf + 2.5 && h < WORLD.shoreHeight + 0.35) return 'sand';
    const rd = Terrain.riverDistance(x, z);
    if (rd < RIVER.bank && h < RIVER.level) return 'water';
    if (rd < RIVER.bank + 3) return 'sand';
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
