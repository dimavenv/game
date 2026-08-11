import { WINE } from './balance';
import type { ItemId } from './items';

export type WineGrade = 'young' | 'aged' | 'vintage';

/** Во что превратилась партия к этому дню. null — ещё рано разливать. */
export function wineGrade(startedDay: number, day: number): WineGrade | null {
  const aged = day - startedDay;
  if (aged >= WINE.ageVintage) return 'vintage';
  if (aged >= WINE.ageAged) return 'aged';
  if (aged >= WINE.ageYoung) return 'young';
  return null;
}

export function wineItem(grade: WineGrade): ItemId {
  switch (grade) {
    case 'young':
      return 'wine_young';
    case 'aged':
      return 'wine_aged';
    case 'vintage':
      return 'wine_vintage';
  }
}

export const GRADE_LABEL: Record<WineGrade, string> = {
  young: 'молодое',
  aged: 'выдержанное',
  vintage: 'коллекционное',
};

/** Сколько суток осталось до следующей ступени выдержки. */
export function daysToNextGrade(startedDay: number, day: number): number | null {
  const aged = day - startedDay;
  if (aged < WINE.ageYoung) return WINE.ageYoung - aged;
  if (aged < WINE.ageAged) return WINE.ageAged - aged;
  if (aged < WINE.ageVintage) return WINE.ageVintage - aged;
  return null;
}
