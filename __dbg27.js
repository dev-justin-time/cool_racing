"use strict";
const fs = require("fs");
const W = 512;
const raw = fs.readFileSync("__collision512.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:raw[i]}; };
const isRoad = (px,pz) => px>=1 && pz>=1 && px<W-1 && pz<W-1 && get(px,pz).r>=200;
const ratio=W/6000;
const startX=Math.round(W/2+(-2268)*ratio), startZ=Math.round(W/2+(-886)*ratio);

for(const step of [1, 2]){
  let x=startX,z=startZ,hx=0,hz=1;
  const spacing=step/ratio;
  let travelled=0, offRoad=0;
  for(let i=0;i<9000;i++){
    const d=Math.hypot(x-startX,z-startZ);
    if(travelled>4500 && d<step*6){ console.log(`step=${step}: CLOSED i=${i} trav=${travelled.toFixed(0)} dist=${d.toFixed(1)} offRoad=${offRoad} spacing=${spacing.toFixed(1)}`); break; }
    if(!isRoad(x+hx*step,z+hz*step)){
      let found=false;
      for(let a=1;a<=36&&!found;a++){
        const ang=a*0.06,c=Math.cos(ang),si=Math.sin(ang);
        const cand=[[hx*c-hz*si,hx*si+hz*c],[hx*c+hz*si,-hx*si+hz*c]];
        for(let dd=0;dd<2&&!found;dd++){ if(isRoad(Math.round(x+cand[dd][0]*step),Math.round(z+cand[dd][1]*step))){ hx=cand[dd][0]; hz=cand[dd][1]; found=true; } }
      }
      if(!found){ console.log(`step=${step}: DEAD END i=${i} at ${x},${z} trav=${travelled.toFixed(0)}`); break; }
    }
    x+=hx*step; z+=hz*step;
    travelled+=spacing;
    if(!isRoad(Math.round(x),Math.round(z))) offRoad++;
  }
  if(!travelled) {} 
}
