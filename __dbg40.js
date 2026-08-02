"use strict";
const fs = require("fs");
const W = 512;
const raw = fs.readFileSync("__collision512.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:raw[i],g:raw[i+1],b:raw[i+2],a:raw[i+3]}; };
const mw = 512;
const roadMask = new Uint8Array(mw*mw);
for(let mz=0;mz<mw;mz++) for(let mx=0;mx<mw;mx++) roadMask[mz*mw+mx] = get(mx,mz).r>=200?1:0;
const isRoad = (px,pz) => px>=1 && pz>=1 && px<mw-1 && pz<mw-1 && roadMask[pz*mw+px]===1;

// find cp0 markers (r==255 && g==255 && b<250, blue=0)
const cps = [];
for(let y=0;y<mw;y++) for(let x=0;x<mw;x++){
  const c=get(x,y);
  if(c.r===255 && c.g===255 && c.b===0) cps.push([x,y]);
}
console.log("cp0 marker px at 512:", cps.length);
// bounding box
let minx=mw,maxx=0,minz=mw,maxz=0;
for(const [x,z] of cps){ minx=Math.min(minx,x);maxx=Math.max(maxx,x);minz=Math.min(minz,z);maxz=Math.max(maxz,z); }
console.log("cp0 bbox x",minx,"-",maxx," z",minz,"-",maxz);
// spawn
const ratio=mw/6000;
const startX=Math.round(mw/2+(-2268)*ratio), startZ=Math.round(mw/2+(-886)*ratio);
console.log("spawn:", startX, startZ, "dist to cp0 bbox center:", Math.hypot((minx+maxx)/2-startX,(minz+maxz)/2-startZ).toFixed(1));
