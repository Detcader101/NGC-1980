// SEALIFE: how the sea's life is drawn (geometry and shaders; sealife.js owns the meshes and feeds them).
//
// Every body - fish, dolphin, ray, jellyfish, seabird - goes through one rule for where it is against the live sea:
// each instance carries the drawn surface's height over it (fishsim / seabirds write it), so a vertex
//   - above that surface (a leaping mullet, a gliding flying fish, a dolphin's back and fin, a gannet in the air) is
//     drawn like anything in the air: real depth, the air's fog;
//   - below it, with the camera above water, is seen THROUGH the water: red lost first along the light's path down
//     and back up (Pope & Fry 1997 absorption, SEA_EXT), the surface's Fresnel reflection over it, and drawn at the
//     depth of the point where the eye's ray crosses the surface (so the opaque sea does not hide it) - pulled a hair
//     towards the eye in VIEW space and ordered by how far down it is (a dolphin's far flipper stays behind its body,
//     and nothing under water shows through a hull above the water);
//   - with the camera under water, fogged with the water like the sea bed.
import * as THREE from 'three';
import { SEA_EXT_GLSL, SEA_NOISE_GLSL } from './seasurface.js';
import { SPECIES, SUB_GLSL } from './fishsim.js';
import { BIRD_SPECIES } from './seabirds.js';

const TAU = Math.PI * 2;
export const NSP = SPECIES.length;

// ---------------------------------------------------------------------------------------------- shared GLSL
const VIEW_GLSL = `
  ${SEA_EXT_GLSL}
  uniform vec4 uUW;      // (camera under water 0/1, -, turbidity 1/m, -)
  uniform vec4 uFogP;    // (fog near, fog far) for the side the camera is on
  uniform vec3 uFogC, uSunD;
  uniform float uTime;
  varying vec3 vCol; varying float vA;
  vec3 rotP(vec3 p, float yaw, float pitch, float roll){
    float c=cos(roll), s=sin(roll); p=vec3(c*p.x-s*p.y, s*p.x+c*p.y, p.z);
    c=cos(-pitch); s=sin(-pitch); p=vec3(p.x, c*p.y-s*p.z, s*p.y+c*p.z);
    c=cos(yaw); s=sin(yaw); return vec3(c*p.x+s*p.z, p.y, -s*p.x+c*p.z);
  }
  void waterView(vec3 wp, vec3 col, float top, float a){
    vec4 clip=projectionMatrix*viewMatrix*vec4(wp,1.);
    float dist=length(cameraPosition-wp), cy=cameraPosition.y;
    vA=a;
    if(uUW.x>.5){                       // the camera under water
      vCol=mix(col,uFogC,smoothstep(uFogP.x,uFogP.y,dist));
      if(wp.y>top) vCol=mix(vCol,uFogC,.3);
    } else if(wp.y>=top||cy<top){       // in the air (or the camera is down in a trough: just draw it)
      vCol=mix(col,uFogC,smoothstep(uFogP.x,uFogP.y,dist));
    } else {                            // seen from above, through the surface
      vec3 ray=wp-cameraPosition;
      float tp=min(top+.03,cy-.02), tt=clamp((cy-tp)/max(cy-wp.y,1e-3),0.,1.);
      vec3 sp3=cameraPosition+ray*tt; float path=length(wp-sp3);
      vec3 T=exp(-(SEA_EXT+uUW.z)*path);
      float ca=clamp((cy-wp.y)/max(dist,1e-3),0.,1.), fres=.02+.98*pow(1.-ca,5.);
      vCol=col*T/max(dot(T,vec3(.33)),.05);
      vA*=clamp(dot(T,vec3(.2,.5,.3))*1.15,0.,1.)*(1.-fres)*(1.-smoothstep(uFogP.x,uFogP.y,dist));
      vec4 vs=viewMatrix*vec4(sp3,1.); vs.xyz*=1.-.002-.004*(1.-clamp(path/30.,0.,1.));
      vec4 cs=projectionMatrix*vs; clip.z=(cs.z/cs.w)*clip.w;
    }
    gl_Position=clip;
  }
  // light: dimmer and bluer with depth under the local top; plain sun and sky above it
  vec3 lightAt(vec3 wp, float top){ return wp.y<top?exp(-(SEA_EXT+uUW.z)*(top-wp.y)*1.3):vec3(1.); }`;
const FRAG = `
  varying vec3 vCol; varying float vA;
  void main(){ if(vA<.01) discard; gl_FragColor=vec4(vCol,vA); }`;
export function viewUniforms() {
  return { uUW: { value: new THREE.Vector4(0, 0, 0.05, 0) }, uFogP: { value: new THREE.Vector4(125, 250, 0, 0) }, uFogC: { value: new THREE.Color() }, uSunD: { value: new THREE.Vector3(0.5, 1, 0.3) }, uTime: { value: 0 } };
}

// ---------------------------------------------------------------------------------------------- the fish body
// Unit length along +z (nose at +0.5), stations from the caudal peduncle to the snout: (s 0 tail tip .. 1 nose, half
// height, half width), a fusiform (mackerel-like) profile, scaled per species in the shader. aFin: 0 body, 1 tail,
// 2 dorsal, 3 pectorals (aWing: where a pectoral vertex goes when the fin is spread as a flying fish's wing).
const STATIONS = [[0.12, 0.022, 0.012], [0.24, 0.05, 0.028], [0.42, 0.088, 0.052], [0.6, 0.1, 0.06], [0.76, 0.09, 0.055], [0.89, 0.06, 0.04]];
const RING = 6;
function fishGeometry() {
  const P = [], N = [], S = [], T = [], F = [], W = [], I = [];
  const v = (x, y, z, nx, ny, nz, s, tone, fin, w = [x, y, z]) => { P.push(x, y, z); N.push(nx, ny, nz); S.push(s); T.push(tone); F.push(fin); W.push(...w); return P.length / 3 - 1; };
  const rings = STATIONS.map(([s, hh, hw]) => {
    const r = [];
    for (let k = 0; k < RING; k++) {
      const a = k / RING * TAU, sy = Math.cos(a), sx = Math.sin(a), nl = Math.hypot(sx / hw, sy / hh);
      r.push(v(sx * hw, sy * hh, s - 0.5, sx / hw / nl, sy / hh / nl, 0, s, 0.5 + 0.5 * sy, 0));
    }
    return r;
  });
  for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < RING; k++) { const a = rings[i][k], b = rings[i][(k + 1) % RING], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % RING]; I.push(a, c, b, b, c, d); }
  const nose = v(0, -0.008, 0.5, 0, 0, 1, 1, 0.5, 0), last = rings[rings.length - 1];
  for (let k = 0; k < RING; k++) I.push(last[k], nose, last[(k + 1) % RING]);
  // tail fin (forked): peduncle top / bottom, the two lobe tips, the fork
  const pt = v(0, 0.022, -0.38, 1, 0, 0, 0.12, 0.8, 1), pb = v(0, -0.022, -0.38, 1, 0, 0, 0.12, 0.8, 1);
  const tt = v(0, 0.13, -0.535, 1, 0, 0, 0, 0.8, 1), tb = v(0, -0.13, -0.535, 1, 0, 0, 0, 0.8, 1), fk = v(0, 0, -0.455, 1, 0, 0, 0.05, 0.8, 1);
  I.push(pt, tt, fk, pb, fk, tb, pt, fk, pb);
  // first dorsal fin
  const d0 = v(0, 0.092, 0.02, 1, 0, 0, 0.52, 0.95, 2), d1 = v(0, 0.088, 0.16, 1, 0, 0, 0.66, 0.95, 2), dp = v(0, 0.16, 0.06, 1, 0, 0, 0.56, 0.95, 2);
  I.push(d0, dp, d1);
  // pectoral fins (small, flat, angled out and down) - or a flying fish's wings (long, out to ~0.45 L each side)
  for (const sd of [-1, 1]) {
    const a = v(sd * 0.05, -0.03, 0.22, 0, -1, 0, 0.72, 0.4, 3, [sd * 0.05, 0.01, 0.24]), b = v(sd * 0.05, -0.035, 0.3, 0, -1, 0, 0.8, 0.4, 3, [sd * 0.08, 0.02, 0.3]);
    const c = v(sd * 0.12, -0.07, 0.17, 0, -1, 0, 0.67, 0.4, 3, [sd * 0.46, 0.04, -0.06]), e = v(sd * 0.09, -0.06, 0.18, 0, -1, 0, 0.68, 0.4, 3, [sd * 0.3, 0.03, -0.14]);
    I.push(a, b, c, a, c, e);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 1)); g.setAttribute('aTone', new THREE.Float32BufferAttribute(T, 1)); g.setAttribute('aFin', new THREE.Float32BufferAttribute(F, 1));
  g.setAttribute('aWing', new THREE.Float32BufferAttribute(W, 3));
  g.setIndex(I);
  return g;
}
// per species (fishsim.js SPECIES order): shape (height, width, tail span, dorsal), tail lobes (upper, lower), back /
// flank / belly / fin colours, marks (x mackerel bars, y mullet lines, z amberjack stripe, w: 1 bonito's oblique
// stripes, 2 sea bream's bands, 3 flying fish's dark wings, 4 shark's pale fin tips)
const LOOK = {
  sardine: { shape: [0.85, 0.72, 0.95, 0.75], tail: [1, 1], back: 0x1f4f63, side: 0xa8b6c0, belly: 0xe6ecf0, fin: 0x6c7a80, mark: [0, 0, 0, 0] },
  mackerel: { shape: [0.82, 0.8, 1.15, 0.9], tail: [1, 1], back: 0x1b4f4a, side: 0x98aeb2, belly: 0xe2e6e6, fin: 0x52605e, mark: [1, 0, 0, 0] },
  mullet: { shape: [1.0, 0.95, 0.85, 1.0], tail: [1, 1], back: 0x46504f, side: 0x9aa0a0, belly: 0xd8dad4, fin: 0x5c6260, mark: [0, 1, 0, 0] },
  amberjack: { shape: [1.12, 0.8, 1.3, 0.9], tail: [1, 1], back: 0x4a4650, side: 0xa3a39e, belly: 0xd8d5cc, fin: 0x8c7a42, mark: [0, 0, 1, 0] },
  bonito: { shape: [0.98, 0.9, 1.35, 0.85], tail: [1, 1], back: 0x1d3a5a, side: 0xa6b2bc, belly: 0xe8ecee, fin: 0x3a4a58, mark: [0, 0, 0, 1] },
  flyingfish: { shape: [0.72, 0.72, 1.15, 0.55], tail: [0.8, 1.35], back: 0x1c3a72, side: 0x9cb0cc, belly: 0xeef2f6, fin: 0x55708e, mark: [0, 0, 0, 3] },
  bream: { shape: [1.55, 0.7, 1.05, 1.25], tail: [1, 1], back: 0x6a7078, side: 0xbcc0c4, belly: 0xe2e2de, fin: 0x6a6a62, mark: [0, 0, 0, 2] },
  damsel: { shape: [1.35, 0.75, 1.25, 1.2], tail: [1.1, 1.1], back: 0x2e2622, side: 0x483a32, belly: 0x6a5a4e, fin: 0x2c241e, mark: [0, 0, 0, 0] },
  shark: { shape: [0.68, 0.78, 1.55, 1.7], tail: [1.45, 0.55], back: 0x6e6c62, side: 0x8e8c84, belly: 0xe2e0d8, fin: 0x63615a, mark: [0, 0, 0, 4] },
  ray: { shape: [1, 1, 1, 1], tail: [1, 1], back: 0x5a4a32, side: 0x5a4a32, belly: 0xe8e4dc, fin: 0x5a4a32, mark: [0, 0, 0, 0] },
  jelly: { shape: [1, 1, 1, 1], tail: [1, 1], back: 0xe4eaee, side: 0xe4eaee, belly: 0xe4eaee, fin: 0x5a4a9a, mark: [0, 0, 0, 0] },
  dolphin: { shape: [1, 1, 1, 1], tail: [1, 1], back: 0x2a2e36, side: 0x9a9ea4, belly: 0xeeeeea, fin: 0x2a2e36, mark: [0, 0, 0, 0] },
};
export function fishUniforms() {
  const looks = SPECIES.map(s => LOOK[s.key]), c = h => new THREE.Color(h);
  return {
    ...viewUniforms(),
    uShape: { value: looks.map(l => new THREE.Vector4(...l.shape)) }, uMark: { value: looks.map(l => new THREE.Vector4(...l.mark)) }, uTail: { value: looks.map(l => new THREE.Vector2(...l.tail)) },
    uBack: { value: looks.map(l => c(l.back)) }, uSide: { value: looks.map(l => c(l.side)) }, uBelly: { value: looks.map(l => c(l.belly)) }, uFinC: { value: looks.map(l => c(l.fin)) },
  };
}
const FISH_VS = sub => `
  ${VIEW_GLSL}
  ${sub ? SUB_GLSL : ''}
  attribute vec4 iA, iB, iC, iD; attribute float aS, aTone, aFin; attribute vec3 aWing;
  ${sub ? 'attribute float iK;' : ''}
  uniform vec4 uShape[${NSP}], uMark[${NSP}]; uniform vec2 uTail[${NSP}]; uniform vec3 uBack[${NSP}], uSide[${NSP}], uBelly[${NSP}], uFinC[${NSP}];
  void main(){
    int sp=int(iB.w+.5); vec4 sh=uShape[sp]; vec2 tl=uTail[sp];
    vec3 base=iA.xyz; float L=iA.w, ph=iC.x, yaw=iB.x;
    ${sub ? `
    vec4 so=subOffset(iD.z,iK); float spread=L*(1.+.6*iD.y);
    ph+=so.w; yaw+=sin(uTime*(.6+iD.z)+so.w)*.07;                      // a little life of its own
    base+=rotP(so.xyz*spread,iB.x,iB.y,0.); L*=.9+.2*fract(so.w*7.);` : ''}
    vec3 p=position, nrm=normal;
    if(aFin>.5&&aFin<1.5) p.y*=sh.z*(p.y>0.?tl.x:tl.y); else { p.y*=sh.x; p.x*=sh.y; if(aFin>1.5&&aFin<2.5) p.y+=(p.y-.09*sh.x)*(sh.w-1.); }
    if(aFin>2.5) p=mix(p,aWing,iD.x);                                  // a flying fish's pectorals spread into wings
    // the tail beat: a wave running back along the body, growing to ~0.1 L each side at the tail (Bainbridge 1958)
    float s=clamp(aS,0.,1.), env=.06+.94*pow(1.-s,2.2), amp=.1*(.45+.55*iC.y);
    float bend=sin(ph-5.4*(1.-s));
    p.x+=amp*env*bend; nrm.x-=amp*env*cos(ph-5.4*(1.-s))*5.4*.3;
    if(aFin>2.5) p.y+=.02*sin(ph*.5+p.x*40.)*(1.-iD.x);                 // pectorals flutter (not a gliding wing)
    vec3 wp=base+rotP(p*L, yaw, iB.y, iB.z), n=normalize(rotP(nrm, yaw, iB.y, iB.z));
    // colour: countershading, the species' marks, fins
    float tone=aTone; vec3 col=tone>.5?mix(uSide[sp],uBack[sp],smoothstep(.62,.85,tone)):mix(uBelly[sp],uSide[sp],smoothstep(.2,.45,tone));
    vec4 mk=uMark[sp];
    if(mk.x>.5&&tone>.6&&aFin<.5) col=mix(col,vec3(.03,.06,.07),step(.45,sin(s*58.+position.y*120.+sin(s*21.)*2.))*.85);      // mackerel: the wavy black bars
    if(mk.y>.5&&tone>.35&&tone<.85&&aFin<.5) col*=.82+.18*step(.5,fract(position.y*95.));                               // mullet: dark lines along the flank
    if(mk.z>.5&&aFin<.5){ col=mix(col,vec3(.83,.66,.28),smoothstep(.06,.0,abs(tone-.6))*.8); if(s>.8&&s<.88&&tone>.62) col*=.45; }   // amberjack: the amber stripe, the dark band through the eye
    if(mk.w>.5&&mk.w<1.5&&tone>.66&&aFin<.5) col=mix(col,vec3(.05,.08,.12),step(.55,sin(s*48.-position.y*160.))*.8);    // bonito: oblique dark stripes on the back
    if(mk.w>1.5&&mk.w<2.5&&aFin<.5){ if(abs(s-.66)<.04||abs(s-.2)<.05) col*=.25; }                                     // sea bream: the black nape band and tail saddle
    if(aFin>.5) col=uFinC[sp];
    if(mk.w>3.5&&aFin>.5&&s<.08) col=mix(col,vec3(.9),.5);                                                          // shark: pale fin tips
    if(aFin<.5&&s>.86&&abs(position.x)>.02&&tone>.5&&tone<.75) col=vec3(.04);                                       // the eye
    float top=iC.w; vec3 lt=lightAt(wp,top), V=normalize(cameraPosition-wp), Ls=normalize(uSunD);
    float dif=.5+.5*max(dot(n,Ls),0.)+.15*n.y;
    // the silver flank: a vertical mirror - the sun's glint, and the bright sky above it flashing at you when the fish
    // banks into a turn (roll), which is what you see of a school from above
    float fl=smoothstep(.2,.4,tone)*smoothstep(.85,.6,tone)*step(aFin,.5);
    vec3 rv=reflect(-V,n);
    float sp2=pow(max(dot(reflect(-Ls,n),V),0.),8.)*fl*.9 + pow(max(rv.y,0.),3.)*fl*(.35+.9*smoothstep(.15,.7,abs(iB.z)));
    col=(col*dif+vec3(.9,.95,1.)*sp2)*lt;
    waterView(wp, col, top, iC.z);
  }`;

// ---------------------------------------------------------------------------------------------- dolphin
// Short-beaked common dolphin: unit length along +z (beak at +0.5); horizontal flukes, falcate dorsal, flippers.
// aS 0 tail .. 1 beak; aTone 0 belly .. 1 back; aPart 0 body, 1 flukes, 2 dorsal, 3 flippers.
function dolphinGeometry() {
  const ST = [[0.04, 0.03, 0.022], [0.14, 0.05, 0.035], [0.28, 0.085, 0.07], [0.45, 0.112, 0.095], [0.6, 0.118, 0.1], [0.74, 0.1, 0.088], [0.85, 0.078, 0.07], [0.9, 0.045, 0.04], [0.97, 0.018, 0.018]];
  const RG = 8, P = [], N = [], S = [], T = [], K = [], I = [];
  const v = (x, y, z, nx, ny, nz, s, tone, part) => { P.push(x, y, z); N.push(nx, ny, nz); S.push(s); T.push(tone); K.push(part); return P.length / 3 - 1; };
  const rings = ST.map(([s, hh, hw]) => { const r = []; for (let k = 0; k < RG; k++) { const a = k / RG * TAU, sy = Math.cos(a), sx = Math.sin(a), nl = Math.hypot(sx / hw, sy / hh); r.push(v(sx * hw, sy * hh + (s > 0.8 ? -0.01 : 0), s - 0.5, sx / hw / nl, sy / hh / nl, 0, s, 0.5 + 0.5 * sy, 0)); } return r; });
  for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < RG; k++) { const a = rings[i][k], b = rings[i][(k + 1) % RG], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % RG]; I.push(a, b, c, b, d, c); }
  const nose = v(0, -0.01, 0.5, 0, 0, 1, 1, 0.5, 0), tail = v(0, 0, -0.48, 0, 0, -1, 0, 0.5, 0), L = rings[rings.length - 1], F = rings[0];
  for (let k = 0; k < RG; k++) { I.push(L[k], L[(k + 1) % RG], nose); I.push(F[(k + 1) % RG], F[k], tail); }
  // flukes (both faces)
  const f0 = v(0, 0, -0.43, 0, 1, 0, 0.03, 0.9, 1), fl = v(-0.15, 0, -0.52, 0, 1, 0, 0, 0.9, 1), fr = v(0.15, 0, -0.52, 0, 1, 0, 0, 0.9, 1), fn = v(0, 0, -0.49, 0, 1, 0, 0.01, 0.9, 1);
  const fa = v(-0.04, 0, -0.45, 0, 1, 0, 0.02, 0.9, 1), fb = v(0.04, 0, -0.45, 0, 1, 0, 0.02, 0.9, 1);
  I.push(f0, fl, fa, f0, fa, fl, f0, fr, fb, f0, fb, fr, f0, fn, fl, f0, fl, fn, f0, fr, fn, f0, fn, fr);
  // dorsal fin (falcate, swept back), both faces
  const d0 = v(0, 0.105, 0.0, 1, 0, 0, 0.5, 1, 2), d1 = v(0, 0.112, 0.12, 1, 0, 0, 0.62, 1, 2), dt = v(0, 0.215, -0.04, 1, 0, 0, 0.46, 1, 2);
  I.push(d0, dt, d1, d0, d1, dt);
  // flippers
  for (const sd of [-1, 1]) { const a = v(sd * 0.075, -0.05, 0.2, 0, -1, 0, 0.7, 0.3, 3), b = v(sd * 0.07, -0.06, 0.13, 0, -1, 0, 0.63, 0.3, 3), c = v(sd * 0.19, -0.1, 0.07, 0, -1, 0, 0.57, 0.3, 3); I.push(a, b, c, a, c, b); }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aS', new THREE.Float32BufferAttribute(S, 1)); g.setAttribute('aTone', new THREE.Float32BufferAttribute(T, 1)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(K, 1));
  g.setIndex(I); return g;
}
const DOLPHIN_VS = `
  ${VIEW_GLSL}
  attribute vec4 iA, iB, iC, iD; attribute float aS, aTone, aPart;
  void main(){
    vec3 p=position, nrm=normal; float s=clamp(aS,0.,1.);
    // the fluke stroke: up and down, a wave growing to ~0.1 L at the flukes (Fish 1993, INFERRED)
    float env=pow(1.-s,1.8), ph=iC.x-4.2*(1.-s), amp=.09*(.4+.6*iC.y);
    p.y+=amp*env*sin(ph); nrm.y-=amp*env*cos(ph)*4.2*.25;
    vec3 wp=iA.xyz+rotP(p*iA.w,iB.x,iB.y,iB.z), n=normalize(rotP(nrm,iB.x,iB.y,iB.z));
    // the colour of Delphinus: dark cape, the hourglass (tan ahead of the fin, grey behind), white belly, eye stripe
    vec3 back=vec3(.08,.09,.11), tan=vec3(.72,.6,.38), grey=vec3(.52,.54,.57), belly=vec3(.9,.9,.88);
    float t=aTone, cape=smoothstep(.62,.7,t+.08*sin(s*9.)+(s>.5&&s<.62?.12:0.));
    vec3 flank=s>.52?tan:grey;
    vec3 col=t<.32?belly:mix(flank,back,cape);
    if(t>.32&&t<.42) col=mix(belly,col,(t-.32)/.1);
    if(aPart>.5) col=back*1.1;
    if(s>.86&&s<.9&&abs(position.x)>.03&&t>.5&&t<.7) col=vec3(.02);
    float top=iC.w; vec3 V=normalize(cameraPosition-wp), Ls=normalize(uSunD);
    float dif=.45+.55*max(dot(n,Ls),0.)+.1*n.y, spec=pow(max(dot(reflect(-Ls,n),V),0.),18.)*.35*smoothstep(.5,.9,t);
    col=(col*dif+spec)*lightAt(wp,top);
    waterView(wp,col,top,iC.z);
  }`;

// ---------------------------------------------------------------------------------------------- eagle ray
// unit disc length along +z; wings to +-0.8; a long whip tail; aPart 0 disc, 1 tail; aTone 1 top, 0 bottom
function rayGeometry() {
  const OUT = [[0, 0.5], [0.09, 0.44], [0.12, 0.3], [0.45, 0.16], [0.82, 0.02], [0.5, -0.12], [0.24, -0.25], [0.08, -0.34], [0, -0.36]];
  const ring = []; for (const [x, z] of OUT) ring.push([x, z]); for (let i = OUT.length - 2; i > 0; i--) ring.push([-OUT[i][0], OUT[i][1]]);
  const P = [], N = [], T = [], K = [], I = [];
  const v = (x, y, z, ny, tone, part) => { P.push(x, y, z); N.push(0, ny, 0); T.push(tone); K.push(part); return P.length / 3 - 1; };
  for (const sd of [1, -1]) {
    const c = v(0, sd * 0.06, 0.02, sd, sd > 0 ? 1 : 0, 0), mid = ring.map(([x, z]) => v(x * 0.5, sd * 0.04, z * 0.5 + 0.01, sd, sd > 0 ? 1 : 0, 0)), out = ring.map(([x, z]) => v(x, 0, z, sd, sd > 0 ? 1 : 0, 0));
    for (let k = 0; k < ring.length; k++) { const k2 = (k + 1) % ring.length; if (sd > 0) { I.push(c, mid[k2], mid[k], mid[k], mid[k2], out[k], out[k], mid[k2], out[k2]); } else { I.push(c, mid[k], mid[k2], mid[k], out[k], mid[k2], out[k], out[k2], mid[k2]); } }
  }
  const t0 = v(-0.015, 0.01, -0.34, 1, 1, 1), t1 = v(0.015, 0.01, -0.34, 1, 1, 1), t2 = v(0, 0.005, -1.9, 1, 1, 1);
  I.push(t0, t1, t2, t0, t2, t1);
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aTone', new THREE.Float32BufferAttribute(T, 1)); g.setAttribute('aPart', new THREE.Float32BufferAttribute(K, 1));
  g.setIndex(I); return g;
}
const RAY_VS = `
  ${VIEW_GLSL}
  attribute vec4 iA, iB, iC, iD; attribute float aTone, aPart;
  void main(){
    vec3 p=position; float ax=abs(p.x);
    // the wingbeat: a wave running out along the wing (rays fly), ~0.2 L at the tips; the tail trails and sways
    float amp=.16*(.35+.65*iC.y);
    p.y+=amp*pow(ax/.8,1.4)*sin(iC.x-ax*2.6);
    if(aPart>.5) p.x+=.06*sin(iC.x*.5+p.z*3.)*(-p.z);
    vec3 wp=iA.xyz+rotP(p*iA.w,iB.x,iB.y,iB.z), n=normalize(rotP(normal,iB.x,iB.y,iB.z));
    vec3 col=aTone>.5?vec3(.33,.27,.18)*(.85+.3*fract(sin(dot(position.xz,vec2(91.,37.)))*437.)):vec3(.88,.86,.82);
    float top=iC.w, dif=.5+.5*max(dot(n,normalize(uSunD)),0.);
    waterView(wp,col*dif*lightAt(wp,top),top,iC.z);
  }`;

// ---------------------------------------------------------------------------------------------- barrel jellyfish
// unit: the bell (radius 0.3, top at +0.2, rim at -0.04) and eight frilled oral arms down to -0.75. aPart 0 bell, 1 rim,
// 2 arms; aR: how far out from the axis (the pulse squeezes the rim)
function jellyGeometry() {
  const P = [], N = [], K = [], R = [], I = [];
  const v = (x, y, z, nx, ny, nz, part) => { P.push(x, y, z); N.push(nx, ny, nz); K.push(part); R.push(Math.hypot(x, z)); return P.length / 3 - 1; };
  const SEG = 10, rows = [[0, 0.2], [0.14, 0.18], [0.24, 0.12], [0.3, 0.03], [0.31, -0.04]];
  const ring = rows.map(([rr, y], ri) => { const r = []; for (let k = 0; k < SEG; k++) { const a = k / SEG * TAU, c = Math.cos(a), s = Math.sin(a); r.push(v(c * rr, y, s * rr, c * rr, 0.3 + y, s * rr, ri === rows.length - 1 ? 1 : 0)); } return r; });
  for (let i = 0; i + 1 < ring.length; i++) for (let k = 0; k < SEG; k++) { const a = ring[i][k], b = ring[i][(k + 1) % SEG], c = ring[i + 1][k], d = ring[i + 1][(k + 1) % SEG]; I.push(a, c, b, b, c, d); }
  for (let a = 0; a < 4; a++) {   // four crossed ribbons = eight frilled arms
    const ang = a / 4 * Math.PI, c = Math.cos(ang), s = Math.sin(ang);
    const q = [[0.1, -0.03], [0.07, -0.35], [0.03, -0.75]].map(([w, y]) => [v(-c * w, y, -s * w, -s, 0, c, 2), v(c * w, y, s * w, -s, 0, c, 2)]);
    for (let i = 0; i < 2; i++) I.push(q[i][0], q[i + 1][0], q[i][1], q[i][1], q[i + 1][0], q[i + 1][1]);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(K, 1)); g.setAttribute('aR', new THREE.Float32BufferAttribute(R, 1));
  g.setIndex(I); return g;
}
const JELLY_VS = `
  ${VIEW_GLSL}
  attribute vec4 iA, iB, iC, iD; attribute float aPart, aR;
  void main(){
    vec3 p=position;
    float pulse=max(0.,sin(iC.x));                        // the bell's stroke: the rim pulls in, the bell lifts
    if(aPart<1.5){ float k=1.-.2*pulse*smoothstep(.05,.3,aR); p.x*=k; p.z*=k; p.y+=.03*pulse*smoothstep(.2,.3,aR); }
    else { p.x+=.03*sin(iC.x*.5+p.y*6.)*(-p.y); p.z+=.03*cos(iC.x*.4+p.y*5.)*(-p.y); }
    vec3 wp=iA.xyz+rotP(p*iA.w,iB.x,iB.y*.3,iB.z*.3);
    vec3 col=aPart<.5?vec3(.86,.9,.94):aPart<1.5?vec3(.32,.26,.62):vec3(.86,.86,.78);
    float top=iC.w, a=aPart<.5?.45:aPart<1.5?.8:.6;
    waterView(wp,col*lightAt(wp,top)*1.1,top,iC.z*a);
  }`;

// ---------------------------------------------------------------------------------------------- seabird
// unit span 1 along x, body along +z. aPart 0 body, 1 inner wing (shoulder at |x| 0.04), 2 outer wing (wrist at 0.26);
// aTone 0 body white, 1 wing (mantle) top, 2 the dark outer primaries, 3 head / cap, 4 bill, 5 legs
function birdGeometry() {
  const P = [], N = [], K = [], T = [], I = [];
  const v = (x, y, z, ny, part, tone) => { P.push(x, y, z); N.push(0, ny, 0); K.push(part); T.push(tone); return P.length / 3 - 1; };
  // body: a spindle (6 around x 4 along), head, bill, tail
  const ST = [[-0.22, 0.012, 0.012], [-0.12, 0.04, 0.035], [0.02, 0.05, 0.045], [0.12, 0.038, 0.034], [0.17, 0.026, 0.024]];
  const RG = 6, rings = ST.map(([z, hh, hw]) => { const r = []; for (let k = 0; k < RG; k++) { const a = k / RG * TAU; r.push(v(Math.sin(a) * hw, Math.cos(a) * hh, z, Math.cos(a), 0, z > 0.12 ? 3 : 0)); } return r; });
  for (let i = 0; i + 1 < rings.length; i++) for (let k = 0; k < RG; k++) { const a = rings[i][k], b = rings[i][(k + 1) % RG], c = rings[i + 1][k], d = rings[i + 1][(k + 1) % RG]; I.push(a, b, c, b, d, c); }
  const bill = v(0, -0.004, 0.25, 0, 0, 4), last = rings[rings.length - 1]; for (let k = 0; k < RG; k++) I.push(last[k], last[(k + 1) % RG], bill);
  const tail0 = v(-0.035, 0.01, -0.2, 1, 0, 0), tail1 = v(0.035, 0.01, -0.2, 1, 0, 0), tail2 = v(0, 0.012, -0.29, 1, 0, 0); I.push(tail0, tail2, tail1, tail0, tail1, tail2);
  // wings (both faces): inner panel shoulder -> wrist, outer panel wrist -> tip
  for (const sd of [-1, 1]) {
    const a = v(sd * 0.04, 0.02, 0.07, 1, 1, 1), b = v(sd * 0.04, 0.02, -0.09, 1, 1, 1), c = v(sd * 0.26, 0.02, 0.06, 1, 1, 1), d = v(sd * 0.26, 0.02, -0.09, 1, 1, 1);
    const e = v(sd * 0.26, 0.02, 0.06, 1, 2, 1), f = v(sd * 0.26, 0.02, -0.09, 1, 2, 1), g = v(sd * 0.4, 0.02, 0.01, 1, 2, 2), hh = v(sd * 0.5, 0.02, -0.07, 1, 2, 2), ii = v(sd * 0.38, 0.02, -0.08, 1, 2, 2);
    I.push(a, c, b, b, c, d, a, b, c, b, d, c);
    I.push(e, g, f, f, g, ii, g, hh, ii, e, f, g, f, ii, g, g, ii, hh);
  }
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('aPart', new THREE.Float32BufferAttribute(K, 1)); geo.setAttribute('aTone', new THREE.Float32BufferAttribute(T, 1));
  geo.setIndex(I); return geo;
}
// per bird species (seabirds.js order): body, mantle (wing top), primaries (tips), head, bill; body length / span
const BLOOK = {
  gull: { body: 0xf2f2f0, wing: 0xa9b1b8, tip: 0x1a1a1c, head: 0xf4f4f2, bill: 0xe8c430, len: 0.43 },
  tern: { body: 0xf6f6f6, wing: 0xccd3da, tip: 0x8a9096, head: 0x111111, bill: 0xd8402a, len: 0.45 },
  gannet: { body: 0xf6f6f2, wing: 0xf2f2ee, tip: 0x161616, head: 0xe6d49a, bill: 0x9aa4ae, len: 0.54 },
};
export function birdUniforms() {
  const L = BIRD_SPECIES.map(s => BLOOK[s.key]), c = h => new THREE.Color(h);
  return { ...viewUniforms(), uBody: { value: L.map(l => c(l.body)) }, uWingC: { value: L.map(l => c(l.wing)) }, uTip: { value: L.map(l => c(l.tip)) }, uHead: { value: L.map(l => c(l.head)) }, uBill: { value: L.map(l => c(l.bill)) }, uLen: { value: L.map(l => l.len) } };
}
const NB = BIRD_SPECIES.length;
const BIRD_VS = `
  ${VIEW_GLSL}
  attribute vec4 iA, iB, iC, iD; attribute float aPart, aTone;
  uniform vec3 uBody[${NB}], uWingC[${NB}], uTip[${NB}], uHead[${NB}], uBill[${NB}]; uniform float uLen[${NB}];
  void main(){
    int sp=int(iB.w+.5); vec3 p=position; p.z*=uLen[sp]/.45;
    float side=sign(p.x), ph=iC.x, amp=iC.y, fold=iC.z;
    // flapping: the inner wing about the shoulder, the outer about the wrist a little behind it in phase
    float a1=amp*.62*sin(ph)+.08, a2=a1+amp*.45*sin(ph-.7);
    if(aPart>.5){
      float sx=abs(p.x);
      if(aPart<1.5){ float r=sx-.04; p.x=side*(.04+r*cos(a1)); p.y+=r*sin(a1); }
      else { float r1=.22, r2=sx-.26; p.x=side*(.04+r1*cos(a1)+r2*cos(a2)); p.y+=r1*sin(a1)+r2*sin(a2); }
      // folding (a gannet before it hits the water, a bird sitting): the wing swept back along the body
      float sw=fold*1.35, rx=p.x-side*.04, rz=p.z;
      p.x=side*.04+rx*cos(sw)*(1.-.75*fold); p.z=rz-abs(rx)*sin(sw)*1.05; p.y-=fold*.02;
    }
    vec3 wp=iA.xyz+rotP(p*iA.w,iB.x,iB.y,iB.z), n=normalize(rotP(vec3(0.,1.,0.),iB.x,iB.y,iB.z));
    vec3 col=aTone<.5?uBody[sp]:aTone<1.5?uWingC[sp]:aTone<2.5?uTip[sp]:aTone<3.5?uHead[sp]:uBill[sp];
    if(aTone>.5&&aTone<1.5&&position.y<0.) col=uBody[sp];
    // the face you see: the back from above, the underside from below (in its own shade against a bright sky)
    vec3 nf=dot(n,cameraPosition-wp)>0.?n:-n;
    float top=iD.x, dif=.34+.66*max(dot(nf,normalize(uSunD)),0.)+.08*nf.y;
    waterView(wp,col*dif*lightAt(wp,top),top,iC.w);
  }`;

// ---------------------------------------------------------------------------------------------- surface signs
// Patches that ride the live waves (the same components and the same grid filter as the drawn sea, per vertex):
// kind 0 nervous water (a school at the top: a dark riffle with glints), 1 a bait ball boiling (froth, splashes),
// 2 a ripple ring (a fish in or out, a dolphin, a bird), 3 a splash's foam. iP (x, z, r, kind)  iQ (k, age, seed, life)
// iR (wave attenuation there: the waves die out over the last metres of depth, as the drawn sea, -, -, -)
export function signGeometry() {
  const g = new THREE.PlaneGeometry(2, 2, 10, 10).rotateX(-Math.PI / 2), ig = new THREE.InstancedBufferGeometry();
  ig.setAttribute('position', g.attributes.position); ig.setAttribute('uv', g.attributes.uv); ig.setIndex(g.index);
  return ig;
}
export const SIGN_VS = nv => `
  attribute vec4 iP, iQ, iR;
  uniform vec4 uWave[${nv}]; uniform float uCell;
  varying vec2 vL; varying vec4 vP, vQ; varying float vFog;
  uniform vec2 uFogP2;
  void main(){
    vec2 xz=iP.xy+position.xz*iP.z;
    float e=0.;
    for(int i=0;i<${nv};i++){ vec4 c=uWave[i]; float kk=length(c.xy); if(kk<1e-5) continue; float a=c.z*smoothstep(uCell*2.5,uCell*5.,6.2832/kk); if(a<1e-4) continue; e+=a*cos(c.w-dot(c.xy,xz)); }
    vec4 mv=viewMatrix*vec4(xz.x,e*iR.x+.05,xz.y,1.);
    vL=position.xz; vP=iP; vQ=iQ; vFog=smoothstep(uFogP2.x,uFogP2.y,-mv.z);
    gl_Position=projectionMatrix*mv;
  }`;
export const SIGN_FS = `
  varying vec2 vL; varying vec4 vP, vQ; varying float vFog;
  uniform float uTime, uSea;
  ${SEA_NOISE_GLSL}
  void main(){
    float r=length(vL), kind=vP.w, k=vQ.x, age=vQ.y, sd=vQ.z;
    vec2 w=vP.xy+vL*vP.z;
    vec4 c=vec4(0.);
    if(kind<.5){            // nervous water: a riffle darker than the sea round it, glinting
      float edge=1.-smoothstep(.45,1.,r+.25*sNoise(w*.6+sd*9.));
      float rip=sNoise(w*3.1+vec2(uTime*1.7,-uTime*1.3))*.6+sNoise(w*6.3-uTime*2.2)*.4;
      float gl=smoothstep(.8,.92,rip)*sNoise(w*11.+uTime*4.);                // a riffle, glinting here and there (not foam)
      c=vec4(mix(vec3(.02,.07,.09),vec3(.8,.88,.92),gl),edge*(.38+.25*gl)*k);
    } else if(kind<1.5){    // a bait ball at the top: dark water, froth that comes and goes, white where it boils
      float edge=1.-smoothstep(.35,1.,r+.3*sNoise(w*.4+sd*5.));
      float boil=sNoise(w*1.3+vec2(uTime*.9,uTime*.6))*.55+sNoise(w*3.7-uTime*1.8)*.45;
      float froth=smoothstep(.6,.78,boil), dark=.62*edge;                 // (a bait ball from the air: a dark brown-olive stain)
      c=vec4(mix(vec3(.04,.05,.035),vec3(.92,.95,.96),froth),edge*(dark+.6*froth)*k);
    } else if(kind<2.5){    // a ring running out
      float life=max(vQ.w,.1), t=age/life, rr=t, ring=exp(-pow((r-rr)/(.05+.06*t),2.));
      c=vec4(vec3(.9,.95,.97),ring*(1.-t)*.65*k);
    } else if(kind<3.5){     // foam of a splash, breaking up as it fades
      float life=max(vQ.w,.1), t=age/life, n=sNoise(w*2.2+sd*3.);
      c=vec4(vec3(.94,.96,.97),(1.-smoothstep(.2,1.,r))*smoothstep(t,t+.25,n)*(1.-t)*.9*k);
    } else {                // a shoal seen as a moving mass, with silver flanks within its dark body
      float edge=1.-smoothstep(.35,1.,length(vL*vec2(.85,1.2))+.16*sNoise(w*.22+sd*8.));
      vec2 q=w*.65+vec2(uTime*.32,-uTime*.2);
      float fleck=smoothstep(.75,.9,sNoise(q))*smoothstep(.25,.75,sNoise(w*2.3+uTime*.5));
      c=vec4(mix(vec3(.015,.07,.065),vec3(.66,.86,.79),fleck),edge*(.62+.18*fleck)*k);
    }
    c.a*=(1.-vFog)*(1.-.45*uSea);
    if(c.a<.01) discard;
    gl_FragColor=c;
  }`;

export const SHADERS = { FISH_VS, DOLPHIN_VS, RAY_VS, JELLY_VS, BIRD_VS, FRAG };
export const GEOMETRY = { fishGeometry, dolphinGeometry, rayGeometry, jellyGeometry, birdGeometry };
