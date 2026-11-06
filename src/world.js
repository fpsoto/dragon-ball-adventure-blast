import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ------------------------------------------------------------------
// Utilidades
// ------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

let gradientMap;
function toonGradient() {
  if (!gradientMap) {
    gradientMap = new THREE.DataTexture(new Uint8Array([110, 180, 255]), 3, 1, THREE.RedFormat);
    gradientMap.minFilter = gradientMap.magFilter = THREE.NearestFilter;
    gradientMap.needsUpdate = true;
  }
  return gradientMap;
}
const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonGradient(), ...extra });

function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function canvasTexture(size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (repeat) tex.repeat.set(...repeat);
  tex.anisotropy = 4;
  return tex;
}

// ------------------------------------------------------------------
// Terreno: función de altura determinista (compartida con la física)
// ------------------------------------------------------------------
const PLATEAU = { x: -44, z: -34, inner: 11, height: 5 };
const PLATEAU_RAMP_ANGLE = Math.atan2(-PLATEAU.z, -PLATEAU.x); // rampa orientada hacia el spawn

export function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  let h = Math.sin(x * 0.045) * Math.cos(z * 0.05) * 1.4
    + Math.sin(x * 0.11 + z * 0.08) * 0.5
    + Math.cos(z * 0.13 - x * 0.05) * 0.3;
  h *= smooth(12, 40, r);
  h += 16 * smooth(66, 96, r); // colinas que encierran el valle

  const dx = x - PLATEAU.x;
  const dz = z - PLATEAU.z;
  const d = Math.hypot(dx, dz);
  const c = Math.max(0, Math.cos(Math.atan2(dz, dx) - PLATEAU_RAMP_ANGLE));
  const outer = 16 + 18 * c * c * c;
  h += PLATEAU.height * (1 - smooth(PLATEAU.inner, outer, d));
  return h;
}

// Caminos de tierra (polilíneas suavizadas)
const PATHS = [
  [[0, 30], [2, 16], [8, 4], [4, -8], [13, -18], [4, -30], [-10, -38], [-28, -36], [-44, -34]],
  [[8, 4], [-4, 0], [-14, -2], [-17, -3]],
  [[4, -8], [14, -8]],
].map((pts) => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z))).getPoints(Math.max(60, pts.length * 22)));

function pathDistance(x, z) {
  let best = Infinity;
  for (const line of PATHS) {
    for (const p of line) {
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < best) best = d;
    }
  }
  return best;
}

function buildTerrain() {
  const SIZE = 300;
  const SEG = 200;
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const grassA = new THREE.Color(0x4fc23a);
  const grassB = new THREE.Color(0x2f9e35);
  const grassC = new THREE.Color(0x8fe04a);
  const dirt = new THREE.Color(0xe9cc8e);
  const dirtEdge = new THREE.Color(0xc8a45e);
  const rock = new THREE.Color(0xb9824a);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const n = Math.sin(x * 0.21) * Math.cos(z * 0.17) * 0.5 + Math.sin(x * 0.05 + z * 0.07) * 0.5; // -1..1
    tmp.copy(grassA).lerp(grassB, clamp01(0.5 + n * 0.5));
    tmp.lerp(grassC, clamp01(0.25 + n * 0.25 + h * 0.02));
    const pd = pathDistance(x, z);
    if (pd < 2.6) tmp.lerp(dirtEdge, 1 - smooth(1.7, 2.6, pd));
    if (pd < 1.9) tmp.lerp(dirt, 1 - smooth(1.0, 1.9, pd));
    // base del plateau y laderas: tonos de roca
    const dxp = x - PLATEAU.x;
    const dzp = z - PLATEAU.z;
    if (Math.hypot(dxp, dzp) < PLATEAU.inner + 3 && h > 2) tmp.lerp(rock, 0.55 * smooth(2, 5, h));
    colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  return mesh;
}

// ------------------------------------------------------------------
// Cielo y fondo
// ------------------------------------------------------------------
function buildSky(scene) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2a78e4) },
      mid: { value: new THREE.Color(0x7fc0ff) },
      bottom: { value: new THREE.Color(0xd7efff) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bottom;
      void main(){ float h = clamp(vP.y, 0.0, 1.0);
        vec3 c = mix(bottom, mid, smoothstep(0.0, 0.25, h));
        c = mix(c, top, smoothstep(0.2, 0.9, h));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  sky.renderOrder = -10;
  scene.add(sky);

  // Montañas azuladas lejanas (como en la referencia)
  const rng = mulberry32(7);
  const mountMat = new THREE.MeshBasicMaterial({ color: 0x86a6dd, fog: false });
  const mountMat2 = new THREE.MeshBasicMaterial({ color: 0x6f95d3, fog: false });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + rng() * 0.2;
    const rad = 330 + rng() * 40;
    const h = 40 + rng() * 70;
    const m = new THREE.Mesh(new THREE.CylinderGeometry(6 + rng() * 10, 26 + rng() * 22, h, 7), i % 2 ? mountMat : mountMat2);
    m.position.set(Math.cos(a) * rad, h / 2 - 8, Math.sin(a) * rad);
    scene.add(m);
  }
}

function buildClouds(scene) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const rng = mulberry32(11);
  const clouds = new THREE.Group();
  for (let i = 0; i < 16; i++) {
    const c = new THREE.Group();
    const blobs = 4 + Math.floor(rng() * 3);
    for (let b = 0; b < blobs; b++) {
      const s = 7 + rng() * 7;
      const m = new THREE.Mesh(new THREE.SphereGeometry(s, 12, 8), mat);
      m.position.set(b * 9 - blobs * 4, rng() * 3, rng() * 5);
      m.scale.y = 0.6;
      c.add(m);
    }
    const a = rng() * Math.PI * 2;
    const rad = 120 + rng() * 200;
    c.position.set(Math.cos(a) * rad, 70 + rng() * 50, Math.sin(a) * rad);
    c.rotation.y = rng() * Math.PI;
    clouds.add(c);
  }
  scene.add(clouds);
  return clouds;
}

// ------------------------------------------------------------------
// Vegetación
// ------------------------------------------------------------------
function instanced(geometry, material, items, { cast = false, receive = false } = {}) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  const o = new THREE.Object3D();
  items.forEach((it, i) => {
    o.position.set(it.x, it.y, it.z);
    o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
    o.scale.set(it.sx ?? it.s ?? 1, it.sy ?? it.s ?? 1, it.sz ?? it.s ?? 1);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    if (it.color) mesh.setColorAt(i, it.color);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function buildTrees(scene, physics, rng, blocked) {
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.55, 4.4, 8);
  trunkGeo.translate(0, 2.2, 0);
  const foliageGeo = mergeGeometries([
    new THREE.SphereGeometry(1.9, 12, 10).translate(0, 4.6, 0),
    new THREE.SphereGeometry(1.4, 12, 10).translate(1.4, 3.9, 0.4),
    new THREE.SphereGeometry(1.4, 12, 10).translate(-1.3, 4.0, -0.3),
    new THREE.SphereGeometry(1.2, 12, 10).translate(0.2, 5.8, 0.5),
    new THREE.SphereGeometry(1.1, 12, 10).translate(-0.4, 4.1, 1.5),
  ]);
  const placed = [];
  const trunks = [];
  const leaves = [];
  const greens = [0x3fae3a, 0x2f9a35, 0x57c640, 0x46b43c].map((c) => new THREE.Color(c));
  let tries = 0;
  while (placed.length < 46 && tries++ < 3000) {
    const a = rng() * Math.PI * 2;
    const r = 14 + rng() * 62;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (blocked(x, z, 4) || pathDistance(x, z) < 3.5) continue;
    if (placed.some((p) => Math.hypot(p.x - x, p.z - z) < 7)) continue;
    placed.push({ x, z });
    const s = 0.8 + rng() * 0.7;
    const y = terrainHeight(x, z) - 0.1;
    const ry = rng() * Math.PI * 2;
    trunks.push({ x, y, z, s, ry });
    leaves.push({ x, y, z, s, ry, color: greens[Math.floor(rng() * greens.length)] });
    physics.addCylinder(x, z, 0.55 * s, 6 * s);
  }
  scene.add(instanced(trunkGeo, toon(0x7a4a28), trunks, { cast: true }));
  scene.add(instanced(foliageGeo, toon(0xffffff), leaves, { cast: true, receive: true }));
}

function buildBamboo(scene, physics, rng, blocked) {
  const stalkGeo = new THREE.CylinderGeometry(0.11, 0.14, 11, 6);
  stalkGeo.translate(0, 5.5, 0);
  const nodes = [];
  for (let i = 1; i < 6; i++) nodes.push(new THREE.CylinderGeometry(0.16, 0.16, 0.1, 6).translate(0, i * 1.8, 0));
  const stalkAll = mergeGeometries([stalkGeo, ...nodes]);
  const leafParts = [];
  for (let i = 0; i < 7; i++) {
    const g = new THREE.ConeGeometry(0.22, 2.4, 4);
    g.translate(0, 1.2, 0);
    g.rotateZ(1.0 + (i % 3) * 0.15);
    g.rotateY((i / 7) * Math.PI * 2);
    g.translate(0, 8.8 + (i % 3) * 0.7, 0);
    leafParts.push(g);
  }
  const leafGeo = mergeGeometries(leafParts);

  const stalks = [];
  const leaves = [];
  const g1 = new THREE.Color(0x5fc24a);
  const g2 = new THREE.Color(0x3d9a52);
  const leafG = new THREE.Color(0x2f8a4a);
  const leafG2 = new THREE.Color(0x4cae4a);
  const clumps = 46;
  for (let i = 0; i < clumps; i++) {
    const inner = i < 12;
    const a = rng() * Math.PI * 2;
    const r = inner ? 34 + rng() * 12 : 48 + rng() * 38;
    const cx = Math.cos(a) * r;
    const cz = Math.sin(a) * r;
    if (blocked(cx, cz, 3) || pathDistance(cx, cz) < 4) continue;
    const n = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const x = cx + (rng() - 0.5) * 2.2;
      const z = cz + (rng() - 0.5) * 2.2;
      const s = 0.85 + rng() * 0.6;
      const y = terrainHeight(x, z) - 0.2;
      const ry = rng() * Math.PI * 2;
      const lean = (rng() - 0.5) * 0.08;
      stalks.push({ x, y, z, s, ry, rz: lean, color: rng() > 0.5 ? g1 : g2 });
      leaves.push({ x, y, z, s, ry, rz: lean, color: rng() > 0.5 ? leafG : leafG2 });
    }
    physics.addCylinder(cx, cz, 1.3, 12);
  }
  scene.add(instanced(stalkAll, toon(0xffffff), stalks, { cast: true }));
  const leafMat = toon(0xffffff, { side: THREE.DoubleSide });
  scene.add(instanced(leafGeo, leafMat, leaves, { cast: true }));
}

function buildGrassAndFlowers(scene, rng, blocked) {
  const tuftGeo = mergeGeometries([
    new THREE.ConeGeometry(0.07, 0.6, 3).translate(0, 0.3, 0),
    new THREE.ConeGeometry(0.06, 0.45, 3).translate(0.12, 0.22, 0.05),
    new THREE.ConeGeometry(0.06, 0.5, 3).translate(-0.1, 0.25, -0.06),
  ]);
  const tufts = [];
  const cols = [0x62d144, 0x3fb23a, 0x8be34f, 0x2f9e35].map((c) => new THREE.Color(c));
  let guard = 0;
  while (tufts.length < 2600 && guard++ < 9000) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * 90;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (pathDistance(x, z) < 2.4 || blocked(x, z, 0.5)) continue;
    tufts.push({ x, y: terrainHeight(x, z), z, s: 0.7 + rng() * 1.1, ry: rng() * 6, color: cols[Math.floor(rng() * cols.length)] });
  }
  scene.add(instanced(tuftGeo, toon(0xffffff, { side: THREE.DoubleSide }), tufts));

  const flowerGeo = new THREE.SphereGeometry(0.12, 6, 5);
  const fcols = [0xffffff, 0xfff176, 0xff8fb8, 0xffa040].map((c) => new THREE.Color(c));
  const flowers = [];
  guard = 0;
  while (flowers.length < 260 && guard++ < 4000) {
    const a = rng() * Math.PI * 2;
    const r = 6 + Math.sqrt(rng()) * 70;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (pathDistance(x, z) < 2.4 || blocked(x, z, 0.5)) continue;
    flowers.push({ x, y: terrainHeight(x, z) + 0.38, z, s: 0.8 + rng() * 0.6, color: fcols[Math.floor(rng() * fcols.length)] });
  }
  scene.add(instanced(flowerGeo, toon(0xffffff), flowers));
}

// ------------------------------------------------------------------
// Rocas y mesetas
// ------------------------------------------------------------------
function rockyCylinder(rTop, rBottom, h, rng, color1, color2) {
  const geo = new THREE.CylinderGeometry(rTop, rBottom, h, 14, 8, false);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const c1 = new THREE.Color(color1);
  const c2 = new THREE.Color(color2);
  const t = new THREE.Color();
  const seed = rng() * 100;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const k = 1 + Math.sin(a * 3 + seed) * 0.12 + Math.sin(a * 7 + y * 0.3 + seed) * 0.06;
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
    const f = clamp01((y + h / 2) / h);
    t.copy(c1).lerp(c2, f);
    t.multiplyScalar(0.9 + 0.1 * Math.sin(a * 5 + y));
    col[i * 3] = t.r; col[i * 3 + 1] = t.g; col[i * 3 + 2] = t.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildRocks(scene, physics, rng) {
  const mesas = [
    [-10, -66, 1.0, 30], [10, -70, 1.25, 34], [26, -64, 0.7, 22],
    [-62, -56, 1.1, 28], [58, -52, 1.0, 26], [70, 10, 0.8, 22], [-72, 14, 0.9, 24],
  ];
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  for (const [x, z, s, h] of mesas) {
    const geo = rockyCylinder(4.2 * s, 6.5 * s, h, rng, 0x8a4f2a, 0xcf9558);
    const m = shadowed(new THREE.Mesh(geo, mat));
    const y = terrainHeight(x, z);
    m.position.set(x, y + h / 2 - 1, z);
    scene.add(m);
    physics.addCylinder(x, z, 6 * s, 60);
  }

  // Acantilado alrededor de la meseta elevada
  const cliffGeo = rockyCylinder(5, 7, 9, rng, 0x9c5d30, 0xd19b5e);
  for (const [dx, dz, s] of [[-4, -13, 1.2], [6, -13, 1.0], [-14, -6, 0.9], [-15, 5, 0.8]]) {
    const x = PLATEAU.x + dx;
    const z = PLATEAU.z + dz;
    const m = shadowed(new THREE.Mesh(cliffGeo, mat));
    m.scale.set(s, s, s);
    m.position.set(x, terrainHeight(x, z) + 3.4 * s, z);
    scene.add(m);
    physics.addCylinder(x, z, 5.6 * s, 60);
  }

  // Rocas sueltas por el valle
  const boulderGeo = new THREE.DodecahedronGeometry(1, 0);
  const boulderMat = toon(0xb08457);
  for (let i = 0; i < 14; i++) {
    const a = rng() * Math.PI * 2;
    const r = 18 + rng() * 55;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (pathDistance(x, z) < 4 || Math.hypot(x - PLATEAU.x, z - PLATEAU.z) < 22) continue;
    const s = 0.8 + rng() * 1.2;
    const m = shadowed(new THREE.Mesh(boulderGeo, boulderMat));
    m.scale.set(s * 1.2, s * 0.8, s);
    m.rotation.y = rng() * 6;
    m.position.set(x, terrainHeight(x, z) + 0.2 * s, z);
    scene.add(m);
    physics.addCylinder(x, z, 0.9 * s, 0.7 * s);
  }
}

// Piedras escalonadas para practicar saltos de plataformas
function buildStepStones(scene, physics) {
  const stones = [[-9, 12, 1.2, 1.7], [-13.5, 8.5, 2.4, 1.6], [-9.5, 4.5, 3.6, 1.7]];
  const mat = toon(0xc5a77e);
  const topMat = toon(0x6fd04a);
  for (const [x, z, h, r] of stones) {
    const geo = new THREE.CylinderGeometry(r * 0.9, r * 1.1, h + 2, 12);
    const m = shadowed(new THREE.Mesh(geo, mat));
    m.position.set(x, h / 2 - 1, z);
    scene.add(m);
    const cap = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.93, r * 0.93, 0.12, 12), topMat));
    cap.position.set(x, h - 0.04, z);
    scene.add(cap);
    physics.addCylinder(x, z, r * 0.92, h, true);
  }
}

// Nube Voladora (decorativa y plataforma baja)
function buildNimbus(scene, physics, x, z) {
  const g = new THREE.Group();
  const mat = toon(0xffd93b);
  const edge = new THREE.MeshBasicMaterial({ color: 0xc88a00, side: THREE.BackSide });
  const blobs = [[0, 0, 0, 1.0], [1.0, -0.05, 0.3, 0.8], [-1.0, -0.05, 0.2, 0.85], [0.4, 0.1, -0.8, 0.8], [-0.5, 0.0, -0.7, 0.7], [0.1, 0.25, 0.1, 0.8], [0.9, 0.0, -0.6, 0.65]];
  for (const [bx, by, bz, s] of blobs) {
    const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.7 * s, 14, 10), mat));
    m.position.set(bx, by, bz);
    const o = new THREE.Mesh(m.geometry, edge);
    o.scale.setScalar(1.07);
    m.add(o);
    g.add(m);
  }
  g.position.set(x, 0.45, z);
  scene.add(g);
  physics.addCylinder(x, z, 1.5, 0.95, true);
  return g;
}

// ------------------------------------------------------------------
// Edificios (inspirados en la referencia)
// ------------------------------------------------------------------
function roofMaterial(color) {
  const tex = canvasTexture(128, (ctx, s) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, s, s);
    for (let row = 0; row < 8; row++) {
      ctx.fillStyle = row % 2 ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, row * 16, s, 7);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(0, row * 16 + 14, s, 2);
      for (let c = 0; c < 6; c++) ctx.fillRect(((c * 22) + (row % 2) * 11) % s, row * 16, 1.5, 14);
    }
  }, [1.2, 1.2]);
  return new THREE.MeshLambertMaterial({ map: tex });
}

function gableRoof(width, height, depth, material) {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, 0);
  shape.lineTo(width / 2, 0);
  shape.lineTo(0.15, height);
  shape.lineTo(-0.15, height);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.translate(0, 0, -depth / 2);
  geo.rotateY(Math.PI / 2);
  // UV simples en el plano de las vertientes
  const m = shadowed(new THREE.Mesh(geo, material));
  return m;
}

function addWindow(group, x, y, z, ry, w = 0.9, h = 1.1) {
  const frame = shadowed(new THREE.Mesh(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.1), toon(0xfdfaf0)), false);
  frame.position.set(x, y, z);
  frame.rotation.y = ry;
  const glass = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.14), toon(0x5a8ae0));
  frame.add(glass);
  group.add(frame);
}

function buildCottage(scene, physics) {
  const g = new THREE.Group();
  const wall = toon(0xf6f2e4);
  const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(8, 4, 5.4), wall));
  body.position.y = 2;
  g.add(body);
  const roof = gableRoof(7.4, 3.0, 9.2, roofMaterial('#9c5b36'));
  roof.position.y = 3.9;
  g.add(roof);
  const chimney = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.2, 0.9), toon(0xe8e2d2)));
  chimney.position.set(1.8, 6.3, -0.6);
  g.add(chimney);
  // puerta en arco
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 2.2, 0.2), toon(0x6a4020));
  door.position.set(-1.2, 1.1, 2.75);
  g.add(door);
  const arch = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 0.2, 14, 1, false, 0, Math.PI), toon(0x6a4020));
  arch.rotation.x = Math.PI / 2;
  arch.rotation.z = Math.PI / 2;
  arch.position.set(-1.2, 2.2, 2.75);
  g.add(arch);
  addWindow(g, 1.8, 2.4, 2.75, 0);
  addWindow(g, -4.05, 2.3, 0.4, Math.PI / 2);
  addWindow(g, 4.05, 2.3, 0.4, Math.PI / 2);
  g.position.set(17, terrainHeight(17, -14), -14);
  g.rotation.y = -0.35;
  scene.add(g);
  physics.addBox(17, -14, 4.1, 2.8, -0.35, 8);
  return g;
}

function buildAnnex(scene, physics) {
  const g = new THREE.Group();
  const body = shadowed(new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), toon(0xe8d9b8)));
  body.position.y = 1.5;
  g.add(body);
  const roof = gableRoof(4.8, 2.0, 4.8, roofMaterial('#8a4c2c'));
  roof.rotation.y = Math.PI / 2;
  roof.position.y = 2.9;
  g.add(roof);
  addWindow(g, 0, 1.7, 2.05, 0, 0.8, 1.0);
  g.position.set(25, terrainHeight(25, -17), -17);
  g.rotation.y = -0.5;
  scene.add(g);
  physics.addBox(25, -17, 2.2, 2.2, -0.5, 6);
}

function buildDomeHouse(scene, physics) {
  const g = new THREE.Group();
  const r = 3.6;
  const dome = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), toon(0xf4f6ff)));
  dome.scale.y = 0.78;
  g.add(dome);
  const band = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r + 0.04, 24, 12, 0.5, 1.6, 0.55, 0.5), toon(0x2a52d0)), false, false);
  band.scale.y = 0.78;
  band.rotation.y = 0.2;
  g.add(band);
  const base = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r + 0.05, r + 0.15, 0.4, 32), toon(0xdfe4f0)));
  base.position.y = 0.2;
  g.add(base);
  // puerta y ventana en rombo naranja
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.8, 0.4), toon(0x7a4b2a));
  door.position.set(1.4, 0.9, 3.25);
  door.rotation.y = 0.42;
  g.add(door);
  const win = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.12), toon(0xff8a2a));
  win.position.set(-1.7, 1.9, 2.95);
  win.rotation.set(0, -0.5, Math.PI / 4);
  const winFrame = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 0.1), toon(0xd13a2a));
  winFrame.position.copy(win.position);
  winFrame.position.z -= 0.02;
  winFrame.rotation.copy(win.rotation);
  g.add(winFrame, win);
  g.position.set(23, terrainHeight(23, -6), -6);
  g.rotation.y = -0.9;
  scene.add(g);
  physics.addCylinder(23, -6, r + 0.05, 3);
}

function buildPagoda(scene, physics) {
  const g = new THREE.Group();
  const base = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 3.4), toon(0xf4efe0)));
  base.position.y = 1.3;
  g.add(base);
  const brick = shadowed(new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.9, 3.5), toon(0xc9684a)));
  brick.position.y = 0.45;
  g.add(brick);
  const roof = shadowed(new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.6, 4), toon(0x2a2f72)));
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 3.9;
  g.add(roof);
  const eave = shadowed(new THREE.Mesh(new THREE.ConeGeometry(3.9, 0.7, 4), toon(0x1c205a)));
  eave.rotation.y = Math.PI / 4;
  eave.position.y = 2.85;
  g.add(eave);
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.9, 6), toon(0xffd93b));
  finial.position.y = 5.6;
  g.add(finial);
  const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.7, 0.15), toon(0x2f9a8f));
  door.position.set(0, 1.0, 1.75);
  g.add(door);
  g.position.set(-17, terrainHeight(-17, -5), -5);
  g.rotation.y = 0.5;
  scene.add(g);
  physics.addBox(-17, -5, 1.8, 1.8, 0.5, 6);
}

function buildBowl(scene) {
  const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.35, 0.3, 14), toon(0xf4f4f4)));
  m.position.set(6, terrainHeight(6, -6) + 0.15, -6);
  scene.add(m);
}

// ------------------------------------------------------------------
// Esferas del Dragón
// ------------------------------------------------------------------
function buildDragonBall(n) {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 16), new THREE.MeshToonMaterial({
    color: 0xff9a1a, emissive: 0xff5a00, emissiveIntensity: 0.35, gradientMap: toonGradient(),
  }));
  ball.castShadow = true;
  const outline = new THREE.Mesh(ball.geometry, new THREE.MeshBasicMaterial({ color: 0x7a2a00, side: THREE.BackSide }));
  outline.scale.setScalar(1.08);
  ball.add(outline);
  g.add(ball);
  const starMat = new THREE.MeshBasicMaterial({ color: 0xd4141c });
  for (let i = 0; i < n; i++) {
    let x = 0;
    let y = 0;
    if (n > 1) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 2;
      x = Math.cos(a) * 0.17;
      y = Math.sin(a) * 0.17;
    }
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), starMat);
    const z = Math.sqrt(Math.max(0, 0.45 * 0.45 - x * x - y * y));
    star.position.set(x, y, z);
    ball.add(star);
  }
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.75, 16, 12), new THREE.MeshBasicMaterial({
    color: 0xffd060, transparent: true, opacity: 0.22, depthWrite: false,
  }));
  g.add(halo);
  return { group: g, ball };
}

// ------------------------------------------------------------------
// Mundo
// ------------------------------------------------------------------
export function buildWorld(scene, physics) {
  const rng = mulberry32(2024);

  scene.fog = new THREE.Fog(0xcfe8ff, 80, 300);
  buildSky(scene);
  const clouds = buildClouds(scene);

  // Luces
  const hemi = new THREE.HemisphereLight(0xcfe8ff, 0x5aa83a, 1.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2d0, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = sc.bottom = -42;
  sc.right = sc.top = 42;
  sc.near = 1;
  sc.far = 200;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const sunOffset = new THREE.Vector3(45, 70, 30);

  scene.add(buildTerrain());

  // Edificios y colisiones
  buildCottage(scene, physics);
  buildAnnex(scene, physics);
  buildDomeHouse(scene, physics);
  buildPagoda(scene, physics);
  buildBowl(scene);
  buildRocks(scene, physics, rng);
  buildStepStones(scene, physics);
  const nimbus = buildNimbus(scene, physics, 4, 16);

  // Zonas donde no crece vegetación
  const keepOut = [[17, -14, 7], [25, -17, 4], [23, -6, 5], [-17, -5, 4], [-9, 8, 9], [4, 16, 3], [0, 22, 4], [PLATEAU.x, PLATEAU.z, 14]];
  const blocked = (x, z, margin) => keepOut.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr + margin);

  buildTrees(scene, physics, rng, blocked);
  buildBamboo(scene, physics, rng, blocked);
  buildGrassAndFlowers(scene, rng, blocked);

  // Esferas del Dragón (las posiciones de plataformas se resuelven con la física)
  const ballSpots = [
    [-9.5, 4.5], [-21, -12], [14, -26], [PLATEAU.x, PLATEAU.z], [52, -8], [8, -46], [38, 26],
  ];
  const balls = ballSpots.map(([sx, sz], i) => {
    // Si el punto cae dentro de vegetación o rocas, se desplaza en espiral hasta un hueco libre.
    let x = sx;
    let z = sz;
    for (let k = 1; k < 60; k++) {
      const free = physics.colliders.every((c) => c.walkable || !physics._inside(c, x, z, 1.6));
      if (free) break;
      const a = k * 2.4;
      x = sx + Math.cos(a) * k * 0.6;
      z = sz + Math.sin(a) * k * 0.6;
    }
    const { group, ball } = buildDragonBall(i + 1);
    const baseY = physics.groundHeight(x, z, Infinity) + 1.1;
    group.position.set(x, baseY, z);
    scene.add(group);
    return { group, ball, baseY, collected: false, phase: i };
  });

  let collected = 0;

  return {
    spawn: new THREE.Vector3(0, terrainHeight(0, 24), 24),
    totalBalls: balls.length,

    /** Actualiza animaciones del entorno y devuelve las esferas recogidas en este frame. */
    update(dt, time, playerPos) {
      sun.target.position.set(playerPos.x, 0, playerPos.z);
      sun.position.copy(sun.target.position).add(sunOffset);
      clouds.children.forEach((c, i) => {
        c.position.x += dt * (1.2 + (i % 3) * 0.5);
        if (c.position.x > 380) c.position.x = -380;
      });
      nimbus.scale.setScalar(1 + Math.sin(time * 2) * 0.015);

      let newly = 0;
      for (const b of balls) {
        if (b.collected) continue;
        b.group.position.y = b.baseY + Math.sin(time * 2 + b.phase) * 0.18;
        b.ball.rotation.y += dt * 1.6;
        const dx = playerPos.x - b.group.position.x;
        const dz = playerPos.z - b.group.position.z;
        const dy = playerPos.y + 0.8 - b.group.position.y;
        if (dx * dx + dz * dz + dy * dy < 1.8 * 1.8) {
          b.collected = true;
          b.group.visible = false;
          collected++;
          newly++;
        }
      }
      return newly ? collected : 0;
    },

    get collected() { return collected; },
  };
}
