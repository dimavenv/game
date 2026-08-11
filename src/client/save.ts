import type { PlayerState } from '../shared/movement';
import type { ActiveQuest } from '../shared/quests';
import type { GameState, Inventory, TreeMutation } from '../shared/state';
import type { WorldClock } from '../shared/time';

const KEY = 'krugloe-ozero-save';
const VERSION = 1;

interface SaveData {
  version: number;
  inventory: Inventory;
  quest: ActiveQuest | null;
  questsDone: number;
  clock: WorldClock;
  trees: [number, TreeMutation][];
  appleTrees: (number | null)[];
  stoveFuel: number;
  lightUpDay: number;
  tributeDay: number;
  blessedUntilDay: number;
  player: { x: number; z: number; yaw: number; health: number };
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
    clock: { t: clock.t, day: clock.day },
    trees: [...state.world.trees.entries()],
    appleTrees: state.world.appleTrees.map((a) => a.pickedDay),
    stoveFuel: state.world.stoveFuel,
    lightUpDay: state.world.lightUpDay,
    tributeDay: state.world.tributeDay,
    blessedUntilDay: state.world.blessedUntilDay,
    player: { x: player.x, z: player.z, yaw: player.yaw, health: player.health },
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
  clock.t = data.clock.t;
  clock.day = data.clock.day;

  state.world.trees = new Map(data.trees ?? []);
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
