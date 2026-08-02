# OOL Racing — Code Audit & Opportunity Report

> Audit date: 2026-08-02 · Scope: full project (custom shell + HexGL engine)
> Stack: Three.js r53-dev era engine (vendored in `libs/`), vanilla JS modules, WebSim socket for multiplayer/leaderboard.

**Verdict:** The custom shell (`index.html`, `game-app.js`, `styles.css`, `websim-layer.js`) is well-crafted — clean data flow, escaping of user content, local-first fallback, and a genuinely nice visual language. The core problems are (a) a handful of dead/broken UI paths, (b) an unused quality tier that leaves desktop visuals below what the engine can do, and (c) missing game-feel/UX fundamentals (pause, mute, resize). Priorities below are grouped by impact.

---

## 1 · Bugs & correctness (fix first)

| # | Issue | Location | Why it matters |
|---|-------|----------|----------------|
| B1 | **Launch screen is never shown; the Launch button is dead.** `#launch-screen` starts with `is-hidden` in the HTML, and `bootGame()` is called unconditionally at module load — it hides the launch screen and drops the player straight into the race. **There is no `click` listener on `#start-button` anywhere.** | `index.html:19`, `game-app.js:372-373, 463` | The branded marketing screen, the "BEST" time readout, the control hint, and the credits button are all unreachable. Players get no intro, no gesture, and no controls briefing. |
| B2 | **Music never starts under browser autoplay policy.** `bkcore.Audio.init()` creates an `AudioContext` at script load and `game.start()` calls `play('bg')` immediately; the context is never `resume()`d from a user gesture, so modern browsers keep it suspended → silent game. | `bkcore/Audio.js` (init/play) | Game feel collapses without the engine hum + wind. Tied to B1: there is no natural "launch" gesture to resume audio on. |
| B3 | **Three status chips never become visible.** `#racers-now`, `#connection-status`, `#ghost-status` all start with class `is-hidden`; the JS sets their `textContent` but never removes `is-hidden`. "RACING NOW", "LOCAL RUN/GLOBAL LINK", and "GHOST READY/NO GHOST" are permanently invisible. | `index.html:39-40`, `game-app.js:47-48, 225` | Kills the social/global feel — players can't tell they're racing a ghost or connected. |
| B4 | **No window-resize / orientation handling.** Game, HUD canvas, and composer render-target are all created once at `window.innerWidth/innerHeight`; on rotate/resize the WebGL canvas and HUD canvas are CSS-stretched → distorted aspect, wrong HUD proportions. `HUD.prototype.resize()` exists but is never called. | `bkcore/hexgl/HexGL.js` (initRenderer/initGameComposer), `bkcore/hexgl/HUD.js`, `styles.css #overlay canvas` | Broken visuals on mobile rotation (very common) and any window resize. |
| B5 | **Mouse controls can stick.** `setupMouseControls` toggles `ship.key.forward/brake` on `mousedown/up` on `window`; releasing the button outside the window or alt-tabbing leaves keys stuck → the ship keeps accelerating/braking with no recourse. No `blur`/`mouseleave` cleanup, no pointer-capture. | `game-app.js` `setupMouseControls` | Real UX bug for the mouse control mode. |
| B6 | **Offline → online personal-best migration is broken.** Local fallback records use id `local-Cityscape`, but once a user is logged in `myRecordId()` returns `{user.id}-Cityscape`. `syncPendingLocalRecords()` syncs by exact id, so the offline PB is orphaned and invisible after login. | `websim-layer.js` (`myRecordId`, `syncPendingLocalRecords`) | Users who played offline lose their PB when they log in. |
| B7 | **ESC hint says "abort" but ESC just silently restarts the race.** `onKeyPress(27)` calls `reset()` with no confirmation and no pause. | `index.html:50`, `bkcore/hexgl/HexGL.js` (constructor) | Misleading UI; no way to pause (see F1 — pause is the real fix). |
| B8 | **Global leaks in engine.** `_this = this` without `var` in `ShipControls.prototype.fall()`, and `isServerConnected` leaks from the (unused) Leap Motion block. | `bkcore/hexgl/ShipControls.js` | Pollutes `window`; also the entire Leap Motion controller (controlType 2) is dead code that would throw if ever selected — remove it. |

---

## 2 · Code quality / maintainability

| # | Issue | Location | Suggestion |
|---|-------|----------|------------|
| Q1 | **Quality tier is inconsistent with the original mapping.** Desktop passes `quality: 2` which loads the full-res texture set but skips everything gated at `quality > 2` — shadows, bloom, **and the ship's particle trails (`useParticles`)**. Desktop ends up visually plain despite full textures. | `game-app.js:381` (`quality = isTouch ? 1 : 2`), `bkcore/hexgl/tracks/Cityscape.js` (fxParams), `bkcore/hexgl/HexGL.js` (`quality > 2` gates) | Bump desktop to `quality: 3` or expose a quality setting (see V2/F3). |
| Q2 | **Lap submissions are slow and chatty.** `hexgl:lap` fires per lap (3×/race); `submitLap` awaits `loadLeaderboard()` (a network query) *before* checking the personal best, then calls it again after writing. | `game-app.js` (`hexgl:lap` handler), `websim-layer.js` `submitLap` | Check personal best from local cache first; skip network when not a PB; debounce/render leaderboard once per race. |
| Q3 | **Live-ghost interpolation is not frame-rate independent.** `position += (target - pos) * 0.22` runs per frame, not per dt; at low FPS ghosts crawl. Presence payloads are rounded (pos to 2 dp) which adds jitter. | `game-app.js` `attachLiveGhosts` | Lerp by `1 - exp(-k*dt)`; increase position precision; optionally include speed for look-ahead. |
| Q4 | **Render-hook wrappers are never unwound.** `attachGhost`/`attachLiveGhosts` wrap `renderState.render`; `ghostController.destroy()` removes the mesh but leaves the wrapper chained (only relevant across restarts without reload). | `game-app.js` `attachGhost` | Restore the original `render` reference on destroy. |
| Q5 | **Per-frame allocations in hot loop.** `collisionCheck()`/`boosterCheck()` allocate `new THREE.Vector3` every frame → GC pressure. | `bkcore/hexgl/ShipControls.js` | Reuse scratch vectors. |
| Q6 | **`game-app.js` is a ~470-line monolith** mixing UI, controls, ghost logic, and presence networking. | `game-app.js` | Split into modules (`ui.js`, `controls.js`, `ghost.js`, `presence.js`) following the `websim-layer.js` style. |
| Q7 | **Dead code in the engine.** The original `displayScore()` DOM block (Twitter/FB share, finish screen) is overridden at runtime but kept; typo `martixAutoUpdate`; unused `RaceData`/`replay` mode isn't wired to any UI; `#race-screen .leaderboard` CSS selector is dead (leaderboard lives outside `#race-screen`). | `bkcore/hexgl/HexGL.js`, `styles.css` | Prune, or keep only what the override needs. |

---

## 3 · Visual upgrades (high impact)

| # | Opportunity | Effort | Notes |
|---|-------------|--------|-------|
| V1 | **Render at devicePixelRatio** — game currently renders at CSS-pixel resolution, so it's blurry on Retina/HiDPI. Cap DPR at ~1.5–2 for perf. | Low | `renderer.setSize(w*dpr, h*dpr)` + camera aspect; tie to a quality setting. |
| V2 | **Enable the "VERY HIGH" tier on desktop** (quality 3): 2048px shadow map, bloom, specular/normal shaders, and the **ship exhaust particle trails** (`useParticles`). One-line change, instant game-feel boost. | Trivial | See Q1. |
| V3 | **Live countdown + finish ceremony** — the canvas HUD prints plain "3 / 2 / 1 / Go"; add a big animated CSS/DOM countdown overlay with scale/fade, and a flash + neon border on the finish card. | Low–Med | Pure DOM on top of `#overlay`; no engine changes. |
| V4 | **Speed feel**: camera FOV kick at high speed (`CameraChase.speedOffset` already exists — extend it with a subtle FOV multiplier), plus speed-lines/streak particles at boost. | Med | CameraChase is engine code but small and self-contained. |
| V5 | **Post-processing**: add a cheap color-grade/contrast pass and a stronger, animated vignette; the existing `hexvignette` shader can pulse with speed. Consider subtle film grain at high boost. | Med | All in `initGameComposer`; keep an on/off for low-end. |
| V6 | **Revive the launch screen** (fix B1) as the polished entry: animated grid already exists — add a slow glow-pulse on the logo, an animated "LAUNCH" state, and show the PB + controls note (they're built but never seen). | Low | Mostly CSS keyframes + one listener. |
| V7 | **Crisper HUD**: the canvas HUD is drawn at 1×; at DPR 2 (V1) redraw at 2×, or migrate the key readouts (speed/shield/lap time) to styled DOM elements for sharper text and richer styling. | Med | HUD.js has `resize()`; add DPR awareness. |
| V8 | **Skybox/atmosphere**: sky is a static dawn cloudbox; add subtle animated clouds, fog matching the palette, and stronger sun glare on the track. | Med–High | Engine-side (Cityscape.buildScenes). |
| V9 | **Ghost/live-rival polish**: wireframe ghosts already read well — upgrade to additive textured ghosts with a faint trailing streak, and make the "GHOST" label chip match (currently `#ghost-label` is fine but the `#ghost-name` chip never shows — B3). | Low | game-app.js + CSS. |

---

## 4 · User value / UX features

| # | Feature | Effort | Why it wins |
|---|---------|--------|-------------|
| F1 | **Pause menu** — ESC pauses (instead of silently resetting); overlay with Resume, Restart, Mute, Controls recap, Quit. Auto-pause on tab blur (`visibilitychange`) too. | Med | Biggest single UX win; B7's fix. |
| F2 | **Audio mute toggle + persisted** (`localStorage`), plus `ctx.resume()` on first gesture. | Low | Fixes B2; respects players. |
| F3 | **Settings screen** — quality (Low/Mid/High/Ultra), FOV, sound; persisted. Reuse the existing quality ladder. | Med | Broad device support + player choice. |
| F4 | **Ghost delta readout** — during the race, show "+0.42s" (ahead/behind the ghost) near the HUD lap time; this is *the* time-attack mechanic and it's currently missing. | Med | `attachGhost` already knows the ghost timeline — compare `currentLapTime` to ghost's trace at same position/distance. |
| F5 | **Your rank, not just top 5** — query total run count + your rank via SQL, show "RANK #7 / 214". | Low | Social proof; websim query supports COUNT. |
| F6 | **Web Share API** on finish ("I just ran Cityscape in 1:23.456 on OOL Racing") with fallback copy-link. | Low | Free virality on mobile. |
| F7 | **Replay mode** — `RaceData` export/import and `mode: 'replay'` already exist in the engine; surface "watch replay" from the finish screen with the orbit camera. | Med | Uses latent engine capability. |
| F8 | **Wrong-way warning** — `Gameplay.results.WRONGWAY` exists but nothing ever triggers it; use `previousCheckPoint` direction to show "WRONG WAY" + auto-reset option. | Low–Med | Prevents rage-quits on 3-lap races. |
| F9 | **Meta/OG tags + PWA manifest** — add `description`, OG/Twitter cards (share the game itself), `theme-color`, and an installable manifest (hexgl-original ships one). | Low | Shareability & installability. |
| F10 | **WebGL failure fallback** — wrap `new THREE.WebGLRenderer` and show a styled "WebGL not available" screen instead of a white void. | Low | Graceful degradation. |
| F11 | **First-run controls overlay** — brief "ARROWS steer · ↑ accelerate · Q/E air-brake" toast at race start (the note only exists on the never-seen launch screen, B1). | Low | Onboarding. |
| F12 | **Multi-lap statistics** — session summary on finish: best lap, avg, delta vs PB; finish screen already collects `lapTimes` — extend the card. | Low | Rewards replay. |

---

## 5 · Multiplayer & persistence (websim)

| # | Opportunity | Notes |
|---|-------------|-------|
| M1 | Sync pending *renamed* records on login (fix B6): on first connect, migrate `local-Cityscape` → `{user.id}-Cityscape` if the user record has no PB. |
| M2 | Richer presence: include `lap` and `speed`; let spectators see laps, and let the top bar show "RACING NOW" per track with live lap counts (fix B3's chip). |
| M3 | Real-time ghost races are already 90% there (`attachLiveGhosts`); the next step is a "challenge a rival" mode that picks a leaderboard ghost and shows a side-by-side delta. |
| M4 | Leaderboard pagination/"load more" + COUNT for rank (F5); guard against huge traces (cap `best_lap_trace` length on write — already implicitly capped by lap duration). |

---

## 6 · Accessibility & hygiene

- Add `role="dialog"`/`aria-modal` + focus trap to the credits modal and finish card; ESC should close the modal first (currently ESC resets the race even while the credits modal is open).
- Buttons need `:focus-visible` styles (keyboard users currently get no focus indicator).
- HUD text colors meet contrast only at the largest sizes; consider bumping `--muted` (#87a2a5) slightly.
- `prefers-reduced-motion`: gate the launch-grid animation and countdown effects.
- `<html lang="en">` ✓; touch buttons have aria-labels ✓.

---

## Suggested roadmap

**Phase 1 — "It works & it's fair" (week 1, ~4–6h):**
B1 (launch gate), B2 (audio resume), B3 (status chips), B4 (resize), B5 (stuck keys), B7 (ESC = pause-menu stub), Q2 (fast PB check), V2 (quality 3).

**Phase 2 — "Looks & feels pro" (week 2):**
V1 (DPR), V3 (countdown/finish ceremony), V4 (FOV kick + speed lines), V9 (ghost polish), F4 (ghost delta), F2 (mute), F11 (controls toast).

**Phase 3 — "Share & retain" (week 3+):**
F6 (Web Share), F5/F4 (rank + deltas), F7 (replay), F8 (wrong-way), M1–M4 (multiplayer depth), V5–V8 (post-processing, skybox), F9 (OG/PWA), Q6 (module split).

---

## Appendix — files that changed nothing but deserve a second look

- `bkcore/hexgl/Gameplay.js` — solid; only nit: `recordLapSample` uses fixed rounding (fine for ghosts).
- `bkcore/threejs/RenderManager.js` — fine; `perfNow` fallback is good.
- `websim.config.json` — fine; add a `run_count`/session table if you want per-session stats (M4).
- `hexgl-original/` — pristine upstream copy; keep as reference, don't edit.

---

## Implemented (August 2026)

The audit items have all landed:

- **Q1 / V2** — quality settings screen (Low/Mid/High/Ultra, persisted) and ULTRA (quality 3) is the desktop default: bloom, 2048px shadows, particle trails render.
- **FPS auto-downgrade** — `startFpsWatchdog` + `HexGL.softDowngrade()` disable bloom/shadows/trails live on sustained low FPS, persist a lower tier, and show a clickable "GRAPHICS AUTO-LOWERED" chip (restores via settings).
- **V1** — devicePixelRatio rendering (capped 2): crisp on HiDPI, backing store 2× CSS (probe-verified).
- **Q2** — fast PB path: `submitLap` checks the local cache first; non-PB laps return without any network; the leaderboard refreshes only on a real PB.
- **Q3 / Q4** — frame-rate-independent live-ghost lerp; render-hook wrappers (ghost/live-ghost/gamepad) unwrap on destroy.
- **Q5** — scratch vectors in the `ShipControls` hot loop (`collisionCheck`/`boosterCheck`) and `projectLabel`.
- **V4** — chase-camera FOV kick at speed + boost shake.
- **V5** — vignette speed pulse (red at critical shield).
- **Dead-code prune** — `Ladder.js`, `Preloader.js`, legacy `bkcore.coffee/controllers/*`, `bkcore.coffee/threejs/`, unused vendored libs + CSS; `hexgl-original/` moved out of the served root.
- **Extras** — PAD control mode (Gamepad API), shell-driven tilt (fixes a touch clobber bug), `RenderManager` delta clamp, `RaceData` empty-trace guard, Audio HTML5-fallback removal, modal focus traps, `prefers-reduced-motion` for all animations.

> Most of Phase 1–3 roadmap items from the original audit (pause, replay, wrong-way, ghost delta, quality screen, FPS watchdog) are shipped; the remaining suggestions are the asset/external ones listed above in the summary.

- **LOW texture pack** — new `textures.low/` generated from `textures.full/` (256px visuals, 512px analysers, HUD kept sharp). LOW quality (0) now loads it, skipping the 2048px collision/height maps entirely (16MB → 1MB decoded each). Collision/height sampling became resolution-independent (`ShipControls` lazy ratio sync + scaled probes, `Gameplay.checkPoint` ratio sync) — verified identical world mapping at 2048 vs 512, checkpoint IDs in the collision blue channel preserved.
- **Per-lap delta readout** — new `#lap-delta` chip (below the ghost delta): live lap clock plus `+0.42s`/`–0.12s` vs your session best, seeded from the personal best at boot and tightened live as you beat it; `NEW SESSION BEST` flash on improvement. Boot-scoped render hook (like the ghost), survives pause-restarts, hidden pre-race/on finish, `prefers-reduced-motion` safe.
