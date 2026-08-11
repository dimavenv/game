import type { ItemId } from './items';

/**
 * Товар Ави. Всё это — выдуманная игровая механика: каждый приход недолгий,
 * а расплата за него длиннее самого прихода. Ни к чему не призываем.
 */
export type DrugId = 'cocaine' | 'hash' | 'heroin';

export interface DrugSpec {
  item: ItemId;
  name: string;
  price: number;
  /** Сколько секунд занимает само употребление. */
  useTime: number;
  /** Как это выглядит в подсказке. */
  useText: string;
  /** Сколько секунд держит. */
  duration: number;
  /** Что делает, пока действует. */
  speed: number;
  damage: number;
  /** Дыхание не сбивается на бегу. */
  breathFree: boolean;
  /** Сдвиг поля зрения: кокаин сужает, гашиш расширяет. */
  fov: number;
  /** Насколько глушит мир (0 — не глушит). */
  muffle: number;
  /** Множитель урона, который проходит по игроку. */
  incoming: number;
  /** Героин: урон не чувствуется, а накапливается и прилетает разом. */
  deferPain: boolean;
  /** Что остаётся после. */
  after: {
    /** Секунды тряски в кадре. */
    tremor: number;
    /** Множитель дыхания до утра. */
    breath: number;
    /** Множитель скорости до утра. */
    speed: number;
    /** Разовый удар по здоровью, когда отпускает. */
    health: number;
    text: string;
  };
}

export const DRUGS: Record<DrugId, DrugSpec> = {
  cocaine: {
    item: 'cocaine',
    name: 'кокаин',
    price: 160,
    useTime: 5.0,
    useText: 'Зеркальце, карточка, трубочка',
    duration: 45,
    speed: 1.35,
    damage: 1.6,
    breathFree: true,
    fov: -3,
    muffle: 0,
    incoming: 1,
    deferPain: false,
    after: {
      tremor: 80,
      breath: 0.4,
      speed: 1,
      health: 0,
      text: 'Отпустило. Руки трясутся, дыхания нет',
    },
  },
  hash: {
    item: 'hash',
    name: 'гашиш',
    price: 90,
    useTime: 7.5,
    useText: 'Крошишь, скручиваешь, раскуриваешь',
    duration: 110,
    speed: 0.82,
    damage: 0.9,
    breathFree: false,
    fov: 9,
    muffle: 0.75,
    incoming: 0.6,
    deferPain: false,
    after: {
      tremor: 0,
      breath: 0.8,
      speed: 0.85,
      health: 0,
      text: 'Развезло. До утра ноги ватные',
    },
  },
  heroin: {
    item: 'heroin',
    name: 'героин',
    price: 220,
    useTime: 9.5,
    useText: 'Ложка, зажигалка, жгут. Руки не слушаются',
    duration: 60,
    speed: 0.92,
    damage: 1.15,
    breathFree: true,
    fov: 5,
    muffle: 0.5,
    incoming: 0,
    deferPain: true,
    after: {
      tremor: 30,
      breath: 0.3,
      speed: 0.9,
      health: 30,
      text: 'Всё, что не болело, прилетело разом',
    },
  },
};

export const DRUG_BY_ITEM: Partial<Record<ItemId, DrugId>> = {
  cocaine: 'cocaine',
  hash: 'hash',
  heroin: 'heroin',
};

/** Текущее состояние: приход, отходняк и накопленная героином боль. */
export interface DrugEffects {
  /** Идёт само употребление: до конца этого таймера эффекта ещё нет. */
  using: { drug: DrugId; time: number } | null;
  active: { drug: DrugId; time: number } | null;
  after: { drug: DrugId; untilDay: number } | null;
  tremor: number;
  painDebt: number;
}

export function createDrugEffects(): DrugEffects {
  return { using: null, active: null, after: null, tremor: 0, painDebt: 0 };
}

function activeSpec(effects: DrugEffects): DrugSpec | null {
  return effects.active ? DRUGS[effects.active.drug] : null;
}

function afterSpec(effects: DrugEffects, day: number): DrugSpec | null {
  if (!effects.after || day > effects.after.untilDay) return null;
  return DRUGS[effects.after.drug];
}

export function drugSpeed(effects: DrugEffects, day: number): number {
  // Пока употребляешь — руки заняты, ноги еле идут.
  const busy = effects.using ? 0.3 : 1;
  return busy * (activeSpec(effects)?.speed ?? 1) * (afterSpec(effects, day)?.after.speed ?? 1);
}

export function drugDamage(effects: DrugEffects): number {
  return activeSpec(effects)?.damage ?? 1;
}

export function drugBreath(effects: DrugEffects, day: number): number {
  return afterSpec(effects, day)?.after.breath ?? 1;
}

export function drugBreathFree(effects: DrugEffects): boolean {
  return activeSpec(effects)?.breathFree ?? false;
}

export function drugFov(effects: DrugEffects): number {
  return activeSpec(effects)?.fov ?? 0;
}

export function drugMuffle(effects: DrugEffects): number {
  return activeSpec(effects)?.muffle ?? 0;
}

export function drugIncoming(effects: DrugEffects): number {
  return activeSpec(effects)?.incoming ?? 1;
}

export function drugDefersPain(effects: DrugEffects): boolean {
  return activeSpec(effects)?.deferPain ?? false;
}
