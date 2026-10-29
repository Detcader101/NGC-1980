// Opt-in loopback speech bridge. Browser PCM -> installed Windows recognizer -> text only.
// Temporary audio is deleted after recognition/cancellation. No microphone or cloud access from the server.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFile,execFileSync} from 'node:child_process';
const ps=process.platform==='win32'?'powershell.exe':'/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
const windows=p=>process.platform==='win32'?p:execFileSync('wslpath',['-w',p],{encoding:'utf8'}).trim();
export function validWave(b) {
  return b.length>=44&&b.length<=640044&&b.toString('ascii',0,4)==='RIFF'&&b.readUInt32LE(4)===b.length-8&&
    b.toString('ascii',8,16)==='WAVEfmt '&&b.readUInt32LE(16)===16&&b.readUInt16LE(20)===1&&b.readUInt16LE(22)===1&&
    b.readUInt32LE(24)===16000&&b.readUInt32LE(28)===32000&&b.readUInt16LE(32)===2&&b.readUInt16LE(34)===16&&
    b.toString('ascii',36,40)==='data'&&b.readUInt32LE(40)===b.length-44&&(b.length-44)%2===0;
}
export function createSpeechService({enabled=false}={}) {
  let busy=false,probe=null,script;
  const run=(args,signal)=>new Promise((resolve,reject)=>{
    try { script??=windows(path.join(import.meta.dirname,'speech-recognize.ps1')); } catch(e){reject(e);return;}
    execFile(ps,['-NoProfile','-ExecutionPolicy','Bypass','-File',script,...args],{timeout:20000,maxBuffer:131072,signal},(err,out)=>{
      if(err)return reject(err);try{resolve(JSON.parse(out.replace(/^\uFEFF/,'').trim()));}catch(e){reject(e);}
    });
  });
  const capability=()=>probe??=(enabled?run(['-Probe']).catch(()=>({available:false,reason:'Windows speech recognizer unavailable.'})):Promise.resolve({available:false,reason:'Local speech is not enabled on this server.'}));
  return async(req,res)=>{
    const send=(code,data)=>{if(!res.destroyed){res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(data));}};
    if(!/^(127\.|::1$|::ffff:127\.)/.test(req.socket.remoteAddress||'')||req.headers['x-ngc-speech']!=='1')return send(403,{reason:'Local requests only.'});
    if(req.headers.origin){let o;try{o=new URL(req.headers.origin);}catch{}if(!o||o.host!==req.headers.host||!['http:','https:'].includes(o.protocol))return send(403,{reason:'Same-origin requests only.'});}
    if(req.method==='GET')return send(200,await capability());
    if(req.method!=='POST')return send(405,{reason:'Unsupported method.'});
    if(!(await capability()).available)return send(503,{reason:'Local speech unavailable.'});
    if(busy)return send(429,{reason:'Speech recognizer busy. Say again shortly.'});
    busy=true;let dir;const abort=new AbortController();res.on('close',()=>{if(!res.writableEnded)abort.abort();});
    try {
      const chunks=[];let size=0;
      for await(const part of req){size+=part.length;if(size>2*1024*1024){send(413,{reason:'Transmission too long.'});req.resume();return;}chunks.push(part);}
      let input;try{input=JSON.parse(Buffer.concat(chunks).toString());}catch{return send(400,{reason:'Invalid transmission.'});}
      if(typeof input.audio!=='string'||!Array.isArray(input.phrases)||!input.phrases.length||input.phrases.length>2000||input.phrases.some(p=>typeof p!=='string'||p.length>240||!/^[a-zA-Z0-9 ,.!?'\-]+$/.test(p)))return send(400,{reason:'Invalid call grammar.'});
      const wav=Buffer.from(input.audio,'base64');if(!validWave(wav))return send(400,{reason:'Expected mono 16 kHz PCM WAV, at most 20 seconds.'});
      dir=fs.mkdtempSync(path.join(os.tmpdir(),'ngc-radio-'));
      fs.writeFileSync(path.join(dir,'call.wav'),wav);fs.writeFileSync(path.join(dir,'calls.json'),JSON.stringify(input.phrases));
      const result=await run(['-Root',windows(dir)],abort.signal);send(200,result);
    }catch(e){send(503,{reason:e.name==='AbortError'?'Transmission cancelled.':'Local speech could not finish. Say again.'});}
    finally{if(dir)fs.rmSync(dir,{recursive:true,force:true});busy=false;}
  };
}
