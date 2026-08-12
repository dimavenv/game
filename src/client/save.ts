import type { PlayerState } from '../shared/movement';
import type { NightJob } from '../shared/avi';
import { createDrugEffects, type DrugEffects } from '../shared/drugs';
import type { ActiveQuest } from '../shared/quests';
import type { Inventory } from '../shared/inventory';
import type { PlacedStructure } from '../shared/world/building';
import type { GameState, BoulderState, TreeMutation } from '../shared/state';
import type { WorldClock } from '../shared/time';

const KEY = 'krugloe-ozero-save';
const VERSION = 8;

interface SaveData {
  version: number;
  inventory: Inventory;
  quest: ActiveQuest | null;
  questsDone: number;
  nightJob: NightJob | null;
  effects: DrugEffects;
  clock: WorldClock;
  trees: [number, TreeMutation][];
  appleTrees: (number | null)[];
  boulders: [number, BoulderState][];
  pebbles: [number, number][];
  structures: PlacedStructure[];
  nextStructureId: number;
  vines: [number, number][];
  stoveFuel: number;
  lightUpDay: number;
  tributeDay: number;
  blessedUntilDay: number;
  player: {
    x: number;
    z: number;
    yaw: number;
    health: number;
    hunger: number;
    thirst: number;
    warmth: number;
  };
}

/**
 * Прогресс живёт в localStorage. Тот же набор данных потом уедет на сервер,
 * поэтому сохраняем именно состояние игры, а не внутренности рендера.
 */
export function saveGame(state: GameState, clock: WorldClock, player: PlayerState): void {
  const data: SaveData = {
    version: VERSION,
    inventory: state.inventory,
    quest: state.quest,
    questsDone: state.questsDone,
    nightJob: state.nightJob,
    effects: state.effects,
    clock: { t: clock.t, day: clock.day },
    trees: [...state.world.trees.entries()],
    appleTrees: state.world.appleTrees.map((a) => a.pickedDay),
    boulders: [...state.world.boulders.entries()],
    pebbles: [...state.world.pebbles.entries()],
    structures: state.world.structures,
    nextStructureId: state.world.nextStructureId,
    vines: [...state.world.vines.entries()],
    stoveFuel: state.world.stoveFuel,
    lightUpDay: state.world.lightUpDay,
    tributeDay: state.world.tributeDay,
    blessedUntilDay: state.world.blessedUntilDay,
    player: {
      x: player.x,
      z: player.z,
      yaw: player.yaw,
      health: player.health,
      hunger: player.hunger,
      thirst: player.thirst,
      warmth: player.warmth,
    },
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Приватный режим или переполненное хранилище — играем без сохранения.
  }
}

export function loadGame(state: GameState, clock: WorldClock, player: PlayerState): boolean {
  let data: SaveData;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    data = JSON.parse(raw) as SaveData;
  } catch {
    return false;
  }
  if (data.version !== VERSION) return false;

  Object.assign(state.inventory, data.inventory);
  state.quest = data.quest;
  state.questsDone = data.questsDone ?? 0;
  state.nightJob = data.nightJob ?? null;
  // Приход не переживает перезапуск, отходняк — переживает.
  const effects = data.effects ?? createDrugEffects();
  state.effects.after = effects.after ?? null;
  state.effects.tremor = 0;
  state.effects.painDebt = 0;
  state.effects.active = null;
  clock.t = data.clock.t;
  clock.day = data.clock.day;

  state.world.trees = new Map(data.trees ?? []);
  state.world.boulders = new Map(data.boulders ?? []);
  state.world.pebbles = new Map(data.pebbles ?? []);
  state.world.structures = data.structures ?? [];
  state.world.nextStructureId = data.nextStructureId ?? 1;
  state.world.vines = new Map(data.vines ?? []);
  (data.appleTrees ?? []).forEach((pickedDay, i) => {
    if (state.world.appleTrees[i]) state.world.appleTrees[i].pickedDay = pickedDay;
  });
  state.world.stoveFuel = data.stoveFuel ?? 0;
  state.world.lightUpDay = data.lightUpDay ?? -99;
  state.world.tributeDay = data.tributeDay ?? -99;
  state.world.blessedUntilDay = data.blessedUntilDay ?? -99;

  player.x = data.player.x;
  player.z = data.player.z;
  player.yaw = data.player.yaw;
  player.health = data.player.health;
  player.hunger = data.player.hunger ?? player.hunger;
  player.thirst = data.player.thirst ?? player.thirst;
  player.warmth = data.player.warmth ?? player.warmth;
  return true;
}

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Нечего чистить.
  }
}

export function hasSave(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return false;
  }
}
