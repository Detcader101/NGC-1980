import {radioNumber} from './commands.js';
const center = live => ({x:live.reduce((n,m)=>n+m.x,0)/live.length,z:live.reduce((n,m)=>n+m.z,0)/live.length});
const alive = s => s.members.filter(m=>m.alive&&m.able&&!m.evac);
const directions=['north','northeast','east','southeast','south','southwest','west','northwest'];
const bearing=(dx,dz)=>directions[Math.round((Math.atan2(dx,-dz)+Math.PI*2)/(Math.PI/4))%8];
const order=(action,body,execute,extra={})=>({action,body,label:body,execute,tracksTask:false,...extra});
// Ground reports use the squad's perception memory, never the enemy world roster.
export function contactReport(s) {
  const live=alive(s), c=center(live), known=new Map(s.know||[]);
  for(const m of live)for(const [id,k] of m.ai?.own||[])if(!known.has(id)||known.get(id).t<k.t)known.set(id,k);
  const contacts=[...known.values()].filter(k=>k.conf>.25).sort((a,b)=>b.t-a.t);
  if(!contacts.length)return 'No contacts reported.';
  const k=contacts[0], distance=Math.round(Math.hypot(k.x-c.x,k.z-c.z)/25)*25;
  const what=k.heard?'Gunfire heard':({strider:'Machine infantry',hovertank:'Armored vehicle',mbt:'Tank',air:'Aircraft',inf:'Infantry'}[k.kind]||'Contact');
  return `${what}, ${bearing(k.x-c.x,k.z-c.z)}, approximately ${distance} meters. ${k.seen?'Visual contact.':'Last reported position; not in sight.'}`;
}
export function fieldStations({war,roster,heliHome,identity,places,playerPosition,standDown}) {
  const out=[];
  for(const [id,call] of [['heli','Huey one'],['jet','Falcon one one'],['tomcat','Bullet two one'],['ch46','Knight one'],['m60','Tango one'],['m113','Mike one']]) {
    const r=roster.find(r=>r.id===id);if(!r?.out())continue;
    const orders=[];
    if(!r.active()&&(r.recall||id==='heli'))orders.push(order('rtb','Return to base',()=>{
      const result=id==='heli'?heliHome():r.recall();
      if(result&&typeof result==='object')return result; // Huey host supplies its actual flight/landing watcher.
      if(result)return {ok:false,reason:result};
      return {ok:true,detail:'Returning to base.',...(id==='heli'?{}:{watch:()=>{
        if(!r.out())return {state:'failed',detail:'Aircraft lost before recovery.'};
        if(r.active())return {state:'cancelled',detail:'Recovery order ended; Command has the aircraft.'};
        if(r.canStandDown?.())return {state:'complete',detail:'Aircraft recovered and parked on deck.'};
        return {state:'active',detail:'Returning to base. '+r.status()};
      }})};
    },{tracksTask:true,taskGroup:'recovery'}));
    if(standDown&&r.standDown&&!r.active())orders.push(order('standdown','Stand down',()=>{
      const why=standDown(r);return why?{ok:false,reason:why}:{ok:true,detail:'Stood down at base. Returned to reserve.'};
    },{validate:()=>r.canStandDown?.()?'':'Unit must be parked at a friendly base.'}));
    out.push({id,call,identity:r,who:id==='heli'?'pilot':id+'-crew',role:id==='m60'||id==='m113'?'crew':'jet',net:'uhf',
      channel:['m60','m113'].includes(id)?'ground':'air',label:r.label||call,actions:['check','status','again'],orders,status:r.status});
  }
  const flights=[...new Set([...(war.units||[]),...(war.air?.pending||[])])];
  for(const u of flights) {
    if(u.side!==1||u.type!=='escort'||u.dead||u.dying||u.stowed||!u.ai)continue;
    const id='flight:'+identity(u), call=(u.name||'Victory '+identity(u)).replace(/\d+/g,radioNumber);
    const canTask=()=>['climb','cap','patrol','fight'].includes(u.ai.state)?'':'Aircraft is launching or recovering; unable to accept new tasking.';
    out.push({id,call,identity:u,who:u.name||id,role:'wing',net:'uhf',channel:'air',label:'F-14A patrol',actions:['check','status','again'],
      status:()=>`${u.ai.state==='cap'?'On patrol':u.ai.state}. Fuel ${Math.round((u.sim?.fuel||0)*2.205/100)*100} pounds. ${u.cap?'Assigned '+u.cap.name+'.':'Assigned carrier patrol.'}`,
      orders:[order('rtb','Return to base',()=>{u.ai.set('rtb','RECALLED');return {ok:true,detail:'Returning to mother.',watch:()=>u.stowed?{state:'complete',detail:'Aircraft recovered aboard.'}:u.dead||u.dying?{state:'failed',detail:'Aircraft lost.'}:{state:'active',detail:'Recovery: '+u.ai.state}};},{validate:canTask,tracksTask:true,taskGroup:'recovery'}),
        ...places.filter(p=>p.pad).map(place=>order('patrol','Patrol over '+place.name,()=>{u.cap=place;return {ok:true,detail:'Patrol assigned over '+place.name+'.'};},
          {label:'Patrol over',destination:place.name,place,validate:canTask}))]});
  }
  const gs=war.ground?.sim, squads=new Set((gs?.units||[]).filter(u=>u.side===1&&u.kind==='marine'&&u.alive&&u.able&&u.squad?.marines).map(u=>u.squad));
  for(const s of squads) {
    const live=alive(s);if(!live.length)continue;
    const number=identity(s,'squad'),island=s.B.I, call='Hotel '+radioNumber(number);
    const movement=(action,body,place)=>order(action,body,()=>{
      const members=alive(s);if(!members.length)return {ok:false,reason:'Squad no longer operational.'};
      const p=place||center(members), target=p.pad||p;
      if((p.island||p)!==island&&place)return {ok:false,reason:'Ground squad needs transport to another island.'};
      if(!Number.isFinite(target.x)||!Number.isFinite(target.z))return {ok:false,reason:'No reachable destination.'};
      const command={type:action==='hold'?'hold':action==='defend'?'defend':'take',x:target.x,z:target.z,r:action==='hold'?8:20};
      gs.order(s,command);
      return {ok:true,detail:action==='hold'?'Holding position.':`${action==='defend'?'Defending':'Moving to'} ${p.name||'Command position'}.`,
        ...(action==='hold'?{}:{watch:()=>{
          const ms=alive(s);if(!ms.length)return {state:'failed',detail:'Squad no longer operational.'};
          if(s.order!==command)return {state:'cancelled',detail:'Movement superseded by another order.'};
          const arrived=ms.every(m=>Math.hypot(m.x-target.x,m.z-target.z)<35);
          return {state:arrived?'complete':'active',detail:arrived?'Squad on station at '+(p.name||'Command position')+'.':'Moving; '+ms.length+' effective. '+contactReport(s)};
        }})};
    },{label:action==='defend'?'Defend':action==='hold'?'Hold position':'Move to',destination:place?.name,place,tracksTask:action!=='hold',taskGroup:'movement'});
    const orders=[movement('hold','Hold position'),
      order('contacts','Report contacts',()=>({ok:true,detail:contactReport(s),report:true})),
      order('casualties','Report casualties',()=>({ok:true,report:true,detail:`${s.members.filter(m=>m.alive&&!m.able&&!m.evac).length} wounded unable to fight. ${s.members.filter(m=>!m.alive&&!m.evac).length} killed. ${s.members.filter(m=>m.evac).length} evacuated.`})),
      ...['wedge','column','line'].map(formation=>order('formation:'+formation,'Formation '+formation,()=>{s.formation=formation;return {ok:true,detail:formation+' formation.'};})),
      order('ceasefire','Cease fire',()=>{s.firePolicy='hold';for(const m of alive(s))if(m.ai){m.ai.fire=null;m.ai.law=false;m.ai.frag=false;}return {ok:true,detail:'Holding fire.'};}),
      order('resume','Resume fire',()=>{s.firePolicy='free';return {ok:true,detail:'Fire control returned to squad leader.'};}),
    ];
    for(const p of places)for(const a of ['move','defend'])orders.push(movement(a,(a==='move'?'Move to ':'Defend ')+p.name,p));
    if(playerPosition)orders.push(order('rally','Rally on me',()=>{
      const p=playerPosition();if(!p||p.island!==island)return {ok:false,reason:'Command must be on the squad’s island. Transport is required across water.'};
      return movement('move','Rally on me',{...p,name:'Command position'}).execute();
    },{tracksTask:true,taskGroup:'movement'}));
    out.push({id:'squad:'+number,call,identity:s,who:'m'+(live.find(m=>m.role==='sl')||live[0]).id,role:'sl',net:'fm',channel:'ground',label:'Marine squad · '+island.name,
      actions:['check','status','again'],orders,status:()=>`${alive(s).length} Marines effective at ${island.name}. ${s.state==='defend'?'Holding position.':'In the field.'} ${s.firePolicy==='hold'?'Holding fire.':''}`});
  }
  return out;
}
