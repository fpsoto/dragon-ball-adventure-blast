import * as THREE from 'three';

const MIN_DIST = 3.5;
const MAX_DIST = 13;

const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));

export class ThirdPersonCamera {
  constructor(camera, physics) {
    this.camera = camera;
    this.physics = physics;
    this.yaw = 0;
    this.pitch = 0.3;
    this.distance = 7.5;
    this.currentDistance = this.distance;
    this.focus = new THREE.Vector3(); // punto suavizado que sigue al personaje
    this.baseFov = 58;
    this._dir = new THREE.Vector3();
    this._pos = new THREE.Vector3();
    this._initialized = false;
  }

  snapTo(target) {
    this.focus.set(target.x, target.y + 1.1, target.z);
    this._initialized = true;
  }

  /**
   * @param {number} dt
   * @param {THREE.Vector3} target posición del personaje (pies)
   * @param {{lookDX:number, lookDY:number, wheel:number}} look entrada de ratón
   * @param {{camLeft:boolean, camRight:boolean}} keys
   * @param {number} speed velocidad horizontal del personaje
   */
  update(dt, target, look, keys, speed) {
    if (!this._initialized) this.snapTo(target);

    this.yaw -= look.lookDX * 0.0055;
    this.pitch = THREE.MathUtils.clamp(this.pitch + look.lookDY * 0.0045, -0.12, 1.25);
    this.yaw += ((keys.camLeft ? 1 : 0) - (keys.camRight ? 1 : 0)) * 2.2 * dt;
    this.distance = THREE.MathUtils.clamp(this.distance + look.wheel * 0.8, MIN_DIST, MAX_DIST);

    // Seguimiento suave (más rápido en horizontal para no perder al personaje).
    const ty = target.y + 1.1;
    this.focus.x = damp(this.focus.x, target.x, 9, dt);
    this.focus.z = damp(this.focus.z, target.z, 9, dt);
    this.focus.y = damp(this.focus.y, ty, 5, dt);
    // El personaje nunca puede alejarse demasiado del foco.
    const ox = target.x - this.focus.x;
    const oz = target.z - this.focus.z;
    const lag = Math.hypot(ox, oz);
    if (lag > 2.2) {
      this.focus.x += ox * (1 - 2.2 / lag);
      this.focus.z += oz * (1 - 2.2 / lag);
    }

    const cp = Math.cos(this.pitch);
    this._dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    // Colisión: se acorta la distancia si el rayo foco->cámara atraviesa suelo u objetos.
    let allowed = this.distance;
    const steps = 18;
    for (let i = 1; i <= steps; i++) {
      const d = (this.distance * i) / steps;
      const x = this.focus.x + this._dir.x * d;
      const y = this.focus.y + this._dir.y * d;
      const z = this.focus.z + this._dir.z * d;
      if (y < this.physics.blockHeight(x, z, 0.35) + 0.45) {
        allowed = Math.max(1.2, (this.distance * (i - 1)) / steps);
        break;
      }
    }
    this.currentDistance = allowed < this.currentDistance
      ? allowed
      : damp(this.currentDistance, allowed, 4, dt);

    this._pos.copy(this.focus).addScaledVector(this._dir, this.currentDistance);
    const floor = this.physics.blockHeight(this._pos.x, this._pos.z, 0.35) + 0.5;
    if (this._pos.y < floor) this._pos.y = floor;

    this.camera.position.copy(this._pos);
    this.camera.lookAt(this.focus.x, this.focus.y + 0.25, this.focus.z);

    // Sensación de velocidad: el FOV se abre al correr.
    const targetFov = this.baseFov + Math.min(speed / 14, 1) * 9;
    const fov = damp(this.camera.fov, targetFov, 4, dt);
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
