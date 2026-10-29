// Globals the game and its tests share through `window`. Type checking only (tsconfig.json); nothing here runs.
// Most are test/debug hooks: tools/snap.mjs scenes and tools/*bench.mjs read them with page.evaluate().
//   node tools/check.mjs types

type DebugBridge = import('../js/main.js').DebugBridge;
type VoiceEngine = ReturnType<typeof import('../js/voice/voice.js').createVoices>;
type CommandRadio = ReturnType<typeof import('../js/voice/commandpanel.js').createCommandPanel>;

declare global {
  interface Window {
    // ---- the game (game/js) -------------------------------------------------------------------------------
    /** ?debug: the test/debug bridge to the running game (main.js debugBridge(), near the end). __G.war is a War. */
    __G?: DebugBridge;
    /** ?xrlog: posts a line to tools/serve.mjs /__log (set by game/index.html before main.js loads). */
    __xrlog?: (msg: string) => void;
    /** ?xrbench: the VR benchmark state (xr/bench.js). */
    __xrbench?: any;
    /** ?perfhud: the CPU-per-system overlay state (perfhud.js; ngc/perf-cpu). */
    __perf?: any;
    /** RenderKit atmosphere / world sky / nature (main.js, for tests). */
    __rkSky?: any;
    __rkWorld?: any;
    __nature?: any;
    /** Unit markers layer (main.js, tests). */
    __MK?: any;
    /** ?debug: lived-in world collision (world/solid.js) and doors (interiors). */
    __SOLID?: any;
    __DOORS?: any;
    /** ?debug getters defined with Object.defineProperty in main.js. */
    readonly __IN?: any;
    readonly __SEATS?: any;
    /** The lived-in world (world/life.js). */
    __WORLD?: any;
    /** ?sim spectator (sim/spectator.js). */
    __SIM?: any;
    /** (ngc/look-voices) Production voice controller and command desk; microphone ownership remains explicit. */
    __voiceEngine?: VoiceEngine;
    __radioCommands?: CommandRadio;
    /** Read-only voice evidence exposed to the browser fixtures. */
    __voices?: {
      readonly log: Partial<VoiceEngine['log'][number]>[];
      played: () => VoiceEngine['log'];
      overlaps: () => number;
      readonly mode: string;
      readonly backend: string;
      readonly stats: VoiceEngine['stats'];
      readonly cur: string;
      readonly queue: string[];
      voices: () => string[];
      V: VoiceEngine;
    };

    // ---- dev pages (game/dev/*.js, not type-checked yet) ----------------------------------------------------
    /** Every dev page's bench hook: { renderer, host, mode, state, ... } (tools/*bench.mjs). */
    __BENCH?: any;
    __A?: any; __C?: any; __D?: any; __F?: any; __I?: any; __J?: any; __MI?: any; __P?: any; __R?: any;
    __RK?: any; __RW?: any; __S?: any; __STRUCT?: any; __T?: any; __V?: any; __FISHVIEW?: any;
    __stats?: any; __ready?: boolean; __view?: (...a: number[]) => void;

    // ---- browser extras not in lib.dom ----------------------------------------------------------------------
    /** Old Safari / Chromium prefix (audio.js, armoraudio.js, infantryaudio.js). */
    webkitAudioContext?: typeof AudioContext;
    /** WebXR's render state class (xr/runtime.js hides its `layers` on Quest + Steam Link). */
    XRRenderState?: { prototype: XRRenderState };
    /** Chromium's window.chrome (present in Chrome and Chromium-based browsers). */
    chrome?: unknown;
  }

  /** world/terrain.js: optional bake-time logger (tests). */
  // eslint-disable-next-line no-var
  var __TERRAIN_LOG: ((msg: string) => void) | undefined;

  /** Audio worklet global scope (mic-worklet.js); not provided by lib.dom. */
  abstract class AudioWorkletProcessor {
    readonly port: MessagePort;
    abstract process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean;
  }
  function registerProcessor(name: string, processorCtor: new () => AudioWorkletProcessor): void;
}

export {};
