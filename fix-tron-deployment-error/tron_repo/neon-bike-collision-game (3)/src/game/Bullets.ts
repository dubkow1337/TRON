import * as THREE from 'three';
import { BULLET_RANGE, BULLET_SPEED } from './config';

export interface BulletTarget {
  id: number;
  alive: boolean;
  centerX: number;
  centerZ: number;
  level: number;
  kind: 'bike' | 'runner';
}

export interface BulletWorld {
  size: number;
  level: number;
  gridValueAt(cx: number, cy: number, level: number): number;
  targets(): BulletTarget[];
  /** Попадание в световой след: вернуть true, если участок пробит. */
  onTrailHit(cx: number, cy: number, level: number, x: number, z: number, ownerId: number): void;
  /** Попадание в цикл: щит/фаза/смерть обрабатываются в игре. */
  onBikeHit(targetId: number, ownerId: number, x: number, y: number, z: number): void;
  onImpact(x: number, y: number, z: number, color: THREE.Color, big: boolean): void;
}

interface BulletSlot {
  active: boolean;
  ownerId: number;
  level: number;
  color: THREE.Color;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  travelled: number;
  sparkTimer: number;
  mesh: THREE.Mesh;
  glow: THREE.Sprite;
  material: THREE.MeshBasicMaterial;
  core: THREE.MeshBasicMaterial;
}

const POOL = 28;

/**
 * Неоновые пули: летят от носа цикла, пробивают световые стены за 2 попадания,
 * убивают соперников, гасятся щитом и фазовым сдвигом.
 */
export class Bullets {
  private scene: THREE.Scene;
  private slots: BulletSlot[] = [];
  private shell: THREE.SphereGeometry;
  private glowTex: THREE.Texture;
  private tmpColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.shell = new THREE.SphereGeometry(1, 10, 8);
    this.glowTex = this.makeGlow();
    for (let i = 0; i < POOL; i++) {
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
      const mesh = new THREE.Mesh(this.shell, material);
      mesh.visible = false;
      mesh.frustumCulled = false;
      scene.add(mesh);
      const core = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.4, 2.4) });
      const glow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTex,
          color: 0xffffff,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
        }),
      );
      glow.visible = false;
      scene.add(glow);
      this.slots.push({
        active: false,
        ownerId: -1,
        level: 0,
        color: new THREE.Color(),
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        travelled: 0,
        sparkTimer: 0,
        mesh,
        glow,
        material,
        core,
      });
    }
  }

  private makeGlow(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(210,255,255,0.85)');
    grad.addColorStop(0.6, 'rgba(80,220,255,0.25)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Выстрел из носа цикла. Возвращает false, если нет свободного слота. */
  fire(ownerId: number, x: number, y: number, z: number, angle: number, color: THREE.Color, level: number) {
    const slot = this.slots.find((s) => !s.active);
    if (!slot) return false;
    const spread = (Math.random() - 0.5) * 0.02;
    slot.active = true;
    slot.ownerId = ownerId;
    slot.level = level;
    slot.color.copy(color);
    slot.x = x;
    slot.y = y;
    slot.z = z;
    slot.vx = Math.cos(angle + spread) * BULLET_SPEED;
    slot.vy = (Math.random() - 0.5) * 0.8;
    slot.vz = Math.sin(angle + spread) * BULLET_SPEED;
    slot.travelled = 0;
    slot.sparkTimer = 0;
    slot.material.color.copy(color).multiplyScalar(3.4);
    slot.core.color.copy(color).multiplyScalar(2.2);
    (slot.glow.material as THREE.SpriteMaterial).color.copy(color).multiplyScalar(2.6);
    slot.mesh.visible = true;
    slot.glow.visible = true;
    slot.mesh.position.set(x, y, z);
    slot.glow.position.set(x, y, z);
    return true;
  }

  /** Шаг симуляции пуль. Вызывается с фиксированным тиком. */
  update(dt: number, world: BulletWorld) {
    const half = world.size / 2;
    for (const slot of this.slots) {
      if (!slot.active) continue;
      // Подшаги, чтобы пуля не «перепрыгивала» клетки на высокой скорости.
      const dist = Math.hypot(slot.vx, slot.vy, slot.vz) * dt;
      const steps = Math.max(1, Math.ceil(dist / 0.75));
      const sdt = dt / steps;
      for (let k = 0; k < steps && slot.active; k++) {
        slot.x += slot.vx * sdt;
        slot.y += slot.vy * sdt;
        slot.z += slot.vz * sdt;
        slot.travelled += Math.hypot(slot.vx, slot.vy, slot.vz) * sdt;

        // Граница арены
        if (Math.abs(slot.x) > half - 0.4 || Math.abs(slot.z) > half - 0.4 || slot.travelled > BULLET_RANGE) {
          this.explode(slot, world, false);
          break;
        }

        // Попадание в цикл
        let hitBike = -1;
        for (const target of world.targets()) {
          if (!target.alive || target.level !== slot.level || target.id === slot.ownerId) continue;
          const r = target.kind === 'runner' ? 2.9 : 1.65;
          if (Math.hypot(slot.x - target.centerX, slot.z - target.centerZ) < r) {
            hitBike = target.id;
            break;
          }
        }
        if (hitBike >= 0) {
          world.onBikeHit(hitBike, slot.ownerId, slot.x, slot.y, slot.z);
          this.explode(slot, world, true);
          break;
        }

        // Попадание в световую стену: проверяем ячейку прямо перед пулей и по радиусу 0.75 клетки
        const cx = Math.floor(slot.x + half);
        const cy = Math.floor(slot.z + half);
        let cell = world.gridValueAt(cx, cy, slot.level);
        let hitX = slot.x;
        let hitZ = slot.z;
        let hitCx = cx;
        let hitCy = cy;

        // Если ровно в центре свободно, но задета кромка стены — находим ближайшую стену
        if (cell === 0) {
          for (const [ox, oz] of [[-0.45, 0], [0.45, 0], [0, -0.45], [0, 0.45]]) {
            const scx = Math.floor(slot.x + ox + half);
            const scy = Math.floor(slot.z + oz + half);
            const scell = world.gridValueAt(scx, scy, slot.level);
            if (scell !== 0 && scell !== 255) {
              cell = scell;
              hitCx = scx;
              hitCy = scy;
              hitX = slot.x + ox;
              hitZ = slot.z + oz;
              break;
            }
          }
        }

        if (cell !== 0 && cell !== 255) {
          world.onTrailHit(hitCx, hitCy, slot.level, hitX, hitZ, slot.ownerId);
          this.explode(slot, world, true);
          break;
        }
      }
    }
  }

  private explode(slot: BulletSlot, world: BulletWorld, big: boolean) {
    slot.active = false;
    slot.mesh.visible = false;
    slot.glow.visible = false;
    this.tmpColor.copy(slot.color);
    world.onImpact(slot.x, slot.y, slot.z, this.tmpColor, big);
  }

  /** Визуальная синхронизация: вытянутые неоновые пули и лёгкий дымный след. */
  syncVisual() {
    for (const slot of this.slots) {
      if (!slot.active) continue;
      slot.mesh.position.set(slot.x, slot.y, slot.z);
      slot.mesh.scale.set(2.6, 0.42, 0.42);
      slot.mesh.rotation.y = -Math.atan2(slot.vz, slot.vx);
      slot.glow.position.set(slot.x, slot.y, slot.z);
      slot.glow.scale.set(1.8, 1.8, 1.8);
    }
  }

  /** Количество активных пуль. */
  get count() {
    return this.slots.reduce((n, s) => n + (s.active ? 1 : 0), 0);
  }

  clear() {
    for (const slot of this.slots) {
      slot.active = false;
      slot.mesh.visible = false;
      slot.glow.visible = false;
    }
  }

  dispose() {
    for (const slot of this.slots) {
      this.scene.remove(slot.mesh);
      this.scene.remove(slot.glow);
      slot.material.dispose();
      slot.core.dispose();
      (slot.glow.material as THREE.SpriteMaterial).dispose();
    }
    this.shell.dispose();
    this.glowTex.dispose();
  }
}
