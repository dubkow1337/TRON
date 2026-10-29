export class Input {
  boost = false;
  brake = false;
  onCamera: (() => void) | null = null;
  onShoot: (() => void) | null = null;
  onPause: (() => void) | null = null;
  private keysBoost = new Set<string>();
  private keysBrake = new Set<string>();
  private keysLeft = new Set<string>();
  private keysRight = new Set<string>();
  private touchLeft = false;
  private touchRight = false;

  get steer(): number {
    const left = this.keysLeft.size > 0 || this.touchLeft;
    const right = this.keysRight.size > 0 || this.touchRight;
    return Number(right) - Number(left);
  }

  private down = (e: KeyboardEvent) => {
    const k = e.code;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'SELECT') return;
    if (k === 'ArrowLeft' || k === 'KeyA') {
      this.keysLeft.add(k);
      e.preventDefault();
    } else if (k === 'ArrowRight' || k === 'KeyD') {
      this.keysRight.add(k);
      e.preventDefault();
    } else if (k === 'ArrowUp' || k === 'KeyW' || k === 'ShiftLeft' || k === 'ShiftRight' || k === 'Space') {
      this.keysBoost.add(k);
      this.boost = true;
      e.preventDefault();
    } else if (k === 'ArrowDown' || k === 'KeyS') {
      this.keysBrake.add(k);
      this.brake = true;
      e.preventDefault();
    } else if (k === 'KeyF') {
      if (!e.repeat) this.onShoot?.();
      e.preventDefault();
    } else if (k === 'KeyC') {
      if (!e.repeat) this.onCamera?.();
    } else if (k === 'Escape' || k === 'KeyP') {
      if (!e.repeat) this.onPause?.();
    }
  };

  private up = (e: KeyboardEvent) => {
    const k = e.code;
    this.keysLeft.delete(k);
    this.keysRight.delete(k);
    if (this.keysBoost.delete(k)) this.boost = this.keysBoost.size > 0 || this.touchBoost;
    if (this.keysBrake.delete(k)) this.brake = this.keysBrake.size > 0 || this.touchBrake;
  };

  reset = () => {
    this.keysBoost.clear();
    this.keysBrake.clear();
    this.keysLeft.clear();
    this.keysRight.clear();
    this.touchLeft = false;
    this.touchRight = false;
    this.touchBoost = false;
    this.touchBrake = false;
    this.boost = false;
    this.brake = false;
  };

  private touchBoost = false;
  private touchBrake = false;

  setTouchSteer(direction: number, pressed: boolean) {
    if (direction < 0) this.touchLeft = pressed;
    if (direction > 0) this.touchRight = pressed;
  }

  setTouchBoost(v: boolean) {
    this.touchBoost = v;
    this.boost = v || this.keysBoost.size > 0;
  }

  setTouchBrake(v: boolean) {
    this.touchBrake = v;
    this.brake = v || this.keysBrake.size > 0;
  }

  private pointer = (e: PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement | null)?.tagName !== 'CANVAS') return;
    this.onShoot?.();
  };

  attach() {
    window.addEventListener('keydown', this.down);
    window.addEventListener('pointerdown', this.pointer);
    window.addEventListener('keyup', this.up);
    window.addEventListener('blur', this.reset);
  }

  detach() {
    window.removeEventListener('keydown', this.down);
    window.removeEventListener('pointerdown', this.pointer);
    window.removeEventListener('keyup', this.up);
    window.removeEventListener('blur', this.reset);
    this.reset();
  }
}
