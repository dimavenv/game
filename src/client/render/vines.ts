import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PropInstance } from '../../shared/world/worldgen';

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
  if (!geo) throw new Error('Не удалось склеить лозу');
  return geo;
}

const PLANT_MATERIAL = () =>
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });

let trellisGeometry: THREE.BufferGeometry | null = null;

/** Шпалера с листвой: два столба, перекладина и зелёная шапка. */
function buildTrellis(): THREE.BufferGeometry {
  if (trellisGeometry) return trellisGeometry;
  const parts: THREE.BufferGeometry[] = [];

  for (const dx of [-0.7, 0.7]) {
    const post = new THREE.CylinderGeometry(0.07, 0.08, 1.7, 6);
    post.translate(dx, 0.85, 0);
    parts.push(tint(post, 0x6b5334));
  }
  const bar = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6);
  bar.rotateZ(Math.PI / 2);
  bar.translate(0, 1.6, 0);
  parts.push(tint(bar, 0x6b5334));

  const stem = new THREE.CylinderGeometry(0.06, 0.09, 1.3, 6);
  stem.translate(0, 0.65, 0);
  parts.push(tint(stem, 0x53412c));

  // Листва — несколько небольших шапок вдоль перекладины, а не один ком.
  for (const [x, y, z, r] of [
    [0, 1.72, 0, 0.46],
    [-0.55, 1.66, 0.1, 0.38],
    [0.55, 1.68, -0.1, 0.4],
    [-0.28, 1.58, -0.3, 0.32],
    [0.3, 1.6, 0.3, 0.34],
  ]) {
    const leaves = new THREE.IcosahedronGeometry(r, 0);
    leaves.scale(1.25, 0.6, 1.25);
    leaves.translate(x, y, z);
    parts.push(tint(leaves, 0x4f7a35));
  }

  trellisGeometry = merge(parts);
  return trellisGeometry;
}

export interface VineHandle {
  group: THREE.Group;
  position: THREE.Vector3;
  /** Грозди прячутся после сбора и пока молодая лоза не подросла. */
  setGrapes(visible: boolean): void;
}

export function buildVine(x: number, y: number, z: number, rot: number, scale = 1): VineHandle {
  const group = new THREE.Group();

  const trellis = new THREE.Mesh(buildTrellis(), PLANT_MATERIAL());
  trellis.castShadow = true;
  trellis.receiveShadow = true;
  group.add(trellis);

  const bunches = new THREE.Group();
  const berry = new THREE.IcosahedronGeometry(0.055, 0);
  const berryMaterial = new THREE.MeshStandardMaterial({ color: 0x5a2a63, roughness: 0.6, flatShading: true });
  for (let i = 0; i < 5; i++) {
    const bunch = new THREE.Group();
    // Гроздь — горстка ягод, сужающаяся книзу.
    for (let j = 0; j < 7; j++) {
      const b = new THREE.Mesh(berry, berryMaterial);
      const row = Math.floor(j / 3);
      b.position.set(((j % 3) - 1) * 0.055 * (1 - row * 0.3), -row * 0.075, ((j % 2) - 0.5) * 0.05);
      bunch.add(b);
    }
    // Грозди свисают из-под листвы, иначе их не видно.
    const a = (i / 5) * Math.PI * 2 + rot;
    bunch.position.set(Math.cos(a) * 0.62, 1.28 + ((i * 3) % 4) * 0.06, Math.sin(a) * 0.22);
    bunches.add(bunch);
  }
  group.add(bunches);

  group.position.set(x, y, z);
  group.rotation.y = rot;
  group.scale.setScalar(scale);

  return {
    group,
    position: new THREE.Vector3(x, y, z),
    setGrapes(visible: boolean) {
      bunches.visible = visible;
    },
  };
}

export function buildWildVine(prop: PropInstance): VineHandle {
  return buildVine(prop.x, prop.y, prop.z, prop.rot, 0.85 + prop.scale * 0.12);
}
