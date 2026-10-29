// Test the actual HTTP/HTTPS launch commands using owned ephemeral listeners and a temporary test certificate.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {voiceBankIndex} from './voice-bank.mjs';
import {fileURLToPath} from 'node:url';
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'ngc-serve-test-')), children=[];
const benchId='serve-'+process.pid, benchDir=new URL('./runs/bench-'+benchId+'/',import.meta.url);
const start=args=>new Promise((resolve,reject)=>{
  const child=spawn(process.execPath,[new URL('./serve.mjs',import.meta.url).pathname,'--port','0',...args],{stdio:['ignore','pipe','pipe']});children.push(child);
  let output='';const timer=setTimeout(()=>reject(Error('server startup timed out')),10000);
  child.stdout.on('data',buf=>{output+=buf;const m=output.match(/at (https?:\/\/\S+)\//);if(m){clearTimeout(timer);resolve(m[1]);}});
  child.on('error',reject);child.on('exit',code=>{clearTimeout(timer);if(code)reject(Error('server exit '+code));});
});
const get=(base,route,headers={})=>new Promise((resolve,reject)=>{
  const u=new URL(base),client=u.protocol==='https:'?https:http;
  client.get({hostname:u.hostname,port:u.port,path:route,headers,rejectUnauthorized:false},res=>{let data='';res.on('data',v=>data+=v);res.on('end',()=>resolve({status:res.statusCode,data,headers:res.headers}));}).on('error',reject);
});
let count=0;const check=(name,condition)=>{assert.ok(condition,name);count++;console.log('PASS '+name);};
try{
  const httpURL=await start([]);
  const root=await get(httpURL,'/');check('default loopback serves the game without caching',root.status===200&&root.data.includes('NGC-1980')&&root.headers['cache-control']==='no-store');
  const ver=await get(httpURL,'/version.json');check('version identifies the actual working tree',ver.status===200&&!!JSON.parse(ver.data).commit);
  const bank=await get(httpURL,'/audio/voices/index.json');check('optional voice manifest resolves through the shared local-bank contract without 404',bank.status===200&&bank.headers['cache-control']==='no-store'&&JSON.stringify(JSON.parse(bank.data))===JSON.stringify(voiceBankIndex(fileURLToPath(new URL('../game/',import.meta.url)))));
  check('malformed URL returns 400 without killing the server',(await get(httpURL,'/%FF')).status===400);
  check('encoded NUL returns 400 without a filesystem exception',(await get(httpURL,'/%00')).status===400);
  check('encoded path cannot escape game root',(await get(httpURL,'/..%2Ftools/package.json')).status===403);
  check('server survives invalid requests',(await get(httpURL,'/js/xr/runtime.js')).status===200);
  const speech=await get(httpURL,'/__speech',{'X-NGC-Speech':'1'}),voice=await get(httpURL,'/__voice',{'X-NGC-Voice':'1'});
  check('both speech endpoints remain present and opt-in',speech.status===200&&voice.status===200&&JSON.parse(speech.data).available===false&&JSON.parse(voice.data).available===false);
  check('speech keeps same-origin enforcement',(await get(httpURL,'/__speech',{'X-NGC-Speech':'1',Origin:'http://unrelated.invalid'})).status===403);
  check('voice keeps same-origin enforcement',(await get(httpURL,'/__voice',{'X-NGC-Voice':'1',Origin:'http://unrelated.invalid'})).status===403);
  const payload=JSON.stringify({scope:'radio/render integration'}),saved=await fetch(httpURL+'/__bench?kind=desktop&run='+benchId+'&name=contract.json',{method:'POST',headers:{'X-NGC-Bench':'1','Content-Type':'application/json'},body:payload});
  check('desktop benchmark storage coexists with speech endpoints',saved.ok&&fs.readFileSync(new URL('contract.json',benchDir),'utf8')===payload);
  const cert=path.join(temp,'cert.pem'),key=path.join(temp,'key.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',key,'-out',cert,'-days','1','-subj','/CN=localhost'],{stdio:'ignore'});
  const tlsURL=await start(['--host','127.0.0.1','--cert',cert,'--key',key]);
  check('HTTPS serves the same playable game',(await get(tlsURL,'/')).data.includes('NGC-1980'));
  check('HTTPS modules keep JavaScript MIME types',(await get(tlsURL,'/js/xr/runtime.js')).headers['content-type']==='text/javascript');
  console.log(`${count}/${count} server checks passed (temporary certificate; headset trust is a separate setup step)`);
}finally{await Promise.all(children.map(c=>new Promise(resolve=>{if(c.exitCode!==null)return resolve();c.once('exit',resolve);c.kill('SIGTERM');})));fs.rmSync(temp,{recursive:true,force:true});fs.rmSync(benchDir,{recursive:true,force:true});}
