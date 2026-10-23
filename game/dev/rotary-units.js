// the aircraft the rotary preview knows: how to start each one's mission in the test world, its telemetry, a turntable
import * as THREE from 'three';
import { createCH46Unit } from '../js/units/air/rotary/ch46unit.js';
import { buildCH46Mesh } from '../js/units/air/rotary/ch46model.js';
import { createMV22Unit } from '../js/units/air/rotary/mv22unit.js';
import { buildMV22Mesh } from '../js/units/air/rotary/mv22model.js';

const f = (v, d = 0) => (+v).toFixed(d), deg = r => r * 180 / Math.PI;
const tab = rows => rows.map(([k, v]) => `${k.padEnd(11)} ${v}`).join('\n');
function turntableFor(build, groundY, anim) {
  return (scene, s) => {
    const m = build(); scene.add(m.group); m.group.position.set(0, 400, 0);
    const deck = new THREE.Mesh(new THREE.CircleGeometry(30, 48).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x3c4045 })); deck.position.set(0, 400 + groundY, 0); scene.add(deck);
    const grid = new THREE.GridHelper(60, 60, 0x667080, 0x50565e); grid.position.copy(deck.position).y += 0.01; scene.add(grid);
    const st = { nr: 1, ...anim, ...s };
    return { center: new THREE.Vector3(0, 401, 0), scale: 1, update(dt, t) { m.animate(st, dt, t); }, model: m, state: st };
  };
}
export const UNITS = {
  ch46: {
    label: 'CH-46E Sea Knight',
    mission(scene, W) {
      const U = createCH46Unit({ parent: scene, env: W.env, world: W.world, lz: () => W.lz(18), home: () => W.spot(-2, -2), pad: W.PAD, start: { ...W.spot(-2, -2), yaw: W.deck.yaw }, modex: 5 });
      return {
        U, chase: 32, focus: () => U.model.group, squadCenter: () => { const c = {}; return U.squad.center(c) ? c : null; }, vel: () => ({ x: U.S.body.vel[0], z: U.S.body.vel[2] }), done: () => !!U.parked || !!U.dead,
        update: (dt, t) => U.update(dt, t),
        telemetry(t) {
          const S = U.S, a = S.attitude({}), v = Math.hypot(S.body.vel[0], S.body.vel[2]);
          return `<b>CH-46E SEA KNIGHT</b>  HMM-261  13 Marines\n` + tab([
            ['time', f(t, 1) + ' s'], ['phase', `<b>${U.AI.phase}</b>`], ['ground spd', f(v * 1.944) + ' kt'], ['IAS', f(S.ias) + ' kt'], ['alt / AGL', `${f(S.body.pos[1])} / ${f(S.agl, 1)} m`],
            ['climb', f(S.vz * 196.85) + ' fpm'], ['pitch/roll', `${f(deg(a.pitch), 1)} / ${f(deg(a.roll), 1)} deg`], ['heading', f((360 - deg(a.yaw)) % 360) + ' deg'],
            ['collective', f(S.c.coll * 100) + ' %'], ['DCP stick', f(S.c.lon, 2) + ' (+aft)'], ['lat / ped', `${f(S.c.lat, 2)} / ${f(S.c.ped, 2)}`], ['LCT', f(deg(S.lct), 1) + ' deg'],
            ['NR', f(S.rpm * 100) + ' %'], ['torque', f(S.torque * 100) + ' %'], ['fwd / aft', `${f(S.rf.power / 745.7)} / ${f(S.ra.power / 745.7)} shp`], ['N1', `${f(S.eng[0].n1 * 100)} / ${f(S.eng[1].n1 * 100)} %`],
            ['dist LZ', U.AI.cmd.dist ? f(U.AI.cmd.dist) + ' m' : '-'], ['squad', `${U.squad.alive} alive, ${U.squad.holding} holding`], ['ramp', f(U.ramp * 100) + ' %'],
          ]);
        },
      };
    },
    turntable: turntableFor(() => buildCH46Mesh({ modex: 5 }), -1.8, { F: { tx: 0, ty: 0 }, A: { tx: 0, ty: 0 }, ramp: 1, run: true, n1: 0.9 }),
  },
  mv22: {
    label: 'MV-22B Osprey (RUNAWAY)',
    mission(scene, W) {
      const lz = { ...W.lz(18), x: W.PAD.x - 18, hdg: Math.PI / 2 };
      const U = createMV22Unit({ parent: scene, env: W.env, world: W.world, lz: () => lz, home: () => W.krakenSpot(-1, -36), pad: W.PAD, start: { ...W.krakenSpot(-1, -36), yaw: W.kraken.yaw }, squad: 12 });
      return {
        U, chase: 40, focus: () => U.model.group, homeDeck: () => W.kraken, squadCenter: () => { const c = {}; return U.squad.center(c) ? c : null; }, vel: () => ({ x: U.S.body.vel[0], z: U.S.body.vel[2] }), done: () => !!U.parked || !!U.dead,
        update: (dt, t) => U.update(dt, t),
        telemetry(t) {
          const S = U.S, a = S.attitude({}), v = Math.hypot(S.body.vel[0], S.body.vel[2]), cor = S.corridor(S.nac * 180 / Math.PI);
          const mode = S.nac > 80 * Math.PI / 180 ? 'HELICOPTER' : S.nac < 3 * Math.PI / 180 ? 'AIRPLANE' : 'CONVERSION';
          return `<b>MV-22B OSPREY</b>  RUNAWAY refit  12 machine troopers\n` + tab([
            ['time', f(t, 1) + ' s'], ['phase', `<b>${U.AI.phase}</b>`], ['mode', `<b>${mode}</b>`], ['nacelles', `${f(deg(S.nac))} deg (cmd ${f(U.P.nacT)})`], ['corridor', `${f(Math.max(0, cor.min))} - ${f(cor.max)} KIAS`],
            ['KIAS', f(S.ias)], ['ground spd', f(v * 1.944) + ' kt'], ['alt / AGL', `${f(S.body.pos[1])} / ${f(S.agl, 1)} m`], ['climb', f(S.body.vel[1] * 196.85) + ' fpm'],
            ['pitch/roll', `${f(deg(a.pitch), 1)} / ${f(deg(a.roll), 1)} deg`], ['alpha', f(deg(S.alpha), 1) + ' deg'], ['TCL', f(S.c.tcl * 100) + ' %'], ['stick', `${f(S.c.lon, 2)} / ${f(S.c.lat, 2)} ped ${f(S.c.ped, 2)}`],
            ['rotor rpm', f(S.rpm * 412) + (S.kH < 0.5 ? ' (prop gov)' : ' (eng gov)')], ['power', f(S.power / 745.7) + ' shp'], ['wing lift', f(S.wingL / 1000) + ' kN'], ['gear / flaps', `${S.gear > 0.5 ? 'DOWN' : 'UP'} / ${f(S.flap * 100)}%`],
            ['heli loops', f(U.P.k * 100) + ' %'], ['dist LZ', U.AI.cmd.dist ? f(U.AI.cmd.dist) + ' m' : '-'], ['squad', `${U.squad.alive} alive, ${U.squad.holding} holding`], ['fold', f(U.fold * 100) + ' %'],
          ]);
        },
      };
    },
    turntable: turntableFor(() => buildMV22Mesh(), -2.22, { nac: Math.PI / 2, tR: { tx: 0, ty: 0 }, tL: { tx: 0, ty: 0 }, gear: 1, ramp: 1, flap: 1, fold: 0 }),
  },
};
