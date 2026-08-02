import { database, multiplayer } from "./websim-layer.js";

const $ = (id) => document.getElementById(id);
const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
const CONTROL_KEY = "ool-control-mode";
const CONTROL_MODES = isTouch ? ["touch", "tilt"] : ["keyboard", "mouse", "gamepad"];
const DEFAULT_MODE = isTouch ? "touch" : "keyboard";
const REPLAY_KEY = "ool-replay";
const REPLAY_STORE = "race-Cityscape-replay";
const QUALITY_KEY = "ool-quality";
// Quality tiers mirror the engine ladder (0 = LOW half-res, 1 = MID, 2 = HIGH
// full textures, 3 = ULTRA bloom/shadows/trails); options live in index.html.
let game = null;
let runSubmitted = false;
let bestRun = null;
let ghostController = null;
let paused = false;
let muted = false;
let replayMode = false;
let lastFocused = null;
let liveGhosts = null;
let gamepadController = null;
let lapDeltaController = null;
let demoMode = false;
let demoController = null;
// Best completed lap this page session; seeded from your personal best so the
// readout is meaningful from lap 1, then tightens as you beat it live.
let sessionBestLap = null;
let personalBestLap = null;
const MUTE_KEY = "ool-muted";

function formatTime(value) {
  const ms = Math.max(0, Number(value) || 0);
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor(ms / 1000) % 60;
  const millis = ms % 1000;
  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function formatDelta(value) {
  const ms = Number(value) || 0;
  const sign = ms < 0 ? "–" : "+";
  const abs = Math.abs(ms);
  const minutes = Math.floor(abs / 60000);
  const seconds = Math.floor(abs / 1000) % 60;
  const centis = Math.floor((abs % 1000) / 10);
  const base = minutes > 0
    ? `${minutes}:${String(seconds).padStart(2, "0")}.${String(centis).padStart(2, "0")}`
    : `${seconds}.${String(centis).padStart(2, "0")}`;
  return `${sign}${base}s`;
}

function applyMuted() {
  if (window.bkcore?.Audio?.setMuted) bkcore.Audio.setMuted(muted);
  const label = $("mute-label");
  if (label) label.textContent = muted ? "SOUND OFF" : "SOUND ON";
  const soundOption = $("settings-sound");
  if (soundOption) {
    soundOption.classList.toggle("is-off", muted);
    soundOption.setAttribute("aria-checked", muted ? "false" : "true");
    $("settings-sound-label").textContent = muted ? "OFF" : "ON";
  }
}

// Quality setting: persisted 0-3, or the device default when unset/unreadable.
function qualitySetting() {
  // NB: Number(null) is 0, so guard the raw key before coercing — a missing
  // key must fall through to the device default, not silently become LOW.
  try {
    const raw = localStorage.getItem(QUALITY_KEY);
    if (raw != null) {
      const stored = Number(raw);
      if (Number.isInteger(stored) && stored >= 0 && stored <= 3) return stored;
    }
  } catch (_) { /* storage blocked */ }
  return isTouch ? 1 : 3;
}

function openSettings() {
  lastFocused = document.activeElement;
  const current = qualitySetting();
  let selectedOption = null;
  document.querySelectorAll(".quality-option[data-quality]").forEach((option) => {
    const selected = Number(option.dataset.quality) === current;
    option.classList.toggle("is-selected", selected);
    option.setAttribute("aria-checked", selected ? "true" : "false");
    if (selected) selectedOption = option;
  });
  $("settings-panel").classList.remove("is-hidden");
  (selectedOption || $("settings-close"))?.focus();
}

function setQuality(value) {
  try { localStorage.setItem(QUALITY_KEY, String(value)); } catch (_) { /* storage blocked */ }
  // Quality is baked in at engine init (materials, composer passes, resolution),
  // so apply by rebooting straight into the race like the control toggle does.
  setAutoLaunch();
  window.location.reload();
}

function toggleMute() {
  muted = !muted;
  try { localStorage.setItem(MUTE_KEY, muted ? "1" : "0"); } catch (_) { /* storage blocked */ }
  applyMuted();
}

function canPause() {
  return Boolean(game && game.gameplay && game.gameplay.step < 100);
}

function setPaused(next) {
  if (!game || !game.gameplay || paused === next) return;
  paused = next;
  $("pause-menu").classList.toggle("is-hidden", !paused);
  if (paused) {
    // Freeze the rAF loop; the last rendered frame stays on screen behind the menu.
    game.active = false;
    $("resume-button").focus();
  } else {
    // Rewind the gameplay timer by the paused duration so lap/countdown time
    // keeps counting correctly, then reset the render delta to avoid a physics spike.
    const timer = game.gameplay.timer;
    const now = Date.now();
    timer.time.start += Math.max(0, now - timer.time.previous);
    timer.time.previous = now;
    game.manager.time = window.perfNow();
    game.resume();
  }
}

function renderLeaderboardUser(run) {
  const username = String(run.username || "Pilot");
  const safeUsername = escapeHtml(username);
  const encodedUsername = encodeURIComponent(username);
  return `
    <a class="leaderboard-user" href="https://websim.com/@${encodedUsername}" target="_blank" rel="noopener noreferrer">
      <span class="leaderboard-avatar" aria-hidden="true">
        <span>${escapeHtml(username.charAt(0).toUpperCase() || "P")}</span>
        <img src="https://images.websim.com/avatar/${encodedUsername}" alt="" loading="lazy">
      </span>
      <span class="leaderboard-name">${safeUsername}${database.isMine(run) ? " · YOU" : ""}</span>
    </a>`;
}

function renderLeaderboard({ runs = [], personal = null, remote = false } = {}) {
  bestRun = runs[0] || null;
  const personalBest = personal || runs.find((run) => database.isMine(run));
  personalBestLap = personalBest?.best_lap_ms ?? null;
  $("best-time").textContent = bestRun ? `BEST ${formatTime(bestRun.best_lap_ms)}` : "BEST —:—.———";
  $("connection-status").textContent = remote ? "GLOBAL LINK" : "LOCAL RUN";
  $("ghost-status").textContent = bestRun ? "GHOST READY" : "NO GHOST";
  $("ghost-name").textContent = bestRun ? `${bestRun.username || "Rival"} · ${formatTime(bestRun.best_lap_ms)}` : "No ghost on the grid";
  $("connection-status").classList.remove("is-hidden");
  $("ghost-status").classList.remove("is-hidden");
  $("personal-best").textContent = personalBest ? `PB ${formatTime(personalBest.best_lap_ms)}` : "PB —:—.———";
  const list = runs.slice(0, window.matchMedia("(max-width: 760px)").matches ? 3 : 5);
  $("leaderboard-list").innerHTML = list.length ? list.map((run, index) => `
    <div class="leaderboard-row${database.isMine(run) ? " is-me" : ""}">
      <span class="leaderboard-rank">${String(index + 1).padStart(2, "0")}</span>
      ${renderLeaderboardUser(run)}
      <span class="leaderboard-time">${formatTime(run.best_lap_ms)}</span>
    </div>`).join("") : `<div class="leaderboard-empty">No global laps yet.</div>`;
  document.querySelectorAll(".leaderboard-avatar img").forEach((avatar) => {
    avatar.addEventListener("error", () => avatar.remove(), { once: true });
  });
  if (game && bestRun && !ghostController && !replayMode) attachGhost(game, bestRun);
}

function controlMode() {
  const stored = localStorage.getItem(CONTROL_KEY);
  return stored && CONTROL_MODES.includes(stored) ? stored : DEFAULT_MODE;
}

function labelForMode(mode) {
  return { keyboard: "KEYS", mouse: "MOUSE", touch: "TOUCH", tilt: "TILT", gamepad: "PAD" }[mode] || "KEYS";
}

function setupMouseControls(hex) {
  const ship = hex.components.shipControls;
  const pointer = { accelerating: false, braking: false };
  const applySteer = () => {
    const centerX = window.innerWidth / 2;
    const edge = Math.max(60, centerX * .6);
    const ratio = Math.max(-1, Math.min(1, (pointer.x - centerX) / edge));
    ship.key.left = ratio < -0.15;
    ship.key.right = ratio > 0.15;
  };
  const onMove = (event) => {
    pointer.x = event.clientX;
    applySteer();
  };
  const onDown = (event) => {
    if (event.button === 0) {
      pointer.accelerating = true;
      ship.key.forward = true;
    } else if (event.button === 2) {
      pointer.braking = true;
      ship.key.brake = true;
      ship.key.rtrigger = true;
    }
  };
  const onUp = (event) => {
    if (event.button === 0 && pointer.accelerating) {
      pointer.accelerating = false;
      ship.key.forward = false;
    } else if (event.button === 2 && pointer.braking) {
      pointer.braking = false;
      ship.key.brake = false;
      ship.key.rtrigger = false;
    }
  };
  window.addEventListener("mousemove", onMove);
  window.addEventListener("mousedown", onDown);
  window.addEventListener("mouseup", onUp);
  window.addEventListener("contextmenu", (event) => event.preventDefault());
  const releaseAll = () => {
    pointer.accelerating = false;
    pointer.braking = false;
    ship.key.forward = false;
    ship.key.brake = false;
    ship.key.rtrigger = false;
  };
  window.addEventListener("blur", releaseAll);
  document.addEventListener("mouseleave", () => { if (!document.hidden) releaseAll(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) releaseAll(); });
  pointer.x = window.innerWidth / 2;
}

function requestTiltPermission() {
  if (!isTouch || !window.DeviceOrientationEvent) return Promise.resolve(false);
  if (typeof DeviceOrientationEvent.requestPermission !== "function") return Promise.resolve(true);
  return DeviceOrientationEvent.requestPermission().then((state) => state === "granted").catch(() => false);
}

function setupMobileControls(hex, mode) {
  if (!isTouch) return;
  const ship = hex.components.shipControls;
  const joystick = document.querySelector(".touch-joystick");
  const knob = document.querySelector(".joystick-knob");
  const accelerate = document.querySelector("[data-touch-control=accelerate]");
  const brake = document.querySelector("[data-touch-control=brake]");
  const pressed = { accelerate: false, brake: false };
  let joystickPointer = null;
  let joystickX = 0;
  const updateKeys = () => {
    ship.key.forward = pressed.accelerate;
    ship.key.brake = pressed.brake;
    // Tilt mode steers through ship.tiltAmount (setupTiltControls); the joystick
    // is pointer-events:none there, so never clobber left/right with its 0.
    if (mode === "touch") {
      ship.key.left = joystickX < -.2;
      ship.key.right = joystickX > .2;
    }
  };
  const resetJoystick = () => {
    joystickPointer = null;
    joystickX = 0;
    knob.style.transform = "translate(-50%, -50%)";
    updateKeys();
  };
  const moveJoystickAt = (id, clientX, clientY) => {
    if (joystickPointer !== id) return;
    const rect = joystick.getBoundingClientRect();
    const radius = rect.width * .42;
    const x = clientX - (rect.left + rect.width / 2);
    const y = clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(x, y) || 1;
    const scale = Math.min(1, radius / length);
    const nx = x * scale / radius;
    const ny = y * scale / radius;
    joystickX = nx;
    knob.style.transform = `translate(calc(-50% + ${nx * radius}px), calc(-50% + ${ny * radius}px))`;
    updateKeys();
  };
  const moveJoystick = (event) => {
    event.preventDefault();
    moveJoystickAt(event.pointerId, event.clientX, event.clientY);
  };
  joystick.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    joystickPointer = event.pointerId;
    joystick.setPointerCapture?.(event.pointerId);
    moveJoystickAt(event.pointerId, event.clientX, event.clientY);
  }, { passive: false });
  joystick.addEventListener("pointermove", moveJoystick, { passive: false });
  ["pointerup", "pointercancel"].forEach((eventName) => joystick.addEventListener(eventName, (event) => {
    event.preventDefault();
    if (joystickPointer === event.pointerId) resetJoystick();
  }, { passive: false }));
  joystick.addEventListener("touchstart", (event) => {
    event.preventDefault();
    const touch = event.changedTouches[0];
    if (joystickPointer === null && touch) {
      joystickPointer = `touch-${touch.identifier}`;
      moveJoystickAt(joystickPointer, touch.clientX, touch.clientY);
    }
  }, { passive: false });
  joystick.addEventListener("touchmove", (event) => {
    event.preventDefault();
    const touch = [...event.changedTouches].find((item) => joystickPointer === `touch-${item.identifier}`);
    if (touch) moveJoystickAt(joystickPointer, touch.clientX, touch.clientY);
  }, { passive: false });
  ["touchend", "touchcancel"].forEach((eventName) => joystick.addEventListener(eventName, (event) => {
    event.preventDefault();
    const ended = [...event.changedTouches].some((item) => joystickPointer === `touch-${item.identifier}`);
    if (ended) resetJoystick();
  }, { passive: false }));
  const bindAction = (button, name) => {
    const press = (event) => {
      event.preventDefault();
      if (event.pointerId != null) button.setPointerCapture?.(event.pointerId);
      pressed[name] = true;
      button.classList.add("is-pressed");
      updateKeys();
    };
    const release = (event) => {
      event.preventDefault();
      pressed[name] = false;
      button.classList.remove("is-pressed");
      updateKeys();
    };
    button.addEventListener("pointerdown", press, { passive: false });
    ["pointerup", "pointercancel"].forEach((eventName) => button.addEventListener(eventName, release, { passive: false }));
    button.addEventListener("touchstart", press, { passive: false });
    ["touchend", "touchcancel"].forEach((eventName) => button.addEventListener(eventName, release, { passive: false }));
  };
  bindAction(accelerate, "accelerate");
  bindAction(brake, "brake");
  $("touch-controls").classList.remove("is-hidden");
  joystick.style.opacity = mode === "tilt" ? ".32" : "1";
  joystick.style.pointerEvents = mode === "tilt" ? "none" : "auto";
}

// Shell-side analog tilt steering (replaces the engine's legacy
// OrientationController). Maps deviceorientation beta to ship.tiltAmount
// (-1..1) after an initial calibration frame, mirroring the old beta/45 curve.
function setupTiltControls(hex) {
  const ship = hex.components.shipControls;
  let dbeta = null;
  let active = true;
  const onOrientation = (event) => {
    if (!active || event.beta == null) return;
    if (dbeta == null) dbeta = event.beta;
    ship.tiltAmount = Math.max(-1, Math.min(1, (event.beta - dbeta) / 45));
  };
  window.addEventListener("deviceorientation", onOrientation);
  hex._tiltCleanup = () => {
    active = false;
    ship.tiltAmount = 0;
    window.removeEventListener("deviceorientation", onOrientation);
  };
}

// PAD mode: modern Gamepad API polling inside the game render loop. The engine
// keeps using its digital key state; this just feeds it from the controller.
function setupGamepadControls(hex) {
  const ship = hex.components.shipControls;
  const renderState = hex.manager.get("game");
  let connected = false;
  const release = () => {
    ship.key.forward = false;
    ship.key.brake = false;
    ship.key.left = false;
    ship.key.right = false;
    ship.key.ltrigger = false;
    ship.key.rtrigger = false;
  };
  const poll = () => {
    let pad = null;
    try {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { pad = pads[i]; break; }
    } catch (_) { /* gamepad API unavailable */ }
    if (!pad) {
      if (connected) { connected = false; release(); }
      return;
    }
    connected = true;
    const buttons = pad.buttons || [];
    const axes = pad.axes || [];
    ship.key.forward = Boolean(buttons[7]?.pressed) || Boolean(buttons[0]?.pressed);
    ship.key.brake = Boolean(buttons[6]?.pressed) || Boolean(buttons[2]?.pressed);
    ship.key.ltrigger = Boolean(buttons[4]?.pressed);
    ship.key.rtrigger = Boolean(buttons[5]?.pressed);
    const axis = axes[0] != null ? axes[0] : 0;
    ship.key.left = axis < -0.2 || Boolean(buttons[14]?.pressed);
    ship.key.right = axis > 0.2 || Boolean(buttons[15]?.pressed);
  };
  const originalRender = renderState.render;
  const wrapped = function(delta, renderer) {
    poll();
    return originalRender.call(this, delta, renderer);
  };
  renderState.render = wrapped;
  return {
    destroy() {
      if (renderState.render === wrapped) renderState.render = originalRender;
      release();
    }
  };
}

// Shared scratch vector so projectLabel doesn't allocate per frame (Q5).
const _projectScratch = new THREE.Vector3();
function projectLabel(label, object, camera, projector) {
  if (!label || !projector || !object.visible) {
    label?.classList.add("is-hidden");
    return;
  }
  _projectScratch.set(object.position.x, object.position.y + 1.5, object.position.z);
  projector.projectVector(_projectScratch, camera);
  if (_projectScratch.z < -1 || _projectScratch.z > 1) {
    label.classList.add("is-hidden");
    return;
  }
  label.classList.remove("is-hidden");
  label.style.left = `${(_projectScratch.x * .5 + .5) * window.innerWidth}px`;
  label.style.top = `${(-_projectScratch.y * .5 + .5) * window.innerHeight - 10}px`;
}

function attachGhost(hex, record) {
  if (ghostController?.destroy) ghostController.destroy();
  ghostController = null;
  const data = database.decodeSamples(record?.best_lap_trace).filter((sample) => Array.isArray(sample) && sample.length >= 8);
  if (!data.length || !hex?.manager?.get("game")) return;

  const renderState = hex.manager.get("game");
  const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x8dfaff, transparent: true, opacity: .34, wireframe: true, blending: THREE.AdditiveBlending });
  const ghost = new THREE.Mesh(hex.track.lib.get("geometries", "ship.feisar"), ghostMaterial);
  const label = $("ghost-label");
  label.textContent = `GHOST · ${record.username || "RIVAL"}`;
  label.classList.remove("is-hidden");
  renderState.scene.add(ghost);
  const projector = THREE.Projector ? new THREE.Projector() : null;
  let cursor = 0;
  const deltaEl = $("ghost-delta");
  let deltaCursor = 0;
  let deltaLastLapTime = 0;
  const xzDist2 = (sample, position) => {
    const dx = sample[1] - position.x;
    const dz = sample[3] - position.z;
    return dx * dx + dz * dz;
  };

  const update = () => {
    const gameplay = hex.gameplay;
    const lapTime = gameplay?.currentLapTime || 0;
    const duration = Number(data[data.length - 1][0]) || 0;
    if (!gameplay || gameplay.step < 4 || lapTime < 0) {
      ghost.visible = false;
      label.classList.add("is-hidden");
      deltaEl.classList.add("is-hidden");
      return;
    }
    if (lapTime > duration) {
      // The ghost finished its lap; hide the mesh but keep showing the gap.
      ghost.visible = false;
      label.classList.add("is-hidden");
    } else {
      while (cursor < data.length - 2 && data[cursor + 1][0] < lapTime) cursor++;
      const a = data[cursor];
      const b = data[Math.min(cursor + 1, data.length - 1)];
      const span = Math.max(1, b[0] - a[0]);
      const t = Math.min(1, Math.max(0, (lapTime - a[0]) / span));
      ghost.position.set(a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t);
      ghost.quaternion.set(a[4] + (b[4] - a[4]) * t, a[5] + (b[5] - a[5]) * t, a[6] + (b[6] - a[6]) * t, a[7] + (b[7] - a[7]) * t).normalize();
      ghost.updateMatrix();
      ghost.visible = true;
      projectLabel(label, ghost, renderState.camera, projector);
    }

    // Live vs-ghost delta: our lap clock minus the ghost's lap time at the
    // nearest point of its trace to our current position. Negative = ahead.
    if (lapTime < deltaLastLapTime) deltaCursor = 0; // lap reset
    deltaLastLapTime = lapTime;
    const shipPos = hex.components.shipControls.dummy.position;
    // Walk the nearest-sample cursor both ways (O(1) amortized) so reversing
    // after a crash doesn't leave the delta pointing at the furthest point.
    while (deltaCursor < data.length - 1 && xzDist2(data[deltaCursor + 1], shipPos) < xzDist2(data[deltaCursor], shipPos)) deltaCursor++;
    while (deltaCursor > 0 && xzDist2(data[deltaCursor - 1], shipPos) < xzDist2(data[deltaCursor], shipPos)) deltaCursor--;
    const ghostTimeAtPos = Math.min(Number(data[deltaCursor][0]) || 0, duration);
    const deltaMs = lapTime - ghostTimeAtPos;
    deltaEl.classList.remove("is-hidden");
    deltaEl.classList.toggle("ahead", deltaMs < 0);
    deltaEl.classList.toggle("behind", deltaMs >= 0);
    deltaEl.textContent = `VS GHOST ${formatDelta(deltaMs)}`;
  };
  const originalRender = renderState.render;
  const wrapped = function(delta, renderer) {
    update();
    return originalRender.call(this, delta, renderer);
  };
  renderState.render = wrapped;
  ghostController = {
    destroy() {
      // Q4: unwrap the render hook so re-attaching never chains wrappers.
      if (renderState.render === wrapped) renderState.render = originalRender;
      renderState.scene.remove(ghost);
      label.classList.add("is-hidden");
      deltaEl.classList.add("is-hidden");
    }
  };
}

// Per-lap delta readout (V3-style): a live clock during each lap showing the
// current lap time and how it compares to the session best lap. Works without
// a ghost, survives restarts, and flashes on a new session best. Updated inside
// the render loop via the same wrapper-unwrap pattern as the ghost controller.
function startLapDelta(hex) {
  const renderState = hex.manager?.get("game");
  const el = $("lap-delta");
  if (!renderState || !el) return null;
  let flashUntil = 0; // Date.now() timestamp while a NEW SESSION BEST flash shows
  let lastShownLap = 0;

  const render = () => {
    const gameplay = hex.gameplay;
    const lapTime = gameplay?.currentLapTime || 0;
    const lap = gameplay?.lap || 1;
    if (!gameplay || gameplay.step < 4 || replayMode || lapTime < 0) {
      el.classList.add("is-hidden");
      return;
    }
    // Hold a NEW SESSION BEST flash for its duration before resuming the delta
    // (the hexgl:lap event fires synchronously inside gameplay.update, so the
    // render hook runs in the same frame and would otherwise clobber it).
    if (flashUntil) {
      if (Date.now() < flashUntil) {
        el.classList.remove("is-hidden");
        return; // flash text/class already set by flashNewBest
      }
      flashUntil = 0;
      el.classList.remove("new-best");
    }
    // New lap started (Gameplay resets currentLapTime to 0 on crossing).
    if (lap !== lastShownLap) {
      lastShownLap = lap;
      el.classList.remove("ahead", "behind", "new-best");
    }
    el.classList.remove("is-hidden");
    if (sessionBestLap == null) {
      // No baseline yet: show the live lap clock (countdown-style polish).
      el.textContent = `LAP ${lap} · ${formatTime(lapTime)}`;
      return;
    }
    const deltaMs = lapTime - sessionBestLap;
    el.textContent = `LAP ${lap} · ${formatTime(lapTime)} · ${formatDelta(deltaMs)}`;
    el.classList.toggle("ahead", deltaMs < 0);
    el.classList.toggle("behind", deltaMs >= 0);
  };

  const originalRender = renderState.render;
  const wrapped = function (delta, renderer) {
    render();
    return originalRender.call(this, delta, renderer);
  };
  renderState.render = wrapped;

  return {
    // Called from the hexgl:lap handler when a lap beats the session best.
    flashNewBest(time) {
      el.textContent = `NEW SESSION BEST · ${formatTime(time)}`;
      el.classList.remove("ahead", "behind");
      el.classList.add("new-best");
      el.classList.remove("is-hidden");
      flashUntil = Date.now() + 1600;
    },
    destroy() {
      flashUntil = 0;
      // Q4: unwrap the render hook so re-attaching never chains wrappers.
      if (renderState.render === wrapped) renderState.render = originalRender;
      el.classList.add("is-hidden");
    }
  };
}

// Demo / attract mode: extract the racing line, put the hero ship on autopilot,
// and spawn the visible AI racers. The autopilot drives the real ShipControls
// key state each frame (before the engine's own update), so physics, height and
// boosters all behave exactly like a player's run.
function startDemo(hex) {
  const line = bkcore.hexgl.AIDemo.generateRacingLine(hex.track.analyser, hex.track.spawn);
  if (!line) {
    console.warn("Demo: racing line not ready — falling back to a normal race.");
    demoMode = false;
    $("race-screen").classList.remove("is-demo");
    return;
  }
  const autopilot = new bkcore.hexgl.AIDemo.Autopilot(hex.components.shipControls, line);
  const racers = bkcore.hexgl.AIDemo.createRacers(hex, line);
  const renderState = hex.manager.get("game");
  const originalRender = renderState.render;
  const wrapped = function (delta, renderer) {
    autopilot.update(delta);
    for (let i = 0; i < racers.length; i++) racers[i].update(delta);
    return originalRender.call(this, delta, renderer);
  };
  renderState.render = wrapped;
  demoController = {
    autopilot,
    racers,
    destroy() {
      // Q4: unwrap the render hook so teardown never leaves a stale wrapper.
      if (renderState.render === wrapped) renderState.render = originalRender;
      for (let i = 0; i < racers.length; i++) racers[i].destroy();
    }
  };
  $("demo-mode-pill").textContent = "AUTOPILOT";
  $("demo-screen").classList.remove("is-hidden");
  $("demo-controls").classList.remove("is-hidden");
}

// Hands the wheel to the player: the race becomes a normal time attack (laps
// submit, finish card shows) while the AI racers keep driving on the grid.
function takeControl() {
  if (!demoMode || !game) return;
  demoMode = false;
  game.mode = "timeattack";
  if (game.gameplay) {
    game.gameplay.mode = "timeattack";
    game.gameplay.maxLaps = 3;
  }
  if (demoController?.autopilot) demoController.autopilot.disengage();
  $("race-screen").classList.remove("is-demo");
  $("demo-controls").classList.add("is-hidden");
  $("demo-mode-pill").textContent = "MANUAL";
  window.setTimeout(() => $("demo-screen").classList.add("is-hidden"), 2400);
  // Bring the normal race extras online: per-lap delta + best ghost.
  sessionBestLap = personalBestLap;
  lapDeltaController = startLapDelta(game);
  if (bestRun && !ghostController) attachGhost(game, bestRun);
}

function exitDemo() {
  if (demoController?.destroy) demoController.destroy();
  demoController = null;
  window.location.reload();
}

function attachLiveGhosts(hex) {
  const renderState = hex.manager.get("game");
  const projector = THREE.Projector ? new THREE.Projector() : null;
  const players = {};
  const geometry = hex.track.lib.get("geometries", "ship.feisar");
  const localClientId = multiplayer.room?.clientId;

  function removePlayer(id) {
    const player = players[id];
    if (!player) return;
    renderState.scene.remove(player.mesh);
    player.label.remove();
    delete players[id];
  }

  function presenceChanged({ presence = {}, peers = {}, clientId } = {}) {
    const activeIds = new Set();
    Object.entries(presence).forEach(([id, state]) => {
      if (id === (clientId || localClientId) || !state?.active || state.track !== "Cityscape") return;
      activeIds.add(id);
      const peer = peers[id] || {};
      if (!players[id]) {
        const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color: 0xffb454, transparent: true, opacity: .2, wireframe: true, blending: THREE.AdditiveBlending }));
        const label = document.createElement("div");
        label.className = "floating-label live";
        label.textContent = peer.username || "RIVAL";
        $("race-screen").appendChild(label);
        renderState.scene.add(mesh);
        players[id] = { mesh, label, target: state };
      }
      players[id].target = state;
      players[id].label.textContent = peer.username || state.username || "RIVAL";
    });
    Object.keys(players).forEach((id) => { if (!activeIds.has(id)) removePlayer(id); });
    const count = Object.values(presence).filter((state) => state?.active && state.track === "Cityscape").length || 1;
    $("racers-now").textContent = `${count} RACING NOW`;
    $("racers-now").classList.remove("is-hidden");
  }

  window.addEventListener("hexgl:presence", (event) => presenceChanged(event.detail));
  if (window.hexglPresenceSnapshot) presenceChanged(window.hexglPresenceSnapshot);

  const update = (delta) => {
    // Q3: frame-rate-independent smoothing — 1 - exp(-k*dt) instead of a
    // per-frame 0.22 lerp, so live ghosts don't crawl at low FPS.
    const t = 1 - Math.exp(-15 * Math.max(0, Number(delta) || 16.6) / 1000);
    Object.values(players).forEach((player) => {
      const target = player.target;
      player.mesh.position.x += (Number(target.x) - player.mesh.position.x) * t;
      player.mesh.position.y += (Number(target.y) - player.mesh.position.y) * t;
      player.mesh.position.z += (Number(target.z) - player.mesh.position.z) * t;
      player.mesh.quaternion.x += (Number(target.qx) - player.mesh.quaternion.x) * t;
      player.mesh.quaternion.y += (Number(target.qy) - player.mesh.quaternion.y) * t;
      player.mesh.quaternion.z += (Number(target.qz) - player.mesh.quaternion.z) * t;
      player.mesh.quaternion.w += (Number(target.qw) - player.mesh.quaternion.w) * t;
      player.mesh.quaternion.normalize();
      player.mesh.updateMatrix();
      player.mesh.visible = true;
      projectLabel(player.label, player.mesh, renderState.camera, projector);
    });
  };
  const originalRender = renderState.render;
  const wrapped = function(delta, renderer) {
    update(delta);
    return originalRender.call(this, delta, renderer);
  };
  renderState.render = wrapped;
  // Q4: expose a destroy so the shell can unwrap the hook on finish/quit.
  return {
    destroy() {
      if (renderState.render === wrapped) renderState.render = originalRender;
      Object.keys(players).forEach((id) => removePlayer(id));
      window.removeEventListener("hexgl:presence", presenceChanged);
    }
  };
}

function showFinish({ time, lapTimes = [], result }) {
  $("finish-result").textContent = formatTime(time);
  $("finish-message").textContent = result === 1 ? "Lap times recorded on the global grid." : result === 4 ? "Replay complete — that was your run." : "The city won this time.";
  $("finish-laps").innerHTML = lapTimes.length ? lapTimes.map((lap, index) => `<div><span>LAP ${index + 1}</span><strong>${formatTime(lap)}</strong></div>`).join("") : "";
  $("finish-screen").classList.remove("is-hidden");
}

async function onFinish({ time, lapTimes, result }) {
  if (runSubmitted) return;
  // Defensive: the demo attract loop ends via HexGL's own reset, never here.
  if (demoMode) return;
  runSubmitted = true;
  paused = false;
  $("pause-menu").classList.add("is-hidden");
  $("ghost-delta").classList.add("is-hidden");
  $("lap-delta").classList.add("is-hidden");
  $("wrong-way").classList.add("is-hidden");
  $("replay-badge").classList.add("is-hidden");
  multiplayer.stopPresence();
  // NB: lapDeltaController is intentionally NOT destroyed here — it is
  // boot-scoped like the ghost wrapper, self-hides on step < 4, and must
  // survive for pause-restart (game.reset) races after a finish.
  if (liveGhosts?.destroy) liveGhosts.destroy();
  liveGhosts = null;
  if (gamepadController?.destroy) gamepadController.destroy();
  gamepadController = null;
  if (game?._tiltCleanup) game._tiltCleanup();
  showFinish({ time, lapTimes, result });
}

function publishState() {
  const controls = game?.components?.shipControls;
  const gameplay = game?.gameplay;
  if (!controls || !gameplay) return null;
  const p = controls.getPosition();
  const q = controls.getQuaternion();
  return {
    x: Math.round(p.x * 1000) / 1000,
    y: Math.round(p.y * 1000) / 1000,
    z: Math.round(p.z * 1000) / 1000,
    qx: Math.round(q.x * 10000) / 10000,
    qy: Math.round(q.y * 10000) / 10000,
    qz: Math.round(q.z * 10000) / 10000,
    qw: Math.round(q.w * 10000) / 10000,
    lap_time: Math.round((gameplay.currentLapTime || 0))
  };
}

// FPS auto-downgrade: samples the render loop with an EMA, and after a few
// seconds of sustained low FPS on ULTRA, soft-disables bloom/shadows/particle
// trails live and persists a lower tier so the next boot starts leaner.
function startFpsWatchdog(hex) {
  const renderCurrent = hex.manager.renderCurrent;
  let fps = 60;
  let frames = 0;
  let last = performance.now();
  let lowered = false;
  hex.manager.renderCurrent = function() {
    const now = performance.now();
    const dt = now - last;
    last = now;
    frames++;
    if (dt > 0 && dt < 500) fps = fps * 0.9 + (1000 / dt) * 0.1;
    // Require a sustained dip (~6-12s of frames) so a one-off hitch (tab
    // switch, shader compile, AV scan) doesn't permanently lower the tier.
    if (!lowered && !replayMode && frames > 360 && fps < 28 && hex.quality >= 3) {
      lowered = true;
      try {
        const current = qualitySetting();
        if (current > 1) localStorage.setItem(QUALITY_KEY, String(Math.max(1, current - 1)));
      } catch (_) { /* storage blocked */ }
      hex.softDowngrade();
      const note = $("downgrade-note");
      if (note) note.classList.remove("is-hidden");
    }
    return renderCurrent.call(this);
  };
}

function bootGame(opts) {
  const demo = Boolean(opts && opts.demo);
  demoMode = demo;
  $("launch-screen").classList.add("is-hidden");
  $("race-screen").classList.remove("is-hidden");
  $("race-screen").classList.toggle("is-demo", demo);
  $("demo-screen").classList.add("is-hidden");
  $("demo-controls").classList.remove("is-hidden");
  runSubmitted = false;
  paused = false;
  $("pause-menu").classList.add("is-hidden");
  $("wrong-way").classList.add("is-hidden");
  // Replay launch is read-once (like ool-auto-launch): 'Watch your run' sets the
  // flag and reloads; booting consumes it so a later plain reload lands on menu.
  let replayRequested = false;
  try {
    replayRequested = sessionStorage.getItem(REPLAY_KEY) === "1";
    sessionStorage.removeItem(REPLAY_KEY);
  } catch (_) { /* storage blocked */ }
  let storedReplay = null;
  try {
    const raw = localStorage.getItem(REPLAY_STORE);
    const parsed = raw ? JSON.parse(raw) : null;
    // Validate shape up front so corrupt/empty data falls back to a normal
    // race instead of booting a replay that never starts (import returns false).
    if (Array.isArray(parsed) && parsed.length > 0 && Array.isArray(parsed[0]) && parsed[0].length >= 8) storedReplay = raw;
  } catch (_) { /* storage blocked or corrupt data */ }
  replayMode = Boolean(replayRequested && storedReplay);
  if (!replayMode) $("replay-badge").classList.add("is-hidden");
  const mode = controlMode();
  const effectiveMode = mode === "tilt" && !("DeviceOrientationEvent" in window)
    ? (isTouch ? "touch" : "keyboard")
    : mode;
  $("control-toggle").textContent = labelForMode(effectiveMode);
  $("control-toggle").classList.toggle("is-hidden", replayMode);
  $("control-note").textContent = replayMode
    ? "Orbit replay of your last run · ESC to pause · ends back at the finish card"
    : ({
        keyboard: "ARROWS steer · ↑ accelerate · Q / E air-brake",
        mouse: "Move mouse to steer · click to accelerate · right-click brake",        touch: "Touch zones steer · tap TILT to use device motion",
        tilt: "Tilt to steer · hold to accelerate",
        gamepad: "Hold A to accelerate · left stick steer · triggers air-brake"
      }[effectiveMode] || "");
  const quality = qualitySetting();
  // All input comes from the shell now (keyboard/mouse/touch/gamepad/tilt);
  // the engine's legacy controller types were pruned, so controlType is 0.
  const controlType = 0;
  game = new bkcore.hexgl.HexGL({
    document,
    width: window.innerWidth,
    height: window.innerHeight,
    container: $("main"),
    overlay: $("overlay"),
    gameover: null,
    quality,
    difficulty: 0,
    hud: true,
    controlType,
    // Demo mode runs godmode so an autopilot wall-grind can never end the
    // showcase — the attract loop should only reset via a real crash-free lap.
    godmode: demo,
    mode: demo ? "demo" : (replayMode ? "replay" : "timeattack"),
    track: "Cityscape"
  });
  window.hexGL = game;
  startFpsWatchdog(game);
  let assetsLoaded = false;
  game.load({
    onLoad() {
      assetsLoaded = true;
      $("loading-progress").style.width = "100%";
      $("loading-label").textContent = "Ready — launching…";
      game.init();
      game.start();
      window.setTimeout(() => $("loading-screen").classList.add("is-hidden"), 220);
      $("replay-badge").classList.toggle("is-hidden", !replayMode);
      if (replayMode) {
        // Replay: no input bindings, ghost, or live presence — the ship is
        // driven entirely by the recorded trace and the orbit camera.
        $("control-toggle").classList.add("is-hidden");
        return;
      }
      setupMobileControls(game, effectiveMode);
      if (effectiveMode === "mouse") setupMouseControls(game);
      else if (effectiveMode === "gamepad") gamepadController = setupGamepadControls(game);
      else if (effectiveMode === "tilt") setupTiltControls(game);
      // Demo mode: input is bound (so "Take control" works instantly on any
      // device) but the autopilot owns the keys until the player intervenes.
      // No best-ghost, lap-delta, or leaderboard submissions in the attract loop.
      if (demoMode) {
        startDemo(game);
        return;
      }
      attachGhost(game, bestRun);
      liveGhosts = attachLiveGhosts(game);
      // Seed the per-lap delta baseline from the personal best so lap 1 already
      // has a target; the hexgl:lap handler tightens it as you beat it.
      sessionBestLap = personalBestLap;
      lapDeltaController = startLapDelta(game);
      multiplayer.startPresence(publishState);
    },
    onError(name) { console.error(`HexGL could not load ${name}.`); },
    onProgress(progress) {
      if (assetsLoaded) return;
      const total = progress.total || 1;
      const percent = Math.round((progress.loaded / total) * 100);
      $("loading-progress").style.width = `${percent}%`;
      $("loading-label").textContent = `Loading Cityscape… ${percent}%`;
    }
  });
}

bkcore.hexgl.HexGL.prototype.displayScore = function(time, lapTimes) {
  this.active = false;
  // Always keep the last finished run watchable (the original engine only saved
  // on new records, and used a broken key — 'race-[object Object]-replay').
  try {
    const trace = this.gameplay?.raceData?.export?.();
    if (trace && trace.length) localStorage[REPLAY_STORE] = JSON.stringify(trace);
  } catch (_) { /* storage blocked */ }
  const result = this.gameplay?.result ?? 1;
  window.dispatchEvent(new CustomEvent("hexgl:finish", { detail: { time, lapTimes: lapTimes || [], result, game: this } }));
};

window.addEventListener("hexgl:wrongway", (event) => {
  $("wrong-way").classList.toggle("is-hidden", !event.detail?.wrong);
});
window.addEventListener("hexgl:lap", async (event) => {
  const detail = event.detail;
  // Demo laps never touch the leaderboard or session-best readouts.
  if (demoMode) return;
  // Track the session best lap live (the per-lap delta baseline).
  if (detail.time > 0) {
    const improved = sessionBestLap == null || detail.time < sessionBestLap;
    if (improved) sessionBestLap = detail.time;
    if (improved && lapDeltaController?.flashNewBest) lapDeltaController.flashNewBest(detail.time);
  }
  try {
    const outcome = await database.submitLap({ time: detail.time, trace: detail.trace });
    // Fast path (Q2): non-PB laps return runs:null, so the leaderboard is only
    // re-rendered (and the network hit) when the lap actually improved the PB.
    if (outcome.runs) renderLeaderboard(outcome);
    if (outcome.improvedGlobal) $("ghost-status").textContent = "NEW GLOBAL GHOST";
  } catch (error) {
    console.warn("Lap record failed", error);
  }
});
window.addEventListener("hexgl:finish", (event) => onFinish(event.detail));
window.addEventListener("hexgl:leaderboard", (event) => renderLeaderboard(event.detail));

function setAutoLaunch() { try { sessionStorage.setItem("ool-auto-launch", "1"); } catch (_) { /* private mode */ } }
function setReplayLaunch() {
  try {
    sessionStorage.setItem(REPLAY_KEY, "1");
    sessionStorage.setItem("ool-auto-launch", "1");
  } catch (_) { /* private mode */ }
}
$("restart-button").addEventListener("click", () => { setAutoLaunch(); window.location.reload(); });
$("replay-button").addEventListener("click", () => { setReplayLaunch(); window.location.reload(); });
$("control-toggle").addEventListener("click", async () => {
  const current = controlMode();
  const next = CONTROL_MODES[(CONTROL_MODES.indexOf(current) + 1) % CONTROL_MODES.length];
  if (next === "tilt" && !(await requestTiltPermission())) return;
  localStorage.setItem(CONTROL_KEY, next);
  setAutoLaunch();
  window.location.reload();
});
function restoreFocus() { lastFocused?.focus?.(); lastFocused = null; }
$("credits-button").addEventListener("click", () => {
  lastFocused = document.activeElement;
  $("credits-panel").classList.remove("is-hidden");
  $("close-credits").focus();
});
$("close-credits").addEventListener("click", () => { $("credits-panel").classList.add("is-hidden"); restoreFocus(); });
$("credits-panel").addEventListener("click", (event) => { if (event.target.id === "credits-panel") { event.currentTarget.classList.add("is-hidden"); restoreFocus(); } });
$("settings-button").addEventListener("click", openSettings);
$("pause-settings-button").addEventListener("click", openSettings);
const closeSettings = () => { $("settings-panel").classList.add("is-hidden"); restoreFocus(); };
$("settings-close").addEventListener("click", closeSettings);
$("settings-panel").addEventListener("click", (event) => { if (event.target.id === "settings-panel") closeSettings(); });
document.querySelectorAll(".quality-option[data-quality]").forEach((option) => {
  option.addEventListener("click", () => setQuality(Number(option.dataset.quality)));
});
$("settings-sound").addEventListener("click", toggleMute);
// The auto-downgrade note is clickable so a lowered tier can be restored.
$("downgrade-note").addEventListener("click", openSettings);
window.addEventListener("pagehide", () => multiplayer.stopPresence());

if (isTouch) $("control-note").textContent = "Touch zones steer · tap TILT to use device motion";

// Browsers suspend WebAudio until a real user gesture; resume on first interaction.
const resumeAudio = () => { if (window.bkcore?.Audio?.resume) bkcore.Audio.resume(); };
window.addEventListener("pointerdown", resumeAudio, { once: true, passive: true });
window.addEventListener("keydown", resumeAudio, { once: true, passive: true });

// Launch gate: boot only from the Launch button (or an in-race reload, see setAutoLaunch).
$("start-button").addEventListener("click", () => {
  resumeAudio();
  if (!$("launch-screen").classList.contains("is-hidden")) bootGame();
});
$("demo-button").addEventListener("click", () => {
  resumeAudio();
  if (!$("launch-screen").classList.contains("is-hidden")) bootGame({ demo: true });
});
$("demo-take").addEventListener("click", takeControl);
$("demo-exit").addEventListener("click", exitDemo);
let autoLaunch = false;
let demoLaunch = false;
try { autoLaunch = sessionStorage.getItem("ool-auto-launch") === "1"; } catch (_) { /* storage blocked */ }
try { demoLaunch = sessionStorage.getItem("ool-demo-launch") === "1"; } catch (_) { /* storage blocked */ }
if (autoLaunch) {
  try { sessionStorage.removeItem("ool-auto-launch"); sessionStorage.removeItem("ool-demo-launch"); } catch (_) { /* ignore */ }
  bootGame({ demo: demoLaunch });
}

// Safety net: never leave throttle/brake/steer held after losing focus.
window.addEventListener("blur", () => {
  const keys = game?.components?.shipControls?.key;
  if (keys) for (const name in keys) keys[name] = false;
});

// Handle window resizes / device rotation (throttled so the frame never stays stretched).
let resizeScheduled = false;
window.addEventListener("resize", () => {
  if (resizeScheduled) return;
  resizeScheduled = true;
  window.setTimeout(() => {
    resizeScheduled = false;
    if (game) game.resize(window.innerWidth, window.innerHeight);
  }, 100);
});

// Pause menu. ESC is captured before the engine's ESC-to-reset handler.
document.addEventListener("keydown", (event) => {
  if (event.key === "Tab") {
    // A11y: keep focus trapped inside whichever modal is open.
    const openPanel = ["settings-panel", "credits-panel", "pause-menu"]
      .map((id) => $(id))
      .find((panel) => panel && !panel.classList.contains("is-hidden"));
    if (openPanel) {
      const focusables = [...openPanel.querySelectorAll("button, [href], [tabindex]:not([tabindex='-1'])")]
        .filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (focusables.length) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    return;
  }
  if (event.key !== "Escape" && event.keyCode !== 27) return;
  // Modal panels close first, even before a game exists (settings is reachable from the launch screen).
  if (!$("settings-panel").classList.contains("is-hidden")) {
    event.preventDefault();
    event.stopPropagation();
    closeSettings();
    return;
  }
  if (!$("credits-panel").classList.contains("is-hidden")) {
    event.preventDefault();
    event.stopPropagation();
    $("credits-panel").classList.add("is-hidden");
    restoreFocus();
    return;
  }
  if (!game) return;
  event.preventDefault();
  event.stopPropagation();
  if (paused) setPaused(false);
  else if (canPause()) setPaused(true);
}, true);

// Auto-pause when the tab is hidden or the window loses focus (switch/minimize/alt-tab)
// so the race timer never runs unseen.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && canPause() && !paused) setPaused(true);
});
window.addEventListener("blur", () => {
  if (canPause() && !paused) setPaused(true);
});

$("resume-button").addEventListener("click", () => setPaused(false));
$("mute-button").addEventListener("click", toggleMute);
$("pause-restart-button").addEventListener("click", () => { setPaused(false); game.reset(); });
$("quit-button").addEventListener("click", () => window.location.reload());

// Restore the persisted mute state (master gain already exists at this point).
try { muted = localStorage.getItem(MUTE_KEY) === "1"; } catch (_) { /* storage blocked */ }
applyMuted();
