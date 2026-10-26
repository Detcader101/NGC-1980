// Expanded playable world and stable scenery: real generators, real logistics terrain, bounded LOD transitions.
import assert from 'node:assert/strict';
import { BOUND, ISLANDS, islandH } from '../game/js/world.js';
import { zoneGrid, islandInfo, beaches, bakeMs } from '../game/js/world/terrain.js';
import { createZone, GRID } from '../game/js/sim/zone.js';
import { forestTile } from '../game/js/world/forest.js';
import { drawDistance, lodWeights } from '../game/js/world/visibility.js';
import { buildChunk } from '../game/js/world/chunkgen.js';

let checks=0;
function check(name, fn) { fn(); checks++; console.log('PASS '+name); }
const start=performance.now(), grid=zoneGrid(), Z=createZone(); Z.navReady;
check('control zone doubles in width; both height grids cover every island and its shelves',()=>{
  assert.equal(BOUND,1280); assert.equal(ISLANDS.length,17);
  for(const I of ISLANDS) { assert(Math.abs(I.x)+I.r*1.25<BOUND); assert(Math.abs(I.z)+I.r*1.25<BOUND); }
  assert(grid.E>BOUND && GRID.EXT>BOUND);
});
const areas=ISLANDS.map(I=>{
  let dry=0,wet=0,min=Infinity,max=-Infinity;
  for(let z=I.z-I.r*1.3;z<I.z+I.r*1.3;z+=5) for(let x=I.x-I.r*1.3;x<I.x+I.r*1.3;x+=5){const h=islandH(x,z);assert(Number.isFinite(h));h>0?dry++:wet++;min=Math.min(min,h);max=Math.max(max,h);}
  return {name:I.name,geology:islandInfo(I).geology,landM2:dry*25,waterFraction:wet/(dry+wet),min,max};
});
check('large land masses, small reefs, four geologies and varied shorelines',()=>{
  assert.equal(new Set(areas.map(a=>a.geology)).size,4);
  assert(Math.max(...areas.map(a=>a.landM2))/Math.min(...areas.map(a=>a.landM2))>8);
  assert(areas.some(a=>a.max>25) && areas.some(a=>a.max<8));
  assert(beaches().length>=17); assert(ISLANDS.every(I=>islandInfo(I).coves.length>0));
});
check('every objective retains a dry level landing pad and a vehicle landing hard',()=>{
  for(const I of Z.ISLANDS){assert(Z.HARDS.some(h=>h.I===I),I.name+' hard');const p=I.pad;assert(Z.terrainH(p.x,p.z)>0,I.name+' pad');assert(Math.abs(Z.terrainH(p.x+4,p.z)-p.h)<.02,I.name+' level');}
});
check('fleet anchorages and the route between them stay in navigable water',()=>{
  const [ax,az]=Z.carrierStart,[bx,bz]=Z.enemyStart, path=Z.nav.path(ax,az,bx,bz);
  assert(Z.nav.wet(ax,az)&&Z.nav.wet(bx,bz));let x=ax,z=az;
  for(const [px,pz] of path){const n=Math.ceil(Math.hypot(px-x,pz-z)/5);for(let k=0;k<=n;k++)assert(Z.nav.wet(x+(px-x)*k/Math.max(1,n),z+(pz-z)*k/Math.max(1,n)));x=px;z=pz;}
});
check('distance haze changes smoothly with altitude and has no control-zone discontinuity',()=>{
  let previous=drawDistance(0);
  for(let h=1;h<2200;h++){const d=drawDistance(h);assert(d>=previous && d-previous<=1.601 && d<=2600);previous=d;}
  for(let d=0;d<3000;d++){const w=lodWeights(d);assert(Math.abs(w.near+w.far-1)<1e-12);assert(w.detail>=0&&w.detail<=1);if(d>0)assert(Math.abs(w.near-lodWeights(d-1).near)<.01);}
});
const tiles=[], unique=new Set();let trees=0;
const t0=performance.now();
for(const [x,z] of [[3200,1600],[3600,1600],[4000,1600],[3200,2000]]){
  const a=forestTile(x,z,400);tiles.push({x,z,trees:a.length/4});
  check('forest tile '+x+','+z+' is repeatable and contains no cross-tile duplicates',()=>{
    assert.deepEqual(a,forestTile(x,z,400));
    for(let i=0;i<a.length;i+=4){assert(a[i]>=x&&a[i]<x+400&&a[i+2]>=z&&a[i+2]<z+400);const k=a[i]+','+a[i+2];assert(!unique.has(k));unique.add(k);trees++;}
  });
}
check('the sampled wild area contains a forest',()=>assert(trees>100));
const forestMs=performance.now()-t0, t1=performance.now(), chunk=buildChunk(8,4,islandH), chunkMs=performance.now()-t1;
check('streamed forests and towns have bounded near/far geometry',()=>{
  assert(chunk.far.tris<=chunk.near.tris);assert(chunk.near.tris<200000);assert(chunk.forestTrees>0);
  for(const k of ['near','far','detail','gnear','gfar']) assert([...chunk[k].pos].every(Number.isFinite));
});
console.log(JSON.stringify({checks,terrainBakeMs:bakeMs(),totalMs:performance.now()-start,forestMs,tiles,chunkMs,nearTris:chunk.near.tris,farTris:chunk.far.tris,areas},null,2));
