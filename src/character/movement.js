import * as THREE from 'three';
import { GRAVITY, STEP_UP } from '../physics.js';
import { STATES } from './animations.js';

const WALK_SPEED = 6.5;
const RUN_SPEED = 14;
const GROUND_ACCEL = 55;
const GROUND_DECEL = 60;
const AIR_ACCEL = 18;
const JUMP_VELOCITY = 13.5;
const TURN_SPEED = 14; // rad/s
const COYOTE_TIME = 0.1;
const JUMP_BUFFER = 0.12;
const MAX_SLOPE = 1.2; // pendiente máxima transitable (Δaltura / Δdistancia)
const WORLD_RADIUS = 96;

const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export class PlayerController {
  constructor(goku, physics, spawn) {
    this.goku = goku;
    this.physics = physics;
    this.spawn = spawn.clone();
    this.position = spawn.clone();
    this.velocity = new THREE.Vector3();
    this.heading = Math.PI; // mira hacia -Z (hacia el valle)
    this.grounded = false;
    this.state = STATES.IDLE;
    this.landingTimer = 0;
    this.airTime = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.fallImpact = 0;
    this.goku.root.rotation.y = this.heading;
    this._sync();
  }

  get speed() { return Math.hypot(this.velocity.x, this.velocity.z); }

  respawn() {
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
  }

  /**
   * @param {number} dt
   * @param {{x:number,z:number}} axis eje de entrada (x: derecha, z: adelante)
   * @param {{run:boolean}} flags
   * @param {boolean} jumpPressed
   * @param {number} camYaw yaw de la cámara (dirección de referencia del movimiento)
   */
  update(dt, axis, flags, jumpPressed, camYaw) {
    const v = this.velocity;
    const p = this.position;

    // Dirección deseada relativa a la cámara.
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);
    const dirX = fx * axis.z + rx * axis.x;
    const dirZ = fz * axis.z + rz * axis.x;
    const hasInput = Math.abs(axis.x) + Math.abs(axis.z) > 0.01;

    const maxSpeed = flags.run ? RUN_SPEED : WALK_SPEED;
    const targetX = hasInput ? dirX * maxSpeed : 0;
    const targetZ = hasInput ? dirZ * maxSpeed : 0;
    const accel = this.grounded ? (hasInput ? GROUND_ACCEL : GROUND_DECEL) : AIR_ACCEL;
    const dvx = targetX - v.x;
    const dvz = targetZ - v.z;
    const dlen = Math.hypot(dvx, dvz);
    const step = accel * dt;
    if (dlen <= step) { v.x = targetX; v.z = targetZ; }
    else { v.x += (dvx / dlen) * step; v.z += (dvz / dlen) * step; }

    // Orientación hacia la dirección de movimiento.
    if (this.speed > 0.6 && (hasInput || this.grounded)) {
      const target = Math.atan2(v.x, v.z);
      const diff = wrapAngle(target - this.heading);
      const maxTurn = TURN_SPEED * dt;
      this.heading = wrapAngle(this.heading + Math.max(-maxTurn, Math.min(maxTurn, diff)));
    }

    // Salto (con coyote time y buffer de pulsación).
    this.coyote = this.grounded ? COYOTE_TIME : this.coyote - dt;
    this.jumpBuffer = jumpPressed ? JUMP_BUFFER : this.jumpBuffer - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) {
      v.y = JUMP_VELOCITY + Math.min(this.speed, RUN_SPEED) * 0.1;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.landingTimer = 0;
    }

    this._moveHorizontal(v.x * dt, v.z * dt, dt);

    // Vertical: gravedad y detección de suelo.
    const prevY = p.y;
    if (!this.grounded) v.y -= GRAVITY * dt;
    p.y += v.y * dt;
    const ground = this.physics.groundHeight(p.x, p.z, Math.max(prevY, p.y - v.y * dt));
    const wasGrounded = this.grounded;

    if (p.y <= ground) {
      this.fallImpact = Math.min(0, v.y);
      p.y = ground;
      v.y = 0;
      this.grounded = true;
      if (!wasGrounded && this.airTime > 0.18 && this.fallImpact < -9 && this.speed < RUN_SPEED * 0.6) {
        this.landingTimer = 0.2;
      }
      if (!wasGrounded) this.airTime = 0;
    } else if (wasGrounded && v.y <= 0 && p.y - ground < 0.35) {
      p.y = ground; // pegarse al suelo en bajadas
      v.y = 0;
    } else {
      this.grounded = false;
    }
    if (!this.grounded) this.airTime += dt;

    if (p.y < -30) this.respawn();

    this.landingTimer = Math.max(0, this.landingTimer - dt);
    this._updateState();
    this._sync();
  }

  _moveHorizontal(dx, dz, dt) {
    const p = this.position;
    const r = this.goku.radius;
    const dist = Math.hypot(dx, dz);
    if (dist < 1e-6) return;
    const oldX = p.x;
    const oldZ = p.z;

    // Con pendiente excesiva en el suelo se prueba deslizar por cada eje.
    const tryMove = (mx, mz) => {
      const probe = { x: p.x + mx, z: p.z + mz };
      this.physics.resolveHorizontal(probe, r, p.y);
      if (this.grounded) {
        const rise = this.physics.groundHeight(probe.x, probe.z, p.y + STEP_UP) - p.y;
        const run = Math.hypot(probe.x - p.x, probe.z - p.z);
        if (run > 1e-5 && rise > 0.08 && rise / run > MAX_SLOPE) return false;
        if (rise > STEP_UP + 0.3) return false;
      }
      p.x = probe.x;
      p.z = probe.z;
      return true;
    };

    if (!tryMove(dx, dz)) {
      if (!tryMove(dx, 0)) this.velocity.x *= 0.5;
      if (!tryMove(0, dz)) this.velocity.z *= 0.5;
    }

    // Límite del mundo.
    const d = Math.hypot(p.x, p.z);
    if (d > WORLD_RADIUS) {
      p.x *= WORLD_RADIUS / d;
      p.z *= WORLD_RADIUS / d;
    }
    // Si hubo choque, la velocidad pasa a ser el desplazamiento real (deslizar contra paredes).
    const moved = Math.hypot(p.x - oldX, p.z - oldZ);
    if (moved < dist * 0.9) {
      this.velocity.x = (p.x - oldX) / dt;
      this.velocity.z = (p.z - oldZ) / dt;
    }
  }

  _updateState() {
    const sp = this.speed;
    if (!this.grounded) {
      this.state = this.velocity.y > 0.5 ? STATES.JUMP : STATES.FALL;
    } else if (this.landingTimer > 0) {
      this.state = STATES.LANDING;
    } else if (sp > WALK_SPEED + 1.5) {
      this.state = STATES.RUN;
    } else if (sp > 0.4) {
      this.state = STATES.WALK;
    } else {
      this.state = STATES.IDLE;
    }
  }

  _sync() {
    this.goku.root.position.copy(this.position);
    this.goku.root.rotation.y = this.heading;
  }
}
