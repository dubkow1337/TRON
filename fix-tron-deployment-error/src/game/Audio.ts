// ─────────────────────────────────────────────────────────────
//  Синтезированный звук: моторы циклов, эффекты, процедурная музыка
//  с синхронизацией неонового ритма в такт
// ─────────────────────────────────────────────────────────────

type Ctx = AudioContext;

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

export class EngineVoice {
  private ctx: Ctx;
  private o1: OscillatorNode;
  private o2: OscillatorNode;
  private sub: OscillatorNode;
  private whine: OscillatorNode;
  private filter: BiquadFilterNode;
  private gain: GainNode;
  private pan: StereoPannerNode;
  private stopped = false;
  private player: boolean;
  private deep: boolean;

  constructor(ctx: Ctx, out: AudioNode, player: boolean, deep = false) {
    this.ctx = ctx;
    this.player = player;
    this.deep = deep;
    this.o1 = ctx.createOscillator();
    this.o1.type = 'sawtooth';
    this.o2 = ctx.createOscillator();
    this.o2.type = 'sawtooth';
    this.o2.detune.value = 14;
    this.sub = ctx.createOscillator();
    this.sub.type = 'square';
    this.whine = ctx.createOscillator();
    this.whine.type = 'sine';
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    const subG = ctx.createGain();
    subG.gain.value = 0.35;
    const whineG = ctx.createGain();
    whineG.gain.value = player ? 0.05 : 0.08;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.Q.value = 5;
    this.filter.frequency.value = 400;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    this.pan = ctx.createStereoPanner();
    this.o1.connect(mix);
    this.o2.connect(mix);
    this.sub.connect(subG).connect(mix);
    mix.connect(this.filter).connect(this.gain);
    this.whine.connect(whineG).connect(this.gain);
    this.gain.connect(this.pan).connect(out);
    const t = ctx.currentTime;
    this.o1.frequency.value = 40;
    this.o2.frequency.value = 40;
    this.sub.frequency.value = 20;
    this.whine.frequency.value = 320;
    for (const o of [this.o1, this.o2, this.sub, this.whine]) o.start(t);
  }

  update(speedN: number, boost: boolean, vol: number, pan: number, doppler: number) {
    if (this.stopped) return;
    const t = this.ctx.currentTime;
    const base = (this.deep ? 24 : this.player ? 38 : 44) + speedN * (this.deep ? 40 : 64) + (boost ? 16 : 0);
    const f = base * doppler;
    this.o1.frequency.setTargetAtTime(f, t, 0.06);
    this.o2.frequency.setTargetAtTime(f * 1.004, t, 0.06);
    this.sub.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.whine.frequency.setTargetAtTime(f * 7.9, t, 0.06);
    this.filter.frequency.setTargetAtTime(260 + speedN * 1300 + (boost ? 1100 : 0), t, 0.08);
    this.gain.gain.setTargetAtTime(vol, t, 0.05);
    this.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.05);
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    const t = this.ctx.currentTime;
    this.gain.gain.cancelScheduledValues(t);
    this.gain.gain.setTargetAtTime(0, t, 0.05);
    for (const o of [this.o1, this.o2, this.sub, this.whine]) {
      try {
        o.stop(t + 0.4);
      } catch {
        /* уже остановлен */
      }
    }
    setTimeout(() => this.pan.disconnect(), 600);
  }
}

export class Music {
  private a: AudioEngine;
  private timer: number | null = null;
  private nextTime = 0;
  step = 0;
  intensity = 0;
  bpm = 118;
  startAt = 0;
  lastBeatTime = 0;
  lastKickTime = 0;
  private duck: GainNode;
  private delay: DelayNode;
  private delayIn: GainNode;

  constructor(a: AudioEngine) {
    this.a = a;
    const c = a.ctx!;
    this.duck = c.createGain();
    this.duck.connect(a.musicBus);
    this.delay = c.createDelay(1);
    this.delay.delayTime.value = (60 / this.bpm) * 0.75;
    const fb = c.createGain();
    fb.gain.value = 0.38;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    this.delayIn = c.createGain();
    this.delayIn.gain.value = 0.32;
    this.delayIn.connect(this.delay);
    this.delay.connect(lp).connect(fb).connect(this.delay);
    lp.connect(a.musicBus);
  }

  start() {
    if (this.timer !== null) return;
    const c = this.a.ctx!;
    this.nextTime = c.currentTime + 0.1;
    this.startAt = this.nextTime;
    this.lastBeatTime = c.currentTime;
    this.lastKickTime = c.currentTime;
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  private schedule() {
    const c = this.a.ctx!;
    const stepDur = 60 / this.bpm / 4;
    while (this.nextTime < c.currentTime + 0.14) {
      this.play(this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  // i — VI — iv — V  (ре минор)
  private chords = [
    [38, 41, 45],
    [34, 38, 41],
    [31, 34, 38],
    [33, 37, 40],
  ];

  private play(s: number, t: number, sd: number) {
    const bar = Math.floor(s / 16) % 4;
    const st = s % 16;
    const ch = this.chords[bar];
    const intensity = this.intensity;

    // Синкопа бас-бочки, характерная для саундтрека «Трона».
    if (intensity >= 1) {
      if (st === 0 || st === 6 || st === 8 || st === 14) this.kick(t);
      if (st === 4 || st === 12) this.snare(t);
      if (st % 2 === 0) this.hat(t, st % 4 === 0 ? 0.06 : 0.03, 0.05);
      // пульсирующий бас восьмыми
      this.bass(ch[0] - 12, t, sd * 0.9, st % 4 === 0 ? 1 : 0.62);
      if (st % 4 === 2) this.bass(ch[0] + 12 - 12, t, sd * 0.7, 0.5);
    } else if (st % 8 === 0) {
      this.bass(ch[0] - 12, t, sd * 6, 0.55);
    }

    // Пад раз в такт.
    if (st === 0) this.pad(ch, t, sd * 16);

    // Арпеджио аккорда.
    const pattern = [0, 1, 2, 1, 2, 0, 1, 2];
    if (st % 2 === 0) {
      const idx = pattern[(st / 2) % 8];
      const note = ch[idx] + 24;
      this.arp(note, t, sd * 1.6, intensity >= 1 ? 0.055 : 0.032, intensity >= 2 ? 3800 : 2200);
    }

    // Главная тема на второй половине фразы — редкая, «киношная».
    if (intensity >= 2 && bar % 2 === 1 && st === 0) {
      this.lead(ch[0] + 24, t, sd * 8);
    }

    this.lastBeatTime = t + Math.floor(st / 4) * sd * 4;
    if (st % 4 === 0) this.lastKickTime = t;
  }

  private snare(t: number) {
    const c = this.a.ctx!;
    const n = c.createBufferSource();
    n.buffer = this.a.noise;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 2200;
    f.Q.value = 1.2;
    const g = c.createGain();
    this.env(g, t, 0.002, 0.24, 0.2);
    n.connect(f).connect(g).connect(this.a.musicBus);
    n.start(t, Math.random());
    n.stop(t + 0.26);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(190, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
    const og = c.createGain();
    this.env(og, t, 0.002, 0.18, 0.1);
    o.connect(og).connect(this.a.musicBus);
    o.start(t);
    o.stop(t + 0.14);
  }

  private env(g: GainNode, t: number, a: number, peak: number, d: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private kick(t: number) {
    const c = this.a.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.003, 0.9, 0.32);
    o.connect(g).connect(this.a.musicBus);
    o.start(t);
    o.stop(t + 0.4);
    this.duck.gain.cancelScheduledValues(t);
    this.duck.gain.setValueAtTime(0.35, t);
    this.duck.gain.linearRampToValueAtTime(1, t + 0.22);
  }



  private hat(t: number, vol: number, dec: number) {
    const c = this.a.ctx!;
    const n = c.createBufferSource();
    n.buffer = this.a.noise;
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = c.createGain();
    this.env(g, t, 0.001, vol, dec);
    n.connect(f).connect(g).connect(this.a.musicBus);
    n.start(t, Math.random());
    n.stop(t + dec + 0.05);
  }

  private bass(note: number, t: number, dur: number, vel: number) {
    const c = this.a.ctx!;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midi(note);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 7;
    f.frequency.setValueAtTime(1800 * vel + 300, t);
    f.frequency.exponentialRampToValueAtTime(160, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.004, 0.22 * vel, dur);
    o.connect(f).connect(g).connect(this.duck);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private arp(note: number, t: number, dur: number, vol: number, cutoff: number) {
    const c = this.a.ctx!;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = midi(note);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = c.createGain();
    this.env(g, t, 0.003, vol, dur);
    o.connect(f).connect(g);
    g.connect(this.duck);
    g.connect(this.delayIn);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private pad(ch: number[], t: number, dur: number) {
    const c = this.a.ctx!;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700 + this.intensity * 300;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.6);
    g.gain.setValueAtTime(0.05, t + dur - 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
    f.connect(g).connect(this.duck);
    for (const n of ch) {
      for (const det of [-9, 9]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midi(n + 12);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 0.6);
      }
    }
  }

  private lead(note: number, t: number, dur: number) {
    const c = this.a.ctx!;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(3000, t + 0.3);
    f.frequency.exponentialRampToValueAtTime(800, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    f.connect(g);
    g.connect(this.duck);
    g.connect(this.delayIn);
    for (const [k, det] of [
      [0, -6],
      [12, 6],
      [7, 0],
    ]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midi(note + k);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }
}

export class AudioEngine {
  ctx: Ctx | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  enginesBus!: GainNode;
  noise!: AudioBuffer;
  music: Music | null = null;
  private vol = { master: 0.8, music: 0.55, sfx: 0.85 };
  private enginesMuted = false;

  get ready() {
    return !!this.ctx;
  }

  init() {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const c = new AC();
    this.ctx = c;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    this.master = c.createGain();
    this.master.connect(comp).connect(c.destination);
    this.musicBus = c.createGain();
    this.sfxBus = c.createGain();
    this.enginesBus = c.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.enginesBus.connect(this.sfxBus);
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.applyVolumes();
    this.music = new Music(this);
    this.music.start();
  }

  getBeatData() {
    if (!this.ctx || !this.music) return { beatPulse: 0, kickPulse: 0, barPhase: 0, bpm: 118 };
    const elapsed = this.ctx.currentTime - this.music.startAt;
    if (elapsed < 0) return { beatPulse: 0, kickPulse: 0, barPhase: 0, bpm: this.music.bpm };
    const beatDur = 60 / this.music.bpm;
    const bAge = elapsed % beatDur;
    const kAge = elapsed % (beatDur * (this.music.intensity > 0 ? 1 : 4));
    const beatPulse = Math.exp(-bAge * 8.5);
    const kickPulse = Math.exp(-kAge * 6.5);
    const barPhase = (elapsed % (beatDur * 4)) / (beatDur * 4);
    return { beatPulse, kickPulse, barPhase, bpm: this.music.bpm };
  }

  setVolumes(master: number, music: number, sfx: number) {
    this.vol = { master, music, sfx };
    this.applyVolumes();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.9, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
    this.enginesBus.gain.setTargetAtTime(this.enginesMuted ? 0 : 1, t, 0.08);
  }

  muteEngines(m: boolean) {
    this.enginesMuted = m;
    this.applyVolumes();
  }

  setIntensity(i: number) {
    if (this.music) this.music.intensity = i;
  }

  createVoice(player: boolean, deep = false): EngineVoice | null {
    if (!this.ctx) return null;
    return new EngineVoice(this.ctx, this.enginesBus, player, deep);
  }

  private out(vol: number, pan: number): GainNode | null {
    if (!this.ctx) return null;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    const p = this.ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    g.connect(p).connect(this.sfxBus);
    return g;
  }

  private noiseSrc(): AudioBufferSourceNode {
    const n = this.ctx!.createBufferSource();
    n.buffer = this.noise;
    return n;
  }

  turn(vol = 0.5, pan = 0) {
    const out = this.out(vol, pan);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const n = this.noiseSrc();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(5200, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random());
    n.stop(t + 0.16);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.06);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.1);
  }

  derezz(vol = 1, pan = 0) {
    const out = this.out(vol, pan);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const n = this.noiseSrc();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(7000, t);
    bp.frequency.exponentialRampToValueAtTime(260, t + 0.9);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    n.connect(bp).connect(g).connect(out);
    n.start(t);
    n.stop(t + 1.2);
    const b = c.createOscillator();
    b.frequency.setValueAtTime(130, t);
    b.frequency.exponentialRampToValueAtTime(30, t + 0.7);
    const bg = c.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.9, t + 0.01);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    b.connect(bg).connect(out);
    b.start(t);
    b.stop(t + 0.85);
    const d = c.createOscillator();
    d.type = 'square';
    d.frequency.setValueAtTime(1500, t);
    d.frequency.exponentialRampToValueAtTime(70, t + 0.5);
    const dl = c.createBiquadFilter();
    dl.type = 'lowpass';
    dl.frequency.value = 2400;
    const dg = c.createGain();
    dg.gain.setValueAtTime(0.0001, t);
    dg.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
    dg.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    d.connect(dl).connect(dg).connect(out);
    d.start(t);
    d.stop(t + 0.6);
  }

  jump(vol = 0.6, pan = 0) {
    const out = this.out(vol, pan);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(720, t + 0.32);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.5);
    this.whoosh(0.5, pan, true);
  }

  land(vol = 0.65, pan = 0) {
    const out = this.out(vol, pan);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const b = c.createOscillator();
    b.type = 'triangle';
    b.frequency.setValueAtTime(160, t);
    b.frequency.exponentialRampToValueAtTime(38, t + 0.28);
    const bg = c.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.65, t + 0.008);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    b.connect(bg).connect(out);
    b.start(t);
    b.stop(t + 0.4);
    const n = this.noiseSrc();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 800;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    n.connect(f).connect(ng).connect(out);
    n.start(t);
    n.stop(t + 0.3);
  }

  shieldHit(vol = 0.75, pan = 0) {
    const out = this.out(vol, pan);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    for (const [f0, f1] of [
      [900, 260],
      [1400, 480],
    ]) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f1, t + 0.35);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.5);
    }
  }

  emp(vol = 0.85) {
    const out = this.out(vol, 0);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(450, t);
    o.frequency.exponentialRampToValueAtTime(32, t + 0.65);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(120, t + 0.7);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.8, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.85);
  }

  /** Выстрел неоновой пули: короткий лазерный импульс. */
  laser(vol = 0.5, pan = 0) {
    const out = this.out(vol, pan);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(1600, t);
    o.frequency.exponentialRampToValueAtTime(320, t + 0.14);
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2.5;
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.14);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.32, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.2);
    const n = this.noiseSrc();
    const hp = c.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3200;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.12, t + 0.004);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    n.connect(hp).connect(ng).connect(out);
    n.start(t);
    n.stop(t + 0.1);
  }

  /** Пиксельный взрыв пули: цифровой треск. */
  pixel(vol = 0.4, pan = 0) {
    const out = this.out(vol, pan);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    for (let i = 0; i < 7; i++) {
      const st = t + i * 0.012 + Math.random() * 0.02;
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.value = 900 + Math.random() * 2400;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.09, st + 0.003);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.05 + Math.random() * 0.05);
      o.connect(g).connect(out);
      o.start(st);
      o.stop(st + 0.12);
    }
  }

  /** Трещина по световому следу: сухой щелчок с металлическим звоном. */
  crack(vol = 0.4, pan = 0) {
    const out = this.out(vol, pan);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const n = this.noiseSrc();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 5;
    f.frequency.setValueAtTime(4200, t);
    f.frequency.exponentialRampToValueAtTime(900, t + 0.18);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    n.connect(f).connect(g).connect(out);
    n.start(t);
    n.stop(t + 0.24);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(2800, t);
    o.frequency.exponentialRampToValueAtTime(600, t + 0.1);
    const og = c.createGain();
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.12, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(og).connect(out);
    o.start(t);
    o.stop(t + 0.16);
  }

  /** Пробой следа: каскад пиксельного взрыва. */
  wallBreak(vol = 0.7, pan = 0) {
    const out = this.out(vol, pan);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const b = c.createOscillator();
    b.type = 'sine';
    b.frequency.setValueAtTime(260, t);
    b.frequency.exponentialRampToValueAtTime(42, t + 0.45);
    const bg = c.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.85, t + 0.01);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    b.connect(bg).connect(out);
    b.start(t);
    b.stop(t + 0.6);
    this.pixel(vol * 0.9, pan);
  }

  /** Рёв тяжёлого внедорожника: низкий рык + металлический скрежет. */
  bossRoar(vol = 0.9) {
    const out = this.out(vol, 0);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(55, t);
    o.frequency.linearRampToValueAtTime(110, t + 0.5);
    o.frequency.linearRampToValueAtTime(48, t + 1.1);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(220, t + 1.1);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.85, t + 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.4);
    const n = this.noiseSrc();
    const nf = c.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 500;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.4, t + 0.08);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    n.connect(nf).connect(ng).connect(out);
    n.start(t);
    n.stop(t + 1.1);
  }

  /** Удар по ядру босса: звон брони + разряд. */
  bossHit(vol = 0.85) {
    const out = this.out(vol, 0);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    for (const [f0, dt] of [
      [1900, 0.5],
      [2600, 0.35],
      [950, 0.65],
    ] as [number, number][]) {
      const o = c.createOscillator();
      o.type = 'square';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.3, t + dt);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.22, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + dt + 0.05);
    }
    const b = c.createOscillator();
    b.type = 'sine';
    b.frequency.setValueAtTime(220, t);
    b.frequency.exponentialRampToValueAtTime(40, t + 0.4);
    const bg = c.createGain();
    bg.gain.setValueAtTime(0.0001, t);
    bg.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
    bg.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    b.connect(bg).connect(out);
    b.start(t);
    b.stop(t + 0.5);
  }

  /** Предупреждение о таране: нарастающая сирена. */
  chargeWarn(vol = 0.6) {
    const out = this.out(vol, 0);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    for (let i = 0; i < 3; i++) {
      o.frequency.setValueAtTime(220, t + i * 0.3);
      o.frequency.linearRampToValueAtTime(440, t + i * 0.3 + 0.15);
      o.frequency.linearRampToValueAtTime(220, t + i * 0.3 + 0.3);
    }
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.05);
    g.gain.setValueAtTime(0.5, t + 0.85);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.05);
  }

  /** Гибель босса: каскадный взрыв ядер. */
  bossDown(vol = 1.0) {
    const out = this.out(vol, 0);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    for (let i = 0; i < 5; i++) {
      const st = t + i * 0.16;
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(700 - i * 110, st);
      o.frequency.exponentialRampToValueAtTime(60, st + 0.4);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.5, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.5);
      o.connect(g).connect(out);
      o.start(st);
      o.stop(st + 0.55);
    }
    this.derezz(1.0, 0);
  }

  /** Треск брони: внедорожник проламывает чужую стену. */
  smash(vol = 0.7, pan = 0) {
    const out = this.out(vol, pan);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const n = this.noiseSrc();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(2500, t);
    f.frequency.exponentialRampToValueAtTime(200, t + 0.3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    n.connect(f).connect(g).connect(out);
    n.start(t);
    n.stop(t + 0.4);
  }

  phase(vol = 0.5) {
    const out = this.out(vol, 0);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(600, t);
    o.frequency.linearRampToValueAtTime(1200, t + 0.15);
    o.frequency.linearRampToValueAtTime(700, t + 0.3);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.4);
  }

  powerup(type: string, vol = 0.55) {
    const out = this.out(vol, 0);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const notes = type === 'shield' ? [62, 67, 74] : type === 'emp' ? [50, 62, 74] : [69, 74, 81];
    notes.forEach((n, i) => {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = midi(n);
      const g = c.createGain();
      const st = t + i * 0.05;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.2, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.3);
      o.connect(g).connect(out);
      o.start(st);
      o.stop(st + 0.35);
    });
  }

  countdown(go: boolean) {
    const out = this.out(0.5, 0);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    for (const [mul, type] of [
      [1, 'sine'],
      [2, 'triangle'],
    ] as [number, OscillatorType][]) {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = (go ? 1320 : 660) * mul;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(mul === 1 ? 0.4 : 0.08, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (go ? 0.9 : 0.35));
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 1);
    }
    if (go) this.whoosh(0.5, 0, true);
  }

  whoosh(vol = 0.4, pan = 0, up = true) {
    const out = this.out(vol, pan);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const n = this.noiseSrc();
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 2;
    f.frequency.setValueAtTime(up ? 400 : 4000, t);
    f.frequency.exponentialRampToValueAtTime(up ? 4500 : 300, t + 0.45);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random());
    n.stop(t + 0.6);
  }

  pickup() {
    this.powerup('turbo');
  }

  bonus() {
    const out = this.out(0.3, 0);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, t);
    o.frequency.exponentialRampToValueAtTime(1760, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.3);
  }

  rez(vol = 0.3, pan = 0) {
    const out = this.out(vol, pan);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(120, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.5);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(5000, t + 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(f).connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.65);
  }

  ui(kind: 'move' | 'select' | 'back' = 'move') {
    const out = this.out(0.22, 0);
    if (!out) return;
    const c = this.ctx!;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = kind === 'select' ? 'triangle' : 'sine';
    const f0 = kind === 'move' ? 1200 : kind === 'select' ? 700 : 500;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(kind === 'back' ? f0 * 0.6 : f0 * 1.6, t + 0.08);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(kind === 'select' ? 0.3 : 0.15, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + 0.15);
  }

  dispose() {
    this.music?.stop();
    if (this.ctx) void this.ctx.close();
    this.ctx = null;
  }
}
