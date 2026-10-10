/*
  scene.js

  The 3D scene at the top of the home page: a neon grid floor, wireframe
  mountains and the Arcadia sign, with Space Cats' fleet in an arc, built in
  blocks from the game's own pixel art, and a cat flying in to shoot at it.
  It needs games/space-cats/js/spacecats.js loaded first, for the sprites
  and the cats. Without WebGL, the page shows the name on its own instead.
*/

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const canvas = document.getElementById('scene');
const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  document.documentElement.classList.add('no-webgl');
  throw e;
}
//  Tells the page the scene started, so it doesn't fall back to the plain name.
window.arcadiaScene = true;
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const NEON = { pink: '#ff3dbb', cyan: '#31d6ff', green: '#5dff3a', orange: '#ffb21a', rose: '#ff5f8f', violet: '#9b6bff' };
const CURVE = 0.0009;
const curveY = (x, z) => -(x * x + (z - 10) * (z - 10)) * CURVE;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog('#160832', 50, 175);

//  The sky: deep blue at the top to violet at the horizon.
const sky = document.createElement('canvas');
sky.width = 4; sky.height = 512;
const skyCtx = sky.getContext('2d');
const skyGradient = skyCtx.createLinearGradient(0, 0, 0, 512);
skyGradient.addColorStop(0, '#02031a');
skyGradient.addColorStop(0.55, '#140a3a');
skyGradient.addColorStop(0.8, '#33105f');
skyGradient.addColorStop(1, '#1b0a3c');
skyCtx.fillStyle = skyGradient;
skyCtx.fillRect(0, 0, 4, 512);
const skyTexture = new THREE.CanvasTexture(sky);
skyTexture.colorSpace = THREE.SRGBColorSpace;
scene.background = skyTexture;

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
const lookAt = new THREE.Vector3(0, 8, -10);

scene.add(new THREE.HemisphereLight('#9a8cff', '#2a0838', 1.4));
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(6, 12, 14);
scene.add(sun);

//  Stars.
{
  const count = 1400;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 420;
    positions[i * 3 + 1] = 6 + Math.random() * 150;
    positions[i * 3 + 2] = -60 - Math.random() * 120;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const dot = document.createElement('canvas');
  dot.width = dot.height = 32;
  const dotCtx = dot.getContext('2d');
  const dotGradient = dotCtx.createRadialGradient(16, 16, 0, 16, 16, 16);
  dotGradient.addColorStop(0, 'rgba(255,255,255,1)');
  dotGradient.addColorStop(0.35, 'rgba(255,255,255,0.6)');
  dotGradient.addColorStop(1, 'rgba(255,255,255,0)');
  dotCtx.fillStyle = dotGradient;
  dotCtx.fillRect(0, 0, 32, 32);
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: '#cfe6ff', size: 0.9, map: new THREE.CanvasTexture(dot), transparent: true, opacity: 0.9, depthWrite: false, fog: false })));
}

//  The floor: a curved neon grid that scrolls towards you.
const floorMaterial = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 },
    uLine: { value: new THREE.Color('#d23cff') },
    uBase: { value: new THREE.Color('#0c0424') },
    uFar: { value: new THREE.Color('#1b0a3c') }
  },
  vertexShader: `
    varying vec3 vPos;
    void main() {
      vec4 world = modelMatrix * vec4(position, 1.0);
      world.y -= (world.x * world.x + (world.z - 10.0) * (world.z - 10.0)) * ${CURVE.toFixed(5)};
      vPos = world.xyz;
      gl_Position = projectionMatrix * viewMatrix * world;
    }`,
  fragmentShader: `
    uniform float uTime;
    uniform vec3 uLine;
    uniform vec3 uBase;
    uniform vec3 uFar;
    varying vec3 vPos;
    void main() {
      vec2 c = vec2(vPos.x, vPos.z + uTime * 5.0) / 3.2;
      vec2 g = abs(fract(c - 0.5) - 0.5) / fwidth(c);
      float line = 1.0 - min(min(g.x, g.y), 1.0);
      float near = clamp(1.0 - (-vPos.z + 10.0) / 150.0, 0.0, 1.0);
      vec3 colour = mix(uBase, uLine * 1.15, line * near * 0.9);
      gl_FragColor = vec4(mix(uFar, colour, smoothstep(0.0, 0.45, near)), 1.0);
    }`
});
{
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(420, 260, 160, 100), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -100;
  scene.add(floor);
}

//  Wireframe mountains along the horizon, taller at the sides.
{
  const geometry = new THREE.PlaneGeometry(300, 50, 84, 14);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i) - 78;
    const rise = Math.min(1, Math.max(0, (-55 - z) / 14));
    const sides = 0.45 + 0.55 * Math.min(1, Math.abs(x) / 70);
    const ridge = Math.abs(Math.sin(x * 0.055 + z * 0.02)) * 10 + Math.abs(Math.sin(x * 0.14 + 1.7)) * 4 + Math.random() * 1.6;
    position.setXYZ(i, x + (Math.random() - 0.5) * 1.2, curveY(x, z) + ridge * sides * rise, z);
  }
  geometry.computeVertexNormals();
  scene.add(new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: '#0b0628' })));
  const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geometry), new THREE.LineBasicMaterial({ color: '#2fd4ff', transparent: true, opacity: 0.6 }));
  wire.position.y = 0.02;
  scene.add(wire);
}

//  Light beams fanning out from behind the sign.
const beams = new THREE.Group();
{
  const fade = document.createElement('canvas');
  fade.width = 4; fade.height = 256;
  const fadeCtx = fade.getContext('2d');
  const fadeGradient = fadeCtx.createLinearGradient(0, 256, 0, 0);
  fadeGradient.addColorStop(0, 'rgba(255,255,255,0.9)');
  fadeGradient.addColorStop(1, 'rgba(255,255,255,0)');
  fadeCtx.fillStyle = fadeGradient;
  fadeCtx.fillRect(0, 0, 4, 256);
  const fadeTexture = new THREE.CanvasTexture(fade);
  const beamGeometry = new THREE.PlaneGeometry(2.2, 110);
  beamGeometry.translate(0, 55, 0);
  for (let i = 0; i < 9; i++) {
    const beam = new THREE.Mesh(beamGeometry, new THREE.MeshBasicMaterial({ color: i % 2 ? '#7fd7ff' : '#ff7fe0', map: fadeTexture, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    beam.rotation.z = (i - 4) * 0.33;
    beams.add(beam);
  }
  beams.position.set(0, 25, -60);
  scene.add(beams);
}

//  The name, as a neon sign in the sky.
const signMaterial = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending });
const sign = new THREE.Mesh(new THREE.PlaneGeometry(44, 12.4), signMaterial);
sign.position.set(0, 26.5, -48);
scene.add(sign);
function drawSign() {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 578;
  const g = c.getContext('2d');
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '400 330px "Tilt Neon", sans-serif';
  g.lineJoin = 'round';
  g.shadowColor = '#ff3dbb';
  g.shadowBlur = 50;
  g.strokeStyle = '#ff3dbb';
  g.lineWidth = 26;
  g.strokeText('ARCADIA', 1024, 300);
  g.shadowBlur = 0;
  g.fillStyle = '#ffe6f7';
  g.fillText('ARCADIA', 1024, 300);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  signMaterial.map = texture;
  signMaterial.needsUpdate = true;
}

//  Voxel models, built from the game's own pixel grids: one cube per
//  pixel, two cubes deep.
function voxels(grid, colour, size, glow, gap = 0.92) {
  const cells = [];
  grid.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') cells.push([x, y]); }));
  const width = Math.max(...grid.map(r => r.length));
  const height = grid.length;
  const geometry = new THREE.BoxGeometry(size * gap, size * gap, size * 2);
  const material = new THREE.MeshStandardMaterial({ color: colour, emissive: colour, emissiveIntensity: glow, roughness: 0.35, metalness: 0.05 });
  const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
  const matrix = new THREE.Matrix4();
  cells.forEach(([x, y], i) => {
    matrix.makeTranslation((x - (width - 1) / 2) * size, ((height - 1) / 2 - y) * size, 0);
    mesh.setMatrixAt(i, matrix);
  });
  return mesh;
}

function creature(type, colour, size, glow) {
  const poses = type === 'fish' ? [FISH_PIXELS, FISH_PIXELS] : INVADER_TYPES[type].poses;
  const group = new THREE.Group();
  group.userData.poses = poses.map(pose => {
    const mesh = voxels(pose, colour, size, glow);
    group.add(mesh);
    return mesh;
  });
  group.userData.poses[1].visible = false;
  return group;
}

//  The fleet, in an arc across the sky.
const arc = [
  { type: 'bat', colour: NEON.cyan, at: [-13.5, 3.6, -6], size: 0.3 },
  { type: 'rat', colour: NEON.green, at: [-10.5, 8.2, -10], size: 0.26 },
  { type: 'mouse', colour: NEON.pink, at: [-6.4, 10.2, -13], size: 0.22 },
  { type: 'fish', colour: NEON.rose, at: [-2.2, 11.4, -15], size: 0.2 },
  { type: 'mouse', colour: NEON.orange, at: [2.2, 11.4, -15], size: 0.2 },
  { type: 'mouse', colour: NEON.pink, at: [6.4, 10.2, -13], size: 0.22 },
  { type: 'rat', colour: NEON.green, at: [10.5, 8.2, -10], size: 0.26 },
  { type: 'bat', colour: NEON.cyan, at: [13.5, 3.6, -6], size: 0.3 },
  { type: 'rat', colour: NEON.violet, at: [-6.5, 5.6, -8], size: 0.22 },
  { type: 'bat', colour: NEON.orange, at: [6.5, 5.6, -8], size: 0.22 }
].map((spot, i) => {
  const group = creature(spot.type, spot.colour, spot.size * 1.15, 0.28);
  group.position.set(...spot.at);
  group.userData.home = new THREE.Vector3(...spot.at);
  group.userData.colour = new THREE.Color(spot.colour);
  group.userData.phase = i * 0.7;
  group.userData.respawn = 0;
  scene.add(group);
  return group;
});

//  Little ones darting round near the floor.
const darters = Array.from({ length: 6 }, (_, i) => {
  const group = creature(i % 2 ? 'bat' : 'fish', i % 3 === 0 ? NEON.green : NEON.orange, 0.1, 0.35);
  group.userData.radius = 7 + (i % 3) * 2.2;
  group.userData.speed = (i % 2 ? 0.35 : -0.28) * (1 + i * 0.07);
  group.userData.angle = i * 1.1;
  group.userData.height = 0.8 + (i % 3) * 0.6;
  scene.add(group);
  return group;
});

//  Your cat, flying in from the front, seen from behind.
const catModels = CATS.map(cat => voxels(CAT_FACES[cat.face], cat.colour, 0.21, 0.3, 0.98));
const ship = new THREE.Group();
catModels.forEach((model, i) => { model.visible = i === 0; ship.add(model); });
ship.position.set(0, 1.9, 4.5);
ship.rotation.set(-0.28, Math.PI, 0);
scene.add(ship);
let catIndex = 0;
let spin = 0;

//  The engine glow under the cat: sparks that cool from yellow to red.
const sparkCount = 140;
const sparks = { position: new Float32Array(sparkCount * 3), colour: new Float32Array(sparkCount * 3), velocity: [], life: [] };
const sparkGeometry = new THREE.BufferGeometry();
sparkGeometry.setAttribute('position', new THREE.BufferAttribute(sparks.position, 3));
sparkGeometry.setAttribute('color', new THREE.BufferAttribute(sparks.colour, 3));
const sparkDot = document.createElement('canvas');
sparkDot.width = sparkDot.height = 64;
{
  const g = sparkDot.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
}
scene.add(new THREE.Points(sparkGeometry, new THREE.PointsMaterial({ size: 0.32, map: new THREE.CanvasTexture(sparkDot), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
for (let i = 0; i < sparkCount; i++) { sparks.velocity.push(new THREE.Vector3()); sparks.life.push(Math.random()); }
const hot = new THREE.Color('#fff3a0'), warm = new THREE.Color('#ff8a1a'), cool = new THREE.Color('#ff1f4d');
function updateSparks(dt) {
  for (let i = 0; i < sparkCount; i++) {
    sparks.life[i] -= dt * 2.4;
    if (sparks.life[i] <= 0) {
      sparks.life[i] = 1;
      sparks.position[i * 3] = ship.position.x + (Math.random() - 0.5) * 0.9;
      sparks.position[i * 3 + 1] = ship.position.y - 0.8;
      sparks.position[i * 3 + 2] = ship.position.z + 0.6;
      sparks.velocity[i].set((Math.random() - 0.5) * 1.6, -1.5 - Math.random() * 2.2, 2 + Math.random() * 3);
    }
    const v = sparks.velocity[i];
    sparks.position[i * 3] += v.x * dt;
    sparks.position[i * 3 + 1] = Math.max(curveY(sparks.position[i * 3], sparks.position[i * 3 + 2]) + 0.1, sparks.position[i * 3 + 1] + v.y * dt);
    sparks.position[i * 3 + 2] += v.z * dt;
    const life = sparks.life[i];
    const c = life > 0.6 ? hot.clone().lerp(warm, (1 - life) / 0.4) : warm.clone().lerp(cool, (0.6 - life) / 0.6);
    c.multiplyScalar(life * 0.8);
    sparks.colour[i * 3] = c.r; sparks.colour[i * 3 + 1] = c.g; sparks.colour[i * 3 + 2] = c.b;
  }
  sparkGeometry.attributes.position.needsUpdate = true;
  sparkGeometry.attributes.color.needsUpdate = true;
}

//  Shots, and the bursts of cubes when one lands.
const shotMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.4), new THREE.MeshBasicMaterial({ color: '#c6ff9e' }));
shotMesh.visible = false;
scene.add(shotMesh);
let shot = null;
let fireTimer = 1.4;

const bitCount = 400;
const bits = new THREE.InstancedMesh(new THREE.BoxGeometry(0.13, 0.13, 0.13), new THREE.MeshBasicMaterial({ color: '#ffffff' }), bitCount);
bits.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
const bitState = Array.from({ length: bitCount }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), spin: new THREE.Vector3() }));
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
for (let i = 0; i < bitCount; i++) { bits.setMatrixAt(i, hidden); bits.setColorAt(i, new THREE.Color('#ffffff')); }
scene.add(bits);
let nextBit = 0;
function burst(at, colour) {
  for (let n = 0; n < 60; n++) {
    const b = bitState[nextBit];
    b.life = 1;
    b.p.copy(at);
    b.v.set((Math.random() - 0.5) * 9, (Math.random() - 0.3) * 8, (Math.random() - 0.5) * 6);
    b.spin.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    bits.setColorAt(nextBit, n % 3 ? new THREE.Color('#ffffff') : colour);
    nextBit = (nextBit + 1) % bitCount;
  }
  bits.instanceColor.needsUpdate = true;
}
const bitMatrix = new THREE.Matrix4(), bitQuat = new THREE.Quaternion(), bitEuler = new THREE.Euler(), bitScale = new THREE.Vector3();
function updateBits(dt, time) {
  for (let i = 0; i < bitCount; i++) {
    const b = bitState[i];
    if (b.life <= 0) { bits.setMatrixAt(i, hidden); continue; }
    b.life -= dt * 0.9;
    b.v.y -= 6 * dt;
    b.p.addScaledVector(b.v, dt);
    bitEuler.set(b.spin.x * time, b.spin.y * time, b.spin.z * time);
    bitQuat.setFromEuler(bitEuler);
    const s = Math.max(0, b.life);
    bitScale.set(s, s, s);
    bitMatrix.compose(b.p, bitQuat, bitScale);
    bits.setMatrixAt(i, bitMatrix);
  }
  bits.instanceMatrix.needsUpdate = true;
}

//  Glow.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.75, 0.4, 0.62);
composer.addPass(bloom);
composer.addPass(new OutputPass());

//  Fit the camera to the shape of the screen: further back when narrow.
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  camera.aspect = w / h;
  const narrow = camera.aspect < 1;
  camera.fov = narrow ? 70 : 55;
  camera.userData.base = narrow ? new THREE.Vector3(0, 5, 30) : new THREE.Vector3(0, 4, 18);
  camera.position.copy(camera.userData.base);
  camera.lookAt(lookAt);
  camera.updateProjectionMatrix();
}

const pointer = { x: 0, y: 0 };
window.addEventListener('pointermove', e => {
  pointer.x = e.clientX / window.innerWidth - 0.5;
  pointer.y = e.clientY / window.innerHeight - 0.5;
});

let poseTimer = 0, pose = 0, kills = 0;
function update(dt, time) {
  floorMaterial.uniforms.uTime.value = time;
  beams.rotation.z = Math.sin(time * 0.15) * 0.08;
  signMaterial.opacity = Math.random() < 0.012 ? 0.55 : 1;

  //  The fleet bobs and marches in two poses.
  poseTimer += dt;
  if (poseTimer > 0.5) { poseTimer = 0; pose = 1 - pose; }
  arc.forEach(group => {
    const d = group.userData;
    if (d.respawn > 0) {
      d.respawn -= dt;
      group.visible = d.respawn <= 0;
      group.scale.setScalar(0.01);
      return;
    }
    group.scale.setScalar(Math.min(1, group.scale.x + dt * 3));
    group.position.y = d.home.y + Math.sin(time * 1.3 + d.phase) * 0.35;
    group.rotation.y = Math.sin(time * 0.7 + d.phase) * 0.35;
    group.rotation.z = Math.sin(time * 0.9 + d.phase) * 0.08;
    d.poses[0].visible = pose === 0;
    d.poses[1].visible = pose === 1;
  });

  darters.forEach(group => {
    const d = group.userData;
    d.angle += d.speed * dt;
    group.position.set(Math.cos(d.angle) * d.radius, d.height + Math.sin(time * 2 + d.angle) * 0.25, 2 + Math.sin(d.angle) * d.radius * 0.55);
    group.rotation.y = -d.angle + (d.speed > 0 ? Math.PI : 0);
    d.poses[0].visible = pose === 0;
    d.poses[1].visible = pose === 1;
  });

  //  The cat drifts, and spins round when the next cat takes over.
  ship.position.x = Math.sin(time * 0.6) * 2.2;
  ship.position.y = 1.9 + Math.sin(time * 1.7) * 0.15;
  ship.rotation.z = -Math.cos(time * 0.6) * 0.18;
  if (spin > 0) {
    spin = Math.max(0, spin - dt * 1.8);
    ship.rotation.y = Math.PI + (1 - spin) * Math.PI * 2;
    if (spin < 0.5 && !catModels[catIndex].visible) {
      catModels.forEach((model, i) => { model.visible = i === catIndex; });
    }
  }
  updateSparks(dt);

  //  Now and then the cat fires at one of the fleet.
  fireTimer -= dt;
  if (!shot && fireTimer <= 0) {
    const targets = arc.filter(g => g.visible && g.userData.respawn <= 0);
    if (targets.length) {
      const target = targets[Math.floor(Math.random() * targets.length)];
      shot = { from: ship.position.clone().add(new THREE.Vector3(0, 1.2, -0.6)), target, t: 0 };
      shotMesh.visible = true;
    }
    fireTimer = 1.6 + Math.random() * 1.2;
  }
  if (shot) {
    shot.t += dt * 2.6;
    const to = shot.target.position;
    shotMesh.position.lerpVectors(shot.from, to, Math.min(1, shot.t));
    shotMesh.lookAt(to);
    if (shot.t >= 1) {
      burst(to.clone(), shot.target.userData.colour);
      shot.target.visible = false;
      shot.target.userData.respawn = 2.2;
      shotMesh.visible = false;
      shot = null;
      kills++;
      if (kills % 3 === 0) {
        catIndex = (catIndex + 1) % catModels.length;
        spin = 1;
      }
    }
  }
  updateBits(dt, time);

  //  The camera leans with the pointer.
  const base = camera.userData.base;
  camera.position.x += (base.x + pointer.x * 3 - camera.position.x) * 0.04;
  camera.position.y += (base.y - pointer.y * 1.2 - camera.position.y) * 0.04;
  camera.lookAt(lookAt);
}

resize();
window.addEventListener('resize', resize);

let visible = true;
new IntersectionObserver(entries => { visible = entries[0].isIntersecting; }).observe(canvas);

let last = 0;
function frame(ms) {
  const time = ms / 1000;
  const dt = last ? Math.min(time - last, 0.05) : 0;
  last = time;
  if (visible) {
    update(dt, time);
    composer.render();
  }
  requestAnimationFrame(frame);
}

document.fonts.load('400 330px "Tilt Neon"').catch(() => {}).then(() => {
  drawSign();
  if (still) {
    update(0, 0);
    composer.render();
  } else {
    requestAnimationFrame(frame);
  }
});
