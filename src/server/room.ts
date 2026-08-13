import type { Actor } from '../shared/actors';
import { damageAnimal, spawnAnimals, stepAnimals, type Animal } from '../shared/animals';
import { WORLD_SEED, ZOMBIE } from '../shared/balance';
import {
  animalToWire,
  zombieToWire,
  type AnimalWire,
  type HitAction,
  type PlayerWire,
  type WorldAction,
  type WorldSnapshot,
  type ZombieWire,
} from '../shared/net/protocol';
import { mulberry32, toSeed } from '../shared/rng';
import { advanceClock, createClock, isDark, type WorldClock } from '../shared/time';
import { insideCave } from '../shared/world/caves';
import { generateWorld, type WorldData } from '../shared/world/worldgen';
import type { PlacedStructure } from '../shared/world/building';
import {
  damageZombie,
  spawnCaveZombies,
  spawnZombies,
  stepZombies,
  zombieCount,
  type Zombie,
} from '../shared/zombies';

/**
 * Комната: один лес на всех. Здесь живёт то, что должно быть одинаковым у
 * обоих игроков, — время суток, стадо, стая, мутации леса и постройки.
 *
 * Мир строится тем же generateWorld из shared, что и у клиента, из того же
 * сида: сервер и клиент видят одни и те же деревья с точностью до метра, и
 * гонять геометрию по проводу не нужно — только то, что меняется.
 */

/** Дальше этого живность в снимок не попадает: её всё равно не видно. */
const WIRE_RANGE = 220;

/** Игрок глазами сервера. */
export interface ServerPlayer {
  id: number;
  name: string;
  /** По нему узнаём того же человека при переподключении. */
  token: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  speed: number;
  slot: number;
  flags: number;
  health: number;
  /** Личный прогресс: рюкзак, квесты, найденные пещеры. Сервер их не читает. */
  progress: string | null;
  /** В какой пещере он сейчас — по этому будятся её обитатели. */
  cave: number | null;
  online: boolean;
  lastSeen: number;
}

export interface RoomSave {
  seed: string;
  clock: WorldClock;
  world: WorldSnapshot;
  players: { token: string; name: string; progress: string | null; x: number; y: number; z: number }[];
}

export class Room {
  readonly seed: string;
  readonly world: WorldData;
  readonly clock: WorldClock = createClock();

  private readonly rng: () => number;
  private readonly players = new Map<number, ServerPlayer>();
  private nextPlayerId = 1;
  private nextZombieId = 1;

  /** Мутации леса. Ключи — индексы в world.trees и прочих массивах. */
  private readonly trees = new Map<number, { hits: number; choppedDay: number | null }>();
  private readonly apples = new Map<number, number | null>();
  private readonly boulders = new Map<number, { hits: number; brokenDay: number | null }>();
  private readonly pebbles = new Map<number, number>();
  private readonly vines = new Map<number, number>();
  private readonly structures = new Map<number, PlacedStructure>();
  private nextStructureId = 1;
  private stoveFuel = 0;

  private animals: Animal[] = [];
  private zombies: Zombie[] = [];
  private wasDark = false;
  /** В какие сутки будили обитателей каждой пещеры. */
  private readonly caveDay = new Map<number, number>();

  constructor(seed = WORLD_SEED) {
    this.seed = seed;
    this.world = generateWorld(seed);
    this.rng = mulberry32(toSeed(seed) ^ 0x5e2e_1234);
    this.animals = spawnAnimals(this.rng, this.world);
    this.wasDark = isDark(this.clock.t);
  }

  // --- Игроки -------------------------------------------------------------

  join(name: string, token: string): ServerPlayer {
    // Тот же человек вернулся — отдаём ему его же запись с прогрессом.
    for (const player of this.players.values()) {
      if (player.token !== token) continue;
      player.online = true;
      player.name = name;
      player.lastSeen = Date.now();
      return player;
    }
    const spawn = this.world.spawn;
    const player: ServerPlayer = {
      id: this.nextPlayerId++,
      name,
      token,
      x: spawn.x,
      y: this.world.terrain.height(spawn.x, spawn.z),
      z: spawn.z,
      yaw: spawn.yaw,
      pitch: 0,
      speed: 0,
      slot: 0,
      flags: 0,
      health: 100,
      progress: null,
      cave: null,
      online: true,
      lastSeen: Date.now(),
    };
    this.players.set(player.id, player);
    return player;
  }

  leave(id: number): void {
    const player = this.players.get(id);
    if (!player) return;
    player.online = false;
    player.lastSeen = Date.now();
  }

  player(id: number): ServerPlayer | undefined {
    return this.players.get(id);
  }

  /** Только те, кто сейчас в лесу: по ним и считается всё живое. */
  private get present(): ServerPlayer[] {
    return [...this.players.values()].filter((p) => p.online);
  }

  actors(): Actor[] {
    return this.present.map((p) => ({ id: p.id, x: p.x, z: p.z, yaw: p.yaw }));
  }

  wirePlayers(exclude?: number): PlayerWire[] {
    const out: PlayerWire[] = [];
    for (const p of this.present) {
      if (p.id === exclude) continue;
      out.push(this.wire(p));
    }
    return out;
  }

  wire(p: ServerPlayer): PlayerWire {
    return {
      id: p.id,
      name: p.name,
      x: p.x,
      y: p.y,
      z: p.z,
      yaw: p.yaw,
      pitch: p.pitch,
      speed: p.speed,
      slot: p.slot,
      flags: p.flags,
      health: p.health,
    };
  }

  // --- Мир ----------------------------------------------------------------

  snapshot(): WorldSnapshot {
    return {
      trees: [...this.trees].map(([index, m]) => [index, m.hits, m.choppedDay] as [number, number, number | null]),
      apples: [...this.apples].map(([index, day]) => [index, day] as [number, number | null]),
      boulders: [...this.boulders].map(([index, m]) => [index, m.hits, m.brokenDay] as [number, number, number | null]),
      pebbles: [...this.pebbles].map(([index, day]) => [index, day] as [number, number]),
      vines: [...this.vines].map(([index, day]) => [index, day] as [number, number]),
      structures: [...this.structures.values()],
      nextStructureId: this.nextStructureId,
      stoveFuel: this.stoveFuel,
    };
  }

  restore(save: RoomSave): void {
    this.clock.t = save.clock.t;
    this.clock.day = save.clock.day;
    this.wasDark = isDark(this.clock.t);
    const w = save.world;
    for (const [index, hits, choppedDay] of w.trees ?? []) this.trees.set(index, { hits, choppedDay });
    for (const [index, day] of w.apples ?? []) this.apples.set(index, day);
    for (const [index, hits, brokenDay] of w.boulders ?? []) this.boulders.set(index, { hits, brokenDay });
    for (const [index, day] of w.pebbles ?? []) this.pebbles.set(index, day);
    for (const [index, day] of w.vines ?? []) this.vines.set(index, day);
    for (const s of w.structures ?? []) this.structures.set(s.id, s);
    this.nextStructureId = Math.max(1, w.nextStructureId ?? 1);
    this.stoveFuel = w.stoveFuel ?? 0;

    for (const saved of save.players ?? []) {
      const player = this.join(saved.name, saved.token);
      player.progress = saved.progress;
      player.x = saved.x;
      player.y = saved.y;
      player.z = saved.z;
      player.online = false;
    }
  }

  toSave(): RoomSave {
    return {
      seed: this.seed,
      clock: { t: this.clock.t, day: this.clock.day },
      world: this.snapshot(),
      players: [...this.players.values()].map((p) => ({
        token: p.token,
        name: p.name,
        progress: p.progress,
        x: p.x,
        y: p.y,
        z: p.z,
      })),
    };
  }

  /** Применяет мутацию мира. Возвращает false, если она бессмысленна. */
  applyWorld(action: WorldAction): boolean {
    switch (action.t) {
      case 'tree':
        this.trees.set(action.index, { hits: action.hits, choppedDay: action.choppedDay });
        return true;
      case 'apple':
        this.apples.set(action.index, action.pickedDay);
        return true;
      case 'boulder':
        this.boulders.set(action.index, { hits: action.hits, brokenDay: action.brokenDay });
        return true;
      case 'pebble':
        this.pebbles.set(action.index, action.day);
        return true;
      case 'vine':
        this.vines.set(action.index, action.day);
        return true;
      case 'structure':
        this.structures.set(action.structure.id, action.structure);
        this.nextStructureId = Math.max(this.nextStructureId, action.structure.id + 1);
        return true;
      case 'structureGone':
        return this.structures.delete(action.id);
      case 'stove':
        this.stoveFuel = Math.max(0, action.fuel);
        return true;
      default:
        return false;
    }
  }

  // --- Живность -----------------------------------------------------------

  /** Урон твари от игрока. Возвращает, кого добили, — трофей уходит бьющему. */
  applyHit(hit: HitAction): { kind: 'animal' | 'zombie'; id: number } | null {
    if (hit.t === 'animal') {
      const animal = this.animals.find((a) => a.id === hit.id);
      if (!animal) return null;
      return damageAnimal(animal, hit.damage) ? { kind: 'animal', id: animal.id } : null;
    }
    if (hit.t === 'animalButcher') {
      const animal = this.animals.find((a) => a.id === hit.id);
      if (!animal || animal.state !== 'dead' || animal.butchered) return null;
      animal.butchered = true;
      return null;
    }
    const zombie = this.zombies.find((z) => z.id === hit.id);
    if (!zombie) return null;
    return damageZombie(zombie, hit.damage, hit.stagger) ? { kind: 'zombie', id: zombie.id } : null;
  }

  /**
   * Зверьё и стая уходят каждому своё: дальше двухсот метров всё равно ничего
   * не видно, а гонять по проводу всех семьдесят четыре зверя двенадцать раз
   * в секунду — впустую занятый канал.
   */
  wireAnimals(near: ServerPlayer): AnimalWire[] {
    const out: AnimalWire[] = [];
    for (const a of this.animals) {
      if (Math.hypot(a.x - near.x, a.z - near.z) > WIRE_RANGE) continue;
      out.push(animalToWire(a));
    }
    return out;
  }

  wireZombies(near: ServerPlayer): ZombieWire[] {
    const out: ZombieWire[] = [];
    for (const z of this.zombies) {
      if (Math.hypot(z.x - near.x, z.z - near.z) > WIRE_RANGE) continue;
      out.push(zombieToWire(z));
    }
    return out;
  }

  /**
   * Шаг мира. Возвращает урон по игрокам: сервер считает и кабанов, и стаю,
   * иначе двое видели бы разные удары.
   */
  step(dt: number): Map<number, number> {
    advanceClock(this.clock, dt);
    const actors = this.actors();
    const damage = new Map<number, number>();

    // Стадо живёт всегда, даже когда в лесу никого: иначе туши висят вечно.
    const herd = stepAnimals(this.animals, actors, this.world, dt, this.rng);
    for (const [id, amount] of herd.damage) damage.set(id, (damage.get(id) ?? 0) + amount);

    this.nightCycle();
    this.wakeCaves();

    if (this.zombies.length > 0) {
      const bite = stepZombies(this.zombies, actors, this.world, dt, this.rng);
      for (const [id, amount] of bite.damage) damage.set(id, (damage.get(id) ?? 0) + amount);
      // Осевшие исчезают: без этого список растёт всю ночь.
      this.zombies = this.zombies.filter((z) => !(z.state === 'dying' && z.deadFor > 6));
    }

    // Печь прогорает у всех сразу.
    if (this.stoveFuel > 0) this.stoveFuel = Math.max(0, this.stoveFuel - dt);
    for (const s of this.structures.values()) {
      if (s.kind === 'campfire' && s.fuel) s.fuel = Math.max(0, s.fuel - dt);
    }

    return damage;
  }

  /** Сумерки — стая выходит, рассвет — расходится. Пещерных это не касается. */
  private nightCycle(): void {
    const dark = isDark(this.clock.t);
    if (dark === this.wasDark) return;
    this.wasDark = dark;

    if (!dark) {
      this.zombies = this.zombies.filter((z) => z.cave !== undefined && z.state !== 'dying');
      return;
    }

    const present = this.present;
    if (present.length === 0) return;
    const total = zombieCount(this.clock.day);
    // Стая делится между всеми: вдвоём не должно быть вдвое страшнее.
    const each = Math.max(3, Math.floor(total / present.length));
    for (const player of present) {
      const pack = spawnZombies(this.rng, this.world, each, player, this.nextZombieId);
      this.nextZombieId += pack.length;
      this.zombies.push(...pack);
    }
  }

  /** Кто-то зашёл в пещеру — её обитатели просыпаются. */
  private wakeCaves(): void {
    for (const player of this.present) {
      let found: number | null = null;
      for (const cave of this.world.caves) {
        if (!insideCave(cave, player.x, player.z, player.y)) continue;
        found = cave.id;
        break;
      }
      player.cave = found;
      if (found === null) continue;
      if (this.caveDay.get(found) === this.clock.day) continue;
      this.caveDay.set(found, this.clock.day);
      const pack = spawnCaveZombies(this.rng, this.world.caves[found], this.nextZombieId);
      this.nextZombieId += pack.length;
      this.zombies.push(...pack);
    }

    // Пещера пустеет, когда от её зева ушли все.
    if (this.zombies.length === 0) return;
    const present = this.present;
    this.zombies = this.zombies.filter((z) => {
      if (z.cave === undefined) return true;
      const mouth = this.world.caves[z.cave].mouth;
      return present.some((p) => Math.hypot(p.x - mouth.x, p.z - mouth.z) < ZOMBIE.cave.despawn);
    });
  }
}
