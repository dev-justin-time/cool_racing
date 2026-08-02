"use strict";
const fs = require("fs");
const W = 2048;
const raw = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:raw[i],g:raw[i+1],b:raw[i+2],a:raw[i+3]}; };
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

// Reproduce the walk exactly, printing when the fan triggers
const ratio = mw/6000;
const startX = Math.round(mw/2 + (-2268)*ratio), startZ = Math.round(mw/2 + (-886)*ratio);
let x=startX, z=startZ, hx=0, hz=1;
const step = Math.max(2, Math.round(ratio*12));
const spacing = step/ratio;
let travelled = 0;
for(let i=0;i<200;i++){
  if(!isRoad(x+hx*step, z+hz*step)){
    console.log(`i=${i} x=${x} z=${z} hx=${hx.toFixed(2)} hz=${hz.toFixed(2)} roadAhead=${isRoad(Math.round(x+hx*step),Math.round(z+hz*step))}`);
    let found=false;
    for(let a=1;a<=36 && !found;a++){
      const ang=a*0.06,c=Math.cos(ang),si=Math.sin(ang);
      const cand=[[hx*c-hz*si,hx*si+hz*c],[hx*c+hz*si,-hx*si+hz*c]];
      for(let d=0;d<2 && !found;d++){
        const tx=Math.round(x+cand[d][0]*step), tz=Math.round(z+cand[d][1]*step);
        if(isRoad(tx,tz)){
          console.log(`   found a=${a} d=${d} -> (${tx},${tz}) road=${isRoad(tx,tz)} heading (${hx.toFixed(3)},${hz.toFixed(3)})->(${cand[d][0].toFixed(3)},${cand[d][1].toFixed(3)})`);
          hx=cand[d][0]; hz=cand[d][1]; found=true;
        }
      }
    }
    if(!found){ console.log(`   DEAD END at i=${i} x=${x} z=${z}`); 
      // dump the 5x5 neighborhood
      let out="";
      for(let dz=-3;dz<=3;dz++){ let row=""; for(let dx=-3;dx<=3;dx++){ row+=isRoad(x+dx,z+dz)?"#":"."; } out+=row+"\n"; }
      console.log(out);
      process.exit(0);
    }
  }
  x+=hx*step; z+=hz*step;
  travelled+=spacing;
}
