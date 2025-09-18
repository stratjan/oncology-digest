// site/news/app.js
async function load(bust=false) {
  const DATA_URL = bust ? `/data.json?t=${Date.now()}` : `/data.json`;
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  const data = await res.json();

  document.getElementById('generated').textContent =
    `Aktualisiert: ${new Date(data.generated).toLocaleString('de-DE')}`;

  const items = data.items || [];

  // ---- "Neu seit letztem Besuch"
  const ls = window.localStorage;
  const seenSet = new Set(JSON.parse(ls.getItem('digestSeenPMIDs') || '[]'));
  const lastSeenGen = ls.getItem('digestLastSeenGenerated');
  const firstVisit = !lastSeenGen;

  // ---- schneller Zugriff
  const byPMID = new Map(items.map(x => [x.pmid, x]));

  // ---- UI-State
  const state = { items, q:'', entity:'', type:'', sort:'date', boostGuidelines:false };

  // ---- DOM Controls
  const elQ = document.getElementById('q');
  const elE = document.getElementById('entity');
  const elT = document.getElementById('type');
  const elS = document.getElementById('sort');
  const elR = document.getElementById('refresh');
  const elB = document.getElementById('boostGuidelines');
  const elX = document.getElementById('export');

  // ---- URL-Zustand
  function readStateFromURL() {
    const p = new URLSearchParams(location.search);
    state.q = (p.get('q') || '').toLowerCase();
    state.entity = p.get('ent') || '';
    state.type = p.get('type') || '';
    state.sort = p.get('sort') || 'date';
    state.boostGuidelines = p.get('g') === '1';
    if (elQ) elQ.value = state.q;
    if (elE) elE.value = state.entity;
    if (elT) elT.value = state.type;
    if (elS) elS.value = state.sort;
    if (elB) elB.checked = state.boostGuidelines;
  }
  function writeStateToURL() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.entity) p.set('ent', state.entity);
    if (state.type) p.set('type', state.type);
    if (state.sort !== 'metric') p.set('sort', state.sort);
    if (state.boostGuidelines) p.set('g', '1');
    history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
  }

  // ---- Sortierung
  function sortArr(arr) {
    arr.sort((a,b)=>{
      if (state.boostGuidelines) {
        const ag = a.study_class === 'Guideline' ? 1 : 0;
        const bg = b.study_class === 'Guideline' ? 1 : 0;
        if (ag !== bg) return bg - ag; // Guidelines nach oben
      }
      if (state.sort === 'metric') {
        const dm = (b.metric_value??-1) - (a.metric_value??-1);
        if (dm !== 0) return dm;
        return new Date(b.pubdate||0) - new Date(a.pubdate||0);
      } else {
        const dd = new Date(b.pubdate||0) - new Date(a.pubdate||0);
        if (dd !== 0) return dd;
        return (b.metric_value??-1) - (a.metric_value??-1);
      }
    });
  }

  // ---- aktuelle Liste
  function getCurrent() {
    let arr = state.items.slice();
    if (state.q) {
      arr = arr.filter(x =>
        (x.title||'').toLowerCase().includes(state.q) ||
        (x.journal||'').toLowerCase().includes(state.q)
      );
    }
    if (state.entity) arr = arr.filter(x => (x.entity||'') === state.entity);
    if (state.type)   arr = arr.filter(x => (x.pubtypes||[]).includes(state.type));
    sortArr(arr);
    return arr;
  }

  // ---- Farben
  const colorMap = {
    "Prospective": { border: "border-l-4 border-emerald-500", badge: "bg-emerald-500/10 text-emerald-700 border-emerald-300" },
    "Review":      { border: "border-l-4 border-blue-500",    badge: "bg-blue-500/10 text-blue-700 border-blue-300" },
    "Guideline":   { border: "border-l-4 border-amber-500",   badge: "bg-amber-500/10 text-amber-800 border-amber-300" },
    "Preclinical": { border: "border-l-4 border-purple-500",  badge: "bg-purple-500/10 text-purple-700 border-purple-300" },
    "Other":       { border: "border-l-4 border-neutral-300", badge: "bg-neutral-200 text-neutral-700 border-neutral-300" },
  };

  // ---- sichere Text-Escapes für Abstract
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function badge(txt, cls) { return `<span class="px-2 py-0.5 rounded-full text-xs border ${cls}">${txt}</span>`; }

  // ---- Karte rendern (mit Abstract-Bereich, initially hidden)
  function cardHtml(x) {
    const study = x.study_class || 'Other';
    const cm = colorMap[study] || colorMap['Other'];
    const pt = (x.pubtypes||[]).join(', ');
    const m  = (x.metric_value!=null) ? `${x.metric_name}: ${x.metric_value}` : '—';
    const oa = (x.is_oa===true) ? `· OA` : (x.is_oa===false ? `· closed` : '');
    const isHigh = x.trial_type === 'RCT' || x.trial_type === 'Phase III';
    const strong = isHigh ? ' ring-1 ring-black/5' : '';
    const badges = [
      badge(study, cm.badge),
      x.entity ? badge(x.entity, "bg-neutral-100 text-neutral-700 border-neutral-300") : '',
      x.trial_type ? badge(x.trial_type, "bg-neutral-100 text-neutral-700 border-neutral-300") : ''
    ].filter(Boolean).join(' ');

    const isNew = !firstVisit && !seenSet.has(x.pmid);
    const star = isNew ? `<div class="absolute top-2 right-2 text-amber-500" title="Neu seit letztem Besuch">★</div>` : '';

    const hasAbs = !!(x.abstract && x.abstract.trim().length);
    const absBlock = hasAbs ? `
<div class="mt-2 hidden" data-abs>
  <div class="whitespace-pre-wrap bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-[1rem] leading-7 text-neutral-800">
    ${esc(x.abstract)}
  </div>
</div>

    ` : '';

    // Klick auf die Karte (außer Links) toggelt Abstract
    return `
      <article class="relative bg-white border rounded-xl p-4 shadow-sm cursor-pointer ${cm.border}${strong}" data-pmid="${x.pmid}">
        ${star}
        <div class="flex justify-between items-start gap-3">
          <div>
            <h2 class="font-semibold text-lg leading-snug">${x.title||''}</h2>
            <p class="text-sm text-neutral-600 mt-1">
              <span class="font-medium">${x.journal||''}</span>
              · ${x.pubdate ? new Date(x.pubdate).toLocaleDateString('de-DE') : '—'}
              · ${pt||'—'} ${oa}
            </p>
            <div class="mt-2 flex gap-2 flex-wrap">${badges}</div>
          </div>
          <div class="text-sm text-neutral-700 whitespace-nowrap">${m}</div>
        </div>
        <div class="mt-3 flex flex-wrap gap-3 text-sm">
          <a class="underline" href="${x.url_pubmed}" target="_blank" rel="noopener">PubMed</a>
          ${x.url_doi ? `<a class="underline" href="${x.url_doi}" target="_blank" rel="noopener">DOI</a>` : ''}
          ${x.oa_url ? `<a class="underline" href="${x.oa_url}" target="_blank" rel="noopener">OA-Volltext</a>` : ''}
        </div>
        ${absBlock}
      </article>
    `;
  }

  function render() {
    const arr = getCurrent();
    const top5 = arr.slice(0, 5);
    const topIds = new Set(top5.map(x => x.pmid));
    const rest = arr.filter(x => !topIds.has(x.pmid));
    const top5list = document.getElementById('top5list');
    const list = document.getElementById('list');
    if (top5list) top5list.innerHTML = top5.map(cardHtml).join('');
    if (list) list.innerHTML = rest.map(cardHtml).join('');
    attachToggle('top5list');
    attachToggle('list');
  }

  // ---- Delegierter Klick-Handler: Karte/„Abstract anzeigen“-Button toggeln
  function attachToggle(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.addEventListener('click', (ev)=>{
      // Links (PubMed/DOI/OA) nicht abfangen
      if (ev.target.closest('a')) return;
      const card = ev.target.closest('article[data-pmid]');
      if (!card) return;

      const abs = card.querySelector('[data-abs]');
      if (!abs) return; // kein Abstract vorhanden

      const btn = card.querySelector('[data-action="toggle-abs"]');
      const visible = !abs.classList.contains('hidden');

      // Toggle Sichtbarkeit
      abs.classList.toggle('hidden');
      if (btn) btn.textContent = visible ? 'Abstract anzeigen' : 'Abstract ausblenden';
    });
  }

  // ---- Event Listener (Filter/Sort/Reload/Export)
  if (elQ) elQ.addEventListener('input', ()=>{ state.q = elQ.value.toLowerCase(); writeStateToURL(); render(); });
  if (elE) elE.addEventListener('change', ()=>{ state.entity = elE.value; writeStateToURL(); render(); });
  if (elT) elT.addEventListener('change', ()=>{ state.type = elT.value; writeStateToURL(); render(); });
  if (elS) elS.addEventListener('change', ()=>{ state.sort = elS.value; writeStateToURL(); render(); });
  if (elB) elB.addEventListener('change', ()=>{ state.boostGuidelines = elB.checked; writeStateToURL(); render(); });
  if (elR) elR.addEventListener('click', ()=> load(true));
  if (elX) elX.addEventListener('click', ()=> {
    const arr = getCurrent();
    const head = ["pmid","doi","title","journal","pubdate","entity","trial_type","study_class","metric_name","metric_value","url_pubmed","url_doi","oa_url"];
    const rows = [head.join(",")].concat(arr.map(x => head.map(k => {
      const v = (x[k] ?? "");
      const s = String(v).replace(/"/g,'""');
      return `"${s}"`;
    }).join(",")));
    const blob = new Blob([rows.join("\n")], {type: "text/csv;charset=utf-8;"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `oncology-digest_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  });

  // ---- Start
  readStateFromURL();
  render();

  // Nach Rendern: alles als "gesehen" markieren (für ⭐ beim nächsten Besuch)
  (function markSeenNow() {
    for (const x of items) { if (x && x.pmid) seenSet.add(x.pmid); }
    ls.setItem('digestSeenPMIDs', JSON.stringify([...seenSet]));
    ls.setItem('digestLastSeenGenerated', data.generated);
  })();
}

// initial
load().catch(() => {
  const g = document.getElementById('generated');
  if (g) g.textContent = 'Fehler beim Laden von data.json';
});// site/news/app.js
async function load(bust=false) {
  const DATA_URL = bust ? `/data.json?t=${Date.now()}` : `/data.json`;
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  const data = await res.json();

  document.getElementById('generated').textContent =
    `Aktualisiert: ${new Date(data.generated).toLocaleString('de-DE')}`;

  const items = data.items || [];

  // ---- "Neu seit letztem Besuch"
  const ls = window.localStorage;
  const seenSet = new Set(JSON.parse(ls.getItem('digestSeenPMIDs') || '[]'));
  const lastSeenGen = ls.getItem('digestLastSeenGenerated');
  const firstVisit = !lastSeenGen;

  // ---- schneller Zugriff
  const byPMID = new Map(items.map(x => [x.pmid, x]));

  // ---- UI-State
  const state = { items, q:'', entity:'', type:'', sort:'metric', boostGuidelines:false };

  // ---- DOM Controls
  const elQ = document.getElementById('q');
  const elE = document.getElementById('entity');
  const elT = document.getElementById('type');
  const elS = document.getElementById('sort');
  const elR = document.getElementById('refresh');
  const elB = document.getElementById('boostGuidelines');
  const elX = document.getElementById('export');

  // ---- URL-Zustand
  function readStateFromURL() {
    const p = new URLSearchParams(location.search);
    state.q = (p.get('q') || '').toLowerCase();
    state.entity = p.get('ent') || '';
    state.type = p.get('type') || '';
    state.sort = p.get('sort') || 'metric';
    state.boostGuidelines = p.get('g') === '1';
    if (elQ) elQ.value = state.q;
    if (elE) elE.value = state.entity;
    if (elT) elT.value = state.type;
    if (elS) elS.value = state.sort;
    if (elB) elB.checked = state.boostGuidelines;
  }
  function writeStateToURL() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.entity) p.set('ent', state.entity);
    if (state.type) p.set('type', state.type);
    if (state.sort !== 'metric') p.set('sort', state.sort);
    if (state.boostGuidelines) p.set('g', '1');
    history.replaceState(null, '', `${location.pathname}?${p.toString()}`);
  }

  // ---- Sortierung
  function sortArr(arr) {
    arr.sort((a,b)=>{
      if (state.boostGuidelines) {
        const ag = a.study_class === 'Guideline' ? 1 : 0;
        const bg = b.study_class === 'Guideline' ? 1 : 0;
        if (ag !== bg) return bg - ag; // Guidelines nach oben
      }
      if (state.sort === 'metric') {
        const dm = (b.metric_value??-1) - (a.metric_value??-1);
        if (dm !== 0) return dm;
        return new Date(b.pubdate||0) - new Date(a.pubdate||0);
      } else {
        const dd = new Date(b.pubdate||0) - new Date(a.pubdate||0);
        if (dd !== 0) return dd;
        return (b.metric_value??-1) - (a.metric_value??-1);
      }
    });
  }

  // ---- aktuelle Liste
  function getCurrent() {
    let arr = state.items.slice();
    if (state.q) {
      arr = arr.filter(x =>
        (x.title||'').toLowerCase().includes(state.q) ||
        (x.journal||'').toLowerCase().includes(state.q)
      );
    }
    if (state.entity) arr = arr.filter(x => (x.entity||'') === state.entity);
    if (state.type)   arr = arr.filter(x => (x.pubtypes||[]).includes(state.type));
    sortArr(arr);
    return arr;
  }

  // ---- Farben
  const colorMap = {
    "Prospective": { border: "border-l-4 border-emerald-500", badge: "bg-emerald-500/10 text-emerald-700 border-emerald-300" },
    "Review":      { border: "border-l-4 border-blue-500",    badge: "bg-blue-500/10 text-blue-700 border-blue-300" },
    "Guideline":   { border: "border-l-4 border-amber-500",   badge: "bg-amber-500/10 text-amber-800 border-amber-300" },
    "Preclinical": { border: "border-l-4 border-purple-500",  badge: "bg-purple-500/10 text-purple-700 border-purple-300" },
    "Other":       { border: "border-l-4 border-neutral-300", badge: "bg-neutral-200 text-neutral-700 border-neutral-300" },
  };

  // ---- sichere Text-Escapes für Abstract
  function esc(s) {
    return String(s ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function badge(txt, cls) { return `<span class="px-2 py-0.5 rounded-full text-xs border ${cls}">${txt}</span>`; }

  // ---- Karte rendern (mit Abstract-Bereich, initially hidden)
  function cardHtml(x) {
    const study = x.study_class || 'Other';
    const cm = colorMap[study] || colorMap['Other'];
    const pt = (x.pubtypes||[]).join(', ');
    const m  = (x.metric_value!=null) ? `${x.metric_name}: ${x.metric_value}` : '—';
    const oa = (x.is_oa===true) ? `· OA` : (x.is_oa===false ? `· closed` : '');
    const isHigh = x.trial_type === 'RCT' || x.trial_type === 'Phase III';
    const strong = isHigh ? ' ring-1 ring-black/5' : '';
    const badges = [
      badge(study, cm.badge),
      x.entity ? badge(x.entity, "bg-neutral-100 text-neutral-700 border-neutral-300") : '',
      x.trial_type ? badge(x.trial_type, "bg-neutral-100 text-neutral-700 border-neutral-300") : ''
    ].filter(Boolean).join(' ');

    const isNew = !firstVisit && !seenSet.has(x.pmid);
    const star = isNew ? `<div class="absolute top-2 right-2 text-amber-500" title="Neu seit letztem Besuch">★</div>` : '';

    const hasAbs = !!(x.abstract && x.abstract.trim().length);
    const absBlock = hasAbs ? `
<div class="mt-2 hidden" data-abs>
  <div class="whitespace-pre-wrap bg-neutral-50 border border-neutral-200 rounded-lg p-3 text-[1rem] leading-7 text-neutral-800">
    ${esc(x.abstract)}
  </div>
</div>

    ` : '';

    // Klick auf die Karte (außer Links) toggelt Abstract
    return `
      <article class="relative bg-white border rounded-xl p-4 shadow-sm cursor-pointer ${cm.border}${strong}" data-pmid="${x.pmid}">
        ${star}
        <div class="flex justify-between items-start gap-3">
          <div>
            <h2 class="font-semibold text-lg leading-snug">${x.title||''}</h2>
            <p class="text-sm text-neutral-600 mt-1">
              <span class="font-medium">${x.journal||''}</span>
              · ${x.pubdate ? new Date(x.pubdate).toLocaleDateString('de-DE') : '—'}
              · ${pt||'—'} ${oa}
            </p>
            <div class="mt-2 flex gap-2 flex-wrap">${badges}</div>
          </div>
          <div class="text-sm text-neutral-700 whitespace-nowrap">${m}</div>
        </div>
        <div class="mt-3 flex flex-wrap gap-3 text-sm">
          <a class="underline" href="${x.url_pubmed}" target="_blank" rel="noopener">PubMed</a>
          ${x.url_doi ? `<a class="underline" href="${x.url_doi}" target="_blank" rel="noopener">DOI</a>` : ''}
          ${x.oa_url ? `<a class="underline" href="${x.oa_url}" target="_blank" rel="noopener">OA-Volltext</a>` : ''}
        </div>
        ${absBlock}
      </article>
    `;
  }

  function render() {
    const arr = getCurrent();
    const top5 = arr.slice(0, 5);
    const topIds = new Set(top5.map(x => x.pmid));
    const rest = arr.filter(x => !topIds.has(x.pmid));
    const top5list = document.getElementById('top5list');
    const list = document.getElementById('list');
    if (top5list) top5list.innerHTML = top5.map(cardHtml).join('');
    if (list) list.innerHTML = rest.map(cardHtml).join('');
  }

  // ---- Event Listener (Filter/Sort/Reload/Export)
  if (elQ) elQ.addEventListener('input', ()=>{ state.q = elQ.value.toLowerCase(); writeStateToURL(); render(); });
  if (elE) elE.addEventListener('change', ()=>{ state.entity = elE.value; writeStateToURL(); render(); });
  if (elT) elT.addEventListener('change', ()=>{ state.type = elT.value; writeStateToURL(); render(); });
  if (elS) elS.addEventListener('change', ()=>{ state.sort = elS.value; writeStateToURL(); render(); });
  if (elB) elB.addEventListener('change', ()=>{ state.boostGuidelines = elB.checked; writeStateToURL(); render(); });
  if (elR) elR.addEventListener('click', ()=> load(true));
  if (elX) elX.addEventListener('click', ()=> {
    const arr = getCurrent();
    const head = ["pmid","doi","title","journal","pubdate","entity","trial_type","study_class","metric_name","metric_value","url_pubmed","url_doi","oa_url"];
    const rows = [head.join(",")].concat(arr.map(x => head.map(k => {
      const v = (x[k] ?? "");
      const s = String(v).replace(/"/g,'""');
      return `"${s}"`;
    }).join(",")));
    const blob = new Blob([rows.join("\n")], {type: "text/csv;charset=utf-8;"});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `oncology-digest_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
  });

  // ---- Start
  readStateFromURL();
  render();

// Globaler Klick-Handler: Karte toggelt Abstract, Links bleiben klickbar
document.addEventListener('click', (ev) => {
  // Links (PubMed/DOI/OA) ignorieren
  if (ev.target.closest('a')) return;

  // Nur reagieren, wenn innerhalb einer Karte geklickt wurde
  const card = ev.target.closest('article[data-pmid]');
  if (!card) return;

  const abs = card.querySelector('[data-abs]');
  if (!abs) return; // kein Abstract vorhanden

  const btn = card.querySelector('[data-action="toggle-abs"]');
  const willShow = abs.classList.contains('hidden');
  abs.classList.toggle('hidden');
  if (btn) btn.textContent = willShow ? 'Abstract ausblenden' : 'Abstract anzeigen';
});
  
  // Nach Rendern: alles als "gesehen" markieren (für ⭐ beim nächsten Besuch)
  (function markSeenNow() {
    for (const x of items) { if (x && x.pmid) seenSet.add(x.pmid); }
    ls.setItem('digestSeenPMIDs', JSON.stringify([...seenSet]));
    ls.setItem('digestLastSeenGenerated', data.generated);
  })();
}

// initial
load().catch(() => {
  const g = document.getElementById('generated');
  if (g) g.textContent = 'Fehler beim Laden von data.json';
});

document.addEventListener('click', (ev) => {
  if (ev.target.closest('a')) return;
  const card = ev.target.closest('article[data-pmid]');
  if (!card) return;
  const abs = card.querySelector('[data-abs]');
  if (!abs) return;
  const btn = card.querySelector('[data-action="toggle-abs"]');
  const willShow = abs.classList.contains('hidden');
  abs.classList.toggle('hidden');
  if (btn) btn.textContent = willShow ? 'Abstract ausblenden' : 'Abstract anzeigen';
});

