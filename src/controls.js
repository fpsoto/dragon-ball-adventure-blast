// Entrada: teclado y ratón. No conoce nada del juego, solo expone el estado.

const MOVE_KEYS = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  ShiftLeft: 'run', ShiftRight: 'run',
  Space: 'jump',
  KeyQ: 'camLeft',
  KeyE: 'camRight',
};

export class Controls {
  constructor(canvas, { onPauseToggle } = {}) {
    this.canvas = canvas;
    this.onPauseToggle = onPauseToggle;
    this.keys = { forward: false, back: false, left: false, right: false, run: false, jump: false, camLeft: false, camRight: false };
    this.jumpPressed = false; // pulso de un solo frame al pulsar SPACE
    this.dragging = false;
    this.lookDX = 0;
    this.lookDY = 0;
    this.wheel = 0;

    this._onKeyDown = (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!e.repeat) this.onPauseToggle?.();
        e.preventDefault();
        return;
      }
      const k = MOVE_KEYS[e.code];
      if (!k) return;
      e.preventDefault();
      if (k === 'jump' && !this.keys.jump) this.jumpPressed = true;
      this.keys[k] = true;
    };
    this._onKeyUp = (e) => {
      const k = MOVE_KEYS[e.code];
      if (k) this.keys[k] = false;
    };
    this._onBlur = () => { for (const k in this.keys) this.keys[k] = false; this._endDrag(); };

    this._onPointerDown = (e) => {
      this.dragging = true;
      this.canvas.classList.add('dragging');
      this.canvas.setPointerCapture?.(e.pointerId);
    };
    this._onPointerMove = (e) => {
      if (!this.dragging) return;
      this.lookDX += e.movementX || 0;
      this.lookDY += e.movementY || 0;
    };
    this._endDrag = () => { this.dragging = false; this.canvas.classList.remove('dragging'); };
    this._onWheel = (e) => { e.preventDefault(); this.wheel += Math.sign(e.deltaY); };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('blur', this._onBlur);
    canvas.addEventListener('pointerdown', this._onPointerDown);
    canvas.addEventListener('pointermove', this._onPointerMove);
    canvas.addEventListener('pointerup', this._endDrag);
    canvas.addEventListener('pointercancel', this._endDrag);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
  }

  /** Eje de movimiento normalizado (x: derecha+, z: adelante+). */
  get axis() {
    const k = this.keys;
    let x = (k.right ? 1 : 0) - (k.left ? 1 : 0);
    let z = (k.forward ? 1 : 0) - (k.back ? 1 : 0);
    const len = Math.hypot(x, z);
    if (len > 1) { x /= len; z /= len; }
    return { x, z };
  }

  /** Devuelve y reinicia los deltas acumulados (ratón / rueda / salto). */
  consume() {
    const out = { lookDX: this.lookDX, lookDY: this.lookDY, wheel: this.wheel, jumpPressed: this.jumpPressed };
    this.lookDX = this.lookDY = this.wheel = 0;
    this.jumpPressed = false;
    return out;
  }
}
