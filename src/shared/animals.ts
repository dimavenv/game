import { ANIMALS, WORLD } from './balance';
import type { PlayerState } from './movement';
import { clamp } from './rng';
import { Terrain } from './world/terrain';
import type { WorldData } from './world/worldgen';

/**
 * Живность. Зайцы, косули, кабаны, коровы и утки живут своей жизнью: пасутся,
 * бродят между кустами, разбегаются от человека. Кабан — исключение: он не
 * убегает, а идёт разбираться.
 *
 * Логика лежит в shared намеренно: когда появится сервер, стадо будет считать
 * он, а клиент только рисовать.
 */

export type AnimalKind = 'hare' | 'boar' | 'cow' | 'deer' | 'duck';

export const ANIMAL_NAME: Record<AnimalKind, string> = {
  hare: 'заяц',
  boar: 'кабан',
  cow: 'корова',
  deer: 'косуля',
  duck: 'утка',
};

export type AnimalState = 'graze' | 'walk' | 'flee' | 'charge' | 'dead';

export interface Animal {
  id: number;
  kind: AnimalKind;
  x: number;
  z: number;
  y: number;
  yaw: number;
  state: AnimalState;
  /** Сколько осталось до смены поведения. */
  timer: number;
  targetX: number;
  targetZ: number;
  /** Дом: далеко от него зверь не уходит. */
  homeX: number;
  homeZ: number;
  health: number;
  /** Пауза между ударами кабана. */
  attackTimer: number;
  deadFor: number;
  /** Текущая скорость и фаза шага — по ней рисуется бег. */
  speed: number;
  phase: number;
}

function spec(kind: AnimalKind) {
  return ANIMALS[kind];
}

/** Годится ли точка этому зверю: утки только на воде, остальные только на суше. */
function suits(kind: AnimalKind, terrain: Terrain, x: number, z: number): boolean {
  if (Math.abs(x) > WORLD.bound - 12 || Math.abs(z) > WORLD.bound - 12) return false;
  const surface = terrain.surface(x, z);
  if (kind === 'duck') {
    // Утки держатся озера и подальше от берега.
    return Terrain.lakeDistance(x, z) < WORLD.lakeHalf - 4 && surface === 'water';
  }
  if (surface !== 'grass') return false;
  if (terrain.slope(x, z) > 0.45) return false;
  return true;
}

export function spawnAnimals(rng: () => number, world: WorldData): Animal[] {
  const out: Animal[] = [];
  let id = 0;
  const kinds: AnimalKind[] = ['hare', 'boar', 'cow', 'deer', 'duck'];

  for (const kind of kinds) {
    const s = spec(kind);
    let guard = s.count * 200;
    let placed = 0;
    while (placed < s.count && guard-- > 0) {
      let x: number;
      let z: number;
      if (kind === 'cow') {
        // Коровы пасутся вокруг поляны: они домашние, в чащу им незачем.
        const a = rng() * Math.PI * 2;
        const r = 22 + rng() * 45;
        x = WORLD.clearing.x + Math.cos(a) * r;
        z = WORLD.clearing.z + Math.sin(a) * r;
      } else if (kind === 'duck') {
        x = (rng() * 2 - 1) * (WORLD.lakeHalf - 6);
        z = (rng() * 2 - 1) * (WORLD.lakeHalf - 6);
      } else {
        x = (rng() * 2 - 1) * (WORLD.bound - 40);
        z = (rng() * 2 - 1) * (WORLD.bound - 40);
      }
      if (!suits(kind, world.terrain, x, z)) continue;

      out.push({
        id: id++,
        kind,
        x,
        z,
        y: kind === 'duck' ? WORLD.waterLevel : world.terrain.height(x, z),
        yaw: rng() * Math.PI * 2,
        state: 'graze',
        timer: rng() * 4,
        targetX: x,
        targetZ: z,
        homeX: x,
        homeZ: z,
        health: s.health,
        attackTimer: 0,
        deadFor: 0,
        speed: 0,
        phase: rng() * 10,
      });
      placed++;
    }
  }
  return out;
}

/** Новая точка, куда побрести: недалеко от дома и по своей стихии. */
function pickTarget(a: Animal, terrain: Terrain, rng: () => number): void {
  const s = spec(a.kind);
  for (let i = 0; i < 8; i++) {
    const angle = rng() * Math.PI * 2;
    const r = 4 + rng() * s.roam;
    const x = a.homeX + Math.cos(angle) * r;
    const z = a.homeZ + Math.sin(angle) * r;
    if (!suits(a.kind, terrain, x, z)) continue;
    a.targetX = x;
    a.targetZ = z;
    return;
  }
  a.targetX = a.homeX;
  a.targetZ = a.homeZ;
}

export interface AnimalStep {
  /** Урон, который кабаны успели нанести за этот кадр. */
  damage: number;
}

export function stepAnimals(
  animals: Animal[],
  player: PlayerState,
  world: WorldData,
  dt: number,
  rng: () => number,
): AnimalStep {
  let damage = 0;
  const terrain = world.terrain;

  for (const a of animals) {
    if (a.state === 'dead') {
      a.deadFor += dt;
      a.speed = 0;
      continue;
    }

    const s = spec(a.kind);
    const dx = player.x - a.x;
    const dz = player.z - a.z;
    const toPlayer = Math.hypot(dx, dz);
    // Далёкие звери шевелятся вполсилы: считать всю карту незачем.
    if (toPlayer > ANIMALS.simulateRange) {
      a.speed = 0;
      continue;
    }

    a.timer -= dt;
    a.attackTimer = Math.max(0, a.attackTimer - dt);

    if (s.charge > 0 && toPlayer < s.charge && a.state !== 'charge') {
      a.state = 'charge';
      a.timer = 6;
    } else if (s.flee > 0 && toPlayer < s.flee && a.state !== 'flee') {
      a.state = 'flee';
      a.timer = 2.5 + rng() * 2;
    } else if (a.timer <= 0) {
      if (a.state === 'flee' || a.state === 'charge') {
        a.state = 'graze';
        a.timer = 2 + rng() * 4;
      } else if (a.state === 'graze') {
        a.state = 'walk';
        a.timer = 3 + rng() * 5;
        pickTarget(a, terrain, rng);
      } else {
        a.state = 'graze';
        a.timer = 2.5 + rng() * 5;
      }
    }

    let wishX = 0;
    let wishZ = 0;
    let speed = 0;

    if (a.state === 'flee') {
      // Бежит строго от игрока, чуть забирая в сторону.
      const len = Math.max(toPlayer, 0.001);
      wishX = -dx / len;
      wishZ = -dz / len;
      const turn = Math.sin(a.phase * 0.7) * 0.35;
      const cos = Math.cos(turn);
      const sin = Math.sin(turn);
      [wishX, wishZ] = [wishX * cos - wishZ * sin, wishX * sin + wishZ * cos];
      speed = s.run;
    } else if (a.state === 'charge') {
      const len = Math.max(toPlayer, 0.001);
      wishX = dx / len;
      wishZ = dz / len;
      speed = toPlayer > 2 ? s.run : s.walk;
      if (toPlayer < 1.8 && a.attackTimer <= 0) {
        damage += s.damage;
        a.attackTimer = s.cooldown;
      }
      // Долго гоняться не станет: отбежал — и хватит.
      if (toPlayer > s.charge * 2.2) {
        a.state = 'graze';
        a.timer = 3;
      }
    } else if (a.state === 'walk') {
      const tx = a.targetX - a.x;
      const tz = a.targetZ - a.z;
      const len = Math.hypot(tx, tz);
      if (len < 1.2) {
        a.state = 'graze';
        a.timer = 2 + rng() * 5;
      } else {
        wishX = tx / len;
        wishZ = tz / len;
        speed = s.walk;
      }
    }

    if (speed > 0) {
      const nx = a.x + wishX * speed * dt;
      const nz = a.z + wishZ * speed * dt;
      if (suits(a.kind, terrain, nx, nz)) {
        a.x = nx;
        a.z = nz;
      } else {
        // Упёрся в воду, обрыв или край мира — разворачиваем.
        pickTarget(a, terrain, rng);
        a.state = 'walk';
        a.timer = 2 + rng() * 3;
        speed = 0;
      }
      const want = Math.atan2(wishX, wishZ);
      let diff = want - a.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      a.yaw += diff * Math.min(1, dt * 6);
    }

    a.speed = speed;
    a.phase += dt * (1 + speed);
    a.y = a.kind === 'duck' ? WORLD.waterLevel : terrain.height(a.x, a.z);
  }

  return { damage: clamp(damage, 0, 100) };
}

/** Урон зверю. true — добит. */
export function damageAnimal(a: Animal, amount: number): boolean {
  if (a.state === 'dead') return false;
  a.health -= amount;
  if (a.health > 0) {
    // Раненый удирает, кабан наоборот звереет.
    a.state = spec(a.kind).charge > 0 ? 'charge' : 'flee';
    a.timer = 5;
    return false;
  }
  a.state = 'dead';
  a.deadFor = 0;
  return true;
}

/** Ближайший зверь в секторе перед игроком — для топора. */
export function findAnimalTarget(
  animals: Animal[],
  player: PlayerState,
  range: number,
  arc: number,
): Animal | null {
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  let best: Animal | null = null;
  let bestD = Infinity;
  for (const a of animals) {
    if (a.state === 'dead') continue;
    const dx = a.x - player.x;
    const dz = a.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > range || d > bestD) continue;
    if ((dx / d) * fx + (dz / d) * fz < 1 - arc) continue;
    best = a;
    bestD = d;
  }
  return best;
}

/** Кого зацепило дробью: конус перед игроком с падением урона по дальности. */
export function shotAnimals(
  animals: Animal[],
  player: PlayerState,
  range: number,
  spread: number,
): { animal: Animal; damage: number }[] {
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const out: { animal: Animal; damage: number }[] = [];
  for (const a of animals) {
    if (a.state === 'dead') continue;
    const dx = a.x - player.x;
    const dz = a.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > range) continue;
    if ((dx / d) * fx + (dz / d) * fz < 1 - spread) continue;
    out.push({ animal: a, damage: 1 - clamp(d / range, 0, 1) });
  }
  return out;
}
