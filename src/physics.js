// Física básica: colisiones con terreno (heightfield) y colisionadores 2D (cilindros / cajas).
// Los colisionadores "walkable" también actúan como plataformas sobre las que se puede subir.

export const GRAVITY = 36;
export const STEP_UP = 0.45; // altura máxima que se sube andando sin saltar

export class Physics {
  constructor(terrainHeight) {
    this.terrainHeight = terrainHeight;
    this.colliders = [];
  }

  addCylinder(x, z, radius, height, walkable = false) {
    this.colliders.push({ type: 'cyl', x, z, r: radius, height, walkable });
  }

  addBox(x, z, halfX, halfZ, rotation, height, walkable = false) {
    this.colliders.push({
      type: 'box', x, z, hx: halfX, hz: halfZ, height, walkable,
      cos: Math.cos(rotation), sin: Math.sin(rotation),
    });
  }

  // Punto dentro de la huella del colisionador (con margen opcional).
  _inside(c, x, z, margin = 0) {
    const dx = x - c.x;
    const dz = z - c.z;
    if (c.type === 'cyl') {
      const r = c.r + margin;
      return dx * dx + dz * dz <= r * r;
    }
    const lx = dx * c.cos + dz * c.sin;
    const lz = -dx * c.sin + dz * c.cos;
    return Math.abs(lx) <= c.hx + margin && Math.abs(lz) <= c.hz + margin;
  }

  /** Altura del suelo en (x,z) para unos pies a altura prevY (terreno o plataformas). */
  groundHeight(x, z, prevY = Infinity) {
    let h = this.terrainHeight(x, z);
    for (const c of this.colliders) {
      if (!c.walkable || c.height <= h) continue;
      if (prevY >= c.height - STEP_UP && this._inside(c, x, z)) h = c.height;
    }
    return h;
  }

  /** Altura máxima que bloquea la cámara en (x,z). */
  blockHeight(x, z, margin = 0.3) {
    let h = this.terrainHeight(x, z);
    for (const c of this.colliders) {
      if (c.height > h && this._inside(c, x, z, margin)) h = c.height;
    }
    return h;
  }

  /** Expulsa a la posición (objeto con x,z) de los colisionadores que la bloquean. */
  resolveHorizontal(pos, radius, feetY) {
    let hit = false;
    for (const c of this.colliders) {
      if (feetY + STEP_UP >= c.height) continue;
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      if (c.type === 'cyl') {
        const min = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 0.0001;
        const push = (min - d) / d;
        pos.x += dx * push;
        pos.z += dz * push;
        hit = true;
      } else {
        const lx = dx * c.cos + dz * c.sin;
        const lz = -dx * c.sin + dz * c.cos;
        const cx = Math.max(-c.hx, Math.min(c.hx, lx));
        const cz = Math.max(-c.hz, Math.min(c.hz, lz));
        let nx = lx - cx;
        let nz = lz - cz;
        const d2 = nx * nx + nz * nz;
        if (d2 >= radius * radius) continue;
        let px;
        let pz;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          px = (nx / d) * (radius - d);
          pz = (nz / d) * (radius - d);
        } else {
          // centro dentro de la caja: salir por el eje de menor penetración
          const ox = c.hx - Math.abs(lx);
          const oz = c.hz - Math.abs(lz);
          if (ox < oz) { px = Math.sign(lx || 1) * (ox + radius); pz = 0; }
          else { px = 0; pz = Math.sign(lz || 1) * (oz + radius); }
        }
        pos.x += px * c.cos - pz * c.sin;
        pos.z += px * c.sin + pz * c.cos;
        hit = true;
      }
    }
    return hit;
  }
}
