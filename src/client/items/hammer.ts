import * as THREE from 'three';

const SWING_TIME = 0.6;

/** Молот: им и валуны разбивают, и ставят постройки. */
export class HammerItem {
  private readonly group = new THREE.Group();
  private timer = 0;
  private swinging = false;
  private hitSent = false;
  private clock = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.019, 0.024, 0.7, 7),
      new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 0.9, flatShading: true }),
    );
    handle.position.y = 0.35;

    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 0.13, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x6b6f74, roughness: 0.55, metalness: 0.5, flatShading: true }),
    );
    head.position.y = 0.7;

    const wedge = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.05, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x8a8f95, roughness: 0.5, metalness: 0.6 }),
    );
    wedge.position.set(0, 0.78, 0);

    this.group.add(handle, head, wedge);
    this.group.position.set(0.42, -0.55, -0.6);
    this.group.rotation.set(-0.2, -0.45, 0.55);
    this.group.visible = false;
    this.group.traverse((o) => (o.frustumCulled = false));
    camera.add(this.group);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    if (!visible) this.swinging = false;
  }

  swing(): boolean {
    if (this.swinging || !this.group.visible) return false;
    this.swinging = true;
    this.hitSent = false;
    this.timer = 0;
    return true;
  }

  /** true — ровно в кадр удара. */
  update(dt: number): boolean {
    this.clock += dt;
    let hit = false;

    if (this.swinging) {
      this.timer += dt;
      const t = this.timer / SWING_TIME;
      // Тяжёлый замах: медленно вверх, резко вниз.
      const arc = t < 0.4 ? -Math.sin((t / 0.4) * Math.PI * 0.5) * 0.7 : Math.sin(((t - 0.4) / 0.6) * Math.PI) * 1.7;
      this.group.rotation.x = -0.2 + arc;
      this.group.position.y = -0.55 + arc * 0.07;
      if (!this.hitSent && t >= 0.62) {
        this.hitSent = true;
        hit = true;
      }
      if (t >= 1) {
        this.swinging = false;
        this.group.rotation.x = -0.2;
        this.group.position.y = -0.55;
      }
    } else if (this.group.visible) {
      this.group.position.y = -0.55 + Math.sin(this.clock * 1.4) * 0.005;
    }

    return hit;
  }
}
