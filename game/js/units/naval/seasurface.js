// SEAWORLD: the sea surface, drawn from the same live sea the ships move on (seamotion.js).
//
// main.js's terrain shader draws the sea where the ground is below sea level; these GLSL snippets plug into it:
// - VERTEX: the 14 wave components of W.sea displace the sea vertices (heights at the game's 0.44 scale, real
//   periods - see seamotion.js SEA_GAME_SCALE) and give the slope for the normal (computed per vertex, interpolated:
//   the fragment shader adds only a cheap ripple). Waves shorter than ~5 grid cells are left out of a grid (so the 24 m
//   far ring carries only the long swell, never aliasing), and the waves die out over the last few metres of depth
//   (the coast stays where it is).
// - FRAGMENT: the swell's slope lights the water; whitecaps break on the crests, more and bigger with the sea state
//   (Monahan-style coverage, exaggerated to read at game distances), wind streaks of foam at 6-7; surf on the beaches
//   widens and pulses with the swell; foam hugs every ship's waterline (thicker at the bow and with speed).
// Cost: ~14 cos/sin per sea VERTEX (not per pixel), one value-noise pair per sea pixel, a 6-ship loop with an early out.
import * as THREE from 'three';
import { SEA_GAME_SCALE } from './seamotion.js';

// SEA_NV: the components the GPU draws - the largest by amplitude (8 of 14 carry ~90 % of the variance; the ships
// and seaElevation use all 14, so the drawn surface is a hair smoother than the one they ride)
export const SEA_N = 14, SEA_NV = 8, SEA_SHIPS = 6;
// whitecap coverage (fraction of the surface) per sea state: roughly Monahan's W = 3.8e-6 U^3.4 for the usual wind of
// each state (SS3 ~5 m/s ... SS7 ~20 m/s: 0.1 % ... 10 %), lifted at the low end so a moderate sea shows some
const CAPS = [0, 0, 0.004, 0.02, 0.05, 0.1, 0.17, 0.26];
const capAt = ss => { const i = Math.min(6, Math.floor(ss)), f = ss - i; return CAPS[i] + (CAPS[i + 1] - CAPS[i]) * f; };

export function createSeaUniforms() {
  return {
    uWave: { value: Array.from({ length: SEA_NV }, () => new THREE.Vector4()) },   // (kx, kz, amplitude, clock phase)
    uSeaP: { value: new THREE.Vector4(0.8, 0.05, 0.5, 0) },                      // (Hs game m, whitecap cover, 0..1 state, -)
    uSeaD: { value: new THREE.Vector2(0, -1) },                                    // main direction the waves travel
    uShipP: { value: Array.from({ length: SEA_SHIPS }, () => new THREE.Vector4()) }, // (x, z, cos yaw, sin yaw)
    uShipD: { value: Array.from({ length: SEA_SHIPS }, () => new THREE.Vector4()) }, // (half length, half beam, speed 0..1, on)
  };
}
// once a frame: the sea's components and the ships near the camera
const _near = [], _byA = [];
export function updateSeaUniforms(U, sea, units, cam) {
  const W = U.uWave.value, comps = _byA; _byA.length = 0; for (const c of sea.comps) _byA.push(c); _byA.sort((a, b) => b.a - a.a);
  for (let i = 0; i < SEA_NV; i++) {
    const c = comps[i];
    if (!c) { W[i].set(0, 0, 0, 0); continue; }
    W[i].set(c.dx * c.kg, c.dz * c.kg, c.a * SEA_GAME_SCALE, c.ph % (Math.PI * 2));
  }
  const ssK = sea.ss / 7;
  U.uSeaP.value.set(sea.hs * SEA_GAME_SCALE, capAt(sea.ss), ssK, 0);
  U.uSeaD.value.set(-Math.sin(sea.dir), -Math.cos(sea.dir));
  // ships: the nearest few afloat
  _near.length = 0;
  for (const u of units) if (u.dims && !u.gone && (u.sinking === undefined || u.sinking < 6) && !(u.sky && u.p.y > 3)) _near.push(u);
  _near.sort((a, b) => Math.hypot(a.p.x - cam.x, a.p.z - cam.z) - Math.hypot(b.p.x - cam.x, b.p.z - cam.z));
  for (let i = 0; i < SEA_SHIPS; i++) {
    const u = _near[i];
    if (!u) { U.uShipD.value[i].set(0, 0, 0, 0); continue; }
    const wl = u.parts.waterline || { hl: u.dims.L * 0.5, hw: u.dims.W * 0.38 };
    U.uShipP.value[i].set(u.p.x, u.p.z, Math.cos(u.yaw), Math.sin(u.yaw));
    U.uShipD.value[i].set(wl.hl, wl.hw, Math.min(1, Math.abs(u.speed || 0) / 6), 1);
  }
}

// ---------------------------------------------------------------------------------------------- GLSL
export const SEA_VS_DECL = `uniform vec4 uWave[${SEA_NV}]; uniform vec4 uSeaP; uniform vec4 uShipP[${SEA_SHIPS}], uShipD[${SEA_SHIPS}]; varying vec3 vSea; varying float vHull;
    // foam round the ships' waterlines, 0..1, per VERTEX (the fragment shader adds the noise: a per-pixel 6-ship
    // loop was a quarter of the frame in software WebGL)
    float hullFoam(vec2 p){
      float f=0.;
      for(int i=0;i<${SEA_SHIPS};i++){
        vec4 d=uShipD[i]; if(d.w<.5) continue;
        vec4 s=uShipP[i]; vec2 r=p-s.xy; if(abs(r.x)+abs(r.y)>d.x+d.y+30.) continue;
        float lx=r.x*s.z-r.y*s.w, lz=r.x*s.w+r.y*s.z;              // ship frame (x starboard, z aft)
        float tb=clamp(-lz/d.x,0.,1.), hw=d.y*(lz<0.?sqrt(max(0.,1.-tb*tb*tb)):1.-.12*clamp(lz/d.x,0.,1.));
        float ou=max(abs(lx)-hw,abs(lz)-d.x);                          // metres outside the hull (roughly)
        float band=1.6+2.6*d.z+2.2*uSeaP.z, bow=smoothstep(-.3,-.95,lz/d.x)*(.4+d.z);
        float k=(1.-smoothstep(0.,band*(1.+bow),ou))*step(-.6,ou);
        f=max(f,k);
      }
      return f;
    }`;
// in: vec4 w (world position, w.y already the ground / sea floor), float h (raw height), CELL (grid spacing).
// out: w.y displaced on the sea, vSea = (elevation, slope x, slope z)
export const SEA_VS = `
      vSea=vec3(0.); vHull=0.;
      if(h<=0.){
        vHull=hullFoam(w.xz);
        float att=smoothstep(.3,7.,-h), e=0., sx=0., sz=0.;
        for(int i=0;i<${SEA_NV};i++){
          vec4 c=uWave[i]; float kk=length(c.xy); if(kk<1e-5) continue;
          float a=c.z*smoothstep(CELL*2.5,CELL*5.,6.2832/kk); if(a<1e-4) continue;   // the grid must carry the wave (the far ring skips most)
          float ph=c.w-dot(c.xy,w.xz), s=a*sin(ph);
          e+=a*cos(ph); sx+=s*c.x; sz+=s*c.y;
        }
        w.y=e*att; vSea=vec3(e*att,sx*att,sz*att);
      }`;
export const SEA_FS_DECL = `uniform vec4 uSeaP; uniform vec2 uSeaD; varying vec3 vSea; varying float vHull;
    float sHash(vec2 p){ p=mod(p,289.); return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
    float sNoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(sHash(i),sHash(i+vec2(1.,0.)),f.x),mix(sHash(i+vec2(0.,1.)),sHash(i+1.),f.x),f.y); }
    // the sun glint's sparkle mask (only asked where there is a glint)
    float glitAt(vec2 p, float t, float sk){ return mix(1.,.45+1.*smoothstep(.45,.9,sNoise(p*1.3+vec2(t*.7,-t*.4))),smoothstep(.1,.4,sk)); }
`;
// in: vec2 p (world xz), float d (depth), float t (time), vec3 V (to eye), vec3 L (sun), wc (water colour so far).
// out: vec3 wn (the swell's normal: shading, fresnel), wg (glitter normal: the sun's specular - mostly ripple, so the
// glint breaks up into sparkle instead of lighting whole wave faces), glit (sparkle mask), float foam (0..1)
export const SEA_FS_NORMAL = `
        float sk=uSeaP.z, rk=mix(.25,1.15,smoothstep(0.,.5,sk));            // calm: glassy ripples; rough: a choppy face
        vec3 wn=normalize(vec3(-vSea.y+(cos(a1)*.12+cos(a3)*.07)*rk, 1., -vSea.z+(cos(a2)*.14+cos(a3)*.07)*rk));
        vec3 wg=normalize(vec3(-vSea.y*.15+(cos(a1)*.12+cos(a3)*.07)*rk, 1., -vSea.z*.15+(cos(a2)*.14+cos(a3)*.07)*rk));
`;
export const SEA_FS_FOAM = `
        float crest=vSea.x/max(uSeaP.x*.55,.02), cov=uSeaP.y;
        vec2 wd=uSeaD, q=vec2(dot(p,wd),dot(p,vec2(-wd.y,wd.x)));
        float cap=0., streak=0.;   // (branches: the noise only where it can show - SwiftShader pays for every pixel)
        if(cov>0.&&crest>.2){ float n1=sNoise(p*.16+wd*t*.35), n2=sNoise(p*.7-wd*t*.6); cap=smoothstep(.2,.9,crest)*smoothstep(1.-cov*1.5,1.-cov*.9,n1*.6+n2*.4+crest*.1)*(.5+.5*n2); }
        if(sk>.7) streak=smoothstep(.7,.88,sNoise(vec2(q.x*.03-t*.25,q.y*.32)))*smoothstep(.7,1.,sk)*.35;
        float surfW=1.4+3.5*sk, surf=(1.-smoothstep(0.,surfW,d))*(.55+.45*sin(d*8./(1.+sk*2.)-t*2.4+sin(a1)+vSea.x*2.));
        float foam=clamp(max(max(surf,cap),max(streak*(1.-smoothstep(150.,600.,length(cameraPosition.xz-p))),(vHull>.01?vHull*(.45+.55*sNoise(p*.6+vec2(t*.4,t*1.2))):0.))),0.,1.);`;
