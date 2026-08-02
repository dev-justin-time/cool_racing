"use strict";
// Analyze road topology at 2048: count junctions (pixels with >=3 road exits)
const fs = require("fs");
const W = 2048;
const buf = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:buf[i],g:buf[i+1],b:buf[i+2],a:buf[i+3]}; };
const isRoad = (px,pz) => px>=1 && pz>=1 && px<W-1 && pz<W-1 && get(px,pz).r >= 200;

// Count exits: sample 8 neighbours, count distinct road-connected directions
let junctions = [];
const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
for(let y = 1; y < W-1; y+=1){
  for(let x = 1; x < W-1; x+=1){
    if(!isRoad(x,y)) continue;
    let exits = 0;
    for(const [dx,dz] of dirs){
      if(isRoad(x+dx,y+dz)) exits++;
    }
    // junction = 3+ cardinal directions reachable (or 2+ cardinal with diagonals)
    let card = 0;
    if(isRoad(x+1,y)) card++;
    if(isRoad(x-1,y)) card++;
    if(isRoad(x,y+1)) card++;
    if(isRoad(x,y-1)) card++;
    if(card >= 3) junctions.push([x,y,card]);
  }
}
console.log("junctions (3+ card):", junctions.length);
junctions.slice(0, 20).forEach(j => console.log("  ", j[0], j[1], "card", j[2]));
