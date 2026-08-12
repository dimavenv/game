import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ANIMALS } from '../../shared/balance';
import type { Animal, AnimalKind } from '../../shared/animals';

/**
 * Звери. Каждый вид — одна склеенная геометрия и один InstancedMesh, поэтому
 * всё стадо стоит пяти вызовов отрисовки.
 *
 * Ноги при этом всё-таки шагают: у каждой вершины записано, к какой ноге она
 * относится и вокруг какой точки эта нога вращается, а фаза и размах шага
 * приходят отдельным инстансным атрибутом. Вся анимация считается в вершинном
 * шейдере, так что стадо остаётся бесплатным.
 */

/** Дешёвый детерминированный шум: им разбавляется окрас, чтобы шерсть не была плоской. */
function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Красит геометрию, слегка меняя тон каждой грани. При flatShading это
 * читается как неровная шерсть, а не как крашеный пластик.
 */
function tint(geo: THREE.BufferGeometry, hex: number, variation = 0.09): THREE.BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  const count = flat.attributes.position.count;
  const arr = new Float32Array(count * 3);
  const base = new THREE.Color(hex);
  for (let face = 0; face * 3 < count; face++) {
    const k = 1 + (hash(face + hex * 0.0001) - 0.5) * variation * 2;
    for (let v = 0; v < 3; v++) {
      const i = face * 3 + v;
      if (i >= count) break;
      arr[i * 3] = base.r * k;
      arr[i * 3 + 1] = base.g * k;
      arr[i * 3 + 2] = base.b * k;
    }
  }
  flat.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return flat;
}

/** Кусок зверя. Если задан pivot — это нога, и она будет качаться. */
interface Part {
  geo: THREE.BufferGeometry;
  pivot?: [number, number, number];
  /** Сдвиг фазы шага: диагональные ноги ходят в противофазе. */
  phase?: number;
}

interface Place {
  /** Наклоны вокруг осей, применяются до сдвига. */
  rx?: number;
  ry?: number;
  rz?: number;
  scale?: [number, number, number];
}

function put(geo: THREE.BufferGeometry, x: number, y: number, z: number, place: Place = {}): THREE.BufferGeometry {
  if (place.scale) geo.scale(place.scale[0], place.scale[1], place.scale[2]);
  if (place.rz) geo.rotateZ(place.rz);
  if (place.rx) geo.rotateX(place.rx);
  if (place.ry) geo.rotateY(place.ry);
  geo.translate(x, y, z);
  return geo;
}

/** Тело: капсула вдоль оси Z. Из неё же делаются шея, морда и хвост. */
function body(
  radius: number,
  length: number,
  hex: number,
  x: number,
  y: number,
  z: number,
  place: Place = {},
): THREE.BufferGeometry {
  const g = new THREE.CapsuleGeometry(radius, length, 3, 8);
  g.rotateX(Math.PI / 2);
  return tint(put(g, x, y, z, place), hex);
}

function ball(radius: number, hex: number, x: number, y: number, z: number, place: Place = {}): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(radius, 1);
  return tint(put(g, x, y, z, place), hex);
}

/** Конус-обрубок: уши, рога, клыки, морда. */
function cone(
  top: number,
  bottom: number,
  height: number,
  hex: number,
  x: number,
  y: number,
  z: number,
  place: Place = {},
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(top, bottom, height, 6, 1);
  return tint(put(g, x, y, z, place), hex);
}

function box(
  w: number,
  h: number,
  d: number,
  hex: number,
  x: number,
  y: number,
  z: number,
  place: Place = {},
): THREE.BufferGeometry {
  return tint(put(new THREE.BoxGeometry(w, h, d), x, y, z, place), hex);
}

/** Затемняет цвет поканально: умножать упакованное число нельзя. */
function shade(hex: number, k: number): number {
  const r = Math.round(Math.min(255, ((hex >> 16) & 255) * k));
  const g = Math.round(Math.min(255, ((hex >> 8) & 255) * k));
  const b = Math.round(Math.min(255, (hex & 255) * k));
  return (r << 16) | (g << 8) | b;
}

/** Пара тёмных бусин: с ними у зверя появляется морда, а не гладкий конец. */
function eyes(radius: number, dx: number, y: number, z: number): Part[] {
  return [
    { geo: ball(radius, 0x14100d, -dx, y, z) },
    { geo: ball(radius, 0x14100d, dx, y, z) },
  ];
}

interface LegSpec {
  hex: number;
  /** Половина расстояния между ногами по ширине. */
  spanX: number;
  /** Где стоят передние и задние ноги по длине. */
  frontZ: number;
  backZ: number;
  /** Высота от земли до бедра. */
  height: number;
  /** Толщина у бедра и у копыта. */
  top: number;
  bottom: number;
}

/**
 * Четыре ноги. Каждая — коническая, с пяткой внизу; вращается вокруг бедра,
 * а диагональные пары идут в противофазе, как у настоящего зверя.
 *
 * Нога нарочно уходит выше точки вращения и прикрыта бедром: иначе между
 * тонкой ногой и широким брюхом видна щель и зверь выглядит разобранным.
 */
function legs(spec: LegSpec): Part[] {
  const out: Part[] = [];
  // Насколько нога утоплена в тушу.
  const inset = spec.height * 0.3;
  for (const sx of [-1, 1]) {
    for (const [sz, z] of [
      [1, spec.frontZ],
      [-1, spec.backZ],
    ] as const) {
      const pivot: [number, number, number] = [sx * spec.spanX, spec.height, z];
      // Диагональ: левая передняя идёт вместе с правой задней.
      const phase = sx * sz > 0 ? 0 : Math.PI;
      out.push({
        geo: cone(
          spec.top * 1.35,
          spec.bottom,
          spec.height + inset,
          spec.hex,
          pivot[0],
          (spec.height + inset) / 2,
          z,
        ),
        pivot,
        phase,
      });
      // Бедро: шар вокруг точки вращения закрывает стык с тушей.
      out.push({
        geo: ball(spec.top * 2.6, spec.hex, pivot[0] * 0.8, spec.height + spec.top * 1.4, z, {
          scale: [0.75, 1, 1.15],
        }),
        pivot,
        phase,
      });
      // Копыто: тёмное и маленькое, иначе нога выглядит сваей.
      out.push({
        geo: box(
          spec.bottom * 1.7,
          spec.bottom * 1.4,
          spec.bottom * 2.2,
          shade(spec.hex, 0.45),
          pivot[0],
          spec.bottom * 0.7,
          z,
        ),
        pivot,
        phase,
      });
    }
  }
  return out;
}

/** Заяц: комок с длинными ушами, сидит низко и скачет. */
function buildHare(): Part[] {
  const fur = 0xa08a6a;
  const belly = 0xc6b393;
  return [
    { geo: body(0.14, 0.2, fur, 0, 0.25, -0.03, { scale: [1.05, 0.95, 1] }) },
    // Круп выше головы: заяц всегда чуть присел.
    { geo: ball(0.145, fur, 0, 0.29, -0.18, { scale: [1, 1, 0.9] }) },
    { geo: ball(0.09, fur, 0, 0.32, 0.21) },
    { geo: ball(0.04, belly, 0, 0.29, 0.3, { scale: [1, 0.8, 1] }) },
    ...eyes(0.018, 0.055, 0.35, 0.26),
    // Уши: длинные лопасти, отведённые назад.
    { geo: cone(0.022, 0.034, 0.22, fur, -0.05, 0.47, 0.13, { rx: -0.32, rz: 0.14 }) },
    { geo: cone(0.022, 0.034, 0.22, fur, 0.05, 0.47, 0.13, { rx: -0.32, rz: -0.14 }) },
    { geo: ball(0.055, 0xece7dd, 0, 0.28, -0.3) },
    ...legs({ hex: 0x8f7a5c, spanX: 0.085, frontZ: 0.11, backZ: -0.12, height: 0.16, top: 0.026, bottom: 0.016 }),
  ];
}

/** Кабан: горбатая спина, щетина и клыки. */
function buildBoar(): Part[] {
  const hide = 0x4a4038;
  const dark = 0x362e28;
  return [
    { geo: body(0.26, 0.34, hide, 0, 0.55, -0.1, { scale: [0.95, 1, 1] }) },
    // Загривок: у кабана он выше крестца, а к морде тело резко сужается.
    { geo: ball(0.25, dark, 0, 0.66, 0.06, { scale: [0.85, 0.8, 1.05] }) },
    { geo: body(0.15, 0.14, 0x51463c, 0, 0.51, 0.38, { rx: 0.3, scale: [0.95, 0.95, 1] }) },
    // Морда клином и пятак на конце.
    { geo: cone(0.07, 0.13, 0.24, 0x51463c, 0, 0.44, 0.6, { rx: Math.PI / 2 + 0.12 }) },
    { geo: ball(0.06, 0x241d19, 0, 0.41, 0.73, { scale: [1.2, 0.9, 0.4] }) },
    ...eyes(0.02, 0.09, 0.56, 0.47),
    // Клыки торчат вверх из-под пятака.
    { geo: cone(0.004, 0.016, 0.11, 0xe4dfd2, -0.07, 0.45, 0.63, { rx: -0.5, rz: 0.3 }) },
    { geo: cone(0.004, 0.016, 0.11, 0xe4dfd2, 0.07, 0.45, 0.63, { rx: -0.5, rz: -0.3 }) },
    { geo: cone(0.01, 0.05, 0.11, dark, -0.11, 0.64, 0.26, { rx: -0.3, rz: 0.4 }) },
    { geo: cone(0.01, 0.05, 0.11, dark, 0.11, 0.64, 0.26, { rx: -0.3, rz: -0.4 }) },
    { geo: cone(0.008, 0.02, 0.18, dark, 0, 0.62, -0.44, { rx: 1.1 }) },
    ...legs({ hex: 0x2f2822, spanX: 0.15, frontZ: 0.2, backZ: -0.24, height: 0.36, top: 0.042, bottom: 0.024 }),
  ];
}

/** Корова: бочка на ногах, пятна, рога и вымя. */
function buildCow(): Part[] {
  const white = 0xe6e2d8;
  const spot = 0x4a4038;
  return [
    { geo: body(0.33, 0.72, white, 0, 0.98, 0, { scale: [0.92, 1, 1] }) },
    // Пятна — приплюснутые накладки поверх бочки.
    { geo: ball(0.2, spot, 0.16, 1.12, -0.24, { scale: [0.8, 0.7, 1.5] }) },
    { geo: ball(0.17, spot, -0.22, 0.9, 0.2, { scale: [0.6, 1, 1.2] }) },
    { geo: ball(0.13, spot, 0.2, 0.86, 0.34, { scale: [0.6, 1, 1] }) },
    // Шея и голова.
    { geo: body(0.19, 0.22, white, 0, 1.09, 0.6, { rx: -0.35 }) },
    { geo: body(0.14, 0.24, white, 0, 1.14, 0.92, { rx: -0.15, scale: [1, 0.95, 1] }) },
    { geo: ball(0.11, 0xd8b0a8, 0, 1.09, 1.11, { scale: [1, 0.85, 0.8] }) },
    { geo: ball(0.09, spot, -0.03, 1.24, 0.86, { scale: [1.6, 0.7, 0.8] }) },
    ...eyes(0.026, 0.115, 1.19, 0.98),
    // Рога и уши.
    { geo: cone(0.012, 0.032, 0.19, 0xd8d2c0, -0.12, 1.3, 0.9, { rz: 0.9, rx: -0.2 }) },
    { geo: cone(0.012, 0.032, 0.19, 0xd8d2c0, 0.12, 1.3, 0.9, { rz: -0.9, rx: -0.2 }) },
    { geo: cone(0.015, 0.055, 0.13, white, -0.18, 1.2, 0.86, { rz: 1.2 }) },
    { geo: cone(0.015, 0.055, 0.13, white, 0.18, 1.2, 0.86, { rz: -1.2 }) },
    // Вымя и хвост с кисточкой.
    { geo: ball(0.15, 0xe0b4b0, 0, 0.66, -0.24, { scale: [1, 0.75, 1.1] }) },
    { geo: cone(0.02, 0.045, 0.55, white, 0, 0.9, -0.62, { rx: 0.25 }) },
    { geo: ball(0.07, spot, 0, 0.62, -0.68, { scale: [1, 1.4, 1] }) },
    ...legs({ hex: 0xd6d0c4, spanX: 0.19, frontZ: 0.38, backZ: -0.38, height: 0.64, top: 0.062, bottom: 0.036 }),
  ];
}

/** Косуля: тонкие ноги, длинная шея, рожки. */
function buildDeer(): Part[] {
  const coat = 0xa9744a;
  const light = 0xc79a72;
  return [
    { geo: body(0.21, 0.42, coat, 0, 0.86, -0.03, { scale: [0.9, 1, 1] }) },
    { geo: ball(0.19, coat, 0, 0.92, -0.24, { scale: [0.9, 0.95, 0.9] }) },
    // Шея почти вертикальная — по ней косулю и узнают.
    { geo: body(0.085, 0.34, coat, 0, 1.11, 0.28, { rx: -1.0 }) },
    { geo: body(0.075, 0.15, light, 0, 1.32, 0.44, { rx: -0.35 }) },
    { geo: ball(0.045, 0x3a2f26, 0, 1.26, 0.57, { scale: [1, 0.85, 0.9] }) },
    ...eyes(0.018, 0.062, 1.33, 0.47),
    // Рожки: короткая вилка.
    { geo: cone(0.008, 0.016, 0.2, 0x8a7050, -0.05, 1.48, 0.4, { rx: 0.2, rz: 0.15 }) },
    { geo: cone(0.008, 0.016, 0.2, 0x8a7050, 0.05, 1.48, 0.4, { rx: 0.2, rz: -0.15 }) },
    { geo: cone(0.006, 0.012, 0.09, 0x8a7050, -0.09, 1.55, 0.42, { rz: 0.7 }) },
    { geo: cone(0.006, 0.012, 0.09, 0x8a7050, 0.09, 1.55, 0.42, { rz: -0.7 }) },
    { geo: cone(0.012, 0.05, 0.14, light, -0.1, 1.36, 0.36, { rz: 1.1, rx: -0.3 }) },
    { geo: cone(0.012, 0.05, 0.14, light, 0.1, 1.36, 0.36, { rz: -1.1, rx: -0.3 }) },
    // Белое зеркало сзади.
    { geo: ball(0.11, 0xe8e2d4, 0, 0.9, -0.4, { scale: [1, 1, 0.5] }) },
    ...legs({ hex: 0x8a5f3c, spanX: 0.115, frontZ: 0.22, backZ: -0.23, height: 0.66, top: 0.032, bottom: 0.016 }),
  ];
}

/** Утка: тельце на воде, шея и клюв. Ноги под водой, их не видно. */
function buildDuck(): Part[] {
  const body_ = 0x6b5a3f;
  const head = 0x2f4a3a;
  return [
    { geo: body(0.13, 0.16, body_, 0, 0.11, -0.02, { scale: [0.9, 0.75, 1] }) },
    { geo: ball(0.1, 0x8a7550, 0, 0.14, -0.2, { scale: [0.9, 0.7, 1.3], rx: -0.4 }) },
    { geo: body(0.045, 0.12, head, 0, 0.25, 0.11, { rx: -0.5 }) },
    { geo: ball(0.07, head, 0, 0.34, 0.17, { scale: [0.9, 1, 1.1] }) },
    { geo: box(0.055, 0.028, 0.1, 0xd8a83a, 0, 0.32, 0.25, { rx: 0.15 }) },
    // Белое колечко на шее.
    { geo: ball(0.05, 0xe6e0d2, 0, 0.25, 0.11, { scale: [1, 0.35, 1] }) },
    ...eyes(0.013, 0.055, 0.36, 0.19),
  ];
}

const BUILDERS: Record<AnimalKind, () => Part[]> = {
  hare: buildHare,
  boar: buildBoar,
  cow: buildCow,
  deer: buildDeer,
  duck: buildDuck,
};

/**
 * Склеивает куски в одну геометрию и попутно записывает у каждой вершины,
 * какая она: тело или нога, и вокруг какой точки эта нога вращается.
 */
function assemble(parts: Part[]): THREE.BufferGeometry {
  const prepared = parts.map(({ geo, pivot, phase }) => {
    const flat = geo.index ? geo.toNonIndexed() : geo;
    const count = flat.attributes.position.count;
    const limb = new Float32Array(count * 2);
    const anchor = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      limb[i * 2] = pivot ? 1 : 0;
      limb[i * 2 + 1] = phase ?? 0;
      if (pivot) {
        anchor[i * 3] = pivot[0];
        anchor[i * 3 + 1] = pivot[1];
        anchor[i * 3 + 2] = pivot[2];
      }
    }
    flat.setAttribute('aLimb', new THREE.BufferAttribute(limb, 2));
    flat.setAttribute('aPivot', new THREE.BufferAttribute(anchor, 3));
    return flat;
  });
  const geo = mergeGeometries(prepared);
  if (!geo) throw new Error('Не удалось склеить геометрию зверя');
  return geo;
}

/** Материал с шагающими ногами: вся анимация — в вершинном шейдере. */
function animalMaterial(): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    flatShading: true,
    roughness: 0.94,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader =
      'attribute vec2 aLimb;\nattribute vec3 aPivot;\nattribute vec2 aGait;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        // aGait.x — фаза шага, aGait.y — размах. У тела aLimb.x равен нулю.
        if (aLimb.x > 0.5) {
          float ang = sin(aGait.x + aLimb.y) * aGait.y;
          vec3 rel = transformed - aPivot;
          float c = cos(ang);
          float s = sin(ang);
          transformed = aPivot + vec3(rel.x, c * rel.y - s * rel.z, s * rel.y + c * rel.z);
        }`,
      );
  };
  return material;
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export class AnimalsView {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<AnimalKind, THREE.InstancedMesh>();
  private readonly gaits = new Map<AnimalKind, THREE.InstancedBufferAttribute>();
  private readonly slots = new Map<number, { kind: AnimalKind; index: number }>();
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3(1, 1, 1);

  constructor(animals: Animal[]) {
    const counts = new Map<AnimalKind, number>();
    for (const a of animals) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);

    for (const [kind, count] of counts) {
      const total = Math.max(count, 1);
      const geometry = assemble(BUILDERS[kind]());
      const gait = new THREE.InstancedBufferAttribute(new Float32Array(total * 2), 2);
      gait.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('aGait', gait);

      const mesh = new THREE.InstancedMesh(geometry, animalMaterial(), total);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.set(kind, mesh);
      this.gaits.set(kind, gait);
      this.group.add(mesh);
    }

    const used = new Map<AnimalKind, number>();
    for (const a of animals) {
      const index = used.get(a.kind) ?? 0;
      used.set(a.kind, index + 1);
      this.slots.set(a.id, { kind: a.kind, index });
    }
  }

  sync(animals: Animal[], cameraX: number, cameraZ: number): void {
    const touched = new Set<AnimalKind>();

    for (const a of animals) {
      const slot = this.slots.get(a.id);
      if (!slot) continue;
      const mesh = this.meshes.get(slot.kind);
      const gait = this.gaits.get(slot.kind);
      if (!mesh || !gait) continue;
      touched.add(slot.kind);

      // Далёкие и давно павшие просто исчезают.
      const far = Math.hypot(a.x - cameraX, a.z - cameraZ) > ANIMALS.simulateRange;
      if (far || (a.state === 'dead' && a.deadFor > ANIMALS.respawn - 10)) {
        mesh.setMatrixAt(slot.index, HIDDEN);
        continue;
      }

      let pitch = 0;
      let roll = 0;
      let lift = 0;
      let swing = 0;
      const rate = a.kind === 'hare' || a.kind === 'deer' ? 7 : 5;

      if (a.state === 'dead') {
        // Заваливается на бок и оседает; ноги при этом торчат неподвижно.
        const t = Math.min(a.deadFor / 0.8, 1);
        roll = (Math.PI / 2) * t * t;
        lift = -0.1 * t;
      } else if (a.kind === 'duck') {
        // Утку качает на волне.
        lift = Math.sin(a.phase * 1.6) * 0.03;
        roll = Math.sin(a.phase * 1.1) * 0.06;
      } else if (a.speed > 0.05) {
        const bounce = Math.abs(Math.sin(a.phase * rate));
        // Заяц и косуля скачут, копытные переваливаются.
        lift = a.kind === 'hare' || a.kind === 'deer' ? bounce * a.speed * 0.045 : bounce * 0.035;
        pitch = Math.sin(a.phase * rate) * (a.kind === 'hare' ? 0.22 : 0.07);
        roll = Math.sin(a.phase * rate * 0.5) * 0.06;
        // Чем быстрее бежит, тем шире шаг — но нога не должна уходить в шпагат.
        swing = Math.min(0.16 + a.speed * 0.07, 0.42);
      } else {
        // На пастьбе зверь опускает голову и переминается.
        pitch = 0.12 + Math.sin(a.phase * 0.8) * 0.06;
        swing = 0.04;
      }

      gait.setXY(slot.index, a.phase * rate, swing);
      this.position.set(a.x, a.y + lift, a.z);
      this.euler.set(pitch, a.yaw, roll, 'YXZ');
      this.quaternion.setFromEuler(this.euler);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      mesh.setMatrixAt(slot.index, this.matrix);
    }

    for (const kind of touched) {
      const mesh = this.meshes.get(kind);
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
      const gait = this.gaits.get(kind);
      if (gait) gait.needsUpdate = true;
    }
  }
}
