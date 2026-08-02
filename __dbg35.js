"use strict";
const fs = require("fs");
const W = 2048;
const raw = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:raw[i],g:raw[i+1],b:raw[i+2],a:raw[i+3]}; };
const isRoad = (px,pz) => px>=0 && pz>=0 && px<W && pz<W && get(px,pz).r>=255;

// spawn
const ratio=W/6000;
const sx=Math.round(W/2+(-2268)*ratio), sz=Math.round(W/2+(-886)*ratio);

// BFS from spawn, track distance
const seen=new Int32Array(W*W).fill(-1);
const q=[[sx,sz]]; seen[sz*W+sx]=0;
let head=0;
while(head<q.length){
  const [x,z]=q[head++];
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
    const nx=x+dx,nz=z+dz;
    if(nx<0||nz<0||nx>=W||nz>=W||seen[nz*W+nx]>=0||!isRoad(nx,nz)) continue;
    seen[nz*W+nx]=seen[z*W+x]+1;
    q.push([nx,nz]);
  }
}
console.log("BFS reachable road px:", q.length);

// max distance point from spawn
let maxD=0,maxAt=[sx,sz];
for(let i=0;i<W*W;i++){
  if(seen[i]<0) continue;
  const x=i%W,z=(i/W)|0;
  const d=Math.hypot(x-sx,z-sz);
  if(d>maxD){maxD=d;maxAt=[x,z];}
}
console.log("max distance from spawn:", maxD.toFixed(0), "px at", maxAt);

// is the map one connected loop? count road px
let road=0;
for(let i=0;i<W*W;i++) if(get(i%W,(i/W)|0).r>=255) road++;
console.log("total road px:", road, "reachable:", q.length, (100*q.length/Math.max(1,road)).toFixed(1)+"%");

// find junctions (>=3 cardinal neighbors) - a clean loop has few/none
let junc=0, juncPts=[];
for(let y=1;y<W-1;y++) for(let x=1;x<W-1;x++){
  if(!isRoad(x,y)) continue;
  let card=0;
  if(isRoad(x+1,y))card++;
  if(isRoad(x-1,y))card++;
  if(isRoad(x,y+1))card++;
  if(isRoad(x,y-1))card++;
  if(card>=3){ junc++; if(juncPts.length<10) juncPts.push([x,y,card]); }
}
console.log("junctions (3+ cardinal):", junc);
juncPts.forEach(j=>console.log("  junc at", j[0], j[1], "card", j[2]));
