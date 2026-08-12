import * as THREE from 'three';
import { clamp } from '../../shared/rng';

/**
 * Топтание винограда от первого лица. Раньше это был клик и надпись «сусло
 * +1»; теперь игрок стоит в чане, смотрит вниз на собственные ноги и месит
 * грозди — с брызгами, чавканьем и краснеющими по ходу дела штанинами.
 */

const STEPS = 6;
/** Сколько длится один шаг ноги. */
const BEAT = 0.62;

function material(hex: number, roughness = 0.85): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: hex, roughness, flatShading: true });
}

/** Одна нога: голень в закатанной штанине и босая ступня. */
function buildLeg(side: number): { group: THREE.Group; skin: THREE.MeshStandardMaterial } {
  const group = new THREE.Group();
  const skin = material(0xc79a72, 0.9);
  const cloth = material(0x4a5566);

  const trouser = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.26, 7), cloth);
  trouser.position.y = 0.42;
  const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.052, 0.32, 7), skin);
  shin.position.y = 0.17;
  const foot = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.055, 0.24), skin);
  foot.position.set(0, 0.02, 0.05);
  // Пальцы: без них ступня — просто брусок.
  for (let i = 0; i < 4; i++) {
    const toe = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.03, 0.04), skin);
    toe.position.set(-0.036 + i * 0.024, 0.015, 0.185);
    group.add(toe);
  }

  group.add(trouser, shin, foot);
  group.position.set(side * 0.13, 0, 0);
  return { group, skin };
}

export class StompScene {
  private readonly root = new THREE.Group();
  private readonly legs: { group: THREE.Group; skin: THREE.MeshStandardMaterial }[];
  private readonly juice: THREE.Mesh;
  private readonly splash: THREE.Points;
  private readonly splashVel: Float32Array;
  private readonly splashLife: Float32Array;

  /** Камеру ведёт сцена: она приседает и качается в такт. */
  lift = 0;
  pitch = 0;
  roll = 0;

  private elapsed = 0;
  private duration = STEPS * BEAT;
  private beat = -1;
  private text = '';
  private onBeat: (() => void) | null = null;
  private running = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.legs = [buildLeg(-1), buildLeg(1)];
    // Ноги висят под камерой: игрок смотрит на них сверху вниз.
    for (const leg of this.legs) {
      leg.group.position.y = -1.45;
      leg.group.position.z = -0.34;
      this.root.add(leg.group);
    }

    // Мезга под ногами: неровный красный блин, который темнеет по ходу.
    const pulp = new THREE.CircleGeometry(0.62, 14);
    pulp.rotateX(-Math.PI / 2);
    const pos = pulp.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, pos.getY(i) + Math.sin(i * 2.7) * 0.012);
    }
    pulp.computeVertexNormals();
    this.juice = new THREE.Mesh(pulp, material(0x6a2233, 0.35));
    this.juice.position.set(0, -1.47, -0.34);
    this.root.add(this.juice);

    // Брызги: точки, которые подлетают на каждом ударе ноги.
    const count = 90;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    this.splashVel = new Float32Array(count * 3);
    this.splashLife = new Float32Array(count);
    this.splash = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0x8e2b40, size: 0.028, transparent: true, opacity: 0.9 }),
    );
    this.splash.frustumCulled = false;
    this.root.add(this.splash);

    this.root.visible = false;
    this.root.traverse((o) => (o.frustumCulled = false));
    camera.add(this.root);
  }

  get active(): boolean {
    return this.running;
  }

  get hint(): string {
    return this.text;
  }

  /** Начинает сцену. onBeat зовётся на каждом ударе ноги — под звук. */
  start(onBeat: () => void): void {
    this.running = true;
    this.elapsed = 0;
    this.beat = -1;
    this.onBeat = onBeat;
    this.root.visible = true;
    this.juice.scale.setScalar(0.7);
    for (let i = 0; i < this.splashLife.length; i++) this.splashLife[i] = 0;
  }

  cancel(): void {
    this.running = false;
    this.root.visible = false;
    this.lift = 0;
    this.pitch = 0;
    this.roll = 0;
  }

  /** true — оттоптался. */
  update(dt: number): boolean {
    this.updateSplash(dt);
    if (!this.running) return false;

    this.elapsed += dt;
    const done = clamp(this.elapsed / this.duration, 0, 1);
    const beat = Math.floor(this.elapsed / BEAT);
    const inBeat = (this.elapsed % BEAT) / BEAT;

    if (beat !== this.beat) {
      // Каждый такт — новый удар ногой. Считаем по номеру такта, а не по
      // окну времени: при низком кадре узкое окно просто проскакивает.
      this.beat = beat;
      this.text = `Топчешь виноград… ${Math.round(done * 100)}%`;
      if (beat > 0) {
        this.burst();
        this.onBeat?.();
      }
    }

    // Ноги ходят по очереди: одна поднимается, вторая давит.
    for (let i = 0; i < 2; i++) {
      const own = beat % 2 === i;
      const leg = this.legs[i].group;
      // Мах вверх в первой половине такта, удар — во второй.
      const raise = own ? Math.sin(inBeat * Math.PI) : 0;
      leg.position.y = -1.45 + raise * 0.26;
      leg.position.z = -0.34 - raise * 0.06;
      leg.rotation.x = raise * 0.5;
      // Опорная нога чуть проседает под весом.
      if (!own) leg.position.y -= 0.02 * Math.sin(inBeat * Math.PI);
    }

    this.lift = -0.55 - Math.abs(Math.sin(this.elapsed / BEAT * Math.PI)) * 0.05;
    this.pitch = -0.72 + Math.sin((this.elapsed / BEAT) * Math.PI * 2) * 0.03;
    this.roll = Math.sin((this.elapsed / BEAT) * Math.PI) * 0.045;

    // Сок густеет и растекается, штанины краснеют.
    this.juice.scale.setScalar(0.7 + done * 0.35);
    (this.juice.material as THREE.MeshStandardMaterial).color.setRGB(0.42 - done * 0.14, 0.11, 0.19);
    for (const leg of this.legs) leg.skin.color.setRGB(0.78 - done * 0.32, 0.6 - done * 0.36, 0.45 - done * 0.28);

    if (this.elapsed >= this.duration) {
      this.cancel();
      return true;
    }
    return false;
  }

  /** Разлетающиеся капли сока. */
  private burst(): void {
    const pos = this.splash.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < this.splashLife.length; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.28;
      pos.setXYZ(i, Math.cos(a) * r, -1.44, -0.34 + Math.sin(a) * r);
      this.splashVel[i * 3] = Math.cos(a) * (0.5 + Math.random() * 0.7);
      this.splashVel[i * 3 + 1] = 0.9 + Math.random() * 1.1;
      this.splashVel[i * 3 + 2] = Math.sin(a) * (0.5 + Math.random() * 0.7);
      this.splashLife[i] = 0.45 + Math.random() * 0.3;
    }
    pos.needsUpdate = true;
  }

  private updateSplash(dt: number): void {
    const pos = this.splash.geometry.attributes.position as THREE.BufferAttribute;
    let any = false;
    for (let i = 0; i < this.splashLife.length; i++) {
      if (this.splashLife[i] <= 0) continue;
      any = true;
      this.splashLife[i] -= dt;
      this.splashVel[i * 3 + 1] -= 6 * dt;
      pos.setXYZ(
        i,
        pos.getX(i) + this.splashVel[i * 3] * dt,
        pos.getY(i) + this.splashVel[i * 3 + 1] * dt,
        pos.getZ(i) + this.splashVel[i * 3 + 2] * dt,
      );
      if (this.splashLife[i] <= 0) pos.setXYZ(i, 0, -99, 0);
    }
    if (any) pos.needsUpdate = true;
    this.splash.visible = any;
  }
}
