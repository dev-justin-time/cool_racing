"use strict";
const fs = require("fs");
const W = 2048;
const buf = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:buf[i],g:buf[i+1],b:buf[i+2],a:buf[i+3]}; };
// Render at 128x128 (16px per cell): cell is road if ANY pixel in the 16x16 block is r>=255
const CELL = 16, COLS = W/CELL, ROWS = W/CELL;
let out = "";
for(let cy = 0; cy < ROWS; cy++){
  let row = "";
  for(let cx = 0; cx < COLS; cx++){
    let road = false;
    outer: for(let dy = 0; dy < CELL; dy++){
      for(let dx = 0; dx < CELL; dx++){
        if(get(cx*CELL+dx, cy*CELL+dy).r >= 255){ road = true; break outer; }
      }
    }
    row += road ? "#" : ".";
  }
  out += row + "\n";
}
console.log(out);
// Also print spawn cell marker
const spawnX = Math.round(W/2 + (-2268)*0.3413), spawnZ = Math.round(W/2 + (-886)*0.3413);
console.log("spawn cell:", Math.floor(spawnX/CELL), Math.floor(spawnZ/CELL));
