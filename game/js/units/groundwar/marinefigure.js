// THE GROUND WAR: the 1980 Marine figure for squads and crowds. INFANTRY's soldier model (units/infantry/
// soldiermodel.js: the shared skeleton, the procedural poser, the Marine in ERDL with M1 helmet, flak vest and ALICE
// gear) behind the rotary module's FIGURES contract, so the CH-46's cabin, the ramp and the fight all show the same
// man. A cheap stand-in (the rotary module's 6-mesh figure) takes over in the distance.
//
//   FIGURES.marine(opts) -> { group, pose(state, phase, dt) }                    (the rotary contract: squad.js)
//     + poseFull(p, dt)   p = { stance, stanceFrom, stanceTo, stanceT, speed, gaitPhase, aimPitch, down, cls, ads }
//     + setDetail(level)  'full' (one LOD body + weapon) | 'lite' (6 meshes) | 'off'
//     + setWeapon(key)    'M16A1' | 'M16A1/M203' | 'M72A2' | null
import * as THREE from 'three';
import { buildMarine as buildSoldier, poseSkeleton, makePose } from '../infantry/soldiermodel.js';
import { buildMarine as buildLite } from '../air/rotary/figures.js';

export function buildMarineFigure(o = {}) {
  const seed = o.variant ?? o.seed ?? Math.floor(Math.random() * 999);
  const group = new THREE.Group(); group.name = 'marine';
  let sk = null;   // the full skeleton is built on first use (a CH-46 full of men that never get out costs nothing)
  const lite = buildLite({ variant: seed }); lite.group.scale.setScalar(1); group.add(lite.group);
  let level = 'lite', weapon = o.weapon === undefined ? 'M16A1' : o.weapon;
  const defaults=makePose({cls:'rifle'});
  /** @type {ReturnType<typeof makePose> & {hands?: {L?: number[], R?: number[], spine?: number[], chest?: number[], dy?: number, stand?: boolean} | null, sling?: number, climb?: number | null, swim?: {ph: number, speed: number} | null, action?: {name: string, p: number} | null, down?: boolean, seat?: boolean, grenade?: boolean}} */
  const P={...defaults};
  const ensure = () => { if (!sk) { sk = buildSoldier({ camo: seed % 5 === 4 ? 'og107' : 'erdl', seed: seed + 1, weapon, detail: 'low' }); group.add(sk.root); sk.root.visible = level === 'full'; } return sk; };
  const F = {
    group,
    get skeleton() { return sk; },
    setDetail(l) {
      if (l === level) return; level = l;
      if (l === 'full') ensure();
      if (sk) sk.root.visible = l === 'full';
      lite.group.visible = l === 'lite';
    },
    setWeapon(key) { if (key === weapon) return; weapon = key; if (sk) sk.setWeapon(key); },
    // the rotary contract: 'run' | 'walk' | 'stand' | 'kneel' | 'aim' | 'fall' | 'dead' | 'seated'
    pose(state, ph = 0, dt = 0.016) {
      lite.pose(state, ph);
      if (level !== 'full') return;
      Object.assign(P,defaults);P.hands=null;P.sling=0;P.climb=null;P.swim=null;
      P.down = state === 'fall' || state === 'dead'; P.stanceT = 1; P.seat = state === 'seated';   // (ngc/marine-polish: seated on the troop seat, rifle between the knees)
      P.stance = P.stanceFrom = P.stanceTo = state === 'kneel' || state === 'aim' ? 'crouch' : 'stand';
      P.speed = state === 'run' ? 2.7 : state === 'walk' ? 1.4 : 0; P.gaitPhase = ph; P.gait = state === 'run' ? 'run' : state === 'walk' ? 'walk' : 'idle';P.moveF=P.speed;
      P.ads = state === 'aim' ? 1 : 0; P.aimPitch = 0;
      poseSkeleton(ensure(), P, dt);
    },
    poseFull(p, dt = 0.016) {
      if (level === 'lite') {   // map to the stand-in's few states
        const st = p.down ? 'dead' : p.seat ? 'seated' : p.stance === 'prone' ? 'prone' : p.stance === 'crouch' ? (p.ads>.5?'aim':'kneel') : p.speed > 2 ? 'run' : p.speed > 0.3 ? 'walk' : 'stand';
        lite.pose(st, p.down ? 1 : p.gaitPhase || 0);
        return;
      }
      if (level !== 'full') return;
      Object.assign(P,defaults,p);P.stanceFrom=p.stanceFrom??P.stance;P.stanceTo=p.stanceTo??P.stance;P.hands=p.hands||null;P.sling=p.sling||0;P.action=p.action||null;P.down=!!p.down;P.seat=!!p.seat;P.climb=p.climb??null;P.swim=p.swim||null;P.grenade=!!p.grenade;
      poseSkeleton(ensure(), P, dt);
    },
  };
  F.setDetail(o.detail || 'lite');
  return F;
}
