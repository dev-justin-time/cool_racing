"use strict";
const fs = require("fs");
const W = 2048;
const raw = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:raw[i],g:raw[i+1],b:raw[i+2],a:raw[i+3]}; };

// find checkpoint markers: r==255 && g==255 && b<250
const cps = {};
for(let y=0;y<W;y++) for(let x=0;x<W;x++){
  const c=get(x,y);
  if(c.r===255 && c.g===255 && c.b<250){
    (cps[c.b]=cps[c.b]||[]).push([x,y]);
  }
}
for(const b of Object.keys(cps)){
  const pts=cps[b];
  let sx=0,sz=0;
  for(const [x,z] of pts){ sx+=x; sz+=z; }
  const cx=Math.round(sx/pts.length), cz=Math.round(sz/pts.length);
  // extent
  let minx=W,maxx=0,minz=W,maxz=0;
  for(const [x,z] of pts){ minx=Math.min(minx,x);maxx=Math.max(maxx,x);minz=Math.min(minz,z);maxz=Math.max(maxz,z); }
  const ratio=W/6000;
  console.log(`cp${b}: n=${pts.length} px(${cx},${cz}) extent ${maxx-minx}x${maxz-minz} world(${((cx-W/2)/ratio).toFixed(0)},${((cz-W/2)/ratio).toFixed(0)})`);
}
