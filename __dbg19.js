"use strict";
const fs = require("fs");
const W = 2048;
const raw = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:raw[i],g:raw[i+1],b:raw[i+2],a:raw[i+3]}; };

// pooled mask
const mw = 512, pool = 4;
const roadMask = new Uint8Array(mw*mw);
for(let mz=0;mz<mw;mz++) for(let mx=0;mx<mw;mx++){
  let hit=false;
  const x0=mx*pool, z0=mz*pool;
  outer: for(let dz=0;dz<pool;dz++) for(let dx=0;dx<pool;dx++){
    if(get(x0+dx,z0+dz).r>=255){ hit=true; break outer; }
  }
  roadMask[mz*mw+mx] = hit?1:0;
}
const isRoad = (px,pz) => px>=1 && pz>=1 && px<mw-1 && pz<mw-1 && roadMask[pz*mw+px]===1;

// walk (plain advance + fan scan) from spawn
const ratio = mw/6000;
const startX = Math.round(mw/2 + (-2268)*ratio), startZ = Math.round(mw/2 + (-886)*ratio);
console.log("spawn", startX, startZ, "road", isRoad(startX,startZ));
let x=startX, z=startZ, hx=0, hz=1;
const step = Math.max(2, Math.round(ratio*12)); // 1.02 -> 2px
const spacing = step/ratio;
const pts = [];
let travelled = 0;
let minD = Infinity;
for(let i=0;i<9000;i++){
  pts.push([x,z]);
  if(!isRoad(x+hx*step, z+hz*step)){
    let found=false;
    for(let a=1;a<=36 && !found;a++){
      const ang=a*0.06,c=Math.cos(ang),si=Math.sin(ang);
      const cand=[[hx*c-hz*si,hx*si+hz*c],[hx*c+hz*si,-hx*si+hz*c]];
      for(let d=0;d<2 && !found;d++){ if(isRoad(x+cand[d][0]*step,z+cand[d][1]*step)){ hx=cand[d][0]; hz=cand[d][1]; found=true; } }
    }
    if(!found){ console.log("DEAD END i=",i,"at",x,z); break; }
  }
  x+=hx*step; z+=hz*step;
  travelled+=spacing;
  const d=Math.hypot(x-startX,z-startZ);
  if(d<minD) minD=d;
  if(travelled>4500 && d<step*6){ console.log("CLOSED i=",i,"trav",travelled.toFixed(0),"dist",d.toFixed(1),"pts",pts.length); process.exit(0); }
  if(i%600===0) console.log("i",i,"px",x,z,"trav",travelled.toFixed(0),"minD",minD.toFixed(1));
}
console.log("NO CLOSURE pts",pts.length,"trav",travelled.toFixed(0),"minD",minD.toFixed(1));
