/**
 * Реестр вещей, которые лежат в рюкзаке. Инструменты (топор, удочка, молот,
 * дробовик, фонарик) сюда не входят — они висят на поясе и веса не занимают.
 */
export type ItemId =
  | 'apple'
  | 'stone'
  | 'log'
  | 'grape'
  | 'bottle_empty'
  | 'wine_young'
  | 'wine_aged'
  | 'wine_vintage'
  | 'bandage'
  | 'shells'
  | 'cigarettes'
  | 'fish_crucian'
  | 'fish_perch'
  | 'fish_bighead'
  | 'boot'
  | 'stash';

export interface ItemSpec {
  name: string;
  /** Килограммы за штуку. У рыбы вес свой, здесь — запасной. */
  weight: number;
  /** Сколько влезает в одну ячейку. */
  stack: number;
  /** Базовая цена продажи Томеру. */
  sell: number;
  icon: string;
}

export const ITEMS: Record<ItemId, ItemSpec> = {
  apple: { name: 'яблоко', weight: 0.15, stack: 30, sell: 8, icon: '🍎' },
  stone: { name: 'камень', weight: 2.5, stack: 20, sell: 4, icon: '🪨' },
  log: { name: 'бревно', weight: 3, stack: 20, sell: 12, icon: '🪵' },
  grape: { name: 'гроздь', weight: 0.4, stack: 30, sell: 10, icon: '🍇' },
  bottle_empty: { name: 'пустая бутылка', weight: 0.5, stack: 12, sell: 3, icon: '🫙' },
  wine_young: { name: 'молодое вино', weight: 1.2, stack: 8, sell: 60, icon: '🍷' },
  wine_aged: { name: 'выдержанное вино', weight: 1.2, stack: 8, sell: 120, icon: '🍷' },
  wine_vintage: { name: 'коллекционное вино', weight: 1.2, stack: 8, sell: 220, icon: '🍾' },
  bandage: { name: 'бинт', weight: 0.2, stack: 10, sell: 20, icon: '🩹' },
  shells: { name: 'патрон', weight: 0.05, stack: 40, sell: 8, icon: '🔴' },
  cigarettes: { name: 'сигарета', weight: 0.02, stack: 40, sell: 1, icon: '🚬' },
  fish_crucian: { name: 'карась', weight: 0.6, stack: 1, sell: 18, icon: '🐟' },
  fish_perch: { name: 'окунь', weight: 0.8, stack: 1, sell: 35, icon: '🐟' },
  fish_bighead: { name: 'толстолобик', weight: 3, stack: 1, sell: 85, icon: '🐠' },
  boot: { name: 'старый ботинок', weight: 1, stack: 1, sell: 1, icon: '👢' },
  stash: { name: 'пакетик', weight: 0.05, stack: 5, sell: 40, icon: '🥠' },
};

/** Вино по выдержке — порядок важен, по нему считается созревание. */
export const WINE_BY_AGE: ItemId[] = ['wine_young', 'wine_aged', 'wine_vintage'];

export function isFish(id: ItemId): boolean {
  return id.startsWith('fish_') || id === 'boot';
}
