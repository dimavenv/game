import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import type { QualitySettings } from './quality';

/**
 * Постобработка: сцена рисуется в буфер, из него вытягивается свечение
 * (костёр, окна, солнце в кроне) и только потом всё это попадает на экран.
 *
 * Тонмаппинг живёт в OutputPass: three отключает его при рендере в буфер,
 * иначе картинка сжималась бы дважды.
 */
export class PostFx {
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    quality: QualitySettings,
  ) {
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const target = new THREE.WebGLRenderTarget(size.x, size.y, {
      type: THREE.HalfFloatType,
      samples: quality.samples,
      colorSpace: THREE.LinearSRGBColorSpace,
    });

    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(size, quality.bloom, 0.75, 0.82);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  /** Ночью свечения чуть больше: фонарь и костёр должны бить в глаза. */
  setStrength(strength: number): void {
    this.bloom.strength = strength;
  }

  render(): void {
    this.composer.render();
  }
}
