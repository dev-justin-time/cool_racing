"use strict";
const fs = require("fs");
const W = 512;
const raw = fs.readFileSync("__collision512.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0}; const i=(y*W+x)*4; return {r:raw[i]}; };
const isRoad = (px,pz) => px>=1 && pz>=1 && px<W-1 && pz<W-1 && get(px,pz).r>=200;

// render 64x64 cells of 8px
const CELL=8, COLS=W/CELL, ROWS=W/CELL;
let out="";
for(let cy=0;cy<ROWS;cy++){
  let row="";
  for(let cx=0;cx<COLS;cx++){
    let road=false;
    outer: for(let dy=0;dy<CELL;dy++) for(let dx=0;dx<CELL;dx++){
      if(isRoad(cx*CELL+dx,cy*CELL+dy)){ road=true; break outer; }
    }
    row += road?"#":".";
  }
  out+=row+"\n";
}
console.log(out);
const ratio=W/6000;
const sx=Math.round(W/2+(-2268)*ratio), sz=Math.round(W/2+(-886)*ratio);
console.log("spawn cell:", Math.floor(sx/CELL), Math.floor(sz/CELL), "px", sx, sz);
