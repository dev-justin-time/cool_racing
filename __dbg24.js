"use strict";
const fs = require("fs");
const W = 2048;
const raw = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:raw[i],g:raw[i+1],b:raw[i+2],a:raw[i+3]}; };
const mw = 512, pool = 4;

// box average: road fraction per block
const avg = new Float32Array(mw*mw);
for(let mz=0;mz<mw;mz++) for(let mx=0;mx<mw;mx++){
  let count=0;
  const x0=mx*pool, z0=mz*pool;
  for(let dz=0;dz<pool;dz++) for(let dx=0;dx<pool;dx++){ if(get(x0+dx,z0+dz).r>=255) count++; }
  avg[mz*mw+mx] = count/(pool*pool);
}

for(const th of [0.5, 0.4, 0.3, 0.25, 0.2]){
  const isRoad = (px,pz) => px>=1 && pz>=1 && px<mw-1 && pz<mw-1 && avg[pz*mw+px]>=th;
  // connectivity from spawn
  const ratio=mw/6000;
  const sx=Math.round(mw/2+(-2268)*ratio), sz=Math.round(mw/2+(-886)*ratio);
  if(!isRoad(sx,sz)){ console.log(`th=${th}: spawn not road`); continue; }
  const seen=new Uint8Array(mw*mw); const stack=[[sx,sz]]; seen[sz*mw+sx]=1;
  let count=0;
  while(stack.length){ const [x,z]=stack.pop(); count++;
    for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
      const nx=x+dx,nz=z+dz;
      if(nx<0||nz<0||nx>=mw||nz>=mw||seen[nz*mw+nx]||!isRoad(nx,nz)) continue;
      seen[nz*mw+nx]=1; stack.push([nx,nz]);
    }
  }
  let road=0;
  for(let i=0;i<mw*mw;i++) if(avg[i]>=th) road++;
  console.log(`th=${th}: road=${road} connected=${count} (${(100*count/Math.max(1,road)).toFixed(1)}%)`);
}
