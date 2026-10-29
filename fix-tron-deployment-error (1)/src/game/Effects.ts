import * as THREE from 'three';
import {
  beamFragment,
  beamVertex,
  pointsFragment,
  pointsVertex,
  ringFragment,
  ringVertex,
} from './shaders';

const MAX_CUBES = 2048;
const MAX_SPARKS = 3500;

interface RingFx {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number;
  dur: number;
  from: number;
  to: number;
}
interface FlashFx {
  sprite: THREE.Sprite;
  t: number;
  dur: number;
  scale: number;
}
interface BeamFx {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  t: number;
  dur: number;
}

function radialTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  scene: THREE.Scene;
  quality = 1;

  // кубы дерезолюции
  private cubes: THREE.InstancedMesh;
  private cPos = new Float32Array(MAX_CUBES * 3);
  private cVel = new Float32Array(MAX_CUBES * 3);
  private cRot = new Float32Array(MAX_CUBES * 3);
  private cRv = new Float32Array(MAX_CUBES * 3);
  private cLife = new Float32Array(MAX_CUBES);
  private cMax = new Float32Array(MAX_CUBES);
  private cSize = new Float32Array(MAX_CUBES);
  private cHead = 0;
  private cActive = 0;

  // искры
  private sparks: THREE.Points;
  private sGeo: THREE.BufferGeometry;
  private sPos: Float32Array;
  private sCol: Float32Array;
  private sSize: Float32Array;
  private sAlpha: Float32Array;
  private sVel = new Float32Array(MAX_SPARKS * 3);
  private sLife = new Float32Array(MAX_SPARKS);
  private sMax = new Float32Array(MAX_SPARKS);
  private sGrav = new Float32Array(MAX_SPARKS);
  private sHead = 0;
  private sActive = 0;
  sparkMat: THREE.ShaderMaterial;

  private rings: RingFx[] = [];
  private flashes: FlashFx[] = [];
  private beams: BeamFx[] = [];
  private ringIdx = 0;
  private flashIdx = 0;
  private beamIdx = 0;

  private m4 = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private sc = new THREE.Vector3();
  private col = new THREE.Color();
  private camPos: THREE.Vector3 | null = null;

  setCamera(position: THREE.Vector3) {
    this.camPos = position;
  }

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    const cubeGeo = new THREE.BoxGeometry(1, 1, 1);
    const cubeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.cubes = new THREE.InstancedMesh(cubeGeo, cubeMat, MAX_CUBES);
    this.cubes.frustumCulled = false;
    this.cubes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.m4.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_CUBES; i++) {
      this.cubes.setMatrixAt(i, this.m4);
      this.cubes.setColorAt(i, this.col.setRGB(1, 1, 1));
    }
    scene.add(this.cubes);

    this.sGeo = new THREE.BufferGeometry();
    this.sPos = new Float32Array(MAX_SPARKS * 3);
    this.sCol = new Float32Array(MAX_SPARKS * 3);
    this.sSize = new Float32Array(MAX_SPARKS);
    this.sAlpha = new Float32Array(MAX_SPARKS);
    this.sGeo.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.sGeo.setAttribute('aColor', new THREE.BufferAttribute(this.sCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.sGeo.setAttribute('aSize', new THREE.BufferAttribute(this.sSize, 1).setUsage(THREE.DynamicDrawUsage));
    this.sGeo.setAttribute('aAlpha', new THREE.BufferAttribute(this.sAlpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.sparkMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: pointsVertex,
      fragmentShader: pointsFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.sparks = new THREE.Points(this.sGeo, this.sparkMat);
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 5;
    scene.add(this.sparks);

    const ringGeo = new THREE.PlaneGeometry(1, 1);
    ringGeo.rotateX(-Math.PI / 2);
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 }, uThick: { value: 0.18 } },
        vertexShader: ringVertex,
        fragmentShader: ringFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      this.rings.push({ mesh, mat, t: 1, dur: 1, from: 1, to: 1 });
    }

    const tex = radialTexture();
    for (let i = 0; i < 10; i++) {
      const mat = new THREE.SpriteMaterial({
        map: tex,
        color: 0xffffff,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 6;
      scene.add(sprite);
      this.flashes.push({ sprite, t: 1, dur: 1, scale: 1 });
    }

    const beamGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
    beamGeo.translate(0, 0.5, 0);
    for (let i = 0; i < 6; i++) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0 } },
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(beamGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 4;
      scene.add(mesh);
      this.beams.push({ mesh, mat, t: 1, dur: 1 });
    }
  }

  setPointScale(s: number) {
    this.sparkMat.uniforms.uScale.value = s;
  }

  spark(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    c: THREE.Color,
    k: number,
    size: number,
    life: number,
    grav = 1,
  ) {
    const i = this.sHead;
    this.sHead = (this.sHead + 1) % MAX_SPARKS;
    this.sPos[i * 3] = x;
    this.sPos[i * 3 + 1] = y;
    this.sPos[i * 3 + 2] = z;
    this.sVel[i * 3] = vx;
    this.sVel[i * 3 + 1] = vy;
    this.sVel[i * 3 + 2] = vz;
    this.sCol[i * 3] = c.r * k;
    this.sCol[i * 3 + 1] = c.g * k;
    this.sCol[i * 3 + 2] = c.b * k;
    this.sSize[i] = size;
    this.sLife[i] = life;
    this.sMax[i] = life;
    this.sGrav[i] = grav;
    this.sAlpha[i] = 1;
    this.sActive = Math.min(MAX_SPARKS, this.sActive + 1);
  }

  burst(x: number, y: number, z: number, c: THREE.Color, count: number, speed: number, up = 4, size = 0.25) {
    const n = Math.round(count * this.quality);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      const white = Math.random() < 0.25;
      this.spark(
        x,
        y,
        z,
        Math.cos(a) * s,
        up * (0.3 + Math.random()),
        Math.sin(a) * s,
        white ? this.col.setRGB(1, 1, 1) : c,
        white ? 3 : 2.5 + Math.random() * 2,
        size * (0.6 + Math.random() * 0.8),
        0.5 + Math.random() * 0.9,
      );
    }
  }

  ring(x: number, z: number, c: THREE.Color, to: number, dur: number, k = 3, thick = 0.18, y = 0.04) {
    const r = this.rings[this.ringIdx];
    this.ringIdx = (this.ringIdx + 1) % this.rings.length;
    r.mesh.position.set(x, y, z);
    r.mat.uniforms.uColor.value.copy(c).multiplyScalar(k);
    r.mat.uniforms.uThick.value = thick;
    r.t = 0;
    r.dur = dur;
    r.from = 0.5;
    r.to = to;
    r.mesh.visible = true;
  }

  flash(x: number, y: number, z: number, c: THREE.Color, scale: number, dur: number, k = 3) {
    const f = this.flashes[this.flashIdx];
    this.flashIdx = (this.flashIdx + 1) % this.flashes.length;
    f.sprite.position.set(x, y, z);
    (f.sprite.material as THREE.SpriteMaterial).color.copy(c).multiplyScalar(Math.min(k, 4));
    f.t = 0;
    f.dur = dur;
    f.scale = scale;
    f.sprite.visible = true;
  }

  beam(x: number, z: number, c: THREE.Color, height: number, dur: number) {
    const b = this.beams[this.beamIdx];
    this.beamIdx = (this.beamIdx + 1) % this.beams.length;
    b.mesh.position.set(x, 0, z);
    b.mesh.scale.set(0.35, height, 0.35);
    b.mat.uniforms.uColor.value.copy(c).multiplyScalar(1.1);
    b.t = 0;
    b.dur = dur;
    b.mesh.visible = true;
  }

  /** Пиксельный взрыв: компактная россыпь светящихся кубов для пуль и пробоя следа. */
  pixels(x: number, y: number, z: number, c: THREE.Color, count = 46, power = 5.2, pixel = 0.12) {
    const n = Math.max(4, Math.round(count * this.quality));
    for (let k = 0; k < n; k++) {
      const i = this.cHead;
      this.cHead = (this.cHead + 1) % MAX_CUBES;
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const sp = power * (0.35 + Math.random() * 0.9);
      this.cPos[i * 3] = x;
      this.cPos[i * 3 + 1] = y;
      this.cPos[i * 3 + 2] = z;
      this.cVel[i * 3] = Math.sin(b) * Math.cos(a) * sp;
      this.cVel[i * 3 + 1] = Math.abs(Math.cos(b)) * sp * 0.9 + 1.2;
      this.cVel[i * 3 + 2] = Math.sin(b) * Math.sin(a) * sp;
      this.cRot[i * 3] = Math.random() * 6;
      this.cRot[i * 3 + 1] = Math.random() * 6;
      this.cRot[i * 3 + 2] = Math.random() * 6;
      this.cRv[i * 3] = (Math.random() - 0.5) * 22;
      this.cRv[i * 3 + 1] = (Math.random() - 0.5) * 22;
      this.cRv[i * 3 + 2] = (Math.random() - 0.5) * 22;
      const life = 0.45 + Math.random() * 0.7;
      this.cLife[i] = life;
      this.cMax[i] = life;
      this.cSize[i] = pixel * (0.5 + Math.random() * 0.9);
      const white = Math.random() < 0.22;
      const bright = 2.4 + Math.random() * 2.8;
      if (white) this.col.setRGB(bright, bright, bright);
      else this.col.copy(c).multiplyScalar(bright);
      this.cubes.setColorAt(i, this.col);
    }
    if (this.cubes.instanceColor) this.cubes.instanceColor.needsUpdate = true;
    this.cActive = MAX_CUBES;
    this.flash(x, y, z, c, Math.min(power * 0.42, 3.2), 0.18, 2.0);
    this.ring(x, z, c, power * 0.8, 0.32, 2.2, 0.3, Math.max(0.03, y * 0.1));
  }

  /** Дерезолюция: техника рассыпается на светящиеся кубы. scale — размер цели (босс больше). */
  derezz(x: number, z: number, heading: number, speed: number, c: THREE.Color, scale = 1) {
    const count = Math.round(240 * this.quality * scale);
    const fx = Math.cos(heading);
    const fz = Math.sin(heading);
    const spread = 2.6 * scale;
    for (let n = 0; n < count; n++) {
      const i = this.cHead;
      this.cHead = (this.cHead + 1) % MAX_CUBES;
      const along = Math.random() * spread;
      const side = (Math.random() - 0.5) * 0.45 * scale;
      const up = 0.15 + Math.random() * 1.15 * scale;
      this.cPos[i * 3] = x + fx * (along - spread / 2) - fz * side;
      this.cPos[i * 3 + 1] = up;
      this.cPos[i * 3 + 2] = z + fz * (along - spread / 2) + fx * side;
      const burst = (2 + Math.random() * 10) * scale;
      const a = Math.random() * Math.PI * 2;
      const mom = speed * (0.25 + Math.random() * 0.4);
      this.cVel[i * 3] = fx * mom + Math.cos(a) * burst;
      this.cVel[i * 3 + 1] = (2 + Math.random() * 9) * scale;
      this.cVel[i * 3 + 2] = fz * mom + Math.sin(a) * burst;
      this.cRot[i * 3] = Math.random() * 6;
      this.cRot[i * 3 + 1] = Math.random() * 6;
      this.cRot[i * 3 + 2] = Math.random() * 6;
      this.cRv[i * 3] = (Math.random() - 0.5) * 16;
      this.cRv[i * 3 + 1] = (Math.random() - 0.5) * 16;
      this.cRv[i * 3 + 2] = (Math.random() - 0.5) * 16;
      const life = (1.4 + Math.random() * 2.4) * (0.8 + scale * 0.2);
      this.cLife[i] = life;
      this.cMax[i] = life;
      this.cSize[i] = (0.05 + Math.pow(Math.random(), 2) * 0.22) * scale;
      const white = Math.random() < 0.14;
      const k = 1.2 + Math.random() * 2.4;
      if (white) this.col.setRGB(k, k, k);
      else this.col.copy(c).multiplyScalar(k);
      this.cubes.setColorAt(i, this.col);
    }
    if (this.cubes.instanceColor) this.cubes.instanceColor.needsUpdate = true;
    this.cActive = MAX_CUBES;

    this.burst(x, 0.6 * scale, z, c, Math.round(120 * scale), 13, 7, 0.26 * scale);
    this.ring(x, z, c, 24 * scale, 0.9, 1.5, 0.1);
    this.ring(x, z, c, 11 * scale, 0.55, 1.0, 0.3);
    this.flash(x, 1, z, c, 9 * scale, 0.4, 1.5);
    this.flash(x, 1, z, this.col.setRGB(1, 1, 1), 4 * scale, 0.22, 1.3);
    this.beam(x, z, c, 46 * scale, 1.1);
  }

  /** Ударная волна босса: кольцо + вспышка + сноп искр. */
  shockwave(x: number, z: number, c: THREE.Color, radius: number) {
    this.ring(x, z, c, radius, 0.8, 2.6, 0.22);
    this.ring(x, z, c, radius * 0.6, 0.55, 2.0, 0.4);
    this.flash(x, 1.2, z, c, radius * 0.7, 0.35, 2.2);
    this.burst(x, 0.5, z, c, 90, 16, 5, 0.3);
    this.beam(x, z, c, 30, 0.8);
  }

  /** Прицельный луч тарана: красная линия от носа босса. */
  telegraph(x: number, z: number, angle: number, len: number, c: THREE.Color) {
    this.flash(x + Math.cos(angle) * len * 0.5, 0.8, z + Math.sin(angle) * len * 0.5, c, len * 0.5, 0.18, 1.2);
    this.ring(x, z, c, 6, 0.35, 2.4, 0.3);
  }

  clear() {
    this.cLife.fill(0);
    this.sLife.fill(0);
    this.sAlpha.fill(0);
    this.m4.makeScale(0, 0, 0);
    for (let i = 0; i < MAX_CUBES; i++) this.cubes.setMatrixAt(i, this.m4);
    this.cubes.instanceMatrix.needsUpdate = true;
    (this.sGeo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    for (const r of this.rings) r.mesh.visible = false;
    for (const f of this.flashes) f.sprite.visible = false;
    for (const b of this.beams) b.mesh.visible = false;
    this.cActive = 0;
    this.sActive = 0;
  }

  update(dt: number) {
    if (dt <= 0) return;
    // кубы
    if (this.cActive > 0) {
      let alive = 0;
      for (let i = 0; i < MAX_CUBES; i++) {
        let life = this.cLife[i];
        if (life <= 0) continue;
        life -= dt;
        this.cLife[i] = life;
        const i3 = i * 3;
        if (life <= 0) {
          this.m4.makeScale(0, 0, 0);
          this.cubes.setMatrixAt(i, this.m4);
          continue;
        }
        alive++;
        const size = this.cSize[i];
        this.cVel[i3 + 1] -= 22 * dt;
        this.cPos[i3] += this.cVel[i3] * dt;
        this.cPos[i3 + 1] += this.cVel[i3 + 1] * dt;
        this.cPos[i3 + 2] += this.cVel[i3 + 2] * dt;
        if (this.cPos[i3 + 1] < size * 0.5) {
          this.cPos[i3 + 1] = size * 0.5;
          this.cVel[i3 + 1] *= -0.32;
          this.cVel[i3] *= 0.72;
          this.cVel[i3 + 2] *= 0.72;
          this.cRv[i3] *= 0.6;
          this.cRv[i3 + 1] *= 0.6;
          this.cRv[i3 + 2] *= 0.6;
        }
        this.cRot[i3] += this.cRv[i3] * dt;
        this.cRot[i3 + 1] += this.cRv[i3 + 1] * dt;
        this.cRot[i3 + 2] += this.cRv[i3 + 2] * dt;
        const fade = Math.min(1, life / (this.cMax[i] * 0.45));
        const s = size * fade;
        this.e.set(this.cRot[i3], this.cRot[i3 + 1], this.cRot[i3 + 2]);
        this.q.setFromEuler(this.e);
        this.v.set(this.cPos[i3], this.cPos[i3 + 1], this.cPos[i3 + 2]);
        this.sc.set(s, s, s);
        this.m4.compose(this.v, this.q, this.sc);
        this.cubes.setMatrixAt(i, this.m4);
      }
      this.cubes.instanceMatrix.needsUpdate = true;
      this.cActive = alive > 0 ? MAX_CUBES : 0;
      if (alive === 0) this.cubes.instanceMatrix.needsUpdate = true;
    }

    // искры
    if (this.sActive > 0) {
      let alive = 0;
      const drag = Math.max(0, 1 - 1.8 * dt);
      for (let i = 0; i < MAX_SPARKS; i++) {
        let life = this.sLife[i];
        if (life <= 0) continue;
        life -= dt;
        this.sLife[i] = life;
        if (life <= 0) {
          this.sAlpha[i] = 0;
          continue;
        }
        alive++;
        const i3 = i * 3;
        this.sVel[i3 + 1] -= 14 * this.sGrav[i] * dt;
        this.sVel[i3] *= drag;
        this.sVel[i3 + 1] *= drag;
        this.sVel[i3 + 2] *= drag;
        this.sPos[i3] += this.sVel[i3] * dt;
        this.sPos[i3 + 1] += this.sVel[i3 + 1] * dt;
        this.sPos[i3 + 2] += this.sVel[i3 + 2] * dt;
        if (this.sPos[i3 + 1] < 0.02) {
          this.sPos[i3 + 1] = 0.02;
          this.sVel[i3 + 1] *= -0.4;
        }
        this.sAlpha[i] = life / this.sMax[i];
      }
      this.sActive = alive;
      (this.sGeo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
      (this.sGeo.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
      (this.sGeo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
      (this.sGeo.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
    }

    for (const r of this.rings) {
      if (!r.mesh.visible) continue;
      r.t += dt / r.dur;
      if (r.t >= 1) {
        r.mesh.visible = false;
        continue;
      }
      const k = 1 - Math.pow(1 - r.t, 3);
      const s = r.from + (r.to - r.from) * k;
      r.mesh.scale.set(s, 1, s);
      r.mat.uniforms.uAlpha.value = 1 - r.t;
    }
    for (const f of this.flashes) {
      if (!f.sprite.visible) continue;
      f.t += dt / f.dur;
      if (f.t >= 1) {
        f.sprite.visible = false;
        continue;
      }
      // Не даём вспышке залить экран, если она рядом с камерой.
      const camDist = this.camPos ? f.sprite.position.distanceTo(this.camPos) : 30;
      const nearClamp = THREE.MathUtils.clamp(camDist / 18, 0.18, 1);
      const s = f.scale * (0.6 + 0.4 * (1 - f.t)) * nearClamp;
      f.sprite.scale.set(s, s, s);
      (f.sprite.material as THREE.SpriteMaterial).opacity = Math.pow(1 - f.t, 2) * nearClamp;
    }
    for (const b of this.beams) {
      if (!b.mesh.visible) continue;
      b.t += dt / b.dur;
      if (b.t >= 1) {
        b.mesh.visible = false;
        continue;
      }
      const w = 0.38 * (1 - b.t) + 0.04;
      b.mesh.scale.x = w;
      b.mesh.scale.z = w;
      b.mat.uniforms.uAlpha.value = Math.pow(1 - b.t, 1.5);
    }
  }
}
