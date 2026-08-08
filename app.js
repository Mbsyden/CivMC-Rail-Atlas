const sb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const map=L.map('map',{crs:L.CRS.Simple,minZoom:-4,maxZoom:7}).setView([0,0],-1);
const bounds=[[-6000,-12000],[6000,12000]];L.rectangle(bounds,{color:'#777',weight:1,fill:false,interactive:false}).addTo(map);map.fitBounds(bounds);
let stations=[],lines=[],baseStations=[],baseLines=[],markers=[],baseMarkers=[],layers=[],baseLayers=[],mode=null,pending=null,points=[],temp=[],myRole='viewer',baseVisible=true,editingBase=false;
const isEditor=()=>myRole==='contributor'||myRole==='admin'; const isAdmin=()=>myRole==='admin';
const $=x=>document.getElementById(x), esc=x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function user(){return (await sb.auth.getUser()).data.user}
async function load(){let [a,b,c,d]=await Promise.all([sb.from('stations').select('*').order('name'),sb.from('lines').select('*').order('name'),sb.from('base_stations').select('*').order('name'),sb.from('base_lines').select('*').order('name')]);if(a.error||b.error||c.error||d.error)return alert('Database error. Check config.js and schema.sql/seed_base_rail_data.sql.');stations=a.data||[];lines=b.data||[];baseStations=c.data||[];baseLines=d.data||[];render()}
function render(){markers.forEach(x=>x.remove());layers.forEach(x=>x.remove());baseMarkers.forEach(x=>x.remove());baseLayers.forEach(x=>x.remove());markers=[];layers=[];baseMarkers=[];baseLayers=[];
baseLines.forEach(l=>(l.lines||[]).forEach(segment=>{let x=L.polyline(segment.map(p=>[p[1],p[0]]),{color:l.color||'#c5c5c5',weight:3,opacity:.75,dashArray:'6 4'}).addTo(map);x.bindPopup('<b>Base rail</b><br>'+esc(l.name));baseLayers.push(x)}));
baseStations.forEach(s=>{let x=L.circleMarker([s.z,s.x],{radius:5,color:'#555',fillColor:'#fff',fillOpacity:1,weight:2}).addTo(map).bindPopup('<b>Base station</b><br>'+esc(s.name)+'<br>X '+Math.round(s.x)+' Z '+Math.round(s.z));baseMarkers.push(x)});
if(!baseVisible){baseLayers.forEach(x=>x.remove());baseMarkers.forEach(x=>x.remove())}
lines.forEach(l=>{let x=L.polyline((l.points||[]).map(p=>[p.z,p.x])).addTo(map);x._railId=l.id;x.bindPopup('<b>'+esc(l.name)+'</b>');layers.push(x)});stations.forEach(s=>{let x=L.marker([s.z,s.x]).addTo(map).bindPopup('<b>'+esc(s.name)+'</b><br>X '+Math.round(s.x)+' Z '+Math.round(s.z)+'<br><button class="popupInfo">More information</button><button class="popupReport">⚠ Report</button>');x.on('popupopen',()=>{let p=x.getPopup().getElement();p.querySelector('.popupInfo')?.addEventListener('click',()=>showStation(s));p.querySelector('.popupReport')?.addEventListener('click',()=>openReport('station',s.id,s.name))});markers.push(x)});list()}
function list(){let q=$('search').value.toLowerCase();$('list').innerHTML=stations.filter(s=>s.name.toLowerCase().includes(q)).map(s=>'<div class="station" data-id="'+s.id+'"><b>'+esc(s.name)+'</b><br>X '+Math.round(s.x)+' Z '+Math.round(s.z)+'</div>').join('');document.querySelectorAll('.station').forEach(e=>e.onclick=()=>{let s=stations.find(x=>x.id===e.dataset.id);map.setView([s.z,s.x],4)})}
$('search').oninput=list;$('refresh').onclick=load;
$('login').onclick=async()=>{if(await user()){await sb.auth.signOut();update()}else $('auth').classList.remove('hidden')};
async function update(){
  let u=await user(); myRole='viewer';
  if(u){
    let {data}=await sb.from('profiles').select('role').eq('id',u.id).maybeSingle();
    myRole=data?.role||'viewer';
  }
  $('status').textContent=u?`Signed in as ${u.email} • ${myRole}`:'Not signed in';
  $('login').textContent=u?'Sign out':'Sign in';
  document.querySelectorAll('.editOnly').forEach(x=>x.classList.toggle('hidden',!isEditor()));
  document.querySelectorAll('.adminOnly').forEach(x=>x.classList.toggle('hidden',!isAdmin())); $('baseAdmin').classList.toggle('hidden',!isAdmin());
}
$('authclose').onclick=()=>$('auth').classList.add('hidden');
$('signin').onclick=async()=>{let {error}=await sb.auth.signInWithPassword({email:$('email').value,password:$('password').value});$('authmsg').textContent=error?error.message:'Signed in';if(!error){$('auth').classList.add('hidden');await ensureProfile();update()}};
$('signup').onclick=async()=>{let {error}=await sb.auth.signUp({email:$('email').value,password:$('password').value});$('authmsg').textContent=error?error.message:'Account created; check email if confirmation is enabled.'};
map.on('mousemove',e=>$('coords').textContent='X '+Math.round(e.latlng.lng)+' Z '+Math.round(e.latlng.lat));
$('station').onclick=async()=>{if(!isEditor())return alert('You are not on the approved contributor list.');mode='station';alert('Click the station location on the map.')};
map.on('click',e=>{if(mode==='station'){pending=e.latlng;mode=null;$('stationModal').classList.remove('hidden')}else if(mode==='baseStation'){pending=e.latlng;mode=null;let n=prompt('Base station name:');if(n){sb.from('base_stations').insert({source_id:'manual-'+Date.now(),name:n,x:pending.lng,z:pending.lat}).then(({error})=>{if(error)alert(error.message);else load()})}}else if(mode==='line'||mode==='baseLine'){points.push({x:e.latlng.lng,z:e.latlng.lat});temp.push(L.circleMarker(e.latlng,{radius:5}).addTo(map));$('count').textContent=points.length}});
$('save').onclick=async()=>{let u=await user();if(!u||!pending||!$('name').value.trim())return;let {error}=await sb.from('stations').insert({name:$('name').value.trim(),description:$('desc').value.trim(),x:pending.lng,z:pending.lat,created_by:u.id});if(error)alert(error.message);else{$('stationModal').classList.add('hidden');pending=null;load()}};
$('cancel').onclick=()=>$('stationModal').classList.add('hidden');
$('line').onclick=async()=>{if(!isEditor())return alert('You are not on the approved contributor list.');mode='line';points=[];temp.forEach(x=>x.remove());temp=[];$('count').textContent=0;$('linebar').classList.remove('hidden')};
$('stop').onclick=stopLine;function stopLine(){mode=null;points=[];temp.forEach(x=>x.remove());temp=[];$('linebar').classList.add('hidden')}
$('finish').onclick=async()=>{let u=await user();if(points.length<2)return alert('Need at least 2 points.');let name=prompt('Rail line name:','New rail line')||'Unnamed rail line';let error;if(mode==='baseLine'){let r=await sb.from('base_lines').insert({source_id:'manual-'+Date.now(),name,color:'#555555',lines:[points]});error=r.error}else{let r=await sb.from('lines').insert({name,points,created_by:u.id});error=r.error}if(error)alert(error.message);else{stopLine();load()}};

$('export').onclick=()=>{let b=new Blob([JSON.stringify({stations,lines},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='civmc-rail-atlas.json';a.click()};
$('import').onchange=async e=>{let u=await user();if(!u)return alert('Sign in first.');let o=JSON.parse(await e.target.files[0].text());for(let s of o.stations||[])await sb.from('stations').insert({name:s.name,description:s.description||'',x:s.x??s.lng,z:s.z??s.lat,created_by:u.id});for(let l of o.lines||[])await sb.from('lines').insert({name:l.name||'Imported line',points:l.points,created_by:u.id});load()};

async function ensureProfile(){
  let u=await user(); if(!u)return;
  let {data}=await sb.from('profiles').select('id').eq('id',u.id).maybeSingle();
  if(!data) await sb.from('profiles').insert({id:u.id,display_name:u.email,role:'viewer'});
}
$('admin').onclick=async()=>{if(!isAdmin())return;$('adminModal').classList.remove('hidden');await loadUsers()};
$('adminclose').onclick=()=>$('adminModal').classList.add('hidden');
async function loadUsers(){
  let {data,error}=await sb.from('profiles').select('id,display_name,role,created_at').order('created_at');
  if(error){$('users').textContent=error.message;return}
  $('users').innerHTML=(data||[]).map(x=>`<div class="station"><b>${esc(x.display_name||x.id)}</b><br>${x.role}<br><small>${x.id}</small></div>`).join('');
}
$('grant').onclick=async()=>{
  if(!isAdmin())return;
  const email=$('adminEmail').value.trim(), name=$('adminName').value.trim()||email, role=$('adminRole').value;
  if(!email)return;
  // Supabase does not expose a safe browser-side "find user by email" API.
  // Admins should paste the user's Auth UUID into the admin workflow in the dashboard.
  $('adminmsg').innerHTML='<b>Use the Supabase Auth user UUID for this person.</b><br>Open Supabase → Authentication → Users, copy their UUID, then run the SQL shown in README.md.';
};

$('baseToggle').onclick=()=>{baseVisible=!baseVisible;render();$('baseToggle').textContent=baseVisible?'👁 Base layer':'🚫 Base layer'};
$('reloadBase').onclick=load;
$('baseStation').onclick=async()=>{if(!isAdmin())return alert('Admin only.');editingBase=true;mode='baseStation';alert('Click the map to place the base station.')};
$('baseLine').onclick=async()=>{if(!isAdmin())return alert('Admin only.');editingBase=true;mode='baseLine';points=[];temp.forEach(x=>x.remove());temp=[];$('count').textContent=0;$('linebar').classList.remove('hidden')};


function stationLines(s){
  return lines.filter(l=>(l.points||[]).some(p=>Math.hypot(+p.x-s.x,+p.z-s.z)<=500));
}
function showStation(s){
  const connected=stationLines(s);
  $('stationInfo').innerHTML=`<h2>${esc(s.name)}</h2>
  <div class="coordBox">X ${Math.round(s.x)} &nbsp; Z ${Math.round(s.z)}</div>
  ${s.description?`<p>${esc(s.description)}</p>`:''}
  <h3>Rail connections</h3>
  ${connected.length?'<ul>'+connected.map(l=>`<li>${esc(l.name||'Unnamed railway')}</li>`).join('')+'</ul>':'<p>No associated railway is currently recorded.</p>'}
  <button id="stationRoute">🚆 Plan route from here</button><button id="stationReport">⚠ Report an issue</button>`;
  $('stationInfoModal').classList.remove('hidden');
  $('stationRoute').onclick=()=>{$('stationInfoModal').classList.add('hidden');$('routeModal').classList.remove('hidden');$('fx').value=Math.round(s.x);$('fz').value=Math.round(s.z)};
  $('stationReport').onclick=()=>openReport('station',s.id,s.name);
}
function list(){
  const q=$('search').value.trim().toLowerCase();
  if(!q){$('searchResults').innerHTML='';return}
  const sm=stations.filter(s=>s.name.toLowerCase().includes(q)).slice(0,12);
  const lm=lines.filter(l=>(l.name||'Unnamed railway').toLowerCase().includes(q)).slice(0,12);
  $('searchResults').innerHTML=`<div class="searchGroup"><b>Stations</b>${sm.map(s=>`<div class="searchItem" data-s="${s.id}">🚉 ${esc(s.name)} <small>X ${Math.round(s.x)} Z ${Math.round(s.z)}</small></div>`).join('')||'<div class="muted">No stations found.</div>'}</div>
  <div class="searchGroup"><b>Railways</b>${lm.map(l=>`<div class="searchItem" data-l="${l.id}">🛤️ ${esc(l.name||'Unnamed railway')}</div>`).join('')||'<div class="muted">No railways found.</div>'}</div>`;
  document.querySelectorAll('[data-s]').forEach(e=>e.onclick=()=>{let s=stations.find(x=>x.id===e.dataset.s);if(s){map.setView([s.z,s.x],5);showStation(s)}});
  document.querySelectorAll('[data-l]').forEach(e=>e.onclick=()=>{let l=lines.find(x=>x.id===e.dataset.l);let layer=layers.find(x=>x._railId===l?.id);if(layer){map.fitBounds(layer.getBounds().pad(.2));layer.openPopup()}});
}
$('search').oninput=list;
$('searchClear').onclick=()=>{$('search').value='';list()};
$('stationInfoClose').onclick=()=>$('stationInfoModal').classList.add('hidden');

function openReport(type,id,name){
  $('reportTarget').textContent='Reporting: '+name;
  $('reportModal').dataset.targetType=type;$('reportModal').dataset.targetId=id;
  $('reportComment').value='';$('reportMsg').textContent='';$('reportModal').classList.remove('hidden');
}
$('reportClose').onclick=()=>$('reportModal').classList.add('hidden');
$('sendReport').onclick=async()=>{
  const u=await user();if(!u)return $('reportMsg').textContent='Please sign in to submit a report.';
  const m=$('reportModal'),{error}=await sb.from('reports').insert({target_type:m.dataset.targetType,target_id:m.dataset.targetId,report_type:$('reportType').value,comment:$('reportComment').value.trim(),reporter_id:u.id});
  $('reportMsg').textContent=error?error.message:'Report submitted. Thank you.';
  if(!error)setTimeout(()=>$('reportModal').classList.add('hidden'),900);
};
/* =========================
   SMART ROUTE PLANNER
   Phase 1: network cleanup
   Phase 2: station routing
   Phase 3: scoring
   Phase 4: journey UI
   Phase 5: metadata-aware preferences
   ========================= */

function distance(a,b){return Math.hypot(a.x-b.x,a.z-b.z)}
function routeGraph(){
  const nodes=[],edges=[],byLine=new Map();
  // Convert every line feature into a graph of track nodes.
  lines.forEach(l=>{
    const pts=(l.points||[]).filter(p=>Number.isFinite(+p.x)&&Number.isFinite(+p.z));
    if(pts.length<2)return;
    const ids=[];
    pts.forEach((p,i)=>{const id=l.id+':'+i;nodes.push({id,x:+p.x,z:+p.z,line:l.id,lineName:l.name||'Unnamed line',index:i});ids.push(id)});
    byLine.set(l.id,ids);
    for(let i=1;i<ids.length;i++){
      const a=nodes[nodes.length-pts.length+i-1],b=nodes[nodes.length-pts.length+i];
      edges.push([a.id,b.id,distance(a,b),l]);
    }
  });
  // Phase 1: connect separate features when their endpoints are within a small
  // tolerance. This turns visually touching rail features into usable junctions.
  for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){
    const a=nodes[i],b=nodes[j];
    if(a.line===b.line)continue;
    const d=distance(a,b);
    if(d<=5)edges.push([a.id,b.id,d,{id:'junction',name:'Junction'}]);
  }
  // Phase 1: connect stations to the nearest track node, but only if reasonably close.
  stations.forEach(s=>{
    let best=null;
    nodes.forEach(n=>{const d=Math.hypot(n.x-s.x,n.z-s.z);if(!best||d<best.d)best={n,d}});
    if(best && best.d<=500) edges.push([`station:${s.id}`,best.n.id,best.d,{id:'station',name:s.name}]);
    nodes.push({id:`station:${s.id}`,x:+s.x,z:+s.z,station:s});
  });
  return {nodes,edges};
}

function shortestRoute(g,startId,endId,opts={}){
  const adj=new Map(g.nodes.map(n=>[n.id,[]]));
  g.edges.forEach(([a,b,w,meta])=>{
    const cost=scoreEdge(w,meta,opts);
    adj.get(a)?.push([b,cost,w,meta]); adj.get(b)?.push([a,cost,w,meta]);
  });
  const distMap=new Map(g.nodes.map(n=>[n.id,Infinity])),prev=new Map();
  const transfers=new Map(g.nodes.map(n=>[n.id,0]));
  const open=[[0,startId,null]];
  distMap.set(startId,0);
  let target=null;
  while(open.length){
    open.sort((a,b)=>a[0]-b[0]);
    const [d,u,prevLine]=open.shift();
    if(d!==distMap.get(u))continue;
    if(u===endId){target=u;break}
    for(const [v,c,w,meta] of adj.get(u)||[]){
      const vNode=g.nodes.find(n=>n.id===v), uNode=g.nodes.find(n=>n.id===u);
      const line=vNode?.line||uNode?.line||null;
      const transfer=(prevLine&&line&&prevLine!==line)?1:0;
      const nd=d+c+(transfer*transferPenalty(opts));
      if(nd<distMap.get(v)){
        distMap.set(v,nd);prev.set(v,{id:u,line,raw:w,meta,transfer});
        transfers.set(v,(transfers.get(u)||0)+transfer);
        open.push([nd,v,line]);
      }
    }
  }
  if(!target)return null;
  const ids=[];let cur=target;
  while(cur){ids.push(cur);cur=prev.get(cur)?.id}
  ids.reverse();
  const nodes=ids.map(id=>g.nodes.find(n=>n.id===id));
  let railDistance=0,transferCount=0;
  for(let i=1;i<ids.length;i++){const p=prev.get(ids[i]);railDistance+=p?.raw||0;transferCount+=p?.transfer||0}
  return {nodes,distance:railDistance,transfers:transferCount,cost:distMap.get(target)};
}

function scoreEdge(raw,meta,opts){
  // Practical journey scoring:
  // walking access is deliberately much cheaper than a long rail detour.
  // This lets the planner choose sensible journeys such as:
  // Walk 500 → train 2,000 → walk 100
  // instead of forcing a traveller to stay on rail for thousands of blocks.
  if(meta?.id==='station') return raw*(opts.walkWeight||0.25);
  return raw*(opts.railWeight||1);
}
function transferPenalty(opts){
  // Transfers are expensive enough to favour a direct railway when the
  // extra rail distance is reasonable.
  if(opts.transferPref==='few')return 5000;
  if(opts.transferPref==='distance')return 1500;
  return 3500;
}

function nearestStations(x,z,count=8){
  return stations.map(s=>({s,d:Math.hypot(+s.x-x,+s.z-z)}))
    .sort((a,b)=>a.d-b.d).slice(0,count);
}

function buildCandidates(fx,fz,tx,tz,opts){
  const g=routeGraph();
  // Phase 2: station-first routing. Prefer named stations but retain track
  // endpoints as fallbacks so sparse networks remain routable.
  const starts=nearestStations(fx,fz,8), ends=nearestStations(tx,tz,8);
  let best=[];
  for(const a of starts)for(const b of ends){
    const r=shortestRoute(g,`station:${a.s.id}`,`station:${b.s.id}`,opts);
    if(r)best.push({...r,start:a,end:b,totalCost:r.cost+a.d*(opts.walkWeight||1)+b.d*(opts.walkWeight||1)});
  }
  return best.sort((a,b)=>a.totalCost-b.totalCost);
}

function drawSmartRoute(fx,fz,tx,tz,route){
  layers.filter(x=>x.options?.className==='routeLine').forEach(x=>x.remove());
  const points=[{x:fx,z:fz},...route.nodes.filter(Boolean).map(n=>({x:n.x,z:n.z})),{x:tx,z:tz}];
  const layer=L.polyline(points.map(p=>[p.z,p.x]),{className:'routeLine'}).addTo(map);
  layer.bindPopup('Selected route');layer.bringToFront();layers.push(layer);
  map.fitBounds(layer.getBounds().pad(.2));
}

function journeySteps(fx,fz,tx,tz,r){
  const steps=[];
  steps.push(`Walk ${Math.round(r.start.d).toLocaleString()} blocks → <b>${esc(r.start.s.name)}</b>`);
  let lastLine=null;
  r.nodes.forEach(n=>{
    if(!n)return;
    if(n.line&&n.line!==lastLine){
      if(lastLine)steps.push(`Transfer at the railway junction`);
      if(n.lineName)steps.push(`Take <b>${esc(n.lineName)}</b>`);
      lastLine=n.line;
    }
  });
  steps.push(`Arrive at <b>${esc(r.end.s.name)}</b>`);
  steps.push(`Walk ${Math.round(r.end.d).toLocaleString()} blocks → destination`);
  return steps;
}

function routeSummary(r){
  return `<div class="ok"><h3>Best route</h3>
  <b>${esc(r.start.s.name)} → ${esc(r.end.s.name)}</b>
  <br>Rail distance: ${Math.round(r.distance).toLocaleString()} blocks
  <br>Walking: ${Math.round(r.walking).toLocaleString()} blocks
  <br>Total movement: ${Math.round(r.totalJourneyDistance).toLocaleString()} blocks
  <br>Transfers: ${r.transfers}
  <h4>Journey</h4><ol>${journeySteps(0,0,0,0,r).map(x=>'<li>'+x+'</li>').join('')}</ol>
  </div>`;
}

$('route').onclick=()=>$('routeModal').classList.remove('hidden');
$('routeclose').onclick=()=>$('routeModal').classList.add('hidden');

$('calc').onclick=()=>{
  const fx=+$('fx').value,fz=+$('fz').value,tx=+$('tx').value,tz=+$('tz').value;
  if(![fx,fz,tx,tz].every(Number.isFinite))return $('result').innerHTML='<div class="error">Enter all four coordinates.</div>';
  if(!lines.length)return $('result').innerHTML='<div class="error">No rail lines are loaded.</div>';
  const opts={
    walkPref:$('walkPref').value,transferPref:$('transferPref').value,
    walkWeight:$('walkPref').value==='walk'?3:($('walkPref').value==='rail'?.5:1),
    railWeight:$('walkPref').value==='rail'?.8:1
  };
  let routes=buildCandidates(fx,fz,tx,tz,opts);
  if(!routes.length)return $('result').innerHTML='<div class="error">No connected station-to-station route was found.</div>';
  // Prefer practical total journeys: a little walking is normally better than
  // taking the railway a huge distance out of the way.
  routes.forEach(r=>{
    const walk=r.start.d+r.end.d;
    r.walking=walk;
    r.totalJourneyDistance=walk+r.distance;
    r.totalCost=(walk*0.25)+(r.distance*1)+(r.transfers*transferPenalty(opts));
  });
  routes.sort((a,b)=>a.totalCost-b.totalCost);
  // Phase 4: alternatives. Keep the best few meaningfully different station pairs.
  routes=routes.slice(0,3);
  const best=routes[0];drawSmartRoute(fx,fz,tx,tz,best);
  $('result').innerHTML=routeSummary(best)+
    (routes.length>1?`<h4>Alternatives</h4>${routes.slice(1).map((r,i)=>`<div class="alternative"><b>${esc(r.start.s.name)} → ${esc(r.end.s.name)}</b><br>${Math.round(r.distance).toLocaleString()} rail blocks · ${r.transfers} transfers</div>`).join('')}`:'')+
    `<small>Route estimates use the railway data currently loaded in the map. They do not know train schedules, closures, terrain, ownership or access rules unless that information has been entered into the map.</small>`;
};
