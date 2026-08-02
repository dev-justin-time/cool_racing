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
const sandbox = { THREE, console, Math, Date };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("bkcore/hexgl/AIDemo.js", "utf8"), sandbox);
const AIDemo = sandbox.bkcore.hexgl.AIDemo;
const W = 512;
const collBuf = fs.readFileSync("__collision.bin");
const hgtBuf = fs.readFileSync("__height.bin");
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
const hgt = makeMap(hgtBuf);
const line = AIDemo.generateRacingLine(coll, { x: -2268, y: 387, z: -886 });
console.log('line pts', line.points.length, 'spacing', line.spacing.toFixed(2), 'points[0]', line.points[0]);
console.log('points[10]', line.points[10], 'points[20]', line.points[20]);
const controls = {
  key: { forward: false, left: false, right: false, brake: false, ltrigger: false, rtrigger: false },
  dummy: { position: { x: 0, z: 0 }, heading: 0, matrix: null },
  getSpeedRatio: () => 0.6,
  heightMap: hgt,
  heightScale: 10.0,
  heightBias: 4.0
};
controls.dummy.matrix = { rotateAxis(v) { return v; } };
const scene = { add(m) { m.parent = scene; }, remove(m) { if (m.parent === this) m.parent = null; } };
const hexStub = { track: { lib: { get: () => null } } };
const racer = new AIDemo.AIRacer(hexStub, scene, {}, line, controls, { color: 0xff5566, lane: -24, speed: 330, start: 10 });
for (let i = 0; i < 8; i++) {
  racer.update(16.6);
  console.log('upd', i, 'progress', racer.progress.toFixed(2), 'pos', racer.mesh.position.x.toFixed(1), racer.mesh.position.y.toFixed(1), racer.mesh.position.z.toFixed(1));
}
// sample height manually at points[10]
const p = line.points[10];
const hx = W / 2 + p.x * (W / 6000), hz = W / 2 + p.z * (W / 6000);
console.log('manual height sample at points[10]:', hx.toFixed(1), hz.toFixed(1), '->', hgt.getPixelFBilinear(hx, hz), 'y=', (hgt.getPixelFBilinear(hx, hz) / 10 + 4).toFixed(1));
