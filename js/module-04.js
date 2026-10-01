/* ============================ OPERATOR ============================ */
function axOpBuild(data){
  const m=new Map(), add=(name,role,unit,r)=>{ if(!name) return; const k=role+'|'+name; if(!m.has(k)) m.set(k,{name,role,units:new Set(),shifts:new Set(),hours:new Set(),rit:0,vol:{}}); const o=m.get(k);
    if(unit) o.units.add(unit); o.shifts.add(r.date+'|'+r.shift); o.hours.add(r.date+'|'+r.shift+'|'+r.hour); o.rit+=r.ritase; o.vol[r.volumeUnit]=(o.vol[r.volumeUnit]||0)+r.productionVolume; };
  data.forEach(r=>{ add(r.operator,'Operator',r.digger,r); add(r.driver,'Driver',r.hauler,r); });
  const rows=[...m.values()].sort((a,b)=>a.name.localeCompare(b.name));
  const top=`${axScopeBar('Operator — dari catatan produksi (filter Pit berlaku)')}<div class="ov-sec">Operator Activity <span>konteks operasional • urut abjad, bukan ranking</span></div>
  ${axFold('Aktivitas per Operator / Driver',axTbl([['Nama'],['Peran'],['Unit'],['Shift',1],['Jam produksi tercatat',1],['Ritase',1],['Production',1]],rows.slice(0,80).map(o=>`<tr><td><b>${esc(o.name)}</b></td><td>${o.role}</td><td>${esc([...o.units].slice(0,3).join(', '))}${o.units.size>3?' +'+(o.units.size-3):''}</td><td class="r">${o.shifts.size}</td><td class="r">${o.hours.size}</td><td class="r">${axNum(o.rit)}</td><td class="r">${Object.entries(o.vol).filter(([k,v])=>v).map(([k,v])=>axNum(v)+' '+k).join(' + ')||'—'}</td></tr>`))+(rows.length>80?`<div class="ax-note">Menampilkan 80 dari ${rows.length}; persempit dengan filter Tanggal/Shift/Fleet.</div>`:''),true)}
  <div class="ax-lim"><b>Delay dan Idle per operator tidak ditampilkan.</b> Delay/Idle tercatat per unit, bukan per operator; menempelkannya ke operator akan menyesatkan. "Production" driver = volume yang diangkut unit hauler-nya, bukan produksi pribadi. Tidak ada label best/worst operator.</div>`;
  return {top};
}

axWrap('production',axProdBuild); axWrap('equipment',axEqBuild); axWrap('pa_ua',axPaBuild); axWrap('delay',axDelayBuild);
axWrap('idle',axIdleBuild); axWrap('maintenance',axBdBuild); axWrap('fuel',axFuelBuild); axWrap('operator',axOpBuild);


/* ============================================================
   [PHASE 5.2–5.6] Exception Explanation, Trend & Anomaly, Daily/Shift Summary, Ask AI, Insight History.
   Semua angka berasal dari fungsi/data existing: exBuild(), computePAUA(), getFiltered*(), ai_buildPica(),
   RECORDS/UNIT_STATUS/DELAY_EVENTS/IDLE_EVENTS. Tidak ada tabel Supabase baru, tidak ada formula KPI baru.
   Ask AI = rule-based (tanpa LLM/API). History = localStorage (per-browser, BUKAN global).
   ============================================================ */
const P5_KEY='mineboard_insight_history_v1';
const P5_STATUS=['New','Acknowledged','Under Review','Action Taken','Verified','Dismissed'];
const P5_ASK={log:[]};
function p5Today(){ return new Date().toISOString().slice(0,10); }
function p5Scope(){ const f=filters; return [f.month==='all'?'Semua bulan':'Bulan '+(Number(f.month)+1),(f.dayStart!=='all'||f.dayEnd!=='all')?'Tgl '+(f.dayStart==='all'?'1':f.dayStart)+'–'+(f.dayEnd==='all'?'akhir':f.dayEnd):null,'Shift: '+f.shift,'Pit: '+f.pit,'Fleet: '+f.fleet,f.unit!=='all'?'Unit: '+f.unit:null].filter(Boolean).join(' • '); }
function p5Top(rows,kf,hf,n){ const m=new Map(); rows.forEach(r=>{ const k=kf(r); if(k==null) return; m.set(k,(m.get(k)||0)+(hf(r)||0)); }); return [...m].sort((a,b)=>b[1]-a[1]).slice(0,n); }
function p5Ach(a,p){ return p>0 ? U.fmt(a/p*100,1)+'%' : 'Insufficient Data'; }
function p5Head(t,sub){ return `<div class="glass p-4 mb-3"><div class="panel-title">${t}</div><div class="text-[11.5px]" style="color:var(--text-faint)">${esc(sub||'')} ${sub?'•':''} Filter aktif: ${esc(p5Scope())}</div></div>`; }
function p5Tbl(head,rows){ return `<div style="overflow-x:auto"><table class="w-full text-[12px]"><thead><tr>${head.map(h=>`<th style="text-align:left;padding:6px 8px;color:var(--text-dim)">${h}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr>${r.map(c=>`<td style="padding:6px 8px;border-top:1px solid var(--border,#2a2f3a)">${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`; }

/* ---- [PHASE 5 FIX — actual vs forecast] Klasifikasi baris actual/forecast untuk Summary & Ask AI ----
   Audit existing: MINEBOARD membedakan actual vs plan lewat TABEL (production_actual/unit_status_actual/
   fuel_actual = actual; plan_daily_generated (Mine Plan) = plan). Tidak ada kolom status/forecast khusus. Yang tersedia hanya
   field source: data_source (unit_status_actual/fuel_actual), assignment_source (production_actual),
   source (ot_events). delay_events/idle_events tidak memuat field source pada query existing.
   Aturan (urut prioritas):
   1) source berisi penanda non-actual (FORECAST/PROJECTION/SIMULATION/SCENARIO/PLAN/DUMMY/...) -> 'forecast'
   2) source berisi penanda actual (ACTUAL/CONFIRMED/HISTORICAL/RECONSTRUCTED/DAILY_INPUT/AUTO) -> 'actual'
      (mengikuti source, BERAPAPUN tanggalnya)
   3) TANPA source yang bisa dibaca -> fallback tanggal: <= hari ini 'actual'; > hari ini 'unverified'
      (tidak dihitung sebagai actual karena tidak ada bukti status). Data TIDAK dihapus/diubah di Supabase. */
const P5_NONACTUAL_RE=/FORECAST|PROJECT|SIMUL|SCENARIO|PREDICT|PLAN|BUDGET|DUMMY|SYNTH|PROYEKSI|PRAKIRAAN|SKENARIO|DRAFT/i;
const P5_ACTUAL_RE=/ACTUAL|CONFIRMED|HISTORICAL|RECONSTRUCTED|DAILY_INPUT|AUTO/i;
function p5Src(r){ return String((r&&(r.dataSource||r.source||r.assignmentSource))||'').trim(); }
function p5Cls(r,T){ const s=p5Src(r); if(s&&P5_NONACTUAL_RE.test(s)) return 'forecast'; if(s&&P5_ACTUAL_RE.test(s)) return 'actual'; return r.date<=T?'actual':'unverified'; }
/* Jalankan fn() dengan getFiltered*() sementara hanya mengembalikan baris actual (plan dibatasi s/d hari ini,
   jendela yang sama dengan actual). Sinkron + try/finally -> fungsi asli selalu dipulihkan. Semua formula
   existing (exBuild, computePAUA, ai_buildPica) dipakai apa adanya, tanpa duplikasi rumus. */
function p5WithActual(fn){
  const T=p5Today(), o={gf:getFiltered,gp:getFilteredPlan,gu:getFilteredUnitStatus,gd:getFilteredDelay,gi:getFilteredIdle}, act=a=>a.filter(r=>p5Cls(r,T)==='actual');
  try{
    window.getFiltered=()=>act(o.gf()); window.getFilteredPlan=()=>o.gp().filter(r=>r.date<=T);
    window.getFilteredUnitStatus=()=>act(o.gu()); window.getFilteredDelay=()=>act(o.gd()); window.getFilteredIdle=()=>act(o.gi());
    return fn();
  } finally { window.getFiltered=o.gf; window.getFilteredPlan=o.gp; window.getFilteredUnitStatus=o.gu; window.getFilteredDelay=o.gd; window.getFilteredIdle=o.gi; }
}
function p5KpiActual(){
  const T=p5Today(), R=exBuild(), cnt={forecast:0,unverified:0,futureActual:0};
  [R.data,R.pu2,R.dl2,R.idlUnit,R.wx].forEach(a=>a.forEach(r=>{ const c=p5Cls(r,T); if(c==='actual'){ if(r.date>T) cnt.futureActual++; } else cnt[c]++; }));
  const X=p5WithActual(()=>exBuild()), s=k=>U.sum(X.data.filter(r=>r.stream===k),'productionVolume'), p=k=>U.sum(X.plan.filter(r=>r.stream===k),'targetVolume');
  const pl=(k,fut)=>U.sum(R.plan.filter(r=>r.stream===k&&(fut?r.date>T:true)),'targetVolume');
  const pa=computePAUA(X.pu2,X.dl2,X.idlUnit.concat(X.wx));
  return {X,pa,T,ob:s('OB_PRODUCTION'),obP:p('OB_PRODUCTION'),co:s('CO_PRODUCTION'),coP:p('CO_PRODUCTION'),cnt,
    planFull:{ob:pl('OB_PRODUCTION'),co:pl('CO_PRODUCTION')}, planFut:{ob:pl('OB_PRODUCTION',1),co:pl('CO_PRODUCTION',1)},
    hasFuture:R.plan.some(r=>r.date>T)||cnt.forecast+cnt.unverified+cnt.futureActual>0};
}
function p5ClassNote(A){
  if(!A.hasFuture) return '';
  const c=A.cnt, ex=c.forecast+c.unverified;
  return `<div class="ov-note" style="color:var(--info);padding:6px 2px">ℹ Angka actual/historis hanya dari data berstatus actual (s/d ${A.T}). Data mendatang (plan/forecast/simulasi) tetap tersedia di database dan ditampilkan terpisah sebagai plan, tidak dicampur ke actual.`+
    (ex?` Tidak dihitung sebagai actual: ${ex} baris (forecast/simulasi per source: ${c.forecast}; setelah ${A.T} tanpa penanda actual: ${c.unverified}).`:'')+
    (c.futureActual?` ${c.futureActual} baris bertanggal setelah ${A.T} berstatus actual menurut source dan tetap dihitung actual.`:'')+`</div>`;
}
function p5PlanFutureLines(A){
  const f=A.planFut, F=A.planFull, L=[];
  if(f.ob>0||f.co>0) L.push(`Plan setelah ${A.T} pada filter ini: OB ${U.fmt(f.ob,0)} BCM • Coal ${U.fmt(f.co,0)} Ton (plan, bukan actual)`);
  if(F.ob>0||F.co>0) L.push(`Plan periode filter penuh: OB ${U.fmt(F.ob,0)} BCM • Coal ${U.fmt(F.co,0)} Ton`);
  return L;
}

/* ---- 5.6 History (localStorage) ---- */
function p5HLoad(){ try{ return JSON.parse(localStorage.getItem(P5_KEY)||'{}')||{}; }catch(e){ return {}; } }
function p5HSave(h){ try{ localStorage.setItem(P5_KEY,JSON.stringify(h)); }catch(e){} }
function p5Track(id,title){ const h=p5HLoad(), k=id+'|'+p5Scope(); if(!h[k]) h[k]={id,title,scope:p5Scope(),status:'New',note:'',created:new Date().toISOString(),updated:null}; p5HSave(h); renderPage(); }
function p5HSet(k,st){ const h=p5HLoad(); if(h[k]&&P5_STATUS.includes(st)){ h[k].status=st; h[k].updated=new Date().toISOString(); p5HSave(h);} renderPage(); }
function p5HNote(k,v){ const h=p5HLoad(); if(h[k]){ h[k].note=v; h[k].updated=new Date().toISOString(); p5HSave(h);} }
function p5HDel(k){ const h=p5HLoad(); delete h[k]; p5HSave(h); renderPage(); }
function render_ai_history(data,el){
  const h=p5HLoad(), ks=Object.keys(h).sort((a,b)=>(h[b].created||'').localeCompare(h[a].created||''));
  const rows=ks.map(k=>{ const e=h[k], q=esc(JSON.stringify(k));
    return [esc(e.title),esc(e.scope),`<select class="btn" onchange="p5HSet(${q},this.value)">${P5_STATUS.map(s=>`<option ${s===e.status?'selected':''}>${s}</option>`).join('')}</select>`,
      `<input class="btn" style="min-width:200px" value="${esc(e.note||'')}" placeholder="Catatan verifikasi manual" onchange="p5HNote(${q},this.value)">`,
      esc((e.created||'').slice(0,16).replace('T',' ')),`<button class="btn" onclick="p5HDel(${q})">Hapus</button>`]; });
  el.innerHTML = p5Head('Insight History & Verification','Status tindak lanjut insight')+
   `<div class="glass p-4 mb-3 text-[12px]" style="color:var(--warning)">History disimpan di LocalStorage browser ini saja (per-browser/per-perangkat) — TIDAK tersimpan global dan tidak dibagikan ke pengguna lain. Status "Verified" adalah pencatatan manual oleh pengguna, bukan hasil verifikasi otomatis.</div>`+
   `<div class="glass p-4">${rows.length?p5Tbl(['Insight','Filter saat dilacak','Status','Catatan','Dibuat',''],rows):'<div class="ov-note">Belum ada insight yang dilacak. Gunakan tombol "Track" pada Exception Explanation (halaman AI Insight).</div>'}</div>`;
}

/* ---- 5.2 Exception Explanation ---- */
/* [PHASE 5 FIX] VIEW EVIDENCE dari Exception Explanation: pakai state EX & navigate() existing (pola sama dgn
   ai_openGapEvidence/axUnitInExc). Filter global (filters) TIDAK diubah -> context sama; Exception Center
   memakai exCompute() actual-only, jadi angka sama dgn kartu. Sebelumnya exOpen() hanya re-render halaman aktif. */
function p5OpenEvidence(id){
  const m=exMode(id);
  EX.type='all'; EX.drawer=null; EX.path=[{k:'exc',v:id,l:exLabel(id)}];
  if(m.m==='unit'){ EX.path.push({k:'unit',v:m.u,l:m.u}); if(String(id).startsWith('bd:')) EX.drawer=m.u; }
  navigate('exceptions');
}
function p5Explain(it,X){
  let con=[];
  if(it.type==='gap') con=[['Breakdown',X.loss.Breakdown],['Delay',X.loss.Delay],['Idle',X.loss.Idle],['Weather',X.loss.Weather]].filter(c=>c[1]>0).sort((a,b)=>b[1]-a[1]).slice(0,4);
  else if(it.type==='delay') con=p5Top(X.dl2,e=>e.name,e=>e.hours,3);
  else if(it.type==='idle') con=p5Top(X.idlUnit,e=>e.name,e=>e.hours,3);
  else if(it.type==='weather') con=p5Top(X.wx,e=>e.name,e=>e.hours,3);
  else if(it.type==='breakdown') con=p5Top(X.pu2.filter(s=>s.status==='Breakdown'&&s.unit===it.title),s=>s.category||'-',s=>s.durationHours,3);
  const conf=ai_evidenceConfidence({direct:true,contributors:con.length,comparison:con.length>1});
  const ul=a=>'<ul style="margin:4px 0 0 16px">'+a.map(x=>`<li>${x}</li>`).join('')+'</ul>';
  const conH=con.length? ul(con.map(c=>`${esc(c[0])} — ${ovDur(c[1])}`))+`<p style="margin:4px 0 0;color:var(--text-faint)">Contributor = faktor yang tercatat pada filter ini; belum terbukti sebagai root cause.</p>` : '<p>Insufficient Data</p>';
  const q=esc(JSON.stringify(it.id)), t=esc(JSON.stringify(it.title));
  return `<div class="glass p-5 fade-in mb-3">
   <div class="flex items-center gap-2 flex-wrap mb-2"><span class="panel-title" style="font-size:13px">${esc(it.title)}</span><span class="tag">Severity: ${it.sev}</span>${ai_confidenceBadge(conf)}</div>
   ${ai_section('🎯','WHAT HAPPENED','var(--danger)',`<p>${esc(it.title)} — ${esc(it.unitFleet)} • ${esc(it.status)} • ${esc(it.time)}</p>`,true)}
   ${ai_section('📊','EVIDENCE','var(--info)',ul([esc(it.big),...it.lines.map(esc)]),true)}
   ${ai_section('🔍','LIKELY CONTRIBUTORS','var(--violet)',conH,true)}
   ${ai_section('⚠️','IMPACT','#EA580C',`<p>${esc(it.impactTxt)}</p>`,true)}
   ${ai_section('✅','ACTION','var(--success)',con.length?`<p>Review contributor terbesar: ${esc(con[0][0])} (${ovDur(con[0][1])}) bersama owner terkait.</p>`:'<p>Insufficient Data</p>',true)}
   ${ai_section('📌','VERIFICATION','var(--teal)','<p>Bandingkan angka yang sama pada periode berikutnya dengan filter yang sama. Status Verified dicatat manual di Insight History.</p>',true)}
   <button class="btn no-print" style="margin-top:8px" onclick="p5OpenEvidence(${q})">🔎 VIEW EVIDENCE</button>
   <button class="btn no-print" style="margin-top:8px" onclick="p5Track(${q},${t})">＋ Track</button></div>`;
}
function p5ExplSection(){
  const K=p5KpiActual(), items=K.X.items.filter(i=>i.type!=='dq').slice(0,5), pfl=p5PlanFutureLines(K);
  return `<div class="ov-sec" style="margin-top:16px">Exception Explanation <span style="color:var(--text-faint);font-size:11px">Actual s/d ${K.T} • Filter aktif: ${esc(p5Scope())}</span></div>`+p5ClassNote(K)+
    (items.length? items.map(i=>p5Explain(i,K.X)).join('') : '<div class="glass p-4 ov-note">Tidak ada exception actual pada filter ini.</div>')+
    (pfl.length?`<div class="glass p-4 ov-note mb-3"><b>PLAN / MENDATANG (bukan actual)</b><ul style="margin:4px 0 0 16px">${pfl.map(x=>`<li>${x}</li>`).join('')}</ul></div>`:'');
}

/* ---- 5.3 Trend & Anomaly ---- */
function p5Series(){
  const T=p5Today(), f=filters, ok=x=>x.date<=T&&(f.shift==='all'||x.shift===f.shift)&&(f.fleet==='all'||x.fleet===f.fleet);
  const by=new Map(), g=d=>{ if(!by.has(d)) by.set(d,{ob:0,co:0,st:[],dl:[],id:[]}); return by.get(d); };
  RECORDS.forEach(r=>{ if(!ok(r)||(f.pit!=='all'&&r.pit!==f.pit)) return; const o=g(r.date); if(r.stream==='OB_PRODUCTION') o.ob+=r.productionVolume||0; else if(r.stream==='CO_PRODUCTION') o.co+=r.productionVolume||0; });
  UNIT_STATUS.forEach(s=>{ if(ok(s)) g(s.date).st.push(s); });
  DELAY_EVENTS.forEach(s=>{ if(ok(s)) g(s.date).dl.push(s); });
  IDLE_EVENTS.forEach(s=>{ if(ok(s)) g(s.date).id.push(s); });
  const S={OB:[],CO:[],PA:[],UA:[],Delay:[]};
  [...by.keys()].sort().forEach(d=>{ const o=by.get(d);
    if(o.ob>0) S.OB.push({d,v:o.ob}); if(o.co>0) S.CO.push({d,v:o.co});
    if(o.st.length){ const p=computePAUA(o.st,o.dl,o.id); if(p.scheduled>0){ S.PA.push({d,v:p.pa}); if(p.available>0) S.UA.push({d,v:p.ua}); S.Delay.push({d,v:U.sum(o.dl,'hours')}); } } });
  return S;
}
function p5Analyze(a){
  const n=a.length; if(n<9) return {ok:false,n};
  const last=a[n-1], base=a.slice(Math.max(0,n-31),n-1).map(x=>x.v), m=base.reduce((s,x)=>s+x,0)/base.length, sd=Math.sqrt(base.reduce((s,x)=>s+(x-m)**2,0)/base.length), z=sd>0?(last.v-m)/sd:0;
  let dir=null; if(n>=14){ const av=x=>x.reduce((s,y)=>s+y.v,0)/x.length, r=av(a.slice(-7)), p=av(a.slice(-14,-7)); dir=r>p*1.02?'naik':r<p*0.98?'turun':'datar'; }
  return {ok:true,n,last,m,sd,z,anom:sd>0&&Math.abs(z)>=2,dir,nb:base.length};
}
function render_ai_trend(data,el){
  const S=p5Series(), M=[['Overburden (OB)','BCM','OB',0],['Coal (CO)','Ton','CO',0],['PA','%','PA',1],['UA','%','UA',1],['Delay','jam/hari','Delay',1]];
  const rows=M.map(([n,u,k,d])=>{ const r=p5Analyze(S[k]);
    if(!r.ok) return [n,u,r.n,'Insufficient Data (min. 8 hari baseline + 1 hari terbaru)','–','–','–','–'];
    const conf=r.nb>=20?'HIGH':'MODERATE', st=r.anom?`<b style="color:var(--warning)">Anomaly: ${r.z>0?'di atas':'di bawah'} baseline (z=${U.fmt(r.z,1)})</b>`:'Normal';
    return [n,u,r.n,r.last.d+' = '+U.fmt(r.last.v,d),U.fmt(r.m,d),st,r.dir||'Insufficient Data',ai_confidenceBadge(conf).replace('Evidence:','Data:')]; });
  el.innerHTML=p5Head('Trend & Anomaly Detection','Histori aktual s/d '+p5Today())+
   `<div class="glass p-4 mb-3 text-[12px]" style="color:var(--text-dim)">Metode: hari terbaru vs rata-rata ≤30 hari valid sebelumnya; anomaly hanya jika |z| ≥ 2. Hari valid = ada data metrik tsb. Minimum 8 hari baseline. Mengikuti filter shift, fleet, dan pit (pit hanya untuk produksi); filter tanggal/periode dan unit tidak membatasi histori. Data setelah ${p5Today()} dikecualikan. Anomaly menunjukkan penyimpangan statistik — bukan bukti sebab-akibat antar metrik.</div>`+
   `<div class="glass p-4">${p5Tbl(['Metrik','Satuan','Hari valid','Terbaru','Baseline (rata-rata)','Status','Arah 7 hari','Data sufficiency'],rows)}</div>`;
}

/* ---- 5.4 Daily / Shift Summary ---- */
function render_ai_summary(data,el){
  const K=p5KpiActual(), X=K.X, fl=[...new Set(X.data.map(r=>r.fleet).concat(X.pu2.map(s=>s.fleet)).filter(Boolean))].sort();
  const fRows=fl.map(f=>{ const d=X.data.filter(r=>r.fleet===f), p=computePAUA(X.pu2.filter(s=>s.fleet===f),X.dl2.filter(e=>e.fleet===f),X.idlUnit.filter(e=>e.fleet===f)); 
    return [f,U.fmt(U.sum(d.filter(r=>r.stream==='OB_PRODUCTION'),'productionVolume'),0),U.fmt(U.sum(d.filter(r=>r.stream==='CO_PRODUCTION'),'productionVolume'),0),p.scheduled>0?U.fmt(p.pa,1)+'%':'Insufficient Data',p.available>0?U.fmt(p.ua,1)+'%':'Insufficient Data']; });
  const dl=p5Top(X.dl2,e=>e.name,e=>e.hours,3), idl=p5Top(X.idlUnit,e=>e.name,e=>e.hours,3), bd=p5Top(X.pu2.filter(s=>s.status==='Breakdown'),s=>s.unit,s=>s.durationHours,3);
  const li=a=>a.length?'<ul style="margin:4px 0 0 16px">'+a.map(x=>`<li>${x}</li>`).join('')+'</ul>':'<p>Insufficient Data</p>';
  const B=p5WithActual(()=>ai_buildPica(getFiltered())), fu=B.pica.slice(0,3).map(p=>`${esc(p.title)} — owner: ${esc(p.actionOwner)}`);
  const empty=!X.data.length&&!X.pu2.length;
  const pfl=p5PlanFutureLines(K), planSec=pfl.length?ai_section('📅','PLAN / MENDATANG (bukan actual)','var(--info)',li(pfl),true):'';
  el.innerHTML=p5Head('Daily / Shift Summary','Ringkasan actual s/d '+K.T+' sesuai filter')+p5ClassNote(K)+(empty?'<div class="glass p-4 ov-note">Insufficient Data — tidak ada data actual pada filter aktif.</div>'+planSec:
   ai_section('📦','PRODUCTION','var(--info)',li([`OB actual: ${U.fmt(K.ob,0)} BCM vs plan s/d ${K.T} ${U.fmt(K.obP,0)} (${p5Ach(K.ob,K.obP)})`,`Coal actual: ${U.fmt(K.co,0)} Ton vs plan s/d ${K.T} ${U.fmt(K.coP,0)} (${p5Ach(K.co,K.coP)})`,`PA ${K.pa.scheduled>0?U.fmt(K.pa.pa,1)+'%':'Insufficient Data'} • UA ${K.pa.available>0?U.fmt(K.pa.ua,1)+'%':'Insufficient Data'}`]),true)+
   ai_section('🚛','FLEET','var(--teal)',fRows.length?p5Tbl(['Fleet','OB (BCM)','Coal (Ton)','PA','UA'],fRows):'<p>Insufficient Data</p>',true)+
   ai_section('📉','LOSSES','#EA580C',li([`Breakdown: ${ovDur(X.loss.Breakdown)}`,`Delay: ${ovDur(X.loss.Delay)}`,`Idle (unit): ${ovDur(X.loss.Idle)}`,`Weather: ${ovDur(X.loss.Weather)}`]),true)+
   ai_section('🔍','CONTRIBUTORS','var(--violet)',li([...dl.map(c=>`Delay: ${esc(c[0])} (${ovDur(c[1])})`),...idl.map(c=>`Idle: ${esc(c[0])} (${ovDur(c[1])})`),...bd.map(c=>`Breakdown unit: ${esc(c[0])} (${ovDur(c[1])})`)]),true)+
   ai_section('⚠️','ATTENTION','var(--danger)',li(X.items.slice(0,3).map(i=>`[${i.sev}] ${esc(i.title)} — ${esc(i.impactTxt)}`)),true)+
   ai_section('📌','FOLLOW-UP','var(--success)',li(fu),true)+planSec);
}

/* ---- 5.5 Ask AI (rule-based, hanya dari data dashboard) ---- */
/* ---- [ASK AI FIX] Plan = MINE PLAN (MINE_PLAN <- plan_daily_generated), Actual = RECORDS (production_actual) ----
   Ask AI membaca scope dari PERTANYAAN (tanggal/bulan/tahun/fleet/shift/material/pit); dimensi yang tidak disebut
   mengikuti filter dashboard aktif. Plan TIDAK PERNAH dikarang/di-fallback: bila Mine Plan kosong utk scope -> "belum tersedia".
   Mine Plan tidak punya dimensi pit/lokasi -> plan per pit dinyatakan tidak tersedia. */
const P5_MONTHS=[['januari','january','jan'],['februari','february','feb'],['maret','march','mar'],['april','apr'],['mei','may'],['juni','june','jun'],['juli','july','jul'],['agustus','august','agu','agt','aug'],['september','sept','sep'],['oktober','october','okt','oct'],['november','nov'],['desember','december','des','dec']];
const P5_MNAME=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
function p5Pad(n){ return String(n).padStart(2,'0'); }
function p5AddDays(iso,n){ const d=new Date(iso+'T00:00:00'); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+p5Pad(d.getMonth()+1)+'-'+p5Pad(d.getDate()); }
function p5AskScope(q){
  const t=' '+q.toLowerCase().replace(/[?,!]/g,' ')+' ', T=p5Today(), yq=t.match(/\b(20\d\d)\b/), Y=yq?Number(yq[1]):Number(filters.year)||Number(T.slice(0,4));
  const ranges=[], lab=[], sc={explicit:false,ranges,fleet:null,shift:null,stream:null,matCode:null,matName:null,pits:null,label:'',dimLabel:[]};
  const monthRange=(y,m)=>{ const last=new Date(y,m+1,0).getDate(); ranges.push({from:y+'-'+p5Pad(m+1)+'-01',to:y+'-'+p5Pad(m+1)+'-'+p5Pad(last)}); lab.push(P5_MNAME[m]+' '+y); };
  const dayRange=(iso)=>{ ranges.push({from:iso,to:iso}); lab.push(iso); };
  let m;
  if((m=t.match(/(\d{4})-(\d{2})-(\d{2})/))) dayRange(m[0]);
  else if(/\b(hari ini|today)\b/.test(t)) dayRange(T);
  else if(/\b(kemarin|yesterday)\b/.test(t)) dayRange(p5AddDays(T,-1));
  else if(/\b(besok|tomorrow)\b/.test(t)) dayRange(p5AddDays(T,1));
  else {
    const found=[]; P5_MONTHS.forEach((names,i)=>{ if(names.some(n=>new RegExp('\\b'+n+'\\b').test(t))) found.push(i); });
    const dm=t.match(/\b(?:tanggal|tgl|tgl\.)?\s*(\d{1,2})\s+(januari|february|februari|january|maret|march|april|mei|may|juni|june|juli|july|agustus|august|september|oktober|october|november|desember|december)\b/);
    const dm2=!dm && found.length===1 && t.match(/\b(?:tanggal|tgl)\s*(\d{1,2})\b/);
    if(dm){ const mi=P5_MONTHS.findIndex(n=>n.includes(dm[2])), dd=Number(dm[1]); if(dd>=1&&dd<=31&&mi>=0) dayRange(Y+'-'+p5Pad(mi+1)+'-'+p5Pad(dd)); }
    else if(dm2){ dayRange(Y+'-'+p5Pad(found[0]+1)+'-'+p5Pad(Number(dm2[1]))); }
    else if(found.length){ found.forEach(mi=>monthRange(Y,mi)); }
    else if((m=t.match(/\bbulan\s*(?:ke-?)?\s*(\d{1,2})\b/)) && Number(m[1])>=1 && Number(m[1])<=12) monthRange(Y,Number(m[1])-1);
    else if(/\bbulan ini\b|\bthis month\b/.test(t)) monthRange(Number(T.slice(0,4)),Number(T.slice(5,7))-1);
    else if(/\bbulan lalu\b|\blast month\b/.test(t)){ const d=new Date(T+'T00:00:00'); d.setDate(1); d.setMonth(d.getMonth()-1); monthRange(d.getFullYear(),d.getMonth()); }
    else if(yq || /\btahun ini\b/.test(t)){ ranges.push({from:Y+'-01-01',to:Y+'-12-31'}); lab.push('Tahun '+Y); }
  }
  if(ranges.length){ sc.explicit=true; sc.label=lab.join(' + '); }
  else sc.label=p5Scope().split(' • ').slice(0,2).join(' • ')+' (filter dashboard)';
  // Fleet
  const fl=FLEET_DEFS.filter(f=> t.includes(f.name.toLowerCase()) || new RegExp('\\b'+f.id.toLowerCase()+'\\b').test(t));
  let fm=null; if(!fl.length && (fm=t.match(/\bfleet\s*0?(\d{1,2})\b/))){ const c=FLEET_DEFS.find(f=>new RegExp('^fleet\\s*0*'+Number(fm[1])+'$','i').test(f.name)); if(c) fl.push(c); }
  if(fl.length){ sc.fleet=fl[0].name; sc.explicit=true; } else if(filters.fleet!=='all') sc.fleet=filters.fleet;
  // Shift
  const sh=t.match(/\bshift\s*(day|night|siang|malam)\b|\b(day|night)\s*shift\b|\b(siang|malam|night)\b/);
  if(sh){ const w=(sh[1]||sh[2]||sh[3]); sc.shift=/day|siang/.test(w)?'Day':'Night'; sc.explicit=true; } else if(filters.shift!=='all') sc.shift=filters.shift;
  // Material / stream
  const mats=new Map(); MINE_PLAN.concat(RECORDS).forEach(r=>{ if(r.materialCode && !mats.has(r.materialCode)) mats.set(r.materialCode,{code:r.materialCode,name:r.material,stream:r.stream}); });
  const spec=[...mats.values()].find(x=> x.stream==='OB_PRODUCTION' && x.code!=='OB' && (t.includes(x.name.toLowerCase().replace(/\s*\(.*\)/,'')) || (x.code==='TS'&&/\btop\s?soil\b/.test(t))));
  if(spec){ sc.matCode=spec.code; sc.matName=spec.name; sc.stream='OB_PRODUCTION'; sc.explicit=true; }
  else if(/\b(coal|batubara)\b|\bco\b/.test(t) && !/\b(ob|overburden)\b/.test(t)){ sc.stream='CO_PRODUCTION'; sc.explicit=true; }
  else if(/\b(overburden|ob)\b/.test(t) && !/\b(coal|batubara)\b|\bco\b/.test(t)){ sc.stream='OB_PRODUCTION'; sc.explicit=true; }
  // Pit / lokasi (hanya ada di Actual)
  let pits=PITS.filter(x=> t.includes(x.name.toLowerCase()));
  if(!pits.length && (fm=t.match(/\bpit\s*(\d{1,2})\b/))) pits=PITS.filter(x=> new RegExp('^pit\\s*'+Number(fm[1])+'\\b','i').test(x.name));
  if(pits.length){ sc.pits=pits.map(x=>x.name); sc.explicit=true; } else if(filters.pit!=='all') sc.pits=[filters.pit];
  sc.inDate=d=> sc.explicit && ranges.length ? ranges.some(r=>d>=r.from&&d<=r.to) : dateInFilter(d);
  sc.dimLabel=[sc.fleet&&('Fleet: '+sc.fleet),sc.shift&&('Shift: '+sc.shift),sc.matName&&('Material: '+sc.matName),sc.pits&&('Pit: '+sc.pits.join('/'))].filter(Boolean);
  return sc;
}
function p5AskByScope(rows,sc,withPit){
  return rows.filter(r=> sc.inDate(r.date) && (!sc.fleet||r.fleet===sc.fleet) && (!sc.shift||r.shift===sc.shift) && (!sc.matCode||r.materialCode===sc.matCode) && (!withPit||!sc.pits||sc.pits.includes(r.pit)));
}
function p5AskProd(q,sc){
  const t=q.toLowerCase(), T=p5Today(), F=v=>U.fmtExact(v,0);
  const cmp=/actual|aktual|realisasi|achievement|pencapaian|capaian|\bvs\b|versus|banding|deviasi|\bgap\b|selisih|produksi|production/.test(t);
  const planOnly=!cmp;
  const streams=sc.stream?[sc.stream]:['OB_PRODUCTION','CO_PRODUCTION'];
  const S={OB_PRODUCTION:['OB','BCM'],CO_PRODUCTION:['Coal','Ton']};
  const plan=p5AskByScope(MINE_PLAN,sc,false);
  const act=p5AskByScope(RECORDS,sc,true).filter(r=>p5Cls(r,T)==='actual');
  const head='['+sc.label+(sc.dimLabel.length?' • '+sc.dimLabel.join(' • '):'')+'] ';
  const out=[];
  if(!plan.length) out.push('Data Mine Plan untuk periode/dimensi ini belum tersedia (tidak ada baris di Mine Plan → Generated Plan). Plan tidak diestimasi dan tidak memakai sumber lain.');
  streams.forEach(k=>{
    const [nm,un]=S[k], pS=plan.filter(r=>r.stream===k), aS=act.filter(r=>r.stream===k);
    const pFull=U.sum(pS,'targetVolume'), pDue=U.sum(pS.filter(r=>r.date<=T),'targetVolume'), aV=U.sum(aS,'productionVolume');
    const pRit=U.sum(pS,'targetRitase'), aRit=U.sum(aS,'ritase');
    let L;
    if(!pS.length) L=nm+': plan Mine Plan belum tersedia'+(planOnly?'':'; actual '+F(aV)+' '+un)+'.';
    else if(sc.pits && !planOnly) L=nm+': actual '+F(aV)+' '+un+' pada '+sc.pits.join('/')+'. Plan per pit/lokasi tidak tersedia (Mine Plan tidak memiliki dimensi pit).';
    else if(planOnly) L=nm+': plan Mine Plan '+F(pFull)+' '+un+(/ritase/.test(t)?' • '+F(pRit)+' ritase':'')+'.';
    else {
      L=nm+': plan periode '+F(pFull)+' '+un+' (Mine Plan)';
      if(pDue>0){ L+=' • plan s/d '+T+' '+F(pDue)+'; actual '+F(aV)+' '+un+'; achievement '+p5Ach(aV,pDue)+'; gap '+F(aV-pDue)+' '+un; }
      else L+='; belum ada hari berjalan pada periode ini untuk dibandingkan dengan actual ('+F(aV)+' '+un+' tercatat)';
      if(/ritase/.test(t)) L+=' • ritase plan '+F(pRit)+' vs actual '+F(aRit);
      L+='.';
    }
    out.push(L);
  });
  if(sc.pits && planOnly && plan.length) out.push('Catatan: Mine Plan tidak memiliki dimensi pit/lokasi; plan di atas berlaku seluruh pit, bukan '+sc.pits.join('/')+'.');
  // breakdown opsional (hanya dari Mine Plan)
  const bk=/per fleet|tiap fleet|by fleet/.test(t)?['fleet',r=>r.fleet]:/per shift|tiap shift/.test(t)?['shift',r=>r.shift]:/per material|tiap material/.test(t)?['material',r=>r.material]:/per hari|harian|per tanggal|daily/.test(t)?['hari',r=>r.date]:null;
  if(bk && plan.length && !sc.pits){
    const g=new Map(); plan.filter(r=>r.stream==='OB_PRODUCTION'||r.stream==='CO_PRODUCTION').forEach(r=>{ const key=bk[1](r)+' ('+(r.stream==='CO_PRODUCTION'?'Coal Ton':'OB BCM')+')'; g.set(key,(g.get(key)||0)+r.targetVolume); });
    const arr=[...g].sort((a,b)=>a[0]<b[0]?-1:1).slice(0,62);
    out.push('Plan per '+bk[0]+': '+arr.map(x=>x[0]+' '+F(x[1])).join('; ')+'.');
  }
  return head+out.join(' ');
}
function p5AskAnswer(q){
  const t=q.toLowerCase(), K=p5KpiActual(), X=K.X, has=r=>r.test(t), INS='Insufficient Data';
  /* [ASK AI FIX] Pertanyaan plan / produksi / achievement -> scope dari pertanyaan; Plan dari Mine Plan (MINE_PLAN), Actual dari production_actual */
  const sc=p5AskScope(q), prodQ=has(/\bplan\b|rencana|target|budget|achievement|pencapaian|capaian|deviasi|\bgap\b|selisih|\bvs\b|versus|banding|produksi|production|\bob\b|overburden|coal|batubara|\bco\b|ritase|volume|tonase|tonnage/);
  const otherQ=has(/\bpa\b|\bua\b|availability|utilization|utilisasi|delay|idle|standby|breakdown|rusak|bd\b|weather|cuaca|hujan|rain|exception|masalah|perhatian|attention|issue|trend|anomal|tren|kenapa|mengapa|why|penyebab|root cause|ringkas|summary|rangkum/);
  const prodAns=prodQ?p5AskProd(q,sc):null;
  if(prodAns && !otherQ) return prodAns;
  if(!X.data.length&&!X.pu2.length&&!prodAns) return INS+' — tidak ada data actual pada filter aktif (s/d '+K.T+').';
  const parts=[]; if(prodAns) parts.push(prodAns);
  if(!prodAns && sc.explicit && otherQ) parts.push('Catatan: periode/dimensi di pertanyaan belum dipakai untuk topik ini; jawaban mengikuti filter dashboard aktif ('+p5Scope()+').');
  if(has(/ringkas|summary|rangkum/)) parts.push('Lihat halaman Daily / Shift Summary; ringkas: OB '+p5Ach(K.ob,K.obP)+', Coal '+p5Ach(K.co,K.coP)+'.');
  if(!prodAns && has(/\bob\b|overburden|produksi|production|achievement|coal|batubara|\bco\b/)){ if(has(/coal|batubara|\bco\b/)||!has(/\bob\b|overburden/)) parts.push(`Coal: ${U.fmt(K.co,0)} Ton vs plan ${U.fmt(K.coP,0)} (${p5Ach(K.co,K.coP)}).`); if(has(/\bob\b|overburden/)||!has(/coal|batubara|\bco\b/)) parts.push(`OB: ${U.fmt(K.ob,0)} BCM vs plan ${U.fmt(K.obP,0)} (${p5Ach(K.ob,K.obP)}).`); }
  if(has(/\bpa\b|\bua\b|availability|utilization|utilisasi/)) parts.push(`PA ${K.pa.scheduled>0?U.fmt(K.pa.pa,1)+'%':INS}, UA ${K.pa.available>0?U.fmt(K.pa.ua,1)+'%':INS}.`);
  if(has(/delay/)){ const d=p5Top(X.dl2,e=>e.name,e=>e.hours,3); parts.push(d.length?'Delay '+ovDur(X.loss.Delay)+'; terbesar: '+d.map(c=>c[0]+' ('+ovDur(c[1])+')').join(', ')+'.':'Delay: '+INS+'.'); }
  if(has(/idle|standby/)){ const d=p5Top(X.idlUnit,e=>e.name,e=>e.hours,3); parts.push(d.length?'Idle unit '+ovDur(X.loss.Idle)+'; terbesar: '+d.map(c=>c[0]+' ('+ovDur(c[1])+')').join(', ')+'.':'Idle: '+INS+' (idle_events tidak tercatat pada filter ini).'); }
  if(has(/breakdown|rusak|bd\b/)){ const d=p5Top(X.pu2.filter(s=>s.status==='Breakdown'),s=>s.unit,s=>s.durationHours,3); parts.push(d.length?'Breakdown '+ovDur(X.loss.Breakdown)+'; unit terbesar: '+d.map(c=>c[0]+' ('+ovDur(c[1])+')').join(', ')+'.':'Breakdown: tidak ada tercatat pada filter ini.'); }
  if(has(/weather|cuaca|hujan|rain/)) parts.push(X.wx.length?'Weather '+ovDur(X.loss.Weather)+' ('+X.wx.length+' event).':'Weather: tidak ada event pada filter ini.');
  if(has(/exception|masalah|perhatian|attention|issue/)) parts.push(X.items.length?'Exception aktif ('+X.items.length+'): '+X.items.slice(0,5).map(i=>i.title+' ['+i.sev+']').join('; ')+'.':'Tidak ada exception aktif.');
  if(has(/fleet/)){ const fl=[...new Set(X.data.map(r=>r.fleet).filter(Boolean))].sort(); parts.push(fl.length?'Fleet pada filter: '+fl.map(f=>f+' (OB '+U.fmt(U.sum(X.data.filter(r=>r.fleet===f&&r.stream==='OB_PRODUCTION'),'productionVolume'),0)+' BCM, Coal '+U.fmt(U.sum(X.data.filter(r=>r.fleet===f&&r.stream==='CO_PRODUCTION'),'productionVolume'),0)+' Ton)').join('; ')+'.':'Fleet: '+INS+'.'); }
  if(has(/trend|anomal|tren/)){ const S=p5Series(), r=['OB','CO','PA','UA','Delay'].map(k=>{ const a=p5Analyze(S[k]); return k+': '+(a.ok?(a.anom?'anomaly (z='+U.fmt(a.z,1)+')':'normal'):INS); }); parts.push('Trend/anomaly — '+r.join(', ')+'. (Detail: halaman Trend & Anomaly; bukan bukti sebab-akibat.)'); }
  if(has(/kenapa|mengapa|why|penyebab|root cause/)) parts.push('Penyebab pasti tidak dapat disimpulkan dari data dashboard; hanya contributor tercatat yang ditampilkan di Exception Explanation.');
  return parts.length ? parts.join(' ') : INS+' — pertanyaan tidak dapat dijawab dari data dashboard yang tersedia.';
}
function p5AskSend(){ const i=document.getElementById('p5q'); if(!i||!i.value.trim()) return; const q=i.value.trim(); P5_ASK.log.push({q,a:p5AskAnswer(q),scope:p5Scope(),page:currentPage}); renderPage(); }
function render_ai_ask(data,el){
  const K=p5KpiActual(), X=K.X, nav=NAV.find(n=>n.id===currentPage);
  const ctx=[['Halaman',nav?nav.label:currentPage],['Periode/Tanggal',p5Scope()],['OB (actual)',p5Ach(K.ob,K.obP)],['Coal (actual)',p5Ach(K.co,K.coP)],['PA/UA',(K.pa.scheduled>0?U.fmt(K.pa.pa,1)+'%':'Insufficient Data')+' / '+(K.pa.available>0?U.fmt(K.pa.ua,1)+'%':'Insufficient Data')],['Exception aktif',X.items.length+(EX.path.length?' • drilldown: '+EX.path.map(p=>p.l).join(' › '):'')]];
  el.innerHTML=p5Head('Ask AI','Jawaban rule-based dari data dashboard (tanpa LLM eksternal)')+p5ClassNote(K)+
   `<div class="glass p-4 mb-3 text-[12px]">${ctx.map(c=>`<span class="tag" style="margin:2px">${c[0]}: ${esc(c[1])}</span>`).join('')}</div>`+
   `<div class="glass p-4 mb-3 flex gap-2"><input id="p5q" class="btn" style="flex:1" placeholder="Contoh: berapa PA? delay terbesar? exception aktif? trend OB?" onkeydown="if(event.key==='Enter')p5AskSend()"><button class="btn" onclick="p5AskSend()">Tanya</button></div>`+
   P5_ASK.log.slice().reverse().map(m=>`<div class="glass p-4 mb-2"><div class="text-[12px]" style="color:var(--text-dim)">🧑 ${esc(m.q)} <span style="color:var(--text-faint)">(${esc(m.scope)})</span></div><div class="text-[12.5px]" style="margin-top:6px">🤖 ${esc(m.a)}</div></div>`).join('');
}

/* wiring: Exception Explanation ditambahkan ke halaman AI Insight (Phase 5.1 tetap utuh) */
const _p5OrigAiInsight = render_ai_insight;
window.render_ai_insight = function(d,el){ _p5OrigAiInsight(d,el); try{ el.insertAdjacentHTML('beforeend',p5ExplSection()); }catch(e){ console.error('[Phase 5.2]',e); } };