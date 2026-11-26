// AERIS Ridge Runner — deterministic screenshot scenes. Each scene flies the
// real simulation forward with a simple autopilot (steer at the next ring,
// hold speed, flare for landing) for a fixed number of 1/60 s steps, then
// freezes the pose so the frame is exactly what a short game looks like.
// The same seed always gives the same frame.
import { Flight } from './flight.js';
import { missionById, ringNormal } from './missions.js';
import { WORLD } from './config.js';

const STEP = 1 / 60;

function dist3(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Step the sim with the autopilot until `stop` says so (or time runs out). */
function flyUntil(flight, inputFn, maxSeconds, stop) {
  let t = 0;
  for (let i = 0; i < maxSeconds * 60; i += 1) {
    const input = inputFn(flight);
    if (input.flaps !== undefined) flight.flaps = input.flaps;
    if (input.gearDown !== undefined) flight.gearDown = input.gearDown;
    flight.step(STEP, input, t);
    t += STEP;
    if (flight.status === 'crashed' || flight.status === 'complete' || flight.status === 'landed') break;
    if (stop && stop(flight)) break;
  }
  return t;
}

function flyCourse(flight, stop) {
  return flyUntil(
    flight,
    (f) => {
      const next = f.nextRing;
      if (!next) return f.steerToLand();
      // Previous ring (or the takeoff point) anchors the approach line.
      const prev = f.ringsPassed > 0
        ? f.mission.rings[f.ringsPassed - 1]
        : { x: f.world.runwayX(800), y: 10, z: 800 };
      return f.steerTo(next, prev);
    },
    300,
    stop,
  );
}

function cover(ctx) {
  const mission = missionById('dawn-valley');
  const flight = new Flight(ctx.world, mission);
  // Fly the whole outbound leg, then freeze on the homebound leg with the
  // runway ahead: ring 8 in front, valley and runway beyond it.
  flyCourse(flight, (f) => f.ringsPassed >= 7);
  flyCourse(flight, (f) => {
    const next = f.nextRing;
    return next ? dist3(f.pos, next) < 170 : true;
  });
  return { flight, mission, frozen: true, screen: 'play' };
}

function rings(ctx) {
  const mission = missionById('dawn-valley');
  const flight = new Flight(ctx.world, mission);
  // Fly to just before ring 4: the gate fills the frame ahead of the nose.
  flyCourse(flight, (f) => f.ringsPassed >= 3);
  flyCourse(flight, (f) => {
    const next = f.nextRing;
    return next ? dist3(f.pos, next) < 70 : true;
  });
  return { flight, mission, frozen: true, screen: 'play' };
}

function landing(ctx) {
  const mission = missionById('dawn-valley');
  const flight = new Flight(ctx.world, mission);
  // Put the Kestrel on a real final approach, then fly the glidepath down.
  const rx = ctx.world.runwayX(500);
  flight.pos = { x: rx + 40, y: 95, z: -350 };
  flight.heading = Math.PI; // south, toward the runway
  flight.pitch = -0.06;
  flight.roll = 0;
  flight.speed = 46;
  flight.throttle = 0.45;
  flight.gearDown = true;
  flight.flaps = true;
  flight.status = 'flying';
  flight.time = 132;
  flight.ringsPassed = mission.rings.length;
  flight.score = mission.rings.length * 500;
  flyUntil(flight, (f) => f.steerToLand(), 60, (f) => {
    const dx = f.pos.x - rx;
    const dz = f.pos.z - 260;
    return Math.hypot(dx, dz) < 170 || f.status !== 'flying';
  });
  return { flight, mission, frozen: true, screen: 'play' };
}

function menu(ctx) {
  const mission = missionById('dawn-valley');
  const flight = new Flight(ctx.world, mission);
  return { flight, mission, frozen: true, screen: 'menu' };
}

const SCENES = { cover, rings, landing, menu };

export function prepareShot(ctx, name) {
  const scene = SCENES[name];
  if (!scene) return null;
  return scene(ctx);
}
