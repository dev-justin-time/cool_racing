"use strict";
const fs = require("fs");
const W = 512;
const raw = fs.readFileSync("__collision512.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:raw[i],g:raw[i+1],b:raw[i+2],a:raw[i+3]}; };
const isRoad = (px,pz) => px>=1 && pz>=1 && px<W-1 && pz<W-1 && get(px,pz).r>=200;
const ratio=W/6000;
const startX=Math.round(W/2+(-2268)*ratio), startZ=Math.round(W/2+(-886)*ratio);

for(const step of [1,2]){
  let x=startX,z=startZ,hx=0,hz=1;
  const spacing=step/ratio;
  const pts=[];
  let travelled=0;
  let closed=false;
  for(let i=0;i<9000;i++){
    pts.push([(x-W/2)/ratio,(z-W/2)/ratio]);
    // advance
    if(!isRoad(x+hx*step,z+hz*step)){
      let found=false;
      for(let a=1;a<=36&&!found;a++){
        const ang=a*0.06,c=Math.cos(ang),si=Math.sin(ang);
        const cand=[[hx*c-hz*si,hx*si+hz*c],[hx*c+hz*si,-hx*si+hz*c]];
        for(let d=0;d<2&&!found;d++){ if(isRoad(Math.round(x+cand[d][0]*step),Math.round(z+cand[d][1]*step))){ hx=cand[d][0]; hz=cand[d][1]; found=true; } }
      }
      if(!found){ console.log(`step=${step}: DEAD END i=${i} at ${x},${z} pts=${pts.length}`); break; }
    }
    x+=hx*step; z+=hz*step;
    travelled+=spacing;
    // LINE-based closure: |x-startX|<=4 && travelled>4500 (start line is a vertical line at x=startX)
    if(travelled>4500 && Math.abs(x-startX)<=4){
      closed=true;
      console.log(`step=${step}: CLOSED i=${i} trav=${travelled.toFixed(0)} dz=${(z-startZ).toFixed(1)} pts=${pts.length} spacing=${spacing.toFixed(2)}`);
      break;
    }
    if(i===8999) console.log(`step=${step}: NO CLOSURE pts=${pts.length} trav=${travelled.toFixed(0)}`);
  }
  if(closed){
    // check total length & uniformity
    let total=0, minS=Infinity, maxS=0;
    for(let i=1;i<pts.length;i++){ const d=Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]); total+=d; minS=Math.min(minS,d); maxS=Math.max(maxS,d); }
    const closure=Math.hypot(pts[0][0]-pts[pts.length-1][0],pts[0][1]-pts[pts.length-1][1]);
    console.log(`step=${step}: total=${total.toFixed(0)} minS=${minS.toFixed(2)} maxS=${maxS.toFixed(2)} closureGap=${closure.toFixed(1)}`);
  }
}
