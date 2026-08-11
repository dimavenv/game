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

function trunk(rTop: number, rBottom: number, h: number, hex: number, y: number): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, 6, 1);
  g.translate(0, y + h / 2, 0);
  return tint(g, hex);
}

function blob(r: number, hex: number, x: number, y: number, z: number, squash = 0.85): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.scale(1, squash, 1);
  g.translate(x, y, z);
  return tint(g, hex);
}

/**
 * Красит геометрию градиентом по высоте. Крона, у которой низ темнее верха,
 * читается объёмной даже при плоском затенении — это самый дешёвый способ
 * увести лес от вида «конусы на палках».
 */
function gradient(geo: THREE.BufferGeometry, bottomHex: number, topHex: number): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
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
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

/** Лапа ели: приплюснутый конус, слегка повёрнутый и сдвинутый от оси. */
function tier(r: number, h: number, y: number, turn: number, lean: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, 9, 1);
  g.scale(1, 1, 1 + lean * 0.12);
  g.rotateY(turn);
  g.translate(Math.sin(turn) * lean, y + h / 2, Math.cos(turn) * lean);
  return g;
}

function spruceGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [trunk(0.1, 0.24, 3.6, 0x4a3a2c, 0)];
  const layers = 7;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const r = 2.0 * (1 - t * 0.82);
    const h = 1.7 - t * 0.55;
    const y = 1.05 + i * 0.76;
    parts.push(gradient(tier(r, h, y, i * 1.31, 0.06 + t * 0.05), 0x223d1e, 0x44693a));
  }
  return merge(parts);
}

function pineGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [trunk(0.15, 0.32, 7.4, 0x63472f, 0)];
  // Сосна: голый ствол и раскидистая шапка из приплюснутых ярусов.
  const tiers: [number, number, number][] = [
    [2.4, 1.5, 5.9],
    [2.05, 1.4, 6.9],
    [1.35, 1.3, 7.8],
  ];
  for (const [r, h, y] of tiers) {
    const g = new THREE.ConeGeometry(r, h, 10, 1);
    g.scale(1, 0.72, 1);
    g.translate(0, y + h / 2, 0);
    parts.push(gradient(g, 0x33512c, 0x5b8347));
  }
  parts.push(gradient(blob(0.85, 0, 0.95, 7.0, 0.5, 0.62), 0x2f4a28, 0x4e733d));
  parts.push(gradient(blob(0.7, 0, -1.0, 6.6, -0.4, 0.62), 0x2f4a28, 0x4e733d));
  return merge(parts);
}

function birchGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [trunk(0.11, 0.17, 5.6, 0xdedad0, 0)];
  // Чёрные штрихи на бересте: без них ствол выглядит пластиковой трубой.
  for (let i = 0; i < 7; i++) {
    const y = 0.5 + i * 0.68;
    const a = i * 2.4;
    const dash = new THREE.BoxGeometry(0.13, 0.05, 0.03);
    dash.rotateY(a);
    dash.translate(Math.sin(a) * 0.15, y, Math.cos(a) * 0.15);
    parts.push(tint(dash, 0x2b2823));
  }
  const canopy: [number, number, number, number][] = [
    [1.75, 0, 6.1, 0],
    [1.25, 0.95, 5.35, 0.45],
    [1.1, -0.85, 5.6, -0.6],
    [1.0, 0.25, 7.0, -0.5],
    [0.85, -0.5, 6.6, 0.8],
  ];
  for (const [r, dx, dy, dz] of canopy) {
    parts.push(gradient(blob(r, 0, dx, dy, dz, 0.82), 0x3d5522, 0x7a9a4c));
  }
  return merge(parts);
}

function bushGeometry(): THREE.BufferGeometry {
  return merge([
    gradient(blob(0.8, 0, 0, 0.52, 0, 0.72), 0x24361c, 0x4a6b33),
    gradient(blob(0.6, 0, 0.55, 0.42, 0.28, 0.72), 0x24361c, 0x53743a),
    gradient(blob(0.5, 0, -0.5, 0.4, -0.34, 0.72), 0x1f3018, 0x44602c),
    gradient(blob(0.42, 0, 0.15, 0.72, -0.4, 0.72), 0x2a3f20, 0x5a7c3f),
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

/** Высота кроны по типу дерева — нужна для падающего ствола при рубке. */
export const TREE_HEIGHT = [6.8, 9.1, 7.2];

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
    const trees = [
      { type: TreeType.Spruce, geo: spruceGeometry() },
      { type: TreeType.Pine, geo: pineGeometry() },
      { type: TreeType.Birch, geo: birchGeometry() },
    ];

    for (const { type, geo } of trees) {
      const list: { tree: (typeof world.trees)[number]; id: number }[] = [];
      world.trees.forEach((tree, id) => {
        if (tree.type === type) list.push({ tree, id });
      });
      const mesh = this.makeInstanced(geo, list.length, 0.9, 0.014, true);
      const m = new THREE.Matrix4();
      const color = new THREE.Color();
      list.forEach(({ tree: t, id }, i) => {
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
