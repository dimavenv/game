import { ITEMS, type ItemId } from './items';

export const BACKPACK_SLOTS = 20;
/** Сколько килограммов утащит игрок, прежде чем начнёт кряхтеть. */
export const CARRY_LIMIT = 45;

export interface ItemStack {
  id: ItemId;
  count: number;
  /** Вес конкретного экземпляра — у рыбы он свой. */
  weight?: number;
}

/** Что надето: греет и не занимает места в сетке. */
export interface Worn {
  coat: boolean;
  hat: boolean;
  boots: boolean;
}

export interface Inventory {
  money: number;
  slots: (ItemStack | null)[];
  /** Быстрые ячейки: из них едят и пьют по клавише, не открывая рюкзак. */
  food: ItemStack | null;
  drink: ItemStack | null;
  worn: Worn;
  hasRod: boolean;
  hasFlashlight: boolean;
  hasGoodAxe: boolean;
  hasShotgun: boolean;
  hasHammer: boolean;
  hasLighter: boolean;
  hasKnife: boolean;
}

export function createInventory(money: number): Inventory {
  return {
    money,
    slots: Array.from({ length: BACKPACK_SLOTS }, () => null),
    food: null,
    drink: null,
    worn: { coat: false, hat: false, boots: false },
    hasRod: false,
    hasFlashlight: false,
    hasGoodAxe: false,
    hasShotgun: false,
    hasHammer: false,
    hasLighter: false,
    hasKnife: false,
  };
}

/** Насколько греет надетое: 0 — рубаха, 1 — полный комплект. */
export function insulation(inv: Inventory): number {
  let sum = 0;
  if (inv.worn.coat) sum += 0.5;
  if (inv.worn.hat) sum += 0.2;
  if (inv.worn.boots) sum += 0.3;
  return sum;
}

export function stackWeight(stack: ItemStack): number {
  return (stack.weight ?? ITEMS[stack.id].weight) * stack.count;
}

export function totalWeight(inv: Inventory): number {
  let sum = 0;
  for (const slot of inv.slots) if (slot) sum += stackWeight(slot);
  return sum;
}

export function isOverloaded(inv: Inventory): boolean {
  return totalWeight(inv) > CARRY_LIMIT;
}

export function countItem(inv: Inventory, id: ItemId): number {
  let n = 0;
  for (const slot of inv.slots) if (slot?.id === id) n += slot.count;
  return n;
}

/** Все стопки с рыбой — по ним считаются цена улова и задания. */
export function itemStacks(inv: Inventory, id: ItemId): ItemStack[] {
  return inv.slots.filter((s): s is ItemStack => s?.id === id);
}

/**
 * Кладёт вещи в рюкзак. Возвращает, сколько не влезло: места конечны,
 * и это часть игры — сходить разгрузиться в сундук.
 */
export function addItem(inv: Inventory, id: ItemId, count = 1, weight?: number): number {
  const spec = ITEMS[id];
  let left = count;

  // Сначала добиваем начатые стопки — но только у вещей без своего веса.
  if (weight === undefined && spec.stack > 1) {
    for (const slot of inv.slots) {
      if (left <= 0) break;
      if (!slot || slot.id !== id || slot.weight !== undefined) continue;
      const room = spec.stack - slot.count;
      if (room <= 0) continue;
      const put = Math.min(room, left);
      slot.count += put;
      left -= put;
    }
  }

  for (let i = 0; i < inv.slots.length && left > 0; i++) {
    if (inv.slots[i]) continue;
    const put = weight === undefined ? Math.min(spec.stack, left) : 1;
    inv.slots[i] = weight === undefined ? { id, count: put } : { id, count: 1, weight };
    left -= put;
  }

  return left;
}

/** Забирает вещи. Возвращает, сколько реально удалось забрать. */
export function removeItem(inv: Inventory, id: ItemId, count = 1): number {
  let left = count;
  for (let i = 0; i < inv.slots.length && left > 0; i++) {
    const slot = inv.slots[i];
    if (!slot || slot.id !== id) continue;
    const take = Math.min(slot.count, left);
    slot.count -= take;
    left -= take;
    if (slot.count <= 0) inv.slots[i] = null;
  }
  return count - left;
}

export function hasRoomFor(inv: Inventory, id: ItemId, count = 1): boolean {
  const spec = ITEMS[id];
  let room = 0;
  for (const slot of inv.slots) {
    if (!slot) room += spec.stack;
    else if (slot.id === id && slot.weight === undefined) room += spec.stack - slot.count;
    if (room >= count) return true;
  }
  return room >= count;
}

/** Перекладывание мышью: слить одинаковое, иначе поменять местами. */
export function moveStack(slots: (ItemStack | null)[], from: number, to: number): void {
  if (from === to) return;
  const source = slots[from];
  if (!source) return;
  const target = slots[to];

  if (target && target.id === source.id && target.weight === undefined && source.weight === undefined) {
    const room = ITEMS[target.id].stack - target.count;
    const put = Math.min(room, source.count);
    target.count += put;
    source.count -= put;
    if (source.count <= 0) slots[from] = null;
    return;
  }

  slots[from] = target;
  slots[to] = source;
}

export function firstEmptySlot(slots: (ItemStack | null)[]): number {
  return slots.findIndex((s) => s === null);
}
