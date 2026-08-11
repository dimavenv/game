import * as THREE from 'three';
import { FISHING } from '../../shared/balance';
import type { GameAudio } from '../audio/audio';

export type RodState = 'idle' | 'casting' | 'waiting' | 'bite' | 'reeling';

/** Что случилось за кадр: игра решает, какую рыбу выдать. */
export type RodEvent = 'cast' | 'bite' | 'hooked' | 'missed' | 'reeled' | null;

/**
 * Удочка: заброс по ЛКМ, ожидание поклёвки, окно подсечки.
 * Окно намеренно щедрое (2.5 с) — рыбалка должна расслаблять, а не бесить.
 */
export class RodItem {
  state: RodState = 'idle';

  private readonly group = new THREE.Group();
  private readonly tip = new THREE.Object3D();
  private readonly float: THREE.Mesh;
  private readonly line: THREE.Line;
  private readonly linePositions: Float32Array;
  private readonly floatHome = new THREE.Vector3();

  private timer = 0;
  private waitTime = 0;
  private clock = 0;
  private nextWaitFactor = 1;
  private readonly tmp = new THREE.Vector3();

  constructor(
    camera: THREE.PerspectiveCamera,
    scene: THREE.Scene,
    private readonly audio: GameAudio,
    private readonly rng: () => number,
  ) {
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.006, 0.014, 1.15, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.8, flatShading: true }),
    );
    rod.position.y = 0.575;
    const grip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.019, 0.16, 7),
      new THREE.MeshStandardMaterial({ color: 0x2f2a26, roughness: 1 }),
    );
    grip.position.y = 0.09;

    this.tip.position.y = 1.15;
    this.group.add(rod, grip, this.tip);
    this.group.position.set(0.42, -0.52, -0.58);
    this.group.rotation.set(-0.12, -0.35, 0.5);
    this.group.scale.setScalar(0.92);
    this.group.visible = false;
    this.group.traverse((o) => (o.frustumCulled = false));
    camera.add(this.group);

    // Поплавок крупнее реального: иначе за двадцать метров его не разглядеть.
    this.float = new THREE.Mesh(
      new THREE.CylinderGeometry(0.075, 0.075, 0.34, 8),
      new THREE.MeshStandardMaterial({ color: 0xe03a22, roughness: 0.6, flatShading: true }),
    );
    const floatTop = new THREE.Mesh(
      new THREE.CylinderGeometry(0.076, 0.076, 0.14, 8),
      new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.6, flatShading: true }),
    );
    floatTop.position.y = 0.14;
    this.float.add(floatTop);
    this.float.visible = false;
    scene.add(this.float);

    this.linePositions = new Float32Array(6);
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePositions, 3));
    this.line = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: 0xdedede, transparent: true, opacity: 0.5 }));
    this.line.frustumCulled = false;
    this.line.visible = false;
    scene.add(this.line);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    if (!visible) this.reset();
  }

  get inHand(): boolean {
    return this.group.visible;
  }

  private reset(): void {
    this.state = 'idle';
    this.float.visible = false;
    this.line.visible = false;
    this.timer = 0;
  }

  /** ЛКМ: заброс, подсечка или сматывание — смотря что сейчас происходит. */
  action(target: THREE.Vector3 | null): RodEvent {
    if (!this.group.visible) return null;
    switch (this.state) {
      case 'idle': {
        if (!target) return null;
        this.floatHome.copy(target);
        this.state = 'casting';
        this.timer = 0;
        return 'cast';
      }
      case 'waiting':
        this.state = 'reeling';
        this.timer = 0;
        return 'reeled';
      case 'bite':
        this.state = 'reeling';
        this.timer = 0;
        this.nextWaitFactor = 1;
        return 'hooked';
      default:
        return null;
    }
  }

  private startWait(): void {
    this.state = 'waiting';
    this.timer = 0;
    this.waitTime =
      (FISHING.minWait + this.rng() * (FISHING.maxWait - FISHING.minWait)) * this.nextWaitFactor;
    this.nextWaitFactor = 1;
  }

  update(dt: number): RodEvent {
    this.clock += dt;
    let event: RodEvent = null;

    if (this.group.visible) {
      this.group.position.y = -0.52 + Math.sin(this.clock * 1.5) * 0.005;
    }

    switch (this.state) {
      case 'casting':
        this.timer += dt;
        this.group.rotation.x = -0.12 - Math.sin(Math.min(this.timer / 0.5, 1) * Math.PI) * 0.6;
        if (this.timer >= 0.5) {
          this.float.position.copy(this.floatHome);
          this.float.visible = true;
          this.line.visible = true;
          this.audio.splash(0.5);
          this.startWait();
        }
        break;

      case 'waiting':
        this.timer += dt;
        this.float.position.y = this.floatHome.y + Math.sin(this.clock * 1.7) * 0.03;
        if (this.timer >= this.waitTime) {
          this.state = 'bite';
          this.timer = 0;
          this.audio.splash(0.35);
          event = 'bite';
        }
        break;

      case 'bite': {
        this.timer += dt;
        // Поплавок ныряет несколько раз — заметно и без звука.
        const dip = Math.abs(Math.sin(this.timer * 7)) * 0.22;
        this.float.position.y = this.floatHome.y - dip;
        if (this.timer >= FISHING.biteWindow) {
          // Сорвалась, но следующая поклёвка придёт заметно быстрее.
          this.nextWaitFactor = FISHING.retryFactor;
          this.startWait();
          event = 'missed';
        }
        break;
      }

      case 'reeling':
        this.timer += dt;
        this.group.rotation.x = -0.12 + Math.sin(Math.min(this.timer / 0.45, 1) * Math.PI) * 0.45;
        if (this.timer >= 0.45) {
          this.reset();
        }
        break;

      default:
        break;
    }

    if (this.line.visible) {
      this.tip.getWorldPosition(this.tmp);
      this.linePositions[0] = this.tmp.x;
      this.linePositions[1] = this.tmp.y;
      this.linePositions[2] = this.tmp.z;
      this.linePositions[3] = this.float.position.x;
      this.linePositions[4] = this.float.position.y + 0.1;
      this.linePositions[5] = this.float.position.z;
      (this.line.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    }

    return event;
  }

  hint(): string {
    switch (this.state) {
      case 'idle':
        return 'ЛКМ — забросить (нужна вода)';
      case 'waiting':
        return 'ждём поклёвку · ЛКМ — смотать';
      case 'bite':
        return 'клюёт! ЛКМ';
      default:
        return '';
    }
  }
}
