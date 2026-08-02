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
  return { loaded:true, pixels:{width:W,height:W,data:buf}, getPixel:get,
    getPixelBilinear(fx,fy){ const c=this.getPixel(fx,fy); return c; },
    getPixelFBilinear(fx,fy){ const c=this.getPixel(fx,fy); return c.r+c.g*255+c.b*65025; } };
}

// instrument: wrap generateRacingLine with a tracing version
const src = fs.readFileSync("bkcore/hexgl/AIDemo.js","utf8");
// Count road pixels in mask: replicate mask build
for(const [label, path, W] of [["2048","__collision2048.bin",2048], ["512","__collision512.bin",512]]){
  const raw = fs.readFileSync(path);
  const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:raw[i],g:raw[i+1],b:raw[i+2],a:raw[i+3]}; };
  const mw = 512;
  const pool = W > 640 ? Math.round(W/mw) : 1;
  let roadCount = 0;
  let spawnRoad = false;
  const ratio = mw/6000;
  const sx = Math.round(mw/2 + (-2268)*ratio);
  const sz = Math.round(mhCheck(mw)/2 + (-886)*ratio);
  if(pool > 1){
    for(let mz=0;mz<mw;mz++) for(let mx=0;mx<mw;mx++){
      let hit=false;
      const x0=mx*pool, z0=mz*pool;
      outer: for(let dz=0;dz<pool;dz++) for(let dx=0;dx<pool;dx++){
        if(get(x0+dx,z0+dz).r>=255){ hit=true; break outer; }
      }
      if(hit) roadCount++;
      if(mx===sx && mz===sz) spawnRoad=hit;
    }
  } else {
    for(let mz=0;mz<mw;mz++) for(let mx=0;mx<mw;mx++){
      if(get(mx,mz).r>=200) roadCount++;
      if(mx===sx && mz===sz && get(mx,mz).r>=200) spawnRoad=true;
    }
  }
  console.log(`${label}: pool=${pool} roadMask=${roadCount} spawnMask(${sx},${sz}) road=${spawnRoad}`);
}
function mhCheck(){ return 512; }
