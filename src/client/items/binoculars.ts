import * as THREE from 'three';

/**
 * Бинокль — награда за верно посчитанных дроздов. Больше нигде его не взять.
 * Пока держишь левую кнопку, он поднимается к глазам и обзор сужается до
 * двадцати с небольшим градусов: с горы видно полкарты.
 */

/** До какого угла обзора сужается кадр в прижатом к глазам бинокле. */
const ZOOM_FOV = -50;
/** Насколько быстро он поднимается и опускается. */
const SPEED = 4.5;

function material(hex: number, roughness = 0.55): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: hex, roughness, flatShading: true });
}

export class Binoculars {
  private readonly group = new THREE.Group();
  /** Насколько прижат к глазам: 0 — висит на груди, 1 — смотришь. */
  private raised = 0;
  private clock = 0;

  /** Поправка к углу обзора: игра складывает её с остальными. */
  fov = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    const body = material(0x2c2a26, 0.7);
    const rubber = material(0x1a1815, 0.95);
    const glass = new THREE.MeshStandardMaterial({
      color: 0x7fb4c8,
      roughness: 0.08,
      metalness: 0.4,
      flatShading: true,
    });

    for (const side of [-1, 1]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.05, 0.2, 10), body);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(side * 0.05, 0, -0.02);
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.07, 10), rubber);
      grip.rotation.x = Math.PI / 2;
      grip.position.set(side * 0.05, 0, -0.04);
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.041, 0.041, 0.01, 10), glass);
      lens.rotation.x = Math.PI / 2;
      lens.position.set(side * 0.05, 0, -0.125);
      const eyecup = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.036, 0.045, 8), rubber);
      eyecup.rotation.x = Math.PI / 2;
      eyecup.position.set(side * 0.05, 0, 0.115);
      this.group.add(barrel, grip, lens, eyecup);
    }

    // Перемычка с колёсиком фокуса.
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.05, 0.08), body);
    this.group.add(bridge);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 10), rubber);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(0, 0.03, -0.01);
    this.group.add(wheel);

    this.group.position.set(0.22, -0.3, -0.42);
    this.group.rotation.set(0.3, -0.3, 0.12);
    this.group.visible = false;
    this.group.traverse((o) => (o.frustumCulled = false));
    camera.add(this.group);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    if (!visible) {
      this.raised = 0;
      this.fov = 0;
    }
  }

  update(dt: number, looking: boolean): void {
    this.clock += dt;
    if (!this.group.visible) {
      this.fov = 0;
      return;
    }

    const target = looking ? 1 : 0;
    this.raised += (target - this.raised) * Math.min(1, dt * SPEED);
    const k = this.raised * this.raised * (3 - 2 * this.raised);

    // От груди к глазам: поднимается, выравнивается и уходит в центр кадра.
    this.group.position.set(0.22 - k * 0.22, -0.3 + k * 0.3, -0.42 + k * 0.24);
    this.group.rotation.set(0.3 - k * 0.3, -0.3 + k * 0.3, 0.12 - k * 0.12);
    // Держат руками, поэтому картинка чуть плавает.
    if (k > 0.5) {
      this.group.position.x += Math.sin(this.clock * 1.7) * 0.002;
      this.group.position.y += Math.sin(this.clock * 2.3) * 0.002;
    }
    this.fov = ZOOM_FOV * k;
  }
}
