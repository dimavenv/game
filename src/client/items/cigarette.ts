import * as THREE from 'three';
import { CIGARETTE } from '../../shared/balance';
import { clamp } from '../../shared/rng';
import type { Inventory } from '../../shared/state';
import type { GameAudio } from '../audio/audio';
import type { Smoke } from '../render/smoke';

export type CigState = 'none' | 'lighting' | 'lit' | 'inhale' | 'hold' | 'exhale' | 'flick';

interface Pose {
  pos: THREE.Vector3;
  rot: THREE.Euler;
}

const POSE_HIDDEN: Pose = {
  pos: new THREE.Vector3(0.33, -0.66, -0.45),
  rot: new THREE.Euler(-0.2, 0.3, 0.35),
};
const POSE_IDLE: Pose = {
  pos: new THREE.Vector3(0.31, -0.33, -0.46),
  rot: new THREE.Euler(-0.28, 0.3, 0.24),
};
const POSE_LIGHT: Pose = {
  pos: new THREE.Vector3(0.13, -0.2, -0.34),
  rot: new THREE.Euler(-0.7, 0.28, 0.12),
};
const POSE_MOUTH: Pose = {
  pos: new THREE.Vector3(0.07, -0.12, -0.26),
  rot: new THREE.Euler(-0.95, 0.3, 0.08),
};

const FILTER_LEN = 0.022;
const PAPER_LEN = 0.05;

/**
 * Сигарета: конечный автомат плюс модель в руке.
 * Кнопка 1 — закурить, повторное нажатие — затяжка.
 */
export class CigaretteItem {
  state: CigState = 'none';
  smokedToday = 0;
  buzz = 0;
  /** Убрана в другую руку: горит, но не показывается. */
  private hidden = false;

  private readonly group = new THREE.Group();
  private readonly paper: THREE.Mesh;
  private readonly ash: THREE.Mesh;
  private readonly ember: THREE.Mesh;
  private readonly flame: THREE.Mesh;
  private readonly light: THREE.PointLight;

  private timer = 0;
  private burn = 0;
  private wispTimer = 0;
  private exhaleTimer = 0;
  private clock = 0;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();

  constructor(
    camera: THREE.PerspectiveCamera,
    private readonly smoke: Smoke,
    private readonly audio: GameAudio,
    private readonly inventory: Inventory,
  ) {
    const filter = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0046, 0.0046, FILTER_LEN, 8),
      new THREE.MeshStandardMaterial({ color: 0xc8a86a, roughness: 0.9 }),
    );
    filter.position.y = FILTER_LEN / 2;

    this.paper = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0045, 0.0045, PAPER_LEN, 8),
      new THREE.MeshStandardMaterial({ color: 0xf4f1e8, roughness: 0.85 }),
    );

    this.ash = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0047, 0.0044, 0.007, 8),
      new THREE.MeshStandardMaterial({ color: 0x5e5a55, roughness: 1 }),
    );

    this.ember = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0048, 0.0046, 0.004, 8),
      new THREE.MeshBasicMaterial({ color: 0xff5f14 }),
    );

    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.009, 0.028, 6),
      new THREE.MeshBasicMaterial({ color: 0xffb03a, transparent: true, opacity: 0.9 }),
    );
    this.flame.visible = false;

    this.light = new THREE.PointLight(0xff5a12, 0, 2.6, 2);
    this.light.visible = false;

    this.group.add(filter, this.paper, this.ash, this.ember, this.flame, this.light);
    this.group.position.copy(POSE_HIDDEN.pos);
    this.group.rotation.copy(POSE_HIDDEN.rot);
    this.group.visible = false;

    // Модель в руке живёт в системе координат камеры и не отсекается фрустумом.
    this.group.traverse((o) => (o.frustumCulled = false));
    camera.add(this.group);

    this.layout(1);
  }

  get inHand(): boolean {
    return this.state !== 'none';
  }

  get burning(): boolean {
    return this.state === 'lit' || this.state === 'inhale' || this.state === 'hold' || this.state === 'exhale';
  }

  get speedMul(): number {
    return 1 - (1 - CIGARETTE.speedMul) * this.buzz;
  }

  get fovOffset(): number {
    return -CIGARETTE.fovNarrow * this.buzz;
  }

  get warmth(): number {
    return CIGARETTE.warmth * this.buzz;
  }

  get muffle(): number {
    return this.buzz;
  }

  hint(): string {
    if (this.state === 'none') {
      return this.inventory.cigarettes > 0 ? '1 — закурить' : 'пачка пустая';
    }
    if (this.state === 'lit') return '1 — затянуться';
    return '';
  }

  resetDay(): void {
    this.smokedToday = 0;
  }

  press(): void {
    if (this.state === 'none') {
      if (this.inventory.cigarettes <= 0) return;
      this.inventory.cigarettes -= 1;
      this.smokedToday += 1;
      this.burn = CIGARETTE.burnTime;
      this.setState('lighting');
      this.syncVisibility();
      this.audio.lighter();
      this.flame.visible = true;
      this.light.visible = true;
      return;
    }
    if (this.state === 'lit') {
      this.setState('inhale');
      this.audio.inhale(CIGARETTE.inhaleTime);
      this.burn -= CIGARETTE.puffBurn;
    }
  }

  private setState(state: CigState): void {
    this.state = state;
    this.timer = 0;
    this.syncVisibility();
  }

  private syncVisibility(): void {
    this.group.visible = !this.hidden && this.state !== 'none';
  }

  /** Переключились на другой предмет: сигарета догорает вне кадра. */
  setHidden(hidden: boolean): void {
    if (this.hidden === hidden) return;
    this.hidden = hidden;
    this.syncVisibility();
  }

  /** Оставить зажжённую сигарету в мире (дань уважения Пирату). */
  giveAway(): boolean {
    if (!this.burning) return false;
    this.setState('none');
    this.light.visible = false;
    this.light.intensity = 0;
    this.flame.visible = false;
    return true;
  }

  private layout(fraction: number): void {
    const len = PAPER_LEN * fraction;
    this.paper.scale.y = Math.max(fraction, 0.02);
    this.paper.position.y = FILTER_LEN + len / 2;
    const top = FILTER_LEN + len;
    this.ash.position.y = top + 0.0035;
    this.ember.position.y = top + 0.009;
    this.flame.position.set(0.016, top + 0.005, 0.004);
    this.light.position.set(0, top + 0.01, 0);
  }

  private targetPose(): Pose {
    switch (this.state) {
      case 'none':
      case 'flick':
        return POSE_HIDDEN;
      case 'lighting':
        return POSE_LIGHT;
      case 'inhale':
      case 'hold':
        return POSE_MOUTH;
      default:
        return POSE_IDLE;
    }
  }

  private emberWorld(out: THREE.Vector3): THREE.Vector3 {
    return this.ember.getWorldPosition(out);
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    this.clock += dt;
    this.timer += dt;

    switch (this.state) {
      case 'lighting':
        if (this.timer >= CIGARETTE.lightingTime) {
          this.flame.visible = false;
          this.setState('lit');
        }
        break;
      case 'inhale':
        if (this.timer >= CIGARETTE.inhaleTime) this.setState('hold');
        break;
      case 'hold':
        if (this.timer >= CIGARETTE.holdTime) {
          this.setState('exhale');
          this.exhaleTimer = 0;
          this.audio.exhale(CIGARETTE.exhaleTime);
        }
        break;
      case 'exhale':
        this.emitExhale(dt, camera);
        if (this.timer >= CIGARETTE.exhaleTime) this.setState('lit');
        break;
      case 'flick':
        if (this.timer >= CIGARETTE.flickTime) {
          this.setState('none');
          this.light.visible = false;
        }
        break;
      default:
        break;
    }

    if (this.burning) {
      this.burn -= dt;
      if (this.burn <= 0) {
        this.burn = 0;
        this.setState('flick');
        this.audio.flick();
        this.flame.visible = false;
      }
      this.layout(clamp(this.burn / CIGARETTE.burnTime, 0, 1));
      this.emitWisp(dt);
    }

    // Кайф нарастает на задержке дыхания и медленно спадает.
    const rising = this.state === 'hold' || this.state === 'exhale';
    const rate = rising ? CIGARETTE.buzzRise : -CIGARETTE.buzzDecay;
    this.buzz = clamp(this.buzz + rate * dt, 0, 1);

    this.animate(dt);
  }

  private animate(dt: number): void {
    const pose = this.targetPose();
    const k = Math.min(1, 9 * dt);
    this.group.position.lerp(pose.pos, k);
    this.tmpQ.setFromEuler(pose.rot);
    this.group.quaternion.slerp(this.tmpQ, k);

    // Рука живая: лёгкое дыхание модели.
    this.group.position.y += Math.sin(this.clock * 1.7) * 0.0016;
    this.group.position.x += Math.sin(this.clock * 1.1) * 0.0012;

    if (this.state === 'lighting') {
      const f = 0.9 + Math.sin(this.clock * 40) * 0.12;
      this.flame.scale.set(f, 0.8 + Math.sin(this.clock * 33) * 0.25, f);
      this.light.color.setHex(0xffa040);
      this.light.intensity = 2.2 + Math.sin(this.clock * 37) * 0.5;
      return;
    }

    if (this.burning) {
      const glow = this.state === 'inhale' || this.state === 'hold' ? 1 : 0.32;
      this.light.color.setHex(0xff5a12);
      this.light.intensity += (glow * 2.0 + Math.sin(this.clock * 9) * 0.08 - this.light.intensity) * Math.min(1, 6 * dt);
      const mat = this.ember.material as THREE.MeshBasicMaterial;
      mat.color.setRGB(1, 0.28 + glow * 0.22, 0.06 + glow * 0.08);
      this.ember.scale.setScalar(1 + glow * 0.25);
    } else {
      this.light.intensity *= Math.max(0, 1 - 4 * dt);
    }
  }

  private emitWisp(dt: number): void {
    this.wispTimer -= dt;
    if (this.wispTimer > 0) return;
    this.wispTimer = 0.22 + Math.random() * 0.18;
    this.emberWorld(this.tmpA);
    this.tmpB.set((Math.random() - 0.5) * 0.05, 0.13 + Math.random() * 0.06, (Math.random() - 0.5) * 0.05);
    this.smoke.spawn(this.tmpA, this.tmpB, {
      size: 0.05,
      life: 3.4 + Math.random(),
      alpha: 0.13,
      grow: 0.16,
    });
  }

  private emitExhale(dt: number, camera: THREE.PerspectiveCamera): void {
    this.exhaleTimer -= dt;
    if (this.exhaleTimer > 0) return;
    this.exhaleTimer = 0.035;

    camera.getWorldDirection(this.tmpB);
    camera.getWorldPosition(this.tmpA);
    // Облако рождается перед лицом и уходит по взгляду.
    this.tmpA.addScaledVector(this.tmpB, 0.34);
    this.tmpA.y -= 0.1;
    this.tmpA.x += (Math.random() - 0.5) * 0.07;
    this.tmpA.y += (Math.random() - 0.5) * 0.05;
    this.tmpA.z += (Math.random() - 0.5) * 0.07;

    const speed = 1.1 * (1 - this.timer / CIGARETTE.exhaleTime) + 0.35;
    const vel = this.tmpB.clone().multiplyScalar(speed);
    vel.x += (Math.random() - 0.5) * 0.28;
    vel.y += (Math.random() - 0.5) * 0.18 + 0.1;
    vel.z += (Math.random() - 0.5) * 0.28;

    this.smoke.spawn(this.tmpA, vel, {
      size: 0.16 + Math.random() * 0.1,
      life: 5 + Math.random() * 2.5,
      alpha: 0.34,
      grow: 0.55,
    });
  }
}
