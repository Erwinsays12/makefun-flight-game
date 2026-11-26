// AERIS Ridge Runner — missions. Three courier courses through the same
// valley, each a loop of glowing rings that ends back at the runway.
// Ring altitudes are metres above the ground at that spot.
import { meander, heightAt } from './terrain.js';
import { RING_RADIUS } from './config.js';

function ring(x, z, agl) {
  return { x, z, y: heightAt(x, z) + agl };
}

function valleyCourse(weave, aglBase, count, zStart, zEnd) {
  const rings = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const z = zStart + (zEnd - zStart) * t;
    const x = meander(z) + Math.sin(t * Math.PI * 2.4) * weave;
    const agl = aglBase + 45 * Math.sin(t * Math.PI * 1.6) + (i % 3) * 18;
    rings.push(ring(x, z, agl));
  }
  return rings;
}

export const MISSIONS = [
  {
    id: 'dawn-valley',
    name: 'Dawn Valley',
    tagline: 'A gentle morning loop down the valley and home.',
    difficulty: 'Easy',
    parTime: 210,
    wind: { speed: 2, heading: 0, gust: 0 },
    rings: [
      ...valleyCourse(150, 90, 6, 500, -1300),
      ring(meander(-1450) - 260, -1500, 120),
      ring(meander(-900) + 220, -800, 80),
    ],
  },
  {
    id: 'canyon-rush',
    name: 'Canyon Rush',
    tagline: 'Low, fast and tight — thread the river bends at treetop height.',
    difficulty: 'Medium',
    parTime: 240,
    wind: { speed: 5, heading: 1.2, gust: 1.5 },
    rings: [
      ...valleyCourse(90, 55, 8, 500, -1400),
      ring(meander(-1550) + 200, -1560, 70),
      ring(meander(-700) - 160, -650, 50),
    ],
  },
  {
    id: 'storm-ridge',
    name: 'Storm Ridge',
    tagline: 'Over the eastern ridge in a crosswind. Mind the gusts.',
    difficulty: 'Hard',
    parTime: 300,
    wind: { speed: 9, heading: 2.4, gust: 4 },
    rings: [
      ring(meander(500) + 200, 300, 160),
      ring(650, -100, 260),
      ring(1050, -500, 330),
      ring(1250, -900, 380),
      ring(1100, -1300, 350),
      ring(700, -1500, 300),
      ring(300, -1400, 220),
      ring(meander(-1100) - 150, -1100, 150),
      ring(meander(-700) + 180, -700, 110),
      ring(meander(-350) - 120, -350, 90),
      ring(meander(0) + 140, 0, 80),
      ring(meander(420), 420, 70),
    ],
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) ?? MISSIONS[0];
}

/** A ring's forward direction: toward the next ring (or the runway). */
export function ringNormal(mission, index) {
  const rings = mission.rings;
  const a = rings[index];
  const b = rings[index + 1] ?? { x: meander(550), z: 550, y: 60 };
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  return { x: dx / len, y: dy / len, z: dz / len };
}

export { RING_RADIUS };
