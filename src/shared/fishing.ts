import { ECONOMY } from './balance';
import type { ItemId } from './items';
import { clamp, lerp } from './rng';

export type FishKind = 'crucian' | 'perch' | 'bighead' | 'boot';

interface FishSpec {
  name: string;
  /** Вес в килограммах: от и до. */
  minKg: number;
  maxKg: number;
  /** Вес в таблице случайного улова. */
  chance: number;
  /** Насколько чаще попадается с благословением Пирата. */
  blessedChance: number;
  price: readonly [number, number] | number;
}

export const FISH: Record<FishKind, FishSpec> = {
  crucian: {
    name: 'карась',
    minKg: 0.2,
    maxKg: 1.1,
    chance: 0.46,
    blessedChance: 0.3,
    price: ECONOMY.sell.crucian,
  },
  perch: {
    name: 'окунь',
    minKg: 0.3,
    maxKg: 1.6,
    chance: 0.3,
    blessedChance: 0.26,
    price: ECONOMY.sell.perch,
  },
  bighead: {
    name: 'толстолобик',
    minKg: 1.4,
    maxKg: 6.5,
    chance: 0.16,
    blessedChance: 0.4,
    price: ECONOMY.sell.bighead,
  },
  boot: {
    name: 'старый ботинок',
    minKg: 0.6,
    maxKg: 1.4,
    chance: 0.08,
    blessedChance: 0.04,
    price: ECONOMY.sell.boot,
  },
};

export interface CaughtFish {
  kind: FishKind;
  /** Килограммы, округлённые до сотых. */
  weight: number;
}

const KINDS = Object.keys(FISH) as FishKind[];

/** Тянет случайную рыбу; благословение Пирата смещает таблицу к толстолобику. */
export function rollFish(rng: () => number, blessed: boolean): CaughtFish {
  const weights = KINDS.map((k) => (blessed ? FISH[k].blessedChance : FISH[k].chance));
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  let kind: FishKind = KINDS[0];
  for (let i = 0; i < KINDS.length; i++) {
    roll -= weights[i];
    if (roll <= 0) {
      kind = KINDS[i];
      break;
    }
  }
  const spec = FISH[kind];
  // Крупные экземпляры редки: кубическая кривая тянет вес к нижней границе.
  const t = Math.pow(rng(), 2.6);
  const weight = Math.round(lerp(spec.minKg, spec.maxKg, t) * 100) / 100;
  return { kind, weight };
}

/** Цена зависит от веса внутри диапазона вида. */
export function fishPrice(fish: CaughtFish): number {
  const spec = FISH[fish.kind];
  if (typeof spec.price === 'number') return spec.price;
  const t = clamp((fish.weight - spec.minKg) / (spec.maxKg - spec.minKg), 0, 1);
  return Math.round(lerp(spec.price[0], spec.price[1], t));
}

/** Чем рыба лежит в рюкзаке. */
export function fishItemId(kind: FishKind): ItemId {
  switch (kind) {
    case 'crucian':
      return 'fish_crucian';
    case 'perch':
      return 'fish_perch';
    case 'bighead':
      return 'fish_bighead';
    case 'boot':
      return 'boot';
  }
}

export function fishKindOfItem(id: ItemId): FishKind | null {
  switch (id) {
    case 'fish_crucian':
      return 'crucian';
    case 'fish_perch':
      return 'perch';
    case 'fish_bighead':
      return 'bighead';
    case 'boot':
      return 'boot';
    default:
      return null;
  }
}

export const FISH_ITEMS: ItemId[] = ['fish_crucian', 'fish_perch', 'fish_bighead', 'boot'];

export function fishLabel(fish: CaughtFish): string {
  return `${FISH[fish.kind].name}, ${fish.weight.toFixed(2)} кг`;
}


