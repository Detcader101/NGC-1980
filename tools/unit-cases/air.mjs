// Aircraft cases use the actual game or its production-model dev hosts. Pure flight-role regressions live in
// unit-air-bench.mjs. These are short, peaceful/scripted fixtures; they do not certify aircraft performance.
const GAME = '?debug&auto&kb&peace&res=0.45';
// View switches need actual game draws, including under SNAP_WALL=1 on a slow software renderer.
async function rendered(h) {
  await h.page.evaluate(() => new Promise((resolve, reject) => {
    const renderer = (window.__BENCH || window.__G)?.renderer;
    if (!renderer) { reject(new Error('Air fixture has no renderer')); return; }
    const before = renderer.info.render.frame;
    let frame;
    const timer = setTimeout(() => { cancelAnimationFrame(frame); reject(new Error('Air view did not render two frames')); }, 15000);
    const tick = () => {
      if (renderer.info.render.frame >= before + 2) { clearTimeout(timer); resolve(); }
      else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }));
}
async function evidence(h, id) {
  await h.benchmark(id);
  await h.shot(id); await h.notblank();
  if (h.capture) await h.clip(id, { durationMs: 6000 });
}
async function game(h) {
  await h.waitFor("window.__G && __G.G.state === 'play' && __G.H.landed", 30000);
}
async function flight(h) {
  await h.waitFor('window.__F && window.__BENCH && __F.units.length', 20000);
  await h.eval('(__F.speedUp = 0, __F.camMode = 1, true)');
}
async function rotary(h) {
  await h.waitFor('window.__R && __R.unit && window.__BENCH', 20000);
}
export const cases = [
  {
    id: 'huey', name: 'UH-1H Huey', category: 'air', kind: 'playable', query: GAME,
    description: 'Peaceful main-game carrier deck: roll the throttle to flight power and check governor/rotor telemetry, then capture the analog cockpit and running exterior. Hover lift and engine/rotor needle separation are exercised by the Node role bench.',
    async run(h) {
      await game(h);
      await h.eval('(__G.SY.grip = 1, __G.SY.auto = null, __G.cockpitCam = true, __G.head.pitch = -0.3, true)');
      await h.waitFor('__G.H.rpm > 0.95 && __G.H.n2 > 0.95', 90000);
      await h.expect('__G.G.craft === "heli" && __G.SY.gov === "AUTO" && __G.H.landed && __G.Z.alive', 'Huey remains on its skids with governed flight RPM');
      await evidence(h, 'huey');
      await h.eval('(__G.cockpitCam = false, __G.head.pitch = 0, true)'); await rendered(h);
      await h.shot('huey-exterior'); await h.notblank();
    },
  },
  {
    id: 'hornet', name: 'F/A-18A Hornet', category: 'air', kind: 'playable', query: GAME,
    description: 'Main-game deck launch fixture: select the F/A-18A through its real hotkey, verify catapult attachment and independently running twin engines, then benchmark its cockpit on the shuttle. Catapult flight and control response remain in the flight/deck regression suites.',
    async run(h) {
      await game(h); await h.key('tap', 'Digit5');
      await h.waitFor('__G.G.craft === "jet" && __G.JP.J.cat', 15000);
      await h.expect('__G.JP.J.cat.state === "hold" && __G.JP.J.eng.length === 2 && __G.JP.alive', 'Hornet is held on the catapult as a live twin-engine aircraft');
      await h.eval('(__G.cockpitCam = true, __G.head.pitch = -0.22, true)');
      await evidence(h, 'hornet');
      await h.eval('(__G.cockpitCam = false, __G.head.pitch = 0, __G.JP.snapChase(), true)'); await rendered(h);
      await h.shot('hornet-exterior'); await h.notblank();
    },
  },
  {
    id: 'tomcat', name: 'F-14A Tomcat', category: 'air', kind: 'playable', query: 'dev/air.html?fly=sortie&ui=0&res=0.6',
    description: 'Production F-14A flight model and AI in the carrier dev world: step a full catapult departure into CAP, verify flight and variable wings, then benchmark live patrol. This fixture exercises AI flight, not player cockpit input.',
    async run(h) {
      await flight(h);
      await h.eval('(() => { for (let i = 0; i < 60 * 45 && __F.units[0].pilot.state !== "cap"; i++) __F.step(); return true; })()');
      await h.expect('__F.units[0].pilot.state === "cap" && !__F.units[0].A.dead && !__F.units[0].A.cat && __F.units[0].A.pos.y > 100', 'Tomcat completed its catapult departure into CAP');
      await h.expect('__F.units[0].A.sweep >= 20 && __F.units[0].A.sweep <= 68 && __F.units[0].A.eng.length === 2', 'F-14 has live variable-sweep wings and two engines');
      await h.eval('(__F.speedUp = 1, true)'); await rendered(h); await evidence(h, 'tomcat');
      await h.expect('!__F.units[0].A.dead', 'Tomcat remains airborne through the sample');
    },
  },
  {
    id: 'ch46', name: 'CH-46E Sea Knight', category: 'air', kind: 'playable', query: 'dev/rotary.html?ac=ch46&paused&ui=0&res=0.6',
    description: 'Production transport unit in the rotary dev world: board 13 Marines, depart and establish transit with both tandem rotors lifting. After live benchmarking, deterministically finish delivery and assert Marines holding the landing pad. This fixture uses its AI pilot.',
    async run(h) {
      await rotary(h);
      await h.eval('(__R.runUntil(() => __R.unit.U.AI.phase === "transit" && __R.unit.U.S.agl > 12, 160), __R.camMode = "chase", __R.render(), true)');
      await h.expect('__R.unit.U.AI.phase === "transit" && !__R.unit.U.dead && __R.unit.U.S.rf.T > 10000 && __R.unit.U.S.ra.T > 10000', 'Sea Knight boards and departs on both rotors');
      await h.expect('__R.unit.U.squad.alive === 13 && __R.unit.U.S.payload > 1400', 'embarked Marine payload is represented in flight');
      await h.eval('(__R.paused = false, true)'); await evidence(h, 'ch46');
      await h.eval('(__R.paused = true, __R.runUntil(() => __R.unit.U.squad.holding >= 11, 400), __R.camMode = "lz", __R.render(), true)');
      await h.expect('__R.unit.U.squad.holding >= 11 && !__R.unit.U.dead', 'Sea Knight delivers Marines through its ramp to the pad');
      await rendered(h); await h.shot('ch46-delivery'); await h.notblank();
    },
  },
  {
    id: 'c130', name: 'KC-130R Hercules', category: 'air', kind: 'playable', query: 'dev/c130.html?start=air&view=orbit&res=0.6',
    description: 'KC-130R dev flight host with the production four-engine transport model: feather engine one, keep the other three governed and verify autopilot flight. The existing transport/drop suites cover parachute deployment; this is not a C-130J avionics fixture.',
    async run(h) {
      await h.waitFor('window.__C && __C.S.tas > 10 && window.__BENCH', 15000);
      await h.eval('(__C.ap = true, window.__airAlt = __C.S.pos.y, __C.S.setCond(0, "feather"), true)');
      await h.waitFor('__C.S.eng[0].beta > 90 && __C.S.eng[0].N < 0.05', 90000);
      await h.expect('__C.S.eng.slice(1).every(e => e.run && e.N > 0.9) && !__C.S.dead', 'only number one is stopped and feathered');
      await evidence(h, 'c130');
      await h.expect('!__C.S.dead && Math.abs(__C.S.pos.y - __airAlt) < 35 && Math.abs(__C.S.bank) < 0.2', 'three-engine autopilot holds the transport in flight');
      await h.eval('(__C.view = "deck", __C.head.yaw = -0.25, __C.head.pitch = -0.4, true)'); await rendered(h);
      await h.shot('c130-engine-panel'); await h.notblank();
      await h.eval('(delete window.__airAlt, true)');
    },
  },
  {
    id: 'mv22', name: 'MV-22B Osprey', category: 'air', kind: 'ai', query: 'dev/rotary.html?ac=mv22&paused&ui=0&res=0.6',
    description: 'RUNAWAY-refit MV-22B production transport in the rotary dev world: depart vertically, convert to wing-borne flight, then benchmark airplane transit and finish a troop delivery. This uses the AI pilot and a scripted island landing zone.',
    async run(h) {
      await rotary(h);
      await h.eval('(__R.runUntil(() => __R.unit.U.S.nac < 0.03 && __R.unit.U.S.ias > 190, 200), __R.camMode = "chase", __R.render(), true)');
      await h.expect('__R.unit.U.S.nac < 0.03 && __R.unit.U.S.ias > 190 && __R.unit.U.S.wingL > 100000 && !__R.unit.U.dead', 'Osprey converts from vertical departure to wing-borne flight');
      await h.eval('(__R.paused = false, true)'); await evidence(h, 'mv22');
      await h.eval('(__R.paused = true, __R.runUntil(() => __R.unit.U.squad.holding >= 10, 400), __R.camMode = "lz", __R.render(), true)');
      await h.expect('__R.unit.U.squad.holding >= 10 && !__R.unit.U.dead', 'Osprey reconverts and delivers its machine troop squad');
      await rendered(h); await h.shot('mv22-delivery'); await h.notblank();
    },
  },
  {
    id: 'wasp', name: 'RW-3 WASP', category: 'air', kind: 'ai', query: 'dev/rotary.html?ac=wasp&paused&ui=0&res=0.6',
    description: 'Five fictional ducted-fan drones fly the existing swarm/ambush demo around a scripted Huey. Verify powered maneuvering and finite flight, then benchmark the live swarm. These are setting-specific physics, not a real aircraft claim.',
    async run(h) {
      await rotary(h);
      await h.eval('(__R.run(18), __R.camMode = "orbit", __R.render(), true)');
      await h.expect('[...__R.unit.U.ws, __R.unit.U.amb].every(w => !w.dead && w.S.power > 10000 && w.S.body.pos.every(Number.isFinite))', 'all five WASPs stay powered and airborne');
      await h.eval('(__R.paused = false, true)'); await evidence(h, 'wasp');
      await h.expect('[...__R.unit.U.ws, __R.unit.U.amb].every(w => !w.dead)', 'swarm remains alive through the benchmark');
    },
  },
  {
    id: 'shrike', name: 'RW-4 SHRIKE', category: 'air', kind: 'ai', query: 'dev/air.html?fly=fight&ui=0&res=0.6',
    description: 'Fictional single-engine fighter patrol using the production AI flight model. The demo opponent is hidden and removed from combat to isolate the unit. Check bank maneuvering and no afterburner, then benchmark live CAP.',
    async run(h) {
      await flight(h);
      await h.eval('(() => { const foe = __F.units[0]; foe.dead = true; foe.model.group.visible = false; __F.follow = 1; for (let i = 0; i < 600; i++) __F.step(); return true; })()');
      await h.expect('__F.units[1].A.eng.length === 1 && __F.units[1].A.eng[0].ab === 0 && !__F.units[1].A.dead && __F.units[1].A.pos.y > 100', 'SHRIKE patrols with its single dry-thrust engine');
      await h.eval('(__F.speedUp = 1, true)'); await rendered(h); await evidence(h, 'shrike');
      await h.expect('!__F.units[1].A.dead && __F.units[1].A.eng[0].ab === 0', 'SHRIKE patrol remains stable without an afterburner');
    },
  },
  {
    id: 'reaper', name: 'MQ-9 Reaper', category: 'air', kind: 'ai', query: 'dev/air.html?fly=reaper&ui=0&res=0.6',
    description: 'Production turboprop UAV in its existing orbit demo: verify patrol, power and prop rotation, benchmark live loiter, then use the model host to check and photograph a stopped pusher. Shutdown gauge behavior is covered by the Node role bench.',
    async run(h) {
      await flight(h);
      await h.eval('(() => { for (let i = 0; i < 1200; i++) __F.step(); return true; })()');
      await h.expect('__F.units[0].pilot.state === "patrol" && !__F.units[0].A.dead && __F.units[0].A.eng[0].power > 10000 && __F.units[0].A.eng[0].ab === 0', 'Reaper holds its patrol with turboprop power');
      await h.eval('(__F.speedUp = 1, true)'); await rendered(h); await evidence(h, 'reaper');
      await h.goto('dev/air.html?model=reaper&ui=0&cam=0.55,0.18,17,0,0,3&res=0.6');
      await h.waitFor('window.__A', 10000);
      await h.eval('(__A.S.eng = [{ n: 0 }], __A.S.gear = 1, __A.render(), window.__prop0 = __A.model.parts.prop.rotation.z, true)');
      await rendered(h);
      await h.expect('__A.model.parts.prop.rotation.z === __prop0 && __A.model.parts.prop.children.filter(o => o.name === "blade").every(o => o.visible)', 'zero shaft signal leaves the Reaper pusher stationary with blades visible');
      await h.shot('reaper-prop-stopped'); await h.notblank();
      if (h.capture) {
        await h.clip('reaper-prop-start', { durationMs: 6000 }, async () => {
          await h.page.evaluate(() => new Promise(resolve => setTimeout(resolve, 2000)));
          await h.eval('(__A.S.eng[0].n = 0.7, true)');
          await rendered(h);
        });
      }
      await h.eval('(delete window.__prop0, true)');
    },
  },
  {
    id: 'shahed', name: 'SHAHED-style drone', category: 'air', kind: 'ai', query: 'dev/air.html?fly=shahed&ui=0&res=0.6',
    description: 'Existing simplified delta-drone salvo in the air dev world, with the interceptor disabled for an isolated flight sample. Check forward flight after launch and capture the pusher model at rest. No claim of real guidance or weapon fidelity.',
    async run(h) {
      await flight(h);
      await h.eval('(() => { for (const u of __F.units) if (u.A) { u.dead = true; u.model.group.visible = false; } for (let i = 0; i < 600; i++) __F.step(); return true; })()');
      await h.expect('__F.units.filter(u => u.D).length === 4 && __F.units.filter(u => u.D).every(u => !u.dead && u.D.V > 15 && u.D.pos.y > 10)', 'all four simplified delta drones launch into forward flight');
      await h.eval('(__F.speedUp = 1, true)'); await rendered(h); await evidence(h, 'shahed');
      await h.goto('dev/air.html?model=shahed&ui=0&cam=0.55,0.2,5&res=0.6'); await h.waitFor('window.__A', 10000);
      await h.eval('(__A.S.ctl = { thr: 0 }, __A.render(), true)'); await rendered(h);
      await h.expect('__A.model.parts.prop.getObjectByName("propDisc").material.opacity === 0 && __A.model.parts.prop.children.filter(o => o.name === "blade").every(o => o.visible)', 'stopped two-blade pusher has no blur disc');
      await h.shot('shahed-prop-stopped'); await h.notblank();
    },
  },
  {
    id: 'paratrooper', name: 'Marine paratrooper / repair team', category: 'air', kind: 'ai', query: GAME,
    description: 'Scripted main-game emergency release: place the real KC-130R above the home pad, ring its bailout bell, and advance to canopy inflation. Project the lead jumper/canopy bounds through the actual game camera, benchmark three live descending Marines and check landing. Aircraft approach, jumpmaster checklist and static-line sequencing are bypassed.',
    async run(h) {
      await game(h);
      await h.eval(`(() => {
        const G = __G, p = G.PAD, y = G.groundY(p.x, p.z);
        G.H.reset(new G.THREE.Vector3(p.x, y - G.HELI.SKID_Y, p.z), 0, true, 0);
        G.HI.setCollective(0); G.SY.grip = 0; G.SY.auto = null;
        G.drop.start({ x: p.x, y, z: p.z }, { x: p.x + 100, z: p.z + 100 });
        const M = G.drop.state, S = M.plane.sim;
        S.reset(new G.THREE.Vector3(p.x, y + 210, p.z), 0, 0, { flap: 0.5, gear: 0, lever: 45 });
        S.vel.set(0, 0, 0); M.wind.set(0, 0); M.env.wind.x = M.env.wind.z = 0;
        M.plane.mesh.position.copy(S.pos); M.plane.mesh.quaternion.copy(S.q); M.plane.mesh.updateMatrixWorld(true);
        G.drop.clickSwitch('bell'); M.plane.gone = true; M.plane.mesh.visible = false;
        for (let i = 0; i < 240; i++) G.drop.update(1 / 60, {}, G.H);
        return true;
      })()`);
      await h.expect('__G.drop.state.left === 0 && __G.drop.state.jumpers.length === 3 && __G.drop.state.jumpers.every(j => j.state === "canopy" && j.m.canopy.visible && j.v.y < 0)', 'three Marines leave the aircraft and inflate visible descending canopies');
      await h.page.evaluate(() => {
        // Project the whole lead canopy/body, not just its origin or a nonblank scenery image.
        window.__paraBounds = () => {
          const G = __G, L = G.drop.state?.jumpers.find(j => j.state === 'ff' || j.state === 'canopy');
          if (!L || L.state !== 'canopy' || !L.m.canopy.visible) return null;
          L.m.group.updateWorldMatrix(true, true); G.zCam.updateMatrixWorld();
          const box = new G.THREE.Box3().setFromObject(L.m.group), p = new G.THREE.Vector3();
          const b = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity };
          for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
            p.set(x, y, z).project(G.zCam);
            b.minX = Math.min(b.minX, p.x); b.maxX = Math.max(b.maxX, p.x);
            b.minY = Math.min(b.minY, p.y); b.maxY = Math.max(b.maxY, p.y);
            b.minZ = Math.min(b.minZ, p.z); b.maxZ = Math.max(b.maxZ, p.z);
          }
          b.framed = b.minX > -0.9 && b.maxX < 0.9 && b.minY > -0.9 && b.maxY < 0.9
            && b.minZ > -1 && b.maxZ < 1 && b.maxY - b.minY > 0.15;
          return b;
        };
      });
      await h.waitFor('window.__paraBounds()?.framed', 30000);
      await h.eval('__paraBounds()', 'projected bounds before canopy evidence');
      await h.expect('__paraBounds()?.framed', 'lead Marine and complete canopy fit inside the actual rendered camera with margin');
      await evidence(h, 'paratrooper');
      await h.expect('__paraBounds()?.framed', 'camera keeps the descending Marine and canopy framed through sampling/capture');
      await h.eval('(() => { for (let i = 0; i < 60 * 75 && __G.drop.state.jumpers.some(j => j.state === "ff" || j.state === "canopy"); i++) __G.drop.update(1 / 60, {}, __G.H); return true; })()');
      await h.expect('__G.drop.state.jumpers.every(j => j.state === "run" || j.state === "work")', 'all three land on the scripted dry pad and transition to ground movement');
      await rendered(h); await h.shot('paratrooper-landed'); await h.notblank();
      await h.eval('(__G.drop.cancel(), delete window.__paraBounds, true)');
    },
  },
];
