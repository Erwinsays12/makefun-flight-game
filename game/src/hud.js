// AERIS Ridge Runner — the lit instrument panel: DOM readouts, an attitude
// indicator and a moving-map, all updated from the flight state each frame.
import { knots, headingDeg, clamp } from './config.js';

const $ = (id) => document.getElementById(id);

function fmt(n, digits = 0) {
  return Number(n).toFixed(digits);
}

export function buildHud() {
  return {
    speed: $('hud-speed-val'),
    altAgl: $('hud-alt-agl'),
    altMsl: $('hud-alt-msl'),
    vs: $('hud-vs'),
    hdg: $('hud-hdg-val'),
    throttleFill: $('hud-throttle-fill'),
    throttleVal: $('hud-throttle-val'),
    fuelFill: $('hud-fuel-fill'),
    fuelVal: $('hud-fuel-val'),
    dmgFill: $('hud-dmg-fill'),
    dmgVal: $('hud-dmg-val'),
    timer: $('hud-timer'),
    score: $('hud-score'),
    rings: $('hud-rings'),
    objective: $('hud-objective'),
    warn: $('hud-warn'),
    msg: $('hud-msg'),
    attitude: $('hud-attitude'),
    map: $('hud-map'),
    fuelBox: $('hud-fuel-box'),
    dmgBox: $('hud-dmg-box'),
  };
}

function drawAttitude(canvas, flight) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2);
  ctx.clip();
  ctx.translate(cx, cy);
  ctx.rotate(-flight.roll);
  const pitchPx = clamp(flight.pitch, -0.6, 0.6) * 90;
  ctx.translate(0, pitchPx);
  // Sky / ground.
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(-w, -h, w * 2, h);
  ctx.fillStyle = '#7a5a34';
  ctx.fillRect(-w, 0, w * 2, h);
  // Horizon line + pitch ladder.
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w, 0);
  ctx.lineTo(w, 0);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  for (const p of [-0.3, -0.15, 0.15, 0.3]) {
    const y = -p * 90;
    ctx.beginPath();
    ctx.moveTo(-18, y);
    ctx.lineTo(18, y);
    ctx.stroke();
  }
  ctx.restore();
  // Fixed aircraft symbol.
  ctx.strokeStyle = '#ffd34d';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy);
  ctx.lineTo(cx - 8, cy);
  ctx.moveTo(cx + 8, cy);
  ctx.lineTo(cx + 26, cy);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy + 6);
  ctx.stroke();
  // Bezel.
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, w / 2 - 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawMap(canvas, flight, mission, world) {
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  const S = 2100; // metres shown across the map
  const toMap = (x, z) => [w / 2 + (x - flight.pos.x) / S * w, h / 2 + (z - flight.pos.z) / S * h];
  // Water + runway.
  ctx.fillStyle = 'rgba(47,127,184,0.55)';
  ctx.beginPath();
  const [lx, ly] = toMap(world.meander(-1250), -1250);
  ctx.arc(lx, ly, 430 / S * w, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const [rx0, rz0] = toMap(world.runwayX(250), 250);
  const [rx1, rz1] = toMap(world.runwayX(850), 850);
  ctx.moveTo(rx0, rz0);
  ctx.lineTo(rx1, rz1);
  ctx.stroke();
  // Rings: passed green, next amber, later dim.
  mission.rings.forEach((r, i) => {
    const [mx, my] = toMap(r.x, r.z);
    ctx.beginPath();
    ctx.arc(mx, my, i === flight.ringsPassed ? 6 : 4, 0, Math.PI * 2);
    ctx.fillStyle = i < flight.ringsPassed ? '#2fd47a' : i === flight.ringsPassed ? '#ffb020' : 'rgba(255,255,255,0.4)';
    ctx.fill();
    if (i === flight.ringsPassed) {
      ctx.strokeStyle = '#ffb020';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  // Own ship: heading triangle, north-up is not used; map rotates with north up.
  const [px, py] = toMap(flight.pos.x, flight.pos.z);
  ctx.save();
  ctx.translate(px, py);
  ctx.rotate(Math.PI - flight.heading);
  ctx.fillStyle = '#ffd34d';
  ctx.beginPath();
  ctx.moveTo(0, -8);
  ctx.lineTo(5, 6);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '9px system-ui, sans-serif';
  ctx.fillText('N', w - 12, 12);
}

export function updateHud(hud, flight, mission, world, view) {
  const kt = knots(flight.speed);
  hud.speed.textContent = fmt(kt);
  hud.altAgl.textContent = fmt(flight.agl * 3.28084);
  hud.altMsl.textContent = fmt(flight.pos.y * 3.28084);
  const vsFpm = flight.vs * 196.85;
  hud.vs.textContent = (vsFpm >= 0 ? '+' : '') + fmt(vsFpm);
  hud.hdg.textContent = String(Math.round(headingDeg(flight.heading))).padStart(3, '0');
  const thr = Math.round(flight.throttle * 100);
  hud.throttleFill.style.width = `${thr}%`;
  hud.throttleVal.textContent = `${thr}%`;
  hud.fuelFill.style.width = `${flight.fuel}%`;
  hud.fuelVal.textContent = `${Math.round(flight.fuel)}%`;
  hud.fuelFill.classList.toggle('low', flight.fuel < 20);
  hud.fuelBox.classList.toggle('alert', flight.fuel < 20);
  hud.dmgFill.style.width = `${flight.damage}%`;
  hud.dmgVal.textContent = `${Math.round(flight.damage)}%`;
  hud.dmgBox.classList.toggle('alert', flight.damage > 60);
  const mm = String(Math.floor(flight.time / 60)).padStart(2, '0');
  const ss = String(Math.floor(flight.time % 60)).padStart(2, '0');
  hud.timer.textContent = `${mm}:${ss}`;
  hud.score.textContent = String(flight.score);
  hud.rings.textContent = `${flight.ringsPassed}/${mission.rings.length}`;
  const next = flight.nextRing;
  hud.objective.textContent = flight.status === 'parked'
    ? 'Throttle up, rotate at 55 kt, then fly the rings'
    : flight.status === 'complete'
      ? 'Course complete — beautiful flying!'
      : flight.status === 'landed'
        ? 'Landed. Rings remain — take off and finish the course'
        : next
          ? `Ring ${flight.ringsPassed + 1} of ${mission.rings.length} — then land on runway 09`
          : 'All rings done — land on runway 09';
  const warns = [];
  if (flight.stalled) warns.push('STALL');
  if (flight.engineOut) warns.push('ENGINE OUT — GLIDE TO THE RUNWAY');
  else if (flight.fuel < 20) warns.push('LOW FUEL');
  if (flight.damage > 60) warns.push('AIRFRAME DAMAGE');
  if (flight.status === 'flying' && !flight.gearDown && flight.agl * 3.28084 < 500) warns.push('GEAR UP');
  hud.warn.textContent = warns.join('  •  ');
  hud.warn.classList.toggle('show', warns.length > 0);
  drawAttitude(hud.attitude, flight);
  drawMap(hud.map, flight, mission, world);
}

export function flashMessage(hud, text, ms = 2600) {
  hud.msg.textContent = text;
  hud.msg.classList.add('show');
  clearTimeout(flashMessage._t);
  flashMessage._t = setTimeout(() => hud.msg.classList.remove('show'), ms);
}
