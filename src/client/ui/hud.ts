import { FISH_ITEMS } from '../../shared/fishing';
import { CARRY_LIMIT, countItem, totalWeight, type Inventory } from '../../shared/inventory';
import { ITEMS } from '../../shared/items';
import type { ActiveQuest } from '../../shared/quests';
import { QUEST_TITLE, questText } from '../../shared/quests';
import { PHASE_LABEL, clockLabel, phaseOf } from '../../shared/time';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Нет элемента #${id}`);
  return node as T;
}

/** Тонкий слой поверх DOM: всё, что игрок видит поверх мира. */
export class Hud {
  private readonly root = el('hud');
  private readonly day = el('day');
  private readonly time = el('time');
  private readonly phase = el('phase');
  private readonly hint = el('hint');
  private readonly money = el('money');
  private readonly carry = el('carry');
  private readonly quest = el('quest');
  private readonly breath = el('breath');
  private readonly breathFill = el<HTMLElement>('breath').querySelector('i')!;
  private readonly warm = el('warm');
  private readonly vignette = el('vignette');
  private readonly damage = el('damage');
  private readonly fade = el('fade');
  private readonly health = el('health');
  private readonly weight = el('weight');
  private readonly resume = el('resume');
  private readonly slots = new Map<number, HTMLElement>();
  private currentHint = '';
  private currentCarry = '';
  private currentQuest = '';

  constructor() {
    for (const node of document.querySelectorAll<HTMLElement>('.slot')) {
      this.slots.set(Number(node.dataset.slot), node);
    }
  }

  setVisible(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  /** «Кликни, чтобы вернуться» — когда браузер не отдал захват мыши сразу. */
  setResume(show: boolean): void {
    this.resume.classList.toggle('hidden', !show);
  }

  setClock(t: number, day: number): void {
    this.day.textContent = `День ${day}`;
    this.time.textContent = clockLabel(t);
    this.phase.textContent = PHASE_LABEL[phaseOf(t)];
  }

  setHint(text: string): void {
    if (text === this.currentHint) return;
    this.currentHint = text;
    this.hint.textContent = text;
    this.hint.classList.toggle('show', text.length > 0);
  }

  /** Деньги, ноша и вес: пустые строки не показываем. */
  setPurse(inv: Inventory): void {
    this.money.textContent = `${inv.money} ₪`;
    const parts: string[] = [];
    for (const id of ['apple', 'log', 'stone', 'grape'] as const) {
      const n = countItem(inv, id);
      if (n > 0) parts.push(`${ITEMS[id].name} ${n}`);
    }
    const fish = FISH_ITEMS.reduce((n, id) => n + countItem(inv, id), 0);
    if (fish > 0) parts.push(`рыба ${fish}`);

    const weight = totalWeight(inv);
    const weightText = `${weight.toFixed(1)}/${CARRY_LIMIT} кг`;
    const text = parts.join(' · ');
    if (text !== this.currentCarry) {
      this.currentCarry = text;
      this.carry.textContent = text;
    }
    this.weight.textContent = weightText;
    this.weight.classList.toggle('over', weight > CARRY_LIMIT);
  }

  setQuest(quest: ActiveQuest | null, progress: number): void {
    const text = quest ? `${QUEST_TITLE[quest.kind]}|${questText(quest)}|${progress}/${quest.target}|${quest.reward}` : '';
    if (text === this.currentQuest) return;
    this.currentQuest = text;
    this.quest.classList.toggle('hidden', !quest);
    if (!quest) return;
    this.quest.replaceChildren();
    const title = document.createElement('b');
    title.textContent = `${QUEST_TITLE[quest.kind]} · ${quest.reward} ₪`;
    const body = document.createElement('span');
    body.textContent = `${questText(quest)} — ${progress}/${quest.target}`;
    this.quest.append(title, body);
  }

  /** Подсветка активного слота и блокировка непокупленного. */
  setSlots(active: number, unlocked: Record<number, boolean>, counts: Record<number, string>): void {
    for (const [index, node] of this.slots) {
      node.classList.toggle('active', index === active);
      node.classList.toggle('locked', unlocked[index] === false);
      const counter = node.querySelector('i');
      if (counter) counter.textContent = counts[index] ?? '';
    }
  }

  setBreath(fraction: number): void {
    const show = fraction < 0.995;
    this.breath.classList.toggle('show', show);
    this.breathFill.style.transform = `scaleX(${Math.max(fraction, 0)})`;
  }

  /** Здоровье: краснеющая рамка вместо полоски, и чёрный экран при смерти. */
  setHealth(fraction: number, hurtFlash: number, dying: boolean): void {
    const hurt = Math.max(0, 1 - fraction);
    this.damage.style.opacity = Math.min(1, hurt * 0.75 + hurtFlash * 0.6).toFixed(3);
    this.fade.style.opacity = dying ? '1' : '0';
    if (fraction < 0.999) {
      this.health.textContent = `здоровье ${Math.round(fraction * 100)}%`;
      this.health.classList.remove('hidden');
    } else {
      this.health.classList.add('hidden');
    }
  }

  /** Тёплая волна и подсевшая по краям картинка сразу после затяжки. */
  setBuzz(warmth: number, buzz: number): void {
    this.warm.style.opacity = warmth.toFixed(3);
    this.vignette.style.opacity = (0.55 + buzz * 0.22).toFixed(3);
  }
}
