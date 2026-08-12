/**
 * Все игровые числа живут здесь. Правится за секунду, без раскопок по коду.
 * Файл общий для клиента и будущего сервера — баланс не должен расходиться.
 */

export const WORLD_SEED = 'krugloe-ozero';

/** Мир: 400x400 метров, за BOUND начинается непроходимая чаща. */
export const WORLD = {
  half: 400,
  bound: 396,
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
  monument: { x: -186, z: 152 },
  /** Катамаран у северо-восточного угла озера: корма на песке, нос в воде. */
  catamaran: { x: 26.5, z: -26.5, yaw: -Math.PI / 4 },
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
    knife: 120,
    lighter: 60,
    /** Пиво: у Томера дороже, у Ави — как у своих. */
    beer: 45,
    beerAvi: 28,
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
  thicketFrom: 330,
  thicketDensity: 0.97,
  /** Свободная полоса песка вокруг озера. */
  shoreMargin: 6,
  trunkRadius: 0.42,
  bushes: 3400,
  rocks: 900,
  /** Яблони (этап 2). */
  appleTrees: 30,
  /** В каком радиусе от озера раскиданы яблони и дикие лозы. */
  landmarkSpread: 300,
} as const;

/**
 * Гора Петушок на юго-западе: главный ориентир карты. На вершине беседка и
 * табличка, у подножия — тарзанка над озером.
 */
export const MOUNTAIN = {
  x: -88,
  z: 88,
  /** Радиус подошвы и высота вершины над уровнем воды. */
  radius: 78,
  height: 38,
  /** Ровная площадка на макушке под беседку и радиус самой беседки. */
  topFlat: 11,
  gazeboRadius: 3.4,
  /** Где стоит табличка «ГОРА ПЕТУШОК» относительно вершины. */
  sign: { dx: 7.5, dz: 8.5 },
} as const;

/**
 * Река Псекупс: течёт вдоль подножия горы. С озером не пересекается — русло
 * проходит в сотне метров от него и уходит к южному краю карты.
 */
export const RIVER = {
  /** Уровень воды и глубина русла под ним. */
  level: 1.6,
  depth: 3.0,
  /** Полуширина воды и полоса берега, которую поднимает над водой. */
  halfWidth: 7,
  bank: 11,
  /** Табличка с названием — на ближнем к горе берегу. */
  sign: { x: -164, z: 126 },
} as const;

/**
 * Мост через Псекупс. Без него западный угол карты с памятником Серёге
 * Пирату отрезан: вброд русло не перейти.
 */
export const BRIDGE = {
  /** Середина моста — точно на оси русла, рядом с табличкой. */
  x: -164,
  z: 121,
  /** Разворот: локальная ось Z идёт поперёк реки. */
  yaw: -0.3,
  halfWidth: 1.7,
  halfLength: 17,
  /** Высота настила над водой. */
  rise: 1.7,
} as const;

/**
 * Тарзанка на склоне Петушка над Псекупсом. Площадка вырублена в склоне на
 * двенадцати метрах над водой, мачта наклонена к руслу — прыгают в реку.
 */
export const SWING = {
  /** Мачта на площадке и точка в русле, куда летят. */
  base: { x: -120.5, z: 120.5 },
  aim: { x: -131.8, z: 131.8 },
  /** Высота площадки над водой и её радиус. */
  height: 12,
  radius: 6.5,
  /** Высота мачты и длина троса. */
  mastHeight: 7.5,
  ropeLength: 5.2,
  /** Сколько длится каждая часть номера, в секундах. */
  grabTime: 0.7,
  swingTime: 1.6,
  flyTime: 2.2,
  splashTime: 1.1,
  /** Снос течением после выныривания и выход на берег. */
  driftTime: 9,
  driftSpeed: 5,
  swimTime: 1.8,
} as const;

/**
 * Подножный покров. Рассыпать траву по всем 640 000 м² бессмысленно: видно
 * только ближний круг, поэтому она живёт окном вокруг игрока и считается
 * поклеточно. Числа — на одну клетку 3×3 м.
 */
export const GROUND_COVER = {
  cell: 3,
  /** Радиус окна в метрах при максимальном качестве. */
  radius: 46,
  grassPerCell: 46,
  fernsPerCell: 2,
  flowersPerCell: 1,
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
  pebbles: 520,
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
  /** ...но и не расползаются по всему лесу: стая держится вокруг игрока. */
  spawnMaxDistance: 190,
} as const;

/**
 * Живность. Зайцы и косули пугливые, коровы домашние и пасутся у поляны,
 * кабан не убегает, а идёт разбираться. Утки живут на озере.
 * walk/run — метры в секунду, flee/charge — с какого расстояния реагируют.
 */
export const ANIMALS = {
  hare: { count: 26, walk: 1.2, run: 6.4, flee: 15, charge: 0, damage: 0, cooldown: 0, health: 20, meat: 1, roam: 22 },
  boar: { count: 12, walk: 1.0, run: 5.4, flee: 0, charge: 10, damage: 12, cooldown: 2, health: 90, meat: 3, roam: 30 },
  cow: { count: 8, walk: 0.7, run: 2.8, flee: 6, charge: 0, damage: 0, cooldown: 0, health: 150, meat: 5, roam: 18 },
  deer: { count: 12, walk: 1.3, run: 7.2, flee: 24, charge: 0, damage: 0, cooldown: 0, health: 60, meat: 3, roam: 40 },
  duck: { count: 16, walk: 0.5, run: 1.8, flee: 9, charge: 0, damage: 0, cooldown: 0, health: 12, meat: 1, roam: 14 },
  /** Дальше этого звери замирают: считать всю карту каждый кадр незачем. */
  simulateRange: 160,
  /** Как часто подаёт голос зверь рядом с игроком. */
  voiceRange: 30,
  /** Через сколько секунд туша исчезает и зверь возвращается в лес. */
  respawn: 150,
  /** Ближе этого к игроку зверь не воскресает — чтобы не появлялся из воздуха. */
  respawnAway: 70,
  /** С какого расстояния разделывают тушу. */
  butcherRange: 2.4,
} as const;

/**
 * Переносной костёр: ставится молотом, поджигается зажигалкой и прогорает
 * примерно за игровые сутки. Подбросить дров — горит дальше.
 */
export const CAMPFIRE = {
  /** Сколько секунд игрового времени горит с розжига и сколько добавляет бревно. */
  burnSeconds: TIME_CYCLE * 0.85,
  logSeconds: TIME_CYCLE * 0.4,
  /** Дальше этого костёр уже не греет и мясо на нём не пожаришь. */
  warmRange: 5.5,
  cookRange: 3.2,
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

/**
 * Времена года. Год — сорок суток: по десять на сезон. Температура в
 * градусах, comfort — та, при которой человеку нормально в рубахе.
 */
export const SEASONS = {
  /** Суток на один сезон. */
  length: 10,
  temp: { summer: 25, autumn: 9, winter: -13, spring: 12 },
  /** Насколько холоднее ночью. */
  nightDrop: 7,
  comfort: 12,
  /** Сколько градусов добавляет полный комплект одежды. */
  insulationDegrees: 26,
  /** При каком снеге встаёт лёд на озере. */
  freezeAt: 0.55,
} as const;

/**
 * Выживание. Полная шкала голода — на игровые сутки, жажда вдвое быстрее.
 * На нуле медленно тает здоровье и не бегается.
 */
export const SURVIVAL = {
  max: 100,
  /** Единиц в секунду. */
  hungerDrain: 100 / TIME_CYCLE,
  thirstDrain: 200 / TIME_CYCLE,
  /** Мороз ест тепло тем быстрее, чем холоднее. */
  warmthDrain: 100 / (TIME_CYCLE * 0.35),
  warmthRegen: 14,
  /** Здоровье, теряемое в секунду на пустой шкале. */
  starveDamage: 0.35,
  freezeDamage: 0.55,
  /** Ниже этого игрок не бегает. */
  weakAt: 12,
  /** Сколько восстанавливают еда и питьё. */
  food: { apple: 12, meat: 8, meat_cooked: 42, fish: 26, grape: 8 },
  drink: { water_clean: 55, wine: 30, beer: 38 },
  /** Сырое мясо ещё и подтравливает. */
  rawMeatDamage: 8,
  /** У костра и печки греешься. */
  fireWarmth: 22,
} as const;

/** Разделка, выделка кожи и одежда. */
export const CRAFT = {
  /** Сколько секунд возишься с тушей. */
  butcherTime: 1.8,
  /** Шкур с туши по видам. */
  hides: { hare: 1, boar: 2, cow: 3, deer: 2, duck: 0 },
  /** Сколько суток шкура сохнет на сушилке. */
  dryDays: 1,
  /** Сколько кож уходит на вещь и сколько она греет (доля от полного). */
  clothes: {
    coat: { leather: 4, warmth: 0.5 },
    hat: { leather: 2, warmth: 0.2 },
    boots: { leather: 3, warmth: 0.3 },
  },
  /** Сколько секунд жарится мясо и сколько чистится вода. */
  cookTime: 5,
  purifySeconds: 45,
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
  wildVines: 26,
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

/** Ави Загур: ночной чёрный рынок (этап 6). */
export const AVI = {
  /** Во сколько раз дороже брата он берёт вино. */
  wineMultiplier: 3,
  prices: { shells5: 40, bandage: 30 },
  /** Слышно его музыку с этого расстояния. */
  hearRange: 40,
  /** Дальше этого от озера Ави не уходит — иначе его не найти. */
  maxDistanceFromLake: 300,
  /** Насколько сильно трясёт кадр после кокаина. */
  tremorSway: 0.012,
} as const;
