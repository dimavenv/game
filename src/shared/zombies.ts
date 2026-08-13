import { WEAPONS, WORLD, ZOMBIE } from './balance';
import type { PlayerState } from './movement';
import { clamp } from './rng';
import { caveHitAt, clampToCave, type Cave } from './world/caves';
import type { Obstacle } from './world/grid';
import type { WorldData } from './world/worldgen';

export type ZombieState = 'wander' | 'chase' | 'attack' | 'dying';

export interface Zombie {
  id: number;
  x: number;
  z: number;
  y: number;
  yaw: number;
  health: number;
  state: ZombieState;
  /** Куда бредёт, пока не заметил игрока. */
  goalX: number;
  goalZ: number;
  goalTimer: number;
  attackTimer: number;
  stagger: number;
  /** Время с момента смерти — по нему проигрывается оседание. */
  deadFor: number;
  /** Фаза шага, чтобы каждый ковылял по-своему. */
  phase: number;
  /** id пещеры, если это её обитатель. Такие наружу не выходят. */
  cave?: number;
}

export interface ZombieHit {
  /** Урон, который зомби нанёс игроку за этот шаг. */
  damage: number;
}

function distanceToClearing(x: number, z: number): number {
  return Math.hypot(x - WORLD.clearing.x, z - WORLD.clearing.z);
}

/** Сколько тварей выходит в ночь номер n. */
export function zombieCount(night: number): number {
  return Math.min(ZOMBIE.baseCount + Math.max(0, night - 1) * ZOMBIE.perNight, ZOMBIE.maxCount);
}

/**
 * Появляются в чаще, подальше от игрока и никогда — на поляне.
 * Поляна с хижиной и костром остаётся единственным безопасным местом.
 */
export function spawnZombies(
  rng: () => number,
  world: WorldData,
  count: number,
  player: PlayerState,
  startId: number,
): Zombie[] {
  const out: Zombie[] = [];
  let guard = count * 60;
  while (out.length < count && guard-- > 0) {
    // Лес большой, поэтому стая появляется кольцом вокруг игрока.
    const angle = rng() * Math.PI * 2;
    const radius = ZOMBIE.spawnMinDistance + rng() * (ZOMBIE.spawnMaxDistance - ZOMBIE.spawnMinDistance);
    const x = player.x + Math.cos(angle) * radius;
    const z = player.z + Math.sin(angle) * radius;
    if (Math.abs(x) > WORLD.bound - 6 || Math.abs(z) > WORLD.bound - 6) continue;
    if (world.terrain.surface(x, z) === 'water') continue;
    if (distanceToClearing(x, z) < ZOMBIE.safeRadius + 12) continue;
    out.push({
      id: startId + out.length,
      x,
      z,
      y: world.terrain.height(x, z),
      yaw: rng() * Math.PI * 2,
      health: ZOMBIE.health,
      state: 'wander',
      goalX: x,
      goalZ: z,
      goalTimer: 0,
      attackTimer: 0,
      stagger: 0,
      deadFor: 0,
      phase: rng() * Math.PI * 2,
    });
  }
  return out;
}

/**
 * Обитатели пещеры. Стоят по залам подальше от зева, чтобы с порога их не
 * было видно, и никогда не выходят наружу: движение прижимается к ходу.
 */
export function spawnCaveZombies(rng: () => number, cave: Cave, startId: number): Zombie[] {
  // Годятся залы, до которых от входа уже прилично идти.
  const deep = cave.nodes.filter(
    (node) => Math.hypot(node.x - cave.mouth.x, node.z - cave.mouth.z) > ZOMBIE.cave.fromMouth,
  );
  if (deep.length === 0) return [];

  const out: Zombie[] = [];
  for (let i = 0; i < ZOMBIE.cave.count; i++) {
    const node = deep[Math.floor(rng() * deep.length) % deep.length];
    // Разводим внутри зала, но не в самую стену.
    const angle = rng() * Math.PI * 2;
    const r = rng() * Math.max(0, node.radius - 0.8);
    out.push({
      id: startId + i,
      x: node.x + Math.cos(angle) * r,
      z: node.z + Math.sin(angle) * r,
      y: node.y,
      yaw: rng() * Math.PI * 2,
      health: ZOMBIE.health,
      state: 'wander',
      goalX: node.x,
      goalZ: node.z,
      goalTimer: 0,
      attackTimer: 0,
      stagger: 0,
      deadFor: 0,
      phase: rng() * Math.PI * 2,
      cave: cave.id,
    });
  }
  return out;
}

const scratch: Obstacle[] = [];

/**
 * Шаг пещерного: ни рельеф, ни поляна ему не указ — он ходит по полу хода и
 * упирается в его стены. Возвращает false, если пещеры под ним нет (значит,
 * его вынесло куда-то не туда — такого просто не двигаем).
 */
function slideInCave(cave: Cave, z: Zombie, nx: number, nz: number): void {
  const clamped = clampToCave(cave, z.x, z.z, nx, nz, z.y);
  if (!clamped) return;
  const hit = caveHitAt(cave, clamped[0], clamped[1], z.y);
  if (!hit) return;
  z.x = clamped[0];
  z.z = clamped[1];
  z.y = hit.floor;
}

/** Обходит стволы: если упёрся, сдвигается вбок. */
function slide(world: WorldData, z: Zombie, nx: number, nz: number): void {
  let px = nx;
  let pz = nz;
  const near = world.obstacles.query(px, pz, 2, scratch);
  for (const o of near) {
    if (o.disabled) continue;
    const dx = px - o.x;
    const dz = pz - o.z;
    const min = o.radius + 0.45;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min) {
      const d = Math.sqrt(d2) || 1e-4;
      px = o.x + (dx / d) * min;
      pz = o.z + (dz / d) * min;
    }
  }
  if (Math.abs(px) > WORLD.bound || Math.abs(pz) > WORLD.bound) return;
  if (world.terrain.depth(px, pz) > 0.3) return;
  // К поляне не подходят: у костра их нет.
  if (distanceToClearing(px, pz) < ZOMBIE.safeRadius) return;
  z.x = px;
  z.z = pz;
}

/**
 * Шаг стаи. Возвращает суммарный урон игроку — так клиенту не нужно
 * знать про внутренности ИИ, а серверу потом хватит того же вызова.
 */
export function stepZombies(
  zombies: Zombie[],
  player: PlayerState,
  world: WorldData,
  dt: number,
  rng: () => number,
): ZombieHit {
  let damage = 0;
  const onClearing = distanceToClearing(player.x, player.z) < ZOMBIE.safeRadius;

  for (const z of zombies) {
    if (z.state === 'dying') {
      z.deadFor += dt;
      continue;
    }

    z.phase += dt;
    if (z.stagger > 0) {
      z.stagger -= dt;
      continue;
    }

    // Пещерному поляна не убежище: он про неё и не знает, он сидит в горе.
    const cave = z.cave === undefined ? null : world.caves[z.cave] ?? null;
    const playerSafe = cave ? false : onClearing;

    const dx = player.x - z.x;
    const dz = player.z - z.z;
    const distance = Math.hypot(dx, dz);

    // На поляне игрока не преследуют — там их просто нет.
    const canChase = !playerSafe && distance < ZOMBIE.sightRange;
    // Важно не перебивать состояние 'attack': иначе замах сбрасывается каждый кадр.
    if (canChase && z.state === 'wander') z.state = 'chase';
    else if (z.state !== 'wander' && (playerSafe || distance > ZOMBIE.loseRange)) z.state = 'wander';

    if (z.state === 'chase' || z.state === 'attack') {
      z.yaw = Math.atan2(dx, dz);
      if (distance <= ZOMBIE.attackRange) {
        // Замах у каждого свой, иначе толпа сносит игрока одним залпом.
        if (z.state !== 'attack') z.attackTimer = 0.3 + rng() * ZOMBIE.attackCooldown;
        z.state = 'attack';
        z.attackTimer -= dt;
        if (z.attackTimer <= 0) {
          z.attackTimer = ZOMBIE.attackCooldown;
          damage += ZOMBIE.damage;
        }
      } else {
        z.state = 'chase';
        const speed = ZOMBIE.chaseSpeed;
        const nx = z.x + (dx / distance) * speed * dt;
        const nz = z.z + (dz / distance) * speed * dt;
        if (cave) slideInCave(cave, z, nx, nz);
        else slide(world, z, nx, nz);
      }
    } else {
      z.goalTimer -= dt;
      if (z.goalTimer <= 0) {
        z.goalTimer = 4 + rng() * 6;
        // В ходу далеко не забредёшь — цель выбирается поближе.
        const reach = cave ? 6 : 14;
        z.goalX = z.x + (rng() * 2 - 1) * reach;
        z.goalZ = z.z + (rng() * 2 - 1) * reach;
      }
      const gx = z.goalX - z.x;
      const gz = z.goalZ - z.z;
      const gd = Math.hypot(gx, gz);
      if (gd > 0.5) {
        z.yaw = Math.atan2(gx, gz);
        const speed = ZOMBIE.walkSpeed;
        const nx = z.x + (gx / gd) * speed * dt;
        const nz = z.z + (gz / gd) * speed * dt;
        if (cave) slideInCave(cave, z, nx, nz);
        else slide(world, z, nx, nz);
      }
    }

    // Пещерному высоту задаёт пол хода: рельеф-то у него над головой.
    if (!cave) z.y = world.terrain.height(z.x, z.z);
  }

  return { damage };
}

/** Урон зомби. Возвращает true, если этот удар его добил. */
export function damageZombie(z: Zombie, amount: number, stagger = true): boolean {
  if (z.state === 'dying') return false;
  z.health -= amount;
  if (stagger) z.stagger = ZOMBIE.staggerTime;
  if (z.health <= 0) {
    z.state = 'dying';
    z.deadFor = 0;
    return true;
  }
  return false;
}

/** Кого достанет удар топором: ближайший в конусе перед игроком. */
export function findMeleeTarget(
  zombies: Zombie[],
  player: PlayerState,
  range: number,
  arc: number,
): Zombie | null {
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  let best: Zombie | null = null;
  let bestDistance = Infinity;
  for (const z of zombies) {
    if (z.state === 'dying') continue;
    const dx = z.x - player.x;
    const dz = z.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > range || d > bestDistance) continue;
    const facing = (dx / d) * fx + (dz / d) * fz;
    if (facing < 1 - arc) continue;
    best = z;
    bestDistance = d;
  }
  return best;
}

/** Разброс дроби: попадает во всех в узком конусе, урон падает с расстоянием. */
export function shotgunTargets(
  zombies: Zombie[],
  player: PlayerState,
  range: number,
  spread: number,
): { zombie: Zombie; damage: number }[] {
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const out: { zombie: Zombie; damage: number }[] = [];
  for (const z of zombies) {
    if (z.state === 'dying') continue;
    const dx = z.x - player.x;
    const dz = z.z - player.z;
    const d = Math.hypot(dx, dz);
    if (d > range) continue;
    const facing = (dx / d) * fx + (dz / d) * fz;
    if (facing < 1 - spread) continue;
    const t = clamp(d / range, 0, 1);
    const { nearDamage, farDamage } = WEAPONS.shotgun;
    const damage = nearDamage + (farDamage - nearDamage) * t;
    out.push({ zombie: z, damage });
  }
  return out;
}
