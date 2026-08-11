import * as THREE from 'three';
import {
  APPLES,
  CHOP,
  FISHING,
  INTERACT,
  PLAYER,
  STOVE,
  TIME,
  TIME_CYCLE,
  WORLD,
  WORLD_SEED,
} from '../shared/balance';
import { fishLabel, rollFish } from '../shared/fishing';
import { createPlayerState, stepPlayer, type PlayerState } from '../shared/movement';
import { questProgress } from '../shared/quests';
import { clamp, mulberry32, smoothstep } from '../shared/rng';
import { applesReady, createGameState, isBlessed, type GameState } from '../shared/state';
import { advanceClock, createClock, isDark } from '../shared/time';
import { campfirePosition } from '../shared/world/buildings';
import { Terrain } from '../shared/world/terrain';
import { generateWorld, type WorldData } from '../shared/world/worldgen';
import { GameAudio } from './audio/audio';
import { buravchikAction, buravchikDialog, tomerAction, tomerDialog } from './dialogs';
import { Input } from './input';
import { AxeItem } from './items/axe';
import { CigaretteItem } from './items/cigarette';
import { RodItem } from './items/rod';
import { Interactions, type Target } from './interaction';
import { createNpc, type NpcHandle } from './render/characters';
import { Forest, TREE_HEIGHT } from './render/forest';
import { buildAppleTree, buildMonument, ChopEffects, type AppleTreeHandle } from './render/nature';
import { Sky } from './render/sky';
import { Smoke } from './render/smoke';
import { buildSign } from './render/sign';
import {
  buildCampfire,
  buildHut,
  buildStall,
  type CampfireBuild,
  type HutBuild,
  type StallBuild,
} from './render/structures';
import { buildTerrainMesh } from './render/terrainMesh';
import { Water } from './render/water';
import { Dialog, type DialogSpec } from './ui/dialog';
import { Hud } from './ui/hud';
import { Nameplate, Toasts } from './ui/labels';

const FIXED_DT = 1 / 60;
const MOUSE_SENSITIVITY = 0.0022;
const BASE_FOV = 75;
/** Через сколько метров ставится следующий шаг. */
const STEP_LENGTH = 1.75;
/** Высота глаз, когда игрок сидит в кресле. */
const SEAT_EYE = 1.12;

type Slot = 1 | 2 | 3 | 4 | 5;

export class Game {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly input: Input;
  private readonly audio = new GameAudio();
  private readonly hud = new Hud();
  private readonly dialog = new Dialog();
  private readonly nameplate = new Nameplate();
  private readonly toasts = new Toasts();

  private readonly sky: Sky;
  private readonly water: Water;
  private readonly forest: Forest;
  private readonly smoke: Smoke;
  private readonly hut: HutBuild;
  private readonly stall: StallBuild;
  private readonly campfire: CampfireBuild;
  private readonly chopEffects = new ChopEffects();
  private readonly appleTrees: AppleTreeHandle[] = [];
  private readonly npcs: { buravchik: NpcHandle; tomer: NpcHandle };
  private readonly flashlight: THREE.SpotLight;

  private readonly cigarette: CigaretteItem;
  private readonly axe: AxeItem;
  private readonly rod: RodItem;

  private readonly world: WorldData;
  private readonly player: PlayerState;
  private readonly clock = createClock();
  private readonly state: GameState;
  private readonly interactions: Interactions;
  private readonly rng = mulberry32(Date.now() >>> 0);

  private accumulator = 0;
  private last = 0;
  private running = false;
  private elapsed = 0;
  private nextStepAt = STEP_LENGTH;
  private breathSoundTimer = 0;
  private bob = 0;
  private slot: Slot = 1;
  private seated = false;
  private target: Target | null = null;
  private readonly offerings: { position: THREE.Vector3; timer: number; wisp: number }[] = [];
  private readonly wind = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly screenCenter = new THREE.Vector2(0, 0);

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
    this.state = createGameState(this.world.appleTrees.length);

    this.sky = new Sky(this.scene);
    this.scene.add(buildTerrainMesh(this.world.terrain, this.world.seed));

    this.forest = new Forest(this.world);
    this.scene.add(this.forest.group);
    this.scene.add(this.chopEffects.group);

    this.water = new Water();
    this.scene.add(this.water.mesh);
    this.scene.add(buildSign(this.world.terrain));

    this.hut = buildHut(this.world.hut);
    this.stall = buildStall(this.world.stall);
    const fire = campfirePosition();
    this.campfire = buildCampfire(fire.x, this.world.terrain.height(fire.x, fire.z), fire.z);
    this.scene.add(this.hut.group, this.stall.group, this.campfire.group);

    for (const prop of this.world.appleTrees) {
      const tree = buildAppleTree(prop);
      this.appleTrees.push(tree);
      this.scene.add(tree.group);
    }

    const monument = buildMonument(
      this.world.monument.x,
      this.world.monument.y,
      this.world.monument.z,
      this.world.monument.rot,
    );
    this.scene.add(monument.group);

    // Буравчик сидит в своём кресле, Томер стоит за прилавком.
    const chair = this.world.hut.chairs[0];
    this.npcs = {
      buravchik: createNpc('buravchik', chair.x, this.world.hut.floorY + 0.45, chair.z, Math.PI * 1.1),
      tomer: createNpc(
        'tomer',
        this.world.stall.keeper.x,
        this.world.terrain.height(this.world.stall.keeper.x, this.world.stall.keeper.z),
        this.world.stall.keeper.z,
        Math.PI,
      ),
    };
    this.scene.add(this.npcs.buravchik.group, this.npcs.tomer.group);

    this.smoke = new Smoke();
    this.scene.add(this.smoke.points);

    this.cigarette = new CigaretteItem(this.camera, this.smoke, this.audio, this.state.inventory);
    this.axe = new AxeItem(this.camera);
    this.rod = new RodItem(this.camera, this.scene, this.audio, this.rng);

    this.flashlight = new THREE.SpotLight(0xfff2d8, 0, 34, 0.5, 0.55, 1.2);
    this.flashlight.position.set(0.12, -0.06, 0);
    this.flashlight.target.position.set(0, -0.05, -1);
    this.camera.add(this.flashlight, this.flashlight.target);

    const seat = this.world.hut.chairs[1];
    this.interactions = new Interactions(this.world, {
      buravchik: this.npcs.buravchik.labelPoint,
      tomer: this.npcs.tomer.labelPoint,
      monument: monument.position,
      stove: this.hut.stovePosition,
      chair: new THREE.Vector3(seat.x, this.world.hut.floorY, seat.z),
      appleTrees: this.appleTrees.map((t) => t.position),
    });

    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => {
      if (locked) {
        this.running = true;
        this.hud.setVisible(true);
        this.input.endFrame();
        this.last = performance.now();
        return;
      }
      this.running = false;
      // Выход из захвата ради диалога — не пауза.
      if (this.dialog.isOpen) return;
      this.hud.setVisible(false);
      this.onPause?.();
    };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.dialog.isOpen) this.dialog.close();
    });
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.running) this.useItem();
    });

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
    if (this.axe.update(dt)) this.applyAxeHit();
    this.handleRod(dt);
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
    this.handleSlots();

    const forward = this.input.axis('KeyS', 'KeyW');
    const strafe = this.input.axis('KeyA', 'KeyD');
    const sprint = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');

    if (this.seated && (forward !== 0 || strafe !== 0)) this.seated = false;

    if (!this.seated) {
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
      this.footsteps();
    } else {
      this.player.speed = 0;
    }

    this.target = this.interactions.find(this.player, this.state, this.clock.day);
    if (this.input.wasPressed('KeyE')) this.interact();

    const previousDay = this.clock.day;
    const scale = this.seated && this.state.world.stoveFuel > 0 ? TIME.stoveTimeScale : 1;
    advanceClock(this.clock, dt, scale);
    if (this.clock.day !== previousDay) this.newDay();

    // Печь прогорает по игровому времени: у кресла дрова уходят быстрее.
    if (this.state.world.stoveFuel > 0) {
      this.state.world.stoveFuel = Math.max(0, this.state.world.stoveFuel - dt * scale);
    }

    this.breathing(dt);
  }

  private handleSlots(): void {
    const inv = this.state.inventory;
    const pick = (slot: Slot, available: boolean, denial: string): void => {
      if (!available) {
        this.toasts.push(denial, 'bad');
        return;
      }
      this.slot = slot;
    };

    if (this.input.wasPressed('Digit1')) {
      this.slot = 1;
      this.cigarette.press();
    }
    if (this.input.wasPressed('Digit2')) this.slot = 2;
    if (this.input.wasPressed('Digit3')) pick(3, inv.hasShotgun, 'Дробовика нет — у Томера 900 ₪');
    if (this.input.wasPressed('Digit4')) pick(4, inv.hasRod, 'Удочки нет — у Томера 200 ₪');
    if (this.input.wasPressed('Digit5')) pick(5, inv.hasFlashlight, 'Фонарика нет — у Томера 150 ₪');

    this.cigarette.setHidden(this.slot !== 1);
    this.axe.setVisible(this.slot === 2);
    this.rod.setVisible(this.slot === 4);
    this.flashlight.intensity = this.slot === 5 && inv.hasFlashlight ? 4.5 : 0;
  }

  /** ЛКМ: у каждого предмета своё действие. */
  private useItem(): void {
    if (this.slot === 2) {
      if (this.axe.swing()) this.audio.chop();
      return;
    }
    if (this.slot === 4) {
      const event = this.rod.action(this.waterTarget());
      if (event === 'hooked') this.catchFish();
      if (event === 'cast') this.audio.pickup();
    }
  }

  /** Куда смотрит игрок на воде: точка заброса поплавка. */
  private waterTarget(): THREE.Vector3 | null {
    this.raycaster.setFromCamera(this.screenCenter, this.camera);
    this.raycaster.far = FISHING.castRange;
    const hit = this.raycaster.intersectObject(this.water.mesh, false)[0];
    if (!hit) return null;
    return hit.point.clone();
  }

  private catchFish(): void {
    const fish = rollFish(this.rng, isBlessed(this.state, this.clock.day));
    this.state.inventory.fish.push(fish);
    this.audio.pickup();
    this.toasts.push(`Поймал: ${fishLabel(fish)}`, fish.kind === 'boot' ? 'bad' : 'normal');
  }

  private handleRod(dt: number): void {
    const event = this.rod.update(dt);
    if (event === 'missed') this.toasts.push('Сорвалась', 'bad');
  }

  /** Топор бьёт в середине замаха — тут считаем попадание по стволу. */
  private applyAxeHit(): void {
    const id = this.interactions.findTree(this.player, this.state, this.clock.day);
    if (id === null) return;
    const world = this.state.world;
    const mutation = world.trees.get(id) ?? { hits: 0, choppedDay: null };
    mutation.hits += 1;

    const needed = this.state.inventory.hasGoodAxe ? CHOP.hitsGoodAxe : CHOP.hits;
    if (mutation.hits >= needed) {
      mutation.hits = 0;
      mutation.choppedDay = this.clock.day;
      this.fellTree(id);
    }
    world.trees.set(id, mutation);
  }

  private fellTree(id: number): void {
    const tree = this.world.trees[id];
    this.forest.setTreeVisible(id, false);
    const obstacle = this.world.treeObstacles[id];
    if (obstacle) obstacle.disabled = true;
    this.chopEffects.addStump(id, tree.x, tree.y, tree.z, tree.scale);
    this.chopEffects.dropTrunk(
      tree.x,
      tree.y,
      tree.z,
      TREE_HEIGHT[tree.type] * tree.scale * 0.85,
      0.22 * tree.scale,
      this.player.yaw,
    );
    this.audio.treeFall();
    this.state.inventory.logs += CHOP.logsPerTree;
    this.toasts.push(`Дерево свалено. Дров: +${CHOP.logsPerTree}`);
  }

  private newDay(): void {
    this.cigarette.resetDay();
    const day = this.clock.day;
    for (const [id, mutation] of this.state.world.trees) {
      if (mutation.choppedDay === null) continue;
      if (day - mutation.choppedDay < CHOP.regrowDays) continue;
      // На месте пня поднялось молодое дерево.
      this.forest.setTreeVisible(id, true);
      const obstacle = this.world.treeObstacles[id];
      if (obstacle) obstacle.disabled = false;
      this.chopEffects.removeStump(id);
      this.state.world.trees.delete(id);
    }
    this.toasts.push(`Настал день ${day}`);
  }

  private interact(): void {
    const target = this.target;
    if (!target) return;

    switch (target.kind) {
      case 'buravchik':
        this.openBuravchik();
        break;
      case 'tomer':
        this.openTomer();
        break;
      case 'apple':
        this.pickApples(target.index);
        break;
      case 'monument':
        this.payTribute();
        break;
      case 'stove':
        this.stokeStove();
        break;
      case 'chair':
        this.seated = true;
        this.toasts.push(
          this.state.world.stoveFuel > 0 ? 'Сидишь у печки. Время идёт быстрее' : 'Сидишь. Печь холодная',
        );
        break;
      default:
        break;
    }
  }

  private pickApples(index: number): void {
    if (!applesReady(this.state, index, this.clock.day, APPLES.regrowDays)) return;
    const count = APPLES.minPerTree + Math.floor(this.rng() * (APPLES.maxPerTree - APPLES.minPerTree + 1));
    this.state.inventory.apples += count;
    this.state.world.appleTrees[index].pickedDay = this.clock.day;
    this.appleTrees[index].setApples(false);
    this.audio.pickup();
    this.toasts.push(`Яблоки: +${count}`);
  }

  private stokeStove(): void {
    if (this.state.inventory.logs <= 0) {
      this.toasts.push('Дров нет. Возьми топор и сходи в лес', 'bad');
      return;
    }
    this.state.inventory.logs -= 1;
    this.state.world.stoveFuel = Math.min(STOVE.maxFuel, this.state.world.stoveFuel + STOVE.secondsPerLog);
    this.audio.stoke();
    this.toasts.push('Полено в топке');
  }

  private payTribute(): void {
    const day = this.clock.day;
    if (day - this.state.world.tributeDay < 3) {
      this.toasts.push('Серёга Пират уже почтён. Приходи позже', 'bad');
      return;
    }
    if (!this.cigarette.giveAway()) {
      this.toasts.push('Нужна зажжённая сигарета', 'bad');
      return;
    }
    this.state.world.tributeDay = day;
    this.state.world.blessedUntilDay = day + 1;
    this.offerings.push({
      position: new THREE.Vector3(
        this.player.x,
        this.world.terrain.height(this.player.x, this.player.z) + 0.3,
        this.player.z,
      ),
      timer: 90,
      wisp: 0,
    });
    this.toasts.push('Серёга Пират, ты был легендой. Клевать будет лучше', 'money');
  }

  private openBuravchik(): void {
    const day = this.clock.day;
    const spec = (): DialogSpec => buravchikDialog(this.state, day, this.state.inventory.cigarettes > 0);
    this.openDialog(spec, (id) => {
      const result = buravchikAction(id, this.state, day, this.rng);
      if (result.spentCigarette) this.state.inventory.cigarettes -= 1;
      this.applyDialogResult(result);
      return result.close === true;
    });
  }

  private openTomer(): void {
    const spec = (): DialogSpec => tomerDialog(this.state);
    this.openDialog(spec, (id) => {
      const result = tomerAction(id, this.state);
      this.applyDialogResult(result);
      return result.close === true;
    });
  }

  private applyDialogResult(result: {
    toast?: string;
    tone?: 'normal' | 'money' | 'bad';
    sound?: string;
  }): void {
    if (result.toast) this.toasts.push(result.toast, result.tone ?? 'normal');
    if (result.sound === 'coins') this.audio.coins();
    if (result.sound === 'pickup') this.audio.pickup();
  }

  private openDialog(spec: () => DialogSpec, onAction: (id: string) => boolean): void {
    document.exitPointerLock();
    this.dialog.open(
      spec(),
      (id) => {
        if (onAction(id)) this.dialog.close();
        else this.dialog.update(spec());
      },
      () => this.input.requestLock(),
    );
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
    if (this.seated) {
      const seat = this.world.hut.chairs[1];
      this.camera.position.set(seat.x, this.world.hut.floorY + SEAT_EYE, seat.z);
      this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);
      return;
    }

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
    this.chopEffects.update(dt);
    this.npcs.buravchik.update(dt);
    this.npcs.tomer.update(dt);

    const night = isDark(this.clock.t);
    this.campfire.update(dt, night);
    this.stall.setLamp(night);
    this.hut.setFire(this.state.world.stoveFuel > 0 ? 1 : 0);
    this.hut.setDaylight(Math.min(this.sky.sun.intensity, 2.2) / 2.2);

    // Яблоки возвращаются на ветки на следующий день.
    this.appleTrees.forEach((tree, i) => {
      tree.setApples(applesReady(this.state, i, this.clock.day, APPLES.regrowDays));
    });

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
    this.updateOfferings(dt);

    this.audio.setMuffle(this.cigarette.muffle);
    this.audio.update(dt, {
      night,
      windTarget: 0.4 + Math.sin(this.elapsed * 0.07) * 0.3,
      waterCloseness: this.waterCloseness(),
      canopy: this.canopyDensity(),
    });
  }

  /** Оставленная у памятника сигарета ещё какое-то время дымит. */
  private updateOfferings(dt: number): void {
    for (let i = this.offerings.length - 1; i >= 0; i--) {
      const o = this.offerings[i];
      o.timer -= dt;
      o.wisp -= dt;
      if (o.wisp <= 0) {
        o.wisp = 0.5 + Math.random() * 0.4;
        this.smoke.spawn(
          o.position,
          new THREE.Vector3((Math.random() - 0.5) * 0.06, 0.16, (Math.random() - 0.5) * 0.06),
          { size: 0.06, life: 3.6, alpha: 0.12, grow: 0.18 },
        );
      }
      if (o.timer <= 0) this.offerings.splice(i, 1);
    }
  }

  private waterCloseness(): number {
    const d = Terrain.lakeDistance(this.player.x, this.player.z);
    return 1 - smoothstep(WORLD.lakeHalf - 2, WORLD.lakeHalf + 30, d);
  }

  private canopyDensity(): number {
    const near = this.world.obstacles.query(this.player.x, this.player.z, 12);
    return clamp(near.length / 14, 0, 1);
  }

  private hintText(): string {
    if (this.seated) return 'W — встать';
    if (this.target && this.target.distance < INTERACT.npcRange) return this.target.hint;
    if (this.slot === 4) return this.rod.hint();
    if (this.slot === 2) return 'ЛКМ — рубить';
    if (this.slot === 1) return this.cigarette.hint();
    return '';
  }

  private updateHud(): void {
    const inv = this.state.inventory;
    this.hud.setClock(this.clock.t, this.clock.day);
    this.hud.setPurse(inv);
    this.hud.setQuest(this.state.quest, this.state.quest ? questProgress(this.state.quest, this.state) : 0);
    this.hud.setHint(this.hintText());
    this.hud.setBreath(this.player.breath / this.breathMax());
    this.hud.setBuzz(this.cigarette.warmth, this.cigarette.buzz);
    this.hud.setSlots(
      this.slot,
      { 1: true, 2: true, 3: inv.hasShotgun, 4: inv.hasRod, 5: inv.hasFlashlight },
      { 1: String(inv.cigarettes), 3: inv.hasShotgun ? String(inv.shells) : '', 4: '', 5: '' },
    );

    if (this.target?.name && this.target.labelPoint) {
      this.nameplate.show(this.target.name, this.target.labelPoint, this.camera);
    } else {
      this.nameplate.hide();
    }
  }
}
