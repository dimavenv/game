const KEY = 'krugloe-ozero-quality';

export type QualityLevel = 'ultra' | 'high' | 'medium';

export interface QualitySettings {
  label: string;
  /** Разрешение карты теней и радиус, который она покрывает. */
  shadowMap: number;
  shadowRadius: number;
  /** Плотность сетки рельефа. */
  terrainSegments: number;
  /** Верхний предел плотности пикселей. */
  pixelRatio: number;
  /** Сглаживание в буфере постобработки. */
  samples: number;
  /** Свечение углей, фонарей и заката. */
  bloom: number;
  /** Множители количества травы и мелочи под ногами. */
  grass: number;
  props: number;
  /** Дальность отрисовки. */
  far: number;
}

export const QUALITY: Record<QualityLevel, QualitySettings> = {
  ultra: {
    label: 'Максимальное',
    shadowMap: 4096,
    shadowRadius: 70,
    terrainSegments: 560,
    pixelRatio: 2,
    samples: 4,
    bloom: 0.42,
    grass: 1,
    props: 1,
    far: 1500,
  },
  high: {
    label: 'Высокое',
    shadowMap: 2048,
    shadowRadius: 55,
    terrainSegments: 420,
    pixelRatio: 1.5,
    samples: 4,
    bloom: 0.32,
    grass: 0.7,
    props: 0.75,
    far: 1200,
  },
  medium: {
    label: 'Среднее',
    shadowMap: 1024,
    shadowRadius: 42,
    terrainSegments: 260,
    pixelRatio: 1,
    samples: 0,
    bloom: 0,
    grass: 0.35,
    props: 0.4,
    far: 900,
  },
};

export const QUALITY_ORDER: QualityLevel[] = ['ultra', 'high', 'medium'];

export function loadQuality(): QualityLevel {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'ultra' || saved === 'high' || saved === 'medium') return saved;
  } catch {
    // Приватный режим — просто берём максимум.
  }
  return 'ultra';
}

export function saveQuality(level: QualityLevel): void {
  try {
    localStorage.setItem(KEY, level);
  } catch {
    // Не сохранилось — переживём.
  }
}

export function currentQuality(): QualitySettings {
  return QUALITY[loadQuality()];
}
