/* ============================ PRODUCTION ============================ */
function axProdBuild(data){
  const plan=getFilteredPlan(), S=AX.stream, key=axKey(S), uL=axUL(S);
  const act=data.filter(r=>r.stream===key), pl=plan.filter(p=>p.stream===key);
  const a=U.sum(act,'productionVolume'), p=U.sum(pl,'targetVolume'), ach=p?a/p*100:null;
  const byA=U.groupBy(act,r=>r.date), byP=U.groupBy(pl,r=>r.date);
  const dates=[...new Set([...byA.keys(),...byP.keys()])].sort();
  const last=dates.filter(d=>U.sum(byA.get(d)||[],'productionVolume')>0).pop()||null;
  let ca=0,cp=0; const cumA=[],cumP=[],dayV=[];
  dates.forEach(d=>{ const x=U.sum(byA.get(d)||[],'productionVolume'), y=U.sum(byP.get(d)||[],'targetVolume'); cp+=y; ca+=x;
    cumP.push(cp); cumA.push(last&&d<=last?ca:null); dayV.push(last&&d<=last&&y>0?x-y:null); });
  const li=last?dates.indexOf(last):-1, curGap=li>=0?cumA[li]-cumP[li]:null;
  const aheadTxt = curGap==null?'—':(curGap>=0?'Ahead ':'Behind ')+U.fmt(Math.abs(curGap),0)+' '+uL+' (kumulatif s/d '+last+')';
  const shifts=[...new Set(act.map(r=>r.shift))].sort();
  const trendBtn=axSeg(AX.trend,[['date','Tanggal'],['shift','Shift'],['hour','Jam']],'axSetTrend');
  // contribution by fleet
  const fA=U.groupBy(act,r=>r.fleet), fP=U.groupBy(pl,r=>r.fleet);
  const fleets=[...new Set([...fA.keys(),...fP.keys()])].map(f=>{ const x=U.sum(fA.get(f)||[],'productionVolume'), y=U.sum(fP.get(f)||[],'targetVolume'); return {f,a:x,p:y,g:x-y,ach:y?x/y*100:null,c:a?x/a*100:0}; }).sort((x,y)=>y.a-x.a);
  // shift comparison (memakai filter aktif)
  const fuelAll=getFilteredFuel(), pu=getFilteredUnitStatus(), dl=getFilteredDelay(), idl=getFilteredIdle();
  const shRows=[...new Set([...data.map(r=>r.shift),...pu.map(s=>s.shift)])].sort().map(sh=>{
    const R={rec:data.filter(r=>r.shift===sh),plan:plan.filter(x=>x.shift===sh),st:pu.filter(x=>x.shift===sh),dl:dl.filter(x=>x.shift===sh),idl:idl.filter(x=>x.shift===sh),fuel:fuelAll.filter(x=>x.shift===sh)};
    return {sh,M:axMetrics(R)}; });
  const shTbl=axTbl([['Shift'],['OB (BCM)',1],['Ach OB',1],['CO (Ton)',1],['Ach CO',1],['PA',1],['UA',1],['Delay',1],['Idle',1],['BD',1],['Fuel (L)',1]],
    shRows.map(({sh,M})=>`<tr><td><b>${esc(sh)}</b></td><td class="r">${axNum(M.ob)}</td><td class="r">${axPct(M.obAch)}</td><td class="r">${axNum(M.co)}</td><td class="r">${axPct(M.coAch)}</td><td class="r">${axPct(M.pa)}</td><td class="r">${axPct(M.ua)}</td><td class="r">${ovDur(M.delay)}</td><td class="r">${ovDur(M.idle)}</td><td class="r">${ovDur(M.bd)}</td><td class="r">${M.fuel?axNum(M.fuel):'—'}</td></tr>`));
  const kp=(l,v,s)=>`<div class="ax-kpi"><label>${l}</label><b>${v}</b>${s?`<small>${s}</small>`:''}</div>`;
  const top=`${axScopeBar('Production — '+(filters.shift==='all'?'Semua Shift':filters.shift)+(filters.pit!=='all'?' • Pit '+filters.pit+' (hanya Production)':''),'gap')}
  <div class="ov-sec">Production KPI <span>${S==='OB'?'Overburden':'Coal'} (${uL}) — OB &amp; CO tidak dijumlahkan</span></div>
  <div class="flex items-center justify-between mb-2">${axSeg(S,[['OB','OB (BCM)'],['CO','CO (Ton)']],'axSetStream')}<span class="ov-note">${esc(aheadTxt)}</span></div>
  <div class="ax-kpis">${kp('Actual',axNum(a),uL)}${kp('Plan',axNum(p),uL)}${kp('Achievement',axPct(ach),'Actual ÷ Plan')}${kp('Variance (Actual − Plan)',p?ovSigned(a-p):'—',uL)}</div>
  ${axCompare([['OB Actual','ob',0,'BCM'],['Ach OB','obAch',1,'',true],['CO Actual','co',0,'Ton'],['Ach CO','coAch',1,'',true],['PA','pa',1,'',true],['UA','ua',1,'',true]])}
  <div class="ov-sec">Tier A — Decision Charts</div>
  <div class="ax-g2">${axPanel('Cumulative Plan vs Actual','Production '+S+' — '+(filters.fleet==='all'?'semua fleet':filters.fleet),'ax_cum',280)}${axPanel('Production Variance harian (Actual − Plan)','Production '+S+' — hari dengan plan','ax_var',280)}</div>
  ${axFold('Tier B — Diagnostic',`
    <div class="ax-g2">${axPanel('Production Trend','Production '+S+' — per '+(AX.trend==='date'?'tanggal (ditumpuk per shift)':AX.trend==='shift'?'shift':'jam (rata-rata per hari produksi)'),'ax_trend',260,trendBtn)}${axPanel('Production by Fleet (contribution)','Production '+S,'ax_fleet',260)}</div>
    <div class="ov-sec">Fleet Contribution <span>${uL}</span></div>
    ${axTbl([['Fleet'],['Actual',1],['Plan',1],['Ach',1],['Gap',1],['Contribution',1]],fleets.map(r=>`<tr><td><b>${esc(r.f)}</b></td><td class="r">${axNum(r.a)}</td><td class="r">${r.p?axNum(r.p):'—'}</td><td class="r">${axPct(r.ach)}</td><td class="r">${r.p?ovSigned(r.g):'—'}</td><td class="r">${U.fmt(r.c,1)}%</td></tr>`))}
    <div class="ov-sec" style="margin-top:12px">Shift Comparison <span>${filters.shift==='all'?'site-level, semua shift':'filter Shift aktif — kosongkan untuk membandingkan'} • Fuel per shift = total liter</span></div>${shTbl}`,true)}`;
  const post=()=>{
    makeChart('ax_cum',{type:'line',data:{labels:dates.map(d=>U.dateShort(new Date(d+'T00:00:00'))),datasets:[
      {label:'Cumulative Actual',data:cumA,borderColor:PALETTE[0],backgroundColor:'rgba(245,165,36,.12)',fill:true,tension:.2,pointRadius:0,spanGaps:false},
      {label:'Cumulative Plan',data:cumP,borderColor:PALETTE[2],borderDash:[5,4],pointRadius:0}]},
      options:axOpts({title:i=>dates[i[0].dataIndex], footer:i=>{ const k=i[0].dataIndex; return cumA[k]==null?'':'Gap: '+ovSigned(cumA[k]-cumP[k])+' '+uL; }, label:c=>` ${c.dataset.label}: ${c.parsed.y==null?'—':U.fmt(c.parsed.y,0)} ${uL}`})});
    makeChart('ax_var',{type:'bar',data:{labels:dates.map(d=>U.dateShort(new Date(d+'T00:00:00'))),datasets:[{label:'Variance',data:dayV,backgroundColor:dayV.map(v=>v==null?'transparent':v<0?'#F04747':'#10B981')}]},
      options:axOpts({title:i=>dates[i[0].dataIndex],label:c=>` Variance: ${ovSigned(c.parsed.y)} ${uL}`},o=>{o.plugins.legend.display=false;})});
    let cfg;
    if(AX.trend==='date'){ cfg={type:'bar',data:{labels:dates.map(d=>U.dateShort(new Date(d+'T00:00:00'))),datasets:shifts.map((sh,i)=>({label:sh,data:dates.map(d=>U.sum((byA.get(d)||[]).filter(r=>r.shift===sh),'productionVolume')),backgroundColor:PALETTE[i%PALETTE.length],stack:'s'}))},options:axOpts({title:i=>dates[i[0].dataIndex],label:c=>` ${c.dataset.label}: ${U.fmt(c.parsed.y,0)} ${uL}`},o=>{o.scales.x.stacked=true;o.scales.y.stacked=true;})}; }
    else if(AX.trend==='shift'){ cfg={type:'bar',data:{labels:shifts,datasets:[{label:'Actual',data:shifts.map(sh=>U.sum(act.filter(r=>r.shift===sh),'productionVolume')),backgroundColor:PALETTE[1]}]},options:axOpts({label:c=>` ${U.fmt(c.parsed.y,0)} ${uL}`},o=>{o.plugins.legend.display=false;})}; }
    else { const hs=U.groupBy(act.filter(r=>r.hour),r=>r.hour), hl=[...hs.keys()].sort(), nd=Math.max(1,new Set(act.filter(r=>r.productionVolume>0).map(r=>r.date)).size);
      cfg={type:'bar',data:{labels:hl,datasets:[{label:'Rata-rata per hari',data:hl.map(h=>U.sum(hs.get(h),'productionVolume')/nd),backgroundColor:PALETTE[1]}]},options:axOpts({title:i=>'Jam '+i[0].label,label:c=>` ${U.fmt(c.parsed.y,0)} ${uL}/hari`},o=>{o.plugins.legend.display=false;})}; }
    makeChart('ax_trend',cfg);
    makeChart('ax_fleet',{type:'bar',data:{labels:fleets.map(f=>f.f),datasets:[{label:'Actual',data:fleets.map(f=>f.a),backgroundColor:PALETTE[0]}]},options:axOpts({label:c=>` ${U.fmt(c.parsed.x,0)} ${uL} (${U.fmt(fleets[c.dataIndex].c,1)}%)`},o=>{o.indexAxis='y';o.plugins.legend.display=false;})});
  };
  return {top,post};
}

/* ============================ EQUIPMENT (Fleet + Unit + Reliability) ============================ */
function axEqBuild(data){
  const st=getFilteredUnitStatus(), dl=getFilteredDelay(), idl=getFilteredIdle(), plan=getFilteredPlan();
  const fleets=[...new Set([...st.map(s=>s.fleet),...data.map(r=>r.fleet)])].filter(Boolean).sort();
  const fRows=fleets.map(f=>{
    const R={rec:data.filter(r=>r.fleet===f),plan:plan.filter(r=>r.fleet===f),st:st.filter(r=>r.fleet===f),dl:dl.filter(r=>r.fleet===f),idl:idl.filter(r=>r.fleet===f)};
    const pu=computePAUA(R.st,R.dl,R.idl), M=axMetrics(R);
    const units=new Set([...R.st.map(s=>s.unit),...R.dl.map(d=>d.unit),...R.idl.filter(i=>i.scope==='UNIT').map(i=>i.unit)].filter(Boolean)).size;
    return {f,M,pu,units}; });
  const fTbl=axTbl([['Fleet'],['Production',1],['Units',1],['Operating',1],['Delay',1],['Idle',1],['BD',1],['PA',1],['UA',1]],
    fRows.map(({f,M,pu,units})=>`<tr class="ov-click" onclick="axPickFleet(${axQ(f)})" style="${AX.eqFleet===f?'background:var(--panel-3)':''}"><td><b>${esc(f)}</b></td><td class="r">${[M.ob?axNum(M.ob)+' BCM':'',M.co?axNum(M.co)+' Ton':''].filter(Boolean).join(' • ')||'—'}</td><td class="r">${units}</td><td class="r">${ovDur(pu.working)}</td><td class="r">${ovDur(M.delay)}</td><td class="r">${ovDur(M.idle)}</td><td class="r">${ovDur(M.bd)}</td><td class="r">${axPct(M.pa)}</td><td class="r">${axPct(M.ua)}</td></tr>`));
  // unit performance
  const F=AX.eqFleet, uf=AX.unitFocus;
  const unitIds=new Set([...st.map(s=>s.unit),...dl.map(d=>d.unit),...idl.filter(i=>i.scope==='UNIT').map(i=>i.unit)].filter(Boolean));
  const gS=U.groupBy(st,s=>s.unit), gD=U.groupBy(dl,d=>d.unit), gI=U.groupBy(idl.filter(i=>i.scope==='UNIT'),i=>i.unit);
  const uRows=[...unitIds].map(u=>{
    const s=gS.get(u)||[], d=gD.get(u)||[], i=gI.get(u)||[];
    const fleet=(s[0]&&s[0].fleet)||(d[0]&&d[0].fleet)||(i[0]&&i[0].fleet)||'-';
    const pu=computePAUA(s,d,i), bdRec=s.filter(x=>x.status==='Breakdown');
    const prod=U.groupBy(data.filter(r=>r.digger===u||r.hauler===u),r=>r.volumeUnit);
    return {u,fleet,pu,delay:U.sum(d,'hours'),idle:U.sum(i,'hours'),bd:pu.breakdown,ev:d.length+i.length+bdRec.length,bdN:bdRec.length,
      prod:[...prod.entries()].map(([k,a])=>axNum(U.sum(a,'productionVolume'))+' '+k).join(' + ')||'—'}; })
    .filter(r=> uf? r.u===uf : (F==='all'||r.fleet===F))
    .sort((a,b)=>(b.bd+b.delay+b.idle)-(a.bd+a.delay+a.idle));
  const shown=uf||F!=='all'?uRows:uRows.slice(0,25);
  const uTbl=axTbl([['Unit'],['Fleet'],['Operating',1],['Delay',1],['Idle',1],['BD',1],['PA',1],['UA',1],['Production',1],['Event',1],['']],
    shown.map(r=>`<tr><td><b>${esc(r.u)}</b></td><td>${esc(r.fleet)}</td><td class="r">${ovDur(r.pu.working)}</td><td class="r">${ovDur(r.delay)}</td><td class="r">${ovDur(r.idle)}</td><td class="r">${ovDur(r.bd)}</td><td class="r">${r.pu.scheduled?axPct(r.pu.pa):'—'}</td><td class="r">${r.pu.available?axPct(r.pu.ua):'—'}</td><td class="r">${esc(r.prod)}</td><td class="r">${r.ev}</td><td><button class="ov-link" onclick="axUnitInExc(${axQ(r.u)})">History ›</button></td></tr>`));
  // event history (unit fokus) — memakai dataset event Tahap 2
  let hist='';
  if(uf){ const C=exCompute(), ev=C.events.filter(e=>e.unit===uf).slice(0,40);
    hist=`<div class="ov-sec" style="margin-top:12px">Event History — ${esc(uf)} <span>klik baris untuk detail di Exception Center</span></div>`+axTbl([['Tanggal'],['Shift'],['Jenis'],['Alasan'],['Durasi',1]],ev.map(e=>`<tr class="ov-click" onclick="axOpenEvent(${e.i})"><td>${esc(e.date)}</td><td>${esc(e.shift)}</td><td>${esc(e.t)}</td><td>${esc(e.reason)}</td><td class="r">${ovDur(e.h)}</td></tr>`)); }
  // reliability: repeat = unit + kategori sama, ≥2 tanggal berbeda
  const bd=st.filter(s=>s.status==='Breakdown'&&(F==='all'||s.fleet===F)&&(!uf||s.unit===uf)), gR=U.groupBy(bd,s=>s.unit+'|'+(s.category||'(tanpa kategori)'));
  const rep=[...gR.entries()].map(([k,a])=>({u:k.split('|')[0],c:k.split('|').slice(1).join('|'),days:new Set(a.map(x=>x.date)).size,h:U.sum(a,'durationHours')})).filter(r=>r.days>=2).sort((a,b)=>b.days-a.days||b.h-a.h).slice(0,15);
  const top=`${axScopeBar('Equipment — Fleet / Unit'+(filters.pit!=='all'?' (Pit tidak berlaku)':''),'breakdown')}
  <div class="ov-sec">Equipment Performance &amp; Reliability</div>
  ${axCompare([['PA','pa',1,'',true],['UA','ua',1,'',true],['Breakdown','bd',1,'jam'],['Delay','delay',1,'jam'],['Idle','idle',1,'jam']])}
  <div class="ov-sec">Fleet Comparison <span>klik fleet untuk memfilter tabel unit • PA/UA existing (computePAUA)</span></div>${fTbl}
  <div class="ov-sec" style="margin-top:12px">Unit Performance <span>${uf?'fokus unit '+esc(uf):F!=='all'?'Fleet '+esc(F):'25 unit dengan waktu hilang terbesar'}</span>${uf?` <button class="ov-link" onclick="axClearFocus()">✕ Hapus fokus</button>`:''}</div>${uTbl}
  <div class="ax-note">Production per unit = volume yang tercatat atas unit itu sebagai digger/hauler; digger dan hauler mengangkut volume yang sama, jangan dijumlahkan antar unit. Event = Delay + Idle + record Breakdown.</div>${hist}
  ${axFold('Reliability — Repeat Breakdown',`${axTbl([['Unit'],['Kategori'],['Tanggal berbeda',1],['Total BD',1]],rep.map(r=>`<tr class="ov-click" onclick="axUnitInExc(${axQ(r.u)})"><td><b>${esc(r.u)}</b></td><td>${esc(r.c)}</td><td class="r">${r.days}</td><td class="r">${ovDur(r.h)}</td></tr>`),bd.length?'Tidak ada repeat event (unit + kategori sama pada ≥2 tanggal).':axMsg())}
    <div class="ax-lim"><b>MTTR / MTBF tidak ditampilkan.</b> Breakdown tersimpan sebagai jam per unit-shift-kategori tanpa waktu mulai/selesai perbaikan dan tanpa timeline kontinu, sehingga definisi MTTR/MTBF yang valid tidak dapat dihitung dari data existing.</div>`,false)}`;
  return {top};
}

/* ============================ PA / UA ============================ */
function axPaBuild(data){
  const st=getFilteredUnitStatus(), dl=getFilteredDelay(), idl=getFilteredIdle(), b=axBucket(), by=AX.paBy;
  const sKey=r=> by==='fleet'?r.fleet:by==='shift'?r.shift:'Site';
  const series=[...new Set([...st,...dl,...idl.filter(i=>i.scope==='UNIT')].map(sKey).filter(Boolean))].sort();
  const g=(rows)=>U.groupBy(rows,r=>sKey(r)+'||'+b.keyOf(r.date));
  const gs=g(st), gd=g(dl), gi=g(idl.filter(i=>i.scope==='UNIT'));
  const calc=(s,l)=>computePAUA(gs.get(s+'||'+l)||[],gd.get(s+'||'+l)||[],gi.get(s+'||'+l)||[]);
  const PAs=series.map(s=>b.labels.map(l=>{ const r=calc(s,l); return r.scheduled?r.pa:null; }));
  const UAs=series.map(s=>b.labels.map(l=>{ const r=calc(s,l); return r.available?r.ua:null; }));
  const gU=U.groupBy(st,s=>s.unit), gUd=U.groupBy(dl,d=>d.unit), gUi=U.groupBy(idl.filter(i=>i.scope==='UNIT'),i=>i.unit);
  const pts=[...new Set([...gU.keys(),...gUd.keys(),...gUi.keys()])].map(u=>{ const r=computePAUA(gU.get(u)||[],gUd.get(u)||[],gUi.get(u)||[]); return r.scheduled&&r.available?{x:r.pa,y:r.ua,u}:null; }).filter(Boolean);
  const grpTbl=(keyFn,label)=>{ const keys=[...new Set([...st,...dl].map(keyFn).filter(Boolean))].sort(); return keys.map(k=>{ const r=computePAUA(st.filter(x=>keyFn(x)===k),dl.filter(x=>keyFn(x)===k),idl.filter(x=>keyFn(x)===k)); return `<tr><td>${label}</td><td><b>${esc(k)}</b></td><td class="r">${r.scheduled?axPct(r.pa):'—'}</td><td class="r">${r.available?axPct(r.ua):'—'}</td></tr>`; }); };
  const top=`${axScopeBar('PA / UA — Site Level (Pit tidak berlaku)','breakdown')}
  <div class="ov-sec">PA / UA Analytics <span>rumus existing computePAUA — tidak diubah</span></div>
  ${axCompare([['PA','pa',1,'',true],['UA','ua',1,'',true],['Breakdown','bd',1,'jam'],['Delay','delay',1,'jam'],['Idle','idle',1,'jam']])}
  <div class="flex items-center justify-between mb-2"><span class="ov-note">Trend per ${b.big?'bulan':'tanggal'}</span>${axSeg(by,[['site','Site'],['fleet','Fleet'],['shift','Shift']],'axSetPaBy')}</div>
  <div class="ax-g2">${axPanel('PA Trend','PA — '+(by==='site'?'Site Level':'per '+by),'ax_pa',260)}${axPanel('UA Trend','UA — '+(by==='site'?'Site Level':'per '+by),'ax_ua',260)}</div>
  ${axFold('Tier B — PA vs UA (Availability → Utilization)',`${axPanel('PA vs UA per Unit','Setiap titik = 1 unit, periode filter','ax_pauau',300)}<div class="ax-note">Titik di kanan-bawah: unit relatif tersedia (PA tinggi) tetapi utilisasinya (UA) rendah. Ini hanya posisi data, bukan kesimpulan otomatis.</div>
    ${axTbl([['Dimensi'],['Nilai'],['PA',1],['UA',1]],[...grpTbl(r=>r.fleet,'Fleet'),...grpTbl(r=>r.shift,'Shift')])}`,true)}`;
  const post=()=>{
    const mk=(id,arr,lbl)=>makeChart(id,{type:'line',data:{labels:b.labels.map(l=>b.big?l:U.dateShort(new Date(l+'T00:00:00'))),datasets:series.map((s,i)=>({label:s,data:arr[i],borderColor:PALETTE[i%PALETTE.length],pointRadius:2,tension:.2,spanGaps:false}))},options:axOpts({title:i=>b.labels[i[0].dataIndex],label:c=>` ${c.dataset.label}: ${c.parsed.y==null?'—':U.fmt(c.parsed.y,1)}%`},o=>{o.scales.y.title={display:true,text:lbl+' %',color:themeColors().text};})});
    mk('ax_pa',PAs,'PA'); mk('ax_ua',UAs,'UA');
    makeChart('ax_pauau',{type:'scatter',data:{datasets:[{label:'Unit',data:pts,backgroundColor:PALETTE[1],pointRadius:4}]},options:axOpts({label:c=>` ${c.raw.u}: PA ${U.fmt(c.raw.x,1)}% • UA ${U.fmt(c.raw.y,1)}%`},o=>{o.plugins.legend.display=false;o.scales.x.title={display:true,text:'PA %',color:themeColors().text};o.scales.y.title={display:true,text:'UA %',color:themeColors().text};o.interaction={mode:'nearest',intersect:true};})});
  };
  return {top,post};
}

/* ============================ DELAY / IDLE (analytical dataset + Pareto) ============================ */
function axEventBuild(cfg){
  const rows=cfg.rows, total=U.sum(rows,'hours'), b=axBucket();
  const gR=[...U.groupBy(rows,r=>r.name||r.code||'-').entries()].map(([k,a])=>({k,h:U.sum(a,'hours'),n:a.length})).sort((x,y)=>y.h-x.h);
  const top12=gR.slice(0,12); let cum=0; const cumP=top12.map(r=>{ cum+=r.h; return total?cum/total*100:0; });
  const tv=axTrendVals(rows,r=>r.hours), cnt=new Map(); rows.forEach(r=>{ const k=b.keyOf(r.date); cnt.set(k,(cnt.get(k)||0)+1); });
  const shG=[...U.groupBy(rows,r=>r.shift).entries()].map(([k,a])=>({k,h:U.sum(a,'hours'),n:a.length})).sort((x,y)=>x.k>y.k?1:-1);
  const uG=[...U.groupBy(rows.filter(r=>r.unit),r=>r.unit).entries()].map(([k,a])=>({k,h:U.sum(a,'hours'),n:a.length})).sort((x,y)=>y.h-x.h).slice(0,10);
  const list=[...rows].sort((x,y)=>x.date<y.date?1:x.date>y.date?-1:y.hours-x.hours).slice(0,25);
  const body = rows.length ? `
  <div class="ov-sec">Tier A — Decision</div>
  <div class="ax-g2">${axPanel(cfg.T+' Duration Trend',cfg.T+' — site/fleet sesuai filter','ax_ev_trend',260)}${axPanel(cfg.reason+' — Pareto','jam tercatat, top '+top12.length,'ax_ev_par',260)}</div>
  ${axFold('Tier B — Distribution',`<div class="ax-g2">${axPanel(cfg.T+' per Shift','per shift','ax_ev_shift',220)}${axPanel(cfg.T+' per Unit (Top 10)','per unit','ax_ev_unit',220)}</div>`,true)}
  ${axFold('Tier C — Event List',`<div class="ax-note">Durasi per record (jam mulai/selesai tidak tersimpan). Klik baris untuk melihat unit di Exception Center.</div>`+axTbl([['Tanggal'],['Shift'],['Unit'],['Fleet'],[cfg.reason],['Durasi',1]],list.map(r=>`<tr class="${r.unit?'ov-click':''}" ${r.unit?`onclick="axUnitInExc(${axQ(r.unit)})"`:''}><td>${esc(r.date)}</td><td>${esc(r.shift)}</td><td>${esc(r.unit||'Site')}</td><td>${esc(r.fleet||'-')}</td><td>${esc(r.name||r.code||'-')}</td><td class="r">${ovDur(r.hours)}</td></tr>`)),false)}`
    : `<div class="ax-lim">${axMsg()}</div>`;
  const top=`${axScopeBar(cfg.scope,cfg.exc)}<div class="ov-sec">${cfg.T} Analytics <span>${cfg.note}</span></div>
  ${axCompare([[cfg.T,cfg.key,1,'jam'],['PA','pa',1,'',true],['UA','ua',1,'',true]])}${body}${cfg.extra||''}`;
  const post=()=>{
    if(!rows.length) return;
    makeChart('ax_ev_trend',{type:'line',data:{labels:tv.labels.map(l=>tv.big?l:U.dateShort(new Date(l+'T00:00:00'))),datasets:[{label:cfg.T+' (jam)',data:tv.vals,borderColor:PALETTE[0],backgroundColor:'rgba(245,165,36,.12)',fill:true,tension:.2,pointRadius:2}]},options:axOpts({title:i=>tv.labels[i[0].dataIndex],footer:i=>(cnt.get(tv.labels[i[0].dataIndex])||0)+' event'},o=>{o.plugins.legend.display=false;})});
    makeChart('ax_ev_par',{type:'bar',data:{labels:top12.map(r=>r.k),datasets:[{type:'bar',label:'Jam',data:top12.map(r=>r.h),backgroundColor:PALETTE[3],yAxisID:'y'},{type:'line',label:'Kumulatif %',data:cumP,borderColor:PALETTE[6],pointRadius:2,yAxisID:'y1'}]},
      options:axOpts({label:c=>c.dataset.yAxisID==='y1'?` Kumulatif: ${U.fmt(c.parsed.y,1)}%`:` ${U.fmt(c.parsed.y,1)} jam (${top12[c.dataIndex].n} event)`},o=>{o.scales.y1={position:'right',min:0,max:100,grid:{display:false},ticks:{color:themeColors().text,font:{size:10},callback:v=>v+'%'}};})});
    makeChart('ax_ev_shift',{type:'bar',data:{labels:shG.map(r=>r.k),datasets:[{label:'Jam',data:shG.map(r=>r.h),backgroundColor:PALETTE[1]}]},options:axOpts({footer:i=>shG[i[0].dataIndex].n+' event'},o=>{o.plugins.legend.display=false;})});
    makeChart('ax_ev_unit',{type:'bar',data:{labels:uG.map(r=>r.k),datasets:[{label:'Jam',data:uG.map(r=>r.h),backgroundColor:PALETTE[2]}]},options:axOpts({footer:i=>uG[i[0].dataIndex].n+' event'},o=>{o.indexAxis='y';o.plugins.legend.display=false;})});
  };
  return {top,post};
}
function axDelayBuild(){ const r=axEventBuild({T:'Delay',reason:'Recorded Delay Cause',rows:getFilteredDelay(),key:'delay',exc:'delay',scope:'Delay — sesuai filter (Pit tidak berlaku)',note:'Controlled Standby • bukan root-cause'});
  const p=r.post; r.post=()=>{ p(); const c=document.getElementById('dl_pie'); if(c){ if(chartInstances.dl_pie){try{chartInstances.dl_pie.destroy();}catch(e){} chartInstances.dl_pie=null;} const box=c.closest('.glass'); if(box) box.remove(); } }; return r; }
function axIdleBuild(){
  const idl=getFilteredIdle(), unitRows=idl.filter(i=>i.scope==='UNIT'), wx=idl.filter(i=>i.scope==='GLOBAL');
  // Weather / Rain: operational events during rain (tanggal+shift yang sama) — BUKAN model loss
  const rain=new Set(wx.map(w=>w.date+'|'+w.shift)), data=getFiltered(), st=getFilteredUnitStatus(), dl=getFilteredDelay();
  const keys=new Set([...data.map(r=>r.date+'|'+r.shift),...st.map(s=>s.date+'|'+s.shift)]);
  const rainK=[...keys].filter(k=>rain.has(k)), dryK=[...keys].filter(k=>!rain.has(k)), inSet=(S)=>(r=>S.has(r.date+'|'+r.shift));
  const avg=(k,rows,f,key)=> k.length? U.sum(rows.filter(r=>k.includes?true:true).filter(f),key)/k.length : null;
  const mk=(K)=>{ const S=new Set(K), n=K.length; if(!n) return null; const f=inSet(S);
    return {n,ob:U.sum(data.filter(f).filter(r=>r.stream==='OB_PRODUCTION'),'productionVolume')/n,co:U.sum(data.filter(f).filter(r=>r.stream==='CO_PRODUCTION'),'productionVolume')/n,
      delay:U.sum(dl.filter(f),'hours')/n,idle:U.sum(unitRows.filter(f),'hours')/n}; };
  const R1=mk(rainK), R0=mk(dryK);
  const wxByName=[...U.groupBy(wx,w=>w.name).entries()].map(([k,a])=>({k,n:a.length,h:U.sum(a,'hours')})).sort((x,y)=>y.h-x.h);
  const wxBlock = wx.length ? `<div class="ov-sec" style="margin-top:12px">Weather / Rain — Operational Events <span>Site Level • tanggal+shift yang sama</span></div>
    ${axTbl([['Cuaca'],['Event',1],['Durasi',1]],wxByName.map(r=>`<tr><td>${esc(r.k)}</td><td class="r">${r.n}</td><td class="r">${ovDur(r.h)}</td></tr>`))}
    ${R1&&R0?axTbl([['Kondisi (per shift)'],['Shift',1],['Recorded OB (BCM/shift)',1],['Recorded CO (Ton/shift)',1],['Delay/shift',1],['Idle unit/shift',1]],
      [['Shift dengan event cuaca',R1],['Shift tanpa event cuaca',R0]].map(([l,M])=>`<tr><td>${l}</td><td class="r">${M.n}</td><td class="r">${axNum(M.ob)}</td><td class="r">${axNum(M.co)}</td><td class="r">${ovDur(M.delay)}</td><td class="r">${ovDur(M.idle)}</td></tr>`))
      :'<div class="ov-note">Insufficient data — perlu shift dengan dan tanpa event cuaca pada filter ini untuk perbandingan.</div>'}
    <div class="ax-lim"><b>Bukan estimasi kehilangan produksi.</b> Angka di atas hanya "recorded production" dan event operasional pada shift yang sama dengan event cuaca; tidak ada model valid untuk menghitung BCM loss akibat hujan, dan event cuaca tidak menyimpan jam sehingga perbandingan sebelum/sesudah hujan tidak dapat dibuat.</div>`
    : `<div class="ov-sec" style="margin-top:12px">Weather / Rain</div><div class="ax-lim">No recorded event cuaca pada filter ini.</div>`;
  const r=axEventBuild({T:'Idle',reason:'Idle Reason',rows:unitRows,key:'idle',exc:'idle',scope:'Idle Unit — sesuai filter (Pit tidak berlaku); Weather = Site Level',note:'Uncontrolled Standby • unit',extra:wxBlock});
  const p=r.post; r.post=()=>{ p(); const c=document.getElementById('id_pie'); if(c){ if(chartInstances.id_pie){try{chartInstances.id_pie.destroy();}catch(e){} chartInstances.id_pie=null;} const box=c.closest('.glass'); if(box) box.remove(); } }; return r;
}

/* ============================ BREAKDOWN ============================ */
function axBdBuild(){
  const bd=getFilteredUnitStatus().filter(s=>s.status==='Breakdown'), tot=U.sum(bd,'durationHours');
  const rows=bd.map(s=>({date:s.date,shift:s.shift,unit:s.unit,fleet:s.fleet,name:s.category||'(tanpa kategori)',hours:s.durationHours}));
  const gr=[...U.groupBy(rows,r=>r.name).entries()].map(([k,a])=>({k,h:U.sum(a,'hours'),n:a.length})).sort((x,y)=>y.h-x.h).slice(0,12);
  const tv=axTrendVals(rows,r=>r.hours), uc=[...U.groupBy(rows,r=>r.unit).entries()].map(([u,a])=>({u,h:U.sum(a,'hours'),d:new Set(a.map(x=>x.date)).size})).sort((x,y)=>y.h-x.h);
  const list=[...rows].sort((x,y)=>x.date<y.date?1:x.date>y.date?-1:y.hours-x.hours).slice(0,25);
  const gR=U.groupBy(rows,r=>r.unit+'|'+r.name), rep=[...gR.entries()].map(([k,a])=>({u:k.split('|')[0],c:k.split('|').slice(1).join('|'),days:new Set(a.map(x=>x.date)).size,h:U.sum(a,'hours')})).filter(r=>r.days>=2).sort((a,b)=>b.days-a.days||b.h-a.h).slice(0,10);
  const body=rows.length?`<div class="ov-sec">Tier A — Downtime</div>
  <div class="ax-g2">${axPanel('Breakdown Downtime Trend','Breakdown — sesuai filter','ax_bd_trend',260)}${axPanel('Breakdown by Reason (kategori tercatat)','jam tercatat','ax_bd_reason',260)}</div>
  ${axFold('Tier B — Affected Units &amp; Repeat',`${axTbl([['Unit'],['Tanggal dengan BD',1],['Total BD',1]],uc.slice(0,15).map(r=>`<tr class="ov-click" onclick="axUnitAnalytics(${axQ(r.u)})"><td><b>${esc(r.u)}</b></td><td class="r">${r.d}</td><td class="r">${ovDur(r.h)}</td></tr>`))}
    <div class="ov-sec" style="margin-top:12px">Repeat Event <span>unit + kategori sama pada ≥2 tanggal</span></div>${axTbl([['Unit'],['Kategori'],['Tanggal',1],['Total BD',1]],rep.map(r=>`<tr class="ov-click" onclick="axUnitInExc(${axQ(r.u)})"><td><b>${esc(r.u)}</b></td><td>${esc(r.c)}</td><td class="r">${r.days}</td><td class="r">${ovDur(r.h)}</td></tr>`),'Tidak ada repeat event pada filter ini.')}`,true)}
  ${axFold('Tier C — Breakdown Event List',axTbl([['Tanggal'],['Shift'],['Unit'],['Fleet'],['Kategori'],['Durasi',1]],list.map(r=>`<tr class="ov-click" onclick="axUnitInExc(${axQ(r.unit)})"><td>${esc(r.date)}</td><td>${esc(r.shift)}</td><td><b>${esc(r.unit)}</b></td><td>${esc(r.fleet)}</td><td>${esc(r.name)}</td><td class="r">${ovDur(r.hours)}</td></tr>`)),false)}`
  :`<div class="ax-lim">${axMsg()}</div>`;
  const top=`${axScopeBar('Breakdown — sesuai filter (Pit tidak berlaku)','breakdown')}<div class="ov-sec">Breakdown Analytics <span>total ${ovDur(tot)} • ${new Set(rows.map(r=>r.unit)).size} unit</span></div>
  ${axCompare([['Breakdown','bd',1,'jam'],['PA','pa',1,'',true],['UA','ua',1,'',true]])}${body}
  <div class="ax-lim"><b>MTTR/MTBF tidak ditampilkan.</b> Data hanya menyimpan jam per unit-shift-kategori, tanpa waktu mulai/selesai perbaikan. KPI lama "MTTR" di bawah diganti nama menjadi rata-rata jam BD per record agar tidak menyesatkan.</div>`;
  const post=()=>{
    document.querySelectorAll('.kpi-label').forEach(el=>{ if(/MTTR/.test(el.textContent)) el.textContent='Rata-rata jam BD / record'; else if(/Kejadian Breakdown/.test(el.textContent)) el.textContent='Record Breakdown (unit-shift)'; });
    if(!rows.length) return;
    makeChart('ax_bd_trend',{type:'line',data:{labels:tv.labels.map(l=>tv.big?l:U.dateShort(new Date(l+'T00:00:00'))),datasets:[{label:'Downtime (jam)',data:tv.vals,borderColor:PALETTE[6],backgroundColor:'rgba(240,71,71,.10)',fill:true,tension:.2,pointRadius:2}]},options:axOpts({title:i=>tv.labels[i[0].dataIndex]},o=>{o.plugins.legend.display=false;})});
    makeChart('ax_bd_reason',{type:'bar',data:{labels:gr.map(r=>r.k),datasets:[{label:'Jam',data:gr.map(r=>r.h),backgroundColor:PALETTE[3]}]},options:axOpts({footer:i=>gr[i[0].dataIndex].n+' record'},o=>{o.indexAxis='y';o.plugins.legend.display=false;o.scales=o.scales||{};o.scales.y=o.scales.y||{};o.scales.y.ticks=Object.assign({},o.scales.y.ticks,{callback:function(v){const l=String(this.getLabelForValue(v)); return l.length>28?l.slice(0,27)+'\u2026':l;}});})});
  };
  return {top,post};
}

/* ============================ FUEL ============================ */
function axFuelBuild(data){
  const fuel=getFilteredFuel(), b=axBucket(), gF=U.groupBy(fuel,f=>b.keyOf(f.date)), gP=U.groupBy(data,r=>b.keyOf(r.date));
  const ratios=b.labels.map(l=>computeFuelRatios(gF.get(l)||[],gP.get(l)||[]));
  const ob=ratios.map(r=>r.ob.vol?r.ob.ratio:null), co=ratios.map(r=>r.coal.vol?r.coal.ratio:null), hasCO=co.some(v=>v!=null), hasOB=ob.some(v=>v!=null);
  const fleets=[...new Set(fuel.map(f=>f.fleet).filter(Boolean))].sort();
  const fRows=fleets.map(f=>{ const fr=computeFuelRatios(fuel.filter(x=>x.fleet===f),data.filter(r=>r.fleet===f)); return {f,l:U.sum(fuel.filter(x=>x.fleet===f),'fuelLiters'),ob:fr.ob.vol?fr.ob.ratio:null,co:fr.coal.vol?fr.coal.ratio:null,vo:fr.ob.vol,vc:fr.coal.vol}; });
  const top=`${axScopeBar('Fuel Ratio — Digger &amp; Hauler dengan pasangan produksi (Pit tidak berlaku)')}
  <div class="ov-sec">Fuel Efficiency <span>logic existing computeFuelRatios: OB = L/BCM, Coal = L/MT</span></div>
  ${axCompare([['Fuel Ratio OB','fuelOB',4,'L/BCM'],['Fuel Ratio Coal','fuelCO',4,'L/MT'],['Total Fuel','fuel',0,'L']])}
  <div class="ax-g2">${hasOB?axPanel('Fuel Ratio Trend — OB (L/BCM)','Fuel Ratio — '+(filters.fleet==='all'?'semua fleet':filters.fleet),'ax_fu_ob',250):`<div class="ax-lim">Fuel Ratio OB: Insufficient data (tidak ada denominator produksi BCM yang cocok).</div>`}${hasCO?axPanel('Fuel Ratio Trend — Coal (L/MT)','Fuel Ratio — '+(filters.fleet==='all'?'semua fleet':filters.fleet),'ax_fu_co',250):`<div class="ax-lim">Fuel Ratio Coal: Insufficient data (tidak ada denominator produksi MT yang cocok).</div>`}</div>
  ${axFold('Tier B — Fuel by Fleet',axTbl([['Fleet'],['Fuel (L)',1],['L/BCM',1],['L/MT',1]],fRows.map(r=>`<tr><td><b>${esc(r.f)}</b></td><td class="r">${axNum(r.l)}</td><td class="r">${r.ob==null?'—':U.fmt(r.ob,4)}</td><td class="r">${r.co==null?'—':U.fmt(r.co,4)}</td></tr>`))+`<div class="ax-note">Fuel ratio dihitung per unit-hari (Day+Night digabung, sesuai logic existing) sehingga tidak dapat dipisah per shift. Total Fuel mencakup semua unit termasuk support; ratio hanya untuk unit yang punya pasangan produksi.</div>`,true)}`;
  const post=()=>{ const mk=(id,arr,lbl,c)=>makeChart(id,{type:'line',data:{labels:b.labels.map(l=>b.big?l:U.dateShort(new Date(l+'T00:00:00'))),datasets:[{label:lbl,data:arr,borderColor:c,tension:.2,pointRadius:2,spanGaps:false}]},options:axOpts({title:i=>b.labels[i[0].dataIndex],label:c=>` ${lbl}: ${c.parsed.y==null?'—':U.fmt(c.parsed.y,4)}`},o=>{o.plugins.legend.display=false;})}); if(hasOB) mk('ax_fu_ob',ob,'L/BCM',PALETTE[0]); if(hasCO) mk('ax_fu_co',co,'L/MT',PALETTE[5]); };
  return {top,post};
}
