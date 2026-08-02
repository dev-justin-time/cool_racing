"use strict";
const fs = require("fs");
const W = 512;
const buf = fs.readFileSync("__collision512.bin");
const get = (x,y) => { if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:buf[i],g:buf[i+1],b:buf[i+2],a:buf[i+3]}; };

const hist = new Int32Array(256);
for(let i = 0; i < buf.length; i+=4) hist[buf[i]]++;
let lines = [];
for(let v = 200; v < 256; v++) lines.push(`${v}:${hist[v]}`);
console.log("512 R histogram 200-255:", lines.join(" "));

// connectivity vs threshold
for(const th of [180, 200, 220, 235, 245, 250, 252, 254]){
  const isRoad = (px,pz) => px>=0 && pz>=0 && px<W && pz<W && get(px,pz).r >= th;
  const ratio = W/6000;
  const sx = Math.round(W/2 + (-2268)*ratio), sz = Math.round(W/2 + (-886)*ratio);
  if(!isRoad(sx,sz)){ console.log(`th=${th}: spawn NOT road`); continue; }
  const seen = new Uint8Array(W*W);
  const stack = [[sx,sz]]; seen[sz*W+sx]=1;
  let count = 0;
  while(stack.length){
    const [x,z] = stack.pop(); count++;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx, nz=z+dz;
      if(nx<0||nz<0||nx>=W||nz>=W||seen[nz*W+nx]||!isRoad(nx,nz)) continue;
      seen[nz*W+nx]=1; stack.push([nx,nz]);
    }
  }
  let road = 0;
  for(let i = 0; i < W*W; i++) if(buf[i*4] >= th) road++;
  console.log(`th=${th}: road=${road} connected=${count} (${(100*count/Math.max(1,road)).toFixed(1)}%)`);
}
