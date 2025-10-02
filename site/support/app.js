// site/support/app.js — Hierarchie: Klasse → (Therapiegruppe → Regime)

const PRIMARY_URL  = '/support/supportive.json';
const FALLBACK_URL = '/support/supportive.example.json';

function esc(s){return String(s??'')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

const state = {
  items: [],
  catalog: [],              // [{id,name,group,aliases:[]}, ...]
  byRegimen: new Map(),     // id -> catalog entry
  filtered: [],
  selection: new Set(),
  // Filter: Klasse (Medikamentenklasse), Therapiegruppe, konkretes Regime, Freitext
  filters: { cls:'', therapyGroup:'', therapy:'', q:'' }
};

// ===== Laden =====
async function loadData(){
  let r = await fetch(PRIMARY_URL, {cache:'no-store'});
  if(!r.ok) r = await fetch(FALLBACK_URL, {cache:'no-store'});
  if(!r.ok) throw new Error('supportive.json nicht gefunden');

  const raw = await r.json();
  if (Array.isArray(raw)) {
    state.items = raw;
    state.catalog = [];
  } else {
    state.items = Array.isArray(raw.items) ? raw.items : [];
    state.catalog = Array.isArray(raw.regimen_catalog) ? raw.regimen_catalog : [];
  }

  // Maps
  state.byRegimen = new Map(state.catalog.map(r => [r.id, r]));

  // Sortierung: zuerst Klasse, dann Name
  state.items.sort((a,b)=>{
    const c = (a.class||'').localeCompare(b.class||'', 'de');
    if (c) return c;
    return (a.name||'').localeCompare(b.name||'', 'de');
  });

  document.getElementById('meta').textContent =
    `Einträge: ${state.items.length} · Regime: ${state.catalog.length}`;
}

// ===== Optionen füllen =====
function fillOptions(){
  // Klassen (Medikamentenklasse) aus items
  const classes = [...new Set(state.items.map(x => x.class).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'de'));
  fillSelect('fClass', classes);

  // Therapie-Gruppen aus catalog.group (z. B. Chemotherapie, TKI Therapie)
  const groups = [...new Set(state.catalog.map(x => x.group).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'de'));
  fillSelect('fTherapyGroup', groups);

  // Regime (vollständig, initial ungefiltert)
  refillTherapies('');
  
  // Datum vorbelegen
  const d = new Date();
  document.getElementById('pDate').value = d.toLocaleDateString('de-DE');
}

function fillSelect(id, values){
  const el = document.getElementById(id);
  if (!el) return;
  // existierende Optionen >erste behalten (Alle …), Rest entfernen
  el.querySelectorAll('option:not(:first-child)').forEach(o=>o.remove());
  for(const v of values){
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    el.appendChild(o);
  }
}

function refillTherapies(group){
  const el = document.getElementById('fTherapy');
  if (!el) return;
  // Alle entfernen außer der ersten Option
  el.querySelectorAll('option:not(:first-child)').forEach(o=>o.remove());

  const arr = state.catalog
    .filter(r => !group || (r.group||'') === group)
    .sort((a,b)=> (a.name||'').localeCompare(b.name||'', 'de'));

  for (const r of arr){
    const o = document.createElement('option');
    o.value = r.id;
    o.textContent = r.name + (r.group ? ` (${r.group})` : '');
    el.appendChild(o);
  }
}

// ===== Filtern =====
function applyFilters(){
  const { cls, therapyGroup, therapy, q } = state.filters;
  const ql = (q||'').toLowerCase().trim();

  state.filtered = state.items.filter(x=>{
    // 1) Klasse
    if (cls && x.class !== cls) return false;

    // 2) Therapiegruppe (mind. ein zugeordnetes Regime in dieser Gruppe)
    if (therapyGroup) {
      const rids = Array.isArray(x.regimens) ? x.regimens : [];
      const hit = rids.some(rid => {
        const r = state.byRegimen.get(rid);
        return r && (r.group||'') === therapyGroup;
      });
      if (!hit) return false;
    }

    // 3) Konkretes Regime
    if (therapy) {
      const rids = Array.isArray(x.regimens) ? x.regimens : [];
      if (!rids.includes(therapy)) return false;
    }

    // 4) Freitext inkl. Aliasse der Regime
    if (ql) {
      let aliasHit = false;
      const rids = Array.isArray(x.regimens) ? x.regimens : [];
      for (const rid of rids) {
        const r = state.byRegimen.get(rid);
        if (!r) continue;
        const hay = [r.name, ...(r.aliases||[])].join(' ').toLowerCase();
        if (hay.includes(ql)) { aliasHit = true; break; }
      }
      const hay2 = [x.name, x.substance, x.class, x.indication]
        .map(s => (s||'').toLowerCase()).join(' ');
      if (!(aliasHit || hay2.includes(ql))) return false;
    }

    return true;
  });

  renderResults();
  renderPreview();
  document.getElementById('hitCount').textContent = `${state.filtered.length} Treffer`;
}

// ===== Rendering Trefferliste & Vorschau =====
function resCard(x){
  // (Optional) Regimen-Badges (Namen aus Katalog auflösen)
  const regs = (Array.isArray(x.regimens)?x.regimens:[])
    .map(rid => state.byRegimen.get(rid)?.name)
    .filter(Boolean);

  const badges = regs.map(n => `<span class="px-2 py-0.5 rounded-full text-xs bg-neutral-200">${esc(n)}</span>`).join(' ');

  return `
    <label class="block bg-white border rounded-lg p-3 shadow-sm cursor-pointer">
      <div class="flex items-start gap-3">
        <input type="checkbox" class="mt-1" data-id="${esc(x.id)}" ${state.selection.has(x.id)?'checked':''}/>
        <div class="min-w-0">
          <div class="font-semibold">${esc(x.name)}</div>
          ${badges ? `<div class="mt-1 flex gap-1 flex-wrap">${badges}</div>` : ''}
          <div class="text-sm text-neutral-700 mt-1">
            <div><span class="font-medium">Klasse:</span> ${esc(x.class||'—')} · <span class="font-medium">Substanz:</span> ${esc(x.substance||'—')}</div>
            <div><span class="font-medium">Indikation:</span> ${esc(x.indication||'—')}</div>
            <div><span class="font-medium">Dosierung:</span> ${esc(x.dosing||'—')}</div>
            <div><span class="font-medium">Tageshöchstdosis:</span> ${esc(x.max_daily||'—')}</div>
            <div><span class="font-medium">Nebenwirkungen:</span> ${esc(x.side_effects||'—')}</div>
            <div><span class="font-medium">Warnhinweise:</span> ${esc(x.warnings||'—')}</div>
          </div>
        </div>
      </div>
    </label>
  `;
}
function renderResults(){
  document.getElementById('results').innerHTML = state.filtered.map(resCard).join('');
}

function renderPreview(){
  const selected = state.items.filter(x => state.selection.has(x.id));
  const byClass = new Map();
  for(const it of selected){
    const key = it.class || 'Sonstige';
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key).push(it);
  }
  const out = [];
  for(const [cls, arr] of [...byClass.entries()].sort((a,b)=>a[0].localeCompare(b[0],'de'))){
    out.push(`<div class="print-block">
      <h3 class="font-semibold text-base mt-3 mb-2">${esc(cls)}</h3>
      <div class="space-y-2">` +
      arr.map(x => `
        <article class="border rounded-lg p-3">
          <div class="font-semibold">${esc(x.name)}</div>
          <div class="text-sm text-neutral-800">
            <div><span class="font-medium">Substanz:</span> ${esc(x.substance||'—')}</div>
            <div><span class="font-medium">Indikation:</span> ${esc(x.indication||'—')}</div>
            <div><span class="font-medium">Dosierung:</span> ${esc(x.dosing||'—')}</div>
            <div><span class="font-medium">Tageshöchstdosis:</span> ${esc(x.max_daily||'—')}</div>
            <div><span class="font-medium">Nebenwirkungen:</span> ${esc(x.side_effects||'—')}</div>
            <div><span class="font-medium">Warnhinweise:</span> ${esc(x.warnings||'—')}</div>
          </div>
        </article>
      `).join('') +
      `</div></div>`);
  }
  document.getElementById('preview').innerHTML = out.join('') || `<div class="text-sm text-neutral-600">Noch keine Auswahl.</div>`;
}

// ===== Events =====
function wireUI(){
  const elCls   = document.getElementById('fClass');
  const elTGrp  = document.getElementById('fTherapyGroup');
  const elTher  = document.getElementById('fTherapy');
  const elQ     = document.getElementById('fQuery');

  elCls.addEventListener('change', ()=>{ state.filters.cls = elCls.value; applyFilters(); });

  elTGrp.addEventListener('change', ()=>{
    state.filters.therapyGroup = elTGrp.value;
    // Regime-Auswahlliste entsprechend der Gruppe neu füllen und Auswahl zurücksetzen
    refillTherapies(state.filters.therapyGroup);
    elTher.value = '';
    state.filters.therapy = '';
    applyFilters();
  });

  elTher.addEventListener('change', ()=>{ state.filters.therapy = elTher.value; applyFilters(); });

  elQ.addEventListener('input', ()=>{ state.filters.q = elQ.value; applyFilters(); });

  // Checkbox-Delegation
  document.getElementById('col-mid').addEventListener('change', (ev)=>{
    const cb = ev.target.closest('input[type="checkbox"][data-id]');
    if (!cb) return;
    const id = cb.getAttribute('data-id');
    if (cb.checked) state.selection.add(id); else state.selection.delete(id);
    renderPreview();
  });

  // Toolbar
  document.getElementById('btnReset').addEventListener('click', ()=>{
    for (const k of Object.keys(state.filters)) state.filters[k]='';
    elCls.value = ''; elTGrp.value = ''; elTher.value = ''; elQ.value = '';
    refillTherapies('');
    applyFilters();
  });
  document.getElementById('btnSelectAll').addEventListener('click', ()=>{
    for (const it of state.filtered) state.selection.add(it.id);
    renderResults(); renderPreview();
  });
  document.getElementById('btnClearSel').addEventListener('click', ()=>{
    state.selection.clear(); renderResults(); renderPreview();
  });
  document.getElementById('btnPrint').addEventListener('click', ()=> window.print());

  // Kopf-Felder (nur im Druck)
  ['pTitle','pRegimen','pDate','pPhys'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', ()=>{ /* no-op */ });
  });
}

// ===== Start =====
(async function(){
  try{
    await loadData();
    fillOptions();
    wireUI();
    applyFilters();
  }catch(e){
    console.error(e);
    document.getElementById('meta').textContent = 'Fehler beim Laden.';
  }
})();
