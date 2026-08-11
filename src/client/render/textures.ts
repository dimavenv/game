import * as THREE from 'three';

/**
 * Процедурные текстуры земли. Ни одного файла: и цвет, и рельеф считаются
 * на канвасе при запуске. Шум периодический, поэтому текстура стыкуется сама
 * с собой и её можно повторять по всей карте без швов.
 */

const SIZE = 256;

/** Узел решётки: значение зависит только от координат по модулю периода. */
function lattice(seed: number, px: number, py: number, i: number, j: number): number {
  const x = ((i % px) + px) % px;
  const y = ((j % py) + py) % py;
  let h = Math.imul(x + 1, 0x27d4eb2d) ^ Math.imul(y + 1, 0x165667b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}

function noise2(seed: number, px: number, py: number, x: number, y: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = lattice(seed, px, py, i, j);
  const b = lattice(seed, px, py, i + 1, j);
  const c = lattice(seed, px, py, i, j + 1);
  const d = lattice(seed, px, py, i + 1, j + 1);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

/** Сумма октав с периодами, кратными друг другу — иначе шов вылезет. */
function fbm(seed: number, base: number, u: number, v: number, octaves: number): number {
  let sum = 0;
  let amp = 0.5;
  let total = 0;
  let period = base;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise2(seed + o * 977, period, period, u * period, v * period);
    total += amp;
    amp *= 0.5;
    period *= 2;
  }
  return sum / total;
}

/** Высота микрорельефа земли: комья, редкие проплешины и штрихи травы. */
function groundHeight(u: number, v: number): number {
  const clods = fbm(0x51ed27, 4, u, v, 4);
  const grain = fbm(0x9e3779, 32, u, v, 2);
  // Вытянутый по вертикали шум читается как лежащие травинки.
  const streaks = noise2(0x1b56c4, 6, 96, u * 6, v * 96);
  return clods * 0.6 + grain * 0.22 + streaks * 0.18;
}

export interface GroundTextures {
  map: THREE.Texture;
  normalMap: THREE.Texture;
}

/**
 * Цвет и нормаль земли одним проходом: рельеф считается один раз, из него
 * же берутся и оттенок (во впадинах темнее), и наклон для карты нормалей.
 */
export function groundTextures(repeat: number): GroundTextures {
  const height = new Float32Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      height[y * SIZE + x] = groundHeight(x / SIZE, y / SIZE);
    }
  }

  const albedo = document.createElement('canvas');
  albedo.width = SIZE;
  albedo.height = SIZE;
  const albedoCtx = albedo.getContext('2d')!;
  const albedoData = albedoCtx.createImageData(SIZE, SIZE);

  const normal = document.createElement('canvas');
  normal.width = SIZE;
  normal.height = SIZE;
  const normalCtx = normal.getContext('2d')!;
  const normalData = normalCtx.createImageData(SIZE, SIZE);

  const at = (x: number, y: number): number => height[(((y % SIZE) + SIZE) % SIZE) * SIZE + (((x % SIZE) + SIZE) % SIZE)];

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      const h = height[y * SIZE + x];

      // Текстура нейтральная по цвету: оттенок задаёт вершинный цвет земли,
      // а здесь только светотень — так один и тот же лист годится и траве,
      // и песку, и дну.
      const shade = 0.72 + h * 0.55;
      const speck = noise2(0x7a1c93, 64, 64, x * 0.25, y * 0.25);
      const value = Math.max(0, Math.min(1, shade * (0.93 + speck * 0.14)));
      const warm = 1 + (h - 0.5) * 0.06;
      albedoData.data[i] = Math.min(255, value * 255 * warm);
      albedoData.data[i + 1] = Math.min(255, value * 255);
      albedoData.data[i + 2] = Math.min(255, value * 255 * (2 - warm));
      albedoData.data[i + 3] = 255;

      // Нормаль из градиента высоты: центральные разности по соседям.
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.6;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.6;
      const len = Math.hypot(dx, dy, 1);
      normalData.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      normalData.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      normalData.data[i + 2] = (1 / len) * 0.5 * 255 + 127;
      normalData.data[i + 3] = 255;
    }
  }

  albedoCtx.putImageData(albedoData, 0, 0);
  normalCtx.putImageData(normalData, 0, 0);

  const map = new THREE.CanvasTexture(albedo);
  map.colorSpace = THREE.SRGBColorSpace;
  const normalMap = new THREE.CanvasTexture(normal);
  for (const tex of [map, normalMap]) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat, repeat);
    tex.anisotropy = 8;
  }
  return { map, normalMap };
}

/** Кора: продольные волокна и тёмные трещины. Годится и стволам, и брёвнам. */
export function barkTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d')!;
  const data = ctx.createImageData(SIZE, SIZE);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = (y * SIZE + x) * 4;
      // Волокна идут вдоль ствола: шум сильно сжат по горизонтали.
      const fibre = noise2(0x2f8a1c, 48, 8, (x / SIZE) * 48, (y / SIZE) * 8);
      const crack = fbm(0x4c7a3a, 8, x / SIZE, y / SIZE, 3);
      const v = 0.55 + fibre * 0.5 - Math.pow(1 - crack, 3) * 0.35;
      const c = Math.max(0, Math.min(1, v));
      data.data[i] = c * 255;
      data.data[i + 1] = c * 245;
      data.data[i + 2] = c * 230;
      data.data[i + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
