import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Ribbit Rescue: a Frogger-style game in three dimensions.
// Cross the roads and rivers, dodge the traffic, ride the logs, reach the
// princess. Get hit and the frog explodes into a cloud of cartoon pieces.
// ---------------------------------------------------------------------------

const HALF_W = 6;            // playfield spans columns -HALF_W .. HALF_W
const LOOP_LEN = HALF_W * 2 + 10; // distance moving things travel before wrapping
const HOP_TIME = 0.14;       // seconds per hop
const START_LIVES = 3;

// ----- renderer, scene, camera ---------------------------------------------

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87c9ff);
scene.fog = new THREE.Fog(0x87c9ff, 18, 40);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 6, 8);

const hemi = new THREE.HemisphereLight(0xffffff, 0x4a7a3a, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.4);
sun.position.set(6, 12, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 40;
scene.add(sun);
scene.add(sun.target);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ----- tiny sound synth -----------------------------------------------------

const audio = {
  ctx: null,
  ensure() {
    if (!this.ctx) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        this.ctx = null;
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },
  tone(freq, duration, type = 'square', volume = 0.08, slideTo = null) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t);
    osc.stop(t + duration);
  },
  hop() { this.tone(440, 0.08, 'square', 0.05, 660); },
  splash() { this.tone(300, 0.35, 'sine', 0.12, 80); },
  explode() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.5, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(gain).connect(this.ctx.destination);
    src.start(t);
    this.tone(120, 0.4, 'sawtooth', 0.1, 30);
  },
  fanfare() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.25, 'triangle', 0.1), i * 120));
  },
  gameOver() {
    const notes = [392, 349, 311, 262];
    notes.forEach((n, i) => setTimeout(() => this.tone(n, 0.35, 'sawtooth', 0.08), i * 200));
  },
};

// ----- materials and model builders ----------------------------------------

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });

const MATS = {
  grass: mat(0x5fbf5a),
  grassDark: mat(0x4ea84a),
  road: mat(0x3b3f46),
  roadLine: mat(0xf2e9a0),
  water: new THREE.MeshLambertMaterial({ color: 0x3a8fe0, transparent: true, opacity: 0.9 }),
  riverbed: mat(0x2a6bb0),
  log: mat(0x8a5a2b),
  logEnd: mat(0xc99a5a),
  trunk: mat(0x7a4b22),
  leaves: mat(0x2f8f3a),
  stone: mat(0xbfbfc9),
  stoneDark: mat(0x8e8e9a),
  roofRed: mat(0xc9403a),
  frog: mat(0x47c24a),
  frogBelly: mat(0xc8f0a0),
  white: mat(0xffffff),
  black: mat(0x111111),
  pink: mat(0xff6fae),
  skin: mat(0xffd7b5),
  gold: mat(0xffd34d),
  hair: mat(0x6b3a1e),
  wheel: mat(0x1b1b1f),
  glass: mat(0xaee6ff),
};

function shadowed(mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return shadowed(m);
}

function buildFrog() {
  const g = new THREE.Group();
  g.add(box(0.8, 0.45, 0.75, MATS.frog, 0, 0.35, 0));
  g.add(box(0.6, 0.2, 0.5, MATS.frogBelly, 0, 0.2, 0.05));
  // eyes
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), MATS.white);
    eye.position.set(side * 0.26, 0.68, -0.18);
    shadowed(eye);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), MATS.black);
    pupil.position.set(side * 0.26, 0.7, -0.32);
    g.add(pupil);
  }
  // legs
  g.add(box(0.22, 0.2, 0.4, MATS.frog, -0.45, 0.12, 0.2));
  g.add(box(0.22, 0.2, 0.4, MATS.frog, 0.45, 0.12, 0.2));
  g.add(box(0.2, 0.15, 0.3, MATS.frog, -0.4, 0.1, -0.25));
  g.add(box(0.2, 0.15, 0.3, MATS.frog, 0.4, 0.1, -0.25));
  return g;
}

const VEHICLE_KINDS = [
  { name: 'car', length: 1.6, colors: [0xe74c3c, 0xf1c40f, 0x3498db, 0xe67e22, 0x9b59b6, 0x1abc9c] },
  { name: 'truck', length: 2.6, colors: [0x2c3e50, 0x7f8c8d, 0xd35400] },
  { name: 'bus', length: 3.2, colors: [0xf39c12, 0x27ae60] },
];

function buildVehicle(kind, color) {
  const g = new THREE.Group();
  const bodyMat = mat(color);
  if (kind.name === 'car') {
    g.add(box(1.6, 0.4, 0.8, bodyMat, 0, 0.35, 0));
    g.add(box(0.9, 0.35, 0.72, MATS.glass, -0.05, 0.72, 0));
  } else if (kind.name === 'truck') {
    g.add(box(0.8, 0.7, 0.85, bodyMat, 0.9, 0.5, 0));
    g.add(box(0.5, 0.3, 0.7, MATS.glass, 0.95, 0.95, 0));
    g.add(box(1.7, 0.95, 0.9, MATS.stone, -0.4, 0.63, 0));
  } else {
    g.add(box(3.2, 0.9, 0.9, bodyMat, 0, 0.6, 0));
    g.add(box(3.0, 0.3, 0.92, MATS.glass, 0, 0.8, 0));
  }
  const wheelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.2, 10);
  const wheelXs = kind.name === 'car' ? [-0.5, 0.5] : [-kind.length / 2 + 0.5, kind.length / 2 - 0.5];
  for (const wx of wheelXs) {
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, MATS.wheel);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, 0.18, side * 0.42);
      shadowed(wheel);
      g.add(wheel);
    }
  }
  return g;
}

function buildLog(length) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, length, 12), MATS.log);
  body.rotation.z = Math.PI / 2;
  body.position.y = 0.1;
  shadowed(body);
  g.add(body);
  for (const side of [-1, 1]) {
    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.05, 12), MATS.logEnd);
    end.rotation.z = Math.PI / 2;
    end.position.set(side * (length / 2 + 0.01), 0.1, 0);
    g.add(end);
  }
  return g;
}

function buildTree() {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.6, 8), MATS.trunk);
  trunk.position.y = 0.3;
  shadowed(trunk);
  g.add(trunk);
  const size = 0.45 + Math.random() * 0.25;
  const leaves = new THREE.Mesh(new THREE.ConeGeometry(size, 1.1, 8), MATS.leaves);
  leaves.position.y = 1.0;
  shadowed(leaves);
  g.add(leaves);
  return g;
}

function buildCastle() {
  const g = new THREE.Group();
  g.add(box(4.2, 1.4, 1.6, MATS.stone, 0, 0.7, -0.6));
  for (const side of [-1, 1]) {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 2.4, 12), MATS.stoneDark);
    tower.position.set(side * 2.2, 1.2, -0.6);
    shadowed(tower);
    g.add(tower);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.65, 1.0, 12), MATS.roofRed);
    roof.position.set(side * 2.2, 2.9, -0.6);
    shadowed(roof);
    g.add(roof);
  }
  // doorway
  g.add(box(1.0, 1.1, 0.2, MATS.hair, 0, 0.55, 0.22));
  // flag
  g.add(box(0.05, 1.0, 0.05, MATS.black, 0, 1.9, -0.6));
  g.add(box(0.5, 0.3, 0.02, MATS.pink, 0.27, 2.25, -0.6));
  return g;
}

function buildPrincess() {
  const g = new THREE.Group();
  const dress = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.9, 12), MATS.pink);
  dress.position.y = 0.45;
  shadowed(dress);
  g.add(dress);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), MATS.skin);
  head.position.y = 1.1;
  shadowed(head);
  g.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 12, 0, Math.PI * 2, 0, Math.PI / 2), MATS.hair);
  hair.position.y = 1.13;
  g.add(hair);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.15, 6), MATS.gold);
  crown.position.y = 1.38;
  g.add(crown);
  return g;
}

// ----- level generation -----------------------------------------------------

function rand(min, max) { return min + Math.random() * (max - min); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function buildLevel(level) {
  const lanes = [];
  lanes.push({ type: 'grass', trees: new Set() });

  const target = 7 + Math.min(level * 2, 14);
  let band = Math.random() < 0.5 ? 'road' : 'river';
  while (lanes.length < target) {
    const size = 1 + Math.floor(rand(1, Math.min(4, 2 + level * 0.5)));
    for (let i = 0; i < size && lanes.length < target; i++) lanes.push(makeHazardLane(band, level));
    lanes.push(makeGrassLane());
    band = band === 'road' ? 'river' : 'road';
  }
  if (lanes[lanes.length - 1].type !== 'grass') lanes.push(makeGrassLane());
  lanes.push({ type: 'castle' });
  return lanes;
}

function makeGrassLane() {
  const trees = new Set();
  const count = Math.floor(rand(0, 3.5));
  for (let i = 0; i < count; i++) {
    const col = Math.floor(rand(-HALF_W, HALF_W + 1));
    if (col !== 0) trees.add(col);
  }
  return { type: 'grass', trees };
}

function makeHazardLane(type, level) {
  const dir = Math.random() < 0.5 ? -1 : 1;
  const speedScale = 1 + (level - 1) * 0.18;
  const lane = { type, dir, items: [] };
  if (type === 'road') {
    lane.speed = rand(1.6, 3.2) * speedScale;
    const count = Math.floor(rand(2, 4));
    const spacing = LOOP_LEN / count;
    const kind = pick(VEHICLE_KINDS);
    for (let i = 0; i < count; i++) {
      lane.items.push({
        x: -LOOP_LEN / 2 + i * spacing + rand(-0.6, 0.6),
        length: kind.length,
        kind,
        color: pick(kind.colors),
      });
    }
  } else {
    lane.speed = rand(0.9, 1.9) * speedScale;
    const count = Math.floor(rand(2, 4));
    const spacing = LOOP_LEN / count;
    for (let i = 0; i < count; i++) {
      lane.items.push({
        x: -LOOP_LEN / 2 + i * spacing + rand(-0.4, 0.4),
        length: Math.max(1.8, rand(2.0, 3.8) - level * 0.12),
      });
    }
  }
  return lane;
}

// ----- world construction ---------------------------------------------------

const world = new THREE.Group();
scene.add(world);
let lanes = [];
let princess = null;

function clearWorld() {
  while (world.children.length) {
    const child = world.children.pop();
    child.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}

function buildWorld(level) {
  clearWorld();
  lanes = buildLevel(level);
  const width = HALF_W * 2 + 14;

  lanes.forEach((lane, i) => {
    const z = -i;
    lane.z = z;
    if (lane.type === 'grass' || lane.type === 'castle') {
      const ground = box(width, 0.3, 1, i % 2 ? MATS.grass : MATS.grassDark, 0, -0.15, z);
      ground.castShadow = false;
      world.add(ground);
      if (lane.type === 'grass') {
        lane.treeMeshes = [];
        for (const col of lane.trees) {
          const tree = buildTree();
          tree.position.set(col, 0, z);
          world.add(tree);
        }
        // decorative trees off the playfield edges
        for (const side of [-1, 1]) {
          if (Math.random() < 0.7) {
            const tree = buildTree();
            tree.position.set(side * (HALF_W + 1 + Math.floor(rand(0, 4))), 0, z);
            world.add(tree);
          }
        }
      } else {
        const castle = buildCastle();
        castle.position.set(0, 0, z - 0.3);
        world.add(castle);
        princess = buildPrincess();
        princess.position.set(0, 0, z + 0.1);
        world.add(princess);
      }
    } else if (lane.type === 'road') {
      const ground = box(width, 0.3, 1, MATS.road, 0, -0.15, z);
      ground.castShadow = false;
      world.add(ground);
      for (let x = -width / 2; x < width / 2; x += 1.2) {
        const line = box(0.6, 0.02, 0.06, MATS.roadLine, x, 0.01, z + 0.5);
        line.castShadow = false;
        world.add(line);
      }
      lane.meshes = lane.items.map((item) => {
        const v = buildVehicle(item.kind, item.color);
        v.rotation.y = lane.dir > 0 ? 0 : Math.PI;
        v.position.set(item.x, 0, z);
        world.add(v);
        return v;
      });
    } else if (lane.type === 'river') {
      const bed = box(width, 0.2, 1, MATS.riverbed, 0, -0.3, z);
      bed.castShadow = false;
      world.add(bed);
      const water = box(width, 0.1, 1, MATS.water, 0, -0.2, z);
      water.castShadow = false;
      world.add(water);
      lane.meshes = lane.items.map((item) => {
        const l = buildLog(item.length);
        l.position.set(item.x, -0.15, z);
        world.add(l);
        return l;
      });
    }
  });

  // side walls of grass beyond the first lane so the start does not float
  for (let i = 1; i <= 4; i++) {
    const ground = box(width, 0.3, 1, i % 2 ? MATS.grass : MATS.grassDark, 0, -0.15, i);
    ground.castShadow = false;
    world.add(ground);
  }
}

// ----- frog -----------------------------------------------------------------

const frog = buildFrog();
scene.add(frog);

const state = {
  mode: 'title',          // title | playing | dying | rescued | gameover
  level: 1,
  score: 0,
  lives: START_LIVES,
  bestLane: 0,
  frogX: 0,
  frogLane: 0,
  hop: null,              // { fromX, fromLane, toX, toLane, t }
  queue: [],
  modeTimer: 0,
  facing: 0,
};

const particles = [];

function resetFrog() {
  state.frogX = 0;
  state.frogLane = 0;
  state.bestLane = 0;
  state.hop = null;
  state.queue.length = 0;
  state.facing = 0;
  frog.visible = true;
  frog.scale.set(1, 1, 1);
  frog.rotation.set(0, 0, 0);
  frog.position.set(0, 0, 0);
}

function startLevel(level) {
  state.level = level;
  buildWorld(level);
  resetFrog();
  updateHud();
}

function startGame() {
  audio.ensure();
  state.score = 0;
  state.lives = START_LIVES;
  state.mode = 'playing';
  hideOverlay();
  startLevel(1);
}

// ----- input ----------------------------------------------------------------

const DIRS = {
  up: { dx: 0, dl: 1, face: 0 },
  down: { dx: 0, dl: -1, face: Math.PI },
  left: { dx: -1, dl: 0, face: Math.PI / 2 },
  right: { dx: 1, dl: 0, face: -Math.PI / 2 },
};

function requestHop(dir) {
  audio.ensure();
  if (state.mode === 'title' || state.mode === 'gameover') {
    if (state.mode === 'gameover' && state.modeTimer < 1) return;
    startGame();
    return;
  }
  if (state.mode !== 'playing') return;
  if (state.queue.length < 2) state.queue.push(dir);
}

const KEYS = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
};

window.addEventListener('keydown', (e) => {
  const dir = KEYS[e.code];
  if (dir) {
    e.preventDefault();
    requestHop(dir);
  } else if ((e.code === 'Space' || e.code === 'Enter') && state.mode !== 'playing') {
    requestHop('up');
  }
});

document.getElementById('start-button').addEventListener('click', () => {
  if (state.mode === 'title' || state.mode === 'gameover') startGame();
});

for (const button of document.querySelectorAll('#dpad button')) {
  const dir = button.dataset.dir;
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    requestHop(dir);
  });
}

// swipe / tap on the canvas
let touchStart = null;
canvas.addEventListener('pointerdown', (e) => {
  touchStart = { x: e.clientX, y: e.clientY, time: performance.now() };
});
canvas.addEventListener('pointerup', (e) => {
  if (!touchStart) return;
  const dx = e.clientX - touchStart.x;
  const dy = e.clientY - touchStart.y;
  touchStart = null;
  const dist = Math.hypot(dx, dy);
  if (dist < 18) {
    requestHop('up');
    return;
  }
  if (Math.abs(dx) > Math.abs(dy)) requestHop(dx > 0 ? 'right' : 'left');
  else requestHop(dy < 0 ? 'up' : 'down');
});

// ----- HUD / overlays -------------------------------------------------------

const hudLevel = document.getElementById('hud-level');
const hudScore = document.getElementById('hud-score');
const hudLives = document.getElementById('hud-lives');
const overlay = document.getElementById('overlay');
const overlayMessage = document.getElementById('overlay-message');
const startButton = document.getElementById('start-button');
const banner = document.getElementById('banner');
let bannerTimer = null;

function updateHud() {
  hudLevel.textContent = String(state.level);
  hudScore.textContent = String(state.score);
  hudLives.textContent = state.lives > 0 ? '🐸'.repeat(state.lives) : '💀';
}

function showBanner(text, pink = false, duration = 1600) {
  banner.textContent = text;
  banner.classList.toggle('pink', pink);
  banner.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => banner.classList.remove('show'), duration);
}

function hideOverlay() {
  overlay.classList.remove('visible');
}

function showGameOver() {
  overlay.querySelector('h1').textContent = 'Game Over';
  overlay.querySelector('.tagline').textContent = 'The princess is still waiting.';
  overlayMessage.innerHTML = `You reached level ${state.level} with a score of ${state.score}.`;
  startButton.textContent = 'Try again';
  overlay.classList.add('visible');
}

// ----- particles ------------------------------------------------------------

const pieceGeo = new THREE.BoxGeometry(0.18, 0.18, 0.18);
const heartGeo = new THREE.SphereGeometry(0.12, 8, 8);

function burst(position, { count, material, speed, up, geometry = pieceGeo, gravity = -14, life = 1.6 }) {
  for (let i = 0; i < count; i++) {
    const m = new THREE.Mesh(geometry, material);
    m.position.copy(position);
    m.position.y += 0.3;
    m.castShadow = true;
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * speed;
    m.userData.vel = new THREE.Vector3(Math.cos(angle) * r, up * (0.5 + Math.random()), Math.sin(angle) * r);
    m.userData.spin = new THREE.Vector3(rand(-8, 8), rand(-8, 8), rand(-8, 8));
    m.userData.life = life;
    m.userData.maxLife = life;
    m.userData.gravity = gravity;
    scene.add(m);
    particles.push(m);
  }
}

function explodeFrog() {
  const p = frog.position.clone();
  burst(p, { count: 34, material: MATS.frog, speed: 5, up: 7 });
  burst(p, { count: 8, material: MATS.frogBelly, speed: 4, up: 6 });
  burst(p, { count: 4, material: MATS.white, speed: 3, up: 8 });
  burst(p, { count: 6, material: MATS.black, speed: 3, up: 6, geometry: heartGeo });
}

function splashFrog() {
  const p = frog.position.clone();
  burst(p, { count: 30, material: MATS.water, speed: 3, up: 5, geometry: heartGeo, gravity: -10, life: 1.0 });
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const m = particles[i];
    const d = m.userData;
    d.life -= dt;
    d.vel.y += d.gravity * dt;
    m.position.addScaledVector(d.vel, dt);
    m.rotation.x += d.spin.x * dt;
    m.rotation.y += d.spin.y * dt;
    m.rotation.z += d.spin.z * dt;
    if (m.position.y < 0.09 && d.gravity < 0) {
      m.position.y = 0.09;
      d.vel.y *= -0.35;
      d.vel.x *= 0.7;
      d.vel.z *= 0.7;
    }
    const s = Math.max(0.001, Math.min(1, d.life / d.maxLife * 2));
    m.scale.setScalar(s);
    if (d.life <= 0) {
      scene.remove(m);
      particles.splice(i, 1);
    }
  }
}

// ----- game logic -----------------------------------------------------------

function die(kind) {
  if (state.mode !== 'playing') return;
  state.mode = 'dying';
  state.modeTimer = 0;
  state.hop = null;
  state.queue.length = 0;
  frog.visible = false;
  if (kind === 'splash') {
    splashFrog();
    audio.splash();
    showBanner('Splash!');
  } else {
    explodeFrog();
    audio.explode();
    showBanner('KABOOM!');
  }
  state.lives -= 1;
  updateHud();
}

function rescue() {
  state.mode = 'rescued';
  state.modeTimer = 0;
  state.hop = null;
  state.queue.length = 0;
  state.score += 500 + state.level * 100;
  updateHud();
  audio.fanfare();
  showBanner('Princess rescued!', true, 2600);
}

function startHop(dir) {
  const d = DIRS[dir];
  const toLane = state.frogLane + d.dl;
  if (toLane < 0 || toLane >= lanes.length) return;
  const target = lanes[toLane];
  let toX = state.frogX + d.dx;
  if (target.type !== 'river') toX = Math.round(toX);
  if (Math.abs(toX) > HALF_W + 0.3) return;
  if (target.type === 'grass' && target.trees.has(Math.round(toX))) return;
  if (target.type === 'castle' && Math.abs(toX) > 1.5) return;
  state.facing = d.face;
  state.hop = { fromX: state.frogX, fromLane: state.frogLane, toX, toLane, t: 0 };
  audio.hop();
}

function finishHop() {
  const h = state.hop;
  state.frogX = h.toX;
  state.frogLane = h.toLane;
  state.hop = null;
  if (state.frogLane > state.bestLane) {
    state.score += 10 * (state.frogLane - state.bestLane);
    state.bestLane = state.frogLane;
    updateHud();
  }
  if (lanes[state.frogLane].type === 'castle') rescue();
}

function updateLanes(dt) {
  for (const lane of lanes) {
    if (lane.type !== 'road' && lane.type !== 'river') continue;
    lane.items.forEach((item, i) => {
      item.x += lane.dir * lane.speed * dt;
      if (item.x > LOOP_LEN / 2) item.x -= LOOP_LEN;
      if (item.x < -LOOP_LEN / 2) item.x += LOOP_LEN;
      lane.meshes[i].position.x = item.x;
    });
  }
}

function checkFrog(dt) {
  const lane = lanes[state.frogLane];
  if (lane.type === 'road') {
    for (const item of lane.items) {
      if (Math.abs(item.x - state.frogX) < item.length / 2 + 0.35) {
        die('explode');
        return;
      }
    }
  } else if (lane.type === 'river') {
    let onLog = null;
    for (const item of lane.items) {
      if (Math.abs(item.x - state.frogX) < item.length / 2 + 0.2) {
        onLog = item;
        break;
      }
    }
    if (!onLog) {
      die('splash');
      return;
    }
    state.frogX += lane.dir * lane.speed * dt;
    if (Math.abs(state.frogX) > HALF_W + 0.6) {
      die('splash');
    }
  }
}

function updateFrogVisual() {
  if (state.hop) {
    const h = state.hop;
    const t = Math.min(1, h.t / HOP_TIME);
    const x = THREE.MathUtils.lerp(h.fromX, h.toX, t);
    const z = THREE.MathUtils.lerp(-h.fromLane, -h.toLane, t);
    const y = Math.sin(t * Math.PI) * 0.6;
    frog.position.set(x, y, z);
    const squash = 1 + Math.sin(t * Math.PI) * 0.15;
    frog.scale.set(1 / squash, squash, 1 / squash);
  } else {
    const lane = lanes[state.frogLane];
    const y = lane && lane.type === 'river' ? 0.12 : 0;
    frog.position.set(state.frogX, y, -state.frogLane);
    frog.scale.set(1, 1, 1);
  }
  frog.rotation.y = state.facing;
}

function updateCamera(dt) {
  const fx = frog.position.x * 0.55;
  const fz = frog.position.z;
  let targetPos;
  let lookAt;
  if (state.mode === 'rescued' && princess) {
    const a = state.modeTimer * 0.8;
    targetPos = new THREE.Vector3(princess.position.x + Math.sin(a) * 4, 2.5, princess.position.z + 1 + Math.cos(a) * 4);
    lookAt = new THREE.Vector3(princess.position.x, 0.8, princess.position.z);
  } else {
    targetPos = new THREE.Vector3(fx, 5.5, fz + 7);
    lookAt = new THREE.Vector3(fx, 0.4, fz - 3);
  }
  const k = 1 - Math.pow(0.001, dt);
  camera.position.lerp(targetPos, k);
  camera.lookAt(lookAt);
  sun.position.set(fx + 6, 12, fz + 6);
  sun.target.position.set(fx, 0, fz);
}

function nextLevel() {
  state.mode = 'playing';
  startLevel(state.level + 1);
  showBanner(`Level ${state.level}`, false, 1400);
}

const clock = new THREE.Clock();

function frame() {
  requestAnimationFrame(frame);
  const dt = Math.min(clock.getDelta(), 0.05);
  state.modeTimer += dt;

  if (state.mode === 'playing') {
    updateLanes(dt);
    if (state.hop) {
      state.hop.t += dt;
      if (state.hop.t >= HOP_TIME) finishHop();
    } else if (state.queue.length) {
      startHop(state.queue.shift());
    }
    if (state.mode === 'playing' && !state.hop) checkFrog(dt);
    updateFrogVisual();
  } else if (state.mode === 'dying') {
    updateLanes(dt);
    if (state.modeTimer > 1.6) {
      if (state.lives > 0) {
        state.mode = 'playing';
        resetFrog();
      } else {
        state.mode = 'gameover';
        state.modeTimer = 0;
        audio.gameOver();
        showGameOver();
      }
    }
  } else if (state.mode === 'rescued') {
    updateLanes(dt);
    updateFrogVisual();
    if (princess) {
      princess.position.y = Math.abs(Math.sin(state.modeTimer * 6)) * 0.3;
      if (Math.random() < 0.3) {
        burst(princess.position, { count: 1, material: MATS.pink, speed: 1.2, up: 3, geometry: heartGeo, gravity: 2, life: 1.2 });
      }
    }
    if (state.modeTimer > 3) nextLevel();
  } else if (state.mode === 'title' || state.mode === 'gameover') {
    updateLanes(dt);
  }

  updateParticles(dt);
  updateCamera(dt);
  renderer.render(scene, camera);
}

// ----- boot -----------------------------------------------------------------

startLevel(1);
state.mode = 'title';
frame();

// Exposed for debugging and automated smoke tests.
window.ribbit = { state, lanes: () => lanes, requestHop };
