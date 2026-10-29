import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {execFileSync} from 'node:child_process';
import {encodeWave,openMicrophone} from '../game/js/voice/microphone.js';
import {createRadioRecognition,commandPhrases} from '../game/js/voice/localrecognition.js';
import {selectCommand} from '../game/js/voice/commands.js';
import {createRecognition} from '../game/js/voice/recognition.js';
import {createSpeechService,validWave} from './speech-server.mjs';
let count=0;const check=(ok,label)=>{assert.ok(ok,label);console.log('PASS '+label);count++;};
const targets=[{call:'Albatross',id:'carrier',actions:['check','status','proceed']}],places=[{name:'Sandbar'}];
const phrases=commandPhrases(targets,places);
check(phrases.length===3&&phrases.every(t=>/^Albatross, this is Command\. .+\. Over\.$/.test(t)),'offline grammar contains complete addressed calls only');
const tone=Float32Array.from({length:48000},(_,i)=>.2*Math.sin(i*.12));
const wav=encodeWave([tone],48000);check(validWave(Buffer.from(wav))&&wav.length===32044,'48 kHz input produces valid one-second mono 16 kHz WAV');
check(!validWave(Buffer.from('not audio')),'invalid WAV rejected');
check(!validWave(Buffer.alloc(640046)),'oversized WAV rejected');
let resumeMic,openedEarly=0;const oldAudio=globalThis.AudioContext,oldSecure=globalThis.isSecureContext;
globalThis.isSecureContext=true;globalThis.AudioContext=class{resume(){return new Promise(r=>resumeMic=r);}async close(){}};
try{const stopEarly=new AbortController(),opening=openMicrophone({signal:stopEarly.signal,media:{getUserMedia:async()=>{openedEarly++;return {getTracks:()=>[]};}}});stopEarly.abort();resumeMic();await assert.rejects(opening,/cancelled/);check(openedEarly===0,'cancel before audio context resumes never requests microphone permission');}
finally{if(oldAudio===undefined)delete globalThis.AudioContext;else globalThis.AudioContext=oldAudio;if(oldSecure===undefined)delete globalThis.isSecureContext;else globalThis.isSecureContext=oldSecure;}
let allowed=true,sent=[],states=[],opened=0,stopped=0,posts=0,resolveCapture,resolvePost;
const response=value=>({ok:true,json:async()=>value});
const fetcher=async(url,opts)=>{if(url==='/version.json')return response({speech:'windows'});if(!opts.method)return response({available:true});posts++;return new Promise(r=>{resolvePost=value=>r(response(value));});};
const rec=createRadioRecognition({allowed:()=>allowed,submit:a=>sent.push(a),state:s=>states.push(s),phrases:()=>phrases,fetcher,Recognition:null,
  capture:()=>{opened++;return new Promise(r=>resolveCapture=()=>r({stop(){stopped++;},finish:async()=>wav}));}});
let attempts=0;const retry=createRadioRecognition({allowed:()=>true,submit:()=>{},phrases:()=>phrases,Recognition:null,fetcher:async(url)=>{if(url==='/version.json'&&attempts++===0)throw Object.assign(Error('cold startup'),{name:'TimeoutError'});return response(url==='/version.json'?{speech:'windows'}:{available:true});}});await retry.ready;check(retry.backend==='Windows offline'&&attempts===2,'cold-start capability timeout retries without opening a microphone');
await rec.ready;check(rec.supported&&rec.backend==='Windows offline'&&opened===0,'capability detection never opens the microphone');
rec.start();await rec.release();resolveCapture();await Promise.resolve();check(!rec.active&&stopped===1&&posts===0,'release during permission opening closes a late stream without sending');
rec.start();resolveCapture();await Promise.resolve();const p=rec.release();await new Promise(r=>setImmediate(r));check(rec.active&&posts===1&&sent.length===0,'release waits for local transcript');
resolvePost({alternatives:[{transcript:phrases[0],confidence:.95}]});await p;check(sent.length===1&&!rec.active,'local transcript submits once after release');
rec.start();resolveCapture();await Promise.resolve();const cancelled=rec.release();await new Promise(r=>setImmediate(r));rec.cancel();resolvePost({alternatives:[{transcript:phrases[0],confidence:.95}]});await cancelled;check(sent.length===1,'cancelled local HTTP response cannot dispatch');
rec.start();resolveCapture();await Promise.resolve();const paused=rec.release();await new Promise(r=>setImmediate(r));allowed=false;resolvePost({alternatives:[{transcript:phrases[0],confidence:.95}]});await paused;allowed=true;check(sent.length===1,'pause before local response prevents dispatch');
rec.start();resolveCapture();await Promise.resolve();const empty=rec.release();await new Promise(r=>setImmediate(r));resolvePost({alternatives:[],reason:'Reception unclear.'});await empty;check(sent.length===1&&states.at(-1)==='Reception unclear.','uncertain local audio shows rejection without dispatch');
const denied=createRadioRecognition({allowed:()=>true,submit:()=>assert.fail('denied microphone submitted'),phrases:()=>phrases,fetcher,state:s=>states.push(s),Recognition:null,capture:async()=>{throw Object.assign(Error(),{name:'NotAllowedError'});}});
await denied.ready;denied.start();await new Promise(r=>setImmediate(r));check(!denied.active&&states.at(-1).includes('Microphone blocked'),'local permission denial is actionable and releases PTT');
class Stuck{start(){}abort(){this.aborted=true;}}
const stuck=createRecognition({Recognition:Stuck,submit:()=>assert.fail('stuck service submitted'),state:s=>states.push(s),openingTimeout:5});stuck.start();await new Promise(r=>setTimeout(r,15));check(!stuck.active&&states.at(-1).includes('did not start'),'native recognition cannot stay stuck opening');
const service=createSpeechService({enabled:process.argv.includes('--windows')}),server=http.createServer(service);
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port,headers={'X-NGC-Speech':'1','Content-Type':'application/json'};
try{
  check((await fetch(base)).status===403,'speech endpoint rejects requests without its custom header');
  check((await fetch(base,{headers:{...headers,Origin:'http://other.example'}})).status===403,'speech endpoint rejects a cross-origin caller');
  const cap=await(await fetch(base,{headers})).json();
  if(process.argv.includes('--windows')){
    check(cap.available,'installed Windows recognizer is available');
    check((await fetch(base,{method:'POST',headers,body:JSON.stringify({audio:'a',phrases})})).status===400,'endpoint validates PCM before invoking recognizer');
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ngc-stt-bench-'));
    try{
      const win=p=>execFileSync('wslpath',['-w',p],{encoding:'utf8'}).trim();
      fs.writeFileSync(path.join(dir,'fixture.ps1'),`param([string]$Root)\n$ErrorActionPreference='Stop'\n$ProgressPreference='SilentlyContinue'\nAdd-Type -AssemblyName System.Speech\n$s=New-Object System.Speech.Synthesis.SpeechSynthesizer\n$f=New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(16000,[System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen,[System.Speech.AudioFormat.AudioChannel]::Mono)\n$lines=@('Albatross, this is Command. Radio check. Over.','Albatross, this is Command. Proceed to Sandbar. Over.','Albatross, hold position.','Please pass the coffee.','Albatross, this is Command. Radio check.','Albatross, this is Enemy. Radio check. Over.','Albatross, this is Command. Radio check. Over. Albatross, this is Command. Proceed to Sandbar. Over.')\nfor($i=0;$i -lt $lines.Count;$i++){$s.SetOutputToWaveFile((Join-Path $Root ($i.ToString()+'.wav')),$f);$s.Speak($lines[$i]);$s.SetOutputToNull()}\n$s.Dispose()\n`);
      execFileSync('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',win(path.join(dir,'fixture.ps1')),'-Root',win(dir)],{stdio:'pipe',timeout:30000});
      for(let i=0;i<7;i++){
        const bytes=fs.readFileSync(path.join(dir,i+'.wav'));let at=12,data;
        while(at+8<=bytes.length){const n=bytes.readUInt32LE(at+4);if(bytes.toString('ascii',at,at+4)==='data'){data=bytes.subarray(at+8,at+8+n);break;}at+=8+n+n%2;}
        const pcm=Float32Array.from({length:data.length/2},(_,j)=>data.readInt16LE(j*2)/32768),audio=Buffer.from(encodeWave([pcm],16000)).toString('base64');
        const reply=await(await fetch(base,{method:'POST',headers,body:JSON.stringify({audio,phrases})})).json();console.log('RECOGNIZED',i,JSON.stringify(reply));
        if(i<2)check(reply.alternatives?.some(a=>a.transcript.toLowerCase().includes(i===0?'radio check':'proceed to sandbar')),'actual Windows recognition: authored valid call '+i);
        else check(!selectCommand(reply.alternatives,targets,places).ok,'actual Windows recognition does not turn invalid speech into a valid call '+i);
      }
      const silence=Buffer.from(encodeWave([new Float32Array(16000)],16000)).toString('base64');
      const quiet=await(await fetch(base,{method:'POST',headers,body:JSON.stringify({audio:silence,phrases})})).json();check(!quiet.alternatives?.length,'actual Windows silence produces no command');
    }finally{fs.rmSync(dir,{recursive:true,force:true});}
  }else check(!cap.available,'local speech disabled unless server opts in');
}finally{await new Promise(r=>server.close(r));}
console.log(`${count}/${count} passed`);
