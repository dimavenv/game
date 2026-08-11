import * as THREE from 'three';
import { CIGARETTE, PLAYER, TIME_CYCLE, WORLD, WORLD_SEED } from '../shared/balance';
import { clamp, smoothstep } from '../shared/rng';
import { createPlayerState, stepPlayer, type PlayerState } from '../shared/movement';
import { advanceClock, createClock, isDark } from '../shared/time';
import { Terrain } from '../shared/world/terrain';
import { generateWorld, type WorldData } from '../shared/world/worldgen';
import { GameAudio } from './audio/audio';
import { Input } from './input';
import { CigaretteItem } from './items/cigarette';
import { Forest } from './render/forest';
import { Sky } from './render/sky';
import { Smoke } from './render/smoke';
import { buildSign } from './render/sign';
import { buildTerrainMesh } from './render/terrainMesh';
import { Water } from './render/water';
import { Hud } from './ui/hud';

const FIXED_DT = 1 / 60;
const MOUSE_SENSITIVITY = 0.0022;
const BASE_FOV = 75;
/** Через сколько метров ставится следующий шаг. */
const STEP_LENGTH = 1.75;

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly input: Input;
  private readonly audio = new GameAudio();
  private readonly hud = new Hud();
  private readonly sky: Sky;
  private readonly water: Water;
  private readonly forest: Forest;
  private readonly smoke: Smoke;
  private readonly cigarette: CigaretteItem;
  private readonly world: WorldData;
  private readonly player: PlayerState;
  private readonly clock = createClock();

  private accumulator = 0;
  private last = 0;
  private running = false;
  private elapsed = 0;
  private nextStepAt = STEP_LENGTH;
  private breathSoundTimer = 0;
  private bob = 0;
  private readonly wind = new THREE.Vector3();

  onPause: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, 900);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.world = generateWorld(WORLD_SEED);
    this.player = createPlayerState(this.world);

    this.sky = new Sky(this.scene);
    this.scene.add(buildTerrainMesh(this.world.terrain, this.world.seed));

    this.forest = new Forest(this.world);
    this.scene.add(this.forest.group);

    this.water = new Water();
    this.scene.add(this.water.mesh);

    this.scene.add(buildSign(this.world.terrain));

    this.smoke = new Smoke();
    this.scene.add(this.smoke.points);

    this.cigarette = new CigaretteItem(this.camera, this.smoke, this.audio, CIGARETTE.startPack);

    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => {
      this.running = locked;
      if (!locked) {
        this.hud.setVisible(false);
        this.onPause?.();
      } else {
        this.hud.setVisible(true);
        this.last = performance.now();
      }
    };

    if (import.meta.env.DEV) {
      // Доступ к сцене из консоли — только в режиме разработки.
      (window as unknown as { game: Game }).game = this;
    }

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.syncCamera(0);
    this.sky.update(this.clock.t, this.camera);
    this.renderer.render(this.scene, this.camera);
    requestAnimationFrame((t) => this.frame(t));
  }

  /**
   * pointerLock=false нужен только для отладки и снятия скриншотов
   * (?nolock): мир живёт, мышь не захватывается.
   */
  async start(pointerLock = true): Promise<void> {
    await this.audio.start();
    if (pointerLock) {
      this.input.requestLock();
      return;
    }
    this.running = true;
    this.last = performance.now();
    this.hud.setVisible(true);
  }

  /** Отладка: перескочить в нужную секунду суток (см. ?t= в main.ts). */
  setTime(seconds: number): void {
    this.clock.t = ((seconds % TIME_CYCLE) + TIME_CYCLE) % TIME_CYCLE;
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private breathMax(): number {
    const penalty = Math.min(
      this.cigarette.smokedToday * PLAYER.breathPenaltyPerCig,
      PLAYER.breathPenaltyCap,
    );
    return PLAYER.breathMax * (1 - penalty);
  }

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = this.last === 0 ? 0 : clamp((now - this.last) / 1000, 0, 0.1);
    this.last = now;
    if (!this.running) return;

    this.elapsed += dt;
    this.look();
    this.simulate(dt);
    this.cigarette.update(dt, this.camera);
    this.syncCamera(dt);
    this.updateWorld(dt);
    this.updateHud();
    this.renderer.render(this.scene, this.camera);
    this.input.endFrame();
  }

  private look(): void {
    const [dx, dy] = this.input.takeMouse();
    this.player.yaw -= dx * MOUSE_SENSITIVITY;
    this.player.pitch = clamp(this.player.pitch - dy * MOUSE_SENSITIVITY, -1.45, 1.45);
  }

  private simulate(dt: number): void {
    if (this.input.wasPressed('Digit1')) this.cigarette.press();

    const forward = this.input.axis('KeyS', 'KeyW');
    const strafe = this.input.axis('KeyA', 'KeyD');
    const sprint = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const breathMax = this.breathMax();

    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 5) {
      stepPlayer(
        this.player,
        {
          forward,
          strafe,
          sprint,
          dt: FIXED_DT,
          slowFactor: this.cigarette.speedMul,
          breathMax,
        },
        this.world,
      );
      this.accumulator -= FIXED_DT;
      steps++;
    }

    const previousDay = this.clock.day;
    advanceClock(this.clock, dt);
    if (this.clock.day !== previousDay) this.cigarette.resetDay();

    this.footsteps();
    this.breathing(dt);
  }

  private footsteps(): void {
    if (this.player.distance < this.nextStepAt) return;
    const stride = this.player.sprinting ? STEP_LENGTH * 0.78 : STEP_LENGTH;
    this.nextStepAt = this.player.distance + stride;
    this.audio.footstep(this.player.surface, this.player.sprinting);
  }

  private breathing(dt: number): void {
    const breathMax = this.breathMax();
    const low = this.player.breath / breathMax < 0.55;
    if (!low && !this.player.exhausted) return;
    this.breathSoundTimer -= dt;
    if (this.breathSoundTimer <= 0) {
      this.audio.breath(this.player.exhausted);
      this.breathSoundTimer = this.player.exhausted ? 1.0 : 1.6;
    }
  }

  private syncCamera(dt: number): void {
    // Покачивание при ходьбе: амплитуда растёт со скоростью.
    const amp = clamp(this.player.speed / PLAYER.sprintSpeed, 0, 1);
    this.bob += this.player.speed * dt * 2.1;
    const bobY = Math.sin(this.bob * 2) * 0.035 * amp;
    const bobX = Math.cos(this.bob) * 0.028 * amp;

    this.camera.position.set(this.player.x + bobX * 0.35, this.player.eyeY + bobY, this.player.z);
    this.camera.rotation.set(this.player.pitch, this.player.yaw, Math.sin(this.bob) * 0.012 * amp);

    const targetFov = BASE_FOV + this.cigarette.fovOffset + (this.player.sprinting ? 3.5 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 6 * dt);
    this.camera.updateProjectionMatrix();
  }

  private updateWorld(dt: number): void {
    this.sky.update(this.clock.t, this.camera);
    this.forest.update(dt);

    const sunDir = this.sky.sun.position.clone().sub(this.camera.position).normalize();
    this.water.update(dt, sunDir, this.sky.sun.color, this.sky.skyColor, this.sky.sun.intensity);

    // Ветерок гуляет по кругу — по нему сносит дым.
    this.wind.set(
      Math.sin(this.elapsed * 0.07) * 0.35 + 0.1,
      0.02,
      Math.cos(this.elapsed * 0.053) * 0.35,
    );
    this.smoke.setLight(this.sky.sun.color, this.sky.sun.intensity);
    this.smoke.update(dt, this.wind);

    this.audio.setMuffle(this.cigarette.muffle);
    this.audio.update(dt, {
      night: isDark(this.clock.t),
      windTarget: 0.4 + Math.sin(this.elapsed * 0.07) * 0.3,
      waterCloseness: this.waterCloseness(),
      canopy: this.canopyDensity(),
    });
  }

  private waterCloseness(): number {
    const d = Terrain.lakeDistance(this.player.x, this.player.z);
    return 1 - smoothstep(WORLD.lakeHalf - 2, WORLD.lakeHalf + 30, d);
  }

  private canopyDensity(): number {
    const near = this.world.obstacles.query(this.player.x, this.player.z, 12);
    return clamp(near.length / 14, 0, 1);
  }

  private updateHud(): void {
    this.hud.setClock(this.clock.t, this.clock.day);
    this.hud.setCigarettes(this.cigarette.pack, this.cigarette.inHand);
    this.hud.setHint(this.cigarette.hint());
    this.hud.setBreath(this.player.breath / this.breathMax());
    this.hud.setBuzz(this.cigarette.warmth, this.cigarette.buzz);
  }
}
