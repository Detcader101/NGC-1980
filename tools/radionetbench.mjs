import assert from 'node:assert/strict';
import {createMarineAI} from '../game/js/units/groundwar/marineai.js';
import {createCommandNet} from '../game/js/voice/commandnet.js';
import {commandPhrases} from '../game/js/voice/localrecognition.js';
import {contactReport} from '../game/js/voice/fieldstations.js';
let n=0;const check=(x,name)=>{assert.ok(x,name);console.log('PASS '+name);n++;};
let time=0,allow=true,mat=100,price=30,who={},progress='active',sent=0,alive=true,gate='';
const island={name:'SANDBAR',x:0,z:0,pad:{x:25,z:30}}, other={name:'CINDER',pad:{x:600,z:0}};
const unit={id:7,kind:'marine',side:1,alive:true,able:true,role:'sl',x:0,z:0,ai:{own:new Map()}};
const squad={marines:true,B:{I:island},members:[unit],state:'move',know:new Map()};unit.squad=squad;
const station=()=>({id:'transport',call:'Transport',identity:who,who:'rto',net:'uhf',role:'command',status:()=>progress,orders:[{action:'lift',body:'Request troop lift to Sandbar',cost:price,place:island,requiresReadback:true,
  validate:()=>gate||(mat<price?'Insufficient materiel.':''),execute:()=>{mat-=price;sent++;return {ok:true,detail:'Lift dispatched.',watch:()=>({state:progress,detail:progress==='active'?'En route.':'Marines ashore.'})};}}]});
const war={ground:{sim:{units:[unit],order(s,o){s.order=o;}}}};
const net=createCommandNet({war,roster:[],islands:[island,other],allowed:()=>allow,voices:{speak(){}},now:()=>time,
  playerPosition:()=>({x:5,z:5,island}),operations:{targets:()=>alive?[station()]:[]}});
const send=(body,call='Transport',end='Over')=>net.receive([{transcript:`${call}, this is Command. ${body}. ${end}.`,confidence:1}]);
check(send('Request troop lift to Sandbar').pending&&mat===100&&sent===0,'request reads back without spending or launching');
check(net.pending().length===1&&net.tasks[0].state==='awaiting','readback appears in mission ledger');
send('Request troop lift to Sandbar');check(net.pending().length===1&&net.tasks.length===1,'duplicate request repeats same readback without multiplying tasks');
send('Say again');check(mat===100&&sent===0,'say again never executes a pending order');
check(commandPhrases(net.targets(),[island]).includes('Transport, this is Command. Disregard. Out.'),'recognizer grammar includes exact pending cancellation procedure');
check(!send('Correct','Hotel one').ok&&sent===0,'another station cannot confirm this request');
check(!send('Correct','Transport','Out').ok&&sent===0,'wrong ending cannot confirm');
check(send('Correct').ok&&sent===1&&mat===70,'correct readback executes exactly once');
check(!send('Correct').ok&&sent===1,'repeated confirmation cannot spend twice');
check(!send('Request troop lift to Sandbar').ok&&sent===1,'active duplicate task is rejected');
net.update(1);check(net.tasks[0].state==='active'&&net.tasks[0].detail==='En route.','mission follows actual controller progress');
progress='complete';net.update(1);check(net.tasks[0].state==='complete'&&net.traffic.at(-1).kind==='task','actual completion generates station report');
send('Request troop lift to Sandbar');send('Disregard','Transport','Out');check(net.pending().length===0&&mat===70&&net.tasks.at(-1).state==='cancelled','disregard cancels only an unexecuted request');
send('Request troop lift to Sandbar');price=31;check(!send('Correct').ok&&mat===70&&sent===1,'changed price requires a fresh readback');
send('Request troop lift to Sandbar');who={};check(!send('Correct').ok&&sent===1,'changed unit identity invalidates pending confirmation');
send('Request troop lift to Sandbar');gate='Research required.';check(!send('Correct').ok&&mat===70,'execution revalidates availability');gate='';
send('Request troop lift to Sandbar');time=46;check(!send('Correct').ok&&sent===1,'expired readback cannot execute');
send('Request troop lift to Sandbar');allow=false;net.update(1);allow=true;check(!send('Correct').ok&&sent===1,'pause clears unconfirmed requests');
send('Request troop lift to Sandbar');alive=false;check(!send('Correct').ok&&sent===1,'dead station cannot receive late recognition');alive=true;
check(send('Move to Sandbar','Hotel one').ok&&squad.order.type==='take','move uses the real AI take objective, so arrival is recognized');
check(!send('Move to Cinder','Hotel one').ok&&squad.order.x===25,'ground squad cannot walk between islands');
check(send('Rally on me','Hotel one').ok&&squad.order.x===5,'rally snapshots actual Command position');
check(send('Formation column','Hotel one').ok&&squad.formation==='column','formation message changes squad formation');
check(send('Cease fire','Hotel one').ok&&squad.firePolicy==='hold','cease fire persists on squad');
send('Move to Sandbar','Hotel one');check(squad.firePolicy==='hold','new movement does not silently resume fire');
send('Resume fire','Hotel one');check(squad.firePolicy==='free','explicit resume returns fire decisions to squad leader');
check(contactReport(squad)==='No contacts reported.','contact report has no access to hidden world enemies');
squad.know.set(99,{x:0,z:-70,t:time,conf:.6,seen:false,kind:'strider'});check(/Last reported position; not in sight/.test(contactReport(squad)),'stale perception is reported as last known, never current visual');
const mark=net.mark(15,20,island);check(mark.name==='Point Alpha'&&send('Move to Point Alpha','Hotel one').ok&&squad.order.x===15,'named map point reaches actual ground controller');
check(net.mark(Infinity,0)===null&&net.mark(99999,0)===null,'invalid map coordinates rejected');
net.reset();check(net.pending().length===0&&net.tasks.length===0&&net.traffic.length===0&&net.marks.length===0,'new war clears all orders, traffic and map points');
check(net.targets().find(t=>t.id.startsWith('squad:')).call==='Hotel one','new war resets unit callsigns');
// Exercise the real AI decisions as well as the command adapter.
const world={height:()=>0,isWater:()=>false,los:()=>true,raycast:()=>null,coverPoints:()=>[],coverScore:()=>0};
const ai=createMarineAI(world,{seed:17});
const members=Array.from({length:5},(_,i)=>({id:i+1,role:i?'tl':'sl',x:0,y:0,z:0,yaw:0,alive:true,able:true,laws:0,frags:0,gl:0}));
const S=ai.addSquad({id:'test',members,order:{type:'take',x:0,z:-100}});
S.formation='column';ai.update(.1,[]);const xs=members.map(m=>m.ai.move[0]),zs=members.map(m=>m.ai.move[1]);
check(Math.max(...xs)-Math.min(...xs)<.01&&Math.max(...zs)-Math.min(...zs)>15,'column changes actual AI movement destinations');
S.formation='line';ai.update(.1,[]);check(Math.max(...members.map(m=>m.ai.move[0]))-Math.min(...members.map(m=>m.ai.move[0]))>20,'line changes actual AI lateral spacing');
ai.order('test',{type:'hold',x:0,z:0});
const enemies=[{id:99,side:2,kind:'inf',x:0,y:0,z:-80,alive:true,h:1.8}];
for(let i=0;i<150;i++)ai.update(.1,enemies);check(members.some(m=>m.ai.fire),'squad can engage a perceived contact before cease fire');
S.firePolicy='hold';for(let i=0;i<30;i++){ai.update(.1,enemies);assert.ok(members.every(m=>!m.ai.fire&&!m.ai.frag&&!m.ai.law));}
check(members.every(m=>!m.ai.fire),'cease fire inhibits subsequent AI fire decisions while contact remains');
S.firePolicy='free';for(let i=0;i<20;i++)ai.update(.1,enemies);check(members.some(m=>m.ai.fire),'resume fire restores existing AI engagement decisions');
// A full Marine squad has thirteen members; an uncentered trailing column made its centroid
// move backward even though the five-person spacing check above passed.
const fullAI=createMarineAI(world,{seed:17});
const fullMembers=Array.from({length:13},(_,i)=>({id:i+20,role:i?'tl':'sl',x:0,y:0,z:0,yaw:0,alive:true,able:true,laws:0,frags:0,gl:0}));
const fullSquad=fullAI.addSquad({id:'full',members:fullMembers,order:{type:'take',x:0,z:-100}});
fullSquad.formation='column';fullAI.update(.1,[]);
const meanTargetZ=fullMembers.reduce((sum,m)=>sum+m.ai.move[1],0)/fullMembers.length;
check(meanTargetZ < -10,'thirteen-Marine column advances its centroid toward the objective');
check(Math.max(...fullMembers.map(m=>m.ai.move[1]))-Math.min(...fullMembers.map(m=>m.ai.move[1]))>=60,'full column retains five-meter longitudinal spacing');
// war.js retains .goal after reaching the destination; movement consumes only .path.
const carrier={p:{x:0,z:0},speed:0,path:[],goal:null};
const navalWar={carrier,orderCarrier(x,z){carrier.goal=[x,z];carrier.path=[[x,z]];return true;}};
const navalNet=createCommandNet({war:navalWar,roster:[],islands:[island,other],allowed:()=>true,voices:{speak(){}},now:()=>time});
const helmSend=body=>navalNet.receive([{transcript:`Albatross, this is Command. ${body}. Over.`,confidence:1}]);
helmSend('Proceed to Sandbar');helmSend('Correct');
const course=navalNet.tasks.at(-1),goal=carrier.goal;
carrier.p.x=goal[0];carrier.p.z=goal[1];carrier.path=[];carrier.speed=3;
navalNet.update(1);check(course.state==='active','carrier must finish slowing before reporting arrival');
carrier.speed=0;navalNet.update(1);
check(course.state==='complete'&&carrier.goal===goal,'carrier arrival recognizes empty path while actual controller retains its goal');
check(navalNet.targets()[0].status()==='Standing by.','carrier status reports stopped after route is consumed');
helmSend('Proceed to Cinder');helmSend('Correct');
const superseded=navalNet.tasks.at(-1),oldGoal=carrier.goal;
carrier.p.x=oldGoal[0];carrier.p.z=oldGoal[1];carrier.path=[];carrier.goal=[oldGoal[0]+500,oldGoal[1]];
navalNet.update(1);
check(superseded.state==='cancelled','changed carrier goal cancels old task even when near its old destination');
// Directly addressable fleet aircraft must complete recovery, not merely accept the recall.
let jetOut=true,jetActive=false,jetParked=false,recalls=0,hueyState='active';
const jet={id:'jet',label:'Hornet',out:()=>jetOut,active:()=>jetActive,status:()=>jetParked?'Parked.':'Returning.',canStandDown:()=>jetParked,recall:()=>{recalls++;return '';}};
const heli={id:'heli',out:()=>true,active:()=>false,status:()=>hueyState};
const flightNet=createCommandNet({war:{},roster:[jet,heli],islands:[],allowed:()=>true,voices:{speak(){}},now:()=>time,
  heliHome:()=>({ok:true,detail:'Crew flying home.',watch:()=>({state:hueyState,detail:'Huey recovery.'})})});
const recall=(call='Falcon one one')=>flightNet.receive([{transcript:`${call}, this is Command. Return to base. Over.`,confidence:1}]);
recall();check(flightNet.tasks.at(-1).state==='active','roster jet recall stays active while crew flies home');
check(!recall().ok&&recalls===1,'duplicate active recall cannot create another watcher or recall execution');
jetParked=true;flightNet.update(1);check(flightNet.tasks.at(-1).state==='complete','roster jet recovery completes only when parked on deck');
jetParked=false;recall();jetActive=true;flightNet.update(1);check(flightNet.tasks.at(-1).state==='cancelled','pilot takeover cancels automated jet recovery task');
jetActive=false;recall();jetOut=false;flightNet.update(1);check(flightNet.tasks.at(-1).state==='failed','jet lost during recovery fails the task');
recall('Huey one');check(flightNet.tasks.at(-1).state==='active','Huey structured host result retains its actual recovery watcher');
hueyState='complete';flightNet.update(1);check(flightNet.tasks.at(-1).state==='complete','Huey recovery task follows host landing outcome');
// Fill the desk using immediate ground movement, which previously bypassed the task cap.
const groundMembers=Array.from({length:13},(_,i)=>({id:100+i,kind:'marine',side:1,alive:true,able:true,role:'sl',x:-100,z:0,ai:{own:new Map()}}));
for(const m of groundMembers)m.squad={marines:true,B:{I:island},members:[m],state:'move',know:new Map()};
const bounded=createCommandNet({war:{ground:{sim:{units:groundMembers,order(s,o){s.order=o;}}}},roster:[],islands:[island],allowed:()=>true,voices:{speak(){}},now:()=>time});
const squadNames=bounded.targets().map(t=>t.call),orderSquad=(i,body)=>bounded.receive([{transcript:`${squadNames[i]}, this is Command. ${body}. Over.`,confidence:1}]);
for(let i=0;i<12;i++)assert.ok(orderSquad(i,'Move to Sandbar').ok);
check(!orderSquad(12,'Move to Sandbar').ok&&!groundMembers[12].squad.order,'thirteenth immediate movement cannot execute or allocate a watcher');
check(orderSquad(1,'Cease fire').ok&&groundMembers[1].squad.firePolicy==='hold','cease fire remains available with twelve open tasks');
check(orderSquad(0,'Defend Sandbar').ok&&bounded.tasks.filter(t=>t.state==='active').length===12,'new movement reuses the same squad’s task slot');
check(orderSquad(0,'Hold position').ok&&bounded.tasks.filter(t=>t.state==='active').length===11,'hold remains available and immediately closes superseded movement');
check(orderSquad(12,'Move to Sandbar').ok,'freed movement slot accepts another squad');
for(let i=0;i<100;i++){orderSquad(0,'Hold position');orderSquad(1,'Formation line');}
check(bounded.tasks.length<=40&&bounded.tasks.filter(t=>t.state==='active').length<=12,'repeated immediate orders retain bounded history and live watchers');
console.log(`${n}/${n} passed`);
