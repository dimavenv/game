import * as THREE from 'three';
import { WEAPONS } from '../../shared/balance';

export type ShotgunEvent = 'fired' | 'empty' | 'reload-start' | 'reload-done' | null;

/** Двустволка: два патрона, долгая перезарядка, в упор — насмерть. */
export class ShotgunItem {
  loaded = 0;

  private readonly group = new THREE.Group();
  private readonly muzzle = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 6, 5),
    new THREE.MeshBasicMaterial({ color: 0xffcf7a, transparent: true, opacity: 0 }),
  );
  private readonly light: THREE.PointLight;

  private cooldown = 0;
  private reloadTimer = 0;
  private reloading = false;
  private recoil = 0;
  private clock = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a3c26, roughness: 0.85, flatShading: true });
    const steel = new THREE.MeshStandardMaterial({ color: 0x4a4f55, roughness: 0.5, metalness: 0.7, flatShading: true });

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.34), wood);
    stock.position.set(0, -0.02, 0.16);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.3), wood);
    grip.position.set(0, -0.03, -0.1);

    for (const dx of [-0.026, 0.026]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 0.62, 8), steel);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(dx, 0.015, -0.32);
      this.group.add(barrel);
    }

    this.muzzle.position.set(0, 0.015, -0.64);
    this.light = new THREE.PointLight(0xffb960, 0, 14, 2);
    this.light.position.copy(this.muzzle.position);

    this.group.add(stock, grip, this.muzzle, this.light);
    this.group.position.set(0.17, -0.24, -0.42);
    this.group.rotation.set(0.02, 0.06, 0);
    this.group.visible = false;
    this.group.traverse((o) => (o.frustumCulled = false));
    camera.add(this.group);
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
    if (!visible) {
      this.reloading = false;
      this.reloadTimer = 0;
    }
  }

  get busy(): boolean {
    return this.reloading || this.cooldown > 0;
  }

  /** ЛКМ. Возвращает 'fired', если выстрел действительно был. */
  fire(): ShotgunEvent {
    if (!this.group.visible || this.reloading || this.cooldown > 0) return null;
    if (this.loaded <= 0) return 'empty';
    this.loaded -= 1;
    this.cooldown = WEAPONS.shotgun.fireCooldown;
    this.recoil = 1;
    (this.muzzle.material as THREE.MeshBasicMaterial).opacity = 0.95;
    this.light.intensity = 26;
    return 'fired';
  }

  /** R. Патроны списывает вызывающий: он знает, сколько их в кармане. */
  startReload(available: number): ShotgunEvent {
    if (!this.group.visible || this.reloading) return null;
    if (this.loaded >= WEAPONS.shotgun.capacity || available <= 0) return null;
    this.reloading = true;
    this.reloadTimer = WEAPONS.shotgun.reloadTime;
    return 'reload-start';
  }

  update(dt: number): ShotgunEvent {
    this.clock += dt;
    let event: ShotgunEvent = null;

    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.reloading) {
      this.reloadTimer -= dt;
      // Ствол «переламывается» на перезарядке.
      const t = 1 - this.reloadTimer / WEAPONS.shotgun.reloadTime;
      this.group.rotation.x = 0.02 + Math.sin(t * Math.PI) * 0.7;
      this.group.position.y = -0.24 - Math.sin(t * Math.PI) * 0.1;
      if (this.reloadTimer <= 0) {
        this.reloading = false;
        event = 'reload-done';
      }
    }

    if (this.recoil > 0) {
      this.recoil = Math.max(0, this.recoil - dt * 5);
      this.group.position.z = -0.42 + this.recoil * 0.09;
      this.group.rotation.x = 0.02 + this.recoil * 0.28;
    } else if (!this.reloading && this.group.visible) {
      this.group.position.z = -0.42;
      this.group.position.y = -0.24 + Math.sin(this.clock * 1.5) * 0.004;
      this.group.rotation.x = 0.02;
    }

    const material = this.muzzle.material as THREE.MeshBasicMaterial;
    if (material.opacity > 0) material.opacity = Math.max(0, material.opacity - dt * 8);
    if (this.light.intensity > 0) this.light.intensity = Math.max(0, this.light.intensity - dt * 180);

    return event;
  }

  hint(shells: number): string {
    if (this.reloading) return 'перезарядка…';
    if (this.loaded <= 0) return shells > 0 ? 'R — перезарядить' : 'патронов нет';
    return `ЛКМ — стрелять (${this.loaded}/${WEAPONS.shotgun.capacity})`;
  }
}
