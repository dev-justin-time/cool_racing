"use strict";
const fs = require("fs");
const vm = require("vm");
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
}
class Mesh { constructor() { this.position = new Vector3(); this.rotation = { set() {} }; this.visible = false; this.parent = null; this.updateMatrixWorld = () => {}; } }
class MeshLambertMaterial { constructor(o) { Object.assign(this, o); } }
class Sprite { constructor(o) { Object.assign(this, o); this.position = new Vector3(); this.scale = { set() {} }; } }
class Matrix4 { rotateAxis() { return this; } }
const THREE = { Vector3, Mesh, MeshLambertMaterial, Sprite, Matrix4, AdditiveBlending: 2 };
const sandbox = { THREE, console, Math, Date, performance: { now: () => Date.now() } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("bkcore/hexgl/AIDemo.js", "utf8"), sandbox);
const AIDemo = sandbox.bkcore.hexgl.AIDemo;
const W = 2048;
const collBuf = fs.readFileSync("__collision2048.bin");
function makeMap(buf) {
  const get = (x, y) => {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= W || y >= W) return { r: 0, g: 0, b: 0, a: 0 };
    const i = (y * W + x) * 4;
    return { r: buf[i], g: buf[i + 1], b: buf[i + 2], a: buf[i + 3] };
  };
  return {
    loaded: true,
    pixels: { width: W, height: W, data: buf },
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
const t0 = Date.now();
const line = AIDemo.generateRacingLine(coll, { x: -2268, y: 387, z: -886 });
console.log("elapsed ms:", Date.now() - t0);
console.log("line:", line ? `points=${line.points.length} spacing=${line.spacing.toFixed(2)}` : "NULL");
if (line) {
  let off = 0;
  const ratio = W / 6000;
  for (const p of line.points) {
    const px = Math.round(W / 2 + p.x * ratio), pz = Math.round(W / 2 + p.z * ratio);
    if (coll.getPixel(px, pz).r < 200) off++;
  }
  console.log("off-road:", off, "closure:", Math.hypot(line.points[0].x - line.points[line.points.length - 1].x, line.points[0].z - line.points[line.points.length - 1].z).toFixed(1));
}
