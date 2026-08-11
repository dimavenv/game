import { CIGARETTE, ECONOMY } from './balance';
import type { CaughtFish } from './fishing';
import type { ActiveQuest } from './quests';

/** Всё, что игрок несёт на себе. */
export interface Inventory {
  money: number;
  apples: number;
  logs: number;
  fish: CaughtFish[];
  cigarettes: number;
  bandages: number;
  shells: number;
  hasRod: boolean;
  hasFlashlight: boolean;
  hasGoodAxe: boolean;
  hasShotgun: boolean;
}

/** Что игрок сделал с лесом: срубил дерево, обобрал яблоню. */
export interface TreeMutation {
  hits: number;
  /** День, когда дерево срубили; null — стоит целое. */
  choppedDay: number | null;
}

export interface AppleTreeState {
  /** День, когда с неё сняли яблоки; null — яблоки на месте. */
  pickedDay: number | null;
}

export interface WorldState {
  trees: Map<number, TreeMutation>;
  appleTrees: AppleTreeState[];
  /** Сколько секунд ещё горит печь. */
  stoveFuel: number;
  /** День последней просьбы Буравчика прикурить. */
  lightUpDay: number;
  /** День последней дани уважения Серёге Пирату. */
  tributeDay: number;
  /** До какого дня включительно действует благословение Пирата. */
  blessedUntilDay: number;
}

export interface GameState {
  inventory: Inventory;
  world: WorldState;
  quest: ActiveQuest | null;
  questsDone: number;
}

export function createGameState(appleTreeCount: number): GameState {
  return {
    inventory: {
      money: ECONOMY.startMoney,
      apples: 0,
      logs: 0,
      fish: [],
      cigarettes: CIGARETTE.startPack,
      bandages: 0,
      shells: 0,
      hasRod: false,
      hasFlashlight: false,
      hasGoodAxe: false,
      hasShotgun: false,
    },
    world: {
      trees: new Map(),
      appleTrees: Array.from({ length: appleTreeCount }, () => ({ pickedDay: null })),
      stoveFuel: 0,
      lightUpDay: -99,
      tributeDay: -99,
      blessedUntilDay: -99,
    },
    quest: null,
    questsDone: 0,
  };
}

export function isBlessed(state: GameState, day: number): boolean {
  return day <= state.world.blessedUntilDay;
}

/** Срублено ли дерево прямо сейчас (через пару суток на пне поднимется новое). */
export function isTreeDown(state: GameState, index: number, day: number, regrowDays: number): boolean {
  const m = state.world.trees.get(index);
  if (!m || m.choppedDay === null) return false;
  return day - m.choppedDay < regrowDays;
}

export function applesReady(state: GameState, index: number, day: number, regrowDays: number): boolean {
  const a = state.world.appleTrees[index];
  if (!a || a.pickedDay === null) return true;
  return day - a.pickedDay >= regrowDays;
}
