// A finite radio vocabulary shared by typed input, the assisted desk and microphone grammar.
// A recognizer may propose words; only an exact, addressed call can authorize a game action.
const DIGITS = ['zero','one','two','three','four','five','six','seven','eight','nine'];
export const radioWords = s => String(s).toLowerCase().replace(/\d/g,d=>' '+DIGITS[+d]+' ')
  .replace(/\bniner\b/g,'nine').replace(/[^a-z ]/g,' ').replace(/\s+/g,' ').trim();
export const radioNumber = n => String(n).split('').map(d=>+d===9?'niner':DIGITS[+d]).join(' ');
export const ORDER_TEXT = {check:'Radio check',status:'Report status',again:'Say again',hold:'Hold position',rtb:'Return to base',
  move:'Move to',proceed:'Proceed to',defend:'Defend',correct:'Correct',disregard:'Disregard'};
const no = reason => ({ok:false,reason});
export function ordersFor(target, places=[]) {
  const orders=[...(target.orders||[])];
  for(const action of target.actions||[]) {
    if(orders.some(o=>o.action===action)||!ORDER_TEXT[action])continue;
    if(['move','proceed','defend'].includes(action))for(const place of places)orders.push({action,body:ORDER_TEXT[action]+' '+place.name,label:ORDER_TEXT[action],destination:place.name,place});
    else orders.push({action,body:ORDER_TEXT[action],label:ORDER_TEXT[action],ending:action==='disregard'?'Out':'Over'});
  }
  return orders;
}
export const commandCall = (target, order) => `${target.call}, this is Command. ${order.body}. ${order.ending||'Over'}.`;
export function parseCommand(text, targets, places) {
  const s=radioWords(text);
  if (!s || s.length>240) return no('Say again. Send one short call.');
  if (/\bover and out\b|\broger wilco\b/.test(s)) return no('Use OVER when a reply is expected. Do not combine ROGER and WILCO.');
  const m=s.match(/^(.+?) this is command (.+?) (over|out)$/);
  if (!m) return no('Say again: station callsign, THIS IS COMMAND, order, OVER.');
  const matches=targets.filter(t=>[t.call,...(t.aliases||[])].some(a=>radioWords(a)===m[1]));
  if(matches.length!==1)return no(matches.length?'Ambiguous callsign. Use the full callsign.':'Station not available. Use a callsign on the radio roster.');
  const target=matches[0], body=m[2]==='return to mother'?'return to base':m[2];
  const orders=ordersFor(target,places).filter(o=>radioWords(o.body)===body);
  if(orders.length!==1)return no('Say again. Use one of this station’s listed orders and the complete destination.');
  const order=orders[0];
  if(m[3]!==radioWords(order.ending||'Over'))return no(order.ending==='Out'?'End DISREGARD with OUT.':'End this call with OVER to request a reply.');
  return {ok:true,target,action:order.action,place:order.place||null,order,key:target.id+':'+radioWords(order.body)};
}
export function selectCommand(alternatives, targets, places) {
  if(!alternatives?.length)return no('Nothing heard. Say again.');
  const first=alternatives[0];
  if(first.confidence>0&&first.confidence<.65)return no('Reception unclear. Say again.');
  const primary=parseCommand(first.transcript,targets,places);if(!primary.ok)return primary;
  for(const a of alternatives.slice(1)){
    const p=parseCommand(a.transcript,targets,places);
    if(p.ok&&p.key!==primary.key)return no('Ambiguous reception. Say again the callsign and order.');
  }
  return primary;
}
