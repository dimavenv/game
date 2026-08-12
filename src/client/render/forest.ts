import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PropInstance, WorldData } from '../../shared/world/worldgen';
import { TreeType } from '../../shared/world/worldgen';
import type { QualitySettings } from '../quality';

/**
 * Склеивает части в одну геометрию. Индексы снимаются: цилиндры индексированы,
 * икосаэдры — нет, а слить можно только однородные, да и плоское затенение
 * всё равно требует развёрнутых вершин.
 */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  if (!geo) throw new Error('Не удалось склеить геометрию');
  return geo;
}

/** Красит геометрию в один цвет через атрибут вершин, чтобы всё слить в один меш. */
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

/**
 * Смещает вершины по хешу их же координат. Одинаковые точки уезжают
 * одинаково, поэтому геометрия не рвётся, а кроны и стволы перестают быть
 * идеально симметричными — лес сразу выглядит выросшим, а не отштампованным.
 */
function jitter(geo: THREE.BufferGeometry, amount: number, seed = 0): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    // Ось Y трогаем слабее: иначе ярусы кроны разъезжаются по высоте.
    const k = Math.round(x * 40) * 3.1 + Math.round(y * 40) * 7.7 + Math.round(z * 40) * 5.3 + seed * 91.7;
    pos.setXYZ(
      i,
      x + (hash(k) - 0.5) * amount * 2,
      y + (hash(k + 17.3) - 0.5) * amount,
      z + (hash(k + 41.9) - 0.5) * amount * 2,
    );
  }
  geo.computeVertexNormals();
  return geo;
}

function hash(n: number): number {
  const s = Math.sin(n * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/** Ствол с комлем: снизу шире, чем сверху, как у выросшего дерева. */
function trunk(rTop: number, rBottom: number, h: number, hex: number, y: number, seed = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, 7, 3);
  g.translate(0, y + h / 2, 0);
  // Комлевое утолщение: нижние кольца раздаём наружу.
  const pos = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const py = pos.getY(i);
    const flare = Math.max(0, 1 - (py - y) / (h * 0.16));
    if (flare <= 0) continue;
    pos.setX(i, pos.getX(i) * (1 + flare * 0.5));
    pos.setZ(i, pos.getZ(i) * (1 + flare * 0.5));
  }
  return tint(jitter(g, 0.02, seed), hex);
}

/** Сук: конус от ствола наружу и вверх. */
function branch(
  length: number,
  radius: number,
  y: number,
  azimuth: number,
  lift: number,
  hex: number,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(radius * 0.35, radius, length, 5, 1);
  g.translate(0, length / 2, 0);
  g.rotateZ(lift);
  g.rotateY(azimuth);
  g.translate(0, y, 0);
  return tint(g, hex);
}

function blob(
  r: number,
  hex: number,
  x: number,
  y: number,
  z: number,
  squash = 0.85,
  detail = 1,
): THREE.BufferGeometry {
  // detail = 1 даёт 80 граней: комок хвои выглядит комком, а не булыжником.
  const g = new THREE.IcosahedronGeometry(r, detail);
  g.scale(1, squash, 1);
  g.translate(x, y, z);
  return tint(g, hex);
}

/**
 * Красит геометрию градиентом по высоте, попутно чуть меняя тон каждой грани.
 * Крона, у которой низ темнее верха, читается объёмной даже при плоском
 * затенении, а разнобой по граням убирает пластиковую гладкость.
 */
function gradient(geo: THREE.BufferGeometry, bottomHex: number, topHex: number): THREE.BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  const pos = flat.attributes.position as THREE.BufferAttribute;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < min) min = y;
    if (y > max) max = y;
  }
  const span = Math.max(max - min, 0.0001);
  const arr = new Float32Array(pos.count * 3);
  const a = new THREE.Color(bottomHex);
  const b = new THREE.Color(topHex);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(a).lerp(b, (pos.getY(i) - min) / span);
    // Пятнистость по граням: три вершины треугольника берут один множитель.
    const k = 0.88 + hash(Math.floor(i / 3) * 1.7 + min) * 0.26;
    arr[i * 3] = c.r * k;
    arr[i * 3 + 1] = c.g * k;
    arr[i * 3 + 2] = c.b * k;
  }
  flat.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return flat;
}

/** Лапа ели: приплюснутый конус, слегка повёрнутый и сдвинутый от оси. */
function tier(r: number, h: number, y: number, turn: number, lean: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, 9, 2);
  g.scale(1, 1, 1 + lean * 0.12);
  g.rotateY(turn);
  g.translate(Math.sin(turn) * lean, y + h / 2, Math.cos(turn) * lean);
  // Рваный край лап: без него ель — просто стопка конусов.
  return jitter(g, r * 0.09, seed + turn);
}

/** Ель: ярусы лап от земли до макушки и тонкий шпиль. */
function spruceGeometry(seed: number): THREE.BufferGeometry {
  const dark = seed % 2 === 0 ? 0x223d1e : 0x1e3a22;
  const parts: THREE.BufferGeometry[] = [trunk(0.09, 0.26, 3.6, 0x4a3a2c, 0, seed)];
  const layers = 9 + (seed % 2);
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const r = (1.9 + hash(seed * 3 + i) * 0.35) * (1 - t * 0.86);
    const h = 1.5 - t * 0.45;
    const y = 0.75 + i * 0.62;
    parts.push(gradient(tier(r, h, y, i * 1.31 + seed, 0.05 + t * 0.06, seed), dark, 0x4a7040));
  }
  // Шпиль: у ели он всегда тоньше последнего яруса.
  const top = new THREE.ConeGeometry(0.28, 1.1, 7, 1);
  top.translate(0, 0.75 + layers * 0.62 + 0.2, 0);
  parts.push(gradient(top, 0x2c4a26, 0x547a45));
  return merge(parts);
}

/** Сосна: голый ствол, сучья и раскидистая неровная шапка. */
function pineGeometry(seed: number): THREE.BufferGeometry {
  const bark = 0x63472f;
  const parts: THREE.BufferGeometry[] = [trunk(0.14, 0.34, 7.6, bark, 0, seed)];
  // Сухие сучья на голой части ствола: по ним сосна и узнаётся.
  for (let i = 0; i < 3; i++) {
    const y = 3.4 + i * 1.15;
    parts.push(branch(0.9 + hash(seed + i) * 0.5, 0.06, y, i * 2.3 + seed, 0.9, bark));
  }
  // Шапка: комки хвои разного размера, а не один ровный конус.
  const clumps: [number, number, number, number][] = [
    [1.5, 0, 6.4, 0],
    [1.25, 1.3, 6.15, 0.3],
    [1.2, -1.2, 6.3, -0.45],
    [1.15, 0.3, 6.2, -1.3],
    [1.2, -0.25, 6.35, 1.25],
    [1.05, 0.95, 6.9, 0.95],
    [1.0, -0.9, 7.0, -0.9],
    [1.4, 0.15, 7.35, 0.05],
    [1.0, 0.9, 7.7, -0.5],
    [0.9, -0.85, 7.8, 0.5],
    [0.8, 0.1, 8.25, 0.2],
    [0.7, -0.35, 8.1, -0.6],
  ];
  for (const [r, dx, dy, dz] of clumps) {
    const k = 1 + (hash(seed * 7 + dx + dz) - 0.5) * 0.3;
    parts.push(gradient(jitter(blob(r * k, 0, dx, dy, dz, 0.72), r * 0.15, seed), 0x2b4524, 0x628c4a));
  }
  return merge(parts);
}

/** Берёза: белый ствол со штрихами, тонкие ветки и лёгкая крона. */
function birchGeometry(seed: number): THREE.BufferGeometry {
  const bark = 0xdedad0;
  const parts: THREE.BufferGeometry[] = [trunk(0.1, 0.19, 5.8, bark, 0, seed)];
  // Чёрные штрихи на бересте: без них ствол выглядит пластиковой трубой.
  for (let i = 0; i < 9; i++) {
    const y = 0.4 + i * 0.6;
    const a = i * 2.4 + seed;
    const dash = new THREE.BoxGeometry(0.11 + hash(seed + i) * 0.09, 0.045, 0.03);
    dash.rotateY(a);
    dash.translate(Math.sin(a) * 0.15, y, Math.cos(a) * 0.15);
    parts.push(tint(dash, 0x2b2823));
  }
  // Ветки уходят вверх — у берёзы они не торчат в стороны.
  for (let i = 0; i < 4; i++) {
    const y = 4.3 + i * 0.45;
    parts.push(branch(1.1 + hash(seed * 5 + i) * 0.6, 0.045, y, i * 1.9 + seed, 0.55, bark));
  }
  const canopy: [number, number, number, number][] = [
    [1.35, 0, 6.3, 0],
    [1.0, 1.0, 5.7, 0.4],
    [0.95, -0.9, 5.9, -0.55],
    [0.9, 0.3, 7.1, -0.45],
    [0.8, -0.45, 6.9, 0.75],
    [0.75, 0.75, 6.7, -0.8],
    [0.7, -0.75, 6.5, 0.85],
    [0.6, 0.1, 7.6, 0.15],
  ];
  for (const [r, dx, dy, dz] of canopy) {
    parts.push(gradient(jitter(blob(r, 0, dx, dy, dz, 0.8), r * 0.18, seed), 0x3d5522, 0x83a352));
  }
  return merge(parts);
}

function bushGeometry(): THREE.BufferGeometry {
  return merge([
    gradient(jitter(blob(0.8, 0, 0, 0.52, 0, 0.72), 0.12), 0x24361c, 0x4a6b33),
    gradient(jitter(blob(0.6, 0, 0.55, 0.42, 0.28, 0.72), 0.1, 3), 0x24361c, 0x53743a),
    gradient(jitter(blob(0.5, 0, -0.5, 0.4, -0.34, 0.72), 0.09, 7), 0x1f3018, 0x44602c),
    gradient(jitter(blob(0.42, 0, 0.15, 0.72, -0.4, 0.72), 0.08, 11), 0x2a3f20, 0x5a7c3f),
  ]);
}

/** Камешек под ногами: маленький и заметно светлее валуна. */
function pebbleGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const [dx, dz, r] of [
    [0, 0, 0.16],
    [0.17, 0.08, 0.11],
    [-0.13, 0.12, 0.09],
  ]) {
    const g = new THREE.DodecahedronGeometry(r, 0);
    g.scale(1, 0.6, 1);
    g.translate(dx, r * 0.5, dz);
    parts.push(tint(g, 0x9a968c));
  }
  return merge(parts);
}

function rockGeometry(): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(0.5, 0);
  g.scale(1, 0.65, 1.1);
  g.translate(0, 0.2, 0);
  return tint(g, 0x77746c);
}

const SWAY_CHUNK = /* glsl */ `
  #include <begin_vertex>
  float swayPhase = uTime * 1.4 + instanceMatrix[3][0] * 0.6 + instanceMatrix[3][2] * 0.45;
  float swayAmount = max(transformed.y - uSwayBase, 0.0) * uSwayScale;
  transformed.x += sin(swayPhase) * swayAmount;
  transformed.z += cos(swayPhase * 0.8) * swayAmount * 0.7;
`;

/** Сколько разных форм лепится на каждую породу. */
const TREE_VARIANTS = 2;

/** Высота кроны по типу дерева — нужна для падающего ствола при рубке. */
export const TREE_HEIGHT = [7.4, 8.6, 8.0];

interface TreeSlot {
  mesh: THREE.InstancedMesh;
  index: number;
  matrix: THREE.Matrix4;
}

/** Лес: несколько InstancedMesh на весь мир, поэтому вызовов отрисовки единицы. */
export class Forest {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };
  /** Соответствие «индекс дерева в мире» → конкретный инстанс, чтобы его прятать. */
  private readonly slots = new Map<number, TreeSlot>();
  /** Валуны и камешки прячем так же, как срубленные деревья. */
  private readonly props = new Map<string, { mesh: THREE.InstancedMesh; matrices: THREE.Matrix4[] }>();

  constructor(world: WorldData, quality: QualitySettings) {
    // По две формы на породу: соседние деревья перестают быть близнецами.
    const species: { type: number; build: (seed: number) => THREE.BufferGeometry }[] = [
      { type: TreeType.Spruce, build: spruceGeometry },
      { type: TreeType.Pine, build: pineGeometry },
      { type: TreeType.Birch, build: birchGeometry },
    ];

    for (const { type, build } of species) {
      const list: { tree: (typeof world.trees)[number]; id: number }[] = [];
      world.trees.forEach((tree, id) => {
        if (tree.type === type) list.push({ tree, id });
      });

      for (let variant = 0; variant < TREE_VARIANTS; variant++) {
        const mine = list.filter(({ id }) => id % TREE_VARIANTS === variant);
        const mesh = this.makeInstanced(build(variant + type * 5), mine.length, 0.9, 0.014, true);
        const m = new THREE.Matrix4();
        const color = new THREE.Color();
        mine.forEach(({ tree: t, id }, i) => {
          m.compose(
            new THREE.Vector3(t.x, t.y, t.z),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot),
            new THREE.Vector3(t.scale, t.scale * (0.9 + (t.rot % 0.3)), t.scale),
          );
          mesh.setMatrixAt(i, m);
          this.slots.set(id, { mesh, index: i, matrix: m.clone() });
          // Небольшой разброс оттенка, чтобы лес не выглядел штампованным.
          const v = 0.86 + ((t.x * 13.7 + t.z * 7.3) % 1) * 0.28;
          mesh.setColorAt(i, color.setRGB(v * 0.98, v, v * 0.94));
        });
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        this.group.add(mesh);
      }
    }

    // Кусты режутся настройкой качества, камни и камешки — нет: они игровые.
    const cut = (list: PropInstance[], factor: number): PropInstance[] =>
      factor >= 1 ? list : list.slice(0, Math.round(list.length * factor));

    this.addProps(bushGeometry(), cut(world.bushes, quality.props), 0.3, 0.02, true);
    this.addProps(rockGeometry(), world.rocks, 0, 0, true, 'rock');
    this.addProps(pebbleGeometry(), world.pebbles, 0, 0, false, 'pebble');
  }

  private makeInstanced(
    geo: THREE.BufferGeometry,
    count: number,
    swayBase: number,
    swayScale: number,
    shadow: boolean,
    doubleSide = false,
  ): THREE.InstancedMesh {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.95,
      metalness: 0,
      side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
    });
    this.applySway(mat, swayBase, swayScale);
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(count, 1));
    mesh.count = count;
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    return mesh;
  }

  private applySway(mat: THREE.Material, base: number, scale: number): void {
    if (scale <= 0) return;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.uniforms.uSwayBase = { value: base };
      shader.uniforms.uSwayScale = { value: scale };
      shader.vertexShader =
        'uniform float uTime;\nuniform float uSwayBase;\nuniform float uSwayScale;\n' +
        shader.vertexShader.replace('#include <begin_vertex>', SWAY_CHUNK);
    };
  }

  private addProps(
    geo: THREE.BufferGeometry,
    list: PropInstance[],
    swayBase: number,
    swayScale: number,
    shadow: boolean,
    key?: string,
    doubleSide = false,
  ): void {
    const mesh = this.makeInstanced(geo, list.length, swayBase, swayScale, shadow, doubleSide);
    const matrices: THREE.Matrix4[] = [];
    const m = new THREE.Matrix4();
    list.forEach((p, i) => {
      m.compose(
        new THREE.Vector3(p.x, p.y, p.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot),
        new THREE.Vector3(p.scale, p.scale, p.scale),
      );
      mesh.setMatrixAt(i, m);
      matrices.push(m.clone());
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (key) this.props.set(key, { mesh, matrices });
    this.group.add(mesh);
  }

  /** Разбитый валун или подобранный камешек исчезает до отрастания. */
  setPropVisible(key: 'rock' | 'pebble', index: number, visible: boolean): void {
    const entry = this.props.get(key);
    if (!entry || !entry.matrices[index]) return;
    const original = entry.matrices[index];
    if (visible) {
      entry.mesh.setMatrixAt(index, original);
    } else {
      const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
      hidden.setPosition(original.elements[12], original.elements[13], original.elements[14]);
      entry.mesh.setMatrixAt(index, hidden);
    }
    entry.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Срубленное дерево прячем сжатием инстанса в точку, потом возвращаем. */
  setTreeVisible(id: number, visible: boolean): void {
    const slot = this.slots.get(id);
    if (!slot) return;
    if (visible) {
      slot.mesh.setMatrixAt(slot.index, slot.matrix);
    } else {
      const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
      hidden.setPosition(slot.matrix.elements[12], slot.matrix.elements[13], slot.matrix.elements[14]);
      slot.mesh.setMatrixAt(slot.index, hidden);
    }
    slot.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number): void {
    this.time.value += dt;
  }
}
