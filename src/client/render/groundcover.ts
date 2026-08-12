import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GROUND_COVER, MOUNTAIN, SWING, WORLD } from '../../shared/balance';
import { campfirePosition } from '../../shared/world/buildings';
import { mulberry32 } from '../../shared/rng';
import type { Terrain } from '../../shared/world/terrain';
import type { WorldData } from '../../shared/world/worldgen';
import type { QualitySettings } from '../quality';

/**
 * Подножный покров: трава, папоротники и цветы. Раскидывать их по всей карте
 * бессмысленно — 800×800 метров съедят любой бюджет, а видно всё равно только
 * ближний круг. Поэтому покров живёт в окне вокруг игрока: клетки, уходящие
 * за спину, освобождают инстансы, а новые их занимают. Расстановка внутри
 * клетки детерминирована её координатами, так что при возврате трава та же.
 */

const SWAY_CHUNK = /* glsl */ `
  #include <begin_vertex>
  float swayPhase = uTime * 1.6 + instanceMatrix[3][0] * 0.55 + instanceMatrix[3][2] * 0.42;
  float swayAmount = max(transformed.y - uSwayBase, 0.0) * uSwayScale;
  transformed.x += sin(swayPhase) * swayAmount;
  transformed.z += cos(swayPhase * 0.8) * swayAmount * 0.7;
  // У края окна трава уходит в землю: иначе граница читается ровным кругом.
  float coverDist = length(vec2(instanceMatrix[3][0], instanceMatrix[3][2]) - uCenter);
  transformed *= 1.0 - smoothstep(uFade.x, uFade.y, coverDist);
`;

function tint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const count = geo.attributes.position.count;
  const arr = new Float32Array(count * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  if (!geo) throw new Error('Не удалось склеить геометрию покрова');
  return geo;
}

/** Нормали вверх, как у земли: вертикальные полигоны иначе чернеют. */
function flatten(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const normal = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, 1, 0);
  normal.needsUpdate = true;
  return geo;
}

/** Текстура пучка: узкие травинки с мягким кончиком на прозрачном фоне. */
function bladeTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  for (let i = 0; i < 34; i++) {
    const x = 4 + Math.random() * (size - 8);
    const w = 1.4 + Math.random() * 2.4;
    const top = 6 + Math.random() * (size * 0.55);
    const lean = (Math.random() - 0.5) * 30;
    const hue = 88 + Math.random() * 26;
    const light = 26 + Math.random() * 22;
    const grad = ctx.createLinearGradient(0, top, 0, size);
    grad.addColorStop(0, `hsla(${hue}, 42%, ${light + 22}%, 0)`);
    grad.addColorStop(0.18, `hsla(${hue}, 46%, ${light + 16}%, 0.95)`);
    grad.addColorStop(1, `hsl(${hue}, 44%, ${light}%)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, size);
    ctx.quadraticCurveTo(x + lean * 0.6, (size + top) / 2, x + lean, top);
    ctx.lineTo(x + lean + w * 0.35, top + 3);
    ctx.quadraticCurveTo(x + lean * 0.6 + w, (size + top) / 2, x + w, size);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function tuftGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.PlaneGeometry(0.38, 0.34);
    p.translate(0, 0.17, 0);
    p.rotateY((i * Math.PI) / 3);
    parts.push(p);
  }
  return flatten(merge(parts));
}

/** Текстура папоротника: три вайи с перистыми долями на прозрачном фоне. */
function frondTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  for (let f = 0; f < 4; f++) {
    const baseX = size * (0.24 + f * 0.18);
    const tipX = baseX + (baseX - size / 2) * 1.1;
    const tipY = 12 + Math.random() * 26;
    const hue = 96 + Math.random() * 22;
    const light = 18 + Math.random() * 14;
    ctx.strokeStyle = `hsl(${hue}, 40%, ${light + 6}%)`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(baseX, size);
    ctx.quadraticCurveTo(baseX, (size + tipY) * 0.45, tipX, tipY);
    ctx.stroke();
    // Доли по обе стороны от черешка: чем ближе к кончику, тем короче.
    const steps = 11;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = (1 - t) * (1 - t) * baseX + 2 * (1 - t) * t * baseX + t * t * tipX;
      const y = (1 - t) * (1 - t) * size + 2 * (1 - t) * t * (size + tipY) * 0.45 + t * t * tipY;
      const len = 17 * (1 - t * 0.8);
      ctx.strokeStyle = `hsl(${hue}, 42%, ${light + t * 12}%)`;
      ctx.lineWidth = 2.6 * (1 - t * 0.6);
      for (const dir of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + dir * len * 0.7, y - 2, x + dir * len, y - 7 * (1 - t));
        ctx.stroke();
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Куст папоротника: те же скрещенные плоскости, только крупнее травы. */
function fernGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.PlaneGeometry(0.78, 0.62);
    p.translate(0, 0.31, 0);
    p.rotateY((i * Math.PI) / 3 + 0.4);
    parts.push(p);
  }
  return flatten(merge(parts));
}

/** Цветок: стебелёк, пять лепестков и сердцевина. */
function flowerGeometry(petalHex: number, coreHex: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.006, 0.01, 0.26, 4);
  stem.translate(0, 0.13, 0);
  parts.push(tint(stem, 0x4f6f36));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = new THREE.PlaneGeometry(0.035, 0.05);
    // Лепестки приподняты чашей: сбоку цветок остаётся цветком, а не полоской.
    petal.rotateX(-Math.PI / 2 + 0.95);
    petal.translate(Math.cos(a) * 0.028, 0.27, Math.sin(a) * 0.028);
    petal.rotateY(-a);
    parts.push(tint(petal, petalHex));
  }
  const head = new THREE.IcosahedronGeometry(0.016, 0);
  head.translate(0, 0.275, 0);
  parts.push(tint(head, coreHex));
  return merge(parts);
}

interface Layer {
  mesh: THREE.InstancedMesh;
  /** Сколько штук этого слоя сеется в одну клетку. */
  perCell: number;
  free: number[];
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export class GroundCover {
  readonly group = new THREE.Group();
  private readonly layers: Layer[] = [];
  /** Клетка → занятые ею слоты по каждому слою. */
  private readonly cells = new Map<number, number[][]>();
  private readonly terrain: Terrain;
  private readonly cell = GROUND_COVER.cell;
  private readonly reach: number;
  private readonly time = { value: 0 };
  private readonly center = { value: new THREE.Vector2() };
  private readonly fade = { value: new THREE.Vector2() };
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();
  private readonly axis = new THREE.Vector3(0, 1, 0);
  private readonly color = new THREE.Color();
  /** Места, где траве расти незачем: пол хижины, прилавок, кострище. */
  private readonly boxes: { x: number; z: number; hw: number; hd: number }[];
  private readonly circles: { x: number; z: number; r: number }[];
  private cx = Number.NaN;
  private cz = Number.NaN;

  constructor(world: WorldData, quality: QualitySettings) {
    this.terrain = world.terrain;
    this.reach = Math.max(12, Math.round(GROUND_COVER.radius * quality.grass));
    const counter = world.stall.counter;
    this.boxes = [
      { x: world.hut.x, z: world.hut.z, hw: world.hut.width / 2 + 0.3, hd: world.hut.depth / 2 + 0.3 },
      { x: counter.x, z: counter.z, hw: counter.hw + 0.8, hd: counter.hd + 1.5 },
    ];
    const fire = campfirePosition();
    this.circles = [
      { x: fire.x, z: fire.z, r: 1.5 },
      { x: WORLD.monument.x, z: WORLD.monument.z, r: 1.6 },
      { x: WORLD.sign.x, z: WORLD.sign.z, r: 1.0 },
      // Настилы беседки и площадки тарзанки: трава сквозь доски не растёт.
      { x: MOUNTAIN.x, z: MOUNTAIN.z, r: MOUNTAIN.gazeboRadius + 0.4 },
      { x: SWING.base.x, z: SWING.base.z, r: 4.6 },
    ];

    const cellsAcross = Math.ceil((this.reach * 2) / this.cell) + 2;
    // Круг занимает примерно π/4 квадрата, плюс запас: клетки бывают полнее
    // среднего, а упереться в потолок значит остаться с проплешиной.
    const cellBudget = Math.ceil(cellsAcross * cellsAcross * 0.95);

    const perCellGrass = Math.max(6, Math.round(GROUND_COVER.grassPerCell * quality.grass));
    this.addLayer(
      new THREE.MeshStandardMaterial({
        map: bladeTexture(),
        alphaTest: 0.42,
        side: THREE.DoubleSide,
        roughness: 1,
        metalness: 0,
        vertexColors: false,
      }),
      tuftGeometry(),
      perCellGrass,
      cellBudget,
      0,
      0.11,
    );

    this.addLayer(
      new THREE.MeshStandardMaterial({
        map: frondTexture(),
        alphaTest: 0.4,
        side: THREE.DoubleSide,
        roughness: 1,
        metalness: 0,
      }),
      fernGeometry(),
      GROUND_COVER.fernsPerCell,
      cellBudget,
      0.05,
      0.05,
    );

    this.addLayer(
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        flatShading: true,
        side: THREE.DoubleSide,
        roughness: 0.95,
        metalness: 0,
      }),
      merge([
        flowerGeometry(0xf2f0e6, 0xf2d24a),
        flowerGeometry(0xd8a0c8, 0xf2d24a).translate(0.11, -0.02, 0.07),
        flowerGeometry(0xe8dc7a, 0xd8a83a).translate(-0.09, -0.03, 0.05),
      ]),
      GROUND_COVER.flowersPerCell,
      cellBudget,
      0.05,
      0.07,
    );
  }

  private addLayer(
    material: THREE.MeshStandardMaterial,
    geometry: THREE.BufferGeometry,
    perCell: number,
    cellBudget: number,
    swayBase: number,
    swayScale: number,
  ): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.uniforms.uCenter = this.center;
      shader.uniforms.uFade = this.fade;
      shader.uniforms.uSwayBase = { value: swayBase };
      shader.uniforms.uSwayScale = { value: swayScale };
      shader.vertexShader =
        'uniform float uTime;\nuniform vec2 uCenter;\nuniform vec2 uFade;\n' +
        'uniform float uSwayBase;\nuniform float uSwayScale;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', SWAY_CHUNK);
    };

    const capacity = Math.max(1, cellBudget * perCell);
    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < capacity; i++) mesh.setMatrixAt(i, HIDDEN);
    mesh.instanceMatrix.needsUpdate = true;

    const free: number[] = [];
    for (let i = capacity - 1; i >= 0; i--) free.push(i);
    this.layers.push({ mesh, perCell, free });
    this.group.add(mesh);
  }

  /** Под постройками и на утоптанных местах покрова нет. */
  private blocked(x: number, z: number): boolean {
    for (const b of this.boxes) {
      if (Math.abs(x - b.x) < b.hw && Math.abs(z - b.z) < b.hd) return true;
    }
    for (const c of this.circles) {
      if (Math.hypot(x - c.x, z - c.z) < c.r) return true;
    }
    return false;
  }

  private static key(cx: number, cz: number): number {
    return (cx + 4096) * 16384 + (cz + 4096);
  }

  /** Заполняет одну клетку: точки одни и те же при каждом возврате. */
  private fillCell(cx: number, cz: number): number[][] {
    const rng = mulberry32((Math.imul(cx + 1, 0x27d4eb2d) ^ Math.imul(cz + 1, 0x165667b1)) >>> 0);
    const taken: number[][] = [];

    this.layers.forEach((layer, index) => {
      const slots: number[] = [];
      for (let i = 0; i < layer.perCell; i++) {
        const x = (cx + rng()) * this.cell;
        const z = (cz + rng()) * this.cell;
        const rot = rng() * Math.PI * 2;
        const size = 0.75 + rng() * 0.6;
        if (this.terrain.surface(x, z) === 'water') continue;
        if (this.blocked(x, z)) continue;
        const slot = layer.free.pop();
        if (slot === undefined) break;

        this.position.set(x, this.terrain.height(x, z), z);
        this.quaternion.setFromAxisAngle(this.axis, rot);
        this.scale.set(size, size * (0.8 + rng() * 0.5), size);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        layer.mesh.setMatrixAt(slot, this.matrix);
        if (index === 0) {
          // Пучки чуть разного оттенка: поле перестаёт быть однотонным.
          const v = 0.62 + rng() * 0.5;
          layer.mesh.setColorAt(slot, this.color.setRGB(v * 0.94, v, v * 0.7));
        }
        slots.push(slot);
      }
      layer.mesh.instanceMatrix.needsUpdate = true;
      if (layer.mesh.instanceColor) layer.mesh.instanceColor.needsUpdate = true;
      taken.push(slots);
    });

    return taken;
  }

  private releaseCell(slots: number[][]): void {
    slots.forEach((list, index) => {
      const layer = this.layers[index];
      for (const slot of list) {
        layer.mesh.setMatrixAt(slot, HIDDEN);
        layer.free.push(slot);
      }
      if (list.length > 0) layer.mesh.instanceMatrix.needsUpdate = true;
    });
  }

  /** Двигает окно за игроком. Пересчитываются только вошедшие клетки. */
  update(dt: number, x: number, z: number): void {
    this.time.value += dt;
    this.center.value.set(x, z);
    this.fade.value.set(this.reach - 7, this.reach - 1);

    const cx = Math.floor(x / this.cell);
    const cz = Math.floor(z / this.cell);
    if (cx === this.cx && cz === this.cz) return;
    this.cx = cx;
    this.cz = cz;

    const span = Math.ceil(this.reach / this.cell);
    const limit = (span + 0.5) * (span + 0.5);
    const wanted: [number, number][] = [];
    const keep = new Set<number>();

    for (let dz = -span; dz <= span; dz++) {
      for (let dx = -span; dx <= span; dx++) {
        if (dx * dx + dz * dz > limit) continue;
        const key = GroundCover.key(cx + dx, cz + dz);
        keep.add(key);
        if (!this.cells.has(key)) wanted.push([cx + dx, cz + dz]);
      }
    }

    // Сначала отпускаем ушедшие клетки, только потом занимаем новые: иначе на
    // резком переносе (телепорт, воскрешение) свободных слотов не остаётся.
    for (const [key, slots] of this.cells) {
      if (keep.has(key)) continue;
      this.releaseCell(slots);
      this.cells.delete(key);
    }

    for (const [wx, wz] of wanted) {
      this.cells.set(GroundCover.key(wx, wz), this.fillCell(wx, wz));
    }
  }
}
