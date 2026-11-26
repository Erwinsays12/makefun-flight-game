// AERIS Ridge Runner — the Kestrel K-7, a small bush plane built from
// primitives: cream fuselage, teal wings, orange stripe, spinning prop,
// nav lights and fixed gear. Original design, no borrowed model.
import * as THREE from 'three';
import { COLORS } from './config.js';

function std(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.25, ...opts });
}

export function buildAircraft() {
  const group = new THREE.Group();
  group.name = 'kestrel-k7';

  // Fuselage: tapered body from tail to nose.
  const bodyMat = std(COLORS.paintCream);
  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.42, 5.6, 12), bodyMat);
  fuselage.rotation.x = Math.PI / 2;
  fuselage.position.set(0, 0, 0.4);
  fuselage.castShadow = true;
  group.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.85, 1.5, 12), std(COLORS.paintTeal));
  nose.rotation.x = -Math.PI / 2;
  nose.position.set(0, 0, 3.9);
  nose.castShadow = true;
  group.add(nose);
  // Orange cheatline stripe along the fuselage.
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.87, 0.44, 5.4, 12, 1, true, 0, Math.PI * 2), std(COLORS.paintOrange, { roughness: 0.5 }));
  stripe.rotation.x = Math.PI / 2;
  stripe.position.set(0, -0.12, 0.4);
  stripe.scale.set(1, 1, 0.32);
  group.add(stripe);

  // Canopy: tinted glasshouse over the cockpit.
  const canopy = new THREE.Mesh(
    new THREE.SphereGeometry(0.72, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0x9fd8e8, roughness: 0.12, metalness: 0.4, transparent: true, opacity: 0.85 }),
  );
  canopy.scale.set(0.85, 0.75, 1.5);
  canopy.position.set(0, 0.62, 1.1);
  group.add(canopy);

  // Main wing: slight dihedral, teal with cream tips.
  const wingMat = std(COLORS.paintTeal);
  const wing = new THREE.Mesh(new THREE.BoxGeometry(9.6, 0.18, 1.7), wingMat);
  wing.position.set(0, 0.05, 0.9);
  wing.rotation.z = 0.045;
  wing.castShadow = true;
  group.add(wing);
  const tipMat = std(COLORS.paintCream);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 1.7), tipMat);
    tip.position.set(s * 4.65, 0.05 + s * 0.045 * 4.65, 0.9);
    tip.rotation.z = 0.045;
    group.add(tip);
  }
  // Tail: horizontal stabiliser + vertical fin.
  const stab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 1.1), wingMat);
  stab.position.set(0, 0.18, -2.5);
  stab.castShadow = true;
  group.add(stab);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.5, 1.4), std(COLORS.paintOrange));
  fin.position.set(0, 0.8, -2.55);
  fin.rotation.x = -0.25;
  fin.castShadow = true;
  group.add(fin);

  // Propeller: spinner + two blades, spins with throttle.
  const prop = new THREE.Group();
  prop.position.set(0, 0, 4.75);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.7, 10), std(COLORS.paintOrange));
  spinner.rotation.x = Math.PI / 2;
  prop.add(spinner);
  const bladeMat = std(0x2b2b2e, { roughness: 0.4 });
  for (const a of [0, Math.PI]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.28, 3.4, 0.1), bladeMat);
    blade.rotation.z = a;
    blade.position.y = 0;
    prop.add(blade);
  }
  // Faint prop disc so the spin reads at speed.
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.75, 24),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, side: THREE.DoubleSide }),
  );
  prop.add(disc);
  group.add(prop);

  // Fixed landing gear: three legs with wheels.
  const legMat = std(0x3a3a3a, { metalness: 0.6, roughness: 0.4 });
  const wheelMat = std(0x181818, { roughness: 0.9 });
  for (const [gx, gz] of [[-0.9, 1.4], [0.9, 1.4], [0, -2.3]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), legMat);
    leg.position.set(gx, -0.95, gz);
    group.add(leg);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 12), wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(gx, -1.45, gz);
    group.add(wheel);
  }

  // Navigation lights: red port, green starboard, white tail (emissive).
  const nav = (color, x, y, z) => {
    const l = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 8),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.4 }),
    );
    l.position.set(x, y, z);
    group.add(l);
    return l;
  };
  nav(0xff2a2a, -4.85, 0.1, 0.9);
  nav(0x2aff5a, 4.85, 0.1, 0.9);
  const tailLight = nav(0xffffff, 0, 0.3, -3.1);

  // Beacon: small red dome on top, blinks in the loop.
  const beacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xff2222, emissive: 0xff2222, emissiveIntensity: 3 }),
  );
  beacon.position.set(0, 0.95, -0.6);
  group.add(beacon);

  return { group, prop, beacon, tailLight };
}
