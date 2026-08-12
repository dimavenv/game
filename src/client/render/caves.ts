import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Cave } from '../../shared/world/caves';

/**
 * Пещеры в картинке. Ход — это коробчатый рукав со сводом, зал — купол;
 * снаружи у входа торчит каменный зев, чтобы дыру было видно издалека.
 * Всё склеено в один меш на пещеру: их семь на карту, лишних вызовов нет.
 */

const ROCK_DARK = 0x3b3833;
const ROCK_LIGHT = 0x6b6760;

function hash(n: number): number {
  const s = Math.sin(n * 45.233) * 43758.5453;
  return s - Math.floor(s);
}

/** Красит с разбросом по граням: гладкий камень выглядит бетоном. */
function tint(geo: THREE.BufferGeometry, hex: number, variation = 0.16): THREE.BufferGeometry {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  const count = flat.attributes.position.count;
  const arr = new Float32Array(count * 3);
  const base = new THREE.Color(hex);
  for (let face = 0; face * 3 < count; face++) {
    const k = 1 + (hash(face * 3.7 + hex * 0.0001) - 0.5) * variation * 2;
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

/** Неровный камень: смещаем вершины по хешу их координат. */
function rough(geo: THREE.BufferGeometry, amount: number, seed: number): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = Math.round(x * 12) * 3.1 + Math.round(y * 12) * 7.7 + Math.round(z * 12) * 5.3 + seed;
    pos.setXYZ(
      i,
      x + (hash(k) - 0.5) * amount,
      y + (hash(k + 13.7) - 0.5) * amount * 0.6,
      z + (hash(k + 31.1) - 0.5) * amount,
    );
  }
  geo.computeVertexNormals();
  return geo;
}

/** Сталактит или сталагмит: тонкий рваный конус. */
function spike(radius: number, height: number, down: boolean, seed: number): THREE.BufferGeometry {
  const geo = new THREE.ConeGeometry(radius, height, 5, 2);
  if (down) geo.rotateX(Math.PI);
  geo.translate(0, down ? -height / 2 : height / 2, 0);
  return rough(geo, radius * 0.5, seed);
}

/** Купол зала: полусфера, вывернутая внутрь. */
function chamber(radius: number, height: number, seed: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(radius, 9, 6, 0, Math.PI * 2, 0, Math.PI / 2);
  geo.scale(1, height / radius, 1);
  return rough(geo, radius * 0.14, seed);
}

export function buildCave(cave: Cave): THREE.Group {
  const group = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];

  // Залы: купол сверху, каменный пол снизу, сталактиты и сталагмиты.
  cave.nodes.forEach((node, index) => {
    const dome = chamber(node.radius + 0.7, node.height, index * 17 + cave.id);
    dome.translate(node.x, node.y, node.z);
    parts.push(tint(dome, ROCK_DARK));

    const floor = new THREE.CylinderGeometry(node.radius + 0.7, node.radius + 0.9, 0.4, 10);
    floor.translate(node.x, node.y - 0.2, node.z);
    parts.push(tint(rough(floor, 0.12, index * 5 + cave.id), ROCK_LIGHT));

    const spikes = 3 + Math.floor(hash(index + cave.id * 3) * 4);
    for (let i = 0; i < spikes; i++) {
      const a = hash(index * 7 + i) * Math.PI * 2;
      const r = node.radius * (0.35 + hash(i * 3 + index) * 0.5);
      const px = node.x + Math.cos(a) * r;
      const pz = node.z + Math.sin(a) * r;
      const long = 0.5 + hash(i * 11 + index) * 1.1;
      const top = spike(0.14, long, true, i * 31 + index);
      top.translate(px, node.y + node.height - 0.1, pz);
      parts.push(tint(top, ROCK_LIGHT));
      if (hash(i * 5 + index) > 0.5) {
        const bottom = spike(0.16, 0.35 + hash(i) * 0.6, false, i * 17 + index);
        bottom.translate(px, node.y, pz);
        parts.push(tint(bottom, ROCK_LIGHT));
      }
    }
  });

  // Ходы: коробка с полом, потолком и двумя стенами.
  cave.segments.forEach((segment, index) => {
    const a = cave.nodes[segment.from];
    const b = cave.nodes[segment.to];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    const yaw = Math.atan2(dx, dz);
    const y = (a.y + b.y) / 2;
    const height = Math.min(a.height, b.height) * 0.85;
    const w = segment.halfWidth;

    const build = (geo: THREE.BufferGeometry, hex: number): void => {
      geo.rotateY(yaw);
      geo.translate((a.x + b.x) / 2, y, (a.z + b.z) / 2);
      parts.push(tint(geo, hex));
    };

    const floor = new THREE.BoxGeometry(w * 2 + 0.6, 0.3, length);
    floor.translate(0, -0.15, 0);
    build(rough(floor, 0.08, index + cave.id), ROCK_LIGHT);

    const ceiling = new THREE.BoxGeometry(w * 2 + 0.9, 0.4, length);
    ceiling.translate(0, height, 0);
    build(rough(ceiling, 0.16, index * 3 + cave.id), ROCK_DARK);

    for (const side of [-1, 1]) {
      const wall = new THREE.BoxGeometry(0.5, height + 0.4, length);
      wall.translate(side * (w + 0.3), height / 2, 0);
      build(rough(wall, 0.16, index * 7 + side + cave.id), ROCK_DARK);
    }
  });

  // Зев: каменная арка снаружи, по ней вход и находят.
  const mouth = cave.mouth;
  for (let i = 0; i < 7; i++) {
    const a = (i / 6) * Math.PI;
    const boulder = new THREE.DodecahedronGeometry(0.85 + hash(i + cave.id) * 0.5, 0);
    boulder.scale(1, 1.15, 0.8);
    boulder.rotateY(i * 1.4);
    const r = 2.7;
    boulder.translate(
      mouth.x + Math.sin(mouth.yaw + Math.PI / 2) * Math.cos(a) * r,
      mouth.y + Math.sin(a) * 2.1,
      mouth.z + Math.cos(mouth.yaw + Math.PI / 2) * Math.cos(a) * r,
    );
    parts.push(tint(rough(boulder, 0.2, i * 9 + cave.id), ROCK_LIGHT));
  }

  const merged = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
  if (!merged) throw new Error('Не удалось склеить пещеру');

  const mesh = new THREE.Mesh(
    merged,
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      roughness: 1,
      metalness: 0,
      // Свод виден изнутри, поэтому рисуем обе стороны.
      side: THREE.DoubleSide,
    }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
