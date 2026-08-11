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
  if (!geo) throw new Error('Не удалось склеить геометрию');
  return geo;
}

const NATURE_MATERIAL = () =>
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });

export interface AppleTreeHandle {
  group: THREE.Group;
  /** Точка, к которой подходит игрок за яблоками. */
  position: THREE.Vector3;
  setApples(visible: boolean): void;
}

/** Яблоня: раскидистая крона и красные яблоки, которые пропадают после сбора. */
export function buildAppleTree(prop: PropInstance): AppleTreeHandle {
  const group = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];

  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 2.3, 7);
  trunk.translate(0, 1.15, 0);
  parts.push(tint(trunk, 0x5a4230));

  // Крона: несколько шапок. Их же положения задают, где висеть яблокам.
  const canopy: [number, number, number, number][] = [
    [0, 2.9, 0, 1.5],
    [0.95, 2.5, 0.35, 1.0],
    [-0.85, 2.55, -0.5, 1.05],
    [0.15, 2.35, -0.95, 0.85],
  ];
  for (const [bx, by, bz, r] of canopy) {
    const blob = new THREE.IcosahedronGeometry(r, 0);
    blob.scale(1, 0.8, 1);
    blob.translate(bx, by, bz);
    parts.push(tint(blob, 0x4a7333));
  }

  const crown = new THREE.Mesh(merge(parts), NATURE_MATERIAL());
  crown.castShadow = true;
  crown.receiveShadow = true;
  group.add(crown);

  // Яблоки отдельной группой: их прячем на сутки после сбора.
  const apples = new THREE.Group();
  const appleGeo = new THREE.IcosahedronGeometry(0.11, 0);
  const appleMat = new THREE.MeshStandardMaterial({ color: 0xc23b2b, roughness: 0.7, flatShading: true });
  let n = 0;
  for (const [bx, by, bz, r] of canopy) {
    // По паре яблок под каждой шапкой кроны: раньше они висели в воздухе.
    for (let k = 0; k < 2; k++) {
      const a = (n / 8) * Math.PI * 2 + prop.rot;
      const reach = r * 0.6;
      const apple = new THREE.Mesh(appleGeo, appleMat);
      apple.position.set(bx + Math.cos(a) * reach, by - r * 0.55, bz + Math.sin(a) * reach);
      apple.castShadow = true;
      apples.add(apple);
      n += 1;
    }
  }
  group.add(apples);

  group.position.set(prop.x, prop.y, prop.z);
  group.rotation.y = prop.rot;
  group.scale.setScalar(prop.scale);

  return {
    group,
    position: new THREE.Vector3(prop.x, prop.y, prop.z),
    setApples(visible: boolean) {
      apples.visible = visible;
    },
  };
}

/** Табличка памятника: имя и строчка снизу. */
function plaqueTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#8d8f8a';
  ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 60; i++) {
    ctx.fillStyle = `rgba(${90 + Math.random() * 60}, ${92 + Math.random() * 60}, ${88 + Math.random() * 60}, 0.25)`;
    ctx.fillRect(Math.random() * c.width, Math.random() * c.height, 20 + Math.random() * 60, 3 + Math.random() * 8);
  }
  ctx.textAlign = 'center';
  ctx.fillStyle = '#2b2b28';
  ctx.font = 'bold 54px Georgia, serif';
  ctx.fillText('СЕРЁГА ПИРАТ', c.width / 2, 96);
  ctx.font = 'italic 34px Georgia, serif';
  ctx.fillText('ты был легендой', c.width / 2, 158);
  ctx.font = '26px Georgia, serif';
  ctx.fillText('петушок', c.width / 2, 208);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface MonumentHandle {
  group: THREE.Group;
  position: THREE.Vector3;
  /** Точка, где лежат оставленные сигареты. */
  offering: THREE.Vector3;
}

/** Памятник рыбке породы петушок: постамент, табличка и сама рыбка. */
export function buildMonument(x: number, y: number, z: number, rot: number): MonumentHandle {
  const group = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];

  const base = new THREE.BoxGeometry(1.5, 0.25, 1.2);
  base.translate(0, 0.12, 0);
  parts.push(tint(base, 0x6f6d66));

  const pedestal = new THREE.BoxGeometry(0.95, 1.25, 0.75);
  pedestal.translate(0, 0.87, 0);
  parts.push(tint(pedestal, 0x82807a));

  const cap = new THREE.BoxGeometry(1.1, 0.14, 0.9);
  cap.translate(0, 1.56, 0);
  parts.push(tint(cap, 0x6f6d66));

  const stone = new THREE.Mesh(merge(parts), NATURE_MATERIAL());
  stone.castShadow = true;
  stone.receiveShadow = true;
  group.add(stone);

  const plaque = new THREE.Mesh(
    new THREE.PlaneGeometry(0.8, 0.42),
    new THREE.MeshStandardMaterial({ map: plaqueTexture(), roughness: 0.9 }),
  );
  plaque.position.set(0, 1.0, 0.381);
  group.add(plaque);

  // Рыбка: тело, хвост и плавники — вуалевые, как у петушка.
  const fish = new THREE.Group();
  const fishMat = new THREE.MeshStandardMaterial({ color: 0x2f5fb8, roughness: 0.55, flatShading: true });
  const finMat = new THREE.MeshStandardMaterial({
    color: 0xb8324f,
    roughness: 0.5,
    flatShading: true,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.92,
  });

  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 0), fishMat);
  body.scale.set(1.35, 1, 0.55);
  fish.add(body);

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.42, 5), finMat);
  tail.rotation.z = Math.PI / 2;
  tail.scale.set(1, 1, 0.25);
  tail.position.set(-0.42, 0.02, 0);
  fish.add(tail);

  for (const [ry, py] of [
    [0.4, 0.2],
    [-0.4, -0.2],
  ]) {
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 4), finMat);
    fin.rotation.x = ry;
    fin.position.set(-0.05, py, 0.02);
    fish.add(fin);
  }

  fish.position.set(0, 1.86, 0);
  fish.rotation.y = 0.4;
  fish.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  group.add(fish);

  group.position.set(x, y, z);
  group.rotation.y = rot;

  return {
    group,
    position: new THREE.Vector3(x, y, z),
    offering: new THREE.Vector3(x + Math.sin(rot) * 0.5, y + 0.25, z + Math.cos(rot) * 0.5),
  };
}

/** Пни и падающие стволы от рубки: небольшой пул на весь лес. */
export class ChopEffects {
  readonly group = new THREE.Group();
  private readonly stumpGeo: THREE.BufferGeometry;
  private readonly stumpMat: THREE.Material;
  private readonly stumps = new Map<number, THREE.Mesh>();
  private readonly falling: {
    mesh: THREE.Mesh;
    timer: number;
    axis: THREE.Vector3;
    base: THREE.Vector3;
  }[] = [];
  constructor() {
    const geo = new THREE.CylinderGeometry(0.34, 0.4, 0.45, 7);
    geo.translate(0, 0.22, 0);
    this.stumpGeo = tint(geo, 0x7a6141);
    this.stumpMat = NATURE_MATERIAL();
  }

  addStump(id: number, x: number, y: number, z: number, scale: number): void {
    if (this.stumps.has(id)) return;
    const stump = new THREE.Mesh(this.stumpGeo, this.stumpMat);
    stump.position.set(x, y, z);
    stump.scale.setScalar(scale);
    stump.castShadow = true;
    stump.receiveShadow = true;
    this.group.add(stump);
    this.stumps.set(id, stump);
  }

  /** Дерево отросло — пень убираем. */
  removeStump(id: number): void {
    const stump = this.stumps.get(id);
    if (!stump) return;
    this.group.remove(stump);
    this.stumps.delete(id);
  }

  /** Ствол валится в сторону от игрока и через несколько секунд исчезает. */
  dropTrunk(x: number, y: number, z: number, height: number, radius: number, awayYaw: number): void {
    const geo = new THREE.CylinderGeometry(radius * 0.7, radius, height, 7);
    geo.translate(0, height / 2, 0);
    const mesh = new THREE.Mesh(tint(geo, 0x5c452e), NATURE_MATERIAL());
    mesh.position.set(x, y + 0.45, z);
    mesh.castShadow = true;
    this.group.add(mesh);
    this.falling.push({
      mesh,
      timer: 0,
      axis: new THREE.Vector3(Math.cos(awayYaw), 0, -Math.sin(awayYaw)).normalize(),
      base: new THREE.Vector3(x, y + 0.45, z),
    });
  }

  update(dt: number): void {
    for (let i = this.falling.length - 1; i >= 0; i--) {
      const f = this.falling[i];
      f.timer += dt;
      const fall = Math.min(f.timer / 1.1, 1);
      // Ускорение к концу падения, чтобы удар о землю читался.
      const angle = (Math.PI / 2) * fall * fall;
      f.mesh.quaternion.setFromAxisAngle(f.axis, angle);
      f.mesh.position.copy(f.base);
      if (f.timer > 6) {
        this.group.remove(f.mesh);
        f.mesh.geometry.dispose();
        this.falling.splice(i, 1);
      }
    }
  }
}
