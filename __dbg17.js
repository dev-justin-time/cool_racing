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

for(const [label, path, W] of [["2048","__collision2048.bin",2048], ["512","__collision512.bin",512]]){
  const coll = makeMap(W, fs.readFileSync(path));
  const t0 = Date.now();
  const line = AIDemo.generateRacingLine(coll, {x:-2268,y:387,z:-886});
  const ms = Date.now()-t0;
  if(!line){ console.log(label+": NULL ms="+ms); continue; }
  // off-road check using ORIGINAL map semantics (r>=250 for 2048 exact, r>=200 for 512)
  const raw = fs.readFileSync(path);
  const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0}; const i=(y*W+x)*4; return {r:raw[i]}; };
  const th = W > 640 ? 255 : 200;
  let off = 0;
  const ratio = W/6000;
  for(const p of line.points){
    const px = Math.round(W/2+p.x*ratio), pz = Math.round(W/2+p.z*ratio);
    if(get(px,pz).r < th) off++;
  }
  // spacing uniformity
  const pts = line.points;
  let minS = Infinity, maxS = 0;
  for(let i=1;i<pts.length;i++){ const d = Math.hypot(pts[i].x-pts[i-1].x, pts[i].z-pts[i-1].z); if(d<minS)minS=d; if(d>maxS)maxS=d; }
  const closure = Math.hypot(pts[0].x-pts[pts.length-1].x, pts[0].z-pts[pts.length-1].z);
  console.log(`${label}: OK pts=${pts.length} spacing=${line.spacing.toFixed(2)} minS=${minS.toFixed(1)} maxS=${maxS.toFixed(1)} closure=${closure.toFixed(1)} offroad=${off} ms=${ms}`);
}
