import * as THREE from 'three';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/loaders/GLTFLoader.js';

/* STORM QUEST 3D flight scene
   The original game.js still controls scoring, movement and collisions.
   This file renders the aircraft and the weather in a real Three.js scene. */
const wrap = document.getElementById('canvasWrap');
const view = document.createElement('canvas');
view.id = 'aircraftCanvas';
view.setAttribute('aria-label', 'Three-dimensional STORM QUEST flight scene');
wrap.insertBefore(view, wrap.querySelector('#warningFlash'));

const lowEndDevice = (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4) || window.matchMedia('(max-width: 650px)').matches;
const renderer = new THREE.WebGLRenderer({ canvas: view, alpha: false, antialias: !lowEndDevice, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEndDevice ? 1 : 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x76c8ee);
const camera = new THREE.OrthographicCamera(-5.7, 5.7, 2.96, -2.96, 0.1, 100);
camera.position.set(0, 14, 0);
camera.up.set(0, 0, -1);
camera.lookAt(0, 0, 0);

scene.add(new THREE.HemisphereLight(0xeaf7ff, 0x52647a, 2.0));
const sunlight = new THREE.DirectionalLight(0xffffff, 2.4);
sunlight.position.set(-4, 9, 5);
scene.add(sunlight);
const rimLight = new THREE.DirectionalLight(0x73caff, 1.15);
rimLight.position.set(4, 5, -5);
scene.add(rimLight);

// A softly graded sky floor gives the scene depth without a heavy skybox.
const skyCanvas = document.createElement('canvas');
skyCanvas.width = 8;
skyCanvas.height = 256;
const skyCtx = skyCanvas.getContext('2d');
function paintSky(isStorm) {
  const gradient = skyCtx.createLinearGradient(0, 0, 0, 256);
  if (isStorm) {
    gradient.addColorStop(0, '#17283f');
    gradient.addColorStop(0.48, '#344b67');
    gradient.addColorStop(1, '#71849a');
  } else {
    gradient.addColorStop(0, '#4b9dd2');
    gradient.addColorStop(0.48, '#8bd5f2');
    gradient.addColorStop(1, '#d8f5ff');
  }
  skyCtx.fillStyle = gradient;
  skyCtx.fillRect(0, 0, 8, 256);
  skyTexture.needsUpdate = true;
}
const skyTexture = new THREE.CanvasTexture(skyCanvas);
skyTexture.colorSpace = THREE.SRGBColorSpace;
paintSky(false);
const sky = new THREE.Mesh(new THREE.PlaneGeometry(80, 50), new THREE.MeshBasicMaterial({ map: skyTexture }));
sky.rotation.x = -Math.PI / 2;
sky.position.y = -1.5;
sky.position.z = -12;
scene.add(sky);

const aircraftRoot = new THREE.Group();
scene.add(aircraftRoot);
let mixer = null;
let loaded = false;
let lastTime = performance.now();
let targetX = -4.15;
let targetZ = 0;
let targetBank = 0;
let targetPitch = 0;
let targetWobble = 0;
let currentLevel = 1;
let lightningFlash = 0;
let worldTime = 0;
const weatherMeshes = new Map();
const ambientClouds = [];
let lastSkyLevel = 1;
let rainField = null;

const loader = new GLTFLoader();
loader.load('./storm-quest-aircraft.glb', (gltf) => {
  const model = gltf.scene;
  aircraftRoot.add(model);
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  model.position.sub(center);
  const largest = Math.max(size.x, size.y, size.z) || 1;
  model.scale.setScalar(3.15 / largest);
  // The model's nose faces the direction of flight, towards screen-right.
  aircraftRoot.rotation.y = Math.PI / 2;
  if (gltf.animations?.length) {
    mixer = new THREE.AnimationMixer(model);
    gltf.animations.forEach((clip) => mixer.clipAction(clip).play());
  }
  loaded = true;
  const loading = document.getElementById('aircraftLoading');
  if (loading) loading.remove();
}, undefined, (error) => {
  console.error('Could not load STORM QUEST aircraft:', error);
  const loading = document.getElementById('aircraftLoading');
  if (loading) loading.textContent = 'Aircraft could not load. Please run STORM QUEST using a local web server.';
});

const cloudMaterial = new THREE.MeshStandardMaterial({ color: 0xf4fbff, roughness: 1, flatShading: true });
const stormMaterial = new THREE.MeshStandardMaterial({ color: 0x35465e, roughness: 1, flatShading: true });
const windMaterial = new THREE.MeshBasicMaterial({ color: 0xd9fbff, transparent: true, opacity: 0.72 });
const cycloneMaterial = new THREE.MeshBasicMaterial({ color: 0x9cecff, transparent: true, opacity: 0.68, side: THREE.DoubleSide });
const sphereGeometry = new THREE.SphereGeometry(1, 12, 9);

function makeCloud(group, material, scale = 1) {
  const pieces = [
    [-0.55, 0, 0, 0.62], [-0.12, 0.13, -0.08, 0.82],
    [0.42, 0.02, 0.02, 0.64], [0.04, -0.08, 0.27, 0.68]
  ];
  pieces.forEach(([x, y, z, s]) => {
    const puff = new THREE.Mesh(sphereGeometry, material);
    puff.position.set(x * scale, y * scale, z * scale);
    puff.scale.set(s * scale, s * 0.48 * scale, s * 0.7 * scale);
    group.add(puff);
  });
}

// Fine rain streaks are only enabled in the thunderstorm mission.
const rainPositions = new Float32Array(180 * 6);
for (let i = 0; i < 180; i++) {
  const x = (Math.random() - 0.5) * 24;
  const z = (Math.random() - 0.5) * 9;
  const offset = i * 6;
  rainPositions[offset] = x; rainPositions[offset + 1] = -0.82; rainPositions[offset + 2] = z;
  rainPositions[offset + 3] = x + 0.06; rainPositions[offset + 4] = -0.82; rainPositions[offset + 5] = z + 0.22;
}
const rainGeometry = new THREE.BufferGeometry();
rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
rainField = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: 0xb8d9f0, transparent: true, opacity: 0.38 }));
rainField.visible = false;
scene.add(rainField);

function setWeatherMood(level) {
  const storm = level === 2;
  paintSky(storm);
  cloudMaterial.color.set(storm ? 0x718096 : 0xf4fbff);
  rainField.visible = storm;
  pressureField.visible = !storm;
  windField.visible = true;
  sunlight.intensity = storm ? 0.85 : 2.4;
  rimLight.intensity = storm ? 0.65 : 1.15;
}

// Slow-moving distant clouds keep the sky from feeling static.
for (let i = 0; i < 11; i++) {
  const group = new THREE.Group();
  makeCloud(group, cloudMaterial, 0.75 + Math.random() * 0.75);
  group.position.set(-9 + Math.random() * 22, -0.35 + Math.random() * 0.18, -2.7 + Math.random() * 5.4);
  group.userData.speed = 0.12 + Math.random() * 0.2;
  group.userData.phase = Math.random() * Math.PI * 2;
  scene.add(group);
  ambientClouds.push(group);
}

function makeWindObject() {
  const group = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const points = [new THREE.Vector3(-1.0, 0, i * 0.12), new THREE.Vector3(-0.35, 0, i * 0.12 - 0.08), new THREE.Vector3(0.35, 0, i * 0.12 + 0.08), new THREE.Vector3(1.0, 0, i * 0.12)];
    const curve = new THREE.CatmullRomCurve3(points);
    const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.018, 5, false), windMaterial);
    group.add(line);
  }
  return group;
}

function makeCyclone() {
  const group = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const radius = 0.42 + i * 0.19;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.035, 5, 64), cycloneMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.05 + i * 0.012;
    group.add(ring);
  }
  const eye = new THREE.Mesh(new THREE.CircleGeometry(0.24, 32), new THREE.MeshBasicMaterial({ color: 0x253f58, transparent: true, opacity: 0.72 }));
  eye.rotation.x = -Math.PI / 2;
  eye.position.y = 0.09;
  group.add(eye);
  const spiralPoints = [];
  for (let i = 0; i <= 100; i++) {
    const t = i / 100 * Math.PI * 5;
    const r = 0.12 + i / 100 * 0.82;
    spiralPoints.push(new THREE.Vector3(Math.cos(t) * r, 0.13, Math.sin(t) * r));
  }
  const spiral = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiralPoints), 100, 0.025, 5, false), new THREE.MeshBasicMaterial({ color: 0xd5f7ff, transparent: true, opacity: 0.85 }));
  group.add(spiral);
  return group;
}

function makeThundercloud() {
  const group = new THREE.Group();
  makeCloud(group, stormMaterial, 1.18);
  const boltPoints = [
    new THREE.Vector3(0.25, 0.16, 0.15), new THREE.Vector3(0.02, 0.16, 0.42),
    new THREE.Vector3(0.22, 0.16, 0.57), new THREE.Vector3(-0.12, 0.16, 0.92)
  ];
  const bolt = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(boltPoints), 12, 0.035, 5, false), new THREE.MeshBasicMaterial({ color: 0xfff49a, emissive: 0xffd84a }));
  bolt.name = 'lightningBolt';
  bolt.visible = false;
  group.add(bolt);
  return group;
}

// Level 1 science visuals: high-pressure air spreads outward; low-pressure
// air converges and rises. These are learning visuals, not collision hazards.
const pressureField = new THREE.Group();
scene.add(pressureField);
const pressureParticles = [];
const pressureZones = [];
const pressureRingMaterial = new THREE.MeshBasicMaterial({ color: 0x26d8ff, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
const lowRingMaterial = new THREE.MeshBasicMaterial({ color: 0xffa33a, transparent: true, opacity: 0.72, side: THREE.DoubleSide });

function makeLabelSprite(label, color) {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const c = canvas.getContext('2d');
  c.fillStyle = 'rgba(8,35,59,0.72)';
  c.beginPath(); c.roundRect(12, 12, 488, 104, 28); c.fill();
  c.font = 'bold 46px system-ui, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = color; c.fillText(label, 256, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.25, 0.56, 1);
  return sprite;
}

function addPressureZone(x, z, type) {
  const group = new THREE.Group();
  group.position.set(x, -0.32, z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.025, 6, 64), type === 'high' ? pressureRingMaterial : lowRingMaterial);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.014, 5, 64), type === 'high' ? pressureRingMaterial : lowRingMaterial);
  inner.rotation.x = Math.PI / 2;
  group.add(inner);
  pressureField.add(group);
  pressureZones.push({ group, type, x, z, phase: Math.random() * Math.PI * 2 });
}
addPressureZone(-2.35, -1.45, 'high');
addPressureZone(2.35, 1.45, 'low');

for (let i = 0; i < 48; i++) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.035 + Math.random() * 0.018, 7, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xe6fbff : 0xfff0c9, transparent: true, opacity: 0.78 }));
  pressureField.add(dot);
  pressureParticles.push({ mesh: dot, zone: i < 24 ? pressureZones[0] : pressureZones[1], phase: Math.random() * Math.PI * 2, radius: 0.18 + Math.random() * 0.68, speed: 0.55 + Math.random() * 0.55 });
}

// Fine wind ribbons and travelling air particles make the airflow visible.
const windField = new THREE.Group();
scene.add(windField);
const windDots = [];
const ribbonMaterial = new THREE.MeshBasicMaterial({ color: 0xe2faff, transparent: true, opacity: 0.2 });
for (let i = 0; i < 9; i++) {
  const z = -2.25 + i * 0.56;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-7.5, -0.48, z + 0.12),
    new THREE.Vector3(-3.5, -0.42, z - 0.08),
    new THREE.Vector3(0.2, -0.5, z + 0.1),
    new THREE.Vector3(4.0, -0.42, z - 0.1),
    new THREE.Vector3(7.5, -0.48, z + 0.08)
  ]);
  windField.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.009, 4, false), ribbonMaterial));
}
for (let i = 0; i < 34; i++) {
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 5), new THREE.MeshBasicMaterial({ color: 0xf2fdff, transparent: true, opacity: 0.7 }));
  windField.add(dot);
  windDots.push({ mesh: dot, x: -7 + Math.random() * 14, z: -2.3 + Math.random() * 4.6, speed: 1.0 + Math.random() * 1.4, phase: Math.random() * Math.PI * 2 });
}

setWeatherMood(1);

function makePressureCurrent(type) {
  const group = new THREE.Group();
  const colour = type === 'high' ? 0x26d8ff : 0xffa33a;
  const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.88 });
  for (let i = 0; i < 5; i++) {
    const points = [];
    for (let j = 0; j <= 12; j++) {
      const t = j / 12;
      const x = (t - 0.5) * 2.8;
      const bend = Math.sin(t * Math.PI) * 0.42;
      const z = (i - 2) * 0.17 + (type === 'high' ? bend : -bend);
      points.push(new THREE.Vector3(x, 0.02 + i * 0.008, z));
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const line = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.025, 5, false), material);
    group.add(line);
  }
  const glow = new THREE.Mesh(
    new THREE.TorusGeometry(0.82, 0.018, 5, 48),
    new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: 0.5 })
  );
  glow.rotation.x = Math.PI / 2;
  group.add(glow);
  return group;
}

function createWeatherMesh(item) {
  let group;
  if (item.type === 'cyclone') group = makeCyclone();
  else if (item.type === 'high' || item.type === 'low') group = makePressureCurrent(item.type);
  else if (currentLevel === 2) group = makeThundercloud();
  else if (item.type === 'wind') group = makeWindObject();
  else {
    group = new THREE.Group();
    makeCloud(group, cloudMaterial, 1.05);
  }
  group.userData.kind = item.type;
  scene.add(group);
  return group;
}

function resize() {
  const rect = wrap.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  renderer.setSize(width, height, false);
  const aspect = width / height;
  const halfHeight = 2.96;
  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();
}
const resizeObserver = new ResizeObserver(resize);
resizeObserver.observe(wrap);
window.addEventListener('resize', resize);
resize();

function mapX(x) {
  const rect = wrap.getBoundingClientRect();
  return ((x / (rect.width || 1000)) - 0.5) * (camera.right - camera.left);
}
function mapZ(y) {
  const rect = wrap.getBoundingClientRect();
  return ((y / (rect.height || 520)) - 0.5) * (camera.top - camera.bottom);
}

window.stormAircraft = {
  update(state = {}) {
    const rect = wrap.getBoundingClientRect();
    const x = Number.isFinite(state.x) ? state.x : 125;
    const y = Number.isFinite(state.y) ? state.y : rect.height / 2;
    const tilt = Number.isFinite(state.tilt) ? state.tilt : 0;
    targetX = mapX(x);
    targetZ = mapZ(y);
    targetBank = -tilt * 0.8;
    targetPitch = Math.sin(performance.now() * 0.003) * 0.025;
    targetWobble = Number.isFinite(state.wobble) ? state.wobble : 0;
    currentLevel = state.level || currentLevel;
    if (currentLevel !== lastSkyLevel) {
      setWeatherMood(currentLevel);
      lastSkyLevel = currentLevel;
    }
    lightningFlash = state.lightningFlash || 0;
    worldTime = state.worldTime || 0;

    const items = Array.isArray(state.objects) ? state.objects : [];
    const activeIds = new Set();
    items.forEach((item, index) => {
      const id = item.id ?? `${item.type}-${index}`;
      activeIds.add(id);
      let mesh = weatherMeshes.get(id);
      if (!mesh || mesh.userData.kind !== item.type || mesh.userData.level !== currentLevel) {
        if (mesh) scene.remove(mesh);
        mesh = createWeatherMesh(item);
        mesh.userData.level = currentLevel;
        weatherMeshes.set(id, mesh);
      }
      mesh.position.set(mapX(item.x), -0.02, mapZ(item.y));
      const size = item.type === 'cyclone' ? Math.max(0.55, item.size / 55) : Math.max(0.55, item.size / 45);
      mesh.scale.setScalar(size);
      mesh.rotation.y = item.rotation || 0;
      if (item.type === 'cyclone') mesh.rotation.y += worldTime * 0.45;
      const bolt = mesh.getObjectByName('lightningBolt');
      if (bolt) bolt.visible = Math.sin(worldTime * 7 + index) > 0.2 || lightningFlash > 0;
    });
    for (const [id, mesh] of weatherMeshes) {
      if (!activeIds.has(id)) {
        scene.remove(mesh);
        weatherMeshes.delete(id);
      }
    }
  },
  get loaded() { return loaded; }
};

function render(now) {
  requestAnimationFrame(render);
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  if (mixer) mixer.update(dt);
  if (rainField?.visible) {
    const positions = rainField.geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 2) {
      let z = positions.getZ(i) + dt * 3.8;
      if (z > 5) z = -5;
      positions.setZ(i, z);
      positions.setZ(i + 1, z + 0.22);
    }
    positions.needsUpdate = true;
  }
  windDots.forEach((item) => {
    item.x += item.speed * dt;
    if (item.x > 7.7) item.x = -7.7;
    item.mesh.position.set(item.x, -0.34 + Math.sin(worldTime * 1.4 + item.phase) * 0.035, item.z + Math.sin(worldTime + item.phase) * 0.045);
  });
  pressureZones.forEach((zone, index) => {
    const pulse = 1 + Math.sin(worldTime * 1.35 + zone.phase) * 0.045;
    zone.group.scale.setScalar(pulse);
    zone.group.rotation.y = zone.type === 'high' ? worldTime * 0.12 : -worldTime * 0.12;
  });
  pressureParticles.forEach((item) => {
    const t = worldTime * item.speed + item.phase;
    let radius;
    let height;
    if (item.zone.type === 'high') {
      radius = 0.2 + ((t % (Math.PI * 2)) / (Math.PI * 2)) * 0.78;
      height = -0.25 + Math.sin(t * 1.4) * 0.025;
    } else {
      radius = 0.92 - ((t % (Math.PI * 2)) / (Math.PI * 2)) * 0.72;
      height = -0.25 + ((t % (Math.PI * 2)) / (Math.PI * 2)) * 0.42;
    }
    item.mesh.position.set(item.zone.x + Math.cos(t) * radius, height, item.zone.z + Math.sin(t) * radius);
  });
  ambientClouds.forEach((cloud) => {
    cloud.position.x -= cloud.userData.speed * dt;
    cloud.position.z += Math.sin(worldTime * 0.35 + cloud.userData.phase) * dt * 0.08;
    if (cloud.position.x < -13) cloud.position.x = 13;
  });
  aircraftRoot.position.x += (targetX - aircraftRoot.position.x) * Math.min(1, dt * 10);
  aircraftRoot.position.z += (targetZ - aircraftRoot.position.z) * Math.min(1, dt * 10);
  aircraftRoot.rotation.z += (targetBank + targetWobble - aircraftRoot.rotation.z) * Math.min(1, dt * 7);
  aircraftRoot.rotation.x += (targetPitch - aircraftRoot.rotation.x) * Math.min(1, dt * 5);

  const gameActive = document.getElementById('gameScreen')?.classList.contains('active');
  view.style.opacity = (gameActive && loaded) ? '1' : '0';
  if (currentLevel === 2 && lightningFlash > 0) {
    renderer.setClearColor(0x9db8d7, 1);
  } else {
    renderer.setClearColor(0x76c8ee, 1);
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(render);
