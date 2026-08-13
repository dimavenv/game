import type * as THREE from 'three';

/** Ник над головой НПС — появляется, когда на него смотришь. */
export class Nameplate {
  private readonly el: HTMLDivElement;
  private current = '';

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'nameplate hidden';
    document.body.appendChild(this.el);
  }

  hide(): void {
    if (this.current === '') return;
    this.current = '';
    this.el.classList.add('hidden');
  }

  show(name: string, point: THREE.Vector3, camera: THREE.Camera): void {
    const projected = point.clone().project(camera);
    if (projected.z > 1) {
      this.hide();
      return;
    }
    if (this.current !== name) {
      this.current = name;
      this.el.textContent = name;
      this.el.classList.remove('hidden');
    }
    const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
    this.el.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
  }
}

/** Короткие сообщения в углу: что подобрал, сколько заплатили. */
export class Toasts {
  private readonly root: HTMLDivElement;

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'toasts';
    document.body.appendChild(this.root);
  }

  push(text: string, tone: 'normal' | 'money' | 'bad' = 'normal'): void {
    const el = document.createElement('div');
    el.className = `toast toast-${tone}`;
    el.textContent = text;
    this.root.appendChild(el);
    // Плавно убираем: сначала гасим, потом выкидываем из DOM.
    window.setTimeout(() => el.classList.add('fade'), 2600);
    window.setTimeout(() => el.remove(), 3400);
  }
}

/**
 * Ники живых игроков: висят над головами всегда, а не только когда смотришь.
 * В лесу товарища иначе не найти — деревья одинаковые, ориентиров мало.
 */
export class PlayerTags {
  private readonly root: HTMLDivElement;
  private readonly tags = new Map<number, HTMLDivElement>();

  constructor() {
    this.root = document.createElement('div');
    this.root.id = 'tags';
    this.root.className = 'overlay';
    document.body.appendChild(this.root);
  }

  /** Обновляет подписи. Кто пропал из списка — у того подпись убирается. */
  sync(
    people: { id: number; name: string; point: THREE.Vector3; health: number }[],
    camera: THREE.Camera,
    from: THREE.Vector3,
  ): void {
    const alive = new Set<number>();
    for (const person of people) {
      alive.add(person.id);
      let tag = this.tags.get(person.id);
      if (!tag) {
        tag = document.createElement('div');
        tag.className = 'player-tag';
        this.root.appendChild(tag);
        this.tags.set(person.id, tag);
      }
      const distance = from.distanceTo(person.point);
      const projected = person.point.clone().project(camera);
      // За спиной и совсем далеко подпись не нужна.
      if (projected.z > 1 || distance > 220) {
        tag.style.display = 'none';
        continue;
      }
      tag.style.display = '';
      // Далёкому подписываем расстояние: так его и ищут.
      const label = distance > 18 ? `${person.name} · ${Math.round(distance)} м` : person.name;
      if (tag.textContent !== label) tag.textContent = label;
      tag.classList.toggle('hurt', person.health < 40);
      tag.style.opacity = distance > 140 ? '0.35' : '1';
      const x = (projected.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-projected.y * 0.5 + 0.5) * window.innerHeight;
      tag.style.transform = `translate(-50%, -100%) translate(${x}px, ${y}px)`;
    }
    for (const [id, tag] of this.tags) {
      if (alive.has(id)) continue;
      tag.remove();
      this.tags.delete(id);
    }
  }
}

/**
 * Строка чата по Enter. Пока она открыта, управление не слушает клавиши —
 * иначе набор «привет» превратился бы в беготню с прыжками.
 */
export class ChatInput {
  private readonly field: HTMLInputElement;
  private send: ((text: string) => void) | null = null;

  constructor() {
    this.field = document.createElement('input');
    this.field.id = 'chat';
    this.field.className = 'hidden';
    this.field.maxLength = 200;
    this.field.placeholder = 'Сказать в лес…';
    document.body.appendChild(this.field);

    this.field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Escape') {
        this.close();
        return;
      }
      if (e.code !== 'Enter' && e.code !== 'NumpadEnter') return;
      const text = this.field.value.trim();
      this.field.value = '';
      this.close();
      if (text) this.send?.(text);
    });
  }

  get isOpen(): boolean {
    return !this.field.classList.contains('hidden');
  }

  open(send: (text: string) => void): void {
    this.send = send;
    this.field.classList.remove('hidden');
    this.field.focus();
  }

  close(): void {
    this.field.classList.add('hidden');
    this.field.blur();
  }
}
