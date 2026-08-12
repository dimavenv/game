import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MOUNTAIN, SWING } from '../../shared/balance';
import type { Terrain } from '../../shared/world/terrain';

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
  if (!geo) throw new Error('Не удалось склеить геометрию горы');
  return geo;
}

function box(w: number, h: number, d: number, hex: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return tint(g, hex);
}

const WOOD = () =>
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0 });

const POSTS = 6;
const GAZEBO_R = MOUNTAIN.gazeboRadius;

export interface GazeboBuild {
  group: THREE.Group;
  /** Куда садится игрок на лавку и куда смотрит. */
  seat: THREE.Vector3;
  /** Точка, от которой считается «подошёл»: центр беседки. */
  center: THREE.Vector3;
  /** Столбы как круглые препятствия. */
  obstacles: { x: number; z: number; radius: number }[];
}

/**
 * Беседка на вершине Петушка: шестигранный настил, столбы, перила, лавки по
 * кругу и шатровая крыша. Один пролёт оставлен под вход.
 */
export function buildGazebo(terrain: Terrain): GazeboBuild {
  const x = MOUNTAIN.x;
  const z = MOUNTAIN.z;
  const y = terrain.height(x, z);
  const group = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  const obstacles: { x: number; z: number; radius: number }[] = [];

  const corner = (i: number, r: number): [number, number] => {
    const a = (i / POSTS) * Math.PI * 2 + Math.PI / 6;
    return [Math.cos(a) * r, Math.sin(a) * r];
  };

  // Настил: доски внахлёст по шестиугольнику.
  const floorY = 0.34;
  const deck = new THREE.CylinderGeometry(GAZEBO_R + 0.2, GAZEBO_R + 0.25, 0.18, POSTS);
  deck.translate(0, floorY - 0.09, 0);
  parts.push(tint(deck, 0x6a5134));
  const planks = 9;
  for (let i = 0; i < planks; i++) {
    const off = (-1 + (i * 2) / (planks - 1)) * GAZEBO_R * 0.86;
    // Длину подгоняем под шестиугольник, иначе доски торчат за настил.
    const half = Math.sqrt(Math.max(GAZEBO_R * GAZEBO_R - off * off, 0.05));
    parts.push(
      box(half * 2, 0.06, (GAZEBO_R * 1.72) / planks, i % 2 === 0 ? 0x7c6040 : 0x8a6c46, 0, floorY + 0.02, off),
    );
  }
  // Ступенька со стороны входа.
  parts.push(box(1.8, 0.16, 0.7, 0x5b452c, 0, floorY - 0.18, GAZEBO_R + 0.45));

  const postHeight = 2.5;
  for (let i = 0; i < POSTS; i++) {
    const [px, pz] = corner(i, GAZEBO_R);
    parts.push(box(0.17, postHeight, 0.17, 0x5b452c, px, floorY + postHeight / 2, pz));
    obstacles.push({ x: x + px, z: z + pz, radius: 0.3 });

    // Перила и лавка между столбами. Пролёт со входом пропускаем.
    const [nx, nz] = corner(i + 1, GAZEBO_R);
    const mx = (px + nx) / 2;
    const mz = (pz + nz) / 2;
    const len = Math.hypot(nx - px, nz - pz);
    const angle = Math.atan2(nz - pz, nx - px);
    const entrance = i === 1;
    if (!entrance) {
      const rail = new THREE.BoxGeometry(len, 0.09, 0.12);
      rail.rotateY(-angle);
      rail.translate(mx, floorY + 0.95, mz);
      parts.push(tint(rail, 0x6a5134));

      const seat = new THREE.BoxGeometry(len * 0.94, 0.09, 0.42);
      seat.rotateY(-angle);
      seat.translate(mx * 0.86, floorY + 0.46, mz * 0.86);
      parts.push(tint(seat, 0x7c6040));

      for (const t of [-0.3, 0.3]) {
        const lx = mx * 0.86 + Math.cos(angle) * len * t;
        const lz = mz * 0.86 + Math.sin(angle) * len * t;
        parts.push(box(0.1, 0.46, 0.1, 0x5b452c, lx, floorY + 0.23, lz));
      }
    }
  }

  // Шатровая крыша: конус на шесть скатов и маковка.
  const roof = new THREE.ConeGeometry(GAZEBO_R + 0.9, 1.7, POSTS, 1);
  roof.rotateY(Math.PI / 6);
  roof.translate(0, floorY + postHeight + 0.85, 0);
  parts.push(tint(roof, 0x4a4038));
  const under = new THREE.CylinderGeometry(GAZEBO_R + 0.35, GAZEBO_R + 0.35, 0.12, POSTS);
  under.rotateY(Math.PI / 6);
  under.translate(0, floorY + postHeight + 0.06, 0);
  parts.push(tint(under, 0x6a5134));
  const finial = new THREE.ConeGeometry(0.13, 0.5, 6);
  finial.translate(0, floorY + postHeight + 1.9, 0);
  parts.push(tint(finial, 0x8a6c46));

  const mesh = new THREE.Mesh(merge(parts), WOOD());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  group.position.set(x, y, z);

  // Лавка напротив входа: сидишь и смотришь на озеро.
  const [sx, sz] = corner(4, GAZEBO_R * 0.86);
  return {
    group,
    seat: new THREE.Vector3(x + sx * 0.9, y + floorY + 0.46, z + sz * 0.9),
    center: new THREE.Vector3(x, y + floorY, z),
    obstacles,
  };
}

export interface SwingBuild {
  group: THREE.Group;
  /** Точка подвеса троса. */
  anchor: THREE.Vector3;
  /** Направление размаха: от берега к середине озера. */
  direction: THREE.Vector3;
  /** Где висит перекладина при данном отклонении (радианы). */
  barAt(angle: number, out: THREE.Vector3): THREE.Vector3;
  /** Ставит трос под нужным углом. */
  setAngle(angle: number): void;
  obstacles: { x: number; z: number; radius: number }[];
}

/**
 * Тарзанка: площадка на склоне над Псекупсом, наклонённая к руслу мачта,
 * трос с перекладиной. Трос висит на своей группе — её и качаем.
 */
export function buildSwing(terrain: Terrain): SwingBuild {
  const bx = SWING.base.x;
  const bz = SWING.base.z;
  const by = terrain.height(bx, bz);
  const group = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];

  // Мачта наклонена к точке, куда прыгают, — к середине русла.
  const dir = new THREE.Vector3(SWING.aim.x - bx, 0, SWING.aim.z - bz).normalize();
  const lean = 0.38;
  const topX = bx + dir.x * Math.sin(lean) * SWING.mastHeight;
  const topZ = bz + dir.z * Math.sin(lean) * SWING.mastHeight;
  const topY = by + Math.cos(lean) * SWING.mastHeight;

  // Настил площадки: доски поперёк направления прыжка.
  const deckR = SWING.radius * 0.62;
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const boards = 9;
  for (let i = 0; i < boards; i++) {
    const off = (-1 + (i * 2) / (boards - 1)) * deckR;
    const half = Math.sqrt(Math.max(deckR * deckR - off * off, 0.05));
    const plank = new THREE.BoxGeometry((deckR * 1.9) / boards, 0.1, half * 2);
    plank.rotateY(Math.atan2(dir.x, dir.z));
    plank.translate(bx + side.x * off + dir.x * 0.6, by + 0.06, bz + side.z * off + dir.z * 0.6);
    parts.push(tint(plank, i % 2 === 0 ? 0x7c6040 : 0x8a6c46));
  }

  // Перила по бокам: со стороны реки проём, оттуда и летят.
  for (const s of [-1, 1]) {
    for (const along of [-0.55, 0.45]) {
      const px = bx + side.x * s * deckR + dir.x * (0.6 + along * deckR);
      const pz = bz + side.z * s * deckR + dir.z * (0.6 + along * deckR);
      parts.push(box(0.12, 1.05, 0.12, 0x5b452c, px, terrain.height(px, pz) + 0.5, pz));
    }
    const rail = new THREE.BoxGeometry(0.09, 0.09, deckR * 1.05);
    rail.rotateY(Math.atan2(dir.x, dir.z));
    rail.translate(bx + side.x * s * deckR + dir.x * 0.55, by + 1.0, bz + side.z * s * deckR + dir.z * 0.55);
    parts.push(tint(rail, 0x6a5134));
  }

  const mast = new THREE.CylinderGeometry(0.16, 0.24, SWING.mastHeight, 8);
  mast.translate(0, SWING.mastHeight / 2, 0);
  // Кладём ось мачты точно на отрезок «основание — подвес».
  mast.applyQuaternion(
    new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(topX - bx, topY - by, topZ - bz).normalize(),
    ),
  );
  mast.translate(bx, by, bz);
  parts.push(tint(mast, 0x6a5134));

  // Растяжки назад, чтобы мачта не выглядела воткнутой в землю палкой.
  for (const s of [-1, 1]) {
    const ax = bx - dir.x * 3.2 + side.x * s * 2.4;
    const az = bz - dir.z * 3.2 + side.z * s * 2.4;
    const ay = terrain.height(ax, az);
    const len = Math.hypot(topX - ax, topY - ay, topZ - az);
    const rope = new THREE.CylinderGeometry(0.035, 0.035, len, 5);
    rope.translate(0, len / 2, 0);
    rope.applyQuaternion(
      new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(topX - ax, topY - ay, topZ - az).normalize(),
      ),
    );
    rope.translate(ax, ay, az);
    parts.push(tint(rope, 0x54452f));
    parts.push(box(0.16, 0.5, 0.16, 0x4a3826, ax, ay + 0.2, az));
  }

  const mesh = new THREE.Mesh(merge(parts), WOOD());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Трос с перекладиной: качается вокруг точки подвеса.
  const pivot = new THREE.Group();
  pivot.position.set(topX, topY, topZ);
  // Порядок YXZ: сперва наклон вокруг локальной X (размах), потом разворот
  // к реке. При обратном порядке трос качался бы не туда.
  pivot.rotation.order = 'YXZ';
  pivot.rotation.y = Math.atan2(-dir.x, -dir.z);

  const ropeParts: THREE.BufferGeometry[] = [];
  const rope = new THREE.CylinderGeometry(0.028, 0.028, SWING.ropeLength, 6);
  rope.translate(0, -SWING.ropeLength / 2, 0);
  ropeParts.push(tint(rope, 0x8a7a58));
  const knot = new THREE.TorusGeometry(0.06, 0.022, 5, 8);
  knot.rotateX(Math.PI / 2);
  knot.translate(0, -SWING.ropeLength + 0.16, 0);
  ropeParts.push(tint(knot, 0x6f6144));
  const bar = new THREE.CylinderGeometry(0.055, 0.055, 0.62, 8);
  bar.rotateZ(Math.PI / 2);
  bar.rotateY(Math.PI / 2);
  bar.translate(0, -SWING.ropeLength, 0);
  ropeParts.push(tint(bar, 0x7c6040));

  const ropeMesh = new THREE.Mesh(merge(ropeParts), WOOD());
  ropeMesh.castShadow = true;
  pivot.add(ropeMesh);
  group.add(pivot);

  const anchor = new THREE.Vector3(topX, topY, topZ);
  return {
    group,
    anchor,
    direction: dir.clone(),
    obstacles: [{ x: bx, z: bz, radius: 0.5 }],
    barAt(angle: number, out: THREE.Vector3) {
      const sin = Math.sin(angle);
      const cos = Math.cos(angle);
      return out.set(
        anchor.x + dir.x * sin * SWING.ropeLength,
        anchor.y - cos * SWING.ropeLength,
        anchor.z + dir.z * sin * SWING.ropeLength,
      );
    },
    setAngle(angle: number) {
      pivot.rotation.x = angle;
    },
  };
}
