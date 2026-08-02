OOL Racing (HexGL shell)
========================

A modernized fork of [HexGL](http://hexgl.bkcore.com), the futuristic HTML5 racing
game by [Thibaut Despoulain](http://bkcore.com). The original WebGL engine is
wrapped in a custom shell (`index.html` + `game-app.js` + `styles.css`) that adds
a launch screen, quality settings, multiplayer ghosts/leaderboard via WebSim,
replay mode, a pause menu, and five input modes.

```
┌─────────────────────────────────────────────┐
│  Custom shell (game-app.js)                 │
│  launch · settings · HUD · pause · replay   │
│  ghosts · leaderboard · input (5 modes)     │
├─────────────────────────────────────────────┤
│  WebSim layer (websim-layer.js)             │
│  collection "hexgl_lap_best" + presence     │
│  (auto-falls back to localStorage offline)  │
├─────────────────────────────────────────────┤
│  HexGL engine (bkcore/)                     │
│  Gameplay · ShipControls · Cityscape · ...  │
└─────────────────────────────────────────────┘
```

## Running the game

The game needs an HTTP server (WebGL textures and module scripts don't load from
`file://`). Any static server works:

```bash
python -m http.server 8080
# then open http://localhost:8080
```

- **Full-size textures:** swap the `textures/` and `textures.full/` directories
  (then set quality to HIGH or ULTRA — see below).
- **Reference copy:** the untouched upstream source lives outside the served
  root at `../ool_racing_by_ou812_reference_hexgl_original/`.

## The custom shell

| File | Responsibility |
|---|---|
| `index.html` | Launch screen, HUD, settings modal, pause menu, finish/credits panels |
| `game-app.js` | All shell logic: boot, input, ghosts, leaderboard, replay, pause, settings |
| `styles.css` | Full visual redesign of the shell (plus `prefers-reduced-motion` support) |
| `websim-layer.js` | Multiplayer/leaderboard/presence adapter with offline fallback |
| `websim.config.json` | WebSim collection schema (`hexgl_lap_best`) |

Boot flow: `game-app.js` imports `websim-layer.js`, wires the launch screen, and
calls `bootGame()` — which constructs `bkcore.hexgl.HexGL`, hands it the shell's
quality settings, sets up the selected input mode, and starts the FPS watchdog.
Restart/replay buttons set a `sessionStorage` flag and reload, so the browser
resumes audio after the user gesture.

### Feature list

- **Launch screen** — shows your best time, a start button, and settings/credits.
  The game only boots after a user gesture (audio unlock).
- **Quality settings** — Low/Mid/High/Ultra (see the quality ladder below),
  persisted to `localStorage["ool-quality"]`.
- **Pause menu (ESC)** — resume, mute toggle, restart, settings. The game
  also auto-pauses on tab blur and when the tab loses focus.
- **Ghost racing** — a translucent wireframe "rival" replays your best lap,
  with a live delta readout (`+0.42s` vs best) while you race.
- **Per-lap delta** — a live chip showing the current lap time and how it
  compares to your session best (`+0.42s` / `–0.12s`), flashing
  "NEW SESSION BEST" when you set one; baseline seeds from your personal best.
- **Replay mode** — "Watch your run" on the finish screen replays your last
  race from the same `RaceData` trace used by ghosts.
- **Wrong-way indicator** — shows when you drive against checkpoint direction.
- **Multiplayer** — live presence, a global leaderboard, and PB sync through
  WebSim (with a fast no-network path when a lap doesn't beat your PB).
- **FPS auto-downgrade** — a watchdog lowers graphics automatically on weak
  hardware and shows a "TAP TO RESTORE" chip.

## WebSim setup

The game uses the WebSim platform for shared leaderboards and live presence.

1. **Collection schema** (`websim.config.json`):

```json
{
  "collections": {
    "hexgl_lap_best": {
      "fields": {
        "track": "string",
        "best_lap_ms": "number",
        "best_lap_trace": "json",
        "sample_count": "number"
      }
    }
  }
}
```

2. `websim-layer.js` connects lazily at boot via `@websim/websim-socket`:

```js
const mod = await import("@websim/websim-socket");
room = new mod.WebsimSocket();
```

It then subscribes to presence, syncs any locally-pending PBs, and listens for
`getUser()` to attribute runs. If WebSim is unavailable (local dev, offline), it
**silently falls back** to `localStorage["ool-racing-best-laps-v2"]` and keeps
the entire game playable single-player.

Key exports: `database` (collection handle), `multiplayer` (connection state),
`ready` (promise), `decodeSamples()` (trace decoder).

### PB submission flow (`submitLap`)

1. Fast path: if the lap doesn't beat your *cached* PB, return with **zero
   network** (no leaderboard refresh, no upload).
2. Otherwise, double-check against the remote record (only when online).
3. Upsert the new record (`best_lap_ms`, `best_lap_trace`, `sample_count`) into
   the `hexgl_lap_best` collection, update the local cache, and refresh the
   board **only on a real PB**.
4. Offline failures degrade to local-only saves and are re-synced later.

## Quality ladder

Persisted to `localStorage["ool-quality"]` and applied at boot. The engine's
legacy `quality` option (texture sizes, etc.) maps onto these tiers:

| Setting | `quality` | Enabled | Texture pack |
|---|---|---|---|
| **LOW** | 0 | Half-resolution render, no bloom/shadows/trails | `textures.low/` (256px visuals, 512px analysers) |
| **MID** | 1 | Full resolution, no bloom/shadows/trails | `textures/` (base pack) |
| **HIGH** | 2 | Full textures, no bloom/shadows/trails | `textures.full/` |
| **ULTRA** | 3 | Bloom, shadow maps, and ship particle trails | `textures.full/` |

**LOW's texture pack** (`textures.low/`, generated from `textures.full/`) lets weak
GPUs skip the 2048px collision/height analyser maps entirely — they decode as
512×512 RGBA (1MB each instead of 16MB). Diffuse/skybox textures drop to 256px
max; HUD images stay full-res so the UI remains crisp. Collision/height sampling
is resolution-independent (ratios derive from the actual map width), so the 512px
analysers behave identically to the 2048px originals — including the checkpoint
IDs encoded in the collision map's blue channel.

- **FPS watchdog** (`startFpsWatchdog` in `game-app.js`): tracks a smoothed FPS
  while racing; after a sustained dip (>360 frames under 28 FPS on ULTRA) it
  persists the next tier down and calls `HexGL.softDowngrade()` — which disables
  bloom, shadow maps, and particle trails **live**, mid-race — then shows a
  "GRAPHICS AUTO-LOWERED · TAP TO RESTORE" chip that reopens settings.
- The watchdog never fires on LOW/MID, never fires in replay mode, and requires
  a *sustained* dip so one-off hitches don't latch.
- Device pixel ratio rendering is used (capped at 2×) so the game stays crisp on
  high-DPI displays without changing layout size.

## Controls

The shell owns all input (the engine's legacy controller classes were pruned).
Switch modes via the **control toggle** chip (or the settings panel); the choice
persists to `localStorage["ool-control-mode"]`. Help text on the launch screen
and HUD always reflects the active mode.

| Mode | Chip | Controls |
|---|---|---|
| **Keyboard** | `KEYS` | ←→ steer, ↑ accelerate, Q / E air-brake |
| **Mouse** | `MOUSE` | Move mouse to steer, click to accelerate, right-click brake |
| **Gamepad** | `PAD` | Left stick / D-pad steer, A or RT accelerate, LT/X brake, LB/RB air-brake |
| **Touch** | `TOUCH` | On-screen joystick + buttons (auto-selected on mobile) |
| **Tilt** | `TILT` | Device motion steering (auto-selected on mobile) |

- **PAD mode** uses the modern Gamepad API, polled inside the game render loop
  (`setupGamepadControls`), with deadzoned stick steering (±0.2 axis threshold)
  plus D-pad fallback.
- **Tilt mode** (`setupTiltControls`) drives the engine's analog
  `ShipControls.tiltAmount` (same `beta/45` curve as the original
  OrientationController), replacing the deleted legacy controller. It
  auto-calibrates level-on-first-event.
- Keyboard/mouse inputs release automatically on `blur`, `mouseleave`, and tab
  hide, so controls never stick.

## Project structure

```
audio/                  OGG sound effects (bg, boost, crash, destroyed, wind)
bkcore/                 The HexGL engine (Audio, hexgl/*, threejs/*, tracks/)
bkcore.coffee/          Compiled CoffeeScript helpers (Timer, Utils, ImageData)
css/                    BebasNeue webfont files (only the font survives the prune)
favicon.png             Site icon
game-app.js             Custom shell (see above)
geometries/             Track geometry + ship meshes (Three.js JSON)
index.html              Shell markup
libs/                   Vendored Three.dev.js + postprocessing passes
replays/                Sample replay traces
styles.css              Shell styling
textures/ , textures.full/   Base + full-res texture packs
                           textures.low/ (auto-generated) = LOW tier pack
websim.config.json      WebSim collection schema
websim-layer.js         Multiplayer/leaderboard adapter
```

A complete file-by-file breakdown with upgrade notes lives in **`file.md`**;
`opps.md` tracks the improvement backlog and status.

## License

Unless specified in the file, HexGL's code and resources are licensed under the
*MIT License* — see `LICENSE` and `CREDITS.md`.

## Note

The original HexGL development is on hiatus; this fork adds the shell layer,
quality ladder, ghosts/replays, and modern input on top of the unchanged engine
core. Issues and patches welcome.
