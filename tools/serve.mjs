// Static server for game/ with caching disabled, so a reload always runs the latest working tree.
// Also serves /version.json (git commit, dirty flag, date) for the build stamp on the title screen.
//   node tools/serve.mjs [--port 8765] [--host 127.0.0.1] [--cert cert.pem --key key.pem]
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GAME = path.join(ROOT, 'game');
const { values } = parseArgs({options:{port:{type:'string',default:'8765'},host:{type:'string',default:'127.0.0.1'},cert:{type:'string'},key:{type:'string'},help:{type:'boolean'}}});
if(values.help){console.log('node tools/serve.mjs [--port 8765] [--host 127.0.0.1] [--cert cert.pem --key key.pem]\nWebXR requires localhost or HTTPS with a certificate trusted by the headset.');process.exit(0);}
const port = Number(values.port), host = values.host;
if(!Number.isInteger(port)||port<0||port>65535)throw new Error('--port must be 0..65535');
if(!!values.cert!==!!values.key)throw new Error('HTTPS needs both --cert and --key');
const tls=values.cert?{cert:fs.readFileSync(values.cert),key:fs.readFileSync(values.key)}:null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css',
  '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.mp3': 'audio/mpeg' };

function version() {
  const git = c => { try { return execSync(`git ${c}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return ''; } };
  return { root: ROOT, commit: git('rev-parse --short HEAD') || 'nogit', dirty: !!git('status --porcelain -- game'), date: git('log -1 --format=%cd --date=format:%Y-%m-%d_%H:%M'), served: new Date().toISOString() };
}

const handler = (req, res) => {
  const send = (code, body, type = 'text/plain') => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); };
  let url;try{url=decodeURIComponent(new URL(req.url,'http://x').pathname);}catch{return send(400,'bad URL');}
  if(url.includes('\0'))return send(400,'bad URL');
  if (url === '/version.json') return send(200, JSON.stringify(version()), 'application/json');
  let file = path.join(GAME, url.endsWith('/') ? url + 'index.html' : url);
  if (!file.startsWith(GAME+path.sep)) return send(403, 'forbidden');
  if (url === '/favicon.ico') file = path.join(ROOT, 'launcher', 'thrust-zarch.ico');   // the game-rendered icon
  fs.readFile(file, (err, data) => err ? send(404, 'not found') : send(200, data, TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'));
};
const server=tls?https.createServer(tls,handler):http.createServer(handler);
server.listen(port,host,()=>console.log(`serving ${GAME} at ${tls?'https':'http'}://${host.includes(':')?'['+host+']':host}:${server.address().port}/`));
