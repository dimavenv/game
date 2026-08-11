import * as THREE from 'three';

const VERT = /* glsl */ `
  attribute float aSize;
  attribute float aAlpha;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (330.0 / max(-mv.z, 0.1));
    gl_Position = projectionMatrix * mv;
  }
`;

const FRAG = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uColor;
  varying float vAlpha;
  void main() {
    vec4 tex = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(uColor, tex.a * vAlpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function puffTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Клубы дыма: пул точек, вся анимация считается на процессоре — их немного. */
export class Smoke {
  readonly points: THREE.Points;
  private readonly max: number;
  private readonly pos: Float32Array;
  private readonly size: Float32Array;
  private readonly alpha: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly grow: Float32Array;
  private readonly peak: Float32Array;
  private cursor = 0;
  private readonly color = new THREE.Color(0xb9bcb6);

  constructor(max = 420) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    this.grow = new Float32Array(max);
    this.peak = new Float32Array(max);
    this.life.fill(-1);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setDrawRange(0, max);

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: puffTexture() },
        uColor: { value: this.color },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    });

    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  spawn(
    p: THREE.Vector3,
    v: THREE.Vector3,
    opts: { size: number; life: number; alpha: number; grow: number },
  ): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = p.x;
    this.pos[i * 3 + 1] = p.y;
    this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x;
    this.vel[i * 3 + 1] = v.y;
    this.vel[i * 3 + 2] = v.z;
    this.age[i] = 0;
    this.life[i] = opts.life;
    this.size[i] = opts.size;
    this.grow[i] = opts.grow;
    this.peak[i] = opts.alpha;
    this.alpha[i] = 0;
  }

  /** Цвет дыма подтягивается к свету сцены — на закате он рыжеет. */
  setLight(color: THREE.Color, intensity: number): void {
    this.color.setRGB(0.72, 0.73, 0.71).lerp(color, 0.35).multiplyScalar(0.55 + intensity * 0.28);
  }

  update(dt: number, wind: THREE.Vector3): void {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] < 0) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.life[i] = -1;
        this.alpha[i] = 0;
        this.size[i] = 0;
        continue;
      }

      const drag = Math.exp(-1.3 * dt);
      this.vel[i * 3] = this.vel[i * 3] * drag + wind.x * dt * 0.6;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag + (0.22 + wind.y) * dt;
      this.vel[i * 3 + 2] = this.vel[i * 3 + 2] * drag + wind.z * dt * 0.6;

      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;

      this.size[i] += this.grow[i] * dt;
      // Быстро проявляется, долго тает.
      this.alpha[i] = this.peak[i] * Math.min(t * 6, 1) * (1 - t) * (1 - t);
    }

    const geo = this.points.geometry;
    (geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
    (geo.attributes.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
}
