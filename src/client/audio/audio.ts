import type { Surface } from '../../shared/world/terrain';
import { SoundSlots } from './slots';

/**
 * Весь звук синтезируется на месте: ни одного файла, ни одного запроса в сеть.
 * Ветер, листва и вода — отфильтрованный шум, сверчки и щелчки — короткие
 * огибающие. Записанная озвучка НПС подключится сюда же на этапе 3.
 */

/**
 * Уровни фонового шума. Фон должен быть слышен, но не мешать: шаги, поклёвка
 * и стоны из чащи важнее ветра, поэтому ветер держим заметно тише остального.
 */
const MIX = {
  /** Ветер: постоянный уровень, добавка от силы ветра и размах порывов. */
  windBase: 0.03,
  windRange: 0.07,
  windGust: 0.045,
  /** Шелест листвы: тем громче, чем гуще крона над головой. */
  leavesBase: 0.015,
  leavesRange: 0.055,
  /** Плеск озера у берега. */
  water: 0.12,
} as const;

export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private muffle!: BiquadFilterNode;
  private noise!: AudioBuffer;

  private windGain!: GainNode;
  private leavesGain!: GainNode;
  private waterGain!: GainNode;
  /** Ветер в ушах: включается только на разгоне тарзанки и в полёте. */
  private rushGain!: GainNode;

  private cricketTimer = 0;
  private started = false;
  private aviVolume = 0;
  private musicTimer = 0;
  private musicStep = 0;
  private slots: SoundSlots | null = null;

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
    this.rushGain = this.loopLayer('bandpass', 1250, 0.55, 0.0);

    // Медленные порывы: низкочастотный осциллятор гуляет по громкости ветра.
    // Размах небольшой — он складывается с базовым уровнем, и на прежних 0.35
    // порыв перекрывал собой всё остальное.
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = MIX.windGust;
    lfo.connect(lfoGain).connect(this.windGain.gain);
    lfo.start();

    // Своя озвучка, если её положили в public/sounds/ (см. SOUNDS.md).
    this.slots = new SoundSlots(ctx, this.muffle);
    void this.slots.load();

    await ctx.resume();
    this.started = true;
  }

  /** Проигрывает записанный файл, если он есть. false — играйте синтез. */
  playSlot(name: string, volume = 1): boolean {
    return this.slots?.play(name, volume) ?? false;
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

  /** Всплеск: заброс поплавка, поклёвка, шаг в воду. */
  splash(strength: number): void {
    this.burst({ duration: 0.22 * strength + 0.12, gain: 0.1 + strength * 0.12, type: 'lowpass', freq: 1600, freqTo: 340, q: 0.8 });
  }

  /** Удар топора по стволу. */
  chop(): void {
    if (this.playSlot('chop')) return;
    this.blip(120, 0.09, 0.16, 'triangle');
    this.burst({ duration: 0.12, gain: 0.16, type: 'bandpass', freq: 900, freqTo: 300, q: 1.6 });
  }

  /** Дерево валится: долгий треск и глухой удар о землю. */
  treeFall(): void {
    this.burst({ duration: 1.1, attack: 0.25, gain: 0.12, type: 'bandpass', freq: 1800, freqTo: 500, q: 0.9 });
    window.setTimeout(() => {
      this.burst({ duration: 0.5, gain: 0.2, type: 'lowpass', freq: 500, freqTo: 90, q: 0.7 });
    }, 1000);
  }

  /** Что-то положили в карман. */
  pickup(): void {
    this.blip(520, 0.07, 0.06, 'triangle');
    this.burst({ duration: 0.09, gain: 0.05, type: 'highpass', freq: 2600 });
  }

  /** Шекели сменили владельца. */
  coins(): void {
    for (let i = 0; i < 3; i++) {
      window.setTimeout(() => this.blip(900 + Math.random() * 500, 0.06, 0.05, 'square'), i * 55);
    }
  }

  /** Полено легло в топку. */
  stoke(): void {
    this.burst({ duration: 0.3, gain: 0.13, type: 'lowpass', freq: 800, freqTo: 220, q: 0.7 });
    this.burst({ duration: 0.7, attack: 0.2, gain: 0.07, type: 'bandpass', freq: 600, q: 0.6 });
  }

  /** Выстрел из дробовика: низкий удар и рваный хвост. */
  shotgun(): void {
    if (this.playSlot('shotgun')) return;
    this.burst({ duration: 0.6, gain: 0.42, type: 'lowpass', freq: 2400, freqTo: 120, q: 0.6 });
    this.burst({ duration: 0.18, gain: 0.3, type: 'highpass', freq: 2200 });
    this.blip(70, 0.25, 0.2, 'sine');
  }

  dryFire(): void {
    this.blip(210, 0.05, 0.08, 'square');
  }

  reload(): void {
    this.blip(180, 0.06, 0.07, 'square');
    window.setTimeout(() => this.blip(150, 0.07, 0.07, 'square'), 260);
    window.setTimeout(() => this.blip(260, 0.05, 0.06, 'triangle'), 1900);
  }

  /** Стон зомби: гортанный шум с подвыванием. */
  groan(distance: number, notice = false): void {
    if (this.playSlot(notice ? 'zombie_notice' : 'zombie_idle', Math.max(0.15, 1 - distance / 30))) return;
    const gain = Math.max(0.02, 0.16 * (1 - distance / 30)) * (notice ? 1.6 : 1);
    this.burst({
      duration: notice ? 0.8 : 1.3,
      attack: 0.15,
      gain,
      type: 'bandpass',
      freq: notice ? 420 : 260,
      freqTo: notice ? 180 : 140,
      q: 3.5,
      pan: Math.random() * 1.4 - 0.7,
    });
  }

  zombieDown(): void {
    if (this.playSlot('zombie_die')) return;
    this.burst({ duration: 0.5, gain: 0.2, type: 'lowpass', freq: 900, freqTo: 90, q: 0.8 });
  }

  /** Игроку прилетело. */
  hurt(): void {
    if (this.playSlot('hero_hurt')) return;
    this.burst({ duration: 0.35, gain: 0.26, type: 'lowpass', freq: 1400, freqTo: 200, q: 0.9 });
    this.blip(90, 0.18, 0.14, 'sine');
  }

  death(): void {
    if (this.playSlot('hero_death')) return;
    this.burst({ duration: 1.6, attack: 0.1, gain: 0.24, type: 'lowpass', freq: 700, freqTo: 60, q: 0.7 });
  }

  /** Резкий короткий вдох носом. */
  burstSniff(): void {
    this.burst({ duration: 0.22, attack: 0.02, gain: 0.2, type: 'highpass', freq: 2600, freqTo: 900, q: 1.2 });
  }

  /** Скрип двери: тон плывёт вверх на открытии и вниз на закрытии. */
  doorCreak(opening: boolean): void {
    if (this.playSlot('door_creak')) return;
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(opening ? 210 : 260, now);
    osc.frequency.exponentialRampToValueAtTime(opening ? 320 : 165, now + 0.55);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 900;
    filter.Q.value = 6;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.linearRampToValueAtTime(0.035, now + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(filter).connect(g).connect(this.muffle);
    osc.start(now);
    osc.stop(now + 0.62);
    // Стук щеколды в конце хода.
    window.setTimeout(() => this.blip(120, 0.05, 0.06, 'triangle'), opening ? 520 : 460);
  }

  /** Ветер в ушах на разгоне и в полёте: 0 — тишина, 1 — свист. */
  setWind(level: number): void {
    if (!this.ctx) return;
    this.rushGain.gain.setTargetAtTime(level * 0.32, this.ctx.currentTime, 0.09);
  }

  /** Свист отрыва от перекладины. */
  whoosh(): void {
    this.burst({ duration: 0.5, attack: 0.08, gain: 0.16, type: 'bandpass', freq: 700, freqTo: 2200, q: 0.7 });
  }

  /** Приводнение: удар по воде и облако брызг следом. */
  bigSplash(): void {
    this.burst({ duration: 0.55, gain: 0.34, type: 'lowpass', freq: 1800, freqTo: 120, q: 0.7 });
    this.burst({ duration: 0.9, attack: 0.03, gain: 0.2, type: 'highpass', freq: 2200 });
    window.setTimeout(() => {
      this.burst({ duration: 0.7, attack: 0.12, gain: 0.12, type: 'bandpass', freq: 900, freqTo: 300, q: 0.8 });
    }, 180);
  }

  bandage(): void {
    this.burst({ duration: 0.5, attack: 0.2, gain: 0.09, type: 'highpass', freq: 2400 });
  }

  private cricket(): void {
    const pan = Math.random() * 1.6 - 0.8;
    const base = 4200 + Math.random() * 700;
    for (let i = 0; i < 4; i++) {
      window.setTimeout(() => this.blip(base, 0.018, 0.02, 'square', pan), i * 32);
    }
  }

  /**
   * Тихая музыка из колонки Ави. Громкость задаётся расстоянием, поэтому
   * ночью его можно найти на слух.
   */
  setAviMusic(volume: number): void {
    this.aviVolume = volume;
  }

  private musicNote(): void {
    // Ленивая пентатоника: пара нот, которые не приедаются за ночь.
    const scale = [196, 233, 261, 293, 349, 392];
    const note = scale[[0, 2, 4, 2, 5, 3, 1, 2][this.musicStep % 8]];
    this.musicStep += 1;
    this.blip(note, 0.35, 0.05 * this.aviVolume, 'triangle', (Math.random() - 0.5) * 0.4);
    if (this.musicStep % 4 === 0) {
      this.burst({ duration: 0.16, gain: 0.06 * this.aviVolume, type: 'lowpass', freq: 240, freqTo: 70, q: 0.8 });
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
    this.windGain.gain.setTargetAtTime(MIX.windBase + info.windTarget * MIX.windRange, t, 0.8);
    this.leavesGain.gain.setTargetAtTime(MIX.leavesBase + info.canopy * MIX.leavesRange, t, 0.8);
    this.waterGain.gain.setTargetAtTime(info.waterCloseness * MIX.water, t, 0.5);

    if (this.aviVolume > 0.002) {
      this.musicTimer -= dt;
      if (this.musicTimer <= 0) {
        this.musicTimer = 0.34;
        this.musicNote();
      }
    }

    if (info.night) {
      this.cricketTimer -= dt;
      if (this.cricketTimer <= 0) {
        this.cricket();
        this.cricketTimer = 0.25 + Math.random() * 0.9;
      }
    }
  }
}
