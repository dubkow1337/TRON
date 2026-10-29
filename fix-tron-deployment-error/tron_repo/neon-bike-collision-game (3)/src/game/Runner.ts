import * as THREE from 'three';
import { BASE_SPEED, NEON } from './config';
import { createRunnerModel, RUNNER_LEN, RUNNER_WHEEL_R, type RunnerModel } from './RunnerModel';
import { Bike, type BikeOptions } from './Bike';

export type RunnerState = 'hunt' | 'telegraph' | 'charge' | 'stunned';

export interface RunnerOptions extends BikeOptions {
  hp?: number;
}

/**
 * ДЖАГГЕРНАУТ — четырёхколёсный Light Runner.
 * Тяжёлая техника: широкая стена, таранный удар, броня против чужих стен,
 * уязвимые ядра (HP). Боится только стен игрока, границ и ЭМИ.
 */
export class Runner extends Bike {
  override kind: 'bike' | 'runner' = 'runner';
  hp: number;
  maxHp: number;
  armor: number;
  armorMax = 2;
  armorRegen = 0;
  state: RunnerState = 'hunt';
  stateT = 0;
  chargeDir = 0;
  chargeCd = 6;
  shockT = 14;
  warnCd = 0;
  ramCd = 0;
  crushR = 2.7;
  coreFlash = 0;
  runnerModel: RunnerModel;
  phaseAnnounced = 0;

  constructor(o: RunnerOptions) {
    super(o);
    this.hp = o.hp ?? 5;
    this.maxHp = this.hp;
    this.armor = this.armorMax;
    // тяжёлая платформа: длиннее, шире стена, вальяжные повороты
    this.bodyLen = RUNNER_LEN;
    this.trailWidth = 3;
    this.turnRadiusFactor = 2.1;
    this.maxTurnRate = 2.6;
    this.crushR = 2.7;
    // заменяем лёгкую модель на внедорожник
    this.model.dispose();
    this.runnerModel = createRunnerModel(this.color);
    this.model = this.runnerModel;
    this.trail.mat.uniforms.uIntensity.value = 1.35;
    this.trail.mat.uniforms.uFade.value.set(3, 20);
    this.trail.width = this.trailWidth;
    this.phaseAnnounced = this.phase;
    this.chargeCd = 7;
  }

  override get isRunner() {
    return true;
  }

  get phase(): number {
    const f = this.hp / this.maxHp;
    if (f > 0.66) return 1;
    if (f > 0.33) return 2;
    return 3;
  }

  get charging() {
    return this.state === 'charge';
  }

  /** Цвет фазы: янтарь → красный → белый. */
  phaseColor(out: THREE.Color): THREE.Color {
    const p = this.phase;
    if (p === 1) return out.setHex(NEON.amber.hex);
    if (p === 2) return out.setHex(NEON.red.hex);
    return out.setHex(NEON.white.hex);
  }

  /** Скорость босса с учётом состояния и фазы. */
  runnerTargetSpeed(): number {
    if (this.state === 'stunned') return 0;
    if (this.state === 'telegraph') return BASE_SPEED * 0.45;
    if (this.state === 'charge') return BASE_SPEED * 2.0;
    return BASE_SPEED + 2 + (this.phase - 1) * 2.5 + (this.boosting ? 10 : 0);
  }

  override syncVisual(dt: number, time: number) {
    super.syncVisual(dt, time);
    if (!this.alive) return;
    // пробуксовка всех четырёх колёс
    const spin = (this.speed * dt) / RUNNER_WHEEL_R;
    for (let i = 0; i < this.model.wheels.length; i++) {
      const w = this.model.wheels[i];
      w.rotation.z -= spin * (this.state === 'charge' ? 1.6 : 1);
      // лёгкое подруливание передних колёс
      if (i >= 2) w.rotation.y = THREE.MathUtils.clamp(-this.angVel * 0.35, -0.4, 0.4);
    }
    // пульсация ядра + вспышка при уроне
    if (this.coreFlash > 0) this.coreFlash = Math.max(0, this.coreFlash - dt * 3);
    const pulse = 0.75 + 0.25 * Math.sin(time * (4 + this.phase * 2));
    const flash = this.coreFlash > 0 ? 3.5 : 0;
    this.runnerModel.coreMat.color.setRGB(1.4 * pulse + flash, 0.5 * pulse + flash * 0.6, 0.35 * pulse + flash * 0.4);
  }
}
