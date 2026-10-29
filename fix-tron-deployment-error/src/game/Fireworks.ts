import * as THREE from 'three';
import { pointsFragment, pointsVertex } from './shaders';

const MAX_PARTICLES = 4200;
const MAX_SHELLS = 16;

type BurstKind = 'sphere' | 'ring' | 'willow' | 'palm';

interface Shell {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
  trail: number;
  color: THREE.Color;
  kind: BurstKind;
  power: number;
}

/**
 * Праздничные салюты над трибунами: заряд взлетает со шлейфом,
 * затем раскрывается в один из четырёх типов разрыва.
 */
export class Fireworks {
  private scene: THREE.Scene;
  private points: THREE.Points;
  private geometry: THREE.BufferGeometry;
  private material: THREE.ShaderMaterial;

  private pos = new Float32Array(MAX_PARTICLES * 3);
  private col = new Float32Array(MAX_PARTICLES * 3);
  private size = new Float32Array(MAX_PARTICLES);
  private alpha = new Float32Array(MAX_PARTICLES);
  private vel = new Float32Array(MAX_PARTICLES * 3);
  private life = new Float32Array(MAX_PARTICLES);
  private maxLife = new Float32Array(MAX_PARTICLES);
  private drag = new Float32Array(MAX_PARTICLES);
  private gravity = new Float32Array(MAX_PARTICLES);
  private twinkle = new Float32Array(MAX_PARTICLES);
  private head = 0;
  private activeCount = 0;

  private shells: Shell[] = [];
  private palette: THREE.Color[] = [];
  private arenaSize = 180;
  private ambientTimer = 2;
  /** 0 — тишина, 1 — обычный фон, 2+ — праздничная канонада. */
  intensity = 1;
  quality = 1;

  private tmp = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: pointsVertex,
      fragmentShader: pointsFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    scene.add(this.points);

    for (let i = 0; i < MAX_SHELLS; i++) {
      this.shells.push({
        active: false,
        x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        fuse: 0, trail: 0, power: 1,
        color: new THREE.Color(),
        kind: 'sphere',
      });
    }
    this.setPalette([0x55e6ff, 0xdff6ff, 0x1fa8d8, 0xff8b30]);
  }

  setPointScale(s: number) {
    this.material.uniforms.uScale.value = s;
  }

  setPalette(colors: number[]) {
    this.palette = colors.map((c) => new THREE.Color(c));
  }

  setArenaSize(size: number) {
    this.arenaSize = size;
  }

  private pickColor(): THREE.Color {
    return this.palette[(Math.random() * this.palette.length) | 0] ?? this.tmp.setRGB(1, 1, 1);
  }

  private emit(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    color: THREE.Color, brightness: number,
    size: number, life: number, drag: number, gravity: number, twinkle: number,
  ) {
    const i = this.head;
    this.head = (this.head + 1) % MAX_PARTICLES;
    const i3 = i * 3;
    this.pos[i3] = x;
    this.pos[i3 + 1] = y;
    this.pos[i3 + 2] = z;
    this.vel[i3] = vx;
    this.vel[i3 + 1] = vy;
    this.vel[i3 + 2] = vz;
    this.col[i3] = color.r * brightness;
    this.col[i3 + 1] = color.g * brightness;
    this.col[i3 + 2] = color.b * brightness;
    this.size[i] = size;
    this.alpha[i] = 1;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.drag[i] = drag;
    this.gravity[i] = gravity;
    this.twinkle[i] = twinkle;
    this.activeCount = Math.min(MAX_PARTICLES, this.activeCount + 1);
  }

  /** Запустить высотный заряд над ареной и башнями. */
  launch(angle?: number, color?: THREE.Color, kind?: BurstKind) {
    const shell = this.shells.find((s) => !s.active);
    if (!shell) return;
    const a = angle ?? Math.random() * Math.PI * 2;
    // Радиус запуска — за трибунами и ближе к внешним башням
    const r = this.arenaSize * (0.75 + Math.random() * 0.55);
    const kinds: BurstKind[] = ['sphere', 'ring', 'willow', 'palm'];
    shell.active = true;
    shell.x = Math.cos(a) * r;
    shell.z = Math.sin(a) * r;
    shell.y = 10;
    // Легкий наклон траектории к центру арены
    const toCenter = Math.atan2(-shell.z, -shell.x);
    shell.vx = Math.cos(toCenter) * (6 + Math.random() * 8) + (Math.random() - 0.5) * 6;
    shell.vz = Math.sin(toCenter) * (6 + Math.random() * 8) + (Math.random() - 0.5) * 6;
    // Высотная баллистика: взлет со скоростью 88..130 м/с!
    shell.vy = 88 + Math.random() * 42;
    shell.fuse = 1.65 + Math.random() * 0.95;
    shell.trail = 0;
    shell.power = 1.1 + Math.random() * 0.6;
    shell.color.copy(color ?? this.pickColor());
    shell.kind = kind ?? kinds[(Math.random() * kinds.length) | 0];
  }

  /** Залп в честь события: победы, уничтожения соперника, старта раунда. */
  salute(count = 4, color?: THREE.Color) {
    const base = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = base + (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      window.setTimeout(() => this.launch(angle, color), i * 160 + Math.random() * 120);
    }
  }

  private burst(shell: Shell) {
    const { x, y, z, color, kind, power } = shell;
    const q = this.quality;
    const white = this.tmp.setRGB(1, 1, 1);

    // Центральное ядро вспышки разрыва
    for (let i = 0; i < Math.round(24 * q); i++) {
      const a = Math.random() * Math.PI * 2;
      const b = Math.acos(2 * Math.random() - 1);
      const s = 5 + Math.random() * 12;
      this.emit(
        x, y, z,
        Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s,
        white, 4.0, 3.2, 0.28 + Math.random() * 0.22, 2.8, 0.2, 0,
      );
    }

    if (kind === 'ring') {
      // Расширяющийся неоновый диск Трона (Identity Disc Blast)
      const count = Math.round(110 * q);
      const tilt = (Math.random() - 0.5) * 0.85;
      const speed = (34 + Math.random() * 14) * power;
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const cx = Math.cos(a) * speed;
        const cz = Math.sin(a) * speed;
        const vy = cz * Math.sin(tilt) + (Math.random() - 0.5) * 3.5;
        const vz = cz * Math.cos(tilt);
        this.emit(x, y, z, cx, vy, vz, color, 3.4 + Math.random(), 2.4 + Math.random() * 1.2,
          2.0 + Math.random() * 1.1, 0.85, 0.45, 1);
      }
    } else if (kind === 'willow') {
      // «Плакучая ива» — длинные золотые/циановые нити, медленно опадающие в ночном небе
      const count = Math.round(130 * q);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const b = Math.acos(2 * Math.random() - 1);
        const s = (18 + Math.random() * 16) * power;
        this.emit(
          x, y, z,
          Math.sin(b) * Math.cos(a) * s, Math.abs(Math.cos(b)) * s * 1.1, Math.sin(b) * Math.sin(a) * s,
          color, 3.0 + Math.random() * 1.0, 2.6 + Math.random() * 1.4,
          3.2 + Math.random() * 1.6, 0.52, 1.2, 1,
        );
      }
    } else if (kind === 'palm') {
      // Пальма: яркие магистральные лучи + россыпь звезд
      const big = Math.round(32 * q);
      for (let i = 0; i < big; i++) {
        const a = Math.random() * Math.PI * 2;
        const b = Math.acos(2 * Math.random() - 1);
        const s = (28 + Math.random() * 18) * power;
        this.emit(
          x, y, z,
          Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s,
          color, 4.0, 3.4 + Math.random() * 1.5, 2.4 + Math.random() * 1.1, 0.95, 0.75, 1,
        );
      }
      const small = Math.round(95 * q);
      const second = this.pickColor();
      for (let i = 0; i < small; i++) {
        const a = Math.random() * Math.PI * 2;
        const b = Math.acos(2 * Math.random() - 1);
        const s = (12 + Math.random() * 16) * power;
        this.emit(
          x, y, z,
          Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s,
          second, 2.5 + Math.random(), 1.8 + Math.random() * 1.0, 1.6 + Math.random() * 1.0, 1.2, 0.65, 1,
        );
      }
    } else {
      // Сферический разрыв сверхновой
      const count = Math.round(140 * q);
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const b = Math.acos(2 * Math.random() - 1);
        const s = (24 + Math.random() * 16) * power;
        this.emit(
          x, y, z,
          Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s,
          color, 3.2 + Math.random() * 1.2, 2.4 + Math.random() * 1.4,
          2.0 + Math.random() * 1.2, 0.95, 0.65, 1,
        );
      }
    }
  }

  update(dt: number, time: number) {
    if (dt <= 0) return;

    // Фоновые запуски
    if (this.intensity > 0) {
      this.ambientTimer -= dt * this.intensity;
      if (this.ambientTimer <= 0) {
        this.ambientTimer = (1.5 + Math.random() * 2.2) / Math.max(0.35, this.intensity);
        this.launch();
        if (this.intensity > 1.2 && Math.random() < 0.6) this.launch();
        if (this.intensity > 2.0 && Math.random() < 0.5) this.launch();
      }
    }

    // Заряды
    for (const s of this.shells) {
      if (!s.active) continue;
      s.vy -= 15 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.z += s.vz * dt;
      s.fuse -= dt;
      s.trail -= dt;
      // Искрящийся восходящий хвост снаряда
      if (s.trail <= 0) {
        s.trail = 0.012;
        this.emit(
          s.x, s.y, s.z,
          (Math.random() - 0.5) * 3.5, -4 - Math.random() * 6, (Math.random() - 0.5) * 3.5,
          s.color, 2.8, 1.6, 0.55 + Math.random() * 0.35, 2.4, 0.5, 1,
        );
      }
      if (s.fuse <= 0 || s.vy < 3) {
        s.active = false;
        this.burst(s);
      }
    }

    if (this.activeCount <= 0) return;

    // Частицы
    let alive = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      let life = this.life[i];
      if (life <= 0) continue;
      life -= dt;
      this.life[i] = life;
      if (life <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      alive++;
      const i3 = i * 3;
      const d = Math.max(0, 1 - this.drag[i] * dt);
      this.vel[i3] *= d;
      this.vel[i3 + 1] = this.vel[i3 + 1] * d - this.gravity[i] * 9.5 * dt;
      this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt;
      this.pos[i3 + 1] += this.vel[i3 + 1] * dt;
      this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = life / this.maxLife[i];
      const flicker = this.twinkle[i] > 0 ? 0.65 + 0.35 * Math.sin(time * 42 + i * 1.7) : 1;
      this.alpha[i] = Math.min(1, t * 1.4) * flicker;
    }
    this.activeCount = alive;

    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aColor') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alpha.fill(0);
    this.activeCount = 0;
    for (const s of this.shells) s.active = false;
    (this.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose() {
    this.scene.remove(this.points);
    this.geometry.dispose();
    this.material.dispose();
  }
}
