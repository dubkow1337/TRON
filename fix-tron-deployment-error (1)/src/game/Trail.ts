import * as THREE from 'three';
import { trailFragment, trailVertex } from './shaders';
import { WALL_HEIGHT, WALL_THICK } from './config';

let boxGeo: THREE.BoxGeometry | null = null;

/**
 * Световая стена одного цикла в 3D (поддержка ярусов, пандусов и прыжков):
 * InstancedMesh из сегментов, расположенных между точками (x, y, z).
 */
export class Trail {
  mesh: THREE.InstancedMesh;
  mat: THREE.ShaderMaterial;
  finalized = 0;
  /** Множитель толщины стены (босс-внедорожник оставляет широкую стену). */
  width = 1;
  /** Мировые координаты (x,z) готовых сегментов — для локального пробоя следа. */
  private segXZ: number[] = [];
  /** Пробитые бреши: координаты центра и радиуса каждой дыры. */
  private breaches: { x: number; z: number; r2: number }[] = [];
  private capacity: number;
  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  private dir = new THREE.Vector3();
  private unitX = new THREE.Vector3(1, 0, 0);

  constructor(color: THREE.Color, capacity = 8000) {
    if (!boxGeo) {
      boxGeo = new THREE.BoxGeometry(1, 1, 1);
      boxGeo.translate(0, 0.5, 0);
    }
    this.capacity = capacity;
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: color.clone() },
        uTime: { value: 0 },
        uIntensity: { value: 1 },
        uTail: { value: new THREE.Vector3() },
        uCollapse: { value: 1 },
        uHeight: { value: WALL_HEIGHT },
        uActive: { value: 0 },
        uFade: { value: new THREE.Vector2(0.8, 4.5) },
        uPlayer: { value: 0 },
        uMaxTrailDist: { value: 99999.0 },
      },
      vertexShader: trailVertex,
      fragmentShader: trailFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.InstancedMesh(boxGeo, this.mat, capacity);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.renderOrder = 2;
  }

  private isBreached(px: number, pz: number): boolean {
    for (let k = 0; k < this.breaches.length; k++) {
      const b = this.breaches[k];
      const dx = px - b.x;
      const dz = pz - b.z;
      if (dx * dx + dz * dz <= b.r2) return true;
    }
    return false;
  }

  private write(i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const midX = (ax + bx) / 2;
    const midZ = (az + bz) / 2;
    this.p.set(midX, (ay + by) / 2, midZ);

    // Если сегмент находится в зоне пробитой дыры или слишком короток — делаем невидимым (масштаб 0)
    if (len < 0.02 || this.isBreached(midX, midZ) || this.isBreached(ax, az) || this.isBreached(bx, bz)) {
      this.s.set(0, 0, 0);
      this.q.identity();
    } else {
      this.dir.set(dx, dy, dz).normalize();
      this.q.setFromUnitVectors(this.unitX, this.dir);
      this.s.set(len + WALL_THICK * this.width, 1, WALL_THICK * this.width);
    }

    this.m4.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m4);
    this.mesh.instanceMatrix.addUpdateRange(i * 16, 16);
  }

  /** corners — плоский массив [x0,y0,z0, x1,y1,z1, ...]; хвост лежит на сегменте с индексом tailSeg. */
  sync(corners: number[], tailSeg: number, tx: number, ty: number, tz: number) {
    while (this.finalized < tailSeg && this.finalized < this.capacity - 2) {
      const i = this.finalized;
      const i3 = i * 3;
      this.write(
        i,
        corners[i3],
        corners[i3 + 1],
        corners[i3 + 2],
        corners[i3 + 3],
        corners[i3 + 4],
        corners[i3 + 5],
      );
      this.finalized++;
    }
    const i = this.finalized;
    const i3 = i * 3;
    if (i3 + 2 < corners.length) {
      this.write(i, corners[i3], corners[i3 + 1], corners[i3 + 2], tx, ty, tz);
      this.segXZ[i * 2] = corners[i3];
      this.segXZ[i * 2 + 1] = corners[i3 + 2];
      this.mesh.count = i + 1;
      this.mat.uniforms.uActive.value = i;
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  resetFinalized() {
    this.finalized = 0;
    this.segXZ.length = 0;
  }

  clearBreaches() {
    this.breaches.length = 0;
  }

  /** Выбить дыру в световой стене: регистрирует брешь и сразу переписывает задетые сегменты. */
  breach(x: number, z: number, radius: number) {
    const rEff = radius * 1.35;
    const r2 = rEff * rEff;
    this.breaches.push({ x, z, r2 });

    // Мгновенно скрываем все сегменты в радиусе дыры
    let changed = false;
    for (let i = 0; i < this.finalized; i++) {
      const sx = this.segXZ[i * 2];
      const sz = this.segXZ[i * 2 + 1];
      const dx = sx - x;
      const dz = sz - z;
      if (dx * dx + dz * dz <= r2) {
        this.m4.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m4);
        this.mesh.instanceMatrix.addUpdateRange(i * 16, 16);
        changed = true;
      }
    }
    if (changed) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Полная перепроверка и перерисовка стены: гарантирует, что все сегменты
   * в зоне пробитых дыр скрыты, а края бреши четко видны.
   */
  reapplyBreaches() {
    if (!this.breaches.length || !this.finalized) return;
    let changed = false;
    for (let i = 0; i < this.finalized; i++) {
      const sx = this.segXZ[i * 2];
      const sz = this.segXZ[i * 2 + 1];
      if (this.isBreached(sx, sz)) {
        this.m4.makeScale(0, 0, 0);
        this.mesh.setMatrixAt(i, this.m4);
        this.mesh.instanceMatrix.addUpdateRange(i * 16, 16);
        changed = true;
      }
    }
    if (changed) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose() {
    this.mat.dispose();
    this.mesh.dispose();
  }
}
