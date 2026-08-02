"use strict";
const fs = require("fs");
const W = 512;
const raw = fs.readFileSync("__collision512.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:raw[i],g:raw[i+1],b:raw[i+2],a:raw[i+3]}; };
const mw = 512;
const roadMask = new Uint8Array(mw*mw);
for(let mz=0;mz<mw;mz++) for(let mx=0;mx<mw;mx++) roadMask[mz*mw+mx] = get(mx,mz).r>=200?1:0;
const isRoad = (px,pz) => px>=1 && pz>=1 && px<mw-1 && pz<mw-1 && roadMask[pz*mw+px]===1;

const ratio=mw/6000;
const startX=Math.round(mw/2+(-2268)*ratio), startZ=Math.round(mw/2+(-886)*ratio);
for(const step of [1,2]){
  let x=startX,z=startZ,hx=0,hz=1;
  const spacing=step/ratio;
  const points=[];
  let travelled=0, degCount=0;
  for(let i=0;i<9000;i++){
    const nx=-hz,nz=hx;
    let le=0; for(let s=1;s<=240;s++){ if(!isRoad(x+nx*s,z+nz*s))break; le=s; }
    let re=0; for(let s=1;s<=240;s++){ if(!isRoad(x-nx*s,z-nz*s))break; re=s; }
    if(le+re<3){ degCount++;
      let rx=-1,rz=-1;
      for(let rr=1;rr<=60&&rx<0;rr++){ for(let aa=0;aa<8;aa++){ const cxx=Math.round(x+Math.cos(aa*Math.PI/4)*rr),czz=Math.round(z+Math.sin(aa*Math.PI/4)*rr); if(isRoad(cxx,czz)){rx=cxx;rz=czz;break;} } }
      if(rx<0){ console.log(`step=${step}: NO ROAD i=${i}`); break; }
      if(points.length>0){ const lp=points[points.length-1]; const lpx=Math.round(mw/2+lp.x*ratio),lpz=Math.round(mw/2+lp.z*ratio); const ddx=rx-lpx,ddz=rz-lpz,dl=Math.sqrt(ddx*ddx+ddz*ddz)||1; hx=ddx/dl; hz=ddz/dl; }
      x=rx; z=rz; continue;
    }
    // MIDPOINT recenter: x + nx*((le-re)/2)
    const mid = Math.round((le - re) / 2);
    x = Math.round(x + nx*mid); z = Math.round(z + nz*mid);
    points.push({x:(x-mw/2)/ratio,z:(z-mw/2)/ratio});
    if(!isRoad(x+hx*step,z+hz*step)){
      let found=false;
      for(let a=1;a<=36&&!found;a++){
        const ang=a*0.06,c=Math.cos(ang),si=Math.sin(ang);
        const cand=[[hx*c-hz*si,hx*si+hz*c],[hx*c+hz*si,-hx*si+hz*c]];
        for(let d=0;d<2&&!found;d++){ if(isRoad(Math.round(x+cand[d][0]*step),Math.round(z+cand[d][1]*step))){ hx=cand[d][0]; hz=cand[d][1]; found=true; } }
      }
      if(!found){ console.log(`step=${step}: DEAD END i=${i} at ${x},${z} pts=${points.length} deg=${degCount}`); break; }
    }
    x+=hx*step; z+=hz*step;
    travelled+=spacing;
    const d=Math.hypot(x-startX,z-startZ);
    if(travelled>4500 && d<step*6){ console.log(`step=${step}: CLOSED i=${i} trav=${travelled.toFixed(0)} dist=${d.toFixed(1)} pts=${points.length} deg=${degCount} spacing=${spacing.toFixed(1)}`); break; }
    if(i===8999) console.log(`step=${step}: NO CLOSURE pts=${points.length} trav=${travelled.toFixed(0)} deg=${degCount}`);
  }
}
