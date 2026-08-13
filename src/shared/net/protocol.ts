import type { Animal, AnimalKind, AnimalState } from '../animals';
import type { PlacedStructure } from '../world/building';
import type { Zombie, ZombieState } from '../zombies';

/**
 * Словарь, на котором разговаривают клиент и сервер. Лежит в shared, потому
 * что обе стороны собираются из одного и того же кода и разъехаться не могут.
 *
 * Кто чем владеет:
 *
 * - Сервер: время суток и день, мутации леса (срубленные деревья, обобранные
 *   яблони, разбитые валуны, камешки, лозы), все постройки и их содержимое,
 *   дрова в печи, стадо, мертвецы и место, где сегодня стоит Ави.
 * - Клиент: своя позиция, свой рюкзак, здоровье, голод и личный прогресс
 *   (найденные пещеры, квесты, дань Серёге). Сервер их только хранит между
 *   заходами — играем с друзьями, античит тут никому не нужен.
 *
 * Всё ходит обычным JSON: двое-трое игроков, десяток килобайт в секунду.
 */

export const PROTOCOL_VERSION = 1;

/** Сколько раз в секунду сервер шлёт снимок мира и клиент — свою позицию. */
export const SNAPSHOT_HZ = 12;
export const MOVE_HZ = 20;
/** Шаг симуляции сервера. */
export const SERVER_TICK_HZ = 30;

/** Поза чужого игрока: по ней рисуются ноги, руки и наклон головы. */
export interface PlayerWire {
  id: number;
  name: string;
  x: number;
  /** Высота пола под ним. */
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  /** Метры в секунду: по ним шагают ноги. */
  speed: number;
  /** Что в руках: номер слота (0 — пусто). */
  slot: number;
  /** Сидит, приседает, в воде, мёртв. */
  flags: number;
  health: number;
}

export const POSE = {
  crouch: 1,
  sit: 2,
  swim: 4,
  dead: 8,
} as const;

/** Зверь по проводу: только то, что нужно нарисовать и по чему кликнуть. */
export interface AnimalWire {
  i: number;
  k: AnimalKind;
  x: number;
  y: number;
  z: number;
  r: number;
  s: AnimalState;
  /** Скорость и фаза шага: без них ноги дёргаются на каждом снимке. */
  v: number;
  b: boolean;
}

export interface ZombieWire {
  i: number;
  x: number;
  y: number;
  z: number;
  r: number;
  s: ZombieState;
  /** Секунды с момента смерти: по ним проигрывается оседание. */
  d: number;
  /** id пещеры, если он оттуда. */
  c?: number;
}

/** Мутации мира. Их шлёт клиент, сервер применяет у себя и рассылает всем. */
export type WorldAction =
  | { t: 'tree'; index: number; hits: number; choppedDay: number | null }
  | { t: 'apple'; index: number; pickedDay: number | null }
  | { t: 'boulder'; index: number; hits: number; brokenDay: number | null }
  | { t: 'pebble'; index: number; day: number }
  | { t: 'vine'; index: number; day: number }
  /** Постройка целиком: их немного, а полей у них много. */
  | { t: 'structure'; structure: PlacedStructure }
  | { t: 'structureGone'; id: number }
  | { t: 'stove'; fuel: number };

/** Урон, который клиент нанёс твари. Считает сервер: стадо и стая — его. */
export type HitAction =
  | { t: 'animal'; id: number; damage: number }
  | { t: 'animalButcher'; id: number }
  | { t: 'zombie'; id: number; damage: number; stagger: boolean };

export type ClientMessage =
  | { t: 'hello'; version: number; name: string; token: string }
  | { t: 'move'; x: number; y: number; z: number; yaw: number; pitch: number; speed: number; slot: number; flags: number; health: number }
  | { t: 'world'; action: WorldAction }
  | { t: 'hit'; hit: HitAction }
  | { t: 'chat'; text: string }
  /** Личный прогресс на сохранение у сервера: рюкзак, квесты, найденное. */
  | { t: 'progress'; blob: string }
  | { t: 'pong'; time: number };

/** Общее состояние мира при заходе: дальше идут только изменения. */
export interface WorldSnapshot {
  trees: [number, number, number | null][];
  apples: [number, number | null][];
  boulders: [number, number, number | null][];
  pebbles: [number, number][];
  vines: [number, number][];
  structures: PlacedStructure[];
  nextStructureId: number;
  stoveFuel: number;
}

export type ServerMessage =
  | {
      t: 'welcome';
      version: number;
      id: number;
      seed: string;
      day: number;
      time: number;
      world: WorldSnapshot;
      /** Личный прогресс, который сервер помнит с прошлого захода. */
      progress: string | null;
      players: PlayerWire[];
    }
  /**
   * Ави сюда не попадает намеренно: его место считается из номера дня и сида
   * (aviSpot), то есть у обоих игроков и так совпадает.
   */
  | { t: 'state'; day: number; time: number; players: PlayerWire[]; animals: AnimalWire[]; zombies: ZombieWire[] }
  | { t: 'world'; action: WorldAction; from: number }
  | { t: 'join'; player: PlayerWire }
  | { t: 'leave'; id: number; name: string }
  /** Досталось от кабана или мертвеца — сервер считает это сам. */
  | { t: 'hurt'; amount: number }
  /** Зверь добит именно этим игроком: ему и трофей. */
  | { t: 'killed'; kind: 'animal' | 'zombie'; id: number }
  | { t: 'chat'; from: number; name: string; text: string }
  | { t: 'ping'; time: number }
  | { t: 'error'; text: string };

/** Полный зверь в проводном виде и обратно. */
export function animalToWire(a: Animal): AnimalWire {
  return {
    i: a.id,
    k: a.kind,
    x: round(a.x),
    y: round(a.y),
    z: round(a.z),
    r: round(a.yaw),
    s: a.state,
    v: round(a.speed),
    b: a.butchered,
  };
}

export function zombieToWire(z: Zombie): ZombieWire {
  const out: ZombieWire = {
    i: z.id,
    x: round(z.x),
    y: round(z.y),
    z: round(z.z),
    r: round(z.yaw),
    s: z.state,
    d: round(z.deadFor),
  };
  if (z.cave !== undefined) out.c = z.cave;
  return out;
}

/** Два знака после запятой: в сантиметрах никто разницы не увидит. */
function round(v: number): number {
  return Math.round(v * 100) / 100;
}
