// site/support/app.js

const PRIMARY_URL  = '/support/supportive.json';
const FALLBACK_URL = '/support/supportive.example.json';

function esc(s){return String(s??'')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')}

const state = {
  items: [],
  filtered: [],
  selection: new Set(),
  filters: { regime:'', cls:'', spec:'', disease:'', q:'' }
};

// ---- Laden
async function loadData(){
  let r = await fetch(PRIMARY_URL, {cache:'no-store'});
  if(!r.ok) r = await fetch(FALLBACK_URL, {cache:'no-store'});
  if(!r.ok) throw new Error('supportive.json nicht gefunden');
  const data = await r.json();
  state.items = Array.isArray(data) ? data : (data.items||[]);
  // Sortierung: nach Klasse, dann Name
  state.items.sort((a,b)=>{
    const c = (a.class||'').localeCompare(b.class||'', 'de');
    if (c) return c;
    return (a.name||'').localeCompare(b.name||'', 'de');
  });
  document.getElementById('meta').textContent = `Einträge: ${state.items.length}`;
}

// ---- Filterquellen füllen
function fillOptions(){
  const by = (key) => [...new Set(state.items.map(x => x[key]).filter(Boolean))]
    .sort((a,b)=>a.localeCompare(b,'de'));
  fillSelect('fRegime', by('regimen_category'));
  fillSelect('fClass',  by('class'));
  fillSelect('fSpec',   by('specialty'));
  // disease ist abhängig von specialty → initial alle
  const allDis = [...new Set(state.items.map(x => x.disease).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'de'));
  fillSelect('fDisease', allDis);
  // Datum vorbesetzen
  const d = new Date();
  document.getElementById('pDate').value = d.toLocaleDateString('de-DE');
}
function fillSelect(id, values){
  const el = document.getElementById(id);
  if (!el) return;
  for(const v of values){
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    el.appendChild(o);
  }
}

// ---- Filtern
function applyFilters(){
  const {regime, cls, spec, disease, q} = state.filters;
  const ql = (q||'').toLowerCase().trim();

  state.filtered = state.items.filter(x=>{
    if (regime && x.regimen_category !== regime) return false;
    if (cls    && x.class !== cls) return false;
    if (spec   && x.specialty !== spec) return false;
    if (disease&& x.disease !== disease) return false;
    if (ql) {
      const hay = [
        x.name, x.substance, x.class, x.indication
      ].map(s => (s||'').toLowerCase()).join(' ');
      if (!hay.includes(ql)) return false;
    }
    return true;
  });
  renderResults();
  renderPreview();
  document.getElementById('hitCount').textContent = `${state.filtered.length} Treffer`;
}

// ---- Trefferliste
function resCard(x){
  return `
    <label class="block bg-white border rounded-lg p-3 shadow-sm cursor-pointer">
      <div class="flex items-start gap-3">
        <input type="checkbox" class="mt-1" data-id="${esc(x.id)}" ${state.selection.has(x.id)?'checked':''}/>
        <div class="min-w-0">
          <div class="font-semibold">${esc(x.name)}</div>
          <div class="text-sm text-neutral-700">
            <div><span class="font-medium">Klasse:</span> ${esc(x.class||'—')} | <span class="font-medium">Substanz:</span> ${esc(x.substance||'—')}</div>
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
  const box = document.getElementById('results');
  box.innerHTML = state.filtered.map(resCard).join('');
}

// ---- Druckvorschau (Gruppierung nach Klasse)
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
  // Kopf (Titel/Regime/Datum/Arzt) wird im HTML gepflegt → hier nur Liste
  document.getElementById('preview').innerHTML = out.join('') || `<div class="text-sm text-neutral-600">Noch keine Auswahl.</div>`;
}

// ---- Events
function wireUI(){
  const elReg = document.getElementById('fRegime');
  const elCls = document.getElementById('fClass');
  const elSpec= document.getElementById('fSpec');
  const elDis = document.getElementById('fDisease');
  const elQ   = document.getElementById('fQuery');

  elReg.addEventListener('change', ()=>{ state.filters.regime = elReg.value; applyFilters(); });
  elCls.addEventListener('change', ()=>{ state.filters.cls    = elCls.value; applyFilters(); });
  elSpec.addEventListener('change', ()=>{
    state.filters.spec = elSpec.value;
    // Erkrankungen abhängig vom Fachgebiet neu füllen
    refillDisease(elSpec.value);
    applyFilters();
  });
  elDis.addEventListener('change', ()=>{ state.filters.disease= elDis.value; applyFilters(); });
  elQ.addEventListener('input', ()=>{ state.filters.q = elQ.value; applyFilters(); });

  // Checkbox-Klicks (Delegation)
  document.getElementById('col-mid').addEventListener('change', (ev)=>{
    const cb = ev.target.closest('input[type="checkbox"][data-id]');
    if (!cb) return;
    const id = cb.getAttribute('data-id');
    if (cb.checked) state.selection.add(id); else state.selection.delete(id);
    renderPreview();
  });

  // Buttons
  document.getElementById('btnReset').addEventListener('click', ()=>{
    for (const k of Object.keys(state.filters)) state.filters[k]='';
    elReg.value = elCls.value = elSpec.value = elDis.value = '';
    elQ.value = '';
    refillDisease('');
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

  // Sync Preview-Header live (Titel/Regime/Datum/Arzt sind editierbar → nicht weiter verarbeitet)
  ['pTitle','pRegimen','pDate','pPhys'].forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', ()=>{/* no-op; Felder sind Teil der Druckseite */});
  });
}

function refillDisease(spec){
  const elDis = document.getElementById('fDisease');
  // clear
  elDis.innerHTML = `<option value="">Alle</option>`;
  const pool = state.items.filter(x => !spec || x.specialty===spec).map(x=>x.disease).filter(Boolean);
  const uniq = [...new Set(pool)].sort((a,b)=>a.localeCompare(b,'de'));
  for(const v of uniq){
    const o = document.createElement('option'); o.value=v; o.textContent=v; elDis.appendChild(o);
  }
}

// ---- Start
(async function(){
  try{
    await loadData();
    fillOptions();
    wireUI();
    applyFilters(); // initial
  }catch(e){
    console.error(e);
    document.getElementById('meta').textContent = 'Fehler beim Laden.';
  }
})();

