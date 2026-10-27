// RENDERKIT sky (ngc/depth-sky): the atmosphere. Sky, sun, fair-weather cumulus, aerial perspective and the land past
// the draw distance, so the world recedes in layers instead of ending in a pale wall. Compiled only with RK.on('sky').
//
// Pieces (all in DISPLAY values, the space the game's raw shaders and Three's fog chunk mix in under NoToneMapping):
// - RK_ATMO_GLSL: shared functions. rkSkyBase (the clear sky along a ray: horizon/zenith gradient + Mie glow round the
//   sun), rkAerial (height-dependent haze: extinction bluer than red + in-scatter of that sky, thinner with altitude,
//   densest at sea level), rkFarLand / rkFarSeaCol (the far ground's look, shared by the terrain's end fade and the
//   dome), rkClouds (a 2.5D cumulus slab, raymarched; flat shaded bases, rounded sun-lit tops) and rkCloudShade (the
//   cloud-shadow hook for any surface shader).
// - installAtmosphere(THREE): patches Three's fog chunks so EVERY built-in material (trees, buildings, units, particles)
//   gets the same aerial perspective as the terrain, and its end of draw distance dissolves (screen door, the
//   visibility.js LOD pattern) into the dome behind instead of fading to one flat colour. The haze uniforms are shared
//   Float32Arrays added to ShaderLib / UniformsLib.fog: Three's cloneUniforms shares typed arrays by reference, so one
//   write per frame reaches every material. A ShaderMaterial without them reads zeros and keeps the classic fog.
// - createAtmosphere(...): the sky dome material (sky + sun disc + clouds + the far land: a heightfield raymarch of the
//   8 km far window past the draw distance, hazed), a cloud floor seen from above (a camera-following disc at the
//   cloud base, so clouds cover the ground when a jet climbs over them; inside the slab both march from the eye: no
//   popping slab), the weather (coverage and grey from the sea state) and the per-frame uniforms.
// Tiers: 'high' (desktop), 'low' (XR, or ?rksky=low): fewer cloud / far steps, no cloud detail octave.
import * as THREE from 'three';
import { uniform } from './core.js';

// ---- the shared haze state (display space). x: extinction per metre at sea level, y: 1 / scale height, z: weight
// (0 = classic fog: under water, in the caves), w: Mie glow strength.
export const HAZE = Object.freeze({
  haze: new Float32Array([0.001, 1 / 320, 0, 1]),
  sun: new Float32Array([0.4, 0.8, 0.24, 0]),          // xyz: the sun's direction (the DirectionalLight's), w: unused
  zenith: new Float32Array([0.39, 0.55, 0.86]),         // display
  sunCol: new Float32Array([1, 0.94, 0.82]),            // display
  sea: new Float32Array([0.05, 0.2, 0.28, 0.6]),        // rgb: far deep water (display), w: far glitter strength
});
// tuning, in one place (metres / display colours)
export const ATMO = Object.freeze({
  density: 0.001, scaleHeight: 320, mie: 1,
  cloudBase: 1650, cloudThick: 750, cloudScale: 11000, wind: [5.5, 2.2],
  coverFair: 0.42, coverStorm: 0.86,
});

const IGN = 'fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))))';   // = visibility.js screenDoor

// The haze part is all the fog chunk needs (no textures: built-ins get it through shared arrays).
export const RK_HAZE_GLSL = /* glsl */`
uniform vec4 rkHaze, rkHazeSun, rkHazeSea; uniform vec3 rkHazeZen, rkHazeSunC;
float rkOD(float y0, float dy, float d){   // haze optical depth along d metres from height y0 rising dy (closed form)
  float b=rkHaze.y, a=max(y0,0.), e0=exp(-b*a), y1=max(y0+dy,0.), q=b*(y1-a);
  return rkHaze.x*d*(abs(q)<1e-3 ? e0*(1.-.5*q) : (e0-exp(-b*y1))/q);
}
vec3 rkSkyBase(vec3 v, vec3 hor){   // the clear sky along v: gradient (softHorizon's curve) + forward scatter round the sun
  float y=max(v.y,0.), mu=max(dot(v,rkHazeSun.xyz),0.), mu2=mu*mu, mu4=mu2*mu2, mu8=mu4*mu4, mu32=mu8*mu8; mu32*=mu32;
  vec3 c=mix(hor,rkHazeZen,sqrt(smoothstep(0.,1.,y)));
  c=mix(c,hor*1.03+.02,exp(-y*28.)*.35);   // the milky band just over the horizon
  return c+rkHazeSunC*rkHaze.w*(.05*mu4+.10*mu8*(1.-y*.5)+.22*mu32*mu8);
}
vec3 rkAerial(vec3 c, vec3 ray, vec3 hor){   // extinction (blue more than red) + in-scatter of the sky behind
  float d=length(ray); vec3 v=ray/max(d,1e-3);
  vec3 T=exp(-rkOD(cameraPosition.y,ray.y,d)*vec3(.80,.95,1.16));
  return c*T+rkSkyBase(v,hor)*(1.-T);
}
vec3 rkFarSeaCol(vec3 v, vec3 hor){   // open sea far off: deep water + the sky in it (flat Fresnel, capped like the sea) + a soft glitter path
  float F=.02+.98*pow(1.-clamp(-v.y,0.,1.),5.);
  vec3 r=vec3(v.x,abs(v.y),v.z);
  vec3 c=mix(rkHazeSea.rgb,rkSkyBase(r,hor),min(F*.7,.6));
  float g=max(dot(r,rkHazeSun.xyz),0.); g*=g; g*=g; g*=g; g*=g; g*=g; g*=g;
  return c+rkHazeSunC*g*rkHazeSea.w*.5;
}
vec3 rkFarLand(vec3 p, vec3 n){   // land far off (32 m detail): grass / forest, rock by height and slope, snow, beaches; lit like the RK terrain
  float sl=1.-n.y;
  vec3 c=mix(vec3(.15,.33,.12),vec3(.25,.41,.16),smoothstep(60.,170.,p.y));
  c=mix(c,vec3(.44,.39,.31),max(smoothstep(170.,300.,p.y),smoothstep(.3,.55,sl)));
  c=mix(c,vec3(.92,.94,.97),smoothstep(440.,520.,p.y)*(1.-smoothstep(.35,.7,sl)));
  c=mix(vec3(.70,.64,.44),c,smoothstep(0.,4.,p.y));
  return c*(rkHazeSunC*max(dot(n,rkHazeSun.xyz),0.)*.75+mix(vec3(.6,.64,.55),vec3(.98,1.01,1.06),n.y*.5+.5)*.4);
}
`;

// Clouds: one RGBA8 tileable noise texture (R: cumulus coverage fbm, G: detail fbm, B: billows), 2-3 fetches per step.
export const RK_CLOUD_GLSL = /* glsl */`
uniform sampler2D rkCloudT; uniform vec4 rkCloud, rkCloudL;   // rkCloud: coverage, grey, wind offset x/z (m); rkCloudL: base, thickness, scale (m), shadow strength
float rkCov(vec2 xz){   // 0..1 column strength (the shadow and the coverage share it)
  float n=texture2D(rkCloudT,(xz+rkCloud.zw)/rkCloudL.z).r;
  return smoothstep(1.-rkCloud.x,1.-rkCloud.x+.3,n);
}
float rkCloudD(vec3 p){   // density: a flat base, a domed top whose height follows the coverage (billows make the domes)
  float h=(p.y-rkCloudL.x)/rkCloudL.y; if(h<0.||h>1.) return 0.;
  vec2 uv=(p.xz+rkCloud.zw)/rkCloudL.z;
  vec4 n=texture2D(rkCloudT,uv);
  float cov=smoothstep(1.-rkCloud.x,1.-rkCloud.x+.35,n.r);
  if(cov<=0.) return 0.;
  float top=cov*(.5+.5*n.b), side=0.;
  #ifdef RK_CLOUD_DETAIL
  vec4 dn=texture2D(rkCloudT,uv*5.3+vec2(.37,.11));
  top+=(dn.b-.5)*.24*cov; side=(dn.g-.5)*.2;   // cauliflower tops, ragged sides
  #endif
  return smoothstep(0.,.2,top-h+side)*smoothstep(0.,.07,h)*(.45+.55*cov);
}
float rkCloudShade(vec3 p){   // CLOUD-SHADOW HOOK: 1 in sun, 1 - strength under a cloud (sampled along the sun to the lower slab)
  vec3 L=rkHazeSun.xyz; vec2 q=p.xz+L.xz*(rkCloudL.x+rkCloudL.y*.25-p.y)/max(L.y,.2);
  return 1.-rkCloudL.w*smoothstep(.05,.55,rkCov(q));
}
#ifdef RK_CLOUD_STEPS   // (surface shaders that only want rkCloudShade leave it out)
vec4 rkClouds(vec3 C, vec3 v, float tMax, vec3 hor){   // premultiplied cloud colour along the ray (hazed), alpha
  float B=rkCloudL.x, Tp=B+rkCloudL.y, t0, t1;
  if(C.y<B){ if(v.y<=.004) return vec4(0.); t0=(B-C.y)/v.y; t1=(Tp-C.y)/v.y; }
  else if(C.y>Tp){ if(v.y>=-.004) return vec4(0.); t0=(Tp-C.y)/v.y; t1=(B-C.y)/v.y; }
  else { t0=0.; t1=v.y>.004?(Tp-C.y)/v.y:v.y<-.004?(B-C.y)/v.y:6000.; }
  t1=min(min(t1,t0+3200.),tMax);
  if(t0>34000.||t1<=t0) return vec4(0.);
  // a short crossing (looking up from below, down from above) that finds no column at its ends and middle is clear sky
  vec3 pa=C+v*t0, pb=C+v*t1;
  if(length(pb.xz-pa.xz)<900. && rkCov(pa.xz)+rkCov(pb.xz)+rkCov((pa.xz+pb.xz)*.5)<=0.) return vec4(0.);
  vec3 q=fract(gl_FragCoord.xyx*.1031); q+=dot(q,q.yzx+33.33);   // per-pixel jitter of the steps (white: no structured hatching)
  float len=t1-t0, j=.5+(fract((q.x+q.y)*q.z)-.5)*.7, T=1., tw=0., ws=0.;
  vec3 L=rkHazeSun.xyz, acc=vec3(0.);
  float grey=rkCloud.y;
  vec3 top=rkHazeSunC*mix(1.05,.8,grey), shade=mix(vec3(.66,.7,.76),rkHazeZen,.18)*mix(1.,.66,grey);
  float mu=max(dot(v,L),0.), silver=pow(mu,8.)*.3;
  for(int i=0;i<RK_CLOUD_STEPS;i++){
    float s=(float(i)+j)/float(RK_CLOUD_STEPS), t=t0+len*s*(.4+.6*s), dt=len*(.4+1.2*s)/float(RK_CLOUD_STEPS);   // finer steps near the eye
    vec3 p=C+v*t;
    float d=rkCloudD(p);
    if(d>.002){
      float h=clamp((p.y-B)/rkCloudL.y,0.,1.), lit=exp(-rkCloudD(p+L*120.)*1.8);   // one tap towards the sun: lit tops, shaded bases
      vec3 sc=mix(shade*mix(.8,1.,h),top,lit*(.3+.7*h))+top*silver*(1.-d);
      float a=1.-exp(-d*min(dt,300.)*.011);
      acc+=T*a*sc; tw+=T*a*t; ws+=T*a; T*=1.-a;
      if(T<.03) break;
    }
  }
  if(ws<=0.) return vec4(0.);
  float tm=tw/ws, Tr=exp(-rkOD(C.y,v.y*tm,tm)*.95), A=(1.-T)*(1.-smoothstep(20000.,32000.,tm));
  vec3 col=acc/max(1.-T,1e-3);
  return vec4((col*Tr+rkSkyBase(v,hor)*(1.-Tr))*A,A);
}
#endif
`;

// The far land: the 8 km far height window downsampled to 256 x 256 at 32 m (R16F, linear), raymarched in the dome past
// the draw distance. uniform rkFarO: x/z origin, size (m), ready.
export const RK_FAR_GLSL = /* glsl */`
uniform sampler2D rkFarT; uniform vec4 rkFarO;
float rkFarH(vec2 xz){ vec2 u=(xz-rkFarO.xy)/rkFarO.z; return (u.x<0.||u.y<0.||u.x>1.||u.y>1.)?-20.:texture2D(rkFarT,u).r; }
float rkFarEdge(vec2 xz){ vec2 u=(xz-rkFarO.xy)/rkFarO.z; return min(min(u.x,u.y),min(1.-u.x,1.-u.y))*rkFarO.z; }
// first hit of the ray with max(height, sea) between t0 and t1; returns t or -1
float rkFarHit(vec3 C, vec3 v, float t0, float t1){
  float t=t0, tp=t0;
  for(int i=0;i<RK_FAR_STEPS;i++){
    vec3 p=C+v*t; float dd=p.y-max(rkFarH(p.xz),0.);
    if(dd<0.){ float a=tp, b=t;
      for(int k=0;k<5;k++){ float m=(a+b)*.5; vec3 q=C+v*m; if(q.y<max(rkFarH(q.xz),0.)) b=m; else a=m; }
      return b; }
    tp=t; t+=max(t*.022,dd*.55);
    if(t>t1) break;
  }
  return -1.;
}
`;

// ---------------------------------------------------------------------------------------------------- the fog chunks
let installed = false;
export function installAtmosphere() {
  if (installed) return; installed = true;
  const add = u => { if (!u.fogColor) return; u.rkHaze = { value: HAZE.haze }; u.rkHazeSun = { value: HAZE.sun }; u.rkHazeSea = { value: HAZE.sea }; u.rkHazeZen = { value: HAZE.zenith }; u.rkHazeSunC = { value: HAZE.sunCol }; };
  add(THREE.UniformsLib.fog);
  for (const k in THREE.ShaderLib) add(THREE.ShaderLib[k].uniforms);
  const C = THREE.ShaderChunk;
  C.fog_pars_vertex = C.fog_pars_vertex.replace('varying float vFogDepth;', 'varying float vFogDepth; varying vec3 vRkRay;');
  // world-space eye -> vertex: the view rotation transposed (row-vector product), per eye in XR
  C.fog_vertex = C.fog_vertex.replace(/#endif\s*$/, '\tvRkRay = ( vec4( mvPosition.xyz, 0.0 ) * viewMatrix ).xyz;\n#endif');
  C.fog_pars_fragment = C.fog_pars_fragment.replace('varying float vFogDepth;', 'varying float vFogDepth; varying vec3 vRkRay;\n' + RK_HAZE_GLSL);
  const mixLine = 'gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );';
  if (!C.fog_fragment.includes(mixLine) || !C.fog_vertex.includes('vRkRay')) throw new Error('RenderKit sky: Three fog chunks changed; update atmosphere.js');
  // physical haze, and past fogNear the object dissolves (screen door) into what is behind it: the terrain's own far
  // look, then the dome's far land. rkHaze.z between 0 and 1 (the cave swing) blends with the classic fog colour.
  C.fog_fragment = C.fog_fragment.replace(mixLine, `if( rkHaze.z > 0.0 ) {
		#ifndef FOG_EXP2
		if( rkHaze.z > 0.5 && ${IGN} < fogFactor ) discard;
		#endif
		gl_FragColor.rgb = mix( mix( gl_FragColor.rgb, fogColor, fogFactor ), rkAerial( gl_FragColor.rgb, vRkRay, fogColor ), rkHaze.z );
	} else gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );`);
}

// ---------------------------------------------------------------------------------------------------- noise texture
function cloudNoise(N = 256) {
  const hash = (x, y, s) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (x, y, P, s) => { const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(i % P, j % P, s), b = hash((i + 1) % P, j % P, s), c = hash(i % P, (j + 1) % P, s), d = hash((i + 1) % P, (j + 1) % P, s);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; };
  const fbm = (x, y, P0, oct, s, billow) => { let f = 0, a = 0.5, n = 0, P = P0; for (let o = 0; o < oct; o++) { let q = vnoise(x * P, y * P, P, s + o * 17); if (billow) q = 1 - Math.abs(q * 2 - 1); f += q * a; n += a; a *= 0.5; P *= 2; } return f / n; };
  const d = new Uint8Array(N * N * 4);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i / N, y = j / N, k = (j * N + i) * 4;
    // R: the cumulus field (cells ~1.5-2 km at the 9 km tile), stretched so coverage thresholds spread evenly
    const r = fbm(x, y, 5, 5, 1, false), g = fbm(x, y, 8, 4, 2, false), b = fbm(x, y, 12, 3, 3, true);
    d[k] = Math.max(0, Math.min(255, (r - 0.5) * 1.9 * 255 + 128)); d[k + 1] = g * 255; d[k + 2] = b * 255; d[k + 3] = 255;
  }
  const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t;
}

const DOME_VS = /* glsl */`varying vec3 vRkDir; void main(){ vRkDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
// The dome's colour along a ray (display): far land / far sea below, sky + sun above, clouds over both.
const domeFS = env => /* glsl */`
varying vec3 vRkDir; uniform vec3 uFog; uniform float rkDraw;
${RK_HAZE_GLSL}
${RK_CLOUD_GLSL}
${env ? '' : RK_FAR_GLSL}
vec3 rkToLinear(vec3 c){ c=max(c,0.); return mix(pow(c*.9478673+.0521327,vec3(2.4)),c*.0773994,vec3(lessThanEqual(c,vec3(.04045)))); }
void main(){
  vec3 v=normalize(vRkDir), C=cameraPosition, hor=uFog;
  vec3 col; float tG=1e9;
  ${env ? `col=v.y<0.?mix(hor,vec3(.29,.34,.33),smoothstep(0.,.25,-v.y)):rkSkyBase(v,hor);` : `
  col=rkSkyBase(v,hor);
  if(v.y<.02){
    // the land past the draw distance (the terrain fades into exactly this), then the sea plane
    float tS=v.y<-1e-4?max(C.y,.1)/-v.y:1e9, t0=max(rkDraw*.94,v.y<0.?(C.y-1600.)/-v.y:0.), t1=min(tS,9000.);
    { vec2 lo=rkFarO.xy-C.xz, hi=lo+rkFarO.z, vx=v.xz+vec2(1e-6);   // stop where the ray leaves the far window (its edge fades to sea)
      vec2 te=max(lo/vx,hi/vx); t1=min(t1,min(te.x,te.y)); }
    float tH=-1.;
    if(rkFarO.w>.5 && t1>t0 && C.y+v.y*t0<1600.) tH=rkFarHit(C,v,t0,t1);
    if(tH>0.){
      vec3 p=C+v*tH; float e=16.;
      vec3 n=normalize(vec3(rkFarH(p.xz-vec2(e,0.))-rkFarH(p.xz+vec2(e,0.)),2.*e,rkFarH(p.xz-vec2(0.,e))-rkFarH(p.xz+vec2(0.,e))));
      vec3 g=p.y>.5?rkFarLand(p,n):rkFarSeaCol(v,hor);
      g*=rkCloudShade(p);
      g=mix(rkFarSeaCol(v,hor),g,smoothstep(0.,500.,rkFarEdge(p.xz)));   // fades out towards the window's edge (no pop when it moves)
      col=rkAerial(g,v*tH,hor); tG=tH;
    } else if(tS<1e8){
      vec3 p=C+v*tS;
      col=rkAerial(rkFarSeaCol(v,hor)*rkCloudShade(p),v*tS,hor); tG=tS;
    }
  }`}
  if(tG>1e8){   // the sun: a disc, a tight halo, the wider glow is in rkSkyBase
    float mu=dot(v,rkHazeSun.xyz), disc=smoothstep(.99982,.99990,mu), halo=pow(max(mu,0.),900.)*.55+pow(max(mu,0.),5000.)*.8;
    col+=rkHazeSunC*(disc*3.+halo);
  }
  // from above the cloud base, rays that meet the base inside the cloud floor (drawn within the far plane, over the
  // terrain) get their clouds there; the dome draws them only past it, so nothing is composited twice
  bool rkOnFloor=false;
  if(C.y>rkCloudL.x && v.y<0.){ float dy=C.y-rkCloudL.x; vec2 pb=v.xz*(dy/-v.y); rkOnFloor=dot(pb,pb)<(rkDraw*rkDraw*.9409-dy*dy)*.9994; }
  vec4 cl=rkOnFloor?vec4(0.):rkClouds(C,v,tG,hor);
  col=col*(1.-cl.a)+cl.rgb;
  gl_FragColor=vec4(col,1.);
  #ifndef RK_DISPLAY_OUT
  gl_FragColor.rgb=rkToLinear(gl_FragColor.rgb);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #endif
}`;
// Seen from above (or inside) the slab: the clouds between the eye and the cloud base, over whatever is drawn below.
const FLOOR_VS = /* glsl */`varying vec3 vRkW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vRkW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
const FLOOR_FS = /* glsl */`
varying vec3 vRkW; uniform vec3 uFog;
${RK_HAZE_GLSL}
${RK_CLOUD_GLSL}
void main(){
  if(cameraPosition.y<=rkCloudL.x) discard;
  vec3 r=vRkW-cameraPosition; float d=length(r); vec3 v=r/d;
  vec4 cl=rkClouds(cameraPosition,v,d,uFog);
  if(cl.a<.002) discard;
  gl_FragColor=vec4(cl.rgb/cl.a,cl.a);
  #ifndef RK_DISPLAY_OUT
  gl_FragColor.rgb=pow(max(gl_FragColor.rgb,0.),vec3(2.2));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #endif
}`;

// sRGB canvas + no tone mapping: write display values as they are (renderkit/world.js linearOutput pattern)
function displayOut(m) {
  m.onBeforeCompile = p => { if (p.toneMapping === THREE.NoToneMapping && p.outputColorSpace === THREE.SRGBColorSpace) p.fragmentShader = '#define RK_DISPLAY_OUT\n' + p.fragmentShader; };
  return m;
}
const tierOf = () => { let q = null; try { q = new URLSearchParams(location.search).get('rksky'); } catch (e) {} return q === 'low' || q === 'high' ? q : null; };

/** The atmosphere for one scene.
 * sky: the dome mesh (kept: XR and tests find it by renderOrder -10 / SphereGeometry); sun: the DirectionalLight (read
 * every frame); uniforms: the terrain's uniforms (it receives the shared haze, cloud and far-land uniforms; uFog is
 * read from it); renderer for XR detection. update({ dt, seaState, under, cave, draw, camera }) once a frame. */
export function createAtmosphere({ scene, sky, sun, uniforms, renderer }) {
  installAtmosphere();
  const forced = tierOf();
  const cloudT = cloudNoise();
  const farData = new Uint16Array(256 * 256).fill(THREE.DataUtils.toHalfFloat(-20));
  const farT = new THREE.DataTexture(farData, 256, 256, THREE.RedFormat, THREE.HalfFloatType);
  farT.magFilter = farT.minFilter = THREE.LinearFilter; farT.generateMipmaps = false; farT.needsUpdate = true;
  const U = {
    rkHaze: { value: HAZE.haze }, rkHazeSun: { value: HAZE.sun }, rkHazeSea: { value: HAZE.sea }, rkHazeZen: { value: HAZE.zenith }, rkHazeSunC: { value: HAZE.sunCol },
    rkCloudT: uniform(cloudT), rkCloud: uniform(new THREE.Vector4(ATMO.coverFair, 0, 0, 0)), rkCloudL: uniform(new THREE.Vector4(ATMO.cloudBase, ATMO.cloudThick, ATMO.cloudScale, 0.38)),
    rkFarT: uniform(farT), rkFarO: uniform(new THREE.Vector4(0, 0, 1, 0)), rkDraw: uniform(720),
  };
  Object.assign(uniforms, U);   // the terrain shares them (same objects)
  const shared = { ...U, uFog: uniforms.uFog };
  const domeMat = tier => displayOut(new THREE.ShaderMaterial({ name: 'RenderKit/atmosphere-' + tier, side: THREE.BackSide, depthWrite: false, fog: false, uniforms: shared,
    defines: tier === 'high' ? { RK_CLOUD_STEPS: 28, RK_FAR_STEPS: 56, RK_CLOUD_DETAIL: 1 } : { RK_CLOUD_STEPS: 12, RK_FAR_STEPS: 28 },
    vertexShader: DOME_VS, fragmentShader: domeFS(false) }));
  const mats = { high: domeMat('high'), low: domeMat('low') };
  const old = sky.material; sky.material = mats[forced || 'high']; old.dispose?.();
  // the cloud floor: transparent, after the opaque world, depth-tested; only drawn when the eye is above the cloud base
  const floorMat = tier => displayOut(new THREE.ShaderMaterial({ name: 'RenderKit/cloudfloor-' + tier, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false, uniforms: shared,
    defines: tier === 'high' ? { RK_CLOUD_STEPS: 28, RK_CLOUD_DETAIL: 1 } : { RK_CLOUD_STEPS: 12 }, vertexShader: FLOOR_VS, fragmentShader: FLOOR_FS }));
  const floors = { high: floorMat('high'), low: floorMat('low') };
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 128).rotateX(-Math.PI / 2), floors[forced || 'high']);
  floor.name = 'rkCloudFloor'; floor.frustumCulled = false; floor.renderOrder = 5; floor.visible = false;
  const _e = new THREE.Vector3();
  // radius = the dome's rkOnFloor test: the disc's rim stays inside the far plane, so it is never clipped
  floor.onBeforeRender = (r, s, cam) => {
    _e.setFromMatrixPosition(cam.matrixWorld); floor.position.set(_e.x, U.rkCloudL.value.x, _e.z);
    const dy = _e.y - U.rkCloudL.value.x, R = Math.sqrt(Math.max(0, (U.rkDraw.value * 0.97) ** 2 - dy * dy));
    floor.scale.setScalar(Math.max(1e-3, R)); floor.updateMatrixWorld();
  };
  scene.add(floor);
  const wind = [0, 0], sunCol = new THREE.Color(), zen = new THREE.Color(0x386bd9), zenStorm = new THREE.Color(0x7d8b99), _c = new THREE.Color();
  let cover = ATMO.coverFair, grey = 0, coverTo = cover;
  const A = {
    uniforms: U, materials: mats, floor, tier: forced || 'high',
    get cover() { return cover; }, get grey() { return grey; }, get coverTarget() { return coverTo; },
    get greyTarget() { return Math.min(1, Math.max(0, (coverTo - ATMO.coverFair) / (ATMO.coverStorm - ATMO.coverFair))); },
    /** the far height window from the terrain worker (d: { ox, oz, n, c, h }): 2 x 2 averaged to 256 x 256 */
    farHeights(d) {
      const N = 256, k = d.n / N | 0, h = d.h;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        let s = 0; for (let b = 0; b < k; b++) for (let a = 0; a < k; a++) s += h[(j * k + b) * d.n + i * k + a];
        farData[j * N + i] = THREE.DataUtils.toHalfFloat(s / (k * k));
      }
      farT.needsUpdate = true;
      // texel (i, j) covers samples i*k..i*k+k-1: its centre is ox + (i*k + (k-1)/2) * c
      U.rkFarO.value.set(d.ox - d.c / 2, d.oz - d.c / 2, d.n * d.c, 1);
    },
    /** the env (PMREM) variant: sky, sun and clouds over a darker ground, no far land */
    envMaterial() { return displayOut(new THREE.ShaderMaterial({ name: 'RenderKit/atmosphere-env', side: THREE.BackSide, depthWrite: false, uniforms: { ...shared, rkCloud: uniform(U.rkCloud.value.clone()) }, defines: { RK_CLOUD_STEPS: 16, RK_CLOUD_DETAIL: 1 }, vertexShader: DOME_VS, fragmentShader: domeFS(true) })); },
    /** the current zenith colour (LINEAR, into out) for the sea's sky reflection */
    zenith(out) { return out.setRGB(HAZE.zenith[0], HAZE.zenith[1], HAZE.zenith[2]).convertSRGBToLinear(); },
    // the weather the environment was last built for (world.js rebuilds on a change of this bucket)
    weatherBucket: () =>   /* the TARGET weather: one rebuild per change, not one per quarter step of the cross-fade */ Math.round(Math.min(1, Math.max(0, (coverTo - ATMO.coverFair) / (ATMO.coverStorm - ATMO.coverFair))) * 4),
    update({ dt = 0, seaState = 3, under = false, cave = 0, draw = 720, xr = false, camY = 0 } = {}) {
      // the sun from the DirectionalLight, every frame (the light agent may move or recolour it)
      _e.copy(sun.position).normalize(); HAZE.sun[0] = _e.x; HAZE.sun[1] = _e.y; HAZE.sun[2] = _e.z;
      sunCol.copy(sun.color).convertLinearToSRGB(); HAZE.sunCol[0] = sunCol.r; HAZE.sunCol[1] = sunCol.g; HAZE.sunCol[2] = sunCol.b;
      // weather: sea state 0-4 fair cumulus, 5-7 more and greyer cloud, a greyer zenith, thicker haze
      const w = Math.min(1, Math.max(0, (seaState - 4) / 3));
      coverTo = ATMO.coverFair + (ATMO.coverStorm - ATMO.coverFair) * (w * w * 0.6 + w * 0.4);
      cover += (coverTo - cover) * Math.min(1, dt * 0.35 + (A._first ? 1 : 0));
      grey = Math.min(1, Math.max(0, (cover - ATMO.coverFair) / (ATMO.coverStorm - ATMO.coverFair)));
      A._first = false;
      U.rkCloud.value.x = cover; U.rkCloud.value.y = grey; U.rkCloudL.value.x = ATMO.cloudBase - 400 * grey; U.rkCloudL.value.y = ATMO.cloudThick + 250 * grey;   // a rough sea: lower, deeper, greyer cloud
      wind[0] += ATMO.wind[0] * dt; wind[1] += ATMO.wind[1] * dt;   // frozen on pause (dt 0)
      U.rkCloud.value.z = wind[0] % (ATMO.cloudScale * 8); U.rkCloud.value.w = wind[1] % (ATMO.cloudScale * 8);
      _c.copy(zen).lerp(zenStorm, grey * 0.7).convertLinearToSRGB(); HAZE.zenith[0] = _c.r; HAZE.zenith[1] = _c.g; HAZE.zenith[2] = _c.b;
      HAZE.haze[0] = ATMO.density * (1 + grey * 0.8); HAZE.haze[1] = 1 / ATMO.scaleHeight; HAZE.haze[3] = ATMO.mie * (1 - grey * 0.75);
      HAZE.sea[3] = 0.6 * (1 - grey);
      // classic fog under water and in the cave swing
      HAZE.haze[2] = under ? 0 : 1 - Math.min(1, cave * 4);
      U.rkDraw.value = draw;
      const tier = forced || (xr ? 'low' : 'high');
      if (A.tier !== tier) { A.tier = tier; sky.material = mats[tier]; floor.material = floors[tier]; }
      floor.visible = !under && cave < 0.01 && camY > U.rkCloudL.value.x - 30;
    },
    /** classic one-colour fog for a special render (a thermal sight swaps every material and greys the fog) */
    suspend(on) { if (on) { if (A._held === undefined) { A._held = HAZE.haze[2]; HAZE.haze[2] = 0; } } else if (A._held !== undefined) { HAZE.haze[2] = A._held; A._held = undefined; } },
    // fx.js fades its CPU particles by fog.near/far: they get the classic-style ramp starting where the haze is ~25 %
    fxFog(fog) { A._fx = A._fx || { color: new THREE.Color(), near: 0, far: 0 }; A._fx.color.copy(fog.color); A._fx.near = fog.far * 0.35; A._fx.far = fog.far; return A._fx; },
    dispose() { scene.remove(floor); floor.geometry.dispose(); for (const m of [...Object.values(mats), ...Object.values(floors)]) m.dispose(); cloudT.dispose(); farT.dispose(); },
  };
  A._first = true;
  A.update({ seaState: 3 });
  return A;
}
