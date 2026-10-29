// Save BEFORE changing production figures, then compare the same invariant set AFTER:
// node tools/figurecrowdbench.mjs --out tools/runs/tp-crowd-before.json
// node tools/figurecrowdbench.mjs --baseline tools/runs/tp-crowd-before.json --out tools/runs/tp-crowd-after.json
// A baseline-free run checks contracts and records evidence; it cannot establish unchanged geometry.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';
import {register} from 'node:module';
const {values}=parseArgs({options:{baseline:{type:'string'},out:{type:'string'}}});
const root=fileURLToPath(new URL('../',import.meta.url));
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(s,c,n){if(s==='three')return {url:${JSON.stringify(new URL('../game/vendor/three.module.min.js',import.meta.url).href)},shortCircuit:true};return n(s,c);}`));
const THREE=await import('../game/vendor/three.module.min.js');
const {restPerson,patchLimbs}=await import('../game/js/units/infantry/figinst.js');
const {ROLES,personGeometry,crewPerson}=await import('../game/js/units/infantry/humanfig.js');
const {figMaterial}=await import('../game/js/units/infantry/figgeo.js');
const {crewMaterial}=await import('../game/js/interiors/crewfig.js');
const {buildMarine,poseSkeleton,makePose}=await import('../game/js/units/infantry/soldiermodel.js');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function stable(value){
  if(typeof value==='number'&&!Number.isFinite(value))return String(value);
  if(Array.isArray(value))return value.map(stable);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
  return value;
}
const serial=value=>JSON.stringify(stable(value));
function attribute(a){
  const array=a.isInterleavedBufferAttribute?a.data.array:a.array;
  assert.ok(array.every(Number.isFinite),'finite geometry buffer');
  return {type:array.constructor.name,count:a.count,itemSize:a.itemSize,normalized:a.normalized,
    usage:a.isInterleavedBufferAttribute?a.data.usage:a.usage,stride:a.isInterleavedBufferAttribute?a.data.stride:null,
    offset:a.isInterleavedBufferAttribute?a.offset:null,meshPerAttribute:a.meshPerAttribute??null,
    bytes:array.byteLength,sha256:hash(Buffer.from(array.buffer,array.byteOffset,array.byteLength))};
}
function geometry(g){
  assert.ok(g.attributes.position.count>0&&g.index?.count>0,'nonempty indexed production figure');
  return {attributes:Object.fromEntries(Object.keys(g.attributes).sort().map(k=>[k,attribute(g.attributes[k])])),
    index:g.index?attribute(g.index):null,morphAttributes:Object.fromEntries(Object.keys(g.morphAttributes).sort().map(k=>[k,g.morphAttributes[k].map(attribute)])),
    morphTargetsRelative:g.morphTargetsRelative,groups:stable(g.groups),drawRange:stable(g.drawRange),userData:stable(g.userData),
    boundingBox:g.boundingBox?{min:g.boundingBox.min.toArray(),max:g.boundingBox.max.toArray()}:null,
    boundingSphere:g.boundingSphere?{center:g.boundingSphere.center.toArray(),radius:g.boundingSphere.radius}:null};
}
function material(m){
  const sh={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}};
  m.onBeforeCompile(sh,null);
  const json=m.toJSON();delete json.uuid;delete json.metadata;
  return {properties:stable(json),programKey:m.customProgramCacheKey(),vertex:hash(sh.vertexShader),fragment:hash(sh.fragmentShader),uniforms:stable(sh.uniforms)};
}
const refs=new Map(),factories=new Map(),snapshot={geometry:{},materials:{},limbShaders:{},roles:Object.keys(ROLES).sort()};
function add(name,make,cached=false){
  const g=make();snapshot.geometry[name]=geometry(g);factories.set(name,make);
  if(cached){assert.equal(make(),g,name+' retains cached identity');refs.set(name,g);}
  assert.ok(!g.hasAttribute('skinWeight')&&!g.hasAttribute('skinIndex'),name+' is baked');
}
for(const role of ['deck','civil'])for(const lod of ['crowd','far']){
  const opts=lod==='crowd'?{}:{lod};add('rest/'+role+'/'+lod,()=>restPerson(role,opts),true);
  const g=restPerson(role,opts),w=g.attributes.aLimb;
  for(const name of ['normal','color','aFig','aRM','aPaint','aLimb'])assert.equal(g.attributes[name].count,g.attributes.position.count);
  for(let i=0;i<w.count;i++)assert.ok(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)<=1.00001,'bounded limb blend');
}
const cases=[['sailor','stand','wheel'],['officer','stand','binocs'],['pilot','stand','side'],['jetPilot','seated','controls'],
  ['heloPilot','seated','controls'],['deck','stand','point'],['marine','seated','rifle'],['tanker','seated','controls']];
for(const [kind,pose,arms]of cases){assert.ok(ROLES[kind],'valid crew role '+kind);add('crew/'+kind+'/'+pose,()=>crewPerson(kind,pose,{seed:2,arms}));}
const defaultSources=new Map(['deck','civil','sailor','heloPilot'].map(role=>[role,personGeometry(role)]));
for(const [role,g]of defaultSources)snapshot.geometry['default/'+role]=geometry(g);
const mats={default:figMaterial(),plain:figMaterial({camo:'og107',seed:0}),crew:crewMaterial()};
for(const [name,m]of Object.entries(mats))snapshot.materials[name]=material(m);
for(const mode of ['pose','walk']){
  const sh={vertexShader:THREE.ShaderLib.standard.vertexShader};patchLimbs(sh,mode);
  assert.ok(sh.vertexShader.includes('lpLimbs(lpP, objectNormal')&&sh.vertexShader.includes('transformed = lpP;'));
  snapshot.limbShaders[mode]=hash(sh.vertexShader);
}
// Exercise the player/squad consumers after taking the crowd snapshot. Custom hand profiles must not
// mutate geometries or materials that the instanced townspeople and baked crews already share.
const marine=buildMarine({seed:2,detail:'low',pack:true});
for(const [weapon,cls]of [['M16A1','rifle'],['M16A1/M203','rifle'],['M60','mg'],['M1911A1','pistol'],['M72A2','law']]){
  marine.setWeapon(weapon);poseSkeleton(marine,makePose({cls,ads:1,gaitPhase:.75,weaponState:weapon==='M72A2'?{law:1,lawSights:1}:{}}),0);
}
for(const [name,make]of factories){const g=make();if(refs.has(name))assert.equal(g,refs.get(name));assert.deepEqual(geometry(g),snapshot.geometry[name],name+' unchanged after Marine construction/weapon changes');}
for(const [role,g]of defaultSources){assert.equal(personGeometry(role),g);assert.deepEqual(geometry(g),snapshot.geometry['default/'+role],role+' default cache unchanged');}
assert.equal(figMaterial(),mats.default);assert.equal(figMaterial({camo:'og107',seed:0}),mats.plain);assert.equal(crewMaterial(),mats.crew);
for(const [name,m]of Object.entries(mats))assert.deepEqual(material(m),snapshot.materials[name],name+' shared material unchanged');
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
const result={schema:1,source:{commit:git(['rev-parse','HEAD']),gameDirty:!!git(['status','--porcelain','--','game'])},
  fingerprint:hash(serial(snapshot)),snapshot,baseline:values.baseline??null};
if(values.out){fs.mkdirSync(path.dirname(values.out),{recursive:true});fs.writeFileSync(values.out,JSON.stringify(result,null,2)+'\n');}
if(values.baseline){
  const before=JSON.parse(fs.readFileSync(values.baseline,'utf8'));assert.equal(before.schema,result.schema,'compatible fingerprint schema');
  for(const group of ['geometry','materials','limbShaders','roles'])assert.deepEqual(snapshot[group],before.snapshot[group],group+' match saved pre-edit baseline');
  assert.equal(result.fingerprint,before.fingerprint);console.log('PASS crowd/crew buffers, indices, metadata, materials and limb shaders match '+values.baseline);
}else console.log('PASS cache/material isolation; snapshot only (no pre-edit comparison requested).');
console.log(JSON.stringify({fingerprint:result.fingerprint,geometries:Object.keys(snapshot.geometry).length,materials:Object.keys(mats).length,out:values.out??null}));
