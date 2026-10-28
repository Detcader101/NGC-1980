// NGC-1980 look-people: people for INSTANCED crowds (the flight-deck crew, townsfolk). The same smooth person as
// everywhere else (humanfig.js), baked in the rig's rest pose (arms down), with per-vertex LIMB WEIGHTS (aLimb: left
// arm, right arm, left leg, right leg, from the skin weights) so a vertex shader can swing the limbs about the
// shoulders and hips per instance and blend at the joints: one continuous body, no part seams, one draw call.
//   restPerson(role, o)       -> BufferGeometry (position, normal, color, aFig, aRM, aPaint, aLimb), feet at the origin, facing -z
//   LIMB_GLSL                 GLSL: lpLimbPos / lpLimbNor(p, aLimb, armX (aL, aR), armZ (aLz, aRz), legX (lL, lR))
//   patchLimbs(shader, mode)  inject into a material's vertex shader. mode 'pose': instanced attributes aArm (vec4:
//                             aL, aR, aLz, aRz) and aLeg (vec2: lL, lR); mode 'walk': from aWalk (phase, amplitude)
import * as THREE from 'three';
import { personGeometry, bakedPerson } from './humanfig.js';
import { BONE_INDEX } from './figgeo.js';

export const PIVOT = { shoulder: [0.19, 1.43, 0], hip: [0.095, 0.92, 0] };
const LIMBS = [['upperArmL', 'forearmL', 'handL'], ['upperArmR', 'forearmR', 'handR'], ['thighL', 'shinL', 'footL'], ['thighR', 'shinR', 'footR']].map(l => l.map(n => BONE_INDEX[n]));
const CACHE = new Map();
export function restPerson(role, o = {}) {
  const key = role + JSON.stringify(o);
  if (CACHE.has(key)) return CACHE.get(key);
  const g0 = personGeometry(role, { lod: 'crowd', hands: 'open', ...o });
  const si = g0.attributes.skinIndex, sw = g0.attributes.skinWeight, n = si.count, limb = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) { const b = si.getComponent(i, k), w = sw.getComponent(i, k); for (let l = 0; l < 4; l++) if (LIMBS[l].includes(b)) limb[i * 4 + l] += w; }
  const g = bakedPerson(g0, {});
  g.setAttribute('aLimb', new THREE.BufferAttribute(limb, 4));
  g.userData.tris = g.index.count / 3;
  CACHE.set(key, g); return g;
}
export const LIMB_GLSL = /* glsl */`
mat3 lpRotXZ(float a, float c) {   // Euler XYZ with y = 0: Rx(a) * Rz(c)
  float ca = cos(a), sa = sin(a), cc = cos(c), sc = sin(c);
  return mat3(cc, ca * sc, sa * sc,  -sc, ca * cc, sa * cc,  0.0, -sa, ca);
}
void lpLimbs(inout vec3 p, inout vec3 n, vec4 w, vec4 arm, vec2 leg) {
  float wb = clamp(1.0 - w.x - w.y - w.z - w.w, 0.0, 1.0);
  vec3 pp = p * wb, nn = n * wb, pv; mat3 R;
  pv = vec3(-${PIVOT.shoulder[0]}, ${PIVOT.shoulder[1]}, 0.0); R = lpRotXZ(arm.x, -arm.z); pp += w.x * (R * (p - pv) + pv); nn += w.x * (R * n);
  pv = vec3(${PIVOT.shoulder[0]}, ${PIVOT.shoulder[1]}, 0.0); R = lpRotXZ(arm.y, arm.w); pp += w.y * (R * (p - pv) + pv); nn += w.y * (R * n);
  pv = vec3(-${PIVOT.hip[0]}, ${PIVOT.hip[1]}, 0.0); R = lpRotXZ(leg.x, 0.0); pp += w.z * (R * (p - pv) + pv); nn += w.z * (R * n);
  pv = vec3(${PIVOT.hip[0]}, ${PIVOT.hip[1]}, 0.0); R = lpRotXZ(leg.y, 0.0); pp += w.w * (R * (p - pv) + pv); nn += w.w * (R * n);
  p = pp; n = normalize(nn);
}`;
// mode 'pose' (aArm, aLeg instanced) | 'walk' (aWalk: phase, amplitude)
export function patchLimbs(sh, mode = 'pose') {
  const decl = mode === 'pose' ? 'attribute vec4 aLimb; attribute vec4 aArm; attribute vec2 aLeg;' : 'attribute vec4 aLimb;';
  const angles = mode === 'pose' ? 'vec4 lpArm = aArm; vec2 lpLeg = aLeg;'
    : 'float lpS = sin(aWalk.x) * aWalk.y; vec2 lpLeg = vec2(lpS, -lpS); vec4 lpArm = vec4(-lpS * 0.8, lpS * 0.8, 0.06, 0.06);';
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\n' + decl + LIMB_GLSL)
    .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 lpP = position; {\n' + angles + '\nlpLimbs(lpP, objectNormal, aLimb, lpArm, lpLeg); }')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = lpP;');
}
