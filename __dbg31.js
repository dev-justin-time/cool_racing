"use strict";
const fs = require("fs");
const W = 512;
const raw = fs.readFileSync("__collision512.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:raw[i],g:raw[i+1],b:raw[i+2],a:raw[i+3]}; };
const mw = 512;
const roadMask = new Uint8Array(mw*mw);
for(let mz=0;mz<mw;mz++) for(let mx=0;mx<mw;mx++) roadMask[mz*mw+mx] = get(mx,mz).r>=200?1:0;
const isRoad = (px,pz) => px>=1 && pz>=1 && px<mw-1 && pz<mw-1 && roadMask[pz*mw+px]===1;

const dist = new Uint16Array(mw*mw); const INF = 65535;
for(let i=0;i<mw*mw;i++) if(roadMask[i]===1) dist[i]=INF;
const nb=[null,null,null,null];
function chf(px,py,fwd,out){ let k=0;
  if(fwd){ if(py>0&&px>0)out[k++]=[-1,-1,4]; if(py>0)out[k++]=[-1,0,3]; if(py>0&&px<mw-1)out[k++]=[-1,1,4]; if(px>0)out[k++]=[0,-1,3]; }
  else { if(py<mw-1&&px<mw-1)out[k++]=[1,1,4]; if(py<mw-1)out[k++]=[1,0,3]; if(py<mw-1&&px>0)out[k++]=[1,-1,4]; if(px<mw-1)out[k++]=[0,1,3]; }
  return k; }
for(let py=0;py<mw;py++) for(let px=0;px<mw;px++){ const i=py*mw+px; if(!roadMask[i])continue; let best=INF; const k=chf(px,py,true,nb);
  for(let n=0;n<k;n++){ const dv=dist[(py+nb[n][0])*mw+(px+nb[n][1])]; if(dv>=INF)continue; const v=dv+nb[n][2]; if(v<best)best=v; } dist[i]=best; }
for(let py=mw-1;py>=0;py--) for(let px=mw-1;px>=0;px--){ const i=py*mw+px; if(!roadMask[i])continue; let best=dist[i]; const k=chf(px,py,false,nb);
  for(let n=0;n<k;n++){ const dv=dist[(py+nb[n][0])*mw+(px+nb[n][1])]; if(dv>=INF)continue; const v=dv+nb[n][2]; if(v<best)best=v; } dist[i]=best; }
const dAt=(px,pz)=>{ if(px<0||pz<0||px>=mw||pz>=mw)return 0; return dist[pz*mw+px]; };

const ratio=mw/6000;
const startX=Math.round(mw/2+(-2268)*ratio), startZ=Math.round(mw/2+(-886)*ratio);
let x=startX,z=startZ,hx=0,hz=1;
const step=1;
const spacing=step/ratio;
const points=[];
let travelled=0;
let minD=Infinity;
for(let i=0;i<9000;i++){
  const nx=-hz,nz=hx;
  let bx=x,bz=z,bd=-1;
  const R=68;
  for(let s=-R;s<=R;s++){
    const tx=Math.round(x+nx*s),tz=Math.round(z+nz*s);
    if(tx<0||tz<0||tx>=mw||tz>=mw||!isRoad(tx,tz)) continue;
    const dv=dAt(tx,tz);
    if(dv>bd){bd=dv;bx=tx;bz=tz;}
  }
  x=bx; z=bz;
  points.push([x,z]);
  if(!isRoad(x+hx*step,z+hz*step)){
    let found=false;
    for(let a=1;a<=36&&!found;a++){
      const ang=a*0.06,c=Math.cos(ang),si=Math.sin(ang);
      const cand=[[hx*c-hz*si,hx*si+hz*c],[hx*c+hz*si,-hx*si+hz*c]];
      for(let d=0;d<2&&!found;d++){ if(isRoad(Math.round(x+cand[d][0]*step),Math.round(z+cand[d][1]*step))){ hx=cand[d][0]; hz=cand[d][1]; found=true; } }
    }
    if(!found){ console.log("DEAD END i=",i); break; }
  }
  x+=hx*step; z+=hz*step;
  travelled+=spacing;
  const d=Math.hypot(x-startX,z-startZ);
  if(d<minD){ minD=d; }
  if(travelled>4500 && d<step*6){ console.log("CLOSED i=",i,"trav",travelled.toFixed(0),"dist",d.toFixed(1)); break; }
  // report closest approaches every 10000 units
  if(i%1000===0) console.log("i",i,"px",x.toFixed(0),z.toFixed(0),"trav",travelled.toFixed(0),"minD",minD.toFixed(1));
}
console.log("pts",points.length,"trav",travelled.toFixed(0),"minD",minD.toFixed(1));
// print closest-approach positions
let best=[]; let prevMin=Infinity;
for(let i=0;i<points.length;i+=5){
  const d=Math.hypot(points[i][0]-startX,points[i][1]-startZ);
  if(d<80) best.push([i, points[i][0], points[i][1], d.toFixed(1)]);
}
console.log("near-start visits (within 80px):", best.length);
best.slice(0,20).forEach(b=>console.log("  i",b[0],"px",b[1],b[2],"dist",b[3]));
