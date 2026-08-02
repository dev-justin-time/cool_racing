const COLLECTION = "hexgl_lap_best";
const TRACK = "Cityscape";
const LOCAL_KEY = "ool-racing-best-laps-v2";
const PRESENCE_RATE = 1000 / 15;

let room = null;
let user = null;
let remote = false;
let presenceTimer = null;
let multiplayerReady = false;
let presenceGetter = null;

function emit(name, detail) {
  window.hexglPresenceSnapshot = detail;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function sortRuns(runs) {
  return (runs || [])
    .filter((run) => Number.isFinite(Number(run.best_lap_ms)))
    .sort((a, b) => Number(a.best_lap_ms) - Number(b.best_lap_ms));
}

function readLocal() {
  try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); }
  catch (_) { return []; }
}

function writeLocal(runs) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(runs.slice(0, 50))); }
  catch (_) { /* Storage can be unavailable in private mode. */ }
}

function decodeSamples(samples) {
  if (Array.isArray(samples)) return samples;
  if (typeof samples === "string") {
    try { return JSON.parse(samples); } catch (_) { return []; }
  }
  return [];
}

function cleanTrace(trace) {
  return decodeSamples(trace)
    .filter((sample) => Array.isArray(sample) && sample.length >= 8)
    .map((sample) => [
      Math.round(Number(sample[0]) || 0),
      Math.round(Number(sample[1]) * 100) / 100,
      Math.round(Number(sample[2]) * 100) / 100,
      Math.round(Number(sample[3]) * 100) / 100,
      Math.round(Number(sample[4]) * 10000) / 10000,
      Math.round(Number(sample[5]) * 10000) / 10000,
      Math.round(Number(sample[6]) * 10000) / 10000,
      Math.round(Number(sample[7]) * 10000) / 10000
    ]);
}

async function connect() {
  if (remote && room) return;
  try {
    const mod = await import("@websim/websim-socket");
    if (typeof mod.WebsimSocket !== "function") return;
    room = new mod.WebsimSocket();
    if (window.websim?.getUser) user = await window.websim.getUser();
    remote = Boolean(window.websim && room);
    if (!remote) return;

    if (typeof room.initialize === "function") await room.initialize();
    multiplayerReady = true;
    room.subscribePresence((presence) => {
      emit("hexgl:presence", {
        presence: presence || {},
        peers: room.peers || {},
        clientId: room.clientId
      });
    });
    await syncPendingLocalRecords();
    beginPresence();
  } catch (error) {
    console.info("OOL Racing is using local records/presence fallback.", error?.message || error);
    room = null;
    remote = false;
  }
}

async function syncPendingLocalRecords() {
  if (!remote || !room) return;
  const localRuns = readLocal();
  let changed = false;
  for (const record of localRuns.filter((run) => run.sync_pending)) {
    try {
      const existing = await room.collection(COLLECTION).filter({ id: record.id }).getList();
      const remoteRecord = existing[0];
      if (!remoteRecord || Number(record.best_lap_ms) < Number(remoteRecord.best_lap_ms)) {
        await room.collection(COLLECTION).upsert({
          id: record.id,
          track: TRACK,
          best_lap_ms: record.best_lap_ms,
          best_lap_trace: record.best_lap_trace,
          sample_count: record.sample_count
        });
      }
      record.sync_pending = false;
      changed = true;
    } catch (error) {
      console.warn("Pending lap sync will retry.", error);
    }
  }
  if (changed) writeLocal(localRuns);
}

async function loadLeaderboard() {
  if (!remote || !room) {
    const localRuns = sortRuns(readLocal());
    emit("hexgl:leaderboard", { runs: localRuns.slice(0, 5), personal: localRuns.find((run) => run.id === myRecordId()) || null, remote: false });
    return localRuns;
  }
  try {
    const runs = await room.query(
      `SELECT r.id,r.best_lap_ms,r.best_lap_trace,r.sample_count,r.user_id,u.username
       FROM public.${COLLECTION} r
       JOIN public.user u ON u.id = r.user_id
       WHERE r.track = $1
       ORDER BY r.best_lap_ms ASC
       LIMIT 5`,
      [TRACK]
    );
    const sorted = sortRuns(runs);
    emit("hexgl:leaderboard", { runs: sorted, personal: await loadPersonalRecord(), remote: true });
    return sorted;
  } catch (error) {
    console.warn("Global lap leaderboard unavailable; using local records.", error);
    remote = false;
    return loadLeaderboard();
  }
}

function myRecordId() {
  return `${user?.id || "local"}-${TRACK}`;
}

function isMine(run) {
  return Boolean(run && ((user?.id && run.user_id === user.id) || (!user?.id && run.id === myRecordId())));
}

async function loadPersonalRecord() {
  if (remote && room) {
    try {
      const rows = await room.collection(COLLECTION).filter({ id: myRecordId() }).getList();
      return rows[0] || null;
    } catch (_) {
      return null;
    }
  }
  return readLocal().find((run) => run.id === myRecordId()) || null;
}

async function submitLap({ time, trace }) {
  const bestLapMs = Math.round(Number(time));
  const clean = cleanTrace(trace);
  let runs = await loadLeaderboard();
  const current = await loadPersonalRecord();
  if (current && bestLapMs >= Number(current.best_lap_ms)) {
    return { saved: false, improvedGlobal: false, run: current, personal: current, runs, remote };
  }

  const record = {
    id: myRecordId(),
    track: TRACK,
    best_lap_ms: bestLapMs,
    best_lap_trace: clean,
    sample_count: clean.length,
    user_id: user?.id || "local",
    username: user?.username || "You",
    sync_pending: true
  };

  if (remote && room) {
    try {
      await room.collection(COLLECTION).upsert({
        id: record.id,
        track: TRACK,
        best_lap_ms: record.best_lap_ms,
        best_lap_trace: record.best_lap_trace,
        sample_count: record.sample_count
      });
      record.sync_pending = false;
    } catch (error) {
      console.warn("Could not write the global lap; saving locally.", error);
      remote = false;
    }
  }

  const localRuns = sortRuns([record, ...readLocal().filter((run) => run.id !== record.id)]);
  writeLocal(localRuns);
  runs = await loadLeaderboard();
  const globalBest = runs[0];
  return {
    saved: true,
    improvedGlobal: Boolean(globalBest && globalBest.id === record.id),
    run: record,
    personal: record,
    runs,
    remote
  };
}

function startPresence(getState) {
  presenceGetter = getState;
  beginPresence();
}

function beginPresence() {
  if (!presenceGetter || !multiplayerReady || !room || presenceTimer) return;
  const publish = () => {
    const state = presenceGetter?.();
    if (state) room.updatePresence({ ...state, track: TRACK, active: true });
  };
  publish();
  presenceTimer = window.setInterval(publish, PRESENCE_RATE);
}

function stopPresence() {
  if (presenceTimer) window.clearInterval(presenceTimer);
  presenceTimer = null;
  presenceGetter = null;
  if (multiplayerReady && room) room.updatePresence({ track: TRACK, active: false });
}

const ready = connect().then(loadLeaderboard);
const multiplayer = {
  ready,
  startPresence,
  stopPresence,
  get room() { return room; },
  get user() { return user; },
  get remote() { return remote; }
};
const database = {
  ready,
  load: loadLeaderboard,
  submitLap,
  decodeSamples,
  isMine,
  get remote() { return remote; },
  get user() { return user; }
};

window.HexGLDatabase = database;
window.HexGLMultiplayer = multiplayer;
window.hexglDBReady = ready;

window.addEventListener("online", async () => {
  if (remote) return;
  await connect();
  if (remote) await loadLeaderboard();
});

export { database, multiplayer, ready, decodeSamples };
