import {selectCommand,ordersFor,radioWords} from './commands.js';
import {fieldStations} from './fieldstations.js';

// Command net state lives outside the desk: voice, keyboard and assisted calls share the same transactions.
// READ BACK is a game confirmation workflow, not a claim to reproduce every service's complete radio doctrine.
export function createCommandNet({war,roster,islands,allowed,heliHome,voices,feed=(_text,_kind)=>{},operations,playerPosition,standDown,now=()=>performance.now()/1000}) {
  let ids=new WeakMap(),counts={},serial=0,tick=0;
  const replies=new Map(),waiting=new Map();
  const N={last:null,traffic:[],tasks:[],marks:[]};
  const identity=(obj,kind='unit')=>{if(!ids.has(obj))ids.set(obj,(counts[kind]=(counts[kind]||0)+1));return ids.get(obj);};
  const places=()=>[...islands,...N.marks];
  const log=(station,direction,text,ok=true,kind='message')=>{
    N.traffic.push({id:++serial,time:now(),station:station?.id||'',call:station?.call||'Command',direction,text,ok,kind});
    if(N.traffic.length>100)N.traffic.shift();
  };
  function reply(t,body,ok=true,kind='reply') {
    const text=`Command, this is ${t.call}. ${body}`;
    replies.set(t.id,body);log(t,'rx',text,ok,kind);feed(text,'voice');
    voices.speak({who:t.who,role:t.role,text,net:t.net,pri:2,cd:0,key:'reply:'+t.id,sub:false,src:'radio-command',maxAge:20});
    return text;
  }
  N.targets=()=>{
    const out=[],c=war.carrier;
    if(c&&c.sinking===undefined)out.push({id:'carrier',call:'Albatross',identity:c,who:'conn',role:'command',net:'uhf',channel:'command',label:'Carrier bridge',actions:['check','status','again'],
      status:()=>c.path?.length||Math.abs(c.speed||0)>.5?'Under way.':'Standing by.',orders:places().map(place=>({action:'proceed',body:'Proceed to '+place.name,label:'Proceed to',destination:place.name,place,requiresReadback:true,
        execute:()=>{
          const p=place.pad||place;
          if(!war.orderCarrier(p.x,p.z))return {ok:false,reason:'Unable to get under way.'};
          const goal=c.goal;
          return {ok:true,detail:'Under way toward '+place.name+'.',watch:()=>{
            if(war.carrier!==c||c.sinking!==undefined)return {state:'failed',detail:'Carrier lost.'};
            if(c.goal!==goal)return {state:'cancelled',detail:'Course superseded.'};
            // war.js consumes the route but retains its goal when the ship arrives.
            if(!c.path?.length&&Math.abs(c.speed||0)<=.5){
              if(goal&&Math.hypot(c.p.x-goal[0],c.p.z-goal[1])<65)return {state:'complete',detail:'Arrived near '+place.name+'.'};
              return {state:'failed',detail:'No navigable route to '+place.name+'.'};
            }
            return {state:'active',detail:'Under way toward '+place.name+'.'};
          }};
        }}))});
    out.push(...(operations?.targets()||[]),...fieldStations({war,roster,heliHome,identity,places:places(),playerPosition,standDown}));
    for(const t of out) {
      t.actions=[...new Set([...(t.actions||[]),'check','status','again',...(waiting.has(t.id)?['correct','disregard']:[])])];
    }
    return out;
  };
  N.options=id=>{const t=N.targets().find(t=>t.id===id);return t?ordersFor(t,places()):[];};
  N.pending=()=>[...waiting.values()].map(w=>({station:w.target.id,call:w.target.call,body:w.order.body,expires:w.expires}));
  N.mark=(x,z,island=null)=>{
    if(!Number.isFinite(x)||!Number.isFinite(z)||Math.abs(x)>1400||Math.abs(z)>1400)return null;
    const number=counts.mark=(counts.mark||0)+1, names=['Alpha','Bravo','Charlie','Delta','Echo','Foxtrot','Golf','Hotel'];
    const p={name:'Point '+names[(number-1)%names.length]+(number>8?' '+Math.ceil(number/8):''),x,z,island};
    N.marks.push(p);if(N.marks.length>8)N.marks.shift();return p;
  };
  function task(t,o,key) {
    // Retain active tasks, discard only old closed entries; cap active work to avoid unbounded watchers.
    while(N.tasks.length>=40){const i=N.tasks.findIndex(x=>!['awaiting','active'].includes(x.state));if(i<0)break;N.tasks.splice(i,1);}
    const item={id:++serial,station:t.id,call:t.call,label:o.body,state:'awaiting',detail:'Awaiting readback confirmation.',created:now(),updated:now(),key};
    N.tasks.push(item);return item;
  }
  const signature=o=>JSON.stringify([o.body,o.cost??null,o.fuelCost??null,o.place?.name,o.place?.x,o.place?.z,o.place?.pad?.x,o.place?.pad?.z]);
  const close=(item,state,detail)=>{item.state=state;item.detail=detail;item.updated=now();delete item._watch;};
  const openTasks=()=>N.tasks.filter(x=>['active','awaiting'].includes(x.state));
  const superseded=(t,o)=>o.taskGroup?N.tasks.filter(x=>x.station===t.id&&x.state==='active'&&x._group===o.taskGroup):[];
  function expire() {
    for(const [id,w] of waiting)if(now()>=w.expires){waiting.delete(id);close(w.task,'cancelled','Readback expired. Send the request again.');log(w.target,'rx','Readback expired; no order sent.',false,'expired');}
  }
  function execute(p,item) {
    const t=p.target,o=p.order;
    let result;
    try {
      const why=o.validate?.();
      if(why)result={ok:false,reason:why};
      else if(o.execute)result=o.execute();
      else {const why=t.order?.(p.action,p.place)||'';result={ok:!why,reason:why};}
    }catch(_){result={ok:false,reason:'Unit cannot carry out that order.'};}
    if(typeof result==='string')result={ok:!result,reason:result};
    result||={ok:false,reason:'No order response from station.'};
    if(result.ok===false){if(item)close(item,'failed',result.reason);return {ok:false,reason:reply(t,'Unable. '+(result.reason||'Order unavailable.')+' Out.',false)};}
    for(const previous of superseded(t,o))if(previous!==item)close(previous,'cancelled','Superseded by '+o.body+'.');
    if(!item&&!result.report)item=task(t,o,p.key);
    if(item){item.state=result.watch?'active':'complete';item.detail=result.detail||'Order acknowledged.';item.updated=now();item._watch=result.watch;item._target=t;item._group=o.taskGroup;}
    const body=(result.detail?result.detail+' ':'')+(result.report?'Out.':'Wilco. Out.');
    return {ok:true,reason:reply(t,body),task:item?.id};
  }
  N.receive=alternatives=>{
    if(!allowed())return N.last={ok:false,reason:'Command net is available during surface play.'};
    expire();
    const p=selectCommand(alternatives,N.targets(),places());
    log(p.target,'tx',String(alternatives?.[0]?.transcript||'').slice(0,300),p.ok,p.ok?'call':'rejected');
    if(!p.ok)return N.last=p;
    const t=p.target,o=p.order;
    const result=r=>N.last={...r,action:p.action,target:t.id,transcript:alternatives[0].transcript};
    if(p.action==='again')return result({ok:true,reason:reply(t,replies.get(t.id)||'Nothing to repeat. Out.')});
    if(p.action==='check')return result({ok:true,reason:reply(t,'Roger. Out.')});
    if(p.action==='status')return result({ok:true,reason:reply(t,(t.status?.()||'Standing by.')+' Out.')});
    if(p.action==='disregard'){
      const w=waiting.get(t.id);if(!w)return result({ok:false,reason:'No request awaiting readback.'});
      waiting.delete(t.id);close(w.task,'cancelled','Request disregarded before execution.');
      return result({ok:true,reason:reply(t,'Roger. Request disregarded. Out.')});
    }
    if(p.action==='correct'){
      const w=waiting.get(t.id);if(!w)return result({ok:false,reason:'No request awaiting readback.'});
      waiting.delete(t.id);
      const current=ordersFor(t,places()).find(x=>radioWords(x.body)===radioWords(w.order.body));
      if(!current||w.target.identity!==t.identity||signature(current)!==w.signature){
        close(w.task,'cancelled','Unit, destination or cost changed. Send the request again.');
        return result({ok:false,reason:reply(t,'Unable. Situation changed. Send the request again. Out.',false)});
      }
      return result(execute({...p,order:current,action:current.action,place:current.place,key:w.key},w.task));
    }
    if(N.tasks.some(x=>x.key===p.key&&x.state==='active'))return result({ok:false,reason:reply(t,'Request already in progress. Report status for an update. Out.',false)});
    if(o.requiresReadback){
      const existing=waiting.get(t.id);
      if(existing&&existing.key!==p.key)return result({ok:false,reason:'This station has a readback pending. Send CORRECT or DISREGARD first.'});
      const why=o.validate?.();if(why)return result({ok:false,reason:reply(t,'Unable. '+why+' Out.',false)});
      if(!existing&&openTasks().length>=12)return result({ok:false,reason:'Command desk has twelve open tasks. Wait for a task to finish.'});
      const item=existing?.task||task(t,o,p.key);
      const w={target:t,order:o,key:p.key,signature:signature(o),task:item,expires:now()+45};waiting.set(t.id,w);
      const cost=o.cost!==undefined?` ${Math.round(o.cost*10)/10} materiel${o.fuelCost?', '+o.fuelCost+' fuel':''}.`:'';
      return result({ok:true,pending:true,reason:reply(t,`I read back. ${o.body}.${cost} Confirm. Over.`),task:item.id});
    }
    // Immediate movements and recalls also hold live watchers. Replacing a movement reuses its slot;
    // hold/cease-fire and report-only messages remain available when the desk is full.
    if(o.tracksTask!==false&&!['hold','ceasefire'].includes(p.action)&&openTasks().length-superseded(t,o).length>=12)
      return result({ok:false,reason:'Command desk has twelve open tasks. Wait for a task to finish.'});
    return result(execute(p));
  };
  N.update=dt=>{
    if(!allowed()){
      for(const w of waiting.values())close(w.task,'cancelled','Unconfirmed request cancelled when command net closed.');waiting.clear();return;
    }
    expire();if((tick-=dt)>0)return;tick=1;
    for(const item of N.tasks)if(item.state==='active'&&item._watch){
      let s;try{s=item._watch();}catch(_){s={state:'failed',detail:'Station unable to report task progress.'};}
      if(!s)continue;item.detail=s.detail||item.detail;item.updated=now();
      if(s.state&&s.state!=='active'){
        const target=item._target;close(item,s.state,item.detail);
        if(target)reply(target,item.detail+' Out.',s.state==='complete','task');
      }
    }
  };
  N.reset=()=>{waiting.clear();replies.clear();ids=new WeakMap();counts={};N.traffic.length=N.tasks.length=N.marks.length=0;N.last=null;tick=0;};
  return N;
}
