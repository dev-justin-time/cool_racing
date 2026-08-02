# file.md — File-by-file map of OOL Racing (HexGL)

Map of every source file: **responsibility**, **imports**, **exports**, **functions**, and **upgrade opportunity**.

> Loading order (from `index.html`): classic scripts run first — `libs/Three.dev.js` → postprocessing → `bkcore.coffee/*` → `bkcore/threejs/*` → `bkcore/*` → `bkcore/hexgl/*` → `bkcore/hexgl/tracks/*`. Then the two ES modules: `websim-layer.js`, then `game-app.js`. Older files export via **global namespaces** (`bkcore.*`, `THREE.*`); only the two modules use ES `import`/`export`.

---

## Root — custom shell (this project's own code)

### `index.html`
- **Responsibility** — Single-page shell. Launch screen, race screen, loading overlay, HUD chips, touch controls, finish card, pause menu, credits + graphics settings modals, leaderboard panel. Declares the `<script>` boot order above.
- **Imports** — `styles.css`; 25+ classic scripts (`libs/Three.dev.js`, `libs/postprocessing/*`, `libs/Detector.js`, `libs/Stats.js`, `bkcore.coffee/controllers/*`, `bkcore.coffee/Timer.js`, `ImageData.js`, `Utils.js`, `bkcore/threejs/*`, `bkcore/Audio.js`, `bkcore/hexgl/*`, `tracks/Cityscape.js`); ES modules `websim-layer.js`, `game-app.js`; remote import map `@websim/websim-socket`.
- **Exports** — none (HTML).
- **Functions** — none (event wiring lives in `game-app.js`).
- **Upgrade opportunities** — 25 `<script>` tags could be bundled (fewer requests, but the vendored Three.js must stay classic-global). `favicon.png` is referenced — confirm it exists. Accessibility pass: modal focus-trapping (pause/settings) is still manual.

### `game-app.js`
- **Responsibility** — The whole modern shell: launch/boot gate, mode (timeattack/replay), quality + control + mute settings (persisted), pause menu + auto-pause, ghost (best-run) + live multiplayer ghosts, ghost delta readout, WRONG WAY banner, replay wiring, resize handling, finish flow, leaderboard rendering.
- **Imports** — `{ database, multiplayer } from "./websim-layer.js"`; `THREE`, `bkcore` globals.
- **Exports** — none (side-effect module). Publishes `window.hexGL`.
- **Functions** — `formatTime`, `escapeHtml`, `formatDelta`, `applyMuted`, `qualitySetting`, `openSettings`, `setQuality`, `toggleMute`, `canPause`, `setPaused`, `renderLeaderboardUser`, `renderLeaderboard`, `controlMode`, `labelForMode`, `setupMouseControls`, `requestTiltPermission`, `setupMobileControls`, `projectLabel`, `attachGhost`, `attachLiveGhosts`, `showFinish`, `onFinish`, `publishState`, `bootGame`, `setAutoLaunch`, `setReplayLaunch`; overrides `bkcore.hexgl.HexGL.prototype.displayScore`.
- **Upgrade opportunities** — **FPS auto-downgrade** (pending from the audit): monitor `lowFPS` and soft-disable bloom/shadows/particles mid-race. **Render at devicePixelRatio** (cap ~1.5–2) for HiDPI sharpness. `attachGhost`/`attachLiveGhosts` wrap `renderState.render` but never restore it on destroy (Q4). Ghost lerp is per-frame `* .22`, not frame-rate independent (Q3). Per-frame `new THREE.Vector3` in `projectLabel`. Quality is baked at engine init so `setQuality` reloads — a future "apply without reload" would need engine-side runtime toggles.

### `styles.css`
- **Responsibility** — All visual design: launch screen grid, Bebas/Inter typography, race HUD chips, leaderboard, modals, touch controls, animations (wrong-way flash), settings panel, responsive breakpoints.
- **Imports / Exports / Functions** — none (pure CSS).
- **Upgrade opportunities** — Split into `base/shell/hud/settings` files as it grows. `prefers-reduced-motion` handled only for the wrong-way flash so far — extend to other animations. Minor: several magic z-index layers (4–20) could become tokens.

### `websim-layer.js`
- **Responsibility** — WebSim integration: leaderboard collection, lap submission, ghost-trace storage, multiplayer presence (live ghosts), local-first fallback when offline/remote fails.
- **Imports** — `@websim/websim-socket` (dynamic `import()` inside `connect()`).
- **Exports** — `{ database, multiplayer, ready, decodeSamples }`; also `window.HexGLDatabase`, `window.HexGLMultiplayer`, `window.hexglDBReady`.
- **Functions** — `emit`, `sortRuns`, `readLocal`, `writeLocal`, `decodeSamples`, `cleanTrace`, `connect`, `syncPendingLocalRecords`, `loadLeaderboard`, `myRecordId`, `isMine`, `loadPersonalRecord`, `submitLap`, `startPresence`, `beginPresence`, `stopPresence`.
- **Upgrade opportunities** — `submitLap` awaits `loadLeaderboard()` (a network query) before checking the PB, then queries again after writing (Q2) — check the local cache first and skip network when it isn't a PB. Presence payload rounds position to 2dp and lerps per-frame (Q3) — send more precision and lerp by `1 − exp(−k·dt)`. `writeLocal` caps at 50 runs; prune + migrate to IndexedDB for bigger replay traces.

### `websim.config.json`
- **Responsibility** — Declares the WebSim collection schema `hexgl_lap_best` (`track`, `best_lap_ms`, `best_lap_trace`, `sample_count`).
- **Imports / Exports / Functions** — none (data).
- **Upgrade opportunities** — Add `username` as a real field (currently joined from `public.user`). Consider a second collection for per-run history instead of one-best-per-player.

### `README.md`, `LICENSE`, `CREDITS.md`, `opps.md`
- **Responsibility** — Docs: install/license/attribution, and the project audit + roadmap (`opps.md`).
- **Upgrade opportunities** — `README.md` is still the original HexGL readme — document the custom shell, WebSim setup, and the quality ladder. `opps.md` items are the de-facto backlog; keep it updated as work lands.

---

## Engine — `bkcore/` (modified original)

### `bkcore/Audio.js`
- **Responsibility** — WebAudio wrapper: master mute gain, panner, sound decoding/caching, positional playback.
- **Imports** — `window.AudioContext` (or `webkitAudioContext`).
- **Exports** — global `bkcore.Audio`.
- **Functions** — `init`, `setMuted`, `addSound`, `play`, `stop`, `volume`, `setListenerPos`, `setListenerVelocity`, `resume` (added: un-suspends the AudioContext on first user gesture).
- **Upgrade opportunities** — The HTML5 `<audio>` fallback path for old Safari is dead weight in 2026 — remove. `setListenerVelocity` is a stub (panner velocity removed from the spec). No sound pooling — rapid crash/boost replays create new buffer sources; a small pool would cut GC.

### `bkcore/threejs/RenderManager.js`
- **Responsibility** — Multi-scene/multi-camera render-loop manager; the `game` and `sky` scenes are registered here.
- **Imports** — none (uses `window.perfNow`).
- **Exports** — global `bkcore.threejs.RenderManager`.
- **Functions** — constructor, `add`, `get`, `remove`, `renderCurrent`, `setCurrent`.
- **Upgrade opportunities** — Delta is unclamped (`delta` from `perfNow`) — a tab-switch spike can teleport physics (the pause code works around this). No allocation reuse. Could expose per-scene stats for the planned FPS monitor.

### `bkcore/threejs/Loader.js`
- **Responsibility** — Asset loading with progress: textures, texture cubes, JSON geometries, pixel analysers (collision/height maps), images, sounds.
- **Imports** — `THREE` (JSONLoader, ImageUtils), `bkcore.ImageData`, `bkcore.Audio`.
- **Exports** — global `bkcore.threejs.Loader`.
- **Functions** — constructor, `load`, `updateState`, `get`, `loaded`, `loadTexture`, `loadTextureCube`, `loadGeometry`, `loadAnalyser`, `loadImage`, `loadSound`.
- **Upgrade opportunities** — No retry/abort/error recovery (a failed texture hard-stops progress). `JSONLoader` parses huge text geometry JSON — switching to binary/typed-array geometry would cut load time. Geometry is cached per `HexGL` instance, not shared across restarts.

### `bkcore/threejs/Preloader.js`
- **Responsibility** — Original 2012 animated preloader overlay.
- **Imports** — `THREE`, `bkcore.coffee/Utils`.
- **Exports** — global `bkcore.threejs.Preloader`.
- **Functions** — constructor, `render`, `mouseMove`, `remove`.
- **Upgrade opportunities** — **Dead code**: the shell uses the DOM `#loading-screen` instead. Safe to delete (or keep as reference).

### `bkcore/threejs/Particles.js`
- **Responsibility** — GPU/geometry particle system (used for ship exhaust/boost trails at quality 3).
- **Imports** — `THREE`.
- **Exports** — global `bkcore.threejs.Particles` (+ `Particle`).
- **Functions** — `build`, `emit`, `randomVector`, `update`; `Particle.reset`.
- **Upgrade opportunities** — Uses the legacy `THREE.Geometry` particle path; fine for the scale. Only instantiated at quality 3 — the FPS auto-downgrade should be able to tear it down live.

### `bkcore/threejs/Shaders.js`
- **Responsibility** — Custom shader library (`bkcore.threejs.Shaders`), incl. the `hexvignette` post pass used by the game composer.
- **Imports** — none (GLSL strings + uniforms).
- **Exports** — global `bkcore.threejs.Shaders`.
- **Functions** — none (data: shader objects keyed by name).
- **Upgrade opportunities** — Add a cheap color-grade/contrast pass and make the vignette pulse with speed (V5). Keep behind the quality gate for low-end.

### `bkcore/hexgl/HexGL.js`
- **Responsibility** — The engine root object: owns renderer, composer, HUD, gameplay, track, resize, and the rAF loop.
- **Imports** — `THREE`, `bkcore.threejs.*`, `bkcore.hexgl.*` (all globals).
- **Exports** — global `bkcore.hexgl.HexGL`.
- **Functions** — constructor (quality gates: 0 half-res, `>0` hex pass + booster light, `>2` PBR/gamma/bloom/shadows/particles), `start`, `reset`, `resume`, `restart`, `resize` (added), `update`, `init`, `load`, `initGameplay`, `displayScore` (overridden in `game-app.js`), `initRenderer`, `initHUD`, `initGameComposer`, `createMesh`, `tweakShipControls`.
- **Upgrade opportunities** — **Render at devicePixelRatio** (V1): `initRenderer`/`resize` still use CSS pixels, so HiDPI looks soft. Quality knobs are decided once at init — a live-downgrade path would make the FPS auto-downgrade trivial. `resize()` was added recently; verify composer target resets on rapid resizes (it is throttled in the shell).

### `bkcore/hexgl/Gameplay.js`
- **Responsibility** — Race state machine: countdown, timeattack/replay modes, checkpoints, laps, wrong-way detection, replay seek/end, result handling.
- **Imports** — `bkcore.hexgl.RaceData`, `bkcore.Timer`, `THREE`.
- **Exports** — global `bkcore.hexgl.Gameplay`.
- **Functions** — constructor (`this.modes.timeattack`, `this.modes.replay`), `simu`, `start`, `end`, `update`, `checkPoint`, `setWrongWay` (added), `recordLapSample`.
- **Upgrade opportunities** — Wrong-way is order-based: a forward cut that skips a checkpoint is mathematically identical to reversing — accepted heuristic, could add a heading check (ship facing vs checkpoint direction). Replay `seek` scans linearly per frame — binary search on the trace for long replays. The `end(REPLAY)` fix (`self.results.REPLAY`) landed recently; keep `results` vs `result` naming distinct — it bit us once.

### `bkcore/hexgl/ShipControls.js`
- **Responsibility** — Ship physics: thrust/steer/air-brake, boost, collision + height sampling against pixel analysers, falls, teleport, reset; exposes all HUD/presence getters.
- **Imports** — `THREE`, `bkcore.ImageData`, `bkcore.hexgl.HUD` info hooks.
- **Exports** — global `bkcore.hexgl.ShipControls`.
- **Functions** — constructor (keyboard hooks), `control`, `reset`, `terminate`, `destroy`, `fall`, `update`, `teleport`, `boosterCheck`, `collisionCheck`, `heightCheck`, `getRealSpeed`, `getRealSpeedRatio`, `getSpeedRatio`, `getBoostRatio`, `getShieldRatio`, `getShield`, `getPosition`, `getQuaternion`.
- **Upgrade opportunities** — **Per-frame `new THREE.Vector3` allocations in the hot loop** (Q5): `collisionCheck`/`boosterCheck` create vectors every frame — reuse scratch vectors. Collision samples the 2048px map each frame; a coarse+fine two-pass check would cut cost at low quality. Steering is digital (left/right booleans) — an analog curve would improve game feel.

### `bkcore/hexgl/ShipEffects.js`
- **Responsibility** — Ship visual effects: booster flame sprite scaling, exhaust particle trails (quality 3 only), boost light pulsing.
- **Imports** — `THREE`, `bkcore.threejs.Particles`.
- **Exports** — global `bkcore.hexgl.ShipEffects`.
- **Functions** — constructor, `update`.
- **Upgrade opportunities** — Particle trails only exist at quality 3 — the FPS downgrade needs a `destroy()`/disable path. Add crash sparks/impact debris for game feel.

### `bkcore/hexgl/CameraChase.js`
- **Responsibility** — Chase camera (with orbit mode for replays) following the ship, lerped, with speed-based offset.
- **Imports** — `THREE`.
- **Exports** — global `bkcore.hexgl.CameraChase`.
- **Functions** — constructor (`modes.CHASE`/`ORBIT`), `update`.
- **Upgrade opportunities** — `speedOffset` exists but is barely used — add a subtle FOV kick at high speed (V4) and a boost shake. Orbit offset is hardcoded; expose it for replay camera variety.

### `bkcore/hexgl/HUD.js`
- **Responsibility** — Canvas 2D HUD: speed/shield bars, lap + time display, countdown messages.
- **Imports** — `bkcore.Timer`.
- **Exports** — global `bkcore.hexgl.HUD`.
- **Functions** — constructor, `resize`, `display`, `updateLap`, `resetLap`, `updateTime`, `formatRaceTime`, `updateLapTime`, `resetTime`, `update`.
- **Upgrade opportunities** — Legacy canvas HUD; the shell already overlays DOM chips (ghost delta, wrong-way, replay badge). Consider a DOM HUD for crisper text + CSS transitions, or keep canvas for perf.

### `bkcore/hexgl/RaceData.js`
- **Responsibility** — Replay traces: per-frame sample recording, interpolation playback, export/import (JSON).
- **Imports** — none.
- **Exports** — global `bkcore.hexgl.RaceData`.
- **Functions** — constructor, `tick`, `applyInterpolated`, `reset`, `export`, `import`.
- **Upgrade opportunities** — Samples every ~16ms → ~180 samples/lap; traces can get large for the localStorage cap (50 runs). `applyInterpolated` end-guard was added recently — add a defensive empty-data guard too. Linear interpolation is fine; cubic would smooth corner traces.

### `bkcore/hexgl/Ladder.js`
- **Responsibility** — Original leaderboard ladder loader/display.
- **Imports** — `bkcore.Utils.request`, `bkcore.Timer`.
- **Exports** — global `bkcore.hexgl.Ladder`.
- **Functions** — `load`, `displayLadder`.
- **Upgrade opportunities** — **Dead + broken code**: references `bkcore.Ladder.global` (wrong namespace — it's `bkcore.hexgl.Ladder`) and does an XHR to "nothing"; never called by the shell (which uses `websim-layer.js`). Remove or fix.

### `bkcore/hexgl/tracks/Cityscape.js`
- **Responsibility** — The Cityscape track: declares assets per quality tier, builds materials, builds scenes (skybox, sun, ship, boosters, track, camera, per-frame render loop), owns the collision/height analysers and checkpoint layout.
- **Imports** — `THREE`, `bkcore.threejs.Loader`, `bkcore.Utils`, `bkcore.hexgl.*`.
- **Exports** — global `bkcore.hexgl.tracks.Cityscape` (object).
- **Functions** — `load`, `buildMaterials`, `buildScenes` (with the `game` render-loop closure).
- **Upgrade opportunities** — Stray `console.log('HIGH')` on the high-quality path. The LOW/HIGH asset manifests duplicate ~40 lines — extract a manifest. Both 2048px analysers load at every quality; LOW could sample a 512px map. The render closure re-checks `getShieldRatio()` twice per frame.

---

## Compiled CoffeeScript helpers — `bkcore.coffee/` (legacy, compiled from `.coffee`)

### `bkcore.coffee/Timer.js`
- **Responsibility** — Race clock + formatting.
- **Imports** — none.
- **Exports** — global `bkcore.Timer`.
- **Functions** — constructor, `start`, `pause`, `update`, `getElapsedTime`, `msToTime`, `msToTimeString`, `zfill`.
- **Upgrade opportunity** — `Timer.pause` exists but the shell implements pausing by rewinding `start`; could reuse the native pause. Formatting duplicates logic in `game-app.js` (`formatTime`/`formatDelta`) — single source of truth.

### `bkcore.coffee/Utils.js`
- **Responsibility** — Material factory (`createNormalMaterial`), screen projection, URL params, DOM helpers, XHR request, touch detection.
- **Imports** — `THREE`.
- **Exports** — global `bkcore.Utils`.
- **Functions** — `createNormalMaterial`, `projectOnScreen`, `getURLParameter`, `getOffsetTop`, `scrollTo`, `updateClass`, `request`, `isTouchDevice`.
- **Upgrade opportunity** — `request` is raw XHR — replace with `fetch`. Several DOM helpers (`scrollTo`, `updateClass`) are unused by the shell.

### `bkcore.coffee/ImageData.js`
- **Responsibility** — Pixel data from an image (collision/height maps): point + bilinear sampling.
- **Imports** — none.
- **Exports** — global `bkcore.ImageData`.
- **Functions** — constructor, `getPixel`, `getPixelBilinear`, `getPixelF`, `getPixelFBilinear`.
- **Upgrade opportunity** — Loads via an `<img>`; using `createImageBitmap` + `OffscreenCanvas` would be faster and avoid CORS taint.

### `bkcore.coffee/controllers/TouchController.js`
- **Responsibility** — Legacy touch joystick controller.
- **Exports** — global `bkcore.TouchController`.
- **Functions** — `isCompatible`, constructor, `touchStart`, `touchMove`, `touchEnd` (+ `Vec2`).
- **Upgrade opportunity** — **Dead code**: the shell ships its own pointer-based touch controls in `game-app.js`. Remove (same for the `.coffee` sources).

### `bkcore.coffee/controllers/OrientationController.js`
- **Responsibility** — Legacy device-orientation steering.
- **Exports** — global `bkcore.OrientationController`.
- **Functions** — `isCompatible`, constructor, `orientationChange`, `touchStart`, `touchEnd`.
- **Upgrade opportunity** — Unused by the shell (tilt is gated in `game-app.js` without this class). Remove or modernize with `DeviceOrientationEvent.requestPermission`.

### `bkcore.coffee/controllers/GamepadController.js`
- **Responsibility** — Legacy gamepad button mapping.
- **Exports** — global `bkcore.GamepadController`.
- **Functions** — `isCompatible`, constructor, `updateAvailable`.
- **Upgrade opportunity** — Unused; the shell's control note advertises keyboard/mouse/touch/tilt only. Remove, or wire the Gamepad API as a 5th control mode (nice feature).

### `bkcore.coffee/threejs/Particles.js` (+ `.coffee` sources)
- **Responsibility** — Compiled CoffeeScript variant of the particle system (`bkcore.coffee/threejs/Particles`).
- **Upgrade opportunity** — Superseded by `bkcore/threejs/Particles.js`, which is the one loaded in `index.html`. The `.coffee` sources are reference-only — safe to archive.

### `bkcore.coffee/tests.html`
- **Responsibility** — Original unit-test page for the coffee-compiled helpers.
- **Upgrade opportunity** — Replace with modern tests (Vitest/node) or drop.

---

## Data & assets

### `geometries/` — Three.js JSON geometry data (10 files)
- `ships/feisar/feisar.js` — the FEISAR ship mesh (~832 verts / 1676 faces, JSONLoader format).
- `booster/booster.js` — booster engine mesh.
- `bonus/base/base.js` — bonus pick-up pad.
- `tracks/cityscape/track.js`, `scrapers1.js`, `scrapers2.js`, `start.js`, `startbanner.js`, `bonus/speed.js` — the track surface, two scraper buildings, start strip, start banner, speed bonus.
- `tracks/edge/track.js` — original "edge" track (unused by the shell, which only runs Cityscape).
- **Responsibility** — Static mesh data loaded at runtime by `Loader.loadGeometry` → `THREE.JSONLoader`.
- **Imports / Exports** — none (JSON data, not JS).
- **Upgrade opportunity** — `feisar.js` alone is ~100KB+ of text JSON; binary `.bin` or compressed geometry would speed first load. The edge track is unused dead weight unless a second track ships.

### `libs/` — vendored third-party (do not edit casually)
- **`Three.dev.js`** (r50dev, 2012) — the runtime Three.js the game actually uses. Any "upgrade" to modern Three.js is a full engine rewrite; keep vendored.
- **`Three.r53.js`** — alternate build, unused.
- **`Detector.js`**, **`Stats.js`**, **`ShaderExtras.js`** — WebGL support check, FPS stats overlay (unused by shell — useful for the FPS monitor!), extra shaders (FXAA, cube).
- **`postprocessing/`** — `EffectComposer`, `RenderPass`, `BloomPass`, `ShaderPass`, `MaskPass`, `SavePass`, `TexturePass`, `FilmPass`, `DotScreenPass` (the composer pipeline used by `HexGL.initGameComposer`).
- **`DAT.GUI.min.js`**, **`leap-0.4.1.min.js`** — unused debug GUI + Leap Motion lib.
- **`Editor.html` + `Editor_files/`** — original in-browser level editor (Ace-based), unused.
- **Upgrade opportunity** — Prune unused vendored files (`Three.r53.js`, leap, DAT.GUI, Editor) to slim the repo; keep the rest pinned with hashes for provenance.

### `audio/` — `bg.ogg`, `boost.ogg`, `crash.ogg`, `destroyed.ogg`, `wind.ogg`
- **Responsibility** — All in-game audio, wired via `Cityscape.load`'s sounds manifest into `bkcore.Audio`.
- **Upgrade opportunity** — OGG only — add MP3/opus fallbacks for Safari/Edge legacy (WebAudio decodes OGG in Chromium fine today; verify Safari). They're unlicensed-independent per `audio/LICENSE`.

### `css/` — `BebasNeue-webfont.*`, `fonts.css`, `multi.css`, `touchcontroller.css`
- **Responsibility** — Bebas Neue display font + legacy CSS (only the font files + `fonts.css` matter to the shell; `styles.css` imports the woff).
- **Upgrade opportunity** — `multi.css`/`touchcontroller.css` are original-repo leftovers — delete.

### `textures/` and `textures.full/` (referenced, not in the cached tree)
- **Responsibility** — LOW-res vs full-res texture packs selected by the quality tier in `Cityscape.load`. Referenced at runtime; likely gitignored or outside the tree snapshot.
- **Upgrade opportunity** — Confirm both trees exist before shipping the quality screen; consider generating the LOW pack from the full pack with a script.

### `replays/cityscape-casual/bkcore.replay.json`
- **Responsibility** — Sample replay trace (used by the engine's `RaceData.import`).
- **Upgrade opportunity** — Not used by the shell's replay feature (that reads `race-Cityscape-replay` from localStorage) — keep as a fixture/test asset.

### `hexgl-original/`
- **Responsibility** — Pristine copy of the original HexGL release (reference for provenance: original `index.html`, `launch.coffee`, libs, replays).
- **Upgrade opportunity** — Keep as reference; do not edit. It can be moved out of the served root to avoid double-shipping the whole original game.

---

## Cross-cutting upgrade priorities (from `opps.md`)
1. **FPS-based auto-downgrade** — monitor FPS, soft-disable bloom/shadows/particles live; pairs with the new quality settings screen.
2. **Render at devicePixelRatio** (V1) — HiDPI sharpness, capped ~1.5–2.
3. **Fast PB path** (Q2) — check local cache before hitting the network on lap submit.
4. **Frame-rate-independent ghost lerp** (Q3) + unwrap render hooks (Q4).
5. **De-dup scratch vectors in ShipControls** (Q5) for GC relief.
6. **Prune dead code** — `Ladder.js`, `Preloader.js`, legacy controllers, Editor/, unused libs.
