// ngc/look-faces: exact-camera face close-ups from the face studio (game/dev/faces.html). SHOTS=a,b for a subset,
// LIGHT=flat for the old dev light. Rows: z 0 hero, 2 near, 4 crew, 6 mid, 8 roles (crew), 10 roles (near), 12 civil.
const ONLY = process.env.SHOTS ? process.env.SHOTS.split(',') : null, LIGHT = process.env.LIGHT ? `&light=${process.env.LIGHT}` : '';
export default async function (h) {
  await h.goto(`dev/faces.html?x=1${LIGHT}`);
  await h.waitFor('window.__F', 120000);
  const NF = await h.eval('__F.NF'), P = Math.PI, V = [];
  const Y = 1.655;
  for (let f = 0; f < NF; f++) {
    V.push([`hero${f}_front`, f * 0.6, Y, 0, P - 0.12, 0.03, 0.55, 30], [`hero${f}_34`, f * 0.6, Y, 0, P + 0.7, 0.06, 0.55, 30], [`hero${f}_side`, f * 0.6, Y, 0, P - 1.52, 0.02, 0.55, 30]);
    V.push([`near${f}_front`, f * 0.6, Y, 2, P - 0.12, 0.03, 0.6, 30], [`near${f}_34`, f * 0.6, Y, 2, P + 0.7, 0.06, 0.6, 30]);
    V.push([`crew${f}_front`, f * 0.6, Y, 4, P - 0.12, 0.03, 0.7, 30], [`eyes${f}_hero`, f * 0.6, Y + 0.012, 0, P - 0.1, 0.02, 0.26, 30], [`eyes${f}_near`, f * 0.6, Y + 0.012, 2, P - 0.1, 0.02, 0.26, 30]);
  }
  V.push(['hero_strip', (NF - 1) * 0.3, Y - 0.05, 0, P - 0.1, 0.04, 2.0 + NF * 0.35, 30], ['near_strip', (NF - 1) * 0.3, Y - 0.05, 2, P - 0.1, 0.04, 2.0 + NF * 0.35, 30]);
  V.push(['m1_near_front', NF * 0.6, Y + 0.02, 2, P - 0.15, 0.04, 0.7, 30], ['m1_near_34', NF * 0.6, Y + 0.02, 2, P + 0.65, 0.1, 0.7, 30], ['m1_hero_34', NF * 0.6, Y + 0.02, 0, P + 0.65, 0.1, 0.6, 30]);
  V.push(['mid_strip', NF * 0.3, Y - 0.05, 6, P - 0.1, 0.04, 2.0 + NF * 0.35, 30]);
  V.push(['roles_crew', 2.1, Y - 0.03, 8, P - 0.08, 0.04, 6.2, 30], ['roles_near', 2.1, Y - 0.03, 10, P - 0.08, 0.04, 6.2, 30]);
  for (let i = 0; i < 8; i++) V.push([`role${i}_near`, i * 0.6, Y, 10, P - 0.25, 0.04, 0.75, 30]);
  V.push(['civil_strip', -4 - (NF - 1) * 0.3, Y - 0.05, 0, P - 0.1, 0.04, 2.0 + NF * 0.35, 30], ['civil1_near', -4.6, Y, 0, P - 0.3, 0.04, 0.7, 30], ['civil4_near', -6.4, Y, 0, P + 0.4, 0.04, 0.7, 30]);
  // what a player sees: a 70-degree view at 1.5 m and 4 m
  V.push(['game_1m5', 0.6, Y - 0.05, 2, P - 0.2, 0.0, 1.5, 70], ['game_4m', 1.2, Y - 0.2, 2, P - 0.2, 0.0, 4.0, 70]);
  for (const [n, x, y, z, yaw, pitch, dist, fov] of V) {
    if (ONLY && !ONLY.some(o => n.startsWith(o))) continue;
    await h.eval(`__F.look(${x}, ${y}, ${z}, ${yaw}, ${pitch}, ${dist}, ${fov}, ${JSON.stringify(n)})`);
    await h.wait(60); await h.shot(n);
  }
  await h.logmsg('stats ' + JSON.stringify(await h.eval('__F.stats')));
}
