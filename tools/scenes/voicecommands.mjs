// Real game bridge + native recognition lifecycle driven by a fake microphone provider. No external STT calls.
export default async function(h){
  await h.goto('?debug&auto&kb&res=0.45');
  await h.waitFor('window.__radioCommands && __G.G.state === "play"',20000);
  await h.eval(`(() => { const i=__G.ISLANDS.find(i=>i.name==='SANDBAR'); window.__radioSquad=__G.war.ground.addSquad(1,i,4,i.pad.x,i.pad.z,{order:{type:'defend',x:i.pad.x,z:i.pad.z,r:20}}).squads[0]; __G.G.bench=true; __radioCommands.open(); return true; })()`);
  await h.expect('__radioCommands.net.targets().some(t=>t.call==="Hotel one")','live friendly squad has an addressed radio callsign');
  await h.eval(`(() => {const f=document.querySelector('#radioCommand form');f.elements.call.value='Hotel one, hold position.';f.requestSubmit();return true;})()`);
  await h.expect('__radioSquad.order.type!=="hold" && !__radioCommands.net.last.ok','incomplete typed procedure is rejected without issuing an order');
  await h.eval(`(async()=>{const {createRecognition}=await import('./js/voice/recognition.js');class Fake {constructor(){window.__fakeMic=this;}start(){}stop(){this.onend();}abort(){}}
    window.__ptt=createRecognition({Recognition:Fake,allowed:()=>__G.G.state==='play',submit:a=>__radioCommands.submit(a)});__ptt.start();const result=[{transcript:'Hotel one, this is Command. Hold position. Over.',confidence:.99}];result.isFinal=true;__fakeMic.onresult({results:[result]});return true;})()`);
  await h.expect('__radioSquad.order.type!=="hold"','microphone final text waits for push-to-talk release');
  await h.eval('(__ptt.release(),true)');
  await h.expect('__radioSquad.order.type==="hold" && __radioCommands.net.last.ok','released valid microphone command sets the real squad hold order');
  await h.expect('__voices.log.some(e=>e.who.startsWith("m") && /Wilco\. Out\./.test(e.text))','the addressed unit acknowledges with its own voice identity');
  await h.eval(`(() => {const f=document.querySelector('#radioCommand form');f.elements.call.value='Hotel one, this is Command. Defend Sandbar. Over.';f.requestSubmit();return true;})()`);
  await h.expect('__radioSquad.order.type==="defend" && __radioCommands.net.last.ok','complete typed radio call uses the same parser and order path');
  await h.shot('radio-panel');
  await h.eval('(__G.openMenu(),true)');
  await h.eval(`__radioCommands.submit([{transcript:'Hotel one this is Command hold position over',confidence:1}]).ok`);
  await h.expect('__radioSquad.order.type==="defend" && !__radioCommands.net.last.ok','pause blocks late commands');
  await h.expect('!__radioCommands.rec.active','no microphone was opened by tests or page load');
}
