
/* ===== MINE PLAN (additive): tabel plan_* saja. Tidak menulis production_actual. MINE PLAN = single source of truth Plan dashboard. ===== */
const MP={y:2026,m:1,tab:'A',a:null,calc:null,fleet:[],proty:[],gen:[],opt:null,sel:null,pg:0,fF:'',fM:'',arm:null,yr:[],ed:null,armA:false,ch:null};
const MP_MON=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
const mpF=(v,d=1)=>v==null?'–':Number(v).toLocaleString('id-ID',{maximumFractionDigits:d});
const mpBadge=s=>{const c={VALID:'#22c55e',ESTIMATED:'#f59e0b',NEEDS_VALIDATION:'#ef4444',INACTIVE:'#64748b'}[s]||'#64748b';return `<span style="background:${c}22;color:${c};border:1px solid ${c}55;border-radius:6px;padding:1px 6px;font-size:10px;white-space:nowrap">${s||'–'}</span>`;};

const MP_FLAG={PROTY_NOT_FOUND:'PROTY tidak ditemukan',PROTY_FLEET_LEVEL_MISSING:'PROTY level fleet tidak ada (fallback model)',PRODUCTIVITY_MISSING:'Productivity kosong',CYCLE_TIME_MISSING:'Cycle time kosong',DISTANCE_MISSING:'Distance kosong',PAYLOAD_MISSING:'Payload kosong',PROTY_ESTIMATED:'PROTY ESTIMATED (turunan Actual)',PROTY_NEEDS_VALIDATION:'PROTY NEEDS_VALIDATION',DELAY_OB_NOT_SET:'Delay OB belum diisi (dihitung 0)',DELAY_COAL_NOT_SET:'Delay Coal belum diisi (dihitung 0)',ASSUMPTION_NEEDS_VALIDATION:'Assumption NEEDS_VALIDATION',ASSUMPTION_ESTIMATED:'Assumption ESTIMATED',FLEET_PLAN_ESTIMATED:'Fleet plan ESTIMATED',FLEET_PLAN_NEEDS_VALIDATION:'Fleet plan NEEDS_VALIDATION',HAULER_QTY_OUTSIDE_RULE:'Qty hauler di luar aturan fleet',FLEET_MISMATCH:'Excavator bukan digger utama/cadangan fleet'};
const mpFlagTxt=k=>MP_FLAG[k]||k;
function mpIssues(x){const a=[];
  if(!x.proty_id)a.push('PROTY_NOT_FOUND');else{if(x.proty_fleet_fallback)a.push('PROTY_FLEET_LEVEL_MISSING');if(x.excavator_productivity==null)a.push('PRODUCTIVITY_MISSING');if(x.cycle_time_min==null)a.push('CYCLE_TIME_MISSING');if(x.distance_km==null)a.push('DISTANCE_MISSING');if(x.hauler_capacity==null)a.push('PAYLOAD_MISSING');}
  if(x.hauler_qty_outside_rule)a.push('HAULER_QTY_OUTSIDE_RULE');if(x.fleet_mismatch)a.push('FLEET_MISMATCH');return a;}
const mpErr=(e,t)=>{if(e){showToast((t||'Gagal')+': '+(e.message||e),'error');return true;}return false;};
async function mpLoad(){
  const ym=q=>q.eq('year',MP.y).eq('month',MP.m);
  const [a,c,f,p,g,ys]=await Promise.all([
    ym(sb.from('plan_monthly_assumption').select('*')).maybeSingle(),
    ym(sb.from('v_plan_assumption_calc').select('*')).maybeSingle(),
    ym(sb.from('v_plan_fleet_matching').select('*')).order('material_code').order('fleet_code'),
    sb.from('plan_proty_matching').select('*').order('material_code').order('excavator_model').order('hauler_model'),
    ym(sb.from('plan_daily_generated').select('*')).order('plan_date').order('fleet_code').order('shift_code').limit(1000),
    sb.from('v_plan_monthly_summary').select('*').eq('year',MP.y).order('month')]);
  [a,c,f,p,g,ys].forEach(r=>mpErr(r.error,'Load Mine Plan'));
  MP.a=a.data;MP.calc=c.data;MP.fleet=f.data||[];MP.proty=p.data||[];MP.gen=g.data||[];MP.yr=ys.data||[];
  if(!MP.opt){
    const [fl,mt,un]=await Promise.all([sb.from('master_fleets').select('fleet_code').eq('is_active',true).order('fleet_code'),sb.from('master_materials').select('material_code').eq('is_active',true).in('production_stream',['OB_PRODUCTION','CO_PRODUCTION']).order('material_code'),sb.from('master_units').select('unit_code,unit_role_code,production_classification,model').eq('is_active',true)]);
    const u=un.data||[];
    MP.opt={fleets:(fl.data||[]).map(x=>x.fleet_code),mats:(mt.data||[]).map(x=>x.material_code),exc:u.filter(x=>x.unit_role_code==='EXCAVATOR'&&x.production_classification==='PRODUCTION').map(x=>x.unit_code).sort(),hau:[...new Set(u.filter(x=>x.unit_role_code==='HAULER').map(x=>x.model))].sort()};
  }
}
async function mpGen(){const {error}=await sb.rpc('fn_generate_plan',{p_year:MP.y,p_month:MP.m});return !mpErr(error,'Generate Plan');}
async function mpRefresh(gen){if(gen)await mpGen();await mpLoad();await reloadMinePlan();MP.sel=null;mpDraw();}
function render_mine_plan(data,el){el.innerHTML='<div class="glass p-8 text-center" style="color:var(--text-dim)">Memuat Mine Plan…</div>';mpLoad().then(mpDraw);}
function mpSet(k,v){MP[k]=v;if(k==='y'||k==='m'){mpLoad().then(mpDraw);}else{MP.pg=0;mpDraw();}}
async function mpSaveA(mode){
  const g=id=>document.getElementById(id).value, n=id=>g(id)===''?null:Number(g(id));
  const ty=Number(g('mpA_y')),tm=Number(g('mpA_m')),ed=n('mpA_ed'),sh=n('mpA_sh'),hr=n('mpA_hr'),pa=n('mpA_pa'),rain=n('mpA_rain')||0,slip=n('mpA_slip')||0,fast=n('mpA_fast')||0;
  if(!(ed>0&&ed<=31&&sh>=1&&sh<=2&&hr>0&&hr<=12&&pa>0&&pa<=100)){showToast('Cek Effective days (0-31), Shift (1-2), Jam/shift (0-12), PA (0-100%)','error');return;}
  let dob=n('mpA_dob'),dco=n('mpA_dco');
  const av=ed*sh*hr*pa/100,idle=rain*ed*(1+slip)+fast,uo=n('mpA_uaob'),uc=n('mpA_uaco');
  if(uo!=null)dob=Math.max(0,+(av-idle-uo/100*av).toFixed(2));
  if(uc!=null)dco=Math.max(0,+(av-idle-uc/100*av).toFixed(2));
  if(dob==null||dco==null){showToast('Delay OB & Coal wajib terisi (atau isi Set UA)','error');return;}
  const row={year:ty,month:tm,effective_days:ed,shifts_per_day:sh,hours_per_shift:hr,pa_plan:pa/100,rain_hours_per_day:rain,slippery_factor:slip,delay_ob_hours:dob,delay_coal_hours:dco,fasting_hours:fast,status:g('mpA_st'),source:'MANUAL',notes:g('mpA_nt')||null};
  const moved=ty!==MP.y||tm!==MP.m;let error;
  if(mode==='new'){({error}=await sb.from('plan_monthly_assumption').insert(row));
    if(!error){const cp=MP.fleet.filter(f=>f.material_code!=='CO'||ty*100+tm>=202607).map(f=>({year:ty,month:tm,fleet_code:f.fleet_code,material_code:f.material_code,excavator_unit_code:f.excavator_unit_code,excavator_qty:f.excavator_qty,hauler_model:f.hauler_model,hauler_qty:f.hauler_qty,source:'MANUAL',status:'NEEDS_VALIDATION'}));
      if(cp.length){const r=await sb.from('plan_monthly_fleet').upsert(cp,{onConflict:'year,month,fleet_code,material_code'});error=r.error;}}}
  else if(moved&&MP.a){({error}=await sb.from('plan_monthly_assumption').update(row).eq('assumption_id',MP.a.assumption_id));}
  else{({error}=await sb.from('plan_monthly_assumption').upsert(row,{onConflict:'year,month'}));}
  if(mpErr(error,'Simpan assumption'))return;
  if(moved&&mode!=='new')await sb.rpc('fn_generate_plan',{p_year:MP.y,p_month:MP.m});
  if(moved){MP.y=ty;MP.m=tm;}
  showToast('Tersimpan ke Supabase & plan dihitung ulang','success');await mpRefresh(true);
}
async function mpDelA(){
  if(!MP.armA){MP.armA=true;mpDraw();setTimeout(()=>{if(MP.armA){MP.armA=false;mpDraw();}},4000);return;}
  MP.armA=false;
  for(const t of ['plan_monthly_fleet','plan_monthly_assumption']){const {error}=await sb.from(t).delete().eq('year',MP.y).eq('month',MP.m);if(mpErr(error,'Hapus bulan'))return;}
  await mpGen();await mpLoad();await reloadMinePlan();mpDraw();showToast('Data bulan dihapus dari Supabase','success');
}
async function mpSaveFleet(id){
  const g=i=>document.getElementById(i).value;
  const patch={year:Number(g('mpE_y')),month:Number(g('mpE_mo')),material_code:g('mpE_m'),fleet_code:g('mpE_f'),excavator_unit_code:g('mpE_e'),excavator_qty:Number(g('mpE_eq')),hauler_model:g('mpE_h'),hauler_qty:Number(g('mpE_hq')),status:g('mpE_st'),source:'MANUAL'};
  if(!(patch.excavator_qty>=1&&patch.hauler_qty>=1)){showToast('Qty harus >= 1','error');return;}
  const old=MP.fleet.find(f=>f.fleet_plan_id===id);
  const {error}=await sb.from('plan_monthly_fleet').update(patch).eq('fleet_plan_id',id);if(mpErr(error,'Simpan fleet'))return;
  MP.ed=null;
  if(old&&(old.year!==patch.year||old.month!==patch.month))await sb.rpc('fn_generate_plan',{p_year:old.year,p_month:old.month});
  if(patch.year!==MP.y||patch.month!==MP.m)await sb.rpc('fn_generate_plan',{p_year:patch.year,p_month:patch.month});
  showToast('Fleet tersimpan ke Supabase','success');await mpRefresh(true);
}
const mpFleetEditRow=(x,o)=>{const s=(id,arr,v)=>`<select id="${id}" class="mp-sel">${[...new Set([...arr,v])].map(a=>`<option ${a==v?'selected':''}>${a}</option>`).join('')}</select>`;
  const mo=`<select id="mpE_mo" class="mp-sel">${MP_MON.map((n,i)=>`<option value="${i+1}" ${i+1===x.month?'selected':''}>${n}</option>`).join('')}</select>`;
  const q=(id,v)=>`<input id="${id}" type="number" min="1" value="${v}" class="mp-in" style="width:44px">`;
  return `<tr class="sel"><td>${s('mpE_m',o.mats,x.material_code)}<br>${s('mpE_y',[2025,2026,2027],x.year)} ${mo}</td><td>${s('mpE_f',o.fleets,x.fleet_code)}</td><td>${s('mpE_e',o.exc,x.excavator_unit_code)} ×${q('mpE_eq',x.excavator_qty)}</td><td></td><td>${s('mpE_h',o.hau,x.hauler_model)} ×${q('mpE_hq',x.hauler_qty)}</td><td colspan="6"></td><td>${s('mpE_st',['VALID','ESTIMATED','NEEDS_VALIDATION','INACTIVE'],x.status)}</td><td></td><td><button class="mp-btn" onclick="mpSaveFleet('${x.fleet_plan_id}')">Simpan</button> <button class="mp-btn g" onclick="MP.ed=null;mpDraw()">Batal</button></td></tr>`;};
function mpD(){
  const r=MP.yr,by=Object.fromEntries(r.map(x=>[x.month,x]));
  const sum=k=>r.reduce((a,x)=>a+Number(x[k]||0),0),avg=k=>r.length?sum(k)/r.length:0;
  const card=(l,v)=>`<div class="glass" style="padding:10px 14px;min-width:150px"><div style="font-size:11px;color:var(--text-dim)">${l}</div><div style="font-size:18px;font-weight:700">${v}</div></div>`;
  const go=i=>`onclick="MP.m=${i};MP.tab='A';mpLoad().then(mpDraw)"`;
  const rows=MP_MON.map((n,i)=>{const x=by[i+1];return x?`<tr class="clk" ${go(i+1)}><td>${n}</td><td>${mpF(x.plan_ob_bcm,0)}</td><td>${mpF(x.plan_co_mt,0)}</td><td>${mpF(x.pa_plan*100,1)}%</td><td>${mpF(x.ua_ob*100,1)}%</td><td>${mpF(x.ua_coal*100,1)}%</td><td>${x.fleet_count}</td><td>${mpF(x.plan_ritase,0)}</td><td>${mpBadge(x.assumption_status)}${x.warning_count?' <span style="color:#f59e0b" title="Delay belum diisi">⚠</span>':''}</td></tr>`:`<tr class="clk" ${go(i+1)}><td>${n}</td><td colspan="8" style="color:#f59e0b">Belum ada data — klik untuk menambah</td></tr>`;}).join('');
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">${card('Bulan terisi',r.length+' / 12')}${card('Plan OB '+MP.y,mpF(sum('plan_ob_bcm'),0)+' BCM')}${card('Plan CO '+MP.y,mpF(sum('plan_co_mt'),0)+' MT')}${card('Rata-rata PA',mpF(avg('pa_plan')*100,1)+'%')}${card('Rata-rata UA OB',mpF(avg('ua_ob')*100,1)+'%')}</div><div class="glass" style="padding:14px;margin-bottom:12px;height:300px"><canvas id="mpChart"></canvas></div><div class="glass" style="padding:14px;overflow:auto"><table class="mp-t"><tr><th>Bulan</th><th>Plan OB (BCM)</th><th>Plan CO (MT)</th><th>PA</th><th>UA OB</th><th>UA Coal</th><th>Fleet</th><th>Ritase</th><th>Status</th></tr>${rows}</table></div>`;
}
function mpChart(){
  if(MP.ch){try{MP.ch.destroy();}catch(e){}MP.ch=null;}
  const cv=document.getElementById('mpChart');if(!cv||typeof Chart==='undefined')return;
  const by=Object.fromEntries(MP.yr.map(x=>[x.month,x])),v=(k,m=1)=>MP_MON.map((_,i)=>by[i+1]?Number(by[i+1][k])*m:null);
  MP.ch=new Chart(cv,{type:'bar',data:{labels:MP_MON.map(n=>n.slice(0,3)),datasets:[{type:'bar',label:'Plan OB (BCM)',data:v('plan_ob_bcm'),backgroundColor:'#38bdf8aa',yAxisID:'y'},{type:'bar',label:'Plan CO (MT)',data:v('plan_co_mt'),backgroundColor:'#f59e0baa',yAxisID:'y'},{type:'line',label:'PA %',data:v('pa_plan',100),borderColor:'#22c55e',yAxisID:'y1',tension:.3},{type:'line',label:'UA OB %',data:v('ua_ob',100),borderColor:'#a78bfa',yAxisID:'y1',tension:.3}]},options:{responsive:true,maintainAspectRatio:false,scales:{y:{title:{display:true,text:'Volume'}},y1:{position:'right',min:70,max:100,grid:{drawOnChartArea:false}}}}});
}
async function mpUpd(tbl,id,key,patch,gen=true){const {error}=await sb.from(tbl).update(patch).eq(key,id);if(mpErr(error,'Update'))return;await mpRefresh(gen);}
async function mpFleetEdit(id,field,el){const v=Number(el.value);if(!(v>=1)){showToast('Nilai harus >= 1','error');return;}await mpUpd('plan_monthly_fleet',id,'fleet_plan_id',{[field]:v,source:'MANUAL',status:'NEEDS_VALIDATION'});}
async function mpProtyEdit(id,field,el){const v=el.value===''?null:Number(el.value);await mpUpd('plan_proty_matching',id,'proty_id',{[field]:v,source:'MANUAL_EDIT',status:'NEEDS_VALIDATION'});}
async function mpProtyStatus(id,el){await mpUpd('plan_proty_matching',id,'proty_id',{status:el.value});}
async function mpAddFleet(){
  const g=id=>document.getElementById(id).value;
  const row={year:MP.y,month:MP.m,fleet_code:g('mpN_f'),material_code:g('mpN_m'),excavator_unit_code:g('mpN_e'),excavator_qty:Number(g('mpN_eq')),hauler_model:g('mpN_h'),hauler_qty:Number(g('mpN_hq')),source:'MANUAL',status:'NEEDS_VALIDATION'};
  const {error}=await sb.from('plan_monthly_fleet').upsert(row,{onConflict:'year,month,fleet_code,material_code'});if(mpErr(error,'Tambah fleet'))return;showToast('Fleet tersimpan ke Supabase','success');await mpRefresh(true);
}
async function mpDelFleet(id){
  if(MP.arm!==id){MP.arm=id;mpDraw();setTimeout(()=>{if(MP.arm===id){MP.arm=null;mpDraw();}},4000);return;}
  MP.arm=null;const {error}=await sb.from('plan_monthly_fleet').delete().eq('fleet_plan_id',id);if(mpErr(error,'Hapus fleet'))return;await mpRefresh(true);
}
const mpIn=(id,v,w=70,ph='')=>`<input id="${id}" type="number" step="any" value="${v??''}" placeholder="${ph}" style="width:${w}px" class="mp-in">`;
function mpDraw(){
  const el=document.getElementById('pageContent');if(!el||currentPage!=='mine_plan')return;
  const opt=(arr,sel)=>arr.map(x=>`<option ${x==sel?'selected':''}>${x}</option>`).join('');
  const yrs=[2025,2026,2027].map(y=>`<option ${y===MP.y?'selected':''}>${y}</option>`).join('');
  const mons=MP_MON.map((n,i)=>`<option value="${i+1}" ${i+1===MP.m?'selected':''}>${n}</option>`).join('');
  const tabs=[['A','A. Monthly Assumption'],['B','B. Fleet Matching'],['C','C. Generated Plan'],['D','D. Ringkasan Tahunan']].map(([k,l])=>`<button class="mp-tab ${MP.tab===k?'on':''}" onclick="mpSet('tab','${k}')">${l}</button>`).join('');
  const css=`<style>.mp-in,.mp-sel{background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.15);border-radius:6px;color:inherit;padding:4px 6px;font-size:12px}.mp-tab{padding:7px 14px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:transparent;color:inherit;font-size:12px;cursor:pointer}.mp-tab.on{background:rgba(56,189,248,.18);border-color:#38bdf8}.mp-t{width:100%;border-collapse:collapse;font-size:12px}.mp-t th{text-align:left;color:var(--text-dim);font-weight:600;padding:6px;border-bottom:1px solid rgba(255,255,255,.12);white-space:nowrap}.mp-t td{padding:5px 6px;border-bottom:1px solid rgba(255,255,255,.06);white-space:nowrap}.mp-t tr.clk{cursor:pointer}.mp-t tr.clk:hover,.mp-t tr.sel{background:rgba(56,189,248,.10)}.mp-btn{background:#0ea5e9;border:0;border-radius:8px;color:#fff;padding:7px 14px;font-size:12px;cursor:pointer}.mp-btn.g{background:rgba(255,255,255,.1)}.mp-btn.r{background:#dc2626}.mp-lbl{font-size:11px;color:var(--text-dim);display:block;margin-bottom:2px}.mp-warn{background:#f59e0b18;border:1px solid #f59e0b55;border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:10px}</style>`;
  const head=`<div class="glass" style="padding:14px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center"><select class="mp-sel" onchange="mpSet('y',Number(this.value))">${yrs}</select><select class="mp-sel" onchange="mpSet('m',Number(this.value))">${mons}</select><div style="display:flex;gap:6px;flex-wrap:wrap">${tabs}</div><button class="mp-btn g" style="margin-left:auto" onclick="mpRefresh(true)">↻ Hitung ulang</button></div>`;
  let body='';
  if(MP.tab==='A')body=mpA();else if(MP.tab==='B')body=mpB(opt);else if(MP.tab==='D')body=mpD();else body=mpC();
  el.innerHTML=css+head+body;if(MP.tab==='D')mpChart();
}
function mpA(){
  const a=MP.a||{},c=MP.calc;
  const f=(id,l,v,ph)=>`<div><label class="mp-lbl">${l}</label>${mpIn(id,v,90,ph)}</div>`;
  const form=`<div class="glass" style="padding:14px;margin-bottom:12px"><div style="font-weight:600;margin-bottom:8px">Driver — ${MP_MON[MP.m-1]} ${MP.y} ${MP.a?'':'<span style="color:#f59e0b;font-size:11px">(belum ada data bulan ini)</span>'}</div><div style="display:flex;flex-wrap:wrap;gap:10px">${f('mpA_ed','Effective days',a.effective_days)}${f('mpA_sh','Shift / hari',a.shifts_per_day)}${f('mpA_hr','Jam / shift',a.hours_per_shift)}${f('mpA_pa','PA plan (%)',a.pa_plan!=null?+(a.pa_plan*100).toFixed(2):'')}${f('mpA_rain','Rain (jam/HARI)',a.rain_hours_per_day)}${f('mpA_slip','Slippery factor',a.slippery_factor)}${f('mpA_dob','Delay OB (jam/bulan/unit)',a.delay_ob_hours)}${f('mpA_dco','Delay Coal (jam/bulan/unit)',a.delay_coal_hours)}${f('mpA_fast','Fasting (jam/bulan/unit)',a.fasting_hours)}${f('mpA_uaob','Set UA OB (%) → hitung Delay',null,c?(c.ua_ob*100).toFixed(1):'')}${f('mpA_uaco','Set UA Coal (%) → hitung Delay',null,c?(c.ua_coal*100).toFixed(1):'')}<div><label class="mp-lbl">Periode</label><select id="mpA_y" class="mp-sel">${[2025,2026,2027].map(y=>`<option ${y===MP.y?'selected':''}>${y}</option>`).join('')}</select> <select id="mpA_m" class="mp-sel">${MP_MON.map((n,i)=>`<option value="${i+1}" ${i+1===MP.m?'selected':''}>${n}</option>`).join('')}</select></div><div><label class="mp-lbl">Status</label><select id="mpA_st" class="mp-sel">${['NEEDS_VALIDATION','ESTIMATED','VALID','INACTIVE'].map(s=>`<option ${s===(a.status||'NEEDS_VALIDATION')?'selected':''}>${s}</option>`).join('')}</select></div></div><div style="margin-top:8px"><label class="mp-lbl">Catatan</label><input id="mpA_nt" class="mp-in" style="width:100%" value="${esc(a.notes||'')}"></div><div style="margin-top:10px;display:flex;gap:10px;align-items:center"><button class="mp-btn" onclick="mpSaveA()">Simpan & hitung</button><button class="mp-btn g" onclick="mpSaveA('new')">Simpan sebagai bulan baru</button><button class="mp-btn ${MP.armA?'r':'g'}" onclick="mpDelA()">${MP.armA?'Yakin hapus?':'Hapus bulan'}</button><span style="font-size:11px;color:var(--text-dim)">Sumber: ${esc(a.source||'–')} · Semua jam per unit per bulan, kecuali Rain = jam per hari. Delay & Fasting = TOTAL per bulan (bukan per hari)</span></div></div>`;
  if(!c)return form;
  const r=(l,v,fm,d)=>`<tr><td>${l}</td><td style="text-align:right"><b>${v}</b></td><td style="color:var(--text-dim)">${fm}</td></tr>`;
  const w=(c.warnings||[]).length?`<div class="mp-warn">⚠ ${c.warnings.map(mpFlagTxt).join(', ')} — dianggap 0 jam sampai diisi.</div>`:'';
  return form+w+`<div class="glass" style="padding:14px;overflow:auto"><div style="font-weight:600;margin-bottom:6px">Hasil kalkulasi (otomatis, tidak bisa diedit) ${mpBadge(c.status)}</div><table class="mp-t"><tr><th>Komponen</th><th style="text-align:right">Nilai (jam)</th><th>Rumus</th></tr>
  ${r('MOHH',mpF(c.mohh),'eff. days × shift × jam/shift')}${r('Breakdown',mpF(c.breakdown_hours),'(1 − PA) × MOHH')}${r('Available',mpF(c.available_hours),'MOHH − Breakdown')}${r('Rain',mpF(c.rain_hours),'rain/hari × eff. days')}${r('Slippery',mpF(c.slippery_hours),'Rain × slippery factor')}${r('Idle',mpF(c.idle_hours),'Rain + Slippery + Fasting')}
  ${r('EWH OB',mpF(c.ewh_ob),'Available − Delay OB − Idle')}${r('UA OB',mpF(c.ua_ob*100,2)+'%','EWH / Available')}${r('EWH Coal',mpF(c.ewh_coal),'Available − Delay Coal − Idle')}${r('UA Coal',mpF(c.ua_coal*100,2)+'%','EWH / Available')}${r('Hari ter-generate',c.gen_days,'hari bulan − shutdown (calendar_events)')}</table></div>`;
}
function mpB(opt){
  const o=MP.opt||{fleets:[],mats:[],exc:[],hau:[]};
  const rows=MP.fleet.map(x=>MP.ed===x.fleet_plan_id?mpFleetEditRow(x,o):`<tr><td>${x.material_code}</td><td>${x.fleet_code}</td><td>${x.excavator_unit_code} ×<input type="number" min="1" value="${x.excavator_qty}" class="mp-in" style="width:44px" onchange="mpFleetEdit('${x.fleet_plan_id}','excavator_qty',this)"></td><td>${mpF(x.excavator_productivity)} ${x.volume_unit||''}/jam/unit</td><td>${x.hauler_model} ×<input type="number" min="1" value="${x.hauler_qty}" class="mp-in" style="width:44px" onchange="mpFleetEdit('${x.fleet_plan_id}','hauler_qty',this)">${x.hauler_qty_outside_rule?' <span title="di luar aturan '+x.normal_hauler_min+'–'+x.max_hauler_active+'" style="color:#f59e0b">⚠</span>':''}</td><td>${mpF(x.hauler_capacity,2)}</td><td>${mpF(x.distance_km,2)}</td><td>${mpF(x.cycle_time_min,2)}</td><td>${mpF(x.required_hauler_raw,3)}</td><td>${mpF(x.required_hauler,0)}</td><td><b>${mpF(x.match_factor,2)}</b></td><td>${mpBadge(x.status)}</td><td style="white-space:normal;min-width:180px;color:#f59e0b;font-size:11px">${mpIssues(x).map(mpFlagTxt).join('<br>')||'<span style="color:#22c55e">OK</span>'}</td><td><button class="mp-btn g" onclick="MP.ed='${x.fleet_plan_id}';mpDraw()">Edit</button> <button class="mp-btn ${MP.arm===x.fleet_plan_id?'r':'g'}" onclick="mpDelFleet('${x.fleet_plan_id}')">${MP.arm===x.fleet_plan_id?'Yakin?':'Hapus'}</button></td></tr>`).join('')||`<tr><td colspan="14" style="color:var(--text-dim)">Belum ada fleet untuk bulan ini.</td></tr>`;
  const s=(id,arr)=>`<select id="${id}" class="mp-sel">${arr.map(v=>`<option>${v}</option>`).join('')}</select>`;
  const add=`<div style="display:flex;flex-wrap:wrap;gap:8px;align-items:end;margin-top:10px">${s('mpN_m',o.mats)}${s('mpN_f',o.fleets)}${s('mpN_e',o.exc)}<input id="mpN_eq" type="number" min="1" value="1" class="mp-in" style="width:44px">${s('mpN_h',o.hau)}<input id="mpN_hq" type="number" min="1" value="4" class="mp-in" style="width:44px"><button class="mp-btn" onclick="mpAddFleet()">+ Tambah fleet</button></div><div style="font-size:11px;color:var(--text-dim);margin-top:4px">Aturan DB: CO hanya fleet berizin, mulai 2026-07, hauler IVECO.</div>`;
  const pr=MP.proty.map(x=>`<tr><td>${x.material_code}</td><td>${x.fleet_code||'<i style="color:var(--text-dim)">model</i>'}</td><td>${x.excavator_model}</td><td>${x.hauler_model}</td><td>${mpIn('',x.excavator_productivity,64).replace('id=""',`onchange="mpProtyEdit('${x.proty_id}','excavator_productivity',this)"`)}</td><td>${mpIn('',x.hauler_capacity,54).replace('id=""',`onchange="mpProtyEdit('${x.proty_id}','hauler_capacity',this)"`)}</td><td>${mpIn('',x.distance_km,54).replace('id=""',`onchange="mpProtyEdit('${x.proty_id}','distance_km',this)"`)}</td><td>${mpIn('',x.cycle_time_min,54).replace('id=""',`onchange="mpProtyEdit('${x.proty_id}','cycle_time_min',this)"`)}</td><td>${mpF(x.required_hauler_raw,3)} / ${mpF(x.required_hauler,0)}</td><td>${esc(x.source)}</td><td><select class="mp-sel" onchange="mpProtyStatus('${x.proty_id}',this)">${['VALID','ESTIMATED','NEEDS_VALIDATION','INACTIVE'].map(v=>`<option ${v===x.status?'selected':''}>${v}</option>`).join('')}</select></td><td title="${esc(x.notes||'')}" style="color:var(--text-dim)">n=${x.sample_size??'–'} ⓘ</td></tr>`).join('');
  return `<div class="glass" style="padding:14px;margin-bottom:12px;overflow:auto"><div style="font-weight:600;margin-bottom:6px">Fleet Matching — ${MP_MON[MP.m-1]} ${MP.y}</div><table class="mp-t"><tr><th>Material</th><th>Fleet</th><th>Excavator</th><th>Productivity</th><th>Hauler</th><th>Payload</th><th>Jarak km</th><th>Cycle min</th><th>Req. raw</th><th>Req. bulat</th><th>Match factor</th><th>Status</th><th>Data quality</th><th></th></tr>${rows}</table>${add}</div>
  <details class="glass" style="padding:14px;overflow:auto"><summary style="cursor:pointer;font-weight:600">PROTY master (${MP.proty.length} baris) — edit di sini = source MANUAL_EDIT, status NEEDS_VALIDATION</summary><div class="mp-warn" style="margin-top:8px">Nilai ESTIMATED diturunkan dari production_actual, bukan spesifikasi resmi. Productivity = per unit per jam kerja (volume ÷ jam Working); kolom kosong = basis data tidak cukup.</div><table class="mp-t"><tr><th>Material</th><th>Fleet</th><th>Exca</th><th>Hauler</th><th>Prod/jam/unit</th><th>Payload</th><th>Jarak</th><th>Cycle</th><th>Req raw/bulat (1 exca)</th><th>Source</th><th>Status</th><th>Sampel</th></tr>${pr}</table></details>`;
}
function mpC(){
  const g=MP.gen.filter(x=>(!MP.fF||x.fleet_code===MP.fF)&&(!MP.fM||x.material_code===MP.fM));
  const sum=m=>MP.gen.filter(x=>x.material_code===m).reduce((a,x)=>a+Number(x.planned_volume||0),0);
  const nv=MP.gen.filter(x=>x.status==='NEEDS_VALIDATION').length, es=MP.gen.filter(x=>x.status==='ESTIMATED').length;
  const flags={};MP.gen.forEach(x=>(x.quality_flags||[]).forEach(f=>flags[f]=(flags[f]||0)+1));
  const card=(l,v)=>`<div class="glass" style="padding:10px 14px;min-width:150px"><div style="font-size:11px;color:var(--text-dim)">${l}</div><div style="font-size:18px;font-weight:700">${v}</div></div>`;
  const pages=Math.max(1,Math.ceil(g.length/60)),pg=Math.min(MP.pg,pages-1),sl=g.slice(pg*60,pg*60+60);
  const rows=sl.map(x=>`<tr class="clk ${MP.sel===x.gen_id?'sel':''}" onclick="MP.sel='${x.gen_id}';mpDraw()"><td>${x.plan_date}</td><td>${x.material_code}</td><td>${x.fleet_code}/${x.shift_code}</td><td>${mpF(x.ewh_hours,2)}</td><td>${mpF(x.ua*100,1)}%</td><td>${mpF(x.productivity)}</td><td>${x.hauler_model} ×${x.hauler_qty}</td><td>${mpF(x.planned_ritase)}</td><td><b>${mpF(x.planned_volume)}</b> ${x.volume_unit}</td><td>${mpBadge(x.status)}${(x.quality_flags||[]).some(f=>/MISSING|NOT_FOUND|MISMATCH|OUTSIDE/.test(f))?' <span title="'+(x.quality_flags||[]).map(mpFlagTxt).join(' · ')+'" style="color:#ef4444">⚠</span>':''}</td></tr>`).join('')||`<tr><td colspan="10" style="color:var(--text-dim)">Belum ada plan. Isi Assumption + Fleet lalu Hitung ulang.</td></tr>`;
  const flt=(k,arr,l)=>`<select class="mp-sel" onchange="mpSet('${k}',this.value)"><option value="">${l}</option>${arr.map(v=>`<option ${v===MP[k]?'selected':''}>${v}</option>`).join('')}</select>`;
  const o=MP.opt||{fleets:[],mats:[]};
  let det='';const x=MP.gen.find(r=>r.gen_id===MP.sel);
  if(x&&MP.calc){const c=MP.calc,fl=MP.fleet.find(f=>f.fleet_code===x.fleet_code&&f.material_code===x.material_code)||{},co=x.material_code==='CO',ewhm=co?c.ewh_coal:c.ewh_ob;
    det=`<div class="glass" style="padding:14px;margin-top:12px"><div style="font-weight:600;margin-bottom:6px">Detail ${x.plan_date} · ${x.fleet_code} · Shift ${x.shift_code} · ${x.material_code} ${mpBadge(x.status)}</div><div style="font-size:12px;line-height:1.7">
    MOHH ${mpF(c.mohh)} − Breakdown ${mpF(c.breakdown_hours)} = Available ${mpF(c.available_hours)} jam<br>
    Available − Delay ${mpF(co?c.delay_coal_hours:c.delay_ob_hours)} − Idle ${mpF(c.idle_hours)} = EWH bulan ${mpF(ewhm,2)} jam (UA ${mpF(x.ua*100,2)}%)<br>
    EWH shift = ${mpF(ewhm,2)} ÷ (${c.gen_days} hari × ${c.shifts_per_day} shift) = <b>${mpF(x.ewh_hours,3)} jam</b><br>
    Kapasitas hauler = ${x.hauler_qty} × ${mpF(fl.trips_per_hour,2)} rit/jam × ${mpF(fl.hauler_capacity,2)} = ${mpF(x.hauler_qty*(fl.trips_per_hour||0)*(fl.hauler_capacity||0))} /jam · Excavator = ${mpF(fl.excavator_productivity)} × ${x.excavator_qty} unit = ${mpF((fl.excavator_productivity||0)*x.excavator_qty)} /jam<br>
    Productivity fleet = min(keduanya) = <b>${mpF(x.productivity)} ${x.volume_unit}/jam</b><br>Req. hauler raw = prod/unit × ${x.excavator_qty} exca ÷ (rit/jam × payload) = <b>${mpF(x.required_hauler_raw,3)}</b> → dibulatkan ${mpF(x.required_hauler,0)} · Match factor = ${x.hauler_qty} ÷ raw = <b>${mpF(x.match_factor,2)}</b><br>
    Volume = ${mpF(x.ewh_hours,2)} × ${mpF(x.productivity)} = <b>${mpF(x.planned_volume)} ${x.volume_unit}</b> · Ritase = Volume ÷ payload = <b>${mpF(x.planned_ritase)}</b><br>
    <span style="color:#f59e0b">${(x.quality_flags||[]).map(mpFlagTxt).join(' · ')||'Tidak ada warning'}</span></div></div>`;}
  return `<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">${card('Plan OB',mpF(sum('OB'),0)+' BCM')}${card('Plan CO',mpF(sum('CO'),0)+' MT')}${card('Baris',MP.gen.length)}${card('NEEDS_VALIDATION',nv)}${card('ESTIMATED',es)}</div>
  ${Object.keys(flags).length?`<div class="mp-warn"><b>⚠ Data quality (${MP.gen.length} baris)</b><br>${Object.entries(flags).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`• ${mpFlagTxt(k)} — ${v} baris`).join('<br>')}</div>`:''}
  <div class="glass" style="padding:14px;overflow:auto"><div style="display:flex;gap:8px;margin-bottom:8px;align-items:center">${flt('fF',o.fleets,'Semua fleet')}${flt('fM',o.mats,'Semua material')}<span style="font-size:11px;color:var(--text-dim);margin-left:auto">Klik baris untuk detail · halaman ${pg+1}/${pages} <button class="mp-btn g" onclick="MP.pg=Math.max(0,${pg}-1);mpDraw()">‹</button> <button class="mp-btn g" onclick="MP.pg=Math.min(${pages-1},${pg}+1);mpDraw()">›</button></span></div><table class="mp-t"><tr><th>Tanggal</th><th>Material</th><th>Fleet/Shift</th><th>EWH</th><th>UA</th><th>Prod/jam</th><th>Hauler</th><th>Ritase</th><th>Plan</th><th>Status</th></tr>${rows}</table></div>${det}`;
}