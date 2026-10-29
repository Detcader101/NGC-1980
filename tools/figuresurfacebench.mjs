#!/usr/bin/env node
// Weapon/Kit material contracts (figCoord/figSurface). The look-people body uses its own aFig/aRM pipeline,
// exercised by peoplebench. This exercises production constructors in plain Node; GPU shader
// compilation and visual correctness are covered separately by firstpersonpolish/people rendered evidence.
// Run: node tools/figuresurfacebench.mjs
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { register } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const modeIndex = process.argv.indexOf('--mode'), mode = modeIndex >= 0 ? process.argv[modeIndex + 1] : null;
const modes = { high: '?rk=figures', low: '?rk=figures&rkdetail=1', 'detail-off': '?rk=figures&rkdetail=0', legacy: '?rk=0' };
if (!mode) {
  for (const key of Object.keys(modes)) {
    const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--mode', key], { encoding: 'utf8' });
    process.stdout.write(child.stdout); process.stderr.write(child.stderr);
    if (child.status !== 0) process.exit(child.status || 1);
  }
  console.log('PASS figure surfaces: 4 modes, 5 weapons × 3 states per mode; Node contracts only (GPU checks separate).');
} else {
  assert.ok(mode in modes, 'known render mode');
  globalThis.location = { search: modes[mode] };
  const threeURL = new URL('../game/vendor/three.module.min.js', import.meta.url).href;
  register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s,c,n){return s==='three'?{url:${JSON.stringify(threeURL)},shortCircuit:true}:n(s,c);}`));
  const T = await import('three');
  const { Kit, CAMO, KITMAT, figMat, applyFigureAttributes } = await import('../game/js/units/infantry/meshkit.js');
  const { buildWeaponModel } = await import('../game/js/units/infantry/weaponmodels.js');
  const { figureTexture } = await import('../game/js/units/infantry/figurematerials.js');
  const detailed = mode === 'high' || mode === 'low', legacy = mode === 'legacy';
  const digest = a => createHash('sha256').update(Buffer.from(a.buffer, a.byteOffset, a.byteLength)).digest('hex');

  // One merged part may contain camouflage, metal and fabric. Roles must stay on their own triangles.
  const k = new Kit();
  k.box(0.1,0.2,0.3,CAMO.erdl(0.06,3));
  k.box(0.1,0.1,0.1,CAMO.surface(0x334455,'steel'),[0.2,0,0]);
  const mixed = k.geometry();
  assert.equal(mixed.attributes.position.count,72);
  if (legacy) {
    assert.ok(!mixed.hasAttribute('figSurface'));
    assert.ok(!mixed.hasAttribute('figCoord'));
    assert.ok(KITMAT.lambert().isMeshLambertMaterial);
  } else {
    const s = mixed.attributes.figSurface;
    assert.equal(s.count,72); assert.equal(s.getX(0),1); assert.equal(s.getZ(0),3);
    assert.equal(s.getW(0),-1); assert.equal(s.getX(36),0); assert.equal(s.getW(36),2);
    assert.deepEqual(Array.from(mixed.attributes.figCoord.array),Array.from(mixed.attributes.position.array));
  }
  // A constant tagged finish must retain the same linear vertex colour in every renderer mode.
  const expected = new T.Color(0x334455), colour = mixed.attributes.color;
  for (const [i,v] of [expected.r,expected.g,expected.b].entries()) assert.ok(Math.abs(colour.array[36*3+i]-v)<1e-7);

  // Skinning is driven in the shader; authored coordinates remain a stable copy of bind/rest positions.
  const skinned = new T.CylinderGeometry(0.1,0.08,0.5,12,4);
  const count = skinned.attributes.position.count;
  skinned.setAttribute('skinIndex',new T.Uint16BufferAttribute(new Uint16Array(count*4),4));
  const weights = new Float32Array(count*4); for(let i=0;i<count;i++)weights[i*4]=1;
  skinned.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
  applyFigureAttributes(skinned,{paint:CAMO.og107(),role:'fabric'});
  assert.equal(skinned.attributes.figSurface.count,count); assert.equal(skinned.attributes.figSurface.getX(0),2);
  assert.equal(skinned.attributes.color.count,count); assert.equal(skinned.attributes.skinWeight.count,count);
  assert.notEqual(skinned.attributes.figCoord.array,skinned.attributes.position.array);

  const states = [
    {},
    {charge:1,bolt:1,locked:true,mag:'out',magOffset:[0,-0.08,0.02],fa:1,selector:2,trigger:1,dustCover:true,glOpen:1,quad:0.4,cover:1,leaf:1,bipod:1,handle:0,heat:600,law:1,lawSights:1,slide:1,hammer:0,beltRounds:6,time:0.7},
    {charge:0.25,bolt:0.6,mag:'in',magOffset:[0.01,0,0],selector:1,trigger:0.2,glOpen:0.4,quad:0.2,cover:0.3,leaf:0.5,bipod:0.25,law:0.5,lawSights:0.5,slide:0.5,hammer:0.7,beltRounds:3,time:2},
  ];
  for (const key of ['M16A1','M16A1/M203','M60','M1911A1','M72A2']) {
    const model = buildWeaponModel(key), rest = new Map(), transforms = new Set();
    model.group.traverse(o => {
      if(!o.geometry)return;
      const g=o.geometry,p=g.attributes.position;
      for(const attr of Object.values(g.attributes))assert.ok(attr.array.every(Number.isFinite),key+' finite geometry');
      if(g.attributes.figSurface){assert.equal(g.attributes.figSurface.count,p.count);assert.equal(g.attributes.figCoord.count,p.count);rest.set(g,digest(g.attributes.figCoord.array));}
    });
    for(const state of states){
      model.setState(state); model.group.updateMatrixWorld(true);
      const pose=[];
      model.group.traverse(o=>{assert.ok(o.matrixWorld.elements.every(Number.isFinite),key+' finite pose');pose.push(...o.matrixWorld.elements);if(rest.has(o.geometry))assert.equal(digest(o.geometry.attributes.figCoord.array),rest.get(o.geometry),key+' rest coordinates follow surface without mutation');});
      transforms.add(digest(new Float64Array(pose)));
      for(const anchor of Object.values(model.anchors))assert.ok(anchor.every(Number.isFinite),key+' finite anchors');
    }
    assert.equal(transforms.size,3,key+' articulated states actually change transforms');
  }

  for(const role of ['fabric','skin','steel','plastic','rubber','leather','webbing']) {
    const m=figMat(role),sh={vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader,uniforms:{}};
    m.onBeforeCompile(sh);
    assert.equal(!!m.userData.figureSurface,detailed);
    if(detailed){
      assert.ok(sh.vertexShader.indexOf('figP =')<sh.vertexShader.indexOf('#include <skinning_vertex>'),'capture rest coordinates before skinning');
      assert.ok(sh.fragmentShader.includes('figPattern'));
      assert.equal(sh.fragmentShader.includes('vec3 figGradient'),mode==='high','bump restricted to high tier');
      assert.equal(m.defines.FIG_DETAIL_TIER,mode==='high'?2:1);
      assert.equal(sh.uniforms.figTex.value,figureTexture(),'one texture shared by all material roles');
    } else assert.ok(!sh.fragmentShader.includes('figPattern'),'plain fallback shader');
  }
  const tex=figureTexture();assert.equal(tex,figureTexture());
  assert.equal(tex.image.width,512);assert.equal(tex.image.height,512);assert.equal(tex.image.data.byteLength,1048576);
  assert.equal(tex.generateMipmaps,true);assert.equal(tex.minFilter,T.LinearMipmapLinearFilter);
  assert.equal(tex.wrapS,T.RepeatWrapping);assert.equal(tex.wrapT,T.RepeatWrapping);
  console.log(`PASS ${mode}: mixed surfaces, skinning attributes, colour retention, 15 weapon poses, shared texture and shader tier contract`);
}
