(function(){
'use strict';
const core=window.DeskOptimizerCore;
const {W,H,DW,DH,round}=core;
const MAX_DESKS=48,MAX_GROUP_SIZE=12;
const $=id=>document.getElementById(id);
const current=$('current-room'),target=$('result-room'),empty=$('empty-state');
const initialCoordinates=[
  [110,102],[280,95],[460,122],[677,102],[836,123],
  [153,235],[345,240],[574,260],[800,265],
  [115,405],[310,415],[505,442],[702,420],[844,447]
];
let desks=initialCoordinates.map(([x,y],i)=>({id:i+1,x,y}));
let groupSize=4,gap=24,result=null,selected=null,dragging=null,busy=false;
let maxId=14;
try {
  const saved=JSON.parse(localStorage.getItem('desk-optimizer-state-v1')||'null');
  if(saved&&Array.isArray(saved.desks)&&saved.desks.length>=1&&saved.desks.length<=MAX_DESKS&&saved.desks.every(d=>Number.isInteger(d.id)&&Number.isFinite(d.x)&&Number.isFinite(d.y))){
    desks=saved.desks.map(d=>({id:d.id,x:Math.max(DW/2,Math.min(W-DW/2,d.x)),y:Math.max(DH/2,Math.min(H-DH/2,d.y))}));
    maxId=Math.max(...desks.map(d=>d.id));
    groupSize=Math.min(MAX_GROUP_SIZE,Math.max(1,Math.round(saved.groupSize)||4));
    gap=Math.min(52,Math.max(8,Math.round(saved.gap)||24));
  }
}catch(_){}
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nf=new Intl.NumberFormat('ko-KR',{maximumFractionDigits:1});
const point=(x,y)=>`${round(x)},${round(y)}`;
const fmt=n=>nf.format(n);
function save(){try{localStorage.setItem('desk-optimizer-state-v1',JSON.stringify({desks,groupSize,gap}));}catch(_){}}
function updateControls(){
  $('desk-count').textContent=desks.length;
  $('group-size').textContent=groupSize;
  $('desk-minus').disabled=busy||desks.length<=1;
  $('desk-plus').disabled=busy||desks.length>=MAX_DESKS;
  $('group-minus').disabled=busy||groupSize<=1;
  $('group-plus').disabled=busy||groupSize>=MAX_GROUP_SIZE;
  $('group-gap').value=gap;
  $('group-gap').disabled=busy;
  $('gap-label').textContent=`${gap}`;
  $('make-groups').disabled=busy;
  $('make-groups').innerHTML=busy?'계산 중…':'<span class="button-icon">✦</span> 모둠 만들기';
  $('scatter').disabled=busy;
}
function setNotice(message,type=''){
  const el=$('notice');el.textContent=message;el.className=`notice ${type}`.trim();
}
function svgBase(){return `<rect class="room-bg" x="1" y="1" width="918" height="558" rx="10"/><rect class="room-top" x="352" y="0" width="216" height="31" rx="5"/><text class="room-top-text" x="460" y="21">교실 앞</text>`;}
function svgDesk(d,targetDesk=false){
  const chosen=selected===d.id?' selected':'';
  const deskType=targetDesk?' target-desk':'';
  return `<g class="desk-node${deskType}${chosen}" data-desk-id="${d.id}" transform="translate(${d.x},${d.y})" tabindex="0" role="button" aria-label="${d.id}번 책상${targetDesk?' 목표 위치':', 드래그 이동 가능'}"><rect class="desk-shape" x="${-DW/2}" y="${-DH/2}" width="${DW}" height="${DH}" rx="5"/><text class="desk-label" x="0" y="1">${d.id}</text></g>`;
}
function renderCurrent(){current.innerHTML=svgBase()+desks.map(d=>svgDesk(d)).join('');}
function renderResult(){
  if(!result){target.innerHTML=svgBase();empty.hidden=false;empty.style.display='flex';$('result-status').className='panel-chip gray';$('result-status').textContent='계산 전';$('results').hidden=true;return;}
  empty.hidden=true;empty.style.display='none';
  $('result-status').className='panel-chip green';$('result-status').textContent='계산 완료';
  const groupSvg=result.groups.map(g=>{
    const labelY=g.y>35?g.y-22:g.y+g.height+12;
    return `<rect class="group-boundary" x="${g.x-5}" y="${g.y-5}" width="${g.width+10}" height="${g.height+10}" rx="9"/><rect class="group-tag-bg" x="${g.x+4}" y="${labelY-11}" width="74" height="23" rx="7"/><text class="group-tag-text" x="${g.x+41}" y="${labelY+1}">${g.id}모둠</text>`;
  }).join('');
  const movements=result.movements;
  const selectedMove=movements.find(m=>m.id===selected);
  let arrow='';
  if(selectedMove){const f=selectedMove.from,t=selectedMove.to,d=selectedMove.distance;
    if(d>2)arrow=`<defs><marker id="arrow-head" markerWidth="10" markerHeight="10" refX="7" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0 0 L0 6 L9 3 z" fill="#ef8e32"/></marker></defs><line class="move-arrow" x1="${f.x}" y1="${f.y}" x2="${t.x}" y2="${t.y}" marker-end="url(#arrow-head)"/><circle class="origin-point" cx="${f.x}" cy="${f.y}" r="12"/>`;
    else arrow=`<circle class="origin-point" cx="${f.x}" cy="${f.y}" r="11"/>`;
  }
  target.innerHTML=svgBase()+groupSvg+arrow+movements.map(m=>svgDesk({id:m.id,x:m.to.x,y:m.to.y},true)).join('');
  $('results').hidden=false;
}
function movementDirection(m){
  const dx=m.to.x-m.from.x,dy=m.to.y-m.from.y;
  if(Math.hypot(dx,dy)<.5)return '거의 이동 없음';
  const horizontal=dx>5?'오른쪽':dx< -5?'왼쪽':'';
  const vertical=dy>5?'아래':dy< -5?'위':'';
  return [horizontal,vertical].filter(Boolean).join(' · ')||'조금 이동';
}
function renderTable(){
  if(!result)return;
  $('total-distance').textContent=fmt(result.total);
  $('average-distance').textContent=fmt(result.total/desks.length);
  $('group-composition').textContent=result.sizes.join(' + ');
  $('movement-table').innerHTML=[...result.movements].sort((a,b)=>a.id-b.id).map(m=>
    `<tr class="${selected===m.id?'selected-row':''}" tabindex="0" data-row-desk="${m.id}" aria-label="${m.id}번 책상 이동 내역"><td><span class="desk-id-pill">${m.id}번</span></td><td>${m.group}모둠</td><td>${movementDirection(m)}<small class="coord-line">(${point(m.from.x,m.from.y)}) → (${point(m.to.x,m.to.y)})</small></td><td><strong>${fmt(m.distance)}</strong></td></tr>`).join('');
}
function render(){updateControls();renderCurrent();renderResult();renderTable();}
function invalidate(message='배치를 변경했습니다. 다시 모둠 만들기를 눌러주세요.'){
  result=null;selected=null;render();save();setNotice(message);
}
function selectDesk(id){selected=(id===selected?null:id);renderCurrent();renderResult();renderTable();}
function toPoint(ev,svg){
  const r=svg.getBoundingClientRect();
  return {x:Math.min(W-DW/2,Math.max(DW/2,(ev.clientX-r.left)/r.width*W)),y:Math.min(H-DH/2,Math.max(DH/2,(ev.clientY-r.top)/r.height*H))};
}
current.addEventListener('pointerdown',e=>{
  if(busy)return;
  const el=e.target.closest('[data-desk-id]');if(!el)return;
  const id=Number(el.dataset.deskId),desk=desks.find(d=>d.id===id);if(!desk)return;
  const pos=toPoint(e,current);
  dragging={id,pointer:e.pointerId,offsetX:desk.x-pos.x,offsetY:desk.y-pos.y,moved:false};
  if(result){result=null;empty.hidden=false;renderResult();setNotice('책상 위치가 변경됩니다. 다시 모둠 만들기를 눌러주세요.');}
  selected=id;renderCurrent();
  current.setPointerCapture(e.pointerId);
  e.preventDefault();
});
current.addEventListener('pointermove',e=>{
  if(!dragging||dragging.pointer!==e.pointerId)return;
  const desk=desks.find(d=>d.id===dragging.id);if(!desk)return;
  const p=toPoint(e,current);desk.x=Math.min(W-DW/2,Math.max(DW/2,p.x+dragging.offsetX));desk.y=Math.min(H-DH/2,Math.max(DH/2,p.y+dragging.offsetY));
  const node=current.querySelector(`[data-desk-id="${desk.id}"]`);
  if(node)node.setAttribute('transform',`translate(${desk.x},${desk.y})`);
  dragging.moved=true;
});
function endDrag(e){
  if(!dragging||dragging.pointer!==e.pointerId)return;
  dragging=null;save();
}
current.addEventListener('pointerup',endDrag);current.addEventListener('pointercancel',endDrag);
current.addEventListener('keydown',e=>{
  if(busy||!e.target.matches('[data-desk-id]'))return;
  const delta={ArrowLeft:[-5,0],ArrowRight:[5,0],ArrowUp:[0,-5],ArrowDown:[0,5]}[e.key];
  if(!delta){if(e.key==='Enter'||e.key===' ')selectDesk(Number(e.target.dataset.deskId));return;}
  e.preventDefault();const d=desks.find(d=>d.id===Number(e.target.dataset.deskId));if(!d)return;
  d.x=Math.min(W-DW/2,Math.max(DW/2,d.x+delta[0]));d.y=Math.min(H-DH/2,Math.max(DH/2,d.y+delta[1]));
  invalidate();const next=current.querySelector(`[data-desk-id="${d.id}"]`);next?.focus();
});
target.addEventListener('click',e=>{const el=e.target.closest('[data-desk-id]');if(el)selectDesk(Number(el.dataset.deskId));});
target.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const el=e.target.closest('[data-desk-id]');if(el){e.preventDefault();selectDesk(Number(el.dataset.deskId));}}});
$('movement-table').addEventListener('click',e=>{const tr=e.target.closest('[data-row-desk]');if(tr)selectDesk(Number(tr.dataset.rowDesk));});
$('movement-table').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){const tr=e.target.closest('[data-row-desk]');if(tr){e.preventDefault();selectDesk(Number(tr.dataset.rowDesk));}}});
$('clear-selection').addEventListener('click',()=>{selected=null;render();});
function nearestFreeDeskPosition(){
  const random=()=>Math.random();let best=null,bestScore=-Infinity;
  for(let i=0;i<120;i++){
    const p={x:DW/2+28+random()*(W-DW-56),y:DH/2+34+random()*(H-DH-70)};
    const minDist=Math.min(...desks.map(d=>Math.hypot(d.x-p.x,d.y-p.y)));
    if(minDist>Math.max(DW,DH)+25)return p;
    if(minDist>bestScore){bestScore=minDist;best=p;}
  }
  return best||{x:W/2,y:H/2};
}
$('desk-minus').addEventListener('click',()=>{if(busy||desks.length<=1)return;desks.pop();maxId=Math.max(...desks.map(d=>d.id));invalidate('마지막 번호의 책상을 삭제했습니다.');});
$('desk-plus').addEventListener('click',()=>{if(busy||desks.length>=MAX_DESKS)return;const p=nearestFreeDeskPosition();desks.push({id:++maxId,x:p.x,y:p.y});invalidate('책상을 추가했습니다. 드래그해서 원하는 위치로 옮겨보세요.');});
$('group-minus').addEventListener('click',()=>{if(busy||groupSize<=1)return;groupSize--;invalidate();});
$('group-plus').addEventListener('click',()=>{if(busy||groupSize>=MAX_GROUP_SIZE)return;groupSize++;invalidate();});
$('group-gap').addEventListener('input',e=>{if(busy)return;gap=Number(e.target.value);invalidate('모둠 사이 간격을 변경했습니다. 다시 모둠 만들기를 눌러주세요.');});
$('scatter').addEventListener('click',()=>{
  if(busy)return;
  const updated=[];
  for(const d of desks){let best=null,bestScore=-1;
    for(let k=0;k<75;k++){
      const x=DW/2+Math.random()*(W-DW),y=DH/2+Math.random()*(H-DH);
      const min=updated.length?Math.min(...updated.map(q=>Math.hypot(x-q.x,y-q.y))):Infinity;
      if(min>75){best={x,y};break;}
      if(min>bestScore){bestScore=min;best={x,y};}
    }
    updated.push({...d,...best});
  }
  desks=updated;invalidate('책상을 새로운 위치에 흩어 놓았습니다.');
});
$('make-groups').addEventListener('click',async()=>{
  if(busy)return;busy=true;updateControls();setNotice('책상별 이동거리와 가능한 모둠 위치를 계산하고 있습니다.');
  await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,15)));
  try{
    const computed=core.optimize(desks,groupSize,gap);
    result=computed;selected=null;
    render();
    setNotice(`${computed.groups.length}개 모둠으로 배치했습니다. ${nf.format(computed.evaluations)}개 후보를 평가하여 탐색한 배치 중 이동거리 합이 가장 작은 결과를 표시합니다.`,'success');
  }catch(err){result=null;render();setNotice(err.message||'계산 중 문제가 발생했습니다.','warning');}
  finally{busy=false;updateControls();}
});
render();
})();
