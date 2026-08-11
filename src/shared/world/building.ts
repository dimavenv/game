import { WORLD } from '../balance';
import type { ItemStack } from '../inventory';
import type { BoxCollider } from './buildings';
import type { Terrain } from './terrain';
import { Terrain as TerrainClass } from './terrain';
import type { WorldData } from './worldgen';

export type BlueprintId = 'press' | 'cellar' | 'palisade' | 'gate' | 'chest' | 'pier' | 'smokehouse';

export interface Blueprint {
  name: string;
  hint: string;
  /** Из чего строится. */
  logs: number;
  stones: number;
  /** Габариты основания в метрах (полуразмеры). */
  hw: number;
  hd: number;
  height: number;
  /** Мешает ли пройти сквозь себя. */
  solid: boolean;
  /** Причал ставится на мелководье, остальное — только на суше. */
  onWater?: boolean;
}

export const BLUEPRINTS: Record<BlueprintId, Blueprint> = {
  press: {
    name: 'Давильня',
    hint: 'Топчешь виноград, получается сок',
    logs: 6,
    stones: 4,
    hw: 1.1,
    hd: 1.1,
    height: 1.3,
    solid: true,
  },
  cellar: {
    name: 'Винный погреб',
    hint: 'Бочки, в которых вызревает вино',
    logs: 10,
    stones: 14,
    hw: 2.2,
    hd: 1.8,
    height: 2.4,
    solid: true,
  },
  palisade: {
    name: 'Частокол',
    hint: 'Секция забора: зомби упираются',
    logs: 2,
    stones: 1,
    hw: 1.6,
    hd: 0.22,
    height: 2.3,
    solid: true,
  },
  gate: {
    name: 'Ворота',
    hint: 'Проход в частоколе',
    logs: 4,
    stones: 2,
    hw: 1.6,
    hd: 0.25,
    height: 2.6,
    solid: false,
  },
  chest: {
    name: 'Сундук',
    hint: 'Склад: сюда складываешь лишнее',
    logs: 4,
    stones: 0,
    hw: 0.55,
    hd: 0.38,
    height: 0.7,
    solid: true,
  },
  pier: {
    name: 'Причал',
    hint: 'Мостки на озере: с них клюёт лучше',
    logs: 8,
    stones: 0,
    hw: 1.1,
    hd: 3.2,
    height: 0.5,
    solid: false,
    onWater: true,
  },
  smokehouse: {
    name: 'Коптильня',
    hint: 'Копчёная рыба стоит вдвое дороже',
    logs: 3,
    stones: 5,
    hw: 0.9,
    hd: 0.9,
    height: 1.9,
    solid: true,
  },
};

export interface PlacedStructure {
  id: number;
  kind: BlueprintId;
  x: number;
  z: number;
  y: number;
  rot: number;
  builtDay: number;
  /** Сундук: своё содержимое. */
  storage?: (ItemStack | null)[];
  /** Давильня: сколько сока натоптано. */
  juice?: number;
  /** Погреб: партии вина и день, когда их залили. */
  barrels?: { amount: number; startedDay: number }[];
}

export const CHEST_SLOTS = 24;

/** Причина, по которой сюда ставить нельзя. null — можно. */
export function placementError(
  blueprint: Blueprint,
  x: number,
  z: number,
  rot: number,
  world: WorldData,
  placed: PlacedStructure[],
): string | null {
  if (Math.abs(x) > WORLD.bound - 4 || Math.abs(z) > WORLD.bound - 4) return 'Слишком близко к чаще';

  const terrain: Terrain = world.terrain;
  const depth = terrain.depth(x, z);
  if (blueprint.onWater) {
    if (depth < 0.05) return 'Причал ставится на воду';
    if (depth > 1.4) return 'Здесь слишком глубоко';
  } else {
    if (depth > 0.02) return 'Здесь вода';
    if (terrain.slope(x, z) > 0.32) return 'Слишком круто';
  }

  // Не залезаем в хижину и ларёк.
  for (const box of world.boxes) {
    if (overlaps(x, z, blueprint, rot, box)) return 'Здесь уже стоит постройка';
  }

  for (const s of placed) {
    const other = BLUEPRINTS[s.kind];
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < Math.max(blueprint.hw, blueprint.hd) + Math.max(other.hw, other.hd) - 0.15) {
      return 'Здесь уже стоит постройка';
    }
  }

  // Деревья и валуны мешают.
  const radius = Math.max(blueprint.hw, blueprint.hd);
  for (const o of world.obstacles.query(x, z, radius + 1.2)) {
    if (o.disabled) continue;
    if (Math.hypot(o.x - x, o.z - z) < radius + o.radius) return 'Мешает дерево';
  }

  if (!blueprint.onWater && TerrainClass.lakeDistance(x, z) < WORLD.lakeHalf + 1) return 'Здесь берег озера';
  return null;
}

function overlaps(x: number, z: number, blueprint: Blueprint, rot: number, box: BoxCollider): boolean {
  // Грубая проверка по описанной окружности — этого хватает.
  const r = Math.hypot(blueprint.hw, blueprint.hd);
  const br = Math.hypot(box.hw, box.hd);
  void rot;
  return Math.hypot(box.x - x, box.z - z) < r + br;
}

/** Коллайдер построенного: с поворотом на 90° меняем габариты местами. */
export function structureCollider(s: PlacedStructure): BoxCollider | null {
  const blueprint = BLUEPRINTS[s.kind];
  if (!blueprint.solid) return null;
  const turned = Math.abs(Math.sin(s.rot)) > 0.5;
  return {
    x: s.x,
    z: s.z,
    hw: turned ? blueprint.hd : blueprint.hw,
    hd: turned ? blueprint.hw : blueprint.hd,
  };
}
