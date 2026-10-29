// Radio controllers use the same resources and simulation controllers as the command board.
// These are game orders, not real-world tactical/weapon procedures. No DOM, THREE or spawning here.
// A receipt means accepted; watch() reports the actual aircraft/load/construction outcome later.
const fail = reason => ({ ok: false, reason });
const active = detail => ({ state: 'active', detail });
const complete = detail => ({ state: 'complete', detail });
const failed = detail => ({ state: 'failed', detail });
const LOADS = { m151: 'jeep', m35: 'truck', m113: 'armored personnel carrier' };
const REPLACEMENTS = { heli: 'Huey', jet: 'Hornet', tomcat: 'Tomcat', m60: 'tank', m113: 'armored personnel carrier', m151: 'jeep', m35: 'truck', marine: 'Marine', ch46: 'Sea Knight' };
const alive = u => !u.dead && !u.dying && !u.gone;

export function createRadioOperations({ war, roster = [], fleet, store = war.P, airdrop, airCost = 10, logistics }) {
  const ids = { air: {}, transport: {}, supply: {}, operations: {} };
  const costs = () => war.sim?.COST || { drone: 40, escort: 30, aa: 30 };
  const islands = () => war.islands || [];
  const units = () => war.units || [];
  const aircraft = () => [...new Set([...units(), ...(war.air?.pending || [])])];
  const gate = id => war.allow && !war.allow(1, id) ? war.gateMsg?.(1, id) || 'Equipment not available.' : '';
  const funds = n => (store?.mat ?? 0) < n ? `Need ${n} materiel. ${Math.floor(store?.mat || 0)} available.` : '';
  const placeCheck = I => !I || !islands().includes(I) || !I.pad ? 'Destination is no longer available.' : '';
  const station = (id, call, channel, role, status, orders) => ({ id: 'control:' + id, call, channel, role,
    label: { air: 'Flight operations', transport: 'Troop and cargo lift', supply: 'Supply and field support', operations: 'Task force operations' }[id],
    who: 'controller:' + id, net: 'uhf', identity: ids[id], status, orders });
  const order = (action, label, suffix, I, cost, validate, execute) => ({ action, label,
    body: label + (suffix ? ' ' + suffix : ''), destination: I?.name, place: I || null, cost,
    requiresReadback: true, validate, execute });
  function guarded(validate, fn) { return () => { const why = validate(); return why ? fail(why) : fn(); }; }
  function createAndFind(list, launch, match) {
    const before = new Set(list()); let reason;
    try { reason = launch(); } catch (_) { reason = 'Controller could not finish the request.'; }
    // Existing controllers can emit HUD/audio after creation. If that presentation fails, the
    // already-paid live unit is still the authoritative receipt; never issue a false rejection.
    return { unit: list().find(u => !before.has(u) && match(u)), reason };
  }

  function capOrder(I) {
    const destination = I?.name || 'Albatross';
    const validate = () => gate('escort') || (I ? placeCheck(I) : '') ||
      (!war.carrier || war.carrier.sinking !== undefined ? 'Carrier flight deck unavailable.' : '') ||
      (aircraft().filter(u => u.type === 'escort' && !u.dead && !u.dying).length >= 3 ? 'Three Tomcats already assigned.' : '') || funds(costs().escort);
    const o = order('cap', 'Request combat air patrol', 'over ' + destination, I, costs().escort, validate, guarded(validate, () => {
      const { unit: u, reason } = createAndFind(aircraft, () => war.sendEscort(I || null), u => u.type === 'escort' && u.side === 1);
      if (!u) return fail(reason || 'No aircraft assigned.');
      const name = u.name || 'Tomcat';
      return { ok: true, detail: `${name} assigned. Launch sequence in progress.`, watch: () => {
        if (u.stowed || u.ai?.recovered) return complete(`${name} recovered aboard. Patrol sortie complete.`);
        if (u.dead || u.dying || u.sim?.dead || !aircraft().includes(u)) return failed(`${name} lost before recovery.`);
        if (u.deckE) return active(`${name} waiting for launch. ${u.deckE.state || 'On deck'}.`);
        const phase = u.ai?.state;
        if (['rtb', 'marshal', 'approach', 'groove', 'bolter', 'trap', 'waveoff'].includes(phase)) return active(`${name} returning to the carrier.`);
        return active(`${name} ${['cap', 'patrol', 'fight'].includes(phase) ? 'on patrol' : 'departing'} over ${u.cap?.name || 'Albatross'}.`);
      } };
    }));
    o.destination = destination;
    return o;
  }

  function troopOrder(I) {
    const cost = () => costs().drone - (war.ground?.CV?.poolCredit(costs().drone) || 0);
    const validate = () => gate('drone') || placeCheck(I) || (I.cave ? 'Cave objectives require a landing party on foot.' : '') ||
      (I.owner === 1 && !(war.ground?.presence(I, 2) > 0) ? 'Destination already held. No enemy landing force reported there.' : '') ||
      (units().filter(u => u.type === 'drone' && !u.dead).length >= 3 ? 'Three Sea Knights already assigned.' : '') || funds(cost());
    return order('trooplift', 'Request troop lift', 'to ' + I.name, I, cost(), validate, guarded(validate, () => {
      const { unit: u, reason } = createAndFind(units, () => war.sendDrone(I), u => u.type === 'drone' && u.side === 1);
      if (!u) return fail(reason || 'No transport assigned.');
      return { ok: true, detail: `Sea Knight with Marines departing for ${I.name}.`, watch: () => {
        // Landing is the transport's task; taking the objective remains the ground squad's job.
        if (u.rot?.deployed && u.squadUnit) return complete(`Marines disembarked at ${I.name}.`);
        if (u.stowed) return failed(`Sea Knight returned without landing the Marines at ${I.name}.`);
        if (u.dead || u.dying || u.rot?.dead || !units().includes(u)) return failed(`Troop lift to ${I.name} lost before disembarkation.`);
        if (u.rot?.AI?.homing?.()) return active('Sea Knight returning without unloading.');
        return active(u.rot?.AI?.phase === 'ground' ? `Unloading Marines at ${I.name}.` : `Sea Knight en route to ${I.name}.`);
      } };
    }));
  }

  function dropOrder(type, I) {
    const row = () => roster.find(r => r.id === type), t = fleet.type(type);
    const cost = () => airCost + (fleet.has(type) ? 0 : t.cost);
    const validate = () => placeCheck(I) || gate(type) || gate('logistics') ||
      (I.owner !== 1 ? 'Heavy drops require a friendly destination.' : '') ||
      (row()?.airdropWhy?.() || airdrop.can(type) || '') ||
      (type === 'm113' && row()?.out() ? 'Armored personnel carrier already in the field.' : '') ||
      (type === 'm113' && airdrop.runs.some(r => r.type === type && r.phase !== 'gone') ? 'Armored personnel carrier already inbound.' : '') || funds(cost());
    return order('airdrop:' + type, 'Request air drop ' + LOADS[type], 'at ' + I.name, I, cost(), validate, guarded(validate, () => {
      // Same accounting as commander.board: reserve (or a purchase) plus the sortie cost.
      // Keep a transaction snapshot so a refused/throwing launch does not consume a reserve or leave purchase history.
      const snapshot = { mat: store.mat, n: fleet.n[type], bought: fleet.bought[type], log: fleet.log.slice() };
      const rollback = () => { store.mat = snapshot.mat; fleet.n[type] = snapshot.n; fleet.bought[type] = snapshot.bought; fleet.log.splice(0, fleet.log.length, ...snapshot.log); };
      const before = new Set(airdrop.runs);
      let why;
      try {
        if (!fleet.has(type)) { why = fleet.buy(type, store); if (why) { rollback(); return fail(why); } }
        if (!fleet.take(type)) { rollback(); return fail('Vehicle reserve unavailable.'); }
        why = airdrop.order(type, I);
      } catch (_) { why = 'Transport could not accept the load.'; }
      const run = airdrop.runs.find(r => !before.has(r) && r.type === type && r.I === I);
      // A late HUD exception cannot turn a flight already created into a free vehicle.
      if (!run) { rollback(); return fail(why || 'No heavy drop flight assigned.'); }
      store.mat -= airCost;
      return { ok: true, detail: `${run.call || 'Hercules'} assigned ${LOADS[type]} delivery to ${I.name}.`, watch: () => {
        if (run.phase === 'ready') return run.vehicle ? complete(`${LOADS[type]} de-rigged and ready at ${I.name}.`) : failed(`Load delivered but vehicle could not be recovered at ${I.name}.`);
        if (run.phase === 'lost' || run.out?.lost || !airdrop.runs.includes(run)) return failed(`${LOADS[type]} air drop lost at ${I.name}.`);
        if (run.phase === 'down') return active(`Load down at ${I.name}. Ground crew de-rigging.`);
        if (run.phase === 'falling') return active(`Load descending over ${I.name}.`);
        return active(`${run.call || 'Hercules'} inbound to ${I.name}.`);
      } };
    }));
  }

  function defenseOrder(I) {
    const validate = () => gate('aa') || placeCheck(I) || (I.owner !== 1 ? 'Air defense sites require a friendly island.' : '') || funds(costs().aa);
    return order('airdefense', 'Request air defense', 'at ' + I.name, I, costs().aa, validate, guarded(validate, () => {
      const { unit: s, reason } = createAndFind(() => I.structs || [], () => war.orderAA(I), s => s.kind === 'aa' && s.side === 1);
      if (!s) return fail(reason || 'Air defense construction unavailable.');
      return { ok: true, detail: `Air defense site under construction at ${I.name}.`, watch: () => {
        if (s.dead || s.side !== 1 || I.owner !== 1 || !I.structs.includes(s)) return failed(`Air defense construction lost at ${I.name}.`);
        return s.building > 0 ? active(`Air defense site under construction at ${I.name}.`) : complete(`Air defense site ready at ${I.name}.`);
      } };
    }));
  }

  function replacementOrder(t) {
    const validate = () => gate(t.id) || funds(t.cost);
    return order('replacement:' + t.id, 'Request replacement ' + (REPLACEMENTS[t.id] || t.short), '', null, t.cost, validate, guarded(validate, () => {
      const why = fleet.buy(t.id, store);
      return why ? fail(why) : { ok: true, detail: `${REPLACEMENTS[t.id] || t.short} added to reserve. ${fleet.n[t.id]} available.` };
    }));
  }

  function researchOrder(T, node) {
    const validate = () => { const ok = T.canResearch(node.id, store); return ok === true ? '' : ok; };
    const o = order('research:' + node.id, 'Request research ' + node.name, '', null, node.cost.mat || 0, validate, guarded(validate, () => {
      const result = war.research(1, node.id);
      if (result !== true) return fail(result || 'Research could not start.');
      const project = T.current;
      return { ok: true, detail: `${node.name} research started.`, watch: () => {
        if (T.has(node.id)) return complete(`${node.name} research complete.`);
        if (T.current !== project) return failed(`${node.name} research discontinued.`);
        return active(`${node.name}: ${Math.round(T.progress * 100)} percent. ${Math.ceil(T.remaining)} seconds remaining.`);
      } };
    }));
    o.fuelCost = node.cost.fuel || 0;
    return o;
  }

  return { targets() {
    const all = islands(), out = [];
    if (typeof war.sendEscort === 'function') out.push(station('air', 'Air Boss', 'air', 'boss', () => {
      const jets = aircraft().filter(u => u.type === 'escort' && alive(u));
      return `${jets.filter(u => u.deckE).length} Tomcats in the launch sequence. ${jets.filter(u => !u.deckE).length} airborne.`;
    }, [capOrder(null), ...all.map(capOrder)]));
    if (typeof war.sendDrone === 'function' || airdrop) out.push(station('transport', 'Transport', 'support', 'command', () =>
      `${units().filter(u => u.type === 'drone' && alive(u)).length} Sea Knights assigned. ${airdrop?.runs.filter(r => !['ready', 'lost'].includes(r.phase)).length || 0} heavy drops under way.`,
    [...(typeof war.sendDrone === 'function' ? all.map(troopOrder) : []),
      ...(airdrop && fleet ? Object.keys(LOADS).filter(id => fleet.type(id)).flatMap(id => all.map(I => dropOrder(id, I))) : [])]));
    const supply = [...(typeof war.orderAA === 'function' ? all.map(defenseOrder) : []), ...(fleet ? fleet.types.map(replacementOrder) : [])];
    if (logistics) {
      const validate = () => gate('logistics') || logistics.check();
      supply.push(order('fieldlogistics', 'Request fuel and field repair', '', null, 0, validate, guarded(validate, () => {
        const result = logistics.request();
        if (result?.ok === false || typeof result === 'string' && result) return fail(result.reason || result);
        return { ok: true, detail: result?.detail || logistics.status(),
          ...(result?.watch ? { watch: result.watch } : logistics.watch ? { watch: () => logistics.watch() } : {}) };
      })));
    }
    if (supply.length) out.push(station('supply', 'Supply', 'support', 'command', () =>
      `${Math.floor(store?.mat || 0)} materiel. ${Math.floor(store?.fuel || 0)} fuel in stores.${fleet ? ' ' + fleet.total() + ' personnel and vehicles in reserve.' : ''}`, supply));
    const T = war.tech?.[1];
    if (T && typeof war.research === 'function') out.push(station('operations', 'Operations', 'command', 'command', () => {
      const n = T.current && T.node(T.current.id);
      return `${all.filter(I => I.owner === 1).length} friendly islands. ${n ? n.name + ' research ' + Math.round(T.progress * 100) + ' percent complete.' : 'Research section standing by.'}`;
    }, T.nodes.map(n => researchOrder(T, n))));
    return out;
  } };
}
