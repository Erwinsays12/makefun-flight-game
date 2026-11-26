// AERIS Ridge Runner — arcade flight model with real trade-offs:
// throttle feeds speed, speed feeds lift, bank feeds turn, and fuel and
// damage turn every sortie into decisions. Deterministic per fixed step.
import { PLANE, WORLD, RING_PASS_DIST, clamp, lerp, angleDiff } from './config.js';
import { ringNormal } from './missions.js';

const G = 9.81;

export class Flight {
  constructor(world, mission) {
    this.world = world;
    this.mission = mission;
    this.reset();
  }

  reset() {
    const rx = this.world.runwayX(800);
    this.pos = { x: rx, y: WORLD.runwayY + 1.6, z: 800 };
    this.heading = 0; // 0 = north (-Z), runway heading
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.vs = 0;
    this.throttle = 0;
    this.fuel = 100;
    this.damage = 0;
    this.score = 0;
    this.ringsPassed = 0;
    this.time = 0;
    this.status = 'parked'; // parked | flying | landed | crashed | complete
    this.gearDown = true;
    this.flaps = false;
    this.engineOut = false;
    this.stalled = false;
    this.landing = null; // landing score breakdown, once landed
    this.events = [];
    this.windGustPhase = 0;
    this.liftoffT = -10; // sim time of the last rotation, for the grace window
  }

  get nextRing() {
    return this.ringsPassed < this.mission.rings.length
      ? this.mission.rings[this.ringsPassed]
      : null;
  }

  get groundY() {
    return this.world.heightAt(this.pos.x, this.pos.z);
  }

  get agl() {
    return Math.max(0, this.pos.y - this.groundY);
  }

  onRunway() {
    const rx = this.world.runwayX(this.pos.z);
    return (
      Math.abs(this.pos.x - rx) < WORLD.runwayHalfWidth &&
      this.pos.z > WORLD.runwayZ0 &&
      this.pos.z < WORLD.runwayZ1
    );
  }

  windNow(t) {
    const w = this.mission.wind;
    const gust = w.gust * Math.sin(t * 0.9) * Math.sin(t * 0.37 + 1.3);
    const speed = w.speed + gust;
    // Wind heading: the direction the wind blows TOWARD (0 = north).
    return {
      x: Math.sin(w.heading) * speed,
      z: -Math.cos(w.heading) * speed,
      speed,
    };
  }

  step(dt, input, t) {
    if (this.status === 'crashed' || this.status === 'complete') return;

    // --- Throttle & engine ---
    if (this.fuel <= 0 && !this.engineOut) {
      this.engineOut = true;
      this.events.push({ type: 'engineout', t });
    }
    const throttleTarget = this.engineOut ? 0 : clamp(this.throttle + input.throttleDelta * 0.55 * dt, 0, 1);
    this.throttle = throttleTarget;
    if (!this.engineOut) {
      this.fuel = Math.max(0, this.fuel - (PLANE.fuelBurnIdle + this.throttle * PLANE.fuelBurnFull) * dt);
      if (this.fuel < 20 && this.fuel + (PLANE.fuelBurnIdle + this.throttle * PLANE.fuelBurnFull) * dt >= 20) {
        this.events.push({ type: 'lowfuel', t });
      }
    }

    // --- On the ground: roll along the runway, wait for rotation ---
    // The gear holds the plane at runway height; no sink, no ground strike.
    if (this.status === 'parked' || this.status === 'landed') {
      const targetSpeed = this.throttle * PLANE.maxSpeed * 0.96;
      this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-0.3 * dt));
      if (input.brake) this.speed = Math.max(0, this.speed - 22 * dt);
      this.speed = Math.max(0, this.speed);
      this.roll = lerp(this.roll, 0, 1 - Math.exp(-2.6 * dt));
      this.pitch = lerp(this.pitch, 0, 1 - Math.exp(-2.6 * dt));
      this.vs = 0;
      this.pos.x += Math.sin(this.heading) * this.speed * dt;
      this.pos.z += -Math.cos(this.heading) * this.speed * dt;
      const half = WORLD.size / 2 - 40;
      this.pos.x = clamp(this.pos.x, -half, half);
      this.pos.z = clamp(this.pos.z, -half, half);
      this.pos.y = this.groundY + 1.6;
      if (this.speed > 26 && input.pitchAxis > 0.2) {
        this.status = 'flying';
        this.liftoffT = t;
        this.events.push({ type: 'takeoff', t });
      }
      return;
    }

    // --- Attitude: roll banks the turn, pitch aims the nose ---
    const targetRoll = clamp(input.rollAxis * PLANE.maxRoll, -PLANE.maxRoll, PLANE.maxRoll);
    const rollRate = input.rollAxis === 0 ? 2.6 : PLANE.rollRate;
    this.roll = lerp(this.roll, targetRoll, 1 - Math.exp(-rollRate * dt));
    const targetPitch = clamp(input.pitchAxis * (input.pitchAxis > 0 ? PLANE.maxPitchUp : -PLANE.maxPitchDown), PLANE.maxPitchDown, PLANE.maxPitchUp);
    this.pitch = lerp(this.pitch, targetPitch, 1 - Math.exp(-PLANE.pitchRate * 2.2 * dt));

    // Coordinated turn: heading follows bank, faster when slow.
    const turnRate = (G * Math.tan(this.roll)) / Math.max(this.speed, 12);
    this.heading += turnRate * dt;
    if (this.heading > Math.PI || this.heading < -Math.PI) {
      this.heading = (((this.heading + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
    }

    // --- Speed: throttle pulls toward its target, climb bleeds, brake bites ---
    let targetSpeed = this.throttle * PLANE.maxSpeed;
    if (this.flaps) targetSpeed *= 0.72;
    if (this.gearDown) targetSpeed *= 0.96;
    let accelRate = 0.35;
    if (this.speed < targetSpeed) accelRate = 0.3;
    else accelRate = 0.5; // drag slows faster than the engine speeds up
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-accelRate * dt));
    this.speed -= Math.sin(this.pitch) * 3.2 * dt; // climb costs speed
    if (input.brake) this.speed = Math.max(0, this.speed - 22 * dt);
    this.speed = Math.max(0, this.speed);

    // --- Lift & sink: below flying speed the wing quits ---
    this.stalled = this.speed < PLANE.stallSpeed && this.status === 'flying';
    let sink = 0;
    if (this.speed < PLANE.minFlySpeed + 6) {
      sink = clamp((PLANE.minFlySpeed + 6 - this.speed) * 0.5, 0, 14);
    }
    if (this.flaps) sink *= 0.7;
    this.vs = this.speed * Math.sin(this.pitch) - sink;
    if (this.stalled && this.pitch > 0) this.vs -= 2.5; // nose drops in a stall

    // --- Move ---
    const wind = this.windNow(t);
    this.windGustPhase = t;
    const fx = Math.sin(this.heading) * Math.cos(this.pitch);
    const fy = Math.sin(this.pitch);
    const fz = -Math.cos(this.heading) * Math.cos(this.pitch);
    this.pos.x += (fx * this.speed + wind.x * 0.45) * dt;
    this.pos.y += this.vs * dt;
    this.pos.z += (fz * this.speed + wind.z * 0.45) * dt;
    // Stay inside the world.
    const half = WORLD.size / 2 - 40;
    this.pos.x = clamp(this.pos.x, -half, half);
    this.pos.z = clamp(this.pos.z, -half, half);
    this.pos.y = Math.min(this.pos.y, 1200);

    if (this.status === 'flying') this.time += dt;

    // --- Rings ---
    const ring = this.nextRing;
    if (ring) {
      const d = Math.hypot(this.pos.x - ring.x, this.pos.y - ring.y, this.pos.z - ring.z);
      if (d < RING_PASS_DIST) {
        this.ringsPassed += 1;
        this.score += 500;
        this.fuel = Math.min(100, this.fuel + PLANE.fuelPerRing);
        this.events.push({ type: 'ring', t, index: this.ringsPassed, total: this.mission.rings.length });
      }
    }

    // --- Ground / water contact ---
    const gy = this.groundY;
    const overWater = gy < WORLD.waterLevel + 0.4;
    if (overWater && this.pos.y <= WORLD.waterLevel + 0.6) {
      this.crash('ditched', t);
      return;
    }
    if (this.pos.y <= gy + 1.2) {
      this.pos.y = gy + 1.2;
      if (t - this.liftoffT < 1.5) {
        // Just rotated: the wing is still building lift and the plane may
        // settle back onto its gear. Stay on the gear line, no landing call.
        if (this.vs < 0) this.vs = 0;
        return;
      }
      const soft = Math.abs(this.vs) < 6.5;
      const slow = this.speed < 48;
      if (this.onRunway() && soft && slow && this.gearDown && Math.abs(this.roll) < 0.4) {
        this.land(t);
        return;
      }
      if (Math.abs(this.vs) < 3.2 && this.speed < 22) {
        // Rough field touchdown: survivable, but it hurts the airframe.
        this.damage = Math.min(100, this.damage + 30);
        this.speed *= 0.4;
        this.vs = 2.5;
        this.pos.y = gy + 2.5;
        this.events.push({ type: 'rough', t, damage: this.damage });
        if (this.damage >= 100) this.crash('airframe', t);
        return;
      }
      this.crash('terrain', t);
    }
  }

  land(t) {
    const rx = this.world.runwayX(this.pos.z);
    const centerErr = Math.abs(this.pos.x - rx);
    const softness = clamp(1 - Math.abs(this.vs) / 6.5, 0, 1);
    const center = clamp(1 - centerErr / WORLD.runwayHalfWidth, 0, 1);
    const landingScore = Math.round(800 + softness * 400 + center * 300);
    this.score += landingScore;
    const allRings = this.ringsPassed >= this.mission.rings.length;
    const timeBonus = allRings ? Math.max(0, Math.round((this.mission.parTime - this.time) * 10)) : 0;
    const fuelBonus = allRings ? Math.round(this.fuel * 5) : 0;
    this.score += timeBonus + fuelBonus;
    this.landing = { score: landingScore, softness, center, timeBonus, fuelBonus, allRings };
    this.status = allRings ? 'complete' : 'landed';
    this.speed = 0;
    this.events.push({ type: this.status, t, landing: this.landing });
  }

  crash(kind, t) {
    this.damage = 100;
    this.status = 'crashed';
    this.speed = 0;
    this.events.push({ type: 'crash', t, kind });
  }

  /** Heading + pitch the autopilot wants to reach a target point.
   * Path following: aim at a point ahead on the segment from the previous
   * ring to this one, so the plane crosses the gate on its line instead of
   * cutting the corner. Turn by PD (bank for the turn rate that closes the
   * heading error) and climb by a vertical-speed cascade (pick the climb
   * rate from the altitude error, then the pitch that produces it). */
  steerTo(target, prev) {
    const A = prev ?? { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    const abx = target.x - A.x;
    const aby = target.y - A.y;
    const abz = target.z - A.z;
    const abLen = Math.hypot(abx, aby, abz) || 1;
    const apx = this.pos.x - A.x;
    const apy = this.pos.y - A.y;
    const apz = this.pos.z - A.z;
    const tt = clamp((apx * abx + apy * aby + apz * abz) / (abLen * abLen), 0, 1);
    const cx = A.x + abx * tt;
    const cy = A.y + aby * tt;
    const cz = A.z + abz * tt;
    const remain = Math.hypot(target.x - cx, target.y - cy, target.z - cz);
    const look = Math.min(80, remain);
    const aim = { x: cx + (abx / abLen) * look, y: cy + (aby / abLen) * look, z: cz + (abz / abLen) * look };
    const dx = aim.x - this.pos.x;
    const dz = aim.z - this.pos.z;
    const wantHeading = Math.atan2(dx, -dz);
    const headingErr = angleDiff(wantHeading, this.heading);
    const wantTurn = clamp(headingErr * 0.9, -0.5, 0.5);
    const wantRoll = Math.atan((wantTurn * Math.max(this.speed, 20)) / G);
    const altErr = aim.y - this.pos.y;
    const vsWant = clamp(altErr * 0.6, -12, 12);
    const pitchForVs = Math.asin(clamp(vsWant / Math.max(this.speed, 20), -0.45, 0.45));
    return {
      rollAxis: clamp(wantRoll / PLANE.maxRoll, -1, 1),
      pitchAxis: clamp(pitchForVs / PLANE.maxPitchUp + (vsWant - this.vs) * 0.02, -1, 1),
      throttleDelta: this.speed < 44 ? 1 : this.speed > 50 ? -1 : 0,
      brake: false,
    };
  }

  /** Closest point on the segment A-B to the plane, with its distance. */
  closestOnSegment(a, b) {
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const abz = b.z - a.z;
    const ab2 = abx * abx + aby * aby + abz * abz || 1;
    const t = clamp(
      ((this.pos.x - a.x) * abx + (this.pos.y - a.y) * aby + (this.pos.z - a.z) * abz) / ab2,
      0,
      1,
    );
    const x = a.x + abx * t;
    const y = a.y + aby * t;
    const z = a.z + abz * t;
    return { x, y, z, dist: Math.hypot(this.pos.x - x, this.pos.y - y, this.pos.z - z) };
  }

  /** Distance from the plane to the segment A-B (for the landing pattern). */
  distToSegment(a, b) {
    return this.closestOnSegment(a, b).dist;
  }

  /** Autopilot for the landing shot: join the extended centreline and fly
   * the final straight down the runway, flaring onto the numbers. */
  steerToLand() {
    const rx = this.world.runwayX(500);
    const fix = { x: rx, y: 90, z: -500 };
    const td = { x: rx, y: WORLD.runwayY - 1, z: 500 };
    // Overshot the runway: climb out to the north and re-enter the pattern.
    if (this.pos.z > 950 && this.pos.y < 70) {
      return this.steerTo(fix, { x: rx, y: 40, z: 900 });
    }
    // On the final already? Close to the fix->touchdown line, still north
    // of the numbers, and not so high above the line that the descent is
    // impossible. Otherwise fly to the fix first — never dive at the runway
    // from directly above it, and never flip out of the final mid-way.
    const c = this.closestOnSegment(fix, td);
    const onFinal = c.dist < 60 && this.pos.z < 520 && this.pos.y < c.y + 25;
    let input;
    if (!onFinal) {
      input = this.steerTo(fix, { x: this.pos.x, y: this.pos.y, z: this.pos.z });
      input.throttleDelta = this.speed < 44 ? 1 : this.speed > 50 ? -1 : 0;
    } else {
      // Final approach as a segment: high over the valley, down to the numbers.
      // The segment ends just BELOW gear height so the wheels find the runway
      // instead of the plane sailing past the far end still a metre high.
      input = this.steerTo(td, fix);
      input.throttleDelta = this.speed < 40 ? 0.6 : this.speed > 46 ? -0.8 : 0;
    }
    // Low over the runway, level the wings: no gust correction is worth
    // touching down banked. The centreline is wide enough to absorb it.
    if (this.agl < 40) input.rollAxis = clamp(input.rollAxis, -0.3, 0.3);
    return input;
  }
}
