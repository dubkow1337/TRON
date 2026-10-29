import { DX, DY, type AIProfile } from './config';
import type { Grid } from './Grid';

export interface AIBikeView {
  id: number;
  alive: boolean;
  cx: number;
  cy: number;
  level: number;
  dir: number;
  speed: number;
  boost: number;
  isPlayer: boolean;
  turning?: boolean;
}

export interface AIWorld {
  grid: Grid;
  bikes: AIBikeView[];
  pickups: { x: number; y: number; active: boolean; type?: string }[];
  rampTargets?: { x: number; z: number }[];
}

/**
 * ИИ программ: оценка пространства заливкой, перехват соперника
 * с упреждением, прижимание к стенам в ловушке, управление турбо
 * и использование ярусов/бонусов.
 */
export class AIController {
  p: AIProfile;
  private cooldown = 0;
  private boostCells = 0;
  private targetId = -1;
  private retarget = 0;

  constructor(p: AIProfile) {
    this.p = p;
  }

  private danger(x: number, y: number, self: AIBikeView, w: AIWorld): boolean {
    for (const o of w.bikes) {
      if (o === self || !o.alive || o.level !== self.level) continue;
      const dx = DX[o.dir];
      const dy = DY[o.dir];
      for (let k = 1; k <= 2; k++) if (o.cx + dx * k === x && o.cy + dy * k === y) return true;
    }
    return false;
  }

  private pickTarget(self: AIBikeView, w: AIWorld): AIBikeView | null {
    this.retarget--;
    if (this.retarget > 0 && this.targetId >= 0) {
      const t = w.bikes.find((b) => b.id === this.targetId);
      if (t && t.alive) return t;
    }
    this.retarget = 80 + ((Math.random() * 140) | 0);
    let best: AIBikeView | null = null;
    let bestD = Infinity;
    for (const o of w.bikes) {
      if (o === self || !o.alive) continue;
      let d = Math.abs(o.cx - self.cx) + Math.abs(o.cy - self.cy);
      if (o.level !== self.level) d += 25; // штраф если на другом ярусе
      if (o.isPlayer) d *= 0.55;
      d *= 0.8 + Math.random() * 0.4;
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    this.targetId = best ? best.id : -1;
    return best;
  }

  /** Возвращает -1 (влево), 0 (прямо), 1 (вправо). Вызывается в центре каждой клетки. */
  decide(self: AIBikeView, w: AIWorld): number {
    const g = w.grid;
    const p = this.p;
    const lvl = self.level || 0;
    if (this.cooldown > 0) this.cooldown--;

    const ahead = g.ray(self.cx, self.cy, self.dir, p.look, lvl);
    // дуга 90° занимает ~TURN_RADIUS клеток хода — реагировать нужно заранее
    const reactDist = Math.min(p.look, 8 + Math.round(self.speed * 0.07));
    const nx0 = self.cx + DX[self.dir];
    const ny0 = self.cy + DY[self.dir];
    const dangerAhead =
      this.danger(nx0, ny0, self, w) || this.danger(nx0 + DX[self.dir], ny0 + DY[self.dir], self, w);

    let consider = ahead < reactDist || dangerAhead;
    if (!consider && this.cooldown <= 0 && Math.random() < p.strategic) consider = true;
    if (!consider || self.turning) return 0; // не рулим посреди поворота
    if (ahead === 0 && Math.random() < p.fatal) return 0; // «проспал» поворот

    const opts = [0, -1, 1];
    const area = [-1, -1, -1];
    const dist = [0, 0, 0];
    let maxArea = 0;
    for (let k = 0; k < 3; k++) {
      const nd = (self.dir + opts[k] + 4) & 3;
      const nx = self.cx + DX[nd];
      const ny = self.cy + DY[nd];
      if (!g.free(nx, ny, lvl)) continue;
      dist[k] = 1 + g.ray(nx, ny, nd, p.look, lvl);
      let a = g.flood(nx, ny, p.flood, lvl);
      if (this.danger(nx, ny, self, w)) a = Math.min(a, 2);
      area[k] = a;
      if (a > maxArea) maxArea = a;
    }
    if (maxArea <= 0) {
      for (let k = 0; k < 3; k++) if (area[k] >= 0) return opts[k];
      return 0;
    }

    const trapped = maxArea < p.flood * 0.95;
    const target = p.aggression > 0.01 ? this.pickTarget(self, w) : null;
    let tx = 0;
    let ty = 0;
    if (target) {
      const d = Math.abs(target.cx - self.cx) + Math.abs(target.cy - self.cy);
      const lead = Math.max(3, Math.min(24, d * 0.55));
      tx = target.cx + DX[target.dir] * lead;
      ty = target.cy + DY[target.dir] * lead;
    }

    // Поиск бонусов поблизости
    let px = 0;
    let py = 0;
    let hasPick = false;
    let bestPd = 40;
    for (const pk of w.pickups) {
      if (!pk.active) continue;
      const d = Math.abs(pk.x - self.cx) + Math.abs(pk.y - self.cy);
      if (d < bestPd) {
        bestPd = d;
        px = pk.x;
        py = pk.y;
        hasPick = true;
      }
    }

    let best = 0;
    let bestS = -Infinity;
    for (let k = 0; k < 3; k++) {
      if (area[k] < 0) continue;
      const nd = (self.dir + opts[k] + 4) & 3;
      const nx = self.cx + DX[nd];
      const ny = self.cy + DY[nd];
      const rel = area[k] / maxArea;
      let s = rel * 100;
      if (rel < 0.7) s -= 250 * (0.7 - rel) + 40;
      s += Math.min(dist[k], p.look) * 2.5;
      if (opts[k] === 0) s += 6;
      if (trapped) s += g.blockedNeighbors(nx, ny, lvl) * 10 * p.hug;
      if (!trapped && rel > 0.9) {
        const x3 = self.cx + DX[nd] * 3;
        const y3 = self.cy + DY[nd] * 3;
        if (target) {
          const d0 = Math.abs(tx - self.cx) + Math.abs(ty - self.cy);
          const d1 = Math.abs(tx - x3) + Math.abs(ty - y3);
          s += (d0 - d1) * p.aggression * 7;
        }
        if (hasPick) {
          const d0 = Math.abs(px - self.cx) + Math.abs(py - self.cy);
          const d1 = Math.abs(px - x3) + Math.abs(py - y3);
          s += (d0 - d1) * 4.0;
        }
        // тяготение к пандусам — программы тоже поднимаются на эстакаду
        if (w.rampTargets) {
          let bd = Infinity;
          let bx = 0;
          let bz = 0;
          for (const rt of w.rampTargets) {
            const dd = Math.abs(rt.x - self.cx) + Math.abs(rt.z - self.cy);
            if (dd < bd) {
              bd = dd;
              bx = rt.x;
              bz = rt.z;
            }
          }
          if (bd < 90) {
            const d0 = bd;
            const d1 = Math.abs(bx - x3) + Math.abs(bz - y3);
            s += (d0 - d1) * 1.6;
          }
        }
      }
      s += (Math.random() - 0.5) * p.noise;
      if (s > bestS) {
        bestS = s;
        best = opts[k];
      }
    }
    if (best !== 0) this.cooldown = 4 + ((Math.random() * 8) | 0);
    return best;
  }

  /** Решение о турбо — вызывается в центре клетки. */
  wantsBoost(self: AIBikeView, w: AIWorld): boolean {
    const p = this.p;
    const lvl = self.level || 0;
    if (this.boostCells > 0) {
      this.boostCells--;
      const ahead = w.grid.ray(self.cx, self.cy, self.dir, 16, lvl);
      if (ahead < 10 || self.boost < 0.04) {
        this.boostCells = 0;
        return false;
      }
      return true;
    }
    if (self.boost > 0.55 && Math.random() < p.boost * 0.02) {
      const ahead = w.grid.ray(self.cx, self.cy, self.dir, 30, lvl);
      if (ahead >= 24) {
        this.boostCells = 15 + ((Math.random() * 40) | 0);
        return true;
      }
    }
    return false;
  }
}
