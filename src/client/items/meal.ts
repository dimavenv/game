import * as THREE from 'three';
import { clamp } from '../../shared/rng';
import type { ItemId } from '../../shared/items';

/**
 * Еда и питьё от первого лица. Кусок мяса, яблоко, бутылка воды или вина
 * появляются в руке, подносятся ко рту, дальше идут укусы или глотки — и
 * рука уходит вниз. Сцена короткая, но без неё «поел» — это просто цифра.
 */

type Kind = 'bite' | 'sip';

function material(hex: number, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7, flatShading: true, ...opts });
}

/** Что именно держим в руке. */
function buildProp(id: ItemId): { object: THREE.Object3D; kind: Kind } {
  const group = new THREE.Group();

  if (id === 'apple') {
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 1), material(0xc0392b, { roughness: 0.45 }));
    body.scale.set(1, 0.92, 1);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.035, 5), material(0x4a3a24));
    stem.position.y = 0.06;
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.006, 0.016), material(0x4e7a34));
    leaf.position.set(0.018, 0.062, 0);
    leaf.rotation.z = 0.4;
    group.add(body, stem, leaf);
    return { object: group, kind: 'bite' };
  }

  if (id === 'grape') {
    // Гроздь: конус из ягод.
    for (let i = 0; i < 11; i++) {
      const t = i / 10;
      const berry = new THREE.Mesh(new THREE.IcosahedronGeometry(0.016, 0), material(0x53305c, { roughness: 0.35 }));
      const a = i * 2.2;
      berry.position.set(Math.cos(a) * 0.022 * (1 - t), -t * 0.075, Math.sin(a) * 0.022 * (1 - t));
      group.add(berry);
    }
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.04, 5), material(0x5a6b32));
    stem.position.y = 0.03;
    group.add(stem);
    return { object: group, kind: 'bite' };
  }

  if (id === 'meat' || id === 'meat_cooked') {
    const cooked = id === 'meat_cooked';
    const flesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.045, 0.07),
      material(cooked ? 0x7a4a2c : 0xa03c46, { roughness: cooked ? 0.75 : 0.5 }),
    );
    const bone = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.11, 6), material(0xe0d8c4));
    bone.rotation.z = Math.PI / 2;
    bone.position.x = -0.02;
    group.add(flesh, bone);
    if (cooked) {
      // Подпалины на жареном.
      for (let i = 0; i < 3; i++) {
        const char = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.004, 0.05), material(0x2e2018));
        char.position.set(-0.02 + i * 0.025, 0.024, 0);
        group.add(char);
      }
    }
    return { object: group, kind: 'bite' };
  }

  if (id.startsWith('fish_')) {
    const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 1), material(0x8a9aa4, { roughness: 0.4 }));
    body.scale.set(0.55, 0.8, 1.7);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.05, 0.04), material(0x76858f));
    tail.position.z = -0.1;
    group.add(body, tail);
    return { object: group, kind: 'bite' };
  }

  // Всё остальное пьётся из бутылки; отличается только цвет содержимого.
  const liquid =
    id === 'beer' ? 0xd8a53a : id === 'water_clean' ? 0x8ec6d8 : id === 'water_dirty' ? 0x6b6448 : 0x6a1f2c;
  const glassHex = id === 'beer' ? 0x8a6a2c : 0x3d4a3a;
  const glass = new THREE.Mesh(
    new THREE.CylinderGeometry(0.038, 0.04, 0.2, 9),
    material(glassHex, { roughness: 0.15, transparent: true, opacity: 0.72 }),
  );
  glass.position.y = 0.1;
  const inside = new THREE.Mesh(new THREE.CylinderGeometry(0.031, 0.033, 0.16, 9), material(liquid, { roughness: 0.2 }));
  inside.position.y = 0.085;
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.016, 0.026, 0.07, 8),
    material(glassHex, { roughness: 0.15, transparent: true, opacity: 0.72 }),
  );
  neck.position.y = 0.23;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.06, 9, 1, true), material(0xd8cdae));
  label.position.y = 0.1;
  group.add(glass, inside, neck, label);
  return { object: group, kind: 'sip' };
}

/** Сколько длится сцена: у бутылки дольше, чем у куска мяса. */
const DURATION: Record<Kind, number> = { bite: 1.9, sip: 2.2 };
/** Сколько укусов или глотков. */
const BEATS: Record<Kind, number> = { bite: 3, sip: 2 };

export class Meal {
  private readonly root = new THREE.Group();
  private readonly camera: THREE.PerspectiveCamera;
  private prop: THREE.Object3D | null = null;
  private kind: Kind = 'bite';
  private elapsed = 0;
  private duration = 1;
  private beat = -1;
  private label = '';
  private running = false;
  private onBeat: ((index: number) => void) | null = null;
  private onDone: (() => void) | null = null;

  /** Камеру слегка ведёт: голова наклоняется к еде и запрокидывается на глотке. */
  pitch = 0;
  roll = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.root.visible = false;
    this.root.traverse((o) => (o.frustumCulled = false));
    camera.add(this.root);
  }

  get active(): boolean {
    return this.running;
  }

  get hint(): string {
    return this.label;
  }

  /**
   * Начинает сцену. onBeat зовётся на каждом укусе или глотке — под звук,
   * onDone — когда рука опустилась.
   */
  start(id: ItemId, name: string, onBeat: (index: number) => void, onDone: () => void): void {
    this.stop();
    const built = buildProp(id);
    this.prop = built.object;
    this.kind = built.kind;
    this.duration = DURATION[built.kind];
    this.root.add(this.prop);
    this.root.visible = true;
    this.root.traverse((o) => (o.frustumCulled = false));
    this.elapsed = 0;
    this.beat = -1;
    this.running = true;
    this.onBeat = onBeat;
    this.onDone = onDone;
    this.label = built.kind === 'sip' ? `Пьёшь: ${name}` : `Ешь: ${name}`;
    void this.camera;
  }

  /** Убирает реквизит без завершения (смерть, прерывание). */
  stop(): void {
    if (this.prop) this.root.remove(this.prop);
    this.prop = null;
    this.running = false;
    this.root.visible = false;
    this.pitch = 0;
    this.roll = 0;
  }

  update(dt: number): void {
    if (!this.running || !this.prop) return;
    this.elapsed += dt;
    const p = clamp(this.elapsed / this.duration, 0, 1);
    const beats = BEATS[this.kind];

    // Общая траектория: снизу к лицу, потом обратно вниз.
    const lift = p < 0.18 ? p / 0.18 : p > 0.82 ? (1 - p) / 0.18 : 1;
    const raise = lift * lift * (3 - 2 * lift);

    // Внутри «поднято» — сами укусы или глотки.
    const active = clamp((p - 0.18) / 0.64, 0, 1);
    const beatIndex = Math.min(Math.floor(active * beats), beats - 1);
    const inBeat = (active * beats) % 1;

    if (this.elapsed > 0.2 && beatIndex !== this.beat && active > 0 && active < 1) {
      this.beat = beatIndex;
      this.onBeat?.(beatIndex);
    }

    if (this.kind === 'bite') {
      // Кусок подносят ко рту и отводят, между укусами жуём.
      const close = Math.sin(inBeat * Math.PI);
      this.prop.position.set(0.16 - raise * 0.08, -0.34 + raise * 0.26 + close * 0.03, -0.42 + raise * 0.1);
      this.prop.rotation.set(-0.3 + close * 0.4, 0.4 - raise * 0.3, 0.25);
      this.prop.scale.setScalar(1 - beatIndex * 0.22);
      this.pitch = raise * 0.05;
      this.roll = 0;
    } else {
      // Бутылку задирают: чем ближе к концу глотка, тем выше дно.
      const tilt = Math.sin(inBeat * Math.PI);
      this.prop.position.set(0.13 - raise * 0.09, -0.4 + raise * 0.3, -0.4 + raise * 0.12);
      this.prop.rotation.set(-tilt * 1.15, 0.25, 0.18 + tilt * 0.2);
      this.pitch = raise * (0.06 + tilt * 0.12);
      this.roll = tilt * 0.02;
    }

    if (p >= 1) {
      const done = this.onDone;
      this.stop();
      done?.();
    }
  }
}
