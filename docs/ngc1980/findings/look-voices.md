# look-voices — completion of checkpoint be546c6

Worktree: `/home/jayjay/thrust-zarch/.claude/worktrees/agent-acb3f3f66119cd838`.
Branch: `ngc/look-voices`, based on `36eb21b`. No merge or push.

## Finding

The checkpoint used unfiltered browser speech with a separate noise bed, and substituted unintelligible babble when
no system voices existed. Neither behavior satisfies the requested audio contract.

## Evidence

The original `voice.js` called `speechSynthesis.speak()` outside the WebAudio graph. Only `babble()` reached
`RadioBed.chain()`. The Web Speech API provides utterances and lifecycle events, not an AudioNode or PCM stream.
The [Web Speech interface](https://webaudio.github.io/web-speech-api/#tts-section) documents that limitation.

## Cause

Putting squelch around an utterance does not band-limit or clip the utterance itself. Browser-owned speech cannot
be captured into WebAudio without a separate capture permission and platform-dependent routing.

## Action

Replaced native playback and babble with our authored text synthesized locally using the PC's already installed
Windows SAPI voices (Microsoft David Desktop and Zira Desktop). `tools/voice-build.mjs` regenerates the asset;
there is no download, external speech service, game recording, or voice pack. Whole phrases and template fragments
are preferred; dynamic names and numbers concatenate generated words, with letters available for unforeseen names.
The generated mono 16 kHz samples use signed 8-bit logarithmic companding, gzip transport, and a bounded decoded
phrase cache. `game/audio/voices/index.json` records source voices, offsets and the packed asset SHA-256.

Normal play requires an available English system voice and a successfully loaded generated bank. Missing voices,
missing assets, unavailable audio or decoder support give silent timed subtitles, including no radio noise.
`voiceschanged` handles delayed enumeration. The explicit `?debug&voices=generated` test mode exercises the bank on
headless Linux; it is not the default fallback. No microphone, speaker capture or additional permissions are needed.

## Finding

Radio processing, voice priorities and open-air acoustics needed to affect actual samples and live positions.

## Evidence

The old engine attenuated utterance volume for a cockpit, but never tested a wall. Radio ducking changed the same
master bus receiving the generated voice. Watchdog completion could leave a native utterance playing beyond its
logged end. The old scene's master-bus peak could be satisfied by rotor noise alone.

## Cause

Separate native speech and effects had no common source lifetime or spatial-processing contract.

## Action

One bounded priority queue owns all speech, intercom and warning sources. Urgent calls interrupt lower priorities;
expired calls drop, future replies cannot block due calls, and pause/OFF disconnect sources and radio tails.
The generated voice bus is separate from effects: engines/guns duck while voice gain stays fixed. A dedicated
voice analyser verifies actual voice output. Radio speech passes through high/low-pass filters, a microphone
presence filter and light saturation. FM has a generated squelch tail; AM and intercom have their own envelopes.

Open-air voices have distance gain, stereo pan and a live low-pass filter. At 5 Hz while speaking, the engine checks
the segment between mouth and ear against world wall/door boxes and carrier interior/bulkhead boxes. Moving out of
range stops the source. This is an inexpensive acoustic approximation, not diffraction, reverberation or a sound
propagation simulation. Carrier coordinates include yaw/heave; detailed roll/pitch acoustic transforms remain a
limitation. Far-away deck PA is spatial, not a global announcement.

## Finding

The checkpoint's phrase variants conflated different meanings and its hooks did not cover all visible crew roles.

## Evidence

Examples: “Roger. Wilco.”; bingo/joker variants in the same category; visual/tally and blind/no-joy interchanged;
arbitrary wind and damage-location reports; plane captains and the carrier tower had no category. A shared effects
shot wrapper could attribute somebody else's gunfire to the Huey gunner. The player had no accepted-reload hook.

Procedure references consulted:

- US Navy, [Radioman 3 & 2, NAVPERS 10228-E (1967), chapter 7, pp. 99–101](https://www.navy-radio.com/manuals/rm32-10228E-1967.pdf):
  ROGER/WILCO meanings, ending a transmission with OVER or OUT, identification and spoken-number procedure.
- NATO's [ACP 125(D) archival record, 5 October 1970](https://archives.nato.int/acp-125-d): establishes the period
  publication; the archive item is correspondence, not a complete procedure manual.
- US Army, [FM 24-18, Field Radio Techniques (July 1965)](https://citizenmilitem.com/wp-content/uploads/2015/02/FM-24-18-Radio-Operator.pdf):
  period radio context. No weapon employment, guidance or lethality modeling was introduced.

## Cause

The original library prioritized variety over semantic equivalence. Some HUD matching lacked the individual
speaker or exact event that caused a call.

## Action

Separated semantic categories and retained conservative period language. Phoenix launches use plain “Phoenix away”
instead of relying on the disputed period meaning of FOX THREE. Calls avoid modern digital-network and
missile-active terminology. Exact battle damage, wind and casualty counts are not invented by random variants.
Ground reports use station identification and appropriate OVER/OUT endings. Fire-team and casualty lines are
self-authored game dialogue in period vocabulary, not claimed verbatim quotations from a field manual. The required
FRAG OUT, RELOADING and CORPSMAN UP calls remain. Full veteran/1980-specific phrase review is not claimed.

Huey chief/gunner, Hornet pilot, Tomcat pilot/RIO and AI escorts, tower, LSO, Air Boss, plane captains, deck and
interior crew, Marine fire teams/corpsmen, command-board controllers, ground crews and nearby civilians have
appropriate event or proximity hooks. Each person has a stable pitch/rate/timbre profile; changing role does not
change identity. Crew voices use their own intercom. The Huey's door-gun trigger now comes from its firing action;
the player's reload call comes from the accepted weapon-action event. Weapons remain game-level call-outs.

## Finding

The checkpoint voice scene had stale setup assumptions and insufficient audio assertions.

## Evidence

The first completion run (`tools/runs/2026-10-28_18-21-12-voices`) failed because `__G.sfx` was not exported, the
opening PA used the stale title camera, and clearance timing could miss lift-off. It was stopped
explicitly after diagnosis; its TargetCloseError is from stopping that browser. The second diagnostic run
(`tools/runs/2026-10-28_18-24-25-voices`) confirmed spatial PA behavior and audio availability but exposed another
fixture parking point that struck deck geometry; it was also stopped. Neither is passing evidence.

## Cause

The checkpoint did not contain a completed, verified voice scene. Its title/start assumptions and general audio
peak measurement were insufficient to prove speech behavior.

## Action

The scene now tests the initial PA against the new-game listener, uses the carrier’s defined helicopter spot, and measures the
voice bus. Additional cases render a radio frequency response and exercise urgent interruption, real source
cancellation, distance/wall updates, stable personas, radio-only mode, zero volume, OFF, queue bounds/expiry and
missing system voices. Final run folders and results are recorded below after validation.

## Finding

The first complete revised scene passed 24/31 assertions, with zero page or console errors, but exposed urgency
and fixture timing problems. It is retained at `tools/runs/2026-10-28_18-31-28-voices`.

## Evidence

Huey clearance/lift/damage, command deployment, Hornet ball/roger-ball/high corrections, real voice output,
non-overlap, radio frequency response, ducking, preemption, OFF and no-voices fallback passed. The Marine squads
did not produce a hostile-shot event during the chosen AI encounter. The wave-off setup placed the Hornet near
sea level before the correction timer elapsed. A short pause-test sentence and the spatial-test sentence finished
before assertions reached them on the slow software renderer.

## Cause

The ground test depended on random terrain sight lines. The LSO's routine correction timer also gated urgent
wave-offs. Test waits track wall time while the software renderer and screenshots can take seconds per frame.

## Action

Wave-off checks now bypass the routine correction timer. The scene positions the approaching Hornet above water
and creates a real hostile projectile, delivering its emitted event through the ground-war hook to make contact
coverage deterministic. This is a scripted encounter, not proof of autonomous combat behavior. Longer generated
test utterances keep audio active through live distance, wall and pause assertions. Short clip endings are no longer
mistaken for cancellation failures. A narrow-door check also caught and fixed an overly broad small-prop exclusion.

`tools/voicebench.mjs` checks asset SHA-256, decompressed sample count, both voices' phrase coverage and index bounds,
then exercises crew, Tomcat, AI pilot, tower, plane captain, Marine, controller and door contracts (16 checks).
`game/dev/voices.html` provides a standalone listening room for subjective review; it explicitly forces the generated
backend, and does not represent the normal no-system-voices path.

## Finding

The user expanded the task to spoken orders, accepting correct military/aviation procedure from any period.
The browser must distinguish a completed command from incidental speech and must not turn a partial transcript
into an order.

## Evidence

The [Web Speech recognition interface](https://webaudio.github.io/web-speech-api/#speechreco-section) supplies final
results, alternatives and error/end callbacks. [Browser recognition documentation](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
notes limited browser support and that Chrome may use a server recognition service. The
[FAA AIM, 4-2](https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap4_section_2.html) emphasizes addressed
calls, concise intelligible messages, push-to-talk discipline and acknowledgements. The dated Navy reference above
supports the full military call and the distinct OVER, OUT, ROGER and WILCO meanings.

## Cause

The game had unit-order APIs and command-board controls but no microphone input, addressed radio roster or strict
transcript parser. Aircraft, ships and infantry have different controllers; an accepted sentence alone cannot
establish that a unit is capable of the requested action.

## Action

Added the RADIO panel and F9 push-to-talk. Its command-net convention is: **called station, THIS IS COMMAND,
one supported order, OVER**. This is a deliberately strict military command net, not a validator of every legal
aviation transmission. Call vocabulary is not limited to 1980; the authored character dialogue retains the earlier
period requirement. Callsigns and supported actions appear on the live roster. Examples:

- `Hotel one, this is Command. Hold position. Over.`
- `Hotel one, this is Command. Defend Sandbar. Over.`
- `Falcon one one, this is Command. Return to base. Over.`
- `Albatross, this is Command. Proceed to Sandbar. Over.`
- `Albatross, this is Command. Radio check. Over.`

Marine squads use existing hold/move/defend orders on their present island. Carrier navigation uses its existing
water-route planner. Airborne AI crews can be recalled through their existing controllers; this does not introduce
new flight-control or weapon-employment procedures. STATUS, RADIO CHECK and SAY AGAIN provide replies without
mutating orders. Successful orders return WILCO/OUT with the addressed person's voice; rejected unit actions return
UNABLE and an explanation. ROGER is not substituted for a promise to comply.

Only final recognition results from a released transmission can dispatch. Low-confidence or differing valid
alternatives, missing station identification, wrong caller, unsupported actions, ambiguous/unknown names, negation,
multiple orders and OVER AND OUT are rejected. Units are resolved again at dispatch time. Pause, focus loss,
hidden-page state, cancel, timeout and microphone/service errors discard pending speech. A cancelled or duplicate
callback cannot execute an order. Output voices are suspended while the microphone session is active.

The mic opens only on explicit push-to-talk. The panel discloses that the browser may send audio to its service;
the game makes no speech-service calls of its own, stores no microphone recording and downloads no recognition
model. Unsupported browsers and denied microphones retain a typed radio-call form using the same validation and
unit-order path. Tests inject a recognition provider; physical microphone quality and remote-service reliability
remain manual checks, not claimed by headless tests.

## Finding

Later runs exposed two more fixture defects and a browser termination, which must not be counted as passing evidence.

## Evidence

`2026-10-28_18-41-46-voices` passed 28/29 checks with no browser errors. Its casualty assertion omitted the valid
“Doc! Doc, over here!” variant. `2026-10-28_18-55-33-voices` passed 10/12 assertions before Chrome closed during an
LSO screenshot (TargetCloseError). That run also contained an expired/unplayed casualty entry, which satisfied the
fixture's log-based early exit but not its later played-audio requirement. The cause of the browser termination was
not established. No other running browsers were terminated to make room for the test.

## Cause

The casualty fixture mixed random combat outcomes, any logged call and actual playback. They are different facts.
Screenshot review also showed the initial collapsed RADIO button covering the subtitle feed.

## Action

The scene now delivers a deterministic field-care callout from the nearest live Marine through the actual event
hook, after clearing fixture chatter; assertions require playback. The label includes the existing DOC variant.
This verifies voice integration, not casualty generation. Moved the RADIO control below the feed and bounded the
open panel's scroll area to the viewport. Final validation below supersedes the failed runs without hiding them.

## Finding

Villagers can share the same doorway, and different vehicles can each have a crew member called “TC.” Neither is
a unique person identifier.

## Evidence

`world/ambient.js` can select the same door more than once when spawning villagers. The old voice key concatenated
the source and doorway. Ground crew HUD rules used the same short IDs across vehicle types.

## Cause

Location and job title were being used as identity.

## Action

Civilian identities now follow the individual entity in a WeakMap; ground crew identities include the vehicle.
Three focused regressions cover shared doorways, stable civilian identity between polls and different vehicle
crews. This final identity fix followed the passing full voice scene; the focused bench, syntax and smoke checks
cover the final source. No speech processing or queue behavior changed in that fix.

## Finding

Validation records and remaining manual checks must distinguish actual audio rendering, scripted game events,
recognition callbacks and human listening.

## Evidence

- Full voices scene: `tools/runs/2026-10-28_19-00-24-voices`, **29/29**, zero page/console errors.
- Speech-command game integration on the final source: `tools/runs/2026-10-28_19-09-02-voicecommands`, **8/8**, zero page/console errors.
- Required smoke scene: `tools/runs/2026-10-28_19-05-27-smoke`, **5/5**, zero page/console errors (before the last CSS-only radio placement adjustment).
- Required syntax check: `tools/runs/check-2026-10-28T19-09-42-229Z`, **544/544** modules on the final source.
- Listening preview: `tools/runs/2026-10-28_19-11-01-voice-preview`, **2/2**, actual PCM and the speaker selector, zero page/console errors.
- `node tools/voicebench.mjs`: **19/19**, including the final identity regressions.
- `node tools/voicecommandbench.mjs`: **38/38** parser, recognition lifecycle and dispatch checks.

## Cause

A screenshot cannot prove spoken intelligibility, and an injected transcript cannot prove microphone accuracy.

## Action

The full scene measures the isolated voice bus (peak 0.1813), zero overlapping utterances and actual source stopping.
Offline rendering measured radio RMS 0.00356 at 80 Hz, 0.0683 at 1 kHz and 0.00702 at 6.5 kHz. Wall and distance
checks inspect live output gain and filter changes. Headless Chrome uses SwiftShader at 45% resolution and mutes
hardware output; no performance or subjective-listening claim is made. The command scene feeds controlled final
recognition results into the real game order path. A real microphone, browser speech service, accents/noise,
headset/XR controls and a veteran phrase review remain manual checks.

Portable report: [crew voices and command radio](../../devlogs/2026-10-28-voices/devlog.html), with reviewed
screenshots, raw successful runs and the three failed diagnostic runs. Its aggregate totals intentionally include
historical failures; the current passing checks are identified in the summary. The final collapsed RADIO button
sits beside the minimap, away from the multi-line subtitle feed; its expanded panel scrolls within the viewport.

Reproduction from the repository root:

```sh
node tools/check.mjs syntax
node tools/voicebench.mjs
node tools/voicecommandbench.mjs
cd tools
CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/voices.mjs
CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/voicecommands.mjs
CHROME_PATH=/home/jayjay/.cache/chs/chrome.sh node snap.mjs scenes/smoke.json
```

## Finding

The initial offline report overflowed a 390 px viewport on a long shell environment assignment.

## Evidence

The first `devlogcheck` passed six checks before the narrow-layout check failed. Inspection isolated the unbroken
`CHROME_PATH=...` token in the reproduction paragraph; the game UI was not involved.

## Cause

The report template wraps ordinary prose but that long token exceeded the mobile content width.

## Action

Split the environment setup from the command in the editorial notes and rebuilt the report. Final offline review
passed **8/8** checks at desktop and 390 px, with valid artifact hashes, decoded images, internal links and no browser
errors: `tools/runs/2026-10-28T19-13-40-287Z-devlog-review`. Both layout screenshots were visually inspected.

## Finding

After the first Opera GX listening session, the user reported robotic, overly loud voices and microphone
recognition stuck at opening. The generated words were audible; that did not qualify their naturalness or the
physical microphone path.

## Evidence

The original builder passed normalized lookup keys to SAPI, deleting commas, stops and exclamation marks.
Dynamic command replies used independent word clips. Person playback ratios could vary roughly 0.77–1.31 before
shout scaling. Default voice level was 8/10 into a 0.5 voice bus, with effects ducked to 55%.
Windows inspection found David and Zira Desktop synthesis voices and the en-US MS-1033-80-DESK recognizer.
Opera exposed a recognition constructor, but the user reported no response/stuck opening; no original browser
error trace survives, so the precise service/permission cause remains unconfirmed.

## Cause

Flattened text and concatenation removed sentence prosody. Large resampling changes altered both pitch and
cadence. The old mix made speech prominent. Native recognition checked constructor existence, but had no short
startup watchdog or independent capture path; an exposed API does not establish a working recognition service.

## Action

Preserve punctuation when generating speech, synthesize common complete acknowledgements and bounded dynamic
calls, reduce fallback join gaps, and keep person pitch within 0.96–1.04. Rebuilt **1,521 clips per voice**, 48.7 MiB
compressed, from the same installed synthesizers. No downloaded voice packs or game recordings. The larger bank
trades download/memory size for fewer joins; less frequent dynamic combinations still concatenate. These are
still Windows desktop synthesized voices, not newly trained neural voices or performed dialogue.

Lower the default to 6/10 and the voice bus to 0.32 (default bus/slider product 0.192 versus 0.4 before filtering),
with less effects ducking (72%). Add a volume slider to RADIO. UHF is 420–2400 Hz; FM 450–2300 Hz; ICS 350–3000 Hz,
with cascaded band edges and a post-clipping low-pass. Values are game tuning, not measured historical radios.
The offline UHF test measured RMS at 120 Hz: 0.000465 versus 0.008898; 6000 Hz: 0.001642 versus 0.014776;
1100 Hz: 0.113018 versus 0.089448, using the same 0.1-amplitude tone and the previous c2ece5a chain.
These are DSP measurements, not a subjective intelligibility or frame-rate comparison.

Add opt-in `--speech windows` to the local server. Browser AudioWorklet captures mono PTT, converts to 16 kHz PCM,
and sends one bounded WAV to the same-origin loopback server. System.Speech recognizes it locally using the live
call grammar plus competing dictation, then the existing strict parser accepts/rejects it. Confidence/word checks,
one-transmission rules, cancellation, late-response rejection and live unit validation remain in force. The server
never opens a microphone; the browser requests permission only on Talk or Check microphone. Temporary WAVs are
removed after recognition/cancellation. No cloud, downloaded model, API key or persistent microphone capture.
Other hosts retain native recognition; its startup watchdog now explains failure after eight seconds.

RADIO shows the selected speech backend, input meter, received text and actionable permission/device errors.
Check microphone obtains permission and immediately closes the stream. Releasing while access is pending cancels
the call and closes any stream that arrives later; no delayed utterance may issue an order.

Primary references: [MDN SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
explains limited support and possible server-backed recognition;
[Microsoft SetInputToWaveFile](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.setinputtowavefile)
and [Choices](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.choices) document the local API.

## Finding

The new offline path has deterministic microphone lifecycle and actual recognition checks; physical input and
perceived naturalness still need the user's listening/speaking confirmation.

## Evidence

`node tools/speechbench.mjs --windows` passed **25/25**: actual installed Windows recognition accepted authored
radio-check/navigation WAVs and the strict parser rejected incomplete calls, missing OVER, wrong caller, unrelated
speech, multiple calls and silence. Lifecycle checks reject late responses after release/cancel/pause and close
late microphone streams. These fixtures use our synthesized speech, not a recording of the user's microphone.
`voicequality.mjs` passed **7/7**, no page/console errors, in `tools/runs/2026-10-28_20-07-29-voicequality`:
real OfflineAudioContext filter measurements, a single-clip acknowledgement, gentler pitch/default volume, and
real AudioWorklet capture/level/track closure using an injected generated tone. Its screenshot was inspected.

## Cause

Automated signal/recognition fixtures can check the code and service, but cannot establish the user's selected
microphone device, room noise, accent, permission choice, or subjective quality of SAPI voices.

## Action

Keep those limits explicit. The first speech bench failed because its temporary fixture script omitted the
per-process PowerShell execution flag; the production service already used it. Fixed the fixture and reran it.
The previous permission-error assertion expected obsolete wording; updated it to check the new actionable message.
Final game regression results and the updated report are recorded below when complete.

## Finding

Cold startup and two test assumptions needed correction during the integrated reruns.

## Evidence

The first full voice rerun (`2026-10-28_20-08-40-voices`) passed 28/29 with zero browser errors. Its failure was
an exact comparison with 0.32: WebAudio stores AudioParam values as floats, unlike the exactly representable old
0.5. The first offline game run (`2026-10-28_20-14-50-offlinevoice`) selected native recognition despite the server
advertising Windows offline. Standalone service discovery succeeded. After adding a bounded discovery retry,
`2026-10-28_20-18-15-offlinevoice` accepted an actual browser-captured synthetic WAV, transcribed it with Windows,
and delivered the live carrier reply. It passed 7/8; the remaining assertion selected the HUD's `data-level`
element rather than the radio meter. No browser errors occurred in these runs.

## Cause

The mixer assertion used exact decimal equality. Early speech capability discovery could time out permanently
under cold game initialization; blocked JSON tasks during software-rendered startup are the likely cause, not a
confirmed fault in the Windows recognizer. The meter assertion used an unscoped selector shared with the HUD.

## Action

Compare audio gain with a float tolerance and log both buses. Retry capability discovery once after yielding;
automated timeout/retry coverage raises the speech bench to **26/26**. Scope the meter assertion to RADIO.
Retain the failed runs in the report as diagnostic history. The browser fixture supplies our generated speech
as a MediaStream; it does not open the user's physical microphone or grant a permission automatically.

## Finding

The user additionally requested a push-to-talk binding. F9 had been hardcoded and unavailable in the flight
controller bindings.

## Evidence

`hotas.js` owns persisted per-device button assignments; older Huey/infantry/vehicle input paths also read raw
Gamepad buttons. Merely adding a PTT action could leave a bound trigger firing or changing throttle as well.

## Cause

Radio keyboard handling was separate from configurable flight controls, and raw gameplay button readers bypassed
named action ownership.

## Action

RADIO now has Bind key, Reset F9 and Bind controller. Keyboard choices persist and reserve the physical key before
vehicle/board handling; letters remain ordinary text inside text fields. HOTAS/gamepad PTT appears as RADIO
PUSH-TO-TALK (HOLD) in Flight Controls, using its existing per-device persistence and conflict reassignment.
A reusable masked pad view reserves the PTT button in raw Huey/foot/vehicle input too, including analog gamepad
trigger throttle. Inventory/medical screens suspend the command net. Combined held inputs send only on the final
release. Blur, pause, controller loss and cancellation discard the unsent call; reconnect/closing controls with a
button already held requires a fresh release/press.

`node tools/pttbench.mjs` passed **23/23**, covering binding persistence, button ownership, combined holds, typing,
reserved browser keys, reset, cancellation, reconnection and throttle exclusion. Existing HOTAS, wiggle calibration
and rocker-countermeasure self-tests also passed. The first integrated binding run used a 600 ms fake-controller
release, shorter than a software-rendered frame; its next press was not a new observed edge. The revised fixture
explicitly polls the real controls and radio update for that neutral state before pressing again. Physical HOTAS
hardware has not been exercised; tests inject gamepad state through the same production controls API.

## Finding

The quieter mix, local recognition and configurable PTT changes passed the final checks for their affected paths.

## Evidence

| Check | Result | Evidence |
|---|---|---|
| Full voice scene | 29/29, zero browser errors | `tools/runs/2026-10-28_20-22-37-voices` |
| Offline browser PTT and bindings | 14/14, zero browser errors | `tools/runs/2026-10-28_20-34-07-offlinevoice` |
| DSP and AudioWorklet | 7/7, zero browser errors | `tools/runs/2026-10-28_20-07-29-voicequality` |
| Smoke | 5/5, zero browser errors | `tools/runs/2026-10-28_20-36-20-smoke` |
| Native/typed live Marine commands | 8/8, zero browser errors | `tools/runs/2026-10-28_20-38-20-voicecommands` |
| Syntax | 553/553 | `tools/runs/check-2026-10-28T20-34-14-773Z` |
| Windows recognition/lifecycle | 27/27 | `node tools/speechbench.mjs --windows` |
| PTT binding/ownership | 23/23 | `node tools/pttbench.mjs` |
| Existing HOTAS checks | Passed all three groups | `node tools/hotas-selftest.mjs` |
| Parser/native lifecycle | 38/38 | `node tools/voicecommandbench.mjs` |
| Generated bank/hooks | 19/19 | `node tools/voicebench.mjs` |
| Offline report | 8/8, desktop and 390 px | `tools/runs/2026-10-28T20-40-27-367Z-devlog-review` |

The full voice run predates the final PTT binding changes; the later integrated binding, smoke and Marine command
scenes cover those changes. DSP capture predates minor mic cancellation/input UI edits; the final lifecycle bench
includes cancellation before AudioContext resume, ensuring a released call cannot open a late permission request.
The latest RADIO, listening-preview and Huey screenshots were visually inspected. No live-user microphone or
physical controller input was collected by the tests.

## Cause

Separate signal, recognizer, input and gameplay tests are needed to distinguish audible PCM, real transcription,
correct radio grammar, control ownership and human listening/device qualification.

## Action

The updated [portable voice/microphone report](../../devlogs/2026-10-28-voice-tuning/devlog.html) contains the passing
runs and the corrected historical failures. Its aggregate failure count intentionally includes diagnostic history.
The same worktree is served on port 8826 with `--speech windows`; use RADIO → Check microphone once, then hold the
bound key/button until LISTENING, speak a complete call, and release. F9 remains the default and can be rebound.

## Finding

The command radio needed to drive the sandbox's actual support systems, and dynamic speech still sounded assembled.

## Evidence

The previous net exposed carrier movement, squad movement and a few recall/status calls. Its portable audio bank used
David/Zira fragments for unanticipated replies. This PC's installed WinRT speech engines additionally expose
Microsoft Mark; a locally generated complete controller line was produced in about 0.6 seconds in the focused probe.
`livevoicebench.mjs --windows` passes 25/25 including all three installed engines, normalization, cancellation and
static-host discovery. `radionetbench.mjs` passes 37/37; `radiooperationsbench.mjs` passes 46/46.

## Cause

Browser speech synthesis cannot provide its utterance as a WebAudio node. The board's existing controllers also have
different contracts: CAP/troop lift charge themselves, while raw heavy-drop creation does not consume reserves or
sortie materiel. A superficial voice-command wrapper would either give away vehicles or misreport dispatch as success.

## Action

Added an opt-in local whole-utterance PCM service under the existing `--speech windows` flag. Stable speaker identities
select installed David/Mark/Zira, with restrained cadence and pitch applied during synthesis instead of changing
playback speed. Complete lines use the existing quiet filtered audio path; urgent calls retain immediate bank fallback.
No downloaded voice packs, neural models, external synthesis service or other-game audio is used. These are still
Windows synthetic voices; waveform tests do not qualify human listening preference.

The radio now addresses Air Boss, Transport, Supply and Operations for CAP, Marine lifts, jeep/truck/APC drops,
AA construction, replacement reserves, research and Huey field support. Existing research/resource/reserve/ownership
checks remain authoritative. Resource requests and carrier courses require readback confirmation, revalidate live
state/cost at execution, reject duplicate confirmation, expire after 45 seconds and cancel on pause. SAY AGAIN repeats
only the station reply. Missions track actual controllers, including losses and refused/aborted jobs.

Live squads accept formation, cease fire, resume fire, movement, rally and reports. Move now uses the Marine AI's
`take` objective so arrival is recognized. Contact reports use squad perception memory; stale reports are labelled
last-known. Named map points are game map annotations, not a claimed MGRS/navigation system. Squads cannot walk
between islands. The workflow is intentionally a bounded game command net, not a full doctrinal radio simulator.

Procedure references: [USMC radiotelephone lesson](https://www.trngcmd.marines.mil/Portals/207/Docs/FMTBE/Student%20Materials/FMST/Block3/FMST%20306%20SO.pdf)
for OVER/OUT, SAY AGAIN, READ BACK and radio checks; [USCG radiotelephone handbook](https://www.cisa.gov/sites/default/files/publications/CGTTP_6-01_1B_Radiotelephone_Handbook.pdf)
for proword meanings. The user permits player commands from any period; authored period crew calls remain unchanged.
The audio API is documented by [Microsoft](https://learn.microsoft.com/en-us/uwp/api/windows.media.speechsynthesis.speechsynthesizer).

## Finding

The radio panel needed to become the main command workflow without burying the microphone behind long lists.

## Evidence

`tools/radiodeskbench.mjs` passed 16/16 with zero browser errors at desktop and 390 px. Its four screenshots were
inspected. A full-game readback screenshot shows the same amber confirmation card, station/message/destination
selectors and persistent PTT footer over the carrier view.

## Cause

The earlier panel combined all station orders, destinations, microphone setup and bindings in one scrolling column.
The old Backslash shortcut still opened direct deployment, which bypassed the new radio workflow.

## Action

Added Orders, Missions, Traffic and Settings pages, an assisted full-call composer, explicit readback controls,
visible refusal history and a persistent PTT/status footer. Backslash opens the radio; the Fleet board remains a
separate direct-control handoff. Microphone permissions, input level, keyboard/controller binding and volume live in
Settings. PTT can operate with the desk closed and shows compact listening/transcribing status.

## Finding

Integration diagnostics exposed an unadvertised audio endpoint request and a test that confused passive income with
command spending.

## Evidence

The first full-game radio run (`2026-10-28_21-26-12-radioops`) requested `/__voice` on the harness's static server and
received 404. The next run also caught an incorrect fixture keyboard-call argument order. The complete diagnostic run
`2026-10-28_21-29-20-radioops` passed 10/13 with zero browser errors; three currency assertions compared values across
rendered frames while island production was adding materiel. The readback and actual Tomcat launch were present.

## Cause

The harness's internal static host does not use `tools/serve.mjs`. It has build metadata but no optional speech
endpoint. The live economy keeps running while the command desk is open, as intended.

## Action

Whole-line voice discovery first checks `/version.json` for the explicit speech capability. Static hosts make no
voice endpoint request. The currency fixture captures before/after balances synchronously around the actual receive
function, measuring command costs separately from passive production. Historical runs remain available as diagnostics.

## Finding

The first-person rig had real attachment and pose defects, and the figures' clothing still read as separate hard
segments. Higher polygon counts alone would not correct either problem.

## Evidence

The matched `firstperson-before` fixture recorded wrist/cuff gaps of about 10.8 cm with the M16/M203 and 19.7 cm
with the M60. The revised Node bench exercises 882 weapon, action, stance, overlay and degenerate poses with a
maximum cuff endpoint error of 2.83e-16 m. It also checks closed palm/finger surfaces, morph topology, left/right
support orientation, sleeve taper and finite rotations. The hand diagnostic exposed detached fingertip nails;
the final geometry embeds thin nails along the actual distal finger surface instead of assuming a capsule radius.

The people bench checks 192 walking/crouching phases, foot support, stance/seated continuity, floor clearance,
skinning weights, geometry budgets and the lightweight stand-in. Infantry hit/pose checks remain 90/90 and the
ground unit checks 15/15. The detailed figure is 25,660 triangles and the squad figure 10,616, each 29 meshes;
the earlier figures were 24,680 and 10,238 triangles respectively. This is about 4% more geometry, not a measured
performance improvement. Runtime images and motion are reviewed separately from these numerical assertions.

## Cause

The old arm solver clamped the two-bone chain without moving its detached hand target; support grips reused a
single orientation across different weapons. Sleeve taper was reversed, and body-overlay exit discarded its
previous pose before blending back. Figures used rigid garment pieces, disconnected facial forms and lingering
state from previous seated/casualty poses. Per-triangle camouflage made mesh structure visible through the paint.

## Action

Added weapon-specific handed grip frames, a cuff-connected arm solve with forearm roll, rounded closed palms and
fingers, continuous open/grip morphs, smoother stance and low-ready transitions, and stable damped weapon inertia.
Ladder, swimming and self-aid exits retain their last body pose during the return blend. The original weapon,
sight, reload, hitbox and controller contracts remain in use.

Rebuilt the nearby figure's clothing as original skinned geometry, reshaped the face and M1 helmet, improved gait
and seated/stance transitions, and corrected prone elbow/floor clearance. Lightweight Marine states reset cleanly
between sitting, crawling and standing. One shared original 512 px data texture supplies continuous camouflage,
cotton weave, skin grain, webbing and weapon finish detail; coordinates stay in the authored/rest pose under
animation. Lower detail and the legacy Lambert path remain available. No downloaded character assets, voice packs,
or other-game art were introduced. This pass improves the existing procedural models; it does not establish visual
parity with Arma Reforger or Battlefield 6.

## Finding

Independent final review found mission completion errors and a full-squad formation error that short examples missed.

## Evidence

The actual carrier controller retains `goal` after consuming `path`; a watcher waiting for a cleared goal could
never finish. An uncentered thirteen-man column had its average movement destination behind the squad. Roster
recall acknowledged immediately while the aircraft was still airborne. Field support could finish with only one
surviving crew member delivering 20 fuel, so inferring its outcome from fuel above 50 was incorrect.

## Cause

Status adapters initially inferred controller outcomes from convenient fields rather than each controller's real
lifecycle. A five-man formation test did not expose the offset error in the normal thirteen-man Marine squad.

## Action

Carrier completion now requires its original goal, a consumed path, proximity and low speed. Column slots are
centered around the advancing squad destination. Aircraft recall stays active until recovery, pilot takeover or
loss. Field-support requests retain the exact drop mission and report its actual ended/fixed/arrived flags.
Duplicate active orders do not create new watchers; immediate movement tasks share the bounded task accounting,
while hold, cease fire and reports remain available. Regression coverage includes retained carrier goals,
superseded courses and a full thirteen-man column.

## Finding

The combined final browser process stopped before completing the first-person capture.

## Evidence

The process exited with signal 15 after the completed voices29/29, smoke5/5, offlinevoice14/14 and livevoices8/8
runs. The next scene stopped after its twentieth screenshot and wrote no `result.json`. Its available log contained
no game exception. Earlier completed runs remain valid; the interrupted scene is not counted as a passing run.

## Cause

The termination source was not established. It was a process interruption, not an observed assertion failure.

## Action

Preserved its partial screenshots/log as `firstperson-interrupted` and resumed visual checks as individually launched
processes. The game source stayed frozen. Only the completed replacement capture is used for the paired comparison.

## Finding

The final people clip records a shorter animated interval than its eight-second wall-time capture window.

## Evidence

`people-after` passed its runtime nonblank check with zero browser errors and saved 17 views. Its clip encodes
4.879 seconds. Twelve decoded saved frames and playback were inspected: walking, a return to standing and the
start of lowering stance are visible. The complete stance cycle is not present in that saved interval.

## Cause

Software rendering and native screen recording do not guarantee one captured frame per requested frame or equal
encoded/game/wall durations on this shared host.

## Action

Limit the motion claim to the recorded interval. Keep the independent 192-phase pose/support checks and the fixed
crouch/prone/seated screenshots separate; do not present them as proof that every intermediate animation frame was
observed. No FPS or hardware/VR claim is drawn from this capture.

## Finding

The short first-person frame sample is substantially slower than its earlier baseline, but the host was not isolated.

## Evidence

The replacement capture measured about 98.3 ms mean and 264.3 ms p95 for 30 SwiftShader frame intervals, versus
about 22.7 ms mean in the earlier fixture. Read-only process inspection found six other simultaneous `snap.mjs`
runs owned by unrelated worktrees. This team's captures were serialized. No unrelated processes were stopped.

## Cause

The shared workload is an uncontrolled variable; the new material shader also performs additional texture sampling.
The available timing cannot distinguish their contributions or establish hardware GPU performance.

## Action

Preserve both raw samples and identify the unisolated host in the report. Do not claim a speedup, dismiss the slower
sample, or present it as a quantified code regression. Low-detail and legacy material paths are separately checked;
a controlled hardware comparison remains future performance qualification.

## Finding

The first-person motion recording also retained only part of its scheduled action sequence.

## Evidence

`firstperson-after` completed 25 stills and 7/7 assertions with zero browser errors. `firstperson-motion` passed its
finite-transform check and saved an eight-second wall capture as 2.239 seconds of video. Twelve decoded saved
frames show early ready/aimed/return poses; the final screenshot shows that the later pistol draw completed in the
simulation. Self-aid and the draw are not present in the retained clip. Extreme hand closeups still show simplified
fingernail caps and stylized anatomy.

## Cause

Native recording lost the later interval under this software-rendered workload. The separate decoder's playback
probe ran near EOF after seeking its last sample; its false advancement result does not establish a broken clip.

## Action

Keep the saved interval and label its limited coverage. The portable-report check separately seeks to the midpoint
and verifies playback. Use the in-game Marine scene and fixed pose checks for their stated scopes, without claiming
that a short clip proves every transition. Preserve the remaining nail/anatomy limitation instead of calling it
photorealistic.

## Finding

The original long Marine fixture timed out waiting for a 40-second treatment while the shared software renderer
advanced only a few simulation seconds per minute.

## Evidence

The first self-aid screenshot displayed 1/40 seconds; after two long captures the HUD showed 5/40. The subsequent
wait timed out, with no completed dressing. Ladder and swim pose checks still passed. The run was deliberately
stopped after about 573 wall seconds to replace its timing-dependent path; the resulting TargetCloseError is from
that stop. `marine-polish-slow-diagnostic` records 6/9 assertions and the interruption, not a passing result.

## Cause

A wall-time stall fallback in the harness can expire before the medical simulation completes under severe load.
The visual capture overhead and unrelated browser workloads made this fixture unsuitable for checking elapsed
treatment time on this host.

## Action

Added `marinepolishfocused.mjs`, which imports the original scene and retains its gameplay assertions while keeping
four relevant screenshots. Before the completion check, it advances up to 45 simulated seconds through actual
`foot.update(1/60, ...)` calls; it never assigns health, treatment completion or bleeding outcomes. The unchanged
assertion still requires the real medical simulation to finish and reduce bleeding. The fixture fingerprints its
imported source and labels the timing policy. This checks integration, not normal wall-time treatment duration.

## Finding

The live ladder view exposed a hand-profile regression that weapon-only preview images did not show.

## Evidence

The ladder uses a closed hand, but its shape inherited the current weapon profile: a wide left support grip and
an extended right trigger finger. Standalone reproduction measured less finger curl on the wide profiles even
though the open-hand morph was zero. This was a shape-selection problem, separate from wrist/cuff attachment.

## Cause

Per-weapon grip sizing also affected body overlays. A rifle/launcher support radius is unsuitable for a ladder rail.

## Action

Give climbing a dedicated small closed grip with no trigger-finger extension, independently of the carried weapon.
Validate it against wide support profiles and in the actual carrier-ladder scene. World rail contact remains an
authored pose rather than a general hand-placement solver.

## Finding

The first focused Marine run completed self-aid, ladder and swim checks but its grenade fuse wait also expired
before enough simulation time had elapsed.

## Evidence

`marine-polish-fuse-diagnostic` passed 8/10 with zero browser errors. The live grenade was correctly dropped with
3.87 seconds left; the 20-second wall fallback elapsed before the fuse completed under the same slow renderer.

## Cause

The shared-host timing problem also affects shorter simulation timers. A wall-clock wait does not establish that
the corresponding amount of game time was simulated.

## Action

The focused fixture now steps the actual Marine/grenade update for up to six simulated seconds before the unchanged
explosion assertion. It never assigns the explosion count or detonation outcome. The earlier failed run remains
in the evidence bundle. The fixture also avoids reloading an already-open identical starting URL.

## Finding

The first field-support integration fixture transmitted before the teleported Huey registered as landed.

## Evidence

`radio-recovery-landing-diagnostic` passed 6/10 recorded checks with zero browser errors. The first request was
rejected and its dependent mission checks failed; the later cancellation and failed-delivery cases passed.

## Cause

The fixture changed the helicopter position and immediately transmitted without allowing the actual physics tick
to establish landing/service state. The production request correctly requires a landed helicopter.

## Action

Wait for `H.landed && !Z.svc` before issuing the first request. The fixture uses actual requests and drop-state
objects, but scripts terminal mission flags to isolate completion/cancellation/failure reporting from fuel level.
It does not claim to fly a complete resupply sortie. Retain the diagnostic alongside the final run.

## Finding

The final timer corrections exposed a separate ladder capture that assumed a wall-time pause finished its pose blend.

## Evidence

`marine-polish-ladder-diagnostic` passed 8/9 with zero browser errors. The ladder was engaged and the overlay
mode was correct, but its blend was only 0.4 when the original fixed 1.2-second pause ended. Treatment and the
actual grenade simulation both completed correctly.

## Cause

The animation advances in simulation time. On this host a fixed wall-time pause is not a reliable readiness check.

## Action

Wait for the actual ladder blend to exceed 0.9 before retaining the original assertion and screenshot. This does
not assign animation state or weaken the asserted pose; the failed timing assumption remains in the report.

## Finding

The completed pass combines radio operations, command UI, local complete-sentence speech and procedural infantry improvements.

## Evidence

Final required voice and smoke scenes pass 29/29 and 5/5 with zero page/console errors. The syntax check passes
580/580 modules (`tools/runs/check-2026-10-28T22-47-59-292Z/summary.json`); the two later fixture-only readiness
edits also pass `node --check`. First-person geometry/transition coverage is now 886 passing cases, including the
independent rail grip. Radio net/AI passes 56/56, operations 46/46, desk layout 16/16, and actual main.js field-support
reporting 9/9. Offline microphone input passes 14/14 using a synthesized MediaStream through the real capture path;
complete local sentence playback passes 8/8. GPU material tier checks pass 11/11.

## Cause

Radio requests must reach existing resource, research and unit controllers, and their ledger must follow actual
mission state. Speech input needs a local service on this Opera/Windows setup; the browser's native synthesis
cannot supply PCM to the radio chain. First-person and squad geometry need coherent attachment and poses rather
than more disconnected decorative parts.

## Action

Retain the reviewed before/after captures, short saved clips, raw checks and failed diagnostics in the
[portable radio and infantry report](../../devlogs/2026-10-28-radio-infantry/devlog.html). The radio/voice/material
checks and paired weapon captures precede the final narrow ladder-only morph correction; the 886-pose regression
and final in-game Marine capture cover that correction. Final game fingerprint: `8d873c7eec457df0a5cc4dd5cf4f5967916b3bac68b8e391b690866d30ab19c6`.
Physical microphone/HOTAS use and subjective listening remain manual checks. Figures remain stylized procedural
assets. Shared-host SwiftShader timing is not a controlled hardware performance result. No merge or push.

## Finding

The Marine injury fixture can select a longer medical action than the initial fixed-step budget assumed.

## Evidence

The next run selected an arterial leg injury and a 75-second action; 45 simulated seconds correctly left treatment
in progress. The run was deliberately stopped, then its detached harness process was terminated. Its two saved
images remain in `tools/runs/marine-polish-duration-interrupted`; it has no completed result and is not counted as
a passing run or included in the report totals. Detached-frame errors followed the deliberate stop.

## Cause

The original injury is randomized, so a fixed 40-second dressing assumption does not cover every selected action.

## Action

Derive the simulation budget from the actual `M.action.T`, with a 180-second upper bound, and stop stepping as
soon as the real action finishes. No medical result is assigned. Retain all original assertions and only the two
remaining ladder/swimming screenshots; earlier captures already cover the self-aid pose.

## Finding

The final focused Marine integration check passes all retained gameplay assertions.

## Evidence

`tools/runs/marine-polish-final`: 9/9 assertions, zero page/console errors, and an unchanged game fingerprint from
start to finish. Reviewed the final ladder and swimming images. Self-aid completed through the production update,
bleeding decreased, the ladder hid the weapon, the swim overlay opened the hands, and the dropped grenade completed
its actual fuse. The ladder hand profile no longer inherits a weapon-specific trigger finger or wide support grip.

## Cause

Checking actual simulation/animation readiness removes the fixture's dependence on shared-host wall-time stalls.

## Action

Use this completed run as the final integration evidence. Keep earlier diagnostics separately labeled. Hand-to-rail
alignment is still an authored approximation, and the screenshot catches one hand below the frame during its climb
phase. No claim of a physical contact solver, photorealistic anatomy or full AAA animation quality.

## Finding

The portable report exposed long-path text overflow at phone width.

## Evidence

The first report review passed eight checks, including both offline clips, but measured 433 pixels of document
width in a 390-pixel viewport. DOM text ranges identified a long worktree path and an unbroken pose-category label;
the benchmark tables already had working scroll containers.

## Cause

Report prose/list text lacked the path-wrapping rule already applied to code and provenance fields.

## Action

Allow long words and paths to wrap in report paragraphs/list items, regenerate the artifact and repeat the report
review. This is a report-generator CSS fix; the production game source is unchanged.

Final portable-report review: 10/10 checks pass, including artifact hashes, decoded images, offline seeking/playback
of both clips, links, desktop and 390-pixel layout, and zero browser errors. Desktop/mobile screenshots were
inspected in `tools/runs/radio-infantry-report-final`. The report generator also passes `node --check`.

## Finding

Claude's current integration work and Codex's completed radio/infantry pass have overlapping figure files.

## Evidence

Read-only audit on 2026-10-29: `ngc/look-voices` at `9dbdb39`, `ngc/shader-library` at `f8abdbb`, common ancestor
`36eb21b`; main remains `81ffeef`. Both histories change main, rotary figures and infantry hand/model files.
Claude has independently integrated crowd/LOD, rendering and XR camera corrections. No integration was performed.

## Cause

The user's expanded infantry scope crossed the original look-voices/look-people workstream boundary. A shared
mailbox and explicit ownership acknowledgement are needed before more edits to those files.

## Action

Created `/home/jayjay/thrust-zarch/.git/agent-chat/CHAT.md`, shared by all worktrees, and posted the completed work,
evidence, overlaps and request `CDX-20261029-001`. Added `docs/ngc1980/COORDINATION.md` for future sessions.
Claude's ACK is pending; no task split or integration authority is presumed. Active sessions must poll the file.

## Finding

Claude is the user-designated project lead and requested reconciliation of the radio branch with its tested rendering base.

## Evidence

Shared mailbox `CLD-20261029-001` directs a merge of `f8abdbb` into `ngc/look-voices`. `CLD-20261029-002` requires
one look-people SDF hand path and one default `attachMarine()` body pipeline, with Codex's behavior ported onto them.
It accepts the radio/input/event/mission/server preservation checklist and sets a 606-diagnostic type ceiling.
The merge changes only the assigned branch; Claude retains review and integration into shader-library.

## Cause

The two branches independently changed hands and people after `36eb21b`. The old Codex anatomical builder used
BufferGeometry/Euler arguments that are incompatible with Claude's SDF recorder, and its weighted body would be
bypassed by the newer default body selector. Mechanical conflict resolution would lose behavior or break geometry.

## Action

Preserve the LP primitive descriptors and welded SDF surface. Bind a relaxed hand surface to its primitive frames
using smooth-union weights, then cache matching grip/open/rail targets for GPU morphing. Keep profile/wrist metadata,
IK, socket frames and pose blends; use Claude's detailed weapon geometry. Preserve attachMarine, baked crews,
instanced crowds and LODs; port gait/stance/reset behavior and remove the superseded humanmesh helper. Restore the
original figparts diagnostic body rather than attaching two body renderers. Raise the prone pelvis from .14 to .195 m
to clear the LP belt pouches. These deformations remain authored approximations; visual checks are required.

The typed main debug bridge retains sfx, MERGES and RKLOD. Radio/PTT updates still run outside play; mission outcomes,
GW.onEvents, crafttomcat.D.A, persistent crew records and the XR matrixWorld read are preserved. The server retains
both local speech and desktop/XR benchmark routes. New typing uses real callback/option contracts and DOM narrowing,
without a baseline increase or suppression. A parser-error-only type run is not accepted as semantic validation.

## Finding

The first merged figure capture passed its automated assertions but exposed a thumb deformation defect visually.

## Evidence

`tools/runs/radio-merge-figures` passed 9/9 assertions and produced 17 images without browser errors. In
`03-m16-trigger.png`, an apparent floating cap above the support handguard projects to the left thumbnail.
Its independent target frame differs by 7.44 mm from the distal-phalanx deformation of the same source point;
ordinary fingernails differ by only 0.03–0.21 mm. LAW shows the same thumbnail issue at 7.48 mm. The hand remains
one connected mesh, so connectivity and finite-transform checks alone did not catch this visual defect.

## Cause

The mapped SDF targets independently transform the nail primitive, allowing its local roll and translation to
diverge from the finger segment underneath it. Weapon occlusion makes the displaced surface look detached.

## Action

Bind the nail region to its distal phalanx within the existing welded SDF path. A regression check compares nail
triangle winding with the transformed distal surface for both hands, three grip radii and trigger on/off.
Before correction, 5–6 thumbnail triangles per checked hand/profile folded backwards; after correction none do,
and the minimum normal agreement improves from approximately -0.98 to +0.9967. Keep the original diagnostic
images and inspect a fresh capture before accepting the correction. No second visible hand or broader
weapon/character redesign is introduced under Claude's ownership.

The fresh `radio-merge-figures-final` capture passes 9/9 with stable source provenance, but the cap-like silhouette
remains. Exact-camera CPU rays show the exposed thumb tip 1.4 mm ahead of the M203 furniture and adjacent thumb
surface hidden 18.7–34.8 mm behind it. Double-sided rays agree. Independently remeshing the target LP primitives
reproduces these depths within 0.14 mm, separating this descriptor/socket intersection from the corrected
triangle-winding fault. The visible grip problem is **not fixed**. `CDX-20261029-009` asks Claude, as figure owner,
to direct a proposed M203-specific support-thumb curl beneath the upper handguard within the same SDF system.
Other reported fit limits are M60 support centred 30 mm ahead of the forearm and LAW thumbs partly covering the
lower reticle. These are recorded for lead review, not presented as completed AAA hand polish.

## Finding

The first required voices run passed its behavior checks but failed the capture's source-provenance gate.

## Evidence

`tools/runs/radio-merge-voices/result.json` records 29/29 passing assertions, no console errors and the sole error
`Game source changed during this run`. Its starting game hash is `a0e1850f87fe2cd93bc6b47137e783afa6d781cc7796983329811693454430ef`;
the ending hash is `3e7f8bfa87785914b5f0264d11d9c2db8c0c5e38ff39d78a0408cf8293aac3a0`. Recomputing the latter
file inventory with the unstaged deleted `humanmesh.js` sentinel exactly reproduces the starting hash.

## Cause

Staging the already-deleted helper during the run removed its path from the harness's Git-based file inventory.
This changed the fingerprint without changing served game bytes. The strict provenance gate correctly rejected
the run; its generic "page errors" summary includes this harness error, not a JavaScript exception.

## Action

Retain the rejected run as a diagnostic and rerun required voices after all game edits and deletion staging are
finished. Keep the game source and file inventory frozen during accepted captures. The completed radio DOM
fixture separately passes 16/16 checks, with inspected desktop and 390 px layouts and no microphone access.

## Finding

Claude directed a further bounded grip correction after reviewing the remaining fit limitations.

## Evidence

`CLD-20261029-003` requests an M203 support-thumb curl below/along the upper handguard, an approximately 30 mm
rearward M60 support-hand offset and LAW thumbs clear of the aim sight. It requires the same SDF system, no
weapon geometry changes, exact first/third-person close-ups, the pose bench and fresh smoke/voices runs.
The preceding frozen source passed voices 29/29, smoke 5/5 and figures 9/9 without runtime or console errors.

## Cause

Detailed weapon furniture and the retained hand/socket descriptors need explicit fit review. First-person
profiles do not automatically affect third-person: the LP body caches `tpHand` surfaces with open/grip states,
while its poser uses raw weapon anchors and separate wrist rotations.

## Action

Implement the directed first-person profiles within handkit/handposes/viewmodel and preserve weapon geometry.
Add deterministic weapon-local third-person close-ups to the people preview and a separate capture fixture.
Record first- and third-person outcomes separately. Any correction requiring weapon geometry is left as an
explicit open item, following Claude's direction, rather than expanding the work beyond the agreed scope.

## Finding

The directed first-person profiles improve the close-ups, while the separate third-person grips remain OPEN.

## Evidence

`radio-merge-profiles-final` passes 9/9 with game hash
`2c86e9b56cba59d6cba5f5ec6fa7d99d81093a275448f18325f19f493208cb97`. Inspected FP images 01–11 show the large
M203 support-thumb cap removed and the LAW reticle fully clear. The M60 support centre moved 30 mm rearward
to z=-.255 m, at the forearm's front lip. Small M203 fingertip slivers and imperfect M60 furniture contact remain.
The 886-pose bench passes including deformed thumb clearance and nail winding, with maximum cuff error
2.33e-16 m. Syntax passes 609/609; semantic typing stays 578/606 without a baseline change.

The separate `radio-merge-grips-tp` run passes 9/9 structural/camera checks, but visual review records four OPEN
fit cases. Paths are relative to this worktree:

- M203 rifle mode: ribs cut through the support palm —
  `tools/runs/radio-merge-grips-tp/01-tp-m203-rifle-support.png`.
- M203 grenade mode: palm intersects magazine and right hand remains at rifle grip —
  `tools/runs/radio-merge-grips-tp/02-tp-m203-gl-support.png`.
- M60: forward support around folded bipod, fingers hanging below —
  `tools/runs/radio-merge-grips-tp/03-tp-m60-support.png`.
- LAW: palms intersect tube/sling and do not wrap it convincingly —
  `tools/runs/radio-merge-grips-tp/04-tp-law-support.png` and `05-tp-law-trigger.png` in that folder.
  `06-tp-law-sights-oblique.png` shows a clear oblique sight frame, not an eye-line reticle test.

## Cause

The third-person LP body uses its existing static hand surfaces and raw-anchor wrist targets. The first-person
thumb/socket fixes do not change that independent pose contract. Structural assertions establish a valid model
and camera, not visually correct contact.

## Action

Claude's `CLD-20261029-004` explicitly directs completing this frozen merge first, listing these cases OPEN and
posting the tested commit for integration. Third-person fitting is a separate follow-up after that handoff:
per-weapon wrist offset/rotation to a local grasp centre, GL trigger placement, M60 forearm and LAW tube contact;
preserve raw anchors, LP geometry, crew/crowd behavior and the 606 type ceiling. At most per-diameter profiles
may be added within the same SDF cache if needed. No TP production pose or geometry is changed in this merge.

## Finding

The final frozen merge passes the required voice and smoke scenes and live command/recovery checks.

## Evidence

All final game captures share hash `2c86e9b56cba59d6cba5f5ec6fa7d99d81093a275448f18325f19f493208cb97` and
unchanged start/end provenance: `radio-merge-voices-profiles` 29/29, `radio-merge-smoke-final` 5/5,
`radio-merge-operations` 13/13, `radio-merge-recovery` 9/9, `radio-merge-profiles-final` 9/9 and
`radio-merge-grips-tp` 9/9 structural checks. No runtime or console errors. The separate radio desk passes 16/16.
Node evidence records syntax 609/609, types 578/606, poses 886, people 7, material modes 4 (60 weapon states),
server 12, PTT 23, parser/lifecycle 38, radio net 56, operations 46, bank/hooks 19, recognition lifecycle 18,
local synthesis 21 and HOTAS 3 groups. The inherited detailed-weapon tuple/spread diagnostic remains; the project
is not type-clean. No new physical microphone, Opera listening, HOTAS or headset result is claimed.

## Cause

The reconciliation preserves the radio and server contracts while porting figure behavior onto the chosen LP
pipeline. Structural, pose and audio tests cover different properties; visual review still identifies the
explicitly open TP grip fits and small remaining FP contact imperfections. Shared-host SwiftShader timing is
unsuitable for a performance improvement claim.

## Action

Preserve the portable [integration report](../../devlogs/2026-10-29-radio-integration/devlog.html), including
reviewed images, raw Node logs/results and the original capture-provenance failure. Its aggregate is 142 passing
assertions and one historical harness error; accepted final runs have no errors. Keep the 606 baseline unchanged.
Commit only on `ngc/look-voices`, post the tested HEAD to Claude, then begin the separately assigned TP follow-up.
Claude owns integration and the subsequent XR/xrgameplay review; the XR camera source preservation was audited
here, with `deckcrew.js` byte-identical to `f8abdbb`.

The portable report passes 8/8 artifact/browser checks: hashes, links, decoded screenshots, desktop and 390 px
overflow, and browser errors. Desktop/mobile report screenshots were inspected. Its 4.9 MB folder is the
portable artifact; the historical harness error remains visible rather than being relabelled as a pass.

## Finding

Claude's separate third-person fitting task starts from the tested merge `7add6fc60a720a0829959d1b4d6062816d874ee5`.

## Evidence

The fixed merge HEAD was posted as `CDX-20261029-015` before any follow-up game edits. `CLD-20261029-004`
authorizes TP wrist/grasp fitting, with raw gameplay anchors and the LP pipeline retained. The existing `tpHand`
grasp centre is approximately [0,-.095,-.030] in hand-bone space, with its grip axis along local X. Its rigid
closed-hand clearance is approximately 18–19 mm, narrower than the LAW tube. The old poser places the wrist
directly at each weapon grasp anchor, producing the documented palm/furniture intersections.

## Cause

Weapon grasp targets and hand wrist origins are different frames. A fixed wrist rotation cannot compensate
for their missing positional offset or fit every weapon diameter.

## Action

Record unchanged crew/crowd baselines before edits, then solve the wrist from a local grasp centre and a
weapon-specific frame. Retain action/care/sling/seated/prone overrides. Start with pose fitting; add only an
optional per-diameter Marine hand profile within the existing SDF cache if geometry review requires it.
Default deck, civilian and baked-crew paths must remain unchanged. Baseline `tp-crowd-before.json` records
16 geometry and 3 material contracts, fingerprint `c8f65bc1a2dd2b88db02573546f0def3fc6628762a71ee2ee66ad330f570315a`.

## Finding

Wrist fitting alone cannot fit the existing closed fingers around the larger weapon furniture.

## Evidence

The old actual hand surface intersects the LAW's 39 mm radius tube by up to 38 mm, with more than 1,000
vertices over 3 mm inside. The M203 launcher check finds 436 vertices over 3 mm inside its 26 mm radius;
moving the old grasp centre still leaves a minimum aperture of about 15.1 mm. The short little finger
crosses the tube centre because its original length scale is applied around the wrist origin.

## Cause

The default compact hand is shared by many figures and was not constructed around a single large cylindrical
grasp axis. A rigid transform preserves that aperture. Changing it globally would also change crew and civilians.

## Action

Use only two named optional Marine profiles, `tube28` and `tube41`, within the existing `tpHand` SDF builder
and merged-body geometry cache. Curl each finger around the same local X axis, varying angular travel with
finger length. Preserve the default branch and cache keys. Swap geometry on the existing Marine LOD meshes;
retain skeletons and materials, and restore the exact default geometry references when the profile clears.
The merged-body cache retains full buffers per used combination: about 8.2 MB per high-detail appearance
across hero/near/mid LODs. This is a memory cost, not a performance improvement. Keep the profile set finite
and report the tested combinations; a broader cache redesign belongs to Claude's rendering workstream.

## Finding

The preview's launcher class was not reaching the player and rich AI third-person pose adapters.

## Evidence

Independent review found `marine.js` and `groundwar.js` converted `R.cls === 'gl'` to `rifle` before
`poseSkeleton`. The new preview can exercise the correct trigger and magazine grip while those production
callers would continue to select the rifle hand targets.

## Cause

An inherited display-class substitution predates the new per-weapon grip selection. A passing isolated pose
fixture cannot establish that gameplay supplies the same state.

## Action

Include the minimal production adapter correction in this follow-up and check the actual rendering path.
Keep weapon simulation, raw anchors, radio commands and other roles outside this change.

## Finding

The first fitted implementation introduced a care-transition wrist snap; review caught it before acceptance.

## Evidence

Switching the M203 from a fitted grip to self aid moved its left wrist 88.4 mm on the first frame, versus
9.4 mm at the handed-off merge. The final release frame jumped 96.3 mm. Keeping the fitted underlying target
through care interpolation reduces that final release movement to 0.27 mm; the LAW result falls from
46.3 mm to 0.15 mm. These are deterministic pose-step measurements, not a claim about all animation quality.

## Cause

Disabling fitted grips as soon as `pose.hands` or the care blend weight became active changed the baseline
underneath the existing care interpolation. The old wrist-on-anchor target then switched back at zero weight.

## Action

Retain the fitted weapon wrist/orientation beneath care interpolation on entry and exit. Select the default
hand geometry when care fully owns the hands, while preserving the underlying target for a smooth return.
Add transition regression checks along with the contact, state-reset and production-adapter checks.

## Finding

The first after capture passes structural checks but exposes a remaining M60 folded-bipod intersection.

## Evidence

`tools/runs/tp-grips-after` passes 11/11 assertions with no runtime or console errors and stable game hash
`1cc0e29098033b3a836e7466d4ffa176ceecf8b72831df9e4768bdca7f0022f3`. Seven images were inspected.
The M203 support hand is beneath the launcher, grenade mode reaches the launcher trigger and magazine,
and LAW palms sit outside the tube. In `03-tp-m60-support.png`, the folded bipod tip still enters the palm.
The original six camera transforms are retained; the seventh is an added view of the GL trigger hand.

## Cause

The initial M60 numeric check covered the forearm envelope, not the adjacent folded bipod. Structural model
assertions and a single contact envelope cannot establish clearance from every nearby component.

## Action

Retain this run as diagnostic evidence. Check a bounded rearward hand offset against both the forearm and
folded bipod, then repeat the fixed views. Keep the weapon geometry unchanged. Coarse palm shapes and watch/
cuff joins remain limitations of the inherited body and are outside this fitting pass.

## Finding

The final third-person fitting clears the measured primary surfaces and adjacent folded bipod/sling.

## Evidence

Final TP game hash `898fd996f20d6a5a30fc8f0ca10c57808264c2465ca4374d7ab2f71dad504b53`:
`tp-grips-final` 11/11; after-only centred M60 view `tp-m60-final` 2/2; `tp-crowd-final` 7/7;
actual player/rich-AI adapter fixture `tp-game-final` 8/8. All have stable source and no runtime/console errors.
The original six TP camera/projection/weapon matrices match exactly. All four crew/crowd/default Marine
near/mid PNGs are byte-identical to the pre-edit capture. Saved 16-geometry/3-material fingerprint is unchanged.
Node evidence in `tp-grip-node/result.json` passes 10/10 groups: syntax 614/614, types 578/606, six pose groups
covering 240 states, 12 actual hand surfaces and nine finite cache combinations, people 7, FP 886 and materials
60 states. Actual posed-triangle checks measure a minimum M60 bipod gap of 3.453 mm, LAW sling gaps of 3.180 mm
left / 0.619 mm right across the three LODs. Contact remains within the tested 3 mm tolerance.

## Cause

The final M60 support moves 70 mm rearward from the initial fitted position, retaining forearm contact while
clearing the folded feet. Rolling the LAW support hand 30 degrees around the same tube centre clears its sling
without changing tube contact or introducing another profile. The production adapters retain GL mode and
reflect LAW deployment. Care interpolation keeps fitted targets beneath the existing blend.

## Action

Keep the original and diagnostic captures in the portable report. The first full-game adapter run reached 7/7
assertions but Chrome disconnected on the fourth screenshot (`TargetCloseError`); its cause is unconfirmed.
The accepted rerun completes 8/8. Its paused inspection camera explicitly suppresses a stale first-person
overlay through the existing post-render API; these are rendering-adapter checks, not full combat simulation.
Remaining limits: coarse palms/thumbs, wrist/watch joins and LAW top-trigger contact (the hands cradle the tube).
The optional profile cache retains about 24.6 MB per high-detail appearance for its three runtime-used
combinations, up to 65.5 MB if all eight optional combinations are populated. Claude accepts the desktop cost;
Quest/XR memory impact remains unmeasured and should be reviewed before expanding appearances or profiles.

## Finding

The initial integration history included generated Windows speech audio; the clean handoff must omit it.

## Evidence

Claude's `CLD-20261029-005` reports two historical generated-bank blobs (about 51.1 MB and 20.1 MB), aborts its
integration attempt, and relays Jay Jay's explicit decision: build locally. The current `speech.logpcm.gz`
and its generated manifest are preserved locally but ignored. The tracked `index.json` is now only an
unavailable-bank descriptor. Earlier findings and reports describing a bundled bank are historical and are
superseded by this local-build decision.

## Cause

The original bank was committed alongside authored source. Removing only its latest tree entry would leave
those binary blobs in the integration ancestry. Runtime code also assumed that a generated index existed.

## Action

Build locally with `node tools/voice-build.mjs` at the repository root (WSL and installed Windows US English
voices). It writes ignored `speech.logpcm.gz` and `local-index.json`. `tools/serve.mjs` and the capture harness
expose that local manifest only with a matching bank; otherwise the normal queue emits text call-outs silently
without requesting absent PCM. The server prints the build command. Plain static hosting uses the tracked
text-only descriptor; live synthesis remains available through `--speech windows`.

Per Claude's delegated direction, prepare `ngc/look-voices-clean` as one snapshot commit parented at `f8abdbb`,
including the frozen TP work and local-bank cleanup. Preserve `ngc/look-voices` for recovery, never integrate
that old audio-containing history, and verify every new blob is at most 5 MB. No other branch is rewritten and
nothing is pushed. This implements the user's distribution choice; it is not a legal conclusion about SAPI.

## Finding

The optional-bank cleanup passes with and without local audio, and the final report is portable.

## Evidence

Final game hash `8d8a77cf3e167c7747f48ca5dfd594a51b6d8df1e2810398acc6c2890cbb8e85`:
required `voices-local-bank-final` 29/29 and `local-bank-smoke-final` 5/5, both with stable source and no runtime
or console errors. `voice-bank-missing` passes 6/6, preserving call-out text and completing the queue without
requesting PCM or starting audio. `local-bank-node` passes five groups: syntax 617/617, types 578 against the
unchanged 606 ceiling, optional-bank 10/10, hooks/local-bank integrity 19/19 and server 13/13.
The existing local bank was validated, not rebuilt during this cleanup; its SHA-256 is
`fc4ab1ff9adfd501c478e04fab11a895e1690052e055e1fb29fa27863c350de6`.

## Cause

An explicit unavailable descriptor makes absence a normal load result. The browser missing-bank fixture
intercepts only that descriptor response; separate Node tests exercise real absent and partial filesystem
builds. Final TP captures predate this audio-only source change and retain their own recorded hashes.

## Action

Publish the [local-speech and TP report](../../devlogs/2026-10-29-tp-grips/devlog.html) with 13 evidence runs,
117 passing assertions and the one retained historical browser-disconnect error. Offline report review passes
8/8: bundled artifact hashes, links, image decoding, desktop/mobile layout and no browser errors. Desktop and
390 px screenshots were inspected. Physical microphone operation in Opera GX, subjective listening and Quest/XR
memory remain manual checks; no new claim is made for them. Keep the earlier integration report unchanged.
