"use strict";
const fs = require("fs");
const W = 512;
const raw = fs.readFileSync("__collision512.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:raw[i],g:raw[i+1],b:raw[i+2],a:raw[i+3]}; };
const mw = 512, pool = 1;
const roadMask = new Uint8Array(mw*mw);
for(let mz=0;mz<mw;mz++) for(let mx=0;mx<mw;mx++){
  roadMask[mz*mw+mx] = get(mx,mz).r >= 200 ? 1 : 0;
}
const isRoad = (px,pz) => px>=1 && pz>=1 && px<mw-1 && pz<mw-1 && roadMask[pz*mw+px]===1;

// plain walk + fan scan
const ratio = mw/6000;
const startX = Math.round(mw/2 + (-2268)*ratio), startZ = Math.round(mw/2 + (-886)*ratio);
let x=startX, z=startZ, hx=0, hz=1;
const step = Math.max(2, Math.round(ratio*12));
const spacing = step/ratio;
let travelled=0;
console.log("spawn", startX, startZ, "road", isRoad(startX,startZ), "step", step);
for(let i=0;i<9000;i++){
  const d=Math.hypot(x-startX,z-startZ);
  if(travelled>4500 && d<step*6){ console.log("CLOSED i=",i,"trav",travelled.toFixed(0),"dist",d.toFixed(1)); process.exit(0); }
  if(!isRoad(x+hx*step,z+hz*step)){
    let found=false;
    for(let a=1;a<=36&&!found;a++){
      const ang=a*0.06,c=Math.cos(ang),si=Math.sin(ang);
      const cand=[[hx*c-hz*si,hx*si+hz*c],[hx*c+hz*si,-hx*si+hz*c]];
      for(let dd=0;dd<2&&!found;dd++){ if(isRoad(Math.round(x+cand[dd][0]*step),Math.round(z+cand[dd][1]*step))){ hx=cand[dd][0]; hz=cand[dd][1]; found=true; } }
    }
    if(!found){ console.log("DEAD END i=",i,"at",x,z,"trav",travelled.toFixed(0)); break; }
  }
  x+=hx*step; z+=hz*step;
  travelled+=spacing;
  if(i%200===0) console.log("i",i,"px",x.toFixed(0),z.toFixed(0),"trav",travelled.toFixed(0));
}
console.log("NO CLOSURE final",x.toFixed(0),z.toFixed(0),"trav",travelled.toFixed(0));
