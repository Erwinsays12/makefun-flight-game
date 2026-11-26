// AERIS Ridge Runner — the valley: heightfield terrain, river, lake, runway,
// trees, clouds, windsock and hangars. Everything is seeded and deterministic.
import * as THREE from 'three';
import { WORLD, COLORS, clamp, lerp } from './config.js';
import { makeNoise2D, fbm, mulberry32 } from './noise.js';

const noiseA = makeNoise2D(WORLD.seed);
const noiseB = makeNoise2D(WORLD.seed + 101);
const noiseC = makeNoise2D(WORLD.seed + 202);

/** The valley's centre line meanders along Z. */
export function meander(z) {
  return 180 * Math.sin(z * 0.00035) + 90 * Math.sin(z * 0.0011 + 1.7);
}

/** Runway centre x at a given z (runway follows the valley floor). */
export function runwayX(z) {
  return meander(550);
}

function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Ground height in metres at (x, z). Shared by renderer and flight model. */
export function heightAt(x, z) {
  const half = WORLD.size / 2;
  const cx = x - meander(z);
  const ax = Math.abs(cx);
  // Valley floor: gentle rolling ground near the river.
  const floor = 6 + 4 * fbm(noiseA, x * 0.004, z * 0.004, 3);
  // Rolling hills further out.
  const hills = 26 + 42 * fbm(noiseB, x * 0.0016, z * 0.0016, 4);
  // High ridge mountains at the valley walls.
  const ridge = 260 + 420 * fbm(noiseC, x * 0.0009, z * 0.0009, 4);
  const wall = smoothstep(650, 1500, ax);
  let h = lerp(lerp(floor, hills, smoothstep(220, 700, ax)), ridge, wall);
  // Rise toward the far north/south ends so the valley feels enclosed.
  const endRise = smoothstep(1500, 2050, Math.abs(z));
  h += endRise * (120 + 160 * fbm(noiseB, x * 0.001, z * 0.001, 3));
  // Flatten the runway strip to a table.
  const rx = runwayX(z);
  const inRunwayZ = smoothstep(WORLD.runwayZ0 - 90, WORLD.runwayZ0, z) * (1 - smoothstep(WORLD.runwayZ1, WORLD.runwayZ1 + 90, z));
  const inRunwayX = 1 - smoothstep(WORLD.runwayFlattenHalf - 20, WORLD.runwayFlattenHalf, Math.abs(x - rx));
  const flat = inRunwayZ * inRunwayX;
  h = lerp(h, WORLD.runwayY, flat);
  // Carve the river channel along the meander, away from the runway.
  const riverDepth = 5.5 * (1 - smoothstep(26, 90, ax));
  const nearRunway = smoothstep(120, 260, Math.abs(z - 550));
  h -= riverDepth * nearRunway;
  // Lake bowl in the far north.
  const lakeD = Math.hypot(x - meander(-1250), z + 1250);
  h = lerp(h, 1.5, (1 - smoothstep(180, 420, lakeD)) * 0.9);
  return Math.max(h, 0.5);
}

function colorFor(h, slope, x, z) {
  const c = new THREE.Color();
  const n = fbm(noiseA, x * 0.01, z * 0.01, 2);
  if (h < WORLD.waterLevel + 1.2) {
    c.setHex(COLORS.sand);
  } else if (h > 330) {
    c.setHex(COLORS.snow);
    c.lerp(new THREE.Color(COLORS.rock), clamp((h - 330) / 220, 0, 0.5));
  } else if (slope > 0.55 || h > 240) {
    c.setHex(COLORS.rock);
  } else if (n > 0.25) {
    c.setHex(COLORS.forest);
  } else if (n < -0.3) {
    c.setHex(COLORS.grassDry);
  } else {
    c.setHex(COLORS.grass);
  }
  // Gentle patch variation so the ground never looks flat-shaded.
  const v = 0.92 + 0.16 * fbm(noiseC, x * 0.02, z * 0.02, 2);
  c.multiplyScalar(v);
  return c;
}

function buildTerrainMesh() {
  const SEG = 220;
  const geo = new THREE.PlaneGeometry(WORLD.size, WORLD.size, SEG, SEG);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < pos.count; i += 1) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = heightAt(x, z);
    pos.setY(i, h);
    const hx = heightAt(x + 6, z) - heightAt(x - 6, z);
    const hz = heightAt(x, z + 6) - heightAt(x, z - 6);
    const slope = Math.hypot(hx, hz) / 12;
    color.copy(colorFor(h, slope, x, z));
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

function buildWater(scene) {
  // One wide lake plane in the north + a river ribbon down the valley.
  const waterMat = new THREE.MeshStandardMaterial({
    color: COLORS.water, transparent: true, opacity: 0.82, roughness: 0.25, metalness: 0.1,
  });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(430, 48), waterMat);
  lake.rotation.x = -Math.PI / 2;
  lake.position.set(meander(-1250), WORLD.waterLevel, -1250);
  scene.add(lake);
  const pts = [];
  for (let z = -2050; z <= 2050; z += 100) pts.push(new THREE.Vector3(meander(z), WORLD.waterLevel, z));
  const curve = new THREE.CatmullRomCurve3(pts);
  const ribbon = new THREE.Mesh(new THREE.TubeGeometry(curve, 80, 26, 6, false), waterMat);
  ribbon.scale.y = 0.08;
  ribbon.position.y = 0;
  scene.add(ribbon);
}

function buildRunway(scene) {
  const rx = runwayX(550);
  const group = new THREE.Group();
  const len = WORLD.runwayZ1 - WORLD.runwayZ0;
  const asphalt = new THREE.Mesh(
    new THREE.BoxGeometry(WORLD.runwayHalfWidth * 2, 0.6, len),
    new THREE.MeshStandardMaterial({ color: COLORS.asphalt, roughness: 0.9 }),
  );
  asphalt.position.set(rx, WORLD.runwayY - 0.1, (WORLD.runwayZ0 + WORLD.runwayZ1) / 2);
  asphalt.receiveShadow = true;
  group.add(asphalt);
  // Centreline dashes + threshold bars, slightly above the asphalt.
  const white = new THREE.MeshStandardMaterial({ color: 0xf5f5ee, roughness: 0.7 });
  for (let z = WORLD.runwayZ0 + 40; z < WORLD.runwayZ1 - 20; z += 40) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 14), white);
    dash.position.set(rx, WORLD.runwayY + 0.35, z);
    group.add(dash);
  }
  for (const dz of [WORLD.runwayZ0 + 12, WORLD.runwayZ1 - 12]) {
    for (const dx of [-12, -4, 4, 12]) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(4, 0.25, 18), white);
      bar.position.set(rx + dx, WORLD.runwayY + 0.35, dz);
      group.add(bar);
    }
  }
  // Runway edge lights: small amber posts.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xffc861, emissive: 0xff9d00, emissiveIntensity: 1.6 });
  for (let z = WORLD.runwayZ0; z <= WORLD.runwayZ1; z += 60) {
    for (const dx of [-WORLD.runwayHalfWidth - 2, WORLD.runwayHalfWidth + 2]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.9, 8, 8), lampMat);
      lamp.position.set(rx + dx, WORLD.runwayY + 1.2, z);
      group.add(lamp);
    }
  }
  scene.add(group);
  return group;
}

function buildTrees(scene) {
  const rand = mulberry32(WORLD.seed + 77);
  const spots = [];
  let guard = 0;
  while (spots.length < 1500 && guard < 20000) {
    guard += 1;
    const x = (rand() - 0.5) * WORLD.size * 0.94;
    const z = (rand() - 0.5) * WORLD.size * 0.94;
    const h = heightAt(x, z);
    if (h < 9 || h > 210) continue;
    if (Math.abs(x - runwayX(z)) < 90 && z > 120 && z < 1000) continue;
    if (Math.abs(x - meander(z)) < 60) continue; // keep the river clear
    const slope = Math.abs(heightAt(x + 8, z) - heightAt(x - 8, z)) / 16;
    if (slope > 0.5) continue;
    spots.push({ x, z, h, s: 0.7 + rand() * 0.9 });
  }
  const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 4, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 });
  const coneGeo = new THREE.ConeGeometry(3.4, 11, 7);
  const coneMat = new THREE.MeshStandardMaterial({ color: 0x3f7a35, roughness: 1 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const cones = new THREE.InstancedMesh(coneGeo, coneMat, spots.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  spots.forEach((s, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
    sc.setScalar(s.s);
    m.compose(new THREE.Vector3(s.x, s.h + 2 * s.s, s.z), q, sc);
    trunks.setMatrixAt(i, m);
    m.compose(new THREE.Vector3(s.x, s.h + (4 + 5.5) * s.s, s.z), q, sc);
    cones.setMatrixAt(i, m);
  });
  trunks.castShadow = true;
  cones.castShadow = true;
  scene.add(trunks);
  scene.add(cones);
}

function buildClouds(scene) {
  const rand = mulberry32(WORLD.seed + 55);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.92, emissive: 0x93a7b8, emissiveIntensity: 0.5 });
  const clouds = [];
  for (let i = 0; i < 34; i += 1) {
    const g = new THREE.Group();
    const puffs = 3 + Math.floor(rand() * 4);
    for (let p = 0; p < puffs; p += 1) {
      const r = 14 + rand() * 22;
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat);
      s.position.set((rand() - 0.5) * 70, (rand() - 0.5) * 8, (rand() - 0.5) * 30);
      s.scale.y = 0.45;
      g.add(s);
    }
    g.position.set((rand() - 0.5) * 3800, 380 + rand() * 260, (rand() - 0.5) * 3800);
    g.userData.drift = 1.5 + rand() * 2.5;
    scene.add(g);
    clouds.push(g);
  }
  return clouds;
}

function buildAirfield(scene) {
  const rx = runwayX(550);
  const group = new THREE.Group();
  // Two hangars + a small tower beside the runway.
  const hangarMat = new THREE.MeshStandardMaterial({ color: 0x9aa5ad, roughness: 0.6, metalness: 0.35 });
  const roofMat = new THREE.MeshStandardMaterial({ color: COLORS.paintTeal, roughness: 0.6 });
  for (const [dx, dz, w] of [[-58, 330, 34], [-58, 420, 26]]) {
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 12, 30), hangarMat);
    base.position.set(rx + dx, WORLD.runwayY + 6, dz);
    base.castShadow = true;
    group.add(base);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(w / 2, w / 2, 30, 12, 1, false, 0, Math.PI), roofMat);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.y = Math.PI / 2;
    roof.position.set(rx + dx, WORLD.runwayY + 12, dz);
    group.add(roof);
  }
  const tower = new THREE.Mesh(new THREE.BoxGeometry(7, 18, 7), new THREE.MeshStandardMaterial({ color: 0xd8d3c4, roughness: 0.8 }));
  tower.position.set(rx + 78, WORLD.runwayY + 9, 760);
  tower.castShadow = true;
  group.add(tower);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 9), new THREE.MeshStandardMaterial({ color: 0x2b3a42, roughness: 0.3, metalness: 0.4 }));
  cab.position.set(rx + 78, WORLD.runwayY + 20, 760);
  group.add(cab);
  scene.add(group);
  // Windsock on a pole near the threshold.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.35, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.5, metalness: 0.6 }),
  );
  pole.position.set(rx - 34, WORLD.runwayY + 6, WORLD.runwayZ0 + 24);
  scene.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(1.6, 7, 10, 1, true),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.8, side: THREE.DoubleSide }),
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(rx - 30, WORLD.runwayY + 11.4, WORLD.runwayZ0 + 24);
  scene.add(sock);
  return { windsock: sock };
}

/** Build the whole static world. Returns helpers the flight model uses. */
export function createWorld(scene, seed = WORLD.seed) {
  void seed;
  scene.add(buildTerrainMesh());
  buildWater(scene);
  buildRunway(scene);
  buildTrees(scene);
  const clouds = buildClouds(scene);
  const { windsock } = buildAirfield(scene);
  return {
    heightAt,
    runwayX,
    meander,
    waterLevel: WORLD.waterLevel,
    update(dt, t, windHeading) {
      for (const c of clouds) {
        c.position.x += c.userData.drift * dt;
        if (c.position.x > 2000) c.position.x = -2000;
      }
      windsock.rotation.y = windHeading + Math.sin(t * 0.7) * 0.08;
    },
  };
}
