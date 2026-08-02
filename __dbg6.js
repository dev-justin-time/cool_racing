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

// Duplicate the walk logic inline with instrumentation
const W = 2048;
const buf = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:buf[i],g:buf[i+1],b:buf[i+2],a:buf[i+3]}; };
const isRoad = (px,pz) => px>=1 && pz>=1 && px<W-1 && pz<W-1 && get(px,pz).r >= 200;

const ratio = W / 6000;
let x = Math.round(W/2 + (-2268)*ratio);
let z = Math.round(W/2 + (-886)*ratio);
console.log("spawn px:", x, z, "isRoad:", isRoad(x,z));

// Road width at spawn
const probe = (label, dx, dz) => { let d=0; let cx=x, cz=z; while(isRoad(cx+dx,cz+dz) && d<300){ cx+=dx; cz+=dz; d++; } console.log(label, d, "->", cx, cz); };
probe("+Z:", 0, 1); probe("-Z:", 0, -1); probe("+X:", 1, 0); probe("-X:", -1, 0);

// walk along +Z heading with a simple right-edge-bounded scan (like the fix)
let hx = 0, hz = 1;
const step = Math.round(ratio * 12); // ~4px at 2048
let travelled = 0;
let minDist = Infinity, minAt = -1;
for(let i = 0; i < 4000; i++){
  // perpendicular recenter bounded to road segment
  const nx = -hz, nz = hx;
  let le = 0; for(let s=1;s<=240;s++){ if(!isRoad(x+nx*s, z+nz*s)) break; le=s; }
  let re = 0; for(let s=1;s<=240;s++){ if(!isRoad(x-nx*s, z-nz*s)) break; re=s; }
  if(le+re < 3){
    console.log("degenerate at i=",i,"px",x,z,"le",le,"re",re);
    break;
  }
  // find max width-crossing point (medial-ish) — but to DEBUG, just walk the centre between edges
  const bx = x + nx*(le-re)/2 | 0; // crude centre
  const bz = z + nz*(le-re)/2 | 0;
  // advance
  if(!isRoad(x+hx*step, z+hz*step)){
    // fan scan
    let found=false;
    for(let a=1;a<=36 && !found;a++){
      const ang=a*0.06, c=Math.cos(ang), si=Math.sin(ang);
      const cand=[[hx*c-hz*si, hx*si+hz*c],[hx*c+hz*si, -hx*si+hz*c]];
      for(let d=0;d<2 && !found;d++){ if(isRoad(x+cand[d][0]*step, z+cand[d][1]*step)){ hx=cand[d][0]; hz=cand[d][1]; found=true; } }
    }
    if(!found){ console.log("dead end at i=",i,"px",x,z); break; }
  }
  x += hx*step; z += hz*step;
  travelled += 12;
  const dxs = x-(W/2+(-2268)*ratio), dzs = z-(W/2+(-886)*ratio);
  const d = Math.sqrt(dxs*dxs+dzs*dzs);
  if(travelled > 4500 && d < minDist){ minDist=d; minAt=i; }
  if(travelled > 4500 && d < step*6){ console.log("CLOSED at i=",i,"travelled",travelled.toFixed(0),"dist",d.toFixed(1)); process.exit(0); }
  if(i%500===0) console.log("i",i,"px",x,z,"travelled",travelled.toFixed(0),"minDist",minDist.toFixed(1),"at",minAt);
}
console.log("NO CLOSURE. final px",x,z,"travelled",travelled.toFixed(0),"minDist",minDist.toFixed(1),"at",minAt);
