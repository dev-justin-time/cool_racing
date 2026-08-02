"use strict";
const fs = require("fs");
const W = 2048;
const buf = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:buf[i],g:buf[i+1],b:buf[i+2],a:buf[i+3]}; };
const isRoad = (px,pz) => px>=1 && pz>=1 && px<W-1 && pz<W-1 && get(px,pz).r >= 255;

const ratio = W/6000;
const startX = Math.round(W/2 + (-2268)*ratio), startZ = Math.round(W/2 + (-886)*ratio);
let x = startX, z = startZ, hx = 0, hz = 1;
const step = Math.max(2, Math.round(ratio*12)); // 4px
const spacing = step/ratio;
const pts = [];
let travelled = 0;
let minD = Infinity;
for(let i = 0; i < 9000; i++){
  pts.push([x,z]);
  // advance with fan-scan
  if(!isRoad(x+hx*step, z+hz*step)){
    let found=false;
    for(let a=1;a<=36 && !found;a++){
      const ang=a*0.06, c=Math.cos(ang), si=Math.sin(ang);
      const cand=[[hx*c-hz*si, hx*si+hz*c],[hx*c+hz*si, -hx*si+hz*c]];
      for(let d=0;d<2 && !found;d++){ if(isRoad(x+cand[d][0]*step, z+cand[d][1]*step)){ hx=cand[d][0]; hz=cand[d][1]; found=true; } }
    }
    if(!found){ console.log("DEAD END i=",i); break; }
  }
  x += hx*step; z += hz*step;
  travelled += spacing;
  const d = Math.hypot(x-startX, z-startZ);
  if(d < minD) minD = d;
  if(travelled > 4500 && d < step*6){ console.log("CLOSED i=",i,"trav",travelled.toFixed(0),"dist",d.toFixed(1),"pts",pts.length); process.exit(0); }
}
console.log("NO CLOSURE pts",pts.length,"trav",travelled.toFixed(0),"minD",minD.toFixed(1));

// Analyze where the path goes: dump every Nth point around the lap
console.log("--- path every 80 points (world coords) ---");
for(let i = 0; i < pts.length; i+=80){
  const wx = (pts[i][0]-W/2)/ratio, wz = (pts[i][1]-W/2)/ratio;
  console.log(i, "world", wx.toFixed(0), wz.toFixed(0));
}
