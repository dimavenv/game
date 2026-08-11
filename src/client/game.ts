import * as THREE from 'three';
import {
  APPLES,
  CHOP,
  ECONOMY,
  STONES,
  WINE,
  FISHING,
  HEALTH,
  INTERACT,
  PLAYER,
  STOVE,
  TIME,
  TIME_CYCLE,
  WEAPONS,
  WORLD,
  WORLD_SEED,
} from '../shared/balance';
import { fishItemId, fishLabel, rollFish } from '../shared/fishing';
import { GRADE_LABEL, daysToNextGrade, wineGrade, wineItem } from '../shared/wine';
import {
  BLUEPRINTS,
  CHEST_SLOTS,
  placementError,
  structureCollider,
  type BlueprintId,
  type PlacedStructure,
} from '../shared/world/building';
import { addItem, countItem, isOverloaded, removeItem } from '../shared/inventory';
import { createPlayerState, stepPlayer, type PlayerState } from '../shared/movement';
import { questProgress } from '../shared/quests';
import { clamp, mulberry32, smoothstep } from '../shared/rng';
import {
  applesReady,
  createGameState,
  isBlessed,
  plantedVineReady,
  vineReady,
  type GameState,
} from '../shared/state';
import { advanceClock, createClock, isDark } from '../shared/time';
import {
  damageZombie,
  findMeleeTarget,
  shotgunTargets,
  spawnZombies,
  stepZombies,
  zombieCount,
  type Zombie,
} from '../shared/zombies';
import { campfirePosition } from '../shared/world/buildings';
import { Terrain } from '../shared/world/terrain';
import { generateWorld, type WorldData } from '../shared/world/worldgen';
import { GameAudio } from './audio/audio';
import { buravchikAction, buravchikDialog, tomerAction, tomerDialog } from './dialogs';
import { Input } from './input';
import { AxeItem } from './items/axe';
import { HammerItem } from './items/hammer';
import { CigaretteItem } from './items/cigarette';
import { RodItem } from './items/rod';
import { ShotgunItem } from './items/shotgun';
import { clearSave, loadGame, saveGame } from './save';
import { Interactions, type Target } from './interaction';
import { createNpc, type NpcHandle } from './render/characters';
import { Forest, TREE_HEIGHT } from './render/forest';
import { buildAppleTree, buildMonument, ChopEffects, type AppleTreeHandle } from './render/nature';
import { PlacedStructures } from './render/placed';
import { buildVine, buildWildVine, type VineHandle } from './render/vines';
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
import { ZombieView } from './render/zombies';
import { Water } from './render/water';
import { BuildMenu } from './ui/buildMenu';
import { Dialog, type DialogSpec } from './ui/dialog';
import { InventoryScreen } from './ui/inventory';
import { Hud } from './ui/hud';
import { Nameplate, Toasts } from './ui/labels';

const FIXED_DT = 1 / 60;
const MOUSE_SENSITIVITY = 0.0022;
const BASE_FOV = 75;
/** Через сколько метров ставится следующий шаг. */
const STEP_LENGTH = 1.75;
/** Высота глаз, когда игрок сидит в кресле. */
const SEAT_EYE = 1.12;

type Slot = 1 | 2 | 3 | 4 | 5 | 6;

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
  private readonly shotgun: ShotgunItem;
  private readonly hammer: HammerItem;
  private readonly placed = new PlacedStructures();
  private readonly inventoryScreen = new InventoryScreen();
  private readonly buildMenu = new BuildMenu();
  private buildKind: BlueprintId = 'palisade';
  private buildMode = false;
  private readonly rockPoints: THREE.Vector3[] = [];
  private readonly wildVines: VineHandle[] = [];
  private readonly plantedVines = new Map<number, VineHandle>();
  private pressing = 0;
  private readonly zombieView = new ZombieView(40);
  private zombies: Zombie[] = [];
  private nextZombieId = 0;

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
  private dying = false;
  private deathTimer = 0;
  private hurtFlash = 0;
  private bandaging = 0;
  private groanTimer = 0;
  private saveTimer = 0;
  private wasDark = false;
  private signSeen = false;
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

    for (const prop of this.world.vines) {
      const vine = buildWildVine(prop);
      this.wildVines.push(vine);
      this.scene.add(vine.group);
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
    this.shotgun = new ShotgunItem(this.camera);
    this.hammer = new HammerItem(this.camera);
    this.scene.add(this.zombieView.group);
    this.scene.add(this.placed.group);
    for (const rock of this.world.rocks) this.rockPoints.push(new THREE.Vector3(rock.x, rock.y, rock.z));

    // Прошлая партия, если она была.
    loadGame(this.state, this.clock, this.player);
    this.player.eyeY = this.world.terrain.height(this.player.x, this.player.z) + PLAYER.eyeHeight;
    this.restoreWorldVisuals();

    this.flashlight = new THREE.SpotLight(0xfff2d8, 0, 42, 0.44, 0.45, 1.1);
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
      pebbles: this.world.pebbles.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      vines: this.wildVines.map((v) => v.position),
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
      // Выход из захвата ради диалога или рюкзака — не пауза.
      if (this.dialog.isOpen || this.inventoryScreen.isOpen) return;
      this.hud.setVisible(false);
      this.onPause?.();
    };

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.dialog.isOpen) this.dialog.close();
      if ((e.code === 'Escape' || e.code === 'Tab') && this.inventoryScreen.isOpen) {
        e.preventDefault();
        this.inventoryScreen.close();
      }
    });
    window.addEventListener('wheel', (e) => {
      if (!this.buildMode) return;
      this.buildMenu.cycle(e.deltaY > 0 ? 1 : -1, this.state.inventory);
      this.buildKind = this.buildMenu.kind;
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
    if (this.dying) {
      this.deathTimer -= dt;
      if (this.deathTimer <= 0) this.respawn();
    }
    this.simulate(dt);
    this.cigarette.update(dt, this.camera);
    if (this.axe.update(dt)) this.applyAxeHit();
    if (this.hammer.update(dt)) this.applyHammerHit();
    if (this.shotgun.update(dt) === 'reload-done') this.finishReload();
    if (this.bandaging > 0) this.bandaging -= dt;
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);
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
            jump: this.input.isDown('Space'),
            overloaded: isOverloaded(this.state.inventory),
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
    this.nightCycle();
    this.updateZombies(dt);

    // У горящей печки раны затягиваются сами.
    if (this.seated && this.state.world.stoveFuel > 0 && this.player.health < PLAYER.maxHealth) {
      this.player.health = Math.min(PLAYER.maxHealth, this.player.health + HEALTH.stoveRegen * dt * scale);
    }

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 12;
      saveGame(this.state, this.clock, this.player);
    }

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
    if (this.input.wasPressed('Digit6')) pick(6, inv.hasHammer, 'Молота нет — у Томера 280 ₪');
    if (this.input.wasPressed('Tab')) this.openBackpack();
    if (this.input.wasPressed('KeyB')) this.toggleBuildMode();
    if (this.input.wasPressed('KeyR') && this.slot === 3) this.reloadShotgun();
    if (this.input.wasPressed('KeyQ')) this.useBandage();

    this.cigarette.setHidden(this.slot !== 1);
    this.axe.setVisible(this.slot === 2);
    this.rod.setVisible(this.slot === 4);
    this.shotgun.setVisible(this.slot === 3 && inv.hasShotgun);
    this.hammer.setVisible(this.slot === 6 && inv.hasHammer);
    if (this.buildMode && this.slot !== 6) this.setBuildMode(false);
    this.flashlight.intensity = this.slot === 5 && inv.hasFlashlight ? 10 : 0;
  }

  /** ЛКМ: у каждого предмета своё действие. */
  private useItem(): void {
    if (this.dying) return;
    if (this.buildMode) {
      this.placeStructure();
      return;
    }
    if (this.slot === 6) {
      if (this.hammer.swing()) this.audio.chop();
      return;
    }
    if (this.slot === 3) {
      const event = this.shotgun.fire();
      if (event === 'fired') this.fireShotgun();
      else if (event === 'empty') this.audio.dryFire();
      return;
    }
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
    const left = addItem(this.state.inventory, fishItemId(fish.kind), 1, fish.weight);
    if (left > 0) {
      this.toasts.push('Рюкзак полон — рыба ушла обратно', 'bad');
      return;
    }
    this.audio.pickup();
    this.audio.playSlot('hero_fish');
    this.toasts.push(`Поймал: ${fishLabel(fish)}`, fish.kind === 'boot' ? 'bad' : 'normal');
  }

  private handleRod(dt: number): void {
    const event = this.rod.update(dt);
    if (event === 'missed') this.toasts.push('Сорвалась', 'bad');
  }

  /** Топор бьёт в середине замаха: сперва проверяем зомби, потом ствол. */
  private applyAxeHit(): void {
    const damage = this.state.inventory.hasGoodAxe ? WEAPONS.axe.goodDamage : WEAPONS.axe.damage;
    const victim = findMeleeTarget(this.zombies, this.player, WEAPONS.axe.range, WEAPONS.axe.arc);
    if (victim) {
      if (damageZombie(victim, damage)) this.onZombieKilled();
      return;
    }

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
    const left = addItem(this.state.inventory, 'log', CHOP.logsPerTree);
    this.toasts.push(
      left > 0 ? 'Дерево свалено, но брёвна не влезли в рюкзак' : `Дерево свалено. Брёвен: +${CHOP.logsPerTree}`,
      left > 0 ? 'bad' : 'normal',
    );
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

    for (const [index, boulder] of this.state.world.boulders) {
      if (boulder.brokenDay === null) continue;
      if (day - boulder.brokenDay < STONES.boulderRegrowDays) continue;
      this.forest.setPropVisible('rock', index, true);
      this.state.world.boulders.delete(index);
    }
    for (const [index, takenDay] of this.state.world.pebbles) {
      if (day - takenDay < STONES.pebbleRegrowDays) continue;
      this.forest.setPropVisible('pebble', index, true);
      this.state.world.pebbles.delete(index);
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
      case 'pebble':
        this.pickPebble(target.index);
        break;
      case 'vine':
        this.pickWildGrapes(target.index);
        break;
      case 'structure':
        this.useStructure(target.index);
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
    const left = addItem(this.state.inventory, 'apple', count);
    if (left >= count) {
      this.toasts.push('В рюкзаке нет места', 'bad');
      return;
    }
    this.state.world.appleTrees[index].pickedDay = this.clock.day;
    this.appleTrees[index].setApples(false);
    this.audio.pickup();
    this.toasts.push(`Яблоки: +${count}`);
  }

  private stokeStove(): void {
    if (countItem(this.state.inventory, 'log') <= 0) {
      this.toasts.push('Дров нет. Возьми топор и сходи в лес', 'bad');
      return;
    }
    removeItem(this.state.inventory, 'log', 1);
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
    this.audio.playSlot('hero_tribute');
    this.toasts.push('Серёга Пират, ты был легендой. Клевать будет лучше', 'money');
  }

  private openBuravchik(): void {
    this.audio.playSlot('buravchik_greet');
    const day = this.clock.day;
    const spec = (): DialogSpec => buravchikDialog(this.state, day, countItem(this.state.inventory, 'cigarettes') > 0);
    this.openDialog(spec, (id) => {
      const result = buravchikAction(id, this.state, day, this.rng, this.clock.day > 1);
      if (result.spentCigarette) removeItem(this.state.inventory, 'cigarettes', 1);
      this.applyDialogResult(result);
      return result.close === true;
    });
  }

  private openTomer(): void {
    this.audio.playSlot('tomer_greet');
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
    voice?: string;
  }): void {
    if (result.toast) this.toasts.push(result.toast, result.tone ?? 'normal');
    if (result.sound === 'coins') this.audio.coins();
    if (result.sound === 'pickup') this.audio.pickup();
    if (result.voice) this.audio.playSlot(result.voice);
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
    this.placed.sync(this.state.world.structures);
    this.syncVines();
    this.updateGhost();
    if (this.pressing > 0) this.pressing = Math.max(0, this.pressing - dt);
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

    // Реплика героя у таблички — если для неё записан файл.
    if (!this.signSeen) {
      const dx = WORLD.sign.x - this.player.x;
      const dz = WORLD.sign.z - this.player.z;
      if (Math.hypot(dx, dz) < 6) {
        this.signSeen = true;
        this.audio.playSlot('hero_sign');
      }
    }

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
    if (this.buildMode) return `${BLUEPRINTS[this.buildKind].name}: ЛКМ — поставить`;
    if (this.slot === 6) return 'ЛКМ — разбить валун · B — стройка';
    if (this.slot === 3) return this.shotgun.hint(countItem(this.state.inventory, 'shells'));
    if (this.slot === 2) return this.zombies.length > 0 ? 'ЛКМ — бить' : 'ЛКМ — рубить';
    if (this.slot === 1) return this.cigarette.hint();
    return '';
  }


  /** Возвращает картинку в согласие с загруженным состоянием мира. */
  private restoreWorldVisuals(): void {
    const day = this.clock.day;
    for (const [index, boulder] of this.state.world.boulders) {
      if (boulder.brokenDay === null) continue;
      if (day - boulder.brokenDay >= STONES.boulderRegrowDays) continue;
      this.forest.setPropVisible('rock', index, false);
    }
    for (const [index, takenDay] of this.state.world.pebbles) {
      if (day - takenDay >= STONES.pebbleRegrowDays) continue;
      this.forest.setPropVisible('pebble', index, false);
    }
    for (const structure of this.state.world.structures) this.registerStructureCollider(structure);
    for (const [id, mutation] of this.state.world.trees) {
      if (mutation.choppedDay === null) continue;
      if (day - mutation.choppedDay >= CHOP.regrowDays) continue;
      const tree = this.world.trees[id];
      if (!tree) continue;
      this.forest.setTreeVisible(id, false);
      const obstacle = this.world.treeObstacles[id];
      if (obstacle) obstacle.disabled = true;
      this.chopEffects.addStump(id, tree.x, tree.y, tree.z, tree.scale);
    }
  }

  /** Сумерки — стая выходит, рассвет — расходится. */
  private nightCycle(): void {
    const dark = isDark(this.clock.t);
    if (dark === this.wasDark) return;
    this.wasDark = dark;

    if (dark) {
      const count = zombieCount(this.clock.day);
      this.zombies = spawnZombies(this.rng, this.world, count, this.player, this.nextZombieId);
      this.nextZombieId += count;
      this.audio.playSlot('night_start');
      this.toasts.push('Темнеет. В чаще кто-то ходит', 'bad');
    } else {
      this.zombies = [];
      this.zombieView.sync(this.zombies);
      this.toasts.push('Рассвело. Лес пуст');
    }
  }

  private updateZombies(dt: number): void {
    if (this.zombies.length === 0) return;

    const hit = stepZombies(this.zombies, this.player, this.world, dt, this.rng);
    if (hit.damage > 0 && !this.dying) this.takeDamage(hit.damage);

    // Стоны: чем ближе стая, тем чаще.
    this.groanTimer -= dt;
    if (this.groanTimer <= 0) {
      let nearest = Infinity;
      let chasing = false;
      for (const z of this.zombies) {
        if (z.state === 'dying') continue;
        const d = Math.hypot(z.x - this.player.x, z.z - this.player.z);
        if (d < nearest) nearest = d;
        if (z.state !== 'wander' && d < 24) chasing = true;
      }
      if (nearest < 40) {
        this.audio.groan(nearest, chasing);
        this.groanTimer = chasing ? 1.4 + this.rng() * 1.2 : 3 + this.rng() * 4;
      } else {
        this.groanTimer = 4;
      }
    }

    this.zombieView.sync(this.zombies);
  }

  private fireShotgun(): void {
    this.audio.shotgun();
    const targets = shotgunTargets(this.zombies, this.player, WEAPONS.shotgun.range, WEAPONS.shotgun.spread);
    let killed = 0;
    for (const { zombie, damage } of targets) {
      if (damageZombie(zombie, damage, false)) killed += 1;
    }
    for (let i = 0; i < killed; i++) this.onZombieKilled();
    if (targets.length === 0) this.toasts.push('Мимо', 'bad');
  }

  private reloadShotgun(): void {
    if (this.shotgun.startReload(countItem(this.state.inventory, 'shells')) !== 'reload-start') return;
    this.audio.reload();
  }

  /** Патроны уходят из кармана только когда перезарядка дошла до конца. */
  private finishReload(): void {
    const inv = this.state.inventory;
    const take = Math.min(WEAPONS.shotgun.capacity - this.shotgun.loaded, countItem(inv, 'shells'));
    if (take <= 0) return;
    removeItem(inv, 'shells', take);
    this.shotgun.loaded += take;
  }

  private useBandage(): void {
    const inv = this.state.inventory;
    if (this.player.health >= PLAYER.maxHealth) return;
    if (countItem(inv, 'bandage') <= 0) {
      this.toasts.push('Бинтов нет — у Томера 45 ₪', 'bad');
      return;
    }
    removeItem(inv, 'bandage', 1);
    this.player.health = Math.min(PLAYER.maxHealth, this.player.health + HEALTH.bandageHeal);
    this.bandaging = HEALTH.bandageTime;
    this.audio.bandage();
    this.toasts.push('Перевязался');
  }

  private onZombieKilled(): void {
    this.audio.zombieDown();
    const quest = this.state.quest;
    if (quest?.kind === 'zombies') {
      quest.progress += 1;
      this.toasts.push(`Упокоен: ${quest.progress}/${quest.target}`);
    } else {
      this.toasts.push('Упокоен');
    }
  }

  private takeDamage(amount: number): void {
    this.player.health -= amount;
    this.hurtFlash = 1;
    this.audio.hurt();
    if (this.player.health <= 0) {
      this.player.health = 0;
      this.die();
    }
  }

  /** Смерть: экран гаснет, утром игрок приходит в себя у печки. */
  private die(): void {
    if (this.dying) return;
    this.dying = true;
    this.deathTimer = HEALTH.deathFade;
    this.audio.death();
    this.zombies = [];
    this.zombieView.sync(this.zombies);
  }

  private respawn(): void {
    const inv = this.state.inventory;
    const lost = Math.round(inv.money * ECONOMY.deathMoneyLoss);
    inv.money -= lost;
    // Улов и яблоки теряются, снаряжение и остальное — нет.
    let catchSize = 0;
    for (const id of ['fish_crucian', 'fish_perch', 'fish_bighead', 'boot'] as const) {
      catchSize += removeItem(inv, id, countItem(inv, id));
    }
    removeItem(inv, 'apple', countItem(inv, 'apple'));

    // Приходит в себя у печки следующим утром.
    this.clock.day += 1;
    this.clock.t = TIME.dawn + 40;
    this.wasDark = false;
    const seat = this.world.hut.chairs[1];
    this.player.x = seat.x;
    this.player.z = seat.z + 0.8;
    this.player.vx = 0;
    this.player.vz = 0;
    this.player.health = PLAYER.maxHealth * 0.6;
    this.player.breath = PLAYER.breathMax;
    this.player.eyeY = this.world.hut.floorY + PLAYER.eyeHeight;
    this.dying = false;
    this.seated = false;
    this.cigarette.resetDay();

    this.toasts.push(
      `Буравчик дотащил тебя до хижины. Минус ${lost} ₪` + (catchSize > 0 ? ` и весь улов` : ''),
      'bad',
    );
    saveGame(this.state, this.clock, this.player);
  }

  /** Полностью новая партия: чистим сохранение и перезапускаем страницу. */
  restart(): void {
    clearSave();
    location.reload();
  }


  /** Молот бьёт по валуну; по зомби он тоже работает, но слабее топора. */
  private applyHammerHit(): void {
    const victim = findMeleeTarget(this.zombies, this.player, WEAPONS.axe.range, WEAPONS.axe.arc);
    if (victim) {
      if (damageZombie(victim, WEAPONS.axe.damage * 0.8)) this.onZombieKilled();
      return;
    }

    const index = this.interactions.findBoulder(this.player, this.state, this.clock.day, this.rockPoints);
    if (index === null) return;

    const boulders = this.state.world.boulders;
    const boulder = boulders.get(index) ?? { hits: 0, brokenDay: null };
    boulder.hits += 1;
    if (boulder.hits >= STONES.boulderHits) {
      boulder.hits = 0;
      boulder.brokenDay = this.clock.day;
      this.forest.setPropVisible('rock', index, false);
      const left = addItem(this.state.inventory, 'stone', STONES.boulderStones);
      this.toasts.push(
        left > 0 ? 'Валун разбит, но камни не влезли' : `Валун разбит. Камней: +${STONES.boulderStones}`,
        left > 0 ? 'bad' : 'normal',
      );
      this.audio.treeFall();
    }
    boulders.set(index, boulder);
  }

  private pickPebble(index: number): void {
    if (addItem(this.state.inventory, 'stone', 1) > 0) {
      this.toasts.push('В рюкзаке нет места', 'bad');
      return;
    }
    this.state.world.pebbles.set(index, this.clock.day);
    this.forest.setPropVisible('pebble', index, false);
    this.audio.pickup();
    this.toasts.push('Камень: +1');
  }

  private openBackpack(): void {
    if (this.inventoryScreen.isOpen) {
      this.inventoryScreen.close();
      return;
    }
    document.exitPointerLock();
    this.inventoryScreen.open(this.state.inventory, () => this.input.requestLock());
  }

  private openChest(id: number): void {
    const chest = Interactions.structureById(this.state, id);
    if (!chest) return;
    if (!chest.storage) chest.storage = Array.from({ length: CHEST_SLOTS }, () => null);
    document.exitPointerLock();
    this.inventoryScreen.open(this.state.inventory, () => this.input.requestLock(), {
      title: 'Сундук',
      slots: chest.storage,
    });
  }

  private toggleBuildMode(): void {
    if (!this.state.inventory.hasHammer) {
      this.toasts.push('Строить нечем — молот у Томера, 280 ₪', 'bad');
      return;
    }
    this.setBuildMode(!this.buildMode);
  }

  private setBuildMode(on: boolean): void {
    this.buildMode = on;
    if (on) {
      this.slot = 6;
      this.buildMenu.open(this.state.inventory, (kind) => {
        this.buildKind = kind;
      });
      this.buildKind = this.buildMenu.kind;
      this.toasts.push('Стройка: колесо мыши — выбор, ЛКМ — поставить, B — выйти');
    } else {
      this.buildMenu.close();
      this.placed.hideGhost();
    }
  }

  /** Куда смотрит игрок на земле — туда и встанет призрак постройки. */
  private buildTarget(): { x: number; z: number; y: number } {
    const distance = 4.5;
    const x = this.player.x - Math.sin(this.player.yaw) * distance;
    const z = this.player.z - Math.cos(this.player.yaw) * distance;
    const blueprint = BLUEPRINTS[this.buildKind];
    const y = blueprint.onWater ? 0 : this.world.terrain.height(x, z);
    return { x, z, y };
  }

  private updateGhost(): void {
    if (!this.buildMode) return;
    const { x, z, y } = this.buildTarget();
    const error = placementError(
      BLUEPRINTS[this.buildKind],
      x,
      z,
      this.player.yaw,
      this.world,
      this.state.world.structures,
    );
    const affordable = this.buildMenu.affordable(this.state.inventory, this.buildKind);
    this.placed.showGhost(this.buildKind, x, y, z, this.player.yaw, error === null && affordable);
  }

  private placeStructure(): void {
    const blueprint = BLUEPRINTS[this.buildKind];
    const inv = this.state.inventory;
    if (!this.buildMenu.affordable(inv, this.buildKind)) {
      this.toasts.push('Не хватает материалов', 'bad');
      return;
    }

    const { x, z, y } = this.buildTarget();
    const error = placementError(blueprint, x, z, this.player.yaw, this.world, this.state.world.structures);
    if (error) {
      this.toasts.push(error, 'bad');
      return;
    }

    removeItem(inv, 'log', blueprint.logs);
    removeItem(inv, 'stone', blueprint.stones);
    if (blueprint.saplings) removeItem(inv, 'vine_sapling', blueprint.saplings);

    const structure: PlacedStructure = {
      id: this.state.world.nextStructureId++,
      kind: this.buildKind,
      x,
      z,
      y,
      rot: this.player.yaw,
      builtDay: this.clock.day,
    };
    if (this.buildKind === 'chest') structure.storage = Array.from({ length: CHEST_SLOTS }, () => null);
    if (this.buildKind === 'cellar') structure.barrels = [];
    if (this.buildKind === 'press') structure.juice = 0;
    if (this.buildKind === 'vine') structure.pickedDay = null;
    this.state.world.structures.push(structure);
    this.registerStructureCollider(structure);

    this.audio.chop();
    this.toasts.push(`Построено: ${blueprint.name}`);
    this.buildMenu.render(inv);
  }

  private registerStructureCollider(structure: PlacedStructure): void {
    const collider = structureCollider(structure);
    if (collider) this.world.boxes.push(collider);
  }


  private grapesFromVine(): number {
    return WINE.minBunches + Math.floor(this.rng() * (WINE.maxBunches - WINE.minBunches + 1));
  }

  private pickWildGrapes(index: number): void {
    if (!vineReady(this.state, index, this.clock.day, WINE.vineRegrowDays)) return;
    const count = this.grapesFromVine();
    const left = addItem(this.state.inventory, 'grape', count);
    if (left >= count) {
      this.toasts.push('В рюкзаке нет места', 'bad');
      return;
    }
    this.state.world.vines.set(index, this.clock.day);
    this.wildVines[index]?.setGrapes(false);
    this.audio.pickup();
    this.toasts.push(`Грозди: +${count - left}`);
  }

  /** Постройки под E: сундук, давильня, погреб и своя лоза. */
  private useStructure(id: number): void {
    const structure = Interactions.structureById(this.state, id);
    if (!structure) return;
    switch (structure.kind) {
      case 'chest':
        this.openChest(id);
        break;
      case 'press':
        this.treadGrapes(structure);
        break;
      case 'cellar':
        this.openCellar(structure);
        break;
      case 'vine':
        this.pickPlantedGrapes(structure);
        break;
      default:
        break;
    }
  }

  private pickPlantedGrapes(structure: PlacedStructure): void {
    if (!plantedVineReady(structure, this.clock.day, WINE.saplingGrowDays, WINE.vineRegrowDays)) {
      this.toasts.push('Лоза ещё не поспела', 'bad');
      return;
    }
    const count = this.grapesFromVine() + 1;
    const left = addItem(this.state.inventory, 'grape', count);
    if (left >= count) {
      this.toasts.push('В рюкзаке нет места', 'bad');
      return;
    }
    structure.pickedDay = this.clock.day;
    this.plantedVines.get(structure.id)?.setGrapes(false);
    this.audio.pickup();
    this.toasts.push(`Грозди: +${count - left}`);
  }

  /** Топчем виноград: за раз уходит несколько гроздей и выходит сусло. */
  private treadGrapes(structure: PlacedStructure): void {
    if (this.pressing > 0) return;
    const inv = this.state.inventory;
    if (countItem(inv, 'grape') < WINE.grapesPerMust) {
      this.toasts.push(`Нужно ${WINE.grapesPerMust} гроздей`, 'bad');
      return;
    }
    removeItem(inv, 'grape', WINE.grapesPerMust);
    this.pressing = WINE.pressTime;
    structure.juice = (structure.juice ?? 0) + 1;
    window.setTimeout(() => {
      if (addItem(inv, 'must', 1) > 0) this.toasts.push('Сусло некуда налить', 'bad');
      else this.toasts.push('Сусло: +1');
      this.audio.splash(0.4);
    }, WINE.pressTime * 1000);
  }

  private cellarDialog(structure: PlacedStructure): DialogSpec {
    const day = this.clock.day;
    const barrels = structure.barrels ?? [];
    const inv = this.state.inventory;
    const actions = [];

    actions.push({
      id: 'fill',
      label: `Залить бочку (сусло ${WINE.mustPerBarrel})`,
      note: `${countItem(inv, 'must')}/${WINE.mustPerBarrel}`,
      disabled: countItem(inv, 'must') < WINE.mustPerBarrel,
    });

    barrels.forEach((barrel, index) => {
      const grade = wineGrade(barrel.startedDay, day);
      const wait = daysToNextGrade(barrel.startedDay, day);
      const bottles = countItem(inv, 'bottle_empty');
      actions.push({
        id: `bottle-${index}`,
        label: grade
          ? `Разлить: ${GRADE_LABEL[grade]} (${barrel.amount} бут.)`
          : `Бочка бродит, ещё ${wait} сут.`,
        note: grade ? `нужно бутылок: ${barrel.amount} (есть ${bottles})` : '',
        disabled: !grade || bottles < barrel.amount,
      });
    });

    actions.push({ id: 'leave', label: 'Отойти' });

    const speech = barrels.length
      ? 'В бочках что-то тихо булькает.'
      : 'Пустые бочки ждут сусла. Виноград сам себя не оттопчет.';
    return { title: 'Винный погреб', speech, actions, footer: `Бочек занято: ${barrels.length}` };
  }

  private openCellar(structure: PlacedStructure): void {
    const spec = (): DialogSpec => this.cellarDialog(structure);
    this.openDialog(spec, (id) => {
      const inv = this.state.inventory;
      if (id === 'fill') {
        if (countItem(inv, 'must') < WINE.mustPerBarrel) return false;
        removeItem(inv, 'must', WINE.mustPerBarrel);
        structure.barrels = structure.barrels ?? [];
        structure.barrels.push({ amount: WINE.bottlesPerBarrel, startedDay: this.clock.day });
        this.toasts.push('Сусло в бочке. Теперь ждать');
        this.audio.stoke();
        return false;
      }
      if (id.startsWith('bottle-')) {
        const index = Number(id.slice(7));
        const barrel = structure.barrels?.[index];
        if (!barrel) return false;
        const grade = wineGrade(barrel.startedDay, this.clock.day);
        if (!grade) return false;
        if (countItem(inv, 'bottle_empty') < barrel.amount) return false;
        removeItem(inv, 'bottle_empty', barrel.amount);
        const left = addItem(inv, wineItem(grade), barrel.amount);
        structure.barrels!.splice(index, 1);
        this.toasts.push(`Разлито: ${GRADE_LABEL[grade]} × ${barrel.amount - left}`, 'money');
        this.audio.coins();
        return false;
      }
      return id === 'leave';
    });
  }

  /** Держит в согласии посаженные лозы и их модели. */
  private syncVines(): void {
    const day = this.clock.day;
    const alive = new Set<number>();
    for (const s of this.state.world.structures) {
      if (s.kind !== 'vine') continue;
      alive.add(s.id);
      let handle = this.plantedVines.get(s.id);
      if (!handle) {
        handle = buildVine(s.x, s.y, s.z, s.rot, 0.9);
        this.scene.add(handle.group);
        this.plantedVines.set(s.id, handle);
      }
      handle.setGrapes(plantedVineReady(s, day, WINE.saplingGrowDays, WINE.vineRegrowDays));
    }
    for (const [id, handle] of this.plantedVines) {
      if (alive.has(id)) continue;
      this.scene.remove(handle.group);
      this.plantedVines.delete(id);
    }
    this.wildVines.forEach((vine, index) => {
      vine.setGrapes(vineReady(this.state, index, day, WINE.vineRegrowDays));
    });
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
      { 1: true, 2: true, 3: inv.hasShotgun, 4: inv.hasRod, 5: inv.hasFlashlight, 6: inv.hasHammer },
      {
        1: String(countItem(inv, 'cigarettes')),
        3: inv.hasShotgun ? `${this.shotgun.loaded}/${countItem(inv, 'shells')}` : '',
        4: '',
        5: '',
        6: '',
      },
    );
    this.hud.setHealth(this.player.health / PLAYER.maxHealth, this.hurtFlash, this.dying);

    if (this.target?.name && this.target.labelPoint) {
      this.nameplate.show(this.target.name, this.target.labelPoint, this.camera);
    } else {
      this.nameplate.hide();
    }
  }
}
