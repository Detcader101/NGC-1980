// NGC-1980 ngc/infdepth: the hand-grenade throw in the first-person viewmodel. Runs after viewmodel.js's update and
// takes over the hands for the drill (FM 3-23.30, the M67 and the M18): the rifle goes down to the left (slung arm's
// side), the right hand takes a grenade from the pouch, the left forefinger hooks the pull ring and pulls the pin, the
// right arm cocks back behind the head with the spoon held down; COOKING lets the spoon fly (the fuse is burning in
// the hand); the throw is an overhand arc (or an underhand lob with the sights key held), follow-through, the rifle
// comes back up. The phases and their fractions come from the game side (marine.js's throw state), so what you see is
// what the fuse does.
//
//   const TV = createThrowVM(vm);   each frame after vm.update: TV.update(dt, st)   st: null | { kind: 'frag' | 'smoke',
//     phase: 'draw' | 'pin' | 'ready' | 'cook' | 'throw' | 'recover', p (0..1 of the phase), under (bool), smokeCol }
//   TV.release() -> { x, y, z } the hand in camera space at the moment the grenade leaves it (for the world grenade)
import * as THREE from 'three';
import { solveArm } from './viewmodel.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v)), sstep = t => t * t * (3 - 2 * t), lerp = (a, b, t) => a + (b - a) * t;
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// key poses of the right hand (camera space, m; and an Euler for the hand) through the drill
const R = {
  grip: null,                                                     // (on the rifle: viewmodel.js placed it)
  pouch: [V3(0.17, -0.46, -0.14), [0.3, 0, 0.5]],                 // at the ammo pouch on the belt
  front: [V3(0.1, -0.19, -0.36), [0.25, 0.2, 0.15]],              // grenade up in front of the chest, spoon in the palm
  cocked: [V3(0.27, 0.1, 0.06), [-0.6, 0.35, 0.6]],               // arm back, hand behind and above the ear
  over: [V3(0.16, 0.2, -0.32), [-1.4, 0.2, 0.3]],                 // over the top of the arc
  out: [V3(0.05, -0.1, -0.62), [-1.9, 0.1, 0.1]],                 // released, arm extended toward the target
  follow: [V3(-0.05, -0.32, -0.42), [-1.2, 0, -0.3]],             // follow-through, across the body
  lowBack: [V3(0.2, -0.42, 0.04), [0.8, 0.2, 0.3]],               // underhand: swung back low
  lowOut: [V3(0.05, -0.12, -0.55), [-0.5, 0, 0.1]],               // underhand: released forward and up
};
const L = { ring: [V3(0.06, -0.15, -0.34), [0.4, -0.3, -0.5]], pulled: [V3(-0.2, -0.12, -0.38), [0.2, -0.4, -0.8]] };

export function createThrowVM(vm) {
  const olive = new THREE.MeshLambertMaterial({ color: 0x4d5636, flatShading: true }), steel = new THREE.MeshLambertMaterial({ color: 0x8a8a82, flatShading: true }), yel = new THREE.MeshLambertMaterial({ color: 0xc8b45a });
  // the M67 (body, fuse, spoon, ring and pin) and the M18 (canister, coloured top band)
  const frag = new THREE.Group();
  { const b = new THREE.Mesh(new THREE.SphereGeometry(0.032, 10, 8).scale(1, 1.1, 1), olive); frag.add(b);
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.0025, 4, 16), yel); band.rotation.x = Math.PI / 2; band.position.y = 0.012; frag.add(band);
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.024, 8), steel); fuse.position.y = 0.043; frag.add(fuse); }
  const smoke = new THREE.Group();
  { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.115, 12), new THREE.MeshLambertMaterial({ color: 0x5c6448, flatShading: true })); smoke.add(c);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.0302, 0.0302, 0.018, 12), new THREE.MeshLambertMaterial({ color: 0x6aa056 })); top.position.y = 0.045; smoke.add(top); smoke.userData.top = top;
    const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.024, 8), steel); fuse.position.y = 0.069; smoke.add(fuse); }
  const spoon = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.075, 0.004), steel); spoon.position.set(0.0, 0.02, 0.034); spoon.rotation.x = 0.15;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0018, 4, 14), steel); ring.position.set(-0.014, 0.05, 0);
  const held = new THREE.Group(); held.add(frag, smoke); vm.arms.R.hand.add(held); held.position.set(0.0, 0.0, -0.022); held.visible = false;
  frag.add(spoon); frag.add(ring);
  const ringL = ring.clone(); vm.arms.L.hand.add(ringL); ringL.position.set(0, 0.06, -0.02); ringL.visible = false;
  const flySpoon = spoon.clone(); vm.root.add(flySpoon); flySpoon.visible = false; const fsV = V3(), fsW = { v: 0 };
  const TV = { held, frag, smoke, k: 0, rel: V3() };
  const _p = V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _wr = V3(), _b = V3(), _gp = V3();
  const _m0 = new THREE.Matrix4(), _md = new THREE.Matrix4(), _mh = new THREE.Matrix4(), _hp2 = V3(), _hq2 = new THREE.Quaternion(), _hs2 = V3();
  const pose = (P, a, b, t, outP, outQ) => { outP.copy(a[0]).lerp(b[0], t); const ea = a[1], eb = b[1]; outQ.setFromEuler(_e.set(lerp(ea[0], eb[0], t), lerp(ea[1], eb[1], t), lerp(ea[2], eb[2], t), 'XYZ')); };
  function setHand(side, pos, q) { const a = vm.arms[side]; a.hand.position.copy(pos); a.hand.quaternion.copy(q); a.hand.updateMatrix(); solveArm(a, _wr.copy(a.hand.userData.wrist).applyMatrix4(a.hand.matrix)); }

  TV.update = (dt, st, lower = false) => {
    // how far the rifle is down (it goes down for the drill, comes back up after; lower: slung while both hands are busy -
    // a casualty in them, ngc/infdepth marinecare.js)
    const want = (st && st.phase !== 'recover') || lower ? 1 : 0;
    TV.k = clamp(TV.k + (want ? dt / 0.28 : -dt / 0.4), 0, 1);
    if (st && st.phase === 'recover') TV.k = Math.min(TV.k, 1 - st.p);
    // the spoon that flew
    if (flySpoon.visible) { fsV.y -= 9.8 * dt; flySpoon.position.addScaledVector(fsV, dt); flySpoon.rotation.z += fsW.v * dt; fsW.t -= dt; if (fsW.t <= 0) flySpoon.visible = false; }
    if (!st && TV.k <= 0) { held.visible = false; ringL.visible = false; return; }
    const k = sstep(TV.k), g = vm.model && vm.model.group;
    // the rifle: down and to the left, muzzle low (slung across the chest)
    if (g) {
      g.updateMatrix(); _m0.copy(g.matrix);
      g.position.x -= 0.1 * k; g.position.y -= 0.24 * k; g.position.z += 0.06 * k; g.rotateX(-0.8 * k); g.rotateY(0.5 * k); g.rotateZ(0.6 * k); g.updateMatrix(); g.updateMatrixWorld(true);
      // the hands viewmodel.js put on the rifle go down with it (the throw overrides them below)
      _md.multiplyMatrices(g.matrix, _m0.invert());
      for (const sd of ['L', 'R']) { const a = vm.arms[sd]; a.hand.updateMatrix(); _mh.multiplyMatrices(_md, a.hand.matrix); _mh.decompose(_hp2, _hq2, _hs2); setHand(sd, _hp2, _hq2); }
    }
    if (!st) { held.visible = false; ringL.visible = false; return; }   // (recovering: viewmodel.js's hands follow the gun)
    frag.visible = st.kind === 'frag'; smoke.visible = st.kind === 'smoke'; held.visible = st.phase !== 'recover' && !(st.phase === 'throw' && st.p > 0.5);
    if (st.kind === 'smoke' && st.smokeCol) smoke.userData.top.material.color.setRGB(...st.smokeCol);
    spoon.visible = st.phase !== 'cook' && !(st.phase === 'throw' && st.p > 0.5 && st.cooked);
    ring.visible = st.phase === 'draw' || (st.phase === 'pin' && st.p < 0.55);
    ringL.visible = st.phase === 'pin' && st.p >= 0.55 || st.phase === 'ready' || st.phase === 'cook';
    // the right hand along the drill
    const P = st.p, hp = _p, hq = _q;
    if (st.phase === 'draw') { if (P < 0.5) { hp.set(0.12, -0.2, -0.3); hq.identity(); pose(null, [hp.clone(), [0, 0, 0]], R.pouch, sstep(P / 0.5), hp, hq); } else pose(null, R.pouch, R.front, sstep((P - 0.5) / 0.5), hp, hq); }
    else if (st.phase === 'pin') pose(null, R.front, R.front, 0, hp, hq);
    else if (st.phase === 'ready' || st.phase === 'cook') { pose(null, R.front, st.under ? R.lowBack : R.cocked, sstep(clamp(P * 3, 0, 1)), hp, hq); if (st.phase === 'cook') hp.y += Math.sin(vm.t * 40) * 0.002; }
    else if (st.phase === 'throw') {
      if (st.under) pose(null, R.lowBack, R.lowOut, sstep(P), hp, hq);
      else if (P < 0.45) pose(null, R.cocked, R.over, sstep(P / 0.45), hp, hq);
      else if (P < 0.7) pose(null, R.over, R.out, sstep((P - 0.45) / 0.25), hp, hq);
      else pose(null, R.out, R.follow, sstep((P - 0.7) / 0.3), hp, hq);
    } else pose(null, R.follow, R.follow, 0, hp, hq);
    setHand('R', hp, hq);
    // the left hand: on the slung rifle, except to pull the pin (hooks the ring, pulls it out to the left, keeps it)
    if (st.phase === 'pin') {
      if (P < 0.55) { pose(null, [_gp.set(-0.1, -0.25, -0.28), [0, 0, 0]], L.ring, sstep(P / 0.55), hp, hq); }
      else pose(null, L.ring, L.pulled, sstep((P - 0.55) / 0.45), hp, hq);
      setHand('L', hp, hq);
    } else if (st.phase === 'ready' || st.phase === 'cook' || st.phase === 'throw') {
      // the off hand points at the target (the throwing stance), the ring still on a finger
      pose(null, L.pulled, [V3(-0.12, -0.02, -0.5), [0.1, -0.2, -0.3]], st.phase === 'throw' ? sstep(Math.min(1, P * 2)) * 0.5 + 0.5 : sstep(clamp(P * 2, 0, 1)), hp, hq);
      setHand('L', hp, hq);
    }
    // the release point (camera space) for the world grenade
    held.getWorldPosition(TV.rel);   // (vm.root is camera space)
  };
  // cooking: the spoon flies off the hand
  TV.spoon = () => { vm.arms.R.hand.updateMatrixWorld(true); spoon.getWorldPosition(flySpoon.position); flySpoon.visible = true; fsV.set(0.6, 1.4, 0.4); fsW.v = 22; fsW.t = 0.9; };
  return TV;
}
