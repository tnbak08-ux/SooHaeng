/* Desk Optimizer: no dependencies, no network. Geometry uses virtual classroom units. */
(function (root) {
  'use strict';
  const W = 920, H = 560, DW = 56, DH = 40;
  const round = v => Math.round(v * 100) / 100;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  function balancedSizes(m, maxPerGroup) {
    if (!Number.isInteger(m) || m < 1 || !Number.isInteger(maxPerGroup) || maxPerGroup < 1) throw new Error('책상 수와 모둠당 책상 수는 1 이상의 정수여야 합니다.');
    const k = Math.ceil(m / maxPerGroup), base = Math.floor(m / k), extra = m % k;
    return Array.from({length:k}, (_,i) => base + (i < extra ? 1 : 0));
  }
  function shapesForSize(n) {
    const variants = [];
    if (n === 1) return [{width:DW,height:DH,offsets:[{x:DW/2,y:DH/2}],variant:'단독',rows:1}];
    if (n === 2) return [{width:DW*2,height:DH,offsets:[0,1].map(c=>({x:(c+.5)*DW,y:DH/2})),variant:'1×2',rows:1}];
    if (n % 2 === 0) {
      const cols = n/2, offsets=[];
      for (let row=0;row<2;row++) for (let c=0;c<cols;c++) offsets.push({x:(c+.5)*DW,y:(row+.5)*DH});
      return [{width:cols*DW,height:2*DH,offsets,variant:`2×${cols}`,rows:2}];
    }
    const long = (n+1)/2, short = (n-1)/2;
    for (const longOnTop of [true,false]) for (const align of [0,.5,1]) {
      const offsets=[];
      const firstCount=longOnTop?long:short, secondCount=longOnTop?short:long;
      const firstOffset=longOnTop?0:align, secondOffset=longOnTop?align:0;
      for(let c=0;c<firstCount;c++) offsets.push({x:(c+.5+firstOffset)*DW,y:DH/2});
      for(let c=0;c<secondCount;c++) offsets.push({x:(c+.5+secondOffset)*DW,y:DH*1.5});
      variants.push({width:long*DW,height:2*DH,offsets,variant:`${longOnTop?'윗줄':'아랫줄'} 긴 형태 · ${['왼쪽','가운데','오른쪽'][align*2]}`,rows:2});
    }
    return variants;
  }

  // Minimum-cost perfect assignment; square matrix, real-valued costs, O(m^3).
  function hungarian(cost) {
    const n=cost.length;
    if (!n) return {assignment:[],total:0};
    const u=new Float64Array(n+1),v=new Float64Array(n+1);
    const p=new Int32Array(n+1),way=new Int32Array(n+1);
    for(let i=1;i<=n;i++){
      p[0]=i;let j0=0;
      const minv=new Float64Array(n+1);minv.fill(Infinity);
      const used=new Uint8Array(n+1);
      do{
        used[j0]=1;
        const i0=p[j0];let delta=Infinity,j1=0;
        for(let j=1;j<=n;j++)if(!used[j]){
          const cur=cost[i0-1][j-1]-u[i0]-v[j];
          if(cur<minv[j]){minv[j]=cur;way[j]=j0;}
          if(minv[j]<delta){delta=minv[j];j1=j;}
        }
        for(let j=0;j<=n;j++){
          if(used[j]){u[p[j]]+=delta;v[j]-=delta;}
          else minv[j]-=delta;
        }
        j0=j1;
      }while(p[j0]!==0);
      do{const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0!==0);
    }
    const assignment=new Int32Array(n);
    for(let j=1;j<=n;j++) assignment[p[j]-1]=j-1;
    let total=0;
    for(let i=0;i<n;i++)total+=cost[i][assignment[i]];
    return {assignment:Array.from(assignment),total};
  }
  function boundGroup(group) {
    const w=group.shape.width,h=group.shape.height;
    return { ...group, x:clamp(group.x,0,W-w), y:clamp(group.y,0,H-h) };
  }
  function overlaps(a,b,gap) {
    return a.x < b.x+b.shape.width+gap-1e-7 && a.x+a.shape.width+gap > b.x+1e-7 && a.y < b.y+b.shape.height+gap-1e-7 && a.y+a.shape.height+gap > b.y+1e-7;
  }
  function validPlacement(group, otherGroups, gap, skip=-1) {
    if (group.x < -1e-6 || group.y < -1e-6 || group.x+group.shape.width > W+1e-6 || group.y+group.shape.height>H+1e-6) return false;
    for(let i=0;i<otherGroups.length;i++) if(i!==skip&&overlaps(group,otherGroups[i],gap))return false;
    return true;
  }
  function evaluate(groups, desks, includeDetails=false) {
    const slots=[];
    for(let g=0;g<groups.length;g++){
      const group=groups[g];
      for(const offset of group.shape.offsets)slots.push({x:group.x+offset.x,y:group.y+offset.y,group:g,dx:offset.x,dy:offset.y});
    }
    if(slots.length!==desks.length)throw new Error('책상 수와 목표 자리 수가 일치하지 않습니다.');
    const cost=desks.map(d=>slots.map(s=>Math.hypot(d.x-s.x,d.y-s.y)));
    const {assignment,total}=hungarian(cost);
    if(!includeDetails)return {total,assignment,slots};
    return {total,assignment,slots,movements:desks.map((d,i)=>{
      const s=slots[assignment[i]];
      return {id:d.id,from:{x:d.x,y:d.y},to:{x:s.x,y:s.y},group:s.group+1,distance:Math.hypot(d.x-s.x,d.y-s.y)};
    })};
  }
  function seededRandom(seed) {
    let state=(seed>>>0)||0x12345678;
    return ()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return state/4294967296;};
  }
  function computeCenters(desks, sizes,mode,rand){
    const k=sizes.length;
    if(mode===0||mode===1){
      const sorted=[...desks].sort(mode===0?(a,b)=>a.x-b.x:(a,b)=>a.y-b.y);
      const centers=[];let at=0;
      for(const size of sizes){const chunk=sorted.slice(at,at+size);at+=size;centers.push({x:chunk.reduce((s,d)=>s+d.x,0)/size,y:chunk.reduce((s,d)=>s+d.y,0)/size});}
      return centers;
    }
    const centers=[];
    centers.push({x:desks[Math.floor(rand()*desks.length)].x,y:desks[Math.floor(rand()*desks.length)].y});
    for(let j=1;j<k;j++){
      let best=null,bestD=-1;
      for(const d of desks){let minD=Infinity;for(const c of centers)minD=Math.min(minD,(d.x-c.x)**2+(d.y-c.y)**2);
        const dist=minD*(.8+rand()*.4);
        if(dist>bestD){bestD=dist;best=d;}
      }
      centers.push({x:best.x,y:best.y});
    }
    for(let iter=0;iter<5;iter++){
      const targets=[];for(let j=0;j<k;j++)for(let s=0;s<sizes[j];s++)targets.push(j);
      const matrix=desks.map(d=>targets.map(g=>(d.x-centers[g].x)**2+(d.y-centers[g].y)**2));
      const result=hungarian(matrix),sums=centers.map(()=>({x:0,y:0,count:0}));
      desks.forEach((d,i)=>{const g=targets[result.assignment[i]];sums[g].x+=d.x;sums[g].y+=d.y;sums[g].count++;});
      sums.forEach((s,g)=>{if(s.count)centers[g]={x:s.x/s.count,y:s.y/s.count};});
    }
    return centers;
  }
  function findNearestPosition(preferred, group, placed, gap) {
    const maxX=W-group.shape.width,maxY=H-group.shape.height;
    if(maxX<0||maxY<0)return null;
    const tx=clamp(preferred.x,0,maxX),ty=clamp(preferred.y,0,maxY);
    const direct={...group,x:tx,y:ty};
    if(validPlacement(direct,placed,gap))return direct;
    const xs=[0,tx,maxX],ys=[0,ty,maxY];
    for(const other of placed){
      xs.push(clamp(other.x+other.shape.width+gap,0,maxX),clamp(other.x-group.shape.width-gap,0,maxX));
      ys.push(clamp(other.y+other.shape.height+gap,0,maxY),clamp(other.y-group.shape.height-gap,0,maxY));
    }
    let best=null,bestD=Infinity;
    for(const x of xs)for(const y of ys){
      const dist=(x-tx)**2+(y-ty)**2;
      if(dist>=bestD)continue;
      const candidate={...group,x,y};
      if(validPlacement(candidate,placed,gap)){best=candidate;bestD=dist;}
    }
    if(best)return best;
    // Grid fallback if a packing cannot be constructed from collision boundaries.
    for(let y=0;y<=maxY;y+=14)for(let x=0;x<=maxX;x+=14){
      const candidate={...group,x,y},dist=(x-tx)**2+(y-ty)**2;
      if(dist>=bestD)continue;
      if(validPlacement(candidate,placed,gap)){best=candidate;bestD=dist;}
    }
    return best;
  }
  function seedLayout(desks, sizes, shapeLists, gap, mode, rand){
    const centers=computeCenters(desks,sizes,mode,rand);
    const groups=[];
    for(let i=0;i<sizes.length;i++){
      const shapes=shapeLists[i],shape=shapes[Math.floor(rand()*shapes.length)];
      const group={id:i,size:sizes[i],shape,x:0,y:0};
      const preferred={x:centers[i].x-shape.width/2,y:centers[i].y-shape.height/2};
      const position=findNearestPosition(preferred,group,groups,gap);
      if(!position)return null;
      groups.push(position);
    }
    return groups;
  }
  function geometricMedian(points) {
    if(!points.length)return null;
    let x=points.reduce((s,p)=>s+p.x,0)/points.length;
    let y=points.reduce((s,p)=>s+p.y,0)/points.length;
    for(let i=0;i<8;i++){
      let xsum=0,ysum=0,wsum=0,exact=null;
      for(const p of points){const d=Math.hypot(x-p.x,y-p.y);if(d<.001){exact=p;break;}
        const w=1/d;xsum+=p.x*w;ysum+=p.y*w;wsum+=w;
      }
      if(exact){x=exact.x;y=exact.y;break;}
      x=xsum/wsum;y=ysum/wsum;
    }
    return {x,y};
  }
  function idealAnchor(groups,g,desks,ev){
    const points=[];
    ev.assignment.forEach((j,i)=>{const slot=ev.slots[j];if(slot.group===g)points.push({x:desks[i].x-slot.dx,y:desks[i].y-slot.dy});});
    return geometricMedian(points);
  }
  function optimize(desks,maxPerGroup,gap=24,options={}){
    const start=typeof performance!=='undefined'?performance.now():Date.now();
    if(!Array.isArray(desks)||!desks.length)throw new Error('책상이 한 개 이상 필요합니다.');
    if(desks.length>60)throw new Error('한 번에 최대 60개까지 계산할 수 있습니다.');
    if(desks.some(d=>!Number.isFinite(d.x)||!Number.isFinite(d.y)))throw new Error('책상 좌표에 오류가 있습니다.');
    const sizes=balancedSizes(desks.length,maxPerGroup),shapeLists=sizes.map(shapesForSize);
    if(shapeLists.some(list=>list[0].width>W||list[0].height>H))throw new Error('모둠이 교실 크기를 초과합니다. 모둠당 책상 수를 줄여주세요.');
    let best=null,validStarts=0,evaluations=0;
    const m=desks.length;
    const maxEvaluations=options.maxEvaluations|| (m<=20?1850:m<=32?1450:950);
    const maxMillis=options.maxMillis|| (m<=20?2200:2800);
    const restarts=m<=20?6:4;
    let seed=0x9e3779b9;
    for(const d of desks){seed=(Math.imul(seed^Math.round(d.x*10),16777619))>>>0;seed=(Math.imul(seed^Math.round(d.y*10),16777619))>>>0;}
    const rand=seededRandom(seed);
    const elapsed=()=> (typeof performance!=='undefined'?performance.now():Date.now())-start;
    outer:for(let run=0;run<restarts;run++){
      if(evaluations>=maxEvaluations || (run>0&&elapsed()>maxMillis))break;
      const groups=seedLayout(desks,sizes,shapeLists,gap,run,rand);
      if(!groups)continue;
      validStarts++;
      let ev=evaluate(groups,desks);evaluations++;
      if(!best||ev.total<best.score)best={groups:groups.map(g=>({...g})),score:ev.total};
      for(const step of [66,30,13,5,1.5]){
        let improvedThisPass=false;
        for(let g=0;g<groups.length;g++){
          if(evaluations>=maxEvaluations||elapsed()>maxMillis)break outer;
          let bestGroup=null,bestEval=ev;
          const original=groups[g];
          const candidates=[];
          // All allowed odd-group alignments and row arrangements.
          for(const shape of shapeLists[g])if(shape!==original.shape)candidates.push({...original,shape});
          const aim=idealAnchor(groups,g,desks,ev);
          if(aim)candidates.push(boundGroup({...original,x:aim.x,y:aim.y}));
          for(let i=0;i<8;i++){
            const angle=i*Math.PI/4;
            candidates.push(boundGroup({...original,x:original.x+Math.cos(angle)*step,y:original.y+Math.sin(angle)*step}));
          }
          for(const candidate of candidates){
            if(evaluations>=maxEvaluations||elapsed()>maxMillis)break;
            if(!validPlacement(candidate,groups,gap,g))continue;
            groups[g]=candidate;
            const candidateEval=evaluate(groups,desks);evaluations++;
            if(candidateEval.total<bestEval.total-1e-6){bestEval=candidateEval;bestGroup=candidate;}
          }
          groups[g]=bestGroup||original;
          if(bestGroup){ev=bestEval;improvedThisPass=true;
            if(!best||ev.total<best.score-1e-6)best={groups:groups.map(item=>({...item})),score:ev.total};
          }
        }
        // Check the full pass for convergence at the finest scale.
        if(!improvedThisPass&&step<=5)break;
      }
    }
    if(!best)throw new Error('지정된 교실 크기와 모둠 간격으로 배치를 찾지 못했습니다. 간격 또는 모둠당 책상 수를 조정해 주세요.');
    const detail=evaluate(best.groups,desks,true);
    return {
      groups:best.groups.map((g,i)=>({id:i+1,size:g.size,x:round(g.x),y:round(g.y),width:g.shape.width,height:g.shape.height,variant:g.shape.variant,slots:g.shape.offsets.map(p=>({x:g.x+p.x,y:g.y+p.y}))})),
      movements:detail.movements,total:detail.total,sizes,
      evaluations,validStarts,elapsedMs:elapsed(),globallyOptimal:false,
    };
  }
  root.DeskOptimizerCore={W,H,DW,DH,balancedSizes,shapesForSize,hungarian,validPlacement,optimize,round};
  if(typeof module!=='undefined'&&module.exports)module.exports=root.DeskOptimizerCore;
})(typeof window!=='undefined'?window:globalThis);
