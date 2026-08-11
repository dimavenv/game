import { countFish } from './fishing';
import type { GameState } from './state';

export type QuestKind = 'apples' | 'fish' | 'zombies';

export interface ActiveQuest {
  kind: QuestKind;
  target: number;
  /** Прогресс считается по инвентарю, кроме зомби — их считаем убийствами. */
  progress: number;
  reward: number;
}

interface QuestSpec {
  /** Сколько единиц просит Буравчик. */
  min: number;
  max: number;
  /** Награда за единицу. */
  perUnit: number;
}

const SPECS: Record<QuestKind, QuestSpec> = {
  apples: { min: 6, max: 10, perUnit: 15 },
  fish: { min: 2, max: 4, perUnit: 85 },
  zombies: { min: 4, max: 8, perUnit: 50 },
};

export const QUEST_TITLE: Record<QuestKind, string> = {
  apples: 'Яблоки',
  fish: 'Толстолобики',
  zombies: 'Зачистка',
};

export function questText(quest: ActiveQuest): string {
  switch (quest.kind) {
    case 'apples':
      return `Нарвать яблок: ${quest.target} шт.`;
    case 'fish':
      return `Поймать толстолобиков: ${quest.target} шт.`;
    case 'zombies':
      return `Упокоить зомби: ${quest.target} шт.`;
  }
}

export function rollQuest(rng: () => number, allowZombies: boolean): ActiveQuest {
  const kinds: QuestKind[] = allowZombies ? ['apples', 'fish', 'zombies'] : ['apples', 'fish'];
  const kind = kinds[Math.floor(rng() * kinds.length)];
  const spec = SPECS[kind];
  const target = spec.min + Math.floor(rng() * (spec.max - spec.min + 1));
  return { kind, target, progress: 0, reward: target * spec.perUnit };
}

/** Для «принеси» прогресс — это то, что лежит в карманах прямо сейчас. */
export function questProgress(quest: ActiveQuest, state: GameState): number {
  switch (quest.kind) {
    case 'apples':
      return state.inventory.apples;
    case 'fish':
      return countFish(state.inventory.fish, 'bighead');
    case 'zombies':
      return quest.progress;
  }
}

export function questReady(quest: ActiveQuest, state: GameState): boolean {
  return questProgress(quest, state) >= quest.target;
}

/** Забирает у игрока то, что просили, и отдаёт шекели. */
export function completeQuest(quest: ActiveQuest, state: GameState): number {
  const inv = state.inventory;
  if (quest.kind === 'apples') {
    inv.apples -= quest.target;
  } else if (quest.kind === 'fish') {
    let left = quest.target;
    inv.fish = inv.fish.filter((f) => {
      if (f.kind === 'bighead' && left > 0) {
        left -= 1;
        return false;
      }
      return true;
    });
  }
  inv.money += quest.reward;
  state.quest = null;
  state.questsDone += 1;
  return quest.reward;
}
