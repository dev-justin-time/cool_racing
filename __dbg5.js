"use strict";
const fs = require("fs");
const W = 2048;
const collBuf = fs.readFileSync("__collision2048.bin");
function get(px, py) {
  px = Math.round(px); py = Math.round(py);
  if (px < 0 || py < 0 || px >= W || py >= W) return { r: 0, g: 0, b: 0, a: 0 };
  const i = (py * W + px) * 4;
  return { r: collBuf[i], g: collBuf[i + 1], b: collBuf[i + 2], a: collBuf[i + 3] };
}
const ratio = W / 6000.0;
function isRoad(px, pz) {
  if (px < 1 || pz < 1 || px >= W - 1 || pz >= W - 1) return false;
  return get(px, pz).r >= 200;
}
// DT
const roadMask = new Uint8Array(W * W);
const dist = new Uint16Array(W * W);
const INF = 65535;
for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
  const idx = py * W + px;
  if (isRoad(px, py)) { roadMask[idx] = 1; dist[idx] = INF; }
}
const nb = [null, null, null, null];
for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
  const idx = py * W + px;
  if (!roadMask[idx]) continue;
  let best = INF, k = 0;
  if (py > 0 && px > 0) nb[k++] = [-1, -1, 4];
  if (py > 0) nb[k++] = [-1, 0, 3];
  if (py > 0 && px < W - 1) nb[k++] = [-1, 1, 4];
  if (px > 0) nb[k++] = [0, -1, 3];
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
  let best = dist[idx], k = 0;
  if (py < W - 1 && px < W - 1) nb[k++] = [1, 1, 4];
  if (py < W - 1) nb[k++] = [1, 0, 3];
  if (py < W - 1 && px > 0) nb[k++] = [1, -1, 4];
  if (px < W - 1) nb[k++] = [0, 1, 3];
  for (let n = 0; n < k; n++) {
    const dv = dist[(py + nb[n][0]) * W + (px + nb[n][1])];
    if (dv >= INF) continue;
    const v = dv + nb[n][2];
    if (v < best) best = v;
  }
  dist[idx] = best;
}
const dAt = (px, pz) => (px < 0 || pz < 0 || px >= W || pz >= W ? 0 : dist[pz * W + px]);

const x0 = 250, z0 = 722;
let x = x0, z = z0;
let hx = 0, hz = 1;
const step = 4;
const recenterR = 68;
const startX = x, startZ = z;
const walked = [];
let minDist = Infinity, minAt = -1;
for (let i = 0; i < 9000; i++) {
  const nx = -hz, nz = hx;
  let bx = x, bz = z, bd = -1;
  for (let s = -recenterR; s <= recenterR; s++) {
    const tx = Math.round(x + nx * s), tz = Math.round(z + nz * s);
    if (!isRoad(tx, tz)) continue;
    const dv = dAt(tx, tz);
    if (dv > bd) { bd = dv; bx = tx; bz = tz; }
  }
  if (bd < 1) { console.log("recover at", i); let rx = -1, rz = -1;
    for (let rr = 1; rr <= 60 && rx < 0; rr++) for (let aa = 0; aa < 8; aa++) {
      const cxx = Math.round(x + Math.cos(aa * Math.PI / 4) * rr), czz = Math.round(z + Math.sin(aa * Math.PI / 4) * rr);
      if (isRoad(cxx, czz)) { rx = cxx; rz = czz; break; }
    }
    if (rx < 0) break; x = rx; z = rz; continue; }
  x = bx; z = bz;
  walked.push([x, z]);
  const d = Math.hypot(x - startX, z - startZ);
  if (d < minDist) { minDist = d; minAt = walked.length - 1; }
  if (walked.length === 1 || walked.length === 50 || walked.length === 100 || walked.length === 200) {
    // road width at this point along perpendicular
    let l = 0, r2 = 0;
    while (isRoad(x - nx * (l + 1), z - nz * (l + 1))) l++;
    while (isRoad(x + nx * (r2 + 1), z + nz * (r2 + 1))) r2++;
    console.log("pt", walked.length, "pos", x.toFixed(0), z.toFixed(0), "roadwidth", l + r2 + 1, "distToStart", d.toFixed(1));
  }
  if (!isRoad(Math.round(x + hx * step), Math.round(z + hz * step))) {
    let found = false;
    for (let a = 1; a <= 36 && !found; a++) {
      const ang = a * 0.06, c = Math.cos(ang), si = Math.sin(ang);
      const cand = [[hx * c - hz * si, hx * si + hz * c], [hx * c + hz * si, -hx * si + hz * c]];
      for (let d = 0; d < 2 && !found; d++) if (isRoad(Math.round(x + cand[d][0] * step), Math.round(z + cand[d][1] * step))) { hx = cand[d][0]; hz = cand[d][1]; found = true; }
    }
  }
  x += hx * step; z += hz * step;
}
console.log("minDistToStart px:", minDist.toFixed(1), "at walk index:", minAt);
console.log("walked:", walked.length);
// first 15 points
console.log("first 15 walked:", walked.slice(0, 15).map(p => p.map(v => Math.round(v)).join(",")).join(" | "));
// find where the walk crosses z near 722 again (x when z crosses 720-725) after the first 100 points
const crossings = [];
for (let i = 100; i < walked.length; i++) if (Math.abs(walked[i][1] - 722) < 8) crossings.push([i, walked[i][0], walked[i][1]]);
console.log("crossings of z~722 after idx 100:", crossings.slice(0, 20));
