import { ITEMS, type ItemId } from '../../shared/items';
import { SEASON_NAME, SEASON_ORDER, type Season } from '../../shared/season';

const PASSWORD = '28101982';
const KEY = 'krugloe-ozero-cheats';

/** Что чит-меню умеет делать с игрой. Всё остальное оно не трогает. */
export interface CheatApi {
  give(id: ItemId, count: number): void;
  giveMoney(amount: number): void;
  tools(): Record<ToolKey, boolean>;
  setTool(key: ToolKey, on: boolean): void;
  day(): number;
  setDay(day: number): void;
  setTime(seconds: number): void;
  season(): Season;
  jumpToSeason(season: Season): void;
  teleports(): { id: string; label: string }[];
  teleport(id: string): void;
  refill(): void;
  flags(): Record<FlagKey, boolean>;
  setFlag(key: FlagKey, on: boolean): void;
  clearZombies(): void;
  reviveAnimals(): void;
}

export type ToolKey = 'hasRod' | 'hasFlashlight' | 'hasGoodAxe' | 'hasShotgun' | 'hasHammer' | 'hasKnife';
export type FlagKey = 'god' | 'noNeeds' | 'infiniteBreath';

const TOOL_NAME: Record<ToolKey, string> = {
  hasRod: 'удочка',
  hasFlashlight: 'фонарик',
  hasGoodAxe: 'хороший топор',
  hasShotgun: 'дробовик',
  hasHammer: 'молот',
  hasKnife: 'нож',
};

const FLAG_NAME: Record<FlagKey, string> = {
  god: 'бессмертие',
  noNeeds: 'не хочется есть и пить',
  infiniteBreath: 'бесконечное дыхание',
};

/** Время суток по фазам — в секундах от начала игровых суток. */
const HOURS: [string, number][] = [
  ['рассвет', 20],
  ['утро', 120],
  ['полдень', 300],
  ['закат', 570],
  ['ночь', 700],
];

/**
 * Чит-меню. Открывается паролем из главного меню, дальше висит на клавише
 * и позволяет не проходить выживание заново каждый раз, когда надо что-то
 * проверить. Ничего из этого в обычной игре недоступно.
 */
export class CheatMenu {
  private readonly root: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private api: CheatApi | null = null;
  private closeHandler: (() => void) | null = null;

  static get unlocked(): boolean {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  }

  /** Проверяет пароль и запоминает разблокировку. */
  static unlock(input: string): boolean {
    if (input.trim() !== PASSWORD) return false;
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      // Приватный режим: читы будут работать до перезагрузки.
    }
    return true;
  }

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'cheats';
    this.root.className = 'hidden';
    this.root.innerHTML = `
      <div class="cheat-panel">
        <div class="cheat-head">
          <b>Чит-меню</b>
          <span>тестовый режим · Esc или Backquote — закрыть</span>
        </div>
        <div class="cheat-body"></div>
      </div>`;
    document.body.appendChild(this.root);
    this.body = this.root.querySelector('.cheat-body')!;
  }

  get isOpen(): boolean {
    return !this.root.classList.contains('hidden');
  }

  open(api: CheatApi, onClose: () => void): void {
    this.api = api;
    this.closeHandler = onClose;
    this.render();
    this.root.classList.remove('hidden');
  }

  close(): void {
    if (!this.isOpen) return;
    this.root.classList.add('hidden');
    this.api = null;
    const onClose = this.closeHandler;
    this.closeHandler = null;
    onClose?.();
  }

  toggle(api: CheatApi, onClose: () => void): void {
    if (this.isOpen) this.close();
    else this.open(api, onClose);
  }

  private section(title: string): HTMLDivElement {
    const box = document.createElement('div');
    box.className = 'cheat-section';
    const head = document.createElement('h3');
    head.textContent = title;
    box.appendChild(head);
    this.body.appendChild(box);
    return box;
  }

  private button(parent: HTMLElement, label: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.addEventListener('click', () => {
      onClick();
      this.render();
    });
    parent.appendChild(b);
    return b;
  }

  private toggleButton(parent: HTMLElement, label: string, on: boolean, onClick: () => void): void {
    const b = this.button(parent, label, onClick);
    b.classList.add('cheat-toggle');
    b.classList.toggle('on', on);
  }

  private render(): void {
    const api = this.api;
    if (!api) return;
    this.body.replaceChildren();

    // Предметы.
    const items = this.section('Предметы');
    const row = document.createElement('div');
    row.className = 'cheat-row';
    const select = document.createElement('select');
    for (const id of Object.keys(ITEMS) as ItemId[]) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = `${ITEMS[id].icon} ${ITEMS[id].name}`;
      select.appendChild(option);
    }
    const count = document.createElement('input');
    count.type = 'number';
    count.min = '1';
    count.max = '99';
    count.value = '5';
    row.append(select, count);
    items.appendChild(row);
    const itemButtons = document.createElement('div');
    itemButtons.className = 'cheat-row';
    this.button(itemButtons, 'Выдать', () => api.give(select.value as ItemId, Number(count.value) || 1));
    this.button(itemButtons, 'Всего по 5', () => {
      for (const id of Object.keys(ITEMS) as ItemId[]) api.give(id, 5);
    });
    items.appendChild(itemButtons);

    // Деньги и снаряжение.
    const money = this.section('Деньги и снаряжение');
    const moneyRow = document.createElement('div');
    moneyRow.className = 'cheat-row';
    for (const sum of [100, 1000, 10000]) {
      this.button(moneyRow, `+${sum} ₪`, () => api.giveMoney(sum));
    }
    money.appendChild(moneyRow);
    const tools = api.tools();
    const toolsRow = document.createElement('div');
    toolsRow.className = 'cheat-row';
    for (const key of Object.keys(TOOL_NAME) as ToolKey[]) {
      this.toggleButton(toolsRow, TOOL_NAME[key], tools[key], () => api.setTool(key, !tools[key]));
    }
    money.appendChild(toolsRow);

    // Время и сезон.
    const time = this.section(`Время · сейчас ${SEASON_NAME[api.season()]}, день ${api.day()}`);
    const hoursRow = document.createElement('div');
    hoursRow.className = 'cheat-row';
    for (const [label, seconds] of HOURS) this.button(hoursRow, label, () => api.setTime(seconds));
    time.appendChild(hoursRow);
    const daysRow = document.createElement('div');
    daysRow.className = 'cheat-row';
    for (const step of [1, 5, 10]) {
      this.button(daysRow, `+${step} сут.`, () => api.setDay(api.day() + step));
    }
    time.appendChild(daysRow);
    const seasonRow = document.createElement('div');
    seasonRow.className = 'cheat-row';
    for (const season of SEASON_ORDER) {
      this.toggleButton(seasonRow, SEASON_NAME[season], api.season() === season, () => api.jumpToSeason(season));
    }
    time.appendChild(seasonRow);

    // Телепорт.
    const jump = this.section('Телепорт');
    const jumpRow = document.createElement('div');
    jumpRow.className = 'cheat-row';
    for (const spot of api.teleports()) {
      this.button(jumpRow, spot.label, () => {
        api.teleport(spot.id);
        this.close();
      });
    }
    jump.appendChild(jumpRow);

    // Состояние.
    const state = this.section('Состояние');
    const stateRow = document.createElement('div');
    stateRow.className = 'cheat-row';
    this.button(stateRow, 'Полное здоровье и сытость', () => api.refill());
    this.button(stateRow, 'Разогнать зомби', () => api.clearZombies());
    this.button(stateRow, 'Оживить зверей', () => api.reviveAnimals());
    state.appendChild(stateRow);
    const flags = api.flags();
    const flagsRow = document.createElement('div');
    flagsRow.className = 'cheat-row';
    for (const key of Object.keys(FLAG_NAME) as FlagKey[]) {
      this.toggleButton(flagsRow, FLAG_NAME[key], flags[key], () => api.setFlag(key, !flags[key]));
    }
    state.appendChild(flagsRow);
  }
}
