import * as THREE from 'three';

/**
 * Сезонная раскраска. Вместо того чтобы пересобирать геометрию на каждый
 * сезон, все обычные материалы получают два общих значения: оттенок, на
 * который умножается цвет, и снег, ложащийся на всё, что смотрит вверх.
 */
export class SeasonLook {
  private readonly snow = { value: 0 };
  private readonly tint = { value: new THREE.Vector3(1, 1, 1) };
  private readonly autumn = { value: 0 };
  private readonly seen = new Set<THREE.Material>();

  /** Подключает один материал. Уже подключённые пропускаются. */
  attach(material: THREE.Material): void {
    if (this.seen.has(material)) return;
    this.seen.add(material);

    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      previous?.call(material, shader, renderer);
      shader.uniforms.uSnow = this.snow;
      shader.uniforms.uSeasonTint = this.tint;
      shader.uniforms.uAutumn = this.autumn;
      shader.vertexShader =
        'varying float vSeasonUp;\n' +
        shader.vertexShader.replace(
          '#include <beginnormal_vertex>',
          '#include <beginnormal_vertex>\n  vSeasonUp = objectNormal.y;',
        );
      shader.fragmentShader =
        'uniform float uSnow;\nuniform vec3 uSeasonTint;\nuniform float uAutumn;\nvarying float vSeasonUp;\n' +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          diffuseColor.rgb *= uSeasonTint;
          // Осень: зелень не умножаем, а уводим в золото при той же светлоте —
          // иначе зелёный канал всё перебивает и лес остаётся летним.
          float seasonLum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
          vec3 seasonGold = vec3(seasonLum * 1.5, seasonLum * 1.02, seasonLum * 0.34);
          diffuseColor.rgb = mix(diffuseColor.rgb, seasonGold, uAutumn);
          // Снег держится на том, что смотрит вверх: на земле, крышах, кронах.
          // Отвесное тоже белеет, но вполсилы — иначе трава торчит грязными
          // прутьями сквозь белое поле.
          float snowMask = uSnow * (0.42 + 0.58 * smoothstep(0.1, 0.65, vSeasonUp));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.95, 0.99), snowMask);`,
        );
    };
    material.needsUpdate = true;
  }

  /** Подключает всё дерево объектов разом. */
  attachAll(root: THREE.Object3D): void {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.material) return;
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of list) {
        // Небо, вода и дым красятся своими шейдерами.
        if ((m as THREE.ShaderMaterial).isShaderMaterial) continue;
        this.attach(m);
      }
    });
  }

  set(snow: number, tint: [number, number, number], autumn: number): void {
    this.snow.value = snow;
    this.tint.value.set(tint[0], tint[1], tint[2]);
    this.autumn.value = autumn;
  }
}
