import * as THREE from 'three';
import { APPLES, CHOP, INTERACT } from '../shared/balance';
import { applesReady, isTreeDown, type GameState } from '../shared/state';
import type { PlayerState } from '../shared/movement';
import type { WorldData } from '../shared/world/worldgen';

export type TargetKind = 'buravchik' | 'tomer' | 'apple' | 'monument' | 'stove' | 'chair';

export interface Target {
  kind: TargetKind;
  /** Индекс яблони, если это яблоня. */
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
  stove: THREE.Vector3;
  chair: THREE.Vector3;
  appleTrees: THREE.Vector3[];
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
      const logs = state.inventory.logs;
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
