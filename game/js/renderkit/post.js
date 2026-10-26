import * as THREE from 'three';
import { uniform, positive } from './core.js';
import { outputGLSL } from './glsl.js';

/** Small desktop pipeline: linear scene target -> grading/distortion -> display.
 * Render DOM/GPU HUD AFTER this pass so critical text stays sharp and undistorted.
 * XR presenting is intentionally unsupported; render the scene directly in XR.
 */
export function createPostPipeline(renderer, { scale = 1, vignette = 0.12, grain = 0,
  saturation = 0.92, contrast = 1.02, temporal = 0, nightVision = 0 } = {}) {
  positive(scale, 'scale');
  if (scale > 2) throw new RangeError('Post scale must be <= 2');
  const hdr = renderer.extensions.has('EXT_color_buffer_float');
  const target = new THREE.WebGLRenderTarget(1,1,{ type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: true, stencilBuffer: false });
  target.texture.colorSpace = THREE.LinearSRGBColorSpace;
  target.texture.name = 'RenderKit/scene-linear';
  const uniforms = { rkScene: uniform(target.texture), rkTime: uniform(0),
    rkResolution: uniform(new THREE.Vector2(1,1)), rkVignette: uniform(vignette), rkGrain: uniform(grain),
    rkSaturation: uniform(saturation), rkContrast: uniform(contrast), rkTemporal: uniform(temporal), rkNight: uniform(nightVision) };
  const material = new THREE.ShaderMaterial({ name:'RenderKit/post', uniforms, depthTest:false, depthWrite:false,
    vertexShader: /* glsl */`varying vec2 vUv; void main() { vUv=uv; gl_Position=vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform sampler2D rkScene; uniform vec2 rkResolution;
      uniform float rkTime, rkVignette, rkGrain, rkSaturation, rkContrast, rkTemporal, rkNight;
      void main() {
        float wave = sin(vUv.y*19.0+rkTime*1.2)*sin(vUv.y*7.0-rkTime*0.7);
        vec2 halfTexel=0.5/rkResolution;
        vec2 uv=clamp(vUv+vec2(wave*rkTemporal*0.003,0.0),halfTexel,1.0-halfTexel);
        vec4 source=texture2D(rkScene,uv);
        vec3 rgb=source.rgb;
        float luma=dot(rgb,vec3(0.2126,0.7152,0.0722));
        rgb=mix(vec3(luma),rgb,rkSaturation);
        rgb=max(vec3(0.0),(rgb-0.18)*rkContrast+0.18);
        rgb=mix(rgb,vec3(0.38,0.92,0.57)*luma*1.6,clamp(rkNight,0.0,1.0));
        float vignette=dot(vUv-0.5,vUv-0.5);
        rgb*=1.0-clamp(rkVignette,0.0,1.0)*smoothstep(0.1,0.5,vignette);
        // Small grain in linear light; stable when simulation time is paused.
        float noise=fract(sin(dot(floor(vUv*rkResolution),vec2(12.9898,78.233))+floor(rkTime*24.0))*43758.5453)-0.5;
        rgb=max(vec3(0.0),rgb+noise*rkGrain*0.025);
        gl_FragColor=vec4(rgb,source.a);
        ${outputGLSL}
      }
    ` });
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0],3));
  geometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,2,0,0,2],2));
  const screen=new THREE.Scene(), camera=new THREE.Camera(), mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false; screen.add(mesh);
  const bufferSize=new THREE.Vector2(), viewport=new THREE.Vector4(), scissor=new THREE.Vector4(), clearColor=new THREE.Color();
  let disposed=false;
  return { target, uniforms, hdr,
    setSize(width,height) {
      positive(width,'width'); positive(height,'height');
      const w=Math.max(1,Math.floor(width*scale)), h=Math.max(1,Math.floor(height*scale));
      if (target.width!==w || target.height!==h) target.setSize(w,h);
      uniforms.rkResolution.value.set(w,h);
    },
    render(scene,viewCamera,seconds=0) {
      if (disposed) throw new Error('RenderKit post pipeline has been disposed');
      if (renderer.xr.isPresenting) throw new Error('RenderKit post is desktop only; use renderer.render in XR');
      positive(seconds,'seconds',true);
      const output=renderer.getRenderTarget(), face=renderer.getActiveCubeFace(), mip=renderer.getActiveMipmapLevel();
      renderer.getViewport(viewport); renderer.getScissor(scissor); renderer.getClearColor(clearColor);
      const scissorTest=renderer.getScissorTest(), autoClear=renderer.autoClear, clearAlpha=renderer.getClearAlpha(), xr=renderer.xr.enabled;
      renderer.getDrawingBufferSize(bufferSize);
      this.setSize(output?.width ?? bufferSize.x,output?.height ?? bufferSize.y);
      uniforms.rkTime.value=seconds;
      try {
        renderer.xr.enabled=false; renderer.autoClear=false;
        renderer.setRenderTarget(target); renderer.setScissorTest(false);
        renderer.clear(true,true,true); renderer.render(scene,viewCamera);
        renderer.setRenderTarget(output,face,mip); renderer.setViewport(viewport);
        renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
        renderer.render(screen,camera);
      } finally {
        renderer.setRenderTarget(output,face,mip); renderer.setViewport(viewport);
        renderer.setScissor(scissor); renderer.setScissorTest(scissorTest);
        renderer.setClearColor(clearColor,clearAlpha); renderer.autoClear=autoClear; renderer.xr.enabled=xr;
      }
    },
    dispose() { if (disposed) return; disposed=true; target.dispose(); geometry.dispose(); material.dispose(); },
  };
}
