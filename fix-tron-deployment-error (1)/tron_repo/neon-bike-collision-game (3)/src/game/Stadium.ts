import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { ArenaTheme } from './arenas';

const crowdVertex = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uBeat;
  uniform float uExcite;
  uniform float uWaveAngle;
  uniform float uWaveAmp;
  varying vec3 vColor;

  const float PI = 3.14159265;

  void main() {
    float rnd = fract(aSeed * 97.13);
    float rnd2 = fract(aSeed * 41.77 + 0.31);
    vec3 p = position;

    // Положение зрителя в мире — нужно для «волны», идущей по кругу стадиона.
    vec4 seat = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float ang = atan(seat.z, seat.x);
    float d = mod(ang - uWaveAngle + PI, 2.0 * PI) - PI;
    float wave = exp(-(d * d) / 0.075) * uWaveAmp;

    // Зрители встают на волне и подпрыгивают в такт музыке.
    float raise = clamp(wave + uExcite * 0.55, 0.0, 1.0);
    if (position.y > 1.0) {
      p.y += raise * 0.5;
      p.x *= 1.0 + raise * 0.3;
    }
    float bounce = max(0.0, sin(uTime * 3.2 + rnd * 44.0));
    p.y += bounce * (0.05 + uBeat * 0.07 + uExcite * 0.2) + wave * 1.1;
    p.x += sin(uTime * 1.7 + rnd2 * 36.0) * 0.07 * smoothstep(0.5, 1.5, position.y);

    vec3 col = instanceColor * (0.5 + uBeat * 0.28 + wave * 0.95 + uExcite * 0.32);

    // Вспышки фотокамер в толпе — чем жарче момент, тем их больше.
    float slot = floor(uTime * 2.4);
    float f = fract(sin(rnd * 91.7 + slot * 13.37) * 43758.5453);
    float phase = fract(uTime * 2.4);
    col += vec3(2.6) * step(0.991 - uExcite * 0.012, f) * pow(1.0 - phase, 6.0);

    vColor = col;
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(p, 1.0);
  }
`;

const crowdFragment = /* glsl */ `
  varying vec3 vColor;
  void main() { gl_FragColor = vec4(vColor, 1.0); }
`;

const screenVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const screenFragment = /* glsl */ `
  uniform float uTime;
  uniform float uBeat;
  uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    float bars = 20.0;
    float idx = floor(vUv.x * bars);
    float h = 0.18 + 0.68 * abs(sin(uTime * 2.1 + idx * 0.85)) * (0.55 + uBeat * 0.8);
    float bar = step(vUv.y, h) * step(0.12, fract(vUv.x * bars));
    float scan = 0.5 + 0.5 * sin(vUv.y * 130.0 - uTime * 7.0);
    vec3 col = uColor * bar * (0.45 + scan * 0.55) * 1.7;
    col += uColor * 0.05;
    float edge = max(step(vUv.x, 0.01) + step(0.99, vUv.x), step(vUv.y, 0.018) + step(0.982, vUv.y));
    col += uColor * edge * 1.5;
    gl_FragColor = vec4(col, 1.0);
  }
`;

function spectatorGeometry() {
  const torso = new THREE.BoxGeometry(0.42, 0.68, 0.24);
  torso.translate(0, 0.96, 0);
  const head = new THREE.SphereGeometry(0.19, 6, 4);
  head.translate(0, 1.55, 0);
  const leftLeg = new THREE.BoxGeometry(0.14, 0.56, 0.16);
  leftLeg.translate(-0.12, 0.28, 0);
  const rightLeg = new THREE.BoxGeometry(0.14, 0.56, 0.16);
  rightLeg.translate(0.12, 0.28, 0);
  const leftArm = new THREE.BoxGeometry(0.12, 0.58, 0.16);
  leftArm.rotateZ(-0.35);
  leftArm.translate(-0.33, 1.02, 0);
  const rightArm = new THREE.BoxGeometry(0.12, 0.58, 0.16);
  rightArm.rotateZ(-0.8);
  rightArm.translate(0.37, 1.26, 0);
  const parts = [torso, head, leftLeg, rightLeg, leftArm, rightArm];
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (!merged) throw new Error('Unable to build the stadium crowd');
  return merged;
}

/** Трибуны: живая толпа с волной, вспышками камер, экранами и прожекторами. */
export class Stadium {
  private scene: THREE.Scene;
  private root = new THREE.Group();
  private size = 0;
  private themeId = '';
  private geometries = new Set<THREE.BufferGeometry>();
  private materials = new Set<THREE.Material>();
  private crowdMat: THREE.ShaderMaterial | null = null;
  private screenMat: THREE.ShaderMaterial | null = null;
  private strips: { mesh: THREE.Mesh; base: THREE.Color }[] = [];
  private spotlights: THREE.Mesh[] = [];
  private beacons: THREE.Mesh[] = [];

  private excite = 0;
  private waveAngle = 0;
  private waveAmp = 0;
  private waveActive = false;
  private waveTimer = 14;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    scene.add(this.root);
  }

  private track<T extends THREE.BufferGeometry>(geometry: T): T {
    this.geometries.add(geometry);
    return geometry;
  }

  private keep<T extends THREE.Material>(material: T): T {
    this.materials.add(material);
    return material;
  }

  private clear() {
    this.root.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    this.root.clear();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => {
      const mat = m as THREE.Material & { map?: THREE.Texture | null };
      mat.map?.dispose();
      m.dispose();
    });
    this.geometries.clear();
    this.materials.clear();
    this.crowdMat = null;
    this.screenMat = null;
    this.strips = [];
    this.spotlights = [];
    this.beacons = [];
  }

  /** Всплеск эмоций на трибунах: гол, уничтожение соперника, финиш. */
  cheer(amount = 0.6) {
    this.excite = Math.min(1.6, this.excite + amount);
    if (amount > 0.5 && !this.waveActive && Math.random() < 0.55) this.startWave();
  }

  startWave() {
    if (this.waveActive) return;
    this.waveActive = true;
    this.waveAngle = Math.random() * Math.PI * 2;
    this.waveAmp = 0;
  }

  setSize(size: number, theme: ArenaTheme) {
    if (this.size === size && this.themeId === theme.id) return;
    this.size = size;
    this.themeId = theme.id;
    this.clear();

    const accent = new THREE.Color(theme.grid[0], theme.grid[1], theme.grid[2]);
    const box = this.track(new THREE.BoxGeometry(1, 1, 1));
    const baseCrowd = spectatorGeometry();
    const beamGeometry = this.track(new THREE.CylinderGeometry(0.12, 5, 26, 14, 1, true));
    beamGeometry.translate(0, -13, 0);
    const screenGeometry = this.track(new THREE.PlaneGeometry(26, 7));

    const terraceMat = this.keep(new THREE.MeshStandardMaterial({ color: 0x03080e, metalness: 0.55, roughness: 0.75 }));
    const backdropMat = this.keep(new THREE.MeshBasicMaterial({ color: 0x030a11 }));
    const stripA = this.keep(new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(0.42) }));
    const stripB = this.keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.2, 0.05) }));

    this.crowdMat = this.keep(
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uBeat: { value: 0 },
          uExcite: { value: 0 },
          uWaveAngle: { value: 0 },
          uWaveAmp: { value: 0 },
        },
        vertexShader: crowdVertex,
        fragmentShader: crowdFragment,
      }),
    );
    this.screenMat = this.keep(
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uBeat: { value: 0 }, uColor: { value: accent.clone() } },
        vertexShader: screenVertex,
        fragmentShader: screenFragment,
        side: THREE.DoubleSide,
      }),
    );
    const beamMat = this.keep(
      new THREE.MeshBasicMaterial({
        color: accent.clone().multiplyScalar(0.9),
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    const beaconMat = this.keep(new THREE.MeshBasicMaterial({ color: accent.clone().multiplyScalar(2.2) }));

    const width = size + 14;
    const rows = 8;
    const depth = 4.2;
    const rise = 1.38;
    const columns = Math.min(84, Math.max(34, Math.floor(width / 3.3)));
    const palette = theme.crowd.map((c) => new THREE.Color(c));

    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const tint = new THREE.Color();

    for (let side = 0; side < 4; side++) {
      const stand = new THREE.Group();
      const half = size / 2 + 5;
      if (side === 0) stand.position.set(0, 0, half);
      if (side === 1) {
        stand.position.set(half, 0, 0);
        stand.rotation.y = Math.PI / 2;
      }
      if (side === 2) {
        stand.position.set(0, 0, -half);
        stand.rotation.y = Math.PI;
      }
      if (side === 3) {
        stand.position.set(-half, 0, 0);
        stand.rotation.y = -Math.PI / 2;
      }
      this.root.add(stand);

      const back = new THREE.Mesh(box, backdropMat);
      back.scale.set(width, rows * rise + 12, 1.2);
      back.position.set(0, (rows * rise + 12) / 2, rows * depth + 1);
      stand.add(back);

      for (let row = 0; row < rows; row++) {
        const step = new THREE.Mesh(box, terraceMat);
        step.scale.set(width, rise, depth);
        step.position.set(0, row * rise + rise / 2, row * depth + depth / 2);
        stand.add(step);

        const isWarm = row % 4 === 3;
        const strip = new THREE.Mesh(box, isWarm ? stripB : stripA);
        strip.scale.set(width, 0.045, 0.12);
        strip.position.set(0, (row + 1) * rise + 0.03, row * depth + 0.12);
        stand.add(strip);
        if (row === 0) {
          this.strips.push({ mesh: strip, base: (strip.material as THREE.MeshBasicMaterial).color.clone() });
        }
      }

      // Толпа: у каждой трибуны свои случайные зёрна, чтобы вспышки не совпадали.
      const total = rows * columns;
      const crowdGeo = baseCrowd.clone();
      const seeds = new Float32Array(total);
      for (let i = 0; i < total; i++) seeds[i] = Math.random() * 1000 + side * 137;
      crowdGeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
      this.track(crowdGeo);

      const crowd = new THREE.InstancedMesh(crowdGeo, this.crowdMat, total);
      crowd.frustumCulled = false;
      let index = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < columns; col++) {
          const x = -width / 2 + (col + 0.5) * (width / columns);
          const h = 0.78 + Math.random() * 0.38;
          position.set(x + (Math.random() - 0.5) * 0.5, (row + 1) * rise + 0.08, row * depth + 2.1);
          scale.setScalar(h);
          matrix.compose(position, rotation, scale);
          crowd.setMatrixAt(index, matrix);
          // Секторы болельщиков: соседние места одного цвета, как на стадионе.
          const block = Math.floor(col / 7) + Math.floor(row / 3) * 2 + side;
          tint.copy(palette[block % palette.length]);
          if (Math.random() < 0.1) tint.multiplyScalar(1.9); // светящиеся атрибуты фанатов
          crowd.setColorAt(index, tint);
          index++;
        }
      }
      crowd.instanceMatrix.needsUpdate = true;
      if (crowd.instanceColor) crowd.instanceColor.needsUpdate = true;
      stand.add(crowd);

      // Экран и прожекторы
      const screen = new THREE.Mesh(screenGeometry, this.screenMat);
      screen.position.set(0, rows * rise + 6.4, rows * depth - 0.3);
      screen.rotation.y = Math.PI;
      stand.add(screen);

      for (const x of [-width * 0.3, width * 0.3]) {
        const light = new THREE.Mesh(beamGeometry, beamMat);
        light.position.set(x, rows * rise + 18, rows * depth - 2);
        light.rotation.x = 0.3;
        stand.add(light);
        this.spotlights.push(light);

        const beacon = new THREE.Mesh(box, beaconMat);
        beacon.scale.set(0.7, 0.7, 0.7);
        beacon.position.set(x, rows * rise + 11.5, rows * depth - 0.6);
        stand.add(beacon);
        this.beacons.push(beacon);
      }
    }

    baseCrowd.dispose();
  }

  update(dt: number, time: number, beat: number) {
    this.excite = Math.max(0, this.excite - dt * 0.55);

    // Волна по трибунам запускается сама и обходит стадион кругом.
    this.waveTimer -= dt;
    if (!this.waveActive && this.waveTimer <= 0) {
      this.waveTimer = 16 + Math.random() * 18;
      this.startWave();
    }
    if (this.waveActive) {
      this.waveAngle += dt * 2.3;
      this.waveAmp = Math.min(1, this.waveAmp + dt * 2.5);
      if (this.waveAngle > Math.PI * 2 + 1.2) {
        this.waveAmp = Math.max(0, this.waveAmp - dt * 2.2);
        if (this.waveAmp <= 0.001) {
          this.waveActive = false;
          this.waveAngle = 0;
        }
      }
    }

    if (this.crowdMat) {
      const u = this.crowdMat.uniforms;
      u.uTime.value = time;
      u.uBeat.value = beat;
      u.uExcite.value = Math.min(1, this.excite);
      u.uWaveAngle.value = this.waveAngle;
      u.uWaveAmp.value = this.waveAmp;
    }
    if (this.screenMat) {
      this.screenMat.uniforms.uTime.value = time;
      this.screenMat.uniforms.uBeat.value = beat + this.excite * 0.5;
    }

    for (const light of this.spotlights) {
      light.rotation.z = Math.sin(time * 0.32 + light.position.x * 0.1) * 0.24;
    }
    const pulse = 1 + Math.min(1, beat) * 0.3 + this.excite * 0.35;
    for (const beacon of this.beacons) {
      beacon.scale.setScalar(0.6 + Math.min(1, beat) * 0.35 + this.excite * 0.3);
    }
    for (const strip of this.strips) {
      (strip.mesh.material as THREE.MeshBasicMaterial).color.copy(strip.base).multiplyScalar(pulse);
    }
  }

  dispose() {
    this.scene.remove(this.root);
    this.clear();
  }
}
