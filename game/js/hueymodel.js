// PLACEHOLDER: the old helicopter mesh scaled up to UH-1H size, until the real Huey model lands.
// API: buildHueyMesh() -> { group, shell, animate(S, dt, time, inside) }, S = { nr, tx, ty, ... } (see heli.js / main.js)
import * as THREE from 'three';
// --------------------------------------------------------------------------------------------- model
function buildOld() {
  const g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshPhongMaterial({ color: c, flatShading: true, ...o });
  const olive = M(0x55613d), dark = M(0x2b2f2a), glass = M(0x6fd0ff, { emissive: 0x0e3048, shininess: 80 });
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.55, 3.4), olive); cab.position.set(0, 0.1, 0.1); cab.name = 'cab';
  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.85, 1.2, 8).rotateX(-Math.PI / 2).scale(1.25, 1, 1), glass); nose.position.set(0, 0.05, -2.15); nose.name = 'nose';
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.45, 1.6), olive); roof.position.set(0, 1.05, 0.2); roof.name = 'roof';
  const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.38, 4.6, 6).rotateX(Math.PI / 2), olive); boom.position.set(0, 0.45, 3.9);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.2, 0.7), olive); fin.position.set(0, 1.0, 6.0); fin.rotation.x = -0.35;
  const stab = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.07, 0.4), olive); stab.position.set(0, 0.45, 5.1);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.5, 6), dark); mast.position.set(0, 1.5, 0.2); mast.name = 'mast';
  const skidGeo = new THREE.BoxGeometry(0.1, 0.1, 3.6);
  const skidL = new THREE.Mesh(skidGeo, dark), skidR = new THREE.Mesh(skidGeo, dark);
  skidL.position.set(-0.85, -1.15 + 0.05, 0); skidR.position.set(0.85, -1.15 + 0.05, 0);
  for (const z of [-0.8, 0.9]) for (const x of [-0.7, 0.7]) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), dark); st.position.set(x, -1.15 + 0.35, z); st.rotation.z = x > 0 ? 0.3 : -0.3; g.add(st);
  }
  // main rotor: two blades + a faint disc that fades in with rpm (motion blur stand-in)
  const rotor = new THREE.Group(); rotor.position.set(0, 1.78, 0.2);
  for (const a of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 3.8), dark); b.position.z = 3.8 / 2; b.rotation.y = a; const p = new THREE.Group(); p.rotation.y = a; b.rotation.y = 0; p.add(b); rotor.add(p); }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(3.8, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.copy(rotor.position);
  const tail = new THREE.Group(); tail.position.set(0.12, 1.15, 6.15);
  for (const a of [0, Math.PI]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.65), dark); b.position.z = 0.32; const p = new THREE.Group(); p.rotation.x = a; p.add(b); tail.add(p); }
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff3020 })); beacon.position.set(0, 1.35, 0.9);
  g.add(cab, nose, roof, boom, fin, stab, mast, skidL, skidR, rotor, disc, tail, beacon);
  return {
    group: g,
    animate(rpm, dt, time, inside = false) {
      rotor.rotation.y -= rpm * 38 * dt; tail.rotation.x += rpm * 110 * dt;
      disc.material.opacity = (inside ? 0.12 : 0.32) * THREE.MathUtils.smoothstep(rpm, 0.35, 0.9);
      beacon.visible = (time % 1.2) < 0.12;
    },
  };
}

export function buildHueyMesh() {
  const o = buildOld(), g = new THREE.Group(); o.group.scale.setScalar(1.9); o.group.position.y = 0.35; g.add(o.group);
  const shell = ['cab', 'nose', 'roof', 'mast'].map(n => o.group.getObjectByName(n));
  return { group: g, shell, animate(S, dt, time, inside) { o.animate(S.nr, dt, time, inside); } };
}
