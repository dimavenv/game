import * as THREE from 'three';
import {
  APPLES,
  CAMPFIRE,
  CHOP,
  GORGE,
  ECONOMY,
  ANIMALS,
  AVI,
  MOUNTAIN,
  RIVER,
  SWING,
  BRIDGE,
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
  ZOMBIE,
} from '../shared/balance';
import {
  ANIMAL_NAME,
  damageAnimal,
  findAnimalTarget,
  findCarcass,
  shotAnimals,
  spawnAnimals,
  stepAnimals,
  type Animal,
} from '../shared/animals';
import { fishItemId, fishLabel, rollFish } from '../shared/fishing';
import { GRADE_LABEL, daysToNextGrade, wineGrade, wineItem } from '../shared/wine';
import { aviSpot, nightJobText, type AviSpot } from '../shared/avi';
import {
  DRUGS,
  DRUG_BY_ITEM,
  drugBreath,
  drugBreathFree,
  drugDamage,
  drugDefersPain,
  drugFov,
  drugIncoming,
  drugMuffle,
  drugSpeed,
} from '../shared/drugs';
import { ITEMS, type ItemId } from '../shared/items';
import {
  BLUEPRINTS,
  CHEST_SLOTS,
  placementError,
  snapPier,
  structureCollider,
  structurePlatform,
  type BlueprintId,
  type PlacedStructure,
} from '../shared/world/building';
import {
  addItem,
  countItem,
  insulation,
  isOverloaded,
  removeItem,
  type ItemStack,
} from '../shared/inventory';
import { CRAFT, SEASONS, SURVIVAL } from '../shared/balance';
import {
  SEASON_NAME,
  SEASON_ORDER,
  autumnAmount,
  chill,
  lakeFrozen,
  seasonOf,
  seasonTint,
  snowAmount,
  temperature,
} from '../shared/season';
import { createPlayerState, stepPlayer, type PlayerState } from '../shared/movement';
import { questProgress } from '../shared/quests';
import { clamp, mulberry32, smoothstep } from '../shared/rng';
import {
  applesReady,
  createGameState,
  isBlessed,
  isTreeDown,
  plantedVineReady,
  vineReady,
  type GameState,
} from '../shared/state';
import { advanceClock, createClock, isDark } from '../shared/time';
import {
  damageZombie,
  findMeleeTarget,
  shotgunTargets,
  spawnCaveZombies,
  spawnZombies,
  stepZombies,
  zombieCount,
  type Zombie,
} from '../shared/zombies';
import { campfirePosition, platformNear } from '../shared/world/buildings';
import { Terrain } from '../shared/world/terrain';
import { generateWorld, type WorldData } from '../shared/world/worldgen';
import type { Actor } from '../shared/actors';
import {
  POSE,
  type AnimalWire,
  type WorldAction,
  type WorldSnapshot,
  type ZombieWire,
} from '../shared/net/protocol';
import { NetClient, serverUrl } from './net/client';
import { RemotePlayers } from './render/players';
import { GameAudio } from './audio/audio';
import { aviAction, aviDialog, buravchikAction, buravchikDialog, tomerAction, tomerDialog } from './dialogs';
import { Input } from './input';
import { AxeItem } from './items/axe';
import { HammerItem } from './items/hammer';
import { KnifeItem } from './items/knife';
import { Binoculars } from './items/binoculars';
import { StompScene } from './items/stomp';
import { Meal } from './items/meal';
import { CigaretteItem } from './items/cigarette';
import { DrugKit } from './items/drugkit';
import { RodItem } from './items/rod';
import { ShotgunItem } from './items/shotgun';
import { applyPersonal, clearSave, loadGame, personalBlob, saveGame } from './save';
import { Interactions, type InteractionPoints, type Target } from './interaction';
import { createNpc, type NpcHandle } from './render/characters';
import { Forest, TREE_HEIGHT } from './render/forest';
import { GroundCover } from './render/groundcover';
import { buildAppleTree, buildMonument, ChopEffects, type AppleTreeHandle } from './render/nature';
import { PLACED_MATERIALS, PRESS_FLOOR, PlacedStructures } from './render/placed';
import { buildCave } from './render/caves';
import { Thrushes } from './render/thrushes';
import { buildGorgePhoto } from './render/photo';
import { MapScreen, type Landmark, type MapFlag } from './ui/map';
import { insideCave } from '../shared/world/caves';
import { CORRIDOR, insideGorge, nearestGorgeAxis } from '../shared/world/gorge';
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
import { buildCatamaran, type CatamaranBuild } from './render/catamaran';
import { AnimalsView } from './render/animals';
import { SeasonLook } from './render/season';
import { buildBridge } from './render/bridge';
import { buildGazebo, buildSwing, type GazeboBuild, type SwingBuild } from './render/mountain';
import { RopeSwing } from './ropeswing';
import { buildTerrainMesh } from './render/terrainMesh';
import { PostFx } from './postfx';
import { currentQuality } from './quality';
import { ZombieView } from './render/zombies';
import { buildLake, buildRiver, type WaterSurface } from './render/water';
import { BuildMenu } from './ui/buildMenu';
import { Dialog, type DialogSpec } from './ui/dialog';
import { InventoryScreen } from './ui/inventory';
import { Hud } from './ui/hud';
import { ChatInput, Nameplate, PlayerTags, Toasts } from './ui/labels';
import { CheatMenu, type CheatApi, type FlagKey, type ToolKey } from './ui/cheats';

const FIXED_DT = 1 / 60;
const MOUSE_SENSITIVITY = 0.0022;
const BASE_FOV = 75;
/** Через сколько метров ставится следующий шаг. */
const STEP_LENGTH = 1.75;
/** Высота глаз, когда игрок сидит в кресле. */
const SEAT_EYE = 1.12;

type Slot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

/**
 * Свой номер в списке действующих лиц. В одиночной игре он единственный, в
 * сети сервер выдаёт настоящий id, но урон себе мы всё равно ищем по этому.
 */
const SELF_ID = 0;

/** Подпись быстрой ячейки: иконка и остаток. */
function quickLabel(stack: ItemStack | null): string {
  if (!stack) return '—';
  return `${ITEMS[stack.id].icon} ${stack.count}`;
}

/**
 * Слепок постройки для сверки с сервером. Догорающие секунды выброшены: они
 * убывают сами у всех, и гонять их по сети было бы бессмысленным трафиком.
 */
function structureEcho(structure: PlacedStructure): string {
  return JSON.stringify(structure, (key, value) =>
    key === 'fuel' || key === 'timer' ? undefined : (value as unknown),
  );
}

/** Точка телепорта из чит-меню: где встать и куда смотреть. */
interface CheatSpot {
  id: string;
  label: string;
  x: number;
  z: number;
  look?: { x: number; z: number };
}

/** Долгое действие на месте: разделка, сушка, готовка. */
interface Chore {
  label: string;
  time: number;
  total: number;
  /** Что подать голосом, пока дело идёт, и как часто. */
  loop?: { play: () => void; every: number };
  next?: number;
  done: () => void;
}

/** Куда игрок сел: кресло в хижине или сиденье катамарана. */
interface SeatSpot {
  x: number;
  y: number;
  z: number;
  /** У печки время идёт быстрее и раны затягиваются. */
  stove: boolean;
}

export class Game {
  private readonly quality = currentQuality();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly post: PostFx | null = null;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly input: Input;
  private readonly audio = new GameAudio();
  private readonly hud = new Hud();
  private readonly dialog = new Dialog();
  private readonly nameplate = new Nameplate();
  private readonly playerTags = new PlayerTags();
  private readonly chat = new ChatInput();
  private readonly toasts = new Toasts();

  private readonly sky: Sky;
  private readonly water: WaterSurface;
  private readonly river: WaterSurface;
  private readonly forest: Forest;
  private readonly cover: GroundCover;
  private readonly smoke: Smoke;
  private readonly hut: HutBuild;
  private readonly stall: StallBuild;
  private readonly campfire: CampfireBuild;
  private readonly catamaran: CatamaranBuild;
  private readonly gazebo: GazeboBuild;
  private readonly animals: Animal[];
  private readonly animalsView: AnimalsView;
  private readonly thrushes: Thrushes;
  private readonly mapScreen = new MapScreen();
  /** Считает ли игрок дроздов прямо сейчас и был ли он в щели в прошлом кадре. */
  private counting = false;
  private inGorge = false;
  private thrushVoice = 2;
  /** Насколько темно вокруг: 1 — глубоко в пещере. */
  private caveDark = 0;
  private animalVoiceTimer = 3;
  private readonly swingRig: SwingBuild;
  private readonly ropeSwing: RopeSwing;
  private readonly chopEffects = new ChopEffects();
  private readonly season = new SeasonLook();
  private readonly appleTrees: AppleTreeHandle[] = [];
  private readonly npcs: { buravchik: NpcHandle; tomer: NpcHandle; avi: NpcHandle; petrovna: NpcHandle };
  private readonly aviLantern: THREE.PointLight;
  private aviHere: AviSpot | null = null;
  private readonly flashlight: THREE.SpotLight;

  private readonly cigarette: CigaretteItem;
  private readonly axe: AxeItem;
  private readonly rod: RodItem;
  private readonly shotgun: ShotgunItem;
  private readonly hammer: HammerItem;
  private readonly knife: KnifeItem;
  private readonly binoculars: Binoculars;
  private readonly stomp: StompScene;
  private readonly meal: Meal;
  private readonly drugKit: DrugKit;
  private readonly placed = new PlacedStructures();
  private readonly inventoryScreen = new InventoryScreen();
  private readonly buildMenu = new BuildMenu();
  private buildKind: BlueprintId = 'palisade';
  private buildMode = false;
  private readonly rockPoints: THREE.Vector3[] = [];
  private readonly wildVines: VineHandle[] = [];
  private readonly plantedVines = new Map<number, VineHandle>();
  private readonly zombieView = new ZombieView(44);
  /** Сеть: null — играем в одиночку, как и раньше. */
  private readonly net: NetClient | null;
  private readonly remotes = new RemotePlayers();
  /** Кого видят звери и мертвецы: я и все, кто рядом в лесу. */
  private readonly actorList: Actor[] = [{ id: SELF_ID, x: 0, z: 0, yaw: 0 }];
  private zombies: Zombie[] = [];
  private nextZombieId = 0;
  /** В какие сутки будили обитателей каждой пещеры. */
  private readonly caveZombieDay = new Map<number, number>();
  /** Слепки построек: по ним видно, что изменилось и что пора разослать. */
  private readonly structureEcho = new Map<number, string>();
  private structureSyncTimer = 0;

  private readonly world: WorldData;
  private readonly player: PlayerState;
  private readonly clock = createClock();
  private readonly state: GameState;
  private readonly interactions: Interactions;
  /** Ссылка на точки взаимодействия: у Ави она меняется каждую ночь. */
  private readonly interactionPoints: InteractionPoints;
  private readonly rng = mulberry32(Date.now() >>> 0);

  private accumulator = 0;
  private last = 0;
  private running = false;
  private elapsed = 0;
  private nextStepAt = STEP_LENGTH;
  private breathSoundTimer = 0;
  private bob = 0;
  private slot: Slot = 1;
  private seat: SeatSpot | null = null;
  /** В каком чане сейчас топчут виноград. */
  private stompingAt: PlacedStructure | null = null;
  private chore: Chore | null = null;
  private readonly cheatMenu = new CheatMenu();
  /** Читы: работают только после пароля в главном меню. */
  private readonly cheats = { god: false, noNeeds: false, infiniteBreath: false };
  private target: Target | null = null;
  private dying = false;
  private deathTimer = 0;
  private hurtFlash = 0;
  private bandaging = 0;
  private groanTimer = 0;
  private saveTimer = 0;
  /** После воскрешения игрок какое-то время неуязвим: иначе смерть по кругу. */
  private graceTimer = 0;
  private wasDark = false;
  private signSeen = false;
  /** Диалог закрыт, ждём клика: браузер не даёт вернуть захват мыши сразу после Esc. */
  private pendingLock = false;
  private readonly swingExit = new THREE.Vector3();
  private readonly offerings: { position: THREE.Vector3; timer: number; wisp: number }[] = [];
  private readonly wind = new THREE.Vector3();
  private readonly raycaster = new THREE.Raycaster();
  private readonly screenCenter = new THREE.Vector2(0, 0);

  onPause: (() => void) | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const q = this.quality;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      // Сглаживание при постобработке делает буфер, а не холст.
      antialias: q.samples === 0,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, q.pixelRatio));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = q.shadowMap >= 2048 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.camera = new THREE.PerspectiveCamera(BASE_FOV, 1, 0.05, q.far);
    this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);

    this.world = generateWorld(WORLD_SEED);
    this.player = createPlayerState(this.world);
    this.state = createGameState(this.world.appleTrees.length);

    this.sky = new Sky(this.scene, q);
    this.scene.add(buildTerrainMesh(this.world.terrain, this.world.seed, q.terrainSegments));

    this.forest = new Forest(this.world, q);
    this.scene.add(this.forest.group);
    this.cover = new GroundCover(this.world, q);
    this.scene.add(this.cover.group);
    this.scene.add(this.chopEffects.group);

    this.water = buildLake(q);
    this.river = buildRiver();
    this.scene.add(this.water.mesh, this.river.mesh);

    const terrain = this.world.terrain;
    // Табличка у озера, табличка на вершине Петушка и табличка у Псекупса.
    this.scene.add(
      buildSign(['КРУГЛОЕ', 'ОЗЕРО'], WORLD.sign.x, terrain.height(WORLD.sign.x, WORLD.sign.z), WORLD.sign.z, Math.PI + 0.05),
    );
    const mountainSignX = MOUNTAIN.x + MOUNTAIN.sign.dx;
    const mountainSignZ = MOUNTAIN.z + MOUNTAIN.sign.dz;
    this.scene.add(
      buildSign(
        ['ГОРА', 'ПЕТУШОК'],
        mountainSignX,
        terrain.height(mountainSignX, mountainSignZ),
        mountainSignZ,
        Math.atan2(MOUNTAIN.sign.dx, MOUNTAIN.sign.dz),
      ),
    );
    this.scene.add(
      buildSign(
        ['РЕКА', 'ПСЕКУПС'],
        RIVER.sign.x,
        terrain.height(RIVER.sign.x, RIVER.sign.z),
        RIVER.sign.z,
        Math.atan2(MOUNTAIN.x - RIVER.sign.x, MOUNTAIN.z - RIVER.sign.z),
      ),
    );

    // Табличка у входа в Дантово ущелье.
    this.scene.add(
      buildSign(
        ['ДАНТОВО', 'УЩЕЛЬЕ'],
        GORGE.sign.x,
        terrain.height(GORGE.sign.x, GORGE.sign.z),
        GORGE.sign.z,
        Math.atan2(GORGE.path[0][0] - GORGE.sign.x, GORGE.path[0][1] - GORGE.sign.z),
      ),
    );

    this.scene.add(buildBridge(terrain));

    // Пещеры: по одной склейке на каждую, всё остальное — рельеф и стены.
    for (const cave of this.world.caves) this.scene.add(buildCave(cave));

    // Фотография на стене щели: сам снимок лежит файлом в public/photos.
    this.scene.add(buildGorgePhoto(terrain));

    // Дрозды живут только в ущелье, поэтому их немного и они всегда там.
    this.thrushes = new Thrushes(terrain);
    this.scene.add(this.thrushes.group);

    // Звери заводятся один раз на партию и дальше живут сами.
    this.animals = spawnAnimals(this.rng, this.world);
    this.animalsView = new AnimalsView(this.animals);
    this.scene.add(this.animalsView.group);

    this.catamaran = buildCatamaran(this.world.catamaran);
    this.gazebo = buildGazebo(terrain);
    this.swingRig = buildSwing(terrain);
    this.scene.add(this.catamaran.group, this.gazebo.group, this.swingRig.group);

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
      buravchik: createNpc('buravchik', chair.x, this.world.hut.floorY, chair.z, Math.PI * 1.1),
      tomer: createNpc(
        'tomer',
        this.world.stall.keeper.x,
        this.world.terrain.height(this.world.stall.keeper.x, this.world.stall.keeper.z),
        this.world.stall.keeper.z,
        Math.PI,
      ),
      avi: createNpc('avi', 0, -999, 0, 0),
      // Петровна сидит на катамаране и никуда оттуда не собирается.
      petrovna: createNpc(
        'petrovna',
        this.world.catamaran.petrovna.x,
        this.world.catamaran.petrovna.y,
        this.world.catamaran.petrovna.z,
        this.world.catamaran.yaw,
      ),
    };
    this.npcs.avi.group.visible = false;
    this.scene.add(
      this.npcs.buravchik.group,
      this.npcs.tomer.group,
      this.npcs.avi.group,
      this.npcs.petrovna.group,
    );

    // Фонарь Ави: единственный огонёк в лесу ночью.
    this.aviLantern = new THREE.PointLight(0xffc46a, 0, 18, 2);
    this.aviLantern.visible = false;
    this.scene.add(this.aviLantern);

    this.smoke = new Smoke();
    this.scene.add(this.smoke.points);
    this.ropeSwing = new RopeSwing(this.swingRig, this.audio, this.smoke);

    this.cigarette = new CigaretteItem(this.camera, this.smoke, this.audio, this.state.inventory);
    this.axe = new AxeItem(this.camera);
    this.rod = new RodItem(this.camera, this.scene, this.audio, this.rng);
    this.shotgun = new ShotgunItem(this.camera);
    this.hammer = new HammerItem(this.camera);
    this.knife = new KnifeItem(this.camera);
    this.binoculars = new Binoculars(this.camera);
    this.stomp = new StompScene(this.camera);
    this.meal = new Meal(this.camera);
    this.drugKit = new DrugKit(this.camera, this.audio, this.smoke);
    this.scene.add(this.zombieView.group);
    this.scene.add(this.placed.group);
    for (const rock of this.world.rocks) this.rockPoints.push(new THREE.Vector3(rock.x, rock.y, rock.z));

    // Прошлая партия, если она была.
    loadGame(this.state, this.clock, this.player);
    this.player.eyeY = this.world.terrain.height(this.player.x, this.player.z) + PLAYER.eyeHeight;
    this.restoreWorldVisuals();

    this.flashlight = new THREE.SpotLight(0xfff2d8, 0, 46, 0.42, 0.82, 1.15);
    this.flashlight.position.set(0.12, -0.06, 0);
    this.flashlight.target.position.set(0, -0.05, -1);
    this.camera.add(this.flashlight, this.flashlight.target);

    const seat = this.world.hut.chairs[1];
    const board = this.world.catamaran.board;
    this.interactionPoints = {
      buravchik: this.npcs.buravchik.labelPoint,
      tomer: this.npcs.tomer.labelPoint,
      monument: monument.position,
      stove: this.hut.stovePosition,
      chair: new THREE.Vector3(seat.x, this.world.hut.floorY, seat.z),
      catamaran: new THREE.Vector3(board.x, WORLD.waterLevel, board.z),
      // Целиться надо в лавку, а не в центр беседки.
      gazebo: this.gazebo.seat,
      petrovna: this.npcs.petrovna.labelPoint,
      swing: this.ropeSwing.grabPoint(new THREE.Vector3()),
      appleTrees: this.appleTrees.map((t) => t.position),
      pebbles: this.world.pebbles.map((p) => new THREE.Vector3(p.x, p.y, p.z)),
      vines: this.wildVines.map((v) => v.position),
      avi: null,
    };
    this.interactions = new Interactions(this.world, this.interactionPoints, () => this.breathMax());

    this.inventoryScreen.setUseHandler((id) => this.consumeItem(id));

    this.input = new Input(canvas);
    this.input.onLockChange = (locked) => {
      if (locked) {
        this.pendingLock = false;
        this.hud.setResume(false);
        this.running = true;
        this.hud.setVisible(true);
        this.input.endFrame();
        this.last = performance.now();
        return;
      }
      this.running = false;
      // Выход из захвата ради диалога, рюкзака или ожидания клика — не пауза.
      if (
        this.dialog.isOpen ||
        this.inventoryScreen.isOpen ||
        this.cheatMenu.isOpen ||
        this.mapScreen.isOpen ||
        this.pendingLock
      ) {
        return;
      }
      this.hud.setVisible(false);
      this.onPause?.();
    };

    // Esc отпускает мышь, и браузер какое-то время не отдаёт захват обратно.
    // Поэтому после закрытия панели просто ждём клика.
    document.addEventListener('pointerlockerror', () => {
      if (this.pendingLock) this.hud.setResume(true);
    });
    window.addEventListener('mousedown', () => {
      if (
        !this.pendingLock ||
        this.dialog.isOpen ||
        this.inventoryScreen.isOpen ||
        this.cheatMenu.isOpen ||
        this.mapScreen.isOpen
      ) {
        return;
      }
      this.input.requestLock();
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Backquote' && CheatMenu.unlocked && !this.dialog.isOpen) {
        e.preventDefault();
        this.openCheats();
      }
      if ((e.code === 'Escape' || e.code === 'KeyM') && this.mapScreen.isOpen) {
        e.preventDefault();
        this.mapScreen.close();
      } else if (e.code === 'KeyM' && this.running && !this.dialog.isOpen && !this.inventoryScreen.isOpen) {
        e.preventDefault();
        this.openMap();
      }
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && this.net && !this.chat.isOpen) {
        if (this.running && !this.dialog.isOpen && !this.inventoryScreen.isOpen && !this.mapScreen.isOpen) {
          e.preventDefault();
          document.exitPointerLock();
          this.chat.open((text) => {
            this.net?.sendChat(text);
            this.toasts.push(`ты: ${text}`, 'money');
            this.input.requestLock();
          });
        }
      }
      if (e.code === 'Escape' && this.cheatMenu.isOpen) this.cheatMenu.close();
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
      const w = window as unknown as {
        game: Game;
        __step: typeof stepPlayer;
        __insideCave: typeof insideCave;
        __gorgeAxis: typeof nearestGorgeAxis;
        __corridor: number;
      };
      w.game = this;
      // Шаг симуляции и геометрия пещер с ущельем — для отладочных прогонов.
      w.__step = stepPlayer;
      w.__insideCave = insideCave;
      w.__gorgeAxis = nearestGorgeAxis;
      w.__corridor = CORRIDOR;
    }

    // Все обычные материалы сцены получают сезонный оттенок и снег.
    this.season.attachAll(this.scene);
    // Постройки появляются позже, поэтому их материалы подключаем вручную.
    for (const m of PLACED_MATERIALS) this.season.attach(m);

    // Постобработка нужна только там, где есть что подсвечивать.
    if (q.bloom > 0 || q.samples > 0) {
      this.post = new PostFx(this.renderer, this.scene, this.camera, q);
    }

    // Чужие фигуры добавляем всегда: пустая группа ничего не стоит.
    this.scene.add(this.remotes.group);
    const url = serverUrl();
    // Подключаемся не здесь, а при входе в игру: в меню ещё вводят имя.
    this.net = url ? new NetClient(url) : null;

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.syncCamera(0);
    this.cover.update(0, this.player.x, this.player.z);
    this.sky.update(this.clock.t, 0, this.camera);
    this.draw();
    requestAnimationFrame((t) => this.frame(t));
  }

  /**
   * pointerLock=false нужен только для отладки и снятия скриншотов
   * (?nolock): мир живёт, мышь не захватывается.
   */
  async start(pointerLock = true): Promise<void> {
    await this.audio.start();
    if (this.net && !this.net.online) this.connect(this.net);
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
    this.post?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private draw(): void {
    if (this.post) this.post.render();
    else this.renderer.render(this.scene, this.camera);
  }

  private breathMax(): number {
    const penalty = Math.min(
      this.cigarette.smokedToday * PLAYER.breathPenaltyPerCig,
      PLAYER.breathPenaltyCap,
    );
    return PLAYER.breathMax * (1 - penalty) * drugBreath(this.state.effects, this.clock.day);
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
    this.drugKit.update(dt);
    if (this.axe.update(dt)) this.applyAxeHit();
    if (this.hammer.update(dt)) this.applyHammerHit();
    this.knife.update(dt);
    this.binoculars.update(dt, this.slot === 8 && this.input.isMouseDown());
    if (this.stomp.update(dt)) this.finishStomp();
    this.meal.update(dt);
    if (this.shotgun.update(dt) === 'reload-done') this.finishReload();
    if (this.bandaging > 0) this.bandaging -= dt;
    if (this.graceTimer > 0) this.graceTimer -= dt;
    if (this.hurtFlash > 0) this.hurtFlash = Math.max(0, this.hurtFlash - dt * 1.6);
    this.handleRod(dt);
    this.syncCamera(dt);
    this.updateWorld(dt);
    this.updateHud();
    this.draw();
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

    if (this.seat && (forward !== 0 || strafe !== 0)) this.seat = null;

    if (!this.seat && !this.ropeSwing.active && !this.chore && !this.stomp.active) {
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
            noBreathDrain: drugBreathFree(this.state.effects) || this.cheats.infiniteBreath,
            weak: this.player.hunger <= SURVIVAL.weakAt || this.player.thirst <= SURVIVAL.weakAt,
            dt: FIXED_DT,
            slowFactor: this.cigarette.speedMul * drugSpeed(this.state.effects, this.clock.day),
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

    this.updateSwing(dt);
    this.updateChore(dt);

    let target = this.interactions.find(this.player, this.state, this.clock.day);
    // Туша и вода живут вне статичных точек мира, их ищем отдельно.
    const extra = this.carcassTarget() ?? this.campfireTarget() ?? this.waterSpot();
    if (extra && (!target || extra.priority > target.priority)) target = extra;
    this.target = target;
    if (this.input.wasPressed('KeyE')) this.interact();

    const previousDay = this.clock.day;
    const atStove = this.seat?.stove === true;
    // Время у кресла бежит быстрее только в одиночной игре: в сети сутки идут
    // на сервере, и перематывать их одному за двоих нельзя.
    const scale = atStove && this.state.world.stoveFuel > 0 && !this.net?.online ? TIME.stoveTimeScale : 1;
    advanceClock(this.clock, dt, scale);
    if (this.clock.day !== previousDay) this.newDay();
    this.nightCycle();
    this.updateZombies(dt);

    // У горящей печки раны затягиваются сами.
    if (atStove && this.state.world.stoveFuel > 0 && this.player.health < PLAYER.maxHealth) {
      this.player.health = Math.min(PLAYER.maxHealth, this.player.health + HEALTH.stoveRegen * dt * scale);
    }

    this.updateAnimals(dt);
    this.updateGorge(dt);
    this.updateCaveLight(dt);
    this.updateFilters(dt * scale);
    this.updateCampfires(dt * scale);
    this.updateSurvival(dt * scale);
    this.updateDrugs(dt);
    this.updateAviAudio();

    // Сеть: переподключение, чужие фигуры, своя поза и общие постройки.
    this.net?.update(dt);
    this.remotes.update(dt);
    this.sendPose(dt);
    this.syncStructures(dt);

    this.saveTimer -= dt;
    if (this.saveTimer <= 0) {
      this.saveTimer = 12;
      saveGame(this.state, this.clock, this.player);
      // На сервере личный прогресс хранится там же, где мир: заходи откуда хочешь.
      this.net?.sendProgress(personalBlob(this.state, this.player));
    }

    // Печь прогорает по игровому времени: у кресла дрова уходят быстрее.
    if (this.state.world.stoveFuel > 0) {
      this.state.world.stoveFuel = Math.max(0, this.state.world.stoveFuel - dt * scale);
    }

    this.breathing(dt);
  }

  private handleSlots(): void {
    const inv = this.state.inventory;
    // Пока руки заняты дозой, всё остальное убрано и не переключается.
    if (this.state.effects.using) {
      this.cigarette.setHidden(true);
      this.axe.setVisible(false);
      this.rod.setVisible(false);
      this.shotgun.setVisible(false);
      this.hammer.setVisible(false);
      this.knife.setVisible(false);
      this.binoculars.setVisible(false);
      this.flashlight.intensity = 0;
      return;
    }
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
    if (this.input.wasPressed('Digit7')) pick(7, inv.hasKnife, 'Ножа нет — у Томера 120 ₪');
    if (this.input.wasPressed('Digit8')) pick(8, inv.hasBinoculars, 'Бинокля нет — его дают за дроздов');
    if (this.input.wasPressed('Tab')) this.openBackpack();
    if (this.input.wasPressed('KeyB')) this.toggleBuildMode();
    if (this.input.wasPressed('KeyR') && this.slot === 3) this.reloadShotgun();
    if (this.input.wasPressed('KeyQ')) this.useBandage();
    if (this.input.wasPressed('KeyF')) this.eatFromSlot();
    if (this.input.wasPressed('KeyG')) this.drinkFromSlot();

    this.cigarette.setHidden(this.slot !== 1);
    this.axe.setVisible(this.slot === 2);
    this.rod.setVisible(this.slot === 4);
    this.shotgun.setVisible(this.slot === 3 && inv.hasShotgun);
    this.hammer.setVisible(this.slot === 6 && inv.hasHammer);
    this.knife.setVisible(this.slot === 7 && inv.hasKnife);
    this.binoculars.setVisible(this.slot === 8 && inv.hasBinoculars);
    if (this.buildMode && this.slot !== 6) this.setBuildMode(false);
    this.flashlight.intensity = this.slot === 5 && inv.hasFlashlight ? 10 : 0;
  }

  /** ЛКМ: у каждого предмета своё действие. */
  private useItem(): void {
    if (this.dying || this.state.effects.using || this.ropeSwing.active) return;
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
    // Сквозь лёд не закинешь.
    if (this.world.terrain.frozen) return null;
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

  /**
   * Урон мертвецу. В сети стая живёт на сервере, поэтому туда уходит только
   * заявка: кто и сколько ударил. Трофей вернётся отдельным сообщением —
   * иначе двое, добившие одного, получили бы по зачёту каждый.
   */
  private hitZombie(zombie: Zombie, damage: number, stagger = true): void {
    if (this.net?.online) {
      this.net.sendHit({ t: 'zombie', id: zombie.id, damage, stagger });
      // Отшатывание рисуем сразу: иначе удар кажется не попавшим.
      if (stagger) zombie.stagger = 0.2;
      return;
    }
    if (damageZombie(zombie, damage, stagger)) this.onZombieKilled();
  }

  /** То же для зверя. */
  private hitAnimal(animal: Animal, damage: number): void {
    if (this.net?.online) {
      this.net.sendHit({ t: 'animal', id: animal.id, damage });
      return;
    }
    if (damageAnimal(animal, damage)) this.harvest(animal);
  }

  /** Топор бьёт в середине замаха: сперва проверяем зомби, потом ствол. */
  private applyAxeHit(): void {
    const base = this.state.inventory.hasGoodAxe ? WEAPONS.axe.goodDamage : WEAPONS.axe.damage;
    const damage = base * drugDamage(this.state.effects);
    const victim = findMeleeTarget(this.zombies, this.player, WEAPONS.axe.range, WEAPONS.axe.arc);
    if (victim) {
      this.hitZombie(victim, damage);
      return;
    }

    const beast = findAnimalTarget(this.animals, this.player, WEAPONS.axe.range, WEAPONS.axe.arc);
    if (beast) {
      this.hitAnimal(beast, damage);
      return;
    }

    const id = this.interactions.findTree(this.player, this.state, this.clock.day);
    if (id === null) return;
    const world = this.state.world;
    const mutation = world.trees.get(id) ?? { hits: 0, choppedDay: null };
    mutation.hits += 1;

    const needed = this.state.inventory.hasGoodAxe ? CHOP.hitsGoodAxe : CHOP.hits;
    const tree = this.world.trees[id];
    // Ствол вздрагивает, летят щепки, зарубка на глазах углубляется.
    this.forest.shakeTree(id, this.player.yaw);
    if (tree) {
      this.chopEffects.chopMark(
        id,
        tree.x,
        tree.y,
        tree.z,
        0.24 * tree.scale,
        this.player.yaw,
        Math.min(mutation.hits / needed, 1),
      );
    }
    if (mutation.hits >= needed) {
      mutation.hits = 0;
      mutation.choppedDay = this.clock.day;
      this.chopEffects.clearMark(id);
      this.fellTree(id);
    }
    world.trees.set(id, mutation);
    this.net?.sendWorld({ t: 'tree', index: id, hits: mutation.hits, choppedDay: mutation.choppedDay });
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
      this.chopEffects.clearMark(id);
      this.state.world.trees.delete(id);
      // Сервер сам ничего не отращивает — говорим ему, что здесь снова лес.
      this.net?.sendWorld({ t: 'tree', index: id, hits: 0, choppedDay: null });
    }

    for (const [index, boulder] of this.state.world.boulders) {
      if (boulder.brokenDay === null) continue;
      if (day - boulder.brokenDay < STONES.boulderRegrowDays) continue;
      this.forest.setPropVisible('rock', index, true);
      this.forest.resetRock(index);
      this.state.world.boulders.delete(index);
      this.net?.sendWorld({ t: 'boulder', index, hits: 0, brokenDay: null });
    }
    for (const [index, takenDay] of this.state.world.pebbles) {
      if (day - takenDay < STONES.pebbleRegrowDays) continue;
      this.forest.setPropVisible('pebble', index, true);
      this.state.world.pebbles.delete(index);
      // Отрицательный день = «камешек снова лежит»: отдельного слова в
      // протоколе для этого не нужно, сравнение всё равно идёт по дню.
      this.net?.sendWorld({ t: 'pebble', index, day: -99 });
    }

    this.toasts.push(`Настал день ${day}`);
  }

  private interact(): void {
    if (this.ropeSwing.active || this.state.effects.using || this.chore || this.stomp.active) return;
    const target = this.target;
    if (!target) return;

    switch (target.kind) {
      case 'buravchik':
        this.openBuravchik();
        break;
      case 'tomer':
        this.openTomer();
        break;
      case 'avi':
        this.openAvi();
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
      case 'chair': {
        const chair = this.world.hut.chairs[1];
        this.seat = { x: chair.x, y: this.world.hut.floorY, z: chair.z, stove: true };
        const warm = this.state.world.stoveFuel > 0;
        this.toasts.push(
          !warm
            ? 'Сидишь. Печь холодная'
            : this.net?.online
              ? 'Сидишь у печки. Раны затягиваются'
              : 'Сидишь у печки. Время идёт быстрее',
        );
        break;
      }
      case 'catamaran': {
        const seat = this.world.catamaran.seat;
        this.seat = { x: seat.x, y: seat.y, z: seat.z, stove: false };
        this.toasts.push('Сидишь на катамаране. Плыть, правда, некуда');
        break;
      }
      case 'gazebo': {
        const seat = this.gazebo.seat;
        // Лавка высокая: садимся так, чтобы глаза были над перилами.
        this.seat = { x: seat.x, y: seat.y - 0.42, z: seat.z, stove: false };
        this.toasts.push('Вся карта как на ладони');
        break;
      }
      case 'petrovna':
        this.treatPetrovna();
        break;
      case 'swing':
        this.startSwing();
        break;
      case 'carcass':
        this.startButcher(target.index);
        break;
      case 'water':
        this.fillBottle();
        break;
      case 'campfire':
        this.startCooking();
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
    this.net?.sendWorld({ t: 'apple', index, pickedDay: this.clock.day });
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
    this.net?.sendWorld({ t: 'stove', fuel: this.state.world.stoveFuel });
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
    // Какой товар сейчас продаём: на втором экране выбирается количество.
    let selling: ItemId | null = null;
    const spec = (): DialogSpec => tomerDialog(this.state, selling);
    this.openDialog(spec, (id) => {
      if (id.startsWith('pick-')) {
        selling = id.slice(5) as ItemId;
        return false;
      }
      if (id === 'sell-back') {
        selling = null;
        return false;
      }
      const result = tomerAction(id, this.state);
      this.applyDialogResult(result);
      // Продали всё до последнего — возвращаемся в лавку.
      if (selling && countItem(this.state.inventory, selling) <= 0) selling = null;
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
      () => this.resumeAfterUi(),
    );
  }

  /** Панель закрылась: пробуем вернуть захват, иначе ждём клика игрока. */
  private resumeAfterUi(): void {
    this.pendingLock = true;
    this.hud.setVisible(true);
    this.hud.setResume(true);
    this.input.requestLock();
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
    if (this.ropeSwing.active) {
      // Весь номер камеру ведёт тарзанка: и положение, и углы, и обзор.
      this.camera.position.copy(this.ropeSwing.position);
      this.camera.rotation.set(this.ropeSwing.pitch, this.ropeSwing.yaw, this.ropeSwing.roll);
      this.camera.fov += (BASE_FOV + this.ropeSwing.fov - this.camera.fov) * Math.min(1, 10 * dt);
      this.camera.updateProjectionMatrix();
      return;
    }
    if (this.seat) {
      this.camera.position.set(this.seat.x, this.seat.y + SEAT_EYE, this.seat.z);
      this.camera.rotation.set(this.player.pitch, this.player.yaw, 0);
      return;
    }

    // Покачивание при ходьбе: амплитуда растёт со скоростью.
    const amp = clamp(this.player.speed / PLAYER.sprintSpeed, 0, 1);
    this.bob += this.player.speed * dt * 2.1;
    const bobY = Math.sin(this.bob * 2) * 0.035 * amp;
    const bobX = Math.cos(this.bob) * 0.028 * amp;

    // Тремор после кокаина: кадр мелко трясёт, целиться тяжело.
    const tremor = this.state.effects.tremor > 0 ? AVI.tremorSway : 0;
    const shakeX = tremor > 0 ? (Math.random() - 0.5) * tremor : 0;
    const shakeY = tremor > 0 ? (Math.random() - 0.5) * tremor : 0;

    this.camera.position.set(this.player.x + bobX * 0.35, this.player.eyeY + bobY, this.player.z);
    this.camera.rotation.set(
      this.player.pitch + shakeY,
      this.player.yaw + shakeX,
      Math.sin(this.bob) * 0.012 * amp,
    );

    // Еда и питьё: голова тянется к куску и запрокидывается на глотке.
    if (this.meal.active) {
      this.camera.rotation.x += this.meal.pitch;
      this.camera.rotation.z += this.meal.roll;
    }

    // Топтание винограда: игрок стоит в чане и смотрит себе под ноги.
    if (this.stomp.active) {
      this.camera.position.y += this.stomp.lift;
      this.camera.rotation.x += this.stomp.pitch;
      this.camera.rotation.z += this.stomp.roll;
    }

    // Сценарий употребления ведёт камеру сам: наклон, крен, дрожь.
    if (this.drugKit.active) {
      const kit = this.drugKit;
      this.camera.position.y += kit.lift.value;
      this.camera.rotation.x += kit.pitch + (Math.random() - 0.5) * kit.shake;
      this.camera.rotation.y += (Math.random() - 0.5) * kit.shake;
      this.camera.rotation.z += kit.roll;
    }

    const targetFov =
      BASE_FOV +
      this.cigarette.fovOffset +
      drugFov(this.state.effects) +
      this.drugKit.fov +
      this.binoculars.fov +
      (this.player.sprinting ? 3.5 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, 6 * dt);
    this.camera.updateProjectionMatrix();
  }

  private updateWorld(dt: number): void {
    this.sky.update(this.clock.t, dt, this.camera);
    this.forest.update(dt);
    // Покров едет за камерой: в кресле и на катамаране она уходит от игрока.
    this.cover.update(dt, this.camera.position.x, this.camera.position.z);
    this.catamaran.update(dt);
    this.placed.sync(this.state.world.structures, this.clock.day);
    this.placed.update(dt);
    this.syncVines();
    this.updateGhost();
    this.chopEffects.update(dt);
    this.npcs.buravchik.update(dt);
    this.npcs.tomer.update(dt);
    this.npcs.petrovna.update(dt);

    // Календарь: лёд на озере, снег и цвет сезона.
    const day = this.clock.day;
    const t = this.clock.t;
    this.world.terrain.frozen = lakeFrozen(day, t);
    const snow = snowAmount(day, t);
    const tint = seasonTint(day, t);
    // Осенью зелень уходит в золото, но не под снегом.
    this.season.set(snow, tint, autumnAmount(day, t) * 0.62 * (1 - snow));
    // Лёд встаёт не мгновенно: корка нарастает вместе со снегом.
    this.water.setIce(clamp((snow - SEASONS.freezeAt) * 3, 0, 1));
    this.river.setIce(clamp((snow - SEASONS.freezeAt - 0.15) * 3, 0, 1));

    // Дверь хижины сама распахивается перед подошедшим.
    const door = this.world.hut.door;
    const atDoor =
      Math.hypot(this.camera.position.x - door.x, this.camera.position.z - door.z) < INTERACT.range;
    const doorEvent = this.hut.updateDoor(dt, atDoor);
    if (doorEvent) this.audio.doorCreak(doorEvent === 'opening');

    const night = isDark(this.clock.t);
    // Ночью свечение сильнее: костёр и фонарь должны бить в глаза.
    this.post?.setStrength(this.quality.bloom * (night ? 1.5 : 1));
    this.campfire.update(dt, night);
    this.stall.setLamp(night);
    this.hut.setFire(this.state.world.stoveFuel > 0 ? 1 : 0, dt);
    this.hut.setDaylight(Math.min(this.sky.sun.intensity, 2.2) / 2.2);

    // Яблоки возвращаются на ветки на следующий день.
    this.appleTrees.forEach((tree, i) => {
      tree.setApples(applesReady(this.state, i, this.clock.day, APPLES.regrowDays));
    });

    const sunDir = this.sky.sun.position.clone().sub(this.camera.position).normalize();
    this.water.update(dt, sunDir, this.sky.sun.color, this.sky.skyColor, this.sky.sun.intensity);
    this.river.update(dt, sunDir, this.sky.sun.color, this.sky.skyColor, this.sky.sun.intensity);

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

    this.hud.setUnderwater(this.ropeSwing.underwater * 0.9);
    this.audio.setMuffle(
      Math.max(this.cigarette.muffle, drugMuffle(this.state.effects), this.ropeSwing.underwater * 0.85),
    );
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
    if (this.ropeSwing.active) return this.ropeSwing.hint;
    if (this.drugKit.active) return this.drugKit.hint;
    if (this.stomp.active) return this.stomp.hint;
    if (this.meal.active) return this.meal.hint;
    if (this.chore) {
      const done = Math.round((1 - this.chore.time / this.chore.total) * 100);
      return `${this.chore.label}… ${done}%`;
    }
    if (this.seat) return 'W — встать';
    if (this.target && this.target.distance < INTERACT.npcRange) return this.target.hint;
    if (this.slot === 4) return this.world.terrain.frozen ? 'Озеро подо льдом' : this.rod.hint();
    if (this.buildMode) return `${BLUEPRINTS[this.buildKind].name}: ЛКМ — поставить`;
    if (this.slot === 6) return 'ЛКМ — разбить валун · B — стройка';
    if (this.slot === 3) return this.shotgun.hint(countItem(this.state.inventory, 'shells'));
    if (this.slot === 2) return this.zombies.length > 0 ? 'ЛКМ — бить' : 'ЛКМ — рубить';
    if (this.slot === 8) return 'ЛКМ — смотреть в бинокль';
    if (this.slot === 1) return this.cigarette.hint();
    return '';
  }


  /** Возвращает картинку в согласие с загруженным состоянием мира. */
  private restoreWorldVisuals(): void {
    const day = this.clock.day;
    for (const [index, boulder] of this.state.world.boulders) {
      if (boulder.brokenDay === null) {
        // Недобитый валун так и стоит осевшим — это видно и после загрузки.
        if (boulder.hits > 0) this.forest.damageRock(index, boulder.hits / STONES.boulderHits);
        continue;
      }
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

  /**
   * Пересобирает картинку мира под чужое состояние: сперва всё поднимаем и
   * показываем, потом restoreWorldVisuals прячет то, что и правда срублено.
   * Нужно при заходе на сервер — там лес уже пожили без нас.
   */
  private rebuildWorldVisuals(): void {
    for (let id = 0; id < this.world.trees.length; id++) {
      this.forest.setTreeVisible(id, true);
      const obstacle = this.world.treeObstacles[id];
      if (obstacle) obstacle.disabled = false;
      this.chopEffects.removeStump(id);
      this.chopEffects.clearMark(id);
    }
    for (let index = 0; index < this.world.rocks.length; index++) {
      this.forest.setPropVisible('rock', index, true);
      this.forest.resetRock(index);
    }
    for (let index = 0; index < this.world.pebbles.length; index++) {
      this.forest.setPropVisible('pebble', index, true);
    }
    this.restoreWorldVisuals();
  }

  /** Дерево упало — у нас или у соседа: пень, обрушенный ствол, нет ствола. */
  private dropTreeVisual(id: number): void {
    const tree = this.world.trees[id];
    if (!tree) return;
    this.forest.setTreeVisible(id, false);
    const obstacle = this.world.treeObstacles[id];
    if (obstacle) obstacle.disabled = true;
    this.chopEffects.clearMark(id);
    this.chopEffects.addStump(id, tree.x, tree.y, tree.z, tree.scale);
  }

  /** На месте пня снова стоит дерево. */
  private raiseTreeVisual(id: number): void {
    this.forest.setTreeVisible(id, true);
    const obstacle = this.world.treeObstacles[id];
    if (obstacle) obstacle.disabled = false;
    this.chopEffects.removeStump(id);
    this.chopEffects.clearMark(id);
  }

  /**
   * Постройка изменилась: в сундук положили, в сушилке повесили шкуру, в
   * костёр подбросили полено. Шлём её целиком — их немного, а полей много.
   */
  private syncStructure(structure: PlacedStructure): void {
    if (!this.net) return;
    this.structureEcho.set(structure.id, structureEcho(structure));
    this.net.sendWorld({ t: 'structure', structure });
  }

  /**
   * Раз в секунду сверяем постройки со слепками и досылаем изменившиеся. Так
   * не приходится помнить про сеть в каждом диалоге: сундук, бочки, сушилка и
   * давильня разъезжаются максимум на секунду.
   *
   * Догорание в слепок не входит: и костёр, и печь тикают у всех одинаково.
   */
  private syncStructures(dt: number): void {
    if (!this.net?.online) return;
    this.structureSyncTimer -= dt;
    if (this.structureSyncTimer > 0) return;
    this.structureSyncTimer = 1;
    for (const structure of this.state.world.structures) {
      const echo = structureEcho(structure);
      if (this.structureEcho.get(structure.id) === echo) continue;
      this.structureEcho.set(structure.id, echo);
      this.net.sendWorld({ t: 'structure', structure });
    }
  }

  /** Личный прогресс, который сервер держал с прошлого захода. */
  private loadProgress(blob: string): void {
    if (!applyPersonal(this.state, this.player, blob)) return;
    this.player.eyeY = this.world.terrain.height(this.player.x, this.player.z) + PLAYER.eyeHeight;
    this.player.feetY = this.world.terrain.height(this.player.x, this.player.z);
    this.buildMenu.render(this.state.inventory);
  }

  /** Сумерки — стая выходит, рассвет — расходится. */
  private nightCycle(): void {
    const dark = isDark(this.clock.t);
    if (dark === this.wasDark) return;
    this.wasDark = dark;

    // В сети стаю выводит сервер, здесь остаются Ави, звук и подсказки.
    if (this.net?.online) {
      if (dark) {
        this.spawnAvi();
        this.audio.playSlot('night_start');
        this.toasts.push('Темнеет. В чаще кто-то ходит', 'bad');
      } else {
        this.despawnAvi();
        if (this.state.nightJob) {
          this.toasts.push('Поручение Ави сгорело с рассветом', 'bad');
          this.state.nightJob = null;
        }
        this.toasts.push('Рассвело. Лес пуст');
      }
      return;
    }

    if (dark) {
      this.spawnAvi();
      const count = zombieCount(this.clock.day);
      // Пещерных ночь не касается: они и так там сидят.
      const inCaves = this.zombies.filter((z) => z.cave !== undefined);
      this.zombies = [
        ...inCaves,
        ...spawnZombies(this.rng, this.world, count, this.player, this.nextZombieId),
      ];
      this.nextZombieId += count;
      this.audio.playSlot('night_start');
      this.toasts.push('Темнеет. В чаще кто-то ходит', 'bad');
    } else {
      // Рассвет разгоняет только лесную стаю — в пещере света не прибавилось.
      this.zombies = this.zombies.filter((z) => z.cave !== undefined && z.state !== 'dying');
      this.zombieView.sync(this.zombies);
      this.despawnAvi();
      if (this.state.nightJob) {
        this.toasts.push('Поручение Ави сгорело с рассветом', 'bad');
        this.state.nightJob = null;
      }
      this.toasts.push('Рассвело. Лес пуст');
    }
  }

  private updateZombies(dt: number): void {
    if (this.zombies.length === 0) return;

    // В сети стаю двигает сервер, здесь остаются стоны и отрисовка.
    if (!this.net?.online) {
      const hit = stepZombies(this.zombies, this.actors(), this.world, dt, this.rng);
      const mine = hit.damage.get(SELF_ID) ?? 0;
      if (mine > 0 && !this.dying) this.takeDamage(mine);
    }

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
    for (const { zombie, damage } of targets) this.hitZombie(zombie, damage, false);

    // Дробь достаётся и зверю: урон падает с дальностью.
    const beasts = shotAnimals(this.animals, this.player, WEAPONS.shotgun.range, WEAPONS.shotgun.spread);
    for (const { animal, damage } of beasts) {
      const dealt = WEAPONS.shotgun.farDamage + (WEAPONS.shotgun.nearDamage - WEAPONS.shotgun.farDamage) * damage;
      this.hitAnimal(animal, dealt);
    }

    if (targets.length === 0 && beasts.length === 0) this.toasts.push('Мимо', 'bad');
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
    const job = this.state.nightJob;
    if (job?.kind === 'zombies' && job.day === this.clock.day) {
      job.progress += 1;
      if (job.progress === job.target) this.toasts.push(`Ави ждёт: ${nightJobText(job)} — готово`);
    }
    const quest = this.state.quest;
    if (quest?.kind === 'zombies') {
      quest.progress += 1;
      this.toasts.push(`Упокоен: ${quest.progress}/${quest.target}`);
    } else {
      this.toasts.push('Упокоен');
    }
  }

  private takeDamage(amount: number): void {
    if (this.graceTimer > 0 || this.cheats.god) return;
    const effects = this.state.effects;
    // Под ударом не поколешься: доза теряется.
    if (effects.using) this.interruptDrug();
    if (drugDefersPain(effects)) {
      // Боль не чувствуется — она копится и прилетит, когда отпустит.
      effects.painDebt += amount;
      this.hurtFlash = 0.4;
      return;
    }
    this.player.health -= amount * drugIncoming(effects);
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
    // Пещеры заселятся заново, когда игрок туда вернётся.
    this.caveZombieDay.clear();
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
    this.seat = null;
    this.graceTimer = 8;
    this.cigarette.resetDay();

    // Всех, кто топчется у хижины, разгоняем: иначе игрока добьют на месте.
    for (const animal of this.animals) {
      if (animal.state === 'dead') continue;
      const d = Math.hypot(animal.x - this.player.x, animal.z - this.player.z);
      if (d > 45) continue;
      const away = Math.atan2(animal.x - this.player.x, animal.z - this.player.z);
      animal.x = this.player.x + Math.sin(away) * 60;
      animal.z = this.player.z + Math.cos(away) * 60;
      animal.homeX = animal.x;
      animal.homeZ = animal.z;
      animal.state = 'graze';
      animal.timer = 5;
    }

    this.toasts.push(
      `Буравчик дотащил тебя до хижины. Минус ${lost} ₪` + (catchSize > 0 ? ` и весь улов` : ''),
      'bad',
    );
    saveGame(this.state, this.clock, this.player);
  }

  /** Тарзанка: дальше камерой рулит номер, игрок стоит на месте. */
  private startSwing(): void {
    if (this.ropeSwing.active) return;
    // Тарзанка берёт всё дыхание разом и не пускает уставших.
    const breathMax = this.breathMax();
    if (this.player.breath < breathMax * 0.97) {
      this.toasts.push('Дыхание не то. Отдышись и приходи', 'bad');
      return;
    }
    this.seat = null;
    this.player.breath = 0;
    this.player.exhausted = true;
    this.player.restTimer = 0;
    this.ropeSwing.start();
    this.toasts.push('Ну поехали');
  }

  /**
   * Ведёт номер и, когда он кончился, ставит игрока на берег. Вызывается и
   * когда номера нет: брошенный трос ещё качается.
   */
  private updateSwing(dt: number): void {
    if (this.ropeSwing.update(dt, this.swingExit)) {
      this.audio.setWind(0);
      this.player.x = this.swingExit.x;
      this.player.z = this.swingExit.z;
      this.player.vx = 0;
      this.player.vz = 0;
      this.player.eyeY = this.world.terrain.height(this.player.x, this.player.z) + PLAYER.eyeHeight;
      this.player.yaw = this.ropeSwing.yaw;
      this.player.pitch = 0;
      this.toasts.push('Вылез мокрый и довольный');
    }
  }


  // ─── Тестовый режим ──────────────────────────────────────────────────
  // Всё, что ниже, доступно только после пароля в главном меню. В обычной
  // игре ни одна из этих веток не вызывается.

  /** Пароль только что приняли — подскажем, на какой клавише меню. */
  notifyCheatsUnlocked(): void {
    this.toasts.push('Тестовый режим включён. Клавиша ` — чит-меню', 'money');
  }

  /** Открыть чит-меню (кнопка в главном меню и клавиша `). */
  openCheats(): void {
    if (!CheatMenu.unlocked) return;
    document.exitPointerLock();
    this.cheatMenu.toggle(this.cheatApi(), () => this.resumeAfterUi());
  }

  /** Куда можно прыгнуть. Точки берём из мира, а не забиваем руками. */
  private cheatSpots(): CheatSpot[] {
    const fire = campfirePosition();
    const seat = this.world.hut.chairs[1];
    const points = this.interactionPoints;
    // Ави стоит на новом месте каждую ночь — точку знаем и днём.
    const avi = aviSpot(this.clock.day, this.world.seed, this.world.terrain);
    return [
      { id: 'hut', label: 'хижина', x: seat.x, z: seat.z + 1.6, look: seat },
      { id: 'fire', label: 'костёр', x: fire.x, z: fire.z + 2.4, look: fire },
      { id: 'buravchik', label: 'Буравчик', x: points.buravchik.x, z: points.buravchik.z + 1.8, look: points.buravchik },
      { id: 'tomer', label: 'Томер', x: points.tomer.x, z: points.tomer.z + 1.8, look: points.tomer },
      { id: 'avi', label: 'Ави (ночная точка)', x: avi.x, z: avi.z + 1.8, look: avi },
      { id: 'monument', label: 'памятник', x: points.monument.x, z: points.monument.z + 2.2, look: points.monument },
      { id: 'catamaran', label: 'катамаран', x: points.catamaran.x, z: points.catamaran.z + 2.4, look: points.catamaran },
      // Смотреть с берега на середину озера.
      { id: 'lake', label: 'озеро', x: 0, z: WORLD.lakeHalf + 2, look: { x: 0, z: 0 } },
      { id: 'mountain', label: 'гора Петушок', x: MOUNTAIN.x + 2.5, z: MOUNTAIN.z + 2.5, look: { x: MOUNTAIN.x, z: MOUNTAIN.z } },
      { id: 'swing', label: 'тарзанка', x: SWING.base.x, z: SWING.base.z + 1.6, look: SWING.aim },
      // Настил повёрнут, поэтому встаём ровно в его середину.
      { id: 'bridge', label: 'мост', x: BRIDGE.x, z: BRIDGE.z, look: { x: RIVER.sign.x, z: RIVER.sign.z } },
      { id: 'river', label: 'Псекупс', x: RIVER.sign.x, z: RIVER.sign.z + 2, look: RIVER.sign },
    ];
  }

  /**
   * Ближайшее место, где можно стоять. Табличка у реки и катамаран стоят
   * прямо в воде, а проваливаться на дно при телепорте незачем.
   */
  private cheatStand(x: number, z: number): { x: number; z: number; y: number } {
    const fits = (px: number, pz: number): number | null => {
      const deck = platformNear(this.world.platforms, px, pz);
      if (deck !== null) return deck;
      if (this.world.terrain.depth(px, pz) > 0.25) return null;
      return this.world.terrain.height(px, pz);
    };

    const here = fits(x, z);
    if (here !== null) return { x, z, y: here };

    for (let r = 2; r <= 26; r += 2) {
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const px = x + Math.cos(a) * r;
        const pz = z + Math.sin(a) * r;
        const y = fits(px, pz);
        if (y !== null) return { x: px, z: pz, y };
      }
    }
    return { x, z, y: this.world.terrain.height(x, z) };
  }

  private cheatTeleport(id: string): void {
    const spot = this.cheatSpots().find((s) => s.id === id);
    if (!spot) return;
    const stand = this.cheatStand(spot.x, spot.z);
    const look = spot.look ?? { x: spot.x, z: spot.z };
    this.seat = null;
    this.chore = null;
    this.player.x = stand.x;
    this.player.z = stand.z;
    this.player.vx = 0;
    this.player.vz = 0;
    this.player.vy = 0;
    this.player.eyeY = stand.y + PLAYER.eyeHeight;
    // Развернуться лицом к тому, ради чего прыгали.
    if (Math.hypot(look.x - stand.x, look.z - stand.z) > 0.3) {
      this.player.yaw = Math.atan2(-(look.x - stand.x), -(look.z - stand.z));
      this.player.pitch = 0;
    }
    // На новом месте лучше не встречать погоню, начатую на старом.
    this.graceTimer = Math.max(this.graceTimer, 3);
    this.toasts.push(`Телепорт: ${spot.label}`);
  }

  private cheatApi(): CheatApi {
    const inv = this.state.inventory;
    return {
      give: (id, count) => {
        const left = addItem(inv, id, count);
        if (left > 0) this.toasts.push('В рюкзаке нет места', 'bad');
      },
      giveMoney: (amount) => {
        inv.money += amount;
      },
      tools: () => ({
        hasRod: inv.hasRod,
        hasFlashlight: inv.hasFlashlight,
        hasGoodAxe: inv.hasGoodAxe,
        hasShotgun: inv.hasShotgun,
        hasHammer: inv.hasHammer,
        hasKnife: inv.hasKnife,
      }),
      setTool: (key: ToolKey, on: boolean) => {
        inv[key] = on;
      },
      day: () => this.clock.day,
      setDay: (day) => {
        this.clock.day = Math.max(1, Math.round(day));
        this.newDay();
      },
      setTime: (seconds) => this.setTime(seconds),
      season: () => seasonOf(this.clock.day),
      jumpToSeason: (season) => {
        // Всегда вперёд: назад по календарю ходить нельзя, на днях завязаны
        // отрастание леса, выдержка вина и сушка шкур.
        const target = SEASON_ORDER.indexOf(season) * SEASONS.length + 5;
        const now = (this.clock.day - 1) % (SEASONS.length * SEASON_ORDER.length);
        const total = SEASONS.length * SEASON_ORDER.length;
        this.clock.day += ((target - now) % total + total) % total;
        this.newDay();
      },
      teleports: () => this.cheatSpots().map(({ id, label }) => ({ id, label })),
      teleport: (id) => this.cheatTeleport(id),
      refill: () => {
        this.player.health = PLAYER.maxHealth;
        this.player.breath = this.breathMax();
        this.player.hunger = SURVIVAL.max;
        this.player.thirst = SURVIVAL.max;
        this.player.warmth = SURVIVAL.max;
        this.hurtFlash = 0;
      },
      flags: () => ({ ...this.cheats }),
      setFlag: (key: FlagKey, on: boolean) => {
        this.cheats[key] = on;
      },
      clearZombies: () => {
        this.zombies = [];
        this.zombieView.sync(this.zombies);
      },
      reviveAnimals: () => {
        for (const a of this.animals) {
          if (a.state !== 'dead') continue;
          // Проще всего дать симуляции самой поднять зверя на следующем шаге.
          a.deadFor = ANIMALS.respawn + 1;
          a.homeX = a.x + 200;
          a.homeZ = a.z;
        }
      },
    };
  }

  /** Сохранить прямо сейчас: нужно перед перезагрузкой страницы. */
  saveNow(): void {
    saveGame(this.state, this.clock, this.player);
    // На сервере лежит та же личная половина: сохраняем и её.
    this.net?.sendProgress(personalBlob(this.state, this.player));
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
      this.hitZombie(victim, WEAPONS.axe.damage * 0.8);
      return;
    }

    const index = this.interactions.findBoulder(this.player, this.state, this.clock.day, this.rockPoints);
    if (index === null) return;

    const boulders = this.state.world.boulders;
    const boulder = boulders.get(index) ?? { hits: 0, brokenDay: null };
    boulder.hits += 1;

    // Валун оседает и кренится, во все стороны летит каменная крошка.
    const rock = this.rockPoints[index];
    if (rock) this.chopEffects.rockMark(rock.x, rock.y, rock.z, this.player.yaw);
    this.forest.damageRock(index, Math.min(boulder.hits / STONES.boulderHits, 1));

    if (boulder.hits >= STONES.boulderHits) {
      boulder.hits = 0;
      boulder.brokenDay = this.clock.day;
      this.forest.setPropVisible('rock', index, false);
      this.forest.resetRock(index);
      const left = addItem(this.state.inventory, 'stone', STONES.boulderStones);
      this.toasts.push(
        left > 0 ? 'Валун разбит, но камни не влезли' : `Валун разбит. Камней: +${STONES.boulderStones}`,
        left > 0 ? 'bad' : 'normal',
      );
      this.audio.treeFall();
    }
    boulders.set(index, boulder);
    this.net?.sendWorld({ t: 'boulder', index, hits: boulder.hits, brokenDay: boulder.brokenDay });
  }

  private pickPebble(index: number): void {
    if (addItem(this.state.inventory, 'stone', 1) > 0) {
      this.toasts.push('В рюкзаке нет места', 'bad');
      return;
    }
    this.state.world.pebbles.set(index, this.clock.day);
    this.net?.sendWorld({ t: 'pebble', index, day: this.clock.day });
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
    this.inventoryScreen.open(this.state.inventory, () => this.resumeAfterUi());
  }

  private openChest(id: number): void {
    const chest = Interactions.structureById(this.state, id);
    if (!chest) return;
    if (!chest.storage) chest.storage = Array.from({ length: CHEST_SLOTS }, () => null);
    document.exitPointerLock();
    this.inventoryScreen.open(
      this.state.inventory,
      () => {
        // Что переложили — узнают все: сундук общий.
        this.syncStructure(chest);
        this.resumeAfterUi();
      },
      { title: 'Сундук', slots: chest.storage },
    );
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
  private buildTarget(): { x: number; z: number; y: number; rot: number } {
    const distance = 4.5;
    let x = this.player.x - Math.sin(this.player.yaw) * distance;
    let z = this.player.z - Math.cos(this.player.yaw) * distance;
    let rot = this.player.yaw;
    const blueprint = BLUEPRINTS[this.buildKind];

    // Причал сам примагничивается к кромке воды и встаёт поперёк берега.
    if (this.buildKind === 'pier') {
      const snapped = snapPier(x, z, this.world.terrain);
      if (snapped) {
        x = snapped.x;
        z = snapped.z;
        rot = snapped.rot;
      }
    }

    const y = blueprint.onWater ? 0 : this.world.terrain.height(x, z);
    return { x, z, y, rot };
  }

  private updateGhost(): void {
    if (!this.buildMode) return;
    const { x, z, y, rot } = this.buildTarget();
    const error = placementError(
      BLUEPRINTS[this.buildKind],
      x,
      z,
      rot,
      this.world,
      this.state.world.structures,
    );
    const affordable = this.buildMenu.affordable(this.state.inventory, this.buildKind);
    this.placed.showGhost(this.buildKind, x, y, z, rot, error === null && affordable);
  }

  private placeStructure(): void {
    const blueprint = BLUEPRINTS[this.buildKind];
    const inv = this.state.inventory;
    if (!this.buildMenu.affordable(inv, this.buildKind)) {
      this.toasts.push('Не хватает материалов', 'bad');
      return;
    }

    const { x, z, y, rot } = this.buildTarget();
    const error = placementError(blueprint, x, z, rot, this.world, this.state.world.structures);
    if (error) {
      this.toasts.push(error, 'bad');
      return;
    }

    removeItem(inv, 'log', blueprint.logs);
    removeItem(inv, 'stone', blueprint.stones);
    if (blueprint.saplings) removeItem(inv, 'vine_sapling', blueprint.saplings);
    if (blueprint.leather) removeItem(inv, 'leather', blueprint.leather);

    const structure: PlacedStructure = {
      id: this.state.world.nextStructureId++,
      kind: this.buildKind,
      x,
      z,
      y,
      rot,
      builtDay: this.clock.day,
    };
    if (this.buildKind === 'chest') structure.storage = Array.from({ length: CHEST_SLOTS }, () => null);
    if (this.buildKind === 'cellar') structure.barrels = [];
    if (this.buildKind === 'press') structure.juice = 0;
    if (this.buildKind === 'campfire') structure.fuel = 0;
    if (this.buildKind === 'vine') structure.pickedDay = null;
    this.state.world.structures.push(structure);
    this.registerStructureCollider(structure);
    this.net?.sendWorld({ t: 'structure', structure });

    this.audio.chop();
    this.toasts.push(`Построено: ${blueprint.name}`);
    this.buildMenu.render(inv);
  }

  private registerStructureCollider(structure: PlacedStructure): void {
    const collider = structureCollider(structure);
    if (collider) this.world.boxes.push(collider);
    // По настилу причала надо ходить, а не проваливаться сквозь него.
    const platform = structurePlatform(structure);
    if (platform) this.world.platforms.push(platform);
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
    this.net?.sendWorld({ t: 'vine', index, day: this.clock.day });
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
      case 'campfire':
        this.useCampfire(structure);
        break;
      case 'dryer':
        this.openDryer(structure);
        break;
      case 'filter':
        this.openFilter(structure);
        break;
      default:
        break;
    }
  }

  /** Разжечь костёр зажигалкой или подбросить в горящий полено. */
  private useCampfire(structure: PlacedStructure): void {
    const inv = this.state.inventory;
    const lit = (structure.fuel ?? 0) > 0;

    if (!lit) {
      if (!inv.hasLighter) {
        this.toasts.push('Нечем разжечь. Зажигалка у Томера, 60 ₪', 'bad');
        return;
      }
      structure.fuel = CAMPFIRE.burnSeconds;
      this.syncStructure(structure);
      this.audio.stoke();
      this.toasts.push('Костёр занялся. К утру прогорит');
      return;
    }

    if (countItem(inv, 'log') <= 0) {
      this.toasts.push('Дров нет', 'bad');
      return;
    }
    removeItem(inv, 'log', 1);
    structure.fuel = (structure.fuel ?? 0) + CAMPFIRE.logSeconds;
    this.syncStructure(structure);
    this.audio.stoke();
    this.toasts.push('Подбросил дров');
  }

  /** Костры прогорают по игровому времени, даже когда игрок далеко. */
  private updateCampfires(dt: number): void {
    for (const s of this.state.world.structures) {
      if (s.kind !== 'campfire' || !s.fuel) continue;
      s.fuel = Math.max(0, s.fuel - dt);
      if (s.fuel === 0) this.toasts.push('Костёр прогорел');
    }
  }

  /** Ближайший горящий костёр: и греет, и на нём жарят. */
  private nearestFire(range: number): { x: number; z: number } | null {
    const fire = campfirePosition();
    let best: { x: number; z: number } | null = null;
    let bestD = range;
    const d = Math.hypot(this.player.x - fire.x, this.player.z - fire.z);
    if (d < bestD) {
      best = fire;
      bestD = d;
    }
    for (const s of this.state.world.structures) {
      if (s.kind !== 'campfire' || (s.fuel ?? 0) <= 0) continue;
      const sd = Math.hypot(this.player.x - s.x, this.player.z - s.z);
      if (sd < bestD) {
        best = { x: s.x, z: s.z };
        bestD = sd;
      }
    }
    return best;
  }

  /** Сушилка: шкуры висят сутки, потом с них шьют одежду. */
  private dryerDialog(structure: PlacedStructure): DialogSpec {
    const day = this.clock.day;
    const inv = this.state.inventory;
    const hides = structure.hides ?? [];
    const drying = hides.reduce((n, h) => n + (day - h.startedDay >= CRAFT.dryDays ? 0 : h.count), 0);
    const ready = hides.reduce((n, h) => n + (day - h.startedDay >= CRAFT.dryDays ? h.count : 0), 0);
    const raw = countItem(inv, 'hide_raw');
    const leather = countItem(inv, 'leather');

    const actions: { id: string; label: string; note: string; disabled: boolean }[] = [
      {
        id: 'hang',
        label: `Развесить шкуры (${raw})`,
        note: raw > 0 ? `сохнут ${CRAFT.dryDays} сут.` : 'сырых шкур нет',
        disabled: raw <= 0,
      },
      { id: 'take', label: `Снять кожу (${ready})`, note: ready > 0 ? '' : 'ещё сохнет', disabled: ready <= 0 },
    ];

    for (const [id, spec] of Object.entries(CRAFT.clothes)) {
      const worn = inv.worn[id as keyof typeof inv.worn];
      actions.push({
        id: `sew-${id}`,
        label: `Сшить: ${ITEMS[id as ItemId].name}`,
        note: worn ? 'уже носишь' : `кожа ${leather}/${spec.leather}`,
        disabled: worn || leather < spec.leather,
      });
    }

    actions.push({ id: 'leave', label: 'Отойти', note: '', disabled: false });

    return {
      title: 'Сушилка для шкур',
      speech: drying > 0 ? `На жердях сохнет шкур: ${drying}.` : 'Пустые жерди ждут добычу.',
      actions,
      footer: `Готовой кожи на сушилке: ${ready}`,
    };
  }

  private openDryer(structure: PlacedStructure): void {
    const spec = (): DialogSpec => this.dryerDialog(structure);
    this.openDialog(spec, (id) => {
      const inv = this.state.inventory;
      const day = this.clock.day;
      if (id === 'hang') {
        const raw = countItem(inv, 'hide_raw');
        if (raw <= 0) return false;
        removeItem(inv, 'hide_raw', raw);
        structure.hides = structure.hides ?? [];
        structure.hides.push({ count: raw, startedDay: day });
        this.toasts.push(`Развесил шкур: ${raw}`);
        return false;
      }
      if (id === 'take') {
        const hides = structure.hides ?? [];
        let ready = 0;
        structure.hides = hides.filter((h) => {
          if (day - h.startedDay < CRAFT.dryDays) return true;
          ready += h.count;
          return false;
        });
        if (ready <= 0) return false;
        const left = addItem(inv, 'leather', ready);
        if (left > 0) structure.hides.push({ count: left, startedDay: day - CRAFT.dryDays });
        this.audio.pickup();
        this.toasts.push(left > 0 ? 'Кожа не влезла целиком' : `Кожа: +${ready}`, left > 0 ? 'bad' : 'normal');
        return false;
      }
      if (id.startsWith('sew-')) {
        const key = id.slice(4) as keyof typeof CRAFT.clothes;
        const recipe = CRAFT.clothes[key];
        if (countItem(inv, 'leather') < recipe.leather) return false;
        removeItem(inv, 'leather', recipe.leather);
        if (addItem(inv, key as ItemId, 1) > 0) {
          this.toasts.push('В рюкзаке нет места', 'bad');
          addItem(inv, 'leather', recipe.leather);
          return false;
        }
        this.audio.pickup();
        this.toasts.push(`Сшито: ${ITEMS[key as ItemId].name}. Надень в рюкзаке`);
        return false;
      }
      return id === 'leave';
    });
  }

  /** Очиститель: мутная вода капает через уголь и песок и становится питьевой. */
  private filterDialog(structure: PlacedStructure): DialogSpec {
    const inv = this.state.inventory;
    const tank = structure.water ?? { dirty: 0, clean: 0, timer: 0 };
    const dirty = countItem(inv, 'water_dirty');
    const left = tank.dirty > 0 ? Math.ceil(tank.timer) : 0;

    return {
      title: 'Очиститель воды',
      speech:
        tank.dirty > 0
          ? `Вода сочится сквозь уголь. Осталось ${left} с.`
          : 'Залей мутную воду — через уголь и песок она станет питьевой.',
      actions: [
        {
          id: 'pour',
          label: `Залить мутную (${dirty})`,
          note: dirty > 0 ? `по ${CRAFT.purifySeconds} с на бутылку` : 'мутной воды нет',
          disabled: dirty <= 0,
        },
        {
          id: 'take',
          label: `Забрать чистую (${tank.clean})`,
          note: tank.clean > 0 ? '' : 'ещё не готова',
          disabled: tank.clean <= 0,
        },
        { id: 'leave', label: 'Отойти' },
      ],
      footer: `В баке мутной: ${tank.dirty}`,
    };
  }

  private openFilter(structure: PlacedStructure): void {
    structure.water = structure.water ?? { dirty: 0, clean: 0, timer: 0 };
    const spec = (): DialogSpec => this.filterDialog(structure);
    this.openDialog(spec, (id) => {
      const inv = this.state.inventory;
      const tank = structure.water!;
      if (id === 'pour') {
        const dirty = countItem(inv, 'water_dirty');
        if (dirty <= 0) return false;
        removeItem(inv, 'water_dirty', dirty);
        // Бутылки остаются у игрока: очиститель отдаёт воду в свои же.
        if (tank.dirty === 0) tank.timer = CRAFT.purifySeconds;
        tank.dirty += dirty;
        this.audio.splash(0.3);
        this.toasts.push(`Залил бутылок: ${dirty}`);
        return false;
      }
      if (id === 'take') {
        if (tank.clean <= 0) return false;
        if (countItem(inv, 'bottle_empty') < tank.clean) {
          this.toasts.push('Не хватает пустых бутылок', 'bad');
          return false;
        }
        const take = tank.clean;
        removeItem(inv, 'bottle_empty', take);
        const over = addItem(inv, 'water_clean', take);
        if (over > 0) addItem(inv, 'bottle_empty', over);
        tank.clean = over;
        this.audio.pickup();
        this.toasts.push(`Чистая вода: +${take - over}`, over > 0 ? 'bad' : 'normal');
        return false;
      }
      return id === 'leave';
    });
  }

  /** Очистители капают сами по себе, даже когда игрок далеко. */
  private updateFilters(dt: number): void {
    for (const s of this.state.world.structures) {
      if (s.kind !== 'filter' || !s.water) continue;
      const tank = s.water;
      if (tank.dirty <= 0) continue;
      tank.timer -= dt;
      if (tank.timer > 0) continue;
      tank.dirty -= 1;
      tank.clean += 1;
      tank.timer = tank.dirty > 0 ? CRAFT.purifySeconds : 0;
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
    this.syncStructure(structure);
    this.plantedVines.get(structure.id)?.setGrapes(false);
    this.audio.pickup();
    this.toasts.push(`Грозди: +${count - left}`);
  }

  /**
   * Топчем виноград. Игрок забирается в чан и месит грозди ногами: сцена от
   * первого лица на несколько ударов, а сусло падает в рюкзак в конце.
   */
  private treadGrapes(structure: PlacedStructure): void {
    if (this.stomp.active) return;
    const inv = this.state.inventory;
    if (countItem(inv, 'grape') < WINE.grapesPerMust) {
      this.toasts.push(`Нужно ${WINE.grapesPerMust} гроздей`, 'bad');
      return;
    }
    removeItem(inv, 'grape', WINE.grapesPerMust);
    structure.juice = (structure.juice ?? 0) + 1;
    this.stompingAt = structure;
    // Забираемся прямо в чан: ноги стоят на его дне, а не на земле рядом.
    this.seat = null;
    this.player.x = structure.x;
    this.player.z = structure.z;
    this.player.vx = 0;
    this.player.vz = 0;
    this.player.vy = 0;
    this.player.feetY = structure.y + PRESS_FLOOR;
    this.player.eyeY = this.player.feetY + PLAYER.eyeHeight;
    this.player.onGround = true;
    this.player.pitch = -0.2;
    this.stomp.start(() => this.audio.stomp());
  }

  /** Сцена доиграна: сусло в рюкзак, игрок вылезает из чана. */
  private finishStomp(): void {
    const inv = this.state.inventory;
    // Вылезаем наружу: внутри чана стоит коллайдер, там делать нечего.
    const press = this.stompingAt;
    this.stompingAt = null;
    if (press) {
      const away = Math.hypot(this.player.x - press.x, this.player.z - press.z) || 1;
      const dx = (this.player.x - press.x) / away;
      const dz = (this.player.z - press.z) / away;
      this.player.x = press.x + (dx || 0) * 2.2;
      this.player.z = press.z + (dz || 1) * 2.2;
      this.player.feetY = this.world.terrain.height(this.player.x, this.player.z);
      this.player.eyeY = this.player.feetY + PLAYER.eyeHeight;
    }
    if (addItem(inv, 'must', 1) > 0) {
      this.toasts.push('Сусло некуда налить', 'bad');
      return;
    }
    this.audio.pickup();
    this.toasts.push('Сусло: +1');
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
        this.syncStructure(structure);
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
        this.syncStructure(structure);
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


  /** Ночью Ави стоит в новом месте — точка зависит только от номера дня. */
  private spawnAvi(): void {
    const spot = aviSpot(this.clock.day, this.world.seed, this.world.terrain);
    this.aviHere = spot;
    this.npcs.avi.group.position.set(spot.x, spot.y, spot.z);
    this.npcs.avi.group.rotation.y = spot.yaw;
    this.npcs.avi.group.visible = true;
    this.npcs.avi.labelPoint.set(spot.x, spot.y + 1.62, spot.z);
    this.aviLantern.position.set(spot.x + 0.6, spot.y + 0.9, spot.z + 0.3);
    this.aviLantern.visible = true;
    this.aviLantern.intensity = 5;
    this.interactionPoints.avi = new THREE.Vector3(spot.x, spot.y + 1.4, spot.z);
  }

  private despawnAvi(): void {
    this.aviHere = null;
    this.npcs.avi.group.visible = false;
    this.aviLantern.visible = false;
    this.aviLantern.intensity = 0;
    this.interactionPoints.avi = null;
    this.audio.setAviMusic(0);
  }

  /** Музыка из его колонки: громкость по расстоянию — так его и находят. */
  private updateAviAudio(): void {
    if (!this.aviHere) return;
    const d = Math.hypot(this.aviHere.x - this.player.x, this.aviHere.z - this.player.z);
    const volume = 1 - smoothstep(4, AVI.hearRange, d);
    this.audio.setAviMusic(volume * volume);
  }

  private openAvi(): void {
    this.audio.playSlot('avi_greet');
    const day = this.clock.day;
    const spec = (): DialogSpec => aviDialog(this.state, day);
    this.openDialog(spec, (id) => {
      const result = aviAction(id, this.state, day, this.rng);
      this.applyDialogResult(result);
      return result.close === true;
    });
  }

  /** Правая кнопка в рюкзаке: съесть, перевязаться или занюхать. */
  private consumeItem(id: ItemId): void {
    const inv = this.state.inventory;
    if (id === 'bandage') {
      this.useBandage();
      return;
    }
    // Одежду по правой кнопке надевают.
    if (id === 'coat' || id === 'hat' || id === 'boots') {
      if (inv.worn[id]) {
        this.toasts.push('Уже надето', 'bad');
        return;
      }
      if (removeItem(inv, id, 1) <= 0) return;
      inv.worn[id] = true;
      this.toasts.push(`Надел: ${ITEMS[id].name}`);
      return;
    }
    if (id === 'water_dirty') {
      this.toasts.push('Мутную воду не пьют. Нужен очиститель', 'bad');
      return;
    }
    const drinkGain = Game.drinkValue(id);
    if (drinkGain !== null) {
      if (removeItem(inv, id, 1) <= 0) return;
      this.applyDrink(id, drinkGain);
      return;
    }
    const foodGain = Game.foodValue(id);
    if (foodGain !== null) {
      if (removeItem(inv, id, 1) <= 0) return;
      this.applyFood(id, foodGain);
      return;
    }
    const drug = DRUG_BY_ITEM[id];
    if (drug) {
      this.takeDrug(drug);
      return;
    }
    this.toasts.push('Это не едят', 'bad');
  }

  /** Голод, жажда и тепло. Всё считается по игровому времени. */
  private updateSurvival(dt: number): void {
    const p = this.player;
    const inv = this.state.inventory;
    if (this.cheats.noNeeds) {
      p.hunger = SURVIVAL.max;
      p.thirst = SURVIVAL.max;
      p.warmth = SURVIVAL.max;
      return;
    }
    p.hunger = clamp(p.hunger - SURVIVAL.hungerDrain * dt, 0, SURVIVAL.max);
    p.thirst = clamp(p.thirst - SURVIVAL.thirstDrain * dt, 0, SURVIVAL.max);

    // У огня греешься, на морозе стынешь тем быстрее, чем хуже одет.
    const nearFire =
      this.nearestFire(CAMPFIRE.warmRange) !== null ||
      (this.state.world.stoveFuel > 0 &&
        Math.hypot(p.x - this.world.hut.x, p.z - this.world.hut.z) < 5);
    const cold = chill(this.clock.day, this.clock.t, insulation(inv));
    if (nearFire) {
      p.warmth = clamp(p.warmth + SURVIVAL.warmthRegen * dt, 0, SURVIVAL.max);
    } else {
      p.warmth = clamp(p.warmth - SURVIVAL.warmthDrain * cold * dt, 0, SURVIVAL.max);
    }

    let drain = 0;
    if (p.hunger <= 0) drain += SURVIVAL.starveDamage;
    if (p.thirst <= 0) drain += SURVIVAL.starveDamage;
    if (p.warmth <= 0) drain += SURVIVAL.freezeDamage;
    if (drain > 0 && !this.dying && this.graceTimer <= 0 && !this.cheats.god) {
      p.health -= drain * dt;
      if (p.health <= 0) {
        p.health = 0;
        this.die();
      }
    }
  }

  /** Сколько сытости даёт вещь. null — не едят. */
  private static foodValue(id: ItemId): number | null {
    const table: Partial<Record<ItemId, number>> = {
      apple: SURVIVAL.food.apple,
      grape: SURVIVAL.food.grape,
      meat: SURVIVAL.food.meat,
      meat_cooked: SURVIVAL.food.meat_cooked,
      fish_crucian: SURVIVAL.food.fish,
      fish_perch: SURVIVAL.food.fish,
      fish_bighead: SURVIVAL.food.fish,
    };
    return table[id] ?? null;
  }

  /** Сколько утоляет жажду. null — не пьют. */
  private static drinkValue(id: ItemId): number | null {
    if (id === 'water_clean') return SURVIVAL.drink.water_clean;
    if (id === 'beer') return SURVIVAL.drink.beer;
    if (id === 'wine_young' || id === 'wine_aged' || id === 'wine_vintage') return SURVIVAL.drink.wine;
    return null;
  }

  /**
   * Общая часть: эффект от съеденного. Вещь к этому моменту уже списана,
   * дальше проигрывается сцена, а сытость приходит с последним куском.
   */
  private applyFood(id: ItemId, gain: number): void {
    if (this.meal.active) return;
    this.meal.start(
      id,
      ITEMS[id].name,
      () => this.audio.bite(),
      () => this.finishFood(id, gain),
    );
  }

  private finishFood(id: ItemId, gain: number): void {
    this.player.hunger = clamp(this.player.hunger + gain, 0, SURVIVAL.max);
    this.audio.pickup();
    if (id === 'meat') {
      // Сырое мясо и не насыщает, и подтравливает.
      this.player.health = Math.max(1, this.player.health - SURVIVAL.rawMeatDamage);
      this.hurtFlash = 0.6;
      this.toasts.push('Съел сырое мясо. Живот крутит', 'bad');
      return;
    }
    this.toasts.push(`Съел: ${ITEMS[id].name}`);
  }

  private applyDrink(id: ItemId, gain: number): void {
    if (this.meal.active) return;
    this.meal.start(
      id,
      ITEMS[id].name,
      () => this.audio.gulp(),
      () => this.finishDrink(id, gain),
    );
  }

  private finishDrink(id: ItemId, gain: number): void {
    this.player.thirst = clamp(this.player.thirst + gain, 0, SURVIVAL.max);
    // Из-под воды и пива остаётся пустая бутылка.
    if (id === 'water_clean' || id === 'beer') addItem(this.state.inventory, 'bottle_empty', 1);
    this.audio.pickup();
    this.toasts.push(`Выпил: ${ITEMS[id].name}`);
  }

  /** Съесть из быстрой ячейки. */
  private eatFromSlot(): void {
    const inv = this.state.inventory;
    const stack = inv.food;
    if (this.meal.active) return;
    if (!stack) {
      this.toasts.push('Ячейка еды пуста: положи туда еду в рюкзаке', 'bad');
      return;
    }
    const gain = Game.foodValue(stack.id);
    if (gain === null) {
      this.toasts.push('Это не едят', 'bad');
      return;
    }
    const id = stack.id;
    stack.count -= 1;
    if (stack.count <= 0) inv.food = null;
    this.applyFood(id, gain);
  }

  /** Отпить из быстрой ячейки. */
  private drinkFromSlot(): void {
    const inv = this.state.inventory;
    const stack = inv.drink;
    if (this.meal.active) return;
    if (!stack) {
      this.toasts.push('Ячейка питья пуста', 'bad');
      return;
    }
    const id = stack.id;
    if (id === 'water_dirty') {
      this.toasts.push('Мутную воду не пьют. Нужен очиститель', 'bad');
      return;
    }
    const gain = Game.drinkValue(id);
    if (gain === null) {
      this.toasts.push('Это не пьют', 'bad');
      return;
    }
    stack.count -= 1;
    if (stack.count <= 0) inv.drink = null;
    this.applyDrink(id, gain);
  }

  /**
   * Карта на M. Игрока на ней нет — только рельеф и ориентиры; метки ставит
   * тот, у кого в руках молот.
   */
  private openMap(): void {
    if (this.mapScreen.isOpen) {
      this.mapScreen.close();
      return;
    }
    document.exitPointerLock();
    const world = this.state.world;
    const landmarks: Landmark[] = [
      { x: this.world.hut.x, z: this.world.hut.z, label: 'Хижина', kind: 'hut' },
      { x: WORLD.sign.x, z: WORLD.sign.z, label: 'Круглое озеро', kind: 'water' },
      { x: MOUNTAIN.x, z: MOUNTAIN.z, label: 'Гора Петушок', kind: 'peak' },
      { x: SWING.base.x, z: SWING.base.z, label: 'Тарзанка', kind: 'sign' },
      { x: GORGE.sign.x, z: GORGE.sign.z, label: 'Дантово ущелье', kind: 'gorge' },
      { x: RIVER.sign.x, z: RIVER.sign.z, label: 'Псекупс', kind: 'water' },
      { x: BRIDGE.x, z: BRIDGE.z, label: 'Мост', kind: 'bridge' },
      { x: WORLD.catamaran.x, z: WORLD.catamaran.z, label: 'Катамаран', kind: 'water' },
    ];
    // Памятник и пещеры на карте появляются только после того, как их нашли.
    if (world.monumentFound) {
      landmarks.push({ x: WORLD.monument.x, z: WORLD.monument.z, label: 'Серёга Пират', kind: 'sign' });
    }
    for (const cave of this.world.caves) {
      if (!world.cavesFound.includes(cave.id)) continue;
      landmarks.push({
        x: cave.mouth.x,
        z: cave.mouth.z,
        label: `Пещера ${cave.id + 1}`,
        kind: 'cave',
      });
    }
    // Флажки — это поставленные молотом постройки, ничего отдельного не храним.
    const flags: MapFlag[] = world.structures
      .filter((s) => s.kind === 'flag')
      .map((s) => ({ x: s.x, z: s.z }));

    // Товарищей на карте видно всегда: это и есть главный способ встретиться.
    const people = this.remotes.all.map((person) => ({
      x: person.point.x,
      z: person.point.z,
      name: person.name,
    }));
    this.mapScreen.open(this.world.terrain, landmarks, flags, people, () => this.resumeAfterUi());
  }

  /** Внутри ли игрок в щели ущелья: по этому и заводится счёт дроздов. */
  private gorgeInside(): boolean {
    return insideGorge(this.player.x, this.player.z);
  }

  /**
   * Дантово ущелье. Зашёл — считай дроздов, вышел — говори число. Птицы
   * пересаживаются каждый день, так что запомнить ответ не выйдет.
   */
  private updateGorge(dt: number): void {
    const inside = this.gorgeInside();
    // Птицы живут своей жизнью всегда: иначе они прыгают на месте всякий раз,
    // когда игрок вышел и вернулся.
    this.thrushes.update(dt, this.clock.day, this.rng);
    if (inside) {
      // Голоса: без них считать птиц по одной картинке скучно.
      this.thrushVoice -= dt;
      if (this.thrushVoice <= 0) {
        this.thrushVoice = 1.6 + this.rng() * 3.4;
        this.audio.thrush();
      }
    }

    if (inside && !this.inGorge) {
      if (this.state.world.thrushDay !== this.clock.day) {
        this.counting = true;
        this.toasts.push('Дантово ущелье. Считай дроздов — на выходе спросят');
      } else {
        this.toasts.push('Сегодня дроздов ты уже считал');
      }
    }
    if (!inside && this.inGorge && this.counting) {
      this.counting = false;
      this.askThrushes();
    }
    this.inGorge = inside;
  }

  /** Опрос на выходе: крутим число и отвечаем. */
  private askThrushes(): void {
    let answer = Thrushes.countFor(this.clock.day) > 8 ? 9 : 6;
    const truth = Thrushes.countFor(this.clock.day);
    const spec = (): DialogSpec => ({
      title: 'Дантово ущелье',
      speech: 'Ну и сколько же там было дроздов?',
      actions: [
        { id: 'less', label: '− 1', note: '', disabled: answer <= 0 },
        { id: 'more', label: '+ 1', note: '', disabled: answer >= 30 },
        { id: 'say', label: `Ответить: ${answer}`, note: '', disabled: false },
        { id: 'leave', label: 'Промолчать', note: '', disabled: false },
      ],
      footer: `Считать заново можно завтра`,
    });

    this.openDialog(spec, (id) => {
      if (id === 'less') {
        answer = Math.max(0, answer - 1);
        return false;
      }
      if (id === 'more') {
        answer = Math.min(30, answer + 1);
        return false;
      }
      if (id === 'say') {
        this.state.world.thrushDay = this.clock.day;
        if (answer === truth) this.rewardThrushes(truth);
        else {
          this.toasts.push(`Не сходится. Их было ${truth}`, 'bad');
          this.audio.pickup();
        }
        return true;
      }
      return true;
    });
  }

  private rewardThrushes(count: number): void {
    const inv = this.state.inventory;
    inv.money += GORGE.reward;
    this.audio.coins();
    if (!inv.hasBinoculars) {
      inv.hasBinoculars = true;
      this.toasts.push(`Ровно ${count}. Держи бинокль и ${GORGE.reward} ₪`, 'money');
      return;
    }
    this.toasts.push(`Ровно ${count}. +${GORGE.reward} ₪`, 'money');
  }

  /** В пещере темно: дневной свет гаснет, а туман придвигается вплотную. */
  // --- Сеть ---------------------------------------------------------------

  /** Подписывается на сервер. Всё, что приходит, ложится в тот же state. */
  private connect(net: NetClient): void {
    net.connect({
      onStatus: (text, kind) => this.toasts.push(text, kind),
      onWelcome: (message) => {
        this.clock.day = message.day;
        this.clock.t = message.time;
        // Мир общий: то, что уже нарубили и построили до нас, применяем разом.
        this.applyWorldSnapshot(message.world);
        this.remotes.clear();
        for (const player of message.players) this.remotes.add(player);
        // Стая и стадо теперь считаются на сервере, свои — на выброс.
        this.zombies = [];
        this.zombieView.sync(this.zombies);
        if (message.progress) this.loadProgress(message.progress);
        this.toasts.push(
          message.players.length > 0
            ? `В лесу уже есть: ${message.players.map((p) => p.name).join(', ')}`
            : 'Ты в лесу один. Пока что',
          'money',
        );
      },
      onState: (message) => {
        this.clock.day = message.day;
        // Время подтягиваем мягко: рывок в полсекунды заметен по теням.
        this.clock.t += (message.time - this.clock.t) * 0.25;
        this.remotes.sync(message.players);
        this.applyAnimalWire(message.animals);
        this.applyZombieWire(message.zombies);
      },
      onWorld: (action) => this.applyRemoteAction(action),
      onJoin: (player) => {
        this.remotes.add(player);
        this.toasts.push(`${player.name} пришёл в лес`, 'money');
      },
      onLeave: (id, name) => {
        this.remotes.remove(id);
        this.toasts.push(`${name} ушёл`);
      },
      onHurt: (amount) => {
        if (!this.dying) this.takeDamage(amount);
      },
      onKilled: (kind, id) => {
        if (kind === 'zombie') {
          this.onZombieKilled();
          return;
        }
        const beast = this.animals.find((a) => a.id === id);
        if (beast) this.harvest(beast);
      },
      onChat: (name, text) => this.toasts.push(`${name}: ${text}`, 'money'),
    });
  }

  /** Я и все, кто сейчас в лесу: по этому списку ходят звери и мертвецы. */
  private actors(): Actor[] {
    this.actorList.length = 0;
    this.actorList.push({ id: SELF_ID, x: this.player.x, z: this.player.z, yaw: this.player.yaw });
    for (const other of this.remotes.all) {
      this.actorList.push({ id: other.id, x: other.point.x, z: other.point.z, yaw: 0 });
    }
    return this.actorList;
  }

  /** Что о себе рассказывать серверу: поза, а не внутренности. */
  private sendPose(dt: number): void {
    const net = this.net;
    if (!net) return;
    let flags = 0;
    if (this.seat) flags |= POSE.sit;
    if (this.world.terrain.depth(this.player.x, this.player.z) > 0.3) flags |= POSE.swim;
    if (this.dying) flags |= POSE.dead;
    net.sendMove(dt, {
      x: this.player.x,
      y: this.player.feetY,
      z: this.player.z,
      yaw: this.player.yaw,
      pitch: this.player.pitch,
      speed: this.player.speed,
      slot: this.slot,
      flags,
      health: Math.round(this.player.health),
    });
  }

  /** Общее состояние мира при заходе: деревья, яблони, постройки. */
  private applyWorldSnapshot(snapshot: WorldSnapshot): void {
    const world = this.state.world;
    world.trees.clear();
    world.boulders.clear();
    world.pebbles.clear();
    world.vines.clear();
    for (const [index, hits, choppedDay] of snapshot.trees) world.trees.set(index, { hits, choppedDay });
    for (const [index, pickedDay] of snapshot.apples) {
      if (world.appleTrees[index]) world.appleTrees[index].pickedDay = pickedDay;
    }
    for (const [index, hits, brokenDay] of snapshot.boulders) world.boulders.set(index, { hits, brokenDay });
    for (const [index, day] of snapshot.pebbles) world.pebbles.set(index, day);
    for (const [index, day] of snapshot.vines) world.vines.set(index, day);
    world.stoveFuel = snapshot.stoveFuel;
    world.nextStructureId = Math.max(world.nextStructureId, snapshot.nextStructureId);

    // Постройки пересобираем целиком: чужие приходят вместе со своим добром.
    world.structures.length = 0;
    for (const structure of snapshot.structures) {
      world.structures.push(structure);
      this.registerStructureCollider(structure);
    }
    this.rebuildWorldVisuals();
  }

  /** Чужая мутация мира: применяем у себя и повторяем те же последствия. */
  private applyRemoteAction(action: WorldAction): void {
    const world = this.state.world;
    switch (action.t) {
      case 'tree': {
        const wasDown = isTreeDown(this.state, action.index, this.clock.day, CHOP.regrowDays);
        world.trees.set(action.index, { hits: action.hits, choppedDay: action.choppedDay });
        const down = action.choppedDay !== null;
        if (down && !wasDown) this.dropTreeVisual(action.index);
        if (!down && wasDown) this.raiseTreeVisual(action.index);
        break;
      }
      case 'apple':
        if (world.appleTrees[action.index]) world.appleTrees[action.index].pickedDay = action.pickedDay;
        break;
      case 'boulder': {
        world.boulders.set(action.index, { hits: action.hits, brokenDay: action.brokenDay });
        if (action.brokenDay !== null) this.forest.setPropVisible('rock', action.index, false);
        else this.forest.setPropVisible('rock', action.index, true);
        break;
      }
      case 'pebble':
        world.pebbles.set(action.index, action.day);
        this.forest.setPropVisible('pebble', action.index, false);
        break;
      case 'vine':
        world.vines.set(action.index, action.day);
        this.wildVines[action.index]?.setGrapes(false);
        break;
      case 'structure': {
        this.structureEcho.set(action.structure.id, structureEcho(action.structure));
        const index = world.structures.findIndex((s) => s.id === action.structure.id);
        if (index >= 0) world.structures[index] = action.structure;
        else {
          world.structures.push(action.structure);
          this.registerStructureCollider(action.structure);
        }
        world.nextStructureId = Math.max(world.nextStructureId, action.structure.id + 1);
        break;
      }
      case 'structureGone': {
        const index = world.structures.findIndex((s) => s.id === action.id);
        if (index >= 0) world.structures.splice(index, 1);
        break;
      }
      case 'stove':
        world.stoveFuel = action.fuel;
        break;
      default:
        break;
    }
  }

  /** Стадо с сервера: свои звери остаются теми же объектами, меняются поля. */
  private applyAnimalWire(wire: AnimalWire[]): void {
    for (const w of wire) {
      const animal = this.animals.find((a) => a.id === w.i);
      if (!animal) continue;
      animal.x = w.x;
      animal.y = w.y;
      animal.z = w.z;
      animal.yaw = w.r;
      animal.state = w.s;
      animal.speed = w.v;
      animal.butchered = w.b;
      // Фазу шага крутим сами: она нужна только для ног.
      if (w.s === 'dead') animal.deadFor = Math.max(animal.deadFor, 0.1);
      else animal.deadFor = 0;
    }
  }

  /** Стая с сервера: кого нет в снимке — того больше нет. */
  private applyZombieWire(wire: ZombieWire[]): void {
    const alive = new Set<number>();
    for (const w of wire) {
      alive.add(w.i);
      let zombie = this.zombies.find((z) => z.id === w.i);
      if (!zombie) {
        zombie = {
          id: w.i,
          x: w.x,
          z: w.z,
          y: w.y,
          yaw: w.r,
          health: ZOMBIE.health,
          state: w.s,
          goalX: w.x,
          goalZ: w.z,
          goalTimer: 0,
          attackTimer: 0,
          stagger: 0,
          deadFor: w.d,
          phase: Math.random() * 6,
        };
        if (w.c !== undefined) zombie.cave = w.c;
        this.zombies.push(zombie);
      }
      // Между снимками фигура доезжает сама — рывками ковылять некрасиво.
      const far = Math.hypot(zombie.x - w.x, zombie.z - w.z) > 6;
      zombie.x = far ? w.x : zombie.x + (w.x - zombie.x) * 0.5;
      zombie.z = far ? w.z : zombie.z + (w.z - zombie.z) * 0.5;
      zombie.y = w.y;
      zombie.yaw = w.r;
      zombie.state = w.s;
      zombie.deadFor = w.d;
      zombie.phase += 0.08;
    }
    if (this.zombies.length !== alive.size) {
      this.zombies = this.zombies.filter((z) => alive.has(z.id));
    }
    this.zombieView.sync(this.zombies);
  }

  private updateCaveLight(dt: number): void {
    let inside = false;
    for (const cave of this.world.caves) {
      if (!insideCave(cave, this.player.x, this.player.z, this.player.feetY)) continue;
      inside = true;
      // Зашёл — пещера отметилась на карте.
      if (!this.state.world.cavesFound.includes(cave.id)) {
        this.state.world.cavesFound.push(cave.id);
        this.toasts.push(`Пещера ${cave.id + 1} нанесена на карту`, 'money');
      }
      this.wakeCaveZombies(cave.id);
      break;
    }
    this.despawnFarCaveZombies();

    // Памятник Серёге тоже надо сперва найти.
    if (!this.state.world.monumentFound) {
      const d = Math.hypot(this.player.x - WORLD.monument.x, this.player.z - WORLD.monument.z);
      if (d < 14) {
        this.state.world.monumentFound = true;
        this.toasts.push('Серёга Пират нанесён на карту', 'money');
      }
    }
    // Плавно, иначе на входе свет щёлкает.
    this.caveDark += (Number(inside) - this.caveDark) * Math.min(1, dt * 2.2);
    this.sky.setCaveDark(this.caveDark);
  }

  /**
   * Первый заход в пещеру за сутки будит её обитателей. Наружу они не выходят,
   * поэтому спокойно живут в общем списке стаи — и ночью, и днём.
   */
  private wakeCaveZombies(id: number): void {
    if (this.net?.online) return;
    if (this.caveZombieDay.get(id) === this.clock.day) return;
    this.caveZombieDay.set(id, this.clock.day);
    const spawned = spawnCaveZombies(this.rng, this.world.caves[id], this.nextZombieId);
    if (spawned.length === 0) return;
    this.nextZombieId += spawned.length;
    // Пещерные идут в начало списка: пул фигур ограничен, а ночная стая большая.
    this.zombies.unshift(...spawned);
    // Стон из глубины, а не «наступила ночь»: под землёй время суток не при чём.
    this.audio.groan(14, false);
    this.toasts.push('В глубине кто-то шевелится', 'bad');
  }

  /** Ушёл далеко от зева — пещера пустеет, чтобы не считать её вечно. */
  private despawnFarCaveZombies(): void {
    if (this.net?.online) return;
    // Сначала смотрим, есть ли кого убирать: метод зовётся каждый кадр.
    const near = (z: Zombie): boolean => {
      if (z.cave === undefined) return true;
      const mouth = this.world.caves[z.cave].mouth;
      return Math.hypot(this.player.x - mouth.x, this.player.z - mouth.z) < ZOMBIE.cave.despawn;
    };
    if (this.zombies.every(near)) return;
    this.zombies = this.zombies.filter(near);
    this.zombieView.sync(this.zombies);
  }

  /** Стадо: шаг поведения, голоса и удары кабана. */
  private updateAnimals(dt: number): void {
    // В сети стадо считает сервер, здесь остаются только голоса и отрисовка.
    if (!this.net?.online) {
      const hit = stepAnimals(this.animals, this.actors(), this.world, dt, this.rng);
      const mine = hit.damage.get(SELF_ID) ?? 0;
      if (mine > 0 && !this.dying) this.takeDamage(mine);
    }
    this.animalsView.sync(this.animals, this.camera.position.x, this.camera.position.z);

    // Кто-нибудь поблизости время от времени подаёт голос.
    this.animalVoiceTimer -= dt;
    if (this.animalVoiceTimer > 0) return;
    this.animalVoiceTimer = 4 + this.rng() * 7;
    let best: Animal | null = null;
    let bestD: number = ANIMALS.voiceRange;
    for (const a of this.animals) {
      if (a.state === 'dead') continue;
      const d = Math.hypot(a.x - this.player.x, a.z - this.player.z);
      if (d < bestD) {
        best = a;
        bestD = d;
      }
    }
    if (best) this.audio.animal(best.kind, bestD);
  }

  /**
   * Яблоко Петровне. Награды за это нет и не будет — она просто берёт яблоко и
   * говорит спасибо. Единственное, что меняется, — что именно она говорит.
   */
  private treatPetrovna(): void {
    const inv = this.state.inventory;
    if (removeItem(inv, 'apple', 1) === 0) {
      this.toasts.push('Яблок нет. Петровна и так сидит', 'bad');
      return;
    }
    const given = (this.state.world.petrovnaApples += 1);
    const lines = [
      'Петровна: спасибо, милый. Иди уже',
      'Петровна: доброе яблоко. И озеро сегодня доброе',
      'Петровна: ты всё ходишь. А я сижу',
      'Петровна: четвёртое уже. Куда мне столько',
      'Петровна: ну хватит, хватит. Себе оставь',
    ];
    this.toasts.push(lines[Math.min(given, lines.length) - 1]);
    this.audio.bite();
  }

  /** Зверь упал. Мясо теперь не падает в рюкзак само — за ним нужен нож. */
  private harvest(animal: Animal): void {
    this.audio.zombieDown();
    this.toasts.push(
      this.state.inventory.hasKnife
        ? `${ANIMAL_NAME[animal.kind]} добыт. Разделай тушу ножом`
        : `${ANIMAL_NAME[animal.kind]} добыт. Без ножа с него ничего не взять`,
      this.state.inventory.hasKnife ? 'normal' : 'bad',
    );
  }

  /** Туша под ногами: с ножом её можно разделать. */
  private carcassTarget(): Target | null {
    const carcass = findCarcass(this.animals, this.player);
    if (!carcass) return null;
    const inv = this.state.inventory;
    return {
      kind: 'carcass',
      index: carcass.id,
      hint: inv.hasKnife ? 'E — разделать тушу' : 'Нужен нож — у Томера 120 ₪',
      distance: Math.hypot(carcass.x - this.player.x, carcass.z - this.player.z),
      priority: 4,
    };
  }

  /** Костёр: над любым горящим жарят мясо. */
  private campfireTarget(): Target | null {
    const fire = this.nearestFire(CAMPFIRE.cookRange);
    if (!fire) return null;
    const d = Math.hypot(this.player.x - fire.x, this.player.z - fire.z);
    const dx = fire.x - this.player.x;
    const dz = fire.z - this.player.z;
    const len = Math.hypot(dx, dz) || 1;
    if ((dx / len) * -Math.sin(this.player.yaw) + (dz / len) * -Math.cos(this.player.yaw) < 0.2) return null;
    const raw = countItem(this.state.inventory, 'meat');
    return {
      kind: 'campfire',
      index: -1,
      hint: raw > 0 ? `E — пожарить мясо (${raw})` : 'Сырого мяса нет',
      distance: d,
      // С мясом в руках жарка важнее возни с дровами, без мяса — наоборот.
      priority: raw > 0 ? 3 : 0,
    };
  }

  /** Жарка: мясо шкворчит над углями, потом падает в рюкзак. */
  private startCooking(): void {
    const inv = this.state.inventory;
    if (countItem(inv, 'meat') <= 0) {
      this.toasts.push('Сырого мяса нет', 'bad');
      return;
    }
    removeItem(inv, 'meat', 1);
    this.chore = {
      label: 'Жаришь мясо',
      time: CRAFT.cookTime,
      total: CRAFT.cookTime,
      loop: { play: () => this.audio.stoke(), every: 1.6 },
      next: 1.6,
      done: () => {
        if (addItem(inv, 'meat_cooked', 1) > 0) {
          this.toasts.push('Жареное мясо некуда положить', 'bad');
          addItem(inv, 'meat', 1);
          return;
        }
        this.audio.pickup();
        this.toasts.push('Жареное мясо: +1');
      },
    };
  }

  /** Берег: отсюда набирают мутную воду в пустую бутылку. */
  private waterSpot(): Target | null {
    const terrain = this.world.terrain;
    // Щупаем перед собой несколько точек: у самого берега вода мелкая, и с
    // одной пробы легко промахнуться мимо неё.
    let reach: number | null = null;
    for (const d of [0.8, 1.6, 2.4, 3.2, 4]) {
      const x = this.player.x - Math.sin(this.player.yaw) * d;
      const z = this.player.z - Math.cos(this.player.yaw) * d;
      if (terrain.surface(x, z) !== 'water') continue;
      if (terrain.depth(x, z) < 0.1) continue;
      reach = d;
      break;
    }
    if (reach === null) return null;
    const inv = this.state.inventory;
    return {
      kind: 'water',
      index: -1,
      hint: countItem(inv, 'bottle_empty') > 0 ? 'E — набрать воды' : 'Нужна пустая бутылка',
      distance: reach,
      priority: 1,
    };
  }

  /** Разделка: 'мясо и шкура' за пару секунд возни с ножом. */
  private startButcher(id: number): void {
    const animal = this.animals.find((a) => a.id === id);
    if (!animal || animal.state !== 'dead' || animal.butchered) return;
    if (!this.state.inventory.hasKnife) {
      this.toasts.push('Нужен разделочный нож', 'bad');
      return;
    }
    this.slot = 7;
    this.knife.setCutting(true);
    this.audio.butcher();
    this.chore = {
      label: `Разделываешь: ${ANIMAL_NAME[animal.kind]}`,
      time: CRAFT.butcherTime,
      total: CRAFT.butcherTime,
      loop: { play: () => this.audio.butcher(), every: 0.6 },
      next: 0.6,
      done: () => this.finishButcher(animal),
    };
  }

  private finishButcher(animal: Animal): void {
    if (animal.butchered) return;
    animal.butchered = true;
    this.net?.sendHit({ t: 'animalButcher', id: animal.id });
    const meat = ANIMALS[animal.kind].meat;
    const hides = CRAFT.hides[animal.kind];
    const meatLeft = addItem(this.state.inventory, 'meat', meat);
    const hideLeft = hides > 0 ? addItem(this.state.inventory, 'hide_raw', hides) : 0;
    const parts: string[] = [];
    if (meat - meatLeft > 0) parts.push(`мясо +${meat - meatLeft}`);
    if (hides - hideLeft > 0) parts.push(`шкура +${hides - hideLeft}`);
    this.audio.pickup();
    this.audio.playSlot('hero_butcher');
    this.toasts.push(
      parts.length > 0 ? `Разделал: ${parts.join(', ')}` : 'В рюкзаке нет места',
      parts.length > 0 ? 'normal' : 'bad',
    );
  }

  /** Набрать воды: мутную ещё придётся пропустить через фильтр. */
  private fillBottle(): void {
    const inv = this.state.inventory;
    if (countItem(inv, 'bottle_empty') <= 0) {
      this.toasts.push('Нужна пустая бутылка', 'bad');
      return;
    }
    removeItem(inv, 'bottle_empty', 1);
    const left = addItem(inv, 'water_dirty', 1);
    if (left > 0) {
      addItem(inv, 'bottle_empty', 1);
      this.toasts.push('В рюкзаке нет места', 'bad');
      return;
    }
    this.audio.pickup();
    this.toasts.push('Набрал мутной воды. Сырую пить нельзя — нужен фильтр');
  }

  /** Долгое дело: пока идёт, игрок стоит на месте. */
  private updateChore(dt: number): void {
    const chore = this.chore;
    if (!chore) return;
    const moved = this.input.axis('KeyS', 'KeyW') !== 0 || this.input.axis('KeyA', 'KeyD') !== 0;
    if (moved || this.dying) {
      this.chore = null;
      this.knife.setCutting(false);
      return;
    }
    chore.time -= dt;
    if (chore.loop) {
      chore.next = (chore.next ?? chore.loop.every) - dt;
      if (chore.next <= 0) {
        chore.next = chore.loop.every;
        chore.loop.play();
      }
    }
    if (chore.time > 0) return;
    this.chore = null;
    this.knife.setCutting(false);
    chore.done();
  }

  /** Приход, отходняк и накопленная героином боль. */
  private updateDrugs(dt: number): void {
    const effects = this.state.effects;

    if (effects.using) {
      effects.using.time -= dt;
      if (effects.using.time <= 0) {
        const drug = effects.using.drug;
        const spec = DRUGS[drug];
        effects.using = null;
        effects.active = { drug, time: spec.duration };
        effects.painDebt = 0;
        this.drugKit.cancel();
        this.audio.breath(true);
        this.toasts.push(`${spec.name[0].toUpperCase()}${spec.name.slice(1)} пошёл. Расплата будет к утру`, 'bad');
      }
    }

    if (effects.active) {
      effects.active.time -= dt;
      if (effects.active.time <= 0) {
        const spec = DRUGS[effects.active.drug];
        const drug = effects.active.drug;
        effects.active = null;
        effects.after = { drug, untilDay: this.clock.day };
        effects.tremor = spec.after.tremor;
        this.toasts.push(spec.after.text, 'bad');

        // Героин: всё, что не болело, прилетает разом.
        const damage = effects.painDebt + spec.after.health;
        effects.painDebt = 0;
        if (damage > 0) this.takeDamage(damage);
      }
    }
    if (effects.tremor > 0) effects.tremor = Math.max(0, effects.tremor - dt);
  }

  /** У каждого вида своё употребление: длительность, звук и ощущение. */
  private takeDrug(drug: keyof typeof DRUGS): void {
    const effects = this.state.effects;
    if (effects.using || effects.active) {
      this.toasts.push('И так уже хватит', 'bad');
      return;
    }
    const spec = DRUGS[drug];
    if (removeItem(this.state.inventory, spec.item, 1) <= 0) return;

    effects.using = { drug, time: spec.useTime };
    // Рюкзак закрывается: всё интересное происходит в руках, а не в сетке.
    if (this.inventoryScreen.isOpen) this.inventoryScreen.close();
    this.drugKit.start(drug);
    this.toasts.push(spec.useText);
  }

  /** Сбили на середине: доза потеряна, руки пусты. */
  private interruptDrug(): void {
    if (!this.state.effects.using) return;
    this.state.effects.using = null;
    this.drugKit.cancel();
    this.toasts.push('Сбили. Всё просыпалось', 'bad');
  }

  private updateHud(): void {
    const inv = this.state.inventory;
    this.hud.setClock(this.clock.t, this.clock.day);
    this.hud.setPurse(inv);
    this.hud.setPocket(inv);
    this.hud.setQuest(this.state.quest, this.state.quest ? questProgress(this.state.quest, this.state) : 0);
    this.hud.setHint(this.hintText());
    this.hud.setBreath(this.player.breath / this.breathMax());
    this.hud.setBuzz(this.cigarette.warmth, this.cigarette.buzz);
    this.hud.setSlots(
      this.slot,
      {
        1: true,
        2: true,
        3: inv.hasShotgun,
        4: inv.hasRod,
        5: inv.hasFlashlight,
        6: inv.hasHammer,
        7: inv.hasKnife,
        8: inv.hasBinoculars,
      },
      {
        1: String(countItem(inv, 'cigarettes')),
        3: inv.hasShotgun ? `${this.shotgun.loaded}/${countItem(inv, 'shells')}` : '',
        4: '',
        5: '',
        6: '',
        7: '',
        8: '',
      },
    );
    this.hud.setHealth(this.player.health / PLAYER.maxHealth, this.hurtFlash, this.dying);
    this.hud.setSeason(
      SEASON_NAME[seasonOf(this.clock.day)],
      temperature(this.clock.day, this.clock.t),
    );
    this.hud.setVitals(
      this.player.hunger / SURVIVAL.max,
      this.player.thirst / SURVIVAL.max,
      this.player.warmth / SURVIVAL.max,
    );
    this.hud.setQuick(quickLabel(inv.food), quickLabel(inv.drink));

    if (this.target?.name && this.target.labelPoint) {
      this.nameplate.show(this.target.name, this.target.labelPoint, this.camera);
    } else {
      this.nameplate.hide();
    }

    // Ники товарищей видно всегда: в одинаковом лесу иначе не встретиться.
    this.playerTags.sync(this.remotes.all, this.camera, this.camera.position);
  }
}
