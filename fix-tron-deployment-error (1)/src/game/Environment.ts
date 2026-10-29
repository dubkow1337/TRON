import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import {
  arenaWallFragment,
  arenaWallVertex,
  floorFragment,
  floorVertex,
  jumpPadFragment,
  jumpPadVertex,
  pointsFragment,
  pointsVertex,
  skyFragment,
  skyVertex,
  tierPlatformFragment,
  tierPlatformVertex,
  towerFragment,
  towerVertex,
} from './shaders';
import { LEVEL_HEIGHT, rampHeight, type TierLayout } from './config';
import { Stadium } from './Stadium';
import { Fireworks } from './Fireworks';
import { DEFAULT_THEME, type ArenaTheme } from './arenas';

export const FOG_COLOR = new THREE.Color(0x01030a);
const WALL_H = 11;

function makeFloorUniforms() {
  const pos: THREE.Vector3[] = [];
  const col: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    pos.push(new THREE.Vector3(9999, 0, 9999));
    col.push(new THREE.Vector3(0, 0, 0));
  }
  return {
    color: { value: new THREE.Color(0x7f7f7f) },
    tDiffuse: { value: null as THREE.Texture | null },
    textureMatrix: { value: new THREE.Matrix4() },
    uReflect: { value: 1 },
    uHalf: { value: 90 },
    uTime: { value: 0 },
    uBeat: { value: 0 },
    uKick: { value: 0 },
    uGrid: { value: new THREE.Color(0.16, 0.75, 1.0) },
    uCamPos: { value: new THREE.Vector3() },
    uFog: { value: FOG_COLOR.clone() },
    uBikePos: { value: pos },
    uBikeCol: { value: col },
  };
}

export interface BikeLight {
  x: number;
  y: number;
  z: number;
  r: number;
  g: number;
  b: number;
}

export class Environment {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  half = 90;
  hasTiers = false;
  layout: TierLayout | null = null;
  private reflector: Reflector | null = null;
  private plainFloor: THREE.Mesh;
  private plainUniforms: ReturnType<typeof makeFloorUniforms>;
  private reflScale = 0.5;
  private reflOn = true;
  private walls: THREE.Mesh[] = [];
  private wallMat!: THREE.ShaderMaterial;
  private pylons: THREE.Mesh[] = [];
  private sky: THREE.Mesh;
  private skyMat: THREE.ShaderMaterial;
  private towerMat: THREE.ShaderMaterial;
  private motes: THREE.Points;
  private motePos: Float32Array;
  private moteMat: THREE.ShaderMaterial;
  private recognizers: THREE.Group[] = [];
  private gates: THREE.Mesh[] = [];
  private pmrem: THREE.PMREMGenerator;
  private envTex: THREE.Texture;

  private tierGroup: THREE.Group;
  private tierMat!: THREE.ShaderMaterial;
  private jumpPadMat: THREE.ShaderMaterial;
  private stadium: Stadium;
  private fireworks: Fireworks;
  private propsGroup: THREE.Group;
  private propMats: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];
  private beacons: THREE.Mesh[] = [];
  private banners: THREE.Mesh[] = [];
  private searchlights: THREE.Mesh[] = [];
  private portalRings: THREE.Mesh[] = [];
  private towerLamps: THREE.Mesh[] = [];
  private holoBoard: THREE.Mesh | null = null;
  private holoTexture: THREE.Texture | null = null;
  private propGeos = new Set<THREE.BufferGeometry>();
  private propMatSet = new Set<THREE.Material>();
  theme: ArenaTheme = DEFAULT_THEME;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    this.scene = scene;
    this.renderer = renderer;
    this.stadium = new Stadium(scene);
    this.fireworks = new Fireworks(scene);
    this.propsGroup = new THREE.Group();
    scene.add(this.propsGroup);

    scene.add(new THREE.HemisphereLight(0x2f6d95, 0x020409, 0.65));
    const dir = new THREE.DirectionalLight(0xa8e6ff, 1.15);
    dir.position.set(-50, 90, 40);
    scene.add(dir);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envTex = this.buildEnvMap();
    scene.environment = this.envTex;

    // ── Материалы ярусов (до пола: setArena вызывается из createReflector) ──
    this.tierGroup = new THREE.Group();
    scene.add(this.tierGroup);
    this.tierMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0.2, 0.85, 1.1) },
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uKick: { value: 0 },
        uCamPos: { value: new THREE.Vector3() },
        uFog: { value: FOG_COLOR.clone() },
      },
      vertexShader: tierPlatformVertex,
      fragmentShader: tierPlatformFragment,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.jumpPadMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(1.35, 0.8, 0.18) },
        uTime: { value: 0 },
        uBeat: { value: 0 },
        uKick: { value: 0 },
      },
      vertexShader: jumpPadVertex,
      fragmentShader: jumpPadFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    // ── Пол ──
    this.plainUniforms = makeFloorUniforms();
    const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    black.needsUpdate = true;
    this.plainUniforms.tDiffuse.value = black;
    this.plainUniforms.uReflect.value = 0;
    this.plainFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(4200, 4200),
      new THREE.ShaderMaterial({ uniforms: this.plainUniforms, vertexShader: floorVertex, fragmentShader: floorFragment }),
    );
    this.plainFloor.rotation.x = -Math.PI / 2;
    this.plainFloor.visible = false;
    scene.add(this.plainFloor);
    this.createReflector(1280, 720);

    // ── Стены арены ──
    this.wallMat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0.2, 0.8, 1.0) },
        uTime: { value: 0 },
        uHeight: { value: WALL_H },
        uBeat: { value: 0 },
        uKick: { value: 0 },
      },
      vertexShader: arenaWallVertex,
      fragmentShader: arenaWallFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const wallGeo = new THREE.PlaneGeometry(1, WALL_H);
    wallGeo.translate(0, WALL_H / 2, 0);
    for (let i = 0; i < 4; i++) {
      const w = new THREE.Mesh(wallGeo, this.wallMat);
      w.renderOrder = 1;
      w.frustumCulled = false;
      scene.add(w);
      this.walls.push(w);
    }
    const pylonGeo = new THREE.BoxGeometry(0.5, 18, 0.5);
    pylonGeo.translate(0, 9, 0);
    const pylonMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.22, 1.0, 1.4) });
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(pylonGeo, pylonMat);
      scene.add(p);
      this.pylons.push(p);
    }

    // ── Небо ──
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(2400, 48, 28), this.skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // ── Кинематографичный мегаполис Сетки (Tron City) ──
    this.towerMat = new THREE.ShaderMaterial({
      uniforms: {
        uColorA: { value: new THREE.Color(0.2, 0.75, 1.15) },
        uColorB: { value: new THREE.Color(1.2, 0.45, 0.12) },
        uFog: { value: FOG_COLOR.clone() },
        uCamPos: { value: new THREE.Vector3() },
        uTime: { value: 0 },
        uKick: { value: 0 },
      },
      vertexShader: towerVertex,
      fragmentShader: towerFragment,
    });

    // 1. Массив небоскребов и ступенчатых мегалитов
    const towerCount = 380;
    const towers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.towerMat, towerCount);
    const m = new THREE.Matrix4();
    let placed = 0;
    while (placed < towerCount) {
      const a = Math.random() * Math.PI * 2;
      // 3 кольца глубины горизонта
      const ring = Math.random();
      const r = ring < 0.35
        ? 380 + Math.random() * 220
        : ring < 0.7
          ? 600 + Math.random() * 350
          : 950 + Math.random() * 550;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const w = 14 + Math.random() * 44;
      const d = 14 + Math.random() * 44;
      // Высотные башни до 300+ метров
      const h = 30 + Math.pow(Math.random(), 2.2) * 290 * (r > 700 ? 1.25 : 0.85);
      m.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(w, h, d));
      towers.setMatrixAt(placed++, m);
    }
    towers.frustumCulled = false;
    scene.add(towers);

    // 2. Культовые шпили-пирамиды Сетки (Data Needles / Spires)
    const spireCount = 28;
    const spireGeo = new THREE.ConeGeometry(1, 1, 4);
    spireGeo.rotateY(Math.PI / 4);
    const spires = new THREE.InstancedMesh(spireGeo, this.towerMat, spireCount);
    for (let i = 0; i < spireCount; i++) {
      const a = (i / spireCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.25;
      const r = 500 + Math.random() * 750;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const baseW = 28 + Math.random() * 32;
      const h = 180 + Math.random() * 160;
      m.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(baseW, h, baseW));
      spires.setMatrixAt(i, m);
    }
    spires.frustumCulled = false;
    scene.add(spires);

    // 3. Парящие световые дата-мосты между высотными башнями (Luminous Skybridges)
    const bridgeCount = 36;
    const bridgeGeo = new THREE.BoxGeometry(1, 1, 1);
    const bridgeMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.25, 0.9, 1.3),
      transparent: true,
      opacity: 0.65,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const bridges = new THREE.InstancedMesh(bridgeGeo, bridgeMat, bridgeCount);
    const bRot = new THREE.Quaternion();
    for (let i = 0; i < bridgeCount; i++) {
      const a = (i / bridgeCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const r = 480 + Math.random() * 520;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const h = 60 + Math.random() * 120;
      const len = 40 + Math.random() * 90;
      bRot.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + Math.PI / 2 + (Math.random() - 0.5) * 0.5);
      m.compose(new THREE.Vector3(x, h, z), bRot, new THREE.Vector3(len, 1.4, 2.2));
      bridges.setMatrixAt(i, m);
    }
    bridges.frustumCulled = false;
    scene.add(bridges);

    // ─— Световые врата над ареной ──
    const gateMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.35, 1.3, 1.8),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Mesh(new THREE.TorusGeometry(120 + i * 55, 1.6, 8, 96), gateMat);
      g.rotation.x = Math.PI / 2 + (i - 1) * 0.22;
      g.position.set((i - 1) * 190, 130 + i * 45, -220 - i * 60);
      scene.add(g);
      this.gates.push(g);
    }

    // ── Частицы данных ──
    const moteCount = 900;
    const mg = new THREE.BufferGeometry();
    this.motePos = new Float32Array(moteCount * 3);
    const mc = new Float32Array(moteCount * 3);
    const ms = new Float32Array(moteCount);
    const ma = new Float32Array(moteCount);
    for (let i = 0; i < moteCount; i++) {
      this.motePos[i * 3] = (Math.random() - 0.5) * 520;
      this.motePos[i * 3 + 1] = Math.random() * 70;
      this.motePos[i * 3 + 2] = (Math.random() - 0.5) * 520;
      const warm = Math.random() < 0.14;
      mc[i * 3] = warm ? 1.0 : 0.2;
      mc[i * 3 + 1] = warm ? 0.45 : 0.7;
      mc[i * 3 + 2] = warm ? 0.16 : 1.0;
      ms[i] = 0.15 + Math.random() * 0.4;
      ma[i] = 0.25 + Math.random() * 0.7;
    }
    mg.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3).setUsage(THREE.DynamicDrawUsage));
    mg.setAttribute('aColor', new THREE.BufferAttribute(mc, 3));
    mg.setAttribute('aSize', new THREE.BufferAttribute(ms, 1));
    mg.setAttribute('aAlpha', new THREE.BufferAttribute(ma, 1));
    this.moteMat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 500 } },
      vertexShader: pointsVertex,
      fragmentShader: pointsFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.motes = new THREE.Points(mg, this.moteMat);
    this.motes.frustumCulled = false;
    scene.add(this.motes);

    for (let i = 0; i < 3; i++) {
      const g = this.buildRecognizer(i === 1 ? new THREE.Color(0.4, 1.6, 2.4) : new THREE.Color(2.6, 0.9, 0.2));
      scene.add(g);
      this.recognizers.push(g);
    }

    this.setArena(180, null, DEFAULT_THEME);
  }

  /** Реакция трибун на событие матча. */
  cheer(amount = 0.6) {
    this.stadium.cheer(amount);
  }

  /** Праздничный залп салютов над трибунами. */
  celebrate(count = 4, color?: THREE.Color) {
    this.fireworks.salute(count, color);
    this.stadium.cheer(0.9);
  }

  setFireworkIntensity(v: number) {
    this.fireworks.intensity = v;
  }

  setEffectQuality(q: number) {
    this.fireworks.quality = q;
  }

  private buildEnvMap(): THREE.Texture {
    const envScene = new THREE.Scene();
    envScene.background = new THREE.Color(0x000000);
    const cyan = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 2.2) });
    const white = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.8, 2.0) });
    const warm = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.0, 0.8, 0.25) });
    for (const [y, mat, r] of [
      [-1.5, cyan, 0.25],
      [3, white, 0.12],
      [7, cyan, 0.4],
    ] as [number, THREE.Material, number][]) {
      const t = new THREE.Mesh(new THREE.TorusGeometry(18, r, 8, 96), mat);
      t.rotation.x = Math.PI / 2;
      t.position.y = y;
      envScene.add(t);
    }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.6, 20, 0.6), i % 4 === 0 ? warm : cyan);
      bar.position.set(Math.cos(a) * 16, 4, Math.sin(a) * 16);
      envScene.add(bar);
    }
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), white);
    panel.position.y = 16;
    panel.rotation.x = Math.PI / 2;
    envScene.add(panel);
    const tex = this.pmrem.fromScene(envScene, 0.03).texture;
    envScene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
    });
    return tex;
  }

  private buildRecognizer(color: THREE.Color): THREE.Group {
    const g = new THREE.Group();
    const parts: [number, number, number, number, number, number][] = [
      [0, 9, 0, 34, 4, 9],
      [-15, 0, 0, 5, 16, 8],
      [15, 0, 0, 5, 16, 8],
      [0, 4.5, 0, 9, 7, 7],
      [-15, -9, 0, 7, 3, 9],
      [15, -9, 0, 7, 3, 9],
    ];
    const fill = new THREE.MeshBasicMaterial({ color: 0x010204 });
    const line = new THREE.LineBasicMaterial({ color });
    for (const [x, y, z, w, h, d] of parts) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mesh = new THREE.Mesh(geo, fill);
      mesh.position.set(x, y, z);
      g.add(mesh);
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), line);
      edges.position.copy(mesh.position);
      g.add(edges);
    }
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(6, 1, 7.2),
      new THREE.MeshBasicMaterial({ color: color.clone().multiplyScalar(1.4) }),
    );
    eye.position.set(0, 3, 0);
    g.add(eye);
    g.scale.setScalar(1.2);
    return g;
  }

  private createReflector(w: number, h: number) {
    if (this.reflector) {
      this.scene.remove(this.reflector);
      this.reflector.dispose();
      this.reflector = null;
    }
    const shader = {
      name: 'NeonFloor',
      uniforms: makeFloorUniforms(),
      vertexShader: floorVertex,
      fragmentShader: floorFragment,
    };
    const r = new Reflector(new THREE.PlaneGeometry(4200, 4200), {
      textureWidth: Math.max(64, Math.round(w * this.reflScale)),
      textureHeight: Math.max(64, Math.round(h * this.reflScale)),
      clipBias: 0.003,
      shader,
      multisample: 0,
    });
    r.rotation.x = -Math.PI / 2;
    this.scene.add(r);
    this.reflector = r;
    this.applyFloorVisibility();
    this.setArena(this.half * 2, this.layout, this.theme);
  }

  private floorUniformSets(): ReturnType<typeof makeFloorUniforms>[] {
    const sets: ReturnType<typeof makeFloorUniforms>[] = [this.plainUniforms];
    if (this.reflector) {
      sets.push((this.reflector.material as THREE.ShaderMaterial).uniforms as ReturnType<typeof makeFloorUniforms>);
    }
    return sets;
  }

  private applyFloorVisibility() {
    if (this.reflector) this.reflector.visible = this.reflOn;
    this.plainFloor.visible = !this.reflOn || !this.reflector;
  }

  setReflections(on: boolean, scale: number, w: number, h: number) {
    const changed = scale !== this.reflScale;
    this.reflOn = on;
    this.reflScale = scale;
    if (on && (changed || !this.reflector)) this.createReflector(w, h);
    this.applyFloorVisibility();
  }

  resize(w: number, h: number) {
    if (this.reflector) {
      this.reflector
        .getRenderTarget()
        .setSize(Math.max(64, Math.round(w * this.reflScale)), Math.max(64, Math.round(h * this.reflScale)));
    }
  }

  setPointScale(s: number) {
    this.moteMat.uniforms.uScale.value = s;
    this.fireworks.setPointScale(s);
  }

  /** Размер арены, планировка ярусов и визуальная тема карты. */
  setArena(size: number, layout: TierLayout | null, theme: ArenaTheme = this.theme) {
    const half = size / 2;
    const hasTiers = !!layout;
    this.half = half;
    this.hasTiers = hasTiers;
    this.theme = theme;
    this.layout = layout;
    this.stadium.setSize(size, theme);
    this.fireworks.setArenaSize(size);
    this.fireworks.setPalette(theme.fireworks);

    const grid = new THREE.Color(theme.grid[0], theme.grid[1], theme.grid[2]);
    for (const u of this.floorUniformSets()) {
      u.uHalf.value = half;
      u.uGrid.value.copy(grid);
    }
    // setArena вызывается и из конструктора, когда часть материалов ещё не создана.
    this.wallMat?.uniforms.uColor.value.set(theme.wall[0], theme.wall[1], theme.wall[2]);
    this.tierMat?.uniforms.uColor.value.set(theme.deck[0], theme.deck[1], theme.deck[2]);

    const pos: [number, number, number][] = [
      [0, -half, 0],
      [0, half, Math.PI],
      [-half, 0, Math.PI / 2],
      [half, 0, -Math.PI / 2],
    ];
    this.walls.forEach((w, i) => {
      w.position.set(pos[i][0], 0, pos[i][1]);
      w.rotation.y = pos[i][2];
      w.scale.set(size, 1, 1);
    });

    const corners = [
      [-half, -half],
      [half, -half],
      [-half, half],
      [half, half],
    ];
    this.pylons.forEach((p, i) => p.position.set(corners[i][0], 0, corners[i][1]));

    // очистка прежних конструкций
    while (this.tierGroup.children.length > 0) {
      const c = this.tierGroup.children[0] as THREE.Mesh;
      this.tierGroup.remove(c);
      if (c.geometry) c.geometry.dispose();
    }

    this.buildProps(size, theme);

    if (!layout) return;

    const L = layout;
    const thick = 0.5;

    // ── Полотно эстакады ──
    for (const r of L.deck) {
      const w = r.x1 - r.x0;
      const d = r.z1 - r.z0;
      const geo = new THREE.BoxGeometry(w, thick, d);
      const mesh = new THREE.Mesh(geo, this.tierMat);
      mesh.position.set((r.x0 + r.x1) / 2, LEVEL_HEIGHT - thick / 2, (r.z0 + r.z1) / 2);
      this.tierGroup.add(mesh);
    }

    // The ramp surface uses the same height profile as the physics.
    const railMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.3, 0.85, 0.25) });
    for (const r of L.ramps) {
      const isX = r.axis === 'x';
      const width = r.x1 - r.x0;
      const depth = r.z1 - r.z0;
      const cx = (r.x0 + r.x1) / 2;
      const cz = (r.z0 + r.z1) / 2;
      const geo = new THREE.PlaneGeometry(width, depth, isX ? 24 : 1, isX ? 1 : 24);
      geo.rotateX(-Math.PI / 2);
      const positions = geo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < positions.count; i++) {
        positions.setY(i, rampHeight(r, cx + positions.getX(i), cz + positions.getZ(i)));
      }
      geo.computeVertexNormals();
      const mesh = new THREE.Mesh(geo, this.tierMat);
      mesh.position.set(cx, 0, cz);
      this.tierGroup.add(mesh);

      for (const edge of [-1, 1]) {
        const points: THREE.Vector3[] = [];
        for (let i = 0; i <= 16; i++) {
          const along = r.ascendFrom + (r.ascendTo - r.ascendFrom) * i / 16;
          const x = isX ? along : cx + edge * width * 0.48;
          const z = isX ? cz + edge * depth * 0.48 : along;
          points.push(new THREE.Vector3(x, rampHeight(r, x, z) + 0.08, z));
        }
        const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 32, 0.1, 4, false), railMat);
        this.tierGroup.add(rail);
      }
    }

    // ── Неоновые опоры ──
    const colGeo = new THREE.CylinderGeometry(0.45, 0.6, LEVEL_HEIGHT, 10);
    const colMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.18, 1.0, 1.35) });
    const step = Math.max(26, L.armHalf / 4);
    for (let i = -L.armHalf + step; i < L.armHalf; i += step) {
      if (Math.abs(i) < L.armWidth * 0.6) continue;
      for (const sz of [-1, 1]) {
        const c1 = new THREE.Mesh(colGeo, colMat);
        c1.position.set(i, LEVEL_HEIGHT / 2, (sz * L.armWidth) / 2);
        this.tierGroup.add(c1);
        const c2 = new THREE.Mesh(colGeo, colMat);
        c2.position.set((sz * L.armWidth) / 2, LEVEL_HEIGHT / 2, i);
        this.tierGroup.add(c2);
      }
    }

    // ── Трамплины ──
    const padGeo = new THREE.CircleGeometry(L.padR + 1.5, 32);
    padGeo.rotateX(-Math.PI / 2);
    for (const p of L.pads) {
      const mesh = new THREE.Mesh(padGeo, this.jumpPadMat);
      mesh.position.set(p.x, 0.06, p.z);
      this.tierGroup.add(mesh);
      // светящийся бортик
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(L.padR + 1.5, 0.16, 6, 40),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.0, 0.25) }),
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.set(p.x, 0.25, p.z);
      this.tierGroup.add(ring);
    }
  }


  private clearProps() {
    this.propsGroup.clear();
    this.propGeos.forEach((g) => g.dispose());
    this.propMatSet.forEach((m) => {
      const mat = m as THREE.Material & { map?: THREE.Texture | null };
      mat.map?.dispose();
      m.dispose();
    });
    this.propGeos.clear();
    this.propMatSet.clear();
    if (this.holoTexture) this.holoTexture.dispose();
    this.propMats = [];
    this.beacons = [];
    this.banners = [];
    this.searchlights = [];
    this.portalRings = [];
    this.towerLamps = [];
    this.holoBoard = null;
    this.holoTexture = null;
  }

  private bannerTexture(theme: ArenaTheme) {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const css = `rgb(${Math.min(255, theme.grid[0] * 255) | 0}, ${Math.min(255, theme.grid[1] * 255) | 0}, ${Math.min(255, theme.grid[2] * 255) | 0})`;
      ctx.fillStyle = '#01070d';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = css;
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
      ctx.fillStyle = css;
      ctx.font = 'bold 86px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(theme.name, canvas.width / 2, 120);
      ctx.fillStyle = '#9fc6d4';
      ctx.font = '32px monospace';
      ctx.fillText(theme.tagline.toUpperCase(), canvas.width / 2, 186);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Детали арены: эмблема в центре, маяки по углам, шевроны и парящие баннеры. */
  private buildProps(size: number, theme: ArenaTheme) {
    this.clearProps();
    const half = size / 2;
    const accent = new THREE.Color(theme.grid[0], theme.grid[1], theme.grid[2]);

    const addMat = (color: THREE.Color, opacity = 1) => {
      const mat = new THREE.MeshBasicMaterial({
        color: color.clone(),
        transparent: opacity < 1,
        opacity,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.propMatSet.add(mat);
      this.propMats.push({ mat, base: color.clone() });
      return mat;
    };
    const addGeo = <T extends THREE.BufferGeometry>(g: T) => {
      this.propGeos.add(g);
      return g;
    };

    // ── Эмблема в центре поля ──
    const emblemMat = addMat(accent.clone().multiplyScalar(0.85), 0.55);
    const outer = addGeo(new THREE.RingGeometry(size * 0.1, size * 0.105, 96));
    outer.rotateX(-Math.PI / 2);
    const outerMesh = new THREE.Mesh(outer, emblemMat);
    outerMesh.position.y = 0.05;
    this.propsGroup.add(outerMesh);

    const inner = addGeo(new THREE.RingGeometry(size * 0.063, size * 0.066, 72));
    inner.rotateX(-Math.PI / 2);
    const innerMesh = new THREE.Mesh(inner, emblemMat);
    innerMesh.position.y = 0.05;
    this.propsGroup.add(innerMesh);

    if (theme.emblem === 'triangle' || theme.emblem === 'hex') {
      const sides = theme.emblem === 'triangle' ? 3 : 6;
      const shape = addGeo(new THREE.RingGeometry(size * 0.032, size * 0.036, sides));
      shape.rotateX(-Math.PI / 2);
      const shapeMesh = new THREE.Mesh(shape, emblemMat);
      shapeMesh.position.y = 0.05;
      this.propsGroup.add(shapeMesh);
    } else {
      const disc = addGeo(new THREE.CircleGeometry(size * 0.026, 48));
      disc.rotateX(-Math.PI / 2);
      const discMesh = new THREE.Mesh(disc, emblemMat);
      discMesh.position.y = 0.05;
      this.propsGroup.add(discMesh);
    }

    // ── Шевроны по периметру, подсказывающие направление круга ──
    const chevGeo = addGeo(new THREE.PlaneGeometry(2.4, 4.4));
    chevGeo.rotateX(-Math.PI / 2);
    const chevMat = addMat(accent.clone().multiplyScalar(0.5), 0.5);
    const perSide = Math.max(8, Math.floor(size / 16));
    for (let side = 0; side < 4; side++) {
      for (let i = 0; i < perSide; i++) {
        const t = (i + 0.5) / perSide;
        const along = -half + t * size;
        const inset = half - 4.5;
        const mesh = new THREE.Mesh(chevGeo, chevMat);
        if (side === 0) { mesh.position.set(along, 0.07, inset); mesh.rotation.y = Math.PI; }
        if (side === 1) { mesh.position.set(inset, 0.07, -along); mesh.rotation.y = -Math.PI / 2; }
        if (side === 2) { mesh.position.set(-along, 0.07, -inset); mesh.rotation.y = 0; }
        if (side === 3) { mesh.position.set(-inset, 0.07, along); mesh.rotation.y = Math.PI / 2; }
        this.propsGroup.add(mesh);
      }
    }

    // ── Угловые маяки ──
    const beaconMat = addMat(accent.clone().multiplyScalar(1.8), 0.8);
    const barGeo = addGeo(new THREE.BoxGeometry(0.5, 0.5, 26));
    for (const [cx, cz] of [[-half, -half], [half, -half], [-half, half], [half, half]]) {
      const beacon = new THREE.Group();
      beacon.position.set(cx, 20, cz);
      for (let i = 0; i < 2; i++) {
        const bar = new THREE.Mesh(barGeo, beaconMat);
        bar.rotation.y = (i * Math.PI) / 2;
        beacon.add(bar);
      }
      this.propsGroup.add(beacon);
      this.beacons.push(beacon as unknown as THREE.Mesh);
    }

    // ── Парящие голо-баннеры ──
    const bannerTex = this.bannerTexture(theme);
    const bannerMat = new THREE.MeshBasicMaterial({
      map: bannerTex,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.propMatSet.add(bannerMat);
    const bannerGeo = addGeo(new THREE.PlaneGeometry(size * 0.2, size * 0.05));
    for (let i = 0; i < 3; i++) {
      const banner = new THREE.Mesh(bannerGeo, bannerMat);
      this.propsGroup.add(banner);
      this.banners.push(banner);
    }

    // ── Гигантское кольцо-портал над ареной (дух «Трона: Наследие») ──
    const haloMat = addMat(accent.clone().multiplyScalar(0.55), 0.2);
    const haloR = size * 0.46;
    const haloGeo = addGeo(new THREE.TorusGeometry(haloR, 0.65, 8, 160));
    const halo = new THREE.Mesh(haloGeo, haloMat);
    halo.rotation.x = Math.PI / 2 + 0.08;
    halo.position.y = size * 0.5;
    this.propsGroup.add(halo);
    this.portalRings.push(halo);
    const haloInnerGeo = addGeo(new THREE.TorusGeometry(haloR * 0.78, 0.22, 6, 120));
    const haloInner = new THREE.Mesh(haloInnerGeo, haloMat);
    haloInner.rotation.x = Math.PI / 2 + 0.08;
    haloInner.position.y = size * 0.5;
    this.propsGroup.add(haloInner);
    this.portalRings.push(haloInner);
    const spokeGeo = addGeo(new THREE.BoxGeometry(0.22, 0.22, haloR * 0.42));
    for (let i = 0; i < 12; i++) {
      const spoke = new THREE.Mesh(spokeGeo, haloMat);
      const a = (i / 12) * Math.PI * 2;
      spoke.position.set(Math.cos(a) * haloR * 0.89, size * 0.5, Math.sin(a) * haloR * 0.89);
      spoke.rotation.y = -a;
      spoke.rotation.x = 0.08;
      this.propsGroup.add(spoke);
      this.portalRings.push(spoke);
    }

    // ── Периметральные световые башни ──
    const towerMat = addMat(accent.clone().multiplyScalar(0.95), 0.55);
    const towerBodyMat = new THREE.MeshBasicMaterial({ color: 0x030a10 });
    this.propMatSet.add(towerBodyMat);
    const towerGeo = addGeo(new THREE.BoxGeometry(1.6, 38, 1.6));
    const towerBladeGeo = addGeo(new THREE.BoxGeometry(0.22, 30, 2.6));
    const lampGeo = addGeo(new THREE.BoxGeometry(2.4, 0.6, 2.4));
    const towerCount = 8;
    for (let i = 0; i < towerCount; i++) {
      const a = (i / towerCount) * Math.PI * 2 + Math.PI / 8;
      const r = size * 0.62;
      const tower = new THREE.Group();
      tower.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      tower.rotation.y = -a;
      const body = new THREE.Mesh(towerGeo, towerBodyMat);
      body.position.y = 19;
      tower.add(body);
      const blade = new THREE.Mesh(towerBladeGeo, towerMat);
      blade.position.set(0, 26, 0.9);
      tower.add(blade);
      const lamp = new THREE.Mesh(lampGeo, towerMat);
      lamp.position.y = 38.2;
      tower.add(lamp);
      this.towerLamps.push(lamp);
      this.propsGroup.add(tower);
    }

    // ── Прожекторы со всех сторон ──
    const beamGeo = addGeo(new THREE.CylinderGeometry(0.5, 7, 60, 14, 1, true));
    beamGeo.translate(0, -30, 0);
    const beamMat = new THREE.MeshBasicMaterial({
      color: accent.clone().multiplyScalar(0.8),
      transparent: true,
      opacity: 0.02,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.propMatSet.add(beamMat);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const r = size * 0.55;
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.set(Math.cos(a) * r, 42, Math.sin(a) * r);
      beam.rotation.z = 0.5;
      beam.rotation.y = -a;
      this.propsGroup.add(beam);
      this.searchlights.push(beam);
    }

    // ── Центральный голографический экран ──
    const boardCanvas = document.createElement('canvas');
    boardCanvas.width = 1024;
    boardCanvas.height = 256;
    const bctx = boardCanvas.getContext('2d');
    if (bctx) {
      bctx.fillStyle = 'rgba(0,8,14,0.65)';
      bctx.fillRect(0, 0, 1024, 256);
      bctx.strokeStyle = `rgb(${Math.min(255, theme.grid[0] * 255) | 0},${Math.min(255, theme.grid[1] * 255) | 0},${Math.min(255, theme.grid[2] * 255) | 0})`;
      bctx.lineWidth = 5;
      bctx.strokeRect(8, 8, 1008, 240);
      bctx.fillStyle = '#eafcff';
      bctx.font = 'bold 84px sans-serif';
      bctx.textAlign = 'center';
      bctx.fillText('NEON GRID', 512, 124);
      bctx.fillStyle = '#83cede';
      bctx.font = '30px monospace';
      bctx.fillText(theme.name, 512, 186);
    }
    this.holoTexture = new THREE.CanvasTexture(boardCanvas);
    this.holoTexture.colorSpace = THREE.SRGBColorSpace;
    this.propMatSet.add(new THREE.MeshBasicMaterial({ map: this.holoTexture }));
    const board = new THREE.Mesh(
      addGeo(new THREE.PlaneGeometry(size * 0.52, size * 0.13)),
      new THREE.MeshBasicMaterial({
        map: this.holoTexture,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.propMatSet.add(board.material as THREE.Material);
    board.position.set(0, 58, 0);
    this.propsGroup.add(board);
    this.holoBoard = board;
  }

  update(dt: number, time: number, cam: THREE.Camera, lights: BikeLight[], beatPulse = 0, kickPulse = 0) {
    this.stadium.update(dt, time, kickPulse);
    this.fireworks.update(dt, time);

    const propPulse = 1 + Math.min(1, kickPulse) * 0.5;
    for (const p of this.propMats) p.mat.color.copy(p.base).multiplyScalar(propPulse);
    this.beacons.forEach((b, i) => {
      b.rotation.y = time * (0.9 + i * 0.13);
      b.scale.setScalar(1 + Math.min(1, kickPulse) * 0.25);
    });
    this.banners.forEach((b, i) => {
      const a = time * 0.06 + (i / Math.max(1, this.banners.length)) * Math.PI * 2;
      const r = this.half * 0.82;
      b.position.set(Math.cos(a) * r, 34 + Math.sin(time * 0.4 + i) * 2.2, Math.sin(a) * r);
      b.rotation.y = -a + Math.PI / 2;
    });
    this.portalRings.forEach((ring, i) => {
      if (i < 2) ring.rotation.z += dt * (i === 0 ? 0.035 : -0.05);
      const mat = ring.material as THREE.MeshBasicMaterial;
      mat.opacity = Math.min(0.85, 0.32 + Math.min(1, kickPulse) * 0.28 + (i < 2 ? 0.12 : 0));
    });
    this.towerLamps.forEach((lamp) => {
      const mat = lamp.material as THREE.MeshBasicMaterial;
      mat.color.copy(this.theme.grid ? new THREE.Color(this.theme.grid[0], this.theme.grid[1], this.theme.grid[2]).multiplyScalar(0.9) : new THREE.Color(0.3, 0.7, 0.9));
      lamp.scale.setScalar(0.6);
    });
    this.searchlights.forEach((beam, i) => {
      beam.rotation.z = 0.42 + Math.sin(time * 0.22 + i * 1.3) * 0.18;
      beam.rotation.y = (i / 6) * Math.PI * 2 + Math.sin(time * 0.17 + i) * 0.35;
    });
    if (this.holoBoard) {
      this.holoBoard.position.y = 58 + Math.sin(time * 0.5) * 1.6;
      this.holoBoard.rotation.y = Math.sin(time * 0.16) * 0.12;
    }
    for (const u of this.floorUniformSets()) {
      u.uTime.value = time;
      u.uBeat.value = beatPulse;
      u.uKick.value = kickPulse;
      u.uCamPos.value.copy(cam.position);
      for (let i = 0; i < 8; i++) {
        const l = lights[i];
        if (l) {
          u.uBikePos.value[i].set(l.x, l.y || 0, l.z);
          u.uBikeCol.value[i].set(l.r, l.g, l.b);
        } else {
          u.uBikeCol.value[i].set(0, 0, 0);
        }
      }
    }

    this.wallMat.uniforms.uTime.value = time;
    this.wallMat.uniforms.uBeat.value = beatPulse;
    this.wallMat.uniforms.uKick.value = kickPulse;

    this.skyMat.uniforms.uTime.value = time;
    this.towerMat.uniforms.uTime.value = time;
    this.towerMat.uniforms.uKick.value = kickPulse;
    this.towerMat.uniforms.uCamPos.value.copy(cam.position);
    this.sky.position.copy(cam.position);

    if (this.hasTiers) {
      this.tierMat.uniforms.uTime.value = time;
      this.tierMat.uniforms.uBeat.value = beatPulse;
      this.tierMat.uniforms.uKick.value = kickPulse;
      this.tierMat.uniforms.uCamPos.value.copy(cam.position);
      this.jumpPadMat.uniforms.uTime.value = time;
      this.jumpPadMat.uniforms.uBeat.value = beatPulse;
      this.jumpPadMat.uniforms.uKick.value = kickPulse;
    }

    const p = this.motePos;
    const lim = Math.max(180, this.half + 90);
    for (let i = 0; i < p.length; i += 3) {
      p[i + 1] += dt * (0.4 + (i % 7) * 0.08);
      p[i] += Math.sin(time * 0.3 + i) * dt * 0.3;
      if (p[i + 1] > 70) {
        p[i + 1] = 0;
        p[i] = (Math.random() - 0.5) * lim * 2;
        p[i + 2] = (Math.random() - 0.5) * lim * 2;
      }
    }
    (this.motes.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;

    this.recognizers.forEach((g, i) => {
      const t = time * (0.045 + i * 0.012) + i * 2.1;
      const r = 420 + i * 110;
      g.position.set(Math.cos(t) * r, 95 + i * 26 + Math.sin(time * 0.4 + i) * 5, Math.sin(t) * r);
      g.rotation.y = -t + Math.PI;
      g.rotation.z = Math.sin(time * 0.3 + i) * 0.05;
    });

    this.gates.forEach((g, i) => {
      g.rotation.z += dt * (0.05 + i * 0.02);
      g.rotation.y = Math.sin(time * 0.1 + i) * 0.2;
    });
  }

  dispose() {
    this.stadium.dispose();
    this.fireworks.dispose();
    this.clearProps();
    this.scene.remove(this.propsGroup);
    if (this.reflector) this.reflector.dispose();
    this.envTex.dispose();
    this.pmrem.dispose();
    this.tierMat.dispose();
    this.jumpPadMat.dispose();
  }
}
