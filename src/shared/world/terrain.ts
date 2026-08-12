import { GORGE, MOUNTAIN, RIVER, SWING, WORLD } from '../balance';
import { ValueNoise, clamp, lerp, smoothstep, toSeed } from '../rng';
import { ENTRY, caveHills, caveMouths, caveSites, type CaveSite } from './caves';

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
  /**
   * Зимой озеро встаёт: по нему можно ходить, а рыбалка отменяется.
   * Флаг ставит игра по календарю — рельефу знать про часы незачем.
   */
  frozen = false;
  private readonly noise: ValueNoise;
  private readonly detail: ValueNoise;
  /** Высота вершины: по ней ровняется площадка под беседку. */
  private readonly summitY: number;
  /** Высота поляны у хижины: берётся от окружающего рельефа. */
  private readonly clearingY: number;
  /** Естественная высота склона в узлах ущелья — от неё режется дно. */
  private readonly gorgeBase: number[];
  /** Длины отрезков оси ущелья и общая длина: по ним считается глубина. */
  private readonly gorgeSpan: number[];
  private readonly gorgeLength: number;
  /** Холмы, в которых спрятаны пещеры: их поднимает сам рельеф. */
  private readonly hills: CaveSite[];
  /** Зевы пещер и естественная высота склона в них: по ним режется вход. */
  private readonly mouths: { x: number; z: number; yaw: number; base: number }[] = [];

  constructor(seed: string | number) {
    const s = toSeed(seed);
    this.noise = new ValueNoise(s);
    this.detail = new ValueNoise(s ^ 0x9e3779b9);
    this.hills = caveSites(s);
    this.summitY = this.land(MOUNTAIN.x, MOUNTAIN.z) + this.mountain(MOUNTAIN.x, MOUNTAIN.z);
    // Поляну ровняем по своей же округе, а не по фиксированному числу: иначе
    // с новым рельефом она оказывается то в яме, то на столбе.
    this.clearingY = this.land(WORLD.clearing.x, WORLD.clearing.z);

    // Дно ущелья режется от нетронутого склона, поэтому его высоту в узлах
    // считаем заранее: иначе получится рекурсия «высота внутри высоты».
    // Отсчёт ведём от той земли, что получается уже с долиной реки: у входа
    // склон ею просажен, и без этого «ровное дно» считалось бы от воздуха.
    this.gorgeBase = GORGE.path.map(([x, z]) =>
      this.riverValley(this.land(x, z) + this.mountain(x, z), x, z),
    );
    this.gorgeSpan = [];
    let total = 0;
    for (let i = 0; i < GORGE.path.length - 1; i++) {
      const [ax, az] = GORGE.path[i];
      const [bx, bz] = GORGE.path[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      this.gorgeSpan.push(len);
      total += len;
    }
    this.gorgeLength = total;

    // Вход в пещеру прорезается в склоне: без выемки зев остаётся под землёй.
    this.mouths = caveMouths(s).map((m) => ({
      ...m,
      base: this.land(m.x, m.z) + this.mountain(m.x, m.z),
    }));
  }

  /**
   * Вход в пещеру: короткая просадка в склоне от зева наружу. Игрок сходит
   * по ней вниз и оказывается ровно на полу первого зала.
   */
  private caveEntries(h: number, x: number, z: number): number {
    let out = h;
    for (const mouth of this.mouths) {
      // Локальные координаты: ось Z наружу от зева.
      const dx = x - mouth.x;
      const dz = z - mouth.z;
      const sin = Math.sin(mouth.yaw);
      const cos = Math.cos(mouth.yaw);
      const along = dx * sin + dz * cos;
      const across = dx * cos - dz * sin;
      if (along < -ENTRY.inward - ENTRY.rim || along > ENTRY.length + ENTRY.rim) continue;
      if (Math.abs(across) > ENTRY.halfWidth + ENTRY.rim) continue;

      // Внутри выемки дно ровное, наружу оно поднимается к склону. Дальше
      // внутрь земля резко возвращается на место — это и есть зев пещеры.
      const t = clamp(along / ENTRY.length, 0, 1);
      const floor = mouth.base - ENTRY.drop * (1 - t * t);
      const side = smoothstep(ENTRY.halfWidth, ENTRY.halfWidth + ENTRY.rim, Math.abs(across));
      const outer = smoothstep(ENTRY.length, ENTRY.length + ENTRY.rim, along);
      const inner = smoothstep(-ENTRY.inward, -ENTRY.inward - ENTRY.rim, along);
      const blend = Math.max(side, Math.max(outer, inner));
      out = Math.min(out, lerp(floor, out, blend));
    }
    return out;
  }

  /**
   * Ущелье: узкая щель с отвесными стенами. У входа дно совпадает со
   * склоном, дальше уходит вниз — заходишь по земле, а через десяток шагов
   * над тобой уже стены.
   */
  private gorge(h: number, x: number, z: number): number {
    // Грубая отсечка: щель занимает небольшой кусок западного склона.
    if (x < -150 || x > -100 || z < 80 || z > 126) return h;

    let bestDistance = Infinity;
    let bestFloor = 0;
    let travelled = 0;
    for (let i = 0; i < GORGE.path.length - 1; i++) {
      const [ax, az] = GORGE.path[i];
      const [bx, bz] = GORGE.path[i + 1];
      const dx = bx - ax;
      const dz = bz - az;
      const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
      const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
      if (d < bestDistance) {
        bestDistance = d;
        // Насколько далеко от входа: у самого входа не режем вовсе.
        const along = (travelled + this.gorgeSpan[i] * t) / this.gorgeLength;
        const cut = GORGE.depth * smoothstep(0, 0.24, along);
        const natural = lerp(this.gorgeBase[i], this.gorgeBase[i + 1], t) - cut;
        // Дно идёт почти ровно, а не повторяет склон: иначе по щели надо
        // взбираться на тридцать метров, а стены наоборот низкие.
        const gentle = this.gorgeBase[0] + along * this.gorgeLength * GORGE.rise;
        bestFloor = Math.min(natural, gentle);
      }
      travelled += this.gorgeSpan[i];
    }

    if (bestDistance > GORGE.halfWidth + GORGE.rim) return h;
    // Внутри — ровное дно, наружу быстро выходим на естественный склон.
    const blend = smoothstep(GORGE.halfWidth, GORGE.halfWidth + GORGE.rim, bestDistance);
    return Math.min(h, lerp(bestFloor, h, blend));
  }

  /**
   * Холмы без гор, рек и площадок — основа, от которой всё считается.
   *
   * Рельеф нарочно только поднимается от уровня озера: низины остаются у воды,
   * а не проваливаются ниже неё. Четыре слоя — широкие валы, средние горбы,
   * хребты и мелкая рябь — дают лес, по которому идёшь то вверх, то вниз, а не
   * ровный стол с редкими бугорками.
   */
  private land(x: number, z: number): number {
    // Широкие валы: главный рисунок местности, длина волны около 240 метров.
    const broad = this.noise.fbm(x * 0.0042, z * 0.0042, 4);
    // Средние горбы поверх валов.
    const medium = this.noise.fbm(x * 0.017, z * 0.017, 3);
    // Хребты: из шума делаем гребень, иначе всё вокруг только круглые купола.
    const ridge = 1 - Math.abs(this.detail.fbm(x * 0.0075, z * 0.0075, 3) * 2 - 1);
    // Мелкая рябь под ногами.
    const fine = this.detail.fbm(x * 0.062, z * 0.062, 2);

    const hills =
      LAND_BASE +
      broad * broad * 19 +
      medium * medium * 6.5 +
      ridge * ridge * ridge * 8 +
      (fine - 0.5) * 1.5;

    // Пляж переходит в лес полосой пошире: иначе вокруг озера встаёт стена.
    const beach = smoothstep(WORLD.lakeHalf, WORLD.lakeHalf + 52, Terrain.lakeDistance(x, z));
    // Бугры с пещерами: в них и прокопаны ходы.
    return lerp(WORLD.shoreHeight, hills + caveHills(this.hills, x, z), beach);
  }

  /**
   * Долина Псекупса: округу тянет вниз к воде. Без этого река с новым
   * рельефом текла бы по дну двадцатиметрового каньона, а мост оказался бы
   * закопан в его стену.
   */
  private riverValley(h: number, x: number, z: number): number {
    const d = Terrain.riverDistance(x, z);
    const wide = RIVER.bank * 3.6;
    if (d > wide) return h;
    const pull = 1 - smoothstep(RIVER.bank * 1.1, wide, d);
    return lerp(h, Math.min(h, RIVER.level + 2.4), pull);
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

    let h = this.land(x, z);

    // Гора: к самой кромке озера сходит на нет, чтобы пляж остался пляжем.
    h += this.mountain(x, z) * smoothstep(WORLD.lakeHalf, WORLD.lakeHalf + 8, d);

    // Долина реки идёт до всех площадок: полка тарзанки и щель режутся поверх.
    h = this.riverValley(h, x, z);

    // Ровная площадка под беседкой: иначе она висит одним углом в воздухе.
    const md = Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z);
    if (md < MOUNTAIN.gazeboRadius * 3) {
      const flat = 1 - smoothstep(MOUNTAIN.gazeboRadius + 1.2, MOUNTAIN.gazeboRadius * 3, md);
      h = lerp(h, this.summitY, flat);
    }
    // Полка под тарзанку и щель ущелья врезаются в склон, русло — поверх всего.
    h = this.shelf(h, x, z);
    h = this.gorge(h, x, z);
    h = this.caveEntries(h, x, z);
    h = this.river(h, x, z);

    // Поляна под хижину — ровная площадка.
    const c = WORLD.clearing;
    const cd = Math.hypot(x - c.x, z - c.z);
    if (cd < c.r + 26) {
      // Поляна ровная, но съезд к ней теперь длинный: вокруг холмы.
      const flat = 1 - smoothstep(c.r - 3, c.r + 26, cd);
      h = lerp(h, this.clearingY, flat);
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
    // По льду ходят как по земле.
    if (Terrain.lakeDistance(x, z) < WORLD.lakeHalf) return this.frozen ? null : WORLD.waterLevel;
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
    if (d < WORLD.lakeHalf && h < WORLD.waterLevel) return this.frozen ? 'sand' : 'water';
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
