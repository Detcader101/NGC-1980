# Thrust Zarch: The Island War

A browser game in Three.js that mixes *Zarch*, *Thrust*, *Raid on Bungeling Bay* and *Carrier Command*.
You fly a simulated helicopter from the deck of your carrier, the ALBATROSS, across a sea of 17 islands.
The enemy carrier KRAKEN is out there doing the same, and whoever controls the map wins.

![The KRAKEN and the enemy battleship](docs/screenshot.png)

## What's in it

- **Archipelago and fog of war.** You only see what your helicopter, carrier, drones and islands can see. Radar islands see further.
- **Capture islands.** Silence the owner's AA guns, then land on the pad or send a drone. Fortress islands hide a cave: fly down the shaft, Thrust-style, and steal the pod. Every cave is procedurally generated (the same island always has the same cave), and the heavier the fortress, the deeper and more twisted its cave and the more turrets guard it.
- **Economy.** Islands produce fuel and materiel. Spend materiel on capture drones, AA guns, spare helicopters and escort fighters.
- **An enemy commander.** It sends transports to take islands, fortifies, raids your carrier, ships supplies by freighter, and builds a battleship in its factories that hunts the ALBATROSS. Bomb the factories to slow it down.
- **Helicopter sim.** Collective, cyclic and pedals, flight-stick support with calibration, a working Huey cockpit, and a damage model where hits cause failures you can survive and repair.
- **Effects that build up.** Smoke columns, fires, scorch marks, debris and oil slicks stay on the map.

Win by sinking the KRAKEN or taking IRONHOLD. You lose if the ALBATROSS sinks or you run out of helicopters.

## Run it

It's static files with no build step. Serve the `game/` folder and open it in a browser:

```
node tools/serve.mjs          # http://127.0.0.1:8765/
```

Any static server works (for example `npx serve game`). On Windows, `game/start.bat` does the same and opens the browser.

## Controls

| Key | Action |
|---|---|
| Space / Shift, Ctrl / Z | collective up / down |
| W A S D or arrows | cyclic |
| Q / E | pedals (yaw) |
| F / G / B | gun / rockets / bombs |
| R | winch (pick up the pod in a cave) |
| M | command map: click the sea to sail the carrier, click an island to select it |
| 1-4 | send drone, build AA gun, spare helicopter, escort fighter |
| V / C | cockpit view / chase camera |
| H | stability assist on/off |
| J | calibrate a flight stick |
| P | pause |

The in-game help screen has the full list.

## Tests

`tools/` has a headless test harness: Puppeteer drives the game in software WebGL and takes screenshots. See [tools/README.md](tools/README.md).

```
cd tools && npm install && node snap.mjs scenes/war.json
```

`node tools/cavebench.mjs` checks the cave generator without a browser: it prints every island's cave as an ASCII map and
sweeps hundreds of seeds per tier, checking that each cave is connected, wide enough to fly and has its pad, tanks and
pod on solid floors. `scenes/caves.mjs` flies into every cave and screenshots it.

## Credits

Built by Jason with Claude (Anthropic) as an AI pair-programmer. Uses [three.js](https://threejs.org) (MIT), vendored in `game/vendor/`.
