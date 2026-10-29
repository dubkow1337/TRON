import * as THREE from 'three';
import type { ArenaTheme } from './arenas';

export interface RacePose {
  x: number;
  z: number;
  heading: number;
  theta: number;
  distance: number;
  nx: number;
  nz: number;
}

export interface RaceProjection extends RacePose {
  lateral: number;
  offRoad: number;
}

export interface RaceObstacle {
  distance: number;
  lane: number;
  radius: number;
  color: number;
  group: THREE.Group;
}

export interface RaceGate {
  distance: number;
  label: string;
}

/** Surface stripe pattern for the ribbon road. */
function roadTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    // Deep glossy road surface, clearly different from the arena floor.
    const grad = ctx.createLinearGradient(0, 0, 512, 0);
    grad.addColorStop(0, '#0d1d29');
    grad.addColorStop(0.5, '#102634');
    grad.addColorStop(1, '#0d1d29');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 512; i += 3) {
      ctx.fillStyle = i % 9 === 0 ? 'rgba(60,140,170,0.16)' : 'rgba(20,55,72,0.12)';
      ctx.fillRect(0, i, 512, 1);
    }
    // Bright edge lanes (outer glow).
    ctx.fillStyle = '#e9feff';
    ctx.fillRect(3, 0, 5, 512);
    ctx.fillRect(504, 0, 5, 512);
    ctx.fillStyle = 'rgba(120,244,255,0.35)';
    ctx.fillRect(8, 0, 14, 512);
    ctx.fillRect(490, 0, 14, 512);
    // Lane separators.
    for (let lane = 1; lane <= 6; lane++) {
      const x = (lane / 7) * 512;
      const center = lane === 3;
      ctx.fillStyle = center ? 'rgba(255,214,110,0.95)' : 'rgba(180,248,255,0.55)';
      const len = center ? 52 : 30;
      const step = center ? 84 : 96;
      for (let y = 0; y < 512; y += step) ctx.fillRect(x - (center ? 2 : 1.2), y, center ? 4 : 2.4, len);
    }
    // Direction chevrons.
    ctx.strokeStyle = 'rgba(120,240,255,0.5)';
    ctx.lineWidth = 5;
    for (let lane = 0; lane < 7; lane++) {
      const x = ((lane + 0.5) / 7) * 512;
      for (let y = 12; y < 512; y += 110) {
        ctx.beginPath();
        ctx.moveTo(x - 16, y + 17);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 16, y + 17);
        ctx.stroke();
      }
    }
    // Checker board at the finish line.
    for (let y = 0; y < 32; y += 16) {
      for (let x = 0; x < 512; x += 32) {
        ctx.fillStyle = (x / 32 + y / 16) % 2 === 0 ? '#eafcff' : '#0a1118';
        ctx.fillRect(x, y, 32, 16);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1.4);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/**
 * Широкая овальная трасса Сетки. Полоса дороги строится теми же функциями,
 * что и физика трассы, поэтому визуальная кромка всегда совпадает с границей.
 */
export class RaceCourse {
  readonly root = new THREE.Group();
  readonly length: number;
  readonly width: number;
  readonly a: number;
  readonly b: number;
  readonly obstacles: RaceObstacle[] = [];
  readonly gates: RaceGate[] = [];
  readonly startDistance: number;
  readonly lanes = 7;

  private scene: THREE.Scene;
  private samples: { theta: number; distance: number }[] = [];
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private textures = new Set<THREE.Texture>();
  private surfaceMat: THREE.MeshStandardMaterial;
  private railMat: THREE.MeshBasicMaterial;
  private gateMat: THREE.MeshBasicMaterial;
  private hazardMat: THREE.MeshStandardMaterial;
  private markerMat: THREE.MeshBasicMaterial;
  private roadTex: THREE.Texture;
  private accent: THREE.Color;
  private startLights: THREE.Mesh[] = [];

  constructor(scene: THREE.Scene, size: number, theme: ArenaTheme) {
    this.scene = scene;
    const half = size / 2;
    this.a = half * 0.7;
    this.b = half * 0.5;
    // Широкая трасса: 7 полос и место для обгона на любом размере арены.
    this.width = Math.max(40, Math.min(74, size * 0.3));
    this.accent = new THREE.Color(theme.grid[0], theme.grid[1], theme.grid[2]);
    this.root.name = 'NEON_RACE_TRACK';
    this.root.position.y = 0.02;
    this.scene.add(this.root);

    this.roadTex = roadTexture();
    this.textures.add(this.roadTex);
    this.surfaceMat = this.keep(new THREE.MeshStandardMaterial({
      map: this.roadTex,
      color: 0xd8f4ff,
      emissive: new THREE.Color(0.03, 0.07, 0.095),
      emissiveIntensity: 1,
      metalness: 0.82,
      roughness: 0.28,
      side: THREE.DoubleSide,
    }));
    this.railMat = this.keep(new THREE.MeshBasicMaterial({ color: this.accent.clone().multiplyScalar(1.4) }));
    this.gateMat = this.keep(new THREE.MeshBasicMaterial({
      color: this.accent.clone().multiplyScalar(1.8),
      transparent: true,
      opacity: 0.88,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    this.hazardMat = this.keep(new THREE.MeshStandardMaterial({
      color: 0x0c141c,
      emissive: new THREE.Color(0.4, 0.04, 0.02),
      emissiveIntensity: 0.8,
      metalness: 0.9,
      roughness: 0.3,
    }));
    this.markerMat = this.keep(new THREE.MeshBasicMaterial({
      color: new THREE.Color(1.1, 0.62, 0.12),
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));

    this.buildSamples(1200);
    this.length = this.samples[this.samples.length - 1].distance;
    this.startDistance = this.distanceAtAngle(-Math.PI / 2);
    this.buildRoad();
    this.buildStartFinish();
    this.buildObstacles();
    this.buildScenery(half);
  }

  private keep<T extends THREE.Material>(m: T): T {
    this.materials.add(m);
    return m;
  }

  private keepGeometry<T extends THREE.BufferGeometry>(g: T): T {
    this.geometries.add(g);
    return g;
  }

  private buildSamples(count: number) {
    let distance = 0;
    let px = this.a;
    let pz = 0;
    this.samples.push({ theta: 0, distance: 0 });
    for (let i = 1; i <= count; i++) {
      const theta = (i / count) * Math.PI * 2;
      const x = this.a * Math.cos(theta);
      const z = this.b * Math.sin(theta);
      distance += Math.hypot(x - px, z - pz);
      this.samples.push({ theta, distance });
      px = x;
      pz = z;
    }
  }

  private normalizeAngle(theta: number) {
    let a = theta % (Math.PI * 2);
    if (a < 0) a += Math.PI * 2;
    return a;
  }

  distanceAtAngle(theta: number) {
    const a = this.normalizeAngle(theta);
    const n = this.samples.length - 1;
    const f = (a / (Math.PI * 2)) * n;
    const i = Math.floor(f);
    const t = f - i;
    const p0 = this.samples[i];
    const p1 = this.samples[Math.min(i + 1, n)];
    return p0.distance + (p1.distance - p0.distance) * t;
  }

  pose(theta: number, lane = 0): RacePose {
    const a = this.normalizeAngle(theta);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const x = this.a * c;
    const z = this.b * s;
    const tx = -this.a * s;
    const tz = this.b * c;
    const tl = Math.hypot(tx, tz) || 1;
    const nx0 = c / this.a;
    const nz0 = s / this.b;
    const nl = Math.hypot(nx0, nz0) || 1;
    const nx = nx0 / nl;
    const nz = nz0 / nl;
    return {
      x: x + nx * lane,
      z: z + nz * lane,
      heading: Math.atan2(tz / tl, tx / tl),
      theta: a,
      distance: this.distanceAtAngle(a),
      nx,
      nz,
    };
  }

  /** Newton projection onto the centreline; lateral offset uses the true normal. */
  project(x: number, z: number): RaceProjection {
    let theta = Math.atan2(z / this.b, x / this.a);
    for (let i = 0; i < 6; i++) {
      const c = Math.cos(theta);
      const s = Math.sin(theta);
      const qx = this.a * c - x;
      const qz = this.b * s - z;
      const d1 = qx * (-this.a * s) + qz * (this.b * c);
      const d2 = this.a * this.a * s * s + this.b * this.b * c * c + qx * (-this.a * c) + qz * (-this.b * s);
      if (Math.abs(d2) > 1e-5) theta -= d1 / d2;
    }
    theta = this.normalizeAngle(theta);
    const base = this.pose(theta);
    const dx = x - base.x;
    const dz = z - base.z;
    const lateral = dx * base.nx + dz * base.nz;
    const offRoad = Math.hypot(dx - base.nx * lateral, dz - base.nz * lateral);
    return { ...base, lateral, offRoad };
  }

  angleAtDistance(s: number) {
    let d = s % this.length;
    if (d < 0) d += this.length;
    let lo = 0;
    let hi = this.samples.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (this.samples[m].distance < d) lo = m + 1;
      else hi = m;
    }
    const p1 = this.samples[lo];
    const p0 = this.samples[Math.max(0, lo - 1)];
    const t = (d - p0.distance) / Math.max(1e-6, p1.distance - p0.distance);
    return p0.theta + (p1.theta - p0.theta) * t;
  }

  poseAtDistance(s: number, lane = 0): RacePose {
    return this.pose(this.angleAtDistance(s), lane);
  }

  getStartingPose(slot: number, total: number, lane?: number): RacePose {
    const cols = total > 4 ? 3 : 2;
    const row = Math.floor(slot / cols);
    const col = slot % cols;
    const stagger = row * 11;
    const angle = this.angleAtDistance(this.startDistance - stagger);
    const step = Math.min(5.4, this.width / (cols + 1.7));
    const chosenLane = lane ?? (col - (cols - 1) / 2) * step;
    return this.pose(angle, chosenLane);
  }

  nearestObstacle(distance: number, lateral: number) {
    let closest: RaceObstacle | null = null;
    let best = Infinity;
    for (const obstacle of this.obstacles) {
      let ds = Math.abs(obstacle.distance - distance);
      ds = Math.min(ds, this.length - ds);
      const dl = Math.abs(obstacle.lane - lateral);
      if (ds < obstacle.radius + 1.3 && dl < obstacle.radius + 0.95 && ds < best) {
        closest = obstacle;
        best = ds;
      }
    }
    return closest;
  }

  private buildRoad() {
    const segments = 320;
    const vertices: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    const innerOffset = -this.width / 2;
    const outerOffset = this.width / 2;
    let travelled = 0;
    let prev = this.pose(0, innerOffset);

    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const inner = this.pose(theta, innerOffset);
      const outer = this.pose(theta, outerOffset);
      if (i > 0) travelled += Math.abs(inner.distance - prev.distance) > this.length * 0.5 ? 0 : inner.distance - prev.distance;
      prev = inner;
      const v = (i / segments) * this.length;
      vertices.push(inner.x, 0, inner.z, outer.x, 0, outer.z);
      uvs.push(0, v / 36, 1, v / 36);
      if (i < segments) {
        const b = i * 2;
        indices.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const geo = this.keepGeometry(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    const road = new THREE.Mesh(geo, this.surfaceMat);
    road.position.y = 0.02;
    road.receiveShadow = true;
    this.root.add(road);

    // Outer runoff shoulder.
    const shoulderVerts: number[] = [];
    const shoulderIdx: number[] = [];
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const inner = this.pose(theta, outerOffset);
      const outer = this.pose(theta, outerOffset + 7);
      shoulderVerts.push(inner.x, 0, inner.z, outer.x, 0, outer.z);
      if (i < segments) {
        const b = i * 2;
        shoulderIdx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const shoulderGeo = this.keepGeometry(new THREE.BufferGeometry());
    shoulderGeo.setAttribute('position', new THREE.Float32BufferAttribute(shoulderVerts, 3));
    shoulderGeo.setIndex(shoulderIdx);
    shoulderGeo.computeVertexNormals();
    const shoulder = new THREE.Mesh(shoulderGeo, this.keep(new THREE.MeshStandardMaterial({
      color: 0x040b12, metalness: 0.65, roughness: 0.5, side: THREE.DoubleSide,
    })));
    shoulder.position.y = 0.012;
    this.root.add(shoulder);

    // Continuous luminous barriers exactly at the playable edges.
    for (const sign of [-1, 1]) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i <= 400; i++) {
        const theta = (i / 400) * Math.PI * 2;
        const p = this.pose(theta, sign * (this.width / 2 + 0.45));
        points.push(new THREE.Vector3(p.x, 0.55, p.z));
      }
      const curve = new THREE.CatmullRomCurve3(points, true, 'centripetal');
      const rail = new THREE.Mesh(this.keepGeometry(new THREE.TubeGeometry(curve, 420, 0.42, 6, true)), this.railMat);
      rail.position.y = 0;
      this.root.add(rail);
    }

    // Hollow low barrier walls (subtle glow, clearly readable).
    const barrierGeo = this.keepGeometry(new THREE.BoxGeometry(1, 1.05, 0.22));
    const barrierMat = this.keep(new THREE.MeshBasicMaterial({
      color: this.accent.clone().multiplyScalar(0.8),
      transparent: true,
      opacity: 0.42,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const wall = new THREE.InstancedMesh(barrierGeo, barrierMat, 2 * 180);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    let index = 0;
    for (const sign of [-1, 1]) {
      for (let i = 0; i < 180; i++) {
        const theta = (i / 180) * Math.PI * 2;
        const p = this.pose(theta, sign * this.width / 2);
        pos.set(p.x, 0.55, p.z);
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), -p.heading);
        scale.set(this.length / 180 * 1.05, 1, 1);
        m.compose(pos, q, scale);
        wall.setMatrixAt(index++, m);
      }
    }
    wall.instanceMatrix.needsUpdate = true;
    this.root.add(wall);

    // Start grid slots.
    const gridMat = this.keep(new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.4, 0.95, 1.1),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }));
    const slotGeo = this.keepGeometry(new THREE.PlaneGeometry(4.6, 2.2));
    slotGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const pose = this.getStartingPose(i, 8);
      const slot = new THREE.Mesh(slotGeo, gridMat);
      slot.position.set(pose.x, 0.075, pose.z);
      slot.rotation.y = -pose.heading;
      this.root.add(slot);
    }
  }

  private buildStartFinish() {
    const start = this.pose(-Math.PI / 2, 0);
    const lineGeo = this.keepGeometry(new THREE.PlaneGeometry(this.width, 1.2));
    lineGeo.rotateX(-Math.PI / 2);
    const line = new THREE.Mesh(lineGeo, this.markerMat);
    line.position.set(start.x, 0.1, start.z);
    line.rotation.y = -start.heading;
    this.root.add(line);

    this.gates.push({ distance: start.distance, label: 'СТАРТ / ФИНИШ' });
    for (let i = 1; i < 4; i++) {
      this.gates.push({ distance: this.distanceAtAngle(-Math.PI / 2 + (i * Math.PI) / 2), label: `СЕКТОР ${i}` });
    }

    // Start gantry: two pylons and a luminous overhead beam.
    const pylonGeo = this.keepGeometry(new THREE.BoxGeometry(0.8, 15, 0.8));
    const beamGeo = this.keepGeometry(new THREE.BoxGeometry(0.8, 0.6, this.width + 6));
    const lightGeo = this.keepGeometry(new THREE.SphereGeometry(0.42, 8, 6));
    const gateGroup = new THREE.Group();
    gateGroup.position.set(start.x, 0, start.z);
    gateGroup.rotation.y = -start.heading;
    for (const side of [-1, 1]) {
      const pylon = new THREE.Mesh(pylonGeo, this.railMat);
      pylon.position.set(0, 7.5, side * (this.width / 2 + 1.5));
      gateGroup.add(pylon);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.3, 2.4), this.hazardMat);
      foot.position.set(0, 0.15, side * (this.width / 2 + 1.5));
      gateGroup.add(foot);
    }
    const beam = new THREE.Mesh(beamGeo, this.railMat);
    beam.position.set(0, 15, 0);
    gateGroup.add(beam);
    for (let i = 0; i < 5; i++) {
      const lamp = new THREE.Mesh(lightGeo, this.markerMat);
      lamp.position.set(0, 14.4, -this.width * 0.38 + (i * this.width * 0.76) / 4);
      gateGroup.add(lamp);
      this.startLights.push(lamp);
    }
    // Hologram START boards.
    const boardCanvas = document.createElement('canvas');
    boardCanvas.width = 1024;
    boardCanvas.height = 192;
    const ctx = boardCanvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#010911';
      ctx.fillRect(0, 0, 1024, 192);
      ctx.strokeStyle = `#${this.accent.getHexString()}`;
      ctx.lineWidth = 5;
      ctx.strokeRect(6, 6, 1012, 180);
      ctx.fillStyle = '#e8fdff';
      ctx.font = 'bold 92px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('START · FINISH', 512, 128);
    }
    const boardTex = new THREE.CanvasTexture(boardCanvas);
    boardTex.colorSpace = THREE.SRGBColorSpace;
    this.textures.add(boardTex);
    const boardMat = this.keep(new THREE.MeshBasicMaterial({ map: boardTex, transparent: true, opacity: 0.9, side: THREE.DoubleSide }));
    const boardGeo = this.keepGeometry(new THREE.PlaneGeometry(this.width * 0.72, 4.2));
    const board = new THREE.Mesh(boardGeo, boardMat);
    board.position.set(0, 12.5, 0);
    board.rotation.y = Math.PI / 2;
    gateGroup.add(board);
    this.root.add(gateGroup);

    // Checkpoint arches at quarters.
    const archGeo = this.keepGeometry(new THREE.TorusGeometry(this.width * 0.58, 0.2, 8, 48, Math.PI));
    for (let cp = 1; cp < 4; cp++) {
      const pose = this.pose(-Math.PI / 2 + (cp * Math.PI) / 2, 0);
      const group = new THREE.Group();
      group.position.set(pose.x, 0, pose.z);
      group.rotation.y = -pose.heading;
      const arch = new THREE.Mesh(archGeo, this.gateMat);
      arch.rotation.y = Math.PI / 2;
      arch.rotation.z = 0;
      arch.rotation.x = 0;
      arch.position.y = 0;
      group.add(arch);
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(pylonGeo, this.railMat);
        post.scale.set(0.5, 0.55, 0.5);
        post.position.set(0, 4, side * this.width * 0.58);
        group.add(post);
      }
      this.root.add(group);
    }
  }

  private buildObstacles() {
    // Obstacles are staggered across lanes, leaving at least two clean gates.
    const fractions = [0.14, 0.25, 0.37, 0.48, 0.61, 0.72, 0.83, 0.93];
    const lanes = [-0.31, 0.31, 0, -0.16, 0.16, -0.31, 0.31, 0];
    const colors = [0xff8b30, 0xff344d, 0xffb347, 0xff426d];
    const blockGeo = this.keepGeometry(new THREE.BoxGeometry(4.2, 1.1, 2.4));
    const bandGeo = this.keepGeometry(new THREE.BoxGeometry(4.25, 0.12, 2.45));
    const spikeGeo = this.keepGeometry(new THREE.ConeGeometry(0.3, 0.7, 5));
    const coreGeo = this.keepGeometry(new THREE.OctahedronGeometry(0.5, 0));
    fractions.forEach((f, i) => {
      const distance = this.length * f;
      const pose = this.poseAtDistance(distance);
      const lane = lanes[i] * this.width;
      const color = colors[i % colors.length];
      const group = new THREE.Group();
      group.position.set(pose.x + pose.nx * lane, 0, pose.z + pose.nz * lane);
      group.rotation.y = -pose.heading;
      const barrier = new THREE.Mesh(blockGeo, this.hazardMat);
      barrier.position.y = 0.55;
      group.add(barrier);
      const bandMat = this.keep(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
      const band = new THREE.Mesh(bandGeo, bandMat);
      band.position.y = 0.95;
      group.add(band);
      const spikes = new THREE.Group();
      for (let sp = -1; sp <= 1; sp++) {
        const spike = new THREE.Mesh(spikeGeo, bandMat);
        spike.position.set(sp * 1.25, 1.7, 0);
        spikes.add(spike);
      }
      group.add(spikes);
      const core = new THREE.Mesh(coreGeo, bandMat);
      core.position.set(0, 1.65, 0);
      group.add(core);
      this.root.add(group);
      this.obstacles.push({ distance, lane, radius: 2.6, color, group });
    });
  }

  private buildScenery(half: number) {
    // Infield emblem: a huge rotating holographic ring at the arena centre.
    const ringMat = this.keep(new THREE.MeshBasicMaterial({
      color: this.accent.clone().multiplyScalar(0.6),
      transparent: true,
      opacity: 0.22,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    }));
    const ringGeo = this.keepGeometry(new THREE.RingGeometry(this.b * 0.32, this.b * 0.335, 96));
    ringGeo.rotateX(-Math.PI / 2);
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.06;
    this.root.add(ring);
    const ring2Geo = this.keepGeometry(new THREE.RingGeometry(this.b * 0.18, this.b * 0.188, 72));
    ring2Geo.rotateX(-Math.PI / 2);
    const ring2 = new THREE.Mesh(ring2Geo, ringMat);
    ring2.position.y = 0.06;
    this.root.add(ring2);
    const cross = this.keepGeometry(new THREE.PlaneGeometry(this.b * 0.55, 0.7));
    cross.rotateX(-Math.PI / 2);
    const midline = new THREE.Mesh(cross, ringMat);
    midline.position.y = 0.06;
    this.root.add(midline);

    // Track-side light pylons.
    const pylonGeo = this.keepGeometry(new THREE.BoxGeometry(0.7, 9, 0.7));
    const lampGeo = this.keepGeometry(new THREE.BoxGeometry(0.35, 0.35, 2.4));
    const lampMat = this.keep(new THREE.MeshBasicMaterial({ color: this.accent.clone().multiplyScalar(1.8) }));
    for (let i = 0; i < 16; i++) {
      const pose = this.pose((i / 16) * Math.PI * 2, this.width / 2 + 8);
      const pylon = new THREE.Mesh(pylonGeo, this.hazardMat);
      pylon.position.set(pose.x, 4.5, pose.z);
      this.root.add(pylon);
      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(pose.x, 9, pose.z);
      lamp.rotation.y = -pose.heading;
      this.root.add(lamp);
    }
    void half;
  }

  update(time: number, beat = 0) {
    const pulse = 1 + Math.min(1, beat) * 0.4;
    this.railMat.color.copy(this.accent).multiplyScalar(1.2 * pulse);
    this.markerMat.color.setRGB(1.1 * pulse, 0.62 * pulse, 0.12 * pulse);
    this.roadTex.offset.y = -time * 0.035;
    this.gateMat.opacity = 0.7 + Math.min(1, beat) * 0.25;
    this.startLights.forEach((lamp, i) => {
      const mat = lamp.material as THREE.MeshBasicMaterial;
      mat.color.setRGB(1.2 * pulse, 0.65 * pulse, 0.15 * pulse);
      const scale = 0.8 + Math.min(1, beat) * 0.35 + (i === 2 ? 0.2 : 0);
      lamp.scale.setScalar(scale);
    });
    this.obstacles.forEach((obstacle, index) => {
      const core = obstacle.group.children[3];
      core.rotation.y = time * (1.1 + index * 0.12);
      core.rotation.x = time * 0.6;
      core.position.y = 1.65 + Math.sin(time * 3 + index) * 0.16;
      const spikes = obstacle.group.children[2];
      spikes.position.y = Math.sin(time * 2 + index) * 0.08;
    });
  }

  dispose() {
    this.scene.remove(this.root);
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.geometries.clear();
    this.materials.clear();
    this.textures.clear();
    this.obstacles.length = 0;
    this.startLights = [];
  }
}
