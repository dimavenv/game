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

function cone(r: number, h: number, hex: number, y: number, segments = 7): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, segments, 1);
  g.translate(0, y + h / 2, 0);
  return tint(g, hex);
}

function blob(r: number, hex: number, x: number, y: number, z: number, squash = 0.85): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.scale(1, squash, 1);
  g.translate(x, y, z);
  return tint(g, hex);
}

function spruceGeometry(): THREE.BufferGeometry {
  return merge([
    trunk(0.13, 0.24, 3.2, 0x4a3a2c, 0),
    cone(1.75, 2.5, 0x2e4a2b, 1.9),
    cone(1.4, 2.3, 0x35542f, 3.1),
    cone(0.95, 2.0, 0x3b5c33, 4.3),
  ]);
}

function pineGeometry(): THREE.BufferGeometry {
  return merge([
    trunk(0.17, 0.3, 7.0, 0x59402c, 0),
    cone(2.15, 2.5, 0x3a5a34, 6.0),
    cone(1.5, 2.0, 0x42663a, 7.6),
  ]);
}

function birchGeometry(): THREE.BufferGeometry {
  return merge([
    trunk(0.14, 0.19, 5.4, 0xd6d2c4, 0),
    blob(1.9, 0x5f7a3a, 0, 6.0, 0),
    blob(1.3, 0x6b8642, 0.9, 5.1, 0.5),
    blob(1.15, 0x55702f, -0.8, 5.4, -0.6),
  ]);
}

function bushGeometry(): THREE.BufferGeometry {
  return merge([
    blob(0.75, 0x37502c, 0, 0.5, 0, 0.75),
    blob(0.55, 0x405c31, 0.5, 0.4, 0.25, 0.75),
    blob(0.45, 0x2f4626, -0.45, 0.38, -0.3, 0.75),
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

/** Папоротник: несколько вееров из узких перьев, крест-накрест. */
function fernGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const shades = [0x3f6a33, 0x4c7a3a, 0x35592c];
  for (let f = 0; f < 5; f++) {
    const angle = (f / 5) * Math.PI * 2;
    const tiltDir = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const len = 0.5 - t * 0.16;
      const leaf = new THREE.PlaneGeometry(0.11, len);
      leaf.rotateX(-Math.PI / 2 + 0.55 + t * 0.25);
      leaf.translate(0, 0.12 + t * 0.16, len * 0.42);
      const g = leaf.clone();
      g.rotateY(angle + (i - 1.5) * 0.16);
      g.translate(tiltDir.x * 0.02, 0, tiltDir.z * 0.02);
      parts.push(tint(g, shades[(f + i) % shades.length]));
    }
  }
  const geo = merge(parts);
  // Как и трава: нормали вверх, иначе перья чернеют на светлой земле.
  const normal = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, 1, 0);
  normal.needsUpdate = true;
  return geo;
}

/** Цветок: стебелёк с головкой. На каждый цвет — своя пачка инстансов. */
function flowerGeometry(petalHex: number, coreHex: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.008, 0.012, 0.24, 4);
  stem.translate(0, 0.12, 0);
  parts.push(tint(stem, 0x4f6f36));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const petal = new THREE.PlaneGeometry(0.055, 0.075);
    petal.rotateX(-Math.PI / 2 + 0.5);
    petal.translate(Math.cos(a) * 0.045, 0.26, Math.sin(a) * 0.045);
    parts.push(tint(petal, petalHex));
  }
  const head = new THREE.IcosahedronGeometry(0.022, 0);
  head.translate(0, 0.265, 0);
  parts.push(tint(head, coreHex));
  return merge(parts);
}

/** Текстура пучка травы: несколько мазков на прозрачном фоне. */
function grassTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, 64, 64);
  for (let i = 0; i < 7; i++) {
    const x = 6 + Math.random() * 52;
    const w = 2 + Math.random() * 3;
    const top = 6 + Math.random() * 20;
    const grad = ctx.createLinearGradient(0, top, 0, 64);
    grad.addColorStop(0, 'rgba(186,214,124,0)');
    grad.addColorStop(0.25, 'rgba(158,196,104,0.95)');
    grad.addColorStop(1, 'rgba(108,150,72,1)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x, 64);
    ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 18, (64 + top) / 2, x + (Math.random() - 0.5) * 10, top);
    ctx.lineTo(x + w, top + 2);
    ctx.quadraticCurveTo(x + w + (Math.random() - 0.5) * 16, (64 + top) / 2, x + w, 64);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function grassGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const p = new THREE.PlaneGeometry(0.55, 0.42);
    p.translate(0, 0.21, 0);
    p.rotateY((i * Math.PI) / 3);
    parts.push(p);
  }
  const geo = merge(parts);
  // Нормали смотрят вверх, как у земли: иначе вертикальные полигоны
  // почти не ловят солнце и трава чернеет на светлом газоне.
  const normal = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < normal.count; i++) normal.setXYZ(i, 0, 1, 0);
  normal.needsUpdate = true;
  return geo;
}

const SWAY_CHUNK = /* glsl */ `
  #include <begin_vertex>
  float swayPhase = uTime * 1.4 + instanceMatrix[3][0] * 0.6 + instanceMatrix[3][2] * 0.45;
  float swayAmount = max(transformed.y - uSwayBase, 0.0) * uSwayScale;
  transformed.x += sin(swayPhase) * swayAmount;
  transformed.z += cos(swayPhase * 0.8) * swayAmount * 0.7;
`;

/** Высота кроны по типу дерева — нужна для падающего ствола при рубке. */
export const TREE_HEIGHT = [6.3, 9.6, 7.0];

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

    // Камни и камешки — часть игры, их прячем только по сюжету.
    // Всё остальное под ногами режется настройкой качества.
    const cut = (list: PropInstance[], factor: number): PropInstance[] =>
      factor >= 1 ? list : list.slice(0, Math.round(list.length * factor));

    this.addProps(bushGeometry(), cut(world.bushes, quality.props), 0.3, 0.02, true);
    this.addProps(rockGeometry(), world.rocks, 0, 0, true, 'rock');
    this.addProps(pebbleGeometry(), world.pebbles, 0, 0, false, 'pebble');
    this.addProps(fernGeometry(), cut(world.ferns, quality.props), 0.05, 0.05, false, undefined, true);

    const flowers = cut(world.flowers, quality.props);
    const palette: [number, number][] = [
      [0xf2f0e6, 0xf2d24a],
      [0xd8a0c8, 0xf2d24a],
      [0xa8c0e8, 0xf0e08a],
    ];
    palette.forEach(([petal, core], variant) => {
      const list = flowers.filter((f) => f.variant === variant);
      if (list.length > 0) {
        this.addProps(flowerGeometry(petal, core), list, 0.05, 0.06, false, undefined, true);
      }
    });

    this.addGrass(cut(world.grass, quality.grass));
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

  private addGrass(list: PropInstance[]): void {
    const mat = new THREE.MeshStandardMaterial({
      map: grassTexture(),
      alphaTest: 0.45,
      side: THREE.DoubleSide,
      roughness: 1,
      metalness: 0,
    });
    this.applySway(mat, 0, 0.09);
    const mesh = new THREE.InstancedMesh(grassGeometry(), mat, Math.max(list.length, 1));
    mesh.count = list.length;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    const m = new THREE.Matrix4();
    const color = new THREE.Color();
    list.forEach((p, i) => {
      const s = 0.8 + p.scale * 0.7;
      m.compose(
        new THREE.Vector3(p.x, p.y, p.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot),
        new THREE.Vector3(s, s * (0.8 + p.scale * 0.5), s),
      );
      mesh.setMatrixAt(i, m);
      const v = 0.8 + ((p.x * 3.1 + p.z * 5.7) % 1) * 0.4;
      mesh.setColorAt(i, color.setRGB(v, v * 1.05, v * 0.85));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.group.add(mesh);
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
