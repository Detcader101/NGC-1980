// ch46troops.js - the Marines in the back of the PLAYER's CH-46: a stick of 13 boards by the ramp on the ALBATROSS or
// at a friendly pad (the two files wait clear of the rotors, embark.js's layout, and file up the ramp on the troop
// handler's call), rides in the red troop seats, and comes off by the ramp at a landing zone, where the ground war
// takes them over (groundwar.js GW.landing: the same hand-off as the AI Sea Knights' Marines). Counting is in the
// flight host (P.marines, the payload); the figures are squad.js's.
//   const TR = createCH46Troops({ parent, P (ch46play.js), model (ch46model.js), groundY(x, z), onDeployed(Q, n) -> true when
//              something else (the ground war) now updates the squad })
//   TR.board(n) -> '' | why;  TR.dismount(I) -> '' | why;  TR.update(dt, time);  TR.lost();  TR.state: empty | boarding | aboard | deploying
import * as THREE from 'three';
import { createSquad, padSlots } from './squad.js';

// where the stick waits and the way in (aircraft frame: x right, z aft; from embark.js's ch46 layout), the seats
const MUSTER = [-12.5, 6], CABIN = [[0, -0.95, 3.9], [0.3, -0.95, 1.0], [0.45, -0.95, -3.2]];
const SEATS = []; for (let i = 0; i < 13; i++) { const s = i % 2 ? -1 : 1, k = Math.floor(i / 2); SEATS.push({ at: [s * 0.8, -0.95, -3.55 + k * 0.95], yaw: s > 0 ? Math.PI / 2 : -Math.PI / 2 }); }   // (= interiors/seats.js CH46_SQUAD)

export function createCH46Troops(o) {
  const { P, model } = o, g = model.group, E = model.RAMP_END;
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0);
  const TR = { state: 'empty', Q: null, lastSquad: null, own: [], n: 0 };
  const toWorld = (x, y, z, out) => { _v.set(x, y, z); g.localToWorld(_v); out.x = _v.x; out.y = _v.y; out.z = _v.z; return out; };
  const yaw = () => _e.setFromQuaternion(g.quaternion, 'YXZ').y;
  const L = (x, y, z) => { _v.set(x, y, z); g.localToWorld(_v); return { x: _v.x, y: _v.y, z: _v.z }; };
  const newSquad = n => { const Q = createSquad({ parent: o.parent, side: 1, n, kind: 'marine', groundY: o.groundY }); TR.own.push(Q); return Q; };

  TR.board = (n = 13) => {
    if (TR.state !== 'empty') return TR.state === 'aboard' ? `${P.marines} MARINES ALREADY ABOARD` : 'THE TROOPS ARE STILL MOVING';
    if (!P.S.landed || P.S.body.contacts < 3) return 'ON THE WHEELS FIRST';
    if (P.ramp < 0.9) return 'LOWER THE RAMP FIRST (R)';
    g.updateMatrixWorld(true);
    const Q = TR.Q = newSquad(n), rows = Math.ceil(n / 2), stick = [];
    const mx = E.x + MUSTER[0], mz = E.z + MUSTER[1], gy = E.y;
    const face = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));
    for (let i = 0; i < n; i++) { const x = mx - (i % 2) * 1.5, z = mz + Math.floor(i / 2) * 1.3; stick.push({ x, y: gy, z, yaw: face(x, z, E.x, E.z), g: true }); }
    const path = [{ x: E.x - 2.5, y: gy, z: E.z + 3, g: true }, { x: E.x, y: gy, z: E.z + 1.0, g: true }, { x: E.x, y: E.y + 0.05, z: E.z }, ...CABIN.map(([x, y, z]) => ({ x, y, z }))];
    Q.stick(stick.slice(0, rows * 2), path, toWorld, yaw);
    TR.state = 'boarding'; TR.n = n; TR.callT = 2.5;   // the stick kneels in its files; the troop handler calls them in a moment
    return '';
  };
  // I: { name, pad: { x, z } } the island (the LZ is wherever the aircraft sits)
  TR.dismount = (I) => {
    if (TR.state !== 'aboard' || P.marines <= 0) return 'NO TROOPS ABOARD';
    if (!P.S.landed || P.S.body.contacts < 3) return 'ON THE WHEELS FIRST';
    if (P.ramp < 0.9) return 'LOWER THE RAMP FIRST (R)';
    const Q = TR.Q; g.updateMatrixWorld(true);
    // the dead (cabin hits) stay aboard: only the living file out
    let alive = P.marines; for (const F of Q.figs) if (F.st === 'aboard') { if (alive > 0) alive--; else { F.st = 'gone'; F.f.group.visible = false; } }
    const path = [L(0.3, -0.95, 1.0), L(0, -0.95, 3.9), L(E.x, E.y + 0.05, E.z), L(E.x, E.y, E.z + 1.2)];
    path[3].y = o.groundY(path[3].x, path[3].z); path[2].y = Math.max(path[2].y, o.groundY(path[2].x, path[2].z));
    const behind = L(0, 0, E.z + 14), a0 = Math.atan2(P.S.body.pos[2] - behind.z, P.S.body.pos[0] - behind.x);
    Q.deploy(path, padSlots(behind.x, behind.z, Q.figs.length, 5, 8.5, a0));
    TR.state = 'deploying'; TR.island = I;
    const n = Q.figs.filter(F => F.st === 'queue').length;
    TR.external = !!(o.onDeployed && o.onDeployed(Q, n, I));
    if (TR.external) TR.own.splice(TR.own.indexOf(Q), 1);
    return '';
  };
  // the aircraft is lost: whoever is aboard (or still on the ramp) dies with it
  TR.lost = () => { if (TR.Q && TR.state !== 'deploying') { TR.Q.killAll(); } P.marines = 0; TR.state = 'empty'; TR.Q = null; };
  TR.reset = () => { for (const Q of TR.own) Q.dispose(); TR.own.length = 0; TR.Q = null; TR.lastSquad = null; TR.state = 'empty'; P.marines = 0; };
  TR.update = (dt, time) => {
    const Q = TR.Q;
    for (const S of TR.own) S.update(dt, time);   // (a deployed squad the ground war took is updated there)
    if (!Q) return;
    if (TR.state === 'boarding') {
      if (TR.callT > 0 && (TR.callT -= dt) <= 0) Q.embark(0.45);
      P.marines = Q.figs.filter(F => F.st === 'aboard').length;
      if (Q.boarded) TR.state = 'aboard';
      if (P.rampCmd < 0.5 && !Q.boarded) { Q.boardNow(); TR.state = 'aboard'; P.marines = Q.figs.filter(F => F.st === 'aboard').length; }   // ramp up mid-load: the rest jump in
    }
    if (TR.state === 'deploying') {
      P.marines = Q.figs.filter(F => F.st === 'aboard' || F.st === 'queue').length;
      if (!P.marines) { TR.state = 'empty'; TR.lastSquad = Q; TR.Q = null; return; }
    }
    // seated: the living in the red troop seats, facing across the cabin
    if (TR.state === 'aboard' || TR.state === 'boarding' || TR.state === 'deploying') {
      g.updateMatrixWorld(true); g.getWorldQuaternion(_q); let k = 0;
      for (const F of Q.figs) {
        if (F.st !== 'aboard') { k++; continue; }
        const s = SEATS[k++ % SEATS.length], G = F.f.group;
        _v.set(s.at[0], s.at[1], s.at[2]); g.localToWorld(_v); if (G.parent) G.parent.worldToLocal(_v);
        G.position.copy(_v); G.quaternion.copy(_q).multiply(_q2.setFromAxisAngle(UP, s.yaw)); F.f.pose('seated', 0); G.visible = true;
      }
    }
  };
  return TR;
}
