# ngc/ch46fly findings

Player-flyable CH-46 Sea Knight (user: "how do I spawn those in experimental build? i want to fly it").

## 2026-10-25 - Starting point: the CH-46 was AI-only
**Finding:** the CH-46 existed only as a war unit (`units/air/rotary/ch46unit.js`: FM + AI pilot + mission AI + model +
squad), launched by the "1: Sea Knight + 13 Marines" order. The player could only ride in two troop seats by the
ramp (`interiors/seats.js` RIDE craft). No craft def, no cockpit, no engine start (the FM's engines were always on).
**Evidence:** baseline on experimental b8d8b6a: ch46bench 21/21, techbench 95/95, commanderbench 32/32, embarkbench 12/12.
**Action:** new player host (`ch46play.js`, pure), cockpit (`ch46cockpit.js`), craft adapter (`ch46craft.js`); the FM
gets optional engine start / ECL / rotor brake / wheel brake inputs that default to the AI's old behaviour.

## 2026-10-25 - Board order is load-bearing for the commander scene
**Finding:** `tools/scenes/commander.mjs` presses board digits (5, 8) and reads `roster[1]`, `[4]`, `[5]`, `[6]` by index.
**Action:** the CH-46 is appended as the LAST fleet type / roster row (board key 9), not next to the Huey, so every
existing index stays.

## 2026-10-25 - AFCS: two sign / wind-up bugs found by the node bench
**Finding:** (1) at speed the sideslip term pushed the pedal the wrong way: sideslip grew to 12 deg, the pedal saturated
and the aircraft flew crabbed (137 kt at 11 deg beta). (2) the yaw trim integrator wound up through a pedal turn (0.39
vs a trim of -0.03), so after releasing the pedals the nose kept swinging 13 deg and took 10 s to stop.
**Evidence:** tools/ch46playbench.mjs "pedals released: the heading holds" 13.5 deg drift -> 0.3 deg; forward flight now
137 kt, sideslip -0.0 deg.
**Cause:** (1) on the FRD frame a right sideslip needs right pedal (+); the Huey assist's sign was copied with its own
pedal convention. (2) the integrator learned while the pilot commanded the turn.
**Action:** fixed in ch46play.js: +beta, the pedal trim integrator only learns with the pedals free, the pedals feed
forward. Heading capture waits for |r| < 0.9 deg/s.

## 2026-10-25 - The model's windscreen was opaque in front of the pilots
**Finding:** from the new cockpit eye the forward view was a wall: ch46model.js only glazed the upper-corner quads
(qh 2..6); the two big front panels (qh 0..1 between z -6.42 and -5.82) were green skin. From outside it read as a
windscreen because the corners were glass.
**Evidence:** runs/2026-10-25_15-51-10-ch46probe/02-cockpit.png (before), 15-54-25 (after).
**Action:** fixed: those quads are glass now (the AI Sea Knights get the same, more correct, nose); the anti-glare
tip stays black. In first person the glass drops to 0.1 opacity.
