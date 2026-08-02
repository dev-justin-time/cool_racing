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

// Exact copy of the generator walk with instrumentation (bounded segment scan)
const W = 2048;
const buf = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:buf[i],g:buf[i+1],b:buf[i+2],a:buf[i+3]}; };
const isRoad = (px,pz) => px>=1 && pz>=1 && px<W-1 && pz<W-1 && get(px,pz).r >= 200;

const ratio = W / 6000;
const startX = Math.round(W/2 + (-2268)*ratio);
const startZ = Math.round(W/2 + (-886)*ratio);
let x = startX, z = startZ;
let hx = 0, hz = 1;
const step = Math.max(2, Math.round(ratio * 12));
const spacing = step / ratio;
console.log("step px:", step, "spacing:", spacing.toFixed(2), "start:", x, z);

const pts = [];
let travelled = 0;
let minD = Infinity, minAt = -1, minPx = [0,0];
for(let i = 0; i < 9000; i++){
  const nx = -hz, nz = hx;
  let le = 0; for(let s=1;s<=240;s++){ if(!isRoad(x+nx*s, z+nz*s)) break; le=s; }
  let re = 0; for(let s=1;s<=240;s++){ if(!isRoad(x-nx*s, z-nz*s)) break; re=s; }
  if(le+re < 3){
    // recovery spiral
    let rx=-1, rz=-1;
    for(let rr=1; rr<=60 && rx<0; rr++){
      for(let aa=0; aa<8; aa++){
        const cxx=Math.round(x+Math.cos(aa*Math.PI/4)*rr), czz=Math.round(z+Math.sin(aa*Math.PI/4)*rr);
        if(isRoad(cxx,czz)){ rx=cxx; rz=czz; break; }
      }
    }
    if(rx<0){ console.log("NO ROAD at i=",i); break; }
    if(pts.length>0){
      const lp = pts[pts.length-1];
      const lpx = Math.round(W/2+lp.x*ratio), lpz = Math.round(W/2+lp.z*ratio);
      const ddx=rx-lpx, ddz=rz-lpz, dl=Math.sqrt(ddx*ddx+ddz*ddz)||1;
      hx=ddx/dl; hz=ddz/dl;
    }
    x=rx; z=rz;
    if(i%100===0) console.log("  [recover] i",i,"at",x,z);
    continue;
  }
  // bounded max-DT scan
  let bx=x, bz=z, bd=-1;
  for(let s=-re; s<=le; s++){
    const tx=Math.round(x+nx*s), tz=Math.round(z+nz*s);
    // approximate dist with the crude centre for debug speed
    const dv = -Math.abs(s);
    if(dv>bd){ bd=dv; bx=tx; bz=tz; }
  }
  x=bx; z=bz;
  pts.push({ x: (x-W/2)/ratio, z: (z-W/2)/ratio });
  // advance
  if(!isRoad(x+hx*step, z+hz*step)){
    let found=false;
    for(let a=1; a<=36 && !found; a++){
      const ang=a*0.06, c=Math.cos(ang), si=Math.sin(ang);
      const cand=[[hx*c-hz*si, hx*si+hz*c],[hx*c+hz*si, -hx*si+hz*c]];
      for(let d=0; d<2 && !found; d++){
        if(isRoad(x+cand[d][0]*step, z+cand[d][1]*step)){ hx=cand[d][0]; hz=cand[d][1]; found=true; }
      }
    }
    if(!found){ console.log("DEAD END i=",i,"at",x,z); break; }
  }
  x += hx*step; z += hz*step;
  travelled += spacing;
  const dxs=x-startX, dzs=z-startZ;
  const d=Math.sqrt(dxs*dxs+dzs*dzs);
  if(travelled > 4500 && d < minD){ minD=d; minAt=i; minPx=[x,z]; }
  if(travelled > 4500 && d < step*6){
    console.log("CLOSED i=",i,"travelled",travelled.toFixed(0),"dist",d.toFixed(1),"pts",pts.length);
    process.exit(0);
  }
  if(i%200===0) console.log("i",i,"px",x.toFixed(0),z.toFixed(0),"trav",travelled.toFixed(0),"minD",minD.toFixed(1));
}
console.log("NO CLOSURE. pts",pts.length,"travelled",travelled.toFixed(0),"minD",minD.toFixed(1),"at i",minAt,"px",minPx[0],minPx[1]);
