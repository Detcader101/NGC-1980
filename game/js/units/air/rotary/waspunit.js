// waspunit.js - one RW-3 WASP: ducted-fan flight model + pilot.js hands + waspai.js mind + the model. The weapon is a
// callback (o.fire(from, dir)): the war fires its game-level rounds, the dev page draws its own.
//   o: { parent, env, world (groundY, floorAlong, los), start: {x, y, z, yaw}, home: [x, z], id, slot, slots, fire(p, d) }
import * as THREE from 'three';
import { createWaspSim, WASP } from './waspfm.js';
import { createPilot, stateOf } from './pilot.js';
import { createWaspAI, WASP_PILOT, waspTiltLimit } from './waspai.js';
import { buildWaspMesh } from './waspmodel.js';
import { clamp } from './rb.js';
import { mergeUnit } from '../../../renderkit/merge.js';   // ngc/perf-render

const _p = new THREE.Vector3(), _d = new THREE.Vector3(), _aim = new THREE.Vector3();
export function createWaspUnit(o) {
  const S = createWaspSim(), P = createPilot(WASP_PILOT), st = {}, me = {};
  S.reset([o.start.x, o.start.y, o.start.z], o.start.yaw ?? 0, false); S.power = 0.6 * WASP.P_MAX; P.reset(0.6);
  const model = buildWaspMesh(); o.parent.add(model.group); mergeUnit(model.group, [model], { name: 'wasp' });   // ngc/perf-render: static parts one draw per material per rigid frame (every handle kept)
  const AI = createWaspAI({ id: o.id ?? Math.random(), slot: o.slot ?? 0, slots: o.slots ?? 1, home: o.home });
  const U = { S, P, AI, model, dead: false, cd: Math.random() * 2, burst: 0, firing: 0, target: null };
  const animS = { fan: 0.6, pitch: 0, roll: 0, aim: null, firing: false, gear: 0, alert: 0 };
  // tgt: { x, y, z, vx, vy, vz } | null; ctx: { time, reach, ambush, peace }
  U.update = (dt, time, tgt, ctx = {}) => {
    U.target = tgt;
    const nS = Math.max(1, Math.ceil(dt * 30 - 1e-6)); const h = dt / nS;   // the pilot works at >= 30 Hz however long the frame
    for (let i = 0; i < nS && !U.dead; i++) {
      stateOf(S.body, st); me.x = st.x; me.y = st.y; me.z = st.z; me.vx = st.vx; me.vy = st.vy; me.vz = st.vz; me.yaw = st.yaw;
      const los = tgt ? o.world.los(st.x, st.y, st.z, tgt.x, tgt.y + 1, tgt.z) : false;
      const cmd = AI.step(me, tgt, h, o.world, { ...ctx, time, los });
      cmd.tilt = waspTiltLimit(S, st, cmd); const c = P.step(st, h, cmd);
      U.ev = S.step(h, { thr: c.coll, pitch: c.lon, roll: c.lat, yaw: c.ped }, o.env);
      if (S.dead) U.dead = S.dead;
      // the weapon: bursts of three pulses, game level (the war decides what a hit does)
      U.cd -= h; U.firing = Math.max(0, U.firing - h);
      if (AI.fire && los && !ctx.peace && U.cd <= 0 && tgt) {
        model.group.updateMatrixWorld(); _p.copy(model.MUZZLE); model.group.localToWorld(_p);
        const d = Math.hypot(tgt.x - _p.x, tgt.y - _p.y, tgt.z - _p.z), t = d / (o.speed ?? 90);
        _d.set(tgt.x + (tgt.vx || 0) * t - _p.x, tgt.y + 0.5 + (tgt.vy || 0) * t - _p.y, tgt.z + (tgt.vz || 0) * t - _p.z).normalize();
        if (o.fire) o.fire(_p, _d, U);
        U.burst++; U.firing = 0.15; U.cd = U.burst % 3 ? 0.16 : (ctx.burstGap ?? 2.2) + Math.random() * 0.8;
      }
    }
    // model
    const b = S.body, g = model.group;
    g.position.set(b.pos[0], b.pos[1], b.pos[2]); g.quaternion.set(b.q[0], b.q[1], b.q[2], b.q[3]);
    animS.fan = S.power / WASP.P_MAX; animS.pitch = S.c.pitch ?? P.ctl.lon; animS.roll = P.ctl.lat; animS.firing = U.firing > 0;
    animS.alert = tgt ? Math.min(1, (animS.alert || 0) + dt) : Math.max(0, (animS.alert || 0) - dt * 0.3);
    if (tgt) { _aim.set(tgt.x - b.pos[0], tgt.y - b.pos[1], tgt.z - b.pos[2]); animS.aim = _aim; } else animS.aim = null;
    animS.gear = clamp(1 - S.agl / 3, 0, 1);
    model.animate(animS, dt, time);
  };
  U.dispose = () => o.parent.remove(model.group);
  return U;
}
