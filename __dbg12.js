"use strict";
const fs = require("fs");
const vm = require("vm");
class Vector3 { constructor(x=0,y=0,z=0){this.x=x;this.y=y;this.z=z;} set(x,y,z){this.x=x;this.y=y;this.z=z;return this;} }
class Mesh { constructor(){ this.position = new Vector3(); this.rotation = { set(){} }; this.visible=false; this.parent=null; this.updateMatrixWorld=()=>{}; } }
class MeshLambertMaterial { constructor(o){ Object.assign(this,o); } }
class Sprite { constructor(o){ Object.assign(this,o); this.position=new Vector3(); this.scale={ set(){} }; } }
class Matrix4 { rotateAxis(){ return this; } }
const THREE = { Vector3, Mesh, MeshLambertMaterial, Sprite, Matrix4, AdditiveBlending: 2 };
const sandbox = { THREE, console, Math, Date, performance: { now: () => Date.now() } };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync("bkcore/hexgl/AIDemo.js","utf8"), sandbox);
const AIDemo = sandbox.bkcore.hexgl.AIDemo;

function makeMap(W, buf){
  const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:buf[i],g:buf[i+1],b:buf[i+2],a:buf[i+3]}; };
  return { loaded:true, pixels:{width:W,height:W,data:buf}, getPixel:get, getPixelBilinear(fx,fy){ const c=this.getPixel(fx,fy); return c; }, getPixelFBilinear(fx,fy){ const c=this.getPixel(fx,fy); return c.r+c.g*255+c.b*65025; } };
}
const c2048 = makeMap(2048, fs.readFileSync("__collision2048.bin"));
const c512 = makeMap(512, fs.readFileSync("__collision512.bin"));

// Patch isRoad threshold via a hook: monkeypatch getPixel to zero out below threshold
for(const [label, coll, W] of [["2048", c2048, 2048], ["512", c512, 512]]){
  const buf = coll.pixels.data;
  for(const th of [245, 250, 252, 254, 255]){
    const orig = coll.getPixel.bind(coll);
    coll.getPixel = (x,y) => {
      const c = orig(x,y);
      if(c.r >= 255) return c; // road/checkpoint base
      return { r: c.r >= th ? 255 : 0, g: c.g, b: c.b, a: c.a };
    };
    const t0 = Date.now();
    const line = AIDemo.generateRacingLine(coll, {x:-2268,y:387,z:-886});
    const ms = Date.now()-t0;
    if(line){
      let off = 0; const ratio = W/6000;
      for(const p of line.points){ const px=Math.round(W/2+p.x*ratio), pz=Math.round(W/2+p.z*ratio); if(orig(px,pz).r < 250) off++; }
      console.log(`${label} th=${th}: OK pts=${line.points.length} spacing=${line.spacing.toFixed(2)} ms=${ms} offroad(<250)=${off}`);
    } else {
      console.log(`${label} th=${th}: NULL ms=${ms}`);
    }
    coll.getPixel = orig;
  }
}
