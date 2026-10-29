import * as THREE from 'three';
import { Environment, FOG_COLOR } from './Environment';
import { Effects } from './Effects';
import { AudioEngine } from './Audio';
import { CameraRig } from './CameraRig';
import { Input } from './Input';
import { Game } from './Game';
import { PostFX } from './PostFX';
import type { CamMode, GameCallbacks, QuickSettings, ResultAction, Settings } from './types';

export interface EngineCallbacks extends GameCallbacks {
  onCameraChange?(m: CamMode): void;
}

export class Engine {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  env: Environment;
  fx: Effects;
  audio: AudioEngine;
  rig: CameraRig;
  input: Input;
  game: Game;
  post!: PostFX;
  private container: HTMLElement;
  private raf = 0;
  private last = 0;
  private disposed = false;
  private samples = -1;
  private settings: Settings;
  private dynScale = 1;
  private fpsAvg = 60;
  private dynTimer = 4;
  private lowTime = 0;
  private highTime = 0;
  private lastQuality: Settings['quality'] | null = null;

  constructor(container: HTMLElement, cb: EngineCallbacks, settings: Settings) {
    this.container = container;
    this.settings = settings;
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.setPixelRatio(this.pixelRatioFor(settings.quality));
    renderer.setSize(this.w, this.h);
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(FOG_COLOR.getHex(), 0.0021);
    this.scene.background = FOG_COLOR.clone();
    this.camera = new THREE.PerspectiveCamera(70, this.w / this.h, 0.1, 5000);
    this.camera.position.set(0, 40, 90);

    this.env = new Environment(this.scene, renderer);
    this.fx = new Effects(this.scene);
    this.audio = new AudioEngine();
    this.rig = new CameraRig(this.camera);
    this.input = new Input();
    this.game = new Game(this.scene, this.env, this.fx, this.audio, this.rig, this.input, cb);

    this.input.onCamera = () => {
      if (this.game.mode === 'attract' || this.game.paused) return;
      const m = this.game.cycleCamera();
      cb.onCameraChange?.(m);
    };
    this.input.onShoot = () => this.game.playerShoot();
    this.input.onPause = () => cb.onPauseRequest();
    this.input.attach();

    this.applySettings(settings, true);
    window.addEventListener('resize', this.onResize);
    this.game.startAttract();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  private get w() {
    return Math.max(1, this.container.clientWidth || window.innerWidth);
  }

  private get h() {
    return Math.max(1, this.container.clientHeight || window.innerHeight);
  }

  private degrade = 0; // 0 — полное качество, 1 — без отражений, 2 — минимум эффектов
  private degradeCd = 0;

  private pixelRatioFor(q: Settings['quality']) {
    const dpr = window.devicePixelRatio || 1;
    if (q === 'low') return 0.7;
    if (q === 'medium') return Math.min(dpr, 1);
    if (q === 'high') return Math.min(dpr, 1.5);
    return Math.min(dpr, 1.75);
  }

  applySettings(s: Settings, force = false) {
    this.settings = s;
    const q = s.quality;
    if (this.lastQuality !== q) {
      this.dynScale = 1;
      this.lastQuality = q;
    }
    const pr = this.pixelRatioFor(q) * this.dynScale;
    const samples = q === 'high' || q === 'ultra' ? 4 : 0;
    if (force || pr !== this.renderer.getPixelRatio() || samples !== this.samples) {
      this.renderer.setPixelRatio(pr);
      this.renderer.setSize(this.w, this.h);
      if (samples !== this.samples || !this.post) {
        if (this.post) this.post.dispose();
        this.post = new PostFX(this.renderer, this.scene, this.camera, samples);
        this.samples = samples;
      } else {
        this.post.setSize(this.w, this.h);
      }
    }
    this.post.setCinematic(s.postfx);
    const reflScale = q === 'low' ? 0.35 : q === 'medium' ? 0.45 : q === 'high' ? 0.55 : 0.6;
    const reflectionsOn = s.reflections && this.degrade < 1;
    this.env.setReflections(reflectionsOn, reflScale, this.w * pr, this.h * pr);
    this.post.setBloom(s.bloom && this.degrade < 2, q === 'low' ? 0.42 : 0.5);
    this.fx.quality = q === 'low' ? 0.5 : q === 'medium' ? 0.75 : 1;
    this.env.setEffectQuality(this.fx.quality * (this.degrade >= 2 ? 0.5 : 1));
    this.rig.fovBase = s.fov;
    this.rig.shakeEnabled = s.shake;
    this.rig.camSmooth = s.camSmooth;
    this.audio.setVolumes(s.master, s.music, s.sfx);
    this.game.playerColor = s.playerColor;
    this.game.setCameraMode(s.camera);
    this.updatePointScale();
  }

  private updatePointScale() {
    const hPx = this.h * this.renderer.getPixelRatio();
    const s = hPx / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    this.fx.setPointScale(s);
    this.env.setPointScale(s);
  }

  private onResize = () => {
    const w = this.w;
    const h = this.h;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.post.setSize(w, h);
    const pr = this.renderer.getPixelRatio();
    this.env.resize(w * pr, h * pr);
    this.updatePointScale();
  };

  private loop = (t: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (dt > 0.1) dt = 0.1;
    if (dt < 0) dt = 0;
    this.adaptResolution(dt);
    this.game.update(dt);
    this.fx.setCamera(this.camera.position);
    const pp = this.game.postParams();
    const u = this.post.cine.uniforms;
    u.uSpeed.value = pp.speed;
    u.uSamples.value = pp.speed > 0.02 ? 10 : 1;
    u.uFlash.value = pp.flash;
    u.uDamage.value = pp.damage;
    u.uDesat.value = pp.desat;
    u.uBeat.value = pp.beat;
    this.updatePointScale();
    this.post.render(this.game.paused ? 0 : dt);
  };

  /** Динамическое разрешение: держим плавность на слабых GPU. */
  private adaptResolution(dt: number) {
    if (dt <= 0) return;
    const fps = 1 / Math.max(dt, 0.001);
    this.fpsAvg += (fps - this.fpsAvg) * Math.min(1, dt * 2);
    this.dynTimer -= dt;
    if (this.fpsAvg < 38) {
      this.lowTime += dt;
      this.highTime = 0;
    } else if (this.fpsAvg > 57) {
      this.highTime += dt;
      this.lowTime = 0;
    } else {
      this.lowTime = 0;
      this.highTime = 0;
    }
    if (this.dynTimer > 0) return;
    if (this.lowTime > 2 && this.dynScale > 0.55) this.setDynScale(this.dynScale - 0.15);
    else if (this.highTime > 6 && this.dynScale < 1) this.setDynScale(this.dynScale + 0.1);
    // Автодеградация эффектов: если разрешение уже на минимуме, а FPS всё равно низкий —
    // ступенчато отключаем отражения и bloom, чтобы игра оставалась плавной.
    this.degradeCd -= dt;
    if (this.dynScale <= 0.56 && this.fpsAvg < 36 && this.degrade < 2 && this.degradeCd <= 0) {
      this.degrade++;
      this.degradeCd = 5;
      this.applySettings(this.settings);
    } else if (this.fpsAvg > 58 && this.degrade > 0 && this.degradeCd <= 0) {
      this.degrade--;
      this.degradeCd = 8;
      this.applySettings(this.settings);
    }
  }

  private setDynScale(s: number) {
    this.dynScale = Math.max(0.55, Math.min(1, s));
    this.dynTimer = 3;
    this.lowTime = 0;
    this.highTime = 0;
    const pr = this.pixelRatioFor(this.settings.quality) * this.dynScale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.w, this.h);
    this.post.setSize(this.w, this.h);
    this.env.resize(this.w * pr, this.h * pr);
    this.updatePointScale();
  }

  // ── API для интерфейса ──
  initAudio() {
    this.audio.init();
    this.audio.setVolumes(this.settings.master, this.settings.music, this.settings.sfx);
  }

  startCampaign() {
    this.game.startCampaign();
  }

  startMultiTier() {
    this.game.startMultiTier();
  }

  startSurvival() {
    this.game.startSurvival();
  }

  startDiscHunt() {
    this.game.startDiscHunt();
  }

  startPractice() {
    this.game.startPractice();
  }

  startBoss() {
    this.game.startBoss();
  }

  startQuick(q: QuickSettings) {
    this.game.startQuick(q);
  }

  startRace(q: QuickSettings) {
    this.game.startRace(q);
  }

  playerJump() {
    this.game.playerJump();
  }

  playerShoot() {
    this.game.playerShoot();
  }

  beginCountdown() {
    this.game.beginCountdown();
  }

  resultAction(a: ResultAction) {
    this.game.resultAction(a);
  }

  toMenu() {
    this.game.setPaused(false);
    this.game.startAttract();
  }

  setPaused(p: boolean) {
    this.game.setPaused(p);
  }

  setMinimapCanvas(c: HTMLCanvasElement | null) {
    this.game.minimap.setCanvas(c);
  }

  setTouchSteer(d: number, pressed: boolean) {
    this.input.setTouchSteer(d, pressed);
  }

  setTouchBoost(v: boolean) {
    this.input.setTouchBoost(v);
  }

  setTouchBrake(v: boolean) {
    this.input.setTouchBrake(v);
  }

  uiSound(kind: 'move' | 'select' | 'back') {
    this.audio.ui(kind);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.input.detach();
    this.game.dispose();
    this.audio.dispose();
    this.post.dispose();
    this.env.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
