import * as THREE from 'three';
import { Physics } from './physics.js';
import { Controls } from './controls.js';
import { ThirdPersonCamera } from './camera.js';
import { buildWorld, terrainHeight } from './world.js';
import { createGoku } from './character/goku.js';
import { GokuAnimator } from './character/animations.js';
import { PlayerController } from './character/movement.js';
import { Interface } from './ui/interface.js';

const ui = new Interface({
  totalBalls: 7,
  onStart: () => start(),
  onPause: () => setPaused(true),
  onResume: () => setPaused(false),
});

let running = false;
let paused = false;

function setPaused(value) {
  if (!running || paused === value) return;
  paused = value;
  ui.showPause(paused);
}

function webglAvailable() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch (e) {
    return false;
  }
}

let renderer;
let scene;
let camera;
let physics;
let world;
let player;
let animator;
let followCam;
let controls;
let elapsed = 0;

function init() {
  const canvas = document.getElementById('game');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0xcfe8ff);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, 1, 0.1, 1500);

  physics = new Physics(terrainHeight);
  world = buildWorld(scene, physics);

  const goku = createGoku();
  scene.add(goku.root);
  player = new PlayerController(goku, physics, world.spawn);
  animator = new GokuAnimator(goku);

  followCam = new ThirdPersonCamera(camera, physics);
  followCam.snapTo(player.position);
  followCam.yaw = 0.0;

  controls = new Controls(canvas, {
    onPauseToggle: () => { if (running) setPaused(!paused); },
  });

  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
  if (import.meta.env.DEV) window.__game = { player, world, physics, followCam };

  // Posición inicial de cámara para que el menú ya muestre el escenario.
  followCam.update(0.016, player.position, { lookDX: 0, lookDY: 0, wheel: 0 }, controls.keys, 0);
  animator.update(0.016, player.state, { speed: 0, vy: 0 });
  renderer.setAnimationLoop(frame);
}

let lastTime = 0;
function frame(now) {
  const rawDt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  ui.tickFps(rawDt || 0.016);

  if (running && !paused) {
    const dt = Math.min(rawDt, 1 / 30);
    elapsed += dt;
    const input = controls.consume();
    // Subpasos para que el salto/colisiones sean estables si el frame es largo.
    const steps = dt > 1 / 60 ? 2 : 1;
    for (let i = 0; i < steps; i++) {
      player.update(dt / steps, controls.axis, controls.keys, input.jumpPressed && i === 0, followCam.yaw);
    }
    animator.update(dt, player.state, { speed: player.speed, vy: player.velocity.y });
    followCam.update(dt, player.position, input, controls.keys, player.speed);
    const got = world.update(dt, elapsed, player.position);
    if (got) ui.setBalls(got);
    ui.setState(player.state);
  } else if (!running) {
    // Menú: la cámara orbita lentamente alrededor de Goku.
    elapsed += rawDt;
    followCam.yaw = Math.PI + Math.sin(elapsed * 0.3) * 0.5;
    animator.update(rawDt, player.state, { speed: 0, vy: 0 });
    followCam.update(rawDt, player.position, { lookDX: 0, lookDY: 0, wheel: 0 }, controls.keys, 0);
    world.update(rawDt, elapsed, player.position);
  }
  renderer.render(scene, camera);
}

function start() {
  running = true;
  paused = false;
  followCam.yaw = 0;
  document.getElementById('game').focus();
}

function fail(message) {
  console.error(message);
  ui.showError(message);
  renderer?.setAnimationLoop(null);
}

window.addEventListener('error', (e) => fail(`Error inesperado: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => fail(`Error inesperado: ${e.reason?.message || e.reason}`));

if (!webglAvailable()) {
  fail('Tu navegador o dispositivo no soporta WebGL. Prueba con un navegador moderno y con la aceleración por hardware activada.');
} else {
  try {
    init();
    ui.setReady();
  } catch (err) {
    fail(`No se pudo iniciar el juego: ${err.message}`);
  }
}
