// SIM MODE: command doctrines - small parameter sets that steer a CPU commander (sim/commanderai.js for the TASK
// FORCE, sim/redai.js for the RUNAWAY). Every knob is a plain number so a sweep can turn one and watch the outcome.
// 1 is "as the game's own enemy commander does it" where the knob has a counterpart in war.js think().
//
// Shared knobs (both sides):
//   aggression   0..2   how hard and how often it attacks (raid / strike tempo and size)
//   expansion    0..2   appetite for new islands (landing tempo, how far it reaches)
//   defence      0..2   guns per island, guards / CAP over its own ships and islands
//   reserve      materiel kept back before military spending (an economy-first commander keeps more)
//   mix          { air, ground, naval } weights for the arms it builds (relative)
//   research     the techtree.js research order it follows (DOCTRINES[side][name]) and how much it spends on it
//   risk         0..1   tolerance: how damaged its carrier may be before it pulls back, how hot a target may be
//   target       'near' | 'value' | 'weak'   how it picks the next island
export const BLUE = {
  BALANCED: { name: 'BALANCED', aggression: 1, expansion: 1, defence: 1, reserve: 20, mix: { air: 1, ground: 1, naval: 1 }, research: { order: 'balanced', spend: 1 }, risk: 0.5, target: 'value', strikeEvery: 70, escorts: 1, sky: 0.5,
    desc: 'a bit of everything: Sea Knights to the near islands, guns where it holds, a Hornet strike when the way is guarded' },
  RUSH: { name: 'RUSH', aggression: 1.8, expansion: 2, defence: 0.4, reserve: 0, mix: { air: 0.7, ground: 1.6, naval: 0.5 }, research: { order: 'ground', spend: 0.4 }, risk: 0.85, target: 'near', strikeEvery: 45, escorts: 0, sky: 0,
    desc: 'every point into Sea Knights and strikes, early; few guns, no research to speak of' },
  TURTLE: { name: 'TURTLE', aggression: 0.4, expansion: 0.6, defence: 2, reserve: 40, mix: { air: 1, ground: 0.6, naval: 1.2 }, research: { order: 'econ', spend: 1 }, risk: 0.2, target: 'near', strikeEvery: 160, escorts: 2, sky: 0,
    desc: 'guns on everything it holds, CAP over the carrier, the carrier kept back; expands slowly' },
  BOOM: { name: 'BOOM', aggression: 0.6, expansion: 1.4, defence: 0.8, reserve: 60, mix: { air: 0.8, ground: 1, naval: 1 }, research: { order: 'econ', spend: 1.6 }, risk: 0.4, target: 'value', strikeEvery: 120, escorts: 1, sky: 1,
    desc: 'factories and fuel first, research the production upgrades, build the military later' },
  AIRPOWER: { name: 'AIRPOWER', aggression: 1.3, expansion: 0.9, defence: 0.8, reserve: 15, mix: { air: 2, ground: 0.6, naval: 0.6 }, research: { order: 'air', spend: 1 }, risk: 0.6, target: 'weak', strikeEvery: 40, escorts: 3, sky: 0.3,
    desc: 'Hornet strikes on the guns and the KRAKEN, Tomcat CAP; Sea Knights only to take what the jets have cleared' },
  AMPHIBIOUS: { name: 'AMPHIBIOUS', aggression: 1.2, expansion: 1.6, defence: 0.7, reserve: 10, mix: { air: 0.6, ground: 2, naval: 1.4 }, research: { order: 'ground', spend: 1 }, risk: 0.7, target: 'value', strikeEvery: 90, escorts: 1, sky: 0, carrierForward: true,
    desc: 'the ALBATROSS steams up to the next island, Sea Knights in waves, Marines to reinforce' },
};
export const RED = {
  // today's enemy commander exactly (war.js think, groundwar GW.think, airwar AW.think)
  DEFAULT: { name: 'DEFAULT', builtin: true, aggression: 1, expansion: 1, defence: 1, reserve: 0, mix: { air: 1, ground: 1, naval: 1 }, research: { order: 'balanced', spend: 1 }, risk: 0.65, target: 'near',
    desc: 'the game\'s own RUNAWAY commander (war.js think, unchanged)' },
  BLITZ: { name: 'BLITZ', aggression: 1.8, expansion: 1.8, defence: 0.5, reserve: 0, mix: { air: 1.3, ground: 1.2, naval: 0.4 }, research: { order: 'ground', spend: 0.5 }, risk: 0.9, target: 'near',
    desc: 'transports and strike groups early and often, thin guns' },
  FORTRESS: { name: 'FORTRESS', aggression: 0.5, expansion: 0.7, defence: 2, reserve: 30, mix: { air: 0.8, ground: 1, naval: 1 }, research: { order: 'balanced', spend: 1 }, risk: 0.3, target: 'near',
    desc: 'guns on every island, guards over the KRAKEN, slow careful expansion' },
  SWARM: { name: 'SWARM', aggression: 1.3, expansion: 1, defence: 0.8, reserve: 10, mix: { air: 2, ground: 0.5, naval: 0.5 }, research: { order: 'air', spend: 1 }, risk: 0.6, target: 'near',
    desc: 'WASPs, SHRIKEs and SHAHED salvos; little armour' },
  HORDE: { name: 'HORDE', aggression: 1.1, expansion: 1.3, defence: 0.8, reserve: 10, mix: { air: 0.6, ground: 2, naval: 0.8 }, research: { order: 'ground', spend: 1 }, risk: 0.7, target: 'near',
    desc: 'hover tanks and seized MBTs early, STRIDER landings behind them' },
  DREADNOUGHT: { name: 'DREADNOUGHT', aggression: 0.8, expansion: 1, defence: 1, reserve: 25, mix: { air: 0.7, ground: 0.8, naval: 2 }, research: { order: 'naval', spend: 1.3 }, risk: 0.5, target: 'near',
    desc: 'economy and the LEVIATHAN programme: the railgun monitor early, then hunt the ALBATROSS' },
};
export const SIDES = { 1: BLUE, 2: RED };
export function doctrine(side, name) {
  const T = SIDES[side], k = String(name || (side === 1 ? 'BALANCED' : 'DEFAULT')).toUpperCase().replace(/[\s_-]/g, '');
  const d = T[k] || Object.values(T).find(v => v.name.replace(/[\s_-]/g, '') === k);
  if (!d) throw new Error(`no ${side === 1 ? 'TASK FORCE' : 'RUNAWAY'} doctrine ${name} (${Object.keys(T).join(', ')})`);
  return JSON.parse(JSON.stringify(d));
}
// a doctrine with knobs overridden: tweak(d, { aggression: 1.4, 'mix.air': 2 })
export function tweak(d, o = {}) {
  const r = JSON.parse(JSON.stringify(d));
  for (const [k, v] of Object.entries(o)) { const p = k.split('.'); let t = r; while (p.length > 1) t = t[p.shift()] ??= {}; t[p[0]] = v; }
  return r;
}
