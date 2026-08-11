import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WORLD } from '../../shared/balance';
import { CATAMARAN, type CatamaranLayout } from '../../shared/world/buildings';

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
  if (!geo) throw new Error('Не удалось склеить геометрию катамарана');
  return geo;
}

function box(w: number, h: number, d: number, hex: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return tint(g, hex);
}

const HULL = 0xeef1f4;
const STRIPE = 0x2f6fb0;
const DECK = 0xb08a52;
const SEAT = 0x1f5c99;
const METAL = 0xb9bec4;

/** Поплавок: корытце с заострённым носом и скошенной кормой. */
function hull(side: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const x = side * CATAMARAN.beam;
  const w = CATAMARAN.hullWidth;
  const half = CATAMARAN.hullLength / 2;

  parts.push(box(w, 0.78, CATAMARAN.hullLength - 1.3, HULL, x, 0.1, -0.35));
  // Нос: четырёхгранный клин, чтобы поплавок не выглядел бруском.
  const bow = new THREE.ConeGeometry(w * 0.62, 1.5, 4, 1);
  bow.rotateY(Math.PI / 4);
  bow.rotateX(Math.PI / 2);
  bow.scale(1, 0.86, 1);
  bow.translate(x, 0.1, half - 0.65);
  parts.push(tint(bow, HULL));
  // Корма — короткий скос назад.
  const stern = new THREE.ConeGeometry(w * 0.6, 0.9, 4, 1);
  stern.rotateY(Math.PI / 4);
  stern.rotateX(-Math.PI / 2);
  stern.scale(1, 0.86, 1);
  stern.translate(x, 0.1, -half + 0.65);
  parts.push(tint(stern, HULL));

  // Синяя полоса по ватерлинии и планширь сверху.
  parts.push(box(w + 0.05, 0.16, CATAMARAN.hullLength - 1.1, STRIPE, x, 0.12, -0.3));
  parts.push(box(w + 0.1, 0.09, CATAMARAN.hullLength - 1.0, 0xdfe4e8, x, 0.5, -0.3));
  return parts;
}

export interface CatamaranBuild {
  group: THREE.Group;
  update(dt: number): void;
}

/**
 * Прогулочный катамаран: два поплавка, палуба, гребное колесо и тент.
 * Стоит носом в озеро, кормой на песке — с берега на него просто заходишь.
 */
export function buildCatamaran(layout: CatamaranLayout): CatamaranBuild {
  const group = new THREE.Group();
  group.position.set(layout.x, WORLD.waterLevel, layout.z);
  group.rotation.y = layout.yaw;

  const deck = CATAMARAN.deckY;
  const parts: THREE.BufferGeometry[] = [...hull(-1), ...hull(1)];

  // Поперечины, на которых держится палуба.
  for (const z of [-2.1, -0.2, 1.9]) {
    parts.push(box(CATAMARAN.beam * 2 + 0.9, 0.13, 0.34, METAL, 0, deck - 0.09, z));
  }

  // Палуба из отдельных досок: со щелями она читается как настил, а не как плита.
  const planks = 11;
  for (let i = 0; i < planks; i++) {
    const z = -2.3 + (i / (planks - 1)) * 4.6;
    const shade = i % 2 === 0 ? DECK : 0xa07c48;
    parts.push(box(CATAMARAN.beam * 2 + 0.5, 0.07, 0.36, shade, 0, deck, z));
  }

  // Два сиденья спинками к корме.
  for (const side of [-1, 1]) {
    const sx = side * 0.85;
    parts.push(box(0.88, 0.13, 0.78, SEAT, sx, deck + 0.36, 0.15));
    parts.push(box(0.88, 0.66, 0.13, SEAT, sx, deck + 0.68, -0.25));
    for (const dx of [-0.34, 0.34]) {
      parts.push(box(0.08, 0.3, 0.08, METAL, sx + dx, deck + 0.18, 0.15));
    }
  }

  // Руль-штурвал перед сиденьями.
  parts.push(box(0.09, 0.62, 0.09, METAL, 0, deck + 0.31, 1.35));
  const wheel = new THREE.TorusGeometry(0.21, 0.03, 6, 14);
  wheel.rotateX(0.35);
  wheel.translate(0, deck + 0.62, 1.35);
  parts.push(tint(wheel, 0x3a3f45));

  // Гребное колесо между поплавками — катамаран же педальный.
  const axle = new THREE.CylinderGeometry(0.05, 0.05, CATAMARAN.beam * 2 - 0.5, 8);
  axle.rotateZ(Math.PI / 2);
  axle.translate(0, 0.22, -1.75);
  parts.push(tint(axle, METAL));

  const paddleParts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const blade = new THREE.BoxGeometry(CATAMARAN.beam * 2 - 0.9, 0.36, 0.05);
    blade.translate(0, 0.3, 0);
    blade.rotateX(a);
    blade.translate(0, 0.22, -1.75);
    paddleParts.push(tint(blade, 0xd8d2c4));
  }
  parts.push(...paddleParts);

  // Тент: четыре стойки и полосатая крыша.
  for (const [px, pz] of [
    [-1.5, -1.6],
    [1.5, -1.6],
    [-1.5, 1.6],
    [1.5, 1.6],
  ]) {
    parts.push(box(0.07, 1.62, 0.07, METAL, px, deck + 0.85, pz));
  }
  const stripes = 7;
  for (let i = 0; i < stripes; i++) {
    const z = -1.85 + (i / (stripes - 1)) * 3.7;
    parts.push(box(3.4, 0.08, 3.7 / stripes + 0.02, i % 2 === 0 ? 0xd94b3f : 0xf4f1e8, 0, deck + 1.68, z));
  }

  // Спасательный круг лежит на левом поплавке — обзор с сиденья не портит.
  const ring = new THREE.TorusGeometry(0.34, 0.09, 6, 14);
  ring.rotateX(Math.PI / 2);
  ring.translate(-CATAMARAN.beam, 0.58, 1.5);
  parts.push(tint(ring, 0xe8622c));

  const mesh = new THREE.Mesh(
    merge(parts),
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7, metalness: 0.05 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  let phase = 0;
  return {
    group,
    update(dt: number) {
      // Нос на воде — катамаран едва заметно качает.
      phase += dt;
      group.position.y = WORLD.waterLevel + Math.sin(phase * 0.55) * 0.035;
      group.rotation.z = Math.sin(phase * 0.7) * 0.013;
      group.rotation.x = Math.sin(phase * 0.43 + 1.1) * 0.009;
    },
  };
}
