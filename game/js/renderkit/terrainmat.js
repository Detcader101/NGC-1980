// RENDERKIT terrain (ngc/look-terrain): texture-based ground materials for the terrain shader in main.js.
//
// The user (2026-10-27): "the terrain and buildings need to have high fidelity assets ... We need to go away from the
// blocky feeling. This isn't a retro game anymore." The bar is Arma Reforger's ground. Before this module the terrain
// was flat palette colours over a 6 m Zarch checker, a little ALU noise, and faceted per-triangle normals.
//
// What this module does:
// - Generates, ONCE at load and on the GPU (no image assets, nothing downloaded), a set of tileable PBR-ish layers:
//   albedo + height (array A) and normal + roughness + cavity AO (array B), 14 layers x 512^2 (256^2 on the low tier):
//   lush / dry / meadow grass, soil, mud, forest floor, stratified cliff rock, granite, dry and wet sand, snow, gravel,
//   tarmac and farm track. Each layer's albedo is its BASE colour (below) times a pattern that averages ~1, so at a
//   distance (deep mips) every layer converges to its base colour: the far land, the clutter tufts and this agree.
//   One layer is drawn per frame (generation is spread over ~28 frames, the terrain keeps its classic look until ready).
//   Mipmapped (trilinear) with anisotropic filtering.
// - RT_GLSL (compiled into the terrain shader under RK_TERRAIN): splat weights from the zone's per-point surface map,
//   island geology, height, slope and noise; the strongest 2-4 layers sampled, height-blended (grass grows into the
//   cracks of the rock instead of a linear fade), anti-tiled (two offset samples per layer blended on a noise, with the
//   uv derivatives kept so mips never seam), triplanar on steep rock (strata run level round a cliff), normal-mapped and
//   with a cheap sun specular from the roughness (wet sand, mud, snow, tarmac).
// - The grass family's mean colour (rtGrassMean) is shared with the nature clutter tufts, and FAR_GLSL hands depth-sky's
//   rkFarLand the same averages, so the 0.6-1.0 x draw hand-over shows no colour step.
// Tiers (?rkterrain=high|med|low, saved tz_rkterrain; XR switches to low for the session): see TERRAIN_TIERS.
// Gate: RK 'terrain' with RK 'world' (main.js defines RK_TERRAIN only with RK_WORLD). ?rk=0 is untouched.
import * as THREE from 'three';
import { RK } from './adopt.js';

// ------------------------------------------------------------------------------------------------- tiers
// layers: how many splat layers a pixel samples (near); anti: anti-tiling (2 samples a layer) within antiR metres;
// tri: triplanar steep rock; res: texture size; spec: sun specular. nearR: full treatment radius (m).
export const TERRAIN_TIERS = Object.freeze({
  low: Object.freeze({ layers: 2, anti: 0, tri: 0, res: 256, spec: 0, nearR: 60 }),
  med: Object.freeze({ layers: 3, anti: 1, tri: 1, res: 512, spec: 1, nearR: 120 }),
  high: Object.freeze({ layers: 4, anti: 1, tri: 1, res: 512, spec: 1, nearR: 220 }),
});
export const TERRAIN_ON = RK.on('terrain') && RK.on('world');
export function terrainTierName(renderer = null) {
  let q = null, saved = null;
  try { q = new URLSearchParams(location.search).get('rkterrain'); } catch (e) {}
  try { saved = localStorage.getItem('tz_rkterrain'); } catch (e) {}
  const v = (q ?? saved ?? 'high').trim().toLowerCase();
  if (q && TERRAIN_TIERS[v]) try { localStorage.setItem('tz_rkterrain', v); } catch (e) {}
  if (!q && !saved && renderer && softwareGL(renderer)) return 'low';   // (ngc/look-terrain) a CPU rasteriser pays for every splat sample: the low tier unless asked
  return TERRAIN_TIERS[v] ? v : 'high';
}
// SwiftShader / llvmpipe / Microsoft Basic Render: no GPU (headless tests, broken drivers)
export function softwareGL(renderer) {
  try { const gl = renderer.getContext(), e = gl.getExtension('WEBGL_debug_renderer_info'), s = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); return /swiftshader|llvmpipe|softpipe|basic render/i.test(s); } catch (e) { return false; }
}

// ------------------------------------------------------------------------------------------------- layers
// base: the layer's mean colour (DISPLAY values, the space the terrain shader shades in); tile: metres per texture
// repeat; bump: the height texture's amplitude in metres (normal strength); rough: base roughness; tri: triplanar on steep.
export const TL = Object.freeze({ GRASS: 0, DRY: 1, MEADOW: 2, SOIL: 3, MUD: 4, FOREST: 5, CLIFF: 6, GRANITE: 7, SAND: 8, WETSAND: 9, SNOW: 10, GRAVEL: 11, TARMAC: 12, TRACK: 13 });
export const TER_LAYERS = [
  { id: 'grass', base: [0.19, 0.40, 0.13], tile: 2.4, bump: 0.035, rough: 0.92 },
  { id: 'dry', base: [0.42, 0.43, 0.23], tile: 2.4, bump: 0.03, rough: 0.94 },
  { id: 'meadow', base: [0.25, 0.44, 0.16], tile: 2.0, bump: 0.025, rough: 0.9 },
  { id: 'soil', base: [0.40, 0.32, 0.22], tile: 3.2, bump: 0.05, rough: 0.95 },
  { id: 'mud', base: [0.27, 0.23, 0.17], tile: 3.6, bump: 0.04, rough: 0.55 },
  { id: 'forest', base: [0.26, 0.23, 0.15], tile: 3.2, bump: 0.035, rough: 0.95 },
  { id: 'cliff', base: [0.50, 0.46, 0.40], tile: 9.0, bump: 0.35, rough: 0.85, tri: 1 },
  { id: 'granite', base: [0.53, 0.52, 0.49], tile: 7.0, bump: 0.3, rough: 0.8, tri: 1 },
  { id: 'sand', base: [0.80, 0.73, 0.53], tile: 4.0, bump: 0.025, rough: 0.95 },
  { id: 'wetsand', base: [0.55, 0.49, 0.36], tile: 4.0, bump: 0.012, rough: 0.35 },
  { id: 'snow', base: [0.92, 0.94, 0.97], tile: 6.0, bump: 0.05, rough: 0.6 },
  { id: 'gravel', base: [0.52, 0.50, 0.46], tile: 2.0, bump: 0.035, rough: 0.85 },
  { id: 'tarmac', base: [0.27, 0.27, 0.28], tile: 3.0, bump: 0.006, rough: 0.8 },
  { id: 'track', base: [0.50, 0.42, 0.31], tile: 3.2, bump: 0.03, rough: 0.92 },
];
const NL = TER_LAYERS.length;
const f3 = v => `vec3(${v.map(x => x.toFixed(3)).join(',')})`;
const glArr = (type, vals) => `${type}[${vals.length}](${vals.join(',')})`;

// ------------------------------------------------------------------------------------------------- the generator
// Pass A: albedo (display) + height in [0,1]. Pass B: normal xy (tangent, 0.5 = flat) + roughness + cavity AO, from A.
// All patterns are periodic on the tile (lattice periods are integers), so the layers tile without seams.
const GEN_COMMON = /* glsl */`
precision highp float;
varying vec2 vUv;
uniform float uL;
float h12(vec2 p){ vec3 q=fract(p.xyx*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
vec2 h22(vec2 p){ vec3 q=fract(p.xyx*vec3(.1031,.1030,.0973)); q+=dot(q,q.yzx+33.33); return fract((q.xx+q.yz)*q.zy); }
`;
const GEN_A = GEN_COMMON + /* glsl */`
uniform vec3 uBase;
// periodic gradient noise, 0..1 (period P lattice cells over the tile)
float gn(vec2 x, float P){ vec2 i=floor(x), f=fract(x), u=f*f*f*(f*(f*6.-15.)+10.);
  vec2 g00=h22(mod(i,P))*2.-1., g10=h22(mod(i+vec2(1.,0.),P))*2.-1., g01=h22(mod(i+vec2(0.,1.),P))*2.-1., g11=h22(mod(i+1.,P))*2.-1.;
  float a=dot(g00,f), b=dot(g10,f-vec2(1.,0.)), c=dot(g01,f-vec2(0.,1.)), d=dot(g11,f-1.);
  return clamp(.5+.75*mix(mix(a,b,u.x),mix(c,d,u.x),u.y),0.,1.); }
// the same with separate periods per axis (stretched features that still tile)
float gnP(vec2 x, vec2 P){ vec2 i=floor(x), f=fract(x), u=f*f*f*(f*(f*6.-15.)+10.);
  vec2 g00=h22(mod(i,P))*2.-1., g10=h22(mod(i+vec2(1.,0.),P))*2.-1., g01=h22(mod(i+vec2(0.,1.),P))*2.-1., g11=h22(mod(i+1.,P))*2.-1.;
  float a=dot(g00,f), b=dot(g10,f-vec2(1.,0.)), c=dot(g01,f-vec2(0.,1.)), d=dot(g11,f-1.);
  return clamp(.5+.75*mix(mix(a,b,u.x),mix(c,d,u.x),u.y),0.,1.); }
float fbm(vec2 uv, float P, int o){ float s=0., a=.5, t=0.; for(int k=0;k<7;k++){ if(k>=o) break; s+=a*gn(uv*P+float(k)*17.31,P); t+=a; P*=2.; a*=.5; } return s/t; }
float ridge(vec2 uv, float P){ return 1.-abs(gn(uv*P,P)*2.-1.); }
// periodic Voronoi: x = F1, y = F2-F1 (edge), z = cell hash, w = second hash
vec4 vor(vec2 uv, float P, float jit){ vec2 x=uv*P, i=floor(x), f=fract(x); float d1=8., d2=8.; vec2 id=vec2(0.);
  for(int j=-1;j<=1;j++) for(int k=-1;k<=1;k++){ vec2 o=vec2(float(k),float(j)), c=mod(i+o,P); vec2 p=o+.5+(h22(c)-.5)*jit-f; float d=dot(p,p);
    if(d<d1){ d2=d1; d1=d; id=c; } else if(d<d2) d2=d; }
  d1=sqrt(d1); d2=sqrt(d2); return vec4(d1,d2-d1,h12(id+3.7),h12(id+9.1)); }
// grass blades seen from above: short tapered strokes in random directions, one per lattice cell (3x3 search)
// returns coverage; t: where along the blade (0 root .. 1 tip); id: the blade's hash
float blades(vec2 uv, float P, float len, float wid, float seed, out float t, out float id){
  vec2 x=uv*P, i=floor(x), f=fract(x); float cov=0.; t=0.; id=0.;
  for(int j=-1;j<=1;j++) for(int k=-1;k<=1;k++){ vec2 o=vec2(float(k),float(j)), c=mod(i+o,P); vec2 hh=h22(c+seed);
    vec2 a=o+hh-f; float ang=h12(c+seed+5.3)*6.2832, l=len*(.6+.4*h12(c+seed+2.1)); vec2 dir=vec2(cos(ang),sin(ang));
    float s=clamp(dot(-a,dir)/l,0.,1.); vec2 q=a+dir*s*l; float w=wid*(1.-.75*s), d=length(q);
    float cv=1.-smoothstep(w*.55,w,d); if(cv>cov){ cov=cv; t=s; id=h12(c+seed+7.7); } }
  return cov; }
void main(){
  vec2 uv=vUv; int L=int(uL+.5); vec3 c=uBase; float h=.5;
  if(L<=2){   // grass: lush (0), dry summer (1), meadow (2: shorter, clover, a few flowers)
    float dry=L==1?1.:0., mead=L==2?1.:0.;
    float m=fbm(uv,4.,4), m2=fbm(uv,12.,3);
    vec3 gap=uBase*mix(vec3(.62,.6,.5),vec3(.8,.7,.55),dry)*(.85+.3*m2);   // (ngc/look-terrain: less contrast: the blades read as a neon speckle)   // thatch and soil between the blades
    c=gap; h=.12*m2;
    float P0=mead>.5?28.:18.;
    for(int k=0;k<3;k++){ float t, id; float P=floor(P0*(1.+.55*float(k))), cv=blades(uv,P,.85,.13+.03*float(k),float(k)*31.7,t,id);
      vec3 bc=uBase*mix(.82,1.16,id)*(.88+.24*m);
      bc*=mix(vec3(1.),dry>.5?vec3(1.08,1.06,.97):vec3(1.12,1.09,.86),t*t*(.4+.6*h12(vec2(id,3.))));   // sun-bleached tips
      if(id>.86) bc=mix(bc,dry>.5?uBase*vec3(.55,.75,.45):uBase*vec3(1.35,1.2,.7),.6);   // the odd green stalk in the straw, a yellowed blade in the green
      c=mix(c,bc,cv); h=mix(h,.35+.22*float(k)+.2*(1.-t),cv); }
    if(mead>.5){   // clover leaves (rounded cells) and tiny flowers
      vec4 v=vor(uv,22.,.9); float lf=(1.-smoothstep(.22,.32,v.x))*step(.55,v.z);
      c=mix(c,uBase*vec3(.85,1.05,.9)*(.9+.2*v.w),lf); h=mix(h,.75,lf);
      vec4 fl=vor(uv,40.,.8); float fd=(1.-smoothstep(.06,.11,fl.x))*step(.93,fl.z);
      c=mix(c,fl.w>.5?vec3(.95,.93,.85):vec3(.95,.8,.25),fd); h=mix(h,1.,fd); }
  } else if(L==3||L==13){   // soil (3) / farm track (13): earth with clods, small stones, the odd dry crack
    float tr=L==13?1.:0.; vec2 wq=uv+(vec2(fbm(uv,4.,3),fbm(uv+.53,4.,3))-.5)*.08;
    float m=fbm(uv,5.,5), cl=1.-vor(wq,14.,1.).x, f2=fbm(uv,24.,3);
    c=uBase*(.8+.4*m)*(.92+.16*cl)*(.93+.14*f2); h=.3*m+.3*cl*cl+.2*f2;
    float ck=(1.-smoothstep(.0,.02,vor(wq,5.,1.).y))*smoothstep(.55,.7,fbm(uv+2.3,2.,3))*(1.-tr); c*=1.-.25*ck; h-=.2*ck;
    for(int k=0;k<2;k++){ vec4 st=vor(uv+float(k)*.37,22.+float(k)*14.+tr*8.,.9); float s=(1.-smoothstep(.16+.06*st.w,.26+.06*st.w,st.x))*step(.8-tr*.25-float(k)*.08,st.z);
      c=mix(c,mix(vec3(.5,.47,.43),vec3(.68,.64,.58),st.w)*(.8+.3*m),s); h=mix(h,.75+.25*(1.-st.x/.3),s); }
    if(tr<.5){ float t,id; float g=blades(uv,10.,.9,.12,5.,t,id)*step(.74,fbm(uv,3.,2)+.2*id); c=mix(c,vec3(.24,.4,.15)*(.8+.4*id),g); h=mix(h,.9,g); }
  } else if(L==4){   // mud: wet, smooth, churned, water standing in the hollows
    float w=fbm(uv+vec2(fbm(uv,3.,3),fbm(uv+.37,3.,3))*.15,3.,6); h=w;
    c=uBase*(.82+.36*fbm(uv,16.,3)); float pud=1.-smoothstep(.36,.42,w); c=mix(c,uBase*vec3(.7,.72,.76),pud*.6); h=mix(h,.34,pud);
  } else if(L==5){   // forest floor: needles, small leaf litter, moss
    float m=fbm(uv,6.,4); c=uBase*(.75+.5*m); h=.3*m;
    float t,id; for(int k=0;k<2;k++){ float cv=blades(uv,26.+float(k)*12.,.8,.07,float(k)*13.,t,id); c=mix(c,mix(vec3(.4,.27,.15),vec3(.56,.4,.23),id)*(.8+.4*m),cv*.8); h=mix(h,.5+.2*float(k),cv); }
    vec4 lv=vor(uv+(fbm(uv,8.,2)-.5)*.05,20.,1.); float lf=(1.-smoothstep(.2,.3,lv.x))*step(.78,lv.z); c=mix(c,mix(vec3(.38,.26,.14),vec3(.48,.36,.18),lv.w),lf*.85); h=mix(h,.8,lf);
    float moss=smoothstep(.5,.75,fbm(uv+1.7,2.,5)); c=mix(c,vec3(.2,.3,.11)*(.8+.4*fbm(uv,40.,2)),moss*.85); h=mix(h,.55+.2*fbm(uv,30.,2),moss);
  } else if(L==6){   // stratified cliff rock (on a cliff the triplanar sides put v = world height: the strata run level)
    float wv=fbm(uv,3.,3), s=uv.y*14.+wv*1.6, band=floor(s), fs=fract(s), bm=mod(band,14.);
    float tone=.82+.36*h12(vec2(bm,4.1)), prof=pow(fs,.55+.8*h12(vec2(bm,1.3)));
    float m=fbm(uv,8.,5), mb=fbm(uv,3.,4); c=uBase*tone*(.78+.44*m)*(.9+.2*mb); h=.5*prof+.35*m+.15*mb;
    float un=1.-smoothstep(0.,.1,fs); c*=1.-.4*un;   // dark undercut under each ledge
    float jt=(1.-smoothstep(0.,.018,abs(gnP(uv*vec2(9.,2.),vec2(9.,2.))-.5)))*smoothstep(.45,.6,gnP(uv*vec2(3.,7.),vec2(3.,7.))); c*=1.-.35*jt; h-=.25*jt;   // vertical joints, some beds only
    float li=smoothstep(.62,.74,fbm(uv+3.1,5.,4)); c=mix(c,mix(vec3(.72,.72,.62),vec3(.55,.58,.3),fbm(uv,30.,2)),li*.5);   // lichen
    float st=smoothstep(.55,.8,fbm(vec2(uv.x*2.,uv.y),4.,3))*smoothstep(.4,.9,1.-fs); c*=1.-.18*st;   // water streaks down the face
  } else if(L==7){   // granite: weathered rounded masses, thin irregular joints, speckle, lichen
    vec2 wq=uv+(vec2(fbm(uv,3.,4),fbm(uv+.5,3.,4))-.5)*.25;
    vec4 v=vor(wq,3.,1.); float ed=(1.-smoothstep(0.,.018,v.y))*smoothstep(.35,.55,fbm(uv+.9,4.,3));
    float m=fbm(uv,6.,6), mb=fbm(uv,2.,3), sw=1.-v.x*v.x*.5;
    c=uBase*(.86+.2*v.z)*(.72+.56*m)*(.9+.2*mb); h=.25*sw+.55*m+.2*mb-.35*ed;
    c*=1.-.45*ed;
    float sp=h12(floor(uv*512.)); c*=sp>.94?.6:sp<.04?1.3:1.;   // biotite / feldspar
    float li=smoothstep(.6,.72,fbm(uv+7.,5.,4)); c=mix(c,mix(vec3(.74,.73,.65),vec3(.6,.6,.36),fbm(uv,24.,2)),li*.55);
    float dk=smoothstep(.55,.85,fbm(uv+4.4,4.,3)); c*=1.-.2*dk;   // weathering stains
  } else if(L==8||L==9){   // sand: dry with wind ripples and shell grit (8), wet and smooth with swash lines (9)
    float wet=L==9?1.:0.; float m=fbm(uv,6.,4);
    float ph=dot(uv,vec2(11.,4.))*6.2832+fbm(uv,4.,3)*5., rp=pow(.5+.5*sin(ph),1.6);
    c=uBase*(.88+.24*m); h=mix(.4*rp+.3*m,.15*rp+.5*m,wet);
    c*=1.+mix(.08,.03,wet)*(rp-.5);
    float gr=h12(floor(uv*512.)); c*=.94+.12*gr;
    if(wet<.5){ vec4 sh=vor(uv,36.,.9); float s=(1.-smoothstep(.08,.13,sh.x))*step(.9,sh.z); c=mix(c,vec3(.92,.9,.84),s*.8); }
    else { float sw=1.-smoothstep(0.,.03,abs(fract(uv.y*3.+fbm(uv,2.,3)*1.5)-.5)-.45); c*=1.-.12*sw; }
  } else if(L==10){   // snow: soft drifts, wind-carved sastrugi
    float m=fbm(uv,3.,5), sa=fbm(vec2(uv.x*3.,uv.y)*vec2(1.,1.),8.,3);
    c=uBase*(.94+.08*m)*(.97+.06*sa); h=.6*m+.4*sa; c=mix(c,c*vec3(.92,.95,1.03),1.-m);
  } else if(L==11){   // gravel / shingle: packed rounded stones of mixed tone
    c=uBase*.45; h=.1;
    for(int k=0;k<2;k++){ vec4 v=vor(uv+float(k)*.31,16.+float(k)*10.,.9); float st=1.-smoothstep(.32,.46,v.x);
      vec3 sc=uBase*mix(.65,1.35,v.z)*mix(vec3(1.),vec3(1.08,1.,.9),v.w); float dm=1.-v.x*v.x*3.; c=mix(c,sc*(.8+.25*dm),st); h=mix(h,.4+.3*float(k)+.3*dm,st); }
  } else if(L==12){   // tarmac: dark aggregate, patch repairs, fine cracks, oil
    float m=fbm(uv,6.,4); c=uBase*(.9+.2*m); h=.5;
    float g=h12(floor(uv*512.)); c*=g>.88?1.45:g<.12?.7:1.; h+=(g-.5)*.4;
    vec2 pc=floor(uv*vec2(3.,5.)), pf=fract(uv*vec2(3.,5.)); float pat=step(.86,h12(pc+.5))*step(.08,pf.x)*step(pf.x,.75+.2*h12(pc))*step(.1,pf.y)*step(pf.y,.85); c*=1.-.07*pat; h+=.03*pat;   // rectangular patch repairs
    float ck=(1.-smoothstep(0.,.012,abs(gn(uv*5.+vec2(fbm(uv,6.,3)*1.5),5.)-.5)))*smoothstep(.62,.72,fbm(uv+.7,2.,3)); c*=1.-.4*ck; h-=.4*ck;   // fine cracks, in places
    float oil=smoothstep(.68,.8,fbm(uv+5.,4.,3)); c*=1.-.25*oil;
  }
  gl_FragColor=vec4(clamp(c,0.,1.),clamp(h,0.,1.));
}`;
// Pass B: normal from the height (finite differences across the wrap), cavity AO, roughness.
const GEN_B = GEN_COMMON + /* glsl */`
uniform highp sampler2DArray uA; uniform float uRes, uSlope, uRough;
float H(ivec2 p){ int n=int(uRes); p=(p+n)%n; return texelFetch(uA,ivec3(p,int(uL+.5)),0).a; }
void main(){
  ivec2 p=ivec2(vUv*uRes); int L=int(uL+.5);
  float hl=H(p-ivec2(1,0)), hr=H(p+ivec2(1,0)), hd=H(p-ivec2(0,1)), hu=H(p+ivec2(0,1)), h0=H(p);
  vec3 n=normalize(vec3((hl-hr)*uSlope,(hd-hu)*uSlope,1.));
  float avg=0.; for(int k=0;k<8;k++){ float a=float(k)*.785+.4; avg+=H(p+ivec2(vec2(cos(a),sin(a))*5.)); } avg/=8.;
  float ao=clamp(1.-max(0.,avg-h0)*2.2,.35,1.);
  float r=uRough;
  if(L==4) r=mix(.18,.75,smoothstep(.28,.45,h0));   // puddles shine
  if(L==9) r=mix(.22,.5,h0);
  if(L==10) r=h12(vec2(p))>.985?.08:r;   // snow glints
  if(L==6||L==7) r=mix(r,.95,1.-ao);
  gl_FragColor=vec4(n.xy*.5+.5,r,ao);
}`;
const GEN_VS = 'varying vec2 vUv; void main(){ vUv=position.xy*.5+.5; gl_Position=vec4(position.xy,0.,1.); }';

// Creates the two texture arrays and fills them over the next frames (call step() once a frame until ready).
export function createTerrainTextures(renderer, res = 512) {
  const mk = () => {
    const rt = new THREE.WebGLArrayRenderTarget(res, res, NL, { depthBuffer: false });
    const t = rt.texture; t.format = THREE.RGBAFormat; t.type = THREE.UnsignedByteType; t.colorSpace = THREE.NoColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy?.() || 1);
    return rt;
  };
  const A = mk(), B = mk();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene = new THREE.Scene();
  const uni = { uL: { value: 0 }, uBase: { value: new THREE.Vector3() }, uA: { value: A.texture }, uRes: { value: res }, uSlope: { value: 1 }, uRough: { value: 1 } };
  const matA = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: GEN_VS, fragmentShader: GEN_A, depthTest: false, depthWrite: false });
  const matB = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: GEN_VS, fragmentShader: GEN_B, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), matA); quad.frustumCulled = false; scene.add(quad);
  const T = { A: A.texture, B: B.texture, res, ready: false, ms: 0, step: 0, mean: TER_LAYERS.map(() => new THREE.Vector3(1, 1, 1)) };
  // one layer a call: A then B for that layer (B reads A's top level with texelFetch)
  T.next = () => {
    if (T.ready) return true;
    const t0 = performance.now(), L = T.step >> 1, pass = T.step & 1, Ly = TER_LAYERS[L];
    const prevRT = renderer.getRenderTarget(), prevXR = renderer.xr.enabled; renderer.xr.enabled = false;
    uni.uL.value = L; uni.uBase.value.fromArray(Ly.base); uni.uRough.value = Ly.rough;
    uni.uSlope.value = Ly.bump / (Ly.tile / res) * 0.5;   // height amplitude (m) over two texels' width (m)
    quad.material = pass ? matB : matA;
    renderer.setRenderTarget(pass ? B : A, L); renderer.render(scene, cam);
    renderer.setRenderTarget(prevRT); renderer.xr.enabled = prevXR;
    T.step++; T.ms += performance.now() - t0;
    if (T.step >= NL * 2) {
      // each layer's mean (its deepest mip) read back once: the splat scales a layer to exactly its BASE colour, so the
      // far land, the tufts and the near ground agree whatever the pattern did to the average
      const M = new THREE.WebGLRenderTarget(NL, 1, { depthBuffer: false }), buf = new Uint8Array(NL * 4);
      quad.material = new THREE.ShaderMaterial({ uniforms: uni, vertexShader: GEN_VS, fragmentShader: GEN_COMMON + 'uniform highp sampler2DArray uA; void main(){ gl_FragColor=textureLod(uA,vec3(.5,.5,floor(vUv.x*' + NL + '.)),12.); }', depthTest: false, depthWrite: false });
      renderer.xr.enabled = false; renderer.setRenderTarget(M); renderer.render(scene, cam); renderer.readRenderTargetPixels(M, 0, 0, NL, 1, buf); renderer.setRenderTarget(prevRT); renderer.xr.enabled = prevXR;
      T.mean = TER_LAYERS.map((l, i) => new THREE.Vector3(...[0, 1, 2].map(c => l.base[c] / Math.max(0.02, buf[i * 4 + c] / 255))));
      M.dispose(); quad.material.dispose();
      T.ready = true; matA.dispose(); matB.dispose(); quad.geometry.dispose();
    }
    return T.ready;
  };
  return T;
}

// ------------------------------------------------------------------------------------------------- shared GLSL
// The grass family's weights (lush, dry, meadow) at a point: the same noise for the terrain and the clutter tufts.
// Needs rkN2 (renderkit/world.js RK_TERRAIN_GLSL).
export const RT_GRASS_GLSL = /* glsl */`
vec3 rtGrassW(vec2 xz, float y){
  float dry=smoothstep(.58,.9,rkN2(xz*.045+11.)*.8+rkN2(xz*.31+2.)*.2)*.65+smoothstep(140.,320.,y)*.35;   // (dry swards: partial, larger and softer - full straw blobs read as mud from the air)
  float mead=smoothstep(.5,.78,rkN2(xz*.023+5.3))*(1.-smoothstep(60.,160.,y));
  dry=clamp(dry,0.,1.); mead*=1.-dry;
  return vec3(max(0.,1.-dry-mead),dry,mead);
}
float rtMacro(vec2 xz){ return rkN2(xz*.011)*.55+rkN2(xz*.047+3.1)*.3+rkN2(xz*.19+7.7)*.15; }   // 0..1, ~90 / 21 / 5 m
vec3 rtGrassMean(vec2 xz, float y){ vec3 w=rtGrassW(xz,y); float m=rtMacro(xz);
  return (${f3(TER_LAYERS[0].base)}*w.x+${f3(TER_LAYERS[1].base)}*w.y+${f3(TER_LAYERS[2].base)}*w.z)*(.86+.28*m)*mix(vec3(1.),vec3(1.06,1.03,.9),smoothstep(.55,.9,m)); }
`;

// The far land (depth-sky's rkFarLand, atmosphere.js) under RK_TERRAIN: the deep-mip averages of the same layers, mixed
// by the share each has over open country (estimated in JS below from the same noise), so the near terrain dissolving into
// the far land at 0.6-1.0 x draw keeps its colour.
export function rkN2js(x, y) {   // (= rkN2, for CPU-side placement that must agree with the shader)
  const H = (a, b) => { let q0 = (a * 0.1031) % 1, q1 = (b * 0.1031) % 1, q2 = (a * 0.1031) % 1; if (q0 < 0) q0 += 1; if (q1 < 0) q1 += 1; if (q2 < 0) q2 += 1;
    const d = q0 * (q1 + 33.33) + q1 * (q2 + 33.33) + q2 * (q0 + 33.33); q0 += d; q1 += d; q2 += d; const v = ((q0 + q1) * q2) % 1; return v < 0 ? v + 1 : v; };
  const i = Math.floor(x), j = Math.floor(y); let fx = x - i, fy = y - j; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const a = H(i, j), b = H(i + 1, j), c = H(i, j + 1), d = H(i + 1, j + 1);
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}
export const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export function grassAverage(y = 40) {   // mean grass colour (display) at height y over open country
  const acc = [0, 0, 0]; let n = 0;
  for (let k = 0; k < 4000; k++) {
    const x = (k * 97.31) % 9000, z = Math.floor(k * 0.6180339 * 9000) % 9000;
    let dry = sstep(0.58, 0.9, rkN2js(x * 0.045 + 11, z * 0.045 + 11) * 0.8 + rkN2js(x * 0.31 + 2, z * 0.31 + 2) * 0.2) * 0.65 + sstep(140, 320, y) * 0.35;   // (= rtGrassW)
    let mead = sstep(0.5, 0.78, rkN2js(x * 0.023 + 5.3, z * 0.023 + 5.3)) * (1 - sstep(60, 160, y));
    dry = Math.min(1, dry); mead *= 1 - dry; const w = [Math.max(0, 1 - dry - mead), dry, mead];
    const m = rkN2js(x * 0.011, z * 0.011) * 0.55 + rkN2js(x * 0.047 + 3.1, z * 0.047 + 3.1) * 0.3 + rkN2js(x * 0.19 + 7.7, z * 0.19 + 7.7) * 0.15;
    for (let c = 0; c < 3; c++) acc[c] += (TER_LAYERS[0].base[c] * w[0] + TER_LAYERS[1].base[c] * w[1] + TER_LAYERS[2].base[c] * w[2]) * (0.86 + 0.28 * m) * (c === 2 ? 1 - 0.1 * sstep(0.55, 0.9, m) : 1 + (c ? 0.03 : 0.06) * sstep(0.55, 0.9, m));
    n++;
  }
  return acc.map(v => v / n);
}
let _far = null;
export function farLandGLSL() {   // -> the body that replaces rkFarLand's palette under RK_TERRAIN
  if (_far) return _far;
  const lo = grassAverage(30), hi = grassAverage(220), B = TER_LAYERS.map(l => l.base);
  const rock = B[TL.CLIFF].map((v, i) => v * 0.5 + B[TL.GRANITE][i] * 0.5).map((v, i) => v * [0.92, 0.88, 0.82][i]);   // wild rock: the brownish tint the terrain gives it
  _far = `
  vec3 c=mix(${f3(lo)},${f3(hi)},smoothstep(60.,220.,p.y));
  c=mix(c,${f3(rock)},max(smoothstep(170.,300.,p.y),smoothstep(.3,.55,sl)));
  c=mix(c,${f3(B[TL.SNOW])},smoothstep(440.,520.,p.y)*(1.-smoothstep(.35,.7,sl)));
  c=mix(${f3(B[TL.SAND].map(v => v * 0.92))},c,smoothstep(0.,4.,p.y));`;
  return _far;
}

// The splat (terrain fragment shader, RK_TERRAIN; needs rkN2 / rkH2 and RT_GRASS_GLSL). Inputs: world position P, the
// smooth normal N, the weights w[] (any scale; the strongest few are used), the zone tints, the eye distance.
// Out: albedo (display), the perturbed normal, roughness, AO.
export const RT_GLSL = /* glsl */`
uniform highp sampler2DArray uTA, uTN;
uniform vec4 uTer;    // x: ready (0/1), y: layers near (2-4), z: anti-tiling + triplanar on (0/1), w: full-detail radius (m)
uniform float uTerSpec; uniform vec3 uTerK[${NL}];   // base / measured mean, per layer
const float RT_TILE[${NL}]=${glArr('float', TER_LAYERS.map(l => (1 / l.tile).toFixed(5)))};   // 1 / metres per repeat
const vec3 RT_BASE[${NL}]=${glArr('vec3', TER_LAYERS.map(l => f3(l.base)))};
const float RT_TRI[${NL}]=${glArr('float', TER_LAYERS.map(l => (l.tri ? 1 : 0).toFixed(1)))};
struct RtOut { vec3 a; vec3 n; float r; float ao; };
// one layer: an anti-tiled planar sample (two offsets chosen per noise cell, blended on the noise with the colour
// difference sharpening the seam; the uv derivatives are kept so the mips never seam), or triplanar (three projections)
// on steep rock. A: albedo + height; R: roughness, AO; D: the bump as a world-space tilt.
void rtSample(int L, vec3 P, vec3 N, float k, float near, float tri, out vec4 A, out vec2 R, out vec3 D){
  float s=RT_TILE[L], fl=float(L);
  vec2 uv=P.xz*s, dx=dFdx(uv), dy=dFdy(uv); vec4 B;
  if(near>.5){
    float i=floor(k), f=fract(k);
    vec2 o1=vec2(rkH2(vec2(i,3.1)),rkH2(vec2(i,7.7))), o2=vec2(rkH2(vec2(i+1.,3.1)),rkH2(vec2(i+1.,7.7)));
    vec4 a1=textureGrad(uTA,vec3(uv+o1,fl),dx,dy), a2=textureGrad(uTA,vec3(uv+o2,fl),dx,dy);
    vec4 b1=textureGrad(uTN,vec3(uv+o1,fl),dx,dy), b2=textureGrad(uTN,vec3(uv+o2,fl),dx,dy);
    float t=smoothstep(.2,.8,f-.1*dot(a1.rgb-a2.rgb,vec3(1.)));
    A=mix(a1,a2,t); B=mix(b1,b2,t);
  } else { A=textureGrad(uTA,vec3(uv,fl),dx,dy); B=textureGrad(uTN,vec3(uv,fl),dx,dy); }
  A.rgb*=uTerK[L];
  D=vec3(B.x-.5,0.,B.y-.5); R=B.zw;
  if(tri>.5 && RT_TRI[L]>.5){   // steep: the side projections, strata level with the world (v = height)
    vec3 bw=pow(abs(N),vec3(4.)); bw/=bw.x+bw.y+bw.z;
    vec2 ux=P.zy*s, uz=P.xy*s;
    vec4 ax=texture(uTA,vec3(ux,fl)), az=texture(uTA,vec3(uz,fl)), bx=texture(uTN,vec3(ux,fl)), bz=texture(uTN,vec3(uz,fl));
    A=A*bw.y+vec4(ax.rgb*uTerK[L],ax.a)*bw.x+vec4(az.rgb*uTerK[L],az.a)*bw.z; R=R*bw.y+bx.zw*bw.x+bz.zw*bw.z;
    D=D*bw.y+vec3(0.,bx.y-.5,bx.x-.5)*bw.x+vec3(bz.x-.5,bz.y-.5,0.)*bw.z;
  }
}
// (ngc/look-terrain) how much of the small detail to keep: 1 on foot, 0 where a pixel covers more ground than the
// detail has (from the screen-space footprint). The blades / pebbles / cracks are mipmapped, but the normal map's
// lighting, the height blend and the specular are non-linear in them, so a minified texel still flickers (the "grainy"
// ground from a Huey at 200 m and the jet). Past the footprint they fade to the layer's mean colour and a flat normal;
// the macro variation (rtMacro, the splat weights) carries the look from the air.
float rtDetail(vec3 P){
  #ifdef RT_NOFADE
  return 1.;   // (?rkgrain: the old full-detail ground, for A/B)
  #endif
  vec3 a=dFdx(P), b=dFdy(P); float fp=sqrt(max(dot(a,a),dot(b,b))); return 1.-smoothstep(.035,.22,fp); }
RtOut rtSplat(vec3 P, vec3 N, float w[${NL}], vec3 tint[${NL}], float dist, float hblend){
  RtOut o; o.a=vec3(0.); o.n=N; o.r=1.; o.ao=1.;
  float det=rtDetail(P); hblend*=det;
  float near=uTer.z*(1.-step(uTer.w,dist)), tri=near*step(.22,1.-N.y);
  int K=int(uTer.y+.5); if(dist>uTer.w*1.8) K=min(K,2);
  float k=(rkN2(P.xz*.11)*.7+rkN2(P.xz*.37+5.)*.3)*8.;   // anti-tiling: which offsets where (cells ~3-9 m)
  // the strongest K layers
  int id[4]; float wt[4]; float tot=0.;
  for(int j=0;j<4;j++){ id[j]=0; wt[j]=0.; if(j>=K) continue; float best=-1.; int bi=0;
    for(int L=0;L<${NL};L++){ bool used=false; for(int q=0;q<4;q++){ if(q<j && id[q]==L) used=true; } if(!used && w[L]>best){ best=w[L]; bi=L; } }
    id[j]=bi; wt[j]=max(best,0.); tot+=wt[j]; }
  tot=max(tot,1e-4);
  vec4 A[4]; vec2 R[4]; vec3 D[4]; float hm=-1.;
  for(int j=0;j<4;j++){ A[j]=vec4(0.); R[j]=vec2(1.); D[j]=vec3(0.); if(j>=K||wt[j]<=.001) continue;
    rtSample(id[j],P,N,k,near,tri,A[j],R[j],D[j]); hm=max(hm,A[j].a*hblend+wt[j]/tot); }
  // height blend: a layer shows where its height + weight is within .2 of the highest (grass in the cracks of the rock)
  float bs=0.; vec3 a=vec3(0.), d=vec3(0.); vec2 r=vec2(0.);
  for(int j=0;j<4;j++){ if(j>=K||wt[j]<=.001) continue; float b=max(A[j].a*hblend+wt[j]/tot-hm+.2,0.); b*=b;
    a+=mix(RT_BASE[id[j]],A[j].rgb,.25+.75*det)*tint[id[j]]*b; d+=D[j]*b; r+=mix(vec2(R[j].x,1.),R[j],det)*b; bs+=b; }
  bs=max(bs,1e-5); o.a=a/bs; d/=bs; r/=bs; o.r=r.x; o.ao=r.y;
  d-=N*dot(d,N);   // the bump as a tilt of the smooth normal
  o.n=normalize(N+d*2.*det);
  return o;
}
// a cheap sun specular from the roughness (display values): wet sand, mud, snow glints, tarmac
vec3 rtSpec(vec3 n, vec3 V, vec3 L, float r, vec3 sunC){
  vec3 H=normalize(V+L); float a=max(r*r,.02), sh=2./(a*a)-2.;
  float s=pow(max(dot(n,H),0.),min(sh,2048.))*(sh+8.)/25.;
  float F=.04+.96*pow(1.-max(dot(V,H),0.),5.);
  return sunC*s*F*max(dot(n,L),0.)*uTerSpec;
}
`;

// ------------------------------------------------------------------------------------------------- host glue
// uniforms for the terrain shader; update(dt, renderer, xr) steps the generator and the tier.
export function createTerrainMaterial(renderer, tierName = terrainTierName(renderer)) {
  let tier = TERRAIN_TIERS[tierName];
  const tex = createTerrainTextures(renderer, tier.res);
  const uniforms = { uTA: { value: tex.A }, uTN: { value: tex.B }, uTer: { value: new THREE.Vector4(0, tier.layers, tier.anti, tier.nearR) }, uTerSpec: { value: tier.spec }, uTerK: { value: tex.mean } };
  const S = { uniforms, tex, tierName, get ready() { return tex.ready; }, stats: () => ({ tier: S.tierName, ready: tex.ready, genMs: +tex.ms.toFixed(1), res: tex.res }) };
  const apply = () => { uniforms.uTerK.value = tex.mean; uniforms.uTer.value.set(tex.ready ? 1 : 0, tier.layers, tier.anti, tier.nearR); uniforms.uTerSpec.value = tier.spec; };
  S.setTier = name => { if (!TERRAIN_TIERS[name]) return S.tierName; S.tierName = name; tier = TERRAIN_TIERS[name]; apply(); return name; };
  let xrTier = null;
  S.update = (xr) => {
    if (!tex.ready) { tex.next(); if (!tex.ready) tex.next(); apply(); }   // two passes a frame: ~14 frames to build
    if (xr && xrTier === null) { xrTier = S.tierName; S.setTier('low'); } else if (!xr && xrTier !== null) { S.setTier(xrTier); xrTier = null; }
  };
  return S;
}

// ------------------------------------------------------------------------------------------------- debug preview
// Draws every layer 2x2 repeated (to show seams), lit by its normal map from the upper left, into a PNG data URL:
// tools/scenes/terraintex.mjs. cols x rows tiles of px pixels.
export function previewLayers(renderer, S, px = 256, cols = 7) {
  const rows = Math.ceil(NL / cols), W = px * cols, H = px * rows;
  const rt = new THREE.WebGLRenderTarget(W, H), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({ uniforms: { uTA: S.uniforms.uTA, uTN: S.uniforms.uTN, uG: { value: new THREE.Vector2(cols, rows) } },
    vertexShader: GEN_VS, fragmentShader: /* glsl */`precision highp float; varying vec2 vUv; uniform highp sampler2DArray uTA, uTN; uniform vec2 uG;
      void main(){ vec2 g=vec2(vUv.x,1.-vUv.y)*uG; float L=floor(g.x)+floor(g.y)*uG.x; vec2 uv=fract(g)*2.;
        if(L>=${NL}.){ gl_FragColor=vec4(.1,.1,.1,1.); return; }
        vec4 a=texture(uTA,vec3(uv,L)), b=texture(uTN,vec3(uv,L)); vec3 n=normalize(vec3((b.xy-.5)*2.,1.));
        float l=max(dot(n,normalize(vec3(-.5,.5,.7))),0.)*.8+.35*b.w;
        gl_FragColor=vec4(a.rgb*l,1.); }`, depthTest: false });
  const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); q.frustumCulled = false; scene.add(q);
  const prev = renderer.getRenderTarget(), prevXR = renderer.xr.enabled; renderer.xr.enabled = false;
  renderer.setRenderTarget(rt); renderer.render(scene, cam);
  const buf = new Uint8Array(W * H * 4); renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf); renderer.setRenderTarget(prev); renderer.xr.enabled = prevXR;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d'), im = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) im.data.set(buf.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
  ctx.putImageData(im, 0, 0); rt.dispose(); mat.dispose(); q.geometry.dispose();
  return cv.toDataURL('image/png');
}
