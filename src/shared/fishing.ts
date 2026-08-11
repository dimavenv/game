import { ECONOMY } from './balance';
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

export function fishLabel(fish: CaughtFish): string {
  return `${FISH[fish.kind].name}, ${fish.weight.toFixed(2)} кг`;
}

export function countFish(fish: CaughtFish[], kind: FishKind): number {
  return fish.reduce((n, f) => n + (f.kind === kind ? 1 : 0), 0);
}
