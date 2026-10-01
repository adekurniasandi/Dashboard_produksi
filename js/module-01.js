
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
    date:d.event_date, shift:shiftNameByCode[d.shift_code]||d.shift_code, shiftCode:d.shift_code, scope:d.scope,    fleet:fleetNameByCode[d.fleet_code]||d.fleet_code, unit:d.unit_code,
    code:d.idle_code, name:idleNameByCode[d.idle_code]||d.idle_code, hours:Number(d.duration_hours)||0, hourLabel:d.hour_label
  }));
  // ---- OT events (overtime aktual, TERPISAH dari scheduled_hours/produksi/delay — lihat ot_events
  // di Supabase; termasuk 140 historical OT Work End 17-18 Shift D, source
  // HISTORICAL_RECONSTRUCTED_OT, dibaca apa adanya di sini, TIDAK di-generate ulang oleh frontend) ----
  OT_EVENTS = (otRaw||[]).map(o=> ({
    date:o.event_date, shift:shiftNameByCode[o.shift_code]||o.shift_code, shiftCode:o.shift_code,
    fleet:fleetNameByCode[o.fleet_code]||o.fleet_code, unit:o.unit_code, hourLabel:o.hour_label,
    hours:Number(o.duration_hours)||0, source:o.source
  }));
  // [PERF 2026-09] dataset sumber baru saja diganti (initial load, refresh, atau update dari cache
  // bridge) — buang cache getFiltered*() lama supaya tidak pernah menampilkan hasil filter dari
  // dataset sebelumnya (lihat memoFiltered/invalidateFilterCache di getFiltered()).
  if(typeof invalidateFilterCache === 'function') invalidateFilterCache();
  DATA_LOADED_AT = new Date();
}

/* ============================================================
   [HARDENING] DATA LOAD STATE — status / progress / partial / retry
   ------------------------------------------------------------
   Satu sumber kebenaran status load dashboard. Progress = bobot TABEL yang benar-benar selesai
   di-fetch (bukan timer): 6 master = 20, tabel fakta = 70, tahap turunan (applyLoadedTables:
   mapping/lookup/invalidate cache) = 10. Monoton naik; 100% HANYA jika semua tabel berhasil dari
   server (atau cache saat offline) dan tahap turunan sukses. Array kosong TIDAK dipakai sebagai
   penanda "belum selesai" — penandanya DATA_STATE.status / hasData / modelMissing.
   ============================================================ */
const DATA_SPEC = [
  { key:'shiftsRaw',    table:'master_shifts',    cols:'shift_code,shift_name,duration_hours', group:'master', w:20/6, label:'Master Shift' },
  { key:'locsRaw',      table:'master_locations', cols:'location_code,location_name,location_type', group:'master', w:20/6, label:'Master Lokasi' },
  { key:'fleetsRaw',    table:'master_fleets',    cols:'fleet_code,fleet_name', group:'master', w:20/6, label:'Master Fleet' },
  // [CATEGORY LABEL 2026-10] master yang sudah ada; optional = kegagalan TIDAK menggate dashboard (label jatuh ke 'Unknown Category').
  { key:'failCatRaw',   table:'master_failure_categories', cols:'category_id,category_code,category_name', group:'master', w:1, label:'Master Kategori Breakdown', optional:true },
  { key:'unitsRaw',     table:'master_units',     cols:'unit_code,unit_name,unit_role_code,capacity,is_active,equipment_type,equipment_category', group:'master', w:20/6, label:'Master Unit' },
  { key:'empRaw',       table:'master_employees', cols:'employee_code,employee_name,position,is_active', group:'master', w:20/6, label:'Master Karyawan' },
  { key:'materialsRaw', table:'master_materials', cols:'material_code,material_name,material_category,production_stream,density_t_bcm', group:'master', w:20/6, label:'Master Material' },
  { key:'prodRaw',      table:'production_actual', cols:'actual_date,hour_label,shift_code,location_code,fleet_code,digger_unit_code,hauler_unit_code,operator_code,driver_code,material_code,ritase,distance_km,production_volume,volume_unit,assignment_source', order:'actual_date', group:'fact', w:20, label:'Production' },
  { key:'minePlanRaw',  table:'plan_daily_generated', cols:null /* MINE_PLAN_COLS */, order:['plan_date','gen_id'], group:'fact', w:3, label:'Mine Plan' },
  { key:'statusRaw',    table:'unit_status_actual', cols:'status_date,shift_code,unit_code,fleet_code,status,category,duration_hours,data_source,hour_label', order:'status_date', group:'fact', w:25, label:'Unit Status' },
  { key:'fuelRaw',      table:'fuel_actual',      cols:'fuel_date,shift_code,unit_code,fleet_code,fuel_liters,operating_hours,data_source', order:'fuel_date', group:'fact', w:8, label:'Fuel' },
  { key:'delayRaw',     table:'delay_events',     cols:'event_date,shift_code,fleet_code,unit_code,delay_code,duration_hours,hour_label', order:'event_date', group:'fact', w:5, label:'Delay' },
  { key:'idleRaw',      table:'idle_events',      cols:'event_date,shift_code,scope,fleet_code,unit_code,idle_code,duration_hours,hour_label', order:'event_date', group:'fact', w:5, label:'Idle' },
  { key:'otRaw',        table:'ot_events',        cols:'event_date,shift_code,unit_code,fleet_code,hour_label,duration_hours,source', order:'event_date', group:'fact', w:2, label:'OT' },
  { key:'delayCodeRaw', table:'master_delays',    cols:'delay_code,delay_name', group:'fact', w:1, label:'Kode Delay' },
  { key:'idleCodeRaw',  table:'master_idles',     cols:'idle_code,idle_name', group:'fact', w:1, label:'Kode Idle' }
];
const DATA_STATE = {
  status:'loading',      // 'loading' | 'ready' | 'partial' | 'error'
  progress:0, error:null, partial:false,
  hasData:false,         // model global (RECORDS, UNIT_STATUS, ...) sudah pernah diisi (dari server / cache)
  fromCache:false,       // seluruh data berasal dari cache IndexedDB (offline), bukan server
  refreshing:false,      // reload latar belakang (realtime/refresh) — data lama tetap valid dan tampil
  busy:false, tok:0, retries:0, loadedAt:null,
  done:{}, failed:{}, stale:{}, srcCache:{},
  modelMissing:[]        // key tabel yang TIDAK punya data sama sekali di model saat ini (bukan sekadar kosong)
};
let DATA_RAW = null;     // hasil fetch mentah — hanya disimpan selama status != ready (untuk Retry tanpa fetch ulang)
const DATA_PAGE_FREE = new Set(['daily_input','admin','settings','mine_plan']);   // punya loader sendiri / tidak baca model global

function dataStateBump(){
  const S = DATA_STATE; let sum = 0;
  DATA_SPEC.forEach(sp=>{ if(S.done[sp.key]) sum += sp.w; });
  S.progress = Math.max(S.progress, Math.min(90, Math.round(sum)));   // monoton; 90 -> 100 hanya setelah tahap turunan sukses
  dataStateRender();
}
function dataStateLabels(keys){ return keys.map(k=>{ const sp = DATA_SPEC.find(x=>x.key===k); return sp ? sp.label : k; }).join(', '); }
function dataStateRender(){
  const S = DATA_STATE, c = document.getElementById('dataStatusChip'); if(!c) return;
  const p = Math.round(S.progress);
  let cls, txt;
  if(S.status==='loading'){ cls='loading'; txt = `${S.fromCache ? 'Syncing' : 'Loading data'} ${p}%`; }   // 'Syncing' = dashboard sudah tampil dari cache, menunggu server
  else if(S.refreshing){ cls='loading'; txt = `Refreshing ${p}%`; }
  else if(S.status==='ready'){ cls='ready'; txt = `${S.fromCache ? '✓ Cache' : '✓ Ready'} 100%`; }
  else if(S.status==='partial'){ cls='partial'; txt = '⚠ Data incomplete · Retry'; }
  else { cls='error'; txt = '⚠ Gagal memuat · Retry'; }
  c.className = 'dl-chip ' + cls;
  c.style.setProperty('--dl-p', p + '%');
  const t = document.getElementById('dataStatusTxt'); if(t) t.textContent = txt;
  const lines = DATA_SPEC.map(sp=> (S.failed[sp.key] ? '⚠ ' : S.stale[sp.key] ? '⚠ ' : S.done[sp.key] ? '✓ ' : '… ') + sp.label + (S.failed[sp.key] ? ' — gagal' : S.stale[sp.key] ? ' — cache (server gagal)' : ''));
  c.title = (S.fromCache && S.status==='ready' ? 'Data dari cache lokal (offline), bukan server.\n' : '') + lines.join('\n');
  const g = document.getElementById('dlGatePct'); if(g) g.textContent = p + '%';
}
function dataChipClick(){ if(DATA_STATE.status==='partial' || DATA_STATE.status==='error') retryDataLoad(); }

// Panel pengganti halaman selama data kritis belum siap. Mengembalikan null jika halaman boleh dirender normal.
function dataGateHtml(page){
  const S = DATA_STATE;
  if(DATA_PAGE_FREE.has(page)) return null;
  const kpi = `<div class="dl-gate-kpi">${['Volume','Achievement','PA','UA'].map(l=>`<div><small>${l}</small><b>—</b></div>`).join('')}</div>`;
  const loadingBox = `${kpi}<div class="glass p-6 text-sm" style="color:var(--text-dim)">Memuat data… <b id="dlGatePct">${Math.round(S.progress)}%</b><div class="text-xs mt-1" style="color:var(--text-faint)">Angka ditampilkan setelah data selesai dimuat — bukan 0.</div></div>`;
  if(!S.hasData){
    if(S.status==='loading') return loadingBox;
    const why = S.error ? esc(S.error) : 'Terjadi kesalahan saat memuat data.';
    return `${kpi}<div class="glass p-6 text-sm" style="color:var(--text-dim)"><div style="color:var(--danger)"><b>Data gagal dimuat</b></div><div class="text-xs mt-1" style="color:var(--text-faint)">${why}</div><button class="btn btn-accent mt-3" onclick="retryDataLoad()">Retry</button></div>`;
  }
  if(S.modelMissing.length){
    if(S.status==='loading') return loadingBox;
    return `${kpi}<div class="glass p-6 text-sm" style="color:var(--text-dim)"><div style="color:var(--warning)"><b>Data belum lengkap</b></div><div class="text-xs mt-1" style="color:var(--text-faint)">Gagal dimuat: ${esc(dataStateLabels(S.modelMissing))}. Halaman ini tidak ditampilkan agar tidak menunjukkan angka 0 yang palsu.</div><button class="btn btn-accent mt-3" onclick="retryDataLoad()">Retry</button></div>`;
  }
  return null;
}

async function loadAllData(opts){
  opts = opts || {};
  const S = DATA_STATE, tok = ++S.tok;
  const retry = !!(opts.only && opts.only.length && DATA_RAW);
  const background = !!opts.background && S.hasData && !retry;
  const raw = retry ? Object.assign({}, DATA_RAW) : {};
  const stale = {};
  S.done = {}; S.failed = {}; S.srcCache = {}; S.error = null; S.busy = true;
  if(retry) Object.keys(raw).forEach(k=>{ if(!opts.only.includes(k)) S.done[k] = true; });
  S.progress = 0; S.refreshing = background;
  if(!background) S.status = 'loading';
  dataStateBump();

  // [PERF 2026-09] Dua gelombang PARALEL seperti semula (6 master, lalu semua tabel fakta bersamaan).
  // Tidak ada fetch tambahan / duplikat: progress hanya memakai siklus hidup request yang sama.
  const step = async sp=>{
    const meta = {};
    try{
      const rows = await fetchAll(sp.table, sp.cols || MINE_PLAN_COLS, sp.order || null, meta);
      if(tok !== S.tok) return;
      raw[sp.key] = rows; S.done[sp.key] = true;
      if(meta.source === 'cache-fallback') stale[sp.key] = meta.error || 'network error';
      if(meta.source === 'cache') S.srcCache[sp.key] = true;
    }catch(e){
      if(tok !== S.tok) return;
      S.failed[sp.key] = (e && e.message) || String(e);
      if(sp.optional){ raw[sp.key] = []; console.warn('[Mineboard][load] tabel opsional gagal dimuat:', sp.table, S.failed[sp.key]); }
    }
    dataStateBump();
  };
  const want = DATA_SPEC.filter(sp=> !retry || opts.only.includes(sp.key));
  await Promise.all(want.filter(sp=>sp.group==='master').map(step));
  if(tok !== S.tok) return S;    // dibatalkan oleh load yang lebih baru — hasil ini DIBUANG
  await Promise.all(want.filter(sp=>sp.group==='fact').map(step));
  if(tok !== S.tok) return S;

  const missing = DATA_SPEC.filter(sp=> raw[sp.key] === undefined).map(sp=>sp.key);
  const staleKeys = Object.keys(stale);
  S.stale = stale;
  let applied = false;
  const failApply = e=>{
    console.error('[Mineboard][apply] op=applyLoadedTables status=n/a message=' + ((e && e.message) || e), e);
    S.busy = false; S.refreshing = false; S.error = 'Gagal memproses data.';
    S.status = S.hasData ? 'partial' : 'error'; S.partial = true; DATA_RAW = Object.assign({}, DATA_RAW || {}, raw);
    dataStateRender();
  };
  if(!missing.length){
    try{ applyLoadedTables(raw); applied = true; }catch(e){ failApply(e); if(!S.hasData) throw e; return S; }
  } else if(!S.hasData){
    if(missing.length === DATA_SPEC.length){
      S.busy = false; S.refreshing = false; S.status = 'error'; S.partial = true;
      S.error = 'Semua tabel gagal dimuat (' + (Object.values(S.failed)[0] || 'koneksi bermasalah') + ')';
      dataStateRender();
      throw new Error(S.error);
    }
    // Pertama kali & sebagian gagal: isi model dengan yang berhasil; halaman yang butuh tabel gagal DIGATE
    // (dataGateHtml) sehingga tidak pernah menampilkan 0 palsu dari array kosong pengganti.
    const partialRaw = {}; DATA_SPEC.forEach(sp=>{ partialRaw[sp.key] = raw[sp.key] || []; });
    try{ applyLoadedTables(partialRaw); applied = true; }catch(e){ failApply(e); throw e; }
  }
  // else: model lama (server/cache sebelumnya) masih utuh & konsisten — TIDAK ditimpa dengan dataset parsial.

  S.busy = false; S.refreshing = false; S.loadedAt = new Date();
  if(applied){
    S.hasData = true; S.modelMissing = missing;
    dataStateBump();
    if(!missing.length && !staleKeys.length){
      S.status = 'ready'; S.partial = false; S.progress = 100; S.error = null; S.retries = 0;
      S.fromCache = Object.keys(S.srcCache).length === DATA_SPEC.length;   // cache hanya jika SEMUA tabel dari cache (offline)
      DATA_RAW = null;
    } else {
      S.status = 'partial'; S.partial = true; S.fromCache = false; S.progress = Math.min(99, S.progress + 10);
      S.error = 'Sebagian data gagal dimuat: ' + dataStateLabels(missing.concat(staleKeys));
      DATA_RAW = raw;
    }
  } else {
    S.status = 'partial'; S.partial = true; S.progress = Math.min(99, S.progress);
    S.error = 'Refresh gagal: ' + dataStateLabels(Object.keys(S.failed));
    DATA_RAW = Object.assign({}, DATA_RAW || {}, raw);
  }
  console.info(`[Mineboard][load] status=${S.status} progress=${S.progress} failed=[${Object.keys(S.failed)}] stale=[${staleKeys}] missing=[${missing}]`);
  dataStateRender();
  return S;
}
// Retry manual (tanpa loop otomatis): hanya mengambil ulang tabel yang gagal / dari cache-fallback,
// tabel yang sudah berhasil dipakai ulang dari DATA_RAW (tidak ada fetch/render ganda).
async function retryDataLoad(){
  const S = DATA_STATE;
  if(S.busy) return;
  S.retries++;
  const keys = [...new Set([...Object.keys(S.failed), ...Object.keys(S.stale), ...S.modelMissing])];
  try{
    await loadAllData({ only: DATA_RAW && keys.length ? keys : null });
    buildFilterBar(); renderPage();
  }catch(err){
    console.error('[Mineboard][retry] gagal:', err);
    renderPage();
  }
}

// [PERF 2026-10] Render INSTAN dari cache IndexedDB (OfflineEngine), dipakai HANYA sebagai
// jembatan tampilan awal sebelum data asli dari Supabase datang — bukan pengganti loadAllData().
// - Tidak menembak network sama sekali (hanya baca IndexedDB via getCachedTable, generic,
//   sudah ada sebelumnya — cara nyimpannya juga tidak berubah, cacheTable() dipanggil apa
//   adanya oleh fetchAll() seperti sebelumnya untuk SEMUA tabel, termasuk tabel fakta).
// - HANYA merender jika SEMUA tabel yang dibutuhkan loadAllData() ada di cache (tidak pernah
//   merender sebagian/parsial dari cache, supaya tidak ada widget yang tampil dengan gabungan
//   data yang tidak konsisten).
// - loadAllData() (network) TETAP selalu dijalankan setelah ini sebagai satu-satunya sumber
//   kebenaran akhir (lihat DOMContentLoaded) — cache di sini murni mempercepat apa yang
//   terlihat oleh user, bukan menggantikan proses fetch yang sudah ada.
const STARTUP_CACHE_TABLE_MAP = {
  shiftsRaw:'master_shifts', locsRaw:'master_locations', fleetsRaw:'master_fleets',
  unitsRaw:'master_units', empRaw:'master_employees', materialsRaw:'master_materials', failCatRaw:'master_failure_categories',
  prodRaw:'production_actual', minePlanRaw:'plan_daily_generated', statusRaw:'unit_status_actual',
  fuelRaw:'fuel_actual', delayRaw:'delay_events', idleRaw:'idle_events', otRaw:'ot_events',
  delayCodeRaw:'master_delays', idleCodeRaw:'master_idles'
};
async function tryInstantRenderFromCache(){
  try{
    if(typeof OfflineEngine==='undefined' || typeof OfflineEngine.getCachedTable!=='function') return false;
    const keys = Object.keys(STARTUP_CACHE_TABLE_MAP);
    const rowsArr = await Promise.all(keys.map(k => OfflineEngine.getCachedTable(STARTUP_CACHE_TABLE_MAP[k])));
    const t = {};
    for(let i=0;i<keys.length;i++){
      // Cache tidak lengkap (mis. pertama kali dipakai, atau IndexedDB baru dibersihkan) ->
      // JANGAN render parsial dari campuran ada/tidak ada data, supaya tidak ada widget yang
      // sempat menampilkan angka yang salah/tidak konsisten. Overlay tetap tampil menunggu
      // loadAllData() (network) seperti perilaku semula.
      if(!rowsArr[i]) return false;
      t[keys[i]] = rowsArr[i];
    }
    applyLoadedTables(t);
    // [HARDENING] data cache = data NYATA (bukan 0 palsu) tapi belum tentu terbaru: tandai hasData agar halaman boleh
    // dirender, sementara chip tetap menunjukkan 'Syncing' sampai loadAllData() (server) selesai.
    DATA_RAW = t; DATA_STATE.hasData = true; DATA_STATE.fromCache = true; DATA_STATE.modelMissing = [];
    return true;
  }catch(e){
    console.warn('[PERF] Render instan dari cache dilewati (tidak fatal):', e);
    return false;
  }
}

/* ---------- STATE ---------- */
let currentPage = 'overview';
let theme = 'dark';
let filters = { year:YEAR, month:'all', dayStart:'all', dayEnd:'all', shift:'all', pit:'all', fleet:'all', unit:'all', operator:'all' };

/* ---------- COMPANY PROFILE (diedit via Settings → Company Profile, tersimpan otomatis) ---------- */
const COMPANY_PROFILE_DEFAULT = {
  logoDataUrl: '', logoInitials: 'TNP',
  name: 'PT TAMBANG NUSANTARA PERSADA',
  address: 'Jl. Pertambangan Raya No. 88',
  city: 'Sangatta, Kutai Timur',
  province: 'Kalimantan Timur',
  postalCode: '75683',
  website: 'www.tambangnusantara.co.id',
  email: 'ops@tambangnusantara.co.id',
  phone: '+62 549 21 4455'
};
let COMPANY_PROFILE = { ...COMPANY_PROFILE_DEFAULT };
(function loadCompanyProfile(){
  try{
    const saved = JSON.parse(localStorage.getItem('mineboard_company_profile')||'null');
    if(saved) COMPANY_PROFILE = { ...COMPANY_PROFILE_DEFAULT, ...saved };
  }catch(e){ /* ignore corrupt storage */ }
})();
function setCompanyProfile(patch){
  COMPANY_PROFILE = { ...COMPANY_PROFILE, ...patch };
  try{ localStorage.setItem('mineboard_company_profile', JSON.stringify(COMPANY_PROFILE)); }catch(e){}
}
/* ---------- Small text-safety helpers used throughout the Reports document ---------- */
function esc(s){
  return String(s??'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
/* Renders a value, or an italic placeholder when the field hasn't been filled in yet. */
function cval(v, placeholder='Belum diisi'){
  const s = (v??'').toString().trim();
  return s ? esc(s) : `<span style="color:#AEB6C0;font-style:italic;">${esc(placeholder)}</span>`;
}

/* ---------- REPORT META (field yang bisa diisi ulang setiap kali laporan dibuat) ---------- */
const REPORT_META_DEFAULT = {
  docTitle:'Daily Mining Production Report', siteName:'Site Sangatta Utara', projectName:'Kontrak Penambangan Batubara 2026',
  docNumber:'MB-RPT-001', revisionNumber:'Rev. 00',
  mineSite:'Sangatta Utara', contractor:'PT Mitra Kontraktor Tambang', client:'PT Tambang Nusantara Persada',
  weather:'Cerah', superintendent:'-', pitControl:'-', engineer:'-', reportStatus:'Draft',
  preparedByName:'-', preparedByTitle:'MCC Staff', checkedByName:'-', checkedByTitle:'Mine Superintendent',
  approvedByName:'-', approvedByTitle:'Mine Manager'
};
let REPORT_META = { ...REPORT_META_DEFAULT };
(function loadReportMeta(){
  try{
    const saved = JSON.parse(localStorage.getItem('mineboard_report_meta')||'null');
    if(saved) REPORT_META = { ...REPORT_META_DEFAULT, ...saved };
  }catch(e){ /* ignore corrupt storage */ }
})();
function setReportMeta(key, val){
  REPORT_META[key] = val;
  try{ localStorage.setItem('mineboard_report_meta', JSON.stringify(REPORT_META)); }catch(e){}
}

/* ---------- NAV DEFINITION ---------- */
/* [SUPABASE REWIRE 2026-09] Grade Control, Drill & Blast, Infrastruktur (Crusher/Stockpile/Sump),
   Telematics, Cost Control, Fuel Usage, Safety dihapus dari navigasi — tidak ada tabel sumber
   data sama sekali di Bangun Data Tambang (lihat AUDIT_MINEBOARD_vs_BANGUN_DATA_TAMBANG.md
   bagian E), dan keputusan Anda: hilangkan section tanpa sumber data nyata, bukan tampilkan kosong. */
const NAV_GROUPS = [
  {
    title: 'Dashboard Utama',
    items: [
      {id:'overview', tag:'OV', label:'Overview', sub:'Ringkasan operasional tambang seluruh site'},
      {id:'exceptions', tag:'EX', label:'Exception Center', sub:'Masalah operasional, dampak, lokasi & event — drilldown dari data existing'},
      {id:'production', tag:'PR', label:'Production', sub:'Produksi per fleet, material & jam'},
    ]
  },
  {
    title: 'Perencanaan',
    items: [
      {id:'mine_plan', tag:'MP', label:'Mine Plan', sub:'Monthly assumption, fleet matching & generated plan — satu-satunya sumber Plan dashboard (tabel plan_*)'},
    ]
  },
  {
    title: 'Operasi & Fleet',
    items: [
      {id:'hauling', tag:'HL', label:'Hauling', sub:'Aktivitas pengangkutan material'},
      {id:'equipment', tag:'EQ', label:'Equipment', sub:'Status unit alat berat (Working/Standby/Breakdown)'},
      {id:'fuel', tag:'FU', label:'Fuel', sub:'Konsumsi bahan bakar & Fuel Ratio (fuel_actual)'},
      {id:'operator', tag:'OP', label:'Operator', sub:'Kinerja operator & driver'},
    ]
  },
  {
    title: 'Analisis',
    items: [
      {id:'maintenance', tag:'MT', label:'Breakdown', sub:'Detail unit Breakdown (unit_status_actual)'},
      {id:'delay', tag:'DL', label:'Delay', sub:'Controlled Standby — grafik & data delay_events'},
      {id:'idle', tag:'ID', label:'Idle', sub:'Uncontrolled Standby & Weather Global — grafik & data idle_events'},
      {id:'pa_ua', tag:'PU', label:'PA & UA', sub:'Physical Availability & Utilization — ranking per unit'},
      {id:'ai_insight', tag:'AI', label:'AI Insight', sub:'Pencapaian, Masalah & Analisis AI'},
      {id:'ai_summary', tag:'SM', label:'Daily / Shift Summary', sub:'Ringkasan produksi, fleet & losses sesuai filter'},
      {id:'ai_trend', tag:'TR', label:'Trend & Anomaly', sub:'Tren historis & deteksi anomali (min. 8 hari valid)'},
      {id:'ai_ask', tag:'AQ', label:'Ask AI', sub:'Tanya data dashboard aktif'},
      {id:'ai_history', tag:'HS', label:'Insight History', sub:'Status tindak lanjut & verifikasi (LocalStorage)'},
      {id:'reports', tag:'RP', label:'Reports', sub:'Laporan & ekspor data'},
      {id:'settings', tag:'ST', label:'Settings', sub:'Pengaturan tampilan & data'}
    ]
  },
  {
    title: 'Input Data (Admin/MCC)',
    items: [
      {id:'daily_input', tag:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>', label:'Daily Input', sub:'Input harian cepat untuk Admin/MCC — semua turunan dihitung otomatis'}
    ]
  },
  {
    title: 'Administrator',
    items: [
      {id:'admin', tag:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>', label:'Admin', sub:'Pusat pengelolaan master data, transaksi & database'}
    ]
  }
];

// Flat array for easy finding
const NAV = NAV_GROUPS.flatMap(g => g.items);
function navGroupTitle(id){ const g = NAV_GROUPS.find(g=> g.items.some(i=>i.id===id)); return g? g.title : ''; }

// Modern consistent icon set (24x24 stroke, lucide-style) — purely visual, does not replace n.tag which stays as fallback/accessible label.
const NAV_ICONS = {
  overview:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  production:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-6 3 3 5-8"/></svg>',
  grade_control:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  drilling:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M4.9 19.1l2.8-2.8M16.3 7.7l2.8-2.8"/></svg>',
  infra:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M5 21V9l6-5 6 5v12"/><path d="M9 21v-6h6v6"/></svg>',
  hauling:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="7" width="14" height="10" rx="1.5"/><path d="M15 10h4l3 3v4h-7z"/><circle cx="6" cy="19" r="1.6"/><circle cx="18" cy="19" r="1.6"/></svg>',
  telematics:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 13l3-3 2 2 5-5"/></svg>',
  equipment:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 1 5 5l-6.6 6.6a4 4 0 0 1-5-5z"/><path d="M4 20l3.5-3.5"/></svg>',
  operator:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>',
  cost:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c0-1.4-1.3-2.5-3-2.5s-3 1-3 2.5 1.3 2 3 2.5 3 1 3 2.5-1.3 2.5-3 2.5-3-1.1-3-2.5"/></svg>',
  maintenance:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a4 4 0 0 1 5 5l-6.6 6.6a4 4 0 0 1-5-5z"/><path d="M4 20l3.5-3.5"/><path d="M2 22l3-3"/></svg>',
  fuel:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 22V8l6-5 6 5v14"/><path d="M3 12h9"/><path d="M15 8h2l3 3v6a2 2 0 0 1-2 2h-1"/><circle cx="17.5" cy="17.5" r="1.2"/></svg>',
  safety:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M12 8v5M12 16.5v.1"/></svg>',
  ai_insight:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/><circle cx="12" cy="12" r="4"/></svg>',
  ai_summary:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/><circle cx="12" cy="12" r="4"/></svg>',
  ai_trend:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/><circle cx="12" cy="12" r="4"/></svg>',
  ai_ask:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/><circle cx="12" cy="12" r="4"/></svg>',
  ai_history:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/><circle cx="12" cy="12" r="4"/></svg>',
  reports:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></svg>',
  settings:'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>'
};

function buildSidebar(){
  const nav = document.getElementById('navList');
  let html = '';
  NAV_GROUPS.forEach(group => {
    html += `<div class="nav-group-title">${group.title}</div>`;
    group.items.forEach(n => {
      const iconHtml = NAV_ICONS[n.id] || n.tag;
      html += `
      <div class="nav-item ${n.id===currentPage?'active':''}" onclick="navigate('${n.id}')" data-nav="${n.id}" title="${n.label}">
        <div class="nav-badge">${iconHtml}</div>
        <div class="side-label">${n.label}</div>
      </div>
      `;
    });
  });
  nav.innerHTML = html;
}

function toggleSidebar(){
  const sb = document.getElementById('sidebar');
  sb.classList.toggle('collapsed');
  document.getElementById('sbToggleIcon').textContent = sb.classList.contains('collapsed')?'⟩⟩':'⟨⟨';
}
/* ---------- MOBILE SIDEBAR (hamburger + overlay + esc + outside click) ---------- */
function openMobileSidebar(){
  document.getElementById('sidebar').classList.add('mobile-open');
  document.getElementById('sidebarOverlay').classList.add('active');
  document.addEventListener('keydown', handleSidebarEscKey);
}
function closeMobileSidebar(){
  document.getElementById('sidebar').classList.remove('mobile-open');
  document.getElementById('sidebarOverlay').classList.remove('active');
  document.removeEventListener('keydown', handleSidebarEscKey);
}
function toggleMobileSidebar(){
  const isOpen = document.getElementById('sidebar').classList.contains('mobile-open');
  if(isOpen) closeMobileSidebar(); else openMobileSidebar();
}
function handleSidebarEscKey(e){
  if(e.key==='Escape' || e.key==='Esc') closeMobileSidebar();
}
/* Auto-close if viewport is resized/rotated past the mobile breakpoint while open */
const sidebarBreakpointMQ = window.matchMedia('(min-width:1025px)');
sidebarBreakpointMQ.addEventListener('change', (e)=>{ if(e.matches) closeMobileSidebar(); });

/* ---------- THEME ---------- */
function toggleTheme(){
  theme = theme==='dark'?'light':'dark';
  document.documentElement.classList.toggle('light', theme==='light');
  document.getElementById('themeBtn').textContent = theme==='dark'?'🌙 Dark':'☀️ Light';
  renderPage();
}

/* ---------- CLOCK ---------- */
function tickClock(){
  const now = new Date();
  document.getElementById('liveClock').textContent = now.toLocaleString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit',day:'2-digit',month:'short'});
}
setInterval(tickClock,1000);

/* ---------- FILTER BAR ---------- */
function uniqueSorted(arr){ return [...new Set(arr)].sort((a,b)=> a>b?1:-1); }

function buildFilterBar(){
  const months = [...Array(12).keys()];
  const days = [...Array(31).keys()].map(i => i + 1); 
  const bar = document.getElementById('filterBar');
  bar.innerHTML = `
    <select class="filter-select" id="f_month" onchange="onFilterChange('month',this.value)">
      <option value="all">Semua Bulan</option>
      ${months.map(m=>`<option value="${m}">${U.monthName(m)}</option>`).join('')}
    </select>
    <select class="filter-select" id="f_day_start" onchange="onFilterChange('dayStart',this.value)">
      <option value="all">Mulai Tgl</option>
      ${days.map(d=>`<option value="${d}">Tgl ${d}</option>`).join('')}
    </select>
    <select class="filter-select" id="f_day_end" onchange="onFilterChange('dayEnd',this.value)">
      <option value="all">Sampai Tgl</option>
      ${days.map(d=>`<option value="${d}">Tgl ${d}</option>`).join('')}
    </select>
    <select class="filter-select" id="f_shift" onchange="onFilterChange('shift',this.value)">
      <option value="all">Semua Shift</option>
      ${SHIFTS.map(s=>`<option value="${s}">${s}</option>`).join('')}
    </select>
    <select class="filter-select" id="f_pit" onchange="onFilterChange('pit',this.value)">
      <option value="all">Semua Pit</option>
      ${PITS.map(p=>`<option value="${p.name}">${p.name}</option>`).join('')}
    </select>
    <select class="filter-select" id="f_fleet" onchange="onFilterChange('fleet',this.value)">
      <option value="all">Semua Fleet</option>
      ${FLEET_DEFS.map(f=>`<option value="${f.name}">${f.name}</option>`).join('')}
    </select>
    <button class="btn no-print" onclick="resetFilters()">↺ Reset</button>
  `;
}

function onFilterChange(key,val){ filters[key]=val; renderPage(); }
function resetFilters(){
  filters = { year:YEAR, month:'all', dayStart:'all', dayEnd:'all', shift:'all', pit:'all', fleet:'all', unit:'all', operator:'all' };
  buildFilterBar();
  renderPage();
}

/* [PERF 2026-09] getFiltered()/getFilteredPlan()/getFilteredUnitStatus()/getFilteredDelay()/
   getFilteredIdle() masing-masing memfilter ulang array penuh (RECORDS dkk, bisa puluhan ribu
   baris) SETIAP KALI dipanggil — dan tiap halaman biasanya memanggil beberapa dari fungsi ini
   sekaligus (mis. render_overview: getFiltered + getFilteredPlan + getFilteredUnitStatus x2 lewat
   computePAUA). Selama filter (tanggal/shift/pit/fleet) belum berubah, hasilnya selalu identik —
   jadi di-cache di memori per kombinasi filter aktif, dan cache otomatis dibuang begitu filters
   berubah (key = JSON filters) ATAU dataset sumbernya dimuat ulang (loadAllData memanggil
   invalidateFilterCache()). Tidak mengubah logika/hasil filter sama sekali, murni cache.*/
let _filterCache = { key:null, data:{} };
function invalidateFilterCache(){ _filterCache = { key:null, data:{} }; }
function memoFiltered(name, compute){
  const key = JSON.stringify(filters);
  if(_filterCache.key !== key) _filterCache = { key, data:{} };
  if(!(name in _filterCache.data)) _filterCache.data[name] = compute();
  return _filterCache.data[name];
}
function getFiltered(){
  return memoFiltered('records', ()=> RECORDS.filter(r=>{
    if(filters.month!=='all' && r.month!=Number(filters.month)) return false;
    if(filters.dayStart!=='all' && r.day < Number(filters.dayStart)) return false;
    if(filters.dayEnd!=='all' && r.day > Number(filters.dayEnd)) return false;
    if(filters.shift!=='all' && r.shift!==filters.shift) return false;
    if(filters.pit!=='all' && r.pit!==filters.pit) return false;
    if(filters.fleet!=='all' && r.fleet!==filters.fleet) return false;
    return true;
  }));
}

/* [SUPABASE REWIRE 2026-09] Helper baru — filter UNIT_STATUS/MINE_PLAN/DELAY_EVENTS/
   IDLE_EVENTS pakai filter aktif yang sama (month/day/shift/fleet), supaya KPI PA/UA & Plan
   vs Actual di Overview/halaman lain konsisten dengan filter yang sedang dipakai user. */
function dateInFilter(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  if(filters.month!=='all' && d.getMonth()!=Number(filters.month)) return false;
  if(filters.dayStart!=='all' && d.getDate() < Number(filters.dayStart)) return false;
  if(filters.dayEnd!=='all' && d.getDate() > Number(filters.dayEnd)) return false;
  return true;
}
function getFilteredUnitStatus(){
  return memoFiltered('unitStatus', ()=> UNIT_STATUS.filter(s=>{
    if(!dateInFilter(s.date)) return false;
    if(filters.shift!=='all' && s.shift!==filters.shift) return false;
    if(filters.fleet!=='all' && s.fleet!==filters.fleet) return false;
    return true;
  }));
}
function getFilteredPlan(){
  return memoFiltered('plan', ()=> MINE_PLAN.filter(p=>{
    if(!dateInFilter(p.date)) return false;
    if(filters.shift!=='all' && p.shift!==filters.shift) return false;
    if(filters.fleet!=='all' && p.fleet!==filters.fleet) return false;
    return true;
  }));
}
function getFilteredDelay(){
  return memoFiltered('delay', ()=> DELAY_EVENTS.filter(d=>{
    if(!dateInFilter(d.date)) return false;
    if(filters.shift!=='all' && d.shift!==filters.shift) return false;
    if(filters.fleet!=='all' && d.fleet!==filters.fleet) return false;
    return true;
  }));
}
function getFilteredIdle(){
  return memoFiltered('idle', ()=> IDLE_EVENTS.filter(d=>{
    if(!dateInFilter(d.date)) return false;
    if(filters.shift!=='all' && d.shift!==filters.shift) return false;
    if(filters.fleet!=='all' && d.fleet!==filters.fleet) return false;
    return true;
  }));
}
/* [SUPABASE REWIRE 2026-11] OT (ot_events) — field TERPISAH dari scheduled/produksi/delay/idle.
   Dipakai HANYA untuk tampilan "OT Hours" (Dashboard, PA & UA) — TIDAK PERNAH dijumlahkan ke dalam
   computePAUA()'s scheduled/working/breakdown, sesuai aturan final "OT tidak menambah scheduled_hours". */
function getFilteredOT(){
  return memoFiltered('ot', ()=> OT_EVENTS.filter(d=>{
    if(!dateInFilter(d.date)) return false;
    if(filters.shift!=='all' && d.shift!==filters.shift) return false;
    if(filters.fleet!=='all' && d.fleet!==filters.fleet) return false;
    return true;
  }));
}
/* [FUEL 2026-09] Filter fuel_actual pakai filter aktif yang sama (bulan/hari/shift/fleet),
   konsisten dengan getFilteredUnitStatus() dkk di atas. */
function getFilteredFuel(){
  return memoFiltered('fuel', ()=> FUEL_ACTUAL.filter(f=>{
    if(!dateInFilter(f.date)) return false;
    if(filters.shift!=='all' && f.shift!==filters.shift) return false;
    if(filters.fleet!=='all' && f.fleet!==filters.fleet) return false;
    if(filters.unit!=='all' && f.unit!==filters.unit) return false;
    return true;
  }));
}
/* [FUEL 2026-09] Fuel Ratio Produksi — mencocokkan fuel_actual (per unit+tanggal, D+N
   dijumlahkan) dengan production_actual (unit sebagai digger ATAU hauler), dipisah per
   volumeUnit (BCM=OB, MT=Coal) supaya tidak pernah tercampur — meniru persis logika view
   v_fuel_ratio_daily di Supabase. Unit tanpa pasangan produksi (Dozer/Grader/Support/Water
   Truck/TLD90/backup digger tanpa histori) otomatis tidak masuk hitungan ini sama sekali. */
function computeFuelRatios(fuelRows, prodRows){
  const prodByKey = new Map();
  function addProd(unitCode, date, volUnit, vol){
    if(!unitCode || !volUnit) return;
    const k = unitCode+'|'+date+'|'+volUnit;
    prodByKey.set(k, (prodByKey.get(k)||0) + vol);
  }
  prodRows.forEach(r=>{
    addProd(r.digger, r.date, r.volumeUnit, r.productionVolume);
    addProd(r.hauler, r.date, r.volumeUnit, r.productionVolume);
  });
  const fuelByUnitDate = new Map();
  fuelRows.forEach(f=>{
    const k = f.unit+'|'+f.date;
    fuelByUnitDate.set(k, (fuelByUnitDate.get(k)||0) + f.fuelLiters);
  });
  let obFuel=0, obVol=0, coalFuel=0, coalVol=0;
  fuelByUnitDate.forEach((liters,key)=>{
    const bcmKey = key+'|BCM', mtKey = key+'|MT';
    if(prodByKey.has(bcmKey)){ obFuel += liters; obVol += prodByKey.get(bcmKey); }
    if(prodByKey.has(mtKey)){ coalFuel += liters; coalVol += prodByKey.get(mtKey); }
  });
  return {
    ob:{ fuel:obFuel, vol:obVol, ratio: obVol? obFuel/obVol : 0 },
    coal:{ fuel:coalFuel, vol:coalVol, ratio: coalVol? coalFuel/coalVol : 0 }
  };
}
/* Klasifikasi 3 kelompok besar untuk KPI "Fuel Digger/Hauler/Support" — Support = semua
   yang bukan Digger & bukan Hauler (Dozer, Grader, Support Excavator, Water Truck). */
function fuelGroupOf(unitCode){
  const u = UNITS.find(x=>x.id===unitCode);
  if(!u) return 'Support';
  if(u.equipmentType==='Excavator/Digger') return 'Digger';
  if(u.equipmentType==='Hauler') return 'Hauler';
  return 'Support';
}
/* PA (Physical Availability) & UA (Utilization/Use of Availability), dihitung dari
   SUM(duration_hours) per status di unit_status_actual — bukan field siap pakai (tidak ada). */
/* [PA/UA FIX v2 — AUDIT 2026-09] ROOT CAUSE (v11 dan sebelumnya): populasi unit-shift ("scheduled")
   ditentukan HANYA dari kunci (date, shift, unit) yang muncul di statusRows (unit_status_actual).
   Sejak Idle/Delay sengaja TIDAK ditulis ke unit_status_actual (lihat diEventRows §STANDBY
   UNIFICATION), setiap unit-shift yang isinya 100% Idle, 100% Delay, kombinasi Idle+Delay tanpa
   Working, atau yang unit_status_actual-nya kosong sama sekali, TIDAK PERNAH muncul di statusRows —
   akibatnya unit-shift itu hilang total dari populasi "scheduled", bukan cuma jam-nya yang salah.
   FIX: computePAUA() sekarang menerima statusRows/delayRows/idleRows (sama seperti
   getUnifiedStandbyHours()) dan MEMAKAI ULANG getUnifiedStandbyHours() sebagai satu-satunya sumber
   populasi unit-shift — bukan mesin hitung baru — supaya tidak ada dua sumber kebenaran untuk
   "unit-shift mana saja yang terjadwal". getUnifiedStandbyHours() sudah membuat satu bucket
   (date,shift,unit) untuk SETIAP baris yang muncul di statusRows ATAU delayRows ATAU idleRows(scope
   UNIT) — jadi BD-only, Idle-only, Delay-only, Idle+Delay-tanpa-Working, dan unit_status_actual kosong
   semuanya tetap masuk populasi selama ada minimal satu baris di salah satu dari ketiga sumber itu.
   scheduled/breakdown/working/classified/missing dijumlah dari unified.rows (bukan dihitung ulang dari
   statusRows), sehingga invariant "Working + Idle + Delay + Breakdown + Missing = Scheduled Hours"
   otomatis terjaga (idle+delay masuk sebagai bagian dari `standby`/classified milik unified, breakdown
   & working tetap dari statusRows seperti semula, missing = scheduled - classified per unit-shift).
   delayRows/idleRows OPSIONAL (default []) supaya pemanggil lama yang cuma kirim statusRows tidak
   error — tapi HARUS dikirim di semua call-site yang datanya tersedia, kalau tidak populasi tetap
   sempit seperti v11 untuk pemanggil itu saja. */
function computePAUA(statusRows, delayRows, idleRows){
  statusRows = statusRows || [];
  const unified = getUnifiedStandbyHours(statusRows, delayRows||[], idleRows||[]);
  let scheduled=0, breakdown=0, working=0, classified=0, missing=0;
  unified.rows.forEach(r=>{
    scheduled += r.scheduled;
    breakdown += r.breakdown;
    working += r.working;
    classified += r.classified;
    missing += r.missing;
  });
  const available = Math.max(scheduled - breakdown, 0);
  const pa = scheduled ? (available/scheduled*100) : 0;
  const ua = available ? (working/available*100) : 0;
  return { pa, ua, scheduled, breakdown, working, available, classified, missing };
}

/* [STANDBY UNIFICATION 2026-09] final prompt §3/§7/§8 — SATU-SATUNYA tempat Standby dihitung sebagai
   gabungan 3 sumber mentah:
     unit_status_actual (status='Standby')  +  idle_events  +  delay_events
   Tidak menulis apa pun ke database (read/derived layer saja — event mentah tetap terpisah di tabelnya
   masing-masing, lihat §8). SEMUA halaman/chart yang butuh angka "Standby" WAJIB lewat fungsi ini —
   jangan menjumlahkan idle_events/delay_events/unit_status_actual Standby secara terpisah lagi di
   tempat lain, supaya tidak pernah terjadi double counting (idle & delay adalah KOMPONEN standby,
   bukan tambahan di luar standby).
   Menerima array statusRows/delayRows/idleRows yang SUDAH difilter (mis. dari getFilteredUnitStatus()/
   getFilteredDelay()/getFilteredIdle()) supaya konsisten dengan filter aktif (bulan/hari/shift/fleet/unit)
   di halaman pemanggil.
   Return: { total, byUnit:Map<unit,{standby,idle,delay,total}>, rows:[{date,shift,unit,standby,idle,delay,total}] } */
/* [FIX — AUDIT 2026-09] ROOT CAUSE (double count risk): versi lama menjumlahkan Standby(dari
   unit_status_actual) + Idle(idle_events) + Delay(delay_events) secara ADITIF tanpa syarat. Untuk data
   yang ditulis lewat Daily Input per-jam (v10+) ini aman, karena diEventRows() memang TIDAK PERNAH
   menulis Idle/Delay ke unit_status_actual (comment §STANDBY UNIFICATION di diEventRows). TAPI untuk
   shift yang masih punya baris Standby LAMA level-shift (data sebelum granularity per-jam ada — lihat
   DI.legacy/peringatan di diOpenReview baris ~6749, PERINGATAN ITU CUMA MUNCUL DI Daily Input, TIDAK
   ADA proteksi yang sama di layer agregasi/dashboard) yang KEMUDIAN ditambahi Idle/Delay per-jam untuk
   shift yang sama, versi lama menjumlahkan keduanya → double count nyata. BD tetap sudah dipisah dengan
   benar di seluruh kode (tidak pernah masuk hitungan Standby) — itu bukan bug, dipertahankan di sini.
   FIX: deteksi kondisi "ada Standby legacy DAN ada Idle/Delay itemized" untuk unit-shift-tanggal yang
   sama sebagai CONFLICT; resolusi yang dipakai (BUSINESS RULE REQUIRED — tidak ada priority rule
   eksplisit di source code lama, ini judgment call): prioritaskan data itemized (idle_events/
   delay_events, lebih rinci per alasan) dan KELUARKAN baris Standby legacy dari total supaya tidak
   dihitung dua kali; setiap kejadian dicatat di `conflicts` (bukan didiamkan). Juga menambahkan deteksi
   missing hours per unit-shift-tanggal terhadap scheduled hours dari master_shifts. */
/* [WORK END FIX 2026-09] Keputusan bisnis: Work End (Day 17:00-18:00 / Night 05:00-06:00) = akhir shift
   normal, BUKAN Idle/Delay/BD/Standby loss dan TIDAK wajib "diisi" agar unit-shift genap 12 jam.
   Helper di bawah HANYA dipakai untuk VALIDASI KELENGKAPAN unit-shift (validateUnitShiftHours) —
   scheduled/working/standby/breakdown/missing yang dipakai computePAUA & analisis loss TIDAK diubah. */
const WORK_END_START_HOUR = { D:17, N:5 };
const WORK_END_HOURS = 1;
function isWorkEndSlot(shiftCode, hourLabel){
  if(!hourLabel) return false;
  const m = String(hourLabel).match(/^\s*(\d{1,2})/);
  return !!m && WORK_END_START_HOUR[shiftCode] === Number(m[1]);
}
// Unit fisik = unit_code terisi. Delay fleet-level (unit_code NULL/'') bukan unit fisik.
function isPhysicalUnit(unit){ return unit!=null && String(unit).trim()!==''; }
// Tanggal operasional lokal Indonesia (bukan UTC). Ubah OPS_TZ ke 'Asia/Makassar' bila site di WITA.
const OPS_TZ = 'Asia/Jakarta';
function opsTodayStr(){
  try{ return new Intl.DateTimeFormat('en-CA',{timeZone:OPS_TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); }
  catch(e){ return new Date(Date.now()+7*3600*1000).toISOString().slice(0,10); }
}
function getUnifiedStandbyHours(statusRows, delayRows, idleRows){
  const key = (date,shift,unit)=> [date, shift, unit||''].join('|');
  const bucket = new Map(); // key -> {date,shift,unit,shiftCode,standbyLegacy,idle,delay,breakdown,working}
  // [WORK END FIX] catat jam yang jatuh di slot Work End + apakah bucket punya info slot (hour_label).
  const noteSlot = (b, shiftCode, hourLabel, hrs)=>{
    if(!hourLabel) return;
    b.labelled = true;
    if(isWorkEndSlot(shiftCode, hourLabel)) b.weHours += hrs;
  };
  const ensure = (date,shift,unit,shiftCode)=>{
    const k = key(date,shift,unit);
    if(!bucket.has(k)) bucket.set(k, {date, shift, unit, shiftCode, standbyLegacy:0, idle:0, delay:0, breakdown:0, working:0, weHours:0, labelled:false});
    return bucket.get(k);
  };
  (statusRows||[]).forEach(s=>{
    const b = ensure(s.date, s.shift, s.unit, s.shiftCode);
    if(s.status==='Standby') b.standbyLegacy += s.durationHours||0;
    else if(s.status==='Breakdown') b.breakdown += s.durationHours||0; // [BD tetap terpisah — TIDAK PERNAH masuk Standby]
    else if(s.status==='Working') b.working += s.durationHours||0;
    else return;
    noteSlot(b, s.shiftCode, s.hourLabel, s.durationHours||0);
  });
  // scope GLOBAL (I01-I03 cuaca site-wide) unit-nya null — bukan jam kerja unit tertentu, jangan
  // dihitung sebagai bagian classified hours unit manapun di sini (tetap dipakai terpisah utk weather_daily).
  (idleRows||[]).filter(e=>e.scope==='UNIT').forEach(e=>{ const b=ensure(e.date, e.shift, e.unit, e.shiftCode); b.idle += e.hours||0; noteSlot(b, e.shiftCode, e.hourLabel, e.hours||0); });
  (delayRows||[]).forEach(e=>{ const b=ensure(e.date, e.shift, e.unit, e.shiftCode); b.delay += e.hours||0; noteSlot(b, e.shiftCode, e.hourLabel, e.hours||0); });

  /* [FIX 2026-09 — BUG UI diCompletenessRows/getUnifiedStandbyHours] Database sudah diverifikasi
     45,260/45,260 unit-shift = TEPAT 12 jam (bukan bug data). Root cause SEBENARNYA: rule lama
     "ada itemized (Idle/Delay) → buang SELURUH Standby legacy" salah untuk kasus normal di mana
     Standby legacy (dari unit_status_actual) dan Delay/Idle itemized MEMANG dua periode berbeda
     yang saling melengkapi (non-overlap) dalam shift yang sama — bukan double-input dari sumber
     yang sama. Contoh nyata BD_853 26 Sep: Standby legacy 8j + D03 Meal 1j + D05 Change Shift 2j
     (+1j Working) = 12j valid, tapi rule lama membuang 8j Standby dan hanya menyisakan 3j itemized
     → muncul "kurang 9j" palsu. FIX: standby = standbyLegacy + itemized (unified coverage additif),
     TIDAK LAGI saling menggantikan/membuang. Data mentah (start_time/end_time) unit_status_actual &
     idle_events tersedia untuk overlap-check per interval, tapi delay_events pada query yang dipakai
     di sini belum menyertakan start_time/end_time (lihat diFetch di diLoadShift) — sehingga overlap
     per-menit belum bisa dihitung untuk Delay. Karena data sudah tervalidasi 12j per unit-shift di
     database (tidak ada overlap riil), SUM langsung sudah merepresentasikan coverage kronologis
     aktual tanpa double count. `conflict` tetap dicatat sebagai INFO (bukan exclusion) supaya kasus
     yang butuh review manual (standby legacy + itemized bersamaan) masih kelihatan di Admin/Reports. */
  const conflicts = [];
  const rows = [...bucket.values()].map(r=>{
    const itemized = r.idle + r.delay;
    const standby = r.standbyLegacy + itemized; // unified: additif, tidak saling membuang
    const conflict = r.standbyLegacy > 0 && itemized > 0; // info saja, tidak lagi mengeluarkan legacy
    if(conflict) conflicts.push({date:r.date, shift:r.shift, unit:r.unit, standbyLegacy:r.standbyLegacy, idle:r.idle, delay:r.delay});
    const scheduled = SHIFT_HOURS_BY_CODE[r.shiftCode] || SHIFT_HOURS_BY_NAME[r.shift] || 12;
    const classified = r.working + standby + r.breakdown;
    const missing = Math.max(scheduled - classified, 0);
    /* [WORK END FIX] Field khusus VALIDASI kelengkapan (v*). Bila bucket punya info slot (hour_label),
       slot Work End dikeluarkan dari target DAN dari jam terklasifikasi, sehingga event apa pun di slot
       Work End (mis. Idle I02 0,33j di 05-06 N) tidak membuat Work End jadi loss/missing. Bila bucket
       tanpa hour_label (data legacy level-shift), tidak ada pengecualian (target tetap penuh).
       scheduled/classified/missing di atas TIDAK diubah -> PA/UA & analisis loss identik dgn sebelumnya. */
    const vScheduled = r.labelled ? Math.max(scheduled - WORK_END_HOURS, 0) : scheduled;
    const vClassified = r.labelled ? Math.max(classified - r.weHours, 0) : classified;
    const vMissing = Math.max(vScheduled - vClassified, 0);
    return { ...r, standby, legacyExcluded:0, conflict, scheduled, classified, missing, total: standby,
             vScheduled, vClassified, vMissing, physical: isPhysicalUnit(r.unit) };
  });

  const byUnit = new Map();
  rows.forEach(r=>{
    if(!byUnit.has(r.unit)) byUnit.set(r.unit, {standby:0, idle:0, delay:0, breakdown:0, total:0, missing:0});
    const u = byUnit.get(r.unit);
    u.standby += r.standby; u.idle += r.idle; u.delay += r.delay; u.breakdown += r.breakdown;
    u.total += r.total; u.missing += r.missing;
  });
  const total = rows.reduce((s,r)=> s + r.total, 0);
  const missingTotal = rows.reduce((s,r)=> s + r.missing, 0);
  const breakdownTotal = rows.reduce((s,r)=> s + r.breakdown, 0);
  return { total, byUnit, rows, missingTotal, breakdownTotal, conflicts };
}

/* [VALIDATION — AUDIT 2026-09, item N] validateUnitShiftHours(rows) menerima `rows` dari
   getUnifiedStandbyHours(...).rows dan memeriksa invariant:
     working + standby + breakdown + missing === scheduled
   Mengembalikan array pesan error yang bisa ditampilkan di Admin/Reports untuk unit-shift-tanggal
   yang tidak genap 12 jam (atau jam sesuai master_shifts). Tidak menulis apa pun ke database. */
function validateUnitShiftHours(rows){
  const errors = [];
  const today = opsTodayStr(); // [WORK END FIX] hanya tanggal actual (<= hari ini, waktu lokal Indonesia)
  (rows||[]).forEach(r=>{
    if(!isPhysicalUnit(r.unit)) return;           // delay fleet-level (unit_code NULL) bukan unit fisik
    if(r.date > today) return;                    // data future/simulasi tidak masuk indikator actual
    const vSched = r.vScheduled!=null ? r.vScheduled : r.scheduled;
    const vClass = r.vClassified!=null ? r.vClassified : r.classified;
    const vMiss  = r.vMissing!=null ? r.vMissing : r.missing;
    if(vClass - r.scheduled > 0.01){
      errors.push(`UNIT ${r.unit||'-'} ${r.date} ${r.shift}: jam terklasifikasi ${U.round(vClass,2)}j melebihi scheduled ${r.scheduled}j (selisih ${U.round(vClass-r.scheduled,2)}j)`);
    }
    if(vMiss > 0.01){
      errors.push(`UNIT ${r.unit||'-'} ${r.date} ${r.shift}: ${U.round(vMiss,2)}j belum terklasifikasi (classified ${U.round(vClass,2)}/${U.round(vSched,2)}j, di luar Work End).`);
    }
    // r.conflict tetap hanya INFO (lihat FIX 2026-09 di atas).
  });
  return errors;
}
// [WORK END FIX] jumlah UNIT-SHIFT tidak lengkap (bukan jumlah pesan error).
function countIncompleteUnitShifts(rows){
  return (rows||[]).filter(r=> validateUnitShiftHours([r]).length>0).length;
}
/* Convenience wrapper — memakai filter aktif langsung (bulan/hari/shift/fleet), untuk pemanggil yang
   tidak butuh filter tambahan per-unit. */
function getUnifiedStandbyHoursFiltered(){
  return getUnifiedStandbyHours(getFilteredUnitStatus(), getFilteredDelay(), getFilteredIdle());
}

function getFilteredSecondary(dataset) {
  // Utility for Crusher/Stockpile/Sump datasets that don't have shift/fleet etc.
  return dataset.filter(r => {
    let d = new Date(r.date);
    if(filters.month!=='all' && d.getMonth()!=Number(filters.month)) return false;
    if(filters.dayStart!=='all' && d.getDate() < Number(filters.dayStart)) return false;
    if(filters.dayEnd!=='all' && d.getDate() > Number(filters.dayEnd)) return false;
    if(r.pit && filters.pit!=='all' && r.pit!==filters.pit) return false; // Applicable for Sump
    return true;
  });
}

/* ---------- CHART HELPERS ---------- */
let chartInstances = {};
function themeColors(){
  const dark = theme==='dark';
  return {
    text: dark? '#8D98AE':'#5C6B85',
    grid: dark? 'rgba(255,255,255,.055)':'rgba(15,23,42,.06)',
    accent:'#F5A524', teal:'#2DD4BF', danger:'#F04747', success:'#10B981',
    warning:'#F5A524', info:'#22D3EE', violet:'#8B5CF6', pink:'#F472B6', indigo:'#6366F1'
  };
}
function baseOpts(extra={}){
  const c = themeColors();
  const dark = theme==='dark';
  return Object.assign({
    responsive:true, maintainAspectRatio:false,
    interaction:{ mode:'index', intersect:false },
    animation:{ duration:650, easing:'easeOutQuart' },
    plugins:{
      legend:{ labels:{ color:c.text, font:{size:11, family:'Inter'}, boxWidth:10, boxHeight:10, usePointStyle:true, padding:14 } },
      tooltip:{
        backgroundColor: dark? 'rgba(17,23,38,.96)':'rgba(19,26,42,.96)', titleColor:'#fff', bodyColor:'#CBD3E1',
        borderColor: dark? '#2A3651':'#2A3651', borderWidth:1, cornerRadius:10, padding:10,
        titleFont:{size:11.5, weight:'600'}, bodyFont:{size:11}, boxPadding:5, displayColors:true,
        titleMarginBottom:6
      }
    },
    scales:{
      x:{ ticks:{ color:c.text, font:{size:10} }, grid:{ color:c.grid, drawTicks:false } },
      y:{ ticks:{ color:c.text, font:{size:10} }, grid:{ color:c.grid, drawTicks:false } }
    }
  }, extra);
}
/* Chart option set used only inside the formal Reports document — deliberately
   ignores light/dark app theme so the exported/printed report is always dark-text-on-white. */
function reportChartOpts(extra={}){
  const base = {
    responsive:true, maintainAspectRatio:false,
    layout:{ padding:{ top:8, right:12, bottom:4, left:4 } },
    plugins:{
      legend:{
        position:'top', align:'center',
        labels:{
          color:'#333B44', font:{size:10}, boxWidth:10, boxHeight:10,
          padding:14, usePointStyle:false, textAlign:'left'
        },
        maxHeight:44
      },
      tooltip:{ backgroundColor:'#12213A', titleColor:'#fff', bodyColor:'#E7EDF3', cornerRadius:8, padding:9, titleFont:{size:11,weight:'600'}, bodyFont:{size:10.5} }
    },
    scales:{
      x:{ ticks:{ color:'#5B6672', font:{size:9.5} }, grid:{ color:'#EEF0F2' } },
      y:{ ticks:{ color:'#5B6672', font:{size:9.5} }, grid:{ color:'#EEF0F2' } }
    }
  };
  // Deep-merge layout.padding and plugins.legend so callers (e.g. the extra
  // top padding passed in for datalabels headroom) don't blow away the
  // legend defaults set above — this was the root cause of the legend
  // labels getting squeezed/clipped on the Production Trend chart.
  const merged = Object.assign({}, base, extra);
  merged.layout = Object.assign({}, base.layout, extra.layout, {
    padding: Object.assign({}, base.layout.padding, (extra.layout && extra.layout.padding) || {})
  });
  merged.plugins = Object.assign({}, base.plugins, extra.plugins);
  merged.plugins.legend = Object.assign({}, base.plugins.legend, (extra.plugins && extra.plugins.legend) || {});
  merged.plugins.legend.labels = Object.assign({}, base.plugins.legend.labels, (extra.plugins && extra.plugins.legend && extra.plugins.legend.labels) || {});
  merged.plugins.tooltip = Object.assign({}, base.plugins.tooltip, (extra.plugins && extra.plugins.tooltip) || {});
  merged.scales = Object.assign({}, base.scales, extra.scales);
  return merged;
}
/* Opsi tick sumbu-X tanggal yang dipakai bersama oleh Production Trend dan
   Fuel Consumption, supaya format keduanya selalu identik/konsisten.
   PERSYARATAN: autoSkip harus SELALU false — setiap tanggal hasil filter
   wajib tampil, tidak boleh ada yang disembunyikan/dilompati. Sebagai
   gantinya, untuk rentang tanggal yang panjang, font diperkecil dan label
   diputar (rotasi) secukupnya supaya seluruh tanggal tetap terbaca dan
   label pertama/terakhir tidak pernah terpotong (dibantu juga oleh
   scales.x.offset:true + layout.padding kiri/kanan pada tempat chart ini
   dipakai). */
function dateAxisTickOptions(labelCount){
  let fontSize = 9.5, rotation = 0;
  if(labelCount > 20){ fontSize = 7.5; rotation = 90; }
  else if(labelCount > 12){ fontSize = 8; rotation = 60; }
  else if(labelCount > 8){ fontSize = 9; rotation = 45; }
  return {
    autoSkip:false,
    maxRotation:rotation,
    minRotation:rotation,
    padding:4,
    font:{ size:fontSize }
  };
}
/* [PERF/STABILITY FIX 2026-09] Audit makeChart(): 3 root cause ditemukan untuk chart
   blank/telat render:
   (1) Kalau SATU chart di halaman yang sama gagal dibuat (exception di new Chart(...) —
       mis. config/data tak terduga), exception itu sinkron dan MENGHENTIKAN seluruh fungsi
       render_* di tengah jalan, sehingga semua makeChart() SETELAHNYA di halaman itu tidak
       pernah dipanggil sama sekali -> tampak seperti banyak chart blank sekaligus padahal
       cuma 1 chart yang error. Sekarang error diisolasi per-chart (try/catch) & dicatat ke
       console, chart lain di halaman yang sama tetap jalan.
   (2) Canvas kadang belum py ukuran layout valid (clientWidth/Height 0) persis saat
       new Chart() dipanggil (race dengan reflow) -> chart kebentuk ukuran 0 dan blank
       permanen sampai ada resize manual. Sekarang di-deteksi & ditunda 1 frame (rAF) lalu
       dicoba lagi, tanpa mengubah config/data chart.
   (3) Dataset kosong (bukan "semua nol", tapi benar² tidak ada titik data) sebelumnya
       tetap membuat instance Chart.js -> canvas kosong tanpa keterangan apa pun, terlihat
       seperti bug. Sekarang ditampilkan empty-state teks yang jelas, chart TIDAK dipaksa
       dibuat dari data kosong. Chart dengan data valid (termasuk yang bernilai nol) TETAP
       dirender apa adanya seperti sebelumnya — tidak ada jenis/arti chart yang diubah. */
function chartHasData(config){
  try{
    const ds = config && config.data && config.data.datasets;
    if(!Array.isArray(ds) || !ds.length) return false;
    return ds.reduce((n,s)=> n + (Array.isArray(s && s.data) ? s.data.length : 0), 0) > 0;
  }catch(e){ return true; }   // gagal deteksi -> jangan blokir, biarkan Chart.js yang coba render
}
function chartEmptyState(canvas, msg, isError){
  const wrap = canvas.parentElement;
  canvas.style.display = 'none';
  if(!wrap) return;
  let div = wrap.querySelector(':scope > .chart-empty-state');
  if(!div){ div = document.createElement('div'); div.className = 'chart-empty-state'; wrap.appendChild(div); }
  div.style.cssText = `height:100%;min-height:80px;display:flex;align-items:center;justify-content:center;text-align:center;padding:8px;font-size:12px;color:${isError?'var(--danger,#F04747)':'var(--text-faint,#94A3B8)'}`;
  div.textContent = msg;
}
function makeChart(id, config, _retry){
  const canvas = document.getElementById(id);
  if(!canvas) return;
  if(chartInstances[id]){ try{ chartInstances[id].destroy(); }catch(e){} chartInstances[id] = null; }
  const wrap = canvas.parentElement;
  const oldEmpty = wrap && wrap.querySelector(':scope > .chart-empty-state');
  if(oldEmpty) oldEmpty.remove();
  if(!chartHasData(config)){ chartEmptyState(canvas, 'Belum ada data untuk ditampilkan.', false); return; }
  canvas.style.display = '';
  if((canvas.clientWidth===0 || canvas.clientHeight===0) && !_retry){
    requestAnimationFrame(()=> makeChart(id, config, true));
    return;
  }
  try{
    chartInstances[id] = new Chart(canvas.getContext('2d'), config);
  }catch(e){
    console.error('[makeChart] gagal membuat chart:', id, e);
    chartEmptyState(canvas, 'Chart gagal dimuat.', true);
  }
}
const PALETTE = ['#F5A524','#22D3EE','#6366F1','#8B5CF6','#F472B6','#10B981','#F04747','#2DD4BF'];
/* [SUPABASE REWIRE 2026-09] Palet lebih banyak & kontras untuk chart dengan kategori
   banyak (mis. 16 kode Delay) — supaya warna antar kategori tidak mirip/membingungkan. */
const PALETTE_WIDE = ['#F5A524','#22D3EE','#6366F1','#8B5CF6','#F472B6','#10B981','#F04747','#2DD4BF',
  '#FACC15','#3B82F6','#EC4899','#84CC16','#FB7185','#14B8A6','#A855F7','#EAB308','#0EA5E9','#F97316'];
const STATUS_COLOR = { Working:'#10B981', Standby:'#F5A524', Breakdown:'#F04747', 'No Operator':'#94A3B8', 'No Location':'#475569' };

/* ---------- Data-label plugin: registered once, OFF by default ----------
   chartjs-plugin-datalabels is registered globally but its default display
   is switched off so every existing chart on every other page keeps
   rendering exactly as before. Only the formal Reports document below
   opts back in explicitly per-chart via the helper functions underneath. */
if(typeof ChartDataLabels !== 'undefined'){
  Chart.register(ChartDataLabels);
  Chart.defaults.set('plugins.datalabels', { display:false });
}

/* Number formatting used only inside data-label callbacks (Reports page). */
const rptNum = (v,d=0)=> U.fmt(v,d);

/* [FORMAT-ANGKA] Sumbu & tooltip semua chart: >=1.000 ribu / >=1.000.000 juta (display only). */function chartTipLabel(ctx){
  const t = ctx.chart.config.type, radial = (t==='pie'||t==='doughnut'||t==='polarArea');
  const p = ctx.parsed;
  const v = radial ? (typeof p==='number' ? p : ctx.raw) : (p && typeof p==='object' ? (ctx.chart.options.indexAxis==='y' ? p.x : p.y) : p);
  const txt = (typeof v==='number' && isFinite(v)) ? (Math.abs(v)>=1000 ? U.fmtCompact(v) : U.fmtPlain(v)) : String(v??'');
  const name = radial ? (ctx.label||'') : (ctx.dataset.label||'');
  return name ? name+': '+txt : txt;
}
if(typeof Chart !== 'undefined'){
  try{
    const _numTick = Chart.Ticks.formatters.numeric;
    Chart.defaults.scales.linear.ticks.callback = function(v){ return (typeof v==='number' && Math.abs(v)>=1000) ? U.fmtCompact(v) : _numTick.apply(this, arguments); };
    Chart.defaults.plugins.tooltip.callbacks.label = chartTipLabel;
    ['doughnut','pie','polarArea'].forEach(k=>{ const o=Chart.overrides && Chart.overrides[k]; if(o && o.plugins && o.plugins.tooltip && o.plugins.tooltip.callbacks) o.plugins.tooltip.callbacks.label = chartTipLabel; });
  }catch(e){ console.warn('number-format chart defaults', e); }
}

/* Bar-chart datalabels: value printed just above/beside each bar. */
function barDatalabels(opts={}){
  return {
    display:true, color:'#12213A', anchor:'end', align: opts.horizontal ? 'end' : 'top',
    offset:4, font:{size:9.5, weight:'700', family:'Inter'},
    formatter:(v)=> v===0 || v===null || v===undefined ? '' : `${rptNum(v, opts.decimals||0)}${opts.suffix||''}`
  };
}

/* Line-chart datalabels: value shown at EVERY data point — labels are never
   thinned out/hidden, no matter how many dates are on the axis. Instead, as
   the point count grows, the font shrinks and the vertical offset alternates
   above/below each point (checkerboard pattern) so neighbouring labels don't
   collide with each other. This keeps every single value readable at once
   on Desktop, Mobile, and PDF export alike. */
function lineDatalabels(opts={}){
  // Ukuran font mengecil bertahap seiring bertambahnya jumlah titik data,
  // supaya label tetap muat berdampingan tanpa pernah disembunyikan.
  const fontSizeFor = (len)=>{
    if(len>36) return 6;
    if(len>28) return 6.5;
    if(len>22) return 7;
    if(len>16) return 7.5;
    if(len>10) return 8;
    return 8.5;
  };
  // Jarak (offset) label ke titik data ikut mengecil pada rentang tanggal
  // yang padat, supaya label tetap kompak dan tidak terdorong keluar area.
  const offsetFor = (len)=>{
    if(len>30) return 5;
    if(len>20) return 6;
    if(len>14) return 7;
    return 8;
  };
  return {
    display:true, // SELALU tampil di setiap titik — tidak pernah di-skip.
    color: opts.color || '#12213A',
    anchor:'center',
    // Untuk rentang tanggal padat (>16 titik), posisi label diselang-seling
    // atas/bawah per titik (offset otomatis) supaya label yang berdekatan
    // tidak saling bertumpuk/bertabrakan satu sama lain.
    align:(ctx)=>{
      const len = ctx.chart.data.labels ? ctx.chart.data.labels.length : 0;
      if(len>16) return ctx.dataIndex % 2 === 0 ? 'top' : 'bottom';
      return 'top';
    },
    offset:(ctx)=>{
      const len = ctx.chart.data.labels ? ctx.chart.data.labels.length : 0;
      return offsetFor(len);
    },
    font:(ctx)=>{
      const len = ctx.chart.data.labels ? ctx.chart.data.labels.length : 0;
      return { size: fontSizeFor(len), weight:'600', family:'Inter' };
    },
    backgroundColor:'rgba(255,255,255,.85)', borderRadius:3, padding:{top:1,bottom:1,left:3,right:3},
    // clip:true keeps every label strictly inside the chart/plot area box —
    // combined with scales.y.grace headroom (top & bottom via beginAtZero)
    // this guarantees no label is ever cut off at the edges of the chart,
    // at any canvas size/DPI, including PDF export rendering.
    clip:true,
    formatter:(v)=> v===null || v===undefined ? '' : `${rptNum(v, opts.decimals||0)}${opts.suffix||''}`
  };
}

/* Pie/Doughnut datalabels: category name + actual value + percentage,
   e.g. "Overburden — 1.250 BCM (42%)", stacked as three lines. */
function pieDatalabels(opts={}){
  return {
    display:true, color:'#fff', font:{size:10, weight:'700', family:'Inter'}, textAlign:'center',
    formatter:(value, ctx)=>{
      const dataArr = ctx.chart.data.datasets[ctx.datasetIndex].data;
      const total = dataArr.reduce((a,b)=> a + (Number(b)||0), 0);
      const pct = total ? (value/total*100) : 0;
      const label = ctx.chart.data.labels[ctx.dataIndex];
      return [String(label), `${rptNum(value, opts.decimals||0)}${opts.unit? ' '+opts.unit:''}`, `${rptNum(pct,1)}%`];
    }
  };
}

/* ---------- MANUAL CHARTS: GAUGE / WATERFALL / HEATMAP ---------- */
function buildGauge(containerId, value, max, label, color){
  const el = document.getElementById(containerId);
  if(!el) return;
  const pct = U.clamp(value/max,0,1);
  const angle = pct*180;
  const r = 70, cx=90, cy=85;
  const startX = cx - r, startY = cy;
  const endX = cx + r*Math.cos(Math.PI - (angle*Math.PI/180));
  const endY = cy - r*Math.sin(Math.PI - (angle*Math.PI/180));
  const largeArc = angle>180?1:0;
  const c = themeColors();
  el.innerHTML = `
  <svg viewBox="0 0 180 110" class="w-full" style="max-width:220px">
    <path d="M ${startX} ${startY} A ${r} ${r} 0 0 1 ${cx+r} ${cy}" fill="none" stroke="${c.grid==='rgba(0,0,0,.06)'?'#e5e9ee':'#232d3a'}" stroke-width="14" stroke-linecap="round"/>
    <path d="M ${startX} ${startY} A ${r} ${r} 0 ${largeArc} 1 ${endX} ${endY}" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"/>
    <text x="90" y="80" text-anchor="middle" font-family="JetBrains Mono" font-size="22" font-weight="700" fill="${color}">${typeof value==='string'?value:U.fmt(value,1)}</text>
    <text x="90" y="100" text-anchor="middle" font-family="Inter" font-size="10" fill="${c.text}">${label}</text>
  </svg>`;
}

function buildWaterfallChart(canvasId, labels, deltas, opts={}){
  let running = 0;
  const bases=[], vals=[], colors=[];
  const c = themeColors();
  labels.forEach((l,i)=>{
    if(l==='Total'){
      bases.push(0); vals.push(running); colors.push(c.info);
    } else {
      const d = deltas[i];
      if(d>=0){ bases.push(running); vals.push(d); colors.push(c.success); }
      else { bases.push(running+d); vals.push(-d); colors.push(c.danger); }
      running += d;
    }
  });
  makeChart(canvasId,{
    type:'bar',
    data:{ labels, datasets:[
      { label:'base', data:bases, backgroundColor:'transparent', stack:'wf' },
      { label:'value', data:vals, backgroundColor:colors, stack:'wf', borderRadius:4 }
    ]},
    options: baseOpts({
      plugins:{ legend:{display:false}, tooltip:{ callbacks:{ label:(ctx)=> ctx.datasetIndex===1? ` Rp ${U.fmtExact(ctx.raw,1)} Jt`:'' } } },
      scales:{ x:{ ticks:{color:c.text,font:{size:10}}, grid:{display:false} }, y:{ ticks:{color:c.text,font:{size:10}}, grid:{color:c.grid} } }
    })
  });
}

/* ---------- KPI CARD BUILDER ---------- */
function kpiCard(tag,label,value,unit,trend,color,trendLabel=""){
  const _ariaVal = value, _ariaUnit = unit;
  if(typeof value==='string'){ const _m = value.match(/^(-?[\d.,]+) (juta|ribu)$/); if(_m){ value=_m[1]; unit=(_m[2]+' '+(unit||'')).trim(); } }
  const trendColor = trend>=0? 'var(--success)':'var(--danger)';
  const trendIcon = trend>=0?'▲':'▼';
  const accent = color || 'var(--border)';
  const barPct = Math.max(4, Math.min(100, Math.abs(trend)*4));
  return `
  <div class="glass glass-hover kpi-card fade-in" style="border-left:2px solid ${accent}; --kpi-glow:color-mix(in srgb, ${accent} 22%, transparent)" role="group" aria-label="${label}: ${_ariaVal} ${_ariaUnit}">
    <div class="flex items-center justify-between">
      <span class="kpi-label">${label}</span>
      <span class="tag" aria-hidden="true">${tag}</span>
    </div>
    <div class="kpi-value" style="color:${color||'var(--text)'}">
      <span>${value}</span>
      <span class="text-[11px] font-normal" style="color:var(--text-dim)">${unit}</span>
    </div>
    ${trendLabel !== null ? `
    <span class="kpi-trend" style="color:${trendColor}; background:color-mix(in srgb, ${trendColor} 14%, transparent); width:fit-content">${trendIcon} ${Math.abs(trend).toFixed(1)}${trendLabel}</span>
    <div class="kpi-bar" aria-hidden="true"><div class="kpi-bar-fill" style="width:${barPct}%; background:${trendColor}"></div></div>
    ` : ''}
  </div>`;
}

function randTrend(){ return U.rnd(-8,12); }

/* ============================================================
   PAGE RENDER FUNCTIONS
   ============================================================ */
function renderPage(){
  const nav = NAV.find(n=>n.id===currentPage);
  if(!nav) return;
  document.getElementById('pageTitle').textContent = nav.label.toUpperCase();
  document.getElementById('pageSub').textContent = nav.sub;
  const bc = document.getElementById('pageBreadcrumb');
  if(bc) bc.innerHTML = `<span>${navGroupTitle(currentPage)}</span><span class="sep">/</span><span class="cur">${nav.label}</span>`;
  document.querySelectorAll('.nav-item').forEach(el=> el.classList.toggle('active', el.dataset.nav===currentPage));
  // [HARDENING] Data kritis belum siap / gagal -> tampilkan status loading/error (KPI "—"), BUKAN dashboard kosong berisi 0.
  const gateHtml = dataGateHtml(currentPage);
  if(gateHtml !== null){ document.getElementById('pageContent').innerHTML = gateHtml; return; }
  const data = getFiltered();
  const fn = window['render_'+currentPage];
  const content = document.getElementById('pageContent');
  content.classList.remove('fade-in'); void content.offsetWidth; content.classList.add('fade-in');
  if(typeof fn==='function'){
    fn(data, content);
  } else {
    content.innerHTML = `<div class="glass p-8 text-center" style="color:var(--text-dim)">Halaman tidak ditemukan.</div>`;
  }
  if(currentPage!=='exceptions' && typeof exUpdateNavBadge==='function' && (RECORDS.length||UNIT_STATUS.length)) setTimeout(exUpdateNavBadge,250);
}
function navigate(id){
  currentPage = id;
  closeMobileSidebar();
  renderPage();
}

/* ---------- HEADER QUICK SEARCH (navigasi cepat antar halaman, tidak mengubah data apapun) ---------- */
let qsearchHi = -1;
function qsearchRun(val){
  const box = document.getElementById('qsearchResults');
  if(!box) return;
  const q = (val||'').trim().toLowerCase();
  const results = q? NAV.filter(n=> n.label.toLowerCase().includes(q) || (n.sub||'').toLowerCase().includes(q)) : NAV;
  qsearchHi = -1;
  if(!results.length){
    box.innerHTML = `<div class="qsearch-item" style="cursor:default">Tidak ada halaman cocok</div>`;
  } else {
    box.innerHTML = results.slice(0,8).map(n=>`<div class="qsearch-item" onmousedown="navigate('${n.id}'); qsearchClose();"><span>${navGroupTitle(n.id)} ›</span> <b>${n.label}</b></div>`).join('');
  }
  box.classList.add('show');
}
function qsearchClose(){
  const box = document.getElementById('qsearchResults');
  if(box) box.classList.remove('show');
  const inp = document.getElementById('qsearchInput');
  if(inp) inp.value='';
}
function qsearchKey(e){
  const box = document.getElementById('qsearchResults');
  if(!box) return;
  const items = [...box.querySelectorAll('.qsearch-item')];
  if(e.key==='ArrowDown'){ e.preventDefault(); qsearchHi = Math.min(qsearchHi+1, items.length-1); }
  else if(e.key==='ArrowUp'){ e.preventDefault(); qsearchHi = Math.max(qsearchHi-1, 0); }
  else if(e.key==='Enter'){ if(items[qsearchHi]) items[qsearchHi].dispatchEvent(new Event('mousedown')); return; }
  else if(e.key==='Escape'){ qsearchClose(); e.target.blur(); return; }
  else return;
  items.forEach((it,i)=> it.classList.toggle('hi', i===qsearchHi));
}

/* ---- OVERVIEW ---- */
/* [SUPABASE REWIRE 2026-09] Overview ditulis ulang total. Tidak ada lagi Cost/Fuel/Swell
   Factor/Calorie (tidak ada sumber). PA/UA dihitung dari unit_status_actual (bukan field
   siap pakai). OB dan CO dipisah karena satuannya beda (BCM vs Ton) — tidak dijumlah jadi
   satu angka supaya tidak menyesatkan. */
/* [AUDIT FIX 2026-09 P1-1] Filter Pit (filters.pit) hanya bisa diterapkan ke data Production
   (production_actual punya location_code/pit per baris). unit_status_actual, plan_daily_generated (Mine Plan),
   delay_events, idle_events, dan fuel_actual TIDAK punya kolom lokasi/pit sama sekali di skema
   Supabase (pit adalah atribut per-transaksi produksi, bukan atribut unit/plan/delay/idle) —
   jadi PA/UA, Achievement Plan, jam Delay/Idle, dan Fuel Ratio secara struktural TIDAK BISA
   difilter per pit tanpa join yang tidak presisi (satu unit bisa kerja di banyak pit dalam satu
   shift, dan Delay/Idle/Standby tidak selalu terkait satu pit tertentu). Sebelum fix ini, memilih
   Pit di filter bar mempersempit angka Production secara diam-diam TANPA mempersempit PA/UA/
   Achievement/Delay/Idle/Fuel Ratio yang tetap company-wide — user bisa salah baca dashboard
   sebagai "semua angka ini untuk Pit X" padahal sebagian tidak. FIX INI TIDAK MENGUBAH DATA/QUERY/
   RUMUS SAMA SEKALI — murni menambahkan disclosure banner non-blocking supaya user sadar batasan
   data ini saat filter Pit aktif. SUPABASE IMPACT: NONE. */
function pitFilterCaveatHTML(){
  if(filters.pit==='all') return '';
  return `<div class="di-alert warn mb-4" style="font-size:.8rem">⚠️ Filter Pit "<b>${esc(filters.pit)}</b>" aktif: hanya mempersempit data <b>Production</b>. PA/UA, Achievement Plan, jam Delay/Idle, dan Fuel Ratio di bawah ini tetap <b>seluruh pit</b> — unit_status_actual/plan_daily_generated/delay_events/idle_events/fuel_actual tidak tercatat per pit di database.</div>`;
}
/* ---- OVERVIEW — OPERATIONAL CONTROL TOWER ----
   [UI 2026-10 CONTROL TOWER — TAHAP 1] Murni layer presentasi. TIDAK ada query/tabel/kolom baru, TIDAK ada
   formula baru: Actual/Plan dari getFiltered()/getFilteredPlan(), PA/UA dari computePAUA() (existing),
   validasi dari validateUnitShiftHours() (existing), ambang Delay/Idle/Weather/PA/UA/Achievement memakai angka yang
   SUDAH dipakai halaman AI Insight (ai_classifyHigh 3/8/15, cuaca 10/20/40, PA 80, UA 70, Ach 90).
   Turunan tampilan saja: Achievement = Actual/Plan*100, Gap = Actual-Plan, cumulative, hitung unit per status.
   OB (BCM) dan CO (Ton) TIDAK dijumlahkan (satuan beda) — ditampilkan berdampingan. */
const OV = { stream:'OB', status:null, path:[] };
let _ovClock = null;
const ovA = (k,v)=> `onclick="ovGo(${esc(JSON.stringify(k))},${esc(JSON.stringify(v))})"`;
function ovDur(h){ const m = Math.round((h||0)*60); return m>=60 ? `${Math.floor(m/60)}j ${String(m%60).padStart(2,'0')}m` : `${m}m`; }
function ovSigned(v,d=0){ return (v>0?'+':v<0?'−':'') + U.fmt(Math.abs(v),d); }
function ovSetStream(s){ OV.stream = s; renderPage(); }
function ovPickStatus(s){ OV.status = OV.status===s ? null : s; OV.path = OV.status ? [{k:'status',v:s}] : []; renderPage(); }
function ovGo(k,v){ OV.path.push({k,v}); renderPage(); const d=document.getElementById('ovDrill'); if(d) d.scrollIntoView({behavior:'smooth',block:'nearest'}); }
function ovBack(i){ OV.path = OV.path.slice(0,i+1); if(i<0) OV.status=null; renderPage(); }
function ovCloseDrill(){ OV.path=[]; OV.status=null; renderPage(); }
function ovClockTick(){
  const el = document.getElementById('ovClock');
  if(!el){ clearInterval(_ovClock); _ovClock=null; return; }
  el.textContent = new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'});
}
/* Kondisi unit pada hari terakhir yang tercatat (dari data yang sudah difilter). Status utama unit =
   kategori dengan jam terbanyak; seri: Breakdown > Delay > Idle > Operating > Standby. */
function ovFleetState(){
  const st = getFilteredUnitStatus();
  const refDate = st.reduce((m,s)=> s.date>m?s.date:m, '');
  const rows = st.filter(s=>s.date===refDate);
  const unitMap = new Map();
  const get = (u,fleet)=>{ if(!unitMap.has(u)) unitMap.set(u,{unit:u,fleet:fleet||'-',h:{}}); const o=unitMap.get(u); if(!o.fleet||o.fleet==='-') o.fleet=fleet||'-'; return o; };
  const add = (o,c,v)=>{ o.h[c]=(o.h[c]||0)+v; };
  rows.forEach(s=> add(get(s.unit,s.fleet), s.status==='Working'?'Operating':s.status, s.durationHours));
  getFilteredDelay().filter(d=>d.date===refDate && d.unit).forEach(d=> add(get(d.unit,d.fleet),'Delay',d.hours));
  getFilteredIdle().filter(d=>d.date===refDate && d.scope==='UNIT' && d.unit).forEach(d=> add(get(d.unit,d.fleet),'Idle',d.hours));
  const prio = ['Breakdown','Delay','Idle','Operating','Standby'];
  const units = [...unitMap.values()].map(o=>{
    const cats = Object.keys(o.h).filter(c=>o.h[c]>0);
    cats.sort((a,b)=> (o.h[b]-o.h[a]) || ((prio.indexOf(a)<0?9:prio.indexOf(a))-(prio.indexOf(b)<0?9:prio.indexOf(b))));
    return {...o, primary:cats[0]||'Standby'};
  });
  const counts = {}; units.forEach(u=> counts[u.primary]=(counts[u.primary]||0)+1);
  return { refDate, units, counts, prio };
}
function ovCum(byDate, dates){ let c=0; return dates.map(d=>{ c+=byDate.get(d)||0; return c; }); }
function ovDrillHTML(fs, data, plan){
  if(!OV.path.length) return '';
  const cur = OV.path[OV.path.length-1];
  const crumbs = [`<button class="ov-crumb" onclick="ovCloseDrill()">Overview</button>`].concat(OV.path.map((p,i)=>{
    const lbl = p.k==='gap' ? 'Gap '+p.v : p.k==='status' ? p.v : p.k==='cause' ? p.v : p.v;
    return `<button class="ov-crumb ${i===OV.path.length-1?'on':''}" onclick="ovBack(${i})">${esc(lbl)}</button>`;
  })).join('<span class="ov-sep">›</span>');
  const unitRow = u=> `<tr class="ov-click" ${ovA('unit',u.unit)}><td><b>${esc(u.unit)}</b></td><td>${esc(u.fleet)}</td><td>${esc(u.primary||'')}</td><td class="r">${ovDur(u.h.Breakdown||0)}</td><td class="r">${ovDur(u.h.Delay||0)}</td><td class="r">${ovDur(u.h.Idle||0)}</td></tr>`;
  const unitHead = `<thead><tr><th>Unit</th><th>Fleet</th><th>Status</th><th class="r">BD</th><th class="r">Delay</th><th class="r">Idle</th></tr></thead>`;
  let body = '';
  if(cur.k==='status'){
    const list = fs.units.filter(u=>u.primary===cur.v).sort((a,b)=>a.unit>b.unit?1:-1);
    body = `<div class="ov-note">Unit berstatus utama <b>${esc(cur.v)}</b> pada ${esc(fs.refDate)}. Klik unit untuk melihat event.</div><table class="ov-tbl">${unitHead}<tbody>${list.map(unitRow).join('')}</tbody></table>`;
  } else if(cur.k==='gap'){
    const stream = cur.v==='OB'?'OB_PRODUCTION':'CO_PRODUCTION', unitL = cur.v==='OB'?'BCM':'Ton';
    const fa = U.groupBy(data.filter(r=>r.stream===stream), r=>r.fleet), fp = U.groupBy(plan.filter(p=>p.stream===stream), p=>p.fleet);
    const rows = [...new Set([...fa.keys(),...fp.keys()])].map(f=>{ const a=U.sum(fa.get(f)||[],'productionVolume'), p=U.sum(fp.get(f)||[],'targetVolume'); return {f,a,p,g:a-p,ach:p?a/p*100:null}; }).sort((x,y)=>x.g-y.g);
    body = `<div class="ov-note">Actual vs Plan per fleet (${unitL}), gap terbesar di atas. Klik fleet untuk melihat unit.</div><table class="ov-tbl"><thead><tr><th>Fleet</th><th class="r">Actual</th><th class="r">Plan</th><th class="r">Ach</th><th class="r">Gap</th></tr></thead><tbody>${rows.map(r=>`<tr class="ov-click" ${ovA('fleet',r.f)}><td><b>${esc(r.f)}</b></td><td class="r">${U.fmt(r.a,0)}</td><td class="r">${U.fmt(r.p,0)}</td><td class="r">${r.ach==null?'-':U.fmt(r.ach,1)+'%'}</td><td class="r" style="color:${r.g<0?'var(--danger)':'var(--success)'}">${ovSigned(r.g)}</td></tr>`).join('')}</tbody></table>`;
  } else if(cur.k==='fleet'){
    const list = fs.units.filter(u=>u.fleet===cur.v).sort((a,b)=>(b.h.Breakdown||0)+(b.h.Delay||0)+(b.h.Idle||0)-((a.h.Breakdown||0)+(a.h.Delay||0)+(a.h.Idle||0)));
    body = `<div class="ov-note">Unit di <b>${esc(cur.v)}</b> pada ${esc(fs.refDate)}, diurutkan dari durasi BD+Delay+Idle terbesar.</div><table class="ov-tbl">${unitHead}<tbody>${list.map(unitRow).join('')}</tbody></table>`;
  } else if(cur.k==='cause'){
    const isDelay = cur.v==='Delay';
    const ev = isDelay ? getFilteredDelay() : getFilteredIdle().filter(i=>i.scope==='UNIT');
    const g = U.groupBy(ev.filter(e=>e.unit), e=>e.unit);
    const rows = [...g.entries()].map(([u,a])=>({u, h:U.sum(a,'hours'), n:a.length})).sort((a,b)=>b.h-a.h).slice(0,15);
    body = `<div class="ov-note">Top unit berdasarkan durasi <b>${esc(cur.v)}</b> tercatat pada periode filter. Klik unit untuk melihat event.</div><table class="ov-tbl"><thead><tr><th>Unit</th><th class="r">Event</th><th class="r">Durasi</th></tr></thead><tbody>${rows.map(r=>`<tr class="ov-click" ${ovA('unit',r.u)}><td><b>${esc(r.u)}</b></td><td class="r">${r.n}</td><td class="r">${ovDur(r.h)}</td></tr>`).join('')}</tbody></table>`;
  } else if(cur.k==='unit'){
    const u = cur.v;
    const ev = [
      ...getFilteredDelay().filter(e=>e.unit===u).map(e=>({t:'Delay',date:e.date,shift:e.shift,reason:e.name,h:e.hours})),
      ...getFilteredIdle().filter(e=>e.unit===u && e.scope==='UNIT').map(e=>({t:'Idle',date:e.date,shift:e.shift,reason:e.name,h:e.hours})),
      ...getFilteredUnitStatus().filter(s=>s.unit===u && s.status==='Breakdown').map(s=>({t:'Breakdown',date:s.date,shift:s.shift,reason:s.category||'-',h:s.durationHours}))
    ].sort((a,b)=> a.date<b.date?1:a.date>b.date?-1:b.h-a.h).slice(0,30);
    body = `<div class="ov-note">Event <b>${esc(u)}</b> pada periode filter (30 terbaru). Alasan/durasi apa adanya dari data — tanpa analisis root cause otomatis.</div><table class="ov-tbl"><thead><tr><th>Tanggal</th><th>Shift</th><th>Jenis</th><th>Alasan</th><th class="r">Durasi</th></tr></thead><tbody>${ev.length?ev.map(e=>`<tr><td>${esc(e.date)}</td><td>${esc(e.shift)}</td><td>${e.t}</td><td>${esc(e.reason)}</td><td class="r">${ovDur(e.h)}</td></tr>`).join(''):'<tr><td colspan="5" style="color:var(--text-faint)">Tidak ada event tercatat.</td></tr>'}</tbody></table>`;
  }
  return `<div id="ovDrill" class="ov-panel mb-4"><div class="ov-panel-h"><div class="ov-crumbs">${crumbs}</div><button class="ov-x" onclick="ovCloseDrill()" aria-label="Tutup">✕</button></div><div class="ov-scroll">${body}</div></div>`;
}
/* ============================================================
   EXCEPTION CENTER — TAHAP 2 (Exception → Fleet → Unit → Event → Detail)
   Murni layer presentasi/derivasi dari data existing. TIDAK ada query/tabel/kolom baru, TIDAK ada formula baru,
   TIDAK ada validasi baru:
   - Production Gap: Actual/Plan dari getFiltered()/getFilteredPlan() (sama dgn Overview).
   - Breakdown: ovFleetState() (hari terakhir tercatat) — sama dgn Overview.
   - Delay/Idle/Weather: getFilteredDelay()/getFilteredIdle() (Weather = idle scope GLOBAL).
   - Data Quality: HASIL validateUnitShiftHours() & getUnifiedStandbyHours().conflicts existing.
   - Severity: ai_classifyLow/ai_classifyHigh dgn ambang yang SUDAH dipakai halaman AI Insight
     (Ach 80/90/95, Delay/Idle % jam terjadwal 15/8/3, Weather jam 40/20/10). Breakdown per unit mengikuti
     Overview (HIGH) karena belum ada ambang khusus per unit — CRITICAL TIDAK diberikan.
   - Event detail: hanya field yang ada (tanggal, shift, unit, fleet, kode, alasan, durasi). Jam mulai/selesai
     TIDAK dimuat dashboard (kolom tidak di-select) → ditampilkan "tidak tersedia", bukan dikarang.
   SUPABASE IMPACT: NONE. ============================================================ */
const EX = { type:'all', path:[], drawer:null };
const EX_SEV = ['CRITICAL','HIGH','MEDIUM','INFORMATION'];
const EX_RANK = { CRITICAL:0, HIGH:1, MEDIUM:2, INFORMATION:3 };
const EX_COLOR = { CRITICAL:'var(--danger)', HIGH:'#F97316', MEDIUM:'var(--warning)', INFORMATION:'var(--info)' };
const EX_TYPES = { gap:'Production Gap', breakdown:'Breakdown', delay:'Delay', idle:'Idle', weather:'Weather / Rain', dq:'Data Quality' };
const exQ = v => esc(JSON.stringify(v));
function exCompute(){ return memoFiltered('exceptions', ()=> p5WithActual(exBuild)); } /* [PHASE 5 FIX] actual-only, klasifikasi p5Cls sama dgn Summary/Ask AI/Explanation */

function exBuild(){
  const data=getFiltered(), plan=getFilteredPlan(), pu=getFilteredUnitStatus(), dl=getFilteredDelay(), idl=getFilteredIdle();
  const uf=filters.unit, unitOk=u=> uf==='all' || u===uf;
  const pu2 = uf==='all'?pu:pu.filter(s=>s.unit===uf);
  const dl2 = uf==='all'?dl:dl.filter(e=>e.unit===uf);
  const idl2 = idl.filter(e=> e.scope!=='UNIT' || unitOk(e.unit));
  const idlUnit = idl2.filter(e=>e.scope==='UNIT'), wx = idl2.filter(e=>e.scope==='GLOBAL');
  const pa_ = computePAUA(pu2, dl2, idl2), sch = pa_.scheduled;
  const fs = ovFleetState();
  const events = [
    ...dl2.map(e=>({t:'Delay',date:e.date,shift:e.shift,unit:e.unit,fleet:e.fleet,code:e.code,reason:e.name,h:e.hours})),
    ...idlUnit.map(e=>({t:'Idle',date:e.date,shift:e.shift,unit:e.unit,fleet:e.fleet,code:e.code,reason:e.name,h:e.hours})),
    ...wx.map(e=>({t:'Weather',date:e.date,shift:e.shift,unit:null,fleet:null,code:e.code,reason:e.name,h:e.hours})),
    ...pu2.filter(s=>s.status==='Breakdown').map(s=>({t:'Breakdown',date:s.date,shift:s.shift,unit:s.unit,fleet:s.fleet,code:null,reason:s.category||'-',h:s.durationHours,src:s.dataSource}))
  ].sort((a,b)=> a.date<b.date?1:a.date>b.date?-1:b.h-a.h);
  events.forEach((e,i)=> e.i=i);

  const items=[], add=o=>items.push(o);
  const maxDate = rows => rows.reduce((m,r)=> r.date>m?r.date:m,'') || null;
  const top = rows=>{ const g=U.groupBy(rows,d=>d.name); let t=null,m=0; g.forEach((v,k)=>{ const h=U.sum(v,'hours'); if(h>m){m=h;t=k;} }); return t?`${t} (${ovDur(m)})`:null; };
  const tm = (d,s)=> [d,s].filter(Boolean).join(' • ');

  // 1) Production Gap (site/fleet — unit filter tidak berlaku)
  [['OB','OB_PRODUCTION','Overburden','BCM'],['CO','CO_PRODUCTION','Coal','Ton']].forEach(([k,key,name,unit])=>{
    const rows=data.filter(r=>r.stream===key), a=U.sum(rows,'productionVolume'), p=U.sum(plan.filter(x=>x.stream===key),'targetVolume');
    if(!(p>0) || a>=p) return;
    const ach=a/p*100, sev=ai_classifyLow(ach,{critical:80,high:90,medium:95})||'INFORMATION', d=maxDate(rows);
    add({id:'gap:'+k,type:'gap',sev,title:'Production Gap — '+name,unitFleet:'Site / Fleet',dur:null,imp:Math.abs(a-p),
      impactTxt:ovSigned(a-p)+' '+unit,time:d||'-',status:'Below Plan',date:d,
      big:ovSigned(a-p)+' '+unit,lines:['Achievement: '+U.fmt(ach,1)+'%','Plan: '+U.fmt(p,0)+' • Actual: '+U.fmt(a,0)],btn:'VIEW DETAILS'});
  });
  // 2) Breakdown per unit (hari terakhir tercatat, sama dgn Overview)
  fs.units.filter(u=>(u.h.Breakdown||0)>0 && unitOk(u.unit)).forEach(u=>{
    const shifts=[...new Set(pu2.filter(s=>s.unit===u.unit&&s.date===fs.refDate&&s.status==='Breakdown').map(s=>s.shift))].join(', ');
    add({id:'bd:'+u.unit,type:'breakdown',sev:'HIGH',title:u.unit,unitFleet:u.unit+' • '+u.fleet,dur:u.h.Breakdown,imp:u.h.Breakdown,
      impactTxt:'—',time:tm(fs.refDate,shifts),status:'Breakdown',date:fs.refDate,
      big:u.unit,lines:['Duration: '+ovDur(u.h.Breakdown),'Status: Breakdown • '+u.fleet],btn:'VIEW UNIT'});
  });
  // 3) Delay & 4) Idle (agregat; ambang = % jam terjadwal, sama dgn Overview/AI Insight)
  [['delay','Delay',dl2],['idle','Idle',idlUnit]].forEach(([id,T,rows])=>{
    if(!rows.length) return;
    const h=U.sum(rows,'hours'), r=sch?h/sch*100:0, lv=sch?ai_classifyHigh(r,{critical:15,high:8,medium:3}):null, d=maxDate(rows);
    const nU=new Set(rows.map(e=>e.unit).filter(Boolean)).size, tp=top(rows);
    add({id,type:id,sev:lv||'INFORMATION',title:T,unitFleet:nU+' unit',dur:h,imp:h,impactTxt:sch?U.fmt(r,1)+'% jam terjadwal':'—',
      time:d||'-',status:'Recorded',date:d,big:nU+(nU===1?' Unit':' Units'),
      lines:['Recorded duration: '+ovDur(h),rows.length+' event'+(tp?' • Terbesar: '+tp:'')],btn:'VIEW EVENTS'});
  });
  // 5) Weather / Rain (site-level)
  if(wx.length){
    const h=U.sum(wx,'hours'), lv=ai_classifyHigh(h,{critical:40,high:20,medium:10}), d=maxDate(wx);
    add({id:'weather',type:'weather',sev:lv||'INFORMATION',title:'Weather / Rain',unitFleet:'Site-level',dur:h,imp:h,impactTxt:wx.length+' event',
      time:d||'-',status:'Recorded',date:d,big:U.fmt(h,1)+' jam',lines:[wx.length+' event cuaca site-wide','Site-level — bukan per unit'],btn:'VIEW EVENTS'});
  }
  // 6) Data Quality — HANYA hasil validasi existing
  const uni = getUnifiedStandbyHours(pu2,dl2,idl2);
  const bad = uni.rows.filter(r=> validateUnitShiftHours([r]).length>0);
  if(bad.length){
    const mh=U.sum(bad,'vMissing');
    add({id:'dq:hours',type:'dq',sev:'MEDIUM',title:'Validasi jam unit-shift',unitFleet:bad.length+' unit-shift',dur:mh||null,imp:bad.length,
      impactTxt:mh>0?ovDur(mh)+' belum terklasifikasi':'Melebihi scheduled',time:maxDate(bad)||'-',status:'Perlu review',date:maxDate(bad),
      big:String(bad.length),lines:['unit-shift tidak lolos validateUnitShiftHours','Belum terklasifikasi: '+ovDur(mh)],btn:'VIEW ISSUES'});
  }
  if(uni.conflicts.length) add({id:'dq:conflict',type:'dq',sev:'INFORMATION',title:'Standby legacy + itemized',unitFleet:uni.conflicts.length+' unit-shift',dur:null,imp:uni.conflicts.length,
    impactTxt:'Info validasi',time:maxDate(uni.conflicts)||'-',status:'Info',date:maxDate(uni.conflicts),big:String(uni.conflicts.length),
    lines:['unit-shift dgn Standby legacy + Idle/Delay itemized','Info dari validasi existing (bukan error)'],btn:'VIEW ISSUES'});
  const dates=[...new Set([...data.map(r=>r.date),...pu.map(s=>s.date)])].sort(), latest=dates[dates.length-1]||null;
  if(latest){
    const age=Math.round((new Date(new Date().toISOString().slice(0,10))-new Date(latest))/86400000);
    if(age>1) add({id:'dq:stale',type:'dq',sev:'INFORMATION',title:'Data terakhir '+latest,unitFleet:'Site-level',dur:null,imp:age,impactTxt:age+' hari lalu',
      time:latest,status:'Stale',date:latest,big:age+' hari',lines:['Data terakhir tercatat: '+latest],btn:'VIEW'});
  }
  items.sort((a,b)=> EX_RANK[a.sev]-EX_RANK[b.sev] || (b.date||'').localeCompare(a.date||'') || (b.dur||0)-(a.dur||0) || (b.imp||0)-(a.imp||0));
  const loss = { Breakdown:pa_.breakdown, Delay:U.sum(dl2,'hours'), Idle:U.sum(idlUnit,'hours'), Weather:U.sum(wx,'hours') };
  return { items, events, data, plan, pu2, dl2, idlUnit, wx, uni, bad, fs, loss };
}

/* ---- navigasi drilldown (state EX.path; filter global tetap utuh karena tidak disentuh) ---- */
function exMode(id){
  if(id.startsWith('gap:')) return {m:'gap',s:id.slice(4)};
  if(id.startsWith('bd:')||id.startsWith('unit:')) return {m:'unit',u:id.slice(id.indexOf(':')+1)};
  if(id.startsWith('dq')) return {m:'dq',k:id};
  const t = id.startsWith('cat:')?id.slice(4).toLowerCase():id;
  if(t==='weather') return {m:'ev',T:'Weather'};
  return {m:'cat',T:t==='breakdown'?'Breakdown':t==='idle'?'Idle':'Delay'};
}
function exLabel(id){
  const m=exMode(id);
  return m.m==='gap'?'Production Gap '+m.s : m.m==='unit'?'Unit '+m.u : m.m==='dq'?'Data Quality' : m.T;
}
function exScroll(){ setTimeout(()=>{ const d=document.getElementById('exDrill'); if(d) d.scrollIntoView({behavior:'smooth',block:'nearest'}); },30); }
function exOpen(id){
  EX.drawer=null; EX.path=[{k:'exc',v:id,l:exLabel(id)}];
  const m=exMode(id); if(m.m==='unit') EX.path.push({k:'unit',v:m.u,l:m.u});
  if(id.startsWith('bd:')) EX.drawer=m.u;
  renderPage(); exScroll();
}
function exGo(k,v,l){ EX.path.push({k,v,l:l||String(v)}); renderPage(); exScroll(); }
function exBack(i){ EX.path=EX.path.slice(0,i+1); EX.drawer=null; renderPage(); }
function exSetType(t){ EX.type=t; renderPage(); }
function exDrawer(u){ EX.drawer=u; renderPage(); }
function exOpenEvent(i){
  const e=exCompute().events[i]; if(!e) return;
  EX.drawer=null; EX.path=[{k:'exc',v:'unit:'+e.unit,l:'Unit '+e.unit},{k:'unit',v:e.unit,l:e.unit},{k:'event',v:i,l:e.t+' '+ovDur(e.h)}];
  renderPage(); exScroll();
}
function exGoPage(page, fleet){
  if(fleet && fleet!=='-'){ filters.fleet=fleet; const s=document.getElementById('f_fleet'); if(s) s.value=fleet; }
  EX.drawer=null; navigate(page);
}
const exPageOf = t => t==='Delay'?'delay' : t==='Breakdown'?'maintenance' : 'idle';

/* ---- badge sidebar (jumlah exception non-INFORMATION); tidak ada sistem notifikasi baru ---- */
function exUpdateNavBadge(){
  try{
    const el=document.querySelector('.nav-item[data-nav="exceptions"] .side-label'); if(!el) return;
    const n=exCompute().items.filter(x=>x.sev!=='INFORMATION').length;
    let b=el.querySelector('.ex-nb');
    if(!n){ if(b) b.remove(); return; }
    if(!b){ b=document.createElement('span'); b.className='ex-nb'; el.appendChild(b); }
    b.textContent=n;
  }catch(e){}
}

/* ---- komponen tampilan ---- */
function exCardHTML(x){
  return `<div class="ex-card" style="--sev:${EX_COLOR[x.sev]}"><div class="t">${esc(EX_TYPES[x.type])} • ${x.sev}</div><div class="big">${esc(x.big)}</div>${x.lines.map(l=>`<div class="ln">${esc(l)}</div>`).join('')}<button class="ov-link" onclick="exOpen(${exQ(x.id)})">${esc(x.btn)} ›</button></div>`;
}
function exRowHTML(x){
  return `<tr class="ov-click" onclick="exOpen(${exQ(x.id)})" style="--sev:${EX_COLOR[x.sev]}"><td><span class="ex-sev">${x.sev}</span></td><td>${esc(EX_TYPES[x.type])}</td><td>${esc(x.unitFleet||'-')}</td><td class="r">${x.dur!=null?ovDur(x.dur):'—'}</td><td class="r">${esc(x.impactTxt||'—')}</td><td>${esc(x.time||'-')}</td><td>${esc(x.status||'-')}</td></tr>`;
}
function exLiHTML(x){
  return `<div class="ex-li" style="--sev:${EX_COLOR[x.sev]}" onclick="exOpen(${exQ(x.id)})"><b><span class="ex-sev">${x.sev}</span> ${esc(EX_TYPES[x.type])} — ${esc(x.unitFleet||'-')}</b><span>${x.dur!=null?ovDur(x.dur)+' • ':''}${esc(x.impactTxt||'')} • ${esc(x.time||'-')} • ${esc(x.status||'-')}</span></div>`;
}
const exTbl = (head,rows)=> `<table class="ov-tbl"><thead><tr>${head.map(h=>`<th${h[1]?' class="r"':''}>${h[0]}</th>`).join('')}</tr></thead><tbody>${rows.join('')||`<tr><td colspan="${head.length}" class="ov-note">Tidak ada data pada filter ini.</td></tr>`}</tbody></table>`;
const exEvRow = e=> `<tr class="ov-click" onclick="exGo('event',${e.i},${exQ(e.t+' '+ovDur(e.h))})"><td>${esc(e.date)}</td><td>${esc(e.shift)}</td><td>${esc(e.t)}</td><td>${esc(e.reason)}</td><td class="r">${ovDur(e.h)}</td></tr>`;
const exEvHead = [['Tanggal'],['Shift'],['Jenis'],['Alasan'],['Durasi',1]];

function exEventHTML(C,i){
  const e=C.events[i]; if(!e) return '<div class="ov-note">Event tidak ditemukan pada filter saat ini.</div>';
  const prod = e.unit ? RECORDS.filter(r=>p5Cls(r,p5Today())==='actual' && r.date===e.date && r.shift===e.shift && (r.digger===e.unit||r.hauler===e.unit)) : [];
  const ops=[...new Set(prod.map(r=> r.digger===e.unit?r.operator:r.driver).filter(Boolean))], pits=[...new Set(prod.map(r=>r.pit).filter(Boolean))];
  const NA='<span class="ex-na">Tidak tersedia di data existing</span>';
  const kv=(k,v)=>`<div class="ex-kv"><label>${k}</label><b>${v}</b></div>`;
  const rel = e.unit ? C.events.filter(x=>x.unit===e.unit&&x.date===e.date&&x.shift===e.shift&&x.i!==e.i).slice(0,6) : [];
  return `<div class="ex-kvs">
    ${kv('Unit', e.unit?esc(e.unit):'<span class="ex-na">Site-level (tanpa unit)</span>')}${kv('Fleet', e.fleet&&e.fleet!=='-'?esc(e.fleet):NA)}
    ${kv('Jenis', esc(e.t))}${e.code?kv('Kode', esc(e.code)):''}${kv('Alasan / Kategori', esc(e.reason))}
    ${kv('Tanggal', esc(e.date))}${kv('Shift', esc(e.shift))}${kv('Durasi', ovDur(e.h)+' <small>('+U.fmt(e.h,2)+' jam)</small>')}
    ${kv('Start', NA)}${kv('End', NA)}
    ${kv('Operator', ops.length?esc(ops.join(', '))+' <small class="ex-na">(dari catatan produksi shift yang sama)</small>':NA)}
    ${kv('Pit', pits.length?esc(pits.join(', '))+' <small class="ex-na">(dari catatan produksi shift yang sama)</small>':NA)}
    ${e.src?kv('Sumber data', esc(e.src)):''}</div>
    <div class="ov-note">Data apa adanya — tanpa inferensi root cause. Jam mulai/selesai tidak dimuat dashboard (event hanya menyimpan durasi).</div>
    ${rel.length?`<div class="ov-note mt-2"><b>Event lain unit ini di shift yang sama</b></div>${exTbl(exEvHead,rel.map(exEvRow))}`:''}
    <button class="ov-link" onclick="exGoPage('${exPageOf(e.t)}',${exQ(e.fleet||'')})">Buka halaman ${esc(e.t)} (filter fleet ${esc(e.fleet&&e.fleet!=='-'?e.fleet:'tetap')}) ›</button>`;
}

function exDrawerHTML(C,u){
  const un=C.fs.units.find(x=>x.unit===u), h=un?un.h:{};
  const bd=C.pu2.filter(s=>s.unit===u&&s.date===C.fs.refDate&&s.status==='Breakdown');
  const shifts=[...new Set(C.pu2.filter(s=>s.unit===u&&s.date===C.fs.refDate).map(s=>s.shift))].join(', ');
  const rows=RECORDS.filter(r=>p5Cls(r,p5Today())==='actual' && (r.digger===u||r.hauler===u));
  let lastProd='<span class="ex-na">Tidak ada catatan produksi</span>';
  if(rows.length){
    const d=rows.reduce((m,r)=>r.date>m?r.date:m,''), same=rows.filter(r=>r.date===d), vu=U.groupBy(same,r=>r.volumeUnit);
    lastProd=esc(d)+' • '+[...vu.entries()].map(([k,a])=>U.fmt(U.sum(a,'productionVolume'),0)+' '+esc(k)).join(' + ');
  }
  const kv=(k,v)=>`<div class="ex-kv"><label>${k}</label><b>${v}</b></div>`;
  const hist=C.events.filter(e=>e.unit===u).slice(0,8);
  return `<div class="ex-ov" onclick="exDrawer(null)"></div><aside class="ex-drawer" role="dialog" aria-label="Detail unit ${esc(u)}">
    <div class="flex justify-between items-start"><div><div class="font-display text-lg font-semibold">${esc(u)}</div><div class="ov-note">${esc(un?un.fleet:'-')}</div></div><button class="ov-x" onclick="exDrawer(null)" aria-label="Tutup">✕</button></div>
    <div class="ex-kvs">
      ${kv('Status ('+esc(C.fs.refDate||'-')+')', esc(un?un.primary:'-'))}
      ${kv('Current Event', bd.length?esc([...new Set(bd.map(b=>b.category||'-'))].join(', ')):'<span class="ex-na">Tidak ada breakdown</span>')}
      ${kv('Duration Breakdown', h.Breakdown?ovDur(h.Breakdown):'—')}${kv('Shift', esc(shifts||'-'))}
      ${kv('Operating', ovDur(h.Operating||0))}${kv('Delay', ovDur(h.Delay||0))}${kv('Idle', ovDur(h.Idle||0))}${kv('Standby', ovDur(h.Standby||0))}
      ${kv('Last Production', lastProd)}</div>
    <div class="ov-note"><b>History event (8 terbaru pada filter)</b></div>
    ${exTbl([['Tanggal'],['Jenis'],['Alasan'],['Durasi',1]],hist.map(e=>`<tr class="ov-click" onclick="exOpenEvent(${e.i})"><td>${esc(e.date)}</td><td>${esc(e.t)}</td><td>${esc(e.reason)}</td><td class="r">${ovDur(e.h)}</td></tr>`))}
    <button class="ov-link" onclick="exGoPage('${h.Breakdown?'maintenance':'equipment'}',${exQ(un?un.fleet:'')})">Buka ${h.Breakdown?'Breakdown':'Equipment'} (filter fleet ${esc(un?un.fleet:'-')}) ›</button><button class="ov-link" onclick="axUnitAnalytics(${exQ(u)})">View Analytics ›</button></aside>`;
}

function exPanelHTML(C){
  const P=EX.path; if(!P.length) return '';
  const M=exMode(P[0].v), last=P[P.length-1];
  const crumbs=[`<button class="ov-crumb" onclick="exBack(-1)">Exception Center</button>`].concat(P.map((p,i)=>`<button class="ov-crumb ${i===P.length-1?'on':''}" onclick="exBack(${i})">${esc(p.l)}</button>`)).join('<span class="ov-sep">›</span>');
  const evT = C.events.filter(e=> M.m==='cat' ? e.t===M.T : true);
  const unitTbl = (fleet)=>{
    const src = C.events.filter(e=> e.unit && e.fleet===fleet && (M.m==='cat'? e.t===M.T : e.t!=='Weather'));
    const g=U.groupBy(src,e=>e.unit);
    const rows=[...g.entries()].map(([u,a])=>({u,h:{Breakdown:0,Delay:0,Idle:0,...Object.fromEntries([...U.groupBy(a,e=>e.t).entries()].map(([t,b])=>[t,U.sum(b,'h')]))},n:a.length}));
    rows.forEach(r=>r.tot=r.h.Breakdown+r.h.Delay+r.h.Idle); rows.sort((a,b)=>b.tot-a.tot);
    return M.m==='cat'
      ? exTbl([['Unit'],['Event',1],['Durasi',1]],rows.map(r=>`<tr class="ov-click" onclick="exGo('unit',${exQ(r.u)})"><td><b>${esc(r.u)}</b></td><td class="r">${r.n}</td><td class="r">${ovDur(r.tot)}</td></tr>`))
      : exTbl([['Unit'],['BD',1],['Delay',1],['Idle',1]],rows.map(r=>`<tr class="ov-click" onclick="exGo('unit',${exQ(r.u)})"><td><b>${esc(r.u)}</b></td><td class="r">${ovDur(r.h.Breakdown)}</td><td class="r">${ovDur(r.h.Delay)}</td><td class="r">${ovDur(r.h.Idle)}</td></tr>`));
  };
  let body='';
  if(last.k==='exc'){
    if(M.m==='gap'){
      const key=M.s==='OB'?'OB_PRODUCTION':'CO_PRODUCTION', uL=M.s==='OB'?'BCM':'Ton';
      const fa=U.groupBy(C.data.filter(r=>r.stream===key),r=>r.fleet), fp=U.groupBy(C.plan.filter(p=>p.stream===key),p=>p.fleet);
      const rows=[...new Set([...fa.keys(),...fp.keys()])].map(f=>{ const a=U.sum(fa.get(f)||[],'productionVolume'), p=U.sum(fp.get(f)||[],'targetVolume'); return {f,a,p,g:a-p,ach:p?a/p*100:null}; }).sort((x,y)=>x.g-y.g);
      body=`<div class="ov-note">Actual vs Plan per fleet (${uL}), gap terbesar di atas. Klik fleet untuk melihat unit. Durasi event ≠ BCM loss (belum ada konversi valid).</div>${exTbl([['Fleet'],['Actual',1],['Plan',1],['Ach',1],['Gap',1]],rows.map(r=>`<tr class="ov-click" onclick="exGo('fleet',${exQ(r.f)})"><td><b>${esc(r.f)}</b></td><td class="r">${U.fmt(r.a,0)}</td><td class="r">${U.fmt(r.p,0)}</td><td class="r">${r.ach==null?'—':U.fmt(r.ach,1)+'%'}</td><td class="r" style="color:${r.g<0?'var(--danger)':'var(--success)'}">${ovSigned(r.g)}</td></tr>`))}<button class="ov-link" onclick="exGoPage('production')">Buka Production (filter aktif) ›</button>`;
    } else if(M.m==='cat'){
      const g=U.groupBy(evT.filter(e=>e.unit),e=>e.fleet||'-');
      const rows=[...g.entries()].map(([f,a])=>({f,n:a.length,h:U.sum(a,'h')})).sort((a,b)=>b.h-a.h);
      body=`<div class="ov-note">${esc(M.T)} per fleet pada periode filter (durasi tercatat). Klik fleet untuk melihat unit.</div>${exTbl([['Fleet'],['Event',1],['Durasi',1]],rows.map(r=>`<tr class="ov-click" onclick="exGo('fleet',${exQ(r.f)})"><td><b>${esc(r.f)}</b></td><td class="r">${r.n}</td><td class="r">${ovDur(r.h)}</td></tr>`))}`;
    } else if(M.m==='ev'){
      body=`<div class="ov-note">Event cuaca site-wide (idle scope GLOBAL) — tidak terkait unit/fleet. Klik event untuk detail.</div>${exTbl(exEvHead,C.events.filter(e=>e.t==='Weather').slice(0,50).map(exEvRow))}`;
    } else if(M.m==='dq'){
      if(M.k==='dq:hours') body=`<div class="ov-note">Hasil validateUnitShiftHours() existing. Klik unit untuk melihat event.</div>${exTbl([['Unit'],['Tanggal'],['Shift'],['Pesan validasi']],C.bad.slice(0,60).map(r=>`<tr class="ov-click" onclick="exGo('unit',${exQ(r.unit)})"><td><b>${esc(r.unit)}</b></td><td>${esc(r.date)}</td><td>${esc(r.shift)}</td><td>${esc(validateUnitShiftHours([r])[0]||'')}</td></tr>`))}`;
      else if(M.k==='dq:conflict') body=`<div class="ov-note">Info dari getUnifiedStandbyHours().conflicts: Standby legacy + Idle/Delay itemized pada unit-shift yang sama (valid, tidak dihitung ganda).</div>${exTbl([['Unit'],['Tanggal'],['Shift'],['Standby',1],['Idle',1],['Delay',1]],C.uni.conflicts.slice(0,60).map(r=>`<tr class="ov-click" onclick="exGo('unit',${exQ(r.unit)})"><td><b>${esc(r.unit)}</b></td><td>${esc(r.date)}</td><td>${esc(r.shift)}</td><td class="r">${ovDur(r.standbyLegacy)}</td><td class="r">${ovDur(r.idle)}</td><td class="r">${ovDur(r.delay)}</td></tr>`))}`;
      else body=`<div class="ov-note">Data terbaru yang tercatat sudah lebih dari 1 hari dari hari ini (mengikuti indikator Fresh/Stale di Overview). Bisa normal bila filter menampilkan periode lampau.</div>`;
    }
  } else if(last.k==='fleet'){
    body=`<div class="ov-note">Unit di <b>${esc(last.v)}</b> pada periode filter${M.m==='cat'?' ('+esc(M.T)+')':''}, durasi tercatat terbesar di atas. Klik unit untuk melihat event.</div>${unitTbl(last.v)}<button class="ov-link" onclick="exGoPage('production',${exQ(last.v)})">Buka Production (filter fleet ${esc(last.v)}) ›</button>`;
  } else if(last.k==='unit'){
    const u=last.v, ev=C.events.filter(e=>e.unit===u && (M.m==='cat'? e.t===M.T : true));
    const un=C.fs.units.find(x=>x.unit===u);
    body=`<div class="ov-note">Event <b>${esc(u)}</b>${un?' • '+esc(un.fleet):''} pada periode filter${ev.length>30?' (30 terbaru dari '+ev.length+')':''}. Alasan/durasi apa adanya dari data.</div><button class="ov-link" onclick="exDrawer(${exQ(u)})">Panel unit ▸</button>${exTbl(exEvHead,ev.slice(0,30).map(exEvRow))}`;
  } else if(last.k==='event'){
    body=exEventHTML(C,last.v);
  }
  return `<div id="exDrill" class="ov-panel mb-4"><div class="ov-panel-h"><div class="ov-crumbs">${crumbs}</div><div class="flex gap-2">${axExcLink(M,last)}${P.length>1?`<button class="ov-link" onclick="exBack(${P.length-2})">← Kembali</button>`:''}<button class="ov-x" onclick="exBack(-1)" aria-label="Tutup">✕</button></div></div><div class="ov-scroll">${body}</div></div>`;
}

function render_exceptions(data, el){
  const C=exCompute();
  const major=C.items.filter(x=>x.sev!=='INFORMATION');
  const vis=EX.type==='all'?C.items:C.items.filter(x=>x.type===EX.type);
  const cnt={}; C.items.forEach(x=>cnt[x.sev]=(cnt[x.sev]||0)+1);
  const tcnt={}; C.items.forEach(x=>tcnt[x.type]=(tcnt[x.type]||0)+1);
  const notes=[];
  if(filters.operator!=='all') notes.push('Filter Operator tidak berlaku pada event (delay/idle/status unit tidak menyimpan operator).');
  if(filters.unit!=='all') notes.push('Filter Unit berlaku untuk Breakdown/Delay/Idle/Data Quality; Production Gap tetap level Fleet/Site, Weather tetap Site-level.');
  const hasData = RECORDS.length||UNIT_STATUS.length;
  const K5=p5KpiActual(), noActual=!C.data.length&&!C.pu2.length&&!C.dl2.length&&!C.idlUnit.length&&!C.wx.length, pl5=p5PlanFutureLines(K5);
  const lossBtn=(T)=>`<button ${C.loss[T]>0?`onclick="exOpen('cat:${T}')"`:'disabled'}><label>${T}</label><b>${ovDur(C.loss[T])}</b></button>`;
  el.innerHTML = `
  ${pitFilterCaveatHTML()}
  ${notes.length?`<div class="di-alert warn mb-4" style="font-size:.8rem">${notes.map(esc).join(' ')}</div>`:''}
  ${p5ClassNote(K5)}
  ${exPanelHTML(C)}
  <div class="ov-sec">Exception Summary ${major.length?`<span>ATTENTION REQUIRED ${major.length}</span>`:''}</div>
  <div class="ex-bar mb-3">${EX_SEV.map(s=>`<span class="ex-cnt ${cnt[s]?'has':''}" style="--sev:${EX_COLOR[s]}">${s} ${cnt[s]||0}</span>`).join('<span class="ex-cnt">•</span>')}</div>
  ${major.length ? `<div class="ex-cards mb-4">${major.slice(0,6).map(exCardHTML).join('')}</div>` :
    `<div class="ex-calm mb-4"><b>${noActual?'TIDAK ADA EXCEPTION ACTUAL':hasData?'NO MAJOR EXCEPTIONS':'BELUM ADA DATA'}</b><span>${noActual?'Tidak ada exception actual pada filter ini.':hasData?'Semua indikator operasional yang dipantau berada dalam ambang yang sudah dikonfigurasi.':'Tidak ada data pada filter ini.'}</span></div>`}
  <div class="ov-sec">Loss by Category <span>durasi event tercatat • bukan konversi BCM</span></div>
  <div class="ex-loss mb-4">${['Breakdown','Delay','Idle','Weather'].map(lossBtn).join('')}</div>
  <div class="ov-sec">Exception List <span>klik baris untuk drilldown</span></div>
  <div class="ex-bar mb-2"><button class="ex-chip ${EX.type==='all'?'on':''}" onclick="exSetType('all')">Semua<b>${C.items.length}</b></button>${Object.keys(EX_TYPES).filter(t=>tcnt[t]).map(t=>`<button class="ex-chip ${EX.type===t?'on':''}" onclick="exSetType('${t}')">${EX_TYPES[t]}<b>${tcnt[t]}</b></button>`).join('')}</div>
  <div class="ov-panel mb-4">
    <div class="ex-tbl-wrap ov-scroll">${exTbl([['Priority'],['Type'],['Unit/Fleet'],['Duration',1],['Impact',1],['Time'],['Status']],vis.map(exRowHTML))}</div>
    <div class="ex-list">${vis.map(exLiHTML).join('')||'<div class="ov-note">Tidak ada exception.</div>'}</div>
  </div>
  ${pl5.length?`<div class="ov-panel mb-4"><div class="ov-note"><b>PLAN / MENDATANG (bukan actual)</b><ul style="margin:4px 0 0 16px">${pl5.map(x=>`<li>${x}</li>`).join('')}</ul></div></div>`:''}
  ${EX.drawer?exDrawerHTML(C,EX.drawer):''}`;
}

function render_overview(data, el){
  const plan = getFilteredPlan(), pu = getFilteredUnitStatus(), dl = getFilteredDelay(), idl = getFilteredIdle();
  const pa_ = computePAUA(pu, dl, idl), pa = pa_.pa, ua = pa_.ua;
  const S = {
    OB:{ key:'OB_PRODUCTION', name:'Overburden', unit:'BCM' },
    CO:{ key:'CO_PRODUCTION', name:'Coal', unit:'Ton' }
  };
  Object.values(S).forEach(s=>{
    s.actual = U.sum(data.filter(r=>r.stream===s.key),'productionVolume');
    s.plan = U.sum(plan.filter(p=>p.stream===s.key),'targetVolume');
    s.ach = s.plan ? s.actual/s.plan*100 : null;
    s.gap = s.actual - s.plan;
    s.byA = U.groupBy(data.filter(r=>r.stream===s.key), r=>r.date);
    s.byP = U.groupBy(plan.filter(p=>p.stream===s.key), p=>p.date);
    s.lastDate = [...s.byA.keys()].filter(d=>U.sum(s.byA.get(d),'productionVolume')>0).sort().pop() || null;
  });
  const fs = ovFleetState();
  const stateOrder = [...fs.prio, ...Object.keys(fs.counts).filter(k=>!fs.prio.includes(k))];
  const stateLabel = {Operating:'Operating', Delay:'Delay', Idle:'Idle', Breakdown:'Breakdown', Standby:'Standby'};
  const stateColor = {Operating:'var(--success)', Delay:'var(--warning)', Idle:'var(--info)', Breakdown:'var(--danger)', Standby:'var(--text-dim)'};
  const totalUnits = fs.units.length;
  const operating = fs.counts.Operating||0, bdUnits = fs.counts.Breakdown||0, availUnits = totalUnits - bdUnits;

  // ---- loss (durasi event tercatat) ----
  const idleUnitRows = idl.filter(i=>i.scope==='UNIT'), idleGlobal = idl.filter(i=>i.scope==='GLOBAL');
  const bdRows = pu.filter(s=>s.status==='Breakdown');
  const loss = [
    {k:'Breakdown', h:pa_.breakdown, n:bdRows.length, c:'var(--danger)'},
    {k:'Delay', h:U.sum(dl,'hours'), n:dl.length, c:'var(--warning)'},
    {k:'Idle', h:U.sum(idleUnitRows,'hours'), n:idleUnitRows.length, c:'var(--info)'}
  ];
  const lossTotal = loss.reduce((s,l)=>s+l.h,0);
  const wxH = U.sum(idleGlobal,'hours'), wxN = idleGlobal.length;
  const wxToday = U.sum(idleGlobal.filter(i=>i.date===fs.refDate),'hours');
  const wxLabel = wxToday>0 ? `Hujan/Cuaca ${U.fmt(wxToday,1)} jam` : (fs.refDate ? 'Tidak ada event cuaca' : '-');

  // ---- attention ----
  const att = [];
  ['OB','CO'].forEach(k=>{ const s=S[k];
    if(s.plan>0 && s.ach<100) att.push({sev:s.ach<90?2:1, title:`Production Below Plan — ${s.name}`, detail:`Achievement ${U.fmt(s.ach,1)}% — Gap ${ovSigned(s.gap)} ${s.unit}`, act:'View', go:['gap',k]});
  });
  fs.units.filter(u=>(u.h.Breakdown||0)>0).sort((a,b)=>b.h.Breakdown-a.h.Breakdown).slice(0,4).forEach(u=>{
    att.push({sev:2, title:`${u.unit} Breakdown`, detail:`Durasi ${ovDur(u.h.Breakdown)} • ${u.fleet} • ${fs.refDate}`, act:'View Unit', go:['unit',u.unit]});
  });
  if(pa_.scheduled>0){
    const dR = U.sum(dl,'hours')/pa_.scheduled*100, iR = loss[2].h/pa_.scheduled*100;
    const dLv = ai_classifyHigh(dR,{critical:15,high:8,medium:3}), iLv = ai_classifyHigh(iR,{critical:15,high:8,medium:3});
    const top = (rows)=>{ const g=U.groupBy(rows,d=>d.name); let t=null,m=0; g.forEach((v,k)=>{ const h=U.sum(v,'hours'); if(h>m){m=h;t=k;} }); return t?`${t} (${ovDur(m)})`:'-'; };
    if(dLv) att.push({sev:dLv==='MEDIUM'?1:2, title:'Significant Delay', detail:`${ovDur(U.sum(dl,'hours'))} (${U.fmt(dR,1)}% jam terjadwal) • Terbesar: ${top(dl)}`, act:'View', go:['cause','Delay']});
    if(iLv) att.push({sev:iLv==='MEDIUM'?1:2, title:'High Idle', detail:`${ovDur(loss[2].h)} (${U.fmt(iR,1)}% jam terjadwal) • Terbesar: ${top(idleUnitRows)}`, act:'View', go:['cause','Idle']});
    if(pa>0 && pa<80) att.push({sev:2, title:'PA di bawah target', detail:`PA ${U.fmt(pa,1)}% (target umum ≥ 80%)`, act:'PA & UA', nav:'pa_ua'});
    if(ua>0 && ua<70) att.push({sev:1, title:'UA di bawah target', detail:`UA ${U.fmt(ua,1)}% (target umum ≥ 70%)`, act:'PA & UA', nav:'pa_ua'});
  }
  const wxLv = ai_classifyHigh(wxH,{critical:40,high:20,medium:10});
  if(wxLv) att.push({sev:wxLv==='MEDIUM'?1:2, title:'Weather Impact', detail:`${U.fmt(wxH,1)} jam event cuaca site-wide (${wxN} event)`, act:'View', nav:'idle'});
  att.sort((a,b)=>b.sev-a.sev);

  // ---- context / freshness ----
  const shiftLbl = filters.shift==='all' ? 'Semua Shift' : filters.shift;
  const dates = [...new Set([...data.map(r=>r.date), ...pu.map(s=>s.date)])].sort();
  const latest = dates[dates.length-1] || '-';
  const today = new Date().toISOString().slice(0,10);
  const ageDays = latest==='-' ? null : Math.round((new Date(today)-new Date(latest))/86400000);
  const stale = ageDays!=null && ageDays>1;
  const loadedAt = (typeof DATA_LOADED_AT!=='undefined' && DATA_LOADED_AT) ? DATA_LOADED_AT.toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}) : '-';
  let vWarn = 0; try{ vWarn = countIncompleteUnitShifts(getUnifiedStandbyHours(pu,dl,idl).rows); }catch(e){}
  const period = dates.length ? (dates[0]===latest ? latest : `${dates[0]} → ${latest}`) : '-';

  const tierCard = (k)=>{ const s=S[k]; const tone = s.ach==null?'var(--text-dim)': s.ach>=100?'var(--success)': s.ach>=90?'var(--warning)':'var(--danger)';
    const upto = s.lastDate ? (()=>{ let a=0,p=0; s.byA.forEach((v,d)=>{ if(d<=s.lastDate) a+=U.sum(v,'productionVolume'); }); s.byP.forEach((v,d)=>{ if(d<=s.lastDate) p+=U.sum(v,'targetVolume'); }); return p? `Sampai ${s.lastDate}: Actual ${U.fmt(a,0)} vs Plan ${U.fmt(p,0)} (${U.fmt(a/p*100,1)}%)` : ''; })() : '';
    return `<div class="ov-tier1 ${k==='OB'?'main':''}">
      <div class="ov-t1-h"><span>${s.name}</span><span class="ov-unit">${s.unit}</span></div>
      <div class="ov-t1-ach" style="color:${tone}">${s.ach==null?'—':U.fmt(s.ach,1)+'%'}<small>Achievement</small></div>
      <div class="ov-t1-row"><div><label>Actual</label><b>${U.fmt(s.actual,0)}</b></div><div><label>Plan</label><b>${U.fmt(s.plan,0)}</b></div><div><label>Gap</label><b style="color:${s.gap<0?'var(--danger)':'var(--success)'}">${s.plan?ovSigned(s.gap):'—'}</b></div></div>
      ${upto?`<div class="ov-t1-sub">${upto}</div>`:''}
      ${s.plan>0?`<button class="ov-link" ${ovA('gap',k)}>Drilldown gap per fleet ›</button>`:''}
    </div>`; };

  const dot = c=>`<i class="ov-dot" style="background:${c}"></i>`;
  el.innerHTML = `
  ${pitFilterCaveatHTML()}
  <div class="ov-bar mb-4">
    <div><label>Site</label><b>${esc(REPORT_META.mineSite||REPORT_META.siteName||'-')}</b></div>
    <div><label>Periode</label><b>${esc(period)}</b></div>
    <div><label>Shift</label><b>${esc(shiftLbl)}</b></div>
    <div><label>Waktu</label><b id="ovClock" class="font-mono">${new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'})}</b></div>
    <div><label>Cuaca</label><b>${esc(wxLabel)}</b></div>
    <div><label>Data</label><b style="color:${stale?'var(--warning)':'var(--success)'}">${dot(stale?'var(--warning)':'var(--success)')}${stale?'Stale':'Fresh'} • ${esc(latest)} • load ${esc(loadedAt)}</b>${vWarn?`<span class="ov-warn" title="Unit fisik, tanggal ≤ hari ini, di luar Work End (bukan loss) — hasil validateUnitShiftHours()">⚠ ${vWarn} unit-shift belum lengkap</span>`:''}</div>
  </div>

  <div class="ov-sec">Production Outcome</div>
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">${tierCard('OB')}${tierCard('CO')}</div>

  <div class="ov-sec">Operational Capability <span>PA/UA site-level • unit = hari terakhir tercatat (${esc(fs.refDate||'-')})</span></div>
  <div class="ov-cap mb-4">
    <div><label>PA</label><b style="color:${pa>0&&pa<80?'var(--danger)':'var(--text)'}">${U.fmt(pa,1)}<small>%</small></b></div>
    <div><label>UA</label><b style="color:${ua>0&&ua<70?'var(--danger)':'var(--text)'}">${U.fmt(ua,1)}<small>%</small></b></div>
    <div><label>Available Units</label><b>${availUnits}<small>/ ${totalUnits}</small></b></div>
    <div><label>Operating Units</label><b>${operating}<small>/ ${totalUnits}</small></b></div>
  </div>

  <div class="ov-panel mb-4">
    <div class="ov-panel-h"><div><div class="panel-title">Cumulative Production — Plan vs Actual</div><div class="ov-note" id="ovCumCap"></div></div>
      <div class="ov-seg"><button class="${OV.stream==='OB'?'on':''}" onclick="ovSetStream('OB')">OB (BCM)</button><button class="${OV.stream==='CO'?'on':''}" onclick="ovSetStream('CO')">CO (Ton)</button></div></div>
    <div style="height:280px"><canvas id="ov_cum"></canvas></div>
  </div>

  <div class="ov-sec">Fleet Status <span>berdasarkan jam terbanyak per unit • ${esc(fs.refDate||'-')}</span></div>
  <div class="ov-fleet mb-4">${stateOrder.filter(k=>fs.counts[k]||fs.prio.includes(k)).map(k=>`<button class="ov-chip ${OV.status===k?'on':''}" onclick="ovPickStatus('${esc(k)}')" ${(fs.counts[k]||0)?'':'disabled'}>${dot(stateColor[k]||'var(--text-dim)')}<span>${esc(stateLabel[k]||k)}</span><b>${fs.counts[k]||0}</b></button>`).join('')}</div>

  <div class="ov-sec">Attention Required <span><button class="ov-link" onclick="navigate('exceptions')">Exception Center ›</button></span></div>
  <div class="ov-panel mb-4">${att.length ? att.slice(0,7).map(a=>`<div class="ov-att s${a.sev}"><div><b>${esc(a.title)}</b><span>${esc(a.detail)}</span></div><button class="ov-link" ${a.nav?`onclick="navigate('${a.nav}')"`:ovA(a.go[0],a.go[1])}>${esc(a.act)} ›</button></div>`).join('') : `<div class="ov-note" style="padding:6px 2px">Tidak ada exception pada filter aktif.</div>`}</div>

  ${ai_overviewSection(data)}

  ${ovDrillHTML(fs, data, plan)}

  <div class="ov-sec">Production Loss <span>durasi event tercatat (jam-unit) — bukan production loss BCM</span></div>
  <div class="ov-panel mb-4">
    ${lossTotal>0 ? `<div class="ov-lossbar">${loss.map(l=>`<i style="width:${l.h/lossTotal*100}%;background:${l.c}" title="${l.k}"></i>`).join('')}</div>` : ''}
    ${loss.map(l=>`<div class="ov-lossrow">${dot(l.c)}<span>${l.k}</span><em>${l.n} event</em><b>${ovDur(l.h)}</b><u>${lossTotal?U.fmt(l.h/lossTotal*100,1):'0.0'}%</u></div>`).join('')}
    <div class="ov-lossrow wx">${dot('var(--accent)')}<span>Weather / Rain</span><em>${wxN} event</em><b>${ovDur(wxH)}</b><u>site-wide</u></div>
    <div class="ov-note">Persentase = porsi dari total durasi Breakdown + Delay + Idle (unit). Weather adalah jam event site-wide, tidak ikut persentase.</div>
  </div>`;

  // ---- cumulative chart ----
  const s = S[OV.stream];
  const allDates = uniqueSorted([...new Set([...s.byA.keys(), ...s.byP.keys()])]);
  const cumP = ovCum(new Map(allDates.map(d=>[d,U.sum(s.byP.get(d)||[],'targetVolume')])), allDates);
  const cumAfull = ovCum(new Map(allDates.map(d=>[d,U.sum(s.byA.get(d)||[],'productionVolume')])), allDates);
  const li = s.lastDate ? allDates.indexOf(s.lastDate) : -1;
  const cumA = cumAfull.map((v,i)=> li>=0 && i<=li ? v : null);
  const cap = document.getElementById('ovCumCap');
  if(cap) cap.textContent = li>=0 ? `Sampai ${s.lastDate}: Actual ${U.fmt(cumA[li],0)} vs Plan ${U.fmt(cumP[li],0)} ${s.unit} — gap ${ovSigned(cumA[li]-cumP[li])} (${cumP[li]?U.fmt(cumA[li]/cumP[li]*100,1)+'%':'-'})` : 'Belum ada actual pada filter aktif.';
  const tc = themeColors();
  const marker = { id:'ovMarker', afterDatasetsDraw(ch){ if(li<0) return; const x = ch.scales.x.getPixelForValue(li), a = ch.chartArea, c = ch.ctx; c.save(); c.strokeStyle = tc.text; c.setLineDash([3,3]); c.lineWidth = 1; c.beginPath(); c.moveTo(x,a.top); c.lineTo(x,a.bottom); c.stroke(); c.setLineDash([]); c.fillStyle = tc.text; c.font = '10px Inter'; c.textAlign = x>a.right-60?'right':'left'; c.fillText('Terakhir', x+(x>a.right-60?-4:4), a.top+10); c.restore(); } };
  const o = baseOpts(); o.animation = {duration:250}; o.plugins.datalabels = {display:false};
  makeChart('ov_cum',{ type:'line', plugins:[marker],
    data:{ labels:allDates.map(d=>U.dateShort(new Date(d))), datasets:[
      {label:`Cumulative Actual (${s.unit})`, data:cumA, borderColor:PALETTE[0], backgroundColor:'transparent', tension:0, pointRadius:0, borderWidth:2.5, spanGaps:false},
      {label:`Cumulative Plan (${s.unit})`, data:cumP, borderColor:tc.text, borderDash:[6,4], backgroundColor:'transparent', tension:0, pointRadius:0, borderWidth:1.5}
    ]}, options:o });

  if(!_ovClock) _ovClock = setInterval(ovClockTick, 30000);
}

/* ---- GRADE CONTROL (NEW) ---- */
/* [SUPABASE REWIRE 2026-09] Production: OB & CO dipisah (satuan beda), Actual vs Plan per
   material/stream dari Mine Plan (plan_daily_generated). Tidak ada lagi Ore/Waste/Stripping Ratio (konsep pit
   lama, tidak ada di schema). */
function render_production(data, el){
  const plan = getFilteredPlan();
  const obActual = U.sum(data.filter(r=>r.stream==='OB_PRODUCTION'),'productionVolume');
  const coActual = U.sum(data.filter(r=>r.stream==='CO_PRODUCTION'),'productionVolume');
  const obTarget = U.sum(plan.filter(p=>p.stream==='OB_PRODUCTION'),'targetVolume');
  const coTarget = U.sum(plan.filter(p=>p.stream==='CO_PRODUCTION'),'targetVolume');
  const totalRitase = U.sum(data,'ritase');
  el.innerHTML = `
  <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
    ${kpiCard('PR-01','Volume OB (Actual)', U.fmt(obActual,0),'BCM',null,'var(--accent)', null)}
    ${kpiCard('PR-02','Volume CO (Actual)', U.fmt(coActual,0),'Ton',null,'var(--success)', null)}
    ${kpiCard('PR-03','Achievement OB', obTarget?U.fmt(obActual/obTarget*100,1):'0','%',null,'var(--warning)', null)}
    ${kpiCard('PR-04','Achievement CO', coTarget?U.fmt(coActual/coTarget*100,1):'0','%',null,'var(--info)', null)}
    ${kpiCard('PR-05','Total Ritase', U.fmt(totalRitase,0),'trip',null,'var(--violet)', null)}
  </div>
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
    <div class="glass p-5"><div class="panel-title mb-2">Tren Produksi OB Harian: Actual vs Plan</div><div style="height:260px"><canvas id="pr_line"></canvas></div></div>
    <div class="glass p-5"><div class="panel-title mb-2">Ritase per Fleet</div><div style="height:260px"><canvas id="pr_bar"></canvas></div></div>
  </div>
  <div class="glass p-5 mb-4"><div class="panel-title mb-2">Volume per Material per Bulan</div><div style="height:280px"><canvas id="pr_stack"></canvas></div></div>
  `;
  const byDateActual = U.groupBy(data.filter(r=>r.stream==='OB_PRODUCTION'),r=>r.date);
  const byDatePlan = U.groupBy(plan.filter(p=>p.stream==='OB_PRODUCTION'),p=>p.date);
  const dates = uniqueSorted([...new Set([...byDateActual.keys(), ...byDatePlan.keys()])]);
  makeChart('pr_line',{type:'line', data:{labels:dates.map(d=>U.dateShort(new Date(d))), datasets:[
    {label:'Actual OB (BCM)', data:dates.map(d=>U.sum(byDateActual.get(d)||[],'productionVolume')), borderColor:PALETTE[0], backgroundColor:'rgba(245,165,36,.15)', fill:true, tension:.3, pointRadius:0},
    {label:'Plan OB (BCM)', data:dates.map(d=>U.sum(byDatePlan.get(d)||[],'targetVolume')), borderColor:PALETTE[2], borderDash:[5,4], pointRadius:0}
  ]}, options:baseOpts()});

  const byFleet = U.groupBy(data,r=>r.fleet);
  makeChart('pr_bar',{type:'bar', data:{labels:[...byFleet.keys()], datasets:[{label:'Ritase', data:[...byFleet.values()].map(g=>U.sum(g,'ritase')), backgroundColor:PALETTE[1]}]}, options:baseOpts()});

  const byMonth = U.groupBy(data,r=>r.month);
  const months = uniqueSorted([...byMonth.keys()]).sort((a,b)=>a-b);
  const materialNames = [...new Set(data.map(r=>r.material))];
  makeChart('pr_stack',{type:'bar', data:{labels:months.map(m=>U.monthName(m)), datasets:materialNames.map((mat,i)=>({
    label:mat, data:months.map(m=>U.sum(byMonth.get(m).filter(r=>r.material===mat),'productionVolume')), backgroundColor:PALETTE[i%PALETTE.length], stack:'s'
  }))}, options:baseOpts()});
}

/* [SUPABASE REWIRE 2026-09] Hauling: field lama (haulingTrips/haulTonnage/unit) diganti
   ritase/distanceKm/hauler sesuai production_actual. */
function render_hauling(data, el){
  const trips = U.sum(data,'ritase');
  const totalDistTon = U.sum(data.map(r=>({v:r.ritase*r.distanceKm})),'v'); // trip.km, netral satuan
  const avgDist = U.avg(data,'distanceKm');
  el.innerHTML = `
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    ${kpiCard('HL-01','Total Trips', U.fmt(trips,0),'trips',null,'var(--accent)', null)}
    ${kpiCard('HL-02','Total Trip.Km', U.fmt(totalDistTon,0),'trip.km',null,'var(--teal)', null)}
    ${kpiCard('HL-03','Jarak Rata-rata', U.fmt(avgDist,2),'km',null,'var(--info)', null)}
    ${kpiCard('HL-04','Rata-rata Trip/Hauler', UNITS.filter(u=>u.role==='HAULER').length ? U.fmt(trips/UNITS.filter(u=>u.role==='HAULER').length,1):'0','trip',null,'var(--violet)', null)}
  </div>
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
    <div class="glass p-5"><div class="panel-title mb-2">Trips per Fleet</div><div style="height:260px"><canvas id="hl_bar"></canvas></div></div>
    <div class="glass p-5"><div class="panel-title mb-2">Tren Jarak Rata-rata Harian</div><div style="height:260px"><canvas id="hl_line"></canvas></div></div>
  </div>
  <div class="glass p-5 mb-4"><div class="panel-title mb-2">Top Hauler Unit berdasarkan Ritase</div><div style="height:280px"><canvas id="hl_hbar"></canvas></div></div>
  `;
  const byFleet = U.groupBy(data,r=>r.fleet);
  makeChart('hl_bar',{type:'bar', data:{labels:[...byFleet.keys()], datasets:[{label:'Trips', data:[...byFleet.values()].map(g=>U.sum(g,'ritase')), backgroundColor:PALETTE[0]}]}, options:baseOpts()});

  const byDate = U.groupBy(data,r=>r.date);
  const dates = uniqueSorted([...byDate.keys()]);
  makeChart('hl_line',{type:'line', data:{labels:dates.map(d=>U.dateShort(new Date(d))), datasets:[{label:'Jarak (km)', data:dates.map(d=>U.avg(byDate.get(d),'distanceKm')), borderColor:PALETTE[2], tension:.3, pointRadius:0}]}, options:baseOpts()});

  const byHauler = U.groupBy(data.filter(r=>r.hauler),r=>r.hauler);
  const unitArr = [...byHauler.entries()].map(([u,g])=>({unit:u,ritase:U.sum(g,'ritase')})).sort((a,b)=>b.ritase-a.ritase).slice(0,10);
  makeChart('hl_hbar',{type:'bar', data:{labels:unitArr.map(u=>u.unit), datasets:[{label:'Ritase', data:unitArr.map(u=>u.ritase), backgroundColor:PALETTE[1]}]}, options:baseOpts({indexAxis:'y'})});
}

/* [SUPABASE REWIRE 2026-09] Equipment: status dinamis (Working/Standby/Breakdown/No Operator)
   & PA/UA dari unit_status_actual (bukan UNITS.status statis yang tidak ada di master_units). */
function render_equipment(data, el){
  const statusRows = getFilteredUnitStatus();
  const delayRowsAll = getFilteredDelay();
  const idleRowsAll = getFilteredIdle();
  const { pa, ua, breakdown } = computePAUA(statusRows, delayRowsAll, idleRowsAll);
  const activeUnits = UNITS.filter(u=>u.active).length;
  el.innerHTML = `
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    ${kpiCard('EQ-01','Total Unit', UNITS.length,'unit',null,'var(--accent)', null)}
    ${kpiCard('EQ-02','Unit Aktif (Master)', activeUnits,'unit',null,'var(--success)', null)}
    ${kpiCard('EQ-03','Total Breakdown', U.fmt(breakdown,1),'jam',null,'var(--danger)', null)}
    ${kpiCard('EQ-04','PA / UA', U.fmt(pa,1)+' / '+U.fmt(ua,1),'%',null,'var(--info)', null)}
  </div>
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
    <div class="glass p-5"><div class="panel-title mb-2">Distribusi Status Unit (Jam)</div><div style="height:260px"><canvas id="eq_doughnut"></canvas></div></div>
    <div class="glass p-5"><div class="panel-title mb-2">PA per Unit (Top 10)</div><div style="height:260px"><canvas id="eq_hbar"></canvas></div></div>
  </div>
  <div class="glass p-5 mb-4">
    <div class="panel-title mb-2">Working / Standby / Breakdown per Unit (Top 15 jam terjadwal)</div>
    <div class="panel-sub mb-2">Satu bar per unit, ditumpuk (stacked) — Breakdown ikut dalam bar yang sama, bukan chart terpisah</div>
    <div style="height:340px"><canvas id="eq_status_stack"></canvas></div>
  </div>
  `;
  // [STANDBY UNIFICATION 2026-09] final prompt §3/§7/§8/§21 — dihitung SEKALI di sini, dipakai baik
  // oleh doughnut maupun stacked bar di bawah, supaya kedua chart konsisten dan tidak double count.
  const unifiedStandby = getUnifiedStandbyHours(statusRows, delayRowsAll, idleRowsAll);
  // Doughnut memakai bucket Working/Breakdown/No Operator langsung dari unit_status_actual, TAPI
  // Standby diganti angka Unified (Standby+Idle+Delay).
  const byStatus = U.groupBy(statusRows.filter(s=>s.status!=='Standby'),s=>s.status);
  const statusLabels = [...byStatus.keys()];
  if(unifiedStandby.total > 0) statusLabels.push('Standby');
  const doughnutData = statusLabels.map(s=> s==='Standby' ? unifiedStandby.total : U.sum(byStatus.get(s),'durationHours'));
  makeChart('eq_doughnut',{type:'doughnut', data:{labels:statusLabels, datasets:[{data:doughnutData, backgroundColor:statusLabels.map(s=>STATUS_COLOR[s]||'#64748B')}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:themeColors().text,font:{size:10}}}}}});

  const byUnit = U.groupBy(statusRows,s=>s.unit);
  // [PA/UA FIX v2 2026-09] populasi per-unit untuk chart/tabel PA/UA di bawah TIDAK BOLEH hanya
  // dari byUnit (statusRows) — unit yang shift-nya 100% Idle/Delay/kosong di unit_status_actual
  // tidak akan punya entry di byUnit sama sekali. Group delay/idle per unit juga, lalu gabungkan
  // key-nya, supaya computePAUA() per unit menerima ketiga sumber yang relevan untuk unit itu.
  const byUnitDelay = U.groupBy(delayRowsAll, d=>d.unit);
  const byUnitIdle = U.groupBy(idleRowsAll.filter(i=>i.scope==='UNIT'), i=>i.unit);
  const paUaUnitIds = new Set([...byUnit.keys(), ...byUnitDelay.keys(), ...byUnitIdle.keys()]);
  // [EQUIPMENT 2026-09] Stacked bar Working/Standby/Breakdown per unit, satu bar per unit
  // (bukan chart doughnut terpisah) — Top 15 unit dengan jam terjadwal terbanyak di periode
  // filter aktif, supaya chart tetap terbaca meski total unit 62.
  const stackUnits = [...byUnit.entries()]
    .map(([u,g])=>{ const usb = unifiedStandby.byUnit.get(u) || {total:0};
      const working = U.sum(g.filter(s=>s.status==='Working'),'durationHours');
      const breakdown = U.sum(g.filter(s=>s.status==='Breakdown'),'durationHours');
      const noOperator = U.sum(g.filter(s=>s.status==='No Operator'),'durationHours');
      // [NO LOCATION 2026-09] unit yang belum punya input untuk jam/shift ini — ditampilkan sebagai
      // kategori terpisah, TIDAK pernah ikut working/standby/breakdown supaya PA/UA tidak bergeser.
      const noLocation = U.sum(g.filter(s=>s.status==='No Location'),'durationHours');
      return { unit:u, standby:usb.total, working, breakdown, noOperator, noLocation,
        total: working + usb.total + breakdown + noOperator + noLocation }; })
    .sort((a,b)=>b.total-a.total).slice(0,15);
  makeChart('eq_status_stack',{type:'bar', data:{
    labels:stackUnits.map(s=>s.unit),
    datasets:[
      {label:'Working', data:stackUnits.map(s=>U.round(s.working,1)), backgroundColor:STATUS_COLOR.Working, stack:'s'},
      {label:'Standby', data:stackUnits.map(s=>U.round(s.standby,1)), backgroundColor:STATUS_COLOR.Standby, stack:'s'},
      {label:'Breakdown', data:stackUnits.map(s=>U.round(s.breakdown,1)), backgroundColor:STATUS_COLOR.Breakdown, stack:'s'},
      {label:'No Operator', data:stackUnits.map(s=>U.round(s.noOperator,1)), backgroundColor:STATUS_COLOR['No Operator'], stack:'s'},
      {label:'No Location', data:stackUnits.map(s=>U.round(s.noLocation,1)), backgroundColor:STATUS_COLOR['No Location'], stack:'s'}
    ]}, options:(()=>{ const o=baseOpts({indexAxis:'y'}); o.scales.x.stacked=true; o.scales.y.stacked=true; return o; })()});

  const unitPA = [...paUaUnitIds].map(u=>({unit:u, pa:computePAUA(byUnit.get(u)||[], byUnitDelay.get(u)||[], byUnitIdle.get(u)||[]).pa})).sort((a,b)=>b.pa-a.pa).slice(0,10);
  makeChart('eq_hbar',{type:'bar', data:{labels:unitPA.map(u=>u.unit), datasets:[{label:'PA %', data:unitPA.map(u=>U.round(u.pa,1)), backgroundColor:PALETTE[2]}]}, options:baseOpts({indexAxis:'y'})});
}

/* ---- FUEL ---- */
/* [FUEL 2026-09] Halaman baru — dari fuel_actual (real, seluruh 62 unit). Fuel Ratio
   Produksi (OB=L/BCM, Coal=L/MT) HANYA dihitung dari Digger+Hauler yang punya pasangan
   produksi nyata di production_actual (lihat computeFuelRatios) — persis logika
   v_fuel_ratio_daily di Supabase. Dozer/Grader/Support/Water Truck/TLD90 tanpa produksi
   tetap masuk "Total Fuel All" & tabel per unit, tapi TIDAK masuk denominator L/BCM/L/MT. */
function render_fuel(data, el){
  const fuelRows = getFilteredFuel();
  const totalAll = U.sum(fuelRows,'fuelLiters');
  const byGroup = { Digger:0, Hauler:0, Support:0 };
  fuelRows.forEach(f=> byGroup[fuelGroupOf(f.unit)] += f.fuelLiters);
  const totalHours = U.sum(fuelRows,'operatingHours');
  const lPerHour = totalHours ? totalAll/totalHours : 0;
  const ratios = computeFuelRatios(fuelRows, data);

  el.innerHTML = `
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
    ${kpiCard('FL-01','Total Fuel All', U.fmt(totalAll,0),'L',null,'var(--accent)', null)}
    ${kpiCard('FL-02','Fuel Digger', U.fmt(byGroup.Digger,0),'L',null,'var(--teal)', null)}
    ${kpiCard('FL-03','Fuel Hauler', U.fmt(byGroup.Hauler,0),'L',null,'var(--info)', null)}
    ${kpiCard('FL-04','Fuel Support', U.fmt(byGroup.Support,0),'L',null,'var(--violet)', null)}
  </div>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    ${kpiCard('FL-05','Fuel Ratio OB', U.fmt(ratios.ob.ratio,4),'L/BCM',null,'var(--success)', null)}
    ${kpiCard('FL-06','Fuel Ratio Coal', U.fmt(ratios.coal.ratio,4),'L/MT',null,'var(--warning)', null)}
    ${kpiCard('FL-07','Rata-rata Konsumsi', U.fmt(lPerHour,2),'L/jam',null,'var(--pink)', null)}
    ${kpiCard('FL-08','Total Jam Operasi', U.fmt(totalHours,0),'jam',null,'var(--indigo)', null)}
  </div>
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
    <div class="glass p-5"><div class="panel-title mb-2">Fuel per Tipe Equipment (Liter)</div><div style="height:260px"><canvas id="fl_type"></canvas></div></div>
    <div class="glass p-5"><div class="panel-title mb-2">Top 10 Unit — L/jam</div><div style="height:260px"><canvas id="fl_lph"></canvas></div></div>
  </div>
  <div class="glass p-5 mb-4"><div class="panel-title mb-2">Tren Konsumsi Fuel per Bulan (Liter)</div><div style="height:260px"><canvas id="fl_trend"></canvas></div></div>
  `;

  makeChart('fl_type',{type:'doughnut', data:{labels:Object.keys(byGroup), datasets:[{data:Object.values(byGroup).map(v=>U.round(v,0)), backgroundColor:[PALETTE[5],PALETTE[1],PALETTE[3]]}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:themeColors().text,font:{size:10}}}}}});

  const byUnit = U.groupBy(fuelRows, f=>f.unit);
  const lphByUnit = [...byUnit.entries()].map(([u,g])=>{
    const liters = U.sum(g,'fuelLiters'), hrs = U.sum(g,'operatingHours');
    return { unit:u, lph: hrs? liters/hrs : 0 };
  }).sort((a,b)=>b.lph-a.lph).slice(0,10);
  makeChart('fl_lph',{type:'bar', data:{labels:lphByUnit.map(u=>u.unit), datasets:[{label:'L/jam', data:lphByUnit.map(u=>U.round(u.lph,2)), backgroundColor:PALETTE[2]}]}, options:baseOpts({indexAxis:'y'})});

  const byMonth = U.groupBy(fuelRows, f=> new Date(f.date+'T00:00:00').getMonth());
  const months = [...byMonth.keys()].sort((a,b)=>a-b);
  makeChart('fl_trend',{type:'line', data:{labels:months.map(m=>U.monthName(m)), datasets:[{label:'Fuel (L)', data:months.map(m=>U.round(U.sum(byMonth.get(m),'fuelLiters'),0)), borderColor:PALETTE[0], backgroundColor:'transparent', tension:.3}]}, options:baseOpts()});
}

/* ---- OPERATOR ---- */
/* [SUPABASE REWIRE 2026-09] Operator digabung dengan Driver (satu halaman, sesuai NAV:
   "Kinerja operator & driver"). Field lama (shift/cert per operator) dihapus — tidak ada
   di master_employees; yang ada hanya position (Operator Exca / Driver Hauler). */
function render_operator(data, el){
  const totalOp = OPERATORS.filter(o=>o.active).length;
  const totalDr = DRIVERS.filter(d=>d.active).length;
  const opsWithData = new Set(data.filter(r=>r.operatorCode).map(r=>r.operatorCode)).size;
  const drsWithData = new Set(data.filter(r=>r.driverCode).map(r=>r.driverCode)).size;
  el.innerHTML = `
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    ${kpiCard('OP-01','Total Operator (Aktif)', totalOp,'orang',null,'var(--accent)', null)}
    ${kpiCard('OP-02','Total Driver (Aktif)', totalDr,'orang',null,'var(--info)', null)}
    ${kpiCard('OP-03','Operator Tercatat di Periode', opsWithData,'orang',null,'var(--success)', null)}
    ${kpiCard('OP-04','Driver Tercatat di Periode', drsWithData,'orang',null,'var(--violet)', null)}
  </div>
  <div class="glass p-5 mb-4"><div class="panel-title mb-2">Top 10 Driver berdasarkan Ritase</div><div style="height:300px"><canvas id="op_hbar"></canvas></div></div>
  `;
  const byDriver = U.groupBy(data.filter(r=>r.driver), r=>r.driver);
  const arr = [...byDriver.entries()].map(([d,g])=>({driver:d, ritase:U.sum(g,'ritase')})).sort((a,b)=>b.ritase-a.ritase).slice(0,10);
  makeChart('op_hbar',{type:'bar', data:{labels:arr.map(a=>a.driver), datasets:[{label:'Ritase', data:arr.map(a=>a.ritase), backgroundColor:PALETTE[0]}]}, options:baseOpts({indexAxis:'y'})});
}

/* [SUPABASE REWIRE 2026-09] Maintenance = Delay + Idle (bukan lagi "breakdown/cost" fiktif —
   tidak ada tabel maintenance_log). Weather Global (rain/slippery/fog, dari weather_daily)
   ditambahkan di sini atas permintaan eksplisit user, karena datanya nyata dan relevan
   dengan Idle Global (I01/I02/I03). */
/* [SUPABASE REWIRE 2026-09] Maintenance kini fokus khusus Breakdown detail, dari
   unit_status_actual (status='Breakdown') — bukan lagi campur Delay+Idle (sudah dipisah
   jadi halaman sendiri sesuai permintaan). */
function render_maintenance(data, el){
  const statusRows = getFilteredUnitStatus();
  const bd = statusRows.filter(s=>s.status==='Breakdown');
  const totalBdHours = U.sum(bd,'durationHours');
  const bdUnits = new Set(bd.map(s=>s.unit)).size;
  el.innerHTML = `
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    ${kpiCard('MT-01','Total Jam Breakdown', U.fmt(totalBdHours,1),'jam',null,'var(--danger)', null)}
    ${kpiCard('MT-02','Kejadian Breakdown', bd.length,'event',null,'var(--warning)', null)}    ${kpiCard('MT-03','Unit Terdampak', bdUnits,'unit',null,'var(--info)', null)}
    ${kpiCard('MT-04','MTTR (rata2/kejadian)', bd.length?U.fmt(totalBdHours/bd.length,2):'0','jam',null,'var(--violet)', null)}
  </div>
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
    <div class="glass p-5"><div class="panel-title mb-2">Jam Breakdown per Fleet</div><div style="height:260px"><canvas id="mt_fleet"></canvas></div></div>
    <div class="glass p-5"><div class="panel-title mb-2">Tren Jam Breakdown Bulanan</div><div style="height:260px"><canvas id="mt_line"></canvas></div></div>
  </div>
  <div class="glass p-5"><div class="panel-title mb-2">Detail Breakdown per Unit (Top 10)</div><div style="height:280px"><canvas id="mt_hbar"></canvas></div></div>
  `;
  const byFleet = U.groupBy(bd,s=>s.fleet);
  makeChart('mt_fleet',{type:'bar', data:{labels:[...byFleet.keys()], datasets:[{label:'Jam Breakdown', data:[...byFleet.values()].map(g=>U.sum(g,'durationHours')), backgroundColor:PALETTE[6]}]}, options:baseOpts()});

  const byMonth = U.groupBy(bd, s=>new Date(s.date+'T00:00:00').getMonth());
  const months = [...Array(12).keys()];
  makeChart('mt_line',{type:'line', data:{labels:months.map(m=>U.monthName(m)), datasets:[{label:'Jam Breakdown', data:months.map(m=>U.sum(byMonth.get(m)||[],'durationHours')), borderColor:PALETTE[6], backgroundColor:'rgba(239,68,68,.15)', fill:true, tension:.3}]}, options:baseOpts()});

  const byUnit = U.groupBy(bd,s=>s.unit);
  const unitArr = [...byUnit.entries()].map(([u,g])=>({unit:u,hours:U.sum(g,'durationHours')})).sort((a,b)=>b.hours-a.hours).slice(0,10);
  makeChart('mt_hbar',{type:'bar', data:{labels:unitArr.map(u=>u.unit), datasets:[{label:'Jam Breakdown', data:unitArr.map(u=>U.round(u.hours,1)), backgroundColor:PALETTE[3]}]}, options:baseOpts({indexAxis:'y'})});
}

/* [SUPABASE REWIRE 2026-09] Halaman baru — Delay (Controlled Standby) berdiri sendiri,
   dari delay_events. Pakai PALETTE_WIDE supaya warna tiap penyebab jelas beda. */
function render_delay(data, el){
  const delay = getFilteredDelay();
  const totalDelay = U.sum(delay,'hours');
  el.innerHTML = `
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    ${kpiCard('DL-01','Total Delay', U.fmt(totalDelay,1),'jam',null,'var(--warning)', null)}
    ${kpiCard('DL-02','Total Kejadian', delay.length,'event',null,'var(--info)', null)}
    ${kpiCard('DL-03','Rata-rata/Kejadian', delay.length?U.fmt(totalDelay/delay.length,2):'0','jam',null,'var(--violet)', null)}
    ${kpiCard('DL-04','Penyebab Terbanyak', (()=>{ const g=U.groupBy(delay,d=>d.name); let top=null,max=0; g.forEach((v,k)=>{const h=U.sum(v,'hours'); if(h>max){max=h;top=k;}}); return top||'-'; })(),'',null,'var(--accent)', null)}
  </div>
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
    <div class="glass p-5"><div class="panel-title mb-2">Penyebab Delay (Jam)</div><div style="height:280px"><canvas id="dl_pie"></canvas></div></div>
    <div class="glass p-5"><div class="panel-title mb-2">Delay per Fleet</div><div style="height:280px"><canvas id="dl_bar"></canvas></div></div>
  </div>
  <div class="glass p-5 mb-4"><div class="panel-title mb-2">Tren Delay Bulanan</div><div style="height:260px"><canvas id="dl_line"></canvas></div></div>
  `;
  const byCause = U.groupBy(delay,d=>d.name);
  makeChart('dl_pie',{type:'pie', data:{labels:[...byCause.keys()], datasets:[{data:[...byCause.values()].map(g=>U.sum(g,'hours')), backgroundColor:PALETTE_WIDE}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:themeColors().text,font:{size:9},boxWidth:10}}}}});

  const byFleet = U.groupBy(delay,d=>d.fleet);
  makeChart('dl_bar',{type:'bar', data:{labels:[...byFleet.keys()], datasets:[{label:'Jam', data:[...byFleet.values()].map(g=>U.sum(g,'hours')), backgroundColor:PALETTE[3]}]}, options:baseOpts()});

  const byMonth = U.groupBy(delay, d=>new Date(d.date+'T00:00:00').getMonth());
  const months = [...Array(12).keys()];
  makeChart('dl_line',{type:'line', data:{labels:months.map(m=>U.monthName(m)), datasets:[{label:'Delay (Jam)', data:months.map(m=>U.sum(byMonth.get(m)||[],'hours')), borderColor:PALETTE[0], backgroundColor:'rgba(245,165,36,.15)', fill:true, tension:.3}]}, options:baseOpts()});
}

/* [SUPABASE REWIRE 2026-09] Halaman baru — Idle (Uncontrolled Standby + Weather Global)
   berdiri sendiri, dari idle_events + weather_daily. */
function render_idle(data, el){
  const idle = getFilteredIdle();
  const idleUnit = idle.filter(i=>i.scope==='UNIT');
  const idleGlobal = idle.filter(i=>i.scope==='GLOBAL');
  const totalIdle = U.sum(idleUnit,'hours');
  const totalWeatherIdle = U.sum(idleGlobal,'hours');
  el.innerHTML = `
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    ${kpiCard('ID-01','Idle Unit (Lokal)', U.fmt(totalIdle,1),'jam',null,'var(--danger)', null)}
    ${kpiCard('ID-02','Idle Weather Global', U.fmt(totalWeatherIdle,1),'jam',null,'var(--info)', null)}
    ${kpiCard('ID-03','Total Kejadian', idle.length,'event',null,'var(--violet)', null)}
    ${kpiCard('ID-04','Rata-rata/Kejadian', idle.length?U.fmt((totalIdle+totalWeatherIdle)/idle.length,2):'0','jam',null,'var(--accent)', null)}
  </div>
  <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
    <div class="glass p-5"><div class="panel-title mb-2">Penyebab Idle Unit (Jam)</div><div style="height:280px"><canvas id="id_pie"></canvas></div></div>
    <div class="glass p-5"><div class="panel-title mb-2">Idle per Fleet</div><div style="height:280px"><canvas id="id_bar"></canvas></div></div>
  </div>
  <div class="glass p-5 mb-4">
    <div class="panel-title mb-1">Weather Global (Rain / Slippery / Fog)</div>
    <div class="panel-sub mb-2">Dari idle_events I01/I02/I03 (scope GLOBAL), sama dengan yang otomatis mengisi weather_daily</div>
    <div style="height:260px"><canvas id="id_weather"></canvas></div>
  </div>
  `;
  const byCause = U.groupBy(idleUnit,d=>d.name);
  makeChart('id_pie',{type:'pie', data:{labels:[...byCause.keys()], datasets:[{data:[...byCause.values()].map(g=>U.sum(g,'hours')), backgroundColor:PALETTE_WIDE}]}, options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:themeColors().text,font:{size:9},boxWidth:10}}}}});

  const byFleet = U.groupBy(idleUnit,d=>d.fleet);
  makeChart('id_bar',{type:'bar', data:{labels:[...byFleet.keys()], datasets:[{label:'Jam', data:[...byFleet.values()].map(g=>U.sum(g,'hours')), backgroundColor:PALETTE[6]}]}, options:baseOpts()});

  const weatherDates = uniqueSorted([...new Set(idleGlobal.map(g=>g.date))]);
  const rainByDate = {}, slipByDate = {}, fogByDate = {};
  idleGlobal.forEach(g=>{
    const target = g.code==='I01'?rainByDate : g.code==='I02'?slipByDate : g.code==='I03'?fogByDate : null;
    if(target) target[g.date] = (target[g.date]||0) + g.hours;
  });
  makeChart('id_weather',{type:'bar', data:{labels:weatherDates.map(d=>U.dateShort(new Date(d))), datasets:[
    {label:'Rain (jam)', data:weatherDates.map(d=>rainByDate[d]||0), backgroundColor:PALETTE[2]},
    {label:'Slippery (jam)', data:weatherDates.map(d=>slipByDate[d]||0), backgroundColor:PALETTE[6]},
    {label:'Fog (jam)', data:weatherDates.map(d=>fogByDate[d]||0), backgroundColor:'#94A3B8'}
  ]}, options:(()=>{ const o=baseOpts(); o.scales.x.stacked=true; o.scales.y.stacked=true; return o; })()});
}

/* [SUPABASE REWIRE 2026-09] Halaman baru — PA & UA digabung satu tempat, dengan penjelasan
   rumus dan ranking (Top & Bottom) per unit, dihitung dari unit_status_actual. */
function render_pa_ua(data, el){
  const statusRows = getFilteredUnitStatus();
  const delayRowsAll = getFilteredDelay();
  const idleRowsAll = getFilteredIdle();
  const otRowsAll = getFilteredOT();
  const overall = computePAUA(statusRows, delayRowsAll, idleRowsAll);
  const otHoursTotal = otRowsAll.reduce((a,r)=>a+r.hours,0);
  const otHistoricalCount = otRowsAll.filter(r=>r.source==='HISTORICAL_RECONSTRUCTED_OT').length;
  // [PA/UA FIX v2 2026-09] sama seperti Equipment — populasi per-unit harus mencakup unit yang
  // hanya punya Idle/Delay (tidak muncul di byUnit/statusRows sama sekali), bukan cuma unit yang
  // punya baris di unit_status_actual.
  const byUnit = U.groupBy(statusRows, s=>s.unit);
  const byUnitDelay = U.groupBy(delayRowsAll, d=>d.unit);
  const byUnitIdle = U.groupBy(idleRowsAll.filter(i=>i.scope==='UNIT'), i=>i.unit);
  const paUaUnitIds = new Set([...byUnit.keys(), ...byUnitDelay.keys(), ...byUnitIdle.keys()]);
  const unitRanking = [...paUaUnitIds].map(u=>{
    const r = computePAUA(byUnit.get(u)||[], byUnitDelay.get(u)||[], byUnitIdle.get(u)||[]);
    return { unit:u, pa:r.pa, ua:r.ua, scheduled:r.scheduled };
  }).filter(x=>x.scheduled>0);
  const topPA = [...unitRanking].sort((a,b)=>b.pa-a.pa).slice(0,10);
  const bottomPA = [...unitRanking].sort((a,b)=>a.pa-b.pa).slice(0,10);
  const topUA = [...unitRanking].sort((a,b)=>b.ua-a.ua).slice(0,10);

  el.innerHTML = `
  <div class="glass p-5 mb-4">
    <div class="panel-title mb-2">Apa itu PA &amp; UA?</div>
    <p class="text-[12.5px]" style="color:var(--text-dim); line-height:1.7">
      <strong style="color:var(--text)">PA (Physical Availability)</strong> = (Jam Terjadwal − Jam Breakdown) / Jam Terjadwal × 100% — mengukur seberapa siap fisik unit (tidak sedang rusak) dari total jam yang seharusnya beroperasi.<br/>
      <strong style="color:var(--text)">UA (Utilization of Availability)</strong> = Jam Working / (Jam Terjadwal − Jam Breakdown) × 100% — dari unit yang tersedia (tidak breakdown), berapa persen benar-benar dipakai kerja (bukan Standby/No Operator).<br/>
      Dihitung dari <code>unit_status_actual</code> (SUM durationHours per status), bukan field siap pakai.
    </p>
  </div>
  <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
    ${kpiCard('PU-01','PA Keseluruhan', U.fmt(overall.pa,1),'%',null,'var(--teal)', null)}
    ${kpiCard('PU-02','UA Keseluruhan', U.fmt(overall.ua,1),'%',null,'var(--violet)', null)}
    ${kpiCard('PU-03','Jam Terjadwal', U.fmt(overall.scheduled,0),'jam',null,'var(--info)', null)}
    ${kpiCard('PU-04','Jam Breakdown', U.fmt(overall.breakdown,0),'jam',null,'var(--danger)', null)}
  </div>
  <div class="glass p-5 mb-4">
    <div class="panel-title mb-2">⏱️ OT (Overtime)</div>
    <p class="text-[12.5px]" style="color:var(--text-dim); line-height:1.7">
      OT dicatat terpisah di <code>ot_events</code> — <strong style="color:var(--text)">tidak pernah menambah Jam Terjadwal</strong> (scheduled tetap 12 jam/unit-shift) dan tidak dihitung sebagai produksi normal. OT tidak dibatasi jumlah kejadian.
    </p>
    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3">
      ${kpiCard('PU-05','Total Jam OT', U.fmt(otHoursTotal,1),'jam',null,'var(--warning)', null)}
      ${kpiCard('PU-06','Jumlah Kejadian OT', String(otRowsAll.length),'event',null,'var(--warning)', null)}
      ${kpiCard('PU-07','OT Historis (Work End 17-18 D)', String(otHistoricalCount),'event',null,'var(--info)', null)}
    </div>
  </div>
  <div class="glass p-5 mb-4">
    <div class="panel-title mb-2">🏆 Top 10 PA per Unit</div>
    <div style="height:280px"><canvas id="pu_top_pa"></canvas></div>
  </div>
  <div class="glass p-5 mb-4">
    <div class="panel-title mb-2">🏆 Top 10 UA per Unit</div>
    <div style="height:280px"><canvas id="pu_top_ua"></canvas></div>
  </div>
  <div class="glass p-5">
    <div class="panel-title mb-2">⚠️ 10 Unit dengan PA Terendah (perlu perhatian)</div>
    <div style="height:280px"><canvas id="pu_bottom_pa"></canvas></div>
  </div>
  `;
  makeChart('pu_top_pa',{type:'bar', data:{labels:topPA.map(u=>u.unit), datasets:[{label:'PA %', data:topPA.map(u=>U.round(u.pa,1)), backgroundColor:PALETTE[5]}]}, options:baseOpts({indexAxis:'y'})});
  makeChart('pu_top_ua',{type:'bar', data:{labels:topUA.map(u=>u.unit), datasets:[{label:'UA %', data:topUA.map(u=>U.round(u.ua,1)), backgroundColor:PALETTE[3]}]}, options:baseOpts({indexAxis:'y'})});
  makeChart('pu_bottom_pa',{type:'bar', data:{labels:bottomPA.map(u=>u.unit), datasets:[{label:'PA %', data:bottomPA.map(u=>U.round(u.pa,1)), backgroundColor:PALETTE[6]}]}, options:baseOpts({indexAxis:'y'})});
}



/* [PICA UPGRADE 2026-09] AI Insight — audit & upgrade total dari implementasi PICA
   (Problem Identification & Corrective Action) sebelumnya. TIDAK ada tabel/field baru:
   sumber data tetap getFilteredPlan()/getFilteredUnitStatus()/computePAUA()/
   getFilteredDelay()/getFilteredIdle() persis seperti sebelumnya (Mine Plan vs
   Actual, Unit Status Actual, Delay Events, Idle Events). Perubahan murni pada:
   1) kedalaman analisis (Problem → Evidence → Root Cause → Impact → Corrective Action →
      Priority → Verification, bukan lagi 1 kalimat problem + 1 kalimat action),
   2) beberapa PICA card sekaligus (satu per masalah nyata, bukan satu blok gabungan),
   3) prioritas bertingkat (CRITICAL/HIGH/MEDIUM/LOW) berdasarkan besar gap/rasio,
   4) smart correlation antar KPI (PA↔Breakdown, UA↔Idle, OB Achievement↔Delay/UA, dst),
   5) UI accordion (Problem/Evidence/Corrective Action default terbuka; Root Cause/
      Operational Impact/Verification bisa dibuka-tutup) supaya tetap ringkas di sidebar.
   Tidak ada angka hardcoded — semua dihitung ulang dari `data`/filter aktif setiap kali
   render_ai_insight dipanggil (lihat renderPage() → dipanggil ulang setiap onFilterChange). */

/* ---- Util kecil khusus AI Insight (namespace ai_ supaya tidak bentrok fungsi lain) ---- */
function ai_pct(part, total){ return total>0 ? (part/total*100) : 0; }
function ai_hours(v){ return U.fmt(v,1)+' jam'; }
function ai_bullets(items){
  return `<ul style="margin:0;padding-left:16px">${items.filter(Boolean).map(i=>`<li style="margin-bottom:4px">${i}</li>`).join('')}</ul>`;
}
function ai_numbered(items){
  return `<ol style="margin:0;padding-left:16px">${items.filter(Boolean).map(i=>`<li style="margin-bottom:5px">${i}</li>`).join('')}</ol>`;
}
function ai_paras(items){
  return items.filter(Boolean).map(t=>`<p style="margin:0 0 6px 0">${t}</p>`).join('');
}
/* Top-N kontributor (unit/fleet/cause) dari sekumpulan baris, dengan kontribusi % terhadap
   total — dipakai untuk "Data menunjukkan X menyumbang Y% dari total". Baris dengan jam 0
   tidak ditampilkan supaya tidak menambah noise. */
function ai_topGroups(rows, keyFn, hourKey, total, n){
  const g = U.groupBy(rows, keyFn);
  return [...g.entries()]
    .map(([k,v])=>({ label:(k===undefined||k===null||k==='')?'(Tidak diketahui)':k, hours:U.sum(v,hourKey), pct:ai_pct(U.sum(v,hourKey), total) }))
    .filter(x=>x.hours>0.001)
    .sort((a,b)=>b.hours-a.hours)
    .slice(0, n||3);
}
/* Klasifikasi prioritas untuk metrik "makin besar makin buruk" (delay ratio, idle ratio,
   weather idle jam) — t = {critical,high,medium} menaik, dibandingkan >= . */
function ai_classifyHigh(value, t){
  if(value>=t.critical) return 'CRITICAL';
  if(value>=t.high) return 'HIGH';
  if(value>=t.medium) return 'MEDIUM';
  return null;
}
/* Klasifikasi prioritas untuk metrik "makin kecil makin buruk" (PA, UA, Achievement) —
   t = {critical,high,medium} menaik, dibandingkan <= . */
function ai_classifyLow(value, t){
  if(value<=t.critical) return 'CRITICAL';
  if(value<=t.high) return 'HIGH';
  if(value<=t.medium) return 'MEDIUM';
  return null;
}
const AI_PRIORITY_META = {
  CRITICAL:{ emoji:'🔴', label:'CRITICAL PRIORITY', color:'var(--danger)' },
  HIGH:    { emoji:'🟠', label:'HIGH PRIORITY',     color:'#F97316' },
  MEDIUM:  { emoji:'🟡', label:'MEDIUM PRIORITY',   color:'var(--warning)' },
  LOW:     { emoji:'🟢', label:'LOW PRIORITY',      color:'var(--success)' }
};
const AI_PRIORITY_RANK = { CRITICAL:0, HIGH:1, MEDIUM:2, LOW:3 };

/* Bangun satu bagian accordion (native <details>/<summary> — tidak perlu JS tambahan,
   tetap ringan untuk sidebar/mobile). `open` menentukan default terbuka/tertutup sesuai
   spesifikasi (Problem/Evidence/Corrective Action terbuka; sisanya tertutup). */
/* [REFINEMENT 5.1] Jika contentHtml tidak punya teks nyata (hanya tag kosong / null), section
   (header + body) tidak dirender sama sekali — supaya LIKELY CONTRIBUTORS/OPERATIONAL IMPACT/
   TARGET/VERIFICATION tidak tampil kosong saat evidence-nya memang tidak ada. */
function ai_hasContent(html){
  return !!(html && String(html).replace(/<[^>]*>/g,'').trim().length);
}
function ai_section(icon, title, color, contentHtml, open){
  if(!ai_hasContent(contentHtml)) return '';
  return `
  <details class="pica-acc" ${open?'open':''}>
    <summary>
      <span class="tag" style="background:${color}; color:#fff; border:none; font-size:10.5px; padding:4px 9px;">${icon} ${title}</span>
    </summary>
    <div class="pica-acc-body">${contentHtml}</div>
  </details>`;
}

/* Tentukan Action Owner untuk masalah bertipe Delay — kalau penyebab terbesarnya memuat
   kata kunci terkait unit/mekanik (breakdown/repair/maintenance/dsb), library Delay itu
   kemungkinan besar terkait Maintenance, bukan murni Operation/Dispatch. Tidak mengarang
   nama orang — hanya nama fungsi/departemen umum. */
function ai_ownerForDelay(topCauseLabel){
  const kw = ['breakdown','repair','maintenance','mekanik','engine','service','perbaikan'];
  const name = (topCauseLabel||'').toLowerCase();
  return kw.some(k=>name.includes(k)) ? 'Maintenance, Operation' : 'Operation, Dispatch';
}

/* Satu card PICA lengkap untuk satu masalah — header menampilkan nomor urut PICA,
   Priority (+ alasan singkat), Kategori masalah, dan Action Owner yang direkomendasikan,
   diikuti accordion 7 bagian sesuai spesifikasi PICA. */
/* [PHASE 5.1] Evidence Confidence — kualitatif saja (HIGH/MODERATE/LOW EVIDENCE), TIDAK PERNAH
   berupa angka/skor/probability. Merepresentasikan kekuatan evidence yang sudah ada di card
   (direct metric + jumlah contributor yang teridentifikasi + ada/tidaknya breakdown pembanding
   seperti top fleet/top cause), bukan "seberapa yakin AI". Semua sinyal berasal dari data yang
   sama yang sudah dipakai PICA — tidak ada perhitungan/metric baru. */
const AI_CONFIDENCE_META = {
  HIGH:     { label:'HIGH',     color:'var(--success)', desc:'Observation didukung langsung oleh data aktual dan terdapat evidence pendukung (contributor + pembanding fleet/cause) yang relevan.' },
  MODERATE: { label:'MODERATE', color:'var(--warning)', desc:'Observation didukung data aktual, namun contributor/correlation yang teridentifikasi belum cukup kuat/lengkap untuk dipastikan.' },
  LOW:      { label:'LOW',      color:'var(--text-dim)', desc:'Hanya terdapat indikasi terbatas — data pembanding atau rincian contributor belum cukup tersedia pada filter ini.' }
};
function ai_evidenceConfidence({direct, contributors, comparison}){
  if(!direct) return 'LOW';
  if(contributors>=1 && comparison) return 'HIGH';
  if(contributors>=1) return 'MODERATE';
  return 'LOW';
}
/* [REFINEMENT 5.1] Prefix "Evidence:" eksplisit supaya badge ini tidak disalahartikan sebagai
   Priority — keduanya sekarang punya label berbeda ("Priority: X" vs "Evidence: Y"). */
function ai_confidenceBadge(level){
  const cm = AI_CONFIDENCE_META[level] || AI_CONFIDENCE_META.LOW;
  return `<span class="tag" style="background:${cm.color}; color:#fff; border:none;" title="${esc(cm.desc)}">Evidence: ${cm.label}</span>`;
}
/* [PHASE 5.1] VIEW EVIDENCE — tombol AKTIF yang menggunakan mekanisme Exception Center existing
   (axViewExc()/axUnitInExc() -> navigate('exceptions')), bukan link teks statis dan bukan
   drilldown baru. p.evidenceOnclick diisi per-kategori saat pica.push() dibuat. */
function ai_viewEvidenceBtn(p){
  if(!p.evidenceOnclick) return '';
  return `<button class="btn no-print" style="margin-top:8px" onclick="${p.evidenceOnclick}">🔎 VIEW EVIDENCE</button>`;
}
/* [REFINEMENT 5.1] Buka evidence spesifik untuk satu stream Production Gap (OB atau CO) di
   Exception Center — memakai id/skema yang SAMA persis dengan yang dibuat exBuild()
   ('gap:OB' / 'gap:CO') dan field EX.type/EX.path yang sudah dibaca halaman Exception Center
   existing (pola sama seperti axUnitInExc()), bukan mekanisme baru — hanya lebih spesifik
   dari axViewExc('gap') yang generik (menampilkan gap OB & CO sekaligus). */
function ai_openGapEvidence(streamKey){
  const id = 'gap:'+streamKey;
  EX.type = 'gap'; EX.drawer = null; EX.path = [{k:'exc', v:id, l:exLabel(id)}];
  navigate('exceptions');
}
/* [PHASE 5.1] Ambil blok pertama saja dari HTML existing (satu <p> atau satu <li>) untuk
   ditampilkan ringkas di compact card Overview — tidak menulis ulang teks, hanya memotong
   string HTML yang sudah dihasilkan PICA supaya tidak perlu accordion penuh. */
function ai_firstBlock(html, asList){
  if(!html) return '<p style="margin:4px 0 0 0;color:var(--text-faint)">Insufficient data.</p>';
  if(asList){
    const m = html.match(/<li[^>]*>[\s\S]*?<\/li>/);
    return m ? `<ol style="margin:4px 0 0 16px;padding:0">${m[0]}</ol>` : html;
  }
  const m = html.match(/<p[^>]*>[\s\S]*?<\/p>/);
  return m ? m[0] : html;
}

function ai_card(p, idx){
  const pm = AI_PRIORITY_META[p.priority];
  return `
  <div class="glass p-5 fade-in pica-card" style="border-left:3px solid ${pm.color}">
    <div class="mb-2">
      <div class="panel-title mb-1" style="font-size:13px">${pm.emoji} PICA #${idx} — ${p.title}</div>
      <div class="flex items-center gap-2 flex-wrap mb-1">
        <span class="tag" style="background:${pm.color}; color:#fff; border:none; font-weight:700;">Priority: ${p.priority}</span>
        ${ai_confidenceBadge(p.confidence)}
        <span class="tag" style="background:var(--indigo-soft); color:var(--indigo); border:none;">KATEGORI: ${p.category}</span>
        <span class="tag" style="background:var(--gray-soft); color:var(--text-dim); border:none;">OWNER: ${p.actionOwner}</span>
      </div>
      <div class="text-[11.5px]" style="color:var(--text-faint)">${p.priorityReason}</div>
    </div>
    ${ai_section('🎯','OBSERVATION / PROBLEM IDENTIFICATION','var(--danger)', p.problemHtml, true)}
    ${ai_section('📊','EVIDENCE','var(--info)', p.evidenceHtml, true)}
    ${ai_section('🔍','LIKELY CONTRIBUTORS','var(--violet)', p.rootCauseHtml, false)}
    ${ai_section('⚠️','OPERATIONAL IMPACT','#EA580C', p.impactHtml, false)}
    ${ai_section('✅','CORRECTIVE ACTION','var(--success)', p.actionHtml, true)}
    ${ai_section('🎯','TARGET / EXPECTED RESULT','var(--accent)', p.targetHtml, false)}
    ${ai_section('📌','VERIFICATION / FOLLOW-UP','var(--teal)', p.verificationHtml, false)}
    ${ai_viewEvidenceBtn(p)}
  </div>`;
}

/* [PHASE 5.1] Compact card untuk Overview — REUSE penuh string HTML yang sama dari PICA
   (problemHtml/evidenceHtml/rootCauseHtml/actionHtml), hanya dipotong ke blok pertama supaya
   ringkas. Tidak ada perhitungan/teks analitik baru dibuat di sini. */
function ai_compactCard(p){
  const pm = AI_PRIORITY_META[p.priority];
  return `
  <div class="glass p-4 fade-in pica-card" style="border-left:3px solid ${pm.color}">
    <div class="flex items-center gap-2 flex-wrap mb-2">
      <span class="panel-title" style="font-size:12.5px">${pm.emoji} ${p.title}</span>
      <span class="tag" style="background:${pm.color}; color:#fff; border:none; font-size:10px; font-weight:700;">Priority: ${p.priority}</span>
      ${ai_confidenceBadge(p.confidence)}
    </div>
    <div style="font-size:11.5px; color:var(--text-dim); margin-bottom:6px"><b style="color:var(--text)">Observation</b>${ai_firstBlock(p.problemHtml)}</div>
    <div style="font-size:11.5px; color:var(--text-dim); margin-bottom:6px"><b style="color:var(--text)">Likely Contributors</b>${ai_firstBlock(p.rootCauseHtml)}</div>
    <div style="font-size:11.5px; color:var(--text-dim); margin-bottom:2px"><b style="color:var(--text)">Recommended Action</b>${ai_firstBlock(p.actionHtml, true)}</div>
    ${ai_viewEvidenceBtn(p)}
  </div>`;
}
/* [PHASE 5.1] Section Overview — mengambil ai_buildPica(data) yang SAMA dengan halaman AI
   Insight (tidak ada KPI/formula baru), menampilkan maksimal 2 insight prioritas tertinggi
   (AI_PRIORITY_RANK existing) supaya Overview tetap compact. */
function ai_overviewSection(data){
  const B = ai_buildPica(data);
  const noData = B.scheduled<=0 && B.obAch===null && B.coAch===null;
  let body;
  if(noData){
    body = `<div class="ov-note" style="padding:10px 2px">Insufficient data for AI operational insight pada filter ini.</div>`;
  } else if(!B.pica.length){
    body = `<div class="ov-note" style="padding:10px 2px">No significant operational issue detected for the current filter.</div>`;
  } else {
    body = `<div class="space-y-3">${B.pica.slice(0,2).map(ai_compactCard).join('')}</div>`;
  }
  return `
  <div class="ov-sec">AI Operational Insight <span><button class="ov-link" onclick="navigate('ai_insight')">Full AI Insight ›</button></span></div>
  <div class="mb-4">${body}</div>`;
}

/* ============================================================
   AI OPERATIONAL INSIGHT — PICA ANALYSIS
   Sumber data (TIDAK berubah dari implementasi sebelumnya):
   - Mine Plan vs Actual        -> getFilteredPlan() + data (Achievement OB/CO)
   - Unit Status Actual         -> getFilteredUnitStatus() + computePAUA() (PA/UA/Breakdown)
   - Delay Events                -> getFilteredDelay() (Delay hours & causes)
   - Idle Events                 -> getFilteredIdle() (Unit Idle & Weather Idle)
   - Fleet/Unit/Pit aktif         -> mengikuti `filters` yang sedang dipakai user
   ============================================================ */
/* [PHASE 5.1] Dipisah dari render_ai_insight() supaya PICA yang sama bisa dipakai ulang
   oleh Overview (compact AI Operational Insight) tanpa membuat engine analitik baru. */
function ai_buildPica(data){
  /* ---- 1) Ambil & hitung ulang seluruh sumber data sesuai filter aktif (tidak ada
     angka hardcoded, tidak ada tabel/field baru) ---- */
  const plan = getFilteredPlan();
  const obActual = U.sum(data.filter(r=>r.stream==='OB_PRODUCTION'),'productionVolume');
  const coActual = U.sum(data.filter(r=>r.stream==='CO_PRODUCTION'),'productionVolume');
  const obTarget = U.sum(plan.filter(p=>p.stream==='OB_PRODUCTION'),'targetVolume');
  const coTarget = U.sum(plan.filter(p=>p.stream==='CO_PRODUCTION'),'targetVolume');
  const obAch = obTarget ? (obActual/obTarget*100) : null;
  const coAch = coTarget ? (coActual/coTarget*100) : null;
  const obGap = obTarget ? Math.max(obTarget-obActual,0) : 0;
  const coGap = coTarget ? Math.max(coTarget-coActual,0) : 0;

  const statusRows = getFilteredUnitStatus();
  const delay = getFilteredDelay();
  const idle = getFilteredIdle();
  // [PA/UA FIX v2 2026-09] kirim delay/idle juga supaya "scheduled" mencakup unit-shift yang
  // isinya 100% Idle/Delay (lihat computePAUA()) — sebelumnya hanya statusRows.
  const { pa, ua, scheduled, breakdown, working, available } = computePAUA(statusRows, delay, idle);
  // [STANDBY UNIFICATION 2026-09] pakai getUnifiedStandbyHours() (Standby+Idle+Delay), bukan status
  // Standby mentah — angka ini HANYA dipakai sebagai metrik tampilan tersendiri di bawah, tidak pernah
  // dijumlahkan lagi dengan totalDelay/totalIdleUnit di response ini (itu tetap dilaporkan terpisah
  // sebagai penyebab, sesuai §8 — Delay & Idle adalah komponen Standby, bukan tambahan di luar Standby).
  const standbyH = getUnifiedStandbyHours(statusRows, delay, idle).total;
  const noOperatorH = U.sum(statusRows.filter(s=>s.status==='No Operator'),'durationHours');
  const bdRows = statusRows.filter(s=>s.status==='Breakdown');
  const topBreakdownUnits = ai_topGroups(bdRows, s=>s.unit, 'durationHours', breakdown, 3);
  const topBreakdownFleets = ai_topGroups(bdRows, s=>s.fleet, 'durationHours', breakdown, 3);

  const totalDelay = U.sum(delay,'hours');
  const topDelayCauses = ai_topGroups(delay, d=>d.name, 'hours', totalDelay, 3);
  const topDelayFleets = ai_topGroups(delay, d=>d.fleet, 'hours', totalDelay, 3);
  const delayRatio = scheduled ? ai_pct(totalDelay, scheduled) : 0;

  const idleUnitRows = idle.filter(i=>i.scope==='UNIT');
  const idleGlobalRows = idle.filter(i=>i.scope==='GLOBAL');
  const totalIdleUnit = U.sum(idleUnitRows,'hours');
  const totalIdleWeather = U.sum(idleGlobalRows,'hours');
  const topIdleCauses = ai_topGroups(idleUnitRows, d=>d.name, 'hours', totalIdleUnit, 3);
  const topIdleFleets = ai_topGroups(idleUnitRows, d=>d.fleet, 'hours', totalIdleUnit, 3);
  const topWeatherCauses = ai_topGroups(idleGlobalRows, d=>d.name, 'hours', totalIdleWeather, 3);
  const idleRatio = scheduled ? ai_pct(totalIdleUnit, scheduled) : 0;

  /* ---- 2) Kumpulkan masalah nyata (PICA). Satu entri hanya dibuat jika data benar-benar
     menunjukkan masalah (ambang batas KPI umum operasional tambang). ---- */
  const pica = [];

  // --- Production Shortfall OB ---
  if(obAch!==null){
    const lvl = ai_classifyLow(obAch, {critical:80, high:90, medium:95});
    if(lvl){
      const gapPct = 100-obAch;
      const problemHtml = `
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 mb-2 font-mono" style="font-size:11.5px">
          <div>Actual: <b style="color:var(--text)">${U.fmt(obActual,0)} BCM</b></div>
          <div>Target: <b style="color:var(--text)">${U.fmt(obTarget,0)} BCM</b></div>
          <div>Achievement: <b style="color:var(--danger)">${U.fmt(obAch,1)}%</b></div>
          <div>Gap: <b style="color:var(--danger)">-${U.fmt(obGap,0)} BCM (-${U.fmt(gapPct,1)}%)</b></div>
        </div>
        <p style="margin:0">Achievement OB berada ${U.fmt(gapPct,1)}% di bawah target pada periode yang sedang difilter. Shortfall sebesar ${U.fmt(obGap,0)} BCM menunjukkan terdapat kehilangan kapasitas produksi yang perlu ditelusuri melalui availability, utilization, delay, idle, dan distribusi performa fleet.</p>`;
      const evidenceHtml = ai_bullets([
        `PA (Physical Availability): <b>${U.fmt(pa,1)}%</b>`,
        `UA (Utilization): <b>${U.fmt(ua,1)}%</b>`,
        `Total Breakdown: <b>${ai_hours(breakdown)}</b>`,
        `Total Delay: <b>${ai_hours(totalDelay)}</b> (${U.fmt(delayRatio,1)}% dari total jam terjadwal)`,
        `Total Idle Unit: <b>${ai_hours(totalIdleUnit)}</b> (${U.fmt(idleRatio,1)}% dari total jam terjadwal)`,
        `Weather Idle: <b>${ai_hours(totalIdleWeather)}</b>`,
        topDelayCauses.length ? `Penyebab Delay terbesar: <b>${topDelayCauses[0].label}</b> — ${ai_hours(topDelayCauses[0].hours)} (${U.fmt(topDelayCauses[0].pct,1)}% dari total delay)` : null
      ]);
      const causeParts = [
        `Data menunjukkan Achievement OB tertinggal ${U.fmt(gapPct,1)}% dari target. Hal ini mengindikasikan adanya kehilangan waktu produktif pada rantai availability → utilization → delay/idle.`
      ];
      if(pa<80) causeParts.push(`PA yang berada di ${U.fmt(pa,1)}% (Breakdown ${ai_hours(breakdown)}) kemungkinan menjadi salah satu penyebab utama berkurangnya kapasitas fleet efektif — <em>Shortfall produksi kemungkinan berkaitan dengan rendahnya availability.</em>`);
      if(ua<70 && totalIdleUnit>0) causeParts.push(`Kombinasi UA rendah (${U.fmt(ua,1)}%) dengan Idle Unit ${ai_hours(totalIdleUnit)} mengindikasikan sebagian unit yang tersedia belum dimanfaatkan optimal — <em>fokus tambahan diarahkan ke utilization &amp; scheduling.</em>`);
      if(delayRatio>=3 && topDelayCauses.length) causeParts.push(`Delay menyumbang ${U.fmt(delayRatio,1)}% dari total jam terjadwal, dengan penyebab terbesar "${topDelayCauses[0].label}" (${U.fmt(topDelayCauses[0].pct,1)}% dari total delay) — <em>shortfall produksi kemungkinan berkaitan dengan kombinasi rendahnya utilization dan tingginya delay.</em>`);
      causeParts.push(`Root cause pasti belum dapat dipastikan hanya dari agregat periode ini — perlu verifikasi lebih lanjut melalui distribusi delay/idle per fleet dan lokasi.`);
      const rootCauseHtml = ai_paras(causeParts);
      const impactHtml = `<p style="margin:0">Shortfall produksi OB sebesar ${U.fmt(obGap,0)} BCM (${U.fmt(gapPct,1)}%) berpotensi menggeser rencana pengupasan lapisan tanah penutup (stripping) periode berikutnya jika tidak segera dikoreksi. Jika kondisi PA/UA saat ini berlanjut tanpa tindakan, gap terhadap Mine Plan berisiko melebar pada periode selanjutnya.</p>`;
      const actionHtml = ai_numbered([
        `Bandingkan proporsi kontribusi PA (${U.fmt(pa,1)}%), UA (${U.fmt(ua,1)}%), Delay (${ai_hours(totalDelay)}), dan Idle (${ai_hours(totalIdleUnit)}) untuk menentukan kontributor dominan shortfall.`,
        `Jika PA dominan → prioritaskan review Breakdown pada unit/fleet dengan jam Breakdown tertinggi (lihat halaman Breakdown/Equipment).`,
        `Jika UA/Idle dominan → evaluasi penjadwalan operator/driver dan penyebab Standby/No Operator (lihat halaman Idle).`,
        `Jika Delay dominan → fokuskan evaluasi P5M/P2H pada penyebab "${topDelayCauses[0]?.label||'-'}" (lihat halaman Delay untuk breakdown per fleet).`,
        `Koordinasikan dengan tim Plan/Engineering untuk menilai perlunya penyesuaian target atau catch-up plan periode berjalan.`,
        `Pantau Achievement OB harian untuk memastikan tren pemulihan menuju target.`
      ]);
      const verificationHtml = `<p style="margin:0">Monitor Achievement OB harian selama 7 hari ke depan. Target recovery: Achievement mendekati 100% dari target harian. Jika Achievement masih di bawah ${U.fmt(Math.min(obAch+10,95),0)}% setelah 7 hari, lakukan investigasi lanjutan per fleet/pit.</p>`;
      const targetHtml = `<p style="margin:0">Achievement OB kembali mencapai target Mine Plan periode ini: <b>${U.fmt(obTarget,0)} BCM</b> (100% dari target aktif di sistem, bukan angka baru). Volume tertinggal ${U.fmt(obGap,0)} BCM perlu dikejar pada sisa periode berjalan atau periode berikutnya.</p>`;
      const owners = ['Production','Dispatch'];
      if(pa<80) owners.push('Maintenance');
      if(ua<70 || idleRatio>=3) owners.push('Operation');
      const actionOwner = owners.join(', ');
      const priorityReason = `Gap ${U.fmt(gapPct,1)}% terhadap target OB (${U.fmt(obGap,0)} BCM) — ${lvl==='CRITICAL'?'gap sangat besar, risiko tinggi terhadap keseluruhan Mine Plan.':lvl==='HIGH'?'gap besar, perlu tindakan segera.':'gap masih dalam batas yang bisa dikoreksi bila ditangani cepat.'}`;
      const contributorsN = (pa<80?1:0) + (ua<70 && totalIdleUnit>0?1:0) + (delayRatio>=3 && topDelayCauses.length?1:0);
      const confidence = ai_evidenceConfidence({direct:true, contributors:contributorsN, comparison: topDelayCauses.length>0 || topDelayFleets.length>0});
      const evidenceOnclick = `ai_openGapEvidence('OB')`;
      pica.push({ title:'Production Shortfall — Overburden (OB)', category:'Production', priority:lvl, severity:gapPct, priorityReason, actionOwner, confidence, evidenceOnclick, problemHtml, evidenceHtml, rootCauseHtml, impactHtml, actionHtml, targetHtml, verificationHtml });
    }
  }

  // --- Production Shortfall CO (Coal) ---
  if(coAch!==null){
    const lvl = ai_classifyLow(coAch, {critical:80, high:90, medium:95});
    if(lvl){
      const gapPct = 100-coAch;
      const problemHtml = `
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 mb-2 font-mono" style="font-size:11.5px">
          <div>Actual: <b style="color:var(--text)">${U.fmt(coActual,0)} Ton</b></div>
          <div>Target: <b style="color:var(--text)">${U.fmt(coTarget,0)} Ton</b></div>
          <div>Achievement: <b style="color:var(--danger)">${U.fmt(coAch,1)}%</b></div>
          <div>Gap: <b style="color:var(--danger)">-${U.fmt(coGap,0)} Ton (-${U.fmt(gapPct,1)}%)</b></div>
        </div>
        <p style="margin:0">Achievement CO (Batubara) berada ${U.fmt(gapPct,1)}% di bawah target pada periode yang sedang difilter. Shortfall sebesar ${U.fmt(coGap,0)} Ton menunjukkan kehilangan kapasitas produksi coal yang perlu ditelusuri lebih lanjut.</p>`;
      const evidenceHtml = ai_bullets([
        `PA (Physical Availability): <b>${U.fmt(pa,1)}%</b>`,
        `UA (Utilization): <b>${U.fmt(ua,1)}%</b>`,
        `Total Delay: <b>${ai_hours(totalDelay)}</b> (${U.fmt(delayRatio,1)}% dari total jam terjadwal)`,
        `Total Idle Unit: <b>${ai_hours(totalIdleUnit)}</b> (${U.fmt(idleRatio,1)}% dari total jam terjadwal)`,
        topDelayFleets.length ? `Fleet dengan kontribusi Delay terbesar: <b>${topDelayFleets[0].label}</b> — ${U.fmt(topDelayFleets[0].pct,1)}% dari total delay` : null
      ]);
      const rootCauseHtml = ai_paras([
        `Data menunjukkan Achievement CO tertinggal ${U.fmt(gapPct,1)}% dari target. Fleet CO umumnya lebih sedikit unitnya dibanding OB sehingga lebih sensitif terhadap Breakdown/Delay pada satu-dua unit saja.`,
        pa<80 ? `PA periode ini ${U.fmt(pa,1)}% — kemungkinan turut menyumbang keterbatasan kapasitas fleet CO. Perlu verifikasi apakah unit yang Breakdown termasuk fleet CO.` : null,
        `Perlu verifikasi lapangan pada halaman Equipment/PA &amp; UA untuk memastikan ketersediaan unit fleet CO secara spesifik.`
      ]);
      const impactHtml = `<p style="margin:0">Shortfall CO sebesar ${U.fmt(coGap,0)} Ton (${U.fmt(gapPct,1)}%) berdampak langsung pada volume batubara siap jual/kirim pada periode ini.</p>`;
      const actionHtml = ai_numbered([
        `Cek ketersediaan unit fleet CO secara spesifik di halaman Equipment/PA & UA.`,
        `Identifikasi apakah shortfall disebabkan Breakdown, Delay, atau Idle pada unit fleet CO.`,
        `Prioritaskan perbaikan/maintenance unit CO jika ditemukan Breakdown signifikan.`,
        `Koordinasikan dengan tim Plan untuk penyesuaian target CO jika keterbatasan unit bersifat struktural.`,
        `Monitor Achievement CO harian pada periode berikutnya.`
      ]);
      const verificationHtml = `<p style="margin:0">Monitor Achievement CO harian selama 7 hari ke depan. Jika masih di bawah ${U.fmt(Math.min(coAch+10,95),0)}% setelah 7 hari, lakukan investigasi lanjutan per unit fleet CO.</p>`;
      const targetHtml = `<p style="margin:0">Achievement CO kembali mencapai target Mine Plan periode ini: <b>${U.fmt(coTarget,0)} Ton</b> (100% dari target aktif di sistem). Volume tertinggal ${U.fmt(coGap,0)} Ton perlu dikejar pada sisa periode berjalan atau periode berikutnya.</p>`;
      const owners = ['Production','Dispatch'];
      if(pa<80) owners.push('Maintenance');
      const actionOwner = owners.join(', ');
      const priorityReason = `Gap ${U.fmt(gapPct,1)}% terhadap target CO (${U.fmt(coGap,0)} Ton) — ${lvl==='CRITICAL'?'gap sangat besar terhadap volume batubara siap kirim.':lvl==='HIGH'?'gap besar, perlu tindakan segera.':'gap masih dalam batas yang bisa dikoreksi bila ditangani cepat.'}`;
      const contributorsN = (pa<80?1:0) + (topDelayFleets.length?1:0);
      const confidence = ai_evidenceConfidence({direct:true, contributors:contributorsN, comparison: topDelayFleets.length>0});
      const evidenceOnclick = `ai_openGapEvidence('CO')`;
      pica.push({ title:'Production Shortfall — Coal (CO)', category:'Production', priority:lvl, severity:gapPct, priorityReason, actionOwner, confidence, evidenceOnclick, problemHtml, evidenceHtml, rootCauseHtml, impactHtml, actionHtml, targetHtml, verificationHtml });
    }
  }

  // --- Low Physical Availability (PA) ---
  if(pa>0){
    const lvl = ai_classifyLow(pa, {critical:65, high:75, medium:85});
    if(lvl){
      const problemHtml = `
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 mb-2 font-mono" style="font-size:11.5px">
          <div>PA Actual: <b style="color:var(--danger)">${U.fmt(pa,1)}%</b></div>
          <div>Target Umum: <b style="color:var(--text)">≥ 80%</b></div>
          <div>Total Breakdown: <b style="color:var(--danger)">${ai_hours(breakdown)}</b></div>
          <div>Jam Terjadwal: <b style="color:var(--text)">${ai_hours(scheduled)}</b></div>
        </div>
        <p style="margin:0">PA (Physical Availability) berada di ${U.fmt(pa,1)}%, di bawah target umum industri 80%. Total ${ai_hours(breakdown)} unit dalam status Breakdown pada periode ini mengurangi kapasitas fleet yang tersedia untuk beroperasi.</p>`;
      const evidenceHtml = ai_bullets([
        topBreakdownUnits.length ? `Unit dengan kontribusi Breakdown terbesar: ${topBreakdownUnits.map(u=>`<b>${u.label}</b> (${ai_hours(u.hours)}, ${U.fmt(u.pct,1)}%)`).join(', ')}` : `Tidak ada rincian unit Breakdown pada periode/filter ini.`,
        topBreakdownFleets.length ? `Fleet dengan kontribusi Breakdown terbesar: ${topBreakdownFleets.map(f=>`<b>${f.label}</b> (${U.fmt(f.pct,1)}%)`).join(', ')}` : null,
        `UA (Utilization) pada periode yang sama: <b>${U.fmt(ua,1)}%</b>`
      ]);
      const rootCauseHtml = ai_paras([
        `Rendahnya PA terutama perlu ditelusuri melalui downtime akibat Breakdown, karena PA pada periode ini dihitung langsung dari proporsi jam Breakdown terhadap jam terjadwal.`,
        topBreakdownUnits.length ? `Data menunjukkan kontributor Breakdown terbesar adalah unit "${topBreakdownUnits[0].label}" dengan ${ai_hours(topBreakdownUnits[0].hours)} (${U.fmt(topBreakdownUnits[0].pct,1)}% dari total Breakdown). Ini mengindikasikan masalah kemungkinan terkonsentrasi pada unit/fleet tertentu, namun perlu diverifikasi apakah bersifat berulang (recurring) melalui histori maintenance.` : `Root cause spesifik per unit belum dapat dipastikan dari data yang tersedia pada filter ini. Diperlukan verifikasi lapangan.`
      ]);
      const impactHtml = `<p style="margin:0">PA rendah tercatat bersamaan dengan sebagian unit tidak tersedia untuk operasi (${ai_hours(breakdown)} dari ${ai_hours(scheduled)} jam terjadwal). Jika kondisi ini berlangsung, kapasitas fleet efektif berkurang dan berpotensi memperbesar gap terhadap Mine Plan.</p>`;
      const actionHtml = ai_numbered([
        `Identifikasi unit dengan Breakdown Hours tertinggi pada periode ini (lihat halaman Breakdown).`,
        `Kelompokkan temuan berdasarkan fleet untuk melihat apakah masalah merata atau terkonsentrasi.`,
        `Prioritaskan unit dengan kontribusi downtime terbesar untuk tindakan lebih dulu.`,
        `Review histori penyebab Breakdown pada unit-unit prioritas tersebut.`,
        `Periksa apakah downtime bersifat berulang (recurring failure) atau kejadian tunggal.`,
        `Evaluasi kebutuhan preventive maintenance/P2H tambahan pada unit dengan downtime berulang.`,
        `Tetapkan target recovery PA untuk periode berikutnya.`,
        `Monitor hasil tindakan pada periode berikutnya melalui halaman Equipment/PA & UA.`
      ]);
      const verificationHtml = `<p style="margin:0">Monitor PA harian selama 7 hari berikutnya. Target recovery minimal ≥ 80%. Jika PA tetap di bawah target, lakukan breakdown analysis per unit.</p>`;
      const targetHtml = `<p style="margin:0">PA meningkat ke ≥ 80% (ambang umum operasional yang dipakai konsisten di seluruh KPI PA/UA aplikasi ini). Total jam Breakdown turun dari kondisi saat ini (${ai_hours(breakdown)}) pada periode berikutnya.</p>`;
      const actionOwner = 'Maintenance';
      const priorityReason = `PA ${U.fmt(pa,1)}% vs target umum ≥ 80% — ${lvl==='CRITICAL'?'sangat jauh di bawah target, kapasitas fleet efektif turun signifikan.':lvl==='HIGH'?'jauh di bawah target.':'di bawah target, perlu perhatian.'}`;
      const confidence = ai_evidenceConfidence({direct:true, contributors: topBreakdownUnits.length?1:0, comparison: topBreakdownFleets.length>0});
      const evidenceOnclick = topBreakdownUnits.length ? `axUnitInExc(${esc(JSON.stringify(topBreakdownUnits[0].label))})` : `axViewExc('breakdown')`;
      pica.push({ title:'Low Physical Availability (PA)', category:'PA (didorong Breakdown)', priority:lvl, severity:85-pa, priorityReason, actionOwner, confidence, evidenceOnclick, problemHtml, evidenceHtml, rootCauseHtml, impactHtml, actionHtml, targetHtml, verificationHtml });
    }
  }

  // --- Low Utilization (UA) ---
  if(ua>0){
    const lvl = ai_classifyLow(ua, {critical:50, high:60, medium:75});
    if(lvl){
      const unusedAvailable = Math.max(available-working, 0);
      const problemHtml = `
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 mb-2 font-mono" style="font-size:11.5px">
          <div>UA Actual: <b style="color:var(--danger)">${U.fmt(ua,1)}%</b></div>
          <div>Target Umum: <b style="color:var(--text)">≥ 70%</b></div>
          <div>Jam Tersedia: <b style="color:var(--text)">${ai_hours(available)}</b></div>
          <div>Jam Tidak Terpakai: <b style="color:var(--danger)">${ai_hours(unusedAvailable)}</b></div>
        </div>
        <p style="margin:0">UA (Utilization) hanya ${U.fmt(ua,1)}% — unit yang tersedia (tidak Breakdown) banyak dihabiskan untuk Standby/No Operator/Idle, bukan bekerja aktif.</p>`;
      const evidenceHtml = ai_bullets([
        `Standby: <b>${ai_hours(standbyH)}</b>, No Operator: <b>${ai_hours(noOperatorH)}</b>`,
        `Total Idle Unit (lokal): <b>${ai_hours(totalIdleUnit)}</b> (${U.fmt(idleRatio,1)}% dari total jam terjadwal)`,
        topIdleCauses.length ? `Penyebab Idle Unit terbesar: <b>${topIdleCauses[0].label}</b> — ${ai_hours(topIdleCauses[0].hours)} (${U.fmt(topIdleCauses[0].pct,1)}% dari total Idle Unit)` : null,
        topIdleFleets.length ? `Fleet dengan kontribusi Idle terbesar: <b>${topIdleFleets[0].label}</b> (${U.fmt(topIdleFleets[0].pct,1)}%)` : null
      ]);
      const rootCauseHtml = ai_paras([
        (idleRatio>=3 && topIdleCauses.length)
          ? `Unit tersedia tetapi belum dimanfaatkan optimal — data menunjukkan Idle Unit terbesar berasal dari "${topIdleCauses[0].label}" (${U.fmt(topIdleCauses[0].pct,1)}% dari total Idle Unit). Fokus corrective action diarahkan pada utilization, operator/driver availability, dan scheduling.`
          : `UA rendah dengan Idle Unit yang relatif kecil mengindikasikan kemungkinan penyebab lain di luar Idle tercatat (mis. jeda antar-shift, menunggu instruksi). Perlu verifikasi lapangan lebih lanjut karena data Idle saat ini tidak menunjukkan kontributor dominan.`,
        `Data menunjukkan indikasi awal; perlu verifikasi lapangan untuk memastikan apakah penyebab utama adalah ketersediaan operator/driver, penjadwalan (roster), atau menunggu instruksi kerja.`
      ]);
      const impactHtml = `<p style="margin:0">Sebanyak ${ai_hours(unusedAvailable)} dari jam unit yang tersedia (tidak Breakdown) tidak digunakan untuk bekerja aktif. Ini adalah kapasitas produksi yang idle secara operasional, terlepas dari kondisi unit itu sendiri.</p>`;
      const actionHtml = ai_numbered([
        `Cek halaman Idle untuk penyebab utama Standby/No Operator per fleet pada periode ini.`,
        `Pastikan penjadwalan operator/driver (roster) sudah menutup semua slot unit yang tersedia (tidak Breakdown).`,
        `Identifikasi fleet/pit dengan kontribusi Idle terbesar sebagai fokus utama.`,
        `Koordinasikan dengan tim HR/Ops terkait ketersediaan operator pada shift dengan No Operator tertinggi.`,
        `Evaluasi apakah Idle berulang pada jam/lokasi tertentu (indikasi masalah scheduling struktural).`,
        `Tetapkan target recovery UA untuk periode berikutnya.`
      ]);
      const verificationHtml = `<p style="margin:0">Monitor UA harian selama 7 hari berikutnya. Target recovery minimal ≥ 70%. Jika UA tetap rendah, lakukan evaluasi roster operator/driver secara menyeluruh.</p>`;
      const targetHtml = `<p style="margin:0">UA meningkat ke ≥ 70%. Jam unit tersedia yang belum termanfaatkan (${ai_hours(unusedAvailable)}) berkurang pada periode berikutnya.</p>`;
      const actionOwner = 'Operation, Dispatch';
      const priorityReason = `UA ${U.fmt(ua,1)}% vs target umum ≥ 70% — ${lvl==='CRITICAL'?'sangat jauh di bawah target, banyak kapasitas fleet tersedia tidak terpakai.':lvl==='HIGH'?'jauh di bawah target.':'di bawah target, perlu perhatian.'}`;
      const confidence = ai_evidenceConfidence({direct:true, contributors: (idleRatio>=3 && topIdleCauses.length)?1:0, comparison: topIdleFleets.length>0});
      const evidenceOnclick = `axViewExc('idle')`;
      pica.push({ title:'Low Utilization (UA)', category:'UA', priority:lvl, severity:75-ua, priorityReason, actionOwner, confidence, evidenceOnclick, problemHtml, evidenceHtml, rootCauseHtml, impactHtml, actionHtml, targetHtml, verificationHtml });
    }
  }

  // --- High Delay ---
  if(scheduled>0 && totalDelay>0){
    const lvl = ai_classifyHigh(delayRatio, {critical:15, high:8, medium:3});
    if(lvl){
      const problemHtml = `
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 mb-2 font-mono" style="font-size:11.5px">
          <div>Total Delay: <b style="color:var(--danger)">${ai_hours(totalDelay)}</b></div>
          <div>Rasio thd Jam Terjadwal: <b style="color:var(--danger)">${U.fmt(delayRatio,1)}%</b></div>
          <div>Jumlah Kejadian: <b style="color:var(--text)">${delay.length}</b></div>
          <div>Penyebab Terbesar: <b style="color:var(--text)">${topDelayCauses[0]?.label||'-'}</b></div>
        </div>
        <p style="margin:0">Delay menyumbang ${U.fmt(delayRatio,1)}% dari total jam terjadwal (${ai_hours(totalDelay)}) pada periode ini — di atas ambang batas wajar operasional.</p>`;
      const evidenceHtml = ai_bullets([
        ...topDelayCauses.map(c=>`Penyebab "${c.label}": <b>${ai_hours(c.hours)}</b> (${U.fmt(c.pct,1)}% dari total Delay)`),
        topDelayFleets.length ? `Fleet dengan kontribusi Delay terbesar: <b>${topDelayFleets[0].label}</b> (${U.fmt(topDelayFleets[0].pct,1)}%)` : null
      ]);
      const rootCauseHtml = ai_paras([
        topDelayCauses.length ? `Data menunjukkan delay terbesar berasal dari "${topDelayCauses[0].label}" sebesar ${ai_hours(topDelayCauses[0].hours)} (${U.fmt(topDelayCauses[0].pct,1)}% dari total delay). Hal ini mengindikasikan hambatan utama kemungkinan berada pada kondisi/kapasitas terkait penyebab tersebut, namun perlu diverifikasi melalui distribusi delay per fleet dan lokasi.` : null,
        topDelayFleets.length ? `Kontribusi terbesar berasal dari fleet "${topDelayFleets[0].label}" (${U.fmt(topDelayFleets[0].pct,1)}% dari total delay) — perlu verifikasi apakah masalah spesifik pada fleet ini atau merata di semua fleet.` : null
      ]);
      const impactHtml = `<p style="margin:0">Delay setara ${U.fmt(delayRatio,1)}% dari total jam terjadwal adalah waktu operasi yang hilang secara langsung, berkontribusi terhadap shortfall produksi bila terjadi bersamaan dengan Achievement di bawah target.</p>`;
      const actionHtml = ai_numbered([
        `Fokuskan evaluasi P5M/P2H pada penyebab "${topDelayCauses[0]?.label||'-'}" secara spesifik.`,
        `Lihat breakdown per Fleet di halaman Delay untuk menentukan apakah masalahnya di satu fleet tertentu atau merata.`,
        `Jika penyebab terkait infrastruktur (mis. hauling road), koordinasikan dengan tim Civil/Infrastructure untuk perbaikan.`,
        `Jika penyebab terkait proses kerja, evaluasi SOP terkait pada shift/fleet yang paling terdampak.`,
        `Tetapkan target penurunan rasio Delay untuk periode berikutnya.`
      ]);
      const verificationHtml = `<p style="margin:0">Monitor rasio Delay harian (Delay/jam terjadwal) selama 7 hari berikutnya. Target: rasio Delay turun di bawah 3%. Evaluasi ulang jika target belum tercapai.</p>`;
      const targetHtml = `<p style="margin:0">Rasio Delay turun di bawah 3% dari total jam terjadwal (saat ini ${U.fmt(delayRatio,1)}%). Total Delay berkurang dari kondisi saat ini (${ai_hours(totalDelay)}).</p>`;
      const actionOwner = ai_ownerForDelay(topDelayCauses[0]?.label);
      const priorityReason = `Delay ${U.fmt(delayRatio,1)}% dari total jam terjadwal (${ai_hours(totalDelay)}) — penyebab terbesar "${topDelayCauses[0]?.label||'-'}" (${U.fmt(topDelayCauses[0]?.pct||0,1)}%).`;
      const confidence = ai_evidenceConfidence({direct:true, contributors: topDelayCauses.length?1:0, comparison: topDelayFleets.length>0});
      const evidenceOnclick = `axViewExc('delay')`;
      pica.push({ title:'High Delay', category:'Delay', priority:lvl, severity:delayRatio, priorityReason, actionOwner, confidence, evidenceOnclick, problemHtml, evidenceHtml, rootCauseHtml, impactHtml, actionHtml, targetHtml, verificationHtml });
    }
  }

  // --- High Unit Idle ---
  if(scheduled>0 && totalIdleUnit>0){
    const lvl = ai_classifyHigh(idleRatio, {critical:15, high:8, medium:3});
    if(lvl){
      const problemHtml = `
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 mb-2 font-mono" style="font-size:11.5px">
          <div>Total Idle Unit: <b style="color:var(--danger)">${ai_hours(totalIdleUnit)}</b></div>
          <div>Rasio thd Jam Terjadwal: <b style="color:var(--danger)">${U.fmt(idleRatio,1)}%</b></div>
          <div>Jumlah Kejadian: <b style="color:var(--text)">${idleUnitRows.length}</b></div>
          <div>Penyebab Terbesar: <b style="color:var(--text)">${topIdleCauses[0]?.label||'-'}</b></div>
        </div>
        <p style="margin:0">Idle Unit (uncontrolled standby) mencapai ${U.fmt(idleRatio,1)}% dari total jam terjadwal (${ai_hours(totalIdleUnit)}) pada periode ini.</p>`;
      const evidenceHtml = ai_bullets([
        ...topIdleCauses.map(c=>`Penyebab "${c.label}": <b>${ai_hours(c.hours)}</b> (${U.fmt(c.pct,1)}% dari total Idle Unit)`),
        topIdleFleets.length ? `Fleet dengan kontribusi Idle terbesar: <b>${topIdleFleets[0].label}</b> (${U.fmt(topIdleFleets[0].pct,1)}%)` : null,
        `UA pada periode yang sama: <b>${U.fmt(ua,1)}%</b>`
      ]);
      const rootCauseHtml = ai_paras([
        `Unit tersedia tetapi belum dimanfaatkan optimal, sehingga fokus corrective action diarahkan pada utilization, operator/driver availability, dan scheduling.`,
        topIdleCauses.length ? `Data menunjukkan penyebab Idle terbesar adalah "${topIdleCauses[0].label}" (${U.fmt(topIdleCauses[0].pct,1)}% dari total Idle Unit) — perlu verifikasi apakah ini berkaitan dengan ketersediaan operator, menunggu instruksi, atau scheduling.` : null
      ]);
      const impactHtml = `<p style="margin:0">Idle Unit sebesar ${ai_hours(totalIdleUnit)} adalah kapasitas fleet yang tersedia namun tidak produktif — berkontribusi langsung terhadap rendahnya UA dan berpotensi memperbesar gap terhadap Mine Plan.</p>`;
      const actionHtml = ai_numbered([
        `Cek halaman Idle untuk penyebab utama per fleet pada periode ini.`,
        `Pastikan penjadwalan operator/driver sudah menutup semua slot unit yang tersedia.`,
        `Evaluasi apakah Idle terkonsentrasi pada shift/fleet tertentu.`,
        `Koordinasikan dengan tim Ops terkait proses assignment unit ke pekerjaan.`,
        `Tetapkan target penurunan rasio Idle Unit untuk periode berikutnya.`
      ]);
      const verificationHtml = `<p style="margin:0">Monitor rasio Idle Unit harian selama 7 hari berikutnya. Target: rasio Idle turun di bawah 3%. Jika belum tercapai, lakukan evaluasi scheduling menyeluruh.</p>`;
      const targetHtml = `<p style="margin:0">Rasio Idle Unit turun di bawah 3% dari total jam terjadwal (saat ini ${U.fmt(idleRatio,1)}%). Total Idle Unit berkurang dari kondisi saat ini (${ai_hours(totalIdleUnit)}).</p>`;
      const actionOwner = 'Operation, Dispatch';
      const priorityReason = `Idle Unit ${U.fmt(idleRatio,1)}% dari total jam terjadwal (${ai_hours(totalIdleUnit)}) — penyebab terbesar "${topIdleCauses[0]?.label||'-'}".`;
      const confidence = ai_evidenceConfidence({direct:true, contributors: topIdleCauses.length?1:0, comparison: topIdleFleets.length>0});
      const evidenceOnclick = `axViewExc('idle')`;
      pica.push({ title:'High Unit Idle', category:'Idle', priority:lvl, severity:idleRatio, priorityReason, actionOwner, confidence, evidenceOnclick, problemHtml, evidenceHtml, rootCauseHtml, impactHtml, actionHtml, targetHtml, verificationHtml });
    }
  }

  // --- Weather Impact ---
  if(totalIdleWeather>0){
    const lvl = ai_classifyHigh(totalIdleWeather, {critical:40, high:20, medium:10});
    if(lvl){
      const problemHtml = `
        <div class="grid grid-cols-2 gap-x-3 gap-y-1 mb-2 font-mono" style="font-size:11.5px">
          <div>Weather Idle: <b style="color:var(--danger)">${ai_hours(totalIdleWeather)}</b></div>
          <div>Jumlah Kejadian: <b style="color:var(--text)">${idleGlobalRows.length}</b></div>
        </div>
        <p style="margin:0">Idle akibat cuaca (Weather Global: Rain/Slippery/Fog) mencapai ${ai_hours(totalIdleWeather)} pada periode ini, memotong waktu operasi seluruh fleet secara bersamaan (bukan hanya unit tertentu).</p>`;
      const evidenceHtml = ai_bullets(
        topWeatherCauses.length
          ? topWeatherCauses.map(c=>`Penyebab "${c.label}": <b>${ai_hours(c.hours)}</b> (${U.fmt(c.pct,1)}% dari total Weather Idle)`)
          : [`Tidak ada rincian penyebab cuaca spesifik pada periode/filter ini.`]
      );
      const rootCauseHtml = ai_paras([
        `Weather-related idle tercatat selama periode yang difilter, bersifat Global (mempengaruhi seluruh fleet dalam scope yang sama). Dampaknya terhadap production shortfall/UA perlu diverifikasi melalui distribusi event dan performa produksi pada jam yang sama.`,
        `Besarnya durasi idle kemungkinan berkaitan dengan kesiapan infrastruktur hauling road/drainase — ini adalah faktor yang perlu diverifikasi lebih lanjut, bukan kesimpulan pasti dari data agregat periode ini.`
      ]);
      const impactHtml = `<p style="margin:0">Weather Idle sebesar ${ai_hours(totalIdleWeather)} adalah waktu operasi yang hilang di luar kendali langsung tim operasi, namun tetap berkontribusi terhadap shortfall produksi bila terjadi bersamaan dengan Achievement di bawah target.</p>`;
      const actionHtml = ai_numbered([
        `Evaluasi jalur hauling yang paling sering terdampak Slippery pada periode ini.`,
        `Pertimbangkan perbaikan drainase/perkerasan jalan pada titik yang berulang kali dilaporkan.`,
        `Siapkan unit Water Truck/Grader tambahan pada periode dengan prediksi curah hujan tinggi.`,
        `Evaluasi SOP operasi saat kondisi hujan/slippery agar waktu recovery lebih cepat.`
      ]);
      const verificationHtml = `<p style="margin:0">Bandingkan durasi Weather Idle dengan periode sebelumnya setelah perbaikan infrastruktur/SOP dilakukan. Target: durasi idle per kejadian hujan menurun dibanding baseline saat ini.</p>`;
      const targetHtml = `<p style="margin:0">Durasi Weather Idle menurun dibanding baseline periode ini (${ai_hours(totalIdleWeather)}) melalui perbaikan infrastruktur hauling road/drainase dan penyesuaian SOP operasi saat hujan.</p>`;
      const actionOwner = 'Operation, Engineering';
      const priorityReason = `Weather Idle ${ai_hours(totalIdleWeather)} pada periode ini — ${lvl==='CRITICAL'?'kehilangan waktu operasi tercatat bersamaan dengan event cuaca, sangat besar.':lvl==='HIGH'?'kehilangan waktu operasi tercatat bersamaan dengan event cuaca, cukup besar.':'kehilangan waktu operasi tercatat bersamaan dengan event cuaca, perlu dipantau.'}`;
      // Weather bersifat site-level/Global dan belum ada data pembanding baseline infrastruktur — confidence dijaga maksimal MODERATE.
      const confidence = topWeatherCauses.length ? 'MODERATE' : 'LOW';
      const evidenceOnclick = `axViewExc('weather')`;
      pica.push({ title:'Weather Impact', category:'Weather', priority:lvl, severity:totalIdleWeather, priorityReason, actionOwner, confidence, evidenceOnclick, problemHtml, evidenceHtml, rootCauseHtml, impactHtml, actionHtml, targetHtml, verificationHtml });
    }
  }

  // ---- 3) Urutkan berdasarkan severity/prioritas ----
  pica.sort((a,b)=> (AI_PRIORITY_RANK[a.priority]-AI_PRIORITY_RANK[b.priority]) || (b.severity-a.severity));
  return { pica, pa, ua, scheduled, breakdown, working, available, standbyH, noOperatorH, topBreakdownUnits, topBreakdownFleets, totalDelay, topDelayCauses, topDelayFleets, delayRatio, idleUnitRows, idleGlobalRows, totalIdleUnit, totalIdleWeather, topIdleCauses, topIdleFleets, topWeatherCauses, idleRatio, obAch, coAch, obActual, obTarget, obGap, coActual, coTarget, coGap, delay };
}

function render_ai_insight(data, el){
  const B = ai_buildPica(data);
  const { pica, pa, ua, obAch, coAch, totalDelay, totalIdleUnit, totalIdleWeather, delayRatio, idleRatio } = B;
  /* ---- 4) Render UI ---- */
  const noIssueHtml = `
  <div class="glass p-6 fade-in text-center">
    <div class="text-2xl mb-2">🟢</div>
    <div class="panel-title mb-2">No Significant Issue</div>
    <p class="text-[12.5px]" style="color:var(--text-dim); line-height:1.7; max-width:640px; margin:0 auto">
      Tidak ada indikator bermasalah signifikan pada periode/filter ini — PA <b>${U.fmt(pa,1)}%</b>, UA <b>${U.fmt(ua,1)}%</b>${obAch!==null?`, Achievement OB <b>${U.fmt(obAch,1)}%</b>`:''}${coAch!==null?`, Achievement CO <b>${U.fmt(coAch,1)}%</b>`:''}, rasio Delay <b>${U.fmt(delayRatio,1)}%</b>, rasio Idle Unit <b>${U.fmt(idleRatio,1)}%</b>, Weather Idle <b>${ai_hours(totalIdleWeather)}</b> — seluruhnya berada dalam batas wajar operasional.
    </p>
    <p class="text-[12.5px] mt-2" style="color:var(--text-faint)">Pertahankan pola operasional saat ini dan gunakan periode ini sebagai referensi <em>best practice</em> untuk dibandingkan dengan periode lain.</p>
  </div>`;

  el.innerHTML = `
  <style>
    .ai-insight-wrap .pica-acc{ border-top:1px solid var(--border-soft); }
    .ai-insight-wrap .pica-acc:first-of-type{ border-top:none; }
    .ai-insight-wrap .pica-acc summary{ cursor:pointer; list-style:none; padding:10px 0 8px 0; display:flex; align-items:center; gap:6px; }
    .ai-insight-wrap .pica-acc summary::-webkit-details-marker{ display:none; }
    .ai-insight-wrap .pica-acc summary::before{ content:'▸'; font-size:9px; color:var(--text-faint); transition:transform .15s ease; display:inline-block; }
    .ai-insight-wrap .pica-acc[open] summary::before{ transform:rotate(90deg); }
    .ai-insight-wrap .pica-acc-body{ padding:0 2px 12px 16px; font-size:12.5px; line-height:1.65; color:var(--text-dim); }
    .ai-insight-wrap .pica-card{ overflow:hidden; }
    @media (max-width:640px){
      .ai-insight-wrap .pica-card .grid-cols-2{ grid-template-columns:1fr; }
    }
  </style>
  <div class="ai-insight-wrap">
    <div class="mb-4">
      <div class="flex items-center gap-2 mb-1">
        <span style="font-size:18px">🤖</span>
        <span class="panel-title" style="font-size:15px">AI OPERATIONAL INSIGHT</span>
      </div>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
      ${kpiCard('AI-01','PA', U.fmt(pa,1),'%',null, pa>0 && pa<80 ? 'var(--danger)':'var(--teal)', null)}
      ${kpiCard('AI-02','UA', U.fmt(ua,1),'%',null, ua>0 && ua<70 ? 'var(--danger)':'var(--violet)', null)}
      ${kpiCard('AI-03','Achievement OB', obAch!==null?U.fmt(obAch,1):'-','%',null, obAch!==null && obAch<90 ? 'var(--danger)':'var(--warning)', null)}
      ${kpiCard('AI-04','Achievement CO', coAch!==null?U.fmt(coAch,1):'-','%',null, coAch!==null && coAch<90 ? 'var(--danger)':'var(--info)', null)}
      ${kpiCard('AI-05','Total Delay', U.fmt(totalDelay,1),'jam',null, delayRatio>=8 ? 'var(--danger)':'var(--accent)', null)}
      ${kpiCard('AI-06','Total Idle', U.fmt(totalIdleUnit+totalIdleWeather,1),'jam',null, idleRatio>=8 ? 'var(--danger)':'var(--info)', null)}
    </div>

    <div class="space-y-4 mb-6">
      ${pica.length ? pica.map((p,i)=>ai_card(p,i+1)).join('') : noIssueHtml}
    </div>

    <div class="glass p-5 fade-in">
      <div class="panel-title mb-1">Tren Historis &amp; Proyeksi Sederhana Volume OB (7 Hari ke Depan)</div>
      <div class="panel-sub mb-2">Proyeksi = rata-rata bergerak 7 hari terakhir dari data actual, bukan model prediksi kompleks</div>
      <div style="height:280px"><canvas id="ai_line"></canvas></div>
    </div>
  </div>
  `;

  /* ---- 5) Chart proyeksi (logika lama dipertahankan apa adanya) ---- */
  const byDate = U.groupBy(data.filter(r=>r.stream==='OB_PRODUCTION'), r => r.date);
  const histDates = uniqueSorted([...byDate.keys()]).slice(-14);
  const histVol = histDates.map(d => U.sum(byDate.get(d), 'productionVolume'));

  let futureDates = []; let futureVol = [];
  let baseDate = histDates.length > 0 ? new Date(histDates[histDates.length - 1]+'T00:00:00') : new Date();
  const recentDays = histVol.slice(-7);
  const baseline = recentDays.length ? (recentDays.reduce((a,b)=>a+b,0) / recentDays.length) : 0;
  for(let i=1; i<=7; i++) {
    let nextD = new Date(baseDate);
    nextD.setDate(nextD.getDate() + i);
    futureDates.push(U.dateShort(nextD));
    futureVol.push(baseline);
  }

  const allLabels = [...histDates.map(d => U.dateShort(new Date(d+'T00:00:00'))), ...futureDates];
  const seriesActual = [...histVol, ...Array(7).fill(null)];
  let seriesPredict = Array(histDates.length).fill(null);
  if(histVol.length > 0) seriesPredict[histDates.length - 1] = histVol[histVol.length - 1];
  seriesPredict.push(...futureVol);

  makeChart('ai_line', {
    type: 'line', data: { labels: allLabels, datasets: [
        {label: 'Actual OB (BCM)', data: seriesActual, borderColor: PALETTE[0], backgroundColor: 'rgba(245,165,36,.15)', fill: true, tension: 0.3, borderWidth: 2},
        {label: 'Proyeksi (rata-rata 7 hari)', data: seriesPredict, borderColor: PALETTE[2], borderDash: [6, 4], tension: 0.3, pointRadius: 3, pointBackgroundColor: PALETTE[2], borderWidth: 2}
      ]}, options: baseOpts()
  });
}


/* ---- REPORTS ---- */
function reportPeriodText(){
  const f = filters;
  if(f.month==='all' && f.dayStart==='all' && f.dayEnd==='all') return `Seluruh Periode ${YEAR}`;
  const monthTxt = f.month==='all' ? '' : U.monthNameFull(Number(f.month));
  if(f.dayStart!=='all' || f.dayEnd!=='all'){
    const ds = f.dayStart==='all' ? '1' : f.dayStart;
    const de = f.dayEnd==='all' ? '' : ` - ${f.dayEnd}`;
    return `Tanggal ${ds}${de} ${monthTxt||''} ${YEAR}`.replace(/\s+/g,' ').trim();
  }
  return `${monthTxt} ${YEAR}`;
}

/* ================= REPORTS — DATA LAYER (2026-09 rewrite) =================
   Semua angka pada halaman Reports (KPI Summary, 5 grafik, dan narasi
   Print/PDF) dihitung ULANG di sini langsung dari sumber data nyata:
     - RECORDS (production_actual) via getFiltered()
     - MINE_PLAN (plan_daily_generated) via getFilteredPlan()
     - UNIT_STATUS (unit_status_actual) via getFilteredUnitStatus()/computePAUA()
     - FUEL_ACTUAL (fuel_actual) via getFilteredFuel()/computeFuelRatios()
   Tidak ada lagi field lama yang sudah tidak ada di skema (production/
   target/availability/utilization/haulTonnage/dst — lihat MAINT_LOG, yang
   sekarang selalu kosong). Semua fungsi di bawah selalu mengikuti filter
   aktif (bulan/tanggal/shift/pit/fleet/unit) — tidak ada angka statis. */

// OB (Overburden, BCM) dan CO (Coal, Ton) tidak pernah dijumlah jadi satu
// angka karena satuannya berbeda — konsisten dengan konvensi yang sudah
// dipakai di Overview/Production/Grade Control. Reports memilih SATU
// stream utama secara otomatis (stream dengan volume Actual terbesar pada
// data hasil filter saat ini) supaya Plan vs Actual, Production per Fleet,
// Fuel Ratio, dan KPI Summary selalu konsisten satu sama lain.
const REPORT_STREAM_META = {
  OB_PRODUCTION:{ label:'Overburden (OB)', unit:'BCM' },
  CO_PRODUCTION:{ label:'Batubara (CO)', unit:'Ton' }
};
function reportPickPrimaryStream(data){
  const totals = Object.keys(REPORT_STREAM_META).map(s=> ({ stream:s, actual:U.sum(data.filter(r=>r.stream===s),'productionVolume') }));
  totals.sort((a,b)=> b.actual-a.actual);
  return (totals[0] && totals[0].actual>0) ? totals[0].stream : 'OB_PRODUCTION';
}

/* 1) Plan vs Actual Production — chart rp_c_plan + KPI Summary + narasi. */
function computeReportsPlanActual(data){
  const plan = getFilteredPlan();
  const stream = reportPickPrimaryStream(data);
  const meta = REPORT_STREAM_META[stream];
  const actualRows = data.filter(r=>r.stream===stream);
  const planRows = plan.filter(p=>p.stream===stream);
  const byDateActual = U.groupBy(actualRows, r=>r.date);
  const byDatePlan = U.groupBy(planRows, p=>p.date);
  const dates = uniqueSorted([...new Set([...byDateActual.keys(), ...byDatePlan.keys()])]);
  const actualSeries = dates.map(d=> U.round(U.sum(byDateActual.get(d)||[],'productionVolume'),0));
  const planSeries = dates.map(d=> U.round(U.sum(byDatePlan.get(d)||[],'targetVolume'),0));
  const totalActual = actualSeries.reduce((a,b)=>a+b,0);
  const totalPlan = planSeries.reduce((a,b)=>a+b,0);
  const achievement = totalPlan ? (totalActual/totalPlan*100) : 0;
  const variance = totalActual - totalPlan;
  return { stream, meta, dates, actualSeries, planSeries, totalActual, totalPlan, achievement, variance };
}
function computePlanActualNarrative(data){
  const periode = reportPeriodText();
  const r = computeReportsPlanActual(data);
  if(!r.dates.length){
    return `Selama periode ${periode}, tidak terdapat data Plan maupun Actual produksi yang tersedia sesuai filter yang dipilih.`;
  }
  const arah = r.variance>=0 ? 'lebih tinggi' : 'lebih rendah';
  return `Selama periode ${periode}, Plan produksi ${r.meta.label} ditetapkan sebesar ${U.fmt(r.totalPlan,0)} ${r.meta.unit}, sedangkan Actual tercatat ${U.fmt(r.totalActual,0)} ${r.meta.unit} dengan Achievement ${U.fmt(r.achievement,1)}%. `
       + `Actual ${arah} ${U.fmt(Math.abs(r.variance),0)} ${r.meta.unit} dibandingkan Plan.`;
}

/* 2) Production per Fleet — chart rp_c_fleet + narasi. Memakai stream utama
   yang sama dengan Plan vs Actual supaya satuannya tetap konsisten. */
function computeFleetProduction(data){
  const stream = reportPickPrimaryStream(data);
  const meta = REPORT_STREAM_META[stream];
  const rows = data.filter(r=>r.stream===stream);
  const byFleet = U.groupBy(rows, r=>r.fleet||'-');
  const arr = [...byFleet.entries()].map(([f,g])=>({fleet:f, value:U.round(U.sum(g,'productionVolume'),0)})).sort((a,b)=>b.value-a.value);
  const total = arr.reduce((a,r)=>a+r.value,0);
  return { stream, meta, arr, total };
}
function computeFleetNarrative(data){
  const periode = reportPeriodText();
  const r = computeFleetProduction(data);
  if(!r.arr.length || r.total<=0){
    return `Selama periode ${periode}, tidak terdapat data produksi per fleet yang tersedia sesuai filter yang dipilih.`;
  }
  const terbesar = r.arr[0], terkecil = r.arr[r.arr.length-1];
  const pctBesar = r.total ? (terbesar.value/r.total*100) : 0;
  const pctKecil = r.total ? (terkecil.value/r.total*100) : 0;
  return `Selama periode ${periode}, total produksi ${r.meta.label} dari seluruh fleet mencapai ${U.fmt(r.total,0)} ${r.meta.unit}. `
       + `Kontributor terbesar adalah fleet ${terbesar.fleet} dengan ${U.fmt(terbesar.value,0)} ${r.meta.unit} (${U.fmt(pctBesar,1)}% dari total), `
       + `sedangkan kontributor terkecil adalah fleet ${terkecil.fleet} dengan ${U.fmt(terkecil.value,0)} ${r.meta.unit} (${U.fmt(pctKecil,1)}% dari total).`;
}

/* 3) UA & PA — chart rp_c_paua + narasi. Dari unit_status_actual, sama
   persis dengan logika PA/UA di Overview/Equipment (computePAUA()). */
function computeUAPASeries(){
  const statusRows = getFilteredUnitStatus();
  const delayRowsAll = getFilteredDelay();
  const idleRowsAll = getFilteredIdle();
  // [PA/UA FIX v2 2026-09] group delay/idle per tanggal juga, supaya tanggal yang unit-shift-nya
  // 100% Idle/Delay (tidak ada baris di statusRows sama sekali untuk tanggal itu) tetap muncul di
  // deret PA/UA harian, bukan hilang dari sumbu X chart.
  const byDate = U.groupBy(statusRows, s=>s.date);
  const byDateDelay = U.groupBy(delayRowsAll, d=>d.date);
  const byDateIdle = U.groupBy(idleRowsAll.filter(i=>i.scope==='UNIT'), i=>i.date);
  const dates = uniqueSorted([...new Set([...byDate.keys(), ...byDateDelay.keys(), ...byDateIdle.keys()])]);
  const paSeries = dates.map(d=> U.round(computePAUA(byDate.get(d)||[], byDateDelay.get(d)||[], byDateIdle.get(d)||[]).pa,1));
  const uaSeries = dates.map(d=> U.round(computePAUA(byDate.get(d)||[], byDateDelay.get(d)||[], byDateIdle.get(d)||[]).ua,1));
  const overall = computePAUA(statusRows, delayRowsAll, idleRowsAll);
  return { dates, paSeries, uaSeries, overall };
}
function computeUAPANarrative(){
  const periode = reportPeriodText();
  const r = computeUAPASeries();
  if(!r.dates.length){
    return `Selama periode ${periode}, tidak terdapat data status unit (PA/UA) yang tersedia sesuai filter yang dipilih.`;
  }
  const { pa, ua } = r.overall;
  const paNote = pa>=80 ? 'tergolong baik' : pa>=70 ? 'tergolong cukup dan perlu perhatian pada jam Breakdown' : 'tergolong rendah dan mengindikasikan tingginya jam Breakdown';
  const uaNote = ua>=80 ? 'menunjukkan unit yang tersedia sudah dimanfaatkan secara optimal' : ua>=70 ? 'menunjukkan pemanfaatan unit yang tersedia masih bisa ditingkatkan' : 'menunjukkan unit yang tersedia belum dimanfaatkan optimal';
  return `Selama periode ${periode}, rata-rata Physical Availability (PA) tercatat ${U.fmt(pa,1)}% dan Use of Availability (UA) tercatat ${U.fmt(ua,1)}%. `
       + `Nilai PA tersebut ${paNote}, sedangkan nilai UA ${uaNote}.`;
}

/* 4) Fuel Ratio — chart rp_c_fuelratio + narasi. Memakai computeFuelRatios()
   yang sama persis dengan halaman Fuel (fuel_actual dipasangkan dengan
   production_actual; OB = L/BCM, Coal = L/Ton, tidak pernah dicampur). */
/* [FUEL-DAILY 2026-09] Fuel Ratio HARIAN untuk chart rp_c_fuelratio — dipecah
   per tanggal memakai fuelRows/prodRows yang SAMA (hasil filter aktif) dengan
   computeFuelRatios() di atas, hanya dikelompokkan per hari alih-alih
   dijumlah total sebulan. OB (L/BCM) dan Coal (L/Ton) tetap dua seri
   terpisah (tidak pernah dicampur), dan hari tanpa pasangan fuel+produksi
   untuk stream tsb diberi nilai null (bukan 0) supaya titik itu tidak
   digambar sebagai "Fuel Ratio = 0" yang menyesatkan — line chart akan
   melompati (spanGaps) titik null tersebut. */
function computeFuelRatioDailySeries(fuelRows, prodRows){
  const byDateFuel = U.groupBy(fuelRows, f=>f.date);
  const byDateProd = U.groupBy(prodRows, r=>r.date);
  const dates = uniqueSorted([...new Set([...byDateFuel.keys(), ...byDateProd.keys()])]);
  const obSeries = [], coalSeries = [];
  dates.forEach(d=>{
    const r = computeFuelRatios(byDateFuel.get(d)||[], byDateProd.get(d)||[]);
    obSeries.push(r.ob.vol>0 ? U.round(r.ob.ratio,4) : null);
    coalSeries.push(r.coal.vol>0 ? U.round(r.coal.ratio,4) : null);
  });
  return { dates, obSeries, coalSeries };
}
function computeReportsFuelRatio(data){
  const fuelRows = getFilteredFuel();
  const totalFuel = U.sum(fuelRows,'fuelLiters');
  const ratios = computeFuelRatios(fuelRows, data);
  const daily = computeFuelRatioDailySeries(fuelRows, data);
  return { totalFuel, ratios, daily };
}
function computeFuelRatioNarrative(data){
  const periode = reportPeriodText();
  const r = computeReportsFuelRatio(data);
  if(!r.totalFuel){
    return `Selama periode ${periode}, tidak terdapat data konsumsi bahan bakar yang tersedia sesuai filter yang dipilih.`;
  }
  const parts = [`Selama periode ${periode}, total konsumsi bahan bakar seluruh equipment (Digger, Hauler, dan Support) mencapai ${U.fmt(r.totalFuel,0)} Liter.`];
  if(r.ratios.ob.vol>0){
    parts.push(`Untuk produksi Overburden, total fuel yang terpakai sebesar ${U.fmt(r.ratios.ob.fuel,0)} Liter dengan total produksi ${U.fmt(r.ratios.ob.vol,0)} BCM, sehingga Fuel Ratio OB mencapai ${U.fmt(r.ratios.ob.ratio,4)} L/BCM.`);
  }
  if(r.ratios.coal.vol>0){
    parts.push(`Untuk produksi Batubara, total fuel sebesar ${U.fmt(r.ratios.coal.fuel,0)} Liter dengan total produksi ${U.fmt(r.ratios.coal.vol,0)} Ton, sehingga Fuel Ratio Coal mencapai ${U.fmt(r.ratios.coal.ratio,4)} L/Ton.`);
  }
  return parts.join(' ');
}

/* 5) Equipment Status (WORK/STANDBY/BREAKDOWN) — chart rp_c_equipstatus +
   narasi. Dari unit_status_actual (getFilteredUnitStatus()). */
function computeEquipmentStatusDist(){
  const statusRows = getFilteredUnitStatus();  const cats = ['Working','Standby','Breakdown'];
  const byStatus = U.groupBy(statusRows, s=>s.status);
  const hours = cats.map(c=> U.round(U.sum(byStatus.get(c)||[],'durationHours'),1));
  const total = hours.reduce((a,b)=>a+b,0);
  return { cats, hours, total };
}
function computeEquipmentStatusNarrative(){
  const periode = reportPeriodText();
  const r = computeEquipmentStatusDist();
  if(!r.total){
    return `Selama periode ${periode}, tidak terdapat data status equipment yang tersedia sesuai filter yang dipilih.`;
  }
  const pct = r.hours.map(h=> r.total ? h/r.total*100 : 0);
  const labelsID = ['WORK','STANDBY','BREAKDOWN (BD)'];
  const detail = labelsID.map((l,i)=> `${l} ${U.fmt(r.hours[i],1)} jam (${U.fmt(pct[i],1)}%)`).join(', ');
  const bdPct = pct[2];
  const kondisi = bdPct>15 ? 'tingkat Breakdown tergolong tinggi dan perlu perhatian maintenance segera' : bdPct>8 ? 'tingkat Breakdown masih dalam batas wajar namun tetap perlu dipantau' : 'kondisi equipment secara umum baik dengan tingkat Breakdown rendah';
  return `Selama periode ${periode}, distribusi status equipment tercatat: ${detail}. Kondisi equipment secara umum menunjukkan ${kondisi}.`;
}

/* KPI Summary Report — satu source of truth dipakai bersama halaman Report
   (angka saja, tanpa narasi panjang) dan Export PDF (angka + narasi). 12
   KPI (Plan/Actual/Achievement/Variance, UA, PA, Fuel, Fuel
   Ratio, Total Equipment, Work, Standby, BD) dihitung ulang setiap
   dipanggil sehingga selalu sinkron dengan filter aktif dan tidak pernah
   kosong selama datanya tersedia. */
function computeReportsKPI(data){
  const planActual = computeReportsPlanActual(data);
  const fleetProd = computeFleetProduction(data);
  const uapa = computeUAPASeries();
  const fuelR = computeReportsFuelRatio(data);
  const equipStatus = computeEquipmentStatusDist();
  const fuelRatioValue = planActual.stream==='OB_PRODUCTION' ? fuelR.ratios.ob.ratio : fuelR.ratios.coal.ratio;
  const fuelRatioUnit = planActual.stream==='OB_PRODUCTION' ? 'L/BCM' : 'L/Ton';
  return { planActual, fleetProd, uapa, fuelR, equipStatus, totalEquipment:UNITS.length, fuelRatioValue, fuelRatioUnit };
}

/* Ringkasan Eksekutif — dibuat otomatis murni dari `data` hasil getFiltered()
   yang sedang aktif, merangkum insight dari SELURUH grafik Reports (Plan vs
   Actual, Production per Fleet, UA & PA, Fuel Ratio, Equipment Status).
   Tidak ada angka statis — setiap nilai dihitung ulang setiap dipanggil.
   HANYA dipakai saat Export PDF — tidak pernah dirender di halaman Report
   itu sendiri. */
function computeExecutiveSummary(data){
  const periode = reportPeriodText();
  const kpi = computeReportsKPI(data);
  if(!kpi.planActual.dates.length && !kpi.uapa.dates.length && !kpi.fuelR.totalFuel){
    return `Selama periode ${periode}, tidak terdapat data operasional yang tersedia sesuai filter yang dipilih. Informasi detail disajikan pada grafik di setiap halaman laporan.`;
  }
  const pa = kpi.planActual, ua = kpi.uapa.overall;
  const fleetTerbaik = kpi.fleetProd.arr.length ? kpi.fleetProd.arr[0].fleet : '-';
  const arah = pa.variance>=0 ? 'melampaui' : 'berada di bawah';
  return `Selama periode ${periode}, produksi ${pa.meta.label} mencapai ${U.fmt(pa.totalActual,0)} ${pa.meta.unit} dari Plan ${U.fmt(pa.totalPlan,0)} ${pa.meta.unit} (Achievement ${U.fmt(pa.achievement,1)}%); Actual ${arah} Plan sebesar ${U.fmt(Math.abs(pa.variance),0)} ${pa.meta.unit}, dengan kontributor produksi terbesar berasal dari fleet ${fleetTerbaik}. `
       + `Rata-rata Physical Availability (PA) tercatat ${U.fmt(ua.pa,1)}% dan Use of Availability (UA) ${U.fmt(ua.ua,1)}%. `
       + `Total konsumsi bahan bakar mencapai ${U.fmt(kpi.fuelR.totalFuel,0)} Liter dengan Fuel Ratio ${pa.meta.label} sebesar ${U.fmt(kpi.fuelRatioValue,4)} ${kpi.fuelRatioUnit}. `
       + `Distribusi status equipment: WORK ${U.fmt(kpi.equipStatus.hours[0],1)} jam, STANDBY ${U.fmt(kpi.equipStatus.hours[1],1)} jam, BREAKDOWN ${U.fmt(kpi.equipStatus.hours[2],1)} jam. `
       + `Informasi detail disajikan pada grafik di setiap halaman laporan.`;
}

function render_reports(data, el){
  const kpi = computeReportsKPI(data);
  const manpowerCount = new Set(data.map(r=>r.operator).filter(Boolean)).size;
  const equipmentSet = new Set();
  data.forEach(r=>{ if(r.digger) equipmentSet.add(r.digger); if(r.hauler) equipmentSet.add(r.hauler); });
  const equipmentCount = equipmentSet.size;
  const pitLabel = filters.pit==='all' ? 'Seluruh Pit' : filters.pit;
  const shiftLabel = filters.shift==='all' ? 'Seluruh Shift' : filters.shift;
  const today = new Date();

  const editable = (key, fallback)=> `<span class="rpt-editable" contenteditable="true" data-meta-key="${key}" oninput="setReportMeta('${key}', this.innerText)" onblur="setReportMeta('${key}', this.innerText)">${(REPORT_META[key] ?? fallback ?? '')}</span>`;

  el.innerHTML = `
  ${pitFilterCaveatHTML()}
  <div class="glass p-5 mb-4 no-print">
    <div class="panel-title mb-2">Laporan Resmi Operasional</div>
    <div class="panel-sub mb-3">Dokumen ini mengikuti format laporan resmi perusahaan tambang. Isi kolom bergaris putus-putus (klik untuk edit) sebelum mengekspor — nilainya tersimpan otomatis di perangkat ini untuk laporan berikutnya.</div>
    <div class="flex flex-wrap gap-2">
      <button class="btn btn-accent" onclick="exportReportPDF()">📄 Export PDF</button>
      <button class="btn" onclick="window.print()">🖨️ Print Laporan</button>
    </div>
  </div>

  <div id="reportCapture">
  <div class="rpt-doc" id="rptDocRoot">

    <!-- ================= HEADER ================= -->
    <div class="rpt-header">
      <div class="rpt-logo-row">
        ${COMPANY_PROFILE.logoDataUrl
          ? `<img src="${COMPANY_PROFILE.logoDataUrl}" class="rpt-logo-box" style="object-fit:contain;background:#fff;" alt="Logo perusahaan">`
          : `<div class="rpt-logo-box">${esc(COMPANY_PROFILE.logoInitials||'CO')}</div>`}
        <div>
          <div class="rpt-company-name">${cval(COMPANY_PROFILE.name,'Nama Perusahaan')}</div>
          <div class="rpt-company-meta">
            ${cval(COMPANY_PROFILE.address,'Alamat perusahaan')}<br>
            ${cval(COMPANY_PROFILE.city,'Kota')}${COMPANY_PROFILE.province ? ', '+esc(COMPANY_PROFILE.province) : ''} ${esc(COMPANY_PROFILE.postalCode||'')}<br>
            ${cval(COMPANY_PROFILE.website,'website perusahaan')} &middot; ${cval(COMPANY_PROFILE.email,'email perusahaan')}<br>
            ${cval(COMPANY_PROFILE.phone,'No. telepon')}
          </div>
        </div>
      </div>

      <div class="rpt-center">
        <div class="rpt-title">${editable('docTitle')}</div>
        <div class="rpt-sub">
          ${editable('siteName')} &mdash; ${editable('projectName')}<br>
          ${U.dateLong(today)} &middot; Shift: ${shiftLabel} &middot; Periode: ${reportPeriodText()}
        </div>
      </div>

      <div class="rpt-doc-meta">
        <div class="rpt-doc-meta-row"><span>No. Dokumen</span>${editable('docNumber')}</div>
        <div class="rpt-doc-meta-row"><span>No. Revisi</span>${editable('revisionNumber')}</div>
        <div class="rpt-doc-meta-row"><span>Tgl. Cetak</span><span>${U.dateLong(today)}</span></div>
        <div class="rpt-doc-meta-row"><span>Dibuat oleh</span>${editable('preparedByName')}</div>
        <div class="rpt-doc-meta-row"><span>Diperiksa oleh</span>${editable('checkedByName')}</div>
        <div class="rpt-doc-meta-row"><span>Disetujui oleh</span>${editable('approvedByName')}</div>
      </div>
    </div>
    <div class="rpt-divider"></div>

    <!-- ================= INFO RINGKAS ================= -->
    <div class="rpt-info-grid">
      <div class="rpt-info-item"><label>Mine Site</label><div class="val">${editable('mineSite')}</div></div>
      <div class="rpt-info-item"><label>Pit</label><div class="val">${pitLabel}</div></div>
      <div class="rpt-info-item"><label>Contractor</label><div class="val">${editable('contractor')}</div></div>
      <div class="rpt-info-item"><label>Client</label><div class="val">${editable('client')}</div></div>
      <div class="rpt-info-item"><label>Weather</label><div class="val rpt-editable" contenteditable="true" oninput="setReportMeta('weather', this.innerText)" onblur="setReportMeta('weather', this.innerText)">${REPORT_META.weather}</div></div>
      <div class="rpt-info-item"><label>Shift</label><div class="val">${shiftLabel}</div></div>
      <div class="rpt-info-item"><label>Superintendent</label><div class="val">${editable('superintendent')}</div></div>
      <div class="rpt-info-item"><label>Pit Control</label><div class="val">${editable('pitControl')}</div></div>
      <div class="rpt-info-item"><label>Engineer</label><div class="val">${editable('engineer')}</div></div>
      <div class="rpt-info-item"><label>Total Manpower</label><div class="val">${manpowerCount} orang <span style="color:#8A97A6;font-weight:500;font-size:9.5px">(operator aktif)</span></div></div>
      <div class="rpt-info-item"><label>Total Equipment</label><div class="val">${equipmentCount} unit <span style="color:#8A97A6;font-weight:500;font-size:9.5px">(unit aktif)</span></div></div>
      <div class="rpt-info-item"><label>Report Status</label><div class="val">
        <select class="filter-select" style="min-width:0; padding:2px 6px; font-size:11px;" onchange="setReportMeta('reportStatus', this.value); this.blur();">
          ${['Draft','Final','Approved'].map(s=>`<option value="${s}" ${REPORT_META.reportStatus===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div></div>
    </div>

    <!-- ================= KPI SUMMARY ================= -->
    <div class="rpt-section-title">KPI Summary</div>
    <div class="rpt-kpi-grid">
      <div class="rpt-kpi"><label>Plan — Mine Plan (${kpi.planActual.meta.label})</label><div class="v">${U.fmt(kpi.planActual.totalPlan,0)}<span class="u">${kpi.planActual.meta.unit}</span></div></div>
      <div class="rpt-kpi"><label>Production Actual (${kpi.planActual.meta.label})</label><div class="v">${U.fmt(kpi.planActual.totalActual,0)}<span class="u">${kpi.planActual.meta.unit}</span></div></div>
      <div class="rpt-kpi"><label>Achievement</label><div class="v" style="color:${kpi.planActual.achievement>=100?'#1F8A44':'#B4530A'}">${U.fmt(kpi.planActual.achievement,1)}<span class="u">%</span></div></div>
      <div class="rpt-kpi"><label>Variance</label><div class="v" style="color:${kpi.planActual.variance>=0?'#1F8A44':'#B4530A'}">${kpi.planActual.variance>=0?'+':''}${U.fmt(kpi.planActual.variance,0)}<span class="u">${kpi.planActual.meta.unit}</span></div></div>
      <div class="rpt-kpi"><label>UA (Use of Availability)</label><div class="v">${U.fmt(kpi.uapa.overall.ua,1)}<span class="u">%</span></div></div>
      <div class="rpt-kpi"><label>PA (Physical Availability)</label><div class="v">${U.fmt(kpi.uapa.overall.pa,1)}<span class="u">%</span></div></div>
      <div class="rpt-kpi"><label>Total Fuel</label><div class="v">${U.fmt(kpi.fuelR.totalFuel,0)}<span class="u">L</span></div></div>
      <div class="rpt-kpi"><label>Fuel Ratio (${kpi.planActual.meta.label})</label><div class="v">${U.fmt(kpi.fuelRatioValue,4)}<span class="u">${kpi.fuelRatioUnit}</span></div></div>
      <div class="rpt-kpi"><label>Total Equipment</label><div class="v">${kpi.totalEquipment}<span class="u">unit</span></div></div>
      <div class="rpt-kpi"><label>Work</label><div class="v" style="color:#1F8A44">${U.fmt(kpi.equipStatus.hours[0],1)}<span class="u">jam</span></div></div>
      <div class="rpt-kpi"><label>Standby</label><div class="v" style="color:#B4530A">${U.fmt(kpi.equipStatus.hours[1],1)}<span class="u">jam</span></div></div>
      <div class="rpt-kpi"><label>Breakdown (BD)</label><div class="v" style="color:#C0392B">${U.fmt(kpi.equipStatus.hours[2],1)}<span class="u">jam</span></div></div>
    </div>

    <!-- ================= GRAFIK ================= -->
    <div class="rpt-section-title">Grafik Kinerja Operasional</div>
    <div class="rpt-chart-grid">
      <div class="rpt-chart-card full"><div class="t">Plan vs Actual Production<span class="sub">${kpi.planActual.meta.label} &middot; ${reportPeriodText()}</span></div><div class="rpt-chart-canvas"><canvas id="rp_c_plan"></canvas></div><div class="rpt-chart-narrative">${esc(computePlanActualNarrative(data))}</div></div>
      <div class="rpt-chart-card"><div class="t">Production per Fleet<span class="sub">${kpi.fleetProd.meta.label}</span></div><div class="rpt-chart-canvas"><canvas id="rp_c_fleet"></canvas></div><div class="rpt-chart-narrative">${esc(computeFleetNarrative(data))}</div></div>
      <div class="rpt-chart-card"><div class="t">UA &amp; PA</div><div class="rpt-chart-canvas"><canvas id="rp_c_paua"></canvas></div><div class="rpt-chart-narrative">${esc(computeUAPANarrative())}</div></div>
      <div class="rpt-chart-card"><div class="t">Fuel Ratio</div><div class="rpt-chart-canvas"><canvas id="rp_c_fuelratio"></canvas></div><div class="rpt-chart-narrative">${esc(computeFuelRatioNarrative(data))}</div></div>
      <div class="rpt-chart-card"><div class="t">Equipment Status</div><div class="rpt-chart-canvas"><canvas id="rp_c_equipstatus"></canvas></div><div class="rpt-chart-narrative">${esc(computeEquipmentStatusNarrative())}</div></div>
    </div>

    <!-- ================= FOOTER / TANDA TANGAN ================= -->
    <div class="rpt-section-title">Pengesahan</div>
    <div class="rpt-sign-grid">
      <div class="rpt-sign-box">
        <div class="rpt-sign-role">Disiapkan oleh</div>
        <div class="rpt-sign-space"></div>
        <div style="font-weight:700">${editable('preparedByName')}</div>
        <div class="rpt-sign-meta">${editable('preparedByTitle')} &middot; ${U.dateLong(today)}</div>
      </div>
      <div class="rpt-sign-box">
        <div class="rpt-sign-role">Diperiksa oleh</div>
        <div class="rpt-sign-space"></div>
        <div style="font-weight:700">${editable('checkedByName')}</div>
        <div class="rpt-sign-meta">${editable('checkedByTitle')} &middot; ${U.dateLong(today)}</div>
      </div>
      <div class="rpt-sign-box">
        <div class="rpt-sign-role">Disetujui oleh</div>
        <div class="rpt-sign-space"></div>
        <div style="font-weight:700">${editable('approvedByName')}</div>
        <div class="rpt-sign-meta">${editable('approvedByTitle')} &middot; ${U.dateLong(today)}</div>
      </div>
    </div>

    <div class="rpt-footer-note">
      <span>${REPORT_META.docNumber} &middot; ${REPORT_META.revisionNumber} &middot; Dicetak ${U.dateLong(today)}</span>
      <span>Nomor halaman otomatis ditambahkan saat export PDF</span>
    </div>

  </div>
  </div>
  `;

  // ---- Charts (theme-independent "paper" styling via reportChartOpts) ----
  // 5 visualisasi sesuai kebutuhan Reports: Plan vs Actual Production,
  // Production per Fleet, UA & PA, Fuel Ratio, Equipment Status — plus KPI
  // Summary di atas. Semua sumber datanya sama dengan `kpi` yang sudah
  // dihitung di awal fungsi ini (single source of truth, ikut filter aktif).

  // 1) Plan vs Actual Production — line, value label di setiap titik.
  {
    const r = kpi.planActual;
    const labels = r.dates.map(d=>U.dateShort(new Date(d+'T00:00:00')));
    const xAxisTickOpts = dateAxisTickOptions(labels.length);
    makeChart('rp_c_plan',{type:'line', data:{labels, datasets:[
      {label:`Actual (${r.meta.unit})`, data:r.actualSeries, borderColor:'#12213A', backgroundColor:'rgba(18,33,58,.10)', fill:true, tension:.3, pointRadius:2, pointBackgroundColor:'#12213A', borderWidth:2,
        datalabels: lineDatalabels({color:'#12213A'})},
      {label:`Plan (${r.meta.unit})`, data:r.planSeries, borderColor:'#C9A13B', borderDash:[5,4], tension:.3, pointRadius:2, pointBackgroundColor:'#C9A13B', borderWidth:2,
        datalabels: lineDatalabels({color:'#8A6B1E'})}
    ]}, options:reportChartOpts({
      layout:{ padding:{ left:18, right:18 } },
      scales:{ y:{ grace:'12%', beginAtZero:true }, x:{ offset:true, ticks:xAxisTickOpts } },
      plugins:{ legend:{ position:'top', align:'center', labels:{ boxWidth:12, boxHeight:12, padding:16, font:{size:10.5} } } }
    })});
  }

  // 2) Production per Fleet — bar, value printed above each bar.
  {
    const r = kpi.fleetProd;
    makeChart('rp_c_fleet',{type:'bar', data:{labels:r.arr.map(x=>x.fleet), datasets:[
      {label:`Produksi (${r.meta.unit})`, data:r.arr.map(x=>x.value), backgroundColor:'#2B6CB0', borderRadius:5, maxBarThickness:56,
        datalabels: barDatalabels({decimals:0})}
    ]}, options:reportChartOpts({layout:{padding:{top:22}}})});
  }

  // 3) UA & PA — line trend harian, dari unit_status_actual.
  {
    const r = kpi.uapa;
    const labels = r.dates.map(d=>U.dateShort(new Date(d+'T00:00:00')));
    const xAxisTickOpts = dateAxisTickOptions(labels.length);
    makeChart('rp_c_paua',{type:'line', data:{labels, datasets:[
      {label:'PA (%)', data:r.paSeries, borderColor:'#1F8A44', backgroundColor:'rgba(31,138,68,.10)', fill:true, tension:.3, pointRadius:2, pointBackgroundColor:'#1F8A44', borderWidth:2,
        datalabels: lineDatalabels({color:'#1F8A44', decimals:1, suffix:'%'})},
      {label:'UA (%)', data:r.uaSeries, borderColor:'#6366F1', tension:.3, pointRadius:2, pointBackgroundColor:'#6366F1', borderWidth:2,
        datalabels: lineDatalabels({color:'#4338CA', decimals:1, suffix:'%'})}
    ]}, options:reportChartOpts({
      layout:{ padding:{ left:18, right:18 } },
      scales:{ y:{ grace:'12%', beginAtZero:true, suggestedMax:110 }, x:{ offset:true, ticks:xAxisTickOpts } },
      plugins:{ legend:{ position:'top', align:'center', labels:{ boxWidth:12, boxHeight:12, padding:16, font:{size:10.5} } } }
    })});
  }

  // 4) Fuel Ratio — trend HARIAN (bukan satu angka ringkasan bulanan): X-axis
  //    tanggal, Y-axis Fuel Ratio (L/BCM untuk OB, L/Ton untuk Coal), dari
  //    kpi.fuelR.daily yang sama persis dengan dataset hasil filter aktif
  //    yang dipakai KPI Summary & narasi (single source of truth, tidak ada
  //    data dummy). Mengikuti pola visual line chart tanggal yang sama
  //    dengan Plan vs Actual / UA & PA (dateAxisTickOptions, tooltip, dsb).
  {
    const r = kpi.fuelR.daily;
    const labels = r.dates.map(d=>U.dateShort(new Date(d+'T00:00:00')));
    const xAxisTickOpts = dateAxisTickOptions(labels.length);
    const hasOB = r.obSeries.some(v=>v!==null);
    const hasCoal = r.coalSeries.some(v=>v!==null);
    const datasets = [];
    if(hasOB){
      datasets.push({label:'Overburden (L/BCM)', data:r.obSeries, spanGaps:true,
        borderColor:'#F5A524', backgroundColor:'rgba(245,165,36,.12)', fill:true, tension:.3,
        pointRadius:2, pointBackgroundColor:'#F5A524', borderWidth:2,
        datalabels: lineDatalabels({color:'#8A6B1E', decimals:2})});
    }
    if(hasCoal){
      datasets.push({label:'Coal (L/Ton)', data:r.coalSeries, spanGaps:true,
        borderColor:'#22D3EE', backgroundColor:'rgba(34,211,238,.12)', fill:true, tension:.3,
        pointRadius:2, pointBackgroundColor:'#0E7490', borderWidth:2,
        datalabels: lineDatalabels({color:'#0E7490', decimals:2})});
    }
    if(!datasets.length){
      // Tidak ada data fuel/produksi yang cocok sama sekali pada filter aktif
      // saat ini — tampilkan sumbu kosong (bukan data dummy) apa adanya.
      datasets.push({label:'Fuel Ratio', data:[], borderColor:'#F5A524', backgroundColor:'rgba(245,165,36,.12)'});
    }
    makeChart('rp_c_fuelratio',{type:'line', data:{labels, datasets}, options:reportChartOpts({
      layout:{ padding:{ left:18, right:18 } },
      scales:{ y:{ grace:'12%', beginAtZero:true, title:{ display:true, text:'L/BCM · L/Ton', color:'#8A97A6', font:{size:9} } }, x:{ offset:true, ticks:xAxisTickOpts } },
      plugins:{
        legend:{ display: datasets.length>1, position:'top', align:'center', labels:{ boxWidth:12, boxHeight:12, padding:16, font:{size:10.5} } },
        tooltip:{ callbacks:{ label:(ctx)=> `${ctx.dataset.label}: ${U.fmt(ctx.parsed.y,4)}` } }
      }
    })});
  }

  // 5) Equipment Status — donut WORK/STANDBY/BREAKDOWN (BD), dari
  //    unit_status_actual, name + actual jam + %.
  {
    const r = kpi.equipStatus;
    makeChart('rp_c_equipstatus',{type:'doughnut', data:{labels:['WORK','STANDBY','BREAKDOWN (BD)'], datasets:[
      {data:r.hours, backgroundColor:[STATUS_COLOR.Working, STATUS_COLOR.Standby, STATUS_COLOR.Breakdown], borderColor:'#FFFFFF', borderWidth:2,
        datalabels: pieDatalabels({unit:'jam', decimals:1})}
    ]}, options:{responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{position:'bottom', labels:{color:'#333B44', font:{size:9.5}, boxWidth:10}}, tooltip:{backgroundColor:'#12213A'}, datalabels:{} }
    }});
  }
}

/* Export PDF — "Satu Grafik = Satu Halaman" pagination.
   Halaman 1  : Header perusahaan + Info Report (rpt-header) + Ringkasan
                Informasi (rpt-info-grid) + KPI Summary.
   Halaman 2-6: satu halaman khusus per grafik (judul besar + grafik
                diperbesar penuh, tidak pernah dipotong, selalu mulai dari
                atas halaman baru): Plan vs Actual Production, Production
                per Fleet, UA & PA, Fuel Ratio, Equipment Status. Setiap
                grafik disertai narasi otomatis singkat di bawahnya
                (Plan/Actual/Achievement/Variance, fleet terbesar/terkecil,
                interpretasi PA/UA, Fuel Ratio, dan kondisi equipment).
   Halaman terakhir: Ringkasan Eksekutif (Executive Summary) otomatis yang
                dirangkum dari seluruh grafik di atas — TIDAK pernah
                dirender di halaman Report itu sendiri, hanya muncul di
                PDF — lalu Catatan, lalu Pengesahan (Approval & Tanda
                Tangan).
   Header perusahaan + footer + nomor halaman "Halaman X dari N" tetap
   digambar ulang di setiap halaman, dengan resolusi capture tinggi supaya
   grafik tetap tajam saat dicetak. Dokumen ini murni visual — tidak ada
   lagi tabel data mentah, semua angka sudah terbaca langsung dari grafik
   dan KPI Summary. */
async function exportReportPDF(){
  // Selalu re-render halaman Report tepat sebelum capture, memakai data hasil
  // filter yang sedang aktif saat ini (getFiltered() dipanggil ulang di
  // dalam renderPage()/render_reports()) — supaya grafik, KPI, dan narasi
  // otomatis di PDF tidak pernah memakai data/cache lama, walau filter baru
  // saja diubah oleh pengguna.
  if(currentPage === 'reports' && typeof renderPage === 'function') renderPage();
  const root = document.getElementById('rptDocRoot');
  if(!root){ alert('Buka halaman Reports terlebih dahulu.'); return; }
  if(typeof window.jspdf === 'undefined' || typeof html2canvas === 'undefined'){
    showToast('Pustaka PDF belum siap dimuat, coba lagi sesaat lagi.', 'error'); return;
  }
  // Data terbaru sesuai filter aktif — satu source of truth yang sama dipakai
  // grafik di layar; narasi otomatis di bawah dihitung dari data ini, bukan
  // dari angka statis.
  const freshData = getFiltered();

  // Hide interactive-only chrome (search box, pagination, sort hints) so the
  // exported PDF reads as a finished document, not a live app screenshot.
  const hideEls = root.querySelectorAll('.no-print');
  hideEls.forEach(n=>{ n.dataset._prevDisplay = n.style.display; n.style.display = 'none'; });
  const restore = ()=> hideEls.forEach(n=>{ n.style.display = n.dataset._prevDisplay || ''; });

  showToast('Membuat PDF, mohon tunggu...', 'info');

  try{
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('p','mm','a4');
    const PAGE_W = 210, PAGE_H = 297;
    const MARGIN_X = 12;
    const HEADER_H = 24;                 // reserved band at top of every page
    const FOOTER_H = 14;                 // reserved band at bottom of every page
    const CONTENT_W = PAGE_W - MARGIN_X*2;
    const CONTENT_TOP = HEADER_H + 4;
    const CONTENT_BOTTOM = PAGE_H - FOOTER_H;
    const MAX_CONTENT_H = CONTENT_BOTTOM - CONTENT_TOP;
    const printedAt = new Date();

    const drawHeader = ()=>{
      let xCursor = MARGIN_X;
      if(COMPANY_PROFILE.logoDataUrl){
        try{ pdf.addImage(COMPANY_PROFILE.logoDataUrl, 'PNG', xCursor, 5, 14, 14); xCursor += 18; }
        catch(e){ /* corrupt/unsupported image data — skip silently, text header still renders */ }
      }
      pdf.setFont('helvetica','bold'); pdf.setFontSize(10.5); pdf.setTextColor(18,33,58);
      pdf.text(COMPANY_PROFILE.name || 'Nama Perusahaan', xCursor, 11);
      pdf.setFont('helvetica','normal'); pdf.setFontSize(8); pdf.setTextColor(90,100,110);
      pdf.text(REPORT_META.docTitle || 'Laporan', xCursor, 16.5);
      pdf.setFontSize(7.5); pdf.setTextColor(90,100,110);
      pdf.text(`No. Dok: ${REPORT_META.docNumber||'-'}   |   Rev: ${REPORT_META.revisionNumber||'-'}`, PAGE_W-MARGIN_X, 11, { align:'right' });
      pdf.text(`Dicetak: ${U.dateLong(printedAt)}`, PAGE_W-MARGIN_X, 16.5, { align:'right' });
      pdf.setDrawColor(201,161,59); pdf.setLineWidth(0.6);
      pdf.line(MARGIN_X, HEADER_H-3, PAGE_W-MARGIN_X, HEADER_H-3);
    };
    const drawFooter = (pageNum)=>{
      pdf.setDrawColor(225,227,231); pdf.setLineWidth(0.3);
      pdf.line(MARGIN_X, PAGE_H-FOOTER_H+3, PAGE_W-MARGIN_X, PAGE_H-FOOTER_H+3);
      pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5); pdf.setTextColor(120,128,138);
      pdf.text(`${COMPANY_PROFILE.name||'-'}  ·  ${REPORT_META.docNumber||'-'}  ·  ${REPORT_META.revisionNumber||'-'}`, MARGIN_X, PAGE_H-FOOTER_H+8);
      pdf.text(`Halaman ${pageNum}`, PAGE_W-MARGIN_X, PAGE_H-FOOTER_H+8, { align:'right' }); // total is stamped in a 2nd pass below
    };

    let pageNum = 1;
    let y = CONTENT_TOP;
    drawHeader();
    drawFooter(pageNum);

    const goToNextPage = ()=>{ pdf.addPage(); pageNum++; drawHeader(); drawFooter(pageNum); y = CONTENT_TOP; };

    // Judul besar bergaya "section" di puncak halaman (dipakai untuk halaman
    // grafik & tabel) — tidak pernah diletakkan di akhir halaman karena selalu
    // digambar tepat setelah goToNextPage().
    const drawPageTitle = (text)=>{
      pdf.setFillColor(201,161,59);
      pdf.rect(MARGIN_X, y, 1.3, 6.5, 'F');
      pdf.setFont('helvetica','bold'); pdf.setFontSize(13.5); pdf.setTextColor(18,33,58);
      pdf.text(String(text).toUpperCase(), MARGIN_X+5, y+5);
      y += 12;
    };

    // Blok non-grafik (header, info report, KPI grid, tanda tangan) tetap
    // PNG — kontennya sebagian besar teks/garis solid dengan sedikit warna
    // unik, jadi PNG lossless di sini sudah kecil ukurannya sekaligus paling
    // tajam untuk teks. Scale 2.5x setara ±240dpi cetak, cukup tajam tanpa
    // beban ukuran berlebih.
    const captureBlock = async (el, scale=2.5)=>{
      const canvas = await html2canvas(el, { backgroundColor:'#FFFFFF', scale, useCORS:true });
      const imgW = CONTENT_W;
      const imgH = canvas.height * imgW / canvas.width;
      return { canvas, imgData: canvas.toDataURL('image/png'), imgW, imgH };
    };

    // Menempatkan satu block sebagai satu unit utuh; kalau tidak muat di sisa
    // halaman saat ini, pindah ke halaman baru dulu (dipakai untuk KPI/info).
    const placeBlockWhole = (block)=>{
      if(y + block.imgH > CONTENT_BOTTOM && y > CONTENT_TOP) goToNextPage();
      pdf.addImage(block.imgData, 'PNG', MARGIN_X, y, block.imgW, block.imgH, undefined, 'NONE');
      y += block.imgH + 4;
    };

    // Membesarkan grafik sebelum di-capture: ubah sementara tinggi wrapper
    // canvas Chart.js supaya rasio hasil capture pas mengisi ruang yang
    // tersedia di halaman (lebar penuh CONTENT_W), lalu kembalikan seperti
    // semula agar tampilan layar (dashboard) tidak berubah sama sekali.
    const captureChartEnlarged = async (chartCardEl, chartId, targetHeightMm)=>{
      const wrap = chartCardEl.querySelector(':scope > .rpt-chart-canvas');
      const originalHeight = wrap.style.height;
      const originalOverflow = wrap.style.overflow;
      const originalGridColumn = chartCardEl.style.gridColumn;
      // Beberapa kartu grafik duduk berdampingan dalam grid 2 kolom di layar
      // (setengah lebar) — kalau dibiarkan begitu saat di-capture, resolusi
      // piksel hasilnya otomatis ikut terpotong setengah dibanding kartu yang
      // sudah full-width, sehingga grafik itu tampak lebih buram/pecah saat
      // di-zoom di PDF. Di sini kartu dipaksa full-width dulu SEBELUM diukur
      // & di-capture, supaya kelima grafik selalu memakai resolusi piksel
      // yang sama tingginya, lalu dikembalikan seperti semula (tampilan
      // Reports di layar sama sekali tidak berubah).
      chartCardEl.style.gridColumn = '1 / -1';
      wrap.style.overflow = 'visible';
      const wPx = wrap.offsetWidth || 1;
      const targetHpx = Math.max(150, Math.round(wPx * (targetHeightMm / CONTENT_W)));
      wrap.style.height = targetHpx + 'px';
      const chart = chartInstances[chartId];
      // Use update('none') instead of resize() alone — this forces Chart.js to
      // fully re-run its legend layout pass at the new canvas size, so the
      // legend box width is recalculated (and never truncated/clipped)
      // rather than reusing stale measurements from the smaller on-screen size.
      if(chart){ chart.resize(); chart.update('none'); }
      await new Promise(r=> requestAnimationFrame(()=> requestAnimationFrame(r)));
      // Scale 3x sudah setara ±300dpi saat dicetak di A4 (lebih dari cukup
      // untuk garis/teks tetap tajam) — dinaikkan dari 4x sebelumnya yang
      // menghasilkan raster jauh lebih besar dari kebutuhan cetak sebenarnya
      // tanpa tambahan ketajaman yang terlihat.
      const CHART_CAPTURE_SCALE = 3;
      const canvas = await html2canvas(wrap, { backgroundColor:'#FFFFFF', scale:CHART_CAPTURE_SCALE, useCORS:true });
      wrap.style.height = originalHeight;
      wrap.style.overflow = originalOverflow;
      chartCardEl.style.gridColumn = originalGridColumn;
      if(chart){ chart.resize(); chart.update('none'); }
      let imgW = CONTENT_W;
      let imgH = canvas.height * imgW / canvas.width;
      if(imgH > targetHeightMm + 0.5){ // safety clamp — grafik tidak pernah melebihi ruang halaman
        const factor = targetHeightMm / imgH;
        imgH = targetHeightMm; imgW = imgW * factor;
      }
      // JPEG kualitas tinggi (0.93), bukan PNG — untuk konten chart (garis,
      // gradient fill, anti-aliasing) PNG lossless menyimpan jutaan warna unik
      // per piksel akibat anti-aliasing sehingga ukurannya bisa membengkak
      // puluhan kali lipat dibanding JPEG, padahal secara visual nyaris tidak
      // ada bedanya. Latar chart sudah dipaksa putih solid (backgroundColor:
      // '#FFFFFF' di html2canvas) sehingga JPEG (tanpa transparansi) aman
      // dipakai di sini. Kombinasi scale 3x + JPEG 0.93 inilah yang menjaga
      // grafik tetap tajam saat dicetak SEKALIGUS membuat ukuran file PDF
      // akhir realistis (beberapa MB–puluhan MB, bukan mendekati 200MB).
      return { imgData: canvas.toDataURL('image/jpeg', 0.93), imgFormat:'JPEG', imgW, imgH, compression:'NONE' };
    };

    // ================= HALAMAN 1 — Header, Info Report, Ringkasan Informasi, KPI Summary =================
    const headerBlock = await captureBlock(root.querySelector('.rpt-header'));
    placeBlockWhole(headerBlock);
    const infoBlock = await captureBlock(root.querySelector('.rpt-info-grid'));
    placeBlockWhole(infoBlock);
    const kpiTitleEl = Array.from(root.querySelectorAll('.rpt-section-title')).find(el=> /kpi/i.test(el.textContent));
    if(kpiTitleEl) placeBlockWhole(await captureBlock(kpiTitleEl));
    const kpiGridEl = root.querySelector('.rpt-kpi-grid');
    if(kpiGridEl) placeBlockWhole(await captureBlock(kpiGridEl));

    // Sisa ruang di halaman 1 sengaja dibiarkan kosong — setiap grafik WAJIB
    // dimulai dari halaman baru, tidak menyambung ke konten halaman 1.
    goToNextPage();

    // ================= HALAMAN 2-6 — Satu grafik = satu halaman =================
    // Setiap grafik memakai narasi otomatis dari fungsi compute*Narrative()
    // di atas, dihitung langsung dari `freshData`/filter aktif — jadi tidak
    // pernah tampil di halaman Report itu sendiri, hanya di sini (Export PDF).
    const chartPages = [
      { id:'rp_c_plan',        title:'Plan vs Actual Production', insight:()=> computePlanActualNarrative(freshData) },
      { id:'rp_c_fleet',       title:'Production per Fleet',      insight:()=> computeFleetNarrative(freshData) },
      { id:'rp_c_paua',        title:'UA & PA',                   insight:()=> computeUAPANarrative() },
      { id:'rp_c_fuelratio',   title:'Fuel Ratio',                insight:()=> computeFuelRatioNarrative(freshData) },
      { id:'rp_c_equipstatus', title:'Equipment Status',          insight:()=> computeEquipmentStatusNarrative() },
    ];

    for(let i=0; i<chartPages.length; i++){
      const cp = chartPages[i];
      if(i>0) goToNextPage(); // grafik pertama sudah berada di halaman baru dari goToNextPage() di atas
      const canvasEl = root.querySelector(`#${cp.id}`);
      const cardEl = canvasEl ? canvasEl.closest('.rpt-chart-card') : null;
      if(!cardEl) continue;

      drawPageTitle(cp.title);

      // Hitung teks narasi & jumlah baris (setelah word-wrap) LEBIH DULU,
      // supaya ruang yang disisakan untuk grafik selalu pas dengan panjang
      // narasi yang sebenarnya.
      pdf.setFont('helvetica','italic'); pdf.setFontSize(9);
      const insightText = cp.insight ? cp.insight() : null;
      const insightLines = insightText ? pdf.splitTextToSize(insightText, CONTENT_W) : [];
      const insightReserve = insightText ? (insightLines.length * 4.2 + 6) : 0;

      const chartMaxH = (CONTENT_BOTTOM - y) - insightReserve - 4;
      const chartImg = await captureChartEnlarged(cardEl, cp.id, chartMaxH);
      const xOff = MARGIN_X + (CONTENT_W - chartImg.imgW)/2;
      pdf.addImage(chartImg.imgData, chartImg.imgFormat||'JPEG', xOff, y, chartImg.imgW, chartImg.imgH, undefined, 'NONE');
      y += chartImg.imgH + 6;

      if(insightText){
        pdf.setFont('helvetica','italic'); pdf.setFontSize(9); pdf.setTextColor(90,100,110);
        pdf.text(insightLines, MARGIN_X, y);
        y += insightLines.length * 4.2 + 2;
      }
    }

    // ================= HALAMAN TERAKHIR — Summary, Catatan, Approval & Tanda Tangan =================
    goToNextPage();
    drawPageTitle('Ringkasan Eksekutif');

    // Ringkasan Eksekutif dihitung langsung dari `freshData` (getFiltered()
    // yang baru saja dipanggil ulang di atas) — bukan dari hasil scrape DOM
    // KPI Summary — sehingga selalu sinkron dengan seluruh grafik & filter
    // aktif, dan tidak pernah memakai angka statis. Hanya dibuat di sini
    // (proses Export PDF); halaman Report sendiri tetap hanya grafik.
    const summarySentence = computeExecutiveSummary(freshData);

    pdf.setFont('helvetica','normal'); pdf.setFontSize(9.5); pdf.setTextColor(51,59,68);
    const summaryLines = pdf.splitTextToSize(summarySentence, CONTENT_W);
    const summaryH = summaryLines.length * 4.6;
    if(y + summaryH > CONTENT_BOTTOM){ goToNextPage(); drawPageTitle('Ringkasan Eksekutif'); }
    pdf.text(summaryLines, MARGIN_X, y);
    y += summaryH + 10;

    // Catatan — kotak kosong bergaris untuk catatan/rekomendasi manual.
    {
      const TITLE_H = 12, noteBoxH = 28, blockH = TITLE_H + noteBoxH;
      if(y + blockH > CONTENT_BOTTOM) goToNextPage();
      drawPageTitle('Catatan');
      const noteBoxTop = y;
      pdf.setDrawColor(216,219,224); pdf.setLineWidth(0.3);
      pdf.roundedRect(MARGIN_X, noteBoxTop, CONTENT_W, noteBoxH, 2, 2);
      for(let li=1; li<=3; li++){
        const ly = noteBoxTop + li*7;
        pdf.setDrawColor(230,232,236);
        pdf.line(MARGIN_X+6, ly, PAGE_W-MARGIN_X-6, ly);
      }
      y = noteBoxTop + noteBoxH + 12;
    }

    // Approval & Tanda Tangan — reuse blok pengesahan yang sudah ada di layar.
    // IMPORTANT: capture and measure the signature block FIRST, then decide
    // where the "Pengesahan" title goes — this guarantees the title is
    // never left stranded on one page while the three signature columns
    // (Disiapkan/Diperiksa/Disetujui — nama, jabatan, tanggal) render on
    // the next, which was the root cause of the section looking cut off.
    const signGridEl = root.querySelector('.rpt-sign-grid');
    if(signGridEl){
      const TITLE_H = 12; // vertical space drawPageTitle() consumes (see drawPageTitle: y += 12)
      const signBlock = await captureBlock(signGridEl, 2.5);
      const neededH = TITLE_H + signBlock.imgH;
      if(y + neededH > CONTENT_BOTTOM){ goToNextPage(); }
      drawPageTitle('Pengesahan');
      placeBlockWhole(signBlock);
    }

    // Second pass: now that we know the final page count, stamp "Halaman X dari N".
    const totalPages = pdf.internal.getNumberOfPages();
    for(let i=1;i<=totalPages;i++){
      pdf.setPage(i);
      pdf.setFillColor(255,255,255);
      pdf.rect(PAGE_W-MARGIN_X-45, PAGE_H-FOOTER_H+3.5, 45, 7, 'F');
      pdf.setFont('helvetica','normal'); pdf.setFontSize(7.5); pdf.setTextColor(120,128,138);
      pdf.text(`Halaman ${i} dari ${totalPages}`, PAGE_W-MARGIN_X, PAGE_H-FOOTER_H+8, { align:'right' });
    }

    restore();
    const fname = `${(REPORT_META.docNumber||'MINEBOARD')}_${U.dateStr(new Date())}.pdf`.replace(/\s+/g,'_');
    pdf.save(fname);
    showToast('PDF berhasil dibuat', 'success');
  }catch(err){
    restore();
    console.error('Export PDF gagal:', err);
    showToast('Export PDF gagal: '+(err.message||err), 'error');
  }
}

/* ---- SETTINGS ---- */
function render_settings(data, el){
  el.innerHTML = `
  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <div class="glass p-5">
      <div class="panel-title mb-2">Tampilan</div>
      <div class="flex items-center justify-between py-2 border-b" style="border-color:var(--border)">
        <span class="text-sm" style="color:var(--text-dim)">Mode Tema</span>
        <button class="btn" onclick="toggleTheme()">${theme==='dark'?'🌙 Dark Mode':'☀️ Light Mode'}</button>
      </div>
      <div class="flex items-center justify-between py-2 border-b" style="border-color:var(--border)">
        <span class="text-sm" style="color:var(--text-dim)">Sidebar</span>
        <button class="btn" onclick="toggleSidebar()">Ciutkan / Perluas</button>
      </div>
    </div>
    <div class="glass p-5">
      <div class="panel-title mb-2">Data</div>
      <div class="flex items-center justify-between py-2 border-b" style="border-color:var(--border)">
        <span class="text-sm" style="color:var(--text-dim)">Total Record Shift</span>
        <span class="font-mono">${RECORDS.length.toLocaleString('id-ID')}</span>
      </div>
      <div class="flex items-center justify-between py-2 border-b" style="border-color:var(--border)">
        <span class="text-sm" style="color:var(--text-dim)">Periode Data</span>
        <span class="font-mono">Jan - Des ${YEAR}</span>
      </div>
      <div class="flex items-center justify-between py-2">
        <span class="text-sm" style="color:var(--text-dim)">Muat Ulang dari Supabase</span>
        <button class="btn" onclick="regenerateData()">🔄 Reload Data</button>
      </div>
    </div>
    <div class="glass p-5 md:col-span-2">
      <div class="panel-title mb-1">Company Profile</div>
      <div class="panel-sub mb-4">Data ini otomatis muncul di header setiap Laporan (halaman Reports) dan pada file PDF yang diekspor — isi sekali, tidak perlu diketik ulang setiap membuat laporan.</div>

      <div class="flex items-start gap-4 mb-4 flex-wrap">
        <div class="flex flex-col items-center gap-2">
          <div style="width:72px;height:72px;border-radius:10px;background:#12213A;display:flex;align-items:center;justify-content:center;overflow:hidden;border:1px solid var(--border);">
            ${COMPANY_PROFILE.logoDataUrl
              ? `<img src="${COMPANY_PROFILE.logoDataUrl}" style="width:100%;height:100%;object-fit:contain;background:#fff;" alt="Logo perusahaan">`
              : `<span class="font-display font-bold" style="color:#fff;font-size:15px;">${esc(COMPANY_PROFILE.logoInitials||'CO')}</span>`}
          </div>
          <div class="flex gap-1">
            <label class="btn !py-1 !px-2 !text-[11px]" style="cursor:pointer;">
              ⬆ Upload
              <input type="file" id="cp_logo_input" accept=".png,.jpg,.jpeg,.svg,image/png,image/jpeg,image/svg+xml" onchange="handleLogoUpload(this)" style="display:none;">
            </label>
            ${COMPANY_PROFILE.logoDataUrl ? `<button class="btn !py-1 !px-2 !text-[11px]" onclick="removeLogo()">Hapus</button>` : ''}
          </div>
          <div class="text-[10px] text-center" style="color:var(--text-faint); max-width:110px;">PNG, JPG, atau SVG. Maks 2MB.</div>
        </div>

        <div class="adm-form-grid" style="flex:1; min-width:260px;">
          <div class="adm-field"><label class="adm-label">Nama Perusahaan</label><input class="adm-input" id="cp_name" value="${esc(COMPANY_PROFILE.name)}" placeholder="PT Nama Perusahaan"></div>
          <div class="adm-field"><label class="adm-label">Website</label><input class="adm-input" id="cp_website" value="${esc(COMPANY_PROFILE.website)}" placeholder="www.perusahaan.co.id"></div>
          <div class="adm-field" style="grid-column:1/-1;"><label class="adm-label">Alamat</label><input class="adm-input" id="cp_address" value="${esc(COMPANY_PROFILE.address)}" placeholder="Jl. Contoh No. 1"></div>
          <div class="adm-field"><label class="adm-label">Kota</label><input class="adm-input" id="cp_city" value="${esc(COMPANY_PROFILE.city)}" placeholder="Nama Kota"></div>
          <div class="adm-field"><label class="adm-label">Provinsi</label><input class="adm-input" id="cp_province" value="${esc(COMPANY_PROFILE.province)}" placeholder="Nama Provinsi"></div>
          <div class="adm-field"><label class="adm-label">Kode Pos</label><input class="adm-input" id="cp_postal" value="${esc(COMPANY_PROFILE.postalCode)}" placeholder="00000"></div>
          <div class="adm-field"><label class="adm-label">Email</label><input class="adm-input" id="cp_email" value="${esc(COMPANY_PROFILE.email)}" placeholder="ops@perusahaan.co.id"></div>
          <div class="adm-field" style="grid-column:1/-1;"><label class="adm-label">Nomor Telepon</label><input class="adm-input" id="cp_phone" value="${esc(COMPANY_PROFILE.phone)}" placeholder="+62 ..."></div>
        </div>
      </div>
      <button class="btn btn-accent" onclick="saveCompanyProfileForm()">💾 Simpan Company Profile</button>
    </div>

    <div class="glass p-5 md:col-span-2">
      <div class="panel-title mb-1">Default Laporan</div>
      <div class="panel-sub mb-4">Nilai default untuk dokumen laporan baru. Masih bisa diubah per-laporan langsung di halaman Reports; perubahan di sana ikut tersimpan di sini.</div>
      <div class="adm-form-grid">
        <div class="adm-field"><label class="adm-label">Nama Site</label><input class="adm-input" id="rm_siteName" value="${esc(REPORT_META.siteName)}"></div>
        <div class="adm-field"><label class="adm-label">Nama Project</label><input class="adm-input" id="rm_projectName" value="${esc(REPORT_META.projectName)}"></div>
        <div class="adm-field"><label class="adm-label">Nama Client</label><input class="adm-input" id="rm_client" value="${esc(REPORT_META.client)}"></div>
        <div class="adm-field"><label class="adm-label">Nama Contractor</label><input class="adm-input" id="rm_contractor" value="${esc(REPORT_META.contractor)}"></div>
        <div class="adm-field"><label class="adm-label">Nomor Dokumen Default</label><input class="adm-input" id="rm_docNumber" value="${esc(REPORT_META.docNumber)}"></div>
        <div class="adm-field"><label class="adm-label">Nomor Revisi</label><input class="adm-input" id="rm_revisionNumber" value="${esc(REPORT_META.revisionNumber)}"></div>
        <div class="adm-field"><label class="adm-label">Dibuat Oleh (Nama)</label><input class="adm-input" id="rm_preparedByName" value="${esc(REPORT_META.preparedByName)}"></div>
        <div class="adm-field"><label class="adm-label">Dibuat Oleh (Jabatan)</label><input class="adm-input" id="rm_preparedByTitle" value="${esc(REPORT_META.preparedByTitle)}"></div>
        <div class="adm-field"><label class="adm-label">Diperiksa Oleh (Nama)</label><input class="adm-input" id="rm_checkedByName" value="${esc(REPORT_META.checkedByName)}"></div>
        <div class="adm-field"><label class="adm-label">Diperiksa Oleh (Jabatan)</label><input class="adm-input" id="rm_checkedByTitle" value="${esc(REPORT_META.checkedByTitle)}"></div>
        <div class="adm-field"><label class="adm-label">Disetujui Oleh (Nama)</label><input class="adm-input" id="rm_approvedByName" value="${esc(REPORT_META.approvedByName)}"></div>
        <div class="adm-field"><label class="adm-label">Disetujui Oleh (Jabatan)</label><input class="adm-input" id="rm_approvedByTitle" value="${esc(REPORT_META.approvedByTitle)}"></div>
      </div>
      <button class="btn btn-accent mt-2" onclick="saveReportDefaultsForm()">💾 Simpan Default Laporan</button>
    </div>

    <div class="glass p-5 md:col-span-2">
      <div class="panel-title mb-2">Tentang (V3.0 Supabase Backend Edition)</div>
      <p class="text-sm" style="color:var(--text-dim)">MINEBOARD kini terhubung ke backend PostgreSQL (Supabase) — seluruh data produksi, hauling, maintenance, safety, cuaca, crusher, dan stockpile diambil langsung dari database, bukan lagi data dummy lokal. Dilengkapi metrik Engineering & MCC (Mine Control Center) seperti <b>Grade Control</b>, <b>Cycle Time Telematics</b>, <b>Dewatering (Sump Level)</b>, serta <b>Rekonsiliasi BCM (Swell Factor)</b>.</p>
    </div>
  </div>
  `;
}

/* ---------- COMPANY PROFILE / REPORT DEFAULTS — Settings form handlers ---------- */
function saveCompanyProfileForm(){
  const g = id=> (document.getElementById(id)?.value ?? '').trim();
  setCompanyProfile({
    name: g('cp_name'), address: g('cp_address'), city: g('cp_city'), province: g('cp_province'),
    postalCode: g('cp_postal'), website: g('cp_website'), email: g('cp_email'), phone: g('cp_phone')
  });
  showToast('Profil perusahaan tersimpan', 'success');
  renderPage();
}
function saveReportDefaultsForm(){
  const g = id=> (document.getElementById(id)?.value ?? '').trim();
  ['client','contractor','siteName','projectName','docNumber','revisionNumber',
   'preparedByName','preparedByTitle','checkedByName','checkedByTitle','approvedByName','approvedByTitle']
   .forEach(k=> setReportMeta(k, g('rm_'+k)));
  showToast('Data default laporan tersimpan', 'success');
  renderPage();
}
function handleLogoUpload(inputEl){
  const file = inputEl.files && inputEl.files[0];
  if(!file) return;
  const allowed = ['image/png','image/jpeg','image/jpg','image/svg+xml'];
  if(!allowed.includes(file.type)){ showToast('Format logo harus PNG, JPG, atau SVG', 'error'); return; }
  if(file.size > 2*1024*1024){ showToast('Ukuran logo maksimal 2MB', 'error'); return; }
  const reader = new FileReader();
  reader.onload = (e)=>{
    const dataUrl = e.target.result;
    if(file.type === 'image/svg+xml'){
      // Rasterize SVG to PNG so it can also be embedded directly into the exported PDF (jsPDF can't addImage raw SVG).
      const img = new Image();
      img.onload = ()=>{
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0,0,size,size);
        const ratio = Math.min(size/(img.width||size), size/(img.height||size));
        const w = (img.width||size)*ratio, h = (img.height||size)*ratio;
        ctx.drawImage(img, (size-w)/2, (size-h)/2, w, h);
        setCompanyProfile({ logoDataUrl: canvas.toDataURL('image/png') });
        renderPage();
        showToast('Logo berhasil diperbarui', 'success');
      };
      img.onerror = ()=> showToast('Gagal membaca file SVG', 'error');
      img.src = dataUrl;
    } else {
      setCompanyProfile({ logoDataUrl: dataUrl });
      renderPage();
      showToast('Logo berhasil diperbarui', 'success');
    }
  };
  reader.onerror = ()=> showToast('Gagal membaca file logo', 'error');
  reader.readAsDataURL(file);
}
function removeLogo(){
  setCompanyProfile({ logoDataUrl:'' });
  renderPage();
  showToast('Logo dihapus', 'info');
}
async function regenerateData(){
  // [HARDENING] tanpa overlay/alert: progres di chip, kegagalan -> chip "Retry" + toast singkat.
  try{
    await loadAllData({ background:true });
    buildFilterBar();
    renderPage();
    if(DATA_STATE.status !== 'ready') showToast('Data gagal dimuat — Retry', 'error');
  }catch(err){
    console.error('[Mineboard][refresh] gagal:', err);
    showToast('Data gagal dimuat — Retry', 'error');
  }
}

/* ============================================================
   ADMIN MODULE (100% ADDITIF)
   Tidak ada satupun fungsi/CSS/HTML dashboard existing yang diubah
   di atas titik ini. Modul ini hanya menambah 1 halaman baru yang
   dirender lewat mekanisme routing generik window['render_'+id]
   yang sudah ada (lihat renderPage()), sehingga 100% kompatibel.

   [ADMIN REPAIR 2026-09] CATATAN AUDIT LOG (diperbarui — tidak lagi akurat sebelum tanggal ini):
   Database TIDAK memiliki `system_logs` dan tabel tersebut TIDAK dibuat. Tab "Audit Log" di Admin
   sekarang membaca `repair_audit_log` (audit khusus proses repair/perbaikan data per-field —
   kolom: log_id, repair_batch, table_name, record_key, field_changed, value_before, value_after,
   reason, rule_applied, repaired_at), BUKAN generic activity log. logAdminEvent() untuk event
   non-DML (LOGIN/LOGOUT/EXPORT) sengaja no-op karena tidak ada tabel tujuan yang sesuai.

   CATATAN PRIMARY KEY:
   Tabel Master Data & Transaction Data di bawah (MASTER_TABLES/TRANSACTION_TABLES) memakai PK
   sesuai kolom aktual pada masing-masing tabel Supabase nyata (mis. shift_id, fleet_id,
   employee_id, actual_id, status_id, dst) — TIDAK ada asumsi "id" generik. Lihat komentar
   [NEEDS VERIFICATION] pada master_units untuk satu-satunya PK yang belum 100% terkonfirmasi
   lewat dokumen schema (dipakai unit_code sebagai identifier unik yang sudah terbukti dipakai
   di seluruh kode ini).
------------------------------------------------------------------ */

/* ---------- ADMIN STATE ---------- */
let adminActiveTab = 'dashboard';     // dashboard | master | transaction | auditlog
let adminActiveTable = null;          // nama tabel yang sedang dibuka (master/transaction)
let adminTableCache = {};             // cache baris per tabel
let adminTableState = {};             // search/sort/page/selected per tabel
// [WEATHER RULE ENGINE 2026-09] master/rule table weather_equipment_rules (final prompt §16 — dibuat
// SETELAH approval eksplisit di prompt final, lihat migration weather_event_columns_and_equipment_rules).
// Idle_code + production_classification (NULL=wildcard) + unit_role_code (NULL=wildcard) -> affected.
// Ini SUMBER KEBENARAN tunggal untuk "equipment mana yang terkena weather apa" — dipakai baik oleh
// UI (badge/ringkasan di tab Cuaca) maupun (kalau nanti disambungkan) calculation engine, TIDAK ada
// aturan kedua yang hardcode di tempat lain.
let WEATHER_RULES = [];
async function diLoadWeatherRules(){
  if(WEATHER_RULES.length) return WEATHER_RULES;
  try{
    const { data, error } = await sb.from('weather_equipment_rules')
      .select('idle_code,production_classification,unit_role_code,affected,notes').eq('is_active', true);
    if(error) throw error;
    WEATHER_RULES = data || [];
    DI._wxRulesErr = null;
  }catch(e){ console.error(`[Mineboard][fetch] table=weather_equipment_rules op=select status=${(e&&(e.status||e.code))||'n/a'} message=${(e&&e.message)||e}`); WEATHER_RULES = []; DI._wxRulesErr = e; }
  return WEATHER_RULES;
}
/* affected(unit) = ADA baris WEATHER_RULES utk idle_code ini yang cocok (classification NULL-atau-sama
   DAN role NULL-atau-sama) dengan affected=true. Tidak ada baris cocok -> default TIDAK terdampak
   (safe default — mis. Fog belum ada baris sama sekali -> semua unit "tidak terdampak" sampai
   dikonfirmasi, BUKAN diasumsikan semua/tidak sama sekali). */
function diWeatherAffected(classification, roleCode, idleCode){
  return WEATHER_RULES.some(r=> r.idle_code===idleCode && r.affected &&
    (r.production_classification==null || r.production_classification===classification) &&
    (r.unit_role_code==null || r.unit_role_code===roleCode));
}
/* Ringkasan role/classification yang terdampak untuk 1 idle_code, LANGSUNG dari master rule (bukan
   hardcode teks) — dipakai untuk tampilan "Equipment terdampak" di tab Cuaca. */
function diWeatherAffectedSummary(idleCode){
  const rows = WEATHER_RULES.filter(r=> r.idle_code===idleCode && r.affected);
  if(!rows.length) return null; // no rule yet (e.g. Fog) -> caller shows "NEEDS BUSINESS CONFIRMATION"
  return rows.map(r=>{
    if(!r.production_classification && !r.unit_role_code) return 'Semua equipment (Production & Support)';
    if(r.production_classification && !r.unit_role_code) return `Semua unit ${r.production_classification}`;
    return `${r.unit_role_code}${r.production_classification?' ('+r.production_classification+')':''}`;
  });
}
/* Slot jam (0-23) yang di-cover event Start-End, boleh lintas tengah malam — reuse pola diSbDurHours. */
function diWeatherSlots(start, end){
  if(!start || !end) return [];
  const [sh,sm]=start.split(':').map(Number), [eh,em]=end.split(':').map(Number);
  let startMin = sh*60+sm, endMin = eh*60+em; if(endMin<=startMin) endMin += 24*60;
  const slots = new Set();
  for(let m=startMin; m<endMin; m+=60) slots.add(Math.floor(m/60)%24);
  slots.add(Math.floor((endMin-1)/60)%24);
  return [...slots].sort((a,b)=>a-b);
}
/* [WEATHER AUTO-IDLE 2026-09] Menyambungkan WEATHER_RULES/diWeatherAffected (sebelumnya cuma dipakai
   badge di tab Cuaca) ke Production (Digger & Hauler, tab Jam) DAN Support (Grader/Dozer/WT/dst,
   tab Support) — permintaan eksplisit: saat jam ini kena Hujan/Slippery/Kabut, unit yang affected di
   weather_equipment_rules otomatis Idle dengan kode cuaca terkait, tanpa user pilih manual satu-satu.
   diUnitWeatherCtx menentukan classification+role dari pool lookup yang sudah ada (bukan query baru):
   digger pool = selalu PRODUCTION/EXCAVATOR, hauler pool = selalu PRODUCTION/HAULER, support pool
   sudah bawa unit_role_code sendiri (extraCols, lihat LOOKUP_DEFS.support). */
function diUnitWeatherCtx(unitCode){
  if(!unitCode) return null;
  if((ADMIN_LOOKUP_CACHE.digger||[]).some(o=>o.value===unitCode)) return {cls:'PRODUCTION', role:'EXCAVATOR'};
  if((ADMIN_LOOKUP_CACHE.hauler||[]).some(o=>o.value===unitCode)) return {cls:'PRODUCTION', role:'HAULER'};
  const s = (ADMIN_LOOKUP_CACHE.support||[]).find(o=>o.value===unitCode);
  return s ? {cls:'SUPPORT', role:s.unit_role_code||null} : null;
}
/* [ROOT CAUSE FIX 2026-11 — Rain 10:18–10:55 hilang, cuma Slippery 10:56–11:00 yang masuk ke Production]
   TRACING (sesuai urutan Weather Event -> weather slots -> weather affected code -> weather automation
   -> Production -> segment W/I/D/BD):
   diWeatherAutoCodeFor() lama memanggil diWeatherCodesAt(h).find(...) — .find() ARTINYA MENGAMBIL SATU
   KODE PERTAMA YANG COCOK DARI SEMUA EVENT YANG MENYENTUH JAM h, LALU diApplyWeatherAuto lama memakai
   SATU kode itu SAJA untuk membentuk SATU segmen Idle + SATU sisa Working. Kalau jam 10 disentuh 2 event
   (Rain 10:18–10:55 DAN Slippery 10:56–11:12), .find() cuma mengembalikan kode PERTAMA di array DI.wxEvents
   (di kasus screenshot: Slippery, karena urutan array-nya begitu) — persis pola bug "weatherSlots[hour] =
   satu code" yang diminta dicari: SATU JAM DIREDUKSI JADI SATU KODE, event lain hilang total. Ini root
   cause tunggal, bukan bug di diWeatherSlots/diWeatherOverlapMinutes/WEATHER_RULES (semua itu sudah benar
   secara matematis per-event, cuma dipanggil dengan cara yang membuang event kedua).
   FIX: ganti representasi dari "satu kode per jam" menjadi TIMELINE (array interval per menit dalam jam
   itu), lewat diUnitWeatherTimeline() — union SEMUA wxEvents yang affected utk unit ini, di-run-length-
   encode jadi segmen {code|null, mins} berurutan (null = Working). Tidak ada event yang hilang hanya
   karena ada event lain; overlap menit-yang-sama antar kode (bukan kasus di screenshot, tapi bisa terjadi)
   diselesaikan dengan "event yang diproses belakangan menang" pada menit yang sama SAJA — event yang tidak
   overlap sama sekali tetap independen, tidak saling menimpa. Dipakai HANYA untuk Production (Digger/
   Hauler, yang memang berbasis array segmen); Support tetap 1 field s/code/dur (skema Support tidak
   berbasis segmen sama sekali, di luar scope bug ini, tidak diubah). */
function diUnitWeatherTimeline(h, ctx){
  const codeAt = new Array(60).fill(null);
  (DI.wxEvents||[]).forEach(e=>{
    if(!e.start || !e.end || !diWeatherAffected(ctx.cls, ctx.role, e.code)) return;
    const [sh,sm]=e.start.split(':').map(Number), [eh,em]=e.end.split(':').map(Number);
    let s=sh*60+sm, en=eh*60+em; if(en<=s) en += 24*60;
    [0,1440,-1440].forEach(off=>{
      const hs=h*60+off, he=hs+60, os=Math.max(s,hs), oe=Math.min(en,he);
      for(let m=os; m<oe; m++) codeAt[m-hs] = e.code;   // menit dalam interval jam ini (0-59)
    });
  });
  const segs = []; let i = 0;
  while(i < 60){ const code = codeAt[i]; let j = i; while(j<60 && codeAt[j]===code) j++; segs.push({code, mins:j-i}); i = j; }
  return segs;
}
/* Kode cuaca (I01/I02/I03) yang aktif menutupi jam h, dari DI.wxEvents (event GLOBAL shift ini). */
function diWeatherCodesAt(h){
  return [...new Set((DI.wxEvents||[]).filter(e=> e.start && e.end && diWeatherSlots(e.start,e.end).includes(h)).map(e=>e.code))];
}
/* Kode cuaca pertama yang affected utk unit ini di jam h (null kalau tidak ada event/tidak affected).
   [MASIH DIPAKAI] hanya untuk Support (single-value, lihat komentar diUnitWeatherTimeline di atas) —
   TIDAK dipakai lagi untuk Production sejak fix di atas, karena inilah sumber bug "event kedua hilang". */
function diWeatherAutoCodeFor(unitCode, h){
  const ctx = diUnitWeatherCtx(unitCode); if(!ctx) return null;
  return diWeatherCodesAt(h).find(c=> diWeatherAffected(ctx.cls, ctx.role, c)) || null;
}
/* [WEATHER DURATION 2026-09] Menit overlap event cuaca `code` terhadap jendela jam h (0-59), di-clip ke
   60 menit — supaya durasi Idle cuaca di Produksi/Support mengikuti PERSIS lama kejadian (mis. hujan
   cuma 15 menit dalam jam itu -> Idle cuaca 15 menit, sisanya 45 menit tetap Working), bukan selalu
   dianggap 60 menit penuh seperti sebelumnya. Boleh lintas tengah malam (pola sama dgn diWeatherSlots). */
function diWeatherOverlapMinutes(h, code){
  let mins = 0;
  (DI.wxEvents||[]).forEach(e=>{
    if(e.code!==code || !e.start || !e.end) return;
    const [sh,sm]=e.start.split(':').map(Number), [eh,em]=e.end.split(':').map(Number);
    let s=sh*60+sm, en=eh*60+em; if(en<=s) en += 24*60;
    [0,1440,-1440].forEach(off=>{
      const hs=h*60+off, he=hs+60;
      const os=Math.max(s,hs), oe=Math.min(en,he);
      if(oe>os) mins += (oe-os);
    });
  });
  return Math.min(60, mins);
}
/* [WEATHER STATUS/REASON RECONSTRUCTION FIX 2026-12 — bug: "Rain Hours" menimpa status]
   ROOT CAUSE (dikonfirmasi via testing user): fungsi diApplyWeatherAuto versi lama SELALU mengubah
   menit yang overlap dengan event cuaca menjadi status Idle('I') dengan code=kode cuaca, TANPA melihat
   apa status ASLI unit itu pada menit tsb (Working/Idle-alasan-lain/Delay-alasan-lain/Breakdown). Ini
   persis pola yang dilarang di prompt final: "Rain = Idle" diasumsikan otomatis (poin 12), status &
   reason tercampur jadi satu "Rain Hours" (poin 4), dan prioritas Breakdown/Maintenance/Fuel/Support
   tidak dihormati (poin 8) — bahkan bisa MENIMPA baris itu ke idle_events saat disimpan (poin 11
   dilanggar: cuaca ikut menulis status palsu ke source of truth).

   FIX: WEATHER ADALAH REASON/CONDITION, BUKAN STATUS (poin 12). Reconstruction sekarang:
   1) Menyimpan SATU KALI snapshot "baseline" status asli unit per jam (SEBELUM overlay cuaca apa pun)
      — persis hasil reconstruction production_actual/unit_status_actual/delay_events/idle_events yang
      sudah dilakukan diFromDb (poin 11: ketiga tabel itu tetap jadi source, tidak diubah).
   2) Menghitung overlap MENIT-PER-MENIT antara baseline dan timeline cuaca (poin 2: overlap_start=
      max(...), overlap_end=min(...); overlap<=0 -> tidak dapat weather reason).
   3) Menggabungkan keduanya via diWeatherMergeMinute() dengan precedence rule EKSPLISIT (poin 8):
        Breakdown baseline -> SELALU menang, cuaca diabaikan total pada menit itu.
        Idle/Delay baseline dengan code MANUAL (Fuel/Maintenance/Support/dll, bukan kode cuaca) -> menang.
        Working baseline -> TETAP Working (poin 5), cuaca jadi REASON tampilan saja (_wxNote, TIDAK
          pernah ditulis ke idle_events/delay_events karena status Working memang tidak punya kolom
          reason di schema — lihat diPlan(): status W hanya menulis ke unit_status_actual, tanpa code).
        Idle/Delay baseline TANPA alasan manual (unit memang sudah berhenti) -> tetap Idle/Delay yang
          sama, reason cuaca dipasang sebagai code (poin 6/7 — TIDAK menebak Idle vs Delay, cuma
          melanjutkan status yang sudah ada di baseline, sesuai rule yang sudah dipakai aplikasi).
      Tidak ada event yang hilang: dua kode cuaca berbeda dalam 1 jam (mis. Rain 09:35–10:44 lalu
      Slippery 10:45–11:08) menghasilkan DUA segmen berbeda (poin 3 & 9), karena diCompressSegs hanya
      menggabungkan menit-menit dengan {status, code} PERSIS SAMA.
   4) Kalau event cuaca dihapus/tidak lagi overlap, hasil merge otomatis kembali ke baseline apa adanya
      (Working/Idle/Delay/Breakdown asli) — bukan cuma fallback ke Working seperti versi lama.
   Berlaku untuk Production (Fleet digger + Hauler, berbasis segmen) DAN Support (lihat blok terpisah
   di bawah — Support historically single-row per jam, lihat catatan keterbatasan skema di sana). */
const WX_CODE_LABEL = { I01:'Rain', I02:'Slippery', I03:'Fog' };
/* Pecah array segs {s,dur,code} (total <=60 menit) jadi array 60 elemen per-menit {s,code,wxNote}. */
function diExpandSegs(segs){
  const arr = new Array(60); let i = 0;
  (segs||[]).forEach(x=>{
    const dur = Math.max(0, Math.min(60-i, Math.round(Number(x.dur)||0)));
    for(let k=0;k<dur;k++) arr[i+k] = {s:x.s, code:x.code||'', wxNote:''};
    i += dur;
  });
  for(let k=i;k<60;k++) arr[k] = {s:'W', code:'', wxNote:''}; // sisa menit tak terisi -> default Working, sama seperti diSeg() default lama
  return arr;
}
/* Gabungkan kembali array 60-menit jadi segs {s,dur,code[,wxNote]} — run-length encode, HANYA
   menggabungkan menit yang status+code+wxNote-nya PERSIS SAMA (poin 3: tidak menggabungkan Rain & Slippery). */
function diCompressSegs(arr){
  const segs = []; let i = 0;
  while(i < 60){
    const cur = arr[i]; let j = i;
    while(j<60 && arr[j].s===cur.s && arr[j].code===cur.code && arr[j].wxNote===cur.wxNote) j++;
    const seg = diSeg(cur.s, j-i, cur.code);
    if(cur.wxNote) seg.wxNote = cur.wxNote;
    segs.push(seg); i = j;
  }
  return segs;
}
/* Precedence rule 1 menit (poin 5,6,7,8,12). base={s,code}, wxCode=kode cuaca aktif menit ini atau null. */
function diWeatherMergeMinute(base, wxCode){
  if(!wxCode) return {s:base.s, code:base.code, wxNote:''}; // tidak ada overlap -> murni baseline (poin 2)
  if(base.s==='BD') return {s:base.s, code:base.code, wxNote:''}; // poin 8: Breakdown selalu menang
  const baseIsWeatherCode = !!WX_CODE_LABEL[base.code];
  if((base.s==='D' || base.s==='I') && base.code && !baseIsWeatherCode){
    return {s:base.s, code:base.code, wxNote:''}; // poin 8: alasan manual (Fuel/Maintenance/Support/dll) menang
  }
  if(base.s==='W') return {s:'W', code:'', wxNote:wxCode}; // poin 5: TETAP Working, cuaca cuma reason tampilan
  return {s:base.s, code:wxCode, wxNote:''}; // poin 6/7: sudah Idle/Delay tanpa alasan manual -> lanjut status yang sama, reason=cuaca
}
function diMinToClock(totalMin){ const m=((totalMin%1440)+1440)%1440; return String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0'); }
/* [DEBUG LOG WAJIB — poin 13] satu baris per segmen yang benar2 kena reason cuaca, buka console utk cek:
   unit_id, interval_start, interval_end, status, reason, source, weather_event, weather_overlap_minutes. */
function diLogWeatherReconstruction(unitId, h, segs){
  let offset = h*60;
  segs.forEach(seg=>{
    const start = offset, end = offset + (Number(seg.dur)||0); offset = end;
    const reasonCode = seg.wxNote || (WX_CODE_LABEL[seg.code] ? seg.code : '');
    if(!reasonCode) return; // segmen tanpa reason cuaca -> tidak perlu di-log (bukan bagian dari fix ini)    console.log(`[WX-RECON] unit_id=${unitId} interval_start=${diMinToClock(start)} interval_end=${diMinToClock(end)} status=${seg.s} reason=${WX_CODE_LABEL[reasonCode]||reasonCode} source=weather_event weather_event=${reasonCode} weather_overlap_minutes=${seg.dur}`);
  });
}
/* Terapkan ke satu form jam. Fleet/Hauler (berbasis segmen) pakai baseline+merge per-menit di atas.
   Segmen/baris yang sudah disentuh user manual (_wxTouched, lihat diSet) TIDAK PERNAH disentuh lagi. */
function diApplyWeatherAuto(h){
  const f = DI.forms[h]; if(!f) return;
  const touch = (owner, unitKey, segsKey)=>{
    const unit = owner[unitKey], segs = owner[segsKey];
    if(!unit || !segs || !segs.length) return;
    if(segs.some(s=>s._wxTouched)) return; // manual override menang, auto-engine berhenti total utk baris ini
    const baseKey = '_wxBase_'+segsKey;
    // Snapshot baseline HANYA sekali, sebelum overlay cuaca pertama kali diterapkan — supaya baseline
    // yang disimpan adalah hasil reconstruction production_actual/delay_events/idle_events asli (poin 11),
    // bukan hasil overlay cuaca putaran sebelumnya.
    if(!owner[baseKey] && !segs.some(s=>s._wxAuto)) owner[baseKey] = diExpandSegs(segs);
    if(!owner[baseKey]) return; // baseline belum sempat kesnapshot (seharusnya tidak terjadi) -> jangan tebak
    const ctx = diUnitWeatherCtx(unit); if(!ctx) return;
    const timeline = diUnitWeatherTimeline(h, ctx); // union semua event cuaca affected, per-menit, tidak ada yang hilang
    const wxArr = new Array(60); let p = 0;
    timeline.forEach(t=>{ for(let k=0;k<t.mins;k++) wxArr[p+k]=t.code; p+=t.mins; });
    const base = owner[baseKey];
    const merged = base.map((b,idx)=> diWeatherMergeMinute(b, wxArr[idx]||null));
    const newSegs = diCompressSegs(merged).map(s=> Object.assign(s, {_wxAuto:true}));
    const changed = newSegs.length!==segs.length || newSegs.some((s,idx)=> !segs[idx] || s.s!==segs[idx].s || s.dur!==segs[idx].dur || s.code!==segs[idx].code || (s.wxNote||'')!==(segs[idx].wxNote||''));
    if(changed){ segs.length = 0; newSegs.forEach(s=>segs.push(s)); }
    diLogWeatherReconstruction(unit, h, newSegs); // no-op internal kalau tidak ada segmen ber-reason cuaca
  };
  (f.fleets||[]).forEach(fl=>{ touch(fl,'digger','dsegs'); (fl.haulers||[]).forEach(hl=> touch(hl,'unit','segs')); });
  /* [SUPPORT — KETERBATASAN SKEMA] unit_status_actual/idle_events/delay_events menyimpan SATU status
     per unit per jam (bukan array segmen seperti Fleet/Hauler) — TIDAK bisa merepresentasikan Rain lalu
     Slippery sebagai DUA segmen dalam 1 jam yang sama tanpa migrasi skema (di luar scope "perbaiki
     logic, jangan ubah database" — poin 11). Sampai skema Support jadi segmen-capable, precedence rule
     yang SAMA (poin 5/6/7/8/12) tetap diterapkan penuh via baseline snapshot; saat >1 kode cuaca overlap
     jam yang sama, dipilih kode dengan overlap menit PALING BESAR (deterministic, tie-break kode ASC) —
     BUKAN ".find() kode pertama di array" seperti bug lama yang bisa membuang event kedua total. */
  const _isWE = diIsWorkEndHour(h);
  (f.support||[]).forEach(s=>{
    if(!s.unit || s._wxTouched) return;
    // [FIX 2026-12 WORK END] cuaca TIDAK PERNAH mengubah Support Work End jadi Idle/Delay — kembalikan baseline bila sempat ter-overlay.
    if(_isWE){ if(s._wxAuto && s._wxBase){ s.s=s._wxBase.s; s.dur=s._wxBase.dur; s.code=s._wxBase.code; } s._wxAuto=false; s._wxNote=''; return; }
    if(!s._wxBase && !s._wxAuto) s._wxBase = { s:s.s, dur:s.dur, code:s.code };
    if(!s._wxBase) return;
    const ctx = diUnitWeatherCtx(s.unit); if(!ctx) return;
    const timeline = diUnitWeatherTimeline(h, ctx).filter(t=>t.code);
    const dominant = timeline.slice().sort((a,b)=> b.mins-a.mins || String(a.code).localeCompare(String(b.code)))[0] || null;
    const base = s._wxBase;
    const baseIsWeatherCode = !!WX_CODE_LABEL[base.code];
    const protectedByPriority = base.s==='BD' || ((base.s==='D'||base.s==='I') && base.code && !baseIsWeatherCode);
    if(protectedByPriority){
      if(s._wxAuto){ s.s=base.s; s.dur=base.dur; s.code=base.code; s._wxAuto=false; s._wxNote=''; }
      return;
    }
    if(dominant){
      if(base.s==='W'){ s.s='W'; s.dur=base.dur; s.code=base.code; s._wxAuto=true; s._wxNote=dominant.code; }
      else { s.s=base.s; s.dur=dominant.mins; s.code=dominant.code; s._wxAuto=true; s._wxNote=''; }
      diLogWeatherReconstruction(s.unit, h, [{s:s.s, dur:s.dur, code:s.code, wxNote:s._wxNote}]);
    } else if(s._wxAuto){
      s.s=base.s; s.dur=base.dur; s.code=base.code; s._wxAuto=false; s._wxNote='';
    }
  });
  // [FIX 2026-12 DEBUG poin 13] log per segmen weather utk Support (no-op kalau unit tidak overlap event cuaca)
  if(!_isWE) (f.support||[]).forEach(s=>{ if(s.unit) diLogSupportRow(h, s); });
}
/* Terapkan ke semua jam yang formnya sudah dibentuk (dipanggil saat event cuaca berubah). */
function diApplyWeatherAutoAll(){ Object.keys(DI.forms||{}).forEach(h=> diApplyWeatherAuto(+h)); }

/* [TEST CASES WAJIB — poin 14] Self-test murni fungsi (tidak menyentuh Supabase/DI state), jalankan
   manual dari console: diWeatherReconstructionSelfTest(). Menutup kasus A-J dari prompt final. */
function diWeatherReconstructionSelfTest(){
  const results = [];
  const chk = (name, cond)=> results.push({name, pass: !!cond});
  // A. Rain overlap dengan Working -> tetap Working, reason tampil sbg wxNote (bukan Idle)
  { const m = diWeatherMergeMinute({s:'W', code:''}, 'I01'); chk('A: Rain+Working -> stays Working w/ reason', m.s==='W' && m.wxNote==='I01' && !m.code); }
  // B. Rain overlap dengan Idle (tanpa alasan manual) -> Idle, reason=Rain
  { const m = diWeatherMergeMinute({s:'I', code:''}, 'I01'); chk('B: Rain+Idle(no reason) -> Idle/Rain', m.s==='I' && m.code==='I01'); }
  // C. Rain overlap dengan Delay (tanpa alasan manual) -> Delay, reason=Rain
  { const m = diWeatherMergeMinute({s:'D', code:''}, 'I01'); chk('C: Rain+Delay(no reason) -> Delay/Rain', m.s==='D' && m.code==='I01'); }
  // D. Slippery setelah Rain -> dua segmen berbeda, tidak digabung/tidak hilang
  { const base = diExpandSegs([diSeg('I',60,'')]);
    const wx = new Array(60).fill('I01'); for(let i=45;i<60;i++) wx[i]='I02';
    const merged = base.map((b,i)=> diWeatherMergeMinute(b, wx[i]));
    const segs = diCompressSegs(merged);
    chk('D: Rain then Slippery -> 2 distinct segments', segs.length===2 && segs[0].code==='I01' && segs[1].code==='I02' && segs[0].dur===45 && segs[1].dur===15); }
  // E. Rain + Breakdown bersamaan -> reason tetap Breakdown, cuaca diabaikan
  { const m = diWeatherMergeMinute({s:'BD', code:''}, 'I01'); chk('E: Rain+Breakdown -> Breakdown wins', m.s==='BD' && !m.wxNote); }
  // F. Weather event tanpa unit terdampak -> diUnitWeatherCtx null/diWeatherAffected false -> ditangani di caller (tidak dites di sini secara unit, lihat diUnitWeatherTimeline)
  { chk('F: no-overlap minute -> pure baseline unchanged', diWeatherMergeMinute({s:'W',code:''}, null).wxNote===''); }
  // G. Unit Support vs Production: dominant-code selection deterministic by biggest overlap
  { const timeline=[{code:'I01',mins:44},{code:'I02',mins:15}];
    const dominant = timeline.slice().sort((a,b)=> b.mins-a.mins || String(a.code).localeCompare(String(b.code)))[0];
    chk('G: dominant weather code = biggest overlap (Rain 44 > Slippery 15)', dominant.code==='I01'); }
  // H. Boundary tepat saat Rain selesai & Slippery mulai (menit 45) -> tidak overlap ganda, tidak hilang
  { const wx = new Array(60).fill(null); for(let i=0;i<45;i++) wx[i]='I01'; for(let i=45;i<60;i++) wx[i]='I02';
    chk('H: boundary minute 45 belongs only to Slippery', wx[44]==='I01' && wx[45]==='I02'); }
  // I. Tidak boleh duplicate assignment: compress tidak pernah menghasilkan overlapping/duplicate segmen (total menit = 60)
  { const base = diExpandSegs([diSeg('W',60,'')]);
    const wx = new Array(60).fill('I01');
    const segs = diCompressSegs(base.map((b,i)=> diWeatherMergeMinute(b, wx[i])));
    chk('I: no duplicate/overlap, total minutes = 60', segs.reduce((a,s)=>a+s.dur,0)===60); }
  // J. Tidak boleh reason null kalau weather memang menyebabkan status tsb (Idle/Delay dari baseline stop)
  { const m = diWeatherMergeMinute({s:'I', code:''}, 'I02'); chk('J: weather-caused Idle must carry reason', !!m.code); }
  console.table(results);
  const failed = results.filter(r=>!r.pass);
  console.log(failed.length ? `❌ ${failed.length} test case GAGAL — lihat tabel di atas.` : '✅ Semua test case weather reconstruction LULUS.');
  return results;
}

/* [OPERATOR AUTO-REASSIGN 2026-11 — MASALAH 1: operator double assignment]
   ROOT CAUSE: diValidate's opSeen Map (baris ~8158/8250) HANYA mendeteksi & memblokir (E()) konflik
   operator "1 orang, 2+ unit fisik, jam sama" — tidak pernah mengganti operator yang bentrok dengan
   operator lain yang available. Data mentah di Supabase memang punya konflik ini (dikonfirmasi via
   audit: operator_code sama tercatat di production_actual/digger DAN unit_status_actual/Support unit
   lain pada date+shift+hour yang sama — bukan mirror representasi, dua unit fisik berbeda sungguhan).
   FIX (reconstruction layer, generic — tidak hardcode unit/operator manapun): sebelum validasi jalan,
   pindai semua "slot operator" jam ini (digger tiap Fleet + Support non-SB/BD, urutan array = urutan
   deterministic: Fleet index lalu Support index, PERSIS urutan yang sudah dipakai kode lain seperti
   useUnit()/opSeen di diValidate). Assignment PERTAMA yang memegang satu operator_code dipertahankan;
   assignment berikutnya dengan operator_code yang sama dianggap conflict dan diberi pengganti dari
   pool yang KOMPATIBEL (pool operator yang sama persis dengan yang dipakai dropdown UI slot itu —
   ADMIN_LOOKUP_CACHE.operator untuk digger/Support-Excavator, operatorDozer/operatorGrader/driverWT
   untuk Support role lain, via diOptSupportOperator() yang SUDAH ADA), dipilih SECARA DETERMINISTIC
   (employee_code ASC), dan belum dipakai unit lain jam ini. Kalau pool spesifik habis, fallback ke
   gabungan semua pool "operator-like" (bukan pool Driver Hauler — itu constraint terpisah, drvSeen,
   di luar scope perbaikan ini) yang masih aktif & belum dipakai. Kalau benar2 tidak ada kandidat,
   assignment DIKOSONGKAN (bukan operator palsu) dan ditandai _opConflictUnresolved supaya diValidate
   memunculkan warning eksplisit. HANYA dipanggil untuk jam yang belum diedit manual (!DI.dirty.has(h),
   pola sama dengan rebuild diFromDb di diLoadShift) — assignment yang sejak awal sudah valid, atau
   yang sudah disentuh user (_opTouched, lihat diSet), TIDAK PERNAH diubah oleh fungsi ini. */
function diOperatorSlotsFor(f){
  const slots = [];
  const sbMirrorUnits = new Set();
  (f.standby||[]).forEach(s=>{ if(s.unit) sbMirrorUnits.add(s.unit); });
  (f.support||[]).forEach(s=>{ if(s.unit && (s.s==='SB' || s.s==='BD')) sbMirrorUnits.add(s.unit); });
  (f.fleets||[]).forEach((fl,i)=>{
    slots.push({ obj: fl, label:`Fleet #${i+1}${fl.fleet?' '+fl.fleet:''} (digger ${fl.digger||'?'})`,
      pool: ()=> ADMIN_LOOKUP_CACHE.operator||[] });
  });
  (f.support||[]).forEach((s,i)=>{
    if(!s.unit || sbMirrorUnits.has(s.unit)) return; // mirror Standby/BD -> bukan pemakaian aktif jam ini
    slots.push({ obj: s, label:`Support #${i+1} ${s.unit}`, pool: ()=> diOptSupportOperator(s.unit) });
  });
  return slots;
}
function diResolveOperatorConflicts(h){
  const f = DI.forms[h]; if(!f) return;
  const slots = diOperatorSlotsFor(f).filter(sl=> sl.obj.operator && !sl.obj._opTouched);
  const used = new Map(); // operator_code -> label slot yang MEMPERTAHANKANnya
  // [FIX Rule 6] Pre-reservasi operator_code yang MEMANG unik (tidak bentrok sama sekali) SEBELUM
  // memproses konflik apa pun. Tanpa ini, urutan array bisa membuat kandidat pengganti untuk slot A
  // (yang diproses lebih dulu) "menabrak" slot B yang sebenarnya valid sejak awal tapi posisinya
  // belakangan — melanggar Rule 6 (assignment valid sejak awal tidak boleh ikut berubah).
  const countByCode = new Map();
  slots.forEach(sl=> countByCode.set(sl.obj.operator, (countByCode.get(sl.obj.operator)||0)+1));
  slots.forEach(sl=>{ if(countByCode.get(sl.obj.operator)===1) used.set(sl.obj.operator, sl.label); });
  slots.forEach(sl=>{
    const code = sl.obj.operator;
    sl.obj._opConflictUnresolved = false;
    if(countByCode.get(code)===1) return; // sudah direservasi di atas, sejak awal valid, tidak disentuh
    if(used.get(code)===undefined){ used.set(code, sl.label); return; } // kemunculan pertama dari kode yang bentrok -> dipertahankan
    const holderLabel = used.get(code);
    let pool = (sl.pool()||[]).slice().sort((a,b)=> String(a.value).localeCompare(String(b.value)));
    let cand = pool.find(o=> !used.has(o.value));
    if(!cand){
      // fallback: gabungan semua pool operator-like yang aktif, belum dipakai jam ini (Rule 5)
      const fallbackPool = ['operator','operatorDozer','operatorGrader','driverWT']
        .flatMap(k=> ADMIN_LOOKUP_CACHE[k]||[])
        .sort((a,b)=> String(a.value).localeCompare(String(b.value)));
      cand = fallbackPool.find(o=> !used.has(o.value));
    }
    if(cand){
      sl.obj.operator = cand.value;
      sl.obj._opAutoReassigned = true;
      used.set(cand.value, sl.label);
      console.log(`[OPERATOR CONFLICT]\nDATE=${DI.date}\nSHIFT=${DI.shift}\nHOUR=${diHourLabel(h)}\nOPERATOR=${code}\n\nOriginal:\n${holderLabel}\n\nConflict:\n${sl.label}\n\nReassigned:\n${cand.value}\n\nReason:\noperator already used in same hour`);
    } else {
      sl.obj.operator = '';
      sl.obj._opConflictUnresolved = true;
      console.log(`[OPERATOR CONFLICT]\nDATE=${DI.date}\nSHIFT=${DI.shift}\nHOUR=${diHourLabel(h)}\nOPERATOR=${code}\n\nOriginal:\n${holderLabel}\n\nConflict:\n${sl.label}\n\nReassigned:\n(tidak ada operator available — assignment dikosongkan)`);
    }
  });
}
function diResolveOperatorConflictsAll(){ Object.keys(DI.forms||{}).forEach(h=>{ if(!DI.dirty.has(+h)) diResolveOperatorConflicts(+h); }); }

let ADMIN_LOOKUP_CACHE = {};          // cache dropdown FK
let ADMIN_LAST_UPDATE = null;
let adminRealtimeStatus = 'CONNECTING';
let adminRealtimeChannel = null;
let adminReloadScheduled = false;

/* ---------- LOOKUP (FK) DEFINITIONS ----------
   [SUPABASE REWIRE 2026-09] Dipetakan ulang ke tabel & kolom nyata di project
   "Bangun data tambang" (gdfvzfqherygmiqyvvsy), hasil audit Supabase langsung
   (list_tables + sample rows), BUKAN asumsi dari kode lama.
   PENTING: semua FK transaksi di schema ini pakai kolom *_code (text), BUKAN
   uuid PK internal (fleet_id/unit_id/dst) — jadi value dropdown = *_code.
   Tidak ada tabel pit/crusher/stockpile/breakdown_code/incident_type sama sekali;
   lookup untuk itu sengaja tidak dibuat (lihat AUDIT_MINEBOARD_vs_BANGUN_DATA_TAMBANG.md). */
const LOOKUP_DEFS = {
  shift:    { table:'master_shifts',    idCol:'shift_code',    nameCol:'shift_name' },
  fleet:    { table:'master_fleets',    idCol:'fleet_code',    nameCol:'fleet_name' },
  digger:   { table:'master_units',     idCol:'unit_code',     nameCol:'unit_code',
              // [FIX 2026-09] Filter unit_role_code SAJA tidak cukup — unit Excavator-Support (PC200/
              // SY215C/ZX200/ZX210 LA) juga unit_role_code='EXCAVATOR'. production_classification WAJIB
              // dicek dulu sebagai sumber kebenaran, baru role. TIDAK hardcode nama unit.
              filter:{ production_classification:'PRODUCTION', unit_role_code:'EXCAVATOR', is_active:true } },
  hauler:   { table:'master_units',     idCol:'unit_code',     nameCol:'unit_code',
              filter:{ production_classification:'PRODUCTION', unit_role_code:'HAULER', is_active:true } },
  // Operator digger & driver hauler dibedakan lewat kolom `position` di master_employees
  // (dikonfirmasi via query: "Operator Exca" / "Driver Hauler"), bukan tabel terpisah.
  operator: { table:'master_employees', idCol:'employee_code', nameCol:'employee_name',
              filter:{ position:'Operator Exca', is_active:true } },
  driver:   { table:'master_employees', idCol:'employee_code', nameCol:'employee_name',
              filter:{ position:'Driver Hauler', is_active:true } },
  // [SUPPORT OPERATOR 2026-09] Pool operator Support, difilter per role (final prompt §4).
  // Support Exca SENGAJA pakai lookup `operator` (Operator Exca) yang sama dengan Production —
  // satu pool, bukan pool terpisah (final prompt §6/instruksi awal). Sumber: master_employees.position
  // apa adanya (tidak ada mapping table baru, sesuai instruksi "gunakan pendekatan minimal").
  operatorDozer:  { table:'master_employees', idCol:'employee_code', nameCol:'employee_name',
                    filter:{ position:'Operator Dozer', is_active:true } },
  operatorGrader: { table:'master_employees', idCol:'employee_code', nameCol:'employee_name',
                    filter:{ position:'Operator Grader', is_active:true } },
  // [DRIVER WT] Sumber tunggal: public.master_employees WHERE position='Driver WT' AND is_active=true.
  // TIDAK dari shift_driver_assignment / usual_driver_map / roster_plan / list hardcode. Opsi otomatis
  // mengikuti isi master_employees (tambah/nonaktifkan karyawan -> dropdown ikut). Label: "KODE — Nama".
  driverWT: { table:'master_employees', idCol:'employee_code', nameCol:'employee_name', labelWithCode:true,
              filter:{ position:'Driver WT', is_active:true } },
  material: { table:'master_materials', idCol:'material_code', nameCol:'material_name' },
  location: { table:'master_locations', idCol:'location_code', nameCol:'location_name' },
  delay:    { table:'master_delays',    idCol:'delay_code',    nameCol:'delay_name' },
  idle:     { table:'master_idles',     idCol:'idle_code',     nameCol:'idle_name' },
  // [ADMIN REPAIR 2026-09] Ditambahkan HANYA untuk keperluan Admin CRUD (dropdown FK di form
  // Master Unit / Failure Reason / Rules). Reference field master_unit_roles memang BUKAN uuid
  // (unit_role_id tidak dibuat) — idCol di sini sengaja unit_role_code.
  unitRole: { table:'master_unit_roles', idCol:'unit_role_code', nameCol:'unit_role_name' },
  failureCategory: { table:'master_failure_categories', idCol:'category_id', nameCol:'category_name' },
  // [SUPPORT] Sumber unit Support = master_units, filter by production_classification (BUKAN role),
  // supaya mencakup Dozer/Grader/Water Truck/Excavator-support sekaligus & unit baru di masa depan
  // otomatis ikut tanpa ubah kode. Tidak ada tabel/master baru — audit Supabase 2026-09.
  support:  { table:'master_units',     idCol:'unit_code',     nameCol:'unit_code',
              filter:{ production_classification:'SUPPORT', is_active:true },
              // [SUPPORT OPERATOR 2026-09] extraCols: dibaca getLookup() supaya opts[].unit_role_code
              // tersedia tanpa query tambahan — dipakai diOptSupportOperator() untuk pilih pool operator
              // yang tepat (Dozer/Grader/Exca) berdasarkan role unit Support yang dipilih user.
              extraCols:['unit_role_code'] }
};
async function getLookup(key){
  if(ADMIN_LOOKUP_CACHE[key]) return ADMIN_LOOKUP_CACHE[key];
  const def = LOOKUP_DEFS[key];
  const cols = new Set([def.idCol, def.nameCol]);
  if(def.filter) Object.keys(def.filter).forEach(k=>cols.add(k));
  if(def.extraCols) def.extraCols.forEach(k=>cols.add(k));
  let rows = await fetchAll(def.table, Array.from(cols).join(','));
  if(def.filter){
    rows = rows.filter(r => Object.entries(def.filter).every(([k,v]) => r[k]===v));
  }
  const opts = rows.map(r=>{
    const o = { value:r[def.idCol], label: def.labelWithCode ? `${r[def.idCol]} — ${r[def.nameCol]}` : r[def.nameCol] };
    if(def.extraCols) def.extraCols.forEach(k=> o[k]=r[k]);
    return o;
  });
  ADMIN_LOOKUP_CACHE[key] = opts;
  return opts;
}
function fkLabel(key, value){
  const opts = ADMIN_LOOKUP_CACHE[key] || [];
  const f = opts.find(o=> String(o.value)===String(value));
  return f ? f.label : (value ?? '-');
}

/* ---------- TABLE CONFIGURATIONS ----------
   [ADMIN REPAIR 2026-09] Seluruh konfigurasi di bawah ini DIROMBAK TOTAL agar 100% mengikuti
   SOURCE OF TRUTH schema Supabase nyata (project "Bangun data tambang"), BUKAN skema lama
   (master_shift/master_operator/master_unit/master_fleet/master_pit/master_crusher/
   master_stockpile/master_breakdown_code/master_incident_type/production_daily/
   maintenance_log/crusher_daily/stockpile_daily/sump_daily/safety_incident) — tabel-tabel
   itu TIDAK ADA di database dan referensinya sudah dihapus total dari Admin.
   Tidak ada kolom/PK/relasi yang dikarang; setiap `pk` & `columns` di bawah persis kolom
   yang memang ada di tabel terkait (lihat juga LOOKUP_DEFS di atas untuk kolom yang sudah
   dikonfirmasi lewat audit Supabase langsung). */
const MASTER_TABLES = [
  { key:'master_shifts', label:'Master Shift', pk:'shift_id',
    columns:[
      {key:'shift_id', label:'ID', hideInForm:true},
      {key:'shift_code', label:'Kode Shift', type:'text', required:true},
      {key:'shift_name', label:'Nama Shift', type:'text', required:true},
      {key:'start_time', label:'Jam Mulai', type:'text'},
      {key:'end_time', label:'Jam Selesai', type:'text'},
      {key:'duration_hours', label:'Durasi (Jam)', type:'number'},
      {key:'is_active', label:'Aktif', type:'enum', options:['true','false']}
    ],
    listColumns:[ {key:'shift_code',label:'Kode'}, {key:'shift_name',label:'Nama Shift'},
      {key:'start_time',label:'Mulai'}, {key:'end_time',label:'Selesai'}, {key:'duration_hours',label:'Durasi (Jam)'}, {key:'is_active',label:'Aktif'} ]
  },
  { key:'master_fleets', label:'Master Fleet', pk:'fleet_id',
    columns:[
      {key:'fleet_id', label:'ID', hideInForm:true},
      {key:'fleet_code', label:'Kode Fleet', type:'text', required:true},
      {key:'fleet_name', label:'Nama Fleet', type:'text', required:true},
      {key:'description', label:'Deskripsi', type:'text'},
      {key:'target_digger_count', label:'Target Jumlah Digger', type:'number'},
      {key:'target_hauler_count', label:'Target Jumlah Hauler', type:'number'},
      {key:'is_active', label:'Aktif', type:'enum', options:['true','false']}
    ],
    listColumns:[ {key:'fleet_code',label:'Kode'}, {key:'fleet_name',label:'Nama Fleet'},
      {key:'target_digger_count',label:'Target Digger'}, {key:'target_hauler_count',label:'Target Hauler'}, {key:'is_active',label:'Aktif'} ]
  },
  // [NEEDS VERIFICATION] master_units: dokumen sumber schema (bagian B.3) hanya menyebut "gunakan
  // kolom yang benar-benar tersedia" tanpa daftar lengkap. Kolom di bawah adalah kolom yang sudah
  // TERBUKTI dipakai & terbaca oleh kode lain di aplikasi ini (loadAllData/LOOKUP_DEFS) via query
  // Supabase langsung: unit_code, unit_name, unit_role_code, equipment_type, equipment_category,
  // capacity, production_classification, is_active. Tidak ditemukan kolom `unit_id`/PK UUID yang
  // dipakai di manapun pada kode ini — unit_code dipakai sebagai identifier unik di semua tempat,
  // sehingga dipakai sebagai `pk` di sini. Jika master_units punya PK UUID terpisah yang belum
  // pernah dibaca kode ini, mohon konfirmasi agar bisa disesuaikan.
  { key:'master_units', label:'Master Unit', pk:'unit_code',
    columns:[
      {key:'unit_code', label:'Kode Unit', type:'text', required:true},
      {key:'unit_name', label:'Nama Unit', type:'text', required:true},
      {key:'unit_role_code', label:'Role Unit', type:'fk', lookupKey:'unitRole', required:true},
      {key:'equipment_type', label:'Tipe Equipment', type:'text'},
      {key:'equipment_category', label:'Kategori Equipment', type:'text'},
      {key:'capacity', label:'Kapasitas', type:'number'},
      {key:'is_active', label:'Aktif', type:'enum', options:['true','false']}
    ],
    listColumns:[ {key:'unit_code',label:'Kode Unit'}, {key:'unit_name',label:'Nama Unit'},
      {key:'unit_role_code',label:'Role'}, {key:'equipment_type',label:'Tipe'}, {key:'equipment_category',label:'Kategori'},
      {key:'capacity',label:'Kapasitas'}, {key:'is_active',label:'Aktif'} ]
  },
  // Primary/reference field master_unit_roles BUKAN uuid unit_role_id — pakai unit_role_code
  // langsung sesuai instruksi eksplisit (jangan membuat unit_role_id).
  { key:'master_unit_roles', label:'Master Unit Role', pk:'unit_role_code',
    columns:[
      {key:'unit_role_code', label:'Kode Role', type:'text', required:true},
      {key:'unit_role_name', label:'Nama Role', type:'text', required:true},
      {key:'is_active', label:'Aktif', type:'enum', options:['true','false']}
    ],
    listColumns:[ {key:'unit_role_code',label:'Kode'}, {key:'unit_role_name',label:'Nama Role'}, {key:'is_active',label:'Aktif'} ]
  },
  { key:'master_employees', label:'Master Employee', pk:'employee_id',
    columns:[
      {key:'employee_id', label:'ID', hideInForm:true},
      {key:'employee_code', label:'Kode Employee', type:'text', required:true},
      {key:'employee_name', label:'Nama', type:'text', required:true},
      {key:'position', label:'Posisi', type:'text'},
      {key:'employee_type', label:'Tipe Employee', type:'text'},
      {key:'employment_status', label:'Status Kepegawaian', type:'text'},
      {key:'department', label:'Departemen', type:'text'},
      {key:'join_date', label:'Tanggal Bergabung', type:'date'},
      {key:'notes', label:'Catatan', type:'text'},
      {key:'needs_review', label:'Perlu Ditinjau', type:'enum', options:['true','false']},
      {key:'is_active', label:'Aktif', type:'enum', options:['true','false']}
    ],
    listColumns:[ {key:'employee_code',label:'Kode'}, {key:'employee_name',label:'Nama'}, {key:'position',label:'Posisi'},
      {key:'department',label:'Departemen'}, {key:'employment_status',label:'Status'}, {key:'is_active',label:'Aktif'} ]
  },
  { key:'master_materials', label:'Master Material', pk:'material_id',
    columns:[
      {key:'material_id', label:'ID', hideInForm:true},
      {key:'material_code', label:'Kode Material', type:'text', required:true},
      {key:'material_name', label:'Nama Material', type:'text', required:true},
      {key:'material_category', label:'Kategori', type:'text'},
      {key:'production_stream', label:'Production Stream', type:'text'},
      {key:'density_t_bcm', label:'Density (t/BCM)', type:'number'},
      {key:'density_unit', label:'Unit Density', type:'text'},
      {key:'default_payload_ton', label:'Default Payload (Ton)', type:'number'},
      {key:'payload_unit', label:'Unit Payload', type:'text'},
      {key:'notes', label:'Catatan', type:'text'},
      {key:'is_active', label:'Aktif', type:'enum', options:['true','false']}
    ],
    listColumns:[ {key:'material_code',label:'Kode'}, {key:'material_name',label:'Nama Material'}, {key:'material_category',label:'Kategori'},
      {key:'production_stream',label:'Stream'}, {key:'density_t_bcm',label:'Density'}, {key:'is_active',label:'Aktif'} ]
  },
  { key:'master_locations', label:'Master Location', pk:'location_id',
    columns:[
      {key:'location_id', label:'ID', hideInForm:true},
      {key:'location_code', label:'Kode Lokasi', type:'text', required:true},
      {key:'location_name', label:'Nama Lokasi', type:'text', required:true},
      {key:'location_type', label:'Tipe Lokasi', type:'text'},
      {key:'parent_location_id', label:'Parent Location', type:'text'},
      {key:'notes', label:'Catatan', type:'text'},
      {key:'is_active', label:'Aktif', type:'enum', options:['true','false']}
    ],
    listColumns:[ {key:'location_code',label:'Kode'}, {key:'location_name',label:'Nama Lokasi'}, {key:'location_type',label:'Tipe'}, {key:'is_active',label:'Aktif'} ]
  },
  { key:'master_delays', label:'Master Delay', pk:'delay_id',
    columns:[
      {key:'delay_id', label:'ID', hideInForm:true},
      {key:'delay_code', label:'Kode Delay', type:'text', required:true},
      {key:'delay_name', label:'Nama Delay', type:'text', required:true},
      {key:'category', label:'Kategori', type:'text'},
      {key:'description', label:'Deskripsi', type:'text'},
      {key:'is_active', label:'Aktif', type:'enum', options:['true','false']}
    ],
    listColumns:[ {key:'delay_code',label:'Kode'}, {key:'delay_name',label:'Nama Delay'}, {key:'category',label:'Kategori'}, {key:'is_active',label:'Aktif'} ]
  },
  { key:'master_idles', label:'Master Idle', pk:'idle_id',
    columns:[
      {key:'idle_id', label:'ID', hideInForm:true},
      {key:'idle_code', label:'Kode Idle', type:'text', required:true},
      {key:'idle_name', label:'Nama Idle', type:'text', required:true},
      {key:'category', label:'Kategori', type:'text'},
      {key:'is_global_event_capable', label:'Bisa Event Global', type:'enum', options:['true','false']},
      {key:'is_active', label:'Aktif', type:'enum', options:['true','false']}
    ],
    listColumns:[ {key:'idle_code',label:'Kode'}, {key:'idle_name',label:'Nama Idle'}, {key:'category',label:'Kategori'},
      {key:'is_global_event_capable',label:'Global?'}, {key:'is_active',label:'Aktif'} ]
  },
  { key:'master_failure_categories', label:'Failure Category', pk:'category_id',
    columns:[
      {key:'category_id', label:'ID', hideInForm:true},
      {key:'category_code', label:'Kode Kategori', type:'text', required:true},
      {key:'category_name', label:'Nama Kategori', type:'text', required:true},
      {key:'description', label:'Deskripsi', type:'text'},
      {key:'is_active', label:'Aktif', type:'enum', options:['true','false']}
    ],
    listColumns:[ {key:'category_code',label:'Kode'}, {key:'category_name',label:'Nama Kategori'}, {key:'is_active',label:'Aktif'} ]
  },
  { key:'master_failure_reasons', label:'Failure Reason', pk:'reason_id',
    columns:[
      {key:'reason_id', label:'ID', hideInForm:true},
      {key:'reason_code', label:'Kode Reason', type:'text', required:true},
      {key:'reason_name', label:'Nama Reason', type:'text', required:true},
      {key:'category_id', label:'Kategori', type:'fk', lookupKey:'failureCategory', required:true},
      {key:'description', label:'Deskripsi', type:'text'},
      {key:'is_active', label:'Aktif', type:'enum', options:['true','false']}
    ],
    listColumns:[ {key:'reason_code',label:'Kode'}, {key:'reason_name',label:'Nama Reason'},
      {key:'category_id',label:'Kategori',render:v=>fkLabel('failureCategory',v)}, {key:'is_active',label:'Aktif'} ]
  },
  { key:'master_material_haul_conversions', label:'Material Haul Conversion', pk:'conversion_id',
    columns:[
      {key:'conversion_id', label:'ID', hideInForm:true},
      {key:'material_code', label:'Kode Material', type:'fk', lookupKey:'material', required:true},
      {key:'haul_code', label:'Kode Hauler', type:'text', required:true},
      {key:'value_per_rit', label:'Value per Rit', type:'number'},
      {key:'unit', label:'Unit', type:'text'},
      {key:'notes', label:'Catatan', type:'text'},
      {key:'is_active', label:'Aktif', type:'enum', options:['true','false']}
    ],
    listColumns:[ {key:'material_code',label:'Material',render:v=>fkLabel('material',v)}, {key:'haul_code',label:'Kode Hauler'},
      {key:'value_per_rit',label:'Value/Rit'}, {key:'unit',label:'Unit'}, {key:'is_active',label:'Aktif'} ]
  },
  // Rule/configuration table (bukan Master Idle) — idle_code + unit_role_code + production_classification -> affected.
  { key:'weather_equipment_rules', label:'Rules: Weather ↔ Equipment', pk:'rule_id',
    columns:[
      {key:'rule_id', label:'ID', hideInForm:true},
      {key:'idle_code', label:'Kode Idle (Cuaca)', type:'fk', lookupKey:'idle', required:true},
      {key:'production_classification', label:'Klasifikasi Produksi (kosong = semua)', type:'text'},
      {key:'unit_role_code', label:'Role Unit (kosong = semua)', type:'fk', lookupKey:'unitRole'},
      {key:'affected', label:'Terdampak', type:'enum', options:['true','false'], required:true},
      {key:'notes', label:'Catatan', type:'text'},
      {key:'is_active', label:'Aktif', type:'enum', options:['true','false']}
    ],
    listColumns:[ {key:'idle_code',label:'Idle Code',render:v=>fkLabel('idle',v)}, {key:'production_classification',label:'Klasifikasi'},
      {key:'unit_role_code',label:'Role'}, {key:'affected',label:'Terdampak'}, {key:'is_active',label:'Aktif'} ]
  }
];

/* Transaction Data: SEMUA tabel di bawah ditampilkan READ-ONLY (list/search/filter/export saja,
   tanpa Tambah/Edit/Hapus/Import CSV) — sesuai instruksi §G ("Jangan mengarang CRUD jika struktur
   transaction memang tidak dirancang untuk manual editing"). Semua tabel ini adalah hasil proses
   Daily Input, calculation engine, atau derivasi otomatis (weather_daily dari idle_events, dst);
   mengedit lewat form generik Admin berisiko membuat data yang tidak konsisten dengan proses yang
   sudah ada dan tidak diminta secara eksplisit oleh instruksi. Admin tetap bisa MELIHAT & MENCARI
   semua data transaksi ini secara real dari Supabase (bukan dummy).
   readOnly:true -> disembunyikan dari UI CRUD (lihat drawAdminTable). */
const TRANSACTION_TABLES = [
  { key:'production_actual', label:'Production Actual', pk:'actual_id', readOnly:true,
    listColumns:[
      {key:'actual_date',label:'Tanggal'}, {key:'shift_code',label:'Shift'}, {key:'hour_label',label:'Jam'},
      {key:'fleet_code',label:'Fleet'}, {key:'digger_unit_code',label:'Digger'}, {key:'hauler_unit_code',label:'Hauler'},
      {key:'operator_code',label:'Operator'}, {key:'driver_code',label:'Driver'}, {key:'location_code',label:'Lokasi'},
      {key:'material_code',label:'Material'}, {key:'ritase',label:'Ritase'}, {key:'payload',label:'Payload'},
      {key:'production_volume',label:'Volume'}, {key:'volume_unit',label:'Unit'}
    ]
  },
  { key:'unit_status_actual', label:'Unit Status Actual', pk:'status_id', readOnly:true,
    listColumns:[
      {key:'status_date',label:'Tanggal'}, {key:'shift_code',label:'Shift'}, {key:'hour_label',label:'Jam'},
      {key:'unit_code',label:'Unit'}, {key:'fleet_code',label:'Fleet'}, {key:'status',label:'Status'},
      {key:'category',label:'Kategori',render:v=>esc(getCategoryLabel(v)||'-')}, {key:'sub_reason',label:'Sub Alasan'}, {key:'duration_hours',label:'Durasi (Jam)'},
      {key:'data_source',label:'Sumber'}
    ]
  },
  { key:'fuel_actual', label:'Fuel Actual', pk:'fuel_id', readOnly:true,
    listColumns:[
      {key:'fuel_date',label:'Tanggal'}, {key:'shift_code',label:'Shift'}, {key:'unit_code',label:'Unit'},
      {key:'fleet_code',label:'Fleet'}, {key:'fuel_liters',label:'Fuel (Liter)'}, {key:'operating_hours',label:'Jam Operasi'},
      {key:'data_source',label:'Sumber'}
    ]
  },
  { key:'delay_events', label:'Delay Events', pk:'delay_event_id', readOnly:true,
    listColumns:[
      {key:'event_date',label:'Tanggal'}, {key:'shift_code',label:'Shift'}, {key:'hour_label',label:'Jam'},
      {key:'fleet_code',label:'Fleet'}, {key:'unit_code',label:'Unit'}, {key:'delay_code',label:'Kode Delay'},
      {key:'duration_hours',label:'Durasi (Jam)'}
    ]
  },
  { key:'idle_events', label:'Idle Events', pk:'idle_event_id', readOnly:true,
    listColumns:[
      {key:'event_date',label:'Tanggal'}, {key:'shift_code',label:'Shift'}, {key:'scope',label:'Scope'},
      {key:'fleet_code',label:'Fleet'}, {key:'unit_code',label:'Unit'}, {key:'idle_code',label:'Kode Idle'},
      {key:'duration_hours',label:'Durasi (Jam)'}, {key:'rainfall_mm',label:'Hujan (mm)'}
    ]
  },
  { key:'unit_hm_actual', label:'Unit HM Actual', pk:'hm_id', readOnly:true,
    listColumns:[
      {key:'actual_date',label:'Tanggal'}, {key:'shift_code',label:'Shift'}, {key:'hour_label',label:'Jam'},
      {key:'unit_code',label:'Unit'}, {key:'hm_start',label:'HM Awal'}, {key:'hm_end',label:'HM Akhir'},
      {key:'operating_hours',label:'Jam Operasi'}, {key:'data_source',label:'Sumber'}
    ]
  },
  { key:'attendance_actual', label:'Attendance Actual', pk:'attendance_id', readOnly:true,
    listColumns:[
      {key:'attendance_date',label:'Tanggal'}, {key:'shift_code',label:'Shift'}, {key:'employee_code',label:'Employee'},
      {key:'status',label:'Status'}, {key:'replacement_employee_code',label:'Pengganti'}
    ]
  },
  { key:'roster_plan', label:'Roster Plan', pk:'roster_id', readOnly:true,
    listColumns:[
      {key:'roster_date',label:'Tanggal'}, {key:'shift_code',label:'Shift'}, {key:'employee_code',label:'Employee'},
      {key:'fleet_code',label:'Fleet'}, {key:'planned_role',label:'Role Rencana'}
    ]
  },
  { key:'shift_driver_assignment', label:'Shift Driver Assignment', pk:'assignment_date', readOnly:true,
    listColumns:[
      {key:'assignment_date',label:'Tanggal'}, {key:'shift_code',label:'Shift'}, {key:'fleet_code',label:'Fleet'},
      {key:'hauler_unit_code',label:'Hauler'}, {key:'driver_code',label:'Driver'}, {key:'driver_status',label:'Status'},
      {key:'assignment_source',label:'Sumber'}, {key:'assignment_confidence',label:'Confidence'}
    ]
  },
  { key:'shift_hauler_assignment', label:'Shift Hauler Assignment', pk:'assignment_date', readOnly:true,
    listColumns:[
      {key:'assignment_date',label:'Tanggal'}, {key:'shift_code',label:'Shift'}, {key:'fleet_code',label:'Fleet'},
      {key:'slot_idx',label:'Slot'}, {key:'hauler_unit_code',label:'Hauler'}, {key:'is_substitution',label:'Substitusi?'},
      {key:'reason',label:'Alasan'}, {key:'assignment_source',label:'Sumber'}
    ]
  },
  { key:'weather_daily', label:'Weather Daily', pk:'weather_date', readOnly:true,
    listColumns:[
      {key:'weather_date',label:'Tanggal'}, {key:'condition',label:'Kondisi'}, {key:'rain_hours',label:'Jam Hujan'},
      {key:'slippery_hours',label:'Jam Licin'}, {key:'fog_hours',label:'Jam Kabut'}
    ]
  },
  { key:'survey_weekly', label:'Survey Weekly', pk:'survey_id', readOnly:true,
    listColumns:[
      {key:'week_start',label:'Mulai Minggu'}, {key:'week_end',label:'Akhir Minggu'}, {key:'material_code',label:'Material'},
      {key:'plan_volume',label:'Plan'}, {key:'mcc_volume',label:'MCC'}, {key:'survey_volume',label:'Survey'},
      {key:'variance',label:'Variance'}, {key:'variance_pct',label:'Variance %'}, {key:'volume_unit',label:'Unit'}
    ]
  }
];
const ALL_ADMIN_TABLES = [...MASTER_TABLES, ...TRANSACTION_TABLES];
function getTableConfig(key){ return ALL_ADMIN_TABLES.find(c=> c.key===key); }

/* ---------- UI PRIMITIVES: MODAL / TOAST / CONFIRM ---------- */
function ensureAdminUI(){
  if(!document.getElementById('admModalRoot')){
    const d = document.createElement('div'); d.id='admModalRoot'; document.body.appendChild(d);
  }
  if(!document.getElementById('admToastRoot')){
    const d = document.createElement('div'); d.id='admToastRoot'; d.className='adm-toast-wrap no-print'; document.body.appendChild(d);
  }
}
function showToast(msg, type='info'){
  ensureAdminUI();
  const root = document.getElementById('admToastRoot');
  const icon = type==='success' ? '✅' : type==='error' ? '⚠️' : 'ℹ️';
  const el = document.createElement('div');
  el.className = `adm-toast ${type}`;
  el.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  root.appendChild(el);
  setTimeout(()=>{ el.style.transition='opacity .3s'; el.style.opacity='0'; setTimeout(()=> el.remove(), 300); }, 3500);
}
function closeAdminModal(id){ const el=document.getElementById(id); if(el) el.remove(); }
function openConfirmModal(message, onConfirm){
  ensureAdminUI();
  const id = 'admConfirm_'+Date.now();
  const html = `
    <div class="adm-modal-overlay" id="${id}">
      <div class="adm-modal adm-modal-sm">
        <div class="panel-title mb-3">Konfirmasi</div>
        <div class="text-sm mb-4" style="color:var(--text-dim)">${message}</div>
        <div class="flex justify-end gap-2">
          <button class="btn" onclick="closeAdminModal('${id}')">Batal</button>
          <button class="btn" style="border-color:var(--danger); color:var(--danger)" id="${id}_ok">Ya, Lanjutkan</button>
        </div>
      </div>
    </div>`;
  document.getElementById('admModalRoot').insertAdjacentHTML('beforeend', html);
  document.getElementById(id+'_ok').onclick = async ()=>{ closeAdminModal(id); await onConfirm(); };
}

/* ---------- AUDIT LOG ----------
   [ADMIN REPAIR 2026-09] Database TIDAK memiliki `system_logs` dan tabel itu TIDAK dibuat.
   Perubahan pada tabel Master Data (INSERT/UPDATE/DELETE via Admin) direkam apa adanya oleh
   Supabase/trigger DB yang sudah ada di project ini (di luar kendali file ini). Event non-DML
   (LOGIN/LOGOUT/EXPORT) TIDAK memiliki tabel tujuan yang sesuai — `repair_audit_log` khusus
   untuk proses repair per-field, bukan log aktivitas umum — sehingga fungsi ini sengaja dibuat
   sebagai no-op yang aman (tidak menulis ke tabel apapun, tidak membuat tabel baru). */
function adminSessionUser(){ return currentAdminSession?.user?.email || 'admin'; }
async function logAdminEvent(action, description){
  // Sengaja no-op: tidak ada tabel generic activity log di database ini (lihat catatan di atas).
  console.info(`[Admin] ${action}: ${description}`);
}

/* ---------- REALTIME SYNC ---------- */
function scheduleGlobalReload(immediate=false){
  if(adminReloadScheduled) return;
  adminReloadScheduled = true;
  setTimeout(async ()=>{
    adminReloadScheduled = false;
    try{
      await loadAllData({ background:true });
      ADMIN_LAST_UPDATE = new Date();
      buildFilterBar();
      renderPage();
    }catch(err){ console.warn('Gagal memuat ulang data realtime:', err); }
  }, immediate ? 50 : 700);
}
function initAdminRealtimeSubscriptions(){
  try{
    const tables = [...new Set(ALL_ADMIN_TABLES.map(t=>t.key))];
    const channel = sb.channel('mineboard-admin-realtime');
    tables.forEach(t=> channel.on('postgres_changes', { event:'*', schema:'public', table:t }, ()=> scheduleGlobalReload()));
    channel.subscribe(status=>{ adminRealtimeStatus = status; if(currentPage==='admin') renderPage(); });
    adminRealtimeChannel = channel;
  }catch(err){ console.warn('Gagal inisialisasi Supabase Realtime:', err); adminRealtimeStatus='ERROR'; }
}

/* ---------- LOGIN / SESSION (REAL SUPABASE AUTH) ----------
   Login admin memakai Supabase Auth (email+password) yang sesungguhnya, BUKAN flag
   sessionStorage, agar RLS pada tabel Master/Transaction/repair_audit_log benar-benar
   ditegakkan oleh database, bukan cuma UI. [ADMIN REPAIR 2026-09] Catatan lama di sini
   menyebut `system_logs`/`admin_users`/`audit_log_setup.sql` — tabel `system_logs` TIDAK
   ada dan TIDAK dibuat; jika project ini memang punya mekanisme admin_users/RLS terpisah,
   itu di luar kendali file ini dan tidak diubah oleh perbaikan ini. */
let currentAdminSession = null;
function isAdminLoggedIn(){ return !!currentAdminSession; }
function renderAdminLoginScreen(){
  return `
  <div class="adm-login-wrap">
    <div class="glass adm-login-card">
      <div class="text-center mb-4">
        <div class="w-12 h-12 rounded-lg mx-auto flex items-center justify-center mb-3" style="background:var(--accent-soft); color:var(--accent);">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <div class="panel-title">ADMIN LOGIN</div>
        <div class="panel-sub mt-1">Masuk untuk mengelola database MINEBOARD</div>
      </div>
      <div class="adm-field"><label class="adm-label">Email</label><input type="email" class="adm-input" id="admLoginUser" placeholder="admin@mineboard.id"></div>
      <div class="adm-field"><label class="adm-label">Password</label><input type="password" class="adm-input" id="admLoginPass" placeholder="••••••••" onkeydown="if(event.key==='Enter') adminLogin()"></div>
      <div id="admLoginErr" class="text-xs mb-2" style="color:var(--danger)"></div>
      <button class="btn btn-accent w-full justify-center" id="admLoginBtn" onclick="adminLogin()">🔐 Login</button>
    </div>
  </div>`;
}
async function adminLogin(){
  const email = (document.getElementById('admLoginUser').value||'').trim();
  const pass = (document.getElementById('admLoginPass').value||'').trim();
  const errEl = document.getElementById('admLoginErr');
  const btn = document.getElementById('admLoginBtn');
  errEl.textContent = '';
  btn.disabled = true; btn.textContent = 'Memproses...';
  try{
    const { data, error } = await sb.auth.signInWithPassword({ email, password:pass });
    if(error) throw error;
    currentAdminSession = data.session;
    await logAdminEvent('LOGIN', 'Login berhasil ke panel admin');
    showToast('Login berhasil','success');
    adminActiveTab='dashboard'; adminActiveTable=null;
    renderPage();
  }catch(err){
    errEl.textContent = 'Email atau password salah, atau akun belum terdaftar sebagai admin.';
  }finally{
    btn.disabled = false; btn.textContent = '🔐 Login';
  }
}
function adminLogout(){
  openConfirmModal('Keluar dari sesi Admin?', async ()=>{
    await logAdminEvent('LOGOUT', 'Logout dari panel admin');
    await sb.auth.signOut();
    currentAdminSession = null;
    showToast('Berhasil logout','info');
    navigate('overview');
  });
}

/* ---------- ADMIN SHELL / TABS ---------- */
function renderAdminShell(){
  return `
  <div class="flex items-center justify-between mb-4 flex-wrap gap-2 no-print">
    <div class="flex items-center gap-2">
      <span class="tag">🔐 ${adminSessionUser()}</span>
      <span class="text-xs" style="color:var(--text-faint)">Sesi Administrator Aktif</span>
    </div>
    <button class="btn" onclick="adminLogout()">↩ Logout</button>
  </div>
  <div class="adm-tabs no-print">
    <div class="adm-tab ${adminActiveTab==='dashboard'?'active':''}" onclick="setAdminTab('dashboard')">📊 Dashboard</div>
    <div class="adm-tab ${adminActiveTab==='master'?'active':''}" onclick="setAdminTab('master')">🗂 Master Data</div>
    <div class="adm-tab ${adminActiveTab==='transaction'?'active':''}" onclick="setAdminTab('transaction')">📑 Transaction Data</div>
    <div class="adm-tab ${adminActiveTab==='auditlog'?'active':''}" onclick="setAdminTab('auditlog')">📜 Repair Audit Log</div>
  </div>
  <div id="admTabContent"></div>
  `;
}
/* [AUDIT FIX 2026-09 P1-10] admRenderTok: token anti stale-render untuk panel Admin, pola sama
   persis dengan DI._tok yang sudah dipakai di Daily Input. ROOT CAUSE: renderAdminDashboardTab()
   dan openAdminTable() sama-sama async (await Supabase) dan menulis ke #admTabContent (elemen
   DOM yang SAMA, dipakai ulang terus-menerus, bukan dibuat baru tiap render) SETELAH await
   selesai. Kalau user berpindah tab Admin dengan cepat (mis. buka Dashboard -> langsung buka
   tabel Master lain sebelum query count Dashboard selesai), respons Dashboard yang telat akan
   MENIMPA tabel yang baru saja user buka — persis pola "request A mulai, request B mulai &
   selesai duluan, request A menimpa belakangan" yang diminta diaudit. Setiap pemanggilan
   renderAdminTabContent()/openAdminTable() menaikkan token; hasil async dibuang kalau token
   sudah berubah saat itu selesai. Tidak mengubah query/data/urutan apa pun. */
let admRenderTok = 0;
function setAdminTab(tab){ adminActiveTab = tab; adminActiveTable = null; renderPage(); }
function renderAdminTabContent(){
  const wrap = document.getElementById('admTabContent');
  if(!wrap) return;
  admRenderTok++;
  if(adminActiveTab==='dashboard'){ renderAdminDashboardTab(wrap, admRenderTok); return; }
  if(adminActiveTab==='auditlog'){ renderAdminAuditLogTab(wrap); return; }
  const list = adminActiveTab==='master' ? MASTER_TABLES : TRANSACTION_TABLES;
  if(adminActiveTable){ openAdminTable(null, adminActiveTable); return; }
  wrap.innerHTML = `<div class="adm-grid-picker">${list.map(cfg=>`
    <div class="glass glass-hover p-5 adm-pick-card" onclick="adminActiveTable='${cfg.key}'; openAdminTable(null,'${cfg.key}');">
      <div class="panel-title">${cfg.label} ${cfg.readOnly?'<span class="tag" style="font-size:10px">READ-ONLY</span>':''}</div>
      <div class="panel-sub mt-1 font-mono">${cfg.key}</div>
    </div>`).join('')}</div>`;
}
function render_admin(data, el){
  ensureAdminUI();
  if(!isAdminLoggedIn()){ el.innerHTML = renderAdminLoginScreen(); return; }
  el.innerHTML = renderAdminShell();
  renderAdminTabContent();
}

/* ---------- ADMIN DASHBOARD TAB ---------- */
async function renderAdminDashboardTab(wrap, tok){
  wrap.innerHTML = `<div class="glass p-6 text-center" style="color:var(--text-dim)"><span class="adm-spinner-sm"></span> Memuat ringkasan admin...</div>`;
  let masterTotal = 0, transactionTotal = 0, connStatus = 'Checking...', connColor = 'var(--text-faint)';
  try{
    // [ADMIN REPAIR 2026-09] Hitung total baris LANGSUNG dari tabel Supabase nyata yang dipakai
    // MASTER_TABLES/TRANSACTION_TABLES (bukan lagi master_crusher/master_stockpile/dst yang tidak
    // ada di database, dan bukan lagi MAINT_LOG/SAFETY_LOG yang sudah tidak punya tabel sumber).
    const masterCounts = await Promise.all(MASTER_TABLES.map(t=> sb.from(t.key).select('*',{count:'exact',head:true})));
    const txCounts = await Promise.all(TRANSACTION_TABLES.map(t=> sb.from(t.key).select('*',{count:'exact',head:true})));
    masterTotal = masterCounts.reduce((a,r)=> a + (r.count||0), 0);
    transactionTotal = txCounts.reduce((a,r)=> a + (r.count||0), 0);
    connStatus = 'Connected'; connColor = 'var(--success)';
  }catch(err){ connStatus = 'Disconnected'; connColor = 'var(--danger)'; }
  // [AUDIT FIX 2026-09 P1-10] Kalau user sudah pindah tab/tabel Admin lagi selagi query count di
  // atas berjalan, admRenderTok sudah berubah -> buang hasil ini, jangan timpa apa yang sedang
  // ditampilkan sekarang.
  if(tok !== admRenderTok) return;

  const rtLabelMap = { SUBSCRIBED:'Live / Aktif', TIMED_OUT:'Timeout', CLOSED:'Terputus', CHANNEL_ERROR:'Error', CONNECTING:'Menghubungkan...' };
  const rtLabel = rtLabelMap[adminRealtimeStatus] || adminRealtimeStatus;
  const rtColor = adminRealtimeStatus==='SUBSCRIBED' ? 'var(--success)' : (adminRealtimeStatus==='CONNECTING' ? 'var(--warning)' : 'var(--danger)');

  const cards = [
    ['🗂','Total Master Data', masterTotal.toLocaleString('id-ID'), 'var(--accent)'],
    ['📑','Total Transaction Records', transactionTotal.toLocaleString('id-ID'), 'var(--info)'],
    ['🚜','Total Equipment (master_units)', UNITS.length.toLocaleString('id-ID'), 'var(--teal)'],
    ['👷','Total Employee (master_employees)', (OPERATORS.length + (typeof DRIVERS!=='undefined'?DRIVERS.length:0)).toLocaleString('id-ID'), 'var(--violet)'],
    ['🚛','Total Fleet', FLEET_DEFS.length.toLocaleString('id-ID'), 'var(--warning)'],
    ['🕒','Last Database Update', ADMIN_LAST_UPDATE ? ADMIN_LAST_UPDATE.toLocaleTimeString('id-ID') : '-', 'var(--text)']
  ];

  wrap.innerHTML = `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      ${cards.map(c=>`
        <div class="glass glass-hover kpi-card">
          <div class="flex items-center justify-between"><span class="tag">${c[0]}</span></div>
          <div class="kpi-value mt-2" style="color:${c[3]}"><span>${c[2]}</span></div>
          <div class="kpi-label mt-1">${c[1]}</div>
        </div>`).join('')}
      <div class="glass glass-hover kpi-card">
        <div class="flex items-center justify-between"><span class="tag">🔌</span></div>
        <div class="kpi-value mt-2" style="color:${connColor}"><span class="adm-status-dot" style="background:${connColor}"></span>${connStatus}</div>
        <div class="kpi-label mt-1">Supabase Connection</div>
      </div>
      <div class="glass glass-hover kpi-card">
        <div class="flex items-center justify-between"><span class="tag">📡</span></div>
        <div class="kpi-value mt-2" style="color:${rtColor}"><span class="adm-status-dot" style="background:${rtColor}"></span>${rtLabel}</div>
        <div class="kpi-label mt-1">Realtime Status</div>
      </div>
    </div>
    <div class="glass p-5">
      <div class="panel-title mb-2">Ringkasan</div>
      <p class="text-sm" style="color:var(--text-dim)">Panel ini adalah pusat pengelolaan seluruh database MINEBOARD. Perubahan pada Master Data maupun Transaction Data akan langsung tersinkronisasi ke seluruh KPI, chart, dan tabel di dashboard utama secara realtime melalui Supabase Realtime — tanpa perlu memuat ulang browser.</p>
    </div>
  `;
}

/* ---------- ADMIN AUDIT LOG TAB ----------
   [ADMIN REPAIR 2026-09] Database TIDAK memiliki `system_logs` (generic activity log dengan
   changed_by/action/description/old_data/new_data) — tabel itu tidak boleh dibuat. Yang tersedia
   adalah `repair_audit_log`, yaitu audit KHUSUS proses repair/perbaikan data dengan struktur
   per-FIELD (satu baris = satu field yang diperbaiki pada satu record), BUKAN generic system
   activity log. Kolom sebenarnya: log_id, repair_batch, table_name, record_key, field_changed,
   value_before, value_after, reason, rule_applied, repaired_at. Tidak ada changed_by/action/
   description/old_data/new_data — field itu TIDAK dikarang/dipetakan-paksa di sini. Label tab
   diubah menjadi "Repair Audit Log" agar sesuai fungsi sebenarnya. */
let adminAuditState = { rows:[], search:'', table:'', batch:'', rule:'', dateFrom:'', dateTo:'', page:1, pageSize:10 };
let adminAuditRealtimeChannel = null;

function initAuditLogRealtimeSubscription(){
  try{
    if(adminAuditRealtimeChannel) return;
    const channel = sb.channel('mineboard-repair-audit-log-realtime');
    channel.on('postgres_changes', { event:'INSERT', schema:'public', table:'repair_audit_log' }, (payload)=>{
      adminAuditState.rows.unshift(payload.new);
      if(currentPage==='admin' && adminActiveTab==='auditlog') drawAdminAuditLogTable();
    });
    channel.subscribe();
    adminAuditRealtimeChannel = channel;
  }catch(err){ console.warn('Gagal inisialisasi realtime repair audit log:', err); }
}

async function renderAdminAuditLogTab(wrap){
  wrap.innerHTML = `<div id="admAuditRoot" class="glass p-5"><div class="text-center py-6" style="color:var(--text-dim)"><span class="adm-spinner-sm"></span> Memuat repair audit log...</div></div>`;
  try{
    const rows = await fetchAll('repair_audit_log', '*', 'repaired_at');
    adminAuditState.rows = rows.slice().reverse();
    adminAuditState.page = 1;
    drawAdminAuditLogTable();
  }catch(err){
    document.getElementById('admAuditRoot').innerHTML = `<div class="text-xs" style="color:var(--danger)">Gagal memuat tabel <b>repair_audit_log</b>: ${err.message||err}</div>`;
  }
}

function admAuditFiltered(){
  const st = adminAuditState;
  const q = st.search.toLowerCase();
  return st.rows.filter(r=>{
    if(st.table && r.table_name !== st.table) return false;
    if(st.batch && r.repair_batch !== st.batch) return false;
    if(st.rule && r.rule_applied !== st.rule) return false;
    if(st.dateFrom && r.repaired_at < st.dateFrom) return false;
    if(st.dateTo && r.repaired_at > (st.dateTo+'T23:59:59')) return false;
    if(q){
      const hay = `${r.table_name||''} ${r.record_key||''} ${r.field_changed||''} ${r.reason||''} ${r.rule_applied||''} ${r.repair_batch||''}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });
}

function admAuditSummary(r){
  return `${r.field_changed||'-'}: ${JSON.stringify(r.value_before)} → ${JSON.stringify(r.value_after)}`;
}

/* [SEARCH FIX 2026-09] Sama seperti drawAdminTable: hasil (tabel+pagination) dipisah dari
   toolbar filter (yang berisi <input> Cari) supaya mengetik tidak memicu recreate elemen input. */
let adminAuditSearchTimer = null;
function admAuditResultsHTML(){
  const st = adminAuditState;
  const filtered = admAuditFiltered();
  const totalPages = Math.max(1, Math.ceil(filtered.length/st.pageSize));
  if(st.page>totalPages) st.page = totalPages;
  const pageRows = filtered.slice((st.page-1)*st.pageSize, st.page*st.pageSize);
  const root = document.getElementById('admAuditRoot');
  if(root) root._pageRowsTmp = pageRows;
  return `
    <div id="admAuditCaptureArea" class="overflow-x-auto rounded-lg" style="border:1px solid var(--border); max-height:460px; overflow-y:auto;">
    <table class="dtable">
      <thead><tr>
        <th>Waktu</th><th>Batch</th><th>Tabel</th><th>Record Key</th><th>Field</th><th>Sebelum → Sesudah</th><th>Rule</th><th>Alasan</th>
      </tr></thead>
      <tbody>
        ${pageRows.length? pageRows.map((r,i)=>`
          <tr>
            <td class="font-mono text-xs">${r.repaired_at? new Date(r.repaired_at).toLocaleString('id-ID') : '-'}</td>
            <td class="font-mono text-xs">${r.repair_batch||'-'}</td>
            <td>${r.table_name||'-'}</td>
            <td class="font-mono text-xs">${r.record_key??'-'}</td>
            <td>${r.field_changed||'-'}</td>
            <td class="text-xs" style="color:var(--text-dim)">${admAuditSummary(r)}</td>
            <td class="text-xs">${r.rule_applied||'-'}</td>
            <td class="text-xs" style="color:var(--text-faint)">${r.reason||'-'}</td>
          </tr>`).join('') : `<tr><td colspan="8" class="text-center py-6" style="color:var(--text-faint)">Tidak ada log untuk filter ini</td></tr>`}
      </tbody>
    </table>
    </div>
    <div class="flex items-center justify-between mt-2 text-[11px] no-print" style="color:var(--text-faint)">
      <div>${filtered.length} baris log ditemukan</div>
      <div class="flex items-center gap-2">
        <button class="btn !py-1 !px-2" onclick="admAuditGotoPage(${st.page-1})" ${st.page<=1?'disabled':''}>‹</button>
        <span class="font-mono">${st.page} / ${totalPages}</span>
        <button class="btn !py-1 !px-2" onclick="admAuditGotoPage(${st.page+1})" ${st.page>=totalPages?'disabled':''}>›</button>
      </div>
    </div>`;
}
function renderAdminAuditResults(){
  const holder = document.getElementById('admAuditResultsArea');
  if(!holder){ drawAdminAuditLogTable(); return; }
  const html = admAuditResultsHTML();
  holder.innerHTML = html;
  document.getElementById('admAuditRoot')._pageRows = document.getElementById('admAuditRoot')._pageRowsTmp;
}
function drawAdminAuditLogTable(){
  const root = document.getElementById('admAuditRoot');
  if(!root) return;
  const st = adminAuditState;
  const tableOptions = [...new Set(adminAuditState.rows.map(r=>r.table_name).filter(Boolean))].sort();
  const batchOptions = [...new Set(adminAuditState.rows.map(r=>r.repair_batch).filter(Boolean))].sort();
  const ruleOptions = [...new Set(adminAuditState.rows.map(r=>r.rule_applied).filter(Boolean))].sort();

  root.innerHTML = `
    <div class="flex items-center justify-between mb-3 flex-wrap gap-2">
      <div class="panel-title">📜 Repair Audit Log (repair_audit_log)</div>
      <div class="flex items-center gap-1 no-print">
        <button class="btn !py-1.5" onclick="renderAdminTabContent()">🔄 Refresh</button>
        <button class="btn !py-1.5" onclick="admAuditExportCSV()">⬇ CSV</button>
        <button class="btn !py-1.5" onclick="admAuditExportExcel()">⬇ Excel</button>
        <button class="btn !py-1.5" onclick="admAuditExportPDF()">⬇ PDF</button>
      </div>
    </div>
    <div class="text-xs mb-3" style="color:var(--text-faint)">Log ini khusus mencatat proses repair/perbaikan data per-field (bukan log aktivitas umum) — tidak ada kolom user/aksi/before-after JSON karena tabel sumber memang tidak memilikinya.</div>
    <div class="flex items-center gap-2 mb-3 flex-wrap no-print">
      <input type="text" class="adm-input" id="admAuditSearchInput" style="max-width:220px" placeholder="🔎 Cari..." value="${st.search}" oninput="admAuditSetFilter('search',this.value)">
      <select class="adm-input" style="max-width:170px" onchange="admAuditSetFilter('table',this.value)">
        <option value="">Semua Tabel</option>
        ${tableOptions.map(t=>`<option value="${t}" ${st.table===t?'selected':''}>${t}</option>`).join('')}
      </select>
      <select class="adm-input" style="max-width:170px" onchange="admAuditSetFilter('batch',this.value)">
        <option value="">Semua Batch</option>
        ${batchOptions.map(b=>`<option value="${b}" ${st.batch===b?'selected':''}>${b}</option>`).join('')}
      </select>
      <select class="adm-input" style="max-width:170px" onchange="admAuditSetFilter('rule',this.value)">
        <option value="">Semua Rule</option>
        ${ruleOptions.map(rl=>`<option value="${rl}" ${st.rule===rl?'selected':''}>${rl}</option>`).join('')}
      </select>
      <input type="date" class="adm-input" style="max-width:150px" value="${st.dateFrom}" onchange="admAuditSetFilter('dateFrom',this.value)">
      <span style="color:var(--text-faint)">s/d</span>
      <input type="date" class="adm-input" style="max-width:150px" value="${st.dateTo}" onchange="admAuditSetFilter('dateTo',this.value)">
      ${(st.search||st.table||st.batch||st.rule||st.dateFrom||st.dateTo) ? `<button class="btn !py-1.5" onclick="admAuditResetFilter()">✕ Reset Filter</button>` : ''}
    </div>
    <div id="admAuditResultsArea"></div>
  `;
  const holder = document.getElementById('admAuditResultsArea');
  holder.innerHTML = admAuditResultsHTML();
  root._pageRows = root._pageRowsTmp;
}
// Search: value dibaca dari event.target.value, didebounce 200ms; hanya container hasil yang
// di-refresh (renderAdminAuditResults) sehingga <input id="admAuditSearchInput"> tidak pernah
// dibuat ulang selama tab Audit Log ini terbuka. Filter lain (tabel/batch/rule/tanggal) memakai
// <select>/<input type=date> yang commit sekali per pilihan (onchange), jadi redraw penuh di
// situ tidak menimbulkan masalah fokus yang sama.
function admAuditSetFilter(key,val){
  adminAuditState[key]=val;
  if(key==='search'){
    clearTimeout(adminAuditSearchTimer);
    adminAuditSearchTimer = setTimeout(()=>{ adminAuditState.page=1; renderAdminAuditResults(); }, 200);
    return;
  }
  adminAuditState.page=1;
  drawAdminAuditLogTable();
}
function admAuditResetFilter(){ Object.assign(adminAuditState, {search:'',table:'',batch:'',rule:'',dateFrom:'',dateTo:'',page:1}); drawAdminAuditLogTable(); }
function admAuditGotoPage(p){
  const totalPages = Math.max(1, Math.ceil(admAuditFiltered().length/adminAuditState.pageSize));
  if(p<1||p>totalPages) return;
  adminAuditState.page = p; drawAdminAuditLogTable();
}

/* ---------- AUDIT LOG EXPORT (CSV / Excel / PDF, mengikuti filter aktif) ---------- */
function admAuditExportCSV(){
  const rows = admAuditFiltered();
  const headers = ['Waktu','Batch','Tabel','Record Key','Field','Sebelum','Sesudah','Rule','Alasan'];
  const lines = [headers.join(',')];
  rows.forEach(r=> lines.push([
    r.repaired_at? new Date(r.repaired_at).toLocaleString('id-ID'):'-', r.repair_batch||'-', r.table_name||'-', r.record_key??'-',
    r.field_changed||'-', JSON.stringify(r.value_before), JSON.stringify(r.value_after), r.rule_applied||'-', r.reason||'-'
  ].map(v=> `"${String(v).replace(/"/g,'""')}"`).join(',')));
  U.downloadBlob(lines.join('\n'), `repair_audit_log_export.csv`, 'text/csv;charset=utf-8;');
  logAdminEvent('EXPORT', 'Export CSV repair audit log');
}
function admAuditExportExcel(){
  const rows = admAuditFiltered().map(r=> ({
    Waktu:r.repaired_at? new Date(r.repaired_at).toLocaleString('id-ID'):'-', Batch:r.repair_batch||'-', Tabel:r.table_name||'-',
    'Record Key':r.record_key??'-', Field:r.field_changed||'-', Sebelum:JSON.stringify(r.value_before), Sesudah:JSON.stringify(r.value_after),
    Rule:r.rule_applied||'-', Alasan:r.reason||'-'
  }));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'repair_audit_log');
  XLSX.writeFile(wb, `repair_audit_log_export.xlsx`);
  logAdminEvent('EXPORT', 'Export Excel repair audit log');
}
function admAuditExportPDF(){
  const elx = document.getElementById('admAuditCaptureArea');
  if(!elx){ showToast('Tabel tidak ditemukan', 'error'); return; }
  html2canvas(elx, { backgroundColor: theme==='dark'?'#0A0E13':'#EEF1F4', scale:2 }).then(canvas=>{
    const { jsPDF } = window.jspdf;    const pdf = new jsPDF('l','mm','a4');
    const imgW = 297-20, imgH = canvas.height*imgW/canvas.width;
    pdf.setFontSize(14);
    pdf.text('MINEBOARD ADMIN - REPAIR AUDIT LOG', 10, 10);
    pdf.addImage(canvas.toDataURL('image/png'),'PNG',10,16,imgW,imgH);
    pdf.save(`repair_audit_log_export.pdf`);
  });
  logAdminEvent('EXPORT', 'Export PDF repair audit log');
}

/* ---------- MASTER/TRANSACTION CRUD TABLE ---------- */
async function preloadLookupsFor(cfg){
  if(!cfg.columns) return; // tabel read-only (Transaction Data) tidak punya form, tidak perlu lookup FK
  const fkCols = cfg.columns.filter(c=> c.type==='fk');
  for(const c of fkCols){ await getLookup(c.lookupKey); }
}
/* [AUDIT FIX 2026-09 P1-8] STEP 1-3 (audit, tidak mengubah apa pun sampai baris ini):
   Dipetakan SEMUA 25 tabel di MASTER_TABLES+TRANSACTION_TABLES dan SEMUA pemakai
   adminTableCache[tableKey] (hanya 3 titik baca di seluruh file: admGetFilteredSorted() untuk
   search/sort — SELALU lewat cfg.listColumns karena search memakai cfg.listColumns.some(...) dan
   sort HANYA bisa dipicu dari header <th> yang di-generate dari cfg.listColumns; openAdminForm()
   untuk isi form Edit — memakai cfg.columns (bukan listColumns); openBulkEditModal() hanya
   memakai cfg.columns sebagai daftar field, TIDAK membaca isi row dari cache sama sekali).
   Export CSV/Excel (adminExportCSV/Excel) juga TERBUKTI hanya memakai cfg.listColumns.
   KESIMPULAN:
   - MASTER_TABLES (15 tabel, semua punya cfg.columns): cfg.columns SUDAH superset lengkap dari
     listColumns di semua 15 tabel (termasuk PK/hideInForm) -> aman diganti explicit columns.
   - TRANSACTION_TABLES (10 tabel, readOnly:true, TIDAK punya cfg.columns/form sama sekali karena
     tidak ada Tambah/Edit/Hapus untuk tabel ini -> checkbox & PK secara struktural tidak pernah
     dipakai, dikonfirmasi lewat admResultsHTML yang membungkus semua pemakaian r[cfg.pk] di
     balik `${ro ? '' : ...}`): listColumns SUDAH cukup, cfg.pk ditambahkan tetap secara defensif
     (biaya satu kolom, menghilangkan risiko kalau ada pemakaian pk yang terlewat).
   TIDAK ADA perubahan pada admGetFilteredSorted/search/sort/pagination/CRUD/behavior apa pun —
   HANYA jumlah kolom yang ditarik dari Supabase saat tabel Admin dibuka. */
function adminRequiredColumns(cfg){
  const keys = new Set();
  (cfg.columns || cfg.listColumns).forEach(c=> keys.add(c.key));
  if(cfg.listColumns) cfg.listColumns.forEach(c=> keys.add(c.key));
  if(cfg.pk) keys.add(cfg.pk);
  return [...keys].join(',');
}
async function openAdminTable(section, tableKey){
  if(section) adminActiveTab = section;
  adminActiveTable = tableKey;
  const wrap = document.getElementById('admTabContent');
  if(!wrap) return;
  const tok = ++admRenderTok;   // [AUDIT FIX 2026-09 P1-10] lihat catatan di renderAdminTabContent
  wrap.innerHTML = `<div class="glass p-6 text-center" style="color:var(--text-dim)"><span class="adm-spinner-sm"></span> Memuat data...</div>`;
  try{
    const cfg = getTableConfig(tableKey);
    await preloadLookupsFor(cfg);
    const rows = await fetchAll(tableKey, adminRequiredColumns(cfg));
    if(tok !== admRenderTok) return;   // user sudah pindah tabel/tab lain — buang hasil basi ini
    adminTableCache[tableKey] = rows;
    if(!adminTableState[tableKey]) adminTableState[tableKey] = { search:'', sortCol:null, sortDir:1, page:1, pageSize:8, selected:new Set() };
    drawAdminTable(tableKey);
  }catch(err){
    if(tok !== admRenderTok) return;
    wrap.innerHTML = `<div class="glass p-6" style="color:var(--danger)">Gagal memuat tabel "${tableKey}": ${err.message||err}</div>`;
  }
}
function admGetFilteredSorted(tableKey){
  const cfg = getTableConfig(tableKey);
  const st = adminTableState[tableKey];
  let rows = (adminTableCache[tableKey]||[]).slice();
  if(st.search){
    const s = st.search.toLowerCase();
    rows = rows.filter(r=> cfg.listColumns.some(c=> String(r[c.key]??'').toLowerCase().includes(s)));
  }
  if(st.sortCol){
    rows.sort((a,b)=>{
      let va=a[st.sortCol], vb=b[st.sortCol];
      if(typeof va==='number' && typeof vb==='number') return (va-vb)*st.sortDir;
      return String(va??'').localeCompare(String(vb??''))*st.sortDir;
    });
  }
  return rows;
}
/* ---------- MASTER/TRANSACTION TABLE RENDER ----------
   [SEARCH FIX 2026-09] Root cause bug search: setiap keystroke di kotak Cari memanggil
   adminSearch() -> drawAdminTable() -> wrap.innerHTML = seluruh toolbar (TERMASUK elemen
   <input> pencarian itu sendiri). Mengganti innerHTML parent yang berisi input yang sedang
   diketik membuat browser mendestroy & membuat ulang node <input> tersebut setiap ketikan,
   sehingga di mobile fokus/cursor/keyboard terganggu dan karakter terasa "patah-patah".
   Perbaikan: pisahkan HTML "hasil" (bulk bar + tabel + pagination) dari toolbar (yang berisi
   input Cari) ke dalam container terpisah (`admResultsArea_<tableKey>`). Saat mengetik, HANYA
   container hasil itu yang di-refresh (renderAdminTableResults) — elemen <input> pencarian
   TIDAK PERNAH dibuat ulang selama tabel yang sama masih terbuka. Tidak ada perubahan pada
   Supabase/schema/Dashboard/Daily Input/kalkulasi/pagination/auth/filter lain — hanya cara
   render internal tabel Admin ini yang diperbaiki. */
let adminSearchTimers = {};
function admResultsHTML(tableKey){
  const cfg = getTableConfig(tableKey);
  const st = adminTableState[tableKey];
  const filtered = admGetFilteredSorted(tableKey);
  const totalPages = Math.max(1, Math.ceil(filtered.length/st.pageSize));
  if(st.page>totalPages) st.page=totalPages;
  const pageRows = filtered.slice((st.page-1)*st.pageSize, st.page*st.pageSize);
  const ro = !!cfg.readOnly;
  const selCount = ro ? 0 : st.selected.size;
  const pageIds = pageRows.map(r=> r[cfg.pk]);
  const allPageSelected = !ro && pageIds.length>0 && pageIds.every(id=> st.selected.has(id));
  return `
    <div class="flex items-center gap-2 mb-2 no-print" data-adm-rowcount>
      <span class="tag font-mono">${filtered.length} baris</span>
    </div>
    ${selCount>0 ? `
    <div class="adm-bulkbar no-print">
      <span class="text-xs font-semibold" style="color:var(--accent)">${selCount} data dipilih</span>
      <div class="flex items-center gap-2">
        <button class="btn !py-1 !px-2" onclick="openBulkEditModal('${tableKey}')">✏ Bulk Edit</button>
        <button class="btn !py-1 !px-2" style="color:var(--danger)" onclick="bulkDeleteAdmin('${tableKey}')">🗑 Bulk Delete</button>
        <button class="btn !py-1 !px-2" onclick="adminClearSelection('${tableKey}')">✕ Batal Pilih</button>
      </div>
    </div>` : ''}
    <div id="admTableCaptureArea">
    <div class="overflow-x-auto rounded-lg" style="border:1px solid var(--border); max-height:420px; overflow-y:auto;">
      <table class="dtable">
        <thead><tr>
          ${ro ? '' : `<th class="no-print"><input type="checkbox" class="adm-checkbox" onchange='adminToggleSelectAll("${tableKey}", this.checked, ${JSON.stringify(pageIds)})' ${allPageSelected?'checked':''}></th>`}
          ${cfg.listColumns.map(c=>`<th onclick="adminSort('${tableKey}','${c.key}')">${c.label} ${st.sortCol===c.key?(st.sortDir===1?'▲':'▼'):''}</th>`).join('')}
          ${ro ? '' : `<th class="no-print">Aksi</th>`}
        </tr></thead>
        <tbody>
          ${pageRows.length ? pageRows.map(r=>`
            <tr>
              ${ro ? '' : `<td class="no-print"><input type="checkbox" class="adm-checkbox" ${st.selected.has(r[cfg.pk])?'checked':''} onchange='adminToggleRow("${tableKey}", ${JSON.stringify(r[cfg.pk])})'></td>`}
              ${cfg.listColumns.map(c=>`<td>${c.render? c.render(r[c.key],r) : (r[c.key]??'-')}</td>`).join('')}
              ${ro ? '' : `<td class="no-print"><div class="flex gap-1">
                <button class="btn !py-1 !px-2" onclick='openAdminForm("${tableKey}", ${JSON.stringify(r[cfg.pk])})'>✏</button>
                <button class="btn !py-1 !px-2" style="color:var(--danger)" onclick='confirmAdminDelete("${tableKey}", ${JSON.stringify(r[cfg.pk])})'>🗑</button>
              </div></td>`}
            </tr>`).join('') : `<tr><td colspan="${cfg.listColumns.length+(ro?0:2)}" class="text-center py-6" style="color:var(--text-faint)">Tidak ada data</td></tr>`}
        </tbody>
      </table>
    </div>
    </div>
    <div class="flex items-center justify-between mt-2 text-[11px] no-print" style="color:var(--text-faint)">
      <div>${filtered.length} baris ditemukan</div>
      <div class="flex items-center gap-2">
        <button class="btn !py-1 !px-2" onclick="adminGotoPage('${tableKey}',${st.page-1})" ${st.page<=1?'disabled':''}>‹</button>
        <span class="font-mono">${st.page} / ${totalPages}</span>
        <button class="btn !py-1 !px-2" onclick="adminGotoPage('${tableKey}',${st.page+1})" ${st.page>=totalPages?'disabled':''}>›</button>
      </div>
    </div>`;
}
// Refresh HANYA container hasil (bulk bar + tabel + pagination). Tidak pernah menyentuh
// toolbar/input Cari, sehingga aman dipanggil pada setiap keystroke tanpa mengganggu fokus.
function renderAdminTableResults(tableKey){
  const holder = document.getElementById('admResultsArea_'+tableKey);
  if(!holder) { drawAdminTable(tableKey); return; } // fallback jika container belum ada
  holder.innerHTML = admResultsHTML(tableKey);
}
function drawAdminTable(tableKey){
  const cfg = getTableConfig(tableKey);
  const st = adminTableState[tableKey];
  const wrap = document.getElementById('admTabContent');
  if(!wrap) return;
  const ro = !!cfg.readOnly;
  wrap.innerHTML = `
    <div class="flex items-center gap-2 mb-3 flex-wrap no-print">
      <button class="btn !py-1 !px-2" onclick='adminActiveTable=null; renderPage();'>← Kembali</button>
      <div class="panel-title">${cfg.label} ${ro?'<span class="tag" style="font-size:10px">READ-ONLY</span>':''}</div>
    </div>
    ${ro ? `<div class="text-xs mb-3" style="color:var(--text-faint)">Data transaksi ini berasal dari Daily Input / proses otomatis dan hanya bisa dilihat di Admin (tidak ada Tambah/Edit/Hapus/Import) agar tidak merusak proses input yang sudah ada.</div>` : ''}
    <div class="flex items-center gap-2 mb-3 flex-wrap no-print">
      <input type="text" class="adm-input" id="admSearchInput_${tableKey}" style="max-width:220px" placeholder="Cari..." value="${st.search}" oninput="adminSearch('${tableKey}',this.value)">
      ${ro ? '' : `<button class="btn btn-accent !py-1.5" onclick="openAdminForm('${tableKey}', null)">➕ Tambah Data</button>
      <button class="btn !py-1.5" onclick="triggerAdminImport('${tableKey}')">⬆ Import CSV</button>`}
      <button class="btn !py-1.5" onclick="adminExportCSV('${tableKey}')">⬇ CSV</button>
      <button class="btn !py-1.5" onclick="adminExportExcel('${tableKey}')">⬇ Excel</button>
      <button class="btn !py-1.5" onclick="adminExportPDF('${tableKey}')">⬇ PDF</button>
      <button class="btn !py-1.5" onclick="window.print()">🖨 Print</button>
      <button class="btn !py-1.5" onclick="openAdminTable(null,'${tableKey}')">🔄 Refresh</button>
    </div>
    <div id="admResultsArea_${tableKey}">${admResultsHTML(tableKey)}</div>
  `;
}
// Search: value SELALU dibaca dari event.target.value (parameter `val`), didebounce 200ms
// supaya tidak berat di mobile, TAPI hanya container hasil yang di-render ulang — input tetap
// DOM node yang sama sepanjang pengetikan, jadi tidak ada karakter yang hilang / fokus lompat.
function adminSearch(tableKey,val){
  adminTableState[tableKey].search = val;
  clearTimeout(adminSearchTimers[tableKey]);
  adminSearchTimers[tableKey] = setTimeout(()=>{
    adminTableState[tableKey].page = 1;
    renderAdminTableResults(tableKey);
  }, 200);
}
function adminSort(tableKey,key){ const st=adminTableState[tableKey]; if(st.sortCol===key) st.sortDir*=-1; else { st.sortCol=key; st.sortDir=1; } renderAdminTableResults(tableKey); }
function adminGotoPage(tableKey,p){ const st=adminTableState[tableKey]; const totalPages=Math.max(1,Math.ceil(admGetFilteredSorted(tableKey).length/st.pageSize)); if(p<1||p>totalPages) return; st.page=p; renderAdminTableResults(tableKey); }
function adminToggleRow(tableKey,id){ const st=adminTableState[tableKey]; if(st.selected.has(id)) st.selected.delete(id); else st.selected.add(id); drawAdminTable(tableKey); }
function adminToggleSelectAll(tableKey,checked,ids){ const st=adminTableState[tableKey]; ids.forEach(id=>{ if(checked) st.selected.add(id); else st.selected.delete(id); }); drawAdminTable(tableKey); }
function adminClearSelection(tableKey){ adminTableState[tableKey].selected.clear(); drawAdminTable(tableKey); }

/* ---------- FORM MODAL (ADD / EDIT) ---------- */
function admFieldInput(col, value){
  const val = (value===undefined || value===null) ? '' : value;
  if(col.type==='date') return `<input type="date" class="adm-input" id="admf_${col.key}" value="${val}">`;
  if(col.type==='number') return `<input type="number" step="any" class="adm-input" id="admf_${col.key}" value="${val}">`;
  if(col.type==='fk'){
    const opts = ADMIN_LOOKUP_CACHE[col.lookupKey] || [];
    return `<select class="adm-select" id="admf_${col.key}"><option value="">- pilih -</option>${opts.map(o=>`<option value="${o.value}" ${String(o.value)===String(val)?'selected':''}>${o.label}</option>`).join('')}</select>`;
  }
  if(col.type==='enum'){
    return `<select class="adm-select" id="admf_${col.key}"><option value="">- pilih -</option>${col.options.map(o=>`<option value="${o}" ${o===val?'selected':''}>${o}</option>`).join('')}</select>`;
  }
  return `<input type="text" class="adm-input" id="admf_${col.key}" value="${String(val).replace(/"/g,'&quot;')}">`;
}
async function openAdminForm(tableKey, pk){
  const cfg = getTableConfig(tableKey);
  if(cfg.readOnly){ showToast('Tabel ini read-only (data Transaction / Daily Input)', 'error'); return; }
  await preloadLookupsFor(cfg);
  let record = {};
  if(pk!==null && pk!==undefined){ record = (adminTableCache[tableKey]||[]).find(r=> String(r[cfg.pk])===String(pk)) || {}; }
  const fields = cfg.columns.filter(c=> !c.hideInForm);
  ensureAdminUI();
  const html = `
    <div class="adm-modal-overlay" id="admFormOverlay">
      <div class="adm-modal">
        <div class="adm-modal-header">
          <div class="panel-title">${(pk!==null&&pk!==undefined) ? 'Edit' : 'Tambah'} ${cfg.label}</div>
          <button class="adm-modal-close" onclick="closeAdminModal('admFormOverlay')">✕</button>
        </div>
        <div class="adm-form-grid">
          ${fields.map(c=> `<div class="adm-field"><label class="adm-label">${c.label}${c.required?' *':''}</label>${admFieldInput(c, record[c.key])}</div>`).join('')}
        </div>
        <div class="flex justify-end gap-2 mt-3">
          <button class="btn" onclick="closeAdminModal('admFormOverlay')">Batal</button>
          <button class="btn btn-accent" id="admFormSaveBtn" onclick='saveAdminForm("${tableKey}", ${pk!==null&&pk!==undefined? JSON.stringify(pk): 'null'})'>💾 Simpan</button>
        </div>
      </div>
    </div>`;
  document.getElementById('admModalRoot').insertAdjacentHTML('beforeend', html);
}
function saveAdminForm(tableKey, pk){
  const cfg = getTableConfig(tableKey);
  const fields = cfg.columns.filter(c=> !c.hideInForm);
  const payload = {};
  for(const c of fields){
    const elx = document.getElementById('admf_'+c.key);
    if(!elx) continue;
    let v = elx.value;
    if(c.required && (v===''||v===null||v===undefined)){ showToast(`Field "${c.label}" wajib diisi`, 'error'); return; }
    if(v===''){ v = null; }
    else if(c.type==='number' || c.type==='fk'){ v = Number(v); }
    payload[c.key] = v;
  }
  const btn = document.getElementById('admFormSaveBtn');
  btn.disabled = true; btn.innerHTML = '<span class="adm-spinner-sm"></span> Menyimpan...';
  (async ()=>{
    try{
      // [OFFLINE ENGINE] Semua INSERT/UPDATE lewat OfflineEngine: online -> langsung ke Supabase
      // (trigger DB tetap mencatat audit log seperti biasa), offline -> masuk antrian Pending Sync.
      if(pk!==null && pk!==undefined){
        const { error, queued } = await OfflineEngine.update(tableKey, payload, cfg.pk, pk);
        if(error) throw error;
        showToast(queued ? '📥 Offline: perubahan disimpan & masuk antrian Pending Sync.' : 'Data berhasil diperbarui', queued?'info':'success');
      } else {
        const { error, queued } = await OfflineEngine.insert(tableKey, payload);
        if(error) throw error;
        showToast(queued ? '📥 Offline: data baru disimpan & masuk antrian Pending Sync.' : 'Data berhasil ditambahkan', queued?'info':'success');
      }
      closeAdminModal('admFormOverlay');
      await openAdminTable(null, tableKey);
      scheduleGlobalReload(true);
    }catch(err){
      showToast('Gagal menyimpan: '+(err.message||err), 'error');
      btn.disabled = false; btn.innerHTML = '💾 Simpan';
    }
  })();
}

/* ---------- DELETE / BULK DELETE / BULK EDIT ---------- */
function confirmAdminDelete(tableKey, pkVal){
  const cfgChk = getTableConfig(tableKey);
  if(cfgChk.readOnly){ showToast('Tabel ini read-only (data Transaction / Daily Input)', 'error'); return; }
  openConfirmModal('Hapus data ini secara permanen? Tindakan ini tidak dapat dibatalkan.', async ()=>{
    try{
      const cfg = getTableConfig(tableKey);
      // [OFFLINE ENGINE] DELETE wajib lewat OfflineEngine.delete(): online -> langsung ke Supabase
      // (trigger DB tetap mencatat audit log), offline -> masuk antrian Pending Sync.
      const { error, queued } = await OfflineEngine.delete(tableKey, cfg.pk, pkVal);
      if(error) throw error;
      showToast(queued ? '📥 Offline: penghapusan disimpan & masuk antrian Pending Sync.' : 'Data berhasil dihapus', queued?'info':'success');
      await openAdminTable(null, tableKey);
      scheduleGlobalReload(true);
    }catch(err){ showToast('Gagal menghapus: '+(err.message||err), 'error'); }
  });
}
function bulkDeleteAdmin(tableKey){
  const st = adminTableState[tableKey];
  if(getTableConfig(tableKey).readOnly) return;
  if(!st || st.selected.size===0) return;
  openConfirmModal(`Hapus ${st.selected.size} data terpilih secara permanen?`, async ()=>{
    try{
      const cfg = getTableConfig(tableKey);
      const ids = [...st.selected];
      // [OFFLINE ENGINE] Bulk delete wajib lewat OfflineEngine.bulkDelete() supaya tetap offline-safe.
      const { error, queued } = await OfflineEngine.bulkDelete(tableKey, cfg.pk, ids);
      if(error) throw error;
      showToast(queued ? `📥 Offline: ${ids.length} data masuk antrian Pending Sync.` : `${ids.length} data berhasil dihapus`, queued?'info':'success');
      st.selected.clear();
      await openAdminTable(null, tableKey);
      scheduleGlobalReload(true);
    }catch(err){ showToast('Gagal bulk delete: '+(err.message||err), 'error'); }
  });
}
function openBulkEditModal(tableKey){
  const st = adminTableState[tableKey];
  if(getTableConfig(tableKey).readOnly) return;
  if(!st || st.selected.size===0) return;
  const cfg = getTableConfig(tableKey);
  const editableCols = cfg.columns.filter(c=> !c.hideInForm);
  ensureAdminUI();
  const html = `
    <div class="adm-modal-overlay" id="admBulkOverlay">
      <div class="adm-modal adm-modal-sm">
        <div class="adm-modal-header"><div class="panel-title">Bulk Edit (${st.selected.size} data)</div><button class="adm-modal-close" onclick="closeAdminModal('admBulkOverlay')">✕</button></div>
        <div class="adm-field"><label class="adm-label">Field</label>
          <select class="adm-select" id="admBulkField" onchange="renderBulkValueInput('${tableKey}')">
            ${editableCols.map(c=>`<option value="${c.key}">${c.label}</option>`).join('')}
          </select>
        </div>
        <div class="adm-field" id="admBulkValueWrap"></div>
        <div class="flex justify-end gap-2 mt-3">
          <button class="btn" onclick="closeAdminModal('admBulkOverlay')">Batal</button>
          <button class="btn btn-accent" onclick="applyBulkEdit('${tableKey}')">Terapkan</button>
        </div>
      </div>
    </div>`;
  document.getElementById('admModalRoot').insertAdjacentHTML('beforeend', html);
  renderBulkValueInput(tableKey);
}
function renderBulkValueInput(tableKey){
  const cfg = getTableConfig(tableKey);
  const key = document.getElementById('admBulkField').value;
  const col = cfg.columns.find(c=> c.key===key);
  document.getElementById('admBulkValueWrap').innerHTML = `<label class="adm-label">Nilai Baru</label>${admFieldInput(col,'')}`;
}
function applyBulkEdit(tableKey){
  const cfg = getTableConfig(tableKey);
  const key = document.getElementById('admBulkField').value;
  const col = cfg.columns.find(c=> c.key===key);
  const elx = document.getElementById('admf_'+key);
  let v = elx.value;
  if(v===''){ v = null; } else if(col.type==='number' || col.type==='fk'){ v = Number(v); }
  const st = adminTableState[tableKey];
  const ids = [...st.selected];
  (async ()=>{
    try{
      // [OFFLINE ENGINE] Bulk update wajib lewat OfflineEngine.bulkUpdate() supaya tetap offline-safe.
      const { error, queued } = await OfflineEngine.bulkUpdate(tableKey, { [key]: v }, cfg.pk, ids);
      if(error) throw error;
      showToast(queued ? `📥 Offline: ${ids.length} data masuk antrian Pending Sync.` : `${ids.length} data berhasil diperbarui`, queued?'info':'success');
      closeAdminModal('admBulkOverlay');
      st.selected.clear();
      await openAdminTable(null, tableKey);
      scheduleGlobalReload(true);
    }catch(err){ showToast('Gagal bulk edit: '+(err.message||err), 'error'); }
  })();
}

/* ---------- IMPORT CSV ---------- */
function admParseCSV(text){
  const lines = text.replace(/\r/g,'').split('\n').filter(l=> l.trim().length);
  if(!lines.length) return [];
  const headers = lines[0].split(',').map(h=> h.trim());
  return lines.slice(1).map(line=>{
    const vals = line.split(',');
    const o = {};
    headers.forEach((h,i)=> o[h] = (vals[i]!==undefined ? vals[i].trim() : ''));
    return o;
  });
}
function triggerAdminImport(tableKey){
  const cfgChk = getTableConfig(tableKey);
  if(cfgChk.readOnly){ showToast('Tabel ini read-only (data Transaction / Daily Input)', 'error'); return; }
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.csv';
  inp.onchange = async (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const text = await file.text();
    const rows = admParseCSV(text);
    if(!rows.length){ showToast('File CSV kosong atau format tidak dikenali', 'error'); return; }
    showToast(`Mengimpor ${rows.length} baris...`, 'info');
    try{
      const cfg = getTableConfig(tableKey);
      const cleaned = rows.map(r=>{
        const o = {};
        cfg.columns.forEach(c=>{
          if(c.hideInForm) return;
          if(r[c.key]!==undefined){
            let v = r[c.key];
            if(v===''){ v=null; } else if(c.type==='number' || c.type==='fk'){ v = Number(v); }
            o[c.key] = v;
          }
        });
        return o;
      });
      // [OFFLINE ENGINE] Import CSV wajib lewat OfflineEngine.bulkInsert() supaya tetap offline-safe.
      const { error, queued } = await OfflineEngine.bulkInsert(tableKey, cleaned);
      if(error) throw error;
      showToast(queued ? `📥 Offline: ${cleaned.length} baris masuk antrian Pending Sync.` : `${cleaned.length} baris berhasil diimpor`, queued?'info':'success');
      await openAdminTable(null, tableKey);
      scheduleGlobalReload(true);
    }catch(err){ showToast('Gagal impor CSV: '+(err.message||err), 'error'); }
  };
  inp.click();
}

/* ---------- EXPORT CSV / EXCEL / PDF ---------- */
function adminExportCSV(tableKey){
  const rows = admGetFilteredSorted(tableKey);
  const cfg = getTableConfig(tableKey);
  const headers = cfg.listColumns.map(c=> c.label);
  const lines = [headers.join(',')];
  rows.forEach(r=> lines.push(cfg.listColumns.map(c=> `"${String(r[c.key]??'').replace(/"/g,'""')}"`).join(',')));
  U.downloadBlob(lines.join('\n'), `${tableKey}_export.csv`, 'text/csv;charset=utf-8;');
  logAdminEvent('EXPORT', `Export CSV tabel ${tableKey}`);
}
function adminExportExcel(tableKey){
  const rows = admGetFilteredSorted(tableKey);
  const cfg = getTableConfig(tableKey);
  const data = rows.map(r=>{ const o={}; cfg.listColumns.forEach(c=> o[c.label]=r[c.key]); return o; });
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, tableKey.substring(0,28));
  XLSX.writeFile(wb, `${tableKey}_export.xlsx`);
  logAdminEvent('EXPORT', `Export Excel tabel ${tableKey}`);
}
function adminExportPDF(tableKey){
  const elx = document.getElementById('admTableCaptureArea');
  if(!elx){ showToast('Tabel tidak ditemukan', 'error'); return; }
  html2canvas(elx, { backgroundColor: theme==='dark'?'#0A0E13':'#EEF1F4', scale:2 }).then(canvas=>{
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF('l','mm','a4');
    const imgW = 297-20, imgH = canvas.height*imgW/canvas.width;
    pdf.setFontSize(14);
    pdf.text(`MINEBOARD ADMIN - ${tableKey}`, 10, 10);
    pdf.addImage(canvas.toDataURL('image/png'),'PNG',10,16,imgW,imgH);
    pdf.save(`${tableKey}_export.pdf`);
  });
  logAdminEvent('EXPORT', `Export PDF tabel ${tableKey}`);
}

/* ---------- INIT ---------- */
function showLoading(v){
  const ov = document.getElementById('loadOverlay');
  if(v){ ov.style.display='flex'; ov.style.opacity='1'; }
  else { ov.style.opacity='0'; setTimeout(()=> ov.style.display='none', 400); }
}
function showLoadError(err){
  const ov = document.getElementById('loadOverlay');
  ov.style.display='flex'; ov.style.opacity='1';
  ov.innerHTML = `
    <div style="max-width:440px;text-align:center;padding:0 24px;">
      <div style="font-size:32px;margin-bottom:14px;">⚠️</div>
      <div class="font-mono text-xs tracking-widest" style="color:var(--danger)">GAGAL MEMUAT DATA DARI SUPABASE</div>
      <div class="text-xs mt-3" style="color:var(--text-dim); line-height:1.6;">${(err && err.message) ? err.message : 'Terjadi kesalahan tidak dikenal.'}</div>
      <div class="text-xs mt-3" style="color:var(--text-faint); line-height:1.6;">
        Periksa kembali:<br>
        1. Nilai <b>SUPABASE_URL</b> &amp; <b>SUPABASE_ANON_KEY</b> di bagian atas script<br>
        2. Semua tabel &amp; data sudah diimpor sesuai <code>docs/README.md</code><br>
        3. Koneksi internet aktif
      </div>
      <button class="btn mt-4" onclick="location.reload()">🔄 Coba Lagi</button>
    </div>`;
}
window.addEventListener('DOMContentLoaded', async ()=>{
  // [HARDENING] Tidak ada overlay layar penuh saat boot: shell tampil langsung, status load ada di chip kecil
  // di samping Search, dan halaman data menampilkan placeholder "—" (dataGateHtml) sampai data siap.
  { const ov = document.getElementById('loadOverlay'); if(ov) ov.style.display = 'none'; }
  buildSidebar(); tickClock(); dataStateRender(); renderPage();
  // [PERF 2026-10] cacheShown menandai apakah dashboard sudah tampil ke user memakai data
  // cache IndexedDB (tryInstantRenderFromCache()) SEBELUM data asli dari Supabase datang.
  // Dipakai di bawah untuk memutuskan: (a) apakah overlay sudah boleh dilepas lebih awal,
  // dan (b) bagaimana merespons jika loadAllData() (network) gagal total.
  let cacheShown = false;
  try{
    // [PERF] getSession() dan tryInstantRenderFromCache() sama-sama tidak saling butuh hasil
    // satu sama lain (currentAdminSession hanya dipakai oleh halaman admin/daily_input, tidak
    // oleh render Overview) — dijalankan paralel. Restore sesi Supabase Auth admin (jika
    // sebelumnya sudah login & belum expired) tetap berjalan seperti semula, hanya urutannya.
    const [{ data:{ session } }, cacheOk] = await Promise.all([
      sb.auth.getSession(),
      tryInstantRenderFromCache()
    ]);
    currentAdminSession = session;
    sb.auth.onAuthStateChange((_event, session)=>{
      currentAdminSession = session;
      if(currentPage==='admin' || currentPage==='daily_input') renderPage();
    });

    // [PERF 2026-10] Jika IndexedDB sudah punya cache LENGKAP dari sesi sebelumnya (semua
    // tabel yang dibutuhkan loadAllData() ada), tampilkan dashboard SEKARANG memakai data
    // cache itu — tanpa menunggu network sama sekali. Ini memenuhi target ±2-5 detik pada
    // load berikutnya. Data ini SEMENTARA & akan langsung ditimpa oleh data asli Supabase
    // begitu loadAllData() (network) di bawah selesai (lihat blok "if(cacheShown)" setelahnya)
    // — jadi tetap benar walau ada perubahan data sejak cache terakhir disimpan.
    if(cacheOk){
      cacheShown = true;
      buildSidebar();
      buildFilterBar();
      tickClock();
      navigate('overview');
      showLoading(false);
    }

    // [PERF 2026-10] loadAllData() (fetch asli ke Supabase, LENGKAP — semua tabel besar tetap
    // ditarik penuh tanpa limit/sampling, persis seperti sebelum patch ini) SELALU dijalankan,
    // baik cache tersedia maupun tidak. Ini satu-satunya panggilan network per pageload (tidak
    // ada duplicate fetch): baik jalur cache maupun jalur tanpa-cache sama-sama hanya memanggil
    // loadAllData() satu kali di sini.
    await loadAllData();
    ADMIN_LAST_UPDATE = new Date();
    buildSidebar();
    buildFilterBar();

    if(cacheShown){
      // Dashboard sudah tampil dari cache — sekarang timpa dengan data Supabase yang baru saja
      // selesai dimuat. renderPage() (bukan navigate('overview')) supaya halaman/filter yang
      // sedang dilihat user (jika sempat berpindah selagi background load berjalan) tidak
      // dipaksa balik ke Overview — perilaku render tetap pakai fungsi render_* yang sama persis.
      renderPage();
    } else {
      // Tidak ada cache terpakai (mis. pertama kali dipakai / IndexedDB kosong) — perilaku
      // IDENTIK dengan sebelum patch: overlay baru dilepas setelah loadAllData() selesai.
      tickClock();
      navigate('overview');
      showLoading(false);
    }

    initAdminRealtimeSubscriptions();
    initAuditLogRealtimeSubscription();
    // [OFFLINE ENGINE] Diinisialisasi setelah Supabase & seluruh data utama selesai dimuat:
    // memasang indikator koneksi + tombol Sync Center di header, mendaftarkan listener
    // online/offline, menjalankan auto-sync antrian (jika ada), dan priming cache master data.
    try{ await OfflineEngine.init(); }catch(e){ console.warn('OfflineEngine gagal diinisialisasi:', e); }
  }catch(err){
    console.error(err);
    // Jika loadAllData() gagal total (mis. tidak ada koneksi sama sekali & belum ada cache),
    // tetap coba nyalakan OfflineEngine supaya indikator status & Sync Center tersedia,
    // dan pengguna bisa memakai data cache/antrian yang sudah ada dari sesi sebelumnya.
    try{ await OfflineEngine.init(); }catch(e2){ /* no-op */ }
    // [PERF 2026-10] Jika dashboard SUDAH tampil dari cache sebelum network gagal, jangan
    // timpa dengan overlay error penuh layar — itu akan menyembunyikan dashboard (walau data
    // di layar saat ini stale/cache) yang sebenarnya masih bisa dipakai user. Indikator
    // online/offline dari OfflineEngine tetap menunjukkan status koneksi sebenarnya. Jika
    // BELUM ada apa pun yang tampil (tidak ada cache), perilaku sama seperti sebelum patch:
    // tampilkan overlay error.
    // [HARDENING] status error/partial sudah tercatat di DATA_STATE (chip + panel Retry) — tidak lagi overlay penuh layar.
    if(!cacheShown) renderPage();
  }
});


/* ============================================================
   DAILY INPUT — Input Operasional Per Jam (Admin/MCC)
   ------------------------------------------------------------
   Alur data:  UI/state (DI)  →  adapter (diProdRows/diPlan)  →  OfflineEngine  →  Supabase
   Supabase = sumber kebenaran. TIDAK ada localStorage/draft/mock: setelah reload, jam yang
   sudah terisi dibaca ulang dari Supabase (diLoadShift).
   Grain: actual_date + shift_code + hour_label + fleet/unit. Satu jam dibuka/diedit/disimpan
   independen; menyimpan jam H tidak menyentuh baris jam lain.

   PEMETAAN
     produksi   → production_actual   (baris per hauler ber-ritase; kunci fleet|digger|hauler|material)
     status     → unit_status_actual  (segmen W/I/D/BD per unit + Standby/BD unit tanpa fleet)
     delay      → delay_events        (segmen status Delay)
     idle       → idle_events scope UNIT (segmen status Idle)
     cuaca      → idle_events scope GLOBAL I01-I03 → weather_daily (diRecomputeWeatherDaily)
     fuel       → fuel_actual (grain: fuel_date + shift_code + unit_code — SHIFT LEVEL,
                  bukan per jam; tabel tidak punya hour_label dan tidak seharusnya, karena
                  sumber datanya memang per-shift). Baris lama data_source=RECONSTRUCTED_ACTUAL
                  TIDAK disentuh/dihapus; baris baru dari Daily Input ditandai SOURCE_CONFIRMED.
     HM         → unit_hm_actual (tabel BARU, dibuat setelah audit schema — tidak ada tabel/kolom
                  HM sebelumnya di project ini). Grain: actual_date + shift_code + unit_code
                  (shift level, sama seperti fuel_actual — HM adalah pembacaan meter per shift,
                  bukan per jam). hm_start direkomendasikan dari hm_end shift/hari sebelumnya
                  untuk unit yang sama (diFetchPrevHm). operating_hours = TIDAK diinput manual;
                  diambil dari total durasi status "Working" unit ini di shift ini (unit_status_actual,
                  lihat diUnitWorkingHours) — bukan angka baru. hm_end default = hm_start+jam,
                  operator tetap bisa override; selisih hanya WARNING, tidak pernah blokir Save.

   SCHEMA: unit_status_actual/delay_events/idle_events sudah punya PK asli (status_id/
   delay_event_id/idle_event_id — lihat DI_EVENT_PK) tapi awalnya BELUM punya kolom
   `hour_label`. Modul mem-probe kolom hour_label saat runtime (diProbe, READ-ONLY).
   Bila belum ada, bagian itu tampil di UI tetapi TIDAK ditulis (ada banner).
   TODO: kode alasan Breakdown (bd_code) & data_source/category tidak ditulis sampai schema jelas.
   ============================================================ */
const DI_SHIFT_HOURS = { D:[7,8,9,10,11,12,13,14,15,16,17,18], N:[19,20,21,22,23,0,1,2,3,4,5,6] }; // TODO: turunkan dari master_shifts bila ada jam mulai/selesai
/* [UI 2026-09 SHIFT TIMELINE] Murni UI — pemetaan fase waktu shift dari DI_SHIFT_HOURS yang SUDAH ADA
   (tidak ada jam baru yang ditambah/dihapus). Tidak menulis apa pun ke Supabase, tidak mengubah status
   unit, tidak membuat kolom/tabel overtime — hanya label & highlight di layar berdasarkan jam yang
   sedang dipilih operator (DI.hour). 12:00/00:00 = Meal & Rest, 17:00/05:00 = Shift Work End (sekaligus
   jam "potensi overtime" — TIDAK otomatis dicap overtime, cuma penanda), 18:00/06:00 = Change Shift. */
const DI_SHIFT_PHASE_MAP = {
  D: { pre:[7,8,9,10,11], meal:12, post:[13,14,15,16], overtime:17, change:18 },
  N: { pre:[19,20,21,22,23], meal:0, post:[1,2,3,4], overtime:5, change:6 }
};
const DI_SHIFT_SCHEDULE = {
  D: [ {t:'07:00', l:'Start Shift 1'}, {t:'12:00', l:'Meal & Rest'}, {t:'17:00', l:'Work End'}, {t:'18:00', l:'Change Shift'}, {t:'19:00', l:'Start Shift 2'} ],
  N: [ {t:'19:00', l:'Start Shift 2'}, {t:'00:00', l:'Meal & Rest'}, {t:'05:00', l:'Work End'}, {t:'06:00', l:'Change Shift'}, {t:'07:00', l:'Start Shift 1'} ]
};
function diShiftPhaseInfo(shift, h){
  const m = DI_SHIFT_PHASE_MAP[shift]; if(!m || h==null) return null;
  if(m.pre.includes(h)) return {key:'working', seg:0, label:'WORKING', sub:'Jam kerja normal — sebelum Meal & Rest.'};
  if(h===m.meal) return {key:'meal', seg:1, label:'MEAL & REST', sub:'Istirahat terjadwal. Status unit TIDAK otomatis diubah — tetap ikut data/status yang sudah diinput.'};
  if(m.post.includes(h)) return {key:'working', seg:2, label:'WORKING', sub:'Jam kerja normal — setelah Meal & Rest.'};
  if(h===m.overtime) return {key:'overtime', seg:3, label:'SHIFT WORK END', sub:'Jam kerja resmi shift ini berakhir. Aktivitas setelah ini TIDAK otomatis dicap Overtime — murni penanda waktu.', tag:'Potensi Overtime'};
  if(h===m.change) return {key:'change', seg:4, label:'CHANGE SHIFT', sub:'Waktu serah terima ke shift berikutnya — penanda UI saja, tidak membuat record baru.'};
  return null;
}
/* [UI 2026-09 OVERTIME LABEL] Murni penanda visual — TIDAK ada status/kolom/record baru. Saat milestone
   Meal & Rest / Work End / Change Shift sedang berlangsung (fase != 'working'), unit yang datanya tetap
   berstatus Working (existing, tidak diubah) ditandai dengan label "• Overtime" di sebelah status W.
   Tidak pernah dipakai untuk mengubah f.support/f.fleets/DI.sb, hanya string tambahan di render. */
function diIsOvertimePhase(){
  const ph = diShiftPhaseInfo(DI.shift, DI.hour);
  return !!ph && ph.key !== 'working';
}
function diOtTag(statusKey){
  // statusKey: 'W' (Production segmen) atau 'Working' (Support/lainnya) — hanya tampil kalau unit ini
  // Working DAN sedang di fase Meal & Rest / Work End / Change Shift.
  if(!diIsOvertimePhase()) return '';
  if(statusKey!=='W' && statusKey!=='Working') return '';
  return `<span class="di-ot-tag" title="Tetap bekerja melewati jam milestone shift — penanda tampilan saja, tidak mengubah data.">• Overtime</span>`;
}
/* Timeline compact di atas Daily Input. Murni render dari DI_SHIFT_SCHEDULE/diShiftPhaseInfo — tidak
   membaca/menulis Supabase sama sekali. */
function diShiftTimeline(){
  const shift = DI.shift; if(!shift || !DI_SHIFT_SCHEDULE[shift]) return '';
  const nodes = DI_SHIFT_SCHEDULE[shift], phase = diShiftPhaseInfo(shift, DI.hour);
  const activeNodes = phase ? new Set([phase.seg, phase.seg+1]) : new Set();
  const row = nodes.map((n,i)=>{
    const line = i>0 ? `<div class="di-shtl-line${phase && phase.seg===i-1 ? ' on':''}"></div>` : '';
    return `${line}<div class="di-shtl-node${activeNodes.has(i)?' on':''}"><span class="t">${esc(n.t)}</span><span class="l">${esc(n.l)}</span></div>`;
  }).join('');
  const banner = !phase ? '' : `<div class="di-shtl-banner ph-${phase.key}">
      <b>${esc(phase.label)}</b>${phase.tag ? `<span class="di-shtl-tag">${esc(phase.tag)}</span>` : ''}
      <span>${esc(phase.sub)}</span>
    </div>`;
  return `<div class="di-shtl"><div class="di-shtl-row">${row}</div>${banner}</div>`;
}
const DI_RIT_MAX = 15;   // ritase/jam/hauler di atas ini → peringatan (sama dengan Daily Input Only)
const DI_ST = { W:'Working', I:'Idle', D:'Delay', BD:'Breakdown', SB:'Standby' };
const DI_ST_REV = { Working:'W', Idle:'I', Delay:'D', Breakdown:'BD', Standby:'SB' };
const DI_PROD_COLS = 'actual_id,hour_label,fleet_code,digger_unit_code,hauler_unit_code,operator_code,driver_code,location_code,material_code,distance_km,ritase,payload,assignment_source';
/* Primary key sebenarnya per tabel event per-jam (BUKAN "id") — dipakai oleh diProbe/diFetch/diPlan/diCommit. */
const DI_EVENT_PK = { unit_status_actual:'status_id', delay_events:'delay_event_id', idle_events:'idle_event_id' };
/* HM & Fuel masing-masing punya fungsi simpan sendiri (diSaveHm/diSaveFuel) — tidak lagi
   lewat adapter generik. Lihat diUnitWorkingHours/diFetchPrevHm untuk logic HM. */
const DI = { el:null, date:'', shift:'', hour:null, tab:'jam', forms:{}, db:{}, dirty:new Set(), pend:new Set(),
  caps:{}, legacy:0, loading:false, hm:{}, hmDb:{}, hmPrev:{}, stAll:[], dlAll:[], idlAll:[], fuel:{}, fuelDb:{}, wxEvents:[], wxDeleted:[],
  sb:[], sbOrigIds:[], roster:{},
  /* [UI 2026-09] State UI-only (tidak dikirim ke Supabase): fleet mana yang sedang expanded di
     accordion Daily Input, dan sub-tab (produksi/hauling) aktif per fleet. */
  fleetOpen:{0:true}, fleetTab:{},
  /* [UI 2026-11 OT] Cache read-only ot_events untuk tanggal aktif — dipakai HANYA untuk banner
     informasi jam OT (diOtHoursFor), TIDAK PERNAH untuk mengunci/membatasi input. Tidak ada lagi
     konsep kuota/bulan/lock-fleet — OT tidak dibatasi jumlah occurrence. */
  otCache:{date:null, rows:[]},
  /* [UI 2026-09 +UNIT] State UI-only: unit yang ditambah manual lewat "+ Unit" (Support/Standby-BD)
     supaya cardnya ikut tampil walau belum ada baris data — murni tampilan, tidak pernah dikirim ke
     Supabase. Dua Set terpisah (unit di satu tab tidak memengaruhi tab lain). Panel "+ Unit" sendiri
     (terbuka/tertutup) juga UI-only. */
  supExtra:new Set(), sbExtra:new Set(), sbConfirmedW:new Set(), supPicker:false, sbPicker:false };

/* ============================================================
   [HARDENING] DAILY INPUT — status load, Save guard, regression guard, save lock
   ------------------------------------------------------------
   Tidak mengubah alur/kolom/query Supabase. Hanya:
   - DI.prog      : progres load = jumlah request (probe + fetch + tahap 2) yang BENAR-BENAR selesai
   - DI.loadErr   : load gagal -> Save diblok sampai Retry berhasil (DI.db kosong hasil gagal TIDAK boleh dianggap "tidak ada data")
   - DI.loadedKey : "tanggal|shift" yang datanya sudah lengkap dimuat; Save hanya boleh jika sama dengan konteks aktif
   - DI.busy      : lock per jenis Save (Standby/BD, Cuaca, HM, Fuel); Save Jam memakai DI.committing yang sudah ada
   ============================================================ */
Object.assign(DI, { prog:{done:0,total:13}, loadErr:null, loadedKey:null, loadedParts:null, busy:new Set(), retries:0 });
function diProgPct(){ const p = DI.prog || {done:0,total:1}; return Math.min(99, Math.floor(p.done / Math.max(1,p.total) * 100)); }
function diLoadText(){ return `Memuat data dari Supabase… ${diProgPct()}% — Save aktif setelah selesai.`; }
function diSetProg(){ const b = document.getElementById('diLoadBanner'); if(b) b.textContent = diLoadText(); }
function diLoadErrHtml(){
  return `<div class="di-alert err"><span>⚠️ Data gagal dimuat — Save dinonaktifkan sampai data berhasil dimuat ulang.</span><button class="btn" style="margin-left:auto" onclick="diRetryLoad()">Retry</button></div>`;
}
function diRetryLoad(){
  if(DI.loading) return;          // tidak ada fetch ganda
  DI.retries++;
  const key = DI.date + '|' + DI.shift, ok = DI.loadedParts && DI.loadedParts.key === key;
  console.info(`[Mineboard][DailyInput] retry #${DI.retries} key=${key}`);
  const pr = diLoadShift(DI.hour, ok ? DI.loadedParts.parts : []);   // bagian yang sudah dimuat (edit belum tersimpan) tidak ditimpa
  diPaint();
  return pr;
}
function diSaveBlockReason(){
  if(DI.loading) return `Belum bisa menyimpan — data masih dimuat (${diProgPct()}%). Tunggu sampai 100%.`;
  if(DI.loadErr) return 'Belum bisa menyimpan — data gagal dimuat. Klik Retry dulu.';
  if(DI.loadedKey !== DI.date + '|' + DI.shift) return 'Belum bisa menyimpan — data tanggal/shift ini belum selesai dimuat.';
  return null;
}
function diSaveGuard(){ const r = diSaveBlockReason(); if(r){ showToast(r, 'error'); return false; } return true; }
function diSyncSaveButtons(){
  const foot = document.getElementById('diFoot'); if(!foot) return;
  const reason = diSaveBlockReason(), busy = DI.busy.size > 0 || (DI.committing && DI.committing.size > 0);
  foot.querySelectorAll('button.btn-accent').forEach(b=>{
    b.disabled = busy;                                        // sedang menyimpan -> tombol mati (anti double-click)
    b.setAttribute('aria-disabled', reason ? 'true' : 'false'); // data belum siap -> tetap bisa diklik agar toast menjelaskan alasannya
    b.title = reason || (busy ? 'Penyimpanan sedang berjalan…' : '');
    b.style.opacity = (reason || busy) ? '.55' : '';
    b.style.cursor = (reason || busy) ? 'not-allowed' : '';
  });
}
async function diGuardedSave(key, fn){
  if(!diSaveGuard()) return;
  if(DI.busy.has(key)){ showToast('Penyimpanan sedang berjalan, tunggu sebentar.', 'error'); return; }
  DI.busy.add(key); diSyncSaveButtons();
  try{ return await fn(); }
  finally{ DI.busy.delete(key); diSyncSaveButtons(); }   // lock SELALU dilepas (sukses/gagal); data form user tidak disentuh
}
/* Validasi ringan sebelum commit. block = berpotensi menghilangkan data -> Save ditolak.
   warn = informatif -> Save tetap jalan, data TIDAK diubah. Guard yang error sendiri tidak memblokir (fail-open + log). */
function diRegressionGuard(h, plan){
  const block = [], warn = [];
  try{
    const d = DI.db[h] || {prod:[], st:[], dl:[], idl:[]}, f = DI.forms[h] || {fleets:[]}, lbl = diHourLabel(h);
    const shiftH = (typeof SHIFT_HOURS_BY_CODE !== 'undefined' && SHIFT_HOURS_BY_CODE[DI.shift]) || 12;
    // Unit / population: DB punya produksi jam ini tetapi form tidak punya satu pun fleet card -> populasi hilang, bukan "user menghapus".
    if(d.prod.length && !(f.fleets && f.fleets.length)) block.push(`Jam ${lbl}: Supabase punya ${d.prod.length} baris produksi tetapi form tidak memuat fleet — disimpan akan menghapus semuanya. Muat ulang jam ini.`);
    else {
      const inForm = new Set((f.fleets||[]).map(x=>x.fleet).filter(Boolean));
      const lost = [...new Set(d.prod.map(r=>r.fleet_code).filter(Boolean))].filter(x=>!inForm.has(x));
      if(lost.length) warn.push(`Fleet ${lost.join(', ')} ada di Supabase jam ${lbl} tetapi tidak ada di form — barisnya akan diganti.`);
    }
    if(plan.prodDel.length && plan.prodDel.length === d.prod.length && !plan.prodIns.length && d.prod.length) warn.push(`Semua ${d.prod.length} baris produksi jam ${lbl} akan dihapus (ritase 0 semua).`);
    // Delay / Idle / Status: durasi tidak valid
    const per = {};
    ['unit_status_actual','delay_events','idle_events'].forEach(t=>{
      const e = plan.ev[t]; if(!e) return;
      e.ins.forEach(r=>{
        const du = Number(r.duration_hours);
        if(!isFinite(du) || du < 0) block.push(`${t}: durasi tidak valid (${r.unit_code||'-'}: ${r.duration_hours}).`);
        else if(du > shiftH) block.push(`${t}: durasi ${du} jam melebihi shift (${r.unit_code||'-'}).`);
        else if(r.hour_label && du > 1.0001) warn.push(`${t}: ${r.unit_code||'-'} ${Math.round(du*60)} menit di slot 1 jam.`);
        if(r.unit_code) per[r.unit_code] = (per[r.unit_code]||0) + (isFinite(du) ? du : 0);
      });
    });
    Object.keys(per).forEach(u=>{ if(per[u] > 1.02) warn.push(`Unit ${u}: total ${Math.round(per[u]*60)} menit di jam ${lbl} (>60) — cek Standby + Delay/Idle ganda.`); });
    // Production: baris ganda untuk kunci yang sama
    const seen = new Set();
    diProdRows(h).forEach(r=>{ const k = [r.fleet_code, r.digger_unit_code||'', r.hauler_unit_code||'', r.material_code].join('|'); if(seen.has(k)) warn.push(`Baris produksi ganda: ${k}.`); seen.add(k); });
  }catch(e){ console.warn('[Mineboard][DailyInput] regression guard error (tidak memblokir):', e); }
  return { block, warn };
}

/* [UI 2026-09] Toggle expand/collapse satu Fleet card di accordion Daily Input. Murni UI state —
   tidak menyentuh DI.forms/data. */
function diToggleFleet(i){ DI.fleetOpen[i] = !DI.fleetOpen[i]; diPaintBody(); }
function diSetFleetTab(i,t){ DI.fleetTab[i] = t; diPaintBody(); }

/* ---------- HELPER KECIL ---------- */
const diN = v=> (v===''||v==null||isNaN(v)) ? 0 : Number(v);
const diHourLabel = h=> `${String(h).padStart(2,'0')} - ${String((h+1)%24).padStart(2,'0')}`;
const diHours = ()=> DI_SHIFT_HOURS[DI.shift] || Array.from({length:24},(_,i)=>i);
const diForm = ()=> DI.forms[DI.hour];
const diIsFilled = h=> DI.pend.has(h) || !!(DI.db[h] && (DI.db[h].prod.length || DI.db[h].st.length));
const diLookupLabel = (key, code)=> fkLabel(key, code);
// [WEATHER MANUAL SELECT 2026-09] I01/I02/I03 (Hujan/Slippery/Fog) SEBELUMNYA disembunyikan dari
// dropdown Alasan Idle karena hanya diisi via diApplyWeatherAuto(). Permintaan eksplisit user: kode
// cuaca ini juga harus bisa dipilih manual di Produksi (Digger/Hauler) & Support — jadi TIDAK difilter
// lagi. Baris yang dipilih manual tetap ditandai _wxTouched (lihat diSet) supaya auto-engine tidak menimpanya.
const diOptIdleUnit = ()=> ADMIN_LOOKUP_CACHE.idle||[];
const diOptUnits = ()=> (ADMIN_LOOKUP_CACHE.digger||[]).concat(ADMIN_LOOKUP_CACHE.hauler||[]);
// [SUPPORT] TERPISAH dari diOptUnits() dengan SENGAJA — diOptUnits() dipakai dropdown Digger/Hauler
// Production (LOOKUP_DEFS.digger/hauler) dan HM/Fuel; unit Support TIDAK BOLEH pernah masuk situ.
const diOptSupportUnits = ()=> ADMIN_LOOKUP_CACHE.support||[];
// [HM FIX 2026-09] HM harus bisa memilih Production DAN Support (unit_hm_actual tidak punya
// constraint yang membatasi ke Production — audit Supabase 2026-09). TERPISAH dari diOptUnits()
// (yang tetap khusus Fleet/Standby-BD Production) supaya tidak mencampur scope keduanya di tempat
// lain (prinsip "single source per konteks" — lihat diOptUnits()/diOptSupportUnits() di atas).
const diOptHmUnits = ()=> (ADMIN_LOOKUP_CACHE.digger||[]).concat(ADMIN_LOOKUP_CACHE.hauler||[]).concat(ADMIN_LOOKUP_CACHE.support||[]);
const diSeg = (s='W', dur=60, code='')=> ({s, dur, code});
const diHauler = ()=> ({unit:'', driver:'', rit:'', payload:'', segs:[diSeg()]});
const diFleet = ()=> ({fleet:'', digger:'', operator:'', material:'', location:'', dist:'', dsegs:[diSeg()], haulers:[diHauler()]});
// [SUPPORT] Satu unit Support = satu status utuh untuk jam ini (bukan multi-segmen seperti fleet),
// sesuai brief: Unit/Status/Durasi. code dipakai HANYA saat s==='I' (idle_code, lihat diOptIdleUnit()).
const diSupportRow = ()=> ({unit:'', s:'W', dur:60, code:'', operator:''});
// [SUPPORT OPERATOR 2026-09] Pool operator sesuai unit_role_code unit Support yang dipilih (final
// prompt §4/§6): DOZER->operatorDozer, GRADER->operatorGrader, EXCAVATOR->operator (pool sama dg
// Production Exca). Role lain (mis. WATER_TRUCK) belum punya pool operator terpisah di data saat ini
// (lihat AUDIT §4 — position "Driver WT" ada tapi belum dikonfirmasi) -> fallback array kosong,
// bukan menampilkan semua operator secara global (sesuai larangan eksplisit di prompt).
function diOptSupportOperator(unitCode){
  const u = (ADMIN_LOOKUP_CACHE.support||[]).find(o=> o.value===unitCode);
  // [SUPPORT OPERATOR FIX 2026-09] Sebelumnya role dibandingkan case-sensitive persis ('DOZER'/'GRADER')
  // -> kalau master_units.unit_role_code kesimpan beda huruf/spasi (mis. 'Dozer', 'dozer ') dropdown
  // operator selalu jatuh ke [] (kosong), padahal unitnya sendiri sudah terpilih. Dinormalisasi dulu
  // (uppercase, buang non-huruf) sama seperti diIsWaterTruckRole, supaya pool tetap ketemu.
  const role = String((u && u.unit_role_code) || '').toUpperCase().replace(/[^A-Z]/g,'');
  if(role==='DOZER') return ADMIN_LOOKUP_CACHE.operatorDozer||[];
  if(role==='GRADER') return ADMIN_LOOKUP_CACHE.operatorGrader||[];
  if(role==='EXCAVATOR') return ADMIN_LOOKUP_CACHE.operator||[];
  // [DRIVER WT] Unit Water Truck -> pool Driver WT dari master_employees (position='Driver WT', is_active=true).
  if(diIsWaterTruckRole(role)) return ADMIN_LOOKUP_CACHE.driverWT||[];
  return [];
}
const diIsWaterTruckRole = (role)=> ['WATERTRUCK','WT'].includes(String(role||'').toUpperCase().replace(/[^A-Z]/g,''));
// [DI PAYLOAD FIX 2026-09 v2] AUDIT: sudah dicek — Mineboard TIDAK punya kolom/helper/master lain
// yang membedakan ADT/IVECO/TONLY. master_units.equipment_type & equipment_category SAMA-SAMA
// "Hauler" untuk ketiganya (dikonfirmasi user langsung dari Supabase), jadi tidak bisa dipakai.
// Satu-satunya pembeda yang konsisten adalah PREFIX huruf pada unit_code itu sendiri
// (ADT 809/820/834/835 -> "ADT", IV 871-877 -> "IV", TL 849-855 -> "TL"), sesuai contoh user.
// DI_HAUL_PREFIX_MAP hanya memetakan prefix kode unit -> haul_code (istilah/kategori, BUKAN angka
// payload — angka payload tetap 100% dari master_material_haul_conversions via diConv() di bawah).
// Kalau nanti ada prefix unit baru yang belum masuk peta ini, tambahkan barisnya di sini saja.
const DI_HAUL_PREFIX_MAP = { ADT:'ADT', IV:'IVECO', TL:'TONLY' };
function diHaulCodeOfUnit(unitCode){
  if(!unitCode) return '';
  const m = String(unitCode).trim().toUpperCase().match(/^[A-Z]+/);
  const prefix = m ? m[0] : '';
  return DI_HAUL_PREFIX_MAP[prefix] || '';
}
function diConv(material, unitCode){
  const haulCode = diHaulCodeOfUnit(unitCode);
  const c = (ADMIN_LOOKUP_CACHE._haulConv||[]).find(x=> x.material_code===material && x.haul_code===haulCode && x.is_active!==false);
  // found=false -> jangan mengarang nilai; UI tampilkan '—', kalkulasi treat payload=0.
  return { v: c ? Number(c.value_per_rit)||0 : 0, u: c ? (c.unit||'') : '', found: !!c };
}

/* ================== UNIT STATUS HELPERS (real overlap checks — dipakai diValidate/diSaveSb) ==================
   [AUTO STATUS REMOVED 2026-09] final prompt §13 — engine lama di sini juga menghasilkan status
   Standby/Breakdown SINTETIS (rasio 85%/15%, hash deterministik) untuk unit non-Production tanpa
   entry manual, dipakai HANYA oleh tombol "⚡ Isi Otomatis" (diSbApplyAuto/diAutoPoolRows) dan
   validateUnitStatusIntegrity/getUnitStatusByHour — keduanya sudah dicek TIDAK dipanggil dari alur
   Simpan/validasi manapun (dead code). Semua itu sudah dihapus total. diUnitsInProduction() dan
   diSbEventCoversHour() DIPERTAHANKAN — keduanya dipakai oleh validasi overlap Production↔Standby/BD
   yang nyata (diValidate line ~5895, diSaveSb line ~6478), sama sekali tidak berhubungan dengan
   generator status sintetis yang dihapus. */
function diUnitsInProduction(h){   // Set unit_code yang terpasang sebagai digger/hauler di jam h
  const f = DI.forms[h], set = new Set(); if(!f) return set;
  f.fleets.forEach(fl=>{ if(fl.digger) set.add(fl.digger); fl.haulers.forEach(hl=>{ if(hl.unit) set.add(hl.unit); }); });
  return set;
}
function diUnitsInSupport(h){   // Set unit_code yang punya baris Support (durasi > 0) di jam h
  const f = DI.forms[h], set = new Set(); if(!f) return set;
  (f.support||[]).forEach(s=>{ if(s.unit && diN(s.dur) > 0) set.add(s.unit); });
  return set;
}
function diSbEventCoversHour(r, h){   // apakah event Standby/BD (start–end, boleh lintas tengah malam) overlap jendela jam h
  const R = diSbRange(r); if(!R || !r.unit) return false;
  const s = h*60, e = s+60;
  for(const off of [0, 1440, -1440]){ if(R[0] < e+off && s+off < R[1]) return true; }
  return false;
}

/* ---------- AKSES SUPABASE (READ) & PROBE SCHEMA ---------- */
async function diFetch(table, cols, f){
  if(OfflineEngine.isOffline()){
    const all = (await OfflineEngine.getCachedTable(table)) || [];
    return all.filter(r=> Object.entries(f).every(([k,v])=> r[k]===v));
  }
  const out = [];
  for(let from=0;; from+=1000){
    let q = sb.from(table).select(cols).order(cols.split(',')[0]);
    Object.entries(f).forEach(([k,v])=>{ q = q.eq(k,v); });
    const { data, error } = await q.range(from, from+999);
    if(error) throw error;
    out.push(...data);
    if(data.length < 1000) break;
  }
  return out;
}
async function diProbe(table){
  if(DI.caps[table] !== undefined) return DI.caps[table];
  if(OfflineEngine.isOffline()) return false;
  // [HARDENING] Hanya kegagalan SKEMA (kolom/tabel tidak ada) yang boleh dianggap "tidak didukung". Error jaringan/izin
  // dilempar -> load Daily Input gagal (Save diblok + Retry) dan hasilnya TIDAK di-cache sebagai false.
  const pk = DI_EVENT_PK[table] || 'id';
  const { error } = await sb.from(table).select(`${pk},hour_label`).limit(1);
  if(error){
    const m = String(error.message||''), c = String(error.code||'');
    const schemaMiss = c==='42703' || c==='PGRST204' || c==='42P01' || /column .*does not exist|could not find .*column|hour_label/i.test(m);
    if(!schemaMiss){ console.error(`[Mineboard][probe] table=${table} op=select status=${error.status||c||'n/a'} message=${m}`); throw error; }
    return DI.caps[table] = false;
  }
  return DI.caps[table] = true;
}

/* ---------- ENTRY POINT (renderPage → window['render_daily_input']) ---------- */
async function render_daily_input(data, el){
  if(!isAdminLoggedIn()){ el.innerHTML = renderAdminLoginScreen(); return; }
  ensureAdminUI();
  el.innerHTML = '<div class="glass p-5 text-sm" style="color:var(--text-dim)">Memuat data master (Shift, Fleet, Unit, Employee, Material, Location, Delay, Idle)...</div>';
  // [FIX 2026-09] operatorDozer & operatorGrader ditambahkan ke preload — sebelumnya LOOKUP_DEFS
  // sudah punya definisinya tapi tidak pernah di-fetch di sini, jadi ADMIN_LOOKUP_CACHE.operatorDozer
  // /.operatorGrader selalu undefined dan diOptSupportOperator() selalu fallback ke [] untuk Dozer/Grader.
  await Promise.all(['shift','fleet','digger','hauler','operator','driver','material','location','delay','idle','support','operatorDozer','operatorGrader','driverWT'].map(k=> getLookup(k).catch(()=>[])));
  if(!ADMIN_LOOKUP_CACHE._haulConv){
    // [DI PAYLOAD FIX 2026-09] is_active ditambahkan ke SELECT & filter di sini (bukan di diConv)
    // supaya cache-nya sendiri sudah bersih dari mapping non-aktif — sesuai instruksi "hanya
    // gunakan record is_active=true", sumber kebenaran tetap master_material_haul_conversions.
    try{
      const raw = await fetchAll('master_material_haul_conversions','material_code,haul_code,value_per_rit,unit,is_active');
      ADMIN_LOOKUP_CACHE._haulConv = raw.filter(r=> r.is_active!==false);
    }catch(e){ ADMIN_LOOKUP_CACHE._haulConv = []; }
  }
  /* Master Breakdown Reason — SUDAH ADA di project (master_failure_categories/master_failure_reasons),
     bukan tabel baru. Dimuat sekali di sini karena strukturnya (kategori→reason FK) tidak cocok dengan
     bentuk generik getLookup() (value/label saja), jadi dipetakan manual ke {value,label,cat}. */
  if(!ADMIN_LOOKUP_CACHE._bdCat){
    try{
      const cats = await fetchAll('master_failure_categories','category_id,category_code,category_name');
      const reasons = await fetchAll('master_failure_reasons','reason_id,reason_code,reason_name,category_id,is_active');
      ADMIN_LOOKUP_CACHE._bdCat = cats.map(c=>({ value:c.category_id, label:c.category_name }));
      ADMIN_LOOKUP_CACHE._bdReason = reasons.filter(r=>r.is_active!==false).map(r=>({ value:r.reason_id, label:r.reason_name, cat:r.category_id }));
    }catch(e){ ADMIN_LOOKUP_CACHE._bdCat = []; ADMIN_LOOKUP_CACHE._bdReason = []; console.warn('[DailyInput] Gagal load master breakdown reason:', e); }
  }
  DI.el = el;
  if(!DI.date) DI.date = U.dateStr(new Date());
  if(!DI.shift) DI.shift = ((ADMIN_LOOKUP_CACHE.shift||[])[0]||{}).value || '';
  await diLoadShift();
}

/* ---------- LOAD SHIFT DARI SUPABASE → state per jam ---------- */
/* [UI 2026-11 OT MIGRATION] Sistem "kuota overtime max 2 tanggal/bulan" DIHAPUS TOTAL — bertentangan
   dengan aturan final Supabase: OT tidak dibatasi jumlah occurrence (lihat ot_events, tidak ada
   CHECK/UNIQUE pembatas kuota di database). diOtLoadMonth/diOtGate lama sudah dihapus. OT sekarang
   murni actual event: kapan pun unit Working pada checkpoint OT (12-13/17-18/18-19 Shift D,
   00-01/05-06/06-07 Shift N), itu sah dicatat sebagai OT — tanpa batas, tanpa gate, tanpa lock fleet
   ke 1 unit atau ke unit tertentu (EXCA 41). Baca OT dari tabel ot_events (read-only di sini; lihat
   diOtHoursFor()) untuk keperluan tampilan/ringkasan, bukan untuk membatasi input. */
async function diOtLoadForDate(date){
  if(!date) return;
  if(DI.otCache.date === date) return;
  try{
    const { data, error } = await sb.from('ot_events')
      .select('unit_code,fleet_code,shift_code,hour_label,duration_hours,source')
      .eq('event_date', date);
    if(error) throw error;
    DI.otCache = { date, rows: data||[] };
  }catch(e){
    console.error('[DailyInput] gagal memuat ot_events untuk tanggal ini', e);
    DI.otCache = { date, rows: [] };
  }
  diPaint();
}
/* Total jam OT (dari ot_events, read-only) untuk shift+tanggal aktif — dipakai untuk banner informasi
   saja, TIDAK untuk mengunci/membatasi input apa pun. */
function diOtHoursFor(shift){
  const rows = (DI.otCache && DI.otCache.rows) || [];
  return rows.filter(r=> r.shift_code===shift).reduce((a,r)=> a+Number(r.duration_hours||0), 0);
}
/* [UI 2026-10 FIX MEAL/CHANGE-SHIFT] HANYA Meal & Rest (12-13 shift D, 00-01 shift N) yang SELALU
   non-working — seluruh alat otomatis Delay (D03), tanpa syarat, di SEMUA tanggal. Jam Change Shift
   (17-18 dan 18-19 shift D / 05-06 dan 06-07 shift N) TIDAK LAGI ditangani di sini — lihat
   diWorkEndInfo() di bawah: Change Shift ≠ Meal & Rest, aktivitas aktual per unit tetap dipertahankan.
   [ROOT CAUSE jam 18 dulu blank/full-Delay] Sebelumnya function ini JUGA mengembalikan {type:'shift'}
   untuk h===18/h===6, dan diApplyBreakAuto() memperlakukan SEMUA `brk` (baik 'meal' maupun 'shift')
   dengan cara yang sama: paksa semua unit Production+Support jadi Delay. Itu sebabnya jam 18 berperilaku
   identik dengan jam Meal & Rest (salah). Sekarang function ini murni untuk Meal & Rest saja. */
function diBreakInfo(h, shift){
  shift = shift || DI.shift;
  if(shift==='D'){
    if(h===12) return {type:'meal', code:'D03', label:'Meal & Rest'};
  } else if(shift==='N'){
    if(h===0)  return {type:'meal', code:'D03', label:'Meal & Rest'};
  }
  return null;
}
/* [UI 2026-10 FIX WORK-END / CHANGE-SHIFT GATE] Jam 17:00-18:00 (WORK END) DAN 18:00-19:00 (CHANGE
   SHIFT) shift D — begitu juga 05:00-06:00/06:00-07:00 shift N — BUKAN otomatis semua Working, BUKAN
   otomatis semua Delay: unit yang punya ritase/aktivitas aktual jam ini tetap Working (atau tetap
   Delay/Idle/Standby/Breakdown sesuai event aslinya), unit Production yang TIDAK punya aktivitas apa pun
   otomatis Delay Change Shift (D05). Beda dari diBreakInfo (yang selalu 100% Delay tanpa syarat untuk
   Meal & Rest) — di sini kondisional per-unit, untuk KEDUA jam (17 dan 18), bukan cuma jam 17 seperti
   sebelumnya. `isChangeShift` hanya dipakai untuk teks banner (WORK END vs CHANGE SHIFT), tidak mengubah
   behavior — keduanya sama-sama kondisional. */
function diWorkEndInfo(h, shift){
  shift = shift || DI.shift;
  // [UI 2026-11 FIX WORK END ≠ DELAY] Work End (17 D / 05 N) BUKAN Change Shift dan BUKAN Delay apa
  // pun — code:null di sini (dulu salah diberi 'D05', persis bug yang ditemukan & dibersihkan di
  // Supabase: 14.575 baris delay_events D05 salah klasifikasi di jam 17-18 D sudah dihapus, lihat
  // migration cleanup). Hanya Change Shift (18 D / 06 N) yang benar-benar D05.
  if(shift==='D' && h===17) return {code:null, label:'Work End', isChangeShift:false, isWorkEnd:true};
  if(shift==='D' && h===18) return {code:'D05', label:'Change Shift', isChangeShift:true, isWorkEnd:false};
  if(shift==='N' && h===5)  return {code:null, label:'Work End', isChangeShift:false, isWorkEnd:true};
  if(shift==='N' && h===6)  return {code:'D05', label:'Change Shift', isChangeShift:true, isWorkEnd:false};
  return null;
}
/* [UI 2026-09 MEAL/CHANGE-SHIFT + WORK-END AUTO] Menerapkan aturan final: unit TETAP tampil/tersimpan
   (tidak blank), hanya statusnya yang dipaksa Delay sesuai jam. Dipanggil di diEnsureForm (saat form
   jam pertama kali dibuat) dan di diSet (tiap kali user mengubah ritase, supaya hauler yang baru diisi
   ritase-nya langsung kembali jadi Working, dan yang dikosongkan lagi otomatis balik jadi Delay).
   Ini tetap memakai jalur simpan yang SAMA PERSIS (diProdRows/diEventRows/diPlan/diCommit) — tidak ada
   pipeline simpan baru, tidak ada tabel baru, dan diPlan sudah otomatis mengganti (bukan menumpuk) baris
   event lama utk jam ini setiap Simpan, jadi tidak ada duplicate delay_events lintas reload/save. */
function diApplyBreakAuto(h){
  const f = DI.forms[h]; if(!f) return;
  const brk = diBreakInfo(h);
  if(brk){    // [UI 2026-11 FIX MEAL & REST HARD LOCK] Meal & Rest (D03) adalah PLAN/DEFAULT, BUKAN hard lock —
    // sebelumnya function ini SELALU menimpa rit/segs jadi Delay D03 tanpa syarat pada setiap diSet(),
    // sehingga ritase yang diketik operator langsung terhapus lagi (bug: "tidak bisa diedit manual").
    // Sekarang persis pola yang sama dengan cabang Work End di bawah: ada ritase = Working (+OT, karena
    // ini di luar jam kerja normal), tidak ada ritase & belum disentuh manual & bukan data DB nyata =
    // otomatis Delay D03 (default). `_mealAuto`/`_mealTouched` sama fungsinya dengan `_weAuto`/`_weTouched`.
    f.fleets.forEach(fl=>{
      let anyRit = false;
      fl.haulers.forEach(hl=>{
        if(!hl.unit) return;
        const rit = diN(hl.rit);
        if(rit > 0){ anyRit = true; if(hl._mealAuto){ hl.segs = [diSeg()]; hl._mealAuto = false; } }
        else if(!hl._mealTouched && !hl._dbReal){ hl.rit=''; hl.payload=''; hl.segs = [diSeg('D', 60, brk.code)]; hl._mealAuto = true; }
      });
      if(fl.digger){
        if(anyRit){ if(fl._mealAuto){ fl.dsegs = [diSeg()]; fl._mealAuto = false; } }
        else if(!fl._mealTouched && !fl._dbReal){ fl.dsegs = [diSeg('D', 60, brk.code)]; fl._mealAuto = true; }
      }
    });
    // Support: default Delay D03 kecuali sudah disentuh manual (_mealTouched) atau memang data DB nyata.
    const sbUnits = new Set((DI.sb||[]).map(x=>x.unit));
    const bySupUnit = new Map((f.support||[]).map(s=>[s.unit, s]));
    (diOptSupportUnits()||[]).forEach(o=>{
      if(sbUnits.has(o.value)) return;
      const row = bySupUnit.get(o.value);
      if(row){ if(!row._mealTouched && !row._dbReal){ row.s='D'; row.code=brk.code; row.dur=60; } }
      else f.support.push({unit:o.value, s:'D', dur:60, code:brk.code, operator:''});
    });
    return;
  }
  const we = diWorkEndInfo(h);
  if(we){
    // Jam Work End (we.code===null, 17 D / 05 N): TIDAK PERNAH auto-Delay — Work End bukan Delay apa
    // pun (lihat diWorkEndInfo). Ada ritase = Working (+OT). Tidak ada ritase & belum disentuh & bukan
    // data DB nyata = dibiarkan KOSONG (bukan dipaksa jadi status apa pun) — "Actual belum diisi".
    // Jam Change Shift (we.code==='D05', 18 D / 06 N): perilaku lama dipertahankan — ada ritase =
    // Working (+OT), tidak ada = auto-Delay D05 (default Change Shift).
    // [P0 FIX 2026-10 — _weTouched/_weAuto OVERWRITE, tetap dipertahankan] `_dbReal` dihitung ulang tiap
    // diFromDb() dari data DB sesungguhnya, jadi data nyata tidak pernah tertimpa hanya krn sesi baru.
    f.fleets.forEach(fl=>{
      let anyRit = false;
      fl.haulers.forEach(hl=>{
        if(!hl.unit) return;
        const rit = diN(hl.rit);
        // [BUGFIX 2026-11] Sebelumnya hanya reset ke Working jika _weAuto true — tapi slot Work End yang
        // masih KOSONG (segs=[], "Actual belum diisi", _weAuto=false krn we.code null) tidak pernah
        // dikonversi ke Working saat ritase baru diisi. Sekarang: rit>0 SELALU memastikan segs jadi
        // Working, baik dari state kosong maupun dari auto-Delay D05 (Change Shift) sebelumnya.
        if(rit > 0){ anyRit = true; if(hl._weAuto || !hl.segs || !hl.segs.length){ hl.segs = [diSeg()]; hl._weAuto = false; } }
        else if(!hl._weTouched && !hl._dbReal){
          hl.segs = we.code ? [diSeg('D', 60, we.code)] : [];
          hl._weAuto = !!we.code;
        }
      });
      if(fl.digger){
        if(anyRit){ if(fl._weAuto || !fl.dsegs || !fl.dsegs.length){ fl.dsegs = [diSeg()]; fl._weAuto = false; } }
        else if(!fl._weTouched && !fl._dbReal){
          fl.dsegs = we.code ? [diSeg('D', 60, we.code)] : [];
          fl._weAuto = !!we.code;
        }
      }
    });
  }
}
async function diLoadShift(pick, keep, opts){
  /* [DI PERF 2026-09] (1) semua query independen dijalankan PARALEL (sebelumnya ~10 request berurutan
     tiap ganti shift & tiap Simpan). (2) `keep` = bagian yang TIDAK dibaca ulang/ditimpa: 'roster' (tidak berubah
     setelah simpan), dan 'sb'/'wx'/'fuel'/'hm' supaya edit yang belum disimpan di tab lain tidak hilang saat tab
     lain disimpan. (3) token anti-race: kalau tanggal/shift diganti lagi saat load berjalan, hasil lama dibuang.
     (4) `opts.silent` (baru): dipakai HANYA untuk reconciliation setelah SAVE (lihat diCommit) — user sudah
     melihat UI pindah jam secara instan sebelum panggilan ini jalan, jadi TIDAK menampilkan banner "Memuat…"
     dan di akhir HANYA repaint minimal (timeline+body), bukan diPaint() penuh, supaya tidak mengganggu
     input yang sedang berjalan di jam lain. */
  const K = new Set(keep || []), tok = DI._tok = (DI._tok||0) + 1, silent = !!(opts && opts.silent);
  // [HARDENING] progres = request yang benar-benar selesai; hasil load lama (tok berbeda) tidak menyentuh progres/state baru.
  const T = pr=> Promise.resolve(pr).then(v=>{ if(tok === DI._tok){ DI.prog.done++; diSetProg(); } return v; });
  DI.prog = { done:0, total:13 }; DI.loadErr = null; DI.loadedKey = null;
  DI.loading = true; if(!K.has('roster') && !silent) diPaint();
  const { date, shift } = DI, hourOf = r=> parseInt(String(r.hour_label||'').slice(0,2),10);
  diOtLoadForDate(date);   // [UI 2026-11 OT] baca ot_events (read-only, informasi), fire-and-forget
  try{
    const [cS, cD, cI] = await Promise.all(['unit_status_actual','delay_events','idle_events'].map(t=> T(diProbe(t))));
    // [ROSTER 2026-09] Daftar ADT per Fleet HARUS berasal dari roster harian (shift_hauler_assignment), BUKAN dari
    // production_actual. DI.roster = { fleet_code: [hauler_unit_code, ...] } dipakai diFromDb().
    const [prod, rosterRows, st, sbRows, dl, idl, fuel, hm] = await Promise.all([
      diFetch('production_actual', DI_PROD_COLS, {actual_date:date, shift_code:shift}),
      K.has('roster') ? Promise.resolve(null) : diFetch('shift_hauler_assignment', 'fleet_code,slot_idx,hauler_unit_code', {assignment_date:date, shift_code:shift}),   // [HARDENING] roster = sumber populasi: kegagalan TIDAK lagi ditelan jadi [] (bisa menghilangkan unit lalu menghapus data saat Save)
      cS ? diFetch('unit_status_actual','status_id,hour_label,unit_code,fleet_code,status,duration_hours,operator_code',{status_date:date, shift_code:shift}) : Promise.resolve([]),
      // [FIX 2026-09] Sebelumnya di-filter data_source:'DAILY_INPUT_EVENT' saja, sehingga seluruh baris
      // Standby/Breakdown historis (data_source='RECONSTRUCTED_ACTUAL') tidak pernah muncul di tab
      // Standby/BD — malah ikut kebaca di tab Support (unit Support) karena tab Support memuat semua
      // status. Sekarang filter data_source DIHAPUS dari query (diFetch cuma dukung .eq, bukan .in),
      // dan status Standby/Breakdown difilter di sisi client sebelum di-map ke DI.sb — supaya baris
      // lama & baru sama-sama tampil di tab yang benar, apapun data_source-nya.
      (cS && !K.has('sb')) ? diFetch('unit_status_actual','status_id,unit_code,status,category,sub_reason,start_time,end_time,duration_hours',{status_date:date, shift_code:shift}) : Promise.resolve(null),
      cD ? diFetch('delay_events','delay_event_id,hour_label,fleet_code,unit_code,delay_code,duration_hours',{event_date:date, shift_code:shift}) : Promise.resolve([]),
      diFetch('idle_events', cI ? 'idle_event_id,hour_label,scope,fleet_code,unit_code,idle_code,duration_hours,start_time,end_time,rainfall_mm' : 'scope,idle_code,duration_hours', {event_date:date, shift_code:shift}),
      K.has('fuel') ? Promise.resolve(null) : diFetch('fuel_actual', 'fuel_id,unit_code,fleet_code,fuel_liters,data_source', {fuel_date:date, shift_code:shift}),
      K.has('hm') ? Promise.resolve(null) : diFetch('unit_hm_actual', 'hm_id,unit_code,hm_start,hm_end,operating_hours,data_source', {actual_date:date, shift_code:shift})
    ].map(T));
    if(tok !== DI._tok) return;   // ada load yang lebih baru (ganti tanggal/shift) — buang hasil ini
    if(rosterRows){
      DI.roster = {};
      rosterRows.slice().sort((a,b)=> (a.slot_idx??0)-(b.slot_idx??0)).forEach(r=>{
        if(!r.hauler_unit_code) return;
        const arr = DI.roster[r.fleet_code] || (DI.roster[r.fleet_code] = []);
        if(!arr.includes(r.hauler_unit_code)) arr.push(r.hauler_unit_code);
      });
    }
    DI.stAll = st;   // baris mentah shift ini (termasuk yang tanpa hour_label) — dipakai diUnitWorkingHours
    // [FIX 2026-10 FLEET EXISTENCE] Cache seluruh baris production_actual shift ini (semua jam, bukan
    // cuma jam yang sedang dibuka) — dipakai diFromDb()/diFleetDefaults() sebagai fallback digger/
    // material/operator/location/dist utk fleet yang ADA di roster tapi kebetulan NOL baris di jam h
    // tertentu (mis. jam Work End/Change Shift). Data yang sama persis yang sudah difetch di atas
    // (`prod`), cuma tidak dibuang setelah dikelompokkan per jam seperti DI.db.
    DI.prodAll = prod;
    // [UI 2026-09 DAILY INPUT COMPLETENESS] cache mentah delay_events/idle_events shift ini (data yang
    // SAMA PERSIS sudah di-fetch di atas untuk keperluan lain) — HANYA dipakai utk indikator kelengkapan
    // jam per unit di panel Daily Input (diCompletenessRows/diCompletenessBanner). Tidak mengubah query,
    // tidak menulis apa pun, tidak menyentuh DI.db/mapping/logic simpan yang sudah ada.
    DI.dlAll = dl; DI.idlAll = idl;
    if(sbRows){
      // [FIX 2026-09 v2] Sebelumnya SEMUA baris Standby/Breakdown ditarik ke tab Standby/BD, termasuk
      // punya unit Production (ADT/IV/TL/Exca Digger) yang di jam LAIN pada shift yang sama masih
      // Working — itu menyebabkan overlap palsu terhadap entry Production jam tersebut. Aturan yang
      // benar: unit yang MASIH ada Working di shift ini tetap direpresentasikan per-jam di tab
      // Jam/Production; tab Standby/BD (event level-shift) HANYA untuk unit yang BENAR-BENAR tidak
      // Working sama sekali sepanjang shift ini (Standby/BD penuh, bisa sampai 1 hari penuh).
      const workingUnitsThisShift = new Set((st||[]).filter(r=> r.status==='Working').map(r=> r.unit_code));
      const sbOnly = sbRows.filter(r=> (r.status==='Standby' || r.status==='Breakdown') && !workingUnitsThisShift.has(r.unit_code));
      // [FIX 2026-09 v3] Data historis hasil rekonstruksi per-jam menyimpan Standby/BD sebagai BANYAK
      // baris terpisah (satu per jam), padahal ini satu event yang sama (unit sama, status sama,
      // kategori/alasan sama, jam-nya berurutan). Kalau ditampilkan apa adanya, satu shift Standby bisa
      // muncul jadi 8-12 baris terpisah di tab ini. Digabung dulu di sini jadi SATU baris per event
      // kontinu (start = jam paling awal, end = jam paling akhir) sebelum masuk DI.sb — baris lain yang
      // ikut tergabung (mergedIds) tetap ada di DI.sbOrigIds supaya saat Simpan, baris² lama itu
      // otomatis DIHAPUS dan diganti satu baris event hasil gabungan (lihat diSaveSb: id yang tidak ada
      // lagi di DI.sb otomatis di-bulkDelete).
      const keyOf = r=> [r.unit_code, r.status, r.category||'', r.sub_reason||''].join('|');
      const groups = {};
      sbOnly.forEach(r=>{ (groups[keyOf(r)] ||= []).push(r); });
      const merged = [];
      Object.values(groups).forEach(rows=>{
        rows.sort((a,b)=> (a.start_time||'').localeCompare(b.start_time||''));
        let cur = null;
        rows.forEach(r=>{
          const st_ = (r.start_time||'').slice(0,5), en_ = (r.end_time||'').slice(0,5);
          if(cur && cur.end === st_){ cur.end = en_; cur.mergedIds.push(r.status_id); }
          else { cur = { status_id:r.status_id, unit_code:r.unit_code, status:r.status, category:r.category, sub_reason:r.sub_reason, start:st_, end:en_, mergedIds:[] }; merged.push(cur); }
        });
      });
      DI.sb = merged.map(r=>({
        status_id:r.status_id, unit:r.unit_code, kind: r.status==='Breakdown' ? 'BD' : 'SB',
        cat: r.status==='Breakdown' ? '' : (r.category||''), reason: r.status==='Breakdown' ? '' : (r.sub_reason||''),
        bdcat: r.status==='Breakdown' ? (r.category||'') : '', bdreason: r.status==='Breakdown' ? (r.sub_reason||'') : '',
        start:r.start, end:r.end
      }));
      DI.sbOrigIds = sbOnly.map(r=>r.status_id);
    }
    if(fuel){
      DI.fuelDb = {}; DI.fuel = {};
      fuel.forEach(r=>{
        DI.fuelDb[r.unit_code] = { fuel_id:r.fuel_id, fleet_code:r.fleet_code, fuel_liters:Number(r.fuel_liters)||0, data_source:r.data_source };
        DI.fuel[r.unit_code] = { liter:String(r.fuel_liters ?? '') };
      });
    }
    if(hm){
      DI.hmDb = {}; DI.hm = {};
      hm.forEach(r=> DI.hmDb[r.unit_code] = { hm_id:r.hm_id, hm_start:Number(r.hm_start), hm_end:Number(r.hm_end), operating_hours:r.operating_hours, data_source:r.data_source });
    }
    DI.db = {}; DI.pend.clear();
    const slot = h=> DI.db[h] || (DI.db[h] = {prod:[], st:[], dl:[], idl:[]});
    prod.forEach(r=> slot(hourOf(r)).prod.push(r));
    st.filter(r=>r.hour_label).forEach(r=> slot(hourOf(r)).st.push(r));
    dl.filter(r=>r.hour_label).forEach(r=> slot(hourOf(r)).dl.push(r));
    idl.filter(r=>r.scope==='UNIT' && r.hour_label).forEach(r=> slot(hourOf(r)).idl.push(r));
    DI.legacy = st.filter(r=>!r.hour_label).length;   // status level-shift lama (tanpa jam)
    // HM sebelumnya (bergantung pada DI.stAll) + aturan cuaca (cache) — keduanya independen, jalan paralel.
    const [hmPrev] = await Promise.all([ diFetchPrevHm(diWorkingUnits().map(u=>u.value)), diLoadWeatherRules() ].map(T));
    if(tok !== DI._tok) return;
    if(DI._wxRulesErr) throw new Error('weather_equipment_rules gagal dimuat');   // aturan cuaca hilang -> auto-idle cuaca salah -> jangan izinkan Save
    DI.hmPrev = hmPrev;
    // [WEATHER EVENT 2026-09] event based (Type+Start+End+Rainfall), multi-event per shift; DI.wxEvents dari idle_events GLOBAL.
    if(!K.has('wx')){
      DI.wxEvents = idl.filter(r=>r.scope==='GLOBAL' && ['I01','I02','I03'].includes(r.idle_code)).map(r=>({
        id:r.idle_event_id, code:r.idle_code,
        start:(r.start_time||'').slice(0,5), end:(r.end_time||'').slice(0,5),
        rainfall_mm: r.rainfall_mm ?? '', hours:Number(r.duration_hours)||0
      }));
      DI.wxDeleted = [];
    }
    Object.keys(DI.db).forEach(h=>{ if(!DI.dirty.has(+h)) DI.forms[h] = diFromDb(+h); });
    Object.keys(DI.forms).forEach(h=>{ if(!DI.dirty.has(+h) && !DI.db[h]) delete DI.forms[h]; });
    Object.keys(DI.forms).forEach(h=>{ if(!DI.dirty.has(+h)) diSupportFillOperators(+h); });   // [FIX 2026-12] operator continuity Support (semua jam sudah terbentuk, evidence lintas jam tersedia)
    diApplyWeatherAutoAll();   // [WEATHER AUTO-IDLE] terapkan ke semua jam yang baru dimuat/direkonstruksi
    diResolveOperatorConflictsAll();   // [OPERATOR AUTO-REASSIGN] resolve real operator double-assignment, jam non-dirty saja
    const hs = diHours();
    DI.hour = pick!=null ? pick : (hs.includes(DI.hour) ? DI.hour : (hs.find(h=>!diIsFilled(h)) ?? hs[0]));
  }catch(err){
    if(tok !== DI._tok) return;
    console.error(`[Mineboard][DailyInput] load gagal date=${date} shift=${shift} status=${(err&&(err.status||err.code))||'n/a'} message=${(err&&err.message)||err}`, err);
    DI.loadErr = (err && err.message) || String(err);
    showToast('Data Daily Input gagal dimuat — Save dinonaktifkan. Klik Retry.', 'error');
    DI.db = {}; if(DI.hour==null) DI.hour = diHours()[0];
  }
  if(tok !== DI._tok) return;
  DI.loading = false;
  if(!DI.loadErr){ DI.loadedKey = date + '|' + shift; DI.loadedParts = { key:DI.loadedKey, parts:['roster','sb','wx','fuel','hm'] }; }
  diEnsureForm(DI.hour);
  if(silent && !DI.loadErr && diUpdateTimelineUI()) diPaintBody();
  else diPaint();
}

/* Baris Supabase → form jam (rekonstruksi assignment + segmen status) */
/* [ROOT CAUSE FIX 2026-11 — "Unit X dipakai ganda: Support #A dan Support #B"]
   TRACING: diValidate's useUnit()/unitSeen (baris ~8078/8158) membandingkan SETIAP entry di f.support
   sebagai record independen. Tapi f.support sendiri (dibangun di diFromDb, di bawah) TIDAK PERNAH
   menjamin satu unit = satu entry — ia mem-push dari 4 sumber Supabase terpisah (unit_status_actual
   status=Working, idle_events scope UNIT, delay_events scope UNIT, unit_status_actual status=Standby/
   Breakdown) TANPA cross-check, jadi satu unit yang punya baris di 2+ sumber (mis. weather auto-idle
   menulis idle_events I02 Slippery untuk jam yang sama unit itu JUGA punya baris Standby/Breakdown di
   unit_status_actual) muncul sebagai 2 OBJEK BERBEDA di f.support untuk unit+jam yang SAMA PERSIS.
   diValidate lalu benar secara lokal (dua objek array ≠ dua record nyata) tapi salah secara logis:
   ini SAME UNIT-HOUR SLOT dibaca dua kali dari dua tabel, bukan dua assignment berbeda yang overlap.
   Bukti tambahan: diSupportUnitCard (baris ~8934) sendiri hanya findIndex() — SATU baris per unit
   sudah jadi asumsi struktural UI, jadi kemunculan 2 entry adalah bug rekonstruksi, bukan data valid.
   FIX (identity/source matching, general — bukan hardcode per unit code):
   isSameLogicalEvent(a,b) = unit sama DAN sama-sama berasal dari jam+tanggal+shift yang sama (f.support
   1 array = 1 jam, jadi cukup unit sama). Kalau true -> MERGE jadi satu entry, prioritas status yang
   paling otoritatif: BD/SB (unit_status_actual, ground-truth "tidak bekerja") > I (idle_events) >
   D (delay_events) > W (Working) — supaya status Standby/Breakdown asli tidak "tertutup" oleh idle_events
   turunan weather-auto, dan sbMirrorUnits (diValidate) yang mengenali status SB/BD tetap bekerja benar
   setelah merge (inilah yang juga memperbaiki "Support bentrok dengan Standby/BD" palsu — akar
   masalahnya SAMA: sebelum merge, unit itu tampil sebagai entry 'I' di f.support, BUKAN 'SB'/'BD',
   jadi lolos dari sbMirrorUnits dan dibandingkan sebagai konflik nyata terhadap DI.sb).
   REAL SEPARATE ASSIGNMENT + OVERLAP tetap tertangkap: ini hanya menggabungkan entry unit YANG SAMA di
   sumber tabel berbeda untuk jam yang sama, TIDAK menyentuh kasus 2 unit berbeda atau 2 jam berbeda. */
function diDedupeSupport(support){
  const PRIO = { BD:4, SB:4, I:3, D:2, W:1 };
  const byUnit = new Map();
  support.forEach(row=>{
    if(!row.unit) return;
    const prev = byUnit.get(row.unit);
    if(!prev){ byUnit.set(row.unit, row); return; }
    const keep = (PRIO[row.s]||0) > (PRIO[prev.s]||0) ? row : prev;
    const drop = keep===row ? prev : row;
    // [FIX 2026-12 OPERATOR CONTINUITY] Baris yang dibuang (mis. Working 16 mnt) bisa saja membawa operator_code
    // dari unit_status_actual, sedangkan baris yang dipertahankan (Idle/Delay dari idle_events/delay_events)
    // TIDAK punya kolom operator. Operator adalah bukti untuk unit+jam yang SAMA, jadi ikut dibawa (bukan dibuang).
    if(!keep.operator && drop.operator){ keep.operator = drop.operator; keep._opSource = 'same_hour_timeline'; }
    console.debug('[diDedupeSupport] SAME LOGICAL EVENT merged (bukan duplicate assignment):',
      { unit:row.unit, kept:{status:keep.s, code:keep.code, source: keep.status_id?'unit_status_actual':(keep.idle_event_id?'idle_events':(keep.delay_event_id?'delay_events':'?'))},
        dropped:{status:drop.s, code:drop.code, source: drop.status_id?'unit_status_actual':(drop.idle_event_id?'idle_events':(drop.delay_event_id?'delay_events':'?'))} });
    byUnit.set(row.unit, keep);
  });
  return [...byUnit.values()];
}
function diFromDb(h){
  const d = DI.db[h], groups = new Map();
  d.prod.forEach(r=>{
    const k = [r.fleet_code, r.digger_unit_code||'', r.material_code].join('|');
    if(!groups.has(k)) groups.set(k, {fleet:r.fleet_code, digger:r.digger_unit_code||'', operator:r.operator_code||'', material:r.material_code||'',
      location:r.location_code||'', dist:r.distance_km ?? '', dsegs:null, haulers:[]});
    groups.get(k).haulers.push({unit:r.hauler_unit_code||'', driver:r.driver_code||'', rit:r.ritase ?? '', payload:r.payload ?? '', segs:null});
  });
  /* [P0 FIX 2026-10 — ROUND-TRIP AUDIT] ROOT CAUSE (versi lama di atas): segsOf() HANYA membaca d.st
     (unit_status_actual) untuk Fleet hauler/digger. Karena STANDBY UNIFICATION sengaja TIDAK PERNAH
     menulis Delay/Idle ke unit_status_actual (lihat diEventRows §STANDBY UNIFICATION) — Delay ada di
     delay_events, Idle ada di idle_events — cabang `if(s==='D'||s==='I')` di versi lama TIDAK PERNAH
     tercapai (s hanya bisa 'W'/'SB'/'BD' dari DI_ST_REV[x.status], karena x.status cuma bisa
     Working/Standby/Breakdown). Kalau unit ini tidak punya baris unit_status_actual jam ini (karena
     statusnya Delay/Idle penuh), rows.length===0 -> fallback [diSeg()] = Working. SALAH: Delay/Idle
     ditampilkan sebagai Working saat reload, dan kalau jam itu di-resave, baris delay_events/idle_events
     asli terhapus (dianggap sudah tidak ada di form) lalu diganti baris unit_status_actual Working baru
     -> DATA LOSS nyata. Di jam Work End/Change Shift makin parah: diApplyBreakAuto lalu memaksa unit
     rit=0 ini jadi Delay D05, menimpa kode delay/idle aslinya.
     FIX (read/reconstruction only — TIDAK mengubah diEventRows/diApplyBreakAuto/diProdRows/diPlan/
     diCommit/schema/Supabase apa pun): gabungkan TIGA sumber untuk unit ini di jam ini -> unit_status_actual
     (Working/Breakdown, Standby tetap dikecualikan sama seperti sebelumnya, ditangani terpisah di
     bagian `standby` di bawah), delay_events (status 'D', code dari delay_code, BUKAN pencocokan durasi),
     idle_events (status 'I', code dari idle_code, BUKAN pencocokan durasi) — supaya reason code TIDAK
     PERNAH salah tertukar antar-row seperti risiko di versi lama. Kombinasi (mis. 30 menit Working +
     30 menit Delay, atau Working+Delay+Idle sekaligus) SEKARANG menghasilkan beberapa segmen sekaligus,
     bukan cuma satu kategori. KETERBATASAN yang didokumentasikan (bukan dihilangkan diam-diam): delay_events/
     idle_events pada jalur Daily Input ini tidak selalu menyertakan start_time, sehingga urutan segmen di
     sini TIDAK bisa dipastikan kronologis — segmen ditampilkan per-sumber (Working/BD dulu, lalu Delay,
     lalu Idle), bukan diurutkan ulang berdasarkan waktu asli. Fallback [diSeg()] HANYA terjadi kalau
     KETIGA sumber benar-benar kosong untuk unit ini di jam ini. */
  const segsOf = (unit, fallbackWorking=true)=>{
    const segs = [];
    d.st.filter(x=> x.unit_code===unit && x.status!=='Standby').forEach(x=>{
      const s = DI_ST_REV[x.status] || 'W', mins = Math.round(Number(x.duration_hours)*60);
      segs.push(diSeg(s, mins, ''));
    });
    d.dl.filter(x=> x.unit_code===unit).forEach(x=>{
      segs.push(diSeg('D', Math.round(Number(x.duration_hours)*60), x.delay_code||''));
    });
    d.idl.filter(x=> x.unit_code===unit).forEach(x=>{
      segs.push(diSeg('I', Math.round(Number(x.duration_hours)*60), x.idle_code||''));
    });
    // [P0 FIX 2026-10 — _weTouched/_weAuto OVERWRITE] `__dbReal` (properti tambahan pada array, tidak
    // mengganggu .forEach/.map/.length di seluruh pemanggil existing) menandai apakah segmen ini BENAR-
    // BENAR berasal dari baris DB (unit_status_actual/delay_events/idle_events) untuk unit+jam ini, atau
    // cuma fallback default karena ketiga sumber kosong. Ini DIHITUNG ULANG setiap kali diFromDb() jalan
    // (bukan disimpan di DB, bukan bergantung pada sesi) — jadi selalu akurat begitu reconstruction
    // selesai, tidak seperti `_weTouched` yang hilang tiap object form dibuat ulang. Dipakai oleh
    // diApplyBreakAuto() di bawah supaya automation Work End/Change Shift TIDAK menimpa unit yang
    // memang sudah punya status/event nyata, hanya karena `_weTouched` (state sesi) kebetulan falsy.
    const real = segs.length > 0;
    const out = real ? segs : (fallbackWorking ? [diSeg()] : []);
    out.__dbReal = real;
    return out;
  };
  const fleets = [...groups.values()], inFleet = new Set();
  fleets.forEach(fl=>{
    fl.dsegs = segsOf(fl.digger); fl._dbReal = !!fl.dsegs.__dbReal; if(fl.digger) inFleet.add(fl.digger);
    fl.haulers.forEach(hl=>{ hl.segs = segsOf(hl.unit); hl._dbReal = !!hl.segs.__dbReal; if(hl.unit) inFleet.add(hl.unit); });
  });
  /* [ROSTER 2026-09] ROOT CAUSE FIX — daftar Hauler/ADT per Fleet+Jam SEKARANG mengikuti roster
     harian (DI.roster, dari shift_hauler_assignment: assignment_date+fleet_code+shift_code), bukan
     cuma unit yang kebetulan punya baris production_actual di jam h ini. production_actual TETAP
     satu-satunya sumber utk mengisi rit/payload/driver/segmen unit yang MEMANG beraktivitas jam ini —
     ia sudah tidak lagi dipakai untuk menentukan SIAPA SAJA yang boleh muncul.
     - Kalau Fleet sudah py minimal 1 grup di jam ini (ada baris production_actual), ADT roster yang
       belum py baris production_actual jam ini ditambahkan sbg slot kosong (unit terisi, rit/payload/
       driver kosong, segmen kosong kecuali memang ada unit_status_actual/idle_events utk unit itu jam
       ini walau tanpa baris produksi — segsOf(unit, false) tetap membaca itu). Slot kosong ini TIDAK
       memicu baris production_actual/unit_status_actual baru saat Simpan (lihat diProdRows: rit>0
       wajib; diValidate: slot "untouched" dilewati dari validasi unit) — sampai user benar2 mengisi.
     - Kalau Fleet ini punya >1 grup di jam yang sama (digger/material beda), ADT yang belum tampil di
       manapun ditambahkan ke grup PERTAMA fleet tsb saja (haveByFleet dihitung lintas grup) — supaya
       tidak dobel muncul di tiap grup.
     - Fleet yang SAMA SEKALI tidak punya grup di jam ini (nol baris production_actual utk fleet itu,
       walau ada di roster) SENGAJA TIDAK dibuatkan card baru di sini — kalau dipaksakan, field wajib
       Fleet ("Material wajib dipilih", lihat diValidate) akan selalu error utk card kosong itu dan
       memblokir Simpan & Lanjut utk jam tsb walau fleet lain di jam yg sama valid. Fleet baru/jam yang
       fleet ini blm py aktivitas apapun tetap ditangani lewat alur "+ Hauler"/diInherit seperti biasa. */
  const haveByFleet = {}, primaryGroupOf = {};
  fleets.forEach(fl=>{
    if(!primaryGroupOf[fl.fleet]) primaryGroupOf[fl.fleet] = fl;
    const s = haveByFleet[fl.fleet] || (haveByFleet[fl.fleet] = new Set());
    fl.haulers.forEach(hl=>{ if(hl.unit) s.add(hl.unit); });
  });
  Object.keys(primaryGroupOf).forEach(code=>{
    const roster = DI.roster && DI.roster[code]; if(!roster || !roster.length) return;
    const have = haveByFleet[code], fl = primaryGroupOf[code];
    roster.forEach(u=>{
      if(have.has(u)) return;
      const s = segsOf(u, false);
      fl.haulers.push({unit:u, driver:'', rit:'', payload:'', segs:s, _dbReal:!!s.__dbReal});
      inFleet.add(u); have.add(u);
    });
  });
  // [FIX 2026-10 BUG "jam 17/18 kosong"] ROOT CAUSE: sebelumnya keberadaan Fleet (card) disamakan dengan
  // keberadaan production_actual PADA JAM h ini — kalau fleet nol baris production_actual di jam h (mis.
  // Work End/Change Shift, unit-nya cuma tercatat di unit_status_actual/delay_events/idle_events tanpa
  // ritase), fleet itu SAMA SEKALI tidak dibuatkan card ('primaryGroupOf[code]' tidak pernah ada), jadi
  // roster-injection di atas (yang HANYA menambah hauler ke grup yang SUDAH ADA) tidak pernah jalan utk
  // fleet itu. Hasilnya: fleets=[] / cuma "+ Tambah Fleet", walau roster & aktivitas aktualnya ada.
  // Fix — HANYA di jam Work End/Change Shift (diWorkEndInfo truthy; jam kerja normal TIDAK diubah, tetap
  // pakai desain lama di atas supaya field wajib fleet kosong tidak memblokir Simpan jam lain): fleet yang
  // ADA di DI.roster (source of truth #1, shift_hauler_assignment) tapi belum py card di jam ini dibuatkan
  // card dari data existing — digger/material/operator/location/dist diambil dari baris production_actual
  // fleet itu di JAM LAIN pada shift yang sama (DI.prodAll, data yang sudah ada, BUKAN dikarang/hardcode).
  // Kalau fleet itu ternyata belum pernah punya production_actual sama sekali di shift ini (tidak ada
  // sumber data apa pun utk digger/material), tetap dilewati sama seperti sebelumnya — tidak mengarang.
  // Status tiap unit (Working/Delay/Idle/SB/BD) tetap 100% dari data aktual jam h via segsOf(), sama
  // seperti fleet yang sudah ada — bukan status baru, bukan dipaksa.
  const diFleetDefaults = code=>{
    const rows = (DI.prodAll||[]).filter(r=> r.fleet_code===code);
    if(!rows.length) return null;
    const r = rows[rows.length-1];   // baris paling akhir shift ini = representasi paling mutakhir
    return { digger:r.digger_unit_code||'', operator:r.operator_code||'', material:r.material_code||'',
      location:r.location_code||'', dist:r.distance_km ?? '' };
  };
  // [P0 FIX 2026-10 — F-01 FLEET ZERO-PRODUCTION DATA LOSS] ROOT CAUSE: fleet "card" existence was
  // determined ENTIRELY by having >=1 production_actual row this hour (groups di atas). Kalau seluruh
  // hauler fleet ini ritase=0 jam ini (mis. digger Breakdown/Delay, semua hauler ADT ikut Delay, tidak
  // ada baris production_actual sama sekali utk fleet ini jam ini — lihat diProdRows: rit>0 wajib),
  // fleet TIDAK PERNAH dibuatkan card di jam kerja NORMAL sebelumnya (baris di bawah HANYA jalan kalau
  // diWorkEndInfo(h) truthy) — walau unit_status_actual/delay_events/idle_events fleet itu jam ini NYATA
  // ADA. Akibatnya segsOf() tidak pernah dipanggil utk unit2 itu -> event asli tidak pernah masuk form ->
  // diPlan() (yang menghapus SELURUH baris lama jam ini by PK dan hanya menulis ulang yang ada di form)
  // menghapus event fleet ini TANPA PENGGANTI begitu user Simpan fleet LAIN di jam yang sama -> DATA LOSS.
  // FIX (read/reconstruction only — tidak mengubah diPlan/diEventRows/diCommit/schema/Supabase apa pun):
  // deteksi fleet_code yang punya baris NYATA di unit_status_actual/delay_events/idle_events jam ini
  // (kolom fleet_code sudah difetch untuk ketiganya, lihat diLoadShift) tapi belum py card sama sekali.
  // Fleet ini SEKARANG direkonstruksi lewat mekanisme yang SUDAH ADA (diFleetDefaults + roster-injection,
  // persis pola Work End di bawah) — bukan pipeline baru — supaya event aslinya ikut tersimpan lagi saat
  // form ini di-Simpan. Fleet yang BENAR2 tidak py aktivitas apapun jam ini (tidak ada production_actual
  // DAN tidak ada status/delay/idle row) TETAP tidak dibuatkan card, sama seperti desain lama, supaya
  // field wajib Material tidak memblokir Simpan jam lain untuk fleet yang memang kosong.
  const eventFleetCodes = new Set();
  [...d.st, ...d.dl, ...d.idl].forEach(x=>{ if(x.fleet_code) eventFleetCodes.add(x.fleet_code); });
  if(diWorkEndInfo(h) || eventFleetCodes.size){
    const codesToCheck = new Set([...Object.keys(DI.roster||{}), ...eventFleetCodes]);
    codesToCheck.forEach(code=>{
      if(primaryGroupOf[code]) return;   // sudah py card dari production_actual jam ini (jalur di atas)
      // [P0 FIX F-01] di luar jam Work End/Change Shift, HANYA rekonstruksi fleet yang punya data NYATA
      // (status/delay/idle) jam ini — sekadar "ada di roster" TIDAK cukup (perilaku lama dipertahankan
      // utk fleet yang memang belum beraktivitas apapun jam ini).
      if(!diWorkEndInfo(h) && !eventFleetCodes.has(code)) return;
      const def = diFleetDefaults(code);
      if(!def) return;   // fleet ini belum pernah py data apa pun di shift ini — tidak dikarang
      const dsegs = segsOf(def.digger, false);
      const fl = { fleet:code, digger:def.digger, operator:def.operator, material:def.material,
        location:def.location, dist:def.dist, dsegs, _dbReal:!!dsegs.__dbReal, haulers:[] };
      if(fl.digger) inFleet.add(fl.digger);
      const have = haveByFleet[code] || (haveByFleet[code] = new Set());
      const roster = (DI.roster && DI.roster[code]) || [];
      // [P0 FIX F-01] selain roster, tambahkan juga unit MANAPUN yang punya baris event nyata (status/
      // delay/idle) dengan fleet_code ini jam ini, walau entah kenapa unit itu tidak/belum ada di roster
      // (defensif — tidak boleh ada unit dengan data nyata yang hilang dari form).
      const eventUnits = new Set();
      [...d.st, ...d.dl, ...d.idl].forEach(x=>{ if(x.fleet_code===code && x.unit_code) eventUnits.add(x.unit_code); });
      new Set([...roster, ...eventUnits]).forEach(u=>{
        if(have.has(u) || u===fl.digger) return;
        const s = segsOf(u, false);
        fl.haulers.push({unit:u, driver:'', rit:'', payload:'', segs:s, _dbReal:!!s.__dbReal});
        inFleet.add(u); have.add(u);
      });
      fleets.push(fl);
      primaryGroupOf[code] = fl;
    });
  }
  // [SUPPORT] supportCodes dihitung dulu di sini supaya bisa DIKECUALIKAN dari rekonstruksi `standby` lama
  // di bawah — mencegah unit Support (Standby/Breakdown) terbaca ganda: sekali di `standby`, sekali lagi
  // di `support`. Tanpa ini, diValidate akan salah menganggap unit tersebut "dipakai ganda" saat reload.
  const supportCodes = new Set((ADMIN_LOOKUP_CACHE.support||[]).map(o=>o.value));
  const standby = d.st.filter(x=> !inFleet.has(x.unit_code) && !supportCodes.has(x.unit_code) && (x.status==='Standby' || x.status==='Breakdown'))
    .map(x=> ({unit:x.unit_code, s:DI_ST_REV[x.status], dur:Math.round(Number(x.duration_hours)*60)}));
  // [SUPPORT] Rekonstruksi dari unit_status_actual (Working/Standby/Breakdown) + idle_events scope UNIT
  // (Idle) — HANYA unit yang production_classification='SUPPORT' (master_units, via ADMIN_LOOKUP_CACHE.support).
  // Tidak menyentuh d.prod/inFleet sama sekali: Support secara struktural tidak pernah punya baris production_actual.
  // [FIX 2026-09] Sebelumnya SEMUA status (termasuk Standby/Breakdown) unit Support ikut direkonstruksi
  // ke sini, sehingga unit Support yang sebenarnya Standby/BD nongol di tab Support (bukan di tab
  // Standby/BD tempat seharusnya — lihat perbaikan diLoadShift/DI.sb di atas). Sekarang tab Support
  // hanya merekonstruksi status Working; Standby/Breakdown unit Support ditangani exclusive oleh tab
  // Standby/BD (DI.sb), sesuai desain aslinya di komentar diSupportRowCard.
  const support = d.st.filter(x=> supportCodes.has(x.unit_code) && x.status==='Working')
    .map(x=> ({unit:x.unit_code, s:'W', dur:Math.round(Number(x.duration_hours)*60), code:'', operator:x.operator_code||'', status_id:x.status_id}));
  // Baris Idle unit Support tersimpan HANYA di idle_events (scope UNIT), tidak di unit_status_actual —
  // ditambahkan sebagai entry support terpisah, meniru pola segsOf() di atas untuk fleet.
  // [FIX 2026-09 LOCK CONSISTENCY] idle_event_id ikut dibawa supaya baris ini dikenali sebagai EXISTING
  // DATABASE RECORD (lihat diSupportUnitCard) — sebelumnya id tidak pernah disimpan di sini sehingga
  // baris Idle/Delay existing tidak pernah bisa dibedakan dari input baru, walau datanya sama-sama
  // sudah ada di Supabase seperti baris Working/Standby/Breakdown (yang sudah membawa status_id).
  d.idl.filter(x=> supportCodes.has(x.unit_code)).forEach(x=>{
    support.push({ unit:x.unit_code, s:'I', dur:Math.round(Number(x.duration_hours)*60), code:x.idle_code||'', idle_event_id:x.idle_event_id });
  });
  // [FIX 2026-09 AUDIT] Delay unit Support tersimpan di delay_events (scope UNIT), sama seperti Idle —
  // sebelumnya TIDAK PERNAH dibaca di sini sehingga baris Delay unit Support hilang total saat reload
  // (summary sc.D selalu 0 walau datanya ada di Supabase). Sekarang direkonstruksi sama seperti Idle.
  // [FIX 2026-09 LOCK CONSISTENCY] delay_event_id ikut dibawa, sama alasannya dengan idle_event_id di atas.
  d.dl.filter(x=> supportCodes.has(x.unit_code)).forEach(x=>{
    support.push({ unit:x.unit_code, s:'D', dur:Math.round(Number(x.duration_hours)*60), code:x.delay_code||'', delay_event_id:x.delay_event_id });
  });
  // [FIX 2026-09 AUDIT v2] Ditemukan via audit SQL langsung: sejumlah unit Support punya status
  // Standby/Breakdown yang tersimpan PER-JAM di unit_status_actual (hour_label terisi per jam, sama
  // seperti Working) — BUKAN sebagai event level-shift di tab Standby/BD. Refactor sebelumnya ("[FIX
  // 2026-09]" di atas) berhenti membaca status ini sama sekali dari sini, dengan asumsi SEMUA
  // Standby/BD unit Support selalu masuk lewat tab Standby/BD (DI.sb) — asumsi ini TIDAK SELALU BENAR
  // untuk data lama, sehingga unit tsb hilang total dari tab Support (bukan Working/Idle/Delay, dan
  // tidak direkonstruksi ke mana pun) — tampak sebagai "Unknown" padahal statusnya sebenarnya JELAS.
  // Sekarang direkonstruksi kembali sebagai s:'SB'/'BD' (bucket "Standby/BD (data lama)" yang sudah
  // ada di summary bar & diSupportUnitCard, tapi sebelumnya tidak pernah terisi lagi).
  d.st.filter(x=> supportCodes.has(x.unit_code) && (x.status==='Standby' || x.status==='Breakdown')).forEach(x=>{
    support.push({ unit:x.unit_code, s: x.status==='Breakdown' ? 'BD' : 'SB', dur:Math.round(Number(x.duration_hours)*60), code:'', operator:x.operator_code||'', status_id:x.status_id });
  });
  return { fleets, standby, support: diDedupeSupport(support) };
}

/* Jam baru: warisi assignment jam terdekat sebelumnya (ritase & segmen di-reset) */
function diInherit(h){
  const hs = diHours();
  for(let i = hs.indexOf(h)-1; i>=0; i--){
    // [FIX unit kosong di jam Meal/Change Shift] Sebelumnya HANYA cek DI.forms[hs[i]] — kalau jam
    // sebelumnya itu belum pernah "dimaterialisasi" jadi form di sesi ini (walau datanya ADA di
    // DI.db/Supabase), diInherit gagal nemu sumber dan jam 12/18/00/06 jadi tampil KOSONG tanpa unit
    // sama sekali. Sekarang fallback baca langsung dari DI.db via diFromDb(hs[i]) kalau ada datanya,
    // supaya daftar unit tetap muncul di jam meal/change-shift walau jam sebelumnya belum sempat dibuka.
    const src = DI.forms[hs[i]] || (DI.db && DI.db[hs[i]] ? diFromDb(hs[i]) : null);
    if(src){
      const c = JSON.parse(JSON.stringify(src));
      // [P0 FIX 2026-10 — _weTouched/_weAuto OVERWRITE] `src` diclone dari jam LAIN (jam sebelumnya) —
      // `_dbReal`/`_weTouched`/`_weAuto` milik jam itu TIDAK BOLEH ikut terbawa ke jam BARU ini (jam ini
      // belum punya data DB sama sekali, itulah kenapa diInherit() dipanggil). Tanpa reset ini, JSON
      // clone akan salah menandai fl/hl di jam baru sebagai "_dbReal:true" hanya karena jam sumbernya
      // punya data — akibatnya auto-D05 untuk slot yang memang benar-benar kosong di jam baru ini tidak
      // akan pernah jalan. Direset di sini, bukan di segsOf(), karena diInherit() tidak lewat segsOf().
      c.fleets.forEach(fl=>{
        fl.dsegs=[diSeg()]; fl._dbReal=false; fl._weTouched=false; fl._weAuto=false;
        fl.haulers.forEach(hl=>{ hl.rit=''; hl.segs=[diSeg()]; hl._dbReal=false; hl._weTouched=false; hl._weAuto=false; });
      });
      // [FIX 2026-09 v3 — root cause A] Sebelumnya Support SENGAJA tidak diwarisi ("Phase 12"),
      // sehingga operator Support hilang total di jam Meal & Rest / Change Shift / transisi Day→Night
      // (jam-jam itu auto-delay, bukan input manual, jadi tidak ada assignment baru dan Support jadi
      // kosong). Sekarang: jika jam ini adalah jam auto-delay (diBreakInfo(h) truthy, mis. 12/18/00/06
      // dan continuation-nya), Support DIWARISI dari jam kerja terdekat sebelumnya (operator ikut,
      // durasi tetap direset lewat map di bawah) supaya operator tidak hilang. Untuk jam kerja normal
      // (bukan auto-delay), perilaku lama dipertahankan: Support kosong = "belum diinput", user tetap
      // harus mengisi ulang secara sengaja.
      c.standby = [];
      c.support = diBreakInfo(h)
        ? c.support.map(s=>({ ...s, dur:60 }))
        : [];
      return c;
    }
  }
  return { fleets:[diFleet()], standby:[], support:[] };
}
function diEnsureForm(h){
  if(h!=null && !DI.forms[h]){ DI.forms[h] = diInherit(h); diApplyWeatherAuto(h); }
  // [FIX unit hilang di jam Meal/Change Shift YANG SUDAH PERNAH DISIMPAN] Jam meal/change-shift tidak
  // pernah punya baris production_actual (cuma unit_status_actual Delay) — diFromDb() untuk jam ini
  // SELALU balikin fleets:[] walau datanya sudah ada di Supabase, karena grup fleet dibangun dari
  // production_actual. Kalau jam ini sudah pernah disimpan, DI.forms[h] jadi truthy (fleets kosong)
  // sehingga diInherit() di atas tidak pernah kepanggil -> unit hilang total dari tampilan. Deteksi
  // kasus itu di sini dan warisi ulang assignment Fleet/Digger/Hauler dari jam kerja terdekat.
  if(h!=null && diBreakInfo(h) && DI.forms[h] && (!DI.forms[h].fleets || !DI.forms[h].fleets.length)){
    DI.forms[h] = diInherit(h);
  }
  diApplyBreakAuto(h);
}

/* ---------- MUTASI STATE (satu setter generik berbasis path, mis. 'fleets.0.haulers.1.rit') ---------- */
function diSet(path, val, redraw){
  const f = diForm(); if(!f) return;
  const k = path.split('.'), last = k.pop(); let o = f; k.forEach(x=>{ o = o[x]; });
  o[last] = last==='dur' ? diN(val) : val;
  if(last==='s') o.code = '';
  // [WEATHER AUTO-IDLE] user mengubah status/durasi/kode secara manual -> berhenti diikuti otomatis oleh cuaca.
  if(['s','dur','code'].includes(last) && typeof o==='object' && 's' in o) o._wxTouched = true;
  // [OPERATOR AUTO-REASSIGN] user mengedit operator secara manual -> jangan pernah ditimpa lagi oleh
  // diResolveOperatorConflicts (assignment yang sejak awal/sudah disentuh user tidak boleh diubah, Rule 6).
  if(last==='operator') o._opTouched = true;
  // [UI 2026-09/11 WORK-END + MEAL GATE] user mengedit segmen/rit secara manual pada jam Work
  // End/Change Shift ATAU Meal & Rest -> tandai _weTouched/_mealTouched supaya diApplyBreakAuto tidak
  // lagi menimpa baris ini secara otomatis (mis. user sengaja set Delay dengan alasan lain, bukan
  // default D05/D03 bawaan). Kedua flag ditandai bersamaan — tidak masalah, hanya salah satu yang
  // relevan tergantung jam mana yang sedang aktif (diBreakInfo vs diWorkEndInfo saling eksklusif).
  if(['s','dur','code'].includes(last)){
    const mh = path.match(/^fleets\.(\d+)\.haulers\.(\d+)\.segs\.\d+\.(?:s|dur|code)$/);
    if(mh) Object.assign(f.fleets[+mh[1]].haulers[+mh[2]], {_weTouched:true, _mealTouched:true});
    const md = path.match(/^fleets\.(\d+)\.dsegs\.\d+\.(?:s|dur|code)$/);
    if(md) Object.assign(f.fleets[+md[1]], {_weTouched:true, _mealTouched:true});
    const ms = path.match(/^support\.(\d+)\.(?:s|dur|code)$/);
    if(ms) Object.assign(f.support[+ms[1]], {_mealTouched:true});
  }
  // rit/payload diisi manual saat jam Meal & Rest juga harus dianggap "disentuh" walau bukan lewat
  // path .segs. — supaya diApplyBreakAuto tidak menimpanya balik ke Delay D03 (ini JUSTRU jalur utama
  // deteksi "unit tetap Working" karena diApplyBreakAuto sendiri membaca rit>0 duluan, jadi _mealTouched
  // di sini hanya jaga-jaga untuk kasus rit dikosongkan lagi setelah sempat diisi).
  {
    const mr = path.match(/^fleets\.(\d+)\.haulers\.(\d+)\.(?:rit|payload)$/);
    if(mr) f.fleets[+mr[1]].haulers[+mr[2]]._mealTouched = true;
  }
  DI.dirty.add(DI.hour);
  // [WEATHER AUTO-IDLE] unit baru dipasang (Digger/Hauler/Support) -> langsung cek cuaca jam ini.
  if(last==='digger' || last==='unit') diApplyWeatherAuto(DI.hour);
  // [UI 2026-09 MEAL/CHANGE-SHIFT + WORK-END AUTO] re-sync tiap perubahan supaya ritase yang baru
  // diisi/dikosongkan langsung tercermin sebagai Working/Delay D05 di jam Work End.
  diApplyBreakAuto(DI.hour);
  redraw ? diPaintBody() : diMeta();
}
function diAdd(path, kind){
  const f = diForm(); let arr = f; path.split('.').forEach(x=>{ arr = arr[x]; });
  const left = kind==='seg' ? Math.max(0, 60 - arr.reduce((a,s)=>a+diN(s.dur),0)) : 0;
  arr.push({hauler:diHauler, fleet:diFleet, seg:()=>diSeg('W',left), sb:()=>({unit:'',s:'SB',dur:60}), support:diSupportRow}[kind]());
  // [UI 2026-11 FIX "Actual belum diisi"] Saat user menekan "+ Isi Status" untuk mengisi actual pertama
  // kali pada slot yang sebelumnya kosong (segs=[]), tandai parent (fl.dsegs / hl.segs) sebagai
  // _weTouched/_mealTouched supaya diApplyBreakAuto (dipanggil lagi di diSet berikutnya) TIDAK menimpa
  // balik jadi kosong/Delay — persis prinsip "actual yang sudah diisi user menang atas default".
  if(kind==='seg'){
    const md = path.match(/^fleets\.(\d+)\.dsegs$/);
    if(md) Object.assign(f.fleets[+md[1]], {_weTouched:true, _mealTouched:true});
    const mh = path.match(/^fleets\.(\d+)\.haulers\.(\d+)\.segs$/);
    if(mh) Object.assign(f.fleets[+mh[1]].haulers[+mh[2]], {_weTouched:true, _mealTouched:true});
  }
  DI.dirty.add(DI.hour); diPaintBody();
}
function diDel(path){
  const f = diForm(), k = path.split('.'), i = +k.pop(); let arr = f; k.forEach(x=>{ arr = arr[x]; });
  arr.splice(i,1); DI.dirty.add(DI.hour); diPaintBody();
}
function diChangeCtx(key, val){
  if(key==='date' && !val) return;   /* tanggal dikosongkan -> abaikan, jangan query dengan tanggal kosong */
  const go = ()=>{ DI[key] = val; DI.forms = {}; DI.dirty.clear(); DI.hour = null; DI.supExtra = new Set(); DI.sbExtra = new Set(); DI.sbConfirmedW = new Set(); DI.supPicker = false; DI.sbPicker = false; diLoadShift(); };
  if(DI.dirty.size) openConfirmModal('Ada perubahan jam yang belum disimpan. Ganti tanggal/shift akan membuangnya. Lanjutkan?', go);
  else go();
}
/* [DI PERF 2026-09] diSelectHour SEBELUMNYA memanggil diPaint() penuh (rebuild total: top bar,
   timeline 24 slot, tabs, banner) padahal cuma perlu: (a) highlight slot jam aktif di timeline,
   (b) ganti isi body sesuai tab 'jam'. diUpdateTimelineUI melakukan update DOM minimal (toggle
   class + progress counter) tanpa innerHTML ulang; diPaintBody() sudah ada sebelumnya untuk isi
   body saja. Fallback ke diPaint() penuh kalau shell belum pernah dirender (mis. pemanggilan
   pertama sebelum DI.el terisi) supaya tidak pernah menampilkan halaman kosong. */
function diUpdateShiftTlUI(){
  // [FIX synchronization] diShiftTimeline() (top phase banner: WORKING/MEAL & REST/WORK END/
  // CHANGE SHIFT + progress marker) harus mengikuti selectedHour setiap kali DI.hour berubah,
  // bukan hanya saat full diPaint(). Sebelumnya diSelectHour/diUpdateTimelineUI hanya menyentuh
  // strip 24-slot jam + body, sehingga banner fase bisa "nyangkut" di jam sebelumnya walau hour
  // selector sudah pindah (lihat spec §5/§6/§14 — single source of truth: DI.hour).
  const el = DI.el; if(!el) return false;
  const box = el.querySelector('#diShiftTl'); if(!box) return false;
  box.innerHTML = diShiftTimeline();
  return true;
}
function diUpdateTimelineUI(){
  const el = DI.el; if(!el) return false;
  const tl = el.querySelector('.di-tl'); if(!tl) return false;
  diUpdateShiftTlUI();
  const hs = diHours();
  const slots = tl.children;
  if(slots.length !== hs.length) return false;   // struktur beda (mis. shift ganti jumlah jam) -> full repaint
  for(let i=0;i<hs.length;i++){
    const h = hs[i], btn = slots[i];
    btn.classList.toggle('done', diIsFilled(h));
    btn.classList.toggle('active', h===DI.hour);
    btn.classList.toggle('dirty', DI.dirty.has(h));
  }
  const progB = el.querySelector('.di-prog b');
  if(progB) progB.textContent = hs.filter(diIsFilled).length;
  // diSelectHour selalu memindahkan tab aktif ke 'jam' — sinkronkan highlight tombol tab juga,
  // supaya tidak perlu diPaint() penuh hanya untuk memindahkan class 'on' di 1 tombol.
  const tabBtns = el.querySelectorAll('.di-tabs button');
  const tabKeys = ['jam','sup','sb','cuaca','hm','fuel'];
  tabBtns.forEach((btn,i)=> btn.classList.toggle('on', tabKeys[i]===DI.tab));
  return true;
}
function diSelectHour(h){
  DI.hour = h; DI.tab = 'jam'; DI.supExtra = new Set(); DI.supPicker = false;
  diEnsureForm(h);
  if(!diUpdateTimelineUI()) return diPaint();   // shell belum ada -> full render, lalu selesai
  diPaintBody();
}
/* [DI PERF 2026-09] Pindah tab (Jam/Support/Standby/Cuaca/HM/Fuel) sebelumnya juga diPaint() penuh
   walau top bar & timeline 24-slot-nya identik — hanya class 'on' di tombol tab + isi #diBody yang
   berbeda. Sama seperti diSelectHour di atas: update DOM minimal, fallback ke diPaint() penuh kalau
   shell belum ada. */
function diSwitchTab(k){
  DI.tab = k;
  const el = DI.el;
  if(el){
    const tabBtns = el.querySelectorAll('.di-tabs button');
    const tabKeys = ['jam','sup','sb','cuaca','hm','fuel'];
    if(tabBtns.length === tabKeys.length){
      tabBtns.forEach((btn,i)=> btn.classList.toggle('on', tabKeys[i]===k));
      return diPaintBody();
    }
  }
  diPaint();
}
function diCopyPrev(){
  const h = DI.hour, run = ()=>{ delete DI.forms[h]; diEnsureForm(h); DI.dirty.add(h); diPaint(); };
  const hs = diHours(), prev = hs[hs.indexOf(h)-1];
  if(prev==null || !DI.forms[prev]){ showToast('Belum ada jam sebelumnya untuk disalin.', 'info'); return; }
  diIsFilled(h) ? openConfirmModal('Jam ini sudah terisi. Salin assignment dari jam sebelumnya akan menimpa isian di layar (belum tersimpan)?', run) : run();
}

/* ---------- VALIDASI (satu sumber; dipakai live + saat simpan) ---------- */
function diValidate(h){
  const f = DI.forms[h], out = [], E = m=>out.push({l:'err', m}), W = m=>out.push({l:'warn', m});
  if(!DI.date || !DI.shift) E('Tanggal dan Shift wajib dipilih.');
  if(!f) return out;
  const seen = new Set(), keys = new Set(), unitSeen = new Map(), opSeen = new Map(), drvSeen = new Map();
  // [DEBUG TRACE] Setiap kali useUnit() benar2 mengeluarkan error "dipakai ganda", log record mentah A
  // vs B ke console supaya bisa ditelusuri exact identity yang dibandingkan (unit, where/source-label,
  // jam, tanggal, shift) — dipanggil DI SINI karena ini satu2nya titik yang menghasilkan pesan tsb.
  const useUnit = (u, where)=>{
    if(!u) return;
    if(unitSeen.has(u)){
      console.debug('[diValidate] VALIDATION TRACE — unit dipakai ganda:', { date:DI.date, shift:DI.shift, hour:h, unit:u, A:unitSeen.get(u), B:where, sameLogicalEvent:false, timeOverlap:true, finalResult:'BLOCKING' });
      E(`Unit ${u} dipakai ganda: ${unitSeen.get(u)} dan ${where} (risiko double production/status).`);
    } else unitSeen.set(u, where);
  };
  // [FIX 2026-09] Guard defensif — TOLAK save walau unit SUPPORT sampai ke fl.digger/hl.unit lewat jalur
  // lain (state lama sebelum fix lookup, diCopyPrev, dsb). Sumber kebenaran: production_classification,
  // BUKAN role/nama unit. ADMIN_LOOKUP_CACHE.digger/hauler sekarang sudah terfilter PRODUCTION di sumbernya,
  // jadi "unit valid" = ada di cache tsb; kalau tidak ada → pasti bukan PRODUCTION (atau tidak aktif).
  const diggerOk = new Set((ADMIN_LOOKUP_CACHE.digger||[]).map(o=>o.value));
  const haulerOk = new Set((ADMIN_LOOKUP_CACHE.hauler||[]).map(o=>o.value));
  const checkProdUnit = (code, set, nm, label)=>{ if(code && !set.has(code)) E(`${nm}: unit ${code} bukan unit Production ${label} yang valid (kemungkinan unit SUPPORT) — pilih ulang dari dropdown.`); };
  const segCheck = (segs, name, needW)=>{
    // [BUGFIX 2026-11 — "total durasi segmen 0 menit, harus 60"] segs KOSONG ([]) berarti "Actual belum
    // diisi" (state sah, lihat diApplyBreakAuto/diWorkEndInfo untuk jam Work End 17-18 D / 05-06 N) —
    // BUKAN error. Validasi total=60 HANYA berlaku setelah actual benar-benar diisi (segs.length>0).
    // Dipanggil hanya dari call-site yang sudah menjaga ini (lihat di bawah), guard di sini untuk jaga-jaga.
    if(!segs || !segs.length) return;
    const sum = segs.reduce((a,s)=>a+diN(s.dur),0);
    if(sum !== 60) E(`${name}: total durasi segmen ${sum} menit, harus 60.`);
    segs.forEach(s=>{
      if(diN(s.dur) < 0) E(`${name}: durasi negatif.`);
      if(s.s==='D' && !s.code) E(`${name}: segmen Delay butuh kode delay.`);
      if(s.s==='I' && !s.code) E(`${name}: segmen Idle butuh kode idle.`);
    });
    if(needW && !segs.some(s=>s.s==='W' && diN(s.dur)>0)) E(`${name}: ritase diisi tetapi tidak ada segmen Working.`);
  };
  f.fleets.forEach((fl,i)=>{
    const nm = `Fleet #${i+1}${fl.fleet?' '+fl.fleet:''}`;
    if(!fl.fleet) E(`${nm}: Fleet wajib dipilih.`);
    if(!fl.material) E(`${nm}: Material wajib dipilih.`);
    if(diN(fl.dist) < 0) E(`${nm}: jarak tidak boleh negatif.`);
    if(fl.operator){ if(opSeen.has(fl.operator)) E(`Operator ${diLookupLabel('operator', fl.operator)} dipakai ganda: ${opSeen.get(fl.operator)} dan ${nm} (1 operator hanya boleh 1 unit per jam).`); else opSeen.set(fl.operator, nm); }
    // [OPERATOR AUTO-REASSIGN] diResolveOperatorConflicts sudah mencoba cari pengganti; kalau benar2 tidak
    // ada kandidat available, assignment dikosongkan (bukan operator palsu) — munculkan warning eksplisit.
    if(fl._opConflictUnresolved) W(`${nm}: operator sebelumnya bentrok dengan unit lain di jam ini dan tidak ada operator pengganti yang available — assignment operator dikosongkan, mohon pilih manual.`);
    useUnit(fl.digger, nm+' (digger)');
    checkProdUnit(fl.digger, diggerOk, nm, 'Digger');
    if(fl.digger) segCheck(fl.dsegs, `${nm} · ${fl.digger}`, false);
    fl.haulers.forEach((hl,j)=>{
      const hn = `${nm} · Hauler #${j+1}${hl.unit?' '+hl.unit:''}`, rit = diN(hl.rit);
      // [ROSTER 2026-09] Slot ADT yang datang dari roster (shift_hauler_assignment) dan BELUM disentuh
      // sama sekali jam ini (tanpa rit/payload/driver/segmen) bukan "assignment nyata" jam ini — cuma
      // daftar ADT yang TERSEDIA utk Fleet ini (lihat diFromDb). Dilewati dari validasi unit (dup-check,
      // segCheck, kombinasi ganda) supaya tidak memblokir Simpan & Lanjut hanya krn ADT lain di Fleet yg
      // sama tidak beraktivitas jam ini. Begitu salah satu field diisi, validasi penuh berlaku normal.
      const untouched = !!hl.unit && !rit && !diN(hl.payload) && !hl.driver && (!hl.segs || !hl.segs.length);
      if(hl.driver){ if(drvSeen.has(hl.driver)) E(`Driver ${diLookupLabel('driver', hl.driver)} dipakai ganda: ${drvSeen.get(hl.driver)} dan ${hn} (1 driver hanya boleh 1 hauler per jam).`); else drvSeen.set(hl.driver, hn); }
      if(rit < 0) E(`${hn}: ritase tidak boleh negatif.`);
      if(rit > 0 && !hl.unit) E(`${hn}: ritase diisi tetapi unit hauler belum dipilih.`);
      if(rit > DI_RIT_MAX) W(`${hn}: ${rit} rit/jam tidak wajar (> ${DI_RIT_MAX}).`);
      if(rit > 0 && !diN(hl.payload) && !diConv(fl.material, hl.unit).v) E(`${hn}: payload/rit tidak ditemukan di master_material_haul_conversions untuk material+haul unit ini — lengkapi mapping master (payload tidak bisa diisi manual).`);
      if(rit > 0 && !fl.digger) W(`${nm}: ada ritase tetapi digger belum dipilih.`);
      if(hl.unit && !untouched){
        useUnit(hl.unit, hn);
        checkProdUnit(hl.unit, haulerOk, hn, 'Hauler');
        segCheck(hl.segs, hn, rit > 0);
        const k = [fl.fleet, fl.digger, hl.unit, fl.material].join('|');
        if(keys.has(k)) E(`${hn}: duplikat kombinasi fleet+digger+hauler+material di jam ini.`); keys.add(k);
      }
    });
  });
  (f.standby||[]).forEach((s,i)=>{
    if(!s.unit) E(`Standby/BD #${i+1}: unit belum dipilih.`); else useUnit(s.unit, `Standby/BD #${i+1}`);
    if(diN(s.dur) <= 0 || diN(s.dur) > 60) E(`Standby/BD #${i+1}: durasi harus 1–60 menit.`);
  });
  // [SUPPORT] Validasi khusus modul Support (Phase 13). useUnit() dipakai bersama fleets/standby di atas —
  // otomatis memblokir 1 unit dipakai 2x pada jam yang sama (Production+Support, Support+Support, dst) TANPA
  // menimpa diam-diam, sesuai Phase 10. Cross-check terhadap event Standby/BD shift-level (DI.sb) di bawah
  // juga otomatis mencakup unit Support karena memindai unitSeen yang sama.
  const supportUnitSet = new Set((ADMIN_LOOKUP_CACHE.support||[]).map(o=>o.value));
  // [FIX 2026-09 SELF-CONFLICT] Unit Support yang direkonstruksi dengan status SB/BD (diFromDb, lihat
  // komentar "[FIX 2026-09 AUDIT v2]") adalah TAMPILAN ULANG dari event Standby/BD yang sama yang juga
  // ada di DI.sb (shift-level) — bukan pemakaian/okupasi baru. Sebelumnya unit ini tetap masuk ke
  // unitSeen & opSeen persis seperti Working, sehingga cross-check di bawah membandingkan event itu
  // dengan DIRINYA SENDIRI dan selalu menghasilkan "bentrok" palsu (persis kasus di screenshot bug).
  // sbMirrorUnits menandai unit yang jam ini statusnya SB/BD (dari Support ATAU dari f.standby) supaya
  // dikecualikan dari cross-check tsb dan dari deteksi operator dobel (operator di unit yang sedang
  // Standby/BD tidak benar-benar "memegang" unit itu jam ini).
  const sbMirrorUnits = new Set();
  (f.standby||[]).forEach(s=>{ if(s.unit) sbMirrorUnits.add(s.unit); });
  (f.support||[]).forEach(s=>{ if(s.unit && (s.s==='SB' || s.s==='BD')) sbMirrorUnits.add(s.unit); });
  (f.support||[]).forEach((s,i)=>{
    const nm = `Support #${i+1}${s.unit?' '+s.unit:''}`;
    if(!s.unit){ E(`${nm}: unit belum dipilih.`); }
    else{
      if(!supportUnitSet.has(s.unit)) E(`${nm}: unit ${s.unit} bukan unit Support (production_classification≠SUPPORT) — pilihan tidak valid.`);
      useUnit(s.unit, nm);
    }
    if(diN(s.dur) <= 0 || diN(s.dur) > 60) E(`${nm}: durasi harus 1–60 menit.`);
    if(!['W','SB','BD','I','D'].includes(s.s)) E(`${nm}: status tidak valid.`);
    if(s.s==='I' && !s.code) E(`${nm}: status Idle wajib pilih alasan (idle_events).`);
    if(s.s==='D' && !s.code) E(`${nm}: status Delay wajib pilih kode delay (delay_events).`);
    // [OPERATOR LOCK 2026-09] final prompt §4/§8 — pola SAMA PERSIS dengan opSeen Production di
    // atas (satu Map bersama `opSeen`), supaya operator dipakai ganda Production<->Support (dan
    // Support<->Support) tertolak dengan pesan konsisten, bukan jalur validasi kedua yang terpisah.
    // [FIX 2026-09 SELF-CONFLICT] Dikecualikan untuk baris SB/BD (lihat sbMirrorUnits di atas) — operator
    // yang tercatat di histori unit yang sedang Standby/Breakdown bukan pemakaian aktif jam ini.
    if(s.operator && s.s!=='SB' && s.s!=='BD'){
      const opLbl = ['operator','operatorDozer','operatorGrader','driverWT'].map(k=>fkLabel(k,s.operator)).find(l=>l!==s.operator) || s.operator;
      if(opSeen.has(s.operator)) E(`Operator ${opLbl} dipakai ganda: ${opSeen.get(s.operator)} dan ${nm} (1 operator hanya boleh 1 unit per jam).`);
      else opSeen.set(s.operator, nm);
    }
    // [OPERATOR AUTO-REASSIGN] lihat komentar sama di blok Fleet di atas.
    if(s._opConflictUnresolved) W(`${nm}: operator sebelumnya bentrok dengan unit lain di jam ini dan tidak ada operator pengganti yang available — assignment operator dikosongkan, mohon pilih manual.`);
  });
  /* Cross-module: unit yang dipakai Production jam ini tidak boleh juga punya event Standby/BD (DI.sb)
     yang overlap jam ini — lihat diSbEventCoversHour(). BLOCK, bukan menimpa diam-diam.
     [FIX 2026-09 SELF-CONFLICT] unit yang statusnya SENDIRI sudah SB/BD jam ini (sbMirrorUnits) dilewati:
     itu bukan pemakaian Production/Support yang bentrok dengan event Standby/BD, itu event yang sama. */
  // [FIX 2026-10 BUG WT01] Sebelumnya pesan ini SELALU hardcode "dipakai Production" utk unit apa pun
  // yang ada di unitSeen — padahal unitSeen juga diisi oleh unit Support (lihat useUnit(s.unit, nm) di
  // baris Support di atas). Akibatnya unit Support seperti WT 01 (Water Truck) ikut disebut "dipakai
  // Production" di conflict message, walau master_units.production_classification-nya SUPPORT. Root
  // cause: klasifikasi tidak pernah dicek ulang di titik pembuatan pesan ini, cuma diasumsikan Production.
  // Fix: klasifikasikan ULANG dari supportUnitSet (production_classification=SUPPORT, source of truth
  // yang sama dipakai validasi Support di atas), bukan dari nama/role unit dan bukan hardcode 'WT 01'.
  const diConflictRoleLabel = (u)=>{
    if(!supportUnitSet.has(u)) return 'Production';
    const opt = (ADMIN_LOOKUP_CACHE.support||[]).find(o=>o.value===u);
    return diIsWaterTruckRole(opt && opt.unit_role_code) ? 'Support / Water Truck' : 'Support';
  };
  unitSeen.forEach((where, u)=>{
    if(sbMirrorUnits.has(u)) return;
    DI.sb.forEach(r=>{ if(r.unit===u && diSbEventCoversHour(r,h)){
      console.debug('[diValidate] VALIDATION TRACE — Support/Production vs Standby-BD:', { date:DI.date, shift:DI.shift, hour:h, unit:u, A:{source:where}, B:{source:'DI.sb (Standby/BD event)', event_id:r.id, start_time:r.start, end_time:r.end}, sameLogicalEvent:false, timeOverlap:true, finalResult:'BLOCKING' });
      E(`Unit ${u} dipakai ${diConflictRoleLabel(u)} (${where}) pada jam ${diHourLabel(h)}, tapi juga punya event Standby/BD (${r.start||'?'}–${r.end||'?'}) yang bentrok. Hapus/ubah event Standby/BD unit ini dulu di tab Standby/BD.`);
    }});
  });
  return out;
}
function diTotals(f){
  let rit = 0, vol = 0;
  f.fleets.forEach(fl=> fl.haulers.forEach(hl=>{ const r = diN(hl.rit); rit += r; vol += r * (diN(hl.payload) || diConv(fl.material, hl.unit).v); }));
  return { rit, vol };
}

/* ---------- ADAPTER: form jam → baris Supabase ---------- */
function diProdRows(h){
  const rows = [];
  DI.forms[h].fleets.forEach(fl=> fl.haulers.forEach(hl=>{
    const rit = diN(hl.rit); if(!hl.unit || !(rit > 0)) return;
    const cv = diConv(fl.material, hl.unit), pay = diN(hl.payload) || cv.v;
    rows.push({ actual_date:DI.date, shift_code:DI.shift, hour_label:diHourLabel(h), fleet_code:fl.fleet,
      digger_unit_code:fl.digger||null, hauler_unit_code:hl.unit, operator_code:fl.operator||null, driver_code:hl.driver||null,
      location_code:fl.location||null, material_code:fl.material, distance_km:diN(fl.dist), ritase:rit, payload:pay||null,
      production_volume:Math.round(rit*pay*100)/100, volume_unit:cv.u, assignment_source:'SOURCE_CONFIRMED', assignment_confidence:'HIGH' });
  }));
  return rows;
}
function diEventRows(h){
  const f = DI.forms[h], lbl = diHourLabel(h), st = [], dl = [], idl = [];
  const put = (unit, fleet, seg, operator)=>{
    const mins = diN(seg.dur); if(!unit || mins <= 0) return;
    const hrs = Math.round(mins/60*100)/100;
    // [SUPPORT OPERATOR 2026-09] operator_code hanya diisi utk baris Support (param opsional, undefined
    // untuk Fleet/Standby-BD seperti sebelumnya — operator Production tetap lewat production_actual,
    // TIDAK diduplikasi ke sini, supaya tidak ada dua sumber kebenaran untuk operator Production).
    // [STANDBY UNIFICATION 2026-09] final prompt §4/§7 — Idle('I') dan Delay('D') TIDAK BOLEH masuk
    // unit_status_actual (status hanya boleh Working/Standby/Breakdown sesuai constraint schema).
    // Idle/Delay hanya ditulis ke idle_events/delay_events; Unified Standby (getUnifiedStandbyHours())
    // menjumlahkannya di read-layer, bukan di sini, supaya tidak ada dua sumber untuk jam yang sama.
    const ev = { event_date:DI.date, shift_code:DI.shift, hour_label:lbl, fleet_code:fleet||null, unit_code:unit, duration_hours:hrs };
    if(seg.s==='D'){ if(seg.code) dl.push({...ev, delay_code:seg.code}); return; }
    if(seg.s==='I'){ if(seg.code) idl.push({...ev, scope:'UNIT', idle_code:seg.code}); return; }
    st.push({ status_date:DI.date, shift_code:DI.shift, hour_label:lbl, unit_code:unit, fleet_code:fleet||null, status:DI_ST[seg.s], duration_hours:hrs, operator_code:operator||null });
    // TODO: seg.s==='BD' → kode alasan breakdown (bd_code) belum punya destinasi yang terkonfirmasi.
  };
  f.fleets.forEach(fl=>{
    fl.dsegs.forEach(s=> put(fl.digger, fl.fleet, s));
    fl.haulers.forEach(hl=> hl.segs.forEach(s=> put(hl.unit, fl.fleet, s)));
  });
  (f.standby||[]).forEach(s=> put(s.unit, null, {s:s.s, dur:s.dur}));
  // [SUPPORT] Reuse put() apa adanya — sama seperti Production/Standby: status!=='I' → unit_status_actual
  // (fleet_code:null, sama seperti Standby/BD unit tanpa fleet), status==='I' → idle_events scope UNIT
  // (via seg.code = idle_code, opsi A1, TIDAK menyentuh constraint unit_status_actual.status).
  (f.support||[]).forEach(s=> put(s.unit, null, {s:s.s, dur:s.dur, code:s.code}, s.operator));
  return { unit_status_actual:st, delay_events:dl, idle_events:idl };
}
const diEq = (a,b)=> String(a ?? '') === String(b ?? '') || (a!=='' && b!=='' && a!=null && b!=null && !isNaN(a) && !isNaN(b) && Number(a)===Number(b));
function diPlan(h){
  const d = DI.db[h] || {prod:[], st:[], dl:[], idl:[]}, want = diProdRows(h);
  const keyOf = r=> [r.fleet_code, r.digger_unit_code||'', r.hauler_unit_code||'', r.material_code].join('|');
  const pool = new Map(); d.prod.forEach(r=>{ const k = keyOf(r); if(!pool.has(k)) pool.set(k,[]); pool.get(k).push(r); });
  const plan = { h, prodIns:[], prodUpd:[], prodDel:[], same:0, ev:{}, skipped:[] };
  want.forEach(w=>{
    const ex = (pool.get(keyOf(w))||[]).shift();
    if(!ex){ plan.prodIns.push(w); return; }
    const same = ['ritase','payload','operator_code','driver_code','location_code','distance_km'].every(c=> diEq(ex[c], w[c]));
    same ? plan.same++ : plan.prodUpd.push({ id:ex.actual_id, payload:w });
  });
  pool.forEach(a=> a.forEach(r=> plan.prodDel.push(r.actual_id)));   // baris jam ini yang sudah tidak ada di form
  const ev = diEventRows(h), old = { unit_status_actual:d.st, delay_events:d.dl, idle_events:d.idl };
  Object.keys(ev).forEach(t=>{
    if(DI.caps[t]) plan.ev[t] = { ins:ev[t], del:old[t].map(x=>x[DI_EVENT_PK[t]]) };
    else if(ev[t].length) plan.skipped.push(t);
  });
  return plan;
}

/* ---------- SIMPAN: validasi → review → commit (OfflineEngine) ---------- */
// [AUDIT FIX 2026-09 P0-1] Guard anti double-submit: diPlan(h) dihitung dari state lokal (DI.db) yang
// baru diperbarui SETELAH diCommit() selesai (lihat diLoadShift di dalam diCommit). Kalau diSave()
// terpanggil dua kali sebelum commit pertama selesai (mis. modal Review sempat tampil dua kali lewat
// klik/Enter yang sangat cepat), diPlan(h) kedua akan menghitung ulang prodIns/ev.ins yang SAMA PERSIS
// dengan yang pertama (karena DI.db[h] belum berubah) -> commit kedua akan INSERT baris duplikat ke
// production_actual/unit_status_actual/delay_events/idle_events. DI.committing mengunci per-jam selama
// proses plan->review->commit berlangsung; tidak mengubah alur normal (satu save per jam tetap sama).
async function diSave(){
  if(!diSaveGuard()) return;   // [HARDENING] data belum 100% / gagal / bukan tanggal-shift aktif -> tolak
  const h = DI.hour, issues = diValidate(h);
  if(DI.pend.has(h)){ showToast('Jam ini masih menunggu sinkronisasi offline. Edit setelah data tersinkron.', 'error'); return; }
  if(DI.committing && DI.committing.has(h)){ showToast('Jam ini sedang diproses, tunggu sebentar.', 'error'); return; }
  if(issues.some(i=>i.l==='err')){ showToast('Masih ada input yang belum valid. Periksa daftar di atas.', 'error'); return; }
  // [HARDENING] Regression guard: plan dihitung SEKALI lalu dipakai ulang oleh dialog review.
  const plan = diPlan(h), rg = diRegressionGuard(h, plan);
  if(rg.block.length){
    console.warn('[Mineboard][DailyInput] SAVE DIBLOK regression guard:', rg.block);
    showToast('Simpan diblokir: ' + rg.block[0] + (rg.block.length>1 ? ` (+${rg.block.length-1} lainnya)` : ''), 'error');
    return;
  }
  if(rg.warn.length){ console.warn('[Mineboard][DailyInput] peringatan regression guard:', rg.warn); showToast('⚠️ ' + rg.warn[0] + (rg.warn.length>1 ? ` (+${rg.warn.length-1} peringatan lain)` : ''), 'info'); }
  if(!DI.committing) DI.committing = new Set();
  DI.committing.add(h); diSyncSaveButtons();
  try{ diOpenReview(plan, issues.filter(i=>i.l==='warn').length + rg.warn.length); }
  catch(e){ DI.committing.delete(h); diSyncSaveButtons(); throw e; }   /* jika sukses: dilepas di diCommit() atau saat user Batal (diOpenReview) */
}
function diOpenReview(plan, warns){
  const f = DI.forms[plan.h], t = diTotals(f), id = 'diReview_'+Date.now();
  const n = x=> x ? x.ins.length : null;
  const rows = [
    ['Tanggal / Shift / Jam', `${esc(DI.date)} · ${esc(diLookupLabel('shift', DI.shift))} · ${esc(diHourLabel(plan.h))}`],
    ['Ritase / Volume', `${U.fmtExact(t.rit,0)} rit · ${U.fmtExact(t.vol,1)} vol`],
    ['production_actual', `+${plan.prodIns.length} baru · ~${plan.prodUpd.length} ubah · −${plan.prodDel.length} hapus · ${plan.same} tetap`],
    ...Object.keys({unit_status_actual:1, delay_events:1, idle_events:1}).map(tb=>
      [tb, plan.ev[tb] ? `${n(plan.ev[tb])} baris (mengganti ${plan.ev[tb].del.length} baris jam ini)` : (plan.skipped.includes(tb) ? '<span style="color:var(--warning)">TIDAK DITULIS — kolom hour_label belum ada</span>' : '—')])
  ];
  const editing = plan.prodUpd.length || plan.prodDel.length || Object.values(plan.ev).some(e=>e.del.length);
  const legacy = plan.ev.unit_status_actual && DI.legacy ? `<div class="di-alert warn mt-3">⚠️ Shift ini sudah punya ${DI.legacy} baris status level-shift (tanpa jam). Menyimpan status per jam dapat membuat PA/UA terhitung ganda di dashboard.</div>` : '';
  const html = `<div class="adm-modal-overlay" id="${id}"><div class="adm-modal">
    <div class="panel-title mb-1">Review Jam ${esc(diHourLabel(plan.h))}</div>
    <div class="text-xs mb-3" style="color:var(--text-dim)">${editing ? 'Jam ini sudah pernah tersimpan — baris jam ini akan diperbarui (jam lain tidak disentuh).' : 'Periksa ringkasan sebelum disimpan ke Supabase.'}${warns?` ${warns} peringatan aktif.`:''}</div>
    <div class="di-preview-grid">${rows.map(([k,v])=>`<div class="di-preview-row"><span>${esc(k)}</span><b>${v}</b></div>`).join('')}</div>${legacy}
    <div class="flex justify-end gap-2 mt-4"><button class="btn" id="${id}_cancel">Batal</button>
    <button class="btn btn-accent" id="${id}_ok">✅ Simpan</button></div></div></div>`;
  document.getElementById('admModalRoot').insertAdjacentHTML('beforeend', html);
  // [AUDIT FIX 2026-09 P0-1] Batal juga harus melepas kunci DI.committing (h), bukan hanya jalur Simpan —
  // kalau tidak, jam yang dibatalkan reviewnya akan terkunci permanen dan tidak bisa di-Simpan lagi.
  document.getElementById(id+'_cancel').onclick = ()=>{ closeAdminModal(id); if(DI.committing) DI.committing.delete(plan.h); diSyncSaveButtons(); };
  document.getElementById(id+'_ok').onclick = async ()=>{ closeAdminModal(id); await diCommit(plan); };
}
async function diCommit(plan){
  { const blk = diSaveBlockReason(); if(blk){ if(DI.committing) DI.committing.delete(plan.h); diSyncSaveButtons(); showToast(blk, 'error'); return; } }
  let queued = false;
  const run = async p=>{ const { error, queued:q } = await p; if(error) throw new Error(error.message || String(error)); if(q) queued = true; };
  showToast('Menyimpan jam '+diHourLabel(plan.h)+'...', 'info');
  try{
    // urutan aman: tambah baru → ubah → hapus lama (kegagalan tengah jalan tidak menghilangkan data lama)
    if(plan.prodIns.length) await run(OfflineEngine.bulkInsert('production_actual', plan.prodIns));
    for(const u of plan.prodUpd) await run(OfflineEngine.update('production_actual', u.payload, 'actual_id', u.id));
    for(const [t, e] of Object.entries(plan.ev)) if(e.ins.length) await run(OfflineEngine.bulkInsert(t, e.ins));
    for(const [t, e] of Object.entries(plan.ev)) if(e.del.length) await run(OfflineEngine.bulkDelete(t, DI_EVENT_PK[t], e.del));
    if(plan.prodDel.length) await run(OfflineEngine.bulkDelete('production_actual', 'actual_id', plan.prodDel));
  }catch(err){
    console.error('[DailyInput] gagal simpan', err);
    showToast('Gagal menyimpan: '+err.message+'. Muat ulang jam untuk memeriksa kondisi data.', 'error');
    if(DI.committing) DI.committing.delete(plan.h);   // [AUDIT FIX 2026-09 P0-1] lepas kunci supaya user bisa coba Simpan lagi
    diSyncSaveButtons();
    return;   // form tetap di layar, dirty tetap
  }
  if(DI.committing) DI.committing.delete(plan.h);   // [AUDIT FIX 2026-09 P0-1] commit sukses (atau ter-queue offline) — lepas kunci
  diSyncSaveButtons();
  DI.dirty.delete(plan.h);
  const hs = diHours(), next = hs[hs.indexOf(plan.h)+1];
  if(queued){
    DI.pend.add(plan.h);
    showToast('📥 Disimpan offline — masuk antrian Pending Sync dan otomatis terkirim saat online.', 'info');
    next!=null ? diSelectHour(next) : diPaint();
    return;
  }
  /* [DI PERF 2026-09] SEBELUMNYA: setelah SAVE, UI menunggu (`await`) diLoadShift() SELESAI —
     yaitu re-fetch penuh production_actual/unit_status_actual/delay_events/idle_events dari
     Supabase — sebelum pindah ke jam berikutnya. Ini membuat "Simpan & Lanjut" terasa lambat
     walau data yang baru saja ditulis sudah pasti benar (baru saja berhasil di-commit oleh
     diCommit() persis di atas). Sekarang: pindah jam DULU (instan, pakai data lokal yang sudah
     valid), verifikasi/reconciliation ke Supabase (utamanya untuk menangkap actual_id/status_id
     baru dari INSERT, dan indikator "Tersimpan di Supabase") tetap dijalankan tapi TIDAK
     memblokir navigasi — jalan di background lewat diLoadShift(..., {silent:true}). Data lokal
     tidak pernah dianggap final berbeda dari Supabase: begitu background load selesai (dijaga
     token anti-race DI._tok yang sudah ada), state di-sinkronkan ulang; jam yang MASIH dirty
     (sedang diedit user) tetap tidak ditimpa (lihat `keep` & pengecekan DI.dirty di diLoadShift/
     diFromDb). Kalau reconciliation gagal (mis. baru offline), pindah jam yang sudah terjadi
     tidak dibatalkan — toast error tetap muncul supaya user tahu perlu refresh manual. */
  next!=null ? diSelectHour(next) : diPaintBody();
  showToast(next!=null ? `✅ Jam ${diHourLabel(plan.h)} tersimpan. Lanjut ke ${diHourLabel(next)}.` : '🎉 Semua jam shift ini sudah diproses.', 'success');
  diLoadShift(next != null ? next : plan.h, ['roster','sb','wx','fuel','hm'], {silent:true})
    .catch(err=>{ console.error('[DailyInput] reconciliation gagal', err); showToast('⚠️ Verifikasi ke Supabase gagal, coba refresh jam ini.', 'error'); });
}

/* ---------- CUACA — EVENT BASED (final prompt §7-§13) ----------
   Ganti dari "3 angka jam agregat/shift" menjadi event list: Type + Start + End + Rainfall(mm, khusus
   Rain), multi-event per shift diperbolehkan. Disimpan tetap ke idle_events (scope GLOBAL, idle_code
   I01/I02/I03) — TIDAK ada tabel baru — memakai kolom start_time/end_time/rainfall_mm (additive migration
   2026-09). weather_daily tetap diturunkan otomatis dari SUM(duration_hours) seperti sebelumnya
   (diRecomputeWeatherDaily, TIDAK diubah) — durasi per event dihitung dari Start-End (diWeatherSlots'
   basis, reuse diSbDurHours). Slot/equipment yang terdampak dipetakan otomatis (read-only, derived,
   TIDAK butuh input Idle manual per unit — final prompt §8/§9/§18) dan ditampilkan di bawah tiap event. */
function diAddWxEvent(){ DI.wxEvents.push({id:null, code:'I01', start:'', end:'', rainfall_mm:'', hours:0}); diPaint(); }
function diDelWxEvent(i){ const e = DI.wxEvents[i]; if(e.id!=null) DI.wxDeleted.push(e.id); DI.wxEvents.splice(i,1); diApplyWeatherAutoAll(); diPaint(); }
function diSetWxEvent(i, field, val, redraw){ DI.wxEvents[i][field] = val; if(field==='start'||field==='end'||field==='code') diApplyWeatherAutoAll(); redraw ? diPaint() : diMeta(); }
function diSaveWxEvents(){ return diGuardedSave('wx', diSaveWxEvents_impl); }
async function diSaveWxEvents_impl(){
  // Validasi dasar
  for(const [i,e] of DI.wxEvents.entries()){
    if(!e.code){ showToast(`Event #${i+1}: Weather Type belum dipilih.`, 'error'); return; }
    if(!e.start || !e.end){ showToast(`Event #${i+1}: Start/End time wajib diisi.`, 'error'); return; }
    if(e.rainfall_mm !== '' && diN(e.rainfall_mm) < 0){ showToast(`Event #${i+1}: Rainfall tidak boleh negatif.`, 'error'); return; }
  }
  // [VALIDASI URUTAN CUACA 2026-09] Slippery (I02) TIDAK BOLEH mulai sebelum ada Rain (I01) yang sudah
  // mulai lebih dulu/bersamaan (logika: jalan jadi licin karena hujan, jadi hujan harus lebih dulu).
  const toMin = t=>{ if(!t) return null; const [h,m]=t.split(':').map(Number); return h*60+m; };
  const rainStarts = DI.wxEvents.filter(e=>e.code==='I01' && e.start).map(e=>toMin(e.start));
  for(const [i,e] of DI.wxEvents.entries()){
    if(e.code!=='I02' || !e.start) continue;
    const slipStart = toMin(e.start);
    const hasRainBeforeOrSame = rainStarts.some(rs=> rs<=slipStart);
    if(!hasRainBeforeOrSame){
      showToast(`Event #${i+1} (Slippery): belum ada event Rain (I01) yang mulai sebelum/bersamaan jam ${e.start}. Tambahkan/urutkan event Rain dulu — licin terjadi setelah hujan, bukan sebaliknya.`, 'error');
      return;    }
  }
  // Peringatan (bukan blok) kalau ada 2 event kode SAMA yang overlap jam -> berpotensi double count di weather_daily.rain_hours dkk.
  const byCode = {}; DI.wxEvents.forEach((e,i)=>{ (byCode[e.code]=byCode[e.code]||[]).push(i); });
  for(const idxs of Object.values(byCode)){
    for(let a=0;a<idxs.length;a++) for(let b=a+1;b<idxs.length;b++){
      const e1=DI.wxEvents[idxs[a]], e2=DI.wxEvents[idxs[b]];
      const s1=new Set(diWeatherSlots(e1.start,e1.end)), overlap=diWeatherSlots(e2.start,e2.end).some(h=>s1.has(h));
      if(overlap) showToast(`ℹ️ Event #${idxs[a]+1} dan #${idxs[b]+1} (kode sama) overlap jam — weather_daily akan otomatis menghitung union durasi (tidak double-count).`, 'info');
    }
  }
  let queued = false;
  try{
    for(const id of DI.wxDeleted){ const r = await OfflineEngine.delete('idle_events', 'idle_event_id', id); if(r && r.error) throw new Error(r.error.message||String(r.error)); if(r && r.queued) queued = true; }
    for(const e of DI.wxEvents){
      const hrs = diSbDurHours(e.start, e.end);
      const payload = { start_time:e.start, end_time:e.end, duration_hours:hrs, rainfall_mm: e.rainfall_mm==='' ? null : diN(e.rainfall_mm) };
      let r = null;
      if(e.id!=null) r = await OfflineEngine.update('idle_events', payload, 'idle_event_id', e.id);
      else r = await OfflineEngine.insert('idle_events', { event_date:DI.date, shift_code:DI.shift, scope:'GLOBAL', fleet_code:null, unit_code:null, idle_code:e.code, ...payload });
      if(r && r.error) throw new Error(r.error.message || String(r.error));
      if(r && r.queued) queued = true;
    }
    if(!queued) await diRecomputeWeatherDaily(DI.date);
    showToast(queued ? '📥 Cuaca disimpan offline (Pending Sync).' : '✅ Cuaca tersimpan.', queued ? 'info' : 'success');
    if(!queued) await diLoadShift(undefined, ['roster','sb','fuel','hm']);   /* [DI PERF] jangan buang edit belum-tersimpan di tab lain */
  }catch(err){ showToast('Gagal menyimpan cuaca: '+err.message, 'error'); }
}
/* [FIX 2026-11 — WEATHER_DAILY UNION-OVERLAP] weather_daily TIDAK diisi manual: selalu diturunkan dari
   idle_events GLOBAL (dipertahankan dari versi lama). ROOT CAUSE bug lama: diRecomputeWeatherDaily hanya
   men-SUM duration_hours tiap baris idle_code yang sama secara naif. Kalau ada 2 event kode sama yang
   overlap jam (mis. Rain 08:00–09:00 + Rain 08:30–10:00 — kasus yang sebelumnya cuma di-WARNING di
   diSaveWxEvents, tidak pernah benar2 diperbaiki di titik hitungnya), hasilnya 1 + 1.5 = 2.5 jam padahal
   durasi riil cuaca cuma 2 jam (08:00–10:00). Fix: hitung UNION interval per idle_code dari start_time/
   end_time (bukan sum duration_hours per baris), baru total durasi union itu yang dipakai sebagai
   rain_hours/slippery_hours/fog_hours — union interval per kode cuaca yang sama jadi SATU SOURCE OF
   TRUTH durasi (sinkron dengan diWeatherSlots/diWeatherOverlapMinutes yang juga overlap-based). Boleh
   lintas tengah malam (end<=start -> +24j), sama seperti pola diWeatherSlots/diSbDurHours. */
function diUnionHours(rows){
  // rows: [{start_time,end_time}] utk SATU idle_code. Return total jam dari union interval (menit/60).
  const ivs = rows.filter(r=>r.start_time && r.end_time).map(r=>{
    const [sh,sm]=r.start_time.split(':').map(Number), [eh,em]=r.end_time.split(':').map(Number);
    let s=sh*60+sm, e=eh*60+em; if(e<=s) e+=24*60;
    return [s,e];
  }).sort((a,b)=>a[0]-b[0]);
  let mins = 0, curS=null, curE=null;
  ivs.forEach(([s,e])=>{
    if(curS===null){ curS=s; curE=e; return; }
    if(s<=curE){ curE=Math.max(curE,e); }               // overlap/berhimpit -> gabung
    else{ mins += (curE-curS); curS=s; curE=e; }         // terpisah -> tutup interval sebelumnya
  });
  if(curS!==null) mins += (curE-curS);
  return Math.round((mins/60)*100)/100;
}
async function diRecomputeWeatherDaily(dateStr){
  try{
    const { data, error } = await sb.from('idle_events').select('idle_code,duration_hours,start_time,end_time')
      .eq('event_date', dateStr).eq('scope', 'GLOBAL').in('idle_code', ['I01','I02','I03']);
    if(error) throw error;
    // Fallback ke sum(duration_hours) HANYA kalau start_time/end_time tidak ada sama sekali utk kode itu
    // (data legacy) — union interval selalu diprioritaskan begitu jam tersedia, supaya tidak ada 2 cara
    // hitung yang saling bertentangan utk data yang sama.
    const hoursFor = code=>{
      const rows = (data||[]).filter(x=>x.idle_code===code);
      if(!rows.length) return 0;
      const withTime = rows.filter(r=>r.start_time && r.end_time);
      if(withTime.length === rows.length) return diUnionHours(rows);
      console.warn(`[DailyInput] weather_daily ${code}: ada baris idle_events tanpa start_time/end_time (data legacy), fallback ke sum(duration_hours) — bisa overlap-double-count utk baris ini.`);
      return rows.reduce((a,x)=>a+Number(x.duration_hours||0),0);
    };
    const rain = hoursFor('I01'), slippery = hoursFor('I02'), fog = hoursFor('I03'), mx = Math.max(rain, slippery, fog);
    const condition = mx > 0 ? (rain===mx ? 'Rain' : (slippery===mx ? 'Slippery' : 'Fog')) : 'Clear';
    const payload = { weather_date: dateStr, condition, rain_hours: rain, slippery_hours: slippery, fog_hours: fog };
    const { data: existing } = await sb.from('weather_daily').select('weather_date').eq('weather_date', dateStr).limit(1);
    if(existing && existing.length) await OfflineEngine.update('weather_daily', payload, 'weather_date', dateStr);
    else await OfflineEngine.insert('weather_daily', payload);
  }catch(e){ console.warn('[DailyInput] Gagal recompute weather_daily:', e); }
}

/* ---------- HM: HELPER — Jam Operasi diambil dari total status "Working" unit ini SE-SHIFT INI (TIDAK dibuat baru).
   Sengaja dihitung dari DI.stAll (baris mentah unit_status_actual utk shift ini), BUKAN dari DI.db.
   DI.db hanya memuat baris yang punya hour_label (dipakai tab "Jam" per-jam); hampir semua data historis
   (import lama, termasuk yang jadi basis backfill HM Jan-Des) TIDAK punya hour_label, jadi kalau dihitung
   dari DI.db, unit yang jelas-jelas bekerja bisa kebaca 0 jam. Total shift = sama seperti formula backfill SQL. */
function diUnitWorkingHours(unit){
  let hrs = 0;
  (DI.stAll || []).forEach(r=>{ if(r.unit_code===unit && r.status==='Working') hrs += Number(r.duration_hours)||0; });
  return Math.round(hrs*100)/100;
}
/* ---------- HM: cari hm_end shift/hari SEBELUMNYA untuk unit yang sama (bukan unit lain, bukan tanggal/shift tidak relevan).
   Di-scope ke unitCodes (unit yang bekerja shift ini) supaya rantai historis tetap ketemu walau
   histori unit itu jauh ke belakang (mis. sampai Januari) — tidak dibatasi "500 baris terbaru global"
   yang bisa kelewat kalau unit itu jarang dipakai sementara unit lain sering.
   Shift hanya D/N (lihat master_shifts) dan urutan alfabet D<N kebetulan = urutan kronologis dalam satu hari,
   jadi order by actual_date desc, shift_code desc lalu ambil baris pertama SEBELUM (date,shift) aktif per unit. */
async function diFetchPrevHm(unitCodes){
  if(!unitCodes || !unitCodes.length) return {};
  const date = DI.date, rank = s=> s==='D' ? 0 : 1, curRank = rank(DI.shift);
  let rows = [];
  try{
    if(OfflineEngine.isOffline()){
      rows = ((await OfflineEngine.getCachedTable('unit_hm_actual')) || []).filter(r=> unitCodes.includes(r.unit_code) && r.actual_date <= date);
      rows.sort((a,b)=> a.actual_date===b.actual_date ? rank(b.shift_code)-rank(a.shift_code) : (a.actual_date<b.actual_date?1:-1));
    } else {
      const { data, error } = await sb.from('unit_hm_actual').select('unit_code,actual_date,shift_code,hm_end')
        .in('unit_code', unitCodes).lte('actual_date', date)
        .order('actual_date', {ascending:false}).order('shift_code', {ascending:false}).limit(2000);
      if(error) throw error;
      rows = data || [];
    }
  }catch(e){ console.warn('[DailyInput] Gagal ambil HM sebelumnya:', e); return {}; }
  const before = r=> (r.actual_date < date) || (r.actual_date === date && rank(r.shift_code) < curRank);
  const out = {};
  rows.filter(before).forEach(r=>{ if(!(r.unit_code in out)) out[r.unit_code] = Number(r.hm_end); });
  return out;
}
function diSetHm(unit, field, val){ DI.hm[unit] = DI.hm[unit] || {}; DI.hm[unit][field] = val; diPaintBody(); }
/* HM Awal terpakai: input manual jam ini > baris tersimpan shift ini > rekomendasi dari shift sebelumnya > kosong (Initial HM, unit baru).
   HM Akhir terpakai: input manual jam ini > baris tersimpan shift ini > expected (awal+jam). Semua bisa dikoreksi manual (human error tidak diblokir).
   Hanya dipanggil untuk unit yang BEKERJA (jam>0) — lihat diWorkingUnits(). */
function diHmValues(unit){
  const ex = DI.hmDb[unit], prev = DI.hmPrev[unit], jam = diUnitWorkingHours(unit), st = DI.hm[unit] || {};
  const isInitial = !ex && prev == null;   // tidak ada histori sama sekali → titik awal (Initial HM) harus diisi manual
  const awal = st.awal !== undefined ? st.awal : (ex ? String(ex.hm_start) : (prev != null ? String(prev) : ''));
  const expected = awal === '' ? null : Math.round((diN(awal) + jam) * 100) / 100;
  const akhir = st.akhir !== undefined ? st.akhir : (ex ? String(ex.hm_end) : (expected != null ? String(expected) : ''));
  return { ex, prev, jam, awal, expected, akhir, isInitial };
}
/* Unit yang BEKERJA di shift ini = punya jam operasi (status Working) > 0. HM hanya pernah dibuat/ditampilkan
   sebagai form editable untuk unit-unit ini — unit yang tidak bekerja TIDAK PERNAH dibuatkan baris HM. */
function diWorkingUnits(){ return diOptHmUnits().filter(u=> diUnitWorkingHours(u.value) > 0); }
/* [UI 2026-09 COMPACT] Baris HM ringkas — HANYA dipanggil untuk unit Working (lihat diWorkingUnits()
   di pemanggilnya). Tidak ada perubahan pada diHmValues/diSaveHm — murni tampilan. Warning digabung
   jadi satu baris kecil (bukan alert box besar) supaya operator bisa lihat banyak unit sekaligus. */
function diHmRow(unit){
  const { prev, jam, awal, expected, akhir, isInitial } = diHmValues(unit);
  const warnAwal = (prev != null && awal !== '' && Math.abs(diN(awal) - prev) > 0.01)
    ? `HM awal ≠ HM akhir sebelumnya (exp. ${U.fmtExact(prev,2)})` : '';
  const warnAkhir = (awal !== '' && akhir !== '' && expected != null && Math.abs(diN(akhir) - expected) > 0.01)
    ? `HM akhir ≠ Awal + Jam Operasi (exp. ${U.fmtExact(expected,2)})` : '';
  const warn = warnAwal || warnAkhir || '';
  const needInit = isInitial && awal === '';
  return `<div class="di-hm2-row${needInit ? ' need' : ''}">
    <div class="di-hm2-name"><b>${esc(unit)}</b><span class="di-hm2-jam">${U.fmtExact(jam,1)}h</span></div>
    <input class="adm-input di-hm2-in" type="number" step="any" inputmode="decimal" placeholder="${isInitial ? 'Initial*' : 'HM Awal'}" value="${esc(awal)}" oninput="diSetHm('${esc(unit)}','awal',this.value)">
    <span class="di-hm2-arrow">→</span>
    <input class="adm-input di-hm2-in" type="number" step="any" inputmode="decimal" placeholder="HM Akhir" value="${esc(akhir)}" oninput="diSetHm('${esc(unit)}','akhir',this.value)">
    ${warn ? `<span class="di-hm2-warn" title="${esc(warn)}">⚠️ ${esc(warn)}</span>` : (needInit ? `<span class="di-hm2-warn" title="Belum ada histori — isi Initial HM">ℹ️ Initial HM</span>` : '<span></span>')}
  </div>`;
}
/* ---------- HM: simpan ke unit_hm_actual. HANYA unit yang bekerja (jam>0) yang boleh punya baris;
   HM Awal + HM Akhir SELALU disimpan berpasangan (kolom NOT NULL di Supabase, tidak bisa setengah).
   Grain shift (actual_date+shift_code+unit_code), sama seperti fuel_actual.
   Selisih dari expected HANYA warning (lihat diHmRow) — tidak pernah memblokir Save di sini. */
function diSaveHm(){ return diGuardedSave('hm', diSaveHm_impl); }
async function diSaveHm_impl(){
  let queued = false, touched = 0; const missing = [];
  try{
    for(const u of diWorkingUnits()){
      const code = u.value, { ex, jam, awal, akhir } = diHmValues(code);
      if(awal === '' || awal == null){ missing.push(code); continue; }   // Initial HM belum diisi → jangan bikin HM palsu
      const payload = { hm_start:diN(awal), hm_end:diN(akhir), operating_hours:jam, hour_label:diHourLabel(DI.hour), data_source:'DAILY_INPUT_ACTUAL' };
      let r = null;
      if(ex) r = await OfflineEngine.update('unit_hm_actual', payload, 'hm_id', ex.hm_id);
      else r = await OfflineEngine.insert('unit_hm_actual', { actual_date:DI.date, shift_code:DI.shift, unit_code:code, ...payload });
      if(r){ touched++; if(r.error) throw new Error(r.error.message || String(r.error)); if(r.queued) queued = true; }
    }
    if(!touched && !missing.length){ showToast('Belum ada unit yang tercatat bekerja di jam ini (isi status di tab Jam dulu).', 'info'); return; }
    const missTxt = missing.length ? ` ⚠️ Unit bekerja tapi Initial HM belum diisi: ${missing.join(', ')}.` : '';
    if(touched) showToast((queued ? '📥 HM disimpan offline — masuk Pending Sync.' : '✅ HM tersimpan ke Supabase (unit_hm_actual).') + missTxt, queued ? 'info' : 'success');
    else showToast(missTxt.trim(), 'info');
    if(!queued && touched) await diLoadShift(undefined, ['roster','sb','wx','fuel']);
  }catch(err){ showToast('Gagal menyimpan HM: '+err.message, 'error'); }
}

/* ---------- FUEL: simpan ke fuel_actual, grain shift (tanggal+shift+unit) — BUKAN per jam.
   Tidak pernah membagi total menjadi angka hourly rekaan; satu unit = satu baris per shift,
   sama seperti grain asli fuel_actual (lihat UNIQUE fuel_date+shift_code+unit_code).
   Tampilan operator hanya Unit + Fuel (Jam Operasi & data_source tidak ditampilkan, lihat diPaintBody).
   Baris existing (mis. RECONSTRUCTED_ACTUAL) di-UPDATE via fuel_id, tidak pernah di-duplicate;
   dikosongkan → baris dihapus. Baru & terisi → INSERT dengan data_source SOURCE_CONFIRMED.
   operating_hours milik baris lama TIDAK disentuh (field itu tidak lagi diisi dari Daily Input). */
function diSaveFuel(){ return diGuardedSave('fuel', diSaveFuel_impl); }
async function diSaveFuel_impl(){
  let queued = false, touched = 0;
  try{
    for(const u of diOptUnits()){
      const code = u.value, v = DI.fuel[code] || {}, liters = diN(v.liter);
      const ex = DI.fuelDb[code];
      if(!ex && liters <= 0) continue;   // kosong & belum pernah ada → tidak ada aksi
      let r = null;
      if(ex && liters > 0){
        r = await OfflineEngine.update('fuel_actual', { fuel_liters:liters, data_source:'SOURCE_CONFIRMED' }, 'fuel_id', ex.fuel_id);
      } else if(ex && liters <= 0){
        r = await OfflineEngine.delete('fuel_actual', 'fuel_id', ex.fuel_id);
      } else if(liters > 0){
        r = await OfflineEngine.insert('fuel_actual', { fuel_date:DI.date, shift_code:DI.shift, unit_code:code, fleet_code:null, fuel_liters:liters, data_source:'SOURCE_CONFIRMED' });
      }
      if(r){ touched++; if(r.error) throw new Error(r.error.message || String(r.error)); if(r.queued) queued = true; }
    }
    if(!touched){ showToast('Tidak ada perubahan Fuel untuk disimpan.', 'info'); return; }
    showToast(queued ? '📥 Fuel disimpan offline — masuk Pending Sync.' : '✅ Fuel tersimpan ke Supabase (fuel_actual).', queued ? 'info' : 'success');
    if(!queued) await diLoadShift(undefined, ['roster','sb','wx','hm']);
  }catch(err){ showToast('Gagal menyimpan Fuel: '+err.message, 'error'); }
}

/* ---------- LOCK ASSIGNMENT PER JAM (operator & unit) ----------
   Selalu diturunkan dari form JAM AKTIF (diForm) setiap render → tidak ada state lock yang disimpan,
   jadi otomatis per jam, terlepas saat assignment diubah/dihapus, dan tidak terbawa ke jam lain.
   `self` = path slot yang sedang dirender (mis. 'fleets.0.operator') → slot tidak mengunci dirinya sendiri. */
const diFleetName = (fl, i)=> fl.fleet ? diLookupLabel('fleet', fl.fleet) : `Fleet #${i+1}`;
// [OPERATOR LOCK 2026-09] Extended untuk mencakup Support (final prompt §4/§8) — dipanggil dari DUA
// arah: dropdown Operator Production memanggil ini untuk mengunci operator yang sudah dipakai Support
// jam ini, dan dropdown Operator Support (diSupportRowCard) memanggil fungsi YANG SAMA supaya operator
// yang sudah dipakai Production ikut terkunci di sana. Satu sumber logic (tidak ada jalur kedua),
// sesuai instruksi "jangan merusak logic existing" — pola scan Map identik dengan sebelumnya, hanya
// ditambah satu forEach untuk f.support.
function diLockedOperators(self){
  const f = diForm(), out = {}; if(!f) return out;
  f.fleets.forEach((fl,i)=>{ if(fl.operator && `fleets.${i}.operator`!==self && !out[fl.operator]) out[fl.operator] = `Dipakai ${diFleetName(fl,i)}`; });
  (f.support||[]).forEach((s,i)=>{ if(s.operator && `support.${i}.operator`!==self && !out[s.operator]) out[s.operator] = `Dipakai Support #${i+1}${s.unit?' '+s.unit:''}`; });
  return out;
}
function diLockedDrivers(self){
  const f = diForm(), out = {}; if(!f) return out;
  f.fleets.forEach((fl,i)=> fl.haulers.forEach((hl,j)=>{ if(hl.driver && `fleets.${i}.haulers.${j}.driver`!==self && !out[hl.driver]) out[hl.driver] = `Dipakai ${diFleetName(fl,i)} · Hauler ${j+1}`; }));
  return out;
}
function diLockedUnits(self){
  const f = diForm(), out = {}; if(!f) return out;
  const add = (path, u, why)=>{ if(u && path!==self && !out[u]) out[u] = why; };
  (f.standby||[]).forEach((s,i)=> add(`standby.${i}.unit`, s.unit, s.s==='BD' ? 'BD' : 'Standby'));
  f.fleets.forEach((fl,i)=>{ const n = diFleetName(fl,i);
    add(`fleets.${i}.digger`, fl.digger, `Dipakai ${n}`);
    fl.haulers.forEach((hl,j)=> add(`fleets.${i}.haulers.${j}.unit`, hl.unit, `Dipakai ${n}`)); });
  // [SUPPORT] Sama seperti standby/fleet di atas — unit yang sudah dipakai Support jam ini otomatis
  // terkunci di dropdown lain (dan sebaliknya, lihat diLockedSupportUnits), pelengkap useUnit() di diValidate.
  (f.support||[]).forEach((s,i)=> add(`support.${i}.unit`, s.unit, `Support (${DI_ST[s.s]||s.s})`));
  return out;
}
// [FLEET AVAILABILITY 2026-09] final prompt §14-17 — "+ Tambah Fleet" hanya boleh aktif jika masih ada
// unit Production (Digger/Hauler) aktif yang BELUM ter-assign pada DATE+SHIFT ini. "Ter-assign" dihitung
// dari diLockedUnits() (union Fleet + Standby/BD + Support) — SAMA PERSIS dengan set yang sudah mengunci
// dropdown, supaya konsisten dengan §17: status operasional (BD/Standby/Idle/No Operator) TIDAK membuat
// unit otomatis "available" untuk Fleet baru — hanya assignment state (masih dipakai di modul lain jam
// ini) yang menentukan. Tidak berdasarkan jumlah Fleet, murni jumlah unit aktif yang belum dipakai.
function diUnassignedProdUnits(){
  const locked = diLockedUnits(null); // self=null -> tidak ada slot yang dikecualikan, hitung semua terkunci
  return diOptUnits().filter(o=> !locked[o.value]);
}
function diLockedSupportUnits(self){
  const f = diForm(), out = {}; if(!f) return out;
  const add = (path, u, why)=>{ if(u && path!==self && !out[u]) out[u] = why; };
  (f.standby||[]).forEach((s,i)=> add(`standby.${i}.unit`, s.unit, s.s==='BD' ? 'BD' : 'Standby'));
  f.fleets.forEach((fl,i)=>{ const n = diFleetName(fl,i);
    add(`fleets.${i}.digger`, fl.digger, `Production ${n}`);
    fl.haulers.forEach((hl,j)=> add(`fleets.${i}.haulers.${j}.unit`, hl.unit, `Production ${n}`)); });
  (f.support||[]).forEach((s,i)=> add(`support.${i}.unit`, s.unit, `Support (${DI_ST[s.s]||s.s})`));
  return out;
}

/* ---------- RENDER ---------- */
function diSelect(path, opts, val, ph='— Pilih —', redraw=true, locked=null){
  return `<select class="adm-select" onchange="diSet('${path}',this.value,${redraw})"><option value="">${ph}</option>${
    opts.map(o=>{ const why = locked && locked[o.value], sel = String(o.value)===String(val);
      /* opsi terkunci = disabled; kecuali nilai yang sedang terpilih di slot ini (tidak mengunci diri sendiri / konflik tetap terlihat & ditolak validasi) */
      return `<option value="${esc(o.value)}" ${sel?'selected':''} ${why && !sel ? 'disabled' : ''}>${esc(o.label)}${why ? ' 🔒 '+esc(why) : ''}</option>`; }).join('')}</select>`;
}
/* [UI 2026-09] Smart Picker (searchable autocomplete) — drop-in pengganti diSelect() untuk field
   Fleet/Digger/Hauler/Operator/Driver/Material/Location. Signature sama persis dengan diSelect(path,
   opts, val, ph, redraw, locked) supaya bisa dipakai langsung menggantikan pemanggilan diSelect tanpa
   mengubah value yang dikirim ke diSet()/state/payload — locked options tetap ditampilkan (🔒) dan
   TIDAK bisa dipilih, sama seperti opsi disabled di <select> lama. */
function diPicker(path, opts, val, ph='Cari...', redraw=true, locked=null){
  const cur = opts.find(o=>String(o.value)===String(val));
  const uid = 'pk'+Math.random().toString(36).slice(2,9);
  const data = opts.map(o=>({v:o.value, l:o.label, lock: (locked && locked[o.value]) ? locked[o.value] : null}));
  return `<div class="di-pick" data-path="${esc(path)}">
    <input class="adm-input di-pick-input" id="${uid}" type="text" value="${esc(cur?cur.label:'')}" placeholder="🔍 ${esc(ph)}"
      autocomplete="off" data-opts='${esc(JSON.stringify(data))}' data-redraw="${redraw}"
      oninput="diPickFilter('${uid}')" onfocus="diPickFilter('${uid}',true)" onblur="diPickBlur('${uid}')">
    <div class="di-pick-list" id="${uid}_l"></div>
  </div>`;
}
function diPickFilter(uid, all){
  const inp = document.getElementById(uid); if(!inp) return;
  let opts = []; try{ opts = JSON.parse(inp.dataset.opts||'[]'); }catch(e){ opts = []; }
  const q = all ? '' : inp.value.trim().toLowerCase();
  const items = opts.map((o,i)=>({...o,i})).filter(o=> !q || String(o.l||'').toLowerCase().includes(q) || String(o.v||'').toLowerCase().includes(q));
  diPickRender(uid, items);
}
function diPickRender(uid, items){
  const list = document.getElementById(uid+'_l'); if(!list) return;
  list.innerHTML = items.length ? items.map(o=>`<div class="di-pick-opt ${o.lock?'locked':''}" onmousedown="event.preventDefault();diPickChooseIdx('${uid}',${o.i})">${esc(o.l)}${o.lock?' 🔒 '+esc(o.lock):''}</div>`).join('') : '<div class="di-pick-empty">Tidak ditemukan</div>';
  list.style.display = 'block';
}
function diPickBlur(uid){ setTimeout(()=>{ const list = document.getElementById(uid+'_l'); if(list) list.style.display='none'; }, 150); }
function diPickChooseIdx(uid, idx){
  const inp = document.getElementById(uid); if(!inp) return;
  let opts = []; try{ opts = JSON.parse(inp.dataset.opts||'[]'); }catch(e){ opts = []; }
  const o = opts[idx]; if(!o || o.lock) return;
  inp.value = o.l;
  const list = document.getElementById(uid+'_l'); if(list) list.style.display = 'none';
  const path = inp.closest('.di-pick').dataset.path;
  diSet(path, o.v, inp.dataset.redraw==='true');
}
function diInput(path, val, ph='', attrs='min="0" step="any"'){
  return `<input class="adm-input" type="number" ${attrs} value="${val ?? ''}" placeholder="${ph}" oninput="diSet('${path}',this.value,false)">`;
}
/* [UI 2026-09] Stepper +/- kecil untuk field durasi menit (dur) — pengganti tampilan input angka
   polos di panel sekunder Support/Standby. Tetap memanggil diSet() yang sama, tidak ada field baru. */
function diStepper(path, val, step=5, min=1, max=60){
  const v = diN(val);
  return `<div class="di-stepper">
    <button type="button" class="di-step-btn" onclick="diStep('${path}',${-step},${min},${max})">−</button>
    <input class="adm-input" type="number" min="${min}" max="${max}" step="${step}" value="${v}" oninput="diSet('${path}',this.value,false)">
    <span class="di-mnt">mnt</span>
    <button type="button" class="di-step-btn" onclick="diStep('${path}',${step},${min},${max})">+</button>
  </div>`;
}
function diStep(path, delta, min, max){
  const f = diForm(); if(!f) return;
  const k = path.split('.'), last = k.pop(); let o = f; k.forEach(x=>{ o = o[x]; });
  const nv = Math.min(max, Math.max(min, diN(o[last]) + delta));
  diSet(path, nv, true);
}
function diSegRows(path, segs){
  // [UI 2026-11 FIX "Actual belum diisi"] segs KOSONG ([]) BUKAN error — ini state sah untuk jam Work
  // End (17-18 D / 05-06 N) yang belum ada aktivitas apa pun untuk unit ini (lihat diApplyBreakAuto).
  // Tampilkan label netral + tombol untuk mulai isi manual, JANGAN paksa Working/Delay/Idle/BD apa pun,
  // dan JANGAN tampilkan sebagai error durasi (lihat juga fix di diValidate/segCheck).
  if(!segs || !segs.length){
    const _weEmpty = (typeof diIsWorkEndHour==='function') && DI.hour!=null && diIsWorkEndHour(DI.hour);
    if(_weEmpty) return `<div class="di-alert" style="background:#3B82F622;border-color:#3B82F6;color:#1D4ED8">🕐 <b>Work End</b> — Shift selesai / unit selesai bekerja (normal, bukan loss; tidak perlu diisi).</div>
      <button class="di-add" onclick="diAdd('${path}','seg')">+ Isi Status (OT)</button>`;
    return `<div class="di-alert" style="background:var(--panel-2);border-color:var(--border);color:var(--text-dim)">— <b>Actual belum diisi</b> — belum ada status/aktivitas tercatat untuk unit ini jam ini (bukan error).</div>
      <button class="di-add" onclick="diAdd('${path}','seg')">+ Isi Status</button>`;
  }
  return segs.map((s,i)=>{ const p = `${path}.${i}`;
    return `<div class="di-sg" data-s="${s.s}">
      <div class="di-stbtn">${['W','I','D','BD'].map(k=>`<button type="button" data-k="${k}" class="${k===s.s?'on':''}" title="${DI_ST[k]}" onclick="diSet('${p}.s','${k}',true)">${k}</button>`).join('')}${diOtTag(s.s)}</div>
      <input class="adm-input" type="number" min="0" max="60" step="1" value="${s.dur}" oninput="diSet('${p}.dur',this.value,false)"><span class="di-mnt">mnt</span>
      ${s.s==='D' ? diSelect(`${p}.code`, ADMIN_LOOKUP_CACHE.delay||[], s.code, 'Kode Delay', false) : ''}
      ${s.s==='I' ? diSelect(`${p}.code`, diOptIdleUnit(), s.code, 'Kode Idle', false) : ''}
      ${/* [WEATHER RECON UI — poin 10] status & reason ditampilkan terpisah dan jelas, mis.
           "[Working] 44 min — Reason: Rain", BUKAN "[Rain Hours] 44 min". wxNote dipakai saat status
           TETAP Working (poin 5, reason tidak persist ke DB); utk Idle/Delay yang reasonnya memang kode
           cuaca, code sudah tampil di dropdown di atas, badge ini menegaskan labelnya. */ ''}
      ${(s.wxNote || (s._wxAuto && WX_CODE_LABEL[s.code])) ? `<span class="di-mnt" style="color:var(--text-dim)">— Reason: ${WX_CODE_LABEL[s.wxNote||s.code]||s.wxNote||s.code}</span>` : ''}
      ${segs.length>1 ? `<button class="di-x" title="Hapus segmen" onclick="diDel('${p}')">✕</button>` : ''}</div>`; }).join('')
    + `<button class="di-add" onclick="diAdd('${path}','seg')">+ Segmen</button>`;
}
/* [UI 2026-09] Ringkasan status Fleet untuk tampilan card tertutup — murni dihitung dari data yang
   sudah ada (status segmen pertama tiap unit: digger + tiap hauler yang unitnya sudah dipilih).
   Tidak menyimpan/mengubah apapun; hanya agregasi tampilan (mis. "3 Working • 1 Idle"). */
function diFleetStatusCounts(fl){
  // [BUGFIX 2026-11 — "Working 5"/"Working 4" padahal Actual belum diisi] Sebelumnya
  // `(segs[0]&&segs[0].s)||'W'` salah fallback ke Working saat segs KOSONG ([], state "Actual belum
  // diisi" pada jam Work End) — badge Fleet jadi menghitung PLAN/default sebagai Working, bukan ACTUAL.
  // Sekarang: segs kosong = kategori NONE tersendiri, TIDAK dihitung sebagai Working apa pun.
  const units = [];
  if(fl.digger) units.push((fl.dsegs && fl.dsegs.length) ? (fl.dsegs[0].s||'W') : null);
  (fl.haulers||[]).forEach(hl=>{ if(hl.unit) units.push((hl.segs && hl.segs.length) ? (hl.segs[0].s||'W') : null); });
  const c = {W:0,I:0,D:0,BD:0,NONE:0};
  units.forEach(s=>{ if(s===null) c.NONE++; else if(c[s]!=null) c[s]++; });
  return { c, total: units.length, active: c.W };
}
/* [UI 2026-09 DAILY INPUT COMPLETENESS] Indikator kelengkapan jam per unit per shift di panel Daily
   Input. MURNI TAMPILAN — tidak mengubah logic perhitungan/mapping/schema/query Supabase yang sudah
   ada: hanya membaca ulang DI.stAll (unit_status_actual shift ini, sudah di-fetch untuk keperluan lain)
   plus DI.dlAll/DI.idlAll (delay_events/idle_events shift ini, sekarang ikut di-cache di diLoadShift —
   lihat komentar di sana) dan menerapkan RUMUS YANG SAMA dengan getUnifiedStandbyHours() (baris ~1985):
     itemized = idle + delay
     standby  = standbyLegacy + itemized   (ADDITIF — lihat [FIX 2026-09] di getUnifiedStandbyHours())
     classified = working + standby + breakdown
     missing  = max(scheduled - classified, 0)
   "missing" di sini adalah GAP DATA (belum terklasifikasi) — sengaja TIDAK dianggap otomatis sebagai
   Working/Idle/Delay/BD apa pun, sama seperti komentar asli di getUnifiedStandbyHours/validateUnitShiftHours. */
function diCompletenessRows(){
  const scheduled = SHIFT_HOURS_BY_CODE[DI.shift] || SHIFT_HOURS_BY_NAME[DI.shift] || 12;
  // [BUGFIX 2026-11 — WORK END KOSONG DIANGGAP "KURANG 1 JAM"] Work End (17-18 Shift D / 05-06 Shift N)
  // adalah checkpoint OPSIONAL, bukan jam operasi wajib — kosong itu VALID (lihat diWorkEndInfo/
  // diApplyBreakAuto). Kelengkapan jam TIDAK BOLEH mewajibkan jam ini terklasifikasi. requiredHours =
  // scheduled dikurangi alokasi Work End (selalu 1 jam, berlaku sama untuk D & N). Kalau unit memang
  // punya OT di jam itu, classified otomatis lebih tinggi dan tetap tidak memicu "over" (dibandingkan
  // ke scheduled PENUH, bukan requiredHours) — OT tidak dianggap kelebihan jam.
  const WORK_END_ALLOWANCE = 1;
  const requiredHours = Math.max(scheduled - WORK_END_ALLOWANCE, 0);
  const map = new Map();
  const ensure = u=>{ if(!map.has(u)) map.set(u, {working:0, standbyLegacy:0, breakdown:0, idle:0, delay:0}); return map.get(u); };
  (DI.stAll||[]).forEach(r=>{
    if(!r.unit_code) return;
    const v = ensure(r.unit_code), h = Number(r.duration_hours)||0;
    if(r.status==='Working') v.working += h;
    else if(r.status==='Standby') v.standbyLegacy += h;
    else if(r.status==='Breakdown') v.breakdown += h;
  });
  (DI.dlAll||[]).forEach(r=>{ if(r.unit_code) ensure(r.unit_code).delay += Number(r.duration_hours)||0; });
  (DI.idlAll||[]).forEach(r=>{ if(r.unit_code && r.scope==='UNIT') ensure(r.unit_code).idle += Number(r.duration_hours)||0; });
  const rows = [];
  map.forEach((v,unit)=>{
    // [FIX 2026-09 — lihat komentar getUnifiedStandbyHours()] additif, BUKAN saling menggantikan.
    // Standby legacy dan Delay/Idle itemized adalah dua periode berbeda yang saling melengkapi
    // (rule lama "itemized>0 → buang standbyLegacy" membuat unit dgn kombinasi keduanya tampak
    // "kurang jam" padahal database-nya sudah 12j penuh, mis. BD_853 26 Sep).
    const itemized = v.idle + v.delay;
    const standby = v.standbyLegacy + itemized;
    const classified = Math.round((v.working + standby + v.breakdown)*100)/100;
    const missing = Math.max(Math.round((requiredHours-classified)*100)/100, 0);
    const over = Math.max(Math.round((classified-scheduled)*100)/100, 0);
    rows.push({ unit, working:v.working, idle:v.idle, delay:v.delay, breakdown:v.breakdown, classified, missing, over, scheduled, requiredHours });
  });
  rows.sort((a,b)=> (b.over-a.over) || (b.missing-a.missing) || a.unit.localeCompare(b.unit));
  return rows;
}
function diCompletenessBanner(){
  if(!DI.date || !DI.shift) return '';
  const rows = diCompletenessRows();
  if(!rows.length) return '';
  const need = rows.filter(r=> r.missing>0.009 || r.over>0.009).length;
  const items = rows.map(r=>{
    let icon='✅', cls='ok', txt=`${U.fmtExact(r.scheduled,0)} jam lengkap`;
    if(r.over>0.009){ icon='⚠️'; cls='warn'; txt=`Jam melebihi ${U.fmtExact(r.scheduled,0)} jam, perlu dicek (total ${U.fmtExact(r.classified,2)}j)`; }
    else if(r.missing>0.009){ icon='⚠️'; cls='warn'; txt=`Data belum lengkap — kurang ${U.fmtExact(r.missing,2)} jam, perlu dicek`; }
    return `<div class="di-comp-row ${cls}"><span class="di-comp-unit">${icon} <b>${esc(r.unit)}</b></span><span class="di-comp-txt">${txt}</span></div>`;
  }).join('');
  return `<div class="di-card di-comp">
    <div class="di-card-h"><b>🕐 Kelengkapan Jam per Unit — Shift ${esc(DI.shift)} (${esc(DI.date)})</b>
      ${need ? `<span class="di-comp-badge warn">${need} perlu dicek</span>` : `<span class="di-comp-badge ok">Semua lengkap</span>`}</div>
    <div class="di-comp-list">${items}</div>
  </div>`;
}
function diFleetCard(fl, i){
  const p = `fleets.${i}`, A = ADMIN_LOOKUP_CACHE;
  /* [UI 2026-09] Accordion: fleet ditutup/dibuka via DI.fleetOpen (default fleet pertama terbuka).
     Fleet baru (belum ada di state sebelumnya) dibuka otomatis lewat default di objek di bawah. */
  const open = DI.fleetOpen[i] !== undefined ? DI.fleetOpen[i] : (DI.fleetOpen[i] = i===0);
  const label = fl.fleet ? diLookupLabel('fleet', fl.fleet) : 'Fleet baru';
  const st = diFleetStatusCounts(fl);
  // [UI 2026-09] Ringkasan yang tampil di kedua kondisi (terbuka/tertutup) — saat tertutup, semua
  // elemen lain di-hide via CSS (.di-card.di-fleet.closed), hanya header + .di-fsum yang tersisa.
  const summary = `<div class="di-fsum">
      <div class="di-fsum-top">
        <span class="di-fsum-active">${st.active}/${st.total || 0} Unit Aktif</span>
        ${!open ? `<span class="di-fsum-cta">Detail Fleet →</span>` : ''}
      </div>
      <div class="di-fsum-line">
        <span>⛏ Digger <b>${fl.digger ? esc(diLookupLabel('digger', fl.digger)) : '—'}</b></span>
        <span>📦 <b>${fl.material ? esc(diLookupLabel('material', fl.material)) : '—'}</b></span>
        <span>📍 <b>${fl.location ? esc(diLookupLabel('location', fl.location)) : '—'}</b></span>
      </div>
      <div class="di-fsum-badges">
        <span class="di-fsum-badge w">[W] Working ${st.c.W}</span>
        <span class="di-fsum-badge i">[I] Idle ${st.c.I}</span>
        <span class="di-fsum-badge d">[D] Delay ${st.c.D}</span>
        <span class="di-fsum-badge bd">[BD] Breakdown ${st.c.BD}</span>
        ${st.c.NONE>0 ? `<span class="di-fsum-badge" style="background:var(--panel-2);color:var(--text-dim)">Belum diisi ${st.c.NONE}</span>` : ''}
      </div>
    </div>`;
  return `<div class="di-card di-fleet ${open?'':'closed'}">
    <div class="di-card-h di-facc-h ${open?'open':''}" onclick="diToggleFleet(${i})">
      <div class="di-facc-t"><span class="di-facc-arrow">▶</span><b>${esc(label)}</b></div>
      <button class="di-x" title="Hapus fleet" onclick="event.stopPropagation();diDel('${p}')">✕</button></div>
    ${summary}
    <div class="di-grid" style="margin-top:10px">
      <div><label class="adm-label">Fleet</label>${diPicker(`${p}.fleet`, A.fleet||[], fl.fleet, 'Cari Fleet...')}</div>
      <div><label class="adm-label">Material</label>${diPicker(`${p}.material`, A.material||[], fl.material, 'Cari Material...')}</div>
      <div><label class="adm-label">Lokasi</label>${diPicker(`${p}.location`, A.location||[], fl.location, 'Cari Lokasi...')}</div>
      <div><label class="adm-label">Jarak (km)</label>${diInput(`${p}.dist`, fl.dist)}</div>
    </div>
    <div class="di-unit di-dig"><div class="di-unit-h">⛏ Digger</div>
      <div class="di-grid2">${diPicker(`${p}.digger`, A.digger||[], fl.digger, 'Cari Unit Digger...', true, diLockedUnits(`${p}.digger`))}${diPicker(`${p}.operator`, A.operator||[], fl.operator, 'Cari Operator...', true, diLockedOperators(`${p}.operator`))}</div>
      ${fl.digger ? diSegRows(`${p}.dsegs`, fl.dsegs) : ''}</div>
    ${fl.haulers.map((hl,j)=>{ const q = `${p}.haulers.${j}`, cv = diConv(fl.material, hl.unit);
      // [DI PAYLOAD FIX 2026-09] Payload/rit tidak lagi input manual — hanya tampilan readonly dari
      // master_material_haul_conversions (via diConv). Jika mapping tidak ditemukan tampilkan '—'
      // + judul peringatan, TIDAK mengarang angka. Nilai hl.payload lama (production_actual yang
      // sudah tersimpan) tetap dipertahankan sebagai fallback perhitungan di diTotals/diSaveProd
      // (pola `diN(hl.payload) || diConv(...).v` yang sudah ada, tidak diubah).
      const payDisp = cv.found ? (U.fmtExact(cv.v,2)+' '+cv.u) : '—';
      const payTitle = cv.found ? 'Payload otomatis dari master_material_haul_conversions' : 'Mapping master_material_haul_conversions belum tersedia untuk material + haul unit ini';
      return `<div class="di-unit"><div class="di-unit-h">🚛 Hauler ${j+1}<button class="di-x" title="Hapus hauler" onclick="diDel('${q}')">✕</button></div>
        <div class="di-grid4">${diPicker(`${q}.unit`, A.hauler||[], hl.unit, 'Cari Unit Hauler...', true, diLockedUnits(`${q}.unit`))}${diPicker(`${q}.driver`, A.driver||[], hl.driver, 'Cari Driver...', true, diLockedDrivers(`${q}.driver`))}
          ${diInput(`${q}.rit`, hl.rit, 'Ritase/jam', 'min="0" step="1"')}<input class="adm-input" type="text" readonly disabled title="${esc(payTitle)}" value="${esc(payDisp)}" placeholder="Payload/rit 🔒" style="${cv.found?'':'color:var(--danger,#e05252);'}"></div>
        ${hl.unit ? diSegRows(`${q}.segs`, hl.segs) : ''}</div>`; }).join('')}
    <button class="di-add" onclick="diAdd('${p}.haulers','hauler')">+ Hauler</button>
  </div>`;
}
function diStandbyCard(f){
  return `<div class="di-card"><div class="di-card-h"><b>Standby / Breakdown (unit di luar fleet)</b></div>
    ${(f.standby||[]).map((s,i)=>`<div class="di-sg" data-s="${s.s}">${diSelect(`standby.${i}.unit`, diOptUnits(), s.unit, '— Unit —', true, diLockedUnits(`standby.${i}.unit`))}
      <select class="adm-select" onchange="diSet('standby.${i}.s',this.value,true)"><option value="SB" ${s.s==='SB'?'selected':''}>Standby</option><option value="BD" ${s.s==='BD'?'selected':''}>Breakdown</option></select>
      <input class="adm-input" type="number" min="1" max="60" value="${s.dur}" oninput="diSet('standby.${i}.dur',this.value,false)"><span class="di-mnt">mnt</span>
      <button class="di-x" onclick="diDel('standby.${i}')">✕</button></div>`).join('')}
    <button class="di-add" onclick="diAdd('standby','sb')">+ Unit Standby/BD</button></div>`;
}
/* ================== SUPPORT — status-first roster (Mining Control Room) ==================
   Unit: master_units WHERE production_classification='SUPPORT' (diOptSupportUnits(), TIDAK diOptUnits()).
   Status: Working/Idle/Delay -> f.support[] (unit/s/dur/code/operator) TETAP PERSIS field & fungsi
   diSet/diAdd/diDel yang sudah ada. [UI 2026-09] Interaksi diubah dari "+ baris -> pilih unit -> pilih
   status dropdown" menjadi roster SEMUA unit Support sekaligus dengan tap W/I/D langsung (menambah
   baris f.support saat status != W, menghapusnya saat kembali ke W — sama persis efeknya dengan
   tombol +Tambah/✕Hapus yang lama, cuma 1 tap). BD/SB (legacy) TIDAK jadi opsi baru — hanya
   ditampilkan sebagai status aktif jika sudah ada di data lama, sama seperti batasan dropdown asli. */
/* ============ [FIX 2026-12 DAILY INPUT SUPPORT — EDITABILITY + OPERATOR CONTINUITY + WEATHER SEGMENTS] ============
   Pemisahan konsep (poin 1):
     isExistingData = record berasal dari Supabase (punya status_id/idle_event_id/delay_event_id) -> HANYA indikator/label.
     isEditable     = boleh ubah status. Support: SELALU true, kecuali unit baru (belum punya baris) yang terkunci
                      cross-module (dipakai Production/Standby-BD jam ini). Existing data TIDAK PERNAH read-only.
   Existing record di-UPDATE in place (baris form yang sama, id tetap terbawa); saat Simpan, diPlan mengganti baris
   jam ini berdasarkan PK -> tidak pernah membuat duplicate. Tidak ada perubahan schema/data Supabase.

   Operator timeline (poin 2/3/10): operator dievaluasi TERPISAH dari status. idle_events/delay_events tidak punya
   kolom operator (schema tidak diubah), jadi operator Idle/Delay direkonstruksi dari bukti unit yang sama:
     1. explicit assignment pada jam target (baris form non-inferred)
     2. record unit_status_actual jam target (Working/Standby/Breakdown membawa operator_code)
     3. jam sebelumnya terdekat yang punya bukti  4. jam sesudahnya terdekat yang punya bukti
     5. kosong hanya jika tidak ada bukti. Sebelum=A & sesudah=B (beda) -> TIDAK menebak: satu-satunya bukti
        pergantian yang dipakai adalah operator itu sedang dipakai unit lain di jam target (busy elsewhere);
        kalau tetap ambigu -> dikosongkan + ditandai _opAmbiguous (UI meminta pilih manual). */
function diOpLabel(code){ return ['operator','operatorDozer','operatorGrader','driverWT'].map(k=>fkLabel(k,code)).find(l=>l!==code) || code; }
function diSupportOpEvidence(unit, h){
  const f = DI.forms && DI.forms[h];
  if(f){
    const r = (f.support||[]).find(x=> x.unit===unit);
    if(r && r.operator && !r._opInferred) return { op:r.operator, src:'explicit_assignment' };
    if(r && r._opTouched && !r.operator) return null;   // user sengaja mengosongkan -> jangan dianggap bukti
  }
  const d = DI.db && DI.db[h];
  if(d){ const x = (d.st||[]).find(y=> y.unit_code===unit && y.operator_code); if(x) return { op:x.operator_code, src:'unit_timeline' }; }
  return null;
}
function diSupportOpBusy(h, unit, op){
  const f = DI.forms && DI.forms[h]; if(!f) return false;
  if((f.fleets||[]).some(fl=> fl.operator===op)) return true;
  return (f.support||[]).some(s=> s.unit!==unit && s.operator===op && s.s!=='SB' && s.s!=='BD');   // SB/BD tidak "memegang" unit (sama dgn diValidate)
}
function diSupportResolveOperator(unit, h){
  const own = diSupportOpEvidence(unit, h);
  if(own) return { op:own.op, src: own.src==='explicit_assignment' ? 'explicit_assignment' : 'same_hour_timeline' };
  const hs = diHours(), i = hs.indexOf(h); if(i<0) return { op:'', src:'none' };
  let prev = null, next = null;
  for(let k=i-1; k>=0 && !prev; k--) prev = diSupportOpEvidence(unit, hs[k]);
  for(let k=i+1; k<hs.length && !next; k++) next = diSupportOpEvidence(unit, hs[k]);
  const cands = [...new Set([prev && prev.op, next && next.op].filter(Boolean))];
  const free = cands.filter(op=> !diSupportOpBusy(h, unit, op));
  if(cands.length===1){
    return free.length ? { op:cands[0], src: prev && next ? 'continuity' : (prev ? 'previous_interval' : 'next_interval') }
                       : { op:'', src:'busy_elsewhere', blocked:cands[0] };
  }
  if(cands.length===2){
    if(free.length===1) return { op:free[0], src:'boundary_evidence' };
    return { op:'', src:'ambiguous', ambiguous:cands };
  }
  return { op:'', src:'none' };
}
/* Isi operator kosong pada baris Support jam h dari bukti continuity. Tidak pernah menimpa operator yang sudah ada
   atau yang sengaja disentuh user (_opTouched). */
function diSupportFillOperators(h){
  const f = DI.forms && DI.forms[h]; if(!f || !f.support) return;
  f.support.forEach(s=>{
    if(!s.unit) return;
    if(s.operator){ if(!s._opSource) s._opSource = 'explicit_assignment'; return; }
    if(s._opTouched) return;
    const r = diSupportResolveOperator(s.unit, h);
    s._opAmbiguous = r.ambiguous || null;
    if(r.op){ s.operator = r.op; s._opInferred = true; }
    s._opSource = r.src;
    const sig = r.src+'|'+(r.op||'');
    if((r.op || r.ambiguous || r.blocked) && s._opLogged!==sig){ s._opLogged = sig; diLogSupportRow(h, s, true); }
  });
}
/* Interval weather (poin 4/8/9): overlap event cuaca ASLI (DI.wxEvents, tidak diduplikasi per unit) dengan jam h,
   per menit lewat diUnitWeatherTimeline (hanya event yg 'affected' utk unit ini). Rain 09:35–10:44 + Slippery
   10:45–11:08 pada jam 10 -> [{Rain 10:00–10:44, 44 mnt}, {Slippery 10:45–11:00, 15 mnt}]. end eksklusif. */
function diSupportWxSegs(h, unit){
  const ctx = diUnitWeatherCtx(unit); if(!ctx) return [];
  const out = []; let off = 0;
  diUnitWeatherTimeline(h, ctx).forEach(t=>{ if(t.code) out.push({ code:t.code, start:h*60+off, end:h*60+off+t.mins, mins:t.mins }); off += t.mins; });
  return out;
}
/* [DEBUG poin 13] unit_id, interval_start, interval_end, status, reason, operator, source, weather_event,
   weather_overlap_minutes, existing_data, operator_source. */
function diLogSupportRow(h, s, opMode){
  const segs = diSupportWxSegs(h, s.unit);
  const existing = !!(s.status_id || s.idle_event_id || s.delay_event_id);
  const src = s.status_id ? 'unit_status_actual' : (s.idle_event_id ? 'idle_events' : (s.delay_event_id ? 'delay_events' : 'form'));
  const opName = s.operator ? diOpLabel(s.operator) : '';
  const opSrc = s.operator ? (s._opSource || 'explicit_assignment') : (s._opAmbiguous ? 'ambiguous_no_evidence' : (s._opSource || 'none'));
  const stName = DI_ST[s.s] || s.s;
  const protectedRow = s.s==='BD' || ((s.s==='I' || s.s==='D') && s.code && !WX_CODE_LABEL[s.code]);
  const emit = (a,b,reason,wx,mins,source)=> console.log(`[SUPPORT-RECON] unit_id=${s.unit} interval_start=${diMinToClock(a)} interval_end=${diMinToClock(b)} status=${stName} reason=${reason||'-'} operator=${opName||'—'} source=${source} weather_event=${wx||'none'} weather_overlap_minutes=${mins||0} existing_data=${existing} operator_source=${opSrc}`);
  if(segs.length){
    segs.forEach(g=>{ emit(g.start, g.end, protectedRow ? (s.s==='BD' ? 'Breakdown (cuaca tidak menimpa)' : (s.code||'manual')) : WX_CODE_LABEL[g.code], g.code, g.mins, 'weather_event'); });
  } else if(opMode){
    emit(h*60, h*60+(diN(s.dur)||60), s.code||'-', 'none', 0, src);
  }
}
function diSupportTap(unit, key, idx){
  const f = diForm(); if(!f) return;
  // [FIX 2026-12] Semua tombol W/I/D/BD berlaku SAMA untuk unit existing maupun baru (perilaku = Excavator
  // Production). W tidak lagi MENGHAPUS baris (itu yang sebelumnya membuang record Working existing + operatornya).
  if(idx===-1){
    diAdd('support','support'); idx = f.support.length-1;
    diSet(`support.${idx}.unit`, unit, false);
    diSupportFillOperators(DI.hour);   // unit baru langsung membawa operator dari continuity (bukan kosong)
  }
  const row = f.support[idx];
  if(row._origS===undefined) row._origS = (row.status_id || row.idle_event_id || row.delay_event_id) ? row.s : null;   // utk label "Data existing (<status asli>)"
  if(row.s===key){ diPaintBody(); return; }
  diSet(`support.${idx}.s`, key, true);
  if(key==='W' || key==='BD') row.dur = 60;   // 1 baris per unit per jam: W/BD berarti penuh 1 jam (durasi Idle/Delay parsial tidak ikut terbawa)
  diLogSupportRow(DI.hour, row, true);
}
/* [UI 2026-09 +UNIT] "+ Unit" panel di tab Support — murni menambah unit ke DI.supExtra (UI-only, lihat
   definisi DI) supaya cardnya ikut dirender di daftar utama. Tidak membuat baris f.support/Supabase apa
   pun di sini — operator tetap tap status (W/I/D) di card seperti biasa lewat diSupportTap() yang sudah
   ada, sama persis logicnya dengan unit yang tampil default. */
function diSupAddUnit(unit){ DI.supExtra.add(unit); DI.supPicker = false; diPaintBody(); }
function diSupportSummary(list, totalUnits){
  const c = {W:0,I:0,D:0,BD:0,SB:0,U:0};
  (list||[]).forEach(s=>{ if(c[s.s]!=null) c[s.s]++; });
  // [FIX 2026-09 AUDIT] Sebelumnya sc hanya menjumlahkan baris yang ADA di f.support[] (list) —
  // unit yang belum punya baris sama sekali (belum diinput / status tidak dikenali) hilang dari
  // summary tanpa jejak, membuat total W+I+D+BD+SB < totalUnits secara diam-diam. Sekarang
  // selisihnya dihitung eksplisit sebagai c.U (Unknown/belum diinput) supaya summary SELALU = totalUnits.
  if(totalUnits!=null) c.U = Math.max(totalUnits - (list||[]).length, 0);
  return c;
}
// [FIX 2026-09 AUDIT] SELF-HEAL: dikonfirmasi via SQL langsung ke Supabase bahwa data Working/Idle/Delay
// unit Support kadang SUDAH BENAR di unit_status_actual/idle_events/delay_events (unit_code, hour_label,
// status semua match persis), TAPI f.support (hasil cache diFromDb() di DI.forms) bisa saja belum/tidak
// tersinkron dengan benar saat tab Support digambar (mis. race saat load, form lama tertinggal di memory).
// Untuk tab Support SAJA (read-mostly, bukan Production yang punya assignment kompleks), kita cocokkan
// ulang f.support terhadap DI.db[h] (data mentah hasil fetch Supabase) SETIAP KALI tab ini digambar —
// murni ADDITIF (tidak pernah menghapus/mengubah baris yang sudah ada di f.support, hanya menambahkan
// baris yang terbukti ada di DB tapi belum tercermin di f.support). Tidak menyentuh Supabase/save logic.
function diSupportResync(h){
  const d = DI.db && DI.db[h], f = DI.forms && DI.forms[h];
  if(!d || !f) return;
  if(!f.support) f.support = [];
  const supportCodes = new Set((ADMIN_LOOKUP_CACHE.support||[]).map(o=>o.value));
  const have = new Set(f.support.map(s=>s.unit));
  (d.st||[]).filter(x=> supportCodes.has(x.unit_code) && x.status==='Working' && !have.has(x.unit_code)).forEach(x=>{
    f.support.push({ unit:x.unit_code, s:'W', dur:Math.round(Number(x.duration_hours)*60), code:'', operator:x.operator_code||'', status_id:x.status_id });
    have.add(x.unit_code);
  });
  (d.idl||[]).filter(x=> supportCodes.has(x.unit_code) && !have.has(x.unit_code)).forEach(x=>{
    f.support.push({ unit:x.unit_code, s:'I', dur:Math.round(Number(x.duration_hours)*60), code:x.idle_code||'', idle_event_id:x.idle_event_id });
    have.add(x.unit_code);
  });
  (d.dl||[]).filter(x=> supportCodes.has(x.unit_code) && !have.has(x.unit_code)).forEach(x=>{
    f.support.push({ unit:x.unit_code, s:'D', dur:Math.round(Number(x.duration_hours)*60), code:x.delay_code||'', delay_event_id:x.delay_event_id });
    have.add(x.unit_code);
  });
  // [FIX 2026-09 AUDIT v2] Sama seperti di diFromDb() — backfill status Standby/Breakdown unit Support
  // yang tersimpan per-jam di unit_status_actual, supaya tidak salah tampil sebagai "Unknown".
  (d.st||[]).filter(x=> supportCodes.has(x.unit_code) && (x.status==='Standby' || x.status==='Breakdown') && !have.has(x.unit_code)).forEach(x=>{
    f.support.push({ unit:x.unit_code, s: x.status==='Breakdown' ? 'BD' : 'SB', dur:Math.round(Number(x.duration_hours)*60), code:'', operator:x.operator_code||'', status_id:x.status_id });
    have.add(x.unit_code);
  });
}
/* ============ [FIX 2026-12 SUPPORT — WORK END (17 D / 05 N) = BOUNDARY, BUKAN STATUS UNIT] ============
   Root cause: tab Support hanya menampilkan unit yang punya baris f.support di jam ini. Jam Work End tidak
   punya production event -> f.support kosong -> "Belum ada unit aktif jam ini" + summary Unknown/Delay palsu.
   Fix (reconstruction/tampilan saja, TANPA insert/hapus/ubah data Supabase): unit ditentukan dari CONTINUITY
   (jam sebelum/sesudah), operator dari diSupportResolveOperator (bukti sama, aturan A/B ambigu tetap berlaku).
   Kartu Work End bersifat VIRTUAL (tidak membuat baris form), jadi tidak ada fake record & tidak masuk kalkulasi
   production. Kalau user memilih W/I/D/BD (atau data existing memang ada), baris normal dibuat/tampil & tetap
   editable (Existing != read-only) — Work End tidak memaksa status production apa pun. Cuaca tidak menimpa Work End. */
const diIsWorkEndHour = h => { const we = diWorkEndInfo(h); return !!(we && we.isWorkEnd); };
function diSupportRowsAt(k){
  if(DI.forms && DI.forms[k]) return DI.forms[k].support || [];
  if(DI.db && DI.db[k]) return diFromDb(k).support || [];
  return [];
}
/* Bukan default otomatis (Meal/Change Shift auto-Delay semua unit): baris dianggap bukti hanya kalau berasal dari
   DB, disentuh user, atau jamnya bukan jam auto-delay. */
function diSupportContinuityUnits(h){
  const hs = diHours(), i = hs.indexOf(h), out = new Set();
  if(i<0) return out;
  const codes = new Set((ADMIN_LOOKUP_CACHE.support||[]).map(o=>o.value));
  [hs[i-1], hs[i+1]].forEach(k=>{
    if(k===undefined) return;
    diSupportRowsAt(k).forEach(r=>{
      if(!r.unit || !codes.has(r.unit)) return;
      const real = r.status_id || r.idle_event_id || r.delay_event_id || r._wxTouched || r._opTouched || r._mealTouched;
      if(real || !diBreakInfo(k)) out.add(r.unit);
    });
  });
  return out;
}
function diSupportWorkEndCard(o){
  const h = DI.hour, why = diLockedSupportUnits(null)[o.value];
  const r = diSupportResolveOperator(o.value, h);
  const opSrcLabel = { continuity:'jam sebelum & sesudah', previous_interval:'jam sebelumnya', next_interval:'jam sesudahnya', boundary_evidence:'jam sebelum/sesudah (operator lain sedang dipakai unit lain)' };
  const opLine = r.op
    ? `Operator: <b>${esc(diOpLabel(r.op))}</b> <span style="color:var(--text-faint)">— diteruskan dari ${opSrcLabel[r.src]||'kontinuitas'}</span>`
    : (r.ambiguous ? `<span style="color:var(--warning)">Operator ambigu: ${r.ambiguous.map(diOpLabel).map(esc).join(' (sebelum) / ')} (sesudah) — tidak ada bukti pergantian operator.</span>`
      : `Operator: <span style="color:var(--text-faint)">— tidak ada bukti operator</span>`);
  console.log(`[SUPPORT-RECON] unit_id=${o.value} interval_start=${diMinToClock(h*60)} interval_end=${diMinToClock(h*60+60)} status=WORK_END(N/A) reason=- operator=${r.op?diOpLabel(r.op):'—'} source=continuity weather_event=ignored weather_overlap_minutes=0 existing_data=false operator_source=${r.src}`);
  return `<div class="di-card di-sb-unit">
    <div class="di-roster-row">
      <div><b>${esc(o.label)}</b>${o.unit_role_code?`<span class="di-roster-tag">${esc(o.unit_role_code)}</span>`:''}<span class="di-roster-tag" style="background:#64748B22;color:#64748B">🕐 WORK END / N/A</span>${why?`<span class="di-roster-tag lock">🔒 ${esc(why)}</span>`:''}</div>
      <div class="di-stbtn">${['W','I','D','BD'].map(k=>`<button type="button" data-k="${k}" ${why?'disabled':''} title="${DI_ST[k]}" onclick="diSupportTap('${esc(o.value)}','${k}',-1)">${k}</button>`).join('')}</div>
    </div>
    <div class="di-sb-panel"><div class="text-xs">${opLine}</div>
      <div class="text-xs mt-1" style="color:var(--text-faint)">Work End = batas akhir jam kerja, bukan status unit — tidak dihitung sebagai production. Pilih W/I/D/BD hanya bila ada aktivitas aktual.</div></div>
  </div>`;
}
function diSupportUnitCard(o, f){
  const idx = (f.support||[]).findIndex(s=>s.unit===o.value);
  const row = idx>-1 ? f.support[idx] : null;
  const isWE = diIsWorkEndHour(DI.hour);
  if(isWE && !row) return diSupportWorkEndCard(o);   // [WORK END] unit continuity tanpa event -> kartu virtual (unit+operator, status N/A)
  const locked = diLockedSupportUnits(idx>-1 ? `support.${idx}.unit` : null);
  const why = locked[o.value];   // cross-module lock (unit dipakai Fleet/Standby-BD jam ini) — hanya relevan utk unit BARU
  // [FIX 2026-12 EXISTING != READ-ONLY] Dua konsep terpisah:
  //   isExistingData = record berasal dari Supabase (id primary key terbawa dari diFromDb/diSupportResync) -> LABEL saja.
  //   isEditable     = boleh ubah status W/I/D/BD. Existing data SELALU editable; hanya unit baru yang terkunci
  //                    cross-module (belum punya baris) yang tidak bisa dipilih.
  const isExistingData = !!(row && (row.status_id || row.idle_event_id || row.delay_event_id));
  const disableNew = !row && !!why;
  const isEditable = !disableNew;
  // key=null saat row null: tidak ada tombol ter-highlight ("belum diinput" beda dari Working asli).
  const key = row ? row.s : null;
  const keys = ['W','I','D','BD'].concat(row && row.s==='SB' ? ['SB'] : []);   // SB hanya tampil bila data lama memang SB
  let opPool = row ? diOptSupportOperator(o.value) : [];
  // operator hasil continuity/existing yang kebetulan di luar pool role tetap ditampilkan (jangan tampil kosong)
  if(row && row.operator && !opPool.some(p=> String(p.value)===String(row.operator))) opPool = opPool.concat([{ value:row.operator, label:diOpLabel(row.operator) }]);
  const _isWT = diIsWaterTruckRole(o.unit_role_code);
  const opPh = opPool.length ? (_isWT?'— Driver WT —':'— Operator —') : (_isWT?'Belum ada Driver WT aktif di master_employees':'Role unit ini belum punya pool operator');
  const needReason = row && (key==='I' || key==='D');
  const origKey = row && row._origS ? row._origS : key;
  const existingLabel = isExistingData
    ? `Data existing (${DI_ST[origKey]||origKey})${origKey!==key ? ` → ${DI_ST[key]||key} (belum disimpan)` : ''}` : null;
  const wxSegs = (row && !isWE) ? diSupportWxSegs(DI.hour, o.value) : [];   // Work End: cuaca tidak dipakai
  const opSrcLabel = { same_hour_timeline:'record jam ini', previous_interval:'jam sebelumnya', next_interval:'jam sesudahnya', continuity:'jam sebelum & sesudah', boundary_evidence:'jam sebelum/sesudah (operator lain sedang dipakai unit lain)' };
  const opNote = !row ? '' :
    (row._opInferred && row.operator ? `<div class="text-xs mt-1" style="color:var(--text-faint)">Operator diteruskan dari ${opSrcLabel[row._opSource]||'kontinuitas'} — ubah bila ada pergantian operator.</div>` :
     (!row.operator && row._opAmbiguous ? `<div class="text-xs mt-1" style="color:var(--warning)">Operator ambigu: ${row._opAmbiguous.map(diOpLabel).map(esc).join(' (sebelum) / ')} (sesudah) — tidak ada bukti pergantian, pilih manual.</div>` : ''));
  const wxBlock = wxSegs.length ? `<div class="mt-1" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center"><span class="text-xs" style="color:var(--text-dim)">Reason cuaca:</span>${wxSegs.map(g=>`<span class="di-roster-tag" style="background:#3B82F622;color:#3B82F6;margin-left:0">${diMinToClock(g.start)}–${diMinToClock(g.end)} ${esc(WX_CODE_LABEL[g.code]||g.code)} · ${g.mins} mnt</span>`).join('')}${row.s==='BD' ? `<span class="text-xs" style="color:var(--text-faint)">Breakdown tetap (cuaca tidak menimpa)</span>` : ''}</div>` : '';
  return `<div class="di-card di-sb-unit">
    <div class="di-roster-row">
      <div><b>${esc(o.label)}</b>${o.unit_role_code?`<span class="di-roster-tag">${esc(o.unit_role_code)}</span>`:''}${!row?`<span class="di-roster-tag" style="background:#EF444422;color:#EF4444">⚠ Status tidak dikenali / belum diinput</span>`:''}${why?`<span class="di-roster-tag lock">🔒 ${esc(why)}</span>`:''}${isWE?`<span class="di-roster-tag" style="background:#64748B22;color:#64748B">🕐 WORK END</span>`:''}${existingLabel?`<span class="di-roster-tag">📄 ${esc(existingLabel)}</span>`:''}${key==='W'?diOtTag('W'):''}${(row && !isWE && !wxSegs.length && row._wxNote) ? `<span class="di-roster-tag" style="background:#3B82F622;color:#3B82F6">Reason: ${WX_CODE_LABEL[row._wxNote]||row._wxNote}</span>` : ''}</div>
      <div class="di-stbtn">${keys.map(k=>`<button type="button" data-k="${k}" class="${k===key?'on':''}" ${isEditable?'':'disabled'} title="${DI_ST[k]||k}${k==='SB'?' (data lama)':''}" onclick="diSupportTap('${esc(o.value)}','${k}',${idx})">${k}</button>`).join('')}</div>
    </div>
    ${row ? `<div class="di-sb-panel">
      ${needReason ? `<div class="di-grid2">
        ${key==='I' ? diSelect(`support.${idx}.code`, diOptIdleUnit(), row.code, 'Alasan Idle', false) : diSelect(`support.${idx}.code`, ADMIN_LOOKUP_CACHE.delay||[], row.code, 'Kode Delay', false)}
        ${diStepper(`support.${idx}.dur`, row.dur, 5, 1, 60)}
      </div>` : ''}
      <div class="${needReason?'mt-1':''}">${diPicker(`support.${idx}.operator`, opPool, row.operator, opPh, false, diLockedOperators(`support.${idx}.operator`))}</div>
      ${opNote}${wxBlock}
    </div>` : ''}
  </div>`;
}
function diCapsBanner(){
  const off = ['unit_status_actual','delay_events','idle_events'].filter(t=> DI.caps[t]===false);
  return off.length ? `<div class="di-alert warn">⚠️ Status/Delay/Idle per jam belum bisa disimpan: tabel <b>${off.join(', ')}</b> belum memiliki kolom <code>hour_label</code> di Supabase. Produksi per jam tetap tersimpan penuh; bagian ini hanya tampil di layar (TODO schema).</div>` : '';
}
function diSlot(h){
  const cls = ['di-slot', diIsFilled(h)?'done':'', h===DI.hour?'active':'', DI.dirty.has(h)?'dirty':''].join(' ');
  // [WEATHER ICON 2026-09] Tandai jam yang kena event cuaca (I01 Hujan/I02 Slippery/I03 Kabut) dari
  // DI.wxEvents (sudah dimuat dari idle_events GLOBAL, start/end event dipetakan ke jam via
  // diWeatherSlots). Beberapa event bisa nimpa jam yang sama — tampilkan semua ikon yang berlaku.
  const wxIcons = { I01:'🌧️', I02:'💧', I03:'🌫️' };
  const wxHere = [...new Set((DI.wxEvents||[]).filter(e=> diWeatherSlots(e.start,e.end).includes(h)).map(e=>e.code))];
  const wxSpan = wxHere.length ? `<span class="di-slot-wx" title="${wxHere.map(c=>({I01:'Hujan',I02:'Slippery',I03:'Kabut'}[c]||c)).join(', ')}">${wxHere.map(c=>wxIcons[c]||'').join('')}</span>` : '';
  return `<button class="${cls}" onclick="diSelectHour(${h})" title="${esc(diHourLabel(h))}${wxHere.length?' — '+wxHere.map(c=>({I01:'Hujan',I02:'Slippery',I03:'Kabut'}[c]||c)).join('/'):''}"><b>${String(h).padStart(2,'0')}</b><i></i>${wxSpan}</button>`;
}