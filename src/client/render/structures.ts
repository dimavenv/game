import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HutLayout, StallLayout, WallSpec } from '../../shared/world/buildings';

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
  if (!geo) throw new Error('Не удалось склеить геометрию строения');
  return geo;
}

function box(w: number, h: number, d: number, hex: number, x: number, y: number, z: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return tint(g, hex);
}

/** Венец сруба: горизонтальные брёвна вдоль стены. */
function logWall(wall: WallSpec, baseY: number): THREE.BufferGeometry[] {
  const alongX = wall.hw > wall.hd;
  const length = alongX ? wall.hw * 2 : wall.hd * 2;
  const radius = 0.155;
  const step = 0.29;
  // Один лишний венец: иначе между стеной и скатом остаётся щель со светом.
  const rows = Math.max(1, Math.ceil(wall.height / step) + 1);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < rows; i++) {
    const shade = i % 2 === 0 ? 0x6d5334 : 0x7a5c3a;
    const g = new THREE.CylinderGeometry(radius, radius, length, 7, 1);
    if (alongX) g.rotateZ(Math.PI / 2);
    else g.rotateX(Math.PI / 2);
    g.translate(wall.x, baseY + radius + i * step, wall.z);
    parts.push(tint(g, shade));
  }
  return parts;
}

/** Треугольный фронтон под скатом крыши (конёк идёт вдоль оси X). */
function gable(x: number, y: number, z: number, halfWidth: number, height: number, hex: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  // Два треугольника со встречной намоткой: фронтон виден и снаружи, и изнутри.
  const v = new Float32Array([
    -halfWidth, 0, 0,
    halfWidth, 0, 0,
    0, height, 0,
    halfWidth, 0, 0,
    -halfWidth, 0, 0,
    0, height, 0,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(v, 3));
  // Пустые UV нужны, чтобы треугольник склеился с остальной геометрией.
  geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 0.5, 1, 0, 0, 1, 0, 0.5, 1]), 2));
  geo.computeVertexNormals();
  // Фронтоны закрывают торцы конька — то есть западную и восточную стены.
  geo.rotateY(Math.PI / 2);
  geo.translate(x, y, z);
  return tint(geo, hex);
}

const WOOD_MATERIAL = () =>
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95, metalness: 0 });

export interface HutBuild {
  group: THREE.Group;
  /** Огонь в печке: свет и языки пламени включаются, когда есть дрова. */
  setFire(intensity: number): void;
  /** Дневной свет из проёма — чтобы внутри что-то было видно. */
  setDaylight(intensity: number): void;
  /** Мировая точка, куда садится игрок во втором кресле. */
  seat: THREE.Vector3;
  stovePosition: THREE.Vector3;
}

export function buildHut(hut: HutLayout): HutBuild {
  const group = new THREE.Group();
  const y = hut.floorY;
  const parts: THREE.BufferGeometry[] = [];

  parts.push(box(hut.width + 0.4, 0.22, hut.depth + 0.4, 0x53422c, hut.x, y - 0.06, hut.z));
  for (const wall of hut.walls) parts.push(...logWall(wall, y));

  // Крыша: два ската и фронтоны.
  const ridge = y + hut.wallHeight + 1.15;
  const slope = Math.atan2(1.15, hut.depth / 2 + 0.35);
  for (const dir of [-1, 1]) {
    const slab = new THREE.BoxGeometry(hut.width + 0.9, 0.14, Math.hypot(hut.depth / 2 + 0.35, 1.15) + 0.1);
    slab.rotateX(dir * slope);
    slab.translate(hut.x, (y + hut.wallHeight + ridge) / 2 - 0.05, hut.z + (dir * (hut.depth / 2 + 0.35)) / 2);
    parts.push(tint(slab, 0x4a4038));
  }
  for (const dir of [-1, 1]) {
    parts.push(
      gable(hut.x + dir * (hut.width / 2), y + hut.wallHeight, hut.z, hut.depth / 2, 1.15, 0x6d5334),
    );
  }

  // Дверной проём: косяки и порог.
  parts.push(box(0.34, hut.wallHeight, 0.16, 0x5b452c, hut.door.x, y + hut.wallHeight / 2, hut.door.z - hut.door.width / 2));
  parts.push(box(0.34, hut.wallHeight, 0.16, 0x5b452c, hut.door.x, y + hut.wallHeight / 2, hut.door.z + hut.door.width / 2));
  parts.push(box(0.34, 0.12, hut.door.width, 0x4a3826, hut.door.x, y + 0.06, hut.door.z));

  // Печка: кирпичный короб и труба сквозь крышу.
  parts.push(box(1.1, 1.35, 1.1, 0x6b4034, hut.stove.x, y + 0.68, hut.stove.z));
  parts.push(box(0.4, 2.6, 0.4, 0x5c3a30, hut.stove.x, y + 2.2, hut.stove.z));

  // Кресла.
  for (const chair of hut.chairs) {
    parts.push(box(0.72, 0.14, 0.7, 0x6a4a30, chair.x, y + 0.42, chair.z));
    parts.push(box(0.72, 0.72, 0.14, 0x6a4a30, chair.x, y + 0.78, chair.z + 0.3));
    for (const [dx, dz] of [
      [-0.3, -0.3],
      [0.3, -0.3],
      [-0.3, 0.3],
      [0.3, 0.3],
    ]) {
      parts.push(box(0.09, 0.42, 0.09, 0x543a24, chair.x + dx, y + 0.21, chair.z + dz));
    }
  }

  const mesh = new THREE.Mesh(merge(parts), WOOD_MATERIAL());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // Пламя в топке.
  const fire = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.4, 6),
    new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.9 }),
  );
  fire.position.set(hut.stove.x - 0.5, y + 0.42, hut.stove.z);
  group.add(fire);

  const light = new THREE.PointLight(0xff7a28, 0, 9, 2);
  light.position.set(hut.stove.x - 0.6, y + 0.9, hut.stove.z);
  group.add(light);

  // Свет, затекающий в дверной проём: без него днём внутри хоть глаз выколи.
  const daylight = new THREE.PointLight(0xbcd0e0, 0, 10, 2);
  daylight.position.set(hut.door.x + 0.35, y + 1.9, hut.door.z);
  group.add(daylight);

  let phase = 0;
  return {
    group,
    seat: new THREE.Vector3(hut.chairs[1].x, y, hut.chairs[1].z),
    stovePosition: new THREE.Vector3(hut.stove.x, y + 0.7, hut.stove.z),
    setDaylight(intensity: number) {
      daylight.intensity = intensity * 3.5;
    },
    setFire(intensity: number) {
      phase += 0.1;
      const flicker = 1 + Math.sin(phase * 3.1) * 0.12 + Math.sin(phase * 7.7) * 0.06;
      light.intensity = intensity * 4.5 * flicker;
      fire.visible = intensity > 0.02;
      fire.scale.setScalar(0.7 + intensity * 0.5 * flicker);
    },
  };
}

export interface StallBuild {
  group: THREE.Group;
  lampPosition: THREE.Vector3;
  setLamp(on: boolean): void;
}

export function buildStall(stall: StallLayout): StallBuild {
  const group = new THREE.Group();
  const y = stall.floorY;
  const parts: THREE.BufferGeometry[] = [];
  const c = stall.counter;

  parts.push(box(c.hw * 2, 0.16, c.hd * 2, 0x8a6b41, c.x, y + 1.02, c.z));
  parts.push(box(c.hw * 2 - 0.2, 0.9, 0.14, 0x6d5334, c.x, y + 0.5, c.z - c.hd + 0.1));
  for (const dx of [-c.hw + 0.15, c.hw - 0.15]) {
    parts.push(box(0.12, 1.0, c.hd * 2, 0x6d5334, c.x + dx, y + 0.5, c.z));
  }

  // Навес на четырёх столбах.
  for (const [dx, dz] of [
    [-c.hw, -c.hd - 0.2],
    [c.hw, -c.hd - 0.2],
    [-c.hw, c.hd + 0.7],
    [c.hw, c.hd + 0.7],
  ]) {
    parts.push(box(0.12, 2.4, 0.12, 0x5b452c, c.x + dx, y + 1.2, c.z + dz));
  }
  const canopy = new THREE.BoxGeometry(c.hw * 2 + 0.7, 0.12, c.hd * 2 + 1.5);
  canopy.rotateX(-0.18);
  canopy.translate(c.x, y + 2.5, c.z + 0.2);
  parts.push(tint(canopy, 0x4a5a48));

  // Товар на прилавке.
  parts.push(box(0.34, 0.22, 0.24, 0xb8563c, c.x - 1.0, y + 1.21, c.z));
  parts.push(box(0.28, 0.3, 0.2, 0xd8cdb0, c.x - 0.55, y + 1.25, c.z + 0.05));
  parts.push(box(0.5, 0.16, 0.3, 0x4d5a63, c.x + 0.9, y + 1.18, c.z - 0.05));

  const mesh = new THREE.Mesh(merge(parts), WOOD_MATERIAL());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const lampPosition = new THREE.Vector3(c.x, y + 2.3, c.z + 0.3);
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd9a0 }),
  );
  bulb.position.copy(lampPosition);
  group.add(bulb);

  const lamp = new THREE.PointLight(0xffc880, 0, 12, 2);
  lamp.position.copy(lampPosition);
  group.add(lamp);

  return {
    group,
    lampPosition,
    setLamp(on: boolean) {
      lamp.intensity = on ? 5 : 0;
      (bulb.material as THREE.MeshBasicMaterial).color.setHex(on ? 0xffd9a0 : 0x6b6353);
    },
  };
}

export interface CampfireBuild {
  group: THREE.Group;
  update(dt: number, night: boolean): void;
}

export function buildCampfire(x: number, y: number, z: number): CampfireBuild {
  const group = new THREE.Group();
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const stone = new THREE.DodecahedronGeometry(0.22, 0);
    stone.scale(1, 0.6, 1);
    stone.translate(x + Math.cos(a) * 0.75, y + 0.08, z + Math.sin(a) * 0.75);
    parts.push(tint(stone, 0x746f66));
  }
  for (let i = 0; i < 4; i++) {
    const log = new THREE.CylinderGeometry(0.075, 0.09, 1.0, 6);
    log.rotateZ(Math.PI / 2 - 0.25);
    log.rotateY((i / 4) * Math.PI);
    log.translate(x, y + 0.16, z);
    parts.push(tint(log, 0x4a3626));
  }
  const mesh = new THREE.Mesh(merge(parts), WOOD_MATERIAL());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.75, 7),
    new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85 }),
  );
  flame.position.set(x, y + 0.45, z);
  group.add(flame);

  const light = new THREE.PointLight(0xff8a30, 0, 16, 2);
  light.position.set(x, y + 0.7, z);
  group.add(light);

  let phase = 0;
  return {
    group,
    update(dt: number, night: boolean) {
      phase += dt;
      const flicker = 1 + Math.sin(phase * 9) * 0.14 + Math.sin(phase * 17) * 0.07;
      // Днём костёр тлеет и почти не светит, ночью — главный ориентир на поляне.
      const target = night ? 6.5 : 1.2;
      light.intensity += (target * flicker - light.intensity) * Math.min(1, dt * 5);
      flame.scale.set(flicker, 0.85 + flicker * 0.25, flicker);
      flame.visible = true;
    },
  };
}
