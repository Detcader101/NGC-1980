# NGC-1980 — playable sandbox and remaining work

Updated 2026-10-25. This is the current status; [BIBLE.md](BIBLE.md) describes the design ambition.
The earlier Claude/Opus wave board is preserved in [the planning archive](archive/PLAN-2026-10-25.md).
Historical findings and test counts describe their original branches, not necessarily the current build.

## Scope of this pass

The agreed finish line is **a reliable playable sandbox: integrate completed work, fix gameplay blockers,
and document remaining ambitions**. That covers the existing single-player island war, command board,
research, vehicle switching, airlift and CPU spectator. It does not mean every aspiration in the design bible
has been implemented or the factions have been proven balanced.

The playable build is `experimental`, in `/home/jayjay/thrust-zarch-experimental` (desktop EXPERIMENTAL,
port 8766). It has been fast-forwarded to the reviewed and tested `ngc/finish` integration.
`main` remains the older Thrust Zarch build on port 8765. Nothing is pushed automatically.

```sh
cd /home/jayjay/thrust-zarch-experimental
node tools/serve.mjs --port 8766
```

Open `http://127.0.0.1:8766/`. Enter starts a normal war; `?tech=all` opens a sandbox with all unit gates unlocked;
`?sim` watches the CPU commanders. The command board is `\`, research is Shift+`\`, and Esc opens recovery/menu
options. The README contains the craft-specific controls.

## Integrated features

| Area | Current behavior |
|---|---|
| Island war | 17-island control zone, capture, cave objectives, fog of war, production, two carriers and victory/loss rules |
| Command | Fleet reserves replace helicopter lives; take or switch units, leave flight to a crew, order reinforcements and research |
| Aircraft | Huey, Hornet, Tomcat and player Sea Knight; AI rotorcraft and jets; shared catapult queue and moving decks |
| Ground | Playable Marine, medical/inventory, jeeps and trucks, M113/M60, squad combat and vehicle delivery |
| Logistics | Huey sling loads and six-man lift; Sea Knight ramp and 13-man stick; C-130 repair teams and heavy drops |
| World | Towns, roads, traffic, enterable spaces, doors/seats, carrier interiors, sea motion and reactive sea life |
| Strategy tools | Default research for both factions, CPU doctrines/spectator, seeded headless batches/tournaments/sweeps |

This pass merged the completed branch tips below and resolved shared-file hooks against the current integration
branch. The carrier queue, starting helicopter clearance, enemy research budget, raid/salvo spending, rotorcraft
deep-contact response, moving-deck boarding/lift, Huey departure, cockpit mouse input and simulation reporting received
additional fixes. See [findings/finish.md](findings/finish.md).

| Branch | Reviewed tip | Integrated work |
|---|---|---|
| `ngc/bugsweep` | `47e7ab1` | Carrier launch fixes, shared deck queue, taxi/deck motion and launch trim |
| `ngc/simmode` | `73decd6` | Remaining findings and seed-major tournament ordering |
| `ngc/airlift` | `f87a533` | Huey sling/troop lift and C-130 heavy-drop loop |
| `ngc/qa-ship` | `aace40e` | Carrier interiors, player eye/crew clearance, seats and deck clutter |
| `ngc/sealife2` | `116ddaf` | Fish reactions, dolphins, birds, surface cues and quality controls |
| `ngc/ch46fly` | `36ad27a` | Player Sea Knight, cockpit/start, AFCS and troop transport |

## Validation and limits

[VALIDATION.md](VALIDATION.md) records the checks actually run, screenshot review and reproducible commands.
[SIMREPORT.md](SIMREPORT.md) records the strategy evidence and its limitations. The repeatable Node gate is
`npm --prefix tools test`; browser scenes use `tools/snap.mjs` and a local Chrome/Chromium.

Remaining ambitions, in priority order:

1. **War pacing and balance.** Broader seeded matches, human play sessions, useful counters and more decisive endings.
   Time-limit points leads are not victories; a few passing seeds do not establish balance.
2. **AI recovery and terrain.** The terrain/commander integration branches need a dedicated regression pass before
   replacing the existing islands. Keep testing aircraft approach/recovery and crew handoffs across rough terrain.
3. **Collision coverage.** The current movement hosts have collisions, but a single complete collision world for
   every rotor, unit and structure remains unfinished. Deep under-deck contacts now fail finitely as collisions.
   Parked player crafts are not all independent targets in the war simulation; damage coverage still varies by host.
4. **Faction role parity.** The large parity branch changes the roster, economy and AI together. It remains a separate
   design/balance integration task; the current factions are asymmetric in available hardware.
5. **World/crew depth.** Extended weather, persistent personnel, further defence/ground/air AI polish, and broader
   airdrop-zone coverage. The home-island drop is tested; every island and payload is not certified.
6. **Hardware and endurance.** Actual mid-range GPU profiling, physical HOTAS/wheel verification, long human sessions
   and visual review beyond the selected regression scenes. SwiftShader browser timings are not GPU benchmarks.

## Preserved branches and worktrees

The audit found 114 local branches and 56 registered worktrees after adding `ngc/finish`; one registered temporary
worktree is already missing. Existing worktrees, locks, commits and remotes are retained. No cleanup/prune or push
is part of this pass. Completed features already in `experimental` remain in its history.

These 16 `ngc/*` tips remain outside the integrated history. “Deferred” means not included in this release, not
discarded. Use `git log experimental..BRANCH` and `git diff experimental...BRANCH` to inspect their remaining work;
some branches also contain merges of other deferred branches.

| Branch | Tip | Disposition |
|---|---|---|
| `ngc/airai-polish` | `0fc1681` | Deferred AI flight/recovery polish |
| `ngc/airfw` | `5e5c924` | Superseded by the integrated `airfw-2` implementation |
| `ngc/c130-polish` | `0a01417` | Gameplay work already integrated; remaining diagnostic history retained |
| `ngc/collision` | `27c9dc4` | Deferred shared collision-world work |
| `ngc/commander2` | `871ee57` | Deferred crew/terrain recovery and command integration |
| `ngc/defence` | `cb31b4d` | Original attempt superseded by integrated `defence-v2` |
| `ngc/defence-polish` | `c9967e4` | Deferred defence polish; also present in `integ` |
| `ngc/integ` | `caaf58b` | Unfinished terrain/polish integration; known command/on-foot regressions |
| `ngc/parity` | `c045b2a` | Deferred roster/economy/AI expansion; checkpoint and locked worktree retained |
| `ngc/personnel` | `c8ab2d2` | Deferred personnel expansion |
| `ngc/qa-islands` | `32c725b` | Terrain-dependent island QA and fixes; not a standalone clean merge |
| `ngc/qa-units` | `2ffd444` | Deferred unit QA checkpoint without a completed integration verification |
| `ngc/rwground-polish` | `b8f7ebc` | Deferred ground-unit polish; also present in `integ` |
| `ngc/terrain` | `90e2117` | Deferred island/ground redesign with broad downstream dependencies |
| `ngc/weather` | `2473989` | Deferred weather expansion |
| `ngc/wheeled` | `879ad8d` | Gameplay implementation integrated through later branches; remaining diagnostics retained |

For future work: select one backlog item, use an isolated branch, inspect its existing checkpoint, preserve shared
interfaces, and merge only after the affected benches and browser scenes pass. Update this status and MODLOG with
actual evidence. Agent names in older documents identify historical ownership; they do not imply an agent is running.
