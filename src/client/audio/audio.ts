import type { Surface } from '../../shared/world/terrain';

/**
 * Весь звук синтезируется на месте: ни одного файла, ни одного запроса в сеть.
 * Ветер, листва и вода — отфильтрованный шум, сверчки и щелчки — короткие
 * огибающие. Записанная озвучка НПС подключится сюда же на этапе 3.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private muffle!: BiquadFilterNode;
  private noise!: AudioBuffer;

  private windGain!: GainNode;
  private leavesGain!: GainNode;
  private waterGain!: GainNode;

  private cricketTimer = 0;
  private started = false;

  get ready(): boolean {
    return this.started;
  }

  /** Вызывается по клику: браузеры не дают звук без жеста пользователя. */
  async start(): Promise<void> {
    if (this.started) {
      await this.ctx?.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 0.55;

    this.muffle = ctx.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.4;

    this.muffle.connect(this.master).connect(ctx.destination);
    this.noise = this.makeNoise(4);

    this.windGain = this.loopLayer('bandpass', 480, 0.7, 0.0);
    this.leavesGain = this.loopLayer('highpass', 1900, 0.5, 0.0);
    this.waterGain = this.loopLayer('bandpass', 340, 1.4, 0.0);

    // Медленные порывы: низкочастотный осциллятор гуляет по громкости ветра.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.35;
    lfo.connect(lfoGain).connect(this.windGain.gain);
    lfo.start();

    await ctx.resume();
    this.started = true;
  }

  private makeNoise(seconds: number): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      // Слегка «розовый» шум — ближе к природным звукам, чем чистый белый.
      last = 0.97 * last + 0.03 * white;
      data[i] = last * 3.2 + white * 0.25;
    }
    return buf;
  }

  private loopLayer(type: BiquadFilterType, freq: number, q: number, gain: number): GainNode {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter).connect(g).connect(this.muffle);
    src.start(ctx.currentTime + Math.random() * 0.5);
    return g;
  }

  private burst(opts: {
    duration: number;
    attack?: number;
    gain: number;
    type: BiquadFilterType;
    freq: number;
    q?: number;
    pan?: number;
    freqTo?: number;
  }): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;

    const filter = ctx.createBiquadFilter();
    filter.type = opts.type;
    filter.frequency.setValueAtTime(opts.freq, now);
    if (opts.freqTo !== undefined) {
      filter.frequency.exponentialRampToValueAtTime(Math.max(opts.freqTo, 40), now + opts.duration);
    }
    filter.Q.value = opts.q ?? 1;

    const g = ctx.createGain();
    const attack = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(opts.gain, now + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, now + opts.duration);

    let tail: AudioNode = g;
    if (opts.pan !== undefined) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = opts.pan;
      g.connect(pan);
      tail = pan;
    }
    src.connect(filter).connect(g);
    tail.connect(this.muffle);
    src.start(now);
    src.stop(now + opts.duration + 0.05);
  }

  private blip(freq: number, duration: number, gain: number, type: OscillatorType = 'square', pan = 0): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(gain, now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    osc.connect(g).connect(p).connect(this.muffle);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  footstep(surface: Surface, running: boolean): void {
    const gain = running ? 0.22 : 0.13;
    if (surface === 'water') {
      this.burst({ duration: 0.28, gain: gain * 1.5, type: 'lowpass', freq: 1200, freqTo: 300, q: 0.7 });
      this.burst({ duration: 0.16, gain: gain * 0.8, type: 'bandpass', freq: 2400, q: 0.9 });
      return;
    }
    if (surface === 'sand') {
      this.burst({ duration: 0.13, gain, type: 'bandpass', freq: 2500, q: 0.7 });
      return;
    }
    this.burst({ duration: 0.15, gain, type: 'bandpass', freq: 1500, freqTo: 700, q: 1.1 });
  }

  lighter(): void {
    this.blip(140, 0.05, 0.16, 'square');
    this.burst({ duration: 0.05, gain: 0.2, type: 'highpass', freq: 3800 });
    window.setTimeout(() => {
      this.burst({ duration: 0.45, attack: 0.06, gain: 0.13, type: 'bandpass', freq: 700, q: 0.8 });
    }, 90);
  }

  inhale(duration: number): void {
    this.burst({ duration, attack: duration * 0.5, gain: 0.16, type: 'bandpass', freq: 900, freqTo: 1500, q: 0.9 });
    // Потрескивание табака.
    for (let i = 0; i < 7; i++) {
      window.setTimeout(
        () => this.burst({ duration: 0.03, gain: 0.05, type: 'highpass', freq: 4200 }),
        Math.random() * duration * 1000,
      );
    }
  }

  exhale(duration: number): void {
    this.burst({ duration, attack: 0.14, gain: 0.14, type: 'lowpass', freq: 1100, freqTo: 500, q: 0.6 });
  }

  flick(): void {
    this.blip(320, 0.06, 0.1, 'triangle');
    this.burst({ duration: 0.12, gain: 0.08, type: 'highpass', freq: 2600 });
  }

  breath(hard: boolean): void {
    this.burst({
      duration: hard ? 0.55 : 0.4,
      attack: 0.12,
      gain: hard ? 0.13 : 0.07,
      type: 'bandpass',
      freq: hard ? 700 : 520,
      q: 0.8,
    });
  }

  private cricket(): void {
    const pan = Math.random() * 1.6 - 0.8;
    const base = 4200 + Math.random() * 700;
    for (let i = 0; i < 4; i++) {
      window.setTimeout(() => this.blip(base, 0.018, 0.02, 'square', pan), i * 32);
    }
  }

  /** Плавное приглушение мира на затяжке. */
  setMuffle(amount: number): void {
    if (!this.ctx) return;
    const f = 20000 * Math.pow(0.045, amount);
    this.muffle.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.08);
    this.master.gain.setTargetAtTime(0.55 - 0.12 * amount, this.ctx.currentTime, 0.1);
  }

  update(
    dt: number,
    info: { night: boolean; windTarget: number; waterCloseness: number; canopy: number },
  ): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.1 + info.windTarget * 0.22, t, 0.8);
    this.leavesGain.gain.setTargetAtTime(0.02 + info.canopy * 0.09, t, 0.8);
    this.waterGain.gain.setTargetAtTime(info.waterCloseness * 0.16, t, 0.5);

    if (info.night) {
      this.cricketTimer -= dt;
      if (this.cricketTimer <= 0) {
        this.cricket();
        this.cricketTimer = 0.25 + Math.random() * 0.9;
      }
    }
  }
}
