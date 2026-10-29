// Authored presentation sockets. Weapon anchors remain gameplay/model contracts; these offsets orient the
// anatomical hand frame (grip Y, wrist +Z, back +/-X) around the actual furniture, in metres.
import * as THREE from 'three';
const frame = (back, thumb) => {
  const x = new THREE.Vector3(...back).normalize(), y = new THREE.Vector3(...thumb).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize(); y.crossVectors(z, x);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
};
const underL = frame([0,1,0],[-0.65,0,-0.76]);
const underR = frame([0,-1,0],[0.65,0,-0.76]);
const grip = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3,0,0));
const socket = (rotation, offset, gripR, trigger=false, thumb='wrap') => ({rotation,offset,gripR,trigger,thumb});
const rifle = socket(underL,[0,0,0.055],0.028);
const rifleGL = socket(underL,[0,-0.058,0.020],0.029,false,'m203');
const mg = socket(underL,[0,0.045,0.105],0.033);
const pistol = socket(grip,[0.012,-0.008,-0.018],0.030);
const lawL = socket(underL,[0.028,0.01,0.055],0.041,false,'law');
const lawR = socket(underR,[-0.028,0,0.09],0.041,false,'law');
export function handSocket(key, side, anchor, hasLauncher=false) {
  if (anchor === 'fore' && side === 'L') {
    if (key === 'M16A1') return hasLauncher ? rifleGL : rifle;
    if (key === 'M60') return mg;
    if (key === 'M1911A1') return pistol;
    if (key === 'M72A2') return lawL;
  }
  if (key === 'M72A2' && side === 'R' && anchor === 'grip') return lawR;
  return null;
}
