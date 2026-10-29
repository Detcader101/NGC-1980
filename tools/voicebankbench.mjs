// Optional local-bank contracts. All test PCM is generated numerically here; no installed voice or private asset.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {voiceBankIndex,NO_VOICE_BANK} from './voice-bank.mjs';
import {createSamples} from '../game/js/voice/samples.js';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ngc-voice-bank-')),dir=path.join(temp,'audio/voices');
const savedFetch=globalThis.fetch;let count=0;
const check=(name,ok)=>{assert.ok(ok,name);count++;console.log('PASS '+name);};
try{
  check('absent directory resolves to silent descriptor',voiceBankIndex(temp)===NO_VOICE_BANK);
  const stub=JSON.parse(fs.readFileSync(new URL('../game/audio/voices/index.json',import.meta.url)));
  check('tracked static descriptor contains no generated speech',JSON.stringify(stub)===JSON.stringify(NO_VOICE_BANK));
  fs.mkdirSync(dir,{recursive:true});
  const manifest={format:'log8-gzip',file:'speech.logpcm.gz',rate:16000,samples:4,clips:{male:{'radio check':[0,4]},female:{'radio check':[0,4]}}};
  fs.writeFileSync(path.join(dir,'local-index.json'),JSON.stringify(manifest));
  check('manifest without matching PCM is absent',voiceBankIndex(temp)===NO_VOICE_BANK);
  let requests=0;globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify(voiceBankIndex(temp)),{headers:{'Content-Type':'application/json'}});};
  const absent=createSamples(new URL('http://localhost/audio/voices/'));
  check('missing bank finishes loading without throwing',await absent.load()===false&&absent.failed&&!absent.ready);
  await absent.load();
  check('missing bank never requests PCM or retries every frame',requests===1&&absent.buffer({},'Radio check.')===null);
  const data=gzipSync(Uint8Array.from([0,32,160,0]));fs.writeFileSync(path.join(dir,manifest.file),data);
  check('local build becomes available without modifying tracked descriptor',voiceBankIndex(temp).available===true);
  requests=0;globalThis.fetch=async url=>{requests++;return String(url).endsWith('index.json')?new Response(JSON.stringify(voiceBankIndex(temp))):new Response(data);};
  const local=createSamples(new URL('http://localhost/audio/voices/'));
  check('locally generated manifest and PCM load',await local.load()&&local.ready&&!local.failed&&requests===2);
  const buffer=local.buffer({createBuffer:(_c,n,rate)=>{const values=new Float32Array(n);return {length:n,sampleRate:rate,getChannelData:()=>values};}},'Radio check.');
  check('loaded PCM reaches a finite audio buffer',buffer.sampleRate===16000&&buffer.getChannelData().every(Number.isFinite)&&buffer.getChannelData().some(x=>x!==0));
  fs.writeFileSync(path.join(dir,'local-index.json'),'{broken');
  check('partial or corrupt local build falls back safely',voiceBankIndex(temp)===NO_VOICE_BANK);
  globalThis.fetch=async()=>new Response('',{status:404});
  const legacy=createSamples(new URL('http://localhost/audio/voices/'));
  check('legacy host missing descriptor does not reject the load promise',await legacy.load()===false&&legacy.failed);
  console.log(`${count}/${count} optional voice-bank checks passed`);
}finally{globalThis.fetch=savedFetch;fs.rmSync(temp,{recursive:true,force:true});}
