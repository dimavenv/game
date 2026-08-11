import * as THREE from 'three';
import { WORLD } from '../../shared/balance';

const VERT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vWave;
  #include <fog_pars_vertex>

  void main() {
    vec3 p = position;
    float w =
      sin(p.x * 0.55 + uTime * 0.9) * 0.035 +
      sin(p.y * 0.47 - uTime * 0.7) * 0.03 +
      sin((p.x + p.y) * 1.1 + uTime * 1.6) * 0.012;
    p.z += w;
    vWave = w;
    vec4 worldPos = modelMatrix * vec4(p, 1.0);
    vWorld = worldPos.xyz;
    vec4 mvPosition = viewMatrix * worldPos;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const FRAG = /* glsl */ `
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uSkyColor;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform float uSunI;
  uniform float uTime;
  varying vec3 vWorld;
  varying float vWave;
  #include <fog_pars_fragment>

  void main() {
    vec3 viewDir = normalize(cameraPosition - vWorld);

    // Лёгкая рябь: нормаль слегка гуляет, чтобы блики дрожали.
    vec3 n = normalize(vec3(
      sin(vWorld.x * 0.9 + uTime * 1.3) * 0.06,
      1.0,
      sin(vWorld.z * 0.8 - uTime * 1.1) * 0.06
    ));

    float fres = pow(1.0 - clamp(dot(viewDir, n), 0.0, 1.0), 4.0);
    float depthMix = clamp(1.0 - abs(vWave) * 6.0, 0.0, 1.0);
    vec3 body = mix(uShallow, uDeep, depthMix);
    // Отражение неба заметное, но не выбеливающее: иначе озеро выглядит асфальтом.
    vec3 col = mix(body, uSkyColor, clamp(fres * 0.5 + 0.04, 0.0, 1.0));

    vec3 h = normalize(normalize(uSunDir) + viewDir);
    float spec = pow(max(dot(n, h), 0.0), 220.0);
    col += uSunColor * spec * 2.4 * uSunI;

    gl_FragColor = vec4(col, 0.95);
    #include <fog_fragment>
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export class Water {
  readonly mesh: THREE.Mesh;
  private readonly uniforms;

  constructor() {
    const size = WORLD.lakeHalf * 2;
    const geo = new THREE.PlaneGeometry(size, size, 60, 60);

    this.uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(0xfff0d8) },
      uSkyColor: { value: new THREE.Color(0x9fc4e0) },
      uShallow: { value: new THREE.Color(0x3d6b57) },
      uDeep: { value: new THREE.Color(0x11242c) },
      uSunI: { value: 1 },
      ...THREE.UniformsLib.fog,
    };

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      fog: true,
      side: THREE.DoubleSide,
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.y = WORLD.waterLevel;
    this.mesh.name = 'water';
  }

  update(dt: number, sunDir: THREE.Vector3, sunColor: THREE.Color, skyColor: THREE.Color, sunI: number): void {
    this.uniforms.uTime.value += dt;
    this.uniforms.uSunDir.value.copy(sunDir);
    this.uniforms.uSunColor.value.copy(sunColor);
    this.uniforms.uSkyColor.value.copy(skyColor);
    this.uniforms.uSunI.value = sunI;
  }
}
