import { DX, DY, LEVEL_HEIGHT, rampHeight, type RampDef, type TierLayout } from './config';

/**
 * Сетка занятости арены с двумя ярусами, эстакадой, пандусами и трамплинами.
 * 0 — свободно, 1..N — id владельца стены + 1. За пределами — 255 (граница).
 */
export class Grid {
  size = 0;
  cells0: Uint8Array = new Uint8Array(0); // стены нижнего яруса
  cells1: Uint8Array = new Uint8Array(0); // стены верхнего яруса (эстакада)
  deck: Uint8Array = new Uint8Array(0); // клетки эстакады
  rampIdx: Int8Array = new Int8Array(0); // индекс пандуса + 1
  padIdx: Uint8Array = new Uint8Array(0); // клетки трамплинов

  ramps: RampDef[] = [];
  pads: { x: number; z: number; r: number }[] = [];

  private stamp: Uint32Array = new Uint32Array(0);
  private gen = 1;
  private queue: Int32Array = new Int32Array(0);

  reset(size: number, layout: TierLayout | null) {
    if (size !== this.size) {
      this.size = size;
      this.cells0 = new Uint8Array(size * size);
      this.cells1 = new Uint8Array(size * size);
      this.deck = new Uint8Array(size * size);
      this.rampIdx = new Int8Array(size * size);
      this.padIdx = new Uint8Array(size * size);
      this.stamp = new Uint32Array(size * size);
      this.queue = new Int32Array(size * size);
      this.gen = 1;
    } else {
      this.cells0.fill(0);
      this.cells1.fill(0);
      this.deck.fill(0);
      this.rampIdx.fill(0);
      this.padIdx.fill(0);
    }
    this.ramps.length = 0;
    this.pads.length = 0;
    if (layout) this.applyLayout(layout);
  }

  private applyLayout(l: TierLayout) {
    const S = this.size;
    const half = S / 2;
    for (const r of l.deck) {
      const cx0 = Math.max(0, Math.floor(r.x0 + half));
      const cx1 = Math.min(S - 1, Math.ceil(r.x1 + half));
      const cz0 = Math.max(0, Math.floor(r.z0 + half));
      const cz1 = Math.min(S - 1, Math.ceil(r.z1 + half));
      for (let y = cz0; y <= cz1; y++) for (let x = cx0; x <= cx1; x++) this.deck[y * S + x] = 1;
    }
    l.ramps.forEach((r, i) => {
      this.ramps.push(r);
      const cx0 = Math.max(0, Math.floor(r.x0 + half));
      const cx1 = Math.min(S - 1, Math.ceil(r.x1 + half));
      const cz0 = Math.max(0, Math.floor(r.z0 + half));
      const cz1 = Math.min(S - 1, Math.ceil(r.z1 + half));
      for (let y = cz0; y <= cz1; y++) for (let x = cx0; x <= cx1; x++) this.rampIdx[y * S + x] = i + 1;
    });
    l.pads.forEach((p) => {
      this.pads.push({ x: p.x, z: p.z, r: l.padR });
      const cx0 = Math.max(0, Math.floor(p.x + half - l.padR));
      const cx1 = Math.min(S - 1, Math.ceil(p.x + half + l.padR));
      const cz0 = Math.max(0, Math.floor(p.z + half - l.padR));
      const cz1 = Math.min(S - 1, Math.ceil(p.z + half + l.padR));
      for (let y = cz0; y <= cz1; y++) for (let x = cx0; x <= cx1; x++) this.padIdx[y * S + x] = 1;
    });
  }

  inside(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.size && y < this.size;
  }

  get(x: number, y: number, level = 0): number {
    if (!this.inside(x, y)) return 255;
    return (level === 1 ? this.cells1 : this.cells0)[y * this.size + x];
  }

  free(x: number, y: number, level = 0): boolean {
    if (!this.inside(x, y)) return false;
    return (level === 1 ? this.cells1 : this.cells0)[y * this.size + x] === 0;
  }

  set(x: number, y: number, v: number, level = 0) {
    if (this.inside(x, y)) (level === 1 ? this.cells1 : this.cells0)[y * this.size + x] = v;
  }

  isDeck(x: number, y: number) {
    return this.inside(x, y) && this.deck[y * this.size + x] === 1;
  }

  rampAt(x: number, y: number): RampDef | null {
    if (!this.inside(x, y)) return null;
    const i = this.rampIdx[y * this.size + x];
    return i > 0 ? this.ramps[i - 1] : null;
  }

  onPad(x: number, y: number) {
    return this.inside(x, y) && this.padIdx[y * this.size + x] === 1;
  }

  /**
   * Высота поверхности (пола/эстакады/пандуса) под точкой для байка на уровне `level`.
   */
  surfaceY(wx: number, wz: number, level: number, half: number): number {
    const cx = Math.floor(wx + half);
    const cy = Math.floor(wz + half);
    const r = this.rampAt(cx, cy);
    if (r) return rampHeight(r, wx, wz);
    if (level >= 1 && this.isDeck(cx, cy)) return LEVEL_HEIGHT;
    return 0;
  }

  ray(x: number, y: number, dir: number, max: number, level = 0): number {
    const dx = DX[dir];
    const dy = DY[dir];
    let n = 0;
    for (let i = 1; i <= max; i++) {
      if (!this.free(x + dx * i, y + dy * i, level)) break;
      n++;
    }
    return n;
  }

  flood(sx: number, sy: number, cap: number, level = 0): number {
    if (!this.free(sx, sy, level)) return 0;
    this.gen++;
    if (this.gen >= 0xfffffff0) {
      this.stamp.fill(0);
      this.gen = 1;
    }
    const S = this.size;
    const st = this.stamp;
    const q = this.queue;
    const c = level === 1 ? this.cells1 : this.cells0;
    const g = this.gen;
    let head = 0;
    let tail = 0;
    const s = sy * S + sx;
    st[s] = g;
    q[tail++] = s;
    let count = 0;
    while (head < tail && count < cap) {
      const i = q[head++];
      count++;
      const x = i % S;
      if (x + 1 < S) {
        const j = i + 1;
        if (c[j] === 0 && st[j] !== g) {
          st[j] = g;
          q[tail++] = j;
        }
      }
      if (x > 0) {
        const j = i - 1;
        if (c[j] === 0 && st[j] !== g) {
          st[j] = g;
          q[tail++] = j;
        }
      }
      if (i + S < S * S) {
        const j = i + S;
        if (c[j] === 0 && st[j] !== g) {
          st[j] = g;
          q[tail++] = j;
        }
      }
      if (i - S >= 0) {
        const j = i - S;
        if (c[j] === 0 && st[j] !== g) {
          st[j] = g;
          q[tail++] = j;
        }
      }
    }
    return count;
  }

  blockedNeighbors(x: number, y: number, level = 0): number {
    let n = 0;
    for (let d = 0; d < 4; d++) if (!this.free(x + DX[d], y + DY[d], level)) n++;
    return n;
  }

  /** Свободная точка для спавна на уровне. */
  findSpawn(preferRing: number, half: number): { x: number; z: number } {
    for (let t = 0; t < 200; t++) {
      const a = Math.random() * Math.PI * 2;
      const r = preferRing * (0.75 + Math.random() * 0.3);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const cx = Math.floor(x + half);
      const cy = Math.floor(z + half);
      if (this.free(cx, cy, 0) && !this.isDeck(cx, cy) && this.rampIdx[cy * this.size + cx] === 0) {
        return { x, z };
      }
    }
    return { x: 0, z: -preferRing };
  }
}
