import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Локальная система: +X — вперёд, начало координат — задняя точка цикла на полу.
export const WHEEL_R = 0.5;
const REAR_X = 0.56;
const FRONT_X = 2.07;
const WHEEL_Y = 0.5;

interface SharedGeo {
  dark: THREE.BufferGeometry;
  glow: THREE.BufferGeometry;
  wheelDark: THREE.BufferGeometry;
  wheelGlow: THREE.BufferGeometry;
}

let shared: SharedGeo | null = null;

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

function tube(pts: number[][], r: number, segs = 48): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, segs, r, 6, false);
}

function limb(a: number[], b: number[], r: number): THREE.BufferGeometry {
  const va = new THREE.Vector3(a[0], a[1], a[2]);
  const vb = new THREE.Vector3(b[0], b[1], b[2]);
  const len = va.distanceTo(vb);
  const g = new THREE.CapsuleGeometry(r, len, 4, 10);
  const dir = vb.clone().sub(va).normalize();
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  const mid = va.add(vb).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

function box(w: number, h: number, d: number, x: number, y: number, z: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function build(): SharedGeo {
  const dark: THREE.BufferGeometry[] = [];
  const glow: THREE.BufferGeometry[] = [];

  // ── Корпус: боковой профиль светоцикла ──
  const s = new THREE.Shape();
  s.moveTo(0.03, 0.5);
  s.quadraticCurveTo(0.03, 0.99, 0.52, 1.07);
  s.quadraticCurveTo(0.88, 1.09, 1.06, 0.87);
  s.quadraticCurveTo(1.27, 0.71, 1.56, 0.8);
  s.quadraticCurveTo(1.8, 0.9, 2.06, 1.07);
  s.quadraticCurveTo(2.62, 1.09, 2.62, 0.55);
  s.quadraticCurveTo(2.62, 0.29, 2.34, 0.26);
  s.lineTo(0.32, 0.26);
  s.quadraticCurveTo(0.03, 0.28, 0.03, 0.5);
  const body = new THREE.ExtrudeGeometry(s, {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.045,
    bevelSegments: 3,
    curveSegments: 18,
  });
  body.translate(0, 0, -0.07);
  dark.push(body);

  // Обтекатель-купол
  const canopy = new THREE.SphereGeometry(0.26, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
  canopy.scale(1.55, 0.55, 0.42);
  canopy.translate(1.98, 1.03, 0);
  dark.push(canopy);

  // ── Пилот (лежачая посадка) ──
  dark.push(limb([0.82, 1.02, 0], [1.42, 1.12, 0], 0.15)); // торс
  const helmet = new THREE.SphereGeometry(0.155, 18, 12);
  helmet.scale(1.3, 1.0, 0.95);
  helmet.translate(1.66, 1.17, 0);
  dark.push(helmet);
  for (const z of [-1, 1]) {
    dark.push(limb([0.86, 0.98, 0.09 * z], [0.6, 0.76, 0.16 * z], 0.075)); // бедро
    dark.push(limb([0.6, 0.76, 0.16 * z], [0.36, 0.6, 0.15 * z], 0.06)); // голень
    dark.push(limb([1.38, 1.08, 0.13 * z], [1.86, 0.95, 0.17 * z], 0.055)); // рука
    glow.push(tube([[0.84, 1.06, 0.12 * z], [0.6, 0.8, 0.205 * z], [0.38, 0.64, 0.19 * z]], 0.011, 16));
    glow.push(tube([[1.36, 1.14, 0.17 * z], [1.62, 1.07, 0.215 * z], [1.86, 0.99, 0.215 * z]], 0.01, 16));
  }
  // спинная линия и полоса шлема
  glow.push(tube([[0.78, 1.15, 0], [1.1, 1.24, 0], [1.42, 1.27, 0]], 0.016, 20));
  glow.push(tube([[1.48, 1.28, 0], [1.66, 1.33, 0], [1.84, 1.2, 0]], 0.014, 16));
  const visor = new THREE.TorusGeometry(0.152, 0.011, 6, 28, Math.PI);
  visor.scale(1.3, 1.0, 0.95);
  visor.rotateY(Math.PI / 2);
  visor.rotateZ(-0.35);
  visor.translate(1.69, 1.16, 0);
  glow.push(visor);

  // ── Культовый Диск Идентичности на спине пилота (Identity Disc) ──
  const discMount = box(0.04, 0.22, 0.22, 1.12, 1.26, 0);
  dark.push(discMount);
  const discOuter = new THREE.TorusGeometry(0.11, 0.014, 6, 32);
  discOuter.rotateY(Math.PI / 2);
  discOuter.rotateZ(-0.25);
  discOuter.translate(1.13, 1.26, 0);
  glow.push(discOuter);
  const discInner = new THREE.TorusGeometry(0.06, 0.009, 4, 24);
  discInner.rotateY(Math.PI / 2);
  discInner.rotateZ(-0.25);
  discInner.translate(1.13, 1.26, 0);
  glow.push(discInner);

  // ── Неоновая подсветка днища (Underglow) над зеркальным полом ──
  glow.push(box(1.8, 0.025, 0.16, 1.32, 0.22, 0));

  // ── Неоновые полосы корпуса ──
  for (const z of [-0.127, 0.127]) {
    glow.push(
      tube(
        [
          [0.11, 0.5, z],
          [0.22, 0.79, z],
          [0.52, 0.97, z],
          [0.9, 0.85, z],
          [1.3, 0.72, z],
          [1.62, 0.76, z],
          [2.06, 0.96, z],
          [2.46, 0.86, z],
          [2.52, 0.52, z],
        ],
        0.017,
        72,
      ),
    );
    glow.push(tube([[0.36, 0.33, z], [1.3, 0.33, z], [2.28, 0.33, z]], 0.012, 12));
  }
  // кормовой и носовой огни
  glow.push(box(0.04, 0.34, 0.26, 0.0, 0.62, 0));
  glow.push(box(0.04, 0.14, 0.3, 2.66, 0.56, 0));
  // контур корпуса — читаемый силуэт светоцикла
  glow.push(tube([[0.06, 0.53, 0], [0.22, 0.86, 0], [0.6, 1.02, 0], [1.05, 0.88, 0], [1.5, 0.78, 0], [2.05, 1.0, 0], [2.5, 0.9, 0], [2.6, 0.55, 0]], 0.016, 72));
  // крылья над колёсами
  for (const z of [-0.15, 0.15]) {
    glow.push(tube([[0.28, 0.62, z], [0.4, 0.94, z], [0.72, 1.03, z], [0.86, 0.9, z]], 0.013, 20));
    glow.push(tube([[1.83, 1.0, z], [2.05, 1.1, z], [2.36, 0.98, z], [2.47, 0.72, z]], 0.013, 20));
  }

  // ── Передняя вилка и маятник заднего колеса ──
  for (const z of [-0.18, 0.18]) {
    dark.push(tube([[1.72, 1.0, z], [1.92, 0.72, z * 1.15], [2.07, 0.5, z * 1.2]], 0.045, 12));
    dark.push(tube([[1.1, 0.62, z * 0.9], [0.8, 0.52, z], [0.56, 0.5, z * 1.1]], 0.045, 12));
  }
  // руль и рычаги
  dark.push(tube([[-0.24, 1.06, 0], [0.06, 1.14, 0], [0.3, 1.08, 0]], 0.05, 10));
  glow.push(tube([[-0.26, 1.08, -0.22], [-0.26, 1.08, 0.22]], 0.018, 8));
  glow.push(tube([[1.84, 1.0, 0], [1.68, 1.18, 0], [1.58, 1.2, 0]], 0.02, 10));

  // ── Выхлопные сопла ──
  for (const z of [-0.24, 0.24]) {
    const nozzle = new THREE.CylinderGeometry(0.07, 0.1, 0.24, 8);
    nozzle.rotateZ(Math.PI / 2);
    nozzle.translate(-0.46, 0.58, z);
    dark.push(nozzle);
    glow.push(new THREE.TorusGeometry(0.09, 0.02, 5, 16).rotateY(Math.PI / 2).translate(-0.58, 0.58, z));
  }

  // ── Колесо (общая геометрия, позиционируется группой) ──
  const wheelDarkList: THREE.BufferGeometry[] = [];
  const wheelGlowList: THREE.BufferGeometry[] = [];
  wheelDarkList.push(new THREE.TorusGeometry(0.36, 0.14, 14, 48));
  const disc = new THREE.CylinderGeometry(0.3, 0.3, 0.26, 32);
  disc.rotateX(Math.PI / 2);
  wheelDarkList.push(disc);
  for (let i = 0; i < 6; i++) {
    const spoke = new THREE.BoxGeometry(0.5, 0.03, 0.045);
    spoke.rotateZ((i * Math.PI) / 3);
    wheelDarkList.push(spoke);
  }
  for (const z of [-1, 1]) {
    const rim = new THREE.TorusGeometry(0.43, 0.017, 6, 64);
    rim.translate(0, 0, 0.125 * z);
    wheelGlowList.push(rim);
    const inner = new THREE.TorusGeometry(0.265, 0.01, 4, 48);
    inner.translate(0, 0, 0.136 * z);
    wheelGlowList.push(inner);
    for (let i = 0; i < 6; i++) {
      const spoke = new THREE.BoxGeometry(0.42, 0.012, 0.018);
      spoke.rotateZ((i * Math.PI) / 3);
      spoke.translate(0, 0, 0.138 * z);
      wheelGlowList.push(spoke);
    }
    for (let i = 0; i < 3; i++) {
      const arc = new THREE.TorusGeometry(0.16, 0.018, 4, 12, 1.15);
      arc.rotateZ((i * Math.PI * 2) / 3);
      arc.translate(0, 0, 0.134 * z);
      wheelGlowList.push(arc);
    }
  }

  return {
    dark: merge(dark),
    glow: merge(glow),
    wheelDark: merge(wheelDarkList),
    wheelGlow: merge(wheelGlowList),
  };
}

export interface BikeModel {
  root: THREE.Group;
  tilt: THREE.Group;
  wheels: THREE.Group[];
  glowMat: THREE.MeshBasicMaterial;
  bodyMat: THREE.MeshStandardMaterial;
  baseGlow: THREE.Color;
  dispose(): void;
}

export function createBikeModel(color: THREE.Color): BikeModel {
  if (!shared) shared = build();
  const baseGlow = color.clone().multiplyScalar(3.2);
  const glowMat = new THREE.MeshBasicMaterial({ color: baseGlow.clone() });
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x07090d,
    metalness: 0.92,
    roughness: 0.3,
    emissive: color.clone(),
    emissiveIntensity: 0.03,
    envMapIntensity: 1.5,
  });
  const root = new THREE.Group();
  const tilt = new THREE.Group();
  root.add(tilt);
  tilt.add(new THREE.Mesh(shared.dark, bodyMat));
  tilt.add(new THREE.Mesh(shared.glow, glowMat));
  // Прозрачный обтекатель с неоновой каймой.
  const windshield = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0x071826,
      metalness: 0.3,
      roughness: 0.08,
      transparent: true,
      opacity: 0.44,
      emissive: color.clone().multiplyScalar(0.18),
      emissiveIntensity: 0.6,
      envMapIntensity: 1.8,
      depthWrite: false,
    }),
  );
  windshield.scale.set(1.15, 0.72, 0.36);
  windshield.position.set(1.96, 1.02, 0);
  tilt.add(windshield);
  const wheels: THREE.Group[] = [];
  for (const x of [REAR_X, FRONT_X]) {
    const w = new THREE.Group();
    w.position.set(x, WHEEL_Y, 0);
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
    baseGlow,
    dispose() {
      glowMat.dispose();
      bodyMat.dispose();
    },
  };
}
