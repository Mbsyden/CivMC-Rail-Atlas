
const configured = typeof supabase !== 'undefined'
  && /^https?:\/\//.test(window.SUPABASE_URL || '')
  && !String(window.SUPABASE_URL).includes('PASTE_')
  && !!window.SUPABASE_KEY
  && !String(window.SUPABASE_KEY).includes('PASTE_');
const sb = configured ? supabase.createClient(window.SUPABASE_URL, window.SUPABASE_KEY) : null;

const map = L.map('map', {crs:L.CRS.Simple, minZoom:-6, maxZoom:8, zoomSnap:.25});
const $ = id => document.getElementById(id);
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let stations=[], lines=[], baseLines=[], markers=[], layers=[], routeLayer=null, mode=null, pending=null, points=[], temp=[], myRole='viewer', baseVisible=true;

const WALK_WEIGHT = 3.0;
const TRANSFER_PENALTY = 1500;
const CONNECT_RADIUS = 25;

class GridLayer extends L.GridLayer {
  createTile() {
    const c=document.createElement('canvas'), s=this.getTileSize();
    c.width=s.x; c.height=s.y;
    const ctx=c.getContext('2d');
    ctx.strokeStyle='rgba(70,70,70,.22)';
    for(let x=0;x<=s.x;x+=64){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,s.y);ctx.stroke()}
    for(let y=0;y<=s.y;y+=64){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(s.x,y);ctx.stroke()}
    return c;
  }
}
new GridLayer().addTo(map);

async function loadBase(){
  const r=await fetch('base_rail_data.json',{cache:'no-store'});
  if(!r.ok) throw new Error('Could not load base_rail_data.json');
  const d=await r.json();
  baseLines=(d.features||[]).map(f=>({id:'base:'+f.id,name:f.name||'Unnamed railway',color:f.color||'#c5c5c5',lines:f.lines||[]}));
}

async function user(){ return sb ? (await sb.auth.getUser()).data.user : null; }

async function loadDynamic(){
  if(!sb){stations=[];lines=[];return}
  const [a,b]=await Promise.all([
    sb.from('stations').select('*').order('name'),
    sb.from('lines').select('*').order('name')
  ]);
  if(a.error||b.error) throw new Error((a.error||b.error).message);
  stations=a.data||[]; lines=b.data||[];
}

function allSegments(){
  const base=baseLines.flatMap(l=>l.lines.map(seg=>({
    lineId:l.id,lineName:l.name,base:true,
    points:seg.map(p=>({x:+p[0],z:+p[1]}))
  })));
  const dyn=lines.map(l=>({
    lineId:l.id,lineName:l.name,base:false,
    points:(l.points||[]).map(p=>({x:+p.x,z:+p.z}))
  }));
  return base.concat(dyn);
}

function bounds(){
  const pts=allSegments().flatMap(s=>s.points);
  if(!pts.length) return [[-6000,-12000],[6000,12000]];
  const xs=pts.map(p=>p.x), zs=pts.map(p=>p.z), pad=500;
  return [[Math.min(...zs)-pad,Math.min(...xs)-pad],[Math.max(...zs)+pad,Math.max(...xs)+pad]];
}

function render(){
  markers.forEach(x=>x.remove()); layers.forEach(x=>x.remove());
  markers=[]; layers=[];
  if(routeLayer){routeLayer.remove();routeLayer=null}

  baseLines.forEach(l=>l.lines.forEach(seg=>{
    const x=L.polyline(seg.map(p=>[p[1],p[0]]),{
      color:l.color,weight:3,opacity:baseVisible?.78:0,dashArray:'6 4'
    }).addTo(map);
    x.bindPopup(`<b>${esc(l.name)}</b><br><small>Protected VilyanZ base layer</small>`);
    layers.push(x);
  }));

  lines.forEach(l=>{
    const x=L.polyline((l.points||[]).map(p=>[p.z,p.x]),{
      color:'#1769aa',weight:4,opacity:.9
    }).addTo(map);
    x.bindPopup(`<b>${esc(l.name)}</b>`);
    layers.push(x);
  });

  stations.forEach(s=>{
    const x=L.marker([s.z,s.x]).addTo(map);
    x.bindPopup(`<b>${esc(s.name)}</b><br>X ${Math.round(s.x)} Z ${Math.round(s.z)}<br>
      <button class="popupInfo">More information</button>
      <button class="popupReport">⚠ Report</button>`);
    x.on('popupopen',()=>{
      const el=x.getPopup().getElement();
      el.querySelector('.popupInfo')?.addEventListener('click',()=>showStation(s));
      el.querySelector('.popupReport')?.addEventListener('click',()=>openReport('station',s.id,s.name));
    });
    markers.push(x);
  });

  list();
  map.fitBounds(bounds(),{padding:[20,20]});
}

function list(){
  const q=$('search').value.trim().toLowerCase();
  if(!q){$('list').innerHTML='';return}
  const sm=stations.filter(s=>s.name.toLowerCase().includes(q)).slice(0,15);
  const lm=baseLines.concat(lines).filter(l=>(l.name||'').toLowerCase().includes(q)).slice(0,15);
  $('list').innerHTML=
    `<div class="searchGroup"><b>Stations</b>${
      sm.map(s=>`<div class="searchItem" data-s="${s.id}">🚉 ${esc(s.name)}
      <small>X ${Math.round(s.x)} Z ${Math.round(s.z)}</small></div>`).join('')
      ||'<div class="muted">No stations found.</div>'}</div>
     <div class="searchGroup"><b>Railways</b>${
      lm.map(l=>`<div class="searchItem" data-l="${esc(l.id)}">🛤️ ${esc(l.name)}</div>`).join('')
      ||'<div class="muted">No railways found.</div>'}</div>`;

  document.querySelectorAll('[data-s]').forEach(e=>e.onclick=()=>{
    const s=stations.find(x=>x.id===e.dataset.s);
    if(s){map.setView([s.z,s.x],5);showStation(s)}
  });
  document.querySelectorAll('[data-l]').forEach(e=>e.onclick=()=>{
    const l=baseLines.concat(lines).find(x=>x.id===e.dataset.l);
    if(!l)return;
    const pts=l.lines?l.lines.flat():l.points||[];
    if(pts.length) map.fitBounds(L.latLngBounds(pts.map(p=>[p.z??p[1],p.x??p[0]])).pad(.2));
  });
}
$('search').oninput=list;
$('searchClear').onclick=()=>{$('search').value='';list()};

function stationConnections(s){
  return allSegments().filter(seg=>seg.points.some(p=>Math.hypot(p.x-s.x,p.z-s.z)<=150))
    .map(x=>x.lineName).filter((v,i,a)=>a.indexOf(v)===i).slice(0,10);
}
function showStation(s){
  const con=stationConnections(s);
  $('stationInfo').innerHTML=`<h2>${esc(s.name)}</h2>
    <div class="coordBox">X ${Math.round(s.x)} &nbsp; Z ${Math.round(s.z)}</div>
    ${s.description?`<p>${esc(s.description)}</p>`:''}
    <h3>Rail connections</h3>
    ${con.length?'<ul>'+con.map(x=>`<li>${esc(x)}</li>`).join('')+'</ul>':'<p>No associated railway recorded.</p>'}
    <button id="stationRoute">🚆 Plan route from here</button>
    <button id="stationReport">⚠ Report an issue</button>`;
  $('stationInfoModal').classList.remove('hidden');
  $('stationRoute').onclick=()=>{
    $('stationInfoModal').classList.add('hidden');
    $('routeModal').classList.remove('hidden');
    $('fx').value=Math.round(s.x); $('fz').value=Math.round(s.z);
  };
  $('stationReport').onclick=()=>openReport('station',s.id,s.name);
}
$('stationInfoClose').onclick=()=>$('stationInfoModal').classList.add('hidden');

function openReport(type,id,name){
  if(!sb)return alert('Reports require Supabase to be configured in config.js.');
  $('reportModal').dataset.targetType=type;
  $('reportModal').dataset.targetId=id;
  $('reportTarget').textContent='Reporting: '+name;
  $('reportComment').value=''; $('reportMsg').textContent='';
  $('reportModal').classList.remove('hidden');
}
$('reportClose').onclick=()=>$('reportModal').classList.add('hidden');
$('sendReport').onclick=async()=>{
  const u=await user();
  if(!u)return $('reportMsg').textContent='Please sign in first.';
  const m=$('reportModal');
  const {error}=await sb.from('reports').insert({
    target_type:m.dataset.targetType,target_id:String(m.dataset.targetId),
    report_type:$('reportType').value,comment:$('reportComment').value.trim(),reporter_id:u.id
  });
  $('reportMsg').textContent=error?error.message:'Report submitted.';
  if(!error)setTimeout(()=>$('reportModal').classList.add('hidden'),800);
};

$('login').onclick=async()=>{
  if(!sb)return $('authmsg').textContent='Configure Supabase in config.js first.';
  if(await user()){await sb.auth.signOut();await update()}else $('auth').classList.remove('hidden');
};
$('authclose').onclick=()=>$('auth').classList.add('hidden');
$('signin').onclick=async()=>{
  const {error}=await sb.auth.signInWithPassword({email:$('email').value,password:$('password').value});
  $('authmsg').textContent=error?.message||'Signed in';
  if(!error){$('auth').classList.add('hidden');await ensureProfile();await update()}
};
$('signup').onclick=async()=>{
  const {error}=await sb.auth.signUp({email:$('email').value,password:$('password').value});
  $('authmsg').textContent=error?.message||'Account created. Check email if confirmation is enabled.';
};
async function ensureProfile(){
  const u=await user(); if(!u)return;
  const {data}=await sb.from('profiles').select('id').eq('id',u.id).maybeSingle();
  if(!data)await sb.from('profiles').insert({id:u.id,display_name:u.email,role:'viewer'});
}
async function update(){
  let u=await user(); myRole='viewer';
  if(u){
    const {data}=await sb.from('profiles').select('role').eq('id',u.id).maybeSingle();
    myRole=data?.role||'viewer';
  }
  $('status').textContent=!sb?'Map ready • Supabase not configured':u?`Signed in as ${u.email} • ${myRole}`:'Not signed in';
  $('login').textContent=u?'Sign out':'Sign in';
  document.querySelectorAll('.editOnly').forEach(x=>x.classList.toggle('hidden',!(myRole==='contributor'||myRole==='admin')));
  if($('adminTools'))$('adminTools').classList.toggle('hidden',myRole!=='admin');
}

$('refresh').onclick=async()=>{
  try{await loadDynamic();render();await update()}catch(e){alert(e.message)}
};
$('baseToggle').onclick=()=>{
  baseVisible=!baseVisible; render();
  $('baseToggle').textContent=baseVisible?'👁 Base layer':'🚫 Base layer';
};

$('route').onclick=()=>$('routeModal').classList.remove('hidden');
$('routeclose').onclick=()=>$('routeModal').classList.add('hidden');

$('station').onclick=()=>{
  if(myRole!=='contributor'&&myRole!=='admin')return alert('Sign in with an approved contributor account first.');
  mode='station'; alert('Click the map where the station should be placed.');
};
map.on('mousemove',e=>$('coords').textContent='X '+Math.round(e.latlng.lng)+' Z '+Math.round(e.latlng.lat));
map.on('click',e=>{
  if(mode==='station'){
    pending=e.latlng; mode=null; $('stationModal').classList.remove('hidden');
  }else if(mode==='line'){
    points.push({x:e.latlng.lng,z:e.latlng.lat});
    temp.push(L.circleMarker(e.latlng,{radius:4}).addTo(map));
    $('count').textContent=points.length;
  }
});

$('save').onclick=async()=>{
  const u=await user();
  if(!sb||!u||!pending||!$('name').value.trim())return;
  const {error}=await sb.from('stations').insert({
    name:$('name').value.trim(),description:$('desc').value.trim(),
    x:pending.lng,z:pending.lat,created_by:u.id
  });
  if(error)alert(error.message);
  else{$('stationModal').classList.add('hidden');pending=null;$('name').value='';$('desc').value='';await loadDynamic();render()}
};
$('cancel').onclick=()=>$('stationModal').classList.add('hidden');

$('line').onclick=()=>{
  if(myRole!=='contributor'&&myRole!=='admin')return alert('Sign in with an approved contributor account first.');
  mode='line';points=[];temp.forEach(x=>x.remove());temp=[];$('count').textContent=0;$('linebar').classList.remove('hidden');
};
$('stop').onclick=stopLine;
function stopLine(){mode=null;points=[];temp.forEach(x=>x.remove());temp=[];$('linebar').classList.add('hidden')}
$('finish').onclick=async()=>{
  const u=await user();
  if(!sb||!u)return alert('Supabase and an approved contributor account are required.');
  if(points.length<2)return alert('Need at least 2 points.');
  const name=prompt('Rail line name:','New rail line')||'Unnamed rail line';
  const {error}=await sb.from('lines').insert({name,points,created_by:u.id});
  if(error)alert(error.message);else{stopLine();await loadDynamic();render()}
};

function buildGraph(){
  const nodes=[],adj=new Map(),segments=allSegments();
  segments.forEach((s,si)=>{
    s.points.forEach((p,i)=>{
      const id=`${si}:${i}`;
      nodes.push({id,x:p.x,z:p.z,lineId:s.lineId,lineName:s.lineName});
      adj.set(id,[]);
      if(i){
        const a=`${si}:${i-1}`;
        const w=Math.hypot(p.x-s.points[i-1].x,p.z-s.points[i-1].z);
        adj.get(id).push({to:a,w,type:'rail'});
        adj.get(a).push({to:id,w,type:'rail'});
      }
    });
  });
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    if(nodes[i].lineId===nodes[j].lineId)continue;
    const d=Math.hypot(nodes[i].x-nodes[j].x,nodes[i].z-nodes[j].z);
    if(d<=CONNECT_RADIUS){
      const w=d+TRANSFER_PENALTY;
      adj.get(nodes[i].id).push({to:nodes[j].id,w,type:'transfer'});
      adj.get(nodes[j].id).push({to:nodes[i].id,w,type:'transfer'});
    }
  }
  return {nodes,adj};
}

function shortest(g,fx,fz,tx,tz){
  const dist=new Map(),prev=new Map(),q=[];
  g.nodes.forEach(n=>dist.set(n.id,Infinity));
  g.nodes.forEach(n=>{
    const cost=Math.hypot(n.x-fx,n.z-fz)*WALK_WEIGHT;
    dist.set(n.id,cost);q.push([cost,n.id]);
  });
  const endSet=new Set(g.nodes.map(n=>n.id));
  let bestEnd=null;
  while(q.length){
    q.sort((a,b)=>a[0]-b[0]);
    const [du,u]=q.shift();
    if(du!==dist.get(u))continue;
    const n=g.nodes.find(x=>x.id===u);
    if(!bestEnd || du+Math.hypot(n.x-tx,n.z-tz)*WALK_WEIGHT < bestEnd.cost){
      bestEnd={id:u,cost:du+Math.hypot(n.x-tx,n.z-tz)*WALK_WEIGHT};
    }
    if(du>bestEnd.cost)break;
    for(const e of g.adj.get(u)||[]){
      const nd=du+e.w;
      if(nd<dist.get(e.to)){dist.set(e.to,nd);prev.set(e.to,u);q.push([nd,e.to])}
    }
  }
  if(!bestEnd)return null;
  const path=[];let cur=bestEnd.id;
  while(cur){path.push(g.nodes.find(n=>n.id===cur));cur=prev.get(cur)}
  path.reverse();
  return {nodes:path,cost:bestEnd.cost};
}

$('calc').onclick=()=>{
  const fx=+$('fx').value,fz=+$('fz').value,tx=+$('tx').value,tz=+$('tz').value;
  if(![fx,fz,tx,tz].every(Number.isFinite))return $('result').textContent='Enter all four coordinates.';
  const g=buildGraph(); if(!g.nodes.length)return $('result').textContent='No railway data loaded.';
  const r=shortest(g,fx,fz,tx,tz); if(!r)return $('result').textContent='No route found.';
  const first=r.nodes[0],last=r.nodes[r.nodes.length-1];
  const walkStart=Math.hypot(first.x-fx,first.z-fz),walkEnd=Math.hypot(last.x-tx,last.z-tz);
  let rail=0,transfers=0;
  for(let i=1;i<r.nodes.length;i++){
    rail+=Math.hypot(r.nodes[i].x-r.nodes[i-1].x,r.nodes[i].z-r.nodes[i-1].z);
    if(r.nodes[i].lineId!==r.nodes[i-1].lineId)transfers++;
  }
  const pts=[{x:fx,z:fz},...r.nodes,{x:tx,z:tz}];
  if(routeLayer)routeLayer.remove();
  routeLayer=L.polyline(pts.map(p=>[p.z,p.x]),{color:'#ff7a00',weight:5,dashArray:'10 8'}).addTo(map);
  map.fitBounds(routeLayer.getBounds().pad(.2));
  $('result').innerHTML=`<div class="routeSummary"><b>Quickest route found</b><br>
    Walk to rail: ${Math.round(walkStart).toLocaleString()} blocks<br>
    Rail: ${Math.round(rail).toLocaleString()} blocks<br>
    Transfers: ${transfers}<br>
    Walk to destination: ${Math.round(walkEnd).toLocaleString()} blocks<br>
    <b>Weighted route cost: ${Math.round(r.cost).toLocaleString()}</b></div>`;
};

$('export').onclick=()=>{
  const blob=new Blob([JSON.stringify({stations,lines},null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='civmc-rail-atlas-data.json';a.click();
};

$('import').onchange=async e=>{
  if(!sb)return alert('Supabase is required to import shared data.');
  const u=await user();if(!u)return alert('Sign in first.');
  try{
    const o=JSON.parse(await e.target.files[0].text());
    for(const s of o.stations||[])await sb.from('stations').insert({name:s.name,description:s.description||'',x:s.x,z:s.z,created_by:u.id});
    for(const l of o.lines||[])await sb.from('lines').insert({name:l.name||'Imported line',points:l.points,created_by:u.id});
    await loadDynamic();render();
  }catch(err){alert(err.message)}
};

async function loadHistory(){
  const {data,error}=await sb.from('edit_history').select('*').order('created_at',{ascending:false}).limit(100);
  if(error)return $('historyList').textContent=error.message;
  $('historyList').innerHTML=(data||[]).map(x=>`<div class="historyItem"><b>${esc(x.action)}</b> ${esc(x.entity_type)} <b>${esc(x.entity_name||'Unnamed')}</b><small>${new Date(x.created_at).toLocaleString()}</small></div>`).join('')||'<p>No edits recorded.</p>';
}
async function backup(){
  const [a,b,c,d]=await Promise.all([
    sb.from('stations').select('*'),sb.from('lines').select('*'),
    sb.from('reports').select('*'),sb.from('edit_history').select('*').order('created_at')
  ]);
  const err=a.error||b.error||c.error||d.error;
  if(err)return $('adminMsg').textContent=err.message;
  const data={format:'civmc-rail-atlas-backup',version:1,exported_at:new Date().toISOString(),stations:a.data||[],lines:b.data||[],reports:c.data||[],edit_history:d.data||[]};
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),aEl=document.createElement('a');
  aEl.href=url;aEl.download='civmc-rail-atlas-backup-'+new Date().toISOString().slice(0,10)+'.json';aEl.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);$('adminMsg').textContent='Backup exported.';
}
if($('historyBtn'))$('historyBtn').onclick=async()=>{$('historyModal').classList.remove('hidden');await loadHistory()};
if($('historyClose'))$('historyClose').onclick=()=>$('historyModal').classList.add('hidden');
if($('backupBtn'))$('backupBtn').onclick=backup;

(async function init(){
  try{
    await loadBase();
    await loadDynamic();
    render();
    await update();
  }catch(e){
    console.error(e);
    $('status').textContent='Map data failed to load: '+e.message;
    alert(e.message);
  }
})();
