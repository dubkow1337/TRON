import * as THREE from 'three';
import {
  AI_PROFILES,
  ARENA_SIZES,
  BASE_SPEED,
  BOOST_DRAIN,
  BOOST_REGEN,
  BOOST_SPEED,
  BRAKE_SPEED,
  CAMPAIGN,
  DIFFICULTY_LABEL,
  DX,
  DY,
  ENEMY_COLOR_ORDER,
  ENEMY_NAMES,
  GRIND_REGEN,
  GRIND_SPEED_BONUS,
  JUMP_VELOCITY,
  KMH,
  LEVEL_HEIGHT,
  NEON,
  PICKUPS,
  TICK,
  AMMO_ON_ARENA,
  AMMO_PER_PICKUP,
  AMMO_CAP,
  TRAIL_HITS_TO_BREAK,
  TRAIL_BREACH_RADIUS,
  RAMP_ASSIST_ANGLE,
  RAMP_ASSIST_RATE,
  RUNNER_ARMOR_MAX,
  RUNNER_ARMOR_REGEN,
  RUNNER_CHARGE_CD,
  RUNNER_CHARGE_T,
  RUNNER_HP,
  RUNNER_INVULN_T,
  RUNNER_SHOCK_CD,
  RUNNER_STUN_T,
  RUNNER_TELEGRAPH_T,
  rampHeight,
  type ColorKey,
  type Difficulty,
  type EnemyDef,
  type PickupType,
  type TierLayout,
} from './config';
import { Grid } from './Grid';
import { ARENA_THEMES, buildLayout, themeById, type ArenaTheme } from './arenas';
import { Bike } from './Bike';
import { Runner } from './Runner';
import { RaceCourse, type RaceProjection } from './RaceCourse';
import { Bullets, type BulletWorld } from './Bullets';
import { AIController, type AIWorld } from './AI';
import type { Effects } from './Effects';
import type { BikeLight, Environment } from './Environment';
import type { AudioEngine, EngineVoice } from './Audio';
import type { CameraRig } from './CameraRig';
import type { Input } from './Input';
import { Minimap } from './Minimap';
import type {
  CamMode,
  GameCallbacks,
  GameModeKey,
  HudBike,
  HudState,
  PhaseEvent,
  QuickSettings,
  ResultAction,
} from './types';

type Phase = 'idle' | 'intro' | 'countdown' | 'playing' | 'ending' | 'result';
type DeathCause = 'wall' | 'trail' | 'self' | 'headon' | 'crush' | 'shot';

interface Pickup {
  x: number;
  y: number;
  level: number;
  type: PickupType;
  active: boolean;
  respawn: number;
  group: THREE.Group;
  core: THREE.Object3D;
  shell: THREE.Object3D;
  spinners: THREE.Object3D[];
  ring: THREE.Mesh;
  baseY: number;
}

interface RaceRiderState {
  lastS: number;
  distance: number;
  lane: number;
  penalty: number;
  crashCd: number;
  finished: boolean;
  finishOrder: number;
  clean: number;
  speedBias: number;
  laneTimer: number;
}

const BEST_KEY = 'neongrid.best';

export function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export class Game {
  grid = new Grid();
  bikes: Bike[] = [];
  player: Bike | null = null;
  mode: GameModeKey = 'attract';
  phase: Phase = 'idle';
  size = 180;
  hasTiers = false;
  time = 0;
  roundTime = 0;
  timeScale = 1;
  level = 0;
  lives = 3;
  score = 0;
  wins = 0;
  losses = 0;
  discsCollected = 0;
  survivalWave = 1;
  survivalTimer = 0;

  quick: QuickSettings = {
    enemies: 3,
    difficulty: 'normal',
    arena: 'medium',
    rounds: 3,
    cells: true,
    hasTiers: true,
    map: 'grid',
    boss: false,
  };

  playerColor: ColorKey = 'cyan';
  cameraMode: CamMode = 'smooth';
  paused = false;
  minimap = new Minimap();

  private acc = 0;
  private slowTimer = 0;
  private slowTarget = 1;
  private countdownT = 0;
  private lastCount = -1;
  private endTimer = 0;
  private endWin = false;
  private roundStartScore = 0;
  private roundKills = 0;
  private nearMisses = 0;
  private jumpsCount = 0;
  private maxSpeed = 0;
  private pickups: Pickup[] = [];
  private cellTime: Float32Array[] = [new Float32Array(0), new Float32Array(0)];
  private msgId = 1;
  private hudTimer = 0;
  private mapTimer = 0;
  private attractTimer = 0;
  private attractCamTimer = 0;
  private attractCamIdx = 0;
  private attractTarget: Bike | null = null;
  private nearCd = 0;
  private graceT = 0;
  private lastKillT = -10;
  private scoreFrac = 0;
  private voices = new Map<number, EngineVoice>();
  private boostEffects = new Set<number>();
  private prevDist = new Map<number, number>();
  private aiWorld: AIWorld;
  private flashT = 0;
  private damageT = 0;
  private desat = 0;
  private tmpV = new THREE.Vector3();
  private tmpC = new THREE.Color();
  private lights: BikeLight[] = [];

  private scene: THREE.Scene;
  private env: Environment;
  private fx: Effects;
  private audio: AudioEngine;
  private rig: CameraRig;
  private input: Input;
  private cb: GameCallbacks;

  private tierLayout: TierLayout | null = null;
  theme: ArenaTheme = themeById('grid');
  private raceCourse: RaceCourse | null = null;
  private raceRiders = new Map<number, RaceRiderState>();
  private raceFinishOrder = 0;
  private racePlace = 0;
  private raceWalls: { index: number; level: number; at: number }[] = [];
  private bullets: Bullets;
  private ammoPickups: Pickup[] = [];
  private wallHitMap = new Map<number, { owner: number; hits: number }>();

  constructor(
    scene: THREE.Scene,
    env: Environment,
    fx: Effects,
    audio: AudioEngine,
    rig: CameraRig,
    input: Input,
    cb: GameCallbacks,
  ) {
    this.scene = scene;
    this.env = env;
    this.fx = fx;
    this.audio = audio;
    this.rig = rig;
    this.input = input;
    this.cb = cb;
    this.bullets = new Bullets(scene);
    this.aiWorld = { grid: this.grid, bikes: [], pickups: this.pickups };
  }

  // ───────────────────────── режимы ─────────────────────────

  startAttract() {
    this.mode = 'attract';
    this.paused = false;
    this.setupRound();
    this.phase = 'playing';
    for (const b of this.bikes) {
      b.moving = true;
      b.speed = BASE_SPEED * 0.78;
    }
    this.attractTimer = 0;
    this.attractCamTimer = 0;
    this.audio.setIntensity(0);
    this.cb.onPhase({ type: 'none' });
    this.pickAttractShot();
  }

  startCampaign() {
    this.mode = 'campaign';
    this.level = 0;
    this.lives = 3;
    this.score = 0;
    this.prepareIntro();
  }

  startMultiTier() {
    this.mode = 'multitier';
    this.score = 0;
    this.wins = 0;
    this.losses = 0;
    this.lives = 3;
    this.prepareIntro();
  }

  startSurvival() {
    this.mode = 'survival';
    this.survivalWave = 1;
    this.survivalTimer = 18;
    this.score = 0;
    this.lives = 1;
    this.prepareIntro();
  }

  startPractice() {
    this.mode = 'practice';
    this.score = 0;
    this.lives = 99;
    this.prepareIntro();
  }

  startDiscHunt() {
    this.mode = 'dischunt';
    this.discsCollected = 0;
    this.score = 0;
    this.prepareIntro();
  }

  startBoss() {
    this.mode = 'boss';
    this.score = 0;
    this.lives = 3;
    this.prepareIntro();
  }

  private getRunner(): Runner | null {
    for (const bike of this.bikes) if (bike instanceof Runner && bike.alive) return bike;
    return null;
  }

  startQuick(q: QuickSettings) {
    this.mode = 'quick';
    this.quick = { ...q };
    this.wins = 0;
    this.losses = 0;
    this.score = 0;
    this.prepareIntro();
  }

  startRace(q: QuickSettings) {
    this.mode = 'race';
    this.quick = { ...q, boss: false };
    this.wins = 0;
    this.losses = 0;
    this.score = 0;
    this.racePlace = 0;
    this.prepareIntro();
  }

  private prepareIntro() {
    this.paused = false;
    this.setupRound();
    this.phase = 'intro';
    this.audio.setIntensity(0);
    this.env.setFireworkIntensity(1.6);
    const p = this.player!;
    this.rig.orbit(p.centerX, p.centerZ, 9.5, 3.0, 0.22, 1.6, p, 0.9);

    const mkEnemies = () =>
      this.bikes
        .filter((b) => !b.isPlayer)
        .map((b) => ({ name: b.name, color: b.css, diff: this.diffOf(b), boss: b.boss, runner: b.kind === 'runner' }));

    let ev: PhaseEvent;
    if (this.mode === 'campaign') {
      const L = CAMPAIGN[this.level];
      ev = {
        type: 'intro',
        mode: 'campaign',
        code: `СЕКТОР ${L.code}`,
        title: L.name,
        brief: L.brief,
        enemies: mkEnemies(),
        arena: L.arena,
        lives: this.lives,
        roundLabel: `Сектор ${this.level + 1} из ${CAMPAIGN.length}`,
        hasTiers: this.hasTiers,
        arenaName: this.theme.name,
        arenaTag: this.theme.tagline,
      };
    } else if (this.mode === 'multitier') {
      ev = {
        type: 'intro',
        mode: 'multitier',
        code: 'ВЕРТИКАЛЬНАЯ АРЕНА',
        title: 'БИТВА НА ДВУХ ЯРУСАХ',
        brief:
          'Заезжай на пандусы, чтобы подняться на эстакаду, и используй трамплины для прыжка через вражеские стены. С Racing-камерой повороты плавные.',
        enemies: mkEnemies(),
        arena: this.size,
        lives: 3,
        roundLabel: 'Двухъярусная арена',
        hasTiers: true,
        arenaName: this.theme.name,
        arenaTag: this.theme.tagline,
      };
    } else if (this.mode === 'survival') {
      ev = {
        type: 'intro',
        mode: 'survival',
        code: `ВОЛНА 1`,
        title: 'ВЫЖИВАНИЕ В СЕТКЕ',
        brief: 'Бесконечные волны программ. Собирай щиты и ЭМИ-импульсы, держись как можно дольше.',
        enemies: mkEnemies(),
        arena: this.size,
        lives: 1,
        roundLabel: 'Режим выживания',
        hasTiers: this.hasTiers,
        arenaName: this.theme.name,
        arenaTag: this.theme.tagline,
      };
    } else if (this.mode === 'dischunt') {
      ev = {
        type: 'intro',
        mode: 'dischunt',
        code: 'ОХОТА ЗА ДАННЫМИ',
        title: 'ОХОТА ЗА ДИСКАМИ',
        brief: 'Собери 10 дисков данных раньше соперников. Часть дисков лежит на верхнем ярусе!',
        enemies: mkEnemies(),
        arena: this.size,
        lives: 3,
        roundLabel: 'Цель: 10 дисков',
        hasTiers: this.hasTiers,
        arenaName: this.theme.name,
        arenaTag: this.theme.tagline,
      };
    } else if (this.mode === 'practice') {
      ev = {
        type: 'intro',
        mode: 'practice',
        code: 'ТРЕНИРОВКА',
        title: 'СВОБОДНАЯ АРЕНА',
        brief:
          'Никаких соперников. Освой плавное руление, заезд на пандусы (следуй жёлтой стрелке), трамплины и все бонусы. Враги появятся, когда будешь готов.',
        enemies: [],
        arena: this.size,
        lives: 99,
        roundLabel: 'Режим без соперников',
        hasTiers: true,
        arenaName: this.theme.name,
        arenaTag: this.theme.tagline,
      };
    } else if (this.mode === 'boss') {
      ev = {
        type: 'intro',
        mode: 'boss',
        code: 'ТЯЖЁЛАЯ ТЕХНИКА',
        title: 'ДЖАГГЕРНАУТ',
        brief:
          'Четырёхколёсный Light Runner: 5 ядер брони, таран с разгона и ударные волны. Заманивай гиганта в свои стены, бей ЭМИ и тараном в корму на турбо. Не попади под каток!',
        enemies: mkEnemies(),
        arena: this.size,
        lives: this.lives,
        roundLabel: 'Охота на внедорожник',
        hasTiers: this.hasTiers,
        arenaName: this.theme.name,
        arenaTag: this.theme.tagline,
      };
    } else if (this.mode === 'race') {
      ev = {
        type: 'intro',
        mode: 'race',
        code: 'ГОНКА СВЕТОЦИКЛОВ',
        title: 'ЗАЕЗД ПО СЕТКЕ',
        brief: `${this.bikes.length} пилотов · ${this.quick.rounds} круга. Широкая трасса, обгоны по дуге, блокираторы и чекпоинты. Световой след теперь короткий и тает за кормой — а патроны на трассе позволяют прострелить чужой след или соперника.`,
        enemies: mkEnemies(),
        arena: this.size,
        lives: 0,
        roundLabel: `Стартовая решётка · ${this.bikes.length} циклов`,
        hasTiers: false,
        arenaName: this.theme.name,
        arenaTag: `ОВАЛЬНАЯ ТРАССА · ${this.quick.rounds} КРУГА`,
      };
    } else {
      ev = {
        type: 'intro',
        mode: 'quick',
        code: `РАУНД ${this.wins + this.losses + 1}`,
        title: 'БЫСТРЫЙ БОЙ',
        brief: `Последний выживший побеждает. Матч до ${this.quick.rounds} побед.`,
        enemies: mkEnemies(),
        arena: this.size,
        lives: 0,
        roundLabel: `Счёт ${this.wins} : ${this.losses}`,
        hasTiers: this.hasTiers,
        arenaName: this.theme.name,
        arenaTag: this.theme.tagline,
      };
    }
    this.cb.onPhase(ev);
    this.emitHud();
  }

  private diffOf(b: Bike): string {
    const prof = b.ai?.p;
    if (!prof) return '';
    for (const k of Object.keys(AI_PROFILES) as Difficulty[]) if (AI_PROFILES[k] === prof) return DIFFICULTY_LABEL[k];
    return '';
  }

  beginCountdown() {
    if (this.phase !== 'intro' || !this.player) return;
    this.phase = 'countdown';
    this.countdownT = 3.0;
    this.lastCount = -1;
    this.rig.mode = this.cameraMode;
    this.rig.chase(this.player, 2.6, true);
    this.audio.setIntensity(1);
  }

  resultAction(a: ResultAction) {
    if (a === 'next') {
      if (this.mode === 'campaign') this.level = Math.min(CAMPAIGN.length - 1, this.level + 1);
      this.prepareIntro();
    } else if (a === 'retry') {
      this.prepareIntro();
    } else if (a === 'restart') {
      if (this.mode === 'campaign') this.startCampaign();
      else if (this.mode === 'multitier') this.startMultiTier();
      else if (this.mode === 'survival') this.startSurvival();
      else if (this.mode === 'dischunt') this.startDiscHunt();
      else if (this.mode === 'practice') this.startPractice();
      else if (this.mode === 'boss') this.startBoss();
      else this.startQuick(this.quick);
    } else {
      this.startAttract();
    }
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.input.reset();
    this.audio.muteEngines(p);
  }

  setCameraMode(m: CamMode) {
    this.cameraMode = m;
    if (this.mode !== 'attract') this.rig.mode = m;
  }

  cycleCamera(): CamMode {
    const order: CamMode[] = ['smooth', 'chase', 'far', 'cockpit', 'top'];
    const m = order[(order.indexOf(this.cameraMode) + 1) % order.length];
    this.setCameraMode(m);
    if (this.player && this.player.alive && this.rig.isChasing && this.mode !== 'attract') {
      this.rig.chase(this.player, 0.5);
    }
    this.emitHud();
    return m;
  }

  /** Игрок стреляет неоновой пулей. */
  playerShoot() {
    const p = this.player;
    if (!p || !p.alive || this.paused || p.ammo <= 0 || p.shootCd > 0 || p.autopilot) return;
    if (this.phase !== 'playing' && this.phase !== 'countdown') return;
    this.fireBullet(p);
  }

  private fireBullet(b: Bike) {
    if (b.ammo <= 0) return;
    b.ammo--;
    b.shootCd = 0.32;
    const nose = 1.15;
    const x = b.px + Math.cos(b.angle) * nose;
    const z = b.pz + Math.sin(b.angle) * nose;
    const y = b.y + 0.95;
    const ok = this.bullets.fire(b.id, x, y, z, b.angle, b.color, b.level);
    if (!ok) return;
    this.fx.burst(x, y, z, b.color, 16, 4, 2, 0.12);
    this.fx.flash(x, y, z, b.color, 2.2, 0.12, 2);
    const sv = this.spatial(x, z);
    this.audio.laser(Math.max(0.2, sv.v), sv.p);
    if (b.isPlayer) this.rig.addTrauma(0.035);
  }

  /** Осторожная стрельба ИИ: только по игроку, с задержкой и прицелом в упор. */
  private aiShoot(b: Bike) {
    const p = this.player;
    if (!p || !p.alive || p.level !== b.level) return;
    const dx = p.px - b.px;
    const dz = p.pz - b.pz;
    const d = Math.hypot(dx, dz);
    if (d < 9 || d > 52) return;
    const toTarget = Math.atan2(dz, dx);
    let diff = toTarget - b.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > 0.24) return;
    if (Math.random() > 0.22) {
      b.shootCd = 0.4;
      return;
    }
    this.fireBullet(b);
    b.shootCd = 2.2 + Math.random() * 1.6;
  }

  private bulletWorld(): BulletWorld {
    return {
      size: this.size,
      level: 0,
      gridValueAt: (cx, cy, level) => this.grid.get(cx, cy, level),
      targets: () =>
        this.bikes.map((b) => ({
          id: b.id,
          alive: b.alive,
          centerX: b.centerX,
          centerZ: b.centerZ,
          level: b.level,
          kind: b.kind,
        })),
      onTrailHit: (cx, cy, level, x, z, ownerId) => this.damageTrailAt(cx, cy, level, x, z, ownerId),
      onBikeHit: (targetId, ownerId, x, y, z) => this.bulletHitBike(targetId, ownerId, x, y, z),
      onImpact: (x, y, z, color, big) => {
        this.fx.pixels(x, y, z, color, big ? 52 : 18, big ? 7 : 3.4, big ? 0.15 : 0.09);
        const sv = this.spatial(x, z);
        this.audio.pixel(Math.max(0.15, sv.v) * (big ? 1 : 0.45), sv.p);
      },
    };
  }

  /** Два попадания по участку следа — и стена взрывается в кубические пиксели, открывая проезд! */
  private damageTrailAt(cx: number, cy: number, level: number, x: number, z: number, shooterId: number) {
    const cell = this.grid.get(cx, cy, level);
    if (cell === 0 || cell === 255) return;
    const key = level * this.size * this.size + cy * this.size + cx;
    const owner = this.bikes[cell - 1] ?? null;
    const record = this.wallHitMap.get(key) ?? { owner: owner ? owner.id : -1, hits: 0 };
    record.hits++;
    this.wallHitMap.set(key, record);
    const pointY = 0.65;
    if (record.hits < TRAIL_HITS_TO_BREAK) {
      // Первое попадание: яркая трещина, искры, звук треска световода
      this.tmpC.copy(owner ? owner.color : this.tmpC.setHex(0x22eeff));
      this.fx.pixels(x, pointY, z, this.tmpC, 28, 5.2, 0.12);
      this.fx.flash(x, pointY, z, this.tmpC, 2.8, 0.18, 1.8);
      this.audio.crack(this.spatial(x, z).v);
      const shooter = this.bikes[shooterId];
      if (shooter && shooter.isPlayer) {
        this.popup('ТРЕЩИНА В СЛЕДЕ', 'ещё 1 выстрел для пробоя', this.tmpC.getStyle(), 'popup');
      }
      return;
    }
    // Второе попадание: мощный пиксельный взрыв и открытие широкой дыры
    this.wallHitMap.delete(key);
    // Удаляем из памяти соседние ключи трещин, чтобы очистить зону
    const radius = TRAIL_BREACH_RADIUS;
    const R = Math.ceil(radius);
    const destroyed: number[] = [];
    for (let dy = -R; dy <= R; dy++) {
      for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > radius * radius) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!this.grid.inside(nx, ny)) continue;
        const nKey = level * this.size * this.size + ny * this.size + nx;
        this.wallHitMap.delete(nKey);
        const v = this.grid.get(nx, ny, level);
        if (v === 0 || v === 255) continue;
        const ob = this.bikes[v - 1];
        this.grid.set(nx, ny, 0, level);
        if (ob) {
          const ci = ob.cells.indexOf(nKey);
          if (ci >= 0) ob.cells.splice(ci, 1);
        }
        destroyed.push(nKey);
      }
    }

    // Применяем пробой ко всем активным байкам (если пробили чужой след или смежный)
    const trailColor = owner ? owner.color : this.tmpC.setHex(0x22eeff);
    for (const b of this.bikes) {
      b.trail.breach(x, z, radius);
      if (b.cells.length > 0) {
        b.cells = b.cells.filter((idx) => {
          const lvl = Math.floor(idx / (this.size * this.size));
          if (lvl !== level) return true;
          return !destroyed.includes(idx);
        });
      }
    }

    // Пиксельный взрыв световой стены: разлетающиеся светящиеся кубы и кольцо
    this.tmpC.copy(trailColor);
    this.fx.pixels(x, pointY, z, this.tmpC, 110, 11.5, 0.22);
    this.fx.pixels(x, 1.2, z, this.tmpC.setRGB(1, 1, 1), 38, 8.5, 0.16);
    this.fx.ring(x, z, this.tmpC, radius * 2.2, 0.65, 3.8, 0.26, 0.05);
    this.fx.burst(x, pointY + 0.6, z, this.tmpC, 65, 9.5, 4.8, 0.26);
    this.audio.wallBreak(this.spatial(x, z).v);

    const shooter = this.bikes[shooterId];
    if (owner && shooter && shooter.isPlayer && owner !== shooter) {
      const bonus = 400 * (shooter.multTime > 0 ? 2 : 1);
      this.addScore(bonus);
      this.popup('ДЫРА В СЛЕДЕ ПРОБИТА!', `+${bonus} · путь свободен`, trailColor.getStyle(), 'banner');
      this.env.cheer(0.5);
    } else if (owner && shooter && owner === shooter) {
      this.popup('СВОЙ СЛЕД ПРОБИТ!', 'проезд открыт', '#9ff8ff');
    }
    if (owner === this.player && this.player) this.rig.addTrauma(0.18);
  }

  /** Попадание пули по циклу: щит, фаза, либо уничтожение. */
  private bulletHitBike(targetId: number, ownerId: number, x: number, y: number, z: number) {
    const target = this.bikes[targetId];
    if (!target || !target.alive) return;
    const shooter = this.bikes[ownerId] ?? null;
    if (shooter === target) return;
    if (target.phaseTime > 0) return;
    if (target.invulnerable) return;
    if (target.shield) {
      target.shield = false;
      target.guardT = 0.8;
      this.audio.shieldHit();
      this.fx.pixels(x, y, z, this.tmpC.setHex(0x2dff86), 30, 5.5, 0.12);
      this.fx.ring(target.px, target.pz, this.tmpC.setHex(0x2dff86), 7, 0.4, 2, 0.24);
      if (target.isPlayer) this.popup('ЩИТ ПРИНЯЛ ПУЛЮ', 'взрыв погашен', '#2dff86');
      return;
    }
    this.fx.pixels(x, y, z, target.color, 60, 8, 0.16);
    this.kill(target, shooter, 'shot');
    if (shooter && shooter.isPlayer) this.rig.addTrauma(0.14);
  }

  playerJump() {
    const p = this.player;
    if (!p || !p.alive || this.paused) return;
    if (p.hasJump && !p.jumping) {
      p.hasJump = false;
      p.jump(JUMP_VELOCITY * 1.12);
      this.jumpsCount++;
      this.audio.jump();
      this.fx.ring(p.px, p.pz, p.color, 14, 0.6, 2);
      this.popup('СУПЕР-ПРЫЖОК!', 'Перелёт через стены', '#ffa51c');
    }
  }

  // ───────────────────────── раунд ─────────────────────────

  private makeEnemies(n: number, diff: Difficulty): EnemyDef[] {
    const names = [...ENEMY_NAMES].sort(() => Math.random() - 0.5);
    const res: EnemyDef[] = [];
    for (let i = 0; i < n; i++) {
      res.push({ name: names[i % names.length], ai: diff, color: ENEMY_COLOR_ORDER[i % ENEMY_COLOR_ORDER.length] });
    }
    return res;
  }

  private setupRound() {
    this.clearRound();
    this.input.reset();

    let defs: EnemyDef[];
    let size: number;
    let cells: number;
    let hasTiers = false;

    if (this.mode === 'campaign') {
      const L = CAMPAIGN[this.level];
      size = L.arena;
      defs = L.enemies;
      cells = L.cells;
      hasTiers = !!L.hasTiers;
    } else if (this.mode === 'multitier') {
      size = 200;
      cells = 7;
      hasTiers = true;
      defs = this.makeEnemies(4, 'hard');
    } else if (this.mode === 'survival') {
      size = 220;
      cells = 8;
      hasTiers = true;
      defs = this.makeEnemies(3, 'normal');
    } else if (this.mode === 'dischunt') {
      size = 190;
      cells = 8;
      hasTiers = true;
      defs = this.makeEnemies(3, 'normal');
    } else if (this.mode === 'practice') {
      // Свободная арена: без соперников, много бонусов, большой размер
      size = 240;
      cells = 10;
      hasTiers = true;
      defs = [];
    } else if (this.mode === 'quick') {
      size = ARENA_SIZES[this.quick.arena];
      cells = this.quick.cells ? 7 : 0;
      hasTiers = this.quick.hasTiers;
      defs = this.makeEnemies(this.quick.enemies, this.quick.difficulty);
      if (this.quick.boss && defs.length > 0) {
        defs[0] = { name: 'ДЖАГГЕРНАУТ', ai: 'insane', color: 'red', boss: true, runner: true };
      }
    } else if (this.mode === 'boss') {
      // Арена босса: Джаггернаут + два эскорта на его территории
      size = 230;
      cells = 8;
      hasTiers = true;
      defs = [
        { name: 'ДЖАГГЕРНАУТ', ai: 'insane', color: 'red', boss: true, runner: true },
        { name: 'ЭСКОРТ-1', ai: 'hard', color: 'orange' },
        { name: 'ЭСКОРТ-2', ai: 'hard', color: 'amber' },
      ];
    } else if (this.mode === 'race') {
      size = ARENA_SIZES[this.quick.arena];
      cells = this.quick.cells ? 5 : 0;
      hasTiers = false; // выделенная овальная трасса: чистая читаемая линия заезда
      defs = this.makeEnemies(this.quick.enemies, this.quick.difficulty);
    } else {
      size = 190;
      cells = 5;
      hasTiers = true;
      const diffs: Difficulty[] = ['normal', 'hard', 'normal', 'hard', 'normal'];
      const cols: ColorKey[] = ['cyan', 'orange', 'red', 'amber', 'white'];
      defs = diffs.map((d, i) => ({ name: ENEMY_NAMES[i], ai: d, color: cols[i] }));
    }

    const themeId =
      this.mode === 'campaign'
        ? CAMPAIGN[this.level].theme
        : this.mode === 'multitier'
          ? 'portal'
          : this.mode === 'survival'
            ? 'citadel'
            : this.mode === 'dischunt'
              ? 'highway'
                : this.mode === 'practice'
                ? 'grid'
                : this.mode === 'boss'
                  ? 'clu'
                  : this.mode === 'quick'
                    ? this.quick.map
                    : ARENA_THEMES[(Math.random() * ARENA_THEMES.length) | 0].id;
    const baseTheme = themeById(themeId);
    // The race takes place under darker ambient light so the road and rails read clearly.
    const theme =
      this.mode === 'race'
        ? {
            ...baseTheme,
            grid: [baseTheme.grid[0] * 0.5, baseTheme.grid[1] * 0.5, baseTheme.grid[2] * 0.5] as [number, number, number],
            wall: [baseTheme.wall[0] * 0.55, baseTheme.wall[1] * 0.55, baseTheme.wall[2] * 0.55] as [number, number, number],
          }
        : baseTheme;
    this.theme = theme;
    this.rig.distanceBoost = this.mode === 'race' ? 3.6 : 0;
    this.rig.heightBoost = this.mode === 'race' ? 1.7 : 0;
    if (theme.layout === 'flat') hasTiers = false;

    this.size = size;
    this.hasTiers = hasTiers;
    this.tierLayout = hasTiers ? buildLayout(size, theme.layout) : null;
    if (!this.tierLayout) this.hasTiers = false;
    this.grid.reset(size, this.tierLayout);
    this.cellTime[0] = new Float32Array(size * size);
    this.cellTime[1] = new Float32Array(size * size);
    this.env.setArena(size, this.tierLayout, theme);
    this.raceCourse?.dispose();
    this.raceCourse = this.mode === 'race' ? new RaceCourse(this.scene, size, theme) : null;
    this.minimap.reset(size, this.tierLayout, this.raceCourse ? { a: this.raceCourse.a, b: this.raceCourse.b, width: this.raceCourse.width } : null);
    this.env.setFireworkIntensity(this.mode === 'attract' ? 1.5 : 1.2);
    this.env.setEffectQuality(this.fx.quality);

    let id = 0;
    const used = new Set<ColorKey>();
    if (this.mode !== 'attract') {
      const p = new Bike({ id: id++, name: 'ВЫ', colorKey: this.playerColor, isPlayer: true, ai: null });
      this.player = p;
      this.bikes.push(p);
      used.add(this.playerColor);
    }
    for (const d of defs) {
      let color = d.color;
      if (used.has(color)) color = ENEMY_COLOR_ORDER.find((c) => !used.has(c)) ?? color;
      used.add(color);
      if (d.runner) {
        const r = new Runner({
          id: id++,
          name: d.name,
          colorKey: color,
          isPlayer: false,
          ai: new AIController(AI_PROFILES[d.ai]),
          boss: true,
          hp: RUNNER_HP,
        });
        r.armorMax = RUNNER_ARMOR_MAX;
        r.armor = RUNNER_ARMOR_MAX;
        r.trail.width = r.trailWidth;
        this.bikes.push(r);
      } else {
        this.bikes.push(
          new Bike({
            id: id++,
            name: d.name,
            colorKey: color,
            isPlayer: false,
            ai: new AIController(AI_PROFILES[d.ai]),
            boss: d.boss,
          }),
        );
      }
    }
    this.aiWorld.bikes = this.bikes;
    if (this.tierLayout) {
      const L = this.tierLayout;
      this.aiWorld.rampTargets = L.ramps.map((r) => ({ x: (r.x0 + r.x1) / 2 + size / 2, z: (r.z0 + r.z1) / 2 + size / 2 }));
    } else this.aiWorld.rampTargets = undefined;

    const spawns = this.computeSpawns(this.bikes.length, size);
    if (this.mode === 'practice' && this.tierLayout) {
      spawns[0] = { x: 0, z: this.tierLayout.armHalf + this.tierLayout.rampLen + 5, dir: 3, level: 0 };
    }
    this.raceRiders.clear();
    this.raceWalls.length = 0;
    this.raceFinishOrder = 0;
    if (this.mode === 'race' && this.raceCourse) {
      this.bikes.forEach((_b, i) => {
        const pose = this.raceCourse!.getStartingPose(i, this.bikes.length);
        const dir = ((Math.round(pose.heading / (Math.PI / 2)) % 4) + 4) % 4;
        spawns[i] = { x: pose.x, z: pose.z, dir, level: 0, heading: pose.heading };
      });
    }
    this.bikes.forEach((b, i) => {
      const sp = spawns[i];
      const startAngle = (sp as { heading?: number }).heading;
      b.spawn(sp.x, sp.z, sp.dir, sp.level, size, startAngle);
      // В режиме гонки: след динамический (24м) и не забивает трассу!
      b.trailLimit = this.mode === 'race' ? 24.0 : 0;
      b.trail.mat.uniforms.uMaxTrailDist.value = this.mode === 'race' ? 24.0 : 99999.0;
      if (this.mode === 'race' && this.raceCourse) {
        const pose = this.raceCourse.getStartingPose(i, this.bikes.length);
        b.updateDerived();
        this.raceRiders.set(b.id, {
          lastS: pose.distance,
          distance: 0,
          lane: (i % 5 - 2) * (this.raceCourse?.width ?? 40) * 0.1,
          penalty: 0,
          crashCd: 0,
          finished: false,
          finishOrder: 0,
          clean: 0,
          speedBias: 0.92 + Math.random() * 0.18,
          laneTimer: 0,
        });
      }
      // первые секунды — неуязвимость, чтобы старт не решал исход раунда
      b.invulnerable = this.mode !== 'attract';
      b.rez = 0;
      b.rezDelay = this.mode === 'attract' ? 0 : 0.25 + i * 0.15;
      if (this.mode === 'attract') b.rez = 1;
      b.syncVisual(0, this.time);
      this.scene.add(b.model.root);
      this.scene.add(b.trail.mesh);
    });

    const types: PickupType[] = ['turbo', 'shield', 'emp', 'phase', 'jump', 'mult'];
    for (let i = 0; i < cells; i++) this.spawnPickup(this.createPickup(types[i % types.length]));
    // Патроны: на арене одновременно до 5 бонусов-патронов (включая режим гонки, чтобы можно было подбирать их и стрелять на трассе!)
    for (let i = 0; i < AMMO_ON_ARENA; i++) {
      const p = this.createPickup('ammo');
      this.ammoPickups.push(p);
      this.spawnPickup(p);
    }

    for (const b of this.bikes) {
      const v = this.audio.createVoice(b.isPlayer, b.kind === 'runner');
      if (v) this.voices.set(b.id, v);
    }

    this.roundTime = 0;
    this.acc = 0;
    this.timeScale = 1;
    this.slowTimer = 0;
    this.slowTarget = 1;
    this.roundKills = 0;
    this.nearMisses = 0;
    this.jumpsCount = 0;
    this.maxSpeed = 0;
    this.roundStartScore = this.score;
    this.endTimer = 0;
    this.damageT = 0;
    this.desat = 0;
    this.flashT = 0;
    this.lastKillT = -10;
    this.nearCd = 0;
    this.graceT = this.mode === 'attract' ? 0 : 2.5;
    this.racePlace = 0;
    this.fx.clear();
    this.bullets.clear();
  }

  private clearRound() {
    if (this.raceCourse) {
      this.raceCourse.dispose();
      this.raceCourse = null;
    }
    this.raceRiders.clear();
    this.bullets.clear();
    this.wallHitMap.clear();
    for (const b of this.bikes) {
      this.scene.remove(b.model.root);
      this.scene.remove(b.trail.mesh);
      b.dispose();
    }
    this.bikes = [];
    this.aiWorld.bikes = this.bikes;
    this.player = null;
    for (const p of this.pickups) this.scene.remove(p.group);
    this.pickups.length = 0;
    for (const p of this.ammoPickups) this.scene.remove(p.group);
    this.ammoPickups.length = 0;
    this.wallHitMap.clear();
    for (const v of this.voices.values()) v.stop();
    this.voices.clear();
    this.boostEffects.clear();
    this.prevDist.clear();
    this.attractTarget = null;
  }

  /**
   * Старт по кругу: все циклы идут в одну сторону по разным полосам —
   * классический старт Сетки без лобовых столкновений в первые секунды.
   */
  private computeSpawns(n: number, size: number) {
    const res: { x: number; z: number; dir: number; level: number; heading?: number }[] = [];
    const rBase = size * 0.33;
    const jitter = Math.random() * 0.5;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + jitter;
      const rr = rBase - (i % 4) * size * 0.038; // разные полосы
      const x = Math.cos(a) * rr;
      const z = Math.sin(a) * rr;
      // тангенциальное направление (против часовой стрелки)
      const tang = a + Math.PI / 2;
      const dir = ((Math.round(tang / (Math.PI / 2)) % 4) + 4) & 3;
      res.push({ x, z, dir, level: 0 });
    }
    return res;
  }

  /** Каждый бонус получает собственную читаемую голограмму, а не общий кристалл. */
  private createPickup(type: PickupType): Pickup {
    const def = PICKUPS[type];
    const color = new THREE.Color(def.color);
    const group = new THREE.Group();
    const core = new THREE.Group();
    const shell = new THREE.Group();
    const spinners: THREE.Object3D[] = [];
    const solid = (c: THREE.Color, opacity = 1) =>
      new THREE.MeshBasicMaterial({
        color: c.clone().multiplyScalar(2.1),
        transparent: opacity < 1,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
    const mainMat = solid(color);
    const accentMat = solid(new THREE.Color(0xffffff), 0.9);

    const addTorus = (radius: number, tube: number, parent: THREE.Object3D) => {
      const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 6, 40), mainMat);
      parent.add(mesh);
      return mesh;
    };

    if (type === 'ammo') {
      // Неоновый патрон: капсула с конической пулей и двумя обоймами
      const bulletCore = new THREE.CylinderGeometry(0.13, 0.13, 0.62, 8);
      const tip = new THREE.ConeGeometry(0.14, 0.3, 8);
      const body = new THREE.Mesh(bulletCore, accentMat);
      const nose = new THREE.Mesh(tip, mainMat);
      body.position.y = 0.12;
      nose.position.y = 0.58;
      const magA = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.16), mainMat);
      const magB = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.56, 0.16), mainMat);
      magA.position.set(-0.3, 0.06, 0);
      magB.position.set(0.3, 0.06, 0);
      core.add(body, nose, magA, magB);
      const ammoRing = addTorus(0.68, 0.03, shell);
      ammoRing.rotation.x = Math.PI / 2;
      const ammoRing2 = addTorus(0.45, 0.02, shell);
      ammoRing2.rotation.y = Math.PI / 2;
      spinners.push(ammoRing, ammoRing2);
    } else if (type === 'turbo') {
      const bolt = new THREE.Shape();
      bolt.moveTo(-0.18, 0.72);
      bolt.lineTo(0.32, 0.72);
      bolt.lineTo(0.02, 0.12);
      bolt.lineTo(0.36, 0.12);
      bolt.lineTo(-0.28, -0.82);
      bolt.lineTo(-0.02, -0.12);
      bolt.lineTo(-0.34, -0.12);
      const boltGeo = new THREE.ExtrudeGeometry(bolt, { depth: 0.12, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 2 });
      boltGeo.center();
      const mesh = new THREE.Mesh(boltGeo, mainMat);
      mesh.rotation.z = 0.05;
      core.add(mesh);
      const ringA = addTorus(0.9, 0.03, shell);
      ringA.rotation.x = Math.PI / 2;
      const ringB = addTorus(0.68, 0.018, shell);
      ringB.rotation.y = Math.PI / 2;
      spinners.push(ringA, ringB);
    } else if (type === 'shield') {
      const shellGeo = new THREE.IcosahedronGeometry(0.86, 1);
      const shellMesh = new THREE.Mesh(shellGeo, new THREE.MeshBasicMaterial({
        color: color.clone().multiplyScalar(1.4), wireframe: true, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      shell.add(shellMesh);
      const inner = new THREE.Mesh(new THREE.IcosahedronGeometry(0.46, 1), mainMat);
      core.add(inner);
      const badge = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.045, 6, 24), accentMat);
      badge.position.z = 0.02;
      core.add(badge);
      spinners.push(shellMesh);
    } else if (type === 'emp') {
      for (let i = 0; i < 3; i++) {
        const ring = addTorus(0.72, 0.035, shell);
        ring.rotation.x = (i * Math.PI) / 3;
        ring.rotation.y = (i * Math.PI) / 4;
        spinners.push(ring);
      }
      const orb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), accentMat);
      core.add(orb);
    } else if (type === 'phase') {
      const a = new THREE.Mesh(new THREE.TetrahedronGeometry(0.62, 0), mainMat);
      const b = new THREE.Mesh(new THREE.TetrahedronGeometry(0.44, 0), accentMat);
      b.rotation.set(Math.PI, Math.PI / 3, 0);
      core.add(a, b);
      spinners.push(a, b);
      const halo = addTorus(0.86, 0.022, shell);
      halo.rotation.x = Math.PI / 2;
      spinners.push(halo);
    } else if (type === 'jump') {
      const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.7, 5), mainMat);
      arrow.position.y = 0.24;
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.75, 6), mainMat);
      stem.position.y = -0.32;
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.08, 0.28), accentMat);
      base.position.y = -0.76;
      core.add(arrow, stem, base);
      const hoop = addTorus(0.82, 0.028, shell);
      hoop.rotation.x = Math.PI / 2;
      spinners.push(hoop);
    } else {
      const barA = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.18, 0.18), mainMat);
      const barB = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.9, 0.18), mainMat);
      const frame = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.03, 6, 40), accentMat);
      core.add(barA, barB, frame);
      spinners.push(frame);
      const tinyA = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), accentMat);
      const tinyB = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), accentMat);
      tinyA.position.set(-0.48, 0.48, 0.05);
      tinyB.position.set(0.48, -0.48, 0.05);
      shell.add(tinyA, tinyB);
    }

    // Ground halo and a thin vertical locator beam.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.04, 5, 48), mainMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    group.add(ring);
    const beamMat = new THREE.MeshBasicMaterial({
      color: color.clone().multiplyScalar(0.55),
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.2, 6, 8, 1, true), beamMat);
    beam.position.y = 3;
    group.add(beam);

    core.position.y = 1.6;
    shell.position.y = 1.6;
    group.add(core, shell);
    group.visible = false;
    this.scene.add(group);
    const p: Pickup = { x: 0, y: 0, level: 0, type, active: false, respawn: 0, group, core, shell, spinners, ring, baseY: 1.6 };
    this.pickups.push(p);
    return p;
  }

  private spawnPickup(p: Pickup) {
    if (this.mode === 'race' && this.raceCourse) {
      const fraction = 0.09 + Math.random() * 0.82;
      let distance = this.raceCourse.length * fraction;
      const lane = (Math.random() - 0.5) * this.raceCourse.width * 0.66;
      distance = (distance + this.raceCourse.length * 0.13) % this.raceCourse.length;
      const pose = this.raceCourse.poseAtDistance(distance, lane);
      p.x = Math.floor((pose.x + this.size / 2));
      p.y = Math.floor((pose.z + this.size / 2));
      p.level = 0;
      p.active = true;
      p.group.visible = true;
      p.group.position.set(pose.x, 0, pose.z);
      p.baseY = 1.6;
      return;
    }
    const L = this.tierLayout;
    for (let tries = 0; tries < 120; tries++) {
      // часть бонусов кладём на эстакаду
      let level = 0;
      let x: number;
      let z: number;
      if (L && Math.random() < 0.3) {
        level = 1;
        const arm = Math.random() < 0.5;
        const t = (Math.random() - 0.5) * 1.5 * L.armHalf;
        const lat = (Math.random() - 0.5) * L.armWidth * 0.5;
        x = arm ? t : lat;
        z = arm ? lat : t;
      } else {
        const r = this.size * (0.12 + Math.random() * 0.34);
        const a = Math.random() * Math.PI * 2;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      const cx = Math.floor(x + this.size / 2);
      const cy = Math.floor(z + this.size / 2);
      if (!this.grid.free(cx, cy, level)) continue;
      if (level === 0 && !this.grid.free(cx, cy, 1) === false) {
        // под эстакадой спавнить можно
      }
      let ok = true;
      for (const b of this.bikes) {
        if (b.alive && Math.abs(b.cx - cx) + Math.abs(b.cy - cy) < 14) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      p.x = cx;
      p.y = cy;
      p.level = level;
      p.active = true;
      p.group.visible = true;
      p.group.position.set(cx + 0.5 - this.size / 2, level === 1 ? LEVEL_HEIGHT : 0, cy + 0.5 - this.size / 2);
      return;
    }
    p.active = false;
    p.group.visible = false;
    p.respawn = 2;
  }

  private collect(b: Bike, p: Pickup) {
    p.active = false;
    p.group.visible = false;
    p.respawn = 9 + Math.random() * 6;

    const wx = p.group.position.x;
    const wy = p.group.position.y + 1.35;
    const wz = p.group.position.z;
    const def = PICKUPS[p.type];
    this.tmpC.setHex(def.color);
    this.fx.burst(wx, wy, wz, this.tmpC, 48, 8, 5, 0.2);
    this.fx.ring(wx, wz, this.tmpC, 8, 0.5, 1.5);
    this.fx.flash(wx, wy, wz, this.tmpC, 2.0, 0.22, 1.1);

    const isP = b.isPlayer;
    if (p.type === 'ammo') {
      b.ammo = Math.min(AMMO_CAP, b.ammo + AMMO_PER_PICKUP);
      if (isP) {
        this.audio.powerup('turbo');
        this.popup(def.name, `+${AMMO_PER_PICKUP} выстрела · запас ${b.ammo}/${AMMO_CAP}`, def.css);
        this.addScore(100);
      }
      p.respawn = 10 + Math.random() * 8;
      return;
    }
    switch (p.type) {
      case 'turbo':
        b.boost = 1;
        b.turnFlash = 1;
        if (isP) {
          this.addScore(150);
          this.audio.powerup('turbo');
          this.popup(def.name, '+150 · турбо заряжено', def.css);
        }
        break;
      case 'shield':
        b.shield = true;
        if (isP) {
          this.addScore(200);
          this.audio.powerup('shield');
          this.popup(def.name, 'держит одно столкновение', def.css);
        }
        break;
      case 'emp':
        this.triggerEMP(b);
        break;
      case 'phase':
        b.phaseTime = 4.5;
        if (isP) {
          this.addScore(200);
          this.audio.phase();
          this.popup(def.name, 'сквозь стены 4.5 с', def.css);
        }
        break;
      case 'jump':
        b.hasJump = true;
        b.jump(JUMP_VELOCITY);
        this.jumpsCount++;
        if (isP) {
          this.addScore(250);
          this.audio.jump();
          this.popup(def.name, 'прыжок!', def.css);
        }
        break;
      case 'mult':
        b.multTime = 15;
        if (isP) {
          this.addScore(250);
          this.audio.bonus();
          this.popup(def.name, 'двойные очки 15 с', def.css);
        }
        break;
    }

    if (this.mode === 'dischunt' && isP) {
      this.discsCollected++;
      this.addScore(300);
      if (this.discsCollected >= 10) this.endRound(true);
    }
  }

  // ───────────────────────── босс ДЖАГГЕРНАУТ ─────────────────────────

  /** Мозг внедорожника: охота, прицеливание, таран, ударные волны. */
  private updateRunner(r: Runner, dt: number) {
    if (this.phase !== 'playing') return;
    const p = this.player;
    r.chargeCd -= dt;
    r.shockT -= dt;
    r.warnCd -= dt;
    r.ramCd -= dt;
    if (r.armor < r.armorMax) {
      r.armorRegen += dt;
      if (r.armorRegen >= RUNNER_ARMOR_REGEN) {
        r.armorRegen = 0;
        r.armor = Math.min(r.armorMax, r.armor + 1);
      }
    }

    const distP = p && p.alive ? Math.hypot(p.px - r.px, p.pz - r.pz) : Infinity;

    if (r.state === 'stunned') {
      r.stateT -= dt;
      r.boosting = false;
      if (r.stateT <= 0) {
        r.state = 'hunt';
        r.turnQueue.length = 0;
      }
      return;
    }

    if (r.state === 'telegraph') {
      r.stateT -= dt;
      r.boosting = false;
      // доводим нос точно на игрока с упреждением
      if (p && p.alive) {
        const lead = Math.min(14, distP * 0.45);
        const tx = p.px + Math.cos(p.angle) * (p.speed * lead) / Math.max(1, BASE_SPEED);
        const tz = p.pz + Math.sin(p.angle) * (p.speed * lead) / Math.max(1, BASE_SPEED);
        r.chargeDir = Math.atan2(tz - r.pz, tx - r.px);
        r.assistToward(r.chargeDir, 3.4, dt);
      }
      // пульсирующий прицел
      this.tmpC.setHex(0xff2436);
      this.fx.telegraph(r.px, r.pz, r.chargeDir, 26, this.tmpC);
      if (r.stateT <= 0) {
        r.state = 'charge';
        r.stateT = RUNNER_CHARGE_T * (r.phase >= 3 ? 0.8 : 1);
        r.turnQueue.length = 0;
        r.boosting = true;
        r.turnFlash = 1;
        this.audio.whoosh(0.7, 0, true);
        this.rig.addTrauma(0.25);
      }
      return;
    }

    if (r.state === 'charge') {
      r.stateT -= dt;
      r.boosting = true;
      r.turnQueue.length = 0;
      // почти прямо, с лёгкой доводкой за игроком
      r.assistToward(r.chargeDir, 1.1, dt);
      if (Math.random() < dt * 22) {
        this.fx.spark(
          r.tailX, r.tailY + 0.4, r.tailZ,
          -Math.cos(r.angle) * 8, 2 + Math.random() * 3, -Math.sin(r.angle) * 8,
          this.tmpC.setHex(0xff6a12), 2.4, 0.2, 0.4, 0.4,
        );
      }
      if (r.stateT <= 0) {
        r.state = 'hunt';
        r.boosting = false;
        r.chargeCd = RUNNER_CHARGE_CD * (r.phase >= 3 ? 0.6 : r.phase === 2 ? 0.8 : 1);
      }
      return;
    }

    // hunt: начинаем таран, если игрок в зоне досягаемости
    if (r.chargeCd <= 0 && distP < 46 && distP > 6 && p && p.alive && p.level === r.level) {
      r.state = 'telegraph';
      r.stateT = RUNNER_TELEGRAPH_T;
      r.chargeDir = Math.atan2(p.pz - r.pz, p.px - r.px);
      this.audio.chargeWarn();
      if (r.warnCd <= 0) {
        r.warnCd = 6;
        this.popup('ТАРАН!', 'Уходи с линии атаки!', '#ff2436');
      }
      this.rig.addTrauma(0.15);
    }

    // ударная волна по таймеру
    if (r.shockT <= 0) {
      r.shockT = RUNNER_SHOCK_CD * (r.phase >= 3 ? 0.65 : 1);
      this.runnerShockwave(r);
    }
  }

  /** Ударная волна: стирает стены вокруг и толкает воздух. */
  private runnerShockwave(r: Runner) {
    this.tmpC.setHex(0xff6a12);
    this.fx.shockwave(r.px, r.pz, this.tmpC, 22);
    this.audio.emp();
    const S = this.size;
    const R = 9;
    for (const b of this.bikes) {
      if (b === r) continue;
      for (let i = b.cells.length - 1; i >= 0; i--) {
        const idx = b.cells[i];
        const lvl = Math.floor(idx / (S * S));
        const rem = idx % (S * S);
        const cx = rem % S;
        const cy = Math.floor(rem / S);
        if (Math.abs(cx - r.cx) <= R && Math.abs(cy - r.cy) <= R) {
          this.grid.set(cx, cy, 0, lvl);
          b.cells.splice(i, 1);
        }
      }
    }
    const p = this.player;
    if (p && p.alive) {
      const d = Math.hypot(p.px - r.px, p.pz - r.pz);
      if (d < 26) this.rig.addTrauma(Math.max(0, 0.6 - d / 45));
    }
    this.feed('Джаггернаут выпускает ударную волну', '#ffa51c');
    this.env.cheer(0.5);
  }

  /** Урон по боссу. Возвращает true, если босс погиб. */
  private damageBoss(r: Runner, amount: number, cause: string): boolean {
    if (!r.alive || r.guardT > 0 || this.phase !== 'playing') return false;
    r.hp = Math.max(0, r.hp - amount);
    r.guardT = RUNNER_INVULN_T;
    r.coreFlash = 1;
    r.turnFlash = 1;
    this.audio.bossHit();
    this.rig.addTrauma(0.5);
    this.slowmo(0.5, 0.35);
    this.tmpC.copy(r.color);
    this.fx.burst(r.px, r.y + 1.2, r.pz, this.tmpC, 70, 12, 7, 0.3);
    this.fx.flash(r.px, r.y + 1.2, r.pz, this.tmpC.setRGB(1, 1, 1), 6, 0.3, 2.5);

    const names: Record<string, string> = {
      trail: 'загнан в световую стену',
      wall: 'впечатан в границу арены',
      ram: 'протаранен в корму',
      emp: 'поджарен ЭМИ',
    };
    const how = names[cause] ?? 'повреждён';
    this.feed(`Джаггернаут ${how} · ядер: ${r.hp}/${r.maxHp}`, '#ffb347');

    if (r.hp <= 0) {
      this.killRunner(r);
      return true;
    }

    // смена фазы: цвет, ярость, подкрепление
    const phase = r.phase;
    if (phase !== r.phaseAnnounced) {
      r.phaseAnnounced = phase;
      r.phaseColor(this.tmpC);
      r.runnerModel.setPhaseColor(this.tmpC);
      r.trail.mat.uniforms.uColor.value.copy(this.tmpC);
      if (phase === 2) {
        this.popup('БОСС В ЯРОСТИ', 'Тараны чаще, скорость выше', '#ff2436', 'banner');
        this.audio.bossRoar();
        this.spawnEscort(r);
      } else if (phase === 3) {
        this.popup('ПОСЛЕДНИЕ ЯДРА', 'Джаггернаут в overdrive!', '#ff2436', 'banner');
        this.audio.bossRoar();
        this.spawnEscort(r);
        this.spawnEscort(r);
        r.chargeCd = Math.min(r.chargeCd, 2);
      }
      this.env.celebrate(3, r.color);
    } else {
      const bonus = 400 * (this.player && this.player.multTime > 0 ? 2 : 1);
      this.addScore(bonus);
      this.popup('ЯДРО ПРОБИТО!', `+${bonus}`, '#ffb347');
    }
    this.emitHud();
    return false;
  }

  /** Подкрепление босса (не больше лимита техники). */
  private spawnEscort(_r: Runner) {
    if (this.bikes.length >= 11) return;
    const id = this.bikes.length;
    const b = new Bike({
      id,
      name: `ЭСКОРТ-${id}`,
      colorKey: ENEMY_COLOR_ORDER[(id + 3) % ENEMY_COLOR_ORDER.length],
      isPlayer: false,
      ai: new AIController(AI_PROFILES.hard),
    });
    const sp = this.computeSpawns(1, this.size)[0];
    b.spawn(sp.x, sp.z, sp.dir, 0, this.size);
    b.moving = true;
    b.speed = BASE_SPEED * 0.85;
    b.rez = 0;
    b.rezDelay = 0.2;
    this.scene.add(b.model.root);
    this.scene.add(b.trail.mesh);
    this.bikes.push(b);
    this.aiWorld.bikes = this.bikes;
    const v = this.audio.createVoice(false);
    if (v) this.voices.set(b.id, v);
    this.feed('Джаггернаут вызывает эскорт', '#ff8b30');
  }

  /** Финальное уничтожение внедорожника. */
  private killRunner(r: Runner) {
    r.alive = false;
    r.deathTime = this.time;
    r.moving = false;
    r.boosting = false;
    r.computeTail();
    this.fx.derezz(r.px, r.pz, r.angle, r.speed, r.color, 2.4);
    this.tmpC.setRGB(1, 1, 1);
    this.fx.flash(r.px, r.y + 1.5, r.pz, this.tmpC, 22, 0.6, 3);
    this.audio.bossDown();
    this.env.celebrate(10, r.color);
    this.rig.addTrauma(1);
    this.slowmo(0.22, 1.6);
    const v = this.voices.get(r.id);
    if (v) {
      v.stop();
      this.voices.delete(r.id);
    }
    const p = this.player;
    if (p) {
      p.kills++;
      this.roundKills++;
    }
    const bonus = 5000 * (p && p.multTime > 0 ? 2 : 1);
    this.addScore(bonus);
    this.popup('ДЖАГГЕРНАУТ УНИЧТОЖЕН', `+${bonus}`, '#ffe23a', 'banner');
    this.feed('Тяжёлая техника дерезирована', '#ffe23a');
    this.checkRunnerWin();
  }

  /** Победа засчитывается, когда мёртв внедорожник (эскорт может оставаться). */
  private checkRunnerWin() {
    if (this.phase !== 'playing') return;
    const runnerAlive = this.bikes.some((b) => b instanceof Runner && b.alive);
    if (!runnerAlive) {
      // уцелевший эскорт отступает — гасим их следы
      for (const b of this.bikes) {
        if (b.alive && !b.isPlayer && !(b instanceof Runner)) {
          b.alive = false;
          b.deathTime = this.time;
          b.moving = false;
          this.fx.derezz(b.px, b.pz, b.angle, b.speed, b.color);
          const vv = this.voices.get(b.id);
          if (vv) {
            vv.stop();
            this.voices.delete(b.id);
          }
        }
      }
      this.endRound(true);
    }
  }

  /** Столкновение внедорожника со стеной/границей. */
  private runnerHitWall(r: Runner, v: number, nx: number, nz: number) {
    if (v === 255 || !this.grid.inside(nx, nz)) {
      // граница арены — всегда авария
      r.px = THREE.MathUtils.clamp(r.px, -this.size / 2 + 1, this.size / 2 - 1);
      r.pz = THREE.MathUtils.clamp(r.pz, -this.size / 2 + 1, this.size / 2 - 1);
      r.speed = Math.min(r.speed, BRAKE_SPEED);
      r.state = 'stunned';
      r.stateT = RUNNER_STUN_T;
      r.boosting = false;
      r.updateDerived();
      this.tmpC.copy(r.color);
      this.fx.burst(r.px, r.y + 1, r.pz, this.tmpC, 60, 12, 6, 0.3);
      this.audio.smash();
      this.damageBoss(r, 1, 'wall');
      return;
    }
    const owner = this.bikes[v - 1] ?? null;
    if (owner === r) {
      // свой след — тоже авария (правила Сетки едины)
      r.state = 'stunned';
      r.stateT = RUNNER_STUN_T;
      r.boosting = false;
      this.audio.smash();
      this.damageBoss(r, 1, 'trail');
      return;
    }
    if (owner && owner.isPlayer) {
      // ЛОВУШКА СРАБОТАЛА: стена игрока режет броню
      r.state = 'stunned';
      r.stateT = RUNNER_STUN_T;
      r.boosting = false;
      this.audio.smash();
      this.slowmo(0.4, 0.5);
      const killed = this.damageBoss(r, 1, 'trail');
      if (!killed && this.player) {
        this.player.kills++;
        this.roundKills++;
        const bonus = 800 * (this.player.multTime > 0 ? 2 : 1);
        this.addScore(bonus);
        this.popup('ЛОВУШКА!', `Джаггернаут в твоей стене · +${bonus}`, '#ffe23a');
      }
      return;
    }
    // чужие стены — проламывает броней
    if (r.armor > 0 && r.guardT <= 0) {
      r.armor--;
      r.armorRegen = 0;
      this.audio.smash();
      this.tmpC.setHex(0xffa51c);
      this.fx.burst(r.px, r.y + 1, r.pz, this.tmpC, 50, 10, 5, 0.26);
      this.fx.ring(r.px, r.pz, this.tmpC, 10, 0.4, 2);
      // крошим коридор 3×3 впереди
      const S = this.size;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const cx = nx + dx;
          const cy = nz + dy;
          if (!this.grid.inside(cx, cy)) continue;
          const cell = this.grid.get(cx, cy, r.level);
          if (cell !== 0 && cell !== 255) {
            this.grid.set(cx, cy, 0, r.level);
            const ob = this.bikes[cell - 1];
            if (ob) {
              const gi = ob.cells.indexOf(r.level * S * S + cy * S + cx);
              if (gi >= 0) ob.cells.splice(gi, 1);
            }
          }
        }
      }
      this.feed('Джаггернаут проламывает стену', '#ffa51c');
      r.speed = Math.max(r.speed * 0.75, BASE_SPEED * 0.7);
      return;
    }
    // брони нет — урон
    r.state = 'stunned';
    r.stateT = RUNNER_STUN_T;
    this.audio.smash();
    this.damageBoss(r, 1, 'trail');
  }

  /** Контакт корпусов: таран игрока в корму босса или давка. */
  private resolveRunnerContact(r: Runner, o: Bike) {
    if (!o.alive || o.airborne || o.level !== r.level) return;
    const dx = o.px - r.px;
    const dz = o.pz - r.pz;
    const d = Math.hypot(dx, dz);
    const crushR = r.charging ? r.crushR + 0.7 : r.crushR;
    if (d >= crushR) return;
    // игрок на турбо бьёт в корму/борт по ходу — урон ядру, игрока отбрасывает
    if (o.isPlayer && o.boosting && o.guardT <= 0) {
      const toRunner = Math.atan2(r.pz - o.pz, r.px - o.px);
      let rel = toRunner - o.angle;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      const sameDir = Math.cos(o.angle - r.angle) > 0.35;
      if (Math.abs(rel) < 1.1 && sameDir && r.ramCd <= 0) {
        r.ramCd = 3;
        o.speed *= 0.35;
        o.guardT = 1.6;
        o.turnFlash = 1;
        this.audio.smash();
        this.rig.addTrauma(0.55);
        this.slowmo(0.45, 0.4);
        this.tmpC.copy(r.color);
        this.fx.burst(r.px - Math.cos(r.angle) * 2.5, r.y + 1.2, r.pz - Math.sin(r.angle) * 2.5, this.tmpC, 60, 11, 6, 0.28);
        this.damageBoss(r, 1, 'ram');
        return;
      }
    }
    // иначе — давка
    if (o.guarded || o.phaseTime > 0) return;
    if (o.shield) {
      o.shield = false;
      this.audio.shieldHit();
      o.guardT = 1.2;
      if (o.isPlayer) this.popup('ЩИТ СРАБОТАЛ!', 'каток отбит', '#2dff86');
      return;
    }
    this.kill(o, r, 'crush');
  }

  private triggerEMP(source: Bike) {
    this.audio.emp();
    this.tmpC.setHex(0xff36ee);
    this.fx.ring(source.px, source.pz, this.tmpC, 28, 0.75, 3);
    this.rig.addTrauma(0.45);
    // ЭМИ поджаривает ядра внедорожника в радиусе
    for (const b of this.bikes) {
      if (b instanceof Runner && b.alive && Math.hypot(b.px - source.px, b.pz - source.pz) < 20) {
        if (source.isPlayer) {
          this.popup('ЭМИ ПО БОССУ!', 'ядра перегреты', '#ff36ee');
          this.addScore(500);
        }
        this.damageBoss(b, 1, 'emp');
      }
    }
    if (source.isPlayer) {
      this.popup('ЭМИ-ИМПУЛЬС!', 'стены врагов стёрты', '#ff36ee', 'banner');
      this.addScore(300);
    }
    const radius = 16;
    const S = this.size;
    for (const b of this.bikes) {
      if (b === source) continue;
      for (let i = b.cells.length - 1; i >= 0; i--) {
        const idx = b.cells[i];
        const lvl = Math.floor(idx / (S * S));
        const rem = idx % (S * S);
        const cx = rem % S;
        const cy = Math.floor(rem / S);
        if (Math.abs(cx - source.cx) <= radius && Math.abs(cy - source.cy) <= radius) {
          this.grid.set(cx, cy, 0, lvl);
          b.cells.splice(i, 1);
        }
      }
    }
  }

  // ───────────────────────── симуляция ─────────────────────────

  private sideBlock(x: number, y: number, d: number, level: number) {
    const v1 = this.grid.get(x + DX[d], y + DY[d], level);
    if (v1 !== 0) return v1 === 255 ? 0.6 : 1;
    const v2 = this.grid.get(x + DX[d] * 2, y + DY[d] * 2, level);
    if (v2 !== 0) return v2 === 255 ? 0.3 : 0.5;
    return 0;
  }

  /** Поверхность (пол / пандус / эстакада) под точкой. */
  private surfaceAt(wx: number, wz: number, level: number) {
    const half = this.size / 2;
    const cx = Math.floor(wx + half);
    const cy = Math.floor(wz + half);
    const r = this.grid.rampAt(cx, cy);
    if (r) return rampHeight(r, wx, wz);
    if (level >= 1 && this.grid.isDeck(cx, cy)) return LEVEL_HEIGHT;
    return 0;
  }

  private tick() {
    const dt = TICK;
    this.roundTime += dt;
    const input = this.input;
    // Пульты: моделируем в тике, чтобы попадания были честными.
    for (const b of this.bikes) {
      this.bulletWorld().level = b.level;
    }
    // Пули моделируем с актуальным уровнем владельца/цели
    const bWorld = this.bulletWorld();
    this.bullets.update(dt, bWorld);
    for (const b of this.bikes) {
      if (b.shootCd > 0) b.shootCd = Math.max(0, b.shootCd - dt);
    }
    if (this.mode === 'race') {
      // Световой след в гонке держится 1.4 с (длина шлейфа ~24м), затем полоса освобождается!
      while (this.raceWalls.length && this.time - this.raceWalls[0].at > 1.4) {
        const wall = this.raceWalls.shift()!;
        if (this.grid.get(wall.index % this.size, Math.floor(wall.index / this.size), wall.level) !== 0) {
          this.grid.set(wall.index % this.size, Math.floor(wall.index / this.size), 0, wall.level);
        }
      }
    }

    if (this.mode === 'survival' && this.phase === 'playing') {
      this.survivalTimer -= dt;
      if (this.survivalTimer <= 0) this.spawnSurvivalWave();
    }
    if (this.mode === 'race' && this.phase === 'playing' && this.roundTime > 240) {
      const state = this.player ? this.raceRiders.get(this.player.id) : null;
      if (state && !state.finished) this.racePlace = this.racePlace || Math.max(1, this.bikes.length);
      this.endRound(false);
    }

    // стартовая неуязвимость 2.5 с
    if (this.graceT > 0) {
      this.graceT -= dt;
      if (this.graceT <= 0) for (const b of this.bikes) b.invulnerable = false;
    }

    for (const b of this.bikes) {
      if (!b.alive || !b.moving) continue;

      const raceState = this.mode === 'race' ? this.raceRiders.get(b.id) : undefined;
      if (raceState?.finished) continue;

      if (b.phaseTime > 0) b.phaseTime = Math.max(0, b.phaseTime - dt);
      if (b.multTime > 0) b.multTime = Math.max(0, b.multTime - dt);
      if (b.guardT > 0) b.guardT = Math.max(0, b.guardT - dt);
      if (b instanceof Runner) {
        this.updateRunner(b, dt);
        if (!b.alive || !b.moving) continue;
      }

      // скорость и турбо
      if (b.isPlayer && !b.autopilot) {
        if (!input.boost) b.boostLock = false;
        b.boosting = input.boost && !b.boostLock && b.boost > 0;
        b.braking = input.brake && !b.boosting;
      }
      let target: number;
      if (b instanceof Runner) target = b.runnerTargetSpeed();
      else if (this.mode === 'race' && raceState) target = (BASE_SPEED + 2.5) * raceState.speedBias + (b.boosting ? 12 : 0);
      else target = BASE_SPEED + b.grind * GRIND_SPEED_BONUS;
      if (b.boosting && !(b instanceof Runner)) target = BOOST_SPEED + b.grind * GRIND_SPEED_BONUS;
      else if (b.braking) target = BRAKE_SPEED;
      if (b.autopilot) target = BASE_SPEED * 0.82;
      const rate = target > b.speed ? (b.boosting ? 50 : 24) : 36;
      b.speed += Math.max(-rate * dt, Math.min(rate * dt, target - b.speed));

      if (b.boosting && !(b instanceof Runner)) {
        b.boost -= BOOST_DRAIN * dt;
        if (b.boost <= 0) {
          b.boost = 0;
          b.boosting = false;
          b.boostLock = true;
        }
      } else if (!(b instanceof Runner)) {
        b.boost = Math.min(1, b.boost + (BOOST_REGEN + b.grind * GRIND_REGEN) * dt);
      }
      b.grind += (b.grindTarget - b.grind) * Math.min(1, dt * 9);

      // На гоночной трассе ИИ следует по центральной линии; игрок рулит вручную.
      if (this.mode === 'race' && this.raceCourse && raceState && !raceState.finished) {
        if (b.isPlayer) {
          b.updateSteering(dt, input.steer);
        } else {
          this.driveRaceAI(b, raceState, dt);
        }
      } else if (b.isPlayer && !b.autopilot) {
        b.updateSteering(dt, input.steer);
      } else {
        if (this.hasTiers && !b.jumping && b.y < LEVEL_HEIGHT * 0.6) {
          const assist = this.rampAssist(b);
          if (assist !== null) b.assistToward(assist, RAMP_ASSIST_RATE, dt);
        }
        b.updateTurn(dt);
      }

      const step = b.speed * dt;
      const nx = b.px + Math.cos(b.angle) * step;
      const nz = b.pz + Math.sin(b.angle) * step;

      // поверхность под новой позицией
      const surf = this.surfaceAt(nx, nz, b.level);
      const gap = b.y - surf;
      const air = b.jumping || gap > 0.45;

      // столкновения (только на поверхности и не в фазе)
      const half = this.size / 2;
      const ncx = Math.floor(nx + half);
      const ncy = Math.floor(nz + half);
      let raceProjection: RaceProjection | null = null;
      if (this.mode === 'race' && this.raceCourse && raceState && this.graceT <= 0) {
        raceProjection = this.raceCourse.project(nx, nz);
        raceState.crashCd = Math.max(0, raceState.crashCd - dt);
        raceState.penalty = Math.max(0, raceState.penalty - dt * 0.18);
        const edge = this.raceCourse.width * 0.5 - 1.0;
        if (Math.abs(raceProjection.lateral) > edge) {
          this.raceCrash(b, raceState, raceProjection, 'barrier');
          continue;
        }
        const obstacle = this.raceCourse.nearestObstacle(raceProjection.distance, raceProjection.lateral);
        if (obstacle && raceState.crashCd <= 0 && !b.airborne && b.phaseTime <= 0) {
          this.raceCrash(b, raceState, raceProjection, 'blocker');
          continue;
        }
      }
      if (!this.grid.inside(ncx, ncy)) {
        if (this.mode === 'race' && raceProjection) {
          this.raceCrash(b, raceState!, raceProjection, 'barrier');
          continue;
        }
        if (b instanceof Runner) {
          this.runnerHitWall(b, 255, ncx, ncy);
          continue;
        }
        if (b.guarded) {
          b.px = THREE.MathUtils.clamp(b.px, -half + 1, half - 1);
          b.pz = THREE.MathUtils.clamp(b.pz, -half + 1, half - 1);
          b.speed = Math.min(b.speed, BRAKE_SPEED);
          b.updateDerived();
        } else {
          this.kill(b, null, 'wall');
        }
        continue;
      }
      // на пандусе стены не рисуются и не сталкиваются — это «зона заезда»
      const onRamp = !!this.grid.rampAt(ncx, ncy);
      if (!air && !onRamp && b.phaseTime <= 0) {
        const v = this.grid.get(ncx, ncy, b.level);
        if (v !== 0) {
          if (this.mode === 'race' && raceProjection) {
            this.raceCrash(b, raceState!, raceProjection, 'trail');
            continue;
          }
          if (b instanceof Runner) {
            this.runnerHitWall(b, v, ncx, ncy);
            continue;
          }
          if (b.shield) {
            b.shield = false;
            this.audio.shieldHit();
            this.fx.ring(b.px, b.pz, this.tmpC.setHex(0x2dff86), 12, 0.45, 2);
            if (b.isPlayer) this.popup('ЩИТ СРАБОТАЛ!', 'препятствие пробито', '#2dff86');
          } else if (!b.guarded) {
            b.px = nx;
            b.pz = nz;
            b.updateDerived();
            const owner = v === 255 ? null : this.bikes[v - 1] ?? null;
            const cause: DeathCause = v === 255 ? 'wall' : owner === b ? 'self' : 'trail';
            this.kill(b, owner && owner !== b ? owner : null, cause);
            continue;
          }
        }
      }

      b.px = nx;
      b.pz = nz;

      // вертикаль
      const landed = b.updateVertical(dt, surf);
      if (landed) {
        if (b.isPlayer) {
          this.audio.land();
          this.rig.addTrauma(0.08);
        }
        this.fx.ring(b.px, b.pz, b.color, 7, 0.4, 1.4);
        this.fx.burst(b.px, b.y + 0.2, b.pz, b.color, 24, 4, 3, 0.16);
      }

      // трамплин
      if (!b.jumping && this.grid.onPad(Math.floor(nx + half), Math.floor(nz + half))) {
        b.jump(JUMP_VELOCITY);
        this.jumpsCount++;
        this.tmpC.setHex(0xffa51c);
        this.fx.ring(b.px, b.pz, this.tmpC, 12, 0.5, 2.4);
        this.fx.burst(b.px, 0.3, b.pz, this.tmpC, 30, 5, 7, 0.2);
        if (b.isPlayer) this.audio.jump();
      }

      // трение о стены (зарядка турбо)
      const bl = this.sideBlock(b.cx, b.cy, (b.dir + 3) & 3, b.level);
      const br = this.sideBlock(b.cx, b.cy, (b.dir + 1) & 3, b.level);
      if (bl >= br) {
        b.grindTarget = bl;
        b.grindSide = bl > 0 ? -1 : 0;
      } else {
        b.grindTarget = br;
        b.grindSide = 1;
      }

      // Программы-соперники тоже умеют стрелять, если подобрали патроны.
      if (!b.isPlayer && !b.autopilot && b.ammo > 0 && b.shootCd <= 0 && this.phase === 'playing') {
        this.aiShoot(b);
      }

      b.pushPath();
      const previousX = b.cx;
      const previousY = b.cy;
      b.updateDerived();

      // При переходе в новую клетку:
      //  1) оставляем стену в ПОКИНУТОЙ клетке (стена всегда позади носа),
      //  2) решение ИИ / сбор бонуса / бонусы манёвров.
      // Благодаря этому собственная клетка никогда не убивает цикл.
      if (ncx !== previousX || ncy !== previousY) {
        const ocx = previousX;
        const ocy = previousY;
        if (!air && b.phaseTime <= 0 && this.grid.free(ocx, ocy, b.level)) {
          this.grid.set(ocx, ocy, b.id + 1, b.level);
          b.cells.push(b.level * this.size * this.size + ocy * this.size + ocx);
          this.cellTime[b.level][ocy * this.size + ocx] = this.roundTime;
          if (this.mode === 'race') this.raceWalls.push({ index: ocy * this.size + ocx, level: b.level, at: this.time });
        }
        this.onCell(b);
      }

        if (raceState && raceProjection && this.raceCourse) {
        this.advanceRace(b, raceState, raceProjection.distance);
      }
    }

    // лобовые столкновения — по фактической близости носов
    for (let i = 0; i < this.bikes.length; i++) {
      const a = this.bikes[i];
      if (!a.alive || !a.moving || a.airborne) continue;
      for (let j = i + 1; j < this.bikes.length; j++) {
        const o = this.bikes[j];
        if (!o.alive || !o.moving || o.airborne || o.level !== a.level) continue;
        if (a instanceof Runner || o instanceof Runner) {
          const r = a instanceof Runner ? a : (o as Runner);
          const other = a instanceof Runner ? o : a;
          this.resolveRunnerContact(r, other);
          continue;
        }
        const d = Math.hypot(a.px - o.px, a.pz - o.pz);
        const dot = Math.cos(a.angle - o.angle);
        if (d < 1.7 && dot < -0.55) {
          if (this.mode === 'race') {
            const sa = this.raceRiders.get(a.id);
            const so = this.raceRiders.get(o.id);
            if (sa && this.raceCourse) this.raceCrash(a, sa, this.raceCourse.project(a.px, a.pz), 'blocker');
            if (so && this.raceCourse) this.raceCrash(o, so, this.raceCourse.project(o.px, o.pz), 'blocker');
          } else {
            this.resolveHeadOn(a, o);
          }
        }
      }
    }

    const p = this.player;
    if (p && p.alive && this.phase === 'playing') {
      this.scoreFrac += dt * (10 + p.grind * 70) * (p.multTime > 0 ? 2 : 1);
      if (this.scoreFrac >= 1) {
        const n = Math.floor(this.scoreFrac);
        this.scoreFrac -= n;
        this.score += n;
      }
      if (p.speed > this.maxSpeed) this.maxSpeed = p.speed;
    }
  }

  /** Оценка свободности полосы: световые стены, бортики и препятствия. */
  private raceLaneScore(b: Bike, state: RaceRiderState, lateral: number, course: RaceCourse) {
    const half = this.size / 2;
    let score = 0;
    // walls ahead in this lane
    for (const ahead of [10, 22, 36, 52]) {
      const pose = course.poseAtDistance(state.distance + ahead, lateral);
      const cx = Math.floor(pose.x + half);
      const cy = Math.floor(pose.z + half);
      for (const side of [-2.4, 0, 2.4]) {
        const px = Math.floor((pose.x + pose.nx * side) + half);
        const py = Math.floor((pose.z + pose.nz * side) + half);
        if (!this.grid.free(px, py, 0)) score -= 70 / (ahead * 0.3 + 1);
        if (!this.grid.free(cx, cy, 0)) score -= 50 / (ahead * 0.3 + 1);
      }
      // hazards
      const obstacle = course.nearestObstacle(course.distanceAtAngle(pose.theta), lateral);
      if (obstacle) score -= 220 / (ahead * 0.25 + 1);
      for (const other of this.bikes) {
        if (other === b || !other.alive) continue;
        const od = Math.hypot(other.px - pose.x, other.pz - pose.z);
        if (od < 6) score -= (6 - od) * 35;
      }
    }
    // stay on the track
    const limit = course.width * 0.42;
    if (Math.abs(lateral) > limit) score -= (Math.abs(lateral) - limit) * 20;
    // slight preference for their current lane (smoothness)
    score -= Math.abs(lateral - state.lane) * 2.2;
    return score;
  }

  private driveRaceAI(b: Bike, state: RaceRiderState, dt: number) {
    const course = this.raceCourse;
    if (!course) return;
    state.laneTimer -= dt;
    if (state.laneTimer <= 0) {
      state.laneTimer = 0.6 + Math.random() * 0.9;
      const limit = course.width * 0.36;
      let bestLane = state.lane;
      let bestScore = -Infinity;
      for (let i = -3; i <= 3; i++) {
        const lane = (i / 3) * limit;
        const score = this.raceLaneScore(b, state, lane, course) + Math.random() * 8;
        if (score > bestScore) {
          bestScore = score;
          bestLane = lane;
        }
      }
      state.lane = THREE.MathUtils.clamp(bestLane, -limit, limit);
    }
    const proj = course.project(b.px, b.pz);
    // Чем быстрее едешь, тем дальше смотрим — иначе ИИ режет поворот.
    const look = 14 + b.speed * 0.5;
    const aim = course.poseAtDistance(proj.distance + look, state.lane);
    let diff = aim.heading - b.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    b.updateSteering(dt, THREE.MathUtils.clamp(diff * 2.1, -1, 1));
    // Обгоны: в длинных свободных пролётах и в лёгких поворотах ИИ ускоряется.
    const ahead = course.project(
      b.px + Math.cos(b.angle) * 26,
      b.pz + Math.sin(b.angle) * 26,
    ).lateral;
    const clear = Math.abs(ahead) < course.width * 0.36;
    b.boosting = b.boost > 0.25 && b.grind < 0.2 && clear && this.fastRaceBike(b, state);
  }

  private fastRaceBike(b: Bike, state: RaceRiderState) {
    // Rivals vary their pace so the order changes and overtakes happen.
    return Math.sin(this.time * 0.7 + b.id * 1.7 + state.distance * 0.02) > 0.45;
  }

  /** Небольшой штраф и возврат на асфальт вместо случайной смерти от декора трассы или следа соперника. */
  private raceCrash(b: Bike, state: RaceRiderState, projection: RaceProjection, kind: 'barrier' | 'blocker' | 'trail') {
    if (!this.raceCourse || state.crashCd > 0) return;
    state.crashCd = kind === 'blocker' ? 1.6 : kind === 'trail' ? 1.2 : 1.1;
    state.penalty = Math.min(18, state.penalty + (kind === 'blocker' ? 1.6 : kind === 'trail' ? 1.0 : 0.9));
    state.clean = 0;
    b.speed *= kind === 'blocker' ? 0.38 : kind === 'trail' ? 0.65 : 0.58;
    b.guardT = Math.max(b.guardT, 0.65);
    let lane = THREE.MathUtils.clamp(projection.lateral, -this.raceCourse.width * 0.42, this.raceCourse.width * 0.42);
    if (kind === 'blocker') {
      const obstacle = this.raceCourse.nearestObstacle(projection.distance, projection.lateral);
      lane = obstacle && obstacle.lane >= 0 ? -this.raceCourse.width * 0.28 : this.raceCourse.width * 0.28;
    } else if (kind === 'trail') {
      lane += lane < 0 ? 3.2 : -3.2; // отскок от светового следа в свободную полосу
    } else {
      lane = Math.sign(lane || 1) * this.raceCourse.width * 0.28;
    }
    lane = THREE.MathUtils.clamp(lane, -this.raceCourse.width * 0.42, this.raceCourse.width * 0.42);
    b.px = projection.x + projection.nx * lane;
    b.pz = projection.z + projection.nz * lane;
    b.angle = projection.heading;
    b.targetIdx = ((Math.round(b.angle / (Math.PI / 2)) % 4) + 4) % 4;
    b.visualHeading = b.angle;
    b.updateDerived();
    state.lastS = projection.distance;
    this.audio.smash(0.45, 0);
    this.tmpC.setHex(kind === 'blocker' ? 0xff8b30 : kind === 'trail' ? 0x22eeff : 0xff344d);
    this.fx.burst(b.px, 0.7, b.pz, this.tmpC, 38, 8, 3, 0.18);
    this.fx.ring(b.px, b.pz, this.tmpC, 5, 0.4, 1.8);
    if (b.isPlayer) {
      this.rig.addTrauma(0.18);
      const text = kind === 'blocker' ? 'БЛОКИРАТОР!' : kind === 'trail' ? 'СВЕТОВОЙ СЛЕД!' : 'БОРТ ТРАССЫ!';
      const cost = kind === 'blocker' ? 2.5 : kind === 'trail' ? 1.0 : 1.4;
      this.popup(text, `+${cost} сек штрафа`, kind === 'trail' ? '#22eeff' : '#ff8b30');
    }
  }

  private advanceRace(b: Bike, state: RaceRiderState, courseS: number) {
    const course = this.raceCourse;
    if (!course || state.finished) return;
    let d = courseS - state.lastS;
    if (d < -course.length * 0.5) d += course.length;
    else if (d > course.length * 0.5) d -= course.length;
    // Reverse movement does not count toward a lap.
    if (d > 0 && d < 20) {
      state.distance += d;
      state.clean += d;
    }
    state.lastS = courseS;
    if (state.distance < course.length * this.quick.rounds) return;
    state.finished = true;
    state.finishOrder = ++this.raceFinishOrder;
    b.moving = false;
    b.speed = 0;
    if (b.isPlayer) {
      this.racePlace = state.finishOrder;
      const win = this.racePlace === 1;
      const score = Math.max(0, 3000 - (this.racePlace - 1) * 500 - Math.round(state.penalty * 30));
      this.addScore(score);
      this.env.setFireworkIntensity(win ? 2.7 : 0.8);
      this.env.celebrate(win ? 10 : 4, win ? b.color : undefined);
      this.popup(win ? 'ФИНИШ! ПЕРВОЕ МЕСТО' : `ФИНИШ! МЕСТО ${this.racePlace}`, `+${score} · штрафы ${state.penalty.toFixed(1)}с`, win ? '#ffe23a' : '#45eaff', 'banner');
      this.endRound(win);
    }
  }

  private getRaceHud(): HudState['race'] {
    const course = this.raceCourse;
    const p = this.player;
    if (this.mode !== 'race' || !course || !p) return null;
    const state = this.raceRiders.get(p.id);
    if (!state) return null;
    let place = 1;
    for (const [id, other] of this.raceRiders) {
      if (id === p.id) continue;
      if (other.finished && (!state.finished || other.finishOrder < state.finishOrder)) place++;
      else if (!other.finished && other.distance > state.distance + 0.8) place++;
    }
    const laps = this.quick.rounds;
    const lap = Math.min(laps, Math.floor(state.distance / course.length) + 1);
    const progress = Math.min(1, (state.distance % course.length) / course.length);
    return {
      place,
      entrants: this.bikes.length,
      lap,
      laps,
      progress,
      penalty: state.penalty,
      finished: state.finished,
      clean: state.clean,
    };
  }

  private resolveHeadOn(a: Bike, b: Bike) {
    if (a.shield) {
      a.shield = false;
      this.audio.shieldHit();
      if (a.isPlayer) this.popup('ЩИТ СРАБОТАЛ!', 'столкновение отражено', '#2dff86');
    } else if (!a.guarded) {
      this.kill(a, b, 'headon');
    }
    if (b.alive) {
      if (b.shield) {
        b.shield = false;
        this.audio.shieldHit();
        if (b.isPlayer) this.popup('ЩИТ СРАБОТАЛ!', 'столкновение отражено', '#2dff86');
      } else if (!b.guarded) {
        this.kill(b, a, 'headon');
      }
    }
  }

  private onCell(b: Bike) {
    // сбор бонусов
    for (const pk of this.pickups) {
      if (!pk.active || pk.level !== b.level) continue;
      if (this.mode === 'race' && this.raceCourse) {
        if (Math.hypot(pk.group.position.x - b.px, pk.group.position.z - b.pz) < 2.6) this.collect(b, pk);
      } else if (Math.abs(pk.x - b.cx) <= 1 && Math.abs(pk.y - b.cy) <= 1) {
        this.collect(b, pk);
      }
    }

    let turn = 0;
    if (this.mode === 'race') {
      // In race mode all rival steering is continuous pure-pursuit above.
    } else if (b.isPlayer && !b.autopilot) {
      // ввод игрока применяется сразу — плавный доворат
    } else {
      const ai = b.autopilot ?? b.ai;
      if (ai && !b.isTurning) {
        turn = ai.decide(b, this.aiWorld);
        if (turn !== 0) b.queueTurn(turn);
        if (!b.isPlayer) b.boosting = ai.wantsBoost(b, this.aiWorld) && b.boost > 0;
      }
    }

    if (turn !== 0 && b.isPlayer) {
      /* недостижимо: игрок рулит напрямую */
    }

    // бонус за «на грани» — поворот у самой стены
    if (b.isPlayer && !b.autopilot && turn !== 0 && this.phase === 'playing' && this.nearCd <= 0) {
      this.nearMisses++;
      this.addScore(100);
      this.popup('НА ГРАНИ!', '+100', b.css);
      this.audio.bonus();
      this.env.cheer(0.4);
      this.nearCd = 0.7;
      this.rig.addTrauma(0.1);
    }

    if (b.isPlayer && this.phase === 'playing' && b.grind >= 1 && this.nearCd <= 0) {
      this.nearMisses++;
      this.addScore(150 * (b.multTime > 0 ? 2 : 1));
      this.popup('СКВОЗЬ ЩЕЛЬ!', `+${150 * (b.multTime > 0 ? 2 : 1)}`, '#ffffff');
      this.audio.bonus();
      this.nearCd = 1.4;
    }
  }

  private spawnSurvivalWave() {
    this.survivalWave++;
    this.survivalTimer = Math.max(13, 24 - this.survivalWave * 1.5);
    const count = Math.min(3, 1 + Math.floor(this.survivalWave / 2));
    const names = ['ОХОТНИК', 'ШТОРМ', 'ОМЕГА', 'ТЕНЬ'];
    const diffs: Difficulty[] = ['normal', 'hard', 'insane'];
    const diff = diffs[Math.min(diffs.length - 1, Math.floor(this.survivalWave / 2))];
    for (let i = 0; i < count; i++) {
      if (this.bikes.length >= 11) break;
      const id = this.bikes.length;
      const b = new Bike({
        id,
        name: `${names[i % names.length]}-${this.survivalWave}`,
        colorKey: ENEMY_COLOR_ORDER[(id + this.survivalWave) % ENEMY_COLOR_ORDER.length],
        isPlayer: false,
        ai: new AIController(AI_PROFILES[diff]),
      });
      const sp = this.computeSpawns(1, this.size)[0];
      b.spawn(sp.x, sp.z, sp.dir, 0, this.size);
      b.moving = true;
      b.speed = BASE_SPEED * 0.85;
      b.rez = 0;
      b.rezDelay = 0.2;
      this.scene.add(b.model.root);
      this.scene.add(b.trail.mesh);
      this.bikes.push(b);
      this.aiWorld.bikes = this.bikes;
      const v = this.audio.createVoice(false);
      if (v) this.voices.set(b.id, v);
    }
    this.audio.countdown(true);
    this.popup(`ВОЛНА ${this.survivalWave}`, 'новые программы в Сетке', '#ff2436', 'banner');
  }

  private kill(b: Bike, killer: Bike | null, cause: DeathCause) {
    if (!b.alive) return;
    if (this.mode === 'race') {
      const state = this.raceRiders.get(b.id);
      if (state && this.raceCourse) {
        this.raceCrash(b, state, this.raceCourse.project(b.px, b.pz), 'blocker');
      } else {
        b.guardT = 1;
      }
      return;
    }
    // Внедорожник не дерезируется от одного удара — урон идёт в ядра.
    if (b instanceof Runner) {
      if (cause === 'headon' && killer && !(killer instanceof Runner)) {
        // лобовое с циклом: цикл гибнет, босс лишь замедляется
        if (!killer.guarded && !killer.shield && killer.phaseTime <= 0) {
          this.kill(killer, b, 'headon');
        } else if (killer.shield) {
          killer.shield = false;
          this.audio.shieldHit();
          killer.guardT = 1.2;
        }
        b.speed = Math.max(b.speed * 0.6, BASE_SPEED * 0.6);
        return;
      }
      b.state = 'stunned';
      b.stateT = RUNNER_STUN_T;
      b.boosting = false;
      this.audio.smash();
      this.damageBoss(b, 1, cause === 'crush' ? 'trail' : cause);
      return;
    }
    b.alive = false;
    b.deathTime = this.time;
    b.computeTail();
    b.moving = false;
    b.boosting = false;
    this.fx.derezz(b.px, b.pz, b.angle, b.speed, b.color);

    const sv = this.spatial(b.px, b.pz);
    this.audio.derezz(Math.max(0.15, sv.v), sv.p);
    const cam = this.rig.camera.position;
    const camD = Math.hypot(cam.x - b.px, cam.z - b.pz);
    this.rig.addTrauma(Math.max(0, 0.9 - camD / 60));

    const v = this.voices.get(b.id);
    if (v) {
      v.stop();
      this.voices.delete(b.id);
    }

    this.env.cheer(b.isPlayer ? 0.45 : 0.75);
    if (killer && killer.isPlayer) this.env.celebrate(2, killer.color);

    let text: string;
    if (cause === 'wall') text = `${b.name} врезался в границу`;
    else if (cause === 'self') text = `${b.name} разбился о свой след`;
    else if (cause === 'headon') text = `${b.name} — лобовое`;
    else if (cause === 'crush') text = `${b.name} раздавлен Джаггернаутом`;
    else if (cause === 'shot') text = `${b.name} прострелен неоновой пулей`;
    else text = `${killer ? killer.name : '?'} ⟶ ${b.name}`;
    this.feed(text, b.css);

    if (killer && killer !== b) {
      killer.kills++;
      if (killer.isPlayer && this.mode !== 'attract' && this.phase === 'playing') {
        this.roundKills++;
        const mul = killer.multTime > 0 ? 2 : 1;
        let bonus = 500 * mul;
        this.popup('ПРОГРАММА УНИЧТОЖЕНА', `${b.name} · +${bonus}`, b.css, 'banner');
        if (this.time - this.lastKillT < 4) {
          bonus += 300 * mul;
          this.popup('МУЛЬТИ-ДЕРЕЗ!', `+${300 * mul}`, '#ffe23a');
        }
        this.lastKillT = this.time;
        this.addScore(bonus);
        this.flashT = 0.07;
        this.slowmo(0.45, 0.45);
      }
    }

    if (this.mode === 'attract' && this.attractTarget === b) this.attractCamTimer = Math.min(this.attractCamTimer, 1.4);

    if (b.isPlayer) this.onPlayerDeath();
    else this.checkRoundEnd();
  }

  private onPlayerDeath() {
    if (this.mode === 'attract' || this.phase !== 'playing') return;
    if (this.mode === 'race') {
      this.phase = 'ending';
      this.endWin = false;
      this.endTimer = 1.8;
      this.slowmo(0.38, 0.8);
      this.damageT = 0.8;
      this.popup('ЗАЕЗД ОКОНЧЕН', 'цикл не дошёл до финиша', '#ff5353', 'banner');
      return;
    }
    if (this.mode === 'survival') {
      this.phase = 'ending';
      this.endWin = false;
      this.endTimer = 2.6;
      this.slowmo(0.28, 1.5);
      this.damageT = 1;
      this.audio.setIntensity(0);
      this.popup('ДЕРЕЗОЛЮЦИЯ', 'сигнал потерян', '#ff4a4a', 'banner');
      return;
    }
    if (this.lives > 1) {
      // осталась жизнь — мгновенный респаун раунда
      this.lives--;
      this.phase = 'ending';
      this.endWin = false;
      this.endTimer = 2.4;
      this.slowmo(0.3, 1.4);
      this.damageT = 1;
      this.audio.setIntensity(0);
      this.popup('ДЕРЕЗОЛЮЦИЯ', `жизней осталось: ${this.lives}`, '#ff4a4a', 'banner');
      return;
    }
    this.phase = 'ending';
    this.endWin = false;
    this.endTimer = 2.8;
    this.slowmo(0.26, 1.6);
    this.damageT = 1;
    this.audio.setIntensity(0);
    this.popup('ДЕРЕЗОЛЮЦИЯ', 'диск идентичности стёрт', '#ff4a4a', 'banner');
  }

  private checkRoundEnd() {
    const alive = this.bikes.filter((b) => b.alive);
    if (this.mode === 'attract') {
      if (alive.length <= 1 && this.attractTimer <= 0) this.attractTimer = 3.5;
      return;
    }
    if (this.phase !== 'playing') return;
    const p = this.player;
    if (!p || !p.alive) return;
    if (this.mode === 'survival' || this.mode === 'practice' || this.mode === 'race') return;
    if (this.getRunner()) return;
    // в бою с боссом победа — только через уничтожение внедорожника
    if (this.bikes.some((b) => b instanceof Runner && b.alive)) return;
    if (this.mode === 'boss' || this.mode === 'quick') {
      const enemies = alive.length - 1;
      if (enemies <= 0) this.endRound(true);
      else if (enemies === 1) this.audio.setIntensity(2);
      return;
    }
    const enemies = alive.length - 1;
    if (enemies <= 0) this.endRound(true);
    else if (enemies === 1) this.audio.setIntensity(2);
  }

  private endRound(win: boolean) {
    if (this.phase !== 'playing') return;
    this.phase = 'ending';
    this.endWin = win;
    this.endTimer = 2.8;
    this.slowmo(win ? 0.28 : 0.3, 1.5);
    const p = this.player!;
    if (win) {
      p.invulnerable = true;
      p.boosting = false;
      if (this.mode !== 'race') p.autopilot = new AIController(AI_PROFILES.hard);
      else p.moving = false;
      p.turnQueue.length = 0;
      this.env.setFireworkIntensity(2.6);
      this.env.celebrate(9, p.color);
      const bonus = this.mode === 'campaign' ? 1000 + this.level * 250 : this.mode === 'race' ? 0 : 1000;
      if (bonus) this.addScore(bonus);
      this.popup(
        this.mode === 'race' ? 'ФИНИШ' : 'ПОБЕДА',
        this.mode === 'race' ? 'первым к финишу' : `сетка зачищена · +${bonus}`,
        p.css,
        'banner',
      );
      this.rig.orbit(p.centerX, p.centerZ, 9, 3.2, 0.45, 1.6, p, 1);
    } else {
      this.env.setFireworkIntensity(0.25);
      this.rig.orbit(p.centerX, p.centerZ, 13, 7, 0.32, 0.9, null, 0.6);
    }
    this.audio.setIntensity(0);
  }

  private finishRound() {
    this.phase = 'result';
    const win = this.endWin;
    const stats = [
      { label: 'Время раунда', value: fmtTime(this.roundTime) },
      { label: 'Уничтожено программ', value: String(this.roundKills) },
      { label: 'Опасные манёвры', value: String(this.nearMisses) },
      { label: 'Прыжки и трамплины', value: String(this.jumpsCount) },
      { label: 'Макс. скорость', value: `${Math.round(this.maxSpeed * KMH)} км/ч` },
      { label: 'Очки за раунд', value: `+${this.score - this.roundStartScore}` },
      { label: 'Всего очков', value: this.score.toLocaleString('ru-RU') },
    ];
    if (this.mode === 'survival') stats.unshift({ label: 'Пережито волн', value: String(this.survivalWave) });
    if (this.mode === 'dischunt') stats.unshift({ label: 'Собрано дисков', value: `${this.discsCollected} / 10` });

    if (this.mode === 'race') {
      const state = this.player ? this.raceRiders.get(this.player.id) : null;
      const place = this.racePlace || this.bikes.length;
      stats.unshift(
        { label: 'Место на финише', value: `${place} / ${this.bikes.length}` },
        { label: 'Круги', value: `${this.quick.rounds} / ${this.quick.rounds}` },
        { label: 'Чистая трасса', value: state ? `${Math.floor(state.clean)} м` : '—' },
        { label: 'Штрафы', value: state ? `${state.penalty.toFixed(1)} с` : '—' },
      );
      const first = win && place === 1;
      const ev: PhaseEvent = {
        type: 'result',
        win: first,
        final: true,
        title: first ? 'ПОБЕДА В ГОНКЕ' : state?.finished ? 'ФИНИШ' : 'ВРЕМЯ ВЫШЛО',
        subtitle: state?.finished ? `Финишное место: ${place}` : 'Трасса не пройдена до конца',
        stats,
        actions: ['restart', 'menu'],
        record: first ? this.saveBest() : false,
      };
      this.cb.onPhase(ev);
      this.emitHud();
      return;
    }

    if (this.mode === 'boss') {
      const won = this.endWin && !this.getRunner();
      const ev: PhaseEvent = {
        type: 'result',
        win: won,
        final: true,
        title: won ? 'ДЖАГГЕРНАУТ ДЕРЕЗИРОВАН' : 'ЭКИПАЖ РАЗБИТ',
        subtitle: won ? 'Сетка празднует победу над тяжёлой техникой' : `Джаггернаут: ${this.getRunner()?.hp ?? 0} ядер осталось`,
        stats,
        actions: ['restart', 'menu'],
        record: won ? this.saveBest() : false,
      };
      this.cb.onPhase(ev);
      this.emitHud();
      return;
    }

    let ev: PhaseEvent;
    if (this.mode === 'campaign') {
      if (win) {
        if (this.level >= CAMPAIGN.length - 1) {
          ev = {
            type: 'result',
            win: true,
            final: true,
            title: 'СЕТКА ПОКОРЕНА',
            subtitle: 'Ты — новый Чемпион Сетки',
            stats,
            actions: ['restart', 'menu'],
            record: this.saveBest(),
          };
        } else {
          const n = CAMPAIGN[this.level + 1];
          ev = {
            type: 'result',
            win: true,
            final: false,
            title: 'СЕКТОР ЗАЧИЩЕН',
            subtitle: `Далее: Сектор ${n.code} — ${n.name}`,
            stats,
            actions: ['next', 'menu'],
            record: false,
          };
        }
      } else if (this.lives <= 0) {
        ev = {
          type: 'result',
          win: false,
          final: true,
          title: 'КОНЕЦ ИГРЫ',
          subtitle: 'Диск идентичности стёрт',
          stats,
          actions: ['restart', 'menu'],
          record: this.saveBest(),
        };
      } else {
        ev = {
          type: 'result',
          win: false,
          final: false,
          title: 'ДЕРЕЗОЛЮЦИЯ',
          subtitle: `Осталось жизней: ${this.lives}`,
          stats,
          actions: ['retry', 'menu'],
          record: false,
        };
      }
    } else if (this.mode === 'survival') {
      ev = {
        type: 'result',
        win: this.survivalWave >= 5,
        final: true,
        title: this.survivalWave >= 5 ? 'МАСТЕР ВЫЖИВАНИЯ' : 'СИГНАЛ ПОТЕРЯН',
        subtitle: `Выдержано волн: ${this.survivalWave}`,
        stats,
        actions: ['restart', 'menu'],
        record: this.saveBest(),
      };
    } else if (this.mode === 'practice') {
      ev = {
        type: 'result',
        win: true,
        final: true,
        title: 'ТРЕНИРОВКА ЗАВЕРШЕНА',
        subtitle: 'Сетка изучена — пора в бой',
        stats,
        actions: ['restart', 'menu'],
        record: false,
      };
    } else if (this.mode === 'dischunt') {
      const won = this.discsCollected >= 10;
      ev = {
        type: 'result',
        win: won,
        final: true,
        title: won ? 'ДИСКИ ИЗВЛЕЧЕНЫ' : 'ОХОТА ПРОВАЛЕНА',
        subtitle: won ? 'ядро Системы перегружено' : '10 дисков не собрано',
        stats,
        actions: ['restart', 'menu'],
        record: false,
      };
    } else {
      if (win) this.wins++;
      else this.losses++;
      const t = this.quick.rounds;
      const sc = `${this.wins} : ${this.losses}`;
      if (this.wins >= t) {
        ev = { type: 'result', win: true, final: true, title: 'ТРИУМФ', subtitle: `матч выигран · ${sc}`, stats, actions: ['restart', 'menu'], record: false };
      } else if (this.losses >= t) {
        ev = { type: 'result', win: false, final: true, title: 'ПОРАЖЕНИЕ', subtitle: `матч проигран · ${sc}`, stats, actions: ['restart', 'menu'], record: false };
      } else {
        ev = {
          type: 'result',
          win,
          final: false,
          title: win ? 'РАУНД ВЫИГРАН' : 'РАУНД ПРОИГРАН',
          subtitle: `счёт ${sc} · до ${t} побед`,
          stats,
          actions: ['next', 'menu'],
          record: false,
        };
      }
    }
    if (!win && this.mode !== 'campaign') this.rig.orbit(0, 0, this.size * 0.6, this.size * 0.34, 0.06, 2.6, null, 0);
    this.cb.onPhase(ev);
    this.emitHud();
  }

  /**
   * Автодоводка на пандус: если цикл движется вдоль пандуса в коридоре подхода,
   * мягко выравниваем курс по оси пандуса — заезд получается стабильным.
   * Возвращает целевой угол или null, если помощь не нужна.
   */
  private rampAssist(b: Bike): number | null {
    const L = this.tierLayout;
    if (!L) return null;
    const half = this.size / 2;
    const cx = Math.floor(b.px + half);
    const cy = Math.floor(b.pz + half);
    // уже на пандусе или на эстакаде — не мешаем
    if (this.grid.rampAt(cx, cy) || this.grid.isDeck(cx, cy)) return null;

    const corr = L.rampLen * 1.15;
    for (const r of L.ramps) {
      // верхняя точка пандуса — на координате ascendTo
      const topC = r.ascendTo;
      const topSign = r.ascendTo > r.ascendFrom ? -1 : 1; // направление подъёма
      if (r.axis === 'x') {
        // коридор перед началом подъёма (снаружи)
        const outer = r.ascendFrom;
        const inCorr = b.px > Math.min(outer, topC) - 0.5 && b.px < Math.max(outer, topC) + corr;
        const within = b.pz >= r.z0 - 2 && b.pz <= r.z1 + 2;
        if (inCorr && within) {
          const target = topSign < 0 ? 0 : Math.PI; // к верхней точке
          if (Math.abs(Math.cos(b.angle) - Math.cos(target)) > Math.cos(RAMP_ASSIST_ANGLE)) continue;
          return target;
        }
      } else {
        const outer = r.ascendFrom;
        const inCorr = b.pz > Math.min(outer, topC) - 0.5 && b.pz < Math.max(outer, topC) + corr;
        const within = b.px >= r.x0 - 2 && b.px <= r.x1 + 2;
        if (inCorr && within) {
          const target = topSign < 0 ? Math.PI / 2 : -Math.PI / 2;
          if (Math.abs(Math.sin(b.angle) - Math.sin(target)) > Math.cos(RAMP_ASSIST_ANGLE)) continue;
          return target;
        }
      }
    }
    return null;
  }

  /** Угол и дистанция до ближайшего пандуса (для стрелки-подсказки в HUD). */
  private rampHint(b: Bike): { angle: number; dist: number } | null {
    const L = this.tierLayout;
    if (!L) return null;
    let best: { angle: number; dist: number } | null = null;
    let bestD = Infinity;
    for (const r of L.ramps) {
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      const dx = cx - b.px;
      const dz = cz - b.pz;
      const d = Math.hypot(dx, dz);
      if (d < bestD) {
        bestD = d;
        // угол в мировых координатах (0 = +X), как heading цикла
        best = { angle: Math.atan2(dz, dx), dist: d };
      }
    }
    return best;
  }

  private saveBest(): boolean {
    try {
      const prev = loadBest();
      if (this.score > prev) {
        localStorage.setItem(BEST_KEY, String(this.score));
        return true;
      }
    } catch {
      /* ignore */
    }
    return false;
  }

  private slowmo(scale: number, dur: number) {
    this.slowTarget = scale;
    this.slowTimer = dur;
  }

  private addScore(n: number) {
    if (this.mode === 'attract') return;
    this.score += n;
  }

  private popup(text: string, sub: string, color: string, kind: 'popup' | 'banner' = 'popup') {
    if (this.mode === 'attract') return;
    this.cb.onMessage({ id: this.msgId++, kind, text, sub, color });
  }

  private feed(text: string, color: string) {
    if (this.mode === 'attract') return;
    this.cb.onMessage({ id: this.msgId++, kind: 'feed', text, color });
  }

  private spatial(x: number, z: number) {
    const cam = this.rig.camera;
    const dx = x - cam.position.x;
    const dz = z - cam.position.z;
    const d = Math.hypot(dx, dz);
    this.tmpV.setFromMatrixColumn(cam.matrixWorld, 0);
    const pan = d > 0.001 ? (dx * this.tmpV.x + dz * this.tmpV.z) / d : 0;
    return { v: 1 / (1 + d * 0.035), p: pan * 0.8 };
  }

  private pickAttractShot() {
    const alive = this.bikes.filter((b) => b.alive);
    this.attractCamTimer = 7 + Math.random() * 4;
    const k = this.attractCamIdx++ % 3;
    if (k === 1 && alive.length) {
      const b = alive[Math.floor(Math.random() * alive.length)];
      this.attractTarget = b;
      this.rig.mode = 'smooth';
      this.rig.chase(b, 1.8, true);
    } else if (k === 2 && alive.length) {
      const b = alive[Math.floor(Math.random() * alive.length)];
      this.attractTarget = b;
      this.rig.orbit(b.centerX, b.centerZ, 10, 3.4, 0.25, 1.8, b, 1);
    } else {
      this.attractTarget = null;
      this.rig.orbit(0, 0, this.size * 0.68, this.size * 0.3, 0.05, 2.2, null, 0);
    }
  }

  postParams() {
    const p = this.player;
    let speed = 0;
    if (p && p.alive && p.boosting) speed = Math.min(1, Math.max(0, (p.speed - BASE_SPEED) / (BOOST_SPEED - BASE_SPEED)));
    const beat = this.audio.getBeatData();
    return {
      speed: speed * 0.85,
      flash: this.flashT,
      damage: this.damageT * 0.8,
      desat: this.desat,
      beat: beat.kickPulse,
    };
  }

  // ───────────────────────── кадр ─────────────────────────

  update(rawDt: number) {
    if (this.paused) return;
    if (this.slowTimer > 0) {
      this.slowTimer -= rawDt;
      if (this.slowTimer <= 0) this.slowTarget = 1;
    }
    const k = this.slowTarget < this.timeScale ? 14 : 2.2;
    this.timeScale += (this.slowTarget - this.timeScale) * Math.min(1, rawDt * k);
    const dt = rawDt * this.timeScale;
    this.time += dt;

    if (this.nearCd > 0) this.nearCd -= dt;
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - rawDt * 0.8);
    if (this.damageT > 0) this.damageT = Math.max(0, this.damageT - rawDt * 0.6);
    const lost = this.mode !== 'attract' && this.player && !this.player.alive;
    this.desat += ((lost ? 0.5 : 0) - this.desat) * Math.min(1, rawDt * 2);

    if (this.phase === 'countdown') {
      this.countdownT -= rawDt;
      const n = Math.ceil(this.countdownT);
      if (n !== this.lastCount && n >= 1 && n <= 3) {
        this.lastCount = n;
        this.cb.onPhase({ type: 'countdown', value: n });
        this.audio.countdown(false);
      }
      if (this.countdownT <= 0) {
        this.phase = 'playing';
        for (const b of this.bikes) {
          b.moving = true;
          b.speed = BASE_SPEED * 0.66;
        }
        this.cb.onPhase({ type: 'countdown', value: 0 });
        this.audio.countdown(true);
        this.rig.addTrauma(0.28);
        this.env.celebrate(3);
        this.env.setFireworkIntensity(0.6);
        // неуязвимость снимается по таймеру в tick()
      }
    } else if (this.phase === 'playing' || this.phase === 'ending' || this.phase === 'result') {
      this.acc += dt;
      let steps = 0;
      while (this.acc >= TICK && steps < 14) {
        this.tick();
        this.acc -= TICK;
        steps++;
      }
      if (steps >= 14) this.acc = 0;
      if (this.phase === 'ending') {
        this.endTimer -= rawDt;
        if (this.endTimer <= 0) this.finishRound();
      }
    }

    if (this.mode === 'attract') {
      if (this.attractTimer > 0) {
        this.attractTimer -= rawDt;
        if (this.attractTimer <= 0) {
          this.startAttract();
          return;
        }
      }
      this.attractCamTimer -= rawDt;
      if (this.attractCamTimer <= 0) this.pickAttractShot();
    }

    const beat = this.audio.getBeatData();

    // бонусы
    for (const pk of this.pickups) {
      if (pk.active) {
        pk.core.rotation.y += dt * 2.1;
        pk.core.rotation.x += dt * 0.4;
        pk.shell.rotation.y -= dt * 1.1;
        for (let i = 0; i < pk.spinners.length; i++) {
          const spinner = pk.spinners[i];
          spinner.rotation.y += dt * (0.9 + i * 0.3);
          spinner.rotation.z += dt * (0.4 + i * 0.17);
        }
        pk.ring.rotation.z += dt * 1.2;
        const baseY = pk.baseY + Math.sin(this.time * 2.6 + pk.x) * 0.18;
        pk.core.position.y = baseY;
        pk.shell.position.y = baseY;
        const sc = 1 + beat.kickPulse * 0.18;
        pk.core.scale.setScalar(sc);
        pk.shell.scale.setScalar(sc);
        pk.ring.scale.setScalar(1 + beat.kickPulse * 0.15);
      } else if (this.phase === 'playing' || this.mode === 'attract') {
        pk.respawn -= dt;
        if (pk.respawn <= 0) this.spawnPickup(pk);
      }
    }

    // обрушение стен погибших
    for (const b of this.bikes) {
      if (b.alive || b.cleared) continue;
      const t = this.time - b.deathTime;
      if (t > 0.35) {
        b.collapse = Math.max(0, 1 - (t - 0.35) / 0.95);
        b.trail.mat.uniforms.uCollapse.value = Math.max(0.001, b.collapse);
        if (b.collapse <= 0) {
          const S = this.size;
          for (const idx of b.cells) {
            const lvl = Math.floor(idx / (S * S));
            const rem = idx % (S * S);
            if (this.grid.get(rem % S, Math.floor(rem / S), lvl) === b.id + 1) this.grid.set(rem % S, Math.floor(rem / S), 0, lvl);
          }
          b.cleared = true;
          b.trail.mesh.visible = false;
        }
      }
    }

    // визуал и свет
    this.lights.length = 0;
    for (const b of this.bikes) {
      const waiting = b.rezDelay > 0;
      b.syncVisual(dt, this.time);
      if (waiting && b.rezDelay <= 0) {
        this.fx.ring(b.px, b.pz, b.color, 7, 0.7, 1.6);
        this.fx.burst(b.px, b.y + 0.3, b.pz, b.color, 36, 3, 7, 0.18);
        const sv = this.spatial(b.px, b.pz);
        this.audio.rez(0.3 * sv.v, sv.p);
      }
      if (b.alive) {
        const kk = (b.boosting ? 0.7 : 0.5) * b.rez;
        if (this.lights.length < 8) {
          this.lights.push({ x: b.px, y: b.y, z: b.pz, r: b.color.r * kk, g: b.color.g * kk, b: b.color.b * kk });
        }
        if (b.moving && b.boosting && dt > 0) {
          const forwardX = Math.cos(b.angle);
          const forwardZ = Math.sin(b.angle);
          if (!this.boostEffects.has(b.id)) {
            this.boostEffects.add(b.id);
            this.fx.flash(b.tailX, b.tailY + 0.55, b.tailZ, b.color, 3.5, 0.25, 1.5);
            this.fx.ring(b.tailX, b.tailZ, b.color, 6, 0.42, 1.5, 0.16, b.tailY + 0.06);
          }
          let particles = 40 * this.fx.quality * dt;
          while (particles > 0) {
            if (particles >= 1 || Math.random() < particles) {
              const spread = (Math.random() - 0.5) * 1.4;
              const speed = 5 + Math.random() * 10;
              this.fx.spark(
                b.tailX - forwardX * 0.25, b.tailY + 0.35, b.tailZ - forwardZ * 0.25,
                -forwardX * speed - forwardZ * spread, 0.5 + Math.random() * 1.5,
                -forwardZ * speed + forwardX * spread, b.color, 2.2,
                0.16 + Math.random() * 0.13, 0.18 + Math.random() * 0.25, 0.15,
              );
            }
            particles -= 1;
          }
        } else {
          this.boostEffects.delete(b.id);
        }
        if (b.moving && b.grind > 0.45 && dt > 0) {
          let n = b.grind * b.speed * 2.2 * this.fx.quality * dt;
          const fx = Math.cos(b.angle);
          const fz = Math.sin(b.angle);
          const side = b.grindSide || 1;
          while (n > 0) {
            if (n >= 1 || Math.random() < n) {
              const ox = b.tailX + fx * 0.4 - fz * side * 0.28;
              const oz = b.tailZ + fz * 0.4 + fx * side * 0.28;
              const sp = 3 + Math.random() * 7;
              const white = Math.random() < 0.4;
              this.fx.spark(
                ox,
                b.y + 0.12,
                oz,
                -fx * sp - fz * side * (1 + Math.random() * 2),
                1 + Math.random() * 3.5,
                -fz * sp + fx * side * (1 + Math.random() * 2),
                white ? this.tmpC.setRGB(1, 1, 1) : b.color,
                white ? 1.2 : 3,
                0.12 + Math.random() * 0.13,
                0.22 + Math.random() * 0.3,
              );
            }
            n -= 1;
          }
        }
      } else if (!b.cleared) {
        const t = this.time - b.deathTime;
        const kk = Math.max(0, 1.5 * (1 - t / 0.9));
        if (kk > 0 && this.lights.length < 8) {
          this.lights.push({ x: b.px, y: b.y, z: b.pz, r: b.color.r * kk, g: b.color.g * kk, b: b.color.b * kk });
        }
      }
    }

    this.env.update(dt, this.time, this.rig.camera, this.lights, beat.beatPulse, beat.kickPulse);
    this.raceCourse?.update(this.time, beat.kickPulse);
    this.bullets.syncVisual();
    this.fx.update(dt);

    const p = this.player;
    this.rig.speedN = p && p.alive ? p.speed / BASE_SPEED : 1;
    this.rig.update(rawDt);

    // звук моторов
    const cam = this.rig.camera;
    this.tmpV.setFromMatrixColumn(cam.matrixWorld, 0);
    const rx = this.tmpV.x;
    const rz = this.tmpV.z;
    for (const b of this.bikes) {
      const v = this.voices.get(b.id);
      if (!v || !b.alive) continue;
      const dx = b.px - cam.position.x;
      const dz = b.pz - cam.position.z;
      const d = Math.hypot(dx, dz);
      let vol = b.isPlayer ? 0.3 : 0.6 / (1 + d * 0.13);
      if (!b.moving) vol *= 0.3;
      vol *= b.rez;
      const pan = b.isPlayer ? 0 : d > 0.01 ? (dx * rx + dz * rz) / d : 0;
      const prev = this.prevDist.get(b.id) ?? d;
      const vr = rawDt > 0 ? (d - prev) / rawDt : 0;
      this.prevDist.set(b.id, d);
      const dop = b.isPlayer ? 1 : Math.max(0.78, Math.min(1.25, 1 - vr / 150));
      v.update(b.speed / BASE_SPEED, b.boosting, vol, pan * 0.8, dop * (0.55 + 0.45 * this.timeScale));
    }

    this.hudTimer -= rawDt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.06;
      if (this.mode !== 'attract') this.emitHud();
    }
    this.mapTimer -= rawDt;
    if (this.mapTimer <= 0) {
      this.mapTimer = 1 / 30;
      this.minimap.draw(this.bikes, this.pickups, this.time, beat.beatPulse);
    }
  }

  emitHud() {
    const p = this.player;
    const camp = this.mode === 'campaign' ? CAMPAIGN[this.level] : null;
    const beat = this.audio.getBeatData();
    const runner = this.getRunner();

    const bikesList: HudBike[] = this.bikes.map((b) => ({
      id: b.id,
      name: b.name,
      color: b.css,
      alive: b.alive,
      kills: b.kills,
      isPlayer: b.isPlayer,
      boss: b.boss,
      level: b.level,
      y: b.y,
      shield: b.shield,
      runner: b instanceof Runner,
      armor: b instanceof Runner ? b.armor : undefined,
      armorMax: b instanceof Runner ? b.armorMax : undefined,
      charging: b instanceof Runner ? b.charging : undefined,
    }));

    const modeLabel =
      this.mode === 'multitier'
        ? 'ДВУХЪЯРУСНЫЙ БОЙ'
        : this.mode === 'survival'
          ? `ВЫЖИВАНИЕ · ВОЛНА ${this.survivalWave}`
          : this.mode === 'dischunt'
            ? `ОХОТА ЗА ДИСКАМИ · ${this.discsCollected}/10`
              : this.mode === 'practice'
                ? 'СВОБОДНАЯ АРЕНА'
                : this.mode === 'boss'
                  ? 'ОХОТА НА ДЖАГГЕРНАУТА'
                  : this.mode === 'race'
                    ? 'ГОНКА СВЕТОЦИКЛОВ'
                    : 'БЫСТРЫЙ БОЙ';

    const h: HudState = {
      mode: this.mode,
      speed: p ? Math.round(p.speed * KMH) : 0,
      speedN: p ? p.speed / BASE_SPEED : 0,
      boost: p ? p.boost : 0,
      boosting: !!p && p.boosting,
      braking: !!p && p.braking,
      grinding: p ? p.grind : 0,
      score: this.score,
      kills: p ? p.kills : 0,
      alive: this.bikes.filter((b) => b.alive).length,
      total: this.bikes.length,
      time: this.roundTime,
      lives: this.lives,
      levelCode:
        camp
          ? camp.code
          : this.mode === 'survival'
            ? `W${this.survivalWave}`
            : this.mode === 'dischunt'
              ? `${this.discsCollected}/10`
              : this.mode === 'practice'
                ? 'ТРЕН'
                : this.mode === 'boss'
                  ? 'БОСС'
                  : this.mode === 'race'
                    ? `КРУГ ${this.getRaceHud()?.lap ?? 1}/${this.quick.rounds}`
                : '2Я',
      levelName: camp ? camp.name : modeLabel,
      wins: this.wins,
      losses: this.losses,
      target: this.quick.rounds,
      camera: this.cameraMode,
      bikes: bikesList,
      playerAlive: !!p && p.alive,
      playerColor: p ? p.css : NEON[this.playerColor].css,
      playerLevel: p ? p.level : 0,
      playerY: p ? p.y : 0,
      playerAirborne: p ? p.airborne : false,
      playerHeading: p ? p.angle : 0,
      powerups: {
        shield: !!p && p.shield,
        phaseLeft: p ? p.phaseTime : 0,
        multLeft: p ? p.multTime : 0,
        hasJump: !!p && p.hasJump,
        ammo: p ? p.ammo : 0,
        ammoCap: AMMO_CAP,
      },
      beatPulse: beat.beatPulse,
      kickPulse: beat.kickPulse,
      discsCollected: this.discsCollected,
      survivalWave: this.survivalWave,
      rampHint: p ? this.rampHint(p) : null,
      arenaName: this.theme.name,
      boss: runner
        ? {
            name: runner.name,
            color: runner.css,
            hp: runner.hp,
            maxHp: runner.maxHp,
            phase: runner.phase,
            charging: runner.charging,
            armor: runner.armor,
            armorMax: runner.armorMax,
          }
        : null,
      race: this.getRaceHud(),
    };
    this.cb.onHud(h);
  }

  dispose() {
    this.clearRound();
  }
}
