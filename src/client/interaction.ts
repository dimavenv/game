import * as THREE from 'three';
import { APPLES, CHOP, INTERACT, STONES, WINE } from '../shared/balance';
import type { PlacedStructure } from '../shared/world/building';
import { countItem } from '../shared/inventory';
import {
  applesReady,
  isBoulderBroken,
  isPebbleTaken,
  isTreeDown,
  plantedVineReady,
  vineReady,
  type GameState,
} from '../shared/state';
import type { PlayerState } from '../shared/movement';
import type { WorldData } from '../shared/world/worldgen';

export type TargetKind =
  | 'buravchik'
  | 'tomer'
  | 'avi'
  | 'apple'
  | 'monument'
  | 'stove'
  | 'chair'
  | 'catamaran'
  | 'gazebo'
  | 'swing'
  | 'pebble'
  | 'vine'
  | 'structure';

export interface Target {
  kind: TargetKind;
  /** Индекс яблони или камешка; для постройки — её id. */
  index: number;
  /** Ник для всплывающей подписи (только у людей). */
  name?: string;
  labelPoint?: THREE.Vector3;
  hint: string;
  distance: number;
  /** Чем выше, тем важнее: люди перебивают мебель, стоящую вплотную. */
  priority: number;
}

export interface InteractionPoints {
  buravchik: THREE.Vector3;
  tomer: THREE.Vector3;
  monument: THREE.Vector3;
  /** Ави появляется только ночью, днём здесь null. */
  avi: THREE.Vector3 | null;
  stove: THREE.Vector3;
  chair: THREE.Vector3;
  /** Корма катамарана: отсюда на него садятся. */
  catamaran: THREE.Vector3;
  /** Лавка в беседке на вершине Петушка. */
  gazebo: THREE.Vector3;
  /** Перекладина тарзанки. */
  swing: THREE.Vector3;
  appleTrees: THREE.Vector3[];
  pebbles: THREE.Vector3[];
  vines: THREE.Vector3[];
}

/**
 * Ищет, с чем игрок может взаимодействовать. Учитывает и расстояние, и то,
 * куда он смотрит: подойти вплотную спиной и нажать E не выйдет.
 */
export class Interactions {
  constructor(
    private readonly world: WorldData,
    private readonly points: InteractionPoints,
  ) {}

  /** Постройка по id — нужна, чтобы открыть сундук. */
  static structureById(state: GameState, id: number): PlacedStructure | undefined {
    return state.world.structures.find((s) => s.id === id);
  }

  private facing(player: PlayerState, x: number, z: number): number {
    const dx = x - player.x;
    const dz = z - player.z;
    const len = Math.hypot(dx, dz) || 1;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    return (dx / len) * fx + (dz / len) * fz;
  }

  find(player: PlayerState, state: GameState, day: number): Target | null {
    let best: Target | null = null;
    const consider = (t: Target | null): void => {
      if (!t) return;
      if (!best) {
        best = t;
        return;
      }
      if (t.priority > best.priority) best = t;
      else if (t.priority === best.priority && t.distance < best.distance) best = t;
    };

    const near = (p: THREE.Vector3, range: number, minFacing: number): number | null => {
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d > range) return null;
      if (this.facing(player, p.x, p.z) < minFacing) return null;
      return d;
    };

    const bur = near(this.points.buravchik, INTERACT.npcRange, 0.35);
    if (bur !== null) {
      consider({
        kind: 'buravchik',
        index: -1,
        name: 'Буравчик',
        labelPoint: this.points.buravchik,
        hint: 'E — говорить',
        distance: bur,
        priority: 3,
      });
    }

    const tomer = near(this.points.tomer, INTERACT.npcRange, 0.35);
    if (tomer !== null) {
      consider({
        kind: 'tomer',
        index: -1,
        name: 'Томер Загур',
        labelPoint: this.points.tomer,
        hint: 'E — торговать',
        distance: tomer,
        priority: 3,
      });
    }

    if (this.points.avi) {
      const avi = near(this.points.avi, INTERACT.npcRange, 0.3);
      if (avi !== null) {
        consider({
          kind: 'avi',
          index: -1,
          name: 'Ави Загур',
          labelPoint: this.points.avi,
          hint: 'E — говорить',
          distance: avi,
          priority: 3,
        });
      }
    }

    const mon = near(this.points.monument, INTERACT.range, 0.3);
    if (mon !== null) {
      const ready = day - state.world.tributeDay >= 3;
      consider({
        kind: 'monument',
        index: -1,
        hint: ready ? 'E — отдать дань уважения' : 'Серёга Пират уже почтён',
        distance: mon,
        priority: 2,
      });
    }

    const stove = near(this.points.stove, INTERACT.range, 0.2);
    if (stove !== null) {
      const logs = countItem(state.inventory, 'log');
      consider({
        kind: 'stove',
        index: -1,
        hint: logs > 0 ? 'E — подбросить дров' : 'дров нет',
        distance: stove,
        priority: 1,
      });
    }

    const chair = near(this.points.chair, INTERACT.range, 0.2);
    if (chair !== null) {
      consider({ kind: 'chair', index: -1, hint: 'E — сесть', distance: chair, priority: 0 });
    }

    const catamaran = near(this.points.catamaran, INTERACT.range + 0.6, 0.2);
    if (catamaran !== null) {
      consider({ kind: 'catamaran', index: -1, hint: 'E — сесть на катамаран', distance: catamaran, priority: 1 });
    }

    // Лавка идёт по дальней стороне: до неё с настила чуть дальше обычного.
    const gazebo = near(this.points.gazebo, INTERACT.range + 1.2, 0.15);
    if (gazebo !== null) {
      consider({ kind: 'gazebo', index: -1, hint: 'E — сесть на лавку', distance: gazebo, priority: 0 });
    }

    const swing = near(this.points.swing, INTERACT.range + 1.2, 0.2);
    if (swing !== null) {
      consider({ kind: 'swing', index: -1, hint: 'E — схватиться за трос', distance: swing, priority: 2 });
    }

    // Постройки, с которыми есть что делать.
    for (const s of state.world.structures) {
      const range = s.kind === 'cellar' ? INTERACT.range + 1.4 : INTERACT.range;
      const d = Math.hypot(s.x - player.x, s.z - player.z);
      if (d > range) continue;
      if (this.facing(player, s.x, s.z) < 0.2) continue;

      let hint: string | null = null;
      if (s.kind === 'chest') hint = 'E — сундук';
      else if (s.kind === 'press') hint = 'E — топтать виноград';
      else if (s.kind === 'cellar') hint = 'E — погреб';
      else if (s.kind === 'vine') {
        hint = plantedVineReady(s, day, WINE.saplingGrowDays, WINE.vineRegrowDays)
          ? 'E — срезать грозди'
          : 'лоза ещё не поспела';
      }
      if (!hint) continue;
      consider({ kind: 'structure', index: s.id, hint, distance: d, priority: 2 });
    }

    this.points.vines.forEach((p, index) => {
      const d = near(p, WINE.range, 0.2);
      if (d === null) return;
      const ready = vineReady(state, index, day, WINE.vineRegrowDays);
      consider({
        kind: 'vine',
        index,
        hint: ready ? 'E — срезать грозди' : 'грозди уже срезаны',
        distance: d,
        priority: 2,
      });
    });

    this.points.pebbles.forEach((p, index) => {
      if (isPebbleTaken(state, index, day, STONES.pebbleRegrowDays)) return;
      const d = near(p, STONES.range, 0.15);
      if (d === null) return;
      consider({ kind: 'pebble', index, hint: 'E — подобрать камень', distance: d, priority: 1 });
    });

    this.points.appleTrees.forEach((p, index) => {
      const d = near(p, APPLES.range + 1.2, 0.2);
      if (d === null) return;
      if (!applesReady(state, index, day, APPLES.regrowDays)) {
        consider({ kind: 'apple', index, hint: 'яблоки уже собраны', distance: d, priority: 2 });
        return;
      }
      consider({ kind: 'apple', index, hint: 'E — нарвать яблок', distance: d, priority: 2 });
    });

    return best;
  }

  /** Ближайший целый валун под молот. */
  findBoulder(player: PlayerState, state: GameState, day: number, rocks: THREE.Vector3[]): number | null {
    let best: number | null = null;
    let bestDistance = Infinity;
    rocks.forEach((p, index) => {
      if (isBoulderBroken(state, index, day, STONES.boulderRegrowDays)) return;
      const d = Math.hypot(p.x - player.x, p.z - player.z);
      if (d > STONES.range || d > bestDistance) return;
      if (this.facing(player, p.x, p.z) < 0.4) return;
      best = index;
      bestDistance = d;
    });
    return best;
  }

  /** Ближайшее дерево под топор: строго перед игроком и в пределах замаха. */
  findTree(player: PlayerState, state: GameState, day: number): number | null {
    const near = this.world.obstacles.query(player.x, player.z, CHOP.range + 1);
    let bestIndex: number | null = null;
    let bestScore = -Infinity;
    for (const o of near) {
      if (o.id < 0) continue;
      if (isTreeDown(state, o.id, day, CHOP.regrowDays)) continue;
      const d = Math.hypot(o.x - player.x, o.z - player.z);
      if (d > CHOP.range) continue;
      const facing = this.facing(player, o.x, o.z);
      if (facing < 0.55) continue;
      const score = facing - d * 0.1;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = o.id;
      }
    }
    return bestIndex;
  }
}
