"use strict";
const fs = require("fs");
const W = 2048;
const buf = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:buf[i],g:buf[i+1],b:buf[i+2],a:buf[i+3]}; };

// Value histogram of R channel
const hist = new Int32Array(256);
for(let i = 0; i < buf.length; i+=4) hist[buf[i]]++;
console.log("R-channel histogram (nonzero):");
let lines = [];
for(let v = 0; v < 256; v++){
  if(hist[v] > 0) lines.push(`${v}:${hist[v]}`);
}
console.log(lines.join("  "));

// Look at the spawn area region as ASCII (R >= 200 = road)
const isRoad = (px,pz) => px>=0 && pz>=0 && px<W && pz<W && get(px,pz).r >= 200;
// spawn 250,722 - render 80x40 around it
const cx = 250, cz = 722;
let out = "";
for(let dz = -20; dz <= 20; dz++){
  let row = "";
  for(let dx = -40; dx <= 40; dx++){
    row += isRoad(cx+dx, cz+dz) ? "#" : ".";
  }
  out += row + "\n";
}
console.log("--- spawn area (80x41) ---");
console.log(out);

// count road pixels
let road = 0;
for(let i = 0; i < buf.length; i+=4) if(buf[i] >= 200) road++;
console.log("road px (r>=200):", road, "of", W*W);
