// Existing HTML/canvas screens remain the UI authority. A spatial panel copies them, and sends real DOM events
// back to the original elements (including pointer drags in inventory/medical). Desktop UI never moves or resizes.
import * as THREE from 'three';
const $ = id => document.getElementById(id);
const shown = el => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
export function createXRPanel(h) {
  const canvas = document.createElement('canvas'), c = canvas.getContext('2d');
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter; texture.generateMipmaps = false;
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  mesh.name = 'VR interface'; mesh.renderOrder = 10000; mesh.frustumCulled = false;
  const bar = document.createElement('div'); bar.id = 'xrBar'; bar.style.display = 'none';
  const style = document.createElement('style'); style.textContent = `
.ngc-vr body> :not(#gl):not(iframe):not([data-webxr_runtime]){opacity:0!important}
#xrBar{position:fixed;bottom:8px;left:2%;right:2%;justify-content:center;display:flex;gap:6px;z-index:100;pointer-events:auto}
#xrBar button,#xrDeck button{font:18px Consolas,monospace;color:#bff;background:#092b38;border:1px solid #699;padding:9px;cursor:pointer}
#xrBar button{flex:1;padding:8px 4px}
#xrDeck{position:fixed;inset:3% 2% 80px;padding:16px;overflow:auto;background:#061924f5;border:1px solid #8ff;z-index:99;pointer-events:auto}
#xrDeck h3{margin:4px 0 12px;color:white} #xrDeck p{font:18px Consolas;line-height:1.4}
#xrDeck .xrRow{display:flex;gap:5px;margin:6px 0;flex-wrap:wrap} #xrDeck button.on{background:#275b58;color:#ff8}
#xrDeck [data-code]{min-width:39px} #xrDeck [data-mod]{min-width:72px}
.xr-layout #techBoard,.xr-layout #cmdBoard{left:2%;top:3%;transform:none;width:96%;max-height:calc(94vh - 80px);background:#061924;z-index:20;text-shadow:none}
.xr-layout #cmdBoard{font-size:22px}
.xr-layout #cmdBoard h3,.xr-layout #techBoard h3{font-size:26px}
.xr-layout #cmdBoard .sub,.xr-layout #cmdBoard .st,.xr-layout #cmdBoard .base,.xr-layout #techBoard .sub{font-size:18px}
.xr-layout #cmdBoard .row{padding:9px}
.xr-layout #menu{padding-bottom:85px}
.xr-layout .ngc-ov{bottom:85px}
`;
  document.head.appendChild(style); document.body.appendChild(bar);
  const deck = document.createElement('div'); deck.id = 'xrDeck'; deck.style.display = 'none'; document.body.appendChild(deck);
  let enabled = false, open = false, snapshot = null, busy = false, nextPaint = 0, nextCapture = 0, capture = null, revision = 0;
  let pointer = null, pointerTarget = null, downTarget = null, downPoint = null, downButton = 0, secondary = false;
  const held = new Set(), modifiers = new Set();
  const api = { mesh, canvas, width: 2.8, lastCaptureMs: 0, paints: 0, captures: 0, get open() { return open; }, get secondary() { return secondary; } };
  const button = (parent, label, action) => { const b = document.createElement('button'); b.textContent = label; b.onclick = e => { e.stopPropagation(); action(); }; parent.appendChild(b); return b; };
  const tap = code => { h.key(code, true, modifiers); h.key(code, false, modifiers); };
  button(bar, 'MENU / KEYS', () => api.toggle()); button(bar, 'COMMAND', () => { api.close(); tap('Backslash'); });
  button(bar, 'RESEARCH', () => { api.close(); h.research(); }); button(bar, 'MAP', () => { api.close(); tap('KeyM'); });
  button(bar, 'PAUSE / BACK', () => { api.close(); tap('Escape'); }); button(bar, 'RECENTRE', () => h.recenter());
  deck.innerHTML = '<h3>VR CONTROLS</h3><p>Aircraft: right stick flies; left stick steers and changes throttle/collective. On foot: left stick moves; right stick snaps your heading. Right trigger fires; left trigger is the secondary weapon / aim. Point and trigger to use a panel or cockpit switch.<br>Hands: point and pinch for UI. Away from the panel, pinch and move the right hand to fly; the left hand changes collective and yaw. On foot, left pinch and move to walk; aim with the right hand and pinch to fire. Use HOLD buttons and the keys below for other actions.</p>';
  const actions = document.createElement('div'); actions.className = 'xrRow'; deck.appendChild(actions);
  for(const [label,action] of [['HOLD: FIRE','fire'],['HOLD: AIM / SECONDARY','secondary']]){const b=button(actions,label,()=>{});b.onpointerdown=()=>h.action(action,true);b.onpointerup=()=>h.action(action,false);}
  button(actions, 'VIEW', () => tap('KeyV')); button(actions, 'GET IN / OUT', () => tap('KeyY'));
  button(actions, 'TURN LEFT 30°', () => h.turn(-Math.PI/6));button(actions, 'TURN RIGHT 30°', () => h.turn(Math.PI/6));
  button(actions, 'PREVIOUS SEAT', () => tap('BracketLeft')); button(actions, 'NEXT SEAT', () => tap('BracketRight'));
  const physical = button(actions, 'INPUT: VR', () => { h.physical(!h.isPhysical()); physical.textContent = h.isPhysical() ? 'INPUT: HOTAS / KEYBOARD' : 'INPUT: VR'; });
  const alternate = button(actions, 'SECONDARY CLICK: OFF', () => { secondary = !secondary; alternate.textContent = `SECONDARY CLICK: ${secondary ? 'ON' : 'OFF'}`; });
  button(actions, 'EXIT VR', () => h.exit());
  const rows = [
    [['Esc','Escape'],['Tab','Tab'],['`','Backquote'],...Array.from({length:10},(_,i)=>[String((i+1)%10),'Digit'+((i+1)%10)]),['-','Minus'],['=','Equal'],['Backspace','Backspace']],
    [...'QWERTYUIOP'.split('').map(x=>[x,'Key'+x]),['[','BracketLeft'],[']','BracketRight'],['\\','Backslash']],
    [...'ASDFGHJKL'.split('').map(x=>[x,'Key'+x]),[';','Semicolon'],["'",'Quote'],['Enter','Enter']],
    [...'ZXCVBNM'.split('').map(x=>[x,'Key'+x]),[',','Comma'],['.','Period'],['/','Slash'],['Space','Space']],
    [['↑','ArrowUp'],['↓','ArrowDown'],['←','ArrowLeft'],['→','ArrowRight'],['Home','Home'],['End','End'],['PgUp','PageUp'],['PgDn','PageDown'],['Insert','Insert'],['Delete','Delete'],['F6','F6'],['F8','F8']]
  ];
  for (const row of rows) { const el = document.createElement('div'); el.className = 'xrRow'; deck.appendChild(el);
    for (const [label,code] of row) { const b = button(el,label,()=>{}); b.dataset.code=code;
      b.onpointerdown = e => { e.preventDefault(); held.add(code); h.key(code,true,modifiers); };
      b.onpointerup = () => { held.delete(code); h.key(code,false,modifiers); };
    }
  }
  const mods = document.createElement('div'); mods.className = 'xrRow'; deck.appendChild(mods);
  for (const [label,code] of [['Shift','ShiftLeft'],['Ctrl','ControlLeft'],['Alt','AltLeft']]) {
    const b = button(mods,label,()=>{ const on = !modifiers.has(code); if(on) modifiers.add(code); else modifiers.delete(code); h.key(code,on,modifiers); b.classList.toggle('on',on); }); b.dataset.mod=code;
  }
  const scroll = (amount) => {
    let el = pointerTarget;
    while (el && el !== document.body) { const s = getComputedStyle(el); if (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight) { el.scrollTop += amount; nextCapture = 0; return; } el = el.parentElement; }
    const el2 = Array.from(document.querySelectorAll('#menuItems,#techBoard,#cmdBoard,#xrDeck,.ngc-ov')).find(e=>shown(e)&&e.scrollHeight>e.clientHeight); if(el2) el2.scrollTop += amount;
    nextCapture = 0;
  };
  button(bar,'SCROLL ↑',()=>scroll(-170)); button(bar,'↓',()=>scroll(170));
  api.scroll = scroll;
  api.modals = () => Array.from(document.querySelectorAll('#title,#menu,#cmdBoard,#techBoard,.ngc-ov,#tzc')).some(shown) || $('radar')?.classList.contains('big');
  api.blocked = () => open || api.modals();
  api.toggle = () => { open = !open; deck.style.display = open ? 'block' : 'none'; if(!open)api.release();snapshot = null; nextCapture = 0; };
  api.close = () => { if(open) api.toggle(); };
  api.enable = value => { enabled=value; mesh.visible=value; bar.style.display=value?'flex':'none'; document.documentElement.classList.toggle('xr-layout',value); revision++; if(!value) { api.close(); api.release(); snapshot=null; } };
  api.release = () => { if(downTarget) api.pointer('up',{x:-1,y:-1},0,true); downTarget=null; downPoint=null;
    h.action('fire',false);h.action('secondary',false);
    for(const code of new Set([...held,...modifiers])) h.key(code,false,modifiers); held.clear(); modifiers.clear();
    for(const b of deck.querySelectorAll('[data-mod]')) b.classList.remove('on');
  };
  api.hit = uv => {
    if(!enabled) return null; const point={x:uv.x*innerWidth,y:(1-uv.y)*innerHeight};
    const el=document.elementFromPoint(point.x,point.y);
    return el && el!==document.body && el!==document.documentElement && el.id!=='gl' && !el.closest('#xrEntry') ? point : null;
  };
  api.pointer = (type, point, buttonOverride = 0, cancel = false) => {
    if(!point) { if(type==='up'&&downPoint) point=downPoint; else return; }
    pointer=point; const target=document.elementFromPoint(point.x,point.y) || document.body;
    pointerTarget=target;
    const b=type==='down' ? buttonOverride||((secondary && !target.closest('#xrDeck,#xrBar'))?2:0) : downButton;
    const init={bubbles:true,cancelable:true,clientX:point.x,clientY:point.y,pointerId:1980,pointerType:'pen',isPrimary:true,button:b,buttons:type==='up'?0:downTarget?1:0,
      shiftKey:modifiers.has('ShiftLeft'),ctrlKey:modifiers.has('ControlLeft'),altKey:modifiers.has('AltLeft')};
    const range=type==='down'?target:downTarget;
    if(range?.matches('input[type=range]') && type!=='up') { const r=range.getBoundingClientRect(),p=Math.max(0,Math.min(1,(point.x-r.left)/r.width)); range.value=+range.min+(+range.max-(+range.min||0))*p; range.dispatchEvent(new Event('input',{bubbles:true})); }
    if(type==='down') { downTarget=target; downPoint={...point}; downButton=b; init.buttons=b===2?2:1; }
    target.dispatchEvent(new PointerEvent('pointer'+(type==='move'?'move':type),init));
    target.dispatchEvent(new MouseEvent('mouse'+(type==='move'?'move':type),init));
    if(type==='up') {
      h.action('fire',false);h.action('secondary',false);
      for(const code of held) h.key(code,false,modifiers); held.clear();
      if(!cancel&&downTarget===target && downPoint && Math.hypot(point.x-downPoint.x,point.y-downPoint.y)<12) {
        target.dispatchEvent(new MouseEvent(b===2?'contextmenu':'click',init));
        if(b===2) { secondary=false; alternate.textContent='SECONDARY CLICK: OFF'; }
      }
      downTarget=null; downPoint=null;
    }
    nextCapture=0;
  };
  const text = (str,x,y,max=innerWidth-32) => { c.fillStyle='#bff'; c.fillText(str,x,y,max); };
  api.update = async now => {
    if(!enabled || now<nextPaint) return; nextPaint=now+100;
    const w=innerWidth, hh=innerHeight;
    if(canvas.width!==w||canvas.height!==hh) { canvas.width=w; canvas.height=hh; texture.dispose(); snapshot=null; }
    mesh.scale.set(api.width,api.width*hh/w,1); c.clearRect(0,0,w,hh);
    const modal=api.blocked()||shown($('simov'));
    if(modal && snapshot) c.drawImage(snapshot,0,0,w,hh);
    else {
      c.font='20px Consolas,monospace'; c.shadowColor='#000'; c.shadowBlur=4;
      const wrap=(str,x,y,width,maxLines=3)=>{let line='',n=0;for(const word of str.split(/\s+/)){if(c.measureText(line+' '+word).width>width&&line){text(line,x,y,width);y+=25;line='';if(++n>=maxLines)return y;}line+=(line?' ':'')+word;}if(line)text(line,x,y,width);return y+25;};
      let y=25;
      for(const id of ['war','fleet','weap']){const el=$(id);if(shown(el))y=wrap(el.innerText,14,y,w-190,3);}
      const bot=$('bot'); if(shown(bot)){const fuel=$('fuel');wrap(`${$('fuelLbl')?.textContent||'FUEL'} ${Math.round(parseFloat(fuel?.style.width)||0)}%  ${$('alt')?.innerText||''}`,14,hh-115,w-190,2);}
      const hint=$('hint');if(shown(hint))wrap(hint.innerText,14,hh-170,w-190,2);
      const msg=$('msg');if(shown(msg)&&+getComputedStyle(msg).opacity>.1)wrap(msg.innerText,14,hh*.52,w-28,3);
      const radar=$('radar'); if(radar?.width){ const r=radar.getBoundingClientRect();c.drawImage(radar,r.x,r.y,r.width,r.height); }
      // Existing sight/reticle canvases keep their exact pixels and viewport mapping on the optical display.
      for(const overlay of document.querySelectorAll('canvas:not(#gl):not(#radar)')){if(!shown(overlay)||overlay.closest('[data-xr-ignore],[data-webxr_runtime]'))continue;const r=overlay.getBoundingClientRect();if(r.width>=w*.8&&r.height>=hh*.8)c.drawImage(overlay,r.x,r.y,r.width,r.height);}
      for(const el of bar.querySelectorAll('button')) { const r=el.getBoundingClientRect(); c.fillStyle='#092b38'; c.fillRect(r.x,r.y,r.width,r.height); c.strokeStyle='#699'; c.strokeRect(r.x,r.y,r.width,r.height); c.font='18px Consolas'; text(el.textContent,r.x+6,r.y+r.height/2+6,r.width-12); }
    }
    if(pointer) { c.shadowBlur=0; c.strokeStyle='#ff8'; c.lineWidth=2; c.beginPath(); c.arc(pointer.x,pointer.y,7,0,Math.PI*2);c.stroke(); }
    texture.needsUpdate=true; api.paints++;
    if(!modal) { snapshot=null; return; }
    if(busy||now<nextCapture) return; busy=true; const rev=revision, t=performance.now();
    try {
      capture ||= (await import('../../vendor/html2canvas.js')).default;
      // Cloning every hidden inventory/control screen is expensive even when only research is open.
      // Keep the document styles, but copy only visible modal roots and the toolbar into the spatial texture.
      const roots=Array.from(document.querySelectorAll('#title,#menu,#cmdBoard,#techBoard,#xrDeck,#xrBar,.ngc-ov,#tzc,#radar.big,#simov')).filter(shown);
      const result=await capture(document.body,{backgroundColor:null,scale:Math.min(1,1536/w),width:w,height:hh,logging:false,
        ignoreElements:e=>e.id==='gl'||e.id==='xrEntry'||e.tagName==='IFRAME'||e.dataset?.xrIgnore!==undefined||
          (e!==document.body&&!!e.closest('body')&&!roots.some(root=>root.contains(e)||e.contains(root)))||
          (!!e.parentElement?.closest('body')&&getComputedStyle(e).display==='none'),
        onclone:doc=>{doc.documentElement.classList.remove('ngc-vr');doc.body.style.background='transparent';doc.documentElement.style.background='transparent';},imageTimeout:1500});
      if(enabled&&revision===rev) { snapshot=result; api.lastCaptureMs=performance.now()-t; api.captures++; }
    } catch(e) { h.error('VR panel: '+e.message); }
    finally { busy=false; nextCapture=performance.now()+250; }
  };
  return api;
}
