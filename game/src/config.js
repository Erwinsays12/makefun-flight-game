// AERIS Ridge Runner — shared tuning constants.
// Units: metres, seconds, radians. Display speeds are knots (1 m/s = 1.94384 kt).
export const WORLD = {
  size: 4200,
  seed: 1337,
  waterLevel: 4.5,
  runwayY: 9,
  // Runway runs along Z at the valley floor; x follows the valley meander.
  runwayZ0: 250,
  runwayZ1: 850,
  runwayHalfWidth: 18,
  runwayFlattenHalf: 70,
};

export const PLANE = {
  maxSpeed: 96, // m/s at full throttle, level flight (~187 kt)
  minFlySpeed: 27, // below this the wing stops flying
  stallSpeed: 30,
  accel: 14, // m/s^2 toward throttle target speed
  dragBase: 0.12,
  climbAuthority: 1.0,
  rollRate: 1.9, // rad/s at full deflection
  pitchRate: 1.1,
  maxRoll: 1.15, // rad (~66 deg)
  maxPitchUp: 0.55,
  maxPitchDown: -0.45,
  turnAuthority: 9.81, // turn rate = g * tan(roll) / speed
  brakeDrag: 0.9,
  flapDrag: 0.45,
  flapLift: 1.25,
  gearDrag: 0.08,
  fuelBurnIdle: 0.1, // %/s
  fuelBurnFull: 0.3, // %/s extra at full throttle
  fuelPerRing: 3, // % refuel bonus per ring
};

export const RING_RADIUS = 16;
export const RING_PASS_DIST = 14.5;

export const CAMERA = {
  chaseDistance: 24,
  chaseHeight: 7.5,
  chaseLerp: 4.5,
  lookAhead: 26,
  rollFollow: 0.35,
  fovBase: 62,
  fovSpeed: 14,
};

export const COLORS = {
  sky: 0x8ec8ee,
  horizon: 0xdfeef7,
  fog: 0xcfe4ef,
  sun: 0xfff2cf,
  grass: 0x5d8a4a,
  grassDry: 0x8a9a52,
  forest: 0x3d6b34,
  rock: 0x8d8578,
  snow: 0xf2f5f7,
  sand: 0xcbb98a,
  water: 0x2f7fb8,
  asphalt: 0x3a3d42,
  paintCream: 0xf3ead2,
  paintTeal: 0x1f7a6d,
  paintOrange: 0xe86a1c,
  ringNext: 0xffb020,
  ringDone: 0x2fd47a,
  ringIdle: 0xff7a3c,
};

export function knots(ms) {
  return ms * 1.94384;
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Shortest signed angular difference, radians. */
export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Heading in degrees, 0 = north (-Z), clockwise. */
export function headingDeg(headingRad) {
  const d = ((-headingRad * 180) / Math.PI) % 360;
  return (d + 360) % 360;
}
