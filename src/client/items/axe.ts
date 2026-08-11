import * as THREE from 'three';
import { CHOP } from '../../shared/balance';

/** Топор в руке: замах ощутимый, удар засчитывается в середине дуги. */
export class AxeItem {
  private readonly group = new THREE.Group();
  private timer = 0;
  private swinging = false;
  private hitSent = false;
  private clock = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.017, 0.021, 0.62, 7),
      new THREE.MeshStandardMaterial({ color: 0x8a6a42, roughness: 0.9, flatShading: true }),
    );
    handle.position.y = 0.31;

    const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.45, metalness: 0.6, flatShading: true });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.14, 0.03), steel);
    head.position.set(0, 0.6, 0.02);
    const blade = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.1, 4), steel);
    blade.rotation.z = Math.PI / 2;
    blade.rotation.y = Math.PI / 4;
    blade.position.set(0, 0.6, 0.09);

    this.group.add(handle, head, blade);
    this.group.position.set(0.44, -0.56, -0.62);
    this.group.rotation.set(-0.22, -0.5, 0.6);
    this.group.scale.setScalar(0.88);
    this.group.visible = false;
    this.group.traverse((o) => (o.frustumCulled = false));
    camera.add(this.group);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    if (!visible) this.swinging = false;
  }

  get busy(): boolean {
    return this.swinging;
  }

  swing(): boolean {
    if (this.swinging || !this.group.visible) return false;
    this.swinging = true;
    this.hitSent = false;
    this.timer = 0;
    return true;
  }

  /** Возвращает true ровно в кадр удара. */
  update(dt: number): boolean {
    this.clock += dt;
    let hit = false;

    if (this.swinging) {
      this.timer += dt;
      const t = this.timer / CHOP.swingTime;
      // Замах назад, потом резкий проход вперёд.
      const arc = t < 0.35 ? -Math.sin((t / 0.35) * Math.PI * 0.5) * 0.5 : Math.sin(((t - 0.35) / 0.65) * Math.PI) * 1.5;
      this.group.rotation.x = -0.22 + arc;
      this.group.position.y = -0.56 + arc * 0.06;

      if (!this.hitSent && t >= 0.6) {
        this.hitSent = true;
        hit = true;
      }
      if (t >= 1) {
        this.swinging = false;
        this.group.rotation.x = -0.22;
        this.group.position.y = -0.56;
      }
    } else if (this.group.visible) {
      this.group.position.y = -0.56 + Math.sin(this.clock * 1.6) * 0.004;
      this.group.rotation.z = 0.6 + Math.sin(this.clock * 1.1) * 0.012;
    }

    return hit;
  }
}
