import * as THREE from 'three';
import { DRUGS, type DrugId } from '../../shared/drugs';
import { clamp } from '../../shared/rng';
import type { GameAudio } from '../audio/audio';
import type { Smoke } from '../render/smoke';

/**
 * Употребление от первого лица. Раньше это был клик в рюкзаке и надпись;
 * теперь — сценарий на несколько секунд: в руках появляется реквизит, камера
 * наклоняется, дёргается и уплывает, а игрок в это время еле передвигает ноги
 * и не может ничем воспользоваться. Смысл ровно тот же, что и у остального
 * в игре вокруг Ави: показать возню и расплату, а не «кайф».
 */

interface Step {
  /** Доля от общего времени, к которой шаг заканчивается. */
  until: number;
  text: string;
  enter?: () => void;
  /** t — 0..1 внутри шага. */
  frame?: (t: number) => void;
}

function box(w: number, h: number, d: number, hex: number, opts: THREE.MeshStandardMaterialParameters = {}): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color: hex, roughness: 0.8, ...opts }),
  );
}

function cylinder(rt: number, rb: number, h: number, hex: number, opts: THREE.MeshStandardMaterialParameters = {}): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.CylinderGeometry(rt, rb, h, 10),
    new THREE.MeshStandardMaterial({ color: hex, roughness: 0.7, ...opts }),
  );
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Плавный вход-выход, чтобы реквизит не дёргался по прямой. */
const ease = (t: number): number => t * t * (3 - 2 * t);

export class DrugKit {
  private readonly root = new THREE.Group();
  private readonly groups: Record<DrugId, THREE.Group>;

  /** Куда сдвинуть и как повернуть камеру: заполняется шагами сценария. */
  readonly lift = { value: 0 };
  pitch = 0;
  roll = 0;
  shake = 0;
  fov = 0;

  private drug: DrugId | null = null;
  private steps: Step[] = [];
  private elapsed = 0;
  private duration = 1;
  private stepIndex = -1;
  private text = '';
  private puffTimer = 0;

  // Кокаин.
  private readonly mirror = new THREE.Group();
  private readonly powder: THREE.Mesh;
  private readonly line: THREE.Mesh;
  private readonly card: THREE.Mesh;
  private readonly straw: THREE.Mesh;
  private readonly bag: THREE.Mesh;

  // Гашиш.
  private readonly paper: THREE.Mesh;
  private readonly crumbs: THREE.Group;
  private readonly joint: THREE.Group;
  private readonly jointEmber: THREE.Mesh;

  // Героин.
  private readonly spoon: THREE.Group;
  private readonly brew: THREE.Mesh;
  private readonly syringe: THREE.Group;
  private readonly plunger: THREE.Mesh;
  private readonly fluid: THREE.Mesh;
  private readonly forearm: THREE.Group;
  private readonly strap: THREE.Mesh;

  // Общее.
  private readonly lighter: THREE.Group;
  private readonly flame: THREE.Mesh;
  private readonly flameLight: THREE.PointLight;
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly audio: GameAudio,
    private readonly smoke: Smoke,
  ) {
    // --- Кокаин: зеркальце, порошок, карточка, трубочка ---
    // Без карты окружения зеркальный металл выходит чёрным пятном, поэтому
    // стекло делаем светлым и почти не металлическим.
    const glass = box(0.17, 0.005, 0.12, 0xaab4bc, { roughness: 0.28, metalness: 0.2 });
    const frame = box(0.185, 0.004, 0.135, 0x6b5a3a, { roughness: 0.6 });
    frame.position.y = -0.004;
    this.powder = box(0.03, 0.012, 0.028, 0xf2f0ec, { roughness: 1 });
    this.powder.position.set(-0.04, 0.008, 0);
    this.line = box(0.11, 0.006, 0.012, 0xf2f0ec, { roughness: 1 });
    this.line.position.set(0.005, 0.006, 0.015);
    this.line.visible = false;
    this.mirror.add(glass, frame, this.powder, this.line);

    this.card = box(0.06, 0.002, 0.088, 0x9fc0d8, { roughness: 0.4 });
    this.straw = cylinder(0.005, 0.005, 0.075, 0xd8d2c0, { roughness: 0.6 });
    this.bag = box(0.05, 0.06, 0.012, 0xe8e8e4, { roughness: 0.5, transparent: true, opacity: 0.75 });

    const cocaine = new THREE.Group();
    cocaine.add(this.mirror, this.card, this.straw, this.bag);
    // --- Гашиш: бумажка, крошки, косяк ---
    this.paper = box(0.075, 0.001, 0.055, 0xf6f4ee, { roughness: 0.95 });
    this.crumbs = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const crumb = box(0.006, 0.005, 0.006, 0x51402a, { roughness: 1 });
      crumb.position.set((Math.random() - 0.5) * 0.05, 0.004, (Math.random() - 0.5) * 0.03);
      this.crumbs.add(crumb);
    }

    this.joint = new THREE.Group();
    const roll = cylinder(0.005, 0.0042, 0.072, 0xf4f1e6, { roughness: 0.9 });
    this.jointEmber = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0052, 0.0046, 0.005, 8),
      new THREE.MeshBasicMaterial({ color: 0xff5f14 }),
    );
    this.jointEmber.position.y = 0.038;
    this.jointEmber.visible = false;
    this.joint.add(roll, this.jointEmber);

    const hash = new THREE.Group();
    hash.add(this.paper, this.crumbs, this.joint);

    // --- Героин: ложка, шприц, предплечье с жгутом ---
    this.spoon = new THREE.Group();
    const bowl = cylinder(0.026, 0.022, 0.008, 0xb8bcc0, { roughness: 0.3, metalness: 0.8 });
    const handle = box(0.075, 0.004, 0.012, 0xb8bcc0, { roughness: 0.3, metalness: 0.8 });
    handle.position.x = 0.05;
    this.brew = cylinder(0.021, 0.019, 0.004, 0xc9b07a, { roughness: 0.25 });
    this.brew.position.y = 0.004;
    this.spoon.add(bowl, handle, this.brew);

    this.syringe = new THREE.Group();
    const barrel = cylinder(0.009, 0.009, 0.085, 0xdfe4e8, {
      roughness: 0.15,
      transparent: true,
      opacity: 0.45,
    });
    barrel.rotation.z = Math.PI / 2;
    this.fluid = cylinder(0.0075, 0.0075, 0.08, 0x8a5a2a, { roughness: 0.2 });
    this.fluid.rotation.z = Math.PI / 2;
    this.fluid.scale.y = 0.001;
    const needle = cylinder(0.0012, 0.0012, 0.032, 0xc8ccd0, { roughness: 0.2, metalness: 0.9 });
    needle.rotation.z = Math.PI / 2;
    needle.position.x = -0.058;
    this.plunger = box(0.03, 0.016, 0.016, 0x3c4046, { roughness: 0.8 });
    this.plunger.position.x = 0.055;
    this.syringe.add(barrel, this.fluid, needle, this.plunger);

    this.forearm = new THREE.Group();
    const arm = cylinder(0.038, 0.046, 0.24, 0xba8455, { roughness: 0.95 });
    arm.rotation.z = Math.PI / 2;
    const fist = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.042, 0),
      new THREE.MeshStandardMaterial({ color: 0xba8455, roughness: 0.95, flatShading: true }),
    );
    // Кулак у дальнего конца: локоть уходит вниз за кадр, кисть — вверх.
    fist.position.x = 0.14;
    this.strap = new THREE.Mesh(
      new THREE.TorusGeometry(0.055, 0.008, 6, 12),
      new THREE.MeshStandardMaterial({ color: 0x6b2b2b, roughness: 0.9 }),
    );
    this.strap.rotation.y = Math.PI / 2;
    this.strap.scale.setScalar(0.8);
    this.strap.position.x = -0.04;
    this.strap.visible = false;
    this.forearm.add(arm, fist, this.strap);

    const heroin = new THREE.Group();
    heroin.add(this.spoon, this.syringe, this.forearm);

    // --- Зажигалка: общая для гашиша и героина ---
    this.lighter = new THREE.Group();
    const body = box(0.026, 0.055, 0.016, 0xb03a2a, { roughness: 0.5 });
    const cap = box(0.024, 0.014, 0.015, 0xbfc4c8, { roughness: 0.3, metalness: 0.8 });
    cap.position.y = 0.033;
    this.flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.011, 0.038, 6),
      new THREE.MeshBasicMaterial({ color: 0xffb03a, transparent: true, opacity: 0.9 }),
    );
    this.flame.position.y = 0.06;
    this.flame.visible = false;
    this.flameLight = new THREE.PointLight(0xff8a2a, 0, 1.6, 2);
    this.flameLight.position.y = 0.07;
    this.flameLight.visible = false;
    this.lighter.add(body, cap, this.flame, this.flameLight);

    this.groups = { cocaine, hash, heroin };
    this.root.add(cocaine, hash, heroin, this.lighter);
    for (const g of Object.values(this.groups)) g.visible = false;
    this.lighter.visible = false;
    this.root.visible = false;
    // Реквизит держим повыше: у нижнего края кадра его перекрывает HUD.
    this.root.position.y = 0.1;
    this.root.traverse((o) => (o.frustumCulled = false));
    camera.add(this.root);
  }

  get active(): boolean {
    return this.drug !== null;
  }

  get hint(): string {
    return this.text;
  }

  /** Реквизит виден только когда нужен: между шагами всё прячется. */
  private hideAll(): void {
    this.mirror.visible = false;
    this.card.visible = false;
    this.straw.visible = false;
    this.bag.visible = false;
    this.paper.visible = false;
    this.crumbs.visible = false;
    this.joint.visible = false;
    this.spoon.visible = false;
    this.syringe.visible = false;
    this.forearm.visible = false;
    this.lighter.visible = false;
    this.flame.visible = false;
    this.flameLight.visible = false;
    this.flameLight.intensity = 0;
  }

  private reset(): void {
    this.hideAll();
    this.root.visible = false;
    this.drug = null;
    this.steps = [];
    this.stepIndex = -1;
    this.elapsed = 0;
    this.text = '';
    this.pitch = 0;
    this.roll = 0;
    this.shake = 0;
    this.fov = 0;
    this.lift.value = 0;
    this.line.visible = false;
    this.powder.visible = true;
    this.powder.scale.set(1, 1, 1);
    this.jointEmber.visible = false;
    this.fluid.scale.y = 0.001;
    this.strap.visible = false;
    for (const g of Object.values(this.groups)) g.visible = false;
  }

  cancel(): void {
    this.reset();
  }

  start(drug: DrugId): void {
    this.reset();
    this.drug = drug;
    this.duration = DRUGS[drug].useTime;
    this.root.visible = true;
    this.groups[drug].visible = true;
    this.steps = drug === 'cocaine' ? this.cocaineSteps() : drug === 'hash' ? this.hashSteps() : this.heroinSteps();
  }

  /** true — сценарий доигран до конца. */
  update(dt: number): boolean {
    if (!this.drug) return false;
    this.elapsed += dt;
    const p = clamp(this.elapsed / this.duration, 0, 1);

    let index = 0;
    let from = 0;
    while (index < this.steps.length - 1 && p > this.steps[index].until) {
      from = this.steps[index].until;
      index++;
    }
    const step = this.steps[index];
    if (index !== this.stepIndex) {
      this.stepIndex = index;
      this.text = step.text;
      this.hideAll();
      step.enter?.();
    }
    const span = Math.max(step.until - from, 0.0001);
    step.frame?.(clamp((p - from) / span, 0, 1));

    // Тряска затухает сама, если шаг её не подпитывает.
    this.shake = Math.max(0, this.shake - dt * 1.6);

    // Сценарий не гасит себя сам: последний кадр держится, пока игра не
    // скажет, что употребление закончилось. Так картинка не разъезжается
    // с таймером эффекта, который считается отдельно.
    return this.elapsed >= this.duration;
  }

  /** Клуб дыма перед лицом — для гашиша. */
  private puff(dt: number, strength: number): void {
    this.puffTimer -= dt;
    if (this.puffTimer > 0) return;
    this.puffTimer = 0.04;
    this.camera.getWorldDirection(this.tmpB);
    this.camera.getWorldPosition(this.tmpA);
    this.tmpA.addScaledVector(this.tmpB, 0.32);
    this.tmpA.y -= 0.08;
    const vel = this.tmpB.clone().multiplyScalar(0.9 * strength + 0.3);
    vel.x += (Math.random() - 0.5) * 0.3;
    vel.y += 0.12;
    vel.z += (Math.random() - 0.5) * 0.3;
    this.smoke.spawn(this.tmpA, vel, {
      size: 0.15 + Math.random() * 0.1,
      life: 5 + Math.random() * 2,
      alpha: 0.3,
      grow: 0.5,
    });
  }

  private lightFlame(t: number, jitter = true): void {
    this.lighter.visible = true;
    this.flame.visible = true;
    this.flameLight.visible = true;
    const flicker = jitter ? 1 + Math.sin(this.elapsed * 34) * 0.18 : 1;
    this.flame.scale.set(flicker, 0.8 + flicker * 0.35, flicker);
    this.flameLight.intensity = 1.6 * flicker * (0.4 + t * 0.6);
  }

  // --- Сценарии -------------------------------------------------------------

  private cocaineSteps(): Step[] {
    const mirrorHome = new THREE.Vector3(0.02, -0.26, -0.4);
    return [
      {
        until: 0.18,
        text: 'Достаёшь зеркальце',
        frame: (t) => {
          this.mirror.visible = true;
          this.bag.visible = true;
          const e = ease(t);
          this.mirror.position.set(mirrorHome.x, lerp(-0.55, mirrorHome.y, e), mirrorHome.z);
          this.mirror.rotation.set(lerp(-0.9, -0.12, e), 0.2, 0);
          this.bag.position.set(0.16, lerp(-0.5, -0.2, e), -0.36);
          this.bag.rotation.set(0.2, 0, lerp(0.4, 0.1, e));
          this.powder.scale.set(0.01, 0.01, 0.01);
        },
      },
      {
        until: 0.36,
        text: 'Сыпешь',
        enter: () => this.audio.pickup(),
        frame: (t) => {
          this.mirror.visible = true;
          this.bag.visible = true;
          this.mirror.position.copy(mirrorHome);
          this.mirror.rotation.set(-0.12, 0.2, 0);
          // Пакетик наклоняется над зеркалом, кучка растёт.
          this.bag.position.set(lerp(0.16, 0.02, ease(t)), -0.19, -0.38);
          this.bag.rotation.set(0.2, 0, lerp(0.1, 1.5, ease(t)));
          const s = 0.2 + ease(t) * 0.8;
          this.powder.scale.set(s, s, s);
        },
      },
      {
        until: 0.56,
        text: 'Раскладываешь дорожку',
        frame: (t) => {
          this.mirror.visible = true;
          this.card.visible = true;
          this.mirror.position.copy(mirrorHome);
          this.mirror.rotation.set(-0.12, 0.2, 0);
          const e = ease(t);
          // Карточка ведёт от кучки вправо, за ней вытягивается дорожка.
          this.card.position.set(lerp(-0.05, 0.07, e), -0.235, lerp(-0.42, -0.38, e));
          this.card.rotation.set(0.35, 0.2, 0.5);
          this.powder.scale.setScalar(Math.max(0.05, 1 - e));
          this.line.visible = e > 0.15;
          this.line.scale.set(clamp(e * 1.3, 0.05, 1), 1, 1);
          this.line.position.x = lerp(-0.03, 0.005, clamp(e * 1.3, 0, 1));
        },
      },
      {
        until: 0.74,
        text: 'Наклоняешься',
        frame: (t) => {
          this.mirror.visible = true;
          this.straw.visible = true;
          this.line.visible = true;
          const e = ease(t);
          // Зеркало поднимается к лицу, камера уходит вниз.
          this.mirror.position.set(mirrorHome.x, lerp(mirrorHome.y, -0.2, e), lerp(mirrorHome.z, -0.29, e));
          this.mirror.rotation.set(lerp(-0.12, -0.35, e), 0.2, 0);
          this.straw.position.set(lerp(0.16, 0.045, e), lerp(-0.1, -0.14, e), -0.29);
          this.straw.rotation.set(lerp(-0.4, -0.95, e), 0.2, lerp(0.9, 0.5, e));
          this.pitch = -0.34 * e;
          this.lift.value = -0.1 * e;
        },
      },
      {
        until: 0.88,
        text: 'Вдох',
        enter: () => {
          if (!this.audio.playSlot('drug_cocaine')) this.audio.burstSniff();
        },
        frame: (t) => {
          this.mirror.visible = true;
          this.straw.visible = true;
          this.line.visible = t < 0.95;
          this.mirror.position.set(0.02, -0.2, -0.29);
          this.mirror.rotation.set(-0.35, 0.2, 0);
          // Трубочка идёт вдоль дорожки, дорожка исчезает за ней.
          const e = ease(t);
          this.straw.position.set(lerp(0.01, 0.085, e), -0.14, -0.29);
          this.straw.rotation.set(-0.95, 0.2, 0.5);
          this.line.scale.set(Math.max(0.02, 1 - e), 1, 1);
          this.line.position.x = lerp(0.005, 0.06, e);
          this.pitch = -0.34;
          this.lift.value = -0.1;
          this.shake = 0.004 + e * 0.006;
        },
      },
      {
        until: 1,
        text: 'Голову назад',
        enter: () => {
          this.audio.burstSniff();
          this.audio.breath(true);
        },
        frame: (t) => {
          const e = ease(t);
          this.mirror.visible = t < 0.5;
          this.mirror.position.set(0.02, lerp(-0.2, -0.6, e), -0.29);
          // Резко назад и вверх — самый заметный кадр всей сцены.
          this.pitch = lerp(-0.34, 0.22, e);
          this.lift.value = lerp(-0.1, 0.02, e);
          this.roll = Math.sin(e * Math.PI) * 0.06;
          this.shake = 0.01 * (1 - e);
          this.fov = Math.sin(e * Math.PI) * 6;
        },
      },
    ];
  }

  private hashSteps(): Step[] {
    const paperHome = new THREE.Vector3(0.05, -0.28, -0.36);
    return [
      {
        until: 0.14,
        text: 'Достаёшь бумагу',
        frame: (t) => {
          this.paper.visible = true;
          const e = ease(t);
          this.paper.position.set(paperHome.x, lerp(-0.55, paperHome.y, e), paperHome.z);
          this.paper.rotation.set(lerp(-0.8, -0.25, e), 0.25, 0);
        },
      },
      {
        until: 0.34,
        text: 'Крошишь',
        frame: (t) => {
          this.paper.visible = true;
          this.crumbs.visible = true;
          this.paper.position.copy(paperHome);
          this.paper.rotation.set(-0.25, 0.25, 0);
          this.crumbs.position.copy(paperHome);
          this.crumbs.rotation.set(-0.25, 0.25, 0);
          // Крошки падают на бумагу одна за другой.
          this.crumbs.children.forEach((crumb, i) => {
            const at = i / this.crumbs.children.length;
            crumb.visible = t > at;
            crumb.position.y = 0.004 + Math.max(0, at + 0.08 - t) * 0.9;
          });
          this.roll = Math.sin(this.elapsed * 9) * 0.004;
        },
      },
      {
        until: 0.5,
        text: 'Скручиваешь',
        frame: (t) => {
          const e = ease(t);
          this.paper.visible = e < 0.75;
          this.crumbs.visible = e < 0.5;
          this.paper.position.copy(paperHome);
          this.paper.rotation.set(-0.25, 0.25, e * 2.4);
          this.paper.scale.set(1, 1, Math.max(0.12, 1 - e));
          this.crumbs.position.copy(paperHome);
          this.crumbs.scale.setScalar(Math.max(0.2, 1 - e));
          this.joint.visible = e >= 0.75;
          this.joint.position.set(0.09, -0.24, -0.32);
          this.joint.rotation.set(-0.4, 0.25, 0.35);
        },
      },
      {
        until: 0.6,
        text: 'Прикуриваешь',
        enter: () => this.audio.lighter(),
        frame: (t) => {
          this.joint.visible = true;
          const e = ease(t);
          this.joint.position.set(lerp(0.09, 0.075, e), lerp(-0.24, -0.16, e), lerp(-0.32, -0.26, e));
          this.joint.rotation.set(lerp(-0.4, -0.9, e), 0.25, lerp(0.35, 0.12, e));
          this.lighter.position.set(lerp(0.24, 0.115, e), lerp(-0.3, -0.19, e), -0.28);
          this.lighter.rotation.set(0.3, 0, -0.5);
          this.lightFlame(t);
          this.jointEmber.visible = t > 0.5;
        },
      },
      {
        until: 0.84,
        text: 'Тянешь',
        enter: () => this.audio.inhale(1.1),
        frame: (t) => {
          this.joint.visible = true;
          this.jointEmber.visible = true;
          // Две затяжки: косяк ходит к губам и обратно.
          const cycle = (t * 2) % 1;
          const to = Math.sin(cycle * Math.PI);
          this.joint.position.set(lerp(0.075, 0.055, to), lerp(-0.18, -0.13, to), lerp(-0.28, -0.23, to));
          this.joint.rotation.set(lerp(-0.7, -1.05, to), 0.25, 0.12);
          const glow = 0.6 + to * 0.9;
          (this.jointEmber.material as THREE.MeshBasicMaterial).color.setRGB(glow, glow * 0.32, 0.06);
          this.fov = to * 3;
          if (t > 0.48 && t < 0.52) this.audio.inhale(1.0);
        },
      },
      {
        until: 1,
        text: 'Выдыхаешь',
        enter: () => {
          this.audio.exhale(1.4);
          if (!this.audio.playSlot('drug_hash')) {
            window.setTimeout(() => this.audio.breath(true), 700);
          }
        },
        frame: (t) => {
          this.joint.visible = t < 0.6;
          this.joint.position.set(0.09, lerp(-0.14, -0.34, ease(t)), -0.3);
          this.joint.rotation.set(-0.5, 0.25, 0.3);
          this.jointEmber.visible = t < 0.6;
          // Дым идёт первые полторы секунды, потом кашель трясёт кадр.
          if (t < 0.5) this.puff(1 / 60, 1 - t);
          this.pitch = Math.sin(t * Math.PI) * 0.12;
          this.shake = t > 0.5 ? 0.012 * (1 - t) : 0.002;
          this.fov = Math.sin(t * Math.PI) * 5;
        },
      },
    ];
  }

  private heroinSteps(): Step[] {
    const spoonHome = new THREE.Vector3(0.02, -0.27, -0.36);
    return [
      {
        until: 0.13,
        text: 'Готовишь ложку',
        frame: (t) => {
          this.spoon.visible = true;
          const e = ease(t);
          this.spoon.position.set(spoonHome.x, lerp(-0.55, spoonHome.y, e), spoonHome.z);
          this.spoon.rotation.set(lerp(-0.7, -0.1, e), 0.3, 0);
          (this.brew.material as THREE.MeshStandardMaterial).color.setHex(0xc9b07a);
          this.brew.scale.setScalar(0.3 + e * 0.7);
        },
      },
      {
        until: 0.32,
        text: 'Греешь',
        enter: () => this.audio.lighter(),
        frame: (t) => {
          this.spoon.visible = true;
          this.spoon.position.copy(spoonHome);
          this.spoon.rotation.set(-0.1, 0.3, 0);
          this.lighter.position.set(0.02, -0.36, -0.36);
          this.lighter.rotation.set(0.1, 0, 0);
          this.lightFlame(t);
          // Раствор темнеет и начинает шевелиться.
          const c = this.brew.material as THREE.MeshStandardMaterial;
          c.color.setRGB(lerp(0.79, 0.44, t), lerp(0.69, 0.28, t), lerp(0.48, 0.14, t));
          this.brew.position.y = 0.004 + Math.sin(this.elapsed * 12) * 0.0008;
          this.pitch = -0.12 * ease(t);
        },
      },
      {
        until: 0.5,
        text: 'Набираешь',
        enter: () => this.audio.bandage(),
        frame: (t) => {
          this.spoon.visible = true;
          this.syringe.visible = true;
          this.spoon.position.copy(spoonHome);
          this.spoon.rotation.set(-0.1, 0.3, 0);
          const e = ease(t);
          this.syringe.position.set(lerp(0.2, 0.075, e), lerp(-0.3, -0.255, e), -0.34);
          this.syringe.rotation.set(0, 0, lerp(0.5, 0.18, e));
          // Поршень идёт назад, ствол наполняется.
          this.plunger.position.x = lerp(0.03, 0.062, e);
          this.fluid.scale.y = Math.max(0.001, e);
          this.brew.scale.setScalar(Math.max(0.05, 1 - e));
          this.pitch = -0.12;
        },
      },
      {
        until: 0.62,
        text: 'Затягиваешь жгут',
        frame: (t) => {
          this.syringe.visible = true;
          this.forearm.visible = true;
          const e = ease(t);
          // Рука ложится поперёк кадра, жгут стягивается.
          this.forearm.position.set(lerp(-0.34, -0.15, e), lerp(-0.46, -0.36, e), -0.44);
          this.forearm.rotation.set(0, 0.25, lerp(0.1, 0.5, e));
          this.strap.visible = true;
          this.strap.scale.setScalar(lerp(1.25, 0.92, e));
          this.syringe.position.set(0.16, -0.24, -0.34);
          this.syringe.rotation.set(0, 0, 0.35);
          this.pitch = lerp(-0.12, -0.2, e);
        },
      },
      {
        until: 0.72,
        text: 'Ищешь вену',
        frame: (t) => {
          this.forearm.visible = true;
          this.syringe.visible = true;
          this.strap.visible = true;
          this.strap.scale.setScalar(0.92);
          this.forearm.position.set(-0.15, -0.36, -0.44);
          this.forearm.rotation.set(0, 0.25, 0.5);
          const e = ease(t);
          this.syringe.position.set(lerp(0.2, 0.04, e), lerp(-0.17, -0.26, e), lerp(-0.34, -0.4, e));
          this.syringe.rotation.set(0, 0.2, lerp(0.3, -0.62, e));
          this.pitch = -0.2;
          // Руки не слушаются — прицелиться тяжело.
          this.shake = 0.004;
        },
      },
      {
        until: 0.85,
        text: 'Колешь',
        enter: () => {
          if (!this.audio.playSlot('drug_heroin')) this.audio.breath(true);
        },
        frame: (t) => {
          this.forearm.visible = true;
          this.syringe.visible = true;
          this.strap.visible = t < 0.7;
          this.strap.scale.setScalar(lerp(0.92, 1.3, clamp(t * 1.4, 0, 1)));
          this.forearm.position.set(-0.15, -0.36, -0.44);
          this.forearm.rotation.set(0, 0.25, 0.5);
          const e = ease(t);
          this.syringe.position.set(lerp(0.04, 0.025, e), lerp(-0.26, -0.285, e), -0.41);
          this.syringe.rotation.set(0, 0.2, -0.62);
          // Поршень идёт вперёд, ствол пустеет.
          this.plunger.position.x = lerp(0.062, 0.03, e);
          this.fluid.scale.y = Math.max(0.001, 1 - e);
          this.pitch = lerp(-0.2, -0.14, e);
          this.shake = 0.003 * (1 - e);
        },
      },
      {
        until: 1,
        text: 'Отпускает',
        enter: () => this.audio.breath(false),
        frame: (t) => {
          const e = ease(t);
          this.forearm.visible = t < 0.55;
          this.syringe.visible = t < 0.35;
          this.forearm.position.set(-0.15, lerp(-0.36, -0.7, e), -0.44);
          this.forearm.rotation.set(0, 0.25, 0.5);
          this.syringe.position.set(0.025, lerp(-0.285, -0.62, e), -0.41);
          // Голова медленно уезжает назад и вбок.
          this.pitch = lerp(-0.14, 0.16, e);
          this.roll = e * 0.09;
          this.lift.value = -0.05 * Math.sin(e * Math.PI);
          this.fov = Math.sin(e * Math.PI) * 4;
        },
      },
    ];
  }
}
