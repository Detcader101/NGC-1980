# ngc/rk-ui findings: the Continuum design system on menus, overlays and the HUD

Branch `ngc/rk-ui` from `ngc/shader-library` (7a62f55). Gated on `RK.on('ui')`; `?rk=0` is the classic look.
Tour scene: `tools/scenes/rkui.mjs` (title, HOW TO PLAY, Huey over sea / land / cockpit, cautions, pause menu and its
confirm step, research, command board, map, Hornet, M60, on foot, health, gear, swimming). Run it per look and size:
`node snap.mjs scenes/rkui.mjs --query '?debug&kb&res=0.45&rk=ui' --width 1920 --height 1080` (`rk=0` for classic).

## 2026-10-27 - How the switch reaches the DOM

**Finding**: the look is pure CSS plus a handful of colour constants, so it can be scoped completely.
**Evidence**: `game/js/renderkit/ngc-ui.css` (all rules under `html.ngc-rkui`), `game/js/renderkit/ngcui.js`
(`RKUI`, `UIC` colours, `applyUI()`), an inline script in `game/index.html` that mirrors `adopt.js`'s `read()` for
the `ui` area so the title's first paint is already right, and `applyUI()` in main.js after the boards exist.
**Cause**: main.js, board.js and techui.js write inline colours and inject their own `<style>`; those stay as they
are and the new sheet overrides them only when `html.ngc-rkui` is set. Inline colours (war line, feed, world tags,
cautions, the tech-tree canvas, the VR HUD canvas) come from a palette object that holds the original hexes with
`?rk=0`.
**Action**: done. No element id, `data-` hook or button changed; added hooks are class names only
(`ngc-tag`, `ngc-rwr`, `confirm`, `ngc-c`, `data-level` on the fuel bar), none styled in the classic look.

## 2026-10-27 - design.css on the whole page would break the HUD

**Finding**: `.rk-ui` sets `box-sizing:border-box` on every descendant and an opaque page background. Put on
`<body>` it would resize every HUD canvas and fixed-size widget that other modules lay out with content-box maths
(radar 150 px + border, medical / inventory grids at 36 px cells, cockpit DOM).
**Evidence**: design.css lines 1-14.
**Action**: `.rk-ui` goes only on the menu roots (`#title`, `#menu`, `#cmdBoard`, `#techBoard`); the HUD and the
health / gear overlays use the same tokens, mirrored on `html.ngc-rkui`, with layout untouched (no change to any
grid, slot or item size in `.ngc-inv` / `.ngc-med`).

## 2026-10-27 - HUD legibility over a bright sky and over terrain

**Finding**: the classic HUD is cyan with a cyan glow; over the 1980 sky (#c8daf0-ish near the horizon) it is soft
and the glow is an effect on vital text. Chalk text needs a backing, not a glow.
**Evidence**: `tools/runs/rkui-before-1280/03-03-huey-sea.png` vs `docs/ngc1980/evidence/rk-ui/`.
Plate `rgba(16,23,25,.8)` over a white sky composites to about #353e44: chalk #e7e9df is ~9:1, muted #a7b4b0
~5.2:1 (the first try at .72 left muted text at ~4.1:1, below AA, so the plate went to .8).
**Action**: quiet charcoal plates behind each HUD group (top-left status, war line, each feed line, bottom-left
telemetry, hint, centre message, caution chips); no glow; numbers in a tabular mono face. World tags keep a 1 px
dark drop shadow only (not vital, and a plate per tag would clutter the view).

## 2026-10-27 - Overlap of the HUD with menus, boards and the title

**Finding**: in the classic look the HUD shows through the title and pause scrims, and the radar-warning scope
(`units/defence/cm.js`, appended after the boards) draws over the command board.
**Evidence**: `tools/runs/rkui-before-1280/01-01-title.png`, `07-07-pause-menu.png`, `10-10-command-board.png`.
**Action**: with the UI on, `:has()` rules hide the flight read-outs under the title, the pause menu and the boards
(only what they cover), and the command board gets `z-index:5` like the research board. The classic look keeps its
behaviour (unchanged by design). Pointer hooks the scenes use (`#fleet [data-research]`, `#fleet [data-command]`)
are only hidden while a board is open, when they are not clicked.

## 2026-10-27 - Pause menu items overlapped in a CSS grid

**Finding**: making `#menuItems` a grid with `gap` let rows shrink below their content inside the flex column with
a fixed height: sliders and notes overlapped the next item.
**Evidence**: `tools/runs/rkui-after1-1280/07-07-pause-menu.png`.
**Action**: block flow with a 4 px margin between items, as the classic menu does.

## 2026-10-27 - HOW TO PLAY collapsed to a bar

**Finding**: the open `<details>` was squeezed to ~12 px: `#title` is a fixed-height flex column and its children
could shrink.
**Evidence**: `tools/runs/rkui-after1-1280/02-02-howto.png`.
**Action**: children `flex-shrink:0`, `justify-content: safe center`, `overflow-y:auto` on the title; with HOW TO
PLAY open (`#title:has(#howto[open])`) the heading shrinks, the pitch and GPU line step out (the first how-to
paragraph repeats the pitch) and the text scrolls inside 40vh.

## 2026-10-27 - GPU HUD / text (createHUDMaterial, createTextLabel) not adopted

**Finding**: nothing in this area is clearly better on the GPU. The world tags are pooled DOM nodes moved by
`transform`, readable over terrain without depth testing; a depth-tested GPU label would vanish behind hills, and the
distance text changes every frame (a canvas-texture rebuild per change). The flight reticle is already a 3D object
in the scene and the first-person dot (`crossEl`) is a 25 px SVG. Cockpit instruments are out of scope.
**Action**: none; revisit if the tags move into XR as world-space labels (where DOM cannot follow).

## 2026-10-27 - Narrow windows (760 x 900)

**Finding**: at 760 px the feed (top 64, right) ran into the widened top-left plate, the hint sat over the minimap
(main.js pins `#hint` at `left:470px` inline, which beats the classic `@media` rule), and on the title / pause pages
the VR entry box covered menu text.
**Evidence**: `tools/runs/rkui-r3-ui-760/03-03-huey-sea.png`, `14-14-foot.png`, `07-07-pause-menu.png`, `02-02-howto.png`.
**Action**: below 1000 px (UI on only): the top-left plate takes the width beside HI, the feed goes under it
(two newest lines), the centre message drops to `max(30%, 272px)`, the war line and the hint stack above the
bottom-left plate (`left:16px !important`), the VR entry moves to the top right on the title and pause pages, and
the title / pause scrims are even (the text column reaches the bright half of the view). The classic look keeps
its narrow behaviour.

## 2026-10-27 - XR spatial panels (IWER, Quest 3 profile)

**Finding**: the panel rasterises the DOM with html2canvas, so the new styles reach VR (custom properties,
`:is()`, `:has()` all resolve because html2canvas reads computed styles of a same-browser clone). The design
system's small print (12 px subs, 10-12 px row notes) is too small on the 2.8 m panel: xr/panel.js enlarges the
classic boards' text for VR, but the new explicit sizes out-ranked it.
**Evidence**: `tools/runs/rkui-xr/02-vr-research-stereo.png`, `03-vr-hands-command.png` (19/19 expects pass).
**Action**: `html.ngc-rkui.xr-layout` rules scale the command / research boards' small print back up. The compact
VR HUD that panel.js paints on its own canvas now uses chalk on charcoal plates without glow (RKUI only).
