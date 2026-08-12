import { ECONOMY } from './balance';
import { addItem, createInventory, type Inventory } from './inventory';
import type { NightJob } from './avi';
import { createDrugEffects, type DrugEffects } from './drugs';
import type { ActiveQuest } from './quests';
import type { PlacedStructure } from './world/building';

/** Что игрок сделал с лесом: срубил дерево, обобрал яблоню, разбил валун. */
export interface TreeMutation {
  hits: number;
  /** День, когда дерево срубили; null — стоит целое. */
  choppedDay: number | null;
}

export interface AppleTreeState {
  /** День, когда с неё сняли яблоки; null — яблоки на месте. */
  pickedDay: number | null;
}

export interface BoulderState {
  hits: number;
  /** День, когда валун разбили; null — целый. */
  brokenDay: number | null;
}

export interface WorldState {
  trees: Map<number, TreeMutation>;
  appleTrees: AppleTreeState[];
  /** Валуны по индексу в world.rocks. */
  boulders: Map<number, BoulderState>;
  /** Подобранные камешки: индекс → день, когда подобрали. */
  pebbles: Map<number, number>;
  /** Дикие лозы: индекс → день, когда с них сняли грозди. */
  vines: Map<number, number>;
  /** Всё, что игрок построил молотом. */
  structures: PlacedStructure[];
  /** Найденные пещеры: на карте они появляются только после того, как зашёл. */
  cavesFound: number[];
  /** Нашёл ли игрок памятник Серёге Пирату. */
  monumentFound: boolean;
  /** В какие сутки игрок последний раз называл число дроздов. */
  thrushDay: number;
  nextStructureId: number;
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
  /** Поручение Ави: сгорает с рассветом. */
  nightJob: NightJob | null;
  effects: DrugEffects;
}

export function createGameState(appleTreeCount: number): GameState {
  const inventory = createInventory(ECONOMY.startMoney);
  // Стартовая пачка — единственное, с чем игрок приходит в лес.
  addItem(inventory, 'cigarettes', 19);

  return {
    inventory,
    world: {
      trees: new Map(),
      appleTrees: Array.from({ length: appleTreeCount }, () => ({ pickedDay: null })),
      boulders: new Map(),
      pebbles: new Map(),
      vines: new Map(),
      structures: [],
      cavesFound: [],
      monumentFound: false,
      thrushDay: -99,
      nextStructureId: 1,
      stoveFuel: 0,
      lightUpDay: -99,
      tributeDay: -99,
      blessedUntilDay: -99,
    },
    quest: null,
    questsDone: 0,
    nightJob: null,
    effects: createDrugEffects(),
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

/** Разбитый валун через пару суток снова обрастает обломками. */
export function isBoulderBroken(state: GameState, index: number, day: number, regrowDays: number): boolean {
  const b = state.world.boulders.get(index);
  if (!b || b.brokenDay === null) return false;
  return day - b.brokenDay < regrowDays;
}

/** Есть ли сейчас грозди на дикой лозе. */
export function vineReady(state: GameState, index: number, day: number, regrowDays: number): boolean {
  const picked = state.world.vines.get(index);
  if (picked === undefined) return true;
  return day - picked >= regrowDays;
}

/** Посаженная лоза: сперва подрастает, потом плодоносит каждые сутки. */
export function plantedVineReady(
  vine: { builtDay: number; pickedDay?: number | null },
  day: number,
  growDays: number,
  regrowDays: number,
): boolean {
  if (day - vine.builtDay < growDays) return false;
  if (vine.pickedDay === null || vine.pickedDay === undefined) return true;
  return day - vine.pickedDay >= regrowDays;
}

export function isPebbleTaken(state: GameState, index: number, day: number, regrowDays: number): boolean {
  const taken = state.world.pebbles.get(index);
  if (taken === undefined) return false;
  return day - taken < regrowDays;
}
