import { CARRY_LIMIT, moveStack, stackWeight, totalWeight, type Inventory, type ItemStack } from '../../shared/inventory';
import { ITEMS } from '../../shared/items';

/**
 * Рюкзак: сетка ячеек, вес и перекладывание мышью. Слева — то, что на игроке,
 * справа (если открыт сундук) — содержимое сундука.
 */
export class InventoryScreen {
  private readonly root: HTMLDivElement;
  private readonly leftGrid: HTMLDivElement;
  private readonly rightPane: HTMLDivElement;
  private readonly rightGrid: HTMLDivElement;
  private readonly rightTitle: HTMLDivElement;
  private readonly weightEl: HTMLDivElement;

  private inventory: Inventory | null = null;
  private chest: (ItemStack | null)[] | null = null;
  /** Что сейчас «в руке» у курсора: сторона и номер ячейки. */
  private held: { side: 'bag' | 'chest'; index: number } | null = null;
  private closeHandler: (() => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'inventory';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="inv-panel">
        <div class="inv-side">
          <div class="inv-title">Рюкзак</div>
          <div class="inv-grid" data-side="bag"></div>
          <div class="inv-weight"></div>
        </div>
        <div class="inv-side inv-chest hidden">
          <div class="inv-title">Сундук</div>
          <div class="inv-grid" data-side="chest"></div>
        </div>
      </div>
      <div class="inv-help">Клик — взять стопку, клик по ячейке — положить. Tab или Esc — закрыть.</div>`;
    document.body.appendChild(this.root);

    this.leftGrid = this.root.querySelector('.inv-grid[data-side="bag"]')!;
    this.rightPane = this.root.querySelector('.inv-chest')!;
    this.rightGrid = this.root.querySelector('.inv-grid[data-side="chest"]')!;
    this.rightTitle = this.rightPane.querySelector('.inv-title')!;
    this.weightEl = this.root.querySelector('.inv-weight')!;
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(inventory: Inventory, onClose: () => void, chest?: { title: string; slots: (ItemStack | null)[] }): void {
    this.inventory = inventory;
    this.chest = chest?.slots ?? null;
    this.closeHandler = onClose;
    this.held = null;
    this.rightPane.classList.toggle('hidden', !chest);
    if (chest) this.rightTitle.textContent = chest.title;
    this.render();
    this.root.classList.remove('hidden');
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.add('hidden');
    this.inventory = null;
    this.chest = null;
    const onClose = this.closeHandler;
    this.closeHandler = null;
    onClose?.();
  }

  private slotsOf(side: 'bag' | 'chest'): (ItemStack | null)[] | null {
    return side === 'bag' ? (this.inventory?.slots ?? null) : this.chest;
  }

  /** Клик по ячейке: взять, положить или переложить между сторонами. */
  private click(side: 'bag' | 'chest', index: number): void {
    const slots = this.slotsOf(side);
    if (!slots) return;

    if (!this.held) {
      if (slots[index]) this.held = { side, index };
      this.render();
      return;
    }

    const from = this.slotsOf(this.held.side);
    if (!from) return;

    if (this.held.side === side) {
      moveStack(slots, this.held.index, index);
    } else {
      // Между рюкзаком и сундуком: сливаем одинаковое, иначе меняем местами.
      const source = from[this.held.index];
      const target = slots[index];
      if (source && target && target.id === source.id && !target.weight && !source.weight) {
        const room = ITEMS[target.id].stack - target.count;
        const put = Math.min(room, source.count);
        target.count += put;
        source.count -= put;
        if (source.count <= 0) from[this.held.index] = null;
      } else {
        from[this.held.index] = target;
        slots[index] = source;
      }
    }

    this.held = null;
    this.render();
  }

  private renderGrid(grid: HTMLElement, side: 'bag' | 'chest', slots: (ItemStack | null)[]): void {
    grid.replaceChildren();
    slots.forEach((stack, index) => {
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'inv-cell';
      if (this.held && this.held.side === side && this.held.index === index) cell.classList.add('held');
      if (stack) {
        const spec = ITEMS[stack.id];
        cell.classList.add('filled');
        cell.title = `${spec.name} · ${stackWeight(stack).toFixed(2)} кг`;
        const icon = document.createElement('span');
        icon.className = 'inv-icon';
        icon.textContent = spec.icon;
        cell.appendChild(icon);
        if (stack.count > 1) {
          const count = document.createElement('i');
          count.textContent = String(stack.count);
          cell.appendChild(count);
        }
        if (stack.weight !== undefined) {
          const kg = document.createElement('b');
          kg.textContent = `${stack.weight.toFixed(1)}`;
          cell.appendChild(kg);
        }
      }
      cell.addEventListener('click', () => this.click(side, index));
      grid.appendChild(cell);
    });
  }

  render(): void {
    if (!this.inventory) return;
    this.renderGrid(this.leftGrid, 'bag', this.inventory.slots);
    if (this.chest) this.renderGrid(this.rightGrid, 'chest', this.chest);

    const weight = totalWeight(this.inventory);
    this.weightEl.textContent = `${weight.toFixed(1)} / ${CARRY_LIMIT} кг`;
    this.weightEl.classList.toggle('over', weight > CARRY_LIMIT);
  }
}
