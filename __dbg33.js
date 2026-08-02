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

const W = 512;
const raw = fs.readFileSync("__collision512.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:raw[i],g:raw[i+1],b:raw[i+2],a:raw[i+3]}; };
const coll = { loaded:true, pixels:{width:W,height:W,data:raw}, getPixel:get,
  getPixelBilinear(fx,fy){ const c=this.getPixel(fx,fy); return c; },
  getPixelFBilinear(fx,fy){ const c=this.getPixel(fx,fy); return c.r+c.g*255+c.b*65025; } };

const t0=Date.now();
const line = AIDemo.generateRacingLine(coll, {x:-2268,y:387,z:-886});
console.log("ms:", Date.now()-t0);
console.log("line:", line ? `pts=${line.points.length} spacing=${line.spacing.toFixed(2)} mapWidth=${line.mapWidth}` : "NULL");

// Also test with a 2048 map using box-average normalization path
if(!line){
  // manually probe: is the issue the mask? count mask road px via same logic
  const mw=512;
  let road=0, spawnRoad=false;
  const ratio=mw/6000;
  const sx=Math.round(mw/2+(-2268)*ratio), sz=Math.round(mw/2+(-886)*ratio);
  for(let mz=0;mz<mw;mz++) for(let mx=0;mx<mw;mx++){
    if(get(mx,mz).r>=200){ road++; if(mx===sx&&mz===sz) spawnRoad=true; }
  }
  console.log("mask road px:", road, "spawn road:", spawnRoad, "at", sx, sz);
}
