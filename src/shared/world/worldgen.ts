import { FOREST, MOUNTAIN, RIVER, STONES, SWING, WINE, WORLD } from '../balance';
import { ValueNoise, lerp, mulberry32, smoothstep, toSeed } from '../rng';
import {
  catamaranLayout,
  hutLayout,
  mountainObstacles,
  stallLayout,
  type BoxCollider,
  type CatamaranLayout,
  type HutLayout,
  type StallLayout,
} from './buildings';
import { ObstacleGrid, type Obstacle } from './grid';
import { Terrain } from './terrain';

export const TreeType = { Spruce: 0, Pine: 1, Birch: 2 } as const;

export interface TreeInstance {
  x: number;
  z: number;
  y: number;
  rot: number;
  scale: number;
  type: number;
}

export interface PropInstance {
  x: number;
  z: number;
  y: number;
  rot: number;
  scale: number;
  variant: number;
}

export interface WorldData {
  seed: number;
  terrain: Terrain;
  trees: TreeInstance[];
  bushes: PropInstance[];
  rocks: PropInstance[];
  /** Яблони: по ним ходят за яблоками для Буравчика. */
  appleTrees: PropInstance[];
  /** Мелкие камешки: подбираются руками. */
  pebbles: PropInstance[];
  /** Дикие лозы: с них начинается виноделие. */
  vines: PropInstance[];
  monument: { x: number; z: number; y: number; rot: number };
  hut: HutLayout;
  stall: StallLayout;
  catamaran: CatamaranLayout;
  boxes: BoxCollider[];
  obstacles: ObstacleGrid;
  /** Препятствия-стволы по индексу дерева: срубленное отключается здесь. */
  treeObstacles: Obstacle[];
  spawn: { x: number; z: number; yaw: number };
}

/** Спавн: в лесу к северу от озера, лицом к воде — чтобы первой встретилась табличка. */
const SPAWN = { x: -6, z: -70, yaw: Math.PI };

function distToClearing(x: number, z: number): number {
  return Math.hypot(x - WORLD.clearing.x, z - WORLD.clearing.z);
}

/** Вероятность, что в клетке вырастет дерево. */
function treeDensity(x: number, z: number, glades: ValueNoise): number {
  const lakeD = Terrain.lakeDistance(x, z);
  if (lakeD < WORLD.lakeHalf + FOREST.shoreMargin) return 0;
  if (distToClearing(x, z) < WORLD.clearing.r) return 0;
  if (Math.hypot(x - WORLD.sign.x, z - WORLD.sign.z) < 4) return 0;
  if (Math.hypot(x - SPAWN.x, z - SPAWN.z) < 3) return 0;
  if (Math.hypot(x - WORLD.monument.x, z - WORLD.monument.z) < 7) return 0;
  // Макушка Петушка голая: беседку должно быть видно издалека.
  if (Math.hypot(x - MOUNTAIN.x, z - MOUNTAIN.z) < MOUNTAIN.topFlat + 6) return 0;
  // У тарзанки — вытоптанный пятачок.
  if (Math.hypot(x - SWING.base.x, z - SWING.base.z) < 7) return 0;
  // В русле и на урезе воды деревья не растут.
  if (Terrain.riverDistance(x, z) < RIVER.bank + 2) return 0;

  const edge = Math.max(Math.abs(x), Math.abs(z));
  // К границе мира лес сгущается в стену, через которую не пройти.
  const thicket = smoothstep(FOREST.thicketFrom, WORLD.bound, edge);
  const base = lerp(FOREST.baseDensity, FOREST.thicketDensity, thicket);

  // Проплешины и полянки, чтобы лес не был однородной решёткой.
  const openness = glades.fbm(x * 0.008, z * 0.008, 3);
  const variation = lerp(0.45, 1.35, openness);
  return Math.min(base * variation, FOREST.thicketDensity);
}

/**
 * Раскидывает по лесу редкие приметные штуки (яблони, лозы) так, чтобы вокруг
 * каждой оставалась прогалина и они не липли друг к другу.
 */
function placeLandmarks(seed: number, terrain: Terrain, count: number, minGap: number): PropInstance[] {
  const rng = mulberry32(seed);
  const out: PropInstance[] = [];
  let guard = count * 400;
  const spread = Math.min(FOREST.landmarkSpread, WORLD.bound - 10);
  while (out.length < count && guard-- > 0) {
    const x = (rng() * 2 - 1) * spread;
    const z = (rng() * 2 - 1) * spread;
    if (Terrain.lakeDistance(x, z) < WORLD.lakeHalf + 14) continue;
    if (distToClearing(x, z) < WORLD.clearing.r + 8) continue;
    if (terrain.surface(x, z) !== 'grass') continue;
    if (terrain.slope(x, z) > 0.35) continue;
    if (out.some((a) => Math.hypot(a.x - x, a.z - z) < minGap)) continue;
    out.push({
      x,
      z,
      y: terrain.height(x, z),
      rot: rng() * Math.PI * 2,
      scale: 0.9 + rng() * 0.25,
      variant: Math.floor(rng() * 3),
    });
  }
  return out;
}

export function generateWorld(seedInput: string | number): WorldData {
  const seed = toSeed(seedInput);
  const terrain = new Terrain(seed);
  const glades = new ValueNoise(seed ^ 0x51ed270b);
  const appleTrees = placeLandmarks(seed ^ 0x7a1c93d5, terrain, FOREST.appleTrees, 45);
  const vines = placeLandmarks(seed ^ 0x3f77a1b9, terrain, WINE.wildVines, 40);

  const trees: TreeInstance[] = [];
  const treeObstacles: Obstacle[] = [];
  const obstacles = new ObstacleGrid(6);

  const cell = FOREST.cell;
  const steps = Math.floor((WORLD.half * 2) / cell);
  for (let ix = 0; ix < steps; ix++) {
    for (let iz = 0; iz < steps; iz++) {
      const rng = mulberry32(seed ^ Math.imul(ix + 1, 0x27d4eb2d) ^ Math.imul(iz + 1, 0x165667b1));
      const baseX = -WORLD.half + ix * cell;
      const baseZ = -WORLD.half + iz * cell;
      const x = baseX + rng() * cell;
      const z = baseZ + rng() * cell;
      if (Math.abs(x) > WORLD.bound || Math.abs(z) > WORLD.bound) continue;
      if (rng() > treeDensity(x, z, glades)) continue;
      if (terrain.slope(x, z) > 0.5) continue;
      if (terrain.surface(x, z) === 'water') continue;
      // Вокруг яблони держим прогалину, иначе её не разглядеть в чаще.
      if (appleTrees.some((a) => Math.hypot(a.x - x, a.z - z) < 6)) continue;
      if (vines.some((v) => Math.hypot(v.x - x, v.z - z) < 5)) continue;

      const r = rng();
      const type = r < 0.5 ? TreeType.Spruce : r < 0.82 ? TreeType.Pine : TreeType.Birch;
      const scale = 0.75 + rng() * 0.75;
      const tree: TreeInstance = {
        x,
        z,
        y: terrain.height(x, z),
        rot: rng() * Math.PI * 2,
        scale,
        type,
      };
      const obstacle: Obstacle = { x, z, radius: FOREST.trunkRadius * scale, id: trees.length };
      obstacles.add(obstacle);
      treeObstacles.push(obstacle);
      trees.push(tree);
    }
  }

  const rng = mulberry32(seed ^ 0x1b56c4e9);
  const scatter = (count: number, allowSand: boolean, minLakeDist: number): PropInstance[] => {
    const out: PropInstance[] = [];
    let guard = count * 12;
    while (out.length < count && guard-- > 0) {
      const x = (rng() * 2 - 1) * WORLD.bound;
      const z = (rng() * 2 - 1) * WORLD.bound;
      if (Terrain.lakeDistance(x, z) < WORLD.lakeHalf + minLakeDist) continue;
      const surface = terrain.surface(x, z);
      if (surface === 'water') continue;
      if (!allowSand && surface === 'sand') continue;
      if (distToClearing(x, z) < WORLD.clearing.r - 4) continue;
      out.push({
        x,
        z,
        y: terrain.height(x, z),
        rot: rng() * Math.PI * 2,
        scale: 0.7 + rng() * 0.8,
        variant: Math.floor(rng() * 3),
      });
    }
    return out;
  };

  for (const a of appleTrees) {
    obstacles.add({ x: a.x, z: a.z, radius: 0.42 * a.scale, id: -1 });
  }
  for (const v of vines) {
    obstacles.add({ x: v.x, z: v.z, radius: 0.5, id: -1 });
  }
  obstacles.add({ x: WORLD.monument.x, z: WORLD.monument.z, radius: 0.7, id: -1 });

  const hut = hutLayout(terrain);
  const stall = stallLayout(terrain);
  const catamaran = catamaranLayout();
  for (const o of catamaran.obstacles) obstacles.add({ x: o.x, z: o.z, radius: o.radius, id: -1 });
  for (const o of mountainObstacles()) obstacles.add({ x: o.x, z: o.z, radius: o.radius, id: -1 });

  return {
    seed,
    terrain,
    trees,
    bushes: scatter(FOREST.bushes, false, 3),
    rocks: scatter(FOREST.rocks, true, 0.5),
    pebbles: scatter(STONES.pebbles, true, 0.5),
    appleTrees,
    vines,
    monument: {
      x: WORLD.monument.x,
      z: WORLD.monument.z,
      y: terrain.height(WORLD.monument.x, WORLD.monument.z),
      rot: 0.35,
    },
    hut,
    stall,
    catamaran,
    boxes: [...hut.colliders, ...stall.colliders],
    obstacles,
    treeObstacles,
    spawn: { ...SPAWN },
  };
}
