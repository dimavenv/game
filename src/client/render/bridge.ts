import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BRIDGE, RIVER } from '../../shared/balance';
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
  if (!geo) throw new Error('Не удалось склеить геометрию моста');
  return geo;
}

/**
 * Мост через Псекупс. Строится в локальных координатах (ось Z — поперёк реки,
 * ось X — вдоль настила) и целиком поворачивается: так проверка «стою на
 * мосту» в общей части совпадает с картинкой один в один.
 */
export function buildBridge(terrain: Terrain): THREE.Group {
  const group = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];

  const deckY = RIVER.level + BRIDGE.rise;
  const hw = BRIDGE.halfWidth;
  const hd = BRIDGE.halfLength;

  // Продольные лежни под настилом.
  for (const side of [-1, 1]) {
    const beam = new THREE.BoxGeometry(0.22, 0.28, hd * 2);
    beam.translate(side * (hw - 0.24), -0.2, 0);
    parts.push(tint(beam, 0x5b452c));
  }

  // Настил из поперечных досок со щелями.
  const planks = Math.round(hd * 2 / 0.42);
  for (let i = 0; i < planks; i++) {
    const z = -hd + ((i + 0.5) / planks) * hd * 2;
    const plank = new THREE.BoxGeometry(hw * 2, 0.09, 0.36);
    plank.translate(0, 0, z);
    parts.push(tint(plank, i % 2 === 0 ? 0x7c6040 : 0x8a6c46));
  }

  // Опоры: столбы уходят в дно, у берегов — в грунт.
  const bedY = RIVER.level - RIVER.depth;
  for (const z of [-hd + 1.4, -RIVER.halfWidth * 0.6, RIVER.halfWidth * 0.6, hd - 1.4]) {
    for (const side of [-1, 1]) {
      // Точка опоры в мире: считаем землю под ней, чтобы столб не висел.
      const wx = BRIDGE.x + (side * (hw - 0.3)) * Math.cos(BRIDGE.yaw) + z * Math.sin(BRIDGE.yaw);
      const wz = BRIDGE.z - (side * (hw - 0.3)) * Math.sin(BRIDGE.yaw) + z * Math.cos(BRIDGE.yaw);
      const bottom = Math.min(terrain.height(wx, wz) - 0.4, bedY);
      const height = deckY - 0.3 - bottom;
      const post = new THREE.CylinderGeometry(0.15, 0.18, height, 7);
      post.translate(side * (hw - 0.3), bottom + height / 2 - deckY, z);
      parts.push(tint(post, 0x4f3d28));
    }
    // Поперечная схватка поверх пары столбов.
    const tie = new THREE.BoxGeometry(hw * 2 - 0.2, 0.14, 0.16);
    tie.translate(0, -0.42, z);
    parts.push(tint(tie, 0x54452f));
  }

  // Перила: стойки и поручень по обеим сторонам.
  for (const side of [-1, 1]) {
    const rail = new THREE.BoxGeometry(0.1, 0.11, hd * 2);
    rail.translate(side * hw, 1.0, 0);
    parts.push(tint(rail, 0x6a5134));
    const mid = new THREE.BoxGeometry(0.07, 0.08, hd * 2);
    mid.translate(side * hw, 0.55, 0);
    parts.push(tint(mid, 0x6a5134));
    const posts = 9;
    for (let i = 0; i <= posts; i++) {
      const z = -hd + (i / posts) * hd * 2;
      const post = new THREE.BoxGeometry(0.12, 1.1, 0.12);
      post.translate(side * hw, 0.5, z);
      parts.push(tint(post, 0x5b452c));
    }
  }

  const mesh = new THREE.Mesh(
    merge(parts),
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.94, metalness: 0 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  group.add(mesh);
  group.position.set(BRIDGE.x, deckY, BRIDGE.z);
  group.rotation.y = BRIDGE.yaw;
  group.name = 'bridge';
  return group;
}
