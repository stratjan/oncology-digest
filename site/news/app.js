@ -3,14 +3,15 @@ async function load(bust=false) {
  const url = bust ? `/data.json?t=${Date.now()}` : `/data.json`;
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();
  // ...
}

  // kompaktes Datum (dd.mm.yyyy hh:mm)
  const dt = new Date(data.generated);
  const dateStr = dt.toLocaleDateString('de-DE');
  const timeStr = dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  document.getElementById('generated').textContent = `Aktualisiert ${dateStr} ${timeStr}`;
  // Header-Zeit (falls du sie im News-Header zeigen willst)
  const genEl = document.getElementById('generated');
  if (genEl) {
    const dt = new Date(data.generated);
    const dateStr = dt.toLocaleDateString('de-DE');
    const timeStr = dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
    genEl.textContent = `Aktualisiert ${dateStr} ${timeStr}`;
  }

  const items = data.items || [];
  const categories = data.categories || [];
@ -18,19 +19,34 @@ async function load(bust=false) {

  // Controls
  const elCat = document.getElementById('category');
  const elQ = document.getElementById('q');
  const elE = document.getElementById('entity');
  const elT = document.getElementById('type');
  const elS = document.getElementById('sort');
  const elR = document.getElementById('refresh');
  const elB = document.getElementById('boostGuidelines');
  const elX = document.getElementById('export');

  // Kategorie-Options befüllen
  const elQ   = document.getElementById('q');
  const elE   = document.getElementById('entity');
  const elT   = document.getElementById('type');
  const elS   = document.getElementById('sort');
  const elR   = document.getElementById('refresh');
  const elB   = document.getElementById('boostGuidelines');
  const elX   = document.getElementById('export');

  // === Kategorien + Counts vorbereiten ===
  function categoryCounts(arr) {
    const m = new Map();
    for (const it of arr) {
      const k = it.category_key || '';
      m.set(k, (m.get(k)||0) + 1);
    }
    return m;
  }
  const countsAll = categoryCounts(items);

  // Optionen befüllen: „Alle Kategorien“ bleibt oben bestehen
  // (Existierende Options außer der ersten entfernen)
  while (elCat.options.length > 1) elCat.remove(1);
  for (const c of categories) {
    const cnt = countsAll.get(c.key) || 0;
    const opt = document.createElement('option');
    opt.value = c.key;
    opt.textContent = c.label;
    opt.textContent = `${c.label} (${cnt})`;
    if (cnt === 0) opt.disabled = true; // leere Kategorien deaktivieren
    elCat.appendChild(opt);
  }

@ -44,13 +60,22 @@ async function load(bust=false) {
    state.boostGuidelines = p.get('g') === '1';
    state.category = p.get('cat') || '';

    // Falls gewählte Kategorie 0 Treffer hat -> zurück auf „Alle“
    if (state.category && (countsAll.get(state.category) || 0) === 0) {
      state.category = '';
    }

    // UI sync
    const findOrDefault = (val, selectEl) => {
      const ok = [...selectEl.options].some(o => o.value === val && !o.disabled);
      return ok ? val : '';
    };
    elQ.value = state.q;
    elE.value = state.entity;
    elT.value = state.type;
    elS.value = state.sort;
    elB.checked = state.boostGuidelines;
    elCat.value = state.category;
    elCat.value = findOrDefault(state.category, elCat);
  }
  function writeStateToURL() {
    const p = new URLSearchParams();
@ -66,15 +91,15 @@ async function load(bust=false) {

  // Events
  elCat.addEventListener('change', ()=>{ state.category = elCat.value; writeStateToURL(); render(); });
  elQ.addEventListener('input', ()=>{ state.q = elQ.value.toLowerCase(); writeStateToURL(); render(); });
  elE.addEventListener('change', ()=>{ state.entity = elE.value; writeStateToURL(); render(); });
  elT.addEventListener('change', ()=>{ state.type = elT.value; writeStateToURL(); render(); });
  elS.addEventListener('change', ()=>{ state.sort = elS.value; writeStateToURL(); render(); });
  elR.addEventListener('click', ()=> load(true));
  elB.addEventListener('change', ()=>{ state.boostGuidelines = elB.checked; writeStateToURL(); render(); });

  // CSV-Export der aktuell gefilterten Liste
  elX.addEventListener('click', ()=> {
  elQ.addEventListener('input',   ()=>{ state.q = elQ.value.toLowerCase(); writeStateToURL(); render(); });
  elE.addEventListener('change',  ()=>{ state.entity = elE.value; writeStateToURL(); render(); });
  elT.addEventListener('change',  ()=>{ state.type = elT.value; writeStateToURL(); render(); });
  elS.addEventListener('change',  ()=>{ state.sort = elS.value; writeStateToURL(); render(); });
  elR.addEventListener('click',   ()=> load(true));
  elB.addEventListener('change',  ()=>{ state.boostGuidelines = elB.checked; writeStateToURL(); render(); });

  // Export CSV der aktuellen Liste
  elX?.addEventListener('click', ()=> {
    const arr = getCurrent();
    const head = ["pmid","doi","title","journal","pubdate","entity","trial_type","study_class","category_label","metric_name","metric_value","url_pubmed","url_doi","oa_url"];
    const rows = [head.join(",")].concat(arr.map(x => head.map(k => {
@ -129,16 +154,14 @@ async function load(bust=false) {
    const oa = (x.is_oa===true) ? `· OA` : (x.is_oa===false ? `· closed` : '');
    const badge = (txt, cls) => `<span class="px-2 py-0.5 rounded-full text-xs border ${cls}">${txt}</span>`;
    const badges = [
      study ? badge(study, cm.badge) : '',
      badge(study, cm.badge),
      x.entity ? badge(x.entity, "bg-neutral-100 text-neutral-700 border-neutral-300") : '',
      x.trial_type ? badge(x.trial_type, "bg-neutral-100 text-neutral-700 border-neutral-300") : '',
      x.category_label ? badge(x.category_label, "bg-neutral-50 text-neutral-600 border-neutral-200") : ''
    ].filter(Boolean).join(' ');

    const doiLine = x.doi ? `<span class="text-xs text-neutral-600">DOI: <a class="underline" href="${x.url_doi}" target="_blank" rel="noopener">${escapeHTML(x.doi)}</a></span>` : '';

    const abstractHtml = x.abstract ? escapeHTML(x.abstract).replace(/\n/g, '<br/>') : '<em class="text-neutral-500">Kein Abstract verfügbar.</em>';

    const isHigh = x.trial_type === 'RCT' || x.trial_type === 'Phase III';
    const strong = isHigh ? ' ring-1 ring-black/5' : '';

@ -169,30 +192,56 @@ async function load(bust=false) {
    `;
  }

  function getCurrent() {
    let arr = state.items.slice();
  function sortAndFilter(arr) {
    let out = arr.slice();

    if (state.q) {
      arr = arr.filter(x =>
      out = out.filter(x =>
        (x.title||'').toLowerCase().includes(state.q) ||
        (x.journal||'').toLowerCase().includes(state.q)
      );
    }
    if (state.category) {
      arr = arr.filter(x => (x.category_key||'') === state.category);
      out = out.filter(x => (x.category_key||'') === state.category);
    }
    if (state.entity) {
      arr = arr.filter(x => (x.entity||'') === state.entity);
      out = out.filter(x => (x.entity||'') === state.entity);
    }
    if (state.type) {
      arr = arr.filter(x => (x.pubtypes||[]).includes(state.type));
      out = out.filter(x => (x.pubtypes||[]).includes(state.type));
    }
    sortArr(arr);
    return arr;
    sortArr(out);
    return out;
  }

  function render() {
    const arr = getCurrent();
    const arr = sortAndFilter(state.items);
    const infoBar = document.getElementById('infobar');
    if (infoBar) infoBar.remove();

    if (arr.length === 0) {
      const bar = document.createElement('div');
      bar.id = 'infobar';
      bar.className = 'mb-4 p-3 border rounded-lg bg-amber-50 text-amber-900 text-sm';
      const active = [
        state.category ? `Kategorie: ${elCat.options[elCat.selectedIndex]?.text || state.category}` : null,
        state.entity ? `Entität: ${state.entity}` : null,
        state.type ? `Typ: ${state.type}` : null,
        state.q ? `Suche: "${state.q}"` : null
      ].filter(Boolean).join(' · ') || 'keine';
      bar.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div>0 Treffer (aktive Filter: ${active})</div>
          <button id="resetFilters" class="border rounded px-2 py-1 text-xs">Filter zurücksetzen</button>
        </div>`;
      document.querySelector('.max-w-6xl .mb-6, header').insertAdjacentElement('afterend', bar);
      bar.querySelector('#resetFilters').onclick = ()=>{
        state.q=''; state.entity=''; state.type=''; state.sort='metric'; state.boostGuidelines=false; state.category='';
        elQ.value=''; elE.value=''; elT.value=''; elS.value='metric'; elB.checked=false; elCat.value='';
        writeStateToURL(); render();
      };
    }

    const top5 = arr.slice(0, 5);
    const topIds = new Set(top5.map(x => x.pmid));
    const rest = arr.filter(x => !topIds.has(x.pmid));
@ -200,7 +249,7 @@ async function load(bust=false) {
    document.getElementById('top5list').innerHTML = top5.map(cardHtml).join('');
    document.getElementById('list').innerHTML = rest.map(cardHtml).join('');

    // Expand/Collapse: Event Delegation
    // Expand/Collapse via Delegation
    function attach(containerId) {
      const el = document.getElementById(containerId);
      el.onclick = (ev)=>{
@ -222,6 +271,6 @@ async function load(bust=false) {
}

load().catch(() => {
  document.getElementById('generated').textContent = 'Fehler beim Laden von data.json';
  const gen = document.getElementById('generated');
  if (gen) gen.textContent = 'Fehler beim Laden von data.json';
});
