import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ANIMALS } from '../../shared/balance';
import type { Animal, AnimalKind } from '../../shared/animals';

/**
 * Звери. Каждый вид — одна склеенная геометрия и один InstancedMesh, поэтому
 * всё стадо стоит пяти вызовов отрисовки. Ноги отдельно не шевелятся: на
 * ходу зверя качает и подбрасывает, а этого хватает, чтобы он был живым.
 */

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
  if (!geo) throw new Error('Не удалось склеить геометрию зверя');
  return geo;
}

function box(w: number, h: number, d: number, hex: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return tint(g, hex);
}

function blob(r: number, hex: number, x: number, y: number, z: number, scale: [number, number, number]): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.scale(scale[0], scale[1], scale[2]);
  g.translate(x, y, z);
  return tint(g, hex);
}

/** Четыре ноги под туловищем: одинаковые бруски по углам. */
function legs(hex: number, spanX: number, spanZ: number, height: number, thick: number): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      out.push(box(thick, height, thick, hex, sx * spanX, height / 2, sz * spanZ));
    }
  }
  return out;
}

/** Заяц: комок с длинными ушами, сидит низко. */
function buildHare(): THREE.BufferGeometry {
  const fur = 0xa08a6a;
  const parts: THREE.BufferGeometry[] = [
    blob(0.15, fur, 0, 0.2, 0, [1.2, 0.95, 1.5]),
    blob(0.09, fur, 0, 0.28, 0.19, [1, 1, 1.1]),
    // Уши.
    box(0.035, 0.16, 0.05, fur, -0.05, 0.42, 0.16),
    box(0.035, 0.16, 0.05, fur, 0.05, 0.42, 0.17),
    // Хвостик и лапы.
    blob(0.045, 0xe8e4dc, 0, 0.21, -0.21, [1, 1, 1]),
    ...legs(0x8f7a5c, 0.075, 0.09, 0.13, 0.045),
  ];
  return merge(parts);
}

/** Кабан: горбатая спина, щетина, клыки. */
function buildBoar(): THREE.BufferGeometry {
  const hide = 0x4a4038;
  const parts: THREE.BufferGeometry[] = [
    blob(0.34, hide, 0, 0.52, -0.05, [1.05, 0.95, 1.5]),
    blob(0.24, 0x3c332c, 0, 0.62, 0.12, [1, 1, 1]),
    // Голова клином и пятак.
    blob(0.19, 0x453b33, 0, 0.46, 0.46, [1, 0.9, 1.2]),
    box(0.12, 0.1, 0.1, 0x2f2822, 0, 0.42, 0.63),
    // Клыки.
    box(0.03, 0.03, 0.11, 0xe4dfd2, -0.08, 0.4, 0.62),
    box(0.03, 0.03, 0.11, 0xe4dfd2, 0.08, 0.4, 0.62),
    // Уши и хвост.
    box(0.07, 0.09, 0.04, 0x352d27, -0.11, 0.6, 0.34),
    box(0.07, 0.09, 0.04, 0x352d27, 0.11, 0.6, 0.34),
    box(0.04, 0.04, 0.16, 0x352d27, 0, 0.6, -0.5),
    ...legs(0x2f2822, 0.17, 0.28, 0.34, 0.09),
  ];
  return merge(parts);
}

/** Корова: пятнистая туша, рога, вымя, кисточка на хвосте. */
function buildCow(): THREE.BufferGeometry {
  const white = 0xe6e2d8;
  const spot = 0x4a4038;
  const parts: THREE.BufferGeometry[] = [
    box(0.62, 0.66, 1.35, white, 0, 0.95, 0),
    // Пятна: просто накладки чуть большего размера по бокам.
    box(0.64, 0.26, 0.4, spot, 0, 1.06, -0.28),
    box(0.64, 0.2, 0.3, spot, 0, 0.82, 0.35),
    // Шея и голова.
    box(0.34, 0.34, 0.36, white, 0, 1.06, 0.78),
    box(0.3, 0.3, 0.34, spot, 0, 1.02, 1.02),
    box(0.24, 0.16, 0.12, 0xd8b0a8, 0, 0.96, 1.2),
    // Рога и уши.
    box(0.06, 0.06, 0.2, 0xd8d2c0, -0.13, 1.2, 1.02),
    box(0.06, 0.06, 0.2, 0xd8d2c0, 0.13, 1.2, 1.02),
    box(0.14, 0.06, 0.08, white, -0.2, 1.1, 0.98),
    box(0.14, 0.06, 0.08, white, 0.2, 1.1, 0.98),
    // Вымя и хвост.
    blob(0.16, 0xe0b4b0, 0, 0.66, -0.3, [1, 0.8, 1.1]),
    box(0.06, 0.5, 0.06, white, 0, 0.88, -0.72),
    box(0.09, 0.14, 0.09, spot, 0, 0.6, -0.72),
    ...legs(0x8a8478, 0.24, 0.48, 0.62, 0.13),
  ];
  return merge(parts);
}

/** Косуля: тонкие ноги, длинная шея, рожки. */
function buildDeer(): THREE.BufferGeometry {
  const coat = 0xa9744a;
  const light = 0xc79a72;
  const parts: THREE.BufferGeometry[] = [
    blob(0.32, coat, 0, 0.82, -0.05, [0.95, 0.9, 1.5]),
    box(0.18, 0.42, 0.2, coat, 0, 1.05, 0.36),
    blob(0.14, light, 0, 1.28, 0.46, [1, 0.9, 1.3]),
    box(0.1, 0.08, 0.12, 0x3a2f26, 0, 1.24, 0.62),
    // Рожки и уши.
    box(0.035, 0.24, 0.035, 0x8a7050, -0.06, 1.44, 0.42),
    box(0.035, 0.24, 0.035, 0x8a7050, 0.06, 1.44, 0.42),
    box(0.12, 0.08, 0.05, light, -0.13, 1.34, 0.38),
    box(0.12, 0.08, 0.05, light, 0.13, 1.34, 0.38),
    // Белое зеркало сзади и хвостик.
    blob(0.12, 0xe8e2d4, 0, 0.86, -0.44, [1, 1, 0.6]),
    ...legs(0x8a5f3c, 0.16, 0.3, 0.62, 0.065),
  ];
  return merge(parts);
}

/** Утка: тельце на воде, шея и клюв. */
function buildDuck(): THREE.BufferGeometry {
  const body = 0x6b5a3f;
  const parts: THREE.BufferGeometry[] = [
    blob(0.16, body, 0, 0.1, 0, [1.1, 0.8, 1.5]),
    box(0.08, 0.18, 0.08, 0x2f4a3a, 0, 0.22, 0.12),
    blob(0.08, 0x2f4a3a, 0, 0.33, 0.15, [1, 1, 1.1]),
    box(0.06, 0.04, 0.11, 0xd8a83a, 0, 0.31, 0.24),
    blob(0.09, 0x8a7550, 0, 0.13, -0.18, [1, 0.7, 1]),
  ];
  return merge(parts);
}

const BUILDERS: Record<AnimalKind, () => THREE.BufferGeometry> = {
  hare: buildHare,
  boar: buildBoar,
  cow: buildCow,
  deer: buildDeer,
  duck: buildDuck,
};

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

export class AnimalsView {
  readonly group = new THREE.Group();
  private readonly meshes = new Map<AnimalKind, THREE.InstancedMesh>();
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
      const mesh = new THREE.InstancedMesh(
        BUILDERS[kind](),
        new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 }),
        Math.max(count, 1),
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.meshes.set(kind, mesh);
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
      if (!mesh) continue;
      touched.add(slot.kind);

      // Далёкие и давно павшие просто исчезают.
      const far = Math.hypot(a.x - cameraX, a.z - cameraZ) > ANIMALS.simulateRange;
      if (far || (a.state === 'dead' && a.deadFor > 40)) {
        mesh.setMatrixAt(slot.index, HIDDEN);
        continue;
      }

      let pitch = 0;
      let roll = 0;
      let lift = 0;

      if (a.state === 'dead') {
        // Заваливается на бок и оседает.
        const t = Math.min(a.deadFor / 0.8, 1);
        roll = (Math.PI / 2) * t * t;
        lift = -0.1 * t;
      } else if (a.kind === 'duck') {
        // Утку качает на волне.
        lift = Math.sin(a.phase * 1.6) * 0.03;
        roll = Math.sin(a.phase * 1.1) * 0.06;
      } else if (a.speed > 0.05) {
        const gait = a.kind === 'hare' || a.kind === 'deer' ? 7 : 5;
        const bounce = Math.abs(Math.sin(a.phase * gait));
        // Заяц и косуля скачут, копытные переваливаются.
        lift = a.kind === 'hare' || a.kind === 'deer' ? bounce * a.speed * 0.045 : bounce * 0.035;
        pitch = Math.sin(a.phase * gait) * (a.kind === 'hare' ? 0.22 : 0.07);
        roll = Math.sin(a.phase * gait * 0.5) * 0.06;
      } else {
        // На пастьбе зверь опускает голову.
        pitch = 0.12 + Math.sin(a.phase * 0.8) * 0.06;
      }

      this.position.set(a.x, a.y + lift, a.z);
      this.euler.set(pitch, a.yaw, roll, 'YXZ');
      this.quaternion.setFromEuler(this.euler);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      mesh.setMatrixAt(slot.index, this.matrix);
    }

    for (const kind of touched) {
      const mesh = this.meshes.get(kind);
      if (mesh) mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
