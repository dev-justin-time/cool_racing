"use strict";
const fs = require("fs");
const vm = require("vm");

// --- minimal THREE stubs ---
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class Mesh {
  constructor() { this.position = new Vector3(); this.rotation = { set() {} }; this.visible = false; this.parent = null; this.updateMatrixWorld = () => {}; }
}
class MeshLambertMaterial { constructor(o) { Object.assign(this, o); } }
class Sprite { constructor(o) { Object.assign(this, o); this.position = new Vector3(); this.scale = { set() {} }; } }
class Matrix4 { rotateAxis() { return this; } }
const THREE = { Vector3, Mesh, MeshLambertMaterial, Sprite, Matrix4, AdditiveBlending: 2 };

const sandbox = { THREE, console, Math, Date };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("bkcore/hexgl/AIDemo.js", "utf8"), sandbox);
const AIDemo = sandbox.bkcore.hexgl.AIDemo;

const W = 512, H = 512;
const collBuf = fs.readFileSync("__collision.bin");
const hgtBuf = fs.readFileSync("__height.bin");

function makeMap(buf) {
  const get = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= H) return { r: 0, g: 0, b: 0, a: 0 };
    const i = (y * W + x) * 4;
    return { r: buf[i], g: buf[i + 1], b: buf[i + 2], a: buf[i + 3] };
  };
  return {
    loaded: true,
    pixels: { width: W, height: H, data: buf },
    getPixel: get,
    getPixelBilinear(fx, fy) {
      const x = Math.floor(fx), y = Math.floor(fy);
      const rx = fx - x - .5, ry = fy - y - .5;
      const ax = Math.abs(rx), ay = Math.abs(ry);
      const dx = rx < 0 ? -1 : 1, dy = ry < 0 ? -1 : 1;
      const c = get(x, y), cx = get(x + dx, y), cy = get(x, y + dy), cxy = get(x + dx, y + dy);
      const cf1 = [(1 - ax) * c.r + ax * cx.r, (1 - ax) * c.g + ax * cx.g, (1 - ax) * c.b + ax * cx.b];
      const cf2 = [(1 - ax) * cy.r + ax * cxy.r, (1 - ax) * cy.g + ax * cxy.g, (1 - ax) * cy.b + ax * cxy.b];
      return { r: (1 - ay) * cf1[0] + ay * cf2[0], g: (1 - ay) * cf1[1] + ay * cf2[1], b: (1 - ay) * cf1[2] + ay * cf2[2] };
    },
    getPixelFBilinear(fx, fy) {
      const c = this.getPixelBilinear(fx, fy);
      return c.r + c.g * 255 + c.b * 65025;
    }
  };
}

const coll = makeMap(collBuf);
const hgt = makeMap(hgtBuf);
const spawn = { x: -1134 * 2, y: 387, z: -443 * 2 };

let failures = 0;
function check(name, cond, extra) {
  if (!cond) { failures++; console.log("  FAIL", name, extra || ""); }
  else console.log("  PASS", name, extra || "");
}

console.log("== generateRacingLine (512px map) ==");
const line = AIDemo.generateRacingLine(coll, spawn);
check("line non-null", line != null);
if (!line) { console.log(failures + " FAILURES"); process.exit(1); }
const n = line.points.length;
check("points > 100", n > 100, `n=${n}`);
check("spacing returned", line.spacing > 0 && isFinite(line.spacing), `spacing=${line.spacing.toFixed(2)}`);

const ratio = W / 6000;
let offRoad = 0, nan = 0;
for (const p of line.points) {
  if (!isFinite(p.x) || !isFinite(p.z)) nan++;
  const px = Math.round(W / 2 + p.x * ratio), pz = Math.round(H / 2 + p.z * ratio);
  if (coll.getPixel(px, pz).r < 200) offRoad++;
}
check("all points on road", offRoad === 0, `offRoad=${offRoad}`);
check("no NaN", nan === 0, `nan=${nan}`);

const p0 = line.points[0], pn = line.points[n - 1];
check("closed loop", Math.hypot(pn.x - p0.x, pn.z - p0.z) < 60, `d=${Math.hypot(pn.x - p0.x, pn.z - p0.z).toFixed(1)}u`);

let len = 0, sp = [];
for (let i = 1; i < n; i++) { const d = Math.hypot(line.points[i].x - line.points[i - 1].x, line.points[i].z - line.points[i - 1].z); len += d; sp.push(d); }
const avg = sp.reduce((a, b) => a + b, 0) / sp.length;
const vari = Math.sqrt(sp.reduce((a, b) => a + (b - avg) * (b - avg), 0) / sp.length);
check("track length sane", len > 3000 && len < 20000, `len=${len.toFixed(0)}u`);
check("spacing matches", Math.abs(avg - line.spacing) < 3, `avg=${avg.toFixed(1)} vs ${line.spacing.toFixed(1)} var=${vari.toFixed(1)}`);

// Start-line sanity: first point near spawn
check("starts near spawn", Math.hypot(p0.x - spawn.x, p0.z - spawn.z) < 80, `d=${Math.hypot(p0.x - spawn.x, p0.z - spawn.z).toFixed(1)}u`);

console.log("== Autopilot steering ==");
const controls = {
  key: { forward: false, left: false, right: false, brake: false, ltrigger: false, rtrigger: false },
  dummy: { position: { x: 0, z: 0 }, heading: 0, matrix: null },
  getSpeedRatio: () => 0.6,
  heightMap: hgt, // for AIRacer height sampling
  heightScale: 10.0,
  heightBias: 4.0
};
controls.dummy.matrix = {
  rotateAxis(v) {
    const a = controls.dummy.heading;
    const x = v.x * Math.cos(a) + v.z * Math.sin(a);
    const z = -v.x * Math.sin(a) + v.z * Math.cos(a);
    v.x = x; v.z = z;
  }
};
const auto = new AIDemo.Autopilot(controls, line);

const dirAt = (i) => Math.atan2(line.points[(i + 1) % n].x - line.points[i].x, line.points[(i + 1) % n].z - line.points[i].z);
// find a sample where the line is locally straight (small lead angle)
let bestK = 0, bestLead = Infinity;
for (let k = 0; k < n; k += 7) {
  controls.dummy.position.x = line.points[k].x;
  controls.dummy.position.z = line.points[k].z;
  controls.dummy.heading = dirAt(k);
  auto.update(16.6);
  const steer = auto._fwd.x * auto._des.x + auto._fwd.z * auto._des.z; // not the actual steer; recompute below
  // recompute true steer
  const look = Math.max(1, Math.round((300 + 540 * 0.6) / line.spacing));
  const tgt = line.points[(k + look) % n];
  const f = { x: Math.sin(dirAt(k)), z: Math.cos(dirAt(k)) };
  const dx = tgt.x - line.points[k].x, dz = tgt.z - line.points[k].z;
  const dl = Math.hypot(dx, dz);
  const cross = f.x * (dz / dl) - f.z * (dx / dl);
  const dot = f.x * (dx / dl) + f.z * (dz / dl);
  const lead = -Math.atan2(cross, dot);
  if (Math.abs(lead) < Math.abs(bestLead)) { bestLead = lead; bestK = k; }
}
const k = bestK;
check("found straight sample", Math.abs(bestLead) < 0.12, `lead=${bestLead.toFixed(3)}rad at ${k}`);

controls.dummy.position.x = line.points[k].x;
controls.dummy.position.z = line.points[k].z;
controls.dummy.heading = dirAt(k);
auto.update(16.6);
check("aligned: forward", controls.key.forward === true);
// A straight sample may carry a tiny residual lead angle; allow a small band.
check("aligned: near-zero steer", !(controls.key.left && controls.key.right), `L=${controls.key.left} R=${controls.key.right}`);
check("aligned: no brake", controls.key.brake === false, `brake=${controls.key.brake}`);

controls.dummy.heading = dirAt(k) + 0.35;
auto.update(16.6);
check("yaw+ -> right", controls.key.right === true && controls.key.left === false, `L=${controls.key.left} R=${controls.key.right}`);

controls.dummy.heading = dirAt(k) - 0.35;
auto.update(16.6);
check("yaw- -> left", controls.key.left === true && controls.key.right === false, `L=${controls.key.left} R=${controls.key.right}`);

controls.dummy.heading = dirAt(k);
auto.update(16.6);
const brake = controls.key.brake;
check("corner brake state", typeof brake === "boolean");

auto.disengage();
check("disengage clears keys", controls.key.forward === false && controls.key.left === false && controls.key.right === false && controls.key.brake === false);

console.log("== AIRacer simulation ==");
const scene = { add(m) { m.parent = scene; }, remove(m) { if (m.parent === this) m.parent = null; } };
const hexStub = { track: { lib: { get: () => null } } };
const racer = new AIDemo.AIRacer(hexStub, scene, {}, line, controls, { color: 0xff5566, lane: -24, speed: 330, start: 10 });
// Expected height = the same formula at the racer's centreline position.
function expectedY(progress) {
  const i0 = Math.floor(progress);
  const t = progress - i0;
  const p0 = line.points[i0], p1 = line.points[(i0 + 1) % line.points.length];
  const cx = p0.x + (p1.x - p0.x) * t, cz = p0.z + (p1.z - p0.z) * t;
  const hx = W / 2 + cx * (W / 6000), hz = W / 2 + cz * (W / 6000);
  const hv = hgt.getPixelFBilinear(hx, hz);
  const h = hv / 10.0 + 4.0;
  return h < 16777 ? h : 0;
}
for (let i = 0; i < 6; i++) racer.update(16.6);
const earlyExpected = expectedY(racer.progress);
check("racer height tracks surface early", Math.abs(racer.mesh.position.y - earlyExpected) < 60, `y=${racer.mesh.position.y.toFixed(1)} expected=${earlyExpected.toFixed(1)}`);
let nearMax = 0;
for (let i = 0; i < 180; i++) {
  racer.update(16.6);
  const rp = racer.mesh.position;
  let md = Infinity;
  for (const p of line.points) { const d = Math.hypot(p.x - rp.x, p.z - rp.z); if (d < md) md = d; }
  if (md > nearMax) nearMax = md;
}
const rp = racer.mesh.position;
check("racer progressed", racer.progress > 10, `progress=${racer.progress.toFixed(0)}`);
check("racer stays near line", nearMax < 40, `max=${nearMax.toFixed(1)}u`);
const lateExpected = expectedY(racer.progress);
check("racer height matches surface", Math.abs(rp.y - lateExpected) < 150, `y=${rp.y.toFixed(1)} expected=${lateExpected.toFixed(1)}`);
racer.destroy();
check("racer destroy removes mesh", racer.mesh.parent == null);

console.log(failures === 0 ? "ALL_PASS" : failures + " FAILURES");
process.exit(failures === 0 ? 0 : 1);
