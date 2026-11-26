// AERIS Ridge Runner — bootstrap, render loop, chase/cockpit cameras,
// ring gates, screens and the shot-scene hook for screenshots.
import * as THREE from 'three';
import { WORLD, COLORS, CAMERA, RING_RADIUS, knots, clamp, damp } from './config.js';
import { createWorld, heightAt } from './terrain.js';
import { buildAircraft } from './aircraft.js';
import { Flight } from './flight.js';
import { MISSIONS, missionById, ringNormal } from './missions.js';
import { buildHud, updateHud, flashMessage } from './hud.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { prepareShot } from './shots.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') ?? 1);

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(COLORS.fog, 500, 3400);

// Sky dome: gradient shader, horizon pale to zenith blue.
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide,
  depthWrite: false,
  uniforms: {
    top: { value: new THREE.Color(0x3f8fd2) },
    mid: { value: new THREE.Color(COLORS.sky) },
    bot: { value: new THREE.Color(COLORS.horizon) },
  },
  vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 mid; uniform vec3 bot;
    void main(){ float h = normalize(vP).y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.65, h)) : mix(bot, mid, smoothstep(-0.08, 0.12, h)); gl_FragColor = vec4(c, 1.0); }`,
});
const sky = new THREE.Mesh(new THREE.SphereGeometry(6000, 24, 16), skyMat);
scene.add(sky);

// Lights: warm sun + sky hemisphere.
const sun = new THREE.DirectionalLight(COLORS.sun, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -160;
sun.shadow.camera.right = 160;
sun.shadow.camera.top = 160;
sun.shadow.camera.bottom = -160;
sun.shadow.camera.near = 10;
sun.shadow.camera.far = 1600;
sun.shadow.bias = -0.0004;
scene.add(sun);
scene.add(sun.target);
scene.add(new THREE.HemisphereLight(0xbfd9ee, 0x5d6b4a, 0.9));

// Sun disc in the sky.
const sunDisc = new THREE.Mesh(
  new THREE.CircleGeometry(120, 24),
  new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false }),
);
sunDisc.position.set(2600, 1500, -4200);
sunDisc.lookAt(0, 0, 0);
scene.add(sunDisc);

const world = createWorld(scene, SEED);
const aircraft = buildAircraft();
scene.add(aircraft.group);

let mission = MISSIONS[0];
let flight = new Flight(world, mission);

// Ring gates.
const ringGroup = new THREE.Group();
scene.add(ringGroup);
let ringMeshes = [];
function buildRings() {
  for (const m of ringMeshes) {
    ringGroup.remove(m.group);
    m.group.geometry?.dispose?.();
  }
  ringMeshes = mission.rings.map((r, i) => {
    const group = new THREE.Group();
    const n = ringNormal(mission, i);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xcc5510, emissive: COLORS.ringIdle, emissiveIntensity: 1.4, roughness: 0.4,
    });
    const torus = new THREE.Mesh(new THREE.TorusGeometry(RING_RADIUS, 1.15, 12, 40), mat);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(RING_RADIUS - 0.5, 32),
      new THREE.MeshBasicMaterial({ color: 0xffb020, transparent: true, opacity: 0.07, side: THREE.DoubleSide }),
    );
    group.add(torus);
    group.add(disc);
    group.position.set(r.x, r.y, r.z);
    group.lookAt(r.x + n.x, r.y + n.y, r.z + n.z);
    ringGroup.add(group);
    return { group, mat, disc };
  });
}
buildRings();

const hud = buildHud();
const audio = new AudioEngine();
const input = new Input();
input.attachMouse(canvas);

let screen = 'menu'; // menu | play | paused | over
let view = 'chase';
let frozen = false;
let simTime = 0;
let bestScores = {};
try {
  bestScores = JSON.parse(localStorage.getItem('aeris-best') ?? '{}');
} catch {
  bestScores = {};
}

const camera = new THREE.PerspectiveCamera(CAMERA.fovBase, 1, 0.5, 9000);
const camPos = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpUp = new THREE.Vector3();

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- Screens (DOM overlays) ---
const menuEl = document.getElementById('menu');
const overEl = document.getElementById('over');
const pauseEl = document.getElementById('pause');
const hudEl = document.getElementById('hud');

function showScreen(name) {
  screen = name;
  menuEl.classList.toggle('hidden', name !== 'menu');
  overEl.classList.toggle('hidden', name !== 'over');
  pauseEl.classList.toggle('hidden', name !== 'paused');
  hudEl.classList.toggle('hidden', name !== 'play' && name !== 'paused');
  document.getElementById('status').textContent =
    name === 'menu' ? 'AERIS Ridge Runner menu' : name === 'play' ? 'Flying' : name === 'paused' ? 'Paused' : 'Flight over';
}

function startMission(id) {
  mission = missionById(id);
  flight = new Flight(world, mission);
  buildRings();
  input.flaps = false;
  input.gearDown = true;
  flight.flaps = false;
  flight.gearDown = true;
  audio.ensure();
  showScreen('play');
  flashMessage(hud, `${mission.name} — fly the rings, then land on runway 09`, 3600);
}

function endFlight() {
  const f = flight;
  const l = f.landing;
  const title = document.getElementById('over-title');
  const body = document.getElementById('over-body');
  if (f.status === 'complete') {
    title.textContent = 'Course complete!';
    audio.fanfare();
    bestScores[mission.id] = Math.max(bestScores[mission.id] ?? 0, f.score);
    try { localStorage.setItem('aeris-best', JSON.stringify(bestScores)); } catch { /* private mode */ }
    body.innerHTML = `Score <b>${f.score}</b> — rings ${f.ringsPassed}/${mission.rings.length} · time ${fmtTime(f.time)}<br>` +
      `Landing ${l.score} (softness ${Math.round(l.softness * 100)}%, centreline ${Math.round(l.center * 100)}%) · time bonus ${l.timeBonus} · fuel bonus ${l.fuelBonus}<br>` +
      `Best on ${mission.name}: <b>${bestScores[mission.id]}</b>`;
  } else if (f.status === 'landed') {
    title.textContent = 'Landed — course unfinished';
    body.innerHTML = `Score <b>${f.score}</b> — you landed with ${mission.rings.length - f.ringsPassed} ring(s) still to fly.<br>Take off again and finish the course for the full landing bonus.`;
  } else {
    title.textContent = 'Crashed';
    const last = f.events[f.events.length - 1];
    const why = last?.kind === 'ditched' ? 'You ditched in the river.' : last?.kind === 'airframe' ? 'The airframe gave out after a rough field landing.' : 'You hit the terrain.';
    body.innerHTML = `${why}<br>Score <b>${f.score}</b> — rings ${f.ringsPassed}/${mission.rings.length} · time ${fmtTime(f.time)}`;
  }
  showScreen('over');
}

function fmtTime(t) {
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
}

// Menu wiring.
const missionList = document.getElementById('mission-list');
MISSIONS.forEach((m) => {
  const card = document.createElement('button');
  card.className = 'mission-card';
  card.innerHTML = `<span class="m-name">${m.name}</span><span class="m-diff">${m.difficulty}</span>` +
    `<span class="m-tag">${m.tagline}</span>` +
    `<span class="m-meta">${m.rings.length} rings · par ${fmtTime(m.parTime)} · wind ${m.wind.speed} m/s${m.wind.gust ? ' + gusts' : ''}</span>` +
    `<span class="m-best">Best: ${bestScores[m.id] ?? 0}</span>`;
  card.addEventListener('click', () => startMission(m.id));
  missionList.appendChild(card);
});
document.getElementById('btn-fly').addEventListener('click', () => startMission(MISSIONS[0].id));
document.getElementById('btn-again').addEventListener('click', () => startMission(mission.id));
document.getElementById('btn-menu').addEventListener('click', () => {
  flight = new Flight(world, mission);
  buildRings();
  showScreen('menu');
});
document.getElementById('btn-resume').addEventListener('click', () => showScreen('play'));
document.getElementById('btn-restart').addEventListener('click', () => startMission(mission.id));
document.getElementById('btn-quit').addEventListener('click', () => {
  flight = new Flight(world, mission);
  buildRings();
  showScreen('menu');
});

input.onAnyKey = () => audio.ensure();
input.onToggle = (name) => {
  if (name === 'flaps') {
    flight.flaps = input.flaps;
    flashMessage(hud, input.flaps ? 'Flaps down — slower, steadier' : 'Flaps up');
  }
  if (name === 'gear') {
    flight.gearDown = input.gearDown;
    flashMessage(hud, input.gearDown ? 'Gear down' : 'Gear up');
  }
  if (name === 'view') {
    view = view === 'chase' ? 'cockpit' : 'chase';
    flashMessage(hud, view === 'chase' ? 'Chase view' : 'Cockpit view');
  }
  if (name === 'mute') {
    audio.setMuted(!audio.muted);
    flashMessage(hud, audio.muted ? 'Sound off' : 'Sound on');
  }
  if (name === 'pause' && (screen === 'play' || screen === 'paused')) {
    showScreen(screen === 'play' ? 'paused' : 'play');
  }
  if (name === 'restart' && screen !== 'menu') startMission(mission.id);
};
input.onMenuKey = (key) => {
  if (screen !== 'menu') return;
  if (key === 'Enter') startMission(MISSIONS[0].id);
  if (key === '1') startMission(MISSIONS[0].id);
  if (key === '2') startMission(MISSIONS[1].id);
  if (key === '3') startMission(MISSIONS[2].id);
};

// --- Cameras ---
function updateCamera(dt, t) {
  const f = flight;
  const fx = Math.sin(f.heading) * Math.cos(f.pitch);
  const fy = Math.sin(f.pitch);
  const fz = -Math.cos(f.heading) * Math.cos(f.pitch);
  if (screen === 'menu') {
    const a = t * 0.12;
    const px = f.pos.x + Math.sin(a) * 26;
    const pz = f.pos.z + Math.cos(a) * 26;
    tmpV.set(px, f.pos.y + 9, pz);
    camPos.x = damp(camPos.x, tmpV.x, 2, dt);
    camPos.y = damp(camPos.y, tmpV.y, 2, dt);
    camPos.z = damp(camPos.z, tmpV.z, 2, dt);
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    camera.lookAt(f.pos.x, f.pos.y + 1, f.pos.z);
    return;
  }
  if (view === 'cockpit') {
    tmpV.set(0, 0.95, 1.6).applyEuler(aircraft.group.rotation);
    camera.position.set(f.pos.x + tmpV.x, f.pos.y + tmpV.y, f.pos.z + tmpV.z);
    tmpV2.set(f.pos.x + fx * 60, f.pos.y + fy * 60, f.pos.z + fz * 60);
    camera.up.set(0, 1, 0);
    camera.lookAt(tmpV2);
    return;
  }
  // Chase: behind and above, eased; mouse drag orbits a little.
  const orbit = input.mouseOrbit * 0.5;
  const co = Math.cos(orbit);
  const so = Math.sin(orbit);
  const bx = fx * co - fz * so;
  const bz = fx * so + fz * co;
  tmpV.set(f.pos.x - bx * CAMERA.chaseDistance, f.pos.y - fy * CAMERA.chaseDistance + CAMERA.chaseHeight, f.pos.z - bz * CAMERA.chaseDistance);
  // Keep the camera out of the ground.
  const minY = heightAt(tmpV.x, tmpV.z) + 3;
  if (tmpV.y < minY) tmpV.y = minY;
  const lam = screen === 'play' ? CAMERA.chaseLerp : 2;
  camPos.x = damp(camPos.x, tmpV.x, lam, dt);
  camPos.y = damp(camPos.y, tmpV.y, lam, dt);
  camPos.z = damp(camPos.z, tmpV.z, lam, dt);
  camera.position.copy(camPos);
  camTarget.set(f.pos.x + fx * CAMERA.lookAhead, f.pos.y + fy * CAMERA.lookAhead + 1, f.pos.z + fz * CAMERA.lookAhead);
  // Roll the camera with the plane, a little.
  tmpV2.copy(camTarget).sub(camera.position).normalize();
  tmpUp.set(0, 1, 0).applyAxisAngle(tmpV2, f.roll * CAMERA.rollFollow);
  camera.up.copy(tmpUp);
  camera.lookAt(camTarget);
  const wantFov = CAMERA.fovBase + (f.speed / 96) * CAMERA.fovSpeed;
  if (Math.abs(camera.fov - wantFov) > 0.4) {
    camera.fov = damp(camera.fov, wantFov, 3, dt);
    camera.updateProjectionMatrix();
  }
}

function updatePlaneVisual(dt) {
  const f = flight;
  aircraft.group.position.set(f.pos.x, f.pos.y, f.pos.z);
  aircraft.group.rotation.order = 'YXZ';
  aircraft.group.rotation.set(-f.pitch, Math.PI - f.heading, -f.roll);
  const spin = (4 + f.throttle * 46 + f.speed * 0.12) * dt;
  aircraft.prop.rotation.z += spin;
  // Beacon blink + prop disc fade with throttle.
  const blink = (simTime % 1.2) < 0.15;
  aircraft.beacon.material.emissiveIntensity = blink ? 4 : 0.2;
  aircraft.tailLight.material.emissiveIntensity = blink ? 3 : 0.6;
}

function updateRings(t) {
  ringMeshes.forEach((m, i) => {
    if (i < flight.ringsPassed) {
      m.mat.emissive.setHex(COLORS.ringDone);
      m.mat.emissiveIntensity = 0.9;
      m.disc.material.opacity = 0.03;
    } else if (i === flight.ringsPassed) {
      m.mat.emissive.setHex(COLORS.ringNext);
      m.mat.emissiveIntensity = 1.6 + Math.sin(t * 5) * 0.7;
      m.disc.material.opacity = 0.1 + Math.sin(t * 5) * 0.04;
      const s = 1 + Math.sin(t * 5) * 0.03;
      m.group.scale.setScalar(s);
    } else {
      m.mat.emissive.setHex(COLORS.ringIdle);
      m.mat.emissiveIntensity = 1.1;
      m.disc.material.opacity = 0.05;
      m.group.scale.setScalar(1);
    }
  });
}

// --- Main loop ---
let last = performance.now();
let lastStallBeep = 0;
const STEP = 1 / 60;
let acc = 0;

function drainEvents() {
  for (const ev of flight.events) {
    if (ev.type === 'ring') {
      audio.ringChime();
      flashMessage(hud, `Ring ${ev.index} of ${ev.total} — +500 · fuel +3%`);
    } else if (ev.type === 'takeoff') {
      flashMessage(hud, 'Airborne — fly the rings!');
    } else if (ev.type === 'lowfuel') {
      flashMessage(hud, 'LOW FUEL — land or finish fast', 3600);
    } else if (ev.type === 'engineout') {
      flashMessage(hud, 'ENGINE OUT — glide to runway 09!', 4200);
    } else if (ev.type === 'rough') {
      audio.thud();
      flashMessage(hud, `Rough field landing — airframe ${Math.round(ev.damage)}% damaged`, 3200);
    } else if (ev.type === 'landed' || ev.type === 'complete') {
      audio.thud();
      if (ev.type === 'complete') audio.fanfare();
      setTimeout(endFlight, 900);
    } else if (ev.type === 'crash') {
      audio.thud();
      setTimeout(endFlight, 900);
    }
  }
  flight.events.length = 0;
}

function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  simTime += dt;
  if (screen === 'play' && !frozen) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 5) {
      const inputState = input.poll();
      flight.flaps = input.flaps;
      flight.gearDown = input.gearDown;
      flight.step(STEP, inputState, simTime);
      acc -= STEP;
      n += 1;
    }
    if (n === 5) acc = 0;
    drainEvents();
    if (flight.stalled && simTime - lastStallBeep > 0.6) {
      audio.stallBeep();
      lastStallBeep = simTime;
    }
    audio.update(flight, dt);
  }
  if (screen === 'play') {
    // HUD stays live even in a frozen shot pose: the instruments must show
    // the real state the screenshot was taken in.
    updateHud(hud, flight, mission, world, view);
    // Next-ring bearing arrow.
    const nav = document.getElementById('hud-nav');
    const next = flight.nextRing;
    if (next && (flight.status === 'flying' || flight.status === 'parked')) {
      const dx = next.x - flight.pos.x;
      const dz = next.z - flight.pos.z;
      const bearing = Math.atan2(dx, -dz);
      const rel = ((bearing - flight.heading) * 180) / Math.PI;
      const dist = Math.round(Math.hypot(dx, flight.pos.y - next.y, dz));
      nav.textContent = `◈ NEXT RING ${dist}m ${rel > 25 ? '↷' : rel < -25 ? '↶' : '↑'}`;
      nav.classList.remove('hidden');
    } else {
      nav.classList.add('hidden');
    }
  }
  // Sun + shadows follow the plane.
  sun.position.set(flight.pos.x + 320, flight.pos.y + 480, flight.pos.z + 220);
  sun.target.position.set(flight.pos.x, flight.pos.y, flight.pos.z);
  world.update(dt, simTime, mission.wind.heading);
  updatePlaneVisual(dt);
  updateRings(simTime);
  updateCamera(dt, simTime);
  renderer.render(scene, camera);
}

// --- Shot scenes (deterministic screenshots) ---
if (SHOT) {
  const result = prepareShot({ flight, world, mission }, SHOT);
  if (result) {
    if (result.mission) {
      mission = result.mission;
      buildRings();
    }
    if (result.flight) flight = result.flight;
    frozen = result.frozen ?? true;
    if (result.screen) showScreen(result.screen);
    // Sync the chase camera to the frozen pose before the first frame.
    const f = flight;
    const fx = Math.sin(f.heading);
    const fz = -Math.cos(f.heading);
    camPos.set(f.pos.x - fx * CAMERA.chaseDistance, f.pos.y + CAMERA.chaseHeight, f.pos.z - fz * CAMERA.chaseDistance);
  }
}

if (!SHOT) showScreen('menu');
camPos.set(flight.pos.x, flight.pos.y + 12, flight.pos.z + 30);
requestAnimationFrame(frame);
// First render has happened once this flag is set by the loop; the shot
// helper polls for it before capturing.
window.__AERIS__ = {
  world,
  start: (id) => startMission(id),
  get flight() { return flight; },
  get mission() { return mission; },
  get screen() { return screen; },
};
window.__AERIS_READY__ = true;
