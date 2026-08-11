import * as THREE from 'three';
import { buildBody, type BodyColors } from './body';

export type Pose = 'standing' | 'sitting';

/**
 * Живой человечек: собранная фигура плюс покачивание — дышит, переминается,
 * поводит головой. Сидящая поза складывает бёдра и голени и откидывает спину.
 */
export function buildHuman(
  colors: BodyColors,
  pose: Pose,
): { group: THREE.Group; update(dt: number): void } {
  const rig = buildBody(colors);
  const { group, hips, chest, neck, shoulders, elbows, thighs, knees } = rig;

  if (pose === 'sitting') {
    hips.position.y = 0.5;
    for (let i = 0; i < 2; i++) {
      thighs[i].rotation.x = -Math.PI / 2 + 0.12;
      knees[i].rotation.x = Math.PI / 2 - 0.22;
      shoulders[i].rotation.x = -0.42;
      elbows[i].rotation.x = -0.55;
    }
    shoulders[0].rotation.z = 0.16;
    shoulders[1].rotation.z = -0.16;
    chest.rotation.x = -0.14;
  } else {
    for (let i = 0; i < 2; i++) elbows[i].rotation.x = -0.22;
    shoulders[0].rotation.z = 0.1;
    shoulders[1].rotation.z = -0.1;
  }

  const base = {
    hipsY: hips.position.y,
    chestX: chest.rotation.x,
    left: shoulders[0].rotation.x,
    right: shoulders[1].rotation.x,
  };

  let phase = Math.random() * 10;
  return {
    group,
    update(dt: number) {
      phase += dt;
      const breath = Math.sin(phase * 1.25);
      hips.position.y = base.hipsY + breath * 0.008;
      chest.rotation.x = base.chestX + breath * 0.02;
      neck.rotation.y = Math.sin(phase * 0.31) * 0.22;
      neck.rotation.z = Math.sin(phase * 0.23) * 0.05;
      shoulders[0].rotation.x = base.left + Math.sin(phase * 0.8) * 0.05;
      shoulders[1].rotation.x = base.right - Math.sin(phase * 0.8) * 0.05;
    },
  };
}

export interface NpcHandle {
  group: THREE.Group;
  /** Точка над головой — туда крепится ник. */
  labelPoint: THREE.Vector3;
  update(dt: number): void;
}

const LOOKS: Record<'buravchik' | 'tomer' | 'avi', BodyColors> = {
  // Буравчик: борода лопатой, кепка, что-то защитного цвета.
  buravchik: {
    skin: 0xc79a72,
    cloth: 0x3f4a33,
    trousers: 0x2f3a44,
    shoes: 0x2e2a24,
    hat: 0x4a4436,
    beard: 0x5a4632,
  },
  // Томер: светлая рубаха торговца и чёрные вихры.
  tomer: {
    skin: 0xc08f5e,
    cloth: 0xc9c0a4,
    trousers: 0x59544a,
    shoes: 0x40382e,
    hair: 0x2a231c,
    beard: 0x33291f,
  },
  // Ави: тот же типаж, что у брата, но весь в тёмном и под капюшоном.
  avi: {
    skin: 0xb98553,
    cloth: 0x2b2f36,
    trousers: 0x24272c,
    shoes: 0x1c1a18,
    hood: 0x1f2226,
    beard: 0x2b2319,
  },
};

export function createNpc(
  name: 'buravchik' | 'tomer' | 'avi',
  x: number,
  y: number,
  z: number,
  rotation: number,
): NpcHandle {
  const pose: Pose = name === 'buravchik' ? 'sitting' : 'standing';
  const built = buildHuman(LOOKS[name], pose);

  built.group.position.set(x, y, z);
  built.group.rotation.y = rotation;

  const labelPoint = new THREE.Vector3(x, y + (pose === 'sitting' ? 1.42 : 1.9), z);
  return { group: built.group, labelPoint, update: built.update };
}
