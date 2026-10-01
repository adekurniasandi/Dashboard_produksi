/* ================== STANDBY / BREAKDOWN — EVENT TERPISAH DARI PRODUCTION HOURLY ==================
   Production tetap 100% per jam (diForm/diSeg/diCommit dst — TIDAK disentuh oleh section ini).
   Standby & Breakdown di sini adalah EVENT level-SHIFT (Start–End bebas, bisa sebagian jam sampai
   satu shift penuh), disimpan ke unit_status_actual dengan data_source='DAILY_INPUT_EVENT' (penanda unik
   supaya tidak tertukar dengan baris historis RECONSTRUCTED_ACTUAL atau baris segmen per-jam dari Fleet).
   Reason Standby dari master_idles/master_delays (existing); Reason BD dari master_failure_categories/
   master_failure_reasons (SUDAH ADA di project — bukan tabel baru, lihat render_daily_input init). */
function diSbDurHours(start,end){
  if(!start || !end) return 0;
  const [sh,sm]=start.split(':').map(Number), [eh,em]=end.split(':').map(Number);
  let mins = (eh*60+em) - (sh*60+sm);
  if(mins<=0) mins += 24*60;   // lintas tengah malam (umum utk shift Night 19:00-07:00)
  return Math.round(mins/60*100)/100;
}
function diSbRange(r){
  if(!r.start || !r.end) return null;
  const [sh,sm]=r.start.split(':').map(Number), [eh,em]=r.end.split(':').map(Number);
  let s=sh*60+sm, e=eh*60+em; if(e<=s) e+=1440;
  return [s,e];
}
function diSbOverlapSet(){
  const bad = new Set();
  for(let i=0;i<DI.sb.length;i++){
    const a = DI.sb[i], A = diSbRange(a); if(!A || !a.unit) continue;
    for(let j=i+1;j<DI.sb.length;j++){
      const b = DI.sb[j]; if(!b.unit || b.unit!==a.unit) continue;
      const B = diSbRange(b); if(!B) continue;
      if(A[0] < B[1] && B[0] < A[1]){ bad.add(i); bad.add(j); }
    }
  }
  return bad;
}
// [SB UNIT LOCK 2026-09] Sama semangatnya dengan diLockedUnits()/diLockedSupportUnits() (Fleet/Support),
// tapi untuk tab Standby/BD (DI.sb, event Start–End level-shift): unit dianggap "sudah terisi" jam ini
// kalau sudah dipakai di event Standby/BD lain, ATAU sudah dipakai Fleet (digger/hauler) atau Support di
// JAM MANAPUN yang sudah diisi shift ini (DI.forms) — konservatif, supaya dropdown & pesan "semua unit
// sudah terisi" konsisten dengan validasi cross-module yang sudah ada (diValidate baris ~6304-6308).
function diSbLockedUnits(self){
  const out = {};
  const add = (u, why)=>{ if(u && !out[u]) out[u] = why; };
  DI.sb.forEach((r,i)=>{ if(i!==self) add(r.unit, r.kind==='BD' ? 'BD' : 'Standby/BD'); });
  Object.values(DI.forms||{}).forEach(f=>{
    (f.fleets||[]).forEach((fl,i)=>{ const n = diFleetName(fl,i);
      add(fl.digger, `Production ${n}`);
      (fl.haulers||[]).forEach(hl=> add(hl.unit, `Production ${n}`)); });
    (f.support||[]).forEach(s=> add(s.unit, `Support (${DI_ST[s.s]||s.s})`));
  });
  return out;
}
function diSbDel(i){ DI.sb.splice(i,1); diPaint(); }
function diSbSet(i, field, val){
  const row = DI.sb[i]; if(!row) return; row[field] = val;
  if(field==='kind'){ row.cat=''; row.reason=''; row.bdcat=''; row.bdreason=''; }
  if(field==='cat') row.reason='';
  if(field==='bdcat') row.bdreason='';
  diPaint();
}
/* ================== STANDBY / BREAKDOWN — status-first roster (Mining Control Room) ==================
   [UI 2026-09] DI.sb TETAP array event Start–End per unit (field unit/kind/cat/reason/bdcat/bdreason/
   start/end sama persis, disimpan lewat diSaveSb() yang tidak diubah). Satu unit BOLEH punya lebih dari
   satu event (jam berbeda dalam shift yang sama, mis. BD lalu lanjut Standby) — kemampuan itu TETAP ADA
   lewat "+ Tambah jam lain" di tiap unit, hanya interaksi utamanya diubah dari "+ baris -> pilih Unit ->
   pilih Kind dropdown" menjadi roster semua unit dengan tap W/I/D/BD langsung pada EVENT PERTAMA unit
   tsb (W = tidak ada event/hapus event pertama, I/D = kind SB + kategori, BD = kind BD). */
function diSbUnitList(){ return diOptUnits().concat(diOptSupportUnits()); }
function diSbGroupIdx(unit){ const out=[]; DI.sb.forEach((r,i)=>{ if(r.unit===unit) out.push(i); }); return out; }
/* [NO LOCATION 2026-09] Keputusan user: unit yang BELUM punya event/status apa pun untuk shift ini
   TIDAK BOLEH diam-diam dianggap 'W' (Working) — sebelumnya row null selalu dibaca sebagai 'W' sehingga
   unit yang sama sekali belum diisi (mis. SY365_39/ZX870_08 di awal shift) tampil seolah Working dan
   ikut tersaring keluar dari daftar "attention" (lihat diSbCard: filter key!=='W'). Sekarang row null
   mengembalikan 'NL' (No Location) — unit tetap tampil di roster attention, tidak pernah collapse, dan
   TIDAK dihitung sebagai Working di manapun (computePAUA/getUnifiedStandbyHours hanya mengenali status
   'Working'/'Standby'/'Breakdown' secara eksplisit, jadi 'No Location' otomatis tidak menambah jam
   produktif — lihat getUnifiedStandbyHours baris ~2065).*/
function diSbKeyOf(row, unit){ if(!row) return (unit && DI.sbConfirmedW.has(unit)) ? 'W' : 'NL'; if(row.kind==='BD') return 'BD'; return row.cat==='Delay' ? 'D' : 'I'; }
function diSbTap(unit, key, idx){
  // [NO LOCATION 2026-09] Tap 'W' pada unit yang masih NL (belum ada event apa pun) = konfirmasi eksplisit
  // "unit ini memang Working/tidak ada Standby-BD", BUKAN diam-diam default seperti sebelumnya. Ditandai
  // di DI.sbConfirmedW supaya kartu keluar dari status "No Location" tapi TETAP tidak menulis baris apa pun
  // ke unit_status_actual dari sini (Working tetap sumbernya dari modul Production/Support seperti semula).
  if(key==='W'){ if(idx>-1){ diSbDel(idx); DI.sbExtra.delete(unit); } DI.sbConfirmedW.add(unit); diPaint(); return; }
  DI.sbConfirmedW.delete(unit);
  if(idx===-1){ DI.sb.push({unit, kind:'SB', cat:'', reason:'', bdcat:'', bdreason:'', start:'', end:''}); idx = DI.sb.length-1; }
  const row = DI.sb[idx];
  if(key==='BD'){ row.kind='BD'; row.cat=''; row.reason=''; }
  else { row.kind='SB'; row.cat = key==='I' ? 'Idle' : 'Delay'; row.bdcat=''; row.bdreason=''; }
  diPaint();
}
function diSbAddMore(unit){ DI.sb.push({unit, kind:'SB', cat:'Idle', reason:'', bdcat:'', bdreason:'', start:'', end:''}); diPaint(); }
/* [UI 2026-09 +UNIT] "+ Unit" panel di tab Standby/BD — sama prinsipnya dengan diSupAddUnit(): murni
   menandai unit supaya cardnya ikut tampil (DI.sbExtra, UI-only). Belum membuat event DI.sb apa pun —
   operator tap status (I/D/BD) di card seperti biasa lewat diSbTap() yang sudah ada. */
function diSbAddUnit(unit){ DI.sbExtra.add(unit); DI.sbPicker = false; diPaint(); }
function diSbSummary(){
  const c = {W:0,I:0,D:0,BD:0,NL:0}, list = diSbUnitList();
  list.forEach(o=>{ const idxs = diSbGroupIdx(o.value); const row = idxs.length ? DI.sb[idxs[0]] : null; const k = diSbKeyOf(row, o.value); if(c[k]!=null) c[k]++; });
  return { c, total: list.length };
}
function diSbEventPanel(idx, n, overlap){
  const r = DI.sb[idx];
  const bdReasons = (ADMIN_LOOKUP_CACHE._bdReason||[]).filter(x=>x.cat===r.bdcat);
  const dur = diSbDurHours(r.start, r.end);
  return `<div class="di-sb-panel ${overlap?'warn':''}">
    ${n>0?`<div class="di-sb-panel-tag">Jam tambahan #${n+1}<button class="di-x" title="Hapus event ini" onclick="diSbDel(${idx})">✕</button></div>`:''}
    <div class="di-grid2">
      <input class="adm-input" type="time" value="${esc(r.start)}" oninput="diSbSet(${idx},'start',this.value)" placeholder="Mulai">
      <input class="adm-input" type="time" value="${esc(r.end)}" oninput="diSbSet(${idx},'end',this.value)" placeholder="Selesai">
    </div>
    ${r.kind==='SB' ? `<div class="di-grid2 mt-1">
      <select class="adm-select" onchange="diSbSet(${idx},'cat',this.value)">
        <option value="Idle" ${r.cat==='Idle'?'selected':''}>Idle</option>
        <option value="Delay" ${r.cat==='Delay'?'selected':''}>Delay</option>
      </select>
      <select class="adm-select" onchange="diSbSet(${idx},'reason',this.value)">
        <option value="">— Reason —</option>
        ${(r.cat==='Idle'?diOptIdleUnit():r.cat==='Delay'?(ADMIN_LOOKUP_CACHE.delay||[]):[]).map(o=>`<option value="${esc(o.value)}" ${o.value===r.reason?'selected':''}>${esc(o.label)}</option>`).join('')}
      </select>
    </div>` : `<div class="di-grid2 mt-1">
      <select class="adm-select" onchange="diSbSet(${idx},'bdcat',this.value)">
        <option value="">— Kategori BD —</option>
        ${(ADMIN_LOOKUP_CACHE._bdCat||[]).map(o=>`<option value="${esc(o.value)}" ${o.value===r.bdcat?'selected':''}>${esc(o.label)}</option>`).join('')}
      </select>
      <select class="adm-select" onchange="diSbSet(${idx},'bdreason',this.value)" ${r.bdcat?'':'disabled'}>
        <option value="">— BD Reason —</option>
        ${bdReasons.map(o=>`<option value="${esc(o.value)}" ${o.value===r.bdreason?'selected':''}>${esc(o.label)}</option>`).join('')}
      </select>
    </div>`}
    <div class="di-sb-dur">${dur>0?'⏱ '+U.fmtExact(dur,2)+' jam':'Isi jam Mulai/Selesai'}</div>
    ${overlap?`<div class="di-alert warn" style="margin-top:6px">⚠️ Bentrok waktu dengan event lain untuk unit yang sama — tidak bisa disimpan sampai diperbaiki.</div>`:''}
  </div>`;
}
function diSbUnitCard(o, overlaps){
  const idxs = diSbGroupIdx(o.value), primary = idxs.length ? idxs[0] : -1;
  const row = primary>-1 ? DI.sb[primary] : null;
  const key = diSbKeyOf(row, o.value);
  const lockedMap = diSbLockedUnits(primary);
  const why = lockedMap[o.value];
  const disableNew = !row && !!why;
  return `<div class="di-card di-sb-unit">
    <div class="di-roster-row">
      <div><b>${esc(o.label)}</b>${why?`<span class="di-roster-tag lock">🔒 ${esc(why)}</span>`:''}${!why && key==='NL'?`<span class="di-roster-tag" style="background:${STATUS_COLOR['No Location']}22;color:${STATUS_COLOR['No Location']};border:1px solid ${STATUS_COLOR['No Location']}66">⬜ No Location — belum diisi</span>`:''}</div>
      <div class="di-stbtn">${['W','I','D','BD'].map(k=>`<button type="button" data-k="${k}" class="${k===key?'on':''}" ${disableNew && k!=='W'?'disabled':''} title="${DI_ST[k]||k}" onclick="diSbTap('${esc(o.value)}','${k}',${primary})">${k}</button>`).join('')}</div>
    </div>
    ${idxs.map((ix,n)=>diSbEventPanel(ix,n,overlaps.has(ix))).join('')}
    ${row ? `<button class="di-add" style="margin-top:2px" onclick="diSbAddMore('${esc(o.value)}')">+ Tambah jam lain untuk unit ini</button>` : ''}
  </div>`;
}
function diSbCard(){
  const overlaps = diSbOverlapSet(), list = diSbUnitList(), sum = diSbSummary();
  // [UI 2026-09] Exception Monitoring: unit W (Working, tidak butuh perhatian) TIDAK dirender di list —
  // tetap dihitung penuh di summary (diSbSummary() jalan atas SEMUA unit, sebelum filter ini). Murni
  // filter tampilan; DI.sb / status sumber tidak disentuh sama sekali.
  const attention = list.filter(o=>{ const idxs = diSbGroupIdx(o.value); const row = idxs.length ? DI.sb[idxs[0]] : null; return diSbKeyOf(row, o.value) !== 'W'; });
  // [UI 2026-09 +UNIT] Daftar utama = attention (unit yang memang berstatus Standby/Breakdown, sesuai
  // diSbKeyOf) DITAMBAH unit yang baru saja dipilih manual lewat "+ Unit" (DI.sbExtra, UI-only) supaya
  // operator bisa langsung tap status untuk unit itu. Begitu unit ditap balik ke W, otomatis keluar lagi
  // dari sbExtra (lihat diSbTap) — jadi tidak pernah ada unit Working yang memenuhi daftar ini.
  const shownCodes = new Set(attention.map(o=>o.value));
  const extraCards = list.filter(o=> DI.sbExtra.has(o.value) && !shownCodes.has(o.value));
  const shown = attention.concat(extraCards);
  const remaining = list.filter(o=> !shownCodes.has(o.value) && !DI.sbExtra.has(o.value));
  const lockedMap = diSbLockedUnits(-1);
  const availCount = remaining.filter(o=> !lockedMap[o.value]).length;
  const pickerHtml = !DI.sbPicker ? '' : `<div class="di-pick-panel">
      <div class="di-pick-h">Pilih unit untuk ditambahkan<button class="di-x" title="Tutup" onclick="DI.sbPicker=false;diPaint();">✕</button></div>
      ${remaining.length ? remaining.map(o=>{ const why = lockedMap[o.value];
          return why
            ? `<div class="di-pick-row off"><span>${esc(o.label)}</span><span class="di-pick-reason">Tidak tersedia — ${esc(why)}</span></div>`
            : `<div class="di-pick-row" onclick="diSbAddUnit('${esc(o.value)}')"><span>${esc(o.label)}</span><span class="di-pick-add">+ Pilih</span></div>`;
        }).join('') : '<div class="di-pick-empty">Semua unit sudah ditampilkan atau sedang Working.</div>'}
    </div>`;
  return `<div class="di-card">
    <div class="di-sum-bar">
      <div class="di-sum-title">STANDBY / BREAKDOWN</div><div class="di-sum-count">${sum.total} Units</div>
      <span class="di-sum-dot" style="background:var(--success)"></span><span class="di-sum-count">${sum.c.W} Working</span>
      <span class="di-sum-dot" style="background:var(--warning)"></span><span class="di-sum-count">${sum.c.I} Idle</span>
      <span class="di-sum-dot" style="background:#F97316"></span><span class="di-sum-count">${sum.c.D} Delay</span>
      <span class="di-sum-dot" style="background:var(--danger)"></span><span class="di-sum-count">${sum.c.BD} Breakdown</span>
      <span class="di-sum-dot" style="background:${STATUS_COLOR['No Location']}"></span><span class="di-sum-count">${sum.c.NL} No Location</span>
    </div>
    ${shown.map(o=>diSbUnitCard(o,overlaps)).join('') || '<div class="di-attn-empty">✅ Tidak ada unit Standby/Idle/Delay/Breakdown — semua unit Working.</div>'}
    <button class="di-add big" onclick="DI.sbPicker=!DI.sbPicker;diPaint();">${DI.sbPicker?'✕ Tutup':'+ Unit'}${remaining.length?` (${availCount} tersedia)`:''}</button>
    ${pickerHtml}
    <div class="flex gap-2 items-center flex-wrap" style="margin-top:10px">
      <button class="btn btn-accent" onclick="diSaveSb()">Simpan Standby/BD</button>
    </div>
  </div>`;
}
/* Bersihkan mirror idle_events/delay_events milik fitur ini (scope='UNIT' & hour_label IS NULL — penanda
   yang tidak overlap dengan mirror per-jam dari Fleet, yang selalu punya hour_label). Best-effort: hanya
   saat online, karena OfflineEngine tidak punya delete-by-filter (cuma delete-by-PK) untuk mode antre offline. */
async function diSbClearMirrors(){
  if(OfflineEngine.isOffline()) return false;
  try{
    await sb.from('idle_events').delete().eq('event_date',DI.date).eq('shift_code',DI.shift).eq('scope','UNIT').is('hour_label',null);
    await sb.from('delay_events').delete().eq('event_date',DI.date).eq('shift_code',DI.shift).is('hour_label',null);
    return true;
  }catch(e){ console.warn('[DailyInput] Gagal bersihkan mirror idle/delay event:', e); return false; }
}
function diSaveSb(){ return diGuardedSave('sb', diSaveSb_impl); }
async function diSaveSb_impl(){
  const errs = [];
  DI.sb.forEach((r,i)=>{
    if(!r.unit || !r.start || !r.end){ errs.push(`Event #${i+1}: Unit/Start/End belum lengkap.`); return; }
    if(r.kind==='SB' && (!r.cat || !r.reason)) errs.push(`Event #${i+1} (${r.unit}): pilih Kategori & Reason Standby.`);
    if(r.kind==='BD' && (!r.bdcat || !r.bdreason)) errs.push(`Event #${i+1} (${r.unit}): pilih Kategori & Reason Breakdown.`);
    /* Cross-module: event ini tidak boleh overlap jam manapun di mana unitnya sudah dipakai Production
       (Unit Status Engine, sama seperti cek di diValidate untuk arah sebaliknya). */
    diHours().forEach(h=>{ if(diSbEventCoversHour(r,h) && (diUnitsInProduction(h).has(r.unit) || diUnitsInSupport(h).has(r.unit)))
      errs.push(`Event #${i+1} (${r.unit}): bentrok dengan input per jam (Production/Support) jam ${diHourLabel(h)} — unit ini sudah punya isian di jam tersebut.`); });
  });
  if(diSbOverlapSet().size) errs.push('Ada event yang waktunya bentrok untuk unit yang sama (ditandai merah) — perbaiki dulu.');
  if(errs.length){ showToast(errs[0] + (errs.length>1 ? ` (+${errs.length-1} error lain)` : ''), 'error'); diPaint(); return; }
  try{
    let queued = false;
    const keepIds = new Set(DI.sb.filter(r=>r.status_id).map(r=>r.status_id));
    const removed = (DI.sbOrigIds||[]).filter(id=>!keepIds.has(id));
    if(removed.length){ const r = await OfflineEngine.bulkDelete('unit_status_actual','status_id',removed); if(r && r.error) throw new Error(r.error.message||String(r.error)); if(r && r.queued) queued = true; }
    for(const row of DI.sb){
      const payload = {
        status_date:DI.date, shift_code:DI.shift, unit_code:row.unit, fleet_code:null,
        status: row.kind==='BD' ? 'Breakdown' : 'Standby',
        category: row.kind==='BD' ? row.bdcat : row.cat,
        sub_reason: row.kind==='BD' ? row.bdreason : row.reason,
        start_time: row.start+':00', end_time: row.end+':00',
        duration_hours: diSbDurHours(row.start,row.end), hour_label:null, data_source:'DAILY_INPUT_EVENT'
      };
      let r;
      if(row.status_id) r = await OfflineEngine.update('unit_status_actual', payload, 'status_id', row.status_id);
      else r = await OfflineEngine.insert('unit_status_actual', payload);
      if(r && r.error) throw new Error(r.error.message || String(r.error));
      if(r && r.queued) queued = true;
    }
    // [NO LOCATION 2026-09] Keputusan user: unit yang sampai saat Simpan masih NL (tidak ada event
    // Standby/Idle/Delay/BD di sini, TIDAK dikonfirmasi Working via tap 'W', dan TIDAK terkunci oleh
    // Production/Support di jam manapun shift ini) HARUS tetap punya baris status di Supabase — bukan
    // dibiarkan tanpa record sama sekali. Ditulis sebagai status='No Location', data_source='NO_LOCATION_AUTO'.
    // Tidak pernah menimpa data lain: hanya menyentuh unit yang benar-benar tidak punya record apa pun
    // untuk (status_date, shift_code, unit_code) ini, dan mengecek dulu apakah baris 'No Location' lama
    // sudah ada (update, bukan insert dobel) sebelum menulis.
    try{
      const lockedMap0 = diSbLockedUnits(-1);
      const nlUnits = diSbUnitList().filter(o=>{
        if(diSbGroupIdx(o.value).length) return false;          // sudah punya event Standby/Idle/Delay/BD
        if(DI.sbConfirmedW.has(o.value)) return false;           // dikonfirmasi manual sebagai Working
        if(lockedMap0[o.value]) return false;                    // sudah punya isian Production/Support
        return true;
      });
      for(const o of nlUnits){
        let existingId = null;
        if(!OfflineEngine.isOffline()){
          const { data: exist } = await sb.from('unit_status_actual').select('status_id')
            .eq('status_date', DI.date).eq('shift_code', DI.shift).eq('unit_code', o.value)
            .eq('status', 'No Location').maybeSingle();
          existingId = exist ? exist.status_id : null;
        }
        const shiftDef = (ADMIN_LOOKUP_CACHE.shift||[]).find(s=>s.value===DI.shift) || {};
        const nlPayload = { status_date:DI.date, shift_code:DI.shift, unit_code:o.value, fleet_code:null,
          status:'No Location', category:'Data belum tersedia', sub_reason:'Belum diinput di Daily Input',
          start_time:(shiftDef.start_time||'00:00:00'), end_time:(shiftDef.end_time||'00:00:00'),
          duration_hours:SHIFT_HOURS_BY_CODE[DI.shift]||0, hour_label:null, data_source:'NO_LOCATION_AUTO' };
        if(existingId) await OfflineEngine.update('unit_status_actual', nlPayload, 'status_id', existingId);
        else await OfflineEngine.insert('unit_status_actual', nlPayload);
      }
    }catch(e){ console.warn('[DailyInput] Gagal menulis No Location:', e); }
    const mirrored = await diSbClearMirrors();
    if(mirrored){
      const idlRows = DI.sb.filter(r=>r.kind==='SB' && r.cat==='Idle' && r.reason).map(r=>({ event_date:DI.date, shift_code:DI.shift, scope:'UNIT', fleet_code:null, unit_code:r.unit, idle_code:r.reason, duration_hours:diSbDurHours(r.start,r.end), hour_label:null }));
      const dlRows  = DI.sb.filter(r=>r.kind==='SB' && r.cat==='Delay' && r.reason).map(r=>({ event_date:DI.date, shift_code:DI.shift, fleet_code:null, unit_code:r.unit, delay_code:r.reason, duration_hours:diSbDurHours(r.start,r.end), hour_label:null }));
      if(idlRows.length) await OfflineEngine.bulkInsert('idle_events', idlRows);
      if(dlRows.length) await OfflineEngine.bulkInsert('delay_events', dlRows);
    }
    showToast(queued ? '📥 Standby/BD disimpan offline — masuk Pending Sync.' : ('✅ Standby/BD tersimpan ke Supabase.' + (mirrored ? '' : ' (mirror idle/delay dilewati — lagi offline)')), queued ? 'info' : 'success');
    if(!queued) await diLoadShift(undefined, ['roster','wx','fuel','hm']);
  }catch(err){ showToast('Gagal menyimpan Standby/BD: '+err.message, 'error'); }
}

function diPaint(){
  const el = DI.el; if(!el) return;
  const hs = diHours(), filled = hs.filter(diIsFilled).length;
  const tabs = [['jam','🕐 Jam'],['sup','🛠️ Support'],['sb','🔧 Standby/BD'],['cuaca','🌧️ Cuaca'],['hm','HM'],['fuel','⛽ Fuel']];
  el.innerHTML = `<div class="glass p-4 md:p-5">
    <div class="di-top">
      <div class="flex gap-2 items-center flex-wrap">
        <input type="date" class="adm-input" style="width:auto" value="${esc(DI.date)}" onchange="diChangeCtx('date',this.value)">
        <div class="di-seg">${(ADMIN_LOOKUP_CACHE.shift||[]).map(s=>`<button class="${s.value===DI.shift?'on':''}" onclick="diChangeCtx('shift','${esc(s.value)}')">${esc(s.label)}</button>`).join('')}</div>
      </div>
      <div class="di-prog"><b>${filled}</b> / ${hs.length} jam terisi</div>
    </div>
    <div id="diShiftTl">${diShiftTimeline()}</div>
    ${(DI.loading || DI.loadErr) ? '' : diCompletenessBanner()}
    ${DI.loading ? `<div class="di-alert warn" id="diLoadBanner">${diLoadText()}</div>` : ''}${(!DI.loading && DI.loadErr) ? diLoadErrHtml() : ''}${diCapsBanner()}
    <div class="di-tl-legend"><span><i class="lg-done"></i>Sudah diisi</span><span><i class="lg-active"></i>Sedang aktif</span><span><i class="lg-dirty"></i>Ada perubahan</span><span><i class="lg-empty"></i>Belum diisi</span></div>
    <div class="di-tl">${hs.map(diSlot).join('')}</div>
    <div class="di-tabs">${tabs.map(([k,l])=>`<button class="${DI.tab===k?'on':''}" onclick="diSwitchTab('${k}')">${l}</button>`).join('')}</div>
    <div id="diBody"></div><div id="diIssues"></div>
    <div class="di-footer" id="diFoot"></div></div>`;
  diPaintBody();
}
function diPaintBody(){ diPaintBody_impl(); diSyncSaveButtons(); }
function diPaintBody_impl(){
  const body = document.getElementById('diBody'), foot = document.getElementById('diFoot'); if(!body) return;
  const h = DI.hour;
  if(DI.tab==='jam'){
    // [UI 2026-09 MEAL/CHANGE-SHIFT GATE] cek dulu — berlaku semua tanggal, tanpa syarat kuota.
    // [FIX 2026-09 v2] Sebelumnya jam ini di-blank total (unit hilang dari UI & tidak pernah tersimpan
    // ke Supabase). Sekarang unit tetap dirender normal (diApplyBreakAuto sudah memaksa semua segmen jadi
    // Delay+kode di atas) supaya user bisa lihat & Simpan seperti jam biasa — tidak ada jalur simpan baru.
    const brk = diBreakInfo(h);
    // [UI 2026-11 FIX] Meal & Rest bukan hard lock — banner sekarang menjelaskan default, bukan klaim
    // "tidak bisa diedit manual" (klaim itu dulu benar krn bug; sekarang operator BISA isi ritase dan
    // unit otomatis jadi Working+OT, lihat diApplyBreakAuto).
    const brkBanner = brk ? `<div class="di-alert warn">🍽️ <b>${brk.label}</b> — default: seluruh unit Production &amp; Support otomatis Delay (${brk.code}). Jika unit ini benar-benar tetap bekerja, isi ritase seperti biasa — status otomatis berubah jadi Working (tercatat sebagai OT).</div>` : '';
    // [UI 2026-09/11 WORK-END/CHANGE-SHIFT] jam 17:00(D)/05:00(N) = Work End (BUKAN Delay apa pun,
    // BUKAN D05); jam 18:00(D)/06:00(N) = Change Shift (default D05). Unit tetap bisa diisi ritase
    // seperti biasa — diApplyBreakAuto menangani Working vs default di belakang layar.
    const we = diWorkEndInfo(h);
    const weBanner = we ? (we.isWorkEnd
      ? `<div class="di-alert" style="background:#3B82F622;border-color:#3B82F6;color:#1D4ED8">🕐 <b>WORK END</b> — Shift selesai / unit selesai bekerja (akhir shift normal, bukan loss; tidak wajib diisi). Ini BUKAN Idle/Delay/BD/Standby loss: aktivitas aktual per unit tetap tampil (Working/Delay/Idle/Standby/Breakdown); unit Production tanpa aktivitas apa pun dibiarkan kosong (Actual belum diisi), tidak otomatis dianggap Delay maupun Working. Jika unit tetap bekerja, isi ritase — otomatis tercatat sebagai OT.</div>`
      : `<div class="di-alert" style="background:#3B82F622;border-color:#3B82F6;color:#1D4ED8">🕐 <b>CHANGE SHIFT</b> — pergantian shift. Aktivitas aktual per unit tetap tampil; unit Production tanpa aktivitas apa pun otomatis Delay Change Shift (D05). Jika unit tetap bekerja, isi ritase — otomatis Working (tercatat sebagai OT).</div>`
    ) : '';
    // [UI 2026-11 OT] Info jam OT (bukan gate/lock apa pun — OT tidak dibatasi jumlah occurrence).
    const isOtHour = (brk!=null) || (we!=null); // 12-13, 17-18, 18-19 (D) / 00-01, 05-06, 06-07 (N)
    const otHoursToday = isOtHour ? diOtHoursFor(DI.shift) : 0;
    const otInfoBanner = isOtHour ? `<div class="di-alert" style="background:#F59E0B22;border-color:#F59E0B;color:#B45309">⏱️ <b>Checkpoint OT</b> — unit Working di jam ini dihitung sebagai overtime. Total OT tercatat (ot_events) untuk shift ${esc(DI.shift)} tanggal ini: <b>${U.fmt(otHoursToday,2)} jam</b>. Tidak ada batas jumlah kejadian OT.</div>` : '';
    const f = diForm();
    if(!f){ body.innerHTML = ''; return; }
    const fleetsToShow = f.fleets;
    body.innerHTML = `<div class="di-hh"><b>${String(h).padStart(2,'0')}:00 – ${String((h+1)%24).padStart(2,'0')}:00</b>
        <span class="di-sub">${diIsFilled(h) ? 'Tersimpan di Supabase' : 'Belum tersimpan'}</span><span class="di-sub" id="diTot"></span></div>${brkBanner}${weBanner}${otInfoBanner}
      ${fleetsToShow.map(diFleetCard).join('')}${(()=>{
        if(brk || fleetsToShow.length>0) return '';
        const n = diUnassignedProdUnits().length;
        return n>0
          ? `<button class="di-add big" onclick="diAdd('fleets','fleet')">+ Tambah Fleet</button>`
          : `<button class="di-add big" disabled title="Semua unit Production aktif sudah ter-assign pada tanggal/shift ini" style="opacity:.45;cursor:not-allowed">+ Tambah Fleet (semua unit sudah ter-assign)</button>`;
      })()}</div>`;
    foot.innerHTML = `<button class="btn" onclick="diCopyPrev()">↻ Salin dari jam sebelumnya</button>
      <button class="btn btn-accent" onclick="diSave()">Simpan &amp; Lanjut →</button>`;
  } else if(DI.tab==='sup'){
    // [UI 2026-09 MEAL/CHANGE-SHIFT GATE] berlaku semua tanggal, tanpa syarat kuota.
    // [FIX 2026-09 v2] Unit Support tetap dirender normal (bukan blank) — diApplyBreakAuto sudah memaksa
    // seluruh unit Support jadi Delay+kode di f.support, jadi tinggal ditampilkan seperti jam biasa.
    const brkSup = diBreakInfo(h);
    const brkBannerSup = brkSup ? `<div class="di-alert warn">🍽️ <b>${brkSup.label}</b> — default: seluruh unit Support otomatis Delay (${brkSup.code}). Jika unit tetap bekerja, ubah status manual jadi Working — tercatat sebagai OT.</div>` : '';
    // Jam Work End/Change Shift (17/18 D, 05/06 N): Support TIDAK dipaksa Delay — aktivitas aktualnya
    // (Working/Delay/Idle/SB/BD) direkonstruksi apa adanya oleh diSupportResync() di bawah. Banner ini
    // hanya informasi, tidak mengubah data.
    const weSup = diWorkEndInfo(h);
    const weBannerSup = weSup ? `<div class="di-alert" style="background:#3B82F622;border-color:#3B82F6;color:#1D4ED8">🕐 <b>${weSup.isChangeShift ? 'CHANGE SHIFT' : 'WORK END'}</b> — aktivitas aktual unit Support tetap tampil apa adanya jam ini${weSup.isWorkEnd ? ' (bukan Delay apa pun jika belum ada aktivitas)' : ''}.</div>` : '';
    // [UI 2026-11 OT] Info jam OT untuk Support — TIDAK ADA lagi pembatasan "hanya EXCA 41" maupun
    // kuota 2/bulan. Semua unit Support boleh OT di checkpoint manapun, tanpa batas occurrence.
    const isOtHourSup = (brkSup!=null) || (weSup!=null);
    const otBannerSup = isOtHourSup ? `<div class="di-alert" style="background:#F59E0B22;border-color:#F59E0B;color:#B45309">⏱️ <b>Checkpoint OT</b> — unit Support Working di jam ini dihitung sebagai overtime. Total OT tercatat (ot_events) shift ${esc(DI.shift)} tanggal ini: <b>${U.fmt(diOtHoursFor(DI.shift),2)} jam</b>. Tidak ada batas jumlah kejadian maupun pembatasan unit tertentu.</div>` : '';
    const f = diForm();
    if(!f){ body.innerHTML = ''; return; }
    diSupportResync(h);
    diSupportFillOperators(h);   // [FIX 2026-12] operator continuity utk baris yang baru ditambah resync / belum punya operator
    let units = diOptSupportUnits(), sc = diSupportSummary(f.support||[], units.length);
    // [FIX 2026-09 AUDIT v3] Unit Support yang statusnya Standby/Breakdown SUDAH tampil & bisa diedit
    // di tab Standby/BD (DI.sb, event level-shift) — sesuai desain aslinya. Jangan ditampilkan LAGI di
    // tab Support (dobel), dan jangan dicap "Unknown" juga — itu bukan belum diinput, cuma tempat
    // input-nya di tab lain. Hanya unit yang BENAR-BENAR tidak ada datanya di mana pun (bukan di
    // f.support, bukan juga di DI.sb) yang tetap dianggap perlu perhatian di sini.
    const sbUnits = new Set((DI.sb||[]).map(x=>x.unit));
    const attention = units.filter(o=>{
      if(sbUnits.has(o.value)) return false;
      const row = (f.support||[]).find(s=>s.unit===o.value); return !row || row.s!=='W';
    });
    const inSbCount = units.filter(o=> sbUnits.has(o.value)).length;
    const _weHour = diIsWorkEndHour(h);
    const unknownCount = _weHour ? 0 : units.filter(o=> !sbUnits.has(o.value) && !(f.support||[]).some(s=>s.unit===o.value)).length;   // Work End: tidak ada "Unknown"
    const weTotal = _weHour ? units.filter(o=> !sbUnits.has(o.value) && !(f.support||[]).some(s=>s.unit===o.value) && diSupportContinuityUnits(h).has(o.value)).length : 0;
    // [UI 2026-09 +UNIT] Daftar utama sekarang HANYA unit yang sudah "aktif" jam ini — sudah punya baris
    // di f.support (W/I/D/SB/BD, dari input atau hasil diSupportResync), ATAU baru saja ditambah manual
    // lewat "+ Unit" (DI.supExtra, UI-only). Unit yang statusnya sudah tercatat di tab Standby/BD tetap
    // dikecualikan total (sesuai desain sebelumnya). Sisa unit (belum aktif jam ini & bukan di Standby/BD)
    // dipindah ke panel "+ Unit" — TIDAK hilang, cuma tidak memenuhi layar secara default.
    const activeCodes = new Set((f.support||[]).map(s=>s.unit));
    // [FIX 2026-12 WORK END] jam Work End: unit dari continuity jam sebelum/sesudah ikut tampil walau tanpa event.
    const weCont = diIsWorkEndHour(h) ? diSupportContinuityUnits(h) : new Set();
    const shown = units.filter(o=> !sbUnits.has(o.value) && (activeCodes.has(o.value) || DI.supExtra.has(o.value) || weCont.has(o.value)));
    const remaining = units.filter(o=> !sbUnits.has(o.value) && !activeCodes.has(o.value) && !DI.supExtra.has(o.value) && !weCont.has(o.value));
    // Reason "tidak tersedia" HANYA dari data/logic yang memang sudah ada (diLockedSupportUnits — sama
    // fungsi yang mengunci dropdown Fleet/Standby/Support lain jam ini). Tidak ada reason karangan.
    const lockedMap = diLockedSupportUnits(null);
    const availCount = remaining.filter(o=> !lockedMap[o.value]).length;
    const allCards = shown.map(o=> diSupportUnitCard(o,f)).join('');
    const pickerHtml = !DI.supPicker ? '' : `<div class="di-pick-panel">
        <div class="di-pick-h">Pilih unit untuk ditambahkan<button class="di-x" title="Tutup" onclick="DI.supPicker=false;diPaintBody();">✕</button></div>
        ${remaining.length ? remaining.map(o=>{ const why = lockedMap[o.value];
            return why
              ? `<div class="di-pick-row off"><span>${esc(o.label)}${o.unit_role_code?` <i>${esc(o.unit_role_code)}</i>`:''}</span><span class="di-pick-reason">Tidak tersedia — ${esc(why)}</span></div>`
              : `<div class="di-pick-row" onclick="diSupAddUnit('${esc(o.value)}')"><span>${esc(o.label)}${o.unit_role_code?` <i>${esc(o.unit_role_code)}</i>`:''}</span><span class="di-pick-add">+ Pilih</span></div>`;
          }).join('') : '<div class="di-pick-empty">Semua unit Support sudah ditampilkan.</div>'}
      </div>`;
    body.innerHTML = `<div class="di-hh"><b>${String(h).padStart(2,'0')}:00 – ${String((h+1)%24).padStart(2,'0')}:00</b>
        <span class="di-sub">Equipment Support — bukan production (tanpa ritase/payload/material/fleet)</span></div>${brkBannerSup}${weBannerSup}${otBannerSup}
      <div class="di-sum-bar">
        <div class="di-sum-title">SUPPORT</div><div class="di-sum-count">${units.length} Units</div>
        ${_weHour ? `<span class="di-sum-dot" style="background:#64748B"></span><span class="di-sum-count">${weTotal} WORK END / N/A (non-production)</span>` : ''}
        ${(!_weHour || sc.W>0) ? `<span class="di-sum-dot" style="background:var(--success)"></span><span class="di-sum-count">${sc.W} Working</span>` : ''}
        ${(!_weHour || sc.I>0) ? `<span class="di-sum-dot" style="background:var(--warning)"></span><span class="di-sum-count">${sc.I} Idle</span>` : ''}
        ${(!_weHour || sc.D>0) ? `<span class="di-sum-dot" style="background:#F97316"></span><span class="di-sum-count">${sc.D} Delay</span>` : ''}
        ${inSbCount>0 ? `<span class="di-sum-dot" style="background:#94A3B8"></span><span class="di-sum-count">${inSbCount} di tab Standby/BD</span>`:''}
        ${unknownCount>0 ? `<span class="di-sum-dot" style="background:#EF4444"></span><span class="di-sum-count">⚠ ${unknownCount} Unknown</span>`:''}
      </div>
      ${allCards || '<div class="di-attn-empty">Belum ada unit aktif jam ini — tap + Unit untuk menambahkan.</div>'}
      <button class="di-add big" onclick="DI.supPicker=!DI.supPicker;diPaintBody();">${DI.supPicker?'✕ Tutup':'+ Unit'}${remaining.length?` (${availCount} tersedia)`:''}</button>
      ${pickerHtml}</div>`;
    foot.innerHTML = `<span></span><button class="btn btn-accent" onclick="diSave()">Simpan &amp; Lanjut →</button>`;
  } else if(DI.tab==='sb'){
    body.innerHTML = diSbCard();
    foot.innerHTML = '';
  } else if(DI.tab==='cuaca'){
    const WX_LABEL = {I01:'Rain', I02:'Slippery', I03:'Fog'};
    body.innerHTML = `<div class="text-xs mb-3" style="color:var(--text-dim)">Berlaku site-wide (scope GLOBAL) untuk shift ini. Setiap event disimpan sebagai 1 baris idle_events (I01/I02/I03) dengan Start/End sendiri — boleh lebih dari 1 event per shift. Slot jam &amp; equipment yang terdampak dihitung otomatis di bawah tiap event (tidak perlu input Idle manual per unit). weather_daily dihitung otomatis dari total jam seluruh event.</div>
      ${DI.wxEvents.map((e,i)=>{
        const legacy = !e.start && !e.end && e.hours>0;
        const slots = legacy ? [] : diWeatherSlots(e.start, e.end);
        const summary = diWeatherAffectedSummary(e.code);
        return `<div class="di-card">
          <div class="di-grid4">
            <select class="adm-select" onchange="diSetWxEvent(${i},'code',this.value,true)">${Object.entries(WX_LABEL).map(([c,l])=>`<option value="${c}" ${c===e.code?'selected':''}>${l} (${c})</option>`).join('')}</select>
            <input class="adm-input" type="time" value="${esc(e.start)}" oninput="diSetWxEvent(${i},'start',this.value)">
            <input class="adm-input" type="time" value="${esc(e.end)}" oninput="diSetWxEvent(${i},'end',this.value)">
            ${e.code==='I01' ? `<input class="adm-input" type="number" min="0" step="0.1" placeholder="Rainfall (mm)" value="${esc(e.rainfall_mm)}" oninput="diSetWxEvent(${i},'rainfall_mm',this.value)">` : '<span></span>'}
          </div>
          <div class="text-xs mt-2" style="color:var(--text-dim)">
            ${legacy ? `⚠️ Baris lama (jam agregat ${U.fmtExact(e.hours,1)} jam, tanpa Start/End) — isi Start/End di atas untuk mengaktifkan pemetaan slot otomatis.`
              : `Slot terdampak: <b>${slots.map(h=>String(h).padStart(2,'0')+'–'+String((h+1)%24).padStart(2,'0')).join(', ')||'-'}</b> (${U.fmtExact(diSbDurHours(e.start,e.end),1)} jam)`}
            <br>Equipment terdampak (dari master weather_equipment_rules): <b>${summary ? summary.join('; ') : '⚠️ NEEDS BUSINESS CONFIRMATION — belum ada rule untuk '+WX_LABEL[e.code]}</b>
          </div>
          <button class="di-x" title="Hapus" onclick="diDelWxEvent(${i})">✕ Hapus</button></div>`;
      }).join('') || '<div class="text-xs" style="color:var(--text-dim)">Belum ada event cuaca untuk shift ini.</div>'}
      <button class="di-add big" onclick="diAddWxEvent()">+ Tambah Event Cuaca</button>`;
    foot.innerHTML = `<span></span><button class="btn btn-accent" onclick="diSaveWxEvents()">Simpan Cuaca</button>`;
  } else if(DI.tab==='hm'){
    // [UI 2026-09 COMPACT] Hanya unit Working yang ditampilkan (lihat diWorkingUnits()) — sama
    // seperti sebelumnya baris non-working di-skip, cuma sekarang tidak dirender sama sekali
    // (dulu tetap dirender disabled/abu-abu). Tidak ada perubahan pada diSaveHm/diHmValues/logic Working.
    const wu = diWorkingUnits();
    const needCount = wu.filter(u=>{ const {awal,isInitial} = diHmValues(u.value); return isInitial && awal===''; }).length;
    body.innerHTML = `<div class="di-sum-bar">
        <div class="di-sum-title">HM</div><div class="di-sum-count">${wu.length} Unit Working</div>
        ${needCount>0 ? `<span class="di-sum-dot" style="background:var(--warning)"></span><span class="di-sum-count">⚠ ${needCount} butuh Initial HM</span>` : ''}
      </div>
      <div class="text-xs mb-2" style="color:var(--text-dim)">Jam Operasi otomatis dari status Working. HM Akhir = Awal + Jam Operasi (bisa dikoreksi manual).</div>
      ${wu.length ? wu.map(u=>diHmRow(u.value)).join('') : '<div class="text-xs" style="color:var(--text-dim)">Belum ada unit Working di shift/jam ini.</div>'}`;
    foot.innerHTML = `<span></span><button class="btn btn-accent" onclick="diSaveHm()">Simpan HM</button>`;
  } else {
    // [UI 2026-09 COMPACT] Fuel — satu baris tipis per unit, total live di atas. Unit relevan tetap
    // diOptUnits() (logic sama persis, tidak diubah), hanya render-nya yang dipadatkan.
    const fu = diOptUnits();
    const totalLiter = fu.reduce((s,u)=> s + diN((DI.fuel[u.value]||{}).liter), 0);
    const filledCount = fu.filter(u=> diN((DI.fuel[u.value]||{}).liter) > 0 || DI.fuelDb[u.value]).length;
    body.innerHTML = `<div class="di-sum-bar">
        <div class="di-sum-title">FUEL</div><div class="di-sum-count">${fu.length} Unit</div>
        <span class="di-sum-dot" style="background:var(--success)"></span><span class="di-sum-count" id="diFuelFilled">${filledCount} Sudah Diisi</span>
        <span style="margin-left:auto;font-weight:700" id="diFuelTotal">${U.fmtExact(totalLiter,1)} L Total</span>
      </div>
      <div class="di-fuel2-list">${fu.map(u=>{ const v = DI.fuel[u.value]||{}, liter = v.liter ?? '', filled = diN(liter) > 0 || (DI.fuelDb[u.value] && liter==='');
        return `<div class="di-fuel2-row">
          <b class="di-fuel2-name">${esc(u.value)}</b>
          <input class="adm-input di-fuel2-in" type="number" min="0" step="any" inputmode="decimal" placeholder="Fuel (L)" value="${esc(liter)}" oninput="(DI.fuel['${esc(u.value)}']=DI.fuel['${esc(u.value)}']||{}).liter=this.value;diMeta2Fuel();" data-fu="${esc(u.value)}">
          <span class="di-fuel2-dot${filled?' on':''}" id="diFuelDot_${esc(u.value)}" title="${filled?'Sudah diisi':'Belum diisi'}"></span>
        </div>`; }).join('')}</div>`;
    foot.innerHTML = `<span></span><button class="btn btn-accent" onclick="diSaveFuel()">Simpan Fuel</button>`;
  }
  diMeta();
}
/* Validasi & total live tanpa render ulang (fokus input tidak hilang) */
function diMeta(){
  const box = document.getElementById('diIssues'); if(!box) return;
  if(DI.tab!=='jam' && DI.tab!=='sup'){ box.innerHTML = ''; return; }
  const f = diForm(), tot = document.getElementById('diTot');
  if(f && tot){ const t = diTotals(f); tot.textContent = `${U.fmtExact(t.rit,0)} rit · ${U.fmtExact(t.vol,1)} vol`; }
  box.innerHTML = diValidate(DI.hour).map(i=>`<div class="di-alert ${i.l==='err'?'err':'warn'}">${i.l==='err'?'⛔':'⚠️'} ${esc(i.m)}</div>`).join('');
}
/* [UI 2026-09 COMPACT] Update total Fuel & indikator terisi live tanpa render ulang tab (biar fokus
   input operator tidak hilang saat mengetik). Murni tampilan — tidak menyentuh DI.fuel/diSaveFuel. */
function diMeta2Fuel(){
  if(DI.tab!=='fuel') return;
  const fu = diOptUnits();
  const totalLiter = fu.reduce((s,u)=> s + diN((DI.fuel[u.value]||{}).liter), 0);
  const totalEl = document.getElementById('diFuelTotal'); if(totalEl) totalEl.textContent = `${U.fmtExact(totalLiter,1)} L Total`;
  let filledCount = 0;
  fu.forEach(u=>{ const liter = (DI.fuel[u.value]||{}).liter ?? ''; const filled = diN(liter) > 0 || (DI.fuelDb[u.value] && liter==='');
    if(filled) filledCount++;
    const dot = document.getElementById('diFuelDot_'+u.value); if(dot) dot.classList.toggle('on', filled); });
  const filledEl = document.getElementById('diFuelFilled'); if(filledEl) filledEl.textContent = `${filledCount} Sudah Diisi`;
}


/* ============================================================================
   ANALYTICS — TAHAP 3 (Operational Analytics & Performance Intelligence)
   Murni layer presentasi/derivasi dari data existing. TIDAK ada query/tabel/kolom baru, TIDAK ada formula
   baru: PA/UA = computePAUA(), Standby = getUnifiedStandbyHours(), Fuel Ratio = computeFuelRatios(),
   Actual/Plan = production_actual/plan_daily_generated (Mine Plan) apa adanya, filter = getFiltered*() existing.
   Halaman existing tidak ditulis ulang: setiap render_* dibungkus — bagian baru (Tier A/B) ditaruh di atas,
   chart/KPI lama tetap di bawah heading "Detail & Chart Existing" (Tier C).
   Metrik yang TIDAK valid dari data existing tidak ditampilkan (MTTR/MTBF, Start/End event, loss BCM akibat
   hujan, delay/idle per operator) — diganti catatan limitation. SUPABASE IMPACT: NONE.
   ============================================================================ */
const AX = { stream:'OB', trend:'date', paBy:'site', eqFleet:'all', unitFocus:null };
const axKey = s=> s==='OB'?'OB_PRODUCTION':'CO_PRODUCTION';
const axUL = s=> s==='OB'?'BCM':'Ton';
const axMob = ()=> (typeof window!=='undefined' && window.innerWidth<768);
const axIso = d=> d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
const axQ = v=> esc(JSON.stringify(v));
const axNum = (v,d=0)=> (v==null||isNaN(v))?'—':U.fmt(v,d);
const axPct = v=> v==null?'—':U.fmt(v,1)+'%';
function axDates(){ return memoFiltered('axDates', ()=> [...new Set([...getFiltered().map(r=>r.date), ...getFilteredUnitStatus().map(s=>s.date)])].sort()); }
function axBucket(){ const ds=axDates(), big=ds.length>62; const keyOf=d=> big?d.slice(0,7):d; return { keyOf, labels:[...new Set(ds.map(keyOf))], big }; }
function axOpts(cb, mod){ const o=baseOpts(); o.plugins.tooltip.callbacks=Object.assign({ label:c=>{ const v=c.chart.options.indexAxis==='y'?c.parsed.x:c.parsed.y; return ` ${c.dataset.label}: ${v==null?'—':U.fmt(v,1)}`; } }, cb||{}); if(mod) mod(o); return o; }
function axMsg(){ return (getFilteredUnitStatus().length||getFiltered().length) ? 'No recorded event pada filter ini.' : 'Insufficient data — belum ada data pada filter ini.'; }

/* ---- periode sebelumnya yang SETARA (sama panjang, tidak melewati data terakhir) ---- */
function axPrev(){
  if(filters.month==='all') return null;
  const y=Number(filters.year)||YEAR, m=Number(filters.month), dim=new Date(y,m+1,0).getDate();
  const s=filters.dayStart==='all'?1:Number(filters.dayStart), e=filters.dayEnd==='all'?dim:Math.min(Number(filters.dayEnd),dim);
  if(e<s) return null;
  const from=new Date(y,m,s); let to=new Date(y,m,e), partial=false;
  const ds=axDates(), latest=ds[ds.length-1];
  if(latest){ const lt=new Date(latest+'T00:00:00'); if(lt<from) return null; if(lt<to){ to=lt; partial=true; } }
  const len=Math.round((to-from)/86400000)+1;
  return { from:axIso(from), to:axIso(to), pFrom:axIso(new Date(y,m,s-len)), pTo:axIso(new Date(y,m,s-1)), len, partial };
}
function axRange(a,b){
  const inR=d=> d>=a && d<=b, sh=r=> filters.shift==='all'||r.shift===filters.shift, fl=r=> filters.fleet==='all'||r.fleet===filters.fleet;
  return { rec:RECORDS.filter(r=>inR(r.date)&&sh(r)&&fl(r)&&(filters.pit==='all'||r.pit===filters.pit)),
    plan:MINE_PLAN.filter(r=>inR(r.date)&&sh(r)&&fl(r)), st:UNIT_STATUS.filter(r=>inR(r.date)&&sh(r)&&fl(r)),
    dl:DELAY_EVENTS.filter(r=>inR(r.date)&&sh(r)&&fl(r)), idl:IDLE_EVENTS.filter(r=>inR(r.date)&&sh(r)&&fl(r)),
    fuel:FUEL_ACTUAL.filter(r=>inR(r.date)&&sh(r)&&fl(r)&&(filters.unit==='all'||r.unit===filters.unit)) };
}
const axCurR = ()=> ({ rec:getFiltered(), plan:getFilteredPlan(), st:getFilteredUnitStatus(), dl:getFilteredDelay(), idl:getFilteredIdle(), fuel:getFilteredFuel() });
function axMetrics(R){
  const sm=(rows,k,key)=>U.sum(rows.filter(r=>r.stream===key),k);
  const ob=sm(R.rec,'productionVolume','OB_PRODUCTION'), obp=sm(R.plan,'targetVolume','OB_PRODUCTION');
  const co=sm(R.rec,'productionVolume','CO_PRODUCTION'), cop=sm(R.plan,'targetVolume','CO_PRODUCTION');
  const pu=computePAUA(R.st,R.dl,R.idl), fr=computeFuelRatios(R.fuel||[],R.rec);
  return { ob,obp,co,cop, obAch:obp?ob/obp*100:null, coAch:cop?co/cop*100:null,
    pa:pu.scheduled?pu.pa:null, ua:pu.available?pu.ua:null, delay:U.sum(R.dl,'hours'), idle:U.sum(R.idl.filter(i=>i.scope==='UNIT'),'hours'),
    bd:pu.breakdown, fuelOB:fr.ob.vol?fr.ob.ratio:null, fuelCO:fr.coal.vol?fr.coal.ratio:null, fuel:U.sum(R.fuel||[],'fuelLiters'),
    has:(R.rec.length+R.st.length+R.dl.length+R.idl.length)>0 };
}
/* defs: [label,key,digits,unit,isPoints] */
function axCompare(defs){
  const pr=axPrev();
  if(!pr) return `<div class="ax-cmp"><div class="ov-note">Perbandingan periode: pilih Bulan (dan rentang tanggal) untuk dibandingkan dengan periode sebelumnya yang setara panjangnya.</div></div>`;
  const PM=axMetrics(axRange(pr.pFrom,pr.pTo)), CM=axMetrics(axCurR());
  const head=`<div class="ov-note"><b>Current vs Previous Period</b> — ${pr.from} → ${pr.to} vs ${pr.pFrom} → ${pr.pTo} (${pr.len} hari${pr.partial?'; periode berjalan belum lengkap, pembanding dipotong sama panjang':''})</div>`;
  if(!PM.has) return `<div class="ax-cmp">${head}<div class="ov-note">Insufficient data — periode sebelumnya belum memiliki data.</div></div>`;
  const cell=([l,k,d,u,pts])=>{ const c=CM[k], p=PM[k]; let dl='—';
    if(c!=null&&p!=null){ const df=c-p; dl=(df>0?'+':df<0?'−':'')+U.fmt(Math.abs(df),d)+(pts?' pt':' '+u)+(!pts&&p?` (${df>0?'+':df<0?'−':''}${U.fmt(Math.abs(df/p*100),1)}%)`:''); }
    return `<div><label>${l}</label><b>${axNum(c,d)}${u&&pts?'%':''}</b><span>prev ${axNum(p,d)}${pts?'%':''} • Δ ${dl}</span></div>`; };
  return `<div class="ax-cmp">${head}<div class="ax-cmp-g">${defs.map(cell).join('')}</div></div>`;
}
function axScopeBar(scope, excType){
  const ds=axDates(), per=ds.length?(ds[0]===ds[ds.length-1]?ds[0]:ds[0]+' → '+ds[ds.length-1]):'-';
  return `<div class="ax-bar"><span>Periode <b>${esc(per)}</b></span><span>Shift <b>${esc(filters.shift==='all'?'Semua':filters.shift)}</b></span><span>Fleet <b>${esc(filters.fleet==='all'?'Semua':filters.fleet)}</b></span><span>Scope <b>${esc(scope)}</b></span><span class="sp"></span>${excType?`<button class="ov-link" onclick="axViewExc('${excType}')">View Exceptions ›</button>`:''}</div>`;
}
const axPanel=(title,scope,id,h,extra)=>`<div class="ov-panel"><div class="ov-panel-h"><div><div class="panel-title">${title}</div><div class="ov-note">Scope: ${esc(scope)}</div></div>${extra||''}</div><div style="height:${h||260}px"><canvas id="${id}"></canvas></div></div>`;
const axFold=(title,inner,openDesktop)=>`<details class="ax-fold" ${openDesktop&&!axMob()?'open':''}><summary>${title}</summary>${inner}</details>`;
const axSeg=(cur,opts,fn)=>`<div class="ov-seg">${opts.map(([v,l])=>`<button class="${cur===v?'on':''}" onclick="${fn}('${v}')">${l}</button>`).join('')}</div>`;
const axTbl=(head,rows,msg)=>`<div class="ax-tbl-wrap"><table class="ov-tbl"><thead><tr>${head.map(h=>`<th${h[1]?' class="r"':''}>${h[0]}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan="${head.length}" class="ov-note">${msg||axMsg()}</td></tr>`}</tbody></table></div>`;
const axDetailHead='<div class="ov-sec">Detail &amp; Chart Existing <span>Tier C</span></div>';
function axSetStream(s){ AX.stream=s; renderPage(); } function axSetTrend(t){ AX.trend=t; renderPage(); } function axSetPaBy(t){ AX.paBy=t; renderPage(); }
function axViewExc(t){ EX.type=t||'all'; EX.path=[]; EX.drawer=null; navigate('exceptions'); }
function axUnitInExc(u){ EX.type='all'; EX.drawer=u; EX.path=[{k:'exc',v:'unit:'+u,l:'Unit '+u},{k:'unit',v:u,l:u}]; navigate('exceptions'); }
function axOpenEvent(i){ currentPage='exceptions'; exOpenEvent(i); }
function axUnitAnalytics(u){ AX.unitFocus=u; AX.eqFleet='all'; navigate('equipment'); }
function axPickFleet(f){ AX.eqFleet = AX.eqFleet===f?'all':f; AX.unitFocus=null; renderPage(); }
function axClearFocus(){ AX.unitFocus=null; renderPage(); }
function axExcLink(M,last){
  if(M.m==='gap') return `<button class="ov-link" onclick="navigate('production')">View Analytics ›</button>`;
  if(M.m==='cat') return `<button class="ov-link" onclick="navigate('${exPageOf(M.T)}')">View Analytics ›</button>`;
  if(M.m==='ev') return `<button class="ov-link" onclick="navigate('idle')">View Analytics ›</button>`;
  if(M.m==='unit'||last.k==='unit') return `<button class="ov-link" onclick="axUnitAnalytics(${axQ(M.m==='unit'?M.u:last.v)})">View Analytics ›</button>`;
  return '';
}
function axWrap(page, build){
  const orig=window['render_'+page];
  window['render_'+page]=function(data, el){
    orig(data, el);
    let B; try{ B=build(data); }catch(e){ console.error('[analytics '+page+']',e); return; }
    el.insertAdjacentHTML('afterbegin', B.top+axDetailHead);
    if(B.post) try{ B.post(); }catch(e){ console.error('[analytics post '+page+']',e); }
  };
}
const axByDate=(rows,fn)=>{ const g=U.groupBy(rows,r=>r.date); return g; };
function axTrendVals(rows, valFn){ const b=axBucket(), m=new Map(b.labels.map(l=>[l,0])); rows.forEach(r=>{ const k=b.keyOf(r.date); if(m.has(k)) m.set(k,m.get(k)+valFn(r)); }); return { labels:b.labels, vals:b.labels.map(l=>m.get(l)), big:b.big }; }
