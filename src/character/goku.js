import * as THREE from 'three';

// Modelo procedural de Goku (versión clásica, proporciones chibi/anime).
// Orientado hacia +Z. Todas las articulaciones son THREE.Group para animarlas por separado.

const COLORS = {
  skin: 0xffc79a,
  hair: 0x16161d,
  orange: 0xff7a00,
  orangeDark: 0xe05a00,
  blue: 0x1b46d6,
  blueDark: 0x142e9c,
  boot: 0x1a2f9a,
  bootTrim: 0xf2c32a,
  white: 0xffffff,
  ink: 0x0a0a14,
};

let gradient;
function toonGradient() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 170, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}

const matCache = new Map();
function toon(color) {
  if (!matCache.has(color)) {
    matCache.set(color, new THREE.MeshToonMaterial({ color, gradientMap: toonGradient() }));
  }
  return matCache.get(color);
}
const outlineMat = new THREE.MeshBasicMaterial({ color: COLORS.ink, side: THREE.BackSide });

/** Crea una malla toon con contorno (inverted hull) opcional. */
function part(geometry, color, { outline = 1.07, pos, rot, scale } = {}) {
  const mesh = new THREE.Mesh(geometry, toon(color));
  mesh.castShadow = true;
  if (pos) mesh.position.set(...pos);
  if (rot) mesh.rotation.set(...rot);
  if (scale) mesh.scale.set(...scale);
  if (outline) {
    const o = new THREE.Mesh(geometry, outlineMat);
    o.scale.setScalar(outline);
    mesh.add(o);
  }
  return mesh;
}

function joint(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

const sphere = (r, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
const cyl = (rt, rb, h, seg = 14) => new THREE.CylinderGeometry(rt, rb, h, seg);

function buildHead(head) {
  head.add(part(sphere(0.3, 28, 20), COLORS.skin, { pos: [0, 0.3, 0], scale: [1, 0.95, 0.98], outline: 1.05 }));
  // orejas
  for (const s of [-1, 1]) head.add(part(sphere(0.06, 10, 8), COLORS.skin, { pos: [s * 0.29, 0.28, -0.02], outline: 1.15 }));

  // ojos grandes de anime
  for (const s of [-1, 1]) {
    const eye = joint(head, s * 0.11, 0.3, 0.27);
    eye.add(part(sphere(0.07, 16, 12), COLORS.white, { scale: [1, 1.25, 0.5], outline: 0 }));
    eye.add(part(sphere(0.042, 12, 10), COLORS.ink, { pos: [0, -0.005, 0.03], scale: [1, 1.25, 0.5], outline: 0 }));
    eye.add(part(sphere(0.014, 8, 6), COLORS.white, { pos: [s * 0.012, 0.02, 0.055], outline: 0 }));
    // ceja gruesa
    eye.add(part(new THREE.BoxGeometry(0.12, 0.028, 0.03), COLORS.hair, {
      pos: [s * -0.005, 0.12, 0.015], rot: [0, 0, s * -0.28], outline: 0,
    }));
  }
  // nariz y boca sonriente
  head.add(part(sphere(0.018, 8, 6), 0xe6a47a, { pos: [0, 0.23, 0.3], outline: 0 }));
  const mouth = part(new THREE.TorusGeometry(0.06, 0.012, 6, 14, Math.PI), 0x5a1620, { pos: [0, 0.16, 0.285], rot: [0, 0, Math.PI], outline: 0 });
  head.add(mouth);
  return head;
}

function buildHair(hair) {
  // casquete
  hair.add(part(new THREE.SphereGeometry(0.325, 26, 16, 0, Math.PI * 2, 0, Math.PI * 0.62), COLORS.hair, { pos: [0, 0.32, -0.02], rot: [-0.25, 0, 0], outline: 1.04 }));
  const spike = (len, rad, x, y, z, rx, rz, ry = 0) => {
    const s = part(new THREE.ConeGeometry(rad * 1.35, len, 7), COLORS.hair, { outline: 1.12 });
    s.position.set(x, y, z);
    s.rotation.set(rx, ry, rz);
    s.translateY(len * 0.35);
    hair.add(s);
  };
  // pinchos traseros y superiores (característicos)
  spike(0.55, 0.12, 0.0, 0.58, -0.05, -0.55, 0);
  spike(0.62, 0.12, 0.17, 0.55, -0.02, -0.3, -0.7);
  spike(0.62, 0.12, -0.17, 0.55, -0.02, -0.3, 0.7);
  spike(0.5, 0.11, 0.27, 0.45, -0.05, -0.1, -1.15);
  spike(0.5, 0.11, -0.27, 0.45, -0.05, -0.1, 1.15);
  spike(0.55, 0.12, 0.1, 0.5, -0.2, -1.0, -0.35);
  spike(0.55, 0.12, -0.1, 0.5, -0.2, -1.0, 0.35);
  spike(0.45, 0.1, 0.0, 0.4, -0.3, -1.4, 0);
  // flequillo
  spike(0.3, 0.07, 0.0, 0.6, 0.18, 1.15, 0);
  spike(0.28, 0.07, 0.13, 0.57, 0.18, 1.05, -0.4);
  spike(0.28, 0.07, -0.13, 0.57, 0.18, 1.05, 0.4);
  spike(0.26, 0.065, 0.24, 0.5, 0.12, 0.8, -0.95);
  spike(0.26, 0.065, -0.24, 0.5, 0.12, 0.8, 0.95);
}

function buildArm(parent, side) {
  const shoulder = joint(parent, side * 0.27, 0.46, 0);
  shoulder.add(part(sphere(0.1, 14, 10), COLORS.orange, { outline: 1.1 }));
  shoulder.add(part(cyl(0.085, 0.075, 0.26, 12), COLORS.blue, { pos: [0, -0.12, 0] })); // manga camiseta azul
  const elbow = joint(shoulder, 0, -0.25, 0);
  elbow.add(part(sphere(0.07, 12, 8), COLORS.blue, { outline: 1.1 }));
  elbow.add(part(cyl(0.07, 0.06, 0.2, 12), COLORS.skin, { pos: [0, -0.1, 0] })); // antebrazo
  elbow.add(part(cyl(0.077, 0.077, 0.075, 12), COLORS.blueDark, { pos: [0, -0.2, 0], outline: 1.08 })); // muñequera
  const hand = joint(elbow, 0, -0.27, 0);
  hand.add(part(sphere(0.075, 14, 10), COLORS.skin, { outline: 1.1 }));
  hand.add(part(sphere(0.035, 8, 6), COLORS.skin, { pos: [side * -0.045, 0.0, 0.04], outline: 1.1 }));
  return { shoulder, elbow, hand };
}

function buildLeg(parent, side) {
  const hip = joint(parent, side * 0.115, -0.02, 0);
  hip.add(part(cyl(0.12, 0.1, 0.32, 14), COLORS.orange, { pos: [0, -0.14, 0] })); // muslo
  const knee = joint(hip, 0, -0.3, 0);
  knee.add(part(sphere(0.095, 12, 8), COLORS.orange, { outline: 1.08 }));
  knee.add(part(cyl(0.095, 0.085, 0.26, 14), COLORS.orange, { pos: [0, -0.12, 0] })); // pantorrilla
  const ankle = joint(knee, 0, -0.28, 0);
  // bota: caña azul con ribete amarillo y puntera
  ankle.add(part(cyl(0.095, 0.1, 0.13, 14), COLORS.boot, { pos: [0, 0.02, 0] }));
  ankle.add(part(cyl(0.1, 0.1, 0.03, 14), COLORS.bootTrim, { pos: [0, 0.095, 0], outline: 1.05 }));
  ankle.add(part(new THREE.BoxGeometry(0.17, 0.11, 0.26), COLORS.boot, { pos: [0, -0.045, 0.06] }));
  ankle.add(part(sphere(0.085, 12, 8), COLORS.boot, { pos: [0, -0.045, 0.19], scale: [1, 0.75, 1] }));
  return { hip, knee, ankle };
}

export function createGoku() {
  const root = new THREE.Group(); // posición en el mundo; rotation.y = dirección
  const model = joint(root); // grupo de modelo (escala global)

  const hips = joint(model, 0, 0.68, 0);
  hips.add(part(cyl(0.2, 0.19, 0.16, 16), COLORS.orange, { pos: [0, 0.0, 0] }));

  // Torso
  const torso = joint(hips, 0, 0.05, 0);
  torso.add(part(cyl(0.225, 0.2, 0.5, 18), COLORS.blue, { pos: [0, 0.28, 0], scale: [1, 1, 0.8] })); // camiseta azul
  torso.add(part(cyl(0.232, 0.205, 0.38, 18), COLORS.orange, { pos: [0, 0.22, 0.005], scale: [1, 1, 0.82], outline: 1.03 })); // gi
  // cuello de camiseta azul en V
  const collar = part(new THREE.ConeGeometry(0.1, 0.22, 4), COLORS.blue, { pos: [0, 0.42, 0.17], rot: [Math.PI, Math.PI / 4, 0], scale: [1, 1, 0.3], outline: 0 });
  torso.add(collar);
  torso.add(part(cyl(0.09, 0.1, 0.1, 12), COLORS.blue, { pos: [0, 0.54, 0] })); // cuello
  // emblema
  const emblem = part(new THREE.CircleGeometry(0.06, 16), COLORS.white, { pos: [0.1, 0.3, 0.19], rot: [0, 0.2, 0], outline: 0 });
  torso.add(emblem);
  emblem.add(part(new THREE.CircleGeometry(0.035, 12), 0xc4001a, { pos: [0, 0, 0.003], outline: 0 }));
  // cinturón azul con nudo y cintas
  torso.add(part(cyl(0.215, 0.215, 0.07, 18), COLORS.blue, { pos: [0, 0.03, 0], scale: [1.0, 1, 0.85], outline: 1.05 }));
  torso.add(part(sphere(0.05, 10, 8), COLORS.blue, { pos: [0.08, 0.03, 0.18], outline: 1.1 }));
  const tail1 = part(new THREE.BoxGeometry(0.05, 0.2, 0.015), COLORS.blue, { pos: [0.1, -0.08, 0.17], rot: [0.2, 0, -0.25], outline: 1.1 });
  const tail2 = part(new THREE.BoxGeometry(0.05, 0.17, 0.015), COLORS.blue, { pos: [0.04, -0.06, 0.18], rot: [0.2, 0, 0.3], outline: 1.1 });
  torso.add(tail1, tail2);

  // Cabeza + pelo
  const head = joint(torso, 0, 0.55, 0);
  buildHead(head);
  const hair = joint(head, 0, 0, 0);
  buildHair(hair);

  // Brazos y piernas
  const armL = buildArm(torso, 1);
  const armR = buildArm(torso, -1);
  const legL = buildLeg(hips, 1);
  const legR = buildLeg(hips, -1);

  model.scale.setScalar(1.05);
  root.traverse((o) => { if (o.isMesh && o.material !== outlineMat) o.receiveShadow = false; });

  return {
    root, model, hips, torso, head, hair,
    arms: [armL, armR],
    legs: [legL, legR],
    height: 1.55,
    radius: 0.32,
  };
}
