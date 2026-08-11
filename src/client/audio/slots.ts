/**
 * Слоты под свою озвучку. Игра синтезирует весь звук сама, но если положить
 * в public/sounds/ файл с нужным именем — он подменит синтез. Ничего класть
 * не обязательно: чего нет, то просто не звучит.
 *
 * Правила именования: <имя-слота>.mp3, дополнительные варианты —
 * <имя-слота>_2.mp3, _3, _4. Игра выбирает вариант случайно.
 */
export interface SlotSpec {
  name: string;
  description: string;
}

export const SOUND_SLOTS: SlotSpec[] = [
  { name: 'buravchik_greet', description: 'Буравчик здоровается, когда к нему подходят' },
  { name: 'buravchik_quest', description: 'Буравчик выдаёт задание' },
  { name: 'buravchik_done', description: 'Буравчик принимает работу и платит' },
  { name: 'buravchik_light', description: 'Буравчик просит прикурить' },
  { name: 'buravchik_no', description: 'Буравчик отказывает' },
  { name: 'tomer_greet', description: 'Томер здоровается' },
  { name: 'tomer_buy', description: 'Томер продал товар' },
  { name: 'tomer_poor', description: 'Томер видит, что денег не хватает' },
  { name: 'tomer_sell', description: 'Томер принял улов' },
  { name: 'avi_greet', description: 'Ави Загур заметил, что к нему подошли' },
  { name: 'avi_deal', description: 'Ави продал товар или принял вино' },
  { name: 'avi_job', description: 'Ави выдал поручение на ночь' },
  { name: 'drug_cocaine', description: 'Герой употребляет кокаин' },
  { name: 'drug_hash', description: 'Герой раскуривает гашиш' },
  { name: 'drug_heroin', description: 'Герой употребляет героин' },
  { name: 'hero_puff', description: 'Герой затягивается' },
  { name: 'hero_fish', description: 'Герой вытащил рыбу' },
  { name: 'hero_hurt', description: 'Герою прилетело от зомби' },
  { name: 'hero_death', description: 'Герой умер' },
  { name: 'hero_sign', description: 'Герой прочитал табличку «Круглое озеро»' },
  { name: 'hero_tribute', description: 'Герой отдаёт дань уважения Серёге Пирату' },
  { name: 'zombie_idle', description: 'Зомби бродит и стонет' },
  { name: 'zombie_notice', description: 'Зомби заметил игрока' },
  { name: 'zombie_die', description: 'Зомби упокоен' },
  { name: 'chop', description: 'Удар топором по стволу' },
  { name: 'shotgun', description: 'Выстрел из дробовика' },
  { name: 'night_start', description: 'Наступила ночь' },
  { name: 'door_creak', description: 'Дверь хижины открывается или закрывается' },
];

const EXTENSIONS = ['mp3', 'ogg', 'wav'];
const MAX_VARIANTS = 4;

export class SoundSlots {
  private readonly buffers = new Map<string, AudioBuffer[]>();
  private loaded = false;

  constructor(
    private readonly ctx: AudioContext,
    private readonly destination: AudioNode,
    private readonly base = 'sounds/',
  ) {}

  get count(): number {
    return this.buffers.size;
  }

  private async fetchBuffer(path: string): Promise<AudioBuffer | null> {
    try {
      const response = await fetch(this.base + path, { cache: 'force-cache' });
      if (!response.ok) return null;
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength < 64) return null;
      return await this.ctx.decodeAudioData(bytes);
    } catch {
      return null;
    }
  }

  /** Пробует найти файлы для каждого слота. Отсутствие файла — норма. */
  async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;

    await Promise.all(
      SOUND_SLOTS.map(async ({ name }) => {
        const variants: AudioBuffer[] = [];
        for (const ext of EXTENSIONS) {
          const first = await this.fetchBuffer(`${name}.${ext}`);
          if (!first) continue;
          variants.push(first);
          for (let i = 2; i <= MAX_VARIANTS; i++) {
            const extra = await this.fetchBuffer(`${name}_${i}.${ext}`);
            if (!extra) break;
            variants.push(extra);
          }
          break;
        }
        if (variants.length > 0) this.buffers.set(name, variants);
      }),
    );
  }

  has(name: string): boolean {
    return this.buffers.has(name);
  }

  /** Играет случайный вариант. false — файла нет, зовите синтез. */
  play(name: string, volume = 1): boolean {
    const variants = this.buffers.get(name);
    if (!variants || variants.length === 0) return false;
    const source = this.ctx.createBufferSource();
    source.buffer = variants[Math.floor(Math.random() * variants.length)];
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.connect(gain).connect(this.destination);
    source.start();
    return true;
  }
}
