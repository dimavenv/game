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
  | 'must'
  | 'vine_sapling'
  | 'wine_young'
  | 'wine_aged'
  | 'wine_vintage'
  | 'beer'
  | 'bandage'
  | 'shells'
  | 'cigarettes'
  | 'fish_crucian'
  | 'fish_perch'
  | 'fish_bighead'
  | 'boot'
  | 'meat'
  | 'meat_cooked'
  | 'hide_raw'
  | 'leather'
  | 'water_dirty'
  | 'water_clean'
  | 'coat'
  | 'hat'
  | 'boots'
  | 'cocaine'
  | 'hash'
  | 'heroin';

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
  must: { name: 'сусло', weight: 1.1, stack: 10, sell: 25, icon: '🧃' },
  vine_sapling: { name: 'саженец винограда', weight: 0.8, stack: 6, sell: 25, icon: '🌱' },
  wine_young: { name: 'молодое вино', weight: 1.2, stack: 8, sell: 60, icon: '🍷' },
  wine_aged: { name: 'выдержанное вино', weight: 1.2, stack: 8, sell: 120, icon: '🍷' },
  wine_vintage: { name: 'коллекционное вино', weight: 1.2, stack: 8, sell: 220, icon: '🍾' },
  beer: { name: 'пиво', weight: 0.55, stack: 12, sell: 18, icon: '🍺' },
  bandage: { name: 'бинт', weight: 0.2, stack: 10, sell: 20, icon: '🩹' },
  shells: { name: 'патрон', weight: 0.05, stack: 40, sell: 8, icon: '🔴' },
  cigarettes: { name: 'сигарета', weight: 0.02, stack: 40, sell: 1, icon: '🚬' },
  fish_crucian: { name: 'карась', weight: 0.6, stack: 1, sell: 18, icon: '🐟' },
  fish_perch: { name: 'окунь', weight: 0.8, stack: 1, sell: 35, icon: '🐟' },
  fish_bighead: { name: 'толстолобик', weight: 3, stack: 1, sell: 85, icon: '🐠' },
  meat: { name: 'сырое мясо', weight: 1.4, stack: 10, sell: 30, icon: '🥩' },
  meat_cooked: { name: 'жареное мясо', weight: 1.2, stack: 10, sell: 60, icon: '🍖' },
  hide_raw: { name: 'сырая шкура', weight: 2.6, stack: 6, sell: 35, icon: '🟫' },
  leather: { name: 'выделанная кожа', weight: 1.5, stack: 8, sell: 75, icon: '🧶' },
  water_dirty: { name: 'мутная вода', weight: 1.1, stack: 6, sell: 0, icon: '🥛' },
  water_clean: { name: 'чистая вода', weight: 1.1, stack: 6, sell: 12, icon: '💧' },
  coat: { name: 'кожаная куртка', weight: 3.2, stack: 1, sell: 260, icon: '🧥' },
  hat: { name: 'кожаная шапка', weight: 0.9, stack: 1, sell: 120, icon: '🎩' },
  boots: { name: 'кожаные сапоги', weight: 2.2, stack: 1, sell: 190, icon: '🥾' },
  boot: { name: 'старый ботинок', weight: 1, stack: 1, sell: 1, icon: '👢' },
  cocaine: { name: 'кокаин', weight: 0.05, stack: 5, sell: 50, icon: '❄️' },
  hash: { name: 'гашиш', weight: 0.05, stack: 5, sell: 30, icon: '🌿' },
  heroin: { name: 'героин', weight: 0.05, stack: 5, sell: 70, icon: '💉' },
};

/** Вино по выдержке — порядок важен, по нему считается созревание. */
export const WINE_BY_AGE: ItemId[] = ['wine_young', 'wine_aged', 'wine_vintage'];

export function isFish(id: ItemId): boolean {
  return id.startsWith('fish_') || id === 'boot';
}
