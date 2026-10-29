import type { Bike } from './Bike';
import { PICKUPS, type PickupType, type TierLayout } from './config';

export interface MapPickup {
  x: number;
  y: number;
  level?: number;
  type?: PickupType;
  active: boolean;
}

export class Minimap {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private size = 180;
  private layout: TierLayout | null = null;
  hasTiers = false;
  raceTrack: { a: number; b: number; width: number } | null = null;

  setCanvas(c: HTMLCanvasElement | null) {
    this.canvas = c;
    this.ctx = c ? c.getContext('2d') : null;
  }

  reset(size: number, layout: TierLayout | null = null, raceTrack: { a: number; b: number; width: number } | null = null) {
    this.size = size;
    this.layout = layout;
    this.hasTiers = !!layout;
    this.raceTrack = raceTrack;
  }

  draw(bikes: Bike[], pickups: MapPickup[], time: number, beatPulse = 0) {
    const c = this.ctx;
    const cv = this.canvas;
    if (!c || !cv) return;
    const W = cv.width;
    const H = cv.height;
    const half = this.size / 2;
    const s = W / this.size;
    c.clearRect(0, 0, W, H);
    c.fillStyle = 'rgba(0, 12, 20, 0.76)';
    c.fillRect(0, 0, W, H);

    // Сетка
    c.strokeStyle = 'rgba(60, 210, 255, 0.08)';
    c.lineWidth = 1;
    c.beginPath();
    for (let g = 0; g <= this.size; g += 15) {
      const p = Math.round(g * s) + 0.5;
      c.moveTo(p, 0);
      c.lineTo(p, H);
      c.moveTo(0, p);
      c.lineTo(W, p);
    }
    c.stroke();

    // Очертания второго яруса (эстакада крестом + пандусы)
    if (this.layout) {
      const L = this.layout;
      const rx = (v: number) => (v + half) * s;
      c.fillStyle = 'rgba(34, 238, 255, 0.07)';
      c.strokeStyle = 'rgba(34, 238, 255, 0.4)';
      c.lineWidth = 1.4;
      for (const r of L.deck) {
        const x = rx(r.x0);
        const y = rx(r.z0);
        c.fillRect(x, y, (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
        c.strokeRect(x, y, (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
      }
      c.strokeStyle = 'rgba(255, 190, 60, 0.5)';
      for (const r of L.ramps) {
        c.beginPath();
        c.moveTo(rx(r.x0), rx(r.z0));
        c.lineTo(rx(r.x1), rx(r.z1));
        c.lineWidth = Math.max(2, L.armWidth * s * 0.7);
        c.stroke();
      }
      c.fillStyle = 'rgba(255, 170, 30, 0.55)';
      for (const p of L.pads) {
        c.beginPath();
        c.arc(rx(p.x), rx(p.z), Math.max(3, L.padR * s * 1.6), 0, Math.PI * 2);
        c.fill();
      }
    }

    // Гоночная трасса: овал и позиции.
    if (this.raceTrack) {
      const { a, b, width } = this.raceTrack;
      c.save();
      c.translate(W / 2, H / 2);
      c.strokeStyle = 'rgba(120, 240, 255, 0.7)';
      c.lineWidth = Math.max(2, width * s * 0.5);
      c.beginPath();
      c.ellipse(0, 0, a * s, b * s, 0, 0, Math.PI * 2);
      c.stroke();
      c.strokeStyle = 'rgba(255, 200, 90, 0.9)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.ellipse(0, 0, a * s, b * s, 0, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    // Световые стены (3D-полилиния проецируется на XZ)
    c.lineCap = 'round';
    c.lineJoin = 'round';
    for (const b of bikes) {
      if (b.cleared) continue;
      const pts = b.mapPts;
      if (pts.length < 4) continue;
      c.globalAlpha = b.alive ? 0.9 : Math.max(0, b.collapse) * 0.75;
      c.strokeStyle = b.css;
      c.lineWidth = b.level === 1 ? Math.max(2.6, s * 1.4) : Math.max(1.6, s * 0.9);
      c.shadowColor = b.css;
      c.shadowBlur = b.level === 1 ? 6 : 3;
      c.beginPath();
      c.moveTo((pts[0] + half) * s, (pts[1] + half) * s);
      for (let i = 2; i < pts.length; i += 2) c.lineTo((pts[i] + half) * s, (pts[i + 1] + half) * s);
      c.lineTo((b.px + half) * s, (b.pz + half) * s);
      c.stroke();
    }
    c.globalAlpha = 1;

    // Бонусы
    for (const p of pickups) {
      if (!p.active) continue;
      const x = (p.x + 0.5) * s;
      const y = (p.y + 0.5) * s;
      const col = p.type && PICKUPS[p.type] ? PICKUPS[p.type].css : '#ffffff';
      const r = (2.6 + Math.sin(time * 6) * 0.7) * (1.0 + beatPulse * 0.4);
      c.fillStyle = col;
      c.shadowColor = col;
      c.shadowBlur = 8;
      c.beginPath();
      c.moveTo(x, y - r - 1);
      c.lineTo(x + r, y);
      c.lineTo(x, y + r + 1);
      c.lineTo(x - r, y);
      c.closePath();
      c.fill();
    }

    // Светоциклы
    for (const b of bikes) {
      if (!b.alive) continue;
      const x = (b.px + half) * s;
      const y = (b.pz + half) * s;
      c.save();
      c.translate(x, y);
      c.rotate(b.angle);
      c.shadowColor = b.css;
      c.shadowBlur = 10;
      c.fillStyle = b.isPlayer ? '#ffffff' : b.css;
      const k = b.isPlayer ? 1.35 : 1;
      c.beginPath();
      c.moveTo(5 * k, 0);
      c.lineTo(-4 * k, -3.6 * k);
      c.lineTo(-2 * k, 0);
      c.lineTo(-4 * k, 3.6 * k);
      c.closePath();
      c.fill();
      if (b.isPlayer) {
        c.strokeStyle = b.css;
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(0, 0, 9 + Math.sin(time * 5) * 1.5, 0, Math.PI * 2);
        c.stroke();
      }
      if (b.level === 1) {
        c.strokeStyle = '#fff';
        c.lineWidth = 1;
        c.strokeRect(-6, -6, 12, 12);
      }
      c.restore();
    }
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(80, 230, 255, 0.85)';
    c.lineWidth = 2;
    c.strokeRect(1, 1, W - 2, H - 2);
  }
}
