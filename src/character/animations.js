// Sistema de animación procedural: cada estado genera una pose objetivo
// (ángulos por articulación) y la pose actual se amortigua hacia ella.

export const STATES = {
  IDLE: 'IDLE',
  WALK: 'WALK',
  RUN: 'RUN',
  JUMP: 'JUMP',
  FALL: 'FALL',
  LANDING: 'LANDING',
};

const HIPS_Y = 0.68;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function emptyPose() {
  const p = {
    hipsY: HIPS_Y, hipsRX: 0, torsoRX: 0, torsoRY: 0, torsoRZ: 0, torsoSY: 1,
    headRX: 0, headRZ: 0, headRY: 0, hairRX: 0, hairRZ: 0,
  };
  for (let i = 0; i < 2; i++) {
    Object.assign(p, {
      [`shX${i}`]: 0, [`shZ${i}`]: 0, [`elX${i}`]: 0,
      [`hpX${i}`]: 0, [`hpZ${i}`]: 0, [`knX${i}`]: 0, [`anX${i}`]: 0,
    });
  }
  return p;
}

export class GokuAnimator {
  constructor(goku) {
    this.goku = goku;
    this.state = STATES.IDLE;
    this.time = 0;
    this.phase = 0; // fase del ciclo de paso
    this.current = emptyPose();
    this.target = emptyPose();
  }

  /**
   * @param {number} dt
   * @param {string} state estado actual del personaje
   * @param {{speed:number, vy:number}} motion
   */
  update(dt, state, motion) {
    this.state = state;
    this.time += dt;
    const { speed, vy } = motion;

    if (state === STATES.WALK) this.phase += dt * speed * 1.45;
    else if (state === STATES.RUN) this.phase += dt * speed * 0.95;
    else this.phase += dt * 3; // continúa suavemente al parar

    this._computeTarget(state, speed, vy);

    // Amortiguación exponencial: transiciones suaves entre estados.
    const k = state === STATES.LANDING ? 28 : state === STATES.JUMP ? 22 : 16;
    const a = 1 - Math.exp(-k * dt);
    const c = this.current;
    const t = this.target;
    for (const key in c) c[key] += (t[key] - c[key]) * a;

    this._apply();
  }

  _computeTarget(state, speed, vy) {
    const t = this.target;
    Object.assign(t, emptyPose());
    const ph = this.phase;
    const tm = this.time;

    // pelo reacciona a la velocidad vertical y de avance
    t.hairRX = clamp(vy * -0.012, -0.35, 0.35) - speed * 0.012;
    t.hairRZ = Math.sin(tm * 3) * 0.05;

    switch (state) {
      case STATES.IDLE: {
        const b = Math.sin(tm * 2.2);
        t.hipsY = HIPS_Y + b * 0.006 - 0.01;
        t.torsoSY = 1 + b * 0.018;
        t.torsoRX = 0.03 + b * 0.01;
        t.headRX = -0.03 - b * 0.012;
        t.headRY = Math.sin(tm * 0.7) * 0.12;
        t.headRZ = Math.sin(tm * 0.5) * 0.04;
        t.hairRZ = Math.sin(tm * 1.3) * 0.06;
        for (let i = 0; i < 2; i++) {
          const s = i === 0 ? 1 : -1;
          t[`shX${i}`] = -0.1 + Math.sin(tm * 2.2 + i) * 0.03;
          t[`shZ${i}`] = s * (0.14 + b * 0.03);
          t[`elX${i}`] = -0.28;
          t[`hpZ${i}`] = s * 0.04;
        }
        break;
      }
      case STATES.WALK:
      case STATES.RUN: {
        const run = state === STATES.RUN;
        const legAmp = run ? 1.0 : 0.6;
        const knee = run ? 1.7 : 0.95;
        const armAmp = run ? 1.05 : 0.5;
        const elbow = run ? -1.45 : -0.45;
        t.hipsY = HIPS_Y - (run ? 0.07 : 0.025) + Math.abs(Math.cos(ph)) * (run ? 0.09 : 0.045);
        t.torsoRX = run ? 0.38 : 0.06;
        t.torsoRY = Math.sin(ph) * (run ? 0.3 : 0.14);
        t.torsoRZ = Math.cos(ph) * 0.04;
        t.headRX = run ? -0.25 : -0.04;
        t.headRY = -t.torsoRY * 0.6;
        for (let i = 0; i < 2; i++) {
          const s = i === 0 ? 1 : -1;
          const p = ph + i * Math.PI;
          t[`hpX${i}`] = -Math.sin(p) * legAmp - (run ? 0.15 : 0);
          t[`knX${i}`] = Math.max(0, Math.cos(p)) * knee + (run ? 0.15 : 0.05);
          t[`anX${i}`] = -(t[`hpX${i}`] + t[`knX${i}`]) * 0.55;
          t[`shX${i}`] = Math.sin(p) * armAmp;
          t[`shZ${i}`] = s * (run ? 0.1 : 0.12);
          t[`elX${i}`] = elbow + (run ? Math.sin(p) * 0.3 : 0);
        }
        break;
      }
      case STATES.JUMP: {
        t.hipsY = HIPS_Y;
        t.torsoRX = -0.08;
        t.headRX = 0.1;
        for (let i = 0; i < 2; i++) {
          const s = i === 0 ? 1 : -1;
          t[`shX${i}`] = -2.5;
          t[`shZ${i}`] = s * 0.35;
          t[`elX${i}`] = -0.25;
          t[`hpX${i}`] = i === 0 ? -1.0 : -0.25;
          t[`knX${i}`] = i === 0 ? 1.35 : 0.55;
          t[`anX${i}`] = i === 0 ? 0.0 : 0.35;
          t[`hpZ${i}`] = s * 0.05;
        }
        break;
      }
      case STATES.FALL: {
        t.hipsY = HIPS_Y;
        t.torsoRX = 0.08;
        t.headRX = -0.1;
        t.torsoRZ = Math.sin(tm * 9) * 0.05;
        for (let i = 0; i < 2; i++) {
          const s = i === 0 ? 1 : -1;
          t[`shX${i}`] = -0.35 + Math.sin(tm * 10 + i * 2) * 0.12;
          t[`shZ${i}`] = s * (1.25 + Math.sin(tm * 10 + i) * 0.1);
          t[`elX${i}`] = -0.35;
          t[`hpX${i}`] = i === 0 ? -0.4 : -0.1;
          t[`knX${i}`] = i === 0 ? 0.6 : 0.3;
          t[`anX${i}`] = 0.35;
          t[`hpZ${i}`] = s * 0.12;
        }
        break;
      }
      case STATES.LANDING: {
        t.hipsY = HIPS_Y - 0.2;
        t.torsoRX = 0.45;
        t.headRX = -0.3;
        for (let i = 0; i < 2; i++) {
          const s = i === 0 ? 1 : -1;
          t[`shX${i}`] = -0.7;
          t[`shZ${i}`] = s * 0.5;
          t[`elX${i}`] = -0.5;
          t[`hpX${i}`] = -0.95;
          t[`knX${i}`] = 1.7;
          t[`anX${i}`] = -0.7;
          t[`hpZ${i}`] = s * 0.12;
        }
        break;
      }
      default:
        break;
    }
  }

  _apply() {
    const g = this.goku;
    const c = this.current;
    g.hips.position.y = c.hipsY;
    g.hips.rotation.x = c.hipsRX;
    g.torso.rotation.set(c.torsoRX, c.torsoRY, c.torsoRZ);
    g.torso.scale.y = c.torsoSY;
    g.head.rotation.set(c.headRX, c.headRY, c.headRZ);
    g.hair.rotation.set(c.hairRX, 0, c.hairRZ);
    for (let i = 0; i < 2; i++) {
      const arm = g.arms[i];
      arm.shoulder.rotation.set(c[`shX${i}`], 0, c[`shZ${i}`]);
      arm.elbow.rotation.x = c[`elX${i}`];
      const leg = g.legs[i];
      leg.hip.rotation.set(c[`hpX${i}`], 0, c[`hpZ${i}`]);
      leg.knee.rotation.x = c[`knX${i}`];
      leg.ankle.rotation.x = c[`anX${i}`];
    }
  }
}
