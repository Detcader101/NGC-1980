# Findings: ngc/qa-ship (screenshot QA of the ALBATROSS, on and in her)

Scene: `tools/scenes/qa_ship.mjs` (parts `QA_PART=fp,seats,inside,deck,ext,sea,sky,ships`; `QA_MOVE=1` leaves the
ship under way). At every first-person spot it shoots and runs a FRONT CHECK: a 9 x 7 fan of rays from the rendering
camera; no person mesh (deck crew, interior crew, soldier, rider, pilot, gunner, crew chief, squad) may be hit within
0.8 m; persons within 1.6 m are logged. Run folders are under `tools/runs/` (not committed).

## 2026-10-25 - The front check never ran (tool)
**Finding**: The checkpoint's `__Q.front()` threw on every call, so every "no person in front" expect had failed
without testing anything (0/52 in the paused run).
**Evidence**: `tools/runs/2026-10-24_14-48-37-qa_ship/log.txt`: `THREE.Sprite: "Raycaster.camera" needs to be set`,
then `Cannot read properties of null (reading 'matrixWorld')`; the run also crashed (Chrome target closed) at 919 s.
**Cause**: `Raycaster.intersectObjects(scene)` reaches sprites / custom objects that cannot be raycast this way.
**Action**: fixed in 97355ea: the check walks the visible meshes and raycasts each in a try/catch (instanced meshes
get a fresh bounding sphere), 0.8 m; the tour runs in parts so no single Chrome session is long.

## 2026-10-25 - The SKY CARRIER helm: two bridges, two wheels, a sailor filling the view
**Finding**: Taking the helm (Tab with the ALBATROSS airborne) drew helm.js's stand-in bridge (deck plates, deckhead,
sills, window posts, a console, a chart table, a second wheel and a telegraph) inside the INTERIORS bridge, which
already has all of these: overlapping floors and consoles, two wheels one behind the other. The camera stood 1.1 m
behind the helmsman's spot, so the lee helmsman at the telegraph took up the right quarter of the view.
**Evidence**: before `tools/runs/2026-10-25_14-53-52-qa_ship/41-fp-sky-carrier-helm.png`; after
`tools/runs/2026-10-25_15-06-34-qa_ship/03-fp-sky-carrier-helm.png` (and `04-...-stbd.png`, `05-...-port.png`).
**Cause**: helm.js predates INTERIORS and always built its own room; its EYE was set for that room.
**Action**: fixed in 97355ea: with an interior bridge, helm.js adds only its console face (on the interior console)
and the lift lever; the interior wheel is its own mesh (`INT.wheel`) that helm.js turns; you stand at the spokes
(EYE_IN), the helmsman steps aside to port (checkpoint 0ba446e) and nobody stands in front of you.

## 2026-10-25 - Interior crew could be walked into / stood in (checkpoint work, verified)
**Finding**: Standing crew on the bridge, flag plot, ready room and FDC were drawn as one merged mesh with no
collision: you could walk into a man and see the inside of his head; the helm put you where the helmsman stands.
**Evidence**: `tools/runs/2026-10-25_14-53-52-qa_ship/` 01-37 (inside part): FRONT CHECK clean at all 22 spots.
**Cause**: crew were decoration only.
**Action**: fixed in 0ba446e (checkpoint): one mesh per man; standing men are solid (0.44 m box); a man whose spot the
camera reaches steps to his `aside` spot or is not drawn.

## 2026-10-25 - Deck crew scattered from a Marine as from a helicopter (checkpoint work, verified)
**Finding**: Every deck crewman within 9 m of the player ran off crouched, whatever the player was in; a Marine on
foot could still meet a walker face to face.
**Evidence**: fp part, 27 first-person deck spots, FRONT CHECK clean (`tools/runs/2026-10-25_14-48-03-qa_ship/`,
under way: `tools/runs/2026-10-25_15-08-28-qa_ship/`).
**Cause**: war.js gave the crew one avoid rule (the rotor downwash) for every craft.
**Action**: fixed in 0ba446e (checkpoint): on foot (1.05 m) or in a vehicle (3.2 m) the crew step aside onto a circle
round you, keeping their pose; the 9 m scatter stays for aircraft.

## 2026-10-25 - USER BUG "a person in front of me" in first person on the ALBATROSS: the Huey's outer troop seats
**Finding**: Getting into the parked Huey's cabin by its cargo door (Y on foot; the nearest door of a Huey on the
deck is a troop seat) put you on the outer end of the troop bench, looking straight into the back of the door gunner
(left) or the crew chief (right), 1.7 m ahead, filling the lower centre of the view. It is the only first-person view
on or in the ship where the tour found a person square in front of the camera after the checkpoint fixes; the other
candidates (the helm, interior crew, deck crew walking into a Marine) are the entries above.
**Evidence**: before `tools/runs/2026-10-25_15-14-55-qa_ship/01-fp-huey-troop-seat-1.png` and `02-...-seat-4.png`
(FRONT CHECK: `crewChiefBody<crewChief<huey` within 1.6 m); after `tools/runs/2026-10-25_15-22-12-qa_ship/01-fp-huey-troop-seat-1.png`
(left door, clear view out over the deck), `03-fp-huey-troop-seat-2.png` (bench, clear to the cockpit, the gunners at
the sides), `06-huey-troop-seat-4-outside.png` (the rider seen in the right door, legs over the sill). Scene
`QA_PART=seats node snap.mjs scenes/qa_ship.mjs`.
**Cause**: seats.js put four places across the bench at x -0.82 / -0.27 / 0.27 / 0.82; hueymodel.js seats the door
gunner and the crew chief at x -/+0.72, inboard of their pintles, 1.7 m forward of the bench - the outer places shared
their line. (Moving the gunners to the real "hell hole" positions does not fit: this cabin has no wells beside the
bench, and a door seat forward of them looks into the rocket pod.)
**Action**: fixed in 063eb46 (seats.js): the outer two places are LEFT DOOR / RIGHT DOOR - on the floor in the
cargo door aft of the gunner / chief, facing out, legs over the sill, as troops rode a slick; the two bench places
stay. The model, the gunners and the guns are unchanged.

## 2026-10-25 - Kneeling deck crew: a leg stuck out level, the other in the deck
**Finding**: The plane handlers and fuel crew kneeling at the wheels (chocks and chains) had one leg straight out in
front at hip height and the other sunk 0.3 m into the deck; the crew walking away from the rotor wash leaned back.
**Evidence**: before `tools/runs/2026-10-25_15-25-09-qa_ship/16-deck-crew-at-work.png` (blue and purple shirts at the
Hornet's wheels); after `tools/runs/2026-10-25_15-32-23-qa_ship/25-deck-crew-at-work.png` (both legs down to the
deck, torso forward).
**Cause**: deckcrew.js kneel used lean +0.3; a + rotation about x tips the body aft, and the legs (one piece each,
0.9 m hip to sole) are posed relative to the lean, so the front leg ended at 1.75 rad - above level.
**Action**: fixed in the next commit: torso 0.25 forward, hip 0.57 m, legs at +/-0.88 rad absolute, both on the deck
(a one-piece leg cannot fold a knee: it reads as a low crouch at the wheel). The wash crouch leans forward too.
