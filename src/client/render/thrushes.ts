import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GORGE } from '../../shared/balance';
import { mulberry32 } from '../../shared/rng';
import type { Terrain } from '../../shared/world/terrain';

/**
 * Дрозды в Дантовом ущелье. Сидят на уступах, перепархивают с места на
 * место и подают голос. Их число зависит только от номера суток, поэтому
 * посчитать можно честно: сколько увидел, столько и есть.
 */

function tint(geo: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  const count = flat.attributes.position.count;
  const arr = new Float32Array(count * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  flat.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return flat;
}

/** Дрозд: тёмное тельце, светлое брюшко, жёлтый клюв. */
function thrushGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];

  const body = new THREE.IcosahedronGeometry(0.075, 1);
  body.scale(0.85, 0.9, 1.45);
  parts.push(tint(body, 0x3d3128));

  const belly = new THREE.IcosahedronGeometry(0.055, 1);
  belly.scale(0.8, 0.7, 1.1);
  belly.translate(0, -0.03, 0.01);
  parts.push(tint(belly, 0x9a7b4e));

  const head = new THREE.IcosahedronGeometry(0.048, 1);
  head.translate(0, 0.055, 0.085);
  parts.push(tint(head, 0x322820));

  const beak = new THREE.ConeGeometry(0.016, 0.055, 4);
  beak.rotateX(Math.PI / 2);
  beak.translate(0, 0.05, 0.135);
  parts.push(tint(beak, 0xd8a83a));

  const tail = new THREE.BoxGeometry(0.045, 0.012, 0.12);
  tail.rotateX(-0.25);
  tail.translate(0, -0.01, -0.12);
  parts.push(tint(tail, 0x2f261f));

  for (const side of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.005, 0.005, 0.05, 4);
    leg.translate(side * 0.025, -0.09, 0.01);
    parts.push(tint(leg, 0xb08040));
  }

  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  if (!merged) throw new Error('Не удалось склеить дрозда');
  return merged;
}

/** Крыло: отдельная лопасть, машет только в полёте. */
function wingGeometry(): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(0.13, 0.008, 0.075);
  geo.translate(0.065, 0, 0);
  return tint(geo, 0x352b22);
}

interface Bird {
  /** Куда сел и куда собрался. */
  from: THREE.Vector3;
  to: THREE.Vector3;
  /** 0 — сидит на месте, 1 — долетел. */
  t: number;
  /** Сколько ещё сидеть до следующего перелёта. */
  rest: number;
  speed: number;
  yaw: number;
  bob: number;
}

const MAX_BIRDS = 16;

export class Thrushes {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly wings: THREE.InstancedMesh;
  private readonly birds: Bird[] = [];
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  private count = 0;
  private clock = 0;

  constructor(private readonly terrain: Terrain) {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 0.9,
    });
    this.mesh = new THREE.InstancedMesh(thrushGeometry(), material, MAX_BIRDS);
    this.wings = new THREE.InstancedMesh(wingGeometry(), material, MAX_BIRDS * 2);
    for (const m of [this.mesh, this.wings]) {
      m.castShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(m);
    }
  }

  /** Сколько дроздов в ущелье сегодня. Число зависит только от суток. */
  static countFor(day: number): number {
    const rng = mulberry32((day * 2654435761) >>> 0);
    rng();
    const span = GORGE.maxBirds - GORGE.minBirds + 1;
    return GORGE.minBirds + Math.floor(rng() * span);
  }

  /** Расселяет птиц заново: вызывается на смене суток. */
  populate(day: number): void {
    this.birds.length = 0;
    this.count = Thrushes.countFor(day);
    const rng = mulberry32((day * 40503 + 7) >>> 0);
    for (let i = 0; i < this.count; i++) {
      const spot = this.perch(rng);
      this.birds.push({
        from: spot.clone(),
        to: spot.clone(),
        t: 1,
        rest: 1 + rng() * 6,
        speed: 0.6 + rng() * 0.5,
        yaw: rng() * Math.PI * 2,
        bob: rng() * 10,
      });
    }
  }

  /** Случайный уступ в щели: на дне, на стенах и над головой. */
  private perch(rng: () => number): THREE.Vector3 {
    const path = GORGE.path;
    const leg = Math.min(path.length - 2, Math.floor(rng() * (path.length - 1)));
    const t = rng();
    const [ax, az] = path[leg];
    const [bx, bz] = path[leg + 1];
    const x0 = ax + (bx - ax) * t;
    const z0 = az + (bz - az) * t;
    // Сдвиг поперёк щели: птицы жмутся к стенам.
    const side = rng() < 0.5 ? -1 : 1;
    const across = GORGE.halfWidth * (0.25 + rng() * 0.75) * side;
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const x = x0 + (-dz / len) * across;
    const z = z0 + (dx / len) * across;
    const floor = this.terrain.height(x, z);
    return new THREE.Vector3(x, floor + 0.25 + rng() * 3.4, z);
  }

  update(dt: number, day: number, rng: () => number): void {
    this.clock += dt;
    if (this.birds.length === 0) this.populate(day);

    for (let i = 0; i < MAX_BIRDS; i++) {
      const bird = this.birds[i];
      if (!bird) {
        this.mesh.setMatrixAt(i, this.hidden);
        this.wings.setMatrixAt(i * 2, this.hidden);
        this.wings.setMatrixAt(i * 2 + 1, this.hidden);
        continue;
      }

      if (bird.t >= 1) {
        bird.rest -= dt;
        if (bird.rest <= 0) {
          // Перепорхнул на соседний уступ.
          bird.from.copy(bird.to);
          bird.to.copy(this.perch(rng));
          bird.t = 0;
          bird.yaw = Math.atan2(bird.to.x - bird.from.x, bird.to.z - bird.from.z);
        }
      } else {
        bird.t = Math.min(1, bird.t + dt * bird.speed);
        if (bird.t >= 1) bird.rest = 2 + rng() * 7;
      }

      const flying = bird.t < 1;
      const k = bird.t * bird.t * (3 - 2 * bird.t);
      this.position.lerpVectors(bird.from, bird.to, k);
      // Дуга полёта: птица не летит по струне.
      this.position.y += Math.sin(k * Math.PI) * 0.9 * (flying ? 1 : 0);
      if (!flying) this.position.y += Math.sin(this.clock * 2 + bird.bob) * 0.006;

      this.euler.set(flying ? -0.2 : 0.08, bird.yaw, 0, 'YXZ');
      this.quaternion.setFromEuler(this.euler);
      this.matrix.compose(this.position, this.quaternion, this.scale);
      this.mesh.setMatrixAt(i, this.matrix);

      // Крылья: в полёте машут, сидя сложены вдоль тела.
      const flap = flying ? Math.sin(this.clock * 22 + bird.bob) * 1.1 : -0.15;
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        this.euler.set(0, bird.yaw, sign * (0.1 + flap), 'YXZ');
        this.quaternion.setFromEuler(this.euler);
        this.scale.set(sign, 1, 1);
        this.matrix.compose(this.position, this.quaternion, this.scale);
        this.wings.setMatrixAt(i * 2 + side, this.matrix);
      }
      this.scale.set(1, 1, 1);
    }

    this.mesh.instanceMatrix.needsUpdate = true;
    this.wings.instanceMatrix.needsUpdate = true;
  }
}
