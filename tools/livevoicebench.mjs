// Whole-line synthesis contracts, cancellation and optional real installed Windows voices.
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {deliveryFor,speechSSML,speechText} from '../game/js/voice/delivery.js';
import {createLocalVoices} from '../game/js/voice/localvoices.js';
import {createVoiceService,prepareSpeechWave,validVoiceRequest} from './voice-server.mjs';
let n=0;const check=(ok,name)=>{assert.ok(ok,name);console.log('PASS '+name);n++;};
const until=async f=>{for(let i=0;i<200&&!f();i++)await new Promise(r=>setTimeout(r,10));assert.ok(f(),'async condition completed');};
function wave(){const rate=16000,count=rate*2,b=Buffer.alloc(44+count*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(count*2,40);for(let i=4000;i<28000;i++)b.writeInt16LE(Math.round(Math.sin(i*.21)*18000),44+i*2);return b;}
const text='Command, this is Albatross. Your patrol is on station. Out.';
check(JSON.stringify(deliveryFor('conn','command'))===JSON.stringify(deliveryFor('conn','command')),'speaker identity and delivery are deterministic');
check(new Set(Array.from({length:20},(_,i)=>deliveryFor('marine:'+i).voice)).size===2&&deliveryFor('betty','betty').voice==='Microsoft Zira','installed male cast alternates and warning voice stays female');
check(deliveryFor('conn','command',true).rate>deliveryFor('conn','command').rate,'urgent delivery changes synthesis cadence independently of playback speed');
check(speechSSML('<audio src="x"/> & test',deliveryFor('conn')).includes('&lt;audio')&&!speechSSML('<audio/>',deliveryFor('conn')).includes('<audio'),'speech text cannot inject SSML tags');
check(speechText('UH-1H RTB — CAP 50%').includes('huey returning to base. combat air patrol 50 percent'),'spoken abbreviations are expanded while sentence boundaries remain');
check(validVoiceRequest({text,who:'conn',role:'command'})&&!validVoiceRequest({text:'x'.repeat(481),who:'conn',role:'command'})&&!validVoiceRequest({text,who:'conn',role:'<voice>'}),'invalid and oversized utterances are rejected');
const prepared=prepareSpeechWave(wave());let peak=0,sum=0,count=0;for(let i=44;i<prepared.length;i+=2){const x=prepared.readInt16LE(i)/32768;peak=Math.max(peak,Math.abs(x));if(Math.abs(x)>.008){sum+=x*x;count++;}}
check(prepared.length<wave().length&&peak<.2&&Math.sqrt(sum/count)<.12,'outer silence is trimmed and voiced RMS normalized to quiet consistent level');
assert.throws(()=>prepareSpeechWave(Buffer.from('not audio')));check(true,'malformed synthesis output cannot reach the browser');
let calls=0,lastRequest;
const runner=async args=>{if(args[0]==='-Probe')return {available:true,voices:['Microsoft David','Microsoft Mark','Microsoft Zira']};calls++;
  const dir=process.platform==='win32'?args[1]:execFileSync('wslpath',['-u',args[1]],{encoding:'utf8'}).trim();
  lastRequest=JSON.parse(fs.readFileSync(dir+'/request.json'));fs.writeFileSync(dir+'/line.wav',wave());return {voice:lastRequest.voice};};
const server=http.createServer(createVoiceService({enabled:true,runner}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base='http://127.0.0.1:'+server.address().port,headers={'X-NGC-Voice':'1','Content-Type':'application/json'};
const post=v=>fetch(base,{method:'POST',headers,body:JSON.stringify(v)});
try{
  check((await fetch(base)).status===403,'voice service requires its same-origin custom header');
  check((await fetch(base,{headers:{...headers,Origin:'https://elsewhere.invalid'}})).status===403,'cross-origin voice requests are refused');
  check((await post({text:'',who:'conn',role:'command'})).status===400,'service rejects empty calls before synthesis');
  const first=await post({text,who:'conn',role:'command'}),a=Buffer.from(await first.arrayBuffer());
  check(first.ok&&a.equals(prepared)&&first.headers.get('X-NGC-Voice-Name')===deliveryFor('conn','command').voice,'service returns normalized PCM with the selected installed actor');
  await (await post({text,who:'conn',role:'command'})).arrayBuffer();check(calls===1,'complete-line cache avoids resynthesizing an identical call');
  check(lastRequest.ssml.includes('your patrol is on station')&&lastRequest.ssml.includes('<prosody'),'one synthesis request contains the entire punctuated reply and delivery');
}finally{await new Promise(r=>server.close(r));}
let posts=0,resolveAudio;
const audioBuffer={length:16000,numberOfChannels:1,duration:1};
const ctx={decodeAudioData:async()=>audioBuffer};
const fetcher=async(url,options)=>{
  if(url==='/version.json')return {ok:true,json:async()=>({speech:'windows'})};
  if(!options.method)return {ok:true,json:async()=>({available:true,voices:['Microsoft Mark']})};posts++;
  return {ok:true,headers:new Headers({'X-NGC-Voice-Name':'Microsoft Mark'}),arrayBuffer:()=>new Promise(r=>{resolveAudio=r;})};
};
const local=createLocalVoices({fetcher});await local.ready;
let ticket=local.prepare(ctx,{text,who:'conn',role:'command'});await until(()=>!!resolveAudio);ticket.cancel();resolveAudio(new ArrayBuffer(40));await until(()=>local.active===0);
check(ticket.state==='cancelled'&&!ticket.buffer,'cancelled synthesis cannot become ready after its response arrives');
resolveAudio=null;ticket=local.prepare(ctx,{text,who:'conn',role:'command'});await until(()=>!!resolveAudio);resolveAudio(new ArrayBuffer(40));await until(()=>ticket.state==='ready');
check(ticket.buffer===audioBuffer&&ticket.voice==='Microsoft Mark','client decodes a whole line and preserves actor identity');
const cached=local.prepare(ctx,{text,who:'conn',role:'command'});check(cached.state==='ready'&&posts===2,'decoded PCM is reused from a bounded client cache');
const pending=[];const queued=createLocalVoices({fetcher:async(url,o)=>url==='/version.json'?{ok:true,json:async()=>({speech:'windows'})}:!o.method?{ok:true,json:async()=>({available:true,voices:['Mark']})}:new Promise((resolve,reject)=>{pending.push(1);o.signal.addEventListener('abort',()=>reject(Error('cancelled')),{once:true});})});await queued.ready;
for(let i=0;i<8;i++)queued.prepare(ctx,{text:text+i,who:'conn',role:'command'});
check(queued.active===2&&queued.queued===6&&!queued.prepare(ctx,{text:'overflow',who:'conn',role:'command'}),'client bounds work to two requests and six waiting lines');
queued.stop();await until(()=>queued.active===0);check(queued.queued===0,'stopping audio cancels active and waiting synthesis work');
const missing=createLocalVoices({fetcher:async url=>({ok:true,json:async()=>url==='/version.json'?{speech:'windows'}:{available:false,voices:[]}})});await missing.ready;
check(!missing.available&&!missing.prepare(ctx,{text,who:'conn',role:'command'}),'no installed service leaves generated/silent fallback in control');
const noFlagRequests=[];const staticHost=createLocalVoices({fetcher:async url=>{noFlagRequests.push(url);return {ok:true,json:async()=>({commit:'test'})};}});await staticHost.ready;
check(!staticHost.available&&noFlagRequests.length===1&&noFlagRequests[0]==='/version.json','ordinary static host is never asked for an unadvertised voice endpoint');
if(process.argv.includes('--windows')){
  const real=http.createServer(createVoiceService({enabled:true}));await new Promise(r=>real.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+real.address().port;
  try{
    const cap=await(await fetch(url,{headers})).json();check(cap.available&&cap.voices.includes('Microsoft Mark'),'real WinRT exposes installed Mark in addition to desktop voices');
    for(const [who,role] of [['conn','command'],['betty','betty'],['tower','tower']]){
      const r=await fetch(url,{method:'POST',headers,body:JSON.stringify({text,who,role})}),b=Buffer.from(await r.arrayBuffer());
      check(r.ok&&b.toString('ascii',0,4)==='RIFF'&&b.length>16000&&r.headers.get('X-NGC-Voice-Name')===deliveryFor(who,role).voice,'real installed synthesis delivers full PCM: '+deliveryFor(who,role).voice);
    }
  }finally{await new Promise(r=>real.close(r));}
}
console.log(`${n}/${n} passed`);
