// Delivery changes at synthesis time, so cadence and pitch are independent. No resampled "character" voices.
// These are restrained performance directions for our dialogue, not claims about real people's voices.
const hash = s => { let h=2166136261; for(const c of String(s))h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0; };
const fraction=(id,key)=>hash(id+':'+key)/4294967296;
export function deliveryFor(who,role='marine',urgent=false) {
  const id=String(who), female=role==='betty'||(role==='civ'&&fraction(id,'sex')<.45);
  const measured=['command','tower','boss','rto','lso'].includes(role);
  return { female, voice:female?'Microsoft Zira':fraction(id,'cast')<.5?'Microsoft Mark':'Microsoft David',
    rate:Math.round((measured?.97:1.01)*100+fraction(id,'tempo')*6+(urgent?5:0)),
    pitch:Math.round(-4+fraction(id,'tone')*8), urgent:!!urgent };
}
export function speechText(text) {
  const digits=['zero','one','two','three','four','five','six','seven','eight','niner'];
  return String(text).replace(/\b(Victory|Raider|Hotel|Falcon|Bullet|Knight|Huey)\s+(\d+)\b/gi,(_,name,n)=>name+' '+[...n].map(d=>digits[+d]).join(' ')).replace(/\bRTB\b/g,'returning to base').replace(/\bCAP\b/g,'combat air patrol')
    .replace(/\bUH-?1H\b/gi,'Huey').replace(/\bCH-?46E?\b/gi,'Sea Knight')
    .replace(/\bF\/?A-?18A?\b/gi,'Hornet').replace(/\bF-?14A?\b/gi,'Tomcat')
    .replace(/\bKC?-?130[RH]?\b/gi,'Hercules').replace(/\bM113A2\b/gi,'M one one three')
    .replace(/\bM151A2\b/gi,'M one five one').replace(/\bM35A2\b/gi,'M three five')
    .replace(/\bM60A3\b/gi,'M six zero').replace(/\bAA\b/g,'air defence')
    .replace(/%/g,' percent').replace(/[—–]|\s-\s/g,'. ').replace(/\s+/g,' ').replace(/\s+([.,;!?])/g,'$1').trim().toLowerCase();
}
export function speechSSML(text,delivery) {
  const escaped=speechText(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  const p=delivery.pitch>=0?'+'+delivery.pitch:String(delivery.pitch);
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US"><prosody rate="${delivery.rate}%" pitch="${p}%">${escaped}</prosody></speak>`;
}
