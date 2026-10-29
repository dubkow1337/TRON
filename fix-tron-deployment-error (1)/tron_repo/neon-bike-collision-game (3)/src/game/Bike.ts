import * as THREE from 'three';
import {
  BASE_SPEED,
  BIKE_LEN,
  GRAVITY,
  LEVEL_HEIGHT,
  MIN_TURN_RATE,
  MAX_TURN_RATE,
  NEON,
  PATH_SPACING,
  PATH_SPACING_TURN,
  TURN_RADIUS,
  type ColorKey,
} from './config';
import { createBikeModel, type BikeModel, WHEEL_R } from './BikeModel';
import { Trail } from './Trail';
import type { AIController } from './AI';

export interface BikeOptions {
  id: number;
  name: string;
  colorKey: ColorKey;
  isPlayer: boolean;
  ai: AIController | null;
  boss?: boolean;
}

const TAU = Math.PI * 2;

function angDiff(a: number, b: number) {
  let d = a - b;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

/**
 * Светоцикл с непрерывным движением и плавным рулением:
 * направление доворачивается к ближайшей оси по дуге постоянного радиуса,
 * а не переключается рывком на 90°. Световая стена — 3D-полилиния.
 */
export class Bike {
  id: number;
  name: string;
  colorKey: ColorKey;
  color: THREE.Color;
  css: string;
  isPlayer: boolean;
  ai: AIController | null;
  autopilot: AIController | null = null;
  boss: boolean;
  /** Тип техники: лёгкий цикл или тяжёлый внедорожник. */
  kind: 'bike' | 'runner' = 'bike';
  /** Длина корпуса (нос — точка выхода стены). */
  bodyLen = BIKE_LEN;
  /** Множитель ширины световой стены. */
  trailWidth = 1;
  /** Множитель радиуса поворота (тяжёлая техника поворачивает шире). */
  turnRadiusFactor = 1;
  /** Лимит угловой скорости. */
  maxTurnRate = MAX_TURN_RATE;
  /** Защитное окно после тарана/урона (сек). */
  guardT = 0;
  /** Ограничение длины светового следа (в метрах): 0 = вечная стена, >0 = динамический хвост для гонок. */
  trailLimit = 0;
  /** Неоновые патроны для стрельбы. */
  ammo = 0;
  /** Перезарядка выстрела (сек). */
  shootCd = 0;

  // ── непрерывное состояние ──
  px = 0; // позиция носа (мир)
  pz = 0;
  py = 0;
  angle = 0; // текущий курс (рад)
  targetIdx = 0; // целевая ось (0..3) → targetIdx * 90°
  turnQueue: number[] = [];
  angVel = 0; // фактическая угловая скорость (для крена)
  turnProgress = 0; // 0..1 — завершённость поворота

  // ── клетка ──
  cx = 0;
  cy = 0;
  level = 0; // 0 — пол, 1 — эстакада
  half = 90;

  // ── движение ──
  speed = 0;
  moving = false;
  alive = true;
  invulnerable = false;
  boost = 1;
  boosting = false;
  boostLock = false;
  braking = false;
  grind = 0;
  grindTarget = 0;
  grindSide = 0;

  // ── вертикаль ──
  y = 0;
  vy = 0;
  jumping = false;
  surfaceY = 0;
  airGap = 0;

  // ── бонусы ──
  shield = false;
  phaseTime = 0;
  multTime = 0;
  hasJump = false;

  // ── световая стена ──
  path: number[] = []; // [x,y,z, ...]
  pathAcc = 0;
  tailSeg = 0;
  tailX = 0;
  tailY = 0;
  tailZ = 0;
  cells: number[] = [];
  mapPts: number[] = []; // [x,z, ...] для миникарты

  // ── прочее ──
  kills = 0;
  deathTime = -1;
  collapse = 1;
  cleared = false;
  rez = 0;
  rezDelay = 0;
  turnFlash = 0;
  visualHeading = 0;
  lean = 0;
  pitch = 0;
  centerX = 0;
  centerZ = 0;

  model: BikeModel;
  trail: Trail;
  shieldMesh: THREE.Mesh;

  constructor(o: BikeOptions) {
    this.id = o.id;
    this.name = o.name;
    this.colorKey = o.colorKey;
    this.color = new THREE.Color(NEON[o.colorKey].hex);
    this.css = NEON[o.colorKey].css;
    this.isPlayer = o.isPlayer;
    this.ai = o.ai;
    this.boss = !!o.boss;
    this.model = createBikeModel(this.color);
    this.trail = new Trail(this.color);
    if (this.isPlayer) {
      this.trail.mat.uniforms.uFade.value.set(2.2, 12.0);
      this.trail.mat.uniforms.uPlayer.value = 1;
    }

    const sGeo = new THREE.IcosahedronGeometry(1.55, 1);
    const sMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.18, 0.85, 0.5),
      wireframe: true,
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.shieldMesh = new THREE.Mesh(sGeo, sMat);
    this.shieldMesh.position.set(1.3, 0.75, 0);
    this.shieldMesh.visible = false;
    this.model.tilt.add(this.shieldMesh);
  }

  /** Текущая ось курса (0:+X, 1:+Z, 2:-X, 3:-Z) — для ИИ и прогнозов. */
  get dir() {
    return this.targetIdx;
  }

  get frontX() {
    return this.px;
  }

  get frontZ() {
    return this.pz;
  }

  get frontY() {
    return this.py;
  }

  get heading() {
    return this.angle;
  }

  get isRunner() {
    return this.kind === 'runner';
  }

  /** Неуязвимость + защитное окно. */
  get guarded() {
    return this.invulnerable || this.guardT > 0;
  }

  get targetAngle() {
    return (this.targetIdx * Math.PI) / 2;
  }

  get turnRemaining() {
    return Math.abs(angDiff(this.targetAngle, this.angle));
  }

  get isTurning() {
    return this.turnRemaining > 0.015;
  }

  get airborne() {
    return this.jumping || this.airGap > 0.45;
  }

  queueTurn(d: number) {
    if (this.turnQueue.length >= 2) return;
    this.turnQueue.push(d);
  }

  /**
   * Автодоводка курса (помощь при заезде на пандус).
   * Мягко поворачивает цикл к целевому углу, не мешая вводу игрока:
   * очередь команд имеет приоритет, доводка работает только на свободном курсе.
   */
  assistToward(targetAngle: number, rate: number, dt: number) {
    if (this.turnQueue.length || this.isTurning) return false;
    const d = angDiff(targetAngle, this.angle);
    if (Math.abs(d) < 0.02) return false;
    const step = Math.sign(d) * Math.min(Math.abs(d), rate * dt);
    this.angle += step;
    this.angVel = step / Math.max(dt, 1e-5);
    return true;
  }

  cellOf(v: number) {
    return Math.floor(v + this.half);
  }

  spawn(px: number, pz: number, dirIdx: number, level: number, size: number, initialAngle?: number) {
    this.half = size / 2;
    this.px = px;
    this.pz = pz;
    this.py = level === 1 ? LEVEL_HEIGHT : 0;
    this.y = this.py;
    this.surfaceY = this.py;
    this.vy = 0;
    this.jumping = false;
    this.airGap = 0;
    this.targetIdx = ((dirIdx % 4) + 4) & 3;
    this.angle = initialAngle !== undefined ? initialAngle : this.targetAngle;
    this.visualHeading = this.angle;
    this.turnQueue.length = 0;
    this.angVel = 0;
    this.turnProgress = 0;
    this.level = level;
    this.speed = 0;
    this.alive = true;
    this.moving = false;
    this.boost = 1;
    this.boosting = false;
    this.boostLock = false;
    this.braking = false;
    this.shield = false;
    this.phaseTime = 0;
    this.multTime = 0;
    this.hasJump = false;
    this.cx = this.cellOf(px);
    this.cy = this.cellOf(pz);
    this.collapse = 1;
    this.cleared = false;

    // путь стартует ПОЗАДИ корпуса: хвост инициализируется строго по курсу
    const bx = Math.cos(this.angle);
    const bz = Math.sin(this.angle);
    this.tailX = px - bx * this.bodyLen;
    this.tailY = this.y;
    this.tailZ = pz - bz * this.bodyLen;
    this.tailSeg = 0;
    this.path = [this.tailX, this.tailY, this.tailZ];
    this.pathAcc = 0;
    this.mapPts = [this.tailX, this.tailZ];
    this.cells = [];
    this.updateDerived();
    this.trail.finalized = 0;
    this.trail.mesh.count = 0;
    this.trail.clearBreaches();
    this.trail.mat.uniforms.uCollapse.value = 1;
  }

  /** Плавный доворот курса к целевой оси. Возвращает угловую скорость. */
  updateTurn(dt: number) {
    // берём следующую команду только когда текущий поворот завершён
    if (!this.isTurning && this.turnQueue.length) {
      const d = this.turnQueue.shift()!;
      this.targetIdx = (((this.targetIdx + d) % 4) + 4) & 3;
    }
    const rem = this.turnRemaining;
    const dirSign = Math.sign(angDiff(this.targetAngle, this.angle));
    // угловая скорость из радиуса поворота — как у настоящего мотоцикла
    let rate = this.speed > 0.5 ? this.speed / (TURN_RADIUS * this.turnRadiusFactor) : MIN_TURN_RATE;
    rate = Math.max(MIN_TURN_RATE, Math.min(this.maxTurnRate, rate));
    const maxStep = rate * dt;
    const step = Math.min(rem, maxStep);
    if (rem > 1e-6) this.angle += dirSign * step;
    this.angVel = rem > 1e-6 ? dirSign * (step / Math.max(dt, 1e-5)) : 0;
    this.turnProgress = 1 - rem / (Math.PI / 2);
    return this.angVel;
  }

  updateSteering(dt: number, steering: number) {
    const maxRate = THREE.MathUtils.clamp(
      this.speed / (TURN_RADIUS * this.turnRadiusFactor),
      MIN_TURN_RATE,
      this.maxTurnRate,
    );
    const desired = THREE.MathUtils.clamp(steering, -1, 1) * maxRate;
    this.angVel += (desired - this.angVel) * (1 - Math.exp(-dt * 9));
    if (steering === 0 && Math.abs(this.angVel) < 0.002) this.angVel = 0;
    this.angle += this.angVel * dt;
    this.targetIdx = ((Math.round(this.angle / (Math.PI / 2)) % 4) + 4) % 4;
  }

  /** Продвижение носа вперёд по курсу. */
  advance(dt: number) {
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    this.px += c * this.speed * dt;
    this.pz += s * this.speed * dt;
  }

  updateDerived() {
    this.cx = this.cellOf(this.px);
    this.cy = this.cellOf(this.pz);
    this.centerX = this.px - Math.cos(this.angle) * this.bodyLen * 0.45;
    this.centerZ = this.pz - Math.sin(this.angle) * this.bodyLen * 0.45;
  }

  /** Добавить точку в полилинию стены, если накоплена достаточная дистанция. */
  pushPath(force = false) {
    const n = this.path.length;
    const lx = this.path[n - 3];
    const lz = this.path[n - 1];
    const d = Math.hypot(this.px - lx, this.pz - lz);
    const spacing = Math.abs(this.angVel) > 0.4 ? PATH_SPACING_TURN : PATH_SPACING;
    if (force || d >= spacing) {
      this.path.push(this.px, this.y, this.pz);
      this.pathAcc = 0;

      // В режиме гонки: след имеет конечную длину и плавно тает сзади!
      if (this.trailLimit > 0 && this.path.length > 15) {
        let totalLen = 0;
        for (let i = 0; i < this.path.length - 3; i += 3) {
          totalLen += Math.hypot(this.path[i + 3] - this.path[i], this.path[i + 5] - this.path[i + 2]);
        }
        while (totalLen > this.trailLimit + 3.0 && this.path.length > 18) {
          const segLen = Math.hypot(this.path[3] - this.path[0], this.path[5] - this.path[2]);
          this.path.splice(0, 3);
          totalLen -= segLen;
          this.trail.resetFinalized();
        }
      }
    }
    const mn = this.mapPts.length;
    if (Math.hypot(this.px - this.mapPts[mn - 2], this.pz - this.mapPts[mn - 1]) > 3.5) {
      this.mapPts.push(this.px, this.pz);
      const maxMapPts = this.trailLimit > 0 ? 16 : 3 * 900;
      if (this.mapPts.length > maxMapPts) this.mapPts.splice(0, 2);
    }
  }

  /** Хвост стены — точка на пути на расстоянии длины корпуса позади носа. */
  computeTail() {
    let rem = this.bodyLen;
    let ax = this.px;
    let ay = this.py;
    let az = this.pz;
    const p = this.path;
    let i = p.length / 3 - 1;
    while (i >= 0) {
      const bx = p[i * 3];
      const by = p[i * 3 + 1];
      const bz = p[i * 3 + 2];
      const d = Math.hypot(ax - bx, ay - by, az - bz);
      if (d >= rem) {
        const t = d > 1e-6 ? rem / d : 0;
        this.tailX = ax + (bx - ax) * t;
        this.tailY = ay + (by - ay) * t;
        this.tailZ = az + (bz - az) * t;
        this.tailSeg = i;
        return;
      }
      rem -= d;
      ax = bx;
      ay = by;
      az = bz;
      i--;
    }
    this.tailX = p[0];
    this.tailY = p[1];
    this.tailZ = p[2];
    this.tailSeg = 0;
  }

  jump(vel: number) {
    if (this.jumping) return;
    this.jumping = true;
    this.vy = vel;
    this.turnFlash = 1;
    this.pushPath(true);
  }

  /** Вертикальная физика: прыжок, плавный подъём по пандусу, падение с эстакады. */
  updateVertical(dt: number, surface: number) {
    this.surfaceY = surface;
    if (this.jumping) {
      this.vy -= GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y <= surface) {
        this.y = surface;
        this.vy = 0;
        this.jumping = false;
        this.py = this.y;
        this.airGap = 0;
        this.level = surface >= LEVEL_HEIGHT * 0.5 ? 1 : 0;
        this.pushPath(true);
        return true; // приземление
      }
    } else {
      // подъём быстрее, чем падение — так заезд ощущается управляемым
      const rising = surface > this.y + 0.01;
      const k = rising ? 11 : 5.5;
      this.y += (surface - this.y) * Math.min(1, dt * k);
      if (Math.abs(surface - this.y) < 0.004) this.y = surface;
    }
    this.py = this.y;
    this.airGap = this.y - surface;
    // Уровень = на какой поверхности стоим. На пандусе это даёт плавный переход:
    // до середины подъёма считаемся на нижнем ярусе, выше — на верхнем.
    this.level = surface >= LEVEL_HEIGHT * 0.5 ? 1 : 0;
    return false;
  }

  syncVisual(dt: number, time: number) {
    const m = this.model;
    if (!this.alive) {
      m.root.visible = false;
      return;
    }
    this.computeTail();

    // плавное визуальное вращение корпуса (без рывка при резком довороте)
    let dh = angDiff(this.angle, this.visualHeading);
    this.visualHeading += dh * Math.min(1, dt * 16);

    // крен в повороте пропорционален угловой скорости и скорости хода
    const leanTarget = THREE.MathUtils.clamp((this.angVel * this.speed) * 0.0125, -0.62, 0.62);
    this.lean += (leanTarget - this.lean) * Math.min(1, dt * 9);

    const jumpPitch = this.jumping ? THREE.MathUtils.clamp(this.vy * 0.028, -0.4, 0.4) : this.airGap > 0.45 ? -0.12 : 0;
    const pitchTarget = jumpPitch + (this.boosting ? 0.03 : this.braking ? -0.02 : 0);
    this.pitch += (pitchTarget - this.pitch) * Math.min(1, dt * 7);

    if (this.rezDelay > 0) this.rezDelay -= dt;
    else if (this.rez < 1) this.rez = Math.min(1, this.rez + dt * 1.7);

    m.root.visible = this.rez > 0.001;
    m.root.position.set(this.tailX, this.tailY, this.tailZ);
    m.root.rotation.y = -this.visualHeading;
    m.tilt.rotation.x = this.lean;
    m.tilt.rotation.z = this.pitch;

    const r = this.rez;
    const e = r < 1 ? 1 - Math.pow(1 - r, 3) : 1;
    m.tilt.scale.set(1, e, 1);

    const spin = (this.speed * dt) / WHEEL_R;
    for (const w of m.wheels) w.rotation.z -= spin;

    // фазовый сдвиг — голографическое мерцание
    if (this.phaseTime > 0) {
      const f = 0.45 + 0.55 * Math.abs(Math.sin(time * 22));
      m.glowMat.transparent = true;
      m.glowMat.opacity = f;
      m.bodyMat.transparent = true;
      m.bodyMat.opacity = 0.45 * f;
    } else {
      m.glowMat.transparent = false;
      m.glowMat.opacity = 1;
      m.bodyMat.transparent = false;
      m.bodyMat.opacity = 1;
    }

    this.shieldMesh.visible = this.shield;
    if (this.shield) {
      this.shieldMesh.rotation.y += dt * 2.2;
      this.shieldMesh.rotation.x += dt * 1.4;
      (this.shieldMesh.material as THREE.MeshBasicMaterial).opacity = 0.16 + 0.08 * Math.sin(time * 6);
    }

    const speedN = this.speed / BASE_SPEED;
    const glowK =
      (this.boosting ? 1.4 : 1) * (0.92 + 0.08 * Math.sin(time * 8 + this.id)) +
      (1 - e) * 2.4 +
      this.turnFlash * 0.5 +
      this.grind * 0.2;
    m.glowMat.color.copy(m.baseGlow).multiplyScalar(glowK);
    m.bodyMat.emissiveIntensity = 0.03 + (this.boosting ? 0.035 : 0) + speedN * 0.01;
    if (this.turnFlash > 0) this.turnFlash = Math.max(0, this.turnFlash - dt * 4);

    if (this.moving && this.path.length > 3) {
      this.trail.sync(this.path, this.tailSeg, this.tailX, this.tailY, this.tailZ);
      this.trail.reapplyBreaches();
    } else if (!this.moving && this.trail.mesh.count > 0 && this.collapse <= 0.001) {
      this.trail.mesh.count = 0;
    }
    const u = this.trail.mat.uniforms;
    u.uTail.value.set(this.tailX, this.tailY, this.tailZ);
    u.uTime.value = time;
  }

  dispose() {
    this.model.dispose();
    this.trail.dispose();
  }
}
