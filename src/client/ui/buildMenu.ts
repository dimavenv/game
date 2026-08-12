import { countItem, type Inventory } from '../../shared/inventory';
import { BLUEPRINTS, type BlueprintId } from '../../shared/world/building';

const ORDER: BlueprintId[] = [
  'palisade',
  'gate',
  'chest',
  'vine',
  'press',
  'cellar',
  'dryer',
  'filter',
  'smokehouse',
  'pier',
];

/** Полоска заготовок внизу экрана: что строим и хватает ли материалов. */
export class BuildMenu {
  private readonly root: HTMLDivElement;
  private selected: BlueprintId = 'palisade';
  private onPick: ((kind: BlueprintId) => void) | null = null;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'build';
    this.root.className = 'hidden';
    document.body.appendChild(this.root);
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  get kind(): BlueprintId {
    return this.selected;
  }

  open(inv: Inventory, onPick: (kind: BlueprintId) => void): void {
    this.onPick = onPick;
    this.root.classList.remove('hidden');
    this.render(inv);
  }

  close(): void {
    this.root.classList.add('hidden');
    this.onPick = null;
  }

  /** Колесо мыши и клавиши листают список по кругу. */
  cycle(step: number, inv: Inventory): void {
    const index = ORDER.indexOf(this.selected);
    this.selected = ORDER[(index + step + ORDER.length) % ORDER.length];
    this.onPick?.(this.selected);
    this.render(inv);
  }

  affordable(inv: Inventory, kind: BlueprintId = this.selected): boolean {
    const blueprint = BLUEPRINTS[kind];
    return (
      countItem(inv, 'log') >= blueprint.logs &&
      countItem(inv, 'stone') >= blueprint.stones &&
      countItem(inv, 'vine_sapling') >= (blueprint.saplings ?? 0)
    );
  }

  render(inv: Inventory): void {
    if (!this.isOpen) return;
    this.root.replaceChildren();
    for (const kind of ORDER) {
      const blueprint = BLUEPRINTS[kind];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'build-item';
      if (kind === this.selected) button.classList.add('active');
      if (!this.affordable(inv, kind)) button.classList.add('poor');

      const title = document.createElement('div');
      title.textContent = blueprint.name;
      const cost = document.createElement('span');
      const parts: string[] = [];
      if (blueprint.logs > 0) parts.push(`брёвна ${blueprint.logs}`);
      if (blueprint.stones > 0) parts.push(`камни ${blueprint.stones}`);
      if (blueprint.saplings) parts.push(`саженцы ${blueprint.saplings}`);
      cost.textContent = parts.join(' · ');

      button.append(title, cost);
      button.addEventListener('click', () => {
        this.selected = kind;
        this.onPick?.(kind);
        this.render(inv);
      });
      this.root.appendChild(button);
    }
  }
}
