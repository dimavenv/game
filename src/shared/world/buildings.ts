import { WORLD } from '../balance';
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

/** Костёр между хижиной и ларьком — ориентир на поляне. */
export function campfirePosition(): { x: number; z: number } {
  return { x: WORLD.clearing.x - 5.5, z: WORLD.clearing.z + 3.5 };
}
