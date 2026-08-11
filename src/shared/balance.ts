/**
 * Все игровые числа живут здесь. Правится за секунду, без раскопок по коду.
 * Файл общий для клиента и будущего сервера — баланс не должен расходиться.
 */

export const WORLD_SEED = 'krugloe-ozero';

/** Мир: 400x400 метров, за BOUND начинается непроходимая чаща. */
export const WORLD = {
  half: 200,
  bound: 196,
  /** Озеро квадратное: расстояние считается по Чебышёву. Оно «Круглое». */
  lakeHalf: 30,
  waterLevel: 0,
  /** Высота песчаного берега над водой. */
  shoreHeight: 0.42,
  /** Поляна под хижину и ларёк (этап 2) — здесь не растут деревья. */
  clearing: { x: 78, z: 0, r: 17 },
  /** Табличка «Круглое озеро» на северном берегу. */
  sign: { x: -6, z: -33.5 },
  /** Памятник Серёге Пирату — в глухом углу леса (этап 2). */
  monument: { x: -118, z: 96 },
} as const;

export const TIME = {
  /** Длительности фаз в секундах реального времени. */
  dawn: 60,
  day: 480,
  dusk: 60,
  night: 240,
  /** Игра стартует ясным утром: солнце уже высоко, лес не тонет в тенях. */
  startOffset: 185,
  /** Ускорение времени, когда сидишь в кресле у горящей печки (этап 2). */
  stoveTimeScale: 4,
} as const;

export const TIME_CYCLE = TIME.dawn + TIME.day + TIME.dusk + TIME.night;

export const PLAYER = {
  eyeHeight: 1.68,
  radius: 0.38,
  walkSpeed: 3.1,
  sprintSpeed: 5.7,
  /** Скорость по мелководью. */
  wadeSpeed: 1.35,
  accel: 22,
  friction: 14,
  /** Глубже этого в воду не лезем — по колено и хватит. */
  maxWadeDepth: 0.55,
  /** Полный запас бега в секундах и скорость восстановления. */
  breathMax: 7,
  breathRegen: 0.55,
  breathRegenDelay: 0.9,
  /** Чтобы снова побежать после полной одышки, надо отдышаться до этой доли. */
  breathRecoverTo: 0.35,
  /** Каждая выкуренная за день сигарета укорачивает дыхание на эту долю. */
  breathPenaltyPerCig: 0.05,
  breathPenaltyCap: 0.6,
  maxHealth: 100,
  /** Прыжок: высота в метрах и во что он обходится дыханию. */
  jumpHeight: 1.05,
  jumpBreathCost: 1.0,
  gravity: 18,
  /** Перегруженный игрок не бегает и идёт медленнее. */
  overloadSpeedFactor: 0.65,
} as const;

export const CIGARETTE = {
  packSize: 20,
  startPack: 19,
  /** Сколько секунд горит сигарета целиком. */
  burnTime: 130,
  /** Затяжка отъедает лишнего от сигареты. */
  puffBurn: 11,
  lightingTime: 1.15,
  inhaleTime: 0.85,
  holdTime: 0.8,
  exhaleTime: 1.35,
  flickTime: 0.7,
  /** Кайф: насколько сужается обзор, замедляется шаг и глохнут звуки. */
  buzzRise: 2.4,
  buzzDecay: 0.34,
  fovNarrow: 3.5,
  speedMul: 0.82,
  warmth: 0.34,
} as const;

/** Экономика (этап 2). Шекели ₪. */
export const ECONOMY = {
  startMoney: 0,
  prices: {
    cigarettes: 35,
    bandage: 45,
    fishingRod: 200,
    flashlight: 150,
    goodAxe: 350,
    shotgun: 900,
    shells5: 60,
    hammer: 280,
    vineSapling: 60,
    bottles5: 30,
  },
  sell: {
    apple: 8,
    log: 12,
    stone: 4,
    grape: 10,
    crucian: [12, 25] as const,
    perch: [25, 45] as const,
    bighead: [60, 110] as const,
    boot: 1,
  },
  quests: {
    apples: { count: 8, reward: 120 },
    fish: { count: 3, reward: 250 },
    zombies: { count: 6, reward: 300 },
  },
  /** «Дать прикурить Буравчику»: деньги и откат в игровых сутках. */
  lightUpBuravchik: { reward: 40, cooldownDays: 1 },
  /** Дань уважения Серёге Пирату: откат большой, благословение на сутки. */
  pirateTribute: { cooldownDays: 3, blessingDays: 1 },
  deathMoneyLoss: 0.3,
} as const;

/** Лес и растительность. */
export const FOREST = {
  /** Шаг сетки размещения деревьев в метрах. */
  cell: 5,
  baseDensity: 0.52,
  /** Ближе к краю мира лес густеет до непролазного. */
  thicketFrom: 150,
  thicketDensity: 0.97,
  /** Свободная полоса песка вокруг озера. */
  shoreMargin: 6,
  trunkRadius: 0.42,
  grassTufts: 7000,
  bushes: 900,
  rocks: 260,
  /** Яблони (этап 2). */
  appleTrees: 15,
} as const;

/** Рубка деревьев (этап 2). */
export const CHOP = {
  hits: 5,
  hitsGoodAxe: 3,
  logsPerTree: 3,
  regrowDays: 2,
  /** На какой дистанции топор достаёт до ствола. */
  range: 3.0,
  swingTime: 0.55,
} as const;

/** Камни: мелкие подбираются руками, валуны разбиваются молотом. */
export const STONES = {
  pebbles: 150,
  pebbleRegrowDays: 2,
  boulderHits: 4,
  boulderStones: 3,
  boulderRegrowDays: 2,
  range: 2.6,
} as const;

/** Яблони. */
export const APPLES = {
  minPerTree: 3,
  maxPerTree: 5,
  regrowDays: 1,
  range: 3.0,
} as const;

/** Рыбалка. */
export const FISHING = {
  minWait: 5,
  maxWait: 25,
  /** Сколько времени есть на подсечку — специально щедро. */
  biteWindow: 2.5,
  /** Промах не отпугивает надолго: следующая поклёвка придёт быстрее. */
  retryFactor: 0.45,
  castRange: 24,
} as const;

/** Печка в хижине. */
export const STOVE = {
  secondsPerLog: 75,
  maxFuel: 600,
} as const;

/** Дистанции взаимодействия. */
export const INTERACT = {
  range: 3.2,
  npcRange: 3.2,
} as const;

/** Зомби (этап 3). */
export const ZOMBIE = {
  /** Сколько выходит в первую ночь и насколько больше в каждую следующую. */
  baseCount: 12,
  perNight: 2,
  maxCount: 34,
  /** Метры: замечает игрока, догоняет, бьёт. */
  sightRange: 20,
  attackRange: 1.6,
  loseRange: 32,
  walkSpeed: 0.95,
  chaseSpeed: 3.4,
  health: 100,
  /** Урон за удар и пауза между ударами. */
  damage: 25,
  attackCooldown: 1.4,
  /** Оглушение после попадания топором. */
  staggerTime: 0.45,
  /** Ближе этого к хижине они не подходят: поляна — убежище. */
  safeRadius: 20,
  /** Ночью не появляются вплотную к игроку. */
  spawnMinDistance: 55,
} as const;

/** Оружие ближнего боя и дробовик. */
export const WEAPONS = {
  axe: { damage: 34, goodDamage: 52, range: 2.4, arc: 0.55 },
  shotgun: {
    capacity: 2,
    reloadTime: 2.4,
    fireCooldown: 0.55,
    range: 18,
    /** Урон в упор и на пределе дальности. */
    nearDamage: 130,
    farDamage: 28,
    spread: 0.28,
  },
} as const;

/** Лечение и смерть. */
export const HEALTH = {
  bandageHeal: 45,
  bandageTime: 1.6,
  /** Медленное восстановление у горящей печки. */
  stoveRegen: 2.5,
  deathFade: 2.2,
} as const;

/** Виноград и виноделие (этап 5). */
export const WINE = {
  wildVines: 12,
  /** Сколько гроздей даёт одна лоза. */
  minBunches: 3,
  maxBunches: 6,
  /** Через сколько суток на лозе снова висят грозди. */
  vineRegrowDays: 2,
  /** Посаженная лоза начинает плодоносить не сразу. */
  saplingGrowDays: 2,
  /** Сколько гроздей уходит в одно сусло и сколько времени топчешь. */
  grapesPerMust: 4,
  pressTime: 2.2,
  /** Бочка: сколько сусла в неё влезает и сколько бутылок выходит. */
  mustPerBarrel: 5,
  bottlesPerBarrel: 5,
  /** Выдержка в игровых сутках. */
  ageYoung: 1,
  ageAged: 3,
  ageVintage: 7,
  range: 3.0,
} as const;
