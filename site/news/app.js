async function load(bust=false) {
  // data.json liegt im Site-Root:
  const url = bust ? `/data.json?t=${Date.now()}` : `/data.json`;
  const res = await fetch(url, { cache: 'no-store' });
  const data = await res.json();

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
  const state = { items, q:'', entity:'', type:'', sort:'metric', boostGuidelines:false, category:'' };

  // Controls
  const elCat = document.getElementById('category');
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
    opt.textContent = `${c.label} (${cnt})`;
    if (cnt === 0) opt.disabled = true; // leere Kategorien deaktivieren
    elCat.appendChild(opt);
  }

  // URL-State
  function readStateFromURL() {
    const p = new URLSearchParams(location.search);
    state.q = (p.get('q') || '').toLowerCase();
    state.entity = p.get('ent') || '';
    state.type = p.get('type') || '';
    state.sort = p.get('sort') || 'metric';
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
    elCat.value = findOrDefault(state.category, elCat);
  }
  function writeStateToURL() {
    const p = new URLSearchParams();
    if (state.q) p.set('q', state.q);
    if (state.entity) p.set('ent', state.entity);
    if (state.type) p.set('type', state.type);
    if (state.sort !== 'metric') p.set('sort', state.sort);
    if (state.boostGuidelines) p.set('g', '1');
    if (state.category) p.set('cat', state.category);
    const newUrl = `${location.pathname}?${p.toString()}`;
    history.replaceState(null, '', newUrl);
  }

  // Events
  elCat.addEventListener('change', ()=>{ state.category = elCat.value; writeStateToURL(); render(); });
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

  // Farben
  const colorMap = {
    "Prospective": { border: "border-l-4 border-emerald-500", badge: "bg-emerald-500/10 text-emerald-700 border-emerald-300" },
    "Review":      { border: "border-l-4 border-blue-500",    badge: "bg-blue-500/10 text-blue-700 border-blue-300" },
    "Guideline":   { border: "border-l-4 border-amber-500",   badge: "bg-amber-500/10 text-amber-800 border-amber-300" },
    "Preclinical": { border: "border-l-4 border-purple-500",  badge: "bg-purple-500/10 text-purple-700 border-purple-300" },
    "Other":       { border: "border-l-4 border-neutral-300", badge: "bg-neutral-200 text-neutral-700 border-neutral-300" },
  };

  function sortArr(arr) {
    arr.sort((a,b)=>{
      if (state.boostGuidelines) {
        const ag = a.study_class === 'Guideline' ? 1 : 0;
        const bg = b.study_class === 'Guideline' ? 1 : 0;
        if (ag !== bg) return bg - ag;
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

  function escapeHTML(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }

  function cardHtml(x) {
    const study = x.study_class || 'Other';
    const cm = colorMap[study] || colorMap['Other'];
    const pt = (x.pubtypes||[]).join(', ');
    const m  = (x.metric_value!=null) ? `${x.metric_name}: ${x.metric_value}` : '—';
    const oa = (x.is_oa===true) ? `· OA` : (x.is_oa===false ? `· closed` : '');
    const badge = (txt, cls) => `<span class="px-2 py-0.5 rounded-full text-xs border ${cls}">${txt}</span>`;
    const badges = [
      badge(study, cm.badge),
      x.entity ? badge(x.entity, "bg-neutral-100 text-neutral-700 border-neutral-300") : '',
      x.trial_type ? badge(x.trial_type, "bg-neutral-100 text-neutral-700 border-neutral-300") : '',
      x.category_label ? badge(x.category_label, "bg-neutral-50 text-neutral-600 border-neutral-200") : ''
    ].filter(Boolean).join(' ');

    const doiLine = x.doi ? `<span class="text-xs text-neutral-600">DOI: <a class="underline" href="${x.url_doi}" target="_blank" rel="noopener">${escapeHTML(x.doi)}</a></span>` : '';
    const abstractHtml = x.abstract ? escapeHTML(x.abstract).replace(/\n/g, '<br/>') : '<em class="text-neutral-500">Kein Abstract verfügbar.</em>';
    const isHigh = x.trial_type === 'RCT' || x.trial_type === 'Phase III';
    const strong = isHigh ? ' ring-1 ring-black/5' : '';

    return `
      <article class="bg-white border rounded-xl p-4 shadow-sm ${cm.border}${strong}" data-pmid="${x.pmid}">
        <div class="flex justify-between items-start gap-3 card-toggle cursor-pointer">
          <div>
            <h2 class="font-semibold text-lg leading-snug">${x.title||''}</h2>
            <p class="text-sm text-neutral-600 mt-1">
              <span class="font-medium">${x.journal||''}</span>
              · ${x.pubdate ? new Date(x.pubdate).toLocaleDateString('de-DE') : '—'}
              · ${pt||'—'} ${oa}
            </p>
            <div class="mt-2 flex gap-2 flex-wrap">${badges}</div>
            <div class="mt-2">${doiLine}</div>
          </div>
          <div class="text-sm text-neutral-700 whitespace-nowrap self-start">${m}</div>
        </div>

        <div class="mt-3 flex flex-wrap gap-3 text-sm">
          <a class="underline" href="${x.url_pubmed}" target="_blank" rel="noopener">PubMed</a>
          ${x.url_doi ? `<a class="underline" href="${x.url_doi}" target="_blank" rel="noopener">DOI</a>` : ''}
          ${x.oa_url ? `<a class="underline" href="${x.oa_url}" target="_blank" rel="noopener">OA-Volltext</a>` : ''}
        </div>

        <div class="mt-3 text-sm text-neutral-800 hidden card-abstract">${abstractHtml}</div>
      </article>
    `;
  }

  function sortAndFilter(arr) {
    let out = arr.slice();

    if (state.q) {
      out = out.filter(x =>
        (x.title||'').toLowerCase().includes(state.q) ||
        (x.journal||'').toLowerCase().includes(state.q)
      );
    }
    if (state.category) {
      out = out.filter(x => (x.category_key||'') === state.category);
    }
    if (state.entity) {
      out = out.filter(x => (x.entity||'') === state.entity);
    }
    if (state.type) {
      out = out.filter(x => (x.pubtypes||[]).includes(state.type));
    }
    sortArr(out);
    return out;
  }

  function render() {
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

    document.getElementById('top5list').innerHTML = top5.map(cardHtml).join('');
    document.getElementById('list').innerHTML = rest.map(cardHtml).join('');

    // Expand/Collapse via Delegation
    function attach(containerId) {
      const el = document.getElementById(containerId);
      el.onclick = (ev)=>{
        const anchor = ev.target.closest('a');
        if (anchor) return; // Links normal folgen
        const toggle = ev.target.closest('.card-toggle');
        if (!toggle) return;
        const card = ev.target.closest('article');
        const ab = card.querySelector('.card-abstract');
        if (ab) ab.classList.toggle('hidden');
      };
    }
    attach('top5list');
    attach('list');
  }

  readStateFromURL();
  render();
}

load().catch(() => {
  const gen = document.getElementById('generated');
  if (gen) gen.textContent = 'Fehler beim Laden von data.json';
});
