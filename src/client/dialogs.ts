import { ECONOMY } from '../shared/balance';
import { fishLabel, fishPrice } from '../shared/fishing';
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
  owned?: (state: GameState) => boolean;
}

const SHOP: ShopEntry[] = [
  { id: 'buy-cigarettes', label: 'Пачка сигарет (20)', price: ECONOMY.prices.cigarettes },
  { id: 'buy-bandage', label: 'Бинт', price: ECONOMY.prices.bandage },
  { id: 'buy-rod', label: 'Удочка', price: ECONOMY.prices.fishingRod, owned: (s) => s.inventory.hasRod },
  {
    id: 'buy-flashlight',
    label: 'Фонарик',
    price: ECONOMY.prices.flashlight,
    owned: (s) => s.inventory.hasFlashlight,
  },
  { id: 'buy-axe', label: 'Хороший топор', price: ECONOMY.prices.goodAxe, owned: (s) => s.inventory.hasGoodAxe },
  { id: 'buy-shotgun', label: 'Дробовик', price: ECONOMY.prices.shotgun, owned: (s) => s.inventory.hasShotgun },
  { id: 'buy-shells', label: 'Патроны, 5 шт.', price: ECONOMY.prices.shells5 },
];

export function fishValue(state: GameState): number {
  return state.inventory.fish.reduce((sum, f) => sum + fishPrice(f), 0);
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

  const catchValue = fishValue(state);
  if (inv.fish.length > 0) {
    actions.push({
      id: 'sell-fish',
      label: `Продать улов (${inv.fish.length})`,
      note: `+${catchValue} ₪`,
      disabled: false,
    });
  }
  if (inv.apples > 0) {
    actions.push({
      id: 'sell-apples',
      label: `Продать яблоки (${inv.apples})`,
      note: `+${inv.apples * ECONOMY.sell.apple} ₪`,
      disabled: false,
    });
  }
  if (inv.logs > 0) {
    actions.push({
      id: 'sell-logs',
      label: `Продать дрова (${inv.logs})`,
      note: `+${inv.logs * ECONOMY.sell.log} ₪`,
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
    inv.money -= entry.price;
    switch (id) {
      case 'buy-cigarettes':
        inv.cigarettes += 20;
        break;
      case 'buy-bandage':
        inv.bandages += 1;
        break;
      case 'buy-rod':
        inv.hasRod = true;
        break;
      case 'buy-flashlight':
        inv.hasFlashlight = true;
        break;
      case 'buy-axe':
        inv.hasGoodAxe = true;
        break;
      case 'buy-shotgun':
        inv.hasShotgun = true;
        break;
      case 'buy-shells':
        inv.shells += 5;
        break;
      default:
        break;
    }
    return { toast: `${entry.label} — ${entry.price} ₪`, tone: 'money', sound: 'coins', voice: 'tomer_buy' };
  }

  switch (id) {
    case 'sell-fish': {
      const sum = fishValue(state);
      const best = [...inv.fish].sort((a, b) => fishPrice(b) - fishPrice(a))[0];
      inv.fish = [];
      inv.money += sum;
      return {
        toast: best ? `Улов продан за ${sum} ₪ (лучший — ${fishLabel(best)})` : `Улов продан за ${sum} ₪`,
        tone: 'money',
        sound: 'coins',
        voice: 'tomer_sell',
      };
    }
    case 'sell-apples': {
      const sum = inv.apples * ECONOMY.sell.apple;
      inv.apples = 0;
      inv.money += sum;
      return { toast: `Яблоки проданы за ${sum} ₪`, tone: 'money', sound: 'coins' };
    }
    case 'sell-logs': {
      const sum = inv.logs * ECONOMY.sell.log;
      inv.logs = 0;
      inv.money += sum;
      return { toast: `Дрова проданы за ${sum} ₪`, tone: 'money', sound: 'coins' };
    }
    case 'leave':
      return { close: true };
    default:
      return {};
  }
}
