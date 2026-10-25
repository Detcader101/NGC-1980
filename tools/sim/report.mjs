// SIM MODE: the numbers of a batch of CPU vs CPU wars (tools/warsim.mjs): win rates with 95% intervals, game length,
// how wars end, island control and materiel over time, units built / lost, research, the fun metrics, and the
// dominant-strategy check. aggregate(records, meta) -> summary (plain JSON); renderReport(summary) -> markdown.
const CURVE_T = [5, 10, 15, 20, 30, 45, 60];   // minutes
const mean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0;
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = x => Math.round(x * 10) / 10, r2 = x => Math.round(x * 100) / 100, pct = x => `${Math.round(x * 100)}%`;
// Wilson score interval for k successes in n (95%)
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
function at(samples, tmin) {   // the sample at or before t minutes (the last one if the war ended earlier)
  let best = samples[0]; for (const s of samples) { if (s.t <= tmin * 60) best = s; else break; } return best;
}
function group(recs, key) { const m = new Map(); for (const r of recs) { const k = key(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); } return m; }

function cell(rs) {
  const ok = rs.filter(r => !r.failed && r.reason !== 'error'), n = ok.length;
  const b = ok.filter(r => r.winner === 1).length, e = ok.filter(r => r.winner === 2).length, d = n - b - e;
  const bd = ok.filter(r => r.winner === 1 && r.decisive).length, ed = ok.filter(r => r.winner === 2 && r.decisive).length;
  const how = {}; for (const r of ok) { const k = r.decisive ? r.how : `timeout (${r.winner === 1 ? 'TASK FORCE' : r.winner === 2 ? 'RUNAWAY' : 'even'} ahead)`; how[k] = (how[k] || 0) + 1; }
  const curves = CURVE_T.map(t => { const s = ok.map(r => at(r.samples, t)).filter(Boolean); return { t, own1: r1(mean(s.map(x => x.own[1]))), own2: r1(mean(s.map(x => x.own[2]))), m1: Math.round(mean(s.map(x => x.m1))), m2: Math.round(mean(s.map(x => x.m2))), s1: r1(mean(s.map(x => x.s1))), s2: r1(mean(s.map(x => x.s2))), alive: s.filter((x, i) => ok[i].time >= t * 60).length }; });
  const units = { 1: {}, 2: {} };
  for (const side of [1, 2]) {
    const types = new Set(); for (const r of ok) { for (const k of Object.keys(r.built[side] || {})) types.add(k); for (const k of Object.keys(r.lost[side] || {})) types.add(k); }
    for (const t of types) units[side][t] = { built: r1(mean(ok.map(r => (r.built[side] || {})[t] || 0))), lost: r1(mean(ok.map(r => (r.lost[side] || {})[t] || 0))) };
  }
  const fn = k => r2(mean(ok.map(r => r[k] ?? 0)));
  const first = k => { const v = ok.map(r => r.first && r.first[k]).filter(x => x !== null && x !== undefined); return v.length ? r1(mean(v) / 60) : null; };
  return {
    n, failed: rs.length - n, blue: b, red: e, draw: d, blueDecisive: bd, redDecisive: ed,
    blueRate: n ? (b + d * 0.5) / n : 0, blueCI: wilson(b, n), redCI: wilson(e, n), decisiveRate: n ? (bd + ed) / n : 0,
    lenMean: r1(mean(ok.map(r => r.time / 60))), lenMedian: r1(median(ok.map(r => r.time / 60))), how,
    fun: {
      leadChanges: fn('leadChanges'), comebackRate: r2(mean(ok.map(r => r.comeback ? 1 : 0))), decisiveMoments: fn('decisiveMoments'), snowball: fn('snowball'),
      deadShare: r2(mean(ok.map(r => r.minutesTotal ? r.deadMinutes / r.minutesTotal : 0))), longestLull: fn('longestLull'),
      firstShot: first('shot'), firstLoss: first('loss'), firstCapture: first('capture'),
    },
    curves, units, anomalies: ok.reduce((s, r) => s + (r.anomalies ? r.anomalies.length : 0), 0), anomalyText: [...new Set(ok.flatMap(r => (r.anomalies || []).map(a => a.replace(/^t \d+: /, '').replace(/near -?\d+, -?\d+/, '').trim())))].slice(0, 6),
    speed: r2(mean(ok.map(r => r.speed))), strike: ok[0] && ok[0].strike ? { sorties: r1(mean(ok.map(r => r.strike.sorties))), bombs: r1(mean(ok.map(r => r.strike.bombs))), lost: r1(mean(ok.map(r => r.strike.lost))), kills: r1(mean(ok.map(r => r.strike.kills.aa + r.strike.kills.building + r.strike.kills.ship))) } : null,
  };
}

export function aggregate(recs, meta) {
  const ok = recs.filter(r => !r.failed && r.reason !== 'error');
  const key = r => `${r.blue}|${r.red}${r.sweep ? '|' + r.sweep.value : ''}`;
  const cells = {}; for (const [k, rs] of group(recs, key)) cells[k] = cell(rs);
  // research: how often each node is done, when, and the win rate of the side that did it vs the side that did not
  const research = { 1: {}, 2: {} };
  for (const side of [1, 2]) {
    const ids = new Set(ok.flatMap(r => (r.research && r.research[side] || []).map(x => x[0])));
    const all = ok.filter(r => r.tech !== 'all' || side === 2 && r.etech !== 'all');
    for (const id of ids) {
      const w = all.filter(r => r.research[side].some(x => x[0] === id)), wo = all.filter(r => !r.research[side].some(x => x[0] === id));
      const wr = rs => rs.length ? rs.filter(r => r.winner === side).length / rs.length : null;
      research[side][id] = { share: r2(w.length / (all.length || 1)), meanT: r1(mean(w.map(r => r.research[side].find(x => x[0] === id)[1] / 60))), winWith: wr(w) === null ? null : r2(wr(w)), winWithout: wr(wo) === null ? null : r2(wr(wo)), n: w.length };
    }
  }
  // unit contribution: per side and type, mean built in the side's wins vs its losses (a type that is built more
  // when winning mattered; one that is built the same either way did not)
  const contrib = { 1: {}, 2: {} };
  for (const side of [1, 2]) {
    const W = ok.filter(r => r.winner === side), L = ok.filter(r => r.winner && r.winner !== side);
    const types = new Set(ok.flatMap(r => Object.keys(r.built[side] || {})));
    for (const t of types) contrib[side][t] = { inWins: r1(mean(W.map(r => (r.built[side] || {})[t] || 0))), inLosses: r1(mean(L.map(r => (r.built[side] || {})[t] || 0))), lostPerWar: r1(mean(ok.map(r => (r.lost[side] || {})[t] || 0))) };
  }
  // dominance: a doctrine that wins > 70% against every opponent doctrine it met (the lower bound of the interval too)
  const dominant = [];
  if (!meta.sweep) {
    for (const b of meta.blues) { const cs = meta.reds.map(r => cells[`${b}|${r}`]).filter(Boolean); if (cs.length > 1 && cs.every(c => c.blueRate > 0.7)) dominant.push({ side: 1, name: b, worst: r2(Math.min(...cs.map(c => c.blueRate))), sure: cs.every(c => c.blueCI[0] > 0.5) }); }
    for (const r of meta.reds) { const cs = meta.blues.map(b => cells[`${b}|${r}`]).filter(Boolean); if (cs.length > 1 && cs.every(c => 1 - c.blueRate > 0.7)) dominant.push({ side: 2, name: r, worst: r2(Math.min(...cs.map(c => 1 - c.blueRate))), sure: cs.every(c => c.redCI[0] > 0.5) }); }
  }
  const all = cell(recs);
  return { meta: { ...meta, n: recs.length, failed: recs.length - ok.length }, cells, overall: all, research, contrib, dominant, techNodes: null };
}

export function renderReport(S) {
  const M = S.meta, L = [];
  L.push(`# SIM MODE report`, '', `${M.n} wars${M.failed ? ` (${M.failed} failed)` : ''}, up to ${Math.round(M.tmax / 60)} min each, tech ${JSON.stringify(M.base.tech)}${M.base.etech ? ' / ' + JSON.stringify(M.base.etech) : ''}, pilot ${M.base.pilot}${M.base.patch && M.base.patch.length ? ', patch ' + M.base.patch.join(',') : ''}. ` +
    `${Math.round(M.simSec / 60)} simulated minutes in ${(M.wall / 60).toFixed(1)} min on ${M.workers} workers (${(M.simSec / 60 / M.wall).toFixed(2)} sim-min per real second).`, '');
  const ck = Object.keys(S.cells);
  L.push('## Outcomes', '', '| TASK FORCE | RUNAWAY |' + (M.sweep ? ` ${M.sweep.key} |` : '') + ' n | TF wins | RW wins | draws | TF win rate (95% CI) | decisive | length min (median) | how it ends (most often) |', '|---|---|' + (M.sweep ? '---|' : '') + '---|---|---|---|---|---|---|---|');
  for (const k of ck) {
    const c = S.cells[k], [b, r, v] = k.split('|'), top = Object.entries(c.how).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([h, n]) => `${h.toLowerCase()} ${n}`).join('; ');
    L.push(`| ${b} | ${r} |${M.sweep ? ` ${v} |` : ''} ${c.n} | ${c.blue} | ${c.red} | ${c.draw} | ${pct(c.blueRate)} (${pct(c.blueCI[0])}-${pct(c.blueCI[1])}) | ${pct(c.decisiveRate)} | ${c.lenMean} (${c.lenMedian}) | ${top} |`);
  }
  if (!M.sweep && M.blues.length > 1 && M.reds.length > 1) {
    L.push('', '## Round robin: TASK FORCE win rate', '', '| | ' + M.reds.join(' | ') + ' | mean |', '|---|' + M.reds.map(() => '---').join('|') + '|---|');
    for (const b of M.blues) { const row = M.reds.map(r => S.cells[`${b}|${r}`]); L.push(`| **${b}** | ` + row.map(c => c ? pct(c.blueRate) : '-').join(' | ') + ` | ${pct(mean(row.filter(Boolean).map(c => c.blueRate)))} |`); }
    L.push(`| **mean (RUNAWAY's view: 1 - this)** | ` + M.reds.map(r => pct(mean(M.blues.map(b => S.cells[`${b}|${r}`]).filter(Boolean).map(c => c.blueRate)))).join(' | ') + ' | |');
  }
  L.push('', '## Dominant strategies', '', S.dominant.length ? S.dominant.map(d => `- **${d.side === 1 ? 'TASK FORCE' : 'RUNAWAY'} ${d.name}** wins over 70% against every opponent (worst ${pct(d.worst)})${d.sure ? ', and the 95% interval stays above 50% everywhere' : ''}`).join('\n') : '- none: no doctrine beats every opponent more than 70% of the time');
  L.push('', '## Fun metrics', '', '| matchup | lead changes | comeback rate | decisive moments | snowball (0 = winner clear from the start) | dead minutes | longest lull min | first shot min | first loss min | first capture min |', '|---|---|---|---|---|---|---|---|---|---|');
  for (const k of ck) { const f = S.cells[k].fun; L.push(`| ${k.replace(/\|/g, ' vs ').replace(/ vs ([\d.]+)$/, ' @ $1')} | ${f.leadChanges} | ${pct(f.comebackRate)} | ${f.decisiveMoments} | ${f.snowball} | ${pct(f.deadShare)} | ${f.longestLull} | ${f.firstShot ?? '-'} | ${f.firstLoss ?? '-'} | ${f.firstCapture ?? '-'} |`); }
  const O = S.overall;
  L.push('', '## Island control and materiel over time (all wars)', '', '| min | TF islands | RW islands | TF materiel | RW materiel | TF strength | RW strength | wars still going |', '|---|---|---|---|---|---|---|---|');
  for (const c of O.curves) L.push(`| ${c.t} | ${c.own1} | ${c.own2} | ${c.m1} | ${c.m2} | ${c.s1} | ${c.s2} | ${c.alive} |`);
  for (const side of [1, 2]) {
    L.push('', `## ${side === 1 ? 'TASK FORCE' : 'RUNAWAY'} units: built / lost per war, and built in wins vs losses`, '', '| type | built | lost | built when winning | built when losing |', '|---|---|---|---|---|');
    for (const [t, u] of Object.entries(O.units[side]).sort((a, b) => b[1].built - a[1].built)) { const c = S.contrib[side][t] || {}; L.push(`| ${t} | ${u.built} | ${u.lost} | ${c.inWins ?? '-'} | ${c.inLosses ?? '-'} |`); }
  }
  for (const side of [1, 2]) {
    const R = Object.entries(S.research[side]); if (!R.length) continue;
    L.push('', `## ${side === 1 ? 'TASK FORCE' : 'RUNAWAY'} research`, '', '| node | researched in | mean time (min) | side won when researched | when not |', '|---|---|---|---|---|');
    for (const [id, x] of R.sort((a, b) => a[1].meanT - b[1].meanT)) L.push(`| ${id} | ${pct(x.share)} | ${x.meanT} | ${x.winWith === null ? '-' : pct(x.winWith)} | ${x.winWithout === null ? '-' : pct(x.winWithout)} |`);
  }
  if (S.techNever) L.push('', '## Never researched (dead branches)', '', S.techNever.map(x => `- side ${x.side}: ${x.id} ${x.name}`).join('\n') || '- none');
  if (O.strike) L.push('', `## The AI Hornet strike wing`, '', `${O.strike.sorties} sorties, ${O.strike.bombs} bombs, ${O.strike.kills} targets destroyed, ${O.strike.lost} Hornets lost per war (mean).`);
  if (O.anomalies) L.push('', '## Anomalies (game bugs the sim tripped over)', '', `${O.anomalies} in ${M.n} wars:`, ...O.anomalyText.map(a => `- ${a}`));
  return L.join('\n') + '\n';
}
