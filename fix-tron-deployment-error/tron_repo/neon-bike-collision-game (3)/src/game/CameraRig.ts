import * as THREE from 'three';
import type { CamMode } from './types';

export interface ChaseTarget {
  frontX: number;
  frontZ: number;
  centerX: number;
  centerZ: number;
  y: number;
  heading: number;
  speed: number;
  boosting: boolean;
  alive: boolean;
}

type Shot =
  | { kind: 'chase'; target: ChaseTarget }
  | { kind: 'orbit'; cx: number; cz: number; r: number; h: number; speed: number; lookH: number; follow: ChaseTarget | null }
  | { kind: 'static'; pos: THREE.Vector3; look: THREE.Vector3 };

function easeInOut(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Кинематографичная камера:
 * Плавное слежение за светоциклом БЕЗ резких разворотов,
 * мягкое гашение угловой скорости, поддержка ярусов (высоты) и прыжков.
 */
export class CameraRig {
  camera: THREE.PerspectiveCamera;
  mode: CamMode = 'smooth';
  fovBase = 70;
  shakeEnabled = true;
  camSmooth = true; // включён режим кино-плавности
  private shot: Shot = { kind: 'static', pos: new THREE.Vector3(0, 40, 90), look: new THREE.Vector3() };
  private pos = new THREE.Vector3(0, 40, 90);
  private look = new THREE.Vector3();
  private up = new THREE.Vector3(0, 1, 0);
  private fromPos = new THREE.Vector3();
  private fromLook = new THREE.Vector3();
  private fromUp = new THREE.Vector3(0, 1, 0);
  private blend = 1;
  private blendDur = 1;
  private yaw = 0;
  private yawInit = false;
  private smoothY = 0;
  private orbitAngle = 0;
  private trauma = 0;
  private time = 0;
  private fov = 70;
  private dPos = new THREE.Vector3();
  private dLook = new THREE.Vector3();
  private dUp = new THREE.Vector3(0, 1, 0);
  speedN = 0;
  /** Extra distance for the camera (used by the wide race circuit). */
  distanceBoost = 0;
  heightBoost = 0;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  private begin(blendDur: number) {
    this.fromPos.copy(this.pos);
    this.fromLook.copy(this.look);
    this.fromUp.copy(this.up);
    this.blend = blendDur > 0 ? 0 : 1;
    this.blendDur = Math.max(0.0001, blendDur);
  }

  chase(target: ChaseTarget, blendDur = 0.6, snapYaw = false) {
    this.begin(blendDur);
    this.shot = { kind: 'chase', target };
    if (snapYaw || !this.yawInit) {
      this.yaw = target.heading;
      this.smoothY = target.y || 0;
      this.yawInit = true;
    }
  }

  orbit(cx: number, cz: number, r: number, h: number, speed: number, blendDur = 1, follow: ChaseTarget | null = null, lookH = 1) {
    this.begin(blendDur);
    this.orbitAngle = Math.atan2(this.pos.z - cz, this.pos.x - cx);
    this.shot = { kind: 'orbit', cx, cz, r, h, speed, lookH, follow };
  }

  snapTo(pos: THREE.Vector3, look: THREE.Vector3) {
    this.pos.copy(pos);
    this.look.copy(look);
    this.shot = { kind: 'static', pos: pos.clone(), look: look.clone() };
    this.blend = 1;
  }

  addTrauma(v: number) {
    if (!this.shakeEnabled) return;
    this.trauma = Math.min(1, this.trauma + v);
  }

  get isChasing() {
    return this.shot.kind === 'chase';
  }

  private chasePose(t: ChaseTarget, dt: number) {
    let d = t.heading - this.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;

    // Follow the real bike heading without letting the camera drift to its side.
    const rate = this.mode === 'cockpit' ? 14 : this.camSmooth ? 9 : 13;
    this.yaw += d * (1 - Math.exp(-dt * rate));
    let lag = t.heading - this.yaw;
    while (lag > Math.PI) lag -= Math.PI * 2;
    while (lag < -Math.PI) lag += Math.PI * 2;
    const maxLag = this.mode === 'top' ? 0.6 : 0.38;
    if (Math.abs(lag) > maxLag) this.yaw += lag - Math.sign(lag) * maxLag;

    // Мягкое отслеживание высоты (прыжки, второй ярус)
    const targetY = t.y || 0;
    this.smoothY += (targetY - this.smoothY) * Math.min(1, dt * 6.5);

    const fx = Math.cos(this.yaw);
    const fz = Math.sin(this.yaw);
    const bx = t.centerX;
    const bz = t.centerZ;
    const by = this.smoothY;
    const boostPull = t.boosting ? 1.0 : 0;
    this.dUp.set(0, 1, 0);

    switch (this.mode) {
      case 'far': {
        const dist = 13 + boostPull * 1.4 + this.distanceBoost;
        this.dPos.set(bx - fx * dist, by + 7.0 + this.heightBoost, bz - fz * dist);
        this.dLook.set(bx + fx * 8.0, by + 0.8, bz + fz * 8.0);
        break;
      }
      case 'cockpit': {
        this.dPos.set(bx - fx * 0.45, by + 1.55, bz - fz * 0.45);
        this.dLook.set(bx + fx * 14.0, by + 1.1, bz + fz * 14.0);
        break;
      }
      case 'top': {
        this.dPos.set(bx - fx * 6, by + 56, bz - fz * 6);
        this.dLook.set(bx + fx * 8, by, bz + fz * 8);
        this.dUp.set(fx, 0, fz);
        break;
      }
      case 'smooth':
      default: {
        const dist = 8.4 + boostPull * 0.6 + this.distanceBoost;
        const height = 4.1 + boostPull * 0.12 + this.heightBoost;
        this.dPos.set(bx - fx * dist - fz * 0.5, by + height, bz - fz * dist + fx * 0.5);
        this.dLook.set(bx + fx * (7 + this.distanceBoost * 0.7), by + 0.9, bz + fz * (7 + this.distanceBoost * 0.7));
      }
    }
  }

  update(dt: number) {
    this.time += dt;
    const s = this.shot;
    if (s.kind === 'chase') {
      this.chasePose(s.target, dt);
    } else if (s.kind === 'orbit') {
      this.orbitAngle += dt * s.speed;
      let cx = s.cx;
      let cz = s.cz;
      let cy = 0;
      if (s.follow && s.follow.alive) {
        cx = s.follow.centerX;
        cz = s.follow.centerZ;
        cy = s.follow.y || 0;
        s.cx = cx;
        s.cz = cz;
      }
      this.dPos.set(cx + Math.cos(this.orbitAngle) * s.r, cy + s.h, cz + Math.sin(this.orbitAngle) * s.r);
      this.dLook.set(cx, cy + s.lookH, cz);
      this.dUp.set(0, 1, 0);
    } else {
      this.dPos.copy(s.pos);
      this.dLook.copy(s.look);
      this.dUp.set(0, 1, 0);
    }

    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / this.blendDur);
      const k = easeInOut(this.blend);
      this.pos.lerpVectors(this.fromPos, this.dPos, k);
      this.look.lerpVectors(this.fromLook, this.dLook, k);
      this.up.lerpVectors(this.fromUp, this.dUp, k).normalize();
    } else {
      // X/Z stay anchored to the moving bike; yaw and height are smoothed above.
      this.pos.copy(this.dPos);
      this.look.copy(this.dLook);
      this.up.copy(this.dUp);
    }

    // Тряска (при взрывах или дрифте)
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    const sh = this.trauma * this.trauma;
    const t = this.time;
    const ox = (Math.sin(t * 37.1) + Math.sin(t * 61.7) * 0.5) * sh * 0.22;
    const oy = (Math.sin(t * 43.3) + Math.sin(t * 71.9) * 0.5) * sh * 0.18;
    const oz = (Math.sin(t * 29.3) + Math.sin(t * 53.1) * 0.5) * sh * 0.22;
    const hum = this.speedN > 1.2 && this.shakeEnabled ? (this.speedN - 1.2) * 0.015 : 0;

    this.camera.position.set(
      this.pos.x + ox + Math.sin(t * 90) * hum,
      Math.max(0.3, this.pos.y + oy + Math.sin(t * 77) * hum),
      this.pos.z + oz,
    );
    this.camera.up.copy(this.up);
    this.camera.lookAt(this.look);
    if (sh > 0.001) this.camera.rotateZ(Math.sin(t * 23.7) * sh * 0.015);

    const targetFov = this.fovBase + Math.max(0, this.speedN - 1) * 10 + (this.mode === 'cockpit' ? 6 : 0);
    this.fov += (targetFov - this.fov) * Math.min(1, dt * 4);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
