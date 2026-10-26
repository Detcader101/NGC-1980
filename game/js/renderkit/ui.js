import * as THREE from 'three';
import { uniform, color, positive } from './core.js';
import { meshVertex, sdfGLSL, outputGLSL } from './glsl.js';

/** PlaneGeometry UVs. size/radius/stroke share layout units (usually CSS pixels).
 * Set depthTest:true for cockpit/world UI. Screen HUD defaults to an overlay.
 */
export function createHUDMaterial({ kind = 'panel', width = 320, height = 120,
  radius = 3, stroke = 1, fill = 0x111b1d, ink = 0xa6cfc3, opacity = 0.92, ...options } = {}) {
  if (!['panel','reticle'].includes(kind)) throw new RangeError('HUD kind: panel or reticle');
  positive(width, 'width'); positive(height, 'height'); positive(stroke, 'stroke', true); positive(radius, 'radius', true);
  return new THREE.ShaderMaterial({ name: `RenderKit/HUD/${kind}`, transparent: true,
    depthWrite: false, depthTest: false, toneMapped: false,
    uniforms: { rkSize: uniform(new THREE.Vector2(width,height)), rkRadius: uniform(radius),
      rkStroke: uniform(stroke), rkFill: uniform(color(fill)), rkInk: uniform(color(ink)), rkOpacity: uniform(opacity) },
    defines: { RK_RETICLE: kind === 'reticle' ? 1 : 0 }, vertexShader: meshVertex,
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform vec2 rkSize;
      uniform float rkRadius, rkStroke, rkOpacity; uniform vec3 rkFill, rkInk;
      ${sdfGLSL}
      void main() {
        vec2 p = (vUv-0.5)*rkSize;
        float inset = max(rkStroke,1.0)*2.0;
        float d = rkRoundBox(p, max(rkSize*0.5-inset,vec2(0.1)), min(rkRadius,min(rkSize.x,rkSize.y)*0.25));
        float edge = rkCoverage(abs(d)-rkStroke*0.5);
        vec3 tint = mix(rkFill,rkInk,edge*0.55);
        float alpha = rkCoverage(d)*rkOpacity;
        #if RK_RETICLE == 1
          float r = min(rkSize.x,rkSize.y)*0.22;
          float ring = rkCoverage(abs(length(p)-r)-rkStroke*0.5);
          // Broken ring and detached bars leave the aiming point unobstructed.
          ring *= step(min(abs(p.x),abs(p.y)),r*0.42);
          float crossbar = max(rkCoverage(abs(p.x)-rkStroke*0.5)*step(r*1.25,abs(p.y))*step(abs(p.y),r*1.7),
                               rkCoverage(abs(p.y)-rkStroke*0.5)*step(r*1.25,abs(p.x))*step(abs(p.x),r*1.7));
          alpha = max(ring,crossbar)*rkOpacity; tint = rkInk;
        #endif
        gl_FragColor = vec4(tint,alpha);
        ${outputGLSL}
      }
    `, ...options });
}

/** Distance atlas is data: NoColorSpace, linear filtering. Borrowed, never disposed. */
export function createDistanceTextMaterial({ atlas, mode = 'msdf', tint = 0xe6e8df,
  outlineColor = 0x111b1d, outline = 0, weight = 0, opacity = 1, depthTest = true } = {}) {
  if (!atlas?.isTexture) throw new TypeError('A distance-field atlas Texture is required');
  if (!['sdf','msdf'].includes(mode)) throw new RangeError('Text mode: sdf or msdf');
  return new THREE.ShaderMaterial({ name: `RenderKit/text/${mode}`, transparent: true,
    depthWrite: false, depthTest, toneMapped: false, side: THREE.DoubleSide,
    uniforms: { rkAtlas: uniform(atlas), rkInk: uniform(color(tint)), rkOutlineColor: uniform(color(outlineColor)),
      rkOutline: uniform(outline), rkWeight: uniform(weight), rkOpacity: uniform(opacity) },
    defines: { RK_MSDF: mode === 'msdf' ? 1 : 0 }, vertexShader: meshVertex,
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform sampler2D rkAtlas; uniform vec3 rkInk, rkOutlineColor;
      uniform float rkOutline, rkWeight, rkOpacity;
      ${sdfGLSL}
      void main() {
        vec3 texel = texture2D(rkAtlas,vUv).rgb;
        float sd = texel.r;
        #if RK_MSDF == 1
          sd = rkMedian(texel);
        #endif
        sd += rkWeight-0.5;
        float aa = max(fwidth(sd),0.0001);
        float fill = smoothstep(-aa,aa,sd);
        float alpha = smoothstep(-aa,aa,sd+max(rkOutline,0.0));
        gl_FragColor = vec4(mix(rkOutlineColor,rkInk,fill/max(alpha,0.0001)),alpha*rkOpacity);
        ${outputGLSL}
      }
    ` });
}

/** Single-page BMFont JSON, including kerning and newlines. Font must be SDF/MSDF.
 * Coordinates: top-left at (0,0), baseline follows font metrics, +Y upwards.
 */
export function createDistanceText({ text = '', font, atlas, size = 1, ...options } = {}) {
  if (!font?.common || !Array.isArray(font.chars)) throw new TypeError('BMFont JSON common/chars required');
  if ((font.common.pages ?? 1) !== 1 || font.chars.some(c => (c.page ?? 0) !== 0)) throw new RangeError('Single-page atlases only');
  positive(size, 'size'); positive(font.common.lineHeight, 'font.common.lineHeight');
  positive(font.common.scaleW, 'font.common.scaleW'); positive(font.common.scaleH, 'font.common.scaleH');
  const glyphs = new Map(font.chars.map(c => [c.id,c]));
  const kern = new Map((font.kernings ?? []).map(k => [`${k.first}:${k.second}`,k.amount]));
  const material = createDistanceTextMaterial({ atlas, ...options });
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  function setText(value) {
    const positions = [], uvs = [], indices = [], unit = size/font.common.lineHeight;
    let x=0, y=0, previous=null, maxX=0;
    for (const char of String(value)) {
      if (char === '\n') { maxX=Math.max(maxX,x); x=0; y-=size; previous=null; continue; }
      const id=char.codePointAt(0), c=glyphs.get(id) ?? glyphs.get(63);
      if (!c) throw new RangeError(`Missing glyph ${char} and fallback ?`);
      x+=(kern.get(`${previous}:${c.id}`)??0)*unit;
      const l=x+c.xoffset*unit, t=y-c.yoffset*unit, r=l+c.width*unit, b=t-c.height*unit;
      if (c.width && c.height) {
        const i=positions.length/3, u0=c.x/font.common.scaleW, u1=(c.x+c.width)/font.common.scaleW;
        let v0=c.y/font.common.scaleH, v1=(c.y+c.height)/font.common.scaleH;
        if (atlas.flipY) { v0=1-v0; v1=1-v1; }
        positions.push(l,t,0,l,b,0,r,b,0,r,t,0); uvs.push(u0,v0,u0,v1,u1,v1,u1,v0);
        indices.push(i,i+1,i+2,i,i+2,i+3);
      }
      x+=c.xadvance*unit; previous=c.id;
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2)); geometry.setIndex(indices);
    geometry.computeVertexNormals(); geometry.computeBoundingSphere();
    mesh.geometry.dispose(); mesh.geometry=geometry;
    mesh.userData.text=String(value); mesh.userData.width=Math.max(maxX,x); mesh.userData.height=size-y;
  }
  try { setText(text); } catch (error) { mesh.geometry.dispose(); material.dispose(); throw error; }
  return { mesh, material, setText, dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); } };
}

/** Ready-to-use Unicode labels without a font asset; browser shapes text, GPU draws it.
 * For thousands of labels, supply a shared MSDF atlas with createDistanceText instead.
 */
export function createTextLabel({ text = '', height = 0.4, fontSize = 64, fontFamily = 'sans-serif',
  weight = 500, tint = '#e7e9df', depthTest = true } = {}) {
  positive(height, 'height'); positive(fontSize, 'fontSize');
  const canvas=document.createElement('canvas'), context=canvas.getContext('2d');
  let texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshBasicMaterial({ map:texture, transparent:true, depthWrite:false, depthTest, toneMapped:false, side:THREE.DoubleSide });
  const mesh=new THREE.Mesh(new THREE.PlaneGeometry(1,1),material);
  function setText(value) {
    const lines=String(value).split('\n'), font=`${weight} ${fontSize}px ${fontFamily}`, padding=Math.ceil(fontSize*0.25);
    context.font=font;
    const width=Math.ceil(Math.max(1,...lines.map(line=>context.measureText(line).width))+padding*2);
    const h=Math.ceil(lines.length*fontSize*1.25+padding*2);
    if (width>4096 || h>4096) throw new RangeError('Canvas label exceeds 4096px; use shorter text or an atlas');
    canvas.width=width; canvas.height=h; context.font=font; context.textBaseline='top'; context.fillStyle=tint;
    lines.forEach((line,i)=>context.fillText(line,padding,padding+i*fontSize*1.25));
    // Uploaded textures have immutable dimensions. A text change can resize the canvas;
    // replace its GPU allocation so shrinking a label cannot retain old mip levels.
    const previous=texture;
    texture=new THREE.CanvasTexture(canvas); texture.colorSpace=THREE.SRGBColorSpace;
    material.map=texture; previous.dispose();
    mesh.scale.set(height*width/h,height,1); mesh.userData.text=String(value);
  }
  try { setText(text); } catch (error) { mesh.geometry.dispose(); material.dispose(); texture.dispose(); throw error; }
  return { mesh, material, get texture() { return texture; }, setText,
    dispose() { mesh.removeFromParent(); mesh.geometry.dispose(); material.dispose(); texture.dispose(); } };
}
