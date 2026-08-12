import { PLAYER, WORLD } from './balance';
import { clamp } from './rng';
import { platformAt } from './world/buildings';
import type { Obstacle } from './world/grid';
import type { Surface } from './world/terrain';
import type { WorldData } from './world/worldgen';

/**
 * Состояние игрока и шаг симуляции. Лежит в shared намеренно: когда появится
 * сервер, он будет прогонять ровно этот же код по тем же вводам.
 */
export interface PlayerState {
  x: number;
  z: number;
  /** Высота глаз над уровнем воды. */
  eyeY: number;
  /** Высота ног: по ней считается прыжок. */
  feetY: number;
  /** Вертикальная скорость в прыжке. */
  vy: number;
  onGround: boolean;
  vx: number;
  vz: number;
  yaw: number;
  pitch: number;
  /** Остаток дыхания в секундах. */
  breath: number;
  exhausted: boolean;
  restTimer: number;
  speed: number;
  sprinting: boolean;
  surface: Surface;
  wading: boolean;
  /** Пройденный путь — по нему отмеряются шаги. */
  distance: number;
  health: number;
}

export interface MoveInput {
  forward: number;
  strafe: number;
  sprint: boolean;
  jump: boolean;
  /** Рюкзак набит: бег запрещён, шаг короче. */
  overloaded: boolean;
  /** Под приходом дыхание не сбивается. */
  noBreathDrain: boolean;
  dt: number;
  /** Множитель скорости от внешних эффектов (затяжка). */
  slowFactor: number;
  /** Текущий потолок дыхания с учётом выкуренного за день. */
  breathMax: number;
}

export function createPlayerState(world: WorldData): PlayerState {
  const { x, z, yaw } = world.spawn;
  return {
    x,
    z,
    eyeY: world.terrain.height(x, z) + PLAYER.eyeHeight,
    feetY: world.terrain.height(x, z),
    vy: 0,
    onGround: true,
    vx: 0,
    vz: 0,
    yaw,
    pitch: 0,
    breath: PLAYER.breathMax,
    exhausted: false,
    restTimer: 0,
    speed: 0,
    sprinting: false,
    surface: 'grass',
    wading: false,
    distance: 0,
    health: PLAYER.maxHealth,
  };
}

const scratch: Obstacle[] = [];

/** Пытается встать в точку, расталкивая игрока со стволов. null — нельзя. */
function resolve(world: WorldData, x: number, z: number): [number, number] | null {
  if (Math.abs(x) > WORLD.bound || Math.abs(z) > WORLD.bound) return null;
  // Над настилом моста глубина под ногами не важна.
  const deck = platformAt(world.platforms, x, z);
  if (deck === null && world.terrain.depth(x, z) > PLAYER.maxWadeDepth) return null;

  let px = x;
  let pz = z;
  const near = world.obstacles.query(px, pz, 2.5, scratch);
  for (const o of near) {
    if (o.disabled) continue;
    const dx = px - o.x;
    const dz = pz - o.z;
    const min = o.radius + PLAYER.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min) {
      const d = Math.sqrt(d2) || 1e-4;
      px = o.x + (dx / d) * min;
      pz = o.z + (dz / d) * min;
    }
  }

  // Стены и прилавки: выталкиваем по оси наименьшего проникновения.
  for (const b of world.boxes) {
    const dx = px - b.x;
    const dz = pz - b.z;
    const ox = b.hw + PLAYER.radius - Math.abs(dx);
    const oz = b.hd + PLAYER.radius - Math.abs(dz);
    if (ox > 0 && oz > 0) {
      if (ox < oz) px = b.x + Math.sign(dx || 1) * (b.hw + PLAYER.radius);
      else pz = b.z + Math.sign(dz || 1) * (b.hd + PLAYER.radius);
    }
  }

  // Ствол мог вытолкнуть в воду или за границу — тогда шаг не засчитываем.
  if (Math.abs(px) > WORLD.bound || Math.abs(pz) > WORLD.bound) return null;
  if (platformAt(world.platforms, px, pz) === null && world.terrain.depth(px, pz) > PLAYER.maxWadeDepth + 0.15) {
    return null;
  }
  return [px, pz];
}

export function stepPlayer(state: PlayerState, input: MoveInput, world: WorldData): void {
  const dt = input.dt;

  const fwdX = -Math.sin(state.yaw);
  const fwdZ = -Math.cos(state.yaw);
  const rightX = -fwdZ;
  const rightZ = fwdX;

  let wishX = fwdX * input.forward + rightX * input.strafe;
  let wishZ = fwdZ * input.forward + rightZ * input.strafe;
  const wishLen = Math.hypot(wishX, wishZ);
  if (wishLen > 1e-4) {
    wishX /= wishLen;
    wishZ /= wishLen;
  }

  const deck = platformAt(world.platforms, state.x, state.z);
  const depth = deck === null ? world.terrain.depth(state.x, state.z) : 0;
  state.wading = depth > 0.02;
  state.surface = deck === null ? world.terrain.surface(state.x, state.z) : 'grass';

  const wantsSprint = input.sprint && wishLen > 0.1 && !state.wading && !input.overloaded;
  const canSprint = wantsSprint && !state.exhausted && state.breath > 0;
  state.sprinting = canSprint;

  if (canSprint) {
    if (!input.noBreathDrain) state.breath -= dt;
    state.restTimer = 0;
    if (state.breath <= 0) {
      state.breath = 0;
      state.exhausted = true;
    }
  } else {
    state.restTimer += dt;
    if (state.restTimer > PLAYER.breathRegenDelay) {
      state.breath = Math.min(input.breathMax, state.breath + PLAYER.breathRegen * dt);
    }
    if (state.exhausted && state.breath >= input.breathMax * PLAYER.breathRecoverTo) {
      state.exhausted = false;
    }
  }
  state.breath = Math.min(state.breath, input.breathMax);

  let target = state.wading
    ? PLAYER.wadeSpeed
    : canSprint
      ? PLAYER.sprintSpeed
      : PLAYER.walkSpeed;
  target *= input.slowFactor;
  if (input.overloaded) target *= PLAYER.overloadSpeedFactor;
  // Идти в горку тяжелее, чем под горку.
  target *= 1 - clamp(world.terrain.slope(state.x, state.z), 0, 0.35);

  const targetVX = wishX * target * Math.min(wishLen, 1);
  const targetVZ = wishZ * target * Math.min(wishLen, 1);
  const rate = wishLen > 0.1 ? PLAYER.accel : PLAYER.friction;
  state.vx += (targetVX - state.vx) * Math.min(1, rate * dt);
  state.vz += (targetVZ - state.vz) * Math.min(1, rate * dt);

  const nx = state.x + state.vx * dt;
  const nz = state.z + state.vz * dt;
  let pos = resolve(world, nx, nz);
  if (!pos) {
    // Скользим вдоль препятствия, а не залипаем в нём.
    pos = resolve(world, nx, state.z);
    if (pos) state.vz = 0;
  }
  if (!pos) {
    pos = resolve(world, state.x, nz);
    if (pos) state.vx = 0;
  }
  if (pos) {
    const moved = Math.hypot(pos[0] - state.x, pos[1] - state.z);
    state.distance += moved;
    state.x = pos[0];
    state.z = pos[1];
  } else {
    state.vx = 0;
    state.vz = 0;
  }

  state.speed = Math.hypot(state.vx, state.vz);

  // Прыжок и падение.
  const ground =
    deck !== null
      ? deck
      : Math.max(world.terrain.height(state.x, state.z), WORLD.waterLevel - PLAYER.maxWadeDepth);
  if (state.onGround) {
    // Небольшое сглаживание, чтобы кочки не дёргали камеру.
    state.feetY += (ground - state.feetY) * Math.min(1, 12 * dt);
    if (input.jump && !state.wading && !input.overloaded && state.breath > PLAYER.jumpBreathCost) {
      state.vy = Math.sqrt(2 * PLAYER.gravity * PLAYER.jumpHeight);
      state.breath -= PLAYER.jumpBreathCost;
      state.onGround = false;
    }
  } else {
    state.vy -= PLAYER.gravity * dt;
    state.feetY += state.vy * dt;
    if (state.feetY <= ground) {
      state.feetY = ground;
      state.vy = 0;
      state.onGround = true;
    }
  }
  state.eyeY = state.feetY + PLAYER.eyeHeight;
}
