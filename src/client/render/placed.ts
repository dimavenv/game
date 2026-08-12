import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CRAFT } from '../../shared/balance';
import { buildFire, type FireHandle } from './fire';
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

/** Обруч на бочке. */
function hoop(radius: number, y: number, hex: number): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(radius, 0.026, 4, 12);
  g.rotateX(Math.PI / 2);
  g.translate(0, y, 0);
  return tint(g, hex);
}

/** Высота дна давильни над её основанием: сюда встаёт игрок. */
export const PRESS_FLOOR = 0.79;

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
        // Дно чана: на нём и топчутся, поэтому оно должно быть настоящим.
        box(1.86, 0.14, 1.86, DARK_WOOD, 0, PRESS_FLOOR - 0.07, 0),
        box(2.0, 0.7, 0.14, WOOD, 0, 1.0, -0.93),
        box(2.0, 0.7, 0.14, WOOD, 0, 1.0, 0.93),
        box(0.14, 0.7, 1.86, WOOD, -0.93, 1.0, 0),
        box(0.14, 0.7, 1.86, WOOD, 0.93, 1.0, 0),
        post(0.06, 1.1, 0x8a6a42, 0, 1.35, 0, 6),
      ]);

    case 'cellar': {
      // Открытый навес: задняя и боковые стены, спереди видны бочки на стойке.
      const parts: THREE.BufferGeometry[] = [
        box(4.4, 0.3, 3.6, STONE, 0, 0.15, 0),
        // Задняя стена и половинки боковых — внутрь видно.
        box(4.4, 2.0, 0.3, STONE, 0, 1.3, -1.65),
        box(0.3, 2.0, 2.2, STONE, -2.05, 1.3, -0.5),
        box(0.3, 2.0, 2.2, STONE, 2.05, 1.3, -0.5),
        // Столбы по открытому фасаду и балка над ними.
        post(0.12, 2.3, DARK_WOOD, -2.0, 0.3, 1.6),
        post(0.12, 2.3, DARK_WOOD, 2.0, 0.3, 1.6),
        box(4.5, 0.18, 0.18, DARK_WOOD, 0, 2.6, 1.6),
        // Стойка под бочки.
        box(4.0, 0.16, 1.0, DARK_WOOD, 0, 0.72, -0.5),
        box(4.0, 0.16, 1.0, DARK_WOOD, 0, 1.62, -0.5),
      ];

      // Бочки в два яруса, лежат на боку — торцы смотрят наружу.
      for (const [dx, dy] of [
        [-1.25, 1.12],
        [0, 1.12],
        [1.25, 1.12],
        [-0.62, 2.02],
        [0.62, 2.02],
      ]) {
        const barrel = new THREE.CylinderGeometry(0.36, 0.36, 0.86, 10);
        barrel.rotateX(Math.PI / 2);
        barrel.translate(dx, dy, -0.5);
        parts.push(tint(barrel, 0x5c3f28));
        const hoop = new THREE.TorusGeometry(0.37, 0.03, 4, 10);
        hoop.translate(dx, dy, -0.12);
        parts.push(tint(hoop, 0x3f3a34));
      }

      // Двускатная крыша поверх стен.
      for (const dir of [-1, 1]) {
        const slab = new THREE.BoxGeometry(4.9, 0.14, 2.35);
        slab.rotateX(dir * 0.42);
        slab.translate(0, 2.95, dir * 1.05);
        parts.push(tint(slab, 0x4a4038));
      }
      return merge(parts);
    }

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

    case 'flag':
      // Шест с красным полотнищем: издалека видно, а на карте появляется метка.
      return merge([
        post(0.035, 1.7, DARK_WOOD, 0, 0, 0, 6),
        box(0.42, 0.26, 0.03, 0xb8402c, 0.21, 1.5, 0),
        box(0.42, 0.26, 0.03, 0x8f2f20, 0.21, 1.22, 0),
        box(0.1, 0.06, 0.1, 0x6b6353, 0, 1.72, 0),
      ]);

    case 'campfire':
      // Кольцо камней и шалаш из поленьев: сам огонь добавляется отдельно.
      return merge([
        ...Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2;
          const stone = new THREE.DodecahedronGeometry(0.15 + (i % 3) * 0.025, 0);
          stone.scale(1, 0.55, 1);
          stone.rotateY(i * 1.4);
          stone.translate(Math.cos(a) * 0.62, 0.05, Math.sin(a) * 0.62);
          return tint(stone, i % 3 === 0 ? 0x5d5850 : 0x7a746a);
        }),
        ...Array.from({ length: 4 }, (_, i) => {
          const log = new THREE.CylinderGeometry(0.06, 0.075, 0.8, 6);
          log.rotateZ(Math.PI / 2 - 0.45);
          log.rotateY((i / 4) * Math.PI * 2);
          log.translate(0, 0.16, 0);
          return tint(log, 0x3a2c1e);
        }),
      ]);

    case 'dryer': {
      // Голая рама: шкуры на ней появляются по мере того, как их вешают.
      return merge([
        post(0.1, 2.0, DARK_WOOD, -1.15, 0, 0),
        post(0.1, 2.0, DARK_WOOD, 1.15, 0, 0),
        box(2.6, 0.12, 0.12, WOOD, 0, 1.95, 0),
        box(2.4, 0.08, 0.08, WOOD, 0, 1.2, 0),
        // Косые укосины, чтобы рама не выглядела двумя палками.
        box(0.06, 0.06, 0.9, DARK_WOOD, -1.15, 1.9, 0.42),
        box(0.06, 0.06, 0.9, DARK_WOOD, 1.15, 1.9, 0.42),
      ]);
    }

    case 'filter': {
      // Бочка на камнях, сверху воронка с углём и песком, снизу кран.
      return merge([
        box(1.4, 0.28, 1.4, STONE, 0, 0.14, 0),
        post(0.5, 0.95, WOOD, 0, 0.28, 0, 10),
        // Обручи на бочке.
        ...[0.45, 0.75, 1.05].map((y) => hoop(0.52, y, 0x4a4038)),
        box(1.12, 0.1, 1.12, DARK_WOOD, 0, 1.25, 0),
        post(0.34, 0.42, 0x8a6a48, 0, 1.3, 0, 8),
        post(0.24, 0.16, 0x4a4038, 0, 1.72, 0, 8),
        box(0.1, 0.1, 0.34, 0x6b6353, 0, 0.62, 0.5),
        // Жёлоб под краном: сюда капает готовая вода.
        box(0.34, 0.06, 0.3, DARK_WOOD, 0, 0.34, 0.62),
      ]);
    }
  }
}

/**
 * Содержимое построек: шкуры на сушилке и вода в очистителе. Рисуется
 * отдельными детьми, потому что меняется по ходу игры, а сама постройка нет.
 */
const HIDE_SLOTS = 5;

const RAW_HIDE = new THREE.MeshStandardMaterial({ color: 0x7a5a3c, roughness: 1, flatShading: true });
const DRY_HIDE = new THREE.MeshStandardMaterial({ color: 0xc2a37a, roughness: 0.9, flatShading: true });
const DIRTY_WATER = new THREE.MeshStandardMaterial({ color: 0x6b6448, roughness: 0.35, flatShading: true });
const CLEAN_WATER = new THREE.MeshStandardMaterial({
  color: 0x8ec6d8,
  roughness: 0.15,
  metalness: 0.1,
  transparent: true,
  opacity: 0.85,
  flatShading: true,
});
const MUST = new THREE.MeshStandardMaterial({ color: 0x5e1f2e, roughness: 0.3, flatShading: true });
const GLASS = new THREE.MeshStandardMaterial({
  color: 0xcfe0e4,
  roughness: 0.1,
  transparent: true,
  opacity: 0.5,
});

/** Дерево и камень всех построек: один материал на всё. */
const STRUCTURE_MATERIAL = new THREE.MeshStandardMaterial({
  vertexColors: true,
  flatShading: true,
  roughness: 0.95,
});

/**
 * Материалы построек. Постройки появляются уже после сборки сцены, поэтому
 * сезонная раскраска не найдёт их обходом дерева — их подключают вручную.
 */
export const PLACED_MATERIALS: THREE.Material[] = [
  STRUCTURE_MATERIAL,
  RAW_HIDE,
  DRY_HIDE,
  MUST,
  DIRTY_WATER,
  CLEAN_WATER,
  GLASS,
];

/** Одна шкура на жерди: провисает и слегка мнётся. */
function hideMesh(index: number): THREE.Mesh {
  const width = 0.44;
  const height = 0.66;
  const geo = new THREE.PlaneGeometry(width, height, 3, 3);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    // Края обвисают, низ уходит вперёд: получается кожа, а не картонка.
    const sag = (1 - Math.abs(x) / (width / 2)) * 0.06;
    const belly = (0.5 - y / height) * 0.1;
    pos.setZ(i, sag + belly + (((i * 37) % 7) - 3) * 0.004);
    if (Math.abs(x) > width * 0.4) pos.setY(i, y - 0.03);
  }
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, RAW_HIDE);
  mesh.position.set(-0.92 + index * 0.46, 1.55, 0);
  mesh.castShadow = true;
  return mesh;
}

/** Прищепка, на которой держится шкура. */
function pegMesh(index: number): THREE.Mesh {
  const geo = new THREE.BoxGeometry(0.07, 0.15, 0.06);
  const mesh = new THREE.Mesh(geo, DRY_HIDE);
  mesh.position.set(-0.92 + index * 0.46, 1.92, 0);
  return mesh;
}

/** Готовые меши построек плюс полупрозрачный призрак под установку. */
export class PlacedStructures {
  readonly group = new THREE.Group();
  readonly ghost = new THREE.Group();

  private readonly geometries = new Map<BlueprintId, THREE.BufferGeometry>();
  private readonly meshes = new Map<number, THREE.Object3D>();
  /** Содержимое: шкуры на сушилке, вода в очистителе. */
  private readonly contents = new Map<number, THREE.Object3D[]>();
  /** Огонь в поставленных костpах: у каждого свой, и его надо шевелить. */
  private readonly fires = new Map<number, { fire: FireHandle; light: THREE.PointLight }>();
  private readonly material = STRUCTURE_MATERIAL;
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
  sync(structures: PlacedStructure[], day: number): void {
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
      this.addContents(s, mesh);
      this.group.add(mesh);
      this.meshes.set(s.id, mesh);
    }

    // Содержимое обновляем каждый кадр: шкуры вешают и снимают, вода капает.
    for (const s of structures) this.updateContents(s, day);
    for (const [id, mesh] of this.meshes) {
      if (alive.has(id)) continue;
      this.group.remove(mesh);
      this.meshes.delete(id);
      this.contents.delete(id);
      this.fires.delete(id);
    }
  }

  /** Заводит детей под содержимое: сами по себе они не меняются, только видимость. */
  private addContents(s: PlacedStructure, parent: THREE.Object3D): void {
    if (s.kind === 'dryer') {
      const items: THREE.Object3D[] = [];
      for (let i = 0; i < HIDE_SLOTS; i++) {
        const hide = hideMesh(i);
        const peg = pegMesh(i);
        hide.visible = false;
        peg.visible = false;
        parent.add(hide, peg);
        items.push(hide, peg);
      }
      this.contents.set(s.id, items);
      return;
    }

    if (s.kind === 'campfire') {
      const fire = buildFire(0.8);
      fire.group.position.y = 0.12;
      const light = new THREE.PointLight(0xff8a30, 0, 14, 2);
      light.position.y = 0.7;
      parent.add(fire.group, light);
      this.fires.set(s.id, { fire, light });
      return;
    }

    if (s.kind === 'press') {
      // Мезга в чане: её тем больше, чем больше натоптано.
      const pulp = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.1, 1.7), MUST);
      pulp.position.set(0, PRESS_FLOOR + 0.05, 0);
      parent.add(pulp);
      this.contents.set(s.id, [pulp]);
      return;
    }

    if (s.kind === 'filter') {
      // Мутная вода в воронке, чистая в жёлобе и пара бутылок рядом.
      const dirty = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.3, 10), DIRTY_WATER);
      dirty.position.set(0, 1.46, 0);
      const clean = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.24), CLEAN_WATER);
      clean.position.set(0, 0.38, 0.62);
      const bottles: THREE.Object3D[] = [];
      for (let i = 0; i < 3; i++) {
        const bottle = new THREE.Group();
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.2, 7), GLASS);
        body.position.y = 0.1;
        const water = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.15, 7), CLEAN_WATER);
        water.position.y = 0.085;
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, 0.07, 6), GLASS);
        neck.position.y = 0.23;
        bottle.add(body, water, neck);
        bottle.position.set(-0.24 + i * 0.24, 0.28, 0.78);
        bottles.push(bottle);
      }
      parent.add(dirty, clean, ...bottles);
      this.contents.set(s.id, [dirty, clean, ...bottles]);
    }
  }

  /** Показывает ровно столько шкур и воды, сколько лежит в постройке. */
  private updateContents(s: PlacedStructure, day: number): void {
    const items = this.contents.get(s.id);
    if (!items) return;

    if (s.kind === 'dryer') {
      // Сначала готовая кожа, потом ещё сырые шкуры.
      const groups = s.hides ?? [];
      let shown = 0;
      const states: boolean[] = [];
      for (const group of groups) {
        for (let i = 0; i < group.count && states.length < HIDE_SLOTS; i++) {
          states.push(day - group.startedDay >= CRAFT.dryDays);
        }
      }
      for (let i = 0; i < HIDE_SLOTS; i++) {
        const hide = items[i * 2] as THREE.Mesh;
        const peg = items[i * 2 + 1];
        const on = i < states.length;
        hide.visible = on;
        peg.visible = on;
        if (on) {
          hide.material = states[i] ? DRY_HIDE : RAW_HIDE;
          shown++;
        }
      }
      // Больше пяти в кадре не показываем, но игроку об этом знать незачем.
      void shown;
      return;
    }

    if (s.kind === 'campfire') {
      const handle = this.fires.get(s.id);
      if (handle) {
        // Догорающий костёр слабеет, а не гаснет разом.
        const left = s.fuel ?? 0;
        const strength = left <= 0 ? 0 : Math.min(1, 0.35 + left / 400);
        handle.fire.set(strength);
        handle.light.intensity = strength * 6;
      }
      return;
    }

    if (s.kind === 'press') {
      // Первая порция уже мажет дно, дальше слой растёт до половины чана.
      const level = Math.min((s.juice ?? 0) / 6, 1);
      const pulp = items[0];
      pulp.scale.y = 0.4 + level * 2.6;
      pulp.position.y = PRESS_FLOOR + pulp.scale.y * 0.05;
      pulp.visible = (s.juice ?? 0) > 0;
      return;
    }

    if (s.kind === 'filter') {
      const tank = s.water ?? { dirty: 0, clean: 0, timer: 0 };
      const dirty = items[0] as THREE.Mesh;
      const clean = items[1];
      dirty.visible = tank.dirty > 0;
      if (dirty.visible) {
        const fill = Math.min(tank.dirty / 4, 1);
        dirty.scale.y = 0.25 + fill * 0.75;
        dirty.position.y = 1.34 + dirty.scale.y * 0.15;
      }
      clean.visible = tank.clean > 0;
      for (let i = 0; i < 3; i++) items[2 + i].visible = tank.clean > i;
    }
  }

  /** Огонь во всех поставленных кострах шевелится сам. */
  update(dt: number): void {
    for (const { fire } of this.fires.values()) fire.update(dt);
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
