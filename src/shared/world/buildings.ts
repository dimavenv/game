import { BRIDGE, MOUNTAIN, RIVER, SWING, WORLD } from '../balance';
import type { Terrain } from './terrain';

/** Прямоугольное препятствие, выровненное по осям: стена, прилавок, печка. */
export interface BoxCollider {
  x: number;
  z: number;
  /** Полуразмеры по осям. */
  hw: number;
  hd: number;
}

export interface WallSpec extends BoxCollider {
  y: number;
  height: number;
}

export interface HutLayout {
  x: number;
  z: number;
  floorY: number;
  width: number;
  depth: number;
  wallHeight: number;
  walls: WallSpec[];
  /** Проём: сюда игрок проходит внутрь. */
  door: { x: number; z: number; width: number };
  stove: { x: number; z: number };
  /** Кресло Буравчика и свободное кресло игрока. */
  chairs: { x: number; z: number; rot: number }[];
  colliders: BoxCollider[];
}

export interface StallLayout {
  x: number;
  z: number;
  floorY: number;
  rot: number;
  counter: BoxCollider;
  /** Где стоит Томер — за прилавком. */
  keeper: { x: number; z: number };
  colliders: BoxCollider[];
}

const HUT_W = 7.2;
const HUT_D = 6.2;
const WALL_T = 0.3;
const WALL_H = 2.7;
const DOOR_W = 1.4;

/**
 * Хижина стоит на поляне у восточного берега, дверью к озеру (на запад).
 * Геометрия описана здесь, а не в рендере, чтобы стены и столкновения
 * не разъезжались между клиентом и будущим сервером.
 */
export function hutLayout(terrain: Terrain): HutLayout {
  const x = WORLD.clearing.x;
  const z = WORLD.clearing.z;
  const floorY = terrain.height(x, z);
  const hw = HUT_W / 2;
  const hd = HUT_D / 2;
  const side = (HUT_D - DOOR_W) / 2;

  const walls: WallSpec[] = [
    // Северная и южная стены.
    { x, z: z - hd, hw, hd: WALL_T / 2, y: floorY, height: WALL_H },
    { x, z: z + hd, hw, hd: WALL_T / 2, y: floorY, height: WALL_H },
    // Глухая восточная стена.
    { x: x + hw, z, hw: WALL_T / 2, hd, y: floorY, height: WALL_H },
    // Западная стена с проёмом посередине.
    { x: x - hw, z: z - hd + side / 2, hw: WALL_T / 2, hd: side / 2, y: floorY, height: WALL_H },
    { x: x - hw, z: z + hd - side / 2, hw: WALL_T / 2, hd: side / 2, y: floorY, height: WALL_H },
  ];

  const stove = { x: x + hw - 1.1, z: z - hd + 1.1 };
  // Кресла разнесены: рядом с одним не должно «перебивать» другое.
  const chairs = [
    { x: x + 1.4, z: z + 1.5, rot: Math.PI * 0.85 },
    { x: x - 2.5, z: z + 1.5, rot: Math.PI * 1.15 },
  ];

  return {
    x,
    z,
    floorY,
    width: HUT_W,
    depth: HUT_D,
    wallHeight: WALL_H,
    walls,
    door: { x: x - hw, z, width: DOOR_W },
    stove,
    chairs,
    colliders: [
      ...walls.map(({ x: wx, z: wz, hw: whw, hd: whd }) => ({ x: wx, z: wz, hw: whw, hd: whd })),
      { x: stove.x, z: stove.z, hw: 0.55, hd: 0.55 },
    ],
  };
}

/** Ларёк Томера — в десятке метров от крыльца, ближе к тропе на озеро. */
export function stallLayout(terrain: Terrain): StallLayout {
  const x = WORLD.clearing.x - 9.5;
  const z = WORLD.clearing.z + 7.5;
  const floorY = terrain.height(x, z);
  const counter: BoxCollider = { x, z, hw: 1.7, hd: 0.45 };
  return {
    x,
    z,
    floorY,
    rot: 0,
    counter,
    keeper: { x, z: z + 1.1 },
    colliders: [counter],
  };
}

export interface CatamaranLayout {
  x: number;
  z: number;
  yaw: number;
  /** Высота палубы над водой. */
  deckY: number;
  /** Точка у кормы, откуда садятся: она на песке. */
  board: { x: number; z: number };
  /** Куда садится игрок. */
  seat: { x: number; y: number; z: number };
  /** Правое сиденье: там сидит Петровна. */
  petrovna: { x: number; y: number; z: number };
  /** Поплавки как круглые препятствия: сквозь катамаран не пройти. */
  obstacles: { x: number; z: number; radius: number }[];
}

/** Длина поплавка, разнос по бортам и высота палубы. */
export const CATAMARAN = {
  hullLength: 6.0,
  hullWidth: 1.1,
  beam: 1.75,
  deckY: 0.62,
} as const;

/**
 * Прогулочный катамаран у северо-восточного угла озера. Корма вытащена на
 * песок, нос смотрит к середине озера — сесть можно, не заходя в воду.
 */
export function catamaranLayout(): CatamaranLayout {
  const { x, z, yaw } = WORLD.catamaran;
  const sin = Math.sin(yaw);
  const cos = Math.cos(yaw);
  /** Локальные координаты катамарана в мировые: ось Z — вдоль корпуса, к носу. */
  const toWorld = (lx: number, lz: number): { x: number; z: number } => ({
    x: x + lx * cos + lz * sin,
    z: z - lx * sin + lz * cos,
  });

  const obstacles: { x: number; z: number; radius: number }[] = [];
  const half = CATAMARAN.hullLength / 2;
  for (const side of [-1, 1]) {
    for (let i = 0; i <= 4; i++) {
      const lz = -half + (i / 4) * CATAMARAN.hullLength;
      const p = toWorld(side * CATAMARAN.beam, lz);
      obstacles.push({ x: p.x, z: p.z, radius: 0.6 });
    }
  }

  const board = toWorld(0, -half - 0.4);
  const seat = toWorld(0, 0.2);
  // Петровна занимает правое сиденье, игроку остаётся левое.
  const petrovna = toWorld(0.85, 0.15);
  return {
    x,
    z,
    yaw,
    deckY: CATAMARAN.deckY,
    board,
    seat: { x: seat.x, y: WORLD.waterLevel + CATAMARAN.deckY, z: seat.z },
    petrovna: { x: petrovna.x, y: WORLD.waterLevel + CATAMARAN.deckY, z: petrovna.z },
    obstacles,
  };
}

/**
 * Столбы беседки на вершине и мачта тарзанки: сквозь них не ходят. Считаются
 * здесь, а не в рендере, чтобы столкновения были одинаковыми у всех.
 */
export function mountainObstacles(): { x: number; z: number; radius: number }[] {
  const out: { x: number; z: number; radius: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
    out.push({
      x: MOUNTAIN.x + Math.cos(a) * MOUNTAIN.gazeboRadius,
      z: MOUNTAIN.z + Math.sin(a) * MOUNTAIN.gazeboRadius,
      radius: 0.3,
    });
  }
  out.push({ x: SWING.base.x, z: SWING.base.z, radius: 0.5 });
  return out;
}

/**
 * Прямоугольная площадка, по которой можно ходить поверх рельефа: настил
 * моста. Повёрнута вокруг Y, поэтому проверка идёт в локальных координатах.
 */
export interface Platform {
  x: number;
  z: number;
  hw: number;
  hd: number;
  yaw: number;
  y: number;
}

/** Настил моста через Псекупс. */
export function bridgePlatform(): Platform {
  return {
    x: BRIDGE.x,
    z: BRIDGE.z,
    hw: BRIDGE.halfWidth,
    hd: BRIDGE.halfLength,
    yaw: BRIDGE.yaw,
    y: RIVER.level + BRIDGE.rise,
  };
}

/** Высота настила под точкой или null, если там настила нет. */
export function platformAt(platforms: Platform[], x: number, z: number): number | null {
  for (const p of platforms) {
    const cos = Math.cos(p.yaw);
    const sin = Math.sin(p.yaw);
    const dx = x - p.x;
    const dz = z - p.z;
    const lx = dx * cos - dz * sin;
    const lz = dx * sin + dz * cos;
    if (Math.abs(lx) <= p.hw && Math.abs(lz) <= p.hd) return p.y;
  }
  return null;
}

/** Костёр между хижиной и ларьком — ориентир на поляне. */
export function campfirePosition(): { x: number; z: number } {
  return { x: WORLD.clearing.x - 5.5, z: WORLD.clearing.z + 3.5 };
}
