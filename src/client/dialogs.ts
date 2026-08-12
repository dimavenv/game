import { AVI, ECONOMY } from '../shared/balance';
import { DRUGS } from '../shared/drugs';
import { nightJobProgress, nightJobText, rollNightJob, type NightJob } from '../shared/avi';
import { FISH_ITEMS, fishKindOfItem, fishLabel, fishPrice } from '../shared/fishing';
import { addItem, countItem, hasRoomFor, itemStacks, removeItem } from '../shared/inventory';
import { ITEMS, type ItemId } from '../shared/items';
import { completeQuest, questProgress, questReady, questText, rollQuest } from '../shared/quests';
import type { GameState } from '../shared/state';
import type { DialogSpec } from './ui/dialog';

export interface DialogResult {
  /** Что показать всплывающим сообщением. */
  toast?: string;
  tone?: 'normal' | 'money' | 'bad';
  /** Звук: монеты или обычный «взял». */
  sound?: 'coins' | 'pickup' | 'none';
  close?: boolean;
  /** Игрок дал прикурить — сигарету надо списать. */
  spentCigarette?: boolean;
  /** Слот записанной озвучки (см. SOUNDS.md). Нет файла — тишина. */
  voice?: string;
}

const BURAVCHIK_GREETING = [
  'Сел я тут, значит, и сижу. А ты ходишь.',
  'Озеро круглое, я проверял. Табличка не врёт.',
  'Тихо сегодня. Даже подозрительно.',
];

export function buravchikDialog(state: GameState, day: number, canLightUp: boolean): DialogSpec {
  const quest = state.quest;
  const progress = quest ? questProgress(quest, state) : 0;
  const ready = quest ? questReady(quest, state) : false;

  const speech = quest
    ? ready
      ? 'Ну вот, а говорил — не найдёшь. Давай сюда.'
      : `Ты ещё не всё. ${questText(quest)}`
    : BURAVCHIK_GREETING[(day + state.questsDone) % BURAVCHIK_GREETING.length];

  const cooldownLeft = ECONOMY.lightUpBuravchik.cooldownDays - (day - state.world.lightUpDay);

  return {
    title: 'Буравчик',
    speech,
    actions: [
      quest
        ? {
            id: 'hand-in',
            label: ready ? 'Сдать работу' : `${questText(quest)}`,
            note: ready ? `+${quest.reward} ₪` : `${progress}/${quest.target}`,
            disabled: !ready,
          }
        : { id: 'take-quest', label: 'Спросить про работу' },
      {
        id: 'light-up',
        label: 'Дать прикурить',
        note: cooldownLeft > 0 ? 'не сегодня' : canLightUp ? `+${ECONOMY.lightUpBuravchik.reward} ₪` : 'нет сигарет',
        disabled: cooldownLeft > 0 || !canLightUp,
      },
      { id: 'leave', label: 'Отойти' },
    ],
    footer: `В кармане ${state.inventory.money} ₪`,
  };
}

export function buravchikAction(
  id: string,
  state: GameState,
  day: number,
  rng: () => number,
  allowZombies: boolean,
): DialogResult {
  switch (id) {
    case 'take-quest': {
      // Зачистку Буравчик предлагает только тем, кто уже пережил первую ночь.
      state.quest = rollQuest(rng, allowZombies);
      return { toast: `Задание: ${questText(state.quest)}`, sound: 'pickup', voice: 'buravchik_quest' };
    }
    case 'hand-in': {
      if (!state.quest || !questReady(state.quest, state)) return {};
      const reward = completeQuest(state.quest, state);
      return { toast: `Буравчик отсчитал ${reward} ₪`, tone: 'money', sound: 'coins', voice: 'buravchik_done' };
    }
    case 'light-up': {
      state.world.lightUpDay = day;
      state.inventory.money += ECONOMY.lightUpBuravchik.reward;
      return {
        toast: `Прикурил Буравчику. +${ECONOMY.lightUpBuravchik.reward} ₪`,
        tone: 'money',
        sound: 'coins',
        spentCigarette: true,
        voice: 'buravchik_light',
      };
    }
    case 'leave':
      return { close: true };
    default:
      return {};
  }
}

interface ShopEntry {
  id: string;
  label: string;
  price: number;
  /** Что кладётся в рюкзак при покупке. */
  item?: { id: ItemId; count: number };
  /** Инструменты покупаются один раз. */
  owned?: (state: GameState) => boolean;
  buy?: (state: GameState) => void;
}

const SHOP: ShopEntry[] = [
  { id: 'buy-cigarettes', label: 'Пачка сигарет (20)', price: ECONOMY.prices.cigarettes, item: { id: 'cigarettes', count: 20 } },
  { id: 'buy-bandage', label: 'Бинт', price: ECONOMY.prices.bandage, item: { id: 'bandage', count: 1 } },
  { id: 'buy-shells', label: 'Патроны, 5 шт.', price: ECONOMY.prices.shells5, item: { id: 'shells', count: 5 } },
  { id: 'buy-bottles', label: 'Пустые бутылки, 5 шт.', price: ECONOMY.prices.bottles5, item: { id: 'bottle_empty', count: 5 } },
  { id: 'buy-sapling', label: 'Саженец винограда', price: ECONOMY.prices.vineSapling, item: { id: 'vine_sapling', count: 1 } },
  { id: 'buy-rod', label: 'Удочка', price: ECONOMY.prices.fishingRod, owned: (s) => s.inventory.hasRod, buy: (s) => { s.inventory.hasRod = true; } },
  {
    id: 'buy-flashlight',
    label: 'Фонарик',
    price: ECONOMY.prices.flashlight,
    owned: (s) => s.inventory.hasFlashlight,
    buy: (s) => { s.inventory.hasFlashlight = true; },
  },
  { id: 'buy-hammer', label: 'Молот', price: ECONOMY.prices.hammer, owned: (s) => s.inventory.hasHammer, buy: (s) => { s.inventory.hasHammer = true; } },
  { id: 'buy-knife', label: 'Разделочный нож', price: ECONOMY.prices.knife, owned: (s) => s.inventory.hasKnife, buy: (s) => { s.inventory.hasKnife = true; } },
  { id: 'buy-axe', label: 'Хороший топор', price: ECONOMY.prices.goodAxe, owned: (s) => s.inventory.hasGoodAxe, buy: (s) => { s.inventory.hasGoodAxe = true; } },
  { id: 'buy-shotgun', label: 'Дробовик', price: ECONOMY.prices.shotgun, owned: (s) => s.inventory.hasShotgun, buy: (s) => { s.inventory.hasShotgun = true; } },
];

/** Что Томер скупает: ресурсы и улов. */
const SELLABLE: ItemId[] = [
  'apple',
  'log',
  'stone',
  'meat',
  'meat_cooked',
  'hide_raw',
  'leather',
  'grape',
  'must',
  'wine_young',
  'wine_aged',
  'wine_vintage',
];

/** Цена стопки с учётом веса рыбы. */
function stackValue(id: ItemId, count: number, weight?: number): number {
  const kind = fishKindOfItem(id);
  if (kind && weight !== undefined) return fishPrice({ kind, weight });
  return ITEMS[id].sell * count;
}

export function fishValue(state: GameState): number {
  let sum = 0;
  for (const id of FISH_ITEMS) {
    for (const stack of itemStacks(state.inventory, id)) {
      sum += stackValue(id, stack.count, stack.weight);
    }
  }
  return sum;
}

function fishCount(state: GameState): number {
  return FISH_ITEMS.reduce((n, id) => n + countItem(state.inventory, id), 0);
}

export function tomerDialog(state: GameState): DialogSpec {
  const inv = state.inventory;
  const actions = SHOP.map((entry) => {
    const owned = entry.owned?.(state) ?? false;
    return {
      id: entry.id,
      label: entry.label,
      note: owned ? 'уже есть' : `${entry.price} ₪`,
      disabled: owned || inv.money < entry.price,
    };
  });

  const catchSize = fishCount(state);
  if (catchSize > 0) {
    actions.push({
      id: 'sell-fish',
      label: `Продать улов (${catchSize})`,
      note: `+${fishValue(state)} ₪`,
      disabled: false,
    });
  }
  for (const id of SELLABLE) {
    const count = countItem(inv, id);
    if (count <= 0) continue;
    actions.push({
      id: `sell-${id}`,
      label: `Продать: ${ITEMS[id].name} (${count})`,
      note: `+${ITEMS[id].sell * count} ₪`,
      disabled: false,
    });
  }
  actions.push({ id: 'leave', label: 'Отойти', note: '', disabled: false });

  const speech =
    inv.money < 40
      ? 'Смотри сколько хочешь, денег это не прибавит.'
      : 'Бери, не стесняйся. Улов тоже беру, только не ботинки.';

  return {
    title: 'Томер Загур',
    speech,
    actions,
    footer: `В кармане ${inv.money} ₪`,
  };
}

export function tomerAction(id: string, state: GameState): DialogResult {
  const inv = state.inventory;
  const entry = SHOP.find((e) => e.id === id);
  if (entry) {
    if (inv.money < entry.price) return { toast: 'Не хватает шекелей', tone: 'bad', voice: 'tomer_poor' };
    if (entry.item && !hasRoomFor(inv, entry.item.id, entry.item.count)) {
      return { toast: 'В рюкзаке нет места', tone: 'bad' };
    }
    inv.money -= entry.price;
    entry.buy?.(state);
    if (entry.item) addItem(inv, entry.item.id, entry.item.count);
    return { toast: `${entry.label} — ${entry.price} ₪`, tone: 'money', sound: 'coins', voice: 'tomer_buy' };
  }

  if (id === 'sell-fish') {
    let sum = 0;
    let best: { name: string; value: number } | null = null;
    for (const fishId of FISH_ITEMS) {
      for (const stack of itemStacks(inv, fishId)) {
        const value = stackValue(fishId, stack.count, stack.weight);
        sum += value;
        const kind = fishKindOfItem(fishId);
        if (kind && stack.weight !== undefined && (!best || value > best.value)) {
          best = { name: fishLabel({ kind, weight: stack.weight }), value };
        }
      }
      removeItem(inv, fishId, countItem(inv, fishId));
    }
    inv.money += sum;
    return {
      toast: best ? `Улов продан за ${sum} ₪ (лучший — ${best.name})` : `Улов продан за ${sum} ₪`,
      tone: 'money',
      sound: 'coins',
      voice: 'tomer_sell',
    };
  }

  if (id.startsWith('sell-')) {
    const itemId = id.slice(5) as ItemId;
    const count = countItem(inv, itemId);
    if (count <= 0) return {};
    const sum = ITEMS[itemId].sell * count;
    removeItem(inv, itemId, count);
    inv.money += sum;
    return { toast: `${ITEMS[itemId].name} — продано за ${sum} ₪`, tone: 'money', sound: 'coins', voice: 'tomer_sell' };
  }

  if (id === 'leave') return { close: true };
  return {};
}


/* --- Ави Загур: ночной чёрный рынок --- */

const AVI_SHOP: ShopEntry[] = [
  { id: 'avi-shells', label: 'Патроны, 5 шт.', price: AVI.prices.shells5, item: { id: 'shells', count: 5 } },
  { id: 'avi-bandage', label: 'Бинт', price: AVI.prices.bandage, item: { id: 'bandage', count: 1 } },
  ...Object.values(DRUGS).map((drug) => ({
    id: `avi-${drug.item}`,
    label: drug.name[0].toUpperCase() + drug.name.slice(1),
    price: drug.price,
    item: { id: drug.item, count: 1 },
  })),
];

const WINES: ItemId[] = ['wine_young', 'wine_aged', 'wine_vintage'];

/** Ави платит за вино втрое против брата — ради этого его и ищут. */
export function aviWineValue(state: GameState): number {
  return WINES.reduce((sum, id) => sum + countItem(state.inventory, id) * ITEMS[id].sell * AVI.wineMultiplier, 0);
}

export function aviDialog(state: GameState, day: number): DialogSpec {
  const inv = state.inventory;
  const actions = AVI_SHOP.map((entry) => ({
    id: entry.id,
    label: entry.label,
    note: `${entry.price} ₪`,
    disabled: inv.money < entry.price,
  }));

  const wineCount = WINES.reduce((n, id) => n + countItem(inv, id), 0);
  if (wineCount > 0) {
    actions.push({
      id: 'avi-sell-wine',
      label: `Сдать вино (${wineCount})`,
      note: `+${aviWineValue(state)} ₪`,
      disabled: false,
    });
  }

  const job = state.nightJob;
  if (job && job.day === day) {
    const progress = nightJobProgress(job, inv);
    actions.push({
      id: 'avi-job-done',
      label: progress >= job.target ? 'Сдать поручение' : nightJobText(job),
      note: progress >= job.target ? `+${job.reward} ₪` : `${progress}/${job.target}`,
      disabled: progress < job.target,
    });
  } else {
    actions.push({ id: 'avi-job', label: 'Спросить про работу на ночь', note: '', disabled: false });
  }

  actions.push({ id: 'leave', label: 'Отойти', note: '', disabled: false });

  return {
    title: 'Ави Загур',
    speech:
      wineCount > 0
        ? 'О, вино. Брат в этом не разбирается, а я разбираюсь.'
        : 'Тише. Ты меня не видел, я тебя не видел. Что нужно?',
    actions,
    footer: `В кармане ${inv.money} ₪`,
  };
}

export function aviAction(
  id: string,
  state: GameState,
  day: number,
  rng: () => number,
): DialogResult & { job?: NightJob } {
  const inv = state.inventory;
  const entry = AVI_SHOP.find((e) => e.id === id);
  if (entry) {
    if (inv.money < entry.price) return { toast: 'Не хватает шекелей', tone: 'bad' };
    if (entry.item && !hasRoomFor(inv, entry.item.id, entry.item.count)) {
      return { toast: 'В рюкзаке нет места', tone: 'bad' };
    }
    inv.money -= entry.price;
    if (entry.item) addItem(inv, entry.item.id, entry.item.count);
    return { toast: `${entry.label} — ${entry.price} ₪`, tone: 'money', sound: 'coins', voice: 'avi_deal' };
  }

  switch (id) {
    case 'avi-sell-wine': {
      const sum = aviWineValue(state);
      for (const wine of WINES) removeItem(inv, wine, countItem(inv, wine));
      inv.money += sum;
      return { toast: `Вино ушло за ${sum} ₪`, tone: 'money', sound: 'coins', voice: 'avi_deal' };
    }
    case 'avi-job': {
      const job = rollNightJob(rng, day);
      state.nightJob = job;
      return { toast: `На ночь: ${nightJobText(job)}`, sound: 'pickup', voice: 'avi_job' };
    }
    case 'avi-job-done': {
      const job = state.nightJob;
      if (!job || nightJobProgress(job, inv) < job.target) return {};
      if (job.kind === 'wine') {
        let left = job.target;
        for (const wine of WINES) {
          const take = Math.min(left, countItem(inv, wine));
          removeItem(inv, wine, take);
          left -= take;
          if (left <= 0) break;
        }
      }
      inv.money += job.reward;
      state.nightJob = null;
      return { toast: `Ави расплатился: ${job.reward} ₪`, tone: 'money', sound: 'coins' };
    }
    case 'leave':
      return { close: true };
    default:
      return {};
  }
}
