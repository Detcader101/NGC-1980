# xr-audio: no game sound in the Quest 3 (PC VR over Steam Link)

Branch `ngc/xr-audio` (from `experimental`), 2026-10-26.

## Evidence

**Steam Link's audio path is set up correctly** (`Steam/logs/vrserver.txt`, `driver_vrlink.txt`, session at 18:14:55):
- vrlink (`SVLAudioWSAPI`) looks for **"Steam Streaming Speakers"** by ID (`{0.0.0.00000000}.{8d2878fc-…}`), activates it and
  starts a WASAPI loopback capture on it: `WSAPI: Found Steam Streaming Speakers`, `Found Device ID match`,
  `capture starting: ->Start() = 0`, `SUCCESS: m_pCaptureClient=…`, 48000 Hz, 2 ch, 32-bit float. It captures that
  device only, not "whatever the default device is".
- SteamVR then makes Steam Streaming Speakers the Windows default for console, multimedia **and** communications
  (`Setting default audio playback endpoint (console|communications) to {…8d2878fc…}`), and switches back to the
  Razer Kraken (`{…8e8852a9…}`) on exit. `"A recoverable error happened to SVLAudioWSAPI. This will happen until there is
  a sound source available."` is the normal start-up retry and goes away by itself; it is not the fault.
- Endpoint format in the registry (`MMDevices\Audio\Render\{8d2878fc…}`): 48000 Hz, 2 ch, 16-bit PCM. The capture runs at
  48 kHz and the game's AudioContext at 48 kHz, so there is no sample-rate mismatch.
- `steamvr.vrsettings` has no audio device override or mirror setting, only `enableSpatialize*: false`. One log line,
  `Error: failed to remove audio mirror device` (18:10:47 shutdown), is cosmetic.

**Chromium has played to Steam Streaming Speakers and is not muted per app.** `HKCU\Software\Microsoft\Internet
Explorer\LowRegistry\Audio\PolicyConfig\PropertyStore\c560e8f0_0` = `steamstreamingspeakers … |…\NGC1980-Chromium\chrome-win\chrome.exe`.
It is the only record for that exe, and it has no saved volume or mute subkey, so it is at 100% and unmuted. Edge
(`9564b03c_0`) and Opera GX (`fae30336_0`) also have Steam Streaming Speakers records. No `--mute-audio` in the launch.
The profile has no `sound` block for 127.0.0.1. `chrome_debug.log` has no audio errors.

**The game's AudioContext is running**: `AUDIO running 48000Hz` 3 s into VR at 18:36:10 and 18:52:50
(`client-log.txt`). That only shows the context exists. It does not show that samples reach a device. If WASAPI cannot
open the device (for example, something holds it in exclusive mode), Chromium falls back to a fake output stream, and the
context still reports `running`.

**Not measured live.** This agent's sandbox blocked `powershell.exe` (and `-ExecutionPolicy Bypass`), so I could not take
the live session list and peak meters. The read-only helper is ready:
`powershell.exe -NoProfile -File /tmp/claude-1000/-home-jayjay-thrust-zarch/db415625-c4af-443a-850d-14ec9b906e90/scratchpad/sessions.ps1`.
It lists every render endpoint (state, format, endpoint volume and mute), every session per endpoint (pid, process,
volume, mute) and 8 peak samples per endpoint and session. Run it while the game is in VR with the rotor turning. A
`chrome` session on *Speakers (Steam Streaming Speakers)* with a peak above 0 proves the PC side end to end.

## Most likely cause

Everything on the Windows side that can be checked offline is correct: the browser's audio goes to the device Steam Link
captures, at the right rate, unmuted. So the loss is most likely one of these, from most to least likely:
1. **The Steam Streaming Speakers endpoint volume is at 0 or muted.** Windows remembers it per device. When SteamVR
   switches the default, the taskbar slider and the Quest volume keys drive that endpoint. Forum reports put this first.
2. **Headset side**: Quest system volume, or Steam Link's own volume/audio option on the Quest.
3. **Another app holds Steam Streaming Speakers exclusively** (Voicemeeter is installed and many apps have Voicemeeter
   VAIO records), or the streaming driver is broken. Valve's support fix for "no audio over Steam Link" is to remove and
   reinstall the Steam Streaming Speakers/Microphone devices.
4. The game makes no sound in VR. The new `AUDIO … peak` log line (below) settles this.

## What changed in the code
- `game/xrtest.html`: a **SOUND TEST** section. **PLAY TEST TONE** plays a 660 Hz beep, 1 s on and 1 s off, until pressed
  again, with a live level meter. It keeps running in the VR tests. A list of `audiooutput` devices
  (`enumerateDevices`) gives one button per device that routes the tone there with `AudioContext.setSinkId`. **SHOW DEVICE
  NAMES** asks for the mic once, because Chromium hides labels until then. Everything goes to `/__log` as `XRTEST TONE …`
  and also logs every 5 s while the tone plays. A headless smoke test showed the tone playing at level 0.04–0.5 and no
  page errors.
- `game/js/audio.js`: an analyser tap on the master bus (`sfx.peak()`), and an opt-in **`?audiosink=<label substring>`**
  (e.g. `?xrlog&audiosink=steam%20streaming`) that routes the game with `setSinkId`. It logs `AUDIOSINK …` (the output
  list, the device it picked, or errors). It is a fallback only: the evidence says the default device is already right.
  Labels may be empty until a mic permission is granted on that origin; xrtest's SHOW DEVICE NAMES grants it for the same
  origin.
- `game/js/main.js` / `game/js/xr/runtime.js`: the XR `AUDIO` log line now prints `peak <master-bus peak> sink <sinkId>` and
  is logged at 3 s, 10 s and 30 s into the session. If the peak is above 0, the game is producing sound and the problem
  is routing or volume. If it is 0, the game itself is silent in VR.

## Steps for the user (in order, stop when sound appears)
1. With Steam Link connected, open `http://127.0.0.1:8766/xrtest.html` in the NGC1980 Chromium and press **PLAY TEST
   TONE**. Listen in the headset. The desktop is mirrored through Steam Link, so you do not need to enter VR.
   - You hear it in the headset: routing works. Play the game with `?xrlog` and send the `AUDIO … peak` lines.
   - You hear it on the PC speakers instead: press the *Speakers (Steam Streaming Speakers)* button in the list, then
     look at Windows (step 3).
2. On the Quest: press volume up a few times. In the Steam Link app on the headset, check its audio/volume option.
3. Windows, *Settings > System > Sound* while SteamVR runs: output = **Speakers (Steam Streaming Speakers)**. Click it:
   volume well above 0 and not muted. Under *Advanced > Volume mixer*, check the Chromium entry: output "Default" (or
   Steam Streaming Speakers), volume up, not muted.
4. Classic Sound control panel (`mmsys.cpl`) > Playback > Steam Streaming Speakers > Properties: *Advanced*, untick
   **"Allow applications to take exclusive control of this device"** and set the format to **2 channel, 24-bit or 16-bit,
   48000 Hz**. On *Enhancements* / *Spatial sound*: off.
5. Quit Voicemeeter, or make sure none of its A1–A5 hardware outputs uses Steam Streaming Speakers (WDM/KS would lock it).
   Restart SteamVR.
6. SteamVR Settings > Advanced on > Steam Link > **Show Debug Graph**: watch the audio graph while the tone plays. Audio in
   the graph but nothing in the headset points at the headset or the Steam Link app.
7. If nothing works: Device Manager > Sound > uninstall *Steam Streaming Speakers* and *Steam Streaming Microphone* (tick
   "delete driver"), quit SteamVR and Steam, then start Steam as administrator once so it reinstalls them (Valve
   support's fix). Opting into the SteamVR beta has also fixed Steam Link audio issues for others.

Sources: Steam Link community threads (steamcommunity.com/app/353380/discussions/11/4038102696017666403,
…/4038102936186536349, …/4357872852120876232), SteamVR audio notes (uploadvr.com/steamvr-audio-vive-cosmos),
Meta forum "quest 3 no sound via steam link" (communityforums.atmeta.com …149601).
