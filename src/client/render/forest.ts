import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PropInstance, WorldData } from '../../shared/world/worldgen';
import { TreeType } from '../../shared/world/worldgen';

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

function rockGeometry(): THREE.BufferGeometry {
  const g = new THREE.DodecahedronGeometry(0.5, 0);
  g.scale(1, 0.65, 1.1);
  g.translate(0, 0.2, 0);
  return tint(g, 0x77746c);
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

/** Лес: несколько InstancedMesh на весь мир, поэтому вызовов отрисовки единицы. */
export class Forest {
  readonly group = new THREE.Group();
  private readonly time = { value: 0 };

  constructor(world: WorldData) {
    const trees = [
      { type: TreeType.Spruce, geo: spruceGeometry() },
      { type: TreeType.Pine, geo: pineGeometry() },
      { type: TreeType.Birch, geo: birchGeometry() },
    ];

    for (const { type, geo } of trees) {
      const list = world.trees.filter((t) => t.type === type);
      const mesh = this.makeInstanced(geo, list.length, 0.9, 0.014, true);
      const m = new THREE.Matrix4();
      const color = new THREE.Color();
      list.forEach((t, i) => {
        m.compose(
          new THREE.Vector3(t.x, t.y, t.z),
          new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot),
          new THREE.Vector3(t.scale, t.scale * (0.9 + (t.rot % 0.3)), t.scale),
        );
        mesh.setMatrixAt(i, m);
        // Небольшой разброс оттенка, чтобы лес не выглядел штампованным.
        const v = 0.86 + ((t.x * 13.7 + t.z * 7.3) % 1) * 0.28;
        mesh.setColorAt(i, color.setRGB(v * 0.98, v, v * 0.94));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      this.group.add(mesh);
    }

    this.addProps(bushGeometry(), world.bushes, 0.3, 0.02, true);
    this.addProps(rockGeometry(), world.rocks, 0, 0, true);
    this.addGrass(world.grass);
  }

  private makeInstanced(
    geo: THREE.BufferGeometry,
    count: number,
    swayBase: number,
    swayScale: number,
    shadow: boolean,
  ): THREE.InstancedMesh {
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.95,
      metalness: 0,
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
  ): void {
    const mesh = this.makeInstanced(geo, list.length, swayBase, swayScale, shadow);
    const m = new THREE.Matrix4();
    list.forEach((p, i) => {
      m.compose(
        new THREE.Vector3(p.x, p.y, p.z),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot),
        new THREE.Vector3(p.scale, p.scale, p.scale),
      );
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.group.add(mesh);
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

  update(dt: number): void {
    this.time.value += dt;
  }
}
