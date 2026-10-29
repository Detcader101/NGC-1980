// Browser PTT -> real AudioWorklet -> same-origin HTTP -> actual Windows recognition -> live carrier reply.
// Uses our generated WAV as the microphone stream, never opens a physical device. Requires --url to a
// worktree server launched with --speech windows. Separate from the portable browser-service tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
export default {name:'offlinevoice',query:'?debug&auto&kb&res=0.45&voices=generated',run:async function(h){
  await h.waitFor('window.__radioCommands && __G.G.state === "play"',20000);
  await h.eval('(async()=>{await __radioCommands.rec.ready;return {backend:__radioCommands.rec.backend,error:__radioCommands.rec.probeError,requests:performance.getEntriesByType("resource").filter(e=>e.name.includes("/version")||e.name.includes("/__speech")).map(e=>({name:e.name,ms:e.duration}))};})()');
  await h.waitFor('__radioCommands.rec.backend === "Windows offline"',15000);
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ngc-browser-mic-'));
  let encoded;
  try{
    const win=p=>execFileSync('wslpath',['-w',p],{encoding:'utf8'}).trim();
    fs.writeFileSync(path.join(dir,'fixture.ps1'),`param([string]$Root)\n$ErrorActionPreference='Stop'\n$ProgressPreference='SilentlyContinue'\nAdd-Type -AssemblyName System.Speech\n$s=New-Object System.Speech.Synthesis.SpeechSynthesizer\n$s.SetOutputToWaveFile((Join-Path $Root 'input.wav'))\n$s.Speak('Albatross, this is Command. Radio check. Over.')\n$s.SetOutputToNull()\n$s.Dispose()\n`);
    execFileSync('/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',win(path.join(dir,'fixture.ps1')),'-Root',win(dir)],{stdio:'pipe',timeout:15000});
    encoded=fs.readFileSync(path.join(dir,'input.wav')).toString('base64');
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
  await h.page.evaluate(async data=>{
    __G.G.bench=true;__radioCommands.open("settings");window.__micFixture={opened:0};
    const c=__micFixture.ctx=new AudioContext();await c.resume();
    const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));__micFixture.buffer=await c.decodeAudioData(bytes.buffer);
    Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>{
      __micFixture.opened++;const source=c.createBufferSource(),dest=c.createMediaStreamDestination();source.buffer=__micFixture.buffer;source.connect(dest);
      __micFixture.dest=dest;__micFixture.source=source;source.start(c.currentTime+.65);return dest.stream;
    }});
  },encoded);
  await h.expect('__micFixture.opened===0 && !__radioCommands.rec.active','opening RADIO never opens the microphone');
  await h.page.click('#radioCommand [data-bind-key]');await h.page.keyboard.press('v');
  await h.expect('__radioCommands.ptt.key==="KeyV" && __micFixture.opened===0','keyboard PTT can be rebound without opening the microphone');
  await h.page.keyboard.down('v');
  await h.waitFor('document.querySelector("#radioCommand output").textContent.startsWith("LISTENING")',10000);
  await h.waitFor('document.querySelector("#radioCommand [data-level]").value>.02',10000);
  await h.expect('__radioCommands.rec.active && !__radioCommands.net.last','held microphone shows level without issuing an order');
  const duration=await h.page.evaluate(()=>__micFixture.buffer.duration);
  await new Promise(r=>setTimeout(r,(duration+.8)*1000));
  await h.page.keyboard.up('v');
  await h.waitFor('__radioCommands.net.last?.ok === true',30000);
  await h.expect('!__G.cockpitCam','bound V transmits without also toggling the cockpit');
  await h.expect('__radioCommands.net.last.action==="check" && __radioCommands.net.last.target==="carrier"','actual offline transcript reaches the live carrier command net');
  await h.expect('document.querySelector("#radioCommand output").textContent.includes("Roger. Out.")','carrier reply is visible after local recognition');
  await h.expect('__micFixture.dest.stream.getTracks().every(t=>t.readyState==="ended") && !__radioCommands.rec.active','release closes actual captured tracks after transcription');
  await h.expect('document.querySelector("[data-heard]").textContent.toLowerCase().includes("this is command")','recognized call remains visible for diagnosis');
  await h.page.evaluate(()=>{const slider=document.querySelector('[data-volume-control]');slider.value='4';slider.dispatchEvent(new Event('input'));});
  await h.expect('__voices.V.vol===4 && document.querySelector("[data-volume]").textContent==="4/10"','RADIO voice slider controls the actual voice mixer');
  await h.shot('offline-radio-reply');
  await h.page.evaluate(()=>__radioCommands.open('orders'));
  await h.page.focus('#radioCommand input[name=call]');await h.page.keyboard.type('v');
  await h.expect('__micFixture.opened===1 && !__radioCommands.rec.active','typing a bound letter in the radio form does not transmit');
  await h.page.evaluate(()=>{document.querySelector('#radioCommand input[name=call]').value='';window.__radioPad={id:'Radio test HOTAS (Vendor: 1234 Product: 0001)',index:0,connected:true,mapping:'',axes:[0,0,1,0,0,0],buttons:Array.from({length:12},()=>({pressed:false,value:0}))};Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[__radioPad]});__G.CTL.poll();});
  await h.page.evaluate(()=>__radioCommands.open('settings'));
  await h.page.click('#radioCommand [data-bind-pad]');
  await h.page.evaluate(()=>{__radioPad.buttons[2].pressed=true;});
  await h.waitFor('__G.CTL.bindings.buttons.ptt?.btn===2',10000);
  await h.expect('__micFixture.opened===1 && !__radioCommands.rec.active','controller binding through the real controls panel never opens the mic');
  await h.page.evaluate(()=>__G.CTL.close());await new Promise(r=>setTimeout(r,200));
  await h.expect('!__radioCommands.rec.active','closing controls with the assigned button held does not transmit');
  await h.page.evaluate(()=>{__radioPad.buttons[2].pressed=false;__G.CTL.poll();__radioCommands.update(.02);});
  await h.page.evaluate(()=>{__radioPad.buttons[2].pressed=true;});
  await h.waitFor('__radioCommands.rec.active && __micFixture.opened===2',10000);
  await h.page.evaluate(()=>{Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>[]});});
  await h.waitFor('!__radioCommands.rec.active',10000);
  await h.expect('document.querySelector("#radioCommand output").textContent.includes("cancelled")','disconnecting the bound controller cancels its unfinished call');
  await h.page.click('#radioCommand [data-reset-key]');
  await h.expect('__radioCommands.ptt.key==="F9"','RADIO can restore the default F9 binding');
  await h.page.evaluate(async()=>{await __micFixture.ctx.close();__voices.V.vol=6;});
}};
