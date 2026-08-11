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
