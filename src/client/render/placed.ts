import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLUEPRINTS, type BlueprintId, type PlacedStructure } from '../../shared/world/building';

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
  if (!geo) throw new Error('Не удалось склеить постройку');
  return geo;
}

function box(w: number, h: number, d: number, hex: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return tint(g, hex);
}

function post(r: number, h: number, hex: number, x: number, y: number, z: number, segments = 7): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r * 1.15, h, segments);
  g.translate(x, y + h / 2, z);
  return tint(g, hex);
}

const WOOD = 0x6d5334;
const DARK_WOOD = 0x53422c;
const STONE = 0x7b7871;

/** Геометрия каждой заготовки. Начало координат — центр основания. */
function geometryFor(kind: BlueprintId): THREE.BufferGeometry {
  switch (kind) {
    case 'press':
      return merge([
        // Чан на ножках и рычаг сверху.
        box(2.0, 0.16, 2.0, DARK_WOOD, 0, 0.08, 0),
        ...[-0.85, 0.85].flatMap((dx) => [-0.85, 0.85].map((dz) => post(0.09, 0.5, DARK_WOOD, dx, 0.16, dz))),
        box(2.0, 0.7, 0.14, WOOD, 0, 1.0, -0.93),
        box(2.0, 0.7, 0.14, WOOD, 0, 1.0, 0.93),
        box(0.14, 0.7, 1.86, WOOD, -0.93, 1.0, 0),
        box(0.14, 0.7, 1.86, WOOD, 0.93, 1.0, 0),
        box(1.7, 0.1, 1.7, 0x6a2f3a, 0, 0.72, 0),
        post(0.06, 1.1, 0x8a6a42, 0, 1.35, 0, 6),
      ]);

    case 'cellar':
      return merge([
        // Каменное основание, дощатая крыша, торцы бочек.
        box(4.4, 0.9, 3.6, STONE, 0, 0.45, 0),
        box(4.6, 0.18, 3.8, DARK_WOOD, 0, 0.98, 0),
        box(4.0, 1.1, 0.2, WOOD, 0, 1.6, -1.7),
        box(4.0, 1.1, 0.2, WOOD, 0, 1.6, 1.7),
        box(0.2, 1.1, 3.4, WOOD, -2.1, 1.6, 0),
        box(0.2, 1.1, 3.4, WOOD, 2.1, 1.6, 0),
        box(4.6, 0.16, 3.9, 0x4a4038, 0, 2.2, 0),
        ...[-1.2, 0, 1.2].map((dx) => {
          const barrel = new THREE.CylinderGeometry(0.42, 0.42, 0.9, 10);
          barrel.rotateZ(Math.PI / 2);
          barrel.translate(dx, 1.5, 1.35);
          return tint(barrel, 0x5c3f28);
        }),
      ]);

    case 'palisade':
      return merge(
        Array.from({ length: 7 }, (_, i) => {
          const x = -1.35 + i * 0.45;
          const h = 2.1 + ((i * 37) % 5) * 0.06;
          return post(0.16, h, WOOD, x, 0, 0);
        }).concat([box(3.0, 0.12, 0.1, DARK_WOOD, 0, 1.5, 0.13)]),
      );

    case 'gate':
      return merge([
        post(0.19, 2.6, DARK_WOOD, -1.5, 0, 0),
        post(0.19, 2.6, DARK_WOOD, 1.5, 0, 0),
        box(3.2, 0.2, 0.18, DARK_WOOD, 0, 2.5, 0),
        box(2.6, 1.5, 0.1, WOOD, 0, 0.9, 0.06),
      ]);

    case 'chest':
      return merge([
        box(1.1, 0.5, 0.76, WOOD, 0, 0.25, 0),
        box(1.14, 0.16, 0.8, DARK_WOOD, 0, 0.56, 0),
        box(0.12, 0.42, 0.8, DARK_WOOD, -0.4, 0.25, 0),
        box(0.12, 0.42, 0.8, DARK_WOOD, 0.4, 0.25, 0),
        box(0.1, 0.12, 0.06, 0x8a8f95, 0, 0.42, 0.4),
      ]);

    case 'pier':
      return merge([
        box(2.2, 0.14, 6.4, WOOD, 0, 0.36, 0),
        ...[-0.9, 0.9].flatMap((dx) =>
          [-2.8, -1.4, 0, 1.4, 2.8].map((dz) => post(0.11, 1.4, DARK_WOOD, dx, -1.0, dz, 6)),
        ),
      ]);

    case 'vine':
      // Лозу рисует отдельный модуль, здесь нужен только призрак.
      return merge([
        post(0.07, 1.7, WOOD, -0.7, 0, 0),
        post(0.07, 1.7, WOOD, 0.7, 0, 0),
        box(1.6, 0.1, 0.1, WOOD, 0, 1.6, 0),
        box(1.5, 0.7, 0.7, 0x4f7a35, 0, 1.75, 0),
      ]);

    case 'smokehouse':
      return merge([
        box(1.6, 1.2, 1.6, STONE, 0, 0.6, 0),
        box(1.7, 0.14, 1.7, DARK_WOOD, 0, 1.26, 0),
        box(0.9, 0.5, 0.9, WOOD, 0, 1.55, 0),
        post(0.16, 0.5, 0x4a4038, 0, 1.8, 0, 6),
        box(0.7, 0.6, 0.1, 0x3a2c22, 0, 0.55, 0.81),
      ]);
  }
}

/** Готовые меши построек плюс полупрозрачный призрак под установку. */
export class PlacedStructures {
  readonly group = new THREE.Group();
  readonly ghost = new THREE.Group();

  private readonly geometries = new Map<BlueprintId, THREE.BufferGeometry>();
  private readonly meshes = new Map<number, THREE.Object3D>();
  private readonly material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.95,
  });
  private readonly ghostMaterial = new THREE.MeshBasicMaterial({
    color: 0x9fe08a,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  private ghostMesh: THREE.Mesh | null = null;
  private ghostKind: BlueprintId | null = null;

  constructor() {
    this.group.add(this.ghost);
  }

  private geometry(kind: BlueprintId): THREE.BufferGeometry {
    let geo = this.geometries.get(kind);
    if (!geo) {
      geo = geometryFor(kind);
      this.geometries.set(kind, geo);
    }
    return geo;
  }

  /** Досоздаёт меши для новых построек и убирает исчезнувшие. */
  sync(structures: PlacedStructure[]): void {
    const alive = new Set<number>();
    for (const s of structures) {
      if (s.kind === 'vine') continue;
      alive.add(s.id);
      if (this.meshes.has(s.id)) continue;
      const mesh = new THREE.Mesh(this.geometry(s.kind), this.material);
      mesh.position.set(s.x, s.y, s.z);
      mesh.rotation.y = s.rot;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      this.meshes.set(s.id, mesh);
    }
    for (const [id, mesh] of this.meshes) {
      if (alive.has(id)) continue;
      this.group.remove(mesh);
      this.meshes.delete(id);
    }
  }

  /** Призрак под курсором: зелёный — можно ставить, красный — нельзя. */
  showGhost(kind: BlueprintId, x: number, y: number, z: number, rot: number, valid: boolean): void {
    if (this.ghostKind !== kind) {
      if (this.ghostMesh) this.ghost.remove(this.ghostMesh);
      this.ghostMesh = new THREE.Mesh(this.geometry(kind), this.ghostMaterial);
      this.ghostMesh.frustumCulled = false;
      this.ghost.add(this.ghostMesh);
      this.ghostKind = kind;
    }
    if (!this.ghostMesh) return;
    this.ghostMesh.visible = true;
    this.ghostMesh.position.set(x, y, z);
    this.ghostMesh.rotation.y = rot;
    this.ghostMaterial.color.setHex(valid ? 0x9fe08a : 0xe07a6a);
  }

  hideGhost(): void {
    if (this.ghostMesh) this.ghostMesh.visible = false;
  }

  /** Габарит заготовки — по нему считается, куда можно вставать. */
  static footprint(kind: BlueprintId): { hw: number; hd: number } {
    const blueprint = BLUEPRINTS[kind];
    return { hw: blueprint.hw, hd: blueprint.hd };
  }
}
