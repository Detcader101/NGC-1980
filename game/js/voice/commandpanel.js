import {createRadioRecognition,commandPhrases} from './localrecognition.js';
import {ORDER_TEXT} from './commands.js';
import {createPTT,pttLabel} from './ptt.js';
import {COMMAND_DESK_CSS} from './commanddesk.css.js';

const CHANNELS={all:'All stations',command:'Command',air:'Air',ground:'Ground',support:'Support'};
const STATES={awaiting:'Readback',active:'In progress',complete:'Complete',failed:'Unable',cancelled:'Cancelled'};
const title=s=>String(s||'').replace(/^./,c=>c.toUpperCase());
const callText=(station,body)=>`${station}, this is Command. ${title(body).replace(/[.!?]+$/,'')}. ${/^disregard$/i.test(body)?'Out':'Over'}.`;
const clock=t=>{const n=Math.max(0,Math.floor(Number(t)||0));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};

// A radio desk, not a second command implementation. Written calls, guided calls and PTT all
// reach the same live parser. Selecting a station/order only prepares a transmission.
export function createCommandPanel({net,allowed,voices,places,controls,openBoard,onOpen,host=document.body}) {
  const style=document.createElement('style');style.textContent=COMMAND_DESK_CSS;document.head.append(style);
  const el=document.createElement('div');el.id='radioCommand';el.hidden=true;
  el.innerHTML=`<div class="radio-dock"><span data-dock-status hidden></span><button data-toggle aria-expanded="false" aria-controls="radioDesk">RADIO · F9</button></div>
<section class="radio-desk" id="radioDesk" aria-label="Command radio" hidden>
<header class="radio-heading"><div><small>Task Force Albatross · callsign Command</small><h3>Command radio</h3></div><button data-close aria-label="Close command radio" title="Close · Escape">×</button></header>
<nav class="radio-tabs" role="tablist" aria-label="Radio pages"><button data-tab="orders" role="tab" aria-selected="true" aria-controls="radioOrders">Orders</button><button data-tab="tasks" role="tab" aria-selected="false" aria-controls="radioTasks">Missions <span data-task-count></span></button><button data-tab="traffic" role="tab" aria-selected="false" aria-controls="radioTraffic">Traffic</button><button data-tab="settings" role="tab" aria-selected="false" aria-controls="radioSettings">Settings</button></nav>
<div class="radio-pages">
<div data-page="orders" id="radioOrders" role="tabpanel">
<div data-pending></div>
<div class="radio-fields"><label>Station group<select data-channel aria-label="Station group"></select></label><label>Called station<select data-station aria-label="Called station"></select></label></div>
<p data-station-note></p>
<div class="radio-fields"><label>Message<select data-order aria-label="Radio message"></select></label><label data-destination-label>Destination<select data-destination aria-label="Destination"></select></label></div>
<p data-order-note></p>
<div class="radio-call"><small>Read this call while holding push-to-talk</small><p data-preview></p></div>
<div class="radio-call-actions"><button data-send>Send written call</button><small data-send-note>Uses the same radio procedure as your microphone.</small></div>
<form><label>Or type your own complete call<div class="radio-written"><input name="call" maxlength="240" autocomplete="off" spellcheck="false" aria-label="Complete radio call" placeholder="Albatross, this is Command. Radio check. Over."><button>Send</button></div></label></form>
<details class="radio-help"><summary>Radio procedure</summary><p>Call the station, identify yourself as <b>Command</b>, give one message, then say <b>Over</b> when you need a reply.</p><p><b>Say again</b> asks for the last reply. Review a readback before sending <b>Correct</b>. <b>Disregard. Out.</b> cancels an order still awaiting your confirmation.</p><p>Selecting a station prepares your call. The station named in your spoken or written call receives it.</p></details>
<button data-board ${openBoard?'':'hidden'}>Fleet board · reserves and direct unit control ↗</button>
</div>
<div data-page="tasks" id="radioTasks" role="tabpanel" hidden><h4>Mission ledger</h4><small>Readbacks, active orders and their reported outcomes.</small><ul class="radio-list" data-tasks></ul></div>
<div data-page="traffic" id="radioTraffic" role="tabpanel" hidden><h4>Command traffic</h4><small>Newest transmission first. Rejected calls remain visible.</small><small data-heard></small><ul class="radio-list" data-traffic></ul></div>
<div data-page="settings" id="radioSettings" role="tabpanel" hidden>
<div class="radio-settings-block"><h4>Microphone</h4><p><small data-backend>Checking speech service…</small></p><button data-mic>Check microphone</button><label data-meter-label>Input level<meter data-level min="0" max="1" value="0"></meter></label><p><small data-privacy>Microphone access starts only when you talk or check permission.</small></p></div>
<div class="radio-settings-block"><h4>Push-to-talk</h4><p>Hold <b data-key>F9</b> to speak. Release to transmit.</p><div class="radio-buttons"><button data-bind-key>Bind key</button><button data-reset-key>Reset F9</button><button data-bind-pad>Bind controller</button></div><p><small>The assigned controller button is reserved for push-to-talk.</small></p></div>
<div class="radio-settings-block"><label>Voice volume <span data-volume></span><input data-volume-control type="range" min="0" max="10" step="1" aria-label="Voice volume"></label><p><small data-voice-backend></small></p></div>
</div>
</div>
<footer class="radio-foot"><div class="radio-talk-row"><button data-talk aria-pressed="false"><span data-transmission></span>Hold to talk · <span data-talk-key>F9</span></button><button data-cancel>Cancel</button></div><output aria-live="polite">Ready.</output><div class="radio-footer-note"><span data-ptt-hint>One message per transmission</span><span>ESC · close</span></div></footer>
</section>`;
  host.append(el);
  const $=s=>el.querySelector(s), panel=$('.radio-desk'),output=$('output'),talk=$('[data-talk]');
  const channel=$('[data-channel]'),station=$('[data-station]'),order=$('[data-order]'),destination=$('[data-destination]');
  let page='orders',groups=[],chosen=null,rosterSignature='',ordersSignature='',pendingSignature='',taskSignature='',trafficSignature='',lastFocus=null;
  const canTalk=()=>allowed()&&!controls?.isOpen;
  const state=t=>{output.textContent=t;const dock=$('[data-dock-status]');
    dock.textContent=/^LISTENING/.test(t)?'Listening…':/transcrib|processing/i.test(t)?'Transcribing…':/opening microphone/i.test(t)?'Opening microphone…':/cancelled/i.test(t)?'Call cancelled':/blocked|unavailable|timed out|did not open/i.test(t)?'Check radio settings':'';
    dock.hidden=!dock.textContent;};
  const submit=alternatives=>{voices.transmitting=false;$('[data-heard]').textContent='Heard: '+(alternatives[0]?.transcript||'');const r=net.receive(alternatives);state(r.reason);refresh();return r;};
  const sendText=text=>{if(!text)return;ptt.cancel();submit([{transcript:text,confidence:1}]);};
  const rec=createRadioRecognition({allowed:canTalk,submit,state,phrases:()=>commandPhrases(net.targets(),places),level:n=>{$('[data-level]').value=Math.min(1,n*3);},backend:name=>{
    $('[data-backend]').textContent='Recognition: '+name;$('[data-meter-label]').hidden=name!=='Windows offline';
    $('[data-privacy]').textContent=name==='Windows offline'?'Push-to-talk audio is transcribed on this PC, then deleted. No cloud service. Microphone access begins only when you talk or check permission.':'Your browser may send microphone audio to its speech service. Microphone access begins only when you talk or check permission.';
  }});
  rec.ready.then(()=>{talk.disabled=!rec.supported;if(!rec.supported)state('Speech recognition is unavailable here. You can send written radio calls.');});
  const start=()=>{if(!canTalk())return false;voices.stop('transmitting');const started=rec.start();if(started)voices.transmitting=true;return started;};
  const keyLabel=code=>{const label=pttLabel(code);$('[data-key]').textContent=label;$('[data-talk-key]').textContent=label;$('[data-toggle]').textContent='RADIO · '+label;};
  const ptt=createPTT({allowed:canTalk,start,release:()=>rec.release(),cancel:message=>rec.cancel(message),changed:keyLabel,state});keyLabel(ptt.key);
  function setPage(name){
    if(!['orders','tasks','traffic','settings'].includes(name))name='orders';page=name;
    for(const tab of /** @type {NodeListOf<HTMLButtonElement>} */ (el.querySelectorAll('[data-tab]'))){const selected=tab.dataset.tab===page;tab.setAttribute('aria-selected',String(selected));tab.tabIndex=selected?0:-1;}
    for(const p of /** @type {NodeListOf<HTMLElement>} */ (el.querySelectorAll('[data-page]')))p.hidden=p.dataset.page!==page;
    $('.radio-pages').scrollTop=0;refresh();
  }
  function open(name){if(!allowed())return;lastFocus=document.activeElement;onOpen?.();if(document.pointerLockElement)document.exitPointerLock();panel.hidden=false;$('[data-toggle]').setAttribute('aria-expanded','true');setPage(name||page);}
  function close(){ptt.cancel();panel.hidden=true;$('[data-toggle]').setAttribute('aria-expanded','false');if(document.activeElement instanceof HTMLElement&&el.contains(document.activeElement))document.activeElement.blur();if(lastFocus?.isConnected&&!el.contains(lastFocus))lastFocus.focus?.({preventScroll:true});}
  $('[data-toggle]').onclick=()=>panel.hidden?open():close();$('[data-close]').onclick=close;
  for(const tab of /** @type {NodeListOf<HTMLButtonElement>} */ (el.querySelectorAll('[data-tab]')))tab.onclick=()=>setPage(tab.dataset.tab);
  $('.radio-tabs').addEventListener('keydown',e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.code))return;const tabs=[.../** @type {NodeListOf<HTMLButtonElement>} */ (el.querySelectorAll('[data-tab]'))],at=tabs.findIndex(tab=>tab===document.activeElement);if(at<0)return;e.preventDefault();const n=e.code==='Home'?0:e.code==='End'?tabs.length-1:(at+(e.code==='ArrowRight'?1:tabs.length-1))%tabs.length;setPage(tabs[n].dataset.tab);tabs[n].focus();});
  $('[data-board]').onclick=()=>{close();openBoard?.();};
  $('[data-mic]').onclick=()=>{ptt.cancel();rec.prepare();};
  $('[data-bind-key]').onclick=()=>ptt.bind();$('[data-reset-key]').onclick=()=>ptt.reset();
  $('[data-bind-pad]').disabled=!controls;$('[data-bind-pad]').onclick=()=>{ptt.cancel();controls.open();controls.bindButton('ptt');};
  const volume=$('[data-volume-control]'),volumeLabel=$('[data-volume]');
  const volumeLabelUpdate=()=>{volume.value=voices.vol;volumeLabel.textContent=voices.vol+'/10';};volumeLabelUpdate();
  volume.oninput=()=>{voices.vol=+volume.value;volumeLabelUpdate();};
  $('[data-cancel]').onclick=()=>ptt.cancel();
  talk.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();talk.setPointerCapture?.(e.pointerId);ptt.set('pointer',true);};
  talk.onpointerup=()=>ptt.set('pointer',false);talk.onpointercancel=()=>ptt.cancel();
  talk.onkeydown=e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();if(!e.repeat)ptt.set('button',true);}};
  talk.onkeyup=e=>{if(['Space','Enter'].includes(e.code)){e.preventDefault();ptt.set('button',false);}};
  $('form').onsubmit=e=>{e.preventDefault();sendText(e.target.elements.call.value);};
  $('[data-send]').onclick=()=>{const t=net.targets().find(t=>t.id===station.value);if(t&&chosen)sendText(callText(t.call,chosen.body));};
  for(const kind of ['pointerdown','mousedown','click','wheel'])el.addEventListener(kind,e=>e.stopPropagation());
  for(const kind of ['keydown','keyup'])el.addEventListener(kind,e=>{if(kind==='keydown'&&e instanceof KeyboardEvent&&e.code==='Escape'){e.preventDefault();close();}e.stopPropagation();});
  addEventListener('keydown',e=>{if(ptt.keyDown(e)){e.preventDefault();e.stopImmediatePropagation();}},true);
  addEventListener('keyup',e=>{if(ptt.keyUp(e)){e.preventDefault();e.stopImmediatePropagation();}},true);
  addEventListener('blur',()=>ptt.cancel());document.addEventListener('visibilitychange',()=>{if(document.hidden)ptt.cancel();});
  for(const [id,label] of Object.entries(CHANNELS)){const option=document.createElement('option');option.value=id;option.textContent=label;channel.append(option);}
  channel.onchange=()=>{rosterSignature='';refresh();};station.onchange=()=>{ordersSignature='';refresh();};order.onchange=()=>{paintDestinations();paintCall();};destination.onchange=paintCall;
  function replaceOptions(select,items,value){select.replaceChildren();for(const item of items){const o=document.createElement('option');o.value=item.value;o.textContent=item.label;select.append(o);}if(items.some(i=>i.value===value))select.value=value;select.disabled=!items.length;}
  function optionsFor(t){
    if(!t)return [];if(net.options)return net.options(t.id);
    return t.actions.flatMap(a=>['move','defend','proceed'].includes(a)?places.map(p=>({action:a,label:title(ORDER_TEXT[a]),body:ORDER_TEXT[a]+' '+p.name,destination:p.name})):[{action:a,label:title(ORDER_TEXT[a]||a),body:ORDER_TEXT[a]||a}]);
  }
  function paintDestinations(){
    const g=groups.find(g=>g.id===order.value);const choices=g?.options||[],old=destination.value;
    replaceOptions(destination,choices.map((o,i)=>({value:String(i),label:typeof o.destination==='string'?o.destination:o.destination?.name||o.place?.name||o.label||o.body})),old);
    $('[data-destination-label]').hidden=!choices.some(o=>o.destination||o.place)||choices.length<2;
  }
  function paintCall(){
    const t=net.targets().find(t=>t.id===station.value),g=groups.find(g=>g.id===order.value);chosen=g?.options[Number(destination.value)||0]||null;
    $('[data-preview]').textContent=t&&chosen?callText(t.call,chosen.body):'No station available in this group.';
    $('[data-send]').disabled=!t||!chosen;
    const cost=chosen?.cost,fuel=chosen?.fuelCost;const resources=[cost!==undefined&&cost!==null?`${Number(cost).toLocaleString('en-US',{maximumFractionDigits:1})} materiel`:'',fuel>0?`${fuel} fuel`:''].filter(Boolean).join(' + ');
    $('[data-order-note]').textContent=chosen?(resources?resources+'. ':'')+(chosen.requiresReadback?'The station will read this back before you confirm it.':''):'';
    $('[data-station-note]').textContent=t?[t.call,t.label,CHANNELS[t.channel]].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · '):'Choose another station group.';
  }
  function paintPending(items){
    const wrap=$('[data-pending]');wrap.replaceChildren();
    for(const p of items){const box=document.createElement('div');box.className='radio-pending';const h=document.createElement('h4');h.textContent=p.call+' · readback awaiting confirmation';const text=document.createElement('p');text.textContent=p.body;const note=document.createElement('small');note.textContent='Check the station, task and destination. Correct accepts this order; Disregard withdraws it.';const buttons=document.createElement('div');buttons.className='radio-buttons';
      for(const [label,body,attr] of [['Readback correct','correct','correct'],['Say again','say again','again'],['Disregard','disregard','disregard']]){const b=document.createElement('button');b.type='button';b.textContent=label;b.dataset[attr]=p.station;b.onclick=()=>sendText(callText(p.call,body));buttons.append(b);}
      box.append(h,text,note,buttons);wrap.append(box);}
  }
  function paintTasks(items){
    const list=$('[data-tasks]');list.replaceChildren();const active=items.filter(t=>['awaiting','active'].includes(t.state)).length;$('[data-task-count]').textContent=active?`(${active})`:'';
    if(!items.length){const li=document.createElement('li');li.className='radio-empty';li.textContent='No radio missions yet. Give a station an order to begin a mission record.';list.append(li);return;}
    for(const t of [...items].reverse()){const li=document.createElement('li');li.className='radio-entry';li.dataset.state=t.state;const head=document.createElement('div');head.className='radio-entry-head';const name=document.createElement('strong');name.textContent=t.call||t.station;const badge=document.createElement('span');badge.className='radio-state';badge.textContent=STATES[t.state]||t.state;head.append(name,badge);const label=document.createElement('p');label.textContent=t.label;const detail=document.createElement('small');detail.textContent=t.detail||'';li.append(head,label,detail);list.append(li);}
  }
  function paintTraffic(items){
    const list=$('[data-traffic]');list.replaceChildren();if(!items.length){const li=document.createElement('li');li.className='radio-empty';li.textContent='The command net is quiet. Try a radio check to establish contact.';list.append(li);return;}
    for(const t of [...items].reverse()){const li=document.createElement('li');li.className='radio-entry';li.dataset.state=t.ok===false?'failed':'';const head=document.createElement('div');head.className='radio-entry-head';const name=document.createElement('strong');name.textContent=(t.direction==='tx'?'TX · Command':'RX · '+(t.call||'Radio'))+(t.ok===false?' · rejected':'');const time=document.createElement('time');time.textContent=clock(t.time);head.append(name,time);const text=document.createElement('p');text.textContent=t.text;li.append(head,text);list.append(li);}
  }
  function refresh(){
    const targets=net.targets(),visible=targets.filter(t=>channel.value==='all'||t.channel===channel.value);const signature=visible.map(t=>t.id+':'+t.call+':'+t.label).join('|');
    if(signature!==rosterSignature||!station.options.length){const previous=station.value;rosterSignature=signature;replaceOptions(station,visible.map(t=>({value:t.id,label:t.call})),previous);ordersSignature='';}
    const t=targets.find(t=>t.id===station.value),options=optionsFor(t),sig=JSON.stringify(options.map(o=>[o.action,o.body,o.label,o.destination?.name||o.destination,o.cost,o.fuelCost,o.requiresReadback]));
    if(sig!==ordersSignature){ordersSignature=sig;const previous=order.value;groups=[];for(const o of options){const id=o.group||o.action+':'+(o.label||o.action);let g=groups.find(g=>g.id===id);if(!g){g={id,label:o.label||title(ORDER_TEXT[o.action]||o.action),options:[]};groups.push(g);}g.options.push(o);}replaceOptions(order,groups.map(g=>({value:g.id,label:g.label})),previous);paintDestinations();}
    paintCall();const pending=net.pending?.()||[],ps=JSON.stringify(pending);if(ps!==pendingSignature){pendingSignature=ps;paintPending(pending);}
    const tasks=net.tasks||[],ts=JSON.stringify(tasks.map(t=>[t.id,t.station,t.call,t.label,t.state,t.detail]));if(ts!==taskSignature){taskSignature=ts;paintTasks(tasks);}
    const traffic=net.traffic||[],tr=JSON.stringify(traffic);if(tr!==trafficSignature){trafficSignature=tr;paintTraffic(traffic);}
    if(page==='settings'){volumeLabelUpdate();const info=voices.speechInfo?.();$('[data-voice-backend]').textContent=info?`Crew speech: ${info.backend}${(info.voices?.length||info.count)?' · '+(info.voices?.length||info.count)+' installed voices':''}.`:'Generated crew speech through the radio audio chain.';}
  }
  function compose(stationId,action,dest){
    const t=net.targets().find(t=>t.id===stationId);open('orders');
    if(!t){state('Station unavailable. Choose a station on the live roster.');return false;}
    channel.value=CHANNELS[t.channel]?t.channel:'all';rosterSignature='';refresh();station.value=t.id;ordersSignature='';refresh();
    if(!action)return true;
    const wanted=typeof dest==='string'?dest:dest?.name;
    const match=groups.flatMap(g=>g.options.map((o,i)=>({g,o,i}))).find(({o})=>o.action===action&&(!wanted||String(o.destination?.name||o.destination||o.place?.name||'').toLowerCase()===wanted.toLowerCase()));
    if(!match){state('That order is unavailable for this station or destination.');return false;}
    order.value=match.g.id;paintDestinations();destination.value=String(match.i);paintCall();return true;
  }
  let refreshT=0;
  return {net,rec,ptt,element:el,get isOpen(){return !panel.hidden;},open,close,compose,toggle(){panel.hidden?open():close();},submit,
    update(dt){el.hidden=!allowed();if(!canTalk())ptt.cancel();if(controls)ptt.pad({down:!!controls.state.actions.ptt,pressed:!!controls.state.pressed.ptt,connected:controls.hasButton('ptt'),enabled:canTalk()});
      voices.transmitting=rec.active;el.dataset.speaking=String(rec.active);talk.setAttribute('aria-pressed',String(rec.active));
      if(!panel.hidden&&(refreshT-=dt)<=0){refreshT=.5;refresh();}}};
}
