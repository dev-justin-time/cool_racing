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

// Render pooled mask around (60..70, 175..250): the spawn straight end
let out = "";
for(let z=170; z<=255; z++){
  let row = "";
  for(let x=52; x<=76; x++){
    row += roadMask[z*mw+x]===1 ? "#" : ".";
  }
  out += (String(z).padStart(3)) + " " + row + "\n";
}
console.log("pooled mask rows 170-255, cols 52-76 (spawn 62,180):");
console.log(out);
