// Four fixed views for the TP hand follow-up. An isolated production-model fixture, not a live-world
// behavior/performance test. Preserve this file and capture it before AND after production edits.
export default {
  name:'tpgripcrowd',query:'dev/people.html?debug&res=1&ui=0&seed=1980&rk=all',
  async run(h){
    await h.waitFor('window.__H',30000);
    await h.eval(`(async()=>{
      const THREE=await import('three');
      const {createCrew}=await import('../js/units/naval/deckcrew.js');
      const {restPerson,patchLimbs}=await import('../js/units/infantry/figinst.js');
      const {personGeo}=await import('../js/world/ambient.js');
      const {worldMaterial}=await import('../js/world/gfx.js');
      __H.state.play=false;
      const scene=new THREE.Scene();scene.background=new THREE.Color(0x89969a);
      scene.add(new THREE.HemisphereLight(0xdde8ef,0x57584c,1.7));
      const sun=new THREE.DirectionalLight(0xffedda,2.2);sun.position.set(-3,6,-5);scene.add(sun);
      const fill=new THREE.DirectionalLight(0xb7ccd7,.65);fill.position.set(3,2,3);scene.add(fill);
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(100,100).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x636b63,roughness:1})));
      const camera=new THREE.PerspectiveCamera(32,innerWidth/innerHeight,.01,100);
      camera.position.set(3,2.05,-7.2);camera.lookAt(0,.9,0);camera.updateMatrixWorld(true);
      const members=['signal','march','talk','lso'].map((mode,i)=>({x:(i-1.5)*1.15,y:0,z:0,yaw:0,mode,jersey:['yellow','green','brown','white'][i]}));
      const deck=createCrew(members,{seed:1980});scene.add(deck.group);
      members.forEach((p,i)=>{p.ph=.75+i*.3;p.lookT=10;});deck.update(0,.75);
      // personGeo is the actual townsperson geometry, including its sqrt-coded world colours.
      // instMat is private in ambient.js: use its same extra shader with the exported worldMaterial.
      const geometry=personGeo(),base=restPerson('civil',{lod:'far'}),walk=new THREE.InstancedBufferAttribute(new Float32Array(10),2);
      geometry.setAttribute('aWalk',walk);
      const extra=sh=>{
        sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\\nattribute float aPaint; attribute float aPart; attribute vec2 aWalk;')
          .replace('#include <fog_vertex>','#include <fog_vertex>\\n#ifdef USE_INSTANCING_COLOR\\n vColor.rgb = mix(color.rgb * color.rgb, instanceColor.rgb, aPaint);\\n#endif');
        patchLimbs(sh,'walk');
      };extra.key='instwalk';
      const town=new THREE.InstancedMesh(geometry,worldMaterial({extra}),5),matrix=new THREE.Matrix4(),color=new THREE.Color();
      town.name='fixture-townsfolk';town.frustumCulled=false;
      [0x785b4c,0x76858e,0x7c8766,0xb7a079,0x865d66].forEach((c,i)=>{
        matrix.makeRotationY([0,.35,-.4,.7,-.6][i]);matrix.setPosition((i-2)*1.05,0,0);town.setMatrixAt(i,matrix);town.setColorAt(i,color.setHex(c));
        walk.setXY(i,.75+i*.8,.48);
      });town.instanceMatrix.needsUpdate=true;town.instanceColor.needsUpdate=true;walk.needsUpdate=true;scene.add(town);
      const render=__H.renderer.render.bind(__H.renderer);let mode=null;
      __H.renderer.render=(s,c)=>render(mode?scene:s,mode?camera:c);
      const info=()=>({mode,deckMembers:deck.members.length,identities:deck.members===members,
        near:deck.people?.count,far:deck.peopleFar?.count,townCount:town.count,townRole:geometry.userData.role,
        townLOD:geometry.userData.lod,townBaseVertices:base.attributes.position.count,townVertices:geometry.attributes.position.count,
        camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),fov:camera.fov},
        compiled:__H.renderer.info.programs.every(p=>!p.diagnostics||p.diagnostics.runnable!==false)});
      window.__crowd={info,show(which){mode=which;deck.group.visible=which==='deck';town.visible=which==='town';
        render(scene,camera);deck.update(0,.75);render(scene,camera);return info();},marine(){mode=null;}};
      return {roles:['deck','civil'],fixedPhase:.75};
    })()`);
    await h.eval('__crowd.show("deck")','Fixed production deck crew');
    await h.expect('__crowd.info().identities && __crowd.info().deckMembers===4 && __crowd.info().near===4 && __crowd.info().far===0','Four persistent crew records use the actual near instanced deck renderer');
    await h.expect('__crowd.info().compiled','Deck pose shader compiles');
    await h.shot('deck-instanced-fixed');
    await h.eval('__crowd.show("town")','Fixed production townsperson geometry and walk shader');
    await h.expect('__crowd.info().townCount===5 && __crowd.info().townRole==="civil" && __crowd.info().townLOD==="far" && __crowd.info().townVertices===__crowd.info().townBaseVertices','Five townsfolk preserve the actual far crowd geometry');
    await h.expect('__crowd.info().compiled','Town walk shader compiles');
    await h.shot('town-instanced-fixed');
    await h.eval('__crowd.marine()');
    // Dolly/zoom keeps the person readable while the actual camera distance selects each production LOD.
    for(const [lod,distance,fov]of [['near',10,18],['mid',32,5.67]]){
      await h.eval(`(()=>{__H.camera.fov=${fov};__H.camera.updateProjectionMatrix();const counts=__H.set('aim',{detail:0,distance:${distance},time:.15,yaw:Math.PI-.65,weapon:'M16A1'});return {counts,position:__H.camera.position.toArray(),quaternion:__H.camera.quaternion.toArray(),fov:__H.camera.fov,time:__H.state.time};})()`,'Fixed Marine '+lod+' camera');
      await h.expect(`__H.counts().lod==='${lod}' && __H.counts().skinned===1 && !__H.state.play && __H.state.time===.15`,'Actual '+lod+' Marine LOD, one body, frozen pose');
      await h.shot('marine-'+lod+'-fixed');
    }
    await h.notblank();
  }
};
