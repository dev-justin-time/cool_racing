"use strict";
const fs = require("fs");
const W = 2048;
const buf = fs.readFileSync("__collision2048.bin");
const get = (x,y) => { x=Math.round(x); y=Math.round(y); if(x<0||y<0||x>=W||y>=W) return {r:0,g:0,b:0,a:0}; const i=(y*W+x)*4; return {r:buf[i],g:buf[i+1],b:buf[i+2],a:buf[i+3]}; };
const isRoad = (px,pz) => px>=1 && pz>=1 && px<W-1 && pz<W-1 && get(px,pz).r >= 255;

// Build distance transform (same as generator)
const roadMask = new Uint8Array(W*W);
const dist = new Uint16Array(W*W);
const INF = 65535;
for(let py=0; py<W; py++) for(let px=0; px<W; px++){ const i=py*W+px; if(isRoad(px,py)){ roadMask[i]=1; dist[i]=INF; } }
const nb = [null,null,null,null];
function chamfer(px,py,fwd,out){
  let k=0;
  if(fwd){
    if(py>0 && px>0) out[k++]=[-1,-1,4];
    if(py>0) out[k++]=[-1,0,3];
    if(py>0 && px<W-1) out[k++]=[-1,1,4];
    if(px>0) out[k++]=[0,-1,3];
  } else {
    if(py<W-1 && px<W-1) out[k++]=[1,1,4];
    if(py<W-1) out[k++]=[1,0,3];
    if(py<W-1 && px>0) out[k++]=[1,-1,4];
    if(px<W-1) out[k++]=[0,1,3];
  }
  return k;
}
for(let py=0; py<W; py++) for(let px=0; px<W; px++){
  const i=py*W+px; if(!roadMask[i]) continue;
  let best=INF; const k=chamfer(px,py,true,nb);
  for(let n=0;n<k;n++){ const dv=dist[(py+nb[n][0])*W+(px+nb[n][1])]; if(dv>=INF) continue; const v=dv+nb[n][2]; if(v<best) best=v; }
  dist[i]=best;
}
for(let py=W-1; py>=0; py--) for(let px=W-1; px>=0; px--){
  const i=py*W+px; if(!roadMask[i]) continue;
  let best=dist[i]; const k=chamfer(px,py,false,nb);
  for(let n=0;n<k;n++){ const dv=dist[(py+nb[n][0])*W+(px+nb[n][1])]; if(dv>=INF) continue; const v=dv+nb[n][2]; if(v<best) best=v; }
  dist[i]=best;
}
const dAt = (px,pz) => { if(px<0||pz<0||px>=W||pz>=W) return 0; return dist[pz*W+px]; };

// Walk with real generator logic
const ratio = W/6000;
const startX = Math.round(W/2 + (-2268)*ratio), startZ = Math.round(W/2 + (-886)*ratio);
let x=startX, z=startZ, hx=0, hz=1;
const step = Math.max(2, Math.round(ratio*12));
const spacing = step/ratio;
const pts = [];
let travelled = 0;
let minD = Infinity, minAt = -1;
let offRoadPts = 0, recenterShifts = 0;

for(let i=0; i<9000; i++){
  const nx=-hz, nz=hx;
  let le=0; for(let s=1;s<=240;s++){ if(!isRoad(x+nx*s,z+nz*s)) break; le=s; }
  let re=0; for(let s=1;s<=240;s++){ if(!isRoad(x-nx*s,z-nz*s)) break; re=s; }
  if(le+re<3){
    // recovery spiral
    let rx=-1,rz=-1;
    for(let rr=1;rr<=60 && rx<0;rr++){ for(let aa=0;aa<8;aa++){ const cxx=Math.round(x+Math.cos(aa*Math.PI/4)*rr), czz=Math.round(z+Math.sin(aa*Math.PI/4)*rr); if(isRoad(cxx,czz)){rx=cxx;rz=czz;break;} } }
    if(rx<0){ console.log("NO ROAD at i=",i,"px",x,z); break; }
    if(pts.length>0){ const lp=pts[pts.length-1]; const lpx=Math.round(W/2+lp.x*ratio), lpz=Math.round(W/2+lp.z*ratio); const ddx=rx-lpx,ddz=rz-lpz,dl=Math.sqrt(ddx*ddx+ddz*ddz)||1; hx=ddx/dl; hz=ddz/dl; }
    x=rx; z=rz;
    if(i%100===0) console.log("  [recover] i",i,"px",x,z);
    continue;
  }
  let bx=x,bz=z,bd=-1;
  for(let s=-re;s<=le;s++){ const tx=Math.round(x+nx*s),tz=Math.round(z+nz*s); const dv=dAt(tx,tz); if(dv>bd){bd=dv;bx=tx;bz=tz;} }
  if(bx!==x || bz!==z) recenterShifts++;
  x=bx; z=bz;
  pts.push({x:(x-W/2)/ratio, z:(z-W/2)/ratio});
  if(!isRoad(x,z)) offRoadPts++;
  // advance
  if(!isRoad(x+hx*step, z+hz*step)){
    let found=false;
    for(let a=1;a<=36 && !found;a++){
      const ang=a*0.06,c=Math.cos(ang),si=Math.sin(ang);
      const cand=[[hx*c-hz*si,hx*si+hz*c],[hx*c+hz*si,-hx*si+hz*c]];
      for(let d=0;d<2 && !found;d++){ if(isRoad(x+cand[d][0]*step,z+cand[d][1]*step)){ hx=cand[d][0]; hz=cand[d][1]; found=true; } }
    }
    if(!found){ console.log("DEAD END i=",i,"px",x,z); break; }
  }
  x+=hx*step; z+=hz*step;
  travelled+=spacing;
  const d=Math.hypot(x-startX,z-startZ);
  if(d<minD){ minD=d; minAt=i; }
  if(travelled>4500 && d<step*6){ console.log("CLOSED i=",i,"trav",travelled.toFixed(0),"dist",d.toFixed(1),"pts",pts.length,"recenterShifts",recenterShifts,"offRoad",offRoadPts); process.exit(0); }
  if(i%400===0) console.log("i",i,"px",x.toFixed(0),z.toFixed(0),"trav",travelled.toFixed(0),"minD",minD.toFixed(1),"shift%",(100*recenterShifts/Math.max(1,i)).toFixed(0));
}
console.log("NO CLOSURE pts",pts.length,"trav",travelled.toFixed(0),"minD",minD.toFixed(1),"at",minAt,"recenterShifts",recenterShifts,"offRoad",offRoadPts);
