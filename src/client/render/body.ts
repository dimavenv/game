import * as THREE from 'three';

/**
 * Человеческая фигура из гранёных частей, но с суставами: бедро — колено —
 * стопа, плечо — локоть — кисть. Из неё собраны и НПС, и мертвецы: разница
 * только в цветах, позе и том, как её потом двигать.
 */

export interface BodyColors {
  skin: number;
  cloth: number;
  trousers: number;
  shoes: number;
  hair?: number;
  hat?: number;
  /** Капюшон вместо шапки — им отличается Ави. */
  hood?: number;
  beard?: number;
}

export interface BodyOptions {
  /** Сутулость мертвеца: плечи вперёд, голова свесилась. */
  hunched?: boolean;
  /** Ростовой множитель. */
  scale?: number;
}

export interface BodyRig {
  group: THREE.Group;
  hips: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  shoulders: [THREE.Group, THREE.Group];
  elbows: [THREE.Group, THREE.Group];
  thighs: [THREE.Group, THREE.Group];
  knees: [THREE.Group, THREE.Group];
}

function material(hex: number, rough = 0.92): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0, flatShading: true });
}

/** Сужает низ коробки: так пояс, челюсть и голенище перестают быть брусками. */
function taper(geo: THREE.BufferGeometry, bottom: number, top = 1): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    min = Math.min(min, y);
    max = Math.max(max, y);
  }
  const span = Math.max(max - min, 0.0001);
  for (let i = 0; i < pos.count; i++) {
    const t = (pos.getY(i) - min) / span;
    const k = bottom + (top - bottom) * t;
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Часть тела: меш подвешен под шарниром, а не отцентрован по нему. */
function limb(
  parent: THREE.Group,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  length: number,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = -length / 2;
  parent.add(mesh);
  return mesh;
}

function joint(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export function buildBody(colors: BodyColors, options: BodyOptions = {}): BodyRig {
  const group = new THREE.Group();
  const skin = material(colors.skin, 0.85);
  const cloth = material(colors.cloth);
  const trousers = material(colors.trousers);
  const shoes = material(colors.shoes, 0.75);

  // Таз: от него растёт всё остальное.
  const hips = joint(group, 0, 0.92, 0);
  const pelvis = new THREE.Mesh(taper(new THREE.BoxGeometry(0.34, 0.2, 0.24), 0.86), trousers);
  pelvis.position.y = -0.06;
  hips.add(pelvis);

  // Ноги: бедро — колено — стопа.
  const thighs: [THREE.Group, THREE.Group] = [
    joint(hips, -0.11, -0.1, 0),
    joint(hips, 0.11, -0.1, 0),
  ];
  const knees: [THREE.Group, THREE.Group] = [
    joint(thighs[0], 0, -0.42, 0),
    joint(thighs[1], 0, -0.42, 0),
  ];
  for (let i = 0; i < 2; i++) {
    limb(thighs[i], taper(new THREE.BoxGeometry(0.17, 0.42, 0.19), 0.88), trousers, 0.42);
    limb(knees[i], taper(new THREE.BoxGeometry(0.14, 0.4, 0.16), 0.85), trousers, 0.4);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.09, 0.26), shoes);
    foot.position.set(0, -0.44, 0.04);
    knees[i].add(foot);
  }

  // Корпус: грудь шире пояса, сверху воротник.
  const chest = joint(hips, 0, 0.02, 0);
  const torso = new THREE.Mesh(taper(new THREE.BoxGeometry(0.44, 0.58, 0.26), 0.78), cloth);
  torso.position.y = 0.29;
  chest.add(torso);
  const collar = new THREE.Mesh(taper(new THREE.BoxGeometry(0.4, 0.08, 0.24), 0.9), cloth);
  collar.position.y = 0.6;
  chest.add(collar);

  // Руки: плечо — локоть — кисть.
  const shoulders: [THREE.Group, THREE.Group] = [
    joint(chest, -0.26, 0.52, 0),
    joint(chest, 0.26, 0.52, 0),
  ];
  const elbows: [THREE.Group, THREE.Group] = [
    joint(shoulders[0], 0, -0.29, 0),
    joint(shoulders[1], 0, -0.29, 0),
  ];
  for (let i = 0; i < 2; i++) {
    limb(shoulders[i], taper(new THREE.BoxGeometry(0.13, 0.29, 0.14), 0.9), cloth, 0.29);
    limb(elbows[i], taper(new THREE.BoxGeometry(0.11, 0.27, 0.12), 0.92), cloth, 0.27);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.11, 0.11), skin);
    hand.position.y = -0.32;
    elbows[i].add(hand);
  }

  // Голова: челюсть уже темени, на лице глаза, нос и рот.
  const neck = joint(chest, 0, 0.62, 0);
  const neckMesh = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.08, 0.11), skin);
  neckMesh.position.y = 0.03;
  neck.add(neckMesh);

  const head = joint(neck, 0, 0.075, 0);
  const skull = new THREE.Mesh(taper(new THREE.BoxGeometry(0.21, 0.25, 0.22), 0.82), skin);
  skull.position.y = 0.125;
  head.add(skull);

  const dark = material(0x24211d, 1);
  for (const dx of [-0.055, 0.055]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.022, 0.02), dark);
    eye.position.set(dx, 0.15, 0.105);
    head.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.05, 0.035), skin);
  nose.position.set(0, 0.115, 0.108);
  head.add(nose);
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.014, 0.015), dark);
  mouth.position.set(0, 0.062, 0.1);
  head.add(mouth);

  if (colors.beard !== undefined) {
    const beard = new THREE.Mesh(taper(new THREE.BoxGeometry(0.2, 0.13, 0.19), 0.7), material(colors.beard, 1));
    beard.position.set(0, 0.045, 0.02);
    head.add(beard);
  }

  if (colors.hair !== undefined) {
    const hair = material(colors.hair, 1);
    const cap = new THREE.Mesh(taper(new THREE.BoxGeometry(0.225, 0.11, 0.235), 1, 0.86), hair);
    cap.position.y = 0.215;
    head.add(cap);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.215, 0.16, 0.06), hair);
    back.position.set(0, 0.13, -0.09);
    head.add(back);
  }

  if (colors.hat !== undefined) {
    const hat = material(colors.hat, 1);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.13, 0.11, 8), hat);
    crown.position.y = 0.28;
    head.add(crown);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.025, 0.16), hat);
    brim.position.set(0, 0.235, 0.11);
    head.add(brim);
  }

  if (colors.hood !== undefined) {
    const hood = material(colors.hood, 1);
    const shell = new THREE.Mesh(taper(new THREE.BoxGeometry(0.28, 0.3, 0.29), 0.85), hood);
    shell.position.set(0, 0.13, -0.03);
    head.add(shell);
    // Вырез капюшона: лицо остаётся видно, козырёк нависает.
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.1), hood);
    visor.position.set(0, 0.235, 0.09);
    head.add(visor);
    const drape = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, 0.1), hood);
    drape.position.set(0, -0.03, -0.14);
    head.add(drape);
  }

  if (options.hunched) {
    chest.rotation.x = 0.3;
    neck.rotation.x = -0.12;
    head.rotation.x = -0.1;
  }

  if (options.scale !== undefined) group.scale.setScalar(options.scale);

  group.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  return { group, hips, chest, neck, head, shoulders, elbows, thighs, knees };
}
