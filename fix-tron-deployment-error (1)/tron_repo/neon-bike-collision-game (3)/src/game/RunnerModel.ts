import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Light Runner — четырёхколёсный внедорожник из «Трон: Наследие».
// Локальная система: +X — вперёд, начало координат — задняя точка корпуса на полу.
export const RUNNER_LEN = 5.6;
export const RUNNER_WIDTH = 2.7;
export const RUNNER_WHEEL_R = 0.78;

interface SharedRunnerGeo {
  dark: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
  wheelDark: THREE.BufferGeometry;
  wheelGlow: THREE.BufferGeometry;
  core: THREE.BufferGeometry;
}

let shared: SharedRunnerGeo | null = null;

function clean(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.index ? g.toNonIndexed() : g;
  for (const name of Object.keys(n.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') n.deleteAttribute(name);
  }
  return n;
}

function merge(list: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(list.map(clean), false);
  if (!g) throw new Error('mergeGeometries failed');
  g.computeBoundingSphere();
  return g;
}

function tube(pts: number[][], r: number, segs = 32): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, segs, r, 6, false);
}

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function build(): SharedRunnerGeo {
  const dark: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];

  // ── Низкий широкий корпус-монокок ──
  const s = new THREE.Shape();
  s.moveTo(0.1, 0.62);
  s.quadraticCurveTo(0.1, 1.02, 0.7, 1.08);
  s.lineTo(1.5, 1.12);
  s.quadraticCurveTo(2.1, 1.13, 2.5, 0.94);
  s.lineTo(4.6, 0.9);
  s.quadraticCurveTo(5.5, 0.88, 5.5, 0.5);
  s.lineTo(5.5, 0.42);
  s.quadraticCurveTo(5.5, 0.3, 5.2, 0.3);
  s.lineTo(0.4, 0.3);
  s.quadraticCurveTo(0.1, 0.32, 0.1, 0.62);
  const hull = new THREE.ExtrudeGeometry(s, {
    depth: 1.5,
    bevelEnabled: true,
    bevelThickness: 0.09,
    bevelSize: 0.08,
    bevelSegments: 2,
    curveSegments: 12,
  });
  hull.translate(0, 0, -0.75);
  dark.push(hull);

  // ── Капот с воздухозаборником ──
  dark.push(box(1.7, 0.16, 1.1, 4.35, 1.0, 0));
  dark.push(box(0.7, 0.1, 0.5, 4.35, 1.12, 0));

  // ── Открытый кокпит: дуги безопасности ──
  for (const z of [-0.62, 0.62]) {
    dark.push(tube([[1.7, 1.05, z], [2.15, 1.75, z * 0.9], [2.9, 1.78, z * 0.9], [3.35, 1.05, z]], 0.07, 20));
  }
  dark.push(tube([[2.15, 1.78, -0.56], [2.5, 1.82, 0], [2.15, 1.78, 0.56]], 0.06, 12));

  // ── Пилот ──
  const torso = new THREE.CapsuleGeometry(0.17, 0.5, 4, 10);
  torso.rotateZ(-0.5);
  torso.translate(2.35, 1.35, 0);
  dark.push(torso);
  const helmet = new THREE.SphereGeometry(0.17, 16, 12);
  helmet.scale(1.25, 1, 0.95);
  helmet.translate(2.62, 1.62, 0);
  dark.push(helmet);

  // ── Боковые бронепанели-крылья над колёсами ──
  for (const z of [-1, 1]) {
    dark.push(box(1.5, 0.28, 0.5, 1.15, 1.25, 1.18 * z));
    dark.push(box(1.5, 0.28, 0.5, 4.35, 1.25, 1.18 * z));
    dark.push(box(2.1, 0.16, 0.34, 2.75, 1.32, 1.28 * z));
  }

  // ── Задний спойлер-лезвие ──
  dark.push(box(0.14, 0.5, 2.2, 0.35, 1.25, 0));
  dark.push(box(0.7, 0.1, 2.5, 0.55, 1.52, 0));

  // ── Неон: боковые лезвия, нос, корма ──
  for (const z of [-1, 1]) {
    glow.push(
      tube(
        [
          [0.25, 0.72, 1.0 * z],
          [1.2, 0.95, 1.06 * z],
          [2.75, 1.0, 1.12 * z],
          [4.3, 0.92, 1.06 * z],
          [5.35, 0.66, 0.95 * z],
        ],
        0.022,
        48,
      ),
    );
    glow.push(tube([[1.0, 1.32, 1.28 * z], [2.75, 1.4, 1.34 * z], [4.5, 1.32, 1.28 * z]], 0.014, 24));
  }
  // носовая светополоса
  glow.push(box(0.04, 0.1, 1.7, 5.53, 0.62, 0));
  // кормовая светополоса
  glow.push(box(0.04, 0.34, 2.3, 0.06, 0.85, 0));
  // дуги кокпита
  for (const z of [-0.56, 0.56]) {
    glow.push(tube([[1.74, 1.12, z], [2.15, 1.82, z * 0.9], [2.9, 1.84, z * 0.9], [3.3, 1.12, z]], 0.013, 20));
  }
  // воздухозаборник
  glow.push(box(0.72, 0.03, 0.52, 4.35, 1.18, 0));

  // ── Колесо внедорожника (общее, позиционируется группой) ──
  const wheelDarkList: THREE.BufferGeometry[] = [];
  const wheelGlowList: THREE.BufferGeometry[] = [];
  wheelDarkList.push(new THREE.TorusGeometry(0.58, 0.2, 12, 36));
  const drum = new THREE.CylinderGeometry(0.5, 0.5, 0.42, 20);
  drum.rotateX(Math.PI / 2);
  wheelDarkList.push(drum);
  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.BoxGeometry(0.12, 0.95, 0.4);
    spoke.rotateZ((i * Math.PI * 2) / 5);
    wheelDarkList.push(spoke);
  }
  for (const z of [-1, 1]) {
    const rim = new THREE.TorusGeometry(0.68, 0.024, 6, 48);
    rim.translate(0, 0, 0.21 * z);
    wheelGlowList.push(rim);
    const inner = new THREE.TorusGeometry(0.42, 0.013, 4, 36);
    inner.translate(0, 0, 0.22 * z);
    wheelGlowList.push(inner);
  }

  // ── Ядро — слабое место на корме (пульсирует при уроне) ──
  const core = new THREE.OctahedronGeometry(0.3, 0);
  core.translate(0.28, 1.05, 0);

  return {
    dark: merge(dark),
    glow: merge(glow),
    wheelDark: merge(wheelDarkList),
    wheelGlow: merge(wheelGlowList),
    core,
  };
}

export interface RunnerModel {
  root: THREE.Group;
  tilt: THREE.Group;
  wheels: THREE.Group[];
  glowMat: THREE.MeshBasicMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  coreMat: THREE.MeshBasicMaterial;
  baseGlow: THREE.Color;
  setPhaseColor(c: THREE.Color): void;
  dispose(): void;
}

// Позиции колёс: [x, z]
const WHEEL_POS: [number, number][] = [
  [1.15, -1.28],
  [1.15, 1.28],
  [4.35, -1.28],
  [4.35, 1.28],
];

export function createRunnerModel(color: THREE.Color): RunnerModel {
  if (!shared) shared = build();
  const baseGlow = color.clone().multiplyScalar(3.4);
  const glowMat = new THREE.MeshBasicMaterial({ color: baseGlow.clone() });
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x0a0c10,
    metalness: 0.9,
    roughness: 0.34,
    emissive: color.clone(),
    emissiveIntensity: 0.04,
    envMapIntensity: 1.4,
  });
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff) });
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  tilt.add(new THREE.Mesh(shared.dark, bodyMat));
  tilt.add(new THREE.Mesh(shared.glow, glowMat));
  tilt.add(new THREE.Mesh(shared.core, coreMat));
  const wheels: THREE.Group[] = [];
  for (const [x, z] of WHEEL_POS) {
    const w = new THREE.Group();
    w.position.set(x, RUNNER_WHEEL_R, z);
    w.add(new THREE.Mesh(shared.wheelDark, bodyMat));
    w.add(new THREE.Mesh(shared.wheelGlow, glowMat));
    tilt.add(w);
    wheels.push(w);
  }
  return {
    root,
    tilt,
    wheels,
    glowMat,
    bodyMat,
    coreMat,
    baseGlow,
    setPhaseColor(c: THREE.Color) {
      glowMat.color.copy(c).multiplyScalar(3.4);
      baseGlow.copy(c).multiplyScalar(3.4);
      bodyMat.emissive.copy(c);
    },
    dispose() {
      glowMat.dispose();
      bodyMat.dispose();
      coreMat.dispose();
    },
  };
}
