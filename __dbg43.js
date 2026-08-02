"use strict";
const fs = require("fs");

function test(W, buf, label){
  const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:buf[i],g:buf[i+1],b:buf[i+2],a:buf[i+3]}; };
  const isRoad = (px,pz) => px>=1 && pz>=1 && px<W-1 && pz<W-1 && get(px,pz).r>=200;

  // find cp0 markers (r==255,g==255,b==0) — the start line
  let cx=0, cz=0, n=0;
  for(let y=0;y<W;y++) for(let x=0;x<W;x++){
    const c=get(x,y);
    if(c.r===255 && c.g===255 && c.b===0){ cx+=x; cz+=y; n++; }
  }
  const startZ = n>0 ? Math.round(cz/n) : Math.round(W/2+(-886)*W/6000);
  console.log(`[${label}] cp0 markers=${n} startZ=${startZ}`);
  if(n===0) return;

  const ratio=W/6000;
  const startX=Math.round(W/2+(-2268)*ratio), startZpx=Math.round(W/2+(-886)*ratio);
  let x=startX,z=startZpx,hx=0,hz=1;
  const step=1;
  const spacing=step/ratio;
  const pts=[];
  let travelled=0;
  for(let i=0;i<9000;i++){
    pts.push([(x-W/2)/ratio,(z-W/2)/ratio]);
    if(!isRoad(x+hx*step,z+hz*step)){
      let found=false;
      for(let a=1;a<=36&&!found;a++){
        const ang=a*0.06,c=Math.cos(ang),si=Math.sin(ang);
        const cand=[[hx*c-hz*si,hx*si+hz*c],[hx*c+hz*si,-hx*si+hz*c]];
        for(let d=0;d<2&&!found;d++){ if(isRoad(Math.round(x+cand[d][0]*step),Math.round(z+cand[d][1]*step))){ hx=cand[d][0]; hz=cand[d][1]; found=true; } }
      }
      if(!found){ console.log(`[${label}] DEAD END i=${i} at ${x},${z}`); return; }
    }
    x+=hx*step; z+=hz*step;
    travelled+=spacing;
    // close when crossing the start plane going the same way (hz>0 i.e. +Z) after half a lap
    if(travelled>4500 && Math.abs(z-startZ)<=3 && hz>0){
      console.log(`[${label}] CLOSED i=${i} trav=${travelled.toFixed(0)} pts=${pts.length} spacing=${spacing.toFixed(2)} dx=${(x-startX).toFixed(1)}`);
      return;
    }
  }
  console.log(`[${label}] NO CLOSURE pts=${pts.length} trav=${travelled.toFixed(0)}`);
}
test(512, fs.readFileSync("__collision512.bin"), "512");
test(2048, fs.readFileSync("__collision2048.bin"), "2048");
