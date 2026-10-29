// SR-71A flight test page (dev/sr71.html?start=runway|air|cruise|approach): the player's aircraft (units/air/sr71play.js)
// over a flat range with a 3.5 km runway (world scale: the 1/4 ground roll of the real one), keyboard / HOTAS through
// the same play code the game uses. ?view=cockpit|chase  ?seat=1  ?hot=1  ?ap=keas|mach|alt
import * as THREE from 'three';
import { createSR71Play } from '../js/units/air/sr71play.js';
import { worldHOfFt } from '../js/units/air/sr71fm.js';
import { Sfx } from '../js/audio.js';

export function startFlight(T, Q) {
  const { scene, model, hooks, X, A: viewA } = T;
  scene.remove(model.group);   // the page's static model goes; the play layer brings its own
  const keys = new Set(); addEventListener('keydown', e => { keys.add(e.code); if (P.key(e.code)) e.preventDefault(); }); addEventListener('keyup', e => keys.delete(e.code));
  let sfx = null; try { sfx = new Sfx(); } catch (e) { sfx = null; }
  const feedEl = document.getElementById('tele');
  const P = createSR71Play({ scene, sfx, keyDown: (...c) => c.some(k => keys.has(k)), say: (t) => { T.last = t; }, feed: (t) => { T.feedLog = (T.feedLog || []).concat(t).slice(-6); }, env: { groundY: () => 0, water: () => false },
    hooks: { reconTargets: () => T.targets || [], onRecon: f => { T.reconFound = (T.reconFound || []).concat(f); }, samSites: () => T.samSites || [] } });
  const S = Q.get('start');
  if (S === 'runway') P.placeOnGround(0, 0, 0, 0, { hot: Q.has('hot') || true, fuelLb: 65000 });
  else if (S === 'approach') { P.placeInAir(0, 0, 2400, 0, { y: 140, keas: 180, fuelLb: 12000, thr: 0.5 }); P.A.gear = P.A.gearCmd = 1; }
  else if (S === 'cruise') P.placeInAir(0, 0, 0, 0, { ft: 80000, mach: 3.2, fuelLb: 45000, thr: 0.8 });
  else P.placeInAir(0, 0, 0, 0, { ft: 25000, keas: 350, fuelLb: 60000 });
  if (Q.get('ap')) { P.A.ap.on = true; P.A.ap.pitch = Q.get('ap'); P.A.ap.roll = 'hdg'; P.A.ap.hdg = 0; P.A.ap.alt = P.A.pos.y; P.A.ap.keas = Math.round(P.A.keas); P.A.ap.mach = P.A.mach; }
  P.view = Q.get('view') || 'chase'; P.seat = +(Q.get('seat') || 0);
  const head = { yaw: 0, pitch: 0 };
  let time = 0;
  hooks.pre = dt => { time += dt; if (!T.paused) P.update(dt); };
  hooks.cam = (cam, dt) => { if (P.view === 'cockpit') P.cockpitCam(cam, dt, head); else P.chaseCam(cam, dt); return true; };
  hooks.post = dt => { P.render(dt, time, P.view === 'cockpit', T.camera); };
  hooks.tele = () => P.hudLine() + '\n' + P.hint() + '\n' + (T.feedLog || []).join('\n');
  Object.assign(T, { P, head, keys });
  // the page's frame() reads X.view: 'orbit' uses hooks.cam; give the flight its own camera
  T.X.view = 'orbit';
  window.__S = T;
}
