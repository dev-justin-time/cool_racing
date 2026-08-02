"use strict";
const fs = require("fs");
// LANCZOS 512 map
const raw512 = fs.readFileSync("__collision512.bin");
const get512 = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=512||y>=512) return {r:0}; const i=(y*512+x)*4; return {r:raw512[i]}; };
// build 2048 → box-average mask
const raw = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=2048||y>=2048) return {r:0}; const i=(y*2048+x)*4; return {r:raw[i]}; };
const mw=512, pool=4;
const avg = new Float32Array(mw*mw);
for(let mz=0;mz<mw;mz++) for(let mx=0;mx<mw;mx++){
  let count=0;
  const x0=mx*pool, z0=mz*pool;
  for(let dz=0;dz<pool;dz++) for(let dx=0;dx<pool;dx++){ if(get(x0+dx,z0+dz).r>=255) count++; }
  avg[mz*mw+mx] = count/(pool*pool);
}

// Render a vertical strip comparison: rows 150-260, cols 40-80
// (the start straight area where the walk should travel)
console.log("=== LANCZOS 512 (r>=200) vs BOX-AVG 512 (th=0.4) ===");
for(let z=150; z<=260; z+=3){
  let rowL="", rowB="";
  for(let x=40; x<=80; x++){
    rowL += get512(x,z).r>=200 ? "#" : ".";
    rowB += avg[z*mw+x]>=0.4 ? "#" : ".";
  }
  console.log(String(z).padStart(3), "L:", rowL, " B:", rowB);
}
