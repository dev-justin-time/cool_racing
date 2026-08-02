"use strict";
const fs = require("fs");
const vm = require("vm");
const W = 2048;
const collBuf = fs.readFileSync("__collision2048.bin");
function get(px, py) {
  px = Math.round(px); py = Math.round(py);
  if (px < 0 || py < 0 || px >= W || py >= W) return { r: 0, g: 0, b: 0, a: 0 };
  const i = (py * W + px) * 4;
  return { r: collBuf[i], g: collBuf[i + 1], b: collBuf[i + 2], a: collBuf[i + 3] };
}
const ratio = W / 6000.0;
const spawn = { x: -2268, y: 387, z: -886 };
function isRoad(px, pz) {
  if (px < 1 || pz < 1 || px >= W - 1 || pz >= W - 1) return false;
  return get(px, pz).r >= 200;
}
// road width at spawn
let l = 0, r = 0;
while (isRoad(250 - l, 722)) l++;
while (isRoad(250 + r, 722)) r++;
console.log("spawn road width:", l + r + 1, "left", l, "right", r);
// spawn px
const x0 = Math.round(W / 2 + spawn.x * ratio);
const z0 = Math.round(W / 2 + spawn.z * ratio);
console.log("spawn px", x0, z0, "road?", isRoad(x0, z0));

// DT (chamfer) — same as AIDemo
const roadMask = new Uint8Array(W * W);
const dist = new Uint16Array(W * W);
const INF = 65535;
for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
  const idx = py * W + px;
  if (isRoad(px, py)) { roadMask[idx] = 1; dist[idx] = INF; }
}
let roadPx = 0;
for (let i = 0; i < W * W; i++) if (roadMask[i]) roadPx++;
console.log("road px:", roadPx);
const nb = [null, null, null, null];
const fwd = (px, py) => {
  let k = 0;
  if (py > 0 && px > 0) nb[k++] = [-1, -1, 4];
  if (py > 0) nb[k++] = [-1, 0, 3];
  if (py > 0 && px < W - 1) nb[k++] = [-1, 1, 4];
  if (px > 0) nb[k++] = [0, -1, 3];
  return k;
};
const bwd = (px, py) => {
  let k = 0;
  if (py < W - 1 && px < W - 1) nb[k++] = [1, 1, 4];
  if (py < W - 1) nb[k++] = [1, 0, 3];
  if (py < W - 1 && px > 0) nb[k++] = [1, -1, 4];
  if (px < W - 1) nb[k++] = [0, 1, 3];
  return k;
};
for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
  const idx = py * W + px;
  if (!roadMask[idx]) continue;
  let best = INF;
  const k = fwd(px, py);
  for (let n = 0; n < k; n++) {
    const dv = dist[(py + nb[n][0]) * W + (px + nb[n][1])];
    if (dv >= INF) continue;
    const v = dv + nb[n][2];
    if (v < best) best = v;
  }
  dist[idx] = best;
}
for (let py = W - 1; py >= 0; py--) for (let px = W - 1; px >= 0; px--) {
  const idx = py * W + px;
  if (!roadMask[idx]) continue;
  let best = dist[idx];
  const k = bwd(px, py);
  for (let n = 0; n < k; n++) {
    const dv = dist[(py + nb[n][0]) * W + (px + nb[n][1])];
    if (dv >= INF) continue;
    const v = dv + nb[n][2];
    if (v < best) best = v;
  }
  dist[idx] = best;
}
const dAt = (px, pz) => (px < 0 || pz < 0 || px >= W || pz >= W ? 0 : dist[pz * W + px]);

// walk with instrumentation
let x = x0, z = z0;
let hx = 0, hz = 1;
const step = Math.max(2, Math.round(ratio * 12));
const spacing = step / ratio;
const recenterR = Math.max(16, Math.round(ratio * 200));
console.log("step", step, "spacing", spacing.toFixed(2), "recenterR", recenterR);
let travelledWorld = 0;
const startX = x, startZ = z;
let points = 0;
let breakReason = "maxSteps";
let recovers = 0;
for (let i = 0; i < 9000; i++) {
  const nx = -hz, nz = hx;
  let bx = x, bz = z, bd = -1;
  for (let s = -recenterR; s <= recenterR; s++) {
    const tx = Math.round(x + nx * s), tz = Math.round(z + nz * s);
    if (!isRoad(tx, tz)) continue;
    const dv = dAt(tx, tz);
    if (dv > bd) { bd = dv; bx = tx; bz = tz; }
  }
  if (bd < 1) {
    recovers++;
    let rx = -1, rz = -1;
    for (let rr = 1; rr <= 60 && rx < 0; rr++) for (let aa = 0; aa < 8; aa++) {
      const cxx = Math.round(x + Math.cos(aa * Math.PI / 4) * rr);
      const czz = Math.round(z + Math.sin(aa * Math.PI / 4) * rr);
      if (isRoad(cxx, czz)) { rx = cxx; rz = czz; break; }
    }
    if (rx < 0) { breakReason = "recovery deadend at i=" + i + " pos=" + x + "," + z; break; }
    x = rx; z = rz;
    continue;
  }
  x = bx; z = bz;
  points++;
  if (!isRoad(Math.round(x + hx * step), Math.round(z + hz * step))) {
    let found = false;
    for (let a = 1; a <= 36 && !found; a++) {
      const ang = a * 0.06;
      const c = Math.cos(ang), si = Math.sin(ang);
      const cand = [[hx * c - hz * si, hx * si + hz * c], [hx * c + hz * si, -hx * si + hz * c]];
      for (let d = 0; d < 2 && !found; d++) {
        if (isRoad(Math.round(x + cand[d][0] * step), Math.round(z + cand[d][1] * step))) {
          hx = cand[d][0]; hz = cand[d][1]; found = true;
        }
      }
    }
    if (!found) { breakReason = "fanfail at i=" + i + " pos=" + x.toFixed(1) + "," + z.toFixed(1); break; }
  }
  x += hx * step;
  z += hz * step;
  travelledWorld += spacing;
  if (travelledWorld > 4500) {
    const dx = x - startX, dz = z - startZ;
    if (dx * dx + dz * dz < step * step * 36) { breakReason = "CLOSED at i=" + i + " dist=" + Math.hypot(dx, dz).toFixed(1) + "px"; break; }
  }
  if (i % 1000 === 0 && i > 0) {
    // closest approach to start so far
    let md = Infinity;
    for (let s2 = 0; s2 < points; s2++) {
      // not tracked; skip
    }
  }
}
console.log("walk result:", breakReason, "| points:", points, "| travelledWorld:", Math.round(travelledWorld), "| recovers:", recovers, "| final pos:", x.toFixed(1), z.toFixed(1));
// distance from final pos to start
console.log("final-to-start dist px:", Math.hypot(x - startX, z - startZ).toFixed(1));
