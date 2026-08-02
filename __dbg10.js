"use strict";
const fs = require("fs");

function analyze(W, buf, label){
  const get = (x,y) => { if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:buf[i],g:buf[i+1],b:buf[i+2],a:buf[i+3]}; };
  const isRoad = (px,pz) => px>=0 && pz>=0 && px<W && pz<W && get(px,pz).r >= 255;
  const ratio = W / 6000;
  const sx = Math.round(W/2 + (-2268)*ratio);
  const sz = Math.round(W/2 + (-886)*ratio);
  console.log(`[${label}] spawn px ${sx},${sz} road=${isRoad(sx,sz)}`);

  // Count road pixels + flood-fill from spawn
  let road = 0;
  for(let i = 0; i < W*W; i++) if(buf[i*4] >= 255) road++;
  console.log(`[${label}] road px (r>=255): ${road}`);

  // BFS from spawn
  const seen = new Uint8Array(W*W);
  const stack = [[sx,sz]];
  seen[sz*W+sx] = 1;
  let count = 0;
  while(stack.length){
    const [x,z] = stack.pop();
    count++;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx = x+dx, nz = z+dz;
      if(nx<0||nz<0||nx>=W||nz>=W) continue;
      if(seen[nz*W+nx]) continue;
      if(isRoad(nx,nz)){ seen[nz*W+nx]=1; stack.push([nx,nz]); }
    }
    if(count > 2000000) break;
  }
  const connected = count;
  // max distance from spawn among connected road
  let maxD = 0, maxAt = [sx,sz];
  for(let i = 0; i < W*W; i++){
    if(!seen[i]) continue;
    const x = i % W, z = (i / W) | 0;
    const d = Math.hypot(x-sx, z-sz);
    if(d > maxD){ maxD = d; maxAt = [x,z]; }
  }
  console.log(`[${label}] connected=${connected} (${(100*connected/Math.max(1,road)).toFixed(1)}% of road), maxDist=${maxD.toFixed(0)} at ${maxAt}`);
}
analyze(2048, fs.readFileSync("__collision2048.bin"), "2048");
analyze(512, fs.readFileSync("__collision512.bin"), "512");
