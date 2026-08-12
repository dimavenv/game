import { MOUNTAIN, RIVER, WORLD } from '../balance';
import { mulberry32 } from '../rng';
import { Terrain } from './terrain';
import type { Platform } from './buildings';

/**
 * Пещеры. Поле высот не умеет нависать над собой, поэтому пещера — не дырка
 * в рельефе, а собственная геометрия: пол лежит настилами (по ним и ходят,
 * рельеф над головой при этом не мешает), стены стоят обычными круглыми
 * препятствиями.
 *
 * Система строится детерминированно из сида, как и весь остальной мир: вход
 * ищется на крутом склоне, дальше ход уходит внутрь и пару раз ветвится.
 */

export interface CaveNode {
  x: number;
  z: number;
  /** Пол зала: под землёй он ниже входа. */
  y: number;
  /** Радиус зала. У прохода он маленький, у зала — больше. */
  radius: number;
  /** Высота свода над полом. */
  height: number;
}

export interface CaveSegment {
  from: number;
  to: number;
  /** Полуширина хода. */
  halfWidth: number;
}

export interface Cave {
  id: number;
  /** Где вход: точка на склоне и куда смотрит зев. */
  mouth: { x: number; z: number; y: number; yaw: number };
  nodes: CaveNode[];
  segments: CaveSegment[];
}

/**
 * Холм с пещерой. В ровном лесу пещере взяться неоткуда, поэтому места под
 * них выбираются от сида — до всякого рельефа, — а рельеф потом поднимает в
 * этих точках холм. Так на карте появляются заметные бугры, и в каждом есть
 * ход внутрь.
 */
export interface CaveSite {
  x: number;
  z: number;
  /** Радиус подошвы холма и его высота над округой. */
  radius: number;
  height: number;
}

/** Сколько холмов с пещерами разбросано по лесу (плюс одна пещера в Петушке). */
const HILLS = 6;
/** Насколько глубоко ход опускается от входа за один зал. */
const DESCENT = 1.8;
/** Сколько камня должно остаться над сводом, чтобы ход не вышел наружу. */
const ROOF = 1.6;

/** Свободно ли место под холм: без озера, поляны, горы, реки и памятника. */
function siteFree(x: number, z: number, placed: CaveSite[], radius: number): boolean {
  if (Math.abs(x) > WORLD.bound - radius - 30 || Math.abs(z) > WORLD.bound - radius - 30) return false;
  if (Math.max(Math.abs(x), Math.abs(z)) < WORLD.lakeHalf + radius + 20) return false;
  if (Math.hypot(x - WORLD.clearing.x, z - WORLD.clearing.z) < WORLD.clearing.r + radius + 20) return false;
  if (Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) < MOUNTAIN.radius + radius * 0.4) return false;
  if (Terrain.riverDistance(x, z) < radius + RIVER.bank + 10) return false;
  if (Math.hypot(x - WORLD.monument.x, z - WORLD.monument.z) < radius + 20) return false;
  for (const other of placed) {
    if (Math.hypot(other.x - x, other.z - z) < other.radius + radius + 30) return false;
  }
  return true;
}

/**
 * Места под холмы с пещерами. Зависит только от сида: рельеф вызывает эту
 * функцию, чтобы поднять бугры, а генератор пещер — чтобы в них копать.
 */
export function caveSites(seed: number): CaveSite[] {
  const rng = mulberry32((seed ^ 0x1105_2ca7) >>> 0);
  const out: CaveSite[] = [];
  let guard = HILLS * 600;
  while (out.length < HILLS && guard-- > 0) {
    const radius = 42 + rng() * 16;
    const x = (rng() * 2 - 1) * (WORLD.bound - 90);
    const z = (rng() * 2 - 1) * (WORLD.bound - 90);
    if (!siteFree(x, z, out, radius)) continue;
    out.push({ x, z, radius, height: 17 + rng() * 7 });
  }
  return out;
}

/** Как далеко от подошвы холма прорезан вход и насколько он проседает. */
export const ENTRY = {
  /** Насколько выемка заходит внутрь холма — там и начинается ход. */
  inward: 5.5,
  /** Насколько она вытянута наружу, до слияния со склоном. */
  length: 7,
  halfWidth: 2.0,
  rim: 3.0,
  drop: 3.2,
};

/**
 * Зевы пещер. Считаются от сида, без рельефа: рельеф по ним прорезает вход,
 * а генератор ходов от них копает. Иначе получилась бы взаимная зависимость.
 */
export function caveMouths(seed: number): { x: number; z: number; yaw: number }[] {
  const rng = mulberry32((seed ^ 0x0ca7_5eed) >>> 0);
  const out: { x: number; z: number; yaw: number }[] = [];
  for (const site of caveSites(seed)) {
    const angle = rng() * Math.PI * 2;
    const r = site.radius * 0.5;
    const x = site.x + Math.cos(angle) * r;
    const z = site.z + Math.sin(angle) * r;
    // Зев смотрит от центра холма наружу, ход уходит к центру.
    out.push({ x, z, yaw: Math.atan2(x - site.x, z - site.z) });
  }
  // И одна в самом Петушке: гору видно отовсюду, её пещеру находят первой.
  const a = rng() * Math.PI * 2;
  const mr = MOUNTAIN.radius * 0.42;
  const mx = MOUNTAIN.x + Math.cos(a) * mr;
  const mz = MOUNTAIN.z + Math.sin(a) * mr;
  out.push({ x: mx, z: mz, yaw: Math.atan2(mx - MOUNTAIN.x, mz - MOUNTAIN.z) });
  return out;
}

/** Насколько холмы с пещерами приподнимают землю в точке. */
export function caveHills(sites: CaveSite[], x: number, z: number): number {
  let h = 0;
  for (const site of sites) {
    const d = Math.hypot(x - site.x, z - site.z);
    if (d >= site.radius) continue;
    const t = 1 - d / site.radius;
    h += site.height * t * t * (3 - 2 * t);
  }
  return h;
}

export function generateCaves(seed: number, terrain: Terrain): Cave[] {
  const rng = mulberry32((seed ^ 0x5eed_cafe) >>> 0);
  // Зевы уже прорезаны в рельефе, здесь остаётся только прокопать ходы.
  return caveMouths(seed).map((mouth, index) => carve(index, mouth, terrain, rng));
}

/** Прокладывает ходы от входа вглубь склона с парой развилок. */
function carve(
  id: number,
  mouth: { x: number; z: number; yaw: number },
  terrain: Terrain,
  rng: () => number,
): Cave {
  // Внутрь — против зева, то есть в толщу холма.
  const inward = mouth.yaw + Math.PI;
  // Первый зал стоит в глубине выемки: там выемка кончается и начинается камень.
  const x = mouth.x + Math.sin(inward) * ENTRY.inward;
  const z = mouth.z + Math.cos(inward) * ENTRY.inward;
  const mouthY = terrain.height(x, z);

  const nodes: CaveNode[] = [{ x, z, y: mouthY, radius: 2.2, height: 3.0 }];
  const segments: CaveSegment[] = [];

  /** Тянет цепочку залов от узла from в направлении heading. */
  const dig = (from: number, heading: number, steps: number, depth: number): void => {
    let current = from;
    let direction = heading;
    for (let i = 0; i < steps; i++) {
      const previous = nodes[current];
      const radius = 2.4 + rng() * 3.4;
      const height = 2.8 + rng() * 2.2;
      const y = previous.y - DESCENT * (0.4 + rng() * 0.6);

      // Пробуем несколько направлений: годится только то, где над сводом
      // остаётся камень. Иначе ход вылезет из склона наружу.
      let placed: CaveNode | null = null;
      let chosen = direction;
      for (let attempt = 0; attempt < 7; attempt++) {
        const angle = direction + (attempt === 0 ? 0 : (rng() - 0.5) * 2.2);
        const length = 8 + rng() * 7;
        const nx = previous.x + Math.sin(angle) * length;
        const nz = previous.z + Math.cos(angle) * length;
        if (Math.abs(nx) > WORLD.bound - 20 || Math.abs(nz) > WORLD.bound - 20) continue;
        if (terrain.height(nx, nz) < y + height + ROOF) continue;
        placed = { x: nx, z: nz, y, radius, height };
        chosen = angle;
        break;
      }
      // Дальше камня нет — ход кончается тупиком, и это нормально.
      if (!placed) return;

      nodes.push(placed);
      segments.push({ from: current, to: nodes.length - 1, halfWidth: 1.5 + rng() * 0.7 });
      current = nodes.length - 1;
      direction = chosen;

      // Развилка: от середины хода уводим боковой рукав.
      if (depth > 0 && i === Math.floor(steps / 2)) {
        dig(current, direction + (rng() < 0.5 ? -1 : 1) * (0.8 + rng() * 0.7), 2 + Math.floor(rng() * 2), depth - 1);
      }
    }
  };

  dig(0, inward, 3 + Math.floor(rng() * 2), 1);

  return { id, mouth: { x, z, y: mouthY, yaw: mouth.yaw }, nodes, segments };
}

/**
 * Настилы пола: по ним игрок ходит, не проваливаясь сквозь склон и не
 * выталкиваясь наверх рельефом, который формально над ним.
 */
export function cavePlatforms(cave: Cave): Platform[] {
  const out: Platform[] = [];
  for (const node of cave.nodes) {
    out.push({ x: node.x, z: node.z, hw: node.radius, hd: node.radius, yaw: 0, y: node.y });
  }
  for (const segment of cave.segments) {
    const a = cave.nodes[segment.from];
    const b = cave.nodes[segment.to];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    // Пол хода идёт по средней высоте: перепад между залами небольшой.
    out.push({
      x: (a.x + b.x) / 2,
      z: (a.z + b.z) / 2,
      hw: segment.halfWidth,
      hd: length / 2,
      yaw: Math.atan2(dx, dz),
      y: (a.y + b.y) / 2,
    });
  }
  return out;
}

/** Круглые препятствия вдоль стен: из хода не выйдешь боком в толщу горы. */
export function caveWalls(cave: Cave): { x: number; z: number; radius: number }[] {
  const out: { x: number; z: number; radius: number }[] = [];
  const step = 1.6;

  for (const segment of cave.segments) {
    const a = cave.nodes[segment.from];
    const b = cave.nodes[segment.to];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    const count = Math.max(2, Math.round(length / step));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const cx = a.x + dx * t;
      const cz = a.z + dz * t;
      // У самых залов стенки не ставим: там ход раскрывается.
      const nearNode = Math.min(t * length, (1 - t) * length);
      const offset = segment.halfWidth + 0.7;
      if (nearNode < a.radius * 0.8 || nearNode < b.radius * 0.8) continue;
      out.push({ x: cx + nx * offset, z: cz + nz * offset, radius: 0.8 });
      out.push({ x: cx - nx * offset, z: cz - nz * offset, radius: 0.8 });
    }
  }
  return out;
}

/** Внутри ли точка пещеры — по этому гасится дневной свет. */
export function insideCave(cave: Cave, x: number, z: number): boolean {
  for (const node of cave.nodes) {
    if (Math.hypot(node.x - x, node.z - z) < node.radius + 0.6) return true;
  }
  for (const segment of cave.segments) {
    const a = cave.nodes[segment.from];
    const b = cave.nodes[segment.to];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const denominator = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / denominator));
    const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    if (d < segment.halfWidth + 0.6) return true;
  }
  return false;
}
