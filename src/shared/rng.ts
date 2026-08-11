/**
 * Детерминированный шум и генераторы случайных чисел.
 *
 * Всё, что строит мир, обязано зависеть только от сида: клиент и будущий
 * сервер должны получать один и тот же лес, не пересылая его по сети.
 */

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function toSeed(seed: string | number): number {
  return typeof seed === 'number' ? seed >>> 0 : hashString(seed);
}

/** Быстрый ГПСЧ с 32-битным состоянием. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Хеш двух целых в [0,1) — основа value-шума. */
export function hash2(ix: number, iy: number, seed: number): number {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export class ValueNoise {
  constructor(private readonly seed: number) {}

  /** Значение в [0,1). */
  noise(x: number, y: number): number {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = fade(x - ix);
    const fy = fade(y - iy);
    const a = hash2(ix, iy, this.seed);
    const b = hash2(ix + 1, iy, this.seed);
    const c = hash2(ix, iy + 1, this.seed);
    const d = hash2(ix + 1, iy + 1, this.seed);
    return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
  }

  /** Сумма октав, тоже в [0,1). */
  fbm(x: number, y: number, octaves = 4, lacunarity = 2, gain = 0.5): number {
    let amp = 1;
    let freq = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq);
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return sum / norm;
  }
}
