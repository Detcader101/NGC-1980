// WebXR input policy. No browser/Three dependency: tracking loss and UI capture are testable without a headset.
const clamp = (x, a = -1, b = 1) => Math.min(b, Math.max(a, Number.isFinite(x) ? x : 0));
export const deadzone = (x, d = .16) => Math.abs(x || 0) <= d ? 0 : clamp((Math.abs(x) - d) / (1 - d)) * Math.sign(x);
export function controllerAxes(source) {
  const p = source?.gamepad;
  if (!p || p.mapping !== 'xr-standard') return [0, 0];
  const i = p.axes.length >= 4 ? 2 : 0;
  return [deadzone(p.axes[i]), deadzone(p.axes[i + 1])];
}
export const button = (source, i) => source?.gamepad?.mapping === 'xr-standard' && !!source.gamepad.buttons[i]?.pressed;
export function createXRInput() {
  const S = { throttle: 0, stick: { x: 0, y: 0 }, rudder: 0, actions: {}, pressed: {}, source: 'VR', hasPedals: true,
    brakeL: 0, brakeR: 0, hatX: 0, hatY: 0, twist: 0, active: false, engaged: false,
    pad: { xr: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })), mapping: 'standard', connected: true },
    events: [], snap: 0 };
  // engaged: VR input is in use (a pinch, a stick off centre, a trigger/button) or was within ENGAGE_HOLD seconds.
  // Only then does it override the HOTAS / keyboard / mouse; idle tracked hands or controllers leave them alone.
  const ENGAGE_HOLD = 1.5;
  let context = null, previous = {}, snapReady = true, idleT = ENGAGE_HOLD;
  const anchors = new Map();
  S.reset = () => {
    S.active = S.engaged = false; idleT = ENGAGE_HOLD; S.stick.x = S.stick.y = S.rudder = S.brakeL = S.brakeR = S.snap = 0;
    S.actions = {}; S.pressed = {}; S.events.length = 0; S.pad.axes.fill(0);
    for (const b of S.pad.buttons) { b.pressed = false; b.value = 0; }
    previous = {}; anchors.clear(); snapReady = true; context = null;
  };
  S.poll = (samples, dt, options = {}) => {
    const { kind = 'air', key = kind, throttle = 0, blocked = false, visible = true } = options;
    if (!visible) { S.reset(); return S; }
    const changed = key !== context;
    if (changed) { S.reset(); context = key; S.throttle = clamp(throttle, 0, 1); }
    S.events.length = 0; S.snap = 0; S.stick.x = S.stick.y = S.rudder = S.brakeL = S.brakeR = 0;
    S.pad.axes.fill(0); for (const b of S.pad.buttons) { b.pressed = false; b.value = 0; }
    const now = {}, actions = {}, axes = { left: [0, 0], right: [0, 0] };
    S.active = false; const seen = new Set();
    for (const sample of samples) {
      const { source, tracked, selecting, captured, position } = sample, side = source.handedness;
      if (!tracked || !['left', 'right'].includes(side)) continue;
      seen.add(source); S.active = true;
      if (source.hand) {
        // Pinch and move relative to where the pinch began. Releasing or losing tracking centres the virtual stick.
        if (selecting && !captured && !blocked && position) {
          let a = anchors.get(source);
          if (!a) { a = { ...position, throttle: S.throttle }; anchors.set(source, a); }
          if(side==='left'||kind!=='foot')axes[side] = [clamp((position.x - a.x) / .12), clamp((position.z - a.z) / .12)];
          if (side === 'left' && kind === 'air') S.throttle = clamp(a.throttle + (position.y - a.y) * 2, 0, 1);
          if (side === 'right' && kind !== 'air') actions.fire = true;
        } else anchors.delete(source);
      } else {
        // Keep edge history during UI capture so closing a panel cannot replay a held button as a new press.
        now[side + '4'] = button(source, 4); now[side + '5'] = button(source, 5);
        if (!changed) for (const i of [4, 5]) if (now[side + i] && !previous[side + i])
          S.events.push(side === 'left' ? (i === 4 ? 'panel' : 'command') : (i === 4 ? 'interact' : 'view'));
        if (captured || blocked) continue;
        axes[side] = controllerAxes(source);
        if (side === 'right') { actions.fire = !!selecting; actions.wheelbrake = button(source, 1); }
        else { actions.missile = !!selecting; actions.ads = !!selecting; }
      }
    }
    for (const source of anchors.keys()) if (!seen.has(source)) anchors.delete(source);
    previous = now;
    const using = Object.values(actions).some(Boolean) || [...axes.left, ...axes.right].some(a => a !== 0) || anchors.size > 0;
    idleT = using ? 0 : idleT + dt;
    const wasEngaged = S.engaged; S.engaged = S.active && !blocked && idleT < ENGAGE_HOLD;
    if (S.engaged && !wasEngaged) S.throttle = clamp(throttle, 0, 1);   // pick up the HOTAS / keyboard throttle where it is
    if (blocked || !S.engaged) { S.throttle=clamp(throttle,0,1); S.actions = {}; S.pressed = {}; return S; }
    const l = axes.left, r = axes.right;
    if (kind === 'air') {
      S.stick.x = r[0]; S.stick.y = r[1]; S.rudder = l[0];
      if (!samples.some(s => s.source.hand && s.source.handedness === 'left')) S.throttle = clamp(S.throttle - l[1] * .35 * Math.min(.1, dt), 0, 1);
    } else {
      S.pad.axes[0] = l[0]; S.pad.axes[1] = l[1];
      // Ground steering uses the existing flight/wheel host too; infantry gets comfortable 30-degree snap turns.
      S.stick.x = l[0]; S.stick.y = l[1];
      if (kind === 'foot') {
        if (Math.abs(r[0]) < .25) snapReady = true;
        if (Math.abs(r[0]) > .65 && snapReady) { S.snap = Math.sign(r[0]) * Math.PI / 6; snapReady = false; }
      } else { S.pad.axes[2] = r[0]; S.pad.axes[3] = r[1]; }
      for (const [i, on] of [[7, actions.fire], [6, actions.ads]]) { S.pad.buttons[i].pressed = !!on; S.pad.buttons[i].value = on ? 1 : 0; }
      S.pad.buttons[0].pressed=kind==='ground'&&!!actions.wheelbrake; S.pad.buttons[0].value=S.pad.buttons[0].pressed?1:0;
      if(kind==='ground')actions.pickle=!!actions.ads;
    }
    S.brakeL = S.brakeR = actions.wheelbrake ? 1 : 0;
    S.actions = actions; S.pressed = {}; S.source = samples.some(s => s.source.hand) ? 'VR HANDS' : 'VR CONTROLLERS';
    return S;
  };
  return S;
}
