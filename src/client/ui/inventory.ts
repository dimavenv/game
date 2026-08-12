import { CARRY_LIMIT, addItem, moveStack, stackWeight, totalWeight, type Inventory, type ItemStack } from '../../shared/inventory';
import { ITEMS, type ItemId } from '../../shared/items';

type Side = 'bag' | 'chest' | 'quick';

/** Что можно надеть — и сколько от этого тепла. */
const WEARABLE: { id: ItemId; label: string; key: 'coat' | 'hat' | 'boots' }[] = [
  { id: 'coat', label: 'куртка', key: 'coat' },
  { id: 'hat', label: 'шапка', key: 'hat' },
  { id: 'boots', label: 'сапоги', key: 'boots' },
];

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
  private readonly quickGrid: HTMLDivElement;
  private readonly wornGrid: HTMLDivElement;
  private readonly wornNote: HTMLDivElement;
  /** Быстрые ячейки живут отдельными полями инвентаря, здесь их вид массивом. */
  private readonly quick: (ItemStack | null)[] = [null, null];

  private inventory: Inventory | null = null;
  private chest: (ItemStack | null)[] | null = null;
  /** Что сейчас «в руке» у курсора: сторона и номер ячейки. */
  private held: { side: Side; index: number } | null = null;
  private closeHandler: (() => void) | null = null;
  private useHandler: ((id: ItemId) => void) | null = null;

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
          <div class="inv-row">
            <div class="inv-quick">
              <div class="inv-title">Быстрые ячейки</div>
              <div class="inv-grid inv-grid-quick" data-side="quick"></div>
              <div class="inv-note">F — поесть · G — попить</div>
            </div>
            <div class="inv-worn">
              <div class="inv-title">На себе</div>
              <div class="inv-grid inv-grid-worn"></div>
              <div class="inv-note"></div>
            </div>
          </div>
        </div>
        <div class="inv-side inv-chest hidden">
          <div class="inv-title">Сундук</div>
          <div class="inv-grid" data-side="chest"></div>
        </div>
      </div>
      <div class="inv-help">Клик — взять стопку, клик по ячейке — положить. Правая кнопка — использовать или надеть. Tab или Esc — закрыть.</div>`;
    document.body.appendChild(this.root);

    this.leftGrid = this.root.querySelector('.inv-grid[data-side="bag"]')!;
    this.rightPane = this.root.querySelector('.inv-chest')!;
    this.rightGrid = this.root.querySelector('.inv-grid[data-side="chest"]')!;
    this.rightTitle = this.rightPane.querySelector('.inv-title')!;
    this.weightEl = this.root.querySelector('.inv-weight')!;
    this.quickGrid = this.root.querySelector('.inv-grid[data-side="quick"]')!;
    this.wornGrid = this.root.querySelector('.inv-grid-worn')!;
    this.wornNote = this.root.querySelector('.inv-worn .inv-note')!;
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  /** Что делать по правой кнопке: съесть, перевязаться, занюхать. */
  setUseHandler(handler: (id: ItemId) => void): void {
    this.useHandler = handler;
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

  private slotsOf(side: Side): (ItemStack | null)[] | null {
    if (side === 'bag') return this.inventory?.slots ?? null;
    if (side === 'quick') return this.inventory ? this.quick : null;
    return this.chest;
  }

  /** Быстрые ячейки — два отдельных поля; здесь они синхронизируются с массивом. */
  private pullQuick(): void {
    if (!this.inventory) return;
    this.quick[0] = this.inventory.food;
    this.quick[1] = this.inventory.drink;
  }

  private pushQuick(): void {
    if (!this.inventory) return;
    this.inventory.food = this.quick[0];
    this.inventory.drink = this.quick[1];
  }

  /** Клик по ячейке: взять, положить или переложить между сторонами. */
  private click(side: Side, index: number): void {
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
    this.pushQuick();
    this.render();
  }

  private renderGrid(grid: HTMLElement, side: Side, slots: (ItemStack | null)[]): void {
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
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        // Быстрые ячейки расходуются клавишами F и G, а не мышью.
        if (side !== 'bag' || !stack) return;
        this.useHandler?.(stack.id);
        this.pushQuick();
        this.render();
      });
      grid.appendChild(cell);
    });
  }

  /** Три вещи на игроке: клик снимает и кладёт обратно в рюкзак. */
  private renderWorn(): void {
    const inv = this.inventory;
    if (!inv) return;
    this.wornGrid.replaceChildren();
    let warm = 0;
    for (const item of WEARABLE) {
      const on = inv.worn[item.key];
      if (on) warm += 1;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'inv-cell';
      cell.title = on ? `${ITEMS[item.id].name} — клик, чтобы снять` : `${item.label} не надета`;
      if (on) {
        cell.classList.add('filled');
        const icon = document.createElement('span');
        icon.className = 'inv-icon';
        icon.textContent = ITEMS[item.id].icon;
        cell.appendChild(icon);
      }
      cell.addEventListener('click', () => {
        if (!inv.worn[item.key]) return;
        if (addItem(inv, item.id, 1) > 0) return;
        inv.worn[item.key] = false;
        this.render();
      });
      this.wornGrid.appendChild(cell);
    }
    this.wornNote.textContent = warm === WEARABLE.length ? 'Зима не страшна' : `Надето: ${warm}/${WEARABLE.length}`;
  }

  render(): void {
    if (!this.inventory) return;
    this.pullQuick();
    this.renderGrid(this.leftGrid, 'bag', this.inventory.slots);
    this.renderGrid(this.quickGrid, 'quick', this.quick);
    this.renderWorn();
    if (this.chest) this.renderGrid(this.rightGrid, 'chest', this.chest);

    const weight = totalWeight(this.inventory);
    this.weightEl.textContent = `${weight.toFixed(1)} / ${CARRY_LIMIT} кг`;
    this.weightEl.classList.toggle('over', weight > CARRY_LIMIT);
  }
}
