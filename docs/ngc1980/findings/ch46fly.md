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
