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

const W = 2048;
const buf = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:buf[i],g:buf[i+1],b:buf[i+2],a:buf[i+3]}; };
const isRoad = (px,pz) => px>=1 && pz>=1 && px<W-1 && pz<W-1 && get(px,pz).r >= 200;

// run a simplified version of the walk with instrumentation at r>=200
const ratio = W/6000;
let x = Math.round(W/2 + (-2268)*ratio);
let z = Math.round(W/2 + (-886)*ratio);
let hx = 0, hz = 1;
const step = Math.max(2, Math.round(ratio*12)); // 4px
const startX = x, startZ = z;
let points = 0, travelled = 0;
let minDist = Infinity, minAt = -1;
let minGap = Infinity, minGapAt = -1;
let offRoad = 0, deadEnds = 0, degenerate = 0;

// sample the road width at spawn to see the cross-section
let nx = -hz, nz = hx;
let le = 0; for(let s=1;s<=240;s++){ if(!isRoad(x+nx*s,z+nz*s)) break; le=s; }
let re = 0; for(let s=1;s<=240;s++){ if(!isRoad(x-nx*s,z-nz*s)) break; re=s; }
console.log("spawn", x, z, "roadwidth L", le, "R", re, "total", le+re+1);

for(let i = 0; i < 9000; i++){
  const nx = -hz, nz = hx;
  let le = 0; for(let s=1;s<=240;s++){ if(!isRoad(x+nx*s,z+nz*s)) break; le=s; }
  let re = 0; for(let s=1;s<=240;s++){ if(!isRoad(x-nx*s,z-nz*s)) break; re=s; }
  if(le+re < 3){ degenerate++; 
    // spiral
    let rx=-1, rz=-1;
    for(let rr=1; rr<=60 && rx<0; rr++){ for(let aa=0; aa<8; aa++){ const cxx=Math.round(x+Math.cos(aa*Math.PI/4)*rr), czz=Math.round(z+Math.sin(aa*Math.PI/4)*rr); if(isRoad(cxx,czz)){rx=cxx;rz=czz;break;} } }
    if(rx<0){ console.log("DEAD-END no-road at i=",i); break; }
    x=rx; z=rz; continue; 
  }
  // max-DT recenter within segment
  // (skip for speed — just check heading advance here)
  // advance
  if(!isRoad(x+hx*step, z+hz*step)){
    let found=false;
    for(let a=1; a<=36 && !found; a++){
      const ang=a*0.06, c=Math.cos(ang), si=Math.sin(ang);
      const cand=[[hx*c-hz*si, hx*si+hz*c],[hx*c+hz*si, -hx*si+hz*c]];
      for(let d=0; d<2 && !found; d++){ if(isRoad(x+cand[d][0]*step, z+cand[d][1]*step)){ hx=cand[d][0]; hz=cand[d][1]; found=true; } }
    }
    if(!found){ deadEnds++; console.log("DEAD-END fan at i=",i,"px",x,z); break; }
  }
  x += hx*step; z += hz*step;
  points++; travelled += step/ratio;
  if(!isRoad(x,z)) offRoad++;
  const dxs=x-startX, dzs=z-startZ;
  const d = Math.sqrt(dxs*dxs+dzs*dzs);
  if(travelled > 4500){
    if(d < minDist){ minDist=d; minAt=i; }
    if(d < minGap){ minGap=d; minGapAt=i; }
    if(d < step*6){ console.log("CLOSED at i=",i,"travelled",travelled.toFixed(0),"dist",d.toFixed(1)); process.exit(0); }
  }
  if(i%500===0) console.log("i",i,"px",x.toFixed(0),z.toFixed(0),"trav",travelled.toFixed(0),"minD",minDist.toFixed(1),"minGap",minGap.toFixed(1),"offRoad",offRoad,"deg",degenerate);
}
console.log("NO CLOSURE. points",points,"travelled",travelled.toFixed(0),"offRoad",offRoad,"degenerate",degenerate,"deadEnds",deadEnds,"minDist",minDist.toFixed(1),"at",minAt,"minGap",minGap.toFixed(1),"at",minGapAt);
