import * as THREE from 'three';
import { SWING, WORLD } from '../shared/balance';
import { clamp } from '../shared/rng';
import type { GameAudio } from './audio/audio';
import type { Smoke } from './render/smoke';
import type { SwingBuild } from './render/mountain';

/**
 * Тарзанка: качели, полёт с сальто и приводнение. Всё время номера камера
 * ведётся отсюда, а игрок стоит на месте — управление ему возвращают уже на
 * берегу. Физика простая и назначенная руками: маятник по углу, полёт по
 * параболе, погружение с торможением.
 */

export type SwingPhase = 'off' | 'grab' | 'swing' | 'fly' | 'splash' | 'surface' | 'swim';

/**
 * Откуда начинается размах и где отпускают перекладину. В покое трос висит
 * почти отвесно — иначе до перекладины не дотянуться, — а разгон даёт разбег.
 */
const START_ANGLE = -0.25;
const RELEASE_ANGLE = 1.08;
/** Скорость отрыва: подобрана так, чтобы улетать на глубину, а не на песок. */
const LAUNCH_SPEED = 6.6;
const LAUNCH_LIFT = 2.6;
const GRAVITY = 9.8;

export class RopeSwing {
  phase: SwingPhase = 'off';
  /** Куда смотреть и откуда: этим game.ts подменяет обычную камеру. */
  readonly position = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  roll = 0;
  fov = 0;
  /** Насколько глухо звучит мир и насколько зелена картинка под водой. */
  underwater = 0;

  private timer = 0;
  private angle = START_ANGLE;
  private readonly velocity = new THREE.Vector3();
  private readonly bar = new THREE.Vector3();
  private readonly exit = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private bubbleTimer = 0;
  private windLevel = 0;

  constructor(
    private readonly rig: SwingBuild,
    private readonly audio: GameAudio,
    private readonly smoke: Smoke,
  ) {}

  get active(): boolean {
    return this.phase !== 'off';
  }

  get hint(): string {
    switch (this.phase) {
      case 'grab':
        return 'Держись';
      case 'swing':
        return 'Разгон';
      case 'fly':
        return 'Полетел!';
      case 'splash':
      case 'surface':
        return 'Бульк';
      case 'swim':
        return 'Выплываешь';
      default:
        return '';
    }
  }

  /** Точка, за которую хватаются: перекладина в исходном положении. */
  grabPoint(out: THREE.Vector3): THREE.Vector3 {
    return this.rig.barAt(START_ANGLE, out);
  }

  start(): void {
    if (this.phase !== 'off') return;
    this.phase = 'grab';
    this.timer = 0;
    this.angle = START_ANGLE;
    this.windLevel = 0;
    this.underwater = 0;
    this.roll = 0;
    this.fov = 0;
    // Смотрим туда же, куда полетим.
    this.yaw = Math.atan2(-this.rig.direction.x, -this.rig.direction.z);
    this.pitch = -0.15;
    this.rig.setAngle(START_ANGLE);
    this.rig.barAt(START_ANGLE, this.bar);
    this.position.copy(this.bar).setY(this.bar.y - 0.55);
    this.audio.pickup();
  }

  /** Вернулся ли игрок в игру: тогда его ставят на берег. */
  update(dt: number, out: THREE.Vector3): boolean {
    if (this.phase === 'off') return false;
    this.timer += dt;

    switch (this.phase) {
      case 'grab':
        this.stepGrab();
        break;
      case 'swing':
        this.stepSwing();
        break;
      case 'fly':
        this.stepFly(dt);
        break;
      case 'splash':
        this.stepSplash(dt);
        break;
      case 'surface':
        this.stepSurface();
        break;
      case 'swim':
        if (this.stepSwim()) {
          this.phase = 'off';
          this.underwater = 0;
          this.fov = 0;
          this.roll = 0;
          out.copy(this.exit);
          return true;
        }
        break;
      default:
        break;
    }

    this.audio.setWind(this.windLevel);
    return false;
  }

  /** Схватился: подтягивается и отклоняется назад. */
  private stepGrab(): void {
    const t = clamp(this.timer / SWING.grabTime, 0, 1);
    this.rig.setAngle(START_ANGLE);
    this.rig.barAt(START_ANGLE, this.bar);
    this.position.copy(this.bar);
    this.position.y -= 0.55 + (1 - t) * 0.35;
    this.pitch = -0.15 + t * 0.1;
    if (t >= 1) {
      this.phase = 'swing';
      this.timer = 0;
    }
  }

  /** Размах: маятник от берега к воде, на низшей точке — самый разгон. */
  private stepSwing(): void {
    const t = clamp(this.timer / SWING.swingTime, 0, 1);
    // Половина периода маятника: угол идёт по косинусу, скорость — по синусу.
    const swing = (1 - Math.cos(t * Math.PI)) / 2;
    this.angle = START_ANGLE + (RELEASE_ANGLE - START_ANGLE) * swing;
    this.rig.setAngle(this.angle);
    this.rig.barAt(this.angle, this.bar);

    const speed = Math.sin(t * Math.PI);
    this.position.copy(this.bar);
    this.position.y -= 0.55;
    // На разгоне ноги задирает вперёд, взгляд уходит к воде и обратно.
    this.pitch = -0.05 - Math.sin(t * Math.PI) * 0.45 + this.angle * 0.25;
    this.roll = Math.sin(t * Math.PI * 2) * 0.06;
    this.fov = speed * 7;
    this.windLevel = speed * 0.7;

    if (t >= 1) {
      this.phase = 'fly';
      this.timer = 0;
      // Отрыв: вперёд по направлению размаха и вверх.
      this.velocity.set(
        this.rig.direction.x * LAUNCH_SPEED,
        LAUNCH_LIFT,
        this.rig.direction.z * LAUNCH_SPEED,
      );
      this.audio.whoosh();
    }
  }

  /** Полёт: парабола плюс сальто. */
  private stepFly(dt: number): void {
    this.velocity.y -= GRAVITY * dt;
    this.position.addScaledVector(this.velocity, dt);

    const t = clamp(this.timer / SWING.flyTime, 0, 1);
    // Оборот через голову: к самой воде выравниваемся, чтобы войти лицом вниз.
    const flip = clamp(t / 0.72, 0, 1);
    const spin = -Math.PI * 2 * (flip * flip * (3 - 2 * flip));
    this.pitch = spin + (1 - flip) * 0.2 - flip * 0.55;
    this.roll = Math.sin(t * Math.PI) * 0.35;
    this.fov = 7 + t * 6;
    this.windLevel = 0.75 + t * 0.25;

    if (this.position.y <= WORLD.waterLevel + 0.15) {
      this.phase = 'splash';
      this.timer = 0;
      this.windLevel = 0;
      this.audio.bigSplash();
      this.splashBurst();
      // В воде движение гасится почти сразу.
      this.velocity.multiplyScalar(0.35);
    }
  }

  /** Под водой: тянет вниз, звук глохнет, вокруг пузыри. */
  private stepSplash(dt: number): void {
    this.velocity.y = Math.max(this.velocity.y - 2 * dt, -2.2) * 0.86;
    this.velocity.x *= 0.9;
    this.velocity.z *= 0.9;
    this.position.addScaledVector(this.velocity, dt);
    this.position.y = Math.max(this.position.y, WORLD.waterLevel - 1.7);

    this.underwater = clamp((WORLD.waterLevel - this.position.y) * 1.6, 0, 1);
    this.pitch = -0.55 + clamp(this.timer / SWING.splashTime, 0, 1) * 0.8;
    this.roll *= 0.9;
    this.fov = 12 - this.timer * 4;
    this.bubbles(dt);

    if (this.timer >= SWING.splashTime) {
      this.phase = 'surface';
      this.timer = 0;
    }
  }

  /** Выныривание: голова над водой, вдох. */
  private stepSurface(): void {
    const t = clamp(this.timer / 0.9, 0, 1);
    this.position.y = THREE.MathUtils.lerp(this.position.y, WORLD.waterLevel + 0.32, t * 0.35);
    this.underwater = (1 - t) * 0.8;
    this.pitch = 0.25 - t * 0.2;
    this.fov = 6 * (1 - t);
    if (t >= 1) {
      this.phase = 'swim';
      this.timer = 0;
      this.audio.breath(true);
      // Берег — по направлению от центра озера через точку падения.
      const scale = (WORLD.lakeHalf + 1.4) / Math.max(Math.abs(this.position.x), Math.abs(this.position.z));
      this.exit.set(this.position.x * scale, 0, this.position.z * scale);
      this.tmp.copy(this.exit).sub(this.position).setY(0).normalize();
      this.yaw = Math.atan2(-this.tmp.x, -this.tmp.z);
    }
  }

  /** Гребёт к берегу: камера покачивается на воде. */
  private stepSwim(): boolean {
    const t = clamp(this.timer / SWING.swimTime, 0, 1);
    this.position.lerp(this.exit, Math.min(1, t * t * 0.14));
    this.position.y = WORLD.waterLevel + 0.34 + Math.sin(this.timer * 6) * 0.05;
    this.pitch = 0.05 + Math.sin(this.timer * 6 + 1) * 0.03;
    this.underwater = Math.max(0, 0.25 - t * 0.25);
    if (this.timer % 0.6 < 0.02) this.audio.splash(0.4);
    return t >= 1;
  }

  private splashBurst(): void {
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 0.9;
      this.tmp.set(this.position.x + Math.cos(a) * r, WORLD.waterLevel + 0.1, this.position.z + Math.sin(a) * r);
      this.smoke.spawn(
        this.tmp,
        new THREE.Vector3(Math.cos(a) * (1.2 + Math.random()), 3.2 + Math.random() * 2.6, Math.sin(a) * (1.2 + Math.random())),
        { size: 0.22 + Math.random() * 0.3, life: 1.1 + Math.random() * 0.7, alpha: 0.5, grow: 0.4 },
      );
    }
  }

  private bubbles(dt: number): void {
    this.bubbleTimer -= dt;
    if (this.bubbleTimer > 0) return;
    this.bubbleTimer = 0.05;
    this.tmp.set(
      this.position.x + (Math.random() - 0.5) * 0.5,
      this.position.y + (Math.random() - 0.5) * 0.3,
      this.position.z + (Math.random() - 0.5) * 0.5,
    );
    this.smoke.spawn(this.tmp, new THREE.Vector3(0, 1.4 + Math.random(), 0), {
      size: 0.06 + Math.random() * 0.07,
      life: 0.9,
      alpha: 0.45,
      grow: 0.1,
    });
  }
}
