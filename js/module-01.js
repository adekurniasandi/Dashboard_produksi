
/* ============================================================
   MINEBOARD - ENTERPRISE MINING DASHBOARD (SINGLE FILE)
   WITH PIT CONTROL & ENGINEERING METRICS
   ============================================================ */

/* ---------- UTILITIES ---------- */
const U = {
  rnd:(min,max)=> Math.random()*(max-min)+min,
  rndInt:(min,max)=> Math.floor(Math.random()*(max-min+1))+min,
  choice:(arr)=> arr[Math.floor(Math.random()*arr.length)],
  clamp:(v,min,max)=> Math.max(min,Math.min(max,v)),
  round:(v,d=0)=>{ const f=Math.pow(10,d); return Math.round((v+Number.EPSILON)*f)/f; },
  num:(v,d=0)=>{ if(v===undefined||v===null||isNaN(v)) return (0).toFixed(d)*1; return Number(v).toFixed(d)*1; },
  /* [FORMAT-ANGKA] Format tampilan angka (display only — nilai asli & kalkulasi TIDAK diubah).
     >= 1.000.000 -> "11,6 juta" | >= 1.000 -> "25,5 ribu" | < 1.000 -> angka normal. Maks 1 desimal utk juta/ribu. */
  fmtCompact:(v)=>{
    const a=Math.abs(Number(v)); if(!isFinite(a)) return '0';
    const sign = Number(v)<0 ? '-' : '';
    const one=(x)=> (Math.round((x+Number.EPSILON)*10)/10).toLocaleString('id-ID',{minimumFractionDigits:0,maximumFractionDigits:1});
    if(a>=1e6) return sign+one(a/1e6)+' juta';
    if(a>=1e3){
      const k=Math.round((a/1e3+Number.EPSILON)*10)/10;
      if(k>=1000) return sign+one(a/1e6)+' juta';   /* mis. 999.960 -> 1 juta, bukan 1.000 ribu */
      return sign+one(a/1e3)+' ribu';
    }
    if(Math.round((a+Number.EPSILON)*10)/10>=1000) return sign+'1 ribu';   /* 999,96 -> 1 ribu */
    return sign+one(a);
  },
  /* Format lama (angka penuh, pemisah ribuan id-ID) — dipakai utk form input & nilai yg harus persis. */
  fmtExact:(v,d=0)=>{ const n=U.num(v,d); return n.toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d}); },
  fmt:(v,d=0)=>{
    const raw=Number(v), n=U.num(v,d);
    if((v!==null && v!==undefined && v!=='' && isFinite(raw) && Math.abs(raw)>=1000) || Math.abs(n)>=1000) return U.fmtCompact(isFinite(raw)?raw:n);
    return U.fmtExact(v,d);
  },
  fmtPlain:(v)=> Number(v).toLocaleString('id-ID',{maximumFractionDigits:2}),
  pad:(n)=> String(n).padStart(2,'0'),
  dateStr:(d)=> `${d.getFullYear()}-${U.pad(d.getMonth()+1)}-${U.pad(d.getDate())}`,
  dateShort:(d)=> `${U.pad(d.getDate())}/${U.pad(d.getMonth()+1)}`,
  monthName:(m)=> ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][m],
  monthNameFull:(m)=> ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][m],
  dateLong:(d)=> `${d.getDate()} ${U.monthNameFull(d.getMonth())} ${d.getFullYear()}`,
  isoWeek:(d)=>{
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (date.getUTCDay() + 6) % 7;
    date.setUTCDate(date.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(date.getUTCFullYear(),0,4));
    const diff = (date - firstThursday) / 86400000;
    return 1 + Math.round((diff - 3) / 7);
  },
  sum:(arr,key)=> arr.reduce((a,r)=> a + (Number(r[key])||0), 0),
  avg:(arr,key)=> arr.length ? U.sum(arr,key)/arr.length : 0,
  groupBy:(arr,keyFn)=>{
    const m = new Map();
    arr.forEach(r=>{ const k = keyFn(r); if(!m.has(k)) m.set(k,[]); m.get(k).push(r); });
    return m;
  },
  downloadBlob:(content,filename,type)=>{
    const blob = new Blob([content], {type});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    setTimeout(()=>{ URL.revokeObjectURL(url); a.remove(); }, 300);
  }
};

/* ---------- SUPABASE CONFIG ----------
   Isi 2 nilai di bawah ini dengan Project URL dan anon public key dari
   Supabase Dashboard > Project Settings > API. Jangan pernah memakai
   service_role key di sini (itu untuk backend saja, bukan browser).
------------------------------------------------------------------ */
// [SUPABASE REWIRE 2026-09] Diarahkan ke project "Bangun data tambang" (gdfvzfqherygmiqyvvsy) —
// URL/key lama (project ketiga avkgsguwxcwxcxevfpdk) sudah tidak dipakai sama sekali.
const SUPABASE_URL = 'https://gdfvzfqherygmiqyvvsy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdkZnZ6ZnFoZXJ5Z21pcXl2dnN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYxOTM4ODksImV4cCI6MjEwMTc2OTg4OX0.meyFufJIBONoefeL90icWyXe7__yMhy5hLdF4Vy4GUI';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ============================================================================
   [OFFLINE ENGINE] — MODUL TAMBAHAN OFFLINE-FIRST (IndexedDB)
   ----------------------------------------------------------------------------
   Modul ini murni TAMBAHAN. Tidak ada kode/fungsi lama yang dihapus atau
   diubah perilakunya saat aplikasi ONLINE — semua fungsi asli tetap berjalan
   persis seperti sebelumnya. Modul ini hanya "menyisip" (bungkus try/catch,
   wrapper) di titik-titik yang menulis/membaca Supabase, supaya saat internet
   terputus, aplikasi tetap bisa dipakai (baca dari cache, tulis ke antrian).

   Isi:
   1. IndexedDB wrapper (buka DB, object store, get/put/delete/getAll)
   2. Cache Master Data & Transaksi (dipakai otomatis oleh fetchAll())
   3. Sync Queue (Pending Sync) + Auto Sync + Retry backoff (5/15/30/60 detik)
   4. Conflict Resolution berbasis updated_at timestamp + Conflict Log
   5. Sync Center (panel kecil): Pending/Success/Failed/Conflict/Last Sync/
      Next Retry/Retry Now/Sync Now/Clear Queue + Backup Export/Import
   6. Indikator status internet permanen di header (🟢/🔴/🟡)
   7. Notifikasi & loading yang konsisten dengan showToast() yang sudah ada
   8. Audit Log lokal (IndexedDB) untuk semua aktivitas penting

   Catatan integrasi: OfflineEngine.init() dipanggil di akhir bootstrap
   DOMContentLoaded (setelah sb dibuat & seluruh fungsi utama selesai
   diinisialisasi). Namun cacheTable()/getCachedTable() bisa dipakai lebih
   awal (mis. saat loadAllData() pertama kali berjalan) karena keduanya
   membuka IndexedDB sendiri secara lazy (ensureDB()) bila init() belum
   sempat dipanggil — sehingga fetchAll() tetap bisa cache & fallback ke
   cache sejak load pertama.
   ============================================================================ */
const OfflineEngine = (function(){

  const DB_NAME = 'mineboard_offline_db';
  const DB_VERSION = 1;
  // Daftar tabel master yang WAJIB di-cache untuk dropdown/form (sesuai spesifikasi).
  // fetchAll() sendiri sudah generik meng-cache tabel apapun yang dipanggil, daftar ini
  // hanya dipakai untuk "priming" cache saat online pertama kali via primeMasterCache().
  // [SUPABASE REWIRE 2026-09] Disesuaikan dengan tabel nyata project "Bangun data tambang"
  // (gdfvzfqherygmiqyvvsy). Tabel lama (master_pit, master_crusher, master_stockpile,
  // master_breakdown_code, master_weather, master_equipment, master_cost, master_incident_type)
  // TIDAK ADA di schema ini — dihapus dari priming cache, bukan diasumsikan.
  const MASTER_TABLES = [
    'master_shifts','master_fleets','master_units','master_unit_roles','master_employees',
    'master_materials','master_locations','master_delays','master_idles'
  ];
  const RETRY_DELAYS = [5000, 15000, 30000, 60000]; // [OFFLINE ENGINE] jeda retry sesuai spesifikasi

  let db = null;
  let dbOpenPromise = null;
  let isSyncing = false;
  let retryTimer = null;
  let retryStep = 0;
  let lastSyncAt = null;
  let nextRetryAt = null;
  let netStatus = (typeof navigator!=='undefined' && navigator.onLine===false) ? 'offline' : 'online';

  /* ---------------- 1) INDEXEDDB WRAPPER ---------------- */
  function openDB(){
    return new Promise((resolve, reject)=>{
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (ev)=>{
        const _db = ev.target.result;
        if(!_db.objectStoreNames.contains('master_cache')) _db.createObjectStore('master_cache', { keyPath:'table' });
        if(!_db.objectStoreNames.contains('sync_queue')) _db.createObjectStore('sync_queue', { keyPath:'id', autoIncrement:true });
        if(!_db.objectStoreNames.contains('conflict_log')) _db.createObjectStore('conflict_log', { keyPath:'id', autoIncrement:true });
        if(!_db.objectStoreNames.contains('audit_log')) _db.createObjectStore('audit_log', { keyPath:'id', autoIncrement:true });
        if(!_db.objectStoreNames.contains('cache_meta')) _db.createObjectStore('cache_meta', { keyPath:'key' });
      };
      req.onsuccess = ()=> resolve(req.result);
      req.onerror = ()=> reject(req.error);
    });
  }
  // [OFFLINE ENGINE] Membuka IndexedDB sekali saja (lazy), dipakai oleh cacheTable/getCachedTable
  // agar tetap berfungsi walau dipanggil sebelum OfflineEngine.init() resmi dijalankan.
  async function ensureDB(){
    if(db) return db;
    if(!dbOpenPromise) dbOpenPromise = openDB().then(_db=>{ db=_db; return db; });
    return dbOpenPromise;
  }
  function tx(storeName, mode='readonly'){
    return db.transaction(storeName, mode).objectStore(storeName);
  }
  function reqToPromise(req){
    return new Promise((resolve, reject)=>{ req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error); });
  }
  async function idbGet(store, key){ await ensureDB(); return reqToPromise(tx(store).get(key)); }
  async function idbGetAll(store){ await ensureDB(); return reqToPromise(tx(store).getAll()); }
  async function idbPut(store, val){ await ensureDB(); return reqToPromise(tx(store,'readwrite').put(val)); }
  async function idbDelete(store, key){ await ensureDB(); return reqToPromise(tx(store,'readwrite').delete(key)); }
  async function idbClear(store){ await ensureDB(); return reqToPromise(tx(store,'readwrite').clear()); }

  /* ---------------- 2) CACHE MASTER & TRANSAKSI DATA ---------------- */
  // Dipanggil otomatis oleh fetchAll() setiap kali fetch Supabase berhasil (write-through cache).
  async function cacheTable(table, rows){
    try{
      await ensureDB();
      await idbPut('master_cache', { table, data: rows, updated_at: new Date().toISOString() });
    }catch(e){ /* no-op, cache tidak boleh mengganggu alur utama */ }
  }
  async function getCachedTable(table){
    try{
      await ensureDB();
      const rec = await idbGet('master_cache', table);
      return rec ? rec.data : null;
    }catch(e){ return null; }
  }
  // [Cache Validation] cek umur cache (untuk optimasi #11 — tidak perlu redownload kalau masih segar)
  async function isCacheFresh(table, maxAgeMs=5*60*1000){
    try{
      const rec = await idbGet('master_cache', table);
      if(!rec) return false;
      return (Date.now() - new Date(rec.updated_at).getTime()) < maxAgeMs;
    }catch(e){ return false; }
  }
  // Priming: saat online pertama kali, pastikan seluruh Master Data ter-download & tersimpan.
  async function primeMasterCache(){
    if(netStatus==='offline') return;
    notify('Downloading Master...', 'info', true);
    for(const t of MASTER_TABLES){
      try{
        // [PERF FIX] Tabel yang barusan sudah ditarik oleh loadAllData() di load session ini
        // dilewati — tidak perlu didownload ulang lewat select('*') (request duplikat).
        if(typeof SESSION_FETCHED_TABLES!=='undefined' && SESSION_FETCHED_TABLES.has(t)) continue;
        // fresh (<10 menit) tidak perlu didownload ulang -> Incremental/Cache Validation (#11)
        if(await isCacheFresh(t, 10*60*1000)) continue;
        const rows = await fetchAll(t, '*');
        await cacheTable(t, rows);
      }catch(e){ /* tabel mungkin tidak ada di skema ini — abaikan diam-diam */ }
    }
  }

  /* ---------------- 3) SYNC QUEUE + AUTO SYNC + RETRY ---------------- */
  // Setiap item queue: { id, table, op:'insert'|'update'|'delete', payload, pk, pkVal, status, attempts, createdAt, lastError, base_updated_at }
  async function enqueue(item){
    item.status = 'pending';
    item.attempts = 0;
    item.createdAt = new Date().toISOString();
    await idbPut('sync_queue', item);
    // [LOGGING] Menambah ke Queue
    console.log('[OfflineEngine] ➕ Menambah ke Queue ->', item.op, item.table, item);
    renderSyncBadge();
  }

  // Wrapper INSERT: coba langsung online, kalau gagal -> antre (Pending Sync). Tidak pernah throw ke pemanggil.
  async function insert(table, payload){
    if(netStatus!=='offline'){
      try{
        const { error } = await sb.from(table).insert([payload]);
        if(!error){ audit('INSERT', table, null, payload); return { error:null, queued:false }; }
        // kalau error dari server (bukan jaringan), tetap lempar supaya pemanggil bisa tampilkan pesan
        if(!isNetworkError(error)) return { error, queued:false };
      }catch(err){ if(!isNetworkError(err)) return { error: err, queued:false }; }
    }
    await enqueue({ table, op:'insert', payload });
    audit('INSERT', table, null, payload, true);
    scheduleSync();
    return { error:null, queued:true };
  }
  async function update(table, payload, pk, pkVal){
    if(netStatus!=='offline'){
      try{
        const { error } = await sb.from(table).update(payload).eq(pk, pkVal);
        if(!error){ audit('UPDATE', table, null, payload); return { error:null, queued:false }; }
        if(!isNetworkError(error)) return { error, queued:false };
      }catch(err){ if(!isNetworkError(err)) return { error: err, queued:false }; }
    }
    await enqueue({ table, op:'update', payload, pk, pkVal, base_updated_at:new Date().toISOString() });
    audit('UPDATE', table, null, payload, true);
    scheduleSync();
    return { error:null, queued:true };
  }
  async function del(table, pk, pkVal){
    if(netStatus!=='offline'){
      try{
        const { error } = await sb.from(table).delete().eq(pk, pkVal);
        if(!error){ audit('DELETE', table, {pkVal}, null); return { error:null, queued:false }; }
        if(!isNetworkError(error)) return { error, queued:false };
      }catch(err){ if(!isNetworkError(err)) return { error: err, queued:false }; }
    }
    await enqueue({ table, op:'delete', pk, pkVal });
    audit('DELETE', table, {pkVal}, null, true);
    scheduleSync();
    return { error:null, queued:true };
  }
  async function bulkDelete(table, pk, ids){
    if(netStatus!=='offline'){
      try{
        const { error } = await sb.from(table).delete().in(pk, ids);
        if(!error){ audit('DELETE', table, {ids}, null); return { error:null, queued:false }; }
        if(!isNetworkError(error)) return { error, queued:false };
      }catch(err){ if(!isNetworkError(err)) return { error: err, queued:false }; }
    }
    for(const pkVal of ids) await enqueue({ table, op:'delete', pk, pkVal });
    audit('DELETE', table, {ids}, null, true);
    scheduleSync();
    return { error:null, queued:true };
  }
  async function bulkUpdate(table, payload, pk, ids){
    if(netStatus!=='offline'){
      try{
        const { error } = await sb.from(table).update(payload).in(pk, ids);
        if(!error){ audit('UPDATE', table, null, {payload,ids}); return { error:null, queued:false }; }
        if(!isNetworkError(error)) return { error, queued:false };
      }catch(err){ if(!isNetworkError(err)) return { error: err, queued:false }; }
    }
    for(const pkVal of ids) await enqueue({ table, op:'update', payload, pk, pkVal, base_updated_at:new Date().toISOString() });
    audit('UPDATE', table, null, {payload,ids}, true);
    scheduleSync();
    return { error:null, queued:true };
  }
  async function bulkInsert(table, rows){
    if(netStatus!=='offline'){
      try{
        const { error } = await sb.from(table).insert(rows);
        if(!error){ audit('INSERT', table, null, {rows:rows.length}); return { error:null, queued:false }; }
        if(!isNetworkError(error)) return { error, queued:false };
      }catch(err){ if(!isNetworkError(err)) return { error: err, queued:false }; }
    }
    for(const payload of rows) await enqueue({ table, op:'insert', payload });
    audit('INSERT', table, null, {rows:rows.length}, true);
    scheduleSync();
    return { error:null, queued:true };
  }
  function isNetworkError(err){
    if(!err) return false;
    if(netStatus==='offline') return true;
    const msg = (err.message||String(err)||'').toLowerCase();
    return msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('load failed') || msg.includes('timeout');
  }

  // Proses seluruh antrian: urutan Insert -> Update -> Delete (sesuai spesifikasi)
  async function processQueue(){
    if(isSyncing || netStatus==='offline') return;
    isSyncing = true;
    setNetStatus('syncing');
    notify('Syncing Data...', 'info', true);
    try{
      const all = await idbGetAll('sync_queue');
      const order = { insert:0, update:1, delete:2 };
      const items = all.filter(i=> i.status!=='conflict').sort((a,b)=> order[a.op]-order[b.op]);
      // [LOGGING] Mengirim Queue
      console.log(`[OfflineEngine] ⬆️ Mengirim Queue -> ${items.length} item akan diproses`, items);
      let successCount = 0, failCount = 0;
      for(const item of items){
        const ok = await syncOneItem(item);
        if(ok) successCount++; else failCount++;
      }
      lastSyncAt = new Date();
      console.log(`[OfflineEngine] Ringkasan sync: ${successCount} berhasil, ${failCount} gagal`);
      if(successCount>0) notify('Sinkronisasi berhasil.', 'success');
      if(failCount>0){
        notify('Sinkronisasi gagal.', 'error');
        scheduleRetry();
      } else {
        retryStep = 0; nextRetryAt = null;
      }
    } finally {
      isSyncing = false;
      setNetStatus(navigator.onLine ? 'online' : 'offline');
      renderSyncBadge();
      renderSyncCenterIfOpen();
    }
  }
  async function syncOneItem(item){
    try{
      if(item.op==='insert'){
        const { error } = await sb.from(item.table).insert([item.payload]);
        if(error) throw error;
      } else if(item.op==='update'){
        // [CONFLICT RESOLUTION] cek updated_at server vs base_updated_at lokal sebelum menimpa
        const conflict = await checkConflict(item);
        if(conflict){ await markConflict(item, conflict); return false; }
        const { error } = await sb.from(item.table).update(item.payload).eq(item.pk, item.pkVal);
        if(error) throw error;
      } else if(item.op==='delete'){
        const { error } = await sb.from(item.table).delete().eq(item.pk, item.pkVal);
        if(error) throw error;
      }
      await idbDelete('sync_queue', item.id); // Synced -> hapus dari antrian
      audit('SYNC', item.table, null, { op:item.op, id:item.id });
      // [LOGGING] Berhasil Sync
      console.log('[OfflineEngine] ✅ Berhasil Sync ->', item.op, item.table, item);
      return true;
    }catch(err){
      item.attempts = (item.attempts||0)+1;
      item.status = 'failed';
      item.lastError = (err && err.message) ? err.message : String(err);
      await idbPut('sync_queue', item);
      audit('FAILED_SYNC', item.table, null, { op:item.op, error:item.lastError });
      // [LOGGING] Gagal Sync
      console.log('[OfflineEngine] ❌ Gagal Sync ->', item.op, item.table, 'error:', item.lastError, item);
      return false;
    }
  }
  // [CONFLICT RESOLUTION] Bandingkan updated_at di server dengan timestamp saat item dimasukkan ke queue.
  // Jika tabel tidak punya kolom updated_at, fungsi ini otomatis dilewati (tidak error).
  async function checkConflict(item){
    try{
      const { data, error } = await sb.from(item.table).select('updated_at').eq(item.pk, item.pkVal).limit(1).single();
      if(error || !data || !data.updated_at) return null;
      if(item.base_updated_at && new Date(data.updated_at) > new Date(item.base_updated_at)){
        return data;
      }
      return null;
    }catch(e){ return null; }
  }
  async function markConflict(item, remote){
    item.status = 'conflict';
    await idbPut('sync_queue', item);
    await idbPut('conflict_log', {
      id: Date.now()+Math.random(),
      table: item.table, pk: item.pk, pkVal: item.pkVal,
      localData: item.payload, remoteData: remote,
      timestamp: new Date().toISOString(), resolved:false
    });
    audit('CONFLICT', item.table, remote, item.payload);
  }
  // Admin memilih data mana yang dipakai: 'local' (kirim ulang local ke server) atau 'remote' (buang perubahan local)
  async function resolveConflict(queueId, choice){
    const item = await idbGet('sync_queue', queueId);
    if(!item) return;
    if(choice==='local'){
      item.status='pending'; item.base_updated_at = new Date().toISOString();
      await idbPut('sync_queue', item);
    } else {
      await idbDelete('sync_queue', queueId); // pakai data server -> buang perubahan offline
    }
    renderSyncCenterIfOpen();
    scheduleSync();
  }

  function scheduleSync(){ if(netStatus!=='offline' && !isSyncing) processQueue(); }
  function scheduleRetry(){
    if(retryTimer) clearTimeout(retryTimer);
    const delay = RETRY_DELAYS[Math.min(retryStep, RETRY_DELAYS.length-1)];
    nextRetryAt = new Date(Date.now()+delay);
    retryStep = Math.min(retryStep+1, RETRY_DELAYS.length-1);
    retryTimer = setTimeout(()=>{ processQueue(); }, delay);
    renderSyncCenterIfOpen();
  }
  function retryNow(){
    if(retryTimer) clearTimeout(retryTimer);
    retryStep = 0;
    processQueue();
  }
  async function clearQueue(){
    await idbClear('sync_queue');
    renderSyncBadge(); renderSyncCenterIfOpen();
    notify('Antrian sinkronisasi dikosongkan.', 'info');
  }

  /* ---------------- 6) STATUS INTERNET (header indicator) ---------------- */
  function setNetStatus(s){
    netStatus = s;
    const el = document.getElementById('oeNetStatus');
    if(!el) return;
    const map = { online:['🟢','Online'], offline:['🔴','Offline'], syncing:['🟡','Syncing'] };
    const [icon,label] = map[s]||map.online;
    el.innerHTML = `${icon} <span class="oe-net-label">${label}</span>`;
    el.className = 'tag font-mono oe-net-'+s;
  }
  function handleOnline(){
    setNetStatus('online');
    notify('Internet kembali.', 'success');
    primeMasterCache().catch(()=>{});
    processQueue();
  }
  function handleOffline(){
    setNetStatus('offline');
    notify('Internet terputus.', 'error');
  }

  /* ---------------- 7) NOTIFIKASI (pakai showToast yang sudah ada, tanpa mengubahnya) ---------------- */
  function notify(msg, type='info', silent=false){
    // Tidak pernah menampilkan error JavaScript mentah ke pengguna — hanya pesan ramah.
    try{ if(typeof showToast==='function' && !silent) showToast(msg, type); }catch(e){ /* no-op */ }
  }

  /* ---------------- 8) AUDIT LOG LOKAL ---------------- */
  async function audit(action, table, oldData, newData, isOffline){
    try{
      await ensureDB();
      await idbPut('audit_log', {
        id: Date.now()+Math.random(),
        timestamp: new Date().toISOString(),
        user: (typeof adminSessionUser==='function') ? adminSessionUser() : 'guest',
        table: table||'-', action: isOffline ? action+'_OFFLINE' : action,
        oldData: oldData? JSON.stringify(oldData) : null,
        newData: newData? JSON.stringify(newData) : null
      });
    }catch(e){ /* no-op, audit tidak boleh mengganggu alur utama */ }
  }

  /* ---------------- 5) SYNC CENTER UI ---------------- */
  function renderSyncBadge(){
    idbGetAll('sync_queue').then(items=>{
      const btn = document.getElementById('oeSyncCenterBtn');
      if(!btn) return;
      const pending = items.filter(i=>i.status==='pending').length;
      const badge = document.getElementById('oeSyncBadge');
      if(badge){
        if(pending>0){ badge.style.display='inline-flex'; badge.textContent = pending>99?'99+':pending; }
        else badge.style.display='none';
      }
    }).catch(()=>{});
  }
  function ensureSyncCenterDOM(){
    if(document.getElementById('oeSyncCenterRoot')) return;
    const root = document.createElement('div');
    root.id = 'oeSyncCenterRoot';
    document.body.appendChild(root);
  }
  function openSyncCenter(){
    ensureSyncCenterDOM();
    renderSyncCenterPanel();
  }
  function closeSyncCenter(){
    const root = document.getElementById('oeSyncCenterRoot');
    if(root) root.innerHTML = '';
  }
  function renderSyncCenterIfOpen(){
    const root = document.getElementById('oeSyncCenterRoot');
    if(root && root.innerHTML.trim()) renderSyncCenterPanel();
  }
  async function renderSyncCenterPanel(){
    ensureSyncCenterDOM();
    const root = document.getElementById('oeSyncCenterRoot');
    const items = await idbGetAll('sync_queue');
    const conflicts = await idbGetAll('conflict_log');
    const pending = items.filter(i=>i.status==='pending');
    const failed = items.filter(i=>i.status==='failed');
    const conflictItems = items.filter(i=>i.status==='conflict');
    const successToday = (await idbGetAll('audit_log')).filter(a=> a.action==='SYNC' && a.timestamp && a.timestamp.slice(0,10)===new Date().toISOString().slice(0,10)).length;

    root.innerHTML = `
    <div class="oe-modal-overlay" id="oeSyncOverlay">
      <div class="oe-modal">
        <div class="oe-modal-head">
          <div class="panel-title">🔄 Sync Center</div>
          <button class="adm-modal-close" onclick="OfflineEngine.closeSyncCenter()">✕</button>
        </div>
        <div class="oe-stat-grid">
          <div class="oe-stat"><b>${pending.length}</b><span>Pending Sync</span></div>
          <div class="oe-stat"><b>${successToday}</b><span>Success</span></div>
          <div class="oe-stat"><b>${failed.length}</b><span>Failed</span></div>
          <div class="oe-stat"><b>${conflictItems.length}</b><span>Conflict</span></div>
        </div>
        <div class="text-xs mt-2" style="color:var(--text-dim)">
          Last Sync: <b>${lastSyncAt ? lastSyncAt.toLocaleString('id-ID') : '-'}</b><br>
          Next Retry: <b>${nextRetryAt ? nextRetryAt.toLocaleTimeString('id-ID') : '-'}</b>
        </div>
        <div class="flex gap-2 mt-3 flex-wrap">
          <button class="btn" onclick="OfflineEngine.retryNow()">🔁 Retry Now</button>
          <button class="btn btn-accent" onclick="OfflineEngine.sync()">⬆️ Sync Now</button>
          <button class="btn" style="border-color:var(--danger);color:var(--danger)" onclick="OfflineEngine.clearQueueConfirm()">🗑 Clear Queue</button>
        </div>
        ${conflictItems.length? `
        <div class="mt-3">
          <div class="panel-sub mb-1">⚠️ Konflik Data (pilih data yang dipakai)</div>
          ${conflictItems.map(i=>`
            <div class="oe-conflict-row">
              <span>${esc(i.table)} #${esc(String(i.pkVal))}</span>
              <span>
                <button class="btn !py-1 !px-2 text-xs" onclick="OfflineEngine.resolve(${i.id},'local')">Pakai Lokal</button>
                <button class="btn !py-1 !px-2 text-xs" onclick="OfflineEngine.resolve(${i.id},'remote')">Pakai Server</button>
              </span>
            </div>`).join('')}
        </div>` : ''}
        <div class="mt-4 pt-3" style="border-top:1px solid var(--border-soft)">
          <div class="panel-sub mb-2">💾 Backup &amp; Restore (data cache lokal)</div>
          <div class="flex gap-2 flex-wrap">
            <button class="btn" onclick="OfflineEngine.exportCSV()">⬇️ Export CSV</button>
            <button class="btn" onclick="OfflineEngine.exportJSON()">⬇️ Export JSON</button>
            <button class="btn" onclick="OfflineEngine.triggerImport()">⬆️ Import Backup</button>
          </div>
        </div>
      </div>
    </div>`;
  }
  function clearQueueConfirm(){
    if(typeof openConfirmModal==='function'){
      openConfirmModal('Kosongkan seluruh antrian Pending Sync? Data yang belum terkirim akan hilang.', async ()=>{ await clearQueue(); renderSyncCenterPanel(); });
    }
  }

  /* ---------------- 12) BACKUP EXPORT / IMPORT ---------------- */
  async function exportJSON(){
    const all = await idbGetAll('master_cache');
    const dump = {}; all.forEach(r=> dump[r.table]=r.data);
    U.downloadBlob(JSON.stringify(dump,null,2), `mineboard_backup_${Date.now()}.json`, 'application/json');
    audit('EXPORT', 'ALL', null, {format:'json'});
    notify('Backup JSON berhasil diunduh.', 'success');
  }
  async function exportCSV(){
    const all = await idbGetAll('master_cache');
    for(const rec of all){
      if(!rec.data || !rec.data.length) continue;
      const headers = Object.keys(rec.data[0]);
      const csv = [headers.join(',')].concat(rec.data.map(row=> headers.map(h=> JSON.stringify(row[h]??'')).join(','))).join('\n');
      U.downloadBlob(csv, `${rec.table}.csv`, 'text/csv');
    }
    audit('EXPORT', 'ALL', null, {format:'csv'});
    notify('Backup CSV berhasil diunduh (per tabel).', 'success');
  }
  function triggerImport(){
    const inp = document.createElement('input');
    inp.type='file'; inp.accept='.json';
    inp.onchange = async (e)=>{
      const file = e.target.files[0];
      if(!file) return;
      try{
        const text = await file.text();
        const dump = JSON.parse(text);
        for(const table in dump){ await cacheTable(table, dump[table]); }
        audit('IMPORT', 'ALL', null, {tables:Object.keys(dump)});
        notify('Data berhasil diimpor ke cache lokal.', 'success');
      }catch(e){ notify('Sinkronisasi gagal.', 'error'); }
    };
    inp.click();
  }

  /* ---------------- INIT ---------------- */
  function injectStyles(){
    if(document.getElementById('oeStyles')) return;
    const style = document.createElement('style');
    style.id = 'oeStyles';
    style.textContent = `
      .oe-net-online{color:var(--success)!important;border-color:var(--success)!important}
      .oe-net-offline{color:var(--danger)!important;border-color:var(--danger)!important}
      .oe-net-syncing{color:var(--warning)!important;border-color:var(--warning)!important}
      #oeSyncCenterBtn{position:relative}
      #oeSyncBadge{display:none;position:absolute;top:-6px;right:-6px;background:var(--danger);color:#fff;border-radius:999px;font-size:10px;line-height:1;padding:3px 5px;font-family:'JetBrains Mono',monospace}
      .oe-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}
      .oe-modal{background:var(--panel);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;width:420px;max-width:95vw;max-height:85vh;overflow-y:auto;box-shadow:var(--shadow)}
      .oe-modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}
      .oe-stat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:8px}
      .oe-stat{background:var(--panel-2);border:1px solid var(--border-soft);border-radius:var(--radius-sm);padding:8px;text-align:center}
      .oe-stat b{display:block;font-size:16px;color:var(--text)}
      .oe-stat span{font-size:10px;color:var(--text-faint)}
      .oe-conflict-row{display:flex;align-items:center;justify-content:space-between;padding:6px 0;font-size:12px;border-bottom:1px solid var(--border-soft)}
    `;
    document.head.appendChild(style);
  }
  function injectHeaderUI(){
    // [OFFLINE ENGINE] Menyisipkan indikator status internet + tombol Sync Center di topbar
    // TANPA mengubah markup/struktur HTML yang sudah ada — hanya insertAdjacentHTML di sebelah #liveClock.
    const clock = document.getElementById('liveClock');
    if(clock && !document.getElementById('oeNetStatus')){
      clock.insertAdjacentHTML('beforebegin', `
        <span id="oeNetStatus" class="tag font-mono oe-net-online" title="Status koneksi internet">🟢 <span class="oe-net-label">Online</span></span>
        <button id="oeSyncCenterBtn" class="btn" title="Sync Center" onclick="OfflineEngine.open()">🔄 <span id="oeSyncBadge">0</span></button>
      `);
    }
  }

  async function init(){
    await ensureDB();
    injectStyles();
    // header UI mungkin belum ter-render saat init dipanggil (topbar sudah statis di HTML jadi aman)
    injectHeaderUI();
    setNetStatus(navigator.onLine===false ? 'offline' : 'online');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    renderSyncBadge();
    // Auto sync tiap kali app dibuka (jika online & ada antrian)
    if(netStatus!=='offline') scheduleSync();
    // Priming cache master data saat online (tidak memblokir load utama)
    primeMasterCache().catch(()=>{});
  }

  function isOffline(){ return netStatus==='offline'; }

  return {
    init, cacheTable, getCachedTable, isCacheFresh, isOffline,
    insert, update, delete: del, bulkDelete, bulkUpdate, bulkInsert,
    open: openSyncCenter, closeSyncCenter, resolve: resolveConflict,
    retryNow, clearQueueConfirm, sync: processQueue,
    exportCSV, exportJSON, triggerImport, audit
  };
})();

/* ---------- DATA CONTAINERS (diisi dari Supabase saat load) ---------- */
let PITS = [];
let FLEET_DEFS = [];
let UNITS = [];
let OPERATORS = [];
let DRIVERS = [];        // [SUPABASE REWIRE 2026-09] baru — Driver Hauler terpisah dari Operator digger
let MATERIALS = [];      // [SUPABASE REWIRE 2026-09] baru — master_materials
let SHIFTS = [];
let RECORDS = [];
let MINE_PLAN = [];      // Plan ternormalisasi dari Mine Plan → Generated Plan (plan_daily_generated) — SATU-SATUNYA sumber Plan dashboard
let _PLAN_LOOKUPS = null; // lookup kode→nama (shift/fleet/material/stream) untuk normalisasi ulang Mine Plan
let DATA_LOADED_AT = null;   // [UI Overview] penanda waktu dataset terakhir dimuat — hanya untuk tampilan freshness
let UNIT_STATUS = [];    // [SUPABASE REWIRE 2026-09] baru — unit_status_actual, sumber PA/UA yang benar
/* [HOURLY NORMALIZATION AUDIT 2026-09] jam per shift dari master_shifts.duration_hours — SATU-SATUNYA
   sumber "scheduled hours". Dipakai computePAUA()/getUnifiedStandbyHours() supaya scheduled TIDAK
   pernah dihitung dari jumlah record yang kebetulan ada (lihat root cause #1 di audit). */
let SHIFT_HOURS_BY_CODE = {};
let SHIFT_HOURS_BY_NAME = {};
let DELAY_EVENTS = [];   // [SUPABASE REWIRE 2026-09] baru — menggantikan MAINT_LOG lama
let IDLE_EVENTS = [];    // [SUPABASE REWIRE 2026-09] baru
let OT_EVENTS = [];      // [SUPABASE REWIRE 2026-11] baru — ot_events, sumber OT (termasuk 140 historical OT
                          // Work End 17-18 D, source HISTORICAL_RECONSTRUCTED_OT). Field terpisah dari
                          // scheduled_hours/PA/UA — TIDAK PERNAH digabung ke scheduled maupun produksi normal.
let FUEL_ACTUAL = [];    // [SUPABASE REWIRE 2026-09] baru — fuel_actual, sumber halaman Fuel
let YEAR = new Date().getFullYear();
/* [SUPABASE REWIRE 2026-09] Stub sementara (array/objek kosong, BUKAN dummy data — hanya
   supaya halaman yang belum sempat direwire tidak crash saat dibuka) untuk MAINT_LOG/
   SAFETY_LOG/RAINFALL_BY_DATE lama. Dihapus satu-satu begitu halaman terkait selesai
   dikerjakan (Equipment/Reports/AI Insight/Admin — lihat status di memory area mineboard). */
let MAINT_LOG = [];
let SAFETY_LOG = [];
let RAINFALL_BY_DATE = {};
/* [SUPABASE REWIRE 2026-09] MAINT_LOG/SAFETY_LOG/SUMP_DAILY/CRUSHER_DAILY/STOCKPILE_DAILY/
   RAINFALL_BY_DATE dihapus — tidak ada tabel sumber (maintenance_log, safety_incident,
   sump_daily, crusher_daily, stockpile_daily semua tidak ada di schema nyata). */

/* ---------- SUPABASE FETCH HELPER (auto pagination, limit default Supabase 1000 baris) ----------
   [PERF 2026-09] Sebelumnya loop while SEKUENSIAL (1 request 1000 baris, tunggu balas baru
   minta halaman berikutnya) — untuk tabel besar (production_actual ~33rb baris,
   unit_status_actual ~50rb baris, fuel_actual ~24rb baris) ini berarti puluhan round-trip
   berurutan, dan itu penyebab utama loading lama. Sekarang: tembak beberapa halaman SEKALIGUS
   paralel (BATCH_CONCURRENCY per gelombang), berhenti begitu salah satu halaman dalam
   gelombang balik dengan baris < FETCH_PAGE_SIZE (tanda sudah habis; kini 50.000, lihat blok [50K] di bawah). Urutan hasil tetap benar
   karena Promise.all menjaga urutan array input, terlepas urutan selesainya request. */
// [PERF FIX] Menandai tabel yang sudah berhasil ditarik pada load session ini, supaya
// primeMasterCache() (dipanggil belakangan oleh OfflineEngine.init()) tidak menembak ulang
// tabel yang barusan sudah di-fetch oleh loadAllData() — mencegah request duplikat tanpa
// bergantung pada timing race write-through cache IndexedDB.
const SESSION_FETCHED_TABLES = new Set();
/* [PERF 2026-10 · 50K/REQUEST + HARDENING]
   Supabase Settings → API → Maximum Rows sudah 50.000 (diset di dashboard Supabase; kode ini hanya MEMBACA
   konfigurasi tersebut lewat range(), tidak mengubah setting/schema/RLS apa pun).
   - FETCH_PAGE_SIZE      : satu-satunya tempat angka 50.000 (dipakai range() & kondisi berhenti).
   - Halaman 0 diambil SENDIRIAN: tabel master/kecil (<50rb baris) selesai dalam 1 request, tanpa request kosong.
   - Hanya jika halaman penuh (== FETCH_PAGE_SIZE) dilanjutkan gelombang BATCH_CONCURRENCY halaman paralel.
   - BATCH_CONCURRENCY 6 -> 2: payload per request kini ~50x lebih besar. Karena loadAllData() menembak banyak tabel
     fakta sekaligus, ditambah batas GLOBAL FETCH_MAX_INFLIGHT agar total payload in-flight tetap terkendali.
   - Retry terbatas PER HALAMAN (MAX_RETRIES) hanya untuk error sementara; hasil halaman disimpan per indeks halaman
     dan hanya dari percobaan yang sukses -> retry tidak pernah menghasilkan baris ganda/hilang. */
const FETCH_PAGE_SIZE = 50000;
const BATCH_CONCURRENCY = 2;
const FETCH_MAX_INFLIGHT = 4;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = [400, 1200];
const FETCH_TIMEOUT_MS = 90000;
// Logging ringan (per batch, bukan per baris) — hanya aktif jika localStorage 'mineboard_debug'='1' atau URL ?debug=1.
const MB_DEBUG_FETCH = (()=>{ try{ return localStorage.getItem('mineboard_debug')==='1' || /[?&]debug=1(&|$)/.test(location.search); }catch(e){ return false; } })();
let _fetchInflight = 0;
const _fetchWaiters = [];
function _fetchAcquire(){
  if(_fetchInflight < FETCH_MAX_INFLIGHT){ _fetchInflight++; return Promise.resolve(); }
  return new Promise(res=>_fetchWaiters.push(res));
}
function _fetchRelease(){
  const next = _fetchWaiters.shift();
  if(next) next(); else _fetchInflight--;     // slot langsung dioper ke antrean berikutnya
}
// Hanya error SEMENTARA yang di-retry (jaringan putus, timeout, 408/429/5xx, statement timeout). Error permanen
// (401/403/404, kolom/tabel tidak ada, RLS, JWT) langsung dilempar tanpa retry.
function fetchErrIsTransient(error, status){
  if(!error) return false;
  const code = String(error.code || ''), msg = String(error.message || error);
  if(error.name === 'AbortError') return true;
  if([408,425,429,500,502,503,504,520,521,522,523,524].includes(status)) return true;
  if(code === '57014' || code === '53300' || /^08/.test(code)) return true;
  if(!status && !code) return true;           // gagal di sisi klien (fetch gagal / aborted)
  return /failed to fetch|networkerror|network request failed|load failed|timeout|timed out|abort|econn|socket/i.test(msg);
}
const _sleep = ms => new Promise(r=>setTimeout(r, ms));
// Satu halaman = satu range() tetap. Mengembalikan array baris halaman tsb dari percobaan yang SUKSES saja.
async function fetchPageWithRetry(table, columns, orderCol, pageIdx){
  const from = pageIdx * FETCH_PAGE_SIZE, to = from + FETCH_PAGE_SIZE - 1;
  let lastErr = null;
  for(let attempt = 0; attempt <= MAX_RETRIES; attempt++){
    if(attempt > 0) await _sleep(RETRY_BACKOFF_MS[Math.min(attempt-1, RETRY_BACKOFF_MS.length-1)]);
    await _fetchAcquire();
    const ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    const timer = ctrl ? setTimeout(()=>ctrl.abort(), FETCH_TIMEOUT_MS) : null;
    try{
      let q = sb.from(table).select(columns).range(from, to);
      if(orderCol) (Array.isArray(orderCol) ? orderCol : [orderCol]).forEach(c=>{ q = q.order(c, { ascending:true }); });
      if(ctrl && typeof q.abortSignal === 'function') q = q.abortSignal(ctrl.signal);
      const { data, error, status } = await q;
      if(error){
        const e = new Error(error.message || 'fetch error');
        e.code = error.code; e.status = status || error.status; e.details = error.details;
        if(!fetchErrIsTransient(error, status)){ e.permanent = true; throw e; }
        lastErr = e;
        console.warn(`[Mineboard][fetch] table=${table} page=${pageIdx} attempt=${attempt+1}/${MAX_RETRIES+1} error sementara: ${e.message}`);
        continue;
      }
      return data || [];                       // respons kosong = valid
    }catch(ex){
      if(ex && ex.permanent) throw ex;
      if(!fetchErrIsTransient(ex, 0)) throw ex;
      lastErr = ex;
      console.warn(`[Mineboard][fetch] table=${table} page=${pageIdx} attempt=${attempt+1}/${MAX_RETRIES+1} exception sementara: ${(ex && ex.message) || ex}`);
    }finally{
      if(timer) clearTimeout(timer);
      _fetchRelease();
    }
  }
  throw lastErr || new Error('fetch gagal');
}
async function fetchAll(table, columns='*', orderCol=null, meta=null){
  /* [HARDENING] `meta` (opsional) diisi: meta.source = 'network' | 'cache' (offline) | 'cache-fallback'
     (network gagal, cache dipakai) dan meta.error. Dipakai DATA_STATE supaya data cache TIDAK pernah
     dianggap data fresh dari server. Kontrak return/meta/cache-fallback TIDAK berubah. */
  // [OFFLINE ENGINE] Jika status koneksi sudah diketahui offline, langsung pakai cache
  // IndexedDB tanpa mencoba request ke Supabase sama sekali (lebih cepat & tidak error).
  if(typeof OfflineEngine!=='undefined' && OfflineEngine.isOffline && OfflineEngine.isOffline()){
    const cached = await OfflineEngine.getCachedTable(table);
    if(cached){ if(meta) meta.source = 'cache'; return cached; }
  }
  try{
    const t0 = performance.now();
    const chunks = [];            // satu chunk per halaman; digabung SEKALI di akhir (tanpa concat berulang)
    let total = 0, batchNo = 0, nextPage = 0, done = false;
    const logBatch = (rows, since)=>{ if(MB_DEBUG_FETCH) console.info(`[Mineboard] ${table}: batch ${batchNo}, rows=${rows}, elapsed=${Math.round(performance.now()-since)}ms`); };
    // Halaman 0 sendirian -> tabel kecil selesai 1 request, tanpa request kosong tambahan.
    let tb = performance.now();
    const first = await fetchPageWithRetry(table, columns, orderCol, 0);
    batchNo++; nextPage = 1;
    if(first.length){ chunks.push(first); total += first.length; }
    logBatch(first.length, tb);
    done = first.length < FETCH_PAGE_SIZE;            // tepat FETCH_PAGE_SIZE => mungkin masih ada halaman berikutnya
    while(!done){
      const idxs = [];
      for(let i=0;i<BATCH_CONCURRENCY;i++) idxs.push(nextPage + i);
      tb = performance.now();
      const results = await Promise.all(idxs.map(p=> fetchPageWithRetry(table, columns, orderCol, p)));   // urutan = urutan halaman
      batchNo++;
      let waveRows = 0;
      for(const data of results){
        if(data.length){ chunks.push(data); total += data.length; waveRows += data.length; }
        if(data.length < FETCH_PAGE_SIZE) done = true;
      }
      logBatch(waveRows, tb);
      nextPage += BATCH_CONCURRENCY;
    }
    const all = chunks.length === 1 ? chunks[0] : Array.prototype.concat.apply([], chunks);
    chunks.length = 0;            // lepas referensi chunk agar bisa di-GC; baris-nya sendiri tidak di-clone
    if(MB_DEBUG_FETCH) console.info(`[Mineboard] ${table}: selesai, rows=${all.length}, requests-wave=${batchNo}, elapsed=${Math.round(performance.now()-t0)}ms`);
    // [OFFLINE ENGINE] Write-through cache: setiap fetch yang berhasil disimpan ke IndexedDB
    // agar bisa dipakai sebagai fallback saat offline. Tidak boleh mengganggu alur utama.
    if(typeof OfflineEngine!=='undefined') OfflineEngine.cacheTable(table, all).catch(()=>{});
    SESSION_FETCHED_TABLES.add(table);
    if(meta) meta.source = 'network';
    return all;
  }catch(error){
    // [OFFLINE ENGINE] Gagal fetch (jaringan terputus di tengah jalan) -> fallback ke cache lokal.
    // Cache valid TIDAK dihapus/ditimpa pada kegagalan (cacheTable hanya dipanggil setelah semua halaman sukses).
    const cached = (typeof OfflineEngine!=='undefined') ? await OfflineEngine.getCachedTable(table) : null;
    const emsg = (error && error.message) || String(error);
    // [HARDENING] log developer: table / operation / status / message (user hanya melihat "Retry").
    console.error(`[Mineboard][fetch] table=${table} op=select status=${(error && (error.status||error.code)) || 'n/a'} message=${emsg} fallback=${cached ? 'cache' : 'none'}`, error);
    if(cached){ if(meta){ meta.source = 'cache-fallback'; meta.error = emsg; } return cached; }
    if(meta) meta.error = emsg;
    throw new Error(`${table}: ${emsg}`);
  }
}

/* ---------- LOAD SEMUA DATA DARI SUPABASE ----------
   Menggantikan generateAllData() versi dummy lokal. Struktur field pada
   setiap objek sengaja dibuat identik dengan versi lama (RECORDS, UNITS,
   OPERATORS, dst.) supaya seluruh fungsi render_* di bawah tidak perlu
   diubah sama sekali.
------------------------------------------------------------------ */
/* [SUPABASE REWIRE 2026-09] loadAllData() ditulis ulang total dari schema nyata
   "Bangun data tambang" (gdfvzfqherygmiqyvvsy). PITS/FLEET_DEFS/UNITS/OPERATORS
   dipertahankan sebagai nama variabel (supaya filter bar & fungsi lain yang belum
   direwire tidak langsung pecah), TAPI isinya sekarang dari tabel & kolom real:
   - PITS      <- master_locations (location_type='LOADING_POINT')
   - FLEET_DEFS<- master_fleets
   - UNITS     <- master_units (gabungan digger EXCAVATOR + hauler HAULER)
   - OPERATORS <- master_employees (position='Operator Exca')
   - DRIVERS   <- master_employees (position='Driver Hauler') [BARU]
   - RECORDS   <- production_actual (grain HOURLY, bukan daily)
   - MINE_PLAN <- plan_daily_generated (Mine Plan → Generated Plan; sumber Plan untuk semua modul)
   - UNIT_STATUS     <- unit_status_actual [BARU, sumber PA/UA yang benar]
   - DELAY_EVENTS / IDLE_EVENTS <- delay_events / idle_events [BARU]
   TIDAK ADA field cost/fuel/calorie/cycle-time/fatigue di sini karena memang tidak
   ada tabel sumbernya (lihat AUDIT_MINEBOARD_vs_BANGUN_DATA_TAMBANG.md bagian E). */
// [PERF 2026-10] Mapping/transformasi mentah->model dipisah dari proses fetch supaya bisa
// dipakai ulang oleh DUA jalur: (1) loadAllData() — fetch asli dari Supabase, dan
// (2) render instan dari cache IndexedDB (lihat tryInstantRenderFromCache() di bawah, dekat
// DOMContentLoaded). Isi/logic mapping PERSIS SAMA seperti sebelumnya, hanya dipindah ke
// dalam fungsi terpisah — tidak ada rumus/KPI/urutan yang berubah.
// Normalisasi Mine Plan (plan_daily_generated) -> model Plan global MINE_PLAN.
// planned_volume / planned_ritase = hasil Generate Plan Mine Plan (OB = BCM, CO = MT).
function mapMinePlanRows(raw, lk){
  return (raw||[]).map(p=> ({
    date:p.plan_date, shift:lk.shiftNameByCode[p.shift_code]||p.shift_code, shiftCode:p.shift_code,
    fleet:lk.fleetNameByCode[p.fleet_code]||p.fleet_code, fleetCode:p.fleet_code,
    material:lk.materialNameByCode[p.material_code]||p.material_code, materialCode:p.material_code,
    stream:lk.materialStreamByCode[p.material_code]||null,
    targetRitase:Number(p.planned_ritase)||0, targetVolume:Number(p.planned_volume)||0,
    volumeUnit:p.volume_unit||null
  }));
}
const MINE_PLAN_COLS = 'plan_date,shift_code,fleet_code,material_code,planned_ritase,planned_volume,volume_unit,gen_id';
// Dipanggil setelah Mine Plan di-generate/diubah, supaya seluruh dashboard membaca Plan terbaru.
async function reloadMinePlan(){
  if(!_PLAN_LOOKUPS) return;
  try{
    const raw = await fetchAll('plan_daily_generated', MINE_PLAN_COLS, ['plan_date','gen_id']);
    MINE_PLAN = mapMinePlanRows(raw, _PLAN_LOOKUPS);
    if(typeof invalidateFilterCache === 'function') invalidateFilterCache();
  }catch(e){ console.warn('[Mine Plan] reload Plan gagal:', e); }
}
/* [CATEGORY LABEL 2026-10] unit_status_actual.category untuk Breakdown menyimpan category_id (UUID) dari
   master_failure_categories (lihat Daily Input: category = row.bdcat). UUID itu HANYA boleh dipakai internal;
   label yang tampil ke user di-resolve di sini dari master yang SUDAH ADA (bukan tabel/mapping baru, tanpa
   hardcode). Nilai non-UUID (mis. 'Idle', 'Delay', 'Data belum tersedia') dikembalikan apa adanya. */
let FAIL_CAT_BY_ID = {};
const _UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const _CAT_WARNED = new Set();
function getCategoryLabel(categoryId){
  if(categoryId===null || categoryId===undefined) return '';
  const raw = String(categoryId).trim();
  if(!raw) return '';
  if(!_UUID_RE.test(raw)) return raw;                       // bukan UUID -> sudah berupa label
  const f = FAIL_CAT_BY_ID[raw.toLowerCase()];
  if(f) return f;
  if(!_CAT_WARNED.has(raw)){ _CAT_WARNED.add(raw); console.warn('[Mineboard][category] category_id tidak ada di master_failure_categories:', raw); }
  return 'Unknown Category';                                // jangan pernah menampilkan UUID mentah
}
function applyLoadedTables(t){
  const { shiftsRaw, locsRaw, fleetsRaw, unitsRaw, empRaw, materialsRaw,
          prodRaw, minePlanRaw, statusRaw, fuelRaw, delayRaw, idleRaw, otRaw, delayCodeRaw, idleCodeRaw } = t;
  const failCatRaw = t.failCatRaw || [];
  FAIL_CAT_BY_ID = {};
  failCatRaw.forEach(c=>{
    if(!c || c.category_id==null) return;
    const code = (c.category_code||'').toString().trim(), nm = (c.category_name||'').toString().trim();
    FAIL_CAT_BY_ID[String(c.category_id).toLowerCase()] = (code && nm) ? (code+' \u2014 '+nm) : (nm || code || 'Unknown Category');
  });

  const shiftNameByCode = {}; const shiftHoursByCode = {};
  shiftsRaw.forEach(s=>{ shiftNameByCode[s.shift_code]=s.shift_name; shiftHoursByCode[s.shift_code]=Number(s.duration_hours); });
  SHIFTS = shiftsRaw.map(s=>s.shift_name);
  // [HOURLY NORMALIZATION AUDIT 2026-09] expose globally — computePAUA/getUnifiedStandbyHours butuh ini.
  SHIFT_HOURS_BY_CODE = shiftHoursByCode;
  SHIFT_HOURS_BY_NAME = {}; shiftsRaw.forEach(s=> SHIFT_HOURS_BY_NAME[s.shift_name]=Number(s.duration_hours));

  const locNameByCode = {};
  locsRaw.forEach(l=> locNameByCode[l.location_code]=l.location_name);
  PITS = locsRaw.filter(l=> l.location_type==='LOADING_POINT').map(l=> ({ id:l.location_code, name:l.location_name }));

  const fleetNameByCode = {};
  fleetsRaw.forEach(f=> fleetNameByCode[f.fleet_code]=f.fleet_name);
  FLEET_DEFS = fleetsRaw.map(f=> ({ id:f.fleet_code, name:f.fleet_name }));

  UNITS = unitsRaw.map(u=> ({
    id:u.unit_code, dbId:u.unit_code, name:u.unit_name, role:u.unit_role_code,
    capacity:Number(u.capacity)||0, active:!!u.is_active,
    // [FUEL 2026-09] equipmentType/equipmentCategory — dipakai halaman Fuel & Equipment untuk
    // mengelompokkan Digger/Hauler/Dozer/Grader/Support/Water Truck (dari master_units langsung).
    equipmentType:u.equipment_type, equipmentCategory:u.equipment_category
    // Catatan: master_units TIDAK punya kolom fleet — assignment fleet unit sifatnya dinamis
    // per transaksi (production_actual/unit_status_actual), bukan atribut statis unit.
    // Lihat unitFleetObserved() di bawah untuk fleet yang teramati dari data transaksi.
  }));

  OPERATORS = empRaw.filter(e=> e.position==='Operator Exca').map(e=> ({ id:e.employee_code, dbId:e.employee_code, name:e.employee_name, active:!!e.is_active }));
  DRIVERS    = empRaw.filter(e=> e.position==='Driver Hauler').map(e=> ({ id:e.employee_code, dbId:e.employee_code, name:e.employee_name, active:!!e.is_active }));
  const empNameByCode = {}; empRaw.forEach(e=> empNameByCode[e.employee_code]=e.employee_name);

  const materialNameByCode = {}; const materialStreamByCode = {};
  materialsRaw.forEach(m=>{ materialNameByCode[m.material_code]=m.material_name; materialStreamByCode[m.material_code]=m.production_stream; });
  MATERIALS = materialsRaw.map(m=> ({ code:m.material_code, name:m.material_name, category:m.material_category, stream:m.production_stream }));

  // ---- Production (fact table utama, grain HOURLY) ----
  RECORDS = prodRaw.map(r => {
    const dateObj = new Date(r.actual_date + 'T00:00:00');
    return {
      date:r.actual_date, dateObj, year:dateObj.getFullYear(), month:dateObj.getMonth(), week:U.isoWeek(dateObj), day:dateObj.getDate(),
      hour:r.hour_label,
      shift:shiftNameByCode[r.shift_code] || r.shift_code, shiftCode:r.shift_code,
      pit:locNameByCode[r.location_code] || null, locationCode:r.location_code,
      fleet:fleetNameByCode[r.fleet_code] || r.fleet_code, fleetCode:r.fleet_code,
      digger:r.digger_unit_code, hauler:r.hauler_unit_code,
      operator:empNameByCode[r.operator_code] || null, driver:empNameByCode[r.driver_code] || null,
      operatorCode:r.operator_code, driverCode:r.driver_code,
      material:materialNameByCode[r.material_code] || r.material_code, materialCode:r.material_code,
      stream:materialStreamByCode[r.material_code] || null,
      ritase:Number(r.ritase)||0, distanceKm:Number(r.distance_km)||0,
      productionVolume:Number(r.production_volume)||0, volumeUnit:r.volume_unit || 'BCM',
      assignmentSource:r.assignment_source,
      _shiftCode:r.shift_code, _fleetCode:r.fleet_code
    };
  });
  YEAR = RECORDS.length ? RECORDS[0].year : new Date().getFullYear();

  // ---- Plan (Mine Plan → Generated Plan, untuk Plan vs Actual) ----
  _PLAN_LOOKUPS = { shiftNameByCode, fleetNameByCode, materialNameByCode, materialStreamByCode };
  MINE_PLAN = mapMinePlanRows(minePlanRaw, _PLAN_LOOKUPS);

  // ---- Unit status (sumber PA/UA yang benar) ----
  UNIT_STATUS = statusRaw.map(s=> ({
    date:s.status_date, shift:shiftNameByCode[s.shift_code]||s.shift_code, shiftCode:s.shift_code,
    unit:s.unit_code, fleet:fleetNameByCode[s.fleet_code]||s.fleet_code, fleetCode:s.fleet_code,
    status:s.status, category:getCategoryLabel(s.category), categoryId:s.category, durationHours:Number(s.duration_hours)||0,
    dataSource:s.data_source, hourLabel:s.hour_label
  }));

  // ---- Fuel (fuel_actual — konsumsi bahan bakar per unit+tanggal+shift) ----
  FUEL_ACTUAL = fuelRaw.map(f=> ({
    date:f.fuel_date, shift:shiftNameByCode[f.shift_code]||f.shift_code, shiftCode:f.shift_code,
    unit:f.unit_code, fleet:fleetNameByCode[f.fleet_code]||f.fleet_code, fleetCode:f.fleet_code,
    fuelLiters:Number(f.fuel_liters)||0, operatingHours:Number(f.operating_hours)||0,
    dataSource:f.data_source
  }));

  // ---- Delay & Idle events ----
  const delayNameByCode = {}; delayCodeRaw.forEach(d=> delayNameByCode[d.delay_code]=d.delay_name);
  const idleNameByCode = {}; idleCodeRaw.forEach(d=> idleNameByCode[d.idle_code]=d.idle_name);
  DELAY_EVENTS = delayRaw.map(d=> ({
    date:d.event_date, shift:shiftNameByCode[d.shift_code]||d.shift_code, shiftCode:d.shift_code, fleet:fleetNameByCode[d.fleet_code]||d.fleet_code,
    unit:d.unit_code, code:d.delay_code, name:delayNameByCode[d.delay_code]||d.delay_code, hours:Number(d.duration_hours)||0, hourLabel:d.hour_label
  }));
  IDLE_EVENTS = idleRaw.map(d=> ({
    date:d.event_date, shift:shiftNameByCode[d.shift_code]||d.shift_code, shiftCode:d.shift_code, scope:d.scope,