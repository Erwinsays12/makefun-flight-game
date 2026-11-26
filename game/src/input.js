// AERIS Ridge Runner — keyboard + mouse input. Keys are read as a live
// axis state each frame; toggles (flaps, gear, views, pause) fire on edges.
export class Input {
  constructor() {
    this.keys = new Set();
    this.pitchAxis = 0;
    this.rollAxis = 0;
    this.throttleDelta = 0;
    this.brake = false;
    this.flaps = false;
    this.gearDown = true;
    this.onToggle = null; // (name) => void — flaps | gear | view | pause | mute | restart
    this.onAnyKey = null;
    this.onMenuKey = null; // (key) => void while on the menu screen
    this.mouseOrbit = 0;
    this._dragging = false;
    this._lastX = 0;
    window.addEventListener('keydown', (e) => this._down(e));
    window.addEventListener('keyup', (e) => this._up(e));
    window.addEventListener('blur', () => this.keys.clear());
  }

  _down(e) {
    if (e.repeat) {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      return;
    }
    this.keys.add(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    if (this.onAnyKey) this.onAnyKey();
    if (e.key === 'f' || e.key === 'F') {
      this.flaps = !this.flaps;
      if (this.onToggle) this.onToggle('flaps');
    }
    if (e.key === 'g' || e.key === 'G') {
      this.gearDown = !this.gearDown;
      if (this.onToggle) this.onToggle('gear');
    }
    if (e.key === 'c' || e.key === 'C') if (this.onToggle) this.onToggle('view');
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') if (this.onToggle) this.onToggle('pause');
    if (e.key === 'm' || e.key === 'M') if (this.onToggle) this.onToggle('mute');
    if (e.key === 'r' || e.key === 'R') if (this.onToggle) this.onToggle('restart');
    if (this.onMenuKey) this.onMenuKey(e.key);
  }

  _up(e) {
    this.keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  }

  attachMouse(canvas) {
    canvas.addEventListener('pointerdown', (e) => {
      this._dragging = true;
      this._lastX = e.clientX;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this._dragging) return;
      this.mouseOrbit += (e.clientX - this._lastX) * 0.004;
      this._lastX = e.clientX;
    });
    const end = () => { this._dragging = false; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /** Recompute the per-frame control state from the held keys. */
  poll() {
    const k = this.keys;
    const up = k.has('ArrowUp') || k.has('w');
    const down = k.has('ArrowDown') || k.has('s');
    const left = k.has('ArrowLeft') || k.has('a');
    const right = k.has('ArrowRight') || k.has('d');
    this.pitchAxis = (up ? 1 : 0) - (down ? 1 : 0);
    this.rollAxis = (right ? 1 : 0) - (left ? 1 : 0);
    const thrUp = k.has('Shift') || k.has('+') || k.has('=');
    const thrDown = k.has('Control') || k.has('-') || k.has('_');
    this.throttleDelta = (thrUp ? 1 : 0) - (thrDown ? 1 : 0);
    this.brake = k.has(' ');
    return {
      pitchAxis: this.pitchAxis,
      rollAxis: this.rollAxis,
      throttleDelta: this.throttleDelta,
      brake: this.brake,
    };
  }
}
