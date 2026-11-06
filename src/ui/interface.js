// Interfaz HTML/CSS, separada del renderizado 3D.

const $ = (id) => document.getElementById(id);

export class Interface {
  constructor({ totalBalls = 7, onStart, onPause, onResume } = {}) {
    this.hud = $('hud');
    this.fpsEl = $('fps');
    this.stateEl = $('state');
    this.startScreen = $('start-screen');
    this.pauseScreen = $('pause-screen');
    this.errorScreen = $('error-screen');
    this.startBtn = $('start-btn');
    this.toastEl = $('toast');
    this.ballsEl = $('balls');
    this.totalBalls = totalBalls;
    this.onPause = onPause;
    this.onResume = onResume;
    this._toastTimer = 0;
    this._frames = 0;
    this._acc = 0;
    this._lastState = '';

    for (let i = 1; i <= totalBalls; i++) {
      const s = document.createElement('div');
      s.className = 'ball-slot';
      s.textContent = i;
      this.ballsEl.appendChild(s);
    }

    this.startBtn.addEventListener('click', () => {
      this.startScreen.classList.add('hidden');
      this.hud.classList.remove('hidden');
      onStart?.();
    });
    $('pause-btn').addEventListener('click', () => onPause?.());
    $('resume-btn').addEventListener('click', () => onResume?.());
  }

  setReady() {
    this.startBtn.disabled = false;
    this.startBtn.textContent = 'START';
    this.startBtn.focus();
  }

  showPause(paused) {
    this.pauseScreen.classList.toggle('hidden', !paused);
  }

  showError(message) {
    $('error-text').textContent = message;
    this.errorScreen.classList.remove('hidden');
    this.startScreen.classList.add('hidden');
    this.pauseScreen.classList.add('hidden');
  }

  setState(state) {
    if (state !== this._lastState) {
      this._lastState = state;
      this.stateEl.textContent = state;
    }
  }

  setBalls(count) {
    [...this.ballsEl.children].forEach((el, i) => el.classList.toggle('got', i < count));
    if (count >= this.totalBalls) this.toast('¡TODAS LAS ESFERAS DEL DRAGÓN!', 5000);
    else this.toast(`ESFERA DEL DRAGÓN ${count}/${this.totalBalls}`);
  }

  toast(text, ms = 2200) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  /** Llamar cada frame; refresca el contador FPS 2 veces por segundo. */
  tickFps(dt) {
    this._frames++;
    this._acc += dt;
    if (this._acc >= 0.5) {
      this.fpsEl.textContent = Math.round(this._frames / this._acc);
      this._frames = 0;
      this._acc = 0;
    }
  }
}
